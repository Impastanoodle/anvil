  // --- rfKQ (lane stepout3; kernel side tests/kernel/rfKQ.js): Anvil's STEP of a U channel R .25 with a round hole
  // through a bend (the hole's walls ruled rational B-splines between rails exact on the bend's cylinders) reads in
  // OpenCascade as a valid solid at the volume Anvil's own reader gets (1e-9), and the OpenCascade import of it gives
  // Insert Bends both bends and the part's own blank; an R .5 mitred tray's Anvil STEP through the OpenCascade import:
  // Insert Bends' flat = the tray's own (the rounded records' tapered corner ends no longer notched).
  for (var kqCut of [['.circle(' + (0.25 + KD_T - Math.PI / 4 * (0.25 + KD_K * KD_T)) + ', -2, 0.125)', 'a Ø.25 hole in the middle'], ['.circle(0.3, -2, 0.1)', 'a Ø.2 hole across the tangent line']]) {
    var kqName = 'rfKQ: Anvil\'s STEP of a U channel R .25 with ' + kqCut[1] + ' of a bend → OpenCascade reads Anvil\'s reader\'s volume; its import → Insert Bends: both bends, the own blank';
    try {
      var tkq = performance.now(), whyKq = [], mkq = K.newModel('U');
      var srcKq = KI_U.replace(/\.rect\([^)]*, -2\.375, 0\.25, 0\.75\)/, kqCut[0]);   // the slot → the hole
      if (srcKq.indexOf('.circle(') < 0) throw new Error('the hole was not put in the script');
      K.runScript(mkq, srcKq);
      var bkq = K.rebuild(mkq), ownKq = K.flatPattern(mkq, bkq, K.meshFromBody(bkq.body)), stKq = Exchange.exportSTEP(mkq, bkq, { faceted: true });
      if ((stKq.match(/=CYLINDRICAL_SURFACE\(/g) || []).length !== 4) whyKq.push('bends not whole in the file');
      var anvKq = K.massProps(K.meshFromBody(K.rebuild(Exchange.newPartFromImport(Exchange.importFile('u.step', stKq, { units: 'in' }))).body), 1).volume;
      var impKq = await occtImport('step', stKq), resKq = Exchange.finishImport('step', { units: 'in' }, impKq.solids, 1, []);
      var imKq = K.newModel('RT'); imKq.units = 'in';
      imKq.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'u.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resKq.solids), brep: { format: 'step', text: stKq } });
      imKq.nextId = 2;
      var backKq = await occt(imKq), dKq = Math.abs(backKq.volume - anvKq) / anvKq;
      if (backKq.unsupported || !backKq.valid) whyKq.push('OpenCascade read it as ' + (backKq.unsupported || 'an invalid solid'));
      if (!(dKq < 1e-9)) whyKq.push('OpenCascade reads ' + backKq.volume + ', Anvil\'s reader ' + anvKq + ' (d ' + dKq.toExponential(1) + ')');
      var fkq = kiFlat(Exchange.newPartFromImport(resKq), [1, 0, 2]);
      if (fkq.bends.length !== 2 || fkq.warnings.length) whyKq.push(fkq.bends.length + ' bends; ' + fkq.warnings.join('; '));
      if (fkq.loops.length !== 2 || Math.abs(kiArea(fkq.loops) - kiArea(ownKq.loops)) > 1e-6) whyKq.push(fkq.loops.length + ' loops, blank ' + kiArea(fkq.loops) + ', own ' + kiArea(ownKq.loops));
      row(whyKq.length ? 'bad' : 'ok', kqName, whyKq.join('\n') || 'volume d ' + dKq.toExponential(1) + ', blank ' + kiArea(fkq.loops).toFixed(6) + ' in²', performance.now() - tkq);
      counts[whyKq.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', kqName, e.message); counts.fail++; }
  }
  try {
    var tkt = performance.now(), whyKt = [], mkt = K.newModel('Tray');
    K.runScript(mkt, 'p.units("in");\np.sheet(0.06, 0.5, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.06, 0], [4, 0.06, 1.5], [2, 0.06, 3], [0, 0.06, 1.5]], { position: "inside" });\n');
    var bkt = K.rebuild(mkt), ownKt = K.flatPattern(mkt, bkt, K.meshFromBody(bkt.body)), stKt = Exchange.exportSTEP(mkt, bkt, { faceted: true });
    var fkt = kiFlat(Exchange.newPartFromImport(Exchange.finishImport('step', { units: 'in' }, (await occtImport('step', stKt)).solids, 1, [])), [2, 0, 1.5]);
    if (fkt.bends.length !== 4 || fkt.warnings.length) whyKt.push(fkt.bends.length + ' bends; ' + fkt.warnings.join('; '));
    if (Math.abs(kiArea(fkt.loops) - kiArea(ownKt.loops)) > 1e-6) whyKt.push('blank ' + kiArea(fkt.loops).toFixed(6) + ', own ' + kiArea(ownKt.loops).toFixed(6) + ' (was 2 % short)');
    row(whyKt.length ? 'bad' : 'ok', 'rfKQ: an R .5 mitred tray, Anvil\'s STEP → OpenCascade import → Insert Bends: the tray\'s own blank (the tapered corner ends no longer notched)', whyKt.join('\n') || 'blank ' + kiArea(fkt.loops).toFixed(6) + ' in²', performance.now() - tkt);
    counts[whyKt.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfKQ: R .5 mitred tray through the OpenCascade import', e.message); counts.fail++; }
  // --- end rfKQ ---
