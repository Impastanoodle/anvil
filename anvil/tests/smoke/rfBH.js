  // --- rfBH ---
  // (2026-10-13) The graphics area in the SolidWorks 2024 look: the Heads-up View toolbar's buttons in 2024 order on a
  // transparent strip with carets beside the icons, the default scene gradient (light blue to white), sketch status
  // colours, selection light blue, dimension text without a halo (ui-panels.js refreshHud, style.css, ui-core.js)
  step('rfBH: Heads-up View toolbar in SolidWorks 2024 order — Zoom to Fit, Zoom to Area, Previous View, Section View, Dynamic Annotation Views (greyed), then View Orientation ▾ … View Settings ▾; transparent, carets beside the icons, no separators', async function () {
    await anvil.newPart(); await idle();
    var hud = $('hud'), kids = Array.prototype.slice.call(hud.children);
    var names = kids.map(function (b) { return b.getAttribute('data-hud'); });
    assert(names.join('|') === UI.HUD_ORDER.join('|'), 'order: ' + names.join(', '));
    assert(UI.HUD_ORDER.join('|') === 'Zoom to Fit|Zoom to Area|Previous View|Section View|Dynamic Annotation Views|View Orientation|Display Style|Hide/Show Items|Edit Appearance|Apply Scene|Show Endpoints|View Settings', 'UI.HUD_ORDER ' + UI.HUD_ORDER.join(', '));
    assert(!hud.querySelector('.sep'), 'no separators');
    assert(kids[5].getAttribute('data-hud') === 'View Orientation', 'children[5] is View Orientation (Space clicks it)');
    var withCaret = kids.filter(function (b) { return !!b.querySelector('.caret'); }).map(function (b) { return b.getAttribute('data-hud'); });
    assert(withCaret.join('|') === UI.HUD_ORDER.slice(5).filter(function (n) { return n !== 'Show Endpoints'; }).join('|'), 'drop-downs: ' + withCaret.join(', '));
    kids.slice(5).filter(function (b) { return b.getAttribute('data-hud') !== 'Show Endpoints'; }).forEach(function (b) {   // lane BS: Show Endpoints is a toggle (no caret)
      var ic = b.querySelector('svg').getBoundingClientRect(), ca = b.querySelector('.caret').getBoundingClientRect();
      assert(ca.left >= ic.right - 1 && ca.top < ic.bottom && ca.bottom > ic.top, b.getAttribute('data-hud') + ': caret beside the icon (' + [ic.right, ic.top, ic.bottom] + ' / ' + [ca.left, ca.top, ca.bottom] + ')');
    });
    var hs = W.getComputedStyle(hud);
    assert(/rgba\(0, 0, 0, 0\)|transparent/.test(hs.backgroundColor) && hs.backgroundImage === 'none', 'transparent strip: ' + hs.backgroundColor);
    var r = hud.getBoundingClientRect(), v = $('viewport').getBoundingClientRect();
    assert(Math.abs((r.left + r.right) / 2 - (v.left + v.right) / 2) < 2 && r.top - v.top < 12, 'centred along the top');
    assert(kids[4].classList.contains('off') && kids[4].getAttribute('aria-disabled') === 'true', 'Dynamic Annotation Views greyed');
    // the drop-downs open their lists under the button
    kids[8].click();
    var m = D.querySelector('.menu');
    assert(m && /Edit Appearance/.test(m.textContent), 'Edit Appearance ▾ list');
    UI.closeMenus();
    kids[UI.HUD_ORDER.indexOf('View Settings')].click();
    m = D.querySelector('.menu');
    assert(m && /Options/.test(m.textContent) && /Dark Theme/.test(m.textContent), 'View Settings ▾ list: ' + (m && m.textContent));
    UI.closeMenus();
    // Zoom to Area marks itself in place (the toolbar is not rebuilt)
    var za = kids[1];
    za.click();
    assert($('hud').children[1] === za && za.classList.contains('active'), 'Zoom to Area marked active');
    za.click();
    assert(!za.classList.contains('active'), 'Zoom to Area off');
    return names.length + ' buttons';
  });
  step('rfBH / rfBR: the dark theme\'s scene is Mastercam\'s grey-black gradient (#3c3c3c at the top to #0e0e0e), Plain a flat #1e1e1e; the light theme\'s is light (user 2026-11-04), Plain #f7f7f7; Dark is darker still in both', async function () {
    var vp = $('viewport'), theme0 = UI.theme();
    UI.setTheme('light'); UI.setBackground('gradient');
    var bg = W.getComputedStyle(vp).backgroundImage;
    assert(/linear-gradient/.test(bg) && /rgb\(214, 216, 219\)/.test(bg) && /rgb\(255, 255, 255\)/.test(bg), 'light theme gradient: ' + bg);
    UI.setTheme('dark');
    bg = W.getComputedStyle(vp).backgroundImage;
    assert(/rgb\(60, 60, 60\)/.test(bg) && /rgb\(14, 14, 14\)/.test(bg), 'dark theme gradient: ' + bg);
    UI.setBackground('plain');
    assert(W.getComputedStyle(vp).backgroundImage === 'none' && W.getComputedStyle(vp).backgroundColor === 'rgb(30, 30, 30)', 'dark theme Plain: flat grey-black ' + W.getComputedStyle(vp).backgroundColor);
    UI.setTheme('light');
    assert(W.getComputedStyle(vp).backgroundImage === 'none' && W.getComputedStyle(vp).backgroundColor === 'rgb(247, 247, 247)', 'light theme Plain: flat light ' + W.getComputedStyle(vp).backgroundColor);
    UI.setBackground('dark');
    assert(/linear-gradient/.test(W.getComputedStyle(vp).backgroundImage) && !/60, 60, 60/.test(W.getComputedStyle(vp).backgroundImage), 'Dark scene');
    UI.setBackground('gradient');
    UI.setTheme(theme0);
    return 'ok';
  });
  step('rfBH / rfBR: sketch colours as Mastercam on the dark ground (Dark background) — under and fully defined white, over defined red, selected yellow dashed; dimension text light with a dark halo, driven grey', async function () {
    await anvil.newPart(); await idle();
    UI.setTheme('light'); UI.setBackground('dark', true);
    await UI.newSketchOnPlane('Front'); await idle();
    var f = UI.activeSketchFeature(), S = W.SketchSolver;
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 });
    UI.updateSketches();
    function hex() { var o = UI.groups.sketches.children.filter(function (x) { return x.userData && x.userData.sketch === f.id && x.userData.index === 0; })[0]; return o && o.material.color.getHex(); }
    assert(hex() === 0xffffff, 'under defined white: ' + (hex() || 0).toString(16));
    S.addRelation(f, 'fix', ['0']); UI.updateSketches();
    assert(hex() === 0xffffff, 'fully defined white: ' + (hex() || 0).toString(16));
    S.addRelation(f, 'horizontal', ['0']); UI.updateSketches();
    assert(hex() === 0xd9302c, 'over defined red: ' + (hex() || 0).toString(16));
    assert(UI.mats.sketchSel.color.getHex() === 0xffd400 && UI.mats.sketchSel.isLineDashedMaterial, 'selected sketch entities yellow dashed: ' + UI.mats.sketchSel.color.getHexString());
    var vs = W.getComputedStyle($('viewport'));
    assert(vs.getPropertyValue('--sk-sel').trim() === '#ffd400' && vs.getPropertyValue('--sk-infer-rel').trim() === '#c8c8c8', 'selection / inference colours: ' + vs.getPropertyValue('--sk-sel') + ' ' + vs.getPropertyValue('--sk-infer-rel'));
    // a placed dimension: light text with a dark halo (it reads on the grey-black ground and over a shaded face)
    f.rels = []; f.dims = [{ e: 0, k: 'len' }];
    UI.updateSketches(); UI.App.dimsStale = true; if (UI.render) UI.render();
    var t0 = performance.now(), t = null; while (!(t = D.querySelector("#dim-layer .dim text")) && performance.now() - t0 < 5000) await wait(15);
    assert(t, 'a dimension label');
    var ts = W.getComputedStyle(t);
    var lum = ts.fill.match(/\d+/g).slice(0, 3).reduce(function (a, b) { return a + Number(b); }, 0) / 3;
    assert(lum > 200 && parseFloat(ts.strokeWidth) > 0, 'dimension text light with a halo: ' + ts.fill + ' / ' + ts.strokeWidth);
    UI.setTheme('dark');
    assert(parseFloat(W.getComputedStyle(t).strokeWidth) > 0, 'dark theme keeps a halo');
    UI.setTheme('light'); UI.setBackground('gradient', true);
    return 'ok';
  });
