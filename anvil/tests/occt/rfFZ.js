  // --- rfFZ: parts OpenCascade could not build or built wrong (the same scripts as tests/kernel/rfFZ.js): a hole cut
  // across a bend after Unfold then Fold (rfFT pin 2 / M26), a drafted round boss (S20), overlapping pattern instances.
  // OpenCascade: every feature 'ok', valid, one body, the closed form to 1e-8; Anvil to the tolerance given ---
  var FZ_PI = Math.PI, FZ_T = 0.0598, FZ_r2 = 0.75 - Math.tan(3 * FZ_PI / 180);
  function fzLens(r, d) { return 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d); }
  var FZ_CASES = [
    { name: 'Ø0.5 hole cut across the bend of an unfolded L bracket, folded back (π r² T out)', anvilTol: 3e-4,
      code: 'p.units("in"); p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });\np.unfold([3, 0.0598, 2], null);\np.sketch("Top", 0.0598).circle(3, 0.05, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n',
      want: 6 * (FZ_T * (4 - 2 * FZ_T + 1.5 - 2 * FZ_T) + FZ_PI / 4 * (4 * FZ_T * FZ_T - FZ_T * FZ_T)) - FZ_PI * 0.0625 * FZ_T },
    { name: 'Ø1.5 × 1 boss with 3° draft: the cone frustum', anvilTol: 1e-9,
      code: 'p.units("in"); p.sketch("Top").circle(0, 0, 0.75).end().extrude(1, { draft: 3 });', want: FZ_PI / 3 * (0.5625 + 0.75 * FZ_r2 + FZ_r2 * FZ_r2) },
    { name: 'four Ø1 bosses at 0.8 pitch and five Ø0.5 holes at 0.4 pitch, overlapping, on a plate', anvilTol: 1e-6,
      code: 'p.units("in");\np.sketch("Top").rect(-1, -1.5, 4, 3).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0, 0, 0.5).end().extrude(0.5);\np.linearPattern({ dir: "x", spacing: 0.8, count: 4 });\np.sketch("Top", 0.25).circle(0, 0.95, 0.25).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 0.4, count: 5 });\n',
      want: 3 + 0.5 * (4 * FZ_PI * 0.25 - 3 * fzLens(0.5, 0.8)) - 0.25 * (5 * FZ_PI * 0.0625 - 4 * fzLens(0.25, 0.4)) },
    { name: 'six Ø1 bosses round a circle of radius 0.6, overlapping (union 1.685251663 by a 4·10⁶-strip integration)', anvilTol: 1e-5, occtTol: 1e-9,
      code: 'p.units("in");\np.sketch("Top").circle(3, 3, 0.5).end().extrude(0.5);\np.circularPattern({ axis: "y", center: [3, 0, -3.6], count: 6 });\n', want: 1.6852516631899304 }
  ];
  for (var fzc of FZ_CASES) {
    try {
      var tfz = performance.now(), mfz = K.newModel('T'); K.runScript(mfz, fzc.code);
      var afz = K.rebuild(JSON.parse(JSON.stringify(mfz))), avfz = K.massProps(K.meshFromBody(afz.body), 1).volume;
      var rfz = await occt(JSON.parse(JSON.stringify(mfz)), { noCache: true }), whyFZ = [];
      if (Object.keys(afz.errors).length) whyFZ.push('Anvil errors ' + JSON.stringify(afz.errors));
      if (rfz.unsupported || !rfz.ok) whyFZ.push('OpenCascade did not build every feature: ' + (rfz.unsupported || JSON.stringify(rfz.status)));
      if (!rfz.valid) whyFZ.push('invalid solid');
      if (rfz.bodies !== 1) whyFZ.push('OpenCascade made ' + rfz.bodies + ' bodies');
      if (!(Math.abs(rfz.volume - fzc.want) <= (fzc.occtTol || 1e-8) * fzc.want)) whyFZ.push('OpenCascade volume ' + rfz.volume + ', exact ' + fzc.want);
      if (!(Math.abs(avfz - fzc.want) <= fzc.anvilTol * fzc.want)) whyFZ.push('Anvil volume ' + avfz + ', exact ' + fzc.want);
      row(whyFZ.length ? 'bad' : 'ok', 'rfFZ OpenCascade builds it exactly: ' + fzc.name, whyFZ.join('\n') || ('OpenCascade ' + rfz.volume.toFixed(9) + ' / Anvil ' + avfz.toFixed(9) + ' / exact ' + fzc.want.toFixed(9)), performance.now() - tfz);
      counts[whyFZ.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfFZ OpenCascade builds it exactly: ' + fzc.name, e.message); counts.fail++; }
  }
  // lane FZ2: rfGA corpus rows OpenCascade had wrong (Anvil right): G01 handwheel (fixed-order volume integration
  // 1.2e-4 heavy: now adaptive), G10 Mirror of a fillet (refused: now the fillet on the mirrored edge), G20 Intersect
  // common of crossed cylinders (regions numbered unlike Anvil's: lumps touching at points now one region), G30 / G31 /
  // G32 overlapping pattern instances (lane FZ's tool lists). OpenCascade: ok, valid, one body, the closed form (1e-8)
  function fzBetween(a, r0, r1) {   // a Ø2a cylinder along x between the cylinders r0 and r1 about y (z = a sin t, Simpson)
    var n = 4000, s = 0;
    for (var i = 0; i <= n; i++) { var t = -Math.PI / 2 + Math.PI * i / n, z = a * Math.sin(t), w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * 2 * a * a * Math.cos(t) * Math.cos(t) * (Math.sqrt(r1 * r1 - z * z) - Math.sqrt(r0 * r0 - z * z)); }
    return s * (Math.PI / n) / 3;
  }
  var FZ2_CASES = [
    { name: 'G01 handwheel: revolved rim and hub, CirPattern ×5 of a Ø0.375 spoke', want: FZ_PI * 2.75 * 0.5 + FZ_PI * (0.390625 - 0.0625) + 5 * fzBetween(0.1875, 0.625, 2.5),
      code: 'p.sketch("Front").rect(2.5, 0, 0.5, 0.5).end().revolve(360);\np.sketch("Front").polyline([[0.25, -0.25], [0.625, -0.25], [0.625, 0.75], [0.25, 0.75]]).end().revolve(360);\np.sketch("Right", 0.5).circle(0, 0.25, 0.1875).end().extrude(2.25);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 5 });\n' },
    { name: 'G10 Mirror (feature) of an R0.25 fillet on a 4 × 2 × 0.5 plate', want: 4 - 2 * (1 - FZ_PI / 4) * 0.0625 * 2,
      code: 'p.sketch("Top").rect(-2, -1, 4, 2).end().extrude(0.5);\np.fillet(0.25, [[2, 0.5, 0]]);\np.mirror("Right");\n' },
    { name: 'G20 Intersect, common kept: two Ø2 × 2 cylinders crossed (Steinmetz 16/3)', want: 16 / 3,
      code: 'p.sketch("Top").circle(0, 0, 1).end().extrude(2, { midplane: true });\np.sketch("Right").circle(0, 0, 1).end().extrude(2, { midplane: true, merge: false });\np.intersect({ regions: [false, false, true] });\n' },
    { name: 'G30 LPattern ×4 of a 1 × 1 × 0.5 block at 0.75 (copies overlap) on a plate', want: 1.25 + 3.25 * 0.5,
      code: 'p.sketch("Top").rect(0, -1, 5, 1).end().extrude(0.25);\np.sketch("Top", 0.25).rect(0.5, -1, 1, 1).end().extrude(0.5);\np.linearPattern({ dir: "x", spacing: 0.75, count: 4 });\n' },
    { name: 'G31 CirPattern ×6 of a Ø0.8 hole 0.6 off centre (holes overlap)', want: 0.25 * (4 * FZ_PI - 6 * FZ_PI * 0.16 + 6 * fzLens(0.4, 0.6)),
      code: 'p.sketch("Top").circle(0, 0, 2).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0.6, 0, 0.4).end().cut("through", { reverse: true });\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 6 });\n' },
    { name: 'G32 CirPattern ×4 of a bar from the axis (bars cross at the centre)', want: FZ_PI * 6.25 * 0.25 + 0.5 * (0.0625 + 4 * 1.875 * 0.25),
      code: 'p.sketch("Top").circle(0, 0, 2.5).end().extrude(0.25);\np.sketch("Top", 0.25).rect(0, -0.125, 2, 0.25).end().extrude(0.5);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 4 });\n' }
  ];
  for (var fz2 of FZ2_CASES) {
    try {
      var tfz2 = performance.now(), mfz2 = K.newModel('T'), whyFZ2 = []; K.runScript(mfz2, 'p.units("in");\n' + fz2.code);
      var rfz2 = await occt(JSON.parse(JSON.stringify(mfz2)), { noCache: true });
      if (rfz2.unsupported || !rfz2.ok) whyFZ2.push('OpenCascade did not build every feature: ' + (rfz2.unsupported || JSON.stringify(rfz2.status)));
      if (!rfz2.valid) whyFZ2.push('invalid solid');
      if (rfz2.bodies !== 1) whyFZ2.push('OpenCascade made ' + rfz2.bodies + ' bodies');
      if (!(Math.abs(rfz2.volume - fz2.want) <= 1e-8 * fz2.want)) whyFZ2.push('OpenCascade volume ' + rfz2.volume + ', exact ' + fz2.want);
      row(whyFZ2.length ? 'bad' : 'ok', 'rfFZ2 OpenCascade = closed form: ' + fz2.name, whyFZ2.join('\n') || ('OpenCascade ' + rfz2.volume.toFixed(9) + ' / exact ' + fz2.want.toFixed(9)), performance.now() - tfz2);
      counts[whyFZ2.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfFZ2 OpenCascade = closed form: ' + fz2.name, e.message); counts.fail++; }
  }
  // Shell + Mirror of a notched cylinder: OpenCascade's sharp-join offset made an invalid solid there and the Mirror's
  // Boolean on it ran for minutes. Now the shell is refused in a plain sentence (or, should OpenCascade ever build it,
  // valid and within the swap tolerance of Anvil), the build ends in seconds, and Anvil's part drives.
  try {
    var tfzs = performance.now(), mfzs = K.newModel('T'), whyFZS = [];
    K.runScript(mfzs, 'p.units("mm");\np.cylinder(15, 40);\np.sketch("Front").rect(3, 18, 17, 4).end().cut("through");\np.shell(2, [[12, 0, 0]]);\np.mirror("Right", { body: true, offset: 12 });\n');
    var afzs = K.rebuild(JSON.parse(JSON.stringify(mfzs))), avfzs = K.massProps(K.meshFromBody(afzs.body), 1).volume;
    var t1fzs = performance.now(), rfzs = await occt(JSON.parse(JSON.stringify(mfzs)), { noCache: true }), msfzs = performance.now() - t1fzs;
    if (Object.keys(afzs.errors).length) whyFZS.push('Anvil errors ' + JSON.stringify(afzs.errors));
    if (msfzs > 10000) whyFZS.push('OpenCascade took ' + (msfzs / 1000).toFixed(1) + ' s');
    var shSt = String(rfzs.status && rfzs.status[mfzs.features.filter(function (x) { return x.type === 'shell'; })[0].id]);
    if (shSt === 'ok') { if (!rfzs.valid || !(Math.abs(rfzs.volume - avfzs) <= 2e-2 * avfzs)) whyFZS.push('OpenCascade shelled it: valid ' + rfzs.valid + ', volume ' + rfzs.volume + ' vs Anvil ' + avfzs); }
    else if (!/^error: [A-Z][^]*\.$/.test(shSt)) whyFZS.push('Shell status ' + shSt);
    row(whyFZS.length ? 'bad' : 'ok', 'rfFZ Shell + Mirror of a notched cylinder: OpenCascade ends in seconds, never returns an invalid shell', whyFZS.join('\n') || ('OpenCascade ' + (msfzs / 1000).toFixed(2) + ' s, shell: ' + shSt + '; Anvil ' + avfzs.toFixed(3)), performance.now() - tfzs);
    counts[whyFZS.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfFZ Shell + Mirror of a notched cylinder: OpenCascade ends in seconds, never returns an invalid shell', e.message); counts.fail++; }
  // --- end rfFZ ---
