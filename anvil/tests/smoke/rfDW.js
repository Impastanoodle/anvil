  // --- rfDW (2026-10-29, lane DW: hatch editing per region) --- the Area Hatch/Fill PropertyManager on a section of a
  // 2-body part with the mouse (Material crosshatch, Hatch / Solid / None, Pattern, scale, angle, Apply changes to),
  // the overrides in the SVG and DXF, kept through a rebuild, one undo step each, Esc restores; Insert ▸ Area
  // Hatch/Fill on a model face of a plain view, edited by clicking it, deleted with Delete.
  var DW_TWO = 'p.name("DWTwo").units("in");\np.box(2, 1, 1);\np.box(2, 1, 1, { at: [3, 0, 0], merge: false });';
  async function rfDWDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(DW_TWO); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    anvil.drawing.options({ autoCenterMarks: false, autoCenterlines: false }); await idle();
    UI.drawing.fit(); await wait(20);
    return anvil.drawing.summary();
  }
  function rfDWMouse(type, p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: q.x, clientY: q.y, detail: 1 }));
  }
  function rfDWClick(p) { rfDWMouse('mousemove', p); rfDWMouse('mousedown', p); rfDWMouse('mouseup', p); }
  function rfDWWin(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfDWKey(k) { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  function rfDWRadio(value) { var r = D.querySelector('#pm input[type=radio][value="' + value + '"]'); assert(r, 'PM option ' + value); r.click(); }
  function rfDWCheck(on) { var c = pmField('Material crosshatch'); assert(c && c.type === 'checkbox', 'Material crosshatch box'); if (c.checked !== on) c.click(); }
  function rfDWButton(label) {
    var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
    var b = find();
    if (!b) { var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === 'Annotation'; })[0]; if (tab) { tab.click(); b = find(); } }
    assert(b, 'ribbon button ' + label);
    return b;
  }
  // hatch segments of the SVG on one layer (as rfDN reads them)
  function rfDWSvgHatch(svg, layer) {
    var i = svg.indexOf('data-layer="' + layer + '"'), j = svg.indexOf('data-layer=', i + 12), part = svg.slice(i, j < 0 ? undefined : j), out = [];
    (part.match(/<path class="hatch" d="[^"]*"/g) || []).forEach(function (t) {
      var d = t.slice(t.indexOf('d="') + 3, -1), re = /([Mml])(-?[\d.e-]+) (-?[\d.e-]+)/g, m, x = 0, y = 0;
      while ((m = re.exec(d))) {
        var dx = +m[2], dy = +m[3];
        if (m[1] === 'M') { x = dx; y = dy; } else if (m[1] === 'm') { x += dx; y += dy; } else { out.push([x, y, x + dx, y + dy]); x += dx; y += dy; }
      }
    });
    return out;
  }
  // open the Area Hatch/Fill PM on region g of section view id: a click selects the view, a second click on the hatch
  async function rfDWOpenRegion(id, g) {
    var w = rfDWWin(id), p = w.toSheet(g.p);
    rfDWClick(p); await wait(30);
    if (!(UI.pmSpec() && UI.pmTitle() === 'Area Hatch/Fill')) { rfDWClick(p); await wait(30); }
    assert(UI.pmSpec() && UI.pmTitle() === 'Area Hatch/Fill', 'Area Hatch/Fill PM on ' + g.key);
  }

  step('rfDW: Area Hatch/Fill on a section of a 2-body part with the mouse — region 1 ANSI37 scale 2 angle 0, region 2 None: exactly that in the SVG and the DXF, one undo step each; Esc restores; a dimension change keeps both; undo removes them', async function () {
    var errs0 = errors.length, s = await rfDWDrawing(), front = s.views.filter(function (v) { return v.orient === 'Front'; })[0];
    await anvil.drawing.sectionView(front.id, { axis: 'h', at: 0.5 }); await idle(); await UI.drawing.ready(); await wait(30);
    var sv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sv, 'section view');
    var regs = anvil.drawing.hatchRegions(sv.id);
    assert(regs.length === 2 && regs[0].key === 'b0:r0' && regs[1].key === 'b1:r0' && !regs[0].areaHatch, 'regions ' + JSON.stringify(regs.map(function (g) { return g.key; })));
    var n0 = UI.App.undo.length;
    // Esc: change the fields, then cancel — nothing stored, no undo step
    await rfDWOpenRegion(sv.id, regs[0]);
    rfDWCheck(false); await wait(10); rfDWRadio('solid'); await wait(10);
    rfDWKey('Escape'); await wait(30);
    assert(!UI.pmSpec() && UI.App.undo.length === n0 && !anvil.drawing.hatchRegions(sv.id)[0].areaHatch, 'Esc restores');
    // region 1: ANSI37, scale 2, angle 0
    await rfDWOpenRegion(sv.id, regs[0]);
    rfDWCheck(false); await wait(10);
    rfDWRadio('hatch'); await wait(10);
    var sel = D.querySelector('#pm select'); assert(sel, 'Pattern box'); setInput(sel, 'ANSI37'); await wait(10);
    setInput(pmField('Scale'), '2'); setInput(pmField('Angle'), '0'); await wait(10);
    await pmAccept(); await UI.drawing.ready(); await wait(20);
    assert(UI.App.undo.length === n0 + 1, 'one undo step ' + (UI.App.undo.length - n0));
    // region 2: None
    await rfDWOpenRegion(sv.id, regs[1]);
    rfDWCheck(false); await wait(10); rfDWRadio('none'); await wait(10);
    await pmAccept(); await UI.drawing.ready(); await wait(20);
    assert(UI.App.undo.length === n0 + 2, 'two undo steps ' + (UI.App.undo.length - n0));
    var g = anvil.drawing.hatchRegions(sv.id);
    assert(g[0].pattern === 'ANSI37' && g[0].scale === 2 && g[0].angle === 0 && g[0].areaHatch && g[1].pattern === 'NONE' && g[1].areaHatch, 'regions now ' + JSON.stringify(g.map(function (x) { return [x.pattern, x.scale, x.angle]; })));
    // SVG: every hatch segment on the section layer at 45° or 135°, none over block 2 (x 3..5)
    var w = rfDWWin(sv.id), segs = rfDWSvgHatch(anvil.drawing.svg(), w.layer), H = UI.drawing.state.sheet.size[1];
    assert(segs.length > 4, 'SVG hatch ' + segs.length);
    var badAng = segs.filter(function (q) { var a = Math.round(((Math.atan2(-(q[3] - q[1]), q[2] - q[0]) * 180 / Math.PI) % 180 + 180) % 180); return a !== 45 && a !== 135; });
    assert(!badAng.length, 'SVG angles ' + badAng.length);
    var onB2 = segs.filter(function (q) { var m = w.fromSheet([(q[0] + q[2]) / 2, H - (q[1] + q[3]) / 2]); return m[0] > 2.5; });
    assert(!onB2.length, 'no hatch over block 2: ' + onB2.length);
    var prims = UI.drawing.state.sheet.prims.filter(function (p) { return p.layer === w.layer && p.style === 'hatch'; });
    var dxf = anvil.drawing.dxf({ version: 'R2000' }), nL = dxf.split(/\n0\n/).filter(function (e) { return /^LINE\n/.test(e) && e.indexOf('\n8\n' + w.layer + '\n') >= 0; }).length;
    assert(prims.length === segs.length && prims.every(function (p) { return p.areaHatch === 'ANSI37'; }) && nL >= prims.length, 'DXF / sheet ' + nL + ' / ' + prims.length + ' / ' + segs.length);
    // a dimension change that keeps both bodies: block 1 taller
    var f0 = UI.App.model.features.filter(function (f) { return f.type === 'extrude' && isFinite(f.depth); })[0];
    assert(f0, 'the first block\'s extrude');
    var m0 = UI.App.mesh;
    UI.pushUndo(); f0.depth = 1.5; await UI.rebuild(); await idle(); await UI.drawing.ready(); await wait(30);
    assert(UI.App.mesh !== m0, 'rebuilt');
    var g2 = anvil.drawing.hatchRegions(sv.id);
    assert(g2.length === 2 && g2[0].pattern === 'ANSI37' && g2[0].scale === 2 && g2[1].pattern === 'NONE', 'kept after the rebuild ' + JSON.stringify(g2.map(function (x) { return x.pattern; })));
    // undo: the rebuild, then None, then ANSI37
    UI.undoCommand(); await idle(); UI.undoCommand(); await idle(); UI.undoCommand(); await idle(); await UI.drawing.ready(); await wait(30);
    var g3 = anvil.drawing.hatchRegions(sv.id);
    assert(g3.length === 2 && !g3[0].areaHatch && !g3[1].areaHatch, 'undone ' + JSON.stringify(g3.map(function (x) { return x.pattern; })));
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'ok';
  });

  step('rfDW: Annotation ▸ Area Hatch/Fill on the Front view\'s face — Solid, one undo step; clicking the fill of the selected view opens its PM (ANSI31 scale 2), Delete removes it', async function () {
    var errs0 = errors.length, s = await rfDWDrawing(), front = s.views.filter(function (v) { return v.orient === 'Front'; })[0];
    var w = rfDWWin(front.id), p = w.toSheet([1, 0.5]), n0 = UI.App.undo.length;
    rfDWButton('Area Hatch/Fill').click(); await wait(20);
    assert(UI.drawing.state.tool === 'ahatch', 'tool ' + UI.drawing.state.tool);
    rfDWClick(p); await wait(30);
    assert(UI.pmSpec() && UI.pmTitle() === 'Area Hatch/Fill' && !pmField('Material crosshatch'), 'fill PM');
    rfDWRadio('solid'); await wait(10);
    await pmAccept(); await UI.drawing.ready(); await wait(20);
    assert(UI.App.undo.length === n0 + 1, 'one undo step');
    var fl = anvil.drawing.areaFills();
    assert(fl.length === 1 && fl[0].kind === 'face' && fl[0].view === front.id && fl[0].pattern === 'SOLID', 'fill ' + JSON.stringify(fl));
    var reg = UI.drawing.state.sheet.prims.filter(function (q) { return q.k === 'region' && q.areaFill === fl[0].id; });
    assert(reg.length === 1 && /class="hatch-fill"/.test(anvil.drawing.svg()), 'drawn solid');
    // click it (a first click selects the view, a click on the fill of the selected view opens its PM)
    rfDWClick(p); await wait(40);
    if (!UI.pmSpec()) { rfDWClick(p); await wait(40); }
    assert(UI.pmSpec() && UI.pmTitle() === 'Area Hatch/Fill', 'edit PM');
    rfDWRadio('hatch'); await wait(10); setInput(pmField('Scale'), '2'); await wait(10);
    await pmAccept(); await UI.drawing.ready(); await wait(20);
    fl = anvil.drawing.areaFills();
    assert(fl[0].pattern === 'ANSI31' && fl[0].scale === 2 && UI.drawing.state.sheet.prims.some(function (q) { return q.areaFill === fl[0].id && q.k === 'line'; }), 'edited ' + JSON.stringify(fl[0]));
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'areaFill', 'selected ' + JSON.stringify(UI.drawing.state.sel));
    rfDWKey('Delete'); await idle(); await wait(20);
    assert(anvil.drawing.areaFills().length === 0 && !UI.drawing.state.sheet.prims.some(function (q) { return q.areaFill; }), 'deleted');
    UI.undoCommand(); await idle(); await UI.drawing.ready();
    assert(anvil.drawing.areaFills().length === 1, 'undo brings it back');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'ok';
  });

  step('rfDW2: the drawing module chains the part menu hook — the part\'s Edit menu shows Suppress, and a hook set before drawing-ui-panels.js (DW.menuHookBase) still adds its rows', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(DW_TWO); await idle();
    var sup = menuRows('Suppress');
    if (UI.closeMenus) UI.closeMenus();
    assert(sup.length && sup[0].menu.indexOf('Edit') === 0, 'Edit ▸ Suppress: ' + JSON.stringify(sup.map(function (x) { return x.menu + ' / ' + x.text; })));
    var DWi = UI.drawingInternal, base0 = DWi.menuHookBase;
    DWi.menuHookBase = function (m) { var e = m.filter(function (x) { return x.label === 'Edit'; })[0]; if (e) e.items.push({ label: 'rfDW probe row', action: function () {} }); return m; };
    try {
      var pr = menuRows('rfDW probe row');
      if (UI.closeMenus) UI.closeMenus();
      assert(pr.length === 1 && pr[0].menu.indexOf('Edit') === 0, 'the earlier hook ran: ' + pr.length);
    } finally { DWi.menuHookBase = base0; }
    assert(!menuRows('rfDW probe row').length, 'restored');
    if (UI.closeMenus) UI.closeMenus();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'ok';
  });
