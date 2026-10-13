  // ---- sketch-construct: Tangent Line, Perpendicular Line, Bisector, Tangent Circle, Split / Join Entities
  // (ui-sketch-construct.js), driven like a user: ribbon flyouts, PM, clicks in the graphics area, N for the next solution
  function cstSketch(ents) { var f = UI.activeSketchFeature(); ents.forEach(function (e) { f.entities.push(e); }); UI.updateSketches(); return f; }
  function cstHas(rel) { return stRels().indexOf(rel) >= 0; }
  function cstAng(e) { return Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI; }
  step('sketch-construct: the ribbon — Line flyout ▸ Tangent Line / Perpendicular Line / Bisector, Circle flyout ▸ Tangent Circle, Trim flyout ▸ Split Entities / Join Entities; each opens its PropertyManager, a second click puts it down', async function () {
    await rskNew(); UI.setRibbonTab('Sketch');
    ['line', 'circle', 'trim'].forEach(function (g) { UI.ribbonFlyFace(g, 0); });
    var trim = stFlyMenu('trim'); UI.closeMenus();
    assert(/^Split Entities/.test(trim[2]) && /^Join Entities/.test(trim[3]) && trim.length === 4, 'Trim flyout lists ' + trim.join(' | '));
    var want = { 'Tangent Line': ['line', 'Tangent Line', 'Line Type|Tangent To|Solution|Options'], 'Perpendicular Line': ['line', 'Perpendicular Line', 'Reference|Length|Options'], 'Bisector': ['line', 'Bisector', 'Lines to Bisect|Length|Solution|Options'],
      'Tangent Circle': ['circle', 'Tangent Circle', 'Circle Type|Tangent To|Parameters|Solution|Options'], 'Split Entities': ['trim', 'Split Entities', 'Split Points|Options'], 'Join Entities': ['trim', 'Join Entities', 'Entities to Join'] };
    var got = [];
    Object.keys(want).forEach(function (row) {
      stFlyMenu(want[row][0]); c14MenuRow(row).click();
      assert(stTitle() === want[row][1] && UI.sketchConstructActive(), row + ': PM ' + stTitle());
      assert(stGroups().join('|') === want[row][2], row + ' groups ' + stGroups().join('|'));
      assert(c14Fly(want[row][0]).querySelector('.rb').classList.contains('active'), row + ': flyout face not shown on');
      got.push(stTitle());
      c14Fly(want[row][0]).querySelector('.rb').click();
      assert(!UI.hasPM(), row + ': a second click did not put it down');
    });
    ['line', 'circle', 'trim'].forEach(function (g) { UI.ribbonFlyFace(g, 0); });
    return got.join(', ');
  });
  step('sketch-construct: Tangent Line — circles R10 at (0,0) and R5 at (40,0), picked at their tops, give the outer tangent (1.25, 9.9216)-(40.625, 4.9608) with Tangent to both and its ends Coincident on them, one undo step; N cycles the four solutions in place; Esc ends', async function () {
    await rskNew();
    var f = cstSketch([{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'circle', cx: 40, cy: 0, r: 5 }]);
    var G = UI.sketchConstruct.tangentLines({ kind: 'circle', c: [0, 0], r: 10 }, { kind: 'circle', c: [40, 0], r: 5 });
    assert(G.length === 4 && G.filter(function (s) { return s.outer; }).length === 2, 'four tangents, two outer: ' + JSON.stringify(G));
    UI.cmdTangentLine(); await wait(20);
    assert(/tangent to both/.test($('sketch-hint').textContent), 'hint ' + $('sketch-hint').textContent);
    var undo0 = UI.App.undo.length, ny = Math.sqrt(63 / 64);
    rskClick([0, 10]); await wait(20);
    assert(f.entities.length === 2 && /Circle1/.test(D.querySelector('#pm .pm-pick').textContent), 'first pick listed: ' + D.querySelector('#pm .pm-pick').textContent);
    rskClick([40, 5]); await wait(20);
    stLine(f.entities[2], 1.25, 10 * ny, 40.625, 5 * ny, 'outer tangent');
    ['tangent 2/0', 'tangent 2/1', 'coincident 2.p1/0', 'coincident 2.p2/1'].forEach(function (r) { assert(cstHas(r), 'missing ' + r + ': ' + stRels().join(', ')); });
    assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
    stNoRedundant('tangent line');
    var seen = [JSON.stringify(f.entities[2])];
    for (var k = 0; k < 3; k++) {
      selKey('n'); await wait(20);
      var e = f.entities[2];
      assert(f.entities.length === 3 && UI.App.undo.length === undo0 + 1, 'N swaps in place: ' + f.entities.length);
      near(Math.hypot(e.x1, e.y1), 10, 1e-6, 'start on R10'); near(Math.hypot(e.x2 - 40, e.y2), 5, 1e-6, 'end on R5');
      near(Math.abs(e.x1 * (e.x2 - e.x1) + e.y1 * (e.y2 - e.y1)), 0, 1e-6, 'square to the radius');
      seen.push(JSON.stringify(e));
    }
    assert(seen.filter(function (x, i) { return seen.indexOf(x) === i; }).length === 4, 'four different solutions: ' + seen.join(' '));
    selKey('n'); await wait(20);
    assert(JSON.stringify(f.entities[2]) === seen[0], 'N wraps to the first');
    selKey('Escape');
    assert(!UI.hasPM() && f.entities.length === 3, 'Esc ended, line kept');
    return 'outer tangent (' + f.entities[2].x1 + ', ' + f.entities[2].y1.toFixed(4) + ') - (' + f.entities[2].x2 + ', ' + f.entities[2].y2.toFixed(4) + ')';
  });
  step('sketch-construct: Tangent Circle — TTR R5 between lines along X and Y gives the circle at (5, 5) with Tangent to both and an R5 dimension; TTT on a 3-4-5 triangle\'s sides gives the incircle R1 at (1, 1) (the 30-40-50 one picked in the graphics area: R10 at (10, 10))', async function () {
    var SC = UI.sketchConstruct;
    var L = function (a, b) { return { kind: 'line', a: a, b: b }; };
    var ttr = SC.tangentCirclesTTR(L([0, 0], [30, 0]), L([0, 0], [0, 30]), 5);
    assert(ttr.length === 4 && ttr.some(function (c) { return Math.abs(c.c[0] - 5) < 1e-9 && Math.abs(c.c[1] - 5) < 1e-9; }), 'TTR centres ' + JSON.stringify(ttr));
    var ttt = SC.tangentCirclesTTT([L([0, 0], [4, 0]), L([4, 0], [0, 3]), L([0, 3], [0, 0])]);
    var inc = ttt.filter(function (c) { return Math.abs(c.r - 1) < 1e-9; })[0];
    assert(ttt.length === 4 && inc && Math.abs(inc.c[0] - 1) < 1e-9 && Math.abs(inc.c[1] - 1) < 1e-9, 'TTT 3-4-5: ' + JSON.stringify(ttt));
    var ccc = SC.tangentCirclesTTT([{ kind: 'circle', c: [0, 0], r: 1 }, { kind: 'circle', c: [10, 0], r: 1 }, { kind: 'circle', c: [5, 8], r: 1 }]);
    assert(ccc.length >= 2 && ccc.every(function (c) { return [[0, 0], [10, 0], [5, 8]].every(function (q) { var d = Math.hypot(c.c[0] - q[0], c.c[1] - q[1]); return Math.min(Math.abs(d - 1 - c.r), Math.abs(d - Math.abs(c.r - 1))) < 1e-6; }); }), 'TTT circles: ' + JSON.stringify(ccc));
    var llc = SC.tangentCirclesTTT([L([-20, 0], [20, 0]), L([-20, 10], [20, 10]), { kind: 'circle', c: [0, 5], r: 2 }]);
    assert(llc.length >= 2 && llc.every(function (c) { return Math.abs(c.r - 5) < 1e-9; }), 'TTT between parallel lines: ' + JSON.stringify(llc));
    await rskNew();
    var f = cstSketch([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 30 }]);
    stFlyMenu('circle'); c14MenuRow('Tangent Circle').click(); await wait(20);
    assert(stTitle() === 'Tangent Circle' && D.querySelector('#pm input[data-key="type:ttr"]').checked, 'TTR by default');
    UI.pmSetField('r', '5'); await wait(20);
    var undo0 = UI.App.undo.length;
    rskClick([15, 0]); rskClick([0, 15]); await wait(20);
    var c = f.entities[2];
    assert(c && c.t === 'circle' && Math.abs(c.cx - 5) < 1e-9 && Math.abs(c.cy - 5) < 1e-9 && Math.abs(c.r - 5) < 1e-9, 'TTR circle ' + JSON.stringify(c));
    assert(cstHas('tangent 2/0') && cstHas('tangent 2/1'), 'Tangent to both: ' + stRels().join(', '));
    assert((f.dims || []).some(function (d) { return d.e === 2 && d.k === 'dia' && d.show === 'r'; }), 'R dimension: ' + JSON.stringify(f.dims));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    UI.pmSetField('r', '4'); await wait(20);
    assert(f.entities.length === 3 && Math.abs(f.entities[2].cx - 4) < 1e-9 && Math.abs(f.entities[2].r - 4) < 1e-9 && UI.App.undo.length === undo0 + 1, 'a new Radius redoes the circle just placed: ' + JSON.stringify(f.entities[2]));
    stNoRedundant('TTR');
    UI.pmCancel();
    await rskNew();
    f = cstSketch([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 0, y2: 30 }, { t: 'line', x1: 0, y1: 30, x2: 0, y2: 0 }]);
    UI.cmdTangentCircle('ttt'); await wait(20);
    assert(D.querySelector('#pm input[data-key="type:ttt"]').checked && stGroups().indexOf('Parameters') < 0, 'TTT: no Radius');
    rskClick([20, 0]); rskClick([20, 15]); rskClick([0, 15]); await wait(20);
    c = f.entities[3];
    assert(c && c.t === 'circle' && Math.abs(c.cx - 10) < 1e-6 && Math.abs(c.cy - 10) < 1e-6 && Math.abs(c.r - 10) < 1e-6, 'incircle ' + JSON.stringify(c));
    assert(cstHas('tangent 3/0') && cstHas('tangent 3/1') && cstHas('tangent 3/2'), 'Tangent to the three sides: ' + stRels().join(', '));
    stNoRedundant('TTT');
    selKey('n'); await wait(20);
    assert(f.entities.length === 4 && f.entities[3].r > 10.5, 'N: an excircle ' + JSON.stringify(f.entities[3]));
    selKey('Escape');
    return 'TTR (5, 5) R5; TTT incircle (10, 10) R10, next R' + f.entities[3].r.toFixed(3);
  });
  step('sketch-construct: Bisector — lines at 0° and 90° from a shared corner give the 45° bisector from the corner, the shorter line\'s length, construction, held there by a construction circle tangent to both; dragging the vertical line to 60° keeps it bisecting (30°)', async function () {
    var b = UI.sketchConstruct.bisectors({ a: [0, 0], b: [30, 0] }, { a: [0, 0], b: [0, 20] }, [15, 0], [0, 10]);
    near(Math.atan2(b.dirs[0][1], b.dirs[0][0]) * 180 / Math.PI, 45, 1e-9, 'pure bisector');
    await rskNew();
    var f = cstSketch([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 20 }]);
    f.rels = [{ type: 'coincident', refs: ['0.p1', '1.p1'] }, { type: 'fix', refs: ['0'] }]; UI.updateSketches();
    stFlyMenu('line'); c14MenuRow('Bisector').click(); await wait(20);
    rskClick([15, 0]); rskClick([0, 10]); await wait(20);
    var e = f.entities[2];
    assert(e && e.t === 'line' && e.construction, 'construction bisector ' + JSON.stringify(e));
    near(e.x1, 0, 1e-9, 'x1'); near(e.y1, 0, 1e-9, 'y1'); near(cstAng(e), 45, 1e-6, 'angle'); near(Math.hypot(e.x2 - e.x1, e.y2 - e.y1), 20, 1e-6, 'length');
    assert(cstHas('coincident 2.p1/0.p1') || cstHas('coincident 2.p1/1.p1'), 'from the corner: ' + stRels().join(', '));
    var ci = f.entities[3];
    assert(ci && ci.t === 'circle' && ci.construction && cstHas('tangent 3/0') && cstHas('tangent 3/1') && cstHas('midpoint 3.c/2'), 'holding circle: ' + JSON.stringify(ci) + ' ' + stRels().join(', '));
    stNoRedundant('bisector');
    selKey('Escape');
    // the second line turned to 60°: the bisector follows to 30°
    var r = SketchSolverOf().driveEntity(f, 1, 2, function (E) { return [E[1].x2 - 20 * Math.cos(Math.PI / 3), E[1].y2 - 20 * Math.sin(Math.PI / 3)]; });
    assert(r.ok, 'drive: ' + JSON.stringify(r));
    near(cstAng(f.entities[2]), 30, 1e-5, 'bisector follows');
    return 'bisector 45° → 30° after the drag';
  });
  function SketchSolverOf() { return W.SketchSolver; }
  step('sketch-construct: Perpendicular Line — a line (0,0)-(40,0) picked, then (10, 15) clicked: the line (10,0)-(10,15), Perpendicular and its start on the reference; Length 25 runs 25 towards the click', async function () {
    await rskNew();
    var f = cstSketch([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }]);
    stFlyMenu('line'); c14MenuRow('Perpendicular Line').click(); await wait(20);
    rskClick([20, 0]); await wait(20);
    assert(D.querySelector('#pm .pm-pick').classList.contains('filled') && f.entities.length === 1, 'reference picked');
    rskClick([10, 15]); await wait(20);
    stLine(f.entities[1], 10, 0, 10, 15, 'perpendicular');
    assert(cstHas('perpendicular 0/1') && cstHas('coincident 1.p1/0'), 'relations ' + stRels().join(', '));
    UI.pmSetField('len', '25'); await wait(20);
    rskClick([30, -5]); await wait(20);
    stLine(f.entities[2], 30, 0, 30, -25, 'length 25');
    assert((f.dims || []).some(function (d) { return d.e === 2 && d.k === 'len'; }), 'length dimension');
    stNoRedundant('perpendicular');
    selKey('Escape');
    return 'x = 10 and x = 30 (L 25)';
  });
  step('sketch-construct: Split Entities — a click at the middle of a line splits it into two lines joined there (Coincident, still one line), one undo step; two clicks split a circle into two arcs; Split all at intersections breaks a # of four lines into 12 lines, nothing over-defined', async function () {
    await rskNew();
    var f = cstSketch([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'circle', cx: 20, cy: 30, r: 8 }]);
    f.rels = [{ type: 'horizontal', refs: ['0'] }]; UI.updateSketches();
    stFlyMenu('trim'); c14MenuRow('Split Entities').click(); await wait(20);
    var undo0 = UI.App.undo.length;
    rskClick([20.1, 0]); await wait(20);
    stLine(f.entities[0], 0, 0, 20, 0, 'piece 1'); stLine(f.entities[1], 20, 0, 40, 0, 'piece 2');
    assert(cstHas('coincident 0.p2/1.p1'), 'joined at the split: ' + stRels().join(', '));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    stNoRedundant('split line');
    rskClick([28, 30]); await wait(20);
    assert(f.entities[2].t === 'circle', 'one click on a circle waits for the second');
    rskClick([12, 30]); await wait(20);
    assert(f.entities[2].t === 'arc' && f.entities[3].t === 'arc' && f.entities.length === 4, 'circle → two arcs: ' + JSON.stringify(f.entities.slice(2)));
    near(f.entities[2].a1 - f.entities[2].a0 + f.entities[3].a1 - f.entities[3].a0, 360, 1e-6, 'the arcs make the circle');
    stNoRedundant('split circle');
    assert(cstHas('tangent 2/3') && cstHas('coincident 2.p2/3.p1') && cstHas('coincident 3.p2/2.p1'), 'the arcs end to end: ' + stRels().join(', '));
    cstSketch([{ t: 'arc', cx: -30, cy: 30, r: 8, a0: 0, a1: 180 }]);
    rskClick([-30, 38.1]); await wait(20);
    assert(f.entities[4].t === 'arc' && f.entities[5].t === 'arc' && Math.abs(f.entities[4].a1 - 90) < 1e-6 && Math.abs(f.entities[5].a0 - 90) < 1e-6, 'arc split at its middle: ' + JSON.stringify(f.entities.slice(4)));
    stNoRedundant('split arc');
    UI.pmCancel();
    await rskNew();
    f = cstSketch([{ t: 'line', x1: 0, y1: 10, x2: 40, y2: 10 }, { t: 'line', x1: 0, y1: 30, x2: 40, y2: 30 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 40 }, { t: 'line', x1: 30, y1: 0, x2: 30, y2: 40 }]);
    UI.cmdSplitEntities(); await wait(20);
    undo0 = UI.App.undo.length;
    Array.prototype.filter.call(D.querySelectorAll('#pm .pm-btns button'), function (b) { return /Split all/.test(b.textContent); })[0].click(); await wait(20);
    assert(f.entities.length === 12 && f.entities.every(function (e) { return e.t === 'line'; }), '12 lines: ' + f.entities.length);
    var lens = f.entities.map(function (e) { return Math.round(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)); }).sort(function (a, b) { return a - b; }).join(',');
    assert(lens === '10,10,10,10,10,10,10,10,20,20,20,20', 'pieces ' + lens);
    assert(UI.App.undo.length === undo0 + 1, 'one undo step for all');
    var st = stNoRedundant('split all');
    assert(st.status !== 'over', 'status ' + st.status);
    UI.pmCancel();
    return '# → ' + f.entities.length + ' lines, ' + (f.rels || []).length + ' relations';
  });
  step('sketch-construct: Join Entities — lines (0,0)-(30,0) and (20,0)-(50,0) selected join into (0,0)-(50,0) keeping Horizontal; two arcs of one circle that close it join into the circle; a gap is refused with a message', async function () {
    await rskNew();
    var f = cstSketch([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 20, y1: 0, x2: 50, y2: 0 }, { t: 'arc', cx: 0, cy: 30, r: 5, a0: 0, a1: 200 }, { t: 'arc', cx: 0, cy: 30, r: 5, a0: 190, a1: 360 }, { t: 'line', x1: 0, y1: -10, x2: 10, y2: -10 }, { t: 'line', x1: 15, y1: -10, x2: 25, y2: -10 }]);
    f.rels = [{ type: 'horizontal', refs: ['0'] }]; UI.updateSketches();
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }]);
    stFlyMenu('trim'); c14MenuRow('Join Entities').click(); await wait(20);
    assert(/2 entities/.test(D.querySelector('#pm .pm-pick').textContent), 'the selection is in the box: ' + D.querySelector('#pm .pm-pick').textContent);
    await pmAccept();
    assert(!UI.hasPM() && f.entities.length === 5, 'joined: ' + f.entities.length);
    stLine(f.entities[0], 0, 0, 50, 0, 'joined line');
    assert(cstHas('horizontal 0'), 'Horizontal kept: ' + stRels().join(', '));
    var r = UI.sketchConstruct.joinEntities(f, [1, 2]);
    assert(r.ok && f.entities[1].t === 'circle' && f.entities.length === 4 && Math.abs(f.entities[1].r - 5) < 1e-9, 'arcs → circle: ' + JSON.stringify(r) + ' ' + JSON.stringify(f.entities[1]));
    UI.setSelection([{ kind: 'entity', index: 2 }, { kind: 'entity', index: 3 }]);
    UI.cmdJoinEntities(); await wait(20);
    await pmAccept();
    assert(UI.hasPM() && f.entities.length === 4, 'a gap is refused, the PM stays');
    UI.pmCancel();
    return 'line (0,0)-(50,0), circle R5';
  });
  // ---- end sketch-construct
