  // --- rfMY (2026-11-16, lane smrefs) --- sheet-metal picks follow an edit, with real mouse events: on a bracket (Base
  // Flange, Edge-Flange1 on the front edge, Edge-Flange2 on its far outer edge) the Hem PM takes Edge-Flange2's far edge
  // by a click, ✓; Edit Feature of Edge-Flange1, Length 1 -> 1.5, ✓: the Hem builds (no error, no tree warning) and the
  // model holds its pickRefs; a Ø.25 hole sketched by clicks on Edge-Flange1's inside face and cut (Cut-Extrude PM), then
  // Edge-Flange1's angle 90 -> 75 by its PM: the hole is still on the wall (the sketch plane is the wall's, the cut
  // removes the same metal). Self-contained.
  (function () {
    var T = 0.0598, R = 0.06;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, ' + T + ', 0]], { name: "Edge-Flange1" });\n';
    function rfMYScr3(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
    function rfMYEv(type, c) {
      (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }));
    }
    async function rfMYClickAt(c) { rfMYEv('mousemove', c); await wait(15); rfMYEv('mousedown', c); rfMYEv('mouseup', c); await wait(25); }
    function rfMYFeat(name) { return UI.App.model.features.filter(function (f) { return f.name === name; })[0]; }
    function rfMYLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfMYVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    // a flange's wall from its record: start I (inner face), w along, m across (outer face at -T), the mid along the bend
    function rfMYWall(id) {
      var r = UI.App.build.flanges[id][0], A = r.angle, sA = Math.sin(A), cA = Math.cos(A), V = K.vec;
      var I = V.add(r.origin, V.add(V.scale(r.o, r.R * sA), V.scale(r.u, r.R - r.R * cA)));
      var w = V.add(V.scale(r.o, cA), V.scale(r.u, sA)), m = V.add(V.scale(r.o, -sA), V.scale(r.u, cA)), z = V.norm(V.cross(r.o, r.u));
      var zm = (V.dot(V.sub(r.a, r.origin), z) + V.dot(V.sub(r.b, r.origin), z)) / 2;
      return { I: V.add(I, V.scale(z, zm)), w: w, m: m, L: r.L, T: r.T, at: function (s, h) { return V.add(V.add(I, V.scale(z, zm)), V.add(V.scale(w, s), V.scale(m, h))); } };
    }
    function rfMYTreeFlags() {
      return Array.prototype.filter.call(D.querySelectorAll('#tree .err, #tree .warn'), function (r) { return true; }).map(function (r) { return r.textContent.trim(); });
    }
    async function rfMYEditLength(name, field, value) {
      UI.editFeature(rfMYFeat(name)); await idle(); await wait(30);
      assert(UI.hasPM(), name + ' PM');
      setInput(pmField(field), value); await wait(20);
      await pmAccept(); await idle(); await wait(30);
    }
    step('rfMY: Hem on Edge-Flange2\'s far edge picked by a click, ✓; Edge-Flange1 Length 1 -> 1.5 in its PM: the Hem still builds on that edge (no error, no tree warning), pickRefs in the model', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(HEAD); await idle();
      var f1 = rfMYFeat('Edge-Flange1'), W1 = rfMYWall(f1.id);
      await anvil.append('p.flange(0.75, [' + JSON.stringify(W1.at(W1.L, -W1.T)) + '], { name: "Edge-Flange2" });'); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(40);
      var f2 = rfMYFeat('Edge-Flange2'), W2 = rfMYWall(f2.id), far = W2.at(W2.L, -W2.T);
      UI.cmdHem(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Hem', 'Hem PM');
      // the far outer edge, clicked a little off its middle (the pick must land on it, not on the inner edge T away)
      var e = edgeNear(far), P = K.vec.add(e.mid, K.vec.scale(K.vec.sub(e.b, e.a), 0.1)), s = rfMYScr3(P), r0 = $('viewport').getBoundingClientRect();
      var pe = UI.pickEdge(s[0] - r0.left, s[1] - r0.top);
      assert(pe && pe.edge && K.pointSegmentDistance(far, pe.edge.a, pe.edge.b) < 1e-6, 'Edge-Flange2\'s far outer edge is under the cursor: ' + JSON.stringify(pe && pe.edge && pe.edge.mid));
      await rfMYClickAt(s); await idle();
      assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
      await pmAccept(); await wait(30);
      var hem = rfMYLast();
      assert(hem.hem && !UI.App.build.errors[hem.id], 'hem: ' + JSON.stringify(hem) + ' ' + UI.App.build.errors[hem.id]);
      var ref = hem.pickRefs && hem.pickRefs['edges.0'];
      assert(ref && ref.frame === 'wall' && ref.on === f2.id && ref.end === true, 'the Hem\'s reference is Edge-Flange2\'s outer edge: ' + JSON.stringify(hem.pickRefs));
      var v0 = rfMYVol();
      await rfMYEditLength('Edge-Flange1', 'Length', 1.5);
      assert(rfMYFeat('Edge-Flange1').length === 1.5, 'length 1.5: ' + JSON.stringify(rfMYFeat('Edge-Flange1')));
      var errs = UI.App.build.errors;
      assert(!errs[hem.id] && !errs[f2.id] && !Object.keys(errs).length, 'no errors after the edit: ' + JSON.stringify(errs));
      assert(!Object.keys(UI.App.build.warnings || {}).length, 'no warnings: ' + JSON.stringify(UI.App.build.warnings));
      assert(!rfMYTreeFlags().length, 'tree flags: ' + JSON.stringify(rfMYTreeFlags()));
      near(rfMYVol() - v0, 0.5 * T * 4, 0.02, 'the part grew by the longer wall (about .5 x T x 4)');
      // the Hem's edge moved with Edge-Flange2 (stored point written back), and its reference is unchanged
      var W2b = rfMYWall(f2.id), farB = W2b.at(W2b.L, -W2b.T), hemB = rfMYFeat(hem.name);
      near(hemB.edges[0].at[1], farB[1], 1e-6, 'the Hem\'s pick is on the new outer edge (height)');
      assert(hemB.pickRefs && hemB.pickRefs['edges.0'].on === f2.id, 'pickRefs kept');
      assert(/pickRefs\(/.test(anvil.script()), 'the script writes them');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'hem on Edge-Flange2 at y ' + fmt(farB[1]);
    });
    step('rfMY: a Ø.25 hole sketched by clicks on Edge-Flange1\'s inside face, cut through it (Cut-Extrude PM); Edge-Flange1 angle 90 -> 75 in its PM: the hole is still on the wall, the same metal removed', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(HEAD); await idle();
      UI.setView('Front'); if (UI.finishViewAnimation) UI.finishViewAnimation(); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(40);
      var f1 = rfMYFeat('Edge-Flange1'), W1 = rfMYWall(f1.id), mid = W1.at(W1.L / 2, 0), out = W1.m;
      // select the inside face (toward the base: the Front view sees it) by a click on it, then Sketch
      var fs = rfMYScr3(K.vec.add(mid, [0.6, 0, 0]));
      await rfMYClickAt(fs); await idle();
      assert(UI.App.sel && UI.App.sel.kind === 'face' && K.vec.dot(UI.App.mesh.faces[UI.App.sel.index].normal, out) > 1 - 1e-6, 'Edge-Flange1\'s inside face selected: ' + JSON.stringify(UI.App.sel));
      UI.cmdSketch(); await idle(); await wait(40);
      assert(UI.App.mode === 'sketch', 'sketch on the face');
      var sk = UI.activeSketchFeature(), pl = UI.activePlane();
      assert(sk.plane && sk.plane.face && sk.plane.face.feature === f1.id, 'the sketch is on Edge-Flange1: ' + JSON.stringify(sk.plane && sk.plane.face));
      UI.setTool('circle'); await wait(20);
      await rfMYClickAt(rfMYScr3(mid)); await rfMYClickAt(rfMYScr3(K.vec.add(mid, [0.125, 0, 0]))); await wait(30);
      UI.setTool('select'); await wait(20);
      sk = UI.activeSketchFeature();
      var c = sk.entities.filter(function (x) { return x.t === 'circle'; })[0];
      assert(c && Math.abs(c.r - 0.125) < 0.01, 'circle drawn: ' + JSON.stringify(sk.entities));
      UI.exitSketch(); await idle();
      var v0 = rfMYVol();
      UI.cmdExtrude(true); await wait(30);
      assert(UI.hasPM(), 'Cut-Extrude PM');
      await pmAccept(); await wait(30);
      var cut = rfMYLast();
      assert(cut.type === 'extrude' && cut.cut && !UI.App.build.errors[cut.id], 'cut: ' + JSON.stringify(cut) + ' ' + UI.App.build.errors[cut.id]);
      var removed = v0 - rfMYVol();
      assert(removed > 0.5 * Math.PI * c.r * c.r * T, 'the hole went through the wall: removed ' + removed);
      sk = rfMYFeat(sk.name);
      assert(sk.plane.face.wall, 'the sketch holds its wall reference: ' + JSON.stringify(sk.plane.face));
      var hole0 = K.to3D(sk.plane, c.cx, c.cy), d0 = K.vec.sub(hole0, W1.I), s0 = K.vec.dot(d0, W1.w), nm0 = K.vec.dot(sk.plane.n, W1.m);
      await rfMYEditLength('Edge-Flange1', 'Flange angle', 75);
      assert(rfMYFeat('Edge-Flange1').angle === 75, 'angle 75: ' + JSON.stringify(rfMYFeat('Edge-Flange1')));
      assert(!Object.keys(UI.App.build.errors).length && !rfMYTreeFlags().length, 'no errors / tree flags: ' + JSON.stringify(UI.App.build.errors) + ' ' + JSON.stringify(rfMYTreeFlags()));
      var W1b = rfMYWall(f1.id), skB = rfMYFeat(sk.name), cB = skB.entities.filter(function (x) { return x.t === 'circle'; })[0], hole1 = K.to3D(skB.plane, cB.cx, cB.cy), d1 = K.vec.sub(hole1, W1b.I);
      near(K.vec.dot(skB.plane.n, W1b.m), nm0, 1e-9, 'the sketch plane turned with the wall');
      near(K.vec.dot(d1, W1b.w), s0, 1e-9, 'the hole is as far up the wall as before');
      near(K.vec.dot(d1, W1b.m), 0, 1e-9, 'on the inside face');
      // the same metal removed: the part with the cut suppressed vs not
      var vCut = rfMYVol();
      await anvil.run(anvil.script().replace(/\n[^\n]*p\.cut\([^\n]*/, '')); await idle();
      near(rfMYVol() - vCut, removed, 1e-9, 'the hole removes the same metal at 75°');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'removed ' + removed.toFixed(6) + ' in³';
    });
  })();
