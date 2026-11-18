  // --- rfGI: lofts on OpenCascade follow SolidWorks' rule too (lane lofts): three or more sections are the bicubic spline
  // patches of Anvil's own loft, polygon → circle in two sections the ruled rational blend, every other pair ruled
  // ThruSections. Volumes are SolidWorks' (head-tools/sw-reference/ref2_loft.py); valid solid, a STEP file comes out.
  var GI_U = 'p.units("in");\n';
  var GI_CASES = [
    { name: 'S28: 3 × 2 rectangle → Ø1.5 circle', code: 'var a = p.sketch("Top").centerRect(0, 0, 3, 2).id();\nvar b = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b]);\n', want: 9.218308893, faces: 6 },
    { name: 'G17: 3 × 3 square → Ø2 circle', code: 'var a = p.sketch("Top").centerRect(0, 0, 3, 3).id();\nvar b = p.sketch("Top", 3).circle(0, 0, 1).id();\np.loft([a, b]);\n', want: 17.51832923, faces: 6 },
    { name: 'S29: square, octagon, circle', code: 'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 1).polygon(0, 0, 1.1, 8, 22.5).id();\nvar c = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n', want: 7.672999045, faces: 10 },
    { name: 'G18: circle, square, circle', code: 'var a = p.sketch("Top").circle(0, 0, 1.5).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n', want: 12.47522741, faces: 6 },
    { name: 'L1: square, smaller square, square', code: 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).centerRect(0, 0, 4, 4).id();\np.loft([a, b, c]);\n', want: 23.828711098, faces: 6 }
  ];
  for (var gic of GI_CASES) {
    try {
      var mgi = K.newModel('T'); K.runScript(mgi, GI_U + gic.code);
      var rgi = await occt(JSON.parse(JSON.stringify(mgi)), { noCache: true, exports: true }), whyGI = [];
      if (rgi.unsupported || !rgi.ok) whyGI.push('OpenCascade did not build every feature: ' + (rgi.unsupported || JSON.stringify(rgi.status)));
      if (!rgi.valid) whyGI.push('invalid solid');
      if (!(Math.abs(rgi.volume - gic.want) <= 5e-5 * gic.want)) whyGI.push('OpenCascade volume ' + rgi.volume + ', SolidWorks ' + gic.want);
      if ((rgi.faces || []).length !== gic.faces) whyGI.push((rgi.faces || []).length + ' faces, SolidWorks ' + gic.faces);
      row(whyGI.length ? 'bad' : 'ok', 'rfGI, OpenCascade = SolidWorks: ' + gic.name, whyGI.join('\n') || ('OpenCascade ' + rgi.volume.toFixed(6) + ' / SolidWorks ' + gic.want));
      counts[whyGI.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfGI, OpenCascade = SolidWorks: ' + gic.name, e.message); counts.fail++; }
  }
  // --- end rfGI ---
