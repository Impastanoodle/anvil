  var EXTRA = [
    { name: 'mid-plane extrude with a slot and a hole', code: 'p.sketch("Front").rect(-30, -10, 60, 20).slot(-15, 0, 15, 0, 6).extrude(12, { midplane: true });' },
    { name: 'two-direction extrude, reversed', code: 'p.sketch("Top").circle(0, 0, 12).extrude(10, { depth2: 4, reverse: true });' },
    { name: 'partial revolve (120°) of a rectangle', code: 'p.sketch("Front").rect(10, 0, 8, 20).revolve(120);' },
    { name: 'revolve cut groove', code: 'p.sketch("Front").polyline([[0,0],[20,0],[20,40],[0,40]], true).revolve(360);\np.sketch("Front").rect(18, 15, 4, 6).revolveCut(360);' },
    { name: 'circular pattern of a pocket over 180°', code: 'p.cylinder(40, 10);\np.sketch("Top", 10).circle(30, 0, 4).cut(5, { reverse: true });\np.circularPattern({ axis: "y", count: 4, angle: 180 });' },
    { name: 'mirror the body across Right', code: 'p.box(20, 10, 10, { at: [5, 0, 0] });\np.hole("Top", 15, -5, 4, { offset: 10 });\np.mirror("Right", { body: true });' },
    { name: 'two bodies (merge: false) and a cut limited to body 1', code: 'p.box(20, 20, 20);\np.box(20, 20, 20, { at: [30, 0, 0], merge: false });\np.sketch("Top", 20).rect(-5, -15, 60, 10).cut(5, { reverse: true, bodies: [1] });' },
    { name: 'arcs and lines profile (slot-like polyline with arcs)', code: 'p.sketch("Front").line(0, 0, 30, 0).arc(30, 10, 10, -90, 90).line(30, 20, 0, 20).line(0, 20, 0, 0).extrude(5);' },
    // stage 2
    { name: 'Hole Wizard: counterbore, countersink, tapped and plain holes', code: 'p.box(120, 30, 20);\np.holeWizard({ face: "Top", offset: 20, points: [[15, -15]], type: "cbore", size: "M8", depth: 15 });\np.holeWizard({ face: "Top", offset: 20, points: [[45, -15]], type: "csk", size: "M6", end: "through" });\np.holeWizard({ face: "Top", offset: 20, points: [[75, -15], [105, -15]], type: "tap", size: "M5", depth: 12 });' },
    { name: 'closed hollow shell (no faces removed)', code: 'p.box(40, 30, 20);\np.shell(2, []);' },
    { name: 'drafted boss and drafted pocket', code: 'p.sketch("Top").centerRect(0, 0, 40, 30).extrude(15, { draft: 5 });\np.sketch("Top", 15).circle(0, 0, 8).cut(8, { reverse: true, draft: 3 });' },
    { name: 'sweep of a circle along a line-arc-line path', code: 'var prof = p.sketch("Right").circle(0, 0, 3).id();\nvar path = p.sketch("Front").line(0, 0, 20, 0).arc(20, 15, 15, -90, 0).line(35, 15, 35, 40).id();\np.sweep({ profile: prof, path: path });', exact: Math.PI * 9 * (20 + Math.PI / 2 * 15 + 25) },
    // sheet metal: a 100 × 60 × 2 base flange and a 90° edge flange (inner radius 2, wall 20) on a 60 mm edge; the bend
    // is a quarter annulus exactly in OpenCascade (Anvil facets it 8 times per 90°)
    { name: 'base flange + 90° edge flange (exact bend)', code: 'p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);\np.flange(20, [[100, 2, 30]]);', exact: 100 * 60 * 2 + 60 * (Math.PI / 4 * (16 - 4) + 2 * 20) },
    { name: 'jog (offset 10, length 15)', code: 'p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -40, 60, 40).end().baseFlange(2);\np.jog(10, 15, [[60, 2, 20]]);' },
    { name: 'fillet around a hole rim and a straight edge', code: 'p.box(40, 40, 10);\np.hole("Top", 20, -20, 12, { offset: 10 });\np.fillet(1.5, [[26, 10, 20], [0, 10, 20]]);' },
    // --- refine/perf ---
    // a rim picked where the cylinder's seam meets it (the seam is no longer a candidate edge; the fillet failed on it)
    { name: 'fillet and chamfer on cylinder rims picked at the seam', code: 'p.cylinder(20, 30);\np.fillet(3, [[20, 30, 0]]);\np.chamfer(2, [[20, 0, 0]]);' },
    // all 12 edges: spherical corners in both kernels (exact rounded box; Anvil's since lane FF, 26 faces each)
    { name: 'fillet on all 12 edges of a box (rounded box)', code: 'p.box(40, 30, 20);\np.fillet(3, [[20,0,0],[20,0,30],[20,20,0],[20,20,30],[0,10,0],[40,10,0],[0,10,30],[40,10,30],[0,0,15],[40,0,15],[0,20,15],[40,20,15]]);',
      exact: 34 * 24 * 14 + 6 * (34 * 24 + 24 * 14 + 34 * 14) + Math.PI * 9 * (34 + 24 + 14) + 4 / 3 * Math.PI * 27 },
    // a shell of a round part: exact walls in OpenCascade, polygonal in Anvil -> the loose tolerance, so it drives
    { name: 'closed shell of a cylinder', code: 'p.cylinder(20, 30);\np.shell(2, []);', exact: Math.PI * (400 * 30 - 324 * 26) },
    // a closed path: every corner mitred, the start / end joint too
    { name: 'sweep along a closed rectangular path', code: 'var prof = p.sketch("Right").circle(0, 0, 3).id();\nvar path = p.sketch("Front").polyline([[0,0],[0,-30],[40,-30],[40,0]], true).id();\np.sweep({ profile: prof, path: path });', exact: Math.PI * 9 * 140 },
    // --- end refine/perf ---
    // --- sketch-spline: ellipses as gp_Elips edges, splines as B-spline edges (exact in both kernels for ellipses) ---
    { name: 'ellipse (rotated) extruded', code: 'p.sketch("Front").ellipse(3, 2, 20, 10, 30).extrude(5);', exact: Math.PI * 200 * 5 },
    { name: 'tall ellipse on Top (axes swapped for OpenCascade)', code: 'p.sketch("Top").ellipse(1, 1, 6, 10, 15).extrude(5);', exact: Math.PI * 60 * 5 },
    { name: 'partial ellipse closed by a line, on Right', code: 'p.sketch("Right").partialEllipse(0, 0, 20, 10, 0, 0, 180).line(-20, 0, 20, 0).extrude(5);', exact: Math.PI * 100 * 5 },
    { name: 'plate cut by an ellipse and a closed spline', code: 'p.sketch("Front").rect(-30, -20, 60, 40).extrude(4);\np.sketch("Front", 4).ellipse(0, 0, 10, 5, 20).spline([[12, 0], [18, 6], [24, 0], [18, -6]], true).cut("through", { reverse: true });' },
    { name: 'open spline with a driving tangent closed by a line', code: 'p.sketch("Front").spline([[0, 0], [5, 4], [12, 3], [20, 0]], false, [[80, 1.5], null, null, null]).line(0, 0, 20, 0).extrude(1);' },
    // --- end sketch-spline ---
    // --- rfFF: fillets / chamfers on circular edges are torus / cone patches in Anvil too (exact), spherical corners ---
    { name: 'rfFF: Ø100 × 20 cylinder, top rim R6 (torus)', code: 'p.cylinder(50, 20);\np.fillet(6, [[50, 20, 0]]);',
      exact: Math.PI * 2500 * 20 - 2 * Math.PI * (50 - 6 * (10 - 3 * Math.PI) / (3 * (4 - Math.PI))) * 36 * (1 - Math.PI / 4) },
    { name: 'rfFF: Ø20 through hole, R2 on both hole edges', code: 'p.cylinder(50, 20);\np.hole("Top", 0, 0, 20, { offset: 20 });\np.fillet(2, [[10, 20, 0], [10, 0, 0]]);',
      exact: Math.PI * 2400 * 20 - 4 * Math.PI * (10 + 2 * (10 - 3 * Math.PI) / (3 * (4 - Math.PI))) * 4 * (1 - Math.PI / 4) },
    { name: 'rfFF: chamfer 3 on a Ø100 rim (cone)', code: 'p.cylinder(50, 20);\np.chamfer(3, [[50, 20, 0]]);', exact: Math.PI * 2500 * 20 - 2 * Math.PI * 49 * 4.5 },
    { name: 'rfFF: Ø20 boss root R3 (concave torus)', code: 'p.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 10).extrude(15);\np.fillet(3, [[40, 10, 30]]);',
      exact: 36000 + Math.PI * 1500 + 2 * Math.PI * (10 + 3 * (10 - 3 * Math.PI) / (3 * (4 - Math.PI))) * 9 * (1 - Math.PI / 4) },
    { name: 'rfFF: 5° drafted boss, root R3 and top rim R2 (plane-cone tori)', code: 'p.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 10).extrude(15, { draft: 5 });\np.fillet(3, [[40, 10, 30]]);\np.fillet(2, [[' + (40 - 15 * Math.tan(5 * Math.PI / 180)) + ', 25, 30]]);' },
    { name: 'rfFF: vertical edges R5, then the top outline R2 round them', code: 'p.box(40, 30, 20);\np.fillet(5, [[0, 10, 0], [40, 10, 0], [0, 10, 30], [40, 10, 30]]);\np.fillet(2, [[20, 20, 0]]);',
      exact: 24000 - 4 * 25 * 20 * (1 - Math.PI / 4) - 4 * (1 - Math.PI / 4) * (2 * 30 + 2 * 20) - 2 * Math.PI * (5 - 2 * (10 - 3 * Math.PI) / (3 * (4 - Math.PI))) * 4 * (1 - Math.PI / 4) }
  ];
  var parts = EX.filter(function (e) { return e.kind !== 'assembly'; }).map(function (e) { return { name: e.name, code: e.code, exact: e.volume || null }; }).concat(EXTRA);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i], a, r, t0;
    try { t0 = performance.now(); a = anvilBuild(p.code); totals.anvil += performance.now() - t0; }
    catch (e) { row('bad', p.name, 'Anvil could not build it: ' + e.message); counts.fail++; continue; }
    try { t0 = performance.now(); r = await occt(a.model); var ms = performance.now() - t0; totals.occt += ms; }
    catch (e) { row('bad', p.name, 'OpenCascade threw: ' + e.message); counts.fail++; continue; }
    if (r.unsupported) { row('skip', p.name, 'needs ' + r.unsupported); counts.todo++; continue; }
    var bad = [];
    Object.keys(r.status).forEach(function (id) { if (r.status[id] !== 'ok' && a.errors.indexOf(String(id)) < 0 && a.errors.indexOf(+id) < 0) bad.push('feature ' + id + ': ' + r.status[id]); });
    if (!r.valid) bad.push('invalid solid');
    var dv = a.volume ? Math.abs(r.volume - a.volume) / a.volume : Math.abs(r.volume);
    if (!(dv <= (r.tolerance || 1e-4))) bad.push('volume ' + r.volume.toFixed(4) + ' vs Anvil ' + a.volume.toFixed(4) + ' (' + (dv * 100).toFixed(4) + ' %)');
    // where the exact volume is known (the example's `volume`, or a test model's `exact`), OpenCascade must hit it
    var dx = p.exact ? Math.abs(r.volume - p.exact) / p.exact : 0;
    if (!(dx <= 1e-6)) bad.push('volume ' + r.volume.toFixed(4) + ' vs exact ' + p.exact.toFixed(4) + ' (' + (dx * 100).toFixed(5) + ' %)');
    var db = 0;
    if (a.bbox && r.bbox) for (var c = 0; c < 2; c++) for (var k = 0; k < 3; k++) db = Math.max(db, Math.abs(a.bbox[c][k] - r.bbox[c][k]));
    else if (a.bbox || r.bbox) db = Infinity;
    // Anvil's bounds come from facets (inside curves by up to the chord), OpenCascade's are exact
    if (!(db <= 0.05)) bad.push('bbox off by ' + db.toExponential(2));
    if (r.bodies !== a.bodies) bad.push(r.bodies + ' bodies vs Anvil ' + a.bodies);
    var detail = r.faces.length + ' B-rep faces (Anvil ' + a.meshFaces + ' mesh faces), ' + r.bodies + ' bod' + (r.bodies === 1 ? 'y' : 'ies') + ', volume ' + r.volume.toFixed(3) + ', d ' + dv.toExponential(1) + ', build ' + r.ms.build.toFixed(0) + ' + mesh ' + r.ms.mesh.toFixed(0) + ' ms';
    if (bad.length) { row('bad', p.name, bad.join('\n') + '\n' + detail, ms); counts.fail++; } else { row('ok', p.name, detail, ms); counts.pass++; }
  }
