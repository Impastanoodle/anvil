  // --- rfGS (2026-11-02, lane sketch-derive): Intersection Curve from a selected plane with no sketch open, Create Sketch
  // from Selections, Derived Sketch and Underive. Self-contained; uses anvil, UI, idle, wait, assert, near, pmAccept.
  var RFGS_BLOCK = 'p.sketch("Top").rect(-20, -10, 40, 20).extrude(10);';   // x -20..20, y 0..10, z -10..10
  function rfGSFeature(name) { return UI.App.model.features.filter(function (f) { return f.name === name; })[0]; }
  function rfGSRects(f) { return f.entities.filter(function (e) { return e.t === 'rect'; }); }
  async function rfGSExit() { UI.exitSketch(); await idle(); }

  step('rfGS: Intersection Curve with Top Plane and a Ø10 hole wall selected and no sketch open opens a sketch on the plane; the hole square to it gives one exact circle R5; with Front Plane through its axis, two exact lines', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -20, 40, 40).extrude(10, { midplane: true }); p.sketch("Top").circle(0, 0, 5).cut("through", { midplane: true });'); await idle();
    var M = UI.App.mesh, cyl = -1;
    M.faces.forEach(function (fc, i) { var q = fc.polys && fc.polys[0]; if (cyl < 0 && q && q.surf && q.surf.s && q.surf.s.t === 'cyl') cyl = i; });
    assert(cyl >= 0, 'the hole wall is a cylinder face');
    UI.setSelection([{ kind: 'plane', ref: 'Top' }, { kind: 'face', index: cyl }]);
    await UI.cmdIntersectionCurve(); await wait(20);
    assert(UI.App.mode === 'sketch' && UI.pmTitle() === 'Intersection Curve', 'a sketch opened with the command: ' + UI.App.mode + ' ' + UI.pmTitle());
    assert(UI.activeSketchFeature().plane.ref === 'Top', 'the sketch is on Top Plane');
    await pmAccept();
    var f = UI.activeSketchFeature(), c = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(c.length === 1 && f.entities.length === 1, 'one circle: ' + JSON.stringify(f.entities));
    near(c[0].r, 5, 1e-9, 'R5'); near(c[0].cx, 0, 1e-9, 'centre x'); near(c[0].cy, 0, 1e-9, 'centre y');
    await rfGSExit();
    // the same wall cut by the Front plane through its axis: two straight lines the hole's length (it runs 5 up from the plane)
    UI.setSelection([{ kind: 'plane', ref: 'Front' }, { kind: 'face', index: cyl }]);
    await UI.cmdIntersectionCurve(); await wait(20);
    await pmAccept();
    var g = UI.activeSketchFeature(), ln = g.entities.filter(function (e) { return e.t === 'line'; });
    assert(ln.length === 2 && g.entities.length === 2, 'two lines: ' + JSON.stringify(g.entities));
    ln.forEach(function (e) { near(Math.hypot(e.x2 - e.x1, e.y2 - e.y1), 5, 1e-6, 'a line 5 long'); near(Math.abs(e.x1), 5, 1e-6, 'at the wall'); near(Math.abs(e.x2), 5, 1e-6, 'at the wall'); });
    await rfGSExit();
    // nothing selected, no sketch: a plain sentence and no sketch
    UI.setSelection([]);
    var n0 = UI.App.model.features.length;
    await UI.cmdIntersectionCurve(); await wait(10);
    assert(UI.App.mode !== 'sketch' && UI.App.model.features.length === n0, 'no sketch was made');
    return 'circle R' + c[0].r + ', lines ' + ln.length;
  });

  step('rfGS: Intersection Curve — a half cylinder boss square to the sketch gives one exact arc R8', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").arc(0, 0, 8, 0, 180).line(-8, 0, 8, 0).extrude(10, { midplane: true });'); await idle();
    var M = UI.App.mesh, cyl = -1;
    M.faces.forEach(function (fc, i) { var q = fc.polys && fc.polys[0]; if (cyl < 0 && q && q.surf && q.surf.s && q.surf.s.t === 'cyl') cyl = i; });
    assert(cyl >= 0, 'the curved face is a cylinder');
    UI.setSelection([{ kind: 'plane', ref: 'Top' }, { kind: 'face', index: cyl }]);
    await UI.cmdIntersectionCurve(); await wait(20);
    await pmAccept();
    var f = UI.activeSketchFeature(), a = f.entities.filter(function (e) { return e.t === 'arc'; });
    assert(a.length === 1 && f.entities.length === 1, 'one arc: ' + JSON.stringify(f.entities));
    near(a[0].r, 8, 1e-9, 'R8'); near(a[0].a1 - a[0].a0, 180, 1e-6, 'half a turn');
    await rfGSExit();
    return 'arc R' + a[0].r + ' sweep ' + (a[0].a1 - a[0].a0);
  });

  step('rfGS: Create Sketch from Selections — two of three circles selected in an open sketch become a new sketch on the same plane with the Equal relation between them; the relation to the left-out circle does not come; the source keeps its entities and stays open; one undo step', async function () {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Right'); await idle();
    var f = UI.activeSketchFeature(), S = W.SketchSolver;
    f.entities.push({ t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'circle', cx: 20, cy: 0, r: 5 }, { t: 'circle', cx: 40, cy: 0, r: 5 });
    assert(S.addRelation(f, 'equal', ['0', '2']).ok, 'Equal 0 and 2');
    assert(S.addRelation(f, 'equal', ['1', '2']).ok, 'Equal 1 and 2');
    var undo0 = UI.App.undo.length, count0 = UI.App.model.features.length;
    UI.App.sketchDirty = false;
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 2 }]);
    var g = UI.cmdSketchFromSelections();
    assert(g && g.type === 'sketch' && g.id !== f.id && g.name !== f.name, 'a new sketch: ' + (g && g.name));
    assert(UI.App.model.features.length === count0 + 1 && UI.App.model.features.indexOf(g) === UI.App.model.features.indexOf(f) + 1, 'right after the source in the tree');
    assert(g.plane.ref === 'Right' && g.entities.length === 2, 'on Right with two circles: ' + JSON.stringify(g.entities));
    near(g.entities[1].cx, 40, 1e-12, 'the third circle kept its place');
    var eq = (g.rels || []).filter(function (r) { return r.type === 'equal'; });
    assert(eq.length === 1, 'the Equal between the two came too, the one to the left-out circle did not: ' + JSON.stringify(g.rels));
    assert(f.entities.length === 3 && UI.App.mode === 'sketch' && UI.activeSketchFeature() === f, 'the source keeps its entities and stays open');
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    await rfGSExit();
    assert(rfGSFeature(g.name).profile, 'the new sketch has a profile after the rebuild');
    // nothing selected: a plain sentence, nothing made
    await UI.editSketch(f.id); await idle();
    UI.setSelection([]);
    assert(UI.cmdSketchFromSelections() === null && UI.App.model.features.length === count0 + 1, 'nothing selected, nothing made');
    await rfGSExit();
    return g.name + ' with ' + g.entities.length + ' circles';
  });

  step('rfGS: Derived Sketch — a Boss-Extrude on the derived sketch follows the parent: 40 × 20 × 5 is 4000, the parent at 60 wide makes it 6000, after Underive the parent no longer moves it; dragging a later entity of the copy locates it too', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).circle(100, 0, 3); p.sketch("Top").derivedFrom("Sketch1").extrude(5);'); await idle();
    var fs = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; }), parent = fs[0], d = fs[1];
    assert(d.derived && d.derived.from === parent.id, 'derived from the script');
    var area = 40 * 20 + Math.PI * 9;
    near(UI.App.build.body.volume() / (area * 5), 1, 2e-3, 'the extrude of the copy');
    parent.entities[0].w = 60;
    await UI.rebuild(); await idle();
    near(d.entities[0].w, 60, 1e-9, 'the copy followed');
    area = 60 * 20 + Math.PI * 9;
    near(UI.App.build.body.volume() / (area * 5), 1, 2e-3, 'the extrude followed the parent');
    // the second entity is the one dragged: the whole copy goes with it
    d.entities[1].cx += 7;
    await UI.rebuild(); await idle();
    near(d.derived.dx, 7, 1e-9, 'dragging any entity locates the copy'); near(d.entities[0].x, 7, 1e-9, 'the rectangle went with it'); near(d.entities[1].cx, 107, 1e-9, 'the circle is where it was dragged');
    assert(UI.cmdUnderiveSketch(d.id), 'Underive');
    parent.entities[0].w = 80;
    await UI.rebuild(); await idle();
    near(UI.App.build.body.volume() / (area * 5), 1, 2e-3, 'after Underive the extrude stays');
    return 'volume ' + UI.App.build.body.volume().toFixed(1);
  });

  step('rfGS: Derived Sketch — Sketch1 and Top Plane selected make a linked copy on Top; dragged by (10, 5) it stays there; when the parent grows the copy follows and keeps that offset; a reshape in the copy is not kept; the link survives the script round trip; Underive breaks it', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20);'); await idle();
    var parent = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    UI.setSelection([{ kind: 'feature', id: parent.id }]);
    var count0 = UI.App.model.features.length;
    await UI.cmdDerivedSketch(); await wait(10);
    assert(UI.App.model.features.length === count0 && UI.App.mode !== 'sketch', 'a sketch with no plane selected makes nothing');
    UI.setSelection([{ kind: 'feature', id: parent.id }, { kind: 'plane', ref: 'Top' }]);
    var d = await UI.cmdDerivedSketch(); await idle();
    assert(d && d.derived && d.derived.from === parent.id && d.plane.ref === 'Top', 'derived on Top: ' + JSON.stringify(d && d.derived));
    assert(UI.App.mode === 'sketch' && UI.App.activeSketch === d.id, 'the derived sketch opens to be located');
    assert(rfGSRects(d).length === 1 && d.entities[0].w === 40 && d.entities[0].h === 20, 'a copy of the rectangle: ' + JSON.stringify(d.entities));
    // located by hand
    d.entities[0].x += 10; d.entities[0].y += 5;
    await rfGSExit();
    near(d.entities[0].x, 10, 1e-9, 'stays where it was dragged, x'); near(d.entities[0].y, 5, 1e-9, 'y');
    // the parent changes
    await UI.editSketch(parent.id); await idle();
    parent.entities[0].w = 60; parent.entities[0].h = 30;
    await rfGSExit();
    near(d.entities[0].w, 60, 1e-9, 'the copy follows the width'); near(d.entities[0].h, 30, 1e-9, 'the height');
    near(d.entities[0].x, 10, 1e-9, 'and keeps its place, x'); near(d.entities[0].y, 5, 1e-9, 'y');
    near(d.derived.dx, 10, 1e-9, 'dx kept'); near(d.derived.dy, 5, 1e-9, 'dy kept');
    assert(d.profile && d.profile.loops && d.profile.loops.length === 1, 'the copy is a closed profile');
    // a reshape in the copy is not kept: the shape is the parent's
    d.entities[0].w = 5;
    await UI.rebuild(); await idle();
    near(d.entities[0].w, 60, 1e-9, 'the shape comes back from the parent');
    // the script round trip keeps the link
    var script = anvil.script();
    assert(/derivedFrom\("Sketch1", 10, 5\)/.test(script), 'the script carries the link: ' + script);
    await anvil.newPart(); await idle();
    await anvil.run(script); await idle();
    var fs = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; });
    assert(fs.length === 2 && fs[1].derived && fs[1].derived.from === fs[0].id, 'derived again after the script: ' + JSON.stringify(fs.map(function (x) { return x.derived || null; })));
    near(fs[1].entities[0].x, 10, 1e-9, 'x after the script'); near(fs[1].entities[0].w, 60, 1e-9, 'w after the script');
    // Underive
    assert(UI.cmdUnderiveSketch(fs[1].id) === true && !fs[1].derived, 'Underive breaks the link');
    await UI.rebuild(); await idle();
    fs[0].entities[0].w = 80;
    await UI.rebuild(); await idle();
    near(fs[1].entities[0].w, 60, 1e-9, 'the underived sketch no longer follows');
    assert(UI.cmdUnderiveSketch(fs[1].id) === false, 'not derived any more');
    return 'followed 40 to 60 with offset (10, 5), then underived';
  });

  step('rfGS: Derived Sketch on a planar face follows the face; a curved face is refused in a plain sentence', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFGS_BLOCK + ' p.sketch("Front").circle(0, 5, 3); p.sketch("Top").circle(50, 0, 6).extrude(10);'); await idle();
    var parent = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[1];
    var M = UI.App.mesh, top = -1, cyl = -1;
    M.faces.forEach(function (fc, i) { if (top < 0 && Math.abs(fc.normal[1] - 1) < 1e-9 && Math.abs(fc.centroid[1] - 10) < 1e-6 && Math.abs(fc.centroid[0]) < 1e-6) top = i; var q = fc.polys && fc.polys[0]; if (cyl < 0 && q && q.surf) cyl = i; });
    assert(top >= 0 && cyl >= 0, 'faces: ' + top + ' ' + cyl);
    var n0 = UI.App.model.features.length;
    await UI.cmdDerivedSketch(parent.id, { kind: 'face', index: cyl }); await wait(10);
    assert(UI.App.model.features.length === n0 && UI.App.mode !== 'sketch', 'not on a curved face');
    var d = await UI.cmdDerivedSketch(parent.id, { kind: 'face', index: top }); await idle();
    assert(d && d.plane && d.plane.face && d.entities[0].r === 3, 'on the face, the circle copied: ' + JSON.stringify(d && d.plane));
    await rfGSExit();
    assert(d.profile && d.profile.loops && d.profile.loops.length === 1, 'closed profile on the face');
    return 'on ' + JSON.stringify(d.plane.face);
  });
