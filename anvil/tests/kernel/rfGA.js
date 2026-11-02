  // --- rfGA (2026-10-30, lane GA: second confidence corpus on the features rfFT skipped, and a feature-stack fuzz) ---
  // rfGA-TABLE-BEGIN (anvil/tests/fixtures/rfFT/compare.js --table rfGA reads the lines between these markers: keep
  // them ES5 and self-contained)
  var rfGAkinds = ['stack'];
  var rfGAparts = (function () {
    var PI = Math.PI, U = 'p.units("in");\n', out = [];
    function add(id, d, code, o) { var r = { id: id, d: d, code: code == null ? null : U + code }; for (var k in o || {}) r[k] = o[k]; out.push(r); }
    function cyl(r, h) { return PI * r * r * h; }
    // area of the lens where a circle r at distance d from the centre of a circle R overlaps it
    function lens(R, r, d) {
      return r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r)) + R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R)) -
        0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
    }
    function plate(w, d, t) { return 'p.sketch("Top").centerRect(0, 0, ' + w + ', ' + d + ').end().extrude(' + t + ');\n'; }
    var t5 = Math.tan(5 * PI / 180), t3 = Math.tan(3 * PI / 180);
    // volume of a round bar (radius a, axis along x through the y axis of two coaxial cylinders R1 < R2 about y)
    // between those cylinders: ∫∫ over the bar's section of sqrt(R2² − z²) − sqrt(R1² − z²); z = a·sinθ makes the
    // integrand smooth, Simpson with 2000 steps is exact to ~1e-13
    function between(a, R1, R2) {
      var n = 2000, s = 0;
      for (var i = 0; i <= n; i++) {
        var th = -PI / 2 + PI * i / n, z = a * Math.sin(th), w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
        s += w * 2 * a * a * Math.cos(th) * Math.cos(th) * (Math.sqrt(R2 * R2 - z * z) - Math.sqrt(R1 * R1 - z * z));
      }
      return s * (PI / n) / 3;
    }
    // a W × D box H tall with vertical edges rounded r and the bottom loop rounded rho (r ≥ rho): each horizontal
    // section is a rounded rectangle inset by δ(y) = rho − √(rho² − (rho − y)²) with corner radius r − δ, so
    // V = A0·H − 2(W + D − (4 − π)r)·rho²(1 − π/4) + π·rho³(5/3 − π/2), A0 = WD − (4 − π)r²
    function roundedBox(W, D, r, rho, H) { return (W * D - (4 - PI) * r * r) * H - 2 * (W + D - (4 - PI) * r) * rho * rho * (1 - PI / 4) + PI * Math.pow(rho, 3) * (5 / 3 - PI / 2); }

    // ------------------------------------------------------------ revolve + circular pattern
    add('G01', 'handwheel: Ø6 × 0.5 revolved rim, Ø1.25 × 1 hub with Ø0.5 bore, CirPattern ×5 of a Ø0.375 spoke',
      'p.sketch("Front").rect(2.5, 0, 0.5, 0.5).end().revolve(360);\np.sketch("Front").polyline([[0.25, -0.25], [0.625, -0.25], [0.625, 0.75], [0.25, 0.75]]).end().revolve(360);\n' +
      'p.sketch("Right", 0.5).circle(0, 0.25, 0.1875).end().extrude(2.25);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 5 });\n',
      { cf: PI * (9 - 6.25) * 0.5 + PI * (0.390625 - 0.0625) + 5 * between(0.1875, 0.625, 2.5) });
    add('G02', 'spacer ring OD 2 / ID 1 × 0.5 (revolve), CirPattern ×6 of a Ø0.25 hole on a Ø1.5 circle',
      'p.sketch("Front").rect(0.5, 0, 0.5, 0.5).end().revolve(360);\np.sketch("Top", 0.5).circle(0.75, 0, 0.125).end().cut("through", { reverse: true });\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 6 });\n',
      { cf: PI * 0.75 * 0.5 - 6 * cyl(0.125, 0.5) });
    add('G03', 'fluted knob Ø2 × 0.75, CirPattern ×8 of a Ø0.5 flute centred on the rim',
      'p.sketch("Top").circle(0, 0, 1).end().extrude(0.75);\np.sketch("Top", 0.75).circle(1, 0, 0.25).end().cut("through", { reverse: true });\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 8 });\n',
      { cf: 0.75 * (PI - 8 * lens(1, 0.25, 1)) });
    add('G04', 'half bushing: OD 2 / ID 1 × 1 revolved 180°',
      'p.sketch("Front").rect(0.5, 0, 0.5, 1).end().revolve(180);\n', { cf: PI / 2 * 0.75 });

    // ------------------------------------------------------------ mirror
    add('G05', 'Mirror (feature): Ø0.5 × 0.5 boss at x 1 on a 4 × 2 × 0.25 plate, mirrored about Right',
      plate(4, 2, 0.25) + 'p.sketch("Top", 0.25).circle(1, 0, 0.25).end().extrude(0.5);\np.mirror("Right");\n', { cf: 2 + 2 * cyl(0.25, 0.5) });
    add('G06', 'Mirror (feature) touching the plane: a 1 × 1 × 0.5 block from x 0 to 1, mirrored about Right (the copies share a face)',
      plate(4, 2, 0.25) + 'p.sketch("Top", 0.25).rect(0, -0.5, 1, 1).end().extrude(0.5);\np.mirror("Right");\n', { cf: 3 });
    add('G07', 'Mirror (body) about Top, the part standing on it: 3 × 2 × 0.5 plate, Ø0.5 hole, Ø1 × 0.5 boss',
      plate(3, 2, 0.5) + 'p.sketch("Top", 0.5).circle(-1, 0, 0.25).end().cut("through", { reverse: true });\np.sketch("Top", 0.5).circle(0.75, 0, 0.5).end().extrude(0.5);\np.mirror("Top", { body: true });\n',
      { cf: 2 * (3 - cyl(0.25, 0.5) + cyl(0.5, 0.5)) });
    add('G08', 'Mirror (body) about Front through the part: 2 × 2 × 1 block from z −0.5 to 1.5 with a Ø0.5 hole at z 1',
      'p.sketch("Top").rect(-1, -1.5, 2, 2).end().extrude(1);\np.sketch("Top", 1).circle(0, -1, 0.25).end().cut("through", { reverse: true });\np.mirror("Front", { body: true });\n',
      { cf: 6 - 2 * cyl(0.25, 1) });
    add('G09', 'Mirror (feature) of a cut: 0.75 × 0.25 slot at x 1.25 through a 4 × 3 × 0.5 plate, mirrored about Right',
      plate(4, 3, 0.5) + 'p.sketch("Top", 0.5).slot(1, 0, 1.5, 0, 0.25).end().cut("through", { reverse: true });\np.mirror("Right");\n',
      { cf: 6 - 2 * 0.5 * (0.5 * 0.25 + PI * 0.015625) });
    add('G10', 'Mirror (feature) of a fillet: R 0.25 on the right top edge of a 4 × 2 × 0.5 plate, mirrored about Right',
      plate(4, 2, 0.5) + 'p.fillet(0.25, [[2, 0.5, 0]]);\np.mirror("Right");\n', { cf: 4 - 2 * (1 - PI / 4) * 0.0625 * 2 });

    // ------------------------------------------------------------ shell
    add('G11', 'open box 4 × 3 × 2, shell 0.125, top removed', plate(4, 3, 2) + 'p.shell(0.125, [[0, 2, 0]]);\n', { cf: 24 - 3.75 * 2.75 * 1.875 });
    add('G12', 'thin-wall housing 4 × 3 × 1.5, shell 0.1 open top, two Ø0.4 bosses off the floor with Ø0.2 × 0.75 holes',
      plate(4, 3, 1.5) + 'p.shell(0.1, [[0, 1.5, 0]]);\np.sketch("Top", 0.1).circle(-1.25, 0, 0.2).circle(1.25, 0, 0.2).end().extrude(1);\np.sketch("Top", 1.1).circle(-1.25, 0, 0.1).circle(1.25, 0, 0.1).end().cut(0.75, { reverse: true });\n',
      { cf: 18 - 3.8 * 2.8 * 1.4 + 2 * cyl(0.2, 1) - 2 * cyl(0.1, 0.75) });
    add('G13', 'shell after fillets: 4 × 3 × 2 box, R 0.5 vertical edges, R 0.25 round the bottom, shell 0.1 open top',
      plate(4, 3, 2) + 'p.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.fillet(0.25, [[0, 0, 1.5]]);\np.shell(0.1, [[0, 2, 0]]);\n',
      { cf: roundedBox(4, 3, 0.5, 0.25, 2) - roundedBox(3.8, 2.8, 0.4, 0.15, 1.9) });   // the inside is the offset: r 0.4, rho 0.15
    add('G14', 'cup Ø3 × 2, shell 0.125 open top', 'p.sketch("Top").circle(0, 0, 1.5).end().extrude(2);\np.shell(0.125, [[0, 2, 0]]);\n',
      { cf: cyl(1.5, 2) - cyl(1.375, 1.875) });

    // ------------------------------------------------------------ sweep, loft
    add('G15', 'tube Ø1 × 0.1 wall swept along a R 4 90° arc', 'var prof = p.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.4).id();\nvar path = p.sketch("Front").arc(4, 0, 4, 90, 180).id();\np.sweep({ profile: prof, path: path });\n',
      { cf: PI * 0.09 * 2 * PI });
    add('G16', 'bent round bar Ø0.5: line 3, R 1.5 90° bend, line 2.5', 'var prof = p.sketch("Top").circle(0, 0, 0.25).id();\nvar path = p.sketch("Front").line(0, 0, 0, 3).arc(1.5, 3, 1.5, 90, 180).line(1.5, 4.5, 4, 4.5).id();\np.sweep({ profile: prof, path: path });\n',
      { cf: cyl(0.25, 5.5 + 0.75 * PI) });
    add('G17', 'round-to-square transition: loft 3 × 3 square to a Ø2 circle, 3 apart (2 sections)',
      'var a = p.sketch("Top").centerRect(0, 0, 3, 3).id();\nvar b = p.sketch("Top", 3).circle(0, 0, 1).id();\np.loft([a, b]);\n', { tol: 2e-3 });
    add('G18', 'three-section loft: Ø3 circle, 2 × 2 square at 1.5, Ø1.5 circle at 3',
      'var a = p.sketch("Top").circle(0, 0, 1.5).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n', { tol: 2e-3 });
    add('G19', 'offset hopper: loft 4 × 4 square to a 2 × 2 square shifted 1 in x, 3 apart (prismatoid 28)',
      'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 3).centerRect(1, 0, 2, 2).id();\np.loft([a, b]);\n', { cf: 28 });

    // ------------------------------------------------------------ multi-body combine (Anvil has no Combine: Intersect keeps the regions)
    add('G20', 'Combine Common (Intersect, A∩B kept): two Ø2 × 2 cylinders crossed at right angles (Steinmetz 16/3)',
      'p.sketch("Top").circle(0, 0, 1).end().extrude(2, { midplane: true });\np.sketch("Right").circle(0, 0, 1).end().extrude(2, { midplane: true, merge: false });\np.intersect({ regions: [false, false, true] });\n',
      { cf: 16 / 3 });
    add('G21', 'Combine Subtract (Intersect, the plate-only region kept): 3 × 3 × 1 plate minus a separate Ø1.5 cylinder body',
      plate(3, 3, 1) + 'p.sketch("Top", -0.5).circle(0, 0, 0.75).end().extrude(2, { merge: false });\np.intersect({ exclude: [1, 2, 3] });\n',
      { cf: 9 - cyl(0.75, 1) });
    add('G22', 'Combine Add (Intersect, all kept, merged): two Ø2 × 2 cylinders crossed at right angles',
      'p.sketch("Top").circle(0, 0, 1).end().extrude(2, { midplane: true });\np.sketch("Right").circle(0, 0, 1).end().extrude(2, { midplane: true, merge: false });\np.intersect({});\n',
      { cf: 2 * cyl(1, 2) - 16 / 3 });

    // ------------------------------------------------------------ rib, draft
    add('G23', 'Rib, one side: 4 × 3 × 0.25 angle 4 wide, 0.25 rib at mid-length (First Side)',
      'p.sketch("Front").polyline([[0, 0], [4, 0], [4, 0.25], [0.25, 0.25], [0.25, 3], [0, 3]]).end().extrude(4, { midplane: true });\np.sketch("Front").line(0.25, 2.25, 3, 0.25).end().rib(0.25, { side: "one" });\n',
      { cf: 4 * (1 + 0.6875) + 0.25 * 2.75 });
    add('G24', 'Rib, Normal to Sketch: a 3 long line on a plane 1 above a 4 × 2 × 0.25 plate grows down to it, 0.2 thick',
      plate(4, 2, 0.25) + 'p.sketch("Top", 1).line(-1.5, 0, 1.5, 0).end().rib(0.2, { direction: "normal" });\n', { cf: 2 + 3 * 0.75 * 0.2 });
    add('G25', 'Rib inside a shelled box: 4 × 3 × 1, shell 0.1 open top, 0.1 rib across at z 0 up to 0.8',
      plate(4, 3, 1) + 'p.shell(0.1, [[0, 1, 0]]);\np.sketch("Front").line(-1.9, 0.8, 1.9, 0.8).end().rib(0.1);\n', { cf: 12 - 3.8 * 2.8 * 0.9 + 3.8 * 0.7 * 0.1 });
    add('G26', 'Draft 5° on the four sides of a 2 × 2 × 1 block, neutral plane the bottom face',
      plate(2, 2, 1) + 'p.draft(5, [0, 0, 0], [[1, 0.5, 0], [-1, 0.5, 0], [0, 0.5, 1], [0, 0.5, -1]]);\n',
      { cf: (4 + Math.pow(2 - 2 * t5, 2) + 2 * (2 - 2 * t5)) / 3 });
    add('G27', 'Draft 5° on one side of a 2 × 2 × 1 block, neutral plane the top face', plate(2, 2, 1) + 'p.draft(5, [0, 1, 0], [[1, 0.5, 0]]);\n', { cf: 4 - t5 });
    add('G28', 'Draft 3° on the two ends of a 3 × 2 × 1.5 block with a Ø0.5 through hole, neutral plane the bottom',
      plate(3, 2, 1.5) + 'p.sketch("Top", 1.5).circle(0, 0, 0.25).end().cut("through", { reverse: true });\np.draft(3, [0, 0, 0.5], [[1.5, 0.75, 0], [-1.5, 0.75, 0]]);\n',
      { cf: 9 - 2 * 0.5 * 2.25 * t3 * 2 - cyl(0.25, 1.5) });

    // ------------------------------------------------------------ patterns whose instances touch or overlap
    add('G29', 'LPattern ×4 of a Ø0.5 × 0.5 boss at 0.5 spacing: the bosses touch along a line', 'p.sketch("Top").rect(0, -1, 4, 1).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0.5, -0.5, 0.25).end().extrude(0.5);\np.linearPattern({ dir: "x", spacing: 0.5, count: 4 });\n',
      { cf: 1 + 4 * cyl(0.25, 0.5) });
    add('G30', 'LPattern ×4 of a 1 × 1 × 0.5 block at 0.75 spacing: the copies overlap', 'p.sketch("Top").rect(0, -1, 5, 1).end().extrude(0.25);\np.sketch("Top", 0.25).rect(0.5, -1, 1, 1).end().extrude(0.5);\np.linearPattern({ dir: "x", spacing: 0.75, count: 4 });\n',
      { cf: 1.25 + 3.25 * 0.5 });
    add('G31', 'CirPattern ×6 of a Ø0.8 hole 0.6 off centre in a Ø4 × 0.25 disk: the holes overlap (a rosette)',
      'p.sketch("Top").circle(0, 0, 2).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0.6, 0, 0.4).end().cut("through", { reverse: true });\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 6 });\n',
      { cf: 0.25 * (4 * PI - 6 * PI * 0.16 + 6 * lens(0.4, 0.4, 0.6)) });   // neighbours overlap (0.6 apart), no three meet
    add('G32', 'CirPattern ×4 of a 2 × 0.25 × 0.5 bar from the axis: the bars cross at the centre', 'p.sketch("Top").circle(0, 0, 2.5).end().extrude(0.25);\np.sketch("Top", 0.25).rect(0, -0.125, 2, 0.25).end().extrude(0.5);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 4 });\n',
      { cf: cyl(2.5, 0.25) + 0.5 * (0.0625 + 4 * 1.875 * 0.25) });

    // ------------------------------------------------------------ Hole Wizard on a cylinder, Wrap, revolved stacks
    add('G33', 'Hole Wizard on a cylinder: 1/4-20 tapped 0.5 deep (thread 0.375) radially into a Ø2 × 1.5 shaft',
      'p.sketch("Top").circle(0, 0, 1).end().extrude(1.5);\np.holeWizard({ face: "Right", offset: 1, points: [[0, 0.75]], standard: "ANSI Inch", type: "tap", size: "1/4-20 UNC", depth: 0.5, threadDepth: 0.375 });\n');
    add('G34', 'Wrap scribe: a 1 × 0.5 rectangle scribed on a Ø2 × 3 shaft (no volume change)',
      'p.sketch("Top").circle(0, 0, 1).end().extrude(3);\np.sketch("Front", 1).centerRect(0, 1.5, 1, 0.5).end().wrap({ face: [0, 1.5, 1], mode: "scribe" });\n', { cf: cyl(1, 3) });
    add('G35', 'Wrap deboss 0.05: a 1 × 0.5 rectangle on a Ø2 × 3 shaft', 'p.sketch("Top").circle(0, 0, 1).end().extrude(3);\np.sketch("Front", 1).centerRect(0, 1.5, 1, 0.5).end().wrap({ face: [0, 1.5, 1], mode: "deboss", thickness: 0.05 });\n',
      { cf: cyl(1, 3) - 0.5 * 1 * (1 - 0.95 * 0.95) / 2 });
    add('G36', 'stepped shaft (revolve) Ø1.5 × 1 / Ø1 × 2: R 0.06 shoulder round, 0.03 chamfers on both ends',
      'p.sketch("Front").polyline([[0, 0], [0.75, 0], [0.75, 1], [0.5, 1], [0.5, 3], [0, 3]]).end().revolve(360);\np.fillet(0.06, [[0.5, 1, 0]]);\np.chamfer(0.03, [[0.75, 0, 0]]);\np.chamfer(0.03, [[0.5, 3, 0]]);\n');
    add('G37', 'pulley hub (revolve) Ø3 × 1 with a Ø1 bore: 0.06 chamfers on both bore ends, R 0.125 round on both outer rims',
      'p.sketch("Front").rect(0.5, 0, 1, 1).end().revolve(360);\np.chamfer(0.06, [[0.5, 0, 0]]);\np.chamfer(0.06, [[0.5, 1, 0]]);\np.fillet(0.125, [[1.5, 0, 0]]);\np.fillet(0.125, [[1.5, 1, 0]]);\n');

    // ------------------------------------------------------------ sheet metal (16 ga 0.0598, R 0.0598, K 0.5)
    var T = 0.0598, R = 0.0598, BA = PI / 2 * (R + T / 2), BD = 2 * (R + T) - BA;
    function head(w, d) { return 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -' + d + ', ' + w + ', ' + d + ').end().baseFlange();\n'; }
    function fl(L, e, o) { return 'p.flange(' + L + ', ' + JSON.stringify(e) + ', ' + (o || '{ position: "inside", lengthRef: "outer" }') + ');\n'; }
    var tray = head(4, 3) + fl(1, [[2, T, 0]]) + fl(1, [[4, T, 1.5]]) + fl(1, [[2, T, 3]]) + fl(1, [[0, T, 1.5]]);
    add('G38', 'Miter Flange 1 high round three edges (front, left, back) of a 4 × 3 blank', head(4, 3) +
      'p.sketch("Right").line(0, ' + T + ', 0, ' + (1 + T) + ').end();\np.miterFlange([[2, ' + T + ', 0], [0, ' + T + ', 1.5], [2, ' + T + ', 3]], {});\n', { sheet: true });
    add('G39', 'Lofted Bend (rectangle to circle transition)', null, { sheet: true, missing: 'Lofted Bend is not in Anvil (the Sheet Metal ribbon button does nothing)' });
    add('G40', 'Insert Bends on a 0.06 thin-wall U channel 3 × 1 × 4 (an extruded section, no rip needed)',
      'p.sketch("Front").polyline([[0, 0], [3, 0], [3, 1], [2.94, 1], [2.94, 0.06], [0.06, 0.06], [0.06, 1], [0, 1]]).end().extrude(4);\np.insertBends([1.5, 0, 2], { radius: 0.06 });\n', { sheet: true });
    add('G41', 'hems on a flanged part: U channel 6 × 4, two 1.5 flanges, an open hem 0.375 on each flange top', head(6, 4) + fl(1.5, [[3, T, 0], [3, T, 4]]) +
      'p.hem(0.375, [[3, 1.5, ' + T / 2 + '], [3, 1.5, ' + (4 - T / 2) + ']]);\n', { sheet: true });
    add('G42', 'Rip (side 1) + Insert Bends: shelled 2 × 2 × 1 box, corners ripped 0.03 keeping one wall square',
      'p.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\np.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], 0.03, { direction: "side1" });\np.insertBends([1, 0, -1], { radius: 0.06 });\n', { sheet: true });
    add('G43', 'Sketched Bend 90° across the middle of a 6 × 1.5 strip with two Ø0.281 holes', head(6, 1.5) +
      'p.sketch("Top", ' + T + ').circle(1, -0.75, 0.1405).circle(5, -0.75, 0.1405).end().cut("through", { reverse: true });\np.sketch("Top", ' + T + ').line(3, 0, 3, -1.5).sketchedBend(90);\n', { sheet: true, flat: [6, 1.5] });
    add('G44', 'U channel: Unfold, a 1 × 0.4 slot straddling the front bend, Fold', head(6, 4) + fl(1.5, [[3, T, 0], [3, T, 4]]) +
      'p.unfold([3, ' + T + ', 2], null);\np.sketch("Top", ' + T + ').centerRect(3, -0.05, 1, 0.4).end().cut("through", { reverse: true });\np.fold(null);\n', { sheet: true, flat: [6, 7 - 2 * BD] });
    add('G45', 'tray 4 × 3, four 1 flanges, Butt Closed Corner at front-left with the bend region closed', tray +
      'p.closedCorner([[' + T / 2 + ', 0.6, ' + (R + T) + ']], { cornerType: "butt", closeBend: true });\n', { sheet: true, flat: [6 - 2 * BD, 5 - 2 * BD] });
    add('G46', 'tray 4 × 3, four 1 flanges, Overlap Closed Corner (ratio 0.5) at front-left', tray +
      'p.closedCorner([[' + T / 2 + ', 0.6, ' + (R + T) + ']], { cornerType: "overlap", ratio: 0.5 });\n', { sheet: true, flat: [6 - 2 * BD, 5 - 2 * BD] });
    add('G47', 'tray 4 × 3, four 1 flanges, Underlap Closed Corners at all four corners (two picks, Coplanar faces takes the other two)', tray +
      'p.closedCorner([[' + T / 2 + ', 0.6, ' + (R + T) + '], [' + T / 2 + ', 0.6, ' + (3 - R - T) + ']], { cornerType: "underlap" });\n',
      { sheet: true, flat: [6 - 2 * BD, 5 - 2 * BD] });
    add('G48', 'Base Flange from an open L profile (3 × 2 legs, 4 deep): SolidWorks thickens the open sketch',
      'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0]], false).end().baseFlange();\n', { sheet: true, refused: 'Base Flange from an open profile is not in Anvil' });
    return out;
  })();
  // Feature-stack fuzz: rfGAfuzz(seed) -> { code, ops }: a plate or a revolved blank (disk / shaft, sometimes bored),
  // then 3–8 features picked at random from boss, cut (through / blind), revolve cut, linear / circular pattern of the
  // last boss or cut, mirror (feature and body), shell, fillet / chamfer on picked edges, rib, draft and combine (a
  // second body, then Intersect keeping some regions). Positions are random on the top face, so features overlap,
  // touch and cross each other and the patterns run into one another: that is the point. (Anvil has no Up To Surface
  // end condition and no Combine command; Intersect stands in for Combine.)
  function rfGArng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rfGAfuzz(seed, s2) {
    if (typeof seed === 'string') seed = s2;   // compare.js calls fuzz(kind, seed)
    var rnd = rfGArng(seed * 104729 + 3), ops = [];
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    function q(x, s) { return Math.round(x / s) * s; }
    function n(x) { return +(+x).toFixed(4); }
    function wpick(w) { var s = 0, k; for (k in w) s += w[k]; var r = rnd() * s; for (k in w) { r -= w[k]; if (r < 0) return k; } return k; }
    var code = 'p.units("in");\n', edges = [], top, plateBlank = rnd() < 0.6, W, D, PT, R, H, rb = 0, lastFeat = false;
    if (plateBlank) {
      W = q(3 + 3 * rnd(), 0.25); D = q(2 + 2 * rnd(), 0.25); PT = pick([0.25, 0.375, 0.5, 0.75]); top = PT;
      code += 'p.sketch("Top").centerRect(0, 0, ' + W + ', ' + D + ').end().extrude(' + PT + ');\n'; ops.push('plate');
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) { edges.push({ k: 'corner', at: [n(s[0] * W / 2), n(PT / 2), n(s[1] * D / 2)], max: PT * 2 }); });
      edges.push({ k: 'topEdge', at: [0, PT, n(D / 2)], max: PT / 2 }, { k: 'topEdge', at: [n(W / 2), PT, 0], max: PT / 2 }, { k: 'botEdge', at: [0, 0, n(-D / 2)], max: PT / 2 });
    } else {
      R = pick([1, 1.5, 2]); H = pick([0.5, 0.75, 1, 2]); rb = pick([0, 0, 0.25, 0.5]); top = H;
      code += 'p.sketch("Front").polyline([[' + rb + ', 0], [' + R + ', 0], [' + R + ', ' + H + '], [' + rb + ', ' + H + ']]).end().revolve(360);\n'; ops.push(rb ? 'ring' : 'disk');
      edges.push({ k: 'rim', at: [R, H, 0], max: H / 2 }, { k: 'rim', at: [R, 0, 0], max: H / 2 });
      if (rb) edges.push({ k: 'boreRim', at: [rb, H, 0], max: Math.min(rb, H) / 2 });
    }
    // a random spot on the top face, r clear of its edge (and of the bore)
    function spot(r) {
      for (var t = 0; t < 12; t++) {
        if (plateBlank) { var x = n((rnd() - 0.5) * (W - 2 * r - 0.2)), z = n((rnd() - 0.5) * (D - 2 * r - 0.2)); return [x, z]; }
        var a = rnd() * 2 * Math.PI, rr = rb + r + 0.1 + rnd() * (R - rb - 2 * r - 0.2);
        if (rr > rb + r + 0.05 && rr < R - r - 0.05) return [n(rr * Math.cos(a)), n(rr * Math.sin(a))];
      }
      return null;
    }
    var nOps = 3 + Math.floor(rnd() * 6);
    for (var i = 0; i < nOps; i++) {
      var op = wpick({ boss: 2, cutThrough: 2, cutBlind: 1, revolveCut: 1, lpattern: lastFeat ? 1.2 : 0, cpattern: lastFeat ? 1.2 : 0, mirrorFeature: lastFeat ? 1 : 0,
        mirrorBody: 0.8, shell: 0.5, fillet: 1.5, chamfer: 1, rib: 0.7, draft: plateBlank ? 0.6 : 0, combine: 0.7 });
      var r, s, h, wasFeat = false;
      if (op === 'boss' || op === 'cutThrough' || op === 'cutBlind') {
        var round = rnd() < 0.6; r = pick([0.125, 0.1875, 0.25, 0.375]); s = spot(r);
        if (!s) continue;
        var prof = round ? '.circle(' + s[0] + ', ' + n(-s[1]) + ', ' + r + ')' : '.centerRect(' + s[0] + ', ' + n(-s[1]) + ', ' + n(2 * r) + ', ' + n(r * pick([1, 1.5, 2])) + ')';
        if (op === 'boss') {
          h = pick([0.25, 0.5, 0.75]);
          code += 'p.sketch("Top", ' + n(top) + ')' + prof + '.end().extrude(' + h + ');\n';
          if (round) edges.push({ k: 'bossTop', at: [n(s[0] + r), n(top + h), s[1]], max: r / 2 }, { k: 'bossRoot', at: [n(s[0] + r), n(top), s[1]], max: r });
        } else if (op === 'cutThrough') {
          code += 'p.sketch("Top", ' + n(top + 2) + ')' + prof + '.end().cut("through", { reverse: true });\n';
          if (round) edges.push({ k: 'holeRim', at: [n(s[0] + r), n(top), s[1]], max: r });
        } else {
          code += 'p.sketch("Top", ' + n(top) + ')' + prof + '.end().cut(' + n(top * pick([0.25, 0.5])) + ', { reverse: true });\n';
        }
        ops.push(op + (round ? '' : 'Rect')); wasFeat = true;
      } else if (op === 'revolveCut') {
        var lim = plateBlank ? Math.min(W, D) / 2 - 0.15 : R - 0.1, a0 = n((plateBlank ? 0.2 : rb + 0.1) + rnd() * Math.max(0.05, lim - 0.5)), w = n(0.1 + 0.2 * rnd()), d = n(top * pick([0.2, 0.4]));
        code += 'p.sketch("Front").rect(' + a0 + ', ' + n(top - d) + ', ' + w + ', ' + n(d + 0.25) + ').end().revolveCut(360);\n'; ops.push('revolveCut'); wasFeat = true;
      } else if (op === 'lpattern') {
        code += 'p.linearPattern({ dir: "' + pick(['x', 'z']) + '", spacing: ' + n(pick([0.25, 0.375, 0.5, 0.75, 1]) * (rnd() < 0.3 ? -1 : 1)) + ', count: ' + (2 + Math.floor(rnd() * 3)) + ' });\n'; ops.push('lpattern');
      } else if (op === 'cpattern') {
        code += 'p.circularPattern({ axis: "y", center: [0, 0, 0], count: ' + (2 + Math.floor(rnd() * 5)) + ' });\n'; ops.push('cpattern');
      } else if (op === 'mirrorFeature') {
        code += 'p.mirror("' + pick(['Right', 'Front']) + '");\n'; ops.push('mirrorFeature');
      } else if (op === 'mirrorBody') {
        var pl = pick(['Right', 'Front', 'Top']), off = pl === 'Top' ? 0 : pick([0, 0, 0.25, -0.5]);
        code += 'p.mirror("' + pl + '", { body: true' + (off ? ', offset: ' + off : '') + ' });\n'; ops.push('mirrorBody' + pl);
      } else if (op === 'shell') {
        var at = plateBlank ? [n(W / 2 - 0.1), n(top), n(D / 2 - 0.1)] : [n(R - 0.1), n(top), 0];
        code += 'p.shell(' + pick([0.05, 0.0625, 0.1]) + ', [' + (rnd() < 0.8 ? JSON.stringify(at) : '') + ']);\n'; ops.push('shell');
      } else if (op === 'fillet' || op === 'chamfer') {
        if (!edges.length) continue;
        var e = edges.splice(Math.floor(rnd() * edges.length), 1)[0], rr = n(Math.min(pick([0.03, 0.0625, 0.125, 0.25]), e.max * 0.9));
        code += 'p.' + op + '(' + rr + ', [' + JSON.stringify(e.at) + ']);\n'; ops.push(op + '-' + e.k);
      } else if (op === 'rib') {
        s = spot(0.5); if (!s) continue;
        var len = n(0.5 + rnd()), dx = pick([[1, 0], [0, 1]]);
        code += 'p.sketch("Top", ' + n(top + 0.4 + 0.4 * rnd()) + ').line(' + n(s[0] - dx[0] * len / 2) + ', ' + n(-s[1] + dx[1] * len / 2) + ', ' + n(s[0] + dx[0] * len / 2) + ', ' + n(-s[1] - dx[1] * len / 2) + ').end().rib(' + pick([0.1, 0.125, 0.25]) + ', { direction: "normal" });\n';
        ops.push('rib');
      } else if (op === 'draft') {
        var faces = [[n(W / 2), n(PT / 2), 0], [n(-W / 2), n(PT / 2), 0], [0, n(PT / 2), n(D / 2)], [0, n(PT / 2), n(-D / 2)]].filter(function () { return rnd() < 0.6; });
        if (!faces.length) faces = [[n(W / 2), n(PT / 2), 0]];
        code += 'p.draft(' + pick([1, 3, 5]) + ', [0, 0, 0], ' + JSON.stringify(faces) + ');\n'; ops.push('draft');
      } else if (op === 'combine') {
        r = pick([0.25, 0.5, 0.75]); s = spot(Math.min(r, 0.3)) || [0, 0];
        var tool = rnd() < 0.5 ? '.circle(' + s[0] + ', ' + n(-s[1]) + ', ' + r + ')' : '.centerRect(' + s[0] + ', ' + n(-s[1]) + ', ' + n(2 * r) + ', ' + n(1.5 * r) + ')';
        var keep = [true, rnd() < 0.5, rnd() < 0.5];
        code += 'p.sketch("Top", ' + n(top * pick([-0.5, 0.5])) + ')' + tool + '.end().extrude(' + n(top * pick([0.5, 1, 2])) + ', { merge: false });\np.intersect({ regions: ' + JSON.stringify(keep) + ' });\n';
        ops.push('combine-' + keep.map(function (k) { return k ? 1 : 0; }).join(''));   // regions A only, B only, A∩B: 100 subtract, 111 add, 110 xor, 101 A kept
      }
      lastFeat = wasFeat;
    }
    return { code: code, ops: ops };
  }
  // rfGA-TABLE-END
  // OpenCascade's [volume, bodies, bbox [x0, y0, z0, x1, y1, z1], what went wrong] for every part (OcctKernel.build
  // headless, main checkout at ffadfbf, 2026-10-30: compare.js --table rfGA --occt; G01, G10, G20, G29–G33 re-measured
  // after lane FZ2 by lane GA2: OpenCascade now equals the closed forms there). Re-measure after engine work.
  var rfGAocc = {
      G01: [6.388918463, 1, [-3,-0.25,-3,3,0.75,3]], G02: [1.030835089, 1, [-1,0,-1,1,0.5,1]],
      G03: [1.798444943, 1, [-0.96875,0,-0.96875,0.96875,0.75,0.96875]], G04: [1.178097245, 1, [-1,0,-1,1,1,0]],
      G05: [2.196349541, 1, [-2,0,-1,2,0.75,1]], G06: [3, 1, [-2,0,-1,2,0.75,1]],
      G07: [6.589048623, 1, [-1.5,-1,-1,1.5,1,1]], G08: [5.607300918, 1, [-1,0,-1.5,1,1,1.5]],
      G09: [5.825912615, 1, [-2,0,-1.5,2,0.5,1.5]],
      G10: [3.946349541, 1, [-2,0,-1,2,0.5,1], "= the closed form since lane FZ2; the bbox / body check is skipped while Anvil's own Mirror of a fillet grows the bbox (VOLTODO G10)"],
      G11: [4.6640625, 1, [-2,0,-1.5,2,2,1.5]], G12: [3.308203522, 1, [-2,0,-1.5,2,1.5,1.5]],
      G13: [3.503599424, 1, [-2,0,-1.5,2,2,1.5]], G14: [3.000466421, 1, [-1.5,0,-1.5,1.5,2,1.5]],
      G15: [1.776528792, 1, [-0.5,0,-0.5,4,4.5,0.5]], G16: [1.542560181, 1, [-0.25,0,-0.25,4,4.75,0.25]],
      // lane lofts: G17 and G18 changed with OpenCascade's loft, which now follows SolidWorks (17.51832923, 12.47522741)
      // instead of its own smoothing (was 17.543490481, 12.468594822); G18's rim is the arcs' cubic, 2.9e-4 inside r 1.5
      G17: [17.518306041, 1, [-1.5,0,-1.5,1.5,3,1.5]], G18: [12.474921136, 1, [-1.499705,0,-1.499705,1.499705,3,1.499705]],
      G19: [28, 1, [-2,0,-2,2,3,2]],
      G20: [5.333333326, 1, [-1,-1,-1,1,1,1]],
      G21: [7.232854132, 1, [-1.5,0,-1.5,1.5,1,1.5]], G22: [7.233037288, 1, [-1,-1,-1,1,1,1]],
      G23: [7.4375, 1, [0,0,-2,4,3,2]], G24: [2.45, 1, [-2,0,-1,2,1,1]], G25: [2.69, 1, [-2,0,-1.5,2,1,1.5]],
      G26: [3.660251034, 1, [-1,0,-1,1,1,1]], G27: [3.912511336, 1, [-1,0,-1,1,1,1]],
      G28: [8.469640682, 1, [-1.5,0,-1,1.5,1.5,1]],
      G29: [1.392699082, 1, [0,0,0,4,0.75,1], "builds the touching bosses (Anvil refuses them as SolidWorks does)"],
      G30: [2.875, 1, [0,0,0,5,0.75,1]],
      G31: [2.496405238, 1, [-2,0,-2,2,0.25,2]],
      G32: [5.877488521, 1, [-2.5,0,-2.5,2.5,0.75,2.5]],
      G33: [4.696563657, 1, [-1,0,-1,1,1.5,1]], G34: [9.424777961, 1, [-1,0,-1,1,3,1]],
      G35: [9.400403044, 1, [-1,0,-1,1,3,1]], G36: [3.336956597, 1, [-0.75,0,-0.75,0.75,3,0.75]],
      G37: [6.209394232, 1, [-1.5,0,-1.5,1.5,1,1.5]], G38: [1.333810675, 1, [0,0,0,4,1.0598,3]] /* SolidWorks: the square notch (2026-11-02); OpenCascade 1.333839 */,
      G40: [1.152658401, 1, [0,0,0,3,1,4]], G41: [2.757629778, 1, [0,0,0,6,1.57475,4]],
      G42: [0.653834158, 1, [0,0,-2,2,1,0], "OpenCascade 0.653834158 after Rip went through the floor (SolidWorks 2022: the slot runs the corner's whole length); SolidWorks' flat 0.653189"],
      G43: [0.530782907, 1, [2.95085,0,0,6,3.04915,1.5]], G44: [2.417140229, 1, [0,0,0,6,1.5,4]],
      G45: [1.445061815, 1, [0,0,0,4,1,3]], G46: [1.447206998, 1, [0,0,0,4,1,3]],
      G47: [1.453061469, 1, [0,0,0,4,1,3]], G48: [0, 0, null, "error: Sketch has no closed profile."]
  };
  (function () {
    group('rfGA: second confidence corpus, 48 inch shop parts on the features rfFT skipped (revolve, mirror, shell, sweep, loft, combine, rib, draft, touching patterns, Wrap, sheet metal) against closed forms and OpenCascade; seeded feature-stack fuzz');
    var PLAIN = /^[A-Z][^]*\.$/, JSERR = /TypeError|ReferenceError|Cannot read|is not a function|undefined|NaN|Infinity|\bnull\b/;
    // results with open edges today: an 'rfGA TODO' row gives the counts (promote once closed)
    var OPEN = {};   // G46 closed by lane FW (Closed Corner bend ends rebuilt from the flat)
    // refusals: [true when SolidWorks refuses too (a hard row), why]
    var REFUSED = { G29: [true, 'the bosses touch along a line: zero-thickness geometry, which SolidWorks refuses too'],
      G24: [true, 'a free-ended rib Normal to Sketch: SolidWorks: "The rib is not bounded properly" (rfGD R20a); this row used to pin 2.45'],
      G48: [false, 'Base Flange from an open profile is not in Anvil'] };
    // volume mismatches: [loose hard tolerance, why]
    var FACET = [1e-3, 'Anvil\'s bend surfaces are faceted chords with no cylinder record in Mass Properties: 1e-4 to 7e-4 light'];
    // (G10 Mirror of a fillet and G13 shell after fillets are exact since rfGB)
    var VOLTODO = {
      G17: [5e-5, 'square → circle loft: one surface on both engines, Anvil\'s facets of it are 3.6e-5 light (SolidWorks 17.51832923)'],
      G18: [2e-5, 'circle → square → circle loft: one surface on both engines, Anvil\'s facets and exact rims 1.2e-5 apart (SolidWorks 12.47522741)'] };
    // (G38, G40-G47 were FACET rows until lane FX's bend cylinder records: hard rows now, = OpenCascade to 1e-5)
    // flat area × T = OpenCascade's exact folded volume (K 0.5, straight bends, no round holes, no mitres)
    var FLATVOL = 'G40 G41 G44 G46 G47'.split(' ');
    var cache = {};
    function rfGAget(p) {
      if (cache[p.id]) return cache[p.id];
      var r = build(p.code), open = 0, nm = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      r.open = open; r.nm = nm;
      if (p.sheet && r.body) {
        r.flat = K.flatPattern(r.model, r.build, r.mesh);
        var fc = Evaluate.checkBody(K.flatBody(r.model, r.build, r.flat).body);
        r.flatOpen = fc.openEdges.length + fc.nonManifoldEdges.length;
        r.flatAreaT = r.flat.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0) * K.sheetParams(r.model).thickness;
      }
      return (cache[p.id] = r);
    }
    rfGAparts.forEach(function (p) {
      if (p.missing) { test('rfGA TODO: ' + p.id + ' ' + p.d + ': ' + p.missing, function () { return 'TODO not built: ' + p.missing; }); return; }
      var occ = rfGAocc[p.id], todo = VOLTODO[p.id], ref = p.cf != null ? p.cf : occ[0], refused = REFUSED[p.id];
      if (refused) {
        test((refused[0] ? 'rfGA: ' : 'rfGA TODO: ') + p.id + ' ' + p.d + ': refused in a plain sentence (' + refused[1] + ')', function () {
          var r = rfGAget(p), e = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
          if (!e.length) { if (refused[0]) fail('built with no error (volume ' + r.mp.volume.toFixed(6) + ')'); return 'builds now: promote to a hard test (volume ' + r.mp.volume.toFixed(6) + ')'; }
          e.forEach(function (m) { assert(PLAIN.test(m) && !JSERR.test(m), 'message: ' + m); });
          assert(!r.open && !r.nm, r.open + ' open, ' + r.nm + ' non-manifold edges in the part kept');
          return (refused[0] ? '' : 'TODO ') + 'refused: ' + e[0];
        });
        return;
      }
      test('rfGA: ' + p.id + ' ' + p.d + (p.cf != null ? ' (closed form)' : ' (OpenCascade)'), function () {
        var r = rfGAget(p), e = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
        assert(!e.length, 'errors: ' + e.join(' | '));
        if (!OPEN[p.id]) {
          assert(!r.open && !r.nm, r.open + ' open, ' + r.nm + ' non-manifold edges');
          nearRel(polyVol(r.mp), r.body.volume(), 1e-6, 'mesh volume vs polygon volume');
        }
        if (!occ[3]) {
          assert(r.build.bodies.length === occ[1], r.build.bodies.length + ' bodies, OpenCascade ' + occ[1]);
          var bb = r.mp.bbox, ob = occ[2], bbt = todo && todo[2] || 0.002;
          for (var i = 0; i < 3; i++) assert(Math.abs(bb.min[i] - ob[i]) <= bbt && Math.abs(bb.max[i] - ob[i + 3]) <= bbt, 'bbox ' + bboxStr(bb) + ' vs OpenCascade ' + JSON.stringify(ob));
        }
        nearRel(r.mp.volume, todo && p.cf == null ? occ[0] : ref, todo ? todo[0] : 1e-5, p.id + ' volume');
        var d = 'volume ' + r.mp.volume.toFixed(6);
        if (p.sheet) {
          assert(r.flatOpen === 0, 'flat: ' + r.flatOpen + ' open edges');
          if (p.flat) { near(r.flat.size[0], p.flat[0], 1e-9, 'flat width'); near(r.flat.size[1], p.flat[1], 1e-9, 'flat height'); }
          if (FLATVOL.indexOf(p.id) >= 0) nearRel(r.flatAreaT, occ[0], 1e-9, 'flat area × T vs OpenCascade volume');
          d += ', flat ' + r.flat.size.map(fmt).join(' × ');
        }
        return d;
      });
      if (OPEN[p.id]) test('rfGA TODO: ' + p.id + ' closed: ' + OPEN[p.id], function () {
        var r = rfGAget(p);
        return !r.open && !r.nm ? 'closed now: promote to a hard test' : 'TODO ' + r.open + ' open, ' + r.nm + ' non-manifold edges';
      });
      if (todo) test('rfGA TODO: ' + p.id + ' volume = ' + (p.cf != null ? 'closed form ' + p.cf.toFixed(6) : 'OpenCascade ' + occ[0].toFixed(6)) + ' to 1e-4: ' + todo[1], function () {
        var r = rfGAget(p), want = p.cf != null ? p.cf : occ[0], rel = (r.mp.volume - want) / want;
        return Math.abs(rel) <= 1e-4 ? 'matches now: promote to a hard test' : 'TODO Anvil ' + r.mp.volume.toFixed(9) + ' / ' + (p.cf != null ? 'closed form ' : 'OpenCascade ') + want.toFixed(9) + ' (rel ' + rel.toExponential(2) + ')';
      });
      // OpenCascade's own misses on parts Anvil gets right (owner occt-kernel.js), listed so they are seen
      if (occ[3] && p.cf != null && !todo) test('rfGA TODO: ' + p.id + ' on OpenCascade: ' + occ[3], function () { return 'TODO OpenCascade ' + occ[0] + ' in³: ' + occ[3]; });
    });

    // seeded feature-stack fuzz, seeds 1–20 (compare.js --table rfGA --fuzz 1000 runs more by hand). Allowed: a refusal
    // in a plain sentence; an open result only when the stack holds a pinned known failure (KNOWN). Anything else fails
    // with its seed.
    var KNOWN = /^$/;   // (pin 4, Intersect keeping two regions that touch only along an edge, is fixed since rfGB: no exemption left)
    test('rfGA: seeded feature-stack fuzz (seeds 1–20): no exception, plain refusals, closed results, consistent volumes', function () {
      var n = { ok: 0, refused: 0, known: 0 }, bad = [];
      for (var s = 1; s <= 20; s++) {
        var c = rfGAfuzz(s), r;
        try { r = build(c.code); } catch (e) { bad.push(s + ' threw ' + e.message); continue; }
        var errs = Object.keys(r.errors).map(function (k) { return r.errors[k]; }), open = 0;
        errs.forEach(function (m) { if (!PLAIN.test(m) || JSERR.test(m)) bad.push(s + ' message: ' + m); });
        (r.build.bodies || []).forEach(function (b) { var ck = Evaluate.checkBody(b); open += ck.openEdges.length + ck.nonManifoldEdges.length; });
        if (open) { if (KNOWN.test(c.ops.join(' '))) n.known++; else bad.push(s + ' (' + c.ops.join(' ') + '): ' + open + ' open / non-manifold edges'); continue; }
        if (r.body && Math.abs(polyVol(r.mp) - r.body.volume()) > 1e-6 * Math.abs(r.body.volume())) bad.push(s + ': mesh volume ' + polyVol(r.mp) + ' vs polygon volume ' + r.body.volume());
        n[errs.length ? 'refused' : 'ok']++;
      }
      assert(!bad.length, bad.join(' | '));
      return n.ok + ' built, ' + n.refused + ' refused in a plain sentence, ' + n.known + ' open with a pinned known failure';
    });

    // the smallest scripts that reproduce what the fuzz found; each passes and says 'closed now: promote' once
    // fixed. Owner files in test-reports/2026-10-30-solids-confidence-2.md.
    var U = 'p.units("in");\n';
    var PINS = [
      ['a plain Ø0.75 × 0.25 boss on a 3.5 × 2.75 × 0.5 plate at (1.0089, 0.6446) (fuzz 69; at (1, 0.6446) it is closed)', U + 'p.sketch("Top").centerRect(0, 0, 3.5, 2.75).end().extrude(0.5);\np.sketch("Top", 0.5).circle(1.0089, -0.6446, 0.375).end().extrude(0.25);\n'],
      ['Ø3 × 0.5 disk (revolve), R 0.03 rim round, shell 0.0625 open top (fuzz 96; without the round it is closed)', U + 'p.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.5], [0, 0.5]]).end().revolve(360);\np.fillet(0.03, [[1.5, 0.5, 0]]);\np.shell(0.0625, [[1.4, 0.5, 0]]);\n'],
      ['plate shelled 0.0625 open top, a Ø0.375 boss from the open top, LPattern ×3 so copies sit on the wall tops (fuzz 99)', U + 'p.sketch("Top").centerRect(0, 0, 4.75, 2.75).end().extrude(0.25);\np.shell(0.0625, [[2.275, 0.25, 1.275]]);\np.sketch("Top", 0.25).circle(0.6023, 0.9684, 0.1875).end().extrude(0.75);\np.linearPattern({ dir: "z", spacing: -0.5, count: 3 });\n'],
      ['Intersect keeping A only and B only (no A∩B), merged: a ring and a Ø0.5 rod meet only along edges, no zero-thickness refusal (fuzz 64, also 6, 56, 95)', U + 'p.sketch("Front").polyline([[0.25, 0], [1, 0], [1, 1], [0.25, 1]]).end().revolve(360);\np.sketch("Top", 0.5).circle(-0.0406, 0.6288, 0.25).end().extrude(1, { merge: false });\np.intersect({ regions: [true, true, false] });\n'],
      ['ring OD 3 / ID 1 × 1 (revolve), R 0.0625 outer rim round, shell 0.1 open top (fuzz 117: 20 open; pin 2\'s class, 6 of the 25 other open stacks in fuzz 1000)', U + 'p.sketch("Front").polyline([[0.5, 0], [1.5, 0], [1.5, 1], [0.5, 1]]).end().revolve(360);\np.fillet(0.0625, [[1.5, 1, 0]]);\np.shell(0.1, [[1.4, 1, 0]]);\n'],
      ['5.5 × 3.25 × 0.5 plate, R 0.25 corner round, then three Drafts (1°, 3°, 3°) on the sides from the bottom (fuzz 240)', U + 'p.sketch("Top").centerRect(0, 0, 5.5, 3.25).end().extrude(0.5);\np.fillet(0.25, [[2.75, 0.25, 1.625]]);\np.draft(1, [0, 0, 0], [[2.75, 0.25, 0], [0, 0.25, 1.625], [0, 0.25, -1.625]]);\np.draft(3, [0, 0, 0], [[2.75, 0.25, 0], [-2.75, 0.25, 0], [0, 0.25, 1.625], [0, 0.25, -1.625]]);\np.draft(3, [0, 0, 0], [[2.75, 0.25, 0], [0, 0.25, 1.625]]);\n'],
      ['5.25 × 3 × 0.375 plate, a Ø0.5 through hole, a revolved groove r 0.28–0.38 × 0.075 deep round the centre (fuzz 311)', U + 'p.sketch("Top").centerRect(0, 0, 5.25, 3).end().extrude(0.375);\np.sketch("Top", 2.375).circle(-0.7714, -0.2895, 0.25).end().cut("through", { reverse: true });\np.sketch("Front").rect(0.2786, 0.3, 0.1028, 0.325).end().revolveCut(360);\n'],
      ['4 × 3.5 × 0.25 plate, a 0.25 × 0.125 × 0.75 block, CirPattern ×4 about the centre (fuzz 760)', U + 'p.sketch("Top").centerRect(0, 0, 4, 3.5).end().extrude(0.25);\np.sketch("Top", 0.25).centerRect(0.289, 0.9964, 0.25, 0.125).end().extrude(0.75);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 4 });\n']
    ];
    // closed since: pins 1, 3, 7, 8 by lane FV (csg.js snapTwins: the same corner computed from both solids up to 7e-7
    // apart, split by the meshes' 1e-6 weld grid; restoreFar for pin 8), with the closed-form volume where there is one;
    // pins 2, 4, 5, 6 by lane GB (a refusal in a plain sentence matching re, or a volume and a body count). Hard rows all.
    var FIXED = { 1: { vol: 3.5 * 2.75 * 0.5 + Math.PI * 0.375 * 0.375 * 0.25 }, 3: {}, 7: {}, 8: { vol: 4 * 3.5 * 0.25 + 4 * 0.25 * 0.125 * 0.75 },
      2: { vol: Math.PI * 1.125 - 2 * Math.PI * 0.0009 * (1 - Math.PI / 4) * (1.47 + 0.03 / (6 * (1 - Math.PI / 4))) - Math.PI * 1.4375 * 1.4375 * 0.4375 },   // = SolidWorks' 0.6923141, rfGD R09a (the refusal here was false: sharp inner corner, rfGH)
      4: { vol: Math.PI * 0.9375, bodies: 2 },   // the ring and the rod's upper half, kept as two bodies
      5: { vol: Math.PI * 2 - 2 * Math.PI * 0.0625 * 0.0625 * (1 - Math.PI / 4) * (1.4375 + 0.0625 / (6 * (1 - Math.PI / 4))) - Math.PI * (1.96 - 0.36) * 0.9 },   // ring − sharp cavity, as SolidWorks' R09a rule
      6: { re: /is tangent to a round that is not drafted with it/ } };
    PINS.forEach(function (pin, i) {
      var fx = FIXED[i + 1];
      test('rfGA: pin ' + (i + 1) + ' closed: ' + pin[0], function () {
        var r = build(pin[1]), open = 0, nm = 0;
        (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
        assert(!open && !nm, open + ' open, ' + nm + ' non-manifold edges');
        var e = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
        e.forEach(function (m) { assert(PLAIN.test(m) && !JSERR.test(m), 'message: ' + m); });
        if (fx.re) { assert(e.length && fx.re.test(e[0]), 'refused: ' + e.join(' | ')); return 'refused: ' + e[0]; }
        assert(!e.length, 'errors: ' + e.join(' | '));
        if (fx.bodies) assert(r.build.bodies.length === fx.bodies, r.build.bodies.length + ' bodies');
        if (fx.vol != null) nearRel(r.mp.volume, fx.vol, fx.bodies ? 1e-6 : 1e-9, 'volume');
        return 'closed, volume ' + r.mp.volume.toFixed(9) + ', ' + r.build.bodies.length + ' bodies';
      });
    });
  })();
