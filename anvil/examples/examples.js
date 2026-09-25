// examples.js — sample parts written against Anvil's script API (see README.md).
// Plain script so it can be loaded with a <script> tag from file:// as well as http://.
// Each entry: { name, description, code, volume?, tolerance? }. `volume` is a documented reference value in units^3
// (approximate where circles are involved — the kernel uses polygonal circles), checked by tests/kernel-tests.html.
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
  }
];
