  // ---- rfJ: drawing output — R2000 drawing DXF (read back by headless/dxf-check.js), sketch dimension properties on
  // slot callouts and ordinate values, bend notes keyed by a stable bend id
  var rfJ_PART = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 1, 0.133).circle(3, 1, 0.133)' +
    '.rel("distance", ["0.e3", "1"], { value: 1, dir: "h" }).rel("distance", ["0.e3", "2"], { value: 3, dir: "h", tol: { type: "symmetric", plus: 0.002 }, prec: 3 }).rel("distance", ["0.e3", "0.e1"], { value: 4, dir: "h", suffix: "REF" })' +
    '.ordinate([[0, { ord: "o1", ordAxis: "x", ordAt: -0.5 }], [1, { ord: "o1", ordAxis: "x", ordAt: -0.5 }], [2, { ord: "o1", ordAxis: "x", ordAt: -0.5 }]]).extrude(0.25);\n' +
    'p.sketch("Front", 0.25).arcSlot(2, 1, 0.6, 210, 330, 0.25).dim(0, "r").dim(0, "w").dimProps([[1, { tol: { type: "bilateral", plus: 0.003, minus: 0 } }]]).cut("through", { reverse: true });\n' +
    'p.sketch("Front", 0.25).slot(0.5, 1.6, 1.5, 1.6, 0.25).slot(2.5, 1.6, 3.5, 1.6, 0.25).dim(0, "w").dim(0, "olen").dimProps([[0, { tol: { type: "symmetric", plus: 0.005 } }], [1, { prefix: "2X", prec: 2 }]]).cut("through", { reverse: true });';
  function rfJLoadCheck() {
    if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
  }
  step('rfJ: Make Drawing of an inch part — the slot callout carries its width / length Smart Dimensions (2X .250 ±.005 X 1.25 SLOT), the arc slot its width tolerance, the ordinate set its members\' (3.000 ±.002, 4.000 REF) on the sheet, SVG and DXF; Save as DXF offers R2000: AC1015 with true ELLIPSEs that headless/dxf-check.js reads back; R12 stays the default', async function () {
    var errs0 = errors.length, Chk = await rfJLoadCheck();
    await anvil.newPart(); await idle();
    await anvil.run(rfJ_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary();
    ['2X .250 ±.005 X 1.25 SLOT', 'R.600 ARC SLOT .250 +.003/-.000 WIDE 120°', '0, 1.000, 3.000 ±.002, 4.000 REF', '2X Ø.266'].forEach(function (t) { assert(s.dims.indexOf(t) >= 0, t + ' in ' + s.dims.join(' | ')); });
    var svg = anvil.drawing.svg();
    assert(svg.indexOf('2X .250 ±.005 X 1.25 SLOT') >= 0 && svg.indexOf('3.000 ±.002') >= 0 && svg.indexOf('4.000 REF') >= 0, 'SVG texts');
    var d12 = anvil.drawing.dxf(), d2k = anvil.drawing.dxf({ version: 'R2000' });
    assert(/\$ACADVER\n1\nAC1009\n/.test(d12) && d12.indexOf('\nELLIPSE\n') < 0 && /3\.000 %%p\.002/.test(d12), 'R12 default');
    assert(/\$ACADVER\n1\nAC1015\n/.test(d2k) && /\$HANDSEED\n5\n/.test(d2k) && d2k.indexOf('\nELLIPSE\n') > 0 && d2k.indexOf('\n100\nAcDbText\n') > 0 && /2X \.250 %%p\.005 X 1\.25 SLOT/.test(d2k), 'R2000 content');
    var c = Chk.check(d2k, { units: 'in', layers: [] }), c12 = Chk.check(d12, { units: 'in', layers: [] });
    assert(c.ok && c.version === 'AC1015' && c.counts['ELLIPSE@ISOMETRIC'] > 0 && c12.ok && c12.version === 'AC1009', 'read back: ' + JSON.stringify([c.errors, c12.errors, c.counts]));
    // every handle once
    var hs = {}, dup = 0, Lx = d2k.split('\n'), sec = '';
    for (var li = 0; li + 1 < Lx.length; li += 2) {
      if (Lx[li] === '2' && Lx[li - 2] === '0' && Lx[li - 1] === 'SECTION') sec = Lx[li + 1];
      if ((Lx[li] === '5' || Lx[li] === '105') && sec !== 'HEADER') { if (hs[Lx[li + 1]]) dup++; hs[Lx[li + 1]] = 1; }
    }
    assert(!dup && Object.keys(hs).length > 50, 'handles unique: ' + dup + ' duplicates of ' + Object.keys(hs).length);
    // Save as DXF: the Version choice
    dwMenu('Save Drawing as DXF');
    var sel = D.getElementById('dw-dxf-version');
    assert(modalOpen() && sel && sel.value === 'R12' && D.querySelector('#modal textarea').value.indexOf('AC1009') > 0, 'dialog opens on R12');
    sel.value = 'R2000'; sel.dispatchEvent(new W.Event('change'));
    sel = D.getElementById('dw-dxf-version');
    assert(sel && sel.value === 'R2000' && D.querySelector('#modal textarea').value.indexOf('AC1015') > 0, 'R2000 chosen');
    clickModalButton('Close');
    dwMenu('Save Drawing as DXF');
    assert(D.getElementById('dw-dxf-version').value === 'R2000', 'the choice is remembered');
    sel = D.getElementById('dw-dxf-version'); sel.value = 'R12'; sel.dispatchEvent(new W.Event('change'));
    clickModalButton('Close');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return c.entities + ' R2000 entities, ' + (c.counts['ELLIPSE@ISOMETRIC'] || 0) + ' ellipses · ' + s.dims.filter(function (t) { return /SLOT|,/.test(t); }).join(' | ');
  });
  step('rfJ: a bend note dragged on the flat view keeps its bend (stable key bend:<feature>:<edge>) when the part swaps its two flanges in the tree and lengthens one; the note\'s text follows; Undo; a bend without a source is found again by its place', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(P9_INCH); await idle();
    anvil.drawing.make(); await UI.drawing.ready(); await wait(30);
    anvil.drawing.flatView({ x: 14, y: 4, bendNotes: 'notes' }); await UI.drawing.ready(); await wait(30);
    function flat() { var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0]; return fv && fv.flat; }
    var f0 = flat(), fvId = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0].id;
    assert(f0 && f0.bends.length === 2 && f0.bends.every(function (b) { return /^bend:\d+:0$/.test(b.key) && b.key === 'bend:' + b.id; }), 'stable keys ' + JSON.stringify(f0 && f0.bends.map(function (b) { return b.key; })));
    var downKey = f0.bends.filter(function (b) { return !b.up; })[0].key;
    // 'b<n>' names the bend in order and lands on its stable key
    anvil.drawing.flatAnnotation(fvId, 'b' + f0.bends.map(function (b) { return b.key; }).indexOf(downKey), { off: [0.3, 0.2] }); await UI.drawing.ready(); await wait(30);
    var own = anvil.drawing.doc().views.filter(function (v) { return v.kind === 'flat'; })[0].flatAnn;
    assert(own && own[downKey] && own[downKey].off[0] === 0.3 && !Object.keys(own).some(function (k) { return /^b\d+$/.test(k); }), 'flatAnn ' + JSON.stringify(own));
    // swap the flanges in the tree (ids kept) and make the DOWN one 1.5 long
    var fl = UI.App.model.features.filter(function (f) { return f.type === 'flange'; }), F = UI.App.model.features, i0 = F.indexOf(fl[0]), i1 = F.indexOf(fl[1]);
    UI.pushUndo(); F[i0] = fl[1]; F[i1] = fl[0];
    var dn = fl.filter(function (f) { return 'bend:' + f.id + ':0' === downKey; })[0];
    assert(dn, 'the DOWN bend is flange ' + downKey);
    dn.length = 1.5;
    await UI.rebuild(); await idle(); await UI.drawing.ready(); await wait(80);
    var f1 = flat(), bi = f1.bends.map(function (b) { return b.key; }).indexOf(downKey);
    assert(bi === 0 && !f1.bends[0].up, 'the DOWN bend now comes first: ' + JSON.stringify(f1.bends.map(function (b) { return [b.key, b.up]; })));
    var note = f1.annotations.filter(function (a) { return a.key === downKey; })[0], other = f1.annotations.filter(function (a) { return a.type === 'bendNote' && a.key !== downKey; })[0];
    var NDN = W.Drawing.bendNoteText({ up: false, angle: 90, R: 0.03 }, 'in');
    assert(note && note.text === NDN && other && other.text !== NDN, 'note follows its bend ' + JSON.stringify(f1.annotations.map(function (a) { return [a.key, a.text]; })));
    var on = UI.drawing.state.sheet.annotations.filter(function (a) { return a.flat && a.key === downKey; })[0];
    assert(on && Math.abs(on.off[0] - 0.3) < 1e-9 && Math.abs(on.off[1] - 0.2) < 1e-9, 'offset kept ' + JSON.stringify(on && on.off));
    await UI.undo(); await idle(); await UI.drawing.ready(); await wait(80);
    assert(flat().bends.map(function (b) { return b.key; }).indexOf(downKey) === 1, 'undo puts it back second');
    // the place key (a bend whose source is not known) is found again after the bends move
    var DWg = W.Drawing, bends = [{ a: [0, 0], b: [0, 2], up: true, angle: 90, R: 0.03 }, { a: [4, 0], b: [4, 2], up: false, angle: 90, R: 0.03 }];
    var k0 = DWg.bendKey(bends[1]), own2 = {}; own2[k0] = { off: [1, 0] };
    var moved = [{ a: [0, 0], b: [0, 2], up: true, angle: 90, R: 0.03 }, { a: [4.6, 0], b: [4.6, 2], up: false, angle: 90, R: 0.03 }];
    var keys = DWg.bendKeyMatch([moved[1], moved[0]], own2, 5);
    assert(keys[0] === k0 && keys[1] === DWg.bendKey(moved[0]), 'place key re-found: ' + JSON.stringify(keys));
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return downKey + ' kept ' + JSON.stringify(on.off) + ' through the swap';
  });
  // --- end rfJ ---
