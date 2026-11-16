  // --- rfMZ (2026-11-16, lane MZ: dimensioning a shop drawing like a user, test-reports/2026-11-15-drawing-dimensions.md) ---
  // An inch 14 ga bracket (two bends, two Ø.201 holes, a slot, a countersunk hole) and a tapped plate dimensioned with
  // the mouse and keys in headless Chrome: Smart Dimension picks, Ordinate / Baseline / Chain, Hole Callout, the
  // Dimension PM's tolerances, bend notes, Model Items, annotations; then the part changed, undo / redo, save, PDF, DXF.
  // Self-contained.
  (function () {
    var T = 0.0747;
    var RFMZ = {
      bracket: 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T + ', 0.075, 0.44);\n' +
        'p.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
        'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
        'p.sketch("Top", ' + T + ').circle(1, -1, 0.1005).circle(2, -1, 0.1005).end().cut("through", { reverse: true });\n' +
        'p.sketch("Top", ' + T + ').slot(3, -2, 4, -2, 0.375).end().cut("through", { reverse: true });\n' +
        'p.holeWizard({ face: "Top", offset: ' + T + ', points: [[5, -2]], standard: "ANSI Inch", type: "csk", size: "#10", fit: "normal", end: "through" });\n',
      plate: 'p.name("Plate").units("in");\np.sketch("Top").rect(0, -3, 5, 3).end().extrude(0.375);\n' +
        'p.sketch("Top", 0.375).circle(1, -1, 0.1005).end().cut("through", { reverse: true });\n' +
        'p.holeWizard({ face: "Top", offset: 0.375, points: [[2.5, -1], [2.5, -2], [4, -1], [4, -2]], standard: "ANSI Inch", type: "tap", size: "1/4-20 UNC", end: "through" });\n' +
        'p.holeWizard({ face: "Top", offset: 0.375, points: [[1, -2]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", end: "through" });\n'
    };
    function rfMZMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfMZClick(p, extra) { rfMZMouse('mousemove', p, extra); rfMZMouse('mousedown', p, extra); rfMZMouse('mouseup', p, extra); }
    async function rfMZDrag(a, b) { rfMZMouse('mousemove', a); rfMZMouse('mousedown', a); await wait(10); for (var i = 1; i <= 4; i++) { rfMZMouse('mousemove', [a[0] + (b[0] - a[0]) * i / 4, a[1] + (b[1] - a[1]) * i / 4]); await wait(5); } rfMZMouse('mouseup', b); await wait(10); }
    function rfMZKey(k, extra) { var o = { key: k, bubbles: true, cancelable: true }; if (extra) Object.keys(extra).forEach(function (x) { o[x] = extra[x]; }); D.dispatchEvent(new W.KeyboardEvent('keydown', o)); }
    function rfMZMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name + ': ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' '); }).join(' | ').slice(0, 600));
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    function rfMZRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout', 'Sheet Format'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfMZW(o) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === o || (o === 'flat' && w.view.kind === 'flat'); })[0]; }
    function rfMZEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfMZDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfMZPart(code) {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
    }
    // the sheet's dimension texts (DIMENSIONS layer), per dimension
    function rfMZDimTexts() {
      var by = {};
      UI.drawing.state.sheet.prims.forEach(function (p) { if (p.k === 'text' && p.dimIx != null) (by[p.dimIx] = by[p.dimIx] || []).push(p.text); });
      return Object.keys(by).map(function (k) { return by[k].join(' '); });
    }
    // Smart Dimension: click a, (b), then place at c; returns the new dimension's text
    async function rfMZSmart(w, picks, place) {
      var st = UI.drawing.state, key = function (x) { return x.view + ':' + (x.key || '') + ':' + x.index + ':' + x.kind; };
      var had = st.sheet.dims.map(key);
      if (st.tool !== 'dim') { rfMZRibbon('Smart Dimension').click(); await wait(10); }
      for (var i = 0; i < picks.length; i++) { rfMZClick(w.toSheet(picks[i])); await wait(15); }
      rfMZMouse('mousemove', w.toSheet(place)); await wait(10);
      rfMZClick(w.toSheet(place)); await rfMZDone();
      return st.sheet.dims.filter(function (x) { return had.indexOf(key(x)) < 0; })[0] || null;
    }
    function rfMZAt(d) { var tb = d.tbox || d.box; return [(tb.x0 + tb.x1) / 2, (tb.y0 + tb.y1) / 2]; }
    function rfMZOf(view, index) { return UI.drawing.state.sheet.dims.filter(function (x) { return x.view === view && x.index === index && !x.auto; })[0] || null; }
    // the texts of one dimension on the sheet
    function rfMZTextOf(d) { var sh = UI.drawing.state.sheet, ix = sh.dims.indexOf(d); return sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx === ix; }).map(function (p) { return p.text; }).join(' '); }
    // right-click a dimension's text; click the row whose text starts with `label` (null: just read the rows)
    function rfMZCtx(d, label) {
      rfMZMouse('contextmenu', rfMZAt(d), { button: 2 });
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), names = rows.map(function (r) { return r.textContent.trim(); });
      var row = label ? rows.filter(function (r) { return r.textContent.trim().indexOf(label) === 0; })[0] : null;
      if (row) row.click();
      if (UI.closeMenus) UI.closeMenus();
      return names;
    }
    function rfMZLoadCheck() {
      if (window.DxfCheck) return Promise.resolve(window.DxfCheck);
      return new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = '../headless/dxf-check.js'; sc.onload = function () { res(window.DxfCheck); }; sc.onerror = function () { rej(new Error('dxf-check.js did not load')); }; document.head.appendChild(sc); });
    }
    async function rfMZSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    // the bracket's drawing with the Smart Dimensions of step 1 (kept for the next steps of this group)
    var rfMZState = {};

    step('rfMZ: Smart Dimension by clicks on an inch bracket: edge, edge to edge, hole to edge, hole to hole, Ø, slot R, angle, bend R, arc length (the arc, then both ends); the countersunk Hole Wizard hole reads its callout from the start', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfMZPart(RFMZ.bracket);
      anvil.drawing.make({ fresh: true }); await rfMZDone();
      UI.drawing.fit(); await wait(20);
      var w = rfMZW('Top'), f = rfMZW('Front');
      // (fix 2) Model Items' hole callouts: the CSK reads 'Ø .201 THRU ALL' / '⌵ Ø .385 X 82°', not Ø.385 and Ø.255
      var autoT = st.sheet.dims.filter(function (x) { return x.auto; }).map(function (x) { return x.text; });
      assert(!autoT.some(function (t) { return /Ø\.385|Ø\.255/.test(t); }), 'no countersink diameters as model items: ' + autoT.join(' | '));
      var ann = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'ANNOTATIONS' && p.view === w.view.id; }).map(function (p) { return p.text; });
      assert(ann.indexOf('Ø .201 THRU ALL') >= 0 && ann.indexOf('⌵ Ø .385 X 82°') >= 0, 'the countersink callout: ' + ann.join(' | '));
      var want = [
        ['edge', [[3, 0]], [3, 0.6], 'h', '6.000'],
        ['edge to edge', [[0.6, -3], [0.6, 0]], [-0.5, -1.5], 'v', '3.000'],
        ['hole to edge', [[1 + 0.1005, -1], [0, -0.4]], [0.5, 0.5], 'h', '1.000'],
        ['hole to hole', [[1, -1 + 0.1005], [2, -1 + 0.1005]], [1.5, -0.55], 'h', '1.000'],
        ['circle', [[2 + 0.1005 * Math.SQRT1_2, -1 + 0.1005 * Math.SQRT1_2]], [2.6, -0.4], 'dia', 'Ø.201'],
        ['slot end', [[4 + 0.1875 * Math.SQRT1_2, -2 + 0.1875 * Math.SQRT1_2]], [4.6, -1.3], 'rad', 'R.188']
      ], got = [];
      for (var i = 0; i < want.length; i++) {
        var d = await rfMZSmart(w, want[i][1], want[i][2]);
        assert(d && d.kind === want[i][3] && d.text === want[i][4], want[i][0] + ': ' + (d ? d.kind + ' ' + d.text : 'none'));
        got.push(d.text);
      }
      rfMZState.edge = { view: w.view.id, index: rfMZOf(w.view.id, 0) ? 0 : -1 };
      // Front: the angle between the base and the UP flange, the bend's outside radius, its arc length
      var dA = await rfMZSmart(f, [[3, T], [6, 0.8]], [5.4, 0.7]);
      assert(dA && dA.kind === 'angle' && dA.text === '90°', 'angle: ' + (dA && dA.text));
      var a = (f.proj.arcs ? f.proj.arcs.visible : []).filter(function (x) { return x.r > 0.1 && x.c[0] > 3; })[0];
      assert(a, 'the UP bend outside arc in Front');
      var m = (a.a0 + a.a1) / 2 * Math.PI / 180, q = [a.c[0] + a.r * Math.cos(m), a.c[1] + a.r * Math.sin(m)];
      var dR = await rfMZSmart(f, [q], [q[0] + 0.5, q[1] - 0.5]);
      assert(dR && dR.kind === 'rad' && dR.text === 'R.150', 'bend radius: ' + (dR && dR.text));
      var e0 = [a.c[0] + a.r * Math.cos(a.a0 * Math.PI / 180), a.c[1] + a.r * Math.sin(a.a0 * Math.PI / 180)], e1 = [a.c[0] + a.r * Math.cos(a.a1 * Math.PI / 180), a.c[1] + a.r * Math.sin(a.a1 * Math.PI / 180)];
      var dL = await rfMZSmart(f, [q, e0, e1], [q[0] + 0.6, q[1] - 0.6]);
      assert(dL && dL.arcLen && dL.text === '.235' && Math.abs(dL.value - a.r * Math.PI / 2) < 1e-9, 'arc length: ' + (dL && dL.kind + ' ' + dL.text));
      // its ANSI arc symbol: a thin arc over the text
      var ixL = st.sheet.dims.indexOf(dL), sym = st.sheet.prims.filter(function (p) { return p.dimIx === ixL && p.k === 'arc' && p.a0 === 60 && p.a1 === 120; });
      var tL = st.sheet.prims.filter(function (p) { return p.dimIx === ixL && p.k === 'text'; })[0];
      assert(sym.length === 1 && tL && sym[0].c[1] + sym[0].r * Math.sin(Math.PI / 3) > tL.p[1] + tL.h, 'the arc symbol over .235: ' + sym.length);
      rfMZEnd();
      rfMZState.arcLen = { view: dL.view, index: dL.index };
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return got.join(' | ') + ' | 90° | R.150 | arc ' + dL.text;
    });

    step('rfMZ: right-click a dimension: its own menu (Properties, Display with Parentheses, Flip Arrows, Delete); parentheses on and off; a click on its text opens its PM even inside another dimension\'s box', async function () {
      var st = UI.drawing.state, w = rfMZW('Top'), u0 = UI.App.undo.length;
      var d = rfMZOf(w.view.id, 0);
      assert(d && d.text === '6.000', 'the 6.000');
      var rows = rfMZCtx(d, 'Display with Parentheses'); await rfMZDone();
      assert(rows[0] === 'Properties…' && rows.indexOf('Display with Parentheses') >= 0 && rows.indexOf('Flip Arrows') >= 0 && rows.some(function (r) { return /^Delete/.test(r); }), 'menu: ' + rows.join(' / '));
      assert(!rows.some(function (r) { return /Tangent Edges|Hide View|Lock View/.test(r); }), 'not the view menu: ' + rows.join(' / '));
      d = rfMZOf(w.view.id, 0);
      assert(d.text === '(6.000)' && rfMZTextOf(d) === '(6.000)', 'reference dimension: ' + d.text);
      rows = rfMZCtx(d, 'Remove Parentheses'); await rfMZDone();
      assert(rfMZOf(w.view.id, 0).text === '6.000', 'parentheses off: ' + rfMZOf(w.view.id, 0).text);
      assert(UI.App.undo.length === u0 + 2, 'one undo step each: ' + (UI.App.undo.length - u0));
      // (fix 4) the v 3.000's box spans the view; a click on the 6.000 text above is the 6.000
      var v3 = rfMZOf(w.view.id, 1), b6 = rfMZAt(rfMZOf(w.view.id, 0));
      rfMZClick(b6); await rfMZDone();
      assert(UI.hasPM() && UI.pmSpec().command === 'dimension' && /6\.000/.test(D.querySelector('#pm').textContent), 'the 6.000 PM (v ' + v3.text + ')');
      rfMZEnd();
      return 'menu ' + rows.length + ' rows';
    });

    step('rfMZ: Dimension PM tolerances on the 6.000: bilateral +.010/-.005, limit, symmetric ±.005, Basic (boxed), MIN, text <DIM> TYP and 2X, precision .12; fractions 1 1/2 style; every edit undone', async function () {
      var st = UI.drawing.state, w = rfMZW('Top'), u0 = UI.App.undo.length;
      function dim0() { return rfMZOf(w.view.id, 0); }
      async function pm(setup) {
        rfMZClick(rfMZAt(dim0())); await rfMZDone();
        assert(UI.hasPM() && UI.pmSpec().command === 'dimension', 'Dimension PM');
        await setup(); await wait(20);
        await UI.pmOK(); await rfMZDone(); rfMZEnd();
        return rfMZTextOf(dim0());
      }
      function sel(key, v) { var s = D.querySelector('#pm select[data-key="' + key + '"]'); assert(s, 'PM select ' + key); setInput(s, v); }
      function inp(key, v) { var s = D.querySelector('#pm input[data-key="' + key + '"]'); assert(s, 'PM box ' + key); setInput(s, v); }
      var tolOpts = null;
      var r = [];
      r.push(await pm(async function () { tolOpts = Array.prototype.map.call(D.querySelectorAll('#pm select[data-key="tolType"] option'), function (o) { return o.textContent; }).join(','); sel('tolType', 'bilateral'); await wait(10); inp('plus', '0.01'); inp('minus', '0.005'); }));
      r.push(await pm(async function () { sel('tolType', 'limit'); await wait(10); inp('plus', '0.01'); inp('minus', '0.01'); }));
      r.push(await pm(async function () { sel('tolType', 'symmetric'); await wait(10); inp('plus', '0.005'); }));
      r.push(await pm(async function () { sel('tolType', 'basic'); await wait(10); assert(!D.querySelector('#pm input[data-key="plus"]') || D.querySelector('#pm input[data-key="plus"]').offsetParent === null, 'no variation box for Basic'); }));
      var ix = st.sheet.dims.indexOf(dim0()), box = st.sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'line'; }).length;
      r.push(await pm(async function () { sel('tolType', 'min'); }));
      r.push(await pm(async function () { sel('tolType', 'none'); await wait(10); inp('label', '<DIM> TYP'); }));
      r.push(await pm(async function () { inp('label', '2X <DIM>'); sel('prec', '2'); }));
      assert(/None,Basic,Bilateral,Limit,Symmetric,MIN,MAX/.test(tolOpts), 'SolidWorks tolerance list: ' + tolOpts);
      var expect = ['6.000 +.010 -.005', '6.010 5.990', '6.000 ±.005', '6.000', '6.000 MIN', '6.000 TYP', '2X 6.00'];
      expect.forEach(function (e, i) { assert(r[i] === e, 'step ' + i + ': ' + r[i] + ' (want ' + e + ')'); });
      assert(box >= 7, 'Basic: a box round the text (' + box + ' lines with the dimension lines)');
      // Document Properties ▸ Units ▸ Fractions: 2.425 -> 2 27/64, the arc length too (finishAngles in the dimension style)
      anvil.drawing.options({ fractions: true }); await rfMZDone();
      var fr = st.sheet.dims.map(function (x) { return x.text; });
      anvil.drawing.options({ fractions: false }); await rfMZDone();
      assert(fr.indexOf('2 27/64') >= 0 && fr.indexOf('15/64') >= 0, 'fractions: ' + fr.join(' | '));
      for (var i = 0; i < 20 && UI.App.undo.length > u0; i++) { await UI.undo(); await rfMZDone(); }
      assert(rfMZTextOf(dim0()) === '6.000', 'all undone: ' + rfMZTextOf(dim0()));
      return r.join(' | ') + ' ;; ' + fr.slice(0, 3).join(', ');
    });

    step('rfMZ: Ordinate from the left edge (two holes), then right-click ▸ Add To Ordinate the countersink; Chain Dimension (Tools ▸ Dimensions) edge, hole, hole, countersink', async function () {
      var st = UI.drawing.state, w = rfMZW('Top'), errs0 = errors.length;
      rfMZMenu('Tools', 'Dimensions ▸ Ordinate Dimension'); await wait(10);
      assert(st.tool === 'ordinate', 'ordinate tool');
      rfMZClick(w.toSheet([0, -1.5])); await wait(10);
      rfMZClick(w.toSheet([1 + 0.1005, -1])); await rfMZDone();
      rfMZClick(w.toSheet([2 + 0.1005, -1])); await rfMZDone();
      await UI.pmOK(); await rfMZDone(); rfMZEnd();
      var od = st.sheet.dims.filter(function (x) { return x.kind === 'ordinate' && !x.auto && x.view === w.view.id; })[0];
      assert(od && od.text === '0, 1.000, 2.000', 'ordinate: ' + (od && od.text));
      var rows = rfMZCtx(od, 'Add To Ordinate'); await wait(10);
      assert(rows.indexOf('Add To Ordinate') >= 0 && st.tool === 'ordinate', 'Add To Ordinate: ' + rows.join(' / ') + ' tool ' + st.tool);
      rfMZClick(w.toSheet([5 + 0.19, -2])); await rfMZDone();
      await UI.pmOK(); await rfMZDone(); rfMZEnd();
      od = rfMZOf(od.view, od.index);
      assert(od.text === '0, 1.000, 2.000, 5.000', 'added to the set: ' + od.text);
      rfMZMenu('Tools', 'Dimensions ▸ Chain Dimension'); await wait(10);
      assert(st.tool === 'chaindim' && UI.hasPM() && UI.pmSpec().title === 'Chain Dimension', 'Chain Dimension PM');
      var n0 = st.sheet.dims.length;
      rfMZClick(w.toSheet([0, -2.5])); await wait(10);
      rfMZClick(w.toSheet([1, -1])); await rfMZDone();
      rfMZClick(w.toSheet([2, -1])); await rfMZDone();
      rfMZClick(w.toSheet([5, -2])); await rfMZDone();
      rfMZEnd();
      var ch = st.sheet.dims.slice(n0).filter(function (x) { return x.lock === 'h'; });
      assert(ch.map(function (x) { return x.text; }).join(',') === '1.000,1.000,3.000', 'chain: ' + ch.map(function (x) { return x.text; }).join(','));
      var lv = ch.map(function (x) { return x.at; });
      assert(lv.every(function (y) { return Math.abs(y - lv[0]) < 1e-9; }) && w.toSheet([0, lv[0]])[1] > w.box.y1, 'one line above the view');
      assert(!st.tool, 'Esc ended it');
      rfMZState.chain = ch.map(function (x) { return { view: x.view, index: x.index }; });
      rfMZState.ord = { view: od.view, index: od.index };
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return od.text + ' ;; chain ' + ch.map(function (x) { return x.text; }).join(', ');
    });

    step('rfMZ: the part changed (UP flange 1.5 -> 2, Ø.201 -> Ø.257, hole 2 deleted): dimensions follow, those on the gone hole dangle (olive brown), right-click ▸ Reattach puts one on the countersink, Delete takes another; undo / redo; saved and opened again', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      UI.markClean();
      rfMZMenu('Window', '(part)'); await idle(); await wait(20);
      UI.pushUndo();
      var m = UI.App.model;
      m.features.filter(function (x) { return x.type === 'flange'; })[0].length = 2;
      var sk = m.features.filter(function (x) { return x.type === 'sketch' && (x.entities || []).some(function (e) { return e.t === 'circle'; }); })[0];
      sk.entities.forEach(function (e) { if (e.t === 'circle') e.r = 0.1285; });
      sk.entities.splice(sk.entities.indexOf(sk.entities.filter(function (e) { return e.t === 'circle'; })[1]), 1);
      await UI.rebuild(); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'rebuild');
      rfMZMenu('Window', 'Draw'); await rfMZDone(); await wait(30);
      var w = rfMZW('Top'), T0 = function (i) { var d = rfMZOf(w.view.id, i); return d ? d.text + (d.dangling ? '!' : '') : 'none'; };
      // 0 edge, 1 edge to edge, 2 hole to edge, 3 hole to hole, 4 Ø (hole 2), 5 slot R
      var now = [0, 1, 2, 3, 4, 5].map(T0);
      assert(now.join('|') === '6.000|3.000|1.000|1.000!|Ø.201!|R.188', 'after the change: ' + now.join('|'));
      var ord = rfMZOf(rfMZState.ord.view, rfMZState.ord.index), chain = rfMZState.chain.map(function (c) { var d = rfMZOf(c.view, c.index); return d.text + (d.dangling ? '!' : ''); });
      assert(ord.dangling && chain.join(',') === '1.000,1.000!,3.000!', 'ordinate dangles, chain ' + chain.join(','));
      var auto = st.sheet.dims.filter(function (x) { return x.auto; }).map(function (x) { return x.text; });
      assert(auto.indexOf('2.925') >= 0 && auto.indexOf('Ø.257') >= 0, 'model items follow: ' + auto.join(' | '));
      var dg = rfMZOf(w.view.id, 3), ix = st.sheet.dims.indexOf(dg);
      assert(st.sheet.prims.filter(function (p) { return p.dimIx === ix; }).every(function (p) { return p.color === 'dangling'; }), 'drawn in the dangling colour');
      // Reattach: right-click, Reattach, click the countersink -> 4.000 from hole 1
      var rows = rfMZCtx(dg, 'Reattach'); await wait(10);
      assert(rows.indexOf('Reattach') >= 0 && st.tool === 'reattach', 'Reattach row: ' + rows.join(' / '));
      var u1 = UI.App.undo.length;
      rfMZClick(w.toSheet([5 + 0.19, -2])); await rfMZDone();
      assert(T0(3) === '4.000' && !st.tool && UI.App.undo.length === u1 + 1, 'reattached: ' + T0(3));
      // a diameter takes a circle only: an edge clicked is refused and the tool waits
      rows = rfMZCtx(rfMZOf(w.view.id, 4), 'Reattach'); await wait(10);
      rfMZClick(w.toSheet([4.2, 0])); await rfMZDone();
      assert(st.tool === 'reattach' && T0(4) === 'Ø.201!', 'an edge does not fit a diameter: ' + T0(4));
      rfMZEnd();
      var nd = st.sheet.dims.length;
      rfMZCtx(rfMZOf(w.view.id, 4), 'Delete'); await rfMZDone();
      assert(st.sheet.dims.length === nd - 1, 'deleted');
      await UI.undo(); await rfMZDone();
      assert(T0(4) === 'Ø.201!', 'undo brings it back: ' + T0(4));
      await UI.redo(); await rfMZDone();
      assert(st.sheet.dims.length === nd - 1, 'redo deletes it again');
      // saved with the part and opened again
      var before = st.sheet.dims.map(function (x) { return x.text + (x.dangling ? '!' : ''); }).join('|'), json = JSON.stringify(anvil.model());
      UI.markClean(); anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save");
      await anvil.load(json); await idle();
      anvil.drawing.make(); await rfMZDone();
      var after = st.sheet.dims.map(function (x) { return x.text + (x.dangling ? '!' : ''); }).join('|');
      assert(after === before, 'reopened: ' + after + ' vs ' + before);
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return now.join('|') + ' ;; reattached ' + T0(3);
    });

    step('rfMZ: the dimensioned sheet exported: File ▸ Save Drawing as DXF (R12) and PDF hold the dimension texts (reference, arc length, chain, ordinate); R2000 DXF has DIMENSION entities and audits clean', async function () {
      var st = UI.drawing.state, Chk = await rfMZLoadCheck();
      var sv = st.sheet.dims.map(function (x) { return x.text; });
      var dxf = (await rfMZSaved(function () { rfMZMenu('File', 'Save Drawing as DXF'); }))[0];
      var pdf = (await rfMZSaved(function () { rfMZMenu('File', 'Save Drawing as PDF'); }))[0];
      assert(dxf && dxf.text && pdf && pdf.text, 'saved');
      ['4.000', '.235', '90%%d', 'R.150'].forEach(function (t) { assert(dxf.text.indexOf('\n' + t + '\n') >= 0 || dxf.text.indexOf('\r\n' + t + '\r\n') >= 0, 'R12 DXF text ' + t); });
      assert(pdf.text.indexOf('(.235)') >= 0 || pdf.text.indexOf('.235') >= 0, 'PDF has the arc length');
      var r2 = anvil.drawing.dxf({ version: 'R2000' });
      var nDim = (r2.match(/\n\s*0\r?\nDIMENSION\r?\n/g) || []).length;
      assert(nDim >= 6, 'R2000 DIMENSION entities: ' + nDim);
      var aud = Chk.audit(r2).errors.filter(function (e) { return !/^duplicate SOLID on /.test(e) && !/duplicate DIMENSION/.test(e); });
      assert(!aud.length, 'DXF audit: ' + JSON.stringify(aud).slice(0, 300));
      UI.markClean(); anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); await idle();
      return sv.length + ' dims; R2000 ' + nDim + ' DIMENSION';
    });

    step('rfMZ: annotations by clicks: Auto insert centre marks, Centerline between two edges, Datum Feature and Surface Finish on edges, a Note leader on an edge; Model Items after a deleted model item brings it back', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfMZPart(RFMZ.bracket);
      anvil.drawing.make({ fresh: true }); await rfMZDone();
      UI.drawing.fit(); await wait(20);
      var w = rfMZW('Top');
      function cnt(t) { return (st.sheet.annotations || []).filter(function (a) { return a.type === t && a.view === w.view.id; }).length; }
      var cm0 = cnt('centerMark'), cl0 = cnt('centerline');
      assert(cm0 >= 2, 'Auto insert put centre marks on the holes: ' + cm0);
      rfMZRibbon('Centerline').click(); await wait(10);
      rfMZClick(w.toSheet([0, -1.5])); await wait(10); rfMZClick(w.toSheet([6, -1.5])); await rfMZDone(); rfMZEnd();
      assert(cnt('centerline') === cl0 + 1, 'centerline: ' + cl0 + ' -> ' + cnt('centerline'));
      var s0 = (anvil.drawing.doc().symbols || []).length;
      rfMZRibbon('Datum Feature').click(); await wait(10);
      rfMZClick(w.toSheet([3, -3])); await wait(10); rfMZMouse('mousemove', w.toSheet([3, -3.6])); rfMZClick(w.toSheet([3, -3.6])); await rfMZDone(); rfMZEnd();
      rfMZRibbon('Surface Finish').click(); await wait(10);
      rfMZClick(w.toSheet([4.5, 0])); await wait(10); rfMZMouse('mousemove', w.toSheet([4.8, 0.6])); rfMZClick(w.toSheet([4.8, 0.6])); await rfMZDone(); rfMZEnd();
      var sy = (anvil.drawing.doc().symbols || []).slice(s0);
      assert(sy.length === 2 && sy[0].type === 'datum' && sy[1].type === 'surfaceFinish' && sy.every(function (y) { return y.leader && y.anchor; }), 'symbols anchored to edges: ' + JSON.stringify(sy.map(function (y) { return y.type; })));
      rfMZRibbon('Note').click(); await wait(10);
      rfMZClick(w.toSheet([6, -2.5])); await wait(10);
      rfMZMouse('mousemove', w.toSheet([6.8, -3.4])); rfMZClick(w.toSheet([6.8, -3.4])); await wait(20);
      assert(st.inline, 'the note box');
      st.inline.inp.value = 'DEBURR'; D.querySelector('#dw-edit .dw-edit-btn.ok').click();
      await rfMZDone(); rfMZEnd();
      var nt = (anvil.drawing.doc().notes || []).filter(function (n) { return n.text === 'DEBURR'; })[0];
      assert(nt && nt.leader && nt.anchor, 'note leader on the edge');
      var auto = st.sheet.dims.filter(function (x) { return x.auto; }), a0 = auto.length, ad = auto.filter(function (x) { return x.kind === 'dia'; })[0];
      st.sel = { kind: 'dim', view: ad.view, key: ad.key || null, index: ad.index, style: ad.style || null };
      rfMZKey('Delete'); await rfMZDone();
      assert(st.sheet.dims.filter(function (x) { return x.auto; }).length === a0 - 1, 'model item deleted');
      rfMZRibbon('Model Items').click(); await wait(20);
      assert(UI.hasPM() && UI.pmSpec().title === 'Model Items', 'Model Items PM');
      await UI.pmOK(); await rfMZDone(); rfMZEnd();
      var back = st.sheet.dims.filter(function (x) { return x.auto; }).map(function (x) { return x.text; });
      assert(back.indexOf(ad.text) >= 0, 'brought back: ' + back.join(' | '));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); await idle();
      return 'centre marks ' + cm0 + ', ' + sy.length + ' symbols, note, ' + back.length + ' model items';
    });
  })();
