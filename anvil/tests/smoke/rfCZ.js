  // --- rfCZ (2026-10-20, lane CZ: Reference Geometry) --- Axis, Point and Coordinate System from the Features tab's
  // Reference Geometry flyout with real picks in the graphics area (selClick, selection.js): the PM boxes fill in
  // order, a live preview shows the result, ✓ makes a feature drawn in the viewport; a click on the axis while
  // Circular Pattern is open makes it the pattern axis; Revolve lists reference axes; Mass Properties reports in a
  // Coordinate System; edit / undo / redo / save-load keep them.
  var rfCZBlock = 'p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);\np.sketch("Front", 10).circle(30, 15, 5).end().extrude(10);\np.sketch("Front").circle(12, 15, 4).end().cut("through");';
  function rfCZScr(p) { var s = UI.worldToScreen(p); return [Math.round(s[0]), Math.round(s[1])]; }
  function rfCZFly(id) {
    var w = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (x) { return x._fly && x._fly.fly === 'refgeo'; })[0];
    assert(w, 'Reference Geometry flyout');
    var c = w.querySelector('.rb-caret');
    c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); c.click();
    var m = D.querySelector('.menu'), row = m && Array.prototype.filter.call(m.querySelectorAll('.mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').trim() === id; })[0];
    assert(row && !row.classList.contains('disabled'), id + ' is listed and enabled in the flyout');
    row.click();
  }
  function rfCZMenu(text) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').trim() === text; })[0] || null; }
  function rfCZRadio(v) { var r = D.querySelector('#pm input[type=radio][value="' + v + '"]'); assert(r, 'radio ' + v); r.click(); }
  function rfCZBoxes() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-pick'), function (b) { return (b.classList.contains('active') ? '*' : '') + b.textContent.trim(); }); }
  function rfCZLast(type) { return UI.App.model.features.filter(function (f) { return f.type === type; }).pop(); }
  function rfCZRec(f) { return UI.App.build.planes[f.id]; }
  async function rfCZPart() {
    await anvil.newPart(); await idle();
    await anvil.run(rfCZBlock); await idle();
    UI.setRibbonTab('Features');
    UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(60);
  }
  function rfCZNear(a, b, tol, what) { assert(a && b && a.length === b.length && a.every(function (x, i) { return Math.abs(x - b[i]) <= tol; }), what + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); }

  step('rfCZ: Axis ▸ Two Planes from the flyout — clicking the right face then the top face fills both boxes in order, the preview is drawn, ✓ makes Axis1 along Z through (40, 30); it is drawn as a dashed line, hidden by View ▸ Axes and back', async function () {
    var errs0 = errors.length;
    await rfCZPart();
    rfCZFly('Axis'); await idle();
    assert(UI.pmTitle() === 'Axis', 'Axis PM: ' + UI.pmTitle());
    rfCZRadio('planes'); await idle();
    assert(rfCZBoxes().length === 2 && rfCZBoxes()[0].charAt(0) === '*', 'two boxes, the first active: ' + JSON.stringify(rfCZBoxes()));
    selClick(rfCZScr([40, 20, 6])); await idle(); await wait(20);
    assert(/^Face at/.test(rfCZBoxes()[0]) && rfCZBoxes()[1].charAt(0) === '*', 'first box filled, second active: ' + JSON.stringify(rfCZBoxes()));
    selClick(rfCZScr([20, 30, 6])); await idle(); await wait(20);
    assert(/Face at/.test(rfCZBoxes()[1]), 'second box filled: ' + JSON.stringify(rfCZBoxes()));
    assert(UI.groups.preview.children.length > 0, 'the axis is previewed');
    await pmAccept();
    var ax = rfCZLast('refaxis');
    assert(ax && ax.kind === 'planes' && ax.refs.length === 2 && ax.name === 'Axis1', 'feature: ' + JSON.stringify(ax));
    var R = rfCZRec(ax);
    assert(R && R.refgeo === 'axis' && Math.abs(Math.abs(R.d[2]) - 1) < 1e-9, 'axis along Z: ' + JSON.stringify(R));
    rfCZNear([R.o[0], R.o[1]], [40, 30], 1e-9, 'through (40, 30)');
    var drawn = function () { return UI.groups.refgeo.children.filter(function (c) { return c.isLineSegments; }).length; };
    assert(drawn() === 1, 'one dashed line drawn: ' + drawn());
    UI.App.sel = null; UI.App.sel2 = null; UI.App.hover = null;
    UI.App.view.showAxes = false; UI.updatePlanes();
    assert(drawn() === 0, 'View ▸ Axes off hides it');
    UI.App.view.showAxes = true; UI.updatePlanes();
    assert(drawn() === 1, 'and shows it again');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'Axis1 o = ' + JSON.stringify(R.o);
  });

  step('rfCZ: Circular Pattern of the Ø10 boss — a click on Axis1 in the graphics area makes it the pattern axis (the list shows Axis1, the axis point group hides); 4 instances give the block + 4 bosses − the hole; the feature stores axisRef, Edit Feature shows it again', async function () {
    var errs0 = errors.length;
    await rfCZPart();
    await anvil.append('p.axis("planes", [{ face: [40, 20, 6] }, { face: [20, 30, 6] }]);'); await idle();
    var ax = rfCZLast('refaxis'), R = rfCZRec(ax);
    assert(R && R.refgeo === 'axis', 'axis built: ' + JSON.stringify(UI.App.build.errors));
    var boss = UI.App.model.features[3];
    UI.App.sel = { kind: 'feature', id: boss.id };
    UI.cmdCircularPattern(); await idle();
    assert(UI.pmTitle() === 'Circular Pattern', 'CirPattern PM');
    var mid = [(R.a[0] + R.b[0]) / 2, (R.a[1] + R.b[1]) / 2, (R.a[2] + R.b[2]) / 2];
    selClick(rfCZScr(mid)); await idle(); await wait(20);
    assert(UI.pmSpec().values.axis === 'ref:' + ax.id, 'the axis box took Axis1: ' + UI.pmSpec().values.axis);
    var sel = D.querySelector('#pm select[data-key="axis"]');
    assert(sel && sel.options[sel.selectedIndex].textContent === 'Axis1', 'the list shows Axis1');
    assert(!/Axis point/.test($('pm').textContent), 'the axis point group is hidden');
    UI.pmSetField('n', '4'); await idle();
    await pmAccept();
    var cp = rfCZLast('cpattern');
    assert(cp && cp.axisRef === ax.id && !UI.App.build.errors[cp.id], 'cpattern about Axis1: ' + JSON.stringify(cp) + ' ' + JSON.stringify(UI.App.build.errors));
    var v = anvil.mass().volume, want = 12000 + 4 * 250 * Math.PI - 160 * Math.PI;
    assert(Math.abs(v - want) < 1e-6 * want, 'volume ' + v + ' vs ' + want);
    UI.editFeature(cp); await idle();
    assert(UI.pmSpec().values.axis === 'ref:' + ax.id, 'Edit Feature shows Axis1');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'V = ' + v.toFixed(3);
  });

  step('rfCZ: Point ▸ Arc Center by clicking the hole\'s top edge lands at (12, 15, 10); Point ▸ Center of Face on the top face; both are drawn as stars; moving the hole (edit its sketch) moves the arc-centre point', async function () {
    var errs0 = errors.length;
    await rfCZPart();
    rfCZFly('Point'); await idle();
    assert(UI.pmTitle() === 'Point', 'Point PM: ' + UI.pmTitle());
    rfCZRadio('arc'); await idle();
    selClick(rfCZScr([12, 11, 10])); await idle(); await wait(20);
    assert(/Edge at/.test(rfCZBoxes()[0]), 'edge in the box: ' + JSON.stringify(rfCZBoxes()));
    await pmAccept();
    var p1 = rfCZLast('refpoint');
    rfCZNear(rfCZRec(p1).p, [12, 15, 10], 1e-9, 'arc centre');
    rfCZFly('Point'); await idle();
    rfCZRadio('face'); await idle();
    selClick(rfCZScr([4, 26, 10])); await idle(); await wait(20);
    await pmAccept();
    var p2 = rfCZLast('refpoint');
    assert(p2.kind === 'face' && rfCZRec(p2) && Math.abs(rfCZRec(p2).p[2] - 10) < 1e-9, 'centre of the front face (z = 10): ' + JSON.stringify(rfCZRec(p2)));
    assert(UI.groups.refgeo.children.filter(function (c) { return c.isLineSegments; }).length === 2, 'two stars drawn');
    var hole = UI.App.model.features[4];
    UI.pushUndo(); hole.entities[0].cx = 12.2; await UI.rebuild(); await idle();
    rfCZNear(rfCZRec(p1).p, [12.2, 15, 10], 1e-9, 'the point followed the hole');
    UI.undoCommand(); await idle();
    rfCZNear(rfCZRec(p1).p, [12, 15, 10], 1e-9, 'undo puts it back');
    UI.redoCommand(); await idle();
    rfCZNear(rfCZRec(p1).p, [12.2, 15, 10], 1e-9, 'redo moves it again');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'arc centre + face centre, follows edits';
  });

  step('rfCZ: Coordinate System from the flyout — origin a vertex, X an edge, Z the top face; drawn as a labelled triad; Mass Properties offers it and reports the centre of mass in it; save / load keeps every reference feature', async function () {
    var errs0 = errors.length;
    await rfCZPart();
    rfCZFly('Coordinate System'); await idle();
    assert(UI.pmTitle() === 'Coordinate System', 'Csys PM: ' + UI.pmTitle());
    selClick(rfCZScr([40, 0, 10])); await idle(); await wait(20);     // vertex
    assert(/^Vertex at/.test(rfCZBoxes()[0]) && rfCZBoxes()[1].charAt(0) === '*', 'origin filled, X active: ' + JSON.stringify(rfCZBoxes()));
    selClick(rfCZScr([20, 30, 10])); await idle(); await wait(20);     // the edge between the top and front faces, along X
    assert(/^Edge at/.test(rfCZBoxes()[1]), 'X filled: ' + JSON.stringify(rfCZBoxes()));
    var zb = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-pick'), function (b) { return /Z axis/.test(b.textContent); })[0];
    assert(zb, 'Z box'); zb.click(); await idle();
    selClick(rfCZScr([4, 26, 10])); await idle(); await wait(20);   // the front face (normal +Z)
    await pmAccept();
    var cs = rfCZLast('csys'), C = rfCZRec(cs);
    assert(C && C.refgeo === 'csys', 'csys built: ' + JSON.stringify(UI.App.build.errors));
    rfCZNear(C.origin, [40, 0, 10], 1e-9, 'origin'); rfCZNear(C.x, [1, 0, 0], 1e-9, 'x'); rfCZNear(C.z, [0, 0, 1], 1e-9, 'z');
    assert(UI.groups.refgeo.children.filter(function (c) { return c.isSprite; }).length === 3, 'X Y Z labels drawn');
    UI.showMassProperties(); await idle();
    var fs = D.getElementById('mass-frame');
    assert(fs && fs.options.length === 2, 'Mass Properties lists the coordinate system');
    fs.value = String(cs.id); fs.dispatchEvent(new W.Event('change'));
    var com = UI.massInFrame(cs.id).centroid, w = anvil.mass().centroid;
    rfCZNear(com, [w[0] - 40, w[1], w[2] - 10], 1e-9, 'centre of mass in the system');
    assert(/Center of mass/.test($('modal-body').textContent) && $('modal-body').textContent.indexOf(UI.fmtNum(com[0], 3)) >= 0, 'the dialog shows the relative value');
    clickModalButton('Close'); await idle();
    var json = JSON.stringify(anvil.model());
    await anvil.newPart(); await idle();
    await anvil.load(JSON.parse(json)); await idle();
    var cs2 = rfCZLast('csys');
    assert(cs2 && rfCZRec(cs2) && rfCZRec(cs2).origin[0] === 40, 'save / load keeps the csys');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'csys at (40, 0, 10), mass in frame';
  });

  step('rfCZ: Revolve lists reference axes; a sketch on Front revolved about an Axis from two points (origin → (0, 10, 0)) is the exact ring; double-click edit of the Axis reopens its PM with the boxes filled', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("mm");\nvar a = p.axis("points", ["origin", [0, 10, 0]]);\np.sketch("Front").rect(10, 0, 10, 10).end();'); await idle();
    var ax = rfCZLast('refaxis'), sk = rfCZLast('sketch');
    UI.App.sel = { kind: 'feature', id: sk.id };
    UI.cmdRevolve(false); await idle();
    var sel = D.querySelector('#pm select[data-key="axis"]');
    assert(sel && Array.prototype.some.call(sel.options, function (o) { return o.value === 'ref:' + ax.id && o.textContent === 'Axis1'; }), 'Revolve lists Axis1');
    setInput(sel, 'ref:' + ax.id); await idle();
    await pmAccept();
    var rv = rfCZLast('revolve');
    assert(rv && rv.axisRef === ax.id && !UI.App.build.errors[rv.id], 'revolve about Axis1: ' + JSON.stringify(UI.App.build.errors));
    var v = anvil.mass().volume, want = Math.PI * 300 * 10;
    assert(Math.abs(v - want) < 1e-6 * want, 'ring volume ' + v);
    UI.editFeature(ax); await idle();
    assert(UI.pmTitle() === 'Axis1' && rfCZBoxes().filter(function (b) { return /Origin|Vertex/.test(b); }).length === 2, 'edit shows the boxes: ' + JSON.stringify(rfCZBoxes()));
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'V = ' + v.toFixed(3);
  });

  step('rfCZ: as a SolidWorks user — click the boss\'s cylindrical face, then Axis: the type is Cylindrical/Conical Face and the box is filled; the axis is the boss axis; Circular Pattern lists it; tree ▸ Hide hides it and Show brings it back; Delete warns that CirPattern1 goes too (Cancel keeps both); OK deletes both and Undo brings them back', async function () {
    var errs0 = errors.length;
    await rfCZPart();
    selClick(rfCZScr([35, 15, 15])); await idle(); await wait(20);
    assert(UI.App.sel && UI.App.sel.kind === 'face', 'the boss face is selected: ' + JSON.stringify(UI.App.sel && UI.App.sel.kind));
    rfCZFly('Axis'); await idle();
    assert(UI.pmSpec().values.kind === 'cyl' && /Face at/.test(rfCZBoxes()[0]), 'type and box from the pre-selection: ' + UI.pmSpec().values.kind + ' ' + JSON.stringify(rfCZBoxes()));
    await pmAccept();
    var ax = rfCZLast('refaxis'), R = rfCZRec(ax);
    assert(R && R.refgeo === 'axis', 'axis built: ' + JSON.stringify(UI.App.build.errors));
    rfCZNear([R.o[0], R.o[1]], [30, 15], 1e-9, 'boss axis'); rfCZNear([R.a[2], R.b[2]], [10, 20], 1e-9, 'extent = the face');
    UI.App.sel = { kind: 'feature', id: UI.App.model.features[5].id };
    UI.cmdCircularPattern(); await idle();
    var sel = D.querySelector('#pm select[data-key="axis"]');
    setInput(sel, 'ref:' + ax.id); await idle();
    UI.pmSetField('n', '3'); await idle();
    await pmAccept();
    var cp = rfCZLast('cpattern');
    assert(cp.axisRef === ax.id && !UI.App.build.errors[cp.id], 'pattern of the hole about the boss axis: ' + JSON.stringify(UI.App.build.errors));
    UI.App.sel = null; UI.App.hover = null;
    var lines = function () { return UI.groups.refgeo.children.filter(function (c) { return c.isLineSegments; }).length; };
    function axRow() { return Array.prototype.filter.call(D.querySelectorAll('.ti'), function (r) { return r.textContent.indexOf('Axis1') >= 0; })[0]; }
    assert(axRow(), 'Axis1 in the tree');
    axRow().dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 })); await wait(10);
    var hide = rfCZMenu('Hide');
    assert(hide, 'tree menu has Hide'); hide.click(); await idle();
    UI.App.sel = null; UI.updatePlanes();
    assert(lines() === 0 && ax.hidden === true, 'hidden: ' + lines());
    axRow().dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 })); await wait(10);
    rfCZMenu('Show').click(); await idle();
    UI.App.sel = null; UI.updatePlanes();
    assert(lines() === 1 && !ax.hidden, 'shown again');
    var n0 = UI.App.model.features.length;
    UI.deleteFeature(ax.id); await idle();
    assert(modalOpen() && /CirPattern1/.test($('modal-body').textContent), 'the delete warning names CirPattern1: ' + $('modal-body').textContent);
    clickModalButton('Cancel'); await idle();
    assert(UI.App.model.features.length === n0, 'Cancel keeps both');
    UI.deleteFeature(ax.id); await idle();
    var ok = Array.prototype.filter.call(D.querySelectorAll('#modal-buttons button'), function (b) { return b.classList.contains('primary'); })[0];
    ok.click(); await idle();
    assert(UI.App.model.features.length === n0 - 2 && !rfCZLast('refaxis') && !rfCZLast('cpattern'), 'both deleted: ' + UI.App.model.features.map(function (f) { return f.name; }).join(', '));
    UI.undoCommand(); await idle();
    assert(UI.App.model.features.length === n0 && rfCZRec(rfCZLast('refaxis')), 'undo brings them back');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'pre-selection, hide / show, delete cascade, undo';
  });

  step('rfCZ: the other types by real picks — Point ▸ Intersection of two edges, Point ▸ Along Curve Distance at 25 % (Percentage box), Axis ▸ One Line on a sketch line and on a side of a shown sketch rectangle, Coordinate System with Flip X', async function () {
    var errs0 = errors.length;
    await rfCZPart();
    rfCZFly('Point'); await idle();
    rfCZRadio('intersect'); await idle();
    selClick(rfCZScr([20, 30, 10])); await idle(); await wait(20);
    // regression (lane CZ): a long edge picked away from its middle was taken as hidden behind its own face
    var es = rfCZScr([40, 22, 10]), pe = UI.pickEdge(es[0], es[1]);
    assert(pe && Math.abs(pe.edge.a[0] - 40) < 1e-6 && Math.abs(pe.edge.b[0] - 40) < 1e-6, 'pickEdge finds the x = 40, z = 10 edge 7 from its middle: ' + JSON.stringify(pe && [pe.edge.a, pe.edge.b]));
    selClick(es); await idle(); await wait(20);
    assert(rfCZBoxes().filter(function (b) { return /Edge at/.test(b); }).length === 2, 'two edges picked: ' + JSON.stringify(rfCZBoxes()) + ' ' + statusText());
    await pmAccept();
    rfCZNear(rfCZRec(rfCZLast('refpoint')).p, [40, 30, 10], 1e-9, 'intersection');
    rfCZFly('Point'); await idle();
    rfCZRadio('along'); await idle();
    selClick(rfCZScr([20, 30, 10])); await idle(); await wait(20);
    var pc = Array.prototype.filter.call(D.querySelectorAll('#pm input[type=checkbox]'), function (c) { return c.dataset.key === 'percent'; })[0];
    assert(pc, 'Percentage box'); pc.click(); await idle();
    UI.pmSetField('distance', '25'); await idle();
    await pmAccept();
    var al = rfCZLast('refpoint');
    assert(al.kind === 'along' && al.percent === true && al.distance === 25, 'feature: ' + JSON.stringify(al));
    rfCZNear(rfCZRec(al).p, [10, 30, 10], 1e-9, '25 % along the top edge');
    await anvil.append('p.sketch("Front").line(0, -8, 40, -8).end();'); await idle();
    rfCZFly('Axis'); await idle();
    rfCZRadio('line'); await idle();
    selClick(rfCZScr([20, -8, 0])); await idle(); await wait(20);
    assert(/Line1@Sketch4/.test(rfCZBoxes()[0]), 'the sketch line is in the box: ' + JSON.stringify(rfCZBoxes()));
    await pmAccept();
    var ax = rfCZLast('refaxis'), R = rfCZRec(ax);
    assert(R && Math.abs(Math.abs(R.d[0]) - 1) < 1e-12 && Math.abs(R.o[1] + 8) < 1e-9 && Math.abs(R.o[2]) < 1e-9, 'axis on the sketch line: ' + JSON.stringify(R));
    UI.App.view.showSketches = true; UI.updateSketches();   // View ▸ All Sketches: the block's own sketch shows
    rfCZFly('Axis'); await idle();
    rfCZRadio('line'); await idle();
    selClick(rfCZScr([6, 0, 0])); await idle(); await wait(20);   // the bottom side of the block's sketch rectangle
    assert(/Side 1 of Rectangle 1@Sketch1/.test(rfCZBoxes()[0]), 'a rectangle side is a line: ' + JSON.stringify(rfCZBoxes()));
    UI.pmCancel(); await idle();
    UI.App.view.showSketches = false; UI.updateSketches();
    rfCZFly('Coordinate System'); await idle();
    var fx = Array.prototype.filter.call(D.querySelectorAll('#pm input[type=checkbox]'), function (c) { return c.dataset.key === 'flipX'; })[0];
    fx.click(); await idle();
    await pmAccept();
    var C = rfCZRec(rfCZLast('csys'));
    rfCZNear(C.x, [-1, 0, 0], 1e-12, 'flipped X'); rfCZNear(C.origin, [0, 0, 0], 0, 'at the origin');
    assert(Math.abs(K.vec.dot(K.vec.cross(C.x, C.y), C.z) - 1) < 1e-12, 'right-handed');
    var s = anvil.script();
    assert(/p\.point\("along", \[\{ edge: \[/.test(s) && /percent: true/.test(s) && /p\.axis\("line", \[\{ sketch: f\d+, entity: \d+ \}\]/.test(s) && /flipX: true/.test(s), 'the script writes them');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'intersection, along 25 %, sketch-line axis, flipped csys';
  });
