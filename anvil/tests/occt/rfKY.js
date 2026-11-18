  // --- rfKY (lane occtparity, test-reports/2026-11-11-occt-sheetmetal-parity.md): Forming Tools and Lofted-Bend were
  // the two sheet-metal features OpenCascade did not build (the app showed Anvil's part with an amber "needs" chip).
  // formingToolOp cuts Kernel.formingToolLayout's footprint and fuses its sections (revolved / extruded, exact arcs);
  // loftedBendTool sews Kernel.buildLoftedBend's planar facets into one solid. Each row: every feature built, a valid
  // solid, one body, volume = Anvil's to 1e-9 (both exact: Anvil's curved facets carry their records), box to 1e-6,
  // and the same flat from both kernels' meshes (size 1e-9, loops, bends, DXF entities per layer) ---
  var KY_T = 0.0747, KY_S = 'p.units("in");\np.sheet(' + KY_T + ', 0.06, 0.5);\n', KY_B = KY_S + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
  var KY_A = 'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n';
  var KY_RND = 'var b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\n';
  var KY_CASES = ['dimple', 'extrudedHole', 'louver', 'lance', 'rib'].map(function (t) { return { name: 'Forming Tool ' + t + ' on a 14 ga 6 × 4 plate', code: KY_B + 'p.formingTool("' + t + '", [3, ' + KY_T + ', 2]);\n' }; }).concat([
    { name: 'Forming Tool dimple flipped, 30°', code: KY_B + 'p.formingTool("dimple", [3, ' + KY_T + ', 2], { flip: true, angle: 30 });\n' },
    { name: 'Forming Tool rib on an edge flange\'s wall', code: KY_B + 'p.flange(2, [[3, ' + KY_T + ', 0]], { position: "inside" });\np.formingTool("rib", [3, 1.2, 0]);\n' },
    { name: 'Forming Tool extruded hole, mm', code: 'p.units("mm");\np.sheet(2, 2, 0.44);\np.sketch("Top").rect(0, -100, 150, 100).end().baseFlange();\np.formingTool("extrudedHole", [75, 2, 50]);\n' },
    { name: 'Lofted-Bend square to square', code: KY_S + KY_A + 'var b = p.sketch("Top", 3).polyline([[0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1], [-0.0005, -1]], false).id();\np.loftedBend([a, b]);\n' },
    { name: 'Lofted-Bend square to round (bent)', code: KY_S + KY_A + KY_RND + 'p.loftedBend([a, b]);\n' },
    { name: 'Lofted-Bend square to round (formed)', code: KY_S + KY_A + KY_RND + 'p.loftedBend([a, b], { method: "formed" });\n' },
    { name: 'Lofted-Bend with a Ø.5 hole through both sides (holes developed as polylines: DXF entity counts not compared)', noDxf: true,
      code: KY_S + KY_A + 'var b = p.sketch("Top", 3).polyline([[0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1], [-0.0005, -1]], false).id();\np.loftedBend([a, b]);\np.sketch("Front", 3).circle(0.5, 1.5, 0.25).end().cut("through");\n' }
  ]);
  for (var kyi = 0; kyi < KY_CASES.length; kyi++) {
    var ky = KY_CASES[kyi], tky = performance.now();
    try {
      var kym = K.newModel('T'); K.runScript(kym, ky.code);
      var kyb = K.rebuild(kym), kymesh = K.meshFromBody(kyb.body), whyY = [];
      if (Object.keys(kyb.errors).length) whyY.push('Anvil errors ' + JSON.stringify(kyb.errors));
      var kyr = await occt(kym, { noCache: true });
      if (kyr.unsupported) whyY.push('OpenCascade: unsupported ' + kyr.unsupported);
      Object.keys(kyr.status).forEach(function (id) { if (kyr.status[id] !== 'ok') whyY.push('OpenCascade feature ' + id + ': ' + kyr.status[id]); });
      if (!kyr.valid) whyY.push('invalid solid');
      if (kyr.bodies !== 1) whyY.push(kyr.bodies + ' bodies');
      var kya = K.massProps(kymesh, 1).volume;
      if (!(Math.abs(kyr.volume - kya) <= 1e-9 * kya)) whyY.push('volume ' + kyr.volume.toFixed(9) + ' vs Anvil ' + kya.toFixed(9));
      var kybb = kyb.body.getBounds(), kydb = 0;
      if (kyr.bbox) for (var kc = 0; kc < 3; kc++) kydb = Math.max(kydb, Math.abs(kyr.bbox[0][kc] - kybb.min[kc]), Math.abs(kyr.bbox[1][kc] - kybb.max[kc])); else kydb = Infinity;
      if (!(kydb <= 1e-6 * (kym.units === 'mm' ? 25.4 : 1))) whyY.push('bbox off by ' + kydb.toExponential(2));
      var kyfo = null;
      if (!whyY.length) {
        var kyfa = K.flatPattern(kym, kyb, kymesh), kyob = OcctKernel.toBuild(kyr, kyb, kymesh, null, CSG, K);
        kyfo = K.flatPattern(kym, kyob, K.meshFromBody(kyob.body));
        [0, 1].forEach(function (k) { if (Math.abs(kyfo.size[k] - kyfa.size[k]) > 1e-9) whyY.push('flat ' + 'wh'[k] + ' ' + kyfo.size[k].toFixed(6) + ' vs Anvil ' + kyfa.size[k].toFixed(6)); });
        if (kyfo.loops.length !== kyfa.loops.length) whyY.push('loops ' + kyfo.loops.length + ' / Anvil ' + kyfa.loops.length);
        if (kyfo.bends.length !== kyfa.bends.length) whyY.push('bends ' + kyfo.bends.length + ' / Anvil ' + kyfa.bends.length);
        var kySrt = function (o) { var s = {}; Object.keys(o).sort().forEach(function (k) { s[k] = o[k]; }); return JSON.stringify(s); };
        if (!ky.noDxf && kySrt(shDxf(kyfo)) !== kySrt(shDxf(kyfa))) whyY.push('DXF ' + JSON.stringify(shDxf(kyfo)) + ' vs Anvil ' + JSON.stringify(shDxf(kyfa)));
      }
      row(whyY.length ? 'bad' : 'ok', 'rfKY: OpenCascade = Anvil: ' + ky.name, whyY.join('\n') || ('volume ' + kyr.volume.toFixed(9) + ' (Anvil ' + kya.toFixed(9) + '), flat ' + kyfo.size.map(function (v) { return v.toFixed(4); }).join(' × ') + ', ' + kyfo.loops.length + ' loop' + (kyfo.loops.length === 1 ? '' : 's') + ', ' + kyfo.bends.length + ' bend' + (kyfo.bends.length === 1 ? '' : 's') + (ky.noDxf ? '' : ', DXF ' + JSON.stringify(shDxf(kyfo)))), performance.now() - tky);
      counts[whyY.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfKY: OpenCascade = Anvil: ' + ky.name, e.message); counts.fail++; }
  }
  // --- end rfKY ---
