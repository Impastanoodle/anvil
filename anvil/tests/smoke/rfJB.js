  // --- rfJB (2026-11-05, lane drawroom) --- in the app: a drawing of the shop audit's bracket with Model Items on leaves
  // the Front view's 2.000 above the title / tolerance blocks and no dimension across another view; anvil.drawing
  // .holeTable with an origin that is not a vertex says so and adds nothing (no undo step), a vertex works.
  var JB_PART = 'p.name("JBBracket").units("in");\np.sketch("Front").line(0, 1.5, 0, 0.12).arc(0.12, 0.12, 0.12, 180, 270).line(0.12, 0, 2, 0).line(2, 0, 2, 0.06).line(2, 0.06, 0.12, 0.06).arc(0.12, 0.12, 0.06, 270, 180).line(0.06, 0.12, 0.06, 1.5).line(0.06, 1.5, 0, 1.5).end().extrude(2);\n' +
    'p.sketch("Top").circle(1.4, -0.5, 0.2).end().cut("through");\np.sketch("Top").circle(1.4, -1.5, 0.2).end().cut("through");';
  function jbBox(p) {
    var DWg = W.Drawing;
    if (p.k === 'text') return DWg.textRect(p);
    if (p.k === 'line') return { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) };
    return null;
  }
  function jbMeet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
  step('rfJB: Standard 3 View + Model Items of the bracket at 2 : 1: no dimension in the title or tolerance block, none across another view; a Hole Table origin off the vertices is refused with a message and no undo step', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(JB_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.modelItems(true); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary();
    assert(s.sheet.scale === '2:1' && s.autoDims && s.dims.indexOf('2.000') >= 0, 'bracket at 2:1 with model items: ' + JSON.stringify([s.sheet.scale, s.dims]));
    var sh = UI.drawing.state.sheet, tbs = W.Drawing.tbRects(sh.size, 'in'), bad = [];
    sh.dims.forEach(function (d, i) {
      sh.prims.forEach(function (p) {
        if (p.dimIx !== i) return;
        var b = jbBox(p); if (!b) return;
        tbs.forEach(function (t) { if (jbMeet(b, t)) bad.push(d.text + ' in a block'); });
        sh.views.forEach(function (w) { if (w.view.id !== d.view && jbMeet(b, w.box)) bad.push(d.text + ' across ' + w.view.name); });
      });
    });
    assert(!bad.length, bad.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; '));
    // Hole Table: an origin that is no vertex of the Front view
    var F = s.views.filter(function (v) { return v.orient === 'Top'; })[0], n0 = UI.App.undo.length;
    var got = anvil.drawing.holeTable(F.id, { origin: [1.1, -0.9], all: true });
    var n1 = UI.App.undo.length;
    assert(got == null && n1 === n0, 'refused, no undo step: ' + JSON.stringify([got, n0, n1]));
    var st = D.getElementById('status-msg');
    assert(st && /not a vertex/.test(st.textContent), 'status says why: ' + (st && st.textContent));
    assert(!anvil.drawing.holeTables().length, 'no table');
    var vb = UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === F.id; })[0].proj.bounds;
    got = anvil.drawing.holeTable(F.id, { origin: [vb.umin, vb.vmin], all: true }); await UI.drawing.ready();
    assert(got != null && anvil.drawing.holeTables().length === 1 && !anvil.drawing.holeTables()[0].dangling, 'a vertex: ' + JSON.stringify(anvil.drawing.holeTables()));
    assert(Array.isArray(anvil.drawing.summary().warnings), 'summary().warnings');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
