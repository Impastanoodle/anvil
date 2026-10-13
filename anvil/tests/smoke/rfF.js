  // --- rfF: Select tool — entity PMs keep the keyboard, multi-selection Properties PM, point selection, drag snaps ---
  function rfFGroups() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-group > h4'), function (h) { return h.textContent.trim(); }); }
  function rfFButtons() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-group button'), function (b) { return b.textContent.trim(); }); }
  // a key pressed where the keyboard is (the focused PM box, else the page), as a real key press arrives
  function rfFKey(k) { var t = D.activeElement && D.activeElement !== D.body ? D.activeElement : D; t.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  function rfFSel() { return anvil.selection().map(function (s) { return s.kind === 'sketchPoint' ? 'pt:' + s.ref : s.kind + ':' + s.index; }).join(' '); }
  function rfFRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  step('rfF: Select + Delete deletes a circle, an arc, a slot, a polygon and an ellipse — their PropertyManagers leave the keyboard with the graphics area (Delete blanked Center X before)', async function () {
    await rskNew();
    var f = fxSk([{ t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'arc', cx: 20, cy: 0, r: 5, a0: 0, a1: 180 }, { t: 'slot', x1: 40, y1: 0, x2: 50, y2: 0, w: 6 },
      { t: 'poly', cx: -25, cy: 0, r: 6, n: 6, rot: 0 }, { t: 'ellipse', cx: 0, cy: 25, rx: 10, ry: 5, rot: 0 }]);
    UI.setTool('select');
    var picks = [['circle', [0, -5], 'Circle'], ['arc', [20, 5], 'Arc'], ['slot', [45, 3], 'Slot'], ['poly', [-29.5, 2.598], 'Polygon'], ['ellipse', [6, 25 - 4], 'Ellipse']], done = [];
    for (var k = 0; k < picks.length; k++) {
      var t = picks[k][0], n0 = f.entities.length;
      rskClick(picks[k][1]); await wait(10);
      assert(rfFSel() === 'entity:' + f.entities.map(function (e) { return e.t; }).indexOf(t), t + ' selected: ' + rfFSel());
      assert(UI.pmTitle() && UI.pmTitle().indexOf(picks[k][2]) >= 0, t + ' PM: ' + UI.pmTitle());
      var a = D.activeElement;
      assert(!(a && $('pm').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)), t + ': the PM took the keyboard (' + (a && a.tagName) + ' ' + (a && a.getAttribute('data-key')) + ')');
      rfFKey('Delete'); await wait(10);
      f = UI.activeSketchFeature();
      assert(f.entities.length === n0 - 1 && !f.entities.some(function (e) { return e.t === t; }), t + ' deleted: ' + JSON.stringify(f.entities.map(function (e) { return e.t; })));
      assert(!UI.hasPM(), t + ': PM closed: ' + UI.pmTitle());
      done.push(t);
    }
    UI.exitSketch(true); await idle();
    return done.join(', ') + ' deleted';
  });
  step('rfF: two sketch entities selected (Ctrl+click, Shift+click, a box) show the Properties PM with Selected Entities, Existing Relations and Add Relations; Parallel adds the relation; Ctrl+click back to one shows Line Properties, to none closes it', async function () {
    await rskNew();
    var f = fxSk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 2 }, { t: 'line', x1: 0, y1: 10, x2: 20, y2: 15 }, { t: 'circle', cx: 40, cy: 5, r: 4 }]);
    UI.setTool('select');
    rskClick([10, 1]); await wait(10);
    assert(UI.pmTitle() === 'Line Properties', 'one line: ' + UI.pmTitle());
    selClick(rskScr([10, 12.5]), { ctrlKey: true }); await wait(10);
    assert(rfFSel() === 'entity:0 entity:1', 'Ctrl+click adds: ' + rfFSel());
    assert(UI.pmTitle() === 'Properties', 'Properties PM: ' + UI.pmTitle());
    var g = rfFGroups();
    assert(g.indexOf('Selected Entities') >= 0 && g.indexOf('Existing Relations') >= 0 && g.indexOf('Add Relations') >= 0, 'groups ' + g.join(' | '));
    var b = rfFButtons();
    assert(b.indexOf('Parallel') >= 0 && b.indexOf('Perpendicular') >= 0 && b.indexOf('Equal') >= 0, 'relation buttons ' + b.join(' | '));
    var a = D.activeElement;
    assert(!(a && $('pm').contains(a) && a.tagName === 'INPUT'), 'the Properties PM took the keyboard');
    clickPmButton('Parallel'); await wait(10);
    assert(rfFRels().some(function (r) { return /^parallel:0,1$|^parallel:1,0$/.test(r); }), 'Parallel added: ' + rfFRels().join(' '));
    f = UI.activeSketchFeature();
    near((f.entities[0].y2 - f.entities[0].y1) * (f.entities[1].x2 - f.entities[1].x1) - (f.entities[0].x2 - f.entities[0].x1) * (f.entities[1].y2 - f.entities[1].y1), 0, 1e-7, 'lines parallel');
    assert(UI.pmTitle() === 'Properties' && rfFSel() === 'entity:0 entity:1' && /Parallel/.test($('pm').textContent), 'still Properties, the relation listed: ' + UI.pmTitle() + ' ' + rfFSel());
    var l1 = f.entities[1];
    selClick(rskScr([(l1.x1 + l1.x2) / 2, (l1.y1 + l1.y2) / 2]), { ctrlKey: true }); await wait(10);
    assert(rfFSel() === 'entity:0' && UI.pmTitle() === 'Line Properties', 'Ctrl+click back to one: ' + rfFSel() + ' ' + UI.pmTitle());
    var l0 = f.entities[0];
    selClick(rskScr([(l0.x1 + l0.x2) / 2, (l0.y1 + l0.y2) / 2]), { ctrlKey: true }); await wait(10);
    assert(rfFSel() === '' && !UI.hasPM(), 'Ctrl+click to none: ' + rfFSel() + ' ' + UI.pmTitle());
    // Shift+click: a line and the circle (Tangent offered)
    rskClick([(l0.x1 + l0.x2) / 2, (l0.y1 + l0.y2) / 2]); await wait(10);
    selClick(rskScr([44, 5]), { shiftKey: true }); await wait(10);
    assert(rfFSel() === 'entity:0 entity:2' && UI.pmTitle() === 'Properties' && rfFButtons().indexOf('Tangent') >= 0, 'Shift+click: ' + rfFSel() + ' ' + UI.pmTitle() + ' ' + rfFButtons().join(' | '));
    rskClick([60, 30]); await wait(10);
    assert(rfFSel() === '' && !UI.hasPM(), 'a click on nothing clears it: ' + rfFSel() + ' ' + UI.pmTitle());
    // a box round the two lines
    anvil.boxSelect(rskScr([-5, -5]), rskScr([25, 25])); await wait(10);
    assert(rfFSel() === 'entity:0 entity:1' && UI.pmTitle() === 'Properties', 'box: ' + rfFSel() + ' ' + UI.pmTitle());
    // Delete removes both and closes it
    rfFKey('Delete'); await wait(10);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 1 && f.entities[0].t === 'circle' && !UI.hasPM(), 'both deleted: ' + JSON.stringify(f.entities) + ' ' + UI.pmTitle());
    UI.exitSketch(true); await idle();
    return 'Ctrl / Shift / box -> Properties, Parallel, back to Line Properties';
  });
  step('rfF: clicking a line\'s end point (an arc end, a circle centre) selects the point — the Point PM with X / Y, Existing and Add Relations; Delete deletes nothing and leaves X; X moves the end; two points Ctrl+clicked take a Horizontal', async function () {
    await rskNew();
    var f = fxSk([{ t: 'line', x1: -20, y1: -8, x2: -12, y2: -4 }, { t: 'line', x1: 0, y1: 0, x2: 15, y2: 6 }, { t: 'circle', cx: 30, cy: 10, r: 6 }, { t: 'arc', cx: 30, cy: -15, r: 5, a0: 0, a1: 90 }]);
    UI.setTool('select');
    rskClick([-12, -4]); await wait(10);
    assert(rfFSel() === 'pt:0.p2', 'the end point selected: ' + rfFSel());
    assert(UI.pmTitle() === 'Point' && pmField('X') && +pmField('X').value === -12 && +pmField('Y').value === -4, 'Point PM: ' + UI.pmTitle());
    var g = rfFGroups();
    assert(g.indexOf('Existing Relations') >= 0 && g.indexOf('Add Relations') >= 0 && g.indexOf('Parameters') >= 0, 'groups ' + g.join(' | '));
    assert(rfFButtons().indexOf('Fix') >= 0, 'Fix offered for a point: ' + rfFButtons().join(' | '));
    var u0 = UI.App.undo.length;
    rfFKey('Delete'); await wait(10);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 4 && UI.pmTitle() === 'Point' && pmField('X').value !== '' && +pmField('X').value === -12 && UI.App.undo.length === u0, 'Delete: nothing deleted, X kept: ' + f.entities.length + ' ' + UI.pmTitle() + ' "' + (pmField('X') && pmField('X').value) + '"');
    UI.pmSetField('x', '-10'); await wait(10);
    f = UI.activeSketchFeature();
    assert(Math.abs(f.entities[0].x2 + 10) < 1e-9 && Math.abs(f.entities[0].y2 + 4) < 1e-6 && Math.abs(f.entities[0].x1 + 20) < 1e-6, 'X moved the end: ' + JSON.stringify(f.entities[0]));
    rskClick([-15, -6]); await wait(10);
    assert(rfFSel() === 'entity:0' && UI.pmTitle() === 'Line Properties', 'the line\'s middle: ' + rfFSel() + ' ' + UI.pmTitle());
    rskClick([30, 10]); await wait(10);
    assert(rfFSel() === 'pt:2.c' && UI.pmTitle() === 'Point', 'circle centre: ' + rfFSel() + ' ' + UI.pmTitle());
    rskClick([30, 4]); await wait(10);
    assert(rfFSel() === 'entity:2' && UI.pmTitle() === 'Circle', 'circle edge: ' + rfFSel() + ' ' + UI.pmTitle());
    rskClick([35, -15]); await wait(10);
    assert(rfFSel() === 'pt:3.p1' && UI.pmTitle() === 'Point', 'arc end: ' + rfFSel() + ' ' + UI.pmTitle());
    // the line's end and the other line's start: Properties, Horizontal between the two points
    rskClick([-10, -4]); await wait(10);
    selClick(rskScr([0, 0]), { ctrlKey: true }); await wait(10);
    assert(rfFSel() === 'pt:0.p2 pt:1.p1' && UI.pmTitle() === 'Properties' && rfFButtons().indexOf('Horizontal') >= 0, 'two points: ' + rfFSel() + ' ' + UI.pmTitle() + ' ' + rfFButtons().join(' | '));
    clickPmButton('Horizontal'); await wait(10);
    f = UI.activeSketchFeature();
    assert(rfFRels().indexOf('horizontal:0.p2,1.p1') >= 0 && Math.abs(f.entities[0].y2 - f.entities[1].y1) < 1e-9, 'Horizontal between the points: ' + rfFRels().join(' '));
    UI.pmCancel(); await wait(10);
    assert(rfFSel() === '' && !UI.hasPM(), 'Esc / ✗ clears it: ' + rfFSel());
    UI.exitSketch(true); await idle();
    return 'end point, centre, arc end: Point PM; Horizontal between two points';
  });
  step('rfF: dragging a line\'s end snaps onto another sketch point (Coincident) and onto a model corner (no relation); with Ctrl held it lands where it is dropped', async function () {
    var f = await msBox('{ face: b, normal: [0, 0, 1] }, 0', 'DragSnapL');
    f = UI.activeSketchFeature();
    var n0 = f.entities.length;
    f.entities.push({ t: 'line', x1: 50, y1: 30, x2: 70, y2: 40 }, { t: 'point', x: 80, y: 20 });
    UI.updateSketches();
    var L = n0, P = n0 + 1, r0 = (f.rels || []).length;
    UI.setTool('select');
    var q = rskScr([80, 20]);
    await selDrag(rskScr([70, 40]), [q[0] + 4, q[1] - 3]);
    f = UI.activeSketchFeature();
    assert(f.entities[L].x2 === 80 && f.entities[L].y2 === 20 && (f.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.indexOf(L + '.p2') >= 0 && r.refs.indexOf(String(P)) >= 0; }), 'onto the sketch point, Coincident: ' + JSON.stringify(f.entities[L]) + ' ' + rfFRels().join(' '));
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities[L].x2 === 70 && (f.rels || []).length === r0, 'undone');
    var v = rskScr([100, 60]);
    await selDrag(rskScr([70, 40]), [v[0] - 3, v[1] + 4]);
    f = UI.activeSketchFeature();
    assert(f.entities[L].x2 === 100 && f.entities[L].y2 === 60 && (f.rels || []).length === r0, 'onto the model corner, no relation: ' + JSON.stringify(f.entities[L]) + ' ' + rfFRels().join(' '));
    var c = rskScr([80, 20]);
    await selDrag(rskScr([100, 60]), [c[0] + 3, c[1] + 2], null, { ctrlKey: true });
    f = UI.activeSketchFeature();
    var e = f.entities[L];
    assert(Math.abs(e.x2 - 80) > 0.3 && Math.abs(e.x2 - 80) < 2 && (f.rels || []).length === r0, 'Ctrl: no snap to the point: ' + JSON.stringify(e) + ' ' + rfFRels().join(' '));
    UI.exitSketch(true); await idle();
    return 'Coincident on the point, model corner exact, Ctrl free at (' + e.x2.toFixed(2) + ', ' + e.y2.toFixed(2) + ')';
  });
  step('rfF: hidden levels and layers — a box selects nothing on them, a click on their curve or end point selects nothing; shown again, both select', async function () {
    var f = await lyrPart('p.sketch("Front", 0, "BoxF").line(0, 0, 30, 0).circle(15, 15, 5);', 'BoxF');
    UI.setTool('select');
    var r1 = UI.levels.op('makeMain', 2), r2 = UI.levels.op('setVisible', 1, false);
    assert(r1.ok && r2.ok, 'level 1 hidden: ' + JSON.stringify([r1, r2]));
    f = UI.activeSketchFeature();
    assert(UI.entityLayerHidden(f, f.entities[0]), 'level 1 entities hidden');
    anvil.boxSelect(rskScr([-5, -5]), rskScr([35, 25])); await wait(10);
    assert(rfFSel() === '' && !UI.hasPM(), 'box on a hidden level: ' + rfFSel());
    rskClick([10, 0]); rskClick([30, 0]); rskClick([15, 15]); await wait(10);
    assert(rfFSel() === '' && !UI.hasPM(), 'clicks on a hidden level: ' + rfFSel() + ' ' + UI.pmTitle());
    UI.levels.op('setVisible', 1, true); await wait(10);
    anvil.boxSelect(rskScr([-5, -5]), rskScr([35, 25])); await wait(10);
    assert(rfFSel() === 'entity:0 entity:1' && UI.pmTitle() === 'Properties', 'shown: ' + rfFSel() + ' ' + UI.pmTitle());
    UI.pmCancel();
    // a hidden sketch layer, the same
    f.layers = (f.layers || []).concat([{ name: 'HID', hidden: true }]); f.entities[1].layer = 'HID'; UI.updateSketches();
    rskClick([15, 15]); await wait(10);
    assert(rfFSel() === '', 'circle centre on a hidden layer: ' + rfFSel());
    anvil.boxSelect(rskScr([-5, -5]), rskScr([35, 25])); await wait(10);
    assert(rfFSel() === 'entity:0' && UI.pmTitle() === 'Line Properties', 'box with the layer hidden: ' + rfFSel() + ' ' + UI.pmTitle());
    UI.setSelection([]); UI.closePM();
    await UI.exitSketch(true); await idle();
    return 'nothing picked on hidden level 1 / layer HID';
  });
  // --- end rfF ---
