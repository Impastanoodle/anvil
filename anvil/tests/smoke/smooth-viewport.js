  // --- smooth/viewport ---
  function vpEv(type, p, opts, target) {
    var r = $('viewport').getBoundingClientRect();
    var o = Object.assign({ bubbles: true, cancelable: true, clientX: r.left + p[0], clientY: r.top + p[1] }, opts || {});
    (target || (type === 'mousedown' || type === 'wheel' ? $('viewport') : W)).dispatchEvent(type === 'wheel' ? new W.WheelEvent('wheel', o) : new W.MouseEvent(type, o));
  }
  async function vpTicks(ms) { var t0 = W.performance.now(); while (W.performance.now() - t0 < ms) { UI.tick(); await wait(16); } UI.tick(); }
  step('smooth/viewport: view changes glide (logical camera at the new view at once, in-between poses on screen, overlays hidden until it lands); a rotate mid-way starts from the pose on screen; scripts land at once', async function () {
    need(UI, 'viewPose'); need(UI, 'finishViewAnimation'); need(UI, 'tick');
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    UI.setView('Isometric');
    assert(!UI.viewAnimating(), 'a script call does not animate');
    UI.viewAnimation = true;
    try {
      UI.setView('Front');
      near(UI.cam.dir.z, 1, 1e-9, 'logical camera normal to Front at once');
      assert(UI.viewAnimating(), 'transition running');
      var e = new W.THREE.Matrix4().makeRotationFromQuaternion(UI.viewPose().q).elements;
      assert(e[10] < 0.99, 'the pose on screen starts at the old view (dir.z ' + e[10] + ')');
      assert($('dim-layer').style.visibility === 'hidden', 'dimension overlay hidden while moving');
      await vpTicks(420);
      assert(!UI.viewAnimating(), 'landed');
      assert($('dim-layer').style.visibility === '', 'overlay back');
      e = new W.THREE.Matrix4().makeRotationFromQuaternion(UI.viewPose().q).elements;
      near(e[10], 1, 1e-6, 'pose on screen = Front');
      // a rotate during a transition continues from what is on screen, not from where the view was going
      UI.setView('Top');
      UI.rotateView(0, 0);
      assert(!UI.viewAnimating() && Math.abs(UI.cam.dir.y) < 0.99, 'settled where it was (dir.y ' + UI.cam.dir.y + ')');
      UI.setView('Isometric'); UI.finishViewAnimation();
      near(UI.cam.dir.x, Math.sqrt(1 / 3), 1e-9, 'finishViewAnimation lands at once');
    } finally { UI.viewAnimation = undefined; UI.finishViewAnimation(); }
  });
  step('smooth/viewport: wheel zoom about the cursor in proportion to deltaY (one notch 1.12×), eased over frames for a person and at once for a script; Shift + middle drag zooms, Ctrl + middle drag pans, middle drag rotates', async function () {
    need(UI, 'wheelZoom');
    UI.setView('Front');
    var vr = $('viewport').getBoundingClientRect(), p = [Math.round(vr.left + UI.size.w * 0.3) - vr.left, Math.round(vr.top + UI.size.h * 0.4) - vr.top], s0 = UI.cam.scale;   // whole client pixels, as events carry
    var w0 = UI.screenToPlane(p[0], p[1], K.makePlane('Front', 0));
    vpEv('wheel', p, { deltaY: -100 });
    near(UI.cam.scale, s0 / 1.12, 1e-9 * s0, 'one notch in');
    var w1 = UI.screenToPlane(p[0], p[1], K.makePlane('Front', 0));
    near(w1[0], w0[0], 1e-6, 'point under the cursor x'); near(w1[1], w0[1], 1e-6, 'point under the cursor y');
    vpEv('wheel', p, { deltaY: 3 });
    near(UI.cam.scale, s0 / 1.12 * Math.exp(Math.log(1.12) * 0.03), 1e-9 * s0, 'a small trackpad delta zooms a little');
    UI.viewAnimation = true;
    try {
      var s1 = UI.cam.scale;
      vpEv('wheel', p, { deltaY: 200 });
      near(UI.cam.scale, s1, 1e-12, 'eased: nothing yet');
      await vpTicks(450);
      near(UI.cam.scale, s1 * 1.12 * 1.12, 1e-6 * s1, 'two notches out after the easing');
      var w2 = UI.screenToPlane(p[0], p[1], K.makePlane('Front', 0));
      near(w2[0], w0[0], 1e-6, 'still about the cursor');
    } finally { UI.viewAnimation = undefined; }
    // middle-button drags
    var c = [UI.size.w / 2, UI.size.h / 2], s2 = UI.cam.scale, d2 = UI.cam.dir.clone();
    vpEv('mousedown', c, { button: 1, buttons: 4, shiftKey: true }); vpEv('mousemove', [c[0], c[1] - 50], { buttons: 4, shiftKey: true }); vpEv('mouseup', [c[0], c[1] - 50], { button: 1, shiftKey: true });
    assert(UI.cam.scale < s2 * 0.9 && UI.cam.dir.distanceTo(d2) < 1e-9, 'Shift + middle drag up zooms in (' + s2 + ' → ' + UI.cam.scale + ')');
    var s3 = UI.cam.scale, t3 = UI.cam.target.clone();
    vpEv('mousedown', c, { button: 1, buttons: 4, ctrlKey: true }); vpEv('mousemove', [c[0] + 40, c[1]], { buttons: 4, ctrlKey: true }); vpEv('mouseup', [c[0] + 40, c[1]], { button: 1, ctrlKey: true });
    near(UI.cam.scale, s3, 1e-12, 'Ctrl + middle drag keeps the zoom'); near(UI.cam.target.x, t3.x - 40 * s3, 1e-6, 'and pans');
    vpEv('mousedown', c, { button: 1, buttons: 4 }); vpEv('mousemove', [c[0] + 40, c[1]], { buttons: 4 }); vpEv('mouseup', [c[0] + 40, c[1]], { button: 1 });
    assert(UI.cam.dir.distanceTo(d2) > 0.1, 'middle drag rotates');
    UI.setView('Isometric');
    return 'scale ' + fmt(s0) + ' → ' + fmt(UI.cam.scale);
  });
  step('smooth/viewport: the view turns about the model centre (a panned part spins in place); curved faces get GPU silhouette edges; an idle viewport is not redrawn, a scene change is', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").circle(0, 0, 10).extrude(30);'); await idle();
    UI.setView('Front');
    UI.panView(-120, 0);
    var c0 = UI.worldToScreen([0, 15, 0]);
    UI.rotateView(60, 25);
    var c1 = UI.worldToScreen([0, 15, 0]);
    near(c1[0], c0[0], 1e-6, 'model centre stays put on screen x'); near(c1[1], c0[1], 1e-6, 'y');
    UI.setView('Isometric');
    var sil = UI.groups.edges.children.filter(function (o) { return o.userData.silhouette; })[0];
    assert(sil && sil.geometry.getAttribute('n1') && sil.geometry.getAttribute('position').count > 20, 'silhouette line set with facet normals');
    UI.App.view.style = 'shaded'; UI.applyDisplayStyle();
    assert(!sil.visible, 'no edges in Shaded');
    UI.App.view.style = 'shadedEdges'; UI.applyDisplayStyle();
    assert(sil.visible, 'back in Shaded With Edges');
    UI.tick(); UI.tick();
    var info = UI.renderer.info.render, n0 = info.frame;
    UI.tick(); UI.tick();
    assert(info.frame === n0, 'idle frames draw nothing (' + (info.frame - n0) + ')');
    var g = new W.THREE.BufferGeometry(); g.setAttribute('position', new W.THREE.Float32BufferAttribute([0, 0, 0, 50, 0, 0], 3));
    var line = new W.THREE.LineSegments(g); UI.groups.preview.add(line);
    UI.tick();
    assert(info.frame === n0 + 1, 'an object added to the scene is drawn on the next frame');
    UI.groups.preview.remove(line); UI.tick();
    UI.rotateView(5, 0); UI.tick();
    assert(info.frame === n0 + 3, 'a camera move is drawn');
  });
  step('smooth/viewport: a middle-button double-click zooms to fit; the pre-selection under a resting cursor survives a rebuild', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    UI.setView('Front');
    UI.zoomView(4);
    var s0 = UI.cam.scale, c = [Math.round(UI.size.w / 2), Math.round(UI.size.h / 2)];
    vpEv('mousedown', c, { button: 1, buttons: 4 }); vpEv('mouseup', c, { button: 1 });
    vpEv('mousedown', c, { button: 1, buttons: 4 }); vpEv('mouseup', c, { button: 1 });
    UI.finishViewAnimation();
    assert(UI.cam.scale < s0 / 2, 'zoomed to fit (' + s0 + ' → ' + UI.cam.scale + ')');
    var p = UI.worldToScreen([0, 5, 10]);
    vpEv('mousemove', p, {}, $('viewport'));
    assert(UI.App.hover && UI.App.hover.kind === 'face', 'hovering the front face');
    await UI.rebuild(); await idle();
    assert(UI.App.hover && UI.App.hover.kind === 'face', 'still pre-selected after the rebuild');
    vpEv('mousemove', [2, 2], {}, $('viewport'));
  });
  // --- end smooth/viewport ---
