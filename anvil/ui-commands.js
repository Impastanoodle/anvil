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
  function openPM(spec) {
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
  function pmArm(inp) { if (inp && inp.tagName === 'INPUT') inp._armed = inp.value; }
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
    var head = el('div', { class: 'pm-head', html: Icons(spec.icon || 'generic', 20) + '<span>' + spec.title + '</span>' });
    head.appendChild(el('button', { class: 'pm-help', title: 'Help', 'aria-label': 'Help', onclick: function () { var sm = document.getElementById('status-msg'); UI.toast(spec.help || (spec.title + ': ' + (sm && sm.textContent && sm.textContent !== 'Ready' ? sm.textContent : 'fill the boxes below, then ✓ (Enter) to accept or ✗ (Esc) to cancel.'))); } }));
    root.appendChild(head);
    var actions = el('div', { class: 'pm-actions' });
    actions.appendChild(el('button', { title: 'OK (Enter)', class: 'pm-ok', html: Icons('ok', 20), onclick: pmOK }));
    actions.appendChild(el('button', { title: 'Cancel (Esc)', class: 'pm-cancel', html: Icons('cancel', 18), onclick: pmCancel }));
    if (spec.extraActions) spec.extraActions.forEach(function (a) { actions.appendChild(el('button', { title: a.title, html: Icons(a.icon, 20), onclick: a.onclick })); });
    // rfBG: a PropertyManager that stays open after ✓ (Mate, Insert Component) shows SolidWorks' pressed Keep Visible pin
    if (spec.keepVisible) actions.appendChild(el('button', { class: 'pm-pin on', title: 'Keep Visible: this PropertyManager stays open after ✓ for the next one; ✗ (Esc) closes it', 'aria-pressed': 'true', html: Icons('fix', 16) }));
    root.appendChild(actions);
    // rfC: the Message box (SolidWorks' yellow Message group; its title is drawn by the stylesheet, so the text read
    // from .pm-msg is the message alone)
    if (spec.message) root.appendChild(el('div', { class: 'pm-msg' + (spec.messageOk ? ' ok' : ''), role: 'status', html: spec.message }));
    (spec.groups || []).forEach(function (g) {
      if (g.show && !g.show(pm.values)) return;   // a group may hide itself, like a field
      var folded = pm.collapsed && pm.collapsed[g.title] != null ? pm.collapsed[g.title] : !!g.collapsed;
      // rfC: a group titled Message (Insert Line …) gets the yellow Message look; the collapse arrow is SolidWorks'
      // round chevron at the right of the blue header band (drawn by the stylesheet: the header's text is its title)
      var box = el('div', { class: 'pm-group' + (folded ? ' collapsed' : '') + (g.title === 'Message' ? ' pm-group-msg' : '') });
      var h = el('h4', { html: '<span class="pm-gt"></span><span class="tw" aria-hidden="true"></span>' });
      h.firstChild.textContent = g.title;
      h.setAttribute('aria-expanded', folded ? 'false' : 'true');
      h.addEventListener('click', function () {
        var c = box.classList.toggle('collapsed');
        if (pm.collapsed) pm.collapsed[g.title] = c;
        h.setAttribute('aria-expanded', c ? 'false' : 'true');
      });
      box.appendChild(h);
      var fields = el('div', { class: 'pm-fields' });
      g.fields.forEach(function (f) {
        if (f.show && !f.show(pm.values)) return;
        fields.appendChild(renderField(f));
      });
      box.appendChild(fields);
      root.appendChild(box);
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
        return el('div', { class: 'pm-row pm-row-num' }, [el('label', { text: f.label }), wrap, hint]);
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
        return el('div', { class: 'pm-row' }, [el('label', { text: f.label }), sel]);
      }
      case 'check': {
        // f.disabled (bool or fn(v)): a greyed box that keeps its state (DXF/DWG Output's "Geometry", always on)
        var cb = el('input', { type: 'checkbox', 'data-key': f.key || '' });
        cb.checked = !!v[f.key];
        var cbOff = typeof f.disabled === 'function' ? f.disabled(v) : !!f.disabled;
        if (cbOff) cb.disabled = true;
        cb.addEventListener('change', function () { changed(cb.checked); });
        return el('div', { class: 'pm-row check' + (cbOff ? ' disabled' : '') }, [cb, el('label', { text: f.label, onclick: function () { if (!cbOff) cb.click(); } })]);
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
          var ib = el('button', { type: 'button', title: o[1], 'aria-label': o[1], role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-key': f.key + ':' + o[0], html: Icons(o[2] || 'generic', 18) });
          if (on) ib.classList.add('on');
          ib.addEventListener('click', function () { if (String(v[f.key]) === String(o[0])) return; changed(o[0]); if (!f.rerender && pm.spec) renderPM(); });
          ibox.appendChild(ib);
        });
        return el('div', { class: 'pm-row' }, [el('label', {}, [document.createTextNode(f.label), el('div', { class: 'static', text: curName })]), ibox]);
      }
      case 'text': {
        var t = el('input', { type: 'text', value: v[f.key] || '', 'data-key': f.key || '' });
        t.addEventListener('input', function () { changed(t.value); });
        return el('div', { class: 'pm-row' }, [el('label', { text: f.label }), t]);
      }
      case 'static':
        return el('div', { class: 'pm-row' }, [el('label', { text: f.label }), el('span', { class: 'static', text: typeof f.value === 'function' ? f.value(v) : f.value })]);
      case 'pick': {
        var txt = typeof f.value === 'function' ? f.value(v) : f.value;
        var pickBox = el('div', { class: 'pm-pick' + (txt ? ' filled' : '') + (f.active && f.active(v) ? ' active' : ''), html: Icons(f.icon || 'plane', 16) + '<span>' + (txt || f.placeholder || 'Select…') + '</span>' });
        // a PM with two selection boxes (Mirror Entities): clicking a box makes it the one graphics-area picks go to
        if (f.onActivate) { pickBox.classList.add('clickable'); pickBox.addEventListener('click', function () { f.onActivate(v); }); }
        return f.items ? pickList(f, pickBox) : pickBox;
      }
      case 'buttons': {
        var row = el('div', { class: 'pm-btns' });
        f.buttons.forEach(function (b) {
          var bt = el('button', { text: b.label, onclick: function () { b.onclick(v); } });
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
    return App.model.features.filter(function (f) { return f.type !== 'sketch' && f.type !== 'plane'; });
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
      if (f && f.type !== 'sketch' && f.type !== 'plane') return f.id;
    }
    if (App.sel && App.sel.kind === 'face' && App.mesh) {
      var id = App.triShared[App.mesh.faces[App.sel.index].start];
      if (id >= 0) return id;
    }
    return null;
  }
  function commitFeature(f, existing) {
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
    var pre = sketchSelectionIndices(f), cls = pre.filter(function (i) { var e = f.entities[i]; return e.t === 'line' && e.construction; }), axis0 = '';
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
        return applyBodyFields(out, v, !!v.cut);
      }
      function isSheetCut(v) { return !!v.cut && !!App.model.sheet; }
      function isCutPM(v) { return !!v.cut; }
      function isBossPM(v) { return !v.cut; }
      openPM({
        title: existing ? existing.name : title, icon: f.cut ? 'cut' : 'extrude', values: f,
        command: { sketchId: f.sketch }, handles: extrudeHandles,
        groups: [
          { title: 'From', fields: [{ type: 'static', label: 'Start', value: 'Sketch Plane' }, sketchPickerField(f)] },
          {
            title: 'Direction 1', fields: [
              { type: 'select', label: 'End condition', key: 'end', options: [['blind', 'Blind'], ['through', 'Through All'], ['mid', 'Mid Plane']], rerender: true },
              { type: 'number', label: 'Depth  D1', key: 'depth', unit: 'u', min: 0, show: function (v) { return v.end !== 'through'; } },
              { type: 'check', label: 'Reverse direction', key: 'reverse' },
              mergeField(isBossPM)
            ]
          },
          {
            title: 'Direction 2', fields: [
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
            title: 'Draft', collapsed: !f.draftOn, fields: [
              { type: 'check', label: 'Draft on', key: 'draftOn', rerender: true },
              { type: 'number', label: 'Draft angle', key: 'draft', unit: '°', min: 0, show: function (v) { return v.draftOn; } },
              { type: 'check', label: 'Draft outward', key: 'draftOut', show: function (v) { return v.draftOn; } }
            ]
          },
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut', rerender: true }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v) { App.command.sketchId = v.sketch; UI.updateSketches(); var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '. Press Enter or ✓ to accept.'); },
        onOK: function (v) { var feat = toFeature(v); if (!feat.name) delete feat.name; return commitFeature(feat, existing); }
      });
    });
  }

  // ------------------------------------------------------------------ revolve
  function revolveAxisOptions(v) {
    var opts = [['y', 'Sketch vertical axis (Y)'], ['x', 'Sketch horizontal axis (X)']];
    var s = K.findFeature(App.model, v.sketch);
    if (s) s.entities.forEach(function (e, i) { if (e.t === 'line') opts.push([i, 'Line ' + (i + 1) + '  (' + UI.fmtNum(e.x1, 1) + ', ' + UI.fmtNum(e.y1, 1) + ') → (' + UI.fmtNum(e.x2, 1) + ', ' + UI.fmtNum(e.y2, 1) + ')']); });
    return opts;
  }
  function cmdRevolve(cut, existing) {
    withSketch(function (sid) {
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'revolve', cut: !!cut, angle: 360, axis: 'y', reverse: false, sketch: pickDefaultSketch(sid) };
      if (existing) delete f.profile;
      if (f.sketch == null) { UI.toast('No sketch available. Draw a sketch first.'); return; }
      var title = f.cut ? 'Cut-Revolve' : 'Revolve';
      initBodyFields(f, existing);
      function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(v)), v, !!v.cut); }
      openPM({
        title: existing ? existing.name : title, icon: f.cut ? 'revolveCut' : 'revolve', values: f, command: { sketchId: f.sketch }, handles: revolveHandles,
        groups: [
          { title: 'Axis of Revolution', fields: [sketchPickerField(f), { type: 'select', label: 'Axis', key: 'axis', options: revolveAxisOptions }] },
          { title: 'Direction 1', fields: [{ type: 'number', label: 'Angle', key: 'angle', unit: '°', min: 0 }, { type: 'check', label: 'Reverse direction', key: 'reverse' }, mergeField(function (v) { return !v.cut; })] },
          scopeGroup(function (v) { return !!v.cut; }),
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut', rerender: true }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v, key) { if (key === 'sketch') { renderPM(); } App.command.sketchId = v.sketch; UI.updateSketches(); var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '.'); },
        onOK: function (v) { if (!v.name) delete v.name; if (typeof v.axis === 'string' && /^\d+$/.test(v.axis)) v.axis = +v.axis; return commitFeature(applyBodyFields(v, v, !!v.cut), existing); }
      });
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
      if (sketches.length < 2 && !existing) { UI.toast('A sweep needs a profile sketch and a path sketch (lines/arcs).'); return; }
      var free = unconsumedSketches();
      // default pairing: the most recent unconsumed sketch with a closed profile is the profile, the other one the path
      var cands = (free.length >= 2 ? free : sketches).slice(-2);
      function closedLoops(s) { try { return K.sketchProfile(s).loops.length; } catch (e) { return 0; } }
      var prof = cands[cands.length - 1], path = cands[0];
      if (cands.length === 2 && closedLoops(prof) === 0 && closedLoops(path) > 0) { prof = cands[0]; path = cands[1]; }
      if (sid != null) { prof = K.findFeature(App.model, sid) || prof; path = (free.length >= 2 ? free : sketches).filter(function (s) { return s.id !== sid; }).slice(-1)[0] || path; }
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'sweep', cut: !!cut, profile: prof.id, path: path.id };
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
            { type: 'select', label: 'Path', key: 'path', options: function (v) { return allSketchesField('Path', 'path', 'profile')(v).options; }, show: function (v) { return !Array.isArray(v.path); } },
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
    if (!needSource(f)) return;
    initBodyFields(f, existing);
    function norm(v) { v.center = [+v.cx || 0, +v.cy || 0, +v.cz || 0]; return v; }
    function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(norm(v))), v, featureIsCut(v)); }
    openPM({
      title: existing ? existing.name : 'Circular Pattern', icon: 'cpattern', values: f, handles: cpatternHandles,
      groups: [
        { title: 'Features to Pattern', fields: [Object.assign(sourceField(f), { rerender: true })] },
        { title: 'Direction 1', fields: [{ type: 'select', label: 'Axis', key: 'axis', options: [['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']] }, { type: 'number', label: 'Angle', key: 'angle', unit: '°' }, { type: 'number', label: 'Instances', key: 'n', step: 1, min: 2 }, { type: 'check', label: 'Equal spacing', key: 'equal' }, mergeField(featureIsBoss)] },
        { title: 'Axis point', fields: [{ type: 'number', label: 'X', key: 'cx', unit: 'u' }, { type: 'number', label: 'Y', key: 'cy', unit: 'u' }, { type: 'number', label: 'Z', key: 'cz', unit: 'u' }] },
        scopeGroup(featureIsCut),   // a pattern of a cut is itself a cut
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { var err = showPreview(toFeature(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing circular pattern.'); },
      onOK: function (v) { norm(v); delete v.cx; delete v.cy; delete v.cz; if (!v.name) delete v.name; return commitFeature(applyBodyFields(v, v, featureIsCut(v)), existing); }
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
  var SHEET_PM_KEYS = ['thickness', 'bendRadius', 'kFactor', 'baType', 'bendAllowance', 'bendDeduction', 'bendTable', 'useGauge', 'gaugeTable', 'customGauge', 'gauge'];
  var EXAMPLE_NOTE = 'example — replace with your shop\'s values';
  // a new part's sheet: 2 mm (or 3/32 in) thick, R = T, K = 0.5
  function defaultSheet() { var t = UI.lenDefault(2); return { thickness: t, bendRadius: t, kFactor: K.DEFAULT_K_FACTOR }; }
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
    return v;
  }
  function gaugeRef(v) { return v.gaugeTable === '__custom' ? v.customGauge : v.gaugeTable; }
  // model.sheet from the PM values; `exprs` keeps equation fields as their text (on ✓), else the evaluated numbers
  function sheetFromValues(v, exprs) {
    function val(k) { return exprs ? pmExpr(k, +v[k]) : +v[k]; }
    return K.makeSheet({ thickness: val('thickness'), bendRadius: val('bendRadius'), kFactor: val('kFactor'), bendAllowanceType: v.baType,
      bendAllowance: val('bendAllowance'), bendDeduction: val('bendDeduction'), bendTable: v.bendTable,
      gaugeTable: v.useGauge ? gaugeRef(v) : null, gauge: v.useGauge ? v.gauge : null });
  }
  // a gauge pick fills T, R and K (or BD) from the table's row
  function applyGauge(v) {
    var row = K.gaugeRow(gaugeRef(v), v.gauge, App.model.units);
    if (!row) return false;
    ['thickness', 'bendRadius', 'kFactor', 'bendDeduction'].forEach(function (k) { if (pm.exprs) { delete pm.exprs[k]; delete pm.exprErrors[k]; } });
    v.thickness = Math.round(row.thickness * 1e6) / 1e6; v.bendRadius = Math.round(row.radius * 1e6) / 1e6;
    if (row.bendDeduction != null) { v.bendDeduction = Math.round(row.bendDeduction * 1e6) / 1e6; v.baType = 'deduction'; }
    else { v.kFactor = row.kFactor; if (v.baType !== 'table') v.baType = 'kfactor'; }
    return true;
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
      { title: 'Sheet Metal Gauges', fields: [
        { type: 'check', label: 'Use gauge table', key: 'useGauge', rerender: true },
        { type: 'select', label: 'Table', key: 'gaugeTable', options: gaugeTableOptions, rerender: true, show: function (v) { return v.useGauge; } },
        { type: 'select', label: 'Gauge', key: 'gauge', options: gaugeOptions, rerender: true, show: function (v) { return v.useGauge; } },
        { type: 'html', html: '<div class="pm-note" style="margin:2px 0 4px">Thicknesses are the published standard gauges; the bend radius and K-factor in this table are an <b>' + EXAMPLE_NOTE + '</b>.</div>', show: function (v) { return v.useGauge && isBuiltIn(v); } },
        { type: 'buttons', show: function (v) { return v.useGauge; }, buttons: [{ label: 'Edit gauge table…', onclick: editGaugeTable }] }
      ] },
      { title: 'Sheet Metal Parameters', fields: [{ type: 'number', label: 'Thickness  T', key: 'thickness', unit: 'u', min: 0 }, { type: 'number', label: 'Bend radius', key: 'bendRadius', unit: 'u', min: 0 }].concat(extra || []) },
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
      ] }
    ];
  }
  function smEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function flatSizeText(flat) { return 'Flat size ' + UI.fmtNum(flat.size[0], 4) + ' × ' + UI.fmtNum(flat.size[1], 4) + ' ' + UI.unitLabel(); }
  UI.flatSizeText = flatSizeText;

  // ------------------------------------------------------------------ sheet metal: base flange = thin extrude with sheet parameters
  function cmdBaseFlange() {
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
      function feature(v) { var o = {}; Object.keys(v).forEach(function (k) { if (SHEET_PM_KEYS.indexOf(k) < 0) o[k] = v[k]; }); return o; }
      openPM({
        title: 'Base Flange/Tab', icon: 'flange', values: f, command: { sketchId: f.sketch },
        groups: [{ title: 'Sketch', fields: [sketchPickerField(f)] }].concat(sheetGroups([{ type: 'check', label: 'Reverse direction', key: 'reverse' }])),
        onChange: function (v, key) {
          if (v.useGauge && (key === 'useGauge' || key === 'gaugeTable' || key === 'gauge') && applyGauge(v)) renderPM();
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
        if (v.useGauge && (key === 'useGauge' || key === 'gaugeTable' || key === 'gauge') && applyGauge(v)) renderPM();
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
  var HEM_TYPES = [['closed', 'Closed', 'hemClosed'], ['open', 'Open', 'hemOpen'], ['teardrop', 'Tear Drop', 'hemTeardrop'], ['rolled', 'Rolled', 'hemRolled']];
  var HEM_POSITIONS = [['inside', 'Material Inside', 'hemInside'], ['outside', 'Bend Outside', 'hemOutside']];
  var HEM_ANGLE = { teardrop: 200, rolled: 270 };   // SolidWorks' starting angles of a Tear Drop and a Rolled hem
  // p9-pm: the Edge Flange and Hem PropertyManagers start with the values last accepted in this session, as SolidWorks
  // does (per document units: a length remembered in inches is not offered to a millimetre part)
  var smMemory = { flange: null, hem: null };
  var FLANGE_MEMORY_KEYS = ['length', 'angle', 'position', 'lengthRef', 'relief', 'useDefaultReliefWidth', 'reliefWidthValue', 'useDefaultReliefDepth', 'reliefDepthValue'];
  var HEM_MEMORY_KEYS = ['hemType', 'hemPosition', 'length', 'gap', 'hemRadius', 'hemAngle'];
  // UI.sheetMetalMemory() -> copy of what is remembered; UI.sheetMetalMemory(null) forgets it (tests)
  UI.sheetMetalMemory = function (set) {
    if (set === null) smMemory = { flange: null, hem: null };
    return JSON.parse(JSON.stringify(smMemory));
  };
  function cmdEdgeFlange(existing, kind) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.edges || !App.edges.length) { UI.toast('Create a Base Flange first.'); return; }
    var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;   // resolved: the sheet parameters may be equations
    kind = existing ? (existing.type === 'jog' ? 'jog' : existing.hem ? 'hem' : existing.miter ? 'miter' : 'flange') : (kind || 'flange');
    var isHem = kind === 'hem', isJog = kind === 'jog', isMiter = kind === 'miter', isFlange = !isHem && !isJog;
    var f = existing ? JSON.parse(JSON.stringify(existing)) :
      isJog ? { type: 'jog', edges: [], height: UI.lenDefault(10), length: UI.lenDefault(20), angle: 90, reverse: false, radius: null, position: 'bendOutside' } :
      isHem ? { type: 'flange', hem: true, edges: [], length: UI.lenDefault(10), angle: 180, reverse: false, radius: T / 4, position: 'bendOutside', hemType: 'closed', hemPosition: 'inside' } :
      { type: 'flange', edges: [], length: UI.lenDefault(20), angle: 90, reverse: false, radius: null, position: 'bendOutside', lengthRef: 'outer', miter: isMiter, miterGap: 0, relief: 'none', reliefWidth: null, reliefDepth: null };
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
    if (isFlange) {
      // older flanges lack the miter/relief fields: fill the defaults, then split relief sizes into UI-only check + value pairs
      if (f.miter == null) f.miter = false;
      if (f.miterGap == null) f.miterGap = 0;
      if (!f.relief) f.relief = 'none';
      if (f.reliefWidth === undefined) f.reliefWidth = null;
      if (f.reliefDepth === undefined) f.reliefDepth = null;
      f.useDefaultReliefWidth = f.reliefWidth == null;
      f.reliefWidthValue = f.reliefWidth != null ? f.reliefWidth : T;
      f.useDefaultReliefDepth = f.reliefDepth == null;
      f.reliefDepthValue = f.reliefDepth != null ? f.reliefDepth : T / 2;
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
    var RELIEF_NAMES = { none: 'None', rect: 'Rectangle', obround: 'Obround' };
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
        out.relief = RELIEF_NAMES[v.relief] ? v.relief : 'none';
        out.reliefWidth = out.relief !== 'none' && !v.useDefaultReliefWidth ? +v.reliefWidthValue : null;
        out.reliefDepth = out.relief !== 'none' && !v.useDefaultReliefDepth ? +v.reliefDepthValue : null;
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
      if (isFlange && feat.relief !== 'none') extra += ' · ' + RELIEF_NAMES[feat.relief].toLowerCase() + ' relief';
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
        if (isFlange && feat.relief !== 'none') extra += ' · ' + RELIEF_NAMES[feat.relief].toLowerCase() + ' relief';
        UI.setStatus(titles[kind] + ' preview: ' + edgeList.length + ' edge' + (edgeList.length === 1 ? '' : 's') + bendText(feat) + extra + '.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    var radiusFields = [
      { type: 'check', label: 'Use default bend radius (' + sheet.bendRadius + ')', key: 'useDefaultRadius', rerender: true },
      { type: 'number', label: 'Bend radius', key: 'radiusValue', unit: 'u', min: 0, show: function (v) { return !v.useDefaultRadius; } }
    ];
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
      ] }
    ] : [
      { title: 'Flange Parameters', fields: [
        { type: 'pick', icon: 'flange', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Select edges…', items: flangeItems, onRemove: flangeRemove, onClear: flangeClear }
      ].concat(radiusFields, [{ type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }]) },
      { title: 'Angle', fields: [{ type: 'number', label: 'Flange angle', key: 'angle', unit: '°', min: 0 }] },
      { title: 'Flange Length', fields: [{ type: 'number', label: 'Length', key: 'length', unit: 'u', min: 0 }, { type: 'iconRadio', label: 'Measured from', key: 'lengthRef', options: lengthRefs }, { type: 'check', label: 'Reverse direction', key: 'reverse' }] },
      { title: 'Flange Position', fields: [{ type: 'select', label: 'Position', key: 'position', options: [['bendOutside', 'Bend Outside'], ['outside', 'Material Outside'], ['inside', 'Material Inside'], ['virtualSharp', 'Bend from Virtual Sharp']] }] },
      { title: 'Miter', fields: [
        { type: 'check', label: 'Miter corners', key: 'miter', rerender: true },
        { type: 'number', label: 'Gap', key: 'miterGap', unit: 'u', min: 0, show: function (v) { return !!v.miter; } }
      ] },
      { title: 'Custom Relief Type', fields: [   // rfK: SolidWorks' group name on the Edge-Flange PM (Auto Relief is the sheet's default, in the Sheet-Metal feature)
        { type: 'select', label: 'Relief type', key: 'relief', options: [['none', 'None'], ['rect', 'Rectangle'], ['obround', 'Obround']], rerender: true },
        { type: 'check', label: 'Use default width (T = ' + T + ')', key: 'useDefaultReliefWidth', rerender: true, show: function (v) { return v.relief !== 'none'; } },
        { type: 'number', label: 'Relief width', key: 'reliefWidthValue', unit: 'u', min: 0, show: function (v) { return v.relief !== 'none' && !v.useDefaultReliefWidth; } },
        { type: 'check', label: 'Use default depth (T/2 = ' + T / 2 + ')', key: 'useDefaultReliefDepth', rerender: true, show: function (v) { return v.relief !== 'none'; } },
        { type: 'number', label: 'Relief depth', key: 'reliefDepthValue', unit: 'u', min: 0, show: function (v) { return v.relief !== 'none' && !v.useDefaultReliefDepth; } }
      ] }
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
      exprMap: { radiusValue: 'radius', reliefWidthValue: 'reliefWidth', reliefDepthValue: 'reliefDepth' },   // (cbaK / cbaBA / cbaBD: toFeature(v, true))
      message: isJog ? 'Click <b>straight edges</b>: the sheet steps up by the jog height and continues flat. Reverse steps it down.' : isHem ? 'Click <b>straight edges</b> to fold the sheet back over itself. <i>Material Inside</i> keeps the hem inside the edge; <i>Bend Outside</i> adds the bend beyond it. An Open hem\'s gap is the opening between the two flats.' :
        (isMiter ? 'Click <b>two or more adjacent straight edges</b> of the flat sheet; the flanges are joined at each shared corner.' : 'Click <b>straight edges</b> of the flat sheet. Placement is <i>Bend Outside</i>; use Reverse to flip the flange to the other side.') +
        ' <i>Miter</i> joins flanges on adjacent edges at their corner, and <i>Relief</i> cuts a slot where a flange ends inside the plate.',
      command: {
        pickEdges: true, edgeList: edgeList,
        onPick: function (pk) {
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
        resolveList(); preview();
      },
      onOK: function (v) {
        if (!v.edges.length) { UI.toast('Select at least one edge.'); return false; }
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
  function cmdJog(existing) { cmdEdgeFlange(existing, 'jog'); }
  // Miter Flange: an Edge-Flange with "Miter corners" preset; flanges on adjacent edges meet at the corner.
  function cmdMiterFlange(existing) { cmdEdgeFlange(existing, 'miter'); }

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
  //   'Isometric'], current (bool: the viewport's orientation as one more view), bendLines, notes (sheet, default on),
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
      wopts.bendLines = opts.bendLines !== false; wopts.notes = opts.notes !== false;
      return K.exportDXFFlat(flat, dxfUnits(), wopts);
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
  // The converter on the local server: HEAD api/dxf2dwg answers 200 with X-Anvil-Converter: oda | libredwg when one is
  // installed, 503 when not; the published copy has no endpoint at all (a 404 or a network error, both "none").
  var dwgState = { probed: false, ok: false, converter: null, pending: null };
  function probeDwg() {
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
  // dxfToDwg(dxfText) -> Promise of the DWG bytes (ArrayBuffer); rejects with the server's error message.
  // (shop audit 2) An R12 DXF (AC1009, POLYLINE / VERTEX) is refused up front: LibreDWG's writer makes a DWG with no
  // entities from one, silently (the flat read back empty), and the PM, the drawing's Save as DWG and the headless
  // runner all convert from R2000 anyway.
  var DXF_R12_NOTE = 'DWG is made from an R2000 DXF (AC1015); this DXF is R12. Export it as R2000 first.';
  function dxfToDwg(dxfText) {
    if (/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC1009\b/.test(String(dxfText).slice(0, 4000))) return Promise.reject(new Error(DXF_R12_NOTE));
    return fetch('api/dxf2dwg', { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: dxfText }).then(function (r) {
      if (r.status === 200) return r.arrayBuffer();
      return r.text().then(function (t) {
        var msg = 'DWG conversion failed (' + r.status + ')';
        try { msg = JSON.parse(t).error || msg; } catch (e) { }
        throw new Error(msg);
      });
    }, function () { throw new Error('DWG needs the local server (anvil/serve.ps1) and its converter.'); });
  }
  var DWG_NOTE = 'DWG needs the local server\'s converter (anvil/vendor/get-libredwg.ps1, or install the free ODA File Converter)';
  var LIBREDWG_NOTE = 'LibreDWG\'s DWG writer is experimental; use DXF for CAM, or install the ODA File Converter for compliant DWG';
  // cmdDxfOutput({ format: 'dxf' | 'dwg', name }) opens the PropertyManager (File ▸ Save As DXF / DWG…, Save As with
  // type DXF / DWG carries the typed file name over)
  function cmdDxfOutput(opts) {
    opts = opts || {};
    var faceOk = !!(App.sel && App.sel.kind === 'face'), sheetOk = !!App.model.sheet, sketchOk = dxfSketches().length > 0;
    var sk0 = opts.sketch != null ? K.findFeature(App.model, +opts.sketch) : dxfDefaultSketch();
    var v = { export: opts.export === 'sketch' && sketchOk ? 'sketch' : opts.export === 'sheet' && sheetOk ? 'sheet' : dxfDefaultExport(), sketch: sk0 ? String(sk0.id) : '', construction: false, vFront: true, vTop: true, vRight: true, vIsometric: false, vCurrent: false,
      format: opts.format === 'dwg' ? 'dwg' : 'dxf', version: 'R12', style: 'polyline', bendLines: true, notes: true, name: '' };
    var typed = opts.name && opts.name !== dxfSafeName() ? opts.name : null, auto = null;
    function autoName() { return dxfSafeName() + dxfSuffix(v); }
    v.name = typed || (auto = autoName());
    if (v.format === 'dwg' && !(dwgState.probed && dwgState.ok)) v.format = 'dxf';
    function optsOf(x) {
      // DWG: the converter gets an R2000 DXF (LibreDWG reads R12 entities without their model space)
      return { export: x.export, views: DXF_VIEW_NAMES.filter(function (n) { return x['v' + n]; }), current: !!x.vCurrent, bendLines: !!x.bendLines, notes: !!x.notes,
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
          { type: 'radio', key: 'export', rerender: true, options: [['faces', 'Faces / loops / edges'], ['views', 'Views'], ['sheet', 'Sheet metal'], ['sketch', 'Sketch']],
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
          { type: 'check', label: 'Geometry', key: 'geometry', disabled: true, show: isSheet },
          { type: 'check', label: 'Bend lines', key: 'bendLines', show: isSheet }, { type: 'check', label: 'Notes', key: 'notes', show: isSheet }
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
  function cmdMeasure() {
    openPM({
      title: 'Measure', icon: 'measure',
      message: 'Select a face for its area and normal. <b>Ctrl+click</b> a second face for the distance between them.',
      groups: [{ title: 'Results', fields: [{ type: 'html', html: measureHtml }] }],
      onChange: function () { }
    });
  }
  function measureHtml() {
    var u = UI.unitLabel();
    if (App.sel && App.sel.kind === 'edge') {
      var e = App.sel.edge, erows = [['Edge', 'length ' + UI.fmtNum(e.len, 3) + ' ' + u], ['Start', e.a.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')], ['End', e.b.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')], ['Direction', e.dir.map(function (x) { return UI.fmtNum(x, 3); }).join(', ')]];
      if (e.normals.length === 2) erows.push(['Between faces', UI.fmtNum(Math.acos(Math.max(-1, Math.min(1, UI.V.dot(e.normals[0], e.normals[1])))) * 180 / Math.PI, 2) + '° (' + (e.convex ? 'convex' : 'concave') + ')']);
      return '<div class="kv" style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px">' + erows.map(function (r) { return '<span class="static">' + r[0] + '</span><span>' + r[1] + '</span>'; }).join('') + '</div>';
    }
    if (!App.sel || App.sel.kind !== 'face' || !App.mesh) return '<span class="static">Nothing selected.</span>';
    var a = App.mesh.faces[App.sel.index], rows = [];
    rows.push(['Face', String(App.sel.index)], ['Area', UI.fmtNum(a.area, 2) + ' ' + u + '²'], ['Normal', a.normal.map(function (x) { return UI.fmtNum(x, 3); }).join(', ')], ['Centroid', a.centroid.map(function (x) { return UI.fmtNum(x, 2); }).join(', ')]);
    if (App.sel2 && App.sel2.kind === 'face') {
      var b = App.mesh.faces[App.sel2.index];
      var dotn = Math.abs(UI.V.dot(a.normal, b.normal));
      var ang = Math.acos(Math.min(1, dotn)) * 180 / Math.PI;
      rows.push(['Second face', String(App.sel2.index)], ['Angle between', UI.fmtNum(ang, 2) + '°']);
      if (dotn > 0.9999) rows.push(['Parallel distance', UI.fmtNum(Math.abs(UI.V.dot(UI.V.sub(b.centroid, a.centroid), a.normal)), 3) + ' ' + u]);
      rows.push(['Centroid distance', UI.fmtNum(UI.V.len(UI.V.sub(b.centroid, a.centroid)), 3) + ' ' + u]);
    }
    return '<div class="kv" style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px">' + rows.map(function (r) { return '<span class="static">' + r[0] + '</span><span>' + r[1] + '</span>'; }).join('') + '</div>';
  }
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
    var sheetParams = f.type === 'extrude' && f.sheetBase && !f.cut;
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
      case 'extrude': if (f.sheetBase && !f.cut) cmdSheetMetal(); else cmdExtrude(f.cut, f); break;
      case 'revolve': cmdRevolve(f.cut, f); break;
      case 'lpattern': cmdLinearPattern(f); break;
      case 'cpattern': cmdCircularPattern(f); break;
      case 'mirror': cmdMirror(f); break;
      case 'plane': cmdPlane(f); break;
      case 'chamfer': cmdChamfer(f); break;
      case 'fillet': cmdFillet(f); break;
      case 'flange': cmdEdgeFlange(f); break;
      case 'jog': cmdJog(f); break;
      case 'sketchedBend': UI.cmdSketchedBend(f); break;
      case 'sweep': cmdSweep(f.cut, f); break;
      case 'loft': cmdLoft(f.cut, f); break;
      case 'shell': cmdShell(f); break;
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
    var dependents = App.model.features.filter(function (g) { return g.sketch === id || g.feature === id || (g.plane && g.plane.featureId === id); });
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
    if (App.sel && App.sel.kind === 'feature') { deleteFeature(App.sel.id); return; }
    if (App.sel && App.sel.kind === 'face' && App.mesh) {
      var id = App.triShared[App.mesh.faces[App.sel.index].start];
      if (id >= 0) deleteFeature(id);
    }
  }

  UI.openPM = openPM; UI.closePM = closePM; UI.pmOK = pmOK; UI.pmCancel = pmCancel; UI.escapeCommand = escapeCommand; UI.hasPM = function () { return !!pm.spec; };
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
})(UI);
