  // --- rfHU (lane occt, 2026-11-04; the same cases as tests/kernel/rfHU.js): a fillet or chamfer whose size uses up the
  // face beside its edge (the user's part: R50 on the top edge of a block 50 deep). OpenCascade refused them ("radius
  // too large?"); now built on a widened body and trimmed back: ok, valid, one body, the closed form to 1e-9, the B-rep
  // face count SolidWorks shows (no sliver face). Then perforated panels (one Boolean per nesting level of the sketch:
  // 600 holes were 599 Fuses in a row, ~120 s on the desktop engine) and the tangent-face angle (rfHL's TANGENT_ANG
  // was undefined when it was used, so planar faces 0.5° apart were never tangent) ---
  var HU_q = 1 - Math.PI / 4;
  function huF(x) { var s = Math.sqrt(2500 - x * x); return 15 * (x * s / 2 + 1250 * Math.asin(x / 50)) + Math.pow(2500 - x * x, 1.5) / 3; }
  var HU_CASES = [
    { name: 'the user\'s part: 120 × 75 × 50 in, R3 and R50 (eats the 50 deep top face) on the end, chamfer 15', faces: 8,
      code: 'p.units("in");\np.sketch("Right").rect(-56.975, -37.075, 120, 75).end().extrude(50);\np.fillet(3, [[50, -37.075, -3.025]]);\np.fillet(50, [[50, 37.925, -3.025]]);\np.chamfer(15, [[0, 0.425, 56.975]]);\n',
      want: 450000 - HU_q * 9 * 120 - HU_q * 2500 * 120 - (25 * 112.5 + huF(15) - huF(0)) },
    { name: 'R3 on a block 3 deep: the top face is used up', faces: 6, code: 'p.sketch("Front").rect(0, 0, 4, 5).end().extrude(3);\np.fillet(3, [[2, 5, 3]]);\n', want: 60 - HU_q * 36 },
    { name: 'chamfer 3 on a block 3 deep: the top face is used up', faces: 6, code: 'p.sketch("Front").rect(0, 0, 4, 5).end().extrude(3);\np.chamfer(3, [[2, 5, 3]]);\n', want: 42 },
    { name: 'R2 on a 2 × 2 bar: both faces used up (a quarter round)', faces: 5, code: 'p.sketch("Front").rect(0, 0, 2, 2).end().extrude(6);\np.fillet(2, [[2, 2, 3]]);\n', want: 6 * Math.PI },
    { name: 'concave R3 in a step 3 high: the riser is used up', faces: 8, code: 'p.sketch("Front").polyline([[0, 0], [6, 0], [6, 2], [2, 2], [2, 5], [0, 5]], true).end().extrude(4);\np.fillet(3, [[2, 2, 2]]);\n', want: 72 + HU_q * 36 }
  ];
  function huPerf(n, boss) {
    var cols = n === 600 ? 30 : n === 1800 ? 60 : n === 200 ? 20 : 10, rows = n / cols, T = 0.0598, r = 0.125, c = '';
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) c += '.circle(' + (0.25 + i * 0.5) + ', ' + (0.25 + j * 0.5) + ', ' + r + ')';
    var W = cols * 0.5, H = rows * 0.5;
    return { code: 'p.units("in");\n' + (boss ? 'p.sketch("Top").rect(0, 0, ' + W + ', ' + H + ')' + c + '.end().extrude(' + T + ');\n'
      : 'p.sketch("Top").rect(0, 0, ' + W + ', ' + H + ').end().extrude(' + T + ');\np.sketch("Top", ' + T + ')' + c + '.end().cut("through", { reverse: true });\n'),
      want: (W * H - n * Math.PI * r * r) * T, faces: n + 6 };
  }
  function huCheck(code, want, faces, opts) {
    var m = K.newModel('T'); K.runScript(m, code);
    return occt(JSON.parse(JSON.stringify(m)), { noCache: true }).then(function (r) {
      var why = [];
      if (r.unsupported || !r.ok) why.push('OpenCascade did not build every feature: ' + (r.unsupported || JSON.stringify(r.status)));
      if (!r.valid) why.push('invalid solid');
      if (r.bodies !== 1) why.push('OpenCascade made ' + r.bodies + ' bodies');
      if (!(Math.abs(r.volume - want) <= 1e-9 * want)) why.push('OpenCascade volume ' + r.volume + ', exact ' + want);
      if (r.faces.length !== faces) why.push(r.faces.length + ' B-rep faces, want ' + faces);
      return { r: r, why: why, m: m };
    });
  }
  for (var huc of HU_CASES) {
    try {
      var thu = performance.now(), hu = await huCheck(huc.code, huc.want, huc.faces);
      var ahu = K.rebuild(JSON.parse(JSON.stringify(hu.m))), avhu = K.massProps(K.meshFromBody(ahu.body), 1).volume;
      if (Object.keys(ahu.errors).length) hu.why.push('Anvil errors ' + JSON.stringify(ahu.errors));
      if (!(Math.abs(avhu - huc.want) <= 1e-6 * huc.want)) hu.why.push('Anvil volume ' + avhu + ', exact ' + huc.want);
      row(hu.why.length ? 'bad' : 'ok', 'rfHU OpenCascade builds a round / chamfer that uses up a face: ' + huc.name, hu.why.join('\n') || ('OpenCascade ' + hu.r.volume.toFixed(9) + ' / Anvil ' + avhu.toFixed(9) + ' / exact ' + huc.want.toFixed(9) + ', ' + hu.r.faces.length + ' faces'), performance.now() - thu);
      counts[hu.why.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfHU OpenCascade builds a round / chamfer that uses up a face: ' + huc.name, e.message); counts.fail++; }
  }
  for (var hup of [[200, false], [200, true]]) {
    var hun = 'rfHU 200-hole perforated panel (' + (hup[1] ? 'one sketch: boss with holes' : 'Cut-Extrude of 200 circles') + '): one Boolean per sketch level, exact, < 40 s (62 s before in Node, 199 Fuses in a row)';
    try {
      var thp = performance.now(), pp = huPerf(hup[0], hup[1]), hp = await huCheck(pp.code, pp.want, pp.faces), msp = performance.now() - thp;
      if (msp > 40000) hp.why.push('OpenCascade took ' + (msp / 1000).toFixed(1) + ' s');
      row(hp.why.length ? 'bad' : 'ok', hun, hp.why.join('\n') || ('OpenCascade ' + hp.r.volume.toFixed(9) + ' / exact ' + pp.want.toFixed(9) + ', ' + hp.r.faces.length + ' faces, ' + (msp / 1000).toFixed(1) + ' s'), msp);
      counts[hp.why.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', hun, e.message); counts.fail++; }
  }
  // planar faces 0.5° apart are tangent (TANGENT_ANG = 1°), 2° apart are not
  try {
    var tht = performance.now(), whyT = [];
    if (!(OcctKernel.TANGENT_ANG > 0)) whyT.push('OcctKernel.TANGENT_ANG = ' + OcctKernel.TANGENT_ANG);
    for (var hut of [[0.5, true], [2, false]]) {
      var mt = K.newModel('T'), rise = 4 * Math.tan(hut[0] * Math.PI / 180);
      K.runScript(mt, 'p.sketch("Front").polyline([[0, 0], [4, 0], [8, ' + rise + '], [8, 1], [0, 1]], true).end().extrude(1);');
      var rt = await occt(JSON.parse(JSON.stringify(mt)), { noCache: true });
      // the two bottom faces: normals near -y
      var low = rt.faces.map(function (f, i) { return i; }).filter(function (i) { var f = rt.faces[i]; return f.type === 'plane'; });
      var pairs = low.filter(function (i) { return (rt.faces[i].tangent || []).length; }).length;
      if (hut[1] && pairs !== 2) whyT.push(hut[0] + '°: ' + pairs + ' faces marked tangent, want the 2 bottom faces');
      if (!hut[1] && pairs !== 0) whyT.push(hut[0] + '°: ' + pairs + ' faces marked tangent, want none');
    }
    row(whyT.length ? 'bad' : 'ok', 'rfHU OpenCascade tangent faces: 0.5° apart tangent, 2° apart not (TANGENT_ANG set before use)', whyT.join('\n') || 'TANGENT_ANG ' + (OcctKernel.TANGENT_ANG * 180 / Math.PI) + '°', performance.now() - tht);
    counts[whyT.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfHU OpenCascade tangent faces: 0.5° apart tangent, 2° apart not (TANGENT_ANG set before use)', e.message); counts.fail++; }
  // --- end rfHU ---
