  // --- rfHH (2026-11-03, lane library): the Design Library's own content (library.js, AnvilLibrary). Every hardware
  // size builds to its hand-calculated volume (hex prism + cylinders, threads cosmetic), the curved parts build to their
  // exact (sweep / revolve) volume or a sane range, and each library feature cut into a plate's top face removes
  // area × thickness. ---
  (function () {
    group('rfHH: Design Library hardware, curved parts and library features (library.js)');
    var AL = typeof AnvilLibrary !== 'undefined' ? AnvilLibrary : null;
    function rfHHBuild(code) {
      var model = K.newModel('rfHH');
      K.runScript(model, code);
      var b = K.rebuild(model);
      return { model: model, build: b, errors: b.errors, volume: b.body ? K.massProps(K.meshFromBody(b.body), 1).volume : 0 };
    }
    function rfHHPlate(units) {
      var s = units === 'mm' ? 25.4 : 1, model = K.newModel('rfHH');
      K.runScript(model, 'p.units("' + (units || 'in') + '"); p.box(' + 4 * s + ', ' + 3 * s + ', ' + 0.25 * s + ');');
      return { model: model, s: s, top: K.planeFromFace([0, 1, 0], [0, 0.25 * s, 0]) };
    }
    function rfHHVol(model) { var b = K.rebuild(model); return { v: K.massProps(K.meshFromBody(b.body), 1).volume, errors: b.errors }; }

    test('rfHH: AnvilLibrary loads with its folders, six hardware families, seven curved parts and seven library features', function () {
      assert(AL, 'AnvilLibrary missing (library.js not loaded by the test page)');
      assert(AL.folders.map(function (f) { return f.id; }).join() === 'examples,hardware,features,forming', 'folders ' + AL.folders.map(function (f) { return f.id; }));
      assert(AL.hardware.length === 6 && AL.shapes.length === 7 && AL.features.length === 7, AL.hardware.length + ' / ' + AL.shapes.length + ' / ' + AL.features.length);
      return AL.allParts().length + ' hardware parts';
    });

    test('rfHH: a 1/4-20 x 1 hex bolt (7/16 hex x 5/32 head, Ø.25 x 1 shank, 1/32 point chamfer) is within 0.2 % of the hand calculation', function () {
      var p = AL.part('hexBolt', '1/4-20', '1'), r = rfHHBuild(p.code);
      noErrors(r);
      // head (√3/2)·F²·H + shank π/4·d²·L − chamfer ring π·c²·(d/2 − c/3)
      var hand = Math.sqrt(3) / 2 * 0.4375 * 0.4375 * 0.15625 + Math.PI / 4 * 0.0625 + 0 - Math.PI * Math.pow(1 / 32, 2) * (0.125 - 1 / 96);
      nearRel(r.volume, hand, 2e-3, 'bolt volume');
      assert(r.model.units === 'in' && p.name === 'Hex Bolt 1/4-20 x 1', p.name + ' ' + r.model.units);
      return r.volume.toFixed(6) + ' in³ (hand ' + hand.toFixed(6) + ')';
    });

    test('rfHH: every hardware size and length builds with no errors to its hand volume (1e-3 with the point chamfer, else 1e-5)', function () {
      var worst = 0, bad = [];
      AL.allParts().forEach(function (p) {
        var r = rfHHBuild(p.code), e = Math.abs(r.volume / p.volume - 1);
        if (Object.keys(r.errors).length || !(r.volume > 0) || e > (p.family === 'hexBolt' ? 1e-3 : 1e-5)) bad.push(p.name + ' ' + r.volume + ' vs ' + p.volume + ' ' + JSON.stringify(r.errors));
        worst = Math.max(worst, e);
      });
      assert(!bad.length, bad.slice(0, 4).join('; '));
      return AL.allParts().length + ' parts, worst ' + worst.toExponential(2);
    });

    test('rfHH: the curved parts (sweeps with big radii, helix spring, rolled cover, rounded plate, revolved knob, lofted flare) build to their volume', function () {
      var out = [];
      AL.shapes.forEach(function (s) {
        var r = rfHHBuild(s.code);
        assert(!Object.keys(r.errors).length, s.name + ': ' + JSON.stringify(r.errors));
        if (s.volume != null) nearRel(r.volume, s.volume, s.tolerance || 1e-6, s.name);
        else assert(r.volume > s.range[0] && r.volume < s.range[1], s.name + ' volume ' + r.volume + ' outside ' + s.range);
        out.push(s.name + ' ' + r.volume.toFixed(4));
      });
      return out.join(', ');
    });

    test('rfHH: each library feature on the top face of a 4 × 3 × .25 plate adds a sketch + Cut-Extrude Through All removing area × .25 (turned 30°, off centre)', function () {
      var out = [];
      AL.features.forEach(function (f) {
        var P = rfHHPlate('in'), v0 = rfHHVol(P.model).v, v = AL.featureDefaults(f.id, 1);
        v.x = 1.5; v.y = -1.25; v.angle = 30;
        var made = AL.addFeature(P.model, P.top, f.id, v), r = rfHHVol(P.model);
        assert(!Object.keys(r.errors).length, f.id + ': ' + JSON.stringify(r.errors));
        assert(made.sketch.type === 'sketch' && made.cut.type === 'extrude' && made.cut.cut && made.cut.end === 'through' && made.cut.sketch === made.sketch.id, f.id + ' features');
        var exact = f.id === 'slot' || f.id === 'holePattern' || f.id === 'pemHole';
        nearRel(v0 - r.v, AL.featureArea(f.id, v, 1) * 0.25, exact ? 1e-6 : 1e-3, f.id + ' removed');
        out.push(f.id + ' ' + (v0 - r.v).toFixed(5));
      });
      return out.join(', ');
    });

    test('rfHH: a library feature survives generateScript (plain sketch + cut) and scales to a mm part (defaults × 25.4)', function () {
      var P = rfHHPlate('in'), v = AL.featureDefaults('slot', 1);
      v.x = 2; v.y = -1.5;
      AL.addFeature(P.model, P.top, 'slot', v);
      var a = rfHHVol(P.model).v, m2 = K.newModel('rfHH2');
      K.runScript(m2, K.generateScript(P.model));
      var b = rfHHVol(m2).v;
      nearRel(b, a, 1e-9, 'script round trip');
      near(3 - a, (0.5 * 0.25 + Math.PI * 0.0625 / 4) * 0.25, 1e-9, 'slot .75 x .25 removed');
      var M = rfHHPlate('mm'), vm = AL.featureDefaults('slot', 25.4);
      near(vm.length, 19.05, 1e-9, 'mm length'); near(vm.width, 6.35, 1e-9, 'mm width');
      vm.x = 50; vm.y = -40;
      var v0 = rfHHVol(M.model).v;
      AL.addFeature(M.model, M.top, 'slot', vm);
      nearRel(v0 - rfHHVol(M.model).v, AL.featureArea('slot', vm, 25.4) * 6.35, 1e-6, 'mm slot');
      var pm = AL.featureEntities('pemHole', { x: 0, y: 0, pem: 'S-632 nut' }, 25.4)[0];
      near(pm.r * 2, 0.187 * 25.4, 1e-6, 'PEM hole in mm');
      return 'in ' + (3 - a).toFixed(6) + ', mm ok';
    });

    test('rfHH: library features refuse shapes that cannot be made, in a sentence', function () {
      function why(id, over) { var v = AL.featureDefaults(id, 1); Object.keys(over).forEach(function (k) { v[k] = over[k]; }); try { AL.featureEntities(id, v, 1); return null; } catch (e) { return e.message; } }
      assert(/narrower/.test(why('keyhole', { width: 0.5 })), 'keyhole slot wider than the head');
      assert(/reach out/.test(why('keyhole', { length: 0.1 })), 'keyhole slot inside the head');
      assert(/less than the diameter/.test(why('dhole', { flat: 0.6 })), 'D-hole flat');
      assert(/at most half/.test(why('rectCut', { radius: 0.3 })), 'corner radius');
      assert(/at least the width/.test(why('slot', { length: 0.1 })), 'slot length');
      assert(why('slot', { length: 0.25 }) === null && AL.featureEntities('slot', { x: 0, y: 0, length: 0.25, width: 0.25, angle: 0 }, 1)[0].t === 'circle', 'a slot as long as wide is a hole');
    });
  })();
