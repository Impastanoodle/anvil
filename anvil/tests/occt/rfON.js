  // --- rfON (lane solidstep6; kernel side tests/kernel/rfON.js): Anvil's STEP of two overlapping holes (the two walls
  // share a line: exchange.js snapCylParallel) reads in OpenCascade as one valid solid at the part's volume, and OpenCascade builds the same parts
  // to the same volume.
  for (var onC of [
    ['two overlapping holes Ø.2 and Ø.3 in a plate', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(0.25);\np.sketch("Top", 1.25).circle(0, 0, 0.1).end().cut("through", { reverse: true });\np.sketch("Top", 1.25).circle(0.15, 0, 0.15).end().cut("through", { reverse: true });\n', 8, 2, 1e-9],
    ['two overlapping holes Ø.25 and Ø.25, .2 / .05 apart, in a plate', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(0.25);\np.sketch("Top", 1.25).circle(0, 0, 0.125).end().cut("through", { reverse: true });\np.sketch("Top", 1.25).circle(0.2, 0.05, 0.125).end().cut("through", { reverse: true });\n', 8, 2, 1e-9]
  ]) {
    var onName = 'rfON: ' + onC[0] + ', Anvil\'s STEP: ' + onC[2] + ' faces, ' + onC[3] + ' cylinders; OpenCascade reads one valid solid at the part\'s volume (' + onC[4] + ') and builds the part to the same volume';
    try {
      var tOn = performance.now(), whyOn = [], mOn = K.newModel('rfON');
      K.runScript(mOn, onC[1]);
      var bOn = K.rebuild(mOn), vOn = K.massProps(K.meshFromBody(bOn.body), 1).volume, stOn = Exchange.exportSTEP(mOn, bOn, { faceted: true });
      var nfOn = (stOn.match(/=ADVANCED_FACE\(/g) || []).length, ncOn = (stOn.match(/=CYLINDRICAL_SURFACE\(/g) || []).length;
      if (nfOn !== onC[2] || ncOn !== onC[3]) whyOn.push(nfOn + ' faces, ' + ncOn + ' cylinders in the file');
      var impOn = await occtImport('step', stOn), resOn = Exchange.finishImport('step', { units: 'in' }, impOn.solids, 1, []);
      var imOn = K.newModel('RT'); imOn.units = 'in';
      imOn.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'x.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resOn.solids), brep: { format: 'step', text: stOn } });
      imOn.nextId = 2;
      var backOn = await occt(imOn), dOn = (backOn.volume - vOn) / vOn, ownOn = await occt(mOn), dOwn = (ownOn.volume - vOn) / vOn;
      if (backOn.unsupported || !backOn.valid) whyOn.push('OpenCascade read the file as ' + (backOn.unsupported || 'an invalid solid'));
      if (!(Math.abs(dOn) < onC[4])) whyOn.push('OpenCascade reads ' + backOn.volume + ', the part is ' + vOn + ' (d ' + dOn.toExponential(1) + ')');
      if (!ownOn.valid || !(Math.abs(dOwn) < onC[4])) whyOn.push('OpenCascade builds ' + ownOn.volume + ', Anvil ' + vOn + ' (d ' + dOwn.toExponential(1) + ')');
      row(whyOn.length ? 'bad' : 'ok', onName, whyOn.join('\n') || 'file d ' + dOn.toExponential(1) + ', build d ' + dOwn.toExponential(1), performance.now() - tOn);
      counts[whyOn.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', onName, e.message); counts.fail++; }
  }
  // --- end rfON ---
