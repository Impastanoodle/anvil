  // --- rfQE (lane stepread; kernel side tests/kernel/rfQE.js): the two engines build the same part where an edge is
  // picked with chain: false next to a tangent edge and where a Chamfer is patterned onto rims of its own making; and
  // Anvil's STEP of a boss touching a bar's outermost ruling reads in OpenCascade as one valid solid at the volume.
  for (var qeC of [
    ['plate p6022: a round and a chamfer picked with chain: false, the chamfer\'s edge running on into the round\'s end arc (OpenCascade carried the chamfer round the arc and the corner edge after it: 1e-4)', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 3.5, 4.25).end().extrude(0.135);\np.sketch("Top", 1.135).slot(-0.85, -1.2975, -2.05, -2.4975, 0.125).end().cut("through", { reverse: true });\np.sketch("Top", 1.135).circle(0.5543, 1.9375, 0.125).end().cut("through", { reverse: true });\np.fillet(0.054, [{ at: [-1.44,0.135,2.125], chain: false }]);\np.chamfer(0.054, [{ at: [1.75,0.135,1.815], chain: false }]);\np.sketch("Top", 1.135).slot(-0.7847, 1.3456, -0.3321, 0.893, 0.1875).end().cut("through", { reverse: true });\n', 1e-8, false],
    ['a plate edge chamfered with chain: false where a corner round follows it, and a fillet the same way', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(0.25);\np.fillet(0.25, [[2, 0.125, 1.5]]);\np.chamfer(0.05, [{ at: [0, 0.25, 1.5], chain: false }]);\np.fillet(0.04, [{ at: [0, 0.25, -1.5], chain: false }]);\n', 1e-8, false],
    ['plate p6034: an LPattern of a Chamfer on a hole\'s rim at the hole\'s radius (copy after copy, each copy chamfered the rim the one before made: 2.1e-3)', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 5, 4).end().extrude(0.25);\np.chamfer(0.05, [[-2.19,0.25,2]]);\np.fillet(0.5, [[2.5,0.125,2],[2.5,0.125,-2],[-2.5,0.125,2]]);\np.sketch("Top", 1.25).circle(-1.8046, -0.4434, 0.1875).end().cut("through", { reverse: true });\np.chamfer(0.1125, [[-1.6171,0.25,0.4434]]);\np.linearPattern({ dir: "z", spacing: 0.1875, count: 4 });\n', 1e-8, false],
    ['a boss on a bar tangent to its outermost ruling: Anvil\'s STEP (its curve cut at the touching point)', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).end().extrude(1);\np.sketch("Front", 1).circle(0.125, 0.4612, 0.375).end().extrude(1, { reverse: true });\n', 1e-6, true]
  ]) {
    var qeName = 'rfQE: ' + qeC[0] + ': OpenCascade builds the part at Anvil\'s volume (' + qeC[2] + ')' + (qeC[3] ? ' and reads Anvil\'s STEP as one valid solid at it' : '');
    try {
      var tQe = performance.now(), whyQe = [], mQe = K.newModel('rfQE');
      K.runScript(mQe, qeC[1]);
      var bQe = K.rebuild(mQe), vQe = K.massProps(K.meshFromBody(bQe.body), 1).volume;
      if (Object.keys(bQe.errors).length) whyQe.push('Anvil: ' + JSON.stringify(bQe.errors));
      var ownQe = await occt(mQe), dQe = (ownQe.volume - vQe) / vQe;
      if (!ownQe.valid || !(Math.abs(dQe) < qeC[2])) whyQe.push('OpenCascade builds ' + ownQe.volume + ', Anvil ' + vQe + ' (d ' + dQe.toExponential(1) + ')');
      var dFile = null;
      if (qeC[3]) {
        var stQe = Exchange.exportSTEP(mQe, bQe), impQe = await occtImport('step', stQe), resQe = Exchange.finishImport('step', { units: 'in' }, impQe.solids, 1, []);
        var imQe = K.newModel('RT'); imQe.units = 'in';
        imQe.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'x.step', format: 'step', units: 'in', solids: Exchange.encodeSolids(resQe.solids), brep: { format: 'step', text: stQe } });
        imQe.nextId = 2;
        var backQe = await occt(imQe);
        dFile = (backQe.volume - vQe) / vQe;
        if (backQe.unsupported || !backQe.valid) whyQe.push('OpenCascade read the file as ' + (backQe.unsupported || 'an invalid solid'));
        if (!(Math.abs(dFile) < qeC[2])) whyQe.push('OpenCascade reads ' + backQe.volume + ' (d ' + dFile.toExponential(1) + ')');
      }
      row(whyQe.length ? 'bad' : 'ok', qeName, whyQe.join('\n') || 'build d ' + dQe.toExponential(1) + (dFile != null ? ', file d ' + dFile.toExponential(1) : ''), performance.now() - tQe);
      counts[whyQe.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', qeName, e.message); counts.fail++; }
  }
  // --- end rfQE ---
