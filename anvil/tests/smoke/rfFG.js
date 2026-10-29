  // --- rfFG (2026-10-29, lane FG: no stray triangles on solids; one circular edge) --- on Anvil's own engine a
  // boolean can leave sliver polygons that broke a face's outline (kernel-mesh.js faceOutline / bodyEdges): the edge
  // display drew a line straight across the face (a small triangle on a filleted wheel) or short "<" marks along
  // tangent fillet edges. And a revolved rim next to a hole had facet chords the curve record lists in pieces, so
  // hovering the rim lit one straight segment instead of the whole circle (ui-core.js annotateCurveEdges).
  function rfFGEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect(), press = type === 'mousedown';
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: press ? 1 : 0, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfFGScr(p) { var s = UI.worldToScreen(p); return [Math.round(s[0]), Math.round(s[1])]; }
  async function rfFGPart(code, view) {
    await anvil.newPart(); await idle();
    if (anvil.occt) anvil.occt(false, { remember: false });
    await anvil.run(code); await idle();
    UI.setRibbonTab('Features');
    UI.setView(view || 'Isometric'); UI.zoomToFit(); await idle(); await wait(60);
    assert(!Object.keys(UI.App.build.errors || {}).length, 'rebuild errors: ' + JSON.stringify(UI.App.build.errors));
  }
  // segments drawn by the highlight group (hover / selection lines)
  function rfFGLit() {
    var n = 0;
    UI.groups.highlight.children.forEach(function (o) { if (o.isLineSegments && o.geometry.attributes.position) n += o.geometry.attributes.position.count / 2; });
    return n;
  }
  // hover then click at a model point on an edge: the whole circle lights (orange), then is selected
  async function rfFGHoverCircle(p, label) {
    var s = rfFGScr(p);
    rfFGEv('mousemove', s); await idle(); await wait(40);
    var h = UI.App.hover;
    assert(h && h.kind === 'edge', label + ': hovering the rim pre-highlights an edge: ' + JSON.stringify(h && h.kind));
    var c = h.edge.curve != null && UI.App.curves && UI.App.curves[h.edge.curve];
    assert(c, label + ': the hovered edge is a true circle, not a lone chord ' + JSON.stringify(h.edge.a) + ' > ' + JSON.stringify(h.edge.b));
    var segs = c.pts.length - 1;
    assert(rfFGLit() === segs, label + ': the hover draws the whole circle (' + segs + ' segments), drew ' + rfFGLit());
    rfFGEv('mousedown', s, $('viewport')); rfFGEv('mouseup', s); await idle(); await wait(40);
    var sel = anvil.selection();
    assert(sel.length === 1 && sel[0].kind === 'edge', label + ': one edge selected: ' + JSON.stringify(sel.map(function (x) { return x.kind; })));
    assert(UI.App.sel.edge.curve === h.edge.curve, label + ': the selected edge is that circle');
    rfFGEv('mousemove', [5, 5]); await idle(); await wait(30);
    assert(rfFGLit() >= segs, label + ': the selection keeps the whole circle lit: ' + rfFGLit());
    if (anvil.clearSelection) anvil.clearSelection(); await idle();
    return segs;
  }

  step('rfFG: a filleted, dished wheel on Anvil\'s engine draws no stray edges: every drawn edge joins two faces, none is shorter than 1e-4 of the size, no face is a sliver', async function () {
    await rfFGPart('p.units("in");\n' +
      'p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
      'var a = Math.asin((1.5-5)/4.1), x1 = 4.1*Math.cos(a);\n' +
      'p.sketch("Front").arc(0,5,4.1,-90,a*180/Math.PI).line(x1,1.5,x1,2).line(x1,2,0,2).line(0,2,0,0.9).revolveCut(360);\n' +
      'p.sketch("Front").arc(0,0.9,0.3,-90,90).line(0,1.2,0,0.6).revolveCut(360);\n' +
      'p.fillet(0.25,[[3,1.5,0]]);\np.fillet(0.15,[[x1,1.5,0]]);\np.fillet(0.1,[[3,0,0]]);\n' +
      'p.sketch("Top",1.0).circle(0,0,1.3).circle(0,0,0.8).end();');
    var m = UI.App.mesh, E = UI.App.edges, tot = m.faces.reduce(function (s, f) { return s + f.area; }, 0);
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], P = m.positions;
    for (var i = 0; i < P.length; i += 3) for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
    var diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    var tiny = m.faces.filter(function (f) { return f.area < 1e-6 * tot; }).length;
    assert(tiny === 0, tiny + ' sliver faces');
    var drawn = E.filter(function (e) { return !e.smooth; });
    var lone = drawn.filter(function (e) { return e.faces.length !== 2; });
    assert(lone.length === 0, lone.length + ' drawn edges with one face (a broken outline), e.g. ' + JSON.stringify(lone[0] && [lone[0].a, lone[0].b]));
    var short = drawn.filter(function (e) { return e.len < 1e-4 * diag; });
    assert(short.length === 0, short.length + ' drawn edges shorter than 1e-4 of the diagonal');
    // the model-edge lines in the viewport (the first child; silhouettes come after it) are exactly the drawn edges
    // (curves once, straight edges one segment each)
    var lines = UI.groups.edges.children[0], segs = lines && lines.geometry.attributes.position ? lines.geometry.attributes.position.count / 2 : -1;
    var want = drawn.filter(function (e) { return e.curve == null; }).length, seen = {};
    drawn.forEach(function (e) { if (e.curve != null && !seen[e.curve]) { seen[e.curve] = 1; want += UI.App.curves[e.curve].pts.length - 1; } });
    assert(segs === want, 'edge lines in the viewport: ' + segs + ', the drawn edges make ' + want);
    assert(UI.groups.sketches.children.length > 0, 'the sketch on the dish floor is shown');
    return m.faces.length + ' facets, ' + drawn.length + ' drawn edges';
  });

  step('rfFG: hovering a hole\'s rim seen head-on lights the whole circle (orange) and a click selects it; the same on a revolved rim next to a hole', async function () {
    await rfFGPart('p.units("in");\np.sketch("Top").rect(-3,-2,6,4).extrude(0.5);\np.sketch("Top",0.5).circle(0,0,1).end().extrude(0.5,{cut:true,reverse:true});', 'Top');
    var a = await rfFGHoverCircle([1, 0.5, 0], 'hole Ø2');
    // a revolved disc with a hole and a rim fillet, seen from below: the bottom rim's chords near the hole were split
    // in the curve record and each hovered as a lone segment
    await rfFGPart('p.units("in");\np.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
      'p.sketch("Top",1.5).circle(1.5,0,0.4).end().extrude(1.5,{cut:true,reverse:true});\np.fillet(0.25,[[3,1.5,0]]);', 'Bottom');
    var t = 8 * Math.PI / 180, b = await rfFGHoverCircle([3 * Math.cos(t), 0, 3 * Math.sin(t)], 'revolved rim');
    var loose = UI.App.edges.filter(function (e) { return !e.smooth && e.curve == null && Math.abs(Math.hypot(e.a[0], e.a[2]) - 3) < 1e-3 && Math.abs(Math.hypot(e.b[0], e.b[2]) - 3) < 1e-3; });
    assert(loose.length === 0, loose.length + ' chords of the R3 rims are not part of their circle');
    return 'hole ' + a + ' segments, rim ' + b;
  });
