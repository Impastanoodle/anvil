// ui-commands.js — PropertyManager rendering and the feature commands (sketch, extrude, revolve, patterns, mirror, ...).
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;

  // ------------------------------------------------------------------ PropertyManager
  var pm = { spec: null, values: null, root: $('pm') };

  function openPM(spec) {
    pm.spec = spec;
    pm.values = spec.values || {};
    App.command = spec.command || null;
    renderPM();
    $('fm-tree').hidden = true;
    pm.root.hidden = false;
    UI.setFmTab('pm');
    UI.updatePlanes();
    if (spec.onChange) spec.onChange(pm.values);
  }
  function closePM() {
    if (!pm.spec) return;
    var spec = pm.spec;
    pm.spec = null; pm.values = null;
    App.command = null;
    pm.root.hidden = true;
    pm.root.innerHTML = '';
    $('fm-tree').hidden = false;
    UI.setFmTab('tree');
    UI.disposeGroup(UI.groups.preview);
    UI.updatePlanes();
    if (spec.onClose) spec.onClose();
    UI.refreshRibbon();
  }
  // Returns the commit's Promise when the command's onOK returns one (commitFeature does), else UI.whenIdle().
  function pmOK() {
    if (!pm.spec) return UI.whenIdle();
    var spec = pm.spec, r;
    if (spec.onOK) { r = spec.onOK(pm.values); if (r === false) return UI.whenIdle(); }
    closePM();
    return r && typeof r.then === 'function' ? r : UI.whenIdle();
  }
  function pmCancel() {
    if (!pm.spec) return;
    var spec = pm.spec;
    if (spec.onCancel) spec.onCancel();
    closePM();
  }

  function renderPM() {
    var spec = pm.spec, root = pm.root;
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'pm-head', html: Icons(spec.icon || 'generic', 20) + '<span>' + spec.title + '</span>' }));
    var actions = el('div', { class: 'pm-actions' });
    actions.appendChild(el('button', { title: 'OK (Enter)', html: Icons('ok', 20), onclick: pmOK }));
    actions.appendChild(el('button', { title: 'Cancel (Esc)', html: Icons('cancel', 18), onclick: pmCancel }));
    if (spec.extraActions) spec.extraActions.forEach(function (a) { actions.appendChild(el('button', { title: a.title, html: Icons(a.icon, 20), onclick: a.onclick })); });
    root.appendChild(actions);
    if (spec.message) root.appendChild(el('div', { class: 'pm-msg' + (spec.messageOk ? ' ok' : ''), html: spec.message }));
    (spec.groups || []).forEach(function (g) {
      if (g.show && !g.show(pm.values)) return;   // a group may hide itself, like a field
      var box = el('div', { class: 'pm-group' + (g.collapsed ? ' collapsed' : '') });
      var h = el('h4', { html: '<span class="tw">' + (g.collapsed ? '▸' : '▾') + '</span>' + g.title });
      h.addEventListener('click', function () { box.classList.toggle('collapsed'); h.querySelector('.tw').textContent = box.classList.contains('collapsed') ? '▸' : '▾'; });
      box.appendChild(h);
      var fields = el('div', { class: 'pm-fields' });
      g.fields.forEach(function (f) {
        if (f.show && !f.show(pm.values)) return;
        fields.appendChild(renderField(f));
      });
      box.appendChild(fields);
      root.appendChild(box);
    });
  }

  function renderField(f) {
    var v = pm.values;
    function changed(val) {
      v[f.key] = val;
      if (f.rerender) renderPM();
      if (pm.spec.onChange) pm.spec.onChange(v, f.key);
    }
    switch (f.type) {
      case 'number': {
        var inp = el('input', { type: 'number', step: f.step || 'any', value: v[f.key] == null ? '' : v[f.key] });
        if (f.min != null) inp.min = f.min;
        inp.addEventListener('input', function () { var n = parseFloat(inp.value); if (!isNaN(n)) changed(n); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pmOK(); } });
        var wrap = el('span', {}, [inp, f.unit ? el('span', { class: 'unit', text: f.unit === 'u' ? UI.unitLabel() : f.unit }) : null]);
        return el('div', { class: 'pm-row' }, [el('label', { text: f.label }), wrap]);
      }
      case 'select': {
        var sel = el('select');
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
        var cb = el('input', { type: 'checkbox' });
        cb.checked = !!v[f.key];
        cb.addEventListener('change', function () { changed(cb.checked); });
        return el('div', { class: 'pm-row check' }, [cb, el('label', { text: f.label, onclick: function () { cb.click(); } })]);
      }
      case 'text': {
        var t = el('input', { type: 'text', value: v[f.key] || '' });
        t.addEventListener('input', function () { changed(t.value); });
        return el('div', { class: 'pm-row' }, [el('label', { text: f.label }), t]);
      }
      case 'static':
        return el('div', { class: 'pm-row' }, [el('label', { text: f.label }), el('span', { class: 'static', text: typeof f.value === 'function' ? f.value(v) : f.value })]);
      case 'pick': {
        var txt = typeof f.value === 'function' ? f.value(v) : f.value;
        return el('div', { class: 'pm-pick' + (txt ? ' filled' : ''), html: Icons(f.icon || 'plane', 16) + '<span>' + (txt || f.placeholder || 'Select…') + '</span>' });
      }
      case 'buttons': {
        var row = el('div', { class: 'pm-btns' });
        f.buttons.forEach(function (b) { row.appendChild(el('button', { text: b.label, onclick: function () { b.onclick(v); } })); });
        return row;
      }
      case 'html':
        return el('div', { html: typeof f.html === 'function' ? f.html(v) : f.html });
    }
    return el('div');
  }

  // ------------------------------------------------------------------ preview
  function showPreview(feature) {
    UI.disposeGroup(UI.groups.preview);
    if (!feature || !App.build) return null;
    try {
      var b = UI.modelBounds();
      var diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      var ctx = { tools: App.build.tools, planes: App.build.planes, sketches: {}, body: App.build.body, throughLimit: Math.max(20, diag * 1.5) };
      var tool = K.buildTool(feature, App.model, ctx);
      if (!tool) return null;
      var mesh = K.meshFromBody(tool);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
      UI.groups.preview.add(new THREE.Mesh(g, K.isCut(feature, App.model) || feature.cut ? UI.mats.previewCut : UI.mats.preview));
      return null;
    } catch (e) {
      return e.message;
    }
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
      var err = App.build.errors[f.id];
      UI.setStatus(err ? f.name + ' failed: ' + err : f.name + (existing ? ' updated' : ' created') + '. Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms.');
      return f;
    });
  }

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
    closePM();
    UI.pushUndo();
    var plane = typeof ref === 'number' ? { featureId: ref } : { ref: ref, offset: 0 };
    var f = { id: App.model.nextId++, type: 'sketch', plane: plane, entities: [] };
    f.name = K.featureName(App.model, 'sketch');
    App.model.features.push(f);
    App.sketchSnapshot = JSON.stringify({ entities: [] });
    App.newSketchId = f.id;
    return UI.afterRebuild(UI.rebuild(), function () { UI.enterSketch(f.id); });
  }
  function newSketchOnFace(pk) {
    var face = App.mesh.faces[pk.index];
    if (!face) return;
    closePM();
    UI.pushUndo();
    var plane = K.planeFromFace(face.normal, pk.point || face.centroid);
    var f = { id: App.model.nextId++, type: 'sketch', plane: plane, entities: [] };
    f.name = K.featureName(App.model, 'sketch');
    // remember the face outline (same frame as the sketch plane) for Convert / Offset Entities
    try { var fo = K.faceOutline(App.mesh, pk.index); if (fo) f.faceLoops = fo.loops; } catch (e) { }
    App.model.features.push(f);
    App.sketchSnapshot = JSON.stringify({ entities: [] });
    App.newSketchId = f.id;
    return UI.afterRebuild(UI.rebuild(), function () { UI.enterSketch(f.id); });
  }

  // ------------------------------------------------------------------ sketch tools: convert / offset / sketch fillet
  function selectedSketchEntityLoop() {
    var f = UI.activeSketchFeature();
    if (!f || !App.sel || App.sel.kind !== 'entity') return null;
    var e = f.entities[App.sel.index];
    if (!e) return null;
    var pls = K.entityPolylines(e).filter(function (l) { return l.closed; });
    return pls.length ? { entity: e, index: App.sel.index, pts: pls[0].pts } : null;
  }
  function cmdConvertEntities() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    if (!f.faceLoops || !f.faceLoops.length) { UI.toast('Convert Entities needs a sketch drawn on a face (its outline is projected).'); UI.setStatus('This sketch is on a plane; start a sketch on a model face to convert its edges.'); return; }
    UI.pushUndo(); App.sketchDirty = true;
    f.faceLoops.forEach(function (loop) { f.entities.push({ t: 'polyline', pts: loop.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }), closed: true }); });
    UI.updateSketches(); UI.refreshTree();
    UI.setStatus('Converted ' + f.faceLoops.length + ' face loop' + (f.faceLoops.length === 1 ? '' : 's') + ' into sketch entities.');
  }
  function cmdOffsetEntities() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    var sel = selectedSketchEntityLoop();
    var source = sel ? [sel.pts] : (f.faceLoops || []);
    if (!source.length) { UI.toast('Select a closed sketch entity, or sketch on a face, then Offset.'); return; }
    var v = { d: 2, reverse: false, construction: false };
    var added = [];
    function apply(commit) {
      added.forEach(function (e) { var i = f.entities.indexOf(e); if (i >= 0) f.entities.splice(i, 1); });
      added = [];
      source.forEach(function (loop) {
        var isCcw = K.signedArea(loop) >= 0, sign = (v.reverse ? -1 : 1) * (isCcw ? 1 : -1);
        var out = K.offsetLoop(loop, sign * Math.abs(+v.d || 0));
        var e = { t: 'polyline', pts: out.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }), closed: true };
        if (v.construction) e.construction = true;
        f.entities.push(e); added.push(e);
      });
      UI.updateSketches();
    }
    openPM({
      title: 'Offset Entities', icon: 'offset', values: v,
      message: sel ? 'Offsetting the selected entity.' : 'Offsetting the face outline this sketch sits on (' + source.length + ' loop' + (source.length === 1 ? '' : 's') + ').',
      groups: [{ title: 'Parameters', fields: [{ type: 'number', label: 'Offset distance', key: 'd', unit: 'u', min: 0 }, { type: 'check', label: 'Reverse (inward)', key: 'reverse' }, { type: 'check', label: 'Construction geometry', key: 'construction' }] }],
      onChange: function () { apply(); },
      onOK: function () { UI.pushUndo(); App.sketchDirty = true; UI.refreshTree(); UI.setStatus('Offset ' + added.length + ' loop' + (added.length === 1 ? '' : 's') + ' by ' + v.d + '.'); added = []; },
      onCancel: function () { added.forEach(function (e) { var i = f.entities.indexOf(e); if (i >= 0) f.entities.splice(i, 1); }); added = []; UI.updateSketches(); }
    });
    apply();
  }
  function cmdSketchFillet() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    var v = { r: 2 };
    openPM({
      title: 'Sketch Fillet', icon: 'fillet', values: v,
      message: 'Set the radius, then <b>click near a corner</b> of a rectangle, polygon or polyline to round it.',
      command: { sketchFillet: true, onSketchPoint: function (uv) {
        var best = null, bestD = Infinity;
        f.entities.forEach(function (e, ei) {
          if (e.t !== 'rect' && e.t !== 'crect' && e.t !== 'poly' && e.t !== 'polyline') return;
          var pts = e.t === 'polyline' ? e.pts : K.entityPolylines(e)[0].pts;
          if (e.t === 'polyline' && !e.closed) return;
          pts.forEach(function (p, pi) { var d = Math.hypot(p[0] - uv[0], p[1] - uv[1]); if (d < bestD) { bestD = d; best = { e: e, ei: ei, pts: pts, pi: pi }; } });
        });
        if (!best || bestD > UI.gridStep()) { UI.toast('No corner near that point.'); return; }
        try {
          var out = K.filletPolyline(best.pts, best.pi, +v.r);
          if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
          f.entities[best.ei] = { t: 'polyline', pts: out.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }), closed: true };
          UI.updateSketches(); UI.refreshTree();
          UI.setStatus('Corner filleted with R' + v.r + '. Click another corner or press ✓.');
        } catch (e) { UI.toast(e.message); }
      } },
      groups: [{ title: 'Fillet Parameters', fields: [{ type: 'number', label: 'Radius', key: 'r', unit: 'u', min: 0 }] }],
      onChange: function () { }, onOK: function () { }
    });
  }
  // ------------------------------------------------------------------ sketch tools: trim / mirror entities / linear sketch pattern
  function roundPts(e) {
    if (e.t === 'polyline') e.pts = e.pts.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; });
    else Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') e[k] = Math.round(e[k] * 1e4) / 1e4; });
    return e;
  }
  function cmdTrimEntities() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    var count = 0;
    openPM({
      title: 'Trim Entities', icon: 'trim',
      message: '<b>Click the part of an entity to remove.</b> The segment between its neighbouring intersections goes away; an entity with nothing crossing it is deleted.',
      command: { onSketchPoint: function (uv, mx, my) {
        var hit = UI.pickEntity(mx, my);
        if (!hit) { UI.setStatus('Click on an entity to trim it.'); return; }
        try {
          var out = K.trimEntity(f.entities, hit.index, uv);
          if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
          f.entities = out.map(roundPts);
          count++;
          App.sel = null; App.gridStale = true;
          UI.updateSketches(); UI.refreshTree();
          UI.setStatus('Trimmed ' + count + ' segment' + (count === 1 ? '' : 's') + '. Click another, or press ✓ to finish.');
        } catch (e) { UI.toast(e.message); }
      } },
      groups: [{ title: 'Options', fields: [{ type: 'static', label: 'Mode', value: 'Trim to closest' }] }],
      onChange: function () { }, onOK: function () { }
    });
  }
  function entityTargets(f) {
    if (App.sel && App.sel.kind === 'entity' && f.entities[App.sel.index]) return [App.sel.index];
    return f.entities.map(function (e, i) { return i; });
  }
  function cmdMirrorEntities() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    if (!f.entities.length) { UI.toast('Draw something to mirror first.'); return; }
    var targets = entityTargets(f);
    var v = { axis: 'y', copy: true };
    function axisOptions() {
      var opts = [['y', 'Sketch vertical axis (Y)'], ['x', 'Sketch horizontal axis (X)']];
      f.entities.forEach(function (e, i) { if (e.t === 'line') opts.push([String(i), 'Line ' + (i + 1) + '  (' + UI.fmtNum(e.x1, 1) + ', ' + UI.fmtNum(e.y1, 1) + ') → (' + UI.fmtNum(e.x2, 1) + ', ' + UI.fmtNum(e.y2, 1) + ')']); });
      return opts;
    }
    function copies() {
      var spec = /^\d+$/.test(String(v.axis)) ? +v.axis : v.axis;
      var ax = K.mirrorAxis(spec, f.entities);
      return targets.filter(function (i) { return i !== spec; }).map(function (i) { return K.mirrorEntity(f.entities[i], ax); }).filter(Boolean).map(roundPts);
    }
    function preview() { try { App.tempEntities = copies(); } catch (e) { App.tempEntities = []; UI.setStatus(e.message); } UI.updateTemp(); }
    openPM({
      title: 'Mirror Entities', icon: 'mirrorEnt', values: v,
      message: targets.length === f.entities.length ? 'Mirroring <b>all ' + f.entities.length + ' entities</b> (select one entity first to mirror just that one).' : 'Mirroring the selected entity.',
      groups: [{ title: 'Options', fields: [
        { type: 'select', label: 'Mirror about', key: 'axis', options: axisOptions },
        { type: 'check', label: 'Copy (keep originals)', key: 'copy' }
      ] }],
      onChange: preview,
      onOK: function () {
        var c;
        try { c = copies(); } catch (e) { UI.toast(e.message); return false; }
        UI.pushUndo(); App.sketchDirty = true;
        if (!v.copy) { var spec = /^\d+$/.test(String(v.axis)) ? +v.axis : -1; f.entities = f.entities.filter(function (e, i) { return targets.indexOf(i) < 0 || i === spec; }); }
        c.forEach(function (e) { f.entities.push(e); });
        App.tempEntities = []; UI.updateTemp(); App.sel = null; App.gridStale = true;
        UI.updateSketches(); UI.refreshTree();
        UI.setStatus('Mirrored ' + c.length + ' entit' + (c.length === 1 ? 'y' : 'ies') + '.');
      },
      onCancel: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    preview();
  }
  function cmdSketchPattern() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    if (!f.entities.length) { UI.toast('Draw something to pattern first.'); return; }
    var targets = entityTargets(f);
    var v = { angle: 0, spacing: 20, count: 3, dir2: false, angle2: 90, spacing2: 20, count2: 2 };
    function copies() {
      var a1 = v.angle * Math.PI / 180, a2 = v.angle2 * Math.PI / 180, out = [];
      var n1 = Math.max(1, v.count | 0), n2 = v.dir2 ? Math.max(1, v.count2 | 0) : 1;
      for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
        if (!i && !j) continue;
        var dx = i * v.spacing * Math.cos(a1) + j * (v.dir2 ? v.spacing2 * Math.cos(a2) : 0), dy = i * v.spacing * Math.sin(a1) + j * (v.dir2 ? v.spacing2 * Math.sin(a2) : 0);
        targets.forEach(function (t) { out.push(roundPts(K.translateEntity(f.entities[t], dx, dy))); });
      }
      return out;
    }
    function preview() { App.tempEntities = copies(); UI.updateTemp(); }
    openPM({
      title: 'Linear Pattern', icon: 'sketchPattern', values: v,
      message: targets.length === f.entities.length ? 'Patterning <b>all ' + f.entities.length + ' entities</b> (select one entity first to pattern just that one).' : 'Patterning the selected entity.',
      groups: [
        { title: 'Direction 1', fields: [{ type: 'number', label: 'Angle', key: 'angle', unit: '°' }, { type: 'number', label: 'Spacing', key: 'spacing', unit: 'u' }, { type: 'number', label: 'Instances', key: 'count', step: 1, min: 1 }] },
        { title: 'Direction 2', fields: [{ type: 'check', label: 'Enable direction 2', key: 'dir2', rerender: true }, { type: 'number', label: 'Angle', key: 'angle2', unit: '°', show: function (x) { return x.dir2; } }, { type: 'number', label: 'Spacing', key: 'spacing2', unit: 'u', show: function (x) { return x.dir2; } }, { type: 'number', label: 'Instances', key: 'count2', step: 1, min: 1, show: function (x) { return x.dir2; } }] }
      ],
      onChange: preview,
      onOK: function () {
        var c = copies();
        if (!c.length) { UI.toast('Set at least 2 instances.'); return false; }
        UI.pushUndo(); App.sketchDirty = true;
        c.forEach(function (e) { f.entities.push(e); });
        App.tempEntities = []; UI.updateTemp(); App.sel = null; App.gridStale = true;
        UI.updateSketches(); UI.refreshTree();
        UI.setStatus('Added ' + c.length + ' patterned entit' + (c.length === 1 ? 'y' : 'ies') + '.');
      },
      onCancel: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    preview();
  }
  function editSketch(id) {
    var f = K.findFeature(App.model, id);
    if (!f) return;
    closePM();
    App.sketchSnapshot = JSON.stringify({ entities: f.entities, dims: f.dims || [] });
    UI.enterSketch(id);
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

  function cmdExtrude(cut, existing) {
    withSketch(function (sid) {
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'extrude', cut: !!cut, depth: 10, end: cut ? 'through' : 'blind', reverse: false, dir2: false, depth2: 10, end2: 'blind', sketch: pickDefaultSketch(sid) };
      if (existing) delete f.profile;
      // SolidWorks default: a new cut on a sheet-metal part is a Normal cut (perpendicular to the sheet faces, through the thickness)
      if (!existing && cut && App.model.sheet) f.normalCut = true;
      f.normalCut = !!f.normalCut;
      if (f.sketch == null) { UI.setStatus('Create a sketch first: Sketch tab → pick a plane → draw a closed profile.'); UI.toast('No sketch available. Draw a sketch first.'); return; }
      // a cut drawn on a face should go into the material (the face normal points out of it)
      if (!existing && cut) { var sk0 = K.findFeature(App.model, f.sketch); if (sk0 && sk0.plane && sk0.plane.custom) f.reverse = true; }
      var title = f.cut ? 'Cut-Extrude' : 'Boss-Extrude';
      f.draftOn = !!f.draft; if (!f.draft) f.draft = 5; f.draftOut = !!f.draftOut;
      function toFeature(v) {
        var out = JSON.parse(JSON.stringify(v));
        delete out.draftOn;
        if (!v.draftOn || !(+v.draft > 0)) { delete out.draft; delete out.draftOut; }
        else if (!v.draftOut) delete out.draftOut;
        if (!v.cut || !v.normalCut) delete out.normalCut;
        return out;
      }
      function isSheetCut(v) { return !!v.cut && !!App.model.sheet; }
      openPM({
        title: existing ? existing.name : title, icon: f.cut ? 'cut' : 'extrude', values: f,
        command: { sketchId: f.sketch },
        groups: [
          { title: 'From', fields: [{ type: 'static', label: 'Start', value: 'Sketch Plane' }, sketchPickerField(f)] },
          {
            title: 'Direction 1', fields: [
              { type: 'select', label: 'End condition', key: 'end', options: [['blind', 'Blind'], ['through', 'Through All'], ['mid', 'Mid Plane']], rerender: true },
              { type: 'number', label: 'Depth  D1', key: 'depth', unit: 'u', min: 0, show: function (v) { return v.end !== 'through'; } },
              { type: 'check', label: 'Reverse direction', key: 'reverse' }
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
      openPM({
        title: existing ? existing.name : title, icon: f.cut ? 'revolveCut' : 'revolve', values: f, command: { sketchId: f.sketch },
        groups: [
          { title: 'Axis of Revolution', fields: [sketchPickerField(f), { type: 'select', label: 'Axis', key: 'axis', options: revolveAxisOptions }] },
          { title: 'Direction 1', fields: [{ type: 'number', label: 'Angle', key: 'angle', unit: '°', min: 0 }, { type: 'check', label: 'Reverse direction', key: 'reverse' }] },
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut' }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v, key) { if (key === 'sketch') { renderPM(); } App.command.sketchId = v.sketch; UI.updateSketches(); var err = showPreview(v); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '.'); },
        onOK: function (v) { if (!v.name) delete v.name; if (typeof v.axis === 'string' && /^\d+$/.test(v.axis)) v.axis = +v.axis; return commitFeature(v, existing); }
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
      openPM({
        title: existing ? existing.name : title, icon: 'sweep', values: f, command: { sketchId: f.profile },
        message: 'The <b>profile</b> is a closed sketch; the <b>path</b> is a sketch of connected lines/arcs starting at the profile. The profile is turned perpendicular to the first path segment automatically.',
        groups: [
          { title: 'Profile and Path', fields: [
            { type: 'select', label: 'Profile', key: 'profile', options: function (v) { return allSketchesField('Profile', 'profile', 'path')(v).options; } },
            { type: 'select', label: 'Path', key: 'path', options: function (v) { return allSketchesField('Path', 'path', 'profile')(v).options; }, show: function (v) { return !Array.isArray(v.path); } },
            { type: 'static', label: 'Path', value: function (v) { return Array.isArray(v.path) ? v.path.length + ' points (from script)' : ''; }, show: function (v) { return Array.isArray(v.path); } }
          ] },
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut' }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v) {
          if (typeof v.profile === 'string' && /^\d+$/.test(v.profile)) v.profile = +v.profile;
          if (typeof v.path === 'string' && /^\d+$/.test(v.path)) v.path = +v.path;
          App.command.sketchId = v.profile; App.command.pathId = v.path; UI.updateSketches();
          var err = showPreview(v); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '. Press Enter or ✓ to accept.');
        },
        onOK: function (v) { if (!v.name) delete v.name; delete v.pathPoints; return commitFeature(v, existing); }
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
      function opts(v, exclude) { return sketches.map(function (s) { return [s.id, s.name + (UI.isConsumed(s.id) ? ' (used)' : '')]; }); }
      function sync(v) {
        var ids = [v.s0, v.s1, v.s2].map(function (x) { return typeof x === 'string' ? +x : x; }).filter(function (x) { return x != null && x !== -1 && !isNaN(x); });
        v.sketches = ids;
      }
      openPM({
        title: existing ? existing.name : title, icon: 'loft', values: f, command: { loftIds: f.sketches.slice() },
        message: 'Pick two or three sketches, each with <b>one closed profile</b>, on different planes. Profiles are matched point by point around their outlines.',
        groups: [
          { title: 'Profiles', fields: [
            { type: 'select', label: 'Section 1', key: 's0', options: opts },
            { type: 'select', label: 'Section 2', key: 's1', options: opts },
            { type: 'select', label: 'Section 3', key: 's2', options: function (v) { return [[-1, '(none)']].concat(opts(v)); } }
          ] },
          { title: 'Feature', collapsed: !existing, fields: [{ type: 'check', label: 'Cut (remove material)', key: 'cut' }, { type: 'text', label: 'Name', key: 'name' }] }
        ],
        onChange: function (v) { sync(v); App.command.loftIds = v.sketches; UI.updateSketches(); var err = showPreview(v); UI.setStatus(err ? 'Preview: ' + err : 'Previewing ' + title + '. Press Enter or ✓ to accept.'); },
        onOK: function (v) { sync(v); if (v.sketches.length < 2) { UI.toast('Pick at least two sketches.'); return false; } delete v.s0; delete v.s1; delete v.s2; if (!v.name) delete v.name; return commitFeature(v, existing); }
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
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'lpattern', feature: defaultSource(), d1: 'x', rev1: false, s1: 20, n1: 3, d2: null, rev2: false, s2: 20, n2: 2 };
    if (!needSource(f)) return;
    openPM({
      title: existing ? existing.name : 'Linear Pattern', icon: 'lpattern', values: f,
      groups: [
        { title: 'Features to Pattern', fields: [sourceField(f)] },
        { title: 'Direction 1', fields: [{ type: 'select', label: 'Direction', key: 'd1', options: [['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']] }, { type: 'check', label: 'Reverse', key: 'rev1' }, { type: 'number', label: 'Spacing', key: 's1', unit: 'u' }, { type: 'number', label: 'Instances', key: 'n1', step: 1, min: 1 }] },
        { title: 'Direction 2', fields: [{ type: 'select', label: 'Direction', key: 'd2', options: [['', 'None'], ['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']], rerender: true }, { type: 'check', label: 'Reverse', key: 'rev2', show: function (v) { return !!v.d2; } }, { type: 'number', label: 'Spacing', key: 's2', unit: 'u', show: function (v) { return !!v.d2; } }, { type: 'number', label: 'Instances', key: 'n2', step: 1, min: 1, show: function (v) { return !!v.d2; } }] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { if (v.d2 === '') v.d2 = null; var err = showPreview(v); UI.setStatus(err ? 'Preview: ' + err : 'Previewing linear pattern.'); },
      onOK: function (v) { if (!v.name) delete v.name; if (v.d2 === '') v.d2 = null; return commitFeature(v, existing); }
    });
  }

  function cmdCircularPattern(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'cpattern', feature: defaultSource(), axis: 'y', cx: 0, cy: 0, cz: 0, n: 6, angle: 360, equal: true };
    if (existing && existing.center) { f.cx = existing.center[0]; f.cy = existing.center[1]; f.cz = existing.center[2]; }
    if (!needSource(f)) return;
    function norm(v) { v.center = [+v.cx || 0, +v.cy || 0, +v.cz || 0]; return v; }
    openPM({
      title: existing ? existing.name : 'Circular Pattern', icon: 'cpattern', values: f,
      groups: [
        { title: 'Features to Pattern', fields: [sourceField(f)] },
        { title: 'Direction 1', fields: [{ type: 'select', label: 'Axis', key: 'axis', options: [['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']] }, { type: 'number', label: 'Angle', key: 'angle', unit: '°' }, { type: 'number', label: 'Instances', key: 'n', step: 1, min: 2 }, { type: 'check', label: 'Equal spacing', key: 'equal' }] },
        { title: 'Axis point', fields: [{ type: 'number', label: 'X', key: 'cx', unit: 'u' }, { type: 'number', label: 'Y', key: 'cy', unit: 'u' }, { type: 'number', label: 'Z', key: 'cz', unit: 'u' }] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { var err = showPreview(norm(v)); UI.setStatus(err ? 'Preview: ' + err : 'Previewing circular pattern.'); },
      onOK: function (v) { norm(v); delete v.cx; delete v.cy; delete v.cz; if (!v.name) delete v.name; return commitFeature(v, existing); }
    });
  }

  function cmdMirror(existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'mirror', plane: 'Right', offset: 0, feature: defaultSource(), body: false };
    if (!f.body && !needSource(f)) return;
    openPM({
      title: existing ? existing.name : 'Mirror', icon: 'mirror', values: f,
      groups: [
        { title: 'Mirror Face/Plane', fields: [{ type: 'select', label: 'Plane', key: 'plane', options: ['Front', 'Top', 'Right'] }, { type: 'number', label: 'Plane offset', key: 'offset', unit: 'u' }] },
        { title: 'Features to Mirror', fields: [{ type: 'check', label: 'Mirror whole body', key: 'body', rerender: true }, Object.assign(sourceField(f), { show: function (v) { return !v.body; } })] },
        { title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
      ],
      onChange: function (v) { var err = showPreview(v); UI.setStatus(err ? 'Preview: ' + err : 'Previewing mirror.'); },
      onOK: function (v) { if (!v.name) delete v.name; if (v.body) delete v.feature; return commitFeature(v, existing); }
    });
  }

  // ------------------------------------------------------------------ chamfer / fillet (edge features)
  function cmdEdgeFeature(kind, existing) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.edges || !App.edges.length) { UI.toast('Create a solid first.'); return; }
    var isChamfer = kind === 'chamfer';
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: kind, edges: [], chain: true };
    if (isChamfer) f.d = f.d != null ? f.d : 2; else f.r = f.r != null ? f.r : 2;
    if (existing) f.chain = !(existing.edges || []).some(function (e) { return e.chain === false; });
    // seed with a pre-selected edge
    if (!existing && App.sel && App.sel.kind === 'edge') f.edges.push({ at: App.sel.edge.mid.slice(), chain: true });
    var edgeList = [];
    function resolveList() {
      var sharp = App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex !== null; });
      edgeList = K.resolveEdges(f.edges.map(function (e) { return { at: e.at, chain: f.chain }; }), sharp, Math.max(0.5, isChamfer ? +f.d : +f.r));
      if (App.command) App.command.edgeList = edgeList;
      UI.updateHighlights();
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      if (!f.edges.length) { UI.setStatus('Click edges in the graphics area to ' + kind + ' them.'); return; }
      try {
        var r = K.buildEdgeFeature(f, { body: App.build.body });
        [r.cut, r.add].forEach(function (tool, i) {
          if (!tool) return;
          var mesh = K.meshFromBody(tool), g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
          UI.groups.preview.add(new THREE.Mesh(g, i === 0 ? UI.mats.previewCut : UI.mats.preview));
        });
        UI.setStatus((isChamfer ? 'Chamfer' : 'Fillet') + ' preview: ' + r.count + ' edge' + (r.count === 1 ? '' : 's') + '. Press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    openPM({
      title: existing ? existing.name : (isChamfer ? 'Chamfer' : 'Fillet'), icon: kind, values: f,
      message: 'Click <b>edges</b> to add or remove them. Tangent chains (round edges) are picked as one.',
      command: {
        pickEdges: true, edgeList: edgeList,
        onPick: function (pk) {
          if (pk.kind !== 'edge') return false;
          var e = pk.edge;
          // toggle: remove a spec whose resolved chain contains this edge, else add
          var hitIdx = -1;
          f.edges.forEach(function (spec, i) {
            var chain = K.resolveEdges([{ at: spec.at, chain: f.chain }], App.edges.filter(function (x) { return !x.smooth && x.faces.length === 2; }), 0.5);
            if (chain.indexOf(e) >= 0) hitIdx = i;
          });
          if (hitIdx >= 0) f.edges.splice(hitIdx, 1); else f.edges.push({ at: e.mid.slice(), chain: f.chain });
          renderPM(); resolveList(); preview();
          return true;
        }
      },
      groups: [
        { title: isChamfer ? 'Items To Chamfer' : 'Items To Fillet', fields: [
          { type: 'pick', icon: kind, value: function (v) { return v.edges.length ? v.edges.length + ' edge pick' + (v.edges.length > 1 ? 's' : '') + (edgeList.length ? ' → ' + edgeList.length + ' edges' : '') : ''; }, placeholder: 'Select edges…' },
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
    var base = existing ? bodyBefore(existing.id) : (App.build ? App.build.body : null);
    if (!base) { UI.toast('Create a solid first, then shell it.'); return; }
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'shell', thickness: 2, faces: [] };
    if (!existing && App.sel && App.sel.kind === 'face' && App.sel.point) f.faces.push({ at: App.sel.point.slice() });
    var baseMesh = existing ? K.meshFromBody(base) : App.mesh;
    function tol() { return Math.max(0.5, (+f.thickness || 1) / 2); }
    function resolveList() {
      var idx = [];
      try { idx = K.resolveFaces(f.faces, baseMesh, tol()); } catch (e) { }
      // highlights map to the displayed mesh, which is the base body only for a new shell
      if (App.command) App.command.faceList = existing ? [] : idx;
      UI.updateHighlights();
      return idx;
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      try {
        var r = K.buildShell(f, { body: base });
        var mesh = K.meshFromBody(r.inner), g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
        UI.groups.preview.add(new THREE.Mesh(g, UI.mats.previewCut));
        UI.setStatus('Shell preview: walls ' + f.thickness + ' ' + UI.unitLabel() + ', ' + (r.removed.length ? r.removed.length + ' face' + (r.removed.length === 1 ? '' : 's') + ' removed' : 'closed hollow') + '. Press Enter or ✓ to accept.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    openPM({
      title: existing ? existing.name : 'Shell', icon: 'shell', values: f,
      message: existing ? 'Edit the wall thickness. The cavity preview is shown in red.' : 'Click the <b>faces to remove</b> (leave none selected for a closed hollow part), then set the wall thickness. The cavity preview is shown in red.',
      command: {
        faceList: [],
        onPick: function (pk) {
          if (pk.kind !== 'face' || !pk.point) return false;
          var hit = -1;
          f.faces.forEach(function (spec, i) { if (K.resolveFaces([spec], baseMesh, tol())[0] === pk.index) hit = i; });
          if (hit >= 0) f.faces.splice(hit, 1); else f.faces.push({ at: pk.point.map(function (x) { return Math.round(x * 1e4) / 1e4; }) });
          renderPM(); resolveList(); preview();
          return true;
        }
      },
      groups: [
        { title: 'Parameters', fields: [
          { type: 'number', label: 'Thickness  D1', key: 'thickness', unit: 'u', min: 0 },
          { type: 'pick', icon: 'shell', value: function (v) { return v.faces.length ? v.faces.length + ' face' + (v.faces.length > 1 ? 's' : '') + ' to remove' : ''; }, placeholder: 'Faces to remove (optional)…' },
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
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'plane', ref: 'Front', offset: 20 };
    openPM({
      title: existing ? existing.name : 'Plane', icon: 'plane', values: f,
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
    var v = { dia: 6.6, end: 'through', depth: 10, face: null, u: 0, vv: 0 };
    openPM({
      title: 'Hole Wizard', icon: 'hole', values: v,
      message: 'Click a <b>planar face</b> to place the hole, then set the size.',
      command: {
        onPick: function (pk) {
          if (pk.kind !== 'face') return false;
          var face = App.mesh.faces[pk.index];
          var plane = K.planeFromFace(face.normal, pk.point);
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
        g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
        UI.groups.preview.add(new THREE.Mesh(g, UI.mats.previewCut));
      } catch (e) { }
    }
  }

  // ------------------------------------------------------------------ sheet metal: base flange = thin extrude with sheet parameters
  function cmdBaseFlange() {
    withSketch(function (sid) {
      var sm = App.model.sheet || { thickness: 2, bendRadius: 2, kFactor: 0.71 };
      var f = { type: 'extrude', cut: false, depth: sm.thickness, end: 'blind', reverse: false, dir2: false, depth2: 0, end2: 'blind', sketch: pickDefaultSketch(sid), thickness: sm.thickness, bendRadius: sm.bendRadius, kFactor: sm.kFactor };
      if (f.sketch == null) { UI.toast('Draw the flange profile in a sketch first.'); return; }
      openPM({
        title: 'Base Flange/Tab', icon: 'flange', values: f, command: { sketchId: f.sketch },
        groups: [
          { title: 'Sketch', fields: [sketchPickerField(f)] },
          { title: 'Sheet Metal Parameters', fields: [{ type: 'number', label: 'Thickness  T', key: 'thickness', unit: 'u', min: 0 }, { type: 'number', label: 'Bend radius', key: 'bendRadius', unit: 'u', min: 0 }, { type: 'number', label: 'K-factor', key: 'kFactor', step: 0.01, min: 0 }, { type: 'check', label: 'Reverse direction', key: 'reverse' }] }
        ],
        onChange: function (v) { v.depth = v.thickness; App.command.sketchId = v.sketch; UI.updateSketches(); var err = showPreview(v); UI.setStatus(err ? 'Preview: ' + err : 'Previewing base flange (thickness ' + v.thickness + ').'); },
        onOK: function (v) {
          App.model.sheet = { thickness: +v.thickness, bendRadius: +v.bendRadius, kFactor: +v.kFactor };
          v.depth = +v.thickness; v.name = 'Base-Flange' + (App.model.features.filter(function (q) { return /^Base-Flange\d+$/.test(q.name || ''); }).length + 1);
          v.sheetBase = true;
          delete v.thickness; delete v.bendRadius; delete v.kFactor;
          return commitFeature(v, null);
        }
      });
    });
  }

  // ------------------------------------------------------------------ sheet metal: edge flange & flatten
  // kind: 'flange' (edge flange), 'miter' (an edge flange with miter: true preset), 'hem' (a 180° flange folded back,
  // stored as a flange with hem: true) or 'jog'.
  // Plain flanges carry miter (bool), miterGap, relief ('none' | 'rect' | 'obround'), reliefWidth / reliefDepth (null = T / T/2).
  function cmdEdgeFlange(existing, kind) {
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.model.sheet) { UI.toast('Create a Base Flange first (Sheet Metal tab).'); return; }
    if (!App.edges || !App.edges.length) { UI.toast('Create a Base Flange first.'); return; }
    var sheet = App.model.sheet, T = sheet.thickness;
    kind = existing ? (existing.type === 'jog' ? 'jog' : existing.hem ? 'hem' : existing.miter ? 'miter' : 'flange') : (kind || 'flange');
    var isHem = kind === 'hem', isJog = kind === 'jog', isMiter = kind === 'miter', isFlange = !isHem && !isJog;
    var f = existing ? JSON.parse(JSON.stringify(existing)) :
      isJog ? { type: 'jog', edges: [], height: 10, length: 20, angle: 90, reverse: false, radius: null, position: 'bendOutside' } :
      isHem ? { type: 'flange', hem: true, edges: [], length: 10, angle: 180, reverse: false, radius: T / 4, position: 'bendOutside' } :
      { type: 'flange', edges: [], length: 20, angle: 90, reverse: false, radius: null, position: 'bendOutside', miter: isMiter, miterGap: 0, relief: 'none', reliefWidth: null, reliefDepth: null };
    f.useDefaultRadius = f.radius == null;
    f.radiusValue = f.radius != null ? f.radius : sheet.bendRadius;
    if (isHem) f.gap = Math.round((f.radius != null ? f.radius : T / 4) * 2 * 1e4) / 1e4;
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
    var titles = { flange: 'Edge-Flange', miter: 'Miter-Flange', hem: 'Hem', jog: 'Jog' };
    var RELIEF_NAMES = { none: 'None', rect: 'Rectangle', obround: 'Obround' };
    if (!existing && App.sel && App.sel.kind === 'edge') f.edges.push({ at: App.sel.edge.mid.slice() });
    var edgeList = [];
    function resolveList() {
      var sharp = App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
      edgeList = K.resolveEdges(f.edges.map(function (e) { return { at: e.at, chain: false }; }), sharp, Math.max(0.5, sheet.thickness));
      if (App.command) App.command.edgeList = edgeList;
      UI.updateHighlights();
    }
    function toFeature(v) {
      var out = JSON.parse(JSON.stringify(v));
      if (isHem) { out.angle = 180; out.radius = Math.max((+v.gap || 0) / 2, 0.02 * T); out.position = 'bendOutside'; delete out.gap; }
      else out.radius = v.useDefaultRadius ? null : +v.radiusValue;
      delete out.useDefaultRadius; delete out.radiusValue;
      if (isFlange) {
        out.miter = !!v.miter;
        out.miterGap = out.miter ? Math.max(0, +v.miterGap || 0) : 0;
        out.relief = RELIEF_NAMES[v.relief] ? v.relief : 'none';
        out.reliefWidth = out.relief !== 'none' && !v.useDefaultReliefWidth ? +v.reliefWidthValue : null;
        out.reliefDepth = out.relief !== 'none' && !v.useDefaultReliefDepth ? +v.reliefDepthValue : null;
      }
      // UI-only keys must never reach the model (feature JSON is the rebuild cache key)
      delete out.useDefaultReliefWidth; delete out.reliefWidthValue; delete out.useDefaultReliefDepth; delete out.reliefDepthValue;
      return out;
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      if (!f.edges.length) { UI.setStatus('Click straight edges of the sheet to add ' + (isJog ? 'a jog' : isHem ? 'a hem' : 'flanges') + '.'); return; }
      try {
        var feat = toFeature(f), tool;
        if (isJog) { var jg = K.buildJog(feat, App.model, { body: App.build.body, flanges: {}, tools: {} }); tool = jg.first.union(jg.second); }
        else tool = K.buildFlange(feat, App.model, { body: App.build.body, flanges: {} });
        var mesh = K.meshFromBody(tool), g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
        UI.groups.preview.add(new THREE.Mesh(g, UI.mats.preview));
        var R = feat.radius != null ? feat.radius : sheet.bendRadius;
        var BA = K.bendAllowance(feat.angle * Math.PI / 180, R, T, sheet.kFactor);
        var extra = '';
        if (isFlange && feat.miter) extra += ' · mitred corners' + (feat.miterGap > 0 ? ' (gap ' + UI.fmtNum(feat.miterGap, 3) + ')' : '');
        if (isFlange && feat.relief !== 'none') extra += ' · ' + RELIEF_NAMES[feat.relief].toLowerCase() + ' relief';
        UI.setStatus(titles[kind] + ' preview: ' + edgeList.length + ' edge' + (edgeList.length === 1 ? '' : 's') + ' · bend allowance ' + UI.fmtNum(BA, 3) + ' ' + UI.unitLabel() + (isJog ? ' per bend' : '') + ' (K=' + sheet.kFactor + ')' + extra + '.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
    }
    var radiusFields = [
      { type: 'check', label: 'Use default bend radius (' + sheet.bendRadius + ')', key: 'useDefaultRadius', rerender: true },
      { type: 'number', label: 'Bend radius', key: 'radiusValue', unit: 'u', min: 0, show: function (v) { return !v.useDefaultRadius; } }
    ];
    var groups = isJog ? [
      { title: 'Jog Parameters', fields: [
        { type: 'pick', icon: 'flange', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Select edges…' },
        { type: 'number', label: 'Jog height', key: 'height', unit: 'u', min: 0 },
        { type: 'number', label: 'Flat length', key: 'length', unit: 'u', min: 0 },
        { type: 'number', label: 'Bend angle', key: 'angle', unit: '°', min: 0 },
        { type: 'check', label: 'Reverse direction', key: 'reverse' }
      ].concat(radiusFields, [{ type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }]) },
      { title: 'Jog Position', fields: [{ type: 'select', label: 'Position', key: 'position', options: [['bendOutside', 'Bend Outside'], ['outside', 'Material Outside'], ['inside', 'Material Inside']] }] }
    ] : isHem ? [
      { title: 'Hem Parameters', fields: [
        { type: 'pick', icon: 'flange', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Select edges…' },
        { type: 'number', label: 'Gap (open hem)', key: 'gap', unit: 'u', min: 0 },
        { type: 'number', label: 'Hem length', key: 'length', unit: 'u', min: 0 },
        { type: 'check', label: 'Reverse direction', key: 'reverse' },
        { type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }
      ] }
    ] : [
      { title: 'Flange Parameters', fields: [
        { type: 'pick', icon: 'flange', value: function (v) { return v.edges.length ? v.edges.length + ' edge' + (v.edges.length > 1 ? 's' : '') : ''; }, placeholder: 'Select edges…' }
      ].concat(radiusFields, [{ type: 'buttons', buttons: [{ label: 'Clear selection', onclick: function (v) { v.edges.length = 0; renderPM(); resolveList(); preview(); } }] }]) },
      { title: 'Angle', fields: [{ type: 'number', label: 'Flange angle', key: 'angle', unit: '°', min: 0 }] },
      { title: 'Flange Length', fields: [{ type: 'number', label: 'Length', key: 'length', unit: 'u', min: 0 }, { type: 'check', label: 'Reverse direction', key: 'reverse' }] },
      { title: 'Flange Position', fields: [{ type: 'select', label: 'Position', key: 'position', options: [['bendOutside', 'Bend Outside'], ['outside', 'Material Outside'], ['inside', 'Material Inside']] }] },
      { title: 'Miter', fields: [
        { type: 'check', label: 'Miter corners', key: 'miter', rerender: true },
        { type: 'number', label: 'Gap', key: 'miterGap', unit: 'u', min: 0, show: function (v) { return !!v.miter; } }
      ] },
      { title: 'Auto Relief', fields: [
        { type: 'select', label: 'Relief type', key: 'relief', options: [['none', 'None'], ['rect', 'Rectangle'], ['obround', 'Obround']], rerender: true },
        { type: 'check', label: 'Use default width (T = ' + T + ')', key: 'useDefaultReliefWidth', rerender: true, show: function (v) { return v.relief !== 'none'; } },
        { type: 'number', label: 'Relief width', key: 'reliefWidthValue', unit: 'u', min: 0, show: function (v) { return v.relief !== 'none' && !v.useDefaultReliefWidth; } },
        { type: 'check', label: 'Use default depth (T/2 = ' + T / 2 + ')', key: 'useDefaultReliefDepth', rerender: true, show: function (v) { return v.relief !== 'none'; } },
        { type: 'number', label: 'Relief depth', key: 'reliefDepthValue', unit: 'u', min: 0, show: function (v) { return v.relief !== 'none' && !v.useDefaultReliefDepth; } }
      ] }
    ];
    groups.push({ title: 'Sheet', fields: [{ type: 'static', label: 'Thickness', value: T + ' ' + UI.unitLabel() }, { type: 'static', label: 'K-factor', value: String(sheet.kFactor) }] });
    groups.push({ title: 'Feature', collapsed: true, fields: [{ type: 'text', label: 'Name', key: 'name' }] });
    openPM({
      title: existing ? existing.name : titles[kind], icon: isMiter ? 'miter' : 'flange', values: f,
      message: isJog ? 'Click <b>straight edges</b>: the sheet steps up by the jog height and continues flat. Reverse steps it down.' : isHem ? 'Click <b>straight edges</b> to fold the sheet back over itself. The gap is the opening between the two flats.' :
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
      onChange: function () { resolveList(); preview(); },
      onOK: function (v) {
        if (!v.edges.length) { UI.toast('Select at least one edge.'); return false; }
        var feat = toFeature(v);
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

  function flatSvg(flat, width) {
    var b = flat.bbox, w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], pad = Math.max(w, h) * 0.08 + 2;
    var vb = [b.min[0] - pad, -(b.max[1] + pad), w + 2 * pad, h + 2 * pad];
    var sw = Math.max(w, h) / 300;
    function pt(p) { return UI.fmtNum(p[0], 3) + ',' + UI.fmtNum(-p[1], 3); }
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') + '" width="' + width + '" style="max-width:100%;background:#fff;border:1px solid #d3d8de">';
    flat.loops.forEach(function (l, i) { s += '<polygon points="' + l.map(pt).join(' ') + '" fill="' + (i === 0 ? '#eef3f8' : '#fff') + '" stroke="' + (i === 0 ? '#24292f' : '#d9453b') + '" stroke-width="' + sw + '"/>'; });
    flat.bends.forEach(function (bd) {
      s += '<line x1="' + UI.fmtNum(bd.a[0], 3) + '" y1="' + UI.fmtNum(-bd.a[1], 3) + '" x2="' + UI.fmtNum(bd.b[0], 3) + '" y2="' + UI.fmtNum(-bd.b[1], 3) + '" stroke="#3fa34d" stroke-width="' + sw + '" stroke-dasharray="' + (sw * 6) + ' ' + (sw * 3) + '"/>';
      var mx = (bd.a[0] + bd.b[0]) / 2, my = -(bd.a[1] + bd.b[1]) / 2;
      s += '<text x="' + UI.fmtNum(mx, 3) + '" y="' + UI.fmtNum(my - sw * 4, 3) + '" font-size="' + (sw * 12) + '" font-family="Segoe UI, sans-serif" fill="#1f6fc5" text-anchor="middle">' + bd.label + '</text>';
    });
    s += '<text x="' + UI.fmtNum(b.min[0], 3) + '" y="' + UI.fmtNum(-b.min[1] + sw * 16, 3) + '" font-size="' + (sw * 11) + '" font-family="Segoe UI, sans-serif" fill="#6b7480">' + UI.fmtNum(w, 2) + ' × ' + UI.fmtNum(h, 2) + ' ' + UI.unitLabel() + ' · T=' + flat.sheet.thickness + ' R=' + flat.sheet.bendRadius + ' K=' + flat.sheet.kFactor + '</text>';
    return s + '</svg>';
  }

  function cmdFlatten() {
    if (App.mode === 'sketch') UI.exitSketch(true);
    var flat;
    try { flat = K.flatPattern(App.model, App.build, App.mesh); }
    catch (e) { UI.toast(e.message); UI.setStatus(e.message); return; }
    var w = flat.bbox.max[0] - flat.bbox.min[0], h = flat.bbox.max[1] - flat.bbox.min[1];
    var body = UI.el('div', {});
    body.innerHTML = '<p>Flat pattern: <b>' + UI.fmtNum(w, 2) + ' × ' + UI.fmtNum(h, 2) + ' ' + UI.unitLabel() + '</b> blank, ' + flat.bends.length + ' bend' + (flat.bends.length === 1 ? '' : 's') + '. Bend lines sit at the centre of each bend allowance (K=' + flat.sheet.kFactor + ').</p>' + flatSvg(flat, 620);
    var dxf = K.exportDXFFlat(flat, App.model.units);
    UI.showModal({ title: 'Flat Pattern — ' + App.model.name, body: body, buttons: [
      { label: 'Export DXF', primary: true, action: function () { UI.closeModal(); UI.exportDialog('Flat pattern DXF', (App.model.name || 'part').replace(/[^\w\-]+/g, '_') + '_flat.dxf', dxf, 'application/dxf'); } },
      { label: 'Close', action: UI.closeModal }
    ] });
  }
  function exportFlatDXF() {
    var flat;
    try { flat = K.flatPattern(App.model, App.build, App.mesh); }
    catch (e) { UI.toast(e.message); return; }
    UI.exportDialog('Flat pattern DXF', (App.model.name || 'part').replace(/[^\w\-]+/g, '_') + '_flat.dxf', K.exportDXFFlat(flat, App.model.units), 'application/dxf');
  }

  // ------------------------------------------------------------------ section view
  function cmdSection() {
    if (App.view.section) { App.view.section = null; UI.applyDisplayStyle(); UI.refreshHud(); return; }
    var v = { plane: 'Right', offset: 0, flip: false };
    function apply(x) {
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
  UI.onSelectionChanged = function () { if (pm.spec && pm.spec.title === 'Measure') renderPM(); };

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
    var fields = (ENTITY_FIELDS[e.t] || []).map(function (p) { return { type: 'number', label: p[1], key: p[0], unit: /X|Y|Width|Height|Radius/.test(p[1]) ? 'u' : undefined, step: p[0] === 'n' ? 1 : undefined }; });
    if (e.t === 'polyline') fields.push({ type: 'static', label: 'Points', value: e.pts.length + (e.closed ? ' (closed)' : ' (open)') });
    fields.push({ type: 'check', label: 'For construction', key: 'construction' });
    openPM({
      title: ENTITY_NAMES[e.t] || 'Entity', icon: e.t === 'crect' ? 'crect' : (e.t === 'poly' ? 'polygon' : e.t), values: JSON.parse(JSON.stringify(e)),
      groups: [{ title: 'Parameters', fields: fields }, { title: 'Actions', fields: [{ type: 'buttons', buttons: [{ label: 'Delete entity', onclick: function () { deleteEntity(index); closePM(); } }] }] }],
      onChange: function (v) {
        if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
        Object.keys(v).forEach(function (k) { e[k] = v[k]; });
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
    // dimensions follow their entities: drop the deleted one's, shift the rest
    if (f.dims) f.dims = f.dims.filter(function (d) { return d.e !== index; }).map(function (d) { if (d.e > index) d.e--; return d; });
    App.sel = null;
    UI.updateSketches();
  }
  function openToolPM(tool) {
    App.toolParams = App.toolParams || { sides: 6 };
    if (tool === 'polygon') openPM({
      title: 'Polygon', icon: 'polygon', values: App.toolParams,
      groups: [{ title: 'Parameters', fields: [{ type: 'number', label: 'Number of sides', key: 'sides', step: 1, min: 3 }] }],
      onChange: function (v) { App.toolParams = v; }, onOK: function () { }, onClose: function () { }
    });
  }

  // ------------------------------------------------------------------ edit / delete features
  function editFeature(f) {
    if (!f) return;
    switch (f.type) {
      case 'sketch': editSketch(f.id); break;
      case 'extrude': cmdExtrude(f.cut, f); break;
      case 'revolve': cmdRevolve(f.cut, f); break;
      case 'lpattern': cmdLinearPattern(f); break;
      case 'cpattern': cmdCircularPattern(f); break;
      case 'mirror': cmdMirror(f); break;
      case 'plane': cmdPlane(f); break;
      case 'chamfer': cmdChamfer(f); break;
      case 'fillet': cmdFillet(f); break;
      case 'flange': cmdEdgeFlange(f); break;
      case 'jog': cmdJog(f); break;
      case 'sweep': cmdSweep(f.cut, f); break;
      case 'loft': cmdLoft(f.cut, f); break;
      case 'shell': cmdShell(f); break;
    }
  }
  function deleteFeature(id) {
    var f = K.findFeature(App.model, id);
    if (!f) return;
    var dependents = App.model.features.filter(function (g) { return g.sketch === id || g.feature === id || (g.plane && g.plane.featureId === id); });
    var msg = 'Delete <b>' + f.name + '</b>?' + (dependents.length ? '<br>This also deletes: ' + dependents.map(function (d) { return d.name; }).join(', ') : '');
    UI.confirmDialog('Confirm Delete', msg, function () {
      UI.pushUndo();
      var doomed = [id].concat(dependents.map(function (d) { return d.id; }));
      // cascade one more level (patterns of dependents)
      App.model.features.forEach(function (g) { if (doomed.indexOf(g.feature) >= 0 && doomed.indexOf(g.id) < 0) doomed.push(g.id); });
      App.model.features = App.model.features.filter(function (g) { return doomed.indexOf(g.id) < 0; });
      if (App.activeSketch != null && doomed.indexOf(App.activeSketch) >= 0) UI.exitSketch(true);
      App.sel = null; App.sel2 = null;
      closePM();
      UI.afterRebuild(UI.rebuild(), function () {
        UI.setStatus('Deleted ' + f.name + (dependents.length ? ' and ' + dependents.length + ' dependent feature' + (dependents.length > 1 ? 's' : '') : '') + '.');
      });
    }, 'Delete');
  }
  function deleteSelection() {
    if (App.mode === 'sketch' && App.sel && App.sel.kind === 'entity') { deleteEntity(App.sel.index); closePM(); return; }
    if (App.mode === 'sketch' && App.sel && App.sel.kind === 'dim') { UI.deleteDim(App.sel.index); return; }
    if (App.sel && App.sel.kind === 'feature') { deleteFeature(App.sel.id); return; }
    if (App.sel && App.sel.kind === 'face' && App.mesh) {
      var id = App.triShared[App.mesh.faces[App.sel.index].start];
      if (id >= 0) deleteFeature(id);
    }
  }

  UI.openPM = openPM; UI.closePM = closePM; UI.pmOK = pmOK; UI.pmCancel = pmCancel; UI.hasPM = function () { return !!pm.spec; };
  UI.cmdSketch = cmdSketch; UI.editSketch = editSketch; UI.cmdExtrude = cmdExtrude; UI.cmdRevolve = cmdRevolve;
  UI.cmdLinearPattern = cmdLinearPattern; UI.cmdCircularPattern = cmdCircularPattern; UI.cmdMirror = cmdMirror; UI.cmdPlane = cmdPlane;
  UI.cmdHole = cmdHole; UI.cmdBaseFlange = cmdBaseFlange; UI.cmdSection = cmdSection; UI.cmdMeasure = cmdMeasure;
  UI.cmdChamfer = cmdChamfer; UI.cmdFillet = cmdFillet;
  UI.cmdEdgeFlange = cmdEdgeFlange; UI.cmdMiterFlange = cmdMiterFlange; UI.cmdHem = cmdHem; UI.cmdJog = cmdJog; UI.cmdFlatten = cmdFlatten; UI.exportFlatDXF = exportFlatDXF;
  UI.cmdConvertEntities = cmdConvertEntities; UI.cmdOffsetEntities = cmdOffsetEntities; UI.cmdSketchFillet = cmdSketchFillet; UI.cmdTrimEntities = cmdTrimEntities; UI.cmdMirrorEntities = cmdMirrorEntities; UI.cmdSketchPattern = cmdSketchPattern;
  UI.cmdSweep = cmdSweep; UI.cmdLoft = cmdLoft; UI.cmdShell = cmdShell;
  UI.openEntityPM = openEntityPM; UI.openToolPM = openToolPM; UI.editFeature = editFeature; UI.deleteFeature = deleteFeature; UI.deleteSelection = deleteSelection;
  UI.newSketchOnPlane = newSketchOnPlane;
})(UI);
