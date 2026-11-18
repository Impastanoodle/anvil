  // --- rfKO (lane insertbends3): Insert Bends on OpenCascade as on Anvil (kernel/rfKJ.js): the 10° drafted 6 × 4 × 2
  // tray ripped by Insert Bends' Rip Parameters (volume within 1e-6 of Anvil's, flat to 1e-9), Reverse direction (the
  // flat mirrored, notes UP), the one-sided fillets refused with Anvil's message, the R 0 round taken ---
  var KO_TN = Math.tan(10 * Math.PI / 180), KO_TRAY = 'p.units("in");\np.sketch("Top").rect(0, 0, 6, 4).end().extrude(2, { draft: 10, draftOutward: true });\np.shell(0.0747, [[3, 2, -2]]);\n';
  var KO_RIPS = JSON.stringify([[-KO_TN, 1, KO_TN], [6 + KO_TN, 1, KO_TN], [6 + KO_TN, 1, -4 - KO_TN], [-KO_TN, 1, -4 - KO_TN]].map(function (p) { return p.map(function (x) { return Math.round(x * 1e6) / 1e6; }); }));
  var KO_U = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 2], [1.94, 2], [1.94, 0.06], [0.06, 0.06], [0.06, 2], [0, 2]]).end().extrude(4);\n', KO_IB = 'p.insertBends([1, 0, 2], { radius: 0.06, kFactor: 0.5 });\n';
  var KO_CASES = [
    { name: 'drafted tray 6 × 4 × 2 (10°, 14 ga, R .06, K .44), corners ripped by Insert Bends', code: KO_TRAY + 'p.insertBends([3, 0, -2], { radius: 0.06, kFactor: 0.44, ripEdges: ' + KO_RIPS + ', gap: 0.03 });\n', bends: 4 },
    { name: 'the same tray, Reverse direction (the flat on the floor\'s inside face)', code: KO_TRAY + 'p.insertBends([3, 0, -2], { radius: 0.06, kFactor: 0.44, ripEdges: ' + KO_RIPS + ', gap: 0.03, reverse: true });\n', bends: 4, up: true },
    { name: 'U channel, outside rounds of T over sharp insides: two R 0 bends', code: KO_U + 'p.fillet(0.06, [[0, 0, 2], [2, 0, 2]]);\n' + KO_IB, bends: 2 },
    { name: 'U channel, inside fillets only: refused (not one thickness)', code: KO_U + 'p.fillet(0.06, [[0.06, 0.06, 2], [1.94, 0.06, 2]]);\n' + KO_IB, refused: /not one thickness/ },
    { name: 'U channel, outside fillets R .12 only: refused (not one thickness)', code: KO_U + 'p.fillet(0.12, [[0, 0, 2], [2, 0, 2]]);\n' + KO_IB, refused: /not one thickness/ }
  ];
  for (var ko = 0; ko < KO_CASES.length; ko++) {
    var kc = KO_CASES[ko], kn = 'rfKO Insert Bends on OpenCascade = Anvil: ' + kc.name;
    try {
      var tko = performance.now(), whyKo = [], mko = K.newModel('T'); K.runScript(mko, kc.code);
      var bko = K.rebuild(mko), meko = K.meshFromBody(bko.body), fid = mko.features[mko.features.length - 1].id;
      var rko = await occt(JSON.parse(JSON.stringify(mko)), { noCache: true }), st = rko.status[fid] || '';
      if (kc.refused) {
        var aErr = bko.errors[fid] || '';
        if (!kc.refused.test(aErr)) whyKo.push('Anvil: ' + (aErr || 'built'));
        if (st !== 'error: ' + aErr) whyKo.push('OpenCascade: ' + st + ' (Anvil: ' + aErr + ')');
        row(whyKo.length ? 'bad' : 'ok', kn, whyKo.join('\n') || 'both: ' + aErr.slice(0, 120) + '…', performance.now() - tko);
      } else {
        if (Object.keys(bko.errors).length) whyKo.push('Anvil errors ' + JSON.stringify(bko.errors));
        if (st !== 'ok') whyKo.push('OpenCascade: ' + st);
        var vA = K.massProps(meko, 1).volume;
        if (!(Math.abs(rko.volume - vA) <= 1e-6 * vA)) whyKo.push('volume ' + rko.volume + ' vs Anvil ' + vA);
        var obo = OcctKernel.toBuild(rko, bko, meko, null, CSG, K), omo = K.meshFromBody(obo.body);
        var flA = K.flatPattern(mko, bko, meko), flO = K.flatPattern(mko, obo, omo);
        if (Math.abs(flA.size[0] - flO.size[0]) > 1e-9 || Math.abs(flA.size[1] - flO.size[1]) > 1e-9) whyKo.push('flat ' + flO.size + ' vs Anvil ' + flA.size);
        if (flO.bends.length !== kc.bends || flO.loops.length !== 1) whyKo.push(flO.bends.length + ' bends, ' + flO.loops.length + ' loops');
        if (!flO.bends.every(function (q) { return /^UP/.test(q.label) === !!kc.up; })) whyKo.push('notes ' + flO.bends.map(function (q) { return q.label; }).join(', '));
        row(whyKo.length ? 'bad' : 'ok', kn, whyKo.join('\n') || 'volume ' + rko.volume.toFixed(6) + ' (d ' + ((rko.volume - vA) / vA).toExponential(1) + '), flat ' + flO.size.map(function (x) { return x.toFixed(4); }).join(' × '), performance.now() - tko);
      }
      counts[whyKo.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', kn, e.message); counts.fail++; }
  }
  // --- end rfKO ---
