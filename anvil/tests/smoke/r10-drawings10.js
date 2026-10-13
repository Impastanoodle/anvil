  // --- r10/drawings10 ---
  step('r10/drawings10: assembly drawings on OpenCascade match Anvil\'s (Gear train, Hinged cover: view line counts, balloons, BOM, section hatch per component); Gear B\'s bore rim on its shaft is whole in the isometric, not 18 dashes (skipped without vendor/occt)', async function () {
    function occIdle() { return Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]); }
    var DW = W.Drawing, out = [];
    async function sheet(name, occ) {
      if (anvil.drawing.isOpen()) anvil.drawing.close();
      anvil.occt(occ, { remember: false });
      await UI.openExample(exByName(name)); await idle();
      if (occ) {
        var st = await occIdle(); if (st.state === 'failed') return null;
        for (var k = 0; k < 40 && !UI.App.build.occt; k++) { await wait(250); await occIdle(); }
        await idle(); assert(UI.App.build.occt, name + ' built by OpenCascade (' + JSON.stringify(anvil.occt()).slice(0, 120) + ')');
      }
      var s = anvil.drawing.make({ fresh: true }), top = s.views.filter(function (v) { return v.orient === 'Top'; })[0], iso = s.views.filter(function (v) { return v.orient === 'Isometric'; })[0];
      anvil.drawing.sectionView(top.id, { axis: 'h', at: -10, sign: 1 });
      anvil.drawing.autoBalloon(iso.id);
      anvil.drawing.bom('top-right');
      var sm = anvil.drawing.summary(), pr = DW.projectView(UI.App.mesh, 'Isometric', { display: 'hlr' });
      // (a section's line count follows the tessellation of the cut cylinders: only its hatched components are compared)
      return { views: sm.views.map(function (v) { var t = v.stats; return v.name + ' ' + (v.kind === 'section' ? '' : [t.visibleLines, t.hiddenLines, t.visibleCircles, t.hiddenCircles].join('/')) + ' ' + v.hatches.map(function (h) { return h.component; }).join(','); }).join('; '),
        balloons: sm.balloons.map(function (b) { return b.item + ' ' + b.component; }).join(', '), bom: sm.bom.rows.map(function (r) { return r.item + ' ' + r.partNumber + ' x' + r.qty; }).join(', '),
        ells: pr.ellipses.visible.length, short: pr.ellipses.visible.filter(function (e) { return !e.full && e.t1 - e.t0 < 0.3; }).length };
    }
    try {
      for (var name of ['Gear train and patterns', 'Hinged cover (sub-assemblies)']) {
        var a = await sheet(name, false), o = await sheet(name, true);
        if (!o) return 'skipped: OpenCascade not installed';
        ['views', 'balloons', 'bom', 'ells'].forEach(function (k) { assert(a[k] === o[k], name + ' ' + k + ': Anvil ' + a[k] + ' / OpenCascade ' + o[k]); });
        assert(o.short === 0, name + ': ' + o.short + ' visible ellipse dashes in the isometric on OpenCascade');
        out.push(name + ': ' + o.ells + ' ellipses, BOM ' + o.bom);
      }
      return out.join('; ');
    } finally {
      if (anvil.drawing.isOpen()) anvil.drawing.close();
      anvil.occt(false, { remember: false });
      await idle();
    }
  });
  // --- end r10/drawings10 ---
