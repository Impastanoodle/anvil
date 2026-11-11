  // --- rfLJ (lane profnav2, 2026-11-11): interface profiles and the navigation map together ---
  // Real mouse / wheel / key events: a profile's mouse reaches the graphics area (anvil.profile, Tools > Options, a
  // registered test profile), the drawing sheet follows it and runs the profile's keys itself (drawing-ui-panels.js
  // asks UI.keys.profileActionFor), typing in a note or a dimension box is never taken, and a reloaded frame has the
  // profile's mouse from its first script. Every step ends on SolidWorks.
  var RFLJ_BLOCK = 'p.sketch("Front").rect(-20, -15, 40, 30).extrude(10);';
  function rfLJPt(x, y) { var r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + x) - r.left, Math.round(r.top + y) - r.top]; }
  function rfLJEv(type, p, opts) {
    var r = $('viewport').getBoundingClientRect();
    var o = Object.assign({ bubbles: true, cancelable: true, clientX: r.left + p[0], clientY: r.top + p[1] }, opts || {});
    (type === 'mousedown' || type === 'wheel' ? $('viewport') : W).dispatchEvent(type === 'wheel' ? new W.WheelEvent('wheel', o) : new W.MouseEvent(type, o));
  }
  function rfLJDrag(p, dx, dy, mods) {
    var m = mods || {};
    rfLJEv('mousedown', p, Object.assign({ button: 1, buttons: 4 }, m));
    for (var i = 1; i <= 4; i++) rfLJEv('mousemove', [p[0] + dx * i / 4, p[1] + dy * i / 4], Object.assign({ buttons: 4 }, m));
    rfLJEv('mouseup', [p[0] + dx, p[1] + dy], Object.assign({ button: 1, buttons: 0 }, m));
  }
  function rfLJCam() { return { dir: UI.cam.dir.clone(), target: UI.cam.target.clone(), scale: UI.cam.scale }; }
  function rfLJDid(c0) {
    var c1 = rfLJCam(), turned = c1.dir.distanceTo(c0.dir) > 1e-6, moved = c1.target.distanceTo(c0.target) > 1e-9 * Math.max(1, c0.scale), zoomed = Math.abs(c1.scale / c0.scale - 1) > 1e-6;
    return turned && !zoomed ? 'rotate' : moved && !turned && !zoomed ? 'pan' : zoomed && !turned ? 'zoom' : turned || moved || zoomed ? 'mixed' : 'none';
  }
  // what plain middle and Shift + middle drags do now (from Front, fitted)
  function rfLJMiddle() {
    var p = rfLJPt(UI.size.w / 2, UI.size.h / 2), out = {}, c;
    UI.setView('Front'); UI.zoomToFit();
    c = rfLJCam(); rfLJDrag(p, 40, 0); out.middle = rfLJDid(c);
    UI.setView('Front'); UI.zoomToFit();
    c = rfLJCam(); rfLJDrag(p, 40, -30, { shiftKey: true }); out.shift = rfLJDid(c);
    UI.setView('Front'); UI.zoomToFit();
    return out;
  }
  // the wheel's zoom ratio for one notch away from the user
  function rfLJWheel() { UI.setView('Front'); UI.zoomToFit(); var s0 = UI.cam.scale; rfLJEv('wheel', rfLJPt(UI.size.w * 0.4, UI.size.h * 0.4), { deltaY: -100 }); return UI.cam.scale / s0; }
  function rfLJKey(k, mods, target) {
    var e = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}));
    (target || D.body).dispatchEvent(e);
    return e;
  }
  async function rfLJPart() {
    anvil.profile('solidworks');
    if (UI.drawingActive && UI.drawingActive()) UI.closeDrawing();
    await anvil.newPart(); await idle();
    await anvil.run(RFLJ_BLOCK); await idle();
  }

  step('rfLJ: (a) anvil.profile(\'mastercam\'): Shift + middle drag pans and plain middle rotates; back on solidworks Shift + middle zooms again', async function () {
    need(UI, 'navMap'); assert(UI.Profiles && UI.Profiles.set, 'no UI.Profiles');
    await rfLJPart();
    try {
      assert(anvil.profile('mastercam') === 'mastercam', 'not Mastercam');
      assert(UI.navMap().drag['shift+middle'] === 'pan', 'navMap ' + JSON.stringify(UI.navMap().drag));
      var g = rfLJMiddle();
      assert(g.middle === 'rotate' && g.shift === 'pan', 'Mastercam: ' + JSON.stringify(g));
    } finally { anvil.profile('solidworks'); }
    var s = rfLJMiddle();
    assert(s.middle === 'rotate' && s.shift === 'zoom', 'SolidWorks: ' + JSON.stringify(s));
    return 'Mastercam ' + JSON.stringify(g) + ', SolidWorks ' + JSON.stringify(s);
  });

  step('rfLJ: (b) the profile chosen in Tools > Options by mouse changes UI.navMap(), and back', async function () {
    await rfLJPart();
    function options() {
      var tools = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (li) { return /^Tools/.test(li.textContent.trim()); })[0];
      assert(tools, 'no Tools menu');
      tools.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^\s*Options…/.test(m.textContent) && m.textContent.indexOf('▸') < 0; })[0];
      assert(row, 'no Tools > Options… row');
      row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    }
    async function pick(id) {
      options(); await wait(60);
      var r = D.querySelector('[data-role="interface-profiles"] input[data-profile="' + id + '"]');
      assert(r, 'no ' + id + ' radio');
      r.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      r.click(); await wait(60);
    }
    try {
      await pick('mastercam');
      assert(UI.Profiles.active() === 'mastercam', 'profile ' + UI.Profiles.active());
      var m = UI.navMap();
      assert(m.drag['shift+middle'] === 'pan' && m.drag.right === null, 'Mastercam navMap ' + JSON.stringify(m.drag));
      assert(rfLJMiddle().shift === 'pan', 'Shift + middle pans after the Options switch');
      await pick('solidworks');
      assert(UI.Profiles.active() === 'solidworks' && UI.navMap().drag['shift+middle'] === 'zoom' && UI.navMap().drag.right === 'pan', 'SolidWorks navMap ' + JSON.stringify(UI.navMap().drag));
    } finally { anvil.profile('solidworks'); if (UI.closeTaskPane) UI.closeTaskPane(); }
  });

  step('rfLJ: (c) a registered profile with mouse.wheel.zoom -1 reverses the wheel; UI.Profiles.unregister restores it', async function () {
    await rfLJPart();
    var k0 = rfLJWheel();
    near(k0, 1 / 1.12, 1e-9, 'SolidWorks wheel');
    try {
      UI.Profiles.register({ id: 'rflj-wheel', name: 'rfLJ wheel', mouse: { wheel: { zoom: -1 } } });
      anvil.profile('rflj-wheel');
      assert(UI.Profiles.active() === 'rflj-wheel', 'not active');
      near(rfLJWheel(), 1.12, 1e-9, 'reversed wheel');
      assert(rfLJMiddle().shift === 'zoom', 'the drags not named stay SolidWorks');
    } finally { UI.Profiles.unregister('rflj-wheel'); anvil.profile('solidworks'); }
    assert(UI.Profiles.active() === 'solidworks', 'unregister puts SolidWorks back');
    near(rfLJWheel(), 1 / 1.12, 1e-9, 'wheel restored');
  });

  step('rfLJ: (d) a drawing sheet under mastercam: middle drag pans, Alt+F1 fits, Page Up / Down and Alt+F2 zoom, Alt+1 / F1 / Alt+Z do nothing harmful, F and D still work; typing in a note or a dimension box is never taken', async function () {
    await rfLJPart();
    anvil.profile('mastercam');
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    var st = UI.drawing.state, DW = UI.drawingInternal, host = D.getElementById('drawing-sheet'), svg = host.querySelector('svg'), r = host.getBoundingClientRect();
    var c = [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
    function vb() { return JSON.parse(JSON.stringify(st.vb)); }
    function same(a, b) { return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.w - b.w) < 1e-9; }
    try {
      UI.drawing.fit(); await wait(20);
      var fit = vb(), a;
      // middle drag pans the sheet (and Shift + middle, Mastercam's pan)
      [{}, { shiftKey: true }].forEach(function (mods) {
        st.mmbAt = 0; a = vb();
        svg.dispatchEvent(new W.MouseEvent('mousedown', Object.assign({ bubbles: true, cancelable: true, button: 1, buttons: 4, clientX: c[0], clientY: c[1] }, mods)));
        W.dispatchEvent(new W.MouseEvent('mousemove', Object.assign({ bubbles: true, buttons: 4, clientX: c[0] + 30, clientY: c[1] + 20 }, mods)));
        W.dispatchEvent(new W.MouseEvent('mouseup', Object.assign({ bubbles: true, button: 1, buttons: 0, clientX: c[0] + 30, clientY: c[1] + 20 }, mods)));
        assert(st.vb.x !== a.x && Math.abs(st.vb.w - a.w) < 1e-9, 'middle drag ' + JSON.stringify(mods) + ' pans the sheet');
      });
      // the profile's zoom keys zoom the sheet about its middle; Alt+F1 fits it again
      a = vb(); var e = rfLJKey('PageUp'); assert(e.defaultPrevented && st.vb.w < a.w * 0.9, 'Page Up zooms in: ' + a.w + ' -> ' + st.vb.w);
      a = vb(); rfLJKey('PageDown'); assert(st.vb.w > a.w * 1.1, 'Page Down zooms out');
      a = vb(); rfLJKey('F2', { altKey: true }); assert(st.vb.w > a.w * 1.1, 'Alt+F2 (Unzoom 80%) zooms out');
      rfLJKey('F1', { altKey: true }); await wait(20);
      assert(same(st.vb, fit), 'Alt+F1 fits the sheet ' + JSON.stringify([st.vb, fit]));
      // keys with no meaning on a sheet: nothing happens, the drawing stays
      var views = st.sheet.views.length, dir = UI.cam.dir.clone();
      [['1', { altKey: true }], ['5', { altKey: true }], ['7', { altKey: true }], ['F1', {}], ['z', { altKey: true }], ['i', { altKey: true }], ['p', { altKey: true }]].forEach(function (k) {
        a = vb(); rfLJKey(k[0], k[1]);
        assert(UI.drawingActive() && same(st.vb, a) && st.sheet.views.length === views && !st.tool, k[1].altKey ? 'Alt+' + k[0] : k[0] + ' changed the drawing');
      });
      assert(UI.cam.dir.distanceTo(dir) < 1e-12, 'the hidden 3D view did not turn');
      // the drawing's own SolidWorks keys still work under the profile
      rfLJKey('PageUp');
      rfLJKey('f'); await wait(20); assert(same(st.vb, fit), 'F still fits');
      rfLJKey('d'); assert(st.tool === 'dim', 'D still starts Smart Dimension: ' + st.tool);
      rfLJKey('Escape'); assert(!st.tool, 'Esc ends it');
      // typing in a note and in a dimension box is the box's
      DW.openNoteEdit(null, [st.sheet.size[0] / 2, st.sheet.size[1] / 2]);
      var ta = D.querySelector('#dw-edit textarea');
      assert(ta, 'no note box');
      ta.focus(); a = vb();
      ['PageUp', 'F1', 'f', 'd', 'Delete'].forEach(function (k) { var ev = rfLJKey(k, k === 'F1' ? { altKey: true } : null, ta); assert(!ev.defaultPrevented, k + ' taken from the note box'); });
      assert(same(st.vb, a) && D.querySelector('#dw-edit textarea') === ta && !st.tool, 'the note box keeps its keys');
      DW.closeInlineEdit(false);
      var dim = (st.sheet.dims || []).filter(function (d) { return d.tbox && d.kind !== 'ordinate' && d.kind !== 'baseline'; })[0];
      if (dim) {
        DW.openInlineEdit(dim);
        var inp = D.querySelector('#dw-edit input');
        assert(inp, 'no dimension box');
        inp.focus(); a = vb();
        ['PageDown', 'F1', '1', 'f'].forEach(function (k) { var ev = rfLJKey(k, k === 'F1' || k === '1' ? { altKey: true } : null, inp); assert(!ev.defaultPrevented, k + ' taken from the dimension box'); });
        assert(same(st.vb, a) && D.querySelector('#dw-edit input') === inp, 'the dimension box keeps its keys');
        DW.closeInlineEdit(false);
      }
      return 'sheet keys run by the drawing; dimension box ' + (dim ? 'checked' : 'not on this sheet');
    } finally { if (DW.closeInlineEdit) DW.closeInlineEdit(false); UI.closeDrawing(); anvil.profile('solidworks'); }
  });

  step('rfLJ: (e) a reloaded app frame with Mastercam saved has its mouse map as soon as the profile file has run (before boot lays out the rest)', async function () {
    await rfLJPart();
    anvil.profile('mastercam');
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-2000px;top:0;width:1200px;height:700px;border:0;';
    f.src = '../index.html';
    document.body.appendChild(f);
    var first = null, loadingSeen = false, w2 = null;
    try {
      var t0 = Date.now();
      // a tight poll: the first moment the frame's UI.Profiles exists, read its mouse map
      while (Date.now() - t0 < 25000 && !first) {
        await new Promise(function (res) { setTimeout(res, 0); });
        w2 = f.contentWindow;
        try { if (w2 && w2.UI && w2.UI.Profiles && w2.UI.navMap) { first = w2.UI.navMap(); loadingSeen = w2.document.readyState === 'loading'; } } catch (e) { }
      }
      assert(first, 'the second frame did not load');
      assert(first.drag['shift+middle'] === 'pan' && first.drag.right === null, 'first map ' + JSON.stringify(first.drag) + ' (document ' + (loadingSeen ? 'still loading' : 'loaded') + ')');
      while (Date.now() - t0 < 25000 && !(w2.UI.Profiles.active() === 'mastercam')) await wait(100);
      assert(w2.UI.Profiles.active() === 'mastercam' && w2.UI.navMap().drag['shift+middle'] === 'pan', 'after boot');
    } finally { f.src = 'about:blank'; await wait(50); f.remove(); anvil.profile('solidworks'); }
    assert(UI.navMap().drag['shift+middle'] === 'zoom', 'reset');
    return 'first map read while the document was ' + (loadingSeen ? 'loading' : 'loaded');
  });
