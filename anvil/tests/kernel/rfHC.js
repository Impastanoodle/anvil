  // ------------------------------------------------------------------ rfHC (2026-11-03, lane realview): appearances
  // RealView's appearance per material (materials.js appearance / appearanceOf / bodyAppearances): every library
  // material has a finish (base colour, metalness, roughness, pattern); the shop's stock reads apart (cold rolled vs hot
  // rolled, brushed stainless, galvanized spangle, aluminium, brass / copper, plastics); a part keeps a colour of its own
  // as the base colour; per-body appearances for multi-body parts.
  group('rfHC');
  if (typeof Materials === 'undefined' || !Materials.appearance) test('rfHC: materials.js has appearances', function () { fail('Materials.appearance is missing'); });
  else (function () {
    var MT = Materials;
    function hex(c) { return /^#[0-9a-f]{6}$/i.test(c); }
    function lum(c) { var n = parseInt(c.slice(1), 16); return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3; }
    test('rfHC: every library material has an appearance (sRGB colour, metalness and roughness in 0..1, pattern 0 / 1 / 2); no material = the satin grey #8c8c8c', function () {
      MT.list().forEach(function (m) {
        var a = MT.appearance(m);
        assert(a && a.name && hex(a.color), m.name + ' colour ' + (a && a.color));
        assert(a.metalness >= 0 && a.metalness <= 1 && a.roughness > 0 && a.roughness <= 1 && [0, 1, 2].indexOf(a.pattern) >= 0, m.name + ' finish ' + JSON.stringify(a));
        assert(m.metal ? a.metalness >= 0.4 : a.metalness === 0, m.name + ' metal / plastic');
      });
      var none = MT.appearance(null);
      assert(none.color === '#8c8c8c' && none.metalness < 0.2, 'no material: ' + JSON.stringify(none));
      assert(MT.appearanceOf(K.newModel()).color === '#8c8c8c', 'a new part');
      return MT.list().length + ' materials';
    });
    test('rfHC: the shop\'s stock reads apart: hot rolled darker and rougher than cold rolled, stainless brushed, galvanized spangled, aluminium brighter than steel, brass warm, plastics not metal', function () {
      var crs = MT.appearance('cold rolled'), hr = MT.appearance('a36'), ss = MT.appearance('304'), ss6 = MT.appearance('316'), gal = MT.appearance('galvanized');
      var al = MT.appearance('6061'), al5 = MT.appearance('5052'), br = MT.appearance('Brass'), cu = MT.appearance('Copper'), abs = MT.appearance('ABS'), pcs = MT.appearance('Plain Carbon Steel');
      assert(MT.find('cold rolled').name === 'AISI 1018 Steel, cold rolled' && MT.find('HRPO').name === 'ASTM A36 Steel' && MT.find('galvanised').name === 'Galvanized Steel', 'aliases');
      assert(lum(hr.color) < lum(crs.color) - 30 && hr.roughness > crs.roughness + 0.2, 'hot rolled darker, matte: ' + hr.color + ' / ' + crs.color);
      assert(pcs.color === crs.color, 'plain carbon steel looks cold rolled');
      assert(ss.pattern === 1 && ss6.pattern === 1 && al5.pattern === 1 && gal.pattern === 2 && al.pattern === 0, 'patterns');
      assert(lum(al.color) > lum(crs.color) && ss.metalness > 0.85, 'aluminium brighter than steel, stainless metal');
      var rgb = function (c) { var n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
      [br, cu].forEach(function (a) { var c = rgb(a.color); assert(c[0] > c[2] + 60, a.name + ' warm ' + a.color); });
      var s = rgb(crs.color); assert(s[2] >= s[0], 'steel may take a cool blue-grey (solids may carry blue): ' + crs.color);
      assert(abs.metalness === 0 && abs.color === MT.find('ABS').color && MT.appearance('Acrylic (PMMA)').roughness < abs.roughness, 'plastics: own colour, glossy acrylic');
      return 'CRS ' + crs.color + ', HR ' + hr.color + ', 304 ' + ss.color;
    });
    test('rfHC: appearanceOf keeps a colour of the part\'s own (p.color) with the material\'s finish; bodyAppearances: per body for body materials, per component in assemblies, null for a plain part', function () {
      var r = build('p.units("in");\np.material("6061");\np.box(2, 1, 0.5);\n');
      var a = MT.appearanceOf(r.model);
      assert(a.color === MT.appearance('6061').color && a.metalness === MT.appearance('6061').metalness, 'material appearance');
      r.model.color = '#aa3322';
      a = MT.appearanceOf(r.model);
      assert(a.color === '#aa3322' && a.metalness === MT.appearance('6061').metalness, 'own colour, material finish: ' + JSON.stringify(a));
      assert(MT.bodyAppearances(r.model, r.build) === null, 'a plain part: null');
      var two = build('p.units("in");\np.material("Plain Carbon Steel");\np.box(2, 1, 0.5, { name: "A" });\np.box(1, 1, 1, { at: [3, 0, 0], merge: false, name: "B" });\n');
      var fb = two.model.features.filter(function (f) { return f.name === 'B'; })[0] || two.model.features[two.model.features.length - 1];
      MT.applyToBody(two.model, fb.id, 'AISI 304');
      var list = MT.bodyAppearances(two.model, two.build);
      assert(list && list.length === 2, 'two bodies: ' + (list && list.length));
      var keys = list.map(MT.appearanceKey);
      assert(keys[0] !== keys[1] && keys.indexOf(MT.appearanceKey(MT.appearance('AISI 304'))) >= 0 && keys.indexOf(MT.appearanceKey(MT.appearance('Plain Carbon Steel'))) >= 0, 'steel and stainless: ' + keys.join(' / '));
      var asm = { type: 'assembly', components: [{ source: { a: 1 } }, { source: { b: 2 } }] };
      var cache = {}; cache[JSON.stringify({ a: 1 })] = { model: { material: 'Brass', color: MT.find('Brass').color } }; cache[JSON.stringify({ b: 2 })] = { model: {} };
      var al = MT.bodyAppearances(asm, { cache: cache });
      assert(al.length === 2 && al[0].color === MT.appearance('Brass').color && al[1].color === '#8c8c8c', 'components: ' + JSON.stringify(al));
      return 'ok';
    });
  })();
