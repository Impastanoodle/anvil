  // --- rfDO (2026-10-27, lane DO: SolidWorks reference values) --- the same sheet-metal parts built in SolidWorks
  // (2022 SP5, the copy installed here) through its API and in Anvil; Anvil must land on SolidWorks' numbers within
  // 1e-4 in. Scripts: head-tools/sw-reference/*.py; parts and raw JSON: Output\SolidWorks Models\Anvil reference;
  // write-up: test-reports/2026-10-27-solidworks-reference.md. 16 ga steel 4 × 2 base flange (x 0..4, z 0..2,
  // y 0..T), T = R = 0.0598, K 0.5, Auto Relief rectangular 0.5.
  // Rows named 'rfDO TODO: …' hold a SolidWorks value Anvil does not reach yet: they pass, and their detail lists
  // each value that is off (Anvil vs SolidWorks), or says to promote the row to a hard test once all agree.
  (function () {
    group('rfDO: SolidWorks reference values (jog offsets, edge flange above 90°, hems)');
    var T = 0.0598, R = 0.0598, TOL = 1e-4;
    var PL = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function verts(r) { var out = []; r.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { out.push(v.pos); }); }); return out; }
    function ext(vs, k, sign, keep) { var b = -Infinity; vs.forEach(function (v) { if (!keep || keep(v)) b = Math.max(b, sign * v[k]); }); return sign * b; }
    function close(rows) { rows.forEach(function (x) { near(x[1], x[2], TOL, x[0] + ' (Anvil vs SolidWorks)'); }); }
    function todo(name, fn) {
      test('rfDO TODO: ' + name, function () {
        var rows = fn(), off = rows.filter(function (x) { return !(Math.abs(x[1] - x[2]) <= TOL); });
        return off.length ? 'TODO ' + off.map(function (x) { return x[0] + ' Anvil ' + x[1].toFixed(6) + ' / SolidWorks ' + x[2]; }).join('; ')
          : 'matches SolidWorks now: promote to a hard test';
      });
    }

    // 1. Jog: line across the plate at x = 3 on the top face, offset 0.5, 90°, Bend Centerline, x < 3 fixed.
    // SolidWorks jogs away from the sketched face (down): Anvil's reverse: true. Jogged flange y range (x > 3.5), the
    // far end x, the flat length; Fix projected length off, and on (fixLength, lane DK2; hard since DI2: the faceted
    // solid volume stays a TODO row).
    var JOG = {
      outside: { lo: -0.5, hi: -0.4402, xmax: 3.576999, fixFlat: 4.423001, fixVol: 0.528991 },
      inside: { lo: -0.5598, hi: -0.5, xmax: 3.517199, fixFlat: 4.482801, fixVol: 0.536143 },
      overall: { lo: -0.4402, hi: -0.3804, xmax: 3.636799, fixFlat: 4.363201, fixVol: 0.521839 }
    };
    function jog(ref, fix) { return flatOf(PL + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -2).jog(0.5, { fixed: [1, ' + T + ', 1], offsetRef: "' + ref + '", reverse: true' + (fix ? ', fixLength: true' : '') + ' });\n'); }
    test('rfDO: Jog Outside / Inside Offset / Overall Dimension 0.5 land where SolidWorks puts them (Fix projected length off): flange faces, far end, flat 4 × 2, volume 0.4784', function () {
      Object.keys(JOG).forEach(function (ref) {
        var r = jog(ref), vs = verts(r), far = function (v) { return v.x > 3.5; }, s = JOG[ref];
        close([[ref + ' flange bottom', ext(vs, 'y', -1, far), s.lo], [ref + ' flange top', ext(vs, 'y', 1, far), s.hi],
          [ref + ' far end x', ext(vs, 'x', 1), s.xmax], [ref + ' flat length', r.flat.size[0], 4], [ref + ' flat width', r.flat.size[1], 2],
          [ref + ' blank area × T', blankArea(r.flat) * T, 0.4784]]);
      });
    });
    // lane DI2: Fix projected length (fixLength, lane DK2) keeps the far end at x = 4 and grows the blank as SolidWorks does
    test('rfDO: Jog with Fix projected length (fixLength) = SolidWorks: far end x 4, flat 4.423001 / 4.482801 / 4.363201 (outside / inside / overall), blank area × T = SolidWorks volume', function () {
      Object.keys(JOG).forEach(function (ref) {
        var r = jog(ref, true), vs = verts(r);
        close([[ref + ' far end x', ext(vs, 'x', 1), 4], [ref + ' flat length', r.flat.size[0], JOG[ref].fixFlat], [ref + ' flat width', r.flat.size[1], 2],
          [ref + ' blank area × T', blankArea(r.flat) * T, JOG[ref].fixVol]]);
      });
    });
    todo('Jog solid volume = SolidWorks 0.4784 / fixed length 0.528991 … (Anvil\'s bend facets lose a little)', function () {
      return Object.keys(JOG).map(function (ref) { return [ref + ' volume', jog(ref).mp.volume, 0.4784]; })
        .concat(Object.keys(JOG).map(function (ref) { return [ref + ' fixed-length volume', jog(ref, true).mp.volume, JOG[ref].fixVol]; }));
    });

    // 2. Edge flange, 1 in, on the z = 2 edge, Material Inside, Outer Virtual Sharp ('outer') and Tangent: tip height
    // (the top corner), tip z, flat length, volume (= the blank × T at K .5).
    var FL = {
      '90 outer': { tipY: 1, tipZ: 2, flat: 2.9017, vol: 0.694087 }, '90 tangent': { tipY: 1, tipZ: 2, flat: 2.9017, vol: 0.694087 },
      '120 outer': { tipY: 0.866025, tipZ: 1.534526, flat: 2.808086, vol: 0.671694 }, '120 tangent': { tipY: 0.941849, tipZ: 1.490749, flat: 2.89564, vol: 0.692637 },
      '135 outer': { tipY: 0.707107, tipZ: 1.352693, flat: 2.693671, vol: 0.644326 }, '135 tangent': { tipY: 0.826707, tipZ: 1.233093, flat: 2.862811, vol: 0.684784 }
    };
    function flange(key) {
      var k = key.split(' ');
      var r = flatOf(PL + 'p.flange(1, [[2, ' + T + ', 2]], { angle: ' + k[0] + ', position: "inside", lengthRef: "' + k[1] + '" });\n'), vs = verts(r), ymax = ext(vs, 'y', 1);
      r.tipY = ymax; r.tipZ = ext(vs, 'z', 1, function (v) { return v.y > ymax - 1e-6; });
      return r;
    }
    test('rfDO: Edge flange 1 in, Material Inside: at 90° Outer Virtual Sharp and Tangent both give SolidWorks\' 2.9017 flat and 1.0 tip; above 90° the tip height matches for both length types', function () {
      ['90 outer', '90 tangent'].forEach(function (key) {
        var r = flange(key), s = FL[key];
        close([[key + ' tip y', r.tipY, s.tipY], [key + ' tip z', r.tipZ, s.tipZ], [key + ' flat length', r.flat.size[1], s.flat], [key + ' flat width', r.flat.size[0], 4],
          [key + ' blank area × T', blankArea(r.flat) * T, s.vol]]);
      });
      ['120 outer', '120 tangent', '135 outer', '135 tangent'].forEach(function (key) { close([[key + ' tip y', flange(key).tipY, FL[key].tipY]]); });
    });
    // lane DI2: Material Inside above 90° now keeps the wall's outer face through the base's top outside edge
    test('rfDO: Edge flange above 90°, Material Inside = SolidWorks: the outer face runs through the base\'s top edge (outer virtual sharp T·tan(A − 90°) past it): tip z, flat length, blank area × T at 120° / 135°, Outer Virtual Sharp and Tangent', function () {
      ['120 outer', '120 tangent', '135 outer', '135 tangent'].forEach(function (key) {
        var r = flange(key), s = FL[key];
        close([[key + ' tip z', r.tipZ, s.tipZ], [key + ' flat length', r.flat.size[1], s.flat], [key + ' blank area × T', blankArea(r.flat) * T, s.vol]]);
      });
    });

    // 3. Hems on the z = 2 edge, Material Inside unless stated: SolidWorks' hem length is the overall length from
    // the fold's outer face (hem end at z = 2 − 0.5 inside), as Anvil's since lane DI2. Closed hem:
    // SolidWorks (and Anvil since DI2) leaves a 0.1 mm gap (0.003937 in). Tear Drop 270° at R = T was refused by SolidWorks;
    // 200° is measured. Values: top (y max), fold's outer z (z max), hem end z, flat length, volume.
    var HEM = {
      rolled: { opts: 'hemType: "rolled", hemPosition: "inside", hemAngle: 270, hemRadius: ' + R, ymax: 0.2392, zmax: 2, end: 1.7608, flat: 2.303101, vol: 0.550902 },
      open: { opts: 'hemType: "open", hemPosition: "inside", gap: 0.03', ymax: 0.1496, zmax: 2, end: 1.5, flat: 2.491458, vol: 0.595957 },
      closed: { opts: 'hemType: "closed", hemPosition: "inside"', ymax: 0.123537, zmax: 2, end: 1.5, flat: 2.476581, vol: 0.592398 },
      teardrop: { opts: 'hemType: "teardrop", hemPosition: "inside", hemAngle: 200, hemRadius: ' + R, ymax: 0.2392, zmax: 2, end: 1.528204, flat: 2.524781, vol: 0.603928 },
      'open outside': { opts: 'hemType: "open", hemPosition: "outside", gap: 0.03', ymax: 0.1496, zmax: 2.0748, end: 1.5748, flat: 2.566258, vol: 0.613849 },
      'closed outside': { opts: 'hemType: "closed", hemPosition: "outside"', ymax: 0.123537, zmax: 2.061769, end: 1.561769, flat: 2.538349, vol: 0.607173 }
    };
    function hem(key) {
      var r = flatOf(PL + 'p.hem(0.5, [[2, ' + T + ', 2]], { ' + HEM[key].opts + ' });\n'), vs = verts(r), off = function (v) { return v.y > T + 1e-4; };
      return { r: r, ymax: ext(vs, 'y', 1), zmax: ext(vs, 'z', 1), end: ext(vs, 'z', -1, off), flat: r.flat.size[1], area: blankArea(r.flat) * T };
    }
    function hemRows(key) { var h = hem(key), s = HEM[key]; return [[key + ' top', h.ymax, s.ymax], [key + ' fold outer z', h.zmax, s.zmax], [key + ' hem end z', h.end, s.end], [key + ' flat length', h.flat, s.flat], [key + ' blank area × T', h.area, s.vol]]; }
    test('rfDO: Rolled hem 270° at R = T (Material Inside) matches SolidWorks: top 0.2392, end z 1.7608, flat 2.303101; the open hem\'s top (2T + gap) matches', function () {
      close(hemRows('rolled'));
      close([['open top', hem('open').ymax, HEM.open.ymax]]);
    });
    // lane DI2: hem length = overall from the fold's outer face, closed gap 0.1 mm, tear-drop tail 0.2 mm short (along it)
    ['open', 'closed', 'teardrop', 'open outside', 'closed outside'].forEach(function (key) {
      test('rfDO: Hem ' + key + ' 0.5 = SolidWorks (length overall from the fold\'s outer face; closed gap 0.1 mm; tear-drop tail): top, fold outer z, end z, flat, blank area × T', function () { close(hemRows(key)); });
    });
  })();
