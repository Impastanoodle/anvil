  // --- rfKI (lane stepin2; kernel side tests/kernel/rfKI.js): OpenCascade's own files of a customer's bent part through
  // Insert Bends: its mitred tray keeps every wall in the flat; a .25 x .75 slot through a bend (R .25) is read by Anvil's
  // reader (a cylinder with an inner loop) and by OpenCascade's import, and laid in the flat (area and place = the
  // developed slot); with the OpenCascade import, a B-spline face that is a cylinder (NURBS file) is marked as a bend;
  // Anvil's STEP of a bend notched by a Rectangle / Obround auto relief (written whole now) reads in OpenCascade at
  // Anvil's volume.
  try {
    var tki = performance.now(), whyKi = [], mki = K.newModel('Tray'); K.runScript(mki, 'p.units("in");\np.sheet(0.06, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.06, 0], [4, 0.06, 1.5], [2, 0.06, 3], [0, 0.06, 1.5]], { position: "inside" });\n');
    var bki = K.rebuild(mki), ownKi = K.flatPattern(mki, bki, K.meshFromBody(bki.body)), rki = await occt(JSON.parse(JSON.stringify(mki)), { exports: true });
    var fki = kiFlat(Exchange.newPartFromImport(Exchange.importFile('tray.step', rki.step, { units: 'in' })), [2, 0, 1.5]);
    if (Math.abs(kiArea(fki.loops) - kiArea(ownKi.loops)) > 1e-6) whyKi.push('blank ' + kiArea(fki.loops).toFixed(6) + ' in², the tray\'s own ' + kiArea(ownKi.loops).toFixed(6) + ' (was 12.19: the walls dropped)');
    if (fki.bends.length !== 4 || fki.warnings.length) whyKi.push(fki.bends.length + ' bends; ' + fki.warnings.join('; '));
    row(whyKi.length ? 'bad' : 'ok', 'rfKI OpenCascade\'s mitred tray → Anvil import → Insert Bends: every wall in the flat (the bend\'s 1° facet is not the wall)', whyKi.join('\n') || 'blank ' + kiArea(fki.loops).toFixed(6) + ' in², ' + fki.size.map(function (x) { return x.toFixed(6); }).join(' × '), performance.now() - tki);
    counts[whyKi.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfKI OpenCascade\'s mitred tray → Insert Bends', e.message); counts.fail++; }
  for (var kiNurbs of [false, true]) for (var kiReader of ['Anvil', 'OpenCascade']) {
    var kiName = 'rfKI OpenCascade STEP' + (kiNurbs ? ' (NURBS)' : '') + ' of a U channel R .25 with a .25 × .75 slot through a bend → ' + kiReader + ' import → Insert Bends: the slot developed in the flat';
    try {
      var tks = performance.now(), whyKs = [], mks = K.newModel('U'); K.runScript(mks, KI_U);
      var bks = K.rebuild(mks), ownKs = K.flatPattern(mks, bks, K.meshFromBody(bks.body)), mks2 = JSON.parse(JSON.stringify(mks));
      if (kiNurbs) mks2.stepNurbs = true;
      var rks = await occt(mks2, { exports: true, noCache: true });
      if (!rks.step) throw new Error('no STEP: ' + (rks.exportError || 'solid not valid'));
      var pks = kiReader === 'Anvil' ? Exchange.newPartFromImport(Exchange.importFile('u.step', rks.step, { units: 'in' }))
        : Exchange.newPartFromImport(Exchange.finishImport('step', { units: 'in' }, (await occtImport('step', rks.step)).solids, 1, []));
      var vks = K.massProps(K.meshFromBody(K.rebuild(pks).body), 1).volume;
      if (!(Math.abs(vks - rks.volume) <= (kiReader === 'Anvil' ? 1e-7 : 1e-3) * rks.volume)) whyKs.push('read-back volume ' + vks + ' vs OpenCascade ' + rks.volume);
      var fks = kiFlat(pks, [1, 0, 2]);
      if (fks.bends.length !== 2 || fks.warnings.length) whyKs.push(fks.bends.length + ' bends; ' + fks.warnings.join('; '));
      if (fks.loops.length !== 2) whyKs.push(fks.loops.length + ' loops, want the outline and the slot');
      else if (Math.abs(Math.abs(K.signedArea(fks.loops[1])) - 0.1875) > 1e-6) whyKs.push('slot area ' + Math.abs(K.signedArea(fks.loops[1])));
      if (Math.abs(fks.size[0] - ownKs.size[0]) > 1e-6 || Math.abs(fks.size[1] - ownKs.size[1]) > 1e-6) whyKs.push('flat ' + fks.size + ', own ' + ownKs.size);
      row(whyKs.length ? 'bad' : 'ok', kiName, whyKs.join('\n') || 'slot ' + (fks.loops[1] ? Math.abs(K.signedArea(fks.loops[1])).toFixed(9) : '-') + ' in², flat ' + fks.size.map(function (x) { return x.toFixed(6); }).join(' × '), performance.now() - tks);
      counts[whyKs.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', kiName, e.message); counts.fail++; }
  }
  try {
    var tkb = performance.now(), whyKb = [], mkb = K.newModel('Customer'); K.runScript(mkb, kdL.code);
    var mkb2 = JSON.parse(JSON.stringify(mkb)); mkb2.stepNurbs = true;
    var rkb = await occt(mkb2, { exports: true, noCache: true });
    if (/=CYLINDRICAL_SURFACE\(/.test(rkb.step || '')) whyKb.push('the NURBS file still has cylinders');
    var ikb = await occtImport('step', rkb.step), nrec = ikb.solids.reduce(function (s, x) { return s + (x.recs || []).filter(Boolean).length; }, 0);
    if (!nrec) whyKb.push('no triangle carries a cylinder record');
    var fkb = kiFlat(Exchange.newPartFromImport(Exchange.finishImport('step', { units: 'in' }, ikb.solids, 1, [])), [1, 0, 1]);
    if (fkb.bends.length !== 1 || Math.abs(Math.max(fkb.size[0], fkb.size[1]) - kdL.len) > 1e-6) whyKb.push(fkb.bends.length + ' bends, flat ' + fkb.size + ' (analytic ' + kdL.len + ')');
    row(whyKb.length ? 'bad' : 'ok', 'rfKI OpenCascade NURBS STEP of an L bracket read with the OpenCascade import: the B-spline bend faces marked as cylinders, Insert Bends finds the bend', whyKb.join('\n') || nrec + ' triangles marked, flat ' + Math.max(fkb.size[0], fkb.size[1]).toFixed(6), performance.now() - tkb);
    counts[whyKb.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfKI OpenCascade NURBS L bracket, OpenCascade import', e.message); counts.fail++; }
  for (var kiRel of ['rect', 'obround']) {
    try {
      var tkr = performance.now(), whyKr = [], mkr = K.newModel('Tray');
      K.runScript(mkr, 'p.units("in");\np.sheet(0.0747, 0.06, 0.5, { relief: "' + kiRel + '" });\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.0747, 0]], { position: "inside" });\np.flange(1, [[4, 0.0747, 1.5]], { position: "inside" });\n');
      var bkr = K.rebuild(mkr), volKr = K.massProps(K.meshFromBody(bkr.body), 1).volume, stKr = Exchange.exportSTEP(mkr, bkr, { faceted: true });
      var nKr = (stKr.match(/CYLINDRICAL_SURFACE\(/g) || []).length;
      if (nKr !== 4) whyKr.push(nKr + ' cylinders in the file, want 4 (both bends whole)');
      var impKr = await occtImport('step', stKr), resKr = Exchange.finishImport('step', { units: 'in' }, impKr.solids, 1, []);
      var imKr = K.newModel('RT'); imKr.units = 'in';
      imKr.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'tray.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resKr.solids), brep: { format: 'step', text: stKr } });
      imKr.nextId = 2;
      var backKr = await occt(imKr), dKr = Math.abs(backKr.volume - volKr) / volKr;
      if (backKr.unsupported || !backKr.valid) whyKr.push('OpenCascade read it as ' + (backKr.unsupported || 'an invalid solid'));
      if (!(dKr < 1e-7)) whyKr.push('OpenCascade reads ' + backKr.volume.toFixed(7) + ' in³, Anvil built ' + volKr.toFixed(7) + ' (d ' + dKr.toExponential(1) + ')');
      row(whyKr.length ? 'bad' : 'ok', 'rfKI: a bend notched by a ' + kiRel + ' auto relief → Anvil\'s STEP (written whole) → OpenCascade reads the same volume', whyKr.join('\n') || nKr + ' cylinders, volume d ' + dKr.toExponential(1), performance.now() - tkr);
      counts[whyKr.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfKI: ' + kiRel + ' relief → Anvil\'s STEP → OpenCascade', e.message); counts.fail++; }
  }
  // --- end rfKI ---
