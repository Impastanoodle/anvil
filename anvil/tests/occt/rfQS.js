  // --- rfQS (lane solidleft; kernel side tests/kernel/rfQS.js): Anvil's STEP read by OpenCascade as one valid closed
  // solid at Anvil's volume (t6028: the cross hole's wall now shares the keyway floor's arcs; was: shell not closed).
  for (var qsC of [
    ['fuzz t6028: a cross hole as wide as the keyway it crosses', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.25).end().extrude(1.5);\np.sketch("Top", 2.5).rect(-0.0625, 0.2, 0.125, 0.1425).end().cut("through", { reverse: true });\np.sketch("Front", 1.5).circle(0, 0.2559, 0.0625).end().cut("through", { reverse: true });\n', 1e-6]
  ]) {
    var qsName = 'rfQS: ' + qsC[0] + ': OpenCascade reads Anvil\'s STEP as a valid solid at Anvil\'s volume (' + qsC[2] + ')';
    try {
      var tQs = performance.now(), whyQs = [], mQs = K.newModel('rfQS');
      K.runScript(mQs, qsC[1]);
      var bQs = K.rebuild(mQs), vQs = K.massProps(K.meshFromBody(bQs.body), 1).volume;
      if (Object.keys(bQs.errors).length) whyQs.push('Anvil: ' + JSON.stringify(bQs.errors));
      var stQs = Exchange.exportSTEP(mQs, bQs), impQs = await occtImport('step', stQs), resQs = Exchange.finishImport('step', { units: 'in' }, impQs.solids, 1, []);
      var imQs = K.newModel('RT'); imQs.units = 'in';
      imQs.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'x.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resQs.solids), brep: { format: 'step', text: stQs } });
      imQs.nextId = 2;
      var backQs = await occt(imQs), fQs = (backQs.volume - vQs) / vQs;
      if (backQs.unsupported) whyQs.push('OpenCascade read the file as ' + backQs.unsupported);
      if (!backQs.valid) whyQs.push('OpenCascade\'s check calls the read solid not valid');
      if (!(Math.abs(fQs) < qsC[2])) whyQs.push('OpenCascade reads ' + backQs.volume + ' (d ' + fQs.toExponential(1) + ')');
      row(whyQs.length ? 'bad' : 'ok', qsName, whyQs.join('\n') || 'valid, file d ' + fQs.toExponential(1), performance.now() - tQs);
      counts[whyQs.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', qsName, e.message); counts.fail++; }
  }
  // lane QS2: OpenCascade's rib over a hole through the face it meets stops at that face as Anvil's (K.ribBridge: the
  // convex hull of the flat face swept), the hole open under it (fuzz b6078; was .605 in3 of rib against Anvil's .2109)
  for (var qsR of [
    ['an L-bracket\'s rib over a hole through its base', 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2.25, 0], [2.25, 0.25], [0.25, 0.25], [0.25, 2], [0, 2]]).end().extrude(3, { midplane: true });\np.sketch("Top", 1.25).circle(1.05, -0.1, 0.125).end().cut("through", { reverse: true });\np.sketch("Front", 0).line(0.25, 1.5491, 1.982, 0.25).end().rib(0.1875);\n'],
    ['fuzz b6078 (the rib, a fillet and two more holes)', 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2.25, 0], [2.25, 0.25], [0.25, 0.25], [0.25, 2], [0, 2]]).end().extrude(3, { midplane: true });\np.sketch("Top", 1.25).circle(1.8875, -1.2645, 0.0625).end().cut("through", { reverse: true });\np.sketch("Top", 1.25).circle(1.05, -0.1, 0.125).end().cut("through", { reverse: true });\np.sketch("Front", 0).line(0.25, 1.5491, 1.982, 0.25).end().rib(0.1875);\np.fillet(0.25, [[0.25,0.25,1.45]]);\np.sketch("Top", 1.25).circle(2.0888, 0.6004, 0.15625).end().cut("through", { reverse: true });\np.sketch("Top", 1.25).circle(1.05, -0.2, 0.125).end().cut("through", { reverse: true });\n']
  ]) {
    var qsRName = 'rfQS: ' + qsR[0] + ': OpenCascade\'s rib bridges the hole as Anvil\'s, volumes equal to 1e-7';
    try {
      var tQr = performance.now(), mQr = K.newModel('rfQS'), whyQr = [];
      K.runScript(mQr, qsR[1]);
      var bQr = K.rebuild(mQr), vQr = K.massProps(K.meshFromBody(bQr.body), 1).volume;
      if (Object.keys(bQr.errors).length) whyQr.push('Anvil: ' + JSON.stringify(bQr.errors));
      var oQr = await occt(mQr), dQr = (oQr.volume - vQr) / vQr;
      if (oQr.unsupported) whyQr.push('OpenCascade: ' + oQr.unsupported);
      if (!oQr.valid) whyQr.push('OpenCascade\'s solid is not valid');
      if (!(Math.abs(dQr) < 1e-7)) whyQr.push('OpenCascade ' + oQr.volume + ', Anvil ' + vQr + ' (d ' + dQr.toExponential(1) + ')');
      row(whyQr.length ? 'bad' : 'ok', qsRName, whyQr.join('\n') || 'd ' + dQr.toExponential(1), performance.now() - tQr);
      counts[whyQr.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', qsRName, e.message); counts.fail++; }
  }
  // --- end rfQS ---