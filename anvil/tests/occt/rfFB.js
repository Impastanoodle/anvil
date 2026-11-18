  // --- rfFB: Boundary Boss/Base / Boundary Cut on OpenCascade (no Direction 2 curves: ThruSections; with curves: one
  // Coons BSpline face per patch, sewn with planar end caps): every feature 'ok', the frustum and its cut / thin wall
  // exact on both kernels; curved curves agree with Anvil's facets to the loft tolerance ---
  var FB_R2 = Math.SQRT1_2, FB_S2 = Math.SQRT2, FB_V = 2 / 3 * 7, FB_H = 0.1 * Math.sqrt(1.0625);
  var FB_FR = 'var a = p.sketch("Front").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Front", 2).centerRect(0, 0, 1, 1).id();\n';
  var FB_G = 'var g1 = p.sketch({ custom: true, origin: [0, 0, 0], x: [' + FB_R2 + ', ' + FB_R2 + ', 0], y: [0, 0, 1], n: [' + FB_R2 + ', ' + (-FB_R2) + ', 0] }, 0).line(' + FB_S2 + ', 0, ' + FB_S2 / 2 + ', 2).line(' + (-FB_S2) + ', 0, ' + (-FB_S2 / 2) + ', 2).id();\n' +
    'var g2 = p.sketch({ custom: true, origin: [0, 0, 0], x: [' + FB_R2 + ', ' + (-FB_R2) + ', 0], y: [0, 0, 1], n: [' + (-FB_R2) + ', ' + (-FB_R2) + ', 0] }, 0).line(' + FB_S2 + ', 0, ' + FB_S2 / 2 + ', 2).line(' + (-FB_S2) + ', 0, ' + (-FB_S2 / 2) + ', 2).id();\n';
  function fbFr(d) { var a0 = 1 + d, a1 = a0 - 0.5; return 2 / 3 * (4 * a0 * a0 + 4 * a1 * a1 + 4 * a0 * a1); }
  var FB_CASES = [
    { name: 'Boundary, Direction 1 only: the 2 → 1 square frustum', code: FB_FR + 'p.boundary([a, b]);', want: FB_V },
    { name: 'Boundary with four straight Direction 2 corner lines: the same frustum', code: FB_FR + FB_G + 'p.boundary([a, b], { dir2: [g1, g2] });', want: FB_V },
    { name: 'Boundary Cut of the frustum through a 3 × 3 × 2 block', code: 'p.sketch("Front").centerRect(0, 0, 3, 3).end().extrude(2);\n' + FB_FR + FB_G + 'p.boundaryCut([a, b], { dir2: [g1, g2] });', want: 18 - FB_V },
    { name: 'Boundary Thin Feature 0.1 outward with the corner lines (walls parallel to the sides)', code: FB_FR + FB_G + 'p.boundary([a, b], { dir2: [g1, g2], thin: { t: 0.1 } });', want: fbFr(FB_H) - FB_V },
    { name: 'Boundary Thin Feature 0.1 inward, no curves', code: FB_FR + 'p.boundary([a, b], { thin: { t: 0.1, reverse: true } });', want: FB_V - fbFr(-FB_H) },
    { name: 'Boundary between two Ø2 circles bulged by two curved Direction 2 curves (smooth on OpenCascade, faceted on Anvil)', code: 'var c1 = p.sketch("Front").circle(0, 0, 1).id();\nvar c2 = p.sketch("Front", 3).circle(0, 0, 1).id();\np.boundary([c1, c2], { dir2: [{ pts: [[1, 0, 0], [1.3, 0, 1.5], [1, 0, 3]] }, { pts: [[-1, 0, 0], [-1.3, 0, 1.5], [-1, 0, 3]] }] });', tol: 2e-2 }
  ];
  for (var fbc of FB_CASES) {
    try {
      var tfb = performance.now(), mfb = K.newModel('T'); K.runScript(mfb, fbc.code);
      var afb = K.rebuild(JSON.parse(JSON.stringify(mfb))), avfb = K.massProps(K.meshFromBody(afb.body), 1).volume;
      var rfb = await occt(JSON.parse(JSON.stringify(mfb)), { noCache: true }), whyFB = [];
      if (Object.keys(afb.errors).length) whyFB.push('Anvil errors ' + JSON.stringify(afb.errors));
      if (rfb.unsupported || !rfb.ok) whyFB.push('OpenCascade did not build every feature: ' + (rfb.unsupported || JSON.stringify(rfb.status)));
      if (!rfb.valid) whyFB.push('invalid solid');
      if (fbc.want != null) {
        if (!(Math.abs(rfb.volume - fbc.want) <= 1e-6 * fbc.want)) whyFB.push('OpenCascade volume ' + rfb.volume + ', exact ' + fbc.want);
        if (!(Math.abs(avfb - fbc.want) <= 1e-6 * fbc.want)) whyFB.push('Anvil volume ' + avfb + ', exact ' + fbc.want);
      } else if (!(Math.abs(rfb.volume - avfb) <= fbc.tol * avfb)) whyFB.push('OpenCascade ' + rfb.volume + ' vs Anvil ' + avfb);
      row(whyFB.length ? 'bad' : 'ok', 'rfFB boundary, OpenCascade = Anvil: ' + fbc.name, whyFB.join('\n') || ('OpenCascade ' + rfb.volume.toFixed(6) + ' / Anvil ' + avfb.toFixed(6) + (fbc.want != null ? ' / exact ' + fbc.want.toFixed(6) : '')), performance.now() - tfb);
      counts[whyFB.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfFB boundary, OpenCascade = Anvil: ' + fbc.name, e.message); counts.fail++; }
  }
  // --- end rfFB ---
