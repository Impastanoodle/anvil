  // --- rfQP (lane occtparity; report test-reports/2026-11-19-occt-parity.md, sweep test-reports/repros/occt-parity.js):
  // fuzz stacks (rfONfuzz) where OpenCascade refused a chamfer / round Anvil builds: ChFi3d cannot run a band into a
  // hole or notch beside the edge, or past a thin wall. occt-kernel.js prismEdgeOp builds the band as Anvil does: a
  // prism over a straight edge (running on to a chamfer or a round across its end), a revolved ring on a whole rim.
  // Each part: OpenCascade builds it, valid, at Anvil's volume.
  for (var qpC of [
    ['p6142: a .225 chamfer whose band crosses a hole .01 from the edge, then corner chamfers meeting it', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 4, 4.25).end().extrude(0.5);\np.sketch("Top", 1.5).circle(-1.3684, -1.9275, 0.1875).end().cut("through", { reverse: true });\np.chamfer(0.225, [[-1.69,0.5,2.125]]);\np.sketch("Top", 1.5).circle(0.1909, -1.75, 0.25).end().cut("through", { reverse: true });\np.chamfer(0.25, [[2,0.25,2.125],[-2,0.25,2.125],[-2,0.25,-2.125]]);\n', 1e-8],
    ['p6036: corner chamfers .25 on a plate .1875 thick, one corner under a round along the top edge', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 5.5, 2.25).end().extrude(0.1875);\np.sketch("Top", 1.1875).circle(-2.5, 0.5335, 0.25).end().cut("through", { reverse: true });\np.fillet(0.0844, [[-2.44,0.1875,1.125]]);\np.chamfer(0.25, [[2.75,0.0938,-1.125],[-2.75,0.0938,1.125],[-2.75,0.0938,-1.125]]);\n', 1e-8],
    ['p6052: corner chamfers .375 on a .06 plate, two corners running through an R.012 round', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 5, 3.75).end().extrude(0.06);\np.fillet(0.012, [[-2.19,0.06,1.875]]);\np.chamfer(0.375, [[2.5,0.03,1.875],[2.5,0.03,-1.875],[-2.5,0.03,1.875],[-2.5,0.03,-1.875]]);\n', 1e-7],
    ['b6069: an R.0625 round on the top edge of a box with .005 walls', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 2, 2).end().extrude(1);\np.sketch("Top", 1).centerRect(0, 0, 1.99, 1.99).end().cut(0.75, { reverse: true });\np.fillet(0.0625, [[0,1,1]]);\n', 1e-8],
    ['t6016: a .125 chamfer on a tube\'s rim crossing a hole .0375 inside the wall', 'p.units("in");\np.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.6).end().extrude(1);\np.sketch("Top", 2).circle(0.4082, -0.8021, 0.0625).end().cut(1.5, { reverse: true });\np.chamfer(0.125, [[-0.8011,1,0.5985]]);\n', 1e-7],
    ['t6007: an R.125 round on a tube\'s rim crossing a Ø.16 hole', 'p.units("in");\np.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.6).end().extrude(2.5);\np.sketch("Top", 3.5).circle(0.7898, -0.4315, 0.08).end().cut("through", { reverse: true });\np.fillet(0.125, [[-0.8011,2.5,0.5985]]);\n', 1e-7],
    ['t6100: an R.125 round on the rim of a tube .2 thick with a groove under it', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.3).end().extrude(1);\np.sketch("Front").rect(0.4126, 0.92, 0.0437, 0.5).end().revolveCut(360);\np.fillet(0.125, [[-0.4006,1,0.2992]]);\n', 1e-6],
    // shells whose offset collapses (occt-kernel.js slabShell)
    ['b6045: a .125 shell of a block with a step .2 thick', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 2.75, 3.5).end().extrude(2);\np.sketch("Top", 2).rect(0.625, -2.25, 2, 4.5).end().cut(1.8, { reverse: true });\np.shell(0.125, [[0,2,0]]);\n', 1e-9],
    ['b6006: a .1 shell of a block with an R.0625 round on its top edge', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 2.25, 2.5).end().extrude(1);\np.fillet(0.0625, [[0,1,1.25]]);\np.shell(0.1, [[0,1,0]]);\n', 1e-9],
    ['b6059: a .125 shell of a block with a Ø.3125 hole .051 above its floor', 'p.units("in");\np.sketch("Top").centerRect(0, 0, 3.75, 2.5).end().extrude(1.75);\np.sketch("Front", 2.25).circle(-1.4874, 0.2072, 0.15625).end().cut("through", { reverse: true });\np.shell(0.125, [[0,1.75,0]]);\n', 1e-7],
    // a cut OpenCascade's Boolean skipped without a word (occt-kernel.js applyCut, halvesCut)
    ['t6002: a Ø.375 cut across a tube grooved by a Revolve Cut', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.75).circle(0, 0, 0.45).end().extrude(1.5);\np.sketch("Front").rect(0.6875, 0.8467, 0.3125, 0.25).end().revolveCut(360);\np.sketch("Front", 1.75).circle(-0.5575, 0.9608, 0.1875).end().cut(1.75, { reverse: true });\n', 1e-7]
  ]) {
    var qpName = 'rfQP: ' + qpC[0] + ': OpenCascade builds it, valid, at Anvil\'s volume (' + qpC[2] + ')';
    try {
      var tQp = performance.now(), whyQp = [], mQp = K.newModel('rfQP');
      K.runScript(mQp, qpC[1]);
      var bQp = K.rebuild(mQp), vQp = K.massProps(K.meshFromBody(bQp.body), 1).volume;
      // features Anvil refuses on purpose are suppressed in OpenCascade's copy, as the app does (ui-occt.js withoutRefused)
      var sQp = JSON.parse(JSON.stringify(mQp));
      sQp.features.forEach(function (fq) { var eq = bQp.errors[fq.id]; if (eq && K.isRefusal(eq)) fq.suppressed = true; else if (eq) whyQp.push('Anvil: ' + eq); });
      var oQp = await occt(sQp), dQp = (oQp.volume - vQp) / vQp;
      if (oQp.unsupported) whyQp.push('unsupported: ' + oQp.unsupported);
      Object.keys(oQp.status || {}).forEach(function (id) { if (/^error/.test(oQp.status[id])) whyQp.push('feature ' + id + ': ' + oQp.status[id]); });
      if (!oQp.valid) whyQp.push('OpenCascade\'s solid is not valid');
      if (!(Math.abs(dQp) < qpC[2])) whyQp.push('OpenCascade builds ' + oQp.volume + ', Anvil ' + vQp + ' (d ' + dQp.toExponential(1) + ')');
      row(whyQp.length ? 'bad' : 'ok', qpName, whyQp.join('\n') || 'd ' + dQp.toExponential(1), performance.now() - tQp);
      counts[whyQp.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', qpName, e.message); counts.fail++; }
  }
  // --- end rfQP ---
