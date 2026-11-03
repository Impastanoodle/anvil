  // --- rfHB (2026-11-03, lane drawing-look: "clean, sharp and professional") --- the drawing on screen: visible
  // edges drawn clearly heavier than dimension lines at the zoom that fits the sheet, every floor a whole number of
  // device pixels, axis-aligned lines snapped to the pixel grid, title block captions big enough to read, the sheet
  // tab bar's buttons on one line and grey (no blue) in both themes.
  var HB_PART = 'p.name("HBPlate").units("in");\np.box(4, 2, 0.25);\np.hole("Top", 1, -1, 0.25, { offset: 0.25 });';
  async function rfHBDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(HB_PART); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    anvil.drawing.modelItems(true); await UI.drawing.ready();
    UI.drawing.fit(); await wait(30);
  }
  // the on-screen width (device px) of the first element of a class in the sheet SVG
  function rfHBWidth(sel) {
    var s = D.querySelector('#drawing-sheet svg'), e = s && s.querySelector(sel);
    if (!e) return null;
    var sw = parseFloat(W.getComputedStyle(e).strokeWidth), m = s.getScreenCTM();
    return sw * m.a * (W.devicePixelRatio || 1);
  }
  function rfHBBlue(c) {
    var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/.exec(c || '');
    if (!m || (m[4] != null && +m[4] === 0)) return false;
    var r = m[1] / 255, g = m[2] / 255, b = m[3] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return d >= 0.04 && h >= 190 && h <= 250;
  }
  step('rfHB: at fit, visible edges are heavier than dimension lines on screen, in whole device pixels; axis-aligned lines snap to the pixel grid', async function () {
    var errs0 = errors.length;
    await rfHBDrawing();
    var vis = rfHBWidth('g[data-view] .visible'), thin = rfHBWidth('g[data-layer="DIMENSIONS"] .thin, g[data-layer="DIMENSIONS"] line'), thick = rfHBWidth('g[data-layer="SHEET"] .thick');
    assert(vis && thin && thick, 'widths ' + [vis, thin, thick]);
    assert(vis >= 1.5 * thin - 0.05, 'visible ' + vis.toFixed(2) + ' device px against dimension ' + thin.toFixed(2));
    assert(thick > vis, 'border ' + thick.toFixed(2) + ' against visible ' + vis.toFixed(2));
    var css = D.getElementById('dw-stroke-floor').textContent, dpr = W.devicePixelRatio || 1, ppu = D.querySelector('#drawing-sheet svg').getScreenCTM().a;
    // each floor is a whole number of device pixels (plus the 3 % zoom drift margin)
    css.replace(/\.([a-z]+)\{stroke-width:([\d.e-]+)px\}/g, function (all, c, w) {
      var dev = +w * ppu * dpr / Math.exp(0.03);
      assert(Math.abs(dev - Math.round(dev)) < 0.08, c + ' floor ' + dev.toFixed(3) + ' device px');
      return all;
    });
    var ls = D.querySelectorAll('#drawing-sheet svg g[data-layer] line'), ax = 0, crisp = 0, slant = 0;
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i], a = l.getAttribute('x1') === l.getAttribute('x2') || l.getAttribute('y1') === l.getAttribute('y2');
      if (a) { ax++; if (l.getAttribute('shape-rendering') === 'crispEdges') crisp++; } else if (l.getAttribute('shape-rendering')) slant++;
    }
    assert(ax > 20 && crisp === ax && slant === 0, 'axis lines ' + ax + ', crisp ' + crisp + ', slanted lines snapped ' + slant);
    assert(anvil.drawing.svg().indexOf('crispEdges') < 0, 'the exported SVG is unchanged');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'visible ' + vis.toFixed(2) + ' / dimension ' + thin.toFixed(2) + ' / border ' + thick.toFixed(2) + ' device px; ' + crisp + ' crisp lines';
  });
  step('rfHB: title block captions at least .08 in capitals, values clear below them; the sheet tab bar lines up and holds no blue in either theme', async function () {
    var tx = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'SHEET' && /^field:/.test(p.fmt || ''); });
    var caps = tx.filter(function (p) { return W.Drawing.TB_FIELDS.some(function (f) { return 'field:' + f.key === p.fmt && f.label === p.text; }); });
    assert(caps.length >= 11, 'captions ' + caps.length);
    caps.forEach(function (c) { assert(c.h >= 0.079, c.text + ' capitals ' + c.h.toFixed(3) + ' in'); });
    var bar = D.getElementById('drawing-tabs'), br = bar.getBoundingClientRect();
    var bts = [].slice.call(bar.querySelectorAll('.dw-tab, .dw-nav'));
    assert(bts.length >= 7, 'tab bar buttons ' + bts.length);
    var mids = bts.filter(function (b) { return b.classList.contains('dw-tab'); }).map(function (b) { var r = b.getBoundingClientRect(); return r.top + r.height / 2; });
    mids.forEach(function (m) { assert(Math.abs(m - mids[0]) < 0.6, 'tabs on one line: ' + mids.join(', ')); });
    bts.forEach(function (b) { var r = b.getBoundingClientRect(); assert(r.top >= br.top - 1.01 && r.bottom <= br.bottom + 0.01, 'inside the bar: ' + b.className); });
    var theme0 = anvil.theme(), out = [];
    try {
      for (var t of ['light', 'dark']) {
        anvil.theme(t); await wait(30);
        [bar].concat(bts, [D.getElementById('drawing-tree')]).forEach(function (e) {
          var cs = W.getComputedStyle(e);
          [cs.backgroundColor, cs.color, cs.borderTopColor, cs.borderLeftColor, cs.boxShadow].forEach(function (c) { assert(!rfHBBlue(c), t + ': blue ' + c + ' on ' + (e.id || e.className)); });
        });
        var act = bar.querySelector('.dw-tab.active'), ac = W.getComputedStyle(act);
        assert(ac.backgroundColor !== W.getComputedStyle(bar.querySelector('.dw-add-sheet')).backgroundColor, t + ': the active tab stands out');
        out.push(t + ' ' + ac.backgroundColor);
      }
    } finally { anvil.theme(theme0); }
    anvil.drawing.close(); await idle();
    return caps.length + ' captions; ' + out.join(' · ');
  });
