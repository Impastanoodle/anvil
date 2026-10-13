  // ---- rfAW (2026-10-13): Sketch Picture, spline leftovers, Split Entities folded into ui-sketch-construct.js
  async function rfAWNew(ents) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);   // 0.25 units per pixel
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    UI.App.gridStale = true; UI.updateSketches(); await wait(20);
    return f;
  }
  function rfAWScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfAWEv(type, uv, target, button) {
    var r = $('viewport').getBoundingClientRect(), p = rfAWScr(uv), b = button || 0;
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: b, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : (b === 2 ? 2 : 1), clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfAWClick(uv) { rfAWEv('mousemove', uv); rfAWEv('mousedown', uv, $('viewport')); rfAWEv('mouseup', uv); }
  function rfAWRight(uv) { rfAWEv('mousemove', uv); rfAWEv('mousedown', uv, $('viewport'), 2); rfAWEv('mouseup', uv, W, 2); }
  function rfAWMenu() { var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1]; return m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : []; }
  function rfAWSet(key, val) { var i = D.querySelector('#pm [data-key="' + key + '"]'); assert(i, 'field ' + key); if (i.type === 'checkbox' || i.type === 'radio') { if (i.checked !== !!val) i.click(); return; } i.value = String(val); i.dispatchEvent(new W.Event('input', { bubbles: true })); i.dispatchEvent(new W.Event('change', { bubbles: true })); }
  // a 200 x 100 px PNG drawn in the page: white, a black frame and a red bar 100 px long from (50, 50)
  function rfAWPng() {
    var cv = D.createElement('canvas'); cv.width = 200; cv.height = 100;
    var g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 200, 100);
    g.strokeStyle = '#000000'; g.lineWidth = 2; g.strokeRect(1, 1, 198, 98);
    g.fillStyle = '#ff0000'; g.fillRect(50, 48, 100, 4);
    return cv.toDataURL('image/png');
  }
  async function rfAWUntil(fn, ms, what) { var t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > (ms || 3000)) fail('timed out waiting for ' + what); await wait(20); } }
  step('rfAW: Sketch Picture — Tools ▸ Sketch Tools ▸ Sketch Picture… takes a PNG from the file box; it lies behind the sketch, its PropertyManager sizes it (Lock aspect ratio), flips it and makes it transparent; ✗ on a new one takes it out, one undo step', async function () {
    var errs0 = errors.length, f = await rfAWNew([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }]);
    var rows = menuRows('Sketch Tools ▸ Sketch Picture');
    assert(rows.length === 1 && !rows[0].row.classList.contains('disabled'), 'menu row');
    var u0 = UI.App.undo.length;
    rows[0].row.click(); await idle();
    var inp = $('sk-picture-file');
    assert(inp && inp.type === 'file' && /png/.test(inp.accept) && /bmp/.test(inp.accept), 'file box: ' + (inp && inp.accept));
    var src = rfAWPng(), bin = W.atob(src.split(',')[1]), bytes = new W.Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    var dt = new W.DataTransfer(); dt.items.add(new W.File([bytes], 'print.png', { type: 'image/png' }));
    inp.files = dt.files; inp.dispatchEvent(new W.Event('change', { bubbles: true }));
    await rfAWUntil(function () { return UI.pmTitle() === 'Sketch Picture'; }, 4000, 'the Sketch Picture PM');
    var p = f.pictures && f.pictures[0];
    assert(p && /^data:image\/png/.test(p.src) && p.px[0] === 200 && p.px[1] === 100 && p.file === 'print.png', 'picture record: ' + (p && JSON.stringify({ px: p.px, file: p.file })));
    near(p.h / p.w, 0.5, 1e-9, 'aspect'); near(p.x, 0, 0, 'lower-left at the origin');
    await rfAWUntil(function () { return UI.sketchPictureObjects().length === 1; }, 3000, 'the picture in the scene');
    var mesh = UI.sketchPictureObjects()[0];
    assert(mesh.material.map && mesh.renderOrder < 0 && !mesh.material.depthWrite, 'textured, behind the sketch');
    assert(f.entities.length === 1, 'not a sketch entity');
    // on screen: the red bar across the picture's middle, white beside it
    var shot = new W.Image(); shot.src = await anvil.png(); await new Promise(function (res) { shot.onload = res; });
    var cv = D.createElement('canvas'); cv.width = shot.width; cv.height = shot.height; var gx = cv.getContext('2d'); gx.drawImage(shot, 0, 0);
    function rfAWPx(u, v) { var s = rfAWScr([u, v]), k = shot.width / UI.size.w; return gx.getImageData(Math.round(s[0] * k), Math.round(s[1] * k), 1, 1).data; }
    var red = rfAWPx(p.w * 0.6, p.h * 0.5), white = rfAWPx(p.w * 0.3, p.h * 0.8);
    assert(red[0] > 200 && red[1] < 80 && red[2] < 80, 'red bar drawn: ' + Array.prototype.slice.call(red));
    assert(white[0] > 230 && white[1] > 230 && white[2] > 230, 'white paper drawn: ' + Array.prototype.slice.call(white));
    rfAWSet('w', 80); await wait(10);
    near(p.w, 80, 1e-9, 'width'); near(p.h, 40, 1e-9, 'Lock aspect ratio: height follows');
    rfAWSet('lock', false); rfAWSet('h', 30); await wait(10);
    near(p.w, 80, 1e-9, 'unlocked: width stays'); near(p.h, 30, 1e-9, 'height');
    rfAWSet('flipH', true); rfAWSet('ang', 10); await wait(10);
    assert(p.flipH && p.ang === 10, 'flip / angle');
    var uv = UI.sketchPictureObjects()[0].geometry.attributes.uv.array;
    assert(uv[0] === 1 && uv[2] === 0, 'flipped texture: ' + Array.prototype.slice.call(uv, 0, 4));
    rfAWSet('tmode:full', true); await wait(10);
    var sl = $('sk-pic-alpha');
    assert(sl && sl.type === 'range', 'transparency slider');
    sl.value = '40'; sl.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(10);
    near(p.alpha, 0.4, 1e-9, 'transparency');
    near(UI.sketchPictureObjects()[0].material.opacity, 0.6, 1e-9, 'material opacity');
    rfAWSet('tmode:user', true); await wait(10);
    assert(p.tmode === 'user' && $('sk-pic-key') && D.querySelector('#pm [data-key="keyTol"]'), 'user-defined colour and tolerance');
    assert(UI.App.undo.length === u0 + 1, 'one undo step so far: ' + (UI.App.undo.length - u0));
    await UI.pmOK(); await idle();
    assert(f.pictures.length === 1 && UI.pmTitle() == null, 'kept');
    UI.undo(); await idle();
    var g = UI.activeSketchFeature();
    assert(UI.App.mode === 'sketch' && g && !(g.pictures && g.pictures.length), 'undo takes it out');
    UI.redo(); await idle();
    g = UI.activeSketchFeature();
    assert(g.pictures && g.pictures.length === 1 && g.pictures[0].w === 80, 'redo puts it back');
    // a second one, then ✗: it goes again with no undo step left behind
    var u1 = UI.App.undo.length;
    var i2 = await UI.insertSketchPicture(src, 'two.png');
    assert(i2 === 1 && g.pictures.length === 2 && UI.pmTitle() === 'Sketch Picture', 'second picture');
    UI.pmCancel(); await idle();
    assert(g.pictures.length === 1 && UI.App.undo.length === u1, '✗ took it out: ' + g.pictures.length + ', undo ' + (UI.App.undo.length - u1));
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    await UI.exitSketch(); await idle();
    return p.w + ' × ' + p.h;
  });
  step('rfAW: Sketch Picture scale tool — two clicks on the picture (on the ends of a line traced along its scale bar) and the real distance typed: the picture scales about the first click', async function () {
    var f = await rfAWNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }]);
    var i = await UI.insertSketchPicture(rfAWPng(), 'print.png', { noPM: true });
    var p = f.pictures[i];
    // put it at 40 × 20 from (-10, -5): the red bar (px 50 … 150 at row 50) runs from (0, 0) to (20, 0)
    p.x = -10; p.y = -5; p.w = 40; p.h = 20; UI.updateSketches();
    UI.editSketchPicture(i); await idle();
    assert(UI.pmTitle() === 'Sketch Picture', 'PM');
    rfAWSet('scaleTool', true); await wait(10);
    rfAWClick([0.5, 0.25]); await wait(10);
    assert(!$('sk-pic-scale'), 'no distance box after one click');
    rfAWClick([19.5, -0.25]); await wait(30);
    var box = $('sk-pic-scale'), inp = box && box.querySelector('input');
    assert(inp, 'distance box');
    near(+inp.value, 20, 1e-6, 'measured distance shown');
    inp.value = '50'; inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(10);
    near(p.w, 100, 1e-6, 'width ×2.5'); near(p.h, 50, 1e-6, 'height ×2.5');
    near(p.x, -25, 1e-6, 'about the first click: x'); near(p.y, -12.5, 1e-6, 'y');
    assert(!$('sk-pic-scale') && D.querySelector('#pm [data-key="scaleTool"]').checked === false, 'scale tool done');
    assert(D.querySelector('#pm [data-key="w"]').value === '100', 'Width field shows it: ' + D.querySelector('#pm [data-key="w"]').value);
    await UI.pmOK(); await idle();
    // the script and a save / load keep it
    var code = anvil.script();
    assert(/\.picture\(/.test(code), 'script line');
    await UI.exitSketch(); await idle();
    var json = JSON.stringify(anvil.model());
    await anvil.load(json); await idle();
    var s = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(s.pictures && s.pictures[0].w === 100 && s.pictures[0].src === p.src, 'saved and loaded');
    await rfAWUntil(function () { return UI.sketchPictureObjects().length === 1; }, 3000, 'the picture shown with its sketch');
    return 'w ' + s.pictures[0].w;
  });
  step('rfAW: Sketch Picture right-click — Edit Sketch Picture opens its PropertyManager, Delete takes it out (one undo step)', async function () {
    var f = await rfAWNew();
    await UI.insertSketchPicture(rfAWPng(), 'a.png', { noPM: true });
    var p = f.pictures[0];
    p.x = 0; p.y = 0; p.w = 40; p.h = 20; UI.updateSketches();
    rfAWRight([5, 15]); await wait(20);
    var rows = rfAWMenu(), labels = rows.map(function (r) { return r.textContent; });
    var ed = rows.filter(function (r) { return /Edit Sketch Picture/.test(r.textContent); })[0];
    assert(ed && rows.some(function (r) { return /^\s*Delete/.test(r.textContent.replace('✓', '')); }), 'menu: ' + labels.join(' | '));
    ed.click(); await idle();
    assert(UI.pmTitle() === 'Sketch Picture' && UI.sketchPictureEditing() === 0, 'PM open');
    UI.pmCancel(); await idle();
    rfAWRight([60, 15]); await wait(20);
    assert(!rfAWMenu().some(function (r) { return /Edit Sketch Picture/.test(r.textContent); }), 'not off the picture');
    if (UI.closeMenus) UI.closeMenus();
    var u0 = UI.App.undo.length;
    rfAWRight([5, 15]); await wait(20);
    var del = rfAWMenu().filter(function (r) { return /Delete/.test(r.textContent) && !/Relations/.test(r.textContent); })[0];
    del.click(); await idle();
    assert(!f.pictures && UI.App.undo.length === u0 + 1, 'deleted, one step');
    UI.undo(); await idle();
    assert(UI.activeSketchFeature().pictures.length === 1, 'undo brings it back');
    await UI.exitSketch(); await idle();
    return labels.length + ' rows';
  });
  function rfAWDev(a, b) {   // how far curve b strays from curve a (samples of a, closest points on b)
    var S = W.SketchSolver, fa = S.freeCurve(a), fb = S.freeCurve(b), m = 0;
    S.freePts(fa, fa.t0, fa.t1).forEach(function (q) { m = Math.max(m, S.freeClosest(fb, q).d); });
    return m;
  }
  step('rfAW: Insert Spline Point on a closed spline — Tools ▸ Spline Tools ▸ Insert Spline Point, a click on it: one more point after the span clicked, the curve the same, one undo step', async function () {
    var errs0 = errors.length;
    var sp = { t: 'spline', closed: true, pts: [[0, 0], [30, -5], [40, 20], [20, 35], [-5, 20]] };
    var f = await rfAWNew([JSON.parse(JSON.stringify(sp))]);
    W.SketchSolver.addRelation(f, 'fix', ['0.v2']);
    var rows = menuRows('Spline Tools ▸ Insert Spline Point');
    assert(rows.length === 1, 'menu row');
    rows[0].row.click(); await idle();
    assert(UI.pmTitle() === 'Insert Spline Point', 'PM ' + UI.pmTitle());
    var fc = W.SketchSolver.freeCurve(f.entities[0]), P = fc.pt(2.4);   // in the span from point 3 to point 4
    var u0 = UI.App.undo.length;
    rfAWClick(P); await idle();
    var e = UI.activeSketchFeature().entities[0];
    assert(e.closed && e.pts.length === 6, 'six points: ' + JSON.stringify(e.pts));
    assert(Math.hypot(e.pts[3][0] - P[0], e.pts[3][1] - P[1]) < 0.3, 'the new point is point 4: ' + e.pts[3] + ' vs ' + P);
    assert(e.pts[0][0] === 0 && e.pts[4][0] === 20 && e.pts[5][0] === -5, 'the old points keep their order');
    var dev = rfAWDev(sp, e), back = rfAWDev(e, sp);
    assert(dev < 1e-6 && back < 1e-6, 'the same curve: ' + dev + ' / ' + back);
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    var rel = (UI.activeSketchFeature().rels || []).filter(function (r) { return r.type === 'fix'; })[0];
    assert(rel && rel.refs[0] === '0.v2', 'a relation on an earlier point keeps its point: ' + JSON.stringify(rel));
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    await UI.exitSketch(); await idle();
    return 'deviation ' + dev.toExponential(1);
  });
  step('rfAW: Add Tangency Control (a click on the spline: a driving tangent there, the Spline PM on it), Add Curvature Control (the comb on), Show Inflection Points (an S curve shows one at its middle)', async function () {
    var errs0 = errors.length;
    var sp = { t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, -10], [40, 0]] };
    var f = await rfAWNew([JSON.parse(JSON.stringify(sp))]);
    var inf = UI.splineInflections(f.entities[0]);
    assert(inf.length === 1 && Math.abs(inf[0][0] - 20) < 1e-6 && Math.abs(inf[0][1]) < 1e-6, 'one inflection at (20, 0): ' + JSON.stringify(inf));
    assert(UI.splineInflections({ t: 'spline', pts: [[0, 0], [10, 8], [20, 0]] }).length === 0, 'an arch has none');
    var rows = menuRows('Spline Tools ▸ Show Inflection Points');
    assert(rows.length === 1, 'menu row');
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    rows[0].row.click(); await idle();
    assert(UI.activeSketchFeature().entities[0].showInflection, 'flag on');
    assert(UI.styleSplineOverlay() > 0, 'markers drawn');
    UI.setSelection([]);
    rows = menuRows('Spline Tools ▸ Add Tangency Control');
    rows[0].row.click(); await idle();
    assert(UI.pmTitle() === 'Add Tangency Control', 'PM ' + UI.pmTitle());
    var fc = W.SketchSolver.freeCurve(f.entities[0]), P = fc.pt(0.5), u0 = UI.App.undo.length;
    rfAWClick(P); await idle();
    var e = UI.activeSketchFeature().entities[0];
    assert(e.pts.length === 6 && e.tans && e.tans[1] && e.tans[1].length >= 2, 'a driving tangent at point 2: ' + JSON.stringify(e.tans));
    assert(UI.pmTitle() === 'Spline', 'the Spline PM on it: ' + UI.pmTitle());
    assert(rfAWDev(sp, e) < 1e-6, 'the curve is the same');
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    UI.pmCancel(); await idle();
    UI.cmdAddCurvatureControl(); await idle();
    rfAWClick(W.SketchSolver.freeCurve(e).pt(4.5)); await idle();
    e = UI.activeSketchFeature().entities[0];
    assert(e.pts.length === 7 && e.showCurvature && e.tans[6 - 1], 'curvature control: a point, the comb: ' + JSON.stringify({ n: e.pts.length, c: e.showCurvature }));
    UI.pmCancel(); await idle();
    // right-click rows
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    var items = UI.splineMenuItems(UI.activeSketchFeature(), 0).map(function (r) { return r.label; });
    assert(items.indexOf('Add Tangency Control') >= 0 && items.indexOf('Add Curvature Control') >= 0 && items.indexOf('Show Inflection Points') >= 0, 'right-click rows: ' + items.join(', '));
    UI.setSelection([]);
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    await UI.exitSketch(); await idle();
    return inf.length + ' inflection';
  });
  // --- end rfAW ---
