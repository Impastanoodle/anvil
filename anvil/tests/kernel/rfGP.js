  // --- rfGP (2026-11-02, lane massprops): massProps on curved faces trimmed by another face. Each truth is an independent
  // integral of the shape, not an Anvil figure. kernel-curves.js boundRevolved / cornerPlane.
  (function () {
    group('rfGP: exact volume where a curved face is trimmed by another face');
    function rfGPgl(f, a, b, pan) {
      var x = [-0.906179845938664, -0.538469310105683, 0, 0.538469310105683, 0.906179845938664], w = [0.236926885056189, 0.478628670499366, 0.568888888888889, 0.478628670499366, 0.236926885056189];
      var s = 0, h = (b - a) / pan;
      for (var i = 0; i < pan; i++) for (var k = 0; k < 5; k++) s += w[k] * f(a + (i + 0.5) * h + x[k] * h / 2) * h / 2;
      return s;
    }
    function rfGPvol(code) {
      var r = build(code);
      assert(!Object.keys(r.errors || {}).length, 'builds');
      return r.mp.volume;
    }
    function rfGPrim(R) {   // a mitred rim of a 40 x 30 x 20 box shelled 2: the plan's level sets at depth d are 120 − 8d long
      var top = Math.min(R, 2), V = 1600;
      V += rfGPgl(function (t) { var d = R * (1 - Math.cos(t)); return (120 - 8 * d) * (28 - R + R * Math.sin(Math.acos(1 - d / R))) * R * Math.sin(t); }, 0, Math.acos(1 - top / R), 400);
      if (R < 2) V += rfGPgl(function (d) { return (120 - 8 * d) * 28; }, R, 2, 4);
      return V;
    }
    function rfGPoff(kind, size) {   // Ø6 hole, 10 from the plate's side, in a plate 40 thick: the round / chamfer runs off the side
      var rh = 3, T = 40, off = 10, C = rh + size, rem = Math.PI * rh * rh * T;
      function dth(p) { return p <= off ? 2 * Math.PI : 2 * Math.PI - 2 * Math.acos(off / p); }
      function drop(p) { return kind === 'fillet' ? size - Math.sqrt(size * size - (C - p) * (C - p)) : C - p; }
      [[rh, off], [off, C]].forEach(function (k) {
        var a = k[0], b = k[1];
        rem += rfGPgl(function (t) { var p = a + (b - a) * (1 - Math.cos(t)) / 2; return drop(p) * p * dth(p) * (b - a) * Math.sin(t) / 2; }, 0, Math.PI, 2000);
      });
      return 60 * 60 * T - rem;
    }
    function rfGPoffCode(kind, size) { return 'p.units("mm");p.box(60,60,40);p.sketch("Top",40).circle(50,-30,3).end().cut("through",{reverse:true});p.' + kind + '(' + size + ',[[53,40,30]]);'; }
    test('rfGP: a torus trimmed by a plate side is exact (R12 on a hole rim, off the plate)', function () {
      var v = rfGPvol(rfGPoffCode('fillet', 12)), t = rfGPoff('fillet', 12);
      nearRel(v, t, 1e-9);
      return v.toFixed(6) + ' / ' + t.toFixed(6);
    });
    test('rfGP: a cone trimmed by a plate side is exact (chamfer on a hole rim, off the plate)', function () {
      var v = rfGPvol(rfGPoffCode('chamfer', 12)), t = rfGPoff('chamfer', 12);
      nearRel(v, t, 1e-8);
      return v.toFixed(6) + ' / ' + t.toFixed(6);
    });
    test('rfGP: a concave cylinder trimmed by a plate side (a hole breaking out of the side)', function () {
      var R = 6, off = 4, T = 10, sg = R * R * Math.acos(off / R) - off * Math.sqrt(R * R - off * off);
      nearRel(rfGPvol('p.units("mm");p.box(60,60,10);p.sketch("Top",10).circle(56,-30,6).end().cut("through",{reverse:true});'), 60 * 60 * T - (Math.PI * R * R - sg) * T, 1e-12);
    });
    test('rfGP: a sphere trimmed mid-chord by the plane square to its axis, with a rim round (rfFG\'s WHEEL: the closed form, 41.828281798889)', function () {
      // cylinder − spherical cap (h .4, R .8) − the rim round, whose section (1 − π/4) r² has first moment (5/6 − π/4) r³ from the wall
      var r = 0.25, rim = 2 * Math.PI * (3 * r * r * (1 - Math.PI / 4) - r * r * r * (5 / 6 - Math.PI / 4)), t = Math.PI * 9 * 1.5 - Math.PI * 0.16 * (3 * 0.8 - 0.4) / 3 - rim;
      var v = rfGPvol('p.units("in");p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);p.sketch("Front").arc(0,1.9,0.8,-90,-20).line(0.8*Math.cos(-20*Math.PI/180),1.9+0.8*Math.sin(-20*Math.PI/180),0,1.9+0.8*Math.sin(-20*Math.PI/180)).line(0,1.9+0.8*Math.sin(-20*Math.PI/180),0,1.1).revolveCut(360);p.fillet(0.25,[[3,1.5,0]]);');
      nearRel(v, t, 1e-11);
      return v.toFixed(9) + ' / ' + t.toFixed(9);
    });
    test('rfGP: a concave torus trimmed by a later cut (a boss root round on a plate, the plate cut 6 from the boss axis)', function () {
      var rb = 5, Rf = 3, C = rb + Rf, off = 6, add = 0;
      function h(p) { return Rf - Math.sqrt(Math.max(0, Rf * Rf - (C - p) * (C - p))); }
      function dth(p) { return p <= off ? 2 * Math.PI : 2 * Math.PI - 2 * Math.acos(off / p); }
      [[rb, off], [off, C]].forEach(function (k) {
        var a = k[0], b = k[1];
        add += rfGPgl(function (t) { var p = a + (b - a) * (1 - Math.cos(t)) / 2; return h(p) * p * dth(p) * (b - a) * Math.sin(t) / 2; }, 0, Math.PI, 2000);
      });
      var v = rfGPvol('p.units("mm");p.box(60,60,10);p.sketch("Top",10).circle(30,-30,5).end().extrude(10);p.fillet(3,[[35,10,30]]);p.sketch("Top",30).centerRect(56,-30,40,80).end().cut("through",{reverse:true});'), t = 36 * 60 * 10 + Math.PI * 250 + add;
      nearRel(v, t, 1e-9);
      return v.toFixed(6) + ' / ' + t.toFixed(6);
    });
    test('rfGP: two cylinders of unequal radius meeting (a tee, no fillet)', function () {
      var t = Math.PI * 225 * 80 + rfGPgl(function (a) { var z = 10 * Math.sin(a); return 200 * Math.cos(a) * Math.cos(a) * (40 - Math.sqrt(225 - z * z)); }, -Math.PI / 2, Math.PI / 2, 400);
      nearRel(rfGPvol('p.units("mm");p.cylinder(15,80,{axis:"x",at:[-40,0,0]});p.cylinder(10,40,{at:[0,0,0]});'), t, 1e-8);
    });
    test('rfGP: a concave cylinder through a convex one (a cross hole)', function () {
      var t = Math.PI * 225 * 80 - rfGPgl(function (a) { var x = 5 * Math.sin(a); return 100 * Math.cos(a) * Math.cos(a) * Math.sqrt(225 - x * x) ; }, -Math.PI / 2, Math.PI / 2, 400);
      nearRel(rfGPvol('p.units("mm");p.cylinder(15,80,{axis:"x",at:[-40,0,0]});p.sketch("Top",20).circle(0,0,5).end().cut("through",{reverse:true});'), t, 1e-8);
    });
    // SolidWorks' figures for these three (rfGD R12b, c, d) differ from the true mitre by up to 2.1e-5: Anvil's stay on the integral
    [[1.9, 1e-9], [2.5, 2e-9], [7.2, 2e-9]].forEach(function (q) {
      test('rfGP: the shelled rim R' + q[0] + ' equals the integral of its mitred section', function () {
        var v = rfGPvol('p.units("mm");p.box(40,20,30);p.shell(2,[[20,30,10]]);p.fillet(' + q[0] + ',[[40,30,10],[20,30,0],[0,30,10],[20,30,20]]);');
        nearRel(v, rfGPrim(q[0]), q[1]);
        return v.toFixed(6);
      });
    });
  })();
