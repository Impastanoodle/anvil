  // --- rfQB (lane smflange, 2026-11-18): sheet-metal flanges on OpenCascade. The flat of the OpenCascade-built tray keeps
  // every bend line on metal (a corner relief takes the end of the bend), and a length per edge in one Edge-Flange builds
  // the same solid as separate Edge-Flanges ---
  function rfQBoIn(p, loop) {
    var c = false;
    for (var i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      var a = loop[i], b = loop[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function rfQBoOff(flat) {
    var bad = [];
    flat.bends.forEach(function (b, k) {
      [0.02, 0.98].forEach(function (t) {
        var p = [b.a[0] + (b.b[0] - b.a[0]) * t, b.a[1] + (b.b[1] - b.a[1]) * t], ok = rfQBoIn(p, flat.loops[0]);
        for (var h = 1; h < flat.loops.length; h++) if (rfQBoIn(p, flat.loops[h])) ok = false;
        if (!ok) bad.push('bend ' + k + ' at ' + t);
      });
    });
    return bad;
  }
  var RFQB_CASES = [
    { name: 'mm tray, rect bend reliefs, Tear corner relief: bend lines on metal', code: 'p.units("mm"); p.sheet(1.5, 1.5, 0.5); p.sketch("Top").rect(0, -113.9542, 93.5775, 113.9542).end().baseFlange();\n' +
      'p.flange(36.2558, [[46.78875, 1.5, 0]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
      'p.flange(36.2558, [[46.78875, 1.5, 113.9542]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
      'p.flange(36.2558, [[0, 1.5, 56.9771]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
      'p.flange(36.2558, [[93.5775, 1.5, 56.9771]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
      'p.cornerRelief([[90.5775, 1.5, 110.9542], [3, 1.5, 3]], null, { reliefType: "tear" });\n' },
    { name: 'inch tray, rect / tear / obround reliefs, Circular corner relief: bend lines on metal', code: 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
      'p.flange(1, [[4, 0.06, 0]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
      'p.flange(1, [[4, 0.06, 6]], { position: "inside", lengthRef: "outer", relief: "tear" });\n' +
      'p.flange(1, [[0, 0.06, 3]], { position: "inside", lengthRef: "outer", relief: "obround" });\n' +
      'p.flange(1, [[8, 0.06, 3]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
      'p.cornerRelief([[7.88, 0.06, 5.88], [0.12, 0.06, 0.12]], null, { reliefType: "circular" });\n' }
  ];
  for (var qbc of RFQB_CASES) {
    try {
      var tqb = performance.now(), mqb = K.newModel('T'); K.runScript(mqb, qbc.code);
      var aqb = K.rebuild(JSON.parse(JSON.stringify(mqb))), meshQb = K.meshFromBody(aqb.body), whyQB = [];
      if (Object.keys(aqb.errors).length) whyQB.push('Anvil errors ' + JSON.stringify(aqb.errors));
      var rqb = await occt(JSON.parse(JSON.stringify(mqb)), { noCache: true });
      if (rqb.unsupported || !rqb.ok) whyQB.push('OpenCascade did not build every feature: ' + (rqb.unsupported || JSON.stringify(rqb.status)));
      if (!rqb.valid) whyQB.push('invalid solid');
      var fqa = K.flatPattern(mqb, aqb, meshQb), fqo = null;
      if (!whyQB.length) {
        var oqb = OcctKernel.toBuild(rqb, aqb, meshQb, null, CSG, K);
        fqo = K.flatPattern(mqb, oqb, K.meshFromBody(oqb.body));
        var offO = rfQBoOff(fqo), offA = rfQBoOff(fqa);
        if (offO.length) whyQB.push('OpenCascade flat: bend lines off the metal: ' + offO.join(', '));
        if (offA.length) whyQB.push('Anvil flat: bend lines off the metal: ' + offA.join(', '));
        if (fqo.bends.length !== fqa.bends.length) whyQB.push('bends ' + fqo.bends.length + ' / Anvil ' + fqa.bends.length);
      }
      row(whyQB.length ? 'bad' : 'ok', 'rfQB, OpenCascade = Anvil: ' + qbc.name, whyQB.join('\n') || ('flat ' + fqo.size.map(function (v) { return v.toFixed(4); }).join(' x ') + ', ' + fqo.bends.length + ' bends on metal'), performance.now() - tqb);
      counts[whyQB.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfQB, OpenCascade = Anvil: ' + qbc.name, e.message); counts.fail++; }
  }
  // a length per edge: one Edge-Flange with lengths = three Edge-Flanges on OpenCascade (volume, flat size 1e-9); Material
  // Inside with butt corners between unequal walls: valid, OpenCascade's volume = Anvil's
  var RFQB_HEAD = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
  var RFQB_LEN = [
    { name: 'lengths 1 / 1.5 / .75 in one Edge-Flange = three Edge-Flanges', code: RFQB_HEAD + 'p.flange(1, [[3, 0.06, 0], [6, 0.06, 2], [3, 0.06, 4]], { lengths: { 1: 1.5, 2: 0.75 } });\n',
      same: RFQB_HEAD + 'p.flange(1, [[3, 0.06, 0]]);\np.flange(1.5, [[6, 0.06, 2]]);\np.flange(0.75, [[3, 0.06, 4]]);\n' },
    { name: 'lengths 1 / 1.5 / .75, Material Inside, butt corners between unequal walls', code: RFQB_HEAD + 'p.flange(1, [[3, 0.06, 0], [6, 0.06, 2], [3, 0.06, 4]], { position: "inside", lengthRef: "outer", lengths: { 1: 1.5, 2: 0.75 } });\n' }
  ];
  for (var qbl of RFQB_LEN) {
    try {
      var tql = performance.now(), whyQL = [], volsQL = [], flatsQL = [];
      for (var src of qbl.same ? [qbl.code, qbl.same] : [qbl.code]) {
        var mql = K.newModel('T'); K.runScript(mql, src);
        var aql = K.rebuild(JSON.parse(JSON.stringify(mql))), meshQl = K.meshFromBody(aql.body), avql = K.massProps(meshQl, 1).volume;
        if (Object.keys(aql.errors).length) whyQL.push('Anvil errors ' + JSON.stringify(aql.errors));
        var rql = await occt(JSON.parse(JSON.stringify(mql)), { noCache: true });
        if (rql.unsupported || !rql.ok) { whyQL.push('OpenCascade did not build every feature: ' + (rql.unsupported || JSON.stringify(rql.status))); break; }
        if (!rql.valid) whyQL.push('invalid solid');
        if (!(Math.abs(rql.volume - avql) <= 1e-6 * avql)) whyQL.push('OpenCascade volume ' + rql.volume + ' vs Anvil ' + avql);
        var oql = OcctKernel.toBuild(rql, aql, meshQl, null, CSG, K), fql = K.flatPattern(mql, oql, K.meshFromBody(oql.body));
        if (rfQBoOff(fql).length) whyQL.push('bend lines off the metal: ' + rfQBoOff(fql).join(', '));
        volsQL.push(rql.volume); flatsQL.push(fql.size);
      }
      if (qbl.same && volsQL.length === 2) {
        if (!(Math.abs(volsQL[0] - volsQL[1]) <= 1e-9 * volsQL[1])) whyQL.push('volume ' + volsQL[0] + ' vs three flanges ' + volsQL[1]);
        [0, 1].forEach(function (k) { if (Math.abs(flatsQL[0][k] - flatsQL[1][k]) > 1e-9) whyQL.push('flat ' + 'xy'[k] + ' ' + flatsQL[0][k] + ' vs ' + flatsQL[1][k]); });
      }
      row(whyQL.length ? 'bad' : 'ok', 'rfQB, OpenCascade: ' + qbl.name, whyQL.join('\n') || ('volume ' + volsQL[0].toFixed(6) + ', flat ' + flatsQL[0].map(function (v) { return v.toFixed(4); }).join(' x ')), performance.now() - tql);
      counts[whyQL.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfQB, OpenCascade: ' + qbl.name, e.message); counts.fail++; }
  }
  // the sheet thickness set after the features (model.sheet): OpenCascade builds the Base Flange at it too
  try {
    var tqt = performance.now(), whyQT = [], FLQ = 'p.flange(1, [[3, 0.06, 0]], { position: "inside", lengthRef: "outer" });\n';
    var mqt = K.newModel('T'); K.runScript(mqt, RFQB_HEAD + FLQ);
    mqt.sheet = K.makeSheet(Object.assign({}, mqt.sheet, { thickness: 0.075 }));
    var mqw = K.newModel('T'); K.runScript(mqw, 'p.units("in");\np.sheet(0.075, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' + FLQ.replace('0.06, 0', '0.075, 0'));
    var rqt = await occt(JSON.parse(JSON.stringify(mqt)), { noCache: true }), rqw = await occt(JSON.parse(JSON.stringify(mqw)), { noCache: true });
    if (!rqt.ok || !rqw.ok || !rqt.valid) whyQT.push('OpenCascade: ' + JSON.stringify(rqt.status) + ' valid ' + rqt.valid);
    else if (!(Math.abs(rqt.volume - rqw.volume) <= 1e-9 * rqw.volume)) whyQT.push('volume with model.sheet .075 ' + rqt.volume + ', built at .075 ' + rqw.volume);
    row(whyQT.length ? 'bad' : 'ok', 'rfQB, OpenCascade: the Base Flange follows a new sheet thickness', whyQT.join('\n') || ('volume ' + rqt.volume.toFixed(6)), performance.now() - tqt);
    counts[whyQT.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfQB, OpenCascade: the Base Flange follows a new sheet thickness', e.message); counts.fail++; }
  // --- end rfQB ---
