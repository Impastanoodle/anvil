  // --- rfJC (2026-11-05, lane smpm) --- the script side of lane rfIZ's Edge Flange / Hem options: p.flange / p.hem take
  // lengthEnd / lengthVertex / lengthVertexMode, position 'tangentToBend', offset, relief 'tear', reliefRatio, and on a
  // hem miter / miterGap plus the relief fields. Each row builds the part three ways: rfIZ's way (the field set on the
  // feature JSON), through the Builder option, and from Kernel.generateScript of the Builder's model. The three give the
  // same feature fields and the same volume (1e-12).
  (function () {
    group('rfJC: p.flange / p.hem pass the rfIZ options; generateScript writes them; the script round trip rebuilds the same part');
    var T = 0.0598, R = 0.0598, HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\n';
    var PL = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    var LB = HEAD + 'p.sketch("Top").polyline([[0, 0], [4, 0], [4, -2], [2, -2], [2, -3], [0, -3]], true).end().baseFlange();\n';
    var KEYS = ['position', 'lengthEnd', 'lengthVertex', 'lengthVertexMode', 'offset', 'relief', 'reliefWidth', 'reliefDepth', 'reliefRatio', 'miter', 'miterGap', 'hemType'];
    function run(code, patch) {
      var model = K.newModel('rfJC');
      K.runScript(model, code);
      var fl = model.features.filter(function (q) { return q.type === 'flange'; });
      if (patch) Object.keys(patch).forEach(function (k) { fl[fl.length - 1][k] = patch[k]; });
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body);
      return { model: model, errors: b.errors, vol: K.massProps(mesh, model.density).volume, last: fl[fl.length - 1] };
    }
    function pick(f) { var o = {}; KEYS.forEach(function (k) { if (f[k] !== undefined && f[k] !== null && !(k === 'miter' && f[k] === false)) o[k] = f[k]; }); return JSON.stringify(o); }
    // base: the part before the last feature; json: that feature's call with no options + the patch; opts: the same as
    // Builder options (call = 'p.flange(1, edges, ' / 'p.hem(.5, edges, ' with the given text)
    function three(label, base, call, edges, baseOpts, patch, opts) {
      var a = run(base + call + edges + ', ' + JSON.stringify(baseOpts) + ');', patch);
      var all = {}; Object.keys(baseOpts).forEach(function (k) { all[k] = baseOpts[k]; }); Object.keys(opts).forEach(function (k) { all[k] = opts[k]; });
      var b = run(base + call + edges + ', ' + JSON.stringify(all) + ');');
      noErrors({ errors: a.errors }); noErrors({ errors: b.errors });
      assert(pick(a.last) === pick(b.last), label + ': Builder fields ' + pick(b.last) + ' vs JSON ' + pick(a.last));
      near(b.vol, a.vol, 1e-12, label + ': Builder volume');
      var script = K.generateScript(b.model), c = K.newModel('rfJC2');
      K.runScript(c, script);
      var cb = K.rebuild(c), cf = c.features.filter(function (q) { return q.type === 'flange'; });
      noErrors({ errors: cb.errors });
      assert(pick(cf[cf.length - 1]) === pick(b.last), label + ': round trip fields ' + pick(cf[cf.length - 1]) + ' vs ' + pick(b.last));
      near(K.massProps(K.meshFromBody(cb.body), c.density).volume, b.vol, 1e-12, label + ': round trip volume');
      return script.split('\n').filter(function (l) { return /p\.(flange|hem)\(/.test(l); }).pop();
    }
    var E = '[[2, ' + T + ', 2]]';
    test('rfJC: Up To Vertex, normal and parallel (p.flange lengthEnd / lengthVertex / lengthVertexMode)', function () {
      three('normal', PL, 'p.flange(1, ', E, {}, { lengthEnd: 'upToVertex', lengthVertex: [2, 1.5, 2.2] }, { lengthEnd: 'upToVertex', lengthVertex: [2, 1.5, 2.2] });
      return three('parallel 60°', PL, 'p.flange(1, ', E, { angle: 60 }, { lengthEnd: 'upToVertex', lengthVertex: [2, 1.0, 2.2], lengthVertexMode: 'parallel' }, { lengthEnd: 'upToVertex', lengthVertex: [2, 1.0, 2.2], lengthVertexMode: 'parallel' });
    });
    test('rfJC: Tangent to Bend with an Offset of .1 (position, offset)', function () {
      return three('tangent + offset', PL, 'p.flange(1, ', E, { position: 'tangentToBend' }, { offset: { end: 'blind', distance: 0.1 } }, { offset: 0.1 });
    });
    test('rfJC: Custom Relief Type Tear, and Rectangle / Obround with a relief ratio (relief, reliefRatio)', function () {
      var EL = '[[1, ' + T + ', 3]]';
      three('tear', LB, 'p.flange(1, ', EL, {}, { relief: 'tear' }, { relief: 'tear' });
      three('rect ratio .75', LB, 'p.flange(1, ', EL, {}, { relief: 'rect', reliefRatio: 0.75 }, { relief: 'rect', reliefRatio: 0.75 });
      return three('obround ratio .5', LB, 'p.flange(1, ', EL, {}, { relief: 'obround', reliefRatio: 0.5 }, { relief: 'obround', reliefRatio: 0.5 });
    });
    test('rfJC: Hem ▸ Miter Gap on two adjacent edges and a hem\'s Custom Relief (miter, miterGap, relief, reliefRatio)', function () {
      var EH = '[[4, ' + T + ', 1], [2, ' + T + ', 2]]';
      three('mitred hems', PL, 'p.hem(0.5, ', EH, { hemType: 'closed' }, { miter: true, miterGap: 0.01 }, { miter: true, miterGap: 0.01 });
      return three('hem relief', LB, 'p.hem(0.5, ', '[[1, ' + T + ', 3]]', { hemType: 'closed' }, { relief: 'rect', reliefRatio: 0.5 }, { relief: 'rect', reliefRatio: 0.5 });
    });
  })();
