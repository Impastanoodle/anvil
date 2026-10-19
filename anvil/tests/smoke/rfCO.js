  // --- rfCO (2026-10-19, lane CO: Selected Contours) --- the Boss-Extrude / Cut-Extrude PropertyManager's Selected
  // Contours box (bottom of the PM, as in SolidWorks): it starts active on a sketch whose regions are ambiguous for a
  // plain extrude, hovering the graphics area lights the sketch region under the pointer, a click toggles it, the rows
  // read Sketch1-Region<1>, the result extrudes only the picked regions, Edit Feature reopens with the rows, Delete on a
  // row removes it, Esc leaves the feature as it was, save / load keeps the picks. Real mouse events through
  // selEv / selClick (selection.js).
  var rfCOSplit = 'p.units("mm");\np.sketch("Front").rect(0, -2, 4, 2).line(1, -2, 1, 0).end();';
  function rfCOPlane() { var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; }).pop(); return K.resolvePlane(sk.plane, UI.App.model, UI.App.build && UI.App.build.planes); }
  function rfCOScr(uv) { var pl = rfCOPlane(), s = UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); return [Math.round(s[0]), Math.round(s[1])]; }
  function rfCOBox() { return Array.prototype.filter.call(D.querySelectorAll('#pm .pm-pick'), function (b) { return /sketch regions|contour/.test(b.textContent); })[0] || null; }
  function rfCORows() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-list .pm-item'), function (r) { return r.textContent.trim(); }); }
  function rfCOFills() { return UI.groups.highlight.children.filter(function (c) { return c.userData && c.userData.sketchRegion != null; }).map(function (c) { return c.userData.sketchRegion; }); }
  function rfCOGroupTitles() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-group h4 .pm-gt'), function (t) { return t.textContent.trim(); }); }

  step('rfCO: Boss-Extrude on a 4 × 2 rect split by a line — the Selected Contours box is the last group and starts active (the sketch is ambiguous); hovering the left region lights it (one fill in the highlight group), hovering off the sketch lights nothing; a click adds Sketch1-Region<1>, a second click on it removes it', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(rfCOSplit); await idle();
    UI.setView('Front'); UI.zoomToFit(); await idle(); await wait(50);
    UI.cmdExtrude(false); await idle(); await wait(30);
    assert(UI.pmTitle() === 'Boss-Extrude', 'Boss-Extrude open: ' + UI.pmTitle());
    var titles = rfCOGroupTitles();
    assert(titles.length && /Selected Contours/.test(titles[titles.length - 1]), 'Selected Contours is the last group: ' + JSON.stringify(titles));
    var box = rfCOBox();
    assert(box && box.classList.contains('active'), 'the box starts active on an ambiguous sketch');
    var left = rfCOScr([0.5, -1]), right = rfCOScr([3, -1]), off = rfCOScr([4.6, -1]);
    selEv('mousemove', left); await wait(20);
    assert(UI.App.hover && UI.App.hover.kind === 'region' && UI.App.hover.index === 0, 'hover is the left region: ' + JSON.stringify(UI.App.hover && { kind: UI.App.hover.kind, index: UI.App.hover.index }));
    assert(rfCOFills().length === 1 && rfCOFills()[0] === 0, 'one fill drawn for region 0: ' + JSON.stringify(rfCOFills()));
    assert(off[0] > 0 && off[0] < UI.size.w && off[1] > 0 && off[1] < UI.size.h, "the off-sketch point is inside the viewport: " + JSON.stringify(off)); selEv("mousemove", off); await wait(20);
    assert(!UI.App.hover, 'nothing hovered off the sketch: ' + JSON.stringify(UI.App.hover));
    assert(rfCOFills().length === 0, 'no fill off the sketch');
    selClick(left); await idle(); await wait(30);
    assert(rfCORows().length === 1 && rfCORows()[0] === 'Sketch1-Region<1>', 'one row: ' + JSON.stringify(rfCORows()));
    assert(UI.pmSpec().values.contours.length === 1, 'one pick stored');
    assert(rfCOFills().indexOf(0) >= 0, 'the picked region is filled (and the pointer still over it lights it too): ' + JSON.stringify(rfCOFills()));
    selClick(left); await idle(); await wait(30);
    assert(rfCORows().length === 0 && UI.pmSpec().values.contours.length === 0, 'clicked again: removed');
    selClick(right); await idle(); await wait(30);
    assert(rfCORows().length === 1 && rfCORows()[0] === 'Sketch1-Region<2>', 'the right region is Region<2>: ' + JSON.stringify(rfCORows()));
    selClick(left); await idle(); await wait(30);
    assert(rfCORows().join('|') === 'Sketch1-Region<2>|Sketch1-Region<1>', 'rows in pick order: ' + JSON.stringify(rfCORows()));
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'box active, hover fill, click toggles, rows named';
  });

  step('rfCO: with the left region picked and depth 0.5, the preview and the accepted Boss-Extrude are the left region only (volume 1 · 2 · 0.5 = 1, the feature holds one contour point inside it); the script carries `contours`; save / load keeps the pick and rebuilds to the same volume', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(rfCOSplit); await idle();
    UI.setView('Front'); UI.zoomToFit(); await idle(); await wait(50);
    UI.cmdExtrude(false); await idle(); await wait(30);
    selClick(rfCOScr([0.5, -1])); await idle(); await wait(30);
    assert(rfCORows().length === 1, 'the left region picked: ' + JSON.stringify(rfCORows()));
    var inp = pmField('Depth');
    assert(inp, 'Depth field');
    setInput(inp, 0.5); pressEnter(inp); await idle();
    await UI.previewIdle(); await wait(30);
    var pv = UI.groups.preview.children[0];
    assert(pv && pv.geometry, 'a preview mesh is shown');
    var bb = new W.THREE.Box3().setFromObject(pv);
    near(bb.max.x - bb.min.x, 1, 1e-6, 'preview spans the left region only (1 wide)'); near(bb.max.z - bb.min.z, 0.5, 1e-6, 'preview depth 0.5');
    await pmAccept(); await wait(30);
    assert(!UI.hasPM(), 'PM closed');
    var feats = anvil.model().features, ex = feats[1];
    assert(ex && ex.type === 'extrude' && Array.isArray(ex.contours) && ex.contours.length === 1, 'the feature holds one contour: ' + JSON.stringify(ex && ex.contours));
    assert(ex.contours[0][0] > 0 && ex.contours[0][0] < 1 && ex.contours[0][1] > -2 && ex.contours[0][1] < 0, 'the point lies inside the left region: ' + JSON.stringify(ex.contours));
    near(anvil.mass().volume, 1, 1e-6, 'volume = left region × 0.5');
    assert(!anvil.features()[1].error, 'no feature error');
    assert(/contours: \[\[[-0-9.]+,[-0-9.]+\]\]/.test(anvil.script()), 'the script carries contours: ' + anvil.script().split('\n').pop());
    var json = JSON.stringify(anvil.model());
    await anvil.newPart(); await idle();
    await anvil.load(json); await idle(); await wait(30);
    assert(anvil.model().features[1].contours.length === 1, 'loaded with the pick');
    near(anvil.mass().volume, 1, 1e-6, 'loaded part rebuilds the picked region');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'preview 1 wide, volume 1, script + load keep the pick';
  });

  step('rfCO: Edit Feature reopens Boss-Extrude1 with its row Sketch1-Region<1> and the region filled; Delete on the row removes it (preview goes to the whole sketch); Esc leaves the feature as it was (one contour, volume 1); picking the other region too and accepting gives volume 4', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(rfCOSplit + '\np.extrude(0.5, { contours: [[0.5, -1]] });'); await idle();
    UI.setView('Front'); UI.zoomToFit(); await idle(); await wait(50);
    near(anvil.mass().volume, 1, 1e-6, 'start: the left region');
    var ex = UI.App.model.features[1];
    UI.editFeature(ex); await idle(); await wait(50);
    assert(UI.hasPM() && /Boss-Extrude1/.test(UI.pmTitle()), 'edit PM open: ' + UI.pmTitle());
    assert(rfCORows().length === 1 && rfCORows()[0] === 'Sketch1-Region<1>', 'reopened with its row: ' + JSON.stringify(rfCORows()));
    assert(rfCOFills().length === 1, 'the picked region is filled while editing: ' + JSON.stringify(rfCOFills()));
    var row = D.querySelector('#pm .pm-list .pm-item');
    row.focus(); await wait(10);
    row.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await idle(); await wait(30);
    assert(rfCORows().length === 0 && UI.pmSpec().values.contours.length === 0, 'Delete on the row removed it: ' + JSON.stringify(rfCORows()));
    await UI.previewIdle(); await wait(30);
    var pv = UI.groups.preview.children[0];
    assert(pv && pv.geometry, 'preview shown');
    var bb = new W.THREE.Box3().setFromObject(pv);
    near(bb.max.x - bb.min.x, 4, 1e-6, 'with no picks the preview is the whole sketch (4 wide)');
    selKey('Escape'); await idle(); await wait(30);
    assert(!UI.hasPM(), 'Esc closed the PM');
    assert(UI.App.model.features[1].contours.length === 1, 'Esc kept the feature as it was');
    near(anvil.mass().volume, 1, 1e-6, 'volume unchanged after Esc');
    UI.editFeature(UI.App.model.features[1]); await idle(); await wait(50);
    var box = rfCOBox();
    assert(box && box.classList.contains('active'), 'the box is active on the ambiguous sketch when editing');
    selClick(rfCOScr([3, -1])); await idle(); await wait(30);
    assert(rfCORows().length === 2, 'both regions picked: ' + JSON.stringify(rfCORows()));
    await pmAccept(); await wait(30);
    assert(UI.App.model.features[1].contours.length === 2, 'two picks saved');
    near(anvil.mass().volume, 4, 1e-6, 'both regions: volume 4');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'edit reopens with rows, Delete removes, Esc keeps, both regions = 4';
  });

  step('rfCO: on a plain rect (not ambiguous) the box starts inactive and hovering pre-highlights faces as usual; clicking the box activates it (magenta), then a click on the sketch picks the region and a click off it selects nothing; Cut-Extrude through all on a split sketch with the right region picked removes only that region (8 − 6 = 2)', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, -2, 4, 2).end();'); await idle();
    UI.setView('Front'); UI.zoomToFit(); await idle(); await wait(50);
    UI.cmdExtrude(false); await idle(); await wait(30);
    var box = rfCOBox();
    assert(box && !box.classList.contains('active'), 'the box starts inactive on a plain rect');
    selEv('mousemove', rfCOScr([2, -1])); await wait(20);
    assert(!UI.App.hover || UI.App.hover.kind !== 'region', 'no region hover while the box is inactive: ' + JSON.stringify(UI.App.hover && UI.App.hover.kind));
    box.click(); await wait(20);
    box = rfCOBox();
    assert(box && box.classList.contains('active'), 'clicking the box activates it');
    selEv('mousemove', rfCOScr([2, -1])); await wait(20);
    assert(UI.App.hover && UI.App.hover.kind === 'region', 'now the region under the pointer is hovered');
    selClick(rfCOScr([2, -1])); await idle(); await wait(30);
    assert(rfCORows().length === 1 && rfCORows()[0] === 'Sketch1-Region<1>', 'the rect is Region<1>: ' + JSON.stringify(rfCORows()));
    selClick(rfCOScr([4.6, -1])); await idle(); await wait(30);
    assert(rfCORows().length === 1 && !UI.App.sel, 'a click off the sketch picks and selects nothing');
    await pmAccept(); await wait(30);
    near(anvil.mass().volume, 80, 1e-6, 'accepted: the rect × the default depth 10');
    assert(anvil.model().features[1].contours.length === 1, 'the pick is saved: ' + JSON.stringify(anvil.model().features[1].contours));
    // a cut with one region of a split sketch
    await anvil.newPart(); await idle();
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, -2, 4, 2).end().extrude(1);\np.sketch("Front", 1).rect(0, -2, 4, 2).line(1, -2, 1, 0).end();'); await idle();
    UI.setView('Front'); UI.zoomToFit(); await idle(); await wait(50);
    near(anvil.mass().volume, 8, 1e-6, 'the block');
    UI.cmdExtrude(true); await idle(); await wait(30);
    assert(UI.pmTitle() === 'Cut-Extrude' && rfCOBox() && rfCOBox().classList.contains('active'), 'Cut-Extrude with the box active: ' + UI.pmTitle());
    selClick(rfCOScr([3, -1])); await idle(); await wait(30);
    assert(rfCORows().length === 1 && rfCORows()[0] === 'Sketch2-Region<2>', 'the right region of Sketch2: ' + JSON.stringify(rfCORows()));
    await pmAccept(); await wait(30);
    assert(!anvil.features()[3].error, 'the cut built: ' + anvil.features()[3].error);
    near(anvil.mass().volume, 2, 1e-6, 'only the right region cut away: 8 − 6 = 2');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'inactive on a plain rect, activates on click, cut of one region = 2';
  });
