  // --- r4/asm4 ---
  // a plate with n pins in its holes (concentric + flush bottoms): the release-cost model of round 3
  function r4pinsCode(n) {
    var L = ['a.name("Pins' + n + '").units("mm");', 'var plate = a.insert({ script: \'p.name("Plate"); p.box(300, 60, 8); p.hole("Top", 10, -10, 8, { offset: 8 }); p.linearPattern({ dir: "x", spacing: 28, count: 10, dir2: "z", spacing2: 20, count2: 3 });\' }, { fixed: true });'];
    for (var i = 0; i < n; i++) {
      var x = 10 + 28 * (i % 10), z = 10 + 20 * Math.floor(i / 10);
      L.push('var q' + i + ' = a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [' + (x + 3) + ', 15, ' + (z - 2) + '] });');
      L.push('a.concentric({ component: q' + i + ', cylinder: [4, 10, 0] }, { component: plate, cylinder: [' + (x + 4) + ', 4, ' + z + '] });');
      L.push('a.coincident({ component: q' + i + ', face: [1, 0, 1] }, { component: plate, face: [155, 0, 40] }, { alignment: "aligned" });');
    }
    return L.join('\n');
  }
  step('r4/asm4: an assembly rebuild places each part\'s cached seams, true curves and smooth normals (no curve search over the whole assembly); the drawn result matches the full search', async function () {
    await anvil.run(r4pinsCode(10));
    await idle();
    var A = UI.App, m = A.mesh, cs = K.curveSurfaces, ce = K.curveEdges, calls = 0;
    K.curveSurfaces = function () { calls++; return cs.apply(this, arguments); };
    K.curveEdges = function () { calls++; return ce.apply(this, arguments); };
    var t0 = performance.now();
    try { UI.rebuild({ noSave: true }); } finally { K.curveSurfaces = cs; K.curveEdges = ce; }
    var ms = performance.now() - t0;
    m = A.mesh;
    assert(calls === 0, 'curve search over the assembly mesh ran ' + calls + ' times');
    var full = K.bodyEdges(m), curves = UI.annotateCurveEdges(m, full);
    // per part: 30 holes x 2 rims + 10 pins x 2 ends (the search over the whole mesh merges a pin's bottom rim with its hole's)
    assert(A.curves.length === 30 * 2 + 10 * 2 && curves.length <= A.curves.length, 'curves ' + A.curves.length + ' / ' + curves.length);
    // every placed curve point lies on a curve of the full search
    var off = 0;
    A.curves.forEach(function (c) {
      c.pts.forEach(function (p) {
        var ok = curves.some(function (f) {
          var C = f.curve, d = [p[0] - C.center[0], p[1] - C.center[1], p[2] - C.center[2]], h = d[0] * C.normal[0] + d[1] * C.normal[1] + d[2] * C.normal[2];
          return Math.abs(h) < 1e-6 && Math.abs(Math.hypot(d[0] - h * C.normal[0], d[1] - h * C.normal[1], d[2] - h * C.normal[2]) - C.radius) < 1e-6;
        });
        if (!ok) off++;
      });
    });
    assert(off === 0, off + ' curve points off the true curves');
    // smooth normals: the same as working them out on the whole mesh
    var mine = m.smoothNormals, keep = UI.asmNormals;
    UI.asmNormals = null; m.smoothNormals = null;
    var ref;
    try { ref = UI.analyticNormals(m); } finally { UI.asmNormals = keep; m.smoothNormals = mine; }
    var d = 0;
    for (var i = 0; i < ref.length; i++) d = Math.max(d, Math.abs(ref[i] - mine[i]));
    assert(d < 1e-5, 'normals differ by ' + d);
    return 'rebuild ' + ms.toFixed(1) + ' ms, ' + A.curves.length + ' curves';
  });
  step('r4/asm4: dragging a part inside a Flexible sub-assembly poses it (no rebuild per frame, the drawn arm follows its flexState); one rebuild and one undo step on release', async function () {
    var code = exByName('Hinged cover (sub-assemblies)').code.split('\n').filter(function (l) { return !/a\.angle/.test(l); }).join('\n');
    await anvil.run(code);
    await idle();
    var A = UI.App, comps = anvil.components(), ri = comps.findIndex(function (c) { return c.name === 'Hinge<2>'; }), id = comps[ri].id, m = A.mesh;
    var f = m.faces.filter(function (x) { return (x.body || 0) === ri; }).sort(function (a, b) { return b.centroid[1] - a.centroid[1]; })[0];   // the top of the standing arm
    var s = UI.worldToScreen(f.centroid), h = UI.componentDragHook([s[0], s[1]], { button: 0 });
    assert(h && h.component.name === 'Hinge<2>', 'drag hook on the flexible hinge');
    var fs0 = JSON.stringify(W.Assembly.findComponent(A.model, id).flexState), undo0 = A.undo.length, vo = f.start * 9;
    var v0 = [m.positions[vo], m.positions[vo + 1], m.positions[vo + 2]], rebuilds = 0, orig = UI.rebuild, build0 = A.build;
    UI.rebuild = function () { rebuilds++; return orig.apply(this, arguments); };
    try {
      h.start();
      for (var i = 1; i <= 4; i++) { h.move([s[0] - 15 * i, s[1] + 10 * i]); await r3frame(); }
      await r3frame();
      assert(UI.asmPose.active(), 'pose shown while dragging');
      assert(rebuilds === 0 && A.build === build0, 'no rebuild during the drag (' + rebuilds + ')');
      var c = W.Assembly.findComponent(A.model, id), fs = c.flexState, k = Object.keys(fs)[0];
      assert(JSON.stringify(fs) !== fs0, 'the arm turned in context');
      var rel0 = A.build.partBuilds[id].model.components.filter(function (x) { return String(x.id) === k; })[0].transform;
      var T0 = W.Assembly.composeTransforms(A.build.model.components[ri].transform, rel0), T1 = W.Assembly.composeTransforms(c.transform, fs[k]);
      var want = W.Assembly.transformPoint(T1, W.Assembly.inverseTransformPoint(T0, v0)), P = UI.getBodyMesh().geometry.getAttribute('position').array;
      for (var j = 0; j < 3; j++) near(P[vo + j], want[j], 1e-3, 'drawn arm vertex follows the flexState [' + j + ']');
      await h.end([s[0] - 60, s[1] + 40]);
      await idle();
    } finally { UI.rebuild = orig; }
    assert(!UI.asmPose.active(), 'pose ended on release');
    assert(rebuilds >= 1 && rebuilds <= 2, 'one rebuild on release (' + rebuilds + ')');
    assert(A.undo.length === undo0 + 1, 'one undo step');
    assert(JSON.stringify(W.Assembly.findComponent(A.model, id).flexState) !== fs0, 'flexState committed');
    assert(anvil.mates().every(function (x) { return x.ok; }), 'mates hold');
  });
  step('r4/asm4: an ignored interference is saved in the assembly (model, script round trip, undo)', async function () {
    await anvil.run(exByName('Interference check').code);
    await idle();
    UI.cmdInterference();
    var s = UI.interferenceSession();
    assert(s.results().pairs.length === 2, 'two interferences');
    var undo0 = UI.App.undo.length;
    s.ignore(0, true);
    var saved = (UI.App.model.ignoredInterferences || []).slice();
    assert(saved.length === 1 && UI.App.undo.length === undo0 + 1, 'saved in the model, one undo step: ' + JSON.stringify(saved));
    assert(/a\.ignoreInterference\(/.test(anvil.script()), 'in the script');
    UI.pmCancel();
    await anvil.run(anvil.script());
    await idle();
    assert(JSON.stringify(UI.App.model.ignoredInterferences) === JSON.stringify(saved), 'script round trip: ' + JSON.stringify(UI.App.model.ignoredInterferences));
    UI.cmdInterference();
    s = UI.interferenceSession();
    assert(s.results().pairs.filter(function (p) { return p.ignored; }).length === 1 && / 1 ignored\./.test(D.querySelector('#pm .pm-msg').textContent), 'still ignored after reopening');
    s.ignore(s.results().pairs.findIndex(function (p) { return p.ignored; }), false);
    assert(!UI.App.model.ignoredInterferences, 'un-ignored');
    UI.pmCancel();
    await UI.undo(); await idle();
    assert(JSON.stringify(UI.App.model.ignoredInterferences) === JSON.stringify(saved), 'undo brings it back');
  });
  // Alt + drag in the viewport (real mouse events through ui-sketch.js)
  async function r4altDrag(from, to, steps) {
    var vp = UI.viewport, rc = vp.getBoundingClientRect();
    function ev(type, p) { return new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, altKey: true, clientX: rc.left + p[0], clientY: rc.top + p[1] }); }
    vp.dispatchEvent(ev('mousedown', from));
    for (var i = 1; i <= steps; i++) { W.dispatchEvent(ev('mousemove', [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps])); await r3frame(); }
    await r3frame();
    var posed = UI.asmPose.active();
    W.dispatchEvent(ev('mouseup', to));
    await idle();
    return posed;
  }
  step('r4/asm4: SmartMates — Alt + drag a face of a floating component onto a face of another adds the mate (plane on plane: Coincident, cylinder in a hole: Concentric), previewed while dragging; dropped on nothing adds none; Alt + drag on a fixed component still rotates the view', async function () {
    await baseAndBlock('R4Smart');
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    var blk = anvil.components()[1], undo0 = UI.App.undo.length;
    // the block's +z face (z = 30 in the world) onto the base's top (y = 10)
    var ctr = W.Assembly.componentCenter(UI.App.model, UI.App.build, blk.id), bc = W.Assembly.componentCenter(UI.App.model, UI.App.build, anvil.components()[0].id);
    var from = UI.worldToScreen([ctr[0], ctr[1], ctr[2] + 10]), to = UI.worldToScreen([bc[0] + 30, 10, bc[2] + 20]);
    var h = UI.pickFace(from[0], from[1]);
    assert(h && (UI.App.mesh.faces[h.index].body || 0) === 1, 'the block is under the press');
    // dropped where there is no other component: nothing
    var posed = await r4altDrag(from, [from[0] - 400, from[1] - 400], 4);
    assert(anvil.mates().length === 0 && UI.App.undo.length === undo0, 'no mate when dropped on nothing');
    posed = await r4altDrag(from, to, 6);
    assert(posed, 'the mated place is shown while dragging (pose)');
    var ms = anvil.mates();
    assert(ms.length === 1 && ms[0].type === 'coincident' && ms[0].ok, 'Coincident added: ' + JSON.stringify(ms));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    assert(!UI.asmPose.active(), 'no pose left');
    // a pin dropped into a hole of the bolt-hole plate
    await anvil.newAssembly('R4Smart2');
    await anvil.insert({ example: 'Plate with bolt holes' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [50, 20, 30] });
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    var a = UI.worldToScreen([54, 30, 30]), b = UI.worldToScreen([10 - 2.9, 6, 10 - 2.9]);   // the pin's side; the near wall of the hole at (10, 10)
    await r4altDrag(a, b, 6);
    ms = anvil.mates();
    assert(ms.length === 1 && ms[0].type === 'concentric' && ms[0].ok, 'Concentric added: ' + JSON.stringify(ms));
    var p = anvil.components()[1].position;
    near(p[0], 10, 1e-6, 'pin on the hole axis x'); near(p[2], 10, 1e-6, 'pin on the hole axis z');
    // Alt + drag on the fixed plate: the view turns, nothing is mated
    var cv = UI.camVersion(), pl = UI.worldToScreen([60, 8, 40]);
    await r4altDrag(pl, [pl[0] + 40, pl[1] + 10], 3);
    assert(anvil.mates().length === 1 && UI.camVersion() !== cv, 'fixed component: the view rotated');
  });
  step('r4/asm4: clicking a mate in the FeatureManager selects its two faces (the hole and the pin of a Concentric); Delete then deletes the mate, not a component', async function () {
    await anvil.run(exByName('Pinned plate assembly').code);
    await idle();
    var mt = UI.App.model.mates.filter(function (m) { return m.type === 'concentric'; })[0];
    var folder = D.querySelector('.ti.mates-folder');
    if (folder && !D.querySelector('.ti.mate-row')) folder.click();
    var row = D.querySelector('.ti.mate-row[data-mate="' + mt.id + '"]');
    assert(row, 'mate row');
    row.click();
    var A = UI.App, fa = A.sel && A.mesh.faces[A.sel.index], fb = A.sel2 && A.mesh.faces[A.sel2.index];
    assert(fa && fb && A.sel.mate === mt.id, 'both faces selected');
    var ia = W.Assembly.componentIndex(A.model, mt.a.component), ib = W.Assembly.componentIndex(A.model, mt.b.component);
    assert((fa.body || 0) === ia && (fb.body || 0) === ib, 'faces on the mated components: ' + [fa.body, fb.body, ia, ib]);
    // whole cylindrical faces of those components only
    [A.sel, A.sel2].forEach(function (s, k) { UI.faceGroup(s.index).forEach(function (i) { assert((A.mesh.faces[i].body || 0) === (k ? ib : ia), 'highlight stays on its component'); }); });
    var n = anvil.components().length;
    UI.deleteSelection();
    var dlg = D.querySelector('#modal');
    assert(dlg && !dlg.hidden && dlg.textContent.indexOf(mt.name) >= 0, 'Delete asks about the mate: ' + (dlg && dlg.textContent));
    UI.closeModal();
    assert(anvil.components().length === n, 'no component deleted');
  });
  // --- end r4/asm4 ---
