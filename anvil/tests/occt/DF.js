  // --- lane DF: a Circular Pattern / Revolve about a reference Axis is built by OpenCascade (the axis, point and
  // coordinate system resolved in occt-kernel.js as Kernel.rebuild does, face / edge refs on its own bodies): every
  // feature 'ok', the volume Anvil's and the exact one to 1e-6; then the model under a face axis is edited (the
  // cylinder moves) and the cached worker build follows it ---
  var DF_CASES = [
    { name: 'Circular Pattern about an axis where two planes meet', code: 'var pl = p.plane("Right", 50);\np.sketch("Top").circle(80, 0, 5).end().extrude(10);\nvar ax = p.axis("planes", [{ plane: pl }, "Front"]);\np.circularPattern({ axisRef: ax, count: 4 });', want: 4 * Math.PI * 250 },
    { name: 'Revolve about a two-point axis', code: 'var a = p.axis("points", ["origin", [0, 10, 0]]);\np.sketch("Front").rect(10, 0, 10, 10).end().revolve(360, { axisRef: a });', want: Math.PI * 3000 },
    { name: 'Circular Pattern about a cylindrical face\'s axis', code: 'p.sketch("Top").circle(0, 0, 10).end().extrude(20);\nvar a = p.axis("cyl", [{ face: [10, 10, 0] }]);\np.sketch("Top").circle(30, 0, 4).end().extrude(5);\np.circularPattern({ axisRef: a, count: 6 });', want: Math.PI * 2000 + 6 * Math.PI * 80 },
    { name: 'Revolve Cut about an axis on a model edge', code: 'p.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);\nvar a = p.axis("line", [{ edge: [20, 30, 0] }]);\np.sketch("Front").rect(10, 25, 10, 5).end().revolveCut(360, { axisRef: a });', want: 12000 - 62.5 * Math.PI },
    { name: 'inch: Cut pattern about a hole\'s axis, a boss sketched on a Coordinate System at the hole edge\'s centre', units: 'in', code: 'p.sketch("Front").rect(0, 0, 4, 3).end().extrude(0.5);\np.sketch("Front").circle(1.2, 1.5, 0.25).end().cut("through");\nvar a = p.axis("cyl", [{ face: [1.45, 1.5, 0.25] }]);\np.sketch("Front").circle(2, 1.5, 0.1875).end().cut("through");\np.circularPattern({ axisRef: a, count: 3 });\nvar c = p.point("arc", [{ edge: [1.45, 1.5, 0.5] }]);\nvar cs = p.csys({ origin: { point: c } });\np.sketch(cs, 0).rect(1.5, 0.5, 0.5, 0.5).end().extrude(0.25);', want: 6 - Math.PI * 0.03125 - 3 * Math.PI * 0.1875 * 0.1875 * 0.5 + 0.0625 }
  ];
  for (var dfc of DF_CASES) {
    try {
      var tdf = performance.now(), mdf = K.newModel('T'); if (dfc.units) mdf.units = dfc.units; K.runScript(mdf, dfc.code);
      var adf = K.rebuild(JSON.parse(JSON.stringify(mdf))), avdf = K.massProps(K.meshFromBody(adf.body), 1).volume;
      var rdf = await occt(JSON.parse(JSON.stringify(mdf)), { noCache: true }), whyDF = [];
      if (Object.keys(adf.errors).length) whyDF.push('Anvil errors ' + JSON.stringify(adf.errors));
      if (rdf.unsupported || !rdf.ok) whyDF.push('OpenCascade did not build every feature: ' + (rdf.unsupported || JSON.stringify(rdf.status)));
      if (!rdf.valid) whyDF.push('invalid solid');
      if (!(Math.abs(rdf.volume - dfc.want) <= 1e-6 * dfc.want)) whyDF.push('OpenCascade volume ' + rdf.volume + ', exact ' + dfc.want);
      if (!(Math.abs(avdf - dfc.want) <= 1e-6 * dfc.want)) whyDF.push('Anvil volume ' + avdf + ', exact ' + dfc.want);
      row(whyDF.length ? 'bad' : 'ok', 'reference axis, OpenCascade = Anvil: ' + dfc.name, whyDF.join('\n') || ('OpenCascade ' + rdf.volume.toFixed(6) + ' / Anvil ' + avdf.toFixed(6) + ' / exact ' + dfc.want.toFixed(6)), performance.now() - tdf);
      counts[whyDF.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'reference axis, OpenCascade = Anvil: ' + dfc.name, e.message); counts.fail++; }
  }
  try {
    var tdf2 = performance.now(), mdf2 = K.newModel('T'), whyDF2 = [];
    K.runScript(mdf2, DF_CASES[2].code);
    var r1df = await occt(JSON.parse(JSON.stringify(mdf2)));
    mdf2.features[1].depth = 30;   // the cylinder grows 10 taller: its face (and the axis on it) rebuild, the pattern stays
    var r2df = await occt(JSON.parse(JSON.stringify(mdf2))), a2df = K.rebuild(JSON.parse(JSON.stringify(mdf2))), bbdf = a2df.body.getBounds();
    var axdf = a2df.planes[mdf2.features[2].id], wantDF2 = DF_CASES[2].want + Math.PI * 1000;
    if (!r2df.ok || !r1df.ok) whyDF2.push('status ' + JSON.stringify(r2df.status));
    if (!(r2df.reused >= 1 && r2df.reused < mdf2.features.length)) whyDF2.push('reused ' + r2df.reused + ' (want the first sketch only)');
    if (!(Math.abs(r2df.volume - wantDF2) <= 1e-6 * wantDF2)) whyDF2.push('volume ' + r2df.volume + ', want ' + wantDF2);
    if (!axdf || !(Math.abs(Math.abs(axdf.b[1] - axdf.a[1]) - 30) < 1e-9)) whyDF2.push('Anvil axis ' + JSON.stringify(axdf) + ' (want 30 long)');
    // the page's 0.05 mm box rule: both boxes are faceted, and the 12° angular limit (local-2026-10-29b) put Anvil's facet corners elsewhere
    for (var kdf = 0; kdf < 3; kdf++) if (!(Math.abs(r2df.bbox[0][kdf] - bbdf.min[kdf]) < 0.05 && Math.abs(r2df.bbox[1][kdf] - bbdf.max[kdf]) < 0.05)) whyDF2.push('box ' + JSON.stringify(r2df.bbox) + ' vs Anvil ' + JSON.stringify([bbdf.min, bbdf.max]));
    row(whyDF2.length ? 'bad' : 'ok', 'reference axis on a cylindrical face: the cylinder grows, OpenCascade\'s cached rebuild resolves the axis on the new face and patterns about it', whyDF2.join('\n') ||('reused ' + r2df.reused + ', volume ' + r2df.volume.toFixed(6)), performance.now() - tdf2);
    counts[whyDF2.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'reference axis follows an edit (OpenCascade cache)', e.message); counts.fail++; }
  // --- end lane DF ---
