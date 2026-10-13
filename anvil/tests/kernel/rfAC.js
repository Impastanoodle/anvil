  // ------------------------------------------------------------------ rfAC: a closed contour crossing another is refused
  // (shop workflow finding 1: a Ø.281 hole centred on the notch corner was silently dropped from the Base Flange)
  (function () {
    group('rfAC: crossing contours refused by Base Flange / Extrude, sketch DXF keeps the stray hole on HOLES');
    // the shop blank: 10 x 6 with a 1 x 1 notch at the top-right corner, four Ø.281 holes, the last one on the notch corner
    function blank(lastHole) {
      var c = lastHole || [9, 5];
      return 'p.sketch("Top").polyline([[0, 0], [10, 0], [10, 5], [9, 5], [9, 6], [0, 6]], true).circle(1, 1, 0.1405).circle(9, 1, 0.1405).circle(1, 5, 0.1405).circle(' + c[0] + ', ' + c[1] + ', 0.1405)';
    }
    test('rfAC: a hole circle centred on the notch corner (crossing the outline at vertices of its chords) is refused by Base Flange and Boss-Extrude with "Sketch contours intersect near (x, y)"; nothing is built', function () {
      var a = build('p.sheet(0.0598, 0.0598, 0.5);\n' + blank() + '.end().baseFlange(0.0598);');
      var ids = Object.keys(a.errors);
      assert(ids.length === 1 && /Sketch contours intersect near \(9(\.\d+)?, 5(\.\d+)?\)/.test(a.errors[ids[0]]), 'Base Flange error: ' + JSON.stringify(a.errors));
      assert(!a.body || a.mp.volume === 0, 'no body: ' + (a.mp && a.mp.volume));
      var b = build(blank() + '.end().extrude(0.1);');
      assert(Object.keys(b.errors).length === 1 && /Sketch contours intersect/.test(b.errors[Object.keys(b.errors)[0]]), 'Extrude error: ' + JSON.stringify(b.errors));
      var c = build(blank([9.0091, 5.0051]) + '.end().extrude(0.1);');   // the audit's corner, a pixel off: proper crossings
      assert(Object.keys(c.errors).length === 1 && /Sketch contours intersect near/.test(c.errors[Object.keys(c.errors)[0]]), 'off-vertex crossing: ' + JSON.stringify(c.errors));
      var prof = K.sketchProfile(a.model.features[0]), stray = prof.loops.filter(function (l) { return l.meetInner; });
      var xs = stray.length === 1 ? stray[0].pts.map(function (p) { return p[0]; }) : [0];
      assert(stray.length === 1 && Math.abs(Math.max.apply(null, xs) - Math.min.apply(null, xs) - 0.281) < 1e-3, 'the circle is the stray loop');
      return a.errors[ids[0]];
    });
    test('rfAC: legitimate contours still build — holes clear of the outline (exact volume), a circle tangent inside an edge, two rectangles sharing an edge, a rectangle inside another touching its edge', function () {
      var A = 10 * 6 - 1, H = Math.PI * 0.1405 * 0.1405;
      var a = build(blank([8, 4]) + '.end().extrude(0.5);');
      noErrors(a);
      nearRel(a.mp.volume, (A - 4 * H) * 0.5, 1e-3, 'four holes');
      var t = build('p.sketch("Front").rect(0, 0, 20, 10).circle(5, 3, 3).end().extrude(1);');   // tangent to y = 0 from inside
      noErrors(t);
      nearRel(t.mp.volume, 200 - Math.PI * 9, 5e-3, 'tangent hole');
      var s = build('p.sketch("Front").rect(0, 0, 10, 10).rect(10, 0, 10, 10).end().extrude(1);');
      noErrors(s);
      var n = build('p.sketch("Front").rect(0, 0, 20, 10).rect(0, 2, 5, 5).end().extrude(1);');
      assert(!Object.keys(n.errors).some(function (id) { return /contours intersect/.test(n.errors[id]); }), 'touching inside is not a crossing: ' + JSON.stringify(n.errors));
      return fmt(a.mp.volume) + ' in³';
    });
    test('rfAC: sketch DXF puts a hole circle drawn over the outline on HOLES (as drawn), the outline on OUTLINE', function () {
      var m = K.newModel('t');
      K.runScript(m, blank() + '.end();');
      var ents = sketchDxfEnts(K.exportDXFSketch(m.features[0], 'in'));
      var circ = ents.filter(function (e) { return e.t === 'CIRCLE'; }), lines = ents.filter(function (e) { return e.t === 'LINE'; });
      assert(circ.length === 4 && circ.every(function (e) { return e['8'] === 'HOLES'; }), 'four CIRCLEs on HOLES: ' + circ.map(function (e) { return e['8']; }).join(','));
      assert(lines.length === 6 && lines.every(function (e) { return e['8'] === 'OUTLINE'; }), 'six outline LINEs on OUTLINE');
      return 'CIRCLE@HOLES 4';
    });
  })();
  // --- end rfAC ---

