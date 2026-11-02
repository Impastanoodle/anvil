  // --- rfFT (2026-10-30, lane FT: confidence corpus, Anvil's engine against OpenCascade) ---
  // rfFT-TABLE-BEGIN (anvil/tests/fixtures/rfFT/compare.js reads the lines between these markers: keep them ES5 and
  // self-contained)
  var rfFTparts = (function () {
    var PI = Math.PI, U = 'p.units("in");\n', out = [];
    function add(id, d, code, o) { var r = { id: id, d: d, code: U + code }; for (var k in o || {}) r[k] = o[k]; out.push(r); }
    function cyl(r, h) { return PI * r * r * h; }
    function plate(w, d, t) { return 'p.sketch("Top").centerRect(0, 0, ' + w + ', ' + d + ').end().extrude(' + t + ');\n'; }
    function holes(t, pts, r) { return 'p.sketch("Top", ' + t + ')' + pts.map(function (q) { return '.circle(' + q[0] + ', ' + q[1] + ', ' + r + ')'; }).join('') + '.end().cut("through", { reverse: true });\n'; }

    // ------------------------------------------------------------ solids
    add('S01', 'base plate 6 × 4 × 0.5, four Ø0.266 corner holes', plate(6, 4, 0.5) + holes(0.5, [[-2.5, -1.5], [2.5, -1.5], [-2.5, 1.5], [2.5, 1.5]], 0.133),
      { cf: 0.5 * (24 - 4 * PI * 0.133 * 0.133) });
    add('S02', 'mounting plate 8 × 5 × 0.375, LPattern 6 × 3 of Ø0.201 holes at 1.25 × 1.5', plate(8, 5, 0.375) + holes(0.375, [[-3.125, 1.5]], 0.1005) +
      'p.linearPattern({ dir: "x", spacing: 1.25, count: 6, dir2: "z", spacing2: 1.5, count2: 3 });\n', { cf: 0.375 * (40 - 18 * PI * 0.1005 * 0.1005) });
    add('S03', 'flange disk Ø6 × 0.375, Ø1.5 bore, CirPattern 8 × Ø0.406 on a Ø4.5 bolt circle',
      'p.sketch("Top").circle(0, 0, 3).circle(0, 0, 0.75).end().extrude(0.375);\n' + holes(0.375, [[2.25, 0]], 0.203) + 'p.circularPattern({ axis: "y", center: [0, 0, 0], count: 8 });\n',
      { cf: 0.375 * PI * (9 - 0.5625 - 8 * 0.203 * 0.203) });
    add('S04', 'Hole Wizard: four 1/4 counterbores (Normal) through a 4 × 3 × 0.75 plate', plate(4, 3, 0.75) +
      'p.holeWizard({ face: "Top", offset: 0.75, points: [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", end: "through" });\n');
    add('S05', 'Hole Wizard: three #10 82° countersinks through a 5 × 1.5 × 0.25 strap', plate(5, 1.5, 0.25) +
      'p.holeWizard({ face: "Top", offset: 0.25, points: [[-2, 0], [0, 0], [2, 0]], standard: "ANSI Inch", type: "csk", size: "#10", fit: "normal", end: "through" });\n');
    add('S06', 'Hole Wizard: two 1/4-20 tapped holes 0.75 deep (thread 0.5) in a 2 × 2 × 1.25 block', plate(2, 2, 1.25) +
      'p.holeWizard({ face: "Top", offset: 1.25, points: [[-0.5, 0], [0.5, 0]], standard: "ANSI Inch", type: "tap", size: "1/4-20 UNC", depth: 0.75, threadDepth: 0.5 });\n');
    add('S07', 'Hole Wizard: letter-drill F and #7 drill holes through a 3 × 2 × 0.5 plate', plate(3, 2, 0.5) +
      'p.holeWizard({ face: "Top", offset: 0.5, points: [[-0.75, 0]], standard: "ANSI Inch", type: "hole", sizeType: "drill", size: "F", end: "through" });\n' +
      'p.holeWizard({ face: "Top", offset: 0.5, points: [[0.75, 0]], standard: "ANSI Inch", type: "hole", sizeType: "drill", size: "#7", end: "through" });\n');
    add('S08', 'slotted adjuster plate 5 × 2 × 0.25, two 0.75 × 0.281 slots', plate(5, 2, 0.25) +
      'p.sketch("Top", 0.25).slot(-1.75, 0, -1, 0, 0.281).slot(1, 0, 1.75, 0, 0.281).end().cut("through", { reverse: true });\n',
      { cf: 0.25 * (10 - 2 * (0.75 * 0.281 + PI * 0.1405 * 0.1405)) });
    add('S09', 'L-bracket 3 × 2.5 × 0.25 × 2 wide, R 0.25 inside and R 0.5 outside bend fillets, two Ø0.266 holes per leg',
      'p.sketch("Front").polyline([[0, 0], [3, 0], [3, 0.25], [0.25, 0.25], [0.25, 2.5], [0, 2.5]]).end().extrude(2);\n' +
      'p.fillet(0.25, [[0.25, 0.25, 1]]);\np.fillet(0.5, [[0, 0, 1]]);\n' +
      'p.sketch("Top", 0.25).circle(2, -0.5, 0.133).circle(2, -1.5, 0.133).end().cut("through", { reverse: true });\n' +
      'p.sketch("Right", 0.25).circle(-0.5, 1.75, 0.133).circle(-1.5, 1.75, 0.133).end().cut("through", { reverse: true });\n',
      { cf: 2 * (0.75 + 0.5625 + (1 - PI / 4) * 0.0625 - (1 - PI / 4) * 0.25) - 4 * cyl(0.133, 0.25) });
    add('S10', 'rounded plate 4 × 3 × 0.25, R 0.375 corners, Ø0.266 holes concentric with the rounds', plate(4, 3, 0.25) +
      'p.fillet(0.375, [[2, 0.125, 1.5], [2, 0.125, -1.5], [-2, 0.125, 1.5], [-2, 0.125, -1.5]]);\n' + holes(0.25, [[-1.625, -1.125], [1.625, -1.125], [-1.625, 1.125], [1.625, 1.125]], 0.133),
      { cf: 0.25 * (12 - (4 - PI) * 0.375 * 0.375) - 4 * cyl(0.133, 0.25) });
    add('S11', 'tooling block 3 × 2 × 1, 0.0625 chamfer round the top edges, Ø0.5 through hole with a 0.03 chamfer', plate(3, 2, 1) +
      holes(1, [[0, 0]], 0.25) + 'p.chamfer(0.0625, [[0, 1, -1]]);\np.chamfer(0.03, [[0.25, 1, 0]]);\n');
    add('S12', 'boss on plate: 3 × 3 × 0.375, Ø1 × 0.75 boss, R 0.125 root fillet, 0.03 top chamfer, Ø0.5 bore', plate(3, 3, 0.375) +
      'p.sketch("Top", 0.375).circle(0, 0, 0.5).end().extrude(0.75);\np.fillet(0.125, [[0.5, 0.375, 0]]);\np.chamfer(0.03, [[0.5, 1.125, 0]]);\n' + holes(1.125, [[0, 0]], 0.25));
    add('S13', 'slotted plate 4 × 2 × 0.375, 1.5 × 0.5 slot, R 0.06 round on the slot top edge (lines and arcs, one chain)', plate(4, 2, 0.375) +
      'p.sketch("Top", 0.375).slot(-0.75, 0, 0.75, 0, 0.5).end().cut("through", { reverse: true });\np.fillet(0.06, [[0, 0.375, 0.25]]);\n');
    add('S14', 'flanged bushing OD 1.5 / ID 1.0 × 2, flange Ø2.25 × 0.25 (revolve)',
      'p.sketch("Front").polyline([[0.5, 0], [1.125, 0], [1.125, 0.25], [0.75, 0.25], [0.75, 2], [0.5, 2]]).end().revolve(360);\n',
      { cf: PI * ((1.125 * 1.125 - 0.25) * 0.25 + (0.5625 - 0.25) * 1.75) });
    add('S15', 'shaft Ø1 × 4, retaining-ring groove 0.039 × Ø0.94, 0.03 × 45° end chamfers',
      'p.sketch("Front").polyline([[0, 0], [0.5, 0], [0.5, 3.5], [0.47, 3.5], [0.47, 3.539], [0.5, 3.539], [0.5, 4], [0, 4]]).end().revolve(360);\n' +
      'p.chamfer(0.03, [[0.5, 0, 0]]);\np.chamfer(0.03, [[0.5, 4, 0]]);\n',
      { cf: cyl(0.5, 4) - PI * (0.25 - 0.47 * 0.47) * 0.039 - 2 * 2 * PI * (0.5 - 0.01) * 0.00045 });
    add('S16', 'shaft Ø1 × 4 with a Ø0.25 cross hole at mid-length',
      'p.sketch("Top").circle(0, 0, 0.5).end().extrude(4);\np.sketch("Right", -1).circle(0, 2, 0.125).end().cut(2, { reverse: false });\n');
    add('S17', 'V-belt pulley Ø4 × 0.75, 0.45 deep V groove, Ø0.625 bore, 3/16 keyway',
      'p.sketch("Front").polyline([[0.3125, 0], [2, 0], [2, 0.1], [1.55, 0.3], [1.55, 0.45], [2, 0.65], [2, 0.75], [0.3125, 0.75]]).end().revolve(360);\n' +
      'p.sketch("Top", 0.75).rect(0.2, -0.094, 0.1875, 0.188).end().cut("through", { reverse: true });\n');
    add('S18', 'control knob: Ø1.5 skirt, R 0.5 dome, R 0.06 round on the skirt rim',
      'p.sketch("Front").line(0, 0, 0.75, 0).line(0.75, 0, 0.75, 0.5).line(0.75, 0.5, 0.5, 0.5).arc(0, 0.5, 0.5, 0, 90).line(0, 1, 0, 0).end().revolve(360);\n' +
      'p.fillet(0.06, [[0.75, 0, 0]]);\n');
    add('S19', 'angle 4 × 3 × 0.25 × 4 wide with two 0.25 ribs (Rib, both sides, at ±1.25)',
      'p.sketch("Front").polyline([[0, 0], [4, 0], [4, 0.25], [0.25, 0.25], [0.25, 3], [0, 3]]).end().extrude(4, { midplane: true });\n' +
      'p.sketch("Front", 1.25).line(0.25, 2.25, 3, 0.25).end().rib(0.25);\np.sketch("Front", -1.25).line(0.25, 2.25, 3, 0.25).end().rib(0.25);\n',
      { cf: 4 * (4 * 0.25 + 0.25 * 2.75) + 2 * 0.25 * (2.75 * 2 / 2) });   // L section × 4 + two ribs (triangle 2.75 × 2 × 0.25)
    add('S20', 'drafted boss: 4 × 4 × 0.5 base, Ø1.5 × 1 boss with 3° draft, Ø0.5 through hole', plate(4, 4, 0.5) +
      'p.sketch("Top", 0.5).circle(0, 0, 0.75).end().extrude(1, { draft: 3 });\n' + holes(1.5, [[0, 0]], 0.25),
      { cf: 8 + PI / 3 * (0.5625 + 0.75 * (0.75 - Math.tan(3 * PI / 180)) + Math.pow(0.75 - Math.tan(3 * PI / 180), 2)) - cyl(0.25, 1.5) });
    add('S21', 'drafted pocket: 4 × 3 × 1 block, 2 × 1.5 × 0.5 pocket with 5° draft', plate(4, 3, 1) +
      'p.sketch("Top", 1).centerRect(0, 0, 2, 1.5).end().cut(0.5, { reverse: true, draft: 5 });\n',
      { cf: 12 - (3 * 0.5 - Math.tan(5 * PI / 180) * 3.5 * 0.25 + 4 * Math.pow(Math.tan(5 * PI / 180), 2) * 0.125 / 3) });
    add('S22', 'enclosure: 4 × 3 × 2 box, R 0.5 vertical edges, shelled 0.1 open top', plate(4, 3, 2) +
      'p.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.shell(0.1, [[0, 2, 0]]);\n', { tol: 3e-3 });
    add('S23', 'closed hollow cube 3 in, shell 0.125 (no faces removed)', plate(3, 3, 3) + 'p.shell(0.125, []);\n', { cf: 27 - Math.pow(2.75, 3) });
    add('S24', 'pipe elbow: Ø0.5 swept along a R 3 90° arc',
      'var prof = p.sketch("Top").circle(0, 0, 0.25).id();\nvar path = p.sketch("Front").arc(3, 0, 3, 90, 180).id();\np.sweep({ profile: prof, path: path });\n',
      { cf: cyl(0.25, 1.5 * PI), tol: 2e-3 });
    add('S25', 'handrail: Ø1 swept along line 4 + R 2 90° arc + line 4',
      'var prof = p.sketch("Top").circle(0, 0, 0.5).id();\nvar path = p.sketch("Front").line(0, 0, 0, 4).arc(2, 4, 2, 90, 180).line(2, 6, 6, 6).id();\np.sweep({ profile: prof, path: path });\n',
      { cf: cyl(0.5, 8 + PI), tol: 2e-3 });
    add('S26', 'rectangular duct 1 × 0.5 swept along a R 4 45° arc',
      'var prof = p.sketch("Top").centerRect(0, 0, 1, 0.5).id();\nvar path = p.sketch("Front").arc(4, 0, 4, 135, 180).id();\np.sweep({ profile: prof, path: path });\n',
      { cf: 0.5 * PI, tol: 2e-3 });
    add('S27', 'hopper: loft 4 × 4 square to 2 × 2 square, 3 apart',
      'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 3).centerRect(0, 0, 2, 2).id();\np.loft([a, b]);\n', { cf: 28, tol: 2e-3 });
    add('S28', 'transition: loft 3 × 2 rectangle to a Ø1.5 circle, 2.5 apart',
      'var a = p.sketch("Top").centerRect(0, 0, 3, 2).id();\nvar b = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b]);\n', { tol: 2e-3 });
    add('S29', 'three-section loft: 2 × 2 square, Ø2.2 octagon at 1, Ø1.5 circle at 2.5',
      'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 1).polygon(0, 0, 1.1, 8, 22.5).id();\nvar c = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n', { tol: 2e-3 });
    add('S30', 'clamp: half block with a R 0.5 saddle and a Ø0.266 hole, Mirror (body) about Right',
      'p.sketch("Front").rect(0, 0, 2, 1).end().extrude(1.5);\np.sketch("Front", 1.5).circle(0, 1, 0.5).end().cut("through", { reverse: true });\n' +
      'p.sketch("Top", 1).circle(1.25, -0.75, 0.133).end().cut("through", { reverse: true });\np.mirror("Right", { body: true });\n',
      { cf: 2 * (3 - PI * 0.25 / 4 * 1.5 - cyl(0.133, 1)) });
    add('S31', 'two separate bodies: a 2 × 1 × 1 block with a Ø0.5 hole and its mirror copy across a plane at x 3 (merge off)',
      'p.box(2, 1, 1);\np.sketch("Top", 1).circle(1, -0.5, 0.25).end().cut("through", { reverse: true });\np.mirror("Right", { body: true, offset: 3, merge: false });\n',
      { cf: 2 * (2 - cyl(0.25, 1)), bodies: 2 });
    add('S32', 'standoff rail 6 × 1 × 0.25, LPattern ×4 of a Ø0.5 × 0.5 boss, then LPattern ×4 of a Ø0.201 through hole',
      'p.sketch("Top").rect(0, -1, 6, 1).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0.75, -0.5, 0.25).end().extrude(0.5);\np.linearPattern({ dir: "x", spacing: 1.5, count: 4 });\n' +
      'p.sketch("Top", 0.75).circle(0.75, -0.5, 0.1005).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 1.5, count: 4 });\n',
      { cf: 1.5 + 4 * cyl(0.25, 0.5) - 4 * cyl(0.1005, 0.75) });
    add('S33', 'hub: Ø4 × 0.25 disk, Ø1.25 × 1 hub, CirPattern ×6 of a 0.125 triangular gusset',
      'p.sketch("Top").circle(0, 0, 2).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0, 0, 0.625).end().extrude(0.75);\n' +
      'p.sketch("Front").polyline([[0.5, 0.25], [1.75, 0.25], [0.5, 0.9]]).end().extrude(0.125, { midplane: true });\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 6 });\n');
    add('S34', 'pocketed plate 4 × 3 × 0.5: 2 × 1.5 × 0.25 pocket, R 0.25 pocket corners, R 0.06 floor round', plate(4, 3, 0.5) +
      'p.sketch("Top", 0.5).centerRect(0, 0, 2, 1.5).end().cut(0.25, { reverse: true });\n' +
      'p.fillet(0.25, [[1, 0.375, 0.75], [-1, 0.375, 0.75], [1, 0.375, -0.75], [-1, 0.375, -0.75]]);\np.fillet(0.06, [[0, 0.25, 0.75]]);\n');
    add('S35', 'clevis: 2 × 1 × 1.5 block, 0.5 wide × 1 deep slot, Ø0.375 cross hole', plate(2, 1, 1.5) +
      'p.sketch("Top", 1.5).centerRect(0, 0, 0.5, 1.2).end().cut(1, { reverse: true });\np.sketch("Right", -1.5).circle(0, 1, 0.1875).end().cut(3, { reverse: false });\n',
      { cf: 3 - 0.5 - 1.5 * PI * 0.1875 * 0.1875 });
    add('S36', 'gusseted angle 3 × 3 × 0.25 × 2 wide, R 0.125 inside round, two 0.25 triangular gussets',
      'p.sketch("Front").polyline([[0, 0], [3, 0], [3, 0.25], [0.25, 0.25], [0.25, 3], [0, 3]]).end().extrude(2, { midplane: true });\np.fillet(0.125, [[0.25, 0.25, 0]]);\n' +
      'p.sketch("Front", 0.5).polyline([[0.2, 0.2], [2, 0.2], [0.2, 2]]).end().extrude(0.25, { midplane: true });\n' +
      'p.sketch("Front", -0.5).polyline([[0.2, 0.2], [2, 0.2], [0.2, 2]]).end().extrude(0.25, { midplane: true });\n');
    add('S37', 'hex standoff 1/2 hex × 1.5, #10-32 tapped 0.375 deep, 0.02 chamfer on the top edges',
      'p.sketch("Top").polygon(0, 0, ' + (0.25 / Math.cos(PI / 6)) + ', 6).end().extrude(1.5);\np.chamfer(0.02, [[0.2165, 1.5, -0.125]]);\n' +
      'p.holeWizard({ face: "Top", offset: 1.5, points: [[0, 0]], standard: "ANSI Inch", type: "tap", size: "#10-32 UNF", depth: 0.5, threadDepth: 0.375 });\n');
    add('S38', 'weld-neck style flange: Ø5 × 0.5 disk, Ø2.5 × 1 hub, R 0.1875 root round, Ø2 bore, 4 × Ø0.625 bolt holes',
      'p.sketch("Top").circle(0, 0, 2.5).end().extrude(0.5);\np.sketch("Top", 0.5).circle(0, 0, 1.25).end().extrude(1);\np.fillet(0.1875, [[1.25, 0.5, 0]]);\n' +
      holes(1.5, [[0, 0]], 1) + holes(0.5, [[1.875, 0]], 0.3125) + 'p.circularPattern({ axis: "y", center: [0, 0, 0], count: 4 });\n');
    add('S39', 'counterbored bushing Ø1.5 × 1: Ø0.625 bore, Ø1 × 0.25 counterbore (Revolved Cut)',
      'p.sketch("Top").circle(0, 0, 0.75).end().extrude(1);\np.sketch("Front").polyline([[0, -0.1], [0.3125, -0.1], [0.3125, 0.75], [0.5, 0.75], [0.5, 1.1], [0, 1.1]]).end().revolveCut(360);\n',
      { cf: cyl(0.75, 1) - cyl(0.3125, 0.75) - cyl(0.5, 0.25) });
    add('S40', 'tube Ø2 × 0.12 wall × 6, 0.03 × 45° chamfer on both outside rims',
      'p.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.88).end().extrude(6);\np.chamfer(0.03, [[1, 0, 0]]);\np.chamfer(0.03, [[1, 6, 0]]);\n',
      { cf: PI * (1 - 0.7744) * 6 - 2 * 2 * PI * (1 - 0.01) * 0.00045 });
    add('S41', 'T-slot table section 4 × 2 × 6: T-slot 0.5 throat / 1 head cut through the length',
      plate(4, 6, 2) + 'p.sketch("Front", 3).polyline([[-0.25, 2], [-0.25, 1.25], [-0.5, 1.25], [-0.5, 0.75], [0.5, 0.75], [0.5, 1.25], [0.25, 1.25], [0.25, 2]]).end().cut("through", { reverse: true });\n',
      { cf: 6 * (8 - 0.5 * 0.75 - 1 * 0.5) });
    add('S42', 'spacer Ø1 × 0.5 with a #8 82° countersink',
      'p.sketch("Top").circle(0, 0, 0.5).end().extrude(0.5);\np.holeWizard({ face: "Top", offset: 0.5, points: [[0, 0]], standard: "ANSI Inch", type: "csk", size: "#8", fit: "normal", end: "through" });\n');

    // ------------------------------------------------------------ sheet metal (16 ga 0.0598, R 0.0598, K 0.5 unless named)
    var T = 0.0598, R = 0.0598, BA = PI / 2 * (R + T / 2), BD = 2 * (R + T) - BA;
    function head(w, d, t, r, k, opts) { return 'p.sheet(' + (t || T) + ', ' + (r || R) + ', ' + (k || 0.5) + (opts ? ', ' + opts : '') + ');\np.sketch("Top").rect(0, -' + d + ', ' + w + ', ' + d + ').end().baseFlange();\n'; }
    var IO = '{ position: "inside", lengthRef: "outer" }';
    function fl(L, e, o) { return 'p.flange(' + L + ', ' + JSON.stringify(e) + ', ' + (o || IO) + ');\n'; }
    add('M01', 'L bracket 6 × 4 base, 1.5 flange (Material Inside, outer length)', head(6, 4) + fl(1.5, [[3, T, 0]]), { sheet: true, flat: [6, 5.5 - BD] });
    add('M02', 'U channel 6 long, 4 base, two 1.5 flanges', head(6, 4) + fl(1.5, [[3, T, 0], [3, T, 4]]), { sheet: true, flat: [6, 7 - 2 * BD] });
    add('M03', 'tray 6 × 4, four 1 flanges mitred at the corners', head(6, 4) + 'p.flange(1, [[3, ' + T + ', 0], [3, ' + T + ', 4], [0, ' + T + ', 2], [6, ' + T + ', 2]], { position: "inside", lengthRef: "outer", miter: true });\n',
      { sheet: true, flat: [8 - 2 * BD, 6 - 2 * BD] });
    add('M04', 'tray 4 × 3, four 1 flanges, Underlap Closed Corner at front-left', head(4, 3) + fl(1, [[2, T, 0]]) + fl(1, [[4, T, 1.5]]) + fl(1, [[2, T, 3]]) + fl(1, [[0, T, 1.5]]) +
      'p.closedCorner([[' + T / 2 + ', 0.6, ' + (R + T) + ']], { cornerType: "underlap", gap: 0.01, coplanar: false });\n', { sheet: true, flat: [6 - 2 * BD, 5 - 2 * BD] });
    add('M05', 'L bracket with a 1 × 0.25 slot across the bend (Unfold, Cut, Fold)', head(6, 4) + fl(1.5, [[3, T, 0]]) +
      'p.unfold([1, ' + T + ', 2], null);\np.sketch("Top", ' + T + ').rect(2.5, ' + (-0.0) + ', 1, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n', { sheet: true, flat: [6, 5.5 - BD] });
    add('M06', 'L bracket with a 0.375 open hem on the flange top', head(6, 4) + fl(1.5, [[3, T, 0]]) + 'p.hem(0.375, [[3, 1.5, ' + T / 2 + ']]);\n', { sheet: true });
    add('M07', 'closed hem 0.5 on the front edge of a 6 × 4 plate', head(6, 4) + 'p.hem(0.5, [[3, ' + T + ', 0]], { hemType: "closed" });\n', { sheet: true });
    add('M08', 'tear-drop hem on the front edge of a 6 × 4 plate', head(6, 4) + 'p.hem(0.5, [[3, ' + T + ', 0]], { hemType: "teardrop" });\n', { sheet: true });
    add('M09', 'rolled hem on the front edge of a 6 × 4 plate', head(6, 4) + 'p.hem(0.5, [[3, ' + T + ', 0]], { hemType: "rolled" });\n', { sheet: true });
    add('M10', 'edge jog 0.5 high, 1 long, on the front edge', head(6, 4) + 'p.jog(0.5, 1, [[3, ' + T + ', 0]]);\n', { sheet: true });
    add('M11', 'sketch jog 0.375 (outside offset) across a 6 × 4 plate', head(6, 4) + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).end().jog(0.375, { fixed: [1, ' + T + ', 2] });\n', { sheet: true });
    add('M12', 'Miter Flange 1 high along the front and left edges (Right-plane profile)', head(4, 2, 0.06, 0.06) +
      'p.sketch("Right").line(0, 0.06, 0, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n', { sheet: true });
    add('M13', 'two Sketched Bends 90° (a channel from a flat 6 × 4)', head(6, 4) + 'p.sketch("Top", ' + T + ').line(1.5, 0, 1.5, -4).line(4.5, 0, 4.5, -4).sketchedBend(90);\n', { sheet: true, flat: [6, 4] });
    add('M14', 'Break-Corner R 0.25 on the four corners of a 6 × 4 blank', head(6, 4) + 'p.breakCorner(0.25, [], { kind: "fillet", faces: [[3, ' + T + ', 2]] });\n',
      { sheet: true, flat: [6, 4], cf: T * (24 - (4 - PI) * 0.0625) });
    add('M15', 'ripped shelled box 2 × 2 × 1, Insert Bends R 0.06', 'p.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\np.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], 0.03);\np.insertBends([1, 0, -1], { radius: 0.06 });\n', { sheet: true });
    add('M16', 'tab 1 × 2 off the right edge of a 6 × 4 blank', head(6, 4) + 'p.sketch("Top", ' + T + ').rect(6, -3, 1, 2).end().tab();\n', { sheet: true, flat: [7, 4], cf: T * 26 });
    add('M17', 'Vent: Ø2 boundary, two ribs, Ø1 spar on a 4 × 4 cover', 'p.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\n' +
      'p.sketch("Top").circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5).end().vent({ ribWidth: 0.1, sparWidth: 0.1 });\n', { sheet: true, flat: [4, 4] });
    add('M18', 'L bracket with two Ø0.281 holes in the wall (Normal Cut)', head(6, 4) + fl(1.5, [[3, T, 0]]) +
      'p.sketch("Front").circle(1.5, 0.9, 0.1405).circle(4.5, 0.9, 0.1405).end().cut("through", { reverse: false, normalCut: true });\n', { sheet: true, flat: [6, 5.5 - BD] });
    add('M19', 'Z bracket: 1 flange up at the front, 1 flange down at the back', head(6, 4) + fl(1, [[3, T, 0]]) + 'p.flange(1, [[3, ' + T + ', 4]], { position: "inside", lengthRef: "outer", reverse: true });\n', { sheet: true });
    add('M20', 'flanges at 45° and 120° on a 6 × 4 blank', head(6, 4) + 'p.flange(1, [[3, ' + T + ', 0]], { angle: 45 });\np.flange(1, [[3, ' + T + ', 4]], { angle: 120 });\n', { sheet: true });
    add('M21', 'L bracket, bend deduction 0.1 entered (flat = 4 + 1.5 − 0.1)', head(6, 4, 0, 0, 0, '{ bendAllowanceType: "deduction", bendDeduction: 0.1 }') + fl(1.5, [[3, T, 0]]), { sheet: true, flat: [6, 5.4] });
    add('M22', 'aluminium 0.125, R 0.125, K 0.4: L bracket 5 × 3 + 2 flange with an open hem', head(5, 3, 0.125, 0.125, 0.4) + fl(2, [[2.5, 0.125, 0]]) + 'p.hem(0.5, [[2.5, 2, 0.0625]]);\n', { sheet: true });
    add('M23', 'hat channel: two 1.5 flanges up, two 0.75 flanges out on their tops', head(6, 2) + fl(1.5, [[3, T, 0], [3, T, 2]]) +
      'p.flange(0.75, [[3, 1.5, ' + T / 2 + '], [3, 1.5, ' + (2 - T / 2) + ']], { position: "inside", lengthRef: "outer", reverse: true });\n', { sheet: true });
    add('M24', 'cover tray 6 × 4 mitred flanges 0.75 with four Ø0.201 corner holes and a 2 × 1 window', head(6, 4) + 'p.flange(0.75, [[3, ' + T + ', 0], [3, ' + T + ', 4], [0, ' + T + ', 2], [6, ' + T + ', 2]], { position: "inside", lengthRef: "outer", miter: true });\n' +
      'p.sketch("Top", ' + T + ').circle(0.5, -0.5, 0.1005).circle(5.5, -0.5, 0.1005).circle(0.5, -3.5, 0.1005).circle(5.5, -3.5, 0.1005).centerRect(3, -2, 2, 1).end().cut("through", { reverse: true });\n',
      { sheet: true, flat: [7.5 - 2 * BD, 5.5 - 2 * BD] });
    add('M25', 'flat blank 10 × 6 with a 5 × 3 LPattern of Ø0.25 holes and 0.25 corner chamfers (Break-Corner)', head(10, 6) +
      'p.sketch("Top", ' + T + ').circle(1, -1, 0.125).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 2, count: 5, dir2: "z", spacing2: 2, count2: 3 });\n' +
      'p.breakCorner(0.25, [], { faces: [[4, ' + T + ', 2]] });\n', { sheet: true, flat: [10, 6], cf: T * (60 - 15 * PI / 64 - 2 * 0.0625) });
    add('M26', 'U channel with a Ø0.5 hole straddling each bend (Unfold, Cut, Fold)', head(6, 4) + fl(1.5, [[3, T, 0], [3, T, 4]]) +
      'p.unfold([3, ' + T + ', 2], null);\np.sketch("Top", ' + T + ').circle(3, 0.05, 0.25).circle(3, -3.95, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n', { sheet: true, flat: [6, 7 - 2 * BD] });
    add('M27', '14 ga gauge-table L bracket 8 × 3 + 2 flange', 'p.sheet(null, null, null, { gauge: "14" });\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\np.flange(2, [[4, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\n', { sheet: true });
    return out;
  })();
  // Seeded fuzz generators (round 2 of rfFN's fuzz): rfFTfuzz(kind, seed) -> { code, ops } for kind 'sheet' (base
  // flange, 1–4 edge flanges / hems / jogs on distinct edges, 0–3 holes, some across a bend through Unfold / Fold,
  // an optional Closed Corner where two flanges meet) or 'round' (a plate with holes and bosses, 1–3 fillets /
  // chamfers on picked edges). `ops` names what the stack holds, for sorting failures.
  function rfFTrng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rfFTfuzz(kind, seed) {
    var rnd = rfFTrng(seed * 7919 + (kind === 'sheet' ? 1 : 2)), ops = [];
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    function q(x, s) { return Math.round(x / s) * s; }
    function n(x) { return +x.toFixed(4); }
    var placed = [];   // holes of one sketch stay 0.1 clear of each other (crossing contours are a sketch error, not a solid bug)
    function spot(x0, x1, z0, z1, r) { for (var t = 0; t < 8; t++) { var x = n(x0 + (x1 - x0) * rnd()), z = n(z0 + (z1 - z0) * rnd()); if (placed.every(function (c) { return Math.hypot(c[0] - x, c[1] - z) > c[2] + r + 0.1; })) { placed.push([x, z, r]); return [x, z]; } } return null; }
    var code = 'p.units("in");\n';
    if (kind === 'sheet') {
      var T = pick([0.0359, 0.0598, 0.0747, 0.125]), R = n(T * pick([1, 2])), K = pick([0.5, 0.4]);
      var W = q(3 + 5 * rnd(), 0.25), D = q(2 + 4 * rnd(), 0.25);
      code += 'p.sheet(' + T + ', ' + R + ', ' + K + ');\np.sketch("Top").rect(0, -' + D + ', ' + W + ', ' + D + ').end().baseFlange();\n';
      // the four edges of the top face: point, along-axis, which flange side
      var edges = [{ k: 'front', at: [n(W / 2), T, 0] }, { k: 'back', at: [n(W / 2), T, D] }, { k: 'left', at: [0, T, n(D / 2)] }, { k: 'right', at: [W, T, n(D / 2)] }];
      var nOps = 1 + Math.floor(rnd() * 4), used = {}, flanged = {}, hgt = 0;
      for (var i = 0; i < nOps; i++) {
        var e = pick(edges); if (used[e.k]) continue; used[e.k] = 1;
        var kindOp = pick(['flange', 'flange', 'flange', 'hem', 'jog']);
        if (kindOp === 'flange') {
          var L = q(0.5 + 1.5 * rnd(), 0.125), ang = pick([90, 90, 90, 45, 120]), rev = rnd() < 0.2;
          code += 'p.flange(' + L + ', [' + JSON.stringify(e.at) + '], { position: "inside", lengthRef: "outer"' + (ang !== 90 ? ', angle: ' + ang : '') + (rev ? ', reverse: true' : '') + ' });\n';
          ops.push('flange' + (ang !== 90 ? ang : '') + (rev ? 'R' : ''));
          if (ang === 90 && !rev) { flanged[e.k] = L; hgt = hgt ? Math.min(hgt, L) : L; }
        } else if (kindOp === 'hem') {
          var ht = pick(['open', 'closed', 'teardrop', 'rolled']);
          code += 'p.hem(' + q(0.25 + 0.5 * rnd(), 0.125) + ', [' + JSON.stringify(e.at) + '], { hemType: "' + ht + '" });\n'; ops.push('hem-' + ht);
        } else {
          code += 'p.jog(' + q(0.25 + 0.5 * rnd(), 0.125) + ', ' + q(0.5 + rnd(), 0.125) + ', [' + JSON.stringify(e.at) + ']);\n'; ops.push('jog');
        }
      }
      var nH = Math.floor(rnd() * 4), hs = [];
      for (var h = 0; h < nH; h++) {
        var r = pick([0.0995, 0.1405, 0.25]);
        if (rnd() < 0.35 && Object.keys(flanged).length) {   // across a bend: unfold, cut straddling the bend line, fold
          var fk = pick(Object.keys(flanged)), c = fk === 'front' ? [n(W * (0.25 + 0.5 * rnd())), 0.05] : fk === 'back' ? [n(W * (0.25 + 0.5 * rnd())), -(D - 0.05)]
            : fk === 'left' ? [-0.05, -n(D * (0.25 + 0.5 * rnd()))] : [W + 0.05, -n(D * (0.25 + 0.5 * rnd()))];
          code += 'p.unfold([' + n(W / 2) + ', ' + T + ', ' + n(D / 2) + '], null);\np.sketch("Top", ' + T + ').circle(' + c[0] + ', ' + n(c[1]) + ', ' + r + ').end().cut("through", { reverse: true });\np.fold(null);\n';
          ops.push('holeAcrossBend');
        } else {
          var sp = spot(0.4, W - 0.4, 0.4, D - 0.4, r);
          if (sp) { hs.push('.circle(' + sp[0] + ', ' + -sp[1] + ', ' + r + ')'); ops.push('hole'); }
        }
      }
      if (hs.length) code += 'p.sketch("Top", ' + T + ')' + hs.join('') + '.end().cut("through", { reverse: true });\n';
      if (rnd() < 0.4) {   // a Closed Corner where a side flange meets the front or back one
        var cs = [];
        if (flanged.left && flanged.front) cs.push([n(T / 2), n(hgt * 0.6), n(R + 1.5 * T)]);
        if (flanged.right && flanged.front) cs.push([n(W - T / 2), n(hgt * 0.6), n(R + 1.5 * T)]);
        if (flanged.left && flanged.back) cs.push([n(T / 2), n(hgt * 0.6), n(D - R - 1.5 * T)]);
        if (flanged.right && flanged.back) cs.push([n(W - T / 2), n(hgt * 0.6), n(D - R - 1.5 * T)]);
        if (cs.length) { code += 'p.closedCorner([' + JSON.stringify(pick(cs)) + '], { cornerType: "' + pick(['butt', 'overlap', 'underlap']) + '" });\n'; ops.push('closedCorner'); }
      }
    } else {
      var PW = q(3 + 4 * rnd(), 0.25), PD = q(2 + 3 * rnd(), 0.25), PT = pick([0.25, 0.375, 0.5, 0.75]), cand = [];
      code += 'p.sketch("Top").rect(0, -' + PD + ', ' + PW + ', ' + PD + ').end().extrude(' + PT + ');\n';
      [[0, 0], [PW, 0], [0, PD], [PW, PD]].forEach(function (c) { cand.push({ k: 'corner', at: [c[0], n(PT / 2), c[1]], max: Math.min(PW, PD) / 3 }); });
      [[n(PW / 2), 0], [n(PW / 2), PD], [0, n(PD / 2)], [PW, n(PD / 2)]].forEach(function (c) { cand.push({ k: 'topEdge', at: [c[0], PT, c[1]], max: PT / 2 }); });
      var nb = Math.floor(rnd() * 3), nh = Math.floor(rnd() * 4), sk = [];
      for (var b = 0; b < nb; b++) {   // bosses on the top face, away from the edges
        var br = pick([0.25, 0.375, 0.5]), bx = n(0.7 + (PW - 1.4) * rnd()), bz = n(0.7 + (PD - 1.4) * rnd()), bh = pick([0.25, 0.5, 1]);
        code += 'p.sketch("Top", ' + PT + ').circle(' + bx + ', ' + -bz + ', ' + br + ').end().extrude(' + bh + ');\n'; ops.push('boss');
        cand.push({ k: 'bossRoot', at: [n(bx + br), PT, bz], max: br }); cand.push({ k: 'bossTop', at: [n(bx + br), n(PT + bh), bz], max: br / 2 });
      }
      for (var hh = 0; hh < nh; hh++) {
        var hr = pick([0.1, 0.133, 0.25]), hp = spot(0.4, PW - 0.4, 0.4, PD - 0.4, hr);
        if (!hp) continue;
        var hx = hp[0], hz = hp[1];
        sk.push('.circle(' + hx + ', ' + -hz + ', ' + hr + ')'); ops.push('hole');
        cand.push({ k: 'holeRim', at: [n(hx + hr), PT, hz], max: hr });
      }
      if (sk.length) code += 'p.sketch("Top", ' + (PT + 1) + ')' + sk.join('') + '.end().cut("through", { reverse: true });\n';
      var nf = 1 + Math.floor(rnd() * 3);
      for (var f = 0; f < nf; f++) {
        if (!cand.length) break;
        var ce = cand.splice(Math.floor(rnd() * cand.length), 1)[0], rr = n(Math.min(pick([0.03, 0.0625, 0.125, 0.25]), ce.max * 0.9)), ch = rnd() < 0.35;
        code += 'p.' + (ch ? 'chamfer' : 'fillet') + '(' + rr + ', [' + JSON.stringify(ce.at) + ']);\n'; ops.push((ch ? 'chamfer-' : 'fillet-') + ce.k);
      }
    }
    return { code: code, ops: ops };
  }
  // rfFT-TABLE-END
  // OpenCascade's [volume, bodies, bbox [x0, y0, z0, x1, y1, z1], its own failure] for every part (OcctKernel.build
  // headless, main checkout at d83a8c7, 2026-10-30: compare.js --occt; S16, S20, M26 re-measured after lane FZ2 by lane GA2).
  // Re-measure with compare.js after engine work.
  var rfFTocc = {
      S01: [11.888856735, 1, [-3,0,-2,3,0.5,2]], S02: [14.785816619, 1, [-4,0,-2.5,4,0.375,2.5]],
      S03: [9.551809831, 1, [-3,0,-3,3,0.375,3]], S04: [8.738526618, 1, [-2,0,-1.5,2,0.75,1.5]],
      S05: [1.839165153, 1, [-2.5,0,-0.75,2.5,0.25,0.75]], S06: [4.952403693, 1, [-1,0,-1,1,1.25,1]],
      S07: [2.958197183, 1, [-1.5,0,-1,1.5,0.5,1]], S08: [2.363617088, 1, [-2.5,0,-1,2.5,0.25,1]],
      S09: [2.488952679, 1, [0,0,0,3,2.5,2]], S10: [2.914249984, 1, [-2,0,-1.5,2,0.25,1.5]],
      S11: [5.797055951, 1, [-1.5,0,-1,1.5,1,1]], S12: [3.752892443, 1, [-1.5,0,-1.5,1.5,1.125,1.5]],
      S13: [2.641522621, 1, [-2,0,-1,2,0.375,1]], S14: [2.515728492, 1, [-1.125,0,-1.125,1.125,2,1.125]],
      S15: [3.135256375, 1, [-0.5,0,-0.5,0.5,4,0.5]], S16: [3.092891821, 1, [-0.5,0,-0.5,0.5,4,0.5]],
      S17: [7.384477559, 1, [-2,0,-2,2,0.75,2]], S18: [1.141796743, 1, [-0.75,0,-0.75,0.75,1,0.75]],
      S19: [8.125, 1, [0,0,-2,4,3,2]],
      S20: [9.352014843, 1, [-2,0,-2,2,1.5,2]],
      S21: [10.57527687, 1, [-2,0,-1.5,2,1,1.5]], S22: [3.61575216, 1, [-2,0,-1.5,2,2,1.5]],
      S23: [6.203125, 1, [-1.5,0,-1.5,1.5,3,1.5]], S24: [0.925275413, 1, [-0.25,0,-0.25,3,3.25,0.25]],
      S25: [8.750586407, 1, [-0.5,0,-0.5,6,6.5,0.5]], S26: [1.570796327, 1, [-0.5,0,-0.25,1.525126,3.181981,0.25]],
      // lane lofts: S28 and S29 changed with OpenCascade's loft, which now follows SolidWorks (9.218308893, 7.672999045)
      // instead of its own smoothing (was 9.239233632, 7.725743044)
      S27: [28, 1, [-2,0,-2,2,3,2]], S28: [9.218360279, 1, [-1.5,0,-1,1.5,2.5,1]],
      S29: [7.67301095, 1, [-1.029484,0,-1.029484,1.029484,2.5,1.029484]], S30: [5.299808113, 1, [-2,0,0,2,1,1.5]],
      S31: [3.607300918, 2, [0,0,0,6,1,1]], S32: [1.797506468, 1, [0,0,0,6,0.75,1]],
      S33: [4.309236103, 1, [-2,0,-2,2,1,2]], S34: [5.268423937, 1, [-2,0,-1.5,2,0.5,1.5]],
      S35: [2.334330075, 1, [-1,0,-0.5,1,1.5,0.5]], S36: [3.602529731, 1, [0,0,-1,3,3,1]],
      S37: [0.314772426, 1, [-0.288675,0,-0.25,0.288675,1.5,0.25]], S38: [9.461474739, 1, [-2.5,0,-2.5,2.5,1.5,2.5]],
      S39: [1.340699209, 1, [-0.75,0,-0.75,0.75,1,0.75]], S40: [4.246861498, 1, [-1,0,-1,1,6,1]],
      S41: [42.75, 1, [-2,0,-3,2,2,3]], S42: [0.377914433, 1, [-0.5,0,-0.5,0.5,0.5,0.5]],
      M01: [1.938130114, 1, [0,0,0,6,1.5,4]], M02: [2.441060229, 1, [0,0,0,6,1.5,4]],
      M03: [2.482605583, 1, [0,0,0,6,1,4]] /* lane flanges: was 2.500391822, a bisector mitre; SolidWorks' Butt corners (it reports 2.482514708, flat 7.803401 × 5.803401) */, M04: [1.448825467, 1, [0,0,0,4,1,3]],
      M05: [1.923180114, 1, [0,0,0,6,1.5,4]], M06: [2.096414889, 1, [0,0,0,6,1.57475,4]],
      M07: [1.628359748, 1, [0,0,-0.061769,6,0.123537,4]], M08: [1.666403797, 1, [0,0,-0.1196,6,0.2392,4]] /* the Tear Drop default is 200° now: SolidWorks refuses 270° */,
      M09: [1.586865223, 1, [0,0,-0.1196,6,0.2392,4]], M10: [2.031597669, 1, [0,0,-1.1794,6,0.6196,4]],
      M11: [1.4352, 1, [0,0,0,5.701999,0.4348,4]], M12: [0.817915481, 1, [0,0,0,4,1.06,2]] /* SolidWorks: the square notch (2026-11-02); OpenCascade 0.817924 */,
      M13: [1.4352, 1, [1.45085,0,0,4.54915,1.54915,4]], M14: [1.431991703, 1, [0,0,0,6,0.0598,4]],
      M15: [0.635963686, 1, [0,0,-2,2,1,0]] /* OpenCascade after Rip took the floor's corner (SolidWorks' flat 0.635938) */, M16: [1.5548, 1, [0,0,0,7,0.0598,4]],
      M17: [0.811339934, 1, [-2,0,-2,2,0.06,2]], M18: [1.930713022, 1, [0,0,0,6,1.5,4]],
      M19: [2.082260229, 1, [0,-0.9402,0,6,1,4]], M20: [2.245484303, 1, [0,0,-0.791677,6,1.045425,4.1196]],
      M21: [1.938130114, 1, [0,0,0,6,1.5,4]], M22: [3.395499139, 1, [0,0,0,5,2.15625,3]],
      M23: [2.191120458, 1, [0,0,-0.6902,6,1.5,2.6902]], M24: [2.064413338, 1, [0,0,0,6,0.75,4]] /* lane flanges: was 2.077777839; SolidWorks reports 2.064327659 */,
      M25: [3.536493615, 1, [0,0,0,10,0.0598,6]],
      M26: [2.417576825, 1, [0,0,0,6,1.5,4]],
      M27: [2.914619339, 1, [0,0,0,8,2,3]]
  };
  (function () {
    group('rfFT: confidence corpus, 69 shop parts (inch) on Anvil\'s engine against OpenCascade and closed forms; seeded sheet-metal and fillet fuzz');
    var PLAIN = /^[A-Z][^]*\.$/, JSERR = /TypeError|ReferenceError|Cannot read|is not a function|undefined|NaN|Infinity|\bnull\b/;
    // results with open edges today: an 'rfFT TODO' row gives the counts (promote once closed), the hard row checks
    // the rest (no errors, volume within `loose` of OpenCascade or the closed form)
    var OPEN = {
      // S20 (hole through a drafted boss) and M04 (Closed Corner) closed by lane FQ (exact retry in csg.js); M26 (hole
      // across a bend through Unfold / Fold) by lane FU: all hard rows now
    };
    // volume mismatches against OpenCascade: [loose hard tolerance, why]
    var FACET = [1e-3, 'Anvil\'s bend surfaces are faceted chords with no cylinder record in Mass Properties: 1e-4 to 7e-4 light'];
    var VOLTODO = { S28: [5e-5, 'rectangle → circle loft: one surface on both engines, Anvil\'s facets of it are 3.2e-5 light (SolidWorks 9.218308893)'] };
    // lane FX (local-2026-10-30b): every bend face carries a cylinder record, so the 23 bent parts are exact in Mass
    // Properties (21 promoted to hard rows: = OpenCascade to 2.4e-8). Two stay TODO for what is still polygonal:
    VOLTODO.M18 = [1e-4, 'the Normal Cut holes carry no cylinder record (2.5e-5 light; normalCutTool, kernel-sheetmetal.js)'];
    VOLTODO.M26 = [1e-4, 'the round hole\'s wall inside the bend is a polygon (1.2e-5; buildFold / wrapRegion)'];
    // flat area × T = OpenCascade's exact folded volume (K 0.5: the neutral surface is the mid-surface; straight
    // bends, no round holes in the flat loops, no mitres)
    var FLATVOL = 'M01 M02 M04 M05 M06 M07 M08 M09 M10 M11 M13 M16 M19 M20 M23 M27'.split(' ');
    var cache = {};
    function rfFTget(p) {
      if (cache[p.id]) return cache[p.id];
      var r = build(p.code), open = 0, nm = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      r.open = open; r.nm = nm;
      if (p.sheet) {
        r.flat = K.flatPattern(r.model, r.build, r.mesh);
        var fb = K.flatBody(r.model, r.build, r.flat).body, fc = Evaluate.checkBody(fb);
        r.flatOpen = fc.openEdges.length + fc.nonManifoldEdges.length;
        r.flatAreaT = r.flat.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0) * K.sheetParams(r.model).thickness;
      }
      return (cache[p.id] = r);
    }
    rfFTparts.forEach(function (p) {
      var occ = rfFTocc[p.id], todo = VOLTODO[p.id], ref = p.cf != null ? p.cf : occ[0];
      test('rfFT: ' + p.id + ' ' + p.d + (p.cf != null ? ' (closed form)' : ' (OpenCascade)'), function () {
        var r = rfFTget(p), e = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
        assert(!e.length, 'errors: ' + e.join(' | '));
        if (!OPEN[p.id]) {
          assert(!r.open && !r.nm, r.open + ' open, ' + r.nm + ' non-manifold edges');
          nearRel(polyVol(r.mp), r.body.volume(), 1e-6, 'mesh volume vs polygon volume');
        }
        assert(r.build.bodies.length === occ[1], r.build.bodies.length + ' bodies, OpenCascade ' + occ[1]);
        var bb = r.mp.bbox, ob = occ[2], bbt = todo && todo[2] || 0.002;
        if (!occ[3]) for (var i = 0; i < 3; i++) assert(Math.abs(bb.min[i] - ob[i]) <= bbt && Math.abs(bb.max[i] - ob[i + 3]) <= bbt, 'bbox ' + bboxStr(bb) + ' vs OpenCascade ' + JSON.stringify(ob));
        nearRel(r.mp.volume, todo ? occ[0] : ref, todo ? todo[0] : 1e-5, p.id + ' volume');
        var d = 'volume ' + r.mp.volume.toFixed(6);
        if (p.sheet) {
          assert(r.flatOpen === 0, 'flat: ' + r.flatOpen + ' open edges');
          if (p.flat) { near(r.flat.size[0], p.flat[0], 1e-9, 'flat width'); near(r.flat.size[1], p.flat[1], 1e-9, 'flat height'); }
          if (FLATVOL.indexOf(p.id) >= 0) nearRel(r.flatAreaT, occ[0], 1e-9, 'flat area × T vs OpenCascade volume');
          d += ', flat ' + r.flat.size.map(fmt).join(' × ');
        }
        return d;
      });
      if (OPEN[p.id]) test('rfFT TODO: ' + p.id + ' closed: ' + OPEN[p.id], function () {
        var r = rfFTget(p);
        return !r.open && !r.nm ? 'closed now: promote to a hard test' : 'TODO ' + r.open + ' open, ' + r.nm + ' non-manifold edges';
      });
      if (todo) test('rfFT TODO: ' + p.id + ' volume = OpenCascade ' + occ[0].toFixed(6) + ' to 1e-4: ' + todo[1], function () {
        var r = rfFTget(p), rel = (r.mp.volume - occ[0]) / occ[0];
        return Math.abs(rel) <= 1e-4 ? 'matches OpenCascade now: promote to a hard test' : 'TODO Anvil ' + r.mp.volume.toFixed(9) + ' / OpenCascade ' + occ[0].toFixed(9) + ' (rel ' + rel.toExponential(2) + ')';
      });
    });

    // seeded fuzz: 30 sheet-metal and 30 fillet / chamfer stacks (compare.js --fuzz 1000 runs more by hand). Allowed:
    // a refusal in a plain sentence; an open result only when the stack holds a pinned, known failure. Lane GA
    // (2026-10-30, on ffadfbf): Closed Corner stacks are all closed now (0 open in 1000), holes across a bend 3 open in
    // 1000 (pins 12, 13), none in seeds 1–30, so nothing is exempt any more. Anything open fails with its seed.
    test('rfFT: seeded fuzz, 30 sheet-metal stacks + 30 fillet / chamfer stacks (seeds 1–30): no exception, plain refusals, closed results and flats', function () {
      var n = { ok: 0, refused: 0, known: 0 }, bad = [];
      ['sheet', 'round'].forEach(function (kind) {
        for (var s = 1; s <= 30; s++) {
          var c = rfFTfuzz(kind, s), r;
          try { r = build(c.code); } catch (e) { bad.push(kind + ' ' + s + ' threw ' + e.message); continue; }
          var errs = Object.keys(r.errors).map(function (k) { return r.errors[k]; }), open = 0;
          errs.forEach(function (m) { if (!PLAIN.test(m) || JSERR.test(m)) bad.push(kind + ' ' + s + ' message: ' + m); });
          (r.build.bodies || []).forEach(function (b) { var ck = Evaluate.checkBody(b); open += ck.openEdges.length + ck.nonManifoldEdges.length; });
          var known = false;   // lane FW: no stack is excused any more (holeAcrossBend closed by FU; this fuzz's Closed Corners are refused or closed)
          if (open) { if (known) n.known++; else bad.push(kind + ' ' + s + ' (' + c.ops.join(' ') + '): ' + open + ' open / non-manifold edges'); continue; }
          if (kind === 'sheet' && r.body) {
            var fb = K.flatBody(r.model, r.build, K.flatPattern(r.model, r.build, r.mesh)).body, fc = Evaluate.checkBody(fb);
            if (fc.openEdges.length + fc.nonManifoldEdges.length) bad.push('sheet ' + s + ': flat has open edges');
          }
          n[errs.length ? 'refused' : 'ok']++;
        }
      });
      assert(!bad.length, bad.join(' | '));
      return n.ok + ' built, ' + n.refused + ' refused in a plain sentence, ' + n.known + ' open with a pinned known failure';
    });

    // the smallest scripts that reproduce what the corpus and the fuzz (compare.js --fuzz 300) found; each passes and
    // says 'closed now: promote' once fixed. Owner files in test-reports/2026-10-30-solids-confidence.md.
    var U = 'p.units("in");\n';
    var PINS = [
      ['plain 14 ga L bracket 7.75 × 4, 1.5 flange (fuzz sheet 221; 6 wide or 16 ga is closed)', U + 'p.sheet(0.0747, 0.0747, 0.4);\np.sketch("Top").rect(0, -4, 7.75, 4).end().baseFlange();\np.flange(1.5, [[3.875, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\n'],
      ['L bracket unfolded, Ø0.5 hole across the bend, folded (M26 smallest)', U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });\np.unfold([3, 0.0598, 2], null);\np.sketch("Top", 0.0598).circle(3, 0.05, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n'],
      ['two flanges at a corner with a Butt Closed Corner (M04 smallest)', U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.0598, 0]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[0, 0.0598, 1.5]], { position: "inside", lengthRef: "outer" });\np.closedCorner([[0.0299, 0.6, 0.1196]]);\n'],
      ['back flange folded down, left flange up, 0.0359 sheet R 0.0718 (fuzz sheet 132)', U + 'p.sheet(0.0359, 0.0718, 0.5);\np.sketch("Top").rect(0, -5.75, 6, 5.75).end().baseFlange();\np.flange(1.25, [[3, 0.0359, 5.75]], { position: "inside", lengthRef: "outer", reverse: true });\np.flange(0.875, [[0, 0.0359, 2.875]], { position: "inside", lengthRef: "outer" });\n'],
      ['0.125 sheet: flange, edge jog, rolled hem, two holes (fuzz sheet 33: non-manifold)', U + 'p.sheet(0.125, 0.125, 0.5);\np.sketch("Top").rect(0, -5.75, 3.5, 5.75).end().baseFlange();\np.flange(1.25, [[3.5, 0.125, 2.875]], { position: "inside", lengthRef: "outer" });\np.jog(0.25, 1, [[1.75, 0.125, 5.75]]);\np.hem(0.5, [[0, 0.125, 2.875]], { hemType: "rolled" });\np.sketch("Top", 0.125).circle(0.7752, -2.0214, 0.1405).circle(1.3737, -5.1418, 0.1405).end().cut("through", { reverse: true });\n'],
      ['0.125 sheet R 0.25: 45° and two 120° flanges, two holes (fuzz sheet 91: non-manifold)', U + 'p.sheet(0.125, 0.25, 0.5);\np.sketch("Top").rect(0, -5.5, 3.25, 5.5).end().baseFlange();\np.flange(0.625, [[1.625, 0.125, 0]], { position: "inside", lengthRef: "outer", angle: 45 });\np.flange(1.75, [[3.25, 0.125, 2.75]], { position: "inside", lengthRef: "outer", angle: 120 });\np.flange(0.875, [[1.625, 0.125, 5.5]], { position: "inside", lengthRef: "outer", angle: 120 });\np.sketch("Top", 0.125).circle(2.5939, -5.047, 0.25).circle(1.1486, -0.7617, 0.0995).end().cut("through", { reverse: true });\n'],
      ['Ø0.5 hole through the edge of a Ø0.5 × 1 boss on a 0.25 plate (fuzz round 73)', U + 'p.sketch("Top").rect(0, -4.5, 4, 4.5).end().extrude(0.25);\np.sketch("Top", 0.25).circle(1.33, -3.1532, 0.25).end().extrude(1);\np.sketch("Top", 1.25).circle(0.9453, -2.9922, 0.25).end().cut("through", { reverse: true });\n'],
      ['two bosses and a Ø0.266 hole through the edge of one (fuzz round 38)', U + 'p.sketch("Top").rect(0, -2.5, 5.75, 2.5).end().extrude(0.75);\np.sketch("Top", 0.75).circle(2.261, -0.891, 0.25).end().extrude(0.5);\np.sketch("Top", 0.75).circle(3.6057, -1.463, 0.375).end().extrude(0.5);\np.sketch("Top", 1.75).circle(3.3146, -1.3062, 0.133).end().cut("through", { reverse: true });\n'],
      ['Ø0.75 boss and a Ø0.266 hole through its edge on a 0.375 plate (fuzz round 91)', U + 'p.sketch("Top").rect(0, -4, 5.75, 4).end().extrude(0.375);\np.sketch("Top", 0.375).circle(2.738, -0.7576, 0.375).end().extrude(0.5);\np.sketch("Top", 1.375).circle(2.7143, -1.1901, 0.133).circle(4.7097, -2.2459, 0.25).end().cut("through", { reverse: true });\n'],
      ['14 ga 4.75 × 4: open hem on the right edge, 1.125 flange on the front (fuzz sheet 830; also 221, 336, 544: plain flanges / hems open)', U + 'p.sheet(0.0747, 0.0747, 0.5);\np.sketch("Top").rect(0, -4, 4.75, 4).end().baseFlange();\np.hem(0.5, [[4.75, 0.0747, 2]], { hemType: "open" });\np.flange(1.125, [[2.375, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\n'],
      ['Ø0.5 hole through a Ø1.5 boss extruded 1 with 3° draft (S20 smallest)', U + 'p.sketch("Top").circle(0, 0, 0.75).end().extrude(1, { draft: 3 });\np.sketch("Top", 1).circle(0, 0, 0.25).end().cut("through", { reverse: true });\n'],
      // lane GA (2026-10-30, fuzz 1000 on ffadfbf): the holes across a bend still open
      ['14 ga K 0.4 4 × 2.75, 1 flange on the back edge, Ø0.281 hole across that bend (fuzz sheet 899 / 323; the front edge, 16 ga or Ø0.5 are closed)', U + 'p.sheet(0.0747, 0.0747, 0.4);\np.sketch("Top").rect(0, -2.75, 4, 2.75).end().baseFlange();\np.flange(1, [[2, 0.0747, 2.75]], { position: "inside", lengthRef: "outer" });\np.unfold([2, 0.0747, 1.375], null);\np.sketch("Top", 0.0747).circle(2.8814, -2.7, 0.1405).end().cut("through", { reverse: true });\np.fold(null);\n'],
      ['14 ga L bracket, two Unfold / Cut / Fold rounds each cutting a hole across the bend (fuzz sheet 929; one round is closed)', U + 'p.sheet(0.0747, 0.0747, 0.5);\np.sketch("Top").rect(0, -3.5, 5.5, 3.5).end().baseFlange();\np.flange(1.625, [[0, 0.0747, 1.75]], { position: "inside", lengthRef: "outer" });\np.unfold([2.75, 0.0747, 1.75], null);\np.sketch("Top", 0.0747).circle(-0.05, -2.1517, 0.25).end().cut("through", { reverse: true });\np.fold(null);\np.unfold([2.75, 0.0747, 1.75], null);\np.sketch("Top", 0.0747).circle(-0.05, -2.5522, 0.1405).end().cut("through", { reverse: true });\np.fold(null);\n']
    ];
    // pins closed since (hard rows now): 2 (lane FU, Fold rebuilds the bend from the flat); 1, 3, 4, 7, 8, 9, 10, 11 (lane FQ:
    // shared split points and the exact retry in csg.js). Still TODO: 5 (refused in a plain sentence: the jog is too small
    // for the bend, so no body to check), 6 (9 non-manifold edges where the 120° flange hole meets the bend)
    var HARD = { 1: true, 2: true, 3: true, 4: true, 7: true, 8: true, 9: true, 10: true, 11: true, 12: true };   // 12: lane FW2 (Fold reads the voids at 1024× scale)
    PINS.forEach(function (pin, i) {
      test((HARD[i + 1] ? 'rfFT: pin ' : 'rfFT TODO: pin ') + (i + 1) + ' closed: ' + pin[0], function () {
        var r = build(pin[1]), open = 0, nm = 0;
        (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
        var e = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
        e.forEach(function (m) { assert(PLAIN.test(m) && !JSERR.test(m), 'message: ' + m); });
        if (HARD[i + 1]) { assert(!e.length && !open && !nm, open + ' open, ' + nm + ' non-manifold edges' + (e.length ? ', ' + e[0] : '')); return 'closed, volume ' + r.mp.volume.toFixed(6); }
        return !open && !nm ? 'closed now' + (e.length ? ' (refused: ' + e[0] + ')' : '') + ': promote to a hard test' : 'TODO ' + open + ' open, ' + nm + ' non-manifold edges, volume ' + r.mp.volume.toFixed(6);
      });
    });
  })();
