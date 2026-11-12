  // --- rfDA ---
  // (2026-10-20, lane DA: look-and-feel follow-ups) toasts centred over the graphics area (not the window) and kept
  // there when the panes resize; the View Selector cube on the model's screen centre (clamped inside the graphics
  // area) and the Space / heads-up View Orientation menu beside it, never over it; every CSS overlay over the grey-black
  // graphics area legible in both themes and all three backgrounds (style.css --ov-* variables, contrast against the
  // lightest ground #3c3c3c: text 4.5 : 1, lines 3 : 1); the status-bar coordinates in a fixed box that does not move
  // when the chips to their right change (part → sketch); UI.modelEdgeInBox for overlays that must keep off edges.
  function rfDALum(c) {
    var m = String(c).match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return { L: 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]), a: m.length > 3 ? +m[3] : 1 };
  }
  function rfDARatio(c1, c2) { var x = rfDALum(c1), y = rfDALum(c2); if (!x || !y) return 0; var a = x.L, b = y.L; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
  // the part of the graphics area that overlays contrast least with: the top of the gradient — the lightest on the dark
  // ground (#3c3c3c), the darkest on the light ground of the light theme (#d6d8db, user 2026-11-04)
  function rfDAground() { return UI.darkViewport() ? 'rgb(60, 60, 60)' : 'rgb(214, 216, 219)'; }
  async function rfDABox() {
    await anvil.newPart(); await idle();
    await anvil.run("p.sketch('Front').rect(0, 0, 4, 2).dim(0, 'w').dim(0, 'h').extrude(1);"); await idle();
    UI.setView('Isometric'); await wait(450);
  }
  function rfDARect(el) { return el.getBoundingClientRect(); }
  function rfDAOverlap(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }

  step('rfDA: a toast sits over the middle of the graphics area (not the window), and stays there when the Task Pane opens and when the FeatureManager pane is widened', async function () {
    var errs0 = errors.length;
    await rfDABox();
    function check(what) {
      var t = D.querySelector('.toast'), v = rfDARect(UI.viewport);
      assert(t, what + ': a toast is showing');
      var r = rfDARect(t), cx = r.left + r.width / 2, vx = v.left + v.width / 2;
      assert(Math.abs(cx - vx) <= 2, what + ': toast centre ' + cx.toFixed(1) + ' = graphics-area centre ' + vx.toFixed(1) + ' (window centre ' + (W.innerWidth / 2) + ')');
      assert(r.left >= v.left - 1 && r.right <= v.right + 1, what + ': the toast is inside the graphics area');
    }
    UI.toast('rfDA toast one'); await wait(60);
    var v0 = rfDARect(UI.viewport);
    assert(Math.abs(v0.left + v0.width / 2 - W.innerWidth / 2) > 20, 'test premise: the graphics area is not centred in the window (' + (v0.left + v0.width / 2) + ' vs ' + W.innerWidth / 2 + ')');
    check('start');
    UI.openTaskPane('props'); await wait(120);
    UI.toast('rfDA toast two'); await wait(60);
    check('Task Pane open');
    UI.closeTaskPane(); await wait(120);
    var left = D.getElementById('left'), oldW = left.style.width;
    left.style.width = (left.getBoundingClientRect().width + 120) + 'px'; await wait(150);
    UI.toast('rfDA toast three'); await wait(60);
    check('FeatureManager pane 120 px wider');
    left.style.width = oldW; await wait(150);
    check('pane back');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfDA: the View Selector cube is centred on the model (panned off the middle) and clamped inside the graphics area; Space shows the cube alone (user 2026-11-04); the View Orientation menu from the heads-up toolbar never covers it', async function () {
    var errs0 = errors.length;
    await rfDABox();
    UI.panView(-260, -90); await wait(120);
    var cube = D.getElementById('view-selector');
    UI.showViewSelector(); await wait(30);
    var v = rfDARect(UI.viewport), c = rfDARect(cube), m = UI.worldToScreen([2, 1, 0.5]);
    var mx = v.left + m[0], my = v.top + m[1], half = c.width / 2;
    var ex = Math.max(v.left + half + 4, Math.min(v.right - half - 4, mx)), ey = Math.max(v.top + half + 4, Math.min(v.bottom - half - 4, my));
    assert(Math.abs(c.left + half - ex) <= 1.5 && Math.abs(c.top + c.height / 2 - ey) <= 1.5, 'cube centre (' + (c.left + half).toFixed(1) + ', ' + (c.top + c.height / 2).toFixed(1) + ') on the model (' + mx.toFixed(1) + ', ' + my.toFixed(1) + '), clamped: (' + ex.toFixed(1) + ', ' + ey.toFixed(1) + ')');
    assert(Math.abs(c.left + half - (v.left + v.width / 2)) > 40, 'not the middle of the graphics area');
    assert(c.left >= v.left - 0.5 && c.right <= v.right + 0.5 && c.top >= v.top - 0.5 && c.bottom <= v.bottom + 0.5, 'the cube is inside the graphics area');
    UI.hideViewSelector();
    // panned far off: clamped to the edge, all of it inside
    UI.panView(-2000, 0); await wait(80);
    UI.showViewSelector(); await wait(30);
    c = rfDARect(cube);
    assert(c.left >= v.left - 0.5 && c.left <= v.left + 6, 'model off the left edge: the cube stops at the left edge (' + c.left.toFixed(1) + ' vs ' + v.left.toFixed(1) + ')');
    UI.hideViewSelector();
    UI.setView('Isometric'); await wait(450);
    // Space with the pointer on the model: the cube alone (user 2026-11-04: no View Orientation list with Space)
    var p = UI.worldToScreen([2, 1, 0.5]), gl = UI.viewport.querySelector('canvas') || UI.viewport;
    gl.dispatchEvent(new W.MouseEvent('mousemove', { clientX: v.left + p[0], clientY: v.top + p[1], bubbles: true }));
    UI.showOrientationMenu(); await wait(30);
    var menu = D.querySelector('body > .menu');
    assert(!menu && UI.viewSelectorShown(), 'Space: the cube is up and no menu');
    UI.showOrientationMenu(); await wait(20);   // Space again closes it
    assert(!UI.viewSelectorShown() && !D.querySelector('body > .menu'), 'Space again closes the cube');
    // the heads-up View Orientation button
    D.getElementById('hud').children[5].click(); await wait(30);
    menu = D.querySelector('body > .menu'); c = rfDARect(cube);
    assert(menu && UI.viewSelectorShown(), 'heads-up button: the menu and the cube are up');
    assert(!rfDAOverlap(rfDARect(menu), c), 'heads-up button: the menu does not cover the cube');
    UI.showOrientationMenu(); await wait(20);
    assert(!UI.viewSelectorShown(), 'closed');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfDA: every CSS overlay is legible on the graphics area (grey-black, or light in the light theme on Gradient / Plain) in both themes and on all three backgrounds — Instant3D arrow, ruler, ticks, tick labels, value and dimension text, sketch dimension text, virtual-sharp lines, heads-up carets and bar, scale bar, sketch hint, the confirmation corner\'s icons', async function () {
    var errs0 = errors.length;
    var theme0 = UI.theme ? UI.theme() : 'light', bg0 = UI.App.view.bg;
    await rfDABox();
    var NS = 'http://www.w3.org/2000/svg', made = [];
    function add(layerId, tag, cls, text) {
      var layer = D.getElementById(layerId);
      assert(layer, layerId + ' exists');
      var e = D.createElementNS(NS, tag);
      e.setAttribute('class', cls);
      if (tag === 'text') { e.setAttribute('x', 40); e.setAttribute('y', 40); e.textContent = text || '1.250'; }
      else if (tag === 'line') { e.setAttribute('x1', 10); e.setAttribute('y1', 10); e.setAttribute('x2', 60); e.setAttribute('y2', 10); }
      else if (tag === 'polygon') e.setAttribute('points', '0,0 8,4 0,8');
      else if (tag === 'circle') { e.setAttribute('cx', 30); e.setAttribute('cy', 30); e.setAttribute('r', 4); }
      layer.appendChild(e); made.push(e);
      return e;
    }
    // the layers are redrawn every frame: the probes are made, read and removed with no wait in between
    function build() {
    var g = D.createElementNS(NS, 'g'); g.setAttribute('class', 'i3d-handle'); D.getElementById('i3d-layer').appendChild(g); made.push(g);
    function inG(tag, cls) { var e = add('i3d-layer', tag, cls); g.appendChild(e); return e; }
    return [
      ['Instant3D arrow shaft', inG('line', 'i3d-shaft'), 'stroke', 3],
      ['Instant3D arrow head', inG('polygon', 'i3d-head'), 'fill', 3],
      ['Instant3D ruler', add('i3d-layer', 'line', 'i3d-ruler'), 'stroke', 3],
      ['Instant3D tick', add('i3d-layer', 'line', 'i3d-tick major'), 'stroke', 3],
      ['Instant3D tick label', add('i3d-layer', 'text', 'i3d-tick-label', '5'), 'fill', 4.5],
      ['Instant3D value', add('i3d-layer', 'text', 'i3d-value', '1.000'), 'fill', 4.5],
      ['Instant3D dimension text', add('i3d-layer', 'text', 'i3d-dim-text', '4.000'), 'fill', 4.5],
      ['virtual-sharp line', (function () { var e = add('dim-layer', 'line', 'sk-sharp'); e.setAttribute('style', 'stroke:var(--muted);stroke-width:1'); return e; })(), 'stroke', 3]
    ];
    }
    var caret = D.querySelector('#hud .caret'), hud = D.getElementById('hud'), scale = D.getElementById('scale-bar');
    var fails = [];
    var THEMES = ['light', 'dark'], BGS = ['gradient', 'plain', 'dark'];
    try {
      for (var ti = 0; ti < THEMES.length; ti++) for (var bi = 0; bi < BGS.length; bi++) {
        UI.setTheme(THEMES[ti]); UI.setBackground(BGS[bi], true); await wait(10);
        var tag = THEMES[ti] + ' theme / ' + BGS[bi] + ': ', items = build();
        items.forEach(function (it) {
          var col = W.getComputedStyle(it[1])[it[2]], r = rfDARatio(col, rfDAground());
          if (r < it[3]) fails.push(tag + it[0] + ' ' + col + ' ' + r.toFixed(2) + ' : 1');
        });
        // the halo behind Instant3D text is the ground's: dark on the dark ground, white on the light one
        var halo = W.getComputedStyle(items[5][1]).stroke, darkG = UI.darkViewport();
        if (!rfDALum(halo) || (darkG ? rfDALum(halo).L > 0.1 : rfDALum(halo).L < 0.6)) fails.push(tag + 'Instant3D value halo does not match the ground: ' + halo);
        made.forEach(function (e) { e.remove(); }); made = [];
        if (caret) { var cc = W.getComputedStyle(caret).color, cr = rfDARatio(cc, rfDAground()); if (cr < 4.5) fails.push(tag + 'heads-up caret ' + cc + ' ' + cr.toFixed(2)); }
        // the heads-up bar's own ground (under the pointer; always on the Dark background) is dark, under light icons
        var hudBg = W.getComputedStyle(hud).getPropertyValue('--overlay').trim(), ink = W.getComputedStyle(hud).getPropertyValue('--icon-ink').trim();
        var hb = D.createElement('div'); hb.style.background = hudBg; hb.style.color = ink; hud.appendChild(hb);
        var hbg = W.getComputedStyle(hb).backgroundColor, hink = W.getComputedStyle(hb).color; hb.remove();
        if (!rfDALum(hbg) || (darkG ? rfDALum(hbg).L > 0.1 : rfDALum(hbg).L < 0.6)) fails.push(tag + 'heads-up bar ground does not match the graphics area: ' + hbg);
        if (rfDARatio(hink, hbg.replace(/,\s*[\d.]+\)$/, ')').replace('rgba', 'rgb')) < 4.5) fails.push(tag + 'heads-up icons on their bar: ' + hink + ' on ' + hbg);
        var sbc = W.getComputedStyle(scale).color; if (rfDARatio(sbc, rfDAground()) < 4.5) fails.push(tag + 'scale bar ' + sbc);
      }
      // the confirmation corner and the sketch hint, in a sketch, light theme
      UI.setTheme('light'); UI.setBackground('gradient', true);
      var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
      UI.editSketch(sk.id); await idle(); await wait(150);
      var corner = D.getElementById('exit-sketch');
      assert(corner && !corner.hidden, 'the confirmation corner shows in the sketch');
      Array.prototype.forEach.call(corner.querySelectorAll('svg'), function (s, k) {
        var ink = W.getComputedStyle(s).color;
        if (rfDARatio(ink, rfDAground()) < 4.5) fails.push('corner icon ' + k + ' ink ' + ink);
        Array.prototype.forEach.call(s.querySelectorAll('[fill="#d9453b"], [stroke="#d9453b"]'), function (e) {
          var cs = W.getComputedStyle(e), red = e.getAttribute('fill') === '#d9453b' ? cs.fill : cs.stroke;
          if (rfDARatio(red, rfDAground()) < 3) fails.push('corner icon ' + k + ' red ' + red);
        });
      });
      Array.prototype.forEach.call(D.querySelectorAll('#dim-layer text'), function (t) {
        var cs = W.getComputedStyle(t);
        if (cs.display !== 'none' && rfDARatio(cs.fill, rfDAground()) < 4.5) fails.push('sketch dimension text "' + t.textContent + '" ' + cs.fill);
      });
      var hint = D.getElementById('sketch-hint');
      if (hint && !hint.hidden) { var hs = W.getComputedStyle(hint); if (rfDARatio(hs.color, hs.backgroundColor.replace(/,\s*[\d.]+\)$/, ')').replace('rgba', 'rgb')) < 4.5) fails.push('sketch hint ' + hs.color + ' on ' + hs.backgroundColor); }
      UI.exitSketch(); await idle();
    } finally {
      made.forEach(function (e) { e.remove(); });
      UI.setTheme(theme0); UI.setBackground(bg0 || 'gradient', true);
    }
    assert(!fails.length, 'every overlay legible on the graphics area:\n' + fails.join('\n'));
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfDA: the status-bar coordinates have a fixed-width box that stays put when the chips to their right change (part → sketch → part, a long sketch name)', async function () {
    var errs0 = errors.length;
    await rfDABox();
    var coords = D.getElementById('status-coords');
    function box() { var r = rfDARect(coords); return [Math.round(r.left), Math.round(r.width)]; }
    coords.textContent = 'X:     1.000   Y:     2.000  in';
    var b0 = box();
    assert(b0[1] >= 200, 'the coordinates have a box of their own: ' + b0[1] + ' px');
    coords.textContent = 'X:   123.456   Y:  -78.901  in   Length 12.500';
    assert(box()[0] === b0[0] && box()[1] === b0[1], 'longer text: same box ' + box() + ' vs ' + b0);
    var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
    UI.editSketch(sk.id); await idle(); await wait(100);
    assert(/Defined/.test(D.getElementById('status-right').textContent), 'in the sketch the definition chip shows');
    assert(box()[0] === b0[0] && box()[1] === b0[1], 'in the sketch (Under Defined, Editing Sketch1): same box ' + box() + ' vs ' + b0);
    UI.exitSketch(); await idle(); await wait(60);
    assert(box()[0] === b0[0], 'back in the part: same place ' + box() + ' vs ' + b0);
    coords.textContent = '';
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfDA: ribbon group captions are never cut short — the View tab\'s Managers (one narrow column of buttons) reads "Managers" in full, and no two captions overlap', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    // lane swribbon (2026-11-12): with SolidWorks' large buttons the View tab needs 1560 px before the Managers go to the »
    // menu (the frame is 1528): look at it in a 1600 px window
    var fr = document.getElementById('app'), old = [fr.style.width, fr.style.minWidth];
    fr.style.minWidth = '0'; fr.style.width = '1600px'; void fr.offsetWidth; await wait(60); UI.fitWorkspace();
    try {
    var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent === 'View'; })[0];
    assert(tab, 'a View tab'); tab.click(); await wait(80);
    UI.refreshRibbon(); await wait(40);
    UI.transformCaptions(); await wait(20);
    var caps = Array.prototype.slice.call(D.querySelectorAll('#ribbon .rb-caption'));
    assert(caps.some(function (c) { return c.textContent === 'Managers'; }), 'a Managers caption: ' + caps.map(function (c) { return c.textContent; }).join(', '));
    caps.forEach(function (c) { assert(c.scrollWidth <= c.clientWidth + 1, 'caption "' + c.textContent + '" fits its box: ' + c.scrollWidth + ' > ' + c.clientWidth); });
    for (var i = 1; i < caps.length; i++) { var a = caps[i - 1].getBoundingClientRect(), b = caps[i].getBoundingClientRect(); assert(b.left >= a.right - 0.5, 'captions "' + caps[i - 1].textContent + '" and "' + caps[i].textContent + '" do not overlap'); }
    } finally { fr.style.width = old[0]; fr.style.minWidth = old[1]; void fr.offsetWidth; await wait(60); UI.fitWorkspace(); UI.refreshRibbon(); }
    Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent === 'Features'; })[0].click(); await wait(40);
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfDA: UI.modelEdgeInBox says whether a screen box crosses a drawn model edge (for overlays that keep off the model\'s edges): a box on a corner of the block is on an edge, one in empty space or inside a face is not', async function () {
    var errs0 = errors.length;
    await rfDABox();
    UI.setView('Front'); await wait(450);
    var a = UI.worldToScreen([0, 0, 1]), b = UI.worldToScreen([4, 2, 1]), mid = UI.worldToScreen([2, 1, 1]);
    assert(UI.modelEdgeInBox([a[0] - 6, a[1] - 6, a[0] + 6, a[1] + 6]), 'a box on the bottom-left corner crosses edges');
    assert(UI.modelEdgeInBox([mid[0] - 10, b[1] - 4, mid[0] + 10, b[1] + 4]), 'a box on the top edge crosses it');
    assert(!UI.modelEdgeInBox([mid[0] - 10, mid[1] - 6, mid[0] + 10, mid[1] + 6]), 'a box in the middle of the front face crosses none');
    assert(!UI.modelEdgeInBox([b[0] + 40, b[1] - 60, b[0] + 80, b[1] - 40]), 'a box in empty space crosses none');
    assert(UI.modelEdgeInBox([b[0] + 3, b[1] - 6, b[0] + 9, b[1] - 3], 4), 'pad grows the box onto the corner');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfDA: Instant3D feature dimensions keep off the model\'s visible edges — a 4 x 2 x 1 block in Isometric with Boss-Extrude1 selected: no dimension label sits on an edge', async function () {
    var errs0 = errors.length;
    await rfDABox();
    var feat = UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0];
    UI.setSelection([{ kind: 'feature', id: feat.id }]); UI.requestRender(); await wait(300);
    var v = UI.viewport.getBoundingClientRect(), texts = D.querySelectorAll('#i3d-layer .i3d-dim-text');
    assert(texts.length >= 2, 'the sketch dimensions show on the part: ' + texts.length);
    Array.prototype.forEach.call(texts, function (t) {
      var r = t.getBoundingClientRect();
      assert(!UI.modelEdgeInBox([r.left - v.left, r.top - v.top, r.right - v.left, r.bottom - v.top]), t.textContent + ' is not on a model edge');
    });
    UI.setSelection([]);
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
  });
