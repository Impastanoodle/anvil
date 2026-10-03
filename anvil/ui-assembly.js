// ui-assembly.js — assembly commands added in run cloud-2026-09-25l: Linear / Circular Component Pattern and Mirror
// Components (PropertyManagers, pattern folders in the FeatureManager), Exploded View (explode steps picked or dragged
// along an axis, explode lines, the ExplView rows of the assembly ConfigurationManager, Explode / Collapse and the
// explode animation), and the matching window.anvil calls. The maths is in assembly.js; the Mate PM (Standard /
// Advanced / Mechanical Mates) is in ui-commands.js. Loaded after ui-app.js.
(function (UI) {
  'use strict';
  if (typeof Assembly === 'undefined' || !UI || !UI.App) return;
  var App = UI.App, el = UI.el, AS = Assembly;

  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function asmReady() {
    if (!isAsm()) { UI.toast('Open an assembly first (File \u25b8 New \u25b8 Assembly).'); return false; }
    return true;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fail(msg) { return Promise.reject(new Error(msg)); }
  function run(p) { if (p && p.catch) p.catch(function (e) { UI.toast(e.message || String(e)); }); return p; }
  // one undo step: mutate App.model, rebuild, then report
  function commit(mutate, message) {
    UI.pushUndo();
    var r = mutate(App.model);
    return UI.afterRebuild(UI.rebuild(), function () {
      UI.refreshTree(); UI.refreshStatus();
      if (message) UI.setStatus(typeof message === 'function' ? message(r) : message);
      return r;
    });
  }
  function compName(id) { var c = AS.findComponent(App.model, id); return c ? c.name : String(id); }
  function refText(ref) {
    if (!ref) return '';
    var who = ref.component != null ? compName(ref.component) : App.model.name;
    if (ref.face) return 'Face@' + who;
    if (ref.cylinder) return 'Cylindrical Face@' + who;
    if (ref.plane) return ref.plane + ' Plane@' + who;
    if (ref.axis) return 'Axis ' + String(ref.axis).toUpperCase() + '@' + who;
    return who;
  }
  // a viewport pick -> { component, ref } (a face / cylinder ref in the picked component, or an origin plane)
  function pickRef(pk) {
    if (pk.kind === 'face') {
      var ref = null;
      try { ref = AS.refFromPick(App.model, App.build, pk.index, pk.point, App.mesh); } catch (e) { ref = null; }
      return ref ? { component: ref.component, ref: ref } : null;
    }
    if (pk.kind === 'plane' && typeof pk.ref === 'string') return { component: null, ref: { plane: pk.ref } };
    return null;
  }
  function selectedComponent() { return UI.selectedComponent ? UI.selectedComponent() : null; }
  function patternStatus(p) { var b = App.build && App.build.assembly ? App.build : null; return b && b.errors ? b.errors[p.id] || null : null; }

  // ------------------------------------------------------------------ Linear / Circular Component Pattern, Mirror Components
  // One PropertyManager for the three (type 'linear' | 'circular' | 'mirror'). Selections: the components to pattern
  // (seeds; a pattern instance picks its seed) and the direction / axis / mirror plane, filled by picks in the order
  // shown by "Selecting". The graphics area previews the result; Cancel restores the model, ✓ adds or updates the
  // pattern as one undo step.
  var PAT = {
    linear: { title: 'Linear Pattern', icon: 'lpatternComp', refKey: 'direction', refLabel: 'Direction 1' },
    circular: { title: 'Circular Pattern', icon: 'cpatternComp', refKey: 'axis', refLabel: 'Pattern Axis' },
    mirror: { title: 'Mirror Components', icon: 'mirrorComp', refKey: 'plane', refLabel: 'Mirror plane' }
  };
  var patSession = null;
  function cmdComponentPattern(type, existing) {
    if (!asmReady()) return;
    if (existing && typeof existing !== 'object') existing = AS.findPattern(App.model, existing);
    if (existing) type = existing.type;
    var P = PAT[type] || PAT.linear, snapshot = JSON.stringify(App.model), previewed = false;
    var v = existing ? clone(existing) : { type: type, seeds: [] };
    if (!existing) {
      if (type === 'linear') { v.spacing = 20; v.count = 3; v.spacing2 = 20; v.count2 = 2; }
      if (type === 'circular') { v.angle = 360; v.count = 4; v.equal = true; }
      var pre = selectedComponent();
      if (pre) v.seeds = [pre.pattern != null ? pre.seed : pre.id];
    }
    v.use2 = !!v.direction2;
    v.selecting = v[P.refKey] ? 'seeds' : P.refKey;
    function opts(x) {
      var o = {};
      ['direction', 'spacing', 'count', 'reverse', 'direction2', 'spacing2', 'count2', 'reverse2', 'axis', 'angle', 'equal', 'plane', 'oppositeHand'].forEach(function (k) { o[k] = x[k] === undefined ? null : x[k]; });
      if (type === 'linear' && !x.use2) { o.direction2 = null; o.spacing2 = null; o.count2 = null; o.reverse2 = null; }
      ['reverse', 'reverse2', 'equal', 'oppositeHand'].forEach(function (k) { o[k] = !!x[k]; });
      return o;
    }
    function apply(m) {
      if (existing) {
        var p = AS.findPattern(m, existing.id);
        p.seeds = v.seeds.slice();
        AS.setPatternValues(m, p, opts(v));
        AS.syncPatterns(m);
        return p;
      }
      return AS.addPattern(m, type, v.seeds.slice(), opts(v));
    }
    function restore() { App.model = JSON.parse(snapshot); }
    function setMessage(html, ok) { if (!UI.hasPM()) return; pmSpec.message = html; pmSpec.messageOk = !!ok; UI.renderPM(); }
    function readyErr() {
      if (!v.seeds.length) return 'Select the components to pattern (click them in the graphics area).';
      if (!v[P.refKey]) return type === 'linear' ? 'Select a direction: a face (its normal), a plane, a cylindrical face or an axis.' : type === 'circular' ? 'Select the pattern axis: a cylindrical face.' : 'Select the mirror plane: a planar face or a plane.';
      return null;
    }
    function preview() {
      var err = readyErr();
      restore();
      if (err) { if (previewed) { previewed = false; UI.rebuild({ noSave: true }); } setMessage(err); return; }
      var p;
      try { p = apply(App.model); previewed = true; UI.rebuild({ noSave: true }); }
      catch (e) { restore(); previewed = false; UI.rebuild({ noSave: true }); setMessage('Preview failed: ' + (e.message || e)); return; }
      var er = patternStatus(p), n = (App.model.components || []).filter(function (c) { return c.pattern === p.id; }).length;
      setMessage(er ? P.title + ': ' + er : n + ' instance' + (n === 1 ? '' : 's') + ' previewed. Press \u2713 to ' + (existing ? 'update' : 'add') + ' ' + (existing ? existing.name : 'the pattern') + '.', !er);
    }
    function addSeed(id) {
      var c = AS.findComponent(App.model, id);
      if (!c) return false;
      var sid = c.pattern != null ? c.seed : c.id, i = v.seeds.indexOf(sid);
      if (i >= 0) v.seeds.splice(i, 1); else v.seeds.push(sid);
      return true;
    }
    function setRef(key, ref) { v[key] = ref; if (key === 'direction2') v.use2 = true; v.selecting = 'seeds'; }
    function onPick(pk) {
      var r = pickRef(pk);
      if (!r) { UI.setStatus('Pick a face of a component or an origin plane.'); return true; }
      if (v.selecting === 'seeds') {
        if (r.component == null) { UI.setStatus('Pick a component to pattern (or choose what you are selecting).'); return true; }
        addSeed(r.component);
      } else setRef(v.selecting, r.ref);
      UI.renderPM(); preview();
      return true;
    }
    var selOptions = [['seeds', 'Components to Pattern'], [P.refKey, P.refLabel]].concat(type === 'linear' ? [['direction2', 'Direction 2']] : []);
    var groups = [
      { title: 'Selections', fields: [
        { type: 'select', label: 'Selecting', key: 'selecting', options: selOptions },
        { type: 'pick', icon: P.icon, value: function (x) { return refText(x[P.refKey]); }, placeholder: P.refLabel + '\u2026' },
        { type: 'pick', icon: 'component', value: function (x) { return x.seeds.map(compName).join(', '); }, placeholder: 'Components to Pattern\u2026' },
        { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function (x) { x.seeds = []; x[P.refKey] = null; x.direction2 = null; x.selecting = P.refKey; UI.renderPM(); preview(); } }] }
      ] }
    ];
    if (type === 'linear') {
      groups.push({ title: 'Direction 1', fields: [
        { type: 'number', label: 'Spacing', key: 'spacing', unit: 'u' },
        { type: 'number', label: 'Instances', key: 'count', min: 1, step: 1 },
        { type: 'check', label: 'Reverse direction', key: 'reverse' }
      ] });
      groups.push({ title: 'Direction 2', fields: [
        { type: 'check', label: 'Direction 2', key: 'use2', rerender: true },
        { type: 'pick', icon: P.icon, value: function (x) { return refText(x.direction2); }, placeholder: 'Direction 2\u2026', show: function (x) { return x.use2; } },
        { type: 'number', label: 'Spacing', key: 'spacing2', unit: 'u', show: function (x) { return x.use2; } },
        { type: 'number', label: 'Instances', key: 'count2', min: 1, step: 1, show: function (x) { return x.use2; } },
        { type: 'check', label: 'Reverse direction', key: 'reverse2', show: function (x) { return x.use2; } }
      ] });
    } else if (type === 'circular') {
      groups.push({ title: 'Parameters', fields: [
        { type: 'number', label: 'Angle', key: 'angle', unit: '\u00b0' },
        { type: 'number', label: 'Instances', key: 'count', min: 1, step: 1 },
        { type: 'check', label: 'Equal spacing', key: 'equal' },
        { type: 'check', label: 'Reverse direction', key: 'reverse' }
      ] });
    } else {
      groups.push({ title: 'Orientation', fields: [{ type: 'check', label: 'Create opposite hand version', key: 'oppositeHand' }] });
    }
    var pmSpec = {
      title: existing ? existing.name : P.title, icon: P.icon, values: v,
      message: readyErr() || 'Previewing\u2026',
      command: { pickPlane: true, faceList: [], onPick: onPick },
      groups: groups,
      onChange: function (x, key) { if (key && key !== 'selecting') preview(); },
      onCancel: function () { if (previewed) { restore(); previewed = false; UI.rebuild({ noSave: true }); } },
      onClose: function () { patSession = null; },
      onOK: function () {
        var err = readyErr();
        if (err) { UI.toast(err); return false; }
        restore(); previewed = false;
        var id = existing ? existing.id : null;
        return commit(function (m) { var p = apply(m); id = p.id; return p; }, function (p) {
          var er = patternStatus(p);
          return er ? p.name + ': ' + er : p.name + (existing ? ' updated.' : ' added: ' + (App.model.components || []).filter(function (c) { return c.pattern === p.id; }).length + ' instances.');
        });
      }
    };
    UI.openPM(pmSpec);
    patSession = { values: v, addSeed: function (id) { var ok = addSeed(id); UI.renderPM(); preview(); return ok; }, setRef: function (key, ref) { setRef(key, clone(ref)); UI.renderPM(); preview(); return true; } };
    if (!readyErr()) preview();
  }
  function confirmRemovePattern(p) {
    var n = (App.model.components || []).filter(function (c) { return c.pattern === p.id; }).length;
    UI.confirmDialog('Confirm Delete', 'Delete <b>' + p.name + '</b>?<br>This also deletes its ' + n + ' instance' + (n === 1 ? '' : 's') + ' and the mates that reference them.', function () {
      run(removePattern(p.id));
    }, 'Delete');
  }
  function removePattern(id) {
    var p = AS.findPattern(App.model, id);
    if (!p) return fail('No pattern "' + id + '"');
    App.sel = null; App.sel2 = null; App.hiddenBodies = {};
    return commit(function (m) { AS.removePattern(m, p.id); }, 'Deleted ' + p.name + '.');
  }
  function addPattern(type, seeds, opts) {
    if (!isAsm()) return fail('Not an assembly document');
    try { AS.addPattern(clone(App.model), type, seeds, opts); } catch (e) { return fail(e.message || String(e)); }
    return commit(function (m) { return AS.addPattern(m, type, seeds, opts); }, function (p) { var er = patternStatus(p); return er ? p.name + ': ' + er : p.name + ' added.'; });
  }

  // ------------------------------------------------------------------ Exploded View
  // The Explode PropertyManager adds steps to the first exploded view (made on the first ✓): pick components, pick a
  // direction (X / Y / Z, or a face: its normal), then type the distance or drag one of the step's components in the
  // graphics area (the drag runs along the direction). "Done" adds the step and starts the next one; ✓ keeps the steps
  // and leaves the assembly exploded. Editing a step changes its components, direction and distance.
  var expSession = null;
  var DIRS = [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['face', 'Along selected face']];
  function stepDirection(x) {
    var d = x.dir === 'face' ? (x.faceDir || [0, 1, 0]) : AS.explodeDir(x.dir);
    return x.reverse ? d.map(function (c) { return -c; }) : d.slice();
  }
  function cmdExplodedView(existingStep) {
    if (!asmReady()) return;
    if (existingStep != null && typeof existingStep !== 'object') { var fs = AS.findExplodeStep(App.model, existingStep); existingStep = fs ? fs.step : null; }
    var snapshot = JSON.stringify(App.model), previewed = false, added = [];
    var view = AS.findExplodedView(App.model, null);
    var v = { comps: [], dir: 'y', faceDir: null, reverse: false, distance: 30, selecting: 'comps' };
    if (existingStep) {
      v.comps = existingStep.components.slice(); v.distance = existingStep.distance;
      var d = existingStep.direction, ax = ['x', 'y', 'z'].filter(function (k, i) { return Math.abs(Math.abs(d[i]) - 1) < 1e-12; })[0];
      if (ax) { v.dir = ax; v.reverse = d[['x', 'y', 'z'].indexOf(ax)] < 0; } else { v.dir = 'face'; v.faceDir = d.slice(); }
    } else {
      var pre = selectedComponent();
      if (pre) v.comps = [pre.id];
    }
    function restore() { App.model = JSON.parse(snapshot); }
    // the model with the steps added so far (and the one being edited) applied, shown exploded
    function apply(m, withCurrent) {
      var vw = view ? AS.findExplodedView(m, view.id) : null;
      added.forEach(function (s) {
        vw = vw || AS.addExplodedView(m);
        AS.addExplodeStep(m, vw.id, s.comps, s.dir, s.distance);
      });
      if (existingStep) {
        var f = AS.findExplodeStep(m, existingStep.id);
        if (f) { f.step.components = v.comps.slice(); f.step.direction = stepDirection(v); f.step.distance = +v.distance || 0; vw = f.view; }
      } else if (withCurrent && v.comps.length) {
        vw = vw || AS.addExplodedView(m);
        AS.addExplodeStep(m, vw.id, v.comps, stepDirection(v), +v.distance || 0);
      }
      if (vw) AS.setExploded(m, vw.id);
      return vw;
    }
    function setMessage(html, ok) { if (!UI.hasPM()) return; pmSpec.message = html; pmSpec.messageOk = !!ok; UI.renderPM(); }
    function preview() {
      restore();
      try { apply(App.model, true); previewed = true; UI.rebuild({ noSave: true }); }
      catch (e) { restore(); previewed = false; UI.rebuild({ noSave: true }); setMessage('Preview failed: ' + (e.message || e)); return; }
      setMessage(v.comps.length ? 'Explode step: ' + v.comps.map(compName).join(', ') + ' ' + (+v.distance || 0) + ' along ' + dirText(v) + '. Drag a component along the direction, or type the distance. ' + (existingStep ? '\u2713 updates the step.' : 'Done adds the step; \u2713 keeps all steps.')
        : 'Select the components to explode (click them in the graphics area).', !!v.comps.length);
    }
    function dirText(x) { var d = stepDirection(x); return '[' + d.map(function (c) { return +c.toFixed(3); }).join(', ') + ']'; }
    function toggleComp(id) { var i = v.comps.indexOf(id); if (i >= 0) v.comps.splice(i, 1); else v.comps.push(id); }
    function doneStep() {
      if (existingStep) return;
      if (!v.comps.length) { UI.toast('Select the components to explode first.'); return; }
      added.push({ comps: v.comps.slice(), dir: stepDirection(v), distance: +v.distance || 0 });
      v.comps = []; v.selecting = 'comps';
      UI.renderPM(); preview();
    }
    function onPick(pk) {
      var r = pickRef(pk);
      if (!r) { UI.setStatus('Pick a component (or a face for the direction).'); return true; }
      if (v.selecting === 'direction') {
        var n = null;
        if (pk.kind === 'face' && App.mesh.faces[pk.index]) n = App.mesh.faces[pk.index].normal.slice();
        else if (r.ref.plane) n = { front: [0, 0, 1], top: [0, 1, 0], right: [1, 0, 0] }[String(r.ref.plane).toLowerCase()];
        if (n) { v.dir = 'face'; v.faceDir = n; v.reverse = false; v.selecting = 'comps'; }
      } else if (r.component != null) toggleComp(r.component);
      UI.renderPM(); preview();
      return true;
    }
    var pmSpec = {
      title: existingStep ? existingStep.name : 'Explode', icon: 'explode', values: v,
      message: 'Select the components to explode (click them in the graphics area).',
      command: { pickPlane: true, faceList: [], onPick: onPick, explodeDrag: true },
      groups: [
        { title: 'Explode Steps', show: function () { return !existingStep; }, fields: [
          { type: 'static', label: 'Steps', value: function () { var n = (view ? view.steps.length : 0) + added.length; return n ? n + ' step' + (n === 1 ? '' : 's') + (added.length ? ' (' + added.length + ' new)' : '') : 'none yet'; } }
        ] },
        { title: 'Settings', fields: [
          { type: 'select', label: 'Selecting', key: 'selecting', options: [['comps', 'Components'], ['direction', 'Direction (a face)']] },
          { type: 'pick', icon: 'component', value: function (x) { return x.comps.map(compName).join(', '); }, placeholder: 'Components of the step\u2026' },
          { type: 'select', label: 'Direction', key: 'dir', options: DIRS, rerender: true },
          { type: 'check', label: 'Reverse direction', key: 'reverse' },
          { type: 'number', label: 'Distance', key: 'distance', unit: 'u' },
          { type: 'buttons', show: function () { return !existingStep; }, buttons: [{ label: 'Done', onclick: doneStep }, { label: 'Clear', onclick: function (x) { x.comps = []; UI.renderPM(); preview(); } }] }
        ] }
      ],
      onChange: function (x, key) { if (key && key !== 'selecting') preview(); },
      onCancel: function () { if (previewed) { restore(); previewed = false; UI.rebuild({ noSave: true }); } },
      onClose: function () { expSession = null; },
      onOK: function () {
        if (!existingStep && !added.length && !v.comps.length) { UI.toast('Select the components to explode first.'); return false; }
        restore(); previewed = false;
        return commit(function (m) { return apply(m, true); }, function (vw) { return vw ? vw.name + ': ' + vw.steps.length + ' explode step' + (vw.steps.length === 1 ? '' : 's') + ', shown exploded (Collapse in the ConfigurationManager).' : ''; });
      }
    };
    UI.openPM(pmSpec);
    expSession = {
      values: v,
      toggle: function (id) { var c = AS.findComponent(App.model, id); if (!c) return false; toggleComp(c.id); UI.renderPM(); preview(); return true; },
      done: doneStep,
      // drag along the direction: screen pixels -> distance (the direction's projected length per model unit)
      dragDistance: function (dpx, center) {
        var d = stepDirection(v), a = UI.worldToScreen(center), b = UI.worldToScreen([center[0] + d[0], center[1] + d[1], center[2] + d[2]]);
        var sx = b[0] - a[0], sy = b[1] - a[1], L2 = sx * sx + sy * sy;
        return L2 > 1e-9 ? (dpx[0] * sx + dpx[1] * sy) / L2 : 0;
      },
      preview: preview
    };
    preview();
  }
  // Viewport drag with the Explode PM open: press on a component of the step (or any component: it joins the step) and
  // drag; the distance follows the mouse along the step direction.
  var baseDragHook = UI.componentDragHook;
  UI.componentDragHook = function (p, ev) {
    if (isAsm() && App.command && App.command.explodeDrag && expSession) {
      var hit = UI.pickFace(p[0], p[1]), face = hit && App.mesh.faces[hit.index];
      var c = face ? (App.model.components || [])[face.body || 0] : null;
      if (!c) return null;
      var s = expSession, start = p.slice(), d0 = +s.values.distance || 0, center = AS.componentCenter(App.model, App.build, c.id), raf = 0, last = null;
      if (s.values.comps.indexOf(c.id) < 0) s.values.comps.push(c.id);
      function show() { raf = 0; if (!last) return; s.values.distance = +(d0 + s.dragDistance([last[0] - start[0], last[1] - start[1]], center)).toFixed(3); UI.renderPM(); s.preview(); }
      return {
        component: c,
        start: function () { UI.setStatus('Exploding ' + c.name + '\u2026'); },
        move: function (q) { last = q; if (!raf) raf = requestAnimationFrame(show); },
        end: function (q) { if (raf) { cancelAnimationFrame(raf); raf = 0; } last = q; show(); }
      };
    }
    // pattern instances follow their seed: dragging one is refused
    if (isAsm() && (!App.command || App.command.dragComponents) && App.mesh && UI.pickFace) {
      var h = UI.pickFace(p[0], p[1]), f = h && App.mesh.faces[h.index], cc = f ? (App.model.components || [])[f.body || 0] : null;
      if (cc && cc.pattern != null) { UI.setStatus(cc.name + ' is a pattern instance: drag its seed ' + compName(cc.seed) + '.'); return null; }
    }
    return baseDragHook ? baseDragHook(p, ev) : null;
  };

  // Explode / Collapse (display state, no undo step) and the explode animation (steps run one after another).
  function setExploded(view) {
    if (!isAsm()) return fail('Not an assembly document');
    try { AS.setExploded(App.model, view === false || view == null ? false : view); }
    catch (e) { return fail(e.message || String(e)); }
    return UI.afterRebuild(UI.rebuild(), function () { UI.refreshTree(); var x = App.build.explode; UI.setStatus(x ? x.name + ' exploded.' : 'Collapsed.'); return !!x; });
  }
  var animating = null;
  function animateExplode(explode, ms, view) {
    if (!isAsm()) return fail('Not an assembly document');
    var v = AS.findExplodedView(App.model, view != null ? view : App.model.exploded != null ? App.model.exploded : null);
    if (!v || !v.steps.length) return fail('The assembly has no exploded view with steps.');
    explode = explode !== false;
    ms = ms == null ? 1500 : Math.max(0, +ms);
    if (animating) animating.cancel();
    App.model.exploded = v.id;
    return new Promise(function (resolve) {
      var t0 = performance.now(), stopped = false;
      animating = { cancel: function () { stopped = true; } };
      function frame() {
        var f = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
        UI.asmBuildOpts = { explodeT: explode ? f : 1 - f };
        UI.rebuild({ noSave: true });
        if (f < 1 && !stopped) { requestAnimationFrame(frame); return; }
        UI.asmBuildOpts = null;
        animating = null;
        if (!explode) delete App.model.exploded;
        UI.afterRebuild(UI.rebuild(), function () { UI.refreshTree(); UI.setStatus(explode ? v.name + ' exploded.' : 'Collapsed.'); resolve(explode); });
      }
      frame();
    });
  }
  function removeExplodeStep(id) {
    var f = AS.findExplodeStep(App.model, id);
    if (!f) return fail('No explode step "' + id + '"');
    return commit(function (m) { AS.removeExplodeStep(m, f.step.id); }, 'Deleted ' + f.step.name + '.');
  }
  function removeExplodedView(id) {
    var v = AS.findExplodedView(App.model, id);
    if (!v) return fail('No exploded view "' + id + '"');
    return commit(function (m) { AS.removeExplodedView(m, v.id); }, 'Deleted ' + v.name + '.');
  }

  // Explode lines: dashed orange segments through each moved component's centre, one per step (build.explode.lines)
  var lineGroup = new THREE.Group();
  lineGroup.name = 'explode-lines';
  UI.scene.add(lineGroup);
  var lineMat = new THREE.LineDashedMaterial({ color: 0xe07b1a, dashSize: 3, gapSize: 2, depthTest: false, transparent: true });
  var drawnFor = null;
  function updateExplodeLines() {
    var b = isAsm() ? App.build : null;
    if (b === drawnFor) return;
    drawnFor = b;
    UI.disposeGroup(lineGroup);
    var lines = b && b.explode ? b.explode.lines : [];
    if (!lines.length) return;
    var pos = [];
    lines.forEach(function (l) { pos.push(l.from[0], l.from[1], l.from[2], l.to[0], l.to[1], l.to[2]); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var seg = new THREE.LineSegments(g, lineMat);
    seg.computeLineDistances();
    seg.renderOrder = 5;
    lineGroup.add(seg);
    if (UI.render) UI.render();
  }
  // every build ends in UI.refreshTree (ui-core applyBuild): redraw the lines there
  var baseRefreshTree = UI.refreshTree;
  // (the assembly tree does not refresh the ConfigurationManager itself: keep its Explode / Collapse state in step)
  UI.refreshTree = function () {
    var r = baseRefreshTree.apply(this, arguments);
    updateExplodeLines();
    if (isAsm() && UI.refreshConfigPanel) UI.refreshConfigPanel();
    return r;
  };

  // ------------------------------------------------------------------ FeatureManager: pattern folders
  // "LocalLPattern1" / "LocalCirPattern1" / "MirrorComponent1" folders after the Mates, holding the instance rows.
  // DOM: .ti.pattern-folder[data-pattern=id]; the instance rows are ordinary .ti.component-row rows inside.
  var PAT_ICON = { linear: 'lpatternComp', circular: 'cpatternComp', mirror: 'mirrorComp' };
  UI.asmTreeExtras = function (tree, h) {
    var m = App.model;
    (m.patterns || []).forEach(function (p) {
      var inst = [];
      (m.components || []).forEach(function (c, i) { if (c.pattern === p.id) inst.push([c, i]); });
      var key = 'pattern' + p.id, open = !!h.expanded[key], err = patternStatus(p);
      var row = h.treeItem({ icon: err ? 'error' : PAT_ICON[p.type], name: p.name, depth: 1, children: inst.length > 0, open: open, cls: 'pattern-folder' + (err ? ' err' : ''),
        title: err ? p.name + ': ' + err : p.name + ': ' + inst.length + ' instance' + (inst.length === 1 ? '' : 's') + ' of ' + p.seeds.map(compName).join(', ') + ' \u2014 double-click to edit',
        toggle: function () { h.expanded[key] = !open; h.refresh(); } });
      row.setAttribute('data-pattern', String(p.id));
      row.addEventListener('click', function () { UI.setStatus(err ? p.name + ': ' + err : p.name + ' (' + inst.length + ' instances)'); });
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); cmdComponentPattern(p.type, p); });
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault(); e.stopPropagation();
        h.showMenu(e.clientX, e.clientY, [{ label: 'Edit Feature', action: function () { cmdComponentPattern(p.type, p); } }, { sep: true }, { label: 'Delete', action: function () { confirmRemovePattern(p); } }]);
      });
      tree.appendChild(row);
      var box = el('div', { class: 'tc' + (open ? ' open' : '') });
      inst.forEach(function (ci) { h.componentRow(ci[0], ci[1], 2, box); });
      tree.appendChild(box);
    });
  };

  // ------------------------------------------------------------------ ConfigurationManager (assemblies)
  // "Assem1 Configuration(s)" ▸ "Default" ▸ "ExplView1" ▸ "Explode Step1"…; buttons New Exploded View, Explode / Collapse,
  // Animate. Double-click an ExplView to explode or collapse it. DOM: #asm-cfg, .cfg-row.expl-view[data-view=id],
  // .cfg-row.expl-step[data-step=id], #asm-explode-new, #asm-explode-toggle, #asm-explode-animate.
  UI.asmConfigPanel = function (panel) {
    var m = App.model, views = m.explodedViews || [], ex = m.exploded != null ? AS.findExplodedView(m, m.exploded) : null;
    panel.appendChild(el('div', { class: 'cfg-head', title: m.name + ' Configuration(s)' }, [el('span', { html: Icons('config', 16) }), el('span', { class: 'cfg-title', text: m.name + ' Configuration(s)' })]));
    panel.appendChild(el('div', { class: 'cfg-tools' }, [
      el('button', { id: 'asm-explode-new', text: 'New Exploded View\u2026', title: 'Exploded View: add explode steps', onclick: function () { UI.setFmTab && UI.setFmTab('tree'); cmdExplodedView(); } }),
      el('button', { id: 'asm-explode-toggle', text: ex ? 'Collapse' : 'Explode', title: ex ? 'Collapse the assembly' : 'Show the exploded view', onclick: function () { run(setExploded(ex ? false : true)); } }),
      el('button', { id: 'asm-explode-animate', text: ex ? 'Animate collapse' : 'Animate explode', title: 'Play the explode steps one after another', onclick: function () { run(animateExplode(!ex)); } })
    ]));
    var box = el('div', { id: 'cfg-list', class: 'asm-cfg' });
    box.id = 'asm-cfg';
    box.appendChild(el('div', { class: 'cfg-row active', 'data-name': 'Default', title: 'Default (active)' }, [el('span', { class: 'cfg-mark', text: '\u2713' }), el('span', { html: Icons('config', 16) }), el('span', { class: 'cfg-name', text: 'Default [ ' + m.name + ' ]' })]));
    if (!views.length) box.appendChild(el('div', { class: 'cfg-empty', text: 'No exploded view yet: Assembly \u25b8 Exploded View adds explode steps (select components, a direction and a distance).' }));
    views.forEach(function (v) {
      var on = ex && ex.id === v.id;
      var row = el('div', { class: 'cfg-row expl-view' + (on ? ' active' : ''), 'data-view': String(v.id), title: v.name + (on ? ' (exploded)' : '') + ' \u2014 double-click to ' + (on ? 'collapse' : 'explode') }, [
        el('span', { class: 'cfg-mark', text: on ? '\u2713' : '' }), el('span', { html: Icons('explode', 16) }), el('span', { class: 'cfg-name', text: v.name }), el('span', { class: 'cfg-vals', text: v.steps.length + ' step' + (v.steps.length === 1 ? '' : 's') })
      ]);
      row.style.paddingLeft = '18px';
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); run(setExploded(on ? false : v.id)); });
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault(); e.stopPropagation();
        UI.showMenu(e.clientX, e.clientY, [
          { label: on ? 'Collapse' : 'Explode', action: function () { run(setExploded(on ? false : v.id)); } },
          { label: on ? 'Animate collapse' : 'Animate explode', action: function () { run(animateExplode(!on, null, v.id)); } },
          { label: 'Edit Feature (add steps)', action: function () { cmdExplodedView(); } },
          { sep: true },
          { label: 'Delete', action: function () { UI.confirmDialog('Confirm Delete', 'Delete <b>' + v.name + '</b> and its ' + v.steps.length + ' steps?', function () { run(removeExplodedView(v.id)); }, 'Delete'); } }
        ]);
      });
      box.appendChild(row);
      v.steps.forEach(function (s) {
        var d = s.direction.map(function (c) { return +(+c).toFixed(3); });
        var sr = el('div', { class: 'cfg-row expl-step', 'data-step': String(s.id), title: s.name + ': ' + s.components.map(compName).join(', ') + ' ' + s.distance + ' along [' + d.join(', ') + '] \u2014 double-click to edit' }, [
          el('span', { class: 'cfg-mark', text: '' }), el('span', { html: Icons('explodeStep', 16) }), el('span', { class: 'cfg-name', text: s.name }), el('span', { class: 'cfg-vals', text: s.components.map(compName).join(', ') })
        ]);
        sr.style.paddingLeft = '34px';
        sr.addEventListener('dblclick', function (e) { e.stopPropagation(); UI.setFmTab && UI.setFmTab('tree'); cmdExplodedView(s); });
        sr.addEventListener('contextmenu', function (e) {
          e.preventDefault(); e.stopPropagation();
          UI.showMenu(e.clientX, e.clientY, [{ label: 'Edit Step', action: function () { cmdExplodedView(s); } }, { sep: true }, { label: 'Delete', action: function () { run(removeExplodeStep(s.id)); } }]);
        });
        box.appendChild(sr);
      });
    });
    panel.appendChild(box);
  };

  // ------------------------------------------------------------------ ribbon: the Assembly tab's placeholders
  var tab = UI.ASM_RIBBON && UI.ASM_RIBBON.Assembly;
  if (tab) {
    tab.forEach(function (b, i) {
      if (b.label === 'Linear Component\nPattern') tab[i] = { id: 'lpatternComp', label: 'Linear Component\nPattern', run: function () { cmdComponentPattern('linear'); } };
      if (b.label === 'Exploded\nView') tab[i] = { id: 'explode', label: 'Exploded\nView', run: function () { cmdExplodedView(); } };
    });
    var at = tab.map(function (b) { return b.id; }).indexOf('lpatternComp');
    if (at >= 0) tab.splice(at + 1, 0, { stack: [{ id: 'cpatternComp', label: 'Circular Component Pattern', run: function () { cmdComponentPattern('circular'); } }, { id: 'mirrorComp', label: 'Mirror Components', run: function () { cmdComponentPattern('mirror'); } }] });
    if (UI.refreshRibbon) try { UI.refreshRibbon(); } catch (e) { /* the ribbon is drawn at boot */ }
  }

  // ------------------------------------------------------------------ sub-assemblies and live links (cloud-2026-09-25o)
  // The document store (assembly.js Assembly.Documents) is backed by the documents saved in this browser (File ▸ Save,
  // localStorage 'anvil.files'), so a component { file: name } is a live link to a saved part or assembly: every
  // rebuild reads the saved document (or the edited copy still in memory). Open Part / Edit Part open the referenced
  // document on a document stack; Return to Assembly goes back (an unsaved edit stays in memory and already shows in the
  // assembly; File ▸ Save of the assembly saves it too). A missing document is a broken reference: the component shows
  // suppressed with a warning.
  var FILES = 'anvil.files', filesRaw, filesParsed = {};
  function readFiles() {
    var raw = null;
    try { raw = localStorage.getItem(FILES); } catch (e) { raw = null; }
    if (raw !== filesRaw) { filesRaw = raw; try { filesParsed = raw ? JSON.parse(raw) || {} : {}; } catch (e) { filesParsed = {}; } }
    return filesParsed;
  }
  function writeFiles(f) { var raw = JSON.stringify(f); localStorage.setItem(FILES, raw); filesRaw = raw; filesParsed = JSON.parse(raw); }
  function savedModel(name) { var f = readFiles()[name]; return f && f.model ? f.model : null; }
  AS.Documents.use({
    get: savedModel,
    put: function (name, m) {
      var f = clone(readFiles());
      f[name] = { model: m, features: (m.features || []).length, components: AS.isAssembly(m) ? (m.components || []).length : undefined, savedAt: Date.now() };
      writeFiles(f);
    },
    remove: function (name) { var f = clone(readFiles()); delete f[name]; writeFiles(f); },
    list: function () { return Object.keys(readFiles()); }
  });

  function subStatus(c) { return UI.compStatus ? UI.compStatus(c.id) : null; }
  function partBuildOf(c) { var b = App.build && App.build.assembly ? App.build : null; return b && b.partBuilds ? b.partBuilds[c.id] : null; }
  function sourceKind(c) { var st = subStatus(c); return st && st.subAssembly ? 'assembly' : AS.isSubAssemblySource(c.source) ? 'assembly' : 'part'; }

  // FeatureManager: a sub-assembly row expands into its own components (every level down) and its Mates folder; a
  // linked component says what it links to; a broken reference is shown suppressed with the warning.
  function innerRows(parent, depth, sm, sb, top, pathKey, h) {
    var status = {};
    (sb && sb.components || []).forEach(function (co) { status[co.id] = co; });
    (sm.components || []).forEach(function (k) {
      var co = status[k.id] || {}, kb = sb && sb.partBuilds ? sb.partBuilds[k.id] : null, isSub = !!(kb && kb.assembly && kb.model);
      var key = pathKey + '/' + k.id, open = !!h.expanded[key];
      var label = (k.fixed ? '(f) ' : co.underDefined ? '(-) ' : '') + k.name, warn = co.suppressed;
      var tip = k.name + ' in ' + top.name + (co.error ? ': ' + co.error : warn ? ' (suppressed): ' + (co.warning || '') : co.underDefined ? ' (' + co.dof + ' degree' + (co.dof === 1 ? '' : 's') + ' of freedom left)' : '') +
        (k.source && k.source.file != null ? ' — linked to "' + k.source.file + '"' : '');
      var row = h.treeItem({ icon: co.error ? 'error' : warn ? 'warn' : isSub ? 'assembly' : 'component', name: label + (warn ? ' (suppressed)' : ''), depth: depth, title: tip,
        cls: 'component-row inner-row' + (warn ? ' suppressed' : '') + (co.error ? ' err' : ''), children: isSub, open: open, toggle: function () { h.expanded[key] = !open; h.refresh(); } });
      row.setAttribute('data-inner', key);
      row.title = tip;
      row.addEventListener('click', function (e) { e.stopPropagation(); if (UI.selectComponent) UI.selectComponent(top.id); UI.setStatus(tip); });
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault(); e.stopPropagation();
        var items = [];
        if (k.source && k.source.file != null) items.push({ label: isSub ? 'Open Assembly' : 'Open Part', action: function () { run(openDocument(k.source.file, { from: top.name })); } });
        items.push({ label: 'Select ' + top.name, action: function () { if (UI.selectComponent) UI.selectComponent(top.id); } });
        h.showMenu(e.clientX, e.clientY, items);
      });
      parent.appendChild(row);
      if (isSub && open) innerRows(parent, depth + 1, kb.model, kb, top, key, h);
    });
    var mates = sm.mates || [];
    if (!mates.length) return;
    var mk = pathKey + '/mates', mopen = !!h.expanded[mk];
    var folder = h.treeItem({ icon: 'matesFolder', name: 'Mates', depth: depth, children: true, open: mopen, cls: 'mates-folder inner-row', title: mates.length + ' mate' + (mates.length === 1 ? '' : 's') + ' in ' + top.name, toggle: function () { h.expanded[mk] = !mopen; h.refresh(); } });
    parent.appendChild(folder);
    if (!mopen) return;
    mates.forEach(function (mt) {
      var ms = sb && sb.mates ? sb.mates[mt.id] || {} : {}, err = mt.suppressed ? null : ms.error;
      var r = h.treeItem({ icon: err ? 'error' : 'coincident', name: mt.name, depth: depth + 1, cls: 'mate-row inner-row' + (err ? ' err' : '') + (mt.suppressed || ms.suppressed ? ' suppressed' : ''), title: err ? mt.name + ': ' + err : mt.name + ' in ' + top.name });
      parent.appendChild(r);
    });
  }
  UI.asmRowDecor = function (c, st, h) {
    st = st || {};
    var linked = c.source && c.source.file != null, pb = partBuildOf(c), isSub = !!(st.subAssembly || (pb && pb.assembly && pb.model));
    if (!linked && !isSub && !st.suppressed) return null;
    var key = 'sub' + c.id, open = !!h.expanded[key];
    var d = {
      icon: st.suppressed ? 'warn' : isSub ? 'assembly' : 'component',
      cls: (st.suppressed ? 'suppressed' : '') + (linked ? ' linked' : '') + (isSub ? ' subassembly' : '') + (st.flexible ? ' flexible' : ''),
      suffix: st.suppressed ? ' (suppressed)' : '',
      tip: function (t) {
        if (st.suppressed) return c.name + ' (suppressed): ' + (st.warning || 'broken reference');
        return t + (isSub ? ' — sub-assembly, solved as ' + (c.flexible ? 'Flexible' : 'Rigid') : '') + (linked ? ' — linked to "' + c.source.file + '"' + (AS.Documents.isDirty(c.source.file) ? ' (edited, not saved)' : '') : '');
      }
    };
    if (isSub && pb && pb.model && !st.suppressed) {
      d.children = function (parent, depth) { innerRows(parent, depth, pb.model, pb, c, key, h); };
      d.open = open;
      d.toggle = function () { h.expanded[key] = !open; h.refresh(); };
    }
    return d;
  };

  // component context menu: Open Part / Open Assembly (linked), Edit Part (in context), Solve as Rigid / Flexible,
  // Make Linked Document… (embedded -> a saved document and a link to it)
  UI.asmComponentMenuExtras = function (c) {
    var items = [{ sep: true }], linked = c.source && c.source.file != null, kind = sourceKind(c), st = subStatus(c) || {};
    if (linked && !st.suppressed) items.push({ label: kind === 'assembly' ? 'Open Assembly' : 'Open Part', action: function () { run(openDocument(c.source.file, { from: c.name })); } });
    if (kind === 'part' && !st.suppressed && c.pattern == null) items.push({ label: 'Edit Part', action: function () { run(editPart(c.id)); } });
    if (kind === 'assembly' && !st.suppressed) items.push(c.flexible ? { label: 'Solve as Rigid', action: function () { run(setFlexible(c.id, false)); } } : { label: 'Solve as Flexible', action: function () { run(setFlexible(c.id, true)); } });
    if (!linked && c.pattern == null) items.push({ label: 'Make Linked Document…', action: function () { UI.promptDialog('Make Linked Document', 'Save ' + c.name + ' in this browser as (the component then links to it):', AS.findComponent(App.model, c.id) ? baseName(c.name) : '', function (n) { run(makeLinked(c.id, n)); }); } });
    return items.length > 1 ? items : [];
  };
  function baseName(n) { return String(n || '').replace(/<\d+>$/, ''); }

  // Flip Mate Alignment (mate context menu, as in SolidWorks): Aligned <-> Anti-Aligned. A Closest mate takes the sense
  // opposite to the one it has now. The solver turns the component over (assembly.js tries half turns before it
  // reports a conflict). One undo step.
  function flipMateAlignment(idOrName) {
    if (!isAsm()) return fail('Not an assembly document');
    var mt = AS.findMate(App.model, idOrName);
    if (!mt) return fail('No mate "' + idOrName + '"');
    if (!AS.hasAlignment(mt)) return fail(mt.name + ' has no alignment to flip');
    var cur = mt.alignment || AS.defaultAlignment(mt);
    if (cur === 'closest') {
      var s = 1;
      try {
        var A = AS.resolveRef(App.model, App.build.partBuilds, mt.a), B = AS.resolveRef(App.model, App.build.partBuilds, mt.b);
        var da = A.normal || A.dir, db = B.normal || B.dir;
        s = da[0] * db[0] + da[1] * db[1] + da[2] * db[2] < 0 ? -1 : 1;
      } catch (e) { /* unresolved: take aligned as the current sense */ }
      cur = s < 0 ? 'anti-aligned' : 'aligned';
    }
    var next = cur === 'aligned' ? 'anti-aligned' : 'aligned', id = mt.id;
    return commit(function (m) { var x = AS.findMate(m, id); x.alignment = next; return x; }, function (x) {
      var st = App.build && App.build.mates && App.build.mates[x.id];
      return x.name + ' flipped to ' + (next === 'aligned' ? 'Aligned' : 'Anti-Aligned') + (st && st.error ? ': ' + st.error : '.');
    });
  }
  UI.flipMateAlignment = flipMateAlignment;
  UI.asmMateMenuExtras = function (mt) {
    return AS.hasAlignment(mt) ? [{ label: 'Flip Mate Alignment', action: function () { run(flipMateAlignment(mt.id)); } }] : [];
  };
  // UI.innerRefName({ component, path }) -> 'Arm<1>@Hinge<2>' (innermost first, as SolidWorks names selections)
  UI.innerRefName = function (ref) {
    var c = AS.findComponent(App.model, ref.component);
    if (!c) return null;
    var names = [c.name], pb = partBuildOf(c);
    (ref.path || []).forEach(function (id) {
      var k = pb && pb.model ? AS.findComponent(pb.model, id) : null;
      names.unshift(k ? k.name : String(id));
      pb = k && pb.partBuilds ? pb.partBuilds[k.id] : null;
    });
    return names.join('@');
  };

  // Insert Components: Design Library assemblies go in as sub-assemblies, saved documents as live links
  UI.insertSourcesExtra = function () {
    var out = [];
    (window.AnvilExamples || []).forEach(function (ex) { if (ex && ex.name && ex.code && ex.kind === 'assembly') out.push({ key: 'asm:' + ex.name, label: ex.name + ' (sub-assembly)', source: { example: ex.name } }); });
    AS.Documents.list().forEach(function (n) {
      if (n === App.fileName) return;   // an assembly cannot contain itself
      var m = savedModel(n) || AS.Documents.get(n);
      out.push({ key: 'link:' + n, label: n + ' (linked' + (m && AS.isAssembly(m) ? ' assembly' : '') + ', saved in this browser)', source: { file: n } });
    });
    return out;
  };

  // one undo step on the assembly
  function setFlexible(id, on) {
    if (!asmReady()) return fail('Not an assembly document');
    var c = AS.findComponent(App.model, id);
    if (!c) return fail('Unknown component ' + JSON.stringify(id));
    try { AS.setFlexible(clone(App.model), c.id, on); } catch (e) { return fail(e.message); }
    return commit(function (m) { return AS.setFlexible(m, c.id, on); }, c.name + ' is solved as ' + (on ? 'Flexible: its own mates are solved in this assembly.' : 'Rigid.'));
  }
  function makeLinked(id, name) {
    name = String(name || '').trim();
    var c = AS.findComponent(App.model, id);
    if (!c || !name) return fail('Give the document a name');
    if (AS.Documents.has(name)) return fail('A document named "' + name + '" is already saved: pick another name');
    var model;
    try { model = AS.partModel(c.source); } catch (e) { return fail(e.message); }
    AS.Documents.put(name, model);
    var key = JSON.stringify(c.source);
    return commit(function (m) {
      m.components.forEach(function (x) { if (JSON.stringify(x.source) === key) x.source = { file: name }; });
      return name;
    }, c.name + ' now links to "' + name + '" (saved in this browser).');
  }

  // ---- the document stack: Open Part / Open Assembly / Edit Part, Return to Assembly
  var docStack = [];
  function banner() {
    var b = document.getElementById('asm-doc-banner');
    var top = docStack[docStack.length - 1];
    if (!top) { if (b) b.remove(); return; }
    if (!b) { b = el('div', { id: 'asm-doc-banner', class: 'asm-doc-banner' }); (UI.viewport || document.body).appendChild(b); }
    b.innerHTML = '';
    b.appendChild(el('span', { text: (top.inContext ? 'Editing ' + top.what + ' in the context of ' : 'Opened ' + top.what + ' from ') + top.model.name }));
    b.appendChild(el('button', { class: 'btn primary', id: 'asm-return', text: 'Return to ' + top.model.name, onclick: function () { run(returnToAssembly()); } }));
  }
  function pushDoc(frame, model) {
    frame.model = App.model; frame.fileName = App.fileName || null;
    frame.undo = App.undo.slice(); frame.redo = App.redo.slice();
    frame.hidden = clone(App.hiddenBodies || {}); frame.tab = App.ribbonTab;
    docStack.push(frame);
    return UI.loadModel(model).then(function () {
      frame.original = JSON.stringify(App.model);   // as opened and rebuilt: Return compares against this
      App.fileName = frame.file || null;
      if (UI.setRibbonTab) UI.setRibbonTab(AS.isAssembly(model) ? 'Assembly' : 'Features');
      banner();
      UI.setStatus((frame.inContext ? 'Edit Part: ' : 'Opened ') + frame.what + '. Change it, then Return to ' + frame.model.name + (frame.file ? ' (File ▸ Save saves it for every assembly that uses it).' : '.'));
      return window.anvil ? window.anvil.summary() : null;
    });
  }
  // openDocument(name, { from, inContext }): open a linked document from the store on top of the assembly
  function openDocument(name, opts) {
    opts = opts || {};
    var m = AS.Documents.get(name);
    if (!m) return fail('Cannot find the referenced document "' + name + '"');
    return pushDoc({ file: String(name), what: '"' + name + '"', inContext: !!opts.inContext }, m);
  }
  // editPart(component): Edit Part — the component's part (linked or embedded) opened in the context of this assembly
  function editPart(id) {
    if (!asmReady()) return fail('Not an assembly document');
    var c = AS.findComponent(App.model, id);
    if (!c) return fail('Unknown component ' + JSON.stringify(id));
    if (c.source && c.source.file != null) return openDocument(c.source.file, { inContext: true, from: c.name }).then(function (r) { docStack[docStack.length - 1].component = c.id; return r; });
    var m;
    try { m = AS.partModel(c.source); } catch (e) { return fail(e.message); }
    if (AS.isAssembly(m)) return fail(c.name + ' is a sub-assembly: open it with Open Assembly');
    return pushDoc({ embedded: JSON.stringify(c.source), component: c.id, what: c.name, inContext: true }, m);
  }
  // returnToAssembly(): back to the assembly below on the stack. A linked document that changed stays in memory as an
  // edited (dirty) document until it, or the assembly, is saved; an embedded part's edit replaces the embedded copy of
  // every component with that source (one undo step on the assembly).
  function returnToAssembly() {
    var fr = docStack.pop();
    if (!fr) return fail('No assembly to return to');
    var edited = App.model, changed = false;
    changed = JSON.stringify(edited) !== fr.original;
    if (fr.file && changed) {
      var saved = savedModel(fr.file);   // saved from the part itself (File ▸ Save) since: nothing left to keep in memory
      if (saved && JSON.stringify(saved) === JSON.stringify(edited)) AS.Documents.revert(fr.file); else AS.Documents.put(fr.file, edited, { dirty: true });
    }
    return UI.loadModel(fr.model).then(function () {
      App.fileName = fr.fileName;
      App.undo.push.apply(App.undo, fr.undo); App.redo.push.apply(App.redo, fr.redo);
      App.hiddenBodies = fr.hidden || {};
      if (UI.setRibbonTab) UI.setRibbonTab(fr.tab || 'Assembly');
      banner();
      if (fr.embedded && changed) {
        return commit(function (m) {
          var src = { model: clone(edited) };
          m.components.forEach(function (x) { if (JSON.stringify(x.source) === fr.embedded) x.source = clone(src); });
        }, fr.what + ' updated from Edit Part.');
      }
      UI.refreshTree();
      UI.setStatus(changed ? '"' + fr.file + '" was changed: every assembly that uses it shows the change; File ▸ Save saves it.' : 'Back in ' + App.model.name + '.');
    }).then(function () { return window.anvil ? window.anvil.summary() : null; });
  }
  // File ▸ Save: an assembly also saves the referenced documents edited in memory; a saved part drops its edited copy
  UI.afterSaveHook = function (name) {
    if (!isAsm()) { AS.Documents.revert(name); return; }
    var saved = AS.saveReferences(App.model);
    if (saved.length) UI.toast('Saved "' + name + '" and ' + saved.map(function (n) { return '"' + n + '"'; }).join(', '));
  };

  // ---- Pack and Go: the assembly with every linked document embedded, as one JSON file
  function packAndGo() {
    if (!isAsm()) { UI.toast('Pack and Go works on an assembly: it embeds the documents the assembly links to.'); return null; }
    var r = AS.packAndGo(App.model), name = (App.fileName || App.model.name || 'Assem1') + ' (packed).anvil.json';
    var body = el('div', {}, [
      el('p', { text: r.embedded.length ? 'Embeds ' + r.embedded.map(function (n) { return '"' + n + '"'; }).join(', ') + ' in one file.' : 'Nothing is linked: the assembly already stands alone.' }),
      r.missing.length ? el('p', { class: 'err', text: 'Missing (left as links): ' + r.missing.join(', ') }) : el('span')
    ]);
    UI.showModal({ title: 'Pack and Go', body: body, buttons: [
      { label: 'Save', primary: true, id: 'pack-save', action: function () { UI.closeModal(); if (UI.downloadText) UI.downloadText(name, JSON.stringify(r.model, null, 1), 'application/json'); else downloadJSON(name, r.model); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
    return r;
  }
  function downloadJSON(name, obj) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      UI.setStatus('Saved ' + name + '.');
    } catch (e) { UI.toast('Could not save: ' + e.message); }
  }

  // ---- Bill of Materials (Top-level only / Indented / Parts only) of the open assembly
  function bomRows(type) { return isAsm() ? AS.bom(App.model, App.build, { type: type }) : []; }
  function showBom(type) {
    if (!asmReady()) return;
    type = type || 'indented';
    var sel = el('select', { id: 'bom-type', 'aria-label': 'BOM Type' });
    [['top', 'Top-level only'], ['indented', 'Indented'], ['parts', 'Parts only']].forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); if (o[0] === type) op.selected = true; sel.appendChild(op); });
    var table = el('table', { id: 'bom-table', class: 'bom-table' });
    function fill() {
      table.innerHTML = '';
      table.appendChild(el('tr', {}, ['ITEM NO.', 'PART NUMBER', 'QTY.'].map(function (h) { return el('th', { text: h }); })));
      bomRows(sel.value).forEach(function (r) {
        var nm = el('td', { text: r.name + (r.kind === 'assembly' ? ' (assembly)' : '') + (r.file ? ' ↗' : '') });
        nm.style.paddingLeft = (6 + 14 * r.level) + 'px';
        var tr = el('tr', { class: 'bom-row', 'data-item': r.item }, [el('td', { text: r.item }), nm, el('td', { text: String(r.qty) })]);
        table.appendChild(tr);
      });
    }
    sel.addEventListener('change', fill);
    fill();
    UI.showModal({ title: 'Bill of Materials — ' + App.model.name, body: el('div', {}, [el('label', { class: 'dlg-row' }, [el('span', { text: 'BOM Type' }), sel]), table]) });
  }

  // ribbon: the Bill of Materials placeholder opens the BOM
  if (tab) tab.forEach(function (b) {
    if (b && b.stack) b.stack.forEach(function (x, i) { if (x.label === 'Bill of Materials') b.stack[i] = { id: 'generic', label: 'Bill of Materials', run: function () { showBom(); } }; });
  });

  // ------------------------------------------------------------------ exports and window.anvil
  UI.cmdLinearComponentPattern = function () { cmdComponentPattern('linear'); };
  UI.cmdCircularComponentPattern = function () { cmdComponentPattern('circular'); };
  UI.cmdMirrorComponents = function () { cmdComponentPattern('mirror'); };
  UI.cmdComponentPattern = cmdComponentPattern; UI.cmdExplodedView = cmdExplodedView;
  UI.patternSession = function () { return patSession; }; UI.explodeSession = function () { return expSession; };
  UI.asmExplode = { set: setExploded, animate: animateExplode, removeStep: removeExplodeStep, removeView: removeExplodedView };
  UI.asmPatterns = { add: addPattern, remove: removePattern, confirmRemove: confirmRemovePattern };
  UI.asmDocs = { open: openDocument, editPart: editPart, returnToAssembly: returnToAssembly, stack: function () { return docStack.map(function (f) { return { what: f.what, file: f.file || null, assembly: f.model.name, inContext: !!f.inContext }; }); } };
  UI.returnToAssembly = returnToAssembly; UI.packAndGo = packAndGo; UI.showBom = showBom; UI.setFlexible = setFlexible; UI.makeLinked = makeLinked;
  if (window.anvil) {
    var A = window.anvil;
    function then(p) { return p.then(function () { return A.summary(); }); }
    // pattern('linear' | 'circular' | 'mirror', seeds (ids / names), opts as in assembly.js addPattern)
    A.pattern = function (type, seeds, opts) { return then(addPattern(type, seeds, opts)); };
    A.patterns = function () {
      if (!isAsm()) return [];
      return (App.model.patterns || []).map(function (p) {
        return { id: p.id, name: p.name, type: p.type, seeds: p.seeds.map(compName), error: patternStatus(p),
          instances: (App.model.components || []).filter(function (c) { return c.pattern === p.id; }).map(function (c) { return c.name; }) };
      });
    };
    A.removePattern = function (id) { return then(removePattern(id)); };
    // explode(components, direction ('x', '-y', [x, y, z]), distance, { view, name }): one explode step (one undo step)
    A.explode = function (comps, dir, dist, opts) {
      if (!isAsm()) return fail('Not an assembly document');
      try { AS.addExplodeStep(clone(App.model), opts && opts.view, comps, dir, dist, opts); } catch (e) { return fail(e.message || String(e)); }
      return then(commit(function (m) { var s = AS.addExplodeStep(m, opts && opts.view, comps, dir, dist, opts); var f = AS.findExplodeStep(m, s.id); AS.setExploded(m, f.view.id); return s; }, 'Explode step added.'));
    };
    // exploded(): the state; exploded(true | view | false): explode / collapse
    A.exploded = function (v) {
      if (v === undefined) { var b = App.build && App.build.explode; return b ? { view: b.name, offsets: b.offsets, lines: b.lines.length } : null; }
      return setExploded(v).then(function () { return A.exploded(); });
    };
    A.animateExplode = function (explode, ms) { return animateExplode(explode, ms).then(function () { return A.exploded(); }); };
    // sub-assemblies and live links
    A.documents = function () { return AS.Documents.list().map(function (n) { var m = AS.Documents.get(n); return { name: n, type: m && AS.isAssembly(m) ? 'assembly' : 'part', dirty: AS.Documents.isDirty(n) }; }); };
    // saveDocument(name, model?): save a model (default: the open document) in this browser under that name
    A.saveDocument = function (name, model) { AS.Documents.put(String(name), model || App.model); if (!model) App.fileName = String(name); return A.documents(); };
    A.removeDocument = function (name) { AS.Documents.remove(String(name)); return A.documents(); };
    A.flexible = function (id, on) { return then(setFlexible(id, on !== false)); };
    A.openPart = function (idOrName) {
      var c = isAsm() ? AS.findComponent(App.model, idOrName) : null;
      if (c && c.source && c.source.file != null) return openDocument(c.source.file, { from: c.name });
      return openDocument(idOrName);
    };
    A.editPart = function (idOrName) { var c = isAsm() ? AS.findComponent(App.model, idOrName) : null; return c ? editPart(c.id) : fail('Unknown component ' + JSON.stringify(idOrName)); };
    A.returnToAssembly = function () { return returnToAssembly(); };
    A.docStack = function () { return UI.asmDocs.stack(); };
    A.bom = function (type) { return bomRows(type || 'top').map(function (r) { return { item: r.item, level: r.level, name: r.name, kind: r.kind, qty: r.qty, file: r.file || null }; }); };
    A.packAndGo = function () { return isAsm() ? AS.packAndGo(App.model) : null; };
    A.saveReferences = function () { return isAsm() ? AS.saveReferences(App.model) : []; };
    A.explodedViews = function () {
      if (!isAsm()) return [];
      return (App.model.explodedViews || []).map(function (v) { return { id: v.id, name: v.name, exploded: App.model.exploded === v.id, steps: v.steps.map(function (s) { return { id: s.id, name: s.name, components: s.components.map(compName), direction: s.direction.slice(), distance: s.distance }; }) }; });
    };
  }
})(UI);
