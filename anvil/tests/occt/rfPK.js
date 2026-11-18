  // --- rfPK (lane smmirror, 2026-11-18; kernel side tests/kernel/rfPK.js): a Mirror / Pattern of an Edge Flange, Hem,
  // Miter Flange, edge Jog or Closed Corner is that feature again on the copied edges on OpenCascade too (occt-kernel.js
  // bendFamilyOp through Kernel.bendFamily; it said "Mirror source feature has no geometry": a flange has no tool there).
  // Each row: OpenCascade builds every feature, one valid solid, volume = OpenCascade's own part with the feature picked
  // on every edge to 1e-9, and = Anvil's mirror within the faceted bends' tolerance (2e-3 relative).
  var PK_T = 0.1196, PK_T2 = 0.0598, PK_IN = '{ position: "inside", lengthRef: "outer" }';
  var PK_BASE = 'p.units("in");\np.sheet(0.1196, 0.12, 0.44);\np.sketch("Top").rect(-2, -5, 4, 5).end().baseFlange();\n';
  var PK_GUS = PK_BASE + 'p.sketch("Top", ' + PK_T + ').line(-2.6, -3, 2.6, -3).end();\np.sketchedBend(90, { sketch: 3, fixed: [0, ' + PK_T + ', 1.2] });\n';
  var PK_PROF = 'p.sketch("Right").line(-5, ' + PK_T + ', -5, ' + (PK_T + 1) + ').line(-5, ' + (PK_T + 1) + ', -4.5, ' + (PK_T + 1) + ').end();\n';
  var PK_PL = 'p.units("in");\np.sheet(' + PK_T2 + ', ' + PK_T2 + ', 0.5);\np.sketch("Top").rect(-4, -2, 8, 2).end().baseFlange();\np.flange(1, [[0, ' + PK_T2 + ', 2]], ' + PK_IN + ');\n';
  var PK_P = [4 - PK_T2 / 2, 0.6, 2 - 2 * PK_T2], PK_O = '{ cornerType: "overlap", gap: 0.01, ratio: 1, coplanar: false }';
  var PK_CASES = [
    { name: 'the report\'s bracket, Edge-Flange mirrored (Right)', a: PK_BASE + 'p.flange(1.5, [[2, ' + PK_T + ', 1]], ' + PK_IN + ');\np.mirror("Right", { feature: 3 });', b: PK_BASE + 'p.flange(1.5, [[2, ' + PK_T + ', 1], [-2, ' + PK_T + ', 1]], ' + PK_IN + ');' },
    { name: 'the gusset: Sketched Bend, Edge-Flange and closed Hem, each mirrored', a: PK_GUS + 'p.flange(1.5, [[2, ' + PK_T + ', 1.2]], ' + PK_IN + ');\np.mirror("Right", { feature: 5 });\np.hem(0.375, [[2, 1.5, 1.2]], { hemType: "closed" });\np.mirror("Right", { feature: 7 });',
      b: PK_GUS + 'p.flange(1.5, [[2, ' + PK_T + ', 1.2], [-2, ' + PK_T + ', 1.2]], ' + PK_IN + ');\np.hem(0.375, [[2, 1.5, 1.2], [-2, 1.5, 1.2]], { hemType: "closed" });' },
    { name: 'a Miter Flange mirrored (Front, 2.5)', a: PK_BASE + PK_PROF + 'p.miterFlange([[0, ' + PK_T + ', 5]], { position: "inside", miterGap: 0.01 });\np.mirror("Front", { feature: 4, offset: 2.5 });', b: PK_BASE + PK_PROF + 'p.miterFlange([[0, ' + PK_T + ', 5], [0, ' + PK_T + ', 0]], { position: "inside", miterGap: 0.01 });' },
    { name: 'an edge Jog mirrored', a: PK_BASE + 'p.jog(0.5, 1, [[2, ' + PK_T + ', 2.5]]);\np.mirror("Right", { feature: 3 });', b: PK_BASE + 'p.jog(0.5, 1, [[2, ' + PK_T + ', 2.5], [-2, ' + PK_T + ', 2.5]]);' },
    { name: 'an Overlap Closed Corner and its flange mirrored', a: PK_PL + 'var rf = p.flange(1, [[4, ' + PK_T2 + ', 1]], ' + PK_IN + ').last();\np.mirror("Right", { feature: rf });\nvar c = p.closedCorner([' + JSON.stringify(PK_P) + '], ' + PK_O + ').last();\np.mirror("Right", { feature: c });',
      b: PK_PL + 'p.flange(1, [[4, ' + PK_T2 + ', 1], [-4, ' + PK_T2 + ', 1]], ' + PK_IN + ');\np.closedCorner([' + JSON.stringify(PK_P) + ', ' + JSON.stringify([-PK_P[0], PK_P[1], PK_P[2]]) + '], ' + PK_O + ');' },
    { name: 'a Circular Pattern (4 about Y) of a flange on a square', a: 'p.units("in");\np.sheet(0.1196, 0.12, 0.44);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\np.flange(1, [[2, ' + PK_T + ', 0]], { position: "inside", lengthRef: "outer", relief: "rect" });\np.circularPattern({ feature: 3, axis: "y", center: [0, 0, 0], count: 4 });',
      b: 'p.units("in");\np.sheet(0.1196, 0.12, 0.44);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\n' + ['[2, ' + PK_T + ', 0]', '[0, ' + PK_T + ', -2]', '[-2, ' + PK_T + ', 0]', '[0, ' + PK_T + ', 2]'].map(function (e) { return 'p.flange(1, [' + e + '], { position: "inside", lengthRef: "outer", relief: "rect" });\n'; }).join('') }
  ];
  for (var pkc of PK_CASES) {
    var pkName = 'rfPK ' + pkc.name + ': OpenCascade = the feature on every edge (1e-9), = Anvil (2e-3)';
    try {
      var tpk = performance.now(), whyPk = [];
      var mpa = K.newModel('PKa'); K.runScript(mpa, pkc.a);
      var mpb = K.newModel('PKb'); K.runScript(mpb, pkc.b);
      var bpa = K.rebuild(mpa), apa = K.massProps(K.meshFromBody(bpa.body), mpa.density);
      if (Object.keys(bpa.errors).length) whyPk.push('Anvil: ' + JSON.stringify(bpa.errors));
      var ra = await occt(JSON.parse(JSON.stringify(mpa)), { noCache: true }), rb = await occt(JSON.parse(JSON.stringify(mpb)), { noCache: true });
      [['mirror / pattern', ra], ['every edge', rb]].forEach(function (q) { if (!q[1].ok || !q[1].valid || q[1].bodies !== 1) whyPk.push(q[0] + ': ok ' + q[1].ok + ', valid ' + q[1].valid + ', ' + q[1].bodies + ' bodies ' + JSON.stringify(q[1].status)); });
      if (!(Math.abs(ra.volume - rb.volume) <= 1e-9 * rb.volume)) whyPk.push('volume ' + ra.volume + ', the feature on every edge ' + rb.volume);
      if (!(Math.abs(ra.volume - apa.volume) <= 2e-3 * apa.volume)) whyPk.push('volume ' + ra.volume + ', Anvil ' + apa.volume);
      row(whyPk.length ? 'bad' : 'ok', pkName, whyPk.join('\n') || 'volume ' + ra.volume.toFixed(9) + ' (Anvil ' + apa.volume.toFixed(9) + ')', performance.now() - tpk);
      counts[whyPk.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', pkName, e.message); counts.fail++; }
  }
  // a Mirror of a Sketched Bend is refused with the same reason as on Anvil's engine
  try {
    var mpr = K.newModel('PKr'); K.runScript(mpr, PK_GUS + 'p.mirror("Right", { feature: 4, offset: 1 });');
    var rpr = await occt(JSON.parse(JSON.stringify(mpr)), { noCache: true }), spr = String(rpr.status[5] || '');
    var okr = /^error: Cannot mirror SketchBend1: SolidWorks mirrors Edge Flanges/.test(spr) && rpr.bodies === 1;
    row(okr ? 'ok' : 'bad', 'rfPK a Mirror of a Sketched Bend: refused with the reason on OpenCascade too, the part before it kept', spr + ', ' + rpr.bodies + ' bodies');
    counts[okr ? 'pass' : 'fail']++;
  } catch (e) { row('bad', 'rfPK a Mirror of a Sketched Bend', e.message); counts.fail++; }
  // task 2 (found by lane chamferpat): a Cut-Extrude with no direction on a model Anvil's engine never rebuilt (Anvil's
  // rebuild turns it into the material and writes `reverse`): OpenCascade cut +n only, so a cut sketched on a top face
  // cut nothing. occt-kernel.js autoCutDir decides it the same way (profile points classified along each direction).
  var PK_DIR = [
    { name: 'a hole sketched on the top face of a 1 in block, cut .5 with no direction (+Y leaves the part)', code: 'p.units("in");\np.sketch("Top").rect(0, -2, 4, 2).end().extrude(1);\np.sketch("Top", 1).circle(2, -1, 0.5).end().cut(0.5);', want: true },
    { name: 'a slot and a hole on the top face, through-all depth 5, no direction', code: 'p.units("in");\np.sketch("Top").rect(0, -2, 4, 2).end().extrude(1);\np.sketch("Top", 1).slot(0.5, -1, 1.5, -1, 0.4).circle(3, -1, 0.3).end().cut(5);', want: true },
    { name: 'a hole sketched on the bottom face (Top Plane), +Y goes into the part: stays +Y', code: 'p.units("in");\np.sketch("Top").rect(0, -2, 4, 2).end().extrude(1);\np.sketch("Top").circle(2, -1, 0.5).end().cut(0.5);', want: false }
  ];
  for (var pkd of PK_DIR) {
    var pkdName = 'rfPK ' + pkd.name + ': OpenCascade cuts into the material on a model Anvil never rebuilt (= Anvil, 1e-9)';
    try {
      var tpd = performance.now(), whyPd = [];
      var mpd = K.newModel('PKd'); K.runScript(mpd, pkd.code);
      var raw = JSON.parse(JSON.stringify(mpd)), cutF = raw.features[raw.features.length - 1];
      if (cutF.reverse != null) whyPd.push('the script wrote a direction: ' + cutF.reverse);
      var rpd = await occt(raw, { noCache: true });
      var bpd = K.rebuild(mpd), apd = K.massProps(K.meshFromBody(bpd.body), mpd.density);
      if (!!mpd.features[mpd.features.length - 1].reverse !== pkd.want) whyPd.push('Anvil turned it ' + (pkd.want ? 'not ' : '') + 'round: reverse ' + mpd.features[mpd.features.length - 1].reverse);
      if (!rpd.ok || !rpd.valid || rpd.bodies !== 1) whyPd.push('OpenCascade: ok ' + rpd.ok + ', valid ' + rpd.valid + ', ' + rpd.bodies + ' bodies ' + JSON.stringify(rpd.status));
      if (!(Math.abs(rpd.volume - apd.volume) <= 1e-9 * apd.volume)) whyPd.push('volume ' + rpd.volume + ', Anvil ' + apd.volume + ' (the block: 16)');
      row(whyPd.length ? 'bad' : 'ok', pkdName, whyPd.join('\n') || 'volume ' + rpd.volume.toFixed(9) + (rpd.cutDirs ? ', cutDirs ' + JSON.stringify(rpd.cutDirs) : ''), performance.now() - tpd);
      counts[whyPd.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', pkdName, e.message); counts.fail++; }
  }
  // --- end rfPK ---
