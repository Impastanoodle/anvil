  // ---- sketch tools (ui-sketch-tools.js): each Sketch-tab tool opens its SolidWorks PropertyManager at once (groups,
  // fields, order, defaults) and is driven like a user (ribbon → PM → picks → options → ✓ → geometry / relations)
  function stToolGroups() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-group h4'), function (h) { return h.textContent.replace(/^[▾▸]/, '').trim(); }); }
  function stLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-row label'), function (l) { return l.textContent.trim(); }).filter(function (t) { return t; }); }
  function stCheck(key) { var cb = D.querySelector('#pm input[data-key="' + key + '"]'); assert(cb, 'no check box ' + key); cb.click(); }
  function stRadio(key, val) { var rb = D.querySelector('#pm input[data-key="' + key + ':' + val + '"]'); assert(rb, 'no option ' + key + ':' + val); rb.click(); }
  function stToolRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  function stNoRedundant(label) { var st = UI.sketchStatus(); assert(st.rels.every(function (s) { return s === 'ok' || s === 'driven'; }) && (!st.dims || st.dims.every(function (s) { return s === 'ok' || s === 'driven'; })), label + ': ' + JSON.stringify(st)); return st; }
  // a 40 × 20 Line-tool rectangle from the origin with its width and height dimensioned: Fully Defined
  async function stRect() {
    await rskNew();
    UI.App.view.showGrid = false;
    UI.setTool('line'); rskClick([0, 0]); rskClick([40, 0]); rskClick([40, 20]); rskClick([0, 20]); rskClick([0, 0]);
    UI.setTool('select');
    var f = UI.activeSketchFeature();
    f.dims = [{ e: 0, k: 'len', off: -3 }, { e: 1, k: 'len', off: 3 }];
    UI.updateSketches();
    assert(f.entities.length === 4 && UI.sketchStatus().status === 'full', 'rectangle Fully Defined: ' + UI.sketchStatus().status);
    return f;
  }
  step('sketch-tools: the Sketch tab groups the tools as SolidWorks does — Sketch Fillet ▸ Sketch Chamfer, Trim ▸ Extend, Convert ▸ Intersection Curve, Offset Entities, and small Mirror / Linear Sketch Pattern ▸ Circular / Move Entities ▸ Copy, Rotate, Scale, Stretch flyouts; each opens its PropertyManager', async function () {
    await rskNew();
    ['skFillet', 'trim', 'convert', 'mirrorEnt', 'skPattern', 'moveEnt'].forEach(function (g) { UI.ribbonFlyFace(g, 0); });
    UI.setRibbonTab('Sketch');
    var lists = {};
    ['skFillet', 'trim', 'convert', 'mirrorEnt', 'skPattern', 'moveEnt'].forEach(function (g) {
      var fl = c14Fly(g);
      assert(fl, 'no ' + g + ' flyout');
      fl.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); fl.querySelector('.rb-caret').click();
      lists[g] = c14MenuLabels().map(function (t) { return t.replace(/\s*[A-Z]?$/, ''); }).join(' | ');
      UI.closeMenus();
    });
    assert(/^Sketch Fillet \| Sketch Chamfer/.test(lists.skFillet) && /^Trim Entities \| Extend Entities/.test(lists.trim) && /^Convert Entities \| Intersection Curve/.test(lists.convert), JSON.stringify(lists));
    assert(/^Linear Sketch Pattern \| Circular Sketch Pattern/.test(lists.skPattern) && /^Move Entities \| Copy Entities \| Rotate Entities \| Scale Entities \| Stretch Entities/.test(lists.moveEnt), JSON.stringify(lists));
    assert(c14Fly('mirrorEnt').closest('.rb-stack') && c14Fly('moveEnt').closest('.rb-stack'), 'small flyouts sit in a stack');
    var off = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons > .rb'), function (b) { return b.getAttribute('aria-label') === 'Offset Entities'; })[0];
    assert(off, 'Offset Entities is a button of its own');
    var fl = c14Fly('skFillet');
    fl.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); fl.querySelector('.rb-caret').click();
    c14MenuRow('Sketch Chamfer').click(); await wait(20);
    assert(UI.pmTitle() === 'Sketch Chamfer' && stToolGroups().join('|') === 'Entities to Chamfer|Chamfer Parameters', 'Chamfer PM: ' + UI.pmTitle() + ' ' + stToolGroups().join('|'));
    UI.pmCancel();
    var expect = { cmdMoveEntities: 'Move|Entities to Move|Parameters', cmdCopyEntities: 'Copy|Entities to Copy|Parameters', cmdRotateEntities: 'Rotate|Entities to Rotate|Parameters', cmdScaleEntities: 'Scale|Entities to Scale|Parameters', cmdStretchEntities: 'Stretch|Entities to Stretch|Parameters',
      cmdCircularSketchPattern: 'Circular Pattern|Parameters|Entities to Pattern|Instances to Skip', cmdSketchPattern: 'Linear Pattern|Direction 1|Direction 2|Entities to Pattern|Instances to Skip',
      cmdOffsetEntities: 'Offset Entities|Parameters', cmdConvertEntities: 'Convert Entities|Entities to Convert', cmdTrimEntities: 'Trim Entities|Options', cmdSketchFillet: 'Sketch Fillet|Entities to Fillet|Fillet Parameters' };
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 10, cy: 0, r: 2 }); UI.updateSketches();
    Object.keys(expect).forEach(function (c) {
      UI[c]();
      var got = UI.pmTitle() + '|' + stToolGroups().join('|');
      UI.pmCancel();
      assert(got === expect[c], c + ': ' + got);
    });
    ['skFillet', 'trim', 'convert', 'mirrorEnt', 'skPattern', 'moveEnt'].forEach(function (g) { UI.ribbonFlyFace(g, 0); });
    return Object.keys(lists).map(function (g) { return lists[g]; }).join(' / ');
  });
  step('sketch-tools: Sketch Fillet — the PM (Radius, Keep constrained corners on, Dimension each fillet off); two corners of a dimensioned rectangle get one R dimension and an Equal, the sketch stays Fully Defined with no redundancy; ✗ takes both fillets back; two picked entities (a line and an arc) are filleted', async function () {
    var f = await stRect();
    UI.cmdSketchFillet(); await wait(20);
    assert(stLabels().join('|') === 'Radius|Keep constrained corners|Dimension each fillet|Fillet all corners of the chain' &&UI.pmSpec().values.keepCorner === true && UI.pmSpec().values.dimEach === false, 'fields ' + stLabels().join('|'));
    UI.pmSetField('r', '4');
    var undo0 = UI.App.undo.length;
    rskClick([40.3, 0.3]); rskClick([39.7, 20.2]);
    var arcs = f.entities.filter(function (e) { return e.t === 'arc'; });
    assert(arcs.length === 2 && arcs.every(function (a) { return Math.abs(a.r - 4) < 1e-9; }), 'two R4 fillets: ' + JSON.stringify(arcs));
    assert(f.dims.filter(function (d) { return d.k === 'r'; }).length === 1 && stToolRels().some(function (r) { return /^equal:/.test(r); }), 'one R dimension + Equal: ' + stToolRels().join(' '));
    var st = stNoRedundant('fillets');
    assert(st.status === 'full' && UI.App.undo.length === undo0 + 2, 'Fully Defined, one undo step each: ' + st.status + ' ' + (UI.App.undo.length - undo0));
    assert(D.querySelectorAll('#pm .pm-list .pm-item').length === 2, 'listed in Entities to Fillet');
    UI.pmCancel();
    assert(f.entities.length === 4 && !f.entities.some(function (e) { return e.t === 'arc'; }) && UI.App.undo.length === undo0 && UI.sketchStatus().status === 'full', '✗ took them back: ' + f.entities.length);
    // a line and an arc that meet at a corner, picked one after the other
    f.entities.push({ t: 'line', x1: 60, y1: 0, x2: 80, y2: 0 }, { t: 'arc', cx: 90, cy: 0, r: 10, a0: 0, a1: 180 });
    f.rels.push({ type: 'coincident', refs: ['4.p2', '5.p2'] });
    UI.updateSketches();
    UI.cmdSketchFillet(); UI.pmSetField('r', '2');
    rskClick([70, 0]); rskClick([90, 10]);
    var fa = f.entities[f.entities.length - 1];
    assert(fa.t === 'arc' && Math.abs(fa.r - 2) < 1e-9 && Math.abs(fa.cy - 2) < 1e-9 && Math.abs(Math.hypot(fa.cx - 90, fa.cy) - 12) < 1e-9, 'line–arc fillet tangent to both: ' + JSON.stringify(fa));
    stNoRedundant('line–arc');
    await pmAccept();
    return 'R4 ×2 (one dimension + Equal), line–arc R2';
  });
  step('sketch-tools: Sketch Chamfer — Distance-distance with Equal distance by default; a corner of the dimensioned rectangle gets a 3 × 3 chamfer line, a virtual sharp and its dimensions (still Fully Defined); Angle-distance 5 @ 30°', async function () {
    var f = await stRect();
    UI.cmdSketchChamfer(); await wait(20);
    var v = UI.pmSpec().values;
    assert(v.type === 'distance' && v.equal === true && stLabels().join('|') === 'Angle-distance|Distance-distance|Equal distance|Distance 1', 'defaults / fields: ' + stLabels().join('|'));
    UI.pmSetField('d1', '3');
    rskClick([40, 20]);
    var c = f.entities.filter(function (e) { return e.t === 'line'; })[4];
    assert(c && Math.abs(c.x1 - 40) < 1e-9 && Math.abs(c.y1 - 17) < 1e-9 && Math.abs(c.x2 - 37) < 1e-9 && Math.abs(c.y2 - 20) < 1e-9, 'chamfer line ' + JSON.stringify(c));
    assert(f.entities.some(function (e) { return e.sharp; }) && UI.sketchStatus().status === 'full', 'virtual sharp, Fully Defined: ' + UI.sketchStatus().status);
    stNoRedundant('chamfer');
    stRadio('type', 'angle');
    assert(stLabels().indexOf('Direction 1 Angle') >= 0 && stLabels().indexOf('Distance 2') < 0, 'Angle-distance fields: ' + stLabels().join('|'));
    UI.pmSetField('d1', '5'); UI.pmSetField('angle', '30');
    rskClick([0, 0]);
    var c2 = f.entities[f.entities.length - 2];
    assert(c2.t === 'line' && Math.abs(Math.atan2(Math.abs(c2.y2 - c2.y1), Math.abs(c2.x2 - c2.x1)) * 180 / Math.PI - 30) < 1e-6, '30° off the first line ' + JSON.stringify(c2));
    stNoRedundant('angle chamfer');
    await pmAccept();
    return 'chamfers 3 × 3 and 5 @ 30°';
  });
  step('sketch-tools: Offset Entities — the PM (Offset distance, Add dimensions, Reverse, Select chain, Bi-directional, Cap ends, Construction geometry: Base / Offset geometry); one picked line of the rectangle offsets the whole chain 2 out (preview first), one Offset relation and one dimension keep it Fully Defined; editing the dimension moves all four', async function () {
    var f = await stRect();
    rskClick([20, 0]);
    UI.cmdOffsetEntities(); await wait(20);
    assert(stLabels().join('|') === 'Offset distance|Add dimensions|Reverse|Select chain|Bi-directional|Cap ends|Construction geometry:|Base geometry|Offset geometry', 'fields ' + stLabels().join('|'));
    var v = UI.pmSpec().values;
    assert(v.dims && v.chain && !v.reverse && !v.bi, 'defaults');
    assert(D.querySelector('#pm input[data-key="cap"]').disabled, 'Cap ends greyed until Bi-directional');
    UI.pmSetField('d', '2'); await wait(20);
    assert(UI.App.tempEntities.length === 4, 'preview of the chain: ' + UI.App.tempEntities.length);
    stCheck('bi'); await wait(20);
    assert(UI.App.tempEntities.length === 8 && !D.querySelector('#pm input[data-key="cap"]').disabled, 'bi-directional preview: ' + UI.App.tempEntities.length);
    stCheck('bi');
    await pmAccept();
    var o = f.entities.slice(4).map(function (e) { return [e.x1, e.y1, e.x2, e.y2].map(function (x) { return Math.round(x * 1e6) / 1e6; }).join(','); }).sort().join(' ');
    assert(o === '-2,-2,42,-2 -2,22,-2,-2 42,-2,42,22 42,22,-2,22', 'offset 2 out: ' + o);
    assert(stToolRels().filter(function (r) { return /^offset:/.test(r); }).length === 1 && UI.sketchStatus().status === 'full', 'one Offset relation, Fully Defined: ' + stToolRels().join(' '));
    stNoRedundant('offset');
    var di = f.rels.map(function (r, i) { return r.type === 'distance' && r.v === 2 ? i : -1; }).filter(function (i) { return i >= 0; })[0];
    var r = UI.editRelDim(di, '5');
    assert(r.ok && Math.abs(f.entities[5].x1 - 45) < 1e-6, 'offset 5 moves the chain: ' + JSON.stringify(f.entities[5]));
    return o;
  });
  step('sketch-tools: Trim Entities — the two check boxes under the options; with Keep trimmed entities as construction geometry the trimmed span stays as construction; with Ignore trimming of construction geometry a centerline is left alone', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 10 }, { t: 'line', x1: 0, y1: 5, x2: 40, y2: 5, construction: true });
    UI.updateSketches();
    UI.cmdTrimEntities(); await wait(20);
    assert(stLabels().indexOf('Keep trimmed entities as construction geometry') >= 0 && stLabels().indexOf('Ignore trimming of construction geometry') >= 0, stLabels().join('|'));
    stRadio('mode', 'closest');
    stCheck('keepCons'); stCheck('ignoreCons');
    rskClick([30, 0]);
    var kept = f.entities.filter(function (e) { return e.construction && e.y1 === 0; })[0];
    assert(kept && Math.abs(kept.x1 - 20) < 1e-9 && Math.abs(kept.x2 - 40) < 1e-9 && Math.abs(f.entities[0].x2 - 20) < 1e-9, 'the span stays as construction: ' + JSON.stringify(f.entities));
    var n = f.entities.length;
    rskClick([30, 5]);
    assert(f.entities.length === n && f.entities.some(function (e) { return e.construction && e.y1 === 5 && e.x1 === 0 && e.x2 === 40; }), 'centerline untouched');
    stCheck('keepCons'); stCheck('ignoreCons'); stRadio('mode', 'power');
    UI.pmOK();
    return 'kept as construction; centerline ignored';
  });
  step('sketch-tools: Move / Copy / Rotate / Scale Entities — X/Y ΔX moves a circle; Rotate about a clicked center (the origin) 90°; Copy with Keep relations; Scale with Copy (Number of copies 2)', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 20, cy: 0, r: 3 }, { t: 'line', x1: 23, y1: 0, x2: 40, y2: 0 });
    f.rels = [{ type: 'coincident', refs: ['1.p1', '0'] }, { type: 'horizontal', refs: ['1'] }];
    UI.updateSketches();
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdMoveEntities(); await wait(20);
    assert(stLabels().join('|') === 'Keep relations|From/To|X/Y', 'Move fields ' + stLabels().join('|'));
    stRadio('mode', 'xy');
    UI.pmSetField('dx', '5'); UI.pmSetField('dy', '0'); await wait(20);
    assert(UI.App.tempEntities.length === 1 && UI.App.tempEntities[0].cx === 25, 'preview at 25');
    await pmAccept();
    assert(f.entities[0].cx === 25 && f.entities[1].x1 === 23, 'moved, the line left (Keep relations off): ' + JSON.stringify(f.entities[1]));
    UI.setSelection([{ kind: 'entity', index: 1 }]);
    UI.cmdRotateEntities(); await wait(20);
    assert(UI.pmSpec().values.box === 'base', 'Center of rotation is waiting for a click');
    rskClick([0, 0]); await wait(20);
    UI.pmSetField('angle', '90'); await wait(20);
    await pmAccept();
    var l = f.entities[1];
    assert(Math.abs(l.x1) < 1e-9 && Math.abs(l.y1 - 23) < 1e-9 && Math.abs(l.y2 - 40) < 1e-9 && stToolRels().indexOf('vertical:1') >= 0, 'rotated 90° about the origin, Horizontal became Vertical: ' + JSON.stringify(l) + ' ' + stToolRels().join(' '));
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdScaleEntities(); await wait(20);
    assert(stLabels().join('|') === 'Scale Factor|Copy|Number of copies' && UI.pmSpec().values.copy === true, 'Scale fields ' + stLabels().join('|'));
    rskClick([25, 0]); await wait(20);
    UI.pmSetField('scale', '2'); UI.pmSetField('count', '2'); await wait(20);
    await pmAccept();
    assert(f.entities.length === 4 && f.entities[2].r === 6 && f.entities[3].r === 12, 'two scaled copies: ' + JSON.stringify(f.entities.slice(2)));
    stNoRedundant('transforms');
    return 'moved, rotated, scaled ×2';
  });
  step('sketch-tools: Linear Sketch Pattern — Direction 1 / 2 (X-axis / Y-axis, Spacing, Dimension X / Y spacing, Number of instances, Angle), 3 × 2 of a hole with instance (2, 2) skipped by clicking it; the copies follow a spacing edit', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 5, cy: 5, r: 1 });
    UI.updateSketches();
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdSketchPattern(); await wait(20);
    var labels = stLabels().join('|');
    assert(labels.indexOf('Reverse direction|Spacing|Dimension X spacing|Number of instances|Angle') >= 0 && labels.indexOf('Dimension Y spacing') >= 0 && labels.indexOf('Dimension angle between axes') >= 0, 'fields ' + labels);
    UI.pmSetField('spacing', '10'); UI.pmSetField('count', '3'); UI.pmSetField('spacing2', '8'); UI.pmSetField('count2', '2'); await wait(20);
    assert(UI.App.tempEntities.length === 5, 'preview 5 copies: ' + UI.App.tempEntities.length);
    D.querySelectorAll('#pm .pm-pick')[3].click(); await wait(20);   // Instances to Skip
    assert(UI.pmSpec().values.box === 'skip', 'skip box active');
    rskClick([15, 13]); await wait(20);
    assert(UI.pmSpec().values.skip.join() === '1,1' && UI.App.tempEntities.length === 4, 'instance skipped: ' + UI.pmSpec().values.skip.join());
    await pmAccept();
    assert(f.entities.length === 5 && !f.entities.some(function (e) { return e.t === 'circle' && e.cx === 15 && e.cy === 13; }), 'four copies, (2, 2) skipped');
    stNoRedundant('pattern');
    var di = f.rels.map(function (r, i) { return r.type === 'distance' && r.dir === 'h' ? i : -1; }).filter(function (i) { return i >= 0; })[0];
    assert(UI.editRelDim(di, '12').ok, 'spacing 12');
    var xs = f.entities.map(function (e) { return e.cx; }), x0 = Math.min.apply(null, xs);
    assert(f.entities.every(function (e) { var k = (e.cx - x0) / 12; return Math.abs(k - Math.round(k)) < 1e-6; }) && Math.abs(Math.max.apply(null, xs) - x0 - 24) < 1e-6, 'the columns are 12 apart: ' + xs.join(' '));
    return 'pattern 3 × 2 less one';
  });
  step('sketch-tools: Circular Sketch Pattern — defaults (center at the origin, 360° equal spacing, 4 instances, Dimension radius / angular spacing); 4 holes round the origin, Radius / Arc angle read the seed', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 20, cy: 0, r: 2 });
    UI.updateSketches();
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdCircularSketchPattern(); await wait(20);
    var v = UI.pmSpec().values;
    assert(v.cx === 0 && v.cy === 0 && v.angle === 360 && v.equal && v.count === 4 && v.dimRadius && v.dimAngle && v.radius === 20 && v.arcAngle === 0, 'defaults ' + JSON.stringify(v));
    assert(stLabels().join('|') === 'Reverse direction|Center X|Center Y|Spacing|Equal spacing|Dimension radius|Dimension angular spacing|Number of instances|Radius|Arc angle', 'fields ' + stLabels().join('|'));
    assert(UI.App.tempEntities.length === 3, 'preview 3 copies');
    await pmAccept();
    var holes = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(holes.length === 4 && holes.every(function (h, k) { return Math.abs(h.cx - 20 * Math.cos(k * Math.PI / 2)) < 1e-9 && Math.abs(h.cy - 20 * Math.sin(k * Math.PI / 2)) < 1e-9; }), 'holes ' + JSON.stringify(holes));
    stNoRedundant('circular');
    return '4 × R20';
  });
  step('sketch-tools: Convert Entities — in a sketch on the part\'s front face, clicking a model edge and the hole brings a line and a true circle in (On Edge)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).circle(20, 10, 4).extrude(10);'); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.25 / UI.cam.scale); await wait(50);
    UI.cmdConvertEntities(); await wait(20);
    assert(stLabels().join('|') === 'Select chain|Inner loops', 'fields ' + stLabels().join('|'));
    rskClick([40, 10]); await wait(20);
    rskClick([24, 10]); await wait(20);
    assert(UI.pmSpec().values.items.length === 2, 'two picks: ' + UI.pmSpec().values.items.map(function (x) { return x.kind; }).join());
    await pmAccept();
    var f = UI.activeSketchFeature(), c = f.entities.filter(function (e) { return e.t === 'circle'; })[0], l = f.entities.filter(function (e) { return e.t === 'line'; })[0];
    assert(c && Math.abs(c.r - 4) < 1e-6 && Math.abs(c.cx - 20) < 1e-6 && Math.abs(c.cy - 10) < 1e-6, 'true circle ' + JSON.stringify(f.entities));
    assert(l && Math.abs(l.x1 - 40) < 1e-6 && Math.abs(l.x2 - 40) < 1e-6 && Math.abs(Math.abs(l.y2 - l.y1) - 20) < 1e-6, 'the whole edge as one line ' + JSON.stringify(l));
    assert(stToolRels().filter(function (r) { return /^onEdge:/.test(r); }).length === 2 && UI.sketchStatus().status === 'full', 'On Edge relations: ' + stToolRels().join(' '));
    UI.exitSketch(true); await idle();
    return 'line + circle R4';
  });
  // --- end sketch-tools ---
