  // --- rfPE (2026-11-17, lane treeedit: FeatureManager and command feel as SolidWorks 2024) ---
  // A double-click on a feature shows its dimensions (it opened Edit Feature), the context toolbar by the pointer after a
  // click on a feature or a face, Unfold / Fold wait for their selections, an assembly component dragged is drawn by the
  // frame that follows the mouse move, and the Edge Flange preview has a drag arrow for its length.
  function rfPEframe() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
  var rfPErect = null;
  function rfPEev(type, p, o) {
    o = o || {};
    var r = rfPErect || (rfPErect = $('viewport').getBoundingClientRect());
    var init = { bubbles: true, cancelable: true, view: W, button: o.button || 0, buttons: type === 'mouseup' ? 0 : (o.buttons != null ? o.buttons : 1), detail: o.detail || 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
    var inside = p[0] >= 0 && p[1] >= 0 && p[0] <= r.width && p[1] <= r.height;
    (o.target || (type === 'mousedown' || type === 'click' || type === 'dblclick' || ((type === 'mousemove' || type === 'mouseup') && inside) ? $('viewport') : W)).dispatchEvent(new W.MouseEvent(type, init));
  }
  function rfPEclickAt(p) { rfPErect = null; rfPEev('mousemove', p, { buttons: 0 }); rfPEev('mousedown', p); rfPEev('mouseup', p); rfPEev('click', p); }
  function rfPErowEv(row, type, detail) {
    var r = row.getBoundingClientRect(), nm = row.querySelector('.nm') || row;
    nm.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: 0, detail: detail || 1, clientX: r.left + 40, clientY: r.top + r.height / 2 }));
  }
  function rfPErow(id) { return D.querySelector('#tree .ti[data-fid="' + id + '"]'); }
  function rfPEclickRow(id) { var row = rfPErow(id); rfPErowEv(row, 'mousedown'); rfPErowEv(row, 'mouseup'); rfPErowEv(row, 'click'); }
  function rfPEdblRow(id) {
    rfPEclickRow(id);
    var row = rfPErow(id); rfPErowEv(row, 'mousedown', 2); rfPErowEv(row, 'mouseup', 2); rfPErowEv(row, 'click', 2);
    rfPErowEv(rfPErow(id), 'dblclick', 2);
  }

  var RFPE_ASM = 'a.name("PeDrag");\n' +
    'var base = a.insert({ script: \'p.name("Base"); p.box(200, 100, 10);\' }, { fixed: true });\n' +
    'var blk = a.insert({ script: \'p.name("Block"); p.box(20, 20, 20);\' }, { position: [60, 10, 40] });\n';
  step('rfPE: an assembly component dragged with the mouse is drawn where the mouse put it by the frame that follows each move (it was drawn a frame late: the drag solved in its own animation frame, after the render)', async function () {
    var errs0 = errors.length;
    await anvil.newAssembly(); await idle();
    await anvil.run(RFPE_ASM); await idle();
    UI.setView('Front'); for (var i = 0; i < 40 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(25);
    await idle(); await rfPEframe(); await rfPEframe();
    var A = UI.App, blk = A.model.components[1], ctr = W.Assembly.componentCenter(A.model, A.build, blk.id), s = UI.worldToScreen(ctr);
    rfPErect = $('viewport').getBoundingClientRect();
    // counters: the move the pose shown was solved for, and what the scene render drew
    var moveNo = 0, posedFor = -1, drawnFor = [], late = 0, n = 10, poseApply = UI.asmPose.apply, rr = UI.renderer.render;
    UI.asmPose.apply = function () { var r = poseApply.apply(this, arguments); posedFor = moveNo; return r; };
    UI.renderer.render = function (scene) { if (scene === UI.scene && moveNo > 0) drawnFor.push(posedFor); return rr.apply(this, arguments); };
    try {
      rfPEev('mousemove', s, { buttons: 0 });
      rfPEev('mousedown', s);
      await rfPEframe();
      for (var k = 1; k <= n; k++) {
        moveNo = k; drawnFor = [];
        rfPEev('mousemove', [s[0] + 6 * k, s[1] - 2 * k]);
        await rfPEframe();
        if (!(drawnFor.length && drawnFor[drawnFor.length - 1] === k)) late++;
      }
      rfPEev('mouseup', [s[0] + 6 * n, s[1] - 2 * n]);
    } finally { UI.asmPose.apply = poseApply; UI.renderer.render = rr; }
    await idle(); await wait(50); await idle();
    var c2 = W.Assembly.componentCenter(A.model, A.build, blk.id);
    assert(Math.abs(c2[0] - ctr[0]) > 1, 'the block moved: ' + JSON.stringify([ctr, c2]));
    assert(late === 0, late + ' of ' + n + ' drag frames drew the block where the move before put it');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return late + ' late frames of ' + n + '; moved ' + (c2[0] - ctr[0]).toFixed(2);
  });

  var RFPE_BOX = 'p.units("in");\nvar s = p.sketch("Front");\ns.line(0, 0, 3, 0).line(3, 0, 3, 2).line(3, 2, 0, 2).line(0, 2, 0, 0);\n' +
    's.rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"]);\n' +
    's.dim(0, "len", { off: -0.5 }).dim(1, "len", { off: 0.5 });\ns.end().extrude(1);\n';   // 3 x 2 on Front, 1 deep
  var RFPE_SM = 'p.name("PE-SM").units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
    'p.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer", name: "Flange A" });\n';
  function rfPEfeat(type) { return UI.App.model.features.filter(function (f) { return f.type === type; })[0]; }
  async function rfPEsettle() { for (var i = 0; i < 40 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(25); await idle(); await rfPEframe(); await rfPEframe(); }
  function rfPEvol() { return K.massProps(UI.App.mesh).volume; }

  step('rfPE: a double-click on Boss-Extrude1 in the FeatureManager shows its dimensions on the model (the sketch\'s and the depth, written beside its arrow) and opens no PropertyManager; a click on the depth opens its Modify box, 2 + Enter rebuilds the box 2 deep (one undo step); Esc hides the dimensions; the right-click menu still has Edit Feature', async function () {
    var errs0 = errors.length, i3dWas = UI.instant3DOn();
    await anvil.newPart(); await idle();
    await anvil.run(RFPE_BOX); await idle();
    if (!i3dWas) UI.toggleInstant3D(true);
    try {
      UI.setView('Isometric'); UI.zoomToFit(); await rfPEsettle();
      var ex = rfPEfeat('extrude'), v0 = rfPEvol(), undo0 = UI.App.undo.length;
      assert(ex, 'the box is an extrude');
      rfPEdblRow(ex.id); await idle(); await rfPEframe();
      assert(!UI.hasPM(), 'no PropertyManager: ' + (UI.hasPM() && UI.pmTitle()));
      assert(UI.featureDimsShown() === ex.id, 'the dimensions of ' + ex.name + ' are shown');
      UI.drawDims(); 
      var hs = anvil.instant3D().handles, kinds = hs.map(function (h) { return h.kind; });
      UI.drawDims();
      assert(kinds.indexOf('depth') >= 0 && kinds.indexOf('sdim') >= 0, 'depth and sketch dimensions: ' + kinds.join());
      var dt = D.querySelector('#i3d-layer g.i3d[data-kind="depth"] .pe-fdim');
      assert(dt && Math.abs(parseFloat(dt.textContent) - 1) < 1e-9, 'the depth written beside its arrow: ' + (dt && dt.textContent));
      var sd = D.querySelectorAll('#i3d-layer .i3d-dim-text:not(.pe-fdim)');
      assert(sd.length >= 2, 'the sketch dimensions as texts: ' + sd.length);
      assert(!UI.asmPopup() , 'the context toolbar went with the double-click');
      // the depth's Modify box
      dt.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, button: 0, buttons: 1 })); await idle();
      var ed = UI.instant3DEditOpen();
      assert(ed && ed.kind === 'depth' && Math.abs(ed.value - 1) < 1e-9, 'the Modify box of the depth: ' + JSON.stringify(ed));
      await UI.instant3DEdit('2'); await idle();
      near(rfPEvol(), 2 * v0, 1e-9, 'the box is 2 deep');
      assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
      assert(UI.featureDimsShown() === ex.id, 'still shown after the rebuild');
      // Esc hides them
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await rfPEframe();
      assert(UI.featureDimsShown() == null && !anvil.instant3D().handles.length && !D.querySelector('#i3d-layer .pe-fdim'), 'Esc hid them: ' + JSON.stringify(anvil.instant3D().handles.map(function (h) { return h.kind; })));
      // a double-click again, then a click in empty space
      rfPEdblRow(ex.id); await idle();
      assert(UI.featureDimsShown() === ex.id, 'shown again');
      rfPEclickAt([6, UI.size.h - 6]); await idle(); await rfPEframe();
      assert(UI.featureDimsShown() == null && !anvil.instant3D().handles.length, 'a click in empty space hid them');
      // the right-click menu keeps Edit Feature
      var row = rfPErow(ex.id), rr = row.getBoundingClientRect();
      row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, button: 2, clientX: rr.left + 30, clientY: rr.top + 6 }));
      var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^Edit Feature/.test(m.textContent.trim()); })[0];
      assert(mi, 'Edit Feature on the right-click menu');
      mi.click(); await idle();
      assert(UI.hasPM() && UI.pmTitle() === ex.name, 'Edit Feature opened: ' + (UI.hasPM() && UI.pmTitle()));
      UI.pmCancel(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'depth 1 -> 2 from the Modify box; ' + hs.length + ' dimensions';
    } finally { if (UI.hasPM()) UI.pmCancel(); UI.toggleInstant3D(i3dWas); }
  });

  step('rfPE: a double-click on a feature with no dimensions to show (Imported, a sketch) still opens it (Edit Feature / Edit Sketch)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFPE_BOX); await idle();
    var sk = rfPEfeat('sketch');
    rfPEdblRow(sk.id); await idle();
    assert(UI.App.mode === 'sketch' && UI.App.activeSketch === sk.id, 'Edit Sketch on a double-click on the sketch: ' + UI.App.mode);
    await UI.exitSketch(); await idle();
    return 'ok';
  });
  function rfPEbtn(text) { return Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim() === text; })[0]; }

  step('rfPE: a click on a feature row shows the context toolbar beside the pointer (Edit Feature, Edit Sketch, Suppress, Rollback, Hide Body, Appearance); Suppress there suppresses it (one undo step); it fades as the pointer goes and closes far away; a click on a face shows the face toolbar (Edit Feature, Edit Sketch, Sketch, Normal To, Select Other …); the Mastercam profile shows the same buttons with its icons', async function () {
    var errs0 = errors.length, prof = anvil.profile();
    await anvil.newPart(); await idle();
    await anvil.run(RFPE_BOX); await idle();
    UI.setView('Isometric'); UI.zoomToFit(); await rfPEsettle();
    try {
      var ex = rfPEfeat('extrude');
      rfPEclickRow(ex.id); await idle();
      var p = UI.asmPopup();
      assert(p && p.kind === 'ctx', 'a context toolbar after the click on the row');
      assert(['editFeature', 'editSketch', 'suppress', 'rollback', 'hideBody', 'appearance'].every(function (a) { return p.buttons.indexOf(a) >= 0; }), 'buttons: ' + p.buttons.join());
      assert(Array.prototype.every.call(p.el.querySelectorAll('button'), function (b) { return b.querySelector('svg'); }), 'every button has its icon');
      var row = rfPErow(ex.id).getBoundingClientRect(), pr = p.el.getBoundingClientRect();
      assert(Math.abs(pr.top - (row.top + row.height / 2 + 14)) < 30 && pr.left > row.left, 'beside the pointer: ' + JSON.stringify([pr.left, pr.top, row.left, row.top]));
      // fades as the pointer goes, closes far away
      W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: pr.left + 10, clientY: pr.bottom + 60 }));
      var op = parseFloat(p.el.style.opacity || '1');
      assert(op < 1 && op > 0.3, 'faded part way at 60 px: ' + op);
      W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: pr.left + 10, clientY: pr.bottom + 400 }));
      assert(!UI.asmPopup(), 'closed far away');
      // Suppress from the toolbar
      rfPEclickRow(ex.id); await idle();
      var undo0 = UI.App.undo.length;
      UI.asmPopup().el.querySelector('[data-act="suppress"]').click(); await idle();
      assert(UI.isSuppressed(ex.id) && UI.App.undo.length === undo0 + 1 && !UI.asmPopup(), 'suppressed in one undo step');
      rfPEclickRow(ex.id); await idle();
      assert(UI.asmPopup().buttons.indexOf('unsuppress') >= 0, 'Unsuppress offered for a suppressed feature');
      UI.asmPopup().el.querySelector('[data-act="unsuppress"]').click(); await idle();
      assert(!UI.isSuppressed(ex.id), 'unsuppressed');
      // Edit Feature from the toolbar
      rfPEclickRow(ex.id); await idle();
      UI.asmPopup().el.querySelector('[data-act="editFeature"]').click(); await idle();
      assert(UI.hasPM() && UI.pmTitle() === ex.name, 'Edit Feature from the toolbar: ' + (UI.hasPM() && UI.pmTitle()));
      UI.pmCancel(); await idle();
      // a face in the graphics area
      var at = UI.worldToScreen([1.5, 1, 1]);
      rfPEclickAt(at); await idle();
      p = UI.asmPopup();
      assert(UI.App.sel && UI.App.sel.kind === 'face' && p && p.kind === 'ctx', 'a face toolbar: ' + JSON.stringify(UI.App.sel && UI.App.sel.kind));
      assert(['editFeature', 'editSketch', 'sketch', 'normalTo', 'selectOther', 'hideBody', 'appearance'].every(function (a) { return p.buttons.indexOf(a) >= 0; }), 'face buttons: ' + p.buttons.join());
      p.el.querySelector('[data-act="selectOther"]').click(); await idle();
      var rows = D.querySelectorAll('.menu .mi');
      assert(rows.length >= 2 && /Face \d+@Boss-Extrude1/.test(rows[0].textContent), 'Select Other lists the faces under the pointer: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
      UI.closeMenus();
      // a click in empty space: no toolbar
      rfPEclickAt([6, UI.size.h - 6]); await idle();
      assert(!UI.asmPopup(), 'no toolbar for empty space');
      // the Mastercam profile: the same buttons, its icons
      anvil.profile('mastercam'); await wait(60); await idle();
      rfPEclickRow(ex.id); await idle();
      p = UI.asmPopup();
      assert(p && p.buttons.indexOf('editFeature') >= 0 && p.el.querySelectorAll('button svg').length === p.buttons.length, 'Mastercam: ' + (p && p.buttons.join()));
      var bg = W.getComputedStyle(p.el).backgroundColor;
      assert(bg && bg !== 'rgba(0, 0, 0, 0)', 'a panel behind the buttons: ' + bg);
    } finally { if (UI.asmPopup()) UI.asmClosePopup(); anvil.profile(prof && prof.id ? prof.id : prof || 'solidworks'); await wait(40); }
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'feature and face toolbars';
  });

  step('rfPE: Unfold with nothing picked opens the PropertyManager and waits as SolidWorks: no preview, ✓ greyed for the fixed face, then for the bends; Collect All Bends lights ✓ and Unfold1 lies flat', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(RFPE_SM); await idle();
    var n0 = UI.App.model.features.length;
    UI.App.sel = null; if (UI.setSelection) UI.setSelection([]);
    UI.cmdUnfold(); await wait(30); await idle(); if (UI.previewIdle) await UI.previewIdle(); await wait(200);
    var ok = D.querySelector('#pm .pm-ok');
    assert(UI.hasPM() && UI.pmTitle() === 'Unfold', 'the Unfold PM');
    assert(ok.classList.contains('disabled') && /fixed face/.test(ok.title), '✓ waits for the fixed face: ' + ok.title);
    assert(!UI.groups.preview.children.length, 'no preview yet: ' + UI.groups.preview.children.length);
    ok.click(); await idle();
    assert(UI.hasPM() && UI.App.model.features.length === n0, 'a click on the greyed ✓ adds nothing');
    // the fixed face: the base's top, picked as a click would
    UI.App.command.onPick({ kind: 'face', index: 0, point: [4, 0.0598, 3] }); await idle();   // (the command reads the point)
    ok = D.querySelector('#pm .pm-ok');
    assert(UI.pmSpec().values.fixedFace && ok.classList.contains('disabled') && /bends/.test(ok.title), 'then for the bends: ' + ok.title);
    rfPEbtn('Collect All Bends').click(); await idle(); if (UI.previewIdle) await UI.previewIdle(); await wait(200); await idle();
    ok = D.querySelector('#pm .pm-ok');
    assert(UI.pmSpec().values.bends.length === 1 && !ok.classList.contains('disabled'), '✓ lit: ' + ok.title);
    await pmAccept(); await wait(30); await idle();
    var uf = UI.App.model.features[UI.App.model.features.length - 1], bb = UI.App.build.body.getBounds();
    assert(uf.type === 'unfold' && !UI.App.build.errors[uf.id], 'Unfold1: ' + JSON.stringify(uf));
    near(bb.max[1] - bb.min[1], 0.0598, 1e-9, 'the part lies flat');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'ok';
  });

  step('rfPE: the Edge Flange preview has a drag arrow at the flange\'s free end (as Boss-Extrude\'s depth); dragging it sets Length live, ✓ builds that length; Instant3D on the finished flange has the same arrow', async function () {
    var errs0 = errors.length, T = 0.0598;
    await anvil.newPart(); await idle();
    await anvil.run(RFPE_SM); await idle();
    UI.setView('Isometric'); UI.zoomToFit(); await rfPEsettle();
    var fl = rfPEfeat('flange');
    UI.editFeature(fl); await idle(); if (UI.previewIdle) await UI.previewIdle(); await idle();
    var hs = UI.instant3DHandles().filter(function (h) { return h.kind === 'pm' && h.key === 'length'; });
    assert(hs.length === 1, 'one Length arrow: ' + JSON.stringify(anvil.instant3D().handles.map(function (h) { return h.kind + ':' + h.label; })));
    var h = hs[0], tip = h.pos(h.value);
    near(tip[0], 3, 1e-6, 'tip x'); near(tip[1], 1.5, 1e-6, 'tip at the 1.5 outer length (y)'); near(tip[2], T / 2, 1e-6, 'tip in the middle of the wall (z)');
    // drag it up by about half an inch with the mouse
    var g = D.querySelector('#i3d-layer .i3d-handle[data-kind="pm"]'), s0 = h.grab, s1 = UI.worldToScreen([3, 2, T / 2]), s2 = UI.worldToScreen([3, 1.5, T / 2]), dy = s1[1] - s2[1];
    rfPErect = $('viewport').getBoundingClientRect();
    rfPEev('mousedown', s0, { target: g });
    for (var k = 1; k <= 5; k++) { rfPEev('mousemove', [s0[0], s0[1] + dy * k / 5]); await rfPEframe(); }
    rfPEev('mouseup', [s0[0], s0[1] + dy]); await idle();
    var L = UI.pmSpec().values.length;
    assert(Math.abs(L - 2) < 0.02, 'Length follows the drag to about 2: ' + L);
    UI.pmSetValue('length', 2); await idle();
    await pmAccept(); await wait(30); await idle();
    fl = rfPEfeat('flange');
    var bb = UI.App.build.body.getBounds();
    near(bb.max[1], 2, 1e-6, 'the flange stands 2 tall');
    // Instant3D on the flange
    var wasOn = UI.instant3DOn(); if (!wasOn) UI.toggleInstant3D(true);
    try {
      UI.App.sel = { kind: 'feature', id: fl.id }; UI.updateHighlights();
      var fh = UI.instant3DHandles().filter(function (x) { return x.kind === 'fparam' && x.key === 'length'; })[0];
      assert(fh && Math.abs(fh.value - 2) < 1e-9, 'Instant3D length arrow: ' + JSON.stringify(anvil.instant3D().handles));
      near(fh.pos(fh.value)[1], 2, 1e-6, 'at the free end');
    } finally { UI.App.sel = null; UI.updateHighlights(); if (!wasOn) UI.toggleInstant3D(false); }
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'dragged to ' + L.toFixed(3);
  });
  step('rfPE: with Instant3D off a double-click still shows the dimensions (SolidWorks); the Instant3D button stays off, and once they are hidden Instant3D is off again', async function () {
    var wasOn = UI.instant3DOn();
    await anvil.newPart(); await idle();
    await anvil.run(RFPE_BOX); await idle();
    UI.toggleInstant3D(false);
    try {
      var ex = rfPEfeat('extrude');
      rfPEdblRow(ex.id); await idle(); await rfPEframe();
      assert(!UI.hasPM() && UI.featureDimsShown() === ex.id, 'shown with Instant3D off: ' + (UI.hasPM() && UI.pmTitle()));
      assert(anvil.instant3D().handles.some(function (h) { return h.kind === 'depth'; }), 'the depth among them');
      assert(!UI.instant3DOn() && !(D.querySelector('[data-id="instant"].active, [data-id="instant"][aria-pressed="true"]')), 'the Instant3D button still says off');
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await rfPEframe();
      assert(UI.featureDimsShown() == null && !anvil.instant3D().on, 'hidden, Instant3D off again');
      UI.App.sel = { kind: 'feature', id: ex.id }; UI.updateHighlights();
      assert(!anvil.instant3D().handles.length, 'a plain selection shows no arrows with Instant3D off');
      UI.App.sel = null; UI.updateHighlights();
    } finally { UI.toggleInstant3D(wasOn); }
    return 'ok';
  });