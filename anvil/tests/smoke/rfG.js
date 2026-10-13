  // --- rfG (lane C: sketch fidelity #7, #8, #13 — test-reports/2026-10-08-sketch-fidelity.md) ---
  function rfgRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ' ' + r.refs.join('/'); }); }
  function rfgTypes(list) { return list.map(function (e) { return e.t + (e.construction ? '(c)' : ''); }).join(','); }
  step('rfG: inference while drawing — a level line across a centerline infers Horizontal only (no Symmetric, none in the preview glyphs); a Corner Rectangle started on a line gets ONE Coincident (the clicked corner), not one per corner on the line', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.cmdCenterline(); rskClick([10, -20]); rskDbl([10, 20]); selKey('Escape');
    var f = UI.activeSketchFeature();
    assert(f.entities.length === 1 && f.entities[0].construction, 'centerline ' + JSON.stringify(f.entities));
    UI.setTool('line'); rskClick([6, -8]); selEv('mousemove', rskScr([14, -8]));
    var prev = (UI.App.inferPreview || []).map(function (c) { return c.type; });
    assert(prev.indexOf('symmetric') < 0, 'preview glyphs ' + prev.join());
    rskClick([14, -8]); selKey('Escape'); UI.setTool('select');
    var l = f.entities[1];
    assert(l && l.t === 'line' && l.x1 === 6 && l.x2 === 14 && l.y1 === -8 && l.y2 === -8, 'mirrored ends ' + JSON.stringify(l));
    var on1 = rfgRels().filter(function (r) { return / 1(\.|\/|$)/.test(r); });
    assert(on1.join() === 'horizontal 1', 'the line infers Horizontal only: ' + rfgRels().join(', '));
    // a Corner Rectangle (10,0)-(30,-15) whose top edge lies on the line y = 0
    await rskNew();
    UI.setTool('line'); rskClick([-10, 0]); rskClick([60, 0]); selKey('Escape');
    UI.setTool('rect'); rskClick([10, 0]); rskClick([30, -15]); UI.setTool('select');
    f = UI.activeSketchFeature();
    var onLine = (f.rels || []).filter(function (r) { return r.type === 'coincident' && r.refs.indexOf('0') >= 0; });
    assert(onLine.length === 1, 'one Coincident with the line: ' + rfgRels().join(', '));
    var P = W.SketchSolver.refPoint(f, onLine[0].refs[0] === '0' ? onLine[0].refs[1] : onLine[0].refs[0]);
    assert(Math.abs(P[0] - 10) < 0.5 && Math.abs(P[1]) < 1e-9, 'at the clicked corner ' + JSON.stringify(P));   // (a point snapped onto a line keeps the pixel's x)
    var st = UI.sketchStatus();
    assert(st.status === 'under' && st.rels.every(function (s) { return s === 'ok'; }), 'status ' + JSON.stringify(st));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'line: horizontal only · rectangle: ' + onLine[0].refs.join('/');
  });
  step('rfG: a Corner Rectangle is four lines with 2 Horizontal + 2 Vertical (one undo step); an edge click opens Line Properties; Display/Delete Relations lists the H / V and deleting a Vertical frees one degree; the script round trip is identical. A Center Rectangle on the origin: four lines, construction diagonals and a center point Coincident with the origin. Polygon and Straight Slot are lines and arcs too (rfH)', async function () {
    var errs0 = errors.length;
    await rskNew();
    var u0 = UI.App.undo.length;
    UI.setTool('rect'); rskClick([0, 0]); rskClick([40, 20]); UI.setTool('select');
    var f = UI.activeSketchFeature();
    assert(rfgTypes(f.entities) === 'line,line,line,line' && UI.App.undo.length === u0 + 1, 'four lines, one undo step: ' + rfgTypes(f.entities) + ' undo +' + (UI.App.undo.length - u0));
    var rl = rfgRels();
    ['horizontal 0', 'vertical 1', 'horizontal 2', 'vertical 3', 'coincident 0.p2/1.p1', 'coincident 3.p2/0.p1'].forEach(function (x) { assert(rl.indexOf(x) >= 0, x + ' in ' + rl.join(', ')); });
    assert(rl.some(function (x) { return /^coincident 0\.p1\/O$|^coincident 3\.p2\/O$/.test(x); }) && rl.filter(function (x) { return /\/O$/.test(x); }).length === 1, 'the first corner on the origin, once: ' + rl.join(', '));
    // an edge selects as a line
    rskClick([20, 0]);
    assert(UI.App.sel && UI.App.sel.kind === 'entity' && UI.App.sel.index === 0 && stTitle() === 'Line Properties', 'edge click: ' + JSON.stringify(UI.App.sel) + ' ' + stTitle());
    UI.closePM(); UI.App.sel = null;
    // Display/Delete Relations: the H / V are listed and a Vertical can be deleted (the rectangle may then skew)
    UI.cmdDisplayRelations();
    var rows = Array.prototype.map.call(D.querySelectorAll('#rel-display .rel-row'), function (r) { return r.textContent; });
    assert(rows.length === f.rels.length && rows.filter(function (t) { return /Horizontal/.test(t); }).length === 2 && rows.filter(function (t) { return /Vertical/.test(t); }).length === 2, 'rows ' + rows.join(' | '));
    var dof0 = UI.sketchStatus().dof, vRow = Array.prototype.filter.call(D.querySelectorAll('#rel-display .rel-row'), function (r) { return /Vertical/.test(r.textContent); })[0];
    vRow.click(); clickPmButton('Delete');
    assert(f.rels.filter(function (r) { return r.type === 'vertical'; }).length === 1 && UI.sketchStatus().dof === dof0 + 1, 'Vertical deleted: dof ' + dof0 + ' -> ' + UI.sketchStatus().dof);
    await UI.pmOK();
    var m2 = K.newModel('RT'); K.runScript(m2, K.generateScript(UI.App.model));
    var s2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0], diff = [];
    ['entities', 'rels', 'dims'].forEach(function (k) { rfdSame(f[k], s2[k], k, diff); });
    assert(!diff.length, 'script round trip: ' + diff.slice(0, 5).join('; '));
    // Center Rectangle on the origin
    await rskNew();
    UI.setTool('crect'); rskClick([0, 0]); rskClick([20, 10]); UI.setTool('select');
    f = UI.activeSketchFeature();
    assert(rfgTypes(f.entities) === 'line,line,line,line,line(c),line(c),point', 'center rectangle ' + rfgTypes(f.entities));
    rl = rfgRels();
    assert(rl.filter(function (x) { return /\/O$/.test(x); }).join() === 'coincident 6/O', 'the center point on the origin, nothing else: ' + rl.join(', '));
    assert(rl.filter(function (x) { return /^horizontal [0-3]$/.test(x); }).length === 2 && rl.filter(function (x) { return /^vertical [0-3]$/.test(x); }).length === 2, 'H / V ' + rl.join(', '));
    var st = UI.sketchStatus();
    assert(st.status === 'under' && st.dof === 2 && st.rels.every(function (s) { return s === 'ok'; }), 'width and height free: ' + JSON.stringify(st));
    // polygon and slot: lines (a construction circle) and lines and arcs (a construction centerline), rfH
    UI.setTool('polygon'); rskClick([60, 0]); rskClick([70, 0]);
    UI.setTool('slot'); rskClick([-60, 0]); rskClick([-40, 0]); rskClick([-50, 4]); UI.setTool('select');
    var t = f.entities.map(function (e) { return e.t; });
    assert(t.indexOf('poly') < 0 && t.indexOf('slot') < 0 && t.indexOf('circle') >= 0 && t.indexOf('arc') >= 0, 'polygon / slot as lines and arcs ' + t.join());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'rect: ' + f.entities.length + ' entities · H / V listed, Vertical deleted';
  });
  // --- end rfG ---
