  // --- r4/drawings4 ---
  // drawings of OpenCascade's Mug: where the handle's tube meets the wall the edge is drawn from points on the true
  // intersection of the two cylinders (no chord more than 0.005 mm off it), and the handle's outline in the isometric
  // runs on from the bend's exact silhouette into the straight tube's with no gap
  try {
    var t4 = performance.now(), mm = K.newModel('T'); K.runScript(mm, EX.find(function (e) { return e.name === 'Mug'; }).code);
    var mb = K.rebuild(mm), mmesh = K.meshFromBody(mb.body), mts = new Int32Array(mmesh.triCount), mt = 0;
    mmesh.faces.forEach(function (f) { f.polys.forEach(function (p) { for (var i = 0; i < p.vertices.length - 2; i++) mts[mt++] = p.shared == null ? -1 : p.shared; }); });
    var mr = await new Promise(function (res, rej) { var s4 = ++seq; waiting[s4] = { res: res, rej: rej }; worker.postMessage({ type: 'build', seq: s4, model: JSON.parse(JSON.stringify(mm)), noCache: true, anvil: { key: 9, positions: mmesh.positions, triShared: mts } }); });
    var om = K.meshFromBody(OcctKernel.fromPacked(mr, mr.packed || [], mb, CSG, K).body);
    var fr = Drawing.projectView(om, 'Front'), why4 = [], onCurve = 0, worst = 0;
    // Front view: u = x, v = y; the lower handle tube (axis along x at y = 20, r 5) meets the wall (r 40) on
    // x = sqrt(1600 − z²) with (y − 20)² + z² = 25, i.e. x = sqrt(1575 + (y − 20)²)
    function wallX(y) { return Math.sqrt(1575 + (y - 20) * (y - 20)); }
    fr.lines.visible.concat(fr.lines.hidden).forEach(function (l) {
      if (Math.min(l[1], l[3]) < 15 - 1e-6 || Math.max(l[1], l[3]) > 25 + 1e-6 || Math.abs(l[0] - wallX(l[1])) > 1e-4 || Math.abs(l[2] - wallX(l[3])) > 1e-4 || Math.abs(l[3] - l[1]) < 1e-9) return;
      onCurve++;
      var my = (l[1] + l[3]) / 2, mx = (l[0] + l[2]) / 2;
      worst = Math.max(worst, Math.abs(mx - wallX(my)));
    });
    if (onCurve < 8) why4.push('only ' + onCurve + ' pieces on the intersection curve');
    if (!(worst < 0.005)) why4.push('a chord ' + worst.toFixed(4) + ' mm off the curve');
    // every end of a visible line either meets another line (an end, a T at an occluding outline: within 0.02 mm)
    // or is clear of everything (1 mm): an end 0.02 … 1 mm short of a line is a broken outline
    var iso = Drawing.projectView(om, 'Isometric', { display: 'hlr' }), IL = iso.lines.visible, gaps = [];
    function segD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    IL.forEach(function (l, i) {
      [[l[0], l[1]], [l[2], l[3]]].forEach(function (p) {
        var m = Infinity;
        IL.forEach(function (k, j) { if (j !== i) m = Math.min(m, segD(p, k)); });
        if (m > 0.02 && m < 1) gaps.push(p.map(function (x) { return x.toFixed(3); }).join(',') + ' (' + m.toFixed(3) + ')');
      });
    });
    if (gaps.length) why4.push(gaps.length + ' line ends just short of another line in the isometric (a broken outline): ' + gaps.slice(0, 4).join(' '));
    row(why4.length ? 'bad' : 'ok', 'Mug drawing: exact intersection curve of the handle and the wall, joined handle outline', why4.join('; ') || (onCurve + ' pieces on the curve, worst chord ' + worst.toExponential(1) + ' mm'), performance.now() - t4);
    counts[why4.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'Mug drawing on OpenCascade', e.message); counts.fail++; }
  // --- end r4/drawings4 ---
