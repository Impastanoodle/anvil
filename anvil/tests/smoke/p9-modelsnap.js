  // --- p9-modelsnap: sketch points snap onto the model (ui-sketch.js modelSnaps / inferPoint): vertices, edge midpoints,
  // hole centres, face centres, the part centre, on a model edge; no relations; View ▸ Snap to Model turns it off
  // a 100 × 60 × 10 box (corner on the origin, Front sketch extruded +Z) with a Ø10 through hole at (20, 10), and a
  // sketch named nm (holding one point at (100, 0)) on plane spec; opened for editing at 0.25 mm per pixel
  async function msBox(spec, nm) {
    await anvil.newPart(); await idle();
    await anvil.run('p.name("SnapBox"); var b = p.sketch("Front").rect(0, 0, 100, 60).extrude(10, { name: "Box" }).last();\n' +
      'p.sketch("Front").circle(20, 10, 5).cut("through", { name: "Hole" });\n' +
      'p.sketch(' + spec + ', "' + nm + '").point(100, 0);'); await idle();
    assert(!Object.keys(UI.App.build.errors || {}).length, 'build errors ' + JSON.stringify(UI.App.build.errors));
    var f = UI.App.model.features.filter(function (g) { return g.name === nm; })[0];
    UI.editSketch(f.id); await idle();
    assert(UI.App.mode === 'sketch', 'not in the sketch');
    UI.zoomView(0.25 / UI.cam.scale); saPanTo([50, 30], 0.5, 0.5); await wait(30);
    return f;
  }
  function msAt(uv, dx, dy) { var s = rskScr(uv); return saInfer([s[0] + dx, s[1] + dy]); }
  function msSame(p, q) { return Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9; }
  step('p9-modelsnap: in a sketch on the front face of a box with a hole, the cursor a few pixels off snaps exactly to the face centre (Face center), a corner (Vertex), an edge midpoint (Midpoint), the hole centre (Center) and onto an edge (On edge); the sketch\'s own point wins over the model corner under it; Snap to Model off: none of them', async function () {
    var f = await msBox('{ face: b, normal: [0, 0, 1] }, 0', 'OnFace');
    UI.setTool('line');
    var mc = UI.sketchModelSnaps();
    assert(mc && mc.pts.length, 'no model snap points');
    // the face's area centroid: the 100 × 60 rectangle less the Ø10 hole (exact circle, not its facets)
    var Ah = Math.PI * 25, A = 6000 - Ah, fx = (6000 * 50 - Ah * 20) / A, fy = (6000 * 30 - Ah * 10) / A;
    var fcs = mc.pts.filter(function (c) { return c.kind === 'mface'; });
    var fcN = fcs.filter(function (c) { return Math.hypot(c.pt[0] - fx, c.pt[1] - fy) < 1e-6; })[0];
    assert(fcN, 'face centre (' + fx + ', ' + fy + ') among ' + JSON.stringify(fcs.map(function (c) { return c.pt; })));
    var a = msAt(fcN.pt, 4, -3);
    assert(a.snap && a.snap.kind === 'mface' && a.snap.model && a.p[0] === fcN.pt[0] && a.p[1] === fcN.pt[1], 'face centre: ' + JSON.stringify(a.snap) + ' ' + a.p);
    var v = msAt([0, 60], 4, 3);
    assert(v.snap && v.snap.kind === 'mvertex' && msSame(v.p, [0, 60]), 'corner: ' + JSON.stringify(v.snap));
    var md = msAt([50, 0], 2, 3);
    assert(md.snap && md.snap.kind === 'mmid' && msSame(md.p, [50, 0]), 'bottom edge midpoint: ' + JSON.stringify(md.snap));
    var hc = msAt([20, 10], 3, 2);
    assert(hc.snap && hc.snap.kind === 'mcenter' && msSame(hc.p, [20, 10]), 'hole centre: ' + JSON.stringify(hc.snap));
    var hq = msAt([25, 10], 2, -2);
    assert(hq.snap && hq.snap.kind === 'mquad' && msSame(hq.p, [25, 10]), 'hole quadrant: ' + JSON.stringify(hq.snap));
    var pc = mc.pts.filter(function (c) { return c.kind === 'mpart'; })[0];
    assert(pc && msSame(pc.pt, [50, 30]), 'part centre ' + JSON.stringify(pc));
    var oe = msAt([73, 60], 1, 4);
    assert(oe.snap && oe.snap.kind === 'medge' && Math.abs(oe.p[1] - 60) < 1e-9 && Math.abs(oe.p[0] - 73) < 1, 'on the top edge: ' + JSON.stringify(oe.snap) + ' ' + oe.p);
    var oc = msAt([20 + 5 * Math.cos(1), 10 + 5 * Math.sin(1)], 3, 0);
    assert(oc.snap && oc.snap.kind === 'medge' && Math.abs(Math.hypot(oc.p[0] - 20, oc.p[1] - 10) - 5) < 1e-9, 'on the hole: ' + JSON.stringify(oc.snap) + ' ' + oc.p);
    // the sketch point at (100, 0) sits on the model corner: the sketch point wins
    var sp = msAt([100, 0], 2, 2);
    assert(sp.snap && !sp.snap.model && sp.snap.kind !== 'mvertex' && msSame(sp.p, [100, 0]), 'sketch point first: ' + JSON.stringify(sp.snap));
    // feedback: the model colour ring and a label, no relation glyph
    var s0 = rskScr(fcN.pt);
    selEv('mousemove', [s0[0] + 4, s0[1] - 3]); await wait(70);
    var lay = sfLayer(), lab = lay && lay.querySelector('.sk-snap-label');
    assert(lay && lay.querySelector('circle.sk-model-snap') && lab && lab.textContent === 'Face center' && !lay.querySelector('.rel-badge'), 'feedback: ' + (lay && lay.innerHTML.slice(0, 300)));
    // Snap to Model off
    UI.App.view.snapModel = false;
    try {
      [[fcN.pt, 4, -3], [[0, 60], 4, 3], [[50, 0], 2, 3], [[20, 10], 3, 2], [[73, 60], 1, 4]].forEach(function (t) {
        var r = msAt(t[0], t[1], t[2]);
        assert(!(r.snap && r.snap.model) && !(r.snap && /^m/.test(r.snap.kind)), 'snapped with Snap to Model off at ' + t[0] + ': ' + JSON.stringify(r.snap));
      });
      assert(!UI.sketchModelSnaps(), 'no model snaps when off');
    } finally { UI.App.view.snapModel = true; }
    selKey('Escape'); UI.exitSketch(true); await idle();
    return 'face centre (' + fcN.pt.map(function (x) { return x.toFixed(4); }) + '), ' + mc.pts.length + ' model points, ' + mc.segs.length + ' edges, ' + mc.arcs.length + ' arcs';
  });
  step('p9-modelsnap: a Line clicked from the face centre to a model corner has exactly those ends; the corner end is Coincident with the corner brought in as reference geometry that follows the model (lane sketchref; the face centre adds none); a sketch on the Front plane 20 mm above the box snaps to the projected hole centre and corner too', async function () {
    var f = await msBox('{ face: b, normal: [0, 0, 1] }, 0', 'OnFace');
    var fc = UI.sketchModelSnaps().pts.filter(function (c) { return c.kind === 'mface'; })[0];
    var r0 = (f.rels || []).length, n0 = f.entities.length;
    UI.setTool('line');
    var a = rskScr(fc.pt), b = rskScr([0, 60]);
    selClick([a[0] + 3, a[1] + 2]); selClick([b[0] + 4, b[1] - 3]); selKey('Escape'); selKey('Escape'); await idle();
    var e = f.entities;
    assert(e.length === n0 + 2 && e[n0].t === 'line' && e[n0 + 1].t === 'point' && e[n0 + 1].construction, 'one line and the corner as a reference point: ' + JSON.stringify(e));
    assert(e[n0].x1 === fc.pt[0] && e[n0].y1 === fc.pt[1] && msSame([e[n0].x2, e[n0].y2], [0, 60]), 'ends ' + JSON.stringify(e[n0]));
    var added = (f.rels || []).slice(r0);
    assert(added.length === 2 && added.some(function (r) { return r.type === 'fix' && r.mref && r.mref.k === 'vertex'; }) && added.some(function (r) { return r.type === 'coincident' && r.refs.indexOf(n0 + '.p2') >= 0; }), 'relations added: ' + JSON.stringify(added));
    UI.exitSketch(true); await idle();
    // a standard plane above the solid: points project straight onto it
    await msBox('"Front", 20', 'Above');
    UI.setTool('line');
    var hc = msAt([20, 10], 3, -2), v = msAt([100, 60], -3, -4), fz = msAt([50, 30], 0, 0);
    assert(hc.snap && hc.snap.kind === 'mcenter' && msSame(hc.p, [20, 10]), 'hole centre from above: ' + JSON.stringify(hc.snap));
    assert(v.snap && v.snap.kind === 'mvertex' && msSame(v.p, [100, 60]), 'corner from above: ' + JSON.stringify(v.snap));
    assert(fz.snap && fz.snap.model, 'part centre from above: ' + JSON.stringify(fz.snap));
    selKey('Escape'); UI.exitSketch(true); await idle();
    return 'line (' + e[n0].x1.toFixed(3) + ', ' + e[n0].y1.toFixed(3) + ') → (0, 60), no relations; above: ' + hc.snap.kind + ', ' + v.snap.kind + ', ' + fz.snap.kind;
  });
  // --- end p9-modelsnap ---
