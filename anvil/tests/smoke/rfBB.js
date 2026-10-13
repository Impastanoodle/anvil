  // ---- rfBB (2026-10-13): sketch fidelity audit 4 — the golden shop workflow (customer DXF in, Constrain All,
  // Autodimension ordinate from the lower-left corner, Fully Defined, two values changed, DXF R12 / R2000 out and read
  // back within 1e-6), Quick Snap Midpoint, Jog Line (behaviour confirmed against SolidWorks 2024)
  function rfBBDxf() {
    var L = [];
    function g(c, v) { L.push(String(c), String(v)); }
    function line(a, b, lay) { g(0, 'LINE'); g(8, lay || 'OUTLINE'); g(10, a[0]); g(20, a[1]); g(30, 0); g(11, b[0]); g(21, b[1]); g(31, 0); }
    function arc(c, r, a0, a1) { g(0, 'ARC'); g(8, 'HOLES'); g(10, c[0]); g(20, c[1]); g(30, 0); g(40, r); g(50, a0); g(51, a1); }
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 1); g(9, '$MEASUREMENT'); g(70, 0); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'BLOCKS'); g(0, 'BLOCK'); g(8, '0'); g(2, 'PUNCH'); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, 'PUNCH');
    line([-0.25, -0.125], [0.25, -0.125], '0'); line([0.25, -0.125], [0.25, 0.125], '0'); line([0.25, 0.125], [-0.25, 0.125], '0'); line([-0.25, 0.125], [-0.25, -0.125], '0');
    g(0, 'ENDBLK'); g(8, '0'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    var P = [[0, 0], [11, 0], [11, 7.5], [6, 7.5], [6, 7], [5, 7], [5, 7.5], [0, 7.5]];
    for (var i = 0; i < P.length; i++) line(P[i], P[(i + 1) % P.length]);
    [[2, 2], [4, 2], [2, 4], [4, 4]].forEach(function (c) { g(0, 'CIRCLE'); g(8, 'HOLES'); g(10, c[0]); g(20, c[1]); g(30, 0); g(40, 0.1405); });
    line([7.625, 1.875], [8.375, 1.875], 'HOLES'); line([8.375, 2.125], [7.625, 2.125], 'HOLES'); arc([8.375, 2], 0.125, 270, 90); arc([7.625, 2], 0.125, 90, 270);
    line([8.125, 4.625], [8.125, 5.375], 'HOLES'); line([7.875, 5.375], [7.875, 4.625], 'HOLES'); arc([8, 5.375], 0.125, 0, 180); arc([8, 4.625], 0.125, 180, 360);
    [[2, 6], [4, 6], [9.5, 6.5]].forEach(function (c) { g(0, 'INSERT'); g(8, 'HOLES'); g(2, 'PUNCH'); g(10, c[0]); g(20, c[1]); g(30, 0); });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\n') + '\n';
  }
  function rfBBKey(e) {
    if (e.t === 'line') { var a = [e.x1, e.y1], b = [e.x2, e.y2]; if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) { var t = a; a = b; b = t; } return ['L', a[0], a[1], b[0], b[1]]; }
    if (e.t === 'circle') return ['C', e.cx, e.cy, e.r];
    if (e.t === 'arc') return ['A', e.cx, e.cy, e.r];
    return [e.t];
  }
  step('rfBB: golden shop workflow — a customer DXF (11 x 7.5 blank, notch, 4 x Ø.281, two .25 x 1.0 slots, a PUNCH block x3) in, Constrain All (relations), Autodimension with Ordinate both ways from the lower-left corner: Fully Defined; the 11.000 ordinate to 12 and a hole column 4 to 4.5; DXF R12 and R2000 read back within 1e-6', async function () {
    await anvil.newPart(); await idle();
    UI.importDXFText(rfBBDxf(), { name: 'customer.dxf', ok: true, blocks: false }); await idle();   // exploded here; the blocks path is the next step
    var f = UI.activeSketchFeature(), S = W.SketchSolver;
    assert(UI.App.mode === 'sketch' && f && f.entities.length === 32, 'the DXF came in (8 outline + 4 holes + 2 slots + 3 x 4 punch lines): ' + (f && f.entities.length));
    var s = UI.App.model.units === 'in' ? 1 : 25.4;
    var xs = []; f.entities.forEach(function (e) { if (e.t === 'line') xs.push(e.x1, e.x2); });
    near(Math.max.apply(null, xs), 11 * s, 1e-9, 'blank width');
    UI.cmdConstrainAll({ fullyDefine: false });
    assert(S.analyze(f).status === 'under', 'relations only: still under defined');
    UI.cmdAutodimension(); await wait(30);
    assert(UI.pmTitle() === 'Autodimension', 'Autodimension PM: ' + UI.pmTitle());
    Array.prototype.forEach.call(D.querySelectorAll('#pm select'), function (sel) {
      if (Array.prototype.some.call(sel.options, function (o) { return o.value === 'ordinate'; })) { sel.value = 'ordinate'; sel.dispatchEvent(new W.Event('change', { bubbles: true })); }
    });
    await wait(30);
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var an = S.analyze(f), sets = anvil.ordinateSets(), ax = Object.keys(sets).map(function (k) { return sets[k].axis + ':' + sets[k].zero; }).sort().join(' ');
    assert(an.status === 'full' && an.dof === 0, 'Fully Defined: ' + an.status + ' ' + an.dof);
    assert(ax === 'x:O y:O', 'one ordinate set per direction from the origin (the blank\'s lower-left corner): ' + ax);
    function ordAt(v) { var hit = -1; (f.rels || []).forEach(function (x, i) { if (hit < 0 && x.ord && x.v != null && Math.abs(x.v - v * s) < 1e-9 && x.ordAxis === 'x') hit = i; }); return hit; }
    var iW = ordAt(11), iH = ordAt(4);
    assert(iW >= 0 && iH >= 0, 'ordinates 11 and 4 on the x set: ' + iW + ' ' + iH);
    assert(S.setRelValue(f, iW, 12 * s).ok && S.setRelValue(f, iH, 4.5 * s).ok, 'both values drive');
    UI.updateSketches();
    xs = []; f.entities.forEach(function (e) { if (e.t === 'line') xs.push(e.x1, e.x2); });
    near(Math.max.apply(null, xs), 12 * s, 1e-9, 'blank width after the change');
    var cx = f.entities.filter(function (e) { return e.t === 'circle'; }).map(function (e) { return Math.round(e.cx / s * 1e6) / 1e6; }).sort().join(',');
    assert(cx === '2,2,4.5,4.5' && S.analyze(f).status === 'full', 'the hole column moved, still Fully Defined: ' + cx);
    var mine = f.entities.filter(function (e) { return !e.construction && e.t !== 'point'; }).map(rfBBKey), out = [];
    ['R12', 'R2000'].forEach(function (v) {
      var txt = anvil.dxfOutput({ export: 'sketch', version: v }), P = W.DxfImport.parse(txt), got = P.entities.map(rfBBKey), worst = 0;
      assert(txt.indexOf(v === 'R12' ? 'AC1009' : 'AC1015') > 0, v + ' header');
      mine.forEach(function (m) {
        var best = Infinity;
        got.forEach(function (g2) { if (g2[0] !== m[0] || g2.length !== m.length) return; var d = 0; for (var i = 1; i < m.length; i++) d = Math.max(d, Math.abs(g2[i] - m[i])); best = Math.min(best, d); });
        worst = Math.max(worst, best);
      });
      assert(P.entities.length === mine.length && worst <= 1e-6, v + ': ' + P.entities.length + ' of ' + mine.length + ' entities, worst ' + worst);
      out.push(v + ' ' + P.entities.length + ' ok');
    });
    return out.join('; ');
  });
  step('rfBB: Quick Snap Midpoint takes the next point to a line\'s midpoint (Midpoint relation) and then snapping is normal again; Jog Line on a line makes the SolidWorks five-segment jog in one undo step', async function () {
    await rskNew();
    fxSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }]);
    UI.setTool('line'); UI.quickSnap('midpoint');
    assert(/Quick Snap Midpoint/.test($('status-msg').textContent), 'status bar names the quick snap: ' + $('status-msg').textContent);
    rskClick([17, 3]); rskClick([20, 30]); selKey('Escape'); selKey('Escape');
    var f = UI.activeSketchFeature(), l = f.entities[1];
    assert(l && Math.abs(l.x1 - 20) < 1e-9 && Math.abs(l.y1) < 1e-9, 'start on the midpoint: ' + JSON.stringify(l));
    assert(stToolRels().indexOf('midpoint:1.p1,0') >= 0 && !UI.quickSnap(), 'Midpoint relation, quick snap spent: ' + stToolRels().join(' '));
    await rskNew();
    fxSk([{ t: 'line', x1: 0, y1: 0, x2: 60, y2: 0 }]);
    var u0 = UI.App.undo.length;
    UI.cmdJogLine(); await wait(20);
    assert(UI.pmTitle() === 'Jog Line', 'Jog Line PM');
    rskClick([20, 0]); rskClick([30, 0]); rskClick([30, 10]); await wait(20);
    f = UI.activeSketchFeature();
    var segs = f.entities.map(function (e) { return [e.x1, e.y1, e.x2, e.y2].map(function (v) { return Math.round(v * 100) / 100; }).join(','); }).join(' | ');
    assert(segs === '0,0,20,0 | 20,0,20,10 | 20,10,30,10 | 30,10,30,0 | 30,0,60,0', 'five segments: ' + segs);
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    if (UI.hasPM()) UI.pmCancel();
    return segs;
  });
  step('rfBB (head): Constrain All and Autodimension are their own Ctrl+Z steps even right after a scripted edit; Search Commands finds Make Block / Insert Block', async function () {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    var f = UI.activeSketchFeature();
    UI.pushUndo(); UI.App.sketchDirty = true;   // as Insert DXF leaves it
    [[0, 0, 4, 0], [4, 0, 4, 2], [4, 2, 0, 2], [0, 2, 0, 0]].forEach(function (q) { f.entities.push({ t: 'line', x1: q[0], y1: q[1], x2: q[2], y2: q[3] }); });
    UI.updateSketches(); await wait(20);
    var u0 = UI.App.undo.length;
    UI.cmdConstrainAll({ fullyDefine: false }); await wait(20);
    var rels1 = (f.rels || []).length;
    assert(UI.App.undo.length === u0 + 1 && rels1 > 0, 'Constrain All is one step: ' + [u0, UI.App.undo.length, rels1]);
    UI.cmdAutodimension(); await wait(20);
    await UI.pmOK(); await wait(30);
    f = UI.activeSketchFeature();
    assert(UI.App.undo.length === u0 + 2 && (f.rels || []).length > rels1, 'Autodimension is one more step: ' + [UI.App.undo.length, (f.rels || []).length]);
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(f && f.entities.length === 4 && (f.rels || []).length === rels1, 'one Ctrl+Z takes back only the dimensions: ' + [f && f.entities.length, f && (f.rels || []).length]);
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(f && f.entities.length === 4 && !(f.rels || []).length, 'the next takes back Constrain All, the lines stay: ' + [f && f.entities.length, f && (f.rels || []).length]);
    var mk = UI.searchCommands('make block').map(function (h) { return h.name; }), ins = UI.searchCommands('insert block').map(function (h) { return h.name; });
    assert(mk[0] === 'Make Block' && ins[0] === 'Insert Block', 'search: ' + mk.join(', ') + ' | ' + ins.join(', '));
    return 'undo ' + u0 + ' → ' + (u0 + 2);
  });
  step('rfBB (head): the same customer DXF with its PUNCH block kept as a block (the Insert DXF default): 3 rigid instances, Constrain All + Ordinate Autodimension, R2000 writes one BLOCK and 3 INSERTs', async function () {
    await anvil.newPart(); await idle();
    UI.importDXFText(rfBBDxf(), { name: 'customer.dxf', ok: true }); await idle();
    var f = UI.activeSketchFeature(), S = W.SketchSolver, inst = K.blockInstances(f);
    assert(f && f.entities.length === 35 && inst.length === 3, 'outline, holes and slots loose, the punch as 3 instances: ' + (f && f.entities.length) + ' / ' + inst.length);
    UI.cmdConstrainAll({ fullyDefine: false });
    UI.cmdAutodimension(); await wait(30);
    Array.prototype.forEach.call(D.querySelectorAll('#pm select'), function (sel) {
      if (Array.prototype.some.call(sel.options, function (o) { return o.value === 'ordinate'; })) { sel.value = 'ordinate'; sel.dispatchEvent(new W.Event('change', { bubbles: true })); }
    });
    await wait(30);
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var an = S.analyze(f);
    var txt = anvil.dxfOutput({ export: 'sketch', version: 'R2000' });
    var nIns = (txt.match(/\n\s*0\r?\nINSERT\r?\n/g) || []).length;
    assert(nIns === 3, 'R2000: 3 INSERTs: ' + nIns);
    assert(an.status === 'full' && an.dof === 0, 'Fully Defined with the blocks rigid: ' + an.status + ' ' + an.dof);
    return an.status + ' ' + an.dof + ' DOF';
  });
  // --- end rfBB ---
