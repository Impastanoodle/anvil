  // --- rfD (sketch fidelity audit, test-reports/2026-10-08-sketch-fidelity.md): SolidWorks-user flows found correct on
  //     e8707d2 that had no regression step: an inch flat blank end to end, Smart Dimension of a slanted line by cursor ---
  async function rfdSketch(ppu, centre) {   // an inch part, a Front sketch at ppu pixels per inch, centred on centre
    await anvil.run('p.units("in");'); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch' && UI.App.model.units === 'in', 'an inch sketch');
    UI.zoomView((1 / ppu) / UI.cam.scale);
    var a = rskScr(centre); UI.panView(UI.size.w / 2 - a[0], UI.size.h / 2 - a[1]);
    UI.App.gridStale = true;
    return UI.activeSketchFeature();
  }
  // values typed while drawing: the cursor at `at`, a key opens the on-screen box, each field set (null: left empty), Enter
  function rfdType(at, vals) {
    selEv('mousemove', rskScr(at)); selKey('.');
    var box = UI.sketchNumBox(), last = null;
    assert(box && box.length >= vals.length, 'the on-screen box opened');
    vals.forEach(function (v, i) { r3sType(box[i], v == null ? '' : v); if (v != null) last = box[i]; });
    if (/^p?circle$/.test(UI.App.tool)) enterTwice(last); else r3sKey(last, 'Enter');   // lane BP: a circle's box commits first, the second Enter makes it
  }
  function rfdSame(a, b, path, out) {   // deep equality, numbers to 1e-12, key order free
    if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-12 * Math.max(1, Math.abs(a))) out.push(path + ' ' + a + ' / ' + b); return out; }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      Object.keys(a).concat(Object.keys(b)).forEach(function (k) { if (!(a[k] === undefined && b[k] === false)) rfdSame(a[k], b[k], path + '.' + k, out); });
      return out;
    }
    if (a !== b) out.push(path + ' ' + JSON.stringify(a) + ' / ' + JSON.stringify(b));
    return out;
  }
  step('rfD/blank: an inch flat blank drawn like a SolidWorks user — Corner Rectangle typed 6 Tab 4 from the origin, four Ø.281 holes typed into Ø, a slot typed .375 wide, a notch (rectangle, one Power-trim drag, two clicks), Horizontal / Vertical Ordinate sets from the left / bottom edges (6.000 and 4.000 come out driven), Fully Define Sketch: Fully Defined; the sketch DXF (R12, R2000) reads back exactly and the script round trip is identical', async function () {
    var errs0 = errors.length, f = await rfdSketch(55, [3, 2]);
    UI.setTool('rect'); rskClick([0, 0]); rfdType([2, 1.5], ['6', '4']); UI.setTool('select');
    // lane C, fidelity #13: four lines from the origin, W 6 and H 4 the bottom and left lines' driving lengths
    var rl4 = f.entities.map(function (e) { return [e.t, e.x1, e.y1, e.x2, e.y2].join(); }).join(' ');
    assert(rl4 === 'line,0,0,6,0 line,6,0,6,4 line,6,4,0,4 line,0,4,0,0' && f.dims.length === 2 && f.dims.map(function (d) { return d.e + ':' + d.k; }).join() === '0:len,3:len', 'rectangle ' + rl4 + ' ' + JSON.stringify(f.dims));
    [[0.5, 0.5], [5.5, 0.5], [0.5, 3.5], [5.5, 3.5]].forEach(function (c) { UI.setTool('circle'); rskClick(c); rfdType([c[0] + 0.3, c[1] + 0.1], [null, '.281']); });   // lane BP: each typed circle closes the tool
    UI.setTool('slot'); rskClick([2.5, 2]); rskClick([3.5, 2]); rfdType([3.5, 2.3], ['.375']); UI.setTool('select');
    var holes = f.entities.filter(function (e) { return e.t === 'circle'; }), slot = f.entities[f.entities.length - 1];
    assert(holes.length === 4 && holes.every(function (h) { return Math.abs(h.r - 0.1405) < 1e-12; }) && f.dims.filter(function (d) { return d.k === 'dia'; }).length === 4, 'holes ' + JSON.stringify(holes));
    // rfH: the slot is two lines and two arcs on its construction centerline (the last entity), its width .375 a driving distance between the sides
    var slotArc = f.entities[f.entities.length - 2];
    assert(slot.t === 'line' && slot.construction && slot.x1 === 2.5 && slot.x2 === 3.5 && slot.y1 === 2 && slot.y2 === 2 && slotArc.t === 'arc' && slotArc.r === 0.1875 && f.rels.some(function (x) { return x.type === 'distance' && x.v === 0.375; }), 'slot ' + JSON.stringify([slot, slotArc]));
    UI.setTool('rect'); rskClick([2.5, 3.5]); rskClick([3.5, 4.6]); UI.setTool('select');
    UI.cmdTrimEntities(); trimMode('power');
    await trimDrag([[3, 4.8], [3, 4.6], [3, 4.4], [3, 4.2], [3, 4], [3, 3.85]]);
    rskClick([2.5, 4.3]); rskClick([3.5, 4.3]);
    await UI.pmOK(); await idle();
    var prof = K.sketchProfile(f);
    assert(prof.loops.length === 6 && !f.entities.some(function (e) { return e.t === 'line' && (e.y1 > 4 + 1e-9 || e.y2 > 4 + 1e-9); }), 'outline with the notch, four holes, the slot: ' + prof.loops.length + ' loops');
    UI.cmdOrdinateDim('x');
    rskClick([0, 2]); rskClick([1.5, -0.6]);
    [[0.5, 0.5], [2.5, 3.75], [2.5, 2], [3.5, 3.75], [5.5, 0.5], [6, 2]].forEach(rskClick);
    await UI.pmOK();
    UI.cmdOrdinateDim('y');
    rskClick([1.5, 0]); rskClick([-0.6, 1.5]);
    [[0.5, 0.5], [2.5, 2], [3, 3.5], [0.5, 3.5], [1, 4]].forEach(rskClick);
    await UI.pmOK();
    var sets = W.SketchSolver.ordinateSets(f), ids = Object.keys(sets);
    var sx = ids.map(function (k) { return sets[k]; }).filter(function (s) { return s.axis === 'x'; })[0], sy = ids.map(function (k) { return sets[k]; }).filter(function (s) { return s.axis === 'y'; })[0];
    assert(ids.length === 2 && sx && sy, 'two ordinate sets ' + JSON.stringify(sets));
    assert(JSON.stringify(ordValues(f, sx)) === '[0.5,2.5,2.5,3.5,5.5,6]' && JSON.stringify(ordValues(f, sy)) === '[0.5,2,3.5,3.5,4]', 'values ' + ordValues(f, sx) + ' / ' + ordValues(f, sy));
    var drv = sx.members.concat(sy.members).filter(function (i) { return f.rels[i].driven; }).map(function (i) { return f.rels[i].v; });
    assert(JSON.stringify(drv) === '[6,4]', 'the over-defining 6 and 4 are driven: ' + JSON.stringify(drv));
    UI.cmdFullyDefineSketch(); clickPmButton('Calculate');
    assert(UI.sketchStatus().status === 'full', 'Fully Defined: ' + JSON.stringify(UI.sketchStatus()));
    await UI.pmOK(); await idle();
    // the sketch DXF: every line, circle and slot arc comes back from DxfImport exactly
    var src = [];
    f.entities.forEach(function (e) {
      if (e.construction) return;   // (rfH: the slot's centerline is not written)
      if (e.t === 'line') src.push(['line', e.x1, e.y1, e.x2, e.y2]);
      else if (e.t === 'circle') src.push(['circle', e.cx, e.cy, e.r]);
      else if (e.t === 'arc') src.push(['arc', e.cx, e.cy, e.r]);
      else if (e.t === 'slot') src.push(['line', 2.5, 2.1875, 3.5, 2.1875], ['line', 2.5, 1.8125, 3.5, 1.8125], ['arc', 2.5, 2, 0.1875], ['arc', 3.5, 2, 0.1875]);
    });
    ['r12', '2000'].forEach(function (ver) {
      var back = W.DxfImport.parse(K.exportDXFSketch(f, 'in', { version: ver }));
      assert(back.units === 'in' && back.entities.length === src.length, ver + ': ' + back.entities.length + ' entities, ' + back.units);
      src.forEach(function (q) {
        var hit = back.entities.some(function (g) {
          if (q[0] === 'line' && g.t === 'line') return Math.max(Math.abs(g.x1 - q[1]), Math.abs(g.y1 - q[2]), Math.abs(g.x2 - q[3]), Math.abs(g.y2 - q[4])) <= 1e-9 || Math.max(Math.abs(g.x2 - q[1]), Math.abs(g.y2 - q[2]), Math.abs(g.x1 - q[3]), Math.abs(g.y1 - q[4])) <= 1e-9;
          return g.t === q[0] && Math.max(Math.abs(g.cx - q[1]), Math.abs(g.cy - q[2]), Math.abs(g.r - q[3])) <= 1e-9;
        });
        assert(hit, ver + ': not read back exactly: ' + JSON.stringify(q));
      });
    });
    var m2 = K.newModel('RT'); K.runScript(m2, K.generateScript(UI.App.model));
    var s2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0], diff = [];
    ['entities', 'rels', 'dims'].forEach(function (k) { rfdSame(f[k], s2[k], k, diff); });
    assert(!diff.length && m2.units === 'in', 'script round trip: ' + diff.slice(0, 5).join('; '));
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return f.entities.length + ' entities, ' + f.rels.length + ' relations, ' + f.dims.length + ' dimensions, Fully Defined';
  });
  step('rfD/dims: Smart Dimension of a slanted line in an inch part — placed off its side it is the length, above it the horizontal (dx), beside it the vertical (dy: over-defining, Make Dimension Driven?); in the Modify box a typed value then Esc keeps the old value (no undo step); on a circle ↑ steps the Ø 0.1 in with a live preview and Enter drives it in one undo step', async function () {
    var errs0 = errors.length, f = await rfdSketch(60, [1.5, 1]);
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 3, y2: 2 }, { t: 'circle', cx: -1.5, cy: 1, r: 0.5 }); UI.updateSketches();
    function len() { var e = f.entities[0]; return Math.hypot(e.x2 - e.x1, e.y2 - e.y1); }
    var inp = $('dim-edit').querySelector('input');
    UI.setTool('dimension');
    rskClick([1.5, 1]); selEv('mousemove', rskScr([1.0, 1.8])); rskClick([1.0, 1.8]);
    assert(f.dims.length === 1 && f.dims[0].k === 'len' && UI.isDimEditOpen() && UI.dimEditValue() === '3.6056', 'length ' + JSON.stringify(f.dims) + ' box ' + UI.dimEditValue());
    var u0 = UI.App.undo.length;
    r3sType(inp, '5'); r3sKey(inp, 'Escape');
    assert(!UI.isDimEditOpen() && f.dims.length === 1 && UI.App.undo.length === u0 && UI.App.tool === 'dimension', 'Esc: closed, kept, nothing to undo');
    near(len(), Math.sqrt(13), 1e-12, 'length kept');
    rskClick([1.0, 2 / 3]); selEv('mousemove', rskScr([1.3, 3.4])); rskClick([1.3, 3.4]);
    assert(f.dims.length === 2 && f.dims[1].k === 'dx' && UI.dimEditValue() === '3', 'above: horizontal ' + JSON.stringify(f.dims[1]) + ' ' + UI.dimEditValue());
    r3sKey(inp, 'Escape');
    rskClick([2, 4 / 3]); selEv('mousemove', rskScr([4.4, 1.2])); rskClick([4.4, 1.2]);
    assert(modalOpen() && $('drv-driven'), 'beside: the vertical one over-defines, Make Dimension Driven? asks');
    $('drv-driven').click();
    assert(f.dims.length === 3 && f.dims[2].k === 'dy' && f.dims[2].driven, 'vertical, driven ' + JSON.stringify(f.dims[2]));
    // the circle's Ø: placed, Escape, then a double press on its label reopens the Modify box; ↑ is 0.1 in
    rskClick([-1, 1]); selEv('mousemove', rskScr([-0.6, 1.8])); rskClick([-0.6, 1.8]);
    assert(f.dims.length === 4 && f.dims[3].k === 'dia' && UI.dimEditValue() === '1', 'Ø ' + JSON.stringify(f.dims[3]) + ' box ' + UI.dimEditValue());
    r3sKey(inp, 'Escape');
    UI.setTool('select');
    UI.App.dimsStale = false; UI.drawDims();
    var lab = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (t) { return t.textContent === 'Ø1.000'; })[0];
    assert(lab, 'the label Ø1.000: ' + Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (t) { return t.textContent; }).join(' '));
    var vr = $('viewport').getBoundingClientRect(), b = lab.getBoundingClientRect(), p = [b.left + b.width / 2 - vr.left, b.top + b.height / 2 - vr.top];
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    selEv('mousedown', p, lab); selEv('mouseup', p); selEv('mousedown', p, lab); selEv('mouseup', p);
    assert(UI.isDimEditOpen() && UI.dimEditValue() === '1', 'double press: the Modify box on 1');
    var u1 = UI.App.undo.length;
    r3sKey(inp, 'ArrowUp'); await wait(40);
    assert(UI.dimEditValue() === '1.1', 'ArrowUp: +0.1 in ' + UI.dimEditValue());
    near(f.entities[1].r, 0.55, 1e-9, 'live preview');
    r3sKey(inp, 'Enter');
    assert(!UI.isDimEditOpen() && UI.App.undo.length === u1 + 1, 'Enter: one undo step');
    near(f.entities[1].r, 0.55, 1e-12, 'Ø1.1'); near(len(), Math.sqrt(13), 1e-12, 'the line untouched');
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'len / dx / (dy); Ø1.000 → 1.100';
  });
  // --- end rfD ---
