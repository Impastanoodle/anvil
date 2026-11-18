  // --- rfKD (lane importbend): a customer's STEP of a formed part written by OpenCascade, as it writes it (planes,
  // cylinders, lines, circles) and NURBS-converted (every face a B-spline surface, every edge a B-spline curve, rational
  // circles: model.stepNurbs), read by Anvil into an inch part, Insert Bends (K .44), the flat = the analytic developed
  // size; OpenCascade's sealed voids (BREP_WITH_VOIDS) read exactly; OpenCascade's mitred tray (cylinders bounded by
  // approximated B-spline curves, twisted ruled bend ends) reads closed. Kernel side: tests/kernel/rfKD.js.
  var kdU = kdThin([[0, 2], [0, 0], [2, 0], [2, 2]], 4, { 1: 0.06, 2: 0.06 }), kdH = kdThin([[0, 0], [1, 0], [1, 1.5], [3, 1.5], [3, 0], [4, 0]], 3, { 1: 0.06, 2: 0.09, 3: 0.12, 4: 0.03 });
  var KD_PARTS = [
    { name: 'L bracket R .06', code: kdL.code, fixed: [1, 0, 1], size: [kdL.len, 2], bends: 1, loops: 1 },
    { name: 'U channel with 5 holes', code: kdU.code + 'p.sketch("Top").circle(1, -2, 0.125).end().extrude(1, { cut: true, through: true, both: true });\np.sketch("Right", 3).circle(-1, 1, 0.125).circle(-3, 1.5, 0.125).end().extrude(3, { cut: true, through: true, reverse: true });\n', fixed: [1, 0, 1.5], size: [kdU.len, 4], bends: 2, loops: 6 },
    { name: 'tray, .25 corner notches', code: 'p.units("in");\np.sheet(0.06, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.06, 0], [4, 0.06, 1.5], [2, 0.06, 3], [0, 0.06, 1.5]], { position: "inside" });\np.sketch("Top").rect(-0.1, -0.25, 0.35, 0.35).rect(3.75, -0.25, 0.35, 0.35).rect(-0.1, -3.1, 0.35, 0.35).rect(3.75, -3.1, 0.35, 0.35).end().extrude(3, { cut: true, through: true, both: true });\n', fixed: [2, 0, 1.5], size: [3.76 + 2 * kdBa(0.06) + 2, 2.76 + 2 * kdBa(0.06) + 2], bends: 4, loops: 1 },
    { name: 'hat, R .06 / .09 / .12 / .03', code: kdH.code, fixed: [2, 1.56, 1.5], size: [kdH.len, 3], bends: 4, loops: 1 }
  ];
  for (var kdp of KD_PARTS) for (var kdNurbs of [false, true]) {
    var kdName = 'rfKD OpenCascade STEP' + (kdNurbs ? ' (NURBS: B-spline faces and edges)' : '') + ' of a ' + kdp.name + ' → Anvil import → Insert Bends → analytic flat';
    try {
      var tkd = performance.now(), whyKd = [], mkd = K.newModel('Customer'); K.runScript(mkd, kdp.code);
      var mkd2 = JSON.parse(JSON.stringify(mkd)); if (kdNurbs) mkd2.stepNurbs = true;
      var rkd = await occt(mkd2, { exports: true, noCache: true });
      if (!rkd.step) throw new Error('no STEP: ' + (rkd.exportError || 'solid not valid'));
      if (kdNurbs && (/=CYLINDRICAL_SURFACE\(|=PLANE\(/.test(rkd.step) || !/RATIONAL_B_SPLINE_SURFACE/.test(rkd.step))) whyKd.push('the NURBS file still has planes / cylinders, or no rational surface');
      var ikd = Exchange.importFile('customer.step', rkd.step, { units: 'in' });
      if (ikd.stats.openEdges) whyKd.push(ikd.stats.openEdges + ' open edges');
      var pkd = Exchange.newPartFromImport(ikd), vkd = K.massProps(K.meshFromBody(K.rebuild(pkd).body), 1).volume;
      if (!(Math.abs(vkd - rkd.volume) <= 1e-7 * rkd.volume)) whyKd.push('read-back volume ' + vkd + ' vs OpenCascade ' + rkd.volume);
      new K.Builder(pkd).insertBends(kdp.fixed, { kFactor: KD_K });
      var bkd = K.rebuild(pkd), meshKd = K.meshFromBody(bkd.body);
      if (Object.keys(bkd.errors).length) whyKd.push('Insert Bends: ' + JSON.stringify(bkd.errors));
      var fkd = K.flatPattern(pkd, bkd, meshKd), skd = fkd.size.slice().sort(function (a, b) { return b - a; }), wkd = kdp.size.slice().sort(function (a, b) { return b - a; });
      if (Math.abs(skd[0] - wkd[0]) > 1e-6 || Math.abs(skd[1] - wkd[1]) > 1e-6) whyKd.push('flat ' + skd.map(function (x) { return x.toFixed(6); }).join(' × ') + ', analytic ' + wkd.map(function (x) { return x.toFixed(6); }).join(' × '));
      if (fkd.bends.length !== kdp.bends) whyKd.push(fkd.bends.length + ' bends, want ' + kdp.bends);
      if (fkd.loops.length !== kdp.loops) whyKd.push(fkd.loops.length + ' loops (outline + holes), want ' + kdp.loops);
      row(whyKd.length ? 'bad' : 'ok', kdName, whyKd.join('\n') || 'flat ' + skd.map(function (x) { return x.toFixed(6); }).join(' × ') + ', ' + fkd.bends.map(function (b) { return b.label; }).join('; ') + ', STEP ' + (rkd.step.length / 1024).toFixed(0) + ' KB', performance.now() - tkd);
      counts[whyKd.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', kdName, e.message); counts.fail++; }
  }
  try {
    var tkv = performance.now(), whyKv = [], mkv = K.newModel('Lid'); K.runScript(mkv, EX.find(function (e) { return e.name === 'Enclosure lid'; }).code);
    var rkv = await occt(JSON.parse(JSON.stringify(mkv)), { exports: true });
    if (!/BREP_WITH_VOIDS/.test(rkv.step || '')) whyKv.push('no BREP_WITH_VOIDS in the file');
    var ikv = Exchange.importFile('lid.step', rkv.step, { units: 'mm' }), vkv = K.massProps(K.meshFromBody(K.rebuild(Exchange.newPartFromImport(ikv)).body), 1).volume;
    if (ikv.solids.length !== 1) whyKv.push(ikv.solids.length + ' solids (each void read as a solid of its own)');
    if (!(Math.abs(vkv - rkv.volume) <= 1e-9 * rkv.volume)) whyKv.push('volume ' + vkv + ' vs OpenCascade ' + rkv.volume);
    row(whyKv.length ? 'bad' : 'ok', 'rfKD OpenCascade STEP with sealed voids (Enclosure lid, BREP_WITH_VOIDS): Anvil reads one solid, the voids subtracted exactly (was +0.6 %)', whyKv.join('\n') || 'volume ' + vkv.toFixed(6), performance.now() - tkv);
    counts[whyKv.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfKD OpenCascade STEP with sealed voids', e.message); counts.fail++; }
  try {
    var tkm = performance.now(), whyKm = [], mkm = K.newModel('Tray'); K.runScript(mkm, 'p.units("in");\np.sheet(0.06, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.06, 0], [4, 0.06, 1.5], [2, 0.06, 3], [0, 0.06, 1.5]], { position: "inside" });\n');
    var rkm = await occt(JSON.parse(JSON.stringify(mkm)), { exports: true });
    var ikm = Exchange.importFile('tray.step', rkm.step, { units: 'in' }), vkm = K.massProps(K.meshFromBody(K.rebuild(Exchange.newPartFromImport(ikm)).body), 1).volume;
    if (ikm.stats.openEdges) whyKm.push(ikm.stats.openEdges + ' open edges');
    if (!(Math.abs(vkm - rkm.volume) <= 1e-5 * rkm.volume)) whyKm.push('volume ' + vkm + ' vs OpenCascade ' + rkm.volume);
    row(whyKm.length ? 'bad' : 'ok', 'rfKD OpenCascade\'s mitred tray (bends bounded by B-spline curves, twisted ruled B-spline bend ends): Anvil reads it closed (was refused)', whyKm.join('\n') || 'volume ' + vkm.toFixed(6) + ' (d ' + ((vkm - rkm.volume) / rkm.volume).toExponential(1) + ')', performance.now() - tkm);
    counts[whyKm.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfKD OpenCascade\'s mitred tray', e.message); counts.fail++; }
  // --- end rfKD ---
