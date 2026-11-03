  // ---- rfGY (2026-11-03, lane pm: the PropertyManager finish): one value column (every box starts at the same x and has
  // the same width and height), check boxes centred on their text, optional groups with the check box in the title band
  // (Direction 2, Draft), Hole Wizard's Type / Positions tabs above the Message, no blue in either theme, and the PM
  // still accepts with Enter.
  function rfGYRgb(s) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; }
  function rfGYBlue(s) { var c = rfGYRgb(s); return !!(c && c[3] > 0.05 && c[2] - Math.max(c[0], c[1]) > 24); }
  function rfGYNoBlue() {
    var bad = [];
    Array.prototype.forEach.call(D.querySelectorAll('#pm, #pm *'), function (e) {
      if (e.closest('svg')) return;   // icons are the icons lane's (and the ✓+ glyph is its own colour)
      var cs = W.getComputedStyle(e);
      ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'outlineColor'].forEach(function (p) {
        if (rfGYBlue(cs[p])) bad.push((e.className || e.tagName) + ' ' + p + ' ' + cs[p]);
      });
      if (/rgb/.test(cs.backgroundImage) && (cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []).some(rfGYBlue)) bad.push((e.className || e.tagName) + ' backgroundImage');
    });
    return bad;
  }
  function rfGYGroup(title) { return Array.prototype.filter.call(D.querySelectorAll('#pm .pm-group'), function (g) { return g.querySelector('h4').textContent.trim() === title; })[0]; }
  // the value controls of the open PM's field rows (second cell of a label / value row)
  function rfGYControls() {
    return Array.prototype.map.call(D.querySelectorAll('#pm .pm-row.pm-field:not(.check):not(.pm-row-icons):not(.pm-row-static)'), function (r) { return r.querySelector(':scope > .pm-num-wrap, :scope > select, :scope > input'); })
      .filter(function (c) { return c && c.getBoundingClientRect().width > 0; });
  }
  async function rfGYCheckLook(where) {
    var ctl = rfGYControls();
    assert(ctl.length >= 3, where + ': value controls ' + ctl.length);
    var lefts = {}, widths = {}, heights = {};
    ctl.forEach(function (c) { var r = c.getBoundingClientRect(); lefts[Math.round(r.left)] = 1; widths[Math.round(r.width)] = 1; heights[Math.round(r.height)] = 1; });
    assert(Object.keys(lefts).length === 1 && Object.keys(widths).length === 1, where + ': one value column (lefts ' + Object.keys(lefts) + ', widths ' + Object.keys(widths) + ')');
    assert(Object.keys(heights).length === 1 && Object.keys(heights)[0] === '24', where + ': box heights ' + Object.keys(heights));
    // label column: every label starts at the same x
    var ll = {};
    Array.prototype.forEach.call(D.querySelectorAll('#pm .pm-row.pm-field:not(.check) > label'), function (l) { if (l.getBoundingClientRect().width) ll[Math.round(l.getBoundingClientRect().left)] = 1; });
    assert(Object.keys(ll).length === 1, where + ': label lefts ' + Object.keys(ll));
    // check boxes centred on their label's first line, 14 px
    Array.prototype.forEach.call(D.querySelectorAll('#pm .pm-row.check:not(.pm-rev)'), function (r) {
      var cb = r.querySelector('input'), lb = r.querySelector('label');
      if (!cb || !lb || !lb.getBoundingClientRect().width) return;
      var c = cb.getBoundingClientRect(), l = lb.getBoundingClientRect(), lh = parseFloat(W.getComputedStyle(lb).lineHeight) || 16, pad = parseFloat(W.getComputedStyle(lb).paddingTop) || 0;
      assert(Math.round(c.width) === 14 && Math.round(c.height) === 14, where + ': check box size ' + c.width + '×' + c.height);
      assert(Math.abs((c.top + c.height / 2) - (l.top + pad + lh / 2)) <= 1, where + ': check box "' + lb.textContent + '" off its text by ' + ((c.top + c.height / 2) - (l.top + pad + lh / 2)).toFixed(1));
    });
    var blue = rfGYNoBlue();
    assert(!blue.length, where + ': blue in the PM: ' + blue.slice(0, 4).join(' | '));
  }

  step('rfGY: PropertyManager finish — Boss-Extrude in both themes: one label column and one value column (equal 24 px boxes), check boxes centred on their text, no blue', async function () {
    var theme0 = D.documentElement.getAttribute('data-theme') || 'light';
    await anvil.run('p.sketch("Top").rect(0, -20, 40, 20).extrude(10);'); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
    try {
      for (var t = 0; t < 2; t++) {
        anvil.theme(t ? 'dark' : 'light');
        UI.editFeature(f); await idle();
        assert(UI.hasPM(), 'Edit Feature PM');
        await rfGYCheckLook((t ? 'dark' : 'light') + ' Boss-Extrude');
        // one focus frame: the box's own border, no outline on the number, list or text box inside it
        ['#pm input.pm-num', '#pm .pm-row-select select', '#pm .pm-row-text input'].forEach(function (q) {
          var e = D.querySelector(q); if (!e) return;
          e.focus();
          var cs = W.getComputedStyle(e);
          assert(cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0, q + ': a second frame (outline ' + cs.outlineStyle + ' ' + cs.outlineWidth + ')');
        });
        var wrapCs = W.getComputedStyle(D.querySelector('#pm .pm-num-wrap'));
        D.querySelector('#pm input.pm-num').focus();
        assert(W.getComputedStyle(D.querySelector('#pm .pm-num-wrap')).borderTopColor !== '' && wrapCs, 'focus frame on the whole box');
        // ✓ ✗ share one size; the title row is 36 px
        var ok = D.querySelector('#pm .pm-ok').getBoundingClientRect(), no = D.querySelector('#pm .pm-cancel').getBoundingClientRect();
        assert(Math.round(ok.width) === Math.round(no.width) && Math.round(ok.height) === Math.round(no.height) && Math.abs(ok.top - no.top) < 0.5, 'OK / Cancel sizes');
        assert(Math.round(D.querySelector('#pm .pm-head').getBoundingClientRect().height) === 36, 'title row height');
        UI.pmCancel(); await idle();
      }
    } finally { anvil.theme(theme0); }
    return 'both themes';
  });

  step('rfGY: optional groups — Direction 2 and Draft carry their check box in the title band (found by its own label), ticking it opens the group and its fields; the title stays the group\'s name', async function () {
    await anvil.run('p.sketch("Top").rect(0, -20, 40, 20).end();'); await idle();
    UI.App.sel = { kind: 'feature', id: UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0].id };
    UI.cmdExtrude(false);
    assert(UI.hasPM(), 'Extrude PM');
    ['Direction 2', 'Draft'].forEach(function (title) {
      var g = rfGYGroup(title);
      assert(g && g.classList.contains('pm-optional'), title + ' is an optional group');
      var cb = g.querySelector(':scope > .pm-hcheck input[type=checkbox]'), h = g.querySelector('h4').getBoundingClientRect(), r = cb.getBoundingClientRect();
      assert(r.top >= h.top && r.bottom <= h.bottom && r.left < g.querySelector('h4 .pm-gt').getBoundingClientRect().left, title + ': check box inside the band, left of the title');
      assert(D.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === cb, title + ': the check box is what the mouse reaches');
    });
    var d2 = pmField('Enable direction 2');
    assert(d2 && d2.type === 'checkbox' && d2.closest('.pm-hcheck'), 'pmField finds the header check box');
    d2.click(); await idle();
    var g2 = rfGYGroup('Direction 2');
    assert(!g2.classList.contains('collapsed') && g2.querySelectorAll('.pm-fields .pm-row').length >= 1 && pmField('Depth  D2'), 'Direction 2 opened with its fields');
    // Reverse direction: SolidWorks' button left of End condition, still the same check box (found by its label)
    var rev = pmField('Reverse direction'), endRow = pmField('End condition').closest('.pm-row');
    assert(rev && rev.type === 'checkbox' && endRow.contains(rev), 'Reverse direction sits in the End condition row');
    var rr = rev.getBoundingClientRect(), sr = pmField('End condition').getBoundingClientRect();
    assert(rr.right <= sr.left && Math.abs((rr.top + rr.height / 2) - (sr.top + sr.height / 2)) <= 0.5 && Math.round(rr.height) === 24, 'the button is left of the list, centred, 24 px');
    rev.click();
    assert(UI.pmSpec().values.reverse === true && rev.checked, 'the button reverses');
    rev.click();
    var dr = pmField('Draft on');
    dr.click(); await idle();
    assert(!rfGYGroup('Draft').classList.contains('collapsed') && pmField('Draft angle'), 'Draft opened with its angle');
    // a click on the band (not the box) still folds the group
    rfGYGroup('Draft').querySelector('h4').click();
    assert(rfGYGroup('Draft').classList.contains('collapsed') && UI.pmSpec().values.draftOn, 'the band folds, the check stays');
    UI.pmCancel(); await idle();
    return 'ok';
  });

  step('rfGY: Hole Wizard — Type / Positions are tabs under OK / Cancel, above the Message; the pressed tab shows its groups', async function () {
    await anvil.run('p.sketch("Top").rect(0, -20, 40, 20).extrude(10);'); await idle();
    UI.App.sel = null;
    UI.cmdHoleWizard(); await idle();
    assert(UI.hasPM(), 'Hole Wizard PM');
    var tabs = D.querySelector('#pm .pm-tabs'), msg = D.querySelector('#pm .pm-msg');
    assert(tabs && tabs.querySelectorAll('button').length === 2, 'two tabs');
    if (msg) assert(tabs.getBoundingClientRect().bottom <= msg.getBoundingClientRect().top, 'tabs above the Message');
    var bs = tabs.querySelectorAll('button'), r0 = bs[0].getBoundingClientRect(), r1 = bs[1].getBoundingClientRect();
    assert(Math.abs(r0.width - r1.width) <= 1 && Math.abs(r0.top - r1.top) < 0.5, 'equal tabs side by side');
    clickPmButton('Type'); await idle();
    assert(D.querySelector('#pm .pm-tabs button.on').textContent === 'Type' && rfGYGroup('Hole Type'), 'Type tab shows Hole Type');
    clickPmButton('Positions'); await idle();
    assert(D.querySelector('#pm .pm-tabs button.on').textContent === 'Positions' && rfGYGroup('Hole Position'), 'Positions tab shows Hole Position');
    UI.pmCancel(); await idle();
    return 'ok';
  });

  step('rfGY: the finished PM still takes Enter — a typed depth, Enter commits it, Enter again is OK (the two-Enter rule)', async function () {
    await anvil.run('p.sketch("Top").rect(0, -20, 40, 20).end();'); await idle();
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    UI.App.sel = { kind: 'feature', id: sk.id };
    UI.cmdExtrude(false);
    assert(UI.hasPM(), 'Extrude PM');
    var inp = pmNumber(0);
    inp.focus(); setInput(inp, 7);
    pressEnter(inp);
    assert(UI.hasPM(), 'first Enter keeps the PM');
    pressEnter(inp);
    await idle();
    assert(!UI.hasPM(), 'second Enter accepts');
    near(anvil.summary().volume, 40 * 20 * 7, 1e-6, 'volume');
    return 'ok';
  });
