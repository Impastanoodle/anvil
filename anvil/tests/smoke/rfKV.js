  // --- rfKV (2026-11-11, lane occtperf) --- a perforated 16 ga panel on the OpenCascade engine (the app's default):
  // the holes are laid into the plate without a Boolean, the plate path's body skips the quadratic BRepCheck and its
  // perforated faces are triangulated by occt-kernel.js (kvEarcut). As a user sees it: the exact solid swaps in fast,
  // the volume is π r² T per hole less, and hovering then clicking a hole's rim on that mesh lights and selects the
  // whole circle. OpenCascade rows: "rfKV" in tests/occt-tests.html. Skipped without vendor/occt.
  function rfKVEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect(), press = type === 'mousedown';
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: press ? 1 : 0, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfKVScr(p) { var s = UI.worldToScreen(p); return [Math.round(s[0]), Math.round(s[1])]; }
  function rfKVLit() {
    var n = 0;
    UI.groups.highlight.children.forEach(function (o) { if (o.isLineSegments && o.geometry.attributes.position) n += o.geometry.attributes.position.count / 2; });
    return n;
  }
  step('rfKV: a 24 x 48 16 ga panel with 200 Ø.25 holes on OpenCascade: exact solid in seconds (no Boolean), π r² T per hole, a hole\'s rim hovered and clicked on its mesh lights and selects the whole circle (skipped without vendor/occt)', async function () {
    if (!anvil.workerOn || !anvil.workerOn()) return 'skipped: worker off';
    var was = anvil.occt().on, T = 0.0598, r = 0.125, code = 'p.units("in");\np.sketch("Top").rect(0, 0, 24, 48).end().extrude(' + T + ');\np.sketch("Top", ' + T + ')';
    for (var i = 0; i < 10; i++) for (var j = 0; j < 20; j++) code += '.circle(' + (2.1 + i * 2.2) + ', ' + (2.15 + j * 2.3) + ', ' + r + ')';
    code += '.end().cut("through", { reverse: true });\n';
    try {
      await anvil.newPart(); await idle();
      anvil.occt(true, { remember: false });
      var t0 = performance.now();
      await anvil.run(code); await idle();
      var st = await Promise.race([anvil.occtIdle(), wait(60000).then(function () { return anvil.occt(); })]);
      if (st.state === 'failed') return 'skipped: OpenCascade not installed';
      for (var k = 0; k < 80 && !UI.App.build.occt; k++) { await wait(250); await anvil.occtIdle(); }
      await idle();
      var ms = performance.now() - t0, oc = UI.App.build.occt;
      assert(oc, 'built by OpenCascade (' + JSON.stringify(anvil.occt()).slice(0, 160) + ')');
      var want = (24 * 48 - 200 * Math.PI * r * r) * T;
      assert(Math.abs(oc.volume - want) <= 1e-9 * want, 'OpenCascade volume ' + oc.volume + ', exact ' + want);
      assert(ms < 30000, 'the exact solid took ' + (ms / 1000).toFixed(1) + ' s');
      // a hole's rim, seen from above: the whole circle lights, then is selected
      UI.setRibbonTab('Features');
      UI.setView('Top'); UI.zoomToFit(); await idle(); await wait(60);
      var rim = [2.1 + r, T, -2.15], s = rfKVScr(rim);
      rfKVEv('mousemove', s); await idle(); await wait(40);
      var h = UI.App.hover;
      assert(h && h.kind === 'edge', 'hovering the rim pre-highlights an edge: ' + JSON.stringify(h && h.kind));
      var c = h.edge.curve != null && UI.App.curves && UI.App.curves[h.edge.curve];
      assert(c, 'the hovered edge is a true circle, not a lone chord ' + JSON.stringify(h.edge.a) + ' > ' + JSON.stringify(h.edge.b));
      var segs = c.pts.length - 1;
      assert(rfKVLit() === segs, 'the hover draws the whole circle (' + segs + ' segments), drew ' + rfKVLit());
      rfKVEv('mousedown', s, $('viewport')); rfKVEv('mouseup', s); await idle(); await wait(40);
      var sel = anvil.selection();
      assert(sel.length === 1 && sel[0].kind === 'edge', 'one edge selected: ' + JSON.stringify(sel.map(function (x) { return x.kind; })));
      assert(UI.App.sel.edge.curve === h.edge.curve, 'the selected edge is that circle');
      assert(UI.App.mesh.faces[0].polys[0].face != null, 'the mesh on screen is OpenCascade\'s');
      rfKVEv('mousemove', [5, 5]); await idle(); await wait(30);
      if (anvil.clearSelection) anvil.clearSelection(); await idle();
      return 'exact solid after ' + (ms / 1000).toFixed(1) + ' s, rim ' + segs + ' segments';
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
