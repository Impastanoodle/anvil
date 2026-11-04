  // --- r14/sketchui14 ---
  // sketch dimensions in SolidWorks' ANSI style, relation glyphs, driving / driven colours, the Modify box
  function r14Segs(path) {   // a dimension's <path class="dl"> as [[x1, y1], [x2, y2]] segments
    return (path.getAttribute('d') || '').split('M').filter(function (s) { return s.trim(); }).map(function (s) {
      var p = s.split('L').map(function (q) { return q.trim().split(/\s+/).map(Number); });
      return [p[0], p[1]];
    });
  }
  function r14Dim(label) { var t = r4Text(label); return t && { g: t.parentNode, t: t, dl: t.parentNode.querySelector('path.dl'), da: t.parentNode.querySelector('path.da') }; }
  function r14Ink(t) { var bb = t.getBBox(), y = +t.getAttribute('y'); return { x: bb.x, y: y - UI.DIM_CAP, width: bb.width, height: UI.DIM_CAP }; }   // the digits' ink: capital height above the baseline
  function r14Crosses(s, b) {   // does segment s pass through the inside of box b = { x, y, width, height } (shrunk 0.5 px)?
    var x0 = b.x + 0.5, y0 = b.y + 0.5, x1 = b.x + b.width - 0.5, y1 = b.y + b.height - 0.5;
    for (var k = 0; k <= 40; k++) {
      var t = k / 40, x = s[0][0] + (s[1][0] - s[0][0]) * t, y = s[0][1] + (s[1][1] - s[0][1]) * t;
      if (x > x0 && x < x1 && y > y0 && y < y1) return true;
    }
    return false;
  }
  async function r14Sketch(ents, rels, dims) {
    if (anvil.drawing && anvil.drawing.isOpen && anvil.drawing.isOpen()) { anvil.drawing.close(); await idle(); }
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities = JSON.parse(JSON.stringify(ents));
    if (rels) f.rels = JSON.parse(JSON.stringify(rels)); else delete f.rels;
    f.dims = JSON.parse(JSON.stringify(dims || []));
    UI.App.gridStale = true; UI.updateSketches(); UI.setTool('select');
    r4Dims();
    return f;
  }
  step('r14/sketchui14: sketch dimensions in SolidWorks ANSI style — Century Gothic, the text horizontal and centred in a break of the dimension line (vertical and aligned dimensions too), slim 10 × 3.4 px arrowheads; a short one puts arrows and text outside', async function () {
    await r14Sketch([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 50, y1: 0, x2: 50, y2: 30 }, { t: 'line', x1: 60, y1: 0, x2: 80, y2: 20 }, { t: 'line', x1: -20, y1: 10, x2: -17, y2: 10 }],
      null, [{ e: 0, k: 'len', off: -8 }, { e: 1, k: 'len', off: 8 }, { e: 2, k: 'len', off: 6 }, { e: 3, k: 'len', off: 5 }]);
    var cap = UI.DIM_CAP;
    assert(cap > 8 && cap < 11, 'cap height ' + cap);
    ['40', '30', '28.28'].forEach(function (lab) {
      var d = r14Dim(lab);
      assert(d && d.dl && d.da, 'dimension ' + lab + ' drawn as one line path and one arrow path');
      assert(/Century Gothic/.test(W.getComputedStyle(d.t).fontFamily), 'font: ' + W.getComputedStyle(d.t).fontFamily);
      assert(!d.t.getAttribute('transform') && d.t.getAttribute('text-anchor') === 'middle', lab + ': horizontal text, centred');
      var segs = r14Segs(d.dl), bb = r14Ink(d.t), cx = +d.t.getAttribute('x'), cy = +d.t.getAttribute('y') - cap / 2;
      assert(!segs.some(function (s) { return r14Crosses(s, bb); }), lab + ': no line runs through the text ' + JSON.stringify(segs) + ' / ' + [bb.x, bb.y, bb.width, bb.height]);
      // the two pieces of the dimension line point at the text's centre from either side (a break, not a line beside it)
      var hits = segs.filter(function (s) {
        var dx = s[1][0] - s[0][0], dy = s[1][1] - s[0][1], L = Math.hypot(dx, dy);
        return L > 1 && Math.abs(((cx - s[0][0]) * dy - (cy - s[0][1]) * dx) / L) < 1.5;
      });
      assert(hits.length >= 2, lab + ': dimension line broken round the text (pieces on its line: ' + hits.length + ') ' + JSON.stringify(segs) + ' centre ' + [cx, cy]);
      var tri = (d.da.getAttribute('d').match(/Z/g) || []).length;
      assert(tri === 2, lab + ': two arrowheads, ' + tri);
    });
    // arrowhead size: 10 px long, 3.4 px wide
    var a = r14Dim('40').da.getAttribute('d').split('Z')[0].replace('M', '').split('L').map(function (q) { return q.trim().split(/\s+/).map(Number); });
    var base = [(a[1][0] + a[2][0]) / 2, (a[1][1] + a[2][1]) / 2];
    near(Math.hypot(a[0][0] - base[0], a[0][1] - base[1]), 10, 0.05, 'arrow length');
    near(Math.hypot(a[1][0] - a[2][0], a[1][1] - a[2][1]), 3.4, 0.05, 'arrow width');
    // the 3 mm line: too short for text and arrows inside: the label sits beyond the extension lines
    var sd = r14Dim('3'), p0 = rskScr([-20, 10]), p1 = rskScr([-17, 10]), tx = sd && +sd.t.getAttribute('x');
    assert(sd && (tx > Math.max(p0[0], p1[0]) + 8 || tx < Math.min(p0[0], p1[0]) - 8), 'short dimension: text outside ' + tx + ' vs ' + [p0[0], p1[0]]);
    return 'cap ' + cap + ' px';
  });
  step('r14/sketchui14: radius / diameter dimensions end in a horizontal shoulder with the text after it (Ø as SolidWorks shows it); driving dimensions light on the grey-black ground (rfBR), driven ones grey in brackets; feature dimensions in the part use the same layout', async function () {
    await r14Sketch([{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'arc', cx: 40, cy: 0, r: 6, a0: 0, a1: 180 }, { t: 'line', x1: -20, y1: -20, x2: 20, y2: -20 }],
      null, [{ e: 0, k: 'dia', ang: 45 }, { e: 1, k: 'r', ang: 135 }, { e: 2, k: 'len', off: -6, driven: true }]);
    var dia = r14Dim('Ø20'), rad = r14Dim('R6'), drv = r14Dim('(40)');
    assert(dia && rad && drv, 'labels: ' + Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim text'), function (t) { return t.textContent; }).join(' '));
    [[dia, 'start'], [rad, 'end']].forEach(function (x) {
      var d = x[0], segs = r14Segs(d.dl), tx = +d.t.getAttribute('x'), ty = +d.t.getAttribute('y') - UI.DIM_CAP / 2;
      assert(d.t.getAttribute('text-anchor') === x[1], d.t.textContent + ' anchored ' + d.t.getAttribute('text-anchor'));
      var sh = segs.filter(function (s) { return Math.abs(s[0][1] - s[1][1]) < 0.01 && Math.abs(s[0][1] - ty) < 0.6 && Math.abs(s[1][0] - s[0][0]) > 8; });
      assert(sh.length === 1, d.t.textContent + ': one horizontal shoulder at the text\'s middle ' + JSON.stringify(segs) + ' text ' + [tx, ty]);
      var end = Math.abs(sh[0][0][0] - tx) < Math.abs(sh[0][1][0] - tx) ? sh[0][0][0] : sh[0][1][0];
      assert(Math.abs(end - tx) <= 4, d.t.textContent + ': the text follows the shoulder (' + end + ' → ' + tx + ')');
      assert((d.da.getAttribute('d').match(/Z/g) || []).length === 1, 'one arrowhead on the curve');
    });
    function lum(c) { var m = c.match(/\d+(\.\d+)?/g).map(Number); return (m[0] + m[1] + m[2]) / 3; }
    var cDrv = W.getComputedStyle(drv.t).fill, cDia = W.getComputedStyle(dia.t).fill, cLine = W.getComputedStyle(drv.dl).stroke;
    var dkG = UI.darkViewport();   // user 2026-11-04: the light theme's ground is light, its dimension text dark
    assert(dkG ? lum(cDia) > 200 : lum(cDia) < 60, 'driving dimension in the ground ink (rfBR): ' + cDia);
    assert(lum(cDrv) > 60 && lum(cDrv) < 180 && Math.abs(lum(cDrv) - lum(cDia)) > 40 && (dkG ? lum(cLine) > 120 : lum(cLine) < 140), 'driven dimension grey: text ' + cDrv + ', line ' + cLine);
    // the same layout for a feature's sketch dimensions shown in the part (Instant3D)
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20).dim(0, "w").dim(0, "h").extrude(10);'); await idle();
    UI.setView('Top'); await idle();
    var ex = anvil.model().features.filter(function (x) { return x.type === 'extrude'; })[0];
    UI.setSelection([{ kind: 'feature', id: ex.id }]);
    await r4Until(function () { return D.querySelectorAll('#i3d-layer .i3d-dim .i3d-dim-line').length >= 2; }, 10000);   // (a background tab draws about one frame a second)
    var labs = Array.prototype.slice.call(D.querySelectorAll('#i3d-layer .i3d-dim-text'));
    assert(labs.length >= 2 && labs.every(function (t) { return /Century Gothic/.test(W.getComputedStyle(t).fontFamily) && !t.getAttribute('transform'); }), 'feature dimensions: Century Gothic, horizontal');
    labs.forEach(function (t) {
      var segs = r14Segs(t.parentNode.querySelector('.i3d-dim-line')), bb = r14Ink(t);
      assert(!segs.some(function (s) { return r14Crosses(s, bb); }), t.textContent + ': in a break of its line ' + JSON.stringify(segs) + ' / ' + [bb.x, bb.y, bb.width, bb.height]);
    });
    UI.setSelection([]);
    return labs.map(function (t) { return t.textContent; }).join(' ');
  });
  step('r14/sketchui14 (rfBR): no relation glyphs at 100 / 125 / 150 / 200 % display scaling — relations held, none drawn in the graphics area', async function () {
    var ents = [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 30, y1: 0, x2: 30, y2: 20 }, { t: 'line', x1: 0, y1: 10, x2: 20, y2: 10 }];
    var rels = [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'parallel', refs: ['0', '2'] }];
    var dpr0 = Object.getOwnPropertyDescriptor(W, 'devicePixelRatio'), list = [1, 1.25, 1.5, 2];
    try {
      for (var k = 0; k < list.length; k++) {
        var dpr = list[k];
        Object.defineProperty(W, 'devicePixelRatio', { configurable: true, get: function () { return dpr; } });
        if (k === 0) await r14Sketch(ents, rels); else r4Dims();
        assert(UI.activeSketchFeature().rels.length === 3, dpr + ': relations held');
        assert(!D.querySelector('#dim-layer .rel-badge') && !D.querySelector('#dim-layer [id^="sk-ico-"]'), dpr + ': no relation glyph drawn');
      }
    } finally {
      if (dpr0) Object.defineProperty(W, 'devicePixelRatio', dpr0); else delete W.devicePixelRatio;
      r4Dims();
    }
    return '4 scales';
  });
  step('r14/sketchui14: the Modify box looks like SolidWorks\' — "Modify" title, ✓ ✗ Rebuild buttons with drawn icons, then the value with its unit and spin arrows; Rebuild previews the typed value, ✗ restores it', async function () {
    var f = await r14Sketch([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }], [{ type: 'horizontal', refs: ['0'] }], [{ e: 0, k: 'len', off: -8 }]);
    var t = r4Text('40'), vr = $('viewport').getBoundingClientRect(), r = t.getBoundingClientRect(), p = [r.left + r.width / 2 - vr.left, r.top + r.height / 2 - vr.top];
    selEv('mousedown', p, t); selEv('mouseup', p); selEv('mousedown', p, t); selEv('mouseup', p);
    assert(UI.dimEditValue() === '40', 'Modify box open: ' + UI.dimEditValue());
    var box = $('dim-edit'), kids = Array.prototype.map.call(box.children, function (c) { return c.className; });
    assert(kids.join(' ') === 'dm-head dm-btns dm-row', 'order: ' + kids.join(' '));
    assert(box.querySelector('.dm-head').textContent === 'Modify', 'title');
    ['dm-ok', 'dm-cancel', 'dm-rebuild'].forEach(function (c) { var b = box.querySelector('.dm-btns .' + c); assert(b && b.querySelector('svg'), c + ' with an icon'); });
    assert(box.querySelector('.dm-row input') && box.querySelector('.dm-row .dm-unit').textContent === UI.unitLabel() && box.querySelectorAll('.dm-row .dm-spin button svg').length === 2, 'value, unit, spin arrows');
    var bb = box.getBoundingClientRect(), lb = t.getBoundingClientRect();
    assert(bb.top >= lb.bottom - 2, 'below the value');
    box.querySelector('input').value = '55';
    box.querySelector('.dm-rebuild').click();
    await r4Until(function () { return Math.abs(f.entities[0].x2 - f.entities[0].x1 - 55) < 1e-6; }, 10000);   // the preview runs on the next animation frame
    near(f.entities[0].x2 - f.entities[0].x1, 55, 1e-6, 'Rebuild previews 55');
    box.querySelector('.dm-cancel').click();
    assert(!UI.isDimEditOpen(), 'closed');
    near(f.entities[0].x2 - f.entities[0].x1, 40, 1e-9, '✗ restores 40');
    return 'ok';
  });
  step('r14/sketchui14: the dimension layer stays fast on a 90-entity sketch with every value shown — three children per dimension, redraw cost measured', async function () {
    var ents = [], rels = [], dims = [];
    for (var i = 0; i < 20; i++) { ents.push({ t: 'line', x1: -50, y1: -45 + i * 5, x2: 50, y2: -45 + i * 5 }); rels.push({ type: 'horizontal', refs: [String(ents.length - 1)] }); }
    for (var j = 0; j < 20; j++) { ents.push({ t: 'line', x1: -48 + j * 5, y1: -50, x2: -48 + j * 5, y2: 55 }); rels.push({ type: 'vertical', refs: [String(ents.length - 1)] }); }
    for (var c = 0; c < 30; c++) { ents.push({ t: 'circle', cx: -40 + (c % 6) * 16, cy: -40 + Math.floor(c / 6) * 18, r: 4 + (c % 3) }); dims.push({ e: ents.length - 1, k: 'dia', ang: 45 }); }
    for (var q = 0; q < 10; q++) ents.push({ t: 'rect', x: -45 + q * 9, y: 60, w: 6, h: 8 });
    for (var k = 0; k < 10; k++) ents.push({ t: 'arc', cx: -45 + k * 9, cy: -60, r: 5, a0: 0, a1: 180 });
    for (var m = 0; m < 10; m++) dims.push({ e: m, k: 'len', off: -2 });
    var showDims = UI.App.view.showDims;
    UI.App.view.showDims = true;
    try {
      await r14Sketch(ents, rels, dims);
      UI.zoomToFit(); await idle(); r4Dims();
      var gs = D.querySelectorAll('#dim-layer g.dim');
      assert(gs.length > 80 && Array.prototype.every.call(gs, function (g) { return g.children.length === 3; }), gs.length + ' dimensions, each a line path, an arrow path and its text');
      var t = [];
      for (var n = 0; n < 40; n++) { UI.zoomView(n % 2 ? 1 / 1.01 : 1.01); var t0 = performance.now(); r4Dims(); t.push(performance.now() - t0); }
      t.sort(function (a, b) { return a - b; });
      var med = t[20], nodes = D.querySelectorAll('#dim-layer *').length;
      assert(med < 8, 'redraw median ' + med.toFixed(2) + ' ms');
      return gs.length + ' dimensions, ' + nodes + ' nodes, redraw median ' + med.toFixed(2) + ' ms (min ' + t[0].toFixed(2) + ')';
    } finally { UI.App.view.showDims = showDims; UI.App.dimsStale = true; }
  });
  // --- end r14/sketchui14 ---

