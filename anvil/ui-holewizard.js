// ui-holewizard.js — the Hole Wizard PropertyManager (Type / Positions tabs) and the viewport's cosmetic threads.
// Loaded after ui-commands.js; the kernel side (ISO table, 'hole' feature, script API) is holewizard.js.
//
// UI.cmdHoleWizard(existing?) opens the PM. Type tab: Hole Type, Hole Specifications (ISO size, fit), End Condition.
// Positions tab: the first click on a planar face places the first hole there; further clicks on the same face add
// holes; a click on another face starts over on that face. OK stores a points sketch on the face plus one 'hole'
// feature in one undo step (an edit rewrites both). UI.updateCosmeticThreads() draws a dashed circle at the major
// diameter of every Straight Tap hole (called from applyBuild).
(function () {
  'use strict';
  var K = Kernel, HW = HoleWizard, App = UI.App;

  function fmt(x) { return UI.fmtNum(x, 2); }
  function specText(v) {
    var s;
    try { s = HW.spec({ holeType: v.holeType, size: v.size, fit: v.fit }); } catch (e) { return ''; }
    var t = 'Ø' + fmt(s.dia);
    if (s.cbore) t += ' · CBORE Ø' + fmt(s.cbore.dia) + ' ↧ ' + fmt(s.cbore.depth);
    if (s.csk) t += ' · CSK Ø' + fmt(s.csk.dia) + ' × ' + s.csk.angle + '°';
    if (s.thread) t += ' · ' + s.thread.label + ' (tap drill)';
    return t;
  }

  function cmdHoleWizard(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var sk = existing ? K.findFeature(App.model, existing.sketch) : null;
    var v = existing ? { holeType: existing.holeType, size: existing.size, fit: existing.fit || 'normal', end: existing.end, depth: +existing.depth || 10, threadDepth: +(existing.threadDepth || existing.depth) || 10 }
      : { holeType: 'cbore', size: 'M6', fit: 'normal', end: 'blind', depth: 16, threadDepth: 12 };
    v.tab = existing ? 'type' : 'positions';
    v.face = sk ? sk.plane : null;
    v.points = sk ? sk.entities.filter(function (e) { return e.t === 'point'; }).map(function (e) { return [e.x, e.y]; }) : [];
    function tab(name) { v.tab = name; UI.renderPM(); }
    function isType(x) { return x.tab === 'type'; }
    function isPos(x) { return x.tab === 'positions'; }
    function feature(sketchId) {
      var f = HW.newFeature({ type: v.holeType, size: v.size, fit: v.fit, end: v.end, depth: v.end === 'blind' ? +v.depth : 0, threadDepth: +v.threadDepth });
      f.sketch = sketchId;
      return f;
    }
    function samePlane(a, b) {
      return a && b && Math.abs(K.vec.dot(a.n, b.n) - 1) < 1e-9 && Math.abs(K.vec.dot(a.n, a.origin) - K.vec.dot(b.n, b.origin)) < 1e-6;
    }
    UI.openPM({
      title: 'Hole Wizard', icon: 'holeWizard', values: v,
      message: existing ? 'Edit the hole type, or open <b>Positions</b> to move the holes.' : 'Click a <b>planar face</b> to place the first hole; click again to add holes. Set the type on the <b>Type</b> tab.',
      command: {
        onPick: function (pk) {
          if (pk.kind !== 'face' || !App.mesh || !App.mesh.faces[pk.index]) return false;
          // r10/facesketch10: the positions sketch references the face, so the holes follow it (UI.facePlane)
          var plane = UI.facePlane ? UI.facePlane(App.mesh.faces[pk.index], pk.point) : K.planeFromFace(App.mesh.faces[pk.index].normal, pk.point);
          if (v.face && samePlane(v.face, plane)) plane = v.face; else { v.face = plane; v.points = []; }
          var uv = K.to2D(plane, pk.point);
          v.points.push([Math.round(uv[0] * 1e4) / 1e4, Math.round(uv[1] * 1e4) / 1e4]);
          v.tab = 'positions';
          UI.pmSpec().message = v.points.length + ' hole position' + (v.points.length === 1 ? '' : 's') + ' on the face. Click to add more, or accept.';
          UI.pmSpec().messageOk = true;
          UI.renderPM(); preview();
          return true;
        }
      },
      groups: [
        { title: 'Tabs', fields: [{ type: 'buttons', buttons: [{ label: 'Type', onclick: function () { tab('type'); } }, { label: 'Positions', onclick: function () { tab('positions'); } }] },
          { type: 'static', label: 'Showing', value: function (x) { return x.tab === 'type' ? 'Type' : 'Positions'; } }] },
        { title: 'Hole Type', show: isType, fields: [{ type: 'select', label: 'Type', key: 'holeType', options: HW.TYPES, rerender: true }] },
        { title: 'Hole Specifications', show: isType, fields: [
          { type: 'static', label: 'Standard', value: 'ISO' },
          { type: 'select', label: 'Size', key: 'size', options: HW.ISO.map(function (r) { return [r.size, r.size]; }), rerender: true },
          { type: 'select', label: 'Fit', key: 'fit', options: HW.FITS, rerender: true, show: function (x) { return x.holeType !== 'tap'; } },
          { type: 'static', label: 'Hole', value: specText }] },
        { title: 'End Condition', show: isType, fields: [
          { type: 'select', label: 'End condition', key: 'end', options: [['blind', 'Blind'], ['through', 'Through All']], rerender: true },
          { type: 'number', label: 'Depth', key: 'depth', unit: 'u', min: 0, show: function (x) { return x.end === 'blind'; } },
          { type: 'number', label: 'Thread depth', key: 'threadDepth', unit: 'u', min: 0, show: function (x) { return x.end === 'blind' && x.holeType === 'tap'; } }] },
        { title: 'Hole Position', show: isPos, fields: [
          // r5/select5: a row per hole position (hover: a ring on the model; Delete / right-click: removed), as in the
          // other PropertyManagers' selection lists
          { type: 'pick', icon: 'plane', value: function (x) { return x.face ? x.points.length + ' point' + (x.points.length === 1 ? '' : 's') + ' on a face' : ''; }, placeholder: 'Click a planar face',
            items: function (x) { return x.face ? x.points.map(function (q, i) { return { label: 'Point' + (i + 1) + '  (' + fmt(q[0]) + ', ' + fmt(q[1]) + ')', at: K.to3D(x.face, q[0], q[1]) }; }) : []; },
            onRemove: function (x, i) { x.points.splice(i, 1); UI.renderPM(); preview(); },
            onClear: function (x) { x.points = []; UI.renderPM(); preview(); } },
          { type: 'buttons', buttons: [{ label: 'Remove last', onclick: function () { v.points.pop(); UI.renderPM(); preview(); } }, { label: 'Clear', onclick: function () { v.points = []; UI.renderPM(); preview(); } }] }] }
      ],
      onChange: function () { preview(); },
      onCancel: function () { UI.disposeGroup(UI.groups.preview); },
      onOK: function () {
        if (!v.face || !v.points.length) { UI.toast('Click a face to place the holes first.'); return false; }
        if (v.end === 'blind' && !(+v.depth > 0)) { UI.toast('Depth must be greater than 0.'); return false; }
        UI.disposeGroup(UI.groups.preview);
        UI.pushUndo();
        var ents = v.points.map(function (q) { return { t: 'point', x: q[0], y: q[1] }; }), f;
        if (existing) {
          sk.plane = v.face; sk.entities = ents; delete sk.dims; delete sk.rels; delete sk.profile;
          var nf = feature(existing.sketch);
          ['holeType', 'size', 'fit', 'end', 'depth', 'threadDepth', 'standard'].forEach(function (k) { if (nf[k] === undefined) delete existing[k]; else existing[k] = nf[k]; });
          f = existing;
        } else {
          var s = { id: App.model.nextId++, type: 'sketch', plane: v.face, entities: ents };
          s.name = K.featureName(App.model, 'sketch');
          App.model.features.push(s);
          f = feature(s.id);
          f.id = App.model.nextId++;
          f.name = HW.holeName(App.model, f);
          App.model.features.push(f);
        }
        return UI.afterRebuild(UI.rebuild(), function () {
          App.sel = { kind: 'feature', id: f.id }; UI.updateHighlights(); UI.refreshTree();
          var err = App.build.errors[f.id];
          UI.setStatus(err ? f.name + ' failed: ' + err : f.name + (existing ? ' updated.' : ' created.'));
          return f;
        });
      }
    });
    preview();
    // the preview is built in the rebuild worker like the other PropertyManagers' (r3/engine3): the newest request wins,
    // the shown preview is replaced only when the next is ready, and an answer for a closed PropertyManager is dropped;
    // without the worker it is built here as before
    var pvSeq = 0, pvShown = 0;
    function preview() {
      if (!v.face || !v.points.length || !App.build) { pvShown = ++pvSeq; UI.disposeGroup(UI.groups.preview); return; }
      var tmp = feature(-998), my = ++pvSeq, spec = UI.pmSpec ? UI.pmSpec() : null;
      var s = { id: -998, type: 'sketch', plane: v.face, entities: v.points.map(function (q) { return { t: 'point', x: q[0], y: q[1] }; }) };
      var p = UI.previewInWorker && !App.previewSync ? UI.previewInWorker({ op: 'tool', feature: JSON.parse(JSON.stringify(tmp)), upto: null, sketches: JSON.parse(JSON.stringify({ '-998': s })) }) : null;
      if (!p) { pvShown = my; previewSync(tmp, s); return; }
      p.then(function (r) {
        if ((r && r.superseded) || (UI.pmSpec && UI.pmSpec() !== spec) || my < pvShown) return;
        pvShown = my;
        if (!r) { previewSync(tmp, s); return; }   // the worker went away
        UI.disposeGroup(UI.groups.preview);
        r.tools.forEach(function (t) { if (t && t.polygons.length) addMesh(t); });
      }, function () {
        if ((UI.pmSpec && UI.pmSpec() !== spec) || my < pvShown) return;
        pvShown = my; UI.disposeGroup(UI.groups.preview);
      });
    }
    function previewSync(tmp, s) {
      UI.disposeGroup(UI.groups.preview);
      try { addMesh(K.buildTool(tmp, App.model, { tools: {}, planes: App.build.planes, sketches: { '-998': s }, body: App.build.body })); } catch (e) { }
    }
    function addMesh(tool) {
      var mesh = K.meshFromBody(tool), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(UI.analyticNormals(mesh), 3));
      UI.groups.preview.add(new THREE.Mesh(g, UI.mats.previewCut));
    }
  }

  // ---- cosmetic threads: a dashed circle at the major diameter on the face of every Straight Tap hole
  var threadGroup = null, threadMat = null;
  function updateCosmeticThreads() {
    if (!UI.scene || typeof THREE === 'undefined') return;
    if (!threadGroup) { threadGroup = new THREE.Group(); threadGroup.name = 'cosmeticThreads'; UI.scene.add(threadGroup); }
    UI.disposeGroup(threadGroup);
    if (!App.model || App.model.type === 'assembly' || !App.model.features) return;
    var list = HW.threads(App.model).filter(function (t) { return !(App.build && App.build.errors && App.build.errors[t.featureId]); });
    if (!threadMat) threadMat = new THREE.LineDashedMaterial({ color: 0x3a4a5c, dashSize: 0.6, gapSize: 0.4, depthTest: true });
    list.forEach(function (t) {
      var n = t.n, a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], x = K.vec.norm(K.vec.cross(n, a)), y = K.vec.cross(n, x), pts = [];
      var lift = K.vec.scale(n, -0.002 * Math.max(1, t.r)); // a hair above the face so it is not z-fought
      for (var i = 0; i <= 96; i++) {
        var th = i / 96 * Math.PI * 2, c = Math.cos(th) * t.r, s = Math.sin(th) * t.r;
        pts.push(new THREE.Vector3(t.p[0] + x[0] * c + y[0] * s + lift[0], t.p[1] + x[1] * c + y[1] * s + lift[1], t.p[2] + x[2] * c + y[2] * s + lift[2]));
      }
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), threadMat.clone());
      line.material.dashSize = t.r * 0.35; line.material.gapSize = t.r * 0.2;
      line.computeLineDistances();
      line.userData.thread = t;
      threadGroup.add(line);
    });
  }
  UI.cmdHoleWizard = cmdHoleWizard;
  UI.updateCosmeticThreads = updateCosmeticThreads;
  UI.cosmeticThreadCount = function () { return threadGroup ? threadGroup.children.length : 0; };
})();
