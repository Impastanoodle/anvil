  // ---- rfFD (2026-10-29, lane FD: selection): Select hidden entities (visible-only box / lasso in a shaded view),
  // Lasso Selection from the right-click menu (part, sketch, assembly), Instant3D on fillet / shell / pattern faces.
  // Real mouse events on the viewport: press on #viewport (or a handle), moves and release on the window.
  function rfFDNeed(obj, name) { assert(obj && typeof obj[name] === 'function', name + ' is missing (rfFD)'); }
  function rfFDEv(type, p, target, mods, button) {
    var r = $('viewport').getBoundingClientRect(), b = button || 0;
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: b, buttons: type === 'mouseup' || type === 'contextmenu' ? 0 : (b === 2 ? 2 : 1), clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  // a drag through the screen points `path` (the first is the press)
  async function rfFDDrag(path, target, mods) {
    rfFDEv('mousedown', path[0], target || $('viewport'), mods);
    for (var k = 1; k < path.length; k++) { rfFDEv('mousemove', path[k], null, mods); if (k % 4 === 0) await wait(5); }
    rfFDEv('mouseup', path[path.length - 1], null, mods);
    await idle(); await wait(20);
  }
  // a straight drag in n moves
  function rfFDLine(a, b, n) { var out = []; for (var k = 0; k <= (n || 6); k++) out.push([a[0] + (b[0] - a[0]) * k / (n || 6), a[1] + (b[1] - a[1]) * k / (n || 6)]); return out; }
  // right-click at p (graphics area): the menu rows shown
  function rfFDRightClick(p) {
    rfFDEv('mousedown', p, $('viewport'), null, 2);
    rfFDEv('mouseup', p, null, null, 2);
    rfFDEv('contextmenu', p, $('viewport'), null, 2);
    var menus = D.querySelectorAll('body > .menu'), m = menus[menus.length - 1];
    return m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : [];
  }
  function rfFDRow(rows, text) { return rows.filter(function (r) { return r.textContent.indexOf(text) >= 0; })[0]; }
  // screen box of world points
  function rfFDBox(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (p) { var s = UI.worldToScreen(p); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  // a closed loop round the screen polygon `poly` (convex), pushed `pad` px out from its centre, `per` points a side
  function rfFDLoop(poly, pad, per) {
    var c = [0, 0];
    poly.forEach(function (p) { c[0] += p[0] / poly.length; c[1] += p[1] / poly.length; });
    var out = poly.map(function (p) { var dx = p[0] - c[0], dy = p[1] - c[1], L = Math.hypot(dx, dy) || 1; return [p[0] + dx / L * pad, p[1] + dy / L * pad]; });
    var loop = [];
    out.forEach(function (p, i) { var q = out[(i + 1) % out.length]; for (var k = 0; k < (per || 6); k++) loop.push([p[0] + (q[0] - p[0]) * k / (per || 6), p[1] + (q[1] - p[1]) * k / (per || 6)]); });
    loop.push(out[0]);
    return loop;
  }
  // a standard view, after its animation (an earlier group may have view animations on)
  async function rfFDView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); await wait(40); }
  function rfFDShown() { return UI.App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2; }); }
  var RFFD_PART = 'p.units("in");\np.sketch("Top").rect(-2, -2, 4, 4).extrude(2);\np.sketch("Top", 2).circle(0, 0, 0.25).cut("through", { reverse: true });';   // 4 × 4 × 2 in, Ø.5 through

  step('rfFD: Select hidden entities off (default): a right-to-left box round a shaded 4 x 4 x 2 in block with a hole (Isometric) selects only the visible edges (9 of the block, the top hole circle); on: all; Tools menu row toggles and is saved; Wireframe selects hidden ones', async function () {
    rfFDNeed(anvil, 'selectHidden'); rfFDNeed(anvil, 'lassoSelect');
    var keep = anvil.selectHidden(), style = UI.App.view.style, planes = UI.App.view.showPlanes;
    UI.App.view.showPlanes = false; if (UI.updatePlanes) UI.updatePlanes();   // a press on a shown plane rotates instead of boxing (an earlier group may leave planes on)
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFFD_PART); await idle();
      anvil.selectionFilter({ faces: false, edges: false, vertices: false, bodies: false, components: false, sketch: false, suspended: false });
      if (UI.App.view.style !== 'shadedEdges') UI.setStyle('shadedEdges');
      await rfFDView('Isometric');
      anvil.selectHidden(false);
      var corners = [];
      [-2, 2].forEach(function (x) { [0, 2].forEach(function (y) { [-2, 2].forEach(function (z) { corners.push([x, y, z]); }); }); });
      var bx = rfFDBox(corners), A = [bx.x1 + 14, bx.y0 - 14], B = [bx.x0 - 14, bx.y1 + 14];
      // the corner furthest from the eye: its three edges are hidden, and so is the hole's bottom circle
      var Dv = [UI.cam.dir.x, UI.cam.dir.y, UI.cam.dir.z], hv = corners.slice().sort(function (a, b) { return (a[0] * Dv[0] + a[1] * Dv[1] + a[2] * Dv[2]) - (b[0] * Dv[0] + b[1] * Dv[1] + b[2] * Dv[2]); })[0];
      function at(p, q) { return Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6; }
      function hiddenBlock(e) { return at(e.a, hv) || at(e.b, hv); }
      function circle(e, y) { return Math.abs(e.mid[1] - y) < 1e-6 && Math.hypot(e.mid[0], e.mid[2]) < 0.3; }
      var shown = rfFDShown(), nTop = shown.filter(function (e) { return circle(e, 2); }).length, nBot = shown.filter(function (e) { return circle(e, 0); }).length;
      assert(nTop > 4 && nTop === nBot && shown.length === 12 + nTop + nBot, 'model edges: 12 + ' + nTop + ' + ' + nBot + ' = ' + shown.length);
      await rfFDDrag(rfFDLine(A, B));
      var vis = anvil.selection().map(function (s) { return UI.App.edges[s.index]; });
      assert(vis.every(Boolean), 'edge indices');
      var bad = vis.filter(function (e) { return hiddenBlock(e) || circle(e, 0); });
      assert(!bad.length, 'hidden edges selected: ' + bad.map(function (e) { return e.mid.map(fmt).join(','); }).join(' / '));
      assert(vis.length === 9 + nTop && vis.filter(function (e) { return circle(e, 2); }).length === nTop, 'visible only: ' + vis.length + ' (expected 9 + ' + nTop + ') [' + statusText() + ' | cmd ' + !!UI.App.command + ' | ' + UI.App.view.style + ' | ' + anvil.selectionMode() + ' | A ' + A.map(fmt) + ' B ' + B.map(fmt) + ' | size ' + UI.size.w + 'x' + UI.size.h + ' | zoomArea ' + !!UI.App.zoomAreaMode + ' | sec ' + !!UI.App.view.section + ']');
      assert(/Crossing selection/.test(statusText()), 'status ' + statusText());
      // FD2: faces too: the 3 block faces seen and the hole's wall (seen through its opening), not the 3 hidden ones
      anvil.selectionFilter({ faces: true });
      await rfFDDrag(rfFDLine(A, B));
      var vf = anvil.selection(), Dn = [UI.cam.dir.x, UI.cam.dir.y, UI.cam.dir.z];
      var backF = vf.filter(function (s) { var fc = UI.App.mesh.faces[s.index]; return Math.abs(Math.abs(fc.normal[0]) + Math.abs(fc.normal[1]) + Math.abs(fc.normal[2]) - 1) < 1e-9 && fc.normal[0] * Dn[0] + fc.normal[1] * Dn[1] + fc.normal[2] * Dn[2] < 0 && Math.hypot(fc.centroid[0], fc.centroid[2]) > 0.5; });
      assert(vf.length === 4 && !backF.length, 'visible faces: ' + vf.length + ' (expected 4), hidden ones ' + backF.length);
      anvil.selectHidden(true);
      await rfFDDrag(rfFDLine(A, B));
      assert(anvil.selection().length === 7, 'all faces with Select hidden entities on: ' + anvil.selection().length);
      anvil.selectHidden(false);
      anvil.selectionFilter({ faces: false });
      anvil.selectHidden(true);
      await rfFDDrag(rfFDLine(A, B));
      assert(anvil.selection().length === shown.length, 'Select hidden entities on: all ' + shown.length + ', got ' + anvil.selection().length);
      // Tools ▸ Options ▸ Display/Selection ▸ Select hidden entities: checked now; a click turns it off and saves it
      var rows = menuRows('Select hidden entities');
      assert(rows.length === 1 && rows[0].chk === '✓', 'Tools menu row checked: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' ' + r.text + ' ' + r.chk; })));
      rows[0].row.click();
      assert(anvil.selectHidden() === false && W.localStorage.getItem('anvil.selectHidden') === '0', 'menu row turned it off and saved it');
      await rfFDDrag(rfFDLine(A, B));
      assert(anvil.selection().length === 9 + nTop, 'off again: visible only ' + anvil.selection().length);
      // Wireframe (and HLR / HLV) select hidden edges as SolidWorks does
      UI.setStyle('wireframe'); await wait(20);
      await rfFDDrag(rfFDLine(A, B));
      assert(anvil.selection().length === shown.length, 'Wireframe: all ' + anvil.selection().length);
      return 'visible ' + (9 + nTop) + ' of ' + shown.length + ', on ' + shown.length + ', Wireframe ' + shown.length;
    } finally {
      if (UI.App.view.style !== style) UI.setStyle(style || 'shadedEdges');
      anvil.selectHidden(keep);
      UI.App.view.showPlanes = planes; if (UI.updatePlanes) UI.updatePlanes();
    }
  });

  step('rfFD: Lasso Selection from the right-click menu: a loop round the top face selects its 4 edges and the hole\'s top circle (not the hidden edge seen across it); Ctrl adds, Shift toggles; in a sketch it takes the circle only; on an assembly a component; Box Selection back', async function () {
    var keep = anvil.selectHidden();
    try {
      anvil.selectHidden(false);
      await anvil.newPart(); await idle();
      await anvil.run(RFFD_PART); await idle();
      anvil.selectionFilter({ faces: false, edges: false, vertices: false, bodies: false, components: false, sketch: false, suspended: false });
      await rfFDView('Isometric');
      anvil.selectionMode('box');
      var corners = [];
      [-2, 2].forEach(function (x) { [0, 2].forEach(function (y) { [-2, 2].forEach(function (z) { corners.push([x, y, z]); }); }); });
      var bx = rfFDBox(corners), empty = [Math.max(6, bx.x0 - 30), (bx.y0 + bx.y1) / 2];
      var rows = rfFDRightClick(empty), lasso = rfFDRow(rows, 'Lasso Selection'), box = rfFDRow(rows, 'Box Selection');
      assert(lasso && box && /✓/.test(box.textContent) && !/✓/.test(lasso.textContent), 'empty-area menu: Box Selection ✓, Lasso Selection: ' + rows.map(function (r) { return r.textContent; }).join(' | '));
      lasso.click();
      assert(anvil.selectionMode() === 'lasso', 'Lasso Selection on');
      var top = [[-2, 2, -2], [2, 2, -2], [2, 2, 2], [-2, 2, 2]].map(function (p) { return UI.worldToScreen(p); });
      var loop = rfFDLoop(top, 10, 8), drawn = false;
      rfFDEv('mousedown', loop[0], $('viewport'));
      for (var k = 1; k < loop.length; k++) rfFDEv('mousemove', loop[k]);
      drawn = W.getComputedStyle($('sel-lasso')).display !== 'none' && ($('sel-lasso').querySelector('polyline').getAttribute('points') || '').split(' ').length > 10;
      rfFDEv('mouseup', loop[loop.length - 1]);
      await idle(); await wait(20);
      assert(drawn, 'the loop is drawn while dragging');
      assert(W.getComputedStyle($('sel-lasso')).display === 'none', 'loop hidden after release');
      var shown = rfFDShown(), nTop = shown.filter(function (e) { return Math.abs(e.mid[1] - 2) < 1e-6 && Math.hypot(e.mid[0], e.mid[2]) < 0.3; }).length;
      var sel = anvil.selection().map(function (s) { return UI.App.edges[s.index]; });
      assert(sel.length === 4 + nTop && sel.every(function (e) { return e && Math.abs(e.a[1] - 2) < 1e-6 && Math.abs(e.b[1] - 2) < 1e-6; }), 'lasso: the top face\'s 4 edges + ' + nTop + ' circle edges, got ' + sel.length + ': ' + sel.map(function (e) { return e && e.mid.map(fmt).join(','); }).join(' / '));
      assert(/Lasso selection/.test(statusText()), 'status ' + statusText());
      // with Select hidden entities on, the hidden vertical edge seen across the top face is taken too
      anvil.selectHidden(true);
      await rfFDDrag(loop);
      var thru = anvil.selection().map(function (s) { return UI.App.edges[s.index]; });
      assert(thru.length > sel.length && thru.some(function (e) { return Math.abs(e.mid[1] - 1) < 1e-6; }), 'through: the vertical hidden edge ' + thru.length);
      anvil.selectHidden(false);
      await rfFDDrag(loop);
      await rfFDDrag(loop, null, { ctrlKey: true });
      assert(anvil.selection().length === 4 + nTop, 'Ctrl + the same loop adds nothing new ' + anvil.selection().length);
      await rfFDDrag(loop, null, { shiftKey: true });
      assert(anvil.selection().length === 0, 'Shift + the same loop toggles them off ' + anvil.selection().length);
      var n0 = anvil.lassoSelect(loop).length;
      assert(n0 === 4 + nTop, 'anvil.lassoSelect ' + n0);
      // a sketch: the circle only (the rectangle and line stay out)
      await anvil.newPart(); await idle();
      await anvil.run('p.sketch("Front").rect(0, 0, 20, 10).circle(40, 5, 4).line(60, 0, 80, 10);'); await idle();
      var sk = anvil.model().features[0];
      UI.enterSketch(sk.id); await idle();
      anvil.selectionMode('box');
      var pl = UI.activePlane();
      function Sk(u, v) { return UI.worldToScreen(K.to3D(pl, u, v)); }
      var srows = rfFDRightClick(Sk(30, 20)), slasso = rfFDRow(srows, 'Lasso Selection');
      assert(slasso, 'sketch menu has Lasso Selection: ' + srows.map(function (r) { return r.textContent; }).join(' | '));
      slasso.click();
      assert(anvil.selectionMode() === 'lasso', 'lasso from the sketch menu');
      var ring = [];
      for (var a = 0; a <= 24; a++) ring.push(Sk(40 + 8 * Math.cos(a / 24 * 2 * Math.PI), 5 + 8 * Math.sin(a / 24 * 2 * Math.PI)));
      await rfFDDrag(ring);
      assert(JSON.stringify(anvil.selection().map(function (s) { return s.index; })) === '[1]', 'sketch lasso: the circle ' + JSON.stringify(anvil.selection()));
      await UI.exitSketch(); await idle();
      // an assembly: a loop round Pin<2> selects that component
      var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
      await UI.openExample(ex); await idle();
      await rfFDView('Front');
      var pin2 = UI.componentIndex('Pin<2>'), bb = UI.bodyBounds(pin2), pb = rfFDBox([bb.min, bb.max, [bb.min[0], bb.max[1], bb.min[2]], [bb.max[0], bb.min[1], bb.max[2]]]);
      var asel = anvil.lassoSelect(rfFDLoop([[pb.x0, pb.y0], [pb.x1, pb.y0], [pb.x1, pb.y1], [pb.x0, pb.y1]], 6, 4));
      assert(asel.some(function (s) { return s.kind === 'body' && s.name === 'Pin<2>'; }), 'assembly lasso: Pin<2> ' + JSON.stringify(asel));
      // back to Box Selection from the menu
      var brows = rfFDRightClick([4, 4]), bbox = rfFDRow(brows, 'Box Selection');
      assert(bbox, 'assembly empty-area menu: ' + brows.map(function (r) { return r.textContent; }).join(' | '));
      bbox.click();
      assert(anvil.selectionMode() === 'box', 'Box Selection back');
      return 'part ' + (4 + nTop) + ' edges, sketch circle, Pin<2>';
    } finally {
      anvil.selectionMode('box');
      anvil.selectHidden(keep);
      if (UI.closeMenus) UI.closeMenus();
    }
  });

  step('rfFD: Instant3D on a fillet face: R .125 -> .25 by a drag (volume follows, one undo step, value box); a shell\'s inner face gives the wall thickness, a pattern instance face the spacing (typed 3/4 in the value box)', async function () {
    rfFDNeed(UI, 'instant3DFeatureHandles');
    var wasOn = UI.instant3DOn();
    if (!wasOn) UI.toggleInstant3D(true);
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").rect(-2, -1, 4, 2).extrude(1);\np.fillet(0.125, [[0, 1, 1]]);'); await idle();
      await rfFDView('Isometric');
      function vol(r) { return 8 - (1 - Math.PI / 4) * r * r * 4; }
      near(anvil.mass().volume, vol(0.125), 1e-6, 'volume R .125');
      var fil = anvil.model().features.filter(function (f) { return f.type === 'fillet'; })[0];
      function ownFace(fid) { var best = -1; UI.App.mesh.faces.forEach(function (fc, i) { if (UI.App.triShared[fc.start] === fid && (best < 0 || fc.area > UI.App.mesh.faces[best].area)) best = i; }); return best; }
      var fi = ownFace(fil.id);
      assert(fi >= 0, 'a face of the fillet');
      UI.setSelection([{ kind: 'face', index: fi }]);
      var hs = anvil.instant3D().handles.filter(function (h) { return h.kind === 'fparam'; });
      assert(hs.length === 1 && Math.abs(hs[0].value - 0.125) < 1e-12 && D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'), 'radius handle ' + JSON.stringify(anvil.instant3D().handles));
      // zoom about the handle until its ruler has a tick at .25 (steps .05 / .01)
      function hObj() { return UI.instant3DHandles().filter(function (h) { return h.kind === 'fparam'; })[0]; }
      for (var z = 0; z < 14; z++) {
        var st = hObj().step();
        if (Math.abs(0.25 / st - Math.round(0.25 / st)) < 1e-9 && st <= 0.05) break;
        var g0 = hObj().grab || UI.worldToScreen(hObj().pos(0.125));
        UI.zoomView(st > 0.05 ? 0.8 : 1.15, g0[0], g0[1]); UI.instant3DHandles();
      }
      var h = hObj(), undoN = UI.App.undo.length;
      UI.instant3DHandles();   // drawn: grab point known
      h = hObj();
      var from = h.grab, to = UI.instant3DRulerPoint(h, 0.25);
      await rfFDDrag(rfFDLine(from, to, 8), D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'));
      await idle(); await wait(30);
      fil = anvil.model().features.filter(function (f) { return f.type === 'fillet'; })[0];
      assert(Math.abs(fil.r - 0.25) < 1e-12, 'fillet R dragged to .25: ' + fil.r + ' (step ' + h.step() + ')');
      near(anvil.mass().volume, vol(0.25), 1e-6, 'volume R .25');
      assert(UI.App.undo.length === undoN + 1, 'one undo step (' + (UI.App.undo.length - undoN) + ')');
      var ed = UI.instant3DEditOpen();
      assert(ed && ed.kind === 'fparam' && Math.abs(ed.value - 0.25) < 1e-12, 'value box on release ' + JSON.stringify(ed));
      await UI.instant3DEdit('3/16'); await idle();
      fil = anvil.model().features.filter(function (f) { return f.type === 'fillet'; })[0];
      assert(Math.abs(fil.r - 0.1875) < 1e-12 && UI.App.undo.length === undoN + 1, 'typed 3/16 in the same undo step: ' + fil.r);
      near(anvil.mass().volume, vol(0.1875), 1e-6, 'volume R 3/16');
      await UI.undo(); await idle();
      near(anvil.mass().volume, vol(0.125), 1e-6, 'undo: R .125 again');
      // shell: an inner wall's face -> the thickness handle
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").rect(-2, -1, 4, 2).extrude(1);\np.shell(0.1, [[0, 1, 0]]);'); await idle();
      await rfFDView('Isometric');
      var sh = anvil.model().features.filter(function (f) { return f.type === 'shell'; })[0], si = ownFace(sh.id);
      assert(si >= 0, 'a face of the shell');
      UI.setSelection([{ kind: 'face', index: si }]);
      var th = anvil.instant3D().handles.filter(function (x) { return x.kind === 'fparam'; });
      assert(th.length === 1 && Math.abs(th[0].value - 0.1) < 1e-12 && /thickness/.test(th[0].label), 'thickness handle ' + JSON.stringify(th));
      // linear pattern: an instance face -> the spacing handle; a short drag, then 3/4 typed in the value box
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").rect(-2, -1, 4, 2).extrude(0.5);\np.sketch("Top", 0.5).circle(-1.5, 0, 0.2).extrude(0.5);\np.linearPattern({ dir: "x", spacing: 1, count: 3 });'); await idle();
      await rfFDView('Isometric');
      // the round side of the last copy (x = .5): copies carry the seed boss's id (the three tops are one coplanar face)
      var lp = anvil.model().features.filter(function (f) { return f.type === 'lpattern'; })[0];
      function wallAt(x) { var r = -1; UI.App.mesh.faces.forEach(function (fc, i) { if (r < 0 && Math.abs(fc.normal[1]) < 1e-6 && Math.abs(fc.centroid[1] - 0.75) < 1e-6 && Math.hypot(fc.centroid[0] - x, fc.centroid[2]) < 0.25) r = i; }); return r; }
      var li = wallAt(0.5), si0 = wallAt(-1.5);
      assert(li >= 0 && si0 >= 0, 'the round sides of the seed and a copy');
      // the seed's own side gives the boss's sketch dimensions, no spacing
      UI.setSelection([{ kind: 'face', index: si0 }]);
      assert(!anvil.instant3D().handles.some(function (x) { return x.kind === 'fparam'; }), 'seed face: no pattern handle ' + JSON.stringify(anvil.instant3D().handles));
      UI.setSelection([{ kind: 'face', index: li }]);
      var sp = anvil.instant3D().handles.filter(function (x) { return x.kind === 'fparam'; });
      assert(sp.length === 1 && sp[0].value === 1 && /spacing/.test(sp[0].label), 'spacing handle ' + JSON.stringify(sp));
      var hp = UI.instant3DHandles().filter(function (x) { return x.kind === 'fparam'; })[0], undoP = UI.App.undo.length;
      await rfFDDrag(rfFDLine(hp.grab, UI.worldToScreen(hp.pos(1.2)), 6), D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'));
      await idle(); await wait(30);
      assert(UI.instant3DEditOpen() && UI.instant3DEditOpen().kind === 'fparam', 'value box after the drag');
      await UI.instant3DEdit('3/4'); await idle();
      lp = anvil.model().features.filter(function (f) { return f.type === 'lpattern'; })[0];
      assert(lp.s1 === 0.75 && UI.App.undo.length === undoP + 1, 'spacing typed 3/4, one undo step: ' + lp.s1 + ' / ' + (UI.App.undo.length - undoP));
      return 'R .125 → .25 → 3/16, shell T .1, spacing 1 → .75';
    } finally {
      if (!wasOn) UI.toggleInstant3D(false);
    }
  });
