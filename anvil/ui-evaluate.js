// ui-evaluate.js — the Evaluate tab commands built on evaluate.js: Check, Zebra Stripes, Section Properties, Draft
// Analysis, Clearance Verification, and Interference Detection limited to selected components.
// Everything is drawn in the viewport as overlays (UI.groups.preview while a PropertyManager is open, a separate
// `analysis` group for the Zebra Stripes and Draft Analysis display) and is rebuilt when the model rebuilds.
// Loaded after ui-commands.js / ui-panels.js / ui-app.js; the ribbon buttons call the UI.cmd* functions defined here.
(function (UI) {
  'use strict';
  if (typeof Evaluate === 'undefined') return;
  var E = Evaluate, App = UI.App, K = UI.K, el = UI.el;

  function fmt(n, d) { return UI.fmtNum(n, d == null ? 3 : d); }
  function fmtV(v, d) { return v.map(function (x) { return fmt(Math.abs(x) < 5e-13 ? 0 : x, d); }).join(', '); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function kv(rows) {
    return '<div class="ev-kv">' + rows.map(function (r) { return '<span class="static">' + r[0] + '</span><span>' + r[1] + '</span>'; }).join('') + '</div>';
  }
  function rerender() { if (UI.renderPM) UI.renderPM(); }
  function pmIs(title) { return UI.hasPM() && UI.pmTitle && UI.pmTitle() === title; }

  // ------------------------------------------------------------------ bodies (parts) / components (assemblies)
  function bodies() {
    var b = App.build;
    if (!b) return [];
    if (b.bodies && b.bodies.length) return b.bodies;
    return b.body && b.body.polygons.length ? [b.body] : [];
  }
  function bodyNames() {
    var list = bodies();
    if (isAsm()) return list.map(function (x, i) { var c = (App.model.components || [])[i]; return c ? c.name : 'Component' + (i + 1); });
    return list.map(function (x, i) { return UI.bodyName ? UI.bodyName(i) : 'Body' + (i + 1); });
  }
  // body index of the current selection(s): a body / component row, or a face of it
  function selectedBodies() {
    var out = [];
    [App.sel, App.sel2].forEach(function (s) {
      if (!s) return;
      var i = s.kind === 'body' ? s.index : s.kind === 'face' && App.mesh && App.mesh.faces[s.index] ? (App.mesh.faces[s.index].body || 0) : -1;
      if (i >= 0 && out.indexOf(i) < 0) out.push(i);
    });
    return out;
  }
  // model size, for marker sizes
  function modelSize() {
    var b = UI.modelBounds ? UI.modelBounds() : null;
    return b ? Math.max(1e-3, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])) : 100;
  }

  // ------------------------------------------------------------------ overlay drawing helpers
  var markMats = {};
  function lineMat(color) {
    var k = 'l' + color;
    return markMats[k] || (markMats[k] = new THREE.LineBasicMaterial({ color: color, depthTest: false, transparent: true }));
  }
  function fillMat(color, opacity) {
    var k = 'f' + color + ':' + opacity;
    return markMats[k] || (markMats[k] = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  }
  function addLines(group, segs, color) {
    if (!segs.length) return null;
    var a = [];
    segs.forEach(function (s) { a.push(s[0][0], s[0][1], s[0][2], s[1][0], s[1][1], s[1][2]); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    var o = new THREE.LineSegments(g, lineMat(color));
    o.renderOrder = 20;
    group.add(o);
    return o;
  }
  function addTris(group, tris, color, opacity) {
    if (!tris.length) return null;
    var a = [];
    tris.forEach(function (t) { t.forEach(function (p) { a.push(p[0], p[1], p[2]); }); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    var o = new THREE.Mesh(g, fillMat(color, opacity == null ? 0.5 : opacity));
    o.renderOrder = 19;
    group.add(o);
    return o;
  }
  var pointGeo = null;
  function addPoint(group, p, color, r) {
    if (!pointGeo) pointGeo = new THREE.OctahedronGeometry(1, 1);
    var o = new THREE.Mesh(pointGeo, fillMat(color, 0.95));
    o.position.set(p[0], p[1], p[2]);
    o.scale.setScalar(r);
    o.renderOrder = 21;
    group.add(o);
    return o;
  }
  function clearPreview() { UI.disposeGroup(UI.groups.preview); }

  // ------------------------------------------------------------------ analysis display (Zebra Stripes, Draft Analysis)
  // One display analysis at a time, drawn over the body (the body mesh is pushed back by its polygon offset, so an
  // overlay with the same triangles and no offset wins the depth test). Rebuilt from App.mesh after every rebuild.
  var analysis = new THREE.Group();
  UI.scene.add(analysis);
  UI.groups.analysis = analysis;
  var display = { kind: null, build: null, mesh: null };
  function setDisplay(kind, build) {
    display.kind = kind; display.build = build; display.mesh = null;
    refreshDisplay();
  }
  function refreshDisplay() {
    UI.disposeGroup(analysis);
    display.mesh = App.mesh;
    if (!display.kind || !App.mesh || !App.mesh.triCount) { UI.render(); return; }
    try {
      var obj = display.build(App.mesh);
      if (obj) {
        // hidden bodies stay hidden: draw only the visible triangles
        if (App.triHidden) {
          var th = App.triHidden, idx = [];
          for (var t = 0; t < App.mesh.triCount; t++) if (!th[t]) idx.push(t * 3, t * 3 + 1, t * 3 + 2);
          obj.geometry.setIndex(idx);
        }
        var sec = App.view.section ? [App.view.section.plane] : [];
        obj.material.clippingPlanes = sec;
        obj.material.clipping = true;
        obj.renderOrder = 1;
        analysis.add(obj);
      }
    } catch (e) { UI.setStatus((display.kind === 'zebra' ? 'Zebra Stripes' : 'Draft Analysis') + ': ' + (e.message || e)); }
    UI.render();
  }
  // after every rebuild (UI.refreshStatus runs at the end of applyBuild) and when bodies are hidden / shown
  var baseRefreshStatus = UI.refreshStatus;
  UI.refreshStatus = function () {
    var r = baseRefreshStatus.apply(this, arguments);
    if (display.kind && display.mesh !== App.mesh) refreshDisplay();
    return r;
  };
  var baseSetBodyHidden = UI.setBodyHidden;
  UI.setBodyHidden = function () { var r = baseSetBodyHidden.apply(this, arguments); if (display.kind) refreshDisplay(); return r; };

  // ------------------------------------------------------------------ Zebra Stripes
  // Stripes reflected in the surface (view-fixed, like SolidWorks): the reflection of the view direction about the
  // smoothed normal (Evaluate.smoothNormals: facets of a curved face blend, real edges stay sharp) indexes a band of
  // black and white stripes. Continuous stripes across an edge mean tangent (or better) continuity; a jump shows a
  // crease. Controls: number of stripes (size), direction (horizontal / vertical / diagonal), sharpness.
  var zebra = { on: false, stripes: 16, direction: 'horizontal', sharpness: 0.85, material: null, normals: null, normalsMesh: null };
  var ZEBRA_VS = [
    '#include <common>', '#include <clipping_planes_pars_vertex>',
    'varying vec3 vN;',
    'void main() {',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <clipping_planes_vertex>',
    '}'].join('\n');
  var ZEBRA_FS = [
    '#include <common>', '#include <clipping_planes_pars_fragment>',
    'uniform float stripes; uniform vec3 axis; uniform float sharpness; uniform vec3 dark; uniform vec3 light;',
    'varying vec3 vN;',
    'void main() {',
    '  #include <clipping_planes_fragment>',
    '  vec3 n = normalize(vN);',
    '  if (!gl_FrontFacing) n = -n;',
    '  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);',
    '  float t = asin(clamp(dot(r, axis), -1.0, 1.0)) / PI * stripes;',
    '  float s = 0.5 + 0.5 * cos(2.0 * PI * t);',
    '  float w = max(0.01, (1.0 - sharpness) * 0.5);',
    '  float k = smoothstep(0.5 - w, 0.5 + w, s);',
    '  gl_FragColor = vec4(mix(dark, light, k), 1.0);',
    '}'].join('\n');
  var ZEBRA_AXES = { horizontal: [0, 1, 0], vertical: [1, 0, 0], diagonal: [Math.SQRT1_2, Math.SQRT1_2, 0] };
  function zebraMaterial() {
    if (!zebra.material) {
      zebra.material = new THREE.ShaderMaterial({
        uniforms: { stripes: { value: zebra.stripes }, axis: { value: new THREE.Vector3(0, 1, 0) }, sharpness: { value: zebra.sharpness }, dark: { value: new THREE.Color(0x111111) }, light: { value: new THREE.Color(0xf4f4f4) } },
        vertexShader: ZEBRA_VS, fragmentShader: ZEBRA_FS, side: THREE.DoubleSide, clipping: true
      });
    }
    var a = ZEBRA_AXES[zebra.direction] || ZEBRA_AXES.horizontal, u = zebra.material.uniforms;
    u.stripes.value = Math.max(1, +zebra.stripes || 16);
    u.axis.value.set(a[0], a[1], a[2]);
    u.sharpness.value = Math.max(0, Math.min(1, +zebra.sharpness));
    return zebra.material;
  }
  function zebraNormals(mesh) {
    if (zebra.normalsMesh !== mesh) { zebra.normals = E.smoothNormals(mesh); zebra.normalsMesh = mesh; }
    return zebra.normals;
  }
  function buildZebra(mesh) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(zebraNormals(mesh), 3));
    return new THREE.Mesh(g, zebraMaterial());
  }
  function zebraOn(opts) {
    opts = opts || {};
    ['stripes', 'direction', 'sharpness'].forEach(function (k) { if (opts[k] != null) zebra[k] = opts[k]; });
    zebra.on = true;
    if (display.kind === 'draft') closeDraft();
    setDisplay('zebra', buildZebra);
    UI.refreshRibbon();
    return zebraState();
  }
  function zebraOff() {
    zebra.on = false;
    if (display.kind === 'zebra') setDisplay(null, null);
    UI.refreshRibbon();
    return zebraState();
  }
  function zebraUpdate() { if (zebra.on) { zebraMaterial(); UI.render(); } }
  function zebraState() { return { on: zebra.on, stripes: zebra.stripes, direction: zebra.direction, sharpness: zebra.sharpness, drawn: display.kind === 'zebra' && analysis.children.length > 0 }; }
  // Ribbon: Zebra Stripes turns them on and opens its PropertyManager (OK keeps them on, Cancel turns them off);
  // clicking it again while they are on turns them off, like the SolidWorks toggle.
  function cmdZebra() {
    if (zebra.on && !pmIs('Zebra Stripes')) { zebraOff(); UI.setStatus('Zebra Stripes off.'); return; }
    var wasOn = zebra.on;
    var v = { stripes: zebra.stripes, direction: zebra.direction, sharpness: zebra.sharpness };
    zebraOn(v);
    UI.openPM({
      title: 'Zebra Stripes', icon: 'zebra', values: v, messageOk: true,
      message: 'Stripes reflected in the surface. Smooth stripes across an edge mean the faces are tangent; a jump or kink shows a crease. Rotate the view to move them.',
      groups: [{ title: 'Settings', fields: [
        { type: 'number', label: 'Number of stripes', key: 'stripes', min: 1, step: 1 },
        { type: 'select', label: 'Direction', key: 'direction', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['diagonal', 'Diagonal']] },
        { type: 'number', label: 'Sharpness (0–1)', key: 'sharpness', min: 0, step: 0.05 }
      ] }],
      onChange: function (val) {
        zebra.stripes = Math.max(1, Math.round(+val.stripes || 1)); zebra.direction = val.direction; zebra.sharpness = +val.sharpness;
        zebraUpdate();
      },
      onOK: function () { UI.setStatus('Zebra Stripes on (' + zebra.stripes + ' ' + zebra.direction + '). Click Zebra Stripes again to turn them off.'); },
      onCancel: function () { if (!wasOn) zebraOff(); }
    });
    UI.setStatus('Zebra Stripes on.');
  }

  // ------------------------------------------------------------------ Draft Analysis
  var DRAFT_DIRS = [['+z', 'Front Plane normal (+Z)'], ['-z', 'Front Plane reversed (−Z)'], ['+y', 'Top Plane normal (+Y)'], ['-y', 'Top Plane reversed (−Y)'],
    ['+x', 'Right Plane normal (+X)'], ['-x', 'Right Plane reversed (−X)'], ['face', 'Selected face normal']];
  var DIR_VEC = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
  var draft = { result: null, values: null, faceNormal: null };
  var CLASS_LABEL = { positive: 'Positive draft', requires: 'Requires draft', negative: 'Negative draft', straddle: 'Straddle faces' };
  function draftPull(v) {
    var d = v.direction === 'face' ? draft.faceNormal : DIR_VEC[v.direction];
    if (!d) return null;
    return v.reverse ? d.map(function (x) { return -x; }) : d.slice();
  }
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function buildDraft(mesh) {
    var v = draft.values, pull = draftPull(v);
    if (!pull) { draft.result = null; return null; }
    draft.result = E.draftAnalysis(mesh, pull, +v.angle, { edges: mesh === App.mesh && App.edges ? App.edges : null });
    if (!v.straddle) draft.result.faces.forEach(function (f) { if (f.cls === 'straddle') f.cls = f.angle >= +v.angle ? 'positive' : f.angle <= -v.angle ? 'negative' : 'requires'; });
    var col = new Float32Array(mesh.triCount * 9);
    draft.result.faces.forEach(function (f) {
      var fc = mesh.faces[f.index], c = hexToRgb(E.DRAFT_COLORS[f.cls]);
      for (var o = fc.start * 9; o < (fc.start + fc.count) * 9; o += 3) { col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }
  function draftCounts() {
    var r = draft.result;
    if (!r) return { positive: 0, requires: 0, negative: 0, straddle: 0 };
    var c = { positive: 0, requires: 0, negative: 0, straddle: 0 };
    // surfaces (tangent facets joined) are what a SolidWorks user calls faces
    var seen = {};
    r.faces.forEach(function (f) { var k = f.surface + ':' + f.cls; if (!seen[k]) { seen[k] = true; c[f.cls]++; } });
    return c;
  }
  function draftHtml() {
    var r = draft.result;
    if (!r) return '<span class="static">Pick a pull direction: a direction above, or a planar face in the graphics area.</span>';
    var c = draftCounts(), u = draft.values;
    return '<div class="ev-legend">' + ['positive', 'requires', 'negative', 'straddle'].filter(function (k) { return k !== 'straddle' || u.straddle; }).map(function (k) {
      return '<div class="ev-leg" data-cls="' + k + '"><span class="sw" style="background:' + E.DRAFT_COLORS[k] + '"></span><span>' + CLASS_LABEL[k] + '</span><b>' + c[k] + '</b></div>';
    }).join('') + '</div><div class="ev-note">Pull ' + fmtV(r.pull, 3) + ', draft ' + fmt(r.draft, 2) + '°. Hover a face for its angle in the status bar.</div>';
  }
  function draftApply() {
    setDisplay('draft', buildDraft);
    rerender();
    var c = draftCounts();
    UI.setStatus(draft.result ? 'Draft Analysis: ' + c.positive + ' positive, ' + c.requires + ' requires draft, ' + c.negative + ' negative' + (draft.values.straddle ? ', ' + c.straddle + ' straddle' : '') + '.' : 'Draft Analysis: pick a pull direction.');
  }
  function closeDraft() { if (display.kind === 'draft') setDisplay(null, null); draft.result = null; }
  function cmdDraftAnalysis() {
    if (!App.mesh || !App.mesh.triCount) { UI.toast('Build a solid first.'); return; }
    if (zebra.on) zebraOff();
    var sf = App.sel && App.sel.kind === 'face' && App.mesh.faces[App.sel.index] ? App.mesh.faces[App.sel.index] : null;
    draft.faceNormal = sf ? sf.normal.slice() : null;
    var v = draft.values = { direction: sf ? 'face' : '+y', angle: 1, reverse: false, straddle: true };
    UI.openPM({
      title: 'Draft Analysis', icon: 'draftAnalysis', values: v,
      message: 'Faces are coloured by their draft relative to the direction of pull. Click a planar face to use its normal as the direction of pull.',
      command: {
        onPick: function (pk) {
          if (!pk || pk.kind !== 'face' || !App.mesh.faces[pk.index]) return false;
          draft.faceNormal = App.mesh.faces[pk.index].normal.slice(); v.direction = 'face';
          draftApply();
          return true;
        }
      },
      groups: [
        { title: 'Analysis Parameters', fields: [
          { type: 'select', label: 'Direction of Pull', key: 'direction', options: DRAFT_DIRS },
          { type: 'check', label: 'Reverse direction', key: 'reverse' },
          { type: 'number', label: 'Draft angle', key: 'angle', unit: '°', min: 0, step: 0.5 },
          { type: 'check', label: 'Find steep faces / straddle faces', key: 'straddle' }
        ] },
        { title: 'Color Settings', fields: [{ type: 'html', html: draftHtml }] }
      ],
      onChange: function () { draftApply(); },
      onClose: function () { closeDraft(); },
      onOK: function () { }
    });
    draftApply();
  }
  // face -> 'Face 12: draft 5.00° (Positive draft)' for the status bar while the PM is open
  function draftFaceInfo(i) {
    var r = draft.result, f = r && r.faces[i];
    return f ? { face: i, angle: f.angle, cls: f.cls, label: 'Face ' + i + ': draft ' + fmt(f.angle, 2) + '° (' + CLASS_LABEL[f.cls] + ')' } : null;
  }

  // ------------------------------------------------------------------ Check
  var CHECK_COLORS = { open: 0xe0292b, nonManifold: 0xc026d3, zeroArea: 0xf59e0b, selfIntersection: 0xff5a1f };
  var chk = { res: null, active: -1 };
  function drawCheckItems() {
    clearPreview();
    if (!chk.res) return;
    var r = modelSize() * 0.006, list = chk.active >= 0 ? [chk.res.items[chk.active]] : chk.res.items;
    list.forEach(function (it) {
      var c = CHECK_COLORS[it.kind];
      addLines(UI.groups.preview, it.lines, c);
      if (it.tris.length) addTris(UI.groups.preview, it.tris, c, 0.45);
      it.points.forEach(function (p) { addPoint(UI.groups.preview, p, c, r); });
      // an item too small to see gets a marker at its first point
      if (!it.points.length && it.lines.length) addPoint(UI.groups.preview, it.lines[0][0], c, r * 0.8);
    });
    UI.render();
  }
  function checkHtml() {
    var res = chk.res;
    if (!res) return '';
    var c = res.counts, rows = [['Open edges', c.open], ['Non-manifold edges', c.nonManifold], ['Zero-area faces', c.zeroArea], ['Self-intersections', c.selfIntersection]];
    var sum = '<div class="ev-kv">' + rows.map(function (r) { return '<span class="static">' + r[0] + '</span><span class="' + (r[1] ? 'ev-bad' : 'ev-good') + '">' + r[1] + '</span>'; }).join('') + '</div>';
    var body = res.bodies.map(function (b) { return esc(b.name) + ': ' + b.triangles + ' triangles, ' + b.edges + ' edges, ' + b.vertices + ' vertices'; }).join('<br>');
    var items = res.items.slice(0, 250).map(function (it, i) {
      return '<div class="chk-row' + (i === chk.active ? ' selected' : '') + '" data-i="' + i + '"><span class="sw" style="background:#' + ('00000' + CHECK_COLORS[it.kind].toString(16)).slice(-6) + '"></span><span><b>' + esc(it.label) + '</b>' + (res.bodies.length > 1 ? '<br><small>' + esc(it.name) + '</small>' : '') + '</span></div>';
    }).join('');
    if (res.items.length > 250) items += '<div class="ev-note">… and ' + (res.items.length - 250) + ' more.</div>';
    return sum + '<div class="ev-note">' + body + '</div>' + (res.items.length ? '<div class="chk-list">' + items + '</div>' : '<div class="chk-none">No problems found</div>');
  }
  function runCheck() {
    var list = bodies(), t0 = performance.now();
    try { chk.res = E.check(list, bodyNames()); } catch (e) { chk.res = { bodies: [], items: [], counts: { open: 0, nonManifold: 0, zeroArea: 0, selfIntersection: 0 }, ok: false, error: e.message || String(e) }; }
    chk.res.ms = performance.now() - t0;
    chk.active = -1;
    return chk.res;
  }
  function checkMessage() {
    var r = chk.res, n = r.items.length;
    if (r.error) return 'Check failed: ' + esc(r.error);
    if (!r.bodies.length) return 'Nothing to check: the model has no solid body.';
    return n ? n + ' problem' + (n > 1 ? 's' : '') + ' found in ' + r.bodies.length + ' bod' + (r.bodies.length > 1 ? 'ies' : 'y') + '. Click a result to show it alone; click it again to show all.'
      : 'No problems: ' + r.bodies.length + ' bod' + (r.bodies.length > 1 ? 'ies are' : 'y is') + ' closed and manifold, with no zero-area faces and no self-intersections.';
  }
  function checkReport() {
    var spec = UI.pmSpec && UI.pmSpec();
    if (spec) { spec.message = checkMessage(); spec.messageOk = !!(chk.res.ok && chk.res.bodies.length); }
    rerender(); drawCheckItems();
    UI.setStatus('Check: ' + checkMessage().replace(/<[^>]+>/g, '') + ' (' + fmt(chk.res.ms, 0) + ' ms)');
  }
  function onCheckClick(e) {
    var row = e.target.closest && e.target.closest('.chk-row');
    if (!row) return;
    var i = +row.getAttribute('data-i');
    chk.active = chk.active === i ? -1 : i;
    rerender(); drawCheckItems();
    var it = chk.res.items[i];
    if (chk.active >= 0 && it) UI.setStatus(it.label + (chk.res.bodies.length > 1 ? ' (' + it.name + ')' : '') + ' at ' + fmtV((it.points[0] || it.lines[0][0]), 3));
  }
  function cmdCheck() {
    if (!App.build) return;
    runCheck();
    var pmRoot = UI.$('pm');
    UI.openPM({
      title: 'Check', icon: 'check', values: {}, message: checkMessage(), messageOk: !!(chk.res.ok && chk.res.bodies.length),
      groups: [
        { title: 'Check', fields: [
          { type: 'static', label: 'Scope', value: bodies().length > 1 ? 'All ' + bodies().length + (isAsm() ? ' components' : ' bodies') : 'Whole part' },
          { type: 'buttons', buttons: [{ label: 'Check', onclick: function () { runCheck(); checkReport(); } }] }
        ] },
        { title: 'Results', fields: [{ type: 'html', html: checkHtml }] }
      ],
      onClose: function () { pmRoot.removeEventListener('click', onCheckClick); chk.active = -1; },
      onOK: function () { }
    });
    pmRoot.addEventListener('click', onCheckClick);
    checkReport();
  }

  // ------------------------------------------------------------------ Section Properties
  var sect = { res: null, error: null };
  function sectionSource() {
    if (App.mode === 'sketch' && UI.activeSketchFeature && UI.activeSketchFeature()) return { sketch: UI.activeSketchFeature() };
    if (App.sel && App.sel.kind === 'face' && App.mesh && App.mesh.faces[App.sel.index]) return { face: App.sel.index };
    if (App.sel && App.sel.kind === 'feature') {
      var f = K.findFeature(App.model, App.sel.id);
      if (f && f.type === 'sketch') return { sketch: f };
    }
    return null;
  }
  function computeSection() {
    sect.res = null; sect.error = null;
    var src = sectionSource();
    if (!src) { sect.error = 'Select a planar face, or a sketch in the FeatureManager.'; return null; }
    try {
      if (src.sketch) { sect.res = E.sectionOfSketch(src.sketch, App.model, App.build && App.build.planes); sect.res.name = src.sketch.name; }
      else { sect.res = E.sectionOfFace(App.mesh, src.face); sect.res.name = 'Face ' + src.face; }
    } catch (e) { sect.error = e.message || String(e); }
    return sect.res;
  }
  function drawSection() {
    clearPreview();
    var r = sect.res;
    if (!r || !r.centroid) { UI.render(); return; }
    var L = Math.sqrt(Math.abs(r.area)) * 0.6, c = r.centroid;
    addPoint(UI.groups.preview, c, 0xd9302c, modelSize() * 0.006);
    addLines(UI.groups.preview, [[V3sub(c, r.axis1World, L), V3add(c, r.axis1World, L)]], 0xd9302c);
    addLines(UI.groups.preview, [[V3sub(c, r.axis2World, L * 0.7), V3add(c, r.axis2World, L * 0.7)]], 0x2d7dd2);
    UI.render();
  }
  function V3add(c, d, s) { return [c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s]; }
  function V3sub(c, d, s) { return V3add(c, d, -s); }
  function sectionHtml() {
    if (!sect.res) return '<span class="static">' + esc(sect.error || 'Nothing selected.') + '</span>';
    var r = sect.res, u = UI.unitLabel(), u2 = u + '²', u4 = u + '<sup>4</sup>', fr = r.frame;
    return kv([
      ['Section', esc(r.name) + (r.source === 'sketch' ? ' (' + r.loops + ' contour' + (r.loops === 1 ? '' : 's') + ')' : '')],
      ['Area', fmt(r.area, 4) + ' ' + u2],
      ['Perimeter', r.perimeter == null ? '-' : fmt(r.perimeter, 4) + ' ' + u],
      ['Centroid', fmtV(r.centroid, 4) + ' ' + u],
      ['Section x / y', '(' + fmtV(fr.x, 3) + ') / (' + fmtV(fr.y, 3) + ')'],
      ['Normal', fmtV(fr.n, 3)]
    ]) + '<div class="ev-sub">Moments of area at the centroid, section x / y axes</div>' + kv([
      ['Ixx', fmt(r.Ixx, 4) + ' ' + u4], ['Iyy', fmt(r.Iyy, 4) + ' ' + u4], ['Ixy', fmt(r.Ixy, 4) + ' ' + u4], ['Polar J', fmt(r.J, 4) + ' ' + u4]
    ]) + '<div class="ev-sub">Principal axes and moments at the centroid</div>' + kv([
      ['I1 (max)', fmt(r.I1, 4) + ' ' + u4 + ' about (' + fmtV(r.axis1World, 4) + ')'],
      ['I2 (min)', fmt(r.I2, 4) + ' ' + u4 + ' about (' + fmtV(r.axis2World, 4) + ')'],
      ['Angle x → I1', fmt(r.angle, 3) + '°']
    ]) + '<div class="ev-sub">Moments of area at the section origin</div>' + kv([
      ['Lxx', fmt(r.origin.Ixx, 4) + ' ' + u4], ['Lyy', fmt(r.origin.Iyy, 4) + ' ' + u4], ['Lxy', fmt(r.origin.Ixy, 4) + ' ' + u4]
    ]);
  }
  function refreshSection() {
    computeSection();
    rerender(); drawSection();
    if (sect.res) UI.setStatus('Section Properties of ' + sect.res.name + ': area ' + fmt(sect.res.area, 3) + ' ' + UI.unitLabel() + '², Ixx ' + fmt(sect.res.Ixx, 3) + ', Iyy ' + fmt(sect.res.Iyy, 3));
  }
  function cmdSectionProperties() {
    computeSection();
    UI.openPM({
      title: 'Section Properties', icon: 'sectionProps', values: {},
      message: 'Select a planar face, or a sketch in the FeatureManager (or run it while editing a sketch). The results follow the selection.',
      groups: [{ title: 'Results', fields: [{ type: 'html', html: sectionHtml }] }],
      onOK: function () { }
    });
    drawSection();
  }

  // ------------------------------------------------------------------ selection lists (Clearance, Interference)
  // the PM keeps its own list of body indices; clicking a body in the graphics area adds or removes it
  function toggleIn(list, i) { var k = list.indexOf(i); if (k >= 0) list.splice(k, 1); else list.push(i); return list; }
  function listText(sel, names, what) {
    return sel.length ? sel.map(function (i) { return names[i]; }).join(', ') : '';
  }

  // ------------------------------------------------------------------ Clearance Verification
  var clr = { res: null, active: -1, sel: [], v: null };
  function clearanceHtml() {
    var r = clr.res, u = UI.unitLabel();
    if (!r) return '';
    if (!r.results.length) return '<div class="chk-none">Nothing to compare: select two or more ' + (isAsm() ? 'components' : 'bodies') + '.</div>';
    return '<div class="clr-list">' + r.results.map(function (x, i) {
      var tag = x.interfering ? 'interferes' : x.ok ? 'ok' : 'below minimum';
      return '<div class="clr-row' + (x.ok ? '' : ' bad') + (i === clr.active ? ' selected' : '') + '" data-i="' + i + '">' + UI.Icons_('clearance') + '<span><b>Clearance' + (i + 1) + '</b> — ' + fmt(x.distance, 3) + ' ' + u +
        ' <small>(' + tag + ')</small><br><small>' + esc(x.aName) + ' · ' + esc(x.bName) + '</small></span></div>';
    }).join('') + '</div>';
  }
  function drawClearance() {
    clearPreview();
    if (!clr.res) return;
    var r = modelSize() * 0.006;
    clr.res.results.forEach(function (x, i) {
      if (clr.active >= 0 && i !== clr.active) return;
      if (!x.pa) return;
      var c = x.ok ? 0x2d7dd2 : 0xd9302c;
      addPoint(UI.groups.preview, x.pa, c, r); addPoint(UI.groups.preview, x.pb, c, r);
      addLines(UI.groups.preview, [[x.pa, x.pb]], c);
    });
    if (App.command) {
      App.command.faceList = App.mesh ? App.mesh.faces.map(function (f, i) { return clr.sel.indexOf(f.body || 0) >= 0 ? i : -1; }).filter(function (i) { return i >= 0; }) : [];
      UI.updateHighlights();
    }
    UI.render();
  }
  function clearanceMessage() {
    var r = clr.res, u = UI.unitLabel();
    if (!r) return '';
    if (!r.results.length) return 'Select two or more ' + (isAsm() ? 'components' : 'bodies') + ', or one to check against all the others.';
    return r.failed ? r.failed + ' of ' + r.checked + ' clearance' + (r.checked > 1 ? 's are' : ' is') + ' below ' + fmt(r.minClearance, 3) + ' ' + u + '; minimum ' + fmt(r.minimum, 3) + ' ' + u + '.'
      : 'All ' + r.checked + ' clearance' + (r.checked > 1 ? 's are' : ' is') + ' at least ' + fmt(r.minClearance, 3) + ' ' + u + '; minimum ' + fmt(r.minimum, 3) + ' ' + u + '.';
  }
  function calcClearance() {
    var t0 = performance.now();
    clr.res = E.clearance(bodies(), bodyNames(), clr.sel, +clr.v.min, { withRest: !!clr.v.rest && clr.sel.length > 0 });
    clr.active = -1;
    var spec = UI.pmSpec && UI.pmSpec();
    if (spec) { spec.message = clearanceMessage(); spec.messageOk = !!(clr.res.results.length && !clr.res.failed); }
    rerender(); drawClearance();
    UI.setStatus('Clearance Verification: ' + clearanceMessage() + ' (' + fmt(performance.now() - t0, 0) + ' ms)');
    return clr.res;
  }
  function onClearanceClick(e) {
    var row = e.target.closest && e.target.closest('.clr-row');
    if (!row) return;
    var i = +row.getAttribute('data-i');
    clr.active = clr.active === i ? -1 : i;
    rerender(); drawClearance();
  }
  function cmdClearance() {
    var list = bodies();
    if (list.length < 2) { UI.toast('Clearance Verification needs two or more ' + (isAsm() ? 'components' : 'bodies') + '.'); return; }
    clr.sel = selectedBodies(); clr.res = null; clr.active = -1;
    var v = clr.v = { min: 1, rest: false }, names = bodyNames(), pmRoot = UI.$('pm');
    UI.openPM({
      title: 'Clearance Verification', icon: 'clearance', values: v, message: 'Calculating…',
      command: {
        faceList: [],
        onPick: function (pk) {
          if (!pk || pk.kind !== 'face' || !App.mesh.faces[pk.index]) return false;
          toggleIn(clr.sel, App.mesh.faces[pk.index].body || 0);
          calcClearance();
          return true;
        }
      },
      groups: [
        { title: 'Selected ' + (isAsm() ? 'Components' : 'Bodies'), fields: [
          { type: 'pick', icon: isAsm() ? 'component' : 'body', value: function () { return listText(clr.sel, names); }, placeholder: 'All ' + (isAsm() ? 'components' : 'bodies') + ' (click to select)…' },
          { type: 'check', label: 'Selected items and the rest', key: 'rest' },
          { type: 'number', label: 'Minimum acceptable clearance', key: 'min', unit: 'u', min: 0 },
          { type: 'buttons', buttons: [{ label: 'Calculate', onclick: function () { calcClearance(); } }, { label: 'Clear selections', onclick: function () { clr.sel = []; calcClearance(); } }] }
        ] },
        { title: 'Results', fields: [{ type: 'html', html: clearanceHtml }] }
      ],
      onChange: function (val, key) { if (key === 'rest' || key === 'min') calcClearance(); },
      onClose: function () { pmRoot.removeEventListener('click', onClearanceClick); clrSession = null; },
      onOK: function () { }
    });
    pmRoot.addEventListener('click', onClearanceClick);
    clrSession = { calculate: calcClearance, results: function () { return clr.res; }, select: function (idx) { clr.sel = idx.slice(); return calcClearance(); }, show: function (i) { clr.active = i; rerender(); drawClearance(); } };
    calcClearance();
  }
  var clrSession = null;

  // ------------------------------------------------------------------ Interference Detection (selected components)
  // Replaces the assembly command from ui-commands.js with the same results list (Interference1 — volume, the two
  // component names; red common volumes; click a result for that pair alone) plus a Selected Components box: with
  // nothing selected the entire assembly is checked; with components selected (in the graphics area or the tree before
  // the command, or by clicking them while it is open) only the pairs among them — or, with "Selected items and the
  // rest", between them and every other component. Evaluate.interference does the CSG.intersect volumes.
  var intf = { res: null, active: -1, sel: [], v: null };
  var intfMat = null;
  function interferenceMaterial() {
    if (!intfMat) intfMat = new THREE.MeshBasicMaterial({ color: 0xe0553c, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    return intfMat;
  }
  function intfShown() { return !intf.res ? [] : intf.active >= 0 ? [intf.res.pairs[intf.active]] : intf.res.pairs; }
  function intfHighlight() {
    clearPreview();
    var comps = {};
    intfShown().forEach(function (p) {
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
    UI.render();
  }
  function intfRows() {
    var res = intf.res, u = UI.unitLabel();
    if (!res) return '';
    if (!res.pairs.length) return '<div class="intf-none">No Interferences</div>';
    return res.pairs.map(function (p, i) {
      return '<div class="intf-row' + (i === intf.active ? ' selected' : '') + '" data-i="' + i + '">' + UI.Icons_('interference') + '<span><b>Interference' + (i + 1) + '</b> — ' +
        fmt(p.volume, 3) + ' ' + u + '³<br><small>' + esc(p.aName) + ' · ' + esc(p.bName) + '</small></span></div>';
    }).join('');
  }
  function intfReport() {
    var spec = UI.pmSpec && UI.pmSpec(), res = intf.res, n = res.pairs.length, u = UI.unitLabel();
    var scope = intf.sel.length ? ' among ' + intf.sel.length + ' selected component' + (intf.sel.length > 1 ? 's' : '') + (intf.v.rest ? ' and the rest' : '') : '';
    var msg = res.error ? 'Interference Detection failed: ' + res.error
      : n ? n + ' interference' + (n > 1 ? 's' : '') + ', ' + fmt(res.volume, 3) + ' ' + u + '³ in all (' + res.checked + ' pair' + (res.checked === 1 ? '' : 's') + ' checked' + scope + ').'
        : 'No interferences: no two ' + (intf.sel.length ? 'selected ' : '') + 'components overlap (touching faces are not interferences).';
    if (spec) { spec.message = msg; spec.messageOk = !n && !res.error; }
    rerender(); intfHighlight();
    UI.setStatus(msg);
  }
  function intfCalculate() {
    try {
      intf.res = E.interference(bodies(), bodyNames(), intf.sel, { withRest: !!(intf.v && intf.v.rest) && intf.sel.length > 0 });
      // the ids as Assembly.interference reports them
      intf.res.pairs.forEach(function (p) { var cs = App.model.components || []; p.a = cs[p.aIndex] ? cs[p.aIndex].id : p.aIndex; p.b = cs[p.bIndex] ? cs[p.bIndex].id : p.bIndex; });
    } catch (e) { intf.res = { pairs: [], volume: 0, checked: 0, error: e.message || String(e) }; }
    intf.active = -1;
    intfReport();
    return intf.res;
  }
  function onIntfClick(e) {
    var row = e.target.closest && e.target.closest('.intf-row');
    if (!row) return;
    var i = +row.getAttribute('data-i');
    intf.active = intf.active === i ? -1 : i;
    rerender(); intfHighlight();
  }
  var intfSession = null;
  function cmdInterference() {
    if (typeof Assembly === 'undefined') { UI.toast('Assemblies need assembly.js, which did not load.'); return; }
    if (!isAsm()) { UI.toast('Open an assembly first (File ▸ New ▸ Assembly).'); return; }
    intf.sel = selectedBodies(); intf.res = null; intf.active = -1;
    var v = intf.v = { rest: false }, names = bodyNames(), n = names.length, pmRoot = UI.$('pm');
    UI.openPM({
      title: 'Interference Detection', icon: 'interference', values: v, message: 'Calculating…',
      command: {
        faceList: [],
        onPick: function (pk) {
          if (!pk || pk.kind !== 'face' || !App.mesh.faces[pk.index]) return false;
          toggleIn(intf.sel, App.mesh.faces[pk.index].body || 0);
          intfCalculate();
          return true;
        }
      },
      groups: [
        { title: 'Selected Components', fields: [
          { type: 'pick', icon: 'component', value: function () { return listText(intf.sel, names); }, placeholder: 'Entire assembly (' + n + ' component' + (n === 1 ? '' : 's') + ') — click components to limit' },
          { type: 'check', label: 'Selected items and the rest', key: 'rest' },
          { type: 'buttons', buttons: [{ label: 'Calculate', onclick: function () { intfCalculate(); } }, { label: 'Entire assembly', onclick: function () { intf.sel = []; intfCalculate(); } }] }
        ] },
        { title: 'Results', fields: [{ type: 'html', html: function () { return '<div class="intf-list">' + intfRows() + '</div>'; } }] }
      ],
      onChange: function (val, key) { if (key === 'rest') intfCalculate(); },
      onClose: function () { pmRoot.removeEventListener('click', onIntfClick); intfSession = null; },
      onOK: function () { }
    });
    pmRoot.addEventListener('click', onIntfClick);
    intfSession = {
      calculate: intfCalculate, results: function () { return intf.res; },
      select: function (i) { intf.active = i; rerender(); intfHighlight(); },
      setSelected: function (idx) { intf.sel = idx.slice(); return intfCalculate(); }, selected: function () { return intf.sel.slice(); }
    };
    intfCalculate();
  }

  // ------------------------------------------------------------------ selection changes and hover
  var baseSel = UI.onSelectionChanged;
  UI.onSelectionChanged = function () {
    if (baseSel) baseSel.apply(this, arguments);
    if (pmIs('Section Properties')) refreshSection();
  };

  // Draft Analysis: the face under the cursor reports its draft angle in the status bar
  var hoverQueued = false;
  UI.viewport.addEventListener('mousemove', function (ev) {
    if (display.kind !== 'draft' || !draft.result || hoverQueued || ev.buttons) return;
    hoverQueued = true;
    var r = UI.viewport.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    requestAnimationFrame(function () {
      hoverQueued = false;
      if (display.kind !== 'draft') return;
      var pk = UI.pickFace(mx, my), info = pk && draftFaceInfo(pk.index);
      if (info) UI.setStatus(info.label);
    });
  });

  // ------------------------------------------------------------------ window.anvil automation
  // Body / component arguments are body indices (numbers) or names ('Body2', 'Pin<1>').
  function bodyIndex(x) {
    if (typeof x === 'number') return x >= 0 && x < bodies().length ? x : -1;
    var names = bodyNames();
    for (var i = 0; i < names.length; i++) if (names[i] === x) return i;
    if (isAsm() && UI.componentIndex) { var k = UI.componentIndex(x); if (k >= 0) return k; }
    return -1;
  }
  function plainSection(r) {
    if (!r) return null;
    var o = {};
    ['name', 'source', 'area', 'perimeter', 'centroid', 'centroid2', 'Ixx', 'Iyy', 'Ixy', 'J', 'I1', 'I2', 'angle', 'axis1World', 'axis2World', 'normal', 'origin'].forEach(function (k) { if (r[k] != null) o[k] = r[k]; });
    return o;
  }
  if (window.anvil) {
    // check() -> { ok, counts: { open, nonManifold, zeroArea, selfIntersection }, bodies: [{ name, triangles, edges, ok }] }
    window.anvil.check = function () {
      var r = runCheck();
      return { ok: r.ok, counts: r.counts, bodies: r.bodies.map(function (b) { return { name: b.name, triangles: b.triangles, edges: b.edges, vertices: b.vertices, ok: b.ok }; }) };
    };
    // sectionProperties(faceIndex | sketch name or id) -> { area, centroid, Ixx, Iyy, Ixy, J, I1, I2, angle, … }
    window.anvil.sectionProperties = function (target) {
      if (typeof target === 'number' && App.mesh && App.mesh.faces[target]) { var rf = E.sectionOfFace(App.mesh, target); rf.name = 'Face ' + target; return plainSection(rf); }
      var sk = (App.model.features || []).filter(function (f) { return f.type === 'sketch' && (f.name === target || f.id === target); })[0];
      if (!sk) throw new Error('No face or sketch ' + target);
      var r = E.sectionOfSketch(sk, App.model, App.build && App.build.planes); r.name = sk.name;
      return plainSection(r);
    };
    // draftAnalysis([x, y, z] pull, draftDeg) -> { counts (surfaces), faceCounts, faces: [{ index, angle, cls }] }
    window.anvil.draftAnalysis = function (pull, deg) {
      var r = E.draftAnalysis(App.mesh, pull, deg == null ? 1 : deg, { edges: App.edges });
      return { counts: r.counts, faceCounts: r.faceCounts, faces: r.faces.map(function (f) { return { index: f.index, angle: f.angle, cls: f.cls }; }) };
    };
    // clearance([a, b, …] | [], minClearance) -> { minimum, failed, results: [{ a, b, distance, pa, pb, interfering, ok }] }
    window.anvil.clearance = function (items, min) {
      var sel = (items || []).map(bodyIndex);
      if (sel.some(function (i) { return i < 0; })) throw new Error('Unknown body or component in ' + JSON.stringify(items));
      var r = E.clearance(bodies(), bodyNames(), sel, min || 0);
      return { minimum: r.minimum, failed: r.failed, checked: r.checked, results: r.results.map(function (x) { return { a: x.aName, b: x.bName, distance: x.distance, pa: x.pa, pb: x.pb, interfering: x.interfering, ok: x.ok }; }) };
    };
    // interferenceOf([components…], withRest?) -> Interference Detection limited to those components
    window.anvil.interferenceOf = function (items, withRest) {
      var sel = (items || []).map(bodyIndex);
      if (sel.some(function (i) { return i < 0; })) throw new Error('Unknown component in ' + JSON.stringify(items));
      var r = E.interference(bodies(), bodyNames(), sel, { withRest: !!withRest });
      return { count: r.pairs.length, volume: r.volume, checked: r.checked, pairs: r.pairs.map(function (p) { return { a: p.aName, b: p.bName, volume: p.volume }; }) };
    };
    // zebra(true | false, { stripes, direction, sharpness }?) -> state
    window.anvil.zebra = function (on, opts) { return on === false ? zebraOff() : zebraOn(opts || {}); };
  }

  // ------------------------------------------------------------------ exports
  UI.Icons_ = function (name) { return Icons(name, 16); };
  UI.cmdCheck = cmdCheck; UI.cmdZebra = cmdZebra; UI.cmdSectionProperties = cmdSectionProperties;
  UI.cmdDraftAnalysis = cmdDraftAnalysis; UI.cmdClearance = cmdClearance; UI.cmdInterference = cmdInterference;
  UI.interferenceSession = function () { return intfSession; };
  UI.evaluate = {
    check: function () { var r = runCheck(); if (pmIs('Check')) checkReport(); return r; },
    checkResult: function () { return chk.res; },
    zebra: { on: zebraOn, off: zebraOff, state: zebraState, set: function (o) { ['stripes', 'direction', 'sharpness'].forEach(function (k) { if (o[k] != null) zebra[k] = o[k]; }); zebraUpdate(); return zebraState(); } },
    section: function () { computeSection(); if (pmIs('Section Properties')) { rerender(); drawSection(); } return sect.res; },
    sectionError: function () { return sect.error; },
    draft: function () { return draft.result; }, draftCounts: draftCounts, draftFace: draftFaceInfo,
    setDraft: function (o) { if (!draft.values) return null; Object.keys(o).forEach(function (k) { draft.values[k] = o[k]; }); draftApply(); return draft.result; },
    clearanceSession: function () { return clrSession; },
    display: function () { return display.kind; }
  };
})(UI);
