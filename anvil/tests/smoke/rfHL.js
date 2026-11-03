  // ---- rfHL (2026-11-03, lane loft-face) — user: the Trumpet Funnel (Design Library) "looks broken": short dark lines on
  // its flare with OpenCascade on. They were the tangent seams between the loft's four quarter faces, drawn where the
  // coarse mesh turned by more than 22° across them. Now a loft through full circles has one side face on OpenCascade
  // (3 faces, as SolidWorks), and any edge OpenCascade finds tangent is never drawn (build.occt.tangent → edgesFor);
  // real corners (a loft through squares) still draw. Each step runs with OpenCascade off (Anvil's kernel) and on.
  var RFHL_U = 'p.units("in");\n';
  var RFHL_FUNNEL = RFHL_U + 'var a = p.sketch("Top").circle(0, 0, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 0.9).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 0.5).id();\np.loft([a, b, c]);\n';
  var RFHL_SLOTS = RFHL_U + 'var a = p.sketch("Top").slot(-1, 0, 1, 0, 0.5).id();\nvar b = p.sketch("Top", 2).slot(-0.5, 0, 0.5, 0, 0.25).id();\nvar c = p.sketch("Top", 4).slot(-1, 0, 1, 0, 0.4).id();\np.loft([a, b, c]);\n';
  var RFHL_SQUARES = RFHL_U + 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 2).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 4).centerRect(0, 0, 3, 3).id();\np.loft([a, b, c]);\n';
  // run code with OpenCascade on (true: its solid is shown) or off; false when OpenCascade is not installed
  async function rfHLRun(code, occt) {
    anvil.occt(occt, { remember: false });
    await anvil.run(code); await idle();
    if (!occt) return true;
    var st = await Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]);
    if (st.state === 'failed') return false;
    for (var k = 0; k < 40 && !UI.App.build.occt; k++) { await wait(250); await anvil.occtIdle(); }
    await idle();
    assert(UI.App.build.occt, 'built by OpenCascade (' + JSON.stringify(anvil.occt()).slice(0, 160) + ')');
    return true;
  }
  // the model edges the viewport draws (not smooth, visible), split into rim edges (in y = 0 or y = 4) and the rest
  function rfHLDrawn() {
    var all = UI.App.edges.filter(function (e) { return !e.smooth; }), off = all.filter(function (e) {
      return ![0, 4].some(function (y) { return Math.abs(e.a[1] - y) < 1e-5 && Math.abs(e.b[1] - y) < 1e-5; });
    });
    return { all: all, off: off };
  }
  step('rfHL: the Trumpet Funnel draws only its two rims on Anvil\'s kernel and on OpenCascade, where its side is one face (3 faces) picked whole', async function () {
    var was = anvil.occt().on, notes = [];
    try {
      await rfHLRun(RFHL_FUNNEL, false);
      var d = rfHLDrawn();
      assert(d.all.length > 0 && !d.off.length, 'Anvil: ' + d.off.length + ' edges drawn on the flare (first at ' + (d.off[0] && JSON.stringify(d.off[0].mid)) + ')');
      notes.push('Anvil ' + d.all.length + ' rim edges');
      if (!await rfHLRun(RFHL_FUNNEL, true)) return notes.join('; ') + '; OpenCascade not installed';
      assert(anvil.occt().faces === 3, 'OpenCascade faces ' + anvil.occt().faces + ' (one side face and two caps, as SolidWorks)');
      d = rfHLDrawn();
      assert(d.all.length > 0 && !d.off.length, 'OpenCascade: ' + d.off.length + ' edges drawn on the flare (first at ' + (d.off[0] && JSON.stringify(d.off[0].mid)) + ')');
      // the side: every mesh face off the cap planes is in one face group
      var m = UI.App.mesh, side = [];
      m.faces.forEach(function (f, i) { if (Math.abs(f.normal[1]) < 0.999) side.push(i); });
      var g = UI.faceGroup(side[0]);
      assert(side.every(function (i) { return g.indexOf(i) >= 0; }), 'side picked whole: group ' + g.length + ' of ' + side.length);
      notes.push('OpenCascade ' + d.all.length + ' rim edges, side group ' + g.length);
      return notes.join('; ');
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
  step('rfHL: a loft through three slots: OpenCascade\'s line / arc faces meet tangent, so none of their seams is drawn (only the rims), on both kernels', async function () {
    var was = anvil.occt().on;
    try {
      await rfHLRun(RFHL_SLOTS, false);
      var d = rfHLDrawn();
      assert(!d.off.length, 'Anvil: ' + d.off.length + ' edges drawn on the side');
      if (!await rfHLRun(RFHL_SLOTS, true)) return 'Anvil only (OpenCascade not installed)';
      var tan = UI.App.build.occt.tangent || {}, pairs = Object.keys(tan);
      assert(pairs.length >= 4, 'tangent face pairs found by OpenCascade: ' + pairs.join(' '));
      d = rfHLDrawn();
      assert(!d.off.length, 'OpenCascade: ' + d.off.length + ' edges drawn on the side (first at ' + (d.off[0] && JSON.stringify(d.off[0].mid)) + ')');
      var tEdges = UI.App.edges.filter(function (e) { return e.tangent; }).length;
      return pairs.length + ' tangent face pairs, ' + tEdges + ' mesh edges on tangent seams (never drawn), ' + d.all.length + ' rim edges';
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
  step('rfHL: a loft through three squares keeps its four corner edges drawn the whole height on both kernels and draws nothing else on its sides (no tangent pairs, no diagonals on OpenCascade)', async function () {
    var was = anvil.occt().on;
    // drawn height along each corner line (|x| = |z|), and the edges drawn elsewhere on the sides: on OpenCascade's mesh
    // Kernel.meshFromBody used to join nearly coplanar triangles of one B-rep face that only share a corner and
    // re-project them, so 68 of their edges stopped pairing up and drew as diagonals (fixed: rfHL coplanarComponents)
    function heights(who) {
      var h = {}, stray = 0;
      rfHLDrawn().off.forEach(function (e) {
        if (Math.abs(Math.abs(e.a[0]) - Math.abs(e.a[2])) > 1e-3 || Math.abs(Math.abs(e.b[0]) - Math.abs(e.b[2])) > 1e-3) { stray++; return; }
        var k = (e.mid[0] > 0 ? '+' : '-') + (e.mid[2] > 0 ? '+' : '-');
        h[k] = (h[k] || 0) + Math.abs(e.b[1] - e.a[1]);
      });
      ['++', '+-', '-+', '--'].forEach(function (k) { assert((h[k] || 0) >= 4 - 1e-4, who + ' corner ' + k + ' drawn height ' + h[k]); });
      return stray;
    }
    try {
      await rfHLRun(RFHL_SQUARES, false);
      var sa = heights('Anvil');
      assert(!sa, 'Anvil: ' + sa + ' edges drawn off the corners');
      if (!await rfHLRun(RFHL_SQUARES, true)) return 'Anvil only (OpenCascade not installed)';
      assert(!Object.keys(UI.App.build.occt.tangent || {}).length, 'no tangent pairs: ' + Object.keys(UI.App.build.occt.tangent || {}).join(' '));
      var so = heights('OpenCascade');
      assert(!so, 'OpenCascade: ' + so + ' edges drawn off the corners');
      return 'corners drawn on both kernels, nothing else';
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
  step('rfHL: a square-to-round transition (6 × 6 square to Ø3 circle, 4 in) draws no diagonal lines on its sides on either kernel: only the rims and the four corner-to-circle edges', async function () {
    var was = anvil.occt().on, notes = [];
    try {
      for (var pass = 0; pass < 2; pass++) {
        if (!await rfHLRun(RFHL_U + 'var a = p.sketch("Top").centerRect(0, 0, 6, 6).id();\nvar b = p.sketch("Top", 4).circle(0, 0, 1.5).id();\np.loft([a, b]);\n', pass === 1)) { notes.push('OpenCascade not installed'); break; }
        var who = pass ? 'OpenCascade' : 'Anvil', m = UI.App.mesh, d = rfHLDrawn();
        // open / T-junction edges are what drew as stray diagonals
        var open = UI.App.edges.filter(function (e) { return e.faces.length !== 2; }).length;
        assert(!open, who + ': ' + open + ' edges with one face');
        // every side edge drawn runs from a square corner (|x| = |z| = 3 at y 0) to the circle (r 1.5 at y 4)
        var bad = d.off.filter(function (e) {
          var lo = e.a[1] < e.b[1] ? e.a : e.b, hi = lo === e.a ? e.b : e.a;   // on a ruling from a corner to the circle's 45° point
          return !(Math.abs(Math.abs(lo[0]) - Math.abs(lo[2])) < 1e-3 && Math.abs(Math.abs(hi[0]) - Math.abs(hi[2])) < 1e-3);
        });
        assert(!bad.length, who + ': ' + bad.length + ' side edges off the corner rulings, first ' + (bad[0] && JSON.stringify([bad[0].a, bad[0].b])));
        notes.push(who + ' ' + d.off.length + ' corner edges, ' + m.faces.length + ' mesh faces');
      }
      return notes.join('; ');
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
  // ---- rfHL tangent edges (user: "add lines in anvil's shaded with lines visible mode", a SolidWorks Shaded With Edges
  // screenshot of a filleted plate): View ▸ Display ▸ Tangent Edges Visible (default) / As Phantom / Removed, drawn
  // between two different faces only. The test page starts at Removed (older pixel tests unchanged); each step sets
  // the mode it checks and puts Removed back.
  var RFHL_PLATE = 'p.name("Rounded Plate").units("in");\np.sketch("Top").rect(-3, -2, 6, 4).extrude(0.5);\np.fillet(1, [[3, 0.25, 2], [-3, 0.25, 2], [3, 0.25, -2], [-3, 0.25, -2]]);\np.sketch("Top", 0.5).circle(0, 0, 0.5).cut("through");\np.fillet(0.125, [[0, 0.5, 2]]);\n';
  function rfHLHasLine(list, test) { return list.some(function (e) { return test(e.a) && test(e.b); }); }
  step('rfHL: Tangent Edges Visible: the Rounded Plate draws its fillet boundaries (top round onto the top face and the sides, corner rounds onto the sides) as thin lines on both kernels; none inside one face', async function () {
    var was = anvil.occt().on, notes = [];
    try {
      UI.setTangentEdges('visible');
      for (var pass = 0; pass < 2; pass++) {
        var occt = pass === 1;
        if (!await rfHLRun(RFHL_PLATE, occt)) { notes.push('OpenCascade not installed'); break; }
        var who = occt ? 'OpenCascade' : 'Anvil', list = UI.tangentEdgeList(), tl = UI.tangentLines();
        assert(list.length > 0 && tl && tl.visible && tl.material === UI.mats.tanEdge, who + ': tangent lines drawn (' + list.length + ')');
        assert(tl.material.userData.lineWidth < UI.mats.edge.userData.lineWidth, who + ': thinner than model edges');
        // the top round R1/8 meets the top face (y 0.5) at z = ±(2 − 1/8) and the front side (z 2) at y = 0.5 − 1/8
        assert(rfHLHasLine(list, function (p) { return Math.abs(p[1] - 0.5) < 1e-6 && Math.abs(p[2] - 1.875) < 1e-4 && Math.abs(p[0]) < 2.01; }), who + ': top round onto the top face');
        assert(rfHLHasLine(list, function (p) { return Math.abs(p[2] - 2) < 1e-6 && Math.abs(p[1] - 0.375) < 1e-4; }), who + ': top round onto the front side');
        // a corner round R1 (axis at x = ±2, z = ±1) runs onto the front side along x = ±2
        assert(rfHLHasLine(list, function (p) { return Math.abs(Math.abs(p[0]) - 2) < 1e-4 && Math.abs(p[2] - 2) < 1e-4 && p[1] < 0.376; }), who + ': corner round onto the front side');
        // never between facets of one face: both faces of every tangent edge in different face groups
        list.forEach(function (e) { assert(UI.faceGroup(e.faces[0]).indexOf(e.faces[1]) < 0, who + ': a tangent edge inside one face at ' + JSON.stringify(e.mid)); });
        notes.push(who + ' ' + list.length + ' tangent edges');
      }
      return notes.join('; ');
    } finally { UI.setTangentEdges('removed'); anvil.occt(was, { remember: false }); await idle(); }
  });
  step('rfHL: Tangent Edges Visible draws nothing on a plain cylinder (facets of one face) or on the Trumpet Funnel (one side face), on both kernels', async function () {
    var was = anvil.occt().on, notes = [];
    try {
      UI.setTangentEdges('visible');
      var parts = { cylinder: RFHL_U + 'p.sketch("Top").circle(0, 0, 1).extrude(4);\n', funnel: RFHL_FUNNEL };
      for (var pass = 0; pass < 2; pass++) {
        for (var k in parts) {
          if (!await rfHLRun(parts[k], pass === 1)) { notes.push('OpenCascade not installed'); pass = 2; break; }
          var list = UI.tangentEdgeList();
          assert(!list.length && !UI.tangentLines(), (pass ? 'OpenCascade' : 'Anvil') + ' ' + k + ': ' + list.length + ' tangent edges, first at ' + (list[0] && JSON.stringify(list[0].mid)));
          var d = rfHLDrawn();
          assert(!d.off.length, k + ': ' + d.off.length + ' model edges off the rims');
        }
      }
      return notes.join('; ') || 'none drawn';
    } finally { UI.setTangentEdges('removed'); anvil.occt(was, { remember: false }); await idle(); }
  });
  step('rfHL: Tangent Edges As Phantom draws them dashed, Removed draws none, Shaded hides them; View ▸ Display lists the three; the choice is remembered (anvil.tangentEdges)', async function () {
    var was = anvil.occt().on, saved = null, style = UI.App.view.style;
    try { saved = W.localStorage.getItem('anvil.tangentEdges'); } catch (e) { }
    try {
      await rfHLRun(RFHL_PLATE, false);
      UI.setTangentEdges('phantom');
      var tl = UI.tangentLines();
      assert(tl && tl.material === UI.mats.tanPhantom && tl.material.isLineDashedMaterial, 'phantom: dashed lines');
      assert(tl.geometry.attributes.lineDistance, 'line distances for the dashes');
      UI.setTangentEdges('removed');
      assert(!UI.tangentLines() && UI.tangentEdgeList().length > 0, 'removed: no lines (the edges are still tangent edges)');
      var rows = UI.tangentEdgesMenuItems('Display ▸ ').map(function (r) { return r.label; });
      assert(rows.join('|') === 'Display ▸ Tangent Edges Visible|Display ▸ Tangent Edges As Phantom|Display ▸ Tangent Edges Removed', 'menu rows ' + rows.join('|'));
      assert(UI.tangentEdgesMenuItems()[2].checked, 'Removed checked');
      UI.setTangentEdges('visible');
      UI.setStyle('shaded');
      assert(!UI.tangentLines().visible, 'hidden in Shaded');
      UI.setStyle('shadedEdges');
      assert(UI.tangentLines().visible, 'shown in Shaded With Edges');
      UI.tangentEdgesPersistInTest = true;
      UI.setTangentEdges('phantom');
      assert(W.localStorage.getItem('anvil.tangentEdges') === 'phantom', 'stored: ' + W.localStorage.getItem('anvil.tangentEdges'));
      return 'phantom, removed, shaded, visible; stored';
    } finally {
      UI.tangentEdgesPersistInTest = false;
      try { if (saved == null) W.localStorage.removeItem('anvil.tangentEdges'); else W.localStorage.setItem('anvil.tangentEdges', saved); } catch (e) { }
      UI.setTangentEdges('removed'); UI.setStyle(style); anvil.occt(was, { remember: false }); await idle();
    }
  });
