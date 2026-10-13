  // --- rfBT ---
  // (2026-10-13, lane BT) The user: make the Levels Manager white whatever the theme and tidy it up in the font of the
  // FeatureManager's feature names. The pane (table, header, toolbar, main-level boxes) and the status bar chip's popup
  // are white with dark text in the light and the dark theme; every text in them is the feature-name font (family and
  // size); the header and the rows share their column edges; rows are 20 px; the main level keeps the light yellow;
  // the toolbar is three icon buttons.
  function rfBTRgb(s) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; }
  function rfBTLum(s) { var c = rfBTRgb(s); return c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : -1; }
  function rfBTWhiteOrClear(s) { var c = rfBTRgb(s); return !!c && (c[3] === 0 || (c[0] === 255 && c[1] === 255 && c[2] === 255)); }

  step('rfBT: the Levels Manager is a white table in the light and the dark theme (dark text, the feature-name font everywhere, header and rows on the same column edges, 20 px rows, light-yellow main level, icon toolbar); the Level chip popup is white too', async function () {
    var errs0 = errors.length, theme0 = D.documentElement.getAttribute('data-theme') || 'light', seen = [];
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front", 0, "S1").rect(0, 0, 40, 20).circle(10, 10, 2);'); await idle();
    UI.levels.op('preset', 'ETCH'); UI.levels.op('create'); UI.levels.op('setSet', 2, 'MARKING');
    UI.levels.op('setProps', 2, { lineType: 'dashed' }); UI.levels.op('setVisible', 2, false);
    assert(UI.showLevelsManager(), 'Levels Manager shown');
    try {
      ['dark', 'light'].forEach(function (theme) {
        UI.setTheme(theme); UI.refreshLevelsPanel();
        assert(D.documentElement.getAttribute('data-theme') === theme, 'theme ' + theme);
        var P = $('levels-panel'), cs = W.getComputedStyle(P);
        assert(cs.backgroundColor === 'rgb(255, 255, 255)', theme + ': pane background ' + cs.backgroundColor);
        ['#lvl-grid', '.lvl-head', '.lvl-tools', '.lvl-hdr', '.lvl-main', '#lvl-main-name', '#lvl-sets'].forEach(function (sel) {
          var e = P.querySelector(sel), bg = e && W.getComputedStyle(e).backgroundColor;
          assert(e && rfBTWhiteOrClear(bg), theme + ': ' + sel + ' background ' + bg);
        });
        // the feature-name font: a FeatureManager row's name (the tree is hidden behind the Levels tab, its style is not)
        var nm = D.querySelector('#tree .ti .nm');
        assert(nm, 'a feature name in the tree');
        var ncs = W.getComputedStyle(nm), fam = ncs.fontFamily, size = ncs.fontSize;
        var texts = P.querySelectorAll('.lvl-head span, .lvl-hdr span, .lvl-row[data-level] > span:not(.lvl-sw), .lvl-name em, .lvl-main .lvl-sec, .lvl-main label, .lvl-main input, .lvl-main select, .lvl-foot, #lvl-sets');
        assert(texts.length > 20, 'text cells ' + texts.length);
        Array.prototype.forEach.call(texts, function (e) {
          var c = W.getComputedStyle(e);
          assert(c.fontFamily === fam && c.fontSize === size, theme + ': ' + (e.className || e.id || e.tagName) + ' font ' + c.fontSize + ' ' + c.fontFamily + ' vs the feature names ' + size + ' ' + fam);
          var mainRow = e.closest('.lvl-row.main');
          if (!mainRow) assert(rfBTLum(c.color) < 0.5, theme + ': ' + (e.className || e.id || e.tagName) + ' text is dark: ' + c.color);
        });
        var hdr = P.querySelector('.lvl-hdr');
        assert(W.getComputedStyle(hdr).fontWeight >= 600 && W.getComputedStyle(P.querySelector('.lvl-row[data-level] .lvl-name')).fontWeight < 600, theme + ': header semibold, rows regular');
        // the main level: the light theme's yellow, dark text, in both themes
        var main = P.querySelector('.lvl-row.main'), mcs = W.getComputedStyle(main);
        assert(mcs.backgroundColor === 'rgb(255, 230, 128)' && rfBTLum(mcs.color) < 0.3, theme + ': main row ' + mcs.backgroundColor + ' / ' + mcs.color);
        // one table: every row 20 px, and the header's cells share the rows' left and right edges
        var hc = hdr.children, rows = P.querySelectorAll('.lvl-row[data-level]');
        assert(rows.length >= 3 && hc.length === 6, theme + ': rows ' + rows.length + ', header cells ' + hc.length);
        Array.prototype.forEach.call(rows, function (r) {
          var h = r.getBoundingClientRect().height;
          assert(Math.abs(h - 20) < 0.6, theme + ': row ' + r.getAttribute('data-level') + ' height ' + h);
          assert(r.children.length === hc.length, 'row cells ' + r.children.length);
          for (var i = 0; i < hc.length; i++) {
            var a = hc[i].getBoundingClientRect(), b = r.children[i].getBoundingClientRect();
            assert(Math.abs(a.left - b.left) < 0.6 && Math.abs(a.right - b.right) < 0.6, theme + ': column ' + i + ' of row ' + r.getAttribute('data-level') + ' at ' + b.left.toFixed(1) + '–' + b.right.toFixed(1) + ', header ' + a.left.toFixed(1) + '–' + a.right.toFixed(1));
          }
        });
        // the toolbar: New, All on, All off as compact icon buttons
        ['new', 'allOn', 'allOff'].forEach(function (a) {
          var b = P.querySelector('.lvl-tools [data-act="' + a + '"]'), r = b && b.getBoundingClientRect();
          assert(b && b.querySelector('svg') && !b.textContent.trim() && r.width <= 26 && r.height <= 24 && b.title, theme + ': ' + a + ' icon button');
        });
        // the status bar chip's popup: white, dark rows in the same font
        var pop = UI.levelsPopup(), pcs = pop && W.getComputedStyle(pop), prow = pop && pop.querySelector('.lvl-pop-row:not(.main)');
        assert(pop && pcs.backgroundColor === 'rgb(255, 255, 255)' && prow && rfBTLum(W.getComputedStyle(prow).color) < 0.5 && W.getComputedStyle(prow).fontSize === size && W.getComputedStyle(prow).fontFamily === fam, theme + ': popup ' + (pcs && pcs.backgroundColor));
        D.body.click();
        assert(!D.querySelector('.lvl-pop'), 'popup closed');
        seen.push(theme + ' ' + size);
      });
    } finally {
      UI.setTheme(theme0); UI.refreshLevelsPanel();
    }
    assert(D.documentElement.getAttribute('data-theme') === theme0, 'theme restored');
    // behaviour unchanged: the icon buttons still act
    D.querySelector('#levels-panel [data-act="allOn"]').click();
    assert(!UI.levels.list().some(function (l) { return l.hidden; }), 'All on');
    var n0 = UI.levels.list().length;
    D.querySelector('#levels-panel [data-act="new"]').click();
    assert(UI.levels.list().length === n0 + 1, 'New level');
    D.querySelector('#fm-tabs button[data-tab="tree"]').click();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return seen.join(', ');
  });
  // --- end rfBT ---
