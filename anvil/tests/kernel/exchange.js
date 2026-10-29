  // ------------------------------------------------------------------ exchange: STEP / 3MF / OBJ / STL (exchange.js)
  (function () {
    group('exchange: STEP / 3MF / OBJ / STL');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function needX() { if (!X) fail('exchange.js is not loaded (Exchange is undefined)'); }
    function importedVolume(res) { return res.solids.reduce(function (s, x) { return s + X.signedVolume(x.positions, x.triangles); }, 0); }
    // exact volume of an import: its solids as an Imported feature, measured by massProps (curved STEP faces carry their
    // surface records, so a cylinder measures πr²h; mesh formats stay polygonal)
    function importedExact(res) {
      var b = K.rebuild(X.newPartFromImport(res));
      return (b.bodies && b.bodies.length ? b.bodies : [b.body]).reduce(function (s, body) { return s + K.massProps(K.meshFromBody(body), 1).volume; }, 0);
    }
    function importedBox(res) {
      var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      res.solids.forEach(function (sol) { for (var i = 0; i < sol.positions.length; i += 3) for (var a = 0; a < 3; a++) { min[a] = Math.min(min[a], sol.positions[i + a]); max[a] = Math.max(max[a], sol.positions[i + a]); } });
      return { min: min, max: max };
    }
    function sameBox(res, bbox, label) { var b = importedBox(res); nearVec(b.min, bbox.min, 1e-6, label + ' bbox min'); nearVec(b.max, bbox.max, 1e-6, label + ' bbox max'); }
    function exampleByName(n) { var ex = AnvilExamples.filter(function (e) { return e.name === n; })[0]; if (!ex) fail('no example ' + n); return ex; }
    function fixture(name) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'fixtures/' + name, false);
      xhr.send();
      if (xhr.status !== 200) fail('fixture ' + name + ': HTTP ' + xhr.status);
      return xhr.responseText;
    }
    var PARTS = ['Plate with bolt holes', 'L-bracket', 'Bushing', 'Two-body clamp', 'Hex nut', 'Mug'];
    // lane FH2 (2026-10-29): the Mug's swept handle now carries torus records (the sweep along the arc is a partial
    // revolve of the tube); its torus patch is bounded by two meridian circles, a patch shape the STEP writer / reader
    // do not take yet ("plain" patches are cylinders and cones only), so it goes out faceted with the cylinders
    var STEP_FACETED = { 'Hex nut': ['cone'], 'Mug': ['cyl', 'tor'] };
    // the kernel's exact volume with the given surface types measured by their facets (as a STEP export writes them)
    function stepVolume(r, faceted) {
      if (!faceted) return r.mp.volume;
      var b = r.body.clone();
      b.polygons.forEach(function (p) { if (p.surf && faceted.indexOf(p.surf.s.t) >= 0) p.surf = null; });
      return K.massProps(K.meshFromBody(b), 1).volume;
    }
    function count(re, text) { return (text.match(re) || []).length; }

    test('watertight body meshes: every Design Library part body has 0 open edges after T-junction splitting and keeps its volume', function () {
      needX();
      var n = 0;
      PARTS.forEach(function (name) {
        var r = buildExample(exampleByName(name)), doc = X.docParts(r.model, r.build);
        var v = 0;
        doc.parts[0].bodies.forEach(function (b) { assert(b.mesh.openEdges === 0, name + ' ' + b.name + ': ' + b.mesh.openEdges + ' open edges'); v += b.mesh.volume; n++; });
        // bodyMesh is the facets: its volume is the polygonal one (massProps adds the true-curve slivers on top)
        nearRel(v, polyVol(r.mp), 1e-9, name + ' mesh volume');
      });
      return n + ' bodies';
    });

    test('OBJ round trip: volume and bbox of six Design Library parts, one o/g group per body, one vn per planar face, usemtl + mtl colour', function () {
      needX();
      var out = [];
      PARTS.forEach(function (name) {
        var r = buildExample(exampleByName(name)), obj = X.exportOBJ(r.model, r.build), doc = X.docParts(r.model, r.build);
        var nb = doc.parts[0].bodies.length, nf = doc.parts[0].bodies.reduce(function (s, b) { return s + b.mesh.faces.length; }, 0);
        assert(count(/^o /gm, obj) === nb && count(/^g /gm, obj) === nb, name + ': groups ' + count(/^o /gm, obj) + ' vs bodies ' + nb);
        assert(count(/^vn /gm, obj) === nf, name + ': vn ' + count(/^vn /gm, obj) + ' vs faces ' + nf);
        assert(/^mtllib \S+\.mtl$/m.test(obj) && count(/^usemtl /gm, obj) === nb, name + ': mtllib / usemtl');
        var res = X.importFile(name + '.obj', obj);
        assert(res.solids.length === nb, name + ': re-imported ' + res.solids.length + ' solids');
        assert(res.stats.openEdges === 0, name + ': open edges ' + res.stats.openEdges);
        // OBJ is a mesh format: it carries the facets, whose volume is the polygonal one
        nearRel(importedVolume(res), polyVol(r.mp), 1e-6, name + ' volume');
        sameBox(res, r.mp.bbox, name);
        out.push(name + ' ' + fmt(r.mp.volume));
      });
      var mtl = X.exportMTL(buildExample(exampleByName('Bushing')).model);
      assert(/^newmtl Bushing$/m.test(mtl) && /^Kd 0\.54902 0\.54902 0\.54902$/m.test(mtl), 'mtl colour of the default #8c8c8c (rfBU): ' + mtl);
      return out.join(', ');
    });

    test('3MF package: stored zip with [Content_Types].xml, _rels/.rels, 3D/3dmodel.model (CRC-checked), unit millimeter, one object per body; round trip volume and bbox', function () {
      needX();
      var out = [];
      PARTS.forEach(function (name) {
        var r = buildExample(exampleByName(name)), bytes = X.export3MF(r.model, r.build);
        assert(bytes instanceof Uint8Array && bytes[0] === 0x50 && bytes[1] === 0x4B, name + ': zip signature');
        var files = X.unzip(bytes), names = Object.keys(files).filter(function (k) { return k !== 'deflated'; }).sort();
        assert(names.join('|') === '3D/3dmodel.model|[Content_Types].xml|_rels/.rels', 'entries ' + names.join('|'));
        var xml = X.fromUtf8(files['3D/3dmodel.model']);
        assert(/<model unit="millimeter"[^>]*xmlns="http:\/\/schemas\.microsoft\.com\/3dmanufacturing\/core\/2015\/02"/.test(xml), 'model element');
        assert(/Target="\/3D\/3dmodel\.model"/.test(X.fromUtf8(files['_rels/.rels'])), 'rels target');
        var nb = (r.build.bodies || [r.body]).length;
        assert(count(/<object /g, xml) === nb && count(/<item /g, xml) === nb, name + ': objects ' + count(/<object /g, xml) + ' items ' + count(/<item /g, xml) + ' bodies ' + nb);
        assert(/<base name="[^"]+" displaycolor="#8C8C8CFF"\/>/.test(xml), 'basematerials colour (rfBU: the neutral grey default)');
        var res = X.importFile(name + '.3mf', bytes);
        // 3MF is a mesh format: it carries the facets, whose volume is the polygonal one
        nearRel(importedVolume(res), polyVol(r.mp), 1e-6, name + ' volume');
        sameBox(res, r.mp.bbox, name);
        out.push(name + ' ' + (bytes.length / 1024).toFixed(0) + ' KB');
      });
      // the CRC32 of the zip's central directory matches the data (standard check value)
      assert(X.crc32(X.utf8('123456789')) === 0xCBF43926, 'crc32 check value');
      return out.join(', ');
    });

    test('STEP AP214 export: header, units, one MANIFOLD_SOLID_BREP per body, planar ADVANCED_FACEs, every EDGE_CURVE used by exactly two ORIENTED_EDGEs, product named after the part; round trip volume and bbox', function () {
      needX();
      var out = [];
      PARTS.forEach(function (name) {
        var r = buildExample(exampleByName(name)), step = X.exportSTEP(r.model, r.build), nb = (r.build.bodies || [r.body]).length;
        assert(/^ISO-10303-21;/.test(step) && /FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN \{ 1 0 10303 214 1 1 1 1 \}'\)\);/.test(step) && /END-ISO-10303-21;\s*$/.test(step), name + ': header / trailer');
        assert(/\(LENGTH_UNIT\(\)NAMED_UNIT\(\*\)SI_UNIT\(\.MILLI\.,\.METRE\.\)\)/.test(step), 'mm unit');
        assert(count(/=MANIFOLD_SOLID_BREP\(/g, step) === nb && count(/=CLOSED_SHELL\(/g, step) === nb, name + ': solids');
        // true curves: a face is on a PLANE or on one of the analytic surfaces (holes, bosses, the bushing's bores)
        assert(count(/=ADVANCED_FACE\(/g, step) === count(/=PLANE\(/g, step) + count(/=(CYLINDRICAL|CONICAL|SPHERICAL|TOROIDAL)_SURFACE\(/g, step), 'every face on a plane or an analytic surface');
        assert(step.indexOf('PRODUCT(\'' + r.model.name + '\'') >= 0, name + ': product name ' + r.model.name);
        var st = X.parseStep(step), uses = {};
        Object.keys(st.ents).forEach(function (id) { var e = st.ents[id]; if (e.t === 'ORIENTED_EDGE') uses[e.a[3].r] = (uses[e.a[3].r] || 0) + 1; });
        var ecs = Object.keys(st.ents).filter(function (id) { return st.ents[id].t === 'EDGE_CURVE'; });
        ecs.forEach(function (id) { assert(uses[id] === 2, name + ': EDGE_CURVE #' + id + ' used ' + uses[id] + ' times'); });
        var res = X.importFile(name + '.step', step);
        assert(res.solids.length === nb, name + ': re-imported ' + res.solids.length + ' solids');
        assert(res.stats.openEdges === 0, name + ': open edges ' + res.stats.openEdges);
        // STEP round trip keeps the true surfaces: the re-imported part measures the exact massProps volume, less the
        // slivers of faces the file keeps faceted (STEP_FACETED: the Hex nut's chamfer cone meets the flats in
        // hyperbolas, the Mug's outer cylinder meets the swept handle; neither boundary is circles and rulings)
        nearRel(importedExact(res), stepVolume(r, STEP_FACETED[name]), 1e-9, name + ' volume');
        sameBox(res, r.mp.bbox, name);
        out.push(name + ' ' + count(/=ADVANCED_FACE\(/g, step) + ' faces');
      });
      return out.join(', ');
    });

    test('assemblies: Pinned plate STEP has 4 NEXT_ASSEMBLY_USAGE_OCCURRENCEs over 3 part products (Pin shared) with placements; 3MF has 4 build items with transforms; OBJ 4 groups; all three re-import to the solved volume and bbox', function () {
      needX();
      var r = buildExample(exampleByName('Pinned plate assembly')), m = r.model, b = r.build;
      var step = X.exportSTEP(m, b);
      assert(count(/=NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g, step) === 4, 'NAUO count');
      assert(count(/=PRODUCT\(/g, step) === 4 && /PRODUCT\('Pinned Plate'/.test(step) && /PRODUCT\('Pin'/.test(step), 'products: root + Plate / Pin / Cap');
      assert(count(/=MANIFOLD_SOLID_BREP\(/g, step) === 3, 'one B-rep per part, not per instance');
      assert(count(/ITEM_DEFINED_TRANSFORMATION/g, step) === 4 && count(/=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION\(/g, step) === 4, 'placements');
      var rs = X.importFile('asm.step', step);
      assert(rs.solids.length === 4, 'STEP instances ' + rs.solids.map(function (s) { return s.name; }).join(','));
      assert(rs.solids.map(function (s) { return s.name; }).join(',') === 'Plate,Pin<1>,Pin<2>,Cap', 'instance names ' + rs.solids.map(function (s) { return s.name; }).join(','));
      // STEP keeps the pins' and holes' cylinders: exact; 3MF / OBJ carry facets: the polygonal volume
      nearRel(importedExact(rs), r.mp.volume, 1e-9, 'STEP volume'); sameBox(rs, r.mp.bbox, 'STEP');
      var tmf = X.export3MF(m, b), xml = X.fromUtf8(X.unzip(tmf)['3D/3dmodel.model']);
      assert(count(/<item /g, xml) === 4 && count(/<components>/g, xml) === 3, '3MF items / component objects');
      assert(/<item objectid="\d+" transform="[^"]+" partnumber="Pin&lt;2&gt;"\/>/.test(xml), 'transformed item with part number');
      var r3 = X.importFile('asm.3mf', tmf);
      nearRel(importedVolume(r3), polyVol(r.mp), 1e-6, '3MF volume'); sameBox(r3, r.mp.bbox, '3MF');
      var obj = X.exportOBJ(m, b);
      assert(count(/^o /gm, obj) === 4, 'OBJ groups ' + count(/^o /gm, obj));
      var ro = X.importFile('asm.obj', obj);
      nearRel(importedVolume(ro), polyVol(r.mp), 1e-6, 'OBJ volume'); sameBox(ro, r.mp.bbox, 'OBJ');
      return 'volume ' + fmt(r.mp.volume) + ', STEP ' + (step.length / 1024).toFixed(0) + ' KB';
    });
    test('assemblies with Linear / Circular Component Pattern and Mirror Components (assembly.js): every instance gets its NAUO / 3MF build item / OBJ group at its solved transform; the opposite-hand mirror is its own left-hand part placed by a proper rotation; an exploded view exports the collapsed positions', function () {
      needX();
      if (typeof Assembly === 'undefined') fail('assembly.js is not loaded');
      var AS = Assembly, m = AS.newAssembly('Rig');
      // an asymmetric block (a 4 mm bump at one corner), so a wrongly handed or wrongly placed instance moves its centroid
      AS.runScript(m, 'var b = a.insert({ script: \'p.name("Base"); p.box(100, 10, 50);\' }, { fixed: true });' +
        'var k = a.insert({ script: \'p.name("Block"); p.box(20, 10, 6); p.box(4, 4, 4, { at: [0, 6, 0] });\' }, { position: [10, 10, 5], fixed: true });' +
        'a.linearPattern([k], { direction: { axis: "x" }, spacing: 25, count: 3 });' +
        'a.circularPattern([k], { axis: { axis: "y" }, angle: 90, count: 2 });' +
        'a.mirrorComponents([k], { plane: { plane: "Front" } });' +
        'a.mirrorComponents([k], { plane: { plane: "Right" }, oppositeHand: true });' +
        'a.explode([k, "Block<2>"], "y", 30);');
      var collapsedStep = X.exportSTEP(m, AS.rebuild(m)), collapsed3mf = X.fromUtf8(X.unzip(X.export3MF(m, AS.rebuild(m)))['3D/3dmodel.model']);
      AS.setExploded(m, true);
      var b = AS.rebuild(m);
      assert(b.explode && b.explode.offsets[m.components[1].id][1] === 30, 'shown exploded');
      var names = m.components.map(function (c) { return c.name; });
      assert(names.join() === 'Base<1>,Block<1>,Block<2>,Block<3>,Block<4>,Block<5>,Block<6>', names.join());
      var R6 = m.components[6].transform.rotation;
      assert(R6[0] * (R6[4] * R6[8] - R6[5] * R6[7]) - R6[1] * (R6[3] * R6[8] - R6[5] * R6[6]) + R6[2] * (R6[3] * R6[7] - R6[4] * R6[6]) < 0, 'Block<6> is the opposite hand');
      // what each instance must be: the collapsed world body (explode fraction 0)
      var want = AS.explodedBodies(m, b, null, 0).map(function (body) { var q = K.massProps(K.meshFromBody(body), 1); return { bbox: q.bbox, centroid: q.centroid, volume: q.volume }; });
      function centroid(s) {
        var p = s.positions, t = s.triangles, V = 0, c = [0, 0, 0];
        for (var i = 0; i < t.length; i += 3) {
          var A = [p[t[i] * 3], p[t[i] * 3 + 1], p[t[i] * 3 + 2]], B = [p[t[i + 1] * 3], p[t[i + 1] * 3 + 1], p[t[i + 1] * 3 + 2]], C = [p[t[i + 2] * 3], p[t[i + 2] * 3 + 1], p[t[i + 2] * 3 + 2]];
          var v = (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
          V += v; for (var k = 0; k < 3; k++) c[k] += v * (A[k] + B[k] + C[k]) / 4;
        }
        return c.map(function (x) { return x / V; });
      }
      function check(res, label) {
        assert(res.solids.length === 7, label + ' solids ' + res.solids.length);
        res.solids.forEach(function (s, i) {
          nearRel(X.signedVolume(s.positions, s.triangles), want[i].volume, 1e-9, label + ' ' + names[i] + ' volume (outward)');
          nearVec(centroid(s), want[i].centroid, 1e-6, label + ' ' + names[i] + ' centroid');
          sameBox({ solids: [s] }, want[i].bbox, label + ' ' + names[i]);
        });
      }
      var step = X.exportSTEP(m, b);
      assert(count(/=NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g, step) === 7 && count(/=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION\(/g, step) === 7, 'a NAUO and placement per instance');
      assert(count(/=MANIFOLD_SOLID_BREP\(/g, step) === 3 && /PRODUCT\('Block \(opposite hand\)'/.test(step), 'B-reps: Base, Block, and the left-hand Block');
      check(X.importFile('rig.step', step), 'STEP');
      var tmf = X.export3MF(m, b), xml = X.fromUtf8(X.unzip(tmf)['3D/3dmodel.model']);
      var items = xml.match(/<item [^>]*>/g) || [];
      assert(items.length === 7, '3MF build items ' + items.length);
      items.forEach(function (it) {
        var mt = /transform="([^"]+)"/.exec(it);
        if (!mt) return;
        var a = mt[1].split(' ').map(Number);   // row-vector 4x3: rows m0x, m1x, m2x
        var d = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
        near(d, 1, 1e-9, '3MF item transform determinant (' + it + ')');
      });
      check(X.importFile('rig.3mf', tmf), '3MF');
      check(X.importFile('rig.obj', X.exportOBJ(m, b)), 'OBJ');
      // the explode is display state: the exports are the same as with the assembly collapsed
      function body(t) { return t.replace(/FILE_NAME\([^\n]*\n/, ''); }
      assert(body(step) === body(collapsedStep), 'STEP unchanged by the exploded view');
      assert(xml === collapsed3mf, '3MF unchanged by the exploded view');
      return '7 instances, STEP ' + (step.length / 1024).toFixed(0) + ' KB';
    });

    test('materials in exports (materials.js): the part material and a body material give OBJ usemtl / MTL Kd, 3MF basematerials with a pindex per body, and a STEP colour per solid; STEP product names stay the part name; assembly components carry their part materials', function () {
      needX();
      if (typeof Materials === 'undefined') fail('materials.js is not loaded');
      var r = buildExample(exampleByName('Two-body clamp')), m = r.model;
      Materials.apply(m, '6061-T6 (SS)');
      Materials.applyToBody(m, r.build.bodyFeatures[1], 'Brass');
      var al = Materials.find('6061-T6 (SS)').color, br = Materials.find('Brass').color;
      function kd(c) { var h = c.replace('#', ''); return [0, 2, 4].map(function (i) { return String(Number((parseInt(h.substr(i, 2), 16) / 255).toPrecision(6))); }).join(' '); }
      var mtl = X.exportMTL(m, r.build), obj = X.exportOBJ(m, r.build);
      assert(/^newmtl 6061-T6_SS$/m.test(mtl) && /^newmtl Brass$/m.test(mtl) && mtl.indexOf('Kd ' + kd(al)) >= 0 && mtl.indexOf('Kd ' + kd(br)) >= 0, 'mtl: ' + mtl);
      var um = (obj.match(/^usemtl .*$/gm) || []).join(',');
      assert(um === 'usemtl 6061-T6_SS,usemtl Brass', 'usemtl ' + um);
      var xml = X.fromUtf8(X.unzip(X.export3MF(m, r.build))['3D/3dmodel.model']);
      assert(xml.indexOf('<base name="6061-T6 (SS)" displaycolor="' + al.toUpperCase() + 'FF"/>') >= 0 && xml.indexOf('<base name="Brass" displaycolor="' + br.toUpperCase() + 'FF"/>') >= 0, '3MF bases');
      assert(/<object id="\d+" type="model" name="[^"]+" pid="1" pindex="0">[\s\S]*<object id="\d+" type="model" name="[^"]+" pid="1" pindex="1">/.test(xml), '3MF pindex per body');
      var step = X.exportSTEP(m, r.build);
      assert(count(/=COLOUR_RGB\(/g, step) === 2 && count(/=STYLED_ITEM\(/g, step) === 2, 'STEP colour per solid');
      assert(count(/=PRODUCT\(/g, step) === 1 && step.indexOf("PRODUCT('Two-body clamp','Two-body clamp'") >= 0, 'STEP product name unchanged');
      // no material: part colour only, named after the part
      var plain = buildExample(exampleByName('Bushing'));
      assert(/^newmtl Bushing$/m.test(X.exportMTL(plain.model, plain.build)), 'plain part');
      // an assembly: a component whose part has a material exports it
      var a = buildAsm('a.name("Mat asm"); a.insert({ script: \'p.name("Blk"); p.material("Brass"); p.box(10, 10, 10);\' }, { fixed: true }); a.insert({ script: \'p.name("Cube"); p.box(5, 5, 5);\' }, { position: [20, 0, 0] });');
      var axml = X.fromUtf8(X.unzip(X.export3MF(a.model, a.build))['3D/3dmodel.model']);
      assert(axml.indexOf('<base name="Brass"') >= 0 && axml.indexOf('<base name="Cube"') >= 0, 'assembly bases: ' + axml.split('\n').filter(function (l) { return /<base /.test(l); }).join(' '));
      assert(/^usemtl Brass$/m.test(X.exportOBJ(a.model, a.build)), 'assembly usemtl');
      return 'materials ' + um.replace(/usemtl /g, '');
    });

    test('inch parts: STEP declares CONVERSION_BASED_UNIT INCH and 3MF unit="inch"; importing into a mm part scales by 25.4, into an inch part keeps the numbers, "auto" keeps inches', function () {
      needX();
      var r = build('p.name("Inch block").units("in"); p.sketch("Front").rect(0, 0, 2, 1).extrude(0.5);');
      var step = X.exportSTEP(r.model, r.build);
      assert(/CONVERSION_BASED_UNIT\('INCH',/.test(step) && /LENGTH_MEASURE\(25\.4\)/.test(step), 'inch unit');
      near(importedVolume(X.importFile('b.step', step, { units: 'mm' })), 1 * Math.pow(25.4, 3), 1e-6, 'into mm');
      near(importedVolume(X.importFile('b.step', step, { units: 'in' })), 1, 1e-9, 'into in');
      var auto = X.importFile('b.step', step, { units: 'auto' });
      assert(auto.units === 'in', 'auto units ' + auto.units);
      var tmf = X.export3MF(r.model, r.build);
      assert(/<model unit="inch"/.test(X.fromUtf8(X.unzip(tmf)['3D/3dmodel.model'])), '3MF inch');
      near(importedVolume(X.importFile('b.3mf', tmf)), Math.pow(25.4, 3), 1e-6, '3MF into mm');
      return 'ok';
    });

    test('STEP import of files written by OpenCascade 8.0 (fixtures): a planar block with a slot and a notch (27875), and a 3-component assembly with its own NAUO / placement layout (69600)', function () {
      needX();
      var blk = X.importFile('occ-block.step', fixture('occ-block.step'));
      assert(blk.solids.length === 1 && blk.stats.openEdges === 0 && !blk.warnings.length, 'block: ' + blk.solids.length + ' solids, ' + blk.stats.openEdges + ' open, ' + blk.warnings.join('|'));
      nearRel(importedVolume(blk), 27875, 1e-9, 'block volume');
      sameBox(blk, { min: [0, 0, 0], max: [50, 30, 20] }, 'block');
      var asm = X.importFile('occ-distance-angle.step', fixture('occ-distance-angle.step'));
      assert(asm.solids.map(function (s) { return s.name; }).join(',') === 'Base,Block,Bar', 'names ' + asm.solids.map(function (s) { return s.name; }).join(','));
      nearRel(importedVolume(asm), 69600, 1e-9, 'assembly volume');
      var ref = buildExample(exampleByName('Distance and angle mates'));
      sameBox(asm, ref.mp.bbox, 'assembly (the solved placements, 30° bar included)');
      return blk.stats.faces + ' + ' + asm.stats.faces + ' faces';
    });

    test('STEP import: FACETED_BREP of POLY_LOOPs in centimetres (a 1 cm cube is 1000 mm³), BREP_WITH_VOIDS-free shells oriented outward, and curved faces refused with a clear message', function () {
      needX();
      var cube = ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('cube.step','',(''),(''),'','','');", "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));", 'ENDSEC;', 'DATA;',
        "#1=CARTESIAN_POINT('',(0.,0.,0.));", "#2=CARTESIAN_POINT('',(1.,0.,0.));", "#3=CARTESIAN_POINT('',(1.,1.,0.));", "#4=CARTESIAN_POINT('',(0.,1.,0.));",
        "#5=CARTESIAN_POINT('',(0.,0.,1.));", "#6=CARTESIAN_POINT('',(1.,0.,1.));", "#7=CARTESIAN_POINT('',(1.,1.,1.));", "#8=CARTESIAN_POINT('',(0.,1.,1.));",
        // loops written inward (clockwise seen from outside): the importer turns the shell outward
        "#11=FACE('',(#21));#21=FACE_OUTER_BOUND('',#31,.T.);#31=POLY_LOOP('',(#1,#2,#3,#4));", "#12=FACE('',(#22));#22=FACE_OUTER_BOUND('',#32,.T.);#32=POLY_LOOP('',(#5,#8,#7,#6));",
        "#13=FACE('',(#23));#23=FACE_OUTER_BOUND('',#33,.T.);#33=POLY_LOOP('',(#1,#5,#6,#2));", "#14=FACE('',(#24));#24=FACE_OUTER_BOUND('',#34,.T.);#34=POLY_LOOP('',(#2,#6,#7,#3));",
        "#15=FACE('',(#25));#25=FACE_OUTER_BOUND('',#35,.T.);#35=POLY_LOOP('',(#3,#7,#8,#4));", "#16=FACE('',(#26));#26=FACE_OUTER_BOUND('',#36,.T.);#36=POLY_LOOP('',(#4,#8,#5,#1));",
        "#40=CLOSED_SHELL('',(#11,#12,#13,#14,#15,#16));", "#41=FACETED_BREP('Cube',#40);", '#50=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.CENTI.,.METRE.));', 'ENDSEC;', 'END-ISO-10303-21;'].join('\n');
      var r = X.importFile('cube.stp', cube);
      assert(r.solids.length === 1 && r.solids[0].name === 'Cube', 'solid');
      near(X.signedVolume(r.solids[0].positions, r.solids[0].triangles), 1000, 1e-9, 'cube volume (positive: turned outward)');
      var cyl = cube.replace("#41=FACETED_BREP('Cube',#40);", "#41=MANIFOLD_SOLID_BREP('Cyl',#40);#60=ADVANCED_FACE('',(#21),#61,.T.);#61=CYLINDRICAL_SURFACE('',#62,5.);#62=AXIS2_PLACEMENT_3D('',#1,$,$);").replace("#40=CLOSED_SHELL('',(#11,", "#40=CLOSED_SHELL('',(#60,#11,");
      var msg = '';
      // true curves: cylinders are read now, but only bounded by circles, rulings and seams; this one's POLY_LOOP bound is
      // refused by name, and a B-spline face is still refused outright
      try { X.importFile('cyl.step', cyl); } catch (e) { msg = e.message; }
      assert(/curved faces \(1 CYLINDRICAL_SURFACE \(trimmed by curves other than circles and rulings\)\)/.test(msg) && /planar-face and faceted B-reps, and cylinders, cones, spheres and tori/.test(msg), 'message: ' + msg);
      var bsp = cyl.replace("#61=CYLINDRICAL_SURFACE('',#62,5.);", "#61=B_SPLINE_SURFACE_WITH_KNOTS('',1,1,((#1,#2),(#4,#3)),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.);");
      msg = '';
      try { X.importFile('bsp.step', bsp); } catch (e) { msg = e.message; }
      assert(/curved faces \(1 B_SPLINE_SURFACE_WITH_KNOTS\)/.test(msg), 'B-spline message: ' + msg);
      var notStep = '';
      try { X.importSTEP('solid x\nendsolid'); } catch (e) { notStep = e.message; }
      assert(/Not a STEP file/.test(notStep), notStep);
      return 'ok';
    });

    test('STL import: ASCII from Kernel.exportSTL (float precision, T-junctions) splits the two-body clamp into 2 closed solids; binary STL of the bushing; OBJ with quads, negative indices and groups', function () {
      needX();
      var r = buildExample(exampleByName('Two-body clamp')), stl = K.exportSTL(r.mesh, r.model.name);
      var a = X.importFile('clamp.stl', stl);
      assert(a.solids.length === 2 && a.stats.openEdges === 0, 'ascii: ' + a.solids.length + ' solids, ' + a.stats.openEdges + ' open edges');
      // STL is facets only: the polygonal volume
      nearRel(importedVolume(a), polyVol(r.mp), 1e-6, 'ascii volume');
      var bush = buildExample(exampleByName('Bushing')), p = bush.mesh.positions, nt = p.length / 9;
      var buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
      dv.setUint32(80, nt, true);
      for (var t = 0; t < nt; t++) for (var k = 0; k < 9; k++) dv.setFloat32(84 + t * 50 + 12 + k * 4, p[t * 9 + k], true);
      var bi = X.importFile('bushing.stl', buf);
      assert(bi.format === 'stl' && bi.solids.length === 1 && bi.stats.openEdges === 0, 'binary: ' + bi.solids.length + ' solids, ' + bi.stats.openEdges + ' open');
      nearRel(importedVolume(bi), polyVol(bush.mp), 1e-6, 'binary volume');
      var obj = 'v 0 0 0\nv 2 0 0\nv 2 2 0\nv 0 2 0\nv 0 0 2\nv 2 0 2\nv 2 2 2\nv 0 2 2\no Cube\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf -6 -5 -1 -2\nf 4 1 5 8\n' +
        'v 10 0 0\nv 11 0 0\nv 10 1 0\nv 10 0 1\no Tet\nf 9 11 10\nf 9 10 12\nf 9 12 11\nf 10 11 12\n';
      var o = X.importFile('q.obj', obj);
      assert(o.solids.map(function (s) { return s.name; }).join(',') === 'Cube,Tet', 'groups ' + o.solids.map(function (s) { return s.name; }).join(','));
      near(X.signedVolume(o.solids[0].positions, o.solids[0].triangles), 8, 1e-9, 'cube');
      near(X.signedVolume(o.solids[1].positions, o.solids[1].triangles), 1 / 6, 1e-9, 'tet');
      near(importedVolume(X.importFile('mm.obj', obj, { sourceUnits: 'cm' })), (8 + 1 / 6) * 1000, 1e-6, 'OBJ in cm');
      return 'ascii ' + a.stats.triangles + ' triangles';
    });

    test('earcut with holes: a plate face with four 16-gon holes (two sharing an x) triangulates to its exact area', function () {
      needX();
      function circ(cx, cy, r, n) { var q = []; for (var i = 0; i < n; i++) { var a = -2 * Math.PI * i / n; q.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return q; }
      var P = [[0, 0], [100, 0], [100, 60], [0, 60]], holes = [];
      [[85, 15], [85, 45], [15, 15], [15, 45]].forEach(function (c) { var idx = []; circ(c[0], c[1], 3.3, 16).forEach(function (q) { idx.push(P.length); P.push(q); }); holes.push(idx); });
      var t = X.earcut(P, [0, 1, 2, 3], holes), A = 0;
      for (var i = 0; i < t.length; i += 3) { var a = P[t[i]], b = P[t[i + 1]], c = P[t[i + 2]]; var ar = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; assert(ar > -1e-12, 'triangle ' + i / 3 + ' is clockwise'); A += ar; }
      near(A, 6000 - 4 * 8 * 3.3 * 3.3 * Math.sin(2 * Math.PI / 16), 1e-9, 'area');
      return t.length / 3 + ' triangles';
    });

    test('Imported feature: File ▸ Open of a STEP makes Imported1; a later Cut-Extrude and Boss-Extrude build against it (27875 - 320 + 500), the cache is reused whole, pack / unpack and cacheFromBuild keep it, merge:false keeps a separate body', function () {
      needX();
      var res = X.importFile('occ-block.step', fixture('occ-block.step'));
      var m = X.newPartFromImport(res);
      assert(m.features.length === 1 && m.features[0].type === 'import' && m.features[0].name === 'Imported1' && m.features[0].file === 'occ-block.step', 'feature ' + JSON.stringify(m.features.map(function (f) { return f.name; })));
      assert(typeof m.features[0].solids[0].vertices === 'string', 'solids stored as base64');
      var b0 = K.rebuild(m);
      nearRel(K.massProps(K.meshFromBody(b0.body)).volume, 27875, 1e-9, 'import only');
      assert(b0.bodies.length === 1 && b0.bodyFeatures[0] === m.features[0].id, 'body belongs to Imported1');
      new K.Builder(m).sketch('Front').rect(2, 2, 4, 4).extrude(30, { cut: true, end: 'through' });
      var b1 = K.rebuild(m, b0.cache);
      nearRel(K.massProps(K.meshFromBody(b1.body)).volume, 27875 - 16 * 20, 1e-9, 'after cut');
      new K.Builder(m).sketch('Front', 20).rect(0, 0, 10, 10).extrude(5);
      var b2 = K.rebuild(m, b1.cache), v2 = K.massProps(K.meshFromBody(b2.body)).volume;
      nearRel(v2, 27875 - 320 + 500, 1e-9, 'after boss');
      assert(b2.reused === 3 && b2.bodies.length === 1 && !Object.keys(b2.errors).length, 'reused ' + b2.reused + ', bodies ' + b2.bodies.length + ', errors ' + JSON.stringify(b2.errors));
      var b3 = K.rebuild(m, b2.cache);
      assert(b3.reused === m.features.length, 'unchanged model reuses the whole cache: ' + b3.reused);
      nearRel(K.massProps(K.meshFromBody(K.unpackBuild(K.packBuild(b2, m)).body)).volume, v2, 1e-12, 'pack / unpack');
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m, K.cacheFromBuild(m, b2)).body)).volume, v2, 1e-12, 'cacheFromBuild (imported bodies are not added twice)');
      // a separate cube (merge:false default) stays its own body; merge:true joins the touching block
      var apart = X.newPartFromImport(X.importFile('q.obj', 'v 60 0 0\nv 70 0 0\nv 70 10 0\nv 60 10 0\nv 60 0 10\nv 70 0 10\nv 70 10 10\nv 60 10 10\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n'));
      new K.Builder(apart).box(10, 10, 10);
      var ba = K.rebuild(apart);
      assert(ba.bodies.length === 2, 'separate bodies ' + ba.bodies.length);
      var mm = X.newPartFromImport(res, { merge: true });
      new K.Builder(mm).sketch('Front', 20).rect(0, 0, 10, 10).extrude(5);
      var bm = K.rebuild(mm);
      assert(bm.bodies.length === 1 && mm.features[0].merge === true, 'merged');
      return 'bodies ' + b2.bodies.length + ', reused ' + b3.reused + '/' + m.features.length;
    });

    test('Imported feature script round trip: p.importMesh(...) in the feature\'s place, runScript rebuilds the same volume, the generator is a fixed point; a model without imports writes no importMesh', function () {
      needX();
      var m = X.newPartFromImport(X.importFile('occ-block.step', fixture('occ-block.step')));
      new K.Builder(m).sketch('Front').rect(2, 2, 4, 4).extrude(30, { cut: true, end: 'through' });
      var s1 = K.generateScript(m);
      assert(/^var f1 = p\.importMesh\(\{"name":"Imported1","file":"occ-block\.step","format":"step","units":"mm","solids":\[/m.test(s1), s1.slice(0, 300));
      assert(s1.indexOf('__anvil_import_') < 0, 'no placeholder left');
      var m2 = K.newModel('x');
      K.runScript(m2, s1);
      assert(K.generateScript(m2) === s1, 'fixed point');
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body)).volume, 27875 - 320, 1e-9, 'script volume');
      var plain = build('p.box(10, 10, 10);');
      assert(K.generateScript(plain.model).indexOf('importMesh') < 0, 'plain model');
      var m3 = K.newModel('arr');
      new K.Builder(m3).importMesh({ solids: [{ name: 'Tet', positions: [0, 0, 0, 6, 0, 0, 0, 6, 0, 0, 0, 6], triangles: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }] });
      near(K.rebuild(m3).body.volume(), 36, 1e-9, 'plain arrays accepted');
      assert(m3.features[0].name === 'Imported1', 'default name');
      return s1.split('\n').length + ' lines';
    });

    test('worker.js builds an Imported feature (exchange.js is loaded there) to the same volume as the main thread', function () {
      needX();
      if (typeof Worker === 'undefined') fail('Worker is not available in this browser');
      var m = X.newPartFromImport(X.importFile('occ-block.step', fixture('occ-block.step')));
      new K.Builder(m).sketch('Front').rect(2, 2, 4, 4).extrude(30, { cut: true, end: 'through' });
      var local = K.rebuild(m).body.volume();
      var w = new Worker('../worker.js');
      return new Promise(function (resolve, reject) {
        var timer = null, done = false;
        setTimeout(function () { if (!done) timer = setTimeout(function () { w.terminate(); reject(new Error('worker did not answer within 8 s')); }, 8000); }, 0);
        w.onmessage = function (ev) {
          done = true; clearTimeout(timer); w.terminate();
          var r = ev.data;
          if (r.type !== 'built') { reject(new Error('worker: ' + r.type + ' ' + (r.message || ''))); return; }
          var b = K.unpackBuild(r.build);
          if (Math.abs(b.body.volume() - local) > 1e-6 * local) reject(new Error('worker volume ' + b.body.volume() + ' vs ' + local));
          else resolve('volume ' + fmt(local));
        };
        w.postMessage({ type: 'rebuild', seq: 1, model: JSON.parse(JSON.stringify(m)) });
      });
    });
  })();

