  // --- refine/drawings ---
  step('refine/drawings: drawings of OpenCascade parts: no stray facet lines (every mesh edge paired: Mug, Funnel, Flange), the Funnel\'s Top view is circles only, the Flange\'s top rim is a whole ellipse in the isometric and in the SVG (skipped without vendor/occt)', async function () {
    function occIdle() { return Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]); }
    var DW = W.Drawing;
    await anvil.run(exByName('Flange').code); await idle();
    anvil.occt(true, { remember: false });
    var s = await occIdle(), out = [];
    try {
      if (s.state === 'failed') return 'skipped: ' + (s.error || 'OpenCascade not installed').slice(0, 80);
      for (var name of ['Mug', 'Funnel', 'Flange']) {
        await anvil.run(exByName(name).code); await idle(); await occIdle(); await idle();
        assert(UI.App.build.occt, name + ' built by OpenCascade');
        var mesh = UI.App.mesh, open = DW.meshEdges(mesh).filter(function (e) { return e.faces.length === 1; }).length;
        assert(open === 0, name + ': ' + open + ' unpaired mesh edges (drawn as stray lines)');
        out.push(name + ' ' + DW.meshEdges(mesh).length + ' edges');
      }
      // the Flange (current part): its top outer rim (r 60) is fully visible in the isometric
      var iso = DW.projectView(UI.App.mesh, 'Isometric');
      function semiMajor(e) { var m = 0; for (var i = 0; i < 720; i++) { var t = i * Math.PI / 360; m = Math.max(m, Math.hypot(e.ax[0] * Math.cos(t) + e.ay[0] * Math.sin(t), e.ax[1] * Math.cos(t) + e.ay[1] * Math.sin(t))); } return m; }
      var rims = iso.ellipses.visible.filter(function (e) { return Math.abs(semiMajor(e) - 60) < 0.01; });
      assert(rims.some(function (e) { return e.full; }), 'top rim whole: ' + JSON.stringify(rims.map(function (e) { return [e.t0, e.t1, e.full]; })));
      await anvil.run(exByName('Funnel').code); await idle(); await occIdle(); await idle();
      var top = DW.projectView(UI.App.mesh, 'Top');
      assert(top.lines.visible.length === 0 && top.lines.hidden.length === 0, 'Funnel Top view lines: ' + top.lines.visible.length + ' / ' + top.lines.hidden.length);
      // a drawing of the Flange: every view's rim survives into the SVG (no arc path whose ends coincide)
      await anvil.run(exByName('Flange').code); await idle(); await occIdle(); await idle();
      anvil.drawing.make();
      var svg = anvil.drawing.svg(), bad = (svg.match(/ d="M[^"]*A[^"]*"/g) || []).filter(function (d) {
        var n = d.replace(/[^\d.\- ]/g, ' ').trim().split(/\s+/).map(Number), x = n[0], y = n[1];
        for (var i = 2; i + 6 < n.length; i += 7) { if (Math.hypot(n[i + 5] - x, n[i + 6] - y) < 0.01) return true; x = n[i + 5]; y = n[i + 6]; }
        return false;
      });
      assert(!bad.length, 'degenerate arcs: ' + bad.slice(0, 2).join(' '));
      anvil.drawing.close();
      return out.join(', ') + '; Funnel Top: circles only; Flange rim whole';
    } finally {
      if (anvil.drawing.isOpen()) anvil.drawing.close();
      anvil.occt(false, { remember: false });
      await idle();
    }
  });

  step('refine/drawings: right-click a view > Tangent Edge > Tangent Edges With Font draws the Chamfered block\'s fillet run-outs as phantom lines (one undo step); the view properties offer it too', async function () {
    await anvil.run(exByName('Chamfered block').code); await idle();
    anvil.drawing.make(); await wait(80);
    try {
      assert(dwView('Front').tangent === 'removed' && !D.querySelector('#drawing-sheet .tanfont, #drawing-sheet .tangent'), 'removed by default');
      var F = dwView('Front'), c = paperToClient([(F.box[0] + F.box[2]) / 2, (F.box[1] + F.box[3]) / 2]);
      D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: c.clientX, clientY: c.clientY }));
      var it = menuItem(/Tangent Edges With Font/);
      assert(it && menuItem(/Tangent Edges Visible/) && menuItem(/Tangent Edges Removed/), 'Tangent Edge menu items');
      it.click(); await idle(); await wait(80);
      var n = D.querySelectorAll('#drawing-sheet g[data-layer="FRONT"] .tanfont').length;
      assert(dwView('Front').tangent === 'font' && n === 2, 'phantom run-outs: ' + dwView('Front').tangent + ' ' + n);
      await UI.undo(); await idle(); await wait(80);
      assert(dwView('Front').tangent === 'removed' && !D.querySelector('#drawing-sheet .tanfont'), 'undo');
      anvil.drawing.tangent(F.id, 'visible'); await wait(80);
      var s = anvil.drawing.summary();
      assert(s.views[0].tangent === 'visible' && D.querySelectorAll('#drawing-sheet g[data-layer="FRONT"] .tangent').length === 2, 'anvil.drawing.tangent');
      return n + ' phantom tangent edges';
    } finally {
      if (UI.closeMenus) UI.closeMenus();
      anvil.drawing.close();
    }
  });
