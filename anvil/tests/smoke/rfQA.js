  // ---- rfQA (local-2026-11-18b, lane sketchflow8): sketching like a SolidWorks 2024 user on INCH parts, by real mouse /
  // key events (report test-reports/2026-11-19-sketch-flow-8.md). Uses rfPR's helpers (one eval scope).
  function rfQANames(f) {
    f = f || rfPRF();
    return UI.sketchDimItems(f).map(function (it) { return (it.kind === 'rel' ? it.d.type : it.d.k) + '=' + UI.sketchDimShortName(f, it.d); }).join(' ');
  }
  step('rfQA D-names: a distance between two lines dimensioned first, then a line\'s length: D1 is the distance, D2 the length, in creation order as SolidWorks names them (before: the length took D1 and the distance D2); a third dimension takes D3; an old document keeps the names it showed when a dimension is added', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 8, 5, 0.12, 0.8);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([4.1, 2.05]); await rfPREsc(2);
      await rfPRDim([[0, 1], [f.entities[1].x1, 1]], [2, 2.7], '4');
      await rfPRDim([[4, 1]], [4.7, 1], '2');
      log.push(rfQANames(f));
      var dist = (f.rels || []).filter(function (r) { return r.type === 'distance'; })[0];
      assert(dist && UI.sketchDimShortName(f, dist) === 'D1', 'the distance made first is D1: ' + rfQANames(f));
      assert(UI.sketchDimShortName(f, f.dims[0]) === 'D2', 'the length made second is D2: ' + rfQANames(f));
      UI.setTool('circle'); await wait(30);
      await rfPRClick([2, 1]); await rfPRClick([2.4, 1]); await rfPREsc(2);
      var c = f.entities[f.entities.length - 1];
      await rfPRDim([[c.cx + c.r * 0.7071, c.cy + c.r * 0.7071]], [c.cx + 0.9, c.cy + 0.6], '1/2');
      log.push(rfQANames(f));
      assert(f.dims.length === 2 && UI.sketchDimShortName(f, f.dims[1]) === 'D3', 'a third dimension is D3: ' + rfQANames(f));
      await rfPREnd();
      // an old document: a Smart Dimension and a distance relation with no names (D1 the length, D2 the distance)
      await rfPRPart();
      anvil.run('p.units("in");\np.sketch("Front").line(0, 0, 4, 0).line(4, 0, 4, 2).line(4, 2, 0, 2).line(0, 2, 0, 0)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"])' +
        '.rel("horizontal", ["0"]).rel("horizontal", ["2"]).rel("vertical", ["1"]).rel("vertical", ["3"]).dim(1, "len").rel("distance", ["3", "1"], 4).end();\n');
      await idle();
      var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      UI.enterSketch(sk.id); await idle(); await wait(30);
      rfPRFrame(8, 5, 0.12, 0.8); await wait(30);
      var g = rfPRF();
      var before = rfQANames(g);
      assert(before === 'len=D1 distance=D2', 'the old names: ' + before);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([1, 0.5]); await rfPRClick([2, 1.5]); await rfPREsc(2);
      await rfPRDim([[1.5, 0.5]], [1.5, -0.4], '1');
      var after = rfQANames(g);
      log.push(after);
      assert(after === 'len=D1 len=D3 distance=D2', 'old names kept, the new one D3: ' + after);
      var s = anvil.script();
      assert(!/"name":"D1"/.test(s) && /"name":"D2"/.test(s) && /"name":"D3"/.test(s), 'only names the list order would not give are stored: ' + s.split('\n').filter(function (l) { return /name/.test(l); }).join(' / ').slice(0, 400));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfQA dangling edge: a hole on the top face dimensioned 1 from a notch\'s edge by Smart Dimension (centre, then the model edge); the notch deleted: the dimension is Dangling (olive) with a red handle; the handle dragged onto the block\'s right edge: attached, the hole 1 from that edge', async function () {
    var log = [];
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch("Top").rect(3, -1, 1, 1).cut("through");'); await idle();
      var f = await rfLWSketchOnTop();
      UI.setTool('circle'); await wait(20);
      await rfLWClickAt(rfLWScr3([1.8, 0.5, 0.6])); await rfLWClickAt(rfLWScr3([2.05, 0.5, 0.6])); await rfPREsc(2);
      f = UI.activeSketchFeature();
      var ci = f.entities.length - 1, c = f.entities[ci];
      assert(c.t === 'circle', 'a circle: ' + rfPREnts(f));
      UI.setTool('dimension'); await wait(20);
      var dwell = UI.dimMidDwell(); UI.dimMidDwell(1e9);
      try {
        await rfLWClickAt(rfLWScr3(K.to3D(UI.activePlane(), c.cx, c.cy))); await wait(20);
        await rfLWClickAt(rfLWScr3([3, 0.5, 0.35])); await wait(20);
        await rfLWClickAt(rfLWScr3([2.5, 0.5, 1.6])); await wait(50);
      } finally { UI.dimMidDwell(dwell); }
      var inp = D.querySelector('#dim-edit input');
      assert(inp && !$('dim-edit').hidden, 'the Modify box opens: ' + statusText() + ' ' + rfPRRels(f).join(' '));
      setInput(inp, '1'); pressEnter(inp); await wait(60);
      if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
      UI.setTool('select'); await wait(20);
      f = UI.activeSketchFeature();
      log.push(rfPRRels(f).join(' '));
      var p = K.to3D(UI.activePlane(), f.entities[ci].cx, f.entities[ci].cy);
      near(p[0], 2, 1e-6, 'the hole 1 from the notch edge');
      UI.exitSketch(); await idle();
      var m = UI.App.model, cutSk = m.features.filter(function (x) { return x.type === 'sketch'; })[1];
      m.features = m.features.filter(function (x) { return x.id !== cutSk.id && x.sketch !== cutSk.id; });
      await UI.rebuild(); await idle();
      var w = UI.App.build.warnings[f.id] || '';
      log.push('warning: ' + w);
      assert(/Dangling/.test(w), 'Dangling warning: ' + w);
      UI.enterSketch(f.id); await idle(); await wait(60);
      UI.drawDims(true);
      var dl = D.querySelectorAll('#dim-layer .dim.dangling');
      log.push('dangling dims ' + dl.length + ' labels ' + rfPRLabels().join('|'));
      assert(dl.length === 1, 'the dimension is drawn Dangling: ' + D.querySelectorAll('#dim-layer .dim').length + ' dims');
      var hs = UI.danglingHandles();
      assert(hs.length === 1 && D.querySelectorAll('#dangle-layer circle.sk-dangle').length === 1, 'one red handle: ' + JSON.stringify(hs));
      var vr = $('viewport').getBoundingClientRect(), from = [Math.round(vr.left + hs[0].screen[0]), Math.round(vr.top + hs[0].screen[1])], to = rfLWScr3([4, 0.5, 1.5]);
      rfLWEv('mousemove', from); await wait(15);
      rfLWEv('mousedown', from); await wait(15);
      for (var k = 1; k <= 5; k++) { rfLWEv('mousemove', [Math.round(from[0] + (to[0] - from[0]) * k / 5), Math.round(from[1] + (to[1] - from[1]) * k / 5)]); await wait(15); }
      rfLWEv('mouseup', to); await idle(); await wait(40);
      var sk = UI.activeSketchFeature();
      log.push('after drag: ' + statusText() + ' ' + rfPRRels(sk).join(' '));
      assert(!UI.danglingHandles().length && !D.querySelectorAll('#dim-layer .dim.dangling').length, 'attached: no handle, no dangling dimension');
      var q = K.to3D(UI.activePlane(), sk.entities[ci].cx, sk.entities[ci].cy);
      near(q[0], 3, 1e-6, 'the hole now 1 from the right edge');
      UI.exitSketch(); await idle();
      assert(!/Dangling/.test(UI.App.build.warnings[f.id] || ''), 'warning gone: ' + UI.App.build.warnings[f.id]);
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfQA exit guard: with UI.sketchExitGuard set, Exit Sketch in the confirmation corner (the existing one, top right: Exit Sketch beside the red X) asks it first: a returned reason keeps the sketch open and is shown; null lets it close; Discard Changes and Exit does not ask', async function () {
    var log = [], asked = [];
    try {
      var f = await rfPRNew('Front', 8, 5, 0.12, 0.8);
      var cc = $('exit-sketch'), r = cc.getBoundingClientRect(), vr = $('viewport').getBoundingClientRect();
      assert(!cc.hidden && cc.querySelector('.cc-exit') && cc.querySelector('.cc-cancel'), 'the confirmation corner shows Exit Sketch and the red X');
      assert(r.right > vr.right - 60 && r.top < vr.top + 120, 'at the top right of the graphics area: ' + JSON.stringify([r.right, r.top, vr.right, vr.top]));
      UI.setTool('line'); await wait(20);
      await rfPRClick([0, 0]); await rfPRClick([2, 0]); await rfPREsc(2);
      UI.sketchExitGuard = function (sk) { asked.push(sk.id); return 'The profile must stay closed: close it first.'; };
      cc.querySelector('.cc-exit').click(); await idle();
      assert(UI.App.mode === 'sketch' && asked.length === 1 && asked[0] === f.id, 'still in the sketch, the guard asked with it');
      var toast = Array.prototype.map.call(D.querySelectorAll('.toast'), function (x) { return x.textContent; }).join(' ');
      assert(/stay closed/.test(toast + ' ' + statusText()), 'the reason shown: ' + toast + ' / ' + statusText());
      UI.sketchExitGuard = function () { asked.push('null'); return null; };
      cc = $('exit-sketch'); cc.querySelector('.cc-exit').click(); await idle();
      assert(UI.App.mode !== 'sketch' && asked.length === 2, 'null: the sketch closes');
      UI.editSketch(f.id); await idle(); await wait(30);
      UI.sketchExitGuard = function () { asked.push('no'); return 'no'; };
      UI.setTool('line'); await wait(20);
      await rfPRClick([0, 1]); await rfPRClick([2, 1]); await rfPREsc(2);
      $('exit-sketch').querySelector('.cc-cancel').click(); await wait(30);
      if (!$('modal').hidden && $('sk-discard')) $('sk-discard').click();
      await idle();
      assert(UI.App.mode !== 'sketch' && asked.length === 2, 'Discard Changes and Exit closes without asking');
      assert(K.findFeature(UI.App.model, f.id).entities.length === 1, 'the second line discarded');
      log.push('asked ' + asked.join(','));
    } finally { UI.sketchExitGuard = null; await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfQA hover label: the Select tool\'s "Circle" label over a circle goes when the cursor leaves the graphics area (onto the PropertyManager / ribbon, or out of the window); before, it stayed in #dim-layer among the dimension texts', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 8, 5, 0.12, 0.8);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([2, 2]); await rfPRClick([3, 2]); await rfPREsc(2);
      function texts() { return Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; }); }
      UI.setTool('select'); await wait(20);
      rfPREv('mousemove', rfPRScr([3, 2])); await wait(30);
      assert(texts().indexOf('Circle') >= 0, 'the hover label over the circle: ' + texts().join('|'));
      var vr = $('viewport').getBoundingClientRect();
      rfPREv('mousemove', [Math.round(vr.left - 30), Math.round(vr.top + 100)]); await wait(30);
      assert(texts().indexOf('Circle') < 0, 'gone once the cursor left the graphics area: ' + texts().join('|'));
      rfPREv('mousemove', rfPRScr([3, 2])); await wait(30);
      $('viewport').dispatchEvent(new W.MouseEvent('mouseleave', { bubbles: false, clientX: 0, clientY: 0 })); await wait(30);
      UI.drawDims(true);
      assert(texts().indexOf('Circle') < 0, 'gone on leaving the window too: ' + texts().join('|'));
      log.push(texts().join('|'));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  function rfQAArcs(f) { return f.entities.filter(function (e) { return e.t === 'arc'; }); }
  step('rfQA arcs: a Centerpoint Arc of 90° given its angle by Smart Dimension (its two end points, then its centre: before, the third click placed the distance between the ends), 60 typed: the end moves; a 3 Point Arc with R 1 1/2 typed after its two ends (the arc through both ends, on the side of the cursor); a tangent arc\'s R typed so large the line would turn round: refused with the reason, nothing moves', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.1, 0.7);
      UI.setTool('arc'); await wait(30);
      await rfPRClick([1, 1]); await rfPRClick([2, 1]); await rfPRClick([1, 2]); await rfPREsc(2);
      var a = rfQAArcs(f)[0];
      assert(a && Math.abs(a.a1 - a.a0 - 90) < 1e-6, 'a 90° arc: ' + JSON.stringify(a));
      var shown = await rfPRDim([[2, 1], [1, 2], [1, 1]], [2.2, 2.2], '60');
      log.push('shown ' + shown + ' rels ' + rfPRRels().join(' '));
      var ar = (f.rels || []).filter(function (r) { return r.type === 'arcangle'; })[0];
      assert(ar && Math.abs(ar.v - 60) < 1e-9, 'an Arc Angle dimension of 60: ' + rfPRRels().join(' '));
      a = rfQAArcs(f)[0];
      near(a.a1 - a.a0, 60, 1e-7, 'the arc sweeps 60°');
      assert(rfPRLabels().some(function (t) { return /^60(\.0+)?°$/.test(t); }), 'the label reads 60°: ' + rfPRLabels().join('|'));
      // 3 Point Arc: two ends, then R typed with the cursor above the chord
      UI.setTool('arc3'); await wait(30);
      await rfPRClick([4, 1]); await rfPRClick([6, 1]);
      rfPREv('mousemove', rfPRScr([5, 1.4])); await wait(30);
      rfPRKey('1'); await wait(30);
      var inp = D.activeElement;
      assert(inp && inp.tagName === 'INPUT' && inp.getAttribute('aria-label') === 'Radius', 'the on-screen box opened on R: ' + (inp && inp.outerHTML.slice(0, 120)));
      setInput(inp, '1 1/2'); pressEnter(inp); await wait(60);
      await rfPREsc(2);
      var b = rfQAArcs(f)[1];
      log.push('arc3 ' + JSON.stringify(b));
      assert(b, 'a second arc: ' + rfPREnts());
      near(b.r, 1.5, 1e-9, 'R 1 1/2');
      var be = [[b.cx + b.r * Math.cos(b.a0 * Math.PI / 180), b.cy + b.r * Math.sin(b.a0 * Math.PI / 180)], [b.cx + b.r * Math.cos(b.a1 * Math.PI / 180), b.cy + b.r * Math.sin(b.a1 * Math.PI / 180)]];
      be.sort(function (p, q) { return p[0] - q[0]; });
      near(be[0][0], 4, 1e-6, 'from x 4'); near(be[0][1], 1, 1e-6, 'y 1'); near(be[1][0], 6, 1e-6, 'to x 6'); near(be[1][1], 1, 1e-6, 'y 1');
      var mida = (b.a0 + b.a1) / 2 * Math.PI / 180;
      assert(b.cy + b.r * Math.sin(mida) > 1, 'the arc bulges to the cursor side (up): ' + JSON.stringify(b));
      await rfPREnd();
      // a line, a tangent arc R1, an upright tangent to it whose top end is fixed: R 2 1/2 works, R 4 would turn the line round
      await rfPRPart();
      anvil.run('p.units("in");\np.sketch("Front").line(0, 0, 2, 0).arc(2, 1, 1, -90, 0).line(3, 1, 3, 3)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("horizontal", ["0"]).rel("tangent", ["0", "1"]).rel("tangent", ["2", "1"]).rel("fix", ["2.p2"]).dim(1, "r").end();\n');
      await idle();
      var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      UI.enterSketch(sk.id); await idle(); await wait(30);
      rfPRFrame(8, 5, 0.2, 0.8); await wait(30);
      var g = rfPRF();
      await rfPREditDim(/^R1(\.0+)?$/, '2 1/2');
      near(g.entities[1].r, 2.5, 1e-9, 'R 2 1/2 taken');
      var s0 = rfPRState(g);
      await rfPREditDim(/^R2\.50*$/, '4');
      log.push('R4: ' + statusText());
      assert(rfPRState(g) === s0, 'nothing moved: ' + JSON.stringify(g.entities[0]));
      assert(/inside out/.test(statusText() + ' ' + (D.querySelector('.toast') ? D.querySelector('.toast').textContent : '')), 'the reason is given: ' + statusText());
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfQA flow ii: a slot row from a print: a construction line from the origin, a Straight Slot on it dimensioned, Linear Sketch Pattern x4 at 1.5, mirrored about an upright centerline, Fully Define, the spacing 1.5 -> 1.75: the row and its mirror image follow (before: each mirrored cap arc was held by its centre and radius only, Fully Define dimensioned the copies and the spacing was refused as a conflict)', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6, 0.08, 0.6);
      // a level construction line from the origin to the right, the slot centres on it
      UI.cmdCenterline(); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([8, 0]); await rfPREsc(2);
      UI.setTool('slot'); await wait(30);
      await rfPRClick([1, 0]); await rfPRClick([2, 0]); await rfPRClick([2, 0.2]); await rfPREsc(2);
      log.push('slot: ' + rfPREnts() + ' / ' + rfOICounts() + ' rels ' + rfPRRels().join(' '));
      var si = f.entities.length - 1;
      await rfPRDim([[1.5, 0.2]], [1.5, 0.8], '1');
      log.push('dims: ' + rfOICounts() + ' ' + rfPRLabels().join('|'));
      UI.setSelection([1, 2, 3, 4, 5].map(function (i) { return { kind: 'entity', index: i }; }));
      UI.cmdSketchPattern(); await wait(40);
      UI.pmSetValue('spacing', 1.5); UI.pmSetValue('count', 4); await wait(40);
      log.push('pm ' + UI.pmTitle() + ' ' + JSON.stringify(UI.pmSpec().values.entities));
      await UI.pmOK(); await idle();
      log.push('pattern: ' + statusText() + ' ' + rfPREnts() + ' / ' + rfOICounts());
      // mirror everything about a vertical centerline at x = -0.5 ... about the Y axis: a centerline up from the origin
      UI.cmdCenterline(); await wait(30);
      await rfPRClick([0, -1]); await rfPRClick([0, 1]); await rfPREsc(2);
      var axis = f.entities.length - 1;
      var slots = f.entities.map(function (e, i) { return i; }).filter(function (i) { return i > 0 && i < axis; });
      UI.setSelection(slots.map(function (i) { return { kind: 'entity', index: i }; }));
      UI.cmdMirrorEntities(); await wait(40);
      UI.pmSetValue('axis', String(axis)); await wait(30);
      log.push('mirror pm ' + JSON.stringify(UI.pmSpec().values));
      await UI.pmOK(); await idle();
      log.push('mirror: ' + statusText() + ' ' + rfPREnts() + ' / ' + rfOICounts());
      var symArcs = (f.rels || []).filter(function (r) { return r.type === 'symmetric' && f.entities[+r.refs[0]] && f.entities[+r.refs[0]].t === 'arc'; });
      assert(symArcs.length === 8 && symArcs.every(function (r) { return r.ends; }), 'each mirrored arc held with its ends: ' + symArcs.length);
      assert(rfPRAn().dof <= 6, 'the mirror image adds nothing to define: ' + rfOICounts());
      if (UI.cmdFullyDefineSketch) { UI.cmdFullyDefineSketch(); await wait(60); await UI.pmOK(); await idle(); }
      log.push('FD: ' + statusText() + ' ' + rfOICounts() + ' ' + rfPRLabels().join('|'));
      assert(rfPRAn().status === 'full', 'fully defined: ' + rfOICounts());
      await rfPREditDim(/^1\.500$/, '1.75'); await idle();
      log.push('1.5->1.75: ' + statusText() + ' ' + rfOICounts() + ' ' + f.entities.filter(function (e) { return e.t === 'arc'; }).map(function (e) { return [e.cx, e.cy, e.r].map(function (x) { return +x.toFixed(3); }).join(','); }).join(' ; '));
      assert(/set to 1\.750/.test(statusText()), 'the spacing 1.75 taken: ' + statusText());
      var arcs = f.entities.filter(function (e) { return e.t === 'arc'; }), xs = arcs.map(function (e) { return e.cx; }).sort(function (a, b) { return a - b; });
      near(xs[xs.length - 1] - xs[xs.length - 3], 1.75, 1e-6, 'the last two slots 1.75 apart');
      var axl = f.entities[axis], ax0 = (axl.x1 + axl.x2) / 2;
      assert(Math.abs(axl.x1 - axl.x2) < 1e-9, 'the axis upright');
      arcs.forEach(function (e) { assert(arcs.some(function (o) { return Math.abs(o.cx + e.cx - 2 * ax0) < 1e-6 && Math.abs(o.cy - e.cy) < 1e-6; }), 'each arc has its mirror image: ' + e.cx); });
      near(rfPRAn().dof, 0, 0, 'still fully defined');
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
