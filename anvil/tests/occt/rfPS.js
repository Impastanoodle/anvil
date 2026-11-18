  // --- rfPS (lane holenext; kernel side tests/kernel/rfPS.js): Hole Wizard Up To Next on OpenCascade. A tap in one
  // wall of a U channel (and a counterbore in the lid of a closed hollow box) drills that wall
  // only and equals Anvil's part to 1e-9 (HoleWizard.nextDepth's rays against OpenCascade's triangulated bodies).
  var psChan = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[0, 0.06, 1]]);\np.flange(1, [[4, 0.06, 1]]);\n';
  var psCases = [
    ['a #10-32 tap in one wall of a .06 sheet U channel (two positions)', psChan, function (b) { return 'p.holeWizard({ face: "Right", offset: ' + b[1][0] + ', points: [[-1, 0.7], [-0.5, 0.5]], standard: "ANSI Inch", type: "tap", size: "#10-32 UNF", end: "next" });\n'; }, Math.PI * 0.159 * 0.159 / 4 * 0.06 * 2],
    ['an M6 counterbore in the lid of a closed hollow box (the floor left whole)', 'p.box(60, 40, 30);\np.shell(3, []);\n', function (b) { return 'p.holeWizard({ face: "Top", offset: ' + b[1][1] + ', points: [[20, -15]], type: "cbore", size: "M6", end: "next" });\n'; }, null]
  ];
  for (var psC of psCases) {
    var psName = 'rfPS: Up To Next on OpenCascade, ' + psC[0] + ': the same part as Anvil\'s to 1e-9';
    try {
      var tps = performance.now(), whyPs = [], a0 = anvilBuild(psC[1]);
      if (a0.errors.length) throw new Error('the part: ' + a0.errors.join());
      var code = psC[1] + psC[2](a0.bbox), aPs = anvilBuild(code), mPs = K.newModel('T');
      if (aPs.errors.length) throw new Error('Anvil: ' + aPs.errors.join());
      K.runScript(mPs, code);
      var oPs = await occt(mPs), oPs0 = null;
      if (oPs.unsupported || !oPs.valid) whyPs.push('OpenCascade: ' + (oPs.unsupported || 'invalid solid'));
      Object.keys(oPs.status || {}).forEach(function (id) { if (oPs.status[id] !== 'ok') whyPs.push('OpenCascade feature ' + id + ': ' + oPs.status[id]); });
      var dPs = Math.abs(oPs.volume - aPs.volume) / aPs.volume;
      if (!(dPs < 1e-9)) whyPs.push('OpenCascade ' + oPs.volume + ', Anvil ' + aPs.volume + ' (d ' + dPs.toExponential(1) + ')');
      if (psC[3] != null && !(Math.abs(a0.volume - aPs.volume - psC[3]) < 1e-9 * a0.volume)) whyPs.push('Anvil removed ' + (a0.volume - aPs.volume) + ', one wall is ' + psC[3]);
      if (psC[3] == null && !(a0.volume - aPs.volume > 0)) whyPs.push('no material removed');
      row(whyPs.length ? 'bad' : 'ok', psName, whyPs.join('\n') || 'd ' + dPs.toExponential(1) + ', removed ' + (a0.volume - aPs.volume).toFixed(6), performance.now() - tps);
      counts[whyPs.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', psName, e.message); counts.fail++; }
  }
  // Circular Corner Relief: the true circle on OpenCascade too (arcs on the face and the walls, the exact radial walls
  // through the circle wrapped round each bend), the same solid as Anvil's (lane PK's crCircle) to 1e-9; it was a
  // 32-gon, 5e-5 more metal on rfLB's Ø.5. 2 Bend: rfLB's 14 ga tray; 3 Bend: rfJV's U with end flanges; mm: 2 mm tray.
  function psTray(pos, mm) {
    if (mm) return 'p.units("mm");\np.sheet(2, 2, 0.44);\np.sketch("Top").rect(0, -75, 100, 75).end().baseFlange();\np.flange(25, [[100, 2, 37.5]], { position: "' + pos + '", lengthRef: "outer" });\np.flange(25, [[50, 2, 75]], { position: "' + pos + '", lengthRef: "outer" });\n';
    return 'p.units("in");\np.sheet(0.0747, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, 0.0747, 1.5]], { position: "' + pos + '", lengthRef: "outer" });\np.flange(1, [[2, 0.0747, 3]], { position: "' + pos + '", lengthRef: "outer" });\n';
  }
  function psU(pos) {
    var fl = function (at, o) { return 'p.flange(1, [' + JSON.stringify(at) + '], ' + JSON.stringify(o) + ');\n'; };
    return 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0], [3, 2]], false).end().baseFlange(null, { depth: 4 });\n' +
      fl([1.5, 0, 0], { position: pos, lengthRef: 'outer', reverse: true }) + fl([0, 1, 0], { position: pos, lengthRef: 'outer', reverse: true }) + fl([3, 1, 0], { position: pos, lengthRef: 'outer', reverse: true });
  }
  var psRel = [
    ['2 Bend, Inside, Ø.5 on the corner', psTray('inside'), 0.5, { reliefType: 'circular', centeredOnBend: false }],
    ['2 Bend, Outside, Ø.12 on the corner', psTray('outside'), 0.12, { reliefType: 'circular', centeredOnBend: false }],
    ['2 Bend, Bend Outside, Ø.5 on the corner', psTray('bendOutside'), 0.5, { reliefType: 'circular', centeredOnBend: false }],
    ['2 Bend, Inside, Ø.25 centred on the bends', psTray('inside'), 0.25, { reliefType: 'circular' }],
    ['2 Bend, mm, Inside, Ø5 centred', psTray('inside', true), 5, { reliefType: 'circular' }],
    ['3 Bend, Inside, Ø.25 centred', psU('inside'), 0.25, { reliefType: 'circular', cornerType: '3bend' }],
    // (on the corner, the circle crosses the U bend's end: Anvil's solid is 5.2e-7 over its own blank × T there, OpenCascade's 1.9e-8 under it)
    ['3 Bend, Outside, Ø.3 on the corner (to 1e-6: Anvil\'s solid is 5.2e-7 off its blank here)', psU('outside'), 0.3, { reliefType: 'circular', cornerType: '3bend', centeredOnBend: false }, 1e-6]
  ];
  for (var psR of psRel) {
    var psRName = 'rfPS: Circular Corner Relief on OpenCascade is the true circle, ' + psR[0] + ': the same solid as Anvil\'s' + (psR[4] ? '' : ' to 1e-9');
    try {
      var tpr = performance.now(), whyPr = [], m0 = K.newModel('T');
      if (!K.crExact) throw new Error('Anvil\'s relief is still the 32-gon here (lane PK\'s kernel-sheetmetal.js not merged)');
      K.runScript(m0, psR[1]);
      var at = K.cornerReliefCandidates(m0, K.rebuild(m0), psR[3].cornerType === '3bend' ? '3bend' : null)[0].at;
      var codeR = psR[1] + 'p.cornerRelief([' + JSON.stringify(at) + '], ' + psR[2] + ', ' + JSON.stringify(psR[3]) + ');\n', aR = anvilBuild(codeR), mR = K.newModel('T');
      if (aR.errors.length) throw new Error('Anvil: ' + aR.errors.join());
      K.runScript(mR, codeR);
      // the part first, then the relief added (the worker's cache holds the flanges, as in the app): the cached prefix
      // brings its sheet-metal records (the U's base flange bends: "no corner where three bends meet" before)
      var m1 = K.newModel('T'); K.runScript(m1, psR[1]); await occt(m1);
      var oR = await occt(mR), dR = (oR.volume - aR.volume) / aR.volume;
      if (!(oR.reused >= m0.features.length)) whyPr.push('the part\'s ' + m0.features.length + ' features were not reused from the cache (' + oR.reused + ')');
      if (oR.unsupported || !oR.valid || oR.bodies !== 1) whyPr.push('OpenCascade: ' + (oR.unsupported || 'valid ' + oR.valid + ', ' + oR.bodies + ' bodies'));
      Object.keys(oR.status || {}).forEach(function (id) { if (oR.status[id] !== 'ok') whyPr.push('OpenCascade feature ' + id + ': ' + oR.status[id]); });
      if (!(Math.abs(dR) < (psR[4] || 1e-9))) whyPr.push('OpenCascade ' + oR.volume + ', Anvil ' + aR.volume + ' (d ' + dR.toExponential(1) + ')');
      row(whyPr.length ? 'bad' : 'ok', psRName, whyPr.join('\n') || 'd ' + dR.toExponential(1), performance.now() - tpr);
      counts[whyPr.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', psRName, e.message); counts.fail++; }
  }
  // --- end rfPS ---
