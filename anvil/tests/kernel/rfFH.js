  // --- rfFH (2026-10-29, lane FH: SolidWorks reference audit of solid features) --- the same 16 parts built in
  // SolidWorks 2022 SP5 through its API (head-tools/sw-reference/solids_ref.py; parts and raw solids.json in
  // Output\SolidWorks Models\Anvil reference\solids) and here, inch units. Each row asserts Anvil's own-engine
  // volume against SolidWorks' Mass Properties volume to 1e-4 relative. Rows named 'rfFH TODO: …' hold a SolidWorks
  // value Anvil does not reach yet: they pass, their detail gives Anvil vs SolidWorks, and they say to promote the
  // row once Anvil lands within 1e-4. Where Anvil only approximates (faceted fillet / sweep surfaces) a looser hard
  // row guards today's accuracy next to the TODO. Write-up: test-reports/2026-10-29-solids-fidelity.md.
  (function () {
    group('rfFH: solid features against SolidWorks (draft, revolve, fillets, chamfer, shell, Hole Wizard, loft, sweep, rib, patterns)');
    var TOL = 1e-4, U = 'p.units("in");\n';
    var PLATE_HOLE = U + 'p.sketch("Top").centerRect(0, 0, 3, 3).end();\np.extrude(1);\np.sketch("Top", 1).circle(0, 0, 0.5).end();\np.cut("through", { reverse: true });\n';
    var BOX12 = '[[0, 0, 0.75], [0, 0, -0.75], [0, 1, 0.75], [0, 1, -0.75], [1, 0, 0], [-1, 0, 0], [1, 1, 0], [-1, 1, 0], [1, 0.5, 0.75], [1, 0.5, -0.75], [-1, 0.5, 0.75], [-1, 0.5, -0.75]]';
    var RIMS6 = []; for (var k = 0; k < 6; k++) RIMS6.push('[' + (1.5 * Math.cos(k * Math.PI / 3)).toFixed(9) + ', 0.75, ' + (-1.5 * Math.sin(k * Math.PI / 3)).toFixed(9) + ']');
    // name: [Anvil script, SolidWorks volume in³, SolidWorks face count]
    var P = {
      P01: ['extrude 2 × 1 × 1 with 5° draft', U + 'p.sketch("Top").centerRect(0, 0, 2, 1).end();\np.extrude(1, { draft: 5 });\n', 1.747739697749631, 6],
      P02: ['revolve of a profile with a groove arc and a dome arc ending on the axis', U + 'p.sketch("Front").line(0, 0, 1, 0).line(1, 0, 1, 0.5).arc(1, 0.75, 0.25, 90, 270).line(1, 1, 1, 1.5).arc(0.5, 1.5, 0.5, 0, 180).line(0, 1.5, 0, 0).end();\np.revolve(360);\n', 5.3946891024025625, 5],
      P03: ['cylinder r 1 h 1, top rim fillet r 0.25 (convex)', U + 'p.sketch("Top").circle(0, 0, 1).end();\np.extrude(1);\np.fillet(0.25, [[1, 1, 0]]);\n', 3.062024733728834, 4],
      P04: ['3 × 3 × 1 plate, Ø1 hole, top hole edge fillet r 0.125', PLATE_HOLE + 'p.fillet(0.125, [[0.5, 1, 0]]);\n', 8.203479340544, 8],
      P05: ['boss r 0.5 on a plate, root fillet r 0.125 (concave)', U + 'p.sketch("Top").centerRect(0, 0, 3, 3).end();\np.extrude(0.5);\np.sketch("Top", 0.5).circle(0, 0, 0.5).end();\np.extrude(1);\np.fillet(0.125, [[0.5, 0.5, 0]]);\n', 5.296520659455998, 9],
      P06: ['2 × 1.5 × 1 box, all 12 edges r 0.25', U + 'p.sketch("Top").centerRect(0, 0, 2, 1.5).end();\np.extrude(1);\np.fillet(0.25, ' + BOX12 + ');\n', 2.779498469497871, 26],
      // rfFF2: solids_ref.py makes these with FeatureFillet options 2 (uniform radius, NO tangent propagation): chain: false.
      // With propagation the r 0.25 runs round Fillet1's end arc and down the edge the r 0.375 wants (OpenCascade's
      // BRepFilletAPI always propagates, so it stays at 7.843104 and Anvil's solid drives)
      P07: ['2 in cube, fillets r 0.5, 0.25, 0.375 (three features, no tangent propagation) meeting at one corner', U + 'p.sketch("Top").rect(0, -2, 2, 2).end();\np.extrude(2);\np.fillet(0.5, [[1, 2, 2]], { chain: false });\np.fillet(0.25, [[2, 2, 1]], { chain: false });\np.fillet(0.375, [[2, 1, 2]], { chain: false });\n', 7.817528170230516, 9],
      P08: ['3 × 3 × 1 plate, Ø1 hole, 0.1 × 45° chamfer on the top hole edge', PLATE_HOLE + 'p.chamfer(0.1, [[0.5, 1, 0]]);\n', 8.197846675783405, 8],
      P09: ['3 × 2 × 1.5 box, vertical edges r 0.5, shell 0.1 top open', U + 'p.sketch("Top").centerRect(0, 0, 3, 2).end();\np.extrude(1.5);\np.fillet(0.5, [[1.5, 0.75, 1], [1.5, 0.75, -1], [-1.5, 0.75, 1], [-1.5, 0.75, -1]]);\np.shell(0.1, [[0, 1.5, 0]]);\n', 1.8143804906920593, 19],
      P10: ['Hole Wizard ANSI Inch 1/4 counterbore and 1/4 82° countersink, Normal fit, through a 3 × 2 × 0.75 plate', U + 'p.sketch("Top").centerRect(0, 0, 3, 2).end();\np.extrude(0.75);\np.holeWizard({ face: "Top", offset: 0.75, points: [[-0.75, 0]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", end: "through" });\np.holeWizard({ face: "Top", offset: 0.75, points: [[0.75, 0]], standard: "ANSI Inch", type: "csk", size: "1/4", fit: "normal", end: "through" });\n', 4.383865832175977, 11],
      P11: ['loft 2 × 2 square → r 1 circle 2 above', U + 'var s1 = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar s2 = p.sketch("Top", 2).circle(0, 0, 1).id();\np.loft([s1, s2]);\n', 7.15070879047042, 6],
      P12: ['sweep of a r 0.25 circle along a 90° arc of r 2', U + 'var prof = p.sketch("Top").circle(0, 0, 0.25).id();\nvar path = p.sketch("Front").arc(2, 0, 2, 90, 180).id();\np.sweep({ profile: prof, path: path });\n', 0.6168502750680848, 3],
      P13: ['Rib 0.25 both sides, parallel to sketch, in an L section', U + 'p.sketch("Front").polyline([[0, 0], [4, 0], [4, 0.25], [0.25, 0.25], [0.25, 3], [0, 3]]).end();\np.extrude(2, { midplane: true });\np.sketch("Front").line(0.25, 2, 3, 0.25).end();\np.rib(0.25);\n', 3.9765624999999982, 11],
      P14: ['Draft 5° on the +X side of a 2 × 2 × 1 box, neutral face the bottom', U + 'p.sketch("Top").centerRect(0, 0, 2, 2).end();\np.extrude(1);\np.draft(5, [0, 0, 0], [[1, 0.5, 0]]);\n', 3.9125113364740756, 6],
      P15: ['LPattern ×3 @ 1.5 of a r 0.25 boss with a r 0.1 rim fillet (Anvil: pattern the boss, fillet each rim)', U + 'p.sketch("Top").rect(0, -1, 4, 2).end();\np.extrude(0.25);\np.sketch("Top", 0.25).circle(0.5, 0, 0.25).end();\np.extrude(0.5);\np.linearPattern({ dir: "x", spacing: 1.5, count: 3 });\np.fillet(0.1, [[0.75, 0.75, 0], [2.25, 0.75, 0], [3.75, 0.75, 0]]);\n', 2.2853149946405957, 15],
      P16: ['CirPattern ×6 of a r 0.25 boss with a r 0.1 rim fillet on a r 2 disk (Anvil: pattern the boss, fillet each rim)', U + 'p.sketch("Top").circle(0, 0, 2).end();\np.extrude(0.25);\np.sketch("Top", 0.25).circle(1.25, 0, 0.25).end();\np.extrude(0.5);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 6 });\np.fillet(0.1, [' + RIMS6.join(', ') + ']);\n', 3.712222642870985, 21]
    };
    var cache = {};
    function vol(id) { if (!cache[id]) cache[id] = build(P[id][1]); return cache[id]; }
    function off(id) { var r = vol(id); return (r.mp.volume - P[id][2]) / P[id][2]; }
    function hard(id, tol, why) {
      test('rfFH: ' + id + ' ' + P[id][0] + ': volume = SolidWorks ' + P[id][2].toFixed(6) + ' in³ to ' + (tol || TOL) + (why ? ' (' + why + ')' : ''), function () {
        var r = vol(id); noErrors(r);
        nearRel(r.mp.volume, P[id][2], tol || TOL, id + ' volume (Anvil vs SolidWorks)');
        return 'volume ' + r.mp.volume.toFixed(6) + ', rel ' + off(id).toExponential(2);
      });
    }
    function todo(id, why) {
      test('rfFH TODO: ' + id + ' ' + P[id][0] + ': SolidWorks volume ' + P[id][2].toFixed(6) + ' in³ (' + P[id][3] + ' faces); ' + why, function () {
        var r = vol(id), e = r.errors && r.errors.length ? '; errors: ' + r.errors.map(function (x) { return x.message || x; }).join(' | ') : '';
        var d = off(id);
        return Math.abs(d) <= TOL && !e ? 'matches SolidWorks now: promote to a hard test'
          : 'TODO Anvil ' + r.mp.volume.toFixed(6) + ' / SolidWorks ' + P[id][2].toFixed(6) + ' (rel ' + d.toExponential(2) + ')' + e;
      });
    }
    // exact today (planar or exact analytic surfaces)
    ['P01', 'P02', 'P04', 'P05', 'P08', 'P13', 'P14'].forEach(function (id) { hard(id); });
    hard('P07', 1e-5, 'rfFF2: each round rolls on into the earlier round its face blends into, trimmed by it, as SolidWorks');
    // lane FF: fillets on circular edges and the corner blends carry exact torus / sphere records
    ['P03', 'P06', 'P15', 'P16'].forEach(function (id) { hard(id, TOL, 'lane FF: exact fillet surfaces'); });
    // lane FH2: the sweep runs along the true arc (a revolve of the section, torus records), the Hole Wizard drills
    // SolidWorks' clearances (0.266 H for 1/4 Normal), the square → circle loft blends as SolidWorks does
    hard('P09', 1e-5, 'rel 2.5e-6 since lane FX: massProps bounds each curved facet correction at the cutting plane, so the inner fillet walls of the shell integrate right; was +2.2e-3');
    hard('P12', TOL, 'lane FH2: swept along the true arc');
    hard('P10', TOL, 'lane FH2: SolidWorks\' 1/4 Normal clearance, H 0.266');
    hard('P11', 2e-4, 'lane FH2: SolidWorks\' blend; the circle is sampled at 1.5°, about −5e-5');
  })();
