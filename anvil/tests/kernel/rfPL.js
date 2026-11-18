  // --- rfPL (2026-11-18, lane asmfeel) --- assemblies as SolidWorks 2024: a Hinge's Angle (with Define angle limit)
  // places the door once, then it swings free inside the limits (edit / script / JSON keep where it is); the BOM's PART
  // NUMBER comes from the part's "Part Number" property and a DESCRIPTION typed in the BOM goes into the part's
  // "Description" property (linked document, embedded copies) or, for a Design Library / script part, into the assembly.
  (function () {
    group('rfPL: Hinge initial angle; BOM part number and editable description');
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is not defined'); }); return; }
    var AS = Assembly;
    function noErr(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function st(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    // the rfIV post and door: the door's angle about y (its far end at (cos t, -sin t) in x, z)
    var POST = 'p.name("Post"); p.box(40, 40, 20); p.cylinder(3, 60, { at: [20, 0, 20] });';
    var DOOR = 'p.name("Door"); p.box(60, 10, 4); p.cylinder(3, 4, { at: [5, 0, 5], cut: true });';
    function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function doorAngle(m, id) { var R = AS.findComponent(m, id).transform.rotation; return Math.atan2(R[2], R[0]) * 180 / Math.PI; }
    function hinged(opts) {
      var m = AS.newAssembly();
      var post = AS.insert(m, { script: POST }, { fixed: true }).id;
      var door = AS.insert(m, { script: DOOR }, { position: [30, 90, 20], rotation: ry(10) }).id;
      var o = { a2: { component: post, face: [5, 20, 5] }, b2: { component: door, face: [30, 0, 8] }, limit: true, min: 0, max: 30,
        a3: { component: post, face: [40, 10, 20] }, b3: { component: door, face: [60, 2, 5] } };
      Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
      var mt = AS.addMate(m, 'hinge', { component: post, cylinder: [23, 40, 20] }, { component: door, cylinder: [8, 2, 5] }, o);
      return { m: m, door: door, mt: mt };
    }
    function swing(h, b, deg) {   // the door's far end pulled round the pin to `deg`, 5 degrees a frame
      var m = h.m, T = AS.findComponent(m, h.door).transform, p = AS.transformPoint(T, [55, 2, 5]), r = Math.hypot(p[0] - 20, p[2] - 20);
      var from = doorAngle(m, h.door), n = Math.max(1, Math.ceil(Math.abs(deg - from) / 5));
      for (var i = 1; i <= n; i++) {
        var a = (from + (deg - from) * i / n) * Math.PI / 180;
        b = AS.rebuild(m, b.cache, { drag: { id: h.door, point: [55, 2, 5], target: [20 + r * Math.cos(-a), p[1], 20 + r * Math.sin(-a)] } });
        noErr(b);
      }
      return b;
    }

    test('rfPL: Hinge Angle 20 with limits 0 .. 30 places a door standing at 10 at 20 once; a drag then swings it free to 28 and a rebuild keeps 28; 1 DOF', function () {
      var h = hinged({ angle: 20 });
      var b = AS.rebuild(h.m);
      noErr(b);
      near(doorAngle(h.m, h.door), 20, 1e-6, 'placed at its angle');
      assert(h.m.mates[0].anglePlaced === true && h.m.mates[0].angle === 20, 'placed once: ' + JSON.stringify(h.m.mates[0]));
      near(AS.hingeAngle(h.m, b.partBuilds, h.m.mates[0]), 20, 1e-6, 'hingeAngle reads it');
      assert(st(b, h.door).dof === 1, 'dof ' + st(b, h.door).dof);
      b = swing(h, b, 28);
      near(doorAngle(h.m, h.door), 28, 1e-4, 'swings free inside the limits');
      b = AS.rebuild(h.m, b.cache);
      noErr(b);
      near(doorAngle(h.m, h.door), 28, 1e-4, 'a rebuild does not put it back to 20');
      b = swing(h, b, 60);
      near(doorAngle(h.m, h.door), 30, 1e-5, 'the maximum still stops it');
      return 'placed 20, swung to 28';
    });

    test('rfPL: Hinge Angle: a new Angle places the door again (setMateValues), the script and JSON round trips keep where it stands, Builder limit.angle', function () {
      var h = hinged({ angle: 20 });
      var b = AS.rebuild(h.m);
      b = swing(h, b, 25);
      AS.setMateValues(h.m.mates[0], { angle: 20 });
      assert(h.m.mates[0].anglePlaced === true, 'the same angle keeps it placed');
      AS.setMateValues(h.m.mates[0], { angle: 5 });
      assert(!h.m.mates[0].anglePlaced, 'a new angle places it again');
      b = AS.rebuild(h.m, b.cache);
      noErr(b);
      near(doorAngle(h.m, h.door), 5, 1e-6, 'placed at 5');
      b = swing(h, b, 12);
      var s = AS.generateScript(h.m);
      assert(/angle: 5/.test(s) && /anglePlaced: true/.test(s), 'written: ' + s.split('\n').filter(function (l) { return /hinge/.test(l); }).join(' / '));
      var m2 = AS.newAssembly();
      AS.runScript(m2, s);
      m2 = JSON.parse(JSON.stringify(m2));
      noErr(AS.rebuild(m2));
      near(doorAngle(m2, m2.components[1].id), 12, 1e-4, 'the round trip keeps 12 (not 5)');
      assert(m2.mates[0].angle === 5 && m2.mates[0].anglePlaced === true, JSON.stringify(m2.mates[0]));
      // Builder: hinge(..., { limit: { a, b, min, max, angle } })
      var m3 = AS.newAssembly();
      AS.runScript(m3, 'var post = a.insert({ script: ' + JSON.stringify(POST) + ' }, { fixed: true });\n' +
        'var door = a.insert({ script: ' + JSON.stringify(DOOR) + ' }, { position: [30, 90, 20], rotation: ' + JSON.stringify(ry(10)) + ' });\n' +
        'a.hinge({ component: post, cylinder: [23, 40, 20] }, { component: door, cylinder: [8, 2, 5] }, { component: post, face: [5, 20, 5] }, { component: door, face: [30, 0, 8] },' +
        ' { limit: { a: { component: post, face: [40, 10, 20] }, b: { component: door, face: [60, 2, 5] }, min: -15, max: 45, angle: -10 } });\n');
      noErr(AS.rebuild(m3));
      near(doorAngle(m3, m3.components[1].id), -10, 1e-6, 'Builder angle -10');
      return 'kept 12 after the round trip';
    });

    test('rfPL: Hinge Angle outside the limits is refused with a reason; without Define angle limit the angle is dropped', function () {
      var h = hinged({ angle: 40 });
      var b = AS.rebuild(h.m);
      assert(b.errors[h.mt.id] && /between the minimum and the maximum/.test(b.errors[h.mt.id]), 'error: ' + JSON.stringify(b.errors));
      var h2 = hinged({ angle: 20, limit: false });
      assert(h2.m.mates[0].angle == null && h2.m.mates[0].anglePlaced == null && !h2.m.mates[0].a3, JSON.stringify(h2.m.mates[0]));
      noErr(AS.rebuild(h2.m));
      near(doorAngle(h2.m, h2.door), 10, 1e-6, 'no limit: the door keeps its 10');
    });

    // ---- BOM
    function partModel(name, props) {
      var m = Kernel.newModel(); Kernel.runScript(m, 'p.name(' + JSON.stringify(name) + '); p.box(10, 10, 2);');
      if (props) m.properties = { custom: props };
      return JSON.parse(JSON.stringify(m));
    }
    test('rfPL: BOM PART NUMBER is the part\'s Part Number property, else its name; a Description typed for embedded copies goes into each copy\'s property', function () {
      if (typeof Materials === 'undefined') fail('materials.js not loaded');
      var m = AS.newAssembly('Bom');
      var br = partModel('Bracket', [{ name: 'Part Number', type: 'Text', value: 'BR-1001' }, { name: 'Description', type: 'Text', value: 'Bracket, 10 ga' }]);
      AS.insert(m, { model: br }, { fixed: true });
      AS.insert(m, { model: br }, { position: [20, 0, 0] });
      AS.insert(m, { model: partModel('Spacer') }, { position: [40, 0, 0] });
      var rows = AS.bom(m, null, { type: 'top' });
      assert(rows.length === 2 && rows[0].partNumber === 'BR-1001' && rows[0].name === 'Bracket' && rows[0].qty === 2 && rows[1].partNumber === 'Spacer', JSON.stringify(rows.map(function (r) { return [r.partNumber, r.name, r.qty]; })));
      assert(rows[0].description === 'Bracket, 10 ga' && rows[0].descriptionIn === 'part', 'description / where: ' + rows[0].description + ' ' + rows[0].descriptionIn);
      var r = AS.setBomDescription(m, rows[0].key, 'Bracket, 10 ga CRS');
      assert(r.ok && r.where === 'part' && r.count === 2, JSON.stringify(r));
      m.components.slice(0, 2).forEach(function (c, i) { assert(Materials.sheetProperty(c.source.model, 'Description') === 'Bracket, 10 ga CRS', 'copy ' + i); });
      rows = AS.bom(m, null, { type: 'top' });
      assert(rows.length === 2 && rows[0].qty === 2 && rows[0].description === 'Bracket, 10 ga CRS', 'one row still: ' + JSON.stringify(rows.map(function (x) { return [x.description, x.qty]; })));
      AS.setBomDescription(m, rows[1].key, 'Spacer .500');
      assert(AS.bom(m, null, { type: 'top' })[1].description === 'Spacer .500', 'a part without the property gets one');
      return rows.map(function (x) { return x.partNumber + ' ' + x.description; }).join(' | ');
    });

    test('rfPL: BOM Description of a linked document is written into it (dirty until saved); a Design Library part\'s is kept in the assembly and goes through the script; empty clears it', function () {
      if (typeof Materials === 'undefined') fail('materials.js not loaded');
      AS.Documents.use(null);
      AS.Documents.put('PL-Plate', partModel('Plate'));
      var m = AS.newAssembly('BomLinks');
      AS.insert(m, { file: 'PL-Plate' }, { fixed: true });
      AS.insert(m, { example: 'Hex nut' }, { position: [30, 0, 0] });
      AS.insert(m, { example: 'Hex nut' }, { position: [50, 0, 0] });
      var rows = AS.bom(m, null, { type: 'top' });
      assert(rows[0].descriptionIn === 'file' && rows[1].descriptionIn === 'assembly' && rows[1].description === 'Hex nut', JSON.stringify(rows.map(function (x) { return [x.description, x.descriptionIn]; })));
      var r = AS.setBomDescription(m, rows[0].key, 'Plate 1/4 A36');
      assert(r.ok && r.where === 'file' && r.file === 'PL-Plate' && AS.Documents.isDirty('PL-Plate'), JSON.stringify(r));
      assert(Materials.sheetProperty(AS.Documents.get('PL-Plate'), 'Description') === 'Plate 1/4 A36', 'in the document');
      var r2 = AS.setBomDescription(m, rows[1].key, 'HEX NUT 1/4-20');
      assert(r2.ok && r2.where === 'assembly' && m.bomDescriptions && m.bomDescriptions[rows[1].key] === 'HEX NUT 1/4-20', JSON.stringify(r2));
      rows = AS.bom(m, null, { type: 'top' });
      assert(rows[0].description === 'Plate 1/4 A36' && rows[1].description === 'HEX NUT 1/4-20' && rows[1].qty === 2, JSON.stringify(rows.map(function (x) { return [x.description, x.qty]; })));
      var s = AS.generateScript(m), m2 = AS.newAssembly();
      AS.runScript(m2, s);
      m2 = JSON.parse(JSON.stringify(m2));
      assert(AS.bom(m2, null, { type: 'top' })[1].description === 'HEX NUT 1/4-20', 'script round trip: ' + s.split('\n').filter(function (l) { return /bomDescription/.test(l); }).join(' / '));
      AS.setBomDescription(m, rows[1].key, '');
      assert(!m.bomDescriptions && AS.bom(m, null, { type: 'top' })[1].description === 'Hex nut', 'cleared: back to the library name');
      AS.Documents.use(null);
      return 'file + assembly';
    });
  })();
