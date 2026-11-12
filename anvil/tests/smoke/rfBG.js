  // ---- rfBG (2026-10-13): FeatureManager and PropertyManager in the SolidWorks 2024 look (style.css rfBG section)
  function rfBGRgb(s) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
  function rfBGInk(btn) {
    var el = btn && btn.querySelector('svg [stroke]:not([stroke="none"]), svg path, svg polyline, svg line');
    return el ? rfBGRgb(W.getComputedStyle(el).stroke) : null;
  }
  async function rfBGSketch() {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 30, y1: 0, x2: 30, y2: 20 }, { t: 'line', x1: -10, y1: -10, x2: -10, y2: 30 });
    UI.updateSketches();
    return f;
  }
  step('rfBG: PropertyManager title row and ✓ ✗ — the green OK check and the red Cancel cross, the round Help (?) button at the right of the title (the title text unchanged), Help shows a note and closes nothing', async function () {
    var errs0 = errors.length;
    await rfBGSketch();
    UI.cmdSketchFillet(); await idle();
    var head = D.querySelector('#pm .pm-head'), ok = D.querySelector('#pm .pm-actions .pm-ok'), no = D.querySelector('#pm .pm-actions .pm-cancel');
    assert(head && head.querySelector('span').textContent === 'Sketch Fillet' && head.textContent === 'Sketch Fillet', 'title ' + (head && head.textContent));
    var g = rfBGInk(ok), r = rfBGInk(no);
    assert(g && g[1] > g[0] + 40 && g[1] > g[2], 'OK is green: ' + g);
    assert(r && r[0] > r[1] + 60 && r[0] > r[2] + 60, 'Cancel is red: ' + r);
    var help = head.querySelector('.pm-help');
    assert(help && W.getComputedStyle(help, '::before').content === '"?"' && W.getComputedStyle(help).borderTopLeftRadius === '50%', 'round Help button');
    var hb = help.getBoundingClientRect(), tb = head.querySelector('span').getBoundingClientRect();
    assert(hb.left > tb.right - 1 && hb.right <= head.getBoundingClientRect().right, 'Help at the right of the title');
    help.click(); await idle();
    var t = D.querySelector('.toast');
    assert(UI.hasPM() && t && /Sketch Fillet/.test(t.textContent), 'Help note, PM still open: ' + (t && t.textContent));
    no.click(); await idle();
    assert(!UI.hasPM(), 'Cancel closes');
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'OK ' + g + ', Cancel ' + r;
  });
  step('rfBG: group boxes — a grey title band with the round chevron, 8 px apart; clicking the title collapses the box (its fields hidden) and clicking again opens it', async function () {
    await rfBGSketch();
    UI.cmdSketchFillet(); await idle();
    var boxes = D.querySelectorAll('#pm .pm-group:not(.pm-group-msg)');
    assert(boxes.length >= 2, 'two groups');
    var b = boxes[boxes.length - 1], h = b.querySelector('h4'), fields = b.querySelector('.pm-fields');
    var cs = W.getComputedStyle(h);
    assert(/gradient/.test(cs.backgroundImage) && W.getComputedStyle(h.querySelector('.tw'), '::after').content !== 'none', 'title band and chevron');
    assert(W.getComputedStyle(b).marginTop === '8px' && parseFloat(W.getComputedStyle(b).borderTopWidth) === 1, 'box spacing and frame: ' + W.getComputedStyle(b).marginTop);
    var h0 = b.getBoundingClientRect().height;
    h.click();
    assert(b.classList.contains('collapsed') && W.getComputedStyle(fields).display === 'none' && b.getBoundingClientRect().height < h0 - 10, 'collapsed');
    h.click();
    assert(!b.classList.contains('collapsed') && W.getComputedStyle(fields).display !== 'none' && Math.abs(b.getBoundingClientRect().height - h0) < 1, 'opened again');
    D.querySelector('#pm .pm-cancel').click(); await idle();
    UI.exitSketch(); await idle();
    return 'band ' + cs.backgroundImage.slice(0, 40) + '…';
  });
  step('rfBG: selection boxes — Mirror Entities\' active box (where picks go) is pink with a magenta frame, the other a pale cool grey (swtheme: neutrals carry a slight cool tint); clicking the other box moves the highlight', async function () {
    await rfBGSketch();
    UI.cmdMirrorEntities(); await idle();
    function boxes() { return Array.prototype.slice.call(D.querySelectorAll('#pm .pm-pick')); }
    function pinkish(e) { var c = rfBGRgb(W.getComputedStyle(e).backgroundColor); return c && c[0] > c[2] && c[0] > c[1] + 20; }
    function greyish(e) { var c = rfBGRgb(W.getComputedStyle(e).backgroundColor); return c && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) <= 25 && c[0] < 250; }   // swtheme: a cool neutral (chroma <= 0.1)
    var bs = boxes();
    assert(bs.length === 2, 'two selection boxes: ' + bs.length);
    var act = bs.filter(function (e) { return e.classList.contains('active'); });
    assert(act.length === 1 && pinkish(act[0]), 'one active box, pink: ' + (act[0] && W.getComputedStyle(act[0]).backgroundColor));
    var fr = rfBGRgb(W.getComputedStyle(act[0]).borderTopColor);
    assert(fr && fr[0] > 180 && fr[1] < 120, 'magenta frame ' + fr);
    var other = bs.filter(function (e) { return !e.classList.contains('active'); })[0];
    assert(greyish(other), 'the other box pale grey: ' + W.getComputedStyle(other).backgroundColor);
    var idx = bs.indexOf(other);
    other.click(); await idle();
    bs = boxes();
    assert(bs[idx].classList.contains('active') && pinkish(bs[idx]) && greyish(bs[1 - idx]), 'the highlight moved');
    D.querySelector('#pm .pm-cancel').click(); await idle();
    UI.exitSketch(); await idle();
    return 'active ' + W.getComputedStyle(act[0]).backgroundColor;
  });
  step('rfBG: FeatureManager — the rollback bar sits under the last feature, the sketch\'s (-) prefix is its own span with the name text unchanged, the selected row has the selection fill and frame (swtheme: the pale accent blue, --c-sel)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").line(0, 0, 40, 0).line(40, 0, 40, 30);\np.sketch("Top").rect(0, 0, 40, 30).extrude(10);'); await idle();
    var tree = $('tree'), bar = tree.querySelector('.rollbar');
    assert(bar && W.getComputedStyle(bar, '::before').content !== 'none', 'rollback bar');
    var rows = Array.prototype.slice.call(tree.querySelectorAll(':scope > .ti, :scope > .tc > .ti')).filter(function (r) { return r.hasAttribute('data-fid'); });
    var last = rows[rows.length - 1];
    assert(last && (last.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING), 'bar after the last feature');
    var sk = rows.filter(function (r) { return /Sketch1/.test(r.textContent); })[0];
    var pf = sk && sk.querySelector('.nm .ti-pfx');
    assert(pf && pf.textContent === '(-) ' && pf.classList.contains('under') && sk.querySelector('.nm').textContent === '(-) Sketch1', 'prefix span: ' + (sk && sk.querySelector('.nm').textContent));
    sk.click(); await idle();
    var sel = tree.querySelector('.ti.selected'), c = sel && rfBGRgb(W.getComputedStyle(sel).backgroundColor);
    var probe = D.createElement('div'); probe.style.background = 'var(--c-sel)'; D.body.appendChild(probe);
    var cs = rfBGRgb(W.getComputedStyle(probe).backgroundColor); probe.remove();
    assert(sel && c && cs && c.join() === cs.join() && c[2] > c[0] && /inset/.test(W.getComputedStyle(sel).boxShadow), 'selected row ' + (sel && W.getComputedStyle(sel).backgroundColor));
    $('tree-filter-input').value = 'Sketch'; $('tree-filter-input').dispatchEvent(new Event('input', { bubbles: true })); await idle();
    var hidden = !tree.querySelector('.rollbar');
    $('tree-filter-input').value = ''; $('tree-filter-input').dispatchEvent(new Event('input', { bubbles: true })); await idle();
    assert(hidden && tree.querySelector('.rollbar'), 'no rollback bar while the tree is filtered');
    return rows.length + ' feature rows';
  });
