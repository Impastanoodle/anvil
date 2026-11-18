  // --- occt-sheet: OpenCascade against Anvil on the 2026-10-07 hand-test sheet metal (16 ga, T = R = .0598, K .5). Bend
  // reliefs: the relief leaves slivers of the bend as their own B-rep faces on the wall's plane, which the unfold took
  // for the wall (the channel's walls went missing, 7.02 × 4.04; obround: stray loops and extra HOLES entities).
  // Sketched Bend: built by OpenCascade from Kernel.sketchedBendLayout with exact bend arcs. Each row: OpenCascade
  // builds every feature, a valid solid, volume within its tolerance and bounding box to 1e-4 of Anvil's, and the
  // same flat (size to 1e-6, bends, loops, DXF entities per layer) from both kernels' meshes ---
  function shChannel(relief) { return SH_HEAD + 'p.flange(1.5, [[3, ' + SH_T + ', 0], [3, ' + SH_T + ', 4]], { position: "inside" });\np.flange(1, [[0, ' + SH_T + ', 2]], { position: "inside", relief: "' + relief + '" });'; }
  function shBend(line, opts) { return SH_HEAD + 'p.sketch("Top", ' + SH_T + ')' + line + '.sketchedBend(' + opts + ');'; }
  var SHEET_CASES = [
    { name: 'channel end flange with a Rectangle relief', code: shChannel('rect'), size: [7.0213, 7.0426], bends: 3, loops: 1 },
    { name: 'channel end flange with an Obround relief', code: shChannel('obround'), size: [7.0213, 7.0426], bends: 3, loops: 1, arcs: 2 },
    { name: 'hand-test channel: side flanges, hem, end flange with relief, 2 × Ø.266 and a 1.5 × .375 slot', size: [7.0213, 7.4838], bends: 4, loops: 4,   // lane DI2: the hem's .375 is overall from the fold (was 7.5585 with .375 the straight leg)
      code: SH_HEAD + 'p.flange(1.5, [[3, ' + SH_T + ', 0], [3, ' + SH_T + ', 4]], { position: "inside" });\np.hem(0.375, [[3, 1.6196, 4]], { gap: 0.0299 });\n' +
        'p.flange(1.0, [[0, ' + SH_T + ', 2]], { position: "inside", relief: "rect" });\np.sketch("Top", ' + SH_T + ').slot(2.25, -2, 3.75, -2, 0.375).cut("through", { reverse: true });\n' +
        'p.sketch("Top", ' + SH_T + ').circle(1, -1, 0.133).circle(5, -1, 0.133).cut("through", { reverse: true });' },
    { name: 'Sketched Bend 90°, centerline', code: shBend('.line(3, 0, 3, -4)', '90, { fixed: [1, 0, 2] }'), size: [6, 4], bends: 1, loops: 1 },
    { name: 'Sketched Bend 45°, a line short of the edges', code: shBend('.line(3, -1, 3, -3)', '45, { fixed: [1, 0, 2] }'), size: [6, 4], bends: 1, loops: 1 },
    { name: 'Sketched Bend, two lines (a channel)', code: shBend('.line(1.5, 0, 1.5, -4).line(4.5, -1, 4.5, -3)', '90'), size: [6, 4], bends: 2, loops: 1 },
    { name: 'Sketched Bend, Material Inside', code: shBend('.line(3, 0, 3, -4)', '90, { fixed: [1, 0, 2], position: "inside" }'), size: [6, 4], bends: 1, loops: 1 },
    { name: 'Sketched Bend after an edge flange on the moving side, holes in the plate', size: [7.1409, 4], bends: 2, loops: 3,
      code: SH_HEAD + 'p.flange(1, [[6, ' + SH_T + ', 2]]);\np.sketch("Top", ' + SH_T + ').circle(1, -1, 0.2).circle(5, -3, 0.2).cut("through", { reverse: true });\np.sketch("Top", ' + SH_T + ').line(3, 0, 3, -4).sketchedBend(90, { fixed: [1, 0, 2] });' },
    { name: 'Sketched Bend 60°, reversed, Material Inside, radius .1, custom deduction', code: shBend('.line(3, 0, 3, -4)', '60, { fixed: [1, 0, 2], position: "inside", reverse: true, radius: 0.1, bendAllowance: { type: "deduction", value: 0.1 } }'), size: [6, 4], bends: 1, loops: 1 },
    // lane DC2: Jog from a sketch line (two bends of one Sketched Bend layout; K .5 rolls each strip up with its metal, so the volume is the plate's exactly)
    { name: 'Jog 120°, Outside Offset .5 (lane jogs-rips: the second bend no longer takes the base the wall leans over)', code: SH_HEAD + 'p.sketch("Top", ' + SH_T + ').line(3, 0, 3, -4).jog(0.5, { fixed: [1, 0, 2], angle: 120 });', size: [6, 4], bends: 2, loops: 1, exact: 24 * SH_T },
    { name: 'Jog from a sketch line, Outside Offset .5, 90°', code: SH_HEAD + 'p.sketch("Top", ' + SH_T + ').line(3, 0, 3, -4).jog(0.5, { fixed: [1, 0, 2] });', size: [6, 4], bends: 2, loops: 1, exact: 24 * SH_T },
    { name: 'Jog 45°, Inside Offset .4, Material Inside, a Ø.4 hole on the jogged side', code: SH_HEAD + 'p.sketch("Top", ' + SH_T + ').circle(5, -2, 0.2).cut("through", { reverse: true });\np.sketch("Top", ' + SH_T + ').line(3, 0, 3, -4).jog(0.4, { fixed: [1, 0, 2], angle: 45, offsetRef: "inside", position: "inside" });', size: [6, 4], bends: 2, loops: 2, exact: (24 - Math.PI * 0.04) * SH_T },
    // lane sweptflange: Swept Flange (no Base Flange): the open-base section swept along the path, prisms and revolves
    { name: 'Swept Flange, an L (2 × 1) along a straight 10: flat (flats + BA) × 10, volume = flat × T', code: 'p.units("in");\np.sheet(' + SH_T + ', ' + SH_T + ', 0.5);\nvar path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);',
      size: [3 - 2 * SH_T + Math.PI * 0.75 * SH_T, 10], bends: 1, loops: 1, exact: (3 - 2 * SH_T + Math.PI * 0.75 * SH_T) * 10 * SH_T },
    { name: 'Swept Flange, a radial line 5 → 7 along a quarter arc R5: a ring sector, π/4·24·T exactly', code: 'p.units("in");\np.sheet(' + SH_T + ', ' + SH_T + ', 0.5);\nvar path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 7, 0).id();\np.sweptFlange(prof, path);',
      size: [7, 7], bends: 0, loops: 1, arcs: 2, exact: Math.PI / 4 * 24 * SH_T },
    { name: 'Swept Flange, a cylinder (a line square to the arc path), Flatten along path: 2 × π/2·(5 + T/2)', code: 'p.units("in");\np.sheet(' + SH_T + ', ' + SH_T + ', 0.5);\nvar path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 5, 2).id();\np.sweptFlange(prof, path, { flatten: "path" });',
      size: [2, Math.PI / 2 * (5 + SH_T / 2)], bends: 0, loops: 1, exact: 2 * Math.PI / 2 * (5 + SH_T / 2) * SH_T }
  ];
  for (var sci = 0; sci < SHEET_CASES.length; sci++) {
    var sc = SHEET_CASES[sci], tsc = performance.now();
    try {
      var smod = K.newModel('T'); K.runScript(smod, sc.code);
      var sb = K.rebuild(smod), smesh = K.meshFromBody(sb.body), whyS = [];
      if (Object.keys(sb.errors).length) whyS.push('Anvil errors ' + JSON.stringify(sb.errors));
      var sr = await occt(smod, { noCache: true });
      if (sr.unsupported) whyS.push('OpenCascade: unsupported ' + sr.unsupported);
      Object.keys(sr.status).forEach(function (id) { if (sr.status[id] !== 'ok') whyS.push('OpenCascade feature ' + id + ': ' + sr.status[id]); });
      if (!sr.valid) whyS.push('invalid solid');
      var sva = K.massProps(smesh, 1).volume, sdv = Math.abs(sr.volume - sva) / sva;
      if (!(sdv <= (sr.tolerance || 1e-4))) whyS.push('volume ' + sr.volume.toFixed(6) + ' vs Anvil ' + sva.toFixed(6));
      if (sc.exact != null && !(Math.abs(sr.volume - sc.exact) <= 1e-6 * sc.exact)) whyS.push('OpenCascade volume ' + sr.volume.toFixed(7) + ', exact ' + sc.exact.toFixed(7));
      var sbb = sb.body.getBounds(), sdb = 0;
      if (sr.bbox) for (var c2 = 0; c2 < 3; c2++) sdb = Math.max(sdb, Math.abs(sr.bbox[0][c2] - sbb.min[c2]), Math.abs(sr.bbox[1][c2] - sbb.max[c2])); else sdb = Infinity;
      if (!(sdb <= 1e-4)) whyS.push('bbox off by ' + sdb.toExponential(2));
      var fa = K.flatPattern(smod, sb, smesh), fo = null;
      if (!whyS.length) {
        var sob = OcctKernel.toBuild(sr, sb, smesh, null, CSG, K);
        fo = K.flatPattern(smod, sob, K.meshFromBody(sob.body));
        [0, 1].forEach(function (k) {
          if (Math.abs(fo.size[k] - fa.size[k]) > 1e-6) whyS.push('flat ' + 'wh'[k] + ' ' + fo.size[k].toFixed(4) + ' vs Anvil ' + fa.size[k].toFixed(4));
          if (Math.abs(fa.size[k] - sc.size[k]) > 1e-4) whyS.push('Anvil flat ' + 'wh'[k] + ' ' + fa.size[k].toFixed(4) + ', want ' + sc.size[k]);
        });
        if (fo.bends.length !== sc.bends || fa.bends.length !== sc.bends) whyS.push('bends ' + fo.bends.length + ' / Anvil ' + fa.bends.length + ', want ' + sc.bends);
        if (fo.loops.length !== sc.loops || fa.loops.length !== sc.loops) whyS.push('loops ' + fo.loops.length + ' / Anvil ' + fa.loops.length + ', want ' + sc.loops);
        var dO = shDxf(fo), dA = shDxf(fa);
        // entity counts per type / layer, whatever order the loops start in
        function sorted(o) { var s = {}; Object.keys(o).sort().forEach(function (k) { s[k] = o[k]; }); return JSON.stringify(s); }
        if (sorted(dO) !== sorted(dA)) whyS.push('DXF ' + JSON.stringify(dO) + ' vs Anvil ' + JSON.stringify(dA));
        if (sc.arcs != null && (dO['ARC/OUTLINE'] || 0) !== sc.arcs) whyS.push((dO['ARC/OUTLINE'] || 0) + ' ARCs on OUTLINE, want ' + sc.arcs);
        if (Object.keys(dO).some(function (k) { return /HOLES/.test(k); }) && sc.loops === 1) whyS.push('HOLES entities on a blank with no holes: ' + JSON.stringify(dO));
      }
      row(whyS.length ? 'bad' : 'ok', 'sheet metal, OpenCascade = Anvil: ' + sc.name, whyS.join('\n') || ('flat ' + fo.size.map(function (v) { return v.toFixed(4); }).join(' × ') + ' in, ' + fo.bends.length + ' bend' + (fo.bends.length === 1 ? '' : 's') + ', DXF ' + JSON.stringify(shDxf(fo)) + '; volume ' + sr.volume.toFixed(6) + ' (Anvil ' + sva.toFixed(6) + ')'), performance.now() - tsc);
      counts[whyS.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'sheet metal, OpenCascade = Anvil: ' + sc.name, e.message); counts.fail++; }
  }
  // --- end occt-sheet ---
