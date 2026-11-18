  // --- rfKC (lane mitreplane, 2026-11-09; tests/kernel/rfKC.js): Anvil's own STEP of a mitred tray, a Closed Corner
  // box, a Miter Flange corner and two flanges meeting at a corner (14 ga, R .06, inches) writes every bend as its two
  // cylinders (ELLIPSE ends); OpenCascade reads each file back as a valid solid of Anvil's exact volume
  var KC = (function () {
    var T = 0.0747, R = 0.06, RT = R + T, H = 'p.name("Tray").units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var E4 = '[[2, ' + T + ', 0], [4, ' + T + ', 1.5], [2, ' + T + ', 3], [0, ' + T + ', 1.5]]';
    return [
      { name: 'mitred tray', bends: 4, code: H + 'p.flange(1, ' + E4 + ', { position: "inside" });\n' },
      { name: 'Closed Corner box', bends: 4, code: H + E4 + '.forEach(function (e) { p.flange(1, [e], { position: "inside", lengthRef: "outer" }); });\n' +
        'p.closedCorner([[' + T / 2 + ', 0.6, ' + RT + '], [' + (4 - RT) + ', 0.6, ' + (3 - T / 2) + '], [' + T / 2 + ', 0.6, ' + (3 - RT) + ']], { cornerType: "butt", gap: 0.01 });\n' },
      { name: 'Miter Flange corner', bends: 2, code: 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(-2, ' + T + ', -2, ' + (T + 1) + ').end();\np.miterFlange([[2, ' + T + ', 2], [4, ' + T + ', 1]], { position: "inside", miterGap: 0.01 });\n' },
      { name: 'two flanges meeting at a corner', bends: 2, code: H + 'p.flange(1, [[2, ' + T + ', 0]], { position: "inside" });\np.flange(1, [[4, ' + T + ', 1.5]], { position: "inside" });\n' }
    ];
  })();
  for (var kc = 0; kc < KC.length; kc++) {
    var tkc = performance.now(), whyKC = [], cs = KC[kc];
    try {
      var mKC = K.newModel('T'); K.runScript(mKC, cs.code);
      var bKC = K.rebuild(mKC), volKC = K.massProps(K.meshFromBody(bKC.body), 1).volume, stKC = Exchange.exportSTEP(mKC, bKC, { faceted: true });
      var nCyl = (stKC.match(/CYLINDRICAL_SURFACE\(/g) || []).length;
      if (nCyl !== 2 * cs.bends) whyKC.push(nCyl + ' cylinders in the file, want ' + 2 * cs.bends + ' (every bend whole)');
      var impKC = await occtImport('step', stKC), resKC = Exchange.finishImport('step', { units: 'in' }, impKC.solids, 1, []);
      var imKC = K.newModel('RT'); imKC.units = 'in';
      imKC.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'tray.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resKC.solids), brep: { format: 'step', text: stKC } });
      imKC.nextId = 2;
      var backKC = await occt(imKC), dKC = Math.abs(backKC.volume - volKC) / volKC;
      if (backKC.unsupported || !backKC.valid) whyKC.push('OpenCascade read it as ' + (backKC.unsupported || 'an invalid solid'));
      if (!(dKC < 1e-7)) whyKC.push('OpenCascade reads ' + backKC.volume.toFixed(7) + ' in³, Anvil built ' + volKC.toFixed(7) + ' (d ' + dKC.toExponential(1) + ')');
      row(whyKC.length ? 'bad' : 'ok', 'rfKC: ' + cs.name + ' → Anvil\'s STEP (bends whole) → OpenCascade reads the same volume', whyKC.join('\n') || nCyl + ' cylinders, volume d ' + dKC.toExponential(1), performance.now() - tkc);
      counts[whyKC.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfKC: ' + cs.name + ' → Anvil\'s STEP → OpenCascade', e.message); counts.fail++; }
  }
  // --- end rfKC ---
