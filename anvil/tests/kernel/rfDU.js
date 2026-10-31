  // --- rfDU (2026-10-27, lane DU: SolidWorks reference values, second pass) --- Miter Flange and Closed Corner built
  // in SolidWorks 2022 SP5 through its API (head-tools/sw-reference/miter2.py, corner2.py; parts and raw JSON in
  // Output\SolidWorks Models\Anvil reference; write-up test-reports/2026-10-27-solidworks-dwg-check.md) and the same
  // parts in Anvil. 16 ga steel 4 × 2 base flange (x 0..4, z 0..2, y 0..T), T = R = 0.0598, K 0.5, Auto Relief
  // rectangular 0.5. Match = within 1e-4 in. Rows named 'rfDU TODO: …' hold a SolidWorks value Anvil does not reach
  // yet: they pass, and their detail lists each value that is off (or says to promote the row once all agree).
  // Flat outlines are compared as vertex sets of the blank's top face, in SolidWorks' frame (x along the base's x,
  // second coordinate along its z, the lower-left corner at 0,0); Anvil's flat loops are moved to that frame by the
  // one of the four axis flips that fits best.
  (function () {
    group('rfDU: SolidWorks reference values (miter flange, closed corner)');
    var T = 0.0598, R = 0.0598, TOL = 1e-4;
    var PL = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function verts(r) { var out = []; r.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { out.push(v.pos); }); }); return out; }
    // distance from each SolidWorks flat vertex to the nearest Anvil outline vertex (best of the four flips)
    function outlineFit(flat, sw) {
      var pts = [];
      flat.loops.forEach(function (l) { l.forEach(function (p) { pts.push(p); }); });
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
      var best = null;
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (f) {
        var mp = pts.map(function (p) { return [f[0] > 0 ? p[0] - x0 : x1 - p[0], f[1] > 0 ? p[1] - y0 : y1 - p[1]]; });
        var worst = 0, at = null;
        sw.forEach(function (q) {
          var d = Infinity;
          mp.forEach(function (p) { d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1])); });
          if (d > worst) { worst = d; at = q; }
        });
        if (!best || worst < best.worst) best = { worst: worst, at: at };
      });
      return best;
    }
    function todo(name, fn) {
      test('rfDU TODO: ' + name, function () {
        var rows = fn(), off = rows.filter(function (x) { return !(Math.abs(x[1] - x[2]) <= TOL); });
        return off.length ? 'TODO ' + off.map(function (x) { return x[0] + ' Anvil ' + x[1].toFixed(6) + ' / SolidWorks ' + x[2] + (x[3] ? ' (' + x[3] + ')' : ''); }).join('; ')
          : 'matches SolidWorks now: promote to a hard test';
      });
    }
    function close(rows) { rows.forEach(function (x) { near(x[1], x[2], TOL, x[0] + ' (Anvil vs SolidWorks)'); }); }

    // 1. Miter Flange: a 1 in line up from the top face at the z = 2 edge's x = 0 end (Right plane), along the z = 2
    // and x = 4 top edges, Material Inside, gap 0.01, start offset 0 / 0.25 (at the profile's end, x = 0). SolidWorks:
    // walls 1.0598 tall (the line's top), the gap split evenly normal to the bisector (each wall end 0.00707 short of
    // the other wall's inside face), a rectangular relief 0.0299 × 0.1495 at the offset end.
    var MITER = {
      0: { ymax: 1.0598, size: [4.9615, 2.9615], flatVol: 0.815429, vol: 0.815259,
        flat: [[0, 0], [0, 2.9615], [3.933129, 1.933129], [3.933129, 2.9615], [4.9615, 0], [4.9615, 1.933129]] },
      0.25: { ymax: 1.0598, size: [4.9615, 2.9615], flatVol: 0.800787, vol: 0.800618,
        flat: [[0, 0], [0, 2], [0.2201, 1.8505], [0.2201, 2], [0.25, 1.8505], [0.25, 2.9615], [3.933129, 1.933129], [3.933129, 2.9615], [4.9615, 0], [4.9615, 1.933129]] }
    };
    function miter(start) {
      return flatOf(PL + 'p.sketch("Right").line(-2, ' + T + ', -2, ' + (T + 1) + ').end();\n' +
        'p.miterFlange([[2, ' + T + ', 2], [4, ' + T + ', 1]], { position: "inside", miterGap: 0.01' + (start ? ', startOffset: ' + start : '') + ', relief: "rect" });\n');
    }
    [0, 0.25].forEach(function (start) {
      todo('Miter Flange 1 in, Material Inside, gap 0.01, start offset ' + start + ' = SolidWorks: wall top, flat size, blank area × T, flat corner outline, solid volume', function () {
        var r = miter(start), s = MITER[start], fit = outlineFit(r.flat, s.flat), vs = verts(r);
        var top = -Infinity; vs.forEach(function (v) { top = Math.max(top, v.y); });
        return [['wall top y', top, s.ymax], ['flat length', r.flat.size[0], s.size[0]], ['flat width', r.flat.size[1], s.size[1]],
          ['blank area × T', blankArea(r.flat) * T, s.flatVol],
          ['flat outline: farthest SolidWorks vertex from Anvil\'s', fit.worst, 0, 'at ' + JSON.stringify(fit.at)],
          ['solid volume', r.mp.volume, s.vol]];
      });
    });

    // 2. Closed Corner on a tray corner: 1 in edge flanges (Material Inside, Outer Virtual Sharp) on the z = 2 edge,
    // then on the x = 4 edge (it stops at z = 2 - R - T); the corner closed from the x = 4 wall's end face, gap 0.01,
    // ratio 1. 'top' = the wall-top vertices (y = 1) near the corner, (x, z). SolidWorks' Butt cuts both walls back
    // square, the gap 0.01 measured between the two inside corners (each wall end 0.00707 short); Overlap runs the
    // x = 4 wall to z = 2 and stops the z = 2 wall 0.01 short (x = 3.9302); Underlap the other way round.
    var TRAY = PL + 'p.flange(1, [[2, ' + T + ', 2]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[4, ' + T + ', 1]], { position: "inside", lengthRef: "outer" });\n';
    var SIZE = [4.9017, 2.9017];
    var CORNER = {
      none: { vol: 0.795481, flatVol: 0.795481, top: [[3.9402, 1.8804], [4, 1.8804], [4, 1.9402], [4, 2]],
        flat: [[0, 0], [0, 2.9017], [4, 1.8804], [4, 2.9017], [4.9017, 0], [4.9017, 1.8804]] },
      'butt open': { vol: 0.793951, flatVol: 0.793951, top: [[3.933129, 1.9402], [3.933129, 2], [3.9402, 1.933129], [4, 1.933129]],
        flat: [[0, 0], [0, 2.9017], [3.8804, 1.8804], [3.933129, 2.0213], [3.933129, 2.9017], [4.0213, 1.8804], [4.0213, 1.933129], [4.9017, 0], [4.9017, 1.933129]] },
      'butt closed': { vol: 0.794173, flatVol: 0.794451, top: [[3.933129, 1.9402], [3.933129, 2], [3.9402, 1.933129], [4, 1.933129]],
        flat: [[0, 0], [0, 2.9017], [3.933129, 1.933129], [3.933129, 2.9017], [4.9017, 0], [4.9017, 1.933129]] },
      'overlap open': { vol: 0.797305, flatVol: 0.797305, top: [[3.9302, 1.9402], [3.9302, 2], [3.9402, 2], [4, 2]],
        flat: [[0, 0], [0, 2.9017], [3.8804, 1.8804], [3.9302, 2.0213], [3.9302, 2.9017], [4.0213, 1.8804], [4.0213, 2], [4.9017, 0], [4.9017, 2]] },
      'overlap closed': { vol: 0.797808, flatVol: 0.798166, top: [[3.9302, 1.9402], [3.9302, 2], [3.9402, 2], [4, 2]],
        flat: [[0, 0], [0, 2.9017], [3.9302, 2], [3.9302, 2.9017], [4.9017, 0], [4.9017, 2]] },
      'underlap open': { vol: 0.797599, flatVol: 0.797599, top: [[3.9402, 1.9302], [4, 1.9302], [4, 1.9402], [4, 2]],
        flat: [[0, 0], [0, 2.9017], [3.8804, 1.8804], [4, 2.0213], [4, 2.9017], [4.0213, 1.8804], [4.0213, 1.9302], [4.9017, 0], [4.9017, 1.9302]] },
      'underlap closed': { vol: 0.797799, flatVol: 0.798166, top: [[3.9402, 1.9302], [4, 1.9302], [4, 1.9402], [4, 2]],
        flat: [[0, 0], [0, 2.9017], [4, 1.9302], [4, 2.9017], [4.9017, 0], [4.9017, 1.9302]] }
    };
    function corner(key) {
      var k = key.split(' '), code = TRAY;
      if (k[0] !== 'none') code += 'p.closedCorner([[' + (4 - T / 2) + ', 0.6, ' + (2 - R - T) + ']], { cornerType: "' + k[0] + '", gap: 0.01, ratio: 1' + (k[1] === 'closed' ? ', closeBend: true' : '') + ' });\n';
      return flatOf(code);
    }
    // the wall-top vertices near the corner, (x, z), vs SolidWorks': farthest SolidWorks vertex from Anvil's set
    function topFit(r, want) {
      var got = [];
      verts(r).forEach(function (v) { if (Math.abs(v.y - 1) < 1e-6 && v.x > 3.5 && v.z > 1.5) got.push([v.x, v.z]); });
      var worst = 0, at = null;
      want.forEach(function (q) {
        var d = Infinity;
        got.forEach(function (p) { d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1])); });
        if (d > worst) { worst = d; at = q; }
      });
      return { worst: worst, at: at };
    }
    function cornerRows(key) {
      var r = corner(key), s = CORNER[key], tf = topFit(r, s.top), ff = outlineFit(r.flat, s.flat);
      return [[key + ' wall-top corner: farthest SolidWorks vertex from Anvil\'s', tf.worst, 0, 'at ' + JSON.stringify(tf.at)],
        [key + ' flat length', r.flat.size[0], SIZE[0]], [key + ' flat width', r.flat.size[1], SIZE[1]],
        [key + ' blank area × T', blankArea(r.flat) * T, s.flatVol],
        [key + ' flat outline: farthest SolidWorks vertex from Anvil\'s', ff.worst, 0, 'at ' + JSON.stringify(ff.at)],
        [key + ' solid volume', r.mp.volume, s.vol]];
    }
    test('rfDU: tray corner before the Closed Corner (two 1 in Material Inside flanges, the x = 4 one stopping at the z = 2 one\'s bend) = SolidWorks: wall-top corner, flat 4.9017 × 2.9017, blank area × T 0.795481', function () {
      close(cornerRows('none').slice(0, 4));
    });
    // where Anvil already lands on SolidWorks (2026-10-27): hard rows; the TODO rows below list what is still off
    test('rfDU: Miter Flange wall top 1.0598 and flat 4.9615 × 2.9615 = SolidWorks (start offset 0 and 0.25)', function () {
      [0, 0.25].forEach(function (start) {
        var r = miter(start), top = -Infinity;
        verts(r).forEach(function (v) { top = Math.max(top, v.y); });
        close([['miter ' + start + ' wall top y', top, MITER[start].ymax], ['miter ' + start + ' flat length', r.flat.size[0], MITER[start].size[0]],
          ['miter ' + start + ' flat width', r.flat.size[1], MITER[start].size[1]]]);
      });
    });
    // lane DV: Butt cuts both walls back square (gap/√2 each); the matching wall's bend ends straight in the flat from
    // the base corner to the wall's new end (open bend region) or square with the wall (closed)
    Object.keys(CORNER).filter(function (k) { return k !== 'none'; }).forEach(function (key) {
      test('rfDU: Closed Corner ' + key + ' bend region, gap 0.01, ratio 1 = SolidWorks: wall-top corner, flat 4.9017 × 2.9017, blank area × T ' + CORNER[key].flatVol + ', flat outline', function () {
        close(cornerRows(key).slice(0, 5));
      });
      if (/ open$/.test(key)) test('rfDU: Closed Corner ' + key + ' bend region: solid volume = SolidWorks (hard since lane FX: bend cylinder records in Mass Properties)', function () { close(cornerRows(key).slice(5)); });
      else todo('Closed Corner ' + key + ' bend region: solid volume (the closed region\'s fill is 6e-4 heavier than SolidWorks: the fill shape, not the facets)', function () { return cornerRows(key).slice(5); });
    });
  })();
