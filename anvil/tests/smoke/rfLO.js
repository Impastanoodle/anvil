  // --- rfLO (lane mcdirect, 2026-11-11): no greyed drawing tools; Mastercam's direct wireframe and graphics window ---
  // User: "update all the greyed out settings to actually work" and the Mastercam profile should feel like Mastercam.
  // (a) SolidWorks: a sketch tool with no sketch open asks for a plane (Edit Sketch) or uses the preselected face;
  // (b) a profile with wireframe.direct draws at once on the construction plane (UI.cplane / UI.setCplane);
  // (c) a profile with a viewport section: labels, quick masks, selection bar, Mastercam's right-click menu, no
  // heads-up toolbar; (d) a profile switch closes the direct geometry. Real mouse / key events; every step ends on
  // SolidWorks with the construction plane on Top and no masks.
  var RFLO_PROFILE = {
    id: 'rflo-test', name: 'rfLO test',
    wireframe: { direct: true, plane: 'Top' },
    viewport: { background: ['#1c1c1c', '#b8b8b8'], labels: true, headsUp: false, quickMasks: true, selectionBar: true, contextMenu: 'mastercam' }
  };
  function rfLOEv(type, p, target, mods) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  // a click where a real mouse would land: the press goes to the element on top at that point (a strip, a label or
  // the canvas), so anything covering the graphics area would take it
  function rfLOClick(p, mods) {
    var r = $('viewport').getBoundingClientRect(), t = D.elementFromPoint(Math.round(r.left + p[0]), Math.round(r.top + p[1]));
    rfLOEv('mousemove', p, null, Object.assign({ buttons: 0 }, mods || {}));
    rfLOEv('mousedown', p, t || $('viewport'), mods);
    rfLOEv('mouseup', p, null, mods);
    return t;
  }
  function rfLOKey(k) { D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  function rfLORb(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === label; })[0]; }
  async function rfLOTool(label, tool) {
    UI.setRibbonTab('Sketch'); await idle();
    var b = rfLORb(label);
    assert(b, 'no ' + label + ' button on the Sketch tab');
    assert(!b.disabled, label + ' is greyed with no sketch open');
    b.click(); await idle();
    return b;
  }
  async function rfLOUntil(fn, what, ms) { var t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > (ms || 2000)) throw new Error('timed out waiting: ' + (typeof what === 'function' ? what() : what)); await wait(10); } }
  async function rfLOSettle() { var t0 = Date.now(); while (UI.viewAnimating && UI.viewAnimating() && Date.now() - t0 < 3000) await wait(30); await idle(); }
  function rfLOScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfLOSketches() { return UI.App.model.features.filter(function (f) { return f.type === 'sketch'; }); }
  async function rfLOReset() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (UI.setQuickMask) UI.setQuickMask('clear');
    if (UI.selectionBarMode) UI.selectionBarMode('single');
    anvil.profile('solidworks');
    if (UI.Profiles.get('rflo-test')) UI.Profiles.unregister('rflo-test');
    if (UI.setCplane) UI.setCplane('Top');
    if (UI.closeMenus) UI.closeMenus();
  }
  // a screen point where the plane `ref` is picked and no face is
  function rfLOPlanePoint(ref) {
    for (var y = 30; y < UI.size.h - 30; y += 9) for (var x = 30; x < UI.size.w - 30; x += 9) {
      var pk = UI.pickPlane(x, y);
      if (pk && pk.ref === ref && !UI.pickFace(x, y)) return [x, y];
    }
    return null;
  }
  function rfLOMenuRows() { return Array.prototype.map.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m; }); }
  function rfLOMenuRow(label) { return rfLOMenuRows().filter(function (m) { return m.textContent.replace(/[▸✓]/g, '').trim() === label; })[0]; }

  step('rfLO: (a) SolidWorks, no sketch: Line is enabled; a click asks for a plane (Edit Sketch), the Front plane picked by mouse opens a sketch with Line on, two clicks draw one line and the tool stays; Esc at the prompt cancels cleanly', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      UI.setView('Isometric'); await rfLOSettle();
      var n0 = rfLOSketches().length;
      // Esc at the prompt: nothing is left, and a later Sketch does not start the tool
      await rfLOTool('Line');
      assert(UI.pmTitle() === 'Edit Sketch' && UI.App.mode !== 'sketch', 'the Edit Sketch prompt: ' + UI.pmTitle() + ' / ' + UI.App.mode);
      rfLOKey('Escape'); await idle();
      assert(!UI.hasPM() && UI.App.mode !== 'sketch' && rfLOSketches().length === n0, 'Esc cancelled: ' + UI.pmTitle() + ' ' + UI.App.mode);
      await UI.newSketchOnPlane('Front'); await idle();
      assert(UI.App.mode === 'sketch' && UI.App.tool === 'select', 'a plain Sketch after the cancelled prompt has no tool on: ' + UI.App.tool);
      await UI.exitSketch(true); await idle();
      UI.setView('Isometric'); await rfLOSettle();
      // the prompt again, the Front plane picked by mouse
      await rfLOTool('Line');
      assert(UI.pmTitle() === 'Edit Sketch' && /plane/i.test($('pm').textContent), 'prompt names the plane: ' + UI.pmTitle());
      var p = null;
      await rfLOUntil(function () { return !!(p = rfLOPlanePoint('Front')); }, 'the Front plane is shown under the prompt');
      assert(p, 'the Front plane is shown under the prompt');
      rfLOClick(p); await idle(); await rfLOSettle();
      var f = UI.activeSketchFeature();
      assert(UI.App.mode === 'sketch' && f && f.plane && f.plane.ref === 'Front', 'a sketch on Front: ' + JSON.stringify(f && f.plane));
      assert(UI.App.tool === 'line', 'the Line tool is on: ' + UI.App.tool);
      var c = [UI.size.w / 2, UI.size.h / 2];
      rfLOClick([c[0] - 70, c[1] + 25]); await idle();
      rfLOClick([c[0] + 60, c[1] - 35]); await idle();
      assert(f.entities.length === 1 && f.entities[0].t === 'line', 'one line: ' + JSON.stringify(f.entities));
      assert(UI.App.tool === 'line', 'the tool stays on: ' + UI.App.tool);
      assert(rfLOSketches().length === n0 + 1, 'one new sketch');
      rfLOKey('Escape'); await idle();
      await UI.exitSketch(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'Edit Sketch prompt, Front picked, ' + f.name + ' with one line';
    } finally { await rfLOReset(); }
  });

  step('rfLO: (a) SolidWorks: with a planar face preselected by mouse, Line opens the sketch on that face with the tool on', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      await anvil.run('p.box(40, 40, 20, { centered: true });'); await idle();
      UI.setView('Isometric'); await rfLOSettle(); UI.zoomToFit(); await rfLOSettle();
      var A = rfAYFace();
      assert(A, 'a visible face');
      rfLOClick(A.scr); await idle();
      assert(UI.App.sel && UI.App.sel.kind === 'face' && UI.App.sel.index === A.index, 'the face is selected: ' + JSON.stringify(UI.App.sel && UI.App.sel.kind));
      await rfLOTool('Line'); await idle(); await rfLOSettle();
      var pl = UI.activePlane();
      assert(UI.App.mode === 'sketch' && UI.pmTitle() !== 'Edit Sketch', 'no prompt, a sketch: ' + UI.App.mode + ' / ' + UI.pmTitle());
      assert(Math.abs(K.vec.dot(pl.n, A.normal) - 1) < 1e-9, 'on the face: ' + JSON.stringify(pl.n) + ' vs ' + JSON.stringify(A.normal));
      assert(UI.App.tool === 'line', 'Line on: ' + UI.App.tool);
      assert(!$('exit-sketch').hidden && W.getComputedStyle($('exit-sketch')).display !== 'none', 'SolidWorks keeps the confirmation corner');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'face ' + A.index;
    } finally { await rfLOReset(); }
  });

  step('rfLO: (b) wireframe.direct: the line tool and two clicks draw a line on Top with no prompt; setCplane(Front) and a circle make a second sketch on Front; Extrude takes it (analytic volume); the generated script rebuilds the same part', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      UI.Profiles.register(RFLO_PROFILE); anvil.profile('rflo-test'); await idle();
      assert(UI.cplane() === 'Top', 'the construction plane starts on Top: ' + UI.cplane());
      UI.setView('Isometric'); await rfLOSettle();
      var q0 = UI.camera.quaternion.clone(), n0 = rfLOSketches().length;
      await rfLOTool('Line');
      assert(UI.pmTitle() !== 'Edit Sketch' && UI.App.mode === 'sketch' && UI.App.tool === 'line', 'drawing at once: ' + UI.pmTitle() + ' / ' + UI.App.mode + ' / ' + UI.App.tool);
      assert(UI.directWireframe().open, 'the direct geometry is open');
      assert(W.getComputedStyle($('exit-sketch')).display === 'none', 'no confirmation corner');
      var c = [UI.size.w / 2, UI.size.h / 2];
      rfLOClick([c[0] - 60, c[1] + 10]); await idle();
      rfLOClick([c[0] + 50, c[1] - 20]); await idle();
      var f1 = UI.activeSketchFeature();
      assert(f1.plane.ref === 'Top' && f1.entities.length === 1 && f1.entities[0].t === 'line', 'a line on Top: ' + JSON.stringify(f1.plane) + ' ' + JSON.stringify(f1.entities));
      assert(/^Sketch\d+$/.test(f1.name), 'named as sketches are: ' + f1.name);
      assert(UI.camera.quaternion.angleTo(q0) < 1e-6, 'the view stays');
      assert(UI.App.tool === 'line', 'the tool stays on');
      // a new construction plane: this geometry closes, the next starts on Front with the same tool
      UI.setCplane('Front'); await idle();
      var f2 = UI.activeSketchFeature();
      assert(f2 && f2.id !== f1.id && f2.plane.ref === 'Front' && UI.App.tool === 'line', 'second sketch on Front with Line: ' + JSON.stringify(f2 && f2.plane) + ' ' + UI.App.tool);
      assert(K.findFeature(UI.App.model, f1.id).entities.length === 1, 'the Top line is kept');
      // a second tool goes on in the same geometry
      await rfLOTool('Circle');
      assert(UI.activeSketchFeature() === f2 && UI.App.tool === 'circle', 'Circle in the same sketch: ' + UI.App.tool);
      var pl = UI.activePlane(), m = UI.screenToPlane(c[0], c[1], pl), R = 130 * UI.cam.scale;
      rfLOClick(UI.worldToScreen(K.to3D(pl, m[0], m[1]))); await idle();
      var rimT = rfLOClick(UI.worldToScreen(K.to3D(pl, m[0] + R, m[1]))); await idle();
      if (!f2.entities.length) throw new Error('rim click went to ' + (rimT && (rimT.tagName + '#' + rimT.id + '.' + rimT.className)) + ' at ' + UI.worldToScreen(K.to3D(pl, m[0] + R, m[1])).map(Math.round) + ' centre ' + c.map(Math.round));
      assert(f2.entities.length === 1 && f2.entities[0].t === 'circle', 'a circle on Front: ' + JSON.stringify(f2.entities) + ' active ' + (UI.activeSketchFeature() && UI.activeSketchFeature().id) + '/' + f2.id + ' tool ' + UI.App.tool + ' pts ' + JSON.stringify(UI.App.toolState) + ' status ' + statusText() + ' pm ' + UI.pmTitle());
      var r = f2.entities[0].r;
      assert(UI.App.tool === 'circle', 'Circle stays on');
      // a solids command closes the geometry and takes it (Mastercam's chain)
      UI.cmdExtrude(); await idle();
      await rfLOUntil(function () { return UI.pmTitle() === 'Boss-Extrude'; }, function () { return 'Boss-Extrude: ' + UI.pmTitle(); });
      assert(UI.App.mode !== 'sketch' && UI.pmTitle() === 'Boss-Extrude', 'Extrude on the closed geometry: ' + UI.App.mode + ' / ' + UI.pmTitle());
      setInput(D.querySelector('#pm input[data-key="depth"]'), 10); await idle();
      await pmAccept(); await idle();
      var ex = UI.App.model.features[UI.App.model.features.length - 1];
      assert(ex.type === 'extrude' && ex.sketch === f2.id, 'the extrude uses ' + f2.name + ': ' + JSON.stringify({ t: ex.type, s: ex.sketch }));
      var vol = K.massProps(UI.App.mesh, 1).volume, want = Math.PI * r * r * 10;
      near(vol, want, 1e-6 * want, 'π r² × 10');
      var script = anvil.script(), mm = K.newModel('rt'); K.runScript(mm, script);
      var mp = K.massProps(K.meshFromBody(K.rebuild(mm).body), 1);
      near(mp.volume, want, 1e-6 * want, 'script round trip');
      assert(mm.features.filter(function (g) { return g.type === 'sketch'; }).length === n0 + 2, 'both sketches in the script');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'r ' + r.toFixed(4) + ', volume ' + vol.toFixed(4);
    } finally { await rfLOReset(); }
  });

  step('rfLO: (b) direct geometry: Esc puts the tool down, Esc again closes it; an empty one is discarded; Back / Bottom / Left are custom frames looking as those views', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      UI.Profiles.register(RFLO_PROFILE); anvil.profile('rflo-test'); await idle();
      var n0 = rfLOSketches().length;
      await rfLOTool('Line');
      assert(UI.App.mode === 'sketch', 'open');
      rfLOKey('Escape'); await idle();
      assert(UI.App.mode === 'sketch' && UI.App.tool === 'select', 'first Esc: the tool down, still open (' + UI.App.mode + ' ' + UI.App.tool + ')');
      rfLOKey('Escape'); await idle();
      assert(UI.App.mode !== 'sketch' && rfLOSketches().length === n0, 'second Esc closes it, empty: discarded');
      ['Back', 'Bottom', 'Left'].forEach(function (n) {
        var sp = UI.cplaneSketchPlane(n), v = UI.VIEWS[n], d = K.vec.norm(v[0]);
        assert(sp.custom && Math.abs(K.vec.dot(sp.n, d) - 1) < 1e-12 && Math.abs(K.vec.dot(sp.y, v[1]) - 1) < 1e-12, n + ': ' + JSON.stringify(sp));
        near(K.vec.dot(K.vec.cross(sp.y, sp.n), sp.x), 1, 1e-12, n + ' x = y × n');
      });
      assert(UI.setCplane('Nowhere') === 'Top', 'an unknown plane is refused');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'ok';
    } finally { await rfLOReset(); }
  });

  step('rfLO: (c) viewport section: the gradient, labels follow setCplane and the view, the heads-up toolbar hidden (back on SolidWorks), the right-click menu is Mastercam\'s and Fit / Top (WCS) work', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      await anvil.run('p.box(40, 40, 20, { centered: true });'); await idle();
      assert(!D.getElementById('vp-labels') || D.getElementById('vp-labels').hidden, 'no labels under SolidWorks');
      assert(W.getComputedStyle($('hud')).display !== 'none', 'heads-up toolbar under SolidWorks');
      UI.Profiles.register(RFLO_PROFILE); anvil.profile('rflo-test'); await idle();
      var gv = $('viewport').style.getPropertyValue('--viewport');
      assert(/linear-gradient/.test(gv) && /#1c1c1c/i.test(gv) && /#b8b8b8/i.test(gv), 'the gradient: ' + gv);
      assert(/linear-gradient/.test(W.getComputedStyle($('viewport')).backgroundImage), 'drawn: ' + W.getComputedStyle($('viewport')).backgroundImage);
      assert(W.getComputedStyle($('hud')).display === 'none', 'heads-up toolbar hidden');
      // no fixed sleeps: each check waits for its condition (at most 2 s); the labels follow the camera at once
      UI.setView('Top'); await rfLOSettle();
      var lab = D.getElementById('vp-labels');
      function L(k) { var e = lab && lab.querySelector('[data-label="' + k + '"]'); return e ? e.textContent : null; }
      assert(lab && !lab.hidden, 'the labels are shown');
      await rfLOUntil(function () { return L('gview') === 'Top' && L('cplane') === 'Top'; }, 'labels Top / Top: ' + lab.textContent);
      UI.setCplane('Front');
      assert(L('cplane') === 'Front' && L('tplane') === 'Front', 'C / T follow setCplane at once: ' + lab.textContent);
      UI.setView('Isometric');
      assert(L('gview') === 'Isometric', 'Gview follows the view at once: ' + lab.textContent);
      await rfLOSettle();
      UI.rotateView(30, 10);
      assert(L('gview') === 'Not saved', 'a free view: ' + lab.textContent);
      // the labels sit right of the triad, the scale lower right
      var tr = $('triad').getBoundingClientRect(), lr = lab.getBoundingClientRect();
      assert(lr.left >= tr.right - 0.5, 'labels clear of the triad: ' + lr.left + ' / ' + tr.right);
      assert(!$('scale-bar').hidden && /\d/.test($('scale-bar-label').textContent), 'the scale readout');
      // right-click on empty graphics, after a right press left over from an earlier gesture far away
      UI.setView('Front'); await rfLOSettle(); UI.zoomView(3);
      var empty = null;
      for (var y = 60; y < UI.size.h - 60 && !empty; y += 10) for (var x = 60; x < UI.size.w - 60; x += 10) if (!UI.pickFacesAll(x, y).length) { empty = [x, y]; break; }
      assert(empty, 'an empty spot');
      rfLOEv('mousedown', [UI.size.w - 40, UI.size.h - 40], $('viewport'), { button: 2, buttons: 2 }); rfLOEv('mouseup', [UI.size.w - 40, UI.size.h - 40], null, { button: 2, buttons: 0 });
      if (UI.closeMenus) UI.closeMenus();
      rfLOEv('contextmenu', empty, $('viewport'), { button: 2, buttons: 0 });
      var want = ['Zoom Window', 'Unzoom 80 %', 'Dynamic Rotation', 'Fit', 'Top (WCS)', 'Front (WCS)', 'Right (WCS)', 'Isometric (WCS)', 'GView', 'Delete Entities', 'Analyze Distance', 'Analyze Entity Properties'];
      function rows() { return rfLOMenuRows().map(function (m) { return m.textContent.replace(/[▸✓]/g, '').trim(); }); }
      await rfLOUntil(function () { return rows().length > 0; }, 'a menu opened');
      var got = rows();
      want.forEach(function (w) { assert(got.indexOf(w) >= 0, 'menu lacks ' + w + ': ' + got.join(' | ')); });
      var s0 = UI.cam.scale;
      rfLOMenuRow('Fit').dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await rfLOSettle();
      assert(UI.cam.scale < s0 * 0.6, 'Fit zoomed back in on the part: ' + s0 + ' -> ' + UI.cam.scale);
      // on the model the same list (Mastercam has no Select Other there)
      var on = UI.worldToScreen([0, 0, 10]);
      assert(UI.pickFacesAll(on[0], on[1]).length, 'the part is under ' + on);
      rfLOEv('contextmenu', on, $('viewport'), { button: 2, buttons: 0 });
      await rfLOUntil(function () { return !!rfLOMenuRow('Top (WCS)'); }, 'the menu on the model: ' + rows().join(' | '));
      rfLOMenuRow('Top (WCS)').dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await rfLOSettle();
      assert(UI.cam.dir.y > 1 - 1e-9, 'Top (WCS): ' + UI.cam.dir.toArray());
      if (UI.closeMenus) UI.closeMenus();
      // back on SolidWorks: everything as before
      anvil.profile('solidworks'); await idle();
      assert(W.getComputedStyle($('hud')).display !== 'none', 'heads-up toolbar back');
      assert(!$('viewport').style.getPropertyValue('--viewport'), 'SolidWorks gradient back');
      assert(lab.hidden && D.getElementById('vp-qmask').hidden && D.getElementById('vp-selbar').hidden, 'no Mastercam furniture under SolidWorks');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return got.length + ' menu rows';
    } finally { await rfLOReset(); }
  });

  step('rfLO: (c) quick masks by click: each blocks and allows its kind (points, lines, arcs, splines, dimensions, faces, edges, bodies); a face next to each strip still takes the click', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      await anvil.run('p.box(200, 200, 20, { centered: true });'); await idle();
      UI.Profiles.register(RFLO_PROFILE); anvil.profile('rflo-test'); await idle();
      await rfLOUntil(function () { var q = D.getElementById('vp-qmask'); return q && !q.hidden; }, 'the quick masks are built');
      var strip = D.getElementById('vp-qmask'), bar = D.getElementById('vp-selbar');
      assert(strip && !strip.hidden && strip.querySelectorAll('button[data-qmask]').length >= 8, 'the quick-mask column');
      function maskBtn(k) { return strip.querySelector('button[data-qmask="' + k + '"]'); }
      // geometry: line, circle, point, spline, one dimension on the line
      var f = await (async function () {
        var g = { id: UI.App.model.nextId++, type: 'sketch', name: 'Sketch9', plane: { ref: 'Front', offset: 30 }, entities: [
          { t: 'line', x1: -60, y1: -40, x2: -10, y2: -40 }, { t: 'circle', cx: 40, cy: 30, r: 12 }, { t: 'point', x: -50, y: 40 },
          { t: 'ellipse', cx: 30, cy: -60, rx: 20, ry: 8, rot: 0 }], dims: [{ e: 0, k: 'len', off: -12 }] };
        UI.App.model.features.push(g); UI.rebuild(); await idle();
        UI.enterSketch(g.id); await rfLOSettle(); UI.zoomToFit(); await rfLOSettle();
        return g;
      })();
      var at = { lines: rfLOScr([-45, -40]), arcs: rfLOScr([52, 30]), points: rfLOScr([-50, 40]) };
      at.splines = rfLOScr([30 + 20 * Math.cos(1.0), -60 + 8 * Math.sin(1.0)]);
      function picked() { var s = UI.selection(); return s.length === 1 && s[0].kind === 'entity' ? f.entities[s[0].index].t : s.length ? s.map(function (x) { return x.kind; }).join(',') : 'none'; }
      async function clickAt(p) { UI.setSelection([]); if (UI.hasPM()) UI.closePM(); rfLOClick(p); await idle(); return picked(); }
      var T = { lines: 'line', arcs: 'circle', points: 'point', splines: 'ellipse' }, keys = Object.keys(T);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        maskBtn(k).click(); await idle();
        assert(UI.quickMasks()[k] && maskBtn(k).classList.contains('on'), k + ' mask on');
        for (var j = 0; j < keys.length; j++) {
          var got = await clickAt(at[keys[j]]);
          if (keys[j] === k) assert(got === T[k], k + ' mask: its ' + T[k] + ' takes the click: ' + got);
          else assert(got === 'none', k + ' mask: the ' + T[keys[j]] + ' is blocked: ' + got);
        }
        maskBtn(k).click(); await idle();
      }
      // dimensions: with only Lines masked a label lets the click through; with Dimensions masked too it takes it
      UI.drawDims();
      await rfLOUntil(function () { return !!D.querySelector('#dim-layer .dim text'); }, 'a dimension label');
      var lt = D.querySelector('#dim-layer .dim text');
      assert(lt, 'a dimension label');
      var lb = lt.getBoundingClientRect(), vr = $('viewport').getBoundingClientRect(), lp = [lb.left + lb.width / 2 - vr.left, lb.top + lb.height / 2 - vr.top];
      maskBtn('lines').click(); await idle();
      var hit = D.elementFromPoint(lb.left + lb.width / 2, lb.top + lb.height / 2);
      assert(hit && hit.tagName.toLowerCase() !== 'text', 'Lines only: the label does not take the click (' + (hit && hit.tagName) + ')');
      maskBtn('dims').click(); await idle();
      hit = D.elementFromPoint(lb.left + lb.width / 2, lb.top + lb.height / 2);
      assert(hit && hit.tagName.toLowerCase() === 'text', 'Dimensions masked: the label takes the click (' + (hit && hit.tagName) + ')');
      rfLOClick(lp); await idle();
      assert(UI.App.sel && UI.App.sel.kind === 'dim', 'the dimension is selected: ' + JSON.stringify(UI.App.sel));
      maskBtn('clear').click(); await idle();
      assert(!Object.keys(UI.quickMasks()).some(function (q) { return UI.quickMasks()[q]; }), 'clear: none on');
      await UI.exitSketch(true); await idle();
      // the solid: faces, edges, bodies (Front view, the face fills the window)
      UI.App.model.features = UI.App.model.features.filter(function (g) { return g !== f; }); UI.rebuild(); await idle();
      UI.setView('Front'); await rfLOSettle(); UI.zoomToFit(); await rfLOSettle();
      var fz = UI.App.mesh.faces.filter(function (fc) { return fc.normal[2] > 0.999; })[0];
      assert(fz, 'the front face');
      var fs = UI.worldToScreen(fz.centroid);
      UI.zoomView(0.25, fs[0], fs[1]);
      vr = $('viewport').getBoundingClientRect();
      var mid = [UI.size.w * 0.45, UI.size.h * 0.55];
      function onFace(p) { var h = UI.pickFace(p[0], p[1]); return !!h && UI.App.mesh.faces[h.index].normal[2] > 0.999; }
      async function solidAt(p) { assert(onFace(p), 'the front face is under ' + p.map(Math.round) + ' (view ' + UI.cam.dir.toArray().map(function (x) { return x.toFixed(3); }) + ')'); UI.setSelection([]); rfLOClick(p); await idle(); var s = UI.selection(); return s.length ? s[0].kind : 'none'; }
      var r0 = await solidAt(mid);
      assert(r0 === 'face', 'no mask: the face: ' + r0);
      maskBtn('edges').click(); await idle();
      assert(await solidAt(mid) === 'none', 'Solid Edges: the face is blocked');
      maskBtn('edges').click(); maskBtn('faces').click(); await idle();
      assert(await solidAt(mid) === 'face', 'Solid Faces: the face');
      maskBtn('faces').click(); maskBtn('bodies').click(); await idle();
      assert(await solidAt(mid) === 'body', 'Solid Bodies: the body');
      maskBtn('bodies').click(); await idle();
      // next to each strip the face still takes the click
      var sr = strip.getBoundingClientRect(), br = bar.getBoundingClientRect(), lr = D.getElementById('vp-labels').getBoundingClientRect();
      var near1 = [sr.left - vr.left - 6, (sr.top + sr.bottom) / 2 - vr.top], near2 = [br.left - vr.left + 30, br.bottom - vr.top + 6], near3 = [lr.left - vr.left + 30, lr.top - vr.top - 6];
      [near1, near2, near3].forEach(function () { });
      assert(await solidAt(near1) === 'face', 'left of the quick masks: the face');
      assert(await solidAt(near2) === 'face', 'under the selection bar: the face');
      assert(await solidAt(near3) === 'face', 'over the labels: the face');
      // nothing overlaps the triad or the scale
      var tr = $('triad').getBoundingClientRect(), sc = $('scale-bar').getBoundingClientRect();
      function apart(a, b) { return a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5; }
      assert(apart(sr, sc) && apart(sr, tr) && apart(br, tr) && apart(lr, tr) && apart(lr, sc), 'strips clear of the triad and the scale');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'masks ok';
    } finally { await rfLOReset(); }
  });

  step('rfLO: (c) the selection bar: AutoCursor is Enable Snapping, Chain mode selects a chain by one click, Polygon is Lasso, Select All / Clear', async function () {
    var errs0 = errors.length, snap0 = UI.sketchSettings.get('snapping');
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      UI.Profiles.register(RFLO_PROFILE); anvil.profile('rflo-test'); await idle();
      await rfLOUntil(function () { var q = D.getElementById('vp-selbar'); return q && !q.hidden; }, 'the selection bar is built');
      var bar = D.getElementById('vp-selbar');
      function sb(k) { return bar.querySelector('[data-sb="' + k + '"]'); }
      assert(bar && !bar.hidden && sb('autocursor') && sb('mode-chain') && sb('all') && sb('clear'), 'the selection bar');
      sb('autocursor').click(); await idle();
      assert(UI.sketchSettings.get('snapping') === !snap0 && sb('autocursor').classList.contains('on') === !snap0, 'AutoCursor toggles Enable Snapping');
      sb('autocursor').click(); await idle();
      assert(UI.sketchSettings.get('snapping') === snap0, 'and back');
      var g = { id: UI.App.model.nextId++, type: 'sketch', name: 'Sketch9', plane: { ref: 'Front', offset: 0 }, entities: [
        { t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 30 }, { t: 'line', x1: 40, y1: 30, x2: 0, y2: 30 }, { t: 'circle', cx: -30, cy: 10, r: 5 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }] };
      UI.App.model.features.push(g); UI.rebuild(); await idle();
      UI.enterSketch(g.id); await rfLOSettle(); UI.zoomToFit(); await rfLOSettle();
      sb('mode-chain').click(); await idle();
      assert(UI.selectionBarMode() === 'chain' && sb('mode-chain').classList.contains('on'), 'Chain mode');
      rfLOClick(rfLOScr([12, 0])); await idle();
      var sel = UI.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort();
      assert(sel.join(',') === '0,1,2', 'one click takes the chain: ' + sel);
      sb('mode-polygon').click(); await idle();
      assert(UI.selectionBarMode() === 'polygon', 'Polygon mode');
      sb('mode-single').click(); await idle();
      sb('all').click(); await idle();
      assert(UI.selection().filter(function (s) { return s.kind === 'entity'; }).length === 4, 'Select All: ' + UI.selection().length);
      sb('clear').click(); await idle();
      assert(UI.selection().length === 0, 'Clear');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'ok';
    } finally { UI.sketchSettings.set('snapping', snap0); await rfLOReset(); }
  });

  step('rfLO: (d) switching the profile with a direct wireframe open closes it cleanly (the geometry kept, no corner left, the tool down)', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      UI.Profiles.register(RFLO_PROFILE); anvil.profile('rflo-test'); await idle();
      UI.setView('Isometric'); await rfLOSettle();
      await rfLOTool('Line');
      var c = [UI.size.w / 2, UI.size.h / 2];
      rfLOClick([c[0] - 90, c[1] + 20]); await idle();
      rfLOClick([c[0] + 80, c[1] - 30]); await idle();
      var f = UI.activeSketchFeature();
      assert(f && f.entities.length === 1, 'a line');
      anvil.profile('solidworks'); await idle();
      assert(UI.App.mode !== 'sketch' && !UI.directWireframe().open, 'closed: ' + UI.App.mode);
      assert(K.findFeature(UI.App.model, f.id) && K.findFeature(UI.App.model, f.id).entities.length === 1, 'the line is kept');
      assert($('exit-sketch').hidden && !$('viewport').classList.contains('mc-direct'), 'no corner, no direct state');
      // under SolidWorks the same button asks for a plane again
      await rfLOTool('Line');
      assert(UI.pmTitle() === 'Edit Sketch', 'SolidWorks prompt: ' + UI.pmTitle());
      rfLOKey('Escape'); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return f.name + ' kept';
    } finally { await rfLOReset(); }
  });

  // --- rfLO (lane mcdirect2): the real mastercam profile, chosen through the setting, with lane mcframe's window ---
  // a real click at the middle of an element that must be on top there (press, release, click)
  function rfLOElClick(el, label, fx) {   // fx: where across the element (a quick mask is half off the edge: its visible half)
    assert(el, 'nothing to click: ' + label);
    var r = el.getBoundingClientRect(), x = Math.round(r.left + r.width * (fx || 0.5)), y = Math.round(r.top + r.height / 2), hit = D.elementFromPoint(x, y);
    assert(r.width > 0 && r.height > 0, label + ' is not shown');
    assert(hit && (hit === el || el.contains(hit)), label + ' is covered by ' + (hit && (hit.id || hit.className || hit.tagName)));
    ['mousedown', 'mouseup', 'click'].forEach(function (t) { el.dispatchEvent(new W.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, buttons: t === 'mousedown' ? 1 : 0, clientX: x, clientY: y, detail: 1 })); });
  }
  // Tools > Options… (SolidWorks' menu bar) or File > Options (Mastercam's backstage), then the profile's radio
  async function rfLOChooseProfile(id) {
    if (UI.frameBackstage && UI.frameBackstage.has && UI.frameBackstage.has()) {
      rfLOElClick($('mc-file'), 'File tab');
      await rfLOUntil(function () { return !!D.querySelector('#mc-backstage'); }, 'the backstage');
      var nav = Array.prototype.filter.call(D.querySelectorAll('#mc-backstage button'), function (b) { return b.textContent.trim() === 'Options'; })[0];
      rfLOElClick(nav, 'Options');
    } else {
      var tools = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (li) { return /^Tools/.test(li.textContent.trim()); })[0];
      assert(tools, 'no Tools menu');
      tools.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^\s*Options…/.test(m.textContent) && m.textContent.indexOf('▸') < 0; })[0];
      assert(row, 'no Tools > Options… row');
      row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    }
    var radio = null;
    await rfLOUntil(function () { radio = D.querySelector('[data-role="interface-profiles"] input[data-profile="' + id + '"]'); return !!radio; }, 'the ' + id + ' radio');
    radio.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    radio.click();
    await rfLOUntil(function () { return UI.Profiles.active() === id; }, 'profile ' + id);
    if (UI.frameBackstage && UI.frameBackstage.isOpen && UI.frameBackstage.isOpen()) UI.frameBackstage.close();
    if (UI.closeTaskPane) UI.closeTaskPane();
    await idle();
  }
  function rfLORect(el) { var r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }
  function rfLOApart(a, b) { return a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5; }
  function rfLOShown(el) { return !!el && !el.hidden && el.getClientRects().length > 0 && W.getComputedStyle(el).display !== 'none'; }

  step('rfLO: (e) Mastercam chosen in Tools > Options: labels, quick masks, selection bar and the right-click menu are there and work, beside mcframe\'s status bar, manager panel and viewsheet strip, none overlapping', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      await anvil.run('p.box(200, 200, 20, { centered: true });'); await idle();
      await rfLOChooseProfile('mastercam');
      assert(UI.frameDef && UI.frameDef(), 'mcframe\'s window frame is on');
      var lab = D.getElementById('vp-labels'), qm = D.getElementById('vp-qmask'), sb = D.getElementById('vp-selbar');
      assert(rfLOShown(lab) && rfLOShown(qm), 'labels / quick masks shown');
      assert(!rfLOShown(sb), 'no selection bar under the mastercam profile (user 2026-11-12: the bar is to go)');
      assert(W.getComputedStyle($('hud')).display === 'none', 'no heads-up toolbar');
      assert($('viewport').style.getPropertyValue('--viewport').indexOf(UI.Profiles.def('mastercam').viewport.background[0]) >= 0, 'Mastercam\'s gradient');   // lane mctheme: the top colour from the profile data (#141414, measured)
      UI.setView('Top'); await rfLOSettle();
      assert(lab.querySelector('[data-label="gview"]').textContent === 'Top' && lab.querySelector('[data-label="cplane"]').textContent === 'Top', 'labels: ' + lab.textContent);
      // nothing of this lane overlaps mcframe's status bar, manager panel or viewsheet strip, nor the gnomon / scale
      var vr = rfLORect($('viewport')), strip = { left: vr.left, right: vr.right, top: vr.bottom - 18, bottom: vr.bottom };
      var theirs = { status: rfLORect($('mc-status')), left: rfLORect($('left')), viewsheet: strip };
      var mine = { labels: rfLORect(lab), masks: rfLORect(qm), triad: rfLORect($('triad')), scale: rfLORect($('scale-bar')) };
      Object.keys(mine).forEach(function (m) {
        Object.keys(theirs).forEach(function (t) { assert(rfLOApart(mine[m], theirs[t]), m + ' overlaps ' + t + ': ' + JSON.stringify([mine[m], theirs[t]])); });
      });
      assert(rfLOApart(mine.labels, mine.triad) && rfLOApart(mine.labels, mine.scale) && rfLOApart(mine.masks, mine.scale), 'labels / masks clear of the gnomon and the scale');
      // quick masks: Solid Edges blocks the face, Solid Faces lets it through
      UI.setView('Front'); await rfLOSettle(); UI.zoomToFit(); await rfLOSettle();
      var fz = UI.App.mesh.faces.filter(function (fc) { return fc.normal[2] > 0.999; })[0], fs = UI.worldToScreen(fz.centroid);
      UI.zoomView(0.4, fs[0], fs[1]);
      var mid = [UI.size.w * 0.45, UI.size.h * 0.5];
      async function kindAt(p) { UI.setSelection([]); rfLOClick(p); await idle(); var s = UI.selection(); return s.length ? s[0].kind : 'none'; }
      rfLOElClick(qm.querySelector('[data-qmask="edges"]'), 'Solid Edges mask', 0.25); await idle();
      assert(await kindAt(mid) === 'none', 'Solid Edges: the face is blocked');
      rfLOElClick(qm.querySelector('[data-qmask="edges"]'), 'Solid Edges mask', 0.25); rfLOElClick(qm.querySelector('[data-qmask="faces"]'), 'Solid Faces mask', 0.25); await idle();
      assert(await kindAt(mid) === 'face', 'Solid Faces: the face');
      rfLOElClick(qm.querySelector('[data-qmask="clear"]'), 'clear masks', 0.25); await idle();
      // mcframe's status bar counts the selection (a click on the part; the selection bar's Select All did this until
      // the bar left the mastercam profile, 2026-11-12: step (c) still tests the bar through the test profile)
      rfLOClick(mid); await idle();
      assert(UI.selection().length === 1, 'a click selects one entity: ' + JSON.stringify(UI.selection().map(function (s) { return s.kind; })));
      await rfLOUntil(function () { return /1/.test(UI.frameStatus().selected || ''); }, function () { return 'SELECTED ENTITIES: ' + UI.frameStatus().selected; });
      UI.setSelection([], { quiet: true }); await idle();
      // Ctrl+A is Select All now that the bar is gone: the body, and the status bar counts it
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
      assert(UI.selection().length === 1 && UI.selection()[0].kind === 'body', 'Ctrl+A selects the body: ' + JSON.stringify(UI.selection().map(function (s) { return s.kind; })));
      UI.setSelection([], { quiet: true }); await idle();
      // the right-click menu, on the part, then Fit
      UI.zoomToFit(); await rfLOSettle(); var fitS = UI.cam.scale; UI.zoomView(3);
      var s0 = UI.cam.scale;
      rfLOEv('contextmenu', mid, $('viewport'), { button: 2, buttons: 0 });
      await rfLOUntil(function () { return !!rfLOMenuRow('Fit'); }, 'Mastercam\'s menu');
      assert(rfLOMenuRow('Zoom Window') && rfLOMenuRow('Analyze Entity Properties') && rfLOMenuRow('GView'), 'its rows');
      rfLOMenuRow('Fit').dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await rfLOSettle();
      assert(Math.abs(UI.cam.scale / fitS - 1) < 0.05 && s0 > fitS * 2, 'Fit: ' + s0 + ' -> ' + UI.cam.scale + ' (fit ' + fitS + ')');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'ok';
    } finally { await rfLOReset(); }
  });

  step('rfLO: (f) Mastercam: a C cell of the Planes manager and the CPLANE status list drive UI.setCplane; Line Endpoints from the Wireframe tab draws at once on that plane; back on SolidWorks nothing of either lane is left', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      await rfLOChooseProfile('mastercam');
      UI.setView('Isometric'); await rfLOSettle();
      rfLOElClick(D.querySelector('#mc-mgr-tabs [data-mgr="planes"]'), 'Planes tab');
      await rfLOUntil(function () { return rfLOShown($('mc-planes')) && !!D.querySelector('#mc-planes tr[data-plane="Front"] [data-col="c"]'); }, 'the Planes manager');
      rfLOElClick(D.querySelector('#mc-planes tr[data-plane="Front"] [data-col="c"]'), 'C of Front');
      assert(UI.cplane() === 'Front', 'the C cell set the construction plane: ' + UI.cplane());
      assert(D.getElementById('vp-labels').querySelector('[data-label="cplane"]').textContent === 'Front', 'the C label follows');
      await rfLOUntil(function () { return /Front/.test(UI.frameStatus().cplane || ''); }, function () { return 'CPLANE: ' + UI.frameStatus().cplane; });
      async function lineEndpoints() {
        var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent === 'Wireframe'; })[0];
        rfLOElClick(tab, 'Wireframe tab'); await idle();
        var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return /^Line\s*Endpoints$/.test(x.getAttribute('aria-label') || '') && x.offsetWidth; })[0];
        assert(b && !b.disabled, 'Line Endpoints enabled with no sketch open');
        rfLOElClick(b, 'Line Endpoints'); await idle();
        assert(UI.App.mode === 'sketch' && UI.App.tool === 'line' && UI.pmTitle() !== 'Edit Sketch', 'drawing at once: ' + UI.App.mode + ' ' + UI.App.tool + ' ' + UI.pmTitle());
        var c = [UI.size.w / 2, UI.size.h / 2];
        rfLOClick([c[0] - 90, c[1] + 25]); await idle();
        rfLOClick([c[0] + 80, c[1] - 30]); await idle();
        var f = UI.activeSketchFeature();
        assert(f && f.entities.length === 1 && f.entities[0].t === 'line', 'one line: ' + JSON.stringify(f && f.entities));
        rfLOKey('Escape'); await idle(); rfLOKey('Escape'); await idle();
        assert(UI.App.mode !== 'sketch', 'Esc, Esc closes it');
        return f;
      }
      var f1 = await lineEndpoints();
      assert(f1.plane.ref === 'Front', 'the line is on Front: ' + JSON.stringify(f1.plane));
      // the CPLANE item of the status bar: its list
      rfLOElClick(D.querySelector('#mc-status [data-mc="cplane"]'), 'CPLANE');
      await rfLOUntil(function () { return !!rfLOMenuRow('Right'); }, 'the plane list');
      rfLOMenuRow('Right').dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await idle();
      assert(UI.cplane() === 'Right', 'CPLANE list set Right: ' + UI.cplane());
      var f2 = await lineEndpoints();
      assert(f2.plane.ref === 'Right' && f2.id !== f1.id, 'the next line is on Right: ' + JSON.stringify(f2.plane));
      // Isometric from the table is a plane too
      rfLOElClick(D.querySelector('#mc-mgr-tabs [data-mgr="planes"]'), 'Planes tab');
      await rfLOUntil(function () { return !!D.querySelector('#mc-planes tr[data-plane="Isometric"] [data-col="c"]'); }, 'the table again');
      rfLOElClick(D.querySelector('#mc-planes tr[data-plane="Isometric"] [data-col="c"]'), 'C of Isometric');
      await rfLOUntil(function () { var r = D.querySelector('#mc-planes tr[data-plane="Isometric"]'); return UI.cplane() === 'Isometric' && r && r.classList.contains('current'); }, function () { return 'Isometric: ' + UI.cplane(); });
      // back on SolidWorks through the setting: nothing of either lane is left
      await rfLOChooseProfile('solidworks');
      var left = ['mc-file', 'mc-backstage', 'mc-mgr-head', 'mc-mgr-tabs', 'mc-solids', 'mc-planes', 'mc-recent', 'mc-status', 'mc-viewsheets'].filter(function (id) { return D.getElementById(id); });
      assert(!left.length && !D.documentElement.hasAttribute('data-profile') && !/\bmc-/.test($('app').className), 'mcframe left: ' + left.join());
      ['vp-labels', 'vp-qmask', 'vp-selbar'].forEach(function (id) { assert(!rfLOShown(D.getElementById(id)), id + ' still shown'); });
      assert(W.getComputedStyle($('hud')).display !== 'none' && !$('viewport').style.getPropertyValue('--viewport') && !$('viewport').classList.contains('mc-direct'), 'graphics window back');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return f1.name + ' on Front, ' + f2.name + ' on Right';
    } finally { await rfLOReset(); }
  });

  step('rfLO: (g) Tools > Sketch Entities and Search Commands start a sketch with none open, as the ribbon button does (the Edit Sketch prompt)', async function () {
    var errs0 = errors.length;
    try {
      await rfLOReset();
      await anvil.newPart(); await idle();
      var row = null;
      var tools = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (li) { return /^Tools/.test(li.textContent.trim()); })[0];
      assert(tools, 'no Tools menu');
      tools.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));

      await rfLOUntil(function () { row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Sketch Entities ▸ Circle\s*$/.test(m.textContent.trim()) || /^Circle$/.test(m.textContent.trim()); })[0]; return !!row; },
        function () { return 'a Sketch Entities ▸ Circle row: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.trim(); }).slice(0, 60).join(' | '); });
      assert(!row.classList.contains('disabled'), 'Circle row greyed with no sketch');
      row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await idle();
      assert(UI.pmTitle() === 'Edit Sketch' && UI.App.mode !== 'sketch', 'Tools row: the prompt: ' + UI.pmTitle());
      rfLOKey('Escape'); await idle();
      assert(!UI.hasPM(), 'Esc cancelled');
      if (UI.closeMenus) UI.closeMenus();
      // Search Commands: type Line, Enter
      var box = $('cmd-search');
      assert(box, 'no Search Commands box');
      box.focus(); box.value = 'Line'; box.dispatchEvent(new W.Event('input', { bubbles: true }));
      box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await idle();
      assert(UI.pmTitle() === 'Edit Sketch', 'Search Commands: the prompt: ' + UI.pmTitle() + ' / ' + statusText());
      rfLOKey('Escape'); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'ok';
    } finally { if (UI.closeMenus) UI.closeMenus(); await rfLOReset(); }
  });
