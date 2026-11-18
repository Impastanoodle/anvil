  // --- r12/inchflange12: inch sheet metal on both kernels, and an inch STEP. The U-bracket example scaled to inches
  // (a slot cut through the base before the two legs) at thicknesses whose top face sits on a 0.01 rounding boundary:
  // both kernels fold both legs up (a split top face once sent the pick to the bottom edge, T away), same volume,
  // same box to 0.002 in. Then the 0.075 in bracket's exact STEP: declared in inches, read back by OpenCascade (mm)
  // 25.4 times the inch box, and rebuilt as an Imported feature of an inch part with the same volume and box ---
  function inchBracket(T) {
    return 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -2.4, 4.8, 2.4).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').slot(1.6, -1.2, 3.2, -1.2, 0.36).cut("through", { reverse: true });\n' +
      'p.flange(1.6, [[0, ' + T + ', 1.2]]);\np.flange(1.6, [[4.8, ' + T + ', 1.2]], { angle: 120 });\np.hem(0.3, [[2.4, ' + T + ', 0]], { hemType: "closed" });';
  }
  function boxDiff(a, b) { var d = 0; for (var c = 0; c < 2; c++) for (var k = 0; k < 3; k++) d = Math.max(d, Math.abs(a[c][k] - b[c][k])); return d; }
  for (var Ti of [0.035, 0.075, 0.125]) {
    try {
      var t12 = performance.now(), a12 = anvilBuild(inchBracket(Ti)), r12 = await occt(a12.model), why12 = [];
      Object.keys(r12.status).forEach(function (id) { if (r12.status[id] !== 'ok') why12.push('feature ' + id + ': ' + r12.status[id]); });
      if (a12.errors.length) why12.push('Anvil errors ' + a12.errors.join(', '));
      if (!r12.valid) why12.push('invalid solid');
      var dv12 = Math.abs(r12.volume - a12.volume) / a12.volume;
      if (!(dv12 <= r12.tolerance)) why12.push('volume ' + r12.volume.toFixed(5) + ' vs Anvil ' + a12.volume.toFixed(5));
      [['Anvil', a12.bbox], ['OpenCascade', r12.bbox]].forEach(function (q) {
        if (!q[1]) { why12.push(q[0] + ': no solid'); return; }
        if (!(Math.abs(q[1][0][1]) < 1e-6)) why12.push(q[0] + ': something below the base (min y ' + q[1][0][1].toFixed(4) + '): a leg folded down');
        if (!(Math.abs(q[1][1][1] - (2 * Ti + 1.6)) < 1e-6)) why12.push(q[0] + ': legs ' + q[1][1][1].toFixed(4) + ' tall, not L + R + T = ' + (2 * Ti + 1.6).toFixed(4));
      });
      var db12 = a12.bbox && r12.bbox ? boxDiff(a12.bbox, r12.bbox) : Infinity;
      if (!(db12 <= 0.002)) why12.push('bbox off by ' + db12.toExponential(2) + ' in');
      row(why12.length ? 'bad' : 'ok', 'inch U-bracket T = ' + Ti + ' in (slot before the legs, 90° and 120° legs, closed hem): both kernels fold every flange the same way',
        why12.join('\n') || 'volume ' + r12.volume.toFixed(5) + ' in³ (d ' + dv12.toExponential(1) + '), box ' + JSON.stringify(r12.bbox.map(function (p) { return p.map(function (x) { return +x.toFixed(4); }); })), performance.now() - t12);
      counts[why12.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'inch U-bracket T = ' + Ti + ' in', e.message); counts.fail++; }
  }
  try {
    var t13 = performance.now(), a13 = anvilBuild(inchBracket(0.075)), r13 = await occt(a13.model, { exports: true }), why13 = [];
    if (!r13.step) throw new Error('no STEP: ' + (r13.exportError || 'solid not valid'));
    var cb13 = /CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'/.exec(r13.step);
    if (!cb13 || !/INCH/i.test(cb13[1])) why13.push('the STEP does not declare inches (' + (cb13 ? cb13[1] : 'no conversion-based unit') + ')');
    var imp13 = await occtImport('step', r13.step), lo13 = [Infinity, Infinity, Infinity], hi13 = [-Infinity, -Infinity, -Infinity];
    imp13.solids.forEach(function (s) { for (var i = 0; i < s.positions.length; i += 3) for (var k = 0; k < 3; k++) { lo13[k] = Math.min(lo13[k], s.positions[i + k]); hi13[k] = Math.max(hi13[k], s.positions[i + k]); } });
    var dmm13 = boxDiff([lo13, hi13], r13.bbox.map(function (p) { return p.map(function (x) { return x * 25.4; }); }));
    if (!(dmm13 <= 0.05)) why13.push('read back in mm: box off the inch box × 25.4 by ' + dmm13.toFixed(4) + ' mm');
    var res13 = Exchange.finishImport('step', { units: 'in' }, imp13.solids, 1, []);
    var im13 = K.newModel('RT'); im13.units = 'in';
    im13.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'bracket.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(res13.solids), brep: { format: 'step', text: r13.step } });
    im13.nextId = 2;
    var back13 = await occt(im13), dvol13 = Math.abs(back13.volume - r13.volume) / r13.volume;
    if (back13.unsupported || !back13.valid) why13.push('rebuild ' + (back13.unsupported || 'invalid'));
    if (!(dvol13 < 1e-6)) why13.push('volume ' + back13.volume.toFixed(6) + ' in³ vs ' + r13.volume.toFixed(6));
    var db13 = back13.bbox ? boxDiff(back13.bbox, r13.bbox) : Infinity;
    if (!(db13 < 1e-5)) why13.push('box off by ' + db13.toExponential(2) + ' in');
    row(why13.length ? 'bad' : 'ok', 'inch U-bracket → STEP (INCH) → OpenCascade import into an inch part (exact rebuild from the kept file)',
      why13.join('\n') || 'STEP ' + (r13.step.length / 1024).toFixed(0) + ' KB in ' + cb13[1] + ', read back ' + (hi13[1] - lo13[1]).toFixed(3) + ' mm tall, re-built ' + back13.volume.toFixed(5) + ' in³ (d ' + dvol13.toExponential(1) + ')', performance.now() - t13);
    counts[why13.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'inch STEP round trip', e.message); counts.fail++; }
  // --- end r12/inchflange12 ---
