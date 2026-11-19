  // --- rfQR (lane stepflats; kernel side tests/kernel/rfQR.js): the STEP-to-flat corpus written by OpenCascade, as
  // another CAD kernel writes it (planes and cylinders, and NURBS-converted: every face a B-spline surface), read by
  // Anvil as a dumb solid, Insert Bends at the Base Flange's face with the part's T and K: the bends (angle, R), the
  // loops and the blank's area equal Anvil's own flat of the part (test-reports/repros/step-flats-parts.js) ---
  var qrT16 = 0.0598, qrT11 = 0.1196, qrT20 = 0.0359;
  var qrIN = function (T, R, k) { return 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + k + ');\n'; };
  var qrRect = function (W, H) { return 'p.sketch("Top").rect(0, -' + H + ', ' + W + ', ' + H + ').end().baseFlange();\n'; };
  var qrFl4 = function (T, W, H, L, o) { return [[W / 2, T, 0], [W, T, H / 2], [W / 2, T, H], [0, T, H / 2]].map(function (e) { return 'p.flange(' + L + ', [' + JSON.stringify(e) + '], ' + JSON.stringify(o) + ');\n'; }).join(''); };
  var qrHole = function (l, r) { return 'p.sketch("Top")' + l.map(function (c) { return '.circle(' + c[0] + ', ' + (-c[1]) + ', ' + r + ')'; }).join('') + '.end().extrude(1, { cut: true, through: true, both: true });\n'; };
  var qrOpen = function (pts, d) { return 'p.sketch("Front").polyline(' + JSON.stringify(pts) + ', false).end().baseFlange(null, { depth: ' + d + ' });\n'; };
  var qrArea = function (fl) { return fl.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0); };
  var qrBends = function (fl) { return fl.bends.map(function (b) { return (+b.angle).toFixed(3) + '/' + (+b.R).toFixed(5); }).sort().join(' '); };
  var QR_PARTS = [
    ['L bracket 16 ga K .44, holes .2 from the bend', qrIN(qrT16, qrT16, 0.44) + qrRect(4, 2) + 'p.flange(1.5, [[2, ' + qrT16 + ', 0]], {});\n' + qrHole([[1, 0.3], [3, 0.3], [2, 1.5]], 0.125), [2, qrT16, 1.2]],
    ['U channel 1.5 mm K .4, holes', 'p.units("mm");\np.sheet(1.5, 1.5, 0.4);\n' + qrRect(100, 60) + 'p.flange(30, [[50, 1.5, 0], [50, 1.5, 60]], {});\n' + qrHole([[25, 6], [75, 54], [50, 30]], 3), [50, 1.5, 30]],
    ['Z 135 + 45 deg 11 ga K .33', qrIN(qrT11, 0.12, 0.33) + qrOpen([[0, 0], [2, 0], [1, 1], [1, 2.5]], 3), [1, 0, 1.5]],
    ['hat 20 ga', qrIN(qrT20, qrT20, 0.5) + qrOpen([[0, 0], [1, 0], [1, 1.5], [3, 1.5], [3, 0], [4, 0]], 3), [0.5, 0, 1.5]],
    ['tray 16 ga rect relief', qrIN(qrT16, qrT16, 0.44) + qrRect(6, 4) + qrFl4(qrT16, 6, 4, 1, { position: 'inside', relief: 'rect' }), [3, qrT16, 2]],
    ['tray 16 ga tear relief', qrIN(qrT16, qrT16, 0.44) + qrRect(6, 4) + qrFl4(qrT16, 6, 4, 1, { position: 'inside', relief: 'tear' }), [3, qrT16, 2]],
    ['tray 1 mm obround relief', 'p.units("mm");\np.sheet(1, 1, 0.45);\n' + qrRect(150, 100) + qrFl4(1, 150, 100, 25, { position: 'inside', relief: 'obround' }), [75, 1, 50]],
    ['tray 16 ga, butt Closed Corners', qrIN(qrT16, qrT16, 0.5) + qrRect(4, 3) + qrFl4(qrT16, 4, 3, 1, { position: 'inside', lengthRef: 'outer' }) + 'p.closedCorner(' + JSON.stringify([[qrT16 / 2, 0.6, 2 * qrT16], [4 - qrT16 / 2, 0.6, 2 * qrT16], [4 - 2 * qrT16, 0.6, 3 - qrT16 / 2], [qrT16 / 2, 0.6, 3 - 2 * qrT16]]) + ', { cornerType: "butt", gap: 0.01, coplanar: false });\n', [2, qrT16, 1.5]],
    ['closed + open Hems 20 ga', qrIN(qrT20, qrT20, 0.5) + qrRect(4, 3) + 'p.hem(0.375, [[2, ' + qrT20 + ', 0]], { hemType: "closed" });\np.hem(0.375, [[2, ' + qrT20 + ', 3]], { gap: 0.03 });\n', [2, qrT20, 1.5]],
    ['Jog .5 x 1', qrIN(qrT16, qrT16, 0.5) + qrRect(4, 3) + 'p.jog(0.5, 1, [[0, ' + qrT16 + ', 1.5]]);\n', [3, qrT16, 1.5]],
    ['Miter Flange L', qrIN(qrT16, qrT16, 0.5) + qrRect(4, 2) + 'p.sketch("Right").line(0, ' + qrT16 + ', 0, ' + (qrT16 + 1) + ').line(0, ' + (qrT16 + 1) + ', 0.5, ' + (qrT16 + 1) + ').end();\np.miterFlange([[2, ' + qrT16 + ', 0], [0, ' + qrT16 + ', 1]], {});\n', [1, qrT16, 1.3]],
    ['partial flange with rect relief', qrIN(qrT16, qrT16, 0.5) + qrRect(6, 3) + 'p.flange(1, [[3, ' + qrT16 + ', 0]], { position: "inside", relief: "rect", startOffset: 1, endOffset: 1.5 });\n', [3, qrT16, 1.5]],
    ['flange on a slanted edge 11 ga', qrIN(qrT11, 0.12, 0.4) + 'p.sketch("Top").polyline([[0, 0], [4, 0], [3, -2], [0, -2]], true).end().baseFlange();\np.flange(1, [[3.5, ' + qrT11 + ', 1]], {});\n', [1.5, qrT11, 1]],
    ['Cross-Break panel', qrIN(qrT20, qrT20, 0.5) + qrRect(4, 2) + 'p.flange(0.75, [[2, ' + qrT20 + ', 0]], {});\np.crossBreak([1, ' + qrT20 + ', 1], { radius: 0.25, angle: 2 });\n', [1, qrT20, 1]],
    ['flange with a profile (gusset end)', qrIN(qrT16, qrT16, 0.5) + qrRect(6, 3) + 'p.flange(1, [[3, ' + qrT16 + ', 0]], { position: "inside", relief: "rect", startPoint: [0, ' + qrT16 + ', 0], profile: { entities: [{t:"line",x1:0,y1:0,x2:5,y2:0},{t:"line",x1:5,y1:0,x2:3.5,y2:1.5},{t:"line",x1:3.5,y1:1.5,x2:0,y2:1.5},{t:"line",x1:0,y1:1.5,x2:0,y2:0}] } });\n', [3, qrT16, 1.5]],
    ['L bracket 3 mm, Material Inside, holes', 'p.units("mm");\np.sheet(3, 3, 0.5);\n' + qrRect(100, 50) + 'p.flange(40, [[50, 3, 0]], { position: "inside" });\n' + qrHole([[25, 8], [75, 8]], 4), [50, 3, 30]],
    ['U channel 11 ga R .12 K .33, Material Inside', qrIN(qrT11, 0.12, 0.33) + qrRect(6, 3) + 'p.flange(1.25, [[3, ' + qrT11 + ', 0], [3, ' + qrT11 + ', 3]], { position: "inside" });\n', [3, qrT11, 1.5]]
  ];
  for (var qrP of QR_PARTS) for (var qrNurbs of [false, true]) {
    var qrName = 'rfQR: OpenCascade STEP' + (qrNurbs ? ' (NURBS)' : '') + ' of the ' + qrP[0] + ' -> Anvil import -> Insert Bends: bends, loops and blank area = Anvil\'s own flat';
    try {
      var tQr = performance.now(), whyQr = [], mQr = K.newModel('Customer');
      K.runScript(mQr, qrP[1]);
      var bQr = K.rebuild(mQr), ownQr = K.flatPattern(mQr, bQr, K.meshFromBody(bQr.body)), shQr = K.sheetParams(mQr);
      var mQr2 = JSON.parse(JSON.stringify(mQr)); if (qrNurbs) mQr2.stepNurbs = true;
      var rQr = await occt(mQr2, { exports: true, noCache: true });
      if (!rQr.step) throw new Error('no STEP: ' + (rQr.exportError || 'solid not valid'));
      var iQr = Exchange.importFile('customer.step', rQr.step, { units: mQr.units || 'in' });
      if (iQr.stats && iQr.stats.openEdges) whyQr.push(iQr.stats.openEdges + ' open edges on reading');
      var pQr = Exchange.newPartFromImport(iQr);
      new K.Builder(pQr).insertBends(qrP[2], { kFactor: shQr.kFactor, thickness: shQr.thickness });
      var b2Qr = K.rebuild(pQr);
      if (Object.keys(b2Qr.errors).length) whyQr.push('Insert Bends: ' + JSON.stringify(b2Qr.errors));
      else {
        var fQr = K.flatPattern(pQr, b2Qr, K.meshFromBody(b2Qr.body)), dQr = qrArea(fQr) - qrArea(ownQr), tolQr = mQr.units === 'mm' ? 1e-4 : 1e-6;
        if (qrBends(fQr) !== qrBends(ownQr)) whyQr.push('bends ' + qrBends(fQr) + ', own ' + qrBends(ownQr));
        if (fQr.loops.length !== ownQr.loops.length) whyQr.push(fQr.loops.length + ' loops, own ' + ownQr.loops.length);
        if (!(Math.abs(dQr) <= tolQr)) whyQr.push('blank area ' + qrArea(fQr) + ', own ' + qrArea(ownQr) + ' (d ' + dQr.toExponential(2) + ')');
      }
      row(whyQr.length ? 'bad' : 'ok', qrName, whyQr.join('\n') || 'd ' + dQr.toExponential(1) + ', ' + fQr.bends.length + ' bends', performance.now() - tQr);
      counts[whyQr.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', qrName, e.message); counts.fail++; }
  }
  // --- end rfQR ---
