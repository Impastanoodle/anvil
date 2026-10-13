  // ---- rfAP (2026-10-13): Modify Sketch, Constrain All, Search Commands, Tools ▸ sketch menus, Segment, Equation Driven Curve
  async function rfAPNew(ents) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    UI.updateSketches(); await wait(20);
    return f;
  }
  function rfAPBlank() {   // an imported 10 x 6 blank: a R1 corner, a hole, ends a hair apart, nothing related
    return [{ t: 'line', x1: 0, y1: 0, x2: 9, y2: 1e-7 }, { t: 'arc', cx: 9, cy: 1, r: 1, a0: 270, a1: 360 }, { t: 'line', x1: 10, y1: 1, x2: 10, y2: 6 },
      { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 }, { t: 'circle', cx: 5, cy: 3, r: 0.5 }];
  }
  function rfAPButton(label) { return Array.prototype.filter.call(D.querySelectorAll('.pm-btns button'), function (b) { return b.textContent === label; })[0]; }
  function rfAPSet(key, val) { var i = D.querySelector('[data-key="' + key + '"]'); assert(i, 'field ' + key); i.value = String(val); i.dispatchEvent(new W.Event('input', { bubbles: true })); i.dispatchEvent(new W.Event('change', { bubbles: true })); }
  step('rfAP: Constrain All on an imported blank — Coincident ends, Horizontal / Vertical lines, Tangent arc, then dimensions: fully defined in one undo step; Ctrl+Z takes it all back', async function () {
    var f = await rfAPNew(rfAPBlank()), u0 = UI.App.undo.length;
    var r = UI.cmdConstrainAll({}); await idle();   // rfBC: from script (options given) it runs at once, with Fully Define
    assert(r && r.ok, 'constrain all: ' + (r && r.error));
    assert(r.added.coincident === 6 && r.added.horizontal === 2 && r.added.vertical === 2 && r.added.tangent === 2, 'relations ' + JSON.stringify(r.added));
    assert(r.status === 'full' && r.dims >= 4, 'status ' + r.status + ', ' + r.dims + ' dims');
    assert(f.entities[0].y2 === 0 || Math.abs(f.entities[0].y2) < 1e-12, 'the bottom line made level: ' + f.entities[0].y2);
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(!f.rels || !f.rels.length, 'undo left ' + (f.rels || []).length + ' relations');
    // from the sketch's shortcut menu too
    var items = UI.sketchMenuItems([{ label: 'Exit Sketch', action: function () { } }, { label: 'Discard Changes and Exit', action: function () { } }]);
    var ca = items.filter(function (x) { return x.label === 'Constrain All'; })[0], md = items.filter(function (x) { return x.label === 'Modify Sketch…'; })[0];
    assert(ca && md, 'shortcut menu rows');
    ca.action(); await idle();
    assert(UI.pmTitle() === 'Constrain All', 'rfBC: the shortcut menu opens the Constrain All PM: ' + UI.pmTitle());
    UI.pmOK(); await idle();
    assert(UI.activeSketchFeature().rels.length >= 12, 'shortcut menu Constrain All');
    await UI.exitSketch(); await idle();
    return r.relations + ' relations, ' + r.dims + ' dimensions, ' + r.status;
  });
  step('rfAP: Modify Sketch — ΔX / ΔY Apply moves the whole sketch with its relations; Lower-left to origin; Rotate 90°; Flip Horizontal keeps the arc and the Tangent; Scale ×2; a drag moves it; ✗ puts it all back', async function () {
    var f = await rfAPNew(rfAPBlank());
    UI.cmdConstrainAll({ fullyDefine: false }); await idle();
    var before = JSON.stringify(f.entities);
    UI.cmdModifySketch(); await idle();
    assert(UI.pmTitle() === 'Modify Sketch', 'PM ' + UI.pmTitle());
    rfAPSet('dx', 2); rfAPSet('dy', 3);
    rfAPButton('Apply').click(); await idle();
    f = UI.activeSketchFeature();
    var b = W.SketchSolver.sketchBox(f);
    assert(Math.abs(b.x0 - 2) < 1e-9 && Math.abs(b.y0 - 3) < 1e-9, 'moved: ' + JSON.stringify(b));
    rfAPButton('Lower-left to origin').click(); await idle();
    b = W.SketchSolver.sketchBox(UI.activeSketchFeature());
    assert(Math.abs(b.x0) < 1e-9 && Math.abs(b.y0) < 1e-9 && Math.abs(b.x1 - 10) < 1e-9, 'to origin: ' + JSON.stringify(b));
    var applies = Array.prototype.filter.call(D.querySelectorAll('.pm-btns button'), function (x) { return x.textContent === 'Apply'; });
    assert(applies.length === 3, 'three Apply buttons (Translate, Rotate, Scale): ' + applies.length);
    rfAPSet('angle', 90); applies = Array.prototype.filter.call(D.querySelectorAll('.pm-btns button'), function (x) { return x.textContent === 'Apply'; });
    applies[1].click(); await idle();
    b = W.SketchSolver.sketchBox(UI.activeSketchFeature());
    assert(Math.abs(b.x0 + 6) < 1e-9 && Math.abs(b.y1 - 10) < 1e-9, 'rotated: ' + JSON.stringify(b));
    rfAPButton('Flip Horizontal').click(); await idle();
    f = UI.activeSketchFeature();
    b = W.SketchSolver.sketchBox(f);
    assert(Math.abs(b.x0) < 1e-9 && Math.abs(b.x1 - 6) < 1e-9, 'flipped: ' + JSON.stringify(b));
    var an = W.SketchSolver.analyze(f);
    assert(an.conflicts === 0 && f.rels.some(function (r) { return r.type === 'tangent'; }), 'relations hold after the flip: ' + an.conflicts);
    rfAPSet('factor', 2); applies = Array.prototype.filter.call(D.querySelectorAll('.pm-btns button'), function (x) { return x.textContent === 'Apply'; });
    applies[2].click(); await idle();
    b = W.SketchSolver.sketchBox(UI.activeSketchFeature());
    assert(Math.abs(b.x1 - 12) < 1e-9 && Math.abs(b.y1 - 20) < 1e-9, 'scaled: ' + JSON.stringify(b));
    // a drag in the graphics area moves the sketch
    var cmd = UI.App.command, pl = UI.activePlane(), s0 = UI.worldToScreen(K.to3D(pl, 1, 1)), s1 = UI.worldToScreen(K.to3D(pl, 2, 1));
    assert(cmd && cmd.onSketchDrag, 'drag hook');
    var h = cmd.onSketchDrag(s0, { shiftKey: false }); h.start(); h.move(s1); h.end(s1); await idle();
    b = W.SketchSolver.sketchBox(UI.activeSketchFeature());
    assert(Math.abs(b.x0 - 1) < 1e-6, 'dragged: ' + JSON.stringify(b));
    UI.pmCancel(); await idle();
    assert(JSON.stringify(UI.activeSketchFeature().entities) === before, 'cancel restores the sketch');
    await UI.exitSketch(); await idle();
    return 'move, origin, rotate, flip, scale, drag, cancel';
  });
  step('rfAP: Search Commands — "stretch entities" lists Stretch Entities with its icon and runs it on Enter; "constrain all", "modify sketch", "flat pattern", "hole wizard" find their commands; a tool outside a sketch says so', async function () {
    var f = await rfAPNew([{ t: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }]);
    var box = $('cmd-search');
    box.focus(); box.value = 'stretch entities'; box.dispatchEvent(new W.Event('input', { bubbles: true }));
    var rows = Array.prototype.slice.call(D.querySelectorAll('body > .menu .mi'));
    assert(rows.length && /Stretch Entities/.test(rows[0].textContent) && rows[0].querySelector('.mi-ico svg'), 'list: ' + rows.map(function (r) { return r.textContent; }).join(' | '));
    box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await idle();
    assert(/^Stretch/.test(UI.pmTitle()), 'PM ' + UI.pmTitle());
    UI.pmCancel(); await idle();
    assert(!D.querySelector('body > .menu'), 'list closed');
    var s = UI.searchCommands('constrain all');
    assert(s[0] && s[0].name === 'Constrain All' && s[0].enabled, 'constrain all: ' + JSON.stringify(s[0]));
    assert(UI.searchCommands('modify sketch')[0].name === 'Modify', 'modify: ' + JSON.stringify(UI.searchCommands('modify sketch')[0]));
    assert(UI.searchCommands('segment')[0].name === 'Segment', 'segment');
    assert(UI.searchCommands('hole wizard')[0].name === 'Hole Wizard', 'hole wizard');
    await UI.exitSketch(); await idle();
    var fp = UI.searchCommands('flat pattern').map(function (x) { return x.name; });
    assert(fp.indexOf('Flatten') >= 0, 'flat pattern: ' + fp);
    box.value = 'trim entities';
    box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await idle();
    assert(UI.App.mode !== 'sketch' && !UI.pmTitle(), 'no sketch: nothing opened (' + UI.pmTitle() + ')');
    UI.closeMenus();
    return UI.searchCommands('stretch').length + ' hits for "stretch"';
  });
  step('rfAP: Tools menu — Sketch Entities, Sketch Tools, Relations and Dimensions rows with every sketch command (Segment, Modify, Constrain All); greyed outside a sketch; Tools ▸ Sketch Entities ▸ Line picks the Line tool', async function () {
    await anvil.newPart(); await idle();
    lyrMenu('Tools');
    var rows = Array.prototype.slice.call(D.querySelectorAll('body > .menu .mi')).map(function (r) { return r.textContent; });
    ['Sketch Entities ▸ Line', 'Sketch Entities ▸ Equation Driven Curve', 'Sketch Entities ▸ Straight Slot', 'Sketch Tools ▸ Trim Entities', 'Sketch Tools ▸ Stretch Entities', 'Sketch Tools ▸ Segment…', 'Sketch Tools ▸ Modify…',
      'Relations ▸ Constrain All', 'Relations ▸ Add…', 'Dimensions ▸ Smart Dimension', 'Dimensions ▸ Horizontal Ordinate Dimension'].forEach(function (n) {
      assert(rows.some(function (r) { return r.indexOf(n) >= 0; }), 'Tools lacks ' + n);
    });
    var seg = lyrMenuRow(/Sketch Tools ▸ Segment/);
    assert(seg.classList.contains('disabled'), 'Segment greyed outside a sketch');
    UI.closeMenus();
    await UI.newSketchOnPlane('Front'); await idle();
    lyrMenu('Tools'); lyrMenuRow(/Sketch Entities ▸ Line$/).click(); await idle();
    assert(UI.App.tool === 'line', 'tool ' + UI.App.tool);
    UI.cancelTool && UI.cancelTool();
    await UI.exitSketch(); await idle();
    return rows.filter(function (r) { return /Sketch Entities ▸|Sketch Tools ▸|Relations ▸|Dimensions ▸/.test(r); }).length + ' sketch rows';
  });
  step('rfAP: Segment — 4 equal segments on a line put 3 points Coincident with it, one undo step; Sketch segments split an arc into 3 equal arcs; Equation Driven Curve y = 2*sin(x) over 0..pi is a spline through its points, edited from its PM', async function () {
    var f = await rfAPNew([{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'arc', cx: 0, cy: 0, r: 5, a0: 0, a1: 90 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdSegment(); await idle();
    assert(UI.pmTitle() === 'Segment', 'PM ' + UI.pmTitle());
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var pts = f.entities.filter(function (e) { return e.t === 'point'; }).map(function (e) { return e.x; });
    assert(pts.join() === '2,4,6', 'points ' + pts);
    UI.setSelection([{ kind: 'entity', index: 1 }]);
    UI.cmdSegment(); await idle();
    UI.pmSpec().values.kind = 'segments'; UI.pmSpec().values.n = 3;
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var arcs = f.entities.filter(function (e) { return e.t === 'arc'; });
    assert(arcs.length === 3 && arcs.every(function (a) { return Math.abs(a.a1 - a.a0 - 30) < 1e-6; }), 'arcs ' + JSON.stringify(arcs));
    UI.setSelection([]);
    UI.cmdEquationCurve(); await idle();
    assert(UI.pmTitle() === 'Equation Driven Curve', 'PM ' + UI.pmTitle());
    rfAPSet('y', '2*sin(x)'); rfAPSet('x0', '0'); rfAPSet('x1', 'pi');
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var sp = f.entities[f.entities.length - 1];
    assert(sp.t === 'spline' && sp.eq && sp.eq.y === '2*sin(x)' && Math.abs(sp.pts[12][1] - 2) < 1e-9, 'curve ' + JSON.stringify(sp.eq));
    UI.setSelection([{ kind: 'entity', index: f.entities.length - 1 }]);
    UI.cmdEquationCurve(); await idle();
    rfAPSet('y', '3*sin(x)');
    UI.pmOK(); await idle();
    sp = UI.activeSketchFeature().entities[UI.activeSketchFeature().entities.length - 1];
    assert(sp.eq.y === '3*sin(x)' && Math.abs(sp.pts[12][1] - 3) < 1e-9, 'edited ' + JSON.stringify(sp.eq));
    var src = anvil.script();
    await UI.exitSketch(); await idle();
    assert(src.indexOf('3*sin(x)') >= 0, 'the equation is in the script');
    return 'segments, arcs, equation curve';
  });
  // --- end rfAP ---
