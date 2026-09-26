// examples.js — sample parts written against Anvil's script API (see README.md).
// Plain script so it can be loaded with a <script> tag from file:// as well as http://.
// Each entry: { name, description, code, volume?, tolerance?, configurations? }. `volume` is a documented reference value in units^3
// (approximate where circles are involved — the kernel uses polygonal circles), checked by tests/kernel-tests.html.
// `configurations` (optional) maps each configuration name to its volume; the tests switch to each one and rebuild.
// `kind` (optional): 'part' (the default) or 'assembly'. An assembly entry's `code` is an assembly script (the `a.insert` /
// `a.mate` API of assembly.js, see README.md "Assemblies"); the Design Library opens it as an assembly document and the
// tests build it with Assembly.runScript(Assembly.newAssembly(), code) + Assembly.rebuild. Assembly entries are not
// insertable as components. `checks` (assembly only, optional): [{ component: 'Pin<1>', position: [x, y, z],
// rotation?: [9 numbers, row-major] }] solved transforms the tests verify to 1e-6.
var AnvilExamples = [
  {
    name: 'Plate with bolt holes',
    description: 'A 100×60×8 mm plate with four Ø8 holes on a 2×2 pattern. The simplest possible part.',
    volume: 100 * 60 * 8 - 4 * Math.PI * 16 * 8,
    code: [
      'p.name("Plate").units("mm");',
      'p.box(100, 60, 8);                       // x in [0,100], y in [0,8], z in [0,60]',
      'p.hole("Top", 10, -10, 8, { offset: 8 }); // Top plane: sketch v = -z, so v=-10 is world z=+10',
      'p.linearPattern({ dir: "x", spacing: 80, count: 2, dir2: "z", spacing2: 40, count2: 2 });'
    ].join('\n')
  },
  {
    name: 'L-bracket',
    description: 'Angle bracket: 60×60 legs, 5 mm thick, 40 mm wide, with a slot in each leg.',
    volume: 60 * 40 * 5 + 5 * 60 * 40 - 5 * 5 * 40 - 2 * (25 * 8 + Math.PI * 16) * 5,
    tolerance: 0.03,
    code: [
      'p.name("L-Bracket").units("mm");',
      '// base leg on the Top plane (z in [0,40]), upright leg on the Front plane (z in [0,40] too)',
      'p.sketch("Top").rect(0, -40, 60, 40).extrude(5);',
      'p.sketch("Front").rect(0, 0, 5, 60).extrude(40);',
      '// slots: one down through the base, one sideways through the upright (Right plane: u = -z, v = y)',
      'p.sketch("Top", 5).slot(20, -20, 45, -20, 8).cut("through", { reverse: true });',
      'p.sketch("Right", 5).slot(-20, 20, -20, 45, 8).cut("through", { reverse: true });'
    ].join('\n')
  },
  {
    name: 'Bushing',
    description: 'Revolved bushing: Ø30 outside, Ø20 bore, 25 mm long with a Ø36 flange.',
    volume: Math.PI * (15 * 15 - 10 * 10) * 25 + Math.PI * (18 * 18 - 15 * 15) * 4,
    tolerance: 0.03,
    code: [
      'p.name("Bushing").units("mm");',
      '// half-section profile in the Front plane, revolved about the sketch y axis',
      'p.sketch("Front")',
      '  .polyline([[10, 0], [15, 0], [15, 21], [18, 21], [18, 25], [10, 25]], true)',
      '  .revolve(360);'
    ].join('\n')
  },
  {
    name: 'Flange',
    description: 'Pipe flange: Ø120 disc, Ø50 bore, Ø70 raised face, six Ø11 bolt holes on a Ø95 circle.',
    code: [
      'p.name("Flange").units("mm");',
      'p.cylinder(60, 12);                          // main disc, axis +y',
      'p.cylinder(35, 4, { at: [0, 12, 0] });       // raised face',
      'p.sketch("Top", 16).circle(0, 0, 25).cut("through", { reverse: true });   // bore',
      'p.hole("Top", 47.5, 0, 11, { offset: 16 });  // one bolt hole, then pattern it',
      'p.circularPattern({ axis: "y", count: 6 });'
    ].join('\n')
  },
  {
    name: 'Hex nut',
    description: 'M12 hex nut: 19 mm across flats, 10 mm tall, Ø10.2 tapped hole with chamfered corners approximated by a revolve cut.',
    code: [
      'p.name("Hex Nut M12").units("mm");',
      '// hexagon: circumradius = across-flats / cos(30°) / 2',
      'var r = 19 / Math.cos(Math.PI / 6) / 2;',
      'p.sketch("Top").polygon(0, 0, r, 6, 30).extrude(10);',
      'p.sketch("Top", 10).circle(0, 0, 5.1).cut("through", { reverse: true });',
      '// corner chamfer: revolve a triangle around the axis and cut',
      'p.sketch("Front").polyline([[r - 1.2, 10], [r + 1, 10], [r + 1, 7.8]], true).revolveCut(360);',
      'p.sketch("Front").polyline([[r - 1.2, 0], [r + 1, 0], [r + 1, 2.2]], true).revolveCut(360);'
    ].join('\n')
  },
  {
    name: 'Shaft with keyway',
    description: 'Ø20 stepped shaft, 120 long, with a 6 mm keyway and a Ø25 shoulder.',
    code: [
      'p.name("Shaft").units("mm");',
      'p.cylinder(10, 120, { axis: "x" });                 // main shaft along +x',
      'p.cylinder(12.5, 20, { axis: "x", at: [50, 0, 0] }); // shoulder',
      '// keyway: 6 wide, 3.5 deep, 30 long, cut from the top on a plane tangent to the shaft',
      'p.sketch("Top", 10).centerRect(20, 0, 30, 6).cut(3.5, { reverse: true });',
      '// centre drill at each end',
      'p.sketch("Right", 120).circle(0, 0, 2).cut(6, { reverse: true });',
      'p.sketch("Right", 0).circle(0, 0, 2).cut(6);'
    ].join('\n')
  },
  {
    name: 'Pulley',
    description: 'V-belt pulley from a single revolved profile: Ø80 rim with a V groove, Ø20 bore hub.',
    code: [
      'p.name("Pulley").units("mm");',
      'p.sketch("Front")',
      '  .polyline([[10, 0], [40, 0], [40, 6], [33, 10], [40, 14], [40, 20], [10, 20]], true)',
      '  .revolve(360);',
      '// lightening holes in the web',
      'p.hole("Top", 24, 0, 8, { offset: 20 });',
      'p.circularPattern({ axis: "y", count: 5 });'
    ].join('\n')
  },
  {
    name: 'Enclosure lid',
    description: 'Shelled box lid: 120×80×15 outer, 2 mm walls, corner screw bosses. Shows a cut from an offset plane.',
    code: [
      'p.name("Lid").units("mm");',
      'p.box(120, 80, 15, { centered: true });',
      '// hollow it out from the bottom, leaving 2 mm walls and top',
      'p.sketch("Top").centerRect(0, 0, 116, 76).cut(13);',
      '// four screw bosses inside the corners',
      'p.cylinder(4, 13, { at: [52, 0, -32] });',
      'p.linearPattern({ dir: "x", spacing: -104, count: 2, dir2: "z", spacing2: 64, count2: 2 });',
      'p.hole("Top", 52, 32, 2.5, { offset: 13, depth: 10 });',
      'p.linearPattern({ dir: "x", spacing: -104, count: 2, dir2: "z", spacing2: 64, count2: 2 });'
    ].join('\n')
  },
  {
    name: 'Mirrored clevis',
    description: 'A clevis built as one arm plus a body mirror across the Right plane.',
    code: [
      'p.name("Clevis").units("mm");',
      'p.box(30, 12, 40);                            // base block, from x=0 to 30',
      'p.sketch("Front").slot(24, 0, 24, 30, 12).extrude(12, { reverse: true }); // one arm, rounded top',
      'p.hole("Right", -20, 30, 6, { offset: 30 }); // cross hole through the arm',
      'p.mirror("Right", { body: true });           // mirror everything to the other side'
    ].join('\n')
  },
  {
    name: 'Sheet-metal U-bracket',
    description: '2 mm steel U-channel: 120×60 base, two 40 mm up-flanges, slotted base, one hole per leg. Try Sheet Metal ▸ Flatten.',
    code: [
      'p.name("U-Bracket").units("mm");',
      'p.sheet(2, 2, 0.71);                                     // thickness, inside bend radius, k-factor (steel)',
      'p.sketch("Top").rect(0, -60, 120, 60).end().baseFlange(2); // x in [0,120], z in [0,60], y in [0,2]',
      'p.sketch("Top", 2).slot(40, -30, 80, -30, 9).cut("through", { reverse: true });',
      'p.flange(40, [[0, 2, 30]]);                               // left leg, up',
      'p.flange(40, [[120, 2, 30]]);                             // right leg, up',
      '// a hole through each leg, sketched on the Right plane at the leg mid-height',
      'p.sketch("Right", -4).circle(-30, 24, 4).cut(6);          // left leg: plane at x=-4 (outer face), cut toward +x',
      'p.sketch("Right", 124).circle(-30, 24, 4).cut(6, { reverse: true }); // right leg',
      '// mounting holes in the base',
      'p.hole("Top", 20, -12, 6, { offset: 2 });',
      'p.linearPattern({ dir: "x", spacing: 80, count: 2, dir2: "z", spacing2: 36, count2: 2 });'
    ].join('\n')
  },
  {
    name: 'Tray',
    description: '2 mm sheet-metal tray: 120×80 base with four 15 mm walls mitred at the corners, and a hanging tab on the back edge with obround bend reliefs where the wall stops. Try Sheet Metal ▸ Flatten.',
    code: [
      'p.name("Tray").units("mm");',
      'p.sheet(2, 2, 0.71);                                     // thickness, inside bend radius, k-factor (steel)',
      '// base: 120×80 plus a 60-wide tab on the back edge (Top plane: sketch v = -z, so the tab is at z in [80,100])',
      'p.sketch("Top").polyline([[0, 0], [120, 0], [120, -80], [90, -80], [90, -100], [30, -100], [30, -80], [0, -80]], true).end().baseFlange(2);',
      '// one Miter Flange feature: four walls, joined at the four corners; the back wall stops at the tab, so the',
      '// two ends that run into the tab get an obround bend relief (T wide, T/2 deep) cut from the base first',
      'p.flange(15, [[0, 2, 40], [60, 2, 0], [120, 2, 40], [105, 2, 80], [15, 2, 80]], { miter: true, relief: "obround" });',
      '// hanging hole in the tab',
      'p.hole("Top", 60, -92, 6, { offset: 2 });'
    ].join('\n')
  },
  {
    name: 'Normal Cut Bracket',
    description: '2 mm sheet with a 90° flange and a rectangular window cut through the wall from a sketch tilted 45° to it, with Normal cut on: the window walls stay square to the sheet instead of following the tilted sketch. Remove normalCut from the script to compare.',
    code: [
      'p.name("Normal Cut Bracket").units("mm");',
      'p.sheet(2, 2, 0.71);                                          // thickness, inside bend radius, k-factor (steel)',
      'p.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);   // x in [0,100], y in [0,2], z in [0,60]',
      'p.flange(30, [[100, 2, 30]]);                                 // wall on the x = 100 edge: x in [102,104], y in [4,34]',
      '// a sketch plane tilted 45° to the wall (normal between +x and -y), 11 mm outside it; the cut runs along -n,',
      '// i.e. toward -x and +y, through the wall at y around 8..20, well clear of the bend and of the base sheet',
      'p.sketch({ custom: true, origin: [115, 3, 30], x: [0, 0, 1], y: [-0.7071067811865476, -0.7071067811865476, 0], n: [0.7071067811865476, -0.7071067811865476, 0] }, 0)',
      '  .rect(-6, -4, 12, 8)',
      '  .cut("through", { reverse: true, normalCut: true });         // 12 x 8 on the sketch, 12 x 11.3 on the wall',
      '// two mounting holes in the base',
      'p.hole("Top", 30, -30, 6, { offset: 2 });',
      'p.hole("Top", 70, -30, 6, { offset: 2 });'
    ].join('\n')
  },
  {
    name: 'Chamfered block',
    description: 'A machined block with a chamfered top perimeter, filleted vertical corners and a counterbored hole. Shows edge selection by point.',
    code: [
      'p.name("Block").units("mm");',
      'p.sketch("Top").centerRect(0, 0, 80, 50).extrude(25);',
      '// round the four vertical corners (points on the edges at mid-height)',
      'p.fillet(6, [[40, 12, 25], [-40, 12, 25], [40, 12, -25], [-40, 12, -25]]);',
      '// break the top perimeter with a 2 mm chamfer (one point per straight edge)',
      'p.chamfer(2, [[0, 25, 25], [0, 25, -25], [40, 25, 0], [-40, 25, 0]], { chain: false });',
      '// counterbored hole in the middle',
      'p.sketch("Top", 25).circle(0, 0, 4.5).cut("through", { reverse: true });',
      'p.sketch("Top", 25).circle(0, 0, 8).cut(6, { reverse: true });'
    ].join('\n')
  },
  {
    name: 'Rounded handle',
    description: 'A pull handle: revolved grip with a filleted standoff post; concave fillet where the post meets the base.',
    code: [
      'p.name("Handle").units("mm");',
      'p.sketch("Top").centerRect(0, 0, 40, 40).extrude(6);          // base plate',
      'p.cylinder(8, 30, { at: [0, 6, 0] });                          // post',
      'p.fillet(3, [[8, 6, 0]]);                                      // concave fillet at the post root (chains round the rim)',
      'p.sketch("Front").polyline([[0, 36], [18, 36], [22, 42], [18, 48], [0, 48]], true).revolve(360); // grip',
      'p.chamfer(1, [[20, 6, 0], [-20, 6, 0], [0, 6, 20], [0, 6, -20]], { chain: false });                // base top edges'
    ].join('\n')
  },
  {
    name: 'Mug',
    description: 'A shelled cylinder with the top removed and a handle swept along an arc. Shows Shell and Sweep together.',
    code: [
      'p.name("Mug").units("mm");',
      'p.cylinder(40, 90);                                   // body, axis +y',
      'p.shell(3, [[0, 90, 0]]);                             // 3 mm walls, open at the top (point on the top face)',
      '// handle: a Ø10 section swept along an arc drawn on the Front plane (x = X, y = Y)',
      'var prof = p.sketch("Right", 38).circle(0, 20, 5).id();  // Right plane at x = 38: u = -z, v = y',
      'var path = p.sketch("Front")',
      '  .line(38, 20, 44, 20)',
      '  .arc(44, 45, 25, -90, 90)                          // half circle from (44,20) up to (44,70)',
      '  .line(44, 70, 38, 70)',
      '  .id();',
      'p.sweep({ profile: prof, path: path, name: "Handle" });'
    ].join('\n')
  },
  {
    name: 'Funnel',
    description: 'A loft from a Ø80 circle to a Ø14 circle, shelled to 1.5 mm with both ends open, plus a swept spout.',
    code: [
      'p.name("Funnel").units("mm");',
      'var mouth = p.sketch("Top", 60).circle(0, 0, 40).id();',
      'var neck = p.sketch("Top", 20).circle(0, 0, 7).id();',
      'p.loft([mouth, neck], { name: "Cone" });',
      'p.sketch("Top").circle(0, 0, 7).extrude(20, { name: "Spout" });',
      '// hollow it: 1.5 mm walls, open at the top face of the cone and the bottom of the spout',
      'p.shell(1.5, [[0, 60, 0], [0, 0, 0]]);'
    ].join('\n')
  },
  {
    name: 'Handlebar',
    description: 'A Ø22 tube swept along a 3D polyline given directly in the script (no path sketch), with mitred corners.',
    volume: null,
    code: [
      'p.name("Handlebar").units("mm");',
      'p.sketch("Right").circle(0, 0, 11);                 // section in the Right plane, swept along +x first',
      'p.sweep({ path: [[0, 0, 0], [200, 0, 0], [260, 0, -60], [340, 40, -60]] });',
      '// bore the tube: a second sweep of a smaller circle along the same path, as a cut',
      'p.sketch("Right").circle(0, 0, 9);',
      'p.sweep({ path: [[-1, 0, 0], [200, 0, 0], [260, 0, -60], [341, 40, -60]], cut: true });'
    ].join('\n')
  },
  {
    name: 'Moulded cap',
    description: 'Injection-moulded cap: 3° draft on the outer wall and on the core pocket, shelled to 1.5 mm, with a drafted boss and mid-plane drafted rib.',
    code: [
      'p.name("Cap").units("mm");',
      '// outer shape: 60×40 footprint drafted 3° inward as it rises 18 mm',
      'p.sketch("Top").centerRect(0, 0, 60, 40).extrude(18, { draft: 3 });',
      '// the core pocket from below: a drafted cut so the part can leave the mould',
      'p.sketch("Top").centerRect(0, 0, 55, 35).cut(16, { draft: 3 });',
      '// a screw boss on the inside of the top, drafted outward toward its root',
      'p.sketch("Top", 16).circle(0, 0, 4).extrude(12, { reverse: true, draft: 2, draftOutward: true });',
      'p.sketch("Top", 16).circle(0, 0, 1.5).cut(10, { reverse: true });',
      '// a stiffening rib across the inside, drafted both ways from its mid plane',
      'p.sketch("Top", 16).centerRect(0, 0, 50, 2).extrude(12, { reverse: true, draft: 1 });'
    ].join('\n')
  },
  {
    name: 'Constrained L profile',
    description: 'An L-shaped profile drawn roughly and then pinned down by sketch relations (Coincident, Horizontal, Vertical, origin) and four driving dimensions: 60 × 40 with 15 mm legs, Fully Defined, extruded 10 mm.',
    volume: (60 * 15 + 15 * 25) * 10,
    code: [
      'p.name("Constrained L").units("mm");',
      '// six lines drawn by eye; the dimensions set four lengths, the relations close and square the outline',
      'p.sketch("Front")',
      '  .line(0, 0, 58, 1).line(58, 1, 59, 14).line(59, 14, 16, 16).line(16, 16, 14, 41).line(14, 41, 1, 39).line(1, 39, 0, 0)',
      '  .dim(0, "len", { value: 60 }).dim(1, "len", { value: 15 }).dim(4, "len", { value: 15 }).dim(5, "len", { value: 40 })',
      '  .rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"])',
      '  .rel("coincident", ["3.p2", "4.p1"]).rel("coincident", ["4.p2", "5.p1"]).rel("coincident", ["5.p2", "0.p1"])',
      '  .rel("coincident", ["0.p1", "O"])',
      '  .rel("horizontal", ["0"]).rel("vertical", ["1"]).rel("horizontal", ["2"]).rel("vertical", ["3"]).rel("horizontal", ["4"]).rel("vertical", ["5"])',
      '  .extrude(10);'
    ].join('\n')
  },
  {
    name: 'Parametric plate',
    description: 'A mounting plate driven by equations (Tools ▸ Equations): length, width, thickness, edge margin and hole size are global variables, the corner holes are patterned at "=L - 2*E" and a centre row at "=L/4". Change T or D and rebuild.',
    // 120×80×8 plate − four Ø8 corner holes − three Ø4 centre holes (polygonal circles: 16 sides each)
    volume: 120 * 80 * 8 - 4 * Math.PI * 16 * 8 - 3 * Math.PI * 4 * 8,
    tolerance: 0.01,
    code: [
      'p.name("Parametric plate").units("mm");',
      '// global variables, in order: each may use the ones above it',
      'p.equations({ L: 120, W: 80, T: 8, E: 15, D: 8 });',
      '// box sizes are sketch dimensions, evaluated now; the thickness stays live ("=T")',
      'p.box("=L", "=W", "=T");                              // x in [0,L], y in [0,T], z in [0,W]',
      '// one corner hole on the top face, then a 2×2 pattern whose spacings follow L, W and the margin E',
      'p.hole("Top", 15, -15, "=D", { offset: "=T" });',
      'p.linearPattern({ dir: "x", spacing: "=L - 2*E", count: 2, dir2: "z", spacing2: "=W - 2*E", count2: 2 });',
      '// a row of three half-size holes along the middle, a quarter of the length apart',
      'p.hole("Top", 30, -40, "=D/2", { offset: "=T" });',
      'p.linearPattern({ dir: "x", spacing: "=L/4", count: 3 });'
    ].join('\n')
  },
  {
    name: 'Two-body clamp',
    description: 'A base block and a floating cap kept as two solid bodies (Merge result off), with two holes scoped to the cap only (Feature Scope ▸ Selected bodies) and a fillet that acts on the base alone. Shows the Solid Bodies folder in the FeatureManager.',
    // base 60×10×30 + cap 60×6×30 − two Ø6 holes through the 6 mm cap − a R3 fillet along the base's 60 mm front bottom edge
    volume: 60 * 30 * 10 + 60 * 30 * 6 - 2 * Math.PI * 9 * 6 - (1 - Math.PI / 4) * 9 * 60,
    tolerance: 0.01,
    code: [
      'p.name("Two-body clamp").units("mm");',
      'p.box(60, 30, 10);                                   // base: x in [0,60], y in [0,10], z in [0,30]',
      'p.box(60, 30, 6, { at: [0, 15, 0], merge: false }); // cap 5 mm above the base, its own body (Merge result off)',
      '// two through holes from the top of the cap, scoped to body 1 (the cap): the base underneath stays solid',
      'p.hole("Top", 10, -15, 6, { offset: 21, bodies: [1] });',
      'p.hole("Top", 50, -15, 6, { offset: 21, bodies: [1] });',
      '// a fillet picked mid-way along the base\'s front bottom edge (y = 0, z = 0) rounds the base only: the pick',
      '// point decides which body the fillet works on (the body with the nearest edge)',
      'p.fillet(3, [[30, 0, 0]]);'
    ].join('\n')
  },
  {
    name: 'Configured spacer',
    description: 'One part, three sizes: an 80×40 spacer plate with a row of rectangular pockets. The configurations Small, Medium and Large set the plate thickness T, the pocket count N, the pocket pitch S and the pocket depth D (ConfigurationManager tab). Medium is active.',
    // plate 80 × 40 × T minus N pockets of 10 × 20 × D. Small: T 6, N 2, D 3 → 18000; Medium: T 10, N 3, D = T/2 = 5 →
    // 29000; Large: T 12, N 4, S 18, D = T-4 = 8 → 32000
    volume: 80 * 40 * 10 - 3 * 10 * 20 * 5,
    tolerance: 1e-6,
    configurations: { Small: 80 * 40 * 6 - 2 * 10 * 20 * 3, Medium: 80 * 40 * 10 - 3 * 10 * 20 * 5, Large: 80 * 40 * 12 - 4 * 10 * 20 * 8 },
    code: [
      'p.name("Spacer").units("mm");',
      'p.equations({ T: 10, N: 3, S: 20, D: "=T/2" });',
      '// each configuration overrides some variables; D in Large refers to T, which is evaluated before it',
      'p.configurations([',
      '  { name: "Small", values: { T: 6, N: 2, D: 3 } },',
      '  { name: "Medium", values: { T: 10, N: 3 } },',
      '  { name: "Large", values: { T: 12, N: 4, S: 18, D: "=T-4" } }',
      '], "Medium");',
      '// only live feature fields follow a configuration switch: extrude and cut depths, plane offset, pattern spacing and count',
      'p.sketch("Front").rect(0, 0, 80, 40).extrude("=T");',
      'p.sketch("Front", "=T").rect(10, 10, 10, 20).cut("=D", { reverse: true });',
      'p.linearPattern({ dir: "x", spacing: "=S", count: "=N" });'
    ].join('\n')
  },
  {
    name: 'Spur gear (12 teeth)',
    description: 'A gear blank with 12 trapezoidal teeth cut by a circular pattern. Not an involute, but it looks the part.',
    code: [
      'p.name("Gear").units("mm");',
      'p.cylinder(30, 8);',
      '// one tooth gap as a trapezoid, then pattern the cut around the axis',
      'p.sketch("Top", 8).polyline([[26, -3.2], [31, -4.5], [31, 4.5], [26, 3.2]], true).cut("through", { reverse: true });',
      'p.circularPattern({ axis: "y", count: 12 });',
      'p.sketch("Top", 8).circle(0, 0, 6).cut("through", { reverse: true });',
      'p.sketch("Top", 8).centerRect(0, -6, 3, 3).cut("through", { reverse: true }); // keyway'
    ].join('\n')
  },
  {
    name: 'Pinned plate assembly',
    kind: 'assembly',
    description: 'Assembly: the bolt-hole plate (fixed), two Ø8 pins mated into two of its holes, and a cap block seated on its top face in a corner.',
    // plate + 2 pins + cap; a Ø8 circle is a 16-gon (area 128·sin(π/8)), exactly as the kernel samples it
    volume: 100 * 60 * 8 - 4 * 128 * Math.sin(Math.PI / 8) * 8 + 2 * 128 * Math.sin(Math.PI / 8) * 20 + 30 * 20 * 5,
    checks: [
      { component: 'Plate<1>', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      { component: 'Pin<1>', position: [10, 0, 10] },
      { component: 'Pin<2>', position: [90, 0, 10] },
      { component: 'Cap<1>', position: [0, 8, 40], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
    ],
    code: [
      'a.name("Pinned Plate").units("mm");',
      '// the plate is x in [0,100], y in [0,8], z in [0,60] with Ø8 holes at x = 10, 90 and z = 10, 50',
      'var plate = a.insert({ example: "Plate with bolt holes" }, { fixed: true });',
      '// pins: Ø8 × 20 along local +y from the origin, dropped in anywhere (the mates put them in place)',
      'var pin1 = a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [40, 30, -20] });',
      'var pin2 = a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [60, 15, 80], rotation: [1, 0, 0, 0, 0, -1, 0, 1, 0] });',
      'a.concentric({ component: pin1, cylinder: [4, 10, 0] }, { component: plate, cylinder: [14, 4, 10] });',
      'a.coincident({ component: pin1, face: [1, 0, 1] }, { component: plate, face: [50, 0, 30] }, { alignment: "aligned" });  // flush bottoms',
      'a.concentric({ component: pin2, cylinder: [4, 10, 0] }, { component: plate, cylinder: [94, 4, 10] });',
      'a.coincident({ component: pin2, face: [1, 0, 1] }, { component: plate, face: [50, 0, 30] }, { alignment: "aligned" });',
      '// cap: 30 × 5 × 20 block seated on the top face (faces touch: anti-aligned by default), flush with the x = 0 and',
      '// z = 60 sides of the plate, so it covers the empty hole at (10, 50)',
      'var cap = a.insert({ script: \'p.name("Cap"); p.box(30, 20, 5);\' }, { position: [50, 30, 20] });',
      'a.coincident({ component: cap, face: [15, 0, 10] }, { component: plate, face: [50, 8, 30] });',
      'a.coincident({ component: cap, face: [0, 2.5, 10] }, { component: plate, face: [0, 4, 30] }, { alignment: "aligned" });',
      'a.coincident({ component: cap, face: [15, 2.5, 20] }, { component: plate, face: [50, 4, 60] }, { alignment: "aligned" });'
    ].join('\n')
  },
  {
    name: 'Distance and angle mates',
    kind: 'assembly',
    description: 'Assembly: a block held 15 above a base plate by Distance mates and an offset Coincident, and a bar pivoted on the base corner at 30° by an Angle mate. Every component is fully defined.',
    // base 100 × 10 × 60 + block 20³ + bar 40 × 4 × 10; nothing overlaps
    volume: 100 * 60 * 10 + 20 * 20 * 20 + 40 * 4 * 10,
    checks: [
      { component: 'Base<1>', position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      // Distance 15 above the top (y = 10 + 15), left faces 30 apart (offset Coincident), back faces 10 apart with the
      // dimension flipped (the block's back face 10 beyond the base's: z = 60 + 10 − 20)
      { component: 'Block<1>', position: [30, 25, 50], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      // on the top face, pivoting about the base's Y axis (the x = z = 0 corner), turned −30° about +Y by the Angle mate
      { component: 'Bar<1>', position: [0, 10, 0], rotation: [Math.cos(Math.PI / 6), 0, -0.5, 0, 1, 0, 0.5, 0, Math.cos(Math.PI / 6)] }
    ],
    code: [
      'a.name("Distance and Angle").units("mm");',
      '// the base is x in [0,100], y in [0,10], z in [0,60]',
      'var base = a.insert({ script: \'p.name("Base"); p.box(100, 60, 10);\' }, { fixed: true });',
      '// block: 20 cube, dropped in tilted; the three mates fix it completely',
      'var block = a.insert({ script: \'p.name("Block"); p.box(20, 20, 20);\' }, { position: [5, 40, 5], rotation: [0.965926, -0.258819, 0, 0.258819, 0.965926, 0, 0, 0, 1] });',
      'a.distance({ component: block, face: [10, 0, 10] }, { component: base, face: [50, 10, 30] }, 15);   // bottom 15 above the top',
      'a.coincident({ component: block, face: [0, 10, 10] }, { component: base, face: [0, 5, 30] }, { alignment: "aligned", offset: 30 });',
      'a.distance({ component: block, face: [10, 10, 20] }, { component: base, face: [50, 5, 60] }, 10, { alignment: "aligned", flip: true });',
      '// bar: 40 × 4 × 10 lying on the top, hinged on the base corner, 30° between its side face and the base front face',
      'var bar = a.insert({ script: \'p.name("Bar"); p.box(40, 10, 4);\' }, { position: [60, 30, 20] });',
      'a.coincident({ component: bar, face: [20, 0, 5] }, { component: base, face: [50, 10, 30] });',
      'a.concentric({ component: bar, axis: "y" }, { component: base, axis: "y" });',
      'a.angle({ component: bar, face: [20, 2, 0] }, { component: base, face: [50, 5, 0] }, 30);'
    ].join('\n')
  },
  {
    name: 'Interference check',
    kind: 'assembly',
    description: 'Assembly for Interference Detection: a block sunk 5 into a base plate (offset Coincident, flipped), a pin standing on the top (touching only) and a pin sunk 8 into the plate.',
    // base 60 × 10 × 40 + block 20³ + two Ø8 × 20 pins (16-gons); the bodies are kept apart, so the overlaps count twice
    volume: 60 * 40 * 10 + 20 * 20 * 20 + 2 * 128 * Math.sin(Math.PI / 8) * 20,
    checks: [
      { component: 'Block<1>', position: [10, 5, 10], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      { component: 'Pin<1>', position: [50, 10, 30] },
      { component: 'Pin<2>', position: [50, 2, 10] }
    ],
    // Interference Detection: Base ∩ Block is 20 × 5 × 20, Base ∩ Pin<2> is the pin's 8 lowest mm; Pin<1> only touches
    interference: [
      { a: 'Base<1>', b: 'Block<1>', volume: 20 * 5 * 20 },
      { a: 'Base<1>', b: 'Pin<2>', volume: 128 * Math.sin(Math.PI / 8) * 8 }
    ],
    code: [
      'a.name("Interference").units("mm");',
      '// the base is x in [0,60], y in [0,10], z in [0,40]',
      'var base = a.insert({ script: \'p.name("Base"); p.box(60, 40, 10);\' }, { fixed: true });',
      '// block: bottom 5 below the base top (Coincident with a flipped 5 offset), 10 in from the left and front faces',
      'var block = a.insert({ script: \'p.name("Block"); p.box(20, 20, 20);\' }, { position: [40, 30, 0] });',
      'a.coincident({ component: block, face: [10, 0, 10] }, { component: base, face: [30, 10, 20] }, { offset: 5, flip: true });',
      'a.coincident({ component: block, face: [0, 10, 10] }, { component: base, face: [0, 5, 20] }, { alignment: "aligned", offset: 10 });',
      'a.coincident({ component: block, face: [10, 10, 0] }, { component: base, face: [30, 5, 0] }, { alignment: "aligned", offset: 10 });',
      '// pins: Ø8 × 20 along +y, fixed where they are; the first stands on the top, the second goes 8 into the plate',
      'a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [50, 10, 30], fixed: true });',
      'a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [50, 2, 10], fixed: true });'
    ].join('\n')
  },
  {
    name: 'Gear train and patterns',
    kind: 'assembly',
    description: 'Assembly with the newer mates and component patterns: two gears on shafts coupled by a Gear mate (1:2), three pins on the big gear (Circular Component Pattern, they turn with it), a row of four pins (Linear Component Pattern) and a mirrored pin (Mirror Components), a slider centred in a slot by a Width mate and held in range by a Limit Distance mate, a roller lying on the plate (Tangent, Perpendicular), and an exploded view.',
    // base plate with two shafts and two rails + gears with Ø6 bores + 3 dot pins + 5 pins + slider + roller (bodies kept apart)
    volume: (function () {
      function A(r) { var n = Math.max(16, Math.min(72, Math.round(8 * Math.sqrt(r)))); return n / 2 * r * r * Math.sin(2 * Math.PI / n); }
      return 160 * 120 * 10 + 2 * A(3) * 15 + 2 * 100 * 8 * 8 + (A(12) - A(3)) * 5 + (A(24) - A(3)) * 5 + 3 * A(1.5) * 6 + 5 * A(2) * 12 + 20 * 10 * 8 + A(5) * 40;
    })(),
    checks: (function () {
      function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
      // Dot Pin<1> sits 16 out along Gear B's x axis; its pattern copies are 120° and 240° further round Gear B's axis
      function dot(k) { var a = (-22.5 + 120 * k) * Math.PI / 180; return [-14 + 16 * Math.cos(a), 15, -16 * Math.sin(a)]; }
      return [
        { component: 'Base<1>', position: [0, 0, 0], rotation: ry(0) },
        // Gear A inserted turned 45° about its shaft; the Gear mate (12 : 24, phase 0 / 0) turns Gear B −22.5°
        { component: 'Gear A<1>', position: [-50, 10, 0], rotation: ry(45) },
        { component: 'Gear B<1>', position: [-14, 10, 0], rotation: ry(-22.5) },
        { component: 'Dot Pin<1>', position: dot(0), rotation: ry(-22.5) },
        { component: 'Dot Pin<2>', position: dot(1), rotation: ry(97.5) },
        { component: 'Dot Pin<3>', position: dot(2), rotation: ry(217.5) },
        { component: 'Pin<1>', position: [70, 10, -50] },
        { component: 'Pin<2>', position: [50, 10, -50] },
        { component: 'Pin<3>', position: [30, 10, -50] },
        { component: 'Pin<4>', position: [10, 10, -50] },
        { component: 'Pin<5>', position: [-70, 10, -50], rotation: ry(0) },
        // Width: centred in the 12 wide slot (z 38..50); Limit Distance 10..60 from the rail ends clamps x = 70 to 40
        { component: 'Slider<1>', position: [40, 10, 39], rotation: ry(0) },
        // Tangent to the plate top (the 18-gon's flats are 5·cos 10° from its axis), end flush with the back face
        { component: 'Roller<1>', position: [-60, 10 + 5 * Math.cos(Math.PI / 18), 20], rotation: ry(0) }
      ];
    })(),
    // Interference Detection finds nothing: the bores line up with the shafts, everything else only touches
    interference: [],
    code: [
      'a.name("Gear Train").units("mm");',
      '// plate x in [-80,80], z in [-60,60], y in [0,10]; Ø6 shafts at x = -50 and -14 (36 apart = 12 + 24); rails z 30..38 and 50..58',
      'var base = a.insert({ script: \'p.name("Base"); p.box(160, 120, 10, { centered: true }); p.cylinder(3, 15, { at: [-50, 10, 0] }); p.cylinder(3, 15, { at: [-14, 10, 0] }); p.box(100, 8, 8, { at: [-20, 10, 30] }); p.box(100, 8, 8, { at: [-20, 10, 50] });\' }, { fixed: true });',
      '// gears: discs with Ø6 bores, on the shafts and on the plate; Gear A dropped in turned 45° (a multiple of the 22.5° facets, so its bore lines up with the shaft)',
      'var gA = a.insert({ script: \'p.name("Gear A"); p.cylinder(12, 5); p.cylinder(3, 5, { cut: true });\' }, { position: [-60, 30, 20], rotation: [0.7071067811865476, 0, 0.7071067811865476, 0, 1, 0, -0.7071067811865476, 0, 0.7071067811865476] });',
      'var gB = a.insert({ script: \'p.name("Gear B"); p.cylinder(24, 5); p.cylinder(3, 5, { cut: true });\' }, { position: [0, 30, 20] });',
      'a.concentric({ component: gA, cylinder: [12, 2.5, 0] }, { component: base, cylinder: [-47, 15, 0] });',
      'a.coincident({ component: gA, face: [7, 0, 0] }, { component: base, face: [0, 10, -40] });',
      'a.concentric({ component: gB, cylinder: [24, 2.5, 0] }, { component: base, cylinder: [-11, 15, 0] });',
      'a.coincident({ component: gB, face: [7, 0, 0] }, { component: base, face: [0, 10, -40] });',
      '// Gear mate: Gear B turns 12/24 as far as Gear A, the other way round (phase 0 / 0: both measured from their inserted zero)',
      'a.gear({ component: gA, cylinder: [12, 2.5, 0] }, { component: gB, cylinder: [24, 2.5, 0] }, [12, 24], { phase: [0, 0] });',
      '// a dot pin on Gear B, 16 out along its x axis, patterned 3 times round its axis: the pattern turns with the gear',
      'var dot = a.insert({ script: \'p.name("Dot Pin"); p.cylinder(1.5, 6);\' }, { position: [30, 40, 30] });',
      'a.coincident({ component: dot, face: [0.5, 0, 0.5] }, { component: gB, face: [16, 5, 0] });',
      'a.coincident({ component: gB, plane: "Right" }, { component: dot, plane: "Right" }, { offset: 16 });',
      'a.coincident({ component: gB, plane: "Front" }, { component: dot, plane: "Front" });',
      'a.circularPattern([dot], { axis: { component: gB, cylinder: [24, 2.5, 0] }, angle: 360, count: 3, equal: true });',
      '// a pin at (70, -50) on the plate, a row of 4 towards -x (Linear Component Pattern) and a copy mirrored in the Right plane',
      'var pin = a.insert({ script: \'p.name("Pin"); p.cylinder(2, 12);\' }, { position: [0, 40, -30] });',
      'a.coincident({ component: pin, face: [0.5, 0, 0.5] }, { component: base, face: [0, 10, -40] });',
      'a.coincident({ component: base, plane: "Right" }, { component: pin, plane: "Right" }, { offset: 70 });',
      'a.coincident({ component: base, plane: "Front" }, { component: pin, plane: "Front" }, { offset: 50, flip: true });',
      'a.linearPattern([pin], { direction: { component: base, face: [-80, 5, 0] }, spacing: 20, count: 4 });',
      'a.mirrorComponents([pin], { plane: { component: base, plane: "Right" } });',
      '// slider 20 × 8 × 10 in the slot: Width centres it between the rails, Limit Distance keeps its left face 10..60 from the rail ends',
      'var slider = a.insert({ script: \'p.name("Slider"); p.box(20, 10, 8);\' }, { position: [70, 30, 10] });',
      'a.coincident({ component: slider, face: [10, 0, 5] }, { component: base, face: [0, 10, -40] });',
      'a.width({ component: base, face: [30, 14, 38] }, { component: base, face: [30, 14, 50] }, { component: slider, face: [10, 4, 0] }, { component: slider, face: [10, 4, 10] });',
      'a.limitDistance({ component: slider, face: [0, 4, 5] }, { component: base, face: [-20, 14, 34] }, 10, 60, { alignment: "aligned" });',
      '// roller Ø10 × 40 lying on the plate: Tangent to the top, axis Perpendicular to the back face, end flush with it',
      'var roller = a.insert({ script: \'p.name("Roller"); p.cylinder(5, 40, { axis: "z" });\' }, { position: [-60, 30, 0] });',
      'a.tangent({ component: roller, cylinder: [5, 0, 20] }, { component: base, face: [0, 10, -40] });',
      'a.perpendicular({ component: roller, cylinder: [5, 0, 20] }, { component: base, face: [0, 5, 60] });',
      'a.coincident({ component: roller, face: [0, 0, 40] }, { component: base, face: [0, 5, 60] }, { alignment: "aligned" });',
      '// Exploded View: lift the slider, then the roller, then Gear B with its pins',
      'a.explode([slider], "y", 40);',
      'a.explode([roller], "y", 30);',
      'a.explode([gB, dot, "Dot Pin<2>", "Dot Pin<3>"], "y", 20);'
    ].join('\n')
  }
];
