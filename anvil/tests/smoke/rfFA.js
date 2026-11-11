  // --- rfFA (2026-10-29, lane FA: Curves) --- the Features tab's Curves flyout and Insert ▸ Curve in SolidWorks' order
  // (Split Line greyed); Helix and Spiral from a sketched circle with its PropertyManager boxes, the curve drawn in the
  // viewport, swept into a spring through the Sweep PM's Path list (exact volume), edited from the tree; Curve Through
  // XYZ Points typed into its table (rows add, × deletes, a .sldcrv text loads); Composite Curve from three clicked
  // edges; Projected Curve onto a clicked cylinder face; Curve Through Reference Points from clicked sketch points.
  function rfFAScr(p) { var s = UI.worldToScreen(p); return [Math.round(s[0]), Math.round(s[1])]; }
  function rfFAFlyRows() {
    if (UI.closeMenus) UI.closeMenus();
    var w = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (x) { return x._fly && x._fly.fly === 'curves'; })[0];
    assert(w, 'Curves flyout on the Features tab');
    var c = w.querySelector('.rb-caret');
    c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); c.click();
    var m = D.querySelector('.menu');
    assert(m, 'the Curves menu opens');
    return Array.prototype.slice.call(m.querySelectorAll('.mi'));
  }
  function rfFAFly(text) {
    var row = rfFAFlyRows().filter(function (r) { return r.textContent.replace(/\s+/g, ' ').trim() === text; })[0];
    assert(row && !row.classList.contains('disabled'), text + ' is listed and enabled in the Curves flyout');
    row.click();
  }
  function rfFALast(type) { return UI.App.model.features.filter(function (f) { return f.type === type; }).pop(); }
  function rfFARec(f) { var g = UI.App.build.planes[f.id]; assert(g && g.refgeo === 'curve', 'curve record for ' + (f && f.name) + ': ' + JSON.stringify(UI.App.build.errors)); return g; }
  async function rfFAPart(code) {
    await anvil.newPart(); await idle();
    await anvil.run(code); await idle();
    UI.setRibbonTab('Features');
    UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(60);
  }

  step('rfFA: Curves flyout and Insert ▸ Curve list SolidWorks’ six commands in order, Split Line enabled (rfLQ); the flyout face is Helix and Spiral', async function () {
    await rfFAPart('p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);');
    var rows = rfFAFlyRows(), txt = rows.map(function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); });
    assert(JSON.stringify(txt) === JSON.stringify(['Split Line', 'Projected Curve', 'Composite Curve', 'Curve Through XYZ Points', 'Curve Through Reference Points', 'Helix and Spiral']), 'flyout rows: ' + JSON.stringify(txt));
    assert(!rows[0].classList.contains('disabled') && !rows[5].classList.contains('disabled'), 'Split Line (rfLQ) and Helix enabled');
    if (UI.closeMenus) UI.closeMenus(); await idle();
    var face = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (x) { return x._fly && x._fly.fly === 'curves'; })[0].querySelector('.rb-face');
    assert(face.dataset.icon === 'helix' && !face.disabled, 'the face runs Helix and Spiral: ' + face.dataset.icon);
    var cv = menuRows('Curve ▸').map(function (r) { return r.text.replace(/\s+/g, ' ').trim() + (r.row.classList.contains('disabled') ? ' (off)' : ''); });
    if (UI.closeMenus) UI.closeMenus();
    assert(JSON.stringify(cv) === JSON.stringify(['Curve ▸ Split Line…', 'Curve ▸ Projected…', 'Curve ▸ Composite…', 'Curve ▸ Curve Through XYZ Points…', 'Curve ▸ Curve Through Reference Points…', 'Curve ▸ Helix/Spiral…']), 'Insert ▸ Curve: ' + JSON.stringify(cv));
    return txt.length + ' rows';
  });

  step('rfFA: Helix and Spiral from the flyout on a sketched Ø1 circle: Pitch 0.25, 4 revolutions, Clockwise, previewed, ✓ makes Helix/Spiral1; Sweep picks it as the path and the spring has the exact volume; Edit Feature to 6 revolutions follows', async function () {
    var errs0 = errors.length;
    await rfFAPart('p.units("in");\nvar s = p.sketch("Top").circle(0, 0, 0.5).end();\np.sketch("Front").circle(0.5, 0, 0.05).end();');
    // SolidWorks: select the circle's sketch, then Helix and Spiral (with no selection Anvil takes the newest sketch with one circle)
    var row = D.querySelector('#tree [data-fid="' + UI.App.model.features[0].id + '"]');
    assert(row, 'Sketch1 in the tree'); row.click(); await idle();
    rfFAFly('Helix and Spiral'); await idle();
    assert(UI.pmTitle() === 'Helix/Spiral', 'Helix PM: ' + UI.pmTitle());
    assert(+pmField('Sketch').value === UI.App.model.features[0].id, 'the selected sketch: ' + pmField('Sketch').value);
    var type = pmField('Type');
    assert(type && type.value === 'pitchRev', 'Defined By: Pitch and Revolution');
    setInput(pmField('Pitch'), '0.25'); await idle();
    setInput(pmField('Revolutions'), '4'); await idle();
    var cw = D.querySelector('#pm input[type=radio][value="true"]');
    assert(cw, 'Clockwise radio'); cw.click(); await idle();
    assert(UI.groups.preview.children.length > 0, 'the helix is previewed');
    assert(/length/.test(statusText()), 'status shows the length: ' + statusText());
    setInput(type, 'heightRev'); await idle();
    assert(pmField('Height') && !pmField('Pitch'), 'Height and Revolution shows Height, hides Pitch');
    setInput(pmField('Type'), 'pitchRev'); await idle();
    await pmAccept();
    var h = rfFALast('helix');
    assert(h && h.name === 'Helix/Spiral1' && h.clockwise === true && +h.pitch === 0.25 && +h.revolutions === 4, 'feature: ' + JSON.stringify(h));
    var g = rfFARec(h), L = 4 * Math.hypot(Math.PI, 0.25);
    near(g.length, L, 1e-9, 'helix length');
    assert(UI.groups.refgeo.children.length > 0, 'the helix is drawn in the viewport');
    // the Sweep PM offers the curve as its path (and starts with it)
    var sw = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return /Swept Boss\/Base/.test(b.textContent); })[0];
    assert(sw, 'Swept Boss/Base button'); sw.click(); await idle();
    var path = pmField('Path');
    assert(path && +path.value === h.id && Array.prototype.some.call(path.options, function (o) { return o.textContent === 'Helix/Spiral1'; }), 'Path is Helix/Spiral1: ' + (path && path.value));
    await pmAccept();
    var sweep = rfFALast('sweep');
    assert(sweep && sweep.path === h.id && !UI.App.build.errors[sweep.id], 'Sweep1 along the helix: ' + JSON.stringify(UI.App.build.errors));
    var v = anvil.mass().volume;
    near(v, Math.PI * 0.0025 * L, 1e-7 * L, 'spring volume');
    UI.editFeature(h); await idle();
    assert(UI.pmTitle() === 'Helix/Spiral1', 'edit opens Helix/Spiral1: ' + UI.pmTitle());
    setInput(pmField('Revolutions'), '6'); await idle();
    await pmAccept();
    near(anvil.mass().volume, Math.PI * 0.0025 * 6 * Math.hypot(Math.PI, 0.25), 1e-6, 'the spring follows the helix');
    assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    return 'V ' + fmt(v);
  });

  step('rfFA: Curve Through XYZ Points: typing in the * row adds points, × deletes one, a .sldcrv text loads, ✓ makes Curve1 through every point', async function () {
    await rfFAPart('p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);');
    rfFAFly('Curve Through XYZ Points'); await idle();
    assert(UI.pmTitle() === 'Curve Through XYZ Points', 'PM: ' + UI.pmTitle());
    function cell(i, k) { return D.querySelector('#pm input.fa-xyz[data-fa-i="' + i + '"][data-fa-k="' + k + '"]'); }
    setInput(cell(0, 0), '0'); await idle();
    setInput(cell(1, 0), '10'); await idle();
    setInput(cell(2, 0), '20'); await idle(); setInput(cell(2, 1), '5'); await idle();
    setInput(cell(3, 2), '7'); await idle();
    var v = UI.pmSpec() && D.querySelectorAll('#pm input.fa-xyz').length;
    assert(v === 15, 'four points and the * row: ' + v);
    D.querySelector('#pm .fa-xyz-del[data-fa-i="3"]').click(); await idle();
    assert(D.querySelectorAll('#pm input.fa-xyz').length === 12, 'one point deleted');
    assert(UI.groups.preview.children.length > 0, 'previewed');
    assert(UI.curveXYZLoadText('0 0 0\n10mm 0 0\n20 5 0\n30 5 10'), 'a .sldcrv text loads');
    assert(D.querySelectorAll('#pm input.fa-xyz').length === 15, 'four points read');
    await pmAccept();
    var f = rfFALast('xyzCurve'), g = rfFARec(f);
    assert(f.name === 'Curve1' && f.points.length === 4, 'feature: ' + JSON.stringify(f));
    [[0, 0, 0], [10, 0, 0], [20, 5, 0], [30, 5, 10]].forEach(function (q) { assert(g.pts.some(function (p) { return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-9; }), 'through ' + q); });
    assert(/p\.xyzCurve\(\[\[0,0,0\],\[10,0,0\],\[20,5,0\],\[30,5,10\]\]/.test(anvil.script()), 'script: ' + anvil.script());
    return g.pts.length + ' samples';
  });

  step('rfFA: Composite Curve from three clicked top edges of a block (110 long) and Projected Curve of a line onto a clicked cylinder face (on it exactly)', async function () {
    await rfFAPart('p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);');
    rfFAFly('Composite Curve'); await idle();
    assert(UI.pmTitle() === 'Composite Curve', 'PM: ' + UI.pmTitle());
    selClick(rfFAScr([20, 0, 10])); await idle(); await wait(20);
    selClick(rfFAScr([40, 15, 10])); await idle(); await wait(20);
    selClick(rfFAScr([20, 30, 10])); await idle(); await wait(20);
    var c = rfFALast('compositeCurve');
    assert(D.querySelectorAll('#pm .pm-item').length === 3, 'three entities listed: ' + D.querySelectorAll('#pm .pm-item').length);
    await pmAccept();
    c = rfFALast('compositeCurve');
    assert(c && c.name === 'CompCurve1' && c.edges.length === 3, 'feature: ' + JSON.stringify(c));
    near(rfFARec(c).length, 110, 1e-9, 'joined length');
    await rfFAPart('p.units("mm");\np.sketch("Front").circle(0, 0, 10).end().extrude(40);\np.sketch("Top").line(-20, -5, 20, -30).end();');
    rfFAFly('Projected Curve'); await idle();
    assert(UI.pmTitle() === 'Projected Curve', 'PM: ' + UI.pmTitle());
    selClick(rfFAScr([0, 10, 20])); await idle(); await wait(20);
    assert(D.querySelectorAll('#pm .pm-item').length === 1, 'one face listed');
    await pmAccept();
    var pc = rfFALast('projCurve'), g = rfFARec(pc);
    assert(pc.faces.length === 1 && pc.name === 'Curve1', 'feature: ' + JSON.stringify(pc));
    g.pts.forEach(function (p) { near(Math.hypot(p[0], p[1]), 10, 1e-9, 'on the cylinder'); });
    return 'composite + projected';
  });

  step('rfFA: Curve Through Reference Points from three clicked sketch line ends; ✓+ starts another; Insert ▸ Curve ▸ Helix/Spiral without a circle explains what it needs', async function () {
    await rfFAPart('p.units("mm");\np.sketch("Front").line(0, 0, 20, 10).line(20, 10, 40, 0).end();');
    UI.setView('Front'); UI.zoomToFit(); await idle(); await wait(40);
    rfFAFly('Curve Through Reference Points'); await idle();
    assert(UI.pmTitle() === 'Curve Through Reference Points', 'PM: ' + UI.pmTitle());
    assert(D.querySelector('#pm .pm-okplus'), 'the ✓+ button is offered');
    selClick(rfFAScr([0, 0, 0])); await idle(); await wait(20);
    selClick(rfFAScr([20, 10, 0])); await idle(); await wait(20);
    selClick(rfFAScr([40, 0, 0])); await idle(); await wait(20);
    assert(D.querySelectorAll('#pm .pm-item').length === 3, 'three points listed: ' + D.querySelectorAll('#pm .pm-item').length);
    await pmAccept();
    var f = rfFALast('refPtCurve'), g = rfFARec(f);
    assert(f.points.length === 3 && g.pts.some(function (p) { return Math.hypot(p[0] - 20, p[1] - 10) < 1e-9; }), 'through the middle point: ' + JSON.stringify(f.points));
    UI.cmdHelix(); await idle();
    assert(!UI.pmSpec() && /one circle/.test(statusText()), 'no circle: ' + statusText());
    return 'ok';
  });
