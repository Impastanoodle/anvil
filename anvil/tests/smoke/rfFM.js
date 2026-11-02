  // --- rfFM (2026-10-29, lane FM: fillet / chamfer on any edge builds right or says why) --- in the app on Anvil's
  // engine: a round that breaks through a shelled box's 2 mm wall is refused with SolidWorks' message and the part keeps
  // its shape; an inside-corner R9 on a thin L is exact and watertight; the Funnel's shelled loft shades smooth.
  // (R7.2 round the rim was the refused case here; SolidWorks builds that one, 7015.928 mm³: rfGG. R9 on the outer edge
  // is the case SolidWorks' own check faults.)
  async function rfFMPart(code) {
    await anvil.newPart(); await idle();
    if (anvil.occt) anvil.occt(false, { remember: false });
    await anvil.run(code).catch(function () { });   // a refused feature rejects the run; the build stays
    await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
  }
  step('rfFM: Fillet R9 through the 2 mm wall of a shelled box is refused ("Failed to create fillet. The radius may be too large for the selected edges."), the box unchanged; an inside-corner R9 on an L with 8 mm legs is exact and watertight', async function () {
    await rfFMPart('p.units("mm"); p.box(40, 20, 30); p.shell(2, [[20, 30, 10]]);\np.fillet(9, [[0, 0, 10]]);');
    var f = UI.App.model.features[UI.App.model.features.length - 1], msg = UI.App.build.errors[f.id];
    assert(f.type === 'fillet' && msg === 'Failed to create fillet. The radius may be too large for the selected edges.', 'error: ' + msg);
    near(K.massProps(UI.App.mesh, 1).volume, 7872, 1e-6, 'the shelled box is kept');
    await rfFMPart('p.units("mm"); p.sketch("Front").polyline([[0,0],[40,0],[40,8],[8,8],[8,30],[0,30]], true).extrude(20);\np.fillet(9, [[8, 8, 10]]);');
    assert(!Object.keys(UI.App.build.errors || {}).length, 'errors: ' + JSON.stringify(UI.App.build.errors));
    near(K.massProps(UI.App.mesh, 1).volume, 9920 + (1 - Math.PI / 4) * 81 * 20, 1e-6, 'L + R9');
    assert(K.meshQuality(UI.App.mesh).openEdges === 0, 'watertight');
  });
  step('rfFM: the Funnel\'s shelled loft shades smooth in the viewport: no facet triangle of a record-less curved face keeps its flat normal', async function () {
    var ex = anvil.examples.filter(function (e) { return e.name === 'Funnel'; })[0];
    await rfFMPart(ex.code);
    var m = UI.App.mesh, sm = UI.analyticNormals(m), flat = 0, tot = 0;
    m.faces.forEach(function (fc) {
      if (!fc.polys || fc.polys.some(function (p) { return p.surf; }) || Math.abs(fc.normal[1]) > 0.99) return;
      for (var t = fc.start; t < fc.start + fc.count; t++) {
        tot++;
        var d = 0;
        for (var k = 0; k < 9; k++) d = Math.max(d, Math.abs(sm[t * 9 + k] - m.normals[t * 9 + k]));
        if (d <= 1e-3) flat++;
      }
    });
    // lane FX: the Funnel's coaxial loft is a cone record now and its shell's inner walls carry the offset cone: they
    // shade from the records, so no record-less loft triangles may be left to check
    var cone = m.faces.filter(function (fc) { return fc.polys && fc.polys.some(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cone'; }); }).length;
    assert(flat === 0 && (tot > 1000 || cone > 100), flat + ' of ' + tot + ' facet triangles shade flat (' + cone + ' cone faces)');
  });
