  // ---- rfIP (2026-11-05, lane icon polish 2): the Task Pane strip and title draw 16 px icons in their 16 px boxes (were
  // 20 / 18, scaled down and blurred), and showMenu's `dimmed` rows: greyed but clickable. File ▸ a recent document that
  // is not found is one; its click offers Remove / Keep, as the Browse Recent Documents dialog does.
  function rfIPMenu(label) {
    var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === label; })[0];
    li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, detail: 1, button: 0 }));
    return li;
  }
  function rfIPRow(re) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return re.test(m.textContent); })[0]; }
  function rfIPButton(label) { return Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (b) { return b.textContent === label; })[0]; }
  step('rfIP: the Task Pane strip and title icons are drawn at 16 px, the size of their boxes', async function () {
    var strip = D.querySelectorAll('#tp-strip button svg.ico');
    assert(strip.length >= 4, 'Task Pane strip icons: ' + strip.length);
    Array.prototype.forEach.call(strip, function (s) {
      var r = s.getBoundingClientRect();
      assert(s.getAttribute('width') === '16' && Math.abs(r.width - 16) < 0.01, 'strip icon drawn at ' + s.getAttribute('width') + ', shown at ' + r.width);
    });
    strip[0].parentNode.click(); await idle();
    try {
      var t = D.querySelector('#tp-title svg.ico');
      assert(t && t.getAttribute('width') === '16' && Math.abs(t.getBoundingClientRect().width - 16) < 0.01, 'Task Pane title icon ' + (t && t.getAttribute('width')));
    } finally { strip[0].parentNode.click(); await idle(); }
    return strip.length + ' strip icons and the title at 16 px';
  });
  step('rfIP: File ▸ a recent document that is not found is a dimmed row that still runs: its click asks Remove / Keep; Keep leaves it, Remove takes it off', async function () {
    var RD = UI.recentDocuments, key = RD.key, before = null, name = 'rfIP gone.anvil.json';
    try { before = W.localStorage.getItem(key); } catch (e) { }
    try {
      W.localStorage.setItem(key, JSON.stringify([{ name: name, kind: 'browser', at: 1 }]));
      await RD.list(true);
      assert(RD.cached().length === 1 && RD.cached()[0].missing, 'the entry is missing: ' + JSON.stringify(RD.cached()));
      rfIPMenu('File'); await idle();
      var row = rfIPRow(/rfIP gone/), open = rfIPRow(/^Open…/);
      assert(row && /\(not found\)/.test(row.textContent), 'File menu row: ' + (row && row.textContent));
      assert(row.classList.contains('mi-dim') && !row.classList.contains('disabled'), 'dimmed, not disabled: ' + row.className);
      assert(open && W.getComputedStyle(row).color !== W.getComputedStyle(open).color, 'greyed like a disabled row: ' + W.getComputedStyle(row).color);
      row.click(); await idle();
      assert(!D.querySelector('body > .menu'), 'the menu closed');
      assert(rfIPButton('Remove') && rfIPButton('Keep'), 'Remove / Keep asked');
      rfIPButton('Keep').click(); await idle();
      await RD.list(true);
      assert(RD.cached().length === 1, 'Keep leaves it on the list');
      rfIPMenu('File'); await idle();
      rfIPRow(/rfIP gone/).click(); await idle();
      rfIPButton('Remove').click(); await idle(); await idle();
      await RD.list(true);
      assert(RD.cached().length === 0, 'Remove takes it off: ' + RD.cached().length);
      rfIPMenu('File'); await idle();
      assert(!rfIPRow(/rfIP gone/), 'no longer in the File menu');
      UI.closeMenus();
    } finally {
      if (UI.closeModal) UI.closeModal(); UI.closeMenus();
      try { if (before == null) W.localStorage.removeItem(key); else W.localStorage.setItem(key, before); } catch (e) { }
      await RD.list(true);
    }
    return 'dimmed row, Remove / Keep, removed';
  });
