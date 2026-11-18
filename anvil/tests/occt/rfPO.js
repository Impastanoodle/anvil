  // --- rfPO (lane stepsnap; kernel side tests/kernel/rfPO.js): Anvil's STEP of a Miter Flange whose lip is folded
  // less than 90 deg off the riser (both lips' bends cross at the mitre: exchange.js splitCrossings) reads in OpenCascade
  // as a valid solid at Anvil's own reader's volume; OpenCascade's import of it gives Insert Bends all four bends.
  for (var poA of [37, 60]) {
    var poName = 'rfPO: Miter Flange L, lip ' + poA + ' deg off level, Anvil\'s STEP: 8 cylinders, OpenCascade reads a valid solid at Anvil\'s reader\'s volume; its import: Insert Bends finds all 4 bends';
    try {
      var tpo = performance.now(), whyPo = [], poR = poA * Math.PI / 180, mpo = K.newModel('Lip');
      K.runScript(mpo, 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, ' + 0.5 * Math.cos(poR) + ', ' + (1.06 + 0.5 * Math.sin(poR)) + ').end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n');
      var bpo = K.rebuild(mpo), stPo = Exchange.exportSTEP(mpo, bpo, { faceted: true });
      if ((stPo.match(/=CYLINDRICAL_SURFACE\(/g) || []).length !== 8) whyPo.push((stPo.match(/=CYLINDRICAL_SURFACE\(/g) || []).length + ' cylinders in the file (8: four bends whole)');
      var anvPo = K.massProps(K.meshFromBody(K.rebuild(Exchange.newPartFromImport(Exchange.importFile('lip.step', stPo, { units: 'in' }))).body), 1).volume;
      var impPo = await occtImport('step', stPo), resPo = Exchange.finishImport('step', { units: 'in' }, impPo.solids, 1, []);
      var imPo = K.newModel('RT'); imPo.units = 'in';
      imPo.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'lip.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resPo.solids), brep: { format: 'step', text: stPo } });
      imPo.nextId = 2;
      var backPo = await occt(imPo), dPo = Math.abs(backPo.volume - anvPo) / anvPo;
      if (backPo.unsupported || !backPo.valid) whyPo.push('OpenCascade read it as ' + (backPo.unsupported || 'an invalid solid'));
      if (!(dPo < 1e-9)) whyPo.push('OpenCascade reads ' + backPo.volume + ', Anvil\'s reader ' + anvPo + ' (d ' + dPo.toExponential(1) + ')');
      var partPo = Exchange.newPartFromImport(resPo);
      new K.Builder(partPo).insertBends([1, 0.06, 1.3], { kFactor: 0.5 });
      var bIb = K.rebuild(partPo), fPo = K.flatPattern(partPo, bIb, K.meshFromBody(bIb.body));
      if (Object.keys(bIb.errors).length) whyPo.push('Insert Bends: ' + JSON.stringify(bIb.errors));
      if (fPo.bends.length !== 4) whyPo.push(fPo.bends.length + ' bends (2 before: the lips\' bends were facets)');
      row(whyPo.length ? 'bad' : 'ok', poName, whyPo.join('\n') || 'volume d ' + dPo.toExponential(1) + ', ' + fPo.bends.length + ' bends', performance.now() - tpo);
      counts[whyPo.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', poName, e.message); counts.fail++; }
  }
  // the Hex nut's chamfer cones cut by its flats (hyperbolas) and the Moulded cap's drafted boss cut by its rib: Anvil's
  // STEP writes the cones whole with conic edges (rational quadratic B-splines); OpenCascade reads a valid solid at the
  // kernel's exact volume, and Anvil's reader gets the same
  // the Hex nut's closed form: the hexagon prism less the hole and, top and bottom, the hexagon outside the chamfer's
  // circle c(z) at each height (Simpson's rule on both sides of the kink where c reaches the corners)
  function poNut() {
    var r = 19 / Math.cos(Math.PI / 6) / 2, a = 9.5, Ah = 6 * a * a * Math.tan(Math.PI / 6);
    function inside(c) { return c <= a ? Math.PI * c * c : c >= r ? Ah : Math.PI * c * c - 6 * (c * c * Math.acos(a / c) - a * Math.sqrt(c * c - a * a)); }
    function f(z) { return Ah - inside(r - 1.2 + (10 - z)); }
    var n = 20000, h = 1.2 / n, s = f(8.8) + f(10);
    for (var i = 1; i < n; i++) s += f(8.8 + i * h) * (i % 2 ? 4 : 2);
    return Ah * 10 - Math.PI * 5.1 * 5.1 * 10 - 2 * s * h / 3;
  }
  for (var poEx of [['Hex nut', 12, 1e-9, poNut], ['Moulded cap', 2, 1e-9, null]]) {
    var poExName = 'rfPO: ' + poEx[0] + ', Anvil\'s STEP: ' + poEx[1] + ' cones whole, OpenCascade reads a valid solid at the ' + (poEx[3] ? 'closed form (the kernel\'s own massProps is 9.3e-8 low)' : 'kernel\'s exact volume') + ', Anvil\'s reader the same';
    try {
      var tpe = performance.now(), whyPe = [], expe = EX.filter(function (e) { return e.name === poEx[0]; })[0];
      if (!expe) throw new Error('no example ' + poEx[0]);
      var mpe = K.newModel(poEx[0]); K.runScript(mpe, expe.code);
      var bpe = K.rebuild(mpe), vpe = poEx[3] ? poEx[3]() : K.massProps(K.meshFromBody(bpe.body), 1).volume, stPe = Exchange.exportSTEP(mpe, bpe, { faceted: true });
      var nCone = (stPe.match(/=CONICAL_SURFACE\(/g) || []).length;
      if (nCone !== poEx[1]) whyPe.push(nCone + ' cones in the file, expected ' + poEx[1]);
      var anvPe = K.massProps(K.meshFromBody(K.rebuild(Exchange.newPartFromImport(Exchange.importFile('x.step', stPe, { units: mpe.units }))).body), 1).volume;
      var impPe = await occtImport('step', stPe), resPe = Exchange.finishImport('step', { units: mpe.units }, impPe.solids, 1, []);
      var imPe = K.newModel('RT'); imPe.units = mpe.units;
      imPe.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'x.step', format: 'step', units: mpe.units, solids: Exchange.encodeSolids(resPe.solids), brep: { format: 'step', text: stPe } });
      imPe.nextId = 2;
      var backPe = await occt(imPe), dOc = (backPe.volume - vpe) / vpe, dAn = (anvPe - vpe) / vpe;
      if (backPe.unsupported || !backPe.valid) whyPe.push('OpenCascade read it as ' + (backPe.unsupported || 'an invalid solid'));
      if (!(Math.abs(dOc) < poEx[2])) whyPe.push('OpenCascade reads ' + backPe.volume + ', expected ' + vpe + ' (d ' + dOc.toExponential(1) + ')');
      if (!(Math.abs(dAn) < poEx[2])) whyPe.push('Anvil\'s reader reads ' + anvPe + ' (d ' + dAn.toExponential(1) + ')');
      row(whyPe.length ? 'bad' : 'ok', poExName, whyPe.join('\n') || 'OpenCascade d ' + dOc.toExponential(1) + ', Anvil\'s reader d ' + dAn.toExponential(1), performance.now() - tpe);
      counts[whyPe.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', poExName, e.message); counts.fail++; }
  }
  // --- end rfPO ---
