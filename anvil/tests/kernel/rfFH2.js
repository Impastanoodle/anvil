  // --- rfFH2 (2026-10-29, lane FH2: engine fixes for the rfFH SolidWorks audit) --- the Hole Wizard table against
  // SolidWorks 2022's own Hole Wizard database (every size and fit Anvil offers, read over the API by
  // head-tools/sw-reference/solids_holes.py into sw-holewizard.json; SW below is solids_holes_table.py --js), the
  // sweep along true arcs, the polygon → circle loft blended as SolidWorks does (solids_loft.py measured its sections).
  (function () {
    group('rfFH2: Hole Wizard sizes = SolidWorks, sweep along true arcs, square → circle loft = SolidWorks');
    var HW = HoleWizard;
    // { ansi: { size: [clr close, normal, loose, cbore Ø, cbore depth, csk Ø, csk °] }, ansiTap: { thread: drill },
    //   iso: { … in mm }, isoTap } — null where SolidWorks has no such hole (#12 / 9/16 counterbore, 7/8 / 1 82°
    //   countersink, M14 counterbore, M2 / M2.5 / M14 ISO 10642 countersink). SolidWorks rounds inch values to 4
    //   decimals (0.2812 for 9/32), hence 6e-5 on inches.
    var SW = {"ansi":{"#10":[0.196,0.201,0.221,0.375,0.19,0.385,82.0],"#12":[0.221,0.228,0.246,null,null,0.438,82.0],"#2":[0.089,0.096,0.1065,0.1875,0.086,0.172,82.0],"#3":[0.104,0.11,0.12,0.2031,0.099,0.199,82.0],"#4":[0.116,0.1285,0.136,0.2188,0.112,0.225,82.0],"#5":[0.1285,0.136,0.154,0.25,0.125,0.252,82.0],"#6":[0.144,0.1495,0.1695,0.2813,0.138,0.279,82.0],"#8":[0.1695,0.177,0.1935,0.3125,0.164,0.332,82.0],"1":[1.0156,1.0312,1.0469,1.625,1.0,null,null],"1/2":[0.5156,0.5312,0.5469,0.8125,0.5,0.875,82.0],"1/4":[0.257,0.266,0.2812,0.4375,0.25,0.507,82.0],"3/4":[0.7656,0.7812,0.7969,1.1875,0.75,1.375,82.0],"3/8":[0.386,0.397,0.4062,0.625,0.375,0.762,82.0],"5/16":[0.323,0.332,0.3437,0.5313,0.3125,0.635,82.0],"5/8":[0.6406,0.6562,0.6719,1.0,0.625,1.125,82.0],"7/16":[0.4531,0.4687,0.4844,0.7188,0.4375,0.812,82.0],"7/8":[0.8906,0.9062,0.9219,1.375,0.875,null,null],"9/16":[0.5781,0.5937,0.6094,null,null,1.0,82.0]},
      "ansiTap":{"#10-24":0.1495,"#10-32":0.159,"#12-24":0.177,"#12-28":0.182,"#2-56":0.07,"#2-64":0.07,"#3-48":0.0785,"#3-56":0.082,"#4-40":0.089,"#4-48":0.0935,"#5-40":0.1015,"#5-44":0.104,"#6-32":0.1065,"#6-40":0.113,"#8-32":0.136,"#8-36":0.136,"1-12":0.9219,"1-8":0.875,"1/2-13":0.4219,"1/2-20":0.4531,"1/4-20":0.201,"1/4-28":0.213,"3/4-10":0.6562,"3/4-16":0.6875,"3/8-16":0.3125,"3/8-24":0.332,"5/16-18":0.257,"5/16-24":0.272,"5/8-11":0.5312,"5/8-18":0.5781,"7/16-14":0.368,"7/16-20":0.3906,"7/8-14":0.8125,"7/8-9":0.7656,"9/16-12":0.4844,"9/16-18":0.5156},
      "iso":{"M10":[10.5,11.0,12.0,18.0,10.6,22.4,90.0],"M12":[13.0,13.5,15.0,20.0,12.6,26.88,90.0],"M14":[15.0,15.5,17.0,null,null,null,null],"M16":[17.0,17.5,19.0,26.0,16.6,33.6,90.0],"M2":[2.2,2.4,2.6,4.4,2.4,null,null],"M2.5":[2.7,2.9,3.1,5.5,2.9,null,null],"M20":[21.0,22.0,24.0,33.0,20.6,40.32,90.0],"M3":[3.2,3.4,3.6,6.5,3.4,6.72,90.0],"M4":[4.3,4.5,4.8,8.0,4.4,8.96,90.0],"M5":[5.3,5.5,5.8,10.0,5.4,11.2,90.0],"M6":[6.4,6.6,7.0,11.0,6.4,13.44,90.0],"M8":[8.4,9.0,10.0,15.0,8.6,17.92,90.0]},
      "isoTap":{"M10":8.5,"M12":10.2,"M14":12.0,"M16":14.0,"M2":1.6,"M2.5":2.05,"M20":17.5,"M3":2.5,"M4":3.3,"M5":4.2,"M6":5.0,"M8":6.8}};
    var FITS = ['close', 'normal', 'loose'];
    function cmp(std, tol) {
      var A = std === 'ansi', bad = [], n = 0, table = SW[std];
      Object.keys(table).forEach(function (size) {
        var s = table[size];
        function chk(label, a, b) { n++; if (!(Math.abs(a - b) <= tol)) bad.push(size + ' ' + label + ' Anvil ' + a + ' / SolidWorks ' + b); }
        function sp(f) { f.standard = A ? 'ANSI Inch' : 'ISO'; f.size = size; return HW.spec(f); }
        FITS.forEach(function (fit, i) {
          chk(fit + ' clearance', sp({ holeType: 'hole', fit: fit }).dia, s[i]);
          if (s[3] != null) chk(fit + ' counterbore thru', sp({ holeType: 'cbore', fit: fit }).dia, s[i]);
          if (s[5] != null) chk(fit + ' countersink thru', sp({ holeType: 'csk', fit: fit }).dia, s[i]);
        });
        if (s[3] != null) { var c = sp({ holeType: 'cbore', fit: 'normal' }).cbore; chk('counterbore Ø', c.dia, s[3]); chk('counterbore depth', c.depth, s[4]); }
        if (s[5] != null) { var k = sp({ holeType: 'csk', fit: 'normal' }).csk; chk('countersink Ø', k.dia, s[5]); chk('countersink angle', k.angle, s[6]); }
      });
      var taps = SW[std + 'Tap'];
      (A ? HW.ANSI_THREADS : HW.ISO).forEach(function (r) {
        var key = A ? r.size.split(' ')[0] : r.size;
        if (taps[key] == null) { bad.push(key + ' not in SolidWorks'); return; }
        n++;
        var d = HW.spec({ standard: A ? 'ANSI Inch' : 'ISO', holeType: 'tap', size: r.size }).dia;
        if (!(Math.abs(d - taps[key]) <= tol)) bad.push(r.size + ' tap drill Anvil ' + d + ' / SolidWorks ' + taps[key]);
      });
      assert(!bad.length, bad.length + ' of ' + n + ' values differ: ' + bad.join('; '));
      return n + ' values match SolidWorks';
    }
    test('rfFH2: ANSI Inch Hole Wizard = SolidWorks for every size and fit: clearance, counterbore and countersink thru holes, counterbore Ø / depth, 82° countersink Ø, tap drills (1/4 Normal: H 0.266)', function () {
      var r = cmp('ansi', 6e-5);
      assert(HW.spec({ standard: 'ANSI Inch', holeType: 'cbore', size: '1/4', fit: 'normal' }).drillName === 'H', '1/4 Normal is drilled H');
      return r;
    });
    test('rfFH2: ISO Hole Wizard = SolidWorks for every size and fit (M12 / M14 / M16 loose 15 / 17 / 19, counterbore depths d + 0.4 / d + 0.6)', function () {
      return cmp('iso', 1e-9);
    });
    test('rfFH2: every row Anvil offers is in SolidWorks\' table, and the sizes SolidWorks has no screw for stay out of the lists (#12 / 9/16 counterbore)', function () {
      var miss = HW.ANSI_SCREWS.filter(function (r) { return !SW.ansi[r.size]; }).map(function (r) { return r.size; })
        .concat(HW.ISO.filter(function (r) { return !SW.iso[r.size]; }).map(function (r) { return r.size; }));
      assert(!miss.length, 'not in SolidWorks: ' + miss.join());
      ['#12', '9/16'].forEach(function (s) { assert(!HW.screwRow(s).cb, s + ' has no counterbore'); });
      return HW.ANSI_SCREWS.length + ' ANSI screws, ' + HW.ISO.length + ' ISO sizes';
    });

    // ---------------------------------------------------------------- sweep along true arcs
    var U = 'p.units("in");\n';
    test('rfFH2: a circle swept along a 90° arc is exact: Pappus π·r²·R·θ, ends in the path\'s end planes (bbox y ≥ 0, x ≤ 2), torus records', function () {
      var r = build(U + 'var prof = p.sketch("Top").circle(0, 0, 0.25).id();\nvar path = p.sketch("Front").arc(2, 0, 2, 90, 180).id();\np.sweep({ profile: prof, path: path });\n');
      noErrors(r);
      nearRel(r.mp.volume, Math.PI * Math.PI / 16, 1e-9, 'volume');
      var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      r.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { lo[1] = Math.min(lo[1], v.pos.y); hi[0] = Math.max(hi[0], v.pos.x); }); });
      near(lo[1], 0, 1e-9, 'start cap on y = 0'); near(hi[0], 2, 1e-9, 'end cap on x = 2');
      var tor = r.body.polygons.filter(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'tor'; }).length;
      assert(tor > 0, 'torus records on the walls');
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfFH2: a tube along line → tangent arc → line is exact (annulus × path length) and hollow; reversed path and a path drawn from the far end give the same solid', function () {
      var A = Math.PI * (0.0625 - 0.01), Lp = 1 + Math.PI + 1;
      var code = function (path) { return U + 'var prof = p.sketch("Top").circle(0, 0, 0.25).circle(0, 0, 0.1).id();\nvar path = p.sketch("Front")' + path + '.id();\np.sweep({ profile: prof, path: path });\n'; };
      var a = build(code('.line(0, 0, 0, 1).arc(2, 1, 2, 90, 180).line(2, 3, 3, 3)'));
      var b = build(code('.line(3, 3, 2, 3).arc(2, 1, 2, 90, 180).line(0, 1, 0, 0)'));
      noErrors(a); noErrors(b);
      nearRel(a.mp.volume, A * Lp, 1e-9, 'tube volume'); nearRel(b.mp.volume, A * Lp, 1e-9, 'same tube drawn the other way');
      assert(!a.body.pointTester()([0, 0.5, 0]) && a.body.pointTester()([0.175, 0.5, 0]), 'hollow along the first line');
      return 'volume ' + a.mp.volume.toFixed(9);
    });
    test('rfFH2: a path with a sharp corner next to an arc keeps the polyline sweep (mitred, no error)', function () {
      var r = build(U + 'var prof = p.sketch("Top").circle(0, 0, 0.25).id();\nvar path = p.sketch("Front").line(0, 0, 0, 1).arc(1, 2, 1, 180, 270).id();\np.sweep({ profile: prof, path: path });\n');
      noErrors(r);
      assert(r.mp.volume > 0, 'volume ' + r.mp.volume);
      return 'volume ' + r.mp.volume.toFixed(6);
    });

    // ---------------------------------------------------------------- loft square → circle
    // SolidWorks (solids_loft.py): straight rulings, each side ↔ a 90° arc split at the corners' directions, the arc
    // parametrized as SolidWorks' rational quadratic. Volume h/6 (A0 + A1 + 4 Am) of that blend = 7.150712 (SolidWorks
    // 7.150709); the section at mid-height reaches r = (√2 + 1) / 2 at the corners and r = 1 mid-side, as SolidWorks'.
    var LOFT_SW = 7.15070879047042, LOFT_AREA_SW = 21.227899135418212;
    function loft(order) {
      var s1 = 'var s1 = p.sketch("Top").centerRect(0, 0, 2, 2).id();\n', s2 = 'var s2 = p.sketch("Top", 2).circle(0, 0, 1).id();\n';
      return build(U + s1 + s2 + 'p.loft(' + order + ');\n');
    }
    test('rfFH2: square → circle loft = SolidWorks\' (volume 2e-4, area 5e-4), either order of the sections; OpenCascade\'s loft untouched', function () {
      var a = loft('[s1, s2]'), b = loft('[s2, s1]');
      noErrors(a); noErrors(b);
      nearRel(a.mp.volume, LOFT_SW, 2e-4, 'volume'); nearRel(b.mp.volume, a.mp.volume, 1e-12, 'reversed order');
      nearRel(a.mp.area, LOFT_AREA_SW, 5e-4, 'area');
      var c = loft('[s1, s2]').body.pointTester();
      assert(c([0, 1, 0]) && !c([1.2, 1, 0]) && c([0.84, 1, 0.84]) && !c([0.87, 1, 0.87]), 'mid-height section: corner r 1.2071, side r 1');
      return 'volume ' + a.mp.volume.toFixed(6) + ' (SolidWorks ' + LOFT_SW.toFixed(6) + '), area ' + a.mp.area.toFixed(6);
    });
    test('rfFH2: a circle → hexagon loft is closed, between the two prisms, and uses the blend (not the convex hull)', function () {
      var r = build(U + 'var s1 = p.sketch("Top").polygon(0, 0, 1, 6).id();\nvar s2 = p.sketch("Top", 1.5).circle(0, 0, 0.6).id();\np.loft([s1, s2]);\n');
      noErrors(r);
      var circ = Math.PI * 0.36, hex = 3 * Math.sqrt(3) / 2;
      assert(r.mp.volume > 1.5 * circ && r.mp.volume < 1.5 * hex, 'volume ' + r.mp.volume);
      consistentVolume(r);
      return 'volume ' + r.mp.volume.toFixed(6);
    });
  })();
