  // --- rfQJ (lane solidcracks; kernel side tests/kernel/rfQJ.js): Anvil's STEP of a part whose planar face is two
  // pieces touching at a point (a keyway floor cut by a cross hole of the keyway's width, fuzz t6028), now written as
  // two loops, reads in OpenCascade at Anvil's volume (BRepCheck still calls it not valid, as before the split); OpenCascade builds the part at it too.
  for (var qjC of [
    ['fuzz t6028: a cross hole as wide as the keyway it crosses', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.25).end().extrude(1.5);\np.sketch("Top", 2.5).rect(-0.0625, 0.2, 0.125, 0.1425).end().cut("through", { reverse: true });\np.sketch("Front", 1.5).circle(0, 0.2559, 0.0625).end().cut("through", { reverse: true });\n', 1e-6]
  ]) {
    var qjName = 'rfQJ: ' + qjC[0] + ': OpenCascade builds the part at Anvil\'s volume and reads Anvil\'s STEP at it (' + qjC[2] + ')';
    try {
      var tQj = performance.now(), whyQj = [], mQj = K.newModel('rfQJ');
      K.runScript(mQj, qjC[1]);
      var bQj = K.rebuild(mQj), vQj = K.massProps(K.meshFromBody(bQj.body), 1).volume;
      if (Object.keys(bQj.errors).length) whyQj.push('Anvil: ' + JSON.stringify(bQj.errors));
      var ownQj = await occt(mQj), dQj = (ownQj.volume - vQj) / vQj;
      if (!ownQj.valid || !(Math.abs(dQj) < qjC[2])) whyQj.push('OpenCascade builds ' + ownQj.volume + ', Anvil ' + vQj + ' (d ' + dQj.toExponential(1) + ')');
      var stQj = Exchange.exportSTEP(mQj, bQj), impQj = await occtImport('step', stQj), resQj = Exchange.finishImport('step', { units: 'in' }, impQj.solids, 1, []);
      var imQj = K.newModel('RT'); imQj.units = 'in';
      imQj.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'x.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resQj.solids), brep: { format: 'step', text: stQj } });
      imQj.nextId = 2;
      var backQj = await occt(imQj), fQj = (backQj.volume - vQj) / vQj;
      if (backQj.unsupported) whyQj.push('OpenCascade read the file as ' + backQj.unsupported);
      if (!(Math.abs(fQj) < qjC[2])) whyQj.push('OpenCascade reads ' + backQj.volume + ' (d ' + fQj.toExponential(1) + ')');
      row(whyQj.length ? 'bad' : 'ok', qjName, whyQj.join('\n') || 'build d ' + dQj.toExponential(1) + ', file d ' + fQj.toExponential(1) + (backQj.valid ? '' : ' (OpenCascade\'s check calls the read solid not valid, with the split or without: open, see the report)'), performance.now() - tQj);
      counts[whyQj.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', qjName, e.message); counts.fail++; }
  }
  // --- end rfQJ ---
