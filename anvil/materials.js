// Anvil materials and custom properties (global `Materials`, no DOM). Loaded after kernel.js and assembly.js.
//
// * A material library in SolidWorks' shape: classes (Steel, Stainless Steel, Aluminium Alloys, Copper Alloys,
//   Titanium Alloys, Plastics) of materials with mass density (kg/m³), yield and tensile strength and elastic
//   modulus (N/mm² = MPa), Poisson's ratio and an appearance colour.
// * A part's material: model.material (the library name). Applying one sets model.density and model.color, so every
//   consumer that already reads model.density (Kernel.massProps, Assembly.massProps, worker.js) keeps working.
//   Multi-body parts can give a body its own material: model.bodyMaterials = { "<id of the feature that created the
//   body>": "Brass" } (feature ids survive rebuilds; body indices do not).
// * Mass properties with per-body densities (massProps), mass in kg with the document units taken into account.
// * Custom properties (File ▸ Properties): model.properties = { custom: [{ name, type, value }], config: { "<configuration
//   name>": [{ name, type, value }] } }. A value may hold links in SolidWorks' form, "SW-Material", "SW-Mass",
//   "SW-Density", "SW-Volume", "SW-Surface Area", "SW-File Name", "SW-Configuration Name" (quotes included, an
//   optional @file suffix is ignored); evaluate() replaces them with the current values. Configuration Specific
//   properties override Custom ones of the same name for that configuration.
// * Script round trip without touching kernel.js: p.material(name), p.bodyMaterial(featureId, name) and
//   p.property(name, value, { type, config }) are added to the part Builder (a.property to the assembly Builder), and
//   generateScript is wrapped to write them (plus p.density / p.color when they are not a material's).
var Materials = (function () {
  'use strict';
  var K = typeof Kernel !== 'undefined' ? Kernel : null;

  // ------------------------------------------------------------------ library
  // density kg/m³; E, yield, tensile in N/mm² (MPa); nu Poisson's ratio. Values from common handbook / SolidWorks
  // library figures; plastics are typical unfilled grades.
  function M(name, density, E, nu, tensile, yieldS, color, extra) {
    var m = { name: name, density: density, E: E, nu: nu, tensile: tensile, yield: yieldS, color: color };
    Object.keys(extra || {}).forEach(function (k) { m[k] = extra[k]; });
    return m;
  }
  var CLASSES = [
    { name: 'Steel', materials: [
      M('Plain Carbon Steel', 7800, 210000, 0.28, 399.83, 220.59, '#8f959c', { metal: true }),
      M('AISI 1020', 7900, 200000, 0.29, 420.51, 351.57, '#8a9098', { metal: true }),
      M('AISI 1045 Steel, cold drawn', 7850, 205000, 0.29, 625, 530, '#878d95', { metal: true }),
      M('AISI 4130 Steel, normalized', 7850, 205000, 0.285, 731, 460, '#868c93', { metal: true }),
      M('AISI 1018 Steel, cold rolled', 7870, 205000, 0.29, 440, 370, '#8e949b', { metal: true }),   // rfHC: the shop's CRS sheet
      M('ASTM A36 Steel', 7850, 200000, 0.26, 400, 250, '#6e7276', { metal: true, finish: 'hotRolled' }),   // rfHC: hot rolled plate / HRPO
      M('Galvanized Steel', 7870, 200000, 0.29, 356.9, 203.94, '#b5bcc2', { metal: true })
    ] },
    { name: 'Stainless Steel', materials: [
      M('AISI 304', 8000, 190000, 0.29, 517.02, 206.81, '#c4c8cc', { metal: true }),
      M('AISI 316', 8000, 193000, 0.3, 515, 205, '#c1c6cb', { metal: true }),
      M('17-4 PH (H1150)', 7810, 197000, 0.27, 931, 724, '#b9bec3', { metal: true })
    ] },
    { name: 'Aluminium Alloys', materials: [
      M('1060 Alloy', 2700, 69000, 0.33, 68.94, 27.57, '#d3d6da', { metal: true }),
      M('5052-H32', 2680, 70300, 0.33, 228, 193, '#cdd1d6', { metal: true }),
      M('6061-T6 (SS)', 2700, 69000, 0.33, 310, 275, '#c9ccd1', { metal: true }),
      M('7075-T6 (SN)', 2810, 72000, 0.33, 570, 505, '#c3c7cc', { metal: true })
    ] },
    { name: 'Copper Alloys', materials: [
      M('Brass', 8500, 100000, 0.33, 478.5, 239.4, '#c9a64a', { metal: true }),
      M('Copper', 8900, 110000, 0.37, 394.38, 258.6, '#b87333', { metal: true }),
      M('Aluminium Bronze', 7600, 110000, 0.3, 550, 275, '#b8923e', { metal: true })
    ] },
    { name: 'Titanium Alloys', materials: [
      M('Commercially Pure Titanium (Grade 2)', 4510, 105000, 0.37, 345, 275, '#9a9c9e', { metal: true }),
      M('Ti-6Al-4V', 4430, 113800, 0.342, 950, 880, '#8a8d91', { metal: true })
    ] },
    { name: 'Plastics', materials: [
      M('ABS', 1020, 2000, 0.394, 44, 40, '#e6e1d3'),
      M('PLA', 1240, 3500, 0.36, 65, 60, '#dfe6ea'),
      M('Nylon 6/6', 1140, 2830, 0.41, 82.7, 82.7, '#eee7d6'),
      M('Acetal (POM)', 1410, 2800, 0.35, 67, 65, '#f4f4f0'),
      M('Polycarbonate', 1200, 2400, 0.38, 65, 62, '#d5e3ee'),
      M('Acrylic (PMMA)', 1190, 3000, 0.35, 73, 70, '#e3eef3')
    ] }
  ];
  var ALL = [], BY_NAME = {};
  CLASSES.forEach(function (c) { c.materials.forEach(function (m) { m.category = c.name; ALL.push(m); BY_NAME[m.name.toLowerCase()] = m; }); });
  // short names and the names the task pane used before this library existed
  var ALIASES = {
    'steel': 'Plain Carbon Steel', 'steel, plain carbon': 'Plain Carbon Steel', 'mild steel': 'Plain Carbon Steel', 'carbon steel': 'Plain Carbon Steel',
    'cold rolled': 'AISI 1018 Steel, cold rolled', 'cold rolled steel': 'AISI 1018 Steel, cold rolled', 'crs': 'AISI 1018 Steel, cold rolled', '1018': 'AISI 1018 Steel, cold rolled',
    'hot rolled': 'ASTM A36 Steel', 'hot rolled steel': 'ASTM A36 Steel', 'hrs': 'ASTM A36 Steel', 'hrpo': 'ASTM A36 Steel', 'a36': 'ASTM A36 Steel',
    'galvanized': 'Galvanized Steel', 'galvanised': 'Galvanized Steel',
    '1020': 'AISI 1020', '1045': 'AISI 1045 Steel, cold drawn', '4130': 'AISI 4130 Steel, normalized',
    'stainless': 'AISI 304', 'stainless steel': 'AISI 304', 'stainless 304': 'AISI 304', '304': 'AISI 304', 'ss304': 'AISI 304',
    'stainless 316': 'AISI 316', '316': 'AISI 316', '17-4': '17-4 PH (H1150)', '17-4ph': '17-4 PH (H1150)',
    'aluminum': '6061-T6 (SS)', 'aluminium': '6061-T6 (SS)', 'aluminum 6061': '6061-T6 (SS)', 'aluminium 6061': '6061-T6 (SS)', '6061': '6061-T6 (SS)', '6061-t6': '6061-T6 (SS)',
    'aluminum 5052': '5052-H32', 'aluminium 5052': '5052-H32', '5052': '5052-H32', '7075': '7075-T6 (SN)', '7075-t6': '7075-T6 (SN)', '1060': '1060 Alloy',
    'bronze': 'Aluminium Bronze', 'titanium': 'Ti-6Al-4V', 'titanium ti-6al-4v': 'Ti-6Al-4V', 'ti64': 'Ti-6Al-4V', 'titanium grade 2': 'Commercially Pure Titanium (Grade 2)',
    'nylon': 'Nylon 6/6', 'pa66': 'Nylon 6/6', 'acetal': 'Acetal (POM)', 'pom': 'Acetal (POM)', 'delrin': 'Acetal (POM)',
    'pc': 'Polycarbonate', 'pmma': 'Acrylic (PMMA)', 'acrylic': 'Acrylic (PMMA)'
  };
  // rfBU: the new-part colour is a neutral mid grey (was the bluish '#a8adb6'), so the white sketch wireframe and the
  // yellow selection read on it in the grey-black graphics area. displayColor(c) is the one place a stored part colour
  // is read for display: none, or the old default a part was saved with, shows as the current default.
  var DEFAULT_DENSITY = 7850, DEFAULT_COLOR = '#8c8c8c', LEGACY_DEFAULT_COLORS = ['#a8adb6'], NONE = 'Material <not specified>';
  function displayColor(c) {
    if (!c) return DEFAULT_COLOR;
    return LEGACY_DEFAULT_COLORS.indexOf(String(c).toLowerCase()) >= 0 ? DEFAULT_COLOR : String(c);
  }

  function list() { return ALL.slice(); }
  function classes() { return CLASSES.map(function (c) { return { name: c.name, materials: c.materials.slice() }; }); }
  // find(name) -> the library material (exact name, case-insensitive, or an alias), or null
  function find(name) {
    if (name == null) return null;
    if (typeof name === 'object' && name.name) name = name.name;
    var k = String(name).trim().toLowerCase();
    return BY_NAME[k] || (ALIASES[k] && BY_NAME[ALIASES[k].toLowerCase()]) || null;
  }
  function favorites() { return ['Plain Carbon Steel', 'AISI 304', '6061-T6 (SS)', 'Brass', 'ABS', 'Nylon 6/6'].map(find); }

  // ------------------------------------------------------------------ part and body materials
  // of(model) -> the part's library material or null (model.material, or the older model.materialName)
  function of(model) {
    if (!model) return null;
    return find(model.material) || (model.material ? null : find(model.materialName));
  }
  function materialName(model) { var m = of(model); return m ? m.name : null; }
  // apply(model, name | null) -> the material. Sets model.material, density and colour (SolidWorks: the material brings
  // its appearance). null removes the material: density and colour go back to the new-part defaults. Throws on an
  // unknown name.
  function apply(model, name) {
    if (name == null || name === '' || name === NONE) {
      delete model.material; delete model.materialName;
      model.density = DEFAULT_DENSITY; model.color = DEFAULT_COLOR;
      return null;
    }
    var m = find(name);
    if (!m) throw new Error('Unknown material "' + name + '"');
    model.material = m.name; delete model.materialName;
    model.density = m.density; model.color = m.color;
    return m;
  }
  function hasBodyMaterials(model) { return !!(model && model.bodyMaterials && Object.keys(model.bodyMaterials).length); }
  // applyToBody(model, featureId, name | null): a body's own material (null: the body follows the part again)
  function applyToBody(model, featureId, name) {
    if (featureId == null) throw new Error('bodyMaterial: no body feature');
    var key = String(featureId);
    if (name == null || name === '') {
      if (model.bodyMaterials) { delete model.bodyMaterials[key]; if (!Object.keys(model.bodyMaterials).length) delete model.bodyMaterials; }
      return null;
    }
    var m = find(name);
    if (!m) throw new Error('Unknown material "' + name + '"');
    (model.bodyMaterials = model.bodyMaterials || {})[key] = m.name;
    return m;
  }
  function bodyList(build) { return build ? (build.bodies || (build.body ? [build.body] : [])) : []; }
  // bodyMaterial(model, build, i) -> { name, density, color, own } for body i (own: the body has its own material)
  function bodyMaterial(model, build, i) {
    var fid = build && build.bodyFeatures ? build.bodyFeatures[i] : null;
    var nm = fid != null && model.bodyMaterials ? model.bodyMaterials[String(fid)] : null, m = nm ? find(nm) : null;
    if (m) return { name: m.name, density: m.density, color: m.color, own: true, featureId: fid };
    var pm = of(model);
    return { name: pm ? pm.name : null, density: model.density > 0 ? model.density : DEFAULT_DENSITY, color: displayColor(model.color), own: false, featureId: fid };
  }
  // bodyColors(model, build) -> [css colour per body], or null when every body has the part's colour
  function bodyColors(model, build) {
    if (!hasBodyMaterials(model)) return null;
    var n = bodyList(build).length, out = [], any = false;
    for (var i = 0; i < n; i++) { var bm = bodyMaterial(model, build, i); out.push(bm.color); if (bm.own && bm.color !== displayColor(model.color)) any = true; }
    return any ? out : null;
  }

  // ------------------------------------------------------------------ rfHC: RealView appearances
  // What a material looks like with RealView on (ui-core.js "rfHC RealView"): base colour (sRGB '#rrggbb', for a metal
  // its reflectance), metalness 0..1, roughness 0..1 and a surface pattern drawn in the shader (0 none, 1 brushed
  // streaks, 2 galvanized spangle). With RealView off the part keeps its flat `color` as before. One finish per kind of
  // stock; a library material takes its finish from APPEARANCE_OF (by name), else from its class.
  var FINISHES = {
    none: { name: 'Satin grey (no material)', color: DEFAULT_COLOR, metalness: 0.05, roughness: 0.42, pattern: 0 },
    carbonSteel: { name: 'Cold rolled steel', color: '#a2a9b1', metalness: 0.78, roughness: 0.4, pattern: 0 },
    hotRolled: { name: 'Hot rolled steel (mill scale)', color: '#5d6166', metalness: 0.5, roughness: 0.74, pattern: 0 },
    galvanized: { name: 'Galvanized steel', color: '#bfc5ca', metalness: 0.85, roughness: 0.44, pattern: 2 },
    stainless: { name: 'Brushed stainless steel', color: '#c8ccd0', metalness: 0.92, roughness: 0.3, pattern: 1 },
    aluminium: { name: 'Satin aluminium', color: '#d3d6da', metalness: 0.9, roughness: 0.36, pattern: 0 },
    aluminiumSheet: { name: 'Mill finish aluminium sheet', color: '#d8dbdf', metalness: 0.92, roughness: 0.3, pattern: 1 },
    brass: { name: 'Polished brass', color: '#dcb96a', metalness: 0.95, roughness: 0.28, pattern: 0 },
    copper: { name: 'Polished copper', color: '#d98c5f', metalness: 0.95, roughness: 0.3, pattern: 0 },
    bronze: { name: 'Bronze', color: '#c89d55', metalness: 0.92, roughness: 0.36, pattern: 0 },
    titanium: { name: 'Titanium', color: '#a3a6aa', metalness: 0.85, roughness: 0.44, pattern: 0 }
  };
  var APPEARANCE_OF = {
    'Plain Carbon Steel': 'carbonSteel', 'AISI 1020': 'carbonSteel', 'AISI 1045 Steel, cold drawn': 'carbonSteel', 'AISI 4130 Steel, normalized': 'carbonSteel',
    'AISI 1018 Steel, cold rolled': 'carbonSteel', 'ASTM A36 Steel': 'hotRolled', 'Galvanized Steel': 'galvanized',
    'AISI 304': 'stainless', 'AISI 316': 'stainless', '17-4 PH (H1150)': 'stainless',
    '1060 Alloy': 'aluminiumSheet', '5052-H32': 'aluminiumSheet', '6061-T6 (SS)': 'aluminium', '7075-T6 (SN)': 'aluminium',
    'Brass': 'brass', 'Copper': 'copper', 'Aluminium Bronze': 'bronze',
    'Commercially Pure Titanium (Grade 2)': 'titanium', 'Ti-6Al-4V': 'titanium'
  };
  // plastics: their own colour, no metal, a gloss by grade
  var PLASTIC_ROUGHNESS = { 'ABS': 0.45, 'PLA': 0.5, 'Nylon 6/6': 0.6, 'Acetal (POM)': 0.4, 'Polycarbonate': 0.16, 'Acrylic (PMMA)': 0.1 };
  function finishCopy(f, color) { return { name: f.name, color: color || f.color, metalness: f.metalness, roughness: f.roughness, pattern: f.pattern }; }
  // appearance(material | name | null) -> { name, color, metalness, roughness, pattern } (null: the no-material grey)
  function appearance(m) {
    if (m != null && !(typeof m === 'object' && m.name && m.density)) m = find(m);
    if (!m) return finishCopy(FINISHES.none);
    if (APPEARANCE_OF[m.name]) return finishCopy(FINISHES[APPEARANCE_OF[m.name]]);
    if (m.finish && FINISHES[m.finish]) return finishCopy(FINISHES[m.finish]);
    if (!m.metal) return { name: 'Plastic, ' + m.name, color: m.color, metalness: 0, roughness: PLASTIC_ROUGHNESS[m.name] != null ? PLASTIC_ROUGHNESS[m.name] : 0.45, pattern: 0 };
    return { name: 'Metal, ' + m.name, color: m.color, metalness: 0.85, roughness: 0.4, pattern: 0 };
  }
  // appearanceOf(model) -> the part's appearance: its material's, with a colour of its own (p.color, a colour that is not
  // the material's) kept as the base colour; no material = the satin grey in the part's display colour
  function appearanceOf(model) {
    var m = of(model), c = model && model.color ? displayColor(model.color) : null;
    if (!m) return finishCopy(FINISHES.none, c || DEFAULT_COLOR);
    var a = appearance(m);
    if (c && c.toLowerCase() !== String(m.color).toLowerCase()) a.color = c;
    return a;
  }
  function appearanceKey(a) { return [a.color, a.metalness, a.roughness, a.pattern].join('|'); }
  // bodyAppearances(model, build) -> [appearance per body] (assemblies: per component, from its part), or null for a part
  // without body materials (every body looks like the part: appearanceOf(model)). The viewer draws a list whose entries
  // share one appearanceKey without per-vertex data.
  function bodyAppearances(model, build) {
    if (!model || !build) return null;
    var out = [];
    if (model.type === 'assembly') {
      var cache = build.cache || {};
      out = (model.components || []).map(function (c) { var e = cache[JSON.stringify(c.source)]; return appearanceOf(e && e.model ? e.model : null); });
    } else {
      if (!hasBodyMaterials(model)) return null;
      var n = bodyList(build).length, base = appearanceOf(model);
      for (var i = 0; i < n; i++) { var bm = bodyMaterial(model, build, i); out.push(bm.own ? appearance(bm.name) : base); }
    }
    return out.length ? out : null;
  }

  // ------------------------------------------------------------------ mass properties
  function volumeToM3(v, units) { return v * (units === 'in' ? Math.pow(0.0254, 3) : 1e-9); }
  // per-body volume and first moments straight from the combined mesh (faces carry their body index)
  function bodyIntegrals(mesh) {
    var P = mesh.positions64 || mesh.positions, out = [];
    mesh.faces.forEach(function (f) {
      var b = f.body || 0, acc = out[b] || (out[b] = { volume: 0, m: [0, 0, 0] });
      for (var t = f.start; t < f.start + f.count; t++) {
        var i = t * 9;
        var ax = P[i], ay = P[i + 1], az = P[i + 2], bx = P[i + 3], by = P[i + 4], bz = P[i + 5], cx = P[i + 6], cy = P[i + 7], cz = P[i + 8];
        var v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
        acc.volume += v;
        acc.m[0] += v * (ax + bx + cx) / 4; acc.m[1] += v * (ay + by + cy) / 4; acc.m[2] += v * (az + bz + cz) / 4;
      }
    });
    for (var i = 0; i < out.length; i++) if (!out[i]) out[i] = { volume: 0, m: [0, 0, 0] };
    return out;
  }
  var buildMemo = { key: null, build: null };
  // a build for a model that needs one (body materials are keyed by feature id) and was not given one
  function buildFor(model) {
    var key = JSON.stringify(model);
    if (buildMemo.key !== key) { buildMemo.key = key; buildMemo.build = K.rebuild(JSON.parse(key)); }
    return buildMemo.build;
  }
  // massProps(model, build?, mesh?) -> Kernel.massProps' result ({ volume, area, centroid, bbox, density, mass }, mass =
  // volume · density in model units as the kernel has it) plus massKg, units, material and bodies: [{ index,
  // featureId, material, density, volume, mass, massKg, centroid, own }]. Bodies with their own material weigh with
  // their own density; without any, mass and centroid are exactly Kernel.massProps(mesh, model.density)'s.
  function massProps(model, build, mesh) {
    var units = model && model.units === 'in' ? 'in' : 'mm';
    if (!mesh && build && build.body) mesh = K.meshFromBody(build.body);
    if ((!mesh || !build) && hasBodyMaterials(model)) { build = build || buildFor(model); if (!mesh && build.body) mesh = K.meshFromBody(build.body); }
    if (!build && !mesh) { build = buildFor(model); mesh = build.body ? K.meshFromBody(build.body) : null; }
    var density = model.density > 0 ? model.density : DEFAULT_DENSITY, mat = of(model);
    if (!mesh || !mesh.triCount) return { volume: 0, area: 0, centroid: [0, 0, 0], bbox: { min: [0, 0, 0], max: [0, 0, 0] }, density: density, mass: 0, massKg: 0, units: units, material: mat ? mat.name : null, bodies: [] };
    var base = K.massProps(mesh, density), per = bodyIntegrals(mesh), own = hasBodyMaterials(model);
    var M = 0, mc = [0, 0, 0];
    var bodies = per.map(function (b, i) {
      var bm = own ? bodyMaterial(model, build, i) : { name: mat ? mat.name : null, density: density, own: false, featureId: build && build.bodyFeatures ? build.bodyFeatures[i] : null };
      var c = b.volume ? [b.m[0] / b.volume, b.m[1] / b.volume, b.m[2] / b.volume] : [0, 0, 0], m = b.volume * bm.density;
      M += m; mc[0] += c[0] * m; mc[1] += c[1] * m; mc[2] += c[2] * m;
      return { index: i, featureId: bm.featureId, material: bm.name, density: bm.density, own: bm.own, volume: b.volume, mass: m, massKg: volumeToM3(b.volume, units) * bm.density, centroid: c };
    });
    var out = { volume: base.volume, area: base.area, centroid: base.centroid, bbox: base.bbox, density: density, mass: base.mass, units: units, material: mat ? mat.name : null, bodies: bodies };
    if (own && M > 0) { out.mass = M; out.centroid = [mc[0] / M, mc[1] / M, mc[2] / M]; out.density = base.volume ? M / base.volume : density; }
    out.massKg = volumeToM3(1, units) * out.mass;
    return out;
  }
  // assemblies: Assembly.massProps with each component's own part (and body) materials; mass in kg added
  function assemblyMass(model, build) {
    if (typeof Assembly === 'undefined') return null;
    var b = build || Assembly.rebuild(JSON.parse(JSON.stringify(model)));
    var mp = Assembly.massProps(model, b);
    mp.massKg = volumeToM3(1, model.units === 'in' ? 'in' : 'mm') * mp.mass;
    mp.units = model.units === 'in' ? 'in' : 'mm';
    return mp;
  }

  // ------------------------------------------------------------------ formatting
  function trimNum(x, d) { var s = (+x).toFixed(d); return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  // SolidWorks MMGS shows mass in grams, IPS in pounds
  function formatMass(kg, units) { return units === 'in' ? (kg / 0.45359237).toFixed(3) + ' lb' : (kg * 1000).toFixed(2) + ' g'; }

  // ------------------------------------------------------------------ custom properties
  var TYPES = ['Text', 'Date', 'Number', 'Yes or no'];
  var PRESETS = ['Description', 'Part Number', 'Material', 'Mass', 'Vendor', 'Revision', 'Author', 'Drawn By', 'Checked By', 'Finish', 'Cost', 'Weight', 'Project'];
  // the links SolidWorks offers in the Value / Text Expression list: [label, link text]
  var LINKS = [['Material', 'SW-Material'], ['Mass', 'SW-Mass'], ['Density', 'SW-Density'], ['Volume', 'SW-Volume'], ['Surface Area', 'SW-Surface Area'], ['File Name', 'SW-File Name'], ['Configuration Name', 'SW-Configuration Name']];
  function link(name) { return '"SW-' + name + '"'; }
  // the rows File ▸ Properties starts from when a document has none (SolidWorks' part template properties)
  function defaultProperties(model) {
    var asm = model && model.type === 'assembly';
    return [
      { name: 'Description', type: 'Text', value: '' },
      { name: 'Part Number', type: 'Text', value: '' },
      asm ? null : { name: 'Material', type: 'Text', value: link('Material') },
      { name: 'Mass', type: 'Text', value: link('Mass') },
      { name: 'Vendor', type: 'Text', value: '' },
      { name: 'Revision', type: 'Text', value: '' }
    ].filter(Boolean);
  }
  function normType(t) { for (var i = 0; i < TYPES.length; i++) if (String(t || '').toLowerCase() === TYPES[i].toLowerCase()) return TYPES[i]; return 'Text'; }
  function normList(list) {
    return (list || []).filter(function (p) { return p && String(p.name || '').trim(); }).map(function (p) {
      return { name: String(p.name).trim(), type: normType(p.type), value: p.value == null ? '' : String(p.value) };
    });
  }
  function activeConfigName(model) {
    var ac = K && K.activeConfiguration ? K.activeConfiguration(model) : null;
    return ac ? ac.name : 'Default';
  }
  function configNames(model) {
    var l = K && K.configurationList ? K.configurationList(model) : [];
    var names = (l || []).map(function (c) { return c.name; });
    return names.length ? names : ['Default'];
  }
  function custom(model) { return normList(model && model.properties && model.properties.custom); }
  function configSpecific(model, cfg) {
    var c = model && model.properties && model.properties.config;
    return normList(c && c[cfg == null ? activeConfigName(model) : cfg]);
  }
  // setCustom(model, list) / setConfigSpecific(model, cfg, list): replace a tab's rows; empty lists are dropped
  function setCustom(model, list) {
    var l = normList(list), p = model.properties || {};
    if (l.length) p.custom = l; else delete p.custom;
    tidy(model, p);
  }
  function setConfigSpecific(model, cfg, list) {
    var l = normList(list), p = model.properties || {};
    cfg = cfg == null ? activeConfigName(model) : String(cfg);
    p.config = p.config || {};
    if (l.length) p.config[cfg] = l; else delete p.config[cfg];
    if (!Object.keys(p.config).length) delete p.config;
    tidy(model, p);
  }
  function tidy(model, p) { if (Object.keys(p).length) model.properties = p; else delete model.properties; }
  // setProperty(model, name, value | null, { type, config }): add, change or (value null) remove one property
  function setProperty(model, name, value, opts) {
    opts = opts || {};
    var cfg = opts.config != null ? String(opts.config) : null;
    var l = cfg == null ? custom(model) : configSpecific(model, cfg), key = String(name).trim().toLowerCase(), hit = -1;
    l.forEach(function (p, i) { if (p.name.toLowerCase() === key) hit = i; });
    if (value == null) { if (hit >= 0) l.splice(hit, 1); }
    else {
      var row = { name: String(name).trim(), type: normType(opts.type || (hit >= 0 ? l[hit].type : 'Text')), value: String(value) };
      if (hit >= 0) l[hit] = row; else l.push(row);
    }
    if (cfg == null) setCustom(model, l); else setConfigSpecific(model, cfg, l);
  }
  // effective(model, cfg?) -> [{ name, type, value, source: 'custom' | 'config' }]: Custom rows, with the
  // configuration's own rows replacing those of the same name and adding the rest
  function effective(model, cfg) {
    var out = custom(model).map(function (p) { return { name: p.name, type: p.type, value: p.value, source: 'custom' }; });
    configSpecific(model, cfg).forEach(function (p) {
      var hit = null;
      out.forEach(function (q) { if (q.name.toLowerCase() === p.name.toLowerCase()) hit = q; });
      if (hit) { hit.type = p.type; hit.value = p.value; hit.source = 'config'; }
      else out.push({ name: p.name, type: p.type, value: p.value, source: 'config' });
    });
    return out;
  }
  // context(model, { build, mesh, config }) -> a memo for evaluate(): mass properties are computed once, on demand
  function context(model, opts) {
    opts = opts || {};
    // opts.material / opts.massProps stand in for the part's (a BOM row for one body of a multi-body part)
    var ctx = { model: model, build: opts.build || null, mesh: opts.mesh || null, config: opts.config, mp: opts.massProps || null, material: opts.material };
    ctx.mass = function () {
      if (ctx.mp) return ctx.mp;
      if (model && model.type === 'assembly') ctx.mp = assemblyMass(model, ctx.build && ctx.build.assembly ? ctx.build : null);
      else ctx.mp = massProps(model, ctx.build, ctx.mesh);
      return ctx.mp;
    };
    return ctx;
  }
  function unitsOf(model) { return model && model.units === 'in' ? 'in' : 'mm'; }
  // system(model, name, ctx) -> the value a "SW-name" link shows, or null for a name it does not know
  function system(model, name, ctx) {
    var n = String(name).trim().toLowerCase(), u = unitsOf(model), asm = model && model.type === 'assembly';
    ctx = ctx || context(model);
    switch (n) {
      case 'material': return ctx.material !== undefined ? (ctx.material || NONE) : asm ? '' : (materialName(model) || NONE);
      case 'mass': { var mp = ctx.mass(); return mp ? formatMass(mp.massKg || 0, u) : ''; }
      case 'density': {
        if (asm) { var am = ctx.mass(); return am && am.volume ? trimNum(am.mass / am.volume, 2) + ' kg/m^3' : ''; }
        return trimNum(ctx.mass().density, 2) + ' kg/m^3';
      }
      case 'volume': return (ctx.mass().volume || 0).toFixed(2) + ' ' + u + '^3';
      case 'surface area': return (ctx.mass().area || 0).toFixed(2) + ' ' + u + '^2';
      case 'file name': case 'title': return String(model.name || '');
      case 'configuration name': return ctx.config != null ? String(ctx.config) : activeConfigName(model);
    }
    return null;
  }
  var LINK_RE = /"SW-([^"@]+)(?:@[^"]*)?"/g;
  // evaluate(model, text, ctx?) -> the text with every "SW-…" link replaced by its value (unknown links stay as typed)
  function evaluate(model, text, ctx) {
    ctx = ctx || context(model);
    return String(text == null ? '' : text).replace(LINK_RE, function (all, nm) { var v = system(model, nm, ctx); return v == null ? all : v; });
  }
  function isLinked(text) { LINK_RE.lastIndex = 0; var r = LINK_RE.test(String(text || '')); LINK_RE.lastIndex = 0; return r; }
  // property(model, name, ctx?) -> the evaluated value of a custom / configuration-specific property, or null
  function property(model, name, ctx) {
    ctx = ctx || context(model);
    var key = String(name).trim().toLowerCase(), hit = null;
    effective(model, ctx.config).forEach(function (p) { if (p.name.toLowerCase() === key) hit = p; });
    return hit ? evaluate(model, hit.value, ctx) : null;
  }
  // sheetProperty(model, name, ctx?) -> what a drawing's $PRPSHEET:"name" shows: the property, else (for the names a
  // title block links by default) the system value, so a part without File Properties still fills MATERIAL / MASS
  var SHEET_FALLBACK = { material: 'Material', mass: 'Mass', weight: 'Mass', density: 'Density', volume: 'Volume' };
  function sheetProperty(model, name, ctx) {
    ctx = ctx || context(model);
    var v = property(model, name, ctx);
    if (v != null) return v;
    var fb = SHEET_FALLBACK[String(name).trim().toLowerCase()];
    return fb ? system(model, fb, ctx) : '';
  }
  // evaluated(model, ctx?) -> [{ name, type, value, evaluated, source }]
  function evaluated(model, ctx) {
    ctx = ctx || context(model);
    return effective(model, ctx.config).map(function (p) { p.evaluated = evaluate(model, p.value, ctx); return p; });
  }

  // ------------------------------------------------------------------ script round trip
  function propLine(v, p, cfg) {
    var o = [];
    if (p.type && p.type !== 'Text') o.push('type: ' + JSON.stringify(p.type));
    if (cfg != null) o.push('config: ' + JSON.stringify(cfg));
    return v + '.property(' + JSON.stringify(p.name) + ', ' + JSON.stringify(p.value) + (o.length ? ', { ' + o.join(', ') + ' }' : '') + ');';
  }
  function propertyLines(model, v) {
    var out = custom(model).map(function (p) { return propLine(v, p, null); });
    var c = model.properties && model.properties.config;
    Object.keys(c || {}).forEach(function (cfg) { normList(c[cfg]).forEach(function (p) { out.push(propLine(v, p, cfg)); }); });
    return out;
  }
  // the document lines generateScript gains after `p.name(…).units(…);`
  function headLines(model) {
    var out = [], m = of(model);
    if (m) {
      out.push('p.material(' + JSON.stringify(m.name) + ');');
      if (model.color && model.color.toLowerCase() !== m.color.toLowerCase()) out.push('p.color(' + JSON.stringify(model.color) + ');');
    } else {
      if (model.density != null && Math.abs(model.density - DEFAULT_DENSITY) > 1e-9) out.push('p.density(' + (+model.density) + ');');
      if (model.color && displayColor(model.color).toLowerCase() !== DEFAULT_COLOR) out.push('p.color(' + JSON.stringify(model.color) + ');');
    }
    return out.concat(propertyLines(model, 'p'));
  }
  function insertAfterHead(s, lines, marker) {
    if (!lines.length) return s;
    var at = s.indexOf(marker), nl = at < 0 ? -1 : s.indexOf('\n', at);
    if (nl < 0) return s + (s && s.charAt(s.length - 1) !== '\n' ? '\n' : '') + lines.join('\n') + '\n';
    return s.slice(0, nl + 1) + lines.join('\n') + '\n' + s.slice(nl + 1);
  }
  function install(Kn, As) {
    if (Kn && !Kn.__materials) {
      Kn.__materials = true;
      var BP = Kn.Builder.prototype;
      // p.material(name | null): the part's material (density and appearance come with it)
      BP.material = function (name) { apply(this.model, name); return this; };
      // p.bodyMaterial(featureIdOrName, name | null): a body's own material, the body named by the feature that made it
      BP.bodyMaterial = function (ref, name) {
        var f = typeof ref === 'number' ? Kn.findFeature(this.model, ref) : null;
        if (!f && ref != null) this.model.features.forEach(function (x) { if (!f && x.name === String(ref)) f = x; });
        if (!f) throw new Error('bodyMaterial: no feature ' + JSON.stringify(ref));
        applyToBody(this.model, f.id, name);
        return this;
      };
      // p.property(name, value | null, { type, config }): a File ▸ Properties row (Custom, or Configuration Specific)
      BP.property = function (name, value, opts) { setProperty(this.model, name, value, opts); return this; };
      // p.density(d) with a value that is not the material's unlinks the material (the part now has a custom density)
      var dens = BP.density;
      BP.density = function (d) {
        var r = dens.apply(this, arguments), m = of(this.model);
        if (m && Math.abs(m.density - this.model.density) > 1e-9) { delete this.model.material; delete this.model.materialName; }
        return r;
      };
      Kn.registerScriptSection({
        head: headLines,
        tail: function (model, idVar) {
          return Object.keys(model.bodyMaterials || {}).filter(function (fid) { return idVar[fid]; }).map(function (fid) {
            return 'p.bodyMaterial(' + idVar[fid] + ', ' + JSON.stringify(model.bodyMaterials[fid]) + ');';
          });
        }
      });
    }
    if (As && !As.__materials) {
      As.__materials = true;
      As.Builder.prototype.property = function (name, value, opts) { setProperty(this.model, name, value, opts); return this; };
      var agen = As.generateScript;
      As.generateScript = function (model) { return insertAfterHead(agen.apply(this, arguments), propertyLines(model, 'a'), 'a.name('); };
    }
  }
  install(K, typeof Assembly !== 'undefined' ? Assembly : null);

  return {
    CLASSES: CLASSES, NONE: NONE, DEFAULT_DENSITY: DEFAULT_DENSITY, DEFAULT_COLOR: DEFAULT_COLOR, displayColor: displayColor, TYPES: TYPES, PRESETS: PRESETS, LINKS: LINKS,
    list: list, classes: classes, find: find, favorites: favorites,
    of: of, materialName: materialName, apply: apply, applyToBody: applyToBody, hasBodyMaterials: hasBodyMaterials,
    bodyMaterial: bodyMaterial, bodyColors: bodyColors, FINISHES: FINISHES, appearance: appearance, appearanceOf: appearanceOf, appearanceKey: appearanceKey, bodyAppearances: bodyAppearances,
    massProps: massProps, assemblyMass: assemblyMass, bodyIntegrals: bodyIntegrals,
    volumeToM3: volumeToM3, formatMass: formatMass, link: link,
    defaultProperties: defaultProperties, custom: custom, configSpecific: configSpecific, setCustom: setCustom, setConfigSpecific: setConfigSpecific,
    setProperty: setProperty, effective: effective, evaluated: evaluated, context: context, system: system, evaluate: evaluate, isLinked: isLinked,
    property: property, sheetProperty: sheetProperty, activeConfigName: activeConfigName, configNames: configNames,
    headLines: headLines, install: install
  };
})();
