  // ---- rfBF: the CommandManager, menu bar and icons in the SolidWorks 2024 look (icons.js, style.css, ui-panels.js,
  // index.html): every button of the Part tabs has its own icon, the active tab is raised white over a grey strip, the
  // quick-access toolbar carries New / Open / Save / Print | Undo / Redo | Select | Rebuild / File Properties / Options
  function rfBFrgb(c) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || ''); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4], lum: 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3] } : null; }
  step('rfBF: every button of the Part tabs (Features, Sketch, Evaluate, Sheet Metal) has its own icon, none the generic square', async function () {
    await anvil.newPart(); await idle();
    var generic = W.Icons('generic', 32), checked = 0, bad = [];
    ['Features', 'Sketch', 'Evaluate', 'Sheet Metal'].forEach(function (tab) {
      UI.setRibbonTab(tab);
      Array.prototype.forEach.call($('ribbon-buttons').querySelectorAll('button.rb'), function (b) {
        var ic = b.dataset.icon, name = tab + ' ▸ ' + (b.getAttribute('aria-label') || '?');
        checked++;
        if (!ic || !W.Icons.has(ic)) bad.push(name + ': no icon ' + ic);
        else if (ic === 'generic' || W.Icons(ic, 32) === generic) bad.push(name + ': generic');
      });
    });
    UI.setRibbonTab('Features');
    assert(checked > 60 && bad.length === 0, checked + ' buttons; ' + bad.join(', '));
    return checked + ' buttons, each with its own icon';
  });
  // rfGX (2026-11-03) re-pinned: flat tabs; the active one is the CommandManager's own grey, joined to the buttons above
  // it (was raised white with a shadow)
  step('rfBF: the tab strip is grey and the active tab is joined to the CommandManager (lighter than the strip, same grey as the buttons); inactive tabs are flat', async function () {
    UI.setRibbonTab('Sketch'); await idle();
    await new Promise(function (r) { setTimeout(r, 250); });   // the tabs fade their background in (90 ms transition)
    var strip = rfBFrgb(W.getComputedStyle($('ribbon-tabs')).backgroundColor);
    var act = $('ribbon-tabs').querySelector('.rtab.active'), off = Array.prototype.filter.call($('ribbon-tabs').querySelectorAll('.rtab'), function (t) { return t !== act && !t.classList.contains('off'); })[0];
    assert(act && act.textContent === 'Sketch' && off, 'an active Sketch tab and an inactive one');
    var as = W.getComputedStyle(act), a = rfBFrgb(as.backgroundColor), o = rfBFrgb(W.getComputedStyle(off).backgroundColor);
    assert(strip && strip.a === 1 && strip.lum < 235, 'grey strip: ' + JSON.stringify(strip));
    assert(a && a.a === 1 && a.lum > strip.lum + 8, 'active tab lighter than the strip: ' + JSON.stringify(a) + ' vs ' + JSON.stringify(strip));
    assert(!o || o.a === 0, 'inactive tab is flat on the strip: ' + JSON.stringify(o));
    assert(as.fontWeight >= 600, 'active tab text is bold: ' + as.fontWeight);
    // the CommandManager is a light grey, the active tab the same grey (joined to it)
    var cm = rfBFrgb(W.getComputedStyle($('ribbon')).backgroundColor);
    assert(cm && Math.abs(cm.lum - a.lum) < 1 && cm.lum > strip.lum, 'active tab joined to the CommandManager grey: ' + JSON.stringify(cm));
    UI.setRibbonTab('Features');
    return 'strip ' + Math.round(strip.lum) + ', CommandManager ' + Math.round(cm.lum) + ', active tab ' + Math.round(a.lum);
  });
  step('rfBF: the quick-access toolbar — New, Open, Save, Print | Undo, Redo | Select | Rebuild, File Properties, Options — with icons and tooltips', async function () {
    var ids = ['std-new', 'std-open', 'std-save', 'std-print', 'std-undo', 'std-redo', 'std-select', 'std-rebuild', 'std-fileprops', 'std-options'];
    var bar = $('std-toolbar'), order = Array.prototype.filter.call(bar.querySelectorAll('button'), function (b) { return ids.indexOf(b.id) >= 0; }).map(function (b) { return b.id; });
    assert(order.join() === ids.join(), 'order: ' + order.join());
    ids.forEach(function (id) { var b = $(id); assert(b.querySelector('svg.ico') && b.getAttribute('aria-label'), id + ': icon and name'); });
    ['std-new', 'std-open', 'std-save', 'std-print', 'std-select', 'std-rebuild', 'std-fileprops', 'std-options'].forEach(function (id) {
      var b = $(id); assert(W.Icons.has(b.dataset.icon) && b.dataset.icon !== 'generic' && b._tip && b._tip.desc, id + ': own icon and a tooltip');
    });
    assert(bar.querySelectorAll('.std-sep').length === 3, 'three separators');
    var r = $('std-rebuild').getBoundingClientRect(), mb = $('menubar').getBoundingClientRect();
    assert(r.width >= 22 && r.height >= 20 && r.bottom <= mb.bottom + 0.5, 'buttons sit in the menu bar: ' + JSON.stringify([r.width, r.height]));
    // Rebuild runs the Edit ▸ Rebuild command
    var errs0 = errors.length;
    $('std-rebuild').click(); await idle();
    $('std-select').click(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return order.length + ' buttons';
  });
  step('rfBF: a toggled command is pressed in grey; dark theme keeps the chrome dark', async function () {
    UI.setRibbonTab('Sketch'); await idle();
    var sk = Array.prototype.filter.call($('ribbon-buttons').querySelectorAll('button.rb'), function (b) { return b.dataset.icon === 'instant2D' || b.dataset.icon === 'shadedContours'; });
    var on = sk.filter(function (b) { return b.classList.contains('active'); })[0], plain = Array.prototype.filter.call($('ribbon-buttons').querySelectorAll('button.rb'), function (b) { return !b.classList.contains('active') && !b.disabled; })[0];
    if (on && plain) {
      var ons = W.getComputedStyle(on), ps = W.getComputedStyle(plain);
      // rfGX re-pin: pressed = a darker grey and a darker frame (the inset shadow went)
      assert(ons.backgroundColor !== ps.backgroundColor && ons.borderTopColor !== ps.borderTopColor && rfBFrgb(ons.borderTopColor).a === 1, 'toggled button pressed: ' + ons.backgroundColor + ' / ' + ons.borderTopColor);
    }
    var light = rfBFrgb(W.getComputedStyle($('ribbon')).backgroundColor);
    D.documentElement.dataset.theme = 'dark';
    var dark = rfBFrgb(W.getComputedStyle($('ribbon')).backgroundColor), mbar = rfBFrgb(W.getComputedStyle($('menubar')).backgroundColor);
    var ink = rfBFrgb(W.getComputedStyle($('ribbon-buttons').querySelector('.rb .ico')).color);
    delete D.documentElement.dataset.theme;
    assert(dark.lum < 80 && mbar.lum < 80 && light.lum > 200, 'dark chrome: ' + JSON.stringify([light, dark, mbar]));
    assert(ink.lum > 150, 'icon ink reads on the dark CommandManager: ' + JSON.stringify(ink));
    UI.setRibbonTab('Features');
    return (on ? 'pressed ' + on.dataset.icon + ', ' : '') + 'dark ' + Math.round(dark.lum);
  });
