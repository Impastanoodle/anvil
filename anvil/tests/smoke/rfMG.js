  // --- rfMG (2026-11-12, lane importperf) --- "major freezes on complex 3d imported models", in the app. Measured on
  // the shop's heaviest STEP file (72 000 triangles with OpenCascade): one wheel notch froze the window a second and
  // zooming far in 132 s (the zoom refinement of curved faces walks every triangle of the part); Edit ▸ Rebuild with
  // nothing changed meshed the whole part twice (1.4 s frozen each) and had OpenCascade build it again for 17 s.
  // These steps count the work on a generated heavy body (a torus of 16 000 triangles as an imported mesh, never a
  // customer's geometry), so either coming back fails on any machine: a rebuild that leaves the solids alone makes no
  // new mesh, no new drawn geometry and asks nothing of OpenCascade (UI.sameSolidsStats), and the zoom refinement
  // keeps to its time budget (UI.zoomTess.info().over). Time bounds are generous.
  (function () {
    var rfMGS = { was: null };
    function rfMGCode(nu, nv) {
      return 'var P = [], T = [], nu = ' + nu + ', nv = ' + nv + ', R = 40, r = 12, i, j;\n' +
        'for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) { var a = 2 * Math.PI * i / nu, b = 2 * Math.PI * j / nv; P.push((R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)); }\n' +
        'function v(i, j) { return (i % nu) * nv + (j % nv); }\n' +
        'for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) T.push(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1));\n' +
        'p.importMesh({ name: "Imported1", solids: [{ name: "Torus", positions: P, triangles: T }] });\n';
    }
    // what is on screen: the mesh, the drawn geometry (the crack filler shares the body's), the edge list, the counts
    function rfMGShot() { var f = UI.getCrackFill(); return { mesh: UI.App.mesh, geom: f && f.geometry, edges: UI.App.edges, build: UI.App.build, stats: UI.sameSolidsStats() }; }
    function rfMGKept(a, b, what) {
      assert(b.mesh === a.mesh, what + ': the mesh was made again');
      assert(b.geom === a.geom, what + ': the drawn geometry was made again');
      assert(b.edges === a.edges, what + ': the edges were found again');
      assert(b.stats.full === a.stats.full, what + ': ' + (b.stats.full - a.stats.full) + ' full build(s) applied');
    }
    async function rfMGStart(occt) {
      if (rfMGS.was == null) rfMGS.was = anvil.occt().on;
      await anvil.newPart(); await idle();
      anvil.occt(!!occt, { remember: false }); await idle();
    }
    async function rfMGEnd() {
      if (rfMGS.was != null) { anvil.occt(rfMGS.was, { remember: false }); rfMGS.was = null; }
      await anvil.newPart(); await idle();
    }

    step('rfMG: a heavy imported body (16 000 triangles): Edit ▸ Rebuild with nothing changed keeps the mesh, the drawn part and the edges', async function () {
      try {
        await rfMGStart(false);
        await anvil.run(rfMGCode(100, 80)); await idle();
        assert(UI.App.mesh.triCount === 16000, UI.App.mesh.triCount + ' triangles');
        var a = rfMGShot(), t0 = performance.now();
        await UI.rebuild(); await idle();
        var ms = performance.now() - t0, b = rfMGShot();
        rfMGKept(a, b, 'Rebuild');
        assert(b.stats.same === a.stats.same + 1, 'the rebuild was taken as "the same solids" ' + (b.stats.same - a.stats.same) + ' times');
        assert(b.build !== a.build, 'the build record is the new one');
        assert(ms < 5000, 'the rebuild took ' + Math.round(ms) + ' ms');
        return 'rebuild ' + Math.round(ms) + ' ms, nothing meshed';
      } catch (err) { await rfMGEnd(); throw err; }
    });

    step('rfMG: a new sketch and three more rebuilds mesh nothing; the sketch is in the build and the tree', async function () {
      try {
        var a = rfMGShot(), n0 = UI.App.model.features.length;
        await anvil.append('p.sketch("Front").rect(0, 0, 5, 5).end();'); await idle();
        var b = rfMGShot(), sk = UI.App.model.features[n0];
        assert(UI.App.model.features.length === n0 + 1 && sk && sk.type === 'sketch', 'the sketch was added');
        rfMGKept(a, b, 'a new sketch');
        assert(b.build.profiles && b.build.profiles[sk.id], 'the build has the sketch profile');
        assert($('tree') && $('tree').textContent.indexOf(sk.name) >= 0, 'the tree shows ' + sk.name);
        for (var k = 0; k < 3; k++) { await UI.rebuild(); await idle(); }
        await UI.rebuild({ sync: true }); await idle();   // the main-thread path too
        var c = rfMGShot();
        rfMGKept(a, c, 'four more rebuilds');
        assert(c.stats.same >= a.stats.same + 5, 'same-solids rebuilds: ' + (c.stats.same - a.stats.same) + ' of 5');
        // the part is still the part: a face under the middle of the view, the mass as before
        var v = anvil.mass().volume, exact = 2 * Math.PI * Math.PI * 40 * 12 * 12;
        assert(v < exact && v > exact * 0.995, 'volume ' + v);
      } catch (err) { await rfMGEnd(); throw err; }
    });

    step('rfMG: a second body is a real change: meshed once, then kept again; undo brings the one body back', async function () {
      try {
        var a = rfMGShot();
        await anvil.append('p.sketch("Top").rect(200, 200, 10, 10).end().extrude(5);'); await idle();
        var b = rfMGShot();
        assert(b.mesh !== a.mesh && b.geom !== a.geom, 'the new body was not meshed');
        assert(b.stats.full === a.stats.full + 1, 'full builds applied: ' + (b.stats.full - a.stats.full));
        assert(anvil.bodies().length === 2, anvil.bodies().length + ' bodies');
        await UI.rebuild(); await idle();
        rfMGKept(b, rfMGShot(), 'the rebuild after it');
        UI.undo(); await idle();
        assert(anvil.bodies().length === 1 && UI.App.mesh.triCount === 16000, 'after undo: ' + anvil.bodies().length + ' bodies, ' + UI.App.mesh.triCount + ' triangles');
      } finally { await rfMGEnd(); }
    });

    step('rfMG: the zoom refinement of curved faces keeps to its time budget (left out, stopped, not tried again)', async function () {
      var O = UI.zoomTess.options, keep = { maxMs: O.maxMs, msPerTri: O.msPerTri };
      try {
        await rfMGStart(false);
        await anvil.run('p.units("mm");\np.sketch("Top").rect(-60, -60, 120, 120).end().extrude(6);\np.sketch("Top", 6).circle(0, 0, 30).end().cut("through", { reverse: true });\n' +
          'p.sketch("Top", 6).circle(-45, -45, 6).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 18, count: 6 });\n');
        await idle();
        anvil.view('Top'); UI.zoomToFit(); UI.zoomTess.setLevel(1);
        var free = null;   // no limit (tests): zoom in until the big hole is refined
        for (var z = 0; z < 5 && !(free && free.tris > free.baseTris); z++) { UI.zoomView(0.5); free = UI.zoomTess.now(); }
        assert(free && free.tris > free.baseTris, 'zoomed in, the hole is refined: ' + JSON.stringify(free));
        UI.zoomTess.enabled(false); UI.zoomTess.enabled(true);
        // 1. the estimate says it would take too long: not made at all
        var builds = O.builds;
        O.maxMs = 1e-6;
        var over = UI.zoomTess.now(true);
        assert(over && over.over && over.tris === over.baseTris, 'over the budget the plan is left out: ' + JSON.stringify(over));
        assert(O.builds === builds, 'and no display mesh was made');
        // 2. the estimate is wrong (far too low): the build stops itself, and this mesh is not tried again
        O.maxMs = 1e-4; O.msPerTri = 1e-12;
        var stopped0 = O.stopped, cut = UI.zoomTess.now(true);
        assert(cut && cut.over && cut.over.stopped && O.stopped === stopped0 + 1, 'the build stopped itself: ' + JSON.stringify(cut));
        assert(UI.getCrackFill().geometry.attributes.position.count === UI.App.mesh.triCount * 3, 'the kernel mesh is on screen');
        O.maxMs = keep.maxMs; O.msPerTri = keep.msPerTri;
        var again = UI.zoomTess.now(true);
        assert(again && again.over && again.over.stopped && O.stopped === stopped0 + 1 && O.builds === builds, 'not tried again on this mesh: ' + JSON.stringify(again));
        // 3. a display style change and a Section View do not bring it back
        UI.App.view.style = 'hlr'; UI.applyDisplayStyle(); await wait(400);
        UI.App.view.style = 'shadedEdges'; UI.applyDisplayStyle(); await wait(400);
        assert(O.builds === builds, 'a style change made ' + (O.builds - builds) + ' display mesh(es)');
        // the forced call still refines (the pin that the feature itself works)
        var forced = UI.zoomTess.now();
        assert(forced && forced.tris > forced.baseTris, 'forced: ' + JSON.stringify(forced));
      } finally { O.maxMs = keep.maxMs; O.msPerTri = keep.msPerTri; await rfMGEnd(); }
    });

    step('rfMG: the menus open a file without the summary (no mass properties on the main thread); the API still gets it', async function () {
      try {
        await rfMGStart(false);
        var stl = 'solid t\nfacet normal 0 0 -1\nouter loop\nvertex 0 0 0\nvertex 0 10 0\nvertex 10 0 0\nendloop\nendfacet\nfacet normal 0 -1 0\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 0 10\nendloop\nendfacet\n' +
          'facet normal -1 0 0\nouter loop\nvertex 0 0 0\nvertex 0 0 10\nvertex 0 10 0\nendloop\nendfacet\nfacet normal 1 1 1\nouter loop\nvertex 10 0 0\nvertex 0 10 0\nvertex 0 0 10\nendloop\nendfacet\nendsolid t\n';
        var light = await UI.openFileData('rfMG.stl', stl, { light: true }); await idle();
        assert(light && light.light && light.type === 'part' && light.volume == null, 'the light summary: ' + JSON.stringify(light));
        assert(UI.App.mesh.triCount === 4, UI.App.mesh.triCount + ' triangles');
        UI.markClean();
        var full = await anvil.importFile('rfMG.stl', stl); await idle();
        assert(full && Math.abs(full.volume - 1000 / 6) < 0.01, 'the API summary has the volume: ' + (full && full.volume));
        UI.markClean();
      } finally { await rfMGEnd(); }
    });

    step('rfMG: OpenCascade driving a STEP part read back from Anvil\'s own writer: a rebuild that changes nothing keeps its exact solid and asks the engine nothing', async function () {
      try {
        await rfMGStart(false);
        await anvil.run('p.units("mm");\np.sketch("Top").rect(0, 0, 120, 80).end().extrude(8);\np.sketch("Top", 8).circle(15, 15, 5).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 18, count: 6, dir2: "z", spacing2: 16, count2: 4, reverse2: true });\n');
        await idle();
        var step = anvil.exportStep(), text = typeof step === 'string' ? step : step && step.text;
        assert(text && /ISO-10303-21/.test(text), 'the part as STEP');
        UI.markClean();
        await rfMGStart(true);
        await anvil.importFile('rfMG.step', text); await idle();
        await Promise.race([anvil.occtIdle(), wait(25000)]);
        for (var k = 0; k < 60 && !UI.App.build.occt; k++) { await wait(250); await anvil.occtIdle(); }
        await idle();
        if (!UI.App.build.occt) return 'OpenCascade is not driving in this page (' + anvil.occt().state + '): not checked';
        var a = rfMGShot(), occ = UI.App.build.occt;
        await UI.rebuild();
        assert(!UI.occt.pending(), 'OpenCascade was asked to build the same part again');
        await idle(); await anvil.occtIdle();
        var b = rfMGShot();
        rfMGKept(a, b, 'Rebuild on OpenCascade');
        assert(UI.App.build.occt === occ && anvil.occt().state === 'ok', 'the exact solid stayed: ' + anvil.occt().state);
        await anvil.append('p.sketch("Front").rect(0, 0, 5, 5).end();'); await idle();
        assert(!UI.occt.pending(), 'a new sketch asked OpenCascade to build the part again');
        rfMGKept(a, rfMGShot(), 'a new sketch on OpenCascade');
        assert(UI.App.build.occt === occ, 'the exact solid stayed under the new sketch');
        UI.markClean();
      } finally { await rfMGEnd(); }
    });

    // the edges that are no chord of a circle by their key were tried against every circle of the part: 0.9 s of the
    // second the window froze each time OpenCascade's solid of the heavy file swapped in
    step('rfMG: edges are matched to the circles near them, not to every circle of the part (the work is counted), with the same answer', async function () {
      function sig() {
        var E = UI.App.edges, h = 0, n = 0;
        for (var i = 0; i < E.length; i++) { var e = E[i]; h = (h * 31 + ((e.curve == null ? -1 : e.curve) * 4 + (e.seam ? 2 : 0) + (e.smooth ? 1 : 0)) + i) | 0; if (e.curve != null) n++; }
        return { hash: h, onCurves: n, edges: E.length };
      }
      try {
        await rfMGStart(false);
        // a plate of 24 slots: 96 arcs, and the straight walls between their half cylinders (edges beside a curved face
        // that are no chord of a circle: the ones searched)
        await anvil.run('p.units("mm");\np.sketch("Top").rect(0, 0, 140, 100).end().extrude(10);\n' +
          'p.sketch("Top", 10).slot(12, 15, 20, 15, 6).end().cut("through", { reverse: true });\n' +
          'p.linearPattern({ dir: "x", spacing: 20, count: 6, dir2: "z", spacing2: 20, count2: 4, reverse2: true });\n');
        await idle();
        assert(!Object.keys(UI.App.build.errors || {}).length, JSON.stringify(UI.App.build.errors));
        var step = anvil.exportStep(), text = typeof step === 'string' ? step : step && step.text;
        UI.markClean();
        await rfMGStart(true);
        await anvil.importFile('rfMG.step', text); await idle();
        await Promise.race([anvil.occtIdle(), wait(12000)]);
        for (var k = 0; k < 20 && !UI.App.build.occt; k++) { await wait(250); await anvil.occtIdle(); }
        await idle();
        var st = UI.curveEdgeStats(), a = sig();
        assert(st && st.curves >= 60,'circles on the part: ' + JSON.stringify(st));
        if (!st.edges) return 'no edge needed the search on this engine (' + anvil.occt().state + '): ' + JSON.stringify(st);
        assert(st.tries <= st.edges * 12, 'each edge is tried against the circles near it: ' + JSON.stringify(st));
        UI.curveEdgeStats(true);   // every circle, as before the grid
        await UI.rebuild({ fresh: true }); await idle(); await Promise.race([anvil.occtIdle(), wait(8000)]); await idle();
        var all = UI.curveEdgeStats(), b = sig();
        assert(all.tries >= all.edges * all.curves, 'the switch tries every circle: ' + JSON.stringify(all));
        assert(a.hash === b.hash && a.onCurves === b.onCurves && a.edges === b.edges, 'the same edges on the same curves: ' + JSON.stringify(a) + ' / ' + JSON.stringify(b));
        UI.markClean();
        return st.edges + ' edges searched, ' + st.tries + ' tries (' + all.tries + ' against every circle), ' + a.onCurves + ' edges on ' + st.curves + ' curves';
      } finally { UI.curveEdgeStats(false); await rfMGEnd(); }
    });
  })();
  // --- end rfMG ---
