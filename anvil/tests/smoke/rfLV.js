  // --- rfLV (lane mcpolish, 2026-11-11): the Mastercam interface profile, second pass: nothing missing, nothing dead ---
  // The commands Mastercam has and Anvil lacked (ui-panels.js FRAME_ACTIONS, placed by the profile as { fn: 'action' }):
  // Unzoom 50 % / 80 %, Translucency, Material, Show Axes, Show Gnomons, Show Grid / Snap to Grid, Z depth and 3D / 2D,
  // Level, Blank / Unblank / Hide-Unhide, Cut / Copy Image / Undelete Entity, the viewsheets; the Configurations,
  // Planes and Solids managers' tool rows; the SolidWorks menu rows that run the same commands; every enabled button on
  // every tab of a part, an assembly and a drawing does something; SolidWorks comes back clean. By mouse where a user
  // would click (ribbon buttons, the » overflow menu of a narrow window, status bar, viewsheet tabs, manager tabs).
  var RFLV_BOX = "p.sketch('Top').rect(0, 0, 4, 2).extrude(1)";
  function rfLVEv(el, type, x, y, extra) {
    el.dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1, clientX: x, clientY: y, detail: 1 }, extra || {})));
  }
  async function rfLVClick(el, label, extra) {
    assert(el, 'nothing to click: ' + (label || ''));
    var r = el.getBoundingClientRect();
    assert(r.width > 0 && r.height > 0, (label || el.textContent) + ' is not shown');
    var x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    rfLVEv(el, 'mousedown', x, y, extra); rfLVEv(el, 'mouseup', x, y, extra); rfLVEv(el, 'click', x, y, extra);
    await wait(20);
  }
  async function rfLVUntil(fn, what, ms) { var t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > (ms || 2500)) throw new Error('timed out waiting: ' + (typeof what === 'function' ? what() : what)); await wait(10); } }
  function rfLVTabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off') && t.offsetWidth; }); }
  async function rfLVTab(name) { var t = rfLVTabs().filter(function (x) { return x.textContent === name; })[0]; await rfLVClick(t, 'tab ' + name); await wait(30); }
  function rfLVMenuRow(label) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.replace(/[▸✓]/g, '').trim().indexOf(label) === 0; })[0]; }
  // a ribbon button by its name (a getter label: its start): the button, or its row in the » menu when the window is narrow
  async function rfLVRun(tab, label) {
    if (UI.App.ribbonTab !== tab) await rfLVTab(tab);
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return (x.getAttribute('aria-label') || '').indexOf(label) === 0; })[0];
    assert(b, 'no ' + label + ' button on ' + tab);
    assert(!b.disabled, label + ' is greyed');
    if (b.offsetWidth) { await rfLVClick(b, label); return b; }
    var more = D.querySelector('#ribbon-buttons .rb-more');
    await rfLVClick(more, '» for ' + label);
    var row = rfLVMenuRow(label);
    assert(row, label + ' not in the » menu');
    row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    await wait(30);
    return b;
  }
  function rfLVBody() { return UI.getBodyMesh(); }
  function rfLVOpacity() { var m = rfLVBody(), o = null; m.traverse(function (c) { if (c.isMesh && c.material && o == null) o = (Array.isArray(c.material) ? c.material[0] : c.material).opacity; }); return o; }
  async function rfLVMastercam(script) {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    anvil.profile('mastercam');
    await anvil.newPart(); await idle();
    await anvil.run(script || RFLV_BOX); await idle();
    if (!$('tp-panel').hidden) UI.closeTaskPane();
    UI.setView('Isometric'); UI.zoomToFit(); await wait(30);
  }
  async function rfLVReset() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (modalOpen()) UI.closeModal();
    if (UI.closeMenus) UI.closeMenus();
    if (UI.translucency) UI.translucency(false);
    if (UI.showWorldAxes) UI.showWorldAxes(false);
    if (UI.showGnomons) UI.showGnomons(true);
    if (UI.setCplaneZ) { UI.setCplaneZ(0); UI.setCplaneMode('3D'); }
    UI.App.view.gridVisible = undefined; UI.App.view.showGrid = false;
    if (UI.unblank) UI.unblank();
    if (UI.viewsheets) UI.viewsheets.reset();
    if (UI.setCplane) UI.setCplane('Top');
    anvil.profile('solidworks');
  }

  step('rfLV: (a) View tab by mouse: Unzoom 50 % and 80 %, Translucency, Material, Show Axes, Show Gnomons, Show Grid apart from Snap to Grid', async function () {
    await rfLVMastercam();
    try {
      var s0 = UI.cam.scale;
      await rfLVRun('View', 'Unzoom 50%'); near(UI.cam.scale / s0, 2, 1e-9, 'Unzoom 50% scale');
      await rfLVRun('View', 'Unzoom 80%'); near(UI.cam.scale / s0, 2.5, 1e-9, 'Unzoom 80% scale');
      // Translucency: the body see-through and back
      UI.render(); var o0 = rfLVOpacity();
      await rfLVRun('View', 'Translucency'); UI.render(); await wait(30);
      assert(UI.translucency() && rfLVOpacity() < 0.5, 'translucent: opacity ' + rfLVOpacity());
      await rfLVRun('View', 'Translucency'); UI.render();
      assert(!UI.translucency() && rfLVOpacity() === o0, 'solid again: opacity ' + rfLVOpacity());
      // Material: RealView over shading, and off again
      await rfLVRun('View', 'Material');
      assert(UI.realView() && UI.App.view.style === 'shaded', 'material: realView ' + UI.realView() + ' style ' + UI.App.view.style);
      assert(D.querySelector('#mc-status .mc-style[data-style="material"]').classList.contains('active'), 'the status bar Material button is not pressed');
      await rfLVClick(D.querySelector('#mc-status .mc-style[data-style="shadedEdges"]'), 'Outline Shaded in the status bar');
      assert(!UI.realView() && UI.App.view.style === 'shadedEdges', 'outline shaded: realView ' + UI.realView());
      // Show Axes: three lines through the origin
      await rfLVRun('View', 'Show Axes');
      UI.render();
      var axes = UI.scene.getObjectByName('mc-world-axes');
      assert(axes && axes.children.length === 3 && axes.visible, 'no world axes');
      await rfLVRun('View', 'Show Axes');
      UI.render();
      assert(!UI.scene.getObjectByName('mc-world-axes'), 'axes still shown');
      // Show Gnomons: the triad and the view labels go and come back
      assert($('triad').offsetWidth > 0, 'triad hidden at the start');
      await rfLVRun('View', 'Show Gnomons');
      assert($('triad').offsetWidth === 0 && (!$('vp-labels') || $('vp-labels').offsetWidth === 0), 'gnomon still shown');
      await rfLVRun('View', 'Show Gnomons');
      assert($('triad').offsetWidth > 0, 'gnomon not back');
      // Show Grid draws without snapping; Snap to Grid snaps (ui-sketch.js) without changing what is drawn
      await rfLVRun('View', 'Show Grid');
      assert(UI.gridShown() && !UI.gridSnap(), 'show grid: shown ' + UI.gridShown() + ' snap ' + UI.gridSnap());
      await rfLVRun('View', 'Snap to Grid');
      assert(UI.gridShown() && UI.gridSnap() && UI.App.view.showGrid, 'snap: ' + UI.gridSnap());
      await rfLVRun('View', 'Show Grid');
      assert(!UI.gridShown() && UI.gridSnap(), 'hidden grid still snaps: shown ' + UI.gridShown() + ' snap ' + UI.gridSnap());
      return 'scale ×2, ×2.5; opacity ' + o0 + ' → translucent → ' + rfLVOpacity();
    } finally { await rfLVReset(); }
  });

  step('rfLV: (b) Home tab: Z depth typed in its box and the 3D / 2D chip of the status bar; a Line started in 2D lands on Top at the Z depth; Level makes a main level', async function () {
    await rfLVMastercam();
    try {
      await rfLVRun('Home', 'Z:');
      assert(modalOpen(), 'no Z depth box');
      var inp = D.querySelector('#modal input');
      inp.value = '0.5';
      clickModalButton('OK'); await wait(20);
      near(UI.cplaneZ(), 0.5, 1e-12, 'Z depth');
      assert(UI.cplaneMode() === '2D', 'typing a Z did not switch to 2D');
      var chip = D.querySelector('#mc-status [data-mc="mode"]');
      assert(chip && chip.textContent === '2D', 'status chip ' + (chip && chip.textContent));
      assert(Array.prototype.some.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return /^Z: 0\.5/.test(b.getAttribute('aria-label') || ''); }), 'the Z button does not show 0.5');
      var pl = UI.cplaneSketchPlane();
      assert(pl.ref === 'Top' && pl.offset === 0.5, '2D plane ' + JSON.stringify(pl));
      // a Line from the Wireframe tab starts a sketch on the construction plane at Z
      var n0 = UI.App.model.features.length;
      await rfLVRun('Wireframe', 'Line Endpoints');
      await rfLVUntil(function () { return UI.App.model.features.length > n0; }, 'no sketch started');
      var sk = UI.App.model.features[UI.App.model.features.length - 1];
      assert(sk.type === 'sketch' && sk.plane.ref === 'Top' && sk.plane.offset === 0.5, 'sketch plane ' + JSON.stringify(sk.plane));
      UI.escapeCommand(); await UI.exitSketch(true); await idle();
      // 3D: the chip switches, the plane goes through the origin
      await rfLVClick(chip, '3D / 2D chip');
      assert(UI.cplaneMode() === '3D' && chip.textContent === '3D' && UI.cplaneSketchPlane().offset === 0, '3D: ' + chip.textContent + ' ' + JSON.stringify(UI.cplaneSketchPlane()));
      // Level: a new number becomes the main level
      await rfLVRun('Home', 'Level:');
      assert(modalOpen(), 'no Level box');
      D.querySelector('#modal input').value = '7';
      clickModalButton('OK'); await wait(20);
      assert(UI.levels.main() === 7, 'main level ' + UI.levels.main());
      return 'Z 0.5 → ' + JSON.stringify(sk.plane) + '; level 7';
    } finally { await rfLVReset(); }
  });

  step('rfLV: (c) Blank, Unblank and Hide/Unhide on a body and on sketch entities; Cut and Undelete Entity in a sketch; Copy Image puts a PNG on the clipboard', async function () {
    await rfLVMastercam("p.sketch('Top').rect(0, 0, 4, 2).extrude(1); p.sketch('Front').line(0, 3, 4, 3).line(4, 3, 4, 5)");
    var clipSaved = Object.getOwnPropertyDescriptor(W.navigator, 'clipboard'), got = [];
    try {
      // a body: select it, Blank hides it, Unblank brings it back
      UI.setSelection([{ kind: 'body', index: 0 }]);
      await rfLVRun('Home', 'Blank');
      assert(UI.isBodyHidden(0), 'Blank did not hide the body');
      await rfLVRun('Home', 'Unblank');
      assert(!UI.isBodyHidden(0), 'Unblank did not show the body');
      // sketch entities: open the open-line sketch, Blank one line, Hide/Unhide keeps only the other
      var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[1];
      UI.editSketch(sk.id); await idle();
      assert(UI.App.mode === 'sketch' && UI.App.activeSketch === sk.id, 'sketch not open');
      UI.setSelection([{ kind: 'entity', index: 0 }]);
      await rfLVRun('Home', 'Blank');
      assert(UI.entityLayerHidden(sk, sk.entities[0]) && !UI.entityLayerHidden(sk, sk.entities[1]), 'entity 0 not blanked');
      await rfLVRun('Home', 'Unblank');
      assert(!UI.entityLayerHidden(sk, sk.entities[0]), 'entity 0 still blanked');
      UI.setSelection([{ kind: 'entity', index: 1 }]);
      await rfLVRun('Home', 'Hide/');
      assert(UI.hideUnhideOn() && UI.entityLayerHidden(sk, sk.entities[0]) && !UI.entityLayerHidden(sk, sk.entities[1]) && UI.isBodyHidden(0), 'Hide/Unhide did not keep only the selection');
      await rfLVRun('Home', 'Hide/');
      assert(!UI.hideUnhideOn() && !UI.entityLayerHidden(sk, sk.entities[0]) && !UI.isBodyHidden(0), 'Hide/Unhide did not show everything again');
      // Cut: the selected line goes to the clipboard and Paste brings a copy; Undelete brings the cut one back
      var n0 = sk.entities.length;
      UI.setSelection([{ kind: 'entity', index: 0 }]);
      await rfLVRun('Home', 'Cut');
      sk = UI.activeSketchFeature();
      assert(sk.entities.length === n0 - 1 && UI.sketchClipboard(), 'Cut: ' + sk.entities.length + ' entities, clipboard ' + !!UI.sketchClipboard());
      await rfLVRun('Home', 'Undelete');
      sk = UI.activeSketchFeature();
      assert(sk.entities.length === n0, 'Undelete: ' + sk.entities.length + ' entities, wanted ' + n0);
      // Del key then Undelete: the same line back where it was (its end points)
      var gone = JSON.stringify(sk.entities[0]);
      UI.setSelection([{ kind: 'entity', index: 0 }]);
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await wait(30);
      sk = UI.activeSketchFeature();
      assert(sk.entities.length === n0 - 1, 'Del did not delete: ' + sk.entities.length);
      await rfLVRun('Home', 'Undelete');
      sk = UI.activeSketchFeature();
      assert(sk.entities.length === n0 && sk.entities.some(function (e) { return JSON.stringify(e) === gone; }), 'the deleted line is not back');
      await UI.exitSketch(true); await idle();
      // Copy Image: a stand-in clipboard receives one PNG of the graphics window
      Object.defineProperty(W.navigator, 'clipboard', { configurable: true, value: { write: function (items) { got.push(items); return Promise.resolve(); } } });
      if (!W.ClipboardItem) W.ClipboardItem = function (o) { this.types = Object.keys(o); this.o = o; };
      await rfLVRun('Home', 'Copy Image');
      await rfLVUntil(function () { return got.length > 0; }, 'nothing written to the clipboard');
      var item = got[0][0], types = item.types || Object.keys(item);
      assert(types.indexOf('image/png') >= 0, 'clipboard types ' + types);
      return 'blank / unblank / hide-unhide; cut + undelete; Del + undelete; Copy Image ' + types.join();
    } finally {
      if (clipSaved) Object.defineProperty(W.navigator, 'clipboard', clipSaved); else delete W.navigator.clipboard;
      await rfLVReset();
    }
  });

  step('rfLV: (d) viewsheets by mouse: + adds one, each keeps its own view and construction plane, a click switches back; rename and delete by right-click; Save / Restore Bookmark; On/Off', async function () {
    await rfLVMastercam();
    try {
      var strip = $('mc-viewsheets');
      assert(strip && strip.offsetWidth, 'no viewsheet strip');
      assert(UI.viewsheets.list().length === 1 && UI.viewsheets.list()[0].name === 'Viewsheet-1', 'start ' + JSON.stringify(UI.viewsheets.list()));
      UI.setView('Isometric'); UI.setCplane('Top'); await wait(30);
      var iso = UI.cam.dir.toArray();
      await rfLVClick(strip.querySelector('.vs-add'), '+');
      assert(UI.viewsheets.list().length === 2 && UI.viewsheets.active() === 1, 'no second sheet');
      UI.setView('Front'); UI.setCplane('Front'); UI.finishViewAnimation(); await wait(30);
      var front = UI.cam.dir.toArray();
      await rfLVClick(strip.querySelector('[data-vs="0"]'), 'Viewsheet-1');
      assert(UI.viewsheets.active() === 0 && UI.cplane() === 'Top', 'sheet 1: plane ' + UI.cplane());
      near(UI.cam.dir.dot(new W.THREE.Vector3().fromArray(iso)), 1, 1e-9, 'sheet 1 view');
      await rfLVClick(strip.querySelector('[data-vs="1"]'), 'Viewsheet-2');
      assert(UI.cplane() === 'Front', 'sheet 2: plane ' + UI.cplane());
      near(UI.cam.dir.dot(new W.THREE.Vector3().fromArray(front)), 1, 1e-9, 'sheet 2 view');
      // bookmark: save, move away, restore
      await rfLVRun('View', 'Save Bookmark');
      UI.setView('Right'); UI.setCplane('Right'); UI.finishViewAnimation();
      await rfLVRun('View', 'Restore Bookmark');
      near(UI.cam.dir.dot(new W.THREE.Vector3().fromArray(front)), 1, 1e-9, 'restored view');
      assert(UI.cplane() === 'Front', 'restored plane ' + UI.cplane());
      // right-click: rename, then delete
      var t2 = strip.querySelector('[data-vs="1"]'), r = t2.getBoundingClientRect();
      rfLVEv(t2, 'contextmenu', r.left + 5, r.top + 5, { button: 2 }); await wait(20);
      rfLVMenuRow('Rename').dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await wait(20);
      D.querySelector('#modal input').value = 'Flat side';
      clickModalButton('OK'); await wait(20);
      assert(UI.viewsheets.list()[1].name === 'Flat side' && /Flat side/.test(strip.textContent), 'rename: ' + strip.textContent);
      t2 = strip.querySelector('[data-vs="1"]'); r = t2.getBoundingClientRect();
      rfLVEv(t2, 'contextmenu', r.left + 5, r.top + 5, { button: 2 }); await wait(20);
      rfLVMenuRow('Delete').dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await wait(20);
      assert(UI.viewsheets.list().length === 1 && UI.cplane() === 'Top', 'delete: ' + JSON.stringify(UI.viewsheets.list()) + ' plane ' + UI.cplane());
      // On/Off and New from the View tab
      await rfLVRun('View', 'On/Off');
      assert(!UI.viewsheets.shown() && strip.hidden, 'strip still shown');
      await rfLVRun('View', 'New');
      assert(UI.viewsheets.shown() && UI.viewsheets.list().length === 2, 'New: ' + JSON.stringify(UI.viewsheets.list()));
      return UI.viewsheets.list().map(function (s) { return s.name; }).join(', ');
    } finally { await rfLVReset(); }
  });

  step('rfLV: (e) managers: the Configurations tab shows the two configurations of a part; Planes find, lower part and a plane from the graphics view; Solids move an operation up and down', async function () {
    await rfLVMastercam("p.sketch('Top').rect(0, 0, 4, 2).extrude(1); p.sketch('Front').rect(0, 0, 1, 1).extrude(0.5)");
    try {
      var cfgTab = D.querySelector('#mc-mgr-tabs [data-mgr="config"]');
      assert(cfgTab && cfgTab.hidden, 'Configurations tab shown with no configurations');
      UI.configurations.add('Short'); await idle(); await wait(40);
      assert(UI.configurations.list().length === 2, 'configurations ' + JSON.stringify(UI.configurations.list()));
      await rfLVUntil(function () { return !cfgTab.hidden && cfgTab.offsetWidth; }, 'the Configurations tab did not come');
      var order = Array.prototype.filter.call($('mc-mgr-tabs').children, function (b) { return !b.hidden; }).map(function (b) { return b.getAttribute('data-mgr'); }).join();
      assert(order === 'solids,planes,levels,config,recent', 'manager tabs ' + order);
      await rfLVClick(cfgTab, 'Configurations tab');
      var rows = Array.prototype.map.call(D.querySelectorAll('#config-panel .cfg-row .cfg-name'), function (n) { return n.textContent; });
      assert($('config-panel').offsetWidth && rows.join() === 'Default,Short', 'configuration rows ' + rows.join());
      assert(D.querySelector('#mc-mgr-head .mc-mgr-title').textContent === 'Configurations', 'title ' + D.querySelector('#mc-mgr-head .mc-mgr-title').textContent);
      // Planes: find filters the rows, the lower part shows the clicked plane, a plane from the Front view at Z 0.25
      await rfLVClick(D.querySelector('#mc-mgr-tabs [data-mgr="planes"]'), 'Planes tab');
      var tools = function () { return Array.prototype.slice.call(D.querySelectorAll('#mc-mgr-head .mc-tool')); };
      await rfLVClick(tools().filter(function (b) { return /^Find/.test(b.getAttribute('aria-label')); })[0], 'Find');
      var find = D.querySelector('#mc-planes .mc-find');
      assert(find && D.activeElement === find, 'find box not focused');
      find.value = 'fr'; find.dispatchEvent(new W.Event('input', { bubbles: true }));
      var names = Array.prototype.map.call(D.querySelectorAll('#mc-planes tr[data-plane]'), function (r) { return r.getAttribute('data-plane'); });
      assert(names.join() === 'Front', 'find "fr": ' + names.join());
      find.value = ''; find.dispatchEvent(new W.Event('input', { bubbles: true }));
      await rfLVClick(D.querySelector('#mc-planes tr[data-plane="Right"] .mc-pl-name'), 'Right row');
      assert(D.querySelector('.mc-pl-lower').getAttribute('data-plane') === 'Right' && D.querySelectorAll('.mc-pl-lower input[data-origin]').length === 3, 'lower part');
      var cm = D.querySelector('.mc-pl-lower .mc-pl-comment');
      cm.value = 'datum B'; cm.dispatchEvent(new W.Event('change', { bubbles: true }));
      UI.setView('Front'); UI.finishViewAnimation(); UI.setCplaneZ(0.25);
      var n0 = UI.App.model.features.length;
      await rfLVClick(tools().filter(function (b) { return /^New plane from the graphics view/.test(b.getAttribute('aria-label')); })[0], 'plane from view');
      await rfLVUntil(function () { return UI.App.model.features.length > n0; }, 'no plane made'); await idle();
      var pf = UI.App.model.features[UI.App.model.features.length - 1];
      assert(pf.type === 'plane' && pf.ref === 'Front' && pf.offset === 0.25, 'plane ' + JSON.stringify(pf));
      await rfLVUntil(function () { return !!D.querySelector('#mc-planes tr[data-plane="' + pf.name + '"]'); }, 'new plane not in the table');
      await rfLVClick(D.querySelector('#mc-planes tr[data-plane="Right"] .mc-pl-name'), 'Right row again');
      assert(D.querySelector('.mc-pl-lower .mc-pl-comment').value === 'datum B', 'comment lost');
      // Solids: the second extrude moves up past the first and back down; the volume is the same
      await rfLVClick(D.querySelector('#mc-mgr-tabs [data-mgr="solids"]'), 'Solids tab');
      var v0 = anvil.mass().volume, ex = UI.App.model.features.filter(function (f) { return f.type === 'extrude'; });
      UI.App.sel = { kind: 'feature', id: ex[1].id };
      await UI.frameMoveOp(-1); await idle();
      var ids = UI.App.model.features.filter(function (f) { return f.type === 'extrude'; }).map(function (f) { return f.id; });
      assert(ids[0] === ex[1].id, 'not moved up: ' + ids);
      near(anvil.mass().volume, v0, 1e-6 * v0, 'volume after move up');
      UI.App.sel = { kind: 'feature', id: ex[1].id };
      await rfLVClick(tools().filter(function (b) { return /^Move the selected operation down/.test(b.getAttribute('aria-label')); })[0], 'Move down');
      await rfLVUntil(function () { return UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[1].id === ex[1].id; }, 'not moved down'); await idle();
      UI.setCplaneZ(0);
      return 'configs ' + rows.join() + '; plane ' + pf.name + '; volume ' + fmt(v0);
    } finally { await rfLVReset(); }
  });

  step('rfLV: (f) the SolidWorks menus run the same commands: Edit > Cut in a sketch, View > Modify > Zoom Out, View > Display > Change Transparency', async function () {
    anvil.profile('solidworks');
    await anvil.newPart(); await idle();
    await anvil.run("p.sketch('Top').rect(0, 0, 4, 2).extrude(1); p.sketch('Front').line(0, 3, 4, 3)"); await idle();
    try {
      UI.setView('Isometric'); UI.finishViewAnimation();
      var s0 = UI.cam.scale;
      var z = menuRows('Modify ▸ Zoom Out')[0];
      assert(z, 'no View > Modify > Zoom Out');
      z.row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await wait(20);
      near(UI.cam.scale / s0, 1.25, 1e-9, 'zoom out');
      var t = menuRows('Change Transparency')[0];
      assert(t, 'no View > Display > Change Transparency');
      t.row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await wait(20);
      assert(UI.translucency(), 'not translucent');
      UI.translucency(false);
      var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[1];
      UI.editSketch(sk.id); await idle();
      UI.setSelection([{ kind: 'entity', index: 0 }]);
      var c = menuRows('Cut')[0];
      assert(c && c.menu.indexOf('Edit') === 0, 'no Edit > Cut');
      c.row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await wait(20);
      assert(UI.activeSketchFeature().entities.length === 0 && UI.sketchClipboard(), 'Edit > Cut did not cut');
      return 'Zoom Out ×1.25, Change Transparency, Edit > Cut';
    } finally { await rfLVReset(); }
  });

  // every enabled ribbon button on every tab: it opens something (PropertyManager, dialog, menu, panel, backstage,
  // flyout), changes a state (view, style, tool, mode, model, selection, toggles) or says why not (status / toast); none
  // throws. The window is put back after each (Esc, Cancel, close, the model reloaded when it changed).
  function rfLVSig() {
    var c = UI.cam, A = UI.App, toastEl = D.querySelector('.toast:not(.out)');
    var btns = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons .rb.active, #mc-status .active'), function (b) { return b.getAttribute('aria-label'); }).join('|');
    return JSON.stringify([UI.hasPM && UI.hasPM() ? UI.pmTitle() : null, modalOpen(), D.querySelectorAll('body > .menu, .flyout, .rb-fly.open, .lvl-pop').length, UI.frameBackstage && UI.frameBackstage.isOpen(),
      !$('tp-panel').hidden, JSON.stringify(A.view), [c.target.x, c.target.y, c.target.z, c.dir.x, c.dir.y, c.dir.z, c.up.x, c.up.y, c.scale].map(function (v) { return Math.round(v * 1e6); }).join(),
      A.mode, A.tool, A.ribbonTab, A.fmTab, !!A.command, !!A.zoomAreaMode, JSON.stringify(A.model).length, statusText(), toastEl ? toastEl.textContent : '', UI.frameManager && UI.frameManager(),
      D.activeElement && (D.activeElement.id || D.activeElement.className), UI.theme && UI.theme(), btns, D.body.children.length, $('viewport').children.length, UI.realView && UI.realView(),
      UI.cplaneMode && UI.cplaneMode(), UI.viewsheets && JSON.stringify(UI.viewsheets.list()), UI.App.drawing && UI.drawingActive && UI.drawingActive() ? JSON.stringify(UI.drawingInternal && UI.drawingInternal.D.tool) : '']);
  }
  var RFLV_SKIP = /^(More commands)$/;
  async function rfLVCleanup(model, docType) {
    for (var k = 0; k < 3; k++) {
      var busy = modalOpen() || (UI.hasPM && UI.hasPM()) || UI.App.mode === 'sketch' || !!UI.App.command || D.querySelector('body > .menu') || (UI.frameBackstage && UI.frameBackstage.isOpen());
      if (k && !busy) break;
      if (UI.closeMenus) UI.closeMenus();
      if (modalOpen()) UI.closeModal();
      if (UI.frameBackstage && UI.frameBackstage.isOpen()) UI.frameBackstage.close();
      if (UI.escapeCommand) { try { UI.escapeCommand(); } catch (e) { } }
      if (UI.hasPM && UI.hasPM()) { try { UI.pmCancel(); } catch (e) { UI.closePM(); } }
      if (UI.App.mode === 'sketch' && docType !== 'drawing') { try { await UI.exitSketch(true); } catch (e) { } }
      UI.App.zoomAreaMode = false;
      await wait(10);
    }
    if (!$('tp-panel').hidden && UI.closeTaskPane) UI.closeTaskPane();
    if (D.activeElement && D.activeElement.blur) D.activeElement.blur();
    await idle();
    if (docType !== 'drawing' && JSON.stringify(UI.App.model) !== model) { await UI.loadModel(JSON.parse(model)); await idle(); }
  }
  async function rfLVNoDead(docType, only) {
    var model = JSON.stringify(UI.App.model), dead = [], thrown = [], n = 0, theme = UI.theme();
    var errs = [], onErr = function (e) { errs.push(e.message || String(e.reason || e)); };
    W.addEventListener('error', onErr); W.addEventListener('unhandledrejection', onErr);
    var oPrint = W.print; W.print = function () { };
    try {
      var tabs = rfLVTabs().map(function (t) { return t.textContent; }).filter(function (t) { return !only || only.indexOf(t) >= 0; });
      assert(tabs.length, docType + ': no tab ' + only);
      for (var i = 0; i < tabs.length; i++) {
        await rfLVTab(tabs[i]);
        var labels = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.offsetWidth && !b.disabled; }).map(function (b) { return b.getAttribute('aria-label'); });
        for (var j = 0; j < labels.length; j++) {
          if (RFLV_SKIP.test(labels[j])) continue;
          if (UI.App.ribbonTab !== tabs[i]) await rfLVTab(tabs[i]);
          var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === labels[j] && x.offsetWidth && !x.disabled; })[0];
          if (!b) continue;
          var before = rfLVSig(), e0 = errs.length;
          // the status line and the toast are blanked so a refusal that writes the same words again still counts
          $('status-msg').textContent = ''; var tst = D.querySelector('.toast'); if (tst) tst.remove();
          before = rfLVSig();
          try { await rfLVClick(b, tabs[i] + ' ▸ ' + labels[j]); await wait(40); } catch (e) { thrown.push(tabs[i] + ' ▸ ' + labels[j] + ': ' + e.message); }
          var after = rfLVSig(), wasOn = JSON.parse(before)[19].split('|').indexOf(labels[j]) >= 0;   // [19]: the pressed buttons
          if (errs.length > e0) thrown.push(tabs[i] + ' ▸ ' + labels[j] + ': ' + errs.slice(e0).join('; '));
          // nothing changed: a pressed button of a choice (Shaded while shaded) is already in its state; else move
          // away (zoom out, another manager) and click again (Fit on a fitted view)
          if (after === before && !wasOn) {
            await rfLVCleanup(model, docType);
            UI.zoomView(1.4); if (UI.frameManager) UI.frameManager('planes');
            if (UI.App.ribbonTab !== tabs[i]) await rfLVTab(tabs[i]);
            b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === labels[j] && x.offsetWidth && !x.disabled; })[0];
            if (b) { $('status-msg').textContent = ''; before = rfLVSig(); await rfLVClick(b, labels[j]); await wait(40); after = rfLVSig(); }
            if (UI.frameManager) UI.frameManager('solids');
          }
          if (after === before && !wasOn) dead.push(tabs[i] + ' ▸ ' + labels[j]);
          n++;
          await rfLVCleanup(model, docType);
          if (UI.theme() !== theme) UI.setTheme(theme);
        }
      }
    } finally { W.removeEventListener('error', onErr); W.removeEventListener('unhandledrejection', onErr); W.print = oPrint; }
    return { n: n, dead: dead, thrown: thrown };
  }

  // (g) one step per tab (each click is put back, so a tab of forty buttons takes a few seconds)
  async function rfLVOpen(docType) {
    await rfLVMastercam();
    if (docType === 'drawing') { UI.makeDrawing({ fresh: true }); await wait(300); await idle(); assert(UI.drawingActive(), 'no drawing'); }
    if (docType === 'assembly') { await anvil.newAssembly(); await idle(); }
  }
  [['part', 'Home'], ['part', 'Wireframe'], ['part', 'Solids'], ['part', 'Sheet Metal'], ['part', 'Drafting'], ['part', 'Transform'], ['part', 'View'], ['part', 'More'],
    ['drawing', 'View Layout'], ['drawing', 'Drafting'], ['drawing', 'Sketch'], ['drawing', 'Sheet Format'], ['drawing', 'More'],
    ['assembly', 'Home'], ['assembly', 'Assembly'], ['assembly', 'View'], ['assembly', 'More']].forEach(function (dt) {
    step('rfLV: (g) no dead button on the ' + dt[0] + ' ' + dt[1] + ' tab under Mastercam: every enabled button opens something or changes something, and none throws', async function () {
      try {
        await rfLVOpen(dt[0]);
        if (dt[0] === 'drawing') assert($('dw-status') && $('dw-status').parentNode.id === 'mc-status', 'the drawing status items are outside the blue bar');
        if (dt[0] === 'assembly' && dt[1] === 'Assembly') {
          var names = rfLVTabs().map(function (t) { return t.textContent; }).join();
          assert(/^Home,Assembly,View/.test(names), 'assembly tabs ' + names);
          await rfLVTab('Assembly');
          var caps = UI.frameCaptions();
          assert(caps.length >= 3 && caps.indexOf('Components') >= 0, 'Assembly tab captions ' + caps.join(', '));
        }
        var r = await rfLVNoDead(dt[0], [dt[1]]);
        assert(!r.thrown.length, 'threw: ' + r.thrown.join(' | '));
        assert(!r.dead.length, 'dead: ' + r.dead.join(', '));
        return r.n + ' buttons';
      } finally { if (UI.drawingActive && UI.drawingActive()) { UI.closeDrawing(); await idle(); } await rfLVReset(); }
    });
  });

  step('rfLV: (h) back on SolidWorks: no viewsheet strip, no frame piece, the grid, gnomon and display as SolidWorks has them', async function () {
    await rfLVMastercam();
    UI.setView('Front'); await rfLVClick($('mc-viewsheets').querySelector('.vs-add'), '+');
    await rfLVReset();
    await wait(30);
    var left = ['mc-file', 'mc-backstage', 'mc-mgr-head', 'mc-mgr-tabs', 'mc-solids', 'mc-planes', 'mc-recent', 'mc-status', 'mc-viewsheets'].filter(function (id) { return D.getElementById(id); });
    assert(!left.length, 'left over: ' + left.join(', '));
    assert(!$('viewport').classList.contains('vp-nognomon') && $('triad').offsetWidth > 0, 'gnomon');
    assert(!UI.translucency() && !UI.showWorldAxes(), 'display');
    assert(UI.Profiles.active() === 'solidworks' && !UI.frameDef(), 'profile ' + UI.Profiles.active());
    return 'clean';
  });
