  // --- rfDK (2026-10-27, lane DK): Flat-Pattern1 PM with real clicks (Grain direction = an edge, Fixed face = a
  // face, ✓, undo), Closed Corner's Open bend region box (off by default: the bend region is filled), Jog's Fix
  // projected length box (the far end stays). Self-contained. ---
  (function () {
    var T = 0.0598, R = 0.0598, GAP = 0.01;
    var L42 = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1.5, [[4, ' + T + ', 1]], { position: "inside", lengthRef: "outer" });\n';
    function rfDKEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfDKClick(p) { rfDKEv('mousemove', p); rfDKEv('mousedown', p, $('viewport')); rfDKEv('mouseup', p); }
    function rfDKnearRel(a, b, tol, label) { if (!(Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-12))) fail((label || 'value') + ' = ' + a + ', expected ' + b + ' (rel ' + tol + ')'); }
    function rfDKVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfDKd(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
    function rfDKEdge(a, b) {
      return UI.App.edges.filter(function (e) { return e.a && e.b && ((rfDKd(e.a, a) < 1e-6 && rfDKd(e.b, b) < 1e-6) || (rfDKd(e.a, b) < 1e-6 && rfDKd(e.b, a) < 1e-6)); })[0];
    }

    step('rfDK: Flat-Pattern1 ▸ Edit Feature — click the 2 in edge for Grain direction (the flat turns: 2 wide), ✓; reopen, click the flange wall for Fixed face, ✓ (the flat lies in the wall plane); undo puts the fixed face back off; Flatten draws the turned flat', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(L42); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var w0 = anvil.flat().size;
      UI.cmdFlatPatternEdit(); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Flat-Pattern1', 'Flat-Pattern1 PM');
      assert(!pmField('Merge faces') && !pmField('Corner treatment'), 'no dead boxes');
      // the 2 in edge on top at x = 0 (z 0..2): its own middle on screen, checked with the app's own edge pick
      var e = rfDKEdge([0, T, 0], [0, T, 2]);
      assert(e, 'the 2 in edge exists');
      var s = UI.worldToScreen(e.mid), pe = UI.pickEdge(s[0], s[1]);
      assert(pe && pe.edge === e, 'pickEdge finds the 2 in edge at its middle');
      rfDKClick(s); await idle(); await wait(20);
      var g = UI.pmSpec().values.grain;
      assert(g && Math.abs(Math.abs(g.dir[2]) - 1) < 1e-9, 'grain taken: ' + JSON.stringify(g));
      assert(/Flat size2 × 5\.4017 in/.test($('pm').textContent), 'the PM shows the turned flat: ' + $('pm').textContent.slice(0, 400));
      await pmAccept(); await wait(20);
      assert(!UI.hasPM(), 'PM closed');
      assert(UI.App.model.flatGrain && Math.abs(Math.abs(UI.App.model.flatGrain.dir[2]) - 1) < 1e-9, 'model.flatGrain saved');
      var f1 = anvil.flat();
      near(f1.size[0], w0[1], 1e-9, 'flat width = 2'); near(f1.size[1], w0[0], 1e-9, 'flat height = 4 + flange − BD');
      // Fixed face: the wall's outer face (x = 4), seen in the isometric
      UI.cmdFlatPatternEdit(); await idle(); await wait(20);
      var s2 = UI.worldToScreen([4, 0.9, 1.2]), pf = UI.pickFace(s2[0], s2[1]);
      assert(pf && Math.abs(pf.point[0] - 4) < 1e-6, 'the wall\'s outer face under the cursor: ' + (pf && JSON.stringify(pf.point)));
      rfDKClick(s2); await idle(); await wait(20);
      assert(UI.pmSpec().values.fixed && Math.abs(UI.pmSpec().values.fixed[0] - 4) < 1e-6, 'fixed face taken');
      await pmAccept(); await wait(20);
      var f2 = anvil.flat();
      near(Math.abs(f2.plane.n[0]), 1, 1e-9, 'the flat lies in the wall\'s plane');
      assert(UI.App.model.flatFixed && UI.App.model.flatGrain, 'both saved');
      UI.undo(); await idle(); await wait(20);
      assert(!UI.App.model.flatFixed && UI.App.model.flatGrain, 'undo: the fixed face goes, the grain stays');
      UI.toggleFlatten(true); await idle(); await wait(30);
      assert(UI.App.flat && Math.abs(UI.App.flat.size[0] - 2) < 1e-9, 'Flatten shows the turned flat');
      // editing while flattened folds for the picks and puts the state back on ✗
      UI.cmdFlatPatternEdit(); await idle(); await wait(20);
      assert(!UI.App.model.flatState, 'folded to pick');
      UI.pmCancel(); await idle();
      assert(UI.App.model.flatState, 'flattened again after ✗');
      UI.toggleFlatten(false); await idle();
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfDK: Closed Corner — Open bend region box unchecked by default (the bend region is filled: more than the open corner), checking it leaves the bend region open; Jog — Fix projected length checked keeps the far end at x = 4', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      var TRAY = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (q) { return 'p.flange(1, [' + JSON.stringify(q) + '], { position: "bendOutside", lengthRef: "outer" });\n'; }).join('');
      await anvil.run(TRAY); await idle();
      var v0 = rfDKVol(), at = [-(R + T / 2), 0.6, 0];
      var k = K.resolveFaces([{ at: at }], UI.App.mesh, K.pickTol('in', T / 2))[0];
      assert(k != null && k >= 0, 'the left wall\'s end face');
      UI.setSelection([{ kind: 'face', index: k, point: at }]);
      UI.cmdClosedCorner(); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmSpec().values.faces.length === 1, 'the pre-selected end face in the PM');
      // the session remembers the last corner type / gap (an earlier group may have used Overlap .02): Butt, .01
      D.querySelector('#pm button[data-key="cornerType:butt"]').click(); await wait(20);
      var gp = pmField('Gap distance'); gp.focus(); gp.select(); setInput(gp, '0.01'); await wait(20);
      assert(UI.pmSpec().values.cornerType === 'butt' && +UI.pmSpec().values.gap === 0.01, 'Butt, gap .01: ' + JSON.stringify(UI.pmSpec().values));
      var ob = pmField('Open bend region');
      assert(ob && !ob.disabled && !ob.checked, 'Open bend region: live, off');
      await pmAccept(); await wait(20);
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'closedCorner' && f.closeBend === true && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f));
      var vClosed = rfDKVol();
      UI.editFeature(f); await idle(); await wait(30);
      pmField('Open bend region').click(); await wait(20);
      await pmAccept(); await wait(20);
      f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(!f.closeBend, 'open: no closeBend');
      var vOpen = rfDKVol(), sec = K.signedArea(K.flangeProfile(Math.PI / 2, R, T, 0, 0));
      assert(vClosed > vOpen && vOpen > v0, 'volumes: ' + [v0, vOpen, vClosed].join(', '));
      rfDKnearRel(vClosed - vOpen, 2 * sec * (R - GAP / Math.SQRT2), 1e-6, 'the bend-region fill (Coplanar faces on: both front corners; lane DV: Butt extends R − gap/√2)');
      // Jog: Fix projected length
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.sketch("Top", ' + T + ').line(2, 0, 2, -3).jog(0.5, { fixed: [0.5, ' + T + ', 1.5] });\n'); await idle();
      var jf = UI.App.model.features[UI.App.model.features.length - 1];
      UI.editFeature(jf); await idle(); await wait(30);
      var fx = pmField('Fix projected length');
      assert(fx && !fx.disabled && !fx.checked, 'Fix projected length: live, off');
      fx.click(); await wait(20);
      await pmAccept(); await wait(30);
      jf = UI.App.model.features[UI.App.model.features.length - 1];
      assert(jf.fixLength === true && !UI.App.build.errors[jf.id], 'fixLength saved: ' + JSON.stringify(jf));
      var xmax = -Infinity; UI.App.build.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { xmax = Math.max(xmax, v.pos.x); }); });
      near(xmax, 4, 1e-9, 'the far end stays at x = 4');
      assert(anvil.flat().size[0] > 4.4, 'the flat is longer: ' + anvil.flat().size[0]);
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
