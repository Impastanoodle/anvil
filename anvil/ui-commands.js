// ui-commands.js — PropertyManager rendering and the feature commands (sketch, extrude, revolve, patterns, mirror, ...).
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el, V = UI.V;

  // ------------------------------------------------------------------ PropertyManager
  // pm.exprs: { key: '=T*2' } for number fields holding an equation; pm.values[key] then holds its evaluated number so
  // previews and the commands' own arithmetic keep working. pm.exprErrors: { key: message } for ones that fail.
  var pm = { spec: null, values: null, root: $('pm'), exprs: {}, exprErrors: {} };

  // ------------------------------------------------------------------ equations in number fields
  function isExpr(v) { return K.isExpression ? K.isExpression(v) : (typeof v === 'string' && /^\s*=/.test(v)); }
  function equationVars() {
    try { return K.resolveEquations ? K.resolveEquations(App.model).vars : ((App.build && App.build.equations) || {}); } catch (e) { return {}; }
  }
  // The model with its equations evaluated (plane offsets, sheet parameters), for previews that call the kernel directly.
  function previewModel() {
    if (!K.resolvedModel) return App.model;
    try { return K.resolvedModel(App.model).model; } catch (e) { return App.model; }
  }
  // evalFieldExpr('=T*2') -> { value } or { error }
  function evalFieldExpr(text) {
    if (!K.evalExpression) return { error: 'Equations are not available in this build' };
    try { return { value: K.evalExpression(String(text).replace(/^\s*=/, ''), equationVars()) }; } catch (e) { return { error: e.message || String(e) }; }
  }
  function normExpr(text) { return '=' + String(text).replace(/^\s*=\s*/, '').trim(); }
  function numberFieldKeys(spec) {
    var keys = [];
    (spec.groups || []).forEach(function (g) { (g.fields || []).forEach(function (f) { if (f.type === 'number' && f.key) keys.push(f.key); }); });
    return keys;
  }
  // The equation text of a number field, or `fallback` when it holds a plain number (for commands that move a PM value
  // somewhere other than the feature, e.g. the Base Flange thickness into model.sheet).
  function pmExpr(key, fallback) { return pm.exprs && pm.exprs[key] != null ? pm.exprs[key] : fallback; }
  // Put the equation strings back into the feature about to be committed: a key that reached the feature unchanged
  // (same number as the PM value) takes its expression; spec.exprMap renames PM-only keys (radiusValue -> radius).
  function applyExpressions(f) {
    if (!pm.spec || !pm.exprs || !f) return f;
    var map = pm.spec.exprMap || {};
    Object.keys(pm.exprs).forEach(function (k) {
      var tk = map[k] || k;
      if (typeof f[tk] === 'number' && pm.values && f[tk] === +pm.values[k]) f[tk] = pm.exprs[k];
    });
    return f;
  }

  // r10/editpreview10: editNext is the feature count Edit Feature rolls back to, taken by the PropertyManager it opens
  // (pm.editUpto: previews of the feature are built on the part before it; ui-core.js rollbackTo shows that part)
  var editNext = null;
  // rfC: the sketch commands that run in their PropertyManager rather than as a drawing tool get the pencil (or the
  // dimension arrow) with their glyph as the cursor while they are open: the viewport carries data-pmtool = the PM's
  // icon, and style.css has a cursor for each of these
  var PM_TOOL_CURSORS = { parallelLine: 1, tangentLine: 1, perpLine: 1, bisectorLine: 1, tangentCircle: 1, splitEnt: 1, joinEnt: 1, dynMirror: 1,
    intersectCurve: 1, trim: 1, extend: 1, convert: 1, offset: 1, fillet: 1, skFillet: 1, skChamfer: 1, ordinateH: 1, ordinateV: 1, horizDim: 1, vertDim: 1 };
  function markPmTool(spec) {
    var vp = $('viewport'), name = spec && App.mode === 'sketch' && PM_TOOL_CURSORS[spec.icon] ? spec.icon : null;
    if (!vp) return;
    if (name) { if (vp.getAttribute('data-pmtool') !== name) vp.setAttribute('data-pmtool', name); }
    else if (vp.hasAttribute('data-pmtool')) vp.removeAttribute('data-pmtool');
  }
  // lane rfIE: a feature PropertyManager with spec.pmUndo(redo) (-> true when it took a step of its own back, e.g. a
  // selection list's change) gets Ctrl+Z / Ctrl+Y and Edit ▸ Undo / Redo first; with nothing of its own left, undo
  // cancels the command as before (ui-app.js undoCommand). Hooked once, the first time such a PM opens (as
  // drawing-ui-panels.js does for its PMs).
  var pmUndoHooked = false;
  function pmUndoTake(redo) { var s = pm.spec; return !!(s && s.pmUndo && s.pmUndo(redo)); }
  function pmUndoHook() {
    if (pmUndoHooked) return;
    pmUndoHooked = true;
    ['undoCommand', 'redoCommand'].forEach(function (name, i) {
      var base = UI[name];
      if (typeof base !== 'function') return;
      UI[name] = function () { return pmUndoTake(i === 1) ? UI.whenIdle() : base.apply(this, arguments); };
    });
    window.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !/^[zZyY]$/.test(e.key) || !pm.spec || !pm.spec.pmUndo) return;
      var t = e.target, inPM = !!(pm.root && t && pm.root.contains(t));
      if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && (!inPM || pmPending(t))))) return;   // typed text: its own undo
      if (pmUndoTake(/^[yY]$/.test(e.key))) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }
  function openPM(spec) {
    if (spec.pmUndo) pmUndoHook();
    // ✓+ (OKPLUS_COMMANDS): a PropertyManager opened while one of those commands runs offers the blue button; an edit,
    // a Keep Visible PM or one opened on its own (a double-click, a script) does not; a command's next PM keeps it
    if (editNext != null || spec.keepVisible || spec.noOkPlus) pm.again = null;
    else if (pm.invoker) pm.again = pm.invoker;
    else if (!pm.spec) pm.again = null;
    if (editNext != null) { pm.editUpto = editNext; editNext = null; if (UI.rollbackTo) UI.rollbackTo(pm.editUpto); }
    else if (pm.editUpto != null) { pm.editUpto = null; if (UI.rollForward) UI.rollForward(); }   // another command replaced the edit
    pm.spec = spec;
    pm.values = spec.values || {};
    pm.exprs = {}; pm.exprErrors = {};
    // editing a feature whose number fields hold equations: keep the text, evaluate the value for previews
    numberFieldKeys(spec).forEach(function (k) {
      if (!isExpr(pm.values[k])) return;
      var r = evalFieldExpr(pm.values[k]);
      pm.exprs[k] = normExpr(pm.values[k]);
      if (r.error) { pm.exprErrors[k] = r.error; pm.values[k] = 0; } else pm.values[k] = r.value;
    });
    App.command = spec.command || null;
    App.dimsStale = true;   // r4/features4: on-model handles of the new PropertyManager
    markPmTool(spec);
    var fresh = pm.root.hidden;
    pm.collapsed = {};
    if (fresh) pm.root.scrollTop = 0;
    renderPM();
    $('fm-tree').hidden = true;
    pm.root.hidden = false;
    UI.setFmTab('pm');
    UI.updatePlanes();
    if (spec.onChange) spec.onChange(pm.values);
    focusFirstField();
  }
  // SolidWorks puts the cursor in the PropertyManager's first value box with its text selected, so typing a number
  // replaces it and Enter accepts. Only when nothing else holds the keyboard (a sketch dimension box, a dialog).
  function focusFirstField() {
    if (!pm.spec || pm.spec.noFocus) return;
    var a = document.activeElement;
    if (a && a !== document.body && !pm.root.contains(a) && /^(input|textarea|select)$/i.test(a.tagName)) return;
    if (!$('modal').hidden) return;
    var inp = pm.root.querySelector('input.pm-num:not([disabled]), .pm-fields input[type=text]:not([disabled])');
    if (!inp || pm.root.contains(a) && a !== pm.root) return;
    try { inp.focus({ preventScroll: true }); inp.select(); } catch (e) { }
  }
  // Enter anywhere in the PropertyManager goes through pmEnter (below): a value box with a new entry commits it and
  // stays, anything else is ✓. Esc cancels the whole command (escapeCommand: ✗ plus the sketch tool and its boxes). A focused button keeps Enter for itself; equation-field
  // and other handlers that already took the key win.
  pm.root.addEventListener('keydown', function (e) {
    if (!pm.spec || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); escapeCommand(); return; }   // the whole command, not only the PM
    if (e.key === 'Enter' && tag !== 'button' && tag !== 'textarea') { e.preventDefault(); e.stopPropagation(); pmEnter(e.target); }
  });
  // a box that takes the focus starts clean: what is typed from here on is the entry Enter commits (pmEnter)
  pm.root.addEventListener('focusin', function (e) { if (e.target && e.target.tagName === 'INPUT') pmArm(e.target); });
  // rfC: a sketch tool's PropertyManager (spec.noFocus: Insert Line, Rectangle, Circle, Sketch Text …) never takes the
  // keyboard from the graphics area: a click on its buttons, check boxes and option buttons acts without focusing them
  // (typed lengths, L / C / A and Enter keep going to the sketch), and a list closes back to the graphics area. Value
  // boxes still take the focus when clicked, to be typed in.
  pm.root.addEventListener('mousedown', function (e) {
    if (!pm.spec || !pm.spec.noFocus || e.button !== 0) return;
    var t = e.target.closest ? e.target.closest('button, input[type=checkbox], input[type=radio], label, .pm-pick, .pm-group > h4') : null;
    if (t && pm.root.contains(t) && !t.closest('.pm-item')) e.preventDefault();
  }, true);
  pm.root.addEventListener('change', function (e) {
    if (pm.spec && pm.spec.noFocus && e.target.tagName === 'SELECT') { try { e.target.blur(); } catch (er) { } }
  });
  function closePM(keepPreview) {
    if (!pm.spec) return;
    var spec = pm.spec;
    pm.spec = null; pm.values = null; pm.exprs = {}; pm.exprErrors = {};
    App.command = null;
    App.dimsStale = true;   // r4/features4: its on-model handles go with it
    markPmTool(null);
    pm.root.hidden = true;
    pm.root.innerHTML = '';
    $('fm-tree').hidden = false;
    UI.setFmTab('tree');
    if (UI.cancelPreviews) UI.cancelPreviews();   // smooth/responsive: a preview still waiting for the worker is not built
    if (!keepPreview) UI.disposeGroup(UI.groups.preview);
    // r10/editpreview10: ✗ rolls forward at once; ✓ keeps the rolled-back part until the rebuilt one is applied
    if (pm.editUpto != null) { pm.editUpto = null; if (keepPreview) { if (UI.rollbackCommit) UI.rollbackCommit(); } else if (UI.rollForward) UI.rollForward(); }
    UI.updatePlanes();
    // r15/sketchsel15: a sketch command consumes its selection, as in SolidWorks: whatever entities were selected
    // when a PropertyManager opened in a sketch (Mirror, Pattern, Offset, Fillet, Trim, …) are deselected when it
    // closes, by ✓ or ✗, so the next click starts clean (spec.keepSelection opts a PM out)
    if (App.mode === 'sketch' && !spec.keepSelection) {
      var hadSel = (App.sel && App.sel.kind === 'entity') || (UI.selection && UI.selection().some(function (s) { return s.kind === 'entity'; }));
      if (hadSel) { App.sel = null; App.sel2 = null; if (UI.setSelection) UI.setSelection([]); else if (UI.updateSketches) UI.updateSketches(); }
    }
    if (spec.onClose) spec.onClose();
    UI.refreshRibbon();
  }
  // Returns the commit's Promise when the command's onOK returns one (commitFeature does), else UI.whenIdle().
  // opts.close (pmEnter): a command that otherwise keeps its PropertyManager open after ✓ (Mate, the DWG save) closes.
  function pmOK(opts) {
    if (!pm.spec) return UI.whenIdle();
    var spec = pm.spec, r;
    var bad = Object.keys(pm.exprErrors || {});
    if (bad.length) {
      var msg = 'Fix the equation in ' + bad[0] + ': ' + pm.exprErrors[bad[0]];
      UI.setStatus(msg); UI.toast(msg);
      return UI.whenIdle();
    }
    var why = okBlockedWhy();
    if (why) { UI.setStatus(why); UI.toast(why); return UI.whenIdle(); }
    if (spec.onOK) { r = spec.onOK(pm.values); if (r === false) return UI.whenIdle(); }
    if (r && r.keepOpen) {
      if (!(opts && opts.close) || pm.spec !== spec) return r.promise || UI.whenIdle();   // r3/assembly3: the Mate PM stays open for the next mate
      r = r.promise || null;   // lane BP: the second Enter closes the whole command, it does not start another round
    }
    var pending = r && typeof r.then === 'function';
    // smooth/responsive: the preview stays on screen until the committed build is applied (no frame of the old part)
    closePM(pending);
    if (pending) {
      var drop = function () { if (!pm.spec) { UI.disposeGroup(UI.groups.preview); if (UI.rollForward) UI.rollForward(); } };
      r.then(drop, drop);
    }
    return pending ? r : UI.whenIdle();
  }
  // ✓+ (user, 2026-10-27, Mastercam's blue OK-and-new): ✓, then the same command again with an empty PropertyManager
  // for the next one. A refused ✓ (a missing pick, a bad equation) stays; a failed build does not start another.
  function pmOKPlus() {
    var again = pm.again, spec = pm.spec;
    if (!again || !spec) return UI.whenIdle();
    var r = pmOK({ close: true });
    if (pm.spec === spec) return r;
    return Promise.resolve(r).then(function () { if (!pm.spec) runAgainable(again); });
  }
  function runAgainable(fn, self, args) {
    var was = pm.invoker;
    pm.invoker = fn;
    try { return fn.apply(self || UI, args || []); } finally { pm.invoker = was; }
  }
  // the commands that make something, where "OK and start another" applies (sheet metal, features, reference
  // geometry, sketch modify / pattern commands, component patterns); the Transform tab has its own ✓+ (extraActions)
  var OKPLUS_COMMANDS = ['Extrude', 'Revolve', 'Sweep', 'Loft', 'Boundary', 'Fillet', 'Chamfer', 'Shell', 'Hole', 'HoleWizard', 'LinearPattern',
    'CircularPattern', 'Mirror', 'Plane', 'RefAxis', 'RefPoint', 'Csys', 'EquationCurve', 'BaseFlange', 'EdgeFlange', 'MiterFlange',
    'Hem', 'Jog', 'SketchedBend', 'BreakCorner', 'ClosedCorner', 'Unfold', 'Fold', 'OffsetEntities', 'ConvertEntities',
    'MirrorEntities', 'SketchPattern', 'CircularSketchPattern', 'MoveEntities', 'CopyEntities', 'RotateEntities', 'ScaleEntities',
    'StretchEntities', 'SketchFillet', 'SketchChamfer', 'LinearComponentPattern', 'CircularComponentPattern', 'MirrorComponents'];
  OKPLUS_COMMANDS.push('Rib', 'Intersect');   // rfDY
  OKPLUS_COMMANDS.push('Helix', 'ProjectedCurve', 'CompositeCurve', 'CurveXYZ', 'CurveRefPoints');   // rfFA
  OKPLUS_COMMANDS.push('Wrap');   // rfDZ
  // called once at boot (ui-app.js), when every UI.cmd* exists: those commands run through runAgainable, whoever starts
  // them (ribbon, menus, shortcuts, Search Commands)
  function wrapOkPlusCommands() {
    OKPLUS_COMMANDS.forEach(function (n) {
      var f = UI['cmd' + n];
      if (typeof f !== 'function' || f._okPlus) return;
      var w = function () { return runAgainable(f, this, arguments); };
      w._okPlus = true;
      UI['cmd' + n] = w;
    });
  }
  function pmCancel() {
    if (!pm.spec) return;
    var spec = pm.spec;
    if (spec.onCancel) spec.onCancel();
    closePM();
  }
  UI.escapeBoxes = UI.escapeBoxes || [];
  UI.escapeTools = UI.escapeTools || [];
  // Esc, the same in every command (user, 2026-10-14: "Pressing Esc should end any function"): one press cancels the
  // active command completely, whatever has the keyboard (a PropertyManager box or list, the unit request box, the
  // Modify box, the graphics area). In order: UI.escapeBoxes (value boxes and sub-states close without applying: the
  // sketch's on-screen / unit box and Modify box, Instant3D's box, a drawing's inline editor), the sketch tool is put
  // down (the segment being pulled goes, placed ones stay), the PropertyManager is cancelled (✗: onCancel puts back
  // what the command made, onClose takes its preview), then UI.escapeTools (other tools: a drawing's). Each hook
  // returns true when it closed something. Returns true when anything was cancelled. Every Esc handler of a command
  // calls this instead of its own copy; editors that are not commands (a rename, a table cell, a dialog) and open
  // menus keep their own Esc (ui-app.js).
  function escapeCommand() {
    var did = false;
    function run(list) { list.forEach(function (h) { try { if (h()) did = true; } catch (er) { console.error('Esc hook: ' + (er && er.message)); } }); }
    run(UI.escapeBoxes);
    if (App.mode === 'sketch' && App.tool && App.tool !== 'select' && UI.cancelTool) { UI.cancelTool(); did = true; }
    if (pm.spec) { pmCancel(); did = true; }
    run(UI.escapeTools);
    return did;
  }

  // Enter, the same in every command (user, 2026-10-13: "the Enter key completes a unit insertion only; the second
  // hit closes the whole function"). pmEnter(inp, commit) is the one place that decides, for every PropertyManager,
  // sketch tool PM, Transform command, Geometry Nesting and Parallel Line (ui-app.js routes the graphics area's Enter
  // here too): Enter in a value box whose text changed since it took the focus (or since the last Enter) COMMITS the
  // entry and keeps the command open: the box is reformatted, its text selected, the status says "… press Enter again
  // to finish". Enter with nothing pending (the box unchanged, a list, a check box, the graphics area) is ✓ and closes
  // the whole command, also one that otherwise keeps going (✓+, a Mate). `commit(inp)` is the box's own commit (a
  // number box reads shop input and reformats itself, Nesting re-nests); returning false refuses: a bad entry or
  // equation shows its error on the first Enter and stays. Boxes are armed (their clean text noted) when rendered and
  // when they take the focus; a re-render while an entry is pending keeps it pending (renderPM).
  function pmArm(inp) { if (inp && inp.tagName === 'INPUT') { inp._armed = inp.value; inp._codeText = null; } }   // rfCM: a clean box holds no code-set text (ui-app.js undoCancelsPM)
  function pmPending(inp) {
    return !!(inp && inp.tagName === 'INPUT' && /^(text|number|search)$/i.test(inp.type || 'text') && inp._armed != null && inp.value !== inp._armed);
  }
  function pmEnter(inp, commit) {
    if (!pm.spec) return false;
    if (pmPending(inp)) {
      var was = inp._armed, key = inp.getAttribute('data-key');
      inp._armed = inp.value;   // a re-render inside the commit starts the new box clean
      if (commit && commit(inp) === false) { inp._armed = was; return true; }   // refused: the entry stays pending
      if (!commit) {   // a plain text box: the entry was applied as it was typed; say so
        var row = inp.closest ? inp.closest('.pm-row') : null, lab = row && row.querySelector('label');
        pmEntryStatus(lab ? lab.textContent.trim() : '', '"' + inp.value + '"');
      }
      var cur = inp.isConnected ? inp : key ? pm.root.querySelector('input[data-key="' + key + '"]') : null;
      if (cur) {
        pmArm(cur);   // the reformatted text is the clean one now
        try { cur.focus({ preventScroll: true }); cur.select(); } catch (e) { }
      }
      return true;
    }
    pmOK({ close: true });
    return false;
  }
  // the status line of a committed entry: "Depth .500 in — press Enter again to finish."
  function pmEntryStatus(label, text) { UI.setStatus((label ? label + ' ' : '') + text + ' — press Enter again to finish.'); }

  // The ✓ button looks disabled (and pmOK refuses) while a number field holds an equation that does not evaluate, or
  // while the command's spec.okBlocked(values) names something still missing (SolidWorks greys ✓ until the required
  // boxes are filled: Mirror Entities with no Mirror about). The PM calls updateOkState() when its values change.
  function okBlockedWhy() { var s = pm.spec; return s && s.okBlocked ? s.okBlocked(pm.values) || '' : ''; }
  function updateOkState() {
    var ok = pm.root.querySelector('.pm-ok');
    if (!ok) return;
    var bad = Object.keys(pm.exprErrors || {}), why = bad.length ? '' : okBlockedWhy();
    ok.classList.toggle('disabled', bad.length > 0 || !!why);
    ok.setAttribute('aria-disabled', bad.length || why ? 'true' : 'false');
    ok.title = bad.length ? 'OK (Enter) — fix the equation first: ' + pm.exprErrors[bad[0]] : why ? 'OK (Enter) — ' + why : 'OK (Enter)';
  }

  function renderPM() {
    var spec = pm.spec, root = pm.root;
    // a re-render (a pick, a message, a field that reshapes the panel) keeps the scroll position, the groups the user
    // folded and the value box being typed in
    var scroll = root.scrollTop, focus = null, a = document.activeElement;
    if (a && a !== root && root.contains(a) && a.getAttribute('data-key')) {
      focus = { key: a.getAttribute('data-key'), tag: a.tagName, pending: pmPending(a) ? a._armed : null };
      try { focus.s = a.selectionStart; focus.e = a.selectionEnd; } catch (er) { }
    }
    root.innerHTML = '';
    // rfBG: SolidWorks 2024's title row: the command's icon and name, the round Help (?) button at its right (the "?"
    // is drawn by the stylesheet, so the head's text stays the title alone)
    var head = el('div', { class: 'pm-head', html: Icons(spec.icon || 'generic', 24) + '<span>' + spec.title + '</span>' });
    head.appendChild(el('button', { class: 'pm-help', title: 'Help', 'aria-label': 'Help', onclick: function () { var sm = document.getElementById('status-msg'); UI.toast(spec.help || (spec.title + ': ' + (sm && sm.textContent && sm.textContent !== 'Ready' ? sm.textContent : 'fill the boxes below, then ✓ (Enter) to accept or ✗ (Esc) to cancel.'))); } }));
    root.appendChild(head);
    var actions = el('div', { class: 'pm-actions' });
    // Mastercam's order (user, 2026-10-27): the blue ✓+ first, then ✓ and ✗; a command's own ✓+ (Transform) takes its place
    var extra = spec.extraActions || [], ownPlus = extra.filter(function (a) { return a.icon === 'okPlus'; })[0];
    if (ownPlus) actions.appendChild(el('button', { title: ownPlus.title, class: 'pm-okplus', html: Icons('okPlus', 24), onclick: ownPlus.onclick }));
    else if (pm.again) actions.appendChild(el('button', { title: 'OK and start another (✓+): accept, then ' + String(spec.title).replace(/\d+$/, '') + ' again for the next one', class: 'pm-okplus', html: Icons('okPlus', 24), onclick: function () { pmOKPlus(); } }));
    actions.appendChild(el('button', { title: 'OK (Enter)', class: 'pm-ok', html: Icons('ok', 24), onclick: pmOK }));
    actions.appendChild(el('button', { title: 'Cancel (Esc)', class: 'pm-cancel', html: Icons('cancel', 24), onclick: pmCancel }));
    extra.forEach(function (a) { if (a !== ownPlus) actions.appendChild(el('button', { title: a.title, html: Icons(a.icon, 24), onclick: a.onclick })); });
    // rfBG: a PropertyManager that stays open after ✓ (Mate, Insert Component) shows SolidWorks' pressed Keep Visible pin
    if (spec.keepVisible) actions.appendChild(el('button', { class: 'pm-pin on', title: 'Keep Visible: this PropertyManager stays open after ✓ for the next one; ✗ (Esc) closes it', 'aria-pressed': 'true', html: Icons('fix', 16) }));
    root.appendChild(actions);
    // rfC: the Message box (SolidWorks' yellow Message group; its title is drawn by the stylesheet, so the text read
    // from .pm-msg is the message alone)
    // rfGY: spec.messageKind 'warn' | 'error' tints the box (the default is the yellow information Message)
    var msgBox = spec.message ? el('div', { class: 'pm-msg' + (spec.messageOk ? ' ok' : '') + (spec.messageKind ? ' ' + spec.messageKind : ''), role: 'status', html: spec.message }) : null;
    if (msgBox) root.appendChild(msgBox);
    (spec.groups || []).forEach(function (g) {
      if (g.show && !g.show(pm.values)) return;   // a group may hide itself, like a field
      var folded = pm.collapsed && pm.collapsed[g.title] != null ? pm.collapsed[g.title] : !!g.collapsed;
      // rfGY: an optional group (g.optional, or a group whose first field is a check box named as the group: Custom
      // Bend Allowance …) shows that check box in its title band, as SolidWorks' Direction 2 / Draft / Custom Relief Type
      var f0 = g.fields && g.fields[0], opt = !!(f0 && f0.type === 'check' && !(f0.show && !f0.show(pm.values)) && (g.optional || String(f0.label).toLowerCase() === String(g.title).toLowerCase()));
      // rfC: a group titled Message (Insert Line …) gets the yellow Message look; the collapse arrow is SolidWorks'
      // round chevron at the right of the blue header band (drawn by the stylesheet: the header's text is its title)
      var box = el('div', { class: 'pm-group' + (folded ? ' collapsed' : '') + (g.title === 'Message' ? ' pm-group-msg' : '') + (opt ? ' pm-optional' : '') + (g.tabs ? ' pm-tabgroup' : '') });
      var h = el('h4', { html: '<span class="pm-gt"></span><span class="tw" aria-hidden="true"></span>' });
      h.firstChild.textContent = g.title;
      h.setAttribute('aria-expanded', folded ? 'false' : 'true');
      h.addEventListener('click', function () {
        var c = box.classList.toggle('collapsed');
        if (pm.collapsed) pm.collapsed[g.title] = c;
        h.setAttribute('aria-expanded', c ? 'false' : 'true');
      });
      box.appendChild(h);
      if (opt) {
        // the check box keeps its own label (tests and Tab find it by "Enable direction 2"), read by screen readers only;
        // it sits over the band, outside the h4, so the h4's text stays the group's title. Ticking it opens the group.
        var row0 = renderField(f0), cb0 = row0.querySelector('input');
        var hc = el('label', { class: 'pm-hcheck', title: f0.label }, [cb0, el('span', { class: 'pm-sr', text: f0.label })]);
        hc.addEventListener('click', function (e) { e.stopPropagation(); });
        cb0.addEventListener('change', function () { if (cb0.checked) { box.classList.remove('collapsed'); h.setAttribute('aria-expanded', 'true'); if (pm.collapsed) pm.collapsed[g.title] = false; } }, true);
        box.appendChild(hc);
      }
      var fields = el('div', { class: 'pm-fields' });
      g.fields.forEach(function (f) {
        if (f.show && !f.show(pm.values)) return;
        if (opt && f === f0) return;
        var row = renderField(f);
        // rfGY: a plain "Reverse direction" check becomes SolidWorks' Reverse Direction button left of the group's first
        // value box (the last list above it: End condition, Direction; else the first number: Angle, Length); it stays
        // the same check box with its own label
        if (f.type === 'check' && f.label === 'Reverse direction') {
          var lists = fields.querySelectorAll(':scope > .pm-row-select:not(.pm-has-rev)');
          var host = lists[lists.length - 1] || fields.querySelector(':scope > .pm-row-num:not(.pm-has-rev)');
          if (host) {
            row.classList.add('pm-rev');
            row.querySelector('input').title = f.label;
            host.classList.add('pm-has-rev');
            host.appendChild(row);   // last in the row, so pmField('End condition') still finds the list; the grid draws it left
            return;
          }
        }
        fields.appendChild(row);
      });
      box.appendChild(fields);
      // rfGY: tabs (Hole Wizard Type / Positions) sit under ✓ ✗, above the Message, as in SolidWorks
      if (g.tabs) root.insertBefore(box, msgBox || null); else root.appendChild(box);
    });
    if (spec.okBlocked) updateOkState();
    if (scroll && root.scrollTop !== scroll) root.scrollTop = scroll;
    // lane BP: every box starts clean (pmEnter); the box being typed in keeps its pending entry across the re-render
    Array.prototype.forEach.call(root.querySelectorAll('input'), function (i) { if (i._armed == null) pmArm(i); });
    if (focus) {
      var again = root.querySelector(focus.tag.toLowerCase() + '[data-key="' + focus.key + '"]');
      if (again) {
        try { again.focus({ preventScroll: true }); if (focus.s != null) again.setSelectionRange(focus.s, focus.e); } catch (er) { }
        if (focus.pending != null) again._armed = focus.pending;
      }
    }
  }

  function renderField(f) {
    var v = pm.values;
    function changed(val) {
      v[f.key] = val;
      App.dimsStale = true;   // r4/features4: the on-model handles and callouts follow the value
      if (f.rerender) renderPM();
      if (pm.spec.onChange) pm.spec.onChange(v, f.key);
    }
    switch (f.type) {
      case 'number': {
        // A plain number is an <input type=number> (spin arrows, arrow keys). Typing "=" turns the box into a text
        // box holding an equation ('=T*2', variables from Tools ▸ Equations); the value it evaluates to is shown in
        // the .pm-expr-hint beside it (red with the message when it fails, and OK is refused until it is fixed).
        var key = f.key, exprText = pm.exprs[key];
        var inp = el('input', { type: exprText != null ? 'text' : 'number', step: f.step || 'any', class: 'pm-num' + (exprText != null ? ' expr' : ''), 'data-key': key });
        inp.value = exprText != null ? exprText : (v[key] == null ? '' : v[key]);
        if (f.min != null) inp.min = f.min;
        // rfIU: f.disabled (bool or fn(v)) greys a locked value box that still shows its value (a gauge's thickness)
        if (typeof f.disabled === 'function' ? f.disabled(v) : f.disabled) { inp.disabled = true; inp.classList.add('locked'); }
        var hint = el('span', { class: 'pm-expr-hint', 'data-key': key });
        var showHint = function () {
          var ex = pm.exprs[key], er = pm.exprErrors[key];
          inp.classList.toggle('expr', ex != null);
          inp.classList.toggle('expr-err', !!er);
          hint.hidden = ex == null;
          hint.classList.toggle('err', !!er);
          hint.textContent = ex == null ? '' : er ? er : '= ' + UI.fmtNum(v[key], 4);
          hint.title = ex == null ? '' : er ? 'Equation error: ' + er : ex + ' evaluates to ' + v[key];
          updateOkState();
        };
        var setExpr = function (text) {
          pm.exprs[key] = normExpr(text);
          var r = evalFieldExpr(text);
          if (r.error) { pm.exprErrors[key] = r.error; showHint(); return; }
          delete pm.exprErrors[key];
          v[key] = r.value;
          showHint();
          changed(r.value);
        };
        var clearExpr = function () {
          if (pm.exprs[key] == null) return;
          delete pm.exprs[key]; delete pm.exprErrors[key];
          showHint();
        };
        // p9-sketch: shop input. A fraction, mixed number, unit or sum ("3/8", "1-1/2", "25mm", "2*3/8"; UI.parseLength,
        // converted to the document's units) cannot live in a number box: its first such character turns the box into a
        // text box. The value it reads is applied as it is typed and shown in the hint ("= 0.375"); a bad entry shows
        // the reason there, Enter is refused, and leaving the box puts the old value back.
        var kind = f.unit === 'u' ? 'length' : /^(°|deg)$/.test(f.unit || '') ? 'angle' : 'number';
        var shopRead = function (s) { return UI.parseLength ? UI.parseLength(s, { kind: kind }) : (isNaN(parseFloat(s)) ? { error: 'Not a number: ' + s } : { value: parseFloat(s) }); };
        var shopHint = function (r) {
          hint.hidden = !r;
          hint.classList.toggle('err', !!(r && r.error != null));
          inp.classList.toggle('expr-err', !!(r && r.error != null));
          hint.textContent = !r ? '' : r.error != null ? r.error : '= ' + UI.fmtNum(r.value, 4);
          hint.title = !r ? '' : r.error != null ? 'Not a value: ' + r.error : inp.value + ' reads ' + r.value + (kind === 'length' ? ' ' + UI.unitLabel() : '');
        };
        var shopText = function () { return inp.type === 'text' && pm.exprs[key] == null; };
        inp.addEventListener('input', function () {
          var s = inp.value;
          if (isExpr(s)) { if (inp.type !== 'text') { inp.type = 'text'; } setExpr(s); return; }
          clearExpr();
          if (inp.type === 'text') {
            var r = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(s) ? null : shopRead(s);
            shopHint(r);
            if (!r) { var n0 = parseFloat(s); if (!isNaN(n0)) changed(n0); }
            else if (r.error == null) changed(r.value);
            return;
          }
          var n = parseFloat(s); if (!isNaN(n)) changed(n);
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            // lane BP: a new entry is committed and the box stays (shop input reads and reformats, 3/8 -> 0.375; an
            // equation keeps its text); a bad entry shows its error and stays; the next Enter is ✓ (pmEnter)
            e.preventDefault();
            pmEnter(inp, function () {
              if (shopText()) {
                var re = shopRead(inp.value);
                if (re.error != null) { shopHint(re); UI.setStatus('Not a value: ' + re.error); return false; }
                var val = +re.value.toPrecision(12);
                inp.type = 'number'; inp.value = val; shopHint(null);
                if (val !== v[key]) changed(val);
              } else if (pm.exprs[key] != null) {
                if (pm.exprErrors[key]) { var em = 'Fix the equation in ' + key + ': ' + pm.exprErrors[key]; UI.setStatus(em); UI.toast(em); return false; }
              } else {
                var n = parseFloat(inp.value);
                if (isNaN(n)) { UI.setStatus('Type a value for ' + (f.label || key) + '.'); return false; }
                if (n !== v[key]) changed(n);
              }
              var shown = f.unit === 'u' ? UI.fmtDim(v[key]) + ' ' + UI.unitLabel() : UI.fmtNum(v[key], 4) + (f.unit ? (f.unit === 'deg' ? '°' : f.unit) : '');
              pmEntryStatus(f.label || '', shown);
            });
            return;
          }
          // r4/features4: arrow keys spin by the field's increment (Shift ×10), the same for every PropertyManager
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && pm.exprs[key] == null) { e.preventDefault(); spinField(f, inp, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1, changed); return; }
          // a number box cannot hold "=": switch to a text box and start the equation
          if (e.key === '=' && inp.type === 'number') {
            e.preventDefault();
            inp.type = 'text'; inp.value = '=';
            inp._codeText = '=';   // rfCM: text set by code is not in the browser's undo history (ui-app.js undoCancelsPM)
            try { inp.setSelectionRange(1, 1); } catch (er) { }
            setExpr('=');
            return;
          }
          if (inp.type === 'number' && e.key.length === 1 && !/[0-9.]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            // the box's text replaced by the key when it is all selected (as after focus), else the key appended
            var old = inp.validity && inp.validity.badInput ? '' : inp.value, sel = window.getSelection ? String(window.getSelection()) : '';
            var t = (sel && sel === old ? '' : old) + e.key;
            inp.type = 'text'; inp.value = t;
            inp._codeText = t;   // rfCM
            try { inp.setSelectionRange(t.length, t.length); } catch (er) { }
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
          // no spin increments on an equation
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') && pm.exprs[key] != null) e.preventDefault();
        });
        inp.addEventListener('wheel', function (e) {
          if (pm.exprs[key] != null) { e.preventDefault(); return; }
          // r4/features4: the wheel spins a focused value box (as in SolidWorks); an unfocused one leaves the wheel to the panel
          if (document.activeElement !== inp || !e.deltaY) return;
          e.preventDefault();
          spinField(f, inp, e.deltaY < 0 ? 1 : -1, e.shiftKey ? 10 : 1, changed);
        }, { passive: false });
        // leaving a text box that no longer holds an equation turns it back into a number box
        inp.addEventListener('focus', function () { inp._before = v[key]; });
        inp.addEventListener('blur', function () {
          if (!shopText()) return;
          var rb = shopRead(inp.value);
          // p9-sketch: back to a number box showing the value read (3/8 -> 0.375), or after a bad entry the value the
          // box had when it took the focus (a "3" typed on the way to "3//8" is not kept)
          var back = rb.error == null ? +rb.value.toPrecision(12) : inp._before != null ? inp._before : v[key];
          inp.type = 'number'; inp.value = back == null ? '' : back;
          shopHint(null);
          if (rb.error != null && back != null && back !== v[key]) changed(back);
          if (rb.error != null && UI.setStatus) UI.setStatus('Value not changed: ' + rb.error);
        });
        showHint();
        // rfC: SolidWorks' value box: the number, its unit inside the box at a fixed place, and spin arrows at its right
        // edge (press and hold to repeat; Shift ×10). The arrows never take the focus, so a sketch tool's PropertyManager
        // leaves the keyboard with the graphics area; Tab goes from box to box.
        var spin = el('span', { class: 'pm-spin', 'aria-hidden': 'true' }), held = null;
        function stopSpin() { if (held) { clearTimeout(held.t); clearInterval(held.i); held = null; } }
        [['up', 1], ['down', -1]].forEach(function (d) {
          var sb = el('button', { type: 'button', class: 'pm-spin-' + d[0], tabindex: '-1', html: '<svg width="8" height="5" viewBox="0 0 8 5"><path d="' + (d[1] > 0 ? 'M0.5 4.5 L4 1 L7.5 4.5' : 'M0.5 0.5 L4 4 L7.5 0.5') + '" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>' });
          sb.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            if (pm.exprs[key] != null || inp.disabled) return;   // no spin increments on an equation
            var go = function () { spinField(f, inp, d[1], e.shiftKey ? 10 : 1, changed); };
            stopSpin(); go();
            held = { t: setTimeout(function () { if (held) held.i = setInterval(go, 70); }, 380) };
          });
          ['mouseup', 'mouseleave'].forEach(function (t) { sb.addEventListener(t, stopSpin); });
          spin.appendChild(sb);
        });
        var unitText = f.unit === 'u' ? UI.unitLabel() : (f.unit || '');
        var wrap = el('span', { class: 'pm-num-wrap' + (unitText ? '' : ' no-unit') }, [inp, el('span', { class: 'unit', text: unitText }), spin]);
        // a click on the unit or the box's padding puts the caret in the number, as in a single box
        wrap.addEventListener('mousedown', function (e) { if (e.target === wrap || e.target.classList.contains('unit')) { e.preventDefault(); try { inp.focus(); inp.select(); } catch (er) { } } });
        return el('div', { class: 'pm-row pm-row-num pm-field' }, [el('label', { text: f.label }), wrap, hint]);
      }
      case 'select': {
        var sel = el('select', { 'data-key': f.key });
        var opts = typeof f.options === 'function' ? f.options(v) : f.options;
        opts.forEach(function (o) {
          var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
          var op = el('option', { value: String(val), text: lab });
          if (String(v[f.key]) === String(val)) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener('change', function () {
          var raw = sel.value, match = opts.filter(function (o) { return String(Array.isArray(o) ? o[0] : o) === raw; })[0];
          changed(Array.isArray(match) ? match[0] : match);
        });
        // rfIF: f.icon draws the list's label as a 16 px icon (SolidWorks' Tolerance/Precision rows); f.label is then
        // its tooltip and the list's accessible name
        if (f.icon) {
          sel.setAttribute('aria-label', f.label); sel.title = f.label;
          var ico = el('label', { class: 'pm-ico-label', title: f.label, 'aria-label': f.label, html: Icons(f.icon, 16) });
          ico.addEventListener('mousedown', function (e) { e.preventDefault(); try { sel.focus(); } catch (er) { } });
          return el('div', { class: 'pm-row pm-field pm-row-select pm-row-ico', 'data-icon': f.icon }, [ico, sel]);
        }
        return el('div', { class: 'pm-row pm-field pm-row-select' }, [el('label', { text: f.label }), sel]);
      }
      case 'check': {
        // f.disabled (bool or fn(v)): a greyed box that keeps its state (DXF/DWG Output's "Geometry", always on)
        var cb = el('input', { type: 'checkbox', 'data-key': f.key || '' });
        cb.checked = !!v[f.key];
        var cbOff = typeof f.disabled === 'function' ? f.disabled(v) : !!f.disabled;
        if (cbOff) cb.disabled = true;
        cb.addEventListener('change', function () { changed(cb.checked); });
        return el('div', { class: 'pm-row check pm-field' + (cbOff ? ' disabled' : '') }, [cb, el('label', { text: f.label, onclick: function () { if (!cbOff) cb.click(); } })]);
      }
      case 'radio': {   // r13/trim13: a column of option buttons, as in SolidWorks' PropertyManagers (Trim Entities' Options)
        // f.disabledOption(value, v) -> a reason string greys that option and shows the reason under it (DXF/DWG Output)
        var rbox = el('div', { class: 'pm-radio' });
        f.options.forEach(function (o) {
          var rb = el('input', { type: 'radio', name: 'pm-' + f.key, value: String(o[0]), 'data-key': f.key + ':' + o[0] });
          rb.checked = String(v[f.key]) === String(o[0]);
          var why = f.disabledOption ? f.disabledOption(o[0], v) : null;
          if (why) rb.disabled = true;
          rb.addEventListener('change', function () { if (rb.checked) changed(o[0]); });
          rbox.appendChild(el('div', { class: 'pm-row check' + (why ? ' disabled' : '') }, [rb, el('label', { text: o[1], onclick: function () { if (!why) rb.click(); } })]));
          if (why) rbox.appendChild(el('div', { class: 'pm-note', text: why }));
        });
        return rbox;
      }
      case 'iconRadio': {   // p9-pm: a row of icon buttons, one pressed, as SolidWorks' Flange Length reference and Hem Type
        // f.options: [[value, name, icon]]; the name is the tooltip and is shown under the label for the pressed one
        var ibox = el('div', { class: 'pm-btns pm-icons', role: 'radiogroup', 'aria-label': f.label }), curName = '';
        f.options.forEach(function (o) {
          var on = String(v[f.key]) === String(o[0]);
          if (on) curName = o[1];
          var ib = el('button', { type: 'button', title: o[1], 'aria-label': o[1], role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-key': f.key + ':' + o[0], html: Icons(o[2] || 'generic', 16) });
          if (on) ib.classList.add('on');
          ib.addEventListener('click', function () { if (String(v[f.key]) === String(o[0])) return; changed(o[0]); if (!f.rerender && pm.spec) renderPM(); });
          ibox.appendChild(ib);
        });
        return el('div', { class: 'pm-row pm-field pm-row-icons' }, [el('label', {}, [document.createTextNode(f.label), el('div', { class: 'static', text: curName })]), ibox]);
      }
      case 'text': {
        var t = el('input', { type: 'text', value: v[f.key] || '', 'data-key': f.key || '' });
        t.addEventListener('input', function () { changed(t.value); });
        return el('div', { class: 'pm-row pm-field pm-row-text' }, [el('label', { text: f.label }), t]);
      }
      case 'static':
        return el('div', { class: 'pm-row pm-field pm-row-static' }, [el('label', { text: f.label }), el('span', { class: 'static', text: typeof f.value === 'function' ? f.value(v) : f.value })]);
      case 'pick': {
        var txt = typeof f.value === 'function' ? f.value(v) : f.value;
        var pickBox = el('div', { class: 'pm-pick' + (txt ? ' filled' : '') + (f.active && f.active(v) ? ' active' : ''), html: Icons(f.icon || 'plane', 16) + '<span>' + (txt || f.placeholder || 'Select…') + '</span>' });
        // a PM with two selection boxes (Mirror Entities): clicking a box makes it the one graphics-area picks go to
        if (f.onActivate) { pickBox.classList.add('clickable'); pickBox.addEventListener('click', function () { f.onActivate(v); }); }
        return f.items ? pickList(f, pickBox) : pickBox;
      }
      case 'buttons': {
        // rfGY: f.tabs draws the row as SolidWorks' PropertyManager tabs (Hole Wizard Type / Positions)
        var row = el('div', { class: 'pm-btns' + (f.tabs ? ' pm-tabs' : ''), role: f.tabs ? 'tablist' : 'group' });
        f.buttons.forEach(function (b) {
          var bt = el('button', { text: b.label, onclick: function () { if (!bt.disabled) b.onclick(v); } });
          if (b.title) bt.title = typeof b.title === 'function' ? b.title(v) : b.title;   // lane rfIE: a tooltip, and a button that waits for a pick
          if (b.disabled && b.disabled(v)) { bt.disabled = true; bt.setAttribute('aria-disabled', 'true'); }
          if (b.active) { var on = !!b.active(v); bt.classList.toggle('on', on); bt.setAttribute('aria-pressed', on ? 'true' : 'false'); }   // r14/fixes14: a tab-like pair (Hole Wizard Type / Positions)
          row.appendChild(bt);
        });
        return row;
      }
      case 'html':
        return el('div', { html: typeof f.html === 'function' ? f.html(v) : f.html });
    }
    return el('div');
  }

  // ------------------------------------------------------------------ live previews (smooth/responsive)
  // A PropertyManager preview is built in the rebuild worker (UI.previewInWorker), so typing or spinning a value never
  // blocks input. The preview on screen is replaced only when the new one is ready (no empty frame in between); an
  // answer older than the one shown, or for a PropertyManager that has closed, is dropped; while one preview builds,
  // only the newest request waits behind it. Without the worker, o.sync() previews on the main thread as before.
  // o: { op: 'tool' | 'shell' | 'edge' | 'flange' | 'jog', feature, upto (feature count to build on, null: the whole part), throughLimit,
  //      mats: [material per returned solid], sync: fn(), done: fn(result), fail: fn(message) }
  var lp = { seq: 0, shown: 0, last: null };
  function addPreviewMesh(tool, mat) {
    var mesh = K.meshFromBody(tool), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(UI.analyticNormals(mesh), 3));
    UI.groups.preview.add(new THREE.Mesh(g, mat));
  }
  function livePreview(o) {
    var my = ++lp.seq, spec = pm.spec;
    var upto = o.upto != null ? o.upto : pm.editUpto;   // r10/editpreview10: editing, on the part before the feature
    var p = UI.previewInWorker && !App.previewSync ? UI.previewInWorker({ op: o.op, feature: JSON.parse(JSON.stringify(o.feature)), upto: upto, throughLimit: o.throughLimit }) : null;
    if (!p) { lp.shown = my; o.sync(); return; }
    p.then(function (r) {
      if (r && r.superseded) return;
      if (pm.spec !== spec || my < lp.shown) return;
      if (!r) { lp.shown = my; o.sync(); return; }   // the worker went away: preview on the main thread
      lp.shown = my; lp.last = { ms: r.ms, at: performance.now() };
      UI.disposeGroup(UI.groups.preview);
      r.tools.forEach(function (t, i) { if (t && t.polygons.length) addPreviewMesh(t, o.mats[i] || o.mats[0]); });
      if (o.done) o.done(r);
    }, function (e) {
      if (pm.spec !== spec || my < lp.shown) return;
      lp.shown = my;
      UI.disposeGroup(UI.groups.preview);
      var msg = (e && e.message) || String(e);
      if (o.fail) o.fail(msg); else UI.setStatus('Preview: ' + msg);
    });
  }
  // resolves once the newest live preview has been shown (tests)
  function previewIdle() {
    return new Promise(function (res) {
      var t0 = performance.now();
      (function poll() { if (lp.shown >= lp.seq || !pm.spec || performance.now() - t0 > 10000) res(lp.last); else setTimeout(poll, 10); })();
    });
  }

  // ------------------------------------------------------------------ preview
  // r9/polish9: a Through All preview stops just past the part (SolidWorks), not 1.5 diagonals beyond it: the depth
  // is the farthest model corner from the sketch plane along its normal, plus a small margin.
  function previewThroughLimit(feature) {
    var b = UI.modelBounds();
    var diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    var fallback = Math.max(20, diag * 1.5);
    try {
      if (!feature || feature.type !== 'extrude' || !App.build || !App.build.body) return fallback;
      var sk = (App.model.features || []).filter(function (x) { return x.id === feature.sketch; })[0];
      if (!sk || sk.type !== 'sketch') return fallback;
      var pl = K.resolvePlane(sk.plane, App.model, App.build.planes || {});
      var far = 0;
      for (var i = 0; i < 8; i++) {
        var c = [(i & 1 ? b.max : b.min)[0], (i & 2 ? b.max : b.min)[1], (i & 4 ? b.max : b.min)[2]];
        far = Math.max(far, Math.abs((c[0] - pl.origin[0]) * pl.n[0] + (c[1] - pl.origin[1]) * pl.n[1] + (c[2] - pl.origin[2]) * pl.n[2]));
      }
      return far > 1e-6 ? far + Math.max(1, diag * 0.02) : fallback;
    } catch (e) { return fallback; }
  }
  UI.previewThroughLimit = previewThroughLimit;
  function showPreview(feature) {
    if (!feature || !App.build) { UI.disposeGroup(UI.groups.preview); return null; }
    var mat = UI.mats.preview, err = null;
    try { if (K.isCut(feature, App.model) || feature.cut) mat = UI.mats.previewCut; } catch (e) { }
    livePreview({ op: 'tool', feature: feature, upto: null, throughLimit: previewThroughLimit(feature), mats: [mat], sync: function () { err = showPreviewSync(feature); } });
    return err;
  }
  function showPreviewSync(feature) {
    UI.disposeGroup(UI.groups.preview);
    try {
      var ctx = { tools: App.build.tools, planes: App.build.planes, sketches: {}, body: App.build.body, throughLimit: previewThroughLimit(feature) };
      var tool = K.buildTool(feature, previewModel(), ctx);
      if (!tool) return null;
      var mesh = K.meshFromBody(tool);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(UI.analyticNormals(mesh), 3));
      UI.groups.preview.add(new THREE.Mesh(g, K.isCut(feature, App.model) || feature.cut ? UI.mats.previewCut : UI.mats.preview));
      return null;
    } catch (e) {
      return e.message;
    }
  }

  // ------------------------------------------------------------------ r4/features4: spin boxes, selection lists, on-model handles
  // Spin increment of a number field: f.spin, else its integer step, else 1° for angles, 1 mm / 0.1 in for lengths.
  function spinStep(f) {
    if (f.spin) return f.spin;
    if (f.step && f.step !== 'any') return +f.step;
    if (f.unit === 'u') return UI.unitLabel() === 'in' ? 0.1 : 1;
    return 1;
  }
  function spinField(f, inp, dir, mult, changed) {
    var cur = inp.type === 'text' ? NaN : parseFloat(inp.value), step = spinStep(f) * (mult || 1);   // p9-sketch: "3/8" is no parseFloat
    if (isNaN(cur)) cur = +pm.values[f.key] || 0;
    var val = +(cur + dir * step).toPrecision(12);
    if (f.min != null && val < f.min) val = +f.min;
    if (f.max != null && val > f.max) val = +f.max;
    inp.value = val;
    // rfCM: a spin is not typing and its value is applied here, so the box is clean after it: Enter is ✓ and Ctrl+Z
    // cancels the command (it was left pending, and the browser had nothing to undo for a value set by code, so Ctrl+Z
    // did nothing); armed before changed(), which may re-render the box
    pmArm(inp);
    changed(val);
  }

  // A selection box with a list (f.items(v) -> [{ label, edges?: [edge], faces?: [face index], at?: [x, y, z] }]):
  // hovering a row highlights its item in the graphics area; Delete / Backspace on a row, or right-click ▸ Delete,
  // removes it (f.onRemove(v, i)); right-click ▸ Clear Selections removes them all (f.onClear(v)).
  function setHoverItem(it) {
    if (!App.command) return;
    App.command.hoverItem = it || null;
    UI.updateHighlights();
    App.dimsStale = true;
    if (UI.requestRender) UI.requestRender();
  }
  // rfC: the icon of a listed selection, from its SolidWorks-style name (Line3, Arc1, Edge<2>, Face<1> …), so a box that
  // mixes kinds shows each one's own; an item may name its icon itself (it.icon)
  var PICK_ICONS = [[/^(Poly|Center)?[Ll]ine(\d|<|\s|$)/, 'line'], [/^Circle/, 'circle'], [/^Arc/, 'arc'], [/^Rectangle/, 'rect'], [/^Polygon/, 'polygon'],
    [/^Slot/, 'slot'], [/^(Point|Sketch ?Point)/, 'point'], [/^Spline/, 'spline'], [/^(Partial )?Ellipse/, 'ellipse'], [/^Text/, 'text'],
    [/^Edge/, 'edgeSel'], [/^Face/, 'faceSel'], [/^Vertex/, 'vertexSel'], [/^(Plane|.* Plane$)/, 'planeSmall']];
  function pickIcon(it, f) {
    if (it.icon) return it.icon;
    var s = String(it.label || '');
    for (var i = 0; i < PICK_ICONS.length; i++) if (PICK_ICONS[i][0].test(s)) return PICK_ICONS[i][1];
    return f.icon || 'plane';
  }
  function pickList(f, pickBox) {
    var v = pm.values, items = f.items(v) || [];
    var wrap = el('div', { class: 'pm-pickwrap' }, [pickBox]);
    if (!items.length) return wrap;
    wrap.classList.add('has-list');   // rfC: the box and its list read as one SolidWorks selection box
    var list = el('div', { class: 'pm-list', role: 'listbox', 'aria-label': f.placeholder || 'Selections' });
    function remove(i) { setHoverItem(null); if (f.onRemove) f.onRemove(v, i); var rows = pm.root.querySelectorAll('.pm-list .pm-item'); var r = rows[Math.min(i, rows.length - 1)]; if (r) try { r.focus({ preventScroll: true }); } catch (e) { } }
    items.forEach(function (it, i) {
      var row = el('div', { class: 'pm-item', role: 'option', tabindex: '-1', 'data-index': String(i), title: it.label + ' (Delete or right-click to remove)', html: Icons(pickIcon(it, f), 14) + '<span></span>' });
      row.lastChild.textContent = it.label;
      row.addEventListener('mouseenter', function () { setHoverItem(it); });
      row.addEventListener('mouseleave', function () { if (App.command && App.command.hoverItem === it) setHoverItem(null); });
      row.addEventListener('focus', function () { row.classList.add('sel'); setHoverItem(it); });
      row.addEventListener('blur', function () { row.classList.remove('sel'); if (App.command && App.command.hoverItem === it) setHoverItem(null); });
      row.addEventListener('mousedown', function (e) { if (e.button === 0) { e.preventDefault(); try { row.focus({ preventScroll: true }); } catch (er) { } } });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); remove(i); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); var n = row[e.key === 'ArrowDown' ? 'nextSibling' : 'previousSibling']; if (n) n.focus(); }
      });
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault(); e.stopPropagation();
        var menu = [{ label: 'Delete', action: function () { remove(i); } }];
        if (f.onClear) menu.push({ label: 'Clear Selections', action: function () { setHoverItem(null); f.onClear(v); } });
        if (UI.showMenu) UI.showMenu(e.clientX, e.clientY, menu); else remove(i);
      });
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  // A value set from the graphics area (a handle drag): the field shows it, an equation in it is dropped, and the
  // command previews as if it had been typed.
  function pmSetValue(key, val) {
    if (!pm.spec) return false;
    pm.values[key] = val;
    if (pm.exprs[key] != null) { delete pm.exprs[key]; delete pm.exprErrors[key]; updateOkState(); }
    var inp = pm.root.querySelector('input.pm-num[data-key="' + key + '"]');
    if (inp) {
      if (inp.type !== 'number') { inp.type = 'number'; inp.classList.remove('expr', 'expr-err'); var hint = pm.root.querySelector('.pm-expr-hint[data-key="' + key + '"]'); if (hint) { hint.hidden = true; hint.textContent = ''; } }
      inp.value = val;
    }
    App.dimsStale = true;
    if (pm.spec.onChange) pm.spec.onChange(pm.values, key);
    return true;
  }
  // A check box flipped from the graphics area (a reverse-direction arrow).
  function pmToggle(key) {
    if (!pm.spec) return false;
    pm.values[key] = !pm.values[key];
    var cb = pm.root.querySelector('input[type=checkbox][data-key="' + key + '"]');
    if (cb) cb.checked = !!pm.values[key];
    App.dimsStale = true;
    if (pm.spec.onChange) pm.spec.onChange(pm.values, key);
    return true;
  }
  function pmFocusField(key) {
    var inp = pm.root.querySelector('input[data-key="' + key + '"]');
    if (!inp) return false;
    try { inp.focus({ preventScroll: false }); inp.select(); } catch (e) { }
    return true;
  }
  // The open PropertyManager's on-model handles: [{ key, label, O, dir, k, value, flip, min, max } (linear) |
  // { type: 'angle', key, label, A, D, c, sign, value, max, flip } | { type: 'flip', key, O, dir } |
  // { type: 'callout', at, text, key }] in world coordinates; ui-select.js draws and drags them. A field holding an
  // equation has no drag handle (the equation drives it).
  function pmHandles() {
    if (!pm.spec || !pm.spec.handles || !App.build || !App.mesh) return [];
    var out = [], sig = '';
    // the overlay redraws with every camera move: the world-space handles are reused until the values or the part change
    try { sig = JSON.stringify(pm.values) + '|' + JSON.stringify(pm.exprs); } catch (e) { sig = String(Math.random()); }
    var c = pmHandles.cache;
    if (c && c.spec === pm.spec && c.sig === sig && c.build === App.build && c.mesh === App.mesh) return c.out.slice();
    try { out = pm.spec.handles(pm.values) || []; } catch (e) { out = []; }
    out = out.filter(function (h) {
      if (h.type === 'callout' || h.type === 'flip') return true;
      if (pm.exprs[h.key] != null) { if (h.flip && h.O) { h.type = 'flip'; h.key = h.flip; return true; } return false; }
      return isFinite(h.value);
    });
    pmHandles.cache = { spec: pm.spec, sig: sig, build: App.build, mesh: App.mesh, out: out };
    return out.slice();
  }
  var AXV = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  function sketchPlaneOf(sk) { try { return K.resolvePlane(sk.plane, App.model, App.build && App.build.planes); } catch (e) { return null; } }
  // centre of a sketch's closed profile (its loops' bounding box) on the sketch plane
  function profileCentre(sk, pl) {
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    try { K.sketchProfile(sk).loops.forEach(function (l) { l.pts.forEach(function (p) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }); }); } catch (e) { return null; }
    if (!(hi[0] >= lo[0])) return null;
    return { uv: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], p: K.to3D(pl, (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2) };
  }
  function extrudeHandles(v) {
    var sk = K.findFeature(App.model, typeof v.sketch === 'string' ? +v.sketch : v.sketch), pl = sk && sketchPlaneOf(sk), c = pl && profileCentre(sk, pl);
    if (!c) return [];
    var n = pl.n, out = [], s = v.reverse ? -1 : 1, mid = v.end === 'mid';
    if (v.end === 'through') out.push({ type: 'flip', key: 'reverse', O: c.p, dir: V.scale(n, s) });
    else out.push({ key: 'depth', label: 'Depth D1', O: c.p, dir: V.scale(n, mid ? 1 : s), k: mid ? 2 : 1, value: +v.depth, flip: mid ? null : 'reverse', min: 0 });
    if (v.dir2 && !mid && v.end2 !== 'through') out.push({ key: 'depth2', label: 'Depth D2', O: c.p, dir: V.scale(n, -s), k: 1, value: +v.depth2, min: 0 });
    return out;
  }
  function revolveHandles(v) {
    var sk = K.findFeature(App.model, typeof v.sketch === 'string' ? +v.sketch : v.sketch), pl = sk && sketchPlaneOf(sk), c = pl && profileCentre(sk, pl);
    if (!c) return [];
    var ax = typeof v.axis === 'string' && /^\d+$/.test(v.axis) ? +v.axis : v.axis, p, d;
    var rr = refAxisRec(v);   // lane CZ: about a reference axis
    if (rr) return [{ type: 'angle', key: 'angle', label: 'Angle', A: rr.o, D: rr.d, c: c.p, sign: v.reverse ? -1 : 1, value: +v.angle, max: 360, flip: 'reverse' }];
    if (ax === 'x') { p = [0, 0]; d = [1, 0]; }
    else if (typeof ax === 'number') { var e = sk.entities[ax]; if (!e || e.t !== 'line') return []; p = [e.x1, e.y1]; d = [e.x2 - e.x1, e.y2 - e.y1]; }
    else if (ax && typeof ax === 'object' && ax.x1 != null) { p = [ax.x1, ax.y1]; d = [ax.x2 - ax.x1, ax.y2 - ax.y1]; }
    else { p = [0, 0]; d = [0, 1]; }
    var A = K.to3D(pl, p[0], p[1]), D = V.norm(V.sub(K.to3D(pl, p[0] + d[0], p[1] + d[1]), A));
    if (!(V.len(D) > 0.5)) return [];
    return [{ type: 'angle', key: 'angle', label: 'Angle', A: A, D: D, c: c.p, sign: v.reverse ? -1 : 1, value: +v.angle, max: 360, flip: 'reverse' }];
  }
  // Where an edge pick sits on the model and the direction into its first face (the fillet / chamfer boundary lies
  // r / d along it on a square edge): the resolved edge when there is one, else the two planar faces through the
  // pick point (editing: the part on screen already has the fillet).
  function edgeFrame(at, edgeList) {
    var best = null, bd = Infinity;
    (edgeList || []).forEach(function (e) {
      if (!e.ins || !e.ins[0]) return;
      var d = K.pointSegmentDistance ? K.pointSegmentDistance(at, e.a, e.b) : V.len(V.sub(e.mid, at));
      if (d < bd) { bd = d; best = e; }
    });
    // of the two faces' directions, the one seen most side-on (the longest arrow on screen, and stable while dragging)
    function pickDir(ds) {
      var vd = UI.cam && UI.cam.dir ? V.norm(UI.cam.dir) : [0, 0, 1], b = null, bs = Infinity;
      ds.forEach(function (d) { if (!d) return; var s = Math.abs(V.dot(d, vd)) - (b ? 1e-6 : 0); if (s < bs) { bs = s; b = d; } });
      return b;
    }
    if (best && bd < 1e-3 * Math.max(1, V.len(at))) return { O: at, dir: pickDir(best.ins) };
    var ns = [];
    (App.mesh.faces || []).forEach(function (fc) {
      if (!fc.normal || !fc.centroid || Math.abs(V.dot(V.sub(at, fc.centroid), fc.normal)) > 1e-4 * Math.max(1, V.len(at))) return;
      if (!ns.some(function (n) { return V.dot(n, fc.normal) > 0.9999; })) ns.push(fc.normal);
    });
    var n1 = null, n2 = null, bs = 0.05;
    for (var i = 0; i < ns.length; i++) for (var j = i + 1; j < ns.length; j++) { var s = V.len(V.cross(ns[i], ns[j])); if (s > bs) { bs = s; n1 = ns[i]; n2 = ns[j]; } }
    if (!n1) return best ? { O: at, dir: pickDir(best.ins) } : null;
    var t = V.norm(V.cross(n1, n2)), d1 = V.norm(V.cross(t, n1)), d2 = V.norm(V.cross(t, n2));
    if (V.dot(d1, n2) > 0) d1 = V.scale(d1, -1);
    if (V.dot(d2, n1) > 0) d2 = V.scale(d2, -1);
    return { O: at, dir: pickDir([d1, d2]) };
  }
  // A face pick's outward normal on the part shown (a removed face's rim keeps its plane), or the largest planar face.
  function faceFrame(at) {
    var faces = App.mesh.faces || [], best = null, bestA = -1;
    faces.forEach(function (fc) {
      if (!fc.normal || !fc.centroid) return;
      if (at) { if (Math.abs(V.dot(V.sub(at, fc.centroid), fc.normal)) > 1e-4 * Math.max(1, V.len(at))) return; var dd = V.len(V.sub(fc.centroid, at)); if (!best || dd < bestA) { best = fc; bestA = dd; } }
      else if (fc.area > bestA) { bestA = fc.area; best = fc; }
    });
    return best ? { O: at || best.centroid, n: best.normal } : null;
  }
  function toolCentre(fid) {
    var t = App.build && App.build.tools && App.build.tools[fid], b = t && t.getBounds && t.getBounds();
    if (!b) return null;
    var lo = b.min.x != null ? [b.min.x, b.min.y, b.min.z] : b.min, hi = b.max.x != null ? [b.max.x, b.max.y, b.max.z] : b.max;
    return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  }
  function lpatternHandles(v) {
    var c = toolCentre(typeof v.feature === 'string' ? +v.feature : v.feature);
    if (!c) return [];
    var out = [];
    if (AXV[v.d1]) out.push({ key: 's1', label: 'Spacing', O: c, dir: V.scale(AXV[v.d1], v.rev1 ? -1 : 1), k: 1, value: +v.s1, flip: 'rev1', min: 0 });
    if (AXV[v.d2]) out.push({ key: 's2', label: 'Spacing 2', O: c, dir: V.scale(AXV[v.d2], v.rev2 ? -1 : 1), k: 1, value: +v.s2, flip: 'rev2', min: 0 });
    return out;
  }
  function cpatternHandles(v) {
    var c = toolCentre(typeof v.feature === 'string' ? +v.feature : v.feature);
    var rr = c ? refAxisRec(v) : null;   // lane CZ: about a reference axis
    if (rr) return [{ type: 'angle', key: 'angle', label: 'Angle', A: rr.o, D: rr.d, c: c, sign: 1, value: +v.angle, max: 360 }];
    if (!c || !AXV[v.axis]) return [];
    return [{ type: 'angle', key: 'angle', label: 'Angle', A: [+v.cx || 0, +v.cy || 0, +v.cz || 0], D: AXV[v.axis], c: c, sign: 1, value: +v.angle, max: 360 }];
  }
  // a plane's offset from a standard plane, along its normal from the origin (either side)
  function offsetHandles(ref, offset, label) {
    var pl;
    try { pl = K.makePlane(ref, 0); } catch (e) { return []; }
    if (!pl || !pl.n) return [];
    return [{ key: 'offset', label: label, O: pl.origin || [0, 0, 0], dir: pl.n, k: 1, value: +offset, min: -Infinity }];
  }

  // ------------------------------------------------------------------ helpers
  function unconsumedSketches() {
    return App.model.features.filter(function (f) { return f.type === 'sketch' && !UI.isConsumed(f.id); });
  }
  function solidFeatures() {
    return App.model.features.filter(function (f) { return f.type !== 'sketch' && f.type !== 'plane' && f.type !== 'refaxis' && f.type !== 'refpoint' && f.type !== 'csys'; });   // lane CZ: reference geometry is no solid
  }
  function selectedSketchId() {
    if (App.sel && App.sel.kind === 'feature') {
      var f = K.findFeature(App.model, App.sel.id);
      if (f && f.type === 'sketch') return f.id;
    }
    return null;
  }
  function selectedSolidId() {
    if (App.sel && App.sel.kind === 'feature') {
      var f = K.findFeature(App.model, App.sel.id);
      if (f && f.type !== 'sketch' && f.type !== 'plane' && f.type !== 'refaxis' && f.type !== 'refpoint' && f.type !== 'csys') return f.id;
    }
    if (App.sel && App.sel.kind === 'face' && App.mesh) {
      var id = App.triShared[App.mesh.faces[App.sel.index].start];
      if (id >= 0) return id;
    }
    return null;
  }
  function commitFeature(f, existing) {
    // lane DC2: a feature made while the part is flat goes in above Flat-Pattern1 (the end of the feature list) and
    // acts on the folded part, as in SolidWorks; the flat is redrawn from the rebuilt part
    applyExpressions(f);   // number fields typed as '=T*2' are stored as the equation, not its value
    UI.pushUndo();
    if (existing) {
      Object.keys(f).forEach(function (k) { existing[k] = f[k]; });
      Object.keys(existing).forEach(function (k) { if (!(k in f) && k !== 'id' && k !== 'name' && k !== 'profile') delete existing[k]; });
      f = existing;
    } else {
      f.id = App.model.nextId++;
      f.name = f.name || K.featureName(App.model, f.type, f.cut);
      App.model.features.push(f);
    }
    // resolves to the feature once the build is applied (immediately in sync mode)
    return UI.afterRebuild(UI.rebuild(), function () {
      App.sel = { kind: 'feature', id: f.id };
      UI.updateHighlights(); UI.updateSketches(); UI.refreshTree();
      var err = App.build.errors[f.id], ow = App.build.warnings && App.build.warnings[f.id];
      ow = ow && /over defined/.test(ow) ? ' Warning: ' + ow + ' Edit the sketch: make the extra dimension driven or delete it.' : '';   // rfAC
      UI.setStatus(err ? f.name + ' failed: ' + err : f.name + (existing ? ' updated' : ' created') + '. Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms.' + ow);
      return f;
    });
  }

  // ------------------------------------------------------------------ solid bodies (multi-body parts)
  // The kernel keeps every separate solid in App.build.bodies (creation order) and describes them with
  // Kernel.bodyInfo. Older builds only carry the combined App.build.body: treat that as one body.
  var bodyInfoCache = { build: null, infos: null };
  function bodyList() {
    var b = App.build;
    if (!b) return [];
    if (b.bodies && b.bodies.length) return b.bodies;
    return b.body ? [b.body] : [];
  }
  function bodyInfos() {
    var build = App.build, list = bodyList();
    if (!build || !list.length) return [];
    if (bodyInfoCache.build === build && bodyInfoCache.infos) return bodyInfoCache.infos;
    var infos = null;
    if (build.assembly && UI.bodyInfo) {
      // assembly: one body per component, named after it (Pin<1>); featureId stays null (bodyFeatures are component ids)
      infos = UI.bodyInfo().map(function (b, i) {
        var vol = b.volume;
        if (vol == null) { try { vol = K.massProps(K.meshFromBody(list[i])).volume; } catch (e) { vol = 0; } }
        return { index: i, featureId: null, name: b.name, volume: vol };
      });
    }
    if (!infos && typeof K.bodyInfo === 'function' && build.bodies) { try { infos = K.bodyInfo(build, App.model); } catch (e) { infos = null; } }
    if (!infos) {
      infos = list.map(function (body, i) {
        var vol = 0;
        try { vol = K.massProps(list.length === 1 && App.mesh && App.mesh.triCount ? App.mesh : K.meshFromBody(body), App.model.density).volume; } catch (e) { vol = 0; }
        return { index: i, featureId: build.bodyFeatures ? build.bodyFeatures[i] : null, name: 'Body' + (i + 1), volume: vol };
      });
    }
    infos = infos.map(function (b, i) { return { index: b.index != null ? b.index : i, featureId: b.featureId != null ? b.featureId : null, name: b.name || 'Body' + (i + 1), volume: +b.volume || 0 }; });
    bodyInfoCache.build = build; bodyInfoCache.infos = infos;
    return infos;
  }
  function bodyTitle(b) { return b.name + ': volume ' + UI.fmtNum(b.volume, 2) + ' ' + UI.unitLabel() + '³'; }
  // Select a body (the sketch lane's UI.selectBody highlights it in the graphics area when present).
  function selectBody(i) {
    if (typeof UI.selectBody === 'function') { UI.selectBody(i); return; }
    App.sel = { kind: 'body', index: i }; App.sel2 = null;
    UI.updateHighlights(); UI.refreshTree();
  }

  // Multi-body fields shared by the boss/cut PropertyManagers, in SolidWorks placement: "Merge result" at the end of
  // Direction 1 on a boss, a "Feature Scope" group on a cut when the part has two or more bodies.
  // PM value keys: merge (boolean), scope ('all' | 'selected'), body0, body1, ... (one check per body).
  // Feature JSON: merge:false on a boss that stays a separate body; bodies:[indices] on a cut limited to some bodies.
  function initBodyFields(f, existing) {
    var picked = existing && Array.isArray(existing.bodies) ? existing.bodies : null;
    f.merge = existing ? existing.merge !== false : true;
    f.scope = picked ? 'selected' : 'all';
    bodyInfos().forEach(function (b) { f['body' + b.index] = !!(picked && picked.indexOf(b.index) >= 0); });
    return f;
  }
  function mergeField(isBoss) {
    return { type: 'check', label: 'Merge result', key: 'merge', show: function (v) { return isBoss(v); } };
  }
  function scopeGroup(isCut) {
    var infos = bodyInfos();
    var fields = [{ type: 'select', label: 'Bodies', key: 'scope', options: [['all', 'All bodies'], ['selected', 'Selected bodies']], rerender: true }];
    infos.forEach(function (b) { fields.push({ type: 'check', label: b.name, key: 'body' + b.index, show: function (v) { return v.scope === 'selected'; } }); });
    return { title: 'Feature Scope', show: function (v) { return infos.length >= 2 && isCut(v); }, fields: fields };
  }
  // Strip the PM-only keys from the feature about to be committed and write merge / bodies from them.
  function applyBodyFields(out, v, cut) {
    // read the PM values before the keys are stripped (out and v are the same object in the onOK handlers)
    var merge = v.merge, scope = v.scope;
    var ids = bodyInfos().filter(function (b) { return !!v['body' + b.index]; }).map(function (b) { return b.index; });
    delete out.merge; delete out.scope; delete out.bodies;
    Object.keys(out).forEach(function (k) { if (/^body\d+$/.test(k)) delete out[k]; });
    if (!cut && merge === false) out.merge = false;
    if (cut && scope === 'selected' && ids.length) out.bodies = ids;   // nothing checked = all bodies
    return out;
  }
  function featureIsCut(v) { try { return K.isCut(v, App.model); } catch (e) { return false; } }
  function featureIsBoss(v) { return !featureIsCut(v); }

  // If a sketch is open, close it first and run the command with that sketch.
  function withSketch(cb) {
    if (App.mode === 'sketch') {
      var id = App.activeSketch;
      App.pendingAfterSketch = function () { cb(id); };
      UI.exitSketch(true);
      return;
    }
    cb(selectedSketchId());
  }

  // ------------------------------------------------------------------ sketch command
  function cmdSketch() {
    if (isAsm()) { refusePart('Sketch'); return; }
    if (App.mode === 'sketch') { UI.exitSketch(); return; }
    if (App.sel && App.sel.kind === 'face') { newSketchOnFace(App.sel); return; }
    if (App.sel && App.sel.kind === 'plane') { newSketchOnPlane(App.sel.ref); return; }
    openPM({
      title: 'Sketch', icon: 'sketch',
      message: 'Select a <b>plane</b> or a <b>planar face</b> to sketch on. The standard planes are shown in the graphics area.',
      command: { pickPlane: true, onPick: function (pk) { if (pk.kind === 'plane') newSketchOnPlane(pk.ref); else newSketchOnFace(pk); return true; } },
      groups: [{ title: 'Standard planes', fields: [{ type: 'buttons', buttons: ['Front', 'Top', 'Right'].map(function (r) { return { label: r + ' Plane', onclick: function () { newSketchOnPlane(r); } }; }) }] }]
    });
  }
  function newSketchOnPlane(ref) {
    if (isAsm()) { refusePart('Sketch'); return Promise.resolve(null); }
    closePM();
    UI.pushUndo();
    var plane = typeof ref === 'number' ? { featureId: ref } : { ref: ref, offset: 0 };
    var f = { id: App.model.nextId++, type: 'sketch', plane: plane, entities: [] };
    f.name = K.featureName(App.model, 'sketch');
    App.model.features.push(f);
    App.sketchSnapshot = JSON.stringify({ entities: [] });
    App.newSketchId = f.id;
    // an empty sketch on a standard plane changes no geometry: the sketch opens at once, so a tool picked right after
    // Sketch (Line, Corner Rectangle …) is not lost while an OpenCascade rebuild is still running
    if (typeof ref === 'string') { UI.enterSketch(f.id); return UI.afterRebuild(UI.rebuild(), function () { }); }
    return UI.afterRebuild(UI.rebuild(), function () { UI.enterSketch(f.id); });
  }
  // r10/facesketch10: the sketch frame on a picked model face, with a reference to the feature that made the face
  // (Kernel.faceRef) so the sketch follows the face at rebuild, as in SolidWorks
  function facePlane(face, point) {
    var plane = K.planeFromFace(face.normal, isFinite(face.w) ? K.vec.scale(face.normal, face.w) : point);
    if (K.tidyPlane) K.tidyPlane(plane);   // no float noise in the stored frame (9.999999999999998 -> 10)
    var fid = App.triShared && face.start != null ? App.triShared[face.start] : (face.polys && face.polys[0] ? face.polys[0].shared : null);
    var fr = K.faceRef ? K.faceRef(App.model, fid, plane, App.build && App.build.planes) : null;
    if (fr) plane.face = fr;
    return plane;
  }
  UI.facePlane = facePlane;
  function newSketchOnFace(pk) {
    if (isAsm()) { refusePart('Sketch'); return Promise.resolve(null); }
    var face = App.mesh.faces[pk.index];
    if (!face) return;
    closePM();
    UI.pushUndo();
    var plane = facePlane(face, pk.point || face.centroid);
    var f = { id: App.model.nextId++, type: 'sketch', plane: plane, entities: [] };
    f.name = K.featureName(App.model, 'sketch');
    // remember the face outline (same frame as the sketch plane) for Convert / Offset Entities
    try { var fo = K.faceOutline(App.mesh, pk.index); if (fo) f.faceLoops = fo.loops; } catch (e) { }
    App.model.features.push(f);
    App.sketchSnapshot = JSON.stringify({ entities: [] });
    App.newSketchId = f.id;
    return UI.afterRebuild(UI.rebuild(), function () { UI.enterSketch(f.id); });
  }

  // r11/faceref11: Edit Sketch Plane (SolidWorks: right-click a sketch ▸ Edit Sketch Plane). The part rolls back to
  // just before the sketch, so only planes and faces made before it can be picked; ✓ moves the sketch (its 2D
  // geometry kept) onto the picked plane or face, with a face reference that follows the face, as one undo step. It
  // also reattaches a Dangling sketch.
  function sketchPlaneText(plane) {
    if (!plane) return 'Front Plane';
    if (plane.custom) {
      var src = plane.face ? K.findFeature(App.model, plane.face.feature) : null;
      return plane.face ? 'Face of ' + (src ? src.name : 'a deleted feature') : 'Face (fixed position)';
    }
    if (plane.featureId != null) { var pf = K.findFeature(App.model, plane.featureId); return pf ? pf.name : 'Plane' + plane.featureId; }
    return (plane.ref || 'Front') + ' Plane' + (plane.offset ? ' + ' + plane.offset : '');
  }
  function editSketchPlane(id) {
    if (isAsm()) { refusePart('Edit Sketch Plane'); return; }
    var f = K.findFeature(App.model, id);
    if (!f || f.type !== 'sketch') return;
    if (App.mode === 'sketch') { UI.toast('Exit the sketch first, then Edit Sketch Plane.'); return; }
    var idx = App.model.features.indexOf(f), chosen = null, spec = null;
    function before(fid) { var g = K.findFeature(App.model, fid); return !!g && App.model.features.indexOf(g) < idx; }
    function refuse(msg) { UI.setStatus(msg); UI.toast(msg); return true; }
    function onPick(pk) {
      if (pk.kind === 'plane') {
        if (typeof pk.ref === 'number' && !before(pk.ref)) return refuse('That plane comes after ' + f.name + ': pick a plane or face made before it.');
        chosen = { plane: typeof pk.ref === 'number' ? { featureId: pk.ref } : { ref: pk.ref, offset: 0 }, text: typeof pk.ref === 'number' ? sketchPlaneText({ featureId: pk.ref }) : pk.ref + ' Plane', face: null };
        App.sel = { kind: 'plane', ref: pk.ref };
      } else if (pk.kind === 'face' && App.mesh && App.mesh.faces[pk.index]) {
        var face = App.mesh.faces[pk.index];
        if (face.polys && face.polys[0] && face.polys[0].surf) return refuse('Pick a planar face (or a plane) for the sketch.');
        var plane = facePlane(face, pk.point || face.centroid);
        if (plane.face && !before(plane.face.feature)) return refuse('That face belongs to ' + K.findFeature(App.model, plane.face.feature).name + ', which comes after ' + f.name + ': pick a face made before it.');
        var loops = null;
        try { var fo = K.faceOutline(App.mesh, pk.index); if (fo) loops = fo.loops; } catch (e) { }
        chosen = { plane: plane, text: sketchPlaneText(plane), face: pk.index, loops: loops };
        App.sel = null;
      } else return true;
      if (spec && spec.command) spec.command.faceList = chosen.face != null ? [chosen.face] : [];
      UI.updateHighlights(); UI.updatePlanes(); renderPM();
      return true;
    }
    if (pm.spec) pmCancel();
    editNext = idx;   // the part before the sketch, as Edit Sketch shows it
    var warn = App.build && App.build.warnings && App.build.warnings[f.id];
    spec = {
      title: 'Sketch Plane', icon: 'sketch', values: {}, noFocus: true,
      message: 'Select a plane or a planar face for <b>' + String(f.name).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</b>. Its sketch geometry keeps its coordinates on the new plane.' +
        (warn && /Dangling/.test(warn) ? '<br><b>Dangling:</b> the face it was drawn on is gone; pick a face to reattach it.' : ''),
      command: { pickPlane: true, faceList: [], onPick: onPick },
      groups: [{ title: 'Sketch Plane/Face', fields: [
        { type: 'static', label: 'Now on', value: sketchPlaneText(f.plane) },
        { type: 'pick', icon: 'plane', placeholder: 'Select a plane or face…', value: function () { return chosen ? chosen.text : ''; } }
      ] }],
      onOK: function () {
        if (!chosen) { UI.setStatus('Select a plane or a planar face first.'); UI.toast('Select a plane or a planar face first.'); return false; }
        UI.pushUndo();
        f.plane = chosen.plane;
        if (chosen.loops) f.faceLoops = chosen.loops; else delete f.faceLoops;
        App.sel = { kind: 'feature', id: f.id };
        var text = chosen.text;
        return UI.afterRebuild(UI.rebuild(), function () {
          UI.updateHighlights(); UI.updateSketches(); UI.refreshTree();
          UI.setStatus(f.name + ' is now on ' + text + '.');
          return f;
        });
      },
      onClose: function () { if (App.sel && App.sel.kind === 'plane') App.sel = null; }
    };
    try { openPM(spec); } finally { editNext = null; }
  }
  UI.editSketchPlane = editSketchPlane;

  // Sketch Fillet / Chamfer, Offset, Convert, Trim / Extend Entities, Move / Copy / Rotate / Scale / Stretch and the sketch patterns: ui-sketch-tools.js
  // ------------------------------------------------------------------ sketch tools: mirror entities
  function roundPts(e) {
    if (e.t === 'polyline') e.pts = e.pts.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; });
    else Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') e[k] = Math.round(e[k] * 1e4) / 1e4; });
    return e;
  }
  // Mirror Entities (SolidWorks: Sketch tab ▸ Mirror Entities). *Entities to Mirror* holds the sketch selection when the
  // command starts plus anything clicked in the graphics area while it is open (a click toggles; no "everything"
  // fallback). *Mirror about* starts empty, as in SolidWorks, and must be filled before the preview shows and ✓ is
  // available: click the box (it turns pink) and then a line or centerline in the sketch, or pick a line or the sketch
  // Y / X axis in the list. A centerline preselected with the entities goes straight into Mirror about (the box takes
  // the focus when only entities were preselected).
  function cmdMirrorEntities() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    if (!f.entities.length) { UI.toast('Draw something to mirror first.'); return; }
    // rfKU: a slot's own centerline (ui-sketch-tools.js sketchInnerCenterlines) is an entity to mirror, never Mirror about
    var pre = sketchSelectionIndices(f), inner = UI.sketchInnerCenterlines ? UI.sketchInnerCenterlines(pre) : [];
    var cls = pre.filter(function (i) { var e = f.entities[i]; return e.t === 'line' && e.construction && inner.indexOf(i) < 0; }), axis0 = '';
    if (cls.length === 1) { axis0 = String(cls[0]); pre = pre.filter(function (i) { return i !== cls[0]; }); }
    var v = { entities: pre, axis: axis0, copy: true, box: pre.length && !axis0 ? 'axis' : 'entities' };
    function axisIndex() { return /^\d+$/.test(String(v.axis)) ? +v.axis : -1; }
    function hasAxis() { return v.axis === 'x' || v.axis === 'y' || axisIndex() >= 0; }
    function axisOptions() {
      var opts = [['', '(none: pick a line or centerline)'], ['y', 'Sketch vertical axis (Y)'], ['x', 'Sketch horizontal axis (X)']];
      f.entities.forEach(function (e, i) { if (e.t === 'line') opts.push([String(i), (e.construction ? 'Centerline ' : 'Line ') + (i + 1) + '  (' + UI.fmtNum(e.x1, 1) + ', ' + UI.fmtNum(e.y1, 1) + ') → (' + UI.fmtNum(e.x2, 1) + ', ' + UI.fmtNum(e.y2, 1) + ')']); });
      return opts;
    }
    function axisLabel() { var ai = axisIndex(); return ai >= 0 ? 'Line' + (ai + 1) : v.axis === 'x' ? 'Sketch X axis' : v.axis === 'y' ? 'Sketch Y axis' : ''; }
    // the entities that are mirrored: the box minus the line mirrored about
    function targets() { var ai = axisIndex(); return v.entities.filter(function (i) { return i !== ai && f.entities[i]; }); }
    function copies() {
      var spec = /^\d+$/.test(String(v.axis)) ? +v.axis : v.axis;
      var ax = K.mirrorAxis(spec, f.entities);
      return targets().map(function (i) { return K.mirrorEntity(f.entities[i], ax); }).filter(Boolean).map(roundPts);
    }
    // the preview appears only once both boxes are filled
    function preview() {
      try { App.tempEntities = targets().length && hasAxis() ? copies() : []; } catch (e) { App.tempEntities = []; UI.setStatus(e.message); }
      UI.updateTemp(); updateOkState();
    }
    function syncSelection() {
      var ai = axisIndex(), sel = sketchSelectionIndices(f).filter(function (i) { return i !== ai; });
      if (sel.join() === v.entities.join()) return;
      v.entities = sel;
      renderPM(); preview();
    }
    function setBox(b) { v.box = b; renderPM(); UI.setStatus(b === 'axis' ? 'Click a line in the sketch to mirror about.' : 'Click sketch entities to add them to Entities to Mirror (click again to remove).'); }
    openPM({
      title: 'Mirror Entities', icon: 'mirrorEnt', values: v,
      onSelection: syncSelection,
      // with Mirror about active, a clicked line becomes the mirror line (anything else is refused) and the entity box
      // takes the next clicks again
      onEntityPick: function (hit) {
        if (v.box !== 'axis') return false;
        var e = f.entities[hit.index];
        if (!e || e.t !== 'line') { UI.setStatus('Mirror about needs a line or centerline.'); return true; }
        v.axis = String(hit.index);
        setBox('entities'); preview();
        return true;
      },
      groups: [
        { title: 'Entities to Mirror', fields: [
          { type: 'pick', icon: 'mirrorEnt', value: function (x) { return x.entities.length ? x.entities.length + ' entit' + (x.entities.length > 1 ? 'ies' : 'y') : ''; }, placeholder: 'Select sketch entities…',
            active: function (x) { return x.box === 'entities'; }, onActivate: function () { setBox('entities'); },
            items: function (x) { return x.entities.map(function (i) { return { label: entityLabel(f.entities[i], i) }; }); },
            onRemove: function (x, i) { x.entities.splice(i, 1); if (UI.setSelection) UI.setSelection(x.entities.map(function (k) { return { kind: 'entity', index: k }; })); renderPM(); preview(); },
            onClear: function (x) { x.entities.length = 0; if (UI.setSelection) UI.setSelection([]); renderPM(); preview(); } },
          { type: 'check', label: 'Copy (keep originals)', key: 'copy' }
        ] },
        { title: 'Mirror about', fields: [
          { type: 'pick', icon: 'centerline', value: axisLabel, placeholder: 'Select a line or centerline…', active: function (x) { return x.box === 'axis'; }, onActivate: function () { setBox('axis'); } },
          { type: 'select', label: 'Mirror about', key: 'axis', options: axisOptions }
        ] }
      ],
      onChange: preview,
      okBlocked: function () { return !targets().length ? 'Select the entities to mirror first.' : !hasAxis() ? 'Select a line or centerline to mirror about.' : ''; },
      onOK: function () {
        if (!targets().length) { UI.toast('Select the entities to mirror first.'); return false; }
        if (!hasAxis()) { UI.toast('Select a line or centerline to mirror about.'); return false; }
        var c, targetsNow = targets();
        try { c = copies(); } catch (e) { UI.toast(e.message); return false; }
        UI.pushUndo(); App.sketchDirty = true;
        // r5/sketch5: mirrored in place, the dimensions go with their entities (labels mirrored too); the others keep
        // theirs at the shifted indices
        var carry = [];
        if (!v.copy && f.dims && UI.dimAnchor) {
          var specC = /^\d+$/.test(String(v.axis)) ? +v.axis : v.axis, axC = K.mirrorAxis(specC, f.entities);
          var src = targetsNow.filter(function (i) { return i !== specC && K.mirrorEntity(f.entities[i], axC); });
          f.dims.forEach(function (d) { var k = src.indexOf(d.e), a = k >= 0 ? UI.dimAnchor(f.entities[d.e], d) : null; if (a) { var m = K.mirrorEntity({ t: 'point', x: a[0], y: a[1] }, axC); carry.push({ d: d, k: k, uv: [m.x, m.y] }); } });
        }
        if (!v.copy) {
          var spec = /^\d+$/.test(String(v.axis)) ? +v.axis : -1, before = f.entities.slice(); f.entities = f.entities.filter(function (e, i) { return targetsNow.indexOf(i) < 0 || i === spec; }); if (window.SketchSolver) SketchSolver.remap(f, before);
          if (f.dims) { f.dims = f.dims.filter(function (d) { var n = f.entities.indexOf(before[d.e]); if (n >= 0) { d.e = n; return true; } return carry.some(function (x) { return x.d === d; }); }); }
        }
        c.forEach(function (e) { f.entities.push(e); });
        carry.forEach(function (x) { var ni = f.entities.length - c.length + x.k, pl = UI.dimPlaceAt(f.entities[ni], x.d, x.uv); x.d.e = ni; delete x.d.tx; Object.keys(pl).forEach(function (key) { x.d[key] = pl[key]; }); });
        if (f.dims && !f.dims.length) delete f.dims;
        // mirrored about a sketch line: each copy is held Symmetric to its original (sketch-solver.js)
        var specN = /^\d+$/.test(String(v.axis)) ? +v.axis : -1, nSym = 0;
        if (v.copy && specN >= 0 && window.SketchSolver) {
          var axM = K.mirrorAxis(specN, f.entities), k0 = f.entities.length - c.length, pairs = [];
          targetsNow.filter(function (i) { return i !== specN; }).forEach(function (i) { if (K.mirrorEntity(f.entities[i], axM)) pairs.push([i, k0++]); });
          nSym = SketchSolver.mirrorRelations(f, pairs, specN);
        }
        App.tempEntities = []; UI.updateTemp(); App.sel = null; App.gridStale = true;
        UI.updateSketches(); UI.refreshTree();
        var mirroredMsg = 'Mirrored ' + c.length + ' entit' + (c.length === 1 ? 'y' : 'ies') + (nSym ? ', ' + nSym + ' held Symmetric about Line' + (specN + 1) : '') + '.';
        UI.setStatus(mirroredMsg);
        setTimeout(function () { UI.setStatus(mirroredMsg); }, 0);   // lane BV: the PM closing said "Selection cleared." over it
      },
      onCancel: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    preview();
    UI.setStatus(v.box === 'axis' ? 'Mirror about: click a line or centerline in the sketch to mirror about.' : hasAxis() ? 'Click sketch entities to add them to Entities to Mirror (click again to remove).' : 'Select the entities to mirror, then click Mirror about and a line or centerline.');
  }
  // the sketch entities selected (graphics area / PropertyManager), and an entity's name in a selection box (Mirror Entities)
  function sketchSelectionIndices(f) {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.filter(function (i) { return f.entities[i]; }).sort(function (a, b) { return a - b; });
  }
  function entityLabel(e, i) {
    var names = { line: 'Line', circle: 'Circle', arc: 'Arc', rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', slot: 'Slot', point: 'Point', polyline: 'Polyline' };
    return (names[e.t] || 'Entity') + (i + 1);
  }
  function editSketch(id) {
    var f = K.findFeature(App.model, id);
    if (!f) return;
    closePM();
    App.sketchSnapshot = JSON.stringify({ entities: f.entities, dims: f.dims || [], rels: f.rels || null });
    UI.enterSketch(id);
    // r10/editpreview10: Edit Sketch rolls the part back to just before the sketch, as in SolidWorks (the rebuild on
    // exit shows the whole part again)
    var idx = App.model.features.indexOf(f);
    if (App.mode === 'sketch' && App.activeSketch === id && idx >= 0 && idx < App.model.features.length - 1 && UI.rollbackTo) UI.rollbackTo(idx);
  }

  // ------------------------------------------------------------------ extrude / cut
  function sketchPickerField(values) {
    var list = unconsumedSketches();
    if (values.sketch != null) {
      var cur = K.findFeature(App.model, values.sketch);
      if (cur && list.indexOf(cur) < 0) list.unshift(cur);
    }
    return { type: 'select', label: 'Sketch', key: 'sketch', options: list.length ? list.map(function (s) { return [s.id, s.name]; }) : [[-1, '(no unconsumed sketches)']] };
  }
  function pickDefaultSketch(sid) {
    if (sid != null) return sid;
    var list = unconsumedSketches();
    return list.length ? list[list.length - 1].id : null;
  }

  // ------------------------------------------------------------------ lane CO: Selected Contours
  // A Boss-Extrude / Cut-Extrude / Revolve can take only some regions of its sketch (Kernel.sketchRegions: the faces
  // of the sketch's planar arrangement). The PropertyManager's Selected Contours box (at the bottom, as in SolidWorks)
  // lists the picks as Sketch2-Region<1>; while it is active, hovering the graphics area lights the region under the
  // pointer (ui-select.js draws it), a click toggles it in or out, Delete on a row removes it. The feature keeps a
  // point inside each picked region (f.contours = [[u, v], …]), so a pick survives a dimension edit the way SolidWorks
  // re-finds a contour. The box starts active when a plain extrude could not take every region
  // (Kernel.regionsAmbiguous: an open line splits a loop, contours cross or share an edge).
  // contourPicker(v, refresh) -> { field (the PM pick field), command (merged into the PM's command), init() }
  function contourPicker(v, refresh) {
    var st = { active: false, lastHover: null };
    if (!Array.isArray(v.contours)) v.contours = [];
    v.contours = v.contours.map(function (p) { return [+p[0], +p[1]]; });
    function sketch() { return K.findFeature(App.model, typeof v.sketch === 'string' ? +v.sketch : v.sketch); }
    function regionOf(p) { var sk = sketch(); try { return sk ? K.regionAt(sk, p) : null; } catch (e) { return null; } }
    function label(p) { var sk = sketch(), r = regionOf(p); return (sk ? sk.name : 'Sketch') + '-Region<' + (r ? r.index + 1 : '?') + '>'; }
    function pickOf(r, sk, pl) { return { kind: 'region', sketch: sk.id, index: r.index, p: r.p.slice(), region: r, plane: pl, label: label(r.p) }; }
    function pickAt(mx, my) {
      var sk = sketch(), pl = sk && sketchPlaneOf(sk);
      if (!sk || !pl) return null;
      var uv = UI.screenToPlane(mx, my, pl), r = uv && regionOf(uv), idx = r ? r.index : -1;
      if (idx !== st.lastHover) { st.lastHover = idx; if (r) UI.setStatus(label(r.p) + ' — click to ' + (indexOfRegion(r) >= 0 ? 'remove it from' : 'add it to') + ' the selected contours.'); }
      return r ? pickOf(r, sk, pl) : null;
    }
    function indexOfRegion(r) { for (var i = 0; i < v.contours.length; i++) if (regionOf(v.contours[i]) === r) return i; return -1; }
    function changed() { renderPM(); if (refresh) refresh(); }
    var field = {
      type: 'pick', icon: 'vRegions', placeholder: 'Select sketch regions…',
      value: function (x) { return x.contours.length ? x.contours.length + ' contour' + (x.contours.length > 1 ? 's' : '') : ''; },
      active: function () { return st.active; },
      onActivate: function () { st.active = !st.active; st.lastHover = null; if (st.active) UI.setStatus('Selected Contours: click the sketch regions to use (click a region again to remove it).'); renderPM(); UI.updateHighlights(); },
      items: function (x) { var sk = sketch(), pl = sk && sketchPlaneOf(sk); return x.contours.map(function (p) { var r = regionOf(p); return { label: label(p), icon: 'vRegions', region: r, plane: pl, at: r ? null : undefined }; }); },
      onRemove: function (x, i) { x.contours.splice(i, 1); changed(); },
      onClear: function (x) { x.contours.length = 0; changed(); }
    };
    var command = {
      pickRegions: pickAt,
      regionsActive: function () { return st.active; },
      pickedRegions: function () { var sk = sketch(), pl = sk && sketchPlaneOf(sk); if (!pl) return []; return v.contours.map(function (p) { return { region: regionOf(p), plane: pl }; }).filter(function (it) { return it.region; }); },
      onPick: function (pk) {
        if (!pk || pk.kind !== 'region') return false;
        var i = indexOfRegion(pk.region);
        if (i >= 0) v.contours.splice(i, 1); else v.contours.push(pk.p.slice());
        st.lastHover = null;
        changed();
        return true;
      }
    };
    function init() {
      var sk = sketch();
      try { st.active = !!(sk && K.regionsAmbiguous(sk)); } catch (e) { st.active = false; }
      if (st.active) UI.setStatus('This sketch has more than one region: click the regions to extrude in the graphics area (Selected Contours).');
    }
    return { field: field, command: command, init: init, isActive: function () { return st.active; } };
  }
  // the feature as committed: no picks = the whole sketch, exactly as before
  function contourFeature(out, v) {
    if (!v.contours || !v.contours.length) delete out.contours;
    else out.contours = v.contours.map(function (p) { return [+p[0], +p[1]]; });
    return out;
  }

  // Default "Reverse direction" for a NEW cut so it goes into the body instead of away from it.
  // 1. A sketch on a face (custom plane) has its normal pointing out of the material: reverse.
  // 2. The kernel's cutDirectionHint (when present) looks at where the body actually lies relative to the
  //    sketch plane: true = reverse, false = forward, null = undetermined (keep the rule-1 default).
  function defaultCutReverse(sketchId, fallback) {
    var rev = !!fallback;
    var sk = K.findFeature(App.model, sketchId);
    if (sk && sk.plane && sk.plane.custom) rev = true;
    if (typeof K.cutDirectionHint === 'function') {
      var hint = null;
      try { hint = K.cutDirectionHint(App.model, sketchId, App.build && App.build.body); } catch (e) { hint = null; }
      if (hint !== null && hint !== undefined) rev = !!hint;
    }
    return rev;
  }

  function cmdExtrude(cut, existing) {
    withSketch(function (sid) {
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'extrude', cut: !!cut, depth: UI.lenDefault(10), end: cut ? 'through' : 'blind', reverse: false, dir2: false, depth2: UI.lenDefault(10), end2: 'blind', sketch: pickDefaultSketch(sid) };
      if (existing) delete f.profile;
      // SolidWorks default: a new cut on a sheet-metal part is a Normal cut (perpendicular to the sheet faces, through the thickness)
      if (!existing && cut && App.model.sheet) f.normalCut = true;
      f.normalCut = !!f.normalCut;
      // lane DC (finding #10): SolidWorks' "Link to thickness" (Direction 1, checked for a new cut on a sheet part): a
      // blind cut whose depth is the sheet thickness and follows it (linkT: true; the kernel reads T, the stored depth
      // is T too)
      if (!existing && cut && App.model.sheet) { f.linkT = true; f.end = 'blind'; }
      f.linkT = !!f.linkT;
      function sheetT() { var sh = previewModel().sheet || App.model.sheet; return sh ? +sh.thickness : null; }
      if (f.linkT && sheetT() != null) f.depth = sheetT();
      if (f.sketch == null) { UI.setStatus('Create a sketch first: Sketch tab → pick a plane → draw a closed profile.'); UI.toast('No sketch available. Draw a sketch first.'); return; }
      // a cut drawn on a face should go into the material (the face normal points out of it)
      if (!existing && cut) f.reverse = defaultCutReverse(f.sketch, f.reverse);
      var title = f.cut ? 'Cut-Extrude' : 'Boss-Extrude';
      f.draftOn = !!f.draft; if (!f.draft) f.draft = 5; f.draftOut = !!f.draftOut;
      initBodyFields(f, existing);
      function toFeature(v) {
        var out = JSON.parse(JSON.stringify(v));
        delete out.draftOn;
        if (!v.draftOn || !(+v.draft > 0)) { delete out.draft; delete out.draftOut; }
        else if (!v.draftOut) delete out.draftOut;
        if (!v.cut || !v.normalCut) delete out.normalCut;
        if (!isLinkT(v)) delete out.linkT;
        else { out.end = 'blind'; out.depth = App.model.sheet.thickness; }   // the sheet's T (its equation text, if any)
        return applyBodyFields(contourFeature(out, v), v, !!v.cut);
      }
      function isSheetCut(v) { return !!v.cut && !!App.model.sheet; }
      function isLinkT(v) { return isSheetCut(v) && !!v.linkT && v.end === 'blind'; }
      function isCutPM(v) { return !!v.cut; }
      function isBossPM(v) { return !v.cut; }
      function preview(v) { App.command.sketchId = v.sketch; UI.updateSketches(); UI.updateHighlights(); var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '. Press Enter or ✓ to accept.'); }
      var contours = contourPicker(f, function () { preview(f); });   // lane CO: Selected Contours
      contours.init();
      openPM({
        title: existing ? existing.name : title, icon: f.cut ? 'cut' : 'extrude', values: f,
        command: Object.assign({ sketchId: f.sketch }, contours.command), handles: extrudeHandles,
        groups: [
          { title: 'From', fields: [{ type: 'static', label: 'Start', value: 'Sketch Plane' }, sketchPickerField(f)] },
          {
            title: 'Direction 1', fields: [
              { type: 'select', label: 'End condition', key: 'end', options: [['blind', 'Blind'], ['through', 'Through All'], ['mid', 'Mid Plane']], rerender: true },
              { type: 'number', label: 'Depth  D1', key: 'depth', unit: 'u', min: 0, show: function (v) { return v.end !== 'through' && !isLinkT(v); } },
              { type: 'static', label: 'Depth  D1', value: function () { return UI.fmtNum(sheetT(), 4) + ' ' + UI.unitLabel() + ' (sheet thickness)'; }, show: isLinkT },
              { type: 'check', label: 'Link to thickness', key: 'linkT', rerender: true, show: function (v) { return isSheetCut(v) && v.end === 'blind'; } },
              { type: 'check', label: 'Reverse direction', key: 'reverse' },
              mergeField(isBossPM)
            ]
          },
          {
            title: 'Direction 2', optional: true, fields: [
              { type: 'check', label: 'Enable direction 2', key: 'dir2', rerender: true },
              { type: 'select', label: 'End condition', key: 'end2', options: [['blind', 'Blind'], ['through', 'Through All']], rerender: true, show: function (v) { return v.dir2; } },
              { type: 'number', label: 'Depth  D2', key: 'depth2', unit: 'u', min: 0, show: function (v) { return v.dir2 && v.end2 !== 'through'; } }
            ]
          },
          {
            // only on a Cut-Extrude of a sheet-metal part (the model carries sheet parameters)
            title: 'Sheet Metal', show: isSheetCut, fields: [
              { type: 'check', label: 'Normal cut', key: 'normalCut' }
            ]
          },
          scopeGroup(isCutPM),   // only on a cut of a multi-body part
          {
            title: 'Draft', optional: true, collapsed: !f.draftOn, fields: [
              { type: 'check', label: 'Draft on', key: 'draftOn', rerender: true },
              { type: 'number', label: 'Draft angle', key: 'draft', unit: '°', min: 0, show: function (v) { return v.draftOn; } },
              { type: 'check', label: 'Draft outward', key: 'draftOut', show: function (v) { return v.draftOn; } }
            ]
          },
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut', rerender: true }, { type: 'text', label: 'Name', key: 'name' }] },
          { title: 'Selected Contours', fields: [contours.field] }   // lane CO: at the bottom, as in SolidWorks
        ],
        onChange: function (v, key) { if (key === 'sketch') { v.contours.length = 0; renderPM(); } if (key === 'linkT' && v.linkT && sheetT() != null) v.depth = sheetT(); preview(v); },
        onOK: function (v) { var feat = toFeature(v); if (!feat.name) delete feat.name; return commitFeature(feat, existing); }
      });
      if (contours.isActive()) UI.setStatus('This sketch has more than one region: click the regions to extrude in the graphics area (Selected Contours).');
    });
  }

  // ------------------------------------------------------------------ revolve
  function revolveAxisOptions(v) {
    var opts = [['y', 'Sketch vertical axis (Y)'], ['x', 'Sketch horizontal axis (X)']];
    var s = K.findFeature(App.model, v.sketch);
    if (s) s.entities.forEach(function (e, i) { if (e.t === 'line') opts.push([i, 'Line ' + (i + 1) + '  (' + UI.fmtNum(e.x1, 1) + ', ' + UI.fmtNum(e.y1, 1) + ') → (' + UI.fmtNum(e.x2, 1) + ', ' + UI.fmtNum(e.y2, 1) + ')']); });
    return opts.concat(refAxisOptions(v.id));   // lane CZ: reference axes
  }
  function cmdRevolve(cut, existing) {
    withSketch(function (sid) {
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'revolve', cut: !!cut, angle: 360, axis: 'y', reverse: false, sketch: pickDefaultSketch(sid) };
      if (existing) delete f.profile;
      axisRefIn(f);   // lane CZ: about a reference axis
      if (f.sketch == null) { UI.toast('No sketch available. Draw a sketch first.'); return; }
      var title = f.cut ? 'Cut-Revolve' : 'Revolve';
      initBodyFields(f, existing);
      function toFeature(v) { return applyBodyFields(contourFeature(JSON.parse(JSON.stringify(v)), v), v, !!v.cut); }
      function preview(v) { App.command.sketchId = v.sketch; UI.updateSketches(); UI.updateHighlights(); var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '.'); }
      var contours = contourPicker(f, function () { preview(f); });   // lane CO: Selected Contours
      contours.init();
      openPM({
        title: existing ? existing.name : title, icon: f.cut ? 'revolveCut' : 'revolve', values: f, command: refAxisCommand(f, Object.assign({ sketchId: f.sketch }, contours.command)), handles: revolveHandles,
        groups: [
          { title: 'Axis of Revolution', fields: [sketchPickerField(f), { type: 'select', label: 'Axis', key: 'axis', options: revolveAxisOptions }] },
          { title: 'Direction 1', fields: [{ type: 'number', label: 'Angle', key: 'angle', unit: '°', min: 0 }, { type: 'check', label: 'Reverse direction', key: 'reverse' }, mergeField(function (v) { return !v.cut; })] },
          scopeGroup(function (v) { return !!v.cut; }),
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut', rerender: true }, { type: 'text', label: 'Name', key: 'name' }] },
          { title: 'Selected Contours', fields: [contours.field] }   // lane CO
        ],
        onChange: function (v, key) { if (key === 'sketch') { v.contours.length = 0; renderPM(); } preview(v); },
        onOK: function (v) { var feat = toFeature(v); if (!feat.name) delete feat.name; if (typeof feat.axis === 'string' && /^\d+$/.test(feat.axis)) feat.axis = +feat.axis; axisRefOut(feat, 'y'); return commitFeature(feat, existing); }
      });
      if (contours.isActive()) UI.setStatus('This sketch has more than one region: click the regions to revolve in the graphics area (Selected Contours).');
    });
  }

  // ------------------------------------------------------------------ sweep & loft
  function allSketchesField(label, key, exclude) {
    return function (values) {
      var list = App.model.features.filter(function (s) { return s.type === 'sketch' && s.id !== values[exclude]; });
      return { type: 'select', label: label, key: key, options: list.length ? list.map(function (s) { return [s.id, s.name + (UI.isConsumed(s.id) ? ' (used)' : '')]; }) : [[-1, '(no sketches)']] };
    };
  }
  function cmdSweep(cut, existing) {
    withSketch(function (sid) {
      var sketches = App.model.features.filter(function (s) { return s.type === 'sketch'; });
      if (sketches.length < (faCurves().length ? 1 : 2) && !existing) { UI.toast('A sweep needs a profile sketch and a path sketch (lines/arcs).'); return; }   // rfFA: or a curve
      var free = unconsumedSketches();
      // default pairing: the most recent unconsumed sketch with a closed profile is the profile, the other one the path
      var cands = (free.length >= 2 ? free : sketches).slice(-2);
      function closedLoops(s) { try { return K.sketchProfile(s).loops.length; } catch (e) { return 0; } }
      var prof = cands[cands.length - 1], path = cands[0];
      if (cands.length === 2 && closedLoops(prof) === 0 && closedLoops(path) > 0) { prof = cands[0]; path = cands[1]; }
      if (sid != null) { prof = K.findFeature(App.model, sid) || prof; path = (free.length >= 2 ? free : sketches).filter(function (s) { return s.id !== sid; }).slice(-1)[0] || path; }
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'sweep', cut: !!cut, profile: prof.id, path: path.id };
      if (!existing) { var fac = faDefaultPath(); if (fac != null) f.path = fac; }   // rfFA: a curve not yet swept along is the path
      if (Array.isArray(f.path)) f.pathPoints = JSON.stringify(f.path);
      var title = f.cut ? 'Cut-Sweep' : 'Sweep';
      initBodyFields(f, existing);
      function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(v)), v, !!v.cut); }
      openPM({
        title: existing ? existing.name : title, icon: 'sweep', values: f, command: { sketchId: f.profile },
        message: 'The <b>profile</b> is a closed sketch; the <b>path</b> is a sketch of connected lines/arcs starting at the profile. The profile is turned perpendicular to the first path segment automatically.',
        groups: [
          { title: 'Profile and Path', fields: [
            { type: 'select', label: 'Profile', key: 'profile', options: function (v) { return allSketchesField('Profile', 'profile', 'path')(v).options; } },
            { type: 'select', label: 'Path', key: 'path', options: function (v) { return allSketchesField('Path', 'path', 'profile')(v).options.concat(faCurveOptions(v.id)); }, show: function (v) { return !Array.isArray(v.path); } },   // rfFA: curves too
            { type: 'static', label: 'Path', value: function (v) { return Array.isArray(v.path) ? v.path.length + ' points (from script)' : ''; }, show: function (v) { return Array.isArray(v.path); } },
            mergeField(function (v) { return !v.cut; })
          ] },
          scopeGroup(function (v) { return !!v.cut; }),
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut', rerender: true }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v) {
          if (typeof v.profile === 'string' && /^\d+$/.test(v.profile)) v.profile = +v.profile;
          if (typeof v.path === 'string' && /^\d+$/.test(v.path)) v.path = +v.path;
          App.command.sketchId = v.profile; App.command.pathId = v.path; UI.updateSketches();
          var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '. Press Enter or ✓ to accept.');
        },
        onOK: function (v) { if (!v.name) delete v.name; delete v.pathPoints; return commitFeature(applyBodyFields(v, v, !!v.cut), existing); }
      });
    });
  }
  function cmdLoft(cut, existing) {
    withSketch(function (sid) {
      var sketches = App.model.features.filter(function (s) { return s.type === 'sketch'; });
      if (sketches.length < 2 && !existing) { UI.toast('A loft needs at least two sketches on different planes.'); return; }
      var free = unconsumedSketches();
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'loft', cut: !!cut, sketches: [] };
      if (!existing) {
        var seed = free.length >= 2 ? free.slice(-2) : sketches.slice(-2);
        f.sketches = seed.map(function (s) { return s.id; });
        if (sid != null && f.sketches.indexOf(sid) < 0) { f.sketches.pop(); f.sketches.push(sid); }
      }
      f.s0 = f.sketches[0]; f.s1 = f.sketches[1]; f.s2 = f.sketches[2] != null ? f.sketches[2] : -1;
      var title = f.cut ? 'Cut-Loft' : 'Loft';
      initBodyFields(f, existing);
      function opts(v, exclude) { return sketches.map(function (s) { return [s.id, s.name + (UI.isConsumed(s.id) ? ' (used)' : '')]; }); }
      function sync(v) {
        var ids = [v.s0, v.s1, v.s2].map(function (x) { return typeof x === 'string' ? +x : x; }).filter(function (x) { return x != null && x !== -1 && !isNaN(x); });
        v.sketches = ids;
      }
      function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(v)), v, !!v.cut); }
      openPM({
        title: existing ? existing.name : title, icon: 'loft', values: f, command: { loftIds: f.sketches.slice() },
        message: 'Pick two or three sketches, each with <b>one closed profile</b>, on different planes. Profiles are matched point by point around their outlines.',
        groups: [
          { title: 'Profiles', fields: [
            { type: 'select', label: 'Section 1', key: 's0', options: opts },
            { type: 'select', label: 'Section 2', key: 's1', options: opts },
            { type: 'select', label: 'Section 3', key: 's2', options: function (v) { return [[-1, '(none)']].concat(opts(v)); } },
            mergeField(function (v) { return !v.cut; })
          ] },
          scopeGroup(function (v) { return !!v.cut; }),
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut', rerender: true }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v) { sync(v); App.command.loftIds = v.sketches; UI.updateSketches(); var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '. Press Enter or ✓ to accept.'); },
        onOK: function (v) { sync(v); if (v.sketches.length < 2) { UI.toast('Pick at least two sketches.'); return false; } delete v.s0; delete v.s1; delete v.s2; if (!v.name) delete v.name; return commitFeature(applyBodyFields(v, v, !!v.cut), existing); }
      });
    });
  }

  // ------------------------------------------------------------------ patterns & mirror
  function sourceField(v) {
    var list = solidFeatures().filter(function (s) { return !v.id || s.id !== v.id; });
    return { type: 'select', label: 'Feature to pattern', key: 'feature', options: list.length ? list.map(function (s) { return [s.id, s.name]; }) : [[-1, '(no features yet)']] };
  }
  function defaultSource() {
    var id = selectedSolidId();
    if (id != null) return id;
    var list = solidFeatures();
    return list.length ? list[list.length - 1].id : null;
  }
  function needSource(f) { if (f.feature == null || f.feature === -1) { UI.toast('Create a boss or cut first, then pattern it.'); return false; } return true; }

  function cmdLinearPattern(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'lpattern', feature: defaultSource(), d1: 'x', rev1: false, s1: UI.lenDefault(20), n1: 3, d2: null, rev2: false, s2: UI.lenDefault(20), n2: 2 };
    if (!needSource(f)) return;
    initBodyFields(f, existing);
    function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(v)), v, featureIsCut(v)); }
    openPM({
      title: existing ? existing.name : 'Linear Pattern', icon: 'lpattern', values: f, handles: lpatternHandles,
      groups: [
        { title: 'Features to Pattern', fields: [Object.assign(sourceField(f), { rerender: true })] },
        { title: 'Direction 1', fields: [{ type: 'select', label: 'Direction', key: 'd1', options: [['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']] }, { type: 'check', label: 'Reverse', key: 'rev1' }, { type: 'number', label: 'Spacing', key: 's1', unit: 'u' }, { type: 'number', label: 'Instances', key: 'n1', step: 1, min: 1 }, mergeField(featureIsBoss)] },
        { title: 'Direction 2', fields: [{ type: 'select', label: 'Direction', key: 'd2', options: [['', 'None'], ['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']], rerender: true }, { type: 'check', label: 'Reverse', key: 'rev2', show: function (v) { return !!v.d2; } }, { type: 'number', label: 'Spacing', key: 's2', unit: 'u', show: function (v) { return !!v.d2; } }, { type: 'number', label: 'Instances', key: 'n2', step: 1, min: 1, show: function (v) { return !!v.d2; } }] },
        scopeGroup(featureIsCut),   // a pattern of a cut is itself a cut
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { if (v.d2 === '') v.d2 = null; var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing linear pattern.'); },
      onOK: function (v) { if (!v.name) delete v.name; if (v.d2 === '') v.d2 = null; return commitFeature(applyBodyFields(v, v, featureIsCut(v)), existing); }
    });
  }

  function cmdCircularPattern(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'cpattern', feature: defaultSource(), axis: 'y', cx: 0, cy: 0, cz: 0, n: 6, angle: 360, equal: true };
    if (existing && existing.center) { f.cx = existing.center[0]; f.cy = existing.center[1]; f.cz = existing.center[2]; }
    axisRefIn(f);   // lane CZ: about a reference axis
    if (!needSource(f)) return;
    initBodyFields(f, existing);
    function norm(v) { v.center = [+v.cx || 0, +v.cy || 0, +v.cz || 0]; return v; }
    function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(norm(v))), v, featureIsCut(v)); }
    openPM({
      title: existing ? existing.name : 'Circular Pattern', icon: 'cpattern', values: f, handles: cpatternHandles, command: refAxisCommand(f),
      groups: [
        { title: 'Features to Pattern', fields: [Object.assign(sourceField(f), { rerender: true })] },
        { title: 'Direction 1', fields: [{ type: 'select', label: 'Axis', key: 'axis', options: function (v) { return [['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']].concat(refAxisOptions(v.id)); }, rerender: true }, { type: 'number', label: 'Angle', key: 'angle', unit: '°' }, { type: 'number', label: 'Instances', key: 'n', step: 1, min: 2 }, { type: 'check', label: 'Equal spacing', key: 'equal' }, mergeField(featureIsBoss)] },
        { title: 'Axis point', show: function (v) { return !/^ref:/.test(String(v.axis)); }, fields: [{ type: 'number', label: 'X', key: 'cx', unit: 'u' }, { type: 'number', label: 'Y', key: 'cy', unit: 'u' }, { type: 'number', label: 'Z', key: 'cz', unit: 'u' }] },
        scopeGroup(featureIsCut),   // a pattern of a cut is itself a cut
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing circular pattern.'); },
      onOK: function (v) { norm(v); delete v.cx; delete v.cy; delete v.cz; if (!v.name) delete v.name; axisRefOut(v, 'z'); return commitFeature(applyBodyFields(v, v, featureIsCut(v)), existing); }
    });
  }

  function cmdMirror(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'mirror', plane: 'Right', offset: 0, feature: defaultSource(), body: false };
    if (!f.body && !needSource(f)) return;
    initBodyFields(f, existing);
    function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(v)), v, featureIsCut(v)); }
    openPM({
      title: existing ? existing.name : 'Mirror', icon: 'mirror', values: f, handles: function (v) { return offsetHandles(v.plane || 'Right', v.offset, 'Plane offset'); },
      groups: [
        { title: 'Mirror Face/Plane', fields: [{ type: 'select', label: 'Plane', key: 'plane', options: ['Front', 'Top', 'Right'] }, { type: 'number', label: 'Plane offset', key: 'offset', unit: 'u' }, mergeField(featureIsBoss)] },
        { title: 'Features to Mirror', fields: [{ type: 'check', label: 'Mirror whole body', key: 'body', rerender: true }, Object.assign(sourceField(f), { show: function (v) { return !v.body; }, rerender: true })] },
        scopeGroup(featureIsCut),   // a mirror of a cut is itself a cut
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing mirror.'); },
      onOK: function (v) { if (!v.name) delete v.name; if (v.body) delete v.feature; return commitFeature(applyBodyFields(v, v, featureIsCut(v)), existing); }
    });
  }

  // ------------------------------------------------------------------ chamfer / fillet (edge features)
  function cmdEdgeFeature(kind, existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.edges || !App.edges.length) { UI.toast('Create a solid first.'); return; }
    var isChamfer = kind === 'chamfer';
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: kind, edges: [], chain: true };
    if (isChamfer) f.d = f.d != null ? f.d : UI.lenDefault(2); else f.r = f.r != null ? f.r : UI.lenDefault(2);   // r15/inches15: 0.0625 in in an inch document
    if (existing) f.chain = !(existing.edges || []).some(function (e) { return e.chain === false; });
    // seed with a pre-selected edge
    // r9/polish9: every pre-selected edge (a box or Ctrl selection, not only the first), and a pre-selected face gives
    // the edges around it, as in SolidWorks; the items move into the PropertyManager. A selected feature (the one just
    // created) is not an input here: it is let go so its faces do not stay lit while edges are picked.
    if (!existing) {
      var pre = UI.selection ? UI.selection() : [App.sel].filter(Boolean), seenAt = {}, seenCurve = {}, used = false;
      var addAt = function (e) {
        if (e.curve != null) { if (seenCurve[e.curve]) return; seenCurve[e.curve] = 1; }
        var k = e.mid.map(function (x) { return Math.round(x * 1e4); }).join(',');
        if (seenAt[k]) return;
        seenAt[k] = 1; f.edges.push({ at: e.mid.slice(), chain: true });
      };
      pre.forEach(function (s) {
        if (s.kind === 'edge' && s.edge) { addAt(s.edge); used = true; }
        else if (s.kind === 'face' && App.mesh && App.mesh.faces[s.index]) {
          var grp = UI.faceGroup ? UI.faceGroup(s.index) : [s.index];
          App.edges.forEach(function (e) { if (!e.smooth && e.faces.length === 2 && e.convex !== null && (grp.indexOf(e.faces[0]) >= 0 || grp.indexOf(e.faces[1]) >= 0)) addAt(e); });
          used = true;
        }
      });
      if ((used || (pre.length && pre.every(function (s) { return s.kind === 'feature'; }))) && UI.setSelection) UI.setSelection([]);
    }
    var edgeList = [];
    function resolveList() {
      var sharp = App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex !== null; });
      edgeList = K.resolveEdges(f.edges.map(function (e) { return { at: e.at, chain: f.chain }; }), sharp, K.pickTol(App.model.units, isChamfer ? +f.d : +f.r));
      // r4/features4: each pick's own edges, for its row in the selection list
      perPick = f.edges.map(function (e) { try { return K.resolveEdges([{ at: e.at, chain: f.chain }], sharp, K.pickTol(App.model.units, isChamfer ? +f.d : +f.r)); } catch (er) { return []; } });
      if (App.command) App.command.edgeList = edgeList;
      UI.updateHighlights();
    }
    var perPick = [], valKey = isChamfer ? 'd' : 'r', valTag = isChamfer ? 'D ' : 'R ';
    function removePick(v, i) { v.edges.splice(i, 1); renderPM(); resolveList(); preview(); }
    // r4/features4: a drag handle on the first pick (into its first face, where the fillet / chamfer meets it) and a
    // value callout next to every other pick
    function edgeHandles(v) {
      var out = [];
      v.edges.forEach(function (spec, i) {
        if (i === 0) {
          var fr = edgeFrame(spec.at, perPick[0] && perPick[0].length ? perPick[0] : edgeList);
          if (fr) { out.push({ key: valKey, label: isChamfer ? 'Distance D' : 'Radius R', O: fr.O, dir: fr.dir, k: 1, value: +v[valKey], min: 0, tag: valTag }); return; }
        }
        out.push({ type: 'callout', at: spec.at, text: valTag + (UI.fmtModelValue ? UI.fmtModelValue(+v[valKey]) : UI.fmtNum(+v[valKey], 2) + ' ' + UI.unitLabel()), key: valKey });
      });
      return out;
    }
    function edgeStatus(r) { UI.setStatus((isChamfer ? 'Chamfer' : 'Fillet') + ' preview: ' + r.count + ' edge' + (r.count === 1 ? '' : 's') + '. Press Enter or ✓ to accept.'); }
    function preview() {
      if (!f.edges.length) { lp.shown = ++lp.seq; UI.disposeGroup(UI.groups.preview); UI.setStatus('Click edges in the graphics area to ' + kind + ' them.'); return; }
      // editing: built on the part as it was before this feature, like the rebuild does
      var upto = null;
      if (existing) App.model.features.forEach(function (g, i) { if (g.id === existing.id) upto = i; });
      livePreview({ op: 'edge', feature: f, upto: upto, mats: [UI.mats.previewCut, UI.mats.preview], sync: previewSync, done: function (r) { edgeStatus(r.info); } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var r = K.buildEdgeFeature(f, { body: App.build.body });
        [r.cut, r.add].forEach(function (tool, i) {
          if (!tool) return;
          var mesh = K.meshFromBody(tool), g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(UI.analyticNormals(mesh), 3));
          UI.groups.preview.add(new THREE.Mesh(g, i === 0 ? UI.mats.previewCut : UI.mats.preview));
        });
        UI.setStatus((isChamfer ? 'Chamfer' : 'Fillet') + ' preview: ' + r.count + ' edge' + (r.count === 1 ? '' : 's') + '. Press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    try { resolveList(); } catch (e) { }   // r4/features4: the selection list's rows know their edges on the first render
    openPM({
      title: existing ? existing.name : (isChamfer ? 'Chamfer' : 'Fillet'), icon: kind, values: f, handles: edgeHandles,
      onRollback: function () { try { resolveList(); } catch (e) { } },   // r10/editpreview10: the edges of the rolled-back part
      message: 'Click <b>edges</b> to add or remove them. Tangent chains (round edges) are picked as one. Drag the arrow on the model to change the ' + (isChamfer ? 'distance' : 'radius') + '.',
      command: {
        pickEdges: true, edgeList: edgeList,
        onPick: function (pk) {
          if (pk.kind !== 'edge') return false;
          var e = pk.edge;
          // toggle: remove a spec whose resolved chain contains this edge, else add
          var hitIdx = -1;
          f.edges.forEach(function (spec, i) {
            var chain = K.resolveEdges([{ at: spec.at, chain: f.chain }], App.edges.filter(function (x) { return !x.smooth && x.faces.length === 2; }), K.pickTol(App.model.units));
            if (chain.indexOf(e) >= 0) hitIdx = i;
          });
          if (hitIdx >= 0) f.edges.splice(hitIdx, 1); else f.edges.push({ at: e.mid.slice(), chain: f.chain });
          renderPM(); resolveList(); preview();
          return true;
        }
      },
      groups: [
        { title: isChamfer ? 'Items To Chamfer' : 'Items To Fillet', fields: [
          { type: 'pick', icon: kind, value: function (v) { return v.edges.length ? v.edges.length + ' edge pick' + (v.edges.length > 1 ? 's' : '') + (edgeList.length ? ' → ' + edgeList.length + ' edges' : '') : ''; }, placeholder: 'Select edges…',
            items: function (v) { return v.edges.map(function (spec, i) { var n = perPick[i] ? perPick[i].length : 0; return { label: 'Edge<' + (i + 1) + '>' + (n > 1 ? '  (' + n + ' edges)' : ''), get edges() { return perPick[i] || []; }, at: spec.at }; }); },
            onRemove: removePick, onClear: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } },
          { type: 'check', label: 'Tangent propagation', key: 'chain' },
          { type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }
        ] },
        { title: isChamfer ? 'Chamfer Parameters' : 'Fillet Parameters', fields: [
          isChamfer ? { type: 'number', label: 'Distance  D', key: 'd', unit: 'u', min: 0 } : { type: 'number', label: 'Radius  R', key: 'r', unit: 'u', min: 0 }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { v.edges.forEach(function (e) { e.chain = v.chain; }); resolveList(); preview(); },
      onOK: function (v) {
        if (!v.edges.length) { UI.toast('Select at least one edge.'); return false; }
        v.edges.forEach(function (e) { e.chain = v.chain; });
        delete v.chain;
        if (!v.name) delete v.name;
        return commitFeature(v, existing);
      }
    });
    resolveList(); preview();
  }
  function cmdChamfer(existing) { cmdEdgeFeature('chamfer', existing); }
  function cmdFillet(existing) { cmdEdgeFeature('fillet', existing); }

  // ------------------------------------------------------------------ shell
  // The body as it was before feature `id` (a rebuild of the truncated tree), so editing previews on the right body.
  function bodyBefore(id) {
    var idx = -1;
    App.model.features.forEach(function (g, i) { if (g.id === id) idx = i; });
    if (idx < 0) return App.build ? App.build.body : null;
    var m = JSON.parse(JSON.stringify(App.model));
    m.features = m.features.slice(0, idx);
    return K.rebuild(m).body;
  }
  function cmdShell(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    // editing: the body before this shell is rebuilt only when the main thread needs it (a face pick, or no worker)
    var base = existing ? null : (App.build ? App.build.body : null), baseMesh = existing ? null : App.mesh;
    function getBase() { if (!base) { base = bodyBefore(existing.id); baseMesh = K.meshFromBody(base); } return base; }
    function getBaseMesh() { getBase(); return baseMesh; }
    if (existing ? !App.build : !base) { UI.toast('Create a solid first, then shell it.'); return; }
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'shell', thickness: UI.lenDefault(2), faces: [] };
    // r9/polish9: every pre-selected face (Ctrl / box selection too), each at its picked point or else inside its
    // first triangle; the faces move into the PropertyManager
    if (!existing) {
      var preF = (UI.selection ? UI.selection() : [App.sel]).filter(function (s) { return s && s.kind === 'face' && App.mesh && App.mesh.faces[s.index]; });
      preF.forEach(function (s) {
        var at = s.point ? s.point.slice() : null;
        if (!at) { var fc = App.mesh.faces[s.index], P = App.mesh.positions, o = fc.start * 9; at = [0, 1, 2].map(function (k) { return (P[o + k] + P[o + 3 + k] + P[o + 6 + k]) / 3; }); }
        f.faces.push({ at: at.map(function (x) { return Math.round(x * 1e4) / 1e4; }) });
      });
      if (preF.length && UI.setSelection) UI.setSelection([]);
    }
    function tol() { return K.pickTol(App.model.units, (+f.thickness || 1) / 2); }
    function resolveList() {
      var idx = [];
      if (!existing || App.rollback != null) try { idx = K.resolveFaces(f.faces, getBaseMesh(), tol()); } catch (e) { }
      // highlights map to the displayed mesh, which is the base body only for a new shell
      if (App.command) App.command.faceList = existing && App.rollback == null ? [] : idx;   // r10/editpreview10: rolled back, the base is shown
      UI.updateHighlights();
      return idx;
    }
    function shellStatus(removed) { UI.setStatus('Shell preview: walls ' + UI.fmtNum(+f.thickness, 3) + ' ' + UI.unitLabel() + ', ' + (removed ? removed + ' face' + (removed === 1 ? '' : 's') + ' removed' : 'closed hollow') + '. Press Enter or ✓ to accept.'); }
    function preview() {
      var upto = null;
      if (existing) App.model.features.forEach(function (g, i) { if (g.id === existing.id) upto = i; });
      livePreview({ op: 'shell', feature: f, upto: upto, mats: [UI.mats.previewCut], sync: previewSync, done: function (r) { shellStatus(r.info.removed); } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var r = K.buildShell(f, { body: getBase() });
        var mesh = K.meshFromBody(r.inner), g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(UI.analyticNormals(mesh), 3));
        UI.groups.preview.add(new THREE.Mesh(g, UI.mats.previewCut));
        UI.setStatus('Shell preview: walls ' + UI.fmtNum(+f.thickness, 3) + ' ' + UI.unitLabel() + ', ' + (r.removed.length ? r.removed.length + ' face' + (r.removed.length === 1 ? '' : 's') + ' removed' : 'closed hollow') + '. Press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    openPM({
      title: existing ? existing.name : 'Shell', icon: 'shell', values: f,
      onRollback: function (on) { if (on && existing) { base = App.build.body; baseMesh = App.mesh; } try { resolveList(); } catch (e) { } },   // r10/editpreview10
      // r4/features4: the wall thickness as an arrow into the first removed face (or the largest face)
      handles: function (v) {
        var fr = faceFrame(v.faces.length ? v.faces[0].at : null);
        return fr ? [{ key: 'thickness', label: 'Thickness', O: fr.O, dir: V.scale(fr.n, -1), k: 1, value: +v.thickness, min: 0 }] : [];
      },
      message: existing ? 'Edit the wall thickness. The cavity preview is shown in red.' : 'Click the <b>faces to remove</b> (leave none selected for a closed hollow part), then set the wall thickness. The cavity preview is shown in red.',
      command: {
        faceList: [],
        onPick: function (pk) {
          if (pk.kind !== 'face' || !pk.point) return false;
          var hit = -1;
          // any facet of an already listed curved face toggles it off
          var grp = (!existing || App.rollback != null) && UI.faceGroup ? UI.faceGroup(pk.index) : [pk.index];
          f.faces.forEach(function (spec, i) { if (grp.indexOf(K.resolveFaces([spec], getBaseMesh(), tol())[0]) >= 0) hit = i; });
          if (hit >= 0) f.faces.splice(hit, 1); else f.faces.push({ at: pk.point.map(function (x) { return Math.round(x * 1e4) / 1e4; }) });
          renderPM(); resolveList(); preview();
          return true;
        }
      },
      groups: [
        { title: 'Parameters', fields: [
          { type: 'number', label: 'Thickness  D1', key: 'thickness', unit: 'u', min: 0 },
          { type: 'pick', icon: 'shell', value: function (v) { return v.faces.length ? v.faces.length + ' face' + (v.faces.length > 1 ? 's' : '') + ' to remove' : ''; }, placeholder: 'Faces to remove (optional)…',
            // r4/features4: one row per removed face (hover highlights it, Delete / right-click removes it)
            items: function (v) { return v.faces.map(function (spec, i) { return { label: 'Face<' + (i + 1) + '>', get faces() { if (existing) return []; try { var k = K.resolveFaces([spec], getBaseMesh(), tol())[0]; return k != null && k >= 0 ? [k] : []; } catch (e) { return []; } }, at: spec.at }; }); },
            onRemove: function (v, i) { v.faces.splice(i, 1); renderPM(); resolveList(); preview(); },
            onClear: function (v) { v.faces.length = 0; renderPM(); resolveList(); preview(); } },
          { type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.faces.length = 0; renderPM(); resolveList(); preview(); } }] }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { resolveList(); preview(); },
      onOK: function (v) { if (!(v.thickness > 0)) { UI.toast('Thickness must be greater than zero.'); return false; } if (!v.name) delete v.name; return commitFeature(v, existing); }
    });
    resolveList(); preview();
  }

  // ------------------------------------------------------------------ reference plane
  function cmdPlane(existing) {
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'plane', ref: 'Front', offset: UI.lenDefault(20) };
    openPM({
      title: existing ? existing.name : 'Plane', icon: 'plane', values: f, handles: function (v) { return offsetHandles(v.ref, v.offset, 'Offset distance'); },
      groups: [{ title: 'First Reference', fields: [{ type: 'select', label: 'Parallel to', key: 'ref', options: ['Front', 'Top', 'Right'] }, { type: 'number', label: 'Offset distance', key: 'offset', unit: 'u' }] }, { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }],
      onChange: function (v) {
        UI.disposeGroup(UI.groups.preview);
        var pl = K.makePlane(v.ref, v.offset), half = 60;
        var c = [K.to3D(pl, -half, -half), K.to3D(pl, half, -half), K.to3D(pl, half, half), K.to3D(pl, -half, half)];
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(c[0], c[1], c[2], c[0], c[2], c[3]), 3));
        UI.groups.preview.add(new THREE.Mesh(g, UI.mats.planeFaceHi));
      },
      onOK: function (v) { if (!v.name) delete v.name; var p = commitFeature(v, existing); App.view.showPlanes = true; UI.updatePlanes(); return p; }
    });
  }

  // ------------------------------------------------------------------ lane CZ: Reference Geometry — Axis, Point, Coordinate System
  // SolidWorks' Axis / Point / Coordinate System PropertyManagers: a type (icon buttons), selection boxes that take
  // picks in the graphics area (faces, edges, vertices, planes, sketch points / lines / arcs, other reference
  // geometry; the active box is magenta and fills in order), a live preview of the result, and a feature that
  // rebuilds with the model (kernel-features.js resolveRefGeo; refs are picked points that follow the faces / edges).
  var REF_TYPES = {
    refaxis: { title: 'Axis', icon: 'refAxis', kinds: [
      ['line', 'One Line/Edge/Axis', [['line', 'Line, edge or axis']]],
      ['planes', 'Two Planes', [['plane', 'First plane or planar face'], ['plane', 'Second plane or planar face']]],
      ['points', 'Two Points/Vertices', [['point', 'First point or vertex'], ['point', 'Second point or vertex']]],
      ['cyl', 'Cylindrical/Conical Face', [['cyl', 'Cylindrical or conical face']]],
      ['pointFace', 'Point and Face/Plane', [['point', 'Point or vertex'], ['plane', 'Plane or planar face']]]] },
    refpoint: { title: 'Point', icon: 'refPoint', kinds: [
      ['arc', 'Arc Center', [['circle', 'Circular edge, sketch arc or circle']]],
      ['face', 'Center of Face', [['face', 'Face']]],
      ['intersect', 'Intersection', [['line', 'First edge, line or axis'], ['line', 'Second edge, line or axis']]],
      ['project', 'Projection', [['point', 'Point to project'], ['plane', 'Plane or face to project onto']]],
      ['on', 'On Point', [['point', 'Vertex, sketch point or point']]],
      ['along', 'Along Curve Distance', [['curve', 'Edge, sketch line or arc']]]] }
  };
  var CSYS_SLOTS = [['origin', 'point', 'Origin (point or vertex)'], ['x', 'dir', 'X axis (edge, axis, face or plane)'], ['y', 'dir', 'Y axis'], ['z', 'dir', 'Z axis']];
  // a pick ({ kind: 'face' | 'edge' | 'vertex' | 'plane' | 'refgeo' | 'sketchEntity' | 'feature' }) -> a kernel ref for
  // a box that wants `want`, or a reason string when it cannot go there
  function refFromPick(pk, want) {
    var r4 = function (p) { return p.map(function (x) { return Math.round(x * 1e4) / 1e4; }); };
    if (pk.kind === 'feature' && pk.refgeo) pk = { kind: 'refgeo', id: pk.id, refgeo: pk.refgeo, point: pk.point };
    if (pk.kind === 'feature') { var pf = K.findFeature(App.model, pk.id); if (pf && pf.type === 'plane') pk = { kind: 'plane', ref: pf.id }; else if (pf && pf.type === 'sketch' && (want === 'plane' || want === 'dir')) return { sketch: pf.id }; }
    var faceAt = pk.point ? r4(pk.point) : null;
    switch (pk.kind) {
      case 'plane': return want === 'plane' || want === 'dir' ? { plane: pk.ref } : 'Pick ' + refWantText(want) + ', not a plane.';
      case 'face': return faceAt && (want === 'plane' || want === 'cyl' || want === 'face' || want === 'dir' || want === 'line' || want === 'circle') ? { face: faceAt } : 'Pick ' + refWantText(want) + ', not a face.';
      case 'edge': { var e = pk.edge, at = r4(pk.point || (e && e.mid) || [0, 0, 0]); return want === 'line' || want === 'circle' || want === 'curve' || want === 'dir' || want === 'point' ? { edge: at } : 'Pick ' + refWantText(want) + ', not an edge.'; }
      case 'vertex': return want === 'point' ? { vertex: r4(pk.point) } : 'Pick ' + refWantText(want) + ', not a vertex.';
      case 'refgeo':
        if (pk.refgeo === 'axis') return want === 'line' || want === 'dir' || want === 'curve' ? { axis: pk.id } : 'Pick ' + refWantText(want) + ', not an axis.';
        if (pk.refgeo === 'point') return want === 'point' ? { point: pk.id } : 'Pick ' + refWantText(want) + ', not a point.';
        if (pk.refgeo === 'csys') return want === 'point' ? { point: pk.id } : want === 'plane' || want === 'dir' ? { plane: pk.id } : 'Pick ' + refWantText(want) + ', not a coordinate system.';
        break;
      case 'sketchEntity': {
        var r = { sketch: pk.sketch, entity: pk.index };
        if (pk.end) r.end = pk.end;
        if (pk.pt != null) r.pt = pk.pt;
        if (pk.seg != null) {   // a side of a rectangle / polygon / polyline is a line
          if (want === 'line' || want === 'dir' || want === 'curve') return { sketch: pk.sketch, entity: pk.index, seg: pk.seg };
          return 'Pick ' + refWantText(want) + ', not a sketch line.';
        }
        if (want === 'point') return pk.end || pk.pt != null || pk.t === 'point' ? r : 'Pick a sketch point, a line end or an arc centre.';
        if (want === 'circle') return pk.t === 'arc' || pk.t === 'circle' ? { sketch: pk.sketch, entity: pk.index } : 'Pick a sketch arc or circle.';
        if (want === 'line' || want === 'dir') return pk.t === 'line' && !pk.end ? { sketch: pk.sketch, entity: pk.index } : 'Pick a sketch line.';
        if (want === 'curve') return (pk.t === 'line' || pk.t === 'arc' || pk.t === 'circle') && !pk.end ? { sketch: pk.sketch, entity: pk.index } : 'Pick a sketch line or arc.';
        return 'Pick ' + refWantText(want) + ', not a sketch entity.';
      }
    }
    return 'Pick ' + refWantText(want) + '.';
  }
  function refWantText(want) {
    return { line: 'a straight edge, sketch line or axis', plane: 'a plane or planar face', point: 'a vertex, point or sketch point', cyl: 'a cylindrical or conical face', circle: 'a circular edge or sketch arc', face: 'a face', curve: 'an edge or sketch line / arc', dir: 'an edge, axis, face or plane' }[want] || 'an entity';
  }
  // the PropertyManager's name for a ref
  function refLabel(r) {
    if (!r) return '';
    var fname = function (id) { var g = K.findFeature(App.model, id); return g ? g.name : 'Feature ' + id; };
    if (r.plane != null) return typeof r.plane === 'string' ? r.plane + ' Plane' : fname(r.plane);
    if (r.axis != null) return typeof r.axis === 'string' ? r.axis.toUpperCase() + ' axis' : fname(r.axis);
    if (r.point != null) return r.point === 'origin' ? 'Origin' : fname(r.point);
    if (r.sketch != null) {
      var sk = K.findFeature(App.model, r.sketch), e = sk && r.entity != null ? sk.entities[r.entity] : null;
      if (r.entity == null) return sk ? sk.name : 'Sketch';
      var nm = e ? { line: 'Line', arc: 'Arc', circle: 'Circle', point: 'Point' }[e.t] || 'Entity' : 'Entity';
      if (e && r.seg != null) nm = 'Side ' + (r.seg + 1) + ' of ' + ({ rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', polyline: 'Polyline' }[e.t] || 'Entity');
      if (e && r.pt != null) nm = 'Corner ' + (r.pt + 1) + ' of ' + ({ rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', polyline: 'Polyline' }[e.t] || 'Entity');
      return (r.end === 'c' ? 'Center of ' : r.end ? 'End of ' : '') + nm + (r.seg != null || r.pt != null ? ' ' : '') + (r.entity + 1) + '@' + (sk ? sk.name : 'Sketch');
    }
    var p = r.face || r.edge || r.vertex;
    if (p) return (r.face ? 'Face' : r.edge ? 'Edge' : 'Vertex') + ' at (' + p.map(function (x) { return UI.fmtNum(x, 3); }).join(', ') + ')';
    return '?';
  }
  // the build of the features before `id` (the part as the feature sees it), or the current build for a new one
  function refBuildBefore(id) {
    var idx = -1;
    if (id != null) App.model.features.forEach(function (g, i) { if (g.id === id) idx = i; });
    if (idx < 0) return App.build;
    var m = JSON.parse(JSON.stringify(App.model));
    m.features = m.features.slice(0, idx);
    try { return K.rebuild(m); } catch (e) { return App.build; }
  }
  function cmdRefGeo(type, existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var T = REF_TYPES[type], isCsys = type === 'csys';
    var f = existing ? JSON.parse(JSON.stringify(existing)) : isCsys ? { type: 'csys' } : { type: type, kind: T.kinds[0][0], refs: [] };
    if (!isCsys && !Array.isArray(f.refs)) f.refs = [];
    if (type === 'refpoint' && f.distance == null) f.distance = f.percent ? 50 : UI.lenDefault(10);
    var before = refBuildBefore(existing ? existing.id : null), st = { slot: 0 };
    function slots(v) {
      if (isCsys) return CSYS_SLOTS.map(function (s) { return { key: s[0], want: s[1], label: s[2] }; });
      var k = T.kinds.filter(function (x) { return x[0] === v.kind; })[0] || T.kinds[0];
      return k[2].map(function (s, i) { return { key: i, want: s[0], label: s[1] }; });
    }
    function getRef(v, key) { return isCsys ? v[key] : v.refs[key]; }
    function setRef(v, key, r) { if (isCsys) { if (r) v[key] = r; else delete v[key]; } else v.refs[key] = r || null; }
    function toFeature(v) {
      var o = JSON.parse(JSON.stringify(v));
      if (!isCsys) {
        o.refs = o.refs.slice(0, slots(o).length).filter(Boolean);
        if (o.type !== 'refpoint' || o.kind !== 'along') { delete o.distance; delete o.percent; delete o.reverse; }
        else { o.distance = +o.distance || 0; if (!o.percent) delete o.percent; if (!o.reverse) delete o.reverse; }
      } else ['flipX', 'flipY', 'flipZ'].forEach(function (k) { if (!o[k]) delete o[k]; });
      if (!o.name) delete o.name;
      return o;
    }
    function resolveNow(v) {
      var ctx = { planes: (before && before.planes) || {}, sketches: {}, body: before ? before.body : null, units: App.model.units || 'mm' };
      return K.resolveRefGeo(toFeature(v), K.resolvedModel ? K.resolvedModel(App.model).model : App.model, ctx);
    }
    function preview(v) {
      UI.disposeGroup(UI.groups.preview);
      try {
        var rec = resolveNow(v);
        UI.drawRefGeo(rec, UI.groups.preview, 'sel');
        var txt = rec.refgeo === 'axis' ? 'axis through (' + rec.o.map(function (x) { return UI.fmtNum(x, 3); }).join(', ') + ') along (' + rec.d.map(function (x) { return UI.fmtNum(x, 3); }).join(', ') + ')'
          : rec.refgeo === 'point' ? 'point at (' + rec.p.map(function (x) { return UI.fmtNum(x, 3); }).join(', ') + ')'
          : 'origin at (' + rec.origin.map(function (x) { return UI.fmtNum(x, 3); }).join(', ') + ')';
        UI.setStatus((existing ? existing.name : isCsys ? 'Coordinate System' : T.title) + ' preview: ' + txt + '. Press Enter or ✓ to accept.');
        st.err = null;
      } catch (e) { st.err = e.message; UI.setStatus('Preview: ' + e.message); }
      UI.requestRender();
    }
    function onPick(pk) {
      var S = slots(f), s = S[Math.min(st.slot, S.length - 1)];
      if (!s) return false;
      var r = refFromPick(pk, s.want);
      if (typeof r === 'string') { UI.setStatus(r); UI.toast(r); return true; }
      setRef(f, s.key, r);
      // the next empty box after this one (then from the top) takes the next pick; all filled: this one stays active
      var idx = S.indexOf(s), nxt = -1, i;
      for (i = idx + 1; i < S.length && nxt < 0; i++) if (!getRef(f, S[i].key)) nxt = i;
      for (i = 0; i < idx && nxt < 0; i++) if (!getRef(f, S[i].key)) nxt = i;
      st.slot = nxt >= 0 ? nxt : idx;
      renderPM(); preview(f);
      return true;
    }
    // a vertex is offered only to a box that takes a point (else the chord vertices of a hole edge would win over it)
    function activeWant() { var S = slots(f), s = S[Math.min(st.slot, S.length - 1)]; return s ? s.want : null; }
    var command = { pickRefGeo: true, pickEdges: true, pickPlane: true, pickVertices: function () { return activeWant() === 'point'; }, pickSketchRefs: true, onPick: onPick };
    var fields = [];
    if (!isCsys) fields.push({ type: 'radio', key: 'kind', options: T.kinds.map(function (k) { return [k[0], k[1]]; }), rerender: true });
    var groups = [];
    if (!isCsys) {
      groups.push({ title: 'Selections', fields: fields });
      var refFields = [];
      T.kinds.forEach(function (k) {
        k[2].forEach(function (sl, i) {
          refFields.push({ type: 'pick', icon: sl[0] === 'plane' ? 'plane' : T.icon, placeholder: sl[1], show: function (v) { return v.kind === k[0]; },
            value: function (v) { return refLabel(v.refs[i]); }, active: function () { return st.slot === i; }, onActivate: function () { st.slot = i; renderPM(); } });
        });
      });
      groups.push({ title: 'References', fields: refFields });
      if (type === 'refpoint') groups.push({ title: 'Along Curve Distance', show: function (v) { return v.kind === 'along'; }, fields: [
        { type: 'number', label: 'Distance', key: 'distance', unit: 'u', min: 0, show: function (v) { return !v.percent; } },
        { type: 'number', label: 'Percentage', key: 'distance', unit: '%', min: 0, max: 100, show: function (v) { return !!v.percent; } },
        { type: 'check', label: 'Percentage', key: 'percent', rerender: true },
        { type: 'check', label: 'Reverse direction', key: 'reverse' }] });
    } else {
      groups.push({ title: 'Selections', fields: CSYS_SLOTS.map(function (s, i) {
        var pf = { type: 'pick', icon: i === 0 ? 'refPoint' : 'refAxis', placeholder: s[2], value: function (v) { return refLabel(v[s[0]]); }, active: function () { return st.slot === i; }, onActivate: function () { st.slot = i; renderPM(); } };
        return pf;
      }).concat([{ type: 'check', label: 'Flip X', key: 'flipX' }, { type: 'check', label: 'Flip Y', key: 'flipY' }, { type: 'check', label: 'Flip Z', key: 'flipZ' }]) });
    }
    groups.push({ title: 'Clear', collapsed: false, fields: [{ type: 'buttons', buttons: [{ label: 'Clear selections', onclick: function (v) { if (isCsys) ['origin', 'x', 'y', 'z'].forEach(function (k) { delete v[k]; }); else v.refs = []; st.slot = 0; renderPM(); preview(v); } }] }] });
    groups.push({ title: 'Feature', collapsed: !existing, fields: [{ type: 'text', label: 'Name', key: 'name' }] });
    var spec = {
      title: existing ? existing.name : isCsys ? 'Coordinate System' : T.title, icon: isCsys ? 'csys' : T.icon, values: f, command: command, groups: groups,
      message: isCsys ? 'Pick the <b>origin</b>, then any two of the <b>X / Y / Z</b> directions (edges, axes, faces or planes); the third follows. With none, the system is the part origin and axes.'
        : 'Pick the references in the graphics area: the highlighted box takes the next pick.',
      onChange: function (v, key) { if (key === 'kind') { v.refs = []; st.slot = 0; } preview(v); },
      okBlocked: function (v) { return isCsys ? null : slots(v).every(function (s) { return getRef(v, s.key); }) ? null : 'Select ' + slots(v).map(function (s) { return s.label.toLowerCase(); }).join(' and ') + '.'; },
      onOK: function (v) {
        if (st.err) { UI.toast(st.err); return false; }
        return commitFeature(toFeature(v), existing);
      },
      onClose: function () { UI.disposeGroup(UI.groups.preview); }
    };
    openPM(spec);
    // SolidWorks: what was selected before the command fills its boxes
    var pre = (UI.selection ? UI.selection() : [App.sel]).filter(Boolean);
    if (!existing && pre.length) {
      // the type follows what was selected, as in SolidWorks (two planes / faces: Two Planes; a face: its axis; …)
      var kindsOf = pre.map(function (pk) { return pk.kind === 'feature' && pk.refgeo ? pk.refgeo : pk.kind; }).join(',');
      var auto = type === 'refaxis' ? { 'face,face': 'planes', 'plane,plane': 'planes', 'face,plane': 'planes', 'plane,face': 'planes', face: 'cyl', edge: 'line', axis: 'line', 'vertex,vertex': 'points', 'point,point': 'points', 'vertex,point': 'points', 'point,vertex': 'points', 'vertex,face': 'pointFace', 'point,face': 'pointFace', 'vertex,plane': 'pointFace', 'point,plane': 'pointFace' }[kindsOf]
        : type === 'refpoint' ? { edge: 'arc', face: 'face', vertex: 'on', point: 'on', 'edge,edge': 'intersect', 'axis,axis': 'intersect', 'edge,axis': 'intersect', 'axis,edge': 'intersect', 'vertex,face': 'project', 'point,face': 'project', 'vertex,plane': 'project', 'point,plane': 'project' }[kindsOf] : null;
      if (auto) { f.kind = auto; renderPM(); }
      pre.forEach(function (pk) { if (App.command && App.command.onPick === onPick) onPick(pk); });
      if (UI.setSelection) UI.setSelection([], { quiet: true });
    }
    preview(f);
  }
  // the resolved reference axis a Revolve / Circular Pattern value set turns about, or null
  function refAxisRec(v) { var id = K.refAxisId(v), g = id != null && App.build && App.build.planes ? App.build.planes[id] : null; return g && g.refgeo === 'axis' ? g : null; }
  // refUses(g, id): feature g turns about reference axis id, or one of its reference-geometry refs names feature id
  function refUses(g, id) {
    if (g.id === id) return false;
    if (K.refAxisId(g) === id) return true;
    var refs = (g.refs || []).concat([g.origin, g.x, g.y, g.z]).filter(function (r) { return r && typeof r === 'object'; });
    if (g.type !== 'refaxis' && g.type !== 'refpoint' && g.type !== 'csys') return false;
    return refs.some(function (r) { return r.plane === id || r.axis === id || r.point === id || r.sketch === id; });
  }
  UI.refUses = refUses;
  function cmdRefAxis(existing) { cmdRefGeo('refaxis', existing); }
  function cmdRefPoint(existing) { cmdRefGeo('refpoint', existing); }
  function cmdCsys(existing) { cmdRefGeo('csys', existing); }
  // ref-axis options for a Revolve / Circular Pattern axis list: ['ref:<id>', 'Axis1'] for every axis before `beforeId`
  function refAxisOptions(beforeId) {
    var out = [];
    for (var i = 0; i < App.model.features.length; i++) {
      var g = App.model.features[i];
      if (beforeId != null && g.id === beforeId) break;
      if (g.type === 'refaxis') out.push(['ref:' + g.id, g.name]);
    }
    return out;
  }
  // a feature's axis select value <-> axisRef: the list shows 'ref:<id>'; the feature stores axisRef (and keeps axis)
  function axisRefIn(f) { if (f.axisRef != null) f.axis = 'ref:' + f.axisRef; }
  function axisRefOut(v, dflt) {
    var m = typeof v.axis === 'string' ? /^ref:(\d+)$/.exec(v.axis) : null;
    if (m) { v.axisRef = +m[1]; v.axis = dflt; } else delete v.axisRef;
    return v;
  }
  // a click on a reference axis while a Revolve / Circular Pattern PropertyManager is open makes it the axis
  function refAxisCommand(v, base) {
    var c = Object.assign({}, base || {}), inner = c.onPick;
    c.pickRefGeo = true; c.refKinds = ['axis'];
    c.onPick = function (pk) {
      if (pk && pk.kind === 'refgeo' && pk.refgeo === 'axis') {
        v.axis = 'ref:' + pk.id; renderPM();
        var sp = UI.pmSpec && UI.pmSpec();
        if (sp && sp.onChange) sp.onChange(v, 'axis');
        return true;
      }
      return inner ? inner(pk) : false;
    };
    return c;
  }

  // ------------------------------------------------------------------ hole wizard (simple hole)
  function cmdHole() {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var v = { dia: UI.lenDefault(6.6), end: 'through', depth: UI.lenDefault(10), face: null, u: 0, vv: 0 };
    openPM({
      title: 'Hole Wizard', icon: 'hole', values: v,
      message: 'Click a <b>planar face</b> to place the hole, then set the size.',
      command: {
        onPick: function (pk) {
          if (pk.kind !== 'face') return false;
          var face = App.mesh.faces[pk.index];
          var plane = facePlane(face, pk.point);
          var uv = K.to2D(plane, pk.point);
          v.face = plane; v.u = Math.round(uv[0] * 100) / 100; v.vv = Math.round(uv[1] * 100) / 100;
          pm.spec.message = 'Hole on face ' + pk.index + ' at (' + UI.fmtNum(uv[0], 2) + ', ' + UI.fmtNum(uv[1], 2) + '). Adjust and accept.';
          pm.spec.messageOk = true;
          renderPM();
          preview();
          return true;
        }
      },
      groups: [
        { title: 'Hole Specification', fields: [{ type: 'number', label: 'Diameter', key: 'dia', unit: 'u', min: 0 }, { type: 'select', label: 'End condition', key: 'end', options: [['through', 'Through All'], ['blind', 'Blind']], rerender: true }, { type: 'number', label: 'Depth', key: 'depth', unit: 'u', show: function (x) { return x.end === 'blind'; } }] },
        { title: 'Position', fields: [{ type: 'number', label: 'X on face', key: 'u', unit: 'u' }, { type: 'number', label: 'Y on face', key: 'vv', unit: 'u' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (x) {
        if (!x.face) { UI.toast('Click a face to place the hole first.'); return false; }
        UI.pushUndo();
        var s = { id: App.model.nextId++, type: 'sketch', plane: x.face, entities: [{ t: 'circle', cx: +x.u, cy: +x.vv, r: x.dia / 2 }] };
        s.name = K.featureName(App.model, 'sketch');
        App.model.features.push(s);
        var c = { id: App.model.nextId++, type: 'extrude', cut: true, sketch: s.id, depth: x.end === 'blind' ? +x.depth : 0, end: x.end, reverse: true, dir2: false, depth2: 0, end2: 'blind' };
        c.name = 'Hole' + (App.model.features.filter(function (q) { return /^Hole\d+$/.test(q.name || ''); }).length + 1);
        App.model.features.push(c);
        return UI.afterRebuild(UI.rebuild(), function () { App.sel = { kind: 'feature', id: c.id }; UI.updateHighlights(); UI.refreshTree(); });
      }
    });
    function preview() {
      if (!v.face) return;
      var tmp = { type: 'extrude', cut: true, sketch: -999, depth: v.end === 'blind' ? +v.depth : 0, end: v.end, reverse: true };
      var sk = { id: -999, type: 'sketch', plane: v.face, entities: [{ t: 'circle', cx: +v.u, cy: +v.vv, r: v.dia / 2 }] };
      UI.disposeGroup(UI.groups.preview);
      try {
        var tool = K.buildTool(tmp, App.model, { tools: {}, planes: App.build.planes, sketches: { '-999': sk }, body: null });
        var mesh = K.meshFromBody(tool), g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(UI.analyticNormals(mesh), 3));
        UI.groups.preview.add(new THREE.Mesh(g, UI.mats.previewCut));
      } catch (e) { }
    }
  }

  // ------------------------------------------------------------------ sheet metal: parameters (SolidWorks' Sheet-Metal PropertyManager groups)
  // The Base Flange/Tab PropertyManager (a new part) and Sheet Metal (UI.cmdSheetMetal: edit model.sheet of a part that
  // has one) share these groups: Sheet Metal Gauges (Use gauge table), Sheet Metal Parameters (T, R), Bend Allowance
  // (Bend Table / K-Factor / Bend Allowance / Bend Deduction with its value, the bend table grid). PM keys: thickness,
  // bendRadius, kFactor, baType, bendAllowance, bendDeduction, bendTable, useGauge, gaugeTable (a built-in table's name
  // or '__custom'), customGauge (the part's own gauge table), gauge.
  var BA_OPTIONS = [['table', 'Bend Table'], ['kfactor', 'K-Factor'], ['allowance', 'Bend Allowance'], ['deduction', 'Bend Deduction']];
  var BA_NAMES = { table: 'Bend Table', kfactor: 'K-Factor', allowance: 'Bend Allowance', deduction: 'Bend Deduction' };
  var SHEET_PM_KEYS = ['thickness', 'bendRadius', 'kFactor', 'baType', 'bendAllowance', 'bendDeduction', 'bendTable', 'useGauge', 'gaugeTable', 'customGauge', 'gauge', 'autoRelief', 'reliefRatio', 'overrideThickness', 'overrideRadius', 'gaugeRadius'];
  var EXAMPLE_NOTE = 'example — replace with your shop\'s values';
  // a new part's sheet: 2 mm (or 3/32 in) thick, R = T, K = 0.5
  // lane CS: and SolidWorks' default Auto Relief, Rectangular, ratio 0.5 (a part's saved sheet keeps what it has)
  function defaultSheet() { var t = UI.lenDefault(2); return { thickness: t, bendRadius: t, kFactor: K.DEFAULT_K_FACTOR, relief: 'rect', reliefRatio: K.AUTO_RELIEF_RATIO }; }
  function sheetToValues(sm, v) {
    v = v || {};
    v.thickness = sm.thickness; v.bendRadius = sm.bendRadius != null ? sm.bendRadius : sm.thickness;
    v.kFactor = sm.kFactor != null && sm.kFactor !== '' ? sm.kFactor : K.LEGACY_K_FACTOR;
    v.baType = sm.bendAllowanceType || 'kfactor';
    var T = +sm.thickness || 0, R = +v.bendRadius || 0;
    v.bendAllowance = sm.bendAllowance != null ? sm.bendAllowance : Math.round(K.bendAllowance(Math.PI / 2, R, T, +v.kFactor || K.DEFAULT_K_FACTOR) * 1e4) / 1e4;
    v.bendDeduction = sm.bendDeduction != null ? sm.bendDeduction : Math.round(K.bendDeduction(Math.PI / 2, R, T, K.bendAllowance(Math.PI / 2, R, T, +v.kFactor || K.DEFAULT_K_FACTOR)) * 1e4) / 1e4;
    v.bendTable = sm.bendTable ? JSON.parse(JSON.stringify(sm.bendTable)) : null;
    v.useGauge = sm.gauge != null;
    v.customGauge = sm.gaugeTable && typeof sm.gaugeTable === 'object' ? JSON.parse(JSON.stringify(sm.gaugeTable)) : null;
    v.gaugeTable = v.customGauge ? '__custom' : (typeof sm.gaugeTable === 'string' && K.gaugeTables[sm.gaugeTable] ? sm.gaugeTable : K.DEFAULT_GAUGE_TABLE);
    v.gauge = sm.gauge != null ? String(sm.gauge) : '16';
    v.autoRelief = sm.relief === 'rect' || sm.relief === 'obround' ? sm.relief : 'none';
    v.reliefRatio = sm.reliefRatio != null ? sm.reliefRatio : K.AUTO_RELIEF_RATIO;
    // rfIU: SolidWorks' Override thickness / Override radius (UI only): on when the part's value is not the table's
    // (an equation, or a number no row of the gauge has)
    var rows = v.useGauge ? gaugeChoices(v) : [];
    v.overrideThickness = !!(v.useGauge && rows.length && !rows.some(function (r) { return typeof sm.thickness === 'number' && Math.abs(r.thickness - sm.thickness) < 1e-9; }));
    v.overrideRadius = !!(v.useGauge && rows.length && !rows.some(function (r) { return typeof v.bendRadius === 'number' && Math.abs(r.radius - v.bendRadius) < 1e-9; }));
    var at = -1;
    rows.forEach(function (r, i) { if (at < 0 && typeof v.bendRadius === 'number' && Math.abs(r.radius - v.bendRadius) < 1e-9) at = i; });
    v.gaugeRadius = String(Math.max(0, at));
    return v;
  }
  function gaugeRef(v) { return v.gaugeTable === '__custom' ? v.customGauge : v.gaugeTable; }
  // rfIU: every row of the table for the chosen gauge, in the part's units (a SolidWorks gauge table offers several
  // bend radii per gauge: the Bend radius list)
  function gaugeChoices(v) {
    var t = K.gaugeTable(gaugeRef(v));
    if (!t) return [];
    var g = String(v.gauge), u = App.model.units === 'in' ? 'in' : 'mm', k = (t.units || 'in') === u ? 1 : (t.units === 'in' || !t.units ? 25.4 : 1 / 25.4);
    return (t.rows || []).filter(function (r) { return String(r.gauge) === g; }).map(function (r) {
      var o = { gauge: String(r.gauge), thickness: +r.thickness * k, radius: (r.radius != null ? +r.radius : +r.thickness) * k };
      if (r.bendDeduction != null) o.bendDeduction = +r.bendDeduction * k; else o.kFactor = r.kFactor != null ? +r.kFactor : K.DEFAULT_K_FACTOR;
      return o;
    });
  }
  function gaugeRadiusOptions(v) {
    return gaugeChoices(v).map(function (r, i) { return [String(i), UI.fmtNum(r.radius, 4) + ' ' + UI.unitLabel() + (r.bendDeduction != null ? ' (BD ' + UI.fmtNum(r.bendDeduction, 4) + ')' : ' (K ' + UI.fmtNum(r.kFactor, 3) + ')')]; });
  }
  // model.sheet from the PM values; `exprs` keeps equation fields as their text (on ✓), else the evaluated numbers
  function sheetFromValues(v, exprs) {
    function val(k) { return exprs ? pmExpr(k, +v[k]) : +v[k]; }
    return K.makeSheet({ thickness: val('thickness'), bendRadius: val('bendRadius'), kFactor: val('kFactor'), bendAllowanceType: v.baType,
      bendAllowance: val('bendAllowance'), bendDeduction: val('bendDeduction'), bendTable: v.bendTable,
      gaugeTable: v.useGauge ? gaugeRef(v) : null, gauge: v.useGauge ? v.gauge : null,
      relief: v.autoRelief || 'none', reliefRatio: v.autoRelief && v.autoRelief !== 'none' ? +v.reliefRatio : null });
  }
  // a gauge pick fills T, R and K (or BD) from the table's row
  // rfIU: Override thickness / Override radius keep the typed value; a gauge with several radii takes the one picked
  // in the Bend radius list (v.gaugeRadius, an index into gaugeChoices)
  function applyGauge(v) {
    var row = K.gaugeRow(gaugeRef(v), v.gauge, App.model.units);
    if (!row) return false;
    var rows = gaugeChoices(v), pick = rows[+v.gaugeRadius || 0];
    if (pick && pick.gauge === row.gauge) row = pick; else v.gaugeRadius = '0';
    ['thickness', 'bendRadius', 'kFactor', 'bendDeduction'].forEach(function (k) {
      if ((k === 'thickness' && v.overrideThickness) || (k === 'bendRadius' && v.overrideRadius)) return;
      if (pm.exprs) { delete pm.exprs[k]; delete pm.exprErrors[k]; }
    });
    if (!v.overrideThickness) v.thickness = Math.round(row.thickness * 1e6) / 1e6;
    if (!v.overrideRadius) v.bendRadius = Math.round(row.radius * 1e6) / 1e6;
    if (row.bendDeduction != null) { v.bendDeduction = Math.round(row.bendDeduction * 1e6) / 1e6; v.baType = 'deduction'; }
    else { v.kFactor = row.kFactor; if (v.baType !== 'table') v.baType = 'kfactor'; }
    return true;
  }
  // a gauge-table control changed: fill the values from the table (true = the PM must be redrawn)
  function gaugeChanged(v, key) {
    if (!v.useGauge) return key === 'useGauge';
    if (key === 'gauge' || key === 'gaugeTable') v.gaugeRadius = '0';
    if (key === 'useGauge' || key === 'gaugeTable' || key === 'gauge' || key === 'gaugeRadius' || key === 'overrideThickness' || key === 'overrideRadius') { applyGauge(v); return true; }
    return false;
  }
  function gaugeOptions(v) {
    var t = K.gaugeTable(gaugeRef(v)), u = UI.unitLabel(), k = (t && t.units || 'in') === u ? 1 : (u === 'mm' ? 25.4 : 1 / 25.4);
    return t ? t.rows.map(function (r) { return [String(r.gauge), r.gauge + ' ga — ' + UI.fmtNum(r.thickness * k, 4) + ' ' + u]; }) : [];
  }
  function gaugeTableOptions(v) {
    var o = Object.keys(K.gaugeTables).map(function (n) { return [n, n]; });
    if (v.customGauge) o.push(['__custom', v.customGauge.name || 'Shop gauge table']);
    return o;
  }
  // a table of inputs in a dialog: columns [{ key, label, type: 'number' | 'text' }], rows [{...}]; the dialog's own
  // controls go in `head`; onOK(rows) gets the edited rows (blank rows dropped). Text pasted from a spreadsheet (tab,
  // comma or space separated, one row per line, in column order) is added with the Paste button.
  // DOM: #<id> wrapper, table.grid-table, tr.grid-row with input[data-col], .grid-del; #<id>-add, #<id>-paste (textarea),
  // #<id>-paste-add; modal buttons #<id>-ok, #<id>-cancel.
  function gridDialog(o) {
    var rows = (o.rows || []).map(function (r) { var c = {}; o.columns.forEach(function (col) { c[col.key] = r[col.key]; }); return c; });
    var wrap = el('div', { id: o.id, class: 'grid-dialog' });
    if (o.head) wrap.appendChild(o.head);
    var table = el('table', { class: 'grid-table eq-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, o.columns.map(function (c) { return el('th', { text: c.label }); }).concat([el('th', { text: '' })]))]));
    var tbody = el('tbody');
    table.appendChild(tbody);
    function render() {
      tbody.innerHTML = '';
      rows.forEach(function (r, i) {
        var tr = el('tr', { class: 'grid-row', 'data-index': String(i) });
        o.columns.forEach(function (c) {
          var inp = el('input', { type: c.type === 'text' ? 'text' : 'number', step: 'any', 'data-col': c.key, value: r[c.key] == null ? '' : r[c.key] });
          inp.addEventListener('input', function () { r[c.key] = c.type === 'text' ? inp.value : (inp.value === '' ? null : parseFloat(inp.value)); });
          inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
          tr.appendChild(el('td', {}, [inp]));
        });
        tr.appendChild(el('td', {}, [el('button', { class: 'btn grid-del', text: '✕', title: 'Delete row', onclick: function () { rows.splice(i, 1); render(); } })]));
        tbody.appendChild(tr);
      });
    }
    render();
    wrap.appendChild(el('div', { style: 'max-height:46vh;overflow:auto' }, [table]));
    wrap.appendChild(el('div', { class: 'row' }, [el('button', { id: o.id + '-add', class: 'btn', text: '+ Add row', onclick: function () { var c = {}; o.columns.forEach(function (col) { c[col.key] = rows.length ? rows[rows.length - 1][col.key] : null; }); rows.push(c); render(); } })]));
    var paste = el('textarea', { id: o.id + '-paste', rows: '3', placeholder: 'Paste rows from a spreadsheet: ' + o.columns.map(function (c) { return c.label; }).join(', ') + ' per line', style: 'width:100%' });
    paste.addEventListener('keydown', function (e) { e.stopPropagation(); });
    wrap.appendChild(paste);
    wrap.appendChild(el('div', { class: 'row' }, [el('button', { id: o.id + '-paste-add', class: 'btn', text: 'Add pasted rows', onclick: function () {
      String(paste.value).split(/\r?\n/).forEach(function (line) {
        var cells = line.trim().split(/\t|,|;|\s+/).filter(function (x) { return x !== ''; });
        if (cells.length < o.columns.length) return;
        var c = {}, ok = true;
        o.columns.forEach(function (col, j) { var x = cells[j]; if (col.type === 'text') c[col.key] = x; else { c[col.key] = parseFloat(x); if (!isFinite(c[col.key])) ok = false; } });
        if (ok) rows.push(c);
      });
      paste.value = ''; render();
    } })]));
    if (o.note) wrap.appendChild(el('p', { html: '<small>' + o.note + '</small>' }));
    UI.showModal({ title: o.title, body: wrap, buttons: [
      { label: 'OK', primary: true, id: o.id + '-ok', action: function () {
        var out = rows.filter(function (r) { return o.columns.every(function (c) { return c.type === 'text' ? String(r[c.key] == null ? '' : r[c.key]).trim() !== '' : isFinite(r[c.key]) && r[c.key] != null; }); });
        UI.closeModal(); o.onOK(out);
      } },
      { label: 'Cancel', id: o.id + '-cancel', action: UI.closeModal }
    ] });
    $('modal-card').classList.add('wide');
  }
  // Bend Table: rows thickness × radius × angle → BA or BD (SolidWorks bend table), saved in the part (model.sheet.bendTable)
  function editBendTable(v) {
    var t = v.bendTable || { kind: 'BD', rows: [] };
    var kindSel = el('select', { id: 'bt-kind' }, [el('option', { value: 'BD', text: 'Bend Deduction (BD)' }), el('option', { value: 'BA', text: 'Bend Allowance (BA)' })]);
    kindSel.value = t.kind === 'BA' ? 'BA' : 'BD';
    var name = el('input', { id: 'bt-name', type: 'text', value: t.name || '', placeholder: 'e.g. Press brake 1, mild steel' });
    name.addEventListener('keydown', function (e) { e.stopPropagation(); });
    var head = el('div', { class: 'kv' }, [el('span', { text: 'Values are' }), kindSel, el('span', { text: 'Table name' }), name]);
    gridDialog({ id: 'bt-dialog', title: 'Bend Table', head: head, rows: t.rows,
      columns: [{ key: 'thickness', label: 'Thickness (' + UI.unitLabel() + ')' }, { key: 'radius', label: 'Radius (' + UI.unitLabel() + ')' }, { key: 'angle', label: 'Angle (°)' }, { key: 'value', label: 'Value (' + UI.unitLabel() + ')' }],
      note: 'A bend uses the rows whose thickness and inside radius match it (within 0.5 %); between two angles the value is interpolated. A bend the table does not cover falls back to the K-factor, with a warning on the flat pattern. Angles are bend angles (90° for an L).',
      onOK: function (rows) {
        v.bendTable = { kind: kindSel.value, rows: rows.map(function (r) { return { thickness: +r.thickness, radius: +r.radius, angle: +r.angle, value: +r.value }; }) };
        if (name.value.trim()) v.bendTable.name = name.value.trim();
        if (!v.bendTable.rows.length) v.bendTable = null;
        renderPM(); if (pm.spec && pm.spec.onChange) pm.spec.onChange(v, 'bendTable');
      } });
  }
  // the part's own gauge table, started from the selected one (SolidWorks' gauge table file)
  function editGaugeTable(v) {
    var t = K.gaugeTable(gaugeRef(v)) || { units: 'in', rows: [] };
    var name = el('input', { id: 'gt-name', type: 'text', value: v.customGauge ? v.customGauge.name || '' : 'Shop — ' + (t.name || 'gauges') });
    name.addEventListener('keydown', function (e) { e.stopPropagation(); });
    var u = t.units || 'in';
    gridDialog({ id: 'gt-dialog', title: 'Gauge Table', head: el('div', { class: 'kv' }, [el('span', { text: 'Table name' }), name]), rows: t.rows,
      columns: [{ key: 'gauge', label: 'Gauge', type: 'text' }, { key: 'thickness', label: 'Thickness (' + u + ')' }, { key: 'radius', label: 'Bend radius (' + u + ')' }, { key: 'kFactor', label: 'K-factor' }],
      note: (t.example ? 'The radius and K-factor columns of the shipped tables are an <b>' + EXAMPLE_NOTE + '</b>. ' : '') + 'The table is saved in this part.',
      onOK: function (rows) {
        v.customGauge = { name: name.value.trim() || 'Shop gauge table', units: u, rows: rows.map(function (r) { return { gauge: String(r.gauge).trim(), thickness: +r.thickness, radius: +r.radius, kFactor: +r.kFactor }; }) };
        v.gaugeTable = '__custom'; v.useGauge = true;
        if (!K.gaugeRow(v.customGauge, v.gauge, App.model.units) && v.customGauge.rows.length) v.gauge = v.customGauge.rows[0].gauge;
        applyGauge(v);
        renderPM(); if (pm.spec && pm.spec.onChange) pm.spec.onChange(v, 'gauge');
      } });
  }
  function bendTableSummary(v) {
    var t = v.bendTable;
    if (!t || !t.rows.length) return 'No rows — edit the table';
    return (t.name ? t.name + ': ' : '') + t.rows.length + ' row' + (t.rows.length === 1 ? '' : 's') + ' of ' + (t.kind === 'BA' ? 'bend allowance' : 'bend deduction');
  }
  // the groups both PropertyManagers show
  function sheetGroups(extra) {
    var isBuiltIn = function (v) { return v.gaugeTable !== '__custom'; };
    return [
      { title: 'Sheet Metal Gauges', optional: true, fields: [
        { type: 'check', label: 'Use gauge table', key: 'useGauge', rerender: true },
        { type: 'select', label: 'Table', key: 'gaugeTable', options: gaugeTableOptions, rerender: true, show: function (v) { return v.useGauge; } },
        { type: 'select', label: 'Gauge', key: 'gauge', options: gaugeOptions, rerender: true, show: function (v) { return v.useGauge; } },
        { type: 'html', html: '<div class="pm-note" style="margin:2px 0 4px">Thicknesses are the published standard gauges; the bend radius and K-factor in this table are an <b>' + EXAMPLE_NOTE + '</b>.</div>', show: function (v) { return v.useGauge && isBuiltIn(v); } },
        { type: 'buttons', show: function (v) { return v.useGauge; }, buttons: [{ label: 'Edit gauge table…', onclick: editGaugeTable }] }
      ] },
      // rfIU: SolidWorks' order (Thickness, Reverse direction, Bend radius); with a gauge table the thickness and radius
      // come from the table and are locked unless Override thickness / Override radius is checked; a gauge with
      // several radii in the table offers them in a list
      { title: 'Sheet Metal Parameters', fields: [
        { type: 'check', label: 'Override thickness', key: 'overrideThickness', rerender: true, show: function (v) { return v.useGauge; } },
        { type: 'number', label: 'Thickness  T', key: 'thickness', unit: 'u', min: 0, disabled: function (v) { return v.useGauge && !v.overrideThickness; } }
      ].concat(extra || [], [
        { type: 'select', label: 'Table bend radius', key: 'gaugeRadius', options: gaugeRadiusOptions, rerender: true, show: function (v) { return v.useGauge && !v.overrideRadius && gaugeChoices(v).length > 1; } },
        { type: 'check', label: 'Override radius', key: 'overrideRadius', rerender: true, show: function (v) { return v.useGauge; } },
        { type: 'number', label: 'Bend radius', key: 'bendRadius', unit: 'u', min: 0, disabled: function (v) { return v.useGauge && !v.overrideRadius; } }
      ]) },
      { title: 'Bend Allowance', fields: [
        { type: 'select', label: 'Type', key: 'baType', options: BA_OPTIONS, rerender: true },
        { type: 'number', label: 'K-factor', key: 'kFactor', step: 0.01, min: 0, show: function (v) { return v.baType === 'kfactor' || v.baType === 'table'; } },
        { type: 'number', label: 'Bend allowance', key: 'bendAllowance', unit: 'u', min: 0, show: function (v) { return v.baType === 'allowance'; } },
        { type: 'number', label: 'Bend deduction', key: 'bendDeduction', unit: 'u', show: function (v) { return v.baType === 'deduction'; } },
        { type: 'static', label: 'Bend table', value: bendTableSummary, show: function (v) { return v.baType === 'table'; } },
        { type: 'buttons', show: function (v) { return v.baType === 'table'; }, buttons: [{ label: 'Edit bend table…', onclick: editBendTable }] },
        { type: 'html', html: function (v) {
          if (v.baType === 'kfactor') return '<div class="pm-note" style="margin:2px 0 4px">BA = angle × (R + K·T). K lies between 0 and 0.5 (0.5: neutral axis at mid-thickness). A 90° "material in bend" constant such as 0.71 in BA = 0.71·T + 1.57·R is K = 0.71 / 1.5708 = 0.452.' + (+v.kFactor > 0.5 ? ' <b>K above 0.5 puts the neutral axis outside the sheet.</b>' : '') + '</div>';
          if (v.baType === 'table') return '<div class="pm-note" style="margin:2px 0 4px">Bends the table does not cover use the K-factor above.</div>';
          return '<div class="pm-note" style="margin:2px 0 4px">Applied unchanged to every bend, whatever its angle (as SolidWorks does); flat = A + B − BD with A, B the outside dimensions (to the virtual sharp up to 90°, to the outside tangent beyond). Use a bend table for angle-dependent values.</div>';
        } }
      ] },
      // lane CS: SolidWorks' Auto Relief: the relief every Edge Flange without a Custom Relief Type gets where it stops
      // short of the sheet's end (Tear is not built)
      { title: 'Auto Relief', fields: [
        { type: 'select', label: 'Relief type', key: 'autoRelief', options: [['rect', 'Rectangular'], ['obround', 'Obround'], ['none', 'None']], rerender: true },
        { type: 'number', label: 'Relief ratio', key: 'reliefRatio', step: 0.05, min: 0, show: function (v) { return v.autoRelief !== 'none'; } }
      ] }
    ];
  }
  function smEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function flatSizeText(flat) { return 'Flat size ' + UI.fmtNum(flat.size[0], 4) + ' × ' + UI.fmtNum(flat.size[1], 4) + ' ' + UI.unitLabel(); }
  UI.flatSizeText = flatSizeText;

  // ------------------------------------------------------------------ sheet metal: base flange = thin extrude with sheet parameters
  function cmdBaseFlange() {
    // lane DI: on a part that already has a sheet, Base Flange/Tab makes a Tab (SolidWorks)
    if (App.model.sheet && App.model.features.some(function (q) { return q.sheetBase && !q.cut && !q.suppressed; })) { cmdTab(null); return; }
    withSketch(function (sid) {
      var sm = App.model.sheet || defaultSheet();
      var f = { type: 'extrude', cut: false, depth: sm.thickness, end: 'blind', reverse: false, dir2: false, depth2: 0, end2: 'blind', sketch: pickDefaultSketch(sid) };
      sheetToValues(sm, f);
      if (f.sketch == null) {
        // rfK (SolidWorks): Base Flange/Tab with nothing to use asks for a plane, opens the sketch, and comes back to
        // this PropertyManager when the sketch is exited (an empty sketch is discarded and nothing reopens)
        openPM({
          title: 'Base Flange/Tab', icon: 'flange',
          message: 'Select a <b>plane</b> or a <b>planar face</b> to sketch the flange profile on, then <b>Exit Sketch</b> to size the flange.',
          command: { pickPlane: true, onPick: function (pk) { if (pk.kind === 'plane') newSketchOnPlane(pk.ref); else newSketchOnFace(pk); App.pendingAfterSketch = function () { cmdBaseFlange(); }; return true; } },
          groups: [{ title: 'Standard planes', fields: [{ type: 'buttons', buttons: ['Front', 'Top', 'Right'].map(function (r) { return { label: r + ' Plane', onclick: function () { newSketchOnPlane(r); App.pendingAfterSketch = function () { cmdBaseFlange(); }; } }; }) }] }]
        });
        return;
      }
      if (K.isOpenProfile(K.findFeature(App.model, f.sketch))) { cmdOpenBase(f.sketch, null); return; }   // lane open-base
      function feature(v) { var o = {}; Object.keys(v).forEach(function (k) { if (SHEET_PM_KEYS.indexOf(k) < 0) o[k] = v[k]; }); return o; }
      openPM({
        title: 'Base Flange/Tab', icon: 'flange', values: f, command: { sketchId: f.sketch },
        groups: [{ title: 'Sketch', fields: [sketchPickerField(f)] }].concat(sheetGroups([{ type: 'check', label: 'Reverse direction', key: 'reverse' }])),
        onChange: function (v, key) {
          if (gaugeChanged(v, key)) renderPM();
          v.depth = v.thickness; App.command.sketchId = v.sketch; UI.updateSketches();
          var err = showPreview(feature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing base flange (thickness ' + v.thickness + ').');
        },
        onOK: function (v) {
          // the sheet parameters may be equations too (the kernel resolves model.sheet like a feature)
          var sheet;
          try { sheet = sheetFromValues(v, true); } catch (e) { UI.toast(e.message); UI.setStatus(e.message); return false; }
          App.model.sheet = sheet;
          var feat = feature(v);
          feat.depth = pmExpr('thickness', +v.thickness); feat.name = 'Base-Flange' + (App.model.features.filter(function (q) { return /^Base-Flange\d+$/.test(q.name || ''); }).length + 1);
          feat.sheetBase = true;
          return commitFeature(feat, null);
        }
      });
    });
  }
  // lane open-base: Base Flange from an open profile: Direction 1 (Blind / Mid Plane, depth, Reverse Direction), the
  // sheet's groups with a Reverse direction for the side T goes to (SolidWorks). The feature is an `insertBends` with
  // `openBase`, so the preview is built here, not through the worker's tool op.
  function cmdOpenBase(sid, existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var v0 = sheetToValues(App.model.sheet || defaultSheet(), {});
    v0.sketch = existing ? existing.sketch : sid;
    v0.depth = existing ? existing.depth : (App.model.units === 'in' ? 1 : 25);
    v0.end = existing && existing.end === 'mid' ? 'mid' : 'blind';
    v0.reverse = !!(existing && existing.reverse);
    v0.flip = !!(existing && existing.flip);
    function featOf(v) {
      var o = { type: 'insertBends', openBase: true, sketch: v.sketch, depth: +v.depth, end: v.end, reverse: !!v.reverse, sheetBase: true };
      if (v.flip) o.flip = true;
      if (existing && existing.radius != null) o.radius = existing.radius;
      return o;
    }
    function preview() {
      var v = pm.values || v0;
      UI.disposeGroup(UI.groups.preview);
      try {
        var pmod = previewModel(), m = {};
        Object.keys(pmod).forEach(function (k) { m[k] = pmod[k]; });
        m.sheet = sheetFromValues(v, false);
        var r = K.buildOpenBase(featOf(v), m, { planes: (App.build && App.build.planes) || {} });
        addPreviewMesh(r.tool, UI.mats.preview);
        UI.setStatus('Base Flange: ' + r.bends + ' bend' + (r.bends === 1 ? '' : 's') + ', T ' + UI.fmtNum(m.sheet.thickness, 4) + ', R ' + UI.fmtNum(m.sheet.bendRadius, 4) + '. Press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    openPM({
      title: existing ? existing.name : 'Base Flange/Tab', icon: 'flange', values: v0, command: { sketchId: v0.sketch },
      groups: [{ title: 'Direction 1', fields: [
        { type: 'select', label: 'End Condition', key: 'end', options: [['blind', 'Blind'], ['mid', 'Mid Plane']] },
        { type: 'number', label: 'Depth', key: 'depth', step: 0.1, min: 0 },
        { type: 'check', label: 'Reverse Direction', key: 'reverse' }
      ] }].concat(sheetGroups([{ type: 'check', label: 'Reverse direction', key: 'flip' }])),
      onChange: function (v, key) {
        if (gaugeChanged(v, key)) renderPM();
        preview();
      },
      onOK: function (v) {
        if (!(+v.depth > 0)) { UI.toast('The depth must be more than 0.'); return false; }
        var sheet;
        try { sheet = sheetFromValues(v, true); } catch (e) { UI.toast(e.message); UI.setStatus(e.message); return false; }
        var feat = featOf(v);
        feat.depth = pmExpr('depth', +v.depth);
        feat.name = existing ? existing.name : 'Base-Flange' + (App.model.features.filter(function (q) { return /^Base-Flange\d+$/.test(q.name || ''); }).length + 1);
        // one undo step takes back the sheet with the feature (as Insert Bends)
        UI.pushUndo();
        var mark = App.undo.length;
        App.model.sheet = sheet;
        var res = commitFeature(feat, existing);
        if (App.undo.length === mark + 1) App.undo.splice(mark, 1);
        return res;
      }
    });
    preview();
  }
  // Sheet Metal (SolidWorks' Sheet-Metal feature): the part's sheet parameters and bend allowance, with the flat size
  // of the part as it stands updated live (a change of T or R needs the rebuild: the size follows after ✓).
  function cmdSheetMetal() {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    var old = App.model.sheet, v0 = sheetToValues(old, {}), cache = { key: null, text: '' };
    var resolved = previewModel().sheet || old;
    function flatText(v) {
      var sheet;
      try { sheet = sheetFromValues(v, false); } catch (e) { return e.message; }
      if (Math.abs(+sheet.thickness - +resolved.thickness) > 1e-12 || Math.abs(+sheet.bendRadius - +resolved.bendRadius) > 1e-12) return 'updates after ✓ (thickness or radius changed)';
      var key = JSON.stringify(sheet);
      if (cache.key === key) return cache.text;
      var m = {}; Object.keys(App.model).forEach(function (k) { m[k] = App.model[k]; });
      m.sheet = sheet;
      try { var flat = K.flatPattern(m, App.build, App.mesh); cache.text = UI.fmtNum(flat.size[0], 4) + ' × ' + UI.fmtNum(flat.size[1], 4) + ' ' + UI.unitLabel() + (flat.warnings.length ? ' (' + flat.warnings.length + ' warning' + (flat.warnings.length === 1 ? '' : 's') + ')' : ''); cache.warnings = flat.warnings; }
      catch (e) { cache.text = e.message; cache.warnings = []; }
      cache.key = key;
      return cache.text;
    }
    openPM({
      title: 'Sheet-Metal', icon: 'flange', values: v0,
      groups: sheetGroups().concat([{ title: 'Flat Pattern', fields: [
        { type: 'static', label: 'Flat size', value: flatText },
        { type: 'html', html: function () { return cache.warnings && cache.warnings.length ? '<div class="pm-note" style="margin:2px 0 4px">' + cache.warnings.map(function (w) { return smEsc(w); }).join('<br>') + '</div>' : ''; } }
      ] }]),
      onChange: function (v, key) {
        if (gaugeChanged(v, key)) renderPM();
        else if (key !== 'useGauge' && key !== 'baType' && key !== 'gaugeTable' && key !== 'gauge') renderPM();   // the flat size follows the typed value
        UI.setStatus('Sheet metal: flat size ' + flatText(v) + '.');
      },
      onOK: function (v) {
        var sheet;
        try { sheet = sheetFromValues(v, true); } catch (e) { UI.toast(e.message); UI.setStatus(e.message); return false; }
        UI.pushUndo();
        App.model.sheet = sheet;
        // the Base Flange is extruded by the sheet thickness: it follows a new T (equation text included)
        App.model.features.forEach(function (q) { if (q.sheetBase && q.type === 'extrude') q.depth = sheet.thickness; });
        App.model.features.forEach(function (q) { if (q.linkT && q.type === 'extrude') q.depth = sheet.thickness; });   // lane DC: Link to thickness
        return UI.afterRebuild(UI.rebuild(), function () {
          UI.refreshTree();
          var msg = 'Sheet metal parameters updated.';
          try { var flat = K.flatPattern(App.model, App.build, App.mesh); msg += ' ' + flatSizeText(flat) + '.' + (flat.warnings.length ? ' ' + flat.warnings[0] : ''); } catch (e) { msg += ' ' + e.message; }
          UI.setStatus(msg);
        });
      }
    });
  }
  UI.cmdSheetMetal = cmdSheetMetal;

  // ------------------------------------------------------------------ sheet metal: edge flange & flatten
  // kind: 'flange' (edge flange), 'miter' (an edge flange with miter: true preset), 'hem' (a 180° flange folded back,
  // stored as a flange with hem: true) or 'jog'.
  // Plain flanges carry miter (bool), miterGap, relief ('none' | 'rect' | 'obround'), reliefWidth / reliefDepth (null = T / T/2).
  // p9-pm: lengthRef ('outer' Outer Virtual Sharp | 'inner' Inner Virtual Sharp | 'tangent' Tangent Bend; new ones
  // default to 'outer' as in SolidWorks; a flange without it is measured as the straight wall after the bend, which
  // SolidWorks has no name for: editing one shows it as 'wall' (Wall Length, an extra choice only such flanges get), so
  // an old part does not move when it is edited). Hems carry hemType ('closed' | 'open' | 'teardrop' | 'rolled'), hemPosition ('inside' Material Inside |
  // 'outside' Bend Outside; an old hem without it shows Bend Outside), and for Tear Drop / Rolled hemRadius, hemAngle.
  var LENGTH_REFS = [['outer', 'Outer Virtual Sharp', 'lenOuter'], ['inner', 'Inner Virtual Sharp', 'lenInner'], ['tangent', 'Tangent Bend', 'lenTangent']];
  // rfIU: SolidWorks 2024's Flange Position order (Tangent to Bend needs kernel work) and its Custom Relief Type names
  // (Tear needs kernel work; None is Anvil's: no relief)
  // rfJC: Tangent to Bend and Tear (kernel lane rfIZ); Tangent to Bend is offered at 90° and up only, as SolidWorks greys it
  var FLANGE_POSITIONS = [['inside', 'Material Inside'], ['outside', 'Material Outside'], ['bendOutside', 'Bend Outside'], ['virtualSharp', 'Bend from Virtual Sharp'], ['tangentToBend', 'Tangent to Bend']];
  var CUSTOM_RELIEFS = [['rect', 'Rectangle'], ['tear', 'Tear'], ['obround', 'Obround'], ['none', 'None']];
  var HEM_TYPES = [['closed', 'Closed', 'hemClosed'], ['open', 'Open', 'hemOpen'], ['teardrop', 'Tear Drop', 'hemTeardrop'], ['rolled', 'Rolled', 'hemRolled']];
  var HEM_POSITIONS = [['inside', 'Material Inside', 'hemInside'], ['outside', 'Bend Outside', 'hemOutside']];
  var HEM_ANGLE = { teardrop: 200, rolled: 270 };   // SolidWorks' starting angles of a Tear Drop and a Rolled hem
  // p9-pm: the Edge Flange and Hem PropertyManagers start with the values last accepted in this session, as SolidWorks
  // does (per document units: a length remembered in inches is not offered to a millimetre part)
  var smMemory = { flange: null, hem: null };
  var FLANGE_MEMORY_KEYS = ['length', 'angle', 'position', 'lengthRef', 'useCustomRelief', 'relief', 'useDefaultReliefWidth', 'reliefWidthValue', 'useDefaultReliefDepth', 'reliefDepthValue', 'useReliefRatio', 'reliefRatioValue'];
  var HEM_MEMORY_KEYS = ['hemType', 'hemPosition', 'length', 'gap', 'hemRadius', 'hemAngle', 'miterGap'];
  // UI.sheetMetalMemory() -> copy of what is remembered; UI.sheetMetalMemory(null) forgets it (tests)
  UI.sheetMetalMemory = function (set) {
    if (set === null) smMemory = { flange: null, hem: null };
    return JSON.parse(JSON.stringify(smMemory));
  };
  function cmdEdgeFlange(existing, kind) {
    if (existing && existing.miterFlange && existing.sketch != null) { cmdMiterFlange(existing); return; }   // lane DL: a Miter Flange from a profile sketch
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.edges || !App.edges.length) { UI.toast('Create a Base Flange first.'); return; }
    var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;   // resolved: the sheet parameters may be equations
    kind = existing ? (existing.type === 'jog' ? 'jog' : existing.hem ? 'hem' : existing.miter ? 'miter' : 'flange') : (kind || 'flange');
    var isHem = kind === 'hem', isJog = kind === 'jog', isMiter = kind === 'miter', isFlange = !isHem && !isJog;
    var f = existing ? JSON.parse(JSON.stringify(existing)) :
      isJog ? { type: 'jog', edges: [], height: UI.lenDefault(10), length: UI.lenDefault(20), angle: 90, reverse: false, radius: null, position: 'bendOutside' } :
      isHem ? { type: 'flange', hem: true, edges: [], length: UI.lenDefault(10), angle: 180, reverse: false, radius: T / 4, position: 'bendOutside', hemType: 'closed', hemPosition: 'inside' } :
      { type: 'flange', edges: [], length: UI.lenDefault(20), angle: 90, reverse: false, radius: null, position: 'bendOutside', lengthRef: 'outer', miter: isMiter, miterGap: 0 };   // lane CS: no relief of its own: the sheet's Auto Relief
    f.useDefaultRadius = f.radius == null;
    f.radiusValue = f.radius != null ? f.radius : sheet.bendRadius;
    if (isHem) {
      f.gap = Math.round((f.radius != null ? f.radius : T / 4) * 2 * 1e4) / 1e4;
      if (!f.hemType) f.hemType = 'open';
      if (!f.hemPosition) f.hemPosition = 'outside';
      if (f.hemRadius == null) f.hemRadius = f.hemType === 'teardrop' || f.hemType === 'rolled' ? +f.radiusValue : +sheet.bendRadius;
      if (f.hemAngle == null) f.hemAngle = HEM_ANGLE[f.hemType] || HEM_ANGLE.teardrop;
    }
    if (isFlange && !f.lengthRef) f.lengthRef = 'wall';
    var lengthRefs = f.lengthRef === 'wall' ? LENGTH_REFS.concat([['wall', 'Wall Length (straight wall after the bend, as older Anvil flanges)', 'lenTangent']]) : LENGTH_REFS;
    // Custom Bend Allowance (SolidWorks): UI-only check / type / value keys, folded into f.bendAllowance by toFeature
    var cba = f.bendAllowance || null, kSheet = K.sheetKFactor(sheet);
    f.useCustomBA = !!cba;
    f.cbaType = cba ? cba.type : 'kfactor';
    f.cbaK = cba && cba.type === 'kfactor' ? cba.value : kSheet;
    f.cbaBA = cba && cba.type === 'allowance' ? cba.value : Math.round(K.bendAllowance(Math.PI / 2, +sheet.bendRadius, T, kSheet) * 1e4) / 1e4;
    f.cbaBD = cba && cba.type === 'deduction' ? cba.value : Math.round(K.bendDeduction(Math.PI / 2, +sheet.bendRadius, T, K.bendAllowance(Math.PI / 2, +sheet.bendRadius, T, kSheet)) * 1e4) / 1e4;
    delete f.bendAllowance;
    if (isFlange || isHem) {
      // older flanges lack the miter/relief fields: fill the defaults, then split relief sizes into UI-only check + value pairs
      if (f.miter == null) f.miter = false;
      if (f.miterGap == null) f.miterGap = 0;
      // rfJC: Custom Relief Type ▸ Use relief ratio (UI-only check + value; the feature keeps reliefRatio)
      f.useReliefRatio = f.reliefRatio != null;
      f.reliefRatioValue = f.reliefRatio != null ? f.reliefRatio : 0.5;
      delete f.reliefRatio;
      // lane CS: SolidWorks' Custom Relief Type check: off (no `relief` in the feature) takes the sheet's Auto Relief
      f.useCustomRelief = f.relief != null;
      if (!f.relief) f.relief = 'none';
      if (f.reliefWidth === undefined) f.reliefWidth = null;
      if (f.reliefDepth === undefined) f.reliefDepth = null;
      f.useDefaultReliefWidth = f.reliefWidth == null;
      f.reliefWidthValue = f.reliefWidth != null ? f.reliefWidth : T;
      f.useDefaultReliefDepth = f.reliefDepth == null;
      f.reliefDepthValue = f.reliefDepth != null ? f.reliefDepth : T / 2;
    }
    // rfJC: Hem ▸ Miter Gap (written as miter + miterGap when the hem runs along two or more edges; SolidWorks mitres hems
    // that meet). The gap starts at the Closed Corner default, 0.01 in / 0.25 mm.
    if (isHem && !(f.miter && f.miterGap > 0)) f.miterGap = App.model.units === 'in' ? 0.01 : 0.25;
    // rfJC: Flange Length ▸ End condition (Blind / Up To Vertex, the vertex and Normal to flange plane / Parallel to base
    // flange) and Flange Position ▸ Offset (UI-only check + distance; the feature keeps offset: { end: 'blind', distance })
    if (isFlange) {
      f.lengthEnd = f.lengthEnd === 'upToVertex' ? 'upToVertex' : 'blind';
      f.lengthVertex = Array.isArray(f.lengthVertex) ? f.lengthVertex.slice() : null;
      f.lengthVertexMode = f.lengthVertexMode === 'parallel' ? 'parallel' : 'normal';
      f.vxActive = f.lengthEnd === 'upToVertex' && !f.lengthVertex;
      f.useOffset = f.offset != null;
      f.offsetDist = f.offset == null ? 0 : typeof f.offset === 'object' ? f.offset.distance : f.offset;
      delete f.offset;
      f.trimSideBends = !!f.trimSideBends;   // lane smtrim: Flange Position ▸ Trim side bends
    }
    var memKind = isHem ? 'hem' : isFlange ? 'flange' : null, mem = memKind && smMemory[memKind];
    if (!existing && mem && mem.units === App.model.units) {
      (isHem ? HEM_MEMORY_KEYS : FLANGE_MEMORY_KEYS).forEach(function (k) { if (mem[k] !== undefined) f[k] = mem[k]; });
    }
    function remember(v) {
      if (existing || !memKind) return;
      var m = { units: App.model.units };
      (isHem ? HEM_MEMORY_KEYS : FLANGE_MEMORY_KEYS).forEach(function (k) { m[k] = v[k]; });
      smMemory[memKind] = m;
    }
    var titles ={ flange: 'Edge-Flange', miter: 'Miter-Flange', hem: 'Hem', jog: 'Jog' };
    var RELIEF_NAMES = { none: 'None', rect: 'Rectangle', obround: 'Obround', tear: 'Tear' };
    if (!existing && App.sel && App.sel.kind === 'edge') f.edges.push({ at: App.sel.edge.mid.slice() });
    var edgeList = [];
    function resolveList() {
      var sharp = App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
      edgeList = K.resolveEdges(f.edges.map(function (e) { return { at: e.at, chain: false }; }), sharp, K.pickTol(App.model.units, sheet.thickness));
      if (App.command) App.command.edgeList = edgeList;
      UI.updateHighlights();
    }
    // r4/features4: a list row per edge (hover lights it, Delete / right-click removes it)
    function flangeItems(v) {
      var sharp = App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
      return v.edges.map(function (spec, i) { return { label: 'Edge<' + (i + 1) + '>', at: spec.at, get edges() { try { return existing ? [] : K.resolveEdges([{ at: spec.at, chain: false }], sharp, K.pickTol(App.model.units, sheet.thickness)); } catch (e) { return []; } } }; });
    }
    function flangeRemove(v, i) { v.edges.splice(i, 1); renderPM(); resolveList(); preview(); }
    function flangeClear(v) { v.edges.length = 0; renderPM(); resolveList(); preview(); }
    var CBA_KEY = { kfactor: 'cbaK', allowance: 'cbaBA', deduction: 'cbaBD' };
    function toFeature(v, forOK) {
      var out = JSON.parse(JSON.stringify(v));
      if (isHem) {
        // the hem's own fields; angle / radius / position stay what a kernel without them builds (a 180° fold, Bend
        // Outside), the radius from the gap (Closed: none) or, for Tear Drop / Rolled, the hem radius
        var ht = HEM_TYPES.some(function (o) { return o[0] === v.hemType; }) ? v.hemType : 'open', curl = ht === 'teardrop' || ht === 'rolled';
        out.hemType = ht;
        out.hemPosition = v.hemPosition === 'inside' ? 'inside' : 'outside';
        out.angle = 180; out.position = 'bendOutside';
        out.radius = curl ? Math.max(+v.hemRadius || 0, 0.02 * T) : Math.max((ht === 'open' ? +v.gap || 0 : 0) / 2, 0.02 * T);
        if (curl) { out.hemRadius = +v.hemRadius; out.hemAngle = +v.hemAngle; } else { delete out.hemRadius; delete out.hemAngle; }
        delete out.gap;
      }
      else out.radius = v.useDefaultRadius ? null : +v.radiusValue;
      if (isFlange) out.lengthRef = lengthRefs.some(function (o) { return o[0] === v.lengthRef; }) ? v.lengthRef : 'outer';
      delete out.useDefaultRadius; delete out.radiusValue;
      if (isFlange) {
        out.miter = !!v.miter;
        out.miterGap = out.miter ? Math.max(0, +v.miterGap || 0) : 0;
        // rfJC: Up To Vertex and Offset
        if (v.lengthEnd === 'upToVertex') { out.lengthEnd = 'upToVertex'; out.lengthVertex = v.lengthVertex ? v.lengthVertex.slice() : null; out.lengthVertexMode = v.lengthVertexMode === 'parallel' ? 'parallel' : 'normal'; }
        else { delete out.lengthEnd; delete out.lengthVertex; delete out.lengthVertexMode; }
        if (v.useOffset) out.offset = { end: 'blind', distance: +v.offsetDist || 0 }; else delete out.offset;
        if (v.trimSideBends) out.trimSideBends = true; else delete out.trimSideBends;
        delete out.vxActive; delete out.useOffset; delete out.offsetDist;
      }
      if (isHem) {
        if (v.edges.length > 1) { out.miter = true; out.miterGap = Math.max(0, +v.miterGap || 0); } else { delete out.miter; delete out.miterGap; }
      }
      if (isFlange || isHem) {
        if (v.useCustomRelief) {
          out.relief = RELIEF_NAMES[v.relief] ? v.relief : 'none';
          // Tear has no size (kernel: the Rip gap); Use relief ratio sizes a Rectangle / Obround by ratio × T
          var sized = out.relief === 'rect' || out.relief === 'obround', byRatio = sized && !!v.useReliefRatio;
          out.reliefWidth = sized && !byRatio && !v.useDefaultReliefWidth ? +v.reliefWidthValue : null;
          out.reliefDepth = sized && !byRatio && !v.useDefaultReliefDepth ? +v.reliefDepthValue : null;
          if (byRatio) out.reliefRatio = forOK ? pmExpr('reliefRatioValue', +v.reliefRatioValue) : +v.reliefRatioValue; else delete out.reliefRatio;
        } else { delete out.relief; delete out.reliefWidth; delete out.reliefDepth; delete out.reliefRatio; }
        delete out.useCustomRelief; delete out.useReliefRatio; delete out.reliefRatioValue;
      }
      if (v.useCustomBA) {
        out.bendAllowance = { type: v.cbaType };
        if (v.cbaType !== 'table') out.bendAllowance.value = forOK ? pmExpr(CBA_KEY[v.cbaType], +v[CBA_KEY[v.cbaType]]) : +v[CBA_KEY[v.cbaType]];
      } else delete out.bendAllowance;
      // UI-only keys must never reach the model (feature JSON is the rebuild cache key)
      delete out.useDefaultReliefWidth; delete out.reliefWidthValue; delete out.useDefaultReliefDepth; delete out.reliefDepthValue;
      delete out.useCustomBA; delete out.cbaType; delete out.cbaK; delete out.cbaBA; delete out.cbaBD;
      return out;
    }
    // ' · bend allowance 3.142 mm (BD 4.858, K-Factor 0.5)': the bend this feature makes, by the sheet's method or its own
    function bendText(feat) {
      var R = +(feat.radius != null ? feat.radius : sheet.bendRadius), A = (feat.angle == null ? 90 : +feat.angle) * Math.PI / 180, bc;
      try { bc = K.bendCalc(sheet, A, R, T, feat.bendAllowance); } catch (e) { return ' · ' + e.message; }
      var how = bc.type === 'kfactor' ? 'K-Factor ' + UI.fmtNum(bc.K, 4) : BA_NAMES[bc.type] + (bc.type === 'table' ? '' : ' ' + UI.fmtNum(bc.value, 4));
      return ' · bend allowance ' + UI.fmtNum(bc.BA, 4) + ' ' + UI.unitLabel() + (isJog ? ' per bend' : '') + ' (BD ' + UI.fmtNum(bc.BD, 4) + ', ' + (bc.source === 'custom' ? 'custom ' : '') + how + ')' + (bc.warning ? ' — ' + bc.warning : '');
    }
    function flangeStatus(feat) {
      var ne = edgeList.length || (feat.edges || []).length;   // editing: the picks are on the sheet before this feature
      var extra = '';
      if (isFlange && feat.miter) extra += ' · mitred corners' + (feat.miterGap > 0 ? ' (gap ' + UI.fmtNum(feat.miterGap, 3) + ')' : '');
      if (isFlange && feat.relief && feat.relief !== 'none') extra += ' · ' + RELIEF_NAMES[feat.relief].toLowerCase() + ' relief';
      UI.setStatus(titles[kind] + ' preview: ' + ne + ' edge' + (ne === 1 ? '' : 's') + bendText(feat) + extra + '.');
    }
    // built in the worker (livePreview); previewSync without it
    function preview() {
      if (!f.edges.length) { lp.shown = ++lp.seq; UI.disposeGroup(UI.groups.preview); UI.setStatus('Click straight edges of the sheet to add ' + (isJog ? 'a jog' : isHem ? 'a hem' : 'flanges') + '.'); return; }
      var feat;
      try { feat = toFeature(f); } catch (e) { lp.shown = ++lp.seq; UI.disposeGroup(UI.groups.preview); UI.setStatus('Preview: ' + e.message); return; }
      // editing: built on the sheet as it was before this feature (as the rebuild does; its edges are gone after it)
      var upto = null;
      if (existing) App.model.features.forEach(function (g, i) { if (g.id === existing.id) upto = i; });
      livePreview({ op: isJog ? 'jog' : 'flange', feature: feat, upto: upto, mats: [UI.mats.preview], sync: previewSync, done: function () { try { flangeStatus(feat); } catch (e) { } } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      if (!f.edges.length) { UI.setStatus('Click straight edges of the sheet to add ' + (isJog ? 'a jog' : isHem ? 'a hem' : 'flanges') + '.'); return; }
      try {
        var feat = toFeature(f), tool;
        if (isJog) { var jg = K.buildJog(feat, previewModel(), { body: App.build.body, flanges: {}, tools: {} }); tool = jg.first.union(jg.second); }
        else tool = K.buildFlange(feat, previewModel(), { body: App.build.body, flanges: {} });
        var mesh = K.meshFromBody(tool), g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(UI.analyticNormals(mesh), 3));
        UI.groups.preview.add(new THREE.Mesh(g, UI.mats.preview));
        var extra = '';
        if (isFlange && feat.miter) extra += ' · mitred corners' + (feat.miterGap > 0 ? ' (gap ' + UI.fmtNum(feat.miterGap, 3) + ')' : '');
        if (isFlange && feat.relief && feat.relief !== 'none') extra += ' · ' + RELIEF_NAMES[feat.relief].toLowerCase() + ' relief';
        UI.setStatus(titles[kind] + ' preview: ' + edgeList.length + ' edge' + (edgeList.length === 1 ? '' : 's') + bendText(feat) + extra + '.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    var radiusFields = [
      { type: 'check', label: 'Use default radius (' + sheet.bendRadius + ')', key: 'useDefaultRadius', rerender: true },
      { type: 'number', label: 'Bend radius', key: 'radiusValue', unit: 'u', min: 0, show: function (v) { return !v.useDefaultRadius; } }
    ];
    function sizedRelief(v) { return v.useCustomRelief && (v.relief === 'rect' || v.relief === 'obround'); }
    var reliefGroup = { title: 'Custom Relief Type', fields: [   // rfK: SolidWorks' group name on the Edge-Flange PM (Auto Relief is the sheet's default, in the Sheet-Metal feature)
      { type: 'check', label: 'Custom relief type', key: 'useCustomRelief', rerender: true },
      { type: 'static', label: 'Auto Relief', value: function () { return isHem ? 'None (a hem takes no Auto Relief)' : sheet.relief ? RELIEF_NAMES[sheet.relief] + (sheet.relief === 'tear' ? '' : ', ratio ' + sheet.reliefRatio) + ' (sheet default)' : 'None (sheet default)'; }, show: function (v) { return !v.useCustomRelief; } },
      { type: 'select', label: 'Relief type', key: 'relief', options: CUSTOM_RELIEFS, rerender: true, show: function (v) { return v.useCustomRelief; } },
      // rfJC: SolidWorks' Use relief ratio (Rectangle / Obround; Tear has no size)
      { type: 'check', label: 'Use relief ratio', key: 'useReliefRatio', rerender: true, show: sizedRelief },
      { type: 'number', label: 'Ratio', key: 'reliefRatioValue', step: 0.05, min: 0, show: function (v) { return sizedRelief(v) && v.useReliefRatio; } },
      { type: 'check', label: 'Use default width (T = ' + T + ')', key: 'useDefaultReliefWidth', rerender: true, show: function (v) { return sizedRelief(v) && !v.useReliefRatio; } },
      { type: 'number', label: 'Relief width', key: 'reliefWidthValue', unit: 'u', min: 0, show: function (v) { return sizedRelief(v) && !v.useReliefRatio && !v.useDefaultReliefWidth; } },
      { type: 'check', label: 'Use default depth (T/2 = ' + T / 2 + ')', key: 'useDefaultReliefDepth', rerender: true, show: function (v) { return sizedRelief(v) && !v.useReliefRatio; } },
      { type: 'number', label: 'Relief depth', key: 'reliefDepthValue', unit: 'u', min: 0, show: function (v) { return sizedRelief(v) && !v.useReliefRatio && !v.useDefaultReliefDepth; } }
    ] };
    function upTo(v) { return v.lengthEnd === 'upToVertex'; }
    var tbShown = +f.angle >= 90 - 1e-9;   // rfJC: Tangent to Bend is in the Position list
    var groups = isJog ? [
      { title: 'Jog Parameters', fields: [
        { type: 'pick', icon: 'flange', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Select edges…', items: flangeItems, onRemove: flangeRemove, onClear: flangeClear },
        { type: 'number', label: 'Jog height', key: 'height', unit: 'u', min: 0 },
        { type: 'number', label: 'Flat length', key: 'length', unit: 'u', min: 0 },
        { type: 'number', label: 'Bend angle', key: 'angle', unit: '°', min: 0 },
        { type: 'check', label: 'Reverse direction', key: 'reverse' }
      ].concat(radiusFields, [{ type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }]) },
      { title: 'Jog Position', fields: [{ type: 'select', label: 'Position', key: 'position', options: [['bendOutside', 'Bend Outside'], ['outside', 'Material Outside'], ['inside', 'Material Inside']] }] }
    ] : isHem ? [
      // p9-pm: SolidWorks' Hem PropertyManager: Edges (with Material Inside / Bend Outside), then Type and Size
      { title: 'Edges', fields: [
        { type: 'pick', icon: 'flange', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Select edges…', items: flangeItems, onRemove: flangeRemove, onClear: flangeClear },
        { type: 'iconRadio', label: 'Position', key: 'hemPosition', options: HEM_POSITIONS },
        { type: 'check', label: 'Reverse direction', key: 'reverse' },
        { type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }
      ] },
      { title: 'Type and Size', fields: [
        { type: 'iconRadio', label: 'Type', key: 'hemType', options: HEM_TYPES, rerender: true },
        { type: 'number', label: 'Hem length', key: 'length', unit: 'u', min: 0, show: function (v) { return v.hemType === 'closed' || v.hemType === 'open'; } },
        { type: 'number', label: 'Gap distance', key: 'gap', unit: 'u', min: 0, show: function (v) { return v.hemType === 'open'; } },
        { type: 'number', label: 'Angle', key: 'hemAngle', unit: '°', min: 0, show: function (v) { return v.hemType === 'teardrop' || v.hemType === 'rolled'; } },
        { type: 'number', label: 'Radius', key: 'hemRadius', unit: 'u', min: 0, show: function (v) { return v.hemType === 'teardrop' || v.hemType === 'rolled'; } }
      ] },
      // rfJC: SolidWorks' Miter Gap (used where hems on two edges meet)
      { title: 'Miter Gap', fields: [{ type: 'number', label: 'Miter gap', key: 'miterGap', unit: 'u', min: 0 }] },
      reliefGroup
    ] : [
      { title: 'Flange Parameters', fields: [
        { type: 'pick', icon: 'flange', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Select edges…', items: flangeItems, onRemove: flangeRemove, onClear: flangeClear }
      ].concat(radiusFields, [{ type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }]) },
      { title: 'Angle', fields: [{ type: 'number', label: 'Flange angle', key: 'angle', unit: '°', min: 0 }] },
      // rfIU / rfJC: SolidWorks' Flange Length order: the end condition (Blind / Up To Vertex) with Reverse Direction
      // beside it, then the length and the three length references (Blind), or the vertex and Normal to flange plane /
      // Parallel to base flange (Up To Vertex, which measures to the vertex, not from a reference)
      { title: 'Flange Length', fields: [
        { type: 'select', label: 'End condition', key: 'lengthEnd', options: [['blind', 'Blind'], ['upToVertex', 'Up To Vertex']], rerender: true },
        { type: 'check', label: 'Reverse direction', key: 'reverse' },
        { type: 'number', label: 'Length', key: 'length', unit: 'u', min: 0, show: function (v) { return !upTo(v); } },
        { type: 'iconRadio', label: 'Measured from', key: 'lengthRef', options: lengthRefs, show: function (v) { return !upTo(v); } },
        { type: 'pick', icon: 'point', placeholder: 'Select a vertex…', show: upTo, value: function (v) { return v.lengthVertex ? 'Vertex<1>' : ''; },
          active: function (v) { return !!v.vxActive; }, onActivate: function (v) { v.vxActive = true; renderPM(); UI.setStatus('Up To Vertex: click the vertex the flange runs to.'); } },
        { type: 'radio', key: 'lengthVertexMode', show: upTo, options: [['normal', 'Normal to flange plane'], ['parallel', 'Parallel to base flange']] }
      ] },
      { title: 'Flange Position', fields: [
        { type: 'select', label: 'Position', key: 'position', options: function (v) { return +v.angle >= 90 - 1e-9 ? FLANGE_POSITIONS : FLANGE_POSITIONS.filter(function (o) { return o[0] !== 'tangentToBend'; }); } },
        // lane smtrim: Trim side bends (Material Inside / Outside: an earlier bend running on past an end is cut back)
        { type: 'check', label: 'Trim side bends', key: 'trimSideBends' },
        // rfJC: SolidWorks' Offset (end condition Blind, distance)
        { type: 'check', label: 'Offset', key: 'useOffset', rerender: true },
        { type: 'static', label: 'Offset end condition', value: 'Blind', show: function (v) { return v.useOffset; } },
        { type: 'number', label: 'Offset distance', key: 'offsetDist', unit: 'u', show: function (v) { return v.useOffset; } }
      ] },
      { title: 'Miter', fields: [
        { type: 'check', label: 'Miter corners', key: 'miter', rerender: true },
        { type: 'number', label: 'Gap distance', key: 'miterGap', unit: 'u', min: 0, show: function (v) { return !!v.miter; } }
      ] },
      reliefGroup
    ];
    groups.push({ title: 'Custom Bend Allowance', collapsed: !f.useCustomBA, fields: [
      { type: 'check', label: 'Custom bend allowance', key: 'useCustomBA', rerender: true },
      { type: 'select', label: 'Type', key: 'cbaType', options: BA_OPTIONS, rerender: true, show: function (v) { return v.useCustomBA; } },
      { type: 'number', label: 'K-factor', key: 'cbaK', step: 0.01, min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'kfactor'; } },
      { type: 'number', label: 'Bend allowance', key: 'cbaBA', unit: 'u', min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'allowance'; } },
      { type: 'number', label: 'Bend deduction', key: 'cbaBD', unit: 'u', show: function (v) { return v.useCustomBA && v.cbaType === 'deduction'; } },
      { type: 'static', label: 'Bend table', value: sheet.bendTable ? sheet.bendTable.rows.length + ' rows (the part\'s table)' : 'none — add one in Sheet-Metal', show: function (v) { return v.useCustomBA && v.cbaType === 'table'; } }
    ] });
    var sheetHow = (sheet.bendAllowanceType || 'kfactor') === 'kfactor' ? 'K-Factor ' + K.sheetKFactor(sheet) : BA_NAMES[sheet.bendAllowanceType] + (sheet.bendAllowanceType === 'allowance' ? ' ' + sheet.bendAllowance : sheet.bendAllowanceType === 'deduction' ? ' ' + sheet.bendDeduction : '');
    groups.push({ title: 'Sheet', fields: [{ type: 'static', label: 'Thickness', value: T + ' ' + UI.unitLabel() }, { type: 'static', label: 'K-factor', value: String(K.sheetKFactor(sheet)) }, { type: 'static', label: 'Bend allowance', value: sheetHow },
      { type: 'buttons', buttons: [{ label: 'Sheet metal parameters…', onclick: function () { pmCancel(); cmdSheetMetal(); } }] }] });
    groups.push({ title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] });
    openPM({
      title: existing ? existing.name : titles[kind], icon: isMiter ? 'miter' : 'flange', values: f,
      exprMap: { radiusValue: 'radius', reliefWidthValue: 'reliefWidth', reliefDepthValue: 'reliefDepth' },   // (cbaK / cbaBA / cbaBD, reliefRatioValue: toFeature(v, true))
      message: isJog ? 'Click <b>straight edges</b>: the sheet steps up by the jog height and continues flat. Reverse steps it down.' : isHem ? 'Click <b>straight edges</b> to fold the sheet back over itself. <i>Material Inside</i> keeps the hem inside the edge; <i>Bend Outside</i> adds the bend beyond it. An Open hem\'s gap is the opening between the two flats.' :
        (isMiter ? 'Click <b>two or more adjacent straight edges</b> of the flat sheet; the flanges are joined at each shared corner.' : 'Click <b>straight edges</b> of the flat sheet. Placement is <i>Bend Outside</i>; use Reverse to flip the flange to the other side.') +
        ' <i>Miter</i> joins flanges on adjacent edges at their corner, and <i>Relief</i> cuts a slot where a flange ends inside the plate.',
      command: {
        pickEdges: true, edgeList: edgeList,
        // rfJC: Up To Vertex: while its vertex box is active a click takes a vertex of the part
        pickRefGeo: isFlange, refKinds: ['point'], pickVertices: function () { return isFlange && f.lengthEnd === 'upToVertex' && !!f.vxActive; },
        onPick: function (pk) {
          if (pk.kind === 'vertex' && isFlange && f.lengthEnd === 'upToVertex' && pk.point) {
            f.lengthVertex = pk.point.slice(); f.vxActive = false;
            renderPM(); preview();
            return true;
          }
          if (pk.kind !== 'edge') return false;
          var e = pk.edge, idx = -1;
          f.edges.forEach(function (spec, i) { if (K.pointSegmentDistance(spec.at, e.a, e.b) < 0.5) idx = i; });
          if (idx >= 0) f.edges.splice(idx, 1); else f.edges.push({ at: e.mid.slice() });
          renderPM(); resolveList(); preview();
          return true;
        }
      },
      groups: groups,
      onChange: function (v, key) {
        // a Tear Drop and a Rolled hem start at their own angle (200°, 270°) unless one was typed
        if (isHem && key === 'hemType' && HEM_ANGLE[v.hemType] && (v.hemAngle === HEM_ANGLE.teardrop || v.hemAngle === HEM_ANGLE.rolled) && v.hemAngle !== HEM_ANGLE[v.hemType]) { v.hemAngle = HEM_ANGLE[v.hemType]; renderPM(); }
        // rfJC: below 90° Tangent to Bend is not offered (SolidWorks greys it): Material Inside instead; the Position list
        // is redrawn when the angle crosses 90°
        if (isFlange && key === 'angle') {
          var tb = +v.angle >= 90 - 1e-9;
          if (!tb && v.position === 'tangentToBend') v.position = 'inside';
          if (tb !== tbShown) { tbShown = tb; renderPM(); }
        }
        if (isFlange && key === 'lengthEnd') { v.vxActive = v.lengthEnd === 'upToVertex' && !v.lengthVertex; renderPM(); if (v.vxActive) UI.setStatus('Up To Vertex: click the vertex the flange runs to.'); }
        resolveList(); preview();
      },
      onOK: function (v) {
        if (!v.edges.length) { UI.toast('Select at least one edge.'); return false; }
        if (isFlange && v.lengthEnd === 'upToVertex' && !v.lengthVertex) { UI.toast('Up To Vertex: select the vertex the flange runs to.'); return false; }
        remember(v);
        var feat = toFeature(v, true);
        if (!feat.name) {
          if (isHem) feat.name = K.featureName(App.model, 'hem');
          else if (isFlange && feat.miter) feat.name = 'Miter-Flange' + (App.model.features.filter(function (q) { return /^Miter-Flange\d+$/.test(q.name || ''); }).length + 1);
          else delete feat.name;
        }
        return commitFeature(feat, existing);
      }
    });
    resolveList(); preview();
  }
  function cmdHem(existing) { cmdEdgeFlange(existing, 'hem'); }
  // lane DC (finding #4): SolidWorks' Jog — a sketch with one line on a flat face of the sheet (Kernel.buildSketchJog).
  // An edge jog of an older part (edges, height, length) still edits in the Edge-Flange-style PM.
  function cmdJog(existing) {
    if (existing && existing.sketch == null) { cmdEdgeFlange(existing, 'jog'); return; }
    cmdSketchJog(existing);
  }
  var JOG_OFFSET_REFS = [['outside', 'Outside Offset'], ['inside', 'Inside Offset'], ['overall', 'Overall Dimension']];
  var JOG_OFFSET_ENDS = [['blind', 'Blind'], ['upToVertex', 'Up To Vertex'], ['upToSurface', 'Up To Surface'], ['offsetFromSurface', 'Offset From Surface']];   // lane dxfout-2
  var JOG_ENDS_LABEL = {}; JOG_OFFSET_ENDS.forEach(function (o) { JOG_ENDS_LABEL[o[0]] = o[1]; });
  // a jog target plane's name: a standard plane, else the reference plane feature's name
  function jogPlaneName(ref) { if (typeof ref === 'string') return ref; var pf = K.findFeature(App.model, ref); return pf && pf.name ? pf.name : String(ref); }
  var jogLast = null;   // the offset / reference / position / angle last accepted this session
  function cmdSketchJog(existing) {
    if (!existing && App.mode !== 'sketch' && selectedSketchId() == null && pickDefaultSketch(null) == null && App.sel && App.sel.kind === 'face' && App.model.sheet) {
      // SolidWorks: Jog with a face selected and no sketch opens a sketch on the face; exiting it brings Jog back
      newSketchOnFace(App.sel);
      App.pendingAfterSketch = function () { cmdSketchJog(); };
      UI.setStatus('Jog: sketch one line across the face where the jog starts, then exit the sketch.');
      return;
    }
    withSketch(function (sid) {
      if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
      var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;
      var f = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ type: 'jog', sketch: pickDefaultSketch(sid), fixed: null, offset: Math.round(UI.lenDefault(10) * 1e4) / 1e4, offsetRef: 'outside', position: 'centerline', angle: 90, reverse: false, radius: null }, jogLast || {});
      if (f.sketch == null) { UI.toast('Sketch one line on a flat face of the sheet (or select the face), then click Jog.'); UI.setStatus('Jog: select a flat face of the sheet and click Jog, or sketch one line on it first.'); return; }
      if (!f.offsetRef) f.offsetRef = 'outside';
      if (!f.position) f.position = 'centerline';
      f.useDefaultRadius = f.radius == null;
      f.radiusValue = f.radius != null ? f.radius : sheet.bendRadius;
      f.fixProjected = !!f.fixLength;   // lane DK: Fix projected length (fixLength: material is added for the jog)
      delete f.fixLength;
      // lane dxfout-2: Jog Offset end condition (Kernel.jogBendFeature): the target box takes a vertex (Up To Vertex), a
      // face or a plane (Up To Surface / Offset From Surface) while it is active; otherwise a face click is the fixed face
      if (!f.offsetEnd) f.offsetEnd = 'blind';
      if (f.offsetDistance == null) f.offsetDistance = Math.round(UI.lenDefault(5) * 1e4) / 1e4;
      f.offsetFlip = !!f.offsetFlip;
      f.tgActive = f.offsetEnd !== 'blind' && f.offsetTarget == null;
      if (f.offset == null) f.offset = Math.round(UI.lenDefault(10) * 1e4) / 1e4;
      var cba = f.bendAllowance || null, kSheet = K.sheetKFactor(sheet), R0 = +sheet.bendRadius, BA0 = K.bendAllowance(Math.PI / 2, R0, T, kSheet);
      f.useCustomBA = !!cba;
      f.cbaType = cba ? cba.type : 'kfactor';
      f.cbaK = cba && cba.type === 'kfactor' ? cba.value : kSheet;
      f.cbaBA = cba && cba.type === 'allowance' ? cba.value : Math.round(BA0 * 1e4) / 1e4;
      f.cbaBD = cba && cba.type === 'deduction' ? cba.value : Math.round(K.bendDeduction(Math.PI / 2, R0, T, BA0) * 1e4) / 1e4;
      delete f.bendAllowance;
      var CBA_KEY = { kfactor: 'cbaK', allowance: 'cbaBA', deduction: 'cbaBD' };
      var base = null, jogCmd = null, jogTargetKind = f.offsetEnd;
      function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : (App.build ? App.build.body : null); return base; }
      function jogTargetOn(v) {
        v.tgActive = true;
        if (jogCmd) jogCmd.pickPlane = v.offsetEnd !== 'upToVertex';
        UI.setStatus(v.offsetEnd === 'upToVertex' ? 'Up To Vertex: click the vertex the jog goes to.' : 'Click the face or plane (parallel to the sheet) the jog goes to.');
        renderPM();
      }
      function toFeature(v, forOK) {
        var out = JSON.parse(JSON.stringify(v));
        out.radius = v.useDefaultRadius ? null : +v.radiusValue;
        out.fixed = v.fixed ? v.fixed.slice() : null;
        if (v.useCustomBA) {
          out.bendAllowance = { type: v.cbaType };
          if (v.cbaType !== 'table') out.bendAllowance.value = forOK ? pmExpr(CBA_KEY[v.cbaType], +v[CBA_KEY[v.cbaType]]) : +v[CBA_KEY[v.cbaType]];
        } else delete out.bendAllowance;
        if (v.fixProjected) out.fixLength = true;
        if (v.offsetEnd === 'blind') { delete out.offsetEnd; delete out.offsetTarget; delete out.offsetDistance; delete out.offsetFlip; }
        else {
          if (v.offsetEnd !== 'offsetFromSurface') { delete out.offsetDistance; delete out.offsetFlip; }
          else { out.offsetDistance = forOK ? pmExpr('offsetDistance', +v.offsetDistance) : +v.offsetDistance; if (!v.offsetFlip) delete out.offsetFlip; }
        }
        ['useDefaultRadius', 'radiusValue', 'useCustomBA', 'cbaType', 'cbaK', 'cbaBA', 'cbaBD', 'fixProjected', 'tgActive'].forEach(function (k) { delete out[k]; });
        if (!forOK) out.offset = +v.offset;
        return out;
      }
      function minText(v) {
        var R = v.useDefaultRadius ? +sheet.bendRadius : +v.radiusValue, A = (+v.angle || 90) * Math.PI / 180;
        return UI.fmtNum(K.jogMinOffset(A, R, T, v.offsetRef), 4) + ' ' + UI.unitLabel();
      }
      function preview() {
        UI.disposeGroup(UI.groups.preview);
        var feat = toFeature(f);
        try {
          if (!baseBody()) throw new Error('Create a Base Flange first.');
          var r = K.buildSketchJog(feat, previewModel(), { body: baseBody(), sketches: {}, planes: (App.build && App.build.planes) || {}, flanges: {}, tools: {} });
          if (r.tool && r.tool.polygons.length) addPreviewMesh(r.tool, UI.mats.preview);
          UI.setStatus('Jog preview: ' + f.offsetRef + ' offset ' + (f.offsetEnd === 'blind' ? UI.fmtNum(+f.offset, 4) + ' ' + UI.unitLabel() : JOG_ENDS_LABEL[f.offsetEnd]) + ', ' + (f.fixed ? 'fixed face picked' : 'the larger side fixed') + ', straight riser ' + UI.fmtNum(r.g, 4) + ' ' + UI.unitLabel() + '.');
        } catch (e) { UI.setStatus('Preview: ' + e.message); }
      }
      var groups = [
        { title: 'Selections', fields: [
          sketchPickerField(f),
          { type: 'pick', icon: 'jog', value: function (v) { return v.fixed ? 'Fixed face <1>' : ''; }, placeholder: 'Fixed face (default: the larger side)…',
            active: function (v) { return v.offsetEnd !== 'blind' && !v.tgActive; },   // lane dxfout-2: two boxes, clicks go to the active one
            onActivate: function (v) { if (!v.tgActive) return; v.tgActive = false; jogCmd.pickPlane = false; renderPM(); } },
          { type: 'buttons', show: function (v) { return !!v.fixed; }, buttons: [{ label: 'Clear fixed face', onclick: function (v) { v.fixed = null; renderPM(); preview(); } }] },
          { type: 'check', label: 'Use default radius (' + sheet.bendRadius + ')', key: 'useDefaultRadius', rerender: true },
          { type: 'number', label: 'Bend radius', key: 'radiusValue', unit: 'u', min: 0, show: function (v) { return !v.useDefaultRadius; } }
        ] },
        { title: 'Jog Offset', fields: [
          // SolidWorks 2024: End condition, Reverse, the vertex / surface box, the distance, Dimension position
          { type: 'select', label: 'End condition', key: 'offsetEnd', options: JOG_OFFSET_ENDS, rerender: true },
          { type: 'check', label: 'Reverse direction', key: 'reverse' },
          { type: 'pick', icon: 'point', show: function (v) { return v.offsetEnd !== 'blind'; },
            placeholder: 'Select a vertex, face or plane…',
            value: function (v) { return v.offsetTarget == null ? '' : Array.isArray(v.offsetTarget) ? (v.offsetEnd === 'upToVertex' ? 'Vertex<1>' : 'Face<1>') : 'Plane: ' + jogPlaneName(v.offsetTarget); },
            active: function (v) { return !!v.tgActive; }, onActivate: function (v) { jogTargetOn(v); } },
          { type: 'number', label: 'Offset distance', key: 'offset', unit: 'u', min: 0, show: function (v) { return v.offsetEnd === 'blind'; } },
          { type: 'number', label: 'Offset distance', key: 'offsetDistance', unit: 'u', min: 0, show: function (v) { return v.offsetEnd === 'offsetFromSurface'; } },
          { type: 'check', label: 'Reverse offset', key: 'offsetFlip', show: function (v) { return v.offsetEnd === 'offsetFromSurface'; } },
          { type: 'select', label: 'Dimension position', key: 'offsetRef', options: JOG_OFFSET_REFS, rerender: true },
          { type: 'static', label: 'Smallest offset', value: minText, show: function (v) { return v.offsetEnd === 'blind'; } },
          { type: 'check', label: 'Fix projected length', key: 'fixProjected' }
        ] },
        { title: 'Jog Position', fields: [{ type: 'select', label: 'Jog position', key: 'position', options: SKETCHED_BEND_POSITIONS }] },
        { title: 'Jog Angle', fields: [{ type: 'number', label: 'Jog angle', key: 'angle', unit: '°', min: 0, max: 180 }] },
        { title: 'Custom Bend Allowance', collapsed: !f.useCustomBA, fields: [
          { type: 'check', label: 'Custom bend allowance', key: 'useCustomBA', rerender: true },
          { type: 'select', label: 'Type', key: 'cbaType', options: BA_OPTIONS, rerender: true, show: function (v) { return v.useCustomBA; } },
          { type: 'number', label: 'K-factor', key: 'cbaK', step: 0.01, min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'kfactor'; } },
          { type: 'number', label: 'Bend allowance', key: 'cbaBA', unit: 'u', min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'allowance'; } },
          { type: 'number', label: 'Bend deduction', key: 'cbaBD', unit: 'u', show: function (v) { return v.useCustomBA && v.cbaType === 'deduction'; } }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ];
      openPM({
        title: existing ? existing.name : 'Jog', icon: 'jog', values: f,
        exprMap: { radiusValue: 'radius' },
        message: 'Sketch <b>one line</b> on a flat face of the sheet where the jog starts. Click the <b>face that stays fixed</b> (default: the larger side); the other side is offset by two bends. <b>Fix projected length</b> keeps the jogged side\'s far end where it was (material is added); without it the jog uses up length and the flat keeps the plate\'s size. <b>Up To Vertex / Surface</b>: the jogged flange\'s far face goes to it (its near face with Inside Offset).',
        command: jogCmd = {
          sketchId: f.sketch,
          pickPlane: f.tgActive && f.offsetEnd !== 'upToVertex',
          pickRefGeo: true, refKinds: ['point'], pickVertices: function () { return f.offsetEnd === 'upToVertex' && !!f.tgActive; },
          onPick: function (pk) {
            if (f.tgActive && f.offsetEnd !== 'blind') {
              var tg = null;
              if (f.offsetEnd === 'upToVertex') { if (pk.kind !== 'face' && pk.kind !== 'edge' && pk.point) tg = pk.point; }
              else if (pk.kind === 'plane' && pk.ref != null) tg = pk.ref;
              else if (pk.kind === 'face' && pk.point) tg = pk.point;
              if (tg == null) return false;
              f.offsetTarget = Array.isArray(tg) ? tg.map(function (x) { return Math.round(x * 1e6) / 1e6; }) : tg;
              f.tgActive = false; jogCmd.pickPlane = false;
              renderPM(); preview();
              return true;
            }
            if (pk.kind !== 'face' || !pk.point) return false;
            f.fixed = pk.point.map(function (x) { return Math.round(x * 1e4) / 1e4; });
            renderPM(); preview();
            return true;
          }
        },
        groups: groups,
        onChange: function (v, key) {
          if (key === 'sketch' && App.command) { App.command.sketchId = v.sketch; UI.updateSketches(); }
          if (key === 'offsetEnd') {
            if (v.offsetEnd === 'blind') { v.tgActive = false; jogCmd.pickPlane = false; }
            else {
              // a vertex is no surface and back: the target goes when it no longer fits
              if (v.offsetTarget != null && (v.offsetEnd === 'upToVertex') !== (jogTargetKind === 'upToVertex')) v.offsetTarget = null;
              if (v.offsetTarget == null) jogTargetOn(v);
            }
            jogTargetKind = v.offsetEnd;
            renderPM();
          }
          preview();
        },
        onOK: function (v) {
          if (v.sketch == null || v.sketch < 0) { UI.toast('Select the sketch with the jog line.'); return false; }
          if (v.offsetEnd !== 'blind' && v.offsetTarget == null) { UI.toast(v.offsetEnd === 'upToVertex' ? 'Up To Vertex: select the vertex.' : 'Select the face or plane the jog goes to.'); return false; }
          if (v.offsetEnd === 'blind' && !(+v.offset > 0)) { UI.toast('Jog offset must be greater than zero.'); return false; }
          var feat = toFeature(v, true);
          if (!feat.name) delete feat.name;
          jogLast = { offset: feat.offset, offsetRef: feat.offsetRef, position: feat.position, angle: feat.angle };
          return commitFeature(feat, existing);
        }
      });
      preview();
    });
  }
  // lane dxfout-2: SolidWorks' Lofted-Bend PropertyManager (Kernel.buildLoftedBend / loftedBendFlat): Method (Formed /
  // Bent), Profiles (two sketches, each one open chain of lines and arcs), Faceting options (Number of bends per arc,
  // Segment length, Segment chord tolerance; Bent only), Thickness (the sheet's: set here when the part has none yet).
  var LB_FACETING_UI = [['count', 'Number of bends'], ['length', 'Segment length'], ['chord', 'Segment chord tolerance']];
  function cmdLoftedBend(existing) {
    var sks = dxfSketches();
    if (!existing && sks.length < 2) { UI.toast('Lofted-Bend: sketch two open profiles first (one in each sketch, on two planes).'); return; }
    var sheet0 = App.model.sheet, T0 = sheet0 ? +sheet0.thickness : Math.round(UI.lenDefault(1.5) * 1e4) / 1e4;
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'loftedBend', sketches: sks.slice(-2).map(function (s) { return s.id; }), method: 'bent', faceting: 'count', facetValue: 4 };
    f.p1 = String(f.sketches[0]); f.p2 = String(f.sketches[1]);
    f.method = f.method || 'bent'; f.faceting = f.faceting || 'count';
    if (f.facetValue == null) f.facetValue = 4;
    f.thickness = T0;
    function toFeature(v) {
      var out = { type: 'loftedBend', sketches: [+v.p1, +v.p2], method: v.method, faceting: v.faceting, facetValue: +v.facetValue };
      if (v.name) out.name = v.name;
      return out;
    }
    function pmModel(v) {
      var m = previewModel();
      if (!m.sheet) m = Object.assign({}, m, { sheet: K.makeSheet({ thickness: +v.thickness, bendRadius: +v.thickness, kFactor: 0.5 }) });
      return m;
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var tool = K.buildLoftedBend(toFeature(f), pmModel(f), { planes: (App.build && App.build.planes) || {}, sketches: {} });
        if (tool && tool.polygons.length) addPreviewMesh(tool, UI.mats.preview);
        UI.setStatus('Lofted-Bend preview: ' + (f.method === 'bent' ? 'bent facets' : 'formed') + '.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function sketchOpts() { return dxfSketches().map(function (s) { return [String(s.id), s.name]; }); }
    function isBent(v) { return v.method === 'bent'; }
    openPM({
      title: existing ? existing.name : 'Lofted-Bend', icon: 'loft', values: f,
      message: 'Pick the two <b>open profiles</b> (lines and arcs, one sketch each, with a small gap where the seam goes). They are the sheet\'s mid-surface. <b>Bent</b> makes flat facets with bend lines in the flat pattern; <b>Formed</b> a rolled transition without bend lines.',
      groups: [
        { title: 'Manufacturing Method', fields: [{ type: 'radio', key: 'method', rerender: true, options: [['formed', 'Formed'], ['bent', 'Bent']] }] },
        { title: 'Profiles', fields: [
          { type: 'select', label: 'Profile 1', key: 'p1', options: sketchOpts },
          { type: 'select', label: 'Profile 2', key: 'p2', options: sketchOpts }
        ] },
        { title: 'Faceting Options', show: isBent, fields: [
          { type: 'radio', key: 'faceting', rerender: true, show: isBent, options: LB_FACETING_UI },
          { type: 'number', label: 'Bends per arc', key: 'facetValue', min: 1, step: 1, show: function (v) { return isBent(v) && v.faceting === 'count'; } },
          { type: 'number', label: 'Segment length', key: 'facetValue', unit: 'u', min: 0, show: function (v) { return isBent(v) && v.faceting === 'length'; } },
          { type: 'number', label: 'Chord tolerance', key: 'facetValue', unit: 'u', min: 0, show: function (v) { return isBent(v) && v.faceting === 'chord'; } }
        ] },
        { title: 'Thickness', fields: sheet0 ? [{ type: 'static', label: 'Thickness', value: String(sheet0.thickness) + ' ' + UI.unitLabel() + ' (the sheet\'s)' }] : [{ type: 'number', label: 'Thickness', key: 'thickness', unit: 'u', min: 0 }] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (v) {
        if (v.p1 === v.p2) { UI.toast('Lofted-Bend: pick two different profiles.'); return false; }
        if (!(+v.facetValue > 0)) { UI.toast('Lofted-Bend: the faceting value must be greater than zero.'); return false; }
        if (!App.model.sheet) {
          if (!(+v.thickness > 0)) { UI.toast('Lofted-Bend: the thickness must be greater than zero.'); return false; }
          App.model.sheet = K.makeSheet({ thickness: +v.thickness, bendRadius: +v.thickness, kFactor: 0.5 });
        }
        var feat = toFeature(v);
        if (!feat.name && !existing) feat.name = 'Lofted-Bend' + (App.model.features.filter(function (q) { return q.type === 'loftedBend'; }).length + 1);
        return commitFeature(feat, existing);
      }
    });
    preview();
  }
  UI.cmdLoftedBend = cmdLoftedBend;
  // the Sheet Metal ribbon's Lofted-Bend button (ui-panels.js lists it without a command; it loads after this file)
  setTimeout(function wireLoftedBend() {
    var list = UI.RIBBON && UI.RIBBON['Sheet Metal'];
    if (!list) return;
    list.forEach(function (it) { if (it && it.id === 'loft' && !it.run) { it.run = function () { cmdLoftedBend(); }; it.help = 'Sheet metal lofted between two open profiles (square to round, transitions): Bent facets with bend lines, or Formed'; } });
  }, 0);
  // lane sweptflange: SolidWorks' Swept Flange PropertyManager (Kernel.buildSweptFlange / sweptFlangeFlat): Profile and
  // Path (a path sketch, or edges of the part picked in the viewport), Sheet Metal Parameters (thickness: the sheet's,
  // set here when the part has none; Reverse direction; Use default radius / Bend radius), Custom Bend Allowance,
  // Flat-Pattern Options (Flatten along path). Session memory sfLast (flip, flatten).
  var sfLast = {};
  function cmdSweptFlange(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var sks = dxfSketches();
    if (!existing && sks.length < 2) { UI.toast('Swept Flange: sketch the open profile (on a plane normal to the path at its start) and the path first.'); return; }
    var sheet0 = App.model.sheet, T0 = sheet0 ? +sheet0.thickness : Math.round(UI.lenDefault(1.5) * 1e4) / 1e4;
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'sweptFlange', profile: sks[sks.length - 1].id, path: sks[sks.length - 2].id, flip: !!sfLast.flip, flatten: sfLast.flatten || 'profile' };
    f.prof = String(f.profile); f.pathSk = f.path != null ? String(f.path) : String(sks.length > 1 ? sks[sks.length - 2].id : '');
    f.edges = (f.edges || []).map(function (e) { return { at: (e.at || e).slice() }; });
    f.pathKind = f.edges.length ? 'edges' : 'sketch';
    f.alongPath = f.flatten === 'path';
    f.useDefaultRadius = f.radius == null; f.radiusValue = f.radius != null ? +f.radius : (sheet0 ? +sheet0.bendRadius : T0);
    f.thickness = T0;
    var cba = f.bendAllowance || null, kSheet = sheet0 ? K.sheetKFactor(sheet0) : 0.5;
    f.useCustomBA = !!cba; f.cbaType = cba ? cba.type : 'kfactor';
    f.cbaK = cba && cba.type === 'kfactor' ? cba.value : kSheet;
    f.cbaBA = cba && cba.type === 'allowance' ? cba.value : Math.round(K.bendAllowance(Math.PI / 2, f.radiusValue, T0, kSheet) * 1e4) / 1e4;
    f.cbaBD = cba && cba.type === 'deduction' ? cba.value : Math.round(K.bendDeduction(Math.PI / 2, f.radiusValue, T0, K.bendAllowance(Math.PI / 2, f.radiusValue, T0, kSheet)) * 1e4) / 1e4;
    var CBA_KEY = { kfactor: 'cbaK', allowance: 'cbaBA', deduction: 'cbaBD' };
    function toFeature(v) {
      var out = { type: 'sweptFlange', profile: +v.prof, flip: !!v.flip, flatten: v.alongPath ? 'path' : 'profile' };
      if (v.pathKind === 'edges') out.edges = v.edges.map(function (e) { return { at: e.at.slice() }; }); else out.path = +v.pathSk;
      if (!v.useDefaultRadius) out.radius = +v.radiusValue;
      if (v.useCustomBA) { out.bendAllowance = { type: v.cbaType }; if (v.cbaType !== 'table') out.bendAllowance.value = +v[CBA_KEY[v.cbaType]]; }
      if (v.name) out.name = v.name;
      return out;
    }
    function pmModel(v) {
      var m = previewModel();
      if (!m.sheet) m = Object.assign({}, m, { sheet: K.makeSheet({ thickness: +v.thickness, bendRadius: +v.thickness, kFactor: 0.5 }) });
      return m;
    }
    var base = null;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : (App.build && App.build.body); return base; }
    function lit() {
      var list = f.pathKind === 'edges' ? (App.edges || []).filter(function (e) { return f.edges.some(function (q) { return K.pointSegmentDistance(q.at, e.a, e.b) <= 1e-4 * (1 + e.len); }); }) : [];
      if (App.command) App.command.edgeList = list;
      if (UI.updateHighlights) UI.updateHighlights();
    }
    function preview() {
      lit();
      UI.disposeGroup(UI.groups.preview);
      if (f.pathKind === 'edges' && !f.edges.length) { UI.setStatus('Swept Flange: click the edges of the part the flange runs along.'); return; }
      try {
        var tool = K.buildSweptFlange(toFeature(f), pmModel(f), { planes: (App.build && App.build.planes) || {}, sketches: {}, body: f.pathKind === 'edges' ? baseBody() : null });
        if (tool && tool.polygons.length) addPreviewMesh(tool, UI.mats.preview);
        UI.setStatus('Swept Flange preview. Press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function pick(pk) {
      if (f.pathKind !== 'edges' || pk.kind !== 'edge' || !pk.edge) return false;
      var e = pk.edge, i = -1;
      f.edges.forEach(function (q, k) { if (K.pointSegmentDistance(q.at, e.a, e.b) <= 1e-4 * (1 + e.len)) i = k; });
      if (i >= 0) f.edges.splice(i, 1); else f.edges.push({ at: e.mid.map(function (x) { return Math.round(x * 1e6) / 1e6; }) });
      renderPM(); preview();
      return true;
    }
    function sketchOpts() { return dxfSketches().map(function (s) { return [String(s.id), s.name]; }); }
    function isEdges(v) { return v.pathKind === 'edges'; }
    openPM({
      title: existing ? existing.name : 'Swept Flange', icon: 'sweptFlange', values: f,
      message: 'Pick the open <b>profile</b> (lines, arcs between them; sketched on a plane normal to the path at its start) and the <b>path</b> (a sketch of tangent lines and arcs, or edges of the part). The sketch line is one face of the sheet; each sharp corner gets the bend radius.',
      command: { pickEdges: true, edgeList: [], onPick: pick },
      groups: [
        { title: 'Profile and Path', fields: [
          { type: 'select', label: 'Profile', key: 'prof', options: sketchOpts },
          { type: 'radio', key: 'pathKind', rerender: true, options: [['sketch', 'Path sketch'], ['edges', 'Edges of the part']] },
          { type: 'select', label: 'Path', key: 'pathSk', options: sketchOpts, show: function (v) { return !isEdges(v); } },
          { type: 'pick', icon: 'sweptFlange', placeholder: 'Path edges…', show: isEdges,
            value: function (v) { var n = v.edges.length; return n ? n + ' edge' + (n === 1 ? '' : 's') : ''; },
            items: function (v) { return v.edges.map(function (e, i) { return { label: 'Edge<' + (i + 1) + '>', at: e.at }; }); },
            onRemove: function (v, i) { v.edges.splice(i, 1); renderPM(); preview(); },
            onClear: function (v) { v.edges.length = 0; renderPM(); preview(); } }
        ] },
        { title: 'Sheet Metal Parameters', fields: [
          sheet0 ? { type: 'static', label: 'Thickness', value: String(sheet0.thickness) + ' ' + UI.unitLabel() + ' (the sheet\'s)' } : { type: 'number', label: 'Thickness', key: 'thickness', unit: 'u', min: 0 },
          { type: 'check', label: 'Reverse direction', key: 'flip' },
          { type: 'check', label: 'Use default radius', key: 'useDefaultRadius', rerender: true },
          { type: 'number', label: 'Bend radius', key: 'radiusValue', unit: 'u', min: 0, show: function (v) { return !v.useDefaultRadius; } }
        ] },
        { title: 'Custom Bend Allowance', collapsed: !f.useCustomBA, fields: [
          { type: 'check', label: 'Custom bend allowance', key: 'useCustomBA', rerender: true },
          { type: 'select', label: 'Type', key: 'cbaType', options: BA_OPTIONS, rerender: true, show: function (v) { return v.useCustomBA; } },
          { type: 'number', label: 'K-factor', key: 'cbaK', step: 0.01, min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'kfactor'; } },
          { type: 'number', label: 'Bend allowance', key: 'cbaBA', unit: 'u', min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'allowance'; } },
          { type: 'number', label: 'Bend deduction', key: 'cbaBD', unit: 'u', show: function (v) { return v.useCustomBA && v.cbaType === 'deduction'; } }
        ] },
        { title: 'Flat-Pattern Options', fields: [
          { type: 'check', label: 'Flatten along path', key: 'alongPath' },
          { type: 'static', label: '', value: 'Off: the profile\'s bends are unbent (a straight path, or a ring in the path\'s plane). On: a one-line profile is developed along an arc path (cylinder, cone).' }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (v) {
        if (v.pathKind === 'edges' ? !v.edges.length : v.prof === v.pathSk) { UI.toast(v.pathKind === 'edges' ? 'Swept Flange: pick the path edges.' : 'Swept Flange: the profile and the path must be two sketches.'); return false; }
        if (!v.useDefaultRadius && !(+v.radiusValue >= 0)) { UI.toast('Swept Flange: the bend radius must be zero or more.'); return false; }
        if (!App.model.sheet) {
          if (!(+v.thickness > 0)) { UI.toast('Swept Flange: the thickness must be greater than zero.'); return false; }
          App.model.sheet = K.makeSheet({ thickness: +v.thickness, bendRadius: +v.thickness, kFactor: 0.5 });
        }
        sfLast = { flip: !!v.flip, flatten: v.alongPath ? 'path' : 'profile' };
        var feat = toFeature(v);
        if (!feat.name && !existing) feat.name = 'Swept Flange' + (App.model.features.filter(function (q) { return q.type === 'sweptFlange'; }).length + 1);
        return commitFeature(feat, existing);
      }
    });
    preview();
  }
  UI.cmdSweptFlange = cmdSweptFlange;
  // lane DL (fidelity #11): SolidWorks' Miter Flange. The flange section comes from a profile sketch (an open chain of
  // lines, tangent arcs between them, on a plane normal to an edge, starting on it: Kernel.miterFlangeStages); the PM
  // has SolidWorks' groups: Miter Parameters (the edges to run along, the profile sketch, Use default radius / Bend
  // radius, Flange position icons, Trim side bends, Gap distance), Start/End Offset, Custom Bend Allowance, Custom
  // Relief Type. With an edge selected and no sketch, it opens a sketch on the plane normal to the edge at its nearer end
  // (origin on the corner, x outward, y up from the face) and comes back on exit. An edge-only miter flange of an older
  // part (miter: true, no sketch) still edits in the Edge-Flange PM.
  var MITER_POSITIONS = [['inside', 'Material Inside', 'hemInside'], ['outside', 'Material Outside', 'hemOutside'], ['bendOutside', 'Bend Outside', 'bend']];
  var mfLast = null;   // the position / gap last accepted this session
  function cmdMiterFlange(existing, preEdges) {
    if (existing && !existing.miterFlange) { cmdEdgeFlange(existing, 'miter'); return; }
    if (!existing && !preEdges && App.mode !== 'sketch' && App.model.sheet && App.sel && App.sel.kind === 'edge' && App.sel.edge && selectedSketchId() == null) {
      var e = App.sel.edge, fa = App.mesh.faces[e.faces[0]], fb = App.mesh.faces[e.faces[1]];
      if (e.normals && fa && fb && !e.smooth) {
        var fl = fa.area >= fb.area ? 0 : 1, nF = e.normals[fl], o = e.normals[1 - fl], dir = K.vec.norm(K.vec.sub(e.b, e.a));
        var at = App.sel.point || e.a, V = K.vec.len(K.vec.sub(at, e.a)) <= K.vec.len(K.vec.sub(at, e.b)) ? e.a : e.b;
        var n = K.vec.cross(o, nF), plane = { custom: true, origin: V.slice(), x: o.slice(), y: nF.slice(), n: n, offset: K.vec.dot(n, V) };
        if (Math.abs(K.vec.dot(n, dir)) > 0.999) {
          if (K.tidyPlane) K.tidyPlane(plane);
          var edgeAt = e.mid.slice();
          closePM();
          UI.pushUndo();
          var sk = { id: App.model.nextId++, type: 'sketch', plane: plane, entities: [] };
          sk.name = K.featureName(App.model, 'sketch');
          App.model.features.push(sk);
          App.sketchSnapshot = JSON.stringify({ entities: [] });
          App.newSketchId = sk.id;
          App.pendingAfterSketch = function () { cmdMiterFlange(null, [{ at: edgeAt }]); };
          UI.afterRebuild(UI.rebuild(), function () { UI.enterSketch(sk.id); UI.setStatus('Miter Flange: sketch the flange profile from the corner (the origin), then exit the sketch.'); });
          return;
        }
      }
    }
    withSketch(function (sid) {
      if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
      var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;
      var f = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ type: 'flange', miterFlange: true, miter: true, sketch: pickDefaultSketch(sid), edges: preEdges || [], position: 'inside', radius: null, miterGap: K.closedCornerDefaultGap(App.model), startOffset: 0, endOffset: 0 }, mfLast || {});
      if (f.sketch == null) { UI.toast('Sketch the flange profile on a plane normal to an edge (or select the edge), then click Miter Flange.'); UI.setStatus('Miter Flange: select a straight edge of the sheet and click Miter Flange, or sketch the profile first.'); return; }
      if (!f.position) f.position = 'inside';
      if (f.miterGap == null) f.miterGap = K.closedCornerDefaultGap(App.model);
      if (f.startOffset == null) f.startOffset = 0;
      if (f.endOffset == null) f.endOffset = 0;
      f.useDefaultRadius = f.radius == null;
      f.radiusValue = f.radius != null ? f.radius : sheet.bendRadius;
      f.trimSideBends = !!f.trimSideBends;   // lane smtrim
      f.useOffset = !!(+f.startOffset || +f.endOffset);
      f.useCustomRelief = f.relief != null;
      if (!f.relief) f.relief = 'none';
      var cba = f.bendAllowance || null, kSheet = K.sheetKFactor(sheet), R0 = +sheet.bendRadius, BA0 = K.bendAllowance(Math.PI / 2, R0, T, kSheet);
      f.useCustomBA = !!cba;
      f.cbaType = cba ? cba.type : 'kfactor';
      f.cbaK = cba && cba.type === 'kfactor' ? cba.value : kSheet;
      f.cbaBA = cba && cba.type === 'allowance' ? cba.value : Math.round(BA0 * 1e4) / 1e4;
      f.cbaBD = cba && cba.type === 'deduction' ? cba.value : Math.round(K.bendDeduction(Math.PI / 2, R0, T, BA0) * 1e4) / 1e4;
      delete f.bendAllowance;
      var CBA_KEY = { kfactor: 'cbaK', allowance: 'cbaBA', deduction: 'cbaBD' };
      var edgeList = [];
      function sharpEdges() { return (App.edges || []).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; }); }
      function resolveList() {
        try { edgeList = existing ? [] : K.resolveEdges(f.edges.map(function (e) { return { at: e.at, chain: false }; }), sharpEdges(), K.pickTol(App.model.units, T)); } catch (err) { edgeList = []; }
        if (App.command) App.command.edgeList = edgeList;
        UI.updateHighlights();
      }
      function items(v) {
        return v.edges.map(function (spec, i) { return { label: 'Edge<' + (i + 1) + '>', at: spec.at, get edges() { try { return existing ? [] : K.resolveEdges([{ at: spec.at, chain: false }], sharpEdges(), K.pickTol(App.model.units, T)); } catch (err) { return []; } } }; });
      }
      function toFeature(v, forOK) {
        var out = JSON.parse(JSON.stringify(v));
        out.type = 'flange'; out.miterFlange = true; out.miter = true;
        out.sketch = +v.sketch;
        out.position = MITER_POSITIONS.some(function (p) { return p[0] === v.position; }) ? v.position : 'inside';
        out.radius = v.useDefaultRadius ? null : +v.radiusValue;
        out.miterGap = forOK ? pmExpr('miterGap', Math.max(0, +v.miterGap || 0)) : Math.max(0, +v.miterGap || 0);
        out.startOffset = v.useOffset ? (forOK ? pmExpr('startOffset', +v.startOffset || 0) : +v.startOffset || 0) : 0;
        out.endOffset = v.useOffset ? (forOK ? pmExpr('endOffset', +v.endOffset || 0) : +v.endOffset || 0) : 0;
        if (v.useCustomRelief) out.relief = ['none', 'rect', 'obround'].indexOf(v.relief) >= 0 ? v.relief : 'none';
        else { delete out.relief; delete out.reliefWidth; delete out.reliefDepth; }
        if (v.useCustomBA) {
          out.bendAllowance = { type: v.cbaType };
          if (v.cbaType !== 'table') out.bendAllowance.value = forOK ? pmExpr(CBA_KEY[v.cbaType], +v[CBA_KEY[v.cbaType]]) : +v[CBA_KEY[v.cbaType]];
        } else delete out.bendAllowance;
        var trimSB = !!v.trimSideBends;
        ['useDefaultRadius', 'radiusValue', 'trimSideBends', 'useOffset', 'useCustomRelief', 'useCustomBA', 'cbaType', 'cbaK', 'cbaBA', 'cbaBD', 'length', 'angle', 'lengthRef', 'toward', 'reverse'].forEach(function (k) { delete out[k]; });
        if (trimSB) out.trimSideBends = true;
        return out;
      }
      function previewStatus(feat, info) {
        var n = info ? info.length : (feat.edges || []).length;
        UI.setStatus('Miter Flange preview: ' + n + ' bend' + (n === 1 ? '' : 's') + ', ' + MITER_POSITIONS.filter(function (p) { return p[0] === feat.position; })[0][1].toLowerCase() +
          (+feat.miterGap > 0 ? ', gap ' + UI.fmtNum(+feat.miterGap, 4) : '') + (+feat.startOffset || +feat.endOffset ? ', offsets ' + UI.fmtNum(+feat.startOffset, 4) + ' / ' + UI.fmtNum(+feat.endOffset, 4) : '') + '.');
      }
      function previewSync() {
        UI.disposeGroup(UI.groups.preview);
        try {
          var feat = toFeature(f), body = existing ? bodyBefore(existing.id) : (App.build ? App.build.body : null);
          if (!body) throw new Error('Create a Base Flange first.');
          var ctx = { body: body, flanges: {}, tools: {}, sketches: {}, planes: (App.build && App.build.planes) || {} };
          var tool = K.buildFlange(feat, previewModel(), ctx);
          addPreviewMesh(tool, UI.mats.preview);
          previewStatus(feat, ctx.flanges[feat.id]);
        } catch (err) { UI.setStatus('Preview: ' + err.message); }
      }
      function preview() {
        var feat;
        try { feat = toFeature(f); } catch (err) { UI.setStatus('Preview: ' + err.message); return; }
        if (feat.sketch == null || feat.sketch < 0) { UI.disposeGroup(UI.groups.preview); return; }
        var upto = null;
        if (existing) App.model.features.forEach(function (g, i) { if (g.id === existing.id) upto = i; });
        livePreview({ op: 'flange', feature: feat, upto: upto, mats: [UI.mats.preview], sync: previewSync, done: function () { try { previewStatus(feat); } catch (err) { } } });
      }
      var groups = [
        { title: 'Miter Parameters', fields: [
          { type: 'pick', icon: 'miter', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Along edges (the profile\'s edge is added)…', items: items,
            onRemove: function (v, i) { v.edges.splice(i, 1); renderPM(); resolveList(); preview(); }, onClear: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } },
          sketchPickerField(f),
          { type: 'check', label: 'Use default radius (' + sheet.bendRadius + ')', key: 'useDefaultRadius', rerender: true },
          { type: 'number', label: 'Bend radius', key: 'radiusValue', unit: 'u', min: 0, show: function (v) { return !v.useDefaultRadius; } },
          { type: 'iconRadio', label: 'Flange position', key: 'position', options: MITER_POSITIONS },
          { type: 'check', label: 'Trim side bends', key: 'trimSideBends' },
          { type: 'number', label: 'Gap distance', key: 'miterGap', unit: 'u', min: 0 }
        ] },
        { title: 'Start/End Offset', fields: [
          { type: 'check', label: 'Start/End offset', key: 'useOffset', rerender: true },
          { type: 'number', label: 'Start offset distance', key: 'startOffset', unit: 'u', min: 0, show: function (v) { return v.useOffset; } },
          { type: 'number', label: 'End offset distance', key: 'endOffset', unit: 'u', min: 0, show: function (v) { return v.useOffset; } }
        ] },
        { title: 'Custom Bend Allowance', collapsed: !f.useCustomBA, fields: [
          { type: 'check', label: 'Custom bend allowance', key: 'useCustomBA', rerender: true },
          { type: 'select', label: 'Type', key: 'cbaType', options: BA_OPTIONS, rerender: true, show: function (v) { return v.useCustomBA; } },
          { type: 'number', label: 'K-factor', key: 'cbaK', step: 0.01, min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'kfactor'; } },
          { type: 'number', label: 'Bend allowance', key: 'cbaBA', unit: 'u', min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'allowance'; } },
          { type: 'number', label: 'Bend deduction', key: 'cbaBD', unit: 'u', show: function (v) { return v.useCustomBA && v.cbaType === 'deduction'; } }
        ] },
        { title: 'Custom Relief Type', collapsed: !f.useCustomRelief, fields: [
          { type: 'check', label: 'Custom relief type', key: 'useCustomRelief', rerender: true },
          { type: 'select', label: 'Relief type', key: 'relief', options: CUSTOM_RELIEFS, show: function (v) { return v.useCustomRelief; } }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ];
      openPM({
        title: existing ? existing.name : 'Miter Flange', icon: 'miter', values: f,
        exprMap: { radiusValue: 'radius' },
        message: 'The <b>profile sketch</b> sets the flange section: its first line is the flange length (to the inner virtual sharp), each further line adds a bend. Click the <b>edges</b> to run along; flanges on adjacent edges are mitred at the corner with the gap.',
        command: {
          sketchId: f.sketch, pickEdges: true, edgeList: edgeList,
          onPick: function (pk) {
            if (pk.kind !== 'edge') return false;
            var e = pk.edge, idx = -1;
            f.edges.forEach(function (spec, i) { if (K.pointSegmentDistance(spec.at, e.a, e.b) < 0.5 * T) idx = i; });
            if (idx >= 0) f.edges.splice(idx, 1); else f.edges.push({ at: e.mid.slice() });
            renderPM(); resolveList(); preview();
            return true;
          }
        },
        groups: groups,
        onChange: function (v, key) {
          if (key === 'sketch' && App.command) { App.command.sketchId = v.sketch; UI.updateSketches(); }
          resolveList(); preview();
        },
        onOK: function (v) {
          if (v.sketch == null || v.sketch < 0) { UI.toast('Select the profile sketch.'); return false; }
          var feat = toFeature(v, true);
          if (!feat.name) feat.name = 'Miter Flange' + (App.model.features.filter(function (q) { return q.type === 'flange' && q.miterFlange; }).length + 1);
          if (!existing) mfLast = { position: feat.position, miterGap: +feat.miterGap || 0 };
          return commitFeature(feat, existing);
        }
      });
      resolveList(); preview();
    });
  }

  // ------------------------------------------------------------------ sheet metal: sketched bend
  // Sketched Bend (SolidWorks): bend the sheet along the line(s) of a sketch drawn on one of its flat faces. Bend
  // Parameters in SolidWorks order: the sketch, Fixed face (a click on the sheet stores that point as `fixed`; none =
  // the larger side stays put), Bend position, Reverse direction, Bend angle, the radius; then Custom Bend Allowance
  // (as Edge Flange). The preview (what moves, with the bends) is built on the main thread.
  var SKETCHED_BEND_POSITIONS = [['centerline', 'Bend Centerline'], ['inside', 'Material Inside'], ['outside', 'Material Outside'], ['bendOutside', 'Bend Outside']];
  function cmdSketchedBend(existing) {
    withSketch(function (sid) {
      if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
      var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;   // resolved: the sheet parameters may be equations
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'sketchedBend', sketch: pickDefaultSketch(sid), fixed: null, position: 'centerline', angle: 90, reverse: false, radius: null };
      if (f.sketch == null) { UI.toast('Sketch the bend line(s) on a flat face of the sheet first, then click Sketched Bend.'); return; }
      if (!f.position) f.position = 'centerline';
      f.useDefaultRadius = f.radius == null;
      f.radiusValue = f.radius != null ? f.radius : sheet.bendRadius;
      var cba = f.bendAllowance || null, kSheet = K.sheetKFactor(sheet), R0 = +sheet.bendRadius, BA0 = K.bendAllowance(Math.PI / 2, R0, T, kSheet);
      f.useCustomBA = !!cba;
      f.cbaType = cba ? cba.type : 'kfactor';
      f.cbaK = cba && cba.type === 'kfactor' ? cba.value : kSheet;
      f.cbaBA = cba && cba.type === 'allowance' ? cba.value : Math.round(BA0 * 1e4) / 1e4;
      f.cbaBD = cba && cba.type === 'deduction' ? cba.value : Math.round(K.bendDeduction(Math.PI / 2, R0, T, BA0) * 1e4) / 1e4;
      delete f.bendAllowance;
      var CBA_KEY = { kfactor: 'cbaK', allowance: 'cbaBA', deduction: 'cbaBD' };
      // the part the bend is made on: as it stands, or (editing) as it was before this feature
      var base = null;
      function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : (App.build ? App.build.body : null); return base; }
      function toFeature(v, forOK) {
        var out = JSON.parse(JSON.stringify(v));
        out.radius = v.useDefaultRadius ? null : +v.radiusValue;
        out.fixed = v.fixed ? v.fixed.slice() : null;
        if (v.useCustomBA) {
          out.bendAllowance = { type: v.cbaType };
          if (v.cbaType !== 'table') out.bendAllowance.value = forOK ? pmExpr(CBA_KEY[v.cbaType], +v[CBA_KEY[v.cbaType]]) : +v[CBA_KEY[v.cbaType]];
        } else delete out.bendAllowance;
        // UI-only keys must never reach the model (feature JSON is the rebuild cache key)
        delete out.useDefaultRadius; delete out.radiusValue;
        delete out.useCustomBA; delete out.cbaType; delete out.cbaK; delete out.cbaBA; delete out.cbaBD;
        return out;
      }
      function lineCount(v) {
        var sk = K.findFeature(App.model, v.sketch);
        return sk && sk.entities ? sk.entities.filter(function (e) { return e.t === 'line' && !e.construction; }).length : 0;
      }
      function bendText(feat) {
        var R = +(feat.radius != null ? feat.radius : sheet.bendRadius), A = (feat.angle == null ? 90 : +feat.angle) * Math.PI / 180, bc;
        try { bc = K.bendCalc(sheet, A, R, T, feat.bendAllowance); } catch (e) { return ' · ' + e.message; }
        return ' · bend allowance ' + UI.fmtNum(bc.BA, 4) + ' ' + UI.unitLabel() + ' (BD ' + UI.fmtNum(bc.BD, 4) + ', ' + (bc.source === 'custom' ? 'custom ' : '') + (bc.type === 'kfactor' ? 'K-Factor ' + UI.fmtNum(bc.K, 4) : BA_NAMES[bc.type]) + ')';
      }
      function preview() {
        UI.disposeGroup(UI.groups.preview);
        var feat = toFeature(f), n = lineCount(f);
        try {
          if (!baseBody()) throw new Error('Create a Base Flange first.');
          var r = K.buildSketchedBend(feat, previewModel(), { body: baseBody(), sketches: {}, planes: (App.build && App.build.planes) || {}, flanges: {}, tools: {} });
          if (r.preview && r.preview.polygons.length) addPreviewMesh(r.preview, UI.mats.preview);
          UI.setStatus('Sketched Bend preview: ' + n + ' bend line' + (n === 1 ? '' : 's') + ', ' + (f.fixed ? 'fixed face picked' : 'the larger side fixed') + bendText(feat) + '.');
        } catch (e) { UI.setStatus('Preview: ' + e.message); }
      }
      var groups = [
        { title: 'Bend Parameters', fields: [
          sketchPickerField(f),
          { type: 'pick', icon: 'sketchedBend', value: function (v) { return v.fixed ? 'Fixed face <1>' : ''; }, placeholder: 'Fixed face (default: the larger side)…' },
          { type: 'buttons', show: function (v) { return !!v.fixed; }, buttons: [{ label: 'Clear fixed face', onclick: function (v) { v.fixed = null; renderPM(); preview(); } }] },
          { type: 'select', label: 'Bend position', key: 'position', options: SKETCHED_BEND_POSITIONS },
          { type: 'check', label: 'Reverse direction', key: 'reverse' },
          { type: 'number', label: 'Bend angle', key: 'angle', unit: '°', min: 0, max: 180 },
          { type: 'check', label: 'Use default radius (' + sheet.bendRadius + ')', key: 'useDefaultRadius', rerender: true },
          { type: 'number', label: 'Bend radius', key: 'radiusValue', unit: 'u', min: 0, show: function (v) { return !v.useDefaultRadius; } }
        ] },
        { title: 'Custom Bend Allowance', collapsed: !f.useCustomBA, fields: [
          { type: 'check', label: 'Custom bend allowance', key: 'useCustomBA', rerender: true },
          { type: 'select', label: 'Type', key: 'cbaType', options: BA_OPTIONS, rerender: true, show: function (v) { return v.useCustomBA; } },
          { type: 'number', label: 'K-factor', key: 'cbaK', step: 0.01, min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'kfactor'; } },
          { type: 'number', label: 'Bend allowance', key: 'cbaBA', unit: 'u', min: 0, show: function (v) { return v.useCustomBA && v.cbaType === 'allowance'; } },
          { type: 'number', label: 'Bend deduction', key: 'cbaBD', unit: 'u', show: function (v) { return v.useCustomBA && v.cbaType === 'deduction'; } },
          { type: 'static', label: 'Bend table', value: sheet.bendTable ? sheet.bendTable.rows.length + ' rows (the part\'s table)' : 'none — add one in Sheet-Metal', show: function (v) { return v.useCustomBA && v.cbaType === 'table'; } }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ];
      openPM({
        title: existing ? existing.name : 'Sketched Bend', icon: 'sketchedBend', values: f,
        exprMap: { radiusValue: 'radius' },   // (cbaK / cbaBA / cbaBD: toFeature(v, true))
        message: 'Sketch <b>straight lines</b> on a flat face of the sheet; it bends along each line, extended to the face edges. Click the <b>face that stays fixed</b> (default: the larger side). The flat pattern keeps the plate\'s size.',
        command: {
          sketchId: f.sketch,
          onPick: function (pk) {
            if (pk.kind !== 'face' || !pk.point) return false;
            f.fixed = pk.point.map(function (x) { return Math.round(x * 1e4) / 1e4; });
            renderPM(); preview();
            return true;
          }
        },
        groups: groups,
        onChange: function (v, key) {
          if (key === 'sketch' && App.command) { App.command.sketchId = v.sketch; UI.updateSketches(); }
          preview();
        },
        onOK: function (v) {
          if (v.sketch == null || v.sketch < 0) { UI.toast('Select the sketch with the bend line(s).'); return false; }
          var feat = toFeature(v, true);
          if (!feat.name) delete feat.name;
          return commitFeature(feat, existing);
        }
      });
    });
  }

  // ------------------------------------------------------------------ sheet metal: Break-Corner / Corner-Trim (lane CP)
  // SolidWorks' Sheet Metal ▸ Corners ▸ Break-Corner/Corner-Trim (Kernel.buildBreakCorner, a cut): Corner Edges /
  // Faces (a click on a corner edge — the short edge through the thickness at an outside corner — adds it, or on a
  // flat sheet face, which takes every outside corner of that face; a second click removes it), Break type (Chamfer /
  // Fillet) and Distance / Radius. The preview is the material that goes (built in the worker); ✓ is one undo step;
  // the type and size are remembered for the next Break-Corner of the session.
  var bcLast = { kind: 'chamfer', size: null };
  function cmdBreakCorner(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.build || !App.build.body) { UI.toast('Create a Base Flange first.'); return; }
    var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'breakCorner', kind: bcLast.kind, size: bcLast.size != null ? bcLast.size : UI.lenDefault(5), corners: [] };
    f.corners = (f.corners || []).map(function (p) { return p.slice(); });
    f.faces = (f.faces || []).map(function (p) { return p.slice(); });
    // the part the break is made on: as it stands, or (editing) as it was before this feature; its outside corners
    var base = null, cands = null;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
    function corners() {
      if (!cands) { try { cands = K.breakCornerCandidates(baseBody(), App.model); } catch (e) { cands = []; } }
      return cands;
    }
    function near(p, c) { return K.pointSegmentDistance(p, c.top, c.bot) <= 0.75 * T; }
    function cornerAt(p) { var best = null, bd = 0.75 * T; corners().forEach(function (c) { var d = K.pointSegmentDistance(p, c.top, c.bot); if (d <= bd) { bd = d; best = c; } }); return best; }
    // the corners a face pick takes (the kernel's own face rule), or the reason it takes none; kept per point until
    // the part shown changes (onRollback)
    var faceMemo = {};
    function faceCorners(p) {
      var key = p.join(',');
      if (faceMemo[key]) return faceMemo[key];
      try {
        var lay = K.breakCornerLayout({ kind: 'chamfer', size: 1e-6 * (1 + T), faces: [p] }, previewModel(), { body: baseBody() });
        faceMemo[key] = { list: lay.corners.map(function (c) { return cornerAt(c.at) || { at: c.at, top: c.top, bot: c.bot }; }) };
      } catch (e) { faceMemo[key] = { error: e.message }; }
      return faceMemo[key];
    }
    function featOf(v) {
      var out = { type: 'breakCorner', kind: v.kind, size: v.size, corners: v.corners.map(function (p) { return p.slice(); }) };
      if (v.faces.length) out.faces = v.faces.map(function (p) { return p.slice(); });
      if (v.name) out.name = v.name;
      return out;
    }
    // the model's corner edges lit while the PM is open: every picked corner and every corner of a picked face
    function lit() {
      var at = f.corners.slice();
      f.faces.forEach(function (p) { var r = faceCorners(p); (r.list || []).forEach(function (c) { at.push(c.at); }); });
      var list = (App.edges || []).filter(function (e) { return e.faces.length === 2 && at.some(function (p) { return K.pointSegmentDistance(e.mid, p, p) <= 0.6 * T && e.len <= 1.5 * T; }); });
      if (App.command) App.command.edgeList = list;
      UI.updateHighlights();
    }
    function status(extra) {
      var n = f.corners.length, m = f.faces.length;
      UI.setStatus((extra ? extra + ' ' : '') + 'Break-Corner: ' + n + ' corner' + (n === 1 ? '' : 's') + (m ? ' and ' + m + ' face' + (m === 1 ? '' : 's') : '') + ' picked. Press Enter or ✓ to accept.');
    }
    function preview() {
      lit();
      if (!f.corners.length && !f.faces.length) { lp.shown = ++lp.seq; UI.disposeGroup(UI.groups.preview); UI.setStatus('Click corner edges (through the thickness) or flat faces of the sheet to break their corners.'); return; }
      livePreview({ op: 'tool', feature: featOf(f), mats: [UI.mats.previewCut], sync: previewSync, done: function () { status(); }, fail: function (msg) { UI.setStatus('Preview: ' + msg); } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var tool = K.buildBreakCorner(featOf(f), previewModel(), { body: baseBody() });
        if (tool && tool.polygons.length) addPreviewMesh(tool, UI.mats.previewCut);
        status();
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function toggleCorner(p) {
      var i = -1;
      f.corners.forEach(function (q, k) { var c = cornerAt(q); if (c && near(p, c)) i = k; });
      if (i >= 0) f.corners.splice(i, 1); else f.corners.push(p.map(function (x) { return Math.round(x * 1e6) / 1e6; }));
    }
    function pick(pk) {
      if (pk.kind === 'edge' && pk.edge) {
        var c = cornerAt(pk.edge.mid);
        if (!c || pk.edge.len > 1.5 * T) { UI.setStatus('That edge is not a corner edge: click the short edge through the thickness at an outside corner, or a flat face.'); return true; }
        toggleCorner(c.at);
      } else if (pk.kind === 'face' && pk.point) {
        var r = faceCorners(pk.point);
        if (r.error) { UI.setStatus(r.error.replace(/^Break Corner: /, '')); return true; }
        var key = function (list) { return list.map(function (c) { return c.at.map(function (x) { return Math.round(x * 1e4); }).join(','); }).sort().join(';'); }, mine = key(r.list), hit = -1;
        f.faces.forEach(function (q, k) { var o = faceCorners(q); if (o.list && key(o.list) === mine) hit = k; });
        if (hit >= 0) f.faces.splice(hit, 1); else f.faces.push(pk.point.map(function (x) { return Math.round(x * 1e6) / 1e6; }));
      } else return false;
      renderPM(); preview();
      return true;
    }
    // r9/polish9 (as Fillet): pre-selected corner edges and faces move into the PropertyManager
    if (!existing && UI.selection) {
      var pre = UI.selection(), used = false;
      pre.forEach(function (s) {
        if (s.kind === 'edge' && s.edge) { var c = cornerAt(s.edge.mid); if (c && s.edge.len <= 1.5 * T) { toggleCorner(c.at); used = true; } }
        else if (s.kind === 'face' && App.mesh && App.mesh.faces[s.index]) { var fc = App.mesh.faces[s.index], r = faceCorners(fc.centroid); if (r.list) { f.faces.push(fc.centroid.slice()); used = true; } }
      });
      if (used && UI.setSelection) UI.setSelection([]);
    }
    var KINDS = [['chamfer', 'Chamfer', 'chamfer'], ['fillet', 'Fillet', 'fillet']];
    openPM({
      title: existing ? existing.name : 'Break Corner', icon: 'breakCorner', values: f,
      onRollback: function () { cands = null; faceMemo = {}; lit(); },
      message: 'Click <b>corner edges</b> (the short edges through the thickness at outside corners) or <b>flat faces</b> of the sheet (every outside corner of the face). Choose the break type and its size.',
      command: { pickEdges: true, edgeList: [], onPick: pick },
      groups: [
        { title: 'Break Corner Options', fields: [
          { type: 'pick', icon: 'breakCorner', placeholder: 'Corner edges and / or flange faces…',
            value: function (v) { var n = v.corners.length + v.faces.length; return n ? n + ' item' + (n === 1 ? '' : 's') : ''; },
            items: function (v) {
              return v.corners.map(function (p, i) { return { label: 'Corner<' + (i + 1) + '>', at: p }; })
                .concat(v.faces.map(function (p, i) { return { label: 'Face<' + (i + 1) + '>', at: p }; }));
            },
            onRemove: function (v, i) { if (i < v.corners.length) v.corners.splice(i, 1); else v.faces.splice(i - v.corners.length, 1); renderPM(); preview(); },
            onClear: function (v) { v.corners.length = 0; v.faces.length = 0; renderPM(); preview(); } },
          { type: 'iconRadio', label: 'Break type', key: 'kind', options: KINDS, rerender: true },
          { type: 'number', label: 'Distance', key: 'size', unit: 'u', min: 0, show: function (v) { return v.kind === 'chamfer'; } },
          { type: 'number', label: 'Radius', key: 'size', unit: 'u', min: 0, show: function (v) { return v.kind === 'fillet'; } },
          { type: 'buttons', buttons: [{ label: 'Clear selections', onclick: function (v) { v.corners.length = 0; v.faces.length = 0; renderPM(); preview(); } }] }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (v) {
        if (!v.corners.length && !v.faces.length) { UI.toast('Select at least one corner edge or face.'); return false; }
        if (!(+v.size > 0)) { UI.toast('The ' + (v.kind === 'fillet' ? 'radius' : 'distance') + ' must be more than 0.'); return false; }
        var feat = featOf(v);
        feat.size = +v.size;   // an equation typed in the box goes back in through commitFeature (applyExpressions)
        if (!existing && !feat.name) feat.name = K.breakCornerName(App.model);
        bcLast = { kind: v.kind, size: +v.size };
        return commitFeature(feat, existing);
      }
    });
    preview();
  }

  // ------------------------------------------------------------------ sheet metal: Corner Relief (lane smtrim)
  // SolidWorks' Sheet Metal ▸ Corners ▸ Corner Relief (Kernel.cornerReliefLayout, a registered cut): Corner Type (2 Bend
  // corner), Scope (the sheet body), Corners (a click near a corner where two bends meet adds it, a second click
  // removes it; Collect all corners takes every such corner of the part), Relief Options (Rectangular, Circular, Tear,
  // Obround, Constant Width; Centered on bend lines; size). The preview is built on the main thread; ✓ is one undo
  // step; type, size and centring are remembered for the next Corner Relief of the session.
  var crLast = { reliefType: 'rect', size: null, centeredOnBend: true };
  var CR_TYPES = [['rect', 'Rectangular'], ['circular', 'Circular'], ['tear', 'Tear'], ['obround', 'Obround'], ['constantWidth', 'Constant Width']];
  function cmdCornerRelief(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.build || !App.build.body) { UI.toast('Create a Base Flange first.'); return; }
    var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'cornerRelief', corners: [], reliefType: crLast.reliefType, size: crLast.size != null ? crLast.size : Math.round(2 * T * 1e4) / 1e4, centeredOnBend: crLast.centeredOnBend };
    f.corners = (f.corners || []).map(function (p) { return p.slice(); });
    if (f.size == null) f.size = Math.round(2 * T * 1e4) / 1e4;
    f.centeredOnBend = f.centeredOnBend !== false;
    f.cornerType = existing && existing.cornerType === '3bend' ? '3bend' : '2bend';   // lane smcorner-2: 3 Bend corner
    function flangesNow() { return Object.assign({}, (App.build && App.build.flanges) || {}); }
    function base() { return existing ? bodyBefore(existing.id) : App.build.body; }
    var cands = {};
    function corners() {
      var ct = f.cornerType;
      if (!cands[ct]) { try { cands[ct] = K.cornerReliefCandidates(App.model, { flanges: flangesNow() }, ct); } catch (e) { cands[ct] = []; } }
      return cands[ct];
    }
    function three() { return f.cornerType === '3bend'; }
    function where() { return three() ? 'three bends meet' : 'two bends meet'; }
    function cornerNear(p) {
      var best = null, lim = 6 * (+sheet.bendRadius + T) + (+f.size || 0);
      corners().forEach(function (c) { var d = K.dist ? K.dist(c.at, p) : Math.sqrt(Math.pow(c.at[0] - p[0], 2) + Math.pow(c.at[1] - p[1], 2) + Math.pow(c.at[2] - p[2], 2)); if (d <= lim && (!best || d < best.d)) best = { d: d, c: c }; });
      return best && best.c;
    }
    function sameCorner(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-4 * (1 + T); }
    function featOf(v) {
      var out = { type: 'cornerRelief', corners: v.corners.map(function (p) { return p.slice(); }), reliefType: v.reliefType, size: +v.size };
      if (v.cornerType === '3bend') out.cornerType = '3bend';
      if (v.centeredOnBend === false) out.centeredOnBend = false;
      if (v.name) out.name = v.name;
      return out;
    }
    function status(extra) {
      var n = f.corners.length;
      UI.setStatus((extra ? extra + ' ' : '') + 'Corner Relief: ' + n + ' corner' + (n === 1 ? '' : 's') + ' selected. Press Enter or ✓ to accept.');
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      if (!f.corners.length) { UI.setStatus('Click near the corners where ' + where() + ', or Collect all corners.'); return; }
      try {
        var tool = K.buildCornerRelief(featOf(f), previewModel(), { body: base(), flanges: flangesNow() });
        if (tool && tool.polygons.length) addPreviewMesh(tool, UI.mats.previewCut);
        status();
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function toggle(p) {
      var c = cornerNear(p);
      if (!c) { UI.setStatus(three() ? 'No corner where three bends meet there: click near the end of a bend where edge flanges on the end edges meet it.' : 'No corner where two bends meet there: click near the corner of two flanges on neighbouring edges.'); return; }
      var i = -1;
      f.corners.forEach(function (q, k) { if (sameCorner(q, c.at)) i = k; });
      if (i >= 0) f.corners.splice(i, 1); else f.corners.push(c.at.map(function (x) { return Math.round(x * 1e6) / 1e6; }));
    }
    function collectAll(v) {
      var all = corners();
      if (!all.length) { UI.toast('The part has no corner where ' + where() + '.'); return; }
      v.corners = all.map(function (c) { return c.at.map(function (x) { return Math.round(x * 1e6) / 1e6; }); });
      f.corners = v.corners;
      renderPM(); preview();
    }
    function pick(pk) {
      var p = pk.kind === 'edge' && pk.edge ? pk.edge.mid : pk.kind === 'face' && pk.point ? pk.point : null;
      if (!p) return false;
      toggle(p);
      renderPM(); preview();
      return true;
    }
    openPM({
      title: existing ? existing.name : 'Corner Relief', icon: 'cornerRelief', values: f,
      onRollback: function () { cands = {}; },
      message: 'Choose the corner type, click near the <b>corners</b> where the bends meet (or <b>Collect all corners</b>), then choose the relief.',
      command: { pickEdges: true, edgeList: [], onPick: pick },
      groups: [
        { title: 'Corner Type', fields: [{ type: 'radio', key: 'cornerType', options: [['2bend', '2 Bend corner'], ['3bend', '3 Bend corner']], rerender: true }] },
        { title: 'Scope', fields: [{ type: 'static', label: 'Body', value: 'Sheet-metal body' }] },
        { title: 'Corners', fields: [
          { type: 'pick', icon: 'cornerRelief', placeholder: 'Corners…',
            value: function (v) { var n = v.corners.length; return n ? n + ' corner' + (n === 1 ? '' : 's') : ''; },
            items: function (v) { return v.corners.map(function (p, i) { return { label: 'Corner<' + (i + 1) + '>', at: p }; }); },
            onRemove: function (v, i) { v.corners.splice(i, 1); renderPM(); preview(); },
            onClear: function (v) { v.corners.length = 0; renderPM(); preview(); } },
          { type: 'buttons', buttons: [{ label: 'Collect all corners', onclick: function (v) { collectAll(v); } }] }
        ] },
        { title: 'Relief Options', fields: [
          { type: 'select', label: 'Relief type', key: 'reliefType', options: function (v) { return v.cornerType === '3bend' ? CR_TYPES.filter(function (o) { return K.CORNER3_TYPES.indexOf(o[0]) >= 0; }) : CR_TYPES; }, rerender: true },
          { type: 'check', label: 'Centered on bend lines', key: 'centeredOnBend', show: function (v) { return v.reliefType !== 'tear' && v.reliefType !== 'constantWidth'; } },
          { type: 'number', label: 'Size', key: 'size', unit: 'u', min: 0, show: function (v) { return v.reliefType !== 'tear'; } }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v, key) {
        // a new corner type: its own corners, and a relief type it offers
        if (key === 'cornerType') {
          v.corners.length = 0;
          if (v.cornerType === '3bend' && K.CORNER3_TYPES.indexOf(v.reliefType) < 0) v.reliefType = 'rect';
          renderPM();
        }
        preview();
      },
      onOK: function (v) {
        if (!v.corners.length) { UI.toast('Select at least one corner (or Collect all corners).'); return false; }
        if (v.reliefType !== 'tear' && !(+v.size > 0)) { UI.toast('The relief size must be more than 0.'); return false; }
        var feat = featOf(v);
        if (!existing && !feat.name) feat.name = K.cornerReliefName(App.model);
        crLast = { reliefType: v.reliefType, size: +v.size, centeredOnBend: v.centeredOnBend !== false };
        return commitFeature(feat, existing);
      }
    });
    preview();
  }

  // ------------------------------------------------------------------ sheet metal: Welded Corner (lane smcorner)
  // SolidWorks' Sheet Metal ▸ Corners ▸ Welded Corner (Kernel.weldedCornerLayout, a registered boss): Corner to Weld (a
  // click on a side face of a corner, the end face of a wall facing the other wall across the gap, adds it; a second
  // click removes it), Add fillet + Fillet radius (the weld's inside corner), Add texture (cosmetic). The weld is in the
  // folded part only: the flat leaves it out. The preview is built on the main thread; ✓ is one undo step; the fillet
  // and texture choices are remembered for the next Welded Corner of the session.
  var wcLast = { addFillet: false, fillet: null, addTexture: false };
  function cmdWeldedCorner(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.build || !App.build.body) { UI.toast('Create a Base Flange and edge flanges first.'); return; }
    var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'weldedCorner', faces: [], fillet: wcLast.fillet, addTexture: wcLast.addTexture };
    f.faces = (f.faces || []).map(function (p) { return p.slice(); });
    f.addFillet = existing ? +existing.fillet > 0 || K.isExpression(existing.fillet) : wcLast.addFillet;
    if (f.fillet == null || f.fillet === 0) f.fillet = Math.round(2 * T * 1e4) / 1e4;
    f.addTexture = !!f.addTexture;
    var base = null;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
    // a pick's corner (the kernel's own rule) or the reason it is not one; kept per point until the part shown changes
    var memo = {};
    function cornerOf(p) {
      var key = p.join(',');
      if (memo[key]) return memo[key];
      try {
        var lay = K.weldedCornerLayout({ faces: [p] }, previewModel(), { body: baseBody() });
        memo[key] = { key: lay.corners[0].at.map(function (x) { return Math.round(x * 1e4); }).join(',') };
      } catch (e) { memo[key] = { error: e.message.replace(/^Welded Corner: /, '') }; }
      return memo[key];
    }
    function featOf(v) {
      var out = { type: 'weldedCorner', faces: v.faces.map(function (p) { return p.slice(); }) };
      if (v.addFillet && (K.isExpression(v.fillet) || +v.fillet > 0)) out.fillet = K.isExpression(v.fillet) ? v.fillet : +v.fillet;
      if (v.addTexture) out.addTexture = true;
      if (v.name) out.name = v.name;
      return out;
    }
    function tol() { return K.pickTol(App.model.units, T / 2); }
    function lit() {
      var idx = [];
      if (App.mesh && (!existing || App.rollback != null)) f.faces.forEach(function (p) { try { var k = K.resolveFaces([{ at: p }], App.mesh, tol())[0]; if (k != null && k >= 0) idx.push(k); } catch (e) { } });
      if (App.command) App.command.faceList = idx;
      UI.updateHighlights();
    }
    function status(extra) {
      var n = f.faces.length;
      UI.setStatus((extra ? extra + ' ' : '') + 'Welded Corner: ' + n + ' corner' + (n === 1 ? '' : 's') + ' to weld. Press Enter or ✓ to accept.');
    }
    function preview() {
      lit();
      UI.disposeGroup(UI.groups.preview);
      if (!f.faces.length) { UI.setStatus('Click a side face of each corner to weld (the end face of a flange, through the thickness, facing the next flange).'); return; }
      try {
        var tool = K.buildWeldedCorner(featOf(f), previewModel(), { body: baseBody() });
        if (tool && tool.polygons.length) addPreviewMesh(tool, UI.mats.preview);
        status();
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function pick(pk) {
      if (pk.kind !== 'face' || !pk.point) return false;
      var p = pk.point.map(function (x) { return Math.round(x * 1e6) / 1e6; }), r = cornerOf(p);
      if (r.error) { UI.setStatus(r.error); return true; }
      var hit = -1;
      f.faces.forEach(function (q, k) { var o = cornerOf(q); if (o.key === r.key) hit = k; });
      if (hit >= 0) f.faces.splice(hit, 1); else f.faces.push(p);
      renderPM(); preview();
      return true;
    }
    // pre-selected side faces move into the PropertyManager
    if (!existing && UI.selection) {
      var used = false;
      UI.selection().forEach(function (s) {
        if (s.kind !== 'face' || !App.mesh || !App.mesh.faces[s.index]) return;
        var at = (s.point || App.mesh.faces[s.index].centroid).slice();
        if (!cornerOf(at).error) { f.faces.push(at); used = true; }
      });
      if (used && UI.setSelection) UI.setSelection([]);
    }
    openPM({
      title: existing ? existing.name : 'Welded Corner', icon: 'weldedCorner', values: f,
      onRollback: function () { memo = {}; lit(); },
      message: 'Click a <b>side face</b> of each corner to weld (the end face of a flange facing the next flange across the gap). The weld is left out of the flat pattern.',
      command: { faceList: [], onPick: pick },
      groups: [
        { title: 'Corner to Weld', fields: [
          { type: 'pick', icon: 'weldedCorner', placeholder: 'Side faces of corners…',
            value: function (v) { var n = v.faces.length; return n ? n + ' corner' + (n === 1 ? '' : 's') : ''; },
            items: function (v) { return v.faces.map(function (p, i) { return { label: 'Face<' + (i + 1) + '>', at: p }; }); },
            onRemove: function (v, i) { v.faces.splice(i, 1); renderPM(); preview(); },
            onClear: function (v) { v.faces.length = 0; renderPM(); preview(); } },
          { type: 'check', label: 'Add fillet', key: 'addFillet', rerender: true },
          { type: 'number', label: 'Fillet radius', key: 'fillet', unit: 'u', min: 0, show: function (v) { return !!v.addFillet; } },
          { type: 'check', label: 'Add texture', key: 'addTexture' }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (v) {
        if (!v.faces.length) { UI.toast('Select a side face of at least one corner to weld.'); return false; }
        if (v.addFillet && !K.isExpression(v.fillet) && !(+v.fillet > 0)) { UI.toast('The fillet radius must be more than 0.'); return false; }
        var feat = featOf(v);
        if (!existing && !feat.name) feat.name = K.weldedCornerName(App.model);
        wcLast = { addFillet: !!v.addFillet, fillet: +v.fillet > 0 ? +v.fillet : null, addTexture: !!v.addTexture };
        return commitFeature(feat, existing);
      }
    });
    preview();
  }

  // ------------------------------------------------------------------ sheet metal: Cross-Break (lane cross-break)
  // SolidWorks' Sheet Metal ▸ Cross-Break (Kernel.crossBreakLayout, cosmetic: a rebuild case that keeps the body): a
  // planar sheet face, Radius, Angle, Reverse Direction and Edit Cross-Break Sketch, which opens a sketch on the face
  // holding the lines and comes back here. The lines are drawn on the model, and on the flat while Flatten is on.
  var xbLast = { radius: null, angle: 1 };
  var xbGroup = null, xbMat = null;
  function xbSegments(segs, group) {
    if (!xbMat) xbMat = new THREE.LineBasicMaterial({ color: 0x1f6fd0 });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    var o = new THREE.LineSegments(g, xbMat);
    o.renderOrder = 3;
    o.userData.crossBreak = true;
    group.add(o);
  }
  function xbLineSegs(rec) {
    var e = 2e-3 * (+(previewModel().sheet || {}).thickness || 1), n = rec.n, out = [];
    rec.lines.forEach(function (l) { [l.a, l.b].forEach(function (p) { out.push(p[0] + n[0] * e, p[1] + n[1] * e, p[2] + n[2] * e); }); });
    return out;
  }
  // the marks of every Cross-Break: on the model, or on the flat when Flatten shows it
  function drawCrossBreaks() {
    if (!UI.scene || typeof THREE === 'undefined') return;
    if (!xbGroup) { xbGroup = new THREE.Group(); UI.scene.add(xbGroup); UI.crossBreakGroup = xbGroup; }
    UI.disposeGroup(xbGroup);
    var feats = (App.model && App.model.features || []).filter(function (f) { return (f.type === 'crossBreak' || f.type === 'formingTool') && !f.suppressed; });   // lane forming: a Forming Tool's flat marks too
    if (!feats.length || !App.build) { if (UI.requestRender) UI.requestRender(); return; }
    var segs = [];
    if (UI.flatShown && UI.flatShown()) {
      var marks = App.flat ? (App.flat.etch || []).filter(function (it) { return it.crossBreak; }) : [];
      if (marks.length || (App.flat && (App.flat.etch || []).some(function (it) { return it.form != null; }))) {
        var fb = K.flatBody(App.model, App.build, App.flat), pl = fb.plane, h = fb.h1 + 2e-3 * (fb.h1 - fb.h0);
        var P = function (q) { var w = K.to3D(pl, q[0], q[1]); return [w[0] + pl.n[0] * h, w[1] + pl.n[1] * h, w[2] + pl.n[2] * h]; };
        marks.forEach(function (it) { segs = segs.concat(P(it.a), P(it.b)); });
        (App.flat ? (App.flat.etch || []).filter(function (it) { return it.form != null && it.kind === 'mark'; }) : []).forEach(function (it) {   // lane forming
          var pts = it.t === 'line' ? [it.a, it.b] : it.t === 'poly' ? it.pts.concat(it.closed ? [it.pts[0]] : []) : it.t === 'circle' ? Array.apply(null, Array(49)).map(function (z, i) { return [it.c[0] + it.r * Math.cos(i * Math.PI / 24), it.c[1] + it.r * Math.sin(i * Math.PI / 24)]; }) : [];
          for (var qi = 0; qi + 1 < pts.length; qi++) segs = segs.concat(P(pts[qi]), P(pts[qi + 1]));
        });
      }
    } else {
      feats.forEach(function (f) {
        var rec = App.build.planes && App.build.planes[f.id];
        if (rec && rec.lines && !(App.build.errors && App.build.errors[f.id])) segs = segs.concat(xbLineSegs(rec));
      });
    }
    if (segs.length) xbSegments(segs, xbGroup);
    if (UI.requestRender) UI.requestRender();
  }
  (UI.onBuild = UI.onBuild || []).push(drawCrossBreaks);
  function cmdCrossBreak(existing, back) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.build || !App.build.body || !App.build.body.polygons.length) { UI.toast('Create a Base Flange first.'); return; }
    var sheet = previewModel().sheet || App.model.sheet;
    var f = back ? back : existing ? JSON.parse(JSON.stringify(existing)) : { type: 'crossBreak', face: null, radius: xbLast.radius != null ? xbLast.radius : +sheet.bendRadius, angle: xbLast.angle, reverse: false };
    if (f.face) f.face = f.face.slice();
    var base = null;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
    function layout(v) {
      return K.crossBreakLayout(v, previewModel(), { body: baseBody(), sketches: {}, planes: (App.build && App.build.planes) || {} });
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      if (!f.face) { UI.setStatus('Cross-Break: select a planar face of the sheet.'); if (UI.requestRender) UI.requestRender(); return; }
      try {
        var lay = layout(f);
        xbSegments(xbLineSegs(lay), UI.groups.preview);
        UI.setStatus('Cross-Break: ' + lay.lines.length + ' line' + (lay.lines.length === 1 ? '' : 's') + ' on the face. Press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus(e.message); }
      if (UI.requestRender) UI.requestRender();
    }
    function featOf(v) {
      var out = { type: 'crossBreak', face: v.face.slice(), radius: v.radius, angle: v.angle, reverse: !!v.reverse };
      if (v.sketch != null) out.sketch = v.sketch;
      if (v.name) out.name = v.name;
      return out;
    }
    function pick(pk) {
      if (pk.kind !== 'face' || !pk.point) return false;
      var p = pk.point.map(function (x) { return Math.round(x * 1e6) / 1e6; }), keep = f.face;
      f.face = p;
      try { layout(f); }
      catch (e) { f.face = keep; UI.setStatus(e.message.replace(/^Cross-Break: /, '')); return true; }
      delete f.sketch;   // the lines belonged to the old face
      renderPM(); preview();
      return true;
    }
    if (!existing && !back && UI.selection) {
      UI.selection().forEach(function (s) {
        if (f.face || s.kind !== 'face' || !App.mesh || !App.mesh.faces[s.index]) return;
        var c = App.mesh.faces[s.index].centroid.slice(), keep = f.face;
        f.face = c;
        try { layout(f); if (UI.setSelection) UI.setSelection([]); } catch (e) { f.face = keep; }
      });
    }
    // Edit Cross-Break Sketch: a sketch on the face with the lines in it (made now, the first time); ✓ on the sketch
    // comes back here with the feature's values as they stand
    function editSketch(v) {
      if (!v.face) { UI.toast('Select a planar face first.'); return; }
      var held = JSON.parse(JSON.stringify(v));
      function again(sid) { cmdCrossBreak(existing, Object.assign(held, { sketch: sid })); }
      if (v.sketch != null) {
        var sid0 = v.sketch;
        closePM();
        App.pendingAfterSketch = function () { again(sid0); };
        UI.enterSketch(sid0);
        return;
      }
      var lay;
      try { lay = layout(v); } catch (e) { UI.toast(e.message); return; }
      var pl = lay.plane, plane = { custom: true, origin: pl.origin.slice(), x: pl.x.slice(), y: pl.y.slice(), n: pl.n.slice(), offset: K.vec.dot(pl.n, pl.origin) };
      if (K.tidyPlane) K.tidyPlane(plane);
      var ents = lay.lines.map(function (l) {
        var a = K.to2D(plane, l.a), b = K.to2D(plane, l.b);
        return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
      });
      closePM();
      UI.pushUndo();
      var sk = { id: App.model.nextId++, type: 'sketch', plane: plane, entities: ents };
      sk.name = K.featureName(App.model, 'sketch');
      var at = existing ? App.model.features.indexOf(existing) : -1;   // a sketch comes before the feature that reads it
      if (at >= 0) App.model.features.splice(at, 0, sk); else App.model.features.push(sk);
      App.sketchSnapshot = JSON.stringify({ entities: ents });
      App.pendingAfterSketch = function () { again(sk.id); };
      UI.afterRebuild(UI.rebuild(), function () {
        App.pendingAfterSketch = function () { again(sk.id); };
        UI.enterSketch(sk.id);
        UI.setStatus('Cross-Break: edit the lines, then exit the sketch.');
      });
    }
    openPM({
      title: existing ? existing.name : 'Cross-Break', icon: 'crossBreak', values: f,
      message: 'Select a <b>planar face</b> of the sheet. The cross-break is cosmetic: the solid and the flat blank do not change.',
      command: { onPick: pick },
      groups: [
        { title: 'Cross Break Parameters', fields: [
          { type: 'pick', icon: 'crossBreak', placeholder: 'Face…',
            value: function (v) { return v.face ? 'Face<1>' : ''; },
            items: function (v) { return v.face ? [{ label: 'Face<1>', at: v.face }] : []; },
            onRemove: function (v) { v.face = null; delete v.sketch; renderPM(); preview(); },
            onClear: function (v) { v.face = null; delete v.sketch; renderPM(); preview(); } },
          { type: 'buttons', buttons: [{ label: 'Edit Cross-Break Sketch', onclick: function (v) { editSketch(v); } }] },
          { type: 'check', label: 'Reverse direction', key: 'reverse' },
          { type: 'number', label: 'Radius', key: 'radius', unit: 'u', min: 0 },
          { type: 'number', label: 'Angle', key: 'angle', unit: '°', min: 0 }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (v) {
        if (!v.face) { UI.toast('Select a planar face of the sheet.'); return false; }
        var feat = featOf(v);
        if (!existing && !feat.name) feat.name = K.crossBreakName(App.model);
        xbLast = { radius: +v.radius, angle: +v.angle };
        return commitFeature(feat, existing);
      }
    });
    preview();
  }

  // ------------------------------------------------------------------ sheet metal: Forming Tool (lane forming, rfHI)
  // SolidWorks' Design Library forming tools dropped on a sheet face (Kernel.FORMING_TOOLS, Kernel.buildFormingTool):
  // the PM's Tool row picks Dimple / Extruded Hole / Louver / Lance / Rib, a click on a flat face of the sheet puts the
  // tool's centre there (a second click moves it), Position X / Y (the face's sketch frame), Rotation angle, Reverse
  // direction (form into the face), the tool's dimensions; live preview of the formed shell. cmdFormingTool(id,
  // existing): id presets the tool (the Design Library pane calls UI.cmdFormingTool(id)); the dims are remembered per
  // tool for the session.
  var ftLast = { tool: 'dimple', dims: {} };
  function ftRound(x) { return Math.round(x * 1e4) / 1e4; }
  function cmdFormingTool(id, existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Forming tools need a sheet-metal part: make a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.build || !App.build.body || !App.build.body.polygons.length) { UI.toast('Create a Base Flange first.'); return; }
    var tools = K.FORMING_TOOLS, units = App.model.units;
    function defaults(t) { return Object.assign(K.formingToolDefaults(t, units), ftLast.dims[t] || {}); }
    var tool0 = existing ? existing.tool : (id && K.formingToolDefaults(id, units) ? id : ftLast.tool);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ type: 'formingTool', face: null, angle: 0, flip: false }, defaults(tool0));
    f.tool = tool0;
    f.atU = f.at ? +f.at[0] : 0; f.atV = f.at ? +f.at[1] : 0;
    var base = null;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
    // a feature written without a position (a script's p.formingTool at a face point): its centre is that point
    if (existing && !existing.at && f.face) try { var lay0 = K.formingToolLayout(existing, previewModel(), { body: baseBody() }); f.atU = ftRound(lay0.uv[0]); f.atV = ftRound(lay0.uv[1]); } catch (e0) { }
    function params(t) { var d = tools.filter(function (x) { return x.id === t; })[0]; return d ? d.params : []; }
    function featOf(v) {
      var out = { type: 'formingTool', tool: v.tool, face: v.face ? v.face.slice() : null, at: [+v.atU || 0, +v.atV || 0], angle: +v.angle || 0, flip: !!v.flip };
      params(v.tool).forEach(function (p) { out[p.key] = v[p.key]; });
      if (v.name) out.name = v.name;
      return out;
    }
    function label(t) { var d = tools.filter(function (x) { return x.id === t; })[0]; return d ? d.label : 'Forming Tool'; }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      if (!f.face) { UI.setStatus(label(f.tool) + ': click a flat face of the sheet where the tool goes.'); if (UI.requestRender) UI.requestRender(); return; }
      try {
        var r = K.buildFormingTool(Object.assign(featOf(f), { id: 'ftPreview' }), previewModel(), { body: baseBody() });
        addPreviewMesh(r.tool, UI.mats.preview);
        UI.setStatus(label(f.tool) + ' at (' + UI.fmtNum(+f.atU, 4) + ', ' + UI.fmtNum(+f.atV, 4) + ')' + (f.flip ? ', reversed' : '') + '. Click the face again to move it; press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
      if (UI.requestRender) UI.requestRender();
    }
    // a face click: the tool's centre goes to the clicked point (its position in the face's sketch frame)
    function placeAt(point, normal, w) {
      var fp = K.planeFromFace(normal, K.vec.scale(normal, w)), uv = K.to2D(fp, point);
      f.face = point.map(function (x) { return Math.round(x * 1e6) / 1e6; });
      f.atU = ftRound(uv[0]); f.atV = ftRound(uv[1]);
    }
    function pick(pk) {
      if (pk.kind !== 'face' || !pk.point) return false;
      var face = App.mesh && App.mesh.faces[pk.index];
      if (!face || !face.normal) return false;
      var keep = { face: f.face, atU: f.atU, atV: f.atV };
      placeAt(pk.point, face.normal, isFinite(face.w) ? face.w : K.vec.dot(face.normal, pk.point));
      try { K.formingToolLayout(featOf(f), previewModel(), { body: baseBody() }); }
      catch (e) { Object.assign(f, keep); UI.setStatus(e.message); return true; }
      renderPM(); preview();
      return true;
    }
    if (!existing && UI.selection) {
      UI.selection().forEach(function (s) {
        var face = s.kind === 'face' && App.mesh ? App.mesh.faces[s.index] : null;
        if (f.face || !face || !face.normal) return;
        var keep = { face: f.face, atU: f.atU, atV: f.atV };
        placeAt(face.centroid.slice(), face.normal, isFinite(face.w) ? face.w : K.vec.dot(face.normal, face.centroid));
        try { K.formingToolLayout(featOf(f), previewModel(), { body: baseBody() }); if (UI.setSelection) UI.setSelection([]); } catch (e) { Object.assign(f, keep); }
      });
    }
    var dimFields = [];
    tools.forEach(function (t) {
      t.params.forEach(function (p) {
        dimFields.push({ type: 'number', label: p.label, key: p.key, unit: p.unit, min: 0, help: p.help, show: function (v) { return v.tool === t.id; } });
      });
    });
    openPM({
      title: existing ? existing.name : 'Forming Tool', icon: 'formingTool', values: f,
      message: 'Pick a <b>tool</b>, then click a <b>flat face</b> of the sheet where it goes. The form keeps the sheet\'s thickness; the flat pattern shows it flat with its outline on the FORM layer.',
      command: { onPick: pick },
      groups: [
        { title: 'Tool', fields: [{ type: 'iconRadio', label: 'Tool', key: 'tool', options: tools.map(function (t) { return [t.id, t.label, 'ft' + t.id.charAt(0).toUpperCase() + t.id.slice(1)]; }), rerender: true }] },
        { title: 'Placement', fields: [
          { type: 'pick', icon: 'formingTool', placeholder: 'Face…',
            value: function (v) { return v.face ? 'Face<1>' : ''; },
            items: function (v) { return v.face ? [{ label: 'Face<1>', at: v.face }] : []; },
            onRemove: function (v) { v.face = null; renderPM(); preview(); },
            onClear: function (v) { v.face = null; renderPM(); preview(); } },
          { type: 'number', label: 'Position X', key: 'atU', unit: 'u' },
          { type: 'number', label: 'Position Y', key: 'atV', unit: 'u' },
          { type: 'number', label: 'Rotation angle', key: 'angle', unit: '°' },
          { type: 'check', label: 'Reverse direction', key: 'flip' }
        ] },
        { title: 'Dimensions', fields: dimFields },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v, key) {
        if (key === 'tool') {
          var d = defaults(v.tool);
          params(v.tool).forEach(function (p) { v[p.key] = d[p.key]; });
          renderPM();
        }
        preview();
      },
      onOK: function (v) {
        if (!v.face) { UI.toast('Click a flat face of the sheet where the tool goes.'); return false; }
        var feat = featOf(v);
        try { K.formingToolLayout(feat, previewModel(), { body: baseBody() }); }
        catch (e) { UI.toast(e.message); return false; }
        if (!existing && !feat.name) feat.name = K.formingToolName(App.model, feat.tool);
        ftLast.tool = feat.tool;
        ftLast.dims[feat.tool] = {};
        params(feat.tool).forEach(function (p) { ftLast.dims[feat.tool][p.key] = feat[p.key]; });
        return commitFeature(feat, existing);
      }
    });
    preview();
  }

  // ------------------------------------------------------------------ sheet metal: Rip (lane DI)
  // SolidWorks' Sheet Metal ▸ Rip (Kernel.ripLayout, a registered cut): Edges to Rip (a click on a corner edge where two
  // walls meet adds it, a second click removes it; outside or inside edge), Change Direction (cycles the last picked
  // edge: both walls → wall 1 keeps the corner → wall 2 keeps it), Rip Gap. Works on a sheet-metal part (T = the sheet's)
  // and on a shelled part (T measured at the edge). The gap is remembered for the session.
  var ripLast = { gap: null };
  var RIP_DIR_TEXT = { both: 'both directions', side1: 'side 1', side2: 'side 2' };
  function cmdRipFeature(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.build || !App.build.body || !App.build.body.polygons.length) { UI.toast('Rip needs a part: make a shelled part or a sheet-metal part first.'); return; }
    var gap0 = ripLast.gap != null ? ripLast.gap : K.ripDefaultGap(App.model);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'rip', edges: [], gap: gap0, direction: 'both' };
    f.edges = (f.edges || []).map(function (e) { return e.direction ? { at: e.at.slice(), direction: e.direction } : { at: e.at.slice() }; });
    var base = null, lastPicked = f.edges.length - 1;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
    function featOf(v) {
      var out = { type: 'rip', edges: v.edges.map(function (e) { return e.direction ? { at: e.at.slice(), direction: e.direction } : { at: e.at.slice() }; }), gap: v.gap, direction: v.direction || 'both' };
      if (v.name) out.name = v.name;
      return out;
    }
    function edgeDir(e) { return e.direction || f.direction || 'both'; }
    // the kernel's own corner test for one pick: null when the edge can be ripped, else the reason
    function why(at) {
      try { K.ripLayout({ type: 'rip', edges: [{ at: at }], gap: Math.max(+f.gap || 0, 1e-6), direction: 'both' }, previewModel(), { body: baseBody() }); return null; } catch (e) { return e.message.replace(/^Rip: /, ''); }
    }
    function lit() {
      var list = (App.edges || []).filter(function (e) { return f.edges.some(function (q) { return K.pointSegmentDistance(q.at, e.a, e.b) <= 1e-4 * (1 + e.len); }); });
      if (App.command) App.command.edgeList = list;
      UI.updateHighlights();
    }
    function status() {
      var n = f.edges.length;
      UI.setStatus('Rip: ' + n + ' edge' + (n === 1 ? '' : 's') + ' picked' + (n ? ' (last: ' + RIP_DIR_TEXT[edgeDir(f.edges[n - 1])] + ')' : '') + '. Press Enter or ✓ to accept.');
    }
    function preview() {
      lit();
      if (!f.edges.length) { lp.shown = ++lp.seq; UI.disposeGroup(UI.groups.preview); UI.setStatus('Click the corner edges to rip (where two walls meet, outside or inside).'); return; }
      livePreview({ op: 'tool', feature: featOf(f), mats: [UI.mats.previewCut], sync: previewSync, done: function () { status(); }, fail: function (msg) { UI.setStatus('Preview: ' + msg); } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var tool = K.buildRip(featOf(f), previewModel(), { body: baseBody() });
        if (tool && tool.polygons.length) addPreviewMesh(tool, UI.mats.previewCut);
        status();
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function toggle(edge) {
      var i = -1;
      f.edges.forEach(function (q, k) { if (K.pointSegmentDistance(q.at, edge.a, edge.b) <= 1e-4 * (1 + edge.len)) i = k; });
      if (i >= 0) { f.edges.splice(i, 1); lastPicked = f.edges.length - 1; return true; }
      var at = edge.mid.map(function (x) { return Math.round(x * 1e6) / 1e6; }), err = why(at);
      if (err) { UI.setStatus(err); return false; }
      f.edges.push({ at: at }); lastPicked = f.edges.length - 1;
      return true;
    }
    function pick(pk) {
      if (pk.kind !== 'edge' || !pk.edge) return false;
      if (toggle(pk.edge)) { renderPM(); preview(); }
      return true;
    }
    function changeDirection(v) {
      var e = v.edges[lastPicked] || v.edges[v.edges.length - 1];
      if (!e) { UI.setStatus('Pick an edge first.'); return; }
      var order = K.RIP_DIRECTIONS, next = order[(order.indexOf(edgeDir(e)) + 1) % order.length];
      if (next === (v.direction || 'both')) delete e.direction; else e.direction = next;
      renderPM(); preview();
    }
    if (!existing && UI.selection) {
      var pre = UI.selection(), used = false;
      pre.forEach(function (s) { if (s.kind === 'edge' && s.edge && toggle(s.edge)) used = true; });
      if (used && UI.setSelection) UI.setSelection([]);
    }
    openPM({
      title: existing ? existing.name : 'Rip', icon: 'rip', values: f,
      onRollback: function () { base = null; lit(); },
      message: 'Click the <b>corner edges</b> to rip (where two walls meet: the outside or the inside edge). <b>Change Direction</b> sets which wall keeps the corner for the last edge picked.',
      command: { pickEdges: true, edgeList: [], onPick: pick },
      groups: [
        { title: 'Rip Parameters', fields: [
          { type: 'pick', icon: 'rip', placeholder: 'Edges to rip…',
            value: function (v) { var n = v.edges.length; return n ? n + ' edge' + (n === 1 ? '' : 's') : ''; },
            items: function (v) { return v.edges.map(function (e, i) { return { label: 'Edge<' + (i + 1) + '> (' + RIP_DIR_TEXT[edgeDir(e)] + ')', at: e.at }; }); },
            onRemove: function (v, i) { v.edges.splice(i, 1); lastPicked = v.edges.length - 1; renderPM(); preview(); },
            onClear: function (v) { v.edges.length = 0; renderPM(); preview(); } },
          { type: 'buttons', buttons: [{ label: 'Change Direction', onclick: function (v) { changeDirection(v); } }] },
          { type: 'number', label: 'Rip gap', key: 'gap', unit: 'u', min: 0 }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (v) {
        if (!v.edges.length) { UI.toast('Select at least one edge to rip.'); return false; }
        if (!(+v.gap > 0)) { UI.toast('The rip gap must be more than 0.'); return false; }
        var feat = featOf(v);
        feat.gap = +v.gap;
        ripLast = { gap: +v.gap };
        return commitFeature(feat, existing);
      }
    });
    preview();
  }

  // ------------------------------------------------------------------ sheet metal: Vent (lane DT)
  // SolidWorks' Sheet Metal ▸ Vent (Kernel.buildVent, a cut): one sketch on a flat sheet face; the PropertyManager's
  // boxes Boundary / Ribs / Spars / Fill-In Boundary hold sketch entities (filled from Kernel.ventAutoGroups when it
  // opens: the largest closed entity, the lines, the other closed entities); clicking an entity of the shown sketch
  // moves it into the active box (or out of it). Geometry Properties (draft 0 and depth = T for sheet metal, fillet
  // radius), Flow Area (read-only: open area and its percentage of the boundary), widths. Preview = what is cut.
  var ventLast = { ribWidth: null, sparWidth: null };
  var VENT_BOXES = [['boundary', 'Boundary'], ['ribs', 'Ribs'], ['spars', 'Spars'], ['fill', 'Fill-In Boundary']];
  function cmdVent(existing) {
    withSketch(function (sid) {
      if (!App.model.sheet) { UI.toast('Vent needs a sheet-metal part: make a Base Flange first (Sheet Metal tab).'); return; }
      var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness, w0 = App.model.units === 'mm' ? 2.5 : 0.1;
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'vent', sketch: pickDefaultSketch(sid), boundary: [], ribs: [], spars: [], fill: [],
        ribWidth: ventLast.ribWidth != null ? ventLast.ribWidth : w0, sparWidth: ventLast.sparWidth != null ? ventLast.sparWidth : w0, fillWidth: 0, radius: 0 };
      if (f.sketch == null) { UI.toast('Sketch the vent on a flat face of the sheet first (a closed boundary, rib lines, spar circles), then click Vent.'); return; }
      VENT_BOXES.forEach(function (b) { f[b[0]] = (f[b[0]] || []).slice(); });
      function sketchOf(v) { var s = K.findFeature(App.model, v.sketch); return s && s.type === 'sketch' ? s : null; }
      function autoFill(v) {
        var s = sketchOf(v);
        if (!s) return;
        var g = K.ventAutoGroups(s);
        VENT_BOXES.forEach(function (b) { v[b[0]] = g[b[0]].slice(); });
      }
      if (!existing || !f.boundary.length) autoFill(f);
      f.box = f.boundary.length ? (f.ribs.length ? 'ribs' : 'spars') : 'boundary';
      var base = null;
      function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : (App.build ? App.build.body : null); return base; }
      function featOf(v) {
        var out = { type: 'vent', sketch: v.sketch };
        VENT_BOXES.forEach(function (b) { out[b[0]] = v[b[0]].slice(); });
        out.ribWidth = v.ribWidth; out.sparWidth = v.sparWidth; out.fillWidth = v.fillWidth || 0; out.radius = v.radius || 0;
        if (v.name) out.name = v.name;
        return out;
      }
      var flow = null;
      function flowText() {
        if (!flow) return '—';
        var u = UI.unitLabel();
        return UI.fmtNum(flow.open, 4) + ' ' + u + '² (' + UI.fmtNum(flow.percent, 1) + '% of ' + UI.fmtNum(flow.boundary, 4) + ' ' + u + '²)';
      }
      function preview() {
        UI.disposeGroup(UI.groups.preview);
        flow = null;
        var feat = featOf(f);
        try {
          if (!baseBody()) throw new Error('Create a Base Flange first.');
          var ctx = { body: baseBody(), sketches: {}, planes: (App.build && App.build.planes) || {} };
          var tool = K.buildVent(feat, previewModel(), ctx);
          if (tool && tool.polygons.length) addPreviewMesh(tool, UI.mats.previewCut);
          flow = K.ventFlowArea(feat, previewModel(), ctx);
          UI.setStatus('Vent: flow area ' + flowText() + '. Click sketch entities to put them in the active box; ✓ to accept.');
        } catch (e) { UI.setStatus('Preview: ' + e.message); }
        var fa = document.querySelector('.pm-vent-flow');
        if (fa) fa.textContent = flowText();
      }
      function setBox(b) { f.box = b; renderPM(); UI.setStatus('Click sketch entities for ' + VENT_BOXES.filter(function (x) { return x[0] === b; })[0][1] + ' (click again to remove).'); }
      function pick(pk) {
        if (pk.kind !== 'sketchEntity' || pk.sketch !== f.sketch) return false;
        var i = pk.index, box = f.box || 'boundary', had = f[box].indexOf(i) >= 0;
        VENT_BOXES.forEach(function (b) { var k = f[b[0]].indexOf(i); if (k >= 0) f[b[0]].splice(k, 1); });
        if (!had) f[box].push(i);
        renderPM(); preview();
        return true;
      }
      function box(key, label, icon) {
        return { type: 'pick', icon: icon, placeholder: 'Select ' + label.toLowerCase() + '…',
          value: function (v) { var n = v[key].length; return n ? n + ' entit' + (n === 1 ? 'y' : 'ies') : ''; },
          active: function (v) { return v.box === key; }, onActivate: function () { setBox(key); },
          items: function (v) { var s = sketchOf(v); return v[key].map(function (i) { var e = s && s.entities[i]; return { label: e ? entityLabel(e, i) : 'Entity' + (i + 1) }; }); },
          onRemove: function (v, i) { v[key].splice(i, 1); renderPM(); preview(); },
          onClear: function (v) { v[key].length = 0; renderPM(); preview(); } };
      }
      var u = UI.unitLabel();
      openPM({
        title: existing ? existing.name : 'Vent', icon: 'vent', values: f,
        onRollback: function () { base = null; },
        message: 'Sketch the vent on a flat face of the sheet: a closed <b>boundary</b>, <b>rib</b> lines through it, <b>spar</b> circles and an optional <b>fill-in boundary</b>. Click a box, then click entities of the sketch to put them there.',
        command: { sketchId: f.sketch, pickRefGeo: true, refKinds: [], pickSketchRefs: true, onPick: pick },
        groups: [
          { title: 'Boundary', fields: [sketchPickerField(f), box('boundary', 'Boundary', 'vent')] },
          { title: 'Geometry Properties', fields: [
            { type: 'static', label: 'Draft angle', value: '0° (sheet metal)' },
            { type: 'number', label: 'Radius for fillets', key: 'radius', unit: 'u', min: 0 }
          ] },
          { title: 'Flow Area', fields: [{ type: 'html', html: function () { return '<div class="pm-row"><label>Area</label><span class="static pm-vent-flow">' + flowText() + '</span></div>'; } }] },
          { title: 'Ribs', fields: [box('ribs', 'Ribs', 'line'),
            { type: 'number', label: 'Rib width', key: 'ribWidth', unit: 'u', min: 0 },
            { type: 'static', label: 'Rib depth', value: UI.fmtNum(T, 4) + ' ' + u + ' (thickness)' },
            { type: 'static', label: 'Offset', value: '0 (sheet metal)' }] },
          { title: 'Spars', fields: [box('spars', 'Spars', 'circle'),
            { type: 'number', label: 'Spar width', key: 'sparWidth', unit: 'u', min: 0 },
            { type: 'static', label: 'Spar depth', value: UI.fmtNum(T, 4) + ' ' + u + ' (thickness)' },
            { type: 'static', label: 'Offset', value: '0 (sheet metal)' }] },
          { title: 'Fill-In Boundary', collapsed: !f.fill.length, fields: [box('fill', 'Fill-In Boundary', 'vent'),
            { type: 'number', label: 'Fill-in width', key: 'fillWidth', unit: 'u', min: 0 }] },
          { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v, key) {
          if (key === 'sketch') { autoFill(v); if (App.command) { App.command.sketchId = v.sketch; UI.updateSketches(); } renderPM(); }
          preview();
        },
        onOK: function (v) {
          if (v.sketch == null || v.sketch < 0) { UI.toast('Select the vent\'s sketch.'); return false; }
          if (!v.boundary.length) { UI.toast('Select the vent\'s boundary (a closed contour).'); return false; }
          var feat = featOf(v);
          try { K.buildVent(feat, previewModel(), { body: baseBody(), sketches: {}, planes: (App.build && App.build.planes) || {} }); } catch (e) { UI.toast(e.message); return false; }
          ventLast = { ribWidth: v.ribWidth, sparWidth: v.sparWidth };
          return commitFeature(feat, existing);
        }
      });
      preview();
    });
  }

  // ------------------------------------------------------------------ sheet metal: Insert Bends / Convert to Sheet Metal (lane DQ)
  // SolidWorks' Sheet Metal ▸ Insert Bends (a shelled / thin-walled part: every sharp corner between two walls becomes
  // a bend; T is read from the part at the fixed face) and Convert to Sheet Metal (a solid: fixed face, bend edges, the
  // rip edges found between the faces kept, the rip gap). Both write the part's sheet (the Sheet-Metal row: R, bend
  // allowance, auto relief) with the feature; the flat is laid from the fixed face. Ribbon No Bends (toggleNoBends)
  // shows the part without its bends (model.noBends) and back.
  var ibLast = {};
  function ibRnd(p) { return p.map(function (x) { return Math.round(x * 1e6) / 1e6; }); }
  function cmdInsertBendsPM(kind, existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var isConv = kind === 'convertSM', title = isConv ? 'Convert to Sheet Metal' : 'Insert Bends';
    if (!App.build || !App.build.body || !App.build.body.polygons.length) { UI.toast(title + ' needs a part: ' + (isConv ? 'make a solid first.' : 'make a shelled or thin-walled part first.')); return; }
    if (!existing && App.model.sheet && App.model.features.some(function (g) { return g.sheetBase && !g.cut; })) { UI.toast('The part is sheet metal already.'); return; }
    var base = null, units = App.model.units;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
    var v0 = sheetToValues(App.model.sheet || (function () { var d = defaultSheet(); if (ibLast.radius != null) d.bendRadius = ibLast.radius; return d; })(), {});
    if (!App.model.sheet && ibLast.thickness != null && isConv) v0.thickness = ibLast.thickness;
    if (!App.model.sheet && !existing) v0.autoRelief = 'rect';
    v0.fixedFace = existing && existing.fixedFace ? existing.fixedFace.slice() : null;
    v0.bendEdges = existing && existing.bendEdges ? existing.bendEdges.map(function (p) { return p.slice(); }) : [];
    v0.gap = existing && existing.gap != null ? existing.gap : (ibLast.gap != null ? ibLast.gap : K.ripDefaultGap(App.model));
    v0.cornerRelief = !(existing && existing.autoRelief === 'none');
    v0.reverse = !!(existing && existing.reverse);   // lane rfIM: Convert's Reverse thickness; lane insertbends2: Insert Bends' Reverse direction
    v0.ripEdges = existing && existing.ripEdges ? existing.ripEdges.map(function (p) { return p.slice(); }) : [];   // lane insertbends2: Insert Bends' Rip Parameters
    if (existing && existing.name) v0.name = existing.name;
    // Insert Bends: T is the part's, measured under the fixed face
    var measured = { at: null, T: null, err: null };
    function thickness(v) {
      if (isConv) return +v.thickness;
      if (!v.fixedFace) return null;
      if (!measured.at || measured.at.join() !== v.fixedFace.join()) {
        measured.at = v.fixedFace.slice();
        try { measured.T = Math.round(K.sheetThicknessAt(baseBody(), v.fixedFace, units) * 1e9) / 1e9; measured.err = null; } catch (e) { measured.T = null; measured.err = e.message; }
      }
      return measured.T;
    }
    function sheetOf(v, exprs) {
      var w = {};
      Object.keys(v).forEach(function (k) { w[k] = v[k]; });
      if (!isConv) { w.thickness = thickness(v); w.useGauge = false; }
      return sheetFromValues(w, exprs && isConv);
    }
    function featOf(v) {
      var f = isConv ? { type: 'convertSM', fixedFace: v.fixedFace ? v.fixedFace.slice() : null, bendEdges: v.bendEdges.map(function (p) { return p.slice(); }), gap: +v.gap, sheetBase: true }
        : { type: 'insertBends', fixedFace: v.fixedFace ? v.fixedFace.slice() : null, sheetBase: true };
      if (!isConv && v.ripEdges.length) { f.ripEdges = v.ripEdges.map(function (p) { return p.slice(); }); f.gap = +v.gap; }   // lane insertbends2
      if (!v.cornerRelief) f.autoRelief = 'none';
      if (v.reverse) f.reverse = true;
      if (v.name) f.name = v.name;
      return f;
    }
    function modelOf(v) {
      var m = {};
      var pmod = previewModel();
      Object.keys(pmod).forEach(function (k) { m[k] = pmod[k]; });
      m.sheet = sheetOf(v, false);
      delete m.noBends;
      return m;
    }
    function lit() {
      var v = pm.values || v0, T = thickness(v) || +v.thickness || 0;
      if (v.fixedFace) ufLit([v.fixedFace], T); else if (App.command) { App.command.faceList = []; UI.updateHighlights(); }
      if (App.command) {
        if (!isConv) App.command.pickEdges = !!v.fixedFace;   // lane insertbends2: the fixed face first, then edges to rip (a first click is a face)
        var lst = isConv ? v.bendEdges : (v.ripEdges || []);   // lane insertbends2: Insert Bends lights its rip edges
        App.command.edgeList = (App.edges || []).filter(function (e) { return lst.some(function (q) { return K.pointSegmentDistance(q, e.a, e.b) <= 1e-4 * (1 + e.len); }); });
        UI.updateHighlights();
      }
    }
    var info = { bends: null, rips: null, err: null, rounded: 0 };
    function preview() {
      lit();
      var v = pm.values || v0;
      UI.disposeGroup(UI.groups.preview);
      info = { bends: null, rips: null, err: null, rounded: 0 };
      if (!v.fixedFace) { UI.setStatus('Click the fixed face' + (isConv ? ', then the edges that become bends.' : ' (a flat face of the part that stays put in the flat).')); renderInfo(); return; }
      if (isConv && !v.bendEdges.length) { UI.setStatus('Click the edges of the solid that become bends.'); renderInfo(); return; }
      if (!isConv && thickness(v) == null) { info.err = measured.err; UI.setStatus(title + ': ' + measured.err); renderInfo(); return; }
      try {
        var m = modelOf(v), f = featOf(v);
        if (isConv) { var cpl = K.convertSMPlan(f, m, { body: baseBody() }); info.rips = cpl.rips ? cpl.rips.length : null; }   // rfIM: a Reverse plan rips after thickening
        var r = K.insertBendsPreview(f, m, baseBody());
        info.bends = r.bends; info.rounded = r.rounded || 0;
        if (r.body && r.body.polygons.length) addPreviewMesh(r.body, UI.mats.preview);
        UI.setStatus(title + ': ' + r.bends + ' bend' + (r.bends === 1 ? '' : 's') + (info.rounded ? ' (' + info.rounded + ' rounded, at their own radius)' : '') + (isConv ? ', ' + info.rips + ' rip' + (info.rips === 1 ? '' : 's') : '') + ', T ' + UI.fmtNum(m.sheet.thickness, 4) + ', R ' + UI.fmtNum(m.sheet.bendRadius, 4) + '. Press Enter or ✓ to accept.');
      } catch (e) { info.err = e.message; UI.setStatus('Preview: ' + e.message); }
      renderInfo();
    }
    var infoShown = '';
    function renderInfo() { var t = infoText(); if (t !== infoShown) { infoShown = t; renderPM(); } }
    function infoText() { return info.err ? info.err : (info.bends == null ? '' : info.bends + ' bend' + (info.bends === 1 ? '' : 's') + (info.rounded ? ' (' + info.rounded + ' rounded)' : '') + (info.rips != null ? ', ' + info.rips + ' rip edge' + (info.rips === 1 ? '' : 's') + ' found' : '')); }
    // lane rfIE: the Bend Edges list's changes (a click, a removal, Clear, Collect All Bends) are PM steps Ctrl+Z / Ctrl+Y
    // take back (spec.pmUndo); Collect All Bends (SolidWorks 2024, under the list) fills it from K.convertSMCollect
    var hist = { undo: [], redo: [] };
    function snapEdges(v) { return { edges: v.bendEdges.map(function (p) { return p.slice(); }), thickness: v.thickness, useGauge: v.useGauge }; }
    function remember(v) { hist.undo.push(snapEdges(v)); hist.redo.length = 0; }
    function pmUndo(redo) {
      var from = redo ? hist.redo : hist.undo, to = redo ? hist.undo : hist.redo, v = pm.values;
      if (!isConv || !from.length || !v) return false;
      to.push(snapEdges(v));
      var s = from.pop();
      v.bendEdges = s.edges; v.thickness = s.thickness; v.useGauge = s.useGauge;
      renderPM(); preview();
      UI.setStatus((redo ? 'Bend Edges change redone' : 'Bend Edges change undone') + ' (' + title + ' stays open).');
      return true;
    }
    function collectAll(v) {
      if (!v.fixedFace) { UI.toast('Collect All Bends: pick the fixed face first.'); return; }
      var r;
      try { r = K.convertSMCollect(baseBody(), v.fixedFace, { thickness: +v.thickness, units: units }); } catch (e) { UI.toast(e.message); UI.setStatus(e.message); return; }
      if (!r.bends.length) {
        var why = r.rounded ? 'Collect All Bends: the part has rounded edges, but none is a bend of this thickness (inside R, outside R + T, flat walls T thick on both ends).'
          : 'Collect All Bends: nothing to collect. No edge reached from the fixed face is the outside corner of two walls ' + UI.fmtNum(r.T || +v.thickness, 4) + ' thick' + (r.wall != null && r.wall > 2 * (+v.thickness) ? ' (a solid: click the edges that become bends).' : ' (pick an outside face as the fixed face, or click the edges).');
        UI.toast(why); UI.setStatus(why);
        return;
      }
      remember(v);
      v.bendEdges = r.bends.map(ibRnd);
      var tSet = r.T != null && Math.abs(r.T - (+v.thickness)) > 1e-9;
      if (tSet) { v.thickness = Math.round(r.T * 1e9) / 1e9; v.useGauge = false; }
      renderPM(); preview();
      var msg = r.bends.length + ' bend' + (r.bends.length === 1 ? '' : 's') + ' collected' + (tSet ? '; Thickness set to ' + UI.fmtNum(v.thickness, 4) + ' (the part\'s walls)' : '') + '.';
      UI.toast(msg);
    }
    function pick(pk) {
      var v = pm.values;
      if (isConv && pk.kind === 'edge' && pk.edge) {
        remember(v);
        var i = -1;
        v.bendEdges.forEach(function (q, k) { if (K.pointSegmentDistance(q, pk.edge.a, pk.edge.b) <= 1e-4 * (1 + pk.edge.len)) i = k; });
        if (i >= 0) v.bendEdges.splice(i, 1); else v.bendEdges.push(ibRnd(pk.edge.mid));
      } else if (!isConv && pk.kind === 'edge' && pk.edge) {   // lane insertbends2: Rip Parameters ▸ Edges to rip (a second click takes it out)
        var ri = -1;
        v.ripEdges.forEach(function (q, k) { if (K.pointSegmentDistance(q, pk.edge.a, pk.edge.b) <= 1e-4 * (1 + pk.edge.len)) ri = k; });
        if (ri >= 0) v.ripEdges.splice(ri, 1); else v.ripEdges.push(ibRnd(pk.edge.mid));
      } else if (pk.kind === 'face' && pk.point) {
        // lane rfIM: Convert: a click on a rounded bend face (a fillet the shell makes a bend, or a bend already
        // rounded) adds that bend to Bend Edges, or takes it out again; any other face is the fixed face
        var rb = isConv ? K.insertBendsRoundAt(baseBody(), pk.point, +v.thickness, units) : null;
        if (rb) {
          remember(v);
          var j = -1;
          v.bendEdges.forEach(function (q, k) { var o = K.insertBendsRoundAt(baseBody(), q, +v.thickness, units); if (o && K.pointSegmentDistance(o.mid, rb.mid, rb.mid) < 1e-6) j = k; });
          if (j >= 0) v.bendEdges.splice(j, 1); else v.bendEdges.push(ibRnd(rb.mid));
        } else v.fixedFace = ibRnd(pk.point);
      } else return false;
      renderPM(); preview();
      return true;
    }
    var gs = sheetGroups().filter(function (g) { return isConv || g.title !== 'Sheet Metal Gauges'; });
    var fixedPick = { type: 'pick', icon: kind, placeholder: 'Fixed face…',
      value: function (v) { return v.fixedFace ? 'Face<1>' : ''; },
      items: function (v) { return v.fixedFace ? [{ label: 'Face<1>', at: v.fixedFace }] : []; },
      onRemove: function (v) { v.fixedFace = null; renderPM(); preview(); },
      onClear: function (v) { v.fixedFace = null; renderPM(); preview(); } };
    gs.forEach(function (g) {
      if (g.title !== 'Sheet Metal Parameters') return;
      if (isConv) { g.fields = [fixedPick].concat(g.fields, [{ type: 'check', label: 'Reverse thickness', key: 'reverse' }]); return; }   // rfIM
      g.title = 'Bend Parameters';
      g.fields = [fixedPick, { type: 'check', label: 'Reverse direction', key: 'reverse' }, { type: 'static', label: 'Thickness  T', value: function (v) { var t = thickness(v); return t == null ? '(from the part at the fixed face)' : UI.fmtNum(t, 4) + ' (the part\'s)'; } }].concat(g.fields.filter(function (q) { return q.key !== 'thickness' && q.key !== 'overrideThickness'; }),
        // lane rfIM: the bends already rounded in the part keep their own radius (the radius above is for sharp corners)
        [{ type: 'static', label: 'Rounded bends', value: function () { return info.bends == null ? '–' : info.rounded ? info.rounded + ' found (their own radius)' : 'none'; } }]);
    });
    if (isConv) {
      var at = 1 + gs.map(function (g) { return g.title; }).indexOf('Sheet Metal Parameters');
      gs.splice(at, 0, { title: 'Bend Edges', fields: [
        { type: 'pick', icon: 'bend', placeholder: 'Edges or rounded faces that become bends…',
          value: function (v) { var n = v.bendEdges.length; return n ? n + ' edge' + (n === 1 ? '' : 's') : ''; },
          items: function (v) { return v.bendEdges.map(function (p, i) { return { label: 'Edge<' + (i + 1) + '>', at: p }; }); },
          onRemove: function (v, i) { remember(v); v.bendEdges.splice(i, 1); renderPM(); preview(); },
          onClear: function (v) { if (v.bendEdges.length) remember(v); v.bendEdges = []; renderPM(); preview(); } },
        { type: 'buttons', buttons: [{ label: 'Collect All Bends', onclick: collectAll, disabled: function (v) { return !v.fixedFace; },
          title: function (v) { return v.fixedFace ? 'Select every edge of the part that becomes a bend from the fixed face (the outside corners of walls T thick)' : 'Pick the fixed face first'; } }] },
        { type: 'static', label: 'Rip edges found', value: function () { return info.rips == null ? '–' : String(info.rips); } }
      ] }, { title: 'Corner Defaults', fields: [{ type: 'number', label: 'Rip gap', key: 'gap', unit: 'u', min: 0 }] });
    }
    if (!isConv) {   // lane insertbends2: SolidWorks' Rip Parameters (a closed tray / box: rip its corner edges so it can unfold)
      gs.push({ title: 'Rip Parameters', fields: [
        { type: 'pick', icon: 'rip', placeholder: 'Edges to rip…',
          value: function (v) { var n = v.ripEdges.length; return n ? n + ' edge' + (n === 1 ? '' : 's') : ''; },
          items: function (v) { return v.ripEdges.map(function (p, i) { return { label: 'Edge<' + (i + 1) + '>', at: p }; }); },
          onRemove: function (v, i) { v.ripEdges.splice(i, 1); renderPM(); preview(); },
          onClear: function (v) { v.ripEdges = []; renderPM(); preview(); } },
        { type: 'number', label: 'Rip gap', key: 'gap', unit: 'u', min: 0 }
      ] });
    }
    gs.push({ title: 'Corner Relief', fields: [{ type: 'check', label: 'Relieve corners where two bends meet (R + T square)', key: 'cornerRelief' }] });
    gs.push({ title: 'Result', fields: [{ type: 'static', label: '', value: function () { return infoText() || '–'; } }] });
    gs.push({ title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] });
    openPM({
      title: existing ? existing.name : title, icon: kind, values: v0,
      onRollback: function () { base = null; measured.at = null; lit(); },
      message: isConv
        ? 'Click the <b>fixed face</b>, then the <b>edges</b> (or rounded faces) of the solid that become bends (or <b>Collect All Bends</b> on a part with walls T thick). The faces not joined to the fixed face across them are removed (a shell of T inward; walls already T thick stay as they are), the edges between kept faces are ripped, and the bends are inserted.'
        : 'Click the <b>fixed face</b> (a flat face that stays put in the flat). Every sharp corner between two walls of the part\'s thickness becomes a bend of this radius; bends already rounded keep their own radius. A closed tray or box: click its corner <b>edges to rip</b> (Rip Parameters).',
      command: { faceList: [], edgeList: [], pickEdges: true, onPick: pick },
      groups: gs, pmUndo: isConv ? pmUndo : null,
      onChange: function (v, key) {
        if (isConv && gaugeChanged(v, key)) renderPM();
        preview();
      },
      onOK: function (v) {
        if (!v.fixedFace) { UI.toast('Pick the fixed face.'); return false; }
        if (isConv && !v.bendEdges.length) { UI.toast('Pick the edges that become bends.'); return false; }
        if ((isConv || v.ripEdges.length) && !(+v.gap > 0)) { UI.toast('The rip gap must be more than 0.'); return false; }
        if (!isConv && thickness(v) == null) { UI.toast(measured.err || 'Cannot read the part\'s thickness at the fixed face.'); return false; }
        var sheet;
        try { sheet = sheetOf(v, true); } catch (e) { UI.toast(e.message); return false; }
        var feat = featOf(v);
        ibLast = { radius: +v.bendRadius, gap: isConv || v.ripEdges.length ? +v.gap : ibLast.gap, thickness: isConv ? +v.thickness : ibLast.thickness };
        // one undo step takes back the sheet with the feature: the snapshot is taken before the sheet changes and the
        // one commitFeature takes (sheet already set) is dropped
        UI.pushUndo();
        var mark = App.undo.length;
        App.model.sheet = sheet;
        var res = commitFeature(feat, existing);
        if (App.undo.length === mark + 1) App.undo.splice(mark, 1);
        return res;
      }
    });
    preview();
  }
  function cmdInsertBends(existing) { cmdInsertBendsPM('insertBends', existing); }
  function cmdConvertSheetMetal(existing) { cmdInsertBendsPM('convertSM', existing); }
  // ribbon No Bends: the part without its inserted bends (SolidWorks rolls back to before Process-Bends) and back
  function toggleNoBends(on) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.features.some(function (g) { return g.type === 'insertBends' || g.type === 'convertSM'; })) { UI.toast('No Bends works on a part made sheet metal by Insert Bends or Convert to Sheet Metal.'); return false; }
    var want = on == null ? !App.model.noBends : !!on;
    if (want === !!App.model.noBends) return false;
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (want && App.model.flatState && UI.toggleFlatten) UI.toggleFlatten(false);
    UI.pushUndo();
    if (want) App.model.noBends = true; else delete App.model.noBends;
    return UI.afterRebuild(UI.rebuild(), function () {
      UI.refreshTree();
      if (UI.refreshRibbon) UI.refreshRibbon();
      UI.setStatus(want ? 'No Bends: the part as it was before its bends were inserted. Click No Bends again to insert them.' : 'Bends inserted.');
      return true;
    });
  }

  // ------------------------------------------------------------------ sheet metal: Tab (lane DI)
  // Base Flange/Tab on a part that already has a sheet is a Tab (SolidWorks: Tab1): a closed sketch on a flat sheet
  // face extruded the sheet's thickness into the sheet (Kernel.tabFeature: flush with the face, merged), the thickness
  // linked to the sheet (no sheet parameters here), Reverse direction = away from the face.
  function tabName() {
    var max = 0;
    App.model.features.forEach(function (g) { var mm = /^Tab(\d+)$/.exec(g.name || ''); if (mm && +mm[1] > max) max = +mm[1]; });
    return 'Tab' + (max + 1);
  }
  function cmdTab(existing) {
    if (existing) { tabPM(existing, existing.sketch); return; }
    withSketch(function (sid) {
      var sk = pickDefaultSketch(sid);
      if (sk == null) {
        openPM({
          title: 'Base Flange/Tab', icon: 'flange',
          message: 'Select a <b>flat face</b> of the sheet to sketch the tab on, then <b>Exit Sketch</b> to make the tab.',
          command: { pickPlane: true, onPick: function (pk) { if (pk.kind === 'plane') newSketchOnPlane(pk.ref); else newSketchOnFace(pk); App.pendingAfterSketch = function () { cmdBaseFlange(); }; return true; } },
          groups: []
        });
        return;
      }
      tabPM(null, sk);
    });
  }
  function tabPM(existing, sketchId) {
    var T = +(previewModel().sheet || App.model.sheet).thickness;
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'extrude', cut: false, depth: T, end: 'blind', reverse: false, dir2: false, depth2: 0, end2: 'blind', sketch: sketchId, sheetBase: true, tab: true, linkT: true };
    f.depth = T;
    openPM({
      title: existing ? existing.name : 'Base Flange/Tab', icon: 'flange', values: f, command: { sketchId: f.sketch },
      message: 'Tab: the sketch is extruded the sheet thickness (' + UI.fmtNum(T, 4) + ' ' + UI.unitLabel() + ', linked to the sheet) into the face it is sketched on and merged with the part.',
      groups: [{ title: 'Sketch', fields: [sketchPickerField(f)] },
        { title: 'Direction 1', fields: [{ type: 'check', label: 'Reverse direction (away from the face)', key: 'reverse' }, { type: 'check', label: 'Link to thickness', key: 'linkT', disabled: true }] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }],
      onChange: function (v) {
        App.command.sketchId = v.sketch; UI.updateSketches();
        v.linkT = true;
        var err = showPreview(resolved(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing the tab (thickness ' + UI.fmtNum(T, 4) + ').');
      },
      onOK: function (v) {
        var feat = tabOf(v);
        if (!existing && !feat.name) feat.name = tabName();
        return commitFeature(feat, existing);
      }
    });
    function tabOf(v) {
      var o = { type: 'extrude', cut: false, depth: T, end: 'blind', reverse: !!v.reverse, dir2: false, depth2: 0, end2: 'blind', sketch: v.sketch, sheetBase: true, tab: true, linkT: true };
      if (v.contours) o.contours = v.contours;
      if (v.name) o.name = v.name;
      return o;
    }
    // the preview extrudes the resolved copy (direction into the face found here, as the rebuild does)
    function resolved(v) {
      var o = tabOf(v);
      try {
        var sk = K.findFeature(App.model, o.sketch);
        return K.tabFeature(o, previewModel(), K.resolvePlane(sk.plane, App.model, App.build.planes || {}), App.build.body);
      } catch (e) { return o; }
    }
    var e0 = showPreview(resolved(f)); if (e0) UI.setStatus('Preview: ' + e0);
  }

  // ------------------------------------------------------------------ sheet metal: Closed Corner (lane CS)
  // SolidWorks' Sheet Metal ▸ Corners ▸ Closed Corner (Kernel.buildClosedCorner, a rebuild case): Faces to Extend (a
  // click on the end face of a flange wall at an open corner adds it, a second click removes it; the matching faces
  // across the corner are found by the kernel), Corner type (Butt / Overlap / Underlap), Gap distance, Overlap /
  // underlap ratio, Coplanar faces. The preview shows the material added (and, red, what is trimmed from the matching
  // wall), built in the worker; ✓ is one undo step; the type, gap and ratio are remembered for the session.
  var ccLast = { cornerType: 'butt', gap: null, ratio: 1 };
  function cmdClosedCorner(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.build || !App.build.body) { UI.toast('Create a Base Flange and edge flanges first.'); return; }
    var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'closedCorner', faces: [], cornerType: ccLast.cornerType,
      gap: ccLast.gap != null ? ccLast.gap : K.closedCornerDefaultGap(App.model), ratio: ccLast.ratio };
    f.faces = (f.faces || []).map(function (p) { return p.slice(); });
    if (f.cornerType == null) f.cornerType = 'butt';
    if (f.ratio == null) f.ratio = 1;
    f.coplanar = f.coplanar !== false;
    // lane DK: Open bend region (SolidWorks): off (a new corner, as SolidWorks) closes the bend region too
    // (closeBend: true); a corner saved before it has no closeBend and stays open
    f.openBend = existing ? !existing.closeBend : false;
    delete f.closeBend;
    var base = null;
    function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
    // a pick's end face (the kernel's own rule) or the reason it is not one; kept per point until the part shown changes
    var memo = {};
    function faceOf(p) {
      var key = p.join(',');
      if (memo[key]) return memo[key];
      try {
        var lay = K.closedCornerLayout({ faces: [p], coplanar: false, gap: K.closedCornerMinGap(App.model) }, previewModel(), { body: baseBody() });
        memo[key] = { key: lay.corners[0].at.map(function (x) { return Math.round(x * 1e4); }).join(','), d: lay.corners[0].d };
      } catch (e) { memo[key] = { error: e.message.replace(/^Closed Corner: /, '') }; }
      return memo[key];
    }
    function featOf(v) {
      var out = { type: 'closedCorner', faces: v.faces.map(function (p) { return p.slice(); }), cornerType: v.cornerType, gap: v.gap, ratio: v.ratio };
      if (v.coplanar === false) out.coplanar = false;
      if (!v.openBend) out.closeBend = true;
      if (v.name) out.name = v.name;
      return out;
    }
    function tol() { return K.pickTol(App.model.units, T / 2); }
    function lit() {
      var idx = [];
      if (App.mesh && (!existing || App.rollback != null)) f.faces.forEach(function (p) { try { var k = K.resolveFaces([{ at: p }], App.mesh, tol())[0]; if (k != null && k >= 0) idx.push(k); } catch (e) { } });
      if (App.command) App.command.faceList = idx;
      UI.updateHighlights();
    }
    function status(extra) {
      var n = f.faces.length;
      UI.setStatus((extra ? extra + ' ' : '') + 'Closed Corner: ' + n + ' face' + (n === 1 ? '' : 's') + ' to extend. Press Enter or ✓ to accept.');
    }
    function preview() {
      lit();
      if (!f.faces.length) { lp.shown = ++lp.seq; UI.disposeGroup(UI.groups.preview); UI.setStatus('Click the end faces of a flange at open corners (the narrow faces through the thickness facing the next flange).'); return; }
      livePreview({ op: 'closedCorner', feature: featOf(f), mats: [UI.mats.preview, UI.mats.previewCut], sync: previewSync, done: function () { status(); }, fail: function (msg) { UI.setStatus('Preview: ' + msg); } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var r = K.buildClosedCorner(featOf(f), previewModel(), { body: baseBody() });
        if (r.add && r.add.polygons.length) addPreviewMesh(r.add, UI.mats.preview);
        if (r.cut && r.cut.polygons.length) addPreviewMesh(r.cut, UI.mats.previewCut);
        status();
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function pick(pk) {
      if (pk.kind !== 'face' || !pk.point) return false;
      var p = pk.point.map(function (x) { return Math.round(x * 1e6) / 1e6; }), r = faceOf(p);
      if (r.error) { UI.setStatus(r.error); return true; }
      var hit = -1;
      f.faces.forEach(function (q, k) { var o = faceOf(q); if (o.key === r.key) hit = k; });
      if (hit >= 0) f.faces.splice(hit, 1); else f.faces.push(p);
      renderPM(); preview();
      return true;
    }
    // pre-selected end faces move into the PropertyManager
    if (!existing && UI.selection) {
      var used = false;
      UI.selection().forEach(function (s) {
        if (s.kind !== 'face' || !App.mesh || !App.mesh.faces[s.index]) return;
        var at = (s.point || App.mesh.faces[s.index].centroid).slice();
        if (!faceOf(at).error) { f.faces.push(at); used = true; }
      });
      if (used && UI.setSelection) UI.setSelection([]);
    }
    var TYPES = [['butt', 'Butt', 'ccButt'], ['overlap', 'Overlap', 'ccOverlap'], ['underlap', 'Underlap', 'ccUnderlap']];
    openPM({
      title: existing ? existing.name : 'Closed Corner', icon: 'closedCorner', values: f,
      onRollback: function () { memo = {}; lit(); },
      message: 'Click the <b>end faces</b> of a flange at open corners (the faces to extend); the faces to match on the next flange are found automatically. Choose the corner type, the gap and the overlap ratio.',
      command: { faceList: [], onPick: pick },
      groups: [
        { title: 'Faces to Extend', fields: [
          { type: 'pick', icon: 'closedCorner', placeholder: 'End faces of a flange…',
            value: function (v) { var n = v.faces.length; return n ? n + ' face' + (n === 1 ? '' : 's') : ''; },
            items: function (v) { return v.faces.map(function (p, i) { return { label: 'Face<' + (i + 1) + '>', at: p }; }); },
            onRemove: function (v, i) { v.faces.splice(i, 1); renderPM(); preview(); },
            onClear: function (v) { v.faces.length = 0; renderPM(); preview(); } },
          { type: 'static', label: 'Faces to match', value: function (v) { return v.faces.length ? 'found across each corner' : '—'; } },
          { type: 'iconRadio', label: 'Corner type', key: 'cornerType', options: TYPES, rerender: true },
          { type: 'number', label: 'Gap distance', key: 'gap', unit: 'u', min: 0 },
          { type: 'number', label: 'Overlap/underlap ratio', key: 'ratio', min: 0, step: 0.05, show: function (v) { return v.cornerType !== 'butt'; } },
          { type: 'check', label: 'Open bend region', key: 'openBend' },
          { type: 'check', label: 'Coplanar faces', key: 'coplanar' }
        ] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { preview(); },
      onOK: function (v) {
        if (!v.faces.length) { UI.toast('Select at least one face to extend.'); return false; }
        var min = K.closedCornerMinGap(App.model);
        if (!(+v.gap >= min - 1e-12)) { UI.toast('The gap must be at least ' + UI.fmtNum(min, 4) + ' (the flanges would join).'); return false; }
        if (v.cornerType !== 'butt' && !(+v.ratio >= 0 && +v.ratio <= 1)) { UI.toast('The overlap/underlap ratio must be between 0 and 1.'); return false; }
        var feat = featOf(v);
        feat.gap = +v.gap; feat.ratio = +v.ratio;   // equations go back in through commitFeature (applyExpressions)
        if (!existing && !feat.name) feat.name = K.closedCornerName(App.model);
        ccLast = { cornerType: v.cornerType, gap: +v.gap, ratio: +v.ratio };
        return commitFeature(feat, existing);
      }
    });
    preview();
  }

  // ------------------------------------------------------------------ sheet metal: Unfold / Fold (lane DB)
  // SolidWorks' Sheet Metal ▸ Unfold / Fold (Kernel.buildUnfold / buildFold, rebuild cases). Unfold: Fixed face (a
  // click on a flat face of the sheet; default the flat pattern's base face), Bends to unfold (a click on a bend adds
  // it, a second click removes it), Collect All Bends. Fold: Bends to fold (a click on an unfolded strip; empty = every
  // bend the Unfold unfolded), Collect All Bends. The preview is the part as the feature leaves it, built in the worker;
  // ✓ is one undo step. Cuts made between the two are folded with the part (Kernel: wrapped round each bend).
  function ufPt(p) { return p.map(function (x) { return Math.round(x * 1e6) / 1e6; }); }
  function ufSheetT() { var sh = previewModel().sheet || App.model.sheet; return sh ? +sh.thickness : 0; }
  // the Unfold record (kind 'unfold') the part shows now: the last Unfold (or partial Fold) before `upto` still open
  function ufActiveRecord(upto) {
    var feats = App.model.features.slice(0, upto == null ? App.model.features.length : upto), fl = (App.build && App.build.flanges) || {};
    for (var i = feats.length - 1; i >= 0; i--) {
      var g = feats[i];
      if (g.type !== 'unfold' && g.type !== 'fold') continue;
      if (App.build.errors && App.build.errors[g.id]) continue;
      var rec = (fl[g.id] || []).filter(function (r) { return r && r.kind === 'unfold'; })[0];
      return rec || null;
    }
    return null;
  }
  function ufLit(points, T) {
    var idx = [];
    if (App.mesh) points.forEach(function (p) { try { var k = K.resolveFaces([{ at: p }], App.mesh, K.pickTol(App.model.units, T / 2))[0]; if (k != null && k >= 0 && idx.indexOf(k) < 0) idx.push(k); } catch (e) { } });
    if (App.command) App.command.faceList = idx;
    UI.updateHighlights();
  }
  function cmdUnfoldFold(kind, existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var isFold = kind === 'fold', title = isFold ? 'Fold' : 'Unfold';
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.build || !App.build.body) { UI.toast('Create a Base Flange and edge flanges first.'); return; }
    var T = ufSheetT();
    var f = existing ? JSON.parse(JSON.stringify(existing)) : (isFold ? { type: 'fold', bends: [] } : { type: 'unfold', fixedFace: null, bends: [] });
    f.bends = (f.bends || []).map(function (p) { return p.slice(); });
    if (!isFold) f.fixedFace = f.fixedFace ? f.fixedFace.slice() : null;
    // the bends the part offers (Unfold: of the folded part shown; Fold: the strips the open Unfold laid flat)
    var bendsMemo = null;
    function upto() { return pm.editUpto != null ? pm.editUpto : null; }
    function bends() {
      if (bendsMemo) return bendsMemo;
      try {
        if (isFold) { var rec = ufActiveRecord(upto()); bendsMemo = rec ? rec.bends.filter(function (b) { return b.unfolded; }) : []; bendsMemo.rec = rec; }
        // lane DJ: a second Unfold while one is open offers the bends that one left folded (as the part shows them)
        else if (ufActiveRecord(upto())) bendsMemo = ufActiveRecord(upto()).bends.filter(function (b) { return !b.unfolded && b.zone; });
        else bendsMemo = K.sheetBends(previewModel(), App.build, App.mesh);
      } catch (e) { bendsMemo = []; bendsMemo.error = e.message; }
      return bendsMemo;
    }
    function featOf(v) {
      var out = { type: kind, bends: v.bends.map(function (p) { return p.slice(); }) };
      if (!isFold) out = { type: kind, fixedFace: v.fixedFace ? v.fixedFace.slice() : null, bends: out.bends };
      if (v.name) out.name = v.name;
      return out;
    }
    // what is lit: the fixed face and the bends picked (in the state shown)
    function lit() {
      if (existing && App.rollback == null) { if (App.command) App.command.faceList = []; UI.updateHighlights(); return; }
      var pts = [];
      if (!isFold && f.fixedFace) pts.push(f.fixedFace);
      f.bends.forEach(function (p) {
        if (!isFold) { pts.push(p); return; }
        var b = bends().filter(function (x) { return x.at && Math.hypot(x.at[0] - p[0], x.at[1] - p[1], x.at[2] - p[2]) < 1e-4 * (1 + T); })[0];
        if (b && b.quad) pts.push(b.quad.reduce(function (s, q) { return [s[0] + q[0] / b.quad.length, s[1] + q[1] / b.quad.length, s[2] + q[2] / b.quad.length]; }, [0, 0, 0]));
      });
      ufLit(pts, T);
    }
    function status(extra) {
      var n = f.bends.length, all = bends().length;
      UI.setStatus((extra ? extra + ' ' : '') + title + ': ' + (n ? n + ' of ' + all + ' bend' + (all === 1 ? '' : 's') : 'all ' + all + ' bend' + (all === 1 ? '' : 's')) +
        (isFold ? '' : ', fixed face ' + (f.fixedFace ? 'picked' : 'the base face')) + '. Press Enter or ✓ to accept.');
    }
    function preview() {
      lit();
      if (bends().error) { UI.setStatus(title + ': ' + bends().error); return; }
      if (isFold && !bends().rec) { lp.shown = ++lp.seq; UI.disposeGroup(UI.groups.preview); UI.setStatus('Fold: the part is not unfolded. Add an Unfold first.'); return; }
      livePreview({ op: kind, feature: featOf(f), mats: [UI.mats.preview], sync: previewSync, done: function () { status(); }, fail: function (msg) { UI.setStatus('Preview: ' + msg); } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var m = JSON.parse(JSON.stringify(App.model));
        if (upto() != null) m.features = m.features.slice(0, upto());
        var body = K.unfoldPreview(m, K.rebuild(m), featOf(f));
        if (body && body.polygons.length) addPreviewMesh(body, UI.mats.preview);
        status();
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    function toggleBend(at) {
      var hit = -1;
      f.bends.forEach(function (q, k) { if (Math.hypot(q[0] - at[0], q[1] - at[1], q[2] - at[2]) < 1e-4 * (1 + T)) hit = k; });
      if (hit >= 0) f.bends.splice(hit, 1); else f.bends.push(at.slice());
    }
    function pick(pk) {
      if (pk.kind !== 'face' || !pk.point) return false;
      var p = ufPt(pk.point), list = bends();
      if (isFold) {
        var k = K.unfoldedBendAt(list.rec, p, T);
        if (k < 0) { UI.setStatus('Fold: click a flat bend strip (a bend the Unfold laid flat).'); return true; }
        toggleBend(list.rec.bends[k].at.map(function (x) { return Math.round(x * 1e6) / 1e6; }));
      } else {
        var b = K.sheetBendAt(list, p, T);
        if (b >= 0) toggleBend(list[b].at.map(function (x) { return Math.round(x * 1e6) / 1e6; }));
        else f.fixedFace = p;
      }
      renderPM(); preview();
      return true;
    }
    function collectAll(v) {
      v.bends = bends().map(function (b) { return b.at.map(function (x) { return Math.round(x * 1e6) / 1e6; }); });
      renderPM(); preview();
    }
    var groups = [];
    if (!isFold) groups.push({ title: 'Selections', fields: [
      { type: 'pick', icon: 'unfold', placeholder: 'Fixed face (default: the base face)…',
        value: function (v) { return v.fixedFace ? 'Fixed face <1>' : ''; },
        items: function (v) { return v.fixedFace ? [{ label: 'Face<1>', at: v.fixedFace }] : []; },
        onRemove: function (v) { v.fixedFace = null; renderPM(); preview(); },
        onClear: function (v) { v.fixedFace = null; renderPM(); preview(); } }
    ] });
    groups.push({ title: isFold ? 'Selections' : 'Bends to unfold', fields: [
      { type: 'pick', icon: isFold ? 'fold' : 'unfold', placeholder: isFold ? 'Bends to fold (empty: every unfolded bend)…' : 'Bends to unfold (empty: every bend)…',
        value: function (v) { var n = v.bends.length; return n ? n + ' bend' + (n === 1 ? '' : 's') : ''; },
        items: function (v) { return v.bends.map(function (p, i) { return { label: 'Bend<' + (i + 1) + '>', at: p }; }); },
        onRemove: function (v, i) { v.bends.splice(i, 1); renderPM(); preview(); },
        onClear: function (v) { v.bends.length = 0; renderPM(); preview(); } },
      { type: 'buttons', buttons: [{ label: 'Collect All Bends', onclick: collectAll }] },
      { type: 'static', label: 'Bends in the part', value: function () { var n = bends().length; return n + (isFold ? ' unfolded' : ''); } }
    ] });
    groups.push({ title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] });
    openPM({
      title: existing ? existing.name : title, icon: kind, values: f,
      onRollback: function () { bendsMemo = null; lit(); },
      message: isFold
        ? 'Click the <b>flat bend strips</b> to fold back, or <b>Collect All Bends</b> (none picked: every bend the Unfold unfolded). Cuts made across the flat follow the bends.'
        : 'Click a <b>flat face</b> that stays fixed, then the <b>bends</b> to unfold (a second click removes one), or <b>Collect All Bends</b>. Features after it (cuts, holes, sketches) work on the flat; a Fold folds them with the part.',
      command: { faceList: [], onPick: pick },
      groups: groups,
      onChange: function () { preview(); },
      onOK: function (v) {
        if (isFold && !bends().rec) { UI.toast('The part is not unfolded: add an Unfold first.'); return false; }
        var feat = featOf(v);
        if (!feat.name) delete feat.name;
        return commitFeature(feat, existing);
      }
    });
    preview();
  }
  function cmdUnfold(existing) { cmdUnfoldFold('unfold', existing); }
  function cmdFold(existing) { cmdUnfoldFold('fold', existing); }

  function flatSvg(flat, width) {
    var b = flat.bbox, w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], pad = Math.max(w, h) * 0.08 + 2;
    var vb = [b.min[0] - pad, -(b.max[1] + pad), w + 2 * pad, h + 2 * pad];
    var sw = Math.max(w, h) / 300;
    function pt(p) { return UI.fmtNum(p[0], 3) + ',' + UI.fmtNum(-p[1], 3); }
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') + '" width="' + width + '" style="max-width:100%;background:#fff;border:1px solid #d7d7d7">';
    flat.loops.forEach(function (l, i) { s += '<polygon points="' + l.map(pt).join(' ') + '" fill="' + (i === 0 ? '#f0f0f0' : '#fff') + '" stroke="' + (i === 0 ? '#282828' : '#d9453b') + '" stroke-width="' + sw + '"/>'; });
    var cx = (b.min[0] + b.max[0]) / 2, cy = -(b.min[1] + b.max[1]) / 2, fs = sw * 12;
    flat.bends.forEach(function (bd) {
      s += '<line x1="' + UI.fmtNum(bd.a[0], 3) + '" y1="' + UI.fmtNum(-bd.a[1], 3) + '" x2="' + UI.fmtNum(bd.b[0], 3) + '" y2="' + UI.fmtNum(-bd.b[1], 3) + '" stroke="#3fa34d" stroke-width="' + sw + '" stroke-dasharray="' + (sw * 6) + ' ' + (sw * 3) + '"/>';
      // p9-pm: the shop note (Kernel.bendNoteText: "UP 90° R.060") along the bend line, on the side toward the middle
      // of the blank so a bend near the edge does not write over the outline
      var label = K.bendNoteText ? K.bendNoteText(bd, App.model.units) : bd.label;
      var mx = (bd.a[0] + bd.b[0]) / 2, my = -(bd.a[1] + bd.b[1]) / 2;
      var ang = Math.atan2(-(bd.b[1] - bd.a[1]), bd.b[0] - bd.a[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
      var r = ang * Math.PI / 180, ux = Math.sin(r), uy = -Math.cos(r);   // the text's "up" in SVG coordinates
      var side = (cx - mx) * ux + (cy - my) * uy >= 0 ? 1 : -1;
      var off = side > 0 ? sw * 4 : -(sw * 4 + fs * 0.8);   // baseline above the line, or the text's top below it
      var tx = mx + ux * off, ty = my + uy * off;
      s += '<text x="' + UI.fmtNum(tx, 3) + '" y="' + UI.fmtNum(ty, 3) + '" font-size="' + fs + '" font-family="Segoe UI, sans-serif" fill="#3a3a3a" text-anchor="middle" data-role="bend-note"' +
        (Math.abs(ang) > 1e-9 ? ' transform="rotate(' + UI.fmtNum(ang, 3) + ' ' + UI.fmtNum(tx, 3) + ' ' + UI.fmtNum(ty, 3) + ')"' : '') + '>' + smEsc(label) + '</text>';
    });
    s += '<text x="' + UI.fmtNum(b.min[0], 3) + '" y="' + UI.fmtNum(-b.min[1] + sw * 16, 3) + '" font-size="' + (sw * 11) + '" font-family="Segoe UI, sans-serif" fill="#737373">' + 'Flat size ' + UI.fmtNum(w, 4) + ' × ' + UI.fmtNum(h, 4) + ' ' + UI.unitLabel() + ' · ' + smEsc(flat.note || ('T=' + flat.sheet.thickness + ' R=' + flat.sheet.bendRadius + ' K=' + flat.sheet.kFactor)) + '</text>';
    return s + '</svg>';
  }

  function cmdFlatten() {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var flat;
    try { flat = K.flatPattern(App.model, App.build, App.mesh); }
    catch (e) { UI.toast(e.message); UI.setStatus(e.message); return; }
    var w = flat.bbox.max[0] - flat.bbox.min[0], h = flat.bbox.max[1] - flat.bbox.min[1];
    var body = UI.el('div', {});
    body.innerHTML = '<p>Flat pattern: <b data-role="flat-size">' + flatSizeText(flat) + '</b> blank, ' + flat.bends.length + ' bend' + (flat.bends.length === 1 ? '' : 's') + '. Bend lines sit at the centre of each bend allowance (' + smEsc(flat.note) + ').</p>' +
      (flat.warnings.length ? '<p class="err-text" data-role="flat-warnings">' + flat.warnings.map(smEsc).join('<br>') + '</p>' : '') + flatSvg(flat, 620);
    UI.setStatus(flatSizeText(flat) + ' · ' + flat.bends.length + ' bend' + (flat.bends.length === 1 ? '' : 's') + ' · ' + flat.note + (flat.warnings.length ? ' · ' + flat.warnings[0] : ''));
    // p9-pm: Export DXF opens the DXF/DWG Output PropertyManager on Sheet metal (version, lines/arcs, DWG, layers)
    UI.showModal({ title: 'Flat Pattern — ' + App.model.name, body: body, buttons: [
      { label: 'Export DXF', primary: true, action: function () { UI.closeModal(); cmdDxfOutput({ export: 'sheet' }); } },
      { label: 'Sheet metal parameters…', action: function () { UI.closeModal(); cmdSheetMetal(); } },
      { label: 'Close', action: UI.closeModal }
    ] });
  }
  // ------------------------------------------------------------------ lane DC (findings #8, #9): Flatten as a state
  // Sheet Metal ▸ Flatten toggles the part between folded and its flat pattern (App.model.flatState, saved with the
  // document; one undo step each way; ui-core.js updateFlatState draws it), as SolidWorks unsuppresses / suppresses
  // Flat-Pattern1. UI.cmdFlatten stays the Flat Pattern dialog (size, bends, Export DXF): the tree's right-click ▸
  // Flat Pattern… and anvil scripts use it. A feature made while flat goes in above Flat-Pattern1 (commitFeature);
  // flatRefuse (unused since lane DC2) is kept for a command that cannot work on a flat part.
  var FLAT_REFUSE = 'The part is flattened: click Flatten (or suppress Flat-Pattern1) to fold it, then add the feature.';
  function flatRefuse() {
    if (!App.model || !App.model.flatState) return false;
    UI.toast(FLAT_REFUSE); UI.setStatus(FLAT_REFUSE);
    return true;
  }
  UI.flatRefuse = flatRefuse;
  // toggleFlatten(on?) -> true when the state changed. on: true flattens, false folds, omitted toggles.
  function toggleFlatten(on) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return false; }
    var want = on == null ? !App.model.flatState : !!on;
    if (want === !!App.model.flatState) return false;
    if (want) {
      var flat;
      try { flat = K.flatPattern(App.model, App.build, App.mesh); }
      catch (e) { UI.toast('Flatten: ' + e.message); UI.setStatus('Flatten: ' + e.message); return false; }
    }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    UI.pushUndo();
    if (want) App.model.flatState = true; else delete App.model.flatState;
    App.sel = null; App.sel2 = null; App.hover = null;
    UI.updateFlatState();
    drawCrossBreaks();
    UI.updateHighlights();
    UI.refreshTree();
    if (UI.refreshRibbon) UI.refreshRibbon();
    if (UI.autosave) UI.autosave();
    if (want && App.flat) UI.setStatus('Flattened: ' + flatSizeText(App.flat) + ' · ' + App.flat.bends.length + ' bend' + (App.flat.bends.length === 1 ? '' : 's') + ' · ' + App.flat.note + '. Click Flatten again to fold.');
    else if (want) UI.setStatus('Flatten: ' + (App.flatError || 'the flat pattern could not be shown.'));
    else UI.setStatus('Folded.');
    return true;
  }
  UI.toggleFlatten = toggleFlatten;
  // Flat-Pattern1 ▸ Edit Feature: SolidWorks' Flat-Pattern PropertyManager (lane DK). Fixed face (a flat face of the
  // folded part: the flat is laid in its plane, the face staying where it is; empty = the Base Flange's face) and Grain
  // direction (a straight edge on a flat face: the flat turns so it runs along +X), saved on the model as
  // model.flatFixed = [x, y, z] / model.flatGrain = { at, dir } and read by Kernel.flatPattern (flatOrient), so the
  // Flatten state, the flat DXF, the drawing's flat-pattern view and its bend table all follow. Lane flatopts: Merge
  // faces / Simplify bends / Show slit and Corner Options ▸ Corner treatment (SolidWorks' order and wording) are
  // model.flatOptions (only the keys that differ from Kernel.FLAT_OPTION_DEFAULTS), read by Kernel.flatPattern.
  // Picks are made while folded (a flat part offers no faces to click).
  function cmdFlatPatternEdit() {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    var T = ufSheetT(), wasFlat = !!App.model.flatState;
    if (wasFlat) { delete App.model.flatState; UI.updateFlatState(); }   // show the folded part to pick on
    var v0 = { fixed: App.model.flatFixed ? App.model.flatFixed.slice() : null, grain: App.model.flatGrain ? { at: App.model.flatGrain.at.slice(), dir: App.model.flatGrain.dir.slice() } : null };
    var FO = K.FLAT_OPTION_DEFAULTS, fo0 = K.flatOptionsOf(App.model);
    Object.keys(FO).forEach(function (k) { v0[k] = fo0[k]; });
    // the stored form: only the boxes that differ from the default (null = all default)
    function foOf(v) { var o = {}, n = 0; Object.keys(FO).forEach(function (k) { if (!!v[k] !== FO[k]) { o[k] = !!v[k]; n++; } }); return n ? o : null; }
    var memo = { key: null, flat: null, err: null };
    function flatOf(v) {
      var key = JSON.stringify([v.fixed, v.grain, foOf(v)]);
      if (memo.key === key) return memo;
      var m = {}; Object.keys(App.model).forEach(function (k) { m[k] = App.model[k]; });
      if (v.fixed) m.flatFixed = v.fixed; else delete m.flatFixed;
      if (v.grain) m.flatGrain = v.grain; else delete m.flatGrain;
      if (foOf(v)) m.flatOptions = foOf(v); else delete m.flatOptions;
      delete m.flatState;
      memo = { key: key, flat: null, err: null };
      try { memo.flat = K.flatPattern(m, App.build, App.mesh); } catch (e) { memo.err = e.message; }
      return memo;
    }
    function rnd(p) { return p.map(function (x) { return Math.round(x * 1e6) / 1e6; }); }
    function grainEdge(g) {
      if (!g || !App.edges) return null;
      var best = null, bd = 1e-3 * (1 + T);
      App.edges.forEach(function (e) {
        if (!e.a || !e.b) return;
        var d = V.norm(V.sub(e.b, e.a)), gd = V.norm(g.dir);
        if (Math.abs(Math.abs(V.dot(d, gd)) - 1) > 1e-6) return;
        var w = V.sub(g.at, e.a), t = V.dot(w, d), L = V.len(V.sub(e.b, e.a));
        if (t < -bd || t > L + bd) return;
        var off = V.len(V.sub(w, V.scale(d, t)));
        if (off < bd) { bd = off; best = e; }
      });
      return best;
    }
    function lit() {
      ufLit(pm.values.fixed ? [pm.values.fixed] : [], T);
      var ge = grainEdge(pm.values.grain);
      if (App.command) App.command.edgeList = ge ? [ge] : [];
      UI.updateHighlights();
    }
    function warnOf(v) { var r = flatOf(v); return r.flat ? r.flat.warnings.filter(function (w) { return /^Flat-Pattern:/.test(w); })[0] || '' : ''; }
    function status() {
      var r = flatOf(pm.values), w = warnOf(pm.values);
      UI.setStatus(r.flat ? 'Flat-Pattern1: ' + flatSizeText(r.flat) + (w ? ' · ' + w.replace(/^Flat-Pattern: /, '') : '') + '. Press Enter or ✓ to accept.' : 'Flat-Pattern1: ' + r.err);
    }
    function pick(pk) {
      var v = pm.values;
      if (pk.kind === 'edge' && pk.edge && pk.edge.a && pk.edge.b) {
        var dir = V.sub(pk.edge.b, pk.edge.a), L = V.len(dir);
        if (!(L > 1e-9)) return true;
        var g = { at: rnd(V.scale(V.add(pk.edge.a, pk.edge.b), 0.5)), dir: rnd(V.scale(dir, 1 / L)) };
        var test = flatOf({ fixed: v.fixed, grain: g });
        if (test.flat && test.flat.warnings.some(function (w) { return /grain direction/.test(w); })) { UI.setStatus('Grain direction: click a straight edge lying on a flat face of the sheet (not one across the thickness or on a bend).'); return true; }
        v.grain = g;
      } else if (pk.kind === 'face' && pk.point) {
        var fx = rnd(pk.point), tf = flatOf({ fixed: fx, grain: v.grain });
        if (tf.flat && tf.flat.warnings.some(function (w) { return /fixed face/.test(w); })) { UI.setStatus('Fixed face: click a flat face of the sheet (a bend surface or an edge face cannot stay fixed).'); return true; }
        v.fixed = fx;
      } else return false;
      renderPM(); lit(); status();
      return true;
    }
    function restoreFlat() { if (wasFlat && !App.model.flatState) { App.model.flatState = true; UI.updateFlatState(); } }
    openPM({
      title: 'Flat-Pattern1', icon: 'flatten', values: v0,
      message: 'Click a <b>flat face</b> that stays fixed (empty: the Base Flange\'s face) and a straight <b>edge</b> for the grain direction (the flat turns so the grain runs along X). The flat DXF, Flatten and the drawing\'s flat-pattern view follow.',
      command: { faceList: [], edgeList: [], pickEdges: true, onPick: pick },
      onChange: function () { status(); },
      groups: [
        { title: 'Parameters', fields: [
          { type: 'pick', icon: 'flatten', placeholder: 'Fixed face (default: the Base Flange\'s face)…',
            value: function (v) { return v.fixed ? 'Fixed face <1>' : ''; },
            items: function (v) { return v.fixed ? [{ label: 'Face<1>', at: v.fixed }] : []; },
            onRemove: function (v) { v.fixed = null; renderPM(); lit(); status(); },
            onClear: function (v) { v.fixed = null; renderPM(); lit(); status(); } },
          { type: 'pick', icon: 'line', placeholder: 'Grain direction (an edge)…',
            value: function (v) { return v.grain ? 'Edge<1>' : ''; },
            items: function (v) { return v.grain ? [{ label: 'Edge<1>', at: v.grain.at }] : []; },
            onRemove: function (v) { v.grain = null; renderPM(); lit(); status(); },
            onClear: function (v) { v.grain = null; renderPM(); lit(); status(); } },
          // lane flatopts: each box has its kernel switch (Kernel.flatOptionsOf; see FLAT_OPTION_DEFAULTS)
          { type: 'check', label: 'Merge faces', key: 'mergeFaces' },
          { type: 'check', label: 'Simplify bends', key: 'simplifyBends' },
          { type: 'check', label: 'Show slit', key: 'showSlit' }
        ] },
        { title: 'Corner Options', fields: [
          { type: 'check', label: 'Corner treatment', key: 'cornerTreatment' }
        ] },
        { title: 'Flat Pattern', fields: [
          { type: 'static', label: 'Flat size', value: function (v) { var r = flatOf(v); return r.flat ? flatSizeText(r.flat).replace(/^Flat size /, '') : (r.err || ''); } },
          { type: 'static', label: 'Bends', value: function (v) { var r = flatOf(v); return r.flat ? String(r.flat.bends.length) : ''; } },
          { type: 'static', label: 'State', value: wasFlat ? 'Flattened' : 'Folded (suppressed)' },
          { type: 'buttons', buttons: [
            { label: wasFlat ? 'Fold' : 'Flatten', onclick: function () { UI.closePM(); restoreFlat(); toggleFlatten(); } },
            { label: 'Flat Pattern…', onclick: function () { UI.closePM(); restoreFlat(); cmdFlatten(); } },
            { label: 'Export DXF…', onclick: function () { UI.closePM(); restoreFlat(); cmdDxfOutput({ export: 'sheet' }); } }
          ] }
        ] }
      ],
      onCancel: function () { restoreFlat(); },
      onOK: function (v) {
        var same = JSON.stringify([v.fixed, v.grain, foOf(v)]) === JSON.stringify([App.model.flatFixed || null, App.model.flatGrain || null, foOf(K.flatOptionsOf(App.model))]);
        if (!same) {
          if (wasFlat) App.model.flatState = true;   // the undo step keeps the state the part was in
          UI.pushUndo();
          if (v.fixed) App.model.flatFixed = v.fixed.slice(); else delete App.model.flatFixed;
          if (v.grain) App.model.flatGrain = { at: v.grain.at.slice(), dir: v.grain.dir.slice() }; else delete App.model.flatGrain;
          if (foOf(v)) App.model.flatOptions = foOf(v); else delete App.model.flatOptions;   // lane flatopts
          // the drawing caches its flat on the mesh: drop it so a flat-pattern view redraws
          [App.mesh, App.build && App.build.mesh].forEach(function (ms) { if (ms && typeof ms === 'object') try { delete ms._drawingFlat; } catch (e) { } });
          if (UI.autosave) UI.autosave();
        }
        if (wasFlat) App.model.flatState = true;
        UI.updateFlatState();
        UI.updateHighlights();
        UI.refreshTree();
        var r = flatOf(v);
        if (r.flat) UI.setStatus('Flat-Pattern1: ' + flatSizeText(r.flat) + '.');
        return true;
      }
    });
    lit(); status();
  }
  UI.cmdFlatPatternEdit = cmdFlatPatternEdit;
  // Sheet Metal ▸ Flat to DXF: the DXF/DWG Output PropertyManager with Sheet metal chosen (p9-pm: was a text dialog)
  function exportFlatDXF() {
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    cmdDxfOutput({ export: 'sheet' });
  }

  // ------------------------------------------------------------------ DXF/DWG Output (File ▸ Save As ▸ DXF / DWG)
  // SolidWorks' DXF/DWG Output PropertyManager: one place for every 2D export of a part. Export = the selected planar
  // face (Kernel.exportDXFFace), the standard views laid out on a sheet (a drawing document built the way the headless
  // runner's `drawing` command does, never opened as a document, written by Drawing.toDXF), or the sheet-metal flat
  // pattern (Kernel.exportDXFFlat, with its BEND / NOTES layers filtered out of the text here when unchecked; the
  // kernel writer always writes them). DWG goes through the local server's converter (POST api/dxf2dwg, serve.ps1);
  // the published copy has no server, so DWG is greyed there with the reason.
  var DXF_VIEW_ROLES = { Front: 'front', Top: 'top', Right: 'right', Isometric: 'iso' };
  var DXF_VIEW_NAMES = ['Front', 'Top', 'Right', 'Isometric'];
  function dxfSafeName() { return (App.model.name || 'part').replace(/[^\w\-]+/g, '_'); }
  function dxfUnits() { return App.model.units === 'in' ? 'in' : 'mm'; }
  // the viewport's camera as a drawing frame: e toward the viewer, u sheet right, v sheet up (a view made with
  // { frame: { e, u, v } } keeps it, as the drawing's projected views do; its orient 'Current' names the layer)
  function currentViewFrame() {
    var c = UI.cam, e = V.norm([c.dir.x, c.dir.y, c.dir.z]), up = [c.up.x, c.up.y, c.up.z];
    var u = V.cross(up, e);
    if (V.len(u) < 1e-6) u = V.cross([0, 0, 1], e);
    if (V.len(u) < 1e-6) u = [1, 0, 0];
    u = V.norm(u);
    return { name: 'Current', e: e, u: u, v: V.cross(e, u) };
  }
  // The pictorial corner of the sheet (third angle: right of the Front / Top column, above the Front / Right row),
  // the way Drawing.layout places the Isometric; the whole usable area when no standard view is on the sheet.
  function pictorialBox(doc, mesh, units) {
    var S = Drawing.sheetSize(doc, units), k = units === 'in' ? 1 / 25.4 : 1, g = 22 * k, sv = Drawing.scaleValue(doc.sheet.scale || [1, 1]);
    var box = { x0: 10 * k, x1: S[0] - 10 * k, y0: 50 * k, y1: S[1] - 10 * k };   // BORDER 10, title block 40 (drawing-sheet.js)
    doc.views.forEach(function (v) {
      if (!v.role || v.role === 'iso') return;
      var E = Drawing.extentsOf(mesh, v.orient);
      if (v.role === 'front' || v.role === 'top') box.x0 = Math.max(box.x0, v.x + E.w * sv / 2 + g / 2);
      if (v.role === 'front' || v.role === 'right') box.y0 = Math.max(box.y0, v.y + E.h * sv / 2 + g / 2);
    });
    return box;
  }
  // centre a view in a box, at the sheet scale when it fits, else the largest standard scale that does (as the
  // Isometric in Drawing.layout)
  function fitViewInBox(doc, mesh, units, v, frame, box) {
    var E = Drawing.extentsOf(mesh, frame), sv = Drawing.scaleValue(doc.sheet.scale || [1, 1]), g = 22 * (units === 'in' ? 1 / 25.4 : 1);
    var bw = box.x1 - box.x0 - g / 2, bh = box.y1 - box.y0 - g / 2, SC = Drawing.SCALES;
    v.scale = null;
    if (E.w * sv > bw || E.h * sv > bh) {
      for (var j = 0; j < SC.length; j++) { var q = Drawing.scaleValue(SC[j]); if (q < sv && E.w * q <= bw && E.h * q <= bh) { v.scale = SC[j]; break; } }
      if (!v.scale) v.scale = SC[SC.length - 1];
    }
    v.x = (box.x0 + box.x1) / 2; v.y = (box.y0 + box.y1) / 2;
  }
  // dropDxfLayers(text, ['BEND', 'NOTES']): the DXF with every entity on those layers left out (a POLYLINE goes with
  // its VERTEX / SEQEND records); the layer table keeps the names, which readers accept
  function dropDxfLayers(text, layers) {
    if (!layers || !layers.length) return text;
    var L = text.split('\n'), out = [], inEnt = false, skip = false;
    for (var i = 0; i + 1 < L.length; i += 2) {
      var code = L[i].trim(), val = L[i + 1];
      if (code === '0') {
        var name = val.trim();
        if (name === 'SECTION' || name === 'ENDSEC' || name === 'EOF') { inEnt = false; skip = false; }
        else if (inEnt && name !== 'VERTEX' && name !== 'SEQEND') {
          // a new entity: its layer is the group 8 that follows before the next group 0
          var layer = null;
          for (var j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2) if (L[j].trim() === '8') { layer = L[j + 1].trim(); break; }
          skip = layer != null && layers.indexOf(layer) >= 0;
        }
      } else if (code === '2' && !inEnt && i >= 2 && L[i - 2].trim() === '0' && L[i - 1].trim() === 'SECTION' && val.trim() === 'ENTITIES') inEnt = true;
      if (!skip) out.push(L[i], L[i + 1]);
    }
    if (L.length % 2) out.push(L[L.length - 1]);
    return out.join('\n');
  }
  // The standard views (and the current one) at full size (1:1), one layer per view, for CAM: the views are laid out
  // third angle on a sheet sized to the part (doc.sheet.paper), the sheet scale fixed at 1:1, and the sheet grown until
  // no view had to be drawn smaller; the border and title block (layer SHEET) are left out of the file.
  function dxfViews(names, current, version) {
    if (typeof Drawing === 'undefined') throw new Error('Views need drawing.js, which did not load.');
    if (!App.mesh || !App.mesh.triCount) throw new Error('Nothing to export yet.');
    var units = dxfUnits(), mesh = App.mesh, k = units === 'in' ? 25.4 : 1;   // model units -> paper mm
    var F = Drawing.extentsOf(mesh, 'Front'), T = Drawing.extentsOf(mesh, 'Top'), I = Drawing.extentsOf(mesh, 'Isometric');
    var C = current ? Drawing.extentsOf(mesh, currentViewFrame()) : { w: 0, h: 0 };
    var gap = 22, piW = Math.max(I.w, C.w) * k, piH = (I.h + C.h) * k + gap;
    // room for Front + Right + the pictorial corner across, Front + Top + the corner up, plus border and title block
    var paper = [(F.w + T.h) * k + piW + 8 * gap + 20, (F.h + T.h) * k + piH + 8 * gap + 60], doc;
    for (var tries = 0; tries < 8; tries++) {
      doc = dxfViewsDoc(names, current, units, paper);
      if (!doc.views.some(function (v) { return v.scale && Drawing.scaleValue(v.scale) !== 1; })) break;
      paper = [paper[0] * 1.5, paper[1] * 1.5];
    }
    return dropDxfLayers(Drawing.toDXF(Drawing.compute(doc, mesh, App.model), { version: version === 'R2000' ? 'R2000' : 'R12' }), ['SHEET']);
  }
  function dxfViewsDoc(names, current, units, paper) {
    var mesh = App.mesh, model = App.model;
    var doc = Drawing.newDrawing(model, { projection: 'third', autoDims: false, name: 'DXF Output', scale: [1, 1] });
    doc.sheet.paper = paper;
    var front = null, used = {};
    names.forEach(function (n) {
      var role = DXF_VIEW_ROLES[n];
      if (!role || used[role]) return;
      used[role] = n;
      var props = { role: role };
      if (role === 'top' && front) { props.parent = front.id; props.align = 'x'; }
      if (role === 'right' && front) { props.parent = front.id; props.align = 'y'; }
      var v = Drawing.addView(doc, n, props);
      if (role === 'front') front = v;
    });
    var cur = null, frame = null;
    if (current) { frame = currentViewFrame(); cur = Drawing.addView(doc, 'Current', { frame: { e: frame.e, u: frame.u, v: frame.v } }); }
    if (!doc.views.length) throw new Error('Pick at least one view.');
    if (doc.views.some(function (v) { return v.role; })) Drawing.layout(doc, mesh, units);   // only the current view: nothing to lay out
    if (cur) {
      // the current view takes the pictorial corner; with the Isometric there too, the two share it, Isometric above
      var box = pictorialBox(doc, mesh, units), iso = doc.views.filter(function (v) { return v.role === 'iso'; })[0];
      if (iso) {
        var ym = (box.y0 + box.y1) / 2;
        fitViewInBox(doc, mesh, units, iso, iso.orient, { x0: box.x0, x1: box.x1, y0: ym, y1: box.y1 });
        fitViewInBox(doc, mesh, units, cur, frame, { x0: box.x0, x1: box.x1, y0: box.y0, y1: ym });
      } else fitViewInBox(doc, mesh, units, cur, frame, box);
    }
    return doc;
  }
  // dxfOutput(opts) -> DXF text, without the PropertyManager (anvil.dxfOutput):
  // { export: 'faces' | 'views' | 'sheet', face (index, default the selected face), views: ['Front', 'Top', 'Right',
  //   'Isometric'], current (bool: the viewport's orientation as one more view), bendLines, notes, etch (Sketches: the
  //   ETCH marking), formingTools (the FORM marks) (sheet, default on), lane dxfout (sheet, default off): hiddenEdges
  //   (the Forming Tools' far-side outlines, layer HIDDEN), boundaryBox (layer BOUNDARY), bendLayers: 'split' (BEND_UP /
  //   BEND_DOWN), reliefLayer (corner / bend relief edges on RELIEF),
  //   version: 'R12' (default) | 'R2000' (faces, views, sketch and sheet), style: 'polyline' (default: one closed
  //   polyline per loop) | 'entities' (LINE / ARC; faces and sheet) }. Faces and the flat pattern come out laser
  //   ready (Kernel.exportDXFFlat): true circles and arcs, joined loops, the flat's lower-left corner at 0,0.
  function dxfOutput(opts) {
    opts = opts || {};
    var what = opts.export || dxfDefaultExport();
    var wopts = { version: opts.version === 'R2000' ? 'R2000' : 'R12', style: opts.style === 'entities' ? 'entities' : 'polyline' };
    if (what === 'faces') {
      var fi = opts.face != null ? +opts.face : (App.sel && App.sel.kind === 'face' ? App.sel.index : -1);
      if (!(fi >= 0) || !App.mesh || !App.mesh.faces[fi]) throw new Error('Select a planar face first.');
      var dxf = K.exportDXFFace(App.mesh, fi, dxfUnits(), wopts);
      if (!dxf) throw new Error('Could not outline that face.');
      return dxf;
    }
    if (what === 'views') return dxfViews(opts.views || ['Front', 'Top', 'Right'], !!opts.current, wopts.version);
    if (what === 'sketch') {
      var sk = opts.sketch != null ? K.findFeature(App.model, opts.sketch) : dxfDefaultSketch();
      if (!sk || sk.type !== 'sketch') throw new Error('Pick a sketch to export.');
      if (!sk.entities.some(function (e) { return e.t !== 'point' && (opts.construction || !e.construction); })) throw new Error(sk.name + ' has nothing to export' + (opts.construction ? '.' : ' (only construction geometry or points).'));
      return K.exportDXFSketch(sk, dxfUnits(), { version: wopts.version, construction: !!opts.construction });
    }
    if (what === 'sheet') {
      if (!App.model.sheet) throw new Error('Sheet metal needs a Base Flange.');
      var flat = K.flatPattern(App.model, App.build, App.mesh);
      // rfIY: SolidWorks' Entities to export. The writer ties the Forming Tool marks (layer FORM) to bendLines, so it
      // writes both when either is wanted and the one left out is dropped here; Sketches = the ETCH marking (etch)
      var bl = opts.bendLines !== false, ft = opts.formingTools !== false;
      wopts.bendLines = bl || ft; wopts.notes = opts.notes !== false; wopts.etch = opts.etch !== false;
      wopts.hiddenEdges = !!opts.hiddenEdges; wopts.boundaryBox = !!opts.boundaryBox; wopts.reliefLayer = !!opts.reliefLayer;
      if (opts.bendLayers === 'split') wopts.bendLayers = 'split';
      var drop = [];
      if (!bl) drop.push('BEND', 'BEND_UP', 'BEND_DOWN');
      if (!ft) drop.push('FORM');
      return dropDxfLayers(K.exportDXFFlat(flat, dxfUnits(), wopts), drop);
    }
    throw new Error('Unknown export "' + what + '" (faces, views, sheet or sketch).');
  }
  // the part's sketches that have something to draw, in tree order
  function dxfSketches() { return (App.model.features || []).filter(function (f) { return f.type === 'sketch' && (f.entities || []).some(function (e) { return e.t !== 'point'; }); }); }
  // the sketch Sketch export takes by default: the one being edited, else the one selected in the tree (or the sketch
  // of the selected feature), else the last one with geometry
  function dxfDefaultSketch() {
    if (App.mode === 'sketch' && UI.activeSketchFeature && UI.activeSketchFeature()) return UI.activeSketchFeature();
    if (App.sel && App.sel.kind === 'feature') {
      var f = K.findFeature(App.model, App.sel.id);
      if (f && f.type === 'sketch') return f;
      if (f && f.sketch != null) { var s = K.findFeature(App.model, f.sketch); if (s && s.type === 'sketch') return s; }
    }
    var list = dxfSketches();
    return list.length ? list[list.length - 1] : null;
  }
  function hasSolid() { return !!(App.mesh && App.mesh.triCount); }
  // in a sketch, or with a part that has no solid yet, Sketch is the default; then Sheet metal, Faces, Views
  function dxfDefaultExport() {
    if ((App.mode === 'sketch' || !hasSolid()) && dxfDefaultSketch()) return 'sketch';
    return App.model.sheet ? 'sheet' : App.sel && App.sel.kind === 'face' ? 'faces' : 'views';
  }
  function dxfSuffix(v) {
    if (v.export === 'sketch') { var s = v.sketch != null && v.sketch !== '' ? K.findFeature(App.model, +v.sketch) : dxfDefaultSketch(); return '_' + String(s ? s.name : 'sketch').replace(/[^\w\-]+/g, '_'); }
    return v.export === 'faces' ? '_face' + (App.sel && App.sel.kind === 'face' ? App.sel.index : '') : v.export === 'sheet' ? '_flat' : '_views';
  }
  // (lane DG) DWG is written in the page by dwg-writer.js (global DWG, AutoCAD 2000 / AC1015): converter 'anvil', no
  // server needed, so the published copy saves DWG too. Only without that file does the probe ask the local server:
  // HEAD api/dxf2dwg answers 200 with X-Anvil-Converter: oda | libredwg when one is installed, 503 when not.
  function jsDwg() { return typeof DWG !== 'undefined' && DWG && typeof DWG.fromDXF === 'function'; }
  var dwgState = jsDwg() ? { probed: true, ok: true, converter: 'anvil', pending: null } : { probed: false, ok: false, converter: null, pending: null };
  function probeDwg() {
    if (jsDwg()) { dwgState.probed = dwgState.ok = true; dwgState.converter = 'anvil'; return Promise.resolve(dwgState); }
    if (dwgState.pending) return dwgState.pending;
    var p;
    try {
      p = fetch('api/dxf2dwg', { method: 'HEAD' }).then(function (r) {
        dwgState.ok = r.status === 200;
        dwgState.converter = dwgState.ok ? (r.headers.get('X-Anvil-Converter') || 'oda') : null;
      }, function () { dwgState.ok = false; dwgState.converter = null; });
    } catch (e) { p = Promise.resolve(); dwgState.ok = false; }
    dwgState.pending = p.then(function () { dwgState.probed = true; dwgState.pending = null; return dwgState; });
    return dwgState.pending;
  }
  // dxfToDwg(dxfText) -> Promise of the DWG bytes (ArrayBuffer). (lane DG) DWG.fromDXF writes them in the page; only if
  // it throws (an entity it does not write) does the R2000 DXF go to the local server's converter (POST api/dxf2dwg),
  // and with no server either the writer's message is the error.
  // (shop audit 2) An R12 DXF (AC1009, POLYLINE / VERTEX) is refused up front: the PM, the drawing's Save as DWG and
  // the headless runner all convert from R2000.
  var DXF_R12_NOTE = 'DWG is made from an R2000 DXF (AC1015); this DXF is R12. Export it as R2000 first.';
  function dxfToDwg(dxfText) {
    if (/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC1009\b/.test(String(dxfText).slice(0, 4000))) return Promise.reject(new Error(DXF_R12_NOTE));
    var jsError = null;
    if (jsDwg()) {
      try { var b = DWG.fromDXF(String(dxfText)); return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
      catch (e) { jsError = e && e.message || String(e); }
    }
    return fetch('api/dxf2dwg', { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: dxfText }).then(function (r) {
      if (r.status === 200) return r.arrayBuffer();
      return r.text().then(function (t) {
        var msg = jsError ? 'DWG: ' + jsError + '. Save as DXF (R2000) instead.' : 'DWG conversion failed (' + r.status + ')';
        if (jsError) throw new Error(msg);
        try { msg = JSON.parse(t).error || msg; } catch (e) { }
        throw new Error(msg);
      });
    }, function () { throw new Error(jsError ? 'DWG: ' + jsError + '. Save as DXF (R2000) instead.' : 'DWG needs dwg-writer.js (or the local server\'s converter).'); });
  }
  var DWG_NOTE = 'DWG needs the local server\'s converter (dwg-writer.js did not load)';
  var LIBREDWG_NOTE = 'LibreDWG\'s DWG writer is experimental; use DXF for CAM, or install the ODA File Converter for compliant DWG';
  // cmdDxfOutput({ format: 'dxf' | 'dwg', name }) opens the PropertyManager (File ▸ Save As DXF / DWG…, Save As with
  // type DXF / DWG carries the typed file name over)
  function cmdDxfOutput(opts) {
    opts = opts || {};
    var faceOk = !!(App.sel && App.sel.kind === 'face'), sheetOk = !!App.model.sheet, sketchOk = dxfSketches().length > 0;
    var sk0 = opts.sketch != null ? K.findFeature(App.model, +opts.sketch) : dxfDefaultSketch();
    var v = { export: opts.export === 'sketch' && sketchOk ? 'sketch' : opts.export === 'sheet' && sheetOk ? 'sheet' : dxfDefaultExport(), sketch: sk0 ? String(sk0.id) : '', construction: false, vFront: true, vTop: true, vRight: true, vIsometric: false, vCurrent: false,
      format: opts.format === 'dwg' ? 'dwg' : 'dxf', version: 'R12', style: 'polyline', bendLines: true, notes: true, etch: true, formingTools: true,
      hiddenEdges: false, boundaryBox: false, bendSplit: false, reliefLayer: false, name: '' };
    var typed = opts.name && opts.name !== dxfSafeName() ? opts.name : null, auto = null;
    function autoName() { return dxfSafeName() + dxfSuffix(v); }
    v.name = typed || (auto = autoName());
    if (v.format === 'dwg' && !(dwgState.probed && dwgState.ok)) v.format = 'dxf';
    function optsOf(x) {
      // DWG: the converter gets an R2000 DXF (LibreDWG reads R12 entities without their model space)
      return { export: x.export, views: DXF_VIEW_NAMES.filter(function (n) { return x['v' + n]; }), current: !!x.vCurrent, bendLines: !!x.bendLines, notes: !!x.notes, etch: !!x.etch, formingTools: !!x.formingTools,
        hiddenEdges: !!x.hiddenEdges, boundaryBox: !!x.boundaryBox, bendLayers: x.bendSplit ? 'split' : null, reliefLayer: !!x.reliefLayer,
        sketch: x.sketch !== '' && x.sketch != null ? +x.sketch : null, construction: !!x.construction,
        version: x.format === 'dwg' || x.version === 'R2000' ? 'R2000' : 'R12', style: x.style };
    }
    function cleanName(x) { return String(x.name || '').trim().replace(/\.(dxf|dwg)$/i, '').replace(/[^\w\-]+/g, '_') || autoName(); }
    function isViews(x) { return x.export === 'views'; }
    function isSheet(x) { return x.export === 'sheet'; }
    function isSketchX(x) { return x.export === 'sketch'; }
    // a face clicked while the PropertyManager is open becomes the face to export (SolidWorks' selection box)
    var command = { kind: 'dxfOutput', onPick: function (pk) {
      if (!pk || pk.kind !== 'face') return false;
      App.sel = { kind: 'face', index: pk.index }; UI.updateHighlights();
      faceOk = true;
      if (v.export === 'views') v.export = 'faces';
      if (auto != null && v.name === auto) v.name = auto = autoName();
      renderPM();
      return true;
    } };
    var spec = {
      title: 'DXF/DWG Output', icon: 'dxf', command: command, values: v,
      message: 'Choose what to export and the format; ✓ downloads the file.',
      groups: [
        { title: 'Export', fields: [
          { type: 'radio', key: 'export', rerender: true, options: [['sheet', 'Sheet metal'], ['faces', 'Faces/Loops/Edges'], ['views', 'Annotation views'], ['sketch', 'Sketch']],   // rfIY: SolidWorks 2024's order and names (Sketch is Anvil's)
            disabledOption: function (val) {
              if (val === 'sketch') return sketchOk ? null : 'Draw a sketch first';
              if (!hasSolid()) return 'No solid yet';
              return val === 'faces' && !faceOk ? 'Select a planar face first' : val === 'sheet' && !sheetOk ? 'Add a Base Flange first' : null;
            } },
          { type: 'select', label: 'Sketch', key: 'sketch', show: isSketchX, options: function () { return dxfSketches().map(function (s) { return [String(s.id), s.name]; }); } },
          { type: 'check', label: 'Construction geometry', key: 'construction', show: isSketchX },
          { type: 'html', show: isSketchX, html: '<div class="pm-note">Full size, in the sketch\'s own coordinates: lines, arcs and circles as drawn; dimensions are not written.</div>' },
          { type: 'check', label: 'Front', key: 'vFront', show: isViews }, { type: 'check', label: 'Top', key: 'vTop', show: isViews },
          { type: 'check', label: 'Right', key: 'vRight', show: isViews }, { type: 'check', label: 'Isometric', key: 'vIsometric', show: isViews },
          { type: 'check', label: 'Current view', key: 'vCurrent', show: isViews },
          { type: 'html', show: isViews, html: '<div class="pm-note">Full size (1:1), one layer per view; no border or title block.</div>' },
          // rfIY: SolidWorks' Entities to export, in its order: Geometry, Hidden edges, Bend lines, Sketches, (Library
          // features: Anvil has none), Forming tools, Boundary box (lane dxfout); Notes (bend notes, blank size) is
          // Anvil's. Lane dxfout: under Geometry the relief edges on their own layer, under Bend lines the up / down
          // layers (SolidWorks' layer mapping)
          { type: 'html', show: isSheet, html: '<div class="pm-note" style="margin:4px 0 2px"><b>Entities to export:</b></div>' },
          { type: 'check', label: 'Geometry', key: 'geometry', disabled: true, show: isSheet },
          { type: 'check', label: ' Corner reliefs on layer RELIEF', key: 'reliefLayer', show: isSheet },
          { type: 'check', label: 'Hidden edges', key: 'hiddenEdges', show: isSheet },
          { type: 'check', label: 'Bend lines', key: 'bendLines', show: isSheet, rerender: true },
          { type: 'check', label: ' Up / down on BEND_UP / BEND_DOWN', key: 'bendSplit', show: function (x) { return isSheet(x) && !!x.bendLines; } },
          { type: 'check', label: 'Sketches', key: 'etch', show: isSheet },
          { type: 'check', label: 'Forming tools', key: 'formingTools', show: isSheet },
          { type: 'check', label: 'Boundary box', key: 'boundaryBox', show: isSheet },
          { type: 'check', label: 'Notes (bend notes, blank size)', key: 'notes', show: isSheet }
        ] },
        { title: 'Output format', fields: [
          { type: 'radio', key: 'format', rerender: true, options: [['dxf', 'DXF'], ['dwg', 'DWG']],
            disabledOption: function (val) { return val === 'dwg' && !(dwgState.probed && dwgState.ok) ? DWG_NOTE : null; } },
          { type: 'html', show: function () { return dwgState.converter === 'libredwg'; }, html: '<div class="pm-note">' + LIBREDWG_NOTE + '</div>' },
          { type: 'select', label: 'Version', key: 'version', options: function (x) { return x.format === 'dwg' ? [['R2000', 'R2000']] : [['R12', 'R12 (AC1009)'], ['R2000', 'R2000 (AC1015)']]; } },
          { type: 'select', label: 'Loops as', key: 'style', show: function (x) { return !isViews(x) && !isSketchX(x); }, options: [['polyline', 'Polylines (one per loop)'], ['entities', 'Lines and arcs']] }
        ] },
        { title: 'File name', fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (x, key) {
        if ((key === 'export' || key === 'sketch') && auto != null && x.name === auto) { x.name = auto = autoName(); UI.renderPM(); }
        if (key === 'format') { x.version = x.format === 'dwg' ? 'R2000' : 'R12'; UI.renderPM(); }
        if (key === 'name') auto = null;
      },
      onOK: function (x) {
        var text;
        if (isViews(x) && !optsOf(x).views.length && !x.vCurrent) { UI.toast('Pick at least one view.'); return false; }
        try { text = dxfOutput(optsOf(x)); } catch (e) { UI.toast(e.message || String(e)); UI.setStatus('DXF/DWG Output: ' + (e.message || e)); return false; }
        var base = cleanName(x);
        v.geometry = true;
        if (x.format !== 'dwg') {
          UI.download(base + '.dxf', text, 'application/dxf');
          UI.setStatus('Saved ' + base + '.dxf (' + (text.length / 1024).toFixed(1) + ' KB).');
          return;
        }
        UI.setStatus('Converting ' + base + '.dwg…');
        var p = dxfToDwg(text).then(function (bytes) {
          UI.download(base + '.dwg', bytes, 'application/acad');
          UI.setStatus('Saved ' + base + '.dwg (' + (bytes.byteLength / 1024).toFixed(1) + ' KB).');
          if (pm.spec === spec) closePM();
        }, function (e) { UI.toast(e.message || String(e)); UI.setStatus('DWG: ' + (e.message || e)); });
        return { keepOpen: true, promise: p };
      }
    };
    v.geometry = true;
    openPM(spec);
    probeDwg().then(function () {
      if (pm.spec !== spec) return;
      if (opts.format === 'dwg' && dwgState.ok) { v.format = 'dwg'; v.version = 'R2000'; }
      renderPM();
    });
  }
  UI.cmdDxfOutput = cmdDxfOutput; UI.dxfOutput = dxfOutput; UI.dxfToDwg = dxfToDwg; UI.dropDxfLayers = dropDxfLayers;
  UI.dwgConverter = function () { return probeDwg().then(function (s) { return s.ok ? s.converter : null; }); };   // tests: the probe's result

  // ------------------------------------------------------------------ section view
  function cmdSection() {
    if (App.view.section) { App.view.section = null; UI.applyDisplayStyle(); UI.refreshHud(); return; }
    // p9-pm: the plane starts through the middle of the part (its bounding-box centre along the plane's normal), so the
    // section cuts it in half wherever it sits; it follows a change of reference plane until an offset is typed
    var bb = UI.modelBounds(), mid = [0, 1, 2].map(function (k) { return (bb.min[k] + bb.max[k]) / 2; });
    function centreOffset(ref) { var n = K.makePlane(ref, 0).n; return +(mid[0] * n[0] + mid[1] * n[1] + mid[2] * n[2]).toPrecision(10); }
    var v = { plane: 'Right', offset: centreOffset('Right'), flip: false }, offsetTyped = false;
    function apply(x, key) {
      if (key === 'offset') offsetTyped = true;
      else if (key === 'plane' && !offsetTyped) { x.offset = centreOffset(x.plane); var oi = pm.root.querySelector('input.pm-num[data-key="offset"]'); if (oi) oi.value = x.offset; }
      var pl = K.makePlane(x.plane, +x.offset || 0);
      var n = new THREE.Vector3(pl.n[0], pl.n[1], pl.n[2]);
      if (!x.flip) n.negate();
      App.view.section = { plane: new THREE.Plane(n, -n.dot(new THREE.Vector3(pl.origin[0], pl.origin[1], pl.origin[2]))), spec: x };
      UI.applyDisplayStyle(); UI.refreshHud();
    }
    openPM({
      title: 'Section View', icon: 'section', values: v,
      groups: [{ title: 'Section 1', fields: [{ type: 'select', label: 'Reference plane', key: 'plane', options: ['Front', 'Top', 'Right'] }, { type: 'number', label: 'Offset distance', key: 'offset', unit: 'u' }, { type: 'check', label: 'Flip side', key: 'flip' }] }],
      onChange: apply,
      onCancel: function () { App.view.section = null; UI.applyDisplayStyle(); UI.refreshHud(); },
      onOK: function (x) { apply(x); }
    });
  }

  // ------------------------------------------------------------------ measure
  // lane DF: a reference Point, Axis or Coordinate System (its origin), a model vertex or a straight edge, besides
  // faces. One item: its position / direction; two (Ctrl+click): the distance point–point (with dX, dY, dZ),
  // point–axis (normal distance), axis–axis (angle; distance when parallel, minimum distance when skew), point–face
  // and axis–face. Faces and edges alone read as before (measureFaceEdgeHtml).
  var MV = K.vec;
  function cmdMeasure() {
    openPM({
      title: 'Measure', icon: 'measure',
      message: 'Select a face, edge, vertex or reference point / axis. <b>Ctrl+click</b> a second item for the distance or angle between them.',
      groups: [{ title: 'Results', fields: [{ type: 'html', html: measureHtml }] }],
      onChange: function () { }
    });
  }
  function measVec(p, d) { return p.map(function (x) { return UI.fmtNum(Math.abs(x) < 5e-13 ? 0 : x, d == null ? 3 : d); }).join(', '); }
  function measKv(rows) { return '<div class="kv" style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px">' + rows.map(function (r) { return '<span class="static">' + r[0] + '</span><span>' + r[1] + '</span>'; }).join('') + '</div>'; }
  function measFeatName(id) { var f = (App.model.features || []).filter(function (x) { return x.id === id; })[0]; return f ? f.name : 'Feature ' + id; }
  // a selection item as { t: 'pt' | 'line' | 'plane', p, d?, n?, name, ref? } or null
  function measGeom(s) {
    if (!s) return null;
    var planes = App.build && App.build.planes;
    if ((s.kind === 'feature' || s.kind === 'refgeo') && planes && planes[s.id] && planes[s.id].refgeo) {
      var r = planes[s.id], nm = measFeatName(s.id);
      if (r.refgeo === 'point') return { t: 'pt', p: r.p, name: nm, ref: true };
      if (r.refgeo === 'csys') return { t: 'pt', p: r.origin, name: nm + ' origin', ref: true };
      if (r.refgeo === 'axis') return { t: 'line', p: r.o, d: MV.norm(r.d), name: nm, ref: true };
    }
    if (s.kind === 'vertex' && s.point) return { t: 'pt', p: s.point, name: 'Vertex', ref: true };
    if (s.kind === 'edge' && s.edge && s.edge.a && s.edge.b && MV.len(MV.sub(s.edge.b, s.edge.a)) > 1e-12) return { t: 'line', p: s.edge.a, d: MV.norm(MV.sub(s.edge.b, s.edge.a)), name: 'Edge' };
    if (s.kind === 'face' && App.mesh && App.mesh.faces[s.index]) {
      var fc = App.mesh.faces[s.index];
      if (!(fc.polys && fc.polys[0] && fc.polys[0].surf)) return { t: 'plane', p: fc.centroid, n: MV.norm(fc.normal), name: 'Face' };
    }
    return null;
  }
  function measLineDist(p, L) { var v = MV.sub(p, L.p); return MV.len(MV.sub(v, MV.scale(L.d, MV.dot(v, L.d)))); }
  function measDeg(x) { return UI.fmtNum(Math.acos(Math.max(-1, Math.min(1, x))) * 180 / Math.PI, 2) + '°'; }
  // the rows for a selection that holds reference geometry or a vertex, else null (the face / edge rows)
  function measureRefRows() {
    var list = [App.sel, App.sel2].filter(Boolean).map(measGeom);
    if (!list.length || list.some(function (g) { return !g; }) || !list.some(function (g) { return g.ref; })) return null;
    var u = UI.unitLabel(), rows = [], A = list[0], B = list[1];
    list.forEach(function (g) {
      if (g.t === 'pt') rows.push([g.name, measVec(g.p) + ' ' + u]);
      else if (g.t === 'line') rows.push([g.name, 'through ' + measVec(g.p) + ', direction ' + measVec(g.d, 4)]);
      else rows.push([g.name, 'normal ' + measVec(g.n, 4)]);
    });
    if (!B) return rows;
    var ord = { pt: 0, line: 1, plane: 2 };
    if (ord[B.t] < ord[A.t]) { var x = A; A = B; B = x; }
    var dv = function (v) { return UI.fmtNum(v, 3) + ' ' + u; };
    if (A.t === 'pt' && B.t === 'pt') {
      var D = MV.sub(B.p, A.p);
      rows.push(['Distance', dv(MV.len(D))], ['dX', dv(D[0])], ['dY', dv(D[1])], ['dZ', dv(D[2])]);
    } else if (A.t === 'pt' && B.t === 'line') rows.push(['Normal distance', dv(measLineDist(A.p, B))]);
    else if (A.t === 'pt' && B.t === 'plane') rows.push(['Normal distance', dv(Math.abs(MV.dot(MV.sub(A.p, B.p), B.n)))]);
    else if (A.t === 'line' && B.t === 'line') {
      var X = MV.cross(A.d, B.d);
      rows.push(['Angle', measDeg(Math.abs(MV.dot(A.d, B.d)))]);
      if (MV.len(X) < 1e-9) rows.push(['Distance', dv(measLineDist(B.p, A))]);
      else rows.push(['Minimum distance', dv(Math.abs(MV.dot(MV.sub(B.p, A.p), X)) / MV.len(X))]);
    } else if (A.t === 'line' && B.t === 'plane') {
      var s = Math.abs(MV.dot(A.d, B.n));
      rows.push(['Angle to face', UI.fmtNum(Math.asin(Math.min(1, s)) * 180 / Math.PI, 2) + '°']);
      if (s < 1e-9) rows.push(['Distance', dv(Math.abs(MV.dot(MV.sub(A.p, B.p), B.n)))]);
    }
    return rows;
  }
  function measureFaceEdgeHtml() {
    var u = UI.unitLabel();
    if (App.sel && App.sel.kind === 'edge') {
      var e = App.sel.edge, erows = [['Edge', 'length ' + UI.fmtNum(e.len, 3) + ' ' + u], ['Start', e.a.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')], ['End', e.b.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')], ['Direction', e.dir.map(function (x) { return UI.fmtNum(x, 3); }).join(', ')]];
      if (e.normals.length === 2) erows.push(['Between faces', UI.fmtNum(Math.acos(Math.max(-1, Math.min(1, MV.dot(e.normals[0], e.normals[1])))) * 180 / Math.PI, 2) + '° (' + (e.convex ? 'convex' : 'concave') + ')']);
      return measKv(erows);
    }
    if (!App.sel || App.sel.kind !== 'face' || !App.mesh) return '<span class="static">Nothing selected.</span>';
    var a = App.mesh.faces[App.sel.index], rows = [];
    rows.push(['Face', String(App.sel.index)], ['Area', UI.fmtNum(a.area, 2) + ' ' + u + '²'], ['Normal', a.normal.map(function (x) { return UI.fmtNum(x, 3); }).join(', ')], ['Centroid', a.centroid.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')]);
    if (App.sel2 && App.sel2.kind === 'face') {
      var b = App.mesh.faces[App.sel2.index], dotn = Math.abs(MV.dot(a.normal, b.normal)), ang = Math.acos(Math.min(1, dotn)) * 180 / Math.PI;
      rows.push(['Second face', String(App.sel2.index)], ['Angle between', UI.fmtNum(ang, 2) + '°']);
      if (dotn > 0.9999) rows.push(['Parallel distance', UI.fmtNum(Math.abs(MV.dot(MV.sub(b.centroid, a.centroid), a.normal)), 3) + ' ' + u]);
      rows.push(['Centroid distance', UI.fmtNum(MV.len(MV.sub(b.centroid, a.centroid)), 3) + ' ' + u]);
    }
    return measKv(rows);
  }
  function measureHtml() { var r = measureRefRows(); return r ? '<div id="measure-ref">' + measKv(r) + '</div>' : measureFaceEdgeHtml(); }
  UI.measureRows = measureRefRows;   // test hook
  UI.onSelectionChanged = function () { if (!pm.spec) return; if (pm.spec.title === 'Measure') renderPM(); if (pm.spec.onSelection) pm.spec.onSelection(); };
  // the open PropertyManager collects graphics-area selections (its onSelection hook): a plain click in a sketch
  // selects into it instead of opening the clicked entity's PropertyManager (ui-select.js sketchSelectClick)
  UI.pmCollectsSelection = function () { return !!(pm.spec && pm.spec.onSelection); };
  // a PM's own use of a clicked entity before the selection box gets it (Mirror Entities ▸ Mirror about); true: taken
  UI.pmEntityPick = function (hit) { return !!(pm.spec && pm.spec.onEntityPick && pm.spec.onEntityPick(hit)); };

  // ------------------------------------------------------------------ sketch entity editing
  var ENTITY_FIELDS = {
    line: [['x1', 'Start X'], ['y1', 'Start Y'], ['x2', 'End X'], ['y2', 'End Y']],
    rect: [['x', 'Corner X'], ['y', 'Corner Y'], ['w', 'Width'], ['h', 'Height']],
    crect: [['cx', 'Center X'], ['cy', 'Center Y'], ['w', 'Width'], ['h', 'Height']],
    circle: [['cx', 'Center X'], ['cy', 'Center Y'], ['r', 'Radius']],
    poly: [['cx', 'Center X'], ['cy', 'Center Y'], ['r', 'Radius'], ['n', 'Sides'], ['rot', 'Rotation °']],
    slot: [['x1', 'Center 1 X'], ['y1', 'Center 1 Y'], ['x2', 'Center 2 X'], ['y2', 'Center 2 Y'], ['w', 'Width']],
    arc: [['cx', 'Center X'], ['cy', 'Center Y'], ['r', 'Radius'], ['a0', 'Start °'], ['a1', 'End °']],
    point: [['x', 'X'], ['y', 'Y']]
  };
  var ENTITY_NAMES = { line: 'Line', rect: 'Corner Rectangle', crect: 'Center Rectangle', circle: 'Circle', poly: 'Polygon', slot: 'Straight Slot', arc: 'Arc', point: 'Point', polyline: 'Polyline' };
  function openEntityPM(index) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    var e = f.entities[index];
    if (!e) return;
    // a type's own SolidWorks properties PM (Line Properties, Circle …), registered by the ui-sketch-*.js files
    if (UI.sketchEntityPMs[e.t]) return UI.sketchEntityPMs[e.t](index, e, f);
    var fields = (ENTITY_FIELDS[e.t] || []).map(function (p) { return { type: 'number', label: p[1], key: p[0], unit: /X|Y|Width|Height|Radius/.test(p[1]) ? 'u' : undefined, step: p[0] === 'n' ? 1 : undefined }; });
    if (e.t === 'polyline') fields.push({ type: 'static', label: 'Points', value: e.pts.length + (e.closed ? ' (closed)' : ' (open)') });
    fields.push({ type: 'check', label: 'For construction', key: 'construction' });
    openPM({
      title: ENTITY_NAMES[e.t] || 'Entity', icon: e.t === 'crect' ? 'crect' : (e.t === 'poly' ? 'polygon' : e.t), values: JSON.parse(JSON.stringify(e)),
      groups: [{ title: 'Parameters', fields: fields }, { title: 'Actions', fields: [{ type: 'buttons', buttons: [{ label: 'Delete entity', onclick: function () { deleteEntity(index); closePM(); } }] }] }],
      onChange: function (v) {
        if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
        Object.keys(v).forEach(function (k) { e[k] = v[k]; });
        // typed values move the entity; the rest of the sketch follows its relations (the edited entity moves least)
        if (window.SketchSolver && (f.rels || f.dims)) { var mob = {}; mob[index] = 1e-4; SketchSolver.solve(f, { mob: mob }); }
        UI.updateSketches();
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  function deleteEntity(index) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
    f.entities.splice(index, 1);
    // relations and dimensions follow their entities: drop the deleted one's, shift the rest
    if (window.SketchSolver) SketchSolver.removeEntity(f, index);
    if (f.dims) f.dims = f.dims.filter(function (d) { return d.e !== index; }).map(function (d) { if (d.e > index) d.e--; return d; });
    App.sel = null;
    UI.updateSketches();
  }
  // UI.sketchEntityPMs[type] = function (index, entity, sketchFeature) { UI.openPM(…) }: the PM a selected entity opens
  UI.sketchEntityPMs = UI.sketchEntityPMs || {};
  UI.deleteSketchEntity = deleteEntity;
  function openToolPM(tool) {
    App.toolParams = App.toolParams || { sides: 6 };
    if (tool === 'polygon') openPM({
      title: 'Polygon', icon: 'polygon', values: App.toolParams,
      groups: [{ title: 'Parameters', fields: [{ type: 'number', label: 'Number of sides', key: 'sides', step: 1, min: 3 }] }],
      onChange: function (v) { App.toolParams = v; }, onOK: function () { }, onClose: function () { }
    });
  }

  // ------------------------------------------------------------------ assembly documents
  // App.model is an assembly ({ type: 'assembly', components, mates }, see assembly.js) when UI.isAssembly(). The
  // Assembly global holds the model operations and the mate solver; this section is the PropertyManagers and the
  // component / mate operations the FeatureManager, the ribbon and window.anvil call. Every change is one undo step
  // followed by a rebuild (assembly rebuilds are synchronous).
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function asmReady() {
    if (typeof Assembly === 'undefined') { UI.toast('Assemblies need assembly.js, which did not load.'); return false; }
    if (!isAsm()) { UI.toast('Open an assembly first (File ▸ New ▸ Assembly).'); return false; }
    return true;
  }
  // Part-only commands refuse politely in an assembly (ribbon, menus, shortcuts and command search all go through UI.cmd*).
  function refusePart(label) {
    var msg = label + ' is a part command: it is not available in an assembly document.';
    UI.toast(msg); UI.setStatus(msg);
  }
  function partOnly(fn, label) {
    return function () { if (isAsm()) { refusePart(label); return; } return fn.apply(null, arguments); };
  }
  function asmFail(msg) { return Promise.reject(new Error(msg)); }
  function findComp(idOrName) { return typeof Assembly !== 'undefined' && isAsm() ? Assembly.findComponent(App.model, idOrName) : null; }
  function findMateObj(idOrName) { return typeof Assembly !== 'undefined' && isAsm() ? Assembly.findMate(App.model, idOrName) : null; }
  function compIndex(id) {
    if (UI.componentIndex) return UI.componentIndex(id);
    var cs = App.model.components || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return i;
    return -1;
  }
  // the build's per-component status { id, name, index, fixed, dof, underDefined, error } (or null before a build)
  function compStatus(id) {
    var list = App.build && App.build.assembly ? App.build.components || [] : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // FeatureManager text: "(f) Plate<1>" when fixed, "(-) Pin<1>" when it can still move, plain when fully mated
  function compLabel(c) {
    var s = compStatus(c.id);
    if (c.fixed) return '(f) ' + c.name;
    if (s && s.overDefined) return '(+) ' + c.name;   // over defined: a mate on it cannot be satisfied
    if (s && s.underDefined) return '(-) ' + c.name;
    return c.name;
  }
  // The component under the current selection: a component body, or the component owning a selected face.
  function selectedComponent() {
    if (!isAsm() || !App.sel) return null;
    var i = -1;
    if (App.sel.kind === 'body') i = App.sel.index;
    else if (App.sel.kind === 'face' && App.mesh && App.mesh.faces[App.sel.index]) i = App.mesh.faces[App.sel.index].body || 0;
    return (App.model.components || [])[i] || null;
  }
  function refName(ref) {
    if (!ref) return '';
    var c = ref.component != null ? findComp(ref.component) : null;
    return c ? c.name : App.model.name;
  }
  // "Coincident1 (Plate<1>, Pin<1>)"
  function mateLabel(m) { return m.name + ' (' + refName(m.a) + ', ' + refName(m.b) + ')'; }
  function mateStatus(m) {
    var b = App.build && App.build.assembly ? App.build : null;
    if (!b) return { ok: true, error: null };
    var s = (b.mates || {})[m.id] || {};
    var err = s.error || (b.errors || {})[m.id] || null;
    return { ok: !err && s.ok !== false, error: err, suppressed: !!s.suppressed, warning: s.warning || null };
  }
  function asmCommit(mutate, message) {
    UI.pushUndo();
    var r = mutate(App.model);
    return UI.afterRebuild(UI.rebuild(), function () {
      UI.refreshTree(); UI.refreshStatus();
      if (message) UI.setStatus(typeof message === 'function' ? message(r) : message);
      return r;
    });
  }
  // insert(source, { position, rotation, fixed, name }) -> Promise of the new component
  function asmInsert(source, opts) {
    if (!asmReady()) return asmFail('Not an assembly document');
    try { Assembly.partModel(typeof source === 'string' ? { example: source } : source); } catch (e) { return asmFail(e.message || String(e)); }
    return asmCommit(function (m) { return Assembly.insert(m, source, opts || {}); }, function (c) {
      var err = compStatus(c.id) && compStatus(c.id).error;
      return err ? c.name + ' inserted with an error: ' + err : 'Inserted ' + c.name + (c.fixed ? ' (fixed)' : '') + '. Add mates to position it.';
    }).then(function (c) { if (UI.selectComponent) UI.selectComponent(c.id); return c; });
  }
  // addMate(type, a, b, { alignment, name, suppressed }) -> Promise of the new mate
  function asmAddMate(type, a, b, opts) {
    if (!asmReady()) return asmFail('Not an assembly document');
    return asmCommit(function (m) { return Assembly.addMate(m, type, a, b, opts || {}); }, function (mt) {
      var st = mateStatus(mt);
      return st.error ? mt.name + ': ' + st.error : mt.name + ' added.';
    });
  }
  function asmSetFixed(idOrName, fixed) {
    var c = findComp(idOrName);
    if (!c) return asmFail('No component "' + idOrName + '"');
    fixed = fixed !== false;
    if (!!c.fixed === fixed) return Promise.resolve(c);
    var id = c.id;
    return asmCommit(function (m) { Assembly.setFixed(m, id, fixed); return Assembly.findComponent(m, id); }, c.name + (fixed ? ' fixed.' : ' floats: mates position it.'));
  }
  function asmRemoveComponent(idOrName) {
    var c = findComp(idOrName);
    if (!c) return asmFail('No component "' + idOrName + '"');
    var id = c.id, idx = compIndex(id), nm = c.name;
    var before = (App.model.mates || []).length;
    // hidden flags are by body index: shift the ones after the removed component
    var hid = {};
    Object.keys(App.hiddenBodies || {}).forEach(function (k) { k = +k; if (k < idx) hid[k] = true; else if (k > idx) hid[k - 1] = true; });
    App.hiddenBodies = hid;
    App.sel = null; App.sel2 = null;
    return asmCommit(function (m) { Assembly.removeComponent(m, id); return (m.mates || []).length; }, function (after) {
      var gone = before - after;
      return 'Deleted ' + nm + (gone ? ' and ' + gone + ' mate' + (gone > 1 ? 's' : '') + ' that referenced it' : '') + '.';
    });
  }
  function asmRemoveMate(idOrName) {
    var mt = findMateObj(idOrName);
    if (!mt) return asmFail('No mate "' + idOrName + '"');
    var id = mt.id, nm = mt.name;
    return asmCommit(function (m) { Assembly.removeMate(m, id); }, 'Deleted ' + nm + '.');
  }
  function asmSuppressMate(idOrName, on) {
    var mt = findMateObj(idOrName);
    if (!mt) return asmFail('No mate "' + idOrName + '"');
    var id = mt.id;
    on = on !== false;
    return asmCommit(function (m) { var x = Assembly.findMate(m, id); if (on) x.suppressed = true; else delete x.suppressed; return x; }, mt.name + (on ? ' suppressed.' : ' unsuppressed.'));
  }
  // Hide / Show is display state (like SolidWorks' Hide Components), kept per body index by ui-core.
  function asmSetHidden(idOrName, hidden) {
    var c = findComp(idOrName), i = c ? compIndex(c.id) : -1;
    if (i < 0) return false;
    if (UI.setBodyHidden) UI.setBodyHidden(i, hidden !== false);
    UI.setStatus(c.name + (hidden !== false ? ' hidden.' : ' shown.'));
    return true;
  }
  function asmIsHidden(id) { var i = compIndex(id); return i >= 0 && !!(UI.isBodyHidden ? UI.isBodyHidden(i) : (App.hiddenBodies || {})[i]); }
  function confirmRemoveComponent(c) {
    var n = (App.model.mates || []).filter(function (m) { return (m.a && m.a.component === c.id) || (m.b && m.b.component === c.id); }).length;
    UI.confirmDialog('Confirm Delete', 'Delete <b>' + c.name + '</b>?' + (n ? '<br>This also deletes ' + n + ' mate' + (n > 1 ? 's' : '') + ' that reference it.' : ''), function () {
      asmRemoveComponent(c.id).catch(function (e) { UI.toast(e.message); });
    }, 'Delete');
  }
  function confirmRemoveMate(mt) {
    UI.confirmDialog('Confirm Delete', 'Delete <b>' + mt.name + '</b>?', function () { asmRemoveMate(mt.id).catch(function (e) { UI.toast(e.message); }); }, 'Delete');
  }
  // Ribbon Fix / Float / Hide/Show Components act on the selected component.
  function cmdFixComponent(fixed) {
    if (!asmReady()) return;
    var c = selectedComponent();
    if (!c) { UI.toast('Select a component first (click it in the graphics area or the FeatureManager).'); return; }
    asmSetFixed(c.id, fixed).catch(function (e) { UI.toast(e.message); });
  }
  function cmdHideShowComponents() {
    if (!asmReady()) return;
    var c = selectedComponent();
    if (c) { asmSetHidden(c.id, !asmIsHidden(c.id)); return; }
    var any = (App.model.components || []).filter(function (x) { return asmIsHidden(x.id); });
    if (!any.length) { UI.toast('Select a component to hide.'); return; }
    any.forEach(function (x) { asmSetHidden(x.id, false); });
    UI.setStatus('Shown ' + any.length + ' hidden component' + (any.length > 1 ? 's' : '') + '.');
  }

  // ---- Insert Components PropertyManager
  // Part list: the Design Library parts (AnvilExamples without kind 'assembly'), the last open part, and parts opened
  // with Browse… (a part JSON file). PM keys: part (the list key), x, y, z (where the part origin goes).
  var browsedParts = [];
  function insertSources() {
    var out = [];
    if (App.lastPart && Array.isArray(App.lastPart.features)) out.push({ key: 'last', label: (App.lastPart.name || 'Part1') + ' (last part)', source: { model: App.lastPart } });
    browsedParts.forEach(function (b) { out.push(b); });
    (window.AnvilExamples || []).forEach(function (ex) {
      if (ex && ex.name && ex.code && ex.kind !== 'assembly') out.push({ key: 'ex:' + ex.name, label: ex.name, source: { example: ex.name } });
    });
    // sub-assemblies (Design Library assemblies) and live links to saved documents (ui-assembly.js)
    if (UI.insertSourcesExtra) out = out.concat(UI.insertSourcesExtra());
    return out;
  }
  function browsePart(done) {
    var inp = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        var m = null;
        try { m = JSON.parse(String(rd.result)); } catch (e) { UI.toast('Not a model JSON file: ' + e.message); return; }
        if (!m || (m.type === 'assembly' ? !Array.isArray(m.components) : !Array.isArray(m.features))) { UI.toast('Pick a part or assembly JSON file (File ▸ Save As).'); return; }
        var b = { key: 'file:' + (browsedParts.length + 1), label: (m.name || file.name) + ' (' + file.name + ')', source: { model: m } };
        browsedParts.push(b);
        done(b);
      };
      rd.readAsText(file);
    });
    document.body.appendChild(inp);
    inp.click();
  }
  function cmdInsertComponent(preset) {
    if (!asmReady()) return;
    var list = insertSources();
    var first = !(App.model.components || []).length;
    var v = { part: list.length ? list[0].key : '', x: 0, y: 0, z: 0 };
    if (preset && preset.part != null) v.part = preset.part;
    function options() { return insertSources().map(function (s) { return [s.key, s.label]; }).concat([['browse', 'Browse…']]); }
    openPM({
      title: 'Insert Component', icon: 'insertComponent', values: v,
      message: first ? 'Pick a part to insert. The first component is <b>fixed</b> at the assembly origin.' : 'Pick a part and where its origin goes, then ✓. It floats until you add mates.',
      groups: [
        { title: 'Part/Assembly to Insert', fields: [{ type: 'select', label: 'Part', key: 'part', options: options, rerender: true }] },
        { title: 'Position', fields: [
          { type: 'number', label: 'X', key: 'x', unit: 'u' }, { type: 'number', label: 'Y', key: 'y', unit: 'u' }, { type: 'number', label: 'Z', key: 'z', unit: 'u' }
        ] }
      ],
      onChange: function (x, key) {
        if ((key === 'x' || key === 'y' || key === 'z') && UI.asmInsertPreview && !moving) UI.asmInsertPreview.at([+x.x || 0, +x.y || 0, +x.z || 0]);
        if (key === 'part' && x.part !== 'browse' && UI.asmInsertPreview) UI.asmInsertPreview.source(currentSource(x));
        if (key !== 'part' || x.part !== 'browse') return;
        x.part = list.length ? list[0].key : '';
        renderPM();
        browsePart(function (b) { if (pm.spec && pm.values === x) { x.part = b.key; renderPM(); if (UI.asmInsertPreview) UI.asmInsertPreview.source(currentSource(x)); } });
      },
      onClose: function () { if (UI.asmInsertPreview) UI.asmInsertPreview.stop(); },
      onOK: function (x) {
        var src = insertSources().filter(function (s) { return s.key === x.part; })[0];
        if (!src) { UI.toast('Pick a part to insert first.'); return false; }
        var p = asmInsert(src.source, { position: [+x.x || 0, +x.y || 0, +x.z || 0] });
        p.catch(function (e) { UI.toast(e.message || String(e)); });
        return p;
      }
    });
    // r5/asm5: the part follows the pointer in the graphics area and a click drops it there (the first one stays at the
    // origin, where it is fixed); the X / Y / Z fields follow
    function currentSource(x) { var s = insertSources().filter(function (q) { return q.key === x.part; })[0]; return s ? s.source : null; }
    var moving = false, mySpec = pm.spec;
    if (UI.asmInsertPreview) UI.asmInsertPreview.start({
      source: currentSource(v), fixedAt: first ? [0, 0, 0] : null,
      onMove: function (p) {
        if (pm.spec !== mySpec) return;
        moving = true;
        try { ['x', 'y', 'z'].forEach(function (k, i) { pmSetValue(k, +p[i].toFixed(3)); }); } finally { moving = false; }
      },
      onPlace: function (p) {
        if (pm.spec !== mySpec) return;
        if (!first) { v.x = +p[0].toFixed(3); v.y = +p[1].toFixed(3); v.z = +p[2].toFixed(3); }
        pmOK();
      }
    });
  }

  // ---- Mate PropertyManager
  // Mate Selections holds two refs (a viewport face pick -> Assembly.refFromPick, an origin plane pick -> { plane });
  // Standard Mates picks the type (Concentric when both are cylinders/axes, else Coincident, until the user chooses);
  // Mate alignment picks Aligned / Anti-Aligned (Assembly's default until chosen). The graphics area previews the
  // solved assembly with the mate applied; Cancel restores the model, ✓ adds (or updates) it as one undo step.
  // Distance holds two planes `distance` apart, Angle turns two directions `angle` degrees apart, Coincident takes an
  // optional `offset`; Flip dimension (`flip`) puts the value on the other side (see assembly.js setMateValues).
  // Standard Mates / Advanced Mates / Mechanical Mates, as grouped in the SolidWorks Mate PropertyManager
  // (Assembly.MATE_GROUPS). Width takes four selections (two width faces, two tab faces or one cylindrical tab).
  var MATE_LABELS = { coincident: 'Coincident', concentric: 'Concentric', distance: 'Distance', angle: 'Angle', parallel: 'Parallel', perpendicular: 'Perpendicular',
    tangent: 'Tangent', width: 'Width', gear: 'Gear', limitdistance: 'Limit Distance', limitangle: 'Limit Angle' };
  function mateGroup(g) { return ((typeof Assembly !== 'undefined' && Assembly.MATE_GROUPS && Assembly.MATE_GROUPS[g]) || (g === 'standard' ? ['coincident', 'concentric', 'distance', 'angle'] : [])).map(function (t) { return [t, MATE_LABELS[t]]; }); }
  var MATE_TYPES = mateGroup('standard');
  function mateTypeLabel(t) { return MATE_LABELS[t] || 'Coincident'; }
  function mateBaseName(t) { return (typeof Assembly !== 'undefined' && Assembly.MATE_NAMES && Assembly.MATE_NAMES[t]) || mateTypeLabel(t); }
  function refKind(ref) { return !ref ? null : (ref.cylinder || ref.axis) ? 'axis' : (ref.face || ref.plane) ? 'plane' : null; }
  function refText(ref) {
    if (!ref) return '';
    var who = refName(ref);
    if (ref.path && ref.path.length && UI.innerRefName) who = UI.innerRefName(ref) || who;   // Face@Arm<1>@Hinge<2>
    if (ref.face) return 'Face@' + who;
    if (ref.cylinder) return 'Cylindrical Face@' + who;
    if (ref.plane) return ref.plane + ' Plane@' + who;
    if (ref.axis) return 'Axis ' + String(ref.axis).toUpperCase() + '@' + who;
    return who;
  }
  // two axes: Concentric; a cylindrical face and a flat face (or plane): Tangent, as SolidWorks proposes; else Coincident
  function defaultMateType(a, b) {
    var ka = refKind(a), kb = refKind(b);
    if (ka === 'axis' && kb === 'axis') return 'concentric';
    if (ka && kb && ka !== kb && ((a.cylinder && kb === 'plane') || (b.cylinder && ka === 'plane'))) return 'tangent';
    return 'coincident';
  }
  function defaultAlignment(type, a, b) {
    if (typeof Assembly !== 'undefined' && Assembly.defaultAlignment) return Assembly.defaultAlignment({ type: type, a: a, b: b });
    return (type === 'coincident' || type === 'distance') && a && b && a.face && b.face ? 'anti-aligned' : 'aligned';
  }
  function mateKindError(type, a, b, a2, b2) {
    var ka = refKind(a), kb = refKind(b);
    if (type === 'coincident' && (ka !== 'plane' || kb !== 'plane')) return 'Coincident needs two planar faces or planes';
    if ((type === 'distance' || type === 'limitdistance') && !(ka && ka === kb)) return mateTypeLabel(type) + ' needs two planar faces or planes, or two cylindrical faces or axes';
    if ((type === 'angle' || type === 'limitangle' || type === 'parallel' || type === 'perpendicular') && (!ka || !kb)) return mateTypeLabel(type) + ' needs two faces, planes or axes';
    if (type === 'concentric' && (ka !== 'axis' || kb !== 'axis')) return 'Concentric needs two cylindrical faces or axes';
    if (type === 'tangent' && (!(a.cylinder || b.cylinder) || !ka || !kb)) return 'Tangent needs a cylindrical face and a planar or cylindrical face';
    if (type === 'gear' && (ka !== 'axis' || kb !== 'axis' || a.component == null || b.component == null || a.component === b.component)) return 'Gear needs a cylindrical face or axis on each of two components';
    if (type === 'width' && (ka !== 'plane' || refKind(a2) !== 'plane' || !kb || (kb === 'plane' && refKind(b2) !== 'plane'))) return 'Width needs two width faces and two tab faces (or one cylindrical tab)';
    return null;
  }
  function nextMateName(m, type, except) {
    var base = mateBaseName(type), n = 0;
    (m.mates || []).forEach(function (x) { var r = new RegExp('^' + base + '(\\d+)$').exec(x.name || ''); if (r && x.id !== except) n = Math.max(n, +r[1]); });
    return base + (n + 1);
  }
  var mateSession = null;   // the open Mate PM: { addRef(ref), values }
  function cmdMate(existing) {
    if (!asmReady()) return;
    if (existing && typeof existing !== 'object') existing = findMateObj(existing);
    var snapshot = JSON.stringify(App.model), previewed = false, baseModel = App.model, mySpec = null;
    // r3/assembly3: the previewed component glides to its mated place (UI.asmPose.glide) instead of jumping
    function glideFrom() { return UI.asmPose ? UI.asmPose.capture() : null; }
    function glide(from) { if (from && UI.asmPose) UI.asmPose.glide(from); }
    var v = existing ? { a: JSON.parse(JSON.stringify(existing.a)), b: JSON.parse(JSON.stringify(existing.b)), type: existing.type, alignment: existing.alignment || defaultAlignment(existing.type, existing.a, existing.b) }
      : { a: null, b: null, type: 'coincident', alignment: 'aligned' };
    v.a2 = existing && existing.a2 ? JSON.parse(JSON.stringify(existing.a2)) : null;
    v.b2 = existing && existing.b2 ? JSON.parse(JSON.stringify(existing.b2)) : null;
    v.distance = existing && existing.distance != null ? existing.distance : 10;
    v.angle = existing && existing.angle != null ? existing.angle : 90;
    v.offset = existing && existing.offset != null ? existing.offset : 0;
    v.min = existing && existing.min != null ? existing.min : 0;
    v.max = existing && existing.max != null ? existing.max : 10;
    v.ratioA = existing && existing.ratio ? existing.ratio[0] : 1;
    v.ratioB = existing && existing.ratio ? existing.ratio[1] : 1;
    v.flip = !!(existing && existing.flip);
    function syncGroups(x) {   // the Advanced / Mechanical selects show the chosen type, '' otherwise
      x.advType = mateGroup('advanced').some(function (o) { return o[0] === x.type; }) ? x.type : '';
      x.mechType = mateGroup('mechanical').some(function (o) { return o[0] === x.type; }) ? x.type : '';
    }
    syncGroups(v);
    // the selections a mate type takes, in pick order; the mate can be previewed once `ready`
    function slots(x) { return x.type === 'width' ? ['a', 'a2', 'b', 'b2'] : ['a', 'b']; }
    function ready(x) { return x.type === 'width' ? !!(x.a && x.a2 && x.b && (x.b2 || refKind(x.b) === 'axis')) : !!(x.a && x.b); }
    function clearPicks(x) { x.a = null; x.b = null; x.a2 = null; x.b2 = null; picked = []; pickedBy = {}; if (App.command) App.command.faceList = []; if (UI.asmClosePopup) UI.asmClosePopup('mate'); }
    var typeSet = !!existing, alignSet = !!(existing && existing.alignment), autoAlign = false, valueSet = !!existing, picked = [], pickedBy = {};   // r5/select5: pickedBy: slot -> face index (its list row lights it)
    function restore() { App.model = JSON.parse(snapshot); baseModel = App.model; }
    var LIMIT = { limitdistance: 1, limitangle: 1 }, FLIPS = { distance: 1, angle: 1, coincident: 1, tangent: 1, gear: 1, limitdistance: 1, limitangle: 1 };
    function mateValues() {
      var t = v.type, lim = !!LIMIT[t];
      return { distance: t === 'distance' ? +v.distance || 0 : null, angle: t === 'angle' ? +v.angle || 0 : null,
        offset: t === 'coincident' ? +v.offset || 0 : null, min: lim ? +v.min || 0 : null, max: lim ? +v.max || 0 : null,
        ratio: t === 'gear' ? [+v.ratioA || 1, +v.ratioB || 1] : null, flip: !!FLIPS[t] && !!v.flip };
    }
    // Distance / Angle (and the limits) start at the distance / angle the two selections have now (as in SolidWorks)
    function measure() {
      if (valueSet || !(v.a && v.b) || !App.build || !App.build.partBuilds) return;
      try {
        var A = Assembly.resolveRef(App.model, App.build.partBuilds, v.a), B = Assembly.resolveRef(App.model, App.build.partBuilds, v.b);
        var da = A.normal || A.dir, db = B.normal || B.dir, c = Math.max(-1, Math.min(1, K.vec.dot(da, db))), d = null;
        if (A.kind === 'plane' && B.kind === 'plane') d = Math.abs(K.vec.dot(K.vec.sub(B.point, A.point), A.normal));
        else if (A.kind === 'axis' && B.kind === 'axis') { var w = K.vec.sub(B.point, A.point), t = K.vec.dot(w, A.dir); d = Math.hypot(w[0] - t * A.dir[0], w[1] - t * A.dir[1], w[2] - t * A.dir[2]); }
        if (d != null) v.distance = +d.toFixed(4);
        v.angle = +(Math.acos(c) * 180 / Math.PI).toFixed(4);
        if (v.type === 'limitdistance' && d != null) { v.min = v.distance; v.max = v.distance; }
        if (v.type === 'limitangle') { v.min = v.angle; v.max = v.angle; }
      } catch (e) { /* the preview reports a bad reference */ }
    }
    function apply(m) {
      var opts = alignSet || autoAlign ? { alignment: v.alignment } : {};
      var wide = v.type === 'width';
      if (existing) {
        var x = Assembly.findMate(m, existing.id);
        if (x.type !== v.type && /^(Coincident|Concentric|Distance|Angle|Parallel|Perpendicular|Tangent|Width|Gear|LimitDistance|LimitAngle)\d+$/.test(x.name)) x.name = nextMateName(m, v.type, x.id);
        if (x.type !== v.type) delete x.phase;
        x.type = v.type; x.a = JSON.parse(JSON.stringify(v.a)); x.b = JSON.parse(JSON.stringify(v.b));
        if (wide && v.a2) x.a2 = JSON.parse(JSON.stringify(v.a2)); else delete x.a2;
        if (wide && v.b2) x.b2 = JSON.parse(JSON.stringify(v.b2)); else delete x.b2;
        if (alignSet || autoAlign) x.alignment = v.alignment; else delete x.alignment;
        Assembly.setMateValues(x, mateValues());
        return x;
      }
      var mv = mateValues();
      Object.keys(mv).forEach(function (k) { if (mv[k] != null) opts[k] = mv[k]; });
      if (wide) { opts.a2 = v.a2 ? JSON.parse(JSON.stringify(v.a2)) : null; if (v.b2) opts.b2 = JSON.parse(JSON.stringify(v.b2)); }
      return Assembly.addMate(m, v.type, JSON.parse(JSON.stringify(v.a)), JSON.parse(JSON.stringify(v.b)), opts);
    }
    function setMessage(html, ok) { if (!pm.spec || (mySpec && pm.spec !== mySpec)) return; pm.spec.message = html; pm.spec.messageOk = !!ok; renderPM(); }
    function selectMessage() {
      return v.type === 'width' ? 'Width: select the two width faces (the slot sides), then the two tab faces or one cylindrical face (the part centred between them).'
        : 'Select two entities to mate: planar faces, cylindrical faces, or origin planes, on different components.';
    }
    function preview() {
      if (!ready(v)) {
        if (previewed) { var g0 = glideFrom(); restore(); previewed = false; UI.rebuild({ noSave: true }); glide(g0); }
        setMessage(selectMessage());
        return;
      }
      var kindErr = mateKindError(v.type, v.a, v.b, v.a2, v.b2);
      restore();
      if (kindErr) { if (previewed) { var g1 = glideFrom(); previewed = false; UI.rebuild({ noSave: true }); glide(g1); } setMessage(kindErr + '. Pick other entities or change the mate type.'); return; }
      var mt;
      var from = glideFrom();
      try { mt = apply(App.model); previewed = true; UI.rebuild({ noSave: true }); glide(from); }
      catch (e) { restore(); previewed = false; UI.rebuild({ noSave: true }); setMessage('Preview failed: ' + (e.message || e)); return; }
      var st = mateStatus(mt);
      // r9/polish9: the default alignment cannot be met where the components stand (a pin held upright by a Concentric
      // whose bottom is mated to the plate's bottom: Anti-Aligned would turn it over): take the other one, as SolidWorks
      // picks the alignment the components already have. Only for a new mate whose alignment the user has not chosen.
      if (st.error && !existing && !alignSet && !autoAlign && v.type !== 'gear' && (v.alignment === 'aligned' || v.alignment === 'anti-aligned')) {
        var was = v.alignment, mt2 = null;
        restore(); v.alignment = was === 'aligned' ? 'anti-aligned' : 'aligned'; autoAlign = true;
        try { mt2 = apply(App.model); UI.rebuild({ noSave: true }); } catch (e2) { mt2 = null; }
        var st2 = mt2 ? mateStatus(mt2) : null;
        if (st2 && !st2.error) { mt = mt2; st = st2; renderPM(); }
        else { restore(); v.alignment = was; autoAlign = false; mt = apply(App.model); UI.rebuild({ noSave: true }); st = mateStatus(mt); }
        glide(from);
      }
      setMessage(st.error ? mateTypeLabel(v.type) + ': ' + st.error : mateTypeLabel(v.type) + ' mate previewed. Press ✓ to ' + (existing ? 'update' : 'add') + ' it.', !st.error);
    }
    function addRef(ref, faceIndex) {
      if (!ref) return false;
      // the model was replaced while the PM stayed open (an undo, a script): previews start from that one
      if (!previewed && App.model !== baseModel) { snapshot = JSON.stringify(App.model); baseModel = App.model; }
      if (ready(v)) clearPicks(v);
      var slot = slots(v).filter(function (k) { return !v[k]; })[0];
      v[slot] = ref;
      if (faceIndex != null) { picked.push(faceIndex); pickedBy[slot] = faceIndex; }
      if (App.command) App.command.faceList = picked.slice();
      if (!typeSet) v.type = defaultMateType(v.a, v.b);
      if (!alignSet) { v.alignment = defaultAlignment(v.type, v.a, v.b); autoAlign = false; }
      measure();
      renderPM();
      preview();
      UI.updateHighlights();
      matePopup();
      return true;
    }
    // r5/select5: a selection box over some of the slots: a row per filled slot (hover: its face; Delete / right-click:
    // removed, the later picks move up so the next pick fills the end)
    function slotFace(k) {
      var fi = pickedBy[k], ref = v[k];
      if (UI.mateRefFace && ref) { var r = UI.mateRefFace(ref); if (r >= 0) fi = r; }
      return fi != null && App.mesh && App.mesh.faces[fi] ? [fi] : [];
    }
    function slotBox(keys, icon, placeholder, show) {
      function filled(x) { return keys.filter(function (k) { return !!x[k]; }); }
      return { type: 'pick', icon: icon, placeholder: placeholder, show: show,
        value: function (x) { var n = filled(x).length; return n ? n + ' selected' : ''; },
        items: function (x) { return filled(x).map(function (k) { return { label: refText(x[k]), get faces() { return slotFace(k); } }; }); },
        onRemove: function (x, i) { var k = filled(x)[i]; if (k) removeSlot(keys, k); },
        onClear: function (x) { clearPicks(x); renderPM(); preview(); UI.updateHighlights(); } };
    }
    function removeSlot(keys, k) {
      v[k] = null; delete pickedBy[k];
      for (var j = keys.indexOf(k); j + 1 < keys.length; j++) {   // later picks move up
        v[keys[j]] = v[keys[j + 1]]; v[keys[j + 1]] = null;
        if (pickedBy[keys[j + 1]] != null) { pickedBy[keys[j]] = pickedBy[keys[j + 1]]; delete pickedBy[keys[j + 1]]; } else delete pickedBy[keys[j]];
      }
      picked = Object.keys(pickedBy).map(function (s) { return pickedBy[s]; });
      if (App.command) App.command.faceList = picked.slice();
      if (!typeSet && !v.a && !v.b) v.type = 'coincident';
      syncGroups(v); renderPM(); preview(); UI.updateHighlights(); matePopup();
    }
    // a click on a face already in the list takes it out again (as in SolidWorks)
    function unpick(fi) {
      var grp = UI.faceGroup ? UI.faceGroup(fi) : [fi];
      var k = slots(v).filter(function (s) { return v[s] && slotFace(s).some(function (j) { return grp.indexOf(j) >= 0; }); })[0];
      if (!k) return false;
      removeSlot(v.type === 'width' ? (k === 'a' || k === 'a2' ? ['a', 'a2'] : ['b', 'b2']) : ['a', 'b'], k);
      return true;
    }
    // r5/asm5: once both selections are made, the Mate pop-up toolbar by the pointer (as in SolidWorks): the mate types
    // the two selections can take, Flip Mate Alignment, ✓ (add, the PM stays open) and ✗ (clear the selections)
    var POP_TYPES = ['coincident', 'parallel', 'perpendicular', 'tangent', 'concentric', 'distance', 'angle'];
    function matePopup() {
      if (!UI.asmMatePopup || !ready(v) || pm.spec !== mySpec) { if (UI.asmClosePopup) UI.asmClosePopup('mate'); return; }
      UI.asmMatePopup({
        // r7/asm7: Width too (its four selections made): Width is the one type they take, the tab faces' alignment flips as for the others
        types: function () { return v.type === 'width' ? ['width'] : POP_TYPES.filter(function (t) { return !mateKindError(t, v.a, v.b); }); },
        flip: !(v.type === 'width' && v.b && refKind(v.b) === 'axis'),   // a cylindrical tab: nothing to flip
        type: function () { return v.type; },
        onType: function (t) { if (t === v.type) return; v.type = t; syncGroups(v); if (mySpec && mySpec.onChange) mySpec.onChange(v, 'type'); },
        onFlip: function () {
          var cur = alignSet || autoAlign ? v.alignment : defaultAlignment(v.type, v.a, v.b);
          v.alignment = cur === 'closest' && UI.asmFlippedAlignment ? UI.asmFlippedAlignment({ type: v.type, a: v.a, b: v.b, alignment: 'closest' }) : cur === 'aligned' ? 'anti-aligned' : 'aligned';
          if (mySpec && mySpec.onChange) mySpec.onChange(v, 'alignment');
          renderPM();
        },
        onOK: function () { if (pm.spec === mySpec) pmOK(); },
        onCancel: function () { if (pm.spec !== mySpec) return; clearPicks(v); renderPM(); preview(); UI.updateHighlights(); }
      });
    }
    openPM({
      title: existing ? existing.name : 'Mate', icon: 'mate', values: v, keepVisible: !existing,   // rfBG: the pin (a new mate's PM stays open)
      // r9/polish9: a new mate starts with picks, not with the cursor in the Offset box (typed digits went there);
      // Enter still accepts (ui-app.js)
      noFocus: !existing,
      message: 'Select two entities to mate: planar faces, cylindrical faces, or origin planes, on different components.',
      command: {
        pickPlane: true, quietPlanes: true, faceList: [],   // r13/asmui13: origin planes are picked in the FeatureManager (drawn while their row is hovered), not drawn over the model
        onPick: function (pk) {
          var ref = null;
          if (pk.kind === 'face' && unpick(pk.index)) return true;   // r5/select5
          if (pk.kind === 'face') { try { ref = Assembly.refFromPick(App.model, App.build, pk.index, pk.point, App.mesh); } catch (e) { ref = null; } }
          else if (pk.kind === 'axis' && typeof pk.ref === 'string') ref = { axis: pk.ref };
          else if (pk.kind === 'plane' && typeof pk.ref === 'string') ref = { plane: pk.ref };
          if (!ref) { UI.setStatus('That entity cannot be used in a mate.'); return true; }
          return addRef(ref, pk.kind === 'face' ? pk.index : null);
        }
      },
      groups: [
        { title: 'Mate Selections', fields: [
          // r5/select5: one Entities to Mate box (two lists for Width) whose rows light their face on hover and go with
          // Delete / right-click, as in the other PropertyManagers
          slotBox(['a', 'b'], 'component', 'Entities to mate…', function (x) { return x.type !== 'width'; }),
          { type: 'static', label: 'Width selections', value: '', show: function (x) { return x.type === 'width'; } },
          slotBox(['a', 'a2'], 'width', 'Two width faces…', function (x) { return x.type === 'width'; }),
          { type: 'static', label: 'Tab selections', value: '', show: function (x) { return x.type === 'width'; } },
          slotBox(['b', 'b2'], 'component', 'Two tab faces or one cylindrical face…', function (x) { return x.type === 'width'; }),
          { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function (x) { clearPicks(x); renderPM(); preview(); UI.updateHighlights(); } }] }
        ] },
        { title: 'Standard Mates', fields: [
          // an Advanced / Mechanical type shows as "—" here
          { type: 'select', label: 'Mate type', key: 'type', rerender: true, options: function (x) { return MATE_TYPES.some(function (o) { return o[0] === x.type; }) ? MATE_TYPES : [[x.type, '\u2014']].concat(MATE_TYPES); } },
          { type: 'number', label: 'Distance', key: 'distance', unit: 'u', min: 0, show: function (x) { return x.type === 'distance'; } },
          { type: 'number', label: 'Angle', key: 'angle', unit: '°', min: 0, show: function (x) { return x.type === 'angle'; } },
          { type: 'number', label: 'Offset', key: 'offset', unit: 'u', min: 0, show: function (x) { return x.type === 'coincident'; } },
          { type: 'check', label: 'Flip dimension', key: 'flip', show: function (x) { return x.type !== 'concentric' && x.type !== 'tangent' && !!FLIPS[x.type] && x.type !== 'gear'; } },
          { type: 'check', label: 'Flip (other side / internal)', key: 'flip', show: function (x) { return x.type === 'tangent'; } }
        ] },
        { title: 'Advanced Mates', fields: [
          { type: 'select', label: 'Advanced', key: 'advType', rerender: true, options: function () { return [['', '\u2014']].concat(mateGroup('advanced')); } },
          { type: 'number', label: 'Maximum', key: 'max', unit: 'u', min: 0, show: function (x) { return x.type === 'limitdistance'; } },
          { type: 'number', label: 'Minimum', key: 'min', unit: 'u', min: 0, show: function (x) { return x.type === 'limitdistance'; } },
          { type: 'number', label: 'Maximum', key: 'max', unit: '°', min: 0, show: function (x) { return x.type === 'limitangle'; } },
          { type: 'number', label: 'Minimum', key: 'min', unit: '°', min: 0, show: function (x) { return x.type === 'limitangle'; } }
        ] },
        { title: 'Mechanical Mates', fields: [
          { type: 'select', label: 'Mechanical', key: 'mechType', rerender: true, options: function () { return [['', '\u2014']].concat(mateGroup('mechanical')); } },
          { type: 'number', label: 'Ratio A', key: 'ratioA', min: 0, show: function (x) { return x.type === 'gear'; } },
          { type: 'number', label: 'Ratio B', key: 'ratioB', min: 0, show: function (x) { return x.type === 'gear'; } },
          { type: 'check', label: 'Reverse', key: 'flip', show: function (x) { return x.type === 'gear'; } }
        ] },
        { title: 'Mate alignment', show: function (x) { return x.type !== 'gear'; }, fields: [{ type: 'select', label: 'Alignment', key: 'alignment', options: [['aligned', 'Aligned'], ['anti-aligned', 'Anti-Aligned'], ['closest', 'Closest']] }] }
      ],
      onChange: function (x, key) {
        if ((key === 'advType' || key === 'mechType') && !x[key]) { syncGroups(x); renderPM(); return; }
        if (key === 'advType' || key === 'mechType') { x.type = x[key]; key = 'type'; }
        if (key === 'type') {
          typeSet = true;
          // switching to Width: the two picks so far are the width faces; switching away: the second width face is B
          if (x.type === 'width' && x.b && !x.a2) { x.a2 = x.b; x.b = null; }
          if (x.type !== 'width' && x.a2 && !x.b) { x.b = x.a2; }
          if (x.type !== 'width') { x.a2 = null; x.b2 = null; }
          if (!alignSet) { x.alignment = defaultAlignment(x.type, x.a, x.b); autoAlign = false; }
          if (!valueSet && LIMIT[x.type]) measure();
          syncGroups(x);
          renderPM();
        }
        if (key === 'alignment') alignSet = true;
        if (key === 'distance' || key === 'angle' || key === 'min' || key === 'max') valueSet = true;
        if (key) preview();
      },
      onCancel: function () { if (previewed) { var g = glideFrom(); restore(); previewed = false; UI.rebuild({ noSave: true }); glide(g); } },
      onClose: function () { if (mateSession && mateSession.values === v) mateSession = null; if (UI.asmClosePopup) UI.asmClosePopup('mate'); },
      onOK: function (x) {
        // r3/assembly3: as in SolidWorks the PM stays open after a new mate is added, empty, for the next one; ✓ with
        // nothing selected (or ✗ / Esc) closes it. Editing an existing mate closes it as before.
        if (!existing && !(x.a || x.b || x.a2 || x.b2)) return undefined;
        if (!ready(x)) { UI.toast(x.type === 'width' ? 'Select the width faces and the tab faces first.' : 'Select two entities to mate first.'); return false; }
        var kindErr = mateKindError(x.type, x.a, x.b, x.a2, x.b2);
        if (kindErr) { UI.toast(kindErr + '.'); return false; }
        restore(); previewed = false;
        var p = asmCommit(apply, function (mt) {
          var st = mateStatus(mt);
          return st.error ? mt.name + ': ' + st.error : mt.name + (existing ? ' updated.' : ' added.');
        });
        if (existing) return p;
        clearPicks(x);
        typeSet = false; alignSet = false; autoAlign = false; valueSet = false;
        x.type = 'coincident'; x.alignment = 'aligned'; x.flip = false; x.distance = 10; x.angle = 90; x.offset = 0; x.min = 0; x.max = 10; x.ratioA = 1; x.ratioB = 1;
        syncGroups(x);
        return { keepOpen: true, promise: p.then(function (mt) {
          snapshot = JSON.stringify(App.model); baseModel = App.model; previewed = false;
          var st = mateStatus(mt);
          if (pm.spec === mySpec) {
            renderPM();
            setMessage((st.error ? mt.name + ': ' + st.error + '. ' : '<b>' + mt.name + '</b> added. ') + 'Select two more entities for the next mate, or ✓ / Esc to close.', !st.error);
            UI.updateHighlights();
          }
          return mt;
        }) };
      }
    });
    mySpec = pm.spec;
    mateSession = { addRef: function (ref) { return addRef(JSON.parse(JSON.stringify(ref)), null); }, values: v };
    if (existing) preview();
    // r13/asmui13: editing a mate lights its faces in the selection colour, as in SolidWorks (the list was empty)
    if (existing && UI.mateRefFace && App.command) {
      ['a', 'b', 'a2', 'b2'].forEach(function (k) { var r = v[k] ? UI.mateRefFace(v[k]) : -1; if (r >= 0) pickedBy[k] = r; });
      picked = Object.keys(pickedBy).map(function (s) { return pickedBy[s]; });
      App.command.faceList = picked.slice();
      UI.updateHighlights();
    }
  }
  function editMate(m) { cmdMate(m); }
  // UI.mateSelect(ref): add a ref to the open Mate PM as if it were picked (scripts / tests); false when no Mate PM is open
  function mateSelect(ref) { return mateSession ? mateSession.addRef(ref) : false; }

  // ---- Move Component / Rotate Component
  // A move only changes the component's stored transform; the rebuild solves the mates again, so the component keeps
  // what its free degrees of freedom allow (Assembly.moveComponent / rotateComponent). Each move is one undo step.
  function asmMove(idOrName, delta) {
    var c = findComp(idOrName);
    if (!c) return asmFail('No component "' + idOrName + '"');
    if (c.fixed) return asmFail(c.name + ' is fixed: Float it to move it.');
    if (c.pattern != null) return asmFail(c.name + ' is a pattern instance: move its seed.');
    var id = c.id;
    return asmCommit(function (m) { return Assembly.moveComponent(m, id, delta); }, c.name + ' moved; mates solved again.');
  }
  // rotate(idOrName, axis 'x' | 'y' | 'z' | [x, y, z], degrees, pivot? (default: the component's centre))
  function asmRotate(idOrName, axis, deg, pivot) {
    var c = findComp(idOrName);
    if (!c) return asmFail('No component "' + idOrName + '"');
    if (c.fixed) return asmFail(c.name + ' is fixed: Float it to rotate it.');
    if (c.pattern != null) return asmFail(c.name + ' is a pattern instance: rotate its seed.');
    var id = c.id, P = pivot || Assembly.componentCenter(App.model, App.build, id);
    try { Assembly.rotateComponent(JSON.parse(JSON.stringify(App.model)), id, axis, deg, P); } catch (e) { return asmFail(e.message); }
    return asmCommit(function (m) { return Assembly.rotateComponent(m, id, axis, deg, P); }, c.name + ' rotated; mates solved again.');
  }
  // Viewport drag (ui-sketch.js asks UI.componentDragHook on a left button press): in an assembly, with no command
  // open or with Move / Rotate Component open, pressing on a floating component and dragging moves it in the screen
  // plane (Rotate Component: turns it about its centre). The graphics area shows the solved result while dragging
  // (mates hold what they fix); dropping commits one undo step. Fixed components refuse and the view rotates instead.
  var DRAG_DEG_PER_PX = 0.5;
  function componentDragHook(p, ev, force) {   // force 'rotate': the right-mouse drag (r5/asm5)
    if (!isAsm() || typeof Assembly === 'undefined' || App.mode === 'sketch' || !App.mesh) return null;
    if (App.command && !App.command.dragComponents) return null;
    var hit = UI.pickFace(p[0], p[1]), face = hit && App.mesh.faces[hit.index];
    var c = face ? (App.model.components || [])[face.body || 0] : null;
    if (!c) return null;
    var mode = force === 'rotate' || (App.command && App.command.dragComponents === 'rotate') ? 'rotate' : 'move';
    if (c.fixed && !(c.flexible && mode === 'move')) { if (force !== 'rotate') UI.setStatus(c.name + ' is fixed: Float it to drag it.'); return null; }
    var snap = JSON.stringify(App.model), id = c.id, start = p.slice(), last = null, raf = 0;
    var center = Assembly.componentCenter(App.model, App.build, id);
    // Move: the grabbed point (local to the component) follows the mouse in the screen plane as far as the mates let
    // it, as in SolidWorks: a hinged arm swings, a crank turns and drives its linkage (Assembly.rebuild opts.drag).
    // Each frame solves from the previous one, so a long sweep goes round smoothly.
    var off = App.build && App.build.explode && App.build.explode.offsets && App.build.explode.offsets[id];
    var grab = hit.point ? (off ? [hit.point[0] - off[0], hit.point[1] - off[1], hit.point[2] - off[2]] : hit.point.slice()) : center;
    var grabLocal = Assembly.inverseTransformPoint(c.transform, grab), dragId = id;
    // a Flexible sub-assembly: grabbing one of its floating parts drags that part (its own mates solved in context)
    if (c.flexible && mode === 'move') {
      var iref = null;
      try { iref = Assembly.refFromPick(App.model, App.build, hit.index, hit.point, App.mesh); } catch (e) { iref = null; }
      var sb = App.build.partBuilds && App.build.partBuilds[id];
      var inner = iref && iref.path && iref.path.length === 1 && sb && sb.model ? Assembly.findComponent(sb.model, iref.path[0]) : null;
      if (inner && !inner.fixed && inner.pattern == null && (iref.face || iref.cylinder)) { dragId = id + '/' + inner.id; grabLocal = (iref.face || iref.cylinder).slice(); }
      // r9/polish9: a part deeper down (inside a sub-assembly of the Flexible one) drags the floating inner
      // sub-assembly that holds it, as one body (its own mates are solved one level up only)
      var deep = iref && iref.path && iref.path.length > 1 && sb && sb.model ? Assembly.findComponent(sb.model, iref.path[0]) : null;
      if (deep && !deep.fixed && deep.pattern == null) {
        dragId = id + '/' + deep.id;
        grabLocal = Assembly.inverseTransformPoint(Assembly.composeTransforms(c.transform, (c.flexState || {})[deep.id] || deep.transform), grab);
      }
    }
    // r5/asm5: a fixed Flexible sub-assembly still lets its floating parts be dragged (as in SolidWorks), not its base
    if (c.fixed && dragId === id) { UI.setStatus(c.name + ' is fixed: Float it to drag it.'); return null; }
    // Rotate: the component turns about its centre with the mouse; one its mates hold (a hinged arm) turns as far as
    // they allow: the grabbed point is pulled to where the free turn would take it.
    function dragOpts(q, rotated) {
      if (mode === 'rotate') return { drag: { id: id, point: grabLocal, target: Assembly.transformPoint(Assembly.findComponent(rotated || target(q), id).transform, grabLocal) } };
      var dx = q[0] - start[0], dy = q[1] - start[1], r = UI.cam.right, u = UI.cam.up, sc = UI.cam.scale;
      var tgt = [grab[0] + (r.x * dx - u.x * dy) * sc, grab[1] + (r.y * dx - u.y * dy) * sc, grab[2] + (r.z * dx - u.z * dy) * sc];
      return { drag: { id: dragId, point: grabLocal, target: tgt } };
    }
    function target(q) {
      var m = JSON.parse(snap), dx = q[0] - start[0], dy = q[1] - start[1], r = UI.cam.right, u = UI.cam.up;
      if (dx) Assembly.rotateComponent(m, id, [u.x, u.y, u.z], dx * DRAG_DEG_PER_PX, center);
      if (dy) Assembly.rotateComponent(m, id, [r.x, r.y, r.z], dy * DRAG_DEG_PER_PX, center);
      return m;
    }
    // r3/assembly3: solve the placements only and move what the viewport already shows (UI.asmPose); one rebuild on
    // release. A Flexible sub-assembly changes shape as it moves: its inner components are posed one by one.
    var fast = !!UI.asmPose;   // r4/asm4: Flexible sub-assemblies too (their inner components are posed by flexState)
    function show() {
      raf = 0;
      if (!last) return;
      var saved = UI.asmBuildOpts, rotated = null;
      if (mode === 'rotate') { rotated = target(last); App.model = JSON.parse(JSON.stringify(rotated)); }
      if (fast) {
        var po = dragOpts(last, rotated), pb = null;
        po.poseOnly = true; po.quick = true;
        try { pb = Assembly.rebuild(App.model, App.asmCache, po); } catch (e) { pb = null; }
        if (pb && UI.asmPose.apply(App.model, pb.explode)) return;
        fast = false;
      }
      UI.asmBuildOpts = dragOpts(last, rotated);
      try { UI.rebuild({ noSave: true }); } finally { UI.asmBuildOpts = saved; }
    }
    return {
      component: c,
      start: function () { UI.setStatus((mode === 'move' ? 'Moving ' : 'Rotating ') + c.name + '…'); },
      move: function (q) { last = q; if (!raf) raf = requestAnimationFrame(show); },
      end: function (q) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        var placed = {};   // every component's solved placement (a dragged linkage moves more than the one component)
        var m = mode === 'rotate' ? target(q) : JSON.parse(JSON.stringify(App.model)), o = dragOpts(q, mode === 'rotate' ? m : null);
        if (fast) o.poseOnly = true;
        try { Assembly.rebuild(m, App.asmCache, o); } catch (e) { m = null; }
        (m ? m.components : []).forEach(function (x) { placed[x.id] = { transform: x.transform, flexState: x.flexState }; });
        App.model = JSON.parse(snap);
        if (UI.asmPose && UI.asmPose.active()) UI.asmPose.end();   // the rebuild below draws the result in the same frame
        // nothing moved (a fully defined component, or one its mates hold against this drag): no undo step
        var moved = App.model.components.some(function (x) {
          var pl = placed[x.id], T = x.transform;
          if (!pl || !pl.transform || !T) return false;
          for (var k = 0; k < 9; k++) if (Math.abs(pl.transform.rotation[k] - T.rotation[k]) > 1e-9) return true;
          for (k = 0; k < 3; k++) if (Math.abs(pl.transform.position[k] - T.position[k]) > 1e-7) return true;
          return JSON.stringify(pl.flexState || null) !== JSON.stringify(x.flexState || null);
        });
        if (!moved) {
          var st = compStatus(id);
          return UI.afterRebuild(UI.rebuild({ noSave: true }), function () {
            UI.setStatus(c.name + (st && !st.underDefined ? ' is fully defined: its mates hold it in place.' : ' cannot move that way: its mates hold it.'));
            return Assembly.findComponent(App.model, id);
          });
        }
        return asmCommit(function (mm) {
          mm.components.forEach(function (x) {
            var pl = placed[x.id];
            if (!pl) return;
            x.transform = pl.transform;
            if (pl.flexState) x.flexState = pl.flexState;
          });
          return Assembly.findComponent(mm, id);
        }, c.name + (mode === 'move' ? ' moved' : ' rotated') + '; mates solved again.')
          .catch(function (e) { UI.toast(e.message || String(e)); });
      }
    };
  }
  function cmdMoveComponent(mode) {
    if (!asmReady()) return;
    mode = mode === 'rotate' ? 'rotate' : 'move';
    var v = { drag: mode, move: 'free', rotate: 'free', dx: 0, dy: 0, dz: 0, ax: 0, ay: 0, az: 0 };
    function target() {
      var c = selectedComponent();
      if (!c) { UI.toast('Select a component first (click it in the graphics area or the FeatureManager).'); return null; }
      return c;
    }
    function run(p) { if (p && p.catch) p.catch(function (e) { UI.toast(e.message || String(e)); }); return p; }
    function applyMove(x) { var c = target(); if (c) run(asmMove(c.id, [+x.dx || 0, +x.dy || 0, +x.dz || 0])); }
    function applyRotate(x) {
      var c = target();
      if (!c) return;
      var id = c.id, P = Assembly.componentCenter(App.model, App.build, id);
      if (c.fixed) { UI.toast(c.name + ' is fixed: Float it to rotate it.'); return; }
      run(asmCommit(function (m) {
        [['x', x.ax], ['y', x.ay], ['z', x.az]].forEach(function (a) { if (+a[1]) Assembly.rotateComponent(m, id, a[0], +a[1], P); });
        return Assembly.findComponent(m, id);
      }, c.name + ' rotated; mates solved again.'));
    }
    openPM({
      title: mode === 'rotate' ? 'Rotate Component' : 'Move Component', icon: mode === 'rotate' ? 'rotateComponent' : 'moveComponent', values: v,
      message: 'Drag a component in the graphics area to ' + (mode === 'rotate' ? 'rotate' : 'move') + ' it. Its mates are solved again when you drop it; fixed components do not move.',
      command: { dragComponents: mode },
      groups: [
        { title: 'Drag', fields: [{ type: 'select', label: 'Drag', key: 'drag', options: [['move', 'Move'], ['rotate', 'Rotate']] }] },
        { title: 'Move', fields: [
          { type: 'select', label: 'Move', key: 'move', options: [['free', 'Free Drag'], ['delta', 'By Delta XYZ']], rerender: true },
          { type: 'number', label: 'ΔX', key: 'dx', unit: 'u', show: function (x) { return x.move === 'delta'; } },
          { type: 'number', label: 'ΔY', key: 'dy', unit: 'u', show: function (x) { return x.move === 'delta'; } },
          { type: 'number', label: 'ΔZ', key: 'dz', unit: 'u', show: function (x) { return x.move === 'delta'; } },
          { type: 'buttons', buttons: [{ label: 'Apply', onclick: applyMove }], show: function (x) { return x.move === 'delta'; } }
        ] },
        { title: 'Rotate', fields: [
          { type: 'select', label: 'Rotate', key: 'rotate', options: [['free', 'Free Drag'], ['delta', 'By Delta XYZ']], rerender: true },
          { type: 'number', label: 'ΔX', key: 'ax', unit: '°', show: function (x) { return x.rotate === 'delta'; } },
          { type: 'number', label: 'ΔY', key: 'ay', unit: '°', show: function (x) { return x.rotate === 'delta'; } },
          { type: 'number', label: 'ΔZ', key: 'az', unit: '°', show: function (x) { return x.rotate === 'delta'; } },
          { type: 'buttons', buttons: [{ label: 'Apply', onclick: applyRotate }], show: function (x) { return x.rotate === 'delta'; } }
        ] }
      ],
      onChange: function (x, key) {
        if (key === 'drag' && App.command) {
          App.command.dragComponents = x.drag;
          pm.spec.title = x.drag === 'rotate' ? 'Rotate Component' : 'Move Component';
          renderPM();
        }
      },
      onOK: function () { }
    });
  }

  // ------------------------------------------------------------------ Imported feature (exchange.js)
  // Editing an Imported feature: which file it came from and its size; Merge result joins its solids to the bodies they
  // touch (otherwise each solid is its own body). The geometry itself is the file's: re-import to replace it.
  function cmdImported(existing) {
    if (!existing) { UI.cmdInsertImported(); return; }
    var info = typeof Exchange !== 'undefined' ? Exchange.featureInfo(existing) : { solids: (existing.solids || []).length, triangles: 0, file: existing.file, format: existing.format };
    var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var v = { merge: !!existing.merge, name: existing.name };
    openPM({
      title: existing.name, icon: 'imported', values: v, messageOk: true,
      message: 'Imported from <b>' + esc(info.file || 'a file') + '</b> (' + esc(String(info.format || 'mesh').toUpperCase()) + '): ' + info.solids + ' solid' + (info.solids === 1 ? '' : 's') + ', ' + info.triangles + ' triangles. Sketch on its faces, cut it and boss onto it like any body.',
      groups: [{ title: 'Options', fields: [{ type: 'check', label: 'Merge result', key: 'merge' }] }, { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }],
      onOK: function (val) {
        var f = {};
        Object.keys(existing).forEach(function (k) { if (k !== 'id' && k !== 'merge') f[k] = existing[k]; });
        if (val.merge) f.merge = true;
        if (val.name) f.name = String(val.name);
        return commitFeature(f, existing);
      }
    });
  }

  // ------------------------------------------------------------------ edit / delete features
  function editFeature(f) {
    if (!f) return;
    // r10/editpreview10: the PropertyManager the command opens rolls the part back to just before this feature
    var idx = App.model && App.model.features ? App.model.features.indexOf(f) : -1;
    // p9-pm: not the Base Flange: its PropertyManager (Sheet-Metal) edits the whole part's sheet parameters and shows
    // the part, as SolidWorks does (rolled back to before the Base Flange there would be nothing left on screen)
    var sheetParams = f.type === 'extrude' && f.sheetBase && !f.cut && !f.tab;   // lane DI: a Tab edits as a feature
    if (sheetParams && pm.spec) pmCancel();
    if (f.type !== 'sketch' && !sheetParams && idx >= 0 && !(UI.isAssembly && UI.isAssembly())) {
      if (pm.spec) pmCancel();   // one PropertyManager at a time: the one open is cancelled (and rolls forward)
      editNext = idx;
    }
    try { editDispatch(f); } finally { editNext = null; }
  }
  function editDispatch(f) {
    switch (f.type) {
      case 'sketch': editSketch(f.id); break;
      // a Base Flange's depth is the sheet thickness: it is edited with the sheet's parameters, not as an extrude
      case 'extrude': if (f.tab && !f.cut) cmdTab(f); else if (f.sheetBase && !f.cut) cmdSheetMetal(); else cmdExtrude(f.cut, f); break;
      case 'rip': UI.cmdRipFeature(f); break;   // lane DI
      case 'vent': UI.cmdVent(f); break;   // lane DT
      case 'crossBreak': UI.cmdCrossBreak(f); break;   // lane cross-break
      case 'formingTool': UI.cmdFormingTool(f.tool, f); break;   // lane forming
      case 'wrap': UI.cmdWrap(f); break;   // rfDZ
      case 'insertBends': if (f.openBase) cmdOpenBase(f.sketch, f); else UI.cmdInsertBends(f); break;   // lane DQ; lane open-base
      case 'convertSM': UI.cmdConvertSheetMetal(f); break;
      case 'revolve': cmdRevolve(f.cut, f); break;
      case 'lpattern': cmdLinearPattern(f); break;
      case 'cpattern': cmdCircularPattern(f); break;
      case 'mirror': cmdMirror(f); break;
      case 'plane': cmdPlane(f); break;
      case 'refaxis': case 'refpoint': case 'csys': cmdRefGeo(f.type, f); break;   // lane CZ
      case 'helix': case 'projCurve': case 'compositeCurve': case 'xyzCurve': case 'refPtCurve': faEdit(f); break;   // rfFA
      case 'chamfer': cmdChamfer(f); break;
      case 'fillet': cmdFillet(f); break;
      case 'flange': cmdEdgeFlange(f); break;
      case 'jog': cmdJog(f); break;
      case 'loftedBend': cmdLoftedBend(f); break;   // lane dxfout-2
      case 'sweptFlange': cmdSweptFlange(f); break;   // lane sweptflange
      case 'sketchedBend': UI.cmdSketchedBend(f); break;
      case 'breakCorner': UI.cmdBreakCorner(f); break;
      case 'cornerRelief': UI.cmdCornerRelief(f); break;   // lane smtrim
      case 'weldedCorner': UI.cmdWeldedCorner(f); break;   // lane smcorner
      case 'closedCorner': UI.cmdClosedCorner(f); break;
      case 'unfold': UI.cmdUnfold(f); break;   // lane DB
      case 'fold': UI.cmdFold(f); break;
      case 'sweep': cmdSweep(f.cut, f); break;
      case 'loft': cmdLoft(f.cut, f); break;
      case 'boundary': UI.cmdBoundary(f.cut, f); break;   // rfFB
      case 'shell': cmdShell(f); break;
      case 'draft': UI.cmdDraft(f); break;   // rfDX
      case 'rib': UI.cmdRib(f); break;   // rfDY
      case 'intersect': UI.cmdIntersect(f); break;   // rfDY
      case 'deleteBody': UI.cmdDeleteBody(f); break;   // rfHT
      case 'import': cmdImported(f); break;
      case 'hole': if (UI.cmdHoleWizard) UI.cmdHoleWizard(f); break;
    }
  }
  // r11/faceref11: features that hang on the faces of the features being deleted: sketches drawn on those faces
  // (plane.face) and everything built from them, transitively (their extrudes, Hole Wizard holes, patterns, sketches
  // on their faces). SolidWorks asks the same with "Also delete child features"; left alone they stay where they
  // are, marked Dangling, and Edit Sketch Plane reattaches them.
  function faceChildren(doomed) {
    var kids = [], grew = true;
    function uses(g, ids) {
      return ids.indexOf(g.sketch) >= 0 || ids.indexOf(g.feature) >= 0 || ids.indexOf(g.profile) >= 0 || ids.indexOf(g.path) >= 0 ||
        (g.sketches || []).some(function (s) { return ids.indexOf(s) >= 0; }) || (g.plane && g.plane.featureId != null && ids.indexOf(g.plane.featureId) >= 0);
    }
    while (grew) {
      grew = false;
      App.model.features.forEach(function (g) {
        if (doomed.indexOf(g.id) >= 0 || kids.indexOf(g.id) >= 0) return;
        var all = doomed.concat(kids);
        if ((g.type === 'sketch' && g.plane && g.plane.face && all.indexOf(g.plane.face.feature) >= 0) || (kids.length && uses(g, kids))) { kids.push(g.id); grew = true; }
      });
    }
    return kids;
  }
  UI.faceChildren = faceChildren;
  function deleteFeature(id) {
    var f = K.findFeature(App.model, id);
    if (!f) return;
    var dependents = App.model.features.filter(function (g) { return g.sketch === id || g.feature === id || (g.plane && g.plane.featureId === id) || refUses(g, id); });   // lane CZ: refUses
    var base = [id].concat(dependents.map(function (d) { return d.id; }));
    // cascade one more level (patterns of dependents)
    App.model.features.forEach(function (g) { if (base.indexOf(g.feature) >= 0 && base.indexOf(g.id) < 0) base.push(g.id); });
    var kids = faceChildren(base);
    function names(ids) { return ids.map(function (k) { var g = K.findFeature(App.model, k); return g ? g.name : ''; }).join(', '); }
    var msg = 'Delete <b>' + f.name + '</b>?' + (dependents.length ? '<br>This also deletes: ' + dependents.map(function (d) { return d.name; }).join(', ') : '');
    if (kids.length) {
      var onFaces = kids.filter(function (k) { var g = K.findFeature(App.model, k); return g.type === 'sketch' && g.plane && g.plane.face && base.indexOf(g.plane.face.feature) >= 0; });
      msg += '<br><br>Drawn on its faces: <b>' + names(onFaces) + '</b>' + (kids.length > onFaces.length ? ' (with ' + names(kids.filter(function (k) { return onFaces.indexOf(k) < 0; })) + ')' : '') + '.' +
        '<br><label class="del-kids"><input type="checkbox" id="del-face-children"> Also delete these child features</label>' +
        '<br><small>Left unchecked, they stay where they are, marked Dangling; right-click a sketch ▸ Edit Sketch Plane to put it on another face.</small>';
    }
    UI.confirmDialog('Confirm Delete', msg, function () {
      var box = document.getElementById('del-face-children');
      var withKids = !!(kids.length && box && box.checked);
      UI.pushUndo();
      var doomed = base.concat(withKids ? kids : []);
      App.model.features = App.model.features.filter(function (g) { return doomed.indexOf(g.id) < 0; });
      if (App.activeSketch != null && doomed.indexOf(App.activeSketch) >= 0) UI.exitSketch(true);
      App.sel = null; App.sel2 = null;
      closePM();
      UI.afterRebuild(UI.rebuild(), function () {
        var extra = dependents.length + (withKids ? kids.length : 0);
        UI.setStatus('Deleted ' + f.name + (extra ? ' and ' + extra + ' dependent feature' + (extra > 1 ? 's' : '') : '') + '.' +
          (kids.length && !withKids ? ' ' + kids.length + ' child feature' + (kids.length > 1 ? 's' : '') + ' left dangling.' : ''));
      });
    }, 'Delete');
  }
  function deleteSelection() {
    if (isAsm()) {
      var c = selectedComponent();
      if (c) confirmRemoveComponent(c);
      else UI.toast('Select a component, or right-click a mate in the FeatureManager to delete it.');
      return;
    }
    if (App.mode === 'sketch' && App.sel && App.sel.kind === 'entity') { deleteEntity(App.sel.index); closePM(); return; }
    if (App.mode === 'sketch' && App.sel && App.sel.kind === 'dim') { UI.deleteDim(App.sel.index); return; }
    if (App.mode === 'sketch' && App.sel && App.sel.kind === 'rel' && UI.deleteRelation) { UI.deleteRelation(App.sel.index); return; }
    // rfHT: whole bodies selected (graphics area or Solid Bodies folder): Delete opens Delete/Keep Body with them listed
    if (App.mode !== 'sketch' && !pm.spec) {
      var selBodies = (UI.selection ? UI.selection() : []).concat([App.sel, App.sel2]).filter(function (s) { return s && s.kind === 'body' && s.index >= 0; })
        .map(function (s) { return s.index; }).filter(function (i, k, a) { return a.indexOf(i) === k; });
      if (selBodies.length) {
        App.sel = null; App.sel2 = null;
        if (UI.setSelection) UI.setSelection([], { quiet: true });
        UI.updateHighlights();
        cmdDeleteBody(null, selBodies);
        return;
      }
    }
    if (App.sel && App.sel.kind === 'feature') { deleteFeature(App.sel.id); return; }
    if (App.sel && App.sel.kind === 'face' && App.mesh) {
      var id = App.triShared[App.mesh.faces[App.sel.index].start];
      if (id >= 0) deleteFeature(id);
    }
  }

  UI.openPM = openPM; UI.closePM = closePM; UI.pmOK = pmOK; UI.pmCancel = pmCancel; UI.escapeCommand = escapeCommand; UI.pmOKPlus = pmOKPlus; UI.runAgainable = runAgainable; UI.wrapOkPlusCommands = wrapOkPlusCommands; UI.hasPM = function () { return !!pm.spec; };
  UI.pmEnter = pmEnter; UI.pmPending = pmPending; UI.pmArm = pmArm; UI.pmEntryStatus = pmEntryStatus;
  // for commands in other files (ui-assembly.js, ui-evaluate.js) that update their open PropertyManager's message and results
  UI.renderPM = function () { if (pm.spec) renderPM(); }; UI.pmSpec = function () { return pm.spec; }; UI.pmTitle = function () { return pm.spec ? pm.spec.title : null; };
  // equations in PropertyManager number fields: the open PM's equation texts and errors (copies), and a field setter for scripts/tests
  UI.pmExpressions = function () { return { exprs: JSON.parse(JSON.stringify(pm.exprs || {})), errors: JSON.parse(JSON.stringify(pm.exprErrors || {})) }; };
  UI.pmSetField = function (key, text) {
    var inp = pm.root.querySelector('input.pm-num[data-key="' + key + '"]');
    if (!inp) return false;
    // an equation or shop input (p9-sketch: "3/8", "1-1/2", "25mm") goes in as text; a plain number stays a number box
    if ((isExpr(text) || !/^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(String(text))) && inp.type !== 'text') inp.type = 'text';
    inp.value = String(text);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  UI.evalFieldExpr = evalFieldExpr;
  // r4/features4: on-model handles of the open PropertyManager (ui-select.js draws / drags them), values and flips set
  // from the graphics area, the selection lists' hovered item
  UI.pmHandles = pmHandles; UI.pmSetValue = pmSetValue; UI.pmToggle = pmToggle; UI.pmFocusField = pmFocusField; UI.pmHoverItem = setHoverItem;
  UI.pmSpinStep = spinStep;
  UI.cmdSketch = cmdSketch; UI.editSketch = editSketch; UI.cmdExtrude = cmdExtrude; UI.cmdRevolve = cmdRevolve;
  UI.cmdLinearPattern = cmdLinearPattern; UI.cmdCircularPattern = cmdCircularPattern; UI.cmdMirror = cmdMirror; UI.cmdPlane = cmdPlane;
  UI.cmdRefAxis = cmdRefAxis; UI.cmdRefPoint = cmdRefPoint; UI.cmdCsys = cmdCsys; UI.refFromPick = refFromPick;   // lane CZ
  UI.cmdHole = cmdHole; UI.cmdBaseFlange = cmdBaseFlange; UI.cmdSection = cmdSection; UI.cmdMeasure = cmdMeasure;
  UI.cmdChamfer = cmdChamfer; UI.cmdFillet = cmdFillet;
  UI.cmdEdgeFlange = cmdEdgeFlange; UI.cmdMiterFlange = cmdMiterFlange; UI.cmdHem = cmdHem; UI.cmdJog = cmdJog; UI.cmdFlatten = cmdFlatten; UI.exportFlatDXF = exportFlatDXF;
  UI.cmdMirrorEntities = cmdMirrorEntities;   // Sketch Fillet, Offset, Convert, Trim, Extend, the sketch patterns …: ui-sketch-tools.js
  UI.cmdSweep = cmdSweep; UI.cmdLoft = cmdLoft; UI.cmdShell = cmdShell;
  UI.previewIdle = previewIdle;   // smooth/responsive: resolves once the newest live PropertyManager preview is shown
  // r10/editpreview10: the part was rolled back (on) or forward; the open PropertyManager re-resolves its picks on it
  UI.onRollback = function (on) { if (pm.spec && pm.spec.onRollback) pm.spec.onRollback(on); };
  UI.openEntityPM = openEntityPM; UI.openToolPM = openToolPM; UI.editFeature = editFeature; UI.deleteFeature = deleteFeature; UI.deleteSelection = deleteSelection;
  UI.newSketchOnPlane = newSketchOnPlane;
  // part-only commands refuse in an assembly document (label = the SolidWorks command name for the message)
  [['cmdExtrude', 'Extruded Boss/Base'], ['cmdRevolve', 'Revolved Boss/Base'], ['cmdLinearPattern', 'Linear Pattern'], ['cmdCircularPattern', 'Circular Pattern'],
    ['cmdMirror', 'Mirror'], ['cmdPlane', 'Reference Plane'], ['cmdHole', 'Hole Wizard'], ['cmdBaseFlange', 'Base Flange/Tab'], ['cmdChamfer', 'Chamfer'], ['cmdFillet', 'Fillet'],
    ['cmdEdgeFlange', 'Edge Flange'], ['cmdMiterFlange', 'Miter Flange'], ['cmdHem', 'Hem'], ['cmdJog', 'Jog'], ['cmdFlatten', 'Flatten'], ['exportFlatDXF', 'Flat to DXF'], ['cmdDxfOutput', 'DXF/DWG Output'],
    ['cmdMirrorEntities', 'Mirror Entities'], ['cmdSweep', 'Swept Boss/Base'], ['cmdLoft', 'Lofted Boss/Base'], ['cmdShell', 'Shell'],
    ['editSketch', 'Edit Sketch']
  ].forEach(function (c) { UI[c[0]] = partOnly(UI[c[0]], c[1]); });
  UI.cmdSketchedBend = partOnly(cmdSketchedBend, 'Sketched Bend');
  UI.cmdCornerRelief = partOnly(cmdCornerRelief, 'Corner Relief');   // Sheet Metal ▸ Corners ▸ Corner Relief (lane smtrim)
  UI.cmdWeldedCorner = partOnly(cmdWeldedCorner, 'Welded Corner');   // Sheet Metal ▸ Corners ▸ Welded Corner (lane smcorner)
  UI.cmdBreakCorner = partOnly(cmdBreakCorner, 'Break-Corner');   // Sheet Metal ▸ Break-Corner/Corner-Trim PropertyManager (lane CP)
  UI.cmdClosedCorner = partOnly(cmdClosedCorner, 'Closed Corner');   // Sheet Metal ▸ Closed Corner PropertyManager (lane CS)
  UI.cmdUnfold = partOnly(cmdUnfold, 'Unfold'); UI.cmdFold = partOnly(cmdFold, 'Fold');   // Sheet Metal ▸ Unfold / Fold (lane DB)
  UI.cmdRipFeature = partOnly(cmdRipFeature, 'Rip'); UI.cmdTab = partOnly(cmdTab, 'Base Flange/Tab');   // Sheet Metal ▸ Rip, Tab (lane DI)
  UI.cmdVent = partOnly(cmdVent, 'Vent');   // Sheet Metal ▸ Vent (lane DT)
  UI.cmdCrossBreak = partOnly(cmdCrossBreak, 'Cross-Break');   // Sheet Metal ▸ Cross-Break (lane cross-break)
  UI.cmdFormingTool = partOnly(cmdFormingTool, 'Forming Tool');   // Sheet Metal ▸ Forming Tool, UI.cmdFormingTool(id) presets the tool (lane forming)
  UI.cmdInsertBends = partOnly(cmdInsertBends, 'Insert Bends'); UI.cmdConvertSheetMetal = partOnly(cmdConvertSheetMetal, 'Convert to Sheet Metal'); UI.toggleNoBends = toggleNoBends;   // lane DQ
  // assembly documents
  UI.cmdInsertComponent = cmdInsertComponent; UI.cmdMate = cmdMate; UI.editMate = editMate; UI.mateSelect = mateSelect;
  UI.cmdMoveComponent = function () { cmdMoveComponent('move'); }; UI.cmdRotateComponent = function () { cmdMoveComponent('rotate'); };
  UI.componentDragHook = componentDragHook;   // Interference Detection (UI.cmdInterference, UI.interference) is in ui-evaluate.js
  UI.cmdFixComponent = cmdFixComponent; UI.cmdHideShowComponents = cmdHideShowComponents;
  UI.confirmRemoveComponent = confirmRemoveComponent; UI.confirmRemoveMate = confirmRemoveMate;
  UI.compLabel = compLabel; UI.compStatus = compStatus; UI.mateLabel = mateLabel; UI.mateStatus = mateStatus; UI.selectedComponent = selectedComponent;
  UI.asm = { insert: asmInsert, mate: asmAddMate, fix: asmSetFixed, removeComponent: asmRemoveComponent, removeMate: asmRemoveMate,
    suppressMate: asmSuppressMate, setHidden: asmSetHidden, isHidden: asmIsHidden, move: asmMove, rotate: asmRotate };
  UI.commands = { insertComponent: cmdInsertComponent, mate: cmdMate, editMate: editMate };
  UI.bodyList = bodyList; UI.bodyInfos = bodyInfos; UI.bodyTitle = bodyTitle; UI.selectBodyRow = selectBody;

  // rfAC: a sketch left over defined (a dimension kept driving after Make Dimension Driven?, a repeated relation) is a
  // rebuild warning on the sketch and on every feature built from it, as SolidWorks flags them, so a Base Flange from an
  // over-defined sketch never goes out unnoticed. The solver (sketch-solver.js) lives on the page, not in worker.js, so
  // the warnings are added to each applied build here; the analysis is cached per sketch on its content.
  var overCache = typeof WeakMap === 'function' ? new WeakMap() : null, overWarned = {};
  function sketchOverInfo(f) {
    var S = window.SketchSolver;
    if (!S || !f.entities || !f.entities.length || (!f.dims && !f.rels)) return null;
    var key = JSON.stringify([f.entities, f.rels || null, f.dims || null]), c = overCache && overCache.get(f);
    if (c && c.key === key) return c.info;
    var info = null;
    try { var an = S.analyze(f); if (an.status === 'over') info = { n: (an.redundant || 0) + (an.conflicts || 0), conflicts: an.conflicts || 0 }; } catch (e) { info = null; }
    if (overCache) overCache.set(f, { key: key, info: info });
    return info;
  }
  function overDefinedWarnings(build) {
    if (!build || !App.model || !App.model.features || App.model.type === 'assembly') return;
    var W = build.warnings = build.warnings || {}, errs = build.errors || {}, now = {}, fresh = null, added = false;
    function add(id, msg) {
      if (errs[id] || (W[id] && W[id].indexOf(msg) >= 0)) return;
      W[id] = W[id] ? W[id] + ' ' + msg : msg; added = true;
    }
    var over = {};
    App.model.features.forEach(function (f) {
      if (f.type !== 'sketch' || f.suppressed) return;
      var info = sketchOverInfo(f);
      if (!info) return;
      over[f.id] = f;
      add(f.id, 'This sketch is over defined: ' + info.n + ' dimension(s) / relation(s) ' + (info.conflicts ? 'conflict with' : 'repeat') + ' what the others define. Make the extra dimension driven or delete it (Display/Delete Relations).');
    });
    App.model.features.forEach(function (f) {
      if (f.type === 'sketch' || f.sketch == null || !over[f.sketch]) return;
      var msg = 'Built from ' + over[f.sketch].name + ', which is over defined.';
      add(f.id, msg); now[f.id] = true;
      if (!overWarned[f.id] && !fresh) fresh = f.name + ': ' + msg;
    });
    overWarned = now;
    if (added) { if (UI.refreshTree) UI.refreshTree(); if (UI.refreshStatus) UI.refreshStatus(); }
    if (fresh) UI.toast(fresh);   // (the command's own status line names the warning: commitFeature)
  }
  (UI.onBuild = UI.onBuild || []).push(overDefinedWarnings);
  UI.overDefinedWarnings = overDefinedWarnings;

  // ------------------------------------------------------------------ rfDX: Draft PropertyManager (SolidWorks' Neutral Plane)
  // Draft Angle, Neutral Plane (a planar face or a plane; Reverse direction flips the pull, also the arrow on the
  // model), Faces to Draft (click a listed face again to drop it), Face propagation (None / Along Tangent). The preview
  // is the drafted part (Kernel.buildDraft, the worker's 'tool' op).
  function cmdDraft(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var base = existing ? null : (App.build ? App.build.body : null), baseMesh = existing ? null : App.mesh;
    function getBase() { if (!base) { base = bodyBefore(existing.id); baseMesh = K.meshFromBody(base); } return base; }
    function getBaseMesh() { getBase(); return baseMesh; }
    if (existing ? !App.build : !base) { UI.toast('Create a solid first, then draft it.'); return; }
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'draft', angle: 1, neutral: null, faces: [], reverse: false, propagate: 'none' };
    if (!f.propagate) f.propagate = 'none';
    if (!Array.isArray(f.faces)) f.faces = [];
    var st = { box: f.neutral ? 'faces' : 'neutral', err: null };
    function r4(p) { return p.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }
    function tol() { return K.pickTol(App.model.units); }
    function live() { return !existing || App.rollback != null; }   // the base body is on screen (picks and highlights map to it)
    function featOf(v) {
      var o = { type: 'draft', angle: v.angle, neutral: v.neutral ? JSON.parse(JSON.stringify(v.neutral)) : null, faces: v.faces.map(function (s) { return { at: s.at.slice() }; }) };
      if (v.reverse) o.reverse = true;
      if (v.propagate === 'tangent') o.propagate = 'tangent';
      if (v.name) o.name = v.name;
      return o;
    }
    function faceIdx(spec) { try { var k = K.resolveFaces([spec], getBaseMesh(), tol())[0]; return k != null && k >= 0 ? k : -1; } catch (e) { return -1; } }
    function lit() {
      var idx = [];
      if (live()) {
        f.faces.forEach(function (s) { var k = faceIdx(s); if (k >= 0) idx.push(k); });
        var nf = f.neutral && (f.neutral.face || f.neutral.at);
        if (nf) { var k = faceIdx({ at: nf }); if (k >= 0) idx.push(k); }
      }
      if (App.command) App.command.faceList = idx;
      UI.updateHighlights();
    }
    // the pull direction and a point on the neutral plane for the arrow (null until both boxes are filled)
    function pullOf(v) {
      try {
        var mesh = getBaseMesh(), neu = K.draftNeutral(v.neutral, mesh, { planes: (App.build && App.build.planes) || {}, units: App.model.units }, tol());
        var idx = K.resolveFaces(v.faces, mesh, tol());
        if (!idx.length) return null;
        var fcs = idx.map(function (i) { return mesh.faces[i]; }), N = neu.pull, d0 = neu.d0;
        if (K.draftSide(N, d0, fcs) < 0) { N = V.scale(N, -1); d0 = -d0; }
        if (v.reverse) { N = V.scale(N, -1); d0 = -d0; }
        var c = fcs[0].centroid;
        return { n: N, O: V.add(c, V.scale(N, d0 - V.dot(N, c))) };
      } catch (e) { return null; }
    }
    function ready(v) { return !!(v.neutral && v.faces.length && +v.angle > 0); }
    function status(r) {
      UI.setStatus(st.err ? 'Preview: ' + st.err : ready(f) ? 'Draft preview: ' + f.faces.length + ' face' + (f.faces.length === 1 ? '' : 's') + ' at ' + UI.fmtNum(+f.angle, 3) + '°. Press Enter or ✓ to accept.'
        : !f.neutral ? 'Draft: select the neutral plane (a planar face or a plane).' : 'Draft: select the faces to draft.');
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      st.err = null;
      if (!ready(f)) { status(); UI.requestRender(); return; }
      var upto = null;
      if (existing) App.model.features.forEach(function (g, i) { if (g.id === existing.id) upto = i; });
      livePreview({ op: 'tool', feature: featOf(f), upto: upto, mats: [UI.mats.preview], sync: previewSync, done: function () { st.err = null; status(); },
        fail: function (msg) { st.err = msg; status(); } });
    }
    function previewSync() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var r = K.buildDraft(featOf(f), { body: getBase(), planes: (App.build && App.build.planes) || {}, units: App.model.units });
        addPreviewMesh(r.body, UI.mats.preview);
        st.err = null;
      } catch (e) { st.err = e.message; }
      status();
    }
    function onPick(pk) {
      if (st.box === 'neutral') {
        if (pk.kind === 'face' && App.mesh && App.mesh.faces[pk.index] && App.mesh.faces[pk.index].polys && App.mesh.faces[pk.index].polys.some(function (p) { return p.surf && p.surf.s && p.surf.s.t && p.surf.s.t !== 'plane'; })) {
          UI.setStatus('Pick a planar face or a plane for the neutral plane.'); UI.toast('Pick a planar face or a plane for the neutral plane.'); return true;
        }
        var r = UI.refFromPick(pk, 'plane');
        if (typeof r === 'string' || r.sketch != null) { var msg = typeof r === 'string' ? r : 'Pick a planar face or a plane.'; UI.setStatus(msg); UI.toast(msg); return true; }
        f.neutral = r; st.box = 'faces';
      } else {
        if (pk.kind !== 'face' || !pk.point) { UI.setStatus('Pick the faces to draft.'); return pk.kind === 'plane'; }
        var hit = -1, grp = live() && UI.faceGroup ? UI.faceGroup(pk.index) : [pk.index];
        f.faces.forEach(function (s, i) { if (grp.indexOf(faceIdx(s)) >= 0) hit = i; });
        if (hit >= 0) f.faces.splice(hit, 1); else f.faces.push({ at: r4(pk.point) });
      }
      renderPM(); lit(); preview();
      return true;
    }
    function neutralLabel(v) {
      var n = v.neutral;
      if (!n) return '';
      if (n.face || n.at) return 'Face<1>';
      if (n.plane != null) { if (typeof n.plane === 'string') return n.plane + ' Plane'; var g = K.findFeature(App.model, n.plane); return g ? g.name : 'Plane'; }
      return 'Plane';
    }
    // SolidWorks: faces selected before the command go to Faces to Draft, a plane to Neutral Plane
    if (!existing) {
      var pre = (UI.selection ? UI.selection() : [App.sel]).filter(Boolean);
      pre.forEach(function (s) {
        if (s.kind === 'plane' || (s.kind === 'feature' && K.findFeature(App.model, s.id) && K.findFeature(App.model, s.id).type === 'plane')) { var r = UI.refFromPick(s, 'plane'); if (typeof r !== 'string') f.neutral = r; return; }
        if (s.kind !== 'face' || !App.mesh || !App.mesh.faces[s.index]) return;
        var at = s.point ? s.point.slice() : null;
        if (!at) { var fc = App.mesh.faces[s.index], P = App.mesh.positions, o = fc.start * 9; at = [0, 1, 2].map(function (k) { return (P[o + k] + P[o + 3 + k] + P[o + 6 + k]) / 3; }); }
        f.faces.push({ at: r4(at) });
      });
      if (pre.length && UI.setSelection) UI.setSelection([], { quiet: true });
      st.box = f.neutral ? 'faces' : 'neutral';
    }
    openPM({
      title: existing ? existing.name : 'Draft', icon: 'draft', values: f,
      onRollback: function (on) { if (on && existing) { base = App.build.body; baseMesh = App.mesh; } try { lit(); } catch (e) { } },
      handles: function (v) { var p = ready(v) ? pullOf(v) : null; return p ? [{ type: 'flip', key: 'reverse', O: p.O, dir: p.n }] : []; },
      message: existing ? 'Edit the draft. The drafted part is previewed in yellow.' : 'Select the <b>neutral plane</b> (a planar face or a plane), then the <b>faces to draft</b>. The faces turn about where they meet the neutral plane; the part tapers away from it along the direction of pull.',
      command: { faceList: [], pickPlane: true, onPick: onPick },
      groups: [
        { title: 'Type of Draft', fields: [{ type: 'static', label: 'Type', value: 'Neutral Plane' }] },
        { title: 'Draft Angle', fields: [{ type: 'number', label: 'Draft angle', key: 'angle', unit: '°', min: 0, max: 89 }] },
        { title: 'Neutral Plane', fields: [
          { type: 'pick', icon: 'plane', placeholder: 'Select a planar face or a plane…', value: neutralLabel,
            active: function () { return st.box === 'neutral'; }, onActivate: function () { st.box = 'neutral'; renderPM(); } },
          { type: 'check', label: 'Reverse direction', key: 'reverse' }
        ] },
        { title: 'Faces to Draft', fields: [
          { type: 'pick', icon: 'draft', placeholder: 'Select the faces to draft…', value: function (v) { return v.faces.length ? v.faces.length + ' face' + (v.faces.length > 1 ? 's' : '') : ''; },
            active: function () { return st.box === 'faces'; }, onActivate: function () { st.box = 'faces'; renderPM(); },
            items: function (v) { return v.faces.map(function (spec, i) { return { label: 'Face<' + (i + 1) + '>', get faces() { if (!live()) return []; var k = faceIdx(spec); return k >= 0 ? [k] : []; }, at: spec.at }; }); },
            onRemove: function (v, i) { v.faces.splice(i, 1); renderPM(); lit(); preview(); },
            onClear: function (v) { v.faces.length = 0; renderPM(); lit(); preview(); } },
          { type: 'select', label: 'Face propagation', key: 'propagate', options: [['none', 'None'], ['tangent', 'Along Tangent']] }
        ] },
        { title: 'Feature', collapsed: !existing, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function () { lit(); preview(); },
      okBlocked: function (v) { return !v.neutral ? 'Select the neutral plane.' : !v.faces.length ? 'Select the faces to draft.' : null; },
      onOK: function (v) {
        if (!(+v.angle > 0) || !(+v.angle < 89)) { UI.toast('Draft angle must be greater than 0 and less than 89 degrees.'); return false; }
        if (st.err) { UI.toast(st.err); return false; }
        return commitFeature(featOf(v), existing);
      },
      onClose: function () { UI.disposeGroup(UI.groups.preview); }
    });
    lit(); preview();
  }
  UI.cmdDraft = partOnly(cmdDraft, 'Draft');
  OKPLUS_COMMANDS.push('Draft');
  // ------------------------------------------------------------------ rfDY: Rib and Intersect (kernel-features.js rfDY)
  // Rib (Features ▸ Rib, SolidWorks' PropertyManager): Parameters — Thickness (First Side / Both Sides / Second Side),
  // Rib thickness, Extrusion direction (Parallel to Sketch / Normal to Sketch), Flip material side, Type (Linear /
  // Natural); the sketch is the selected / last unconsumed one (an open line or chain). Live preview of the rib.
  function cmdRib(existing) {
    if (isAsm()) { refusePart('Rib'); return; }
    withSketch(function (sid) {
      if (!existing && !(App.build && App.build.body)) { UI.toast('Create a solid first, then sketch the rib on a plane through it.'); return; }
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'rib', sketch: pickDefaultSketch(sid), thickness: UI.lenDefault(5), side: 'both', direction: 'parallel', flip: false, extension: 'linear' };
      if (existing) delete f.profile;
      f.side = f.side || 'both'; f.direction = f.direction || 'parallel'; f.flip = !!f.flip; f.extension = f.extension || 'linear';
      if (f.sketch == null) { UI.toast('Sketch the rib first: an open line on a plane through the part.'); return; }
      function toFeature(v) {
        var out = { type: 'rib', sketch: v.sketch, thickness: v.thickness, side: v.side, direction: v.direction };
        if (v.flip) out.flip = true;
        if (v.extension === 'natural') out.extension = 'natural';
        if (v.name) out.name = v.name;
        return out;
      }
      function preview(v) {
        App.command.sketchId = v.sketch; UI.updateSketches();
        var err = showPreview(toFeature(v));
        UI.setStatus(err ? 'Preview: ' + err : 'Previewing the rib. Press Enter or ✓ to accept.');
      }
      openPM({
        title: existing ? existing.name : 'Rib', icon: 'rib', values: f,
        message: 'Sketch an <b>open line</b> on a plane through the part; the rib is thickened from it and grows until it meets the part.',
        command: { sketchId: f.sketch },
        groups: [
          { title: 'Parameters', fields: [
            sketchPickerField(f),
            { type: 'iconRadio', label: 'Thickness', key: 'side', options: [['one', 'First Side', 'rib'], ['both', 'Both Sides', 'rib'], ['other', 'Second Side', 'rib']] },
            { type: 'number', label: 'Rib thickness', key: 'thickness', unit: 'u', min: 0 },
            { type: 'radio', label: 'Extrusion direction', key: 'direction', options: [['parallel', 'Parallel to Sketch'], ['normal', 'Normal to Sketch']] },
            { type: 'check', label: 'Flip material side', key: 'flip' },
            { type: 'select', label: 'Type', key: 'extension', options: [['linear', 'Linear'], ['natural', 'Natural']] }
          ] },
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v) { preview(v); },
        onOK: function (v) { return commitFeature(toFeature(v), existing); }
      });
    });
  }
  // Intersect (Features ▸ Intersect): Selections (solid bodies and planes, checked in the list or clicked in the graphics
  // area), Options (Create internal regions), the Intersect button that lists the Regions to Exclude (a check excludes a
  // region; the preview shows kept regions yellow, excluded red), Merge result.
  function rfDYbuildBefore(existing) {
    var idx = -1;
    if (existing) App.model.features.forEach(function (g, i) { if (g.id === existing.id) idx = i; });
    if (idx < 0) return App.build;
    var m = JSON.parse(JSON.stringify(App.model));
    m.features = m.features.slice(0, idx);
    return K.rebuild(m);
  }
  function cmdIntersect(existing) {
    if (isAsm()) { refusePart('Intersect'); return; }
    if (App.mode === 'sketch') UI.exitSketch(true);
    var before = rfDYbuildBefore(existing);
    var nb = before && before.bodies ? before.bodies.length : 0;
    if (!nb) { UI.toast('Create the solids to intersect first.'); return; }
    var planeRefs = ['Front', 'Top', 'Right'].concat(App.model.features.filter(function (g) { return g.type === 'plane' && (!existing || g.id !== existing.id) && before.planes && before.planes[g.id]; }).map(function (g) { return g.id; }));
    function planeName(r) { if (typeof r === 'number') { var g = K.findFeature(App.model, r); return g ? g.name : 'Plane ' + r; } return r + ' Plane'; }
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'intersect', mode: 'create', merge: true };
    var v = { name: f.name || '', internal: f.mode === 'internal', merge: f.merge !== false, regions: null };
    var picked = Array.isArray(f.bodies) && f.bodies.length ? f.bodies : null;
    for (var i = 0; i < nb; i++) v['b' + i] = picked ? picked.indexOf(i) >= 0 : true;
    planeRefs.forEach(function (r) { v['p' + r] = (f.planes || []).some(function (q) { return q === r || (q && q.featureId === r); }); });
    function toFeature() {
      var out = { type: 'intersect', mode: v.internal ? 'internal' : 'create' };
      var bs = []; for (var k = 0; k < nb; k++) if (v['b' + k]) bs.push(k);
      if (bs.length && bs.length < nb) out.bodies = bs;
      var ps = planeRefs.filter(function (r) { return v['p' + r]; });
      if (ps.length) out.planes = ps;
      if (v.regions && v.regions.some(function (r, k) { return v['x' + k]; })) out.regions = v.regions.map(function (r, k) { return !v['x' + k]; });
      if (!v.merge) out.merge = false;
      if (v.name) out.name = v.name;
      return out;
    }
    function compute() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var regs = K.intersectRegions(before.bodies, toFeature(), previewModel(), before.planes || {});
        var keep = existing && Array.isArray(existing.regions) && !v.regions ? existing.regions : null;
        v.regions = regs;
        regs.forEach(function (r, k) { if (v['x' + k] == null) v['x' + k] = keep ? keep[k] === false : false; });
        labelRegions();
        UI.setStatus(regs.length + ' region' + (regs.length === 1 ? '' : 's') + '. Check the regions to exclude, then ✓.');
      } catch (e) { v.regions = null; UI.setStatus('Intersect: ' + e.message); }
      renderPM(); show();
    }
    function show() {
      UI.disposeGroup(UI.groups.preview);
      (v.regions || []).forEach(function (r, k) { try { addPreviewMesh(r.body, v['x' + k] ? UI.mats.previewCut : UI.mats.preview); } catch (e) { } });
    }
    function stale() { v.regions = null; Object.keys(v).forEach(function (k) { if (/^x\d+$/.test(k)) delete v[k]; }); UI.disposeGroup(UI.groups.preview); }
    var selFields = [], regionFields = [];
    for (var q = 0; q < 64; q++) (function (k) { regionFields.push({ type: 'check', key: 'x' + k, label: 'Region' + (k + 1), show: function () { return !!(v.regions && v.regions[k]); }, rerender: true }); })(q);
    function labelRegions() {
      (v.regions || []).forEach(function (r, k) { if (regionFields[k]) regionFields[k].label = 'Region' + (k + 1) + (r.void ? ' (internal)' : '') + '  ' + UI.fmtNum(r.volume, 4) + ' ' + UI.unitLabel() + '³'; });
    }
    for (var j = 0; j < nb; j++) selFields.push({ type: 'check', label: 'Solid Body ' + (j + 1), key: 'b' + j, rerender: true });
    planeRefs.forEach(function (r) { selFields.push({ type: 'check', label: planeName(r), key: 'p' + r, rerender: true }); });
    openPM({
      title: existing ? existing.name : 'Intersect', icon: 'intersect', values: v,
      message: 'Select the <b>solid bodies</b> and <b>planes</b> to intersect, click <b>Intersect</b>, then check the regions to exclude.',
      command: {
        pickPlane: true,
        onPick: function (pk) {
          if (pk.kind === 'face' && App.mesh && App.mesh.faces[pk.index] && App.rollback == null && !existing) { var bi = App.mesh.faces[pk.index].body | 0; if (bi < nb) { v['b' + bi] = !v['b' + bi]; stale(); renderPM(); } return true; }
          if (pk.kind === 'plane' && planeRefs.indexOf(pk.ref) >= 0) { v['p' + pk.ref] = !v['p' + pk.ref]; stale(); renderPM(); return true; }
          return false;
        }
      },
      groups: [
        { title: 'Selections', fields: selFields.concat([{ type: 'check', label: 'Create internal regions', key: 'internal', rerender: true },
          { type: 'buttons', buttons: [{ label: 'Intersect', onclick: function () { compute(); } }] }]) },
        { title: 'Regions to Exclude', show: function () { return !!v.regions; }, fields: [{ type: 'html', html: function () { return '<div class="pm-note">Checked regions are left out (red in the preview).</div>'; } }].concat(
          regionFields) },
        { title: 'Options', fields: [{ type: 'check', label: 'Merge result', key: 'merge' }] },
        { title: 'Feature', collapsed: !existing, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (vals, key) {
        if (/^(b\d+|p.+|internal)$/.test(key || '')) stale();
        else if (/^x\d+$/.test(key || '')) show();
      },
      onOK: function () {
        if (!v.regions) compute();
        if (!v.regions) return false;
        return commitFeature(toFeature(), existing);
      }
    });
    if (existing) compute();
  }
  UI.cmdRib = cmdRib; UI.cmdIntersect = cmdIntersect;
  // rfHT: ------------------------------------------------------------------ Delete/Keep Body
  // SolidWorks' Delete/Keep Body PropertyManager: Type (Delete Bodies / Keep Bodies) and one selection box of solid
  // bodies (click a body in the graphics area or its row in the Solid Bodies folder; Delete / right-click removes it
  // from the list). Opened by Delete with bodies selected (pre = their indices), Insert ▸ Features ▸ Delete/Keep Body
  // or the body's right-click menu. Feature JSON { type: 'deleteBody', keep?, bodies: [{ at }] } (Kernel.bodyRefFor:
  // a point inside each body, resolved again on every rebuild). The bodies that will go are shown in red.
  function cmdDeleteBody(existing, pre) {
    if (isAsm()) { refusePart('Delete/Keep Body'); return; }
    if (App.mode === 'sketch') UI.exitSketch(true);
    var before = rfDYbuildBefore(existing);
    var bodies = before ? (before.bodies || (before.body ? [before.body] : [])) : [];
    if (!bodies.length) { UI.toast('There are no solid bodies to delete.'); return; }
    var units = App.model.units, infos = K.bodyInfo(before, App.model);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'deleteBody', bodies: [] };
    if (!Array.isArray(f.bodies)) f.bodies = [];
    var v = { name: f.name || '', type: f.keep ? 'keep' : 'delete', bodies: f.bodies };
    function live() { return !existing || App.rollback != null; }   // the bodies before the feature are on screen
    function resolved() { try { return K.resolveBodyRefs(v.bodies, bodies, units); } catch (e) { return v.bodies.map(function () { return -1; }); } }
    function addBody(i) {
      if (!(i >= 0 && i < bodies.length) || resolved().indexOf(i) >= 0) return false;
      var r = K.bodyRefFor(bodies, i, units);
      if (r) v.bodies.push(r);
      return !!r;
    }
    function toggle(i) {
      var k = resolved().indexOf(i);
      if (k >= 0) v.bodies.splice(k, 1); else addBody(i);
      renderPM(); show();
    }
    (pre || []).forEach(addBody);
    function doomed() {
      var idx = resolved().filter(function (i) { return i >= 0; }), out = [];
      bodies.forEach(function (b, i) { if ((idx.indexOf(i) >= 0) !== (v.type === 'keep' && idx.length > 0)) out.push(i); });
      return v.type === 'keep' && !idx.length ? [] : out;
    }
    function show() {
      UI.disposeGroup(UI.groups.preview);
      var gone = doomed();
      gone.forEach(function (i) { try { addPreviewMesh(bodies[i], UI.mats.previewCut); } catch (e) { } });
      var left = bodies.length - gone.length;
      UI.setStatus(v.bodies.length ? gone.length + ' bod' + (gone.length === 1 ? 'y' : 'ies') + ' will be deleted (red), ' + left + ' will remain. Press ✓ to accept.'
        : 'Select the bodies to ' + (v.type === 'keep' ? 'keep' : 'delete') + ' in the graphics area or the Solid Bodies folder.');
    }
    function bodyFaces(i) {
      if (!live() || !App.mesh) return [];
      var out = [];
      App.mesh.faces.forEach(function (fc, k) { if ((fc.body | 0) === i) out.push(k); });
      return out;
    }
    function toFeature() {
      var out = { type: 'deleteBody', bodies: v.bodies.map(function (r) { return typeof r === 'number' ? r : { at: (r.at || r).slice() }; }) };
      if (v.type === 'keep') out.keep = true;
      if (v.name) out.name = v.name;
      return out;
    }
    openPM({
      title: existing ? existing.name : 'Delete/Keep Body', icon: 'deleteBody', values: v,
      message: 'Select the <b>bodies</b> to delete (or to keep) in the graphics area or the Solid Bodies folder.',
      command: {
        onPick: function (pk) {
          if (pk.kind === 'body' && live()) { toggle(pk.index); return true; }
          if (pk.kind === 'face' && live() && App.mesh && App.mesh.faces[pk.index]) { toggle(App.mesh.faces[pk.index].body | 0); return true; }
          return false;
        },
        onBodyPick: function (i) { if (!live()) return false; toggle(i); return true; }
      },
      groups: [
        { title: 'Type', fields: [{ type: 'radio', key: 'type', options: [['delete', 'Delete Bodies'], ['keep', 'Keep Bodies']], rerender: true }] },
        { title: 'Bodies', fields: [
          { type: 'pick', icon: 'body', placeholder: 'Select solid bodies…',
            value: function () { return v.bodies.length ? (v.type === 'keep' ? 'Bodies to Keep' : 'Bodies to Delete') + ': ' + v.bodies.length : ''; },
            items: function () {
              var idx = resolved();
              return v.bodies.map(function (r, k) {
                var i = idx[k], info = i >= 0 ? infos[i] : null;
                return { label: info ? info.name : 'Missing body', icon: 'body', get faces() { return i >= 0 ? bodyFaces(i) : []; } };
              });
            },
            onRemove: function (vv, k) { v.bodies.splice(k, 1); renderPM(); show(); },
            onClear: function () { v.bodies.length = 0; renderPM(); show(); } }
        ] },
        { title: 'Feature', collapsed: !existing, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (vals, key) { if (key === 'type') show(); },
      onOK: function () {
        if (!v.bodies.length) { UI.setStatus('Select at least one body to ' + (v.type === 'keep' ? 'keep' : 'delete') + '.'); return false; }
        UI.disposeGroup(UI.groups.preview);
        return commitFeature(toFeature(), existing);
      }
    });
    show();
  }
  UI.cmdDeleteBody = cmdDeleteBody;
  // a body row clicked in the Solid Bodies folder goes to the open selection box: ui-core.js selectBody asks command.onBodyPick
  // rfFB: ------------------------------------------------------------------ Boundary Boss/Base, Boundary Cut
  // SolidWorks' Boundary PropertyManager: Direction 1 (profiles, Move Up / Move Down, tangency at the start and end),
  // Direction 2 (curves that touch every profile, tangency), Options (Merge tangent faces, Close, Show preview), Thin
  // Feature. Click a box, then click a sketch in the graphics area or the FeatureManager tree: Direction 1 takes the
  // sketch, Direction 2 the chain of the clicked entity (the whole sketch from the tree). Feature JSON: Kernel
  // buildBoundary (kernel-features.js).
  var BFB_TAN = [['none', 'None'], ['direction', 'Direction Vector'], ['normal', 'Normal To Profile']];
  var bfbFocus = null;   // the Direction 1 / 2 row last focused: { box, index } (Move Up / Move Down act on it)
  pm.root.addEventListener('focusin', function (e) {
    if (!pm.spec || !pm.spec.bfb) return;
    var row = e.target && e.target.closest && e.target.closest('.pm-item'), wrap = row && row.closest('.pm-pickwrap');
    if (wrap) bfbFocus = { box: Array.prototype.indexOf.call(pm.root.querySelectorAll('.pm-pickwrap'), wrap) + 1, index: +row.getAttribute('data-index') };
  });
  function cmdBoundary(cut, existing) {
    withSketch(function (sid) {
      var sketches = App.model.features.filter(function (s) { return s.type === 'sketch'; });
      if (sketches.length < 2 && !existing) { UI.toast('A boundary needs at least two profile sketches.'); return; }
      var cutNow = existing ? !!existing.cut : !!cut;
      var title = cutNow ? 'Boundary-Cut' : 'Boundary';
      var tan = function (t, k) { return t && t[k] ? t[k] : 'none'; };
      var f = existing ? {
        dir1: (existing.dir1 || []).slice(), dir2: JSON.parse(JSON.stringify(existing.dir2 || [])), cut: cutNow, name: existing.name,
        t1s: tan(existing.tangency1, 'start'), t1e: tan(existing.tangency1, 'end'), t2s: tan(existing.tangency2, 'start'), t2e: tan(existing.tangency2, 'end'),
        mergeTangent: existing.mergeTangent !== false, close: !!existing.close, preview: true,
        thinOn: !!(existing.thin && +existing.thin.t > 0), thinType: existing.thin && existing.thin.mid ? 'mid' : 'one', thinRev: !!(existing.thin && existing.thin.reverse),
        thinT: existing.thin ? existing.thin.t : UI.lenDefault(1)
      } : { dir1: [], dir2: [], cut: cutNow, t1s: 'none', t1e: 'none', t2s: 'none', t2e: 'none', mergeTangent: true, close: false, preview: true, thinOn: false, thinType: 'one', thinRev: false, thinT: UI.lenDefault(1) };
      f.box = 1;
      if (!existing) {
        // a preselected sketch starts Direction 1; otherwise the last two unused sketches with a closed profile
        var closed = function (s) { try { var pr = s.profile || K.sketchProfile(s); return pr.loops.some(function (l) { return !l.hole; }); } catch (e) { return false; } };
        var free = unconsumedSketches().filter(closed);
        if (sid != null) f.dir1 = [sid];
        else f.dir1 = free.slice(-2).map(function (s) { return s.id; });
      }
      initBodyFields(f, existing);
      bfbFocus = null;
      function sk(id) { var s = K.findFeature(App.model, id); return s && s.type === 'sketch' ? s : null; }
      function curveLabel(c) {
        var id = c && typeof c === 'object' ? c.sketch : c, s = sk(id);
        if (c && Array.isArray(c.pts)) return '3D curve (' + c.pts.length + ' points)';
        if (!s) return 'Sketch ' + id + ' (missing)';
        if (c && typeof c === 'object' && c.entity != null) { var e = s.entities[c.entity]; return s.name + ' / ' + (e ? entityLabel(e, +c.entity) : 'Entity' + (+c.entity + 1)); }
        return s.name;
      }
      function shownIds(v) { var ids = v.dir1.slice(); v.dir2.forEach(function (c) { var id = c && typeof c === 'object' ? c.sketch : c; if (id != null) ids.push(id); }); return ids; }
      function toFeature(v) {
        var out = { type: 'boundary', dir1: v.dir1.slice(), dir2: JSON.parse(JSON.stringify(v.dir2)), cut: !!v.cut, merge: v.merge, scope: v.scope };
        Object.keys(v).forEach(function (k) { if (/^body\d+$/.test(k)) out[k] = v[k]; });
        if (v.id != null) out.id = v.id;
        if (v.t1s !== 'none' || v.t1e !== 'none') out.tangency1 = { start: v.t1s, end: v.t1e };
        if (v.t2s !== 'none' || v.t2e !== 'none') out.tangency2 = { start: v.t2s, end: v.t2e };
        if (v.close) out.close = true;
        if (!v.mergeTangent) out.mergeTangent = false;
        if (v.thinOn) out.thin = { t: v.thinT, mid: v.thinType === 'mid', reverse: !!v.thinRev };
        if (v.name) out.name = v.name;
        return applyBodyFields(out, out, !!v.cut);
      }
      function preview() {
        var v = pm.values;
        if (App.command) { App.command.loftIds = shownIds(v); UI.updateSketches(); }
        if (!v.preview) { showPreview(null); UI.setStatus('Preview off. Press Enter or ✓ to accept.'); return; }
        if (v.dir1.length < 2) { showPreview(null); UI.setStatus('Select at least two profiles for Direction 1.'); return; }
        var err = showPreview(toFeature(v));
        UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '. Press Enter or ✓ to accept.');
      }
      function setBox(b) { pm.values.box = b; renderPM(); UI.setStatus(b === 1 ? 'Click the profile sketches in order (Direction 1).' : 'Click the curves that join the profiles (Direction 2).'); }
      function addSketch(id, entity) {
        var v = pm.values, s = sk(id);
        if (!s) return false;
        if (v.box === 1) {
          if (v.dir1.indexOf(id) >= 0) { UI.setStatus(s.name + ' is already a Direction 1 profile.'); return true; }
          v.dir1.push(id);
        } else {
          if (v.dir1.indexOf(id) >= 0) { UI.toast(s.name + ' is a Direction 1 profile; pick a curve for Direction 2.'); return true; }
          var c = entity != null ? { sketch: id, entity: entity } : id;
          if (v.dir2.some(function (x) { return JSON.stringify(x) === JSON.stringify(c); })) return true;
          v.dir2.push(c);
        }
        renderPM(); preview();
        return true;
      }
      function onPick(pk) {
        if (pk.kind === 'sketchEntity') return addSketch(pk.sketch, pm.values.box === 2 ? pk.index : null);
        if (pk.kind === 'feature') return addSketch(pk.id, null);
        return false;
      }
      function move(d) {
        var v = pm.values, list = bfbFocus && bfbFocus.box === 1 ? v.dir1 : bfbFocus && bfbFocus.box === 2 ? v.dir2 : null, i = bfbFocus ? bfbFocus.index : -1, j = i + d;
        if (!list || i < 0 || i >= list.length) { UI.toast('Click a profile in the list first, then Move Up / Move Down.'); return; }
        if (j < 0 || j >= list.length) return;
        var t = list[i]; list[i] = list[j]; list[j] = t;
        bfbFocus.index = j;
        renderPM(); preview();
        var wrap = pm.root.querySelectorAll('.pm-pickwrap')[bfbFocus.box - 1], row = wrap && wrap.querySelector('.pm-item[data-index="' + j + '"]');
        if (row) try { row.focus({ preventScroll: true }); } catch (e) { }
      }
      function box(n) {
        var key = n === 1 ? 'dir1' : 'dir2';
        return { type: 'pick', icon: n === 1 ? 'sketch' : 'spline', placeholder: n === 1 ? 'Select profiles…' : 'Select curves…',
          value: function (v) { var c = v[key].length; return c ? c + (n === 1 ? ' profile' : ' curve') + (c === 1 ? '' : 's') : ''; },
          active: function (v) { return v.box === n; }, onActivate: function () { setBox(n); },
          items: function (v) { return v[key].map(function (x) { return { label: curveLabel(x), icon: n === 1 ? 'sketch' : 'spline' }; }); },
          onRemove: function (v, i) { v[key].splice(i, 1); renderPM(); preview(); },
          onClear: function (v) { v[key].length = 0; renderPM(); preview(); } };
      }
      function tanFields(n) {
        return [{ type: 'select', label: 'Start tangency', key: 't' + n + 's', options: BFB_TAN }, { type: 'select', label: 'End tangency', key: 't' + n + 'e', options: BFB_TAN }];
      }
      openPM({
        title: existing ? existing.name : title, icon: cutNow ? 'boundaryCut' : 'boundary', values: f, bfb: true,
        command: { loftIds: shownIds(f), pickRefGeo: true, refKinds: [], pickSketchRefs: true, onPick: onPick },
        message: 'Direction 1: the <b>profiles</b> (each a sketch with one closed profile), in order. Direction 2 (optional): <b>curves</b> that touch every profile and shape the sides between them. Click a box, then click sketches in the graphics area or the FeatureManager tree.',
        onSelection: function () { if (App.sel && App.sel.kind === 'feature') { var s = sk(App.sel.id); if (s) addSketch(s.id, null); } },
        groups: [
          { title: 'Direction 1', fields: [box(1),
            { type: 'buttons', buttons: [{ label: '▲ Move Up', onclick: function () { move(-1); } }, { label: '▼ Move Down', onclick: function () { move(1); } }] }].concat(tanFields(1)) },
          { title: 'Direction 2', collapsed: !f.dir2.length && !existing, fields: [box(2)].concat(tanFields(2)) },
          { title: 'Options and Preview', fields: [
            { type: 'check', label: 'Merge tangent faces', key: 'mergeTangent' },
            { type: 'check', label: 'Close', key: 'close', disabled: function (v) { return v.dir1.length < 3 || v.dir2.length > 0; } },
            { type: 'check', label: 'Show preview', key: 'preview' },
            mergeField(function (v) { return !v.cut; })
          ] },
          { title: 'Thin Feature', collapsed: !f.thinOn, fields: [
            { type: 'check', label: 'Thin Feature', key: 'thinOn', rerender: true },
            { type: 'select', label: 'Type', key: 'thinType', options: [['one', 'One-Direction'], ['mid', 'Mid-Plane']], show: function (v) { return v.thinOn; }, rerender: true },
            { type: 'check', label: 'Reverse direction', key: 'thinRev', show: function (v) { return v.thinOn && v.thinType !== 'mid'; } },
            { type: 'number', label: 'Thickness', key: 'thinT', unit: 'u', min: 0, show: function (v) { return v.thinOn; } }
          ] },
          scopeGroup(function (v) { return !!v.cut; }),
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut', rerender: true }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function () { preview(); },
        onOK: function (v) {
          if (v.dir1.length < 2) { UI.toast('Select at least two profiles for Direction 1.'); return false; }
          if (v.thinOn && !(+v.thinT > 0) && !(typeof v.thinT === 'string' && /^=/.test(v.thinT))) { UI.toast('Give the thin feature a thickness.'); return false; }
          var out = toFeature(v);
          if (!existing && !out.name) delete out.name;
          if (existing && !out.name) out.name = existing.name;
          return commitFeature(out, existing);
        }
      });
    });
  }
  // UI.cmdBoundary(cut, existing): the ribbon's Boundary Boss/Base (false) and Boundary Cut (true); Edit Feature passes the feature
  UI.cmdBoundary = cmdBoundary;
  // rfFD: Instant3D on a selected face of a fillet / chamfer, shell or pattern (ui-select.js computeHandles turns these
  // into drag handles that edit the committed feature): the handles its PropertyManager shows, from the feature as
  // built. f: the feature; faceIndex: the selected face (one of its own faces) or null (the feature is selected).
  // -> [{ key, label, O, dir, k, value, min } | { type: 'angle', key, label, A, D, c, sign, value, max }]
  function instant3DFeatureHandles(f, faceIndex) {
    if (!f || !App.mesh || !App.build) return [];
    var faces = App.mesh.faces || [], fc = faceIndex != null ? faces[faceIndex] : null;
    if (f.type === 'fillet' || f.type === 'chamfer') {
      var isCh = f.type === 'chamfer', key = isCh ? 'd' : 'r', edges = f.edges || [];
      if (!edges.length) return [];
      // the edge pick nearest the selected face (a fillet of several edges: the arrow sits on the one clicked)
      var spec = edges[0];
      if (fc && fc.centroid) { var bd = Infinity; edges.forEach(function (e) { var d = e.at ? V.len(V.sub(e.at, fc.centroid)) : Infinity; if (d < bd) { bd = d; spec = e; } }); }
      var fr = spec.at ? edgeFrame(spec.at, []) : null;   // the two planar faces through the old sharp edge
      return fr && fr.dir ? [{ key: key, label: isCh ? 'Distance' : 'Radius', O: fr.O, dir: fr.dir, k: 1, value: +f[key], min: 0 }] : [];
    }
    if (f.type === 'shell') {
      // the selected inner wall (else the shell's largest face) moves along its normal: the outer face stays, the
      // arrow's base sits on it (t behind the inner face) and its value is the wall thickness
      var t = +f.thickness, own = function (x) { return x && App.triShared && App.triShared[x.start] === f.id && x.normal && x.centroid; };
      var w = own(fc) ? fc : null;
      if (!w) faces.forEach(function (x) { if (own(x) && (!w || x.area > w.area)) w = x; });
      if (!w || !(t > 0)) return [];
      return [{ key: 'thickness', label: 'Thickness', O: V.sub(w.centroid, V.scale(w.normal, t)), dir: w.normal, k: 1, value: t, min: 0 }];
    }
    if (f.type === 'lpattern') return lpatternHandles(f).map(function (h) { h.label = h.key === 's2' ? 'Spacing 2' : 'Spacing'; return h; });
    if (f.type === 'cpattern') {
      var v = JSON.parse(JSON.stringify(f));
      if (v.center) { v.cx = v.center[0]; v.cy = v.center[1]; v.cz = v.center[2]; }
      axisRefIn(v);
      return cpatternHandles(v);
    }
    return [];
  }
  UI.instant3DFeatureHandles = instant3DFeatureHandles;
  // ------------------------------------------------------------------ rfFA: Curves (Features ▸ Curves, Insert ▸ Curve)
  // Helix and Spiral, Projected Curve, Composite Curve, Curve Through XYZ Points, Curve Through Reference Points as
  // SolidWorks has them: each a PropertyManager making a reference curve feature (kernel-features.js resolveCurve; the
  // record lands in App.build.planes and ui-core draws it). A curve is a Sweep path (the Sweep PM's Path list).
  var FA_TITLES = { helix: 'Helix/Spiral', projCurve: 'Projected Curve', compositeCurve: 'Composite Curve', xyzCurve: 'Curve Through XYZ Points', refPtCurve: 'Curve Through Reference Points' };
  var faSt = { before: null, err: null, preview: null };
  function faCurves(beforeId) {
    var out = [];
    for (var i = 0; i < App.model.features.length; i++) {
      var g = App.model.features[i];
      if (beforeId != null && g.id === beforeId) break;
      if (K.isCurveFeature(g)) out.push(g);
    }
    return out;
  }
  function faCurveOptions(beforeId) { return faCurves(beforeId).map(function (g) { return [g.id, g.name]; }); }
  // the newest curve no sweep follows yet
  function faDefaultPath() {
    var used = {};
    App.model.features.forEach(function (g) { if (g.type === 'sweep' && typeof g.path === 'number') used[g.path] = true; });
    var c = faCurves().filter(function (g) { return !used[g.id]; }).pop();
    return c ? c.id : null;
  }
  function faResolve(v) {
    var b = faSt.before, ctx = { planes: Object.assign({}, (b && b.planes) || {}), sketches: {}, body: b ? b.body : null, units: App.model.units || 'mm' };
    return K.resolveCurve(JSON.parse(JSON.stringify(v)), K.resolvedModel ? K.resolvedModel(App.model).model : App.model, ctx);
  }
  function faPreview(v, title) {
    UI.disposeGroup(UI.groups.preview);
    try {
      var rec = faResolve(v);
      UI.drawRefGeo(rec, UI.groups.preview, 'sel');
      faSt.err = null;
      UI.setStatus(title + ' preview: length ' + UI.fmtNum(rec.length, 4) + ' ' + UI.unitLabel() + (rec.runs.length > 1 ? ', in ' + rec.runs.length + ' pieces' : '') + '. Press Enter or ✓ to accept.');
    } catch (e) { faSt.err = e.message; UI.setStatus('Preview: ' + e.message); }
    if (UI.requestRender) UI.requestRender();
  }
  function faClean(v) {
    var o = JSON.parse(JSON.stringify(v));
    ['clockwise', 'reverse', 'taperOut', 'closed'].forEach(function (k) { if (!o[k]) delete o[k]; });
    if (!o.name) delete o.name;
    delete o.pitchKind;
    return o;
  }
  // the PropertyManager shared by the five: groups, live preview, ✓ refused while the preview fails
  function faOpen(type, existing, f, groups, command, extra) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    faSt.before = refBuildBefore(existing ? existing.id : null); faSt.err = null;
    var title = FA_TITLES[type];
    faSt.preview = function () { faPreview(pm.values, existing ? existing.name : title); };
    var spec = {
      title: existing ? existing.name : title, icon: type, values: f, command: command || null,
      groups: groups.concat([{ title: 'Feature', collapsed: !existing, fields: [{ type: 'text', label: 'Name', key: 'name' }] }]),
      onChange: function () { faSt.preview(); },
      onOK: function (v) {
        if (faSt.err) { UI.toast(faSt.err); return false; }
        return commitFeature(faClean(v), existing);
      },
      onClose: function () { UI.disposeGroup(UI.groups.preview); faSt.preview = null; }
    };
    Object.keys(extra || {}).forEach(function (k) { spec[k] = extra[k]; });
    openPM(spec);
    faSt.preview();
  }
  function faSketchOptions(filter) {
    return function () {
      var list = App.model.features.filter(function (s) { return s.type === 'sketch' && (!filter || filter(s)); });
      return list.length ? list.map(function (s) { return [s.id, s.name]; }) : [[-1, '(no sketches)']];
    };
  }
  function faOneCircle(s) { return (s.entities || []).filter(function (e) { return e.t === 'circle'; }).length === 1; }

  // ---- Helix and Spiral: Defined By, Parameters (constant pitch), Taper Helix
  function cmdHelix(existing) {
    if (isAsm()) { refusePart('Helix and Spiral'); return; }
    withSketch(function (sid) {
      var cands = App.model.features.filter(function (s) { return s.type === 'sketch' && faOneCircle(s); });
      var sk = existing ? existing.sketch : sid != null && cands.some(function (s) { return s.id === sid; }) ? sid : cands.length ? cands[cands.length - 1].id : null;
      if (sk == null) { var msg = 'Helix and Spiral needs a sketch with one circle: sketch a circle (its centre is the axis, its diameter the start diameter), then run Helix and Spiral.'; UI.toast(msg); UI.setStatus(msg); return; }
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'helix', sketch: sk, defineBy: 'pitchRev' };
      var dflt = { pitch: UI.lenDefault(5), revolutions: 4, height: UI.lenDefault(20), startAngle: 0, taper: 0, clockwise: false, reverse: false, taperOut: false };
      Object.keys(dflt).forEach(function (k) { if (f[k] == null) f[k] = dflt[k]; });
      f.pitchKind = 'constant';   // SolidWorks' Constant / Variable pitch: constant only
      var isH = function (v) { return v.defineBy === 'heightRev' || v.defineBy === 'heightPitch'; };
      faOpen('helix', existing, f, [
        { title: 'Defined By', fields: [
          { type: 'select', label: 'Type', key: 'defineBy', rerender: true, options: [['pitchRev', 'Pitch and Revolution'], ['heightRev', 'Height and Revolution'], ['heightPitch', 'Height and Pitch'], ['spiral', 'Spiral']] },
          { type: 'select', label: 'Sketch', key: 'sketch', options: faSketchOptions(faOneCircle) }] },
        { title: 'Parameters', fields: [
          { type: 'radio', key: 'pitchKind', options: [['constant', 'Constant pitch']] },
          { type: 'number', label: 'Height', key: 'height', unit: 'u', min: 0, show: isH },
          { type: 'number', label: 'Pitch', key: 'pitch', unit: 'u', min: 0, show: function (v) { return v.defineBy !== 'heightRev'; } },
          { type: 'check', label: 'Reverse direction', key: 'reverse' },
          { type: 'number', label: 'Revolutions', key: 'revolutions', min: 0, show: function (v) { return v.defineBy !== 'heightPitch'; } },
          { type: 'number', label: 'Start angle', key: 'startAngle', unit: '°' },
          { type: 'radio', key: 'clockwise', options: [[true, 'Clockwise'], [false, 'Counterclockwise']] }] },
        { title: 'Taper Helix', show: function (v) { return v.defineBy !== 'spiral'; }, fields: [
          { type: 'number', label: 'Taper angle', key: 'taper', unit: '°', min: 0 },
          { type: 'check', label: 'Taper outward', key: 'taperOut' }] }
      ], null, { message: 'The helix starts on the circle’s sketch plane, at the start angle, and grows along the sketch normal (Reverse direction: the other way). Its diameter is the circle’s.' });
    });
  }
  // ---- Projected Curve: Sketch on faces / Sketch on sketch
  function cmdProjectedCurve(existing) {
    if (isAsm()) { refusePart('Projected Curve'); return; }
    withSketch(function (sid) {
      var sks = App.model.features.filter(function (s) { return s.type === 'sketch'; });
      if (!sks.length && !existing) { UI.toast('Projected Curve needs a sketch to project.'); return; }
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'projCurve', mode: 'sketchOnFaces', sketch: sid != null ? sid : sks[sks.length - 1].id, faces: [], reverse: false };
      if (!existing && sks.length > 1) f.sketch2 = sks.filter(function (s) { return s.id !== f.sketch; }).pop().id;
      if (!Array.isArray(f.faces)) f.faces = [];
      var tol = function () { return K.pickTol(App.model.units); };
      var faceIdx = function (spec) { try { var b = faSt.before, m = b && b.body ? K.meshFromBody(b.body) : App.mesh; return K.resolveFaces([spec], m, tol())[0]; } catch (e) { return -1; } };
      var onFaces = function (v) { return v.mode !== 'sketchOnSketch'; };
      faOpen('projCurve', existing, f, [
        { title: 'Selections', fields: [
          { type: 'radio', key: 'mode', rerender: true, options: [['sketchOnFaces', 'Sketch on faces'], ['sketchOnSketch', 'Sketch on sketch']] },
          { type: 'select', label: 'Sketch to project', key: 'sketch', options: faSketchOptions() },
          { type: 'pick', icon: 'projCurve', show: onFaces, placeholder: 'Projection faces…', value: function (v) { return v.faces.length ? v.faces.length + ' face' + (v.faces.length > 1 ? 's' : '') : ''; },
            items: function (v) { return v.faces.map(function (s, i) { return { label: 'Face<' + (i + 1) + '>', at: s.at }; }); },
            onRemove: function (v, i) { v.faces.splice(i, 1); renderPM(); faSt.preview(); }, onClear: function (v) { v.faces.length = 0; renderPM(); faSt.preview(); } },
          { type: 'check', label: 'Reverse projection', key: 'reverse', show: onFaces },
          { type: 'select', label: 'Second sketch', key: 'sketch2', options: faSketchOptions(), show: function (v) { return !onFaces(v); } }] }
      ], {
        onPick: function (pk) {
          var v = pm.values;
          if (!onFaces(v) || pk.kind !== 'face' || !pk.point) return false;
          var grp = UI.faceGroup ? UI.faceGroup(pk.index) : [pk.index], hit = -1;
          v.faces.forEach(function (s, i) { if (grp.indexOf(faceIdx(s)) >= 0) hit = i; });
          if (hit >= 0) v.faces.splice(hit, 1); else v.faces.push({ at: pk.point.map(function (x) { return Math.round(x * 1e4) / 1e4; }) });
          renderPM(); faSt.preview();
          return true;
        }
      }, { message: 'Sketch on faces: pick the faces; the sketch is projected onto them along its normal. Sketch on sketch: the curve where the two sketches’ extrusions meet.' });
    });
  }
  // ---- Composite Curve: edges, sketch entities and curves joined end to end
  function faEdgeRef(pk) {
    if (pk.kind === 'sketchEntity') { var r = { sketch: pk.sketch, entity: pk.index }; if (pk.seg != null) r.seg = pk.seg; return r; }
    if (pk.kind === 'feature' && pk.id != null) { var g = K.findFeature(App.model, pk.id); if (K.isCurveFeature(g)) return { curve: g.id }; }
    return refFromPick(pk, 'curve');
  }
  function faRefLabel(r) {
    if (r.curve != null) { var g = K.findFeature(App.model, r.curve); return g ? g.name : 'Curve'; }
    if (r.sketch != null && r.seg == null && r.end == null) {
      var sk = K.findFeature(App.model, r.sketch), e = sk && sk.entities ? sk.entities[r.entity] : null;
      if (e && e.t !== 'line' && e.t !== 'arc' && e.t !== 'circle' && e.t !== 'point') return (e.t.charAt(0).toUpperCase() + e.t.slice(1)) + (r.entity + 1) + '@' + sk.name;
    }
    return refLabel(r);
  }
  function faRefList(key, icon, placeholder) {
    return { type: 'pick', icon: icon, placeholder: placeholder, value: function (v) { return v[key].length ? v[key].length + ' selected' : ''; },
      items: function (v) { return v[key].map(function (r) { return { label: faRefLabel(r), at: r.edge || r.vertex || null }; }); },
      onRemove: function (v, i) { v[key].splice(i, 1); renderPM(); faSt.preview(); }, onClear: function (v) { v[key].length = 0; renderPM(); faSt.preview(); } };
  }
  function faListPick(key, toRef) {
    return function (pk) {
      var v = pm.values, r = toRef(pk);
      if (typeof r === 'string') { UI.setStatus(r); UI.toast(r); return true; }
      var js = JSON.stringify(r), at = -1;
      v[key].forEach(function (x, i) { if (JSON.stringify(x) === js) at = i; });
      if (at >= 0 && key === 'edges') v[key].splice(at, 1); else v[key].push(r);
      renderPM(); faSt.preview();
      return true;
    };
  }
  function cmdCompositeCurve(existing) {
    if (isAsm()) { refusePart('Composite Curve'); return; }
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'compositeCurve', edges: [] };
    var pre = (UI.selection ? UI.selection() : [App.sel]).filter(Boolean);
    faOpen('compositeCurve', existing, f, [{ title: 'Entities to Join', fields: [faRefList('edges', 'compositeCurve', 'Edges, sketch entities or curves…')] }],
      { pickRefGeo: true, refKinds: [], pickEdges: true, pickSketchRefs: true, onPick: faListPick('edges', faEdgeRef) },
      { message: 'Pick the connected edges, sketch lines / arcs / splines or curves to join (in any order). A gap between them is refused.',
        okBlocked: function (v) { return v.edges.length ? null : 'Select the entities to join.'; } });
    if (!existing && pre.length) { pre.forEach(function (pk) { if (App.command && App.command.onPick) App.command.onPick(pk); }); if (UI.setSelection) UI.setSelection([], { quiet: true }); }
  }
  // ---- Curve Through XYZ Points: the point table, Browse… / Save… a .sldcrv text
  function faXyzHtml(v) {
    var u = UI.unitLabel(), rows = v.points.concat([['', '', '']]);
    return '<div class="rfFA-xyz"><table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left">Point</th><th>X (' + u + ')</th><th>Y (' + u + ')</th><th>Z (' + u + ')</th><th></th></tr>' +
      rows.map(function (p, i) {
        return '<tr><td>' + (i < v.points.length ? i + 1 : '*') + '</td>' + [0, 1, 2].map(function (k) {
          return '<td><input class="fa-xyz" data-fa-i="' + i + '" data-fa-k="' + k + '" style="width:100%;box-sizing:border-box" value="' + (p[k] === '' ? '' : UI.fmtNum(+p[k], 6)) + '"></td>';
        }).join('') + '<td>' + (i < v.points.length ? '<button type="button" class="fa-xyz-del" data-fa-i="' + i + '" title="Delete point ' + (i + 1) + '">×</button>' : '') + '</td></tr>';
      }).join('') + '</table></div>';
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('change', function (e) {
      var t = e.target, v = pm.values;
      if (!t || !t.classList || !t.classList.contains('fa-xyz') || !pm.spec || !v || v.type !== 'xyzCurve') return;
      var i = +t.getAttribute('data-fa-i'), k = +t.getAttribute('data-fa-k'), r = UI.parseLength ? UI.parseLength(t.value) : { value: parseFloat(t.value) };
      if (r.error != null || !isFinite(r.value)) { UI.toast('Point ' + (i + 1) + ': ' + (r.error || 'enter a number') + '.'); return; }
      if (i >= v.points.length) v.points.push([0, 0, 0]);
      v.points[i][k] = r.value;
      renderPM(); if (faSt.preview) faSt.preview();
    });
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.fa-xyz-del') : null, v = pm.values;
      if (!t || !pm.spec || !v || v.type !== 'xyzCurve') return;
      v.points.splice(+t.getAttribute('data-fa-i'), 1);
      renderPM(); if (faSt.preview) faSt.preview();
    });
  }
  function faBrowse(v) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.sldcrv,.txt,.csv';
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      file.text().then(function (text) { faLoadText(v, text); });
    });
    inp.click();
  }
  function faLoadText(v, text) {
    try { v.points = K.parseCurveFile(text, App.model.units); } catch (e) { UI.toast(e.message); return false; }
    renderPM(); if (faSt.preview) faSt.preview();
    return true;
  }
  function cmdCurveXYZ(existing) {
    if (isAsm()) { refusePart('Curve Through XYZ Points'); return; }
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'xyzCurve', points: [], closed: false };
    faOpen('xyzCurve', existing, f, [{ title: 'Points', fields: [
      { type: 'html', html: faXyzHtml },
      { type: 'buttons', buttons: [{ label: 'Browse…', onclick: faBrowse }, { label: 'Save…', onclick: function (v) { if (!v.points.length) { UI.toast('No points to save.'); return; } UI.download((v.name || 'curve').replace(/[\\/:*?"<>|]+/g, '_') + '.sldcrv', K.formatCurveFile(v.points, App.model.units), 'text/plain'); } }] },
      { type: 'check', label: 'Closed curve', key: 'closed' }] }], null,
      { message: 'Type X, Y, Z in the last (*) row to add a point; × deletes one. Browse… reads a .sldcrv / .txt file (one point a line: x y z, units optional).',
        okBlocked: function (v) { return v.points.length >= 2 ? null : 'Enter at least two points.'; } });
  }
  // ---- Curve Through Reference Points: picked sketch points, vertices and reference points
  function cmdCurveRefPoints(existing) {
    if (isAsm()) { refusePart('Curve Through Reference Points'); return; }
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'refPtCurve', points: [], closed: false };
    faOpen('refPtCurve', existing, f, [{ title: 'Through Points', fields: [faRefList('points', 'refPoint', 'Sketch points, vertices or points…'), { type: 'check', label: 'Closed curve', key: 'closed' }] }],
      { pickRefGeo: true, refKinds: ['point'], pickVertices: true, pickSketchRefs: true, onPick: faListPick('points', function (pk) { return refFromPick(pk, 'point'); }) },
      { message: 'Pick the points the curve passes through, in order: sketch points, line ends, vertices or reference points.',
        okBlocked: function (v) { return v.points.length >= 2 ? null : 'Select at least two points.'; } });
  }
  function faEdit(f) {
    ({ helix: cmdHelix, projCurve: cmdProjectedCurve, compositeCurve: cmdCompositeCurve, xyzCurve: cmdCurveXYZ, refPtCurve: cmdCurveRefPoints })[f.type](f);
  }
  // the Curves flyout's face starts as Helix and Spiral (its first row, Split Line, is SolidWorks' and greyed)
  try { if (typeof localStorage !== 'undefined' && localStorage.getItem('anvil.fly.curves') == null) localStorage.setItem('anvil.fly.curves', '5'); } catch (e) { }
  UI.cmdHelix = cmdHelix; UI.cmdProjectedCurve = cmdProjectedCurve; UI.cmdCompositeCurve = cmdCompositeCurve; UI.cmdCurveXYZ = cmdCurveXYZ; UI.cmdCurveRefPoints = cmdCurveRefPoints;
  UI.curveXYZLoadText = function (text) { return pm.values && pm.values.type === 'xyzCurve' ? faLoadText(pm.values, text) : false; };
  // ------------------------------------------------------------------ rfDZ: Wrap
  // Insert ▸ Features ▸ Wrap (Features tab ▸ Wrap): SolidWorks' PropertyManager — Wrap Type (Emboss / Deboss / Scribe),
  // Wrap Method (Analytical), Wrap Parameters (Source Sketch, Face for Wrap Sketch, Thickness, Reverse direction).
  // The sketch: the one selected / being edited, else the last unconsumed one; the face: a click on the part. Live
  // preview: the material added (emboss) or removed (deboss), a thin skin for a scribe.
  var wrapLast = {};
  function cmdWrap(existing) {
    withSketch(function (sid) {
      if (!App.build || !App.build.body || !App.build.body.polygons.length) { UI.toast('Wrap needs a body to wrap the sketch onto: make a solid first.'); return; }
      var inch = App.model.units === 'in';
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'wrap', sketch: pickDefaultSketch(sid), face: null, mode: wrapLast.mode || 'emboss',
        thickness: wrapLast.thickness != null ? wrapLast.thickness : (inch ? 0.02 : 0.5) };
      if (f.sketch == null) { UI.toast('Sketch the contours (or Sketch Text) to wrap first, on a plane tangent to the face, then click Wrap.'); return; }
      if (f.thickness == null) f.thickness = inch ? 0.02 : 0.5;
      f.reverse = !!f.reverse; f.method = 'analytical';
      var base = null;
      function baseBody() { if (!base) base = existing ? bodyBefore(existing.id) : App.build.body; return base; }
      function featOf(v) {
        var out = { type: 'wrap', sketch: v.sketch, face: v.face ? v.face.slice() : null, mode: v.mode };
        if (v.mode !== 'scribe') out.thickness = v.thickness;
        if (v.reverse) out.reverse = true;
        if (v.name) out.name = v.name;
        return out;
      }
      function wctx() { return { body: baseBody(), sketches: {}, planes: (App.build && App.build.planes) || {}, units: App.model.units, warnings: {} }; }
      function preview() {
        var v = pm.values || f;
        if (v.face) ufLit([v.face], 0); else if (App.command) { App.command.faceList = []; UI.updateHighlights(); }
        UI.disposeGroup(UI.groups.preview);
        if (v.sketch == null || v.sketch < 0) { UI.setStatus('Wrap: select the source sketch.'); return; }
        if (!v.face) { UI.setStatus('Wrap: click the face to wrap the sketch onto (cylindrical, conical or planar).'); return; }
        try {
          var feat = featOf(v);
          // a scribe shows its contours as a thin skin on the face
          if (feat.mode === 'scribe') { feat.mode = 'emboss'; feat.thickness = inch ? 0.002 : 0.05; }
          var r = K.buildWrap(feat, previewModel(), wctx());
          if (r.tool && r.tool.polygons.length) addPreviewMesh(r.tool, v.mode === 'deboss' ? UI.mats.previewCut : UI.mats.preview);
          UI.setStatus('Wrap (' + v.mode + '): press Enter or ✓ to accept.');
        } catch (e) { UI.setStatus('Preview: ' + e.message); }
      }
      function pick(pk) {
        if (pk.kind !== 'face' || !pk.point) return false;
        pm.values.face = pk.point.map(function (x) { return Math.round(x * 1e6) / 1e6; });
        renderPM(); preview();
        return true;
      }
      openPM({
        title: existing ? existing.name : 'Wrap', icon: 'wrap', values: f,
        onRollback: function () { base = null; },
        message: 'Wraps the closed contours of a sketch (Sketch Text too) onto a <b>cylindrical</b>, <b>conical</b> or <b>planar</b> face, keeping their length along the surface. Sketch on a plane tangent to the face, then click the face.',
        command: { sketchId: f.sketch, faceList: [], onPick: pick },
        groups: [
          { title: 'Wrap Type', fields: [{ type: 'radio', key: 'mode', options: [['emboss', 'Emboss'], ['deboss', 'Deboss'], ['scribe', 'Scribe']], rerender: true }] },
          { title: 'Wrap Method', fields: [{ type: 'radio', key: 'method', options: [['analytical', 'Analytical']] }] },
          { title: 'Wrap Parameters', fields: [
            sketchPickerField(f),
            { type: 'pick', icon: 'wrap', placeholder: 'Face for wrap sketch…',
              value: function (v) { return v.face ? 'Face<1>' : ''; },
              items: function (v) { return v.face ? [{ label: 'Face<1>', at: v.face }] : []; },
              onRemove: function (v) { v.face = null; renderPM(); preview(); },
              onClear: function (v) { v.face = null; renderPM(); preview(); } },
            { type: 'number', label: 'Thickness', key: 'thickness', unit: 'u', min: 0, show: function (v) { return v.mode !== 'scribe'; } },
            { type: 'check', label: 'Reverse direction', key: 'reverse', show: function (v) { return v.mode !== 'scribe'; } }
          ] },
          { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v, key) {
          if (key === 'sketch' && App.command) { App.command.sketchId = v.sketch; UI.updateSketches(); }
          if (key === 'mode') renderPM();
          preview();
        },
        onOK: function (v) {
          if (v.sketch == null || v.sketch < 0) { UI.toast('Select the sketch to wrap.'); return false; }
          if (!v.face) { UI.toast('Click the face to wrap the sketch onto.'); return false; }
          if (v.mode !== 'scribe' && !(+v.thickness > 0)) { UI.toast('The thickness must be more than 0.'); return false; }
          var feat = featOf(v);
          try { K.buildWrap(feat, previewModel(), wctx()); } catch (e) { UI.toast(e.message); return false; }
          wrapLast = { mode: v.mode, thickness: v.mode !== 'scribe' ? v.thickness : wrapLast.thickness };
          return commitFeature(feat, existing);
        }
      });
      preview();
    });
  }
  UI.cmdWrap = partOnly(cmdWrap, 'Wrap');
})(UI);

// rfFC: Suppress / Unsuppress / Unsuppress with Dependents (SolidWorks Edit ▸ Suppress, the FeatureManager right-click).
// A part feature's state lives in the kernel (f.suppressed, configuration.suppressed; Kernel.setSuppressed). Suppress
// takes the feature's children with it, each stored suppressed as SolidWorks does: the features that reference it by id
// (Kernel.featureChildren) and the features whose face / edge picks lie on faces it made (Kernel.suppressWithChildren,
// kernel-rebuild.js, which p.suppress uses too). Unsuppress also unsuppresses the suppressed features
// it needs (its sketch …); Unsuppress with Dependents also its children. scope: 'this' | 'all' | [configuration
// names]. Every call is one undo step and one rebuild.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, el = UI.el;
  function isPart() { return !!(App.model && App.model.type !== 'assembly' && K.suppressedIds); }
  function suppressedNow() { return isPart() ? K.suppressedIds(App.model) : {}; }
  UI.isSuppressed = function (id) { return !!suppressedNow()[id]; };
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = true; o.push(x); } }); return o; }
  function selectedFeatureIds() {
    var list = UI.selection ? UI.selection() : (App.sel ? [App.sel] : []);
    var ids = list.filter(function (s) { return s && s.kind === 'feature' && s.id != null; }).map(function (s) { return s.id; });
    if (!ids.length && App.sel && App.sel.kind === 'feature') ids = [App.sel.id];
    return uniq(ids).filter(function (id) { return K.findFeature(App.model, id); });
  }
  function scopeText(scope) { return scope === 'all' || !(K.configurationList(App.model) || []).length ? '' : scope === 'this' ? ' in this configuration' : ' in ' + scope.join(', '); }
  // setSuppression(ids, on, scope?, dependents?) -> the rebuild Promise
  function setSuppression(ids, on, scope, dependents) {
    if (!isPart()) return Promise.reject(new Error('Suppress works on part features.'));
    ids = uniq((Array.isArray(ids) ? ids : [ids]).map(function (r) { var f = typeof r === 'object' ? r : (K.findFeature(App.model, r) || App.model.features.filter(function (x) { return x.name === String(r); })[0]); return f ? f.id : null; }).filter(function (x) { return x != null; }));
    if (!ids.length) return Promise.reject(new Error('Select a feature to ' + (on ? 'suppress' : 'unsuppress') + '.'));
    if (scope == null) scope = (K.configurationList(App.model) || []).length ? 'this' : 'all';
    var m = App.model;
    UI.pushUndo();
    var all = K.suppressWithChildren(m, ids, !!on, scope, { dependents: !!dependents });   // rfFC2: the kernel helper p.suppress uses too
    if (on && App.sel && App.sel.kind !== 'feature') { App.sel = null; App.sel2 = null; }
    var names = ids.map(function (id) { return K.findFeature(m, id).name; }).join(', ');
    var more = all.length - ids.length;
    var msg = (on ? 'Suppressed ' : 'Unsuppressed ') + names + (more ? ' and ' + more + (on ? ' dependent' : ' related') + ' feature' + (more === 1 ? '' : 's') : '') + scopeText(scope) + '.';
    return UI.afterRebuild(UI.rebuild(), function () { if (UI.refreshTree) UI.refreshTree(); if (UI.refreshConfigPanel) UI.refreshConfigPanel(); UI.setStatus(msg); });
  }
  // Specify Configurations: a modal with one check box per configuration
  function specifyConfigs(title, onOk) {
    var list = K.configurationList(App.model) || [], ac = K.activeConfiguration(App.model);
    var box = el('div', { id: 'fc-spec' }, [el('p', { text: 'Apply to these configurations:' })]);
    list.forEach(function (c) {
      var cb = el('input', { type: 'checkbox', 'data-name': String(c.name) });
      cb.checked = !!(ac && String(ac.name) === String(c.name));
      box.appendChild(el('label', { class: 'fc-spec-row' }, [cb, el('span', { text: ' ' + c.name })]));
    });
    UI.showModal({ title: title, body: box, buttons: [
      { id: 'fc-spec-ok', label: 'OK', primary: true, action: function () { var names = Array.prototype.filter.call(box.querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return i.getAttribute('data-name'); }); UI.closeModal(); if (names.length) onOk(names); else UI.toast('No configuration checked: nothing changed.'); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  function run(p) { return p.catch(function (e) { UI.toast(e.message || String(e)); }); }
  // the menu rows for feature(s): Suppress … or Unsuppress … (with the configuration choices when there are any)
  function suppressMenuItems(f) {
    if (!isPart()) return [];
    var ids = f ? [f.id] : selectedFeatureIds();
    if (!ids.length) return [];
    var sup = suppressedNow(), anyOn = ids.some(function (id) { return sup[id]; }), cfgs = (K.configurationList(App.model) || []).length > 0;
    function trio(label, on, dep) {
      var go = function (scope) { return function () { run(setSuppression(ids, on, scope, dep)); }; };
      if (!cfgs) return [{ label: label, action: go('all') }];
      return [{ label: label, action: go('this') }, { label: label + ' ▸ All Configurations', action: go('all') },
        { label: label + ' ▸ Specify Configurations…', action: function () { specifyConfigs(label, function (names) { run(setSuppression(ids, on, names, dep)); }); } }];
    }
    return anyOn ? trio('Unsuppress', false, false).concat(trio('Unsuppress with Dependents', false, true)) : trio('Suppress', true, false);
  }
  // Edit menu rows (ui-panels.js partMenus): Suppress / Unsuppress / Unsuppress with Dependents, greyed without a
  // selected feature
  UI.suppressEditItems = function () {
    if (!isPart() || App.mode === 'sketch') return [];
    var items = suppressMenuItems(null);
    if (!items.length) items = [{ label: 'Suppress', disabled: true }, { label: 'Unsuppress', disabled: true }];
    return items.concat([{ sep: true }]);
  };
  UI.setSuppression = setSuppression;
  UI.suppressFeature = function (ids, scope) { return setSuppression(ids, true, scope, false); };
  UI.unsuppressFeature = function (ids, scope, dependents) { return setSuppression(ids, false, scope, !!dependents); };
  UI.suppressMenuItems = suppressMenuItems;
  UI.suppressionChildren = function (ids, scope) { return K.suppressionChildren(App.model, Array.isArray(ids) ? ids : [ids], scope || 'all'); };
})(UI);
