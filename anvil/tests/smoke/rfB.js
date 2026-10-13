  // --- rfB (sketch-text2 lane): Stencil text and text along a spline in the Sketch Text PM, the Layers PM's Rename as a
  // level rename, etch marks on flat-pattern drawing views, sketch location dimensions as model items, DXF text import ---
  var RFB_LAY = '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }])';
  function rfBDxf(extra) {
    return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LWPOLYLINE', '8', 'CUT', '90', '4', '70', '1', '10', '0', '20', '0', '10', '80', '20', '0', '10', '80', '20', '40', '10', '0', '20', '40',
      '0', 'TEXT', '8', 'ETCH', '10', '5', '20', '5', '40', '4', '1', 'PN 1234 %%c6', '50', '0',
      '0', 'MTEXT', '8', 'MARK', '10', '40', '20', '30', '40', '3', '71', '5', '1', 'REV\\PB'].concat(extra || [],
      ['0', 'DIMENSION', '8', 'DIM', '2', '*D1', '0', 'DIMENSION', '8', 'DIM', '2', '*D2', '0', 'HATCH', '8', 'H', '0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n';
  }
  step('rfB: Sketch Text ▸ Cut ▸ Stencil (Bridge width 0.8 mm by default) keeps the islands of "O8B" attached (no hole in the profile; its PM edits the width); with a spline selected, Text takes it into Curves and ✓ runs the text along it (baselines on the spline, Spline<n> in the box)', async function () {
    var errs0 = errors.length;
    UI.loadModel(K.newModel('Stencil')); await idle();
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    UI.zoomView(1); UI.refreshRibbon();
    var f = activeSketch();
    UI.setTool('text');
    assert(UI.pmTitle() === 'Sketch Text', 'PM ' + UI.pmTitle());
    txtType('O8B'); setInput(pmField('Height'), 10);
    D.querySelector('#pm input[type=radio][value="outline"]').click();
    var st = pmField('Stencil');
    assert(st && st.type === 'checkbox' && !st.checked && !pmField('Bridge width'), 'Stencil box, off; no Bridge width yet');
    st.click();
    assert(pmField('Bridge width') && Math.abs(+pmField('Bridge width').value - 0.8) < 1e-9, 'Bridge width 0.8: ' + (pmField('Bridge width') && pmField('Bridge width').value));
    skClick(5, 5);
    var e = f.entities[0];
    assert(e && e.t === 'text' && e.mode === 'outline' && e.stencil === true && e.bridge === 0.8, 'placed ' + JSON.stringify(e));
    var prof = K.sketchProfile(f);
    assert(prof.loops.length > 3 && !prof.loops.some(function (l) { return l.hole || l.cross; }), 'no island in the profile: ' + prof.loops.length + ' loops');
    assert(UI.pmTitle() === 'Sketch Text' && UI.pmSpec()._txtEntity, 'the new text\'s PM');
    setInput(pmField('Bridge width'), 1.2);
    assert(e.bridge === 1.2 && K.textOutline(e).bridges.every(function (b) { return Math.abs(Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) - 1.2) < 1e-9; }), 'bridges 1.2 wide');
    await UI.pmOK();
    f.entities.push({ t: 'spline', pts: [[0, -30], [20, -20], [40, -30], [60, -20]] });
    var k = f.entities.length - 1;
    UI.updateSketches();
    UI.App.sel = { kind: 'entity', index: k };
    UI.setTool('text');
    assert(UI.sketchTextValues().pathE === k && /Spline/.test($('pm').innerText), 'Curves: the spline ' + JSON.stringify(UI.sketchTextValues().pathE));
    txtType('ON A SPLINE'); setInput(pmField('Height'), 3);
    var etch = D.querySelector('#pm input[type=radio][value="stroke"]'); if (!etch.checked) etch.click();
    await UI.pmOK();
    var t = f.entities[f.entities.length - 1], fc = W.SketchSolver.freeCurve(f.entities[k]), worst = 0;
    assert(t.t === 'text' && t.path && t.path.e === k && t.path.g.t === 'spline' && !t.stencil, 'text on the spline: ' + JSON.stringify(t));
    K.textLayout(t).glyphs.forEach(function (g) { [g.p0, g.p1].forEach(function (p) { worst = Math.max(worst, W.SketchSolver.freeClosest(fc, p).d); }); });
    assert(worst < 1e-9, 'baselines off the spline by ' + worst);
    UI.closePM(); UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'stencil bridges ' + K.textOutline(e).bridges.length + ', spline text worst ' + worst;
  });
  step('rfB: Layers PM ▸ Rename renames the part-wide level — in both sketches, one undo step, no second level — and the Levels Manager agrees; a name another level has is refused', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front", 0, "S1").rect(0, 0, 40, 20).circle(10, 10, 3).layers([{ name: "Marks", color: "#ff0000" }]).layer("Marks", [1]);\n' +
      'p.sketch("Front", 0, "S2").rect(50, 0, 30, 10).circle(60, 5, 2).layers([{ name: "Marks", color: "#ff0000" }]).layer("Marks", [1]);'); await idle();
    var marks = UI.levels.list().filter(function (l) { return l.name === 'Marks'; })[0], n0 = UI.levels.list().length;
    assert(marks && marks.count === 2, 'Marks level ' + JSON.stringify(marks));
    var f1 = lvlFeat('S1'), f2 = lvlFeat('S2');
    UI.editSketch(f1.id); await idle();
    UI.cmdSketchLayers();
    var row = D.querySelector('#lyr-list .rel-row[data-layer="Marks"]');
    assert(row, 'Marks in the Layers PM'); row.click();
    setInput(pmField('Name'), 'ENGRAVE');
    var u0 = UI.App.undo.length;
    clickPmButton('Rename');
    var L = UI.levels.list();
    assert(L.length === n0 && L.some(function (l) { return l.name === 'ENGRAVE' && l.number === marks.number && l.count === 2; }) && !L.some(function (l) { return l.name === 'Marks'; }), 'one level renamed: ' + JSON.stringify(L.map(function (l) { return l.number + ' ' + l.name + ' ' + l.count; })));
    assert(f1.entities[1].layer === 'ENGRAVE' && f2.entities[1].layer === 'ENGRAVE' && f2.layers.some(function (r) { return r.name === 'ENGRAVE'; }) && !f2.layers.some(function (r) { return r.name === 'Marks'; }), 'both sketches re-keyed: ' + JSON.stringify([f1.entities[1], f2.layers]));
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    assert(D.querySelector('#lyr-list .rel-row[data-layer="ENGRAVE"]') && !D.querySelector('#lyr-list .rel-row[data-layer="Marks"]') && UI.levels.list().length === n0, 'the PM shows it renamed');
    UI.levels.op('preset', 'ETCH');
    var r = UI.sketchLayerOp('rename', 'ENGRAVE', 'etch');
    assert(!r.ok && /already named ETCH/.test(r.error) && f1.entities[1].layer === 'ENGRAVE', 'a name another level has: ' + JSON.stringify(r));
    UI.closePM(); UI.exitSketch(true); await idle();
    return 'Marks → ENGRAVE (level ' + marks.number + ')';
  });
  step('rfB: a flat-pattern drawing view shows the etch marks (Etch text, ETCH lines) thin green on layer ETCH — summary, SVG, DXF; Show etch marks off (view Properties, or flatViewProps) hides them; the view menu has Show Etch Marks', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);\np.flange(20, [[0, 2, 30]]);\np.sketch("Top", 2).text(50, -30, "PN 123", { h: 5 }).line(60, -10, 90, -10)' + RFB_LAY + '.layer("ETCH", [0, 1]).end();'); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.flatView({ x: 140, y: 60 }); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary(), fv = s.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(fv && fv.flat && fv.flat.etch > 5 && fv.flat.showEtch && fv.flat.etchPrims >= fv.flat.etch, 'flat view etch ' + JSON.stringify(fv && fv.flat && [fv.flat.etch, fv.flat.etchPrims]));
    var svg = anvil.drawing.svg(), dxf = anvil.drawing.dxf();
    assert(/<g data-layer="ETCH"/.test(svg) && svg.indexOf('stroke="#1e9e3c"') >= 0, 'SVG ETCH group in green');
    assert(/\n0\nLAYER\n2\nETCH\n70\n0\n62\n3\n/.test(dxf) && /\n0\nLINE\n8\nETCH\n/.test(dxf), 'DXF ETCH layer');
    assert(D.querySelector('#drawing-sheet g[data-layer="ETCH"]'), 'on the sheet');
    UI.drawing.viewProperties(fv.id);
    var se = pmField('Show etch marks');
    assert(se && se.checked, 'Show etch marks, on');
    se.click();
    await UI.pmOK(); await UI.drawing.ready(); await wait(30);
    s = anvil.drawing.summary(); fv = s.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(!fv.flat.showEtch && fv.flat.etchPrims === 0 && anvil.drawing.dxf().indexOf('\nETCH\n') < 0 && !D.querySelector('#drawing-sheet g[data-layer="ETCH"]'), 'hidden ' + JSON.stringify([fv.flat.showEtch, fv.flat.etchPrims]));
    s = anvil.drawing.flatViewProps(fv.id, { showEtch: true });
    assert(s.views.filter(function (v) { return v.id === fv.id; })[0].flat.etchPrims > 0, 'shown again');
    anvil.drawing.close();
    return fv.flat.etch + ' marks';
  });
  step('rfB: Make Drawing brings a sketch\'s location dimensions (distance relations) in as model items with their Dimension PM properties: "1.000 ±.005" and ".500 TYP" on the Front view, in the SVG and the DXF', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 0.5, 0.125).rel("distance", ["0.e3", "1"], { value: 1, dir: "h", tol: { type: "symmetric", plus: 0.005, minus: 0.005 }, prec: 3 })' +
      '.rel("distance", ["0.e0", "1"], { value: 0.5, dir: "v", prec: 3, suffix: "TYP" }).extrude(0.25);'); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary(), front = dwView('Front');
    var hx = s.dimDetails.filter(function (d) { return d.text === '1.000 ±.005'; })[0], vy = s.dimDetails.filter(function (d) { return d.text === '.500 TYP'; })[0];
    assert(hx && hx.auto && hx.kind === 'h' && hx.view === front.id, 'horizontal ' + s.dims.join(' | '));
    assert(vy && vy.auto && vy.kind === 'v' && vy.view === front.id, 'vertical ' + s.dims.join(' | '));
    var svg = anvil.drawing.svg(), dxf = anvil.drawing.dxf();
    assert(svg.indexOf('.500 TYP') >= 0 && /\n\.500 TYP\n/.test(dxf), 'SVG / DXF');
    anvil.drawing.close();
    return s.dims.join(' | ');
  });
  step('rfB: DXF import brings TEXT / MTEXT in as Etch Sketch Text on their layers (ETCH from the preset, MARK as a marking layer); DIMENSION and HATCH are left out quietly: the PM and the status say "2 dimensions and 1 hatch skipped", with no warning lines', async function () {
    await anvil.newPart(); await idle();
    UI.importDXFText(rfBDxf(), { name: 'Plate.dxf' });
    var msg = $('pm').innerText;
    assert(/2 texts as Etch Sketch Text/.test(msg) && /2 dimensions and 1 hatch skipped/.test(msg) && !/DIMENSION|HATCH|Skipped/.test(msg), 'PM message: ' + msg.replace(/\s+/g, ' ').slice(0, 400));
    await UI.pmOK(); await idle();
    var f = activeSketch(), T = f.entities.filter(function (e) { return e.t === 'text'; });
    assert(T.length === 2 && T[0].str === 'PN 1234 Ø6' && T[0].h === 4 && T[0].layer === 'ETCH' && T[1].str === 'REV\nB' && T[1].align === 'center' && T[1].valign === 'middle' && T[1].layer === 'MARK', 'texts ' + JSON.stringify(T));
    assert((f.layers || []).some(function (l) { return l.name === 'ETCH' && l.noProfile; }) && (f.layers || []).some(function (l) { return l.name === 'MARK' && l.noProfile; }), 'marking layers ' + JSON.stringify(f.layers));
    assert(/2 texts/.test(statusText()) && /2 dimensions and 1 hatch skipped/.test(statusText()), 'status: ' + statusText());
    assert(K.sketchProfile(f).loops.length === 1, 'the plate is the only region');
    UI.exitSketch(true); await idle();
    return T.length + ' texts';
  });
  // --- end rfB ---
