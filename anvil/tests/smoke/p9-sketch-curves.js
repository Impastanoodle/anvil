  // --- p9-sketch-curves: Circle / Perimeter Circle, the arcs, Polygon and the slot types with their SolidWorks
  // PropertyManagers (ui-sketch-curves.js), driven like a user: ribbon, PM groups, clicks, PM values, entity PMs ---
  function cvPM() { return D.getElementById('pm').innerText.replace(/\s*\n+\s*/g, ' | '); }
  function cvBtn(key) { return D.querySelector('#pm button[data-key="' + key + '"]'); }
  function cvVals() { return UI.pmSpec() ? UI.pmSpec().values : {}; }
  function cvDefaults() { UI.sketchCurveOptions({ sides: 6, ins: true, slotDims: false, overall: false }); }
  step('p9-sketch-curves: ribbon flyouts — Circle | Perimeter Circle, Centerpoint | Tangent | 3 Point Arc, the four slot types; picking one starts the tool with its PropertyManager open at once', async function () {
    await rskNew(); cvDefaults();
    UI.setRibbonTab('Sketch'); UI.refreshRibbon();
    var want = { circle: ['Circle', 'Perimeter Circle', 'Tangent Circle'], arc: ['Centerpoint Arc', 'Tangent Arc', '3 Point Arc'], slot: ['Straight Slot', 'Centerpoint Straight Slot', '3 Point Arc Slot', 'Centerpoint Arc Slot'] }, got = [];
    Object.keys(want).forEach(function (g) {
      var fl = c14Fly(g);
      assert(fl, 'no ' + g + ' flyout');
      fl.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); fl.querySelector('.rb-caret').click();
      var labels = c14MenuLabels();
      assert(labels.length === want[g].length && want[g].every(function (l, i) { return labels[i].indexOf(l) === 0; }), g + ' flyout lists ' + labels.join(' | '));
      got.push(labels.length);
      UI.closeMenus();
    });
    c14Fly('arc').querySelector('.rb-caret').click();
    c14MenuRow('Tangent Arc').click();
    assert(UI.App.tool === 'tarc' && UI.pmTitle() === 'Arc', 'Tangent Arc from the flyout: ' + UI.App.tool + ' / ' + UI.pmTitle());
    assert(/Arc Type/.test(cvPM()) && cvBtn('type:tarc').classList.contains('on'), 'Arc Type with Tangent Arc pressed: ' + cvPM());
    c14Fly('slot').querySelector('.rb-caret').click();
    c14MenuRow('Centerpoint Arc Slot').click();
    assert(UI.App.tool === 'aslot' && UI.pmTitle() === 'Slot' && /Slot Types.*Add dimensions.*Parameters/.test(cvPM()), 'Centerpoint Arc Slot PM: ' + cvPM());
    selKey('Escape');
    assert(UI.App.tool === 'select' && !UI.hasPM(), 'Esc put the tool and its PM down: ' + UI.App.tool + ' / ' + UI.pmTitle());
    UI.ribbonFlyFace('arc', 0); UI.ribbonFlyFace('circle', 0); UI.ribbonFlyFace('slot', 0);
    return got.join('/') + ' items';
  });
  step('p9-sketch-curves: Circle PM (Circle Type, Options, Parameters) follows the circle being drawn, then edits the one placed; Perimeter Circle from its type button takes three points and holds them (Coincident on the origin); a selected circle opens Circle', async function () {
    await rskNew(); cvDefaults();
    UI.setTool('circle');
    assert(UI.pmTitle() === 'Circle' && /Circle Type.*Options.*For construction.*Parameters.*Center X.*Center Y.*Radius/.test(cvPM()), 'Circle PM groups: ' + cvPM());
    assert(D.activeElement === D.body || !D.getElementById('pm').contains(D.activeElement), 'the PM does not take the keyboard');
    rskClick([10, 5]); selEv('mousemove', rskScr([14, 5]));
    assert(cvVals().cx === 10 && cvVals().cy === 5 && cvVals().r === 4, 'live: ' + JSON.stringify(cvVals()));
    rskClick([14, 5]);
    UI.pmSetField('r', '6'); UI.pmSetField('cx', '12');
    var c = rskEnts()[0];
    assert(c.t === 'circle' && c.r === 6 && c.cx === 12 && UI.App.tool === 'circle', 'edited after placing: ' + JSON.stringify(c));
    cvBtn('type:pcircle').click();
    assert(UI.App.tool === 'pcircle' && UI.pmTitle() === 'Circle' && cvBtn('type:pcircle').classList.contains('on'), 'Perimeter Circle: ' + UI.App.tool);
    rskClick([0, 0]); rskClick([40, 0]); selEv('mousemove', rskScr([20, 20])); rskClick([20, 20]);
    var p = rskEnts()[1], f = UI.activeSketchFeature();
    near(p.cx, 20, 1e-9, 'perimeter centre x'); near(p.cy, 0, 1e-9, 'perimeter centre y'); near(p.r, 20, 1e-9, 'perimeter radius');
    assert((f.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.indexOf('O') >= 0 && r.refs.indexOf('1') >= 0; }), 'on the origin: ' + JSON.stringify(f.rels));
    selKey('Escape');
    UI.setTool('select'); rskClick([18, 5]);
    assert(UI.pmTitle() === 'Circle' && !/Circle Type/.test(cvPM()) && cvVals().r === 6, 'selected circle PM: ' + cvPM());
    UI.pmSetField('r', '7');
    assert(rskEnts()[0].r === 7, 'radius 7 from the selected circle PM');
    UI.pmCancel();
    return 'circle R6 → R7, perimeter R20';
  });
  step('p9-sketch-curves: Tangent Arc — from a line end it leaves tangent (Tangent + Coincident), back over the end it is the reverse tangent, square to it a normal arc; a click away from an end is refused; the Arc PM shows Center / Start / End / Radius / Angle and edits a selected arc', async function () {
    await rskNew(); cvDefaults();
    UI.setTool('line'); rskClick([0, 0]); rskClick([20, 0]); selKey('Escape');
    UI.setTool('tarc');
    rskClick([10, 10]);
    assert(!UI.App.toolState.pts.length, 'a click off a line / arc end is refused');
    rskClick([20, 0]); selEv('mousemove', rskScr([25, 0.5])); selEv('mousemove', rskScr([30, 10]));
    assert(cvVals().r === 10 && cvVals().ang === 90 && cvVals().ex === 30, 'live arc values: ' + JSON.stringify(cvVals()));
    rskClick([30, 10]);
    var f = UI.activeSketchFeature(), a = rskEnts()[1];
    assert(a.t === 'arc' && Math.abs(a.cx - 20) < 1e-9 && Math.abs(a.cy - 10) < 1e-9 && a.r === 10, 'tangent arc ' + JSON.stringify(a));
    assert(f.rels.some(function (r) { return r.type === 'tangent' && r.refs.join() === '1,0'; }), 'Tangent: ' + JSON.stringify(f.rels));
    rskClick([0, 0]); selEv('mousemove', rskScr([3, 0.3])); selEv('mousemove', rskScr([5, 6]));
    assert(UI.App.toolState.tzone && UI.App.toolState.tzone.kind === 'reverse', 'reverse zone: ' + JSON.stringify(UI.App.toolState.tzone));
    rskClick([5, 6]);
    assert(f.rels.some(function (r) { return r.type === 'tangent' && r.refs.join() === '2,0'; }) && f.rels.some(function (r) { return r.type === 'coincident' && r.refs.join() === '2.p1,0.p1'; }), 'reverse arc held on the line start: ' + JSON.stringify(f.rels));
    rskClick([30, 10]); selEv('mousemove', rskScr([34, 10])); selEv('mousemove', rskScr([40, 16]));
    assert(UI.App.toolState.tzone && UI.App.toolState.tzone.kind === 'normal', 'normal zone: ' + JSON.stringify(UI.App.toolState.tzone));
    rskClick([40, 16]);
    var nrm = rskEnts()[3];
    assert(nrm && nrm.t === 'arc' && Math.abs(nrm.cx - 30) < 1e-9, 'normal arc leaves square to the arc end (centre straight above or below it): ' + JSON.stringify(nrm));
    assert(SketchStatus() !== 'over', 'not over defined');
    selKey('Escape');
    UI.setTool('select'); rskClick([20 + 10 * Math.cos(-0.7), 10 + 10 * Math.sin(-0.7)]);
    assert(UI.pmTitle() === 'Arc' && /Start X.*Start Y.*End X.*End Y.*Radius.*Angle/.test(cvPM()), 'selected arc PM: ' + cvPM());
    UI.pmCancel();
    return 'tangent, reverse, normal';
    function SketchStatus() { return W.SketchSolver.analyze(f).status; }
  });
  step('p9-sketch-curves: Polygon PM (Options, Parameters: sides, Inscribed / Circumscribed circle, center, circle diameter, angle, New Polygon) — inscribed by default (the click is the middle of a side), switching to circumscribed keeps the circle and moves the corners onto it; a typed R gets its dimension', async function () {
    await rskNew(); cvDefaults();
    UI.setTool('polygon');
    assert(UI.pmTitle() === 'Polygon' && /Options.*For construction.*Parameters.*Number of sides.*Inscribed circle.*Circumscribed circle.*Center X.*Center Y.*Circle diameter.*Angle.*New Polygon/.test(cvPM()), 'Polygon PM: ' + cvPM());
    rskClick([0, 0]); selEv('mousemove', rskScr([10, 0]));
    assert(cvVals().dia === 20 && cvVals().n === 6, 'live diameter 20: ' + JSON.stringify(cvVals()));
    rskClick([10, 0]);
    // rfH: the polygon is its six sides and a construction circle (Inscribed: touching the flats), one Polygon relation
    var f0 = UI.activeSketchFeature(), E = rskEnts(), sides = E.slice(0, 6);
    assert(E.length === 7 && sides.every(function (e) { return e.t === 'line' && !e.construction; }) && E[6].t === 'circle' && E[6].construction && Math.abs(E[6].r - 10) < 1e-9 && Math.abs(Math.max.apply(null, sides.map(function (e) { return e.x1; })) - 10) < 1e-9 && f0.rels.some(function (x) { return x.type === 'polygon' && x.ins; }), 'inscribed: flats at x = ±10: ' + JSON.stringify(E));
    var circ = D.querySelector('#pm input[type=radio][data-key="ins:circ"]'); circ.click();
    E = rskEnts();
    assert(!f0.rels.some(function (x) { return x.type === 'polygon' && x.ins; }) && Math.abs(E[6].r - 10) < 1e-9 && Math.abs(Math.hypot(E[0].x1, E[0].y1) - 10) < 1e-9, 'circumscribed: corners on the Ø20 circle: ' + JSON.stringify(E));
    UI.pmSetField('n', '8');
    assert(rskEnts().filter(function (e) { return e.t === 'line'; }).length === 8 && rskEnts()[8].t === 'circle', 'eight sides');
    var nb = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent === 'New Polygon'; })[0];
    nb.click();
    assert(cvVals().dia == null && cvVals().n === 8, 'New Polygon: blank parameters, sides kept: ' + JSON.stringify(cvVals()));
    D.querySelector('#pm input[type=radio][data-key="ins:ins"]').click();
    rskClick([40, 0]); selEv('mousemove', rskScr([45, 0]));
    selKey('1');
    var box = UI.sketchNumBox();
    assert(box && box.length === 2, 'Ø / A box');
    box[0].value = '16'; box[0].dispatchEvent(new W.Event('input', { bubbles: true }));   // rfY: the box takes the Circle diameter
    box[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    var q = rskEnts()[17], f = UI.activeSketchFeature();
    assert(q.t === 'circle' && rskEnts().slice(9, 17).every(function (e) { return e.t === 'line'; }) && f.rels.some(function (x) { return x.type === 'polygon' && x.ins && x.refs[0] === '17'; }), 'inscribed octagon ' + JSON.stringify(rskEnts().slice(9)));
    near(q.r, 8, 1e-9, 'R 8 to the flats');
    assert((f.dims || []).some(function (d) { return d.e === 17 && d.k === 'dia'; }), 'typed R dimensioned (the circle\'s diameter): ' + JSON.stringify(f.dims));
    // the tool PM's Parameters drive the polygon just drawn: Angle turns it (a side's middle at 10°, its first corner at 32.5°)
    UI.pmSetField('ang', '10');
    near(Math.atan2(rskEnts()[9].y1, rskEnts()[9].x1 - 40) * 180 / Math.PI, 32.5, 1e-6, 'turned by the Angle');
    var lines = K.exportDXFSketch(f, 'mm').split('\n').filter(function (l, i, a) { return a[i - 1] === '0' && l === 'LINE'; }).length;
    assert(lines === 16, 'DXF: 16 LINEs for two octagons: ' + lines);
    selKey('Escape');
    // rfH: a click on a side selects that line (Line Properties), as in SolidWorks
    UI.setTool('select'); rskClick([10 * Math.cos(Math.PI / 8) * Math.cos(Math.PI / 8), 10 * Math.cos(Math.PI / 8) * Math.sin(Math.PI / 8)]);
    assert(UI.App.sel && UI.App.sel.kind === 'entity' && rskEnts()[UI.App.sel.index].t === 'line', 'a side selects as a line: ' + JSON.stringify(UI.App.sel));
    var an = W.SketchSolver.analyze(f);
    assert(an.conflicts === 0 && an.redundant === 0, 'solved: ' + JSON.stringify([an.status, an.dof]));
    UI.closePM();
    cvDefaults();
    return 'inscribed / circumscribed, typed R 8';
  });
  step('p9-sketch-curves: Slot PM — Straight Slot with Add dimensions comes out fully defined; Overall Length; Centerpoint Straight Slot adds its center point (Midpoint); 3 Point Arc Slot and Centerpoint Arc Slot make true arc slots (4 ARCs in the DXF); a selected arc slot opens Slot and its width edits', async function () {
    await rskNew(); cvDefaults();
    UI.setTool('slot');
    assert(UI.pmTitle() === 'Slot' && /Slot Types.*Add dimensions.*Length.*Parameters.*Center X.*Center Y.*Slot width.*Slot length/.test(cvPM()), 'Slot PM: ' + cvPM());
    D.querySelector('#pm input[type=checkbox][data-key="slotDims"]').click();
    rskClick([0, 0]); rskClick([20, 0]); selEv('mousemove', rskScr([10, 3])); rskClick([10, 3]);
    var f = UI.activeSketchFeature();
    // rfH: the slot is lines and arcs: its length the centerline's (4), its width the distance between the sides
    assert(f.dims.length === 1 && f.dims[0].e === 4 && f.dims[0].k === 'len' && f.rels.some(function (x) { return x.type === 'distance' && x.refs.join() === '0,2' && x.v === 6; }) && W.SketchSolver.analyze(f).status === 'full', 'Add dimensions: ' + JSON.stringify(f.dims) + ' ' + W.SketchSolver.analyze(f).status);
    cvBtn('lenType:overall').click();
    assert(cvVals().len === 26, 'overall length 20 + 6: ' + cvVals().len);
    cvBtn('type:cslot').click();
    assert(UI.App.tool === 'cslot' && UI.pmTitle() === 'Slot', 'Centerpoint Straight Slot: ' + UI.App.tool);
    rskClick([0, 20]); rskClick([10, 20]); selEv('mousemove', rskScr([0, 24])); rskClick([0, 24]);
    var s = rskEnts()[9], pt = rskEnts()[10];
    assert(s.t === 'line' && s.construction && s.x1 === -10 && s.x2 === 10 && rskEnts()[8].r === 4 && pt.t === 'point' && pt.x === 0 && pt.y === 20, 'centerpoint slot + point: ' + JSON.stringify(rskEnts().slice(5)));
    assert(f.rels.some(function (r) { return r.type === 'midpoint' && r.refs.join() === '10,9'; }), 'Midpoint: ' + JSON.stringify(f.rels));
    assert(f.rels.some(function (r) { return r.type === 'distance' && r.ac && r.refs.join() === '8,6' && r.v === 28; }), 'Overall Length dimension: ' + JSON.stringify(f.rels));
    D.querySelector('#pm input[type=checkbox][data-key="slotDims"]').click();
    cvBtn('lenType:cc').click();
    cvBtn('type:aslot3').click();
    rskClick([-50, -10]); rskClick([-30, -10]); selEv('mousemove', rskScr([-40, 0])); rskClick([-40, 0]);
    selEv('mousemove', rskScr([-40, 3])); rskClick([-40, 3]);
    var a3 = rfYSlotOf(rskEnts(), 11);   // rfY: an arc slot is its five arcs
    assert(a3 && a3.t === 'aslot' && Math.abs(a3.r - 10) < 1e-9 && Math.abs(a3.cy + 10) < 1e-9 && Math.abs(a3.w - 6) < 1e-9 && Math.abs(a3.a1 - a3.a0 - 180) < 1e-9, '3 Point Arc Slot ' + JSON.stringify(a3));
    cvBtn('type:aslot').click();
    rskClick([40, -20]); rskClick([55, -20]); selEv('mousemove', rskScr([54, -24])); selEv('mousemove', rskScr([50, -31])); selEv('mousemove', rskScr([40, -35])); rskClick([40, -35]);
    selEv('mousemove', rskScr([40, -38]));
    assert(cvVals().r === 15 && cvVals().ang === 90, 'live arc slot values: ' + JSON.stringify(cvVals()));
    rskClick([40, -38]);
    var a4 = rfYSlotOf(rskEnts(), 16);
    assert(a4 && a4.t === 'aslot' && Math.abs(a4.a0 - 270) < 1e-9 && Math.abs(a4.a1 - 360) < 1e-9 && Math.abs(a4.w - 6) < 1e-9, 'Centerpoint Arc Slot, swept clockwise: ' + JSON.stringify(a4));
    var arcs = K.exportDXFSketch(f, 'mm').split('\n').filter(function (l, i, a) { return a[i - 1] === '0' && l === 'ARC'; }).length;
    assert(arcs === 4 + 8, 'DXF ARCs: two slots × 2 + two arc slots × 4: ' + arcs);
    assert(K.sketchProfile(f).loops.length === 4, 'four closed slot loops');
    selKey('Escape');
    assert(!UI.hasPM() && UI.App.tool === 'select', 'Esc ends the tool and closes its PM');
    UI.setTool('select'); rskClick([40 + 18 * Math.cos(-Math.PI / 4) + 0.3, -20 + 18 * Math.sin(-Math.PI / 4) + 0.3]);
    // rfY: the arc slot is arcs (as SolidWorks draws it): its outer arc opens the Arc PM with its Tangent / Coincident relations
    assert(UI.pmTitle() === 'Arc' && /Existing Relations.*Tangent/.test(cvPM()), 'selected arc slot arc PM: ' + cvPM());
    UI.pmCancel();
    cvDefaults();
    return 'straight (dims), centerpoint, 3 point arc, centerpoint arc';
  });
  // --- end p9-sketch-curves ---

