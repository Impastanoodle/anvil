  // --- r11/hatch11 ---
  step('r11/hatch11: SECTION A-A of the Gear train has the same lines on OpenCascade as on Anvil (21, was 26: a cut cylinder\'s edge in pieces), and the Hinged cover\'s section hatches each part inside its sub-assemblies alike on both (skipped without vendor/occt)', async function () {
    function occIdle() { return Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]); }
    async function sec(name, occ) {
      if (anvil.drawing.isOpen()) anvil.drawing.close();
      anvil.occt(occ, { remember: false });
      await UI.openExample(exByName(name)); await idle();
      if (occ) {
        var st = await occIdle(); if (st.state === 'failed') return null;
        for (var k = 0; k < 40 && !UI.App.build.occt; k++) { await wait(250); await occIdle(); }
        await idle(); assert(UI.App.build.occt, name + ' built by OpenCascade');
      }
      var s = anvil.drawing.make({ fresh: true }), tv = s.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var sm = anvil.drawing.sectionView(tv.id, { axis: 'h', at: -10, sign: 1 }), sv = sm.views.filter(function (v) { return v.kind === 'section'; })[0];
      return { lines: sv.stats.visibleLines + '/' + sv.stats.hiddenLines, hatch: sv.hatches.map(function (h) { return (h.part || h.component) + ' ' + h.angle + '/' + h.spacing; }).join(', ') };
    }
    try {
      var out = [];
      for (var name of ['Gear train and patterns', 'Hinged cover (sub-assemblies)']) {
        var a = await sec(name, false);
        if (name === 'Hinged cover (sub-assemblies)') assert(a.hatch.split(', ').length === 5 && /Hinge<1>\/Leaf<1>/.test(a.hatch) && /Hinge<2>\/Arm<1>/.test(a.hatch), 'a hatch per part: ' + a.hatch);
        var o = await sec(name, true);
        if (!o) return 'skipped: OpenCascade not installed';
        assert(a.lines === o.lines, name + ' SECTION A-A lines: Anvil ' + a.lines + ' / OpenCascade ' + o.lines);
        assert(a.hatch === o.hatch, name + ' hatch: Anvil ' + a.hatch + ' / OpenCascade ' + o.hatch);
        out.push(name + ': ' + o.lines + ' lines; ' + o.hatch);
      }
      return out.join(' | ');
    } finally {
      if (anvil.drawing.isOpen()) anvil.drawing.close();
      anvil.occt(false, { remember: false });
      await idle();
    }
  });
  // --- end r11/hatch11 ---
