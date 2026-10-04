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
  function selectedComponent() {
    var c = UI.selectedComponent ? UI.selectedComponent() : null;
    if (!c && isAsm() && App.sel && App.sel.kind === 'edge') c = (App.model.components || [])[compIndexOf(App.sel)] || null;   // r13/asmui13: an edge belongs to a component too
    return c;
  }
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
  UI.componentDragHook = function (p, ev, force) {
    if (force !== 'rotate' && isAsm() && App.command && App.command.explodeDrag && expSession) {
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
    return baseDragHook ? baseDragHook(p, ev, force) : null;
  };

  // ---- SmartMates (r4/asm4): Alt + drag a face of a floating component onto a face of another component. While the
  // cursor is over a face that can take a mate (plane on plane: Coincident, cylinder in cylinder: Concentric, cylinder
  // on plane: Tangent) the component is shown mated there (a pose-only solve with the mate added, no rebuild); dropping
  // adds the mate (one undo step), dropping anywhere else changes nothing. ui-sketch.js asks this before Alt + drag
  // rotates the view.
  var SMART_TYPES = { 'face|face': 'coincident', 'cylinder|cylinder': 'concentric', 'cylinder|face': 'tangent', 'face|cylinder': 'tangent' };
  var SMART_NAMES = { coincident: 'Coincident', concentric: 'Concentric', tangent: 'Tangent', parallel: 'Parallel', perpendicular: 'Perpendicular', distance: 'Distance', angle: 'Angle', width: 'Width' };
  // r5/asm5: the types the SmartMates pop-up offers for a pair of references (the first is the one the drop adds)
  var SMART_CHOICES = { 'face|face': ['coincident', 'parallel', 'perpendicular'], 'cylinder|cylinder': ['concentric', 'tangent'], 'cylinder|face': ['tangent'], 'face|cylinder': ['tangent'] };
  function refKind(r) { return r ? (r.cylinder ? 'cylinder' : r.face ? 'face' : null) : null; }
  // the face under (mx, my) on a component other than body index `skip` (the pose may have moved that one under it)
  var smartRay = null;
  function pickOther(mx, my, skip) {
    var bm = UI.getBodyMesh && UI.getBodyMesh(), m = App.mesh;
    if (!bm || !m || !UI.camera || !UI.size) return null;
    if (bm.geometry.index) { var h0 = UI.pickFace(mx, my), f0 = h0 && m.faces[h0.index]; return f0 && (f0.body || 0) !== skip ? h0 : null; }   // hidden bodies: the plain pick
    smartRay = smartRay || new THREE.Raycaster();
    smartRay.setFromCamera(new THREE.Vector2(mx / UI.size.w * 2 - 1, -(my / UI.size.h) * 2 + 1), UI.camera);
    var hits = smartRay.intersectObject(bm, false), faces = m.faces;
    for (var i = 0; i < hits.length; i++) {
      var tri = hits[i].faceIndex, lo = 0, hi = faces.length - 1, fi = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1, f = faces[mid]; if (tri < f.start) hi = mid - 1; else if (tri >= f.start + f.count) lo = mid + 1; else { fi = mid; break; } }
      if (fi < 0 || (faces[fi].body || 0) === skip) continue;
      var sec = App.view && App.view.section && App.view.section.plane;
      if (sec && sec.distanceToPoint(hits[i].point) < 0) continue;
      return { kind: 'face', index: fi, point: [hits[i].point.x, hits[i].point.y, hits[i].point.z] };
    }
    return null;
  }
  function smartMateHook(p, ev) {
    if (!isAsm() || App.command || App.mode === 'sketch' || !App.mesh || !App.build || !App.build.assembly || !UI.asmPose) return null;
    var hit = UI.pickFace(p[0], p[1]), face = hit && App.mesh.faces[hit.index];
    var ci = face ? face.body || 0 : -1, c = ci >= 0 ? (App.model.components || [])[ci] : null;
    if (!c) return null;
    if (c.fixed) return null;   // Alt + drag on a fixed component rotates the view
    if (c.pattern != null) { UI.setStatus(c.name + ' is a pattern instance: SmartMate its seed ' + compName(c.seed) + '.'); return null; }
    var src = null;
    try { src = AS.refFromPick(App.model, App.build, hit.index, hit.point, App.mesh); } catch (e) { src = null; }
    if (!refKind(src)) return null;
    var snap = JSON.stringify(App.model), raf = 0, last = null, cur = null, tries = {};
    // the mate the cursor offers: { key, type, ref, ok, pb, model } (cached per target face)
    function offer(q) {
      var h = pickOther(q[0], q[1], ci), tf = h && App.mesh.faces[h.index];
      if (!tf) return null;
      var key = h.index, o = tries[key];
      if (o) return o;
      var ref = null;
      try { ref = AS.refFromPick(App.model, App.build, h.index, h.point, App.mesh); } catch (e) { ref = null; }
      var type = SMART_TYPES[refKind(src) + '|' + refKind(ref)];
      o = tries[key] = { key: key, type: type, ref: ref, ok: false };
      if (!type || !ref || ref.component === c.id) return o;
      try {
        var mm = JSON.parse(snap), mate = AS.addMate(mm, type, JSON.parse(JSON.stringify(src)), JSON.parse(JSON.stringify(ref)), {});
        var pb = AS.rebuild(mm, App.asmCache, { poseOnly: true });
        var r = pb.mates && pb.mates[mate.id];
        // r9/polish9: the default alignment cannot be met where the component stands: offer the other one (as the
        // Mate PM does) instead of "not possible"
        var da = r && r.error ? AS.defaultAlignment(mate) : null;
        if (da === 'aligned' || da === 'anti-aligned') {
          var alt = da === 'aligned' ? 'anti-aligned' : 'aligned';
          var mm2 = JSON.parse(snap), mate2 = AS.addMate(mm2, type, JSON.parse(JSON.stringify(src)), JSON.parse(JSON.stringify(ref)), { alignment: alt });
          var pb2 = AS.rebuild(mm2, App.asmCache, { poseOnly: true }), r2 = pb2.mates && pb2.mates[mate2.id];
          if (r2 && !r2.error) { mm = mm2; pb = pb2; r = r2; o.alignment = alt; }
        }
        o.ok = !!(r && !r.error);
        o.error = r && r.error;
        o.model = mm; o.pb = pb;
      } catch (e2) { o.error = e2.message || String(e2); }
      return o;
    }
    function show() {
      raf = 0;
      if (!last) return;
      var o = offer(last);
      if (!o && cur && cur.ok) return;   // between faces: keep the offered mate until another face is reached
      cur = o;
      if (o && o.ok) {
        UI.asmPose.apply(o.model, o.pb.explode);
        UI.setStatus('SmartMates: ' + SMART_NAMES[o.type] + ' — drop to add the mate.');
      } else {
        UI.asmPose.apply(JSON.parse(snap), App.build.explode);
        UI.setStatus(o && o.type && o.error ? 'SmartMates: ' + SMART_NAMES[o.type] + ' not possible: ' + o.error
          : 'SmartMates: drag ' + c.name + ' onto a face of another component (plane on plane, cylinder in cylinder, cylinder on plane).');
      }
    }
    return {
      component: c, smartMate: true,
      start: function () { UI.setStatus('SmartMates: drag ' + c.name + ' onto a face of another component.'); },
      move: function (q) { last = q; if (!raf) raf = requestAnimationFrame(show); },
      end: function (q) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        last = q;
        var o = offer(q) || (cur && cur.ok ? cur : null);
        if (UI.asmPose.active()) UI.asmPose.end();   // the rebuild below draws the mated result in the same frame
        if (!o || !o.ok) { UI.setStatus('SmartMates: no mate added.'); return Promise.resolve(null); }
        var type = o.type, a = src, b = o.ref, pre = JSON.stringify(App.model), al = o.alignment || null;
        return commit(function (m) { return AS.addMate(m, type, JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), al ? { alignment: al } : {}); },
          function (mt) { return 'SmartMates: ' + (mt ? mt.name : SMART_NAMES[type]) + ' added (' + c.name + '). Pick another type, Flip Mate Alignment, or ✓.'; })
          .then(function (mt) {   // r5/asm5: the Mate pop-up toolbar at the drop point, as in SolidWorks
            if (mt) smartPopup(q, { pre: pre, a: a, b: b, type: type, alignment: null, mateId: mt.id, kinds: refKind(src) + '|' + refKind(o.ref), comp: c.name });
            return mt;
          })
          .catch(function (e) { UI.toast(e.message || String(e)); });
      }
    };
  }
  UI.smartMateHook = smartMateHook;

  // ---- a mate picked in the FeatureManager shows what it holds (r4/asm4): its two faces are selected in the graphics
  // area (App.sel / App.sel2 carry the mate id), as in SolidWorks; Delete then deletes the mate, not a component.
  function sqDistTri(p, P, o) {   // squared distance from p to triangle o (offset into positions P)
    var ax = P[o], ay = P[o + 1], az = P[o + 2], bx = P[o + 3], by = P[o + 4], bz = P[o + 5], cx = P[o + 6], cy = P[o + 7], cz = P[o + 8];
    var abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
    var d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz, qx, qy, qz;
    function at(x, y, z) { var dx = p[0] - x, dy = p[1] - y, dz = p[2] - z; return dx * dx + dy * dy + dz * dz; }
    if (d1 <= 0 && d2 <= 0) return at(ax, ay, az);
    var bpx = p[0] - bx, bpy = p[1] - by, bpz = p[2] - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return at(bx, by, bz);
    var vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { var v = d1 / (d1 - d3); return at(ax + abx * v, ay + aby * v, az + abz * v); }
    var cpx = p[0] - cx, cpy = p[1] - cy, cpz = p[2] - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return at(cx, cy, cz);
    var vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { var w = d2 / (d2 - d6); return at(ax + acx * w, ay + acy * w, az + acz * w); }
    var va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { var u = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at(bx + (cx - bx) * u, by + (cy - by) * u, bz + (cz - bz) * u); }
    var den = 1 / (va + vb + vc), sv = vb * den, sw = vc * den;
    qx = ax + abx * sv + acx * sw; qy = ay + aby * sv + acy * sw; qz = az + abz * sv + acz * sw;
    return at(qx, qy, qz);
  }
  // the face of App.mesh a mate reference lands on (its point placed like the component, through a sub-assembly path), or -1
  function refFaceIndex(ref) {
    var m = App.mesh, b = App.build;
    if (!ref || ref.component == null || !m || !b || !b.assembly) return -1;
    var pt = ref.face || ref.cylinder;
    if (!pt) return -1;
    var c = AS.findComponent(App.model, ref.component), ci = c ? (App.model.components || []).indexOf(c) : -1;
    if (ci < 0) return -1;
    var T = c.transform, pb = b.partBuilds && b.partBuilds[c.id];
    (ref.path || []).forEach(function (id) {
      var k = pb && pb.model ? AS.findComponent(pb.model, id) : null;
      if (!k) return;
      T = AS.composeTransforms(T, k.transform);
      pb = pb.partBuilds && pb.partBuilds[k.id];
    });
    var w = AS.transformPoint(T, pt), off = b.explode && b.explode.offsets && b.explode.offsets[c.id];
    if (off) w = [w[0] + off[0], w[1] + off[1], w[2] + off[2]];
    var best = -1, bd = Infinity, P = m.positions;
    for (var fi = 0; fi < m.faces.length; fi++) {
      var f = m.faces[fi];
      if ((f.body || 0) !== ci) continue;
      for (var t = f.start; t < f.start + f.count; t++) { var d = sqDistTri(w, P, t * 9); if (d < bd) { bd = d; best = fi; } }
    }
    return bd < 1 ? best : -1;   // within 1 (squared): a facet of a true cylinder sits a chord height off its surface
  }
  UI.mateRefFace = refFaceIndex;   // r5/select5: the Mate PM list rows light their face
  UI.asmRefFace = refFaceIndex;    // r5/asm5 (same function)
  UI.showMate = function (mt) {
    if (!isAsm() || !mt) return false;
    var ia = refFaceIndex(mt.a), ib = refFaceIndex(mt.b);
    App.sel = ia >= 0 ? { kind: 'face', index: ia, mate: mt.id } : null;
    App.sel2 = ib >= 0 ? { kind: 'face', index: ib, mate: mt.id } : null;
    if (!App.sel && App.sel2) { App.sel = App.sel2; App.sel2 = null; }
    if (UI.updateHighlights) UI.updateHighlights();
    if (UI.requestRender) UI.requestRender();
    return ia >= 0 || ib >= 0;
  };
  // a rebuild (the OpenCascade swap, an undo) renumbers the mesh faces: a shown mate is found again on the new mesh,
  // after the swap has put its selection back by position (where a pin and its bore meet, that may be the wrong part)
  (UI.onBuild = UI.onBuild || []).push(function () {
    Promise.resolve().then(function () {
      var id = App.sel && App.sel.mate;
      if (id == null) return;
      var mt = isAsm() ? AS.findMate(App.model, id) : null;
      if (mt) UI.showMate(mt); else { App.sel = null; App.sel2 = null; if (UI.updateHighlights) UI.updateHighlights(); }
    });
  });
  var baseDeleteSelection = UI.deleteSelection;
  UI.deleteSelection = function () {
    var id = App.sel && App.sel.mate;
    var mt = id != null && isAsm() ? AS.findMate(App.model, id) : null;
    if (mt && UI.confirmRemoveMate) { UI.confirmRemoveMate(mt); return; }
    return baseDeleteSelection ? baseDeleteSelection.apply(this, arguments) : undefined;
  };

  // ------------------------------------------------------------------ pose display (r3/assembly3)
  // While a component is dragged or an explode animation runs only rigid placements change, so instead of a full
  // rebuild per frame (bodies, the combined mesh, its B-rep edges: 40-60 ms on the Gear train) the viewport moves the
  // triangles, edges and silhouettes it already shows. begin() copies the drawn buffers and tags every vertex with its
  // component; apply(model, explode) moves each component from where it was drawn to its new placement; end() puts the
  // drawn buffers back (the caller then rebuilds once). App.mesh / App.build are untouched while a pose is shown.
  var pose = null;
  function placeOf(c, offs) {
    var T = c && c.transform || {}, R = T.rotation || AS.IDENTITY, P = T.position || [0, 0, 0], o = offs && c ? offs[c.id] : null;
    return { R: R, P: o ? [P[0] + o[0], P[1] + o[1], P[2] + o[2]] : P };
  }
  // a placement {R, P} followed by a relative one {R, P} (an inner component of a sub-assembly): A · B
  function composePl(A, B) {
    var a = A.R, b = B.R, R = new Array(9), r, k;
    for (r = 0; r < 3; r++) for (k = 0; k < 3; k++) R[r * 3 + k] = a[r * 3] * b[k] + a[r * 3 + 1] * b[3 + k] + a[r * 3 + 2] * b[6 + k];
    var p = B.P;
    return { R: R, P: [a[0] * p[0] + a[1] * p[1] + a[2] * p[2] + A.P[0], a[3] * p[0] + a[4] * p[1] + a[5] * p[2] + A.P[1], a[6] * p[0] + a[7] * p[1] + a[8] * p[2] + A.P[2]] };
  }
  // where slot s of a pose is placed in `model` (an inner component of a Flexible sub-assembly by its flexState)
  function slotPlace(s, offs, c) {
    var n = placeOf(c, offs);
    if (s.inner == null) return n;
    var fs = c.flexState && c.flexState[s.inner];
    return composePl(n, fs ? placeOf({ transform: fs }, null) : s.rel);
  }
  function poseBegin() {
    var bm = UI.getBodyMesh && UI.getBodyMesh(), m = App.mesh;
    if (!isAsm() || !bm || !m || !m.triCount || !App.build || !App.build.assembly || !UI.groups) return null;
    var comps = App.model.components || [], offs = App.build.explode && App.build.explode.offsets;
    var g = bm.geometry, pa = g.getAttribute('position'), na = g.getAttribute('normal');
    var vb = new Int32Array(m.triCount * 3), t;
    // r4/asm4: a slot per moving piece: each component, and each inner component of a Flexible sub-assembly (which
    // changes shape as it moves: its inner components are placed by the new flexState, no rebuild per frame)
    var slots = comps.map(function (c) { return { id: c.id, inner: null }; }), flexAt = {};
    m.faces.forEach(function (f) { for (t = f.start * 3; t < (f.start + f.count) * 3; t++) vb[t] = f.body || 0; });
    if (comps.some(function (c) { return c.flexible; })) {
      var parts = meshParts(m);
      if (!parts) return null;
      parts.forEach(function (p) {
        var sb = App.build.partBuilds[p.c.id];
        if (!p.c.flexible || !sb || !sb.flexible || !sb.model) return;
        var at = flexAt[p.c.id] = {}, lf = p.pe.mesh.faces, ci = comps.indexOf(p.c);
        function slotOf(ki) {
          var ic = sb.model.components[ki];
          if (!ic) return ci;
          if (at[ki] == null) { at[ki] = slots.length; slots.push({ id: p.c.id, inner: ic.id, rel: placeOf(ic, null), of: ci }); }
          return at[ki];
        }
        for (var k = 0; k < lf.length; k++) {
          var tt = m.faces[p.idx[k]].start;
          lf[k].polys.forEach(function (poly) {
            var s = slotOf(poly.asmInner || 0), nt = Math.max(0, poly.vertices.length - 2);
            for (var j = tt * 3; j < (tt + nt) * 3; j++) vb[j] = s;
            tt += nt;
          });
        }
      });
    }
    var base0 = comps.map(function (c) { return drawnAt && drawnAt.mesh === m && drawnAt.pl[c.id] ? drawnAt.pl[c.id] : placeOf(c, offs); });
    var st = { bm: bm, mesh: m, slots: slots,
      base: slots.map(function (s, i) { return s.inner == null ? base0[i] : composePl(base0[s.of], s.rel); }), ids: comps.map(function (c) { return c.id; }),
      origPos: pa, origNorm: na, pos0: new Float32Array(pa.array), norm0: na ? new Float32Array(na.array) : null, vb: vb, hidden: [] };
    st.pos = new THREE.BufferAttribute(new Float32Array(st.pos0), 3);
    st.norm = na ? new THREE.BufferAttribute(new Float32Array(st.norm0), 3) : null;
    g.setAttribute('position', st.pos);
    if (st.norm) g.setAttribute('normal', st.norm);
    // edges and silhouettes, rebuilt from App.edges with the component of every vertex (the drawn ones are hidden)
    var edges = App.edges || [], faces = m.faces, lp = [], lb = [], sp = [], sn1 = [], sn2 = [], sb = [], curves = App.curves || [], drawn = {};
    var silMat = null, edgeMat = null, linesOn = true;
    UI.groups.edges.children.forEach(function (o) {
      if (o.userData && o.userData.silhouette) silMat = o.material; else { edgeMat = o.material; linesOn = o.visible; }
      st.hidden.push([o, o.visible]); o.visible = false;
    });
    function bodyOfEdge(e) {   // its slot (r4/asm4: an inner component of a Flexible sub-assembly by e.inner)
      var f = faces[e.faces[0]], b = f ? f.body || 0 : 0, c = comps[b], at = c && flexAt[c.id];
      return at && e.inner != null && at[e.inner] != null ? at[e.inner] : b;
    }
    function shown(e) { for (var i = 0; i < e.faces.length; i++) { var f = faces[e.faces[i]]; if (f && !(UI.isBodyHidden && UI.isBodyHidden(f.body || 0)) && !UI.bodyGhost(f.body || 0)) return true; } return false; }
    edges.forEach(function (e) {
      if (!e.faces || !e.faces.length || !shown(e)) return;
      var b = bodyOfEdge(e);
      if (e.smooth) {
        if (e.faces.length !== 2) return;
        var n1 = faces[e.faces[0]].normal, n2 = faces[e.faces[1]].normal;
        if (!n1 || !n2 || n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] > 0.999999) return;
        sp.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]); sn1.push(n1[0], n1[1], n1[2], n1[0], n1[1], n1[2]); sn2.push(n2[0], n2[1], n2[2], n2[0], n2[1], n2[2]); sb.push(b, b);
        return;
      }
      if (e.curve != null && curves[e.curve]) {
        if (drawn[e.curve]) return;
        drawn[e.curve] = 1;
        var pts = curves[e.curve].pts;
        for (var i = 0; i + 1 < pts.length; i++) { lp.push(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]); lb.push(b, b); }
        return;
      }
      lp.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]); lb.push(b, b);
    });
    function lineSet(p, b, mat, extra) {
      var lg = new THREE.BufferGeometry();
      var o = { p0: new Float32Array(p), b: new Int32Array(b) };
      o.attr = new THREE.BufferAttribute(new Float32Array(o.p0), 3);
      lg.setAttribute('position', o.attr);
      (extra || []).forEach(function (x) { var a0 = new Float32Array(x[1]); o[x[0] + '0'] = a0; o[x[0]] = new THREE.BufferAttribute(new Float32Array(a0), 3); lg.setAttribute(x[0], o[x[0]]); });
      o.obj = new THREE.LineSegments(lg, mat);
      o.obj.frustumCulled = false;
      o.obj.visible = linesOn;
      o.obj.userData.asmPose = true;
      UI.groups.edges.add(o.obj);
      return o;
    }
    st.lines = edgeMat && lp.length ? lineSet(lp, lb, edgeMat) : null;
    st.sil = silMat && sp.length ? lineSet(sp, sb, silMat, [['n1', sn1], ['n2', sn2]]) : null;
    if (st.sil) st.sil.obj.userData.silhouette = true;
    st.hidden.push([UI.groups.highlight, UI.groups.highlight.visible]);
    UI.groups.highlight.visible = false;   // selection / hover overlays stay where the components were
    pose = st;
    return st;
  }
  // the delta of every component (R, t: x' = R x + t) from where it is drawn to its placement in `model`; null = still
  function poseDeltas(st, model, explode) {
    var offs = explode && explode.offsets, out = [], any = false;
    st.slots.forEach(function (s, i) {
      var c = AS.findComponent(model, s.id), b = st.base[i];
      if (!c || !b) { out.push(null); return; }
      var n = slotPlace(s, offs, c), A = n.R, B = b.R, R = new Array(9), same = true, r, k;
      for (r = 0; r < 3; r++) for (k = 0; k < 3; k++) R[r * 3 + k] = A[r * 3] * B[k * 3] + A[r * 3 + 1] * B[k * 3 + 1] + A[r * 3 + 2] * B[k * 3 + 2];   // A · Bᵀ
      var t = [n.P[0] - (R[0] * b.P[0] + R[1] * b.P[1] + R[2] * b.P[2]), n.P[1] - (R[3] * b.P[0] + R[4] * b.P[1] + R[5] * b.P[2]), n.P[2] - (R[6] * b.P[0] + R[7] * b.P[1] + R[8] * b.P[2])];
      for (k = 0; k < 9 && same; k++) if (Math.abs(R[k] - (k % 4 === 0 ? 1 : 0)) > 1e-12) same = false;
      if (same && Math.abs(t[0]) + Math.abs(t[1]) + Math.abs(t[2]) > 1e-12) same = false;
      out.push(same ? null : { R: R, t: t });
      if (!same) any = true;
    });
    return { list: out, any: any };
  }
  function moveVerts(src, dst, vb, D, point) {
    for (var v = 0, o = 0; v < vb.length; v++, o += 3) {
      var d = D[vb[v]];
      if (!d) { dst[o] = src[o]; dst[o + 1] = src[o + 1]; dst[o + 2] = src[o + 2]; continue; }
      var R = d.R, x = src[o], y = src[o + 1], z = src[o + 2];
      dst[o] = R[0] * x + R[1] * y + R[2] * z + (point ? d.t[0] : 0);
      dst[o + 1] = R[3] * x + R[4] * y + R[5] * z + (point ? d.t[1] : 0);
      dst[o + 2] = R[6] * x + R[7] * y + R[8] * z + (point ? d.t[2] : 0);
    }
  }
  function poseApply(model, explode) {
    var st = pose;
    if (st && (UI.getBodyMesh() !== st.bm || App.mesh !== st.mesh)) { poseEnd(true); st = null; }   // rebuilt meanwhile
    if (!st) st = poseBegin();
    if (!st) return false;
    var D = poseDeltas(st, model, explode).list;
    moveVerts(st.pos0, st.pos.array, st.vb, D, true); st.pos.needsUpdate = true;
    if (st.norm) { moveVerts(st.norm0, st.norm.array, st.vb, D, false); st.norm.needsUpdate = true; }
    if (st.lines) { moveVerts(st.lines.p0, st.lines.attr.array, st.lines.b, D, true); st.lines.attr.needsUpdate = true; }
    if (st.sil) {
      moveVerts(st.sil.p0, st.sil.attr.array, st.sil.b, D, true); st.sil.attr.needsUpdate = true;
      moveVerts(st.sil.n10, st.sil.n1.array, st.sil.b, D, false); st.sil.n1.needsUpdate = true;
      moveVerts(st.sil.n20, st.sil.n2.array, st.sil.b, D, false); st.sil.n2.needsUpdate = true;
    }
    var g = st.bm.geometry;
    g.computeBoundingBox(); g.computeBoundingSphere();
    if (explode !== undefined) drawExplodeLines(explode ? explode.lines : []);
    ghostFollow();   // r5/asm5: a transparent component moves with the pose
    if (UI.requestRender) UI.requestRender();
    return true;
  }
  // put the drawn buffers back (stale: the mesh was replaced by a rebuild, only drop the pose objects)
  function poseEnd(stale) {
    var st = pose;
    pose = null;
    if (!st) return;
    [st.lines, st.sil].forEach(function (o) { if (o && o.obj.parent) { o.obj.parent.remove(o.obj); o.obj.geometry.dispose(); } });
    st.hidden.forEach(function (h) { h[0].visible = h[1]; });
    if (!stale && UI.getBodyMesh() === st.bm) {
      var g = st.bm.geometry;
      g.setAttribute('position', st.origPos);
      if (st.origNorm) g.setAttribute('normal', st.origNorm);
      g.computeBoundingBox(); g.computeBoundingSphere();
    }
    drawnFor = undefined;
    ghostFollow();   // r5/asm5
    if (UI.requestRender) UI.requestRender();
  }
  // ---- glide: after a rebuild that moved components (a mate previewed in the Mate PM, Explode / Collapse), the
  // components travel from where they were drawn to their new places in GLIDE_MS instead of jumping (ease in-out;
  // nothing with prefers-reduced-motion). capture() before the rebuild, glide(captured) after it. A timer ends the
  // glide too, so a throttled background tab is never left mid-way.
  var GLIDE_MS = 220, glideTok = null;
  function capture() {
    var b = App.build;
    if (!isAsm() || !b || !b.assembly || !b.model) return null;
    var offs = b.explode && b.explode.offsets, out = {};
    (b.model.components || []).forEach(function (c) { var p = placeOf(c, offs); out[c.id] = { R: p.R.slice(), P: p.P.slice() }; });
    return out;
  }
  function reducedMotion() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function quatOf(R) {
    var m = new THREE.Matrix4();
    m.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }
  function det3(R) { return R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]); }
  function stopGlide(finish) {
    var g = glideTok;
    glideTok = null;
    if (!g) return;
    clearTimeout(g.timer);
    if (finish && pose) poseEnd();
  }
  function glide(from, ms) {
    stopGlide(true);
    if (!from || reducedMotion() || !isAsm() || !App.build || !App.build.assembly) return false;
    ms = ms == null ? GLIDE_MS : +ms;
    var offs = App.build.explode && App.build.explode.offsets, comps = App.model.components || [], parts = {}, moved = false;
    comps.forEach(function (c) {
      var a = from[c.id], b = placeOf(c, offs);
      if (!a) return;
      var d = Math.abs(a.P[0] - b.P[0]) + Math.abs(a.P[1] - b.P[1]) + Math.abs(a.P[2] - b.P[2]), k;
      for (k = 0; k < 9; k++) d += Math.abs(a.R[k] - b.R[k]);
      if (d < 1e-9) return;
      moved = true;
      var snap = det3(a.R) < 0 || det3(b.R) < 0;   // a mirrored instance: its position glides, its turn snaps
      parts[c.id] = { a: a, b: b, qa: snap ? null : quatOf(a.R), qb: snap ? null : quatOf(b.R) };
    });
    if (!moved || !(ms > 0) || !(pose || poseBegin())) return false;
    var tok = { t0: performance.now() }, q = new THREE.Quaternion(), m4 = new THREE.Matrix4();
    glideTok = tok;
    function at(u) {
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      return { components: comps.map(function (c) {
        var p = parts[c.id];
        if (!p) { var t = placeOf(c, offs); return { id: c.id, transform: { rotation: t.R, position: t.P } }; }
        var R = p.b.R;
        if (p.qa) { q.copy(p.qa).slerp(p.qb, e); m4.makeRotationFromQuaternion(q); var el = m4.elements; R = [el[0], el[4], el[8], el[1], el[5], el[9], el[2], el[6], el[10]]; }
        return { id: c.id, transform: { rotation: R, position: [p.a.P[0] + (p.b.P[0] - p.a.P[0]) * e, p.a.P[1] + (p.b.P[1] - p.a.P[1]) * e, p.a.P[2] + (p.b.P[2] - p.a.P[2]) * e] } };
      }) };
    }
    function frame() {
      if (glideTok !== tok) return;
      var u = Math.min(1, (performance.now() - tok.t0) / ms);
      if (u >= 1) { stopGlide(true); return; }
      poseApply(at(u));
      requestAnimationFrame(frame);
    }
    tok.timer = setTimeout(function () { if (glideTok === tok) stopGlide(true); }, ms + 60);
    poseApply(at(0));
    requestAnimationFrame(frame);
    return true;
  }
  UI.asmPose = { begin: poseBegin, apply: function (model, explode) { stopGlide(false); return poseApply(model, explode); },
    end: function () { stopGlide(false); poseEnd(); }, active: function () { return !!pose; }, capture: capture, glide: glide, gliding: function () { return !!glideTok; } };
  // a rebuild while a pose is shown (an undo, a script) replaced the drawn mesh: drop the pose, keep the new build
  // where every component was when the mesh on screen was built (a drag solve moves App.model before the pose begins)
  var drawnAt = null;
  (UI.onBuild = UI.onBuild || []).push(function () {
    stopGlide(false);
    if (pose && (UI.getBodyMesh() !== pose.bm || App.mesh !== pose.mesh)) poseEnd(true);
    drawnAt = isAsm() && App.build && App.build.assembly ? { mesh: App.mesh, pl: capture() } : null;
  });

  // ---- edges of an assembly mesh from its parts' edges (r3/assembly3). Kernel.bodyEdges over the whole assembly mesh
  // is most of a rebuild (160 ms on a plate with 30 pins); each part's edges are found once, on its own mesh (kept
  // with the part build), and placed like the component. ui-core.js edgesFor asks this first; null = the full search
  // (a component whose faces do not line up one to one with its part's, e.g. coplanar faces merged by rounding).
  // r4/asm4: the part's seams, true curves (UI.annotateCurveEdges) and smooth normals (UI.analyticNormals) are found
  // once per part build too and only placed: the returned list carries .curves (App.curves for this mesh), and
  // UI.asmNormals(m) gives the mesh's smooth normals; a drag release no longer searches the whole assembly for curves
  // (30-pin plate: curveSurfaces + curveEdges + annotate + normals 35-45 ms -> a few ms).
  function ekey(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }
  // r5/asm5: a Flexible sub-assembly gets a new composed build on every drag release (Assembly finishVirtual): its
  // edges, true curves and seams are placed from its inner parts' (found once per part build) instead of searched on
  // the whole sub-assembly mesh again (30-pin flexible: bodyEdges + curve search ~165 ms -> ~30 ms). The composed
  // body is the inner bodies placed and concatenated in order (Assembly composeSub), so inner polygon j of part k is
  // polygon base_k + j; null (the full search) when that does not hold (an inner multibody part, a dropped sliver).
  function flexEdges(pb, pl) {
    var sm = pb.model, ib = pb.partBuilds, bodies = pb.bodies, polys = pb.body && pb.body.polygons;
    if (!sm || !ib || !bodies || !polys || bodies.length !== (sm.components || []).length) return null;
    var parts = [], base = 0, k, j;
    for (k = 0; k < bodies.length; k++) {
      var n = bodies[k].polygons.length;
      if (n) {
        var ipb = ib[sm.components[k].id];
        if (!ipb || !ipb.body || ipb.body.polygons.length !== n) return null;
        parts.push({ k: k, base: base, pb: ipb, T: sm.components[k].transform });
      }
      base += n;
    }
    if (base !== polys.length) return null;
    // the inner parts' own edges (cached on their builds) and, per local face, the polygon indices it holds
    for (k = 0; k < parts.length; k++) {
      var P = parts[k], ip = P.pb.body.polygons;
      if (ip.some(function (p) { return p.body; })) {
        // r8/asm8: a sub-assembly nested in this one: its edges placed from its own parts (recursively), grouped where
        // it lands (pl composed with its transform); its faces' polygons come from that placed mesh's faceOf.
        // A multibody inner part (not a sub-assembly): its own edges are of a remeshed copy -> the full search.
        if (!(P.pb.assembly && P.pb.model && P.pb.bodies && P.pb.partBuilds)) return null;
        var TR = (P.T && P.T.rotation) || AS.IDENTITY, TP = (P.T && P.T.position) || [0, 0, 0], R0 = pl.R, P0 = pl.P, CR = [];
        for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) CR.push(R0[r * 3] * TR[c] + R0[r * 3 + 1] * TR[3 + c] + R0[r * 3 + 2] * TR[6 + c]);
        var ipl = { R: CR, P: [0, 1, 2].map(function (r) { return R0[r * 3] * TP[0] + R0[r * 3 + 1] * TP[1] + R0[r * 3 + 2] * TP[2] + P0[r]; }) };
        P.pe = partEdges(P.pb, ipl);
        if (!P.pe || !P.pe.composed || !P.pe.mesh.faceOf) return null;
        if (!P.pe.facePolys) {
          var fo = P.pe.mesh.faceOf, fl = P.pe.mesh.faces.map(function () { return []; });
          for (j = 0; j < fo.length; j++) { if (fo[j] < 0) return null; fl[fo[j]].push(j); }
          setHidden(P.pe, 'facePolys', fl);
        }
        continue;
      }
      P.pe = partEdges(P.pb);
      if (!P.pe.facePolys) {
        for (j = 0; j < ip.length; j++) ip[j].__ai = j;
        var fp = P.pe.mesh.faces.map(function (f) { return f.polys.map(function (p) { return p.__ai; }); });
        for (j = 0; j < ip.length; j++) delete ip[j].__ai;
        if (fp.some(function (l) { return l.some(function (x) { return x == null; }); })) return null;
        setHidden(P.pe, 'facePolys', fp);
      }
    }
    // the composed mesh, with its faces grouped as the assembly mesh groups them where the component is placed (pl):
    // coplanar facets split by a rounded plane key, which a translation can change (r10/asmfaces10: never across parts)
    var mesh = placedMesh(polys, pl);
    if (!mesh) return null;
    var faceOf = mesh.faceOf, edges = [], curves = [], curvesOk = true;
    for (k = 0; k < parts.length; k++) {
      var Q = parts[k], fmap = [], T = Q.T || {}, R = T.rotation || AS.IDENTITY, Pp = T.position || [0, 0, 0];
      for (j = 0; j < Q.pe.facePolys.length; j++) {
        var l = Q.pe.facePolys[j], f0 = faceOf[Q.base + l[0]], split = false;
        for (var q = 0; q < l.length; q++) { if (faceOf[Q.base + l[q]] < 0) return null; if (faceOf[Q.base + l[q]] !== f0) split = true; }
        // r7/asm7: a face split by rounding where it is placed (its facets' plane keys straddle a rounding step): each
        // edge of it goes to the piece holding a facet it bounds (resolved below)
        fmap.push(split ? l.map(function (x) { return Q.base + x; }) : f0);
      }
      var rot = function (v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; };
      var pt = function (v) { var r = rot(v); return [r[0] + Pp[0], r[1] + Pp[1], r[2] + Pp[2]]; };
      var c0 = curves.length;
      if (!Q.pe.curves) curvesOk = false;
      else Q.pe.curves.forEach(function (cv) {
        var C = cv.curve;
        curves.push({ curve: { center: pt(C.center), normal: rot(C.normal), xdir: rot(C.xdir), radius: C.radius, a0: C.a0, a1: C.a1, chords: (C.chords || []).map(function (ch) { return [pt(ch[0]), pt(ch[1])]; }) },
          pts: cv.pts.map(pt), edges: [] });
      });
      var piece = function (pis, m) {   // the world face of the facet (of a split face) whose boundary holds point m
        // r8/asm8: each facet's box first (a split face of a plate with 30 holes: ~2M segment tests -> a few thousand)
        var bb = pis.bb;
        if (!bb) {
          bb = pis.bb = new Float64Array(pis.length * 6);
          for (var b = 0; b < pis.length; b++) {
            var ws = polys[pis[b]].vertices, o6 = b * 6;
            bb[o6] = bb[o6 + 1] = bb[o6 + 2] = Infinity; bb[o6 + 3] = bb[o6 + 4] = bb[o6 + 5] = -Infinity;
            for (var w = 0; w < ws.length; w++) {
              var wp = ws[w].pos;
              bb[o6] = Math.min(bb[o6], wp.x); bb[o6 + 1] = Math.min(bb[o6 + 1], wp.y); bb[o6 + 2] = Math.min(bb[o6 + 2], wp.z);
              bb[o6 + 3] = Math.max(bb[o6 + 3], wp.x); bb[o6 + 4] = Math.max(bb[o6 + 4], wp.y); bb[o6 + 5] = Math.max(bb[o6 + 5], wp.z);
            }
          }
        }
        for (var i = 0; i < pis.length; i++) {
          var o = i * 6;
          if (m[0] < bb[o] - 1e-5 || m[1] < bb[o + 1] - 1e-5 || m[2] < bb[o + 2] - 1e-5 || m[0] > bb[o + 3] + 1e-5 || m[1] > bb[o + 4] + 1e-5 || m[2] > bb[o + 5] + 1e-5) continue;
          var vs = polys[pis[i]].vertices;
          for (var v = 0; v < vs.length; v++) {
            var A = vs[v].pos, B = vs[(v + 1) % vs.length].pos;
            if (K.pointSegmentDistance(m, [A.x, A.y, A.z], [B.x, B.y, B.z]) < 1e-6) return faceOf[pis[i]];
          }
        }
        return faceOf[pis[0]];
      };
      Q.pe.edges.forEach(function (e) {
        var a = pt(e.a), b = pt(e.b), m = pt(e.mid), o = { a: a, b: b, ka: ekey(a), kb: ekey(b), faces: e.faces.map(function (f) { var x = fmap[f]; return typeof x === 'number' ? x : piece(x, m); }), normals: e.normals.map(rot), ins: (e.ins || []).map(rot),
          mid: m, len: e.len, dir: rot(e.dir), smooth: e.smooth, convex: e.convex, inner: Q.k };
        if (e.seam) o.seam = true;
        if (e.curve != null && Q.pe.curves) { o.curve = c0 + e.curve; curves[o.curve].edges.push(o); }
        edges.push(o);
      });
    }
    var out = { mesh: mesh, edges: edges, curves: curvesOk ? curves : null, normals: null, composed: true, placed: plKey(pl) };
    try { out.normals = UI.analyticNormals ? UI.analyticNormals(mesh) : null; } catch (e) { out.normals = null; }
    return out;
  }
  function plKey(pl) { return pl ? pl.R.join() + '|' + pl.P.join() : ''; }
  // the mesh of local polygons `polys` (asmInner = their inner body) with faces grouped and ordered as Kernel.meshFromBody
  // groups them once placed by pl = { R, P } (Assembly worldBody: the same arithmetic, so the same rounded plane keys),
  // in local coordinates; .faceOf[i] = the face of polygon i. null when a polygon does not survive the placement.
  function placedMesh(polys, pl) {
    var R = pl ? pl.R : AS.IDENTITY, P = pl ? pl.P : [0, 0, 0], flip = det3(R) < 0;
    var world = CSG.fromPolygons(polys).transform(function (v) {
      return new CSG.Vector(R[0] * v.x + R[1] * v.y + R[2] * v.z + P[0], R[3] * v.x + R[4] * v.y + R[5] * v.z + P[1], R[6] * v.x + R[7] * v.y + R[8] * v.z + P[2]);
    }, flip);
    if (world.polygons.length !== polys.length) return null;
    world.polygons.forEach(function (p, i) { p.__ai = i; });
    var wm = K.meshFromBody(world), n = wm.triCount * 9, pos = new Float64Array(n), nrm = new Float32Array(n), faceOf = new Int32Array(polys.length).fill(-1);
    function back(x, y, z, o) {   // Rᵀ (x − P)
      x -= P[0]; y -= P[1]; z -= P[2];
      pos[o] = R[0] * x + R[3] * y + R[6] * z; pos[o + 1] = R[1] * x + R[4] * y + R[7] * z; pos[o + 2] = R[2] * x + R[5] * y + R[8] * z;
    }
    var src = wm.positions64 || wm.positions;
    for (var o = 0; o < n; o += 3) back(src[o], src[o + 1], src[o + 2], o);
    var faces = wm.faces.map(function (f, fi) {
      var w = f.normal, nl = [R[0] * w[0] + R[3] * w[1] + R[6] * w[2], R[1] * w[0] + R[4] * w[1] + R[7] * w[2], R[2] * w[0] + R[5] * w[1] + R[8] * w[2]];
      for (var t = f.start * 9; t < (f.start + f.count) * 9; t += 3) { nrm[t] = nl[0]; nrm[t + 1] = nl[1]; nrm[t + 2] = nl[2]; }
      var c = f.centroid, cl = [c[0] - P[0], c[1] - P[1], c[2] - P[2]];
      var lp = f.polys.map(function (p) { faceOf[p.__ai] = fi; var q = polys[p.__ai].clone(); q.asmInner = polys[p.__ai].body || 0; return q; });
      return { normal: nl, w: f.w - (w[0] * P[0] + w[1] * P[1] + w[2] * P[2]), start: f.start, count: f.count, area: f.area, body: 0, polys: lp,
        centroid: [R[0] * cl[0] + R[3] * cl[1] + R[6] * cl[2], R[1] * cl[0] + R[4] * cl[1] + R[7] * cl[2], R[2] * cl[0] + R[5] * cl[1] + R[8] * cl[2]] };
    });
    return { positions: new Float32Array(pos), positions64: pos, normals: nrm, faces: faces, triCount: wm.triCount, faceOf: faceOf };
  }
  function partEdges(pb, pl) {
    if (pb.__asmEdges && (!pb.__asmEdges.composed || pb.__asmEdges.placed === plKey(pl))) return pb.__asmEdges;
    // r7/asm7: a rigid sub-assembly too (its build carries model / bodies / partBuilds like a composed one): grouped
    // where it is placed, its coplanar faces of different inner parts merge (or not) as in the assembly mesh, so a
    // translation that moves a plane key across a rounding step no longer drops the whole assembly to the full search.
    // A rigid build is shared by every instance: the placed lists are kept per placement (a few).
    if ((pb.flexible || (pb.assembly && pb.model && pb.bodies && pb.partBuilds)) && pl) {
      var pk = plKey(pl), at = pb.__asmEdgesAt;
      if (at && at[pk]) { setHidden(pb, '__asmEdges', at[pk]); return at[pk]; }
      var fx = null;
      try { fx = flexEdges(pb, pl); } catch (e) { fx = null; }
      if (fx) {
        if (!at || Object.keys(at).length >= 8) setHidden(pb, '__asmEdgesAt', at = {});
        at[pk] = fx;
        setHidden(pb, '__asmEdges', fx); return fx;
      }
    }
    if (pb.__asmEdges) return pb.__asmEdges;
    // r4/asm4: a sub-assembly (or multibody part) is one body in the assembly mesh; mesh it the same way (body tags
    // dropped; r10/asmfaces10: part tags kept, a multibody part's bodies as parts, so faces never merge across parts
    // or bodies, as in the assembly mesh) and keep each polygon's inner index (asmInner)
    var body = pb.body, multi = body.polygons.some(function (p) { return p.body; });
    if (multi) body = CSG.fromPolygons(body.polygons.map(function (p) { var q = p.clone(); q.asmInner = p.body || 0; if (q.part == null) q.part = q.asmInner; return q; }));   // r10: a multibody part's bodies apart (Assembly partBody)
    var mesh = K.meshFromBody(body), out = { mesh: mesh, edges: K.bodyEdges(mesh), curves: null, normals: null };
    // the inner body an edge bounds (a Flexible sub-assembly's pose moves it with that body): the one of a face holding
    // a single inner body, else (two merged faces) the polygon whose side it lies on
    var faceInner = multi ? mesh.faces.map(function (f) { var v = f.polys[0].asmInner; for (var j = 1; j < f.polys.length; j++) if (f.polys[j].asmInner !== v) return -1; return v; }) : null;
    if (multi) out.edges.forEach(function (e) {
      for (var f = 0; f < e.faces.length && e.inner == null; f++) if (faceInner[e.faces[f]] >= 0) e.inner = faceInner[e.faces[f]];
      for (var i = 0; i < e.faces.length && e.inner == null; i++) {
        var ps = mesh.faces[e.faces[i]].polys;
        for (var j = 0; j < ps.length && e.inner == null; j++) {
          var vs = ps[j].vertices;
          for (var k = 0; k < vs.length; k++) {
            var a = vs[k].pos, b = vs[(k + 1) % vs.length].pos;
            if (K.pointSegmentDistance(e.mid, [a.x, a.y, a.z], [b.x, b.y, b.z]) < 1e-6) { e.inner = ps[j].asmInner; break; }
          }
        }
      }
    });
    // an OpenCascade part: edges inside one B-rep face are seams (as ui-core.js edgesFor marks them)
    var f0 = mesh.faces[0];
    if (f0 && f0.polys && f0.polys[0] && f0.polys[0].face != null) {
      out.edges.forEach(function (e) {
        if (e.faces.length !== 2) return;
        var a = mesh.faces[e.faces[0]].polys[0].face, b = mesh.faces[e.faces[1]].polys[0].face;
        if (a != null && a === b) { e.seam = true; e.smooth = true; }
      });
    }
    try { out.curves = UI.annotateCurveEdges ? UI.annotateCurveEdges(mesh, out.edges) : null; } catch (e) { out.curves = null; }
    try { out.normals = UI.analyticNormals ? UI.analyticNormals(mesh) : null; } catch (e) { out.normals = null; }
    try { Object.defineProperty(pb, '__asmEdges', { value: out, enumerable: false, configurable: true, writable: true }); } catch (e) { }
    return out;
  }
  var K = window.Kernel;
  function setHidden(o, k, v) { try { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); } catch (e) { o[k] = v; } }
  // the parts of mesh m (App.mesh of the assembly build): [{ c, pe, idx (world face indices), R, P }], or null when a
  // component's faces do not line up one to one with its part mesh's
  function meshParts(m) {
    var b = App.build;
    if (!isAsm() || !b || !b.assembly || !b.partBuilds || !m || m !== App.mesh || !K || !K.bodyEdges) return null;
    if (m.__asmParts !== undefined) return m.__asmParts;
    var comps = App.model.components || [], offs = b.explode && b.explode.offsets, byBody = comps.map(function () { return []; }), out = [];
    setHidden(m, '__asmParts', null);
    for (var fi = 0; fi < m.faces.length; fi++) { var bi = m.faces[fi].body || 0; if (!byBody[bi]) return null; byBody[bi].push(fi); }
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i], pb = b.partBuilds[c.id], idx = byBody[i];
      if (!idx.length) continue;
      if (!pb || !pb.body) return null;
      var pl = placeOf(c, offs), pe = partEdges(pb, pl), lf = pe.mesh.faces, R = pl.R;
      if (lf.length !== idx.length) return null;
      for (var k = 0; k < lf.length; k++) {
        var wf = m.faces[idx[k]], v = lf[k].normal, n = [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
        if (wf.polys.length !== lf[k].polys.length || wf.count !== lf[k].count || Math.abs(n[0] - wf.normal[0]) + Math.abs(n[1] - wf.normal[1]) + Math.abs(n[2] - wf.normal[2]) > 1e-6) return null;
        // the same corners in the same order (a mirrored instance whose triangles were turned over is not)
        var ws = wf.start * 9, ls = lf[k].start * 9, lp = pe.mesh.positions, wp = m.positions, P = pl.P;
        for (var q = 0; q < 9 && wf.count; q += 3) {
          var x = lp[ls + q], y = lp[ls + q + 1], z = lp[ls + q + 2];
          if (Math.abs(R[0] * x + R[1] * y + R[2] * z + P[0] - wp[ws + q]) + Math.abs(R[3] * x + R[4] * y + R[5] * z + P[1] - wp[ws + q + 1]) + Math.abs(R[6] * x + R[7] * y + R[8] * z + P[2] - wp[ws + q + 2]) > 1e-3) return null;
        }
      }
      out.push({ c: c, pe: pe, idx: idx, R: R, P: pl.P });
    }
    setHidden(m, '__asmParts', out);
    return out;
  }
  UI.asmEdges = function (m) {
    var parts = meshParts(m);
    if (!parts) return null;
    var list = [], curves = [], curvesOk = true;
    parts.forEach(function (p) {
      var pe = p.pe, idx = p.idx, R = p.R, P = p.P, c0 = curves.length;
      var rot = function (v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; };
      var pt = function (v) { var r = rot(v); return [r[0] + P[0], r[1] + P[1], r[2] + P[2]]; };
      if (!pe.curves) curvesOk = false;
      else pe.curves.forEach(function (cv) {
        var C = cv.curve;
        curves.push({ curve: { center: pt(C.center), normal: rot(C.normal), xdir: rot(C.xdir), radius: C.radius, a0: C.a0, a1: C.a1, chords: (C.chords || []).map(function (ch) { return [pt(ch[0]), pt(ch[1])]; }) },
          pts: cv.pts.map(pt), edges: [] });
      });
      pe.edges.forEach(function (e) {
        var a = pt(e.a), bb = pt(e.b), o = { a: a, b: bb, ka: ekey(a), kb: ekey(bb), faces: e.faces.map(function (f) { return idx[f]; }), normals: e.normals.map(rot), ins: (e.ins || []).map(rot),
          mid: pt(e.mid), len: e.len, dir: rot(e.dir), smooth: e.smooth, convex: e.convex };
        if (e.seam) o.seam = true;
        if (e.inner != null) o.inner = e.inner;
        if (e.curve != null && pe.curves) { o.curve = c0 + e.curve; curves[o.curve].edges.push(o); }
        list.push(o);
      });
    });
    if (curvesOk) list.curves = curves;
    return list;
  };
  // the smooth-shading normals of mesh m from its parts' (rotated), laid out like m.normals; null = work them out
  UI.asmNormals = function (m) {
    var parts = meshParts(m);
    if (!parts || !m.normals) return null;
    var out = new Float32Array(m.normals);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], src = p.pe.normals, lf = p.pe.mesh.faces, R = p.R;
      if (!src) return null;
      for (var k = 0; k < lf.length; k++) {
        var s = lf[k].start * 9, d = m.faces[p.idx[k]].start * 9, n = lf[k].count * 9;
        for (var j = 0; j < n; j += 3) {
          var x = src[s + j], y = src[s + j + 1], z = src[s + j + 2];
          out[d + j] = R[0] * x + R[1] * y + R[2] * z; out[d + j + 1] = R[3] * x + R[4] * y + R[5] * z; out[d + j + 2] = R[6] * x + R[7] * y + R[8] * z;
        }
      }
    }
    return out;
  };

  // Explode / Collapse (display state, no undo step) and the explode animation (steps run one after another).
  function setExploded(view) {
    if (!isAsm()) return fail('Not an assembly document');
    try { AS.setExploded(App.model, view === false || view == null ? false : view); }
    catch (e) { return fail(e.message || String(e)); }
    var from = capture();   // r3/assembly3: the components glide to their exploded / collapsed places
    return UI.afterRebuild(UI.rebuild(), function () { glide(from); UI.refreshTree(); var x = App.build.explode; UI.setStatus(x ? x.name + ' exploded.' : 'Collapsed.'); return !!x; });
  }
  var animating = null;
  // r3/assembly3: each frame solves the placements only and moves the drawn components (UI.asmPose; 40-60 ms full
  // rebuilds per frame before), eased in and out over the whole animation; one rebuild at the end
  function animateExplode(explode, ms, view) {
    if (!isAsm()) return fail('Not an assembly document');
    var v = AS.findExplodedView(App.model, view != null ? view : App.model.exploded != null ? App.model.exploded : null);
    if (!v || !v.steps.length) return fail('The assembly has no exploded view with steps.');
    explode = explode !== false;
    ms = ms == null ? 1500 : Math.max(0, +ms);
    if (animating) animating.cancel();
    App.model.exploded = v.id;
    return new Promise(function (resolve) {
      var t0 = performance.now(), stopped = false, posed = true;
      animating = { cancel: function () { stopped = true; } };
      function frame() {
        var f = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1, e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        var t = explode ? e : 1 - e;
        if (f < 1 && !stopped) {
          var pb = null;
          if (posed) { try { pb = AS.rebuild(App.model, App.asmCache, { explodeT: t, poseOnly: true, quick: true }); } catch (er) { pb = null; } }
          if (!(pb && UI.asmPose.apply(App.model, pb.explode || { offsets: {}, lines: [] }))) {
            posed = false;
            UI.asmBuildOpts = { explodeT: t };
            try { UI.rebuild({ noSave: true }); } finally { UI.asmBuildOpts = null; }
          }
          requestAnimationFrame(frame);
          return;
        }
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
    drawExplodeLines(b && b.explode ? b.explode.lines : []);
  }
  function drawExplodeLines(lines) {
    UI.disposeGroup(lineGroup);
    if (!lines || !lines.length) { if (UI.requestRender) UI.requestRender(); return; }
    var pos = [];
    lines.forEach(function (l) { pos.push(l.from[0], l.from[1], l.from[2], l.to[0], l.to[1], l.to[2]); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var seg = new THREE.LineSegments(g, lineMat);
    seg.computeLineDistances();
    seg.renderOrder = 5;
    lineGroup.add(seg);
    if (UI.requestRender) UI.requestRender(); else if (UI.render) UI.render();
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
      var row = h.treeItem({ icon: PAT_ICON[p.type], name: p.name, depth: 1, children: inst.length > 0, open: open, cls: 'pattern-folder' + (err ? ' err' : ''),
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
      var label = (k.fixed ? '(f) ' : co.overDefined ? '(+) ' : co.underDefined ? '(-) ' : '') + k.name, warn = co.suppressed;
      var tip = k.name + ' in ' + top.name + (co.error ? ': ' + co.error : warn ? ' (suppressed): ' + (co.warning || '') : co.underDefined ? ' (' + co.dof + ' degree' + (co.dof === 1 ? '' : 's') + ' of freedom left)' : '') +
        (k.source && k.source.file != null ? ' — linked to "' + k.source.file + '"' : '');
      var row = h.treeItem({ icon: isSub ? 'assembly' : 'component', name: label + (warn ? ' (suppressed)' : ''), depth: depth, title: tip,
        cls: 'component-row inner-row' + (warn ? ' suppressed' : '') + (co.error ? ' err' : ''), children: isSub, open: open, toggle: function () { h.expanded[key] = !open; h.refresh(); } });
      row.setAttribute('data-inner', key);
      if (co.error || co.overDefined || warn || co.warning) row.setAttribute('data-mark', co.error || co.overDefined ? 'err' : 'warn');   // r13/asmui13: badged by markAsmTree
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
    var fmark = mates.reduce(function (a, mt) { var ms = sb && sb.mates ? sb.mates[mt.id] || {} : {}; return mt.suppressed ? a : ms.error ? 'err' : a || (ms.warning ? 'warn' : null); }, null);
    if (fmark) folder.setAttribute('data-mark', fmark);   // r13/asmui13: the folder of a failing mate is badged too
    if (!mopen) return;
    mates.forEach(function (mt) {
      var ms = sb && sb.mates ? sb.mates[mt.id] || {} : {}, err = mt.suppressed ? null : ms.error;
      var r = h.treeItem({ icon: mateIcon(mt), name: mt.name, depth: depth + 1, cls: 'mate-row inner-row' + (err ? ' err' : '') + (mt.suppressed || ms.suppressed ? ' suppressed' : ''), title: err ? mt.name + ': ' + err : mt.name + ' in ' + top.name });
      if (err || (!mt.suppressed && ms.warning)) r.setAttribute('data-mark', err ? 'err' : 'warn');
      parent.appendChild(r);
    });
  }
  UI.asmRowDecor = function (c, st, h) {
    st = st || {};
    var linked = c.source && c.source.file != null, pb = partBuildOf(c), isSub = !!(st.subAssembly || (pb && pb.assembly && pb.model));
    if (!linked && !isSub && !st.suppressed) return null;
    var key = 'sub' + c.id, open = !!h.expanded[key];
    var d = {
      icon: isSub ? 'assembly' : 'component',
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
    // r5/asm5: display (as on the context toolbar)
    items.push({ label: isGhost(c.id) ? 'Change Transparency (opaque)' : 'Change Transparency', action: function () { setGhost(c.id, !isGhost(c.id)); } });
    items.push(isolated ? { label: 'Exit Isolate', action: function () { exitIsolate(); } } : { label: 'Isolate', action: function () { isolate(c.id); } });
    if (linked && !st.suppressed) items.push({ label: kind === 'assembly' ? 'Open Assembly' : 'Open Part', action: function () { run(openDocument(c.source.file, { from: c.name })); } });
    if (kind === 'part' && !st.suppressed && c.pattern == null) items.push({ label: 'Edit Part', action: function () { run(editPart(c.id)); } });
    if (kind === 'assembly' && !st.suppressed) items.push(c.flexible ? { label: 'Solve as Rigid', action: function () { run(setFlexible(c.id, false)); } } : { label: 'Solve as Flexible', action: function () { run(setFlexible(c.id, true)); } });
    if (!linked && c.pattern == null) items.push({ label: 'Make Linked Document…', action: function () { UI.promptDialog('Make Linked Document', 'Save ' + c.name + ' in this browser as (the component then links to it):', AS.findComponent(App.model, c.id) ? baseName(c.name) : '', function (n) { run(makeLinked(c.id, n)); }); } });
    if (issueOf('component', c.id) && UI.whatsWrong) items.push({ label: 'What\'s Wrong?', action: function () { UI.whatsWrong(c.id); } });   // r13/asmui13
    return items.length > 1 ? items : [];
  };
  function baseName(n) { return String(n || '').replace(/<\d+>$/, ''); }

  // Flip Mate Alignment (mate context menu, as in SolidWorks): Aligned <-> Anti-Aligned. A Closest mate takes the sense
  // opposite to the one it has now. The solver turns the component over (assembly.js tries half turns before it
  // reports a conflict). One undo step.
  // the alignment a flip gives mate mt (a Closest one: the sense opposite to the one its references have now)
  function flippedAlignment(mt) {
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
    return cur === 'aligned' ? 'anti-aligned' : 'aligned';
  }
  function flipMateAlignment(idOrName) {
    if (!isAsm()) return fail('Not an assembly document');
    var mt = AS.findMate(App.model, idOrName);
    if (!mt) return fail('No mate "' + idOrName + '"');
    if (!AS.hasAlignment(mt)) return fail(mt.name + ' has no alignment to flip');
    var next = flippedAlignment(mt), id = mt.id;
    return commit(function (m) { var x = AS.findMate(m, id); x.alignment = next; return x; }, function (x) {
      var st = App.build && App.build.mates && App.build.mates[x.id];
      return x.name + ' flipped to ' + (next === 'aligned' ? 'Aligned' : 'Anti-Aligned') + (st && st.error ? ': ' + st.error : '.');
    });
  }
  UI.flipMateAlignment = flipMateAlignment;
  UI.asmMateMenuExtras = function (mt) {
    var out = AS.hasAlignment(mt) ? [{ label: 'Flip Mate Alignment', action: function () { run(flipMateAlignment(mt.id)); } }] : [];
    if (issueOf('mate', mt.id) && UI.whatsWrong) out.push({ label: 'What\'s Wrong?', action: function () { UI.whatsWrong(mt.id); } });   // r13/asmui13
    return out;
  };

  // ------------------------------------------------------------------ r13/asmui13: FeatureManager marks
  // As round 12 did for parts (ui-rebuild.js): every row keeps its own icon (part / sub-assembly / mate type / pattern)
  // and gets a small red ✗ or amber ⚠ badge on it; a failing mate also badges the Mates folder and the components it
  // over-defines ("(+)"), a component with a warning (broken link, Flexible mate that failed, a sub-assembly or part
  // with rebuild errors) is badged amber, and the assembly's top row says how many errors / warnings there are.
  // A component row is lit while the pointer is over the component in the graphics area (and the component is lit
  // while the pointer is over its row); the row of the component owning a selected face or edge gets the owner mark.
  var MATE_ICON = { concentric: 'concentric', distance: 'distance', angle: 'angle', parallel: 'parallel', perpendicular: 'perpendicular', tangent: 'tangent', width: 'width', gear: 'gear', limitdistance: 'limitDistance', limitangle: 'limitAngle' };
  function mateIcon(mt) { return MATE_ICON[mt && mt.type] || 'coincident'; }
  UI.mateIcon = mateIcon;
  // issueOf('component' | 'mate' | 'pattern', id) -> { kind: 'err' | 'warn', msg } | null
  function issueOf(what, id) {
    var b = App.build && App.build.assembly ? App.build : null;
    if (!b) return null;
    var e = (b.errors || {})[id], w = (b.warnings || {})[id];
    if (what === 'mate') {
      var mt = AS.findMate(App.model, id), st = UI.mateStatus && mt ? UI.mateStatus(mt) : {};
      if (mt && mt.suppressed) return null;
      e = e || st.error; w = w || st.warning;
    } else if (what === 'component') {
      var cs = UI.compStatus ? UI.compStatus(id) : null;
      if (cs) { e = e || cs.error; w = w || cs.warning; }
      if (!e && cs && cs.overDefined) e = 'Over defined: ' + (cs.overMate || 'a mate') + ' cannot be satisfied';
    }
    return e ? { kind: 'err', msg: String(e) } : w ? { kind: 'warn', msg: String(w) } : null;
  }
  function markRow(row, iss, name) {
    if (!UI.rebuildBadge || !row) return;
    UI.rebuildBadge(row, iss ? iss.kind : null);
    row.classList.toggle('err', !!iss && iss.kind === 'err');
    row.classList.toggle('warn', !!iss && iss.kind === 'warn' && !row.classList.contains('suppressed'));
    if (!iss || !name) return;
    var tip = name + ' — ' + (iss.kind === 'err' ? 'error' : 'warning') + ':\n' + iss.msg + '\nRight-click ▸ What\'s Wrong? lists every error and warning.';
    row.title = tip;
    var nm = row.querySelector('.nm'); if (nm) nm.title = tip;
  }
  var FLEX_SVG = '<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><circle cx="4.5" cy="4.5" r="4.2" fill="#fff" stroke="#1f6fc5" stroke-width=".9"/><path d="M2 5.6c.8-2.4 1.8-2.4 2.5-1.1s1.7 1.3 2.5-1.1" fill="none" stroke="#1f6fc5" stroke-width="1.1" stroke-linecap="round"/></svg>';
  UI.asmTreeMarks = function (tree, root) {
    if (!isAsm() || !tree) return;
    var m = App.model;
    Array.prototype.forEach.call(tree.querySelectorAll('.ti.component-row[data-comp]'), function (row) {
      var id = +row.getAttribute('data-comp'), c = AS.findComponent(m, id);
      markRow(row, issueOf('component', id), c && c.name);
      if (c && c.flexible && row.children[1] && !row.children[1].querySelector('.asm-flex')) {   // a Flexible sub-assembly (SolidWorks: its icon with the flexible mark)
        var fx = document.createElement('i'); fx.className = 'asm-flex'; fx.title = 'Solved as Flexible'; fx.innerHTML = FLEX_SVG;
        row.children[1].classList.add('rb-ico'); row.children[1].appendChild(fx);
      }
    });
    var anyErr = null;
    Array.prototype.forEach.call(tree.querySelectorAll('.ti.mate-row[data-mate]'), function (row) {
      var id = +row.getAttribute('data-mate'), mt = AS.findMate(m, id), iss = issueOf('mate', id);
      markRow(row, iss, mt && (UI.mateLabel ? UI.mateLabel(mt) : mt.name));
    });
    (m.mates || []).forEach(function (mt) { var iss = issueOf('mate', mt.id); if (iss && (!anyErr || iss.kind === 'err')) anyErr = iss.kind; });
    var folder = tree.querySelector('.ti.mates-folder:not(.inner-row)');
    if (folder) { UI.rebuildBadge && UI.rebuildBadge(folder, anyErr); folder.classList.toggle('warn', anyErr === 'warn'); if (anyErr) folder.title = 'Mates: ' + (anyErr === 'err' ? 'a mate has an error' : 'a mate has a warning') + ' (right-click a mate ▸ What\'s Wrong?)'; }
    Array.prototype.forEach.call(tree.querySelectorAll('.ti.pattern-folder[data-pattern]'), function (row) {
      var id = +row.getAttribute('data-pattern'), p = AS.findPattern(m, id);
      markRow(row, issueOf('pattern', id), p && p.name);
    });
    Array.prototype.forEach.call(tree.querySelectorAll('.ti[data-mark]'), function (row) {
      if (UI.rebuildBadge) UI.rebuildBadge(row, row.getAttribute('data-mark'));
    });
    if (root && UI.rebuildMarkRoot) UI.rebuildMarkRoot(root);
    markOwners(tree);
    hoverRow = null; syncHoverRow();
  };
  // the component (index into App.model.components) under a selection / hover item
  function compIndexOf(s) {
    if (!s || !App.mesh) return -1;
    if (s.kind === 'body') return s.index;
    if (s.kind === 'face') { var f = App.mesh.faces[s.index]; return f ? f.body || 0 : -1; }
    if (s.kind === 'edge' && s.edge && s.edge.faces && s.edge.faces.length) { var g = App.mesh.faces[s.edge.faces[0]]; return g ? g.body || 0 : -1; }
    return -1;
  }
  function compRow(tree, i) {
    var c = (App.model.components || [])[i];
    return c && tree ? tree.querySelector('.ti.component-row[data-comp="' + c.id + '"]') : null;
  }
  function markOwners(tree) {
    var sel = [App.sel, App.sel2].concat(App.multi || []).filter(Boolean), own = {};
    sel.forEach(function (s) { if (s.kind !== 'body') { var i = compIndexOf(s); if (i >= 0) own[i] = true; } });
    Object.keys(own).forEach(function (i) { var r = compRow(tree, +i); if (r && !r.classList.contains('selected')) r.classList.add('sel-owner'); });
  }
  // a selection made in the graphics area scrolls its component's row into view (SolidWorks: Scroll selected item into view)
  function revealOwner() {
    var tree = document.getElementById('tree'), i = compIndexOf(App.sel);
    var row = i >= 0 ? compRow(tree, i) : null, box = tree && tree.parentElement;
    if (!row || !row.getClientRects().length) return;
    while (box && box !== document.body && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement;
    if (!box || box === document.body) return;
    var r = row.getBoundingClientRect(), bb = box.getBoundingClientRect();
    if (r.top < bb.top) box.scrollTop += r.top - bb.top - 4;
    else if (r.bottom > bb.bottom) box.scrollTop += r.bottom - bb.bottom + 4;
  }
  // hover sync: graphics -> tree (the row of the component under the pointer), tree -> graphics (the component lit)
  var hoverRow = null;
  function syncHoverRow() {
    var tree = document.getElementById('tree');
    var i = isAsm() && App.hover && !App.hover.fromTree ? compIndexOf(App.hover) : -1;
    var row = i >= 0 ? compRow(tree, i) : null;
    if (row === hoverRow) return;
    if (hoverRow) hoverRow.classList.remove('hover-sync');
    hoverRow = row;
    if (row) row.classList.add('hover-sync');
  }
  var baseUpdateHighlights = UI.updateHighlights;
  if (baseUpdateHighlights) UI.updateHighlights = function () { var r = baseUpdateHighlights.apply(this, arguments); if (isAsm() || hoverRow) syncHoverRow(); return r; };
  (function treeHover() {
    var tree = document.getElementById('tree');
    if (!tree) return;
    function rowOf(t) { return t && t.closest ? t.closest('.ti.component-row[data-comp], .ti.component-row.inner-row') : null; }
    function set(hv) {
      var cur = App.hover && App.hover.fromTree ? App.hover : null;
      if ((cur ? cur.index : -1) === (hv ? hv.index : -1)) return;
      if (!hv && !cur) return;
      App.hover = hv;
      if (UI.updateHighlights) UI.updateHighlights();
      if (UI.requestRender) UI.requestRender();
    }
    tree.addEventListener('mouseover', function (e) {
      if (!isAsm() || App.mode === 'sketch' || e.buttons) return;
      var row = rowOf(e.target), i = -1;
      if (row && row.hasAttribute('data-comp')) i = UI.componentIndex ? UI.componentIndex(+row.getAttribute('data-comp')) : -1;
      else if (row) { var top = /^sub(\d+)\//.exec(row.getAttribute('data-inner') || ''); i = top && UI.componentIndex ? UI.componentIndex(+top[1]) : -1; }
      if (i >= 0 && UI.isBodyHidden && UI.isBodyHidden(i)) i = -1;
      if (App.hover && !App.hover.fromTree && App.hover.kind !== 'body' && i < 0) return;
      set(i >= 0 ? { kind: 'body', index: i, fromTree: true } : null);
    });
    tree.addEventListener('mouseleave', function () { if (App.hover && App.hover.fromTree) set(null); });
  })();
  // What's Wrong (ui-rebuild.js): how an assembly item is edited. A mate: its Mate PM; a pattern: its PM; an over-defined
  // component: the mate that cannot be satisfied; a component whose part has rebuild errors: Edit Part.
  UI.asmIssueEdit = function (it) {
    if (!isAsm() || !it || it.id == null) return null;
    if (it.what === 'mate') {
      var mt = AS.findMate(App.model, it.id);
      return mt && UI.editMate ? { label: 'Edit Mate', title: 'Open ' + mt.name + ' in the Mate PropertyManager', run: function () { UI.editMate(mt); } } : null;
    }
    if (it.what === 'pattern') {
      var p = AS.findPattern(App.model, it.id);
      return p ? { label: 'Edit', title: 'Open ' + p.name + ' in its PropertyManager', run: function () { cmdComponentPattern(p.type, p); } } : null;
    }
    if (it.what === 'component') {
      var c = AS.findComponent(App.model, it.id), st = subStatus(c || {}) || {};
      if (!c) return null;
      if (st.overDefined && st.overMate) { var om = AS.findMate(App.model, st.overMate); if (om && UI.editMate) return { label: 'Edit Mate', title: 'Open ' + om.name, run: function () { UI.editMate(om); } }; }
      if (!st.suppressed && c.pattern == null && sourceKind(c) === 'part') return { label: 'Edit Part', title: 'Edit ' + c.name + ' in the context of the assembly', run: function () { run(editPart(c.id)); } };
    }
    return null;
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
      table.appendChild(el('tr', {}, ['ITEM NO.', 'PART NUMBER', 'DESCRIPTION', 'QTY.'].map(function (h) { return el('th', { text: h }); })));   // DESCRIPTION: r3/assembly3
      bomRows(sel.value).forEach(function (r) {
        var nm = el('td', { text: r.name + (r.kind === 'assembly' ? ' (assembly)' : '') + (r.file ? ' ↗' : '') });
        nm.style.paddingLeft = (6 + 14 * r.level) + 'px';
        var tr = el('tr', { class: 'bom-row', 'data-item': r.item }, [el('td', { text: r.item }), nm, el('td', { class: 'bom-desc', text: r.description || '' }), el('td', { text: String(r.qty) })]);
        table.appendChild(tr);
      });
    }
    sel.addEventListener('change', fill);
    fill();
    UI.showModal({ title: 'Bill of Materials — ' + App.model.name, body: el('div', {}, [el('label', { class: 'dlg-row' }, [el('span', { text: 'BOM Type' }), sel]), table]) });
  }

  // ribbon: the Bill of Materials placeholder opens the BOM
  if (tab) tab.forEach(function (b) {
    if (b && b.stack) b.stack.forEach(function (x, i) { if (x.label === 'Bill of Materials') b.stack[i] = { id: 'bom', label: 'Bill of Materials', run: function () { showBom(); } }; else if (x.label === 'Instant3D' && x.id === 'generic') x.id = 'instant'; });   // r13/asmui13: their own icons (drawing.js draws 'bom')
  });
  // r13/asmui13: the Assembly tab in SolidWorks' order (Insert Components, Mate | Linear Component Pattern, Move /
  // Rotate Component, Show / Hide | Exploded View, Bill of Materials); Fix / Float, which SolidWorks keeps on the
  // right-click menu, go last so a narrow window drops them into the » menu first.
  if (tab && ['insertComponent', 'mate', 'lpatternComp', 'moveComponent', 'hideshow', 'fix', 'float'].every(function (id) { return tab.some(function (b) { return b && b.id === id; }); })) (function () {
    function take(test) { for (var i = 0; i < tab.length; i++) if (tab[i] && test(tab[i])) return tab.splice(i, 1)[0]; return null; }
    var byId = function (id) { return take(function (b) { return b.id === id; }); };
    var ins = byId('insertComponent'), mate = byId('mate'), lp = byId('lpatternComp');
    var lpStack = take(function (b) { return b.stack && b.stack.some(function (x) { return x.id === 'cpatternComp'; }); });
    var mv = byId('moveComponent'), rot = byId('rotateComponent'), hs = byId('hideshow'), ex = byId('explode');
    var misc = take(function (b) { return b.stack && b.stack.some(function (x) { return x.label === 'Bill of Materials'; }); });
    var fix = byId('fix'), flt = byId('float');
    var rest = tab.filter(function (b) { return b && !b.sep; });   // anything this file does not know about stays, before Fix / Float
    tab.length = 0;
    [ins, mate, { sep: true }, lp, lpStack, mv, rot, hs, { sep: true }, ex, misc].concat(rest, [{ sep: true }, fix, flt]).forEach(function (b) { if (b) tab.push(b); });
    if (UI.refreshRibbon) try { UI.refreshRibbon(); } catch (e) { /* drawn at boot */ }
  })();

  // ------------------------------------------------------------------ pop-up toolbars (r5/asm5)
  // The small toolbars SolidWorks shows by the pointer: the Mate pop-up (SmartMates drop, two selections in the Mate
  // PM: mate types, Flip Mate Alignment, ✓ / ✗) and the context toolbar of a component clicked in the graphics area
  // (Mate, Hide, Change Transparency, Isolate, Fix / Float, Edit Part). One at a time; Enter = ✓, Esc = ✗.
  var popCss = false;
  function ensurePopCss() {
    if (popCss) return;
    popCss = true;
    var st = document.createElement('style');
    st.textContent = [
      '.asm-pop{position:fixed;z-index:60;display:flex;align-items:center;gap:1px;padding:3px;background:var(--panel);border:1px solid var(--line);border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,.2);transition:opacity .12s ease-out}',
      '.asm-pop button{display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid transparent;border-radius:3px;background:none;color:var(--text);cursor:pointer}',
      '.asm-pop button:hover{background:var(--hover);border-color:var(--blue-line)}',
      '.asm-pop button[aria-pressed="true"]{background:var(--blue-soft);border-color:var(--blue-line)}',
      '.asm-pop .sep{width:1px;align-self:stretch;margin:2px 3px;background:var(--line)}',
      '.asm-pop.ctx.far{opacity:.3}',
      '.asm-flyout{position:absolute;left:8px;top:44px;z-index:6;font-size:12px;color:var(--text);user-select:none;max-width:60%}',
      '.asm-flyout .fo-row{display:flex;align-items:center;gap:4px;height:21px;padding:0 8px 0 2px;border-radius:2px;cursor:default;white-space:nowrap}',
      '.asm-flyout .fo-row:hover{background:var(--hover);box-shadow:inset 0 0 0 1px var(--blue-line)}',
      '.asm-flyout .fo-row:not(.fo-head){padding-left:20px}',
      '.asm-flyout .fo-tw{width:12px;flex:none;font-size:9px;color:var(--muted);text-align:center}',
      '.asm-flyout svg{flex:none}',
      '.asm-isolate{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:6;display:flex;gap:6px;align-items:center;padding:4px 8px;background:var(--panel);border:1px solid var(--line);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:12px}',
      '.asm-isolate{gap:8px;padding:3px 4px 3px 8px;max-width:calc(100% - 24px)}',
      '.asm-isolate .iso-title{display:flex;align-items:center;gap:5px;flex:none}',
      '.asm-isolate .iso-what{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.asm-isolate .btn{height:22px;padding:0 10px;flex:none}'
    ].join('\n');
    document.head.appendChild(st);
  }
  var FLIP_SVG = '<svg class="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2v10M2.5 9.5 5 12l2.5-2.5M11 14V4M8.5 6.5 11 4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ISOLATE_SVG = '<svg class="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h4v4h-4zM10.5 7.5h4v4h-4z" fill="none" stroke="#9aa3ad" stroke-width=".9" stroke-dasharray="1.6 1.2"/><path d="M5.5 6.5 8 5l2.5 1.5v3L8 11 5.5 9.5z" fill="#f0c987" stroke="#4a5058" stroke-width="1" stroke-linejoin="round"/><path d="M5.5 6.5 8 8l2.5-1.5M8 8v3" fill="none" stroke="#4a5058" stroke-width=".8"/></svg>';   // r13/asmui13
  function iconHtml(name) { return typeof Icons === 'function' ? Icons(name, 16) : ''; }
  // the last press / release in the graphics area (client coordinates): where a pop-up goes
  var lastUp = null;
  var lastDown = null;   // (a click, not the end of a drag: the context toolbar)
  if (UI.viewport) UI.viewport.addEventListener('mousedown', function (e) { lastDown = { x: e.clientX, y: e.clientY, cmd: !!App.command }; }, true);
  if (UI.viewport) UI.viewport.addEventListener('mouseup', function (e) { lastUp = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, click: !!lastDown && !lastDown.cmd && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) <= 4 }; }, true);
  function viewportClient(q) {
    var r = UI.viewport ? UI.viewport.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
    if (q) return { x: r.left + q[0], y: r.top + q[1] };
    if (lastUp && performance.now() - lastUp.t < 3000) return { x: lastUp.x, y: lastUp.y };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  var popup = null;   // { el, kind, opts, items }
  function closePopup(how) {
    var p = popup;
    if (!p) return;
    popup = null;
    p.el.remove();
    document.removeEventListener('keydown', p.key, true);
    window.removeEventListener('mousedown', p.down, true);
    window.removeEventListener('mousemove', p.move, true);
    if (p.opts.onClose) p.opts.onClose(how);
  }
  // showPopup(at {x, y} client, kind 'mate' | 'ctx', label, items() -> [{ icon | svg, title, pressed, run, sep, ok, cancel }], opts)
  // opts.outside: what a press elsewhere does ('ok' runs the ✓ item; otherwise the pop-up just closes)
  function showPopup(at, kind, label, items, opts) {
    closePopup('replaced');
    ensurePopCss();
    opts = opts || {};
    var box = el('div', { class: 'asm-pop ' + kind, role: 'toolbar', 'aria-label': label });
    var p = { el: box, kind: kind, opts: opts, items: items };
    function render() {
      box.innerHTML = '';
      items().forEach(function (it) {
        if (it.sep) { box.appendChild(el('span', { class: 'sep' })); return; }
        var b = el('button', { type: 'button', title: it.title, 'aria-label': it.title, 'data-act': it.id || it.icon || '' });
        if (it.pressed != null) b.setAttribute('aria-pressed', it.pressed ? 'true' : 'false');
        b.innerHTML = it.svg || iconHtml(it.icon);
        b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); it.run(); if (popup === p) render(); });
        box.appendChild(b);
      });
    }
    p.render = render;
    function act(which) { var it = items().filter(function (x) { return x[which]; })[0]; if (it) it.run(); else closePopup(which); }
    p.key = function (e) {
      if (popup !== p) return;
      if (kind === 'ctx') { if (e.key === 'Escape') closePopup('esc'); return; }   // the keys stay the graphics area's
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); act('ok'); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); act('cancel'); }
    };
    p.down = function (e) { if (popup !== p || box.contains(e.target)) return; if (opts.outside === 'ok') act('ok'); else closePopup('outside'); };
    // the context toolbar fades as the pointer moves away from it and goes once it is far (SolidWorks)
    p.move = function (e) {
      if (popup !== p || kind !== 'ctx') return;
      var r = box.getBoundingClientRect(), dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right), dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom), d = Math.hypot(dx, dy);
      box.classList.toggle('far', d > 40);
      if (d > 180) closePopup('away');
    };
    render();
    document.body.appendChild(box);
    var w = box.offsetWidth || 200, h = box.offsetHeight || 34;
    box.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, at.x + 14)) + 'px';
    box.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, at.y + 14)) + 'px';
    popup = p;
    document.addEventListener('keydown', p.key, true);
    window.addEventListener('mousedown', p.down, true);
    window.addEventListener('mousemove', p.move, true);
    return p;
  }
  function typeItems(types, cur, pick) {
    return types.map(function (t) { return { icon: t, id: t, title: SMART_NAMES[t] || t, pressed: t === cur, run: function () { pick(t); } }; });
  }
  // SmartMates: the mate is added on the drop (one undo step); the pop-up changes its type or alignment within that step,
  // ✓ (or Enter, or a press elsewhere) keeps it, ✗ (Esc) takes it back
  function smartPopup(q, s) {
    var choices = SMART_CHOICES[s.kinds] || [s.type];
    function redo(type, alignment) {
      var from = capture();
      App.model = JSON.parse(s.pre);
      var mt = AS.addMate(App.model, type, clone(s.a), clone(s.b), alignment ? { alignment: alignment } : {});
      s.mateId = mt.id; s.type = type; s.alignment = alignment || null;
      return UI.afterRebuild(UI.rebuild(), function () {
        glide(from); UI.refreshTree(); UI.refreshStatus();
        var st = UI.mateStatus ? UI.mateStatus(mt) : {};
        UI.setStatus('SmartMates: ' + mt.name + (st.error ? ': ' + st.error : ' (' + s.comp + ')') + '.');
      });
    }
    showPopup(viewportClient(q), 'mate', 'SmartMates', function () {
      return typeItems(choices, s.type, function (t) { if (t !== s.type) redo(t, null); }).concat([
        { sep: true },
        { svg: FLIP_SVG, id: 'flip', title: 'Flip Mate Alignment', run: function () { var mt = AS.findMate(App.model, s.mateId); if (mt && AS.hasAlignment(mt)) redo(s.type, flippedAlignment(mt)); } },
        { sep: true },
        { icon: 'ok', id: 'ok', ok: true, title: 'Keep the mate (Enter)', run: function () { closePopup('ok'); UI.setStatus('SmartMates: mate kept.'); } },
        { icon: 'cancel', id: 'cancel', cancel: true, title: 'Take the mate back (Esc)', run: function () {
          closePopup('cancel');
          var from = capture();
          Promise.resolve(UI.undo()).then(function () { App.redo.pop(); glide(from); UI.setStatus('SmartMates: no mate added.'); });
        } }
      ]);
    }, { outside: 'ok' });
  }
  // the Mate PM's pop-up (ui-commands.js cmdMate calls this once both selections are made): o = { types() -> [type],
  // type() -> current, onType(t), onFlip(), onOK(), onCancel() }
  UI.asmMatePopup = function (o) {
    return showPopup(viewportClient(null), 'mate', 'Mate', function () {
      return typeItems(o.types(), o.type(), function (t) { o.onType(t); }).concat(o.flip === false ? [{ sep: true }] : [   // r7/asm7: o.flip false: none
        { sep: true },
        { svg: FLIP_SVG, id: 'flip', title: 'Flip Mate Alignment', run: function () { o.onFlip(); } },
        { sep: true }]).concat([
        { icon: 'ok', id: 'ok', ok: true, title: 'Add the mate (Enter)', run: function () { closePopup('ok'); o.onOK(); } },
        { icon: 'cancel', id: 'cancel', cancel: true, title: 'Clear the selections (Esc)', run: function () { closePopup('cancel'); o.onCancel(); } }
      ]);
    }, {});
  };
  UI.asmClosePopup = function (kind) { if (popup && (!kind || popup.kind === kind)) closePopup('closed'); };
  UI.asmPopup = function () { return popup ? { kind: popup.kind, el: popup.el, buttons: [].map.call(popup.el.querySelectorAll('button'), function (b) { return b.getAttribute('data-act'); }) } : null; };
  UI.asmFlippedAlignment = flippedAlignment;

  // ---- the component context toolbar: a click on a component in the graphics area (no command open)
  function ctxToolbar(at) {
    var c = selectedComponent();
    if (!c || !isAsm() || App.command || App.mode === 'sketch') return;
    var id = c.id, i = AS.componentIndex(App.model, id);
    showPopup(at || viewportClient(null), 'ctx', 'Component: ' + c.name, function () {
      var cc = AS.findComponent(App.model, id);
      if (!cc) return [];
      var out = [
        { icon: 'mate', id: 'mate', title: 'Mate', run: function () { closePopup('run'); mateFromSelection(); } },
        { icon: 'hideshow', id: 'hide', title: 'Hide Components', run: function () { closePopup('run'); UI.asm.setHidden(id, true); } },
        { svg: GHOST_SVG, id: 'transparency', title: 'Change Transparency', pressed: isGhost(id), run: function () { setGhost(id, !isGhost(id)); } },
        { svg: ISOLATE_SVG, id: 'isolate', title: isolated ? 'Exit Isolate' : 'Isolate', pressed: !!isolated, run: function () { closePopup('run'); if (isolated) exitIsolate(); else isolate(id); } },
        cc.fixed ? { icon: 'float', id: 'float', title: 'Float', run: function () { closePopup('run'); run(UI.asm.fix(id, false)); } }
          : { icon: 'fix', id: 'fix', title: 'Fix', run: function () { closePopup('run'); run(UI.asm.fix(id, true)); } }
      ];
      if (cc.pattern == null && sourceKind(cc) === 'part') out.push({ icon: 'part', id: 'edit', title: 'Edit Part', run: function () { closePopup('run'); run(editPart(id)); } });
      return out;
    }, {});
    void i;
  }
  // Mate from the context toolbar: the Mate PM opens with the clicked face as its first selection
  function mateFromSelection() {
    var s = App.sel, ref = null;
    if (s && s.kind === 'face' && App.mesh && App.mesh.faces[s.index]) {
      var pt = s.point || App.mesh.faces[s.index].centroid;
      try { ref = AS.refFromPick(App.model, App.build, s.index, pt, App.mesh); } catch (e) { ref = null; }
    }
    UI.cmdMate();
    if (ref && UI.mateSelect) UI.mateSelect(ref);
  }
  var baseSelChanged = UI.onSelectionChanged;
  UI.onSelectionChanged = function () {
    var r = baseSelChanged ? baseSelChanged.apply(this, arguments) : undefined;
    if (popup && popup.kind === 'ctx') closePopup('selection');
    // a left click in the graphics area that selected a component (not a drag, not a tree click)
    if (lastUp && lastUp.button === 0 && lastUp.click && performance.now() - lastUp.t < 400 && App.sel && !App.sel2 && !App.sel.mate) { ctxToolbar(); if (isAsm()) revealOwner(); }
    return r;
  };
  // r13/asmui13: a pop-up belongs to the document it was opened in (it stayed up over the next document opened)
  var popModel = null;
  (UI.onBuild = UI.onBuild || []).push(function () {
    if (popup && popModel && App.model !== popModel && (popup.kind === 'ctx' || !App.model || App.model.name !== popModel.name)) closePopup('document');
    popModel = App.model;
  });

  // a component clicked in the FeatureManager shows the context toolbar by the pointer too
  document.addEventListener('click', function (e) {
    var row = e.target && e.target.closest ? e.target.closest('.component-row[data-comp]') : null;
    if (!row || !isAsm() || App.command || e.button !== 0) return;
    if (!e.clientX && !e.clientY) return;   // r13/asmui13: row.click() from code (What's Wrong ▸ Go To) has no pointer to show it by
    var at = { x: e.clientX, y: e.clientY }, id = row.getAttribute('data-comp');
    setTimeout(function () { var c = selectedComponent(); if (c && String(c.id) === id && !popup) ctxToolbar(at); }, 0);
  });

  // ---- r13/asmui13: the flyout FeatureManager. While the Mate PM is open the origin planes are no longer drawn over the
  // model (they covered it); as in SolidWorks they are picked from the flyout tree at the top left of the graphics
  // area: "▸ Assem1" opens to Front / Top / Right Plane, hovering a row shows that plane, a click picks it.
  var flyout = null;
  function flyoutSync() {
    var want = isAsm() && App.command && App.command.quietPlanes && App.command.onPick && App.mode !== 'sketch';
    if (!want) { if (flyout) { flyout.el.remove(); flyout = null; if (App.hover && App.hover.flyout) { App.hover = null; UI.updatePlanes(); UI.updateHighlights(); } } return; }
    if (flyout && flyout.cmd === App.command && flyout.el.isConnected) return;
    if (flyout) flyout.el.remove();
    // a whole component selected before Mate is not a mate entity: drop its highlight so the picks read clearly
    if ([App.sel, App.sel2].some(function (s) { return s && s.kind === 'body'; })) { App.sel = null; App.sel2 = null; App.multi = []; UI.updateHighlights(); }
    ensurePopCss();
    var box = el('div', { class: 'asm-flyout', role: 'tree', 'aria-label': 'Flyout FeatureManager' });
    flyout = { el: box, cmd: App.command, open: false };
    ['mousedown', 'mousemove', 'wheel', 'dblclick', 'contextmenu'].forEach(function (t) { box.addEventListener(t, function (e) { e.stopPropagation(); }); });   // not a pick / hover in the graphics area
    function render() {
      box.innerHTML = '';
      var head = el('div', { class: 'fo-row fo-head', title: 'Pick an origin plane of the assembly' });
      head.innerHTML = '<span class="fo-tw">' + (flyout.open ? '▾' : '▸') + '</span>' + (typeof Icons === 'function' ? Icons('assembly', 16) : '') + '<span></span>';
      head.lastChild.textContent = App.model.name;
      head.addEventListener('click', function () { flyout.open = !flyout.open; render(); });
      box.appendChild(head);
      if (!flyout.open) return;
      ['Front', 'Top', 'Right'].forEach(function (r) {
        var row = el('div', { class: 'fo-row', 'data-plane': r });
        row.innerHTML = (typeof Icons === 'function' ? Icons('planeSmall', 16) : '') + '<span>' + r + ' Plane</span>';
        var hv = { kind: 'plane', ref: r, plane: window.Kernel.makePlane(r, 0), name: r + ' Plane', flyout: true };
        row.addEventListener('mouseenter', function () { App.hover = hv; UI.updatePlanes(); UI.updateHighlights(); if (UI.requestRender) UI.requestRender(); });
        row.addEventListener('mouseleave', function () { if (App.hover === hv) { App.hover = null; UI.updatePlanes(); UI.updateHighlights(); if (UI.requestRender) UI.requestRender(); } });
        row.addEventListener('click', function () {
          var cmd = App.command;
          if (App.hover === hv) App.hover = null;
          if (cmd && cmd.onPick) cmd.onPick({ kind: 'plane', ref: r, plane: hv.plane, name: hv.name });
          UI.updatePlanes(); UI.updateHighlights();
        });
        box.appendChild(row);
      });
    }
    render();
    if (UI.viewport) UI.viewport.appendChild(box);
  }
  UI.asmFlyout = function () { return flyout ? flyout.el : null; };
  (function watchPM() {
    var pmEl = document.getElementById('pm');
    if (!pmEl || !window.MutationObserver) return;
    var queued = false;
    new MutationObserver(function () { if (queued) return; queued = true; Promise.resolve().then(function () { queued = false; flyoutSync(); }); }).observe(pmEl, { attributes: true, attributeFilter: ['hidden'], childList: true });
  })();

  // ---- Isolate: every other component hidden until Exit Isolate (the hidden state before is put back)
  var isolated = null;   // { id, hidden (App.hiddenBodies before), bar }
  function isolate(id) {
    if (!isAsm()) return false;
    var i = AS.componentIndex(App.model, id);
    if (i < 0) return false;
    if (isolated) exitIsolate();
    var before = clone(App.hiddenBodies || {}), hid = {};
    (App.model.components || []).forEach(function (c, k) { if (k !== i) hid[k] = true; });
    App.hiddenBodies = hid;
    if (UI.setBodyHidden) UI.setBodyHidden(i, false);   // redraws with the new hidden set
    ensurePopCss();
    // r13/asmui13: SolidWorks' small Isolate toolbar: its title, what is isolated, Exit Isolate (Esc works too)
    var title = el('span', { class: 'iso-title' }); title.innerHTML = ISOLATE_SVG + '<b>Isolate</b>';
    var bar = el('div', { class: 'asm-isolate', role: 'toolbar', 'aria-label': 'Isolate' }, [title, el('span', { class: 'iso-what', text: compName(id), title: 'Isolated: ' + compName(id) }), el('button', { type: 'button', class: 'btn', text: 'Exit Isolate', title: 'Show the other components again (Esc)', onclick: function () { exitIsolate(); } })]);
    ['mousedown', 'mousemove', 'wheel', 'dblclick', 'contextmenu'].forEach(function (t) { bar.addEventListener(t, function (e) { e.stopPropagation(); }); });   // not a pick in the graphics area
    if (UI.viewport) UI.viewport.appendChild(bar);
    isolated = { id: id, hidden: before, bar: bar, model: App.model.name };
    UI.setStatus(compName(id) + ' isolated. Exit Isolate shows the other components again.');
    return true;
  }
  function exitIsolate() {
    var s = isolated;
    if (!s) return false;
    isolated = null;
    s.bar.remove();
    if (isAsm()) {
      App.hiddenBodies = s.hidden;
      if (UI.setBodyHidden) { var k = Object.keys(s.hidden)[0]; UI.setBodyHidden(k != null ? +k : 0, k != null); }
    }
    UI.setStatus('Exit Isolate.');
    return true;
  }
  (UI.onBuild = UI.onBuild || []).push(function () { if (isolated && (!isAsm() || App.model.name !== isolated.model)) { isolated.bar.remove(); isolated = null; } });
  document.addEventListener('keydown', function (e) {   // r13/asmui13: Esc leaves Isolate when nothing else takes it
    if (e.key !== 'Escape' || !isolated || App.command || popup || e.defaultPrevented) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var modal = document.getElementById('modal');
    if (modal && !modal.hidden) return;
    exitIsolate();
  });

  // ---- Change Transparency: a transparent component is drawn see-through (and clicks go through it to what is behind,
  // as in SolidWorks); kept on the component (r7/asm7). ui-core.js draws the opaque mesh without it
  // (UI.bodyGhost); the see-through copy shares the drawn positions, so a drag pose moves it too.
  var GHOST_SVG = '<svg class="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4" width="8" height="8" rx="1" fill="#7d98bd" fill-opacity=".9"/><rect x="6" y="2" width="8" height="8" rx="1" fill="#d5e0ef" fill-opacity=".55" stroke="currentColor" stroke-width="1"/></svg>';
  // r7/asm7: kept in the model (component.transparent: saved, undone with it, written by toScript); a toggle is one undo
  // step that only redraws (no rebuild).
  var ghostMesh = null, ghostMat = null, ghostFront = null;
  function ghostKeyOk() { return isAsm(); }
  function isGhost(id) { var c = isAsm() && AS.findComponent(App.model, id); return !!(c && c.transparent); }
  UI.bodyGhost = function (i) {
    if (!ghostKeyOk()) return false;
    var c = (App.model.components || [])[i];
    return !!(c && c.transparent);
  };
  UI.anyGhost = function () { return isAsm() && (App.model.components || []).some(function (c) { return c.transparent; }); };
  function setGhost(id, on) {
    var c = ghostKeyOk() && AS.findComponent(App.model, id);
    if (!c) return false;
    if (!!c.transparent !== !!on) { UI.pushUndo(); AS.setTransparent(App.model, c.id, on); if (UI.refreshTree) UI.refreshTree(); }
    var i = AS.componentIndex(App.model, id);
    if (UI.setBodyHidden) UI.setBodyHidden(i, !!(UI.isBodyHidden && UI.isBodyHidden(i)));   // redraw: the opaque mesh leaves it out
    drawGhosts();
    UI.setStatus(compName(id) + (on ? ' is transparent.' : ' is opaque again.'));
    return true;
  }
  function drawGhosts() {
    if (ghostMesh) { if (ghostMesh.parent) ghostMesh.parent.remove(ghostMesh); ghostMesh.children.forEach(function (o) { o.geometry.dispose(); }); ghostMesh.geometry.dispose(); ghostMesh = null; }
    var bm = UI.getBodyMesh && UI.getBodyMesh(), m = App.mesh;
    if (!UI.anyGhost() || !bm || !m || !m.triCount) { if (UI.requestRender) UI.requestRender(); return; }
    var idx = [];
    m.faces.forEach(function (f) {
      var b = f.body || 0;
      if (!UI.bodyGhost(b) || (UI.isBodyHidden && UI.isBodyHidden(b))) return;
      for (var t = f.start; t < f.start + f.count; t++) idx.push(t * 3, t * 3 + 1, t * 3 + 2);
    });
    if (!idx.length) return;
    var g = new THREE.BufferGeometry(), src = bm.geometry;
    g.setAttribute('position', src.getAttribute('position'));
    g.setAttribute('normal', src.getAttribute('normal'));
    if (src.getAttribute('color')) g.setAttribute('color', src.getAttribute('color'));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    var pm = bm.material;
    ghostMat = ghostMat || new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    ghostMat.color.copy(pm.color || new THREE.Color('#a8adb6'));
    ghostMat.vertexColors = !!pm.vertexColors;
    ghostMat.clippingPlanes = pm.clippingPlanes || null;
    ghostMat.needsUpdate = true;
    // r13/asmui13: back faces first, then front faces (one double-sided pass drew them in triangle order, so a far wall
    // could paint over a near one and the component looked blotchy as the view turned)
    ghostMat.side = THREE.BackSide;
    ghostFront = ghostFront || ghostMat.clone();
    ghostFront.copy(ghostMat); ghostFront.side = THREE.FrontSide; ghostFront.needsUpdate = true;
    ghostMesh = new THREE.Mesh(g, ghostMat);
    ghostMesh.renderOrder = 5;
    var front = new THREE.Mesh(g, ghostFront);
    front.renderOrder = 6; front.frustumCulled = false; front.userData.asmGhostFront = true;
    ghostMesh.add(front);
    ghostMesh.frustumCulled = false;
    ghostMesh.userData.asmGhost = true;
    // its edges, faint (SolidWorks draws a transparent component's edges too)
    var lp = [], curves = App.curves || [], drawn = {};
    (App.edges || []).forEach(function (e) {
      if (e.smooth || !e.faces || !e.faces.length) return;
      for (var k = 0; k < e.faces.length; k++) { var fb = m.faces[e.faces[k]]; if (!fb || !UI.bodyGhost(fb.body || 0)) return; }
      if (e.curve != null && curves[e.curve]) {
        if (drawn[e.curve]) return;
        drawn[e.curve] = 1;
        var pts = curves[e.curve].pts;
        for (var i = 0; i + 1 < pts.length; i++) lp.push(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
        return;
      }
      lp.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]);
    });
    if (lp.length) {
      var lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      ghostEdgeMat = ghostEdgeMat || new THREE.LineBasicMaterial({ color: 0x24292f, transparent: true, opacity: 0.3, depthWrite: false });
      ghostEdgeMat.clippingPlanes = pm.clippingPlanes || null;
      var lines = new THREE.LineSegments(lg, ghostEdgeMat);
      lines.frustumCulled = false;
      lines.userData.asmGhostEdges = true;
      ghostMesh.add(lines);
    }
    (bm.parent || UI.scene).add(ghostMesh);
    ghostFollow();
    if (UI.requestRender) UI.requestRender();
  }
  var ghostEdgeMat = null;
  // the see-through copy follows the drawn buffers (a pose swaps them in and out)
  function ghostFollow() {
    var bm = UI.getBodyMesh && UI.getBodyMesh();
    if (!ghostMesh || !bm) return;
    var g = ghostMesh.geometry, s = bm.geometry;
    if (g.getAttribute('position') !== s.getAttribute('position')) g.setAttribute('position', s.getAttribute('position'));
    if (s.getAttribute('normal') && g.getAttribute('normal') !== s.getAttribute('normal')) g.setAttribute('normal', s.getAttribute('normal'));
    ghostMesh.children.forEach(function (o) { if (o.userData.asmGhostEdges) o.visible = !pose; });   // its edges are where it was built: hidden while posed
  }
  (UI.onBuild = UI.onBuild || []).push(function () { Promise.resolve().then(drawGhosts); });
  var baseSetBodyHidden = UI.setBodyHidden;   // Hide / Show redraws the drawn mesh: the see-through copy with it
  if (baseSetBodyHidden) UI.setBodyHidden = function () { var r = baseSetBodyHidden.apply(this, arguments); if (ghostMesh || UI.anyGhost()) drawGhosts(); return r; };

  // ---- Insert Components: the part follows the pointer and a click drops it there (SolidWorks), r5/asm5. Its origin
  // goes on the face under the pointer, else on the plane through the assembly origin square to the view. The first
  // component stays at the origin (it is fixed there). o = { source, fixedAt?: [x, y, z], onMove(p), onPlace(p) }
  var ins = null;
  function insertBuild(source) {
    var model = AS.partModel(source), b = null;
    if (AS.isAssembly(model)) { var mm = clone(model); delete mm.exploded; b = AS.rebuild(mm, App.asmCache); }
    else b = K.rebuild(model);
    return b && b.body && b.body.polygons.length ? b : null;
  }
  function insertMesh(source) {
    var b = null;
    try { b = insertBuild(source); } catch (e) { b = null; }
    if (!b) return null;
    var m = K.meshFromBody(b.body), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    var mat = new THREE.MeshPhongMaterial({ color: 0x8fb4de, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    var obj = new THREE.Mesh(g, mat);
    obj.renderOrder = 8;
    obj.frustumCulled = false;
    obj.userData.asmInsertPreview = true;
    return obj;
  }
  function insertTarget(mx, my) {
    var h = UI.pickFace(mx, my);
    if (h && h.point) return h.point.slice();
    if (!UI.camera || !UI.size) return null;
    var ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(mx / UI.size.w * 2 - 1, -(my / UI.size.h) * 2 + 1), UI.camera);
    var n = new THREE.Vector3();
    UI.camera.getWorldDirection(n);
    var hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(n, 0), hit) ? [hit.x, hit.y, hit.z] : null;
  }
  function insertDrop(o) { if (o && o.parent) o.parent.remove(o); if (o) { o.geometry.dispose(); o.material.dispose(); } }
  function insertSetSource(source) {
    if (!ins) return;
    insertDrop(ins.obj);
    ins.source = source;
    ins.obj = source ? insertMesh(source) : null;
    if (ins.obj) { UI.scene.add(ins.obj); insertAt(ins.at); }
    if (UI.requestRender) UI.requestRender();
  }
  function insertAt(p) {
    if (!ins || !p) return;
    ins.at = p.slice();
    if (ins.obj) ins.obj.position.set(p[0], p[1], p[2]);
    if (UI.requestRender) UI.requestRender();
  }
  function insertStop() {
    var s = ins;
    if (!s) return;
    ins = null;
    insertDrop(s.obj);
    if (UI.viewport) { UI.viewport.removeEventListener('mousemove', s.move); UI.viewport.removeEventListener('mousedown', s.down, true); UI.viewport.removeEventListener('mouseup', s.up, true); }
    if (UI.requestRender) UI.requestRender();
  }
  function insertStart(o) {
    insertStop();
    var s = ins = { at: o.fixedAt ? o.fixedAt.slice() : (o.at || [0, 0, 0]).slice(), fixed: !!o.fixedAt, obj: null, press: null };
    function vp(e) { var r = UI.viewport.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    var raf = 0, last = null;
    s.move = function (e) {
      if (ins !== s || s.fixed || e.buttons) return;
      last = vp(e);
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (ins !== s || !last) return;
        var p = insertTarget(last[0], last[1]);
        if (p) { insertAt(p); if (o.onMove) o.onMove(p); }
      });
    };
    s.down = function (e) { s.press = e.button === 0 ? [e.clientX, e.clientY] : null; };
    s.up = function (e) {
      if (ins !== s || e.button !== 0 || !s.press || Math.hypot(e.clientX - s.press[0], e.clientY - s.press[1]) > 4) return;
      var q = vp(e), p = s.fixed ? s.at : insertTarget(q[0], q[1]);
      if (!p) return;
      insertAt(p);
      setTimeout(function () { if (ins === s && o.onPlace) o.onPlace(p); }, 0);   // after the click's own handling
    };
    if (UI.viewport) { UI.viewport.addEventListener('mousemove', s.move); UI.viewport.addEventListener('mousedown', s.down, true); UI.viewport.addEventListener('mouseup', s.up, true); }
    insertSetSource(o.source);
    return s;
  }
  UI.asmInsertPreview = { start: insertStart, stop: insertStop, source: insertSetSource, at: insertAt,
    state: function () { return ins ? { at: ins.at.slice(), shown: !!(ins.obj && ins.obj.parent), fixed: ins.fixed } : null; } };

  // ---- Tab hides the component under the pointer, Shift + Tab shows the hidden one under it (SolidWorks shortcuts)
  var overVp = null;   // the pointer in the graphics area (viewport coordinates), null when outside
  if (UI.viewport) {
    UI.viewport.addEventListener('mousemove', function (e) { var r = UI.viewport.getBoundingClientRect(); overVp = [e.clientX - r.left, e.clientY - r.top]; });
    UI.viewport.addEventListener('mouseleave', function () { overVp = null; });
  }
  var hidRay = null, hidGeo = null;
  // the body index of the hidden component under (mx, my), or -1 (a ray through every drawn triangle, hidden ones too)
  function hiddenAt(mx, my) {
    var bm = UI.getBodyMesh && UI.getBodyMesh(), m = App.mesh;
    if (!bm || !m || !UI.camera || !UI.size) return -1;
    var pos = bm.geometry.getAttribute('position');
    if (!hidGeo || hidGeo.getAttribute('position') !== pos) { if (hidGeo) hidGeo.dispose(); hidGeo = new THREE.BufferGeometry(); hidGeo.setAttribute('position', pos); }
    hidRay = hidRay || new THREE.Raycaster();
    hidRay.setFromCamera(new THREE.Vector2(mx / UI.size.w * 2 - 1, -(my / UI.size.h) * 2 + 1), UI.camera);
    var hits = hidRay.intersectObject(new THREE.Mesh(hidGeo, bm.material), false), faces = m.faces;
    for (var i = 0; i < hits.length; i++) {
      var tri = hits[i].faceIndex, lo = 0, hi = faces.length - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1, f = faces[mid];
        if (tri < f.start) hi = mid - 1; else if (tri >= f.start + f.count) lo = mid + 1;
        else { var b = f.body || 0; if (UI.isBodyHidden(b)) return b; if (!UI.bodyGhost(b)) return -1; break; }   // behind a shown one: none
      }
    }
    return -1;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || !overVp || !isAsm() || App.mode === 'sketch' || e.defaultPrevented) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (UI.hasPM && UI.hasPM() && App.command && !App.command.dragComponents && tag === 'button')) return;
    var comps = App.model.components || [], c = null;
    if (e.shiftKey) { var bi = hiddenAt(overVp[0], overVp[1]); c = bi >= 0 ? comps[bi] : null; }
    else { var h = UI.pickFace(overVp[0], overVp[1]), f = h && App.mesh.faces[h.index]; c = f ? comps[f.body || 0] : null; }
    if (!c) return;
    e.preventDefault();
    UI.asm.setHidden(c.id, !e.shiftKey);
  });

  // ------------------------------------------------------------------ exports and window.anvil
  UI.asmIsolate = { isolate: isolate, exit: exitIsolate, active: function () { return isolated ? isolated.id : null; } };
  UI.asmGhost = { set: setGhost, is: isGhost, list: function () { return ghostKeyOk() ? App.model.components.filter(function (c) { return c.transparent; }).map(function (c) { return c.id; }) : []; } };
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
    A.transparent = function (id, on) { var c = isAsm() && AS.findComponent(App.model, id); if (!c) return Promise.reject(new Error('Unknown component ' + JSON.stringify(id))); setGhost(c.id, on !== false); return Promise.resolve(c.id); };   // r7/asm7
    A.openPart = function (idOrName) {
      var c = isAsm() ? AS.findComponent(App.model, idOrName) : null;
      if (c && c.source && c.source.file != null) return openDocument(c.source.file, { from: c.name });
      return openDocument(idOrName);
    };
    A.editPart = function (idOrName) { var c = isAsm() ? AS.findComponent(App.model, idOrName) : null; return c ? editPart(c.id) : fail('Unknown component ' + JSON.stringify(idOrName)); };
    A.returnToAssembly = function () { return returnToAssembly(); };
    A.docStack = function () { return UI.asmDocs.stack(); };
    A.bom = function (type) { return bomRows(type || 'top').map(function (r) { return { item: r.item, level: r.level, name: r.name, description: r.description || '', kind: r.kind, qty: r.qty, file: r.file || null }; }); };
    A.packAndGo = function () { return isAsm() ? AS.packAndGo(App.model) : null; };
    A.saveReferences = function () { return isAsm() ? AS.saveReferences(App.model) : []; };
    A.explodedViews = function () {
      if (!isAsm()) return [];
      return (App.model.explodedViews || []).map(function (v) { return { id: v.id, name: v.name, exploded: App.model.exploded === v.id, steps: v.steps.map(function (s) { return { id: s.id, name: s.name, components: s.components.map(compName), direction: s.direction.slice(), distance: s.distance }; }) }; });
    };
  }
})(UI);
