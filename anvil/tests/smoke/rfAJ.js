  // ---- rfAJ (shop audit 2 #2 / #3, 2026-10-12): a Hole Wizard hole's callout reads the feature (SolidWorks), by pick
  // and from Model Items ▸ Hole callouts — also the CSK whose 82° cone goes through the 16 ga sheet (no Ø.281 cylinder)
  var rfAJT = 0.0598;
  async function rfAJPart() {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in"); p.sheet(' + rfAJT + ', ' + rfAJT + ', 0.5);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange(' + rfAJT + ');\n' +
      'p.holeWizard({ face: "Top", offset: ' + rfAJT + ', points: [[2, -3], [2, -1.5]], standard: "ANSI Inch", type: "hole", size: "1/4", fit: "normal", end: "through" });\n' +
      'p.holeWizard({ face: "Top", offset: ' + rfAJT + ', points: [[5, -3]], standard: "ANSI Inch", type: "tap", size: "1/4-20 UNC", end: "through" });\n' +
      'p.holeWizard({ face: "Top", offset: ' + rfAJT + ', points: [[8, -3]], standard: "ANSI Inch", type: "csk", size: "1/4", fit: "normal", end: "through" });'); await idle();
    assert(Object.keys(UI.App.build.errors || {}).length === 0, 'build errors ' + JSON.stringify(UI.App.build.errors));
    assert(anvil.drawing.make(), 'drawing');
    var s = anvil.drawing.standard3View(), top = s.views.filter(function (v) { return v.orient === 'Top'; })[0];
    assert(top, 'Top view');
    return top;
  }
  function rfAJCallouts(sm) { return sm.annotations.filter(function (a) { return a.type === 'holeCallout'; }).sort(function (a, b) { return a.text < b.text ? -1 : 1; }); }
  function rfAJCheck(list) {
    var t = list.map(function (a) { return a.text; });   // (the callout's lines joined with a space)
    assert(list.length === 3, 'three callouts: ' + t.join(' | '));
    var clear = t.filter(function (x) { return /^2X /.test(x); })[0], tap = t.filter(function (x) { return /UNC/.test(x); })[0], csk = t.filter(function (x) { return /⌵/.test(x); })[0];
    assert(clear === '2X Ø.266 THRU ALL', 'clearance (two positions): ' + clear + ' of ' + t.join(' | '));
    assert(tap === 'Ø.201 THRU ALL 1/4-20 UNC - 2B THRU ALL', 'tapped: ' + tap);
    assert(csk === 'Ø.266 THRU ALL ⌵ Ø.507 X 82°', 'countersink, from the feature (not the far-side Ø.403): ' + csk);
    assert(list.every(function (a) { return !a.dangling; }), 'attached: ' + list.map(function (a) { return a.dangling; }).join());
    return t.join(' | ');
  }
  step('rfAJ: Hole Callout by pick on a Hole Wizard hole reads the feature\'s callout — "2X Ø.266 THRU ALL", "Ø.201 THRU ALL" / "1/4-20 UNC - 2B THRU ALL", and the CSK through a 16 ga sheet "Ø.266 THRU ALL" / "⌵ Ø.507 X 82°" (not Ø.403)', async function () {
    var errs0 = errors.length, top = await rfAJPart();
    anvil.drawing.holeCallout(top.id, { c: [2, -3], r: 0.133 });
    anvil.drawing.holeCallout(top.id, { c: [5, -3], r: 0.1005 });
    var sm = anvil.drawing.holeCallout(top.id, { c: [8, -3], r: (0.507 - 2 * rfAJT * Math.tan(41 * Math.PI / 180)) / 2 });
    assert(sm, 'callouts placed: ' + statusText());
    var out = rfAJCheck(rfAJCallouts(sm));
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return out;
  });
  step('rfAJ: Model Items ▸ Hole callouts inserts one hole callout per Hole Wizard hole with the feature\'s text and no Ø dimension on its circles; inserting again keeps three, without Hole callouts they go', async function () {
    var errs0 = errors.length, top = await rfAJPart();
    var sm = anvil.drawing.modelItems({ views: [top.id], holeCallouts: true, holeLocations: true, dedupe: true });
    assert(/Model Items inserted into 1 view/.test(statusText()), statusText());
    var out = rfAJCheck(rfAJCallouts(sm));
    var holeC = [[2, -3], [2, -1.5], [5, -3], [8, -3]];
    var dia = sm.dims.filter(function (d) { return d.view === top.id && d.kind === 'dia' && holeC.some(function (q) { return Math.hypot(d.c[0] - q[0], d.c[1] - q[1]) < 1e-3; }); });
    assert(dia.length === 0, 'no Ø dimension on a Hole Wizard hole: ' + dia.map(function (d) { return d.text; }).join());
    sm = anvil.drawing.modelItems({ views: [top.id], holeCallouts: true, holeLocations: true, dedupe: true });
    assert(rfAJCallouts(sm).length === 3, 'again: still three');
    sm = anvil.drawing.modelItems({ views: [top.id], holeCallouts: false, holeLocations: true, dedupe: true });
    assert(rfAJCallouts(sm).length === 0, 'Hole callouts off: none');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return out;
  });
  // --- end rfAJ ---
