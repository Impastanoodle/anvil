  // --- rfPB (lane chamferpat, 2026-11-17; kernel side tests/kernel/rfPB.js): a Mirror / Circular Pattern of a Chamfer
  // with two distances or an angle is the mirror / rotated image of it on OpenCascade too (edgeFeatureCopies hands each
  // copy its linear part, edgeMaker seeds d's face from the original's normals; the +Y, +X, +Z rule run at a mirrored
  // upright edge put d on the other face), and a Mirror of a Mirror of a chamfer builds (it said "Mirror source feature
  // has no geometry"). Each row: OpenCascade builds every feature, a valid solid, volume and centre of volume = Anvil's
  // to 1e-9; a part symmetric by construction has its centre on the symmetry planes (d and d2 swapped on a copy moved
  // it by 1e-4).
  var PB_B = 'p.units("in");\np.sketch("Top").rect(0, -2, 6, 2).end().extrude(0.5);\np.sketch("Top", 0.5).rect(1, -1.5, 1, 1).end().extrude(1);\np.sketch("Top", 0.5).rect(4, -1.5, 1, 1).end().extrude(1);\n';
  var PB_C = 'p.units("in");\np.sketch("Top").rect(0, -6, 6, 6).end().extrude(0.5);\nvar b = p.sketch("Top", 0.5).rect(1, -3.5, 1, 1).end().extrude(1).last();\np.circularPattern({ feature: b, axis: "y", center: [3, 0, 3], count: 4 });\n';
  var PB_CASES = [
    { name: 'Mirror (Right, offset 3) of a D1 .1 / D2 .3 chamfer on a boss\'s upright edge', code: PB_B + 'var c = p.chamfer(0.1, [[2, 1, 0.5]], { d2: 0.3 }).last();\np.mirror("Right", { feature: c, offset: 3 });', sym: { x: 3 } },
    { name: 'Mirror of a D .1 at 30 deg chamfer, flipped', code: PB_B + 'var c = p.chamfer(0.1, [[2, 1, 0.5]], { angle: 30, flip: true }).last();\np.mirror("Right", { feature: c, offset: 3 });', sym: { x: 3 } },
    { name: 'Circular Pattern x4 of a D1 .1 / D2 .3 chamfer on two uprights and a top edge', code: PB_C + 'var c = p.chamfer(0.1, [[2, 1, 2.5], [1, 1, 2.5], [1.5, 1.5, 3.5]], { d2: 0.3 }).last();\np.circularPattern({ feature: c, axis: "y", center: [3, 0, 3], count: 4 });', sym: { x: 3, z: 3 } },
    { name: 'Circular Pattern 3 over 180 deg of a D1 .1 / D2 .3 chamfer', code: PB_C + 'var c = p.chamfer(0.1, [[2, 1, 2.5]], { d2: 0.3 }).last();\np.circularPattern({ feature: c, axis: "y", center: [3, 0, 3], count: 3, angle: 180 });' },
    { name: 'Mirror (Front) of a Mirror (Right) of a D1 .1 / D2 .3 chamfer', code: PB_C + 'var c = p.chamfer(0.1, [[2, 1, 2.5]], { d2: 0.3 }).last();\nvar m = p.mirror("Right", { feature: c, offset: 3 }).last();\np.mirror("Front", { feature: m, offset: 3 });', sym: { x: 3, z: 3 } }
  ];
  for (var pbc of PB_CASES) {
    var pbName = 'rfPB ' + pbc.name + ': OpenCascade = Anvil (volume and centre of volume, 1e-9), the mirror / rotated image of the chamfer';
    try {
      var tpb = performance.now(), mpb = K.newModel('T'); K.runScript(mpb, pbc.code);
      var bpb = K.rebuild(mpb), apb = K.massProps(K.meshFromBody(bpb.body), mpb.density), whyPb = [];
      if (Object.keys(bpb.errors).length) whyPb.push('Anvil: ' + JSON.stringify(bpb.errors));
      var rpb = await occt(JSON.parse(JSON.stringify(mpb)), { noCache: true }), cpb = rpb.bodyProps && rpb.bodyProps[0] ? rpb.bodyProps[0].centroid : null;
      if (!rpb.ok || !rpb.valid || rpb.bodies !== 1) whyPb.push('OpenCascade: ok ' + rpb.ok + ', valid ' + rpb.valid + ', ' + rpb.bodies + ' bodies ' + JSON.stringify(rpb.status));
      if (!(Math.abs(rpb.volume - apb.volume) <= 1e-9 * apb.volume)) whyPb.push('volume ' + rpb.volume + ', Anvil ' + apb.volume);
      if (!cpb) whyPb.push('no centre of volume from OpenCascade');
      else [0, 1, 2].forEach(function (k) { if (!(Math.abs(cpb[k] - apb.centroid[k]) <= 1e-9)) whyPb.push('centre ' + 'xyz'[k] + ' ' + cpb[k] + ', Anvil ' + apb.centroid[k]); });
      Object.keys(pbc.sym || {}).forEach(function (ax) {
        var k = 'xyz'.indexOf(ax);
        [['Anvil', apb.centroid], ['OpenCascade', cpb]].forEach(function (q) { if (q[1] && !(Math.abs(q[1][k] - pbc.sym[ax]) <= 1e-9)) whyPb.push(q[0] + ': centre ' + ax + ' ' + q[1][k] + ', the part is symmetric about ' + ax + ' = ' + pbc.sym[ax]); });
      });
      row(whyPb.length ? 'bad' : 'ok', pbName, whyPb.join('\n') || 'volume ' + rpb.volume.toFixed(9) + ', centre ' + JSON.stringify(cpb.map(function (x) { return +x.toFixed(9); })), performance.now() - tpb);
      counts[whyPb.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', pbName, e.message); counts.fail++; }
  }
  // --- end rfPB ---
