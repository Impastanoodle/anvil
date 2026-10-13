  // ------------------------------------------------------------------ materials & custom properties (materials.js)
  // The material library, per-body materials and mass with the material density (analytic boxes, the bolt-hole plate,
  // an assembly), custom / configuration-specific properties with "SW-" links, the script round trip, BOM columns bound
  // to properties (Top-level only vs Parts only, part and assembly drawings) and title-block text in the exports.
  group('materials & properties');
  if (typeof Materials === 'undefined') test('materials.js loads', function () { fail('Materials is not defined'); });
  else (function () {
    var MT = Materials, Q = String.fromCharCode(34);
    function sw(name) { return Q + 'SW-' + name + Q; }
    function part(code, name) { var r = build(code); if (name) r.model.name = name; r.mt = MT.massProps(r.model, r.build, r.mesh); return r; }
    function polyArea(r) { var n = Math.max(16, Math.min(72, Math.round(8 * Math.sqrt(r)))); return n / 2 * r * r * Math.sin(2 * Math.PI / n); }
    test('library: classes and materials (density, E, yield, tensile, colour), lookup by name and alias, unknown names', function () {
      var cls = MT.classes().map(function (c) { return c.name; });
      ['Steel', 'Stainless Steel', 'Aluminium Alloys', 'Copper Alloys', 'Titanium Alloys', 'Plastics'].forEach(function (c) { assert(cls.indexOf(c) >= 0, 'class ' + c); });
      var n = 0;
      MT.list().forEach(function (m) {
        assert(m.density > 0 && m.E > 0 && m.yield > 0 && m.tensile >= m.yield && m.nu > 0 && m.nu < 0.5, m.name + ' properties');
        assert(/^#[0-9a-f]{6}$/i.test(m.color) && m.category, m.name + ' colour / category'); n++;
      });
      ['Plain Carbon Steel', 'AISI 304', 'AISI 316', '6061-T6 (SS)', '5052-H32', 'Brass', 'Copper', 'ABS', 'PLA', 'Nylon 6/6', 'Acetal (POM)', 'Ti-6Al-4V'].forEach(function (x) { assert(MT.find(x) && MT.find(x).name === x, 'find ' + x); });
      assert(MT.find('6061').name === '6061-T6 (SS)' && MT.find('aluminum 5052').name === '5052-H32' && MT.find('Steel, plain carbon').name === 'Plain Carbon Steel' && MT.find('delrin').name === 'Acetal (POM)', 'aliases');
      near(MT.find('Brass').density, 8500, 0); near(MT.find('ABS').density, 1020, 0); near(MT.find('6061-T6 (SS)').yield, 275, 0);
      assert(MT.find('Unobtainium') === null, 'unknown -> null');
      var bad = false; try { MT.apply(K.newModel(), 'Unobtainium'); } catch (e) { bad = /Unknown material/.test(e.message); }
      assert(bad, 'apply throws on an unknown material');
      return n + ' materials in ' + cls.length + ' classes';
    });
    test('mass = volume × material density: 100 × 50 × 10 mm box in 6061-T6 135 g, Brass 425 g, ABS 51 g, Plain Carbon Steel 390 g', function () {
      var want = { '6061-T6 (SS)': 135, 'Brass': 425, 'ABS': 51, 'Plain Carbon Steel': 390 }, out = [];
      Object.keys(want).forEach(function (name) {
        var r = part('p.material(' + JSON.stringify(name) + '); p.box(100, 50, 10);');
        assert(r.model.material === name && r.model.density === MT.find(name).density && r.model.color === MT.find(name).color, name + ' applied');
        nearRel(r.mt.volume, 50000, 1e-12, 'volume');
        nearRel(r.mt.massKg * 1000, want[name], 1e-9, name + ' grams');
        near(r.mt.mass, r.mp.mass, 1e-6, 'same as Kernel.massProps(mesh, density)');
        assert(MT.system(r.model, 'Mass') === want[name].toFixed(2) + ' g', 'SW-Mass text ' + MT.system(r.model, 'Mass'));
        out.push(name + ' ' + want[name] + ' g');
      });
      return out.join(', ');
    });
    test('Design Library "Plate with bolt holes" (100 × 60 × 8, 4 × Ø8, exact since true curves): mass in 6061-T6, AISI 304 and Nylon 6/6', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0];
      var V = 100 * 60 * 8 - 4 * 8 * Math.PI * 16, out = [];
      ['6061-T6 (SS)', 'AISI 304', 'Nylon 6/6'].forEach(function (name) {
        var r = part(ex.code + '\np.material(' + JSON.stringify(name) + ');');
        nearRel(r.mt.volume, V, 1e-9, 'plate volume');
        nearRel(r.mt.massKg, V * 1e-9 * MT.find(name).density, 1e-6, name + ' kg');
        out.push(name + ' ' + (r.mt.massKg * 1000).toFixed(2) + ' g');
      });
      return 'V = ' + V.toFixed(3) + ' mm³: ' + out.join(', ');
    });
    test('inch part: a 2 × 1 × 0.5 in 6061-T6 block is 1 in³ = 0.0442 kg, SW-Mass in pounds', function () {
      var r = part('p.units("in"); p.material("6061"); p.box(2, 1, 0.5);');
      nearRel(r.mt.volume, 1, 1e-12, 'in³');
      nearRel(r.mt.massKg, 2700 * Math.pow(0.0254, 3), 1e-12, 'kg');
      assert(MT.system(r.model, 'Mass') === (2700 * Math.pow(0.0254, 3) / 0.45359237).toFixed(3) + ' lb', MT.system(r.model, 'Mass'));
      return MT.system(r.model, 'Mass');
    });
    test('multi-body part: a Plain Carbon Steel cube and an ABS cube (bodyMaterial) weigh 7.80 + 1.02 g, mass-weighted centroid, per-body colours', function () {
      var r = part('p.material("Plain Carbon Steel"); p.box(10, 10, 10); p.sketch("Front").rect(20, 0, 10, 10).id(); var e = p.extrude(10, { merge: false }).last(); p.bodyMaterial(e, "ABS");');
      assert(r.build.bodies.length === 2 && MT.hasBodyMaterials(r.model), 'two bodies with a body material');
      var b = r.mt.bodies;
      assert(b[0].material === 'Plain Carbon Steel' && !b[0].own && b[1].material === 'ABS' && b[1].own, 'body materials ' + JSON.stringify(b.map(function (x) { return x.material; })));
      nearRel(b[0].massKg * 1000, 7.8, 1e-9, 'steel g'); nearRel(b[1].massKg * 1000, 1.02, 1e-9, 'ABS g'); nearRel(r.mt.massKg * 1000, 8.82, 1e-9, 'total g');
      nearVec(r.mt.centroid, [(5 * 7.8 + 25 * 1.02) / 8.82, 5, 5], 1e-6, 'centroid');
      near(r.mt.density, 8.82e-3 / 2000e-9, 1e-6, 'average density');
      var c = MT.bodyColors(r.model, r.build);
      assert(c && c[0] === MT.find('Plain Carbon Steel').color && c[1] === MT.find('ABS').color, 'colours ' + c);
      MT.applyToBody(r.model, r.build.bodyFeatures[1], null);
      assert(!r.model.bodyMaterials && MT.bodyColors(r.model, r.build) === null, 'Use Part Material clears it');
      var m2 = MT.massProps(r.model, r.build, r.mesh);
      nearRel(m2.massKg * 1000, 15.6, 1e-9, 'all steel');
      // without a build the body materials are resolved by rebuilding the model
      var r3 = part('p.box(10, 10, 10); p.sketch("Front").rect(20, 0, 10, 10).id(); var e = p.extrude(10, { merge: false }).last(); p.bodyMaterial(e, "Copper");');
      nearRel(MT.massProps(r3.model).massKg * 1000, 7.85 + 8.9, 1e-9, 'rebuilt: default 7850 + Copper');
      return (r.mt.massKg * 1000).toFixed(2) + ' g, centroid x ' + r.mt.centroid[0].toFixed(4);
    });
    test('assembly mass: each component weighs with its own part material (and body materials); SW-Mass of the assembly', function () {
      var steel = JSON.stringify({ script: 'p.name("Base"); p.material("6061"); p.box(100, 10, 50);' });
      var brass = JSON.stringify({ script: 'p.name("Block"); p.material("Brass"); p.box(20, 20, 20);' });
      var twin = JSON.stringify({ script: 'p.name("Twin"); p.material("Plain Carbon Steel"); p.box(10, 10, 10); p.sketch("Front").rect(20, 0, 10, 10).id(); var e = p.extrude(10, { merge: false }).last(); p.bodyMaterial(e, "ABS");' });
      var r = buildAsm('a.insert(' + steel + ', { fixed: true }); a.insert(' + brass + ', { position: [0, 10, 0] }); a.insert(' + brass + ', { position: [40, 10, 0] }); a.insert(' + twin + ', { position: [0, 40, 0] });');
      var mp = Assembly.massProps(r.model, r.build), g = function (c) { return c.mass * 1e-9 * 1000; };
      assert(mp.components.map(function (c) { return c.material; }).join('|') === '6061-T6 (SS)|Brass|Brass|Plain Carbon Steel', 'component materials');
      nearRel(g(mp.components[0]), 135, 1e-9, 'Base g'); nearRel(g(mp.components[1]), 68, 1e-9, 'Block g'); nearRel(g(mp.components[3]), 8.82, 1e-9, 'Twin g (steel + ABS body)');
      nearRel(mp.mass * 1e-9, 0.135 + 2 * 0.068 + 0.00882, 1e-9, 'total kg');
      assert(MT.system(r.model, 'Mass', MT.context(r.model, { build: r.build })) === '279.82 g', 'assembly SW-Mass');
      assert(MT.system(r.model, 'Material') === '', 'an assembly has no SW-Material');
      return (mp.mass * 1e-6).toFixed(2) + ' g';
    });
    test('custom and configuration-specific properties: links evaluate ("SW-Mass@Part1.SLDPRT" suffix ignored), configuration rows override, unknown links stay', function () {
      var r = part('p.configurations([{ name: "Small", values: {} }, { name: "Large", values: {} }], "Large"); p.material("6061"); p.box(100, 50, 10);', 'Bracket');
      var m = r.model;
      MT.setProperty(m, 'Description', 'Mounting bracket');
      MT.setProperty(m, 'Material', sw('Material'));
      MT.setProperty(m, 'Mass', sw('Mass@Bracket.SLDPRT'));
      MT.setProperty(m, 'Revision', 'A');
      MT.setProperty(m, 'Qty', '4', { type: 'number' });
      MT.setProperty(m, 'Revision', 'B', { config: 'Large' });
      MT.setProperty(m, 'Finish', 'Anodised', { config: 'Small' });
      var ctx = MT.context(m, { build: r.build, mesh: r.mesh });
      assert(MT.activeConfigName(m) === 'Large', 'active configuration');
      assert(MT.property(m, 'Description', ctx) === 'Mounting bracket' && MT.property(m, 'material', ctx) === '6061-T6 (SS)' && MT.property(m, 'Mass', ctx) === '135.00 g', 'evaluated');
      assert(MT.property(m, 'Revision', ctx) === 'B' && MT.property(m, 'Finish', ctx) === null, 'Large: config Revision B, no Finish');
      var small = MT.context(m, { build: r.build, config: 'Small' });
      assert(MT.property(m, 'Revision', small) === 'A' && MT.property(m, 'Finish', small) === 'Anodised', 'Small: Revision A, Finish');
      assert(MT.custom(m).filter(function (p) { return p.name === 'Qty'; })[0].type === 'Number', 'type normalised');
      assert(MT.evaluate(m, 'V = ' + sw('Volume') + ', rho ' + sw('Density') + ', ' + sw('Configuration Name') + ', ' + sw('File Name') + ' ' + sw('Nope'), ctx) === 'V = 50000.00 mm^3, rho 2700 kg/m^3, Large, Bracket ' + sw('Nope'), MT.evaluate(m, sw('Volume') + sw('Nope'), ctx));
      assert(MT.sheetProperty(K.newModel(), 'Material') === MT.NONE && MT.sheetProperty(m, 'Vendor') === '', 'sheet fallbacks');
      MT.setProperty(m, 'Revision', null); MT.setProperty(m, 'Revision', null, { config: 'Large' });
      assert(MT.property(m, 'Revision', ctx) === null, 'removed');
      assert(MT.defaultProperties(m).map(function (p) { return p.name; }).join(',') === 'Description,Part Number,Material,Mass,Vendor,Revision', 'default rows');
      return MT.evaluated(m, ctx).map(function (p) { return p.name + '=' + p.evaluated; }).join(', ');
    });
    test('script round trip: p.material / p.color / p.property (type, config) / p.bodyMaterial written by generateScript and read back identically', function () {
      var code = 'p.name("Bracket"); p.material("Brass"); p.color("#123456"); p.property("Description", ' + JSON.stringify('Bracket, ' + Q + 'quoted' + Q) + '); p.property("Mass", ' + JSON.stringify(sw('Mass')) + '); p.property("Qty", "4", { type: "Number" }); p.property("Revision", "B", { config: "Default" });' +
        ' p.box(10, 10, 10); p.sketch("Front").rect(20, 0, 10, 10).id(); var e = p.extrude(10, { merge: false }).last(); p.bodyMaterial(e, "ABS");';
      var m = K.newModel(); K.runScript(m, code);
      var s = K.generateScript(m);
      ['p.material("Brass");', 'p.color("#123456");', 'p.property("Qty", "4", { type: "Number" });', 'p.property("Revision", "B", { config: "Default" });', 'p.bodyMaterial(f'].forEach(function (x) { assert(s.indexOf(x) >= 0, 'script has ' + x + '\n' + s); });
      var m2 = K.newModel(); K.runScript(m2, s);
      assert(m2.material === 'Brass' && m2.color === '#123456' && m2.density === 8500, 'material and colour');
      assert(JSON.stringify(m2.properties) === JSON.stringify(m.properties), 'properties ' + JSON.stringify(m2.properties));
      assert(JSON.stringify(m2.bodyMaterials) === JSON.stringify(m.bodyMaterials), 'body materials ' + JSON.stringify(m2.bodyMaterials));
      assert(K.generateScript(m2) === s, 'idempotent');
      // a density that is not the material's unlinks it; a legacy materialName is written as its library material
      var d = K.newModel(); K.runScript(d, 'p.material("Brass"); p.density(8000); p.box(1, 1, 1);');
      assert(!d.material && d.density === 8000 && /p\.density\(8000\);/.test(K.generateScript(d)) && K.generateScript(d).indexOf('.material(') < 0, 'custom density');
      var l = K.newModel(); l.materialName = 'Aluminum 6061'; l.density = 2700;
      assert(MT.materialName(l) === '6061-T6 (SS)' && K.generateScript(l).indexOf('p.material("6061-T6 (SS)");') > 0, 'legacy name');
      // p.material(null) removes it; unknown names throw
      var n = K.newModel(); K.runScript(n, 'p.material("ABS"); p.material(null);');
      assert(!n.material && n.density === 7850 && n.color === MT.DEFAULT_COLOR, 'removed');
      var bad = false; try { K.runScript(K.newModel(), 'p.material("Cheese");'); } catch (e) { bad = /Unknown material/.test(e.message); }
      assert(bad, 'unknown material throws');
      return s.split('\n').length + ' lines';
    });
    test('models without a material or properties write the same script as before (every Design Library part example)', function () {
      var n = 0;
      AnvilExamples.forEach(function (ex) {
        if (isAsmExample(ex)) return;
        var m = K.newModel(); K.runScript(m, ex.code);
        var s = K.generateScript(m);
        assert(!/\.(material|property|bodyMaterial|density|color)\(/.test(s), ex.name + ' gained lines');
        n++;
      });
      return n + ' examples';
    });
    test('assembly properties: a.property round trip through Assembly.generateScript', function () {
      var m = Assembly.newAssembly('Rig');
      Assembly.runScript(m, 'a.name("Rig"); a.property("Description", "Test rig"); a.property("Part Number", "RIG-1"); a.insert({ script: "p.box(1, 1, 1);" }, { fixed: true });');
      var s = Assembly.generateScript(m);
      assert(s.indexOf('a.property("Description", "Test rig");') > 0, s);
      var m2 = Assembly.newAssembly(); Assembly.runScript(m2, s);
      assert(JSON.stringify(m2.properties) === JSON.stringify(m.properties) && Assembly.generateScript(m2) === s, 'round trip');
      return s.split('\n').length + ' lines';
    });
    // ---- drawings
    function tbTexts(sheet) { return sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'SHEET'; }).map(function (p) { return p.text; }); }
    function partDrawing(code, name, opts) {
      var r = part(code, name);
      var doc = DW.newDrawing(r.model, { date: '2026-09-26' });
      DW.standard3View(doc, r.mesh, r.model.units);
      Object.keys(opts || {}).forEach(function (k) { doc[k] = opts[k]; });
      r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
      return r;
    }
    var BOX = 'p.material("6061"); p.property("Description", "Mounting bracket"); p.property("Part Number", "BR-100"); p.property("Revision", "C"); p.property("Mass", ' + JSON.stringify(sw('Mass')) + '); p.box(100, 50, 10);';
    if (DW) test('title block: TITLE, PART NO., REV, MATERIAL and MASS read the part properties ($PRPSHEET links); overrides and $PRP links', function () {
      var r = partDrawing(BOX, 'Bracket'), tb = DW.titleBlock(r.doc, r.model, { build: r.build }), t = tbTexts(r.sheet);
      assert(tb.title === 'MOUNTING BRACKET' && tb.partNo === 'BR-100' && tb.rev === 'C' && tb.material === '6061-T6 (SS)' && tb.mass === '135.00 g' && tb.dwgNo === r.doc.name && tb.units === 'MM' && tb.sheet === '1 OF 1', JSON.stringify(tb));
      ['TITLE', 'PART NO.', 'REV', 'MATERIAL', 'MASS', 'MOUNTING BRACKET', 'BR-100', '6061-T6 (SS)', '135.00 g', 'C', 'THIRD ANGLE', '2026-09-26'].forEach(function (x) { assert(t.indexOf(x) >= 0, 'sheet text ' + x + ' in ' + t.join('|')); });
      // without File Properties: TITLE / PART NO. fall back to the name, MATERIAL / MASS to the part's material and mass
      var p = partDrawing('p.material("Brass"); p.box(20, 20, 20);', 'Cube'), tp = DW.titleBlock(p.doc, p.model);
      assert(tp.title === 'CUBE' && tp.partNo === 'Cube' && tp.material === 'Brass' && tp.mass === '68.00 g' && tp.rev === '', JSON.stringify(tp));
      p.doc.titleBlock = { rev: 'Rev $PRPSHEET:"Vendor"x', dwgNo: 'D-$PRP:"SW-Sheet Name"', material: '$PRPSHEET:"Density"' };
      var to = DW.titleBlock(p.doc, p.model);
      assert(to.rev === 'Rev x' && to.dwgNo === 'D-Sheet1' && to.material === '8500 kg/m^3', JSON.stringify(to));
      return 'MATERIAL ' + tb.material + ', MASS ' + tb.mass;
    });
    if (DW) test('title block text in the SVG, DXF and PDF exports', function () {
      var r = partDrawing(BOX, 'Bracket'), svg = DW.toSVG(r.sheet), dxf = DW.toDXF(r.sheet), pdf = DW.toPDF(r.sheet);
      var d = new DOMParser().parseFromString(svg, 'image/svg+xml'), texts = Array.prototype.map.call(d.querySelectorAll('text'), function (x) { return x.textContent; });
      ['MOUNTING BRACKET', 'BR-100', '6061-T6 (SS)', '135.00 g', 'MATERIAL', 'MASS'].forEach(function (x) {
        assert(texts.indexOf(x) >= 0, 'SVG ' + x);
        assert(dxf.indexOf('\n1\n' + x + '\n') > 0, 'DXF TEXT ' + x);
        assert(pdf.indexOf('(' + x.replace(/[()\\]/g, '\\$&') + ') Tj') > 0, 'PDF ' + x);
      });
      assert(!/[^\x00-\x7f]/.test(pdf), 'PDF ASCII');
      return texts.length + ' SVG texts';
    });
    if (DW) test('BOM columns: default four (157 mm), property columns Material / Mass / Vendor with titles and widths, hidden columns, part-drawing BOM', function () {
      var r = partDrawing(BOX + ' p.property("Vendor", "Acme");', 'Bracket');
      assert(DW.bomRows(r.model, r.mesh).length === 0, 'no BOM rows without a table');
      assert(DW.bomColumns(null).map(function (c) { return c.title; }).join('|') === 'ITEM NO.|PART NUMBER|DESCRIPTION|QTY.' && DW.bomColumns(null).reduce(function (a, c) { return a + c.width; }, 0) === 157, 'defaults');
      r.doc.bom = { show: true, anchor: 'top-left', columns: [{ type: 'item' }, { type: 'partNumber' }, { type: 'description', hidden: true }, 'Material', { type: 'property', prop: 'Mass', title: 'WEIGHT', width: 30 }, { type: 'property', prop: 'Vendor' }, { type: 'qty' }] };
      var sh = DW.compute(r.doc, r.mesh, r.model, { build: r.build });
      assert(sh.bom && sh.bom.columns.map(function (c) { return c.title; }).join('|') === 'ITEM NO.|PART NUMBER|MATERIAL|WEIGHT|VENDOR|QTY.', 'titles ' + sh.bom.columns.map(function (c) { return c.title; }));
      near(sh.bom.box.x1 - sh.bom.box.x0, 18 + 45 + 40 + 30 + 35 + 14, 1e-9, 'width');
      assert(JSON.stringify(sh.bom.cells) === JSON.stringify([[1, 'BR-100', '6061-T6 (SS)', '135.00 g', 'Acme', 1]]), 'cells ' + JSON.stringify(sh.bom.cells));
      var bt = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BOM'; }).map(function (p) { return p.text; });
      ['WEIGHT', '135.00 g', 'Acme', '6061-T6 (SS)'].forEach(function (x) { assert(bt.indexOf(x) >= 0, 'BOM text ' + x); });
      assert(bt.indexOf('DESCRIPTION') < 0 && bt.indexOf('MOUNTING BRACKET') < 0 && bt.indexOf('Mounting bracket') < 0, 'hidden column not drawn');
      assert(DW.bomPropertyNames(r.model).indexOf('Vendor') >= 0 && DW.bomPropertyNames(r.model).indexOf('Revision') >= 0, 'property names');
      return bt.length + ' BOM texts';
    });
    if (DW) test('BOM type on a part drawing: Top-level only lists the part; Parts only lists its bodies (identical ABS bodies counted together) with their own material and mass', function () {
      var code = 'p.name("Rack"); p.material("Plain Carbon Steel"); p.box(10, 10, 10); p.sketch("Front").rect(20, 0, 10, 10).id(); var a = p.extrude(10, { merge: false }).last(); p.sketch("Front").rect(40, 0, 10, 10).id(); var b = p.extrude(10, { merge: false }).last(); p.bodyMaterial(a, "ABS"); p.bodyMaterial(b, "ABS");';
      var r = partDrawing(code, 'Rack'), cols = [{ type: 'item' }, { type: 'partNumber' }, { type: 'description' }, 'Material', 'Mass', { type: 'qty' }];
      r.doc.bom = { show: true, columns: cols };
      var top = DW.compute(r.doc, r.mesh, r.model, { build: r.build }).bom.cells;
      assert(JSON.stringify(top) === JSON.stringify([[1, 'Rack', '50 x 10 x 10', 'Plain Carbon Steel', '9.84 g', 1]]), 'top ' + JSON.stringify(top));
      r.doc.bom.type = 'parts';
      var parts = DW.compute(r.doc, r.mesh, r.model, { build: r.build }).bom.cells;
      assert(JSON.stringify(parts) === JSON.stringify([[1, 'Rack - Boss-Extrude1', '10 x 10 x 10', 'Plain Carbon Steel', '7.80 g', 1], [2, 'Rack - Boss-Extrude2', '10 x 10 x 10', 'ABS', '1.02 g', 2]]), 'parts ' + JSON.stringify(parts));
      return 'top 1 row, parts ' + parts.length + ' rows';
    });
    if (DW && typeof Assembly !== 'undefined') test('assembly BOM: each component’s own material, mass and properties in the columns; Parts only splits the multi-body part; title block MASS is the assembly’s', function () {
      var base = JSON.stringify({ script: 'p.name("Base"); p.material("6061"); p.property("Description", "Base plate"); p.property("Part Number", "BP-100"); p.property("Vendor", "Acme"); p.box(100, 10, 50);' });
      var block = JSON.stringify({ script: 'p.name("Block"); p.material("Brass"); p.box(20, 20, 20);' });
      var twin = JSON.stringify({ script: 'p.name("Twin"); p.material("Plain Carbon Steel"); p.box(10, 10, 10); p.sketch("Front").rect(20, 0, 10, 10).id(); var e = p.extrude(10, { merge: false }).last(); p.bodyMaterial(e, "ABS");' });
      var r = buildAsm('a.name("Rig"); a.property("Description", "Test rig"); a.insert(' + base + ', { fixed: true }); a.insert(' + block + ', { position: [0, 10, 0] }); a.insert(' + block + ', { position: [40, 10, 0] }); a.insert(' + twin + ', { position: [0, 40, 0] });');
      var doc = DW.newDrawing(r.model, { date: '2026-09-26' });
      DW.standard3View(doc, r.mesh, r.model.units);
      doc.bom.columns = [{ type: 'item' }, { type: 'partNumber' }, { type: 'description' }, 'Material', 'Mass', 'Vendor', { type: 'qty' }];
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var want = [[1, 'BP-100', 'Base plate', '6061-T6 (SS)', '135.00 g', 'Acme', 1], [2, 'Block', '20 x 20 x 20', 'Brass', '68.00 g', '', 2], [3, 'Twin', '30 x 10 x 10', 'Plain Carbon Steel', '8.82 g', '', 1]];
      assert(JSON.stringify(sh.bom.cells) === JSON.stringify(want), 'top-level ' + JSON.stringify(sh.bom.cells));
      doc.bom.type = 'parts';
      var sp = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var wantP = want.slice(0, 2).concat([[3, 'Twin - Boss-Extrude1', '10 x 10 x 10', 'Plain Carbon Steel', '7.80 g', '', 1], [4, 'Twin - Boss-Extrude2', '10 x 10 x 10', 'ABS', '1.02 g', '', 1]]);
      assert(JSON.stringify(sp.bom.cells) === JSON.stringify(wantP), 'parts only ' + JSON.stringify(sp.bom.cells));
      // balloons still find their item: a Parts only row of the multi-body part takes the Twin balloon
      DW.autoBalloon(doc, r.model, doc.views.filter(function (v) { return v.role === 'iso'; })[0].id);
      var items = DW.compute(doc, r.mesh, r.model, { build: r.build }).balloons.map(function (b) { return b.item; }).sort();
      assert(JSON.stringify(items) === '[1,2,3]', 'balloons ' + JSON.stringify(items));
      var tb = DW.titleBlock(doc, r.model, { build: r.build });
      assert(tb.title === 'TEST RIG' && tb.mass === '279.82 g' && tb.material === '' && tb.partNo === 'Rig', JSON.stringify(tb));
      return sp.bom.cells.length + ' rows (parts only), ' + tb.mass;
    });
    function det3(R) { return R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]); }
    if (DW && typeof Assembly !== 'undefined' && typeof Materials !== 'undefined') test('pattern / mirror instances keep the seed part\u2019s material (mass properties, BOM Material / Mass columns), also in an exploded view', function () {
      var AS = Assembly;
      var base = JSON.stringify({ script: 'p.name("Base"); p.material("6061"); p.box(100, 10, 50);' });
      var block = JSON.stringify({ script: 'p.name("Block"); p.material("Brass"); p.property("Vendor", "Acme"); p.box(20, 20, 20);' });
      var r = buildAsm('a.name("Rig"); var b = a.insert(' + base + ', { fixed: true }); var k = a.insert(' + block + ', { position: [10, 10, 5], fixed: true });' +
        ' a.linearPattern([k], { direction: { axis: "x" }, spacing: 25, count: 3 });' +
        ' a.mirrorComponents([k], { plane: { plane: "Front" } }); a.mirrorComponents([k], { plane: { plane: "Right" }, oppositeHand: true });' +
        ' a.explode(["Block<2>", "Block<3>"], "y", 30); a.explode(["Block<4>", "Block<5>"], "-y", 15);');
      noErrors(r);
      var blocks = r.model.components.filter(function (c) { return /^Block/.test(c.name); });
      assert(blocks.length === 5 && blocks.filter(function (c) { return c.pattern != null; }).length === 4, 'seed + 4 instances');
      var mp = AS.massProps(r.model, r.build), brass = mp.components.filter(function (c) { return /^Block/.test(c.name); });
      brass.forEach(function (c) {
        assert(c.material === 'Brass', c.name + ' material ' + c.material);
        near(c.density, brass[0].density, 1e-12, c.name + ' density'); nearRel(c.mass, 8000 * brass[0].density, 1e-9, c.name + ' mass');
      });
      near(det3(r.model.components.filter(function (c) { return c.name === 'Block<5>'; })[0].transform.rotation), -1, 1e-12, 'Block<5> is the opposite hand');
      nearRel(brass[4].volume, 8000, 1e-9, 'opposite-hand volume stays positive');
      var cols = [{ type: 'item' }, { type: 'partNumber' }, 'Material', 'Mass', 'Vendor', { type: 'qty' }];
      function cells(res) {
        var doc = DW.newDrawing(res.model, { date: '2026-09-26' });
        DW.standard3View(doc, res.mesh, res.model.units);
        doc.bom.columns = cols;
        return DW.compute(doc, res.mesh, res.model, { build: res.build }).bom.cells;
      }
      var c0 = cells(r);
      assert(JSON.stringify(c0) === JSON.stringify([[1, 'Base', '6061-T6 (SS)', '135.00 g', '', 1], [2, 'Block', 'Brass', '68.00 g', 'Acme', 5]]), 'collapsed BOM ' + JSON.stringify(c0));
      // exploded: same BOM, same masses and centroids (the explode moves bodies, not transforms)
      AS.setExploded(r.model, true);
      var bx = AS.rebuild(r.model, r.build.cache), rx = { model: r.model, build: bx, mesh: K.meshFromBody(bx.body) };
      nearVec(bx.explode.offsets[blocks[1].id], [0, 30, 0], 1e-12, 'Block<2> exploded');
      assert(JSON.stringify(cells(rx)) === JSON.stringify(c0), 'exploded BOM ' + JSON.stringify(cells(rx)));
      var mx = AS.massProps(r.model, bx);
      nearRel(mx.mass, mp.mass, 1e-12, 'mass'); nearVec(mx.centroid, mp.centroid, 1e-9, 'centroid (collapsed)');
      assert(mx.components.filter(function (c) { return c.material === 'Brass'; }).length === 5, 'materials when exploded');
      return mp.components.length + ' components, ' + c0.length + ' BOM rows';
    });
  })();

