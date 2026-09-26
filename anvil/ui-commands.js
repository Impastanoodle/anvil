// ui-commands.js — PropertyManager rendering and the feature commands (sketch, extrude, revolve, patterns, mirror, ...).
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;

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

  function openPM(spec) {
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
    pm.spec = null; pm.values = null; pm.exprs = {}; pm.exprErrors = {};
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
    var bad = Object.keys(pm.exprErrors || {});
    if (bad.length) {
      var msg = 'Fix the equation in ' + bad[0] + ': ' + pm.exprErrors[bad[0]];
      UI.setStatus(msg); UI.toast(msg);
      return UI.whenIdle();
    }
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

  // The ✓ button looks disabled (and pmOK refuses) while a number field holds an equation that does not evaluate.
  function updateOkState() {
    var ok = pm.root.querySelector('.pm-ok');
    if (!ok) return;
    var bad = Object.keys(pm.exprErrors || {});
    ok.classList.toggle('disabled', bad.length > 0);
    ok.setAttribute('aria-disabled', bad.length ? 'true' : 'false');
    ok.title = bad.length ? 'OK (Enter) — fix the equation first: ' + pm.exprErrors[bad[0]] : 'OK (Enter)';
  }

  function renderPM() {
    var spec = pm.spec, root = pm.root;
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'pm-head', html: Icons(spec.icon || 'generic', 20) + '<span>' + spec.title + '</span>' }));
    var actions = el('div', { class: 'pm-actions' });
    actions.appendChild(el('button', { title: 'OK (Enter)', class: 'pm-ok', html: Icons('ok', 20), onclick: pmOK }));
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
        inp.addEventListener('input', function () {
          var s = inp.value;
          if (isExpr(s)) { if (inp.type !== 'text') { inp.type = 'text'; } setExpr(s); return; }
          clearExpr();
          var n = parseFloat(s); if (!isNaN(n)) changed(n);
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); pmOK(); return; }
          // a number box cannot hold "=": switch to a text box and start the equation
          if (e.key === '=' && inp.type === 'number') {
            e.preventDefault();
            inp.type = 'text'; inp.value = '=';
            try { inp.setSelectionRange(1, 1); } catch (er) { }
            setExpr('=');
            return;
          }
          // no spin increments on an equation
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') && pm.exprs[key] != null) e.preventDefault();
        });
        inp.addEventListener('wheel', function (e) { if (pm.exprs[key] != null) e.preventDefault(); });
        // leaving a text box that no longer holds an equation turns it back into a number box
        inp.addEventListener('blur', function () {
          if (inp.type === 'text' && pm.exprs[key] == null) { var s = inp.value; inp.type = 'number'; inp.value = isNaN(parseFloat(s)) ? (v[key] == null ? '' : v[key]) : parseFloat(s); }
        });
        showHint();
        var wrap = el('span', { class: 'pm-num-wrap' }, [inp, f.unit ? el('span', { class: 'unit', text: f.unit === 'u' ? UI.unitLabel() : f.unit }) : null]);
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
      var tool = K.buildTool(feature, previewModel(), ctx);
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
      var err = App.build.errors[f.id];
      UI.setStatus(err ? f.name + ' failed: ' + err : f.name + (existing ? ' updated' : ' created') + '. Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms.');
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
    return UI.afterRebuild(UI.rebuild(), function () { UI.enterSketch(f.id); });
  }
  function newSketchOnFace(pk) {
    if (isAsm()) { refusePart('Sketch'); return Promise.resolve(null); }
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
          var before = f.entities.slice(), out = K.trimEntity(f.entities, hit.index, uv);
          if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
          f.entities = out.map(roundPts);
          if (window.SketchSolver) SketchSolver.remap(f, before);  // relations on untouched entities survive
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
        if (!v.copy) { var spec = /^\d+$/.test(String(v.axis)) ? +v.axis : -1, before = f.entities.slice(); f.entities = f.entities.filter(function (e, i) { return targets.indexOf(i) < 0 || i === spec; }); if (window.SketchSolver) SketchSolver.remap(f, before); }
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
    App.sketchSnapshot = JSON.stringify({ entities: f.entities, dims: f.dims || [], rels: f.rels || null });
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
      var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'extrude', cut: !!cut, depth: 10, end: cut ? 'through' : 'blind', reverse: false, dir2: false, depth2: 10, end2: 'blind', sketch: pickDefaultSketch(sid) };
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
        command: { sketchId: f.sketch },
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
        title: existing ? existing.name : title, icon: f.cut ? 'revolveCut' : 'revolve', values: f, command: { sketchId: f.sketch },
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
    var f = existing ? JSON.parse(JSON.stringify(existing)) : { type: 'lpattern', feature: defaultSource(), d1: 'x', rev1: false, s1: 20, n1: 3, d2: null, rev2: false, s2: 20, n2: 2 };
    if (!needSource(f)) return;
    initBodyFields(f, existing);
    function toFeature(v) { return applyBodyFields(JSON.parse(JSON.stringify(v)), v, featureIsCut(v)); }
    openPM({
      title: existing ? existing.name : 'Linear Pattern', icon: 'lpattern', values: f,
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
      title: existing ? existing.name : 'Circular Pattern', icon: 'cpattern', values: f,
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
      title: existing ? existing.name : 'Mirror', icon: 'mirror', values: f,
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
          // the sheet parameters may be equations too (the kernel resolves model.sheet like a feature)
          App.model.sheet = { thickness: pmExpr('thickness', +v.thickness), bendRadius: pmExpr('bendRadius', +v.bendRadius), kFactor: pmExpr('kFactor', +v.kFactor) };
          v.depth = pmExpr('thickness', +v.thickness); v.name = 'Base-Flange' + (App.model.features.filter(function (q) { return /^Base-Flange\d+$/.test(q.name || ''); }).length + 1);
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
    var sheet = previewModel().sheet || App.model.sheet, T = +sheet.thickness;   // resolved: the sheet parameters may be equations
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
        if (isJog) { var jg = K.buildJog(feat, previewModel(), { body: App.build.body, flanges: {}, tools: {} }); tool = jg.first.union(jg.second); }
        else tool = K.buildFlange(feat, previewModel(), { body: App.build.body, flanges: {} });
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
      exprMap: { radiusValue: 'radius', reliefWidthValue: 'reliefWidth', reliefDepthValue: 'reliefDepth' },
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
    return { ok: !err && s.ok !== false, error: err };
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
        if (!m || m.type === 'assembly' || !Array.isArray(m.features)) { UI.toast('Pick a part JSON file (File ▸ Save As in a part).'); return; }
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
        if (key !== 'part' || x.part !== 'browse') return;
        x.part = list.length ? list[0].key : '';
        renderPM();
        browsePart(function (b) { if (pm.spec && pm.values === x) { x.part = b.key; renderPM(); } });
      },
      onOK: function (x) {
        var src = insertSources().filter(function (s) { return s.key === x.part; })[0];
        if (!src) { UI.toast('Pick a part to insert first.'); return false; }
        var p = asmInsert(src.source, { position: [+x.x || 0, +x.y || 0, +x.z || 0] });
        p.catch(function (e) { UI.toast(e.message || String(e)); });
        return p;
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
    if (ref.face) return 'Face@' + who;
    if (ref.cylinder) return 'Cylindrical Face@' + who;
    if (ref.plane) return ref.plane + ' Plane@' + who;
    if (ref.axis) return 'Axis ' + String(ref.axis).toUpperCase() + '@' + who;
    return who;
  }
  function defaultMateType(a, b) { return refKind(a) === 'axis' && refKind(b) === 'axis' ? 'concentric' : 'coincident'; }
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
    var snapshot = JSON.stringify(App.model), previewed = false;
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
    function clearPicks(x) { x.a = null; x.b = null; x.a2 = null; x.b2 = null; picked = []; if (App.command) App.command.faceList = []; }
    var typeSet = !!existing, alignSet = !!(existing && existing.alignment), valueSet = !!existing, picked = [];
    function restore() { App.model = JSON.parse(snapshot); }
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
      var opts = alignSet ? { alignment: v.alignment } : {};
      var wide = v.type === 'width';
      if (existing) {
        var x = Assembly.findMate(m, existing.id);
        if (x.type !== v.type && /^(Coincident|Concentric|Distance|Angle|Parallel|Perpendicular|Tangent|Width|Gear|LimitDistance|LimitAngle)\d+$/.test(x.name)) x.name = nextMateName(m, v.type, x.id);
        if (x.type !== v.type) delete x.phase;
        x.type = v.type; x.a = JSON.parse(JSON.stringify(v.a)); x.b = JSON.parse(JSON.stringify(v.b));
        if (wide && v.a2) x.a2 = JSON.parse(JSON.stringify(v.a2)); else delete x.a2;
        if (wide && v.b2) x.b2 = JSON.parse(JSON.stringify(v.b2)); else delete x.b2;
        if (alignSet) x.alignment = v.alignment; else delete x.alignment;
        Assembly.setMateValues(x, mateValues());
        return x;
      }
      var mv = mateValues();
      Object.keys(mv).forEach(function (k) { if (mv[k] != null) opts[k] = mv[k]; });
      if (wide) { opts.a2 = v.a2 ? JSON.parse(JSON.stringify(v.a2)) : null; if (v.b2) opts.b2 = JSON.parse(JSON.stringify(v.b2)); }
      return Assembly.addMate(m, v.type, JSON.parse(JSON.stringify(v.a)), JSON.parse(JSON.stringify(v.b)), opts);
    }
    function setMessage(html, ok) { if (!pm.spec) return; pm.spec.message = html; pm.spec.messageOk = !!ok; renderPM(); }
    function selectMessage() {
      return v.type === 'width' ? 'Width: select the two width faces (the slot sides), then the two tab faces or one cylindrical face (the part centred between them).'
        : 'Select two entities to mate: planar faces, cylindrical faces, or origin planes, on different components.';
    }
    function preview() {
      if (!ready(v)) {
        if (previewed) { restore(); previewed = false; UI.rebuild({ noSave: true }); }
        setMessage(selectMessage());
        return;
      }
      var kindErr = mateKindError(v.type, v.a, v.b, v.a2, v.b2);
      restore();
      if (kindErr) { if (previewed) { previewed = false; UI.rebuild({ noSave: true }); } setMessage(kindErr + '. Pick other entities or change the mate type.'); return; }
      var mt;
      try { mt = apply(App.model); previewed = true; UI.rebuild({ noSave: true }); }
      catch (e) { restore(); previewed = false; UI.rebuild({ noSave: true }); setMessage('Preview failed: ' + (e.message || e)); return; }
      var st = mateStatus(mt);
      setMessage(st.error ? mateTypeLabel(v.type) + ': ' + st.error : mateTypeLabel(v.type) + ' mate previewed. Press ✓ to ' + (existing ? 'update' : 'add') + ' it.', !st.error);
    }
    function addRef(ref, faceIndex) {
      if (!ref) return false;
      if (ready(v)) clearPicks(v);
      var slot = slots(v).filter(function (k) { return !v[k]; })[0];
      v[slot] = ref;
      if (faceIndex != null) picked.push(faceIndex);
      if (App.command) App.command.faceList = picked.slice();
      if (!typeSet) v.type = defaultMateType(v.a, v.b);
      if (!alignSet) v.alignment = defaultAlignment(v.type, v.a, v.b);
      measure();
      renderPM();
      preview();
      UI.updateHighlights();
      return true;
    }
    openPM({
      title: existing ? existing.name : 'Mate', icon: 'mate', values: v,
      message: 'Select two entities to mate: planar faces, cylindrical faces, or origin planes, on different components.',
      command: {
        pickPlane: true, faceList: [],
        onPick: function (pk) {
          var ref = null;
          if (pk.kind === 'face') { try { ref = Assembly.refFromPick(App.model, App.build, pk.index, pk.point, App.mesh); } catch (e) { ref = null; } }
          else if (pk.kind === 'axis' && typeof pk.ref === 'string') ref = { axis: pk.ref };
          else if (pk.kind === 'plane' && typeof pk.ref === 'string') ref = { plane: pk.ref };
          if (!ref) { UI.setStatus('That entity cannot be used in a mate.'); return true; }
          return addRef(ref, pk.kind === 'face' ? pk.index : null);
        }
      },
      groups: [
        { title: 'Mate Selections', fields: [
          { type: 'pick', icon: 'component', value: function (x) { return refText(x.a); }, placeholder: 'First entity…', show: function (x) { return x.type !== 'width'; } },
          { type: 'pick', icon: 'component', value: function (x) { return refText(x.b); }, placeholder: 'Second entity…', show: function (x) { return x.type !== 'width'; } },
          { type: 'static', label: 'Width selections', value: '', show: function (x) { return x.type === 'width'; } },
          { type: 'pick', icon: 'width', value: function (x) { return refText(x.a); }, placeholder: 'First width face…', show: function (x) { return x.type === 'width'; } },
          { type: 'pick', icon: 'width', value: function (x) { return refText(x.a2); }, placeholder: 'Second width face…', show: function (x) { return x.type === 'width'; } },
          { type: 'static', label: 'Tab selections', value: '', show: function (x) { return x.type === 'width'; } },
          { type: 'pick', icon: 'component', value: function (x) { return refText(x.b); }, placeholder: 'Tab face or cylindrical face…', show: function (x) { return x.type === 'width'; } },
          { type: 'pick', icon: 'component', value: function (x) { return refText(x.b2); }, placeholder: 'Second tab face…', show: function (x) { return x.type === 'width' && refKind(x.b) !== 'axis'; } },
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
          if (!alignSet) x.alignment = defaultAlignment(x.type, x.a, x.b);
          if (!valueSet && LIMIT[x.type]) measure();
          syncGroups(x);
          renderPM();
        }
        if (key === 'alignment') alignSet = true;
        if (key === 'distance' || key === 'angle' || key === 'min' || key === 'max') valueSet = true;
        if (key) preview();
      },
      onCancel: function () { if (previewed) { restore(); previewed = false; UI.rebuild({ noSave: true }); } },
      onClose: function () { mateSession = null; },
      onOK: function (x) {
        if (!ready(x)) { UI.toast(x.type === 'width' ? 'Select the width faces and the tab faces first.' : 'Select two entities to mate first.'); return false; }
        var kindErr = mateKindError(x.type, x.a, x.b, x.a2, x.b2);
        if (kindErr) { UI.toast(kindErr + '.'); return false; }
        restore(); previewed = false;
        return asmCommit(apply, function (mt) {
          var st = mateStatus(mt);
          return st.error ? mt.name + ': ' + st.error : mt.name + (existing ? ' updated.' : ' added.');
        });
      }
    });
    mateSession = { addRef: function (ref) { return addRef(JSON.parse(JSON.stringify(ref)), null); }, values: v };
    if (existing) preview();
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
  function componentDragHook(p) {
    if (!isAsm() || typeof Assembly === 'undefined' || App.mode === 'sketch' || !App.mesh) return null;
    if (App.command && !App.command.dragComponents) return null;
    var hit = UI.pickFace(p[0], p[1]), face = hit && App.mesh.faces[hit.index];
    var c = face ? (App.model.components || [])[face.body || 0] : null;
    if (!c) return null;
    if (c.fixed) { UI.setStatus(c.name + ' is fixed: Float it to drag it.'); return null; }
    var mode = App.command && App.command.dragComponents === 'rotate' ? 'rotate' : 'move';
    var snap = JSON.stringify(App.model), id = c.id, start = p.slice(), last = null, raf = 0;
    var center = Assembly.componentCenter(App.model, App.build, id);
    function target(q) {
      var m = JSON.parse(snap), dx = q[0] - start[0], dy = q[1] - start[1], r = UI.cam.right, u = UI.cam.up, sc = UI.cam.scale;
      if (mode === 'move') Assembly.moveComponent(m, id, [(r.x * dx - u.x * dy) * sc, (r.y * dx - u.y * dy) * sc, (r.z * dx - u.z * dy) * sc]);
      else {
        if (dx) Assembly.rotateComponent(m, id, [u.x, u.y, u.z], dx * DRAG_DEG_PER_PX, center);
        if (dy) Assembly.rotateComponent(m, id, [r.x, r.y, r.z], dy * DRAG_DEG_PER_PX, center);
      }
      return m;
    }
    function show() { raf = 0; if (!last) return; App.model = target(last); UI.rebuild({ noSave: true }); }
    return {
      component: c,
      start: function () { UI.setStatus((mode === 'move' ? 'Moving ' : 'Rotating ') + c.name + '…'); },
      move: function (q) { last = q; if (!raf) raf = requestAnimationFrame(show); },
      end: function (q) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        var T = Assembly.findComponent(target(q), id).transform;
        App.model = JSON.parse(snap);
        return asmCommit(function (m) { var x = Assembly.findComponent(m, id); x.transform = T; return x; }, c.name + (mode === 'move' ? ' moved' : ' rotated') + '; mates solved again.')
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

  // ---- Interference Detection (Evaluate tab)
  // Lists every pair of components whose solids overlap (Assembly.interference: CSG.intersect of the world bodies),
  // largest first. The interfering components' faces are highlighted and the common volumes drawn in red on top;
  // clicking a result shows that pair only (click again for all). Calculate runs it again after the assembly changed.
  var intfMat = null;
  function interferenceMaterial() {
    if (!intfMat) intfMat = new THREE.MeshBasicMaterial({ color: 0xe0553c, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    return intfMat;
  }
  function asmInterference() {
    if (!isAsm() || typeof Assembly === 'undefined') return { pairs: [], volume: 0, checked: 0 };
    return Assembly.interference(App.model, App.build);
  }
  var intfSession = null;
  function escHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cmdInterference() {
    if (!asmReady()) return;
    var res = null, active = -1, u = UI.unitLabel();
    function shown() { return !res ? [] : active >= 0 ? [res.pairs[active]] : res.pairs; }
    function highlight() {
      UI.disposeGroup(UI.groups.preview);
      var comps = {};
      shown().forEach(function (p) {
        comps[p.aIndex] = true; comps[p.bIndex] = true;
        try {
          var mesh = K.meshFromBody(p.body), g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
          g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
          var obj = new THREE.Mesh(g, interferenceMaterial());
          obj.renderOrder = 10;
          UI.groups.preview.add(obj);
        } catch (e) { /* a degenerate common body is still listed */ }
      });
      if (App.command) App.command.faceList = App.mesh ? App.mesh.faces.map(function (f, i) { return comps[f.body || 0] ? i : -1; }).filter(function (i) { return i >= 0; }) : [];
      UI.updateHighlights();
    }
    function rowsHtml() {
      if (!res) return '';
      if (!res.pairs.length) return '<div class="intf-none">No Interferences</div>';
      return res.pairs.map(function (p, i) {
        return '<div class="intf-row' + (i === active ? ' selected' : '') + '" data-i="' + i + '">' + Icons('interference', 16) + '<span><b>Interference' + (i + 1) + '</b> — ' +
          UI.fmtNum(p.volume, 3) + ' ' + u + '³<br><small>' + escHtml(p.aName) + ' · ' + escHtml(p.bName) + '</small></span></div>';
      }).join('');
    }
    function report() {
      if (!pm.spec) return;
      var n = res.pairs.length;
      pm.spec.message = res.error ? 'Interference Detection failed: ' + res.error
        : n ? n + ' interference' + (n > 1 ? 's' : '') + ', ' + UI.fmtNum(res.volume, 3) + ' ' + u + '³ in all (' + res.checked + ' pair' + (res.checked === 1 ? '' : 's') + ' checked).'
          : 'No interferences: no two components overlap (touching faces are not interferences).';
      pm.spec.messageOk = !n && !res.error;
      renderPM();
      highlight();
      UI.setStatus(pm.spec.message);
    }
    function calculate() {
      try { res = asmInterference(); } catch (e) { res = { pairs: [], volume: 0, checked: 0, error: e.message || String(e) }; }
      active = -1;
      report();
      return res;
    }
    function onClick(e) {
      var row = e.target.closest && e.target.closest('.intf-row');
      if (!row) return;
      var i = +row.getAttribute('data-i');
      active = active === i ? -1 : i;
      renderPM(); highlight();
    }
    var n = (App.model.components || []).length;
    openPM({
      title: 'Interference Detection', icon: 'interference', values: {},
      message: 'Calculating…',
      command: { faceList: [] },
      groups: [
        { title: 'Selected Components', fields: [
          { type: 'static', label: 'Check', value: 'Entire assembly (' + n + ' component' + (n === 1 ? '' : 's') + ')' },
          { type: 'buttons', buttons: [{ label: 'Calculate', onclick: function () { calculate(); } }] }
        ] },
        { title: 'Results', fields: [{ type: 'html', html: function () { return '<div class="intf-list">' + rowsHtml() + '</div>'; } }] }
      ],
      onClose: function () { pm.root.removeEventListener('click', onClick); intfSession = null; },
      onOK: function () { }
    });
    pm.root.addEventListener('click', onClick);
    intfSession = { calculate: calculate, results: function () { return res; }, select: function (i) { active = i; renderPM(); highlight(); } };
    calculate();
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

  UI.openPM = openPM; UI.renderPM = renderPM; UI.closePM = closePM; UI.pmOK = pmOK; UI.pmCancel = pmCancel; UI.hasPM = function () { return !!pm.spec; };
  // equations in PropertyManager number fields: the open PM's equation texts and errors (copies), and a field setter for scripts/tests
  UI.pmExpressions = function () { return { exprs: JSON.parse(JSON.stringify(pm.exprs || {})), errors: JSON.parse(JSON.stringify(pm.exprErrors || {})) }; };
  UI.pmSetField = function (key, text) {
    var inp = pm.root.querySelector('input.pm-num[data-key="' + key + '"]');
    if (!inp) return false;
    if (isExpr(text) && inp.type !== 'text') inp.type = 'text';
    inp.value = String(text);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  UI.evalFieldExpr = evalFieldExpr;
  UI.cmdSketch = cmdSketch; UI.editSketch = editSketch; UI.cmdExtrude = cmdExtrude; UI.cmdRevolve = cmdRevolve;
  UI.cmdLinearPattern = cmdLinearPattern; UI.cmdCircularPattern = cmdCircularPattern; UI.cmdMirror = cmdMirror; UI.cmdPlane = cmdPlane;
  UI.cmdHole = cmdHole; UI.cmdBaseFlange = cmdBaseFlange; UI.cmdSection = cmdSection; UI.cmdMeasure = cmdMeasure;
  UI.cmdChamfer = cmdChamfer; UI.cmdFillet = cmdFillet;
  UI.cmdEdgeFlange = cmdEdgeFlange; UI.cmdMiterFlange = cmdMiterFlange; UI.cmdHem = cmdHem; UI.cmdJog = cmdJog; UI.cmdFlatten = cmdFlatten; UI.exportFlatDXF = exportFlatDXF;
  UI.cmdConvertEntities = cmdConvertEntities; UI.cmdOffsetEntities = cmdOffsetEntities; UI.cmdSketchFillet = cmdSketchFillet; UI.cmdTrimEntities = cmdTrimEntities; UI.cmdMirrorEntities = cmdMirrorEntities; UI.cmdSketchPattern = cmdSketchPattern;
  UI.cmdSweep = cmdSweep; UI.cmdLoft = cmdLoft; UI.cmdShell = cmdShell;
  UI.openEntityPM = openEntityPM; UI.openToolPM = openToolPM; UI.editFeature = editFeature; UI.deleteFeature = deleteFeature; UI.deleteSelection = deleteSelection;
  UI.newSketchOnPlane = newSketchOnPlane;
  // part-only commands refuse in an assembly document (label = the SolidWorks command name for the message)
  [['cmdExtrude', 'Extruded Boss/Base'], ['cmdRevolve', 'Revolved Boss/Base'], ['cmdLinearPattern', 'Linear Pattern'], ['cmdCircularPattern', 'Circular Pattern'],
    ['cmdMirror', 'Mirror'], ['cmdPlane', 'Reference Plane'], ['cmdHole', 'Hole Wizard'], ['cmdBaseFlange', 'Base Flange/Tab'], ['cmdChamfer', 'Chamfer'], ['cmdFillet', 'Fillet'],
    ['cmdEdgeFlange', 'Edge Flange'], ['cmdMiterFlange', 'Miter Flange'], ['cmdHem', 'Hem'], ['cmdJog', 'Jog'], ['cmdFlatten', 'Flatten'], ['exportFlatDXF', 'Flat to DXF'],
    ['cmdConvertEntities', 'Convert Entities'], ['cmdOffsetEntities', 'Offset Entities'], ['cmdSketchFillet', 'Sketch Fillet'], ['cmdTrimEntities', 'Trim Entities'],
    ['cmdMirrorEntities', 'Mirror Entities'], ['cmdSketchPattern', 'Linear Sketch Pattern'], ['cmdSweep', 'Swept Boss/Base'], ['cmdLoft', 'Lofted Boss/Base'], ['cmdShell', 'Shell'],
    ['editSketch', 'Edit Sketch']
  ].forEach(function (c) { UI[c[0]] = partOnly(UI[c[0]], c[1]); });
  // assembly documents
  UI.cmdInsertComponent = cmdInsertComponent; UI.cmdMate = cmdMate; UI.editMate = editMate; UI.mateSelect = mateSelect;
  UI.cmdMoveComponent = function () { cmdMoveComponent('move'); }; UI.cmdRotateComponent = function () { cmdMoveComponent('rotate'); };
  UI.cmdInterference = cmdInterference; UI.componentDragHook = componentDragHook;
  UI.interference = asmInterference; UI.interferenceSession = function () { return intfSession; };
  UI.cmdFixComponent = cmdFixComponent; UI.cmdHideShowComponents = cmdHideShowComponents;
  UI.confirmRemoveComponent = confirmRemoveComponent; UI.confirmRemoveMate = confirmRemoveMate;
  UI.compLabel = compLabel; UI.compStatus = compStatus; UI.mateLabel = mateLabel; UI.mateStatus = mateStatus; UI.selectedComponent = selectedComponent;
  UI.asm = { insert: asmInsert, mate: asmAddMate, fix: asmSetFixed, removeComponent: asmRemoveComponent, removeMate: asmRemoveMate,
    suppressMate: asmSuppressMate, setHidden: asmSetHidden, isHidden: asmIsHidden, move: asmMove, rotate: asmRotate };
  UI.commands = { insertComponent: cmdInsertComponent, mate: cmdMate, editMate: editMate };
  UI.bodyList = bodyList; UI.bodyInfos = bodyInfos; UI.bodyTitle = bodyTitle; UI.selectBodyRow = selectBody;
})(UI);
