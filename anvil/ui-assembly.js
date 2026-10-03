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
  function poseBegin() {
    var bm = UI.getBodyMesh && UI.getBodyMesh(), m = App.mesh;
    if (!isAsm() || !bm || !m || !m.triCount || !App.build || !App.build.assembly || !UI.groups) return null;
    var comps = App.model.components || [], offs = App.build.explode && App.build.explode.offsets;
    var g = bm.geometry, pa = g.getAttribute('position'), na = g.getAttribute('normal');
    var vb = new Int32Array(m.triCount * 3);
    m.faces.forEach(function (f) { for (var t = f.start * 3; t < (f.start + f.count) * 3; t++) vb[t] = f.body || 0; });
    var st = { bm: bm, mesh: m, base: comps.map(function (c) { return placeOf(c, offs); }), ids: comps.map(function (c) { return c.id; }),
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
    function bodyOfEdge(e) { var f = faces[e.faces[0]]; return f ? f.body || 0 : 0; }
    function shown(e) { for (var i = 0; i < e.faces.length; i++) { var f = faces[e.faces[i]]; if (f && !(UI.isBodyHidden && UI.isBodyHidden(f.body || 0))) return true; } return false; }
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
    st.ids.forEach(function (id, i) {
      var c = AS.findComponent(model, id), b = st.base[i];
      if (!c || !b) { out.push(null); return; }
      var n = placeOf(c, offs), A = n.R, B = b.R, R = new Array(9), same = true, r, k;
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
  (UI.onBuild = UI.onBuild || []).push(function () { stopGlide(false); if (pose && (UI.getBodyMesh() !== pose.bm || App.mesh !== pose.mesh)) poseEnd(true); });

  // ---- edges of an assembly mesh from its parts' edges (r3/assembly3). Kernel.bodyEdges over the whole assembly mesh
  // is most of a rebuild (160 ms on a plate with 30 pins); each part's edges are found once, on its own mesh (kept
  // with the part build), and placed like the component. ui-core.js edgesFor asks this first; null = the full search
  // (a component whose faces do not line up one to one with its part's, e.g. coplanar faces merged by rounding).
  function ekey(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }
  function partEdges(pb) {
    if (pb.__asmEdges) return pb.__asmEdges;
    var mesh = K.meshFromBody(pb.body), out = { mesh: mesh, edges: K.bodyEdges(mesh) };
    try { Object.defineProperty(pb, '__asmEdges', { value: out, enumerable: false, configurable: true, writable: true }); } catch (e) { }
    return out;
  }
  var K = window.Kernel;
  UI.asmEdges = function (m) {
    var b = App.build;
    if (!isAsm() || !b || !b.assembly || !b.partBuilds || !m || m !== App.mesh || !K || !K.bodyEdges) return null;
    var comps = App.model.components || [], offs = b.explode && b.explode.offsets, byBody = comps.map(function () { return []; }), list = [];
    for (var fi = 0; fi < m.faces.length; fi++) { var bi = m.faces[fi].body || 0; if (!byBody[bi]) return null; byBody[bi].push(fi); }
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i], pb = b.partBuilds[c.id], idx = byBody[i];
      if (!idx.length) continue;
      if (!pb || !pb.body) return null;
      var pe = partEdges(pb), lf = pe.mesh.faces, pl = placeOf(c, offs), R = pl.R, P = pl.P;
      if (lf.length !== idx.length) return null;
      var rot = function (v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; };
      var pt = function (v) { var r = rot(v); return [r[0] + P[0], r[1] + P[1], r[2] + P[2]]; };
      for (var k = 0; k < lf.length; k++) {
        var wf = m.faces[idx[k]], n = rot(lf[k].normal);
        if (wf.polys.length !== lf[k].polys.length || Math.abs(n[0] - wf.normal[0]) + Math.abs(n[1] - wf.normal[1]) + Math.abs(n[2] - wf.normal[2]) > 1e-6) return null;
      }
      pe.edges.forEach(function (e) {
        var a = pt(e.a), bb = pt(e.b), o = { a: a, b: bb, ka: ekey(a), kb: ekey(bb), faces: e.faces.map(function (f) { return idx[f]; }), normals: e.normals.map(rot), ins: (e.ins || []).map(rot),
          mid: pt(e.mid), len: e.len, dir: rot(e.dir), smooth: e.smooth, convex: e.convex };
        list.push(o);
      });
    }
    return list;
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
      var label = (k.fixed ? '(f) ' : co.overDefined ? '(+) ' : co.underDefined ? '(-) ' : '') + k.name, warn = co.suppressed;
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
