  // --- rfKP (2026-11-09, lane smfix, test-reports/2026-11-09-shop-flow-2.md findings 3 and 4) --- the two flat fixes as
  // a user meets them: (a) a square-to-round Lofted-Bend with a Ø.5 hole through its seam: Flat to DXF ▸ ✓ gives one
  // closed outline notched at both seam edges (the hole was missing from the flat); (b) a 14 ga box with Butt Closed
  // Corners (bend region closed): Corners ▸ Corner Relief (Collect all corners, Circular) ✓, then Edit Feature ▸
  // Rectangular ✓, Flat to DXF ▸ ✓: one outline and nothing on HOLES (two sliver loops the laser would pierce were
  // left). Kernel side: tests/kernel/rfKP.js. Self-contained.
  (function () {
    var T14 = 0.0747, KF = 0.44, RB = 0.075;
    function rfKPRibbon(tab, re) {
      UI.setRibbonTab(tab);
      return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return re.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim()); })[0];
    }
    function rfKPArea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function rfKPErrs() { return Object.keys(anvil.summary().errors || {}); }
    function rfKPCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../headless/dxf-check.js'; s.onload = function () { res(window.DxfCheck); }; s.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(s); });
    }
    // Sheet Metal ▸ Flat to DXF ▸ ✓: the DXF the save hands over, read back
    async function rfKPFlatDxf(label) {
      var xb = rfKPRibbon('Sheet Metal', /Flat to/);
      assert(xb, 'Flat to DXF');
      xb.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', label + ': PM ' + (UI.hasPM() && UI.pmTitle()));
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await pmAccept(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      var d = got[got.length - 1];
      assert(d && /\.dxf$/i.test(d.name) && d.text, label + ': a DXF ' + JSON.stringify(got.map(function (g) { return g.name; })));
      var c = (await rfKPCheck()).check(d.text, { units: 'in' });
      assert(c.ok, label + ': ' + c.errors.join('; '));
      return c;
    }
    function rfKPOutlineOnly(c, label) {
      var outl = c.loops.filter(function (l) { return l.layer === 'OUTLINE' && l.closed; }).length;
      var holes = Object.keys(c.counts).filter(function (k) { return /@HOLES$/.test(k); });
      assert(outl === 1 && !holes.length, label + ': one closed OUTLINE, nothing on HOLES: ' + JSON.stringify(c.counts));
    }

    var RFKP_LOFT = 'p.name("Transition").units("in");\np.sheet(' + T14 + ', ' + T14 + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n';

    step('rfKP: square-to-round Lofted-Bend (14 ga) with a Ø.5 hole through its seam: Flat to DXF ▸ ✓: one closed outline notched at both seam edges (the hole was missing from the flat), its area less by the metal cut / T, no flat warning', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(RFKP_LOFT); await idle();
      assert(!rfKPErrs().length, 'transition: ' + JSON.stringify(anvil.summary().errors));
      var f0 = anvil.flat(), v0 = K.massProps(UI.App.mesh, 1).volume;
      await anvil.append('p.sketch("Front").circle(0, 1, 0.25).end().extrude(4, { cut: true });\n'); await idle();
      assert(!rfKPErrs().length, 'the seam hole: ' + JSON.stringify(anvil.summary().errors));
      var fl = anvil.flat(), cut = v0 - K.massProps(UI.App.mesh, 1).volume;
      assert(fl.loops.length === 1 && !(fl.warnings || []).length, 'outline only, no warning: ' + fl.loops.length + ' ' + (fl.warnings || []).join('; '));
      assert(fl.loops[0].length > f0.loops[0].length + 20, 'the notches: ' + f0.loops[0].length + ' → ' + fl.loops[0].length + ' points');
      var lost = (rfKPArea(f0) - rfKPArea(fl)) * T14;
      // 5 %: the facets at a seam corner are up to ±6 % off T since lane smsolid (the seam walls no longer cross); the
      // exact check (notch = the cut's developed mid-surface slice, 1e-9) is in kernel/rfKP.js
      assert(Math.abs(lost - cut) <= 0.05 * cut, 'notch area × T ' + lost.toFixed(5) + ' vs the metal cut ' + cut.toFixed(5));
      var c = await rfKPFlatDxf('transition');
      rfKPOutlineOnly(c, 'transition');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'outline ' + f0.loops[0].length + ' → ' + fl.loops[0].length + ' points, cut ' + cut.toFixed(5) + ' in³; DXF ' + JSON.stringify(c.counts);
    });

    var RFKP_BOX = 'p.name("Box-14GA").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T14 + ', ' + RB + ', ' + KF + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      [[5, T14, 0], [10, T14, 3], [5, T14, 6], [0, T14, 3]].map(function (e) { return 'p.flange(2, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('') +
      'p.closedCorner(' + JSON.stringify([[T14 / 2, 1.8, RB + T14], [10 - RB - T14, 1.8, 6 - T14 / 2], [T14 / 2, 1.8, 6 - RB - T14]]) + ', { cornerType: "butt", gap: 0.01, closeBend: true });\n';
    function rfKPCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    function rfKPMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }

    step('rfKP: 14 ga box with Butt Closed Corners (bend region closed): Corners ▸ Corner Relief (Collect all corners, Circular) ✓, Flat to DXF ▸ ✓, then Edit Feature ▸ Rectangular ✓: one outline each time, nothing on HOLES (two sliver loops were left), the blank\'s size unchanged', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(RFKP_BOX); await idle();
      assert(!rfKPErrs().length, 'box: ' + JSON.stringify(anvil.summary().errors));
      var f0 = anvil.flat();
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfKPCaret();
      assert(caret && !caret.disabled, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = rfKPMenuItem('Corner Relief');
      assert(mi, 'Corner Relief in the Corners flyout');
      mi.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Corner Relief', 'Corner Relief PM: ' + (UI.hasPM() && UI.pmTitle()));
      clickPmButton('Collect all corners'); await wait(20);
      assert(UI.pmSpec().values.corners.length === 4, 'four corners: ' + UI.pmSpec().values.corners.length);
      setInput(pmField('Relief type'), 'circular'); await wait(20);
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, cr = fs[fs.length - 1];
      assert(cr.type === 'cornerRelief' && cr.reliefType === 'circular' && !UI.App.build.errors[cr.id], 'Corner Relief: ' + JSON.stringify(cr) + ' ' + UI.App.build.errors[cr.id]);
      var fl = anvil.flat();
      assert(fl.loops.length === 1, 'circular: one loop, no slivers: ' + fl.loops.slice(1).map(function (l) { return Math.abs(K.signedArea(l)).toExponential(2); }).join(', '));
      near(fl.size[0], f0.size[0], 1e-9, 'blank width'); near(fl.size[1], f0.size[1], 1e-9, 'blank depth');
      var circ = +((rfKPArea(f0) - rfKPArea(fl)) / 4).toFixed(5);
      rfKPOutlineOnly(await rfKPFlatDxf('circular'), 'circular');
      // Edit Feature on the relief: Rectangular
      assert(UI.editFeature, 'UI.editFeature');
      UI.editFeature(K.findFeature(UI.App.model, cr.id)); await wait(30);
      assert(UI.hasPM() && (UI.pmTitle() === 'Corner Relief' || UI.pmTitle() === cr.name), 'Edit Feature PM: ' + (UI.hasPM() && UI.pmTitle()));
      setInput(pmField('Relief type'), 'rect'); await wait(20);
      await pmAccept(); await wait(30);
      cr = K.findFeature(UI.App.model, cr.id);
      assert(cr.reliefType === 'rect' && !UI.App.build.errors[cr.id], 'Rectangular: ' + JSON.stringify(cr) + ' ' + UI.App.build.errors[cr.id]);
      fl = anvil.flat();
      assert(fl.loops.length === 1, 'rectangular: one loop: ' + fl.loops.length);
      rfKPOutlineOnly(await rfKPFlatDxf('rectangular'), 'rectangular');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'circular relief ' + circ + ' in² a corner; rectangular ' + +((rfKPArea(f0) - rfKPArea(fl)) / 4).toFixed(5) + ' in²';
    });
  })();
  // --- end rfKP ---
