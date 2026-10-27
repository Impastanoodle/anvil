  // --- rfDN (2026-10-27, lane DN: drawing sections) --- anvil.drawing.sectionView / removedSection cut in
  // drawing-worker.js (main-thread section function stubbed: never called); Excluded components of an assembly
  // section (Section View PM pick list, Properties PM reopens it); Area Hatch/Fill on one region of a section view.
  function rfDNMouse(type, p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: q.x, clientY: q.y, detail: 1 }));
  }
  function rfDNClick(p) { rfDNMouse('mousemove', p); rfDNMouse('mousedown', p); rfDNMouse('mouseup', p); }
  function rfDNWin(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfDNView(id) { return W.Drawing.findView(UI.App.model.drawings[UI.drawing.state.index], id); }
  // counts main-thread section cuts while fn runs: Drawing.sectionOf / pathSectionOf calls that cut (not a cache hit
  // of what the worker filed), Drawing.sectionJob (the main-thread fallback) and every CSG intersect
  async function rfDNNoCut(fn) {
    var Dr = W.Drawing, P = W.CSG.prototype, n = { cut: 0, csg: 0 }, keep = { s: Dr.sectionOf, p: Dr.pathSectionOf, j: Dr.sectionJob, i: P.intersect };
    function where() { if (!n.where) n.where = String(new Error().stack).split('\n').slice(2, 8).join(' < '); }
    function cutting(f) { return function (mesh) { var k0 = Object.keys(mesh._drawingSections || {}).length, r = f.apply(this, arguments); if (Object.keys(mesh._drawingSections || {}).length > k0) { n.cut++; where(); } return r; }; }
    Dr.sectionOf = cutting(keep.s);
    Dr.pathSectionOf = cutting(keep.p);
    Dr.sectionJob = function () { n.cut++; where(); return keep.j.apply(this, arguments); };
    P.intersect = function () { n.csg++; where(); return keep.i.apply(this, arguments); };
    try { n.result = await fn(); } finally { Dr.sectionOf = keep.s; Dr.pathSectionOf = keep.p; Dr.sectionJob = keep.j; P.intersect = keep.i; }
    return n;
  }
  async function rfDNAssembly() {
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
    var r = await UI.openExample(ex); await idle();
    assert(!r.error && UI.isAssembly(), 'assembly opened: ' + r.error);
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await idle();
    UI.drawing.fit(); await wait(20);
    var comps = UI.App.model.components, pin = -1;
    comps.forEach(function (c, i) { if (pin < 0 && c.name === 'Pin<1>') pin = i; });
    assert(pin >= 0, 'Pin<1> in ' + comps.map(function (c) { return c.name; }));
    return { top: dwView('Top'), pin: pin, pinId: String(comps[pin].id) };
  }
  // the pick at q stays on body when the mouse lands a pixel off (mouse events land on whole pixels)
  function rfDNSure(q, body) {
    var t = UI.drawingInternal.pxToPaper(1);
    return [[t, 0], [-t, 0], [0, t], [0, -t], [t, t], [-t, -t], [t, -t], [-t, t]].every(function (o) { var e = UI.drawing.edgeAt([q[0] + o[0], q[1] + o[1]]); return e && e.body === body; });
  }
  // the box (model units, view frame) of a view's visible lines of one body
  function rfDNBodyBox(w, body) {
    var b = [Infinity, Infinity, -Infinity, -Infinity], n = 0;
    w.proj.lines.visible.forEach(function (l) { if ((l[4] || 0) !== body) return; n++; b[0] = Math.min(b[0], l[0], l[2]); b[1] = Math.min(b[1], l[1], l[3]); b[2] = Math.max(b[2], l[0], l[2]); b[3] = Math.max(b[3], l[1], l[3]); });
    return { n: n, w: b[2] - b[0], h: b[3] - b[1] };
  }

  // the hatch segments of one layer of anvil.drawing.svg() (SVG coordinates): the hatch paths' M / m / l moves
  function rfDNSvgHatch(svg, layer) {
    var i = svg.indexOf('data-layer="' + layer + '"'), j = svg.indexOf('data-layer=', i + 12), part = svg.slice(i, j < 0 ? undefined : j), out = [];
    (part.match(/<path class="hatch" d="[^"]*"/g) || []).forEach(function (t) {
      var d = t.slice(t.indexOf('d="') + 3, -1), re = /([Mml])(-?[\d.e-]+) (-?[\d.e-]+)/g, m, x = 0, y = 0;
      while ((m = re.exec(d))) {
        var dx = +m[2], dy = +m[3];
        if (m[1] === 'M') { x = dx; y = dy; } else if (m[1] === 'm') { x += dx; y += dy; } else { out.push([x, y, x + dx, y + dy]); x += dx; y += dy; }
      }
    });
    return out;
  }

  step('rfDN: anvil.drawing.sectionView and removedSection on the L-bracket cut in the drawing worker (main-thread section functions stubbed: never called), resolve to the summary, auto centre marks wait for the view; reading the result at once still works', async function () {
    var errs0 = errors.length;
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'L-bracket'; })[0];
    var r = await UI.openExample(ex); await idle();
    assert(!r.error, 'L-bracket opened: ' + r.error);
    if (anvil.occtIdle) { await Promise.race([anvil.occtIdle(), wait(30000)]); await idle(); }   // (an OpenCascade swap of the mesh mid-call would cut again)
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await idle();
    if (anvil.occtIdle) { await Promise.race([anvil.occtIdle(), wait(30000)]); await idle(); await UI.drawing.ready(); }
    var F = dwView('Front'), T = dwView('Top'), wf = rfDNWin(F.id), b = wf.proj.bounds, mid = (b.vmin + b.vmax) / 2, undo0 = UI.App.undo.length;
    // (a drawing worker that failed to load its scripts earlier in the run is tried again after a pause: wait it out)
    for (var c = 0; c < 120 && UI.drawingInternal.workerState().cooling > 0; c++) await wait(100);
    var ws0 = UI.drawingInternal.workerState(), probe = await Promise.race([W.fetch('drawing.js', { method: 'HEAD', cache: 'no-store' }).then(function (q) { return q.status; }, function (e) { return String(e); }), wait(3000).then(function () { return 'timeout'; })]);
    var n = await rfDNNoCut(async function () {
      var p = anvil.drawing.sectionView(T.id, { axis: 'v', at: (rfDNWin(T.id).proj.bounds.umin + rfDNWin(T.id).proj.bounds.umax) / 2, sign: 1 });
      assert(p && typeof p.then === 'function', 'a thenable summary');
      return await p;
    });
    var sv = n.result.views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(n.cut === 0 && n.csg === 0, 'main-thread cuts: ' + JSON.stringify({ cut: n.cut, csg: n.csg, where: n.where, worker: UI.drawingInternal.workerState(), before: ws0, probe: probe }));
    assert(sv && sv.sectionArea > 0 && sv.hatches.length >= 1 && sv.hatches[0].lines > 0, 'section from the worker ' + JSON.stringify(sv && { a: sv.sectionArea, h: sv.hatches }));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    var n2 = await rfDNNoCut(function () { return anvil.drawing.removedSection(F.id, { a: [b.umin, mid], b: [b.umax, mid] }); });
    var rs = n2.result && n2.result.views.filter(function (v) { return v.kind === 'section' && v.id !== sv.id; })[0];
    assert(n2.cut === 0 && n2.csg === 0 && rs && rs.sectionArea > 0, 'removed section in the worker: ' + JSON.stringify({ cut: n2.cut, csg: n2.csg, rs: rs && rs.sectionArea }));
    // the synchronous fallback: reading a property at once finishes the view here and now
    var s3 = anvil.drawing.sectionView(F.id, { axis: 'h', at: mid, sign: 1, fit: true });
    assert(s3.views.filter(function (v) { return v.kind === 'section'; }).length === 3 && s3.views.every(function (v) { return v.kind !== 'section' || v.sectionArea > 0; }), 'sync read ' + s3.views.length);
    assert(JSON.parse(JSON.stringify(s3)).views.length === s3.views.length, 'JSON of the summary');
    assert(anvil.drawing.sectionView(999, { axis: 'h', at: 0 }) === null, 'refused: null');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'section ' + sv.sectionArea.toFixed(1) + ', removed ' + rs.sectionArea.toFixed(1) + ', 0 main-thread cuts';
  });

  step('rfDN: Excluded components — an assembly section through both pins with Pin<1> excluded: no hatch on it, its whole outline drawn, area less one pin; Section View PM picks it with a click in the Top view; Properties reopens the list and a click takes it off again', async function () {
    var errs0 = errors.length, A = await rfDNAssembly();
    // API
    var sm = await anvil.drawing.sectionView(A.top.id, { axis: 'h', at: -10, sign: 1, y: 30, excluded: [A.pinId] });
    var sv = sm.views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sv.hatches.length === 2 && !sv.hatches.some(function (h) { return h.component === 'Pin<1>'; }), 'hatches ' + JSON.stringify(sv.hatches));
    assert(Math.abs(sv.sectionArea - (672 + 160)) < 1e-6, 'cut area without Pin<1> ' + sv.sectionArea);
    var bx = rfDNBodyBox(rfDNWin(sv.id), A.pin);
    assert(bx.n >= 4 && Math.abs(bx.w - 8) < 1e-6 && Math.abs(bx.h - 20) < 1e-6, 'Pin<1> whole outline ' + JSON.stringify(bx));
    assert(JSON.stringify(rfDNView(sv.id).section.excluded) === JSON.stringify([A.pinId]), 'saved on the view');
    await UI.undo(); await idle(); await UI.drawing.ready();
    // the mouse: Section View PM, click Pin<1> in the Top view, OK, cutting line, side
    UI.drawing.sectionView(); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Section View' && D.querySelector('#pm .pm-pick'), 'Section View PM with Excluded components');
    var wt = rfDNWin(A.top.id), pick = null;
    // a point on one of Pin<1>'s edges in the Top view that picks Pin<1> (its cap sits on it: not every point does)
    UI.drawing.state.sheet.views.forEach(function (wt) { wt.proj.circles.visible.forEach(function (c) {
      for (var k = 0; k < 16 && !pick && (c.body || 0) === A.pin; k++) {
        var q = wt.toSheet([c.c[0] + c.r * Math.cos(k * Math.PI / 8), c.c[1] + c.r * Math.sin(k * Math.PI / 8)]), e = UI.drawing.edgeAt(q);
        if (e && e.body === A.pin && rfDNSure(q, A.pin)) pick = q;
      }
    }); });
    UI.drawing.state.sheet.views.forEach(function (wt) { wt.proj.lines.visible.forEach(function (l) {
      for (var k = 0; k < 16 && !pick && (l[4] || 0) === A.pin; k++) {
        var q = wt.toSheet([l[0] + (l[2] - l[0]) * (k + 0.5) / 16, l[1] + (l[3] - l[1]) * (k + 0.5) / 16]), e = UI.drawing.edgeAt(q);
        if (e && e.body === A.pin && rfDNSure(q, A.pin)) pick = q;
      }
    }); });
    assert(pick, 'a point on a Pin<1> edge in a view');
    rfDNClick(pick); await idle();
    assert(JSON.stringify(UI.pmSpec().values.excluded) === JSON.stringify([A.pinId]) && /Pin<1>/.test(D.querySelector('#pm .pm-list').textContent), 'picked: ' + JSON.stringify(UI.pmSpec().values.excluded) + ' want ' + A.pinId + ' list ' + (D.querySelector('#pm .pm-list') || {}).textContent);
    await UI.pmOK(); await idle();
    assert(UI.drawing.state.tool === 'section', 'section tool');
    var cut = wt.toSheet([wt.proj.bounds.umin + 3, -10]);
    rfDNClick(cut); await idle();
    rfDNClick([cut[0], 30]); await idle(); await UI.drawing.ready(); await idle();
    var s2 = anvil.drawing.summary(), sv2 = s2.views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sv2 && sv2.hatches.length === 2 && !sv2.hatches.some(function (h) { return h.component === 'Pin<1>'; }), 'mouse-made section ' + JSON.stringify(sv2 && sv2.hatches));
    // Properties PM: the list is there; a click on Pin<1> takes it off; OK: three hatched components
    UI.drawingInternal.cmdViewProperties(sv2.id); await idle();
    assert(UI.hasPM() && /Pin<1>/.test((D.querySelector('#pm .pm-list') || {}).textContent || ''), 'Properties lists Pin<1>');
    rfDNClick(pick); await idle();
    assert(UI.pmSpec().values.excluded.length === 0, 'taken off');
    await UI.pmOK(); await idle(); await UI.drawing.ready();
    var sv3 = anvil.drawing.summary().views.filter(function (v) { return v.id === sv2.id; })[0];
    assert(sv3.hatches.length === 3 && !rfDNView(sv2.id).section.excluded, 'all sectioned again ' + JSON.stringify(sv3.hatches));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'Pin<1> outline ' + bx.w + ' x ' + bx.h + ', area ' + sv.sectionArea;
  });

  step('rfDN: Area Hatch/Fill on one region of an assembly section view — a click on Pin<2>\'s hatch (view selected) opens the PM; ANSI33 at scale 2: only that region\'s hatch changes (SVG lines inside it, wider apart); the PM reopens with it', async function () {
    var errs0 = errors.length, A = await rfDNAssembly();
    var sm = await anvil.drawing.sectionView(A.top.id, { axis: 'h', at: -10, sign: 1, y: 30 });
    var S = sm.views.filter(function (v) { return v.kind === 'section'; })[0], w = rfDNWin(S.id);
    var regs = W.Drawing.hatchRegions(w), H = UI.drawing.state.sheet.size[1];
    assert(regs.length >= 3 && regs.every(function (g) { return !g.areaHatch; }), 'regions ' + regs.length);
    var comps = UI.App.model.components, g2 = regs.filter(function (g) { return comps[g.body] && comps[g.body].name === 'Pin<2>'; })[0];
    assert(g2, 'Pin<2> region ' + JSON.stringify(regs.map(function (g) { return g.body; })));
    // Pin<2>'s region box in SVG coordinates; the SVG's hatch segments inside it / outside it, before and after
    var pts = []; g2.loops.forEach(function (l) { l.forEach(function (q) { var s0 = w.toSheet(q); pts.push([s0[0], H - s0[1]]); }); });
    var bx = [Math.min.apply(null, pts.map(function (q) { return q[0]; })), Math.min.apply(null, pts.map(function (q) { return q[1]; })), Math.max.apply(null, pts.map(function (q) { return q[0]; })), Math.max.apply(null, pts.map(function (q) { return q[1]; }))];
    function inside(sg) { var mx = (sg[0] + sg[2]) / 2, my = (sg[1] + sg[3]) / 2; return mx > bx[0] - 1e-3 && mx < bx[2] + 1e-3 && my > bx[1] - 1e-3 && my < bx[3] + 1e-3; }
    function key(list) { return list.map(function (sg) { return sg.map(function (x) { return x.toFixed(2); }).join(','); }).sort().join(';'); }
    var layer = w.layer, h0 = rfDNSvgHatch(anvil.drawing.svg(), layer), in0 = h0.filter(inside), out0 = h0.filter(function (sg) { return !inside(sg); });
    assert(in0.length > 0 && out0.length > 0, 'hatch in the SVG ' + in0.length + ' / ' + out0.length);
    UI.drawing.state.sel = { kind: 'view', id: S.id };
    rfDNClick(w.toSheet(g2.p)); await idle(); await wait(40);
    assert(UI.hasPM() && UI.pmTitle() === 'Area Hatch/Fill', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
    pmField('Material crosshatch').click(); await idle();
    setInput(pmField('Pattern'), 'ANSI33'); setInput(pmField('Scale'), '2');
    await UI.pmOK(); await idle(); await wait(40);
    var hr = rfDNView(S.id).hatchRegions;
    assert(hr && hr.length === 1 && hr[0].pattern === 'ANSI33' && hr[0].scale === 2, 'stored ' + JSON.stringify(hr));
    var h1 = rfDNSvgHatch(anvil.drawing.svg(), layer), in1 = h1.filter(inside), out1 = h1.filter(function (sg) { return !inside(sg); });
    assert(key(out1) === key(out0), 'the other regions\' SVG hatch unchanged (' + out0.length + ' -> ' + out1.length + ')');
    assert(in1.length > 0 && key(in1) !== key(in0), 'Pin<2>\'s SVG hatch changed (' + in0.length + ' -> ' + in1.length + ')');
    var own = UI.drawing.state.sheet.prims.filter(function (p) { return p.areaHatch === 'ANSI33'; });
    assert(own.length > 0 && own.every(function (p) { return inside([p.a[0], H - p.a[1], p.b[0], H - p.b[1]]); }), 'ANSI33 lines in Pin<2> only: ' + own.length);
    var regs2 = W.Drawing.hatchRegions(rfDNWin(S.id));
    assert(regs2.filter(function (g) { return g.areaHatch; }).length === 1 && regs2.filter(function (g) { return !g.areaHatch; }).length === regs.length - 1, 'others keep the material hatch');
    // reopen: the PM shows the region's own pattern and scale
    UI.drawing.state.sel = { kind: 'view', id: S.id };
    rfDNClick(w.toSheet(g2.p)); await idle(); await wait(40);
    assert(UI.hasPM() && UI.pmTitle() === 'Area Hatch/Fill' && UI.pmSpec().values.pattern === 'ANSI33' && +UI.pmSpec().values.scale === 2 && !UI.pmSpec().values.material, 'reopened ' + JSON.stringify(UI.pmSpec().values));
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'Pin<2> SVG hatch ' + in0.length + ' -> ' + in1.length + ' segments, the rest ' + out0.length + ' unchanged';
  });
  // --- end rfDN ---
