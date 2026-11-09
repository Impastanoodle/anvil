  // --- rfKJ (2026-11-09, lane insertbends2): Insert Bends on a closed tray (walls drafted 10°, shelled 14 ga). The PM
  // says the bends close a ring; the four corner edges are clicked into Rip Parameters (a second click takes one out),
  // the preview counts 4 bends; Reverse direction is ticked; ✓ = the kernel's part (rips, gap, reverse stored), the flat
  // is the kernel's, its bend notes the other way round from the same part without Reverse direction. ---
  function rfKJEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfKJClick(p) { rfKJEv('mousemove', p); rfKJEv('mousedown', p, $('viewport')); rfKJEv('mouseup', p); }
  var rfKJTray = 'p.units("in");\np.sketch("Top").rect(0, 0, 6, 4).end().extrude(2, { draft: 10, draftOutward: true });\np.shell(0.0747, [[3, 2, -2]]);';

  step('rfKJ: Insert Bends on a drafted tray — the four corner edges clicked into Rip Parameters, Reverse direction, ✓ = the kernel\'s part and flat', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(rfKJTray); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Insert Bends/.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
    assert(btn, 'Insert Bends on the ribbon');
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Insert Bends', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(pmField('Reverse direction') && pmField('Rip gap'), 'Reverse direction and Rip gap in the PM');
    // the floor, inside the tray
    var s = UI.worldToScreen([3, 0.0747, -2]), pk = UI.pickFace(s[0], s[1]);
    assert(pk && pk.point && Math.abs(pk.point[1] - 0.0747) < 1e-6, 'the inside of the floor under the cursor: ' + JSON.stringify(pk && pk.point));
    rfKJClick(s); await idle(); await wait(30);
    assert(UI.pmSpec().values.fixedFace, 'fixed face');
    assert(/close a ring.*Rip Parameters/.test(statusText()), 'unripped: ' + statusText());
    // one clickable corner edge at each corner of the tray: seen from the top, the inside corners (the walls flare out)
    UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var t = Math.tan(10 * Math.PI / 180), corners = [[0, 0], [6, 0], [6, -4], [0, -4]], picks = [];
    corners.forEach(function (c) {
      var es = UI.App.edges.filter(function (e) { return Math.abs(e.dir[1]) > 0.5 && Math.hypot(e.mid[0] - c[0], e.mid[2] - c[1]) < 0.4; });
      var hit = es.filter(function (e) { var q = UI.worldToScreen(e.mid), pe = UI.pickEdge(q[0], q[1]); return pe && pe.edge === e; })[0];
      assert(hit, 'a corner edge clickable at ' + JSON.stringify(c) + ' (' + es.length + ' edges there)');
      picks.push(hit);
    });
    for (var i = 0; i < picks.length; i++) { rfKJClick(UI.worldToScreen(picks[i].mid)); await idle(); await wait(20); }
    assert(UI.pmSpec().values.ripEdges.length === 4, 'four edges to rip: ' + JSON.stringify(UI.pmSpec().values.ripEdges));
    rfKJClick(UI.worldToScreen(picks[0].mid)); await idle(); await wait(20);
    assert(UI.pmSpec().values.ripEdges.length === 3, 'a second click takes it out');
    rfKJClick(UI.worldToScreen(picks[0].mid)); await idle(); await wait(20);
    assert(UI.pmSpec().values.ripEdges.length === 4, 'and back in');
    assert(/4 bends/.test(statusText()), 'preview: ' + statusText());
    pmField('Reverse direction').click(); await idle(); await wait(20);
    assert(UI.pmSpec().values.reverse === true, 'Reverse direction ticked');
    var v = UI.pmSpec().values;
    await pmAccept(); await wait(30);
    assert(!UI.hasPM(), '✓ closes');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'insertBends' && f.ripEdges && f.ripEdges.length === 4 && f.reverse === true && f.gap > 0, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    // the kernel's part from the same picks, and the same part without Reverse direction
    function ref(rev) {
      var m = K.newModel('r');
      K.runScript(m, rfKJTray + '\np.insertBends(' + JSON.stringify(v.fixedFace) + ', { radius: ' + UI.App.model.sheet.bendRadius + ', kFactor: ' + UI.App.model.sheet.kFactor + ', ripEdges: ' + JSON.stringify(v.ripEdges) + ', gap: ' + f.gap + (rev ? ', reverse: true' : '') + ' });\n');
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, 'reference: ' + JSON.stringify(b.errors));
      return { vol: K.massProps(mesh, 1).volume, flat: K.flatPattern(m, b, mesh) };
    }
    var a = ref(true), n = ref(false), flat = anvil.flat();
    near(K.massProps(UI.App.mesh, 1).volume, a.vol, 1e-9, 'the part');
    near(flat.size[0], a.flat.size[0], 1e-9, 'flat X'); near(flat.size[1], a.flat.size[1], 1e-9, 'flat Y');
    var up = function (fl) { return fl.bends.map(function (q) { return /^UP/.test(q.label); }); };
    assert(flat.bends.length === 4 && up(flat).every(function (x, i) { return x !== up(n.flat)[i]; }), 'bend notes the other way round: ' + flat.bends.map(function (q) { return q.label; }) + ' / ' + n.flat.bends.map(function (q) { return q.label; }));
  });
