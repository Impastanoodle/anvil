  // --- rfLI (lane profnav, 2026-11-11): the navigation map (UI.setNavMap / UI.navMap / UI.navActionFor, ui-core.js) ---
  // Real mouse and wheel events on the viewport and the drawing sheet: the default map is SolidWorks; a map moves
  // rotate / pan / zoom to other buttons and reverses the wheel; every step puts the default map back.
  var RFLI_BLOCK = 'p.sketch("Front").rect(-20, -15, 40, 30).extrude(10);';
  function rfLIEv(type, p, opts, target) {
    var r = $('viewport').getBoundingClientRect();
    var o = Object.assign({ bubbles: true, cancelable: true, clientX: r.left + p[0], clientY: r.top + p[1] }, opts || {});
    (target || (type === 'mousedown' || type === 'wheel' || type === 'contextmenu' ? $('viewport') : W)).dispatchEvent(type === 'wheel' ? new W.WheelEvent('wheel', o) : new W.MouseEvent(type, o));
  }
  // a drag with button b (0 left, 1 middle, 2 right) and modifiers mods from p by (dx, dy), in four moves
  function rfLIDrag(b, p, dx, dy, mods) {
    var bits = b === 0 ? 1 : b === 1 ? 4 : 2, m = mods || {};
    rfLIEv('mousedown', p, Object.assign({ button: b, buttons: bits }, m));
    for (var i = 1; i <= 4; i++) rfLIEv('mousemove', [p[0] + dx * i / 4, p[1] + dy * i / 4], Object.assign({ buttons: bits }, m));
    rfLIEv('mouseup', [p[0] + dx, p[1] + dy], Object.assign({ button: b, buttons: 0 }, m));
  }
  function rfLICam() { return { dir: UI.cam.dir.clone(), target: UI.cam.target.clone(), scale: UI.cam.scale }; }
  // viewport points whose client coordinates are whole pixels, as real events carry
  function rfLIPt(x, y) { var r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + x) - r.left, Math.round(r.top + y) - r.top]; }
  function rfLIMid() { return rfLIPt(UI.size.w / 2, UI.size.h / 2); }
  // which of rotate / pan / zoom a drag did to the 3D view
  function rfLIDid(c0) {
    var c1 = rfLICam(), turned = c1.dir.distanceTo(c0.dir) > 1e-6, moved = c1.target.distanceTo(c0.target) > 1e-9 * Math.max(1, c0.scale), zoomed = Math.abs(c1.scale / c0.scale - 1) > 1e-6;
    return turned && !zoomed ? 'rotate' : moved && !turned && !zoomed ? 'pan' : zoomed && !turned ? 'zoom' : turned || moved || zoomed ? 'mixed' : 'none';
  }
  async function rfLIPart() {
    UI.setNavMap(null);
    if (UI.drawingActive && UI.drawingActive()) UI.closeDrawing();
    await anvil.newPart(); await idle();
    await anvil.run(RFLI_BLOCK); await idle();
    UI.setView('Front'); UI.zoomToFit();
  }
  // the wheel at p (deltaY dy) keeps the Front-plane point under the cursor; returns the scale ratio
  function rfLIWheel(p, dy) {
    var s0 = UI.cam.scale, w0 = UI.screenToPlane(p[0], p[1], K.makePlane('Front', 0));
    rfLIEv('wheel', p, { deltaY: dy });
    var w1 = UI.screenToPlane(p[0], p[1], K.makePlane('Front', 0));
    near(w1[0], w0[0], 1e-6, 'model point under the cursor x'); near(w1[1], w0[1], 1e-6, 'model point under the cursor y');
    return UI.cam.scale / s0;
  }
  // the gestures of acceptance (a): returns what each did
  function rfLIGestures() {
    var p = rfLIMid(), out = {}, c;
    UI.setView('Front'); UI.zoomToFit();
    c = rfLICam(); rfLIDrag(1, p, 40, 0); out.middle = rfLIDid(c);
    if (out.middle === 'rotate') near(UI.cam.target.distanceTo(c.target), 0, 1e-9, 'middle-drag rotate keeps the target');
    UI.setView('Front'); UI.zoomToFit();
    c = rfLICam(); rfLIDrag(1, p, 40, 20, { ctrlKey: true }); out.ctrlMiddle = rfLIDid(c);
    c = rfLICam(); rfLIDrag(1, p, 0, -40, { shiftKey: true }); out.shiftMiddle = rfLIDid(c);
    UI.setView('Front'); UI.zoomToFit();
    out.wheelIn = rfLIWheel(rfLIPt(UI.size.w * 0.3, UI.size.h * 0.4), -100);
    return out;
  }
  // a plain middle double-click (two clicks released where pressed) fits; returns the scale ratio to Zoom to Fit's
  function rfLIMiddleDouble() {
    UI.setView('Front'); UI.zoomToFit();
    var fit = UI.cam.scale, p = rfLIMid();
    UI.zoomView(0.2, p[0], p[1]);
    var s0 = UI.cam.scale;
    for (var i = 0; i < 2; i++) { rfLIEv('mousedown', p, { button: 1, buttons: 4 }); rfLIEv('mouseup', p, { button: 1, buttons: 0 }); }
    return { fitted: Math.abs(UI.cam.scale / fit - 1) < 1e-6, zoomedIn: s0 };
  }

  step('rfLI: the default navigation map is SolidWorks: middle drag rotates about the target, Ctrl + middle pans, Shift + middle zooms, the wheel zooms about the cursor (wheel toward you out), a middle double-click fits', async function () {
    need(UI, 'setNavMap'); need(UI, 'navMap'); need(UI, 'navActionFor');
    await rfLIPart();
    var m = UI.navMap();
    assert(m.drag.middle === 'rotate' && m.drag['ctrl+middle'] === 'pan' && m.drag['shift+middle'] === 'zoom' && m.drag['alt+left'] === 'rotate' && m.drag.right === 'pan', 'default drag map ' + JSON.stringify(m.drag));
    assert(m.wheel.zoom === 1 && m.wheel.about === 'cursor' && m.middleDouble === 'fit', 'default wheel / middleDouble ' + JSON.stringify(m));
    assert(UI.navActionFor({ button: 1, ctrlKey: true, shiftKey: true }) === 'pan' && UI.navActionFor({ button: 1, altKey: true }) === 'rotate' && UI.navActionFor({ button: 0, altKey: true, shiftKey: true }) === 'zoom', 'combinations the map does not name do what they did');
    var g = rfLIGestures();
    assert(g.middle === 'rotate' && g.ctrlMiddle === 'pan' && g.shiftMiddle === 'zoom', 'gestures ' + JSON.stringify(g));
    near(g.wheelIn, 1 / 1.12, 1e-9, 'one notch away from you zooms in 1.12×');
    var d = rfLIMiddleDouble();
    assert(d.fitted, 'middle double-click fits');
    return JSON.stringify(g);
  });

  step('rfLI: a map moves the gestures (middle pans, Shift + middle rotates, the wheel reversed); keys it does not name stay SolidWorks; setNavMap(null) restores', async function () {
    await rfLIPart();
    try {
      var r = UI.setNavMap({ drag: { 'middle': 'pan', 'shift+middle': 'rotate' }, wheel: { zoom: -1 } });
      assert(r.drag.middle === 'pan' && r.drag['shift+middle'] === 'rotate' && r.drag['ctrl+middle'] === 'pan' && r.wheel.zoom === -1 && r.wheel.about === 'cursor' && r.middleDouble === 'fit', 'resolved ' + JSON.stringify(r));
      var p = rfLIMid(), c;
      UI.setView('Front'); UI.zoomToFit();
      c = rfLICam(); rfLIDrag(1, p, 40, 20); assert(rfLIDid(c) === 'pan', 'middle drag pans: ' + rfLIDid(c));
      UI.setView('Front'); UI.zoomToFit();
      c = rfLICam(); rfLIDrag(1, p, 40, 0, { shiftKey: true }); assert(rfLIDid(c) === 'rotate', 'Shift + middle rotates: ' + rfLIDid(c));
      near(UI.cam.target.distanceTo(c.target), 0, 1e-9, 'the rotate keeps the target');
      UI.setView('Front'); UI.zoomToFit();
      c = rfLICam(); rfLIDrag(1, p, 30, 10, { ctrlKey: true }); assert(rfLIDid(c) === 'pan', 'Ctrl + middle (not named) still pans: ' + rfLIDid(c));
      var k = rfLIWheel(rfLIPt(UI.size.w * 0.3, UI.size.h * 0.4), -100);
      near(k, 1.12, 1e-9, 'the wheel is reversed: one notch away from you zooms out');
      // wheel about the centre, and a map with no middle double-click
      UI.setNavMap({ wheel: { about: 'center' }, middleDouble: null });
      UI.setView('Front'); UI.zoomToFit();
      var cw = UI.screenToPlane(UI.size.w / 2, UI.size.h / 2, K.makePlane('Front', 0));
      rfLIEv('wheel', [20, 20], { deltaY: -100 });
      var cw1 = UI.screenToPlane(UI.size.w / 2, UI.size.h / 2, K.makePlane('Front', 0));
      near(cw1[0], cw[0], 1e-6, 'about the centre x'); near(cw1[1], cw[1], 1e-6, 'about the centre y');
      assert(!rfLIMiddleDouble().fitted, 'middleDouble null: a middle double-click does not fit');
      // an unbound middle press does nothing
      UI.setNavMap({ drag: { 'middle': null } });
      UI.setView('Front'); UI.zoomToFit();
      c = rfLICam(); rfLIDrag(1, p, 40, 20); assert(rfLIDid(c) === 'none', 'unbound middle drag: ' + rfLIDid(c));
    } finally { UI.setNavMap(null); }
    var g = rfLIGestures();
    assert(g.middle === 'rotate' && g.ctrlMiddle === 'pan' && g.shiftMiddle === 'zoom', 'restored ' + JSON.stringify(g));
    near(g.wheelIn, 1 / 1.12, 1e-9, 'wheel direction restored');
    assert(rfLIMiddleDouble().fitted, 'middle double-click fits again');
  });

  step('rfLI: the drawing sheet reads the same map: middle drag pans, the wheel zooms about the cursor; reversed wheel and an unbound middle under a map; a rotate binding pans the sheet', async function () {
    await rfLIPart();
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    var st = UI.drawing.state, host = D.getElementById('drawing-sheet'), svg = host.querySelector('svg'), r = host.getBoundingClientRect();
    var c = [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
    function ev(type, xy, o) { (type === 'mousedown' || type === 'wheel' ? svg : W).dispatchEvent(new (type === 'wheel' ? W.WheelEvent : W.MouseEvent)(type, Object.assign({ bubbles: true, cancelable: true, clientX: xy[0], clientY: xy[1] }, o || {}))); }
    function mdrag(o) {
      st.mmbAt = 0;   // not a double-click with the last press
      ev('mousedown', c, Object.assign({ button: 1, buttons: 4 }, o)); ev('mousemove', [c[0] + 30, c[1] + 15], Object.assign({ buttons: 4 }, o)); ev('mouseup', [c[0] + 30, c[1] + 15], Object.assign({ button: 1, buttons: 0 }, o));
    }
    function vb() { return JSON.parse(JSON.stringify(st.vb)); }
    function wheel(dy) { var a = vb(); ev('wheel', [c[0] - 60, c[1] - 30], { deltaY: dy }); return st.vb.w / a.w; }
    try {
      UI.drawing.fit();
      var a = vb(); mdrag(); assert(st.vb.x !== a.x && st.vb.w === a.w, 'default: middle drag pans the sheet ' + JSON.stringify([a, st.vb]));
      a = vb(); mdrag({ shiftKey: true }); assert(st.vb.x !== a.x && st.vb.w === a.w, 'default: Shift + middle pans the sheet as before');
      near(wheel(-100), 1 / 1.15, 1e-9, 'default: one notch away from you zooms the sheet in');
      UI.setNavMap({ drag: { 'middle': 'pan', 'shift+middle': 'rotate' }, wheel: { zoom: -1 } });
      a = vb(); mdrag(); assert(st.vb.x !== a.x && st.vb.w === a.w, 'map: middle drag pans');
      a = vb(); mdrag({ shiftKey: true }); assert(st.vb.x !== a.x && st.vb.w === a.w, 'map: Shift + middle (rotate) pans the sheet');
      near(wheel(-100), 1.15, 1e-9, 'map: the wheel is reversed on the sheet');
      UI.setNavMap({ drag: { 'middle': null } });
      a = vb(); mdrag(); assert(st.vb.x === a.x && st.vb.y === a.y, 'unbound middle: the sheet stays');
    } finally { UI.setNavMap(null); UI.closeDrawing(); }
  });

  step('rfLI: in a sketch with the Line tool, navigation by the map places no points and the tool stays; a right click still opens the menu under a map that binds right drag', async function () {
    await rfLIPart();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var f = UI.activeSketchFeature(), n0 = f.entities.length, p = rfLIMid(), c;
    UI.setTool('line');
    try {
      UI.setNavMap({ drag: { 'middle': 'pan', 'shift+middle': 'rotate', 'alt+left': 'zoom', 'right': 'rotate' }, wheel: { zoom: -1 } });
      c = rfLICam(); rfLIDrag(1, p, 40, 20); assert(rfLIDid(c) === 'pan', 'middle pans in the sketch: ' + rfLIDid(c));
      c = rfLICam(); rfLIDrag(0, p, 0, -40, { altKey: true }); assert(rfLIDid(c) === 'zoom', 'Alt + left zooms in the sketch: ' + rfLIDid(c));
      c = rfLICam(); rfLIDrag(1, p, 40, 0, { shiftKey: true }); assert(rfLIDid(c) === 'rotate', 'Shift + middle rotates in the sketch: ' + rfLIDid(c));
      rfLIEv('wheel', p, { deltaY: -100 });
      assert(UI.App.tool === 'line', 'the Line tool stays: ' + UI.App.tool);
      assert(!(UI.App.toolState.pts && UI.App.toolState.pts.length), 'no point placed: ' + JSON.stringify(UI.App.toolState.pts));
      assert(f.entities.length === n0, 'no entity added (' + n0 + ' → ' + f.entities.length + ')');
      UI.setTool('select');
      if (UI.exitSketch) await UI.exitSketch(); await idle();
      // part mode: a right drag rotates (the map), a right click opens the graphics-area menu over the model
      UI.setView('Front'); UI.zoomToFit();
      c = rfLICam(); rfLIDrag(2, p, 40, 0); assert(rfLIDid(c) === 'rotate', 'right drag rotates under the map: ' + rfLIDid(c));
      UI.setView('Front'); UI.zoomToFit();
      UI.closeMenus();
      rfLIEv('mousedown', p, { button: 2, buttons: 2 }); rfLIEv('mouseup', p, { button: 2, buttons: 0 }); rfLIEv('contextmenu', p, { button: 2, buttons: 0 });
      var menus = D.querySelectorAll('body > .menu'), m = menus[menus.length - 1];
      var rows = m ? Array.prototype.map.call(m.querySelectorAll('.mi'), function (x) { return x.textContent; }) : [];
      assert(rows.some(function (t) { return t.indexOf('Select Other') >= 0; }), 'right click menu: ' + JSON.stringify(rows));
      UI.closeMenus();
    } finally { UI.setNavMap(null); }
    assert(UI.navMap().drag.right === 'pan', 'reset');
  });
