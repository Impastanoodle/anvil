  // --- p9-sketch: shop input (fractions, mixed numbers, unit suffixes, arithmetic), the tangent-line follow-ups and the
  // shop-part audit (a 6 × 4 inch blank sketched and dimensioned through the UI only)
  async function p9Inch() {
    await anvil.newPart(); await idle();
    UI.App.model.units = 'in';   // the suite presets new documents to mm (anvil.units); this group is inch, as the shop works
  }
  function p9Field(key) { return D.querySelector('#pm input.pm-num[data-key="' + key + '"]'); }
  function p9Hint(key) { return D.querySelector('#pm .pm-expr-hint[data-key="' + key + '"]'); }
  step('p9-sketch: a PropertyManager number field of an inch part takes shop input — "3" then "/" turns the box into a text box, 3/8 reads 0.375 (hint "= 0.375"), leaving it shows 0.375 in a number box again; 1-1/2, 25mm (0.984252 in) and 2*3/8 read right; a bad entry (3//8) refuses Enter and leaving puts the value back; OK commits the value read', async function () {
    await p9Inch();
    await anvil.run('p.units("in"); p.sketch("Top").circle(0, 0, 0.5);'); await idle();
    assert(UI.App.model.units === 'in', 'inch part');
    UI.cmdExtrude(false); await wait(30);
    var inp = p9Field('depth');
    assert(inp && inp.type === 'number', 'depth is a number box');
    inp.focus(); inp.select();
    r3sType(inp, '3');
    r3sKey(inp, '/');
    assert(inp.type === 'text' && inp.value === '3/', 'the "/" key made a text box holding "3/": ' + inp.type + ' "' + inp.value + '"');
    r3sType(inp, '3/8');
    near(UI.pmSpec().values.depth, 0.375, 1e-15, '3/8');
    assert(!p9Hint('depth').hidden && p9Hint('depth').textContent === '= 0.375', 'hint ' + p9Hint('depth').textContent);
    inp.blur();
    assert(inp.type === 'number' && +inp.value === 0.375 && p9Hint('depth').hidden, 'back to a number box showing 0.375: ' + inp.type + ' ' + inp.value);
    var cases = [['1-1/2', 1.5], ['1 1/2', 1.5], ['25mm', 25 / 25.4], ['2*3/8', 0.75], ['3/8"', 0.375]];
    cases.forEach(function (c) { UI.pmSetField('depth', c[0]); near(UI.pmSpec().values.depth, c[1], 1e-12, c[0]); });
    inp.focus(); inp.select();
    UI.pmSetField('depth', '1-1/2');
    UI.pmSetField('depth', '3//8');
    assert(p9Hint('depth').classList.contains('err') && /unexpected "\/"/.test(p9Hint('depth').textContent), 'error shown: ' + p9Hint('depth').textContent);
    r3sKey(inp, 'Enter');
    assert(UI.hasPM(), 'Enter refused with a bad entry');
    inp.blur();
    assert(inp.type === 'number' && /not changed/.test(statusText()), 'bad entry left: ' + inp.type + ' / ' + statusText());
    inp.focus(); UI.pmSetField('depth', '1-1/2'); inp.blur();
    await pmAccept();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && f.depth === 1.5, 'committed depth ' + f.depth);
    return 'depth 1-1/2 -> ' + f.depth + ' in';
  });
  step('p9-sketch: the Modify box and the on-screen numeric input of an inch sketch read shop input — 1-3/4, 2 3/8, 25.4mm, 2*3/8, =2*3/8 (an equation, as before); a bad entry keeps the value; a line typed as 1-1/2 long is 1.5 exactly; inch dimensions read .750 / 1.500', async function () {
    await p9Inch();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.01 / UI.cam.scale);
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }); f.dims = [{ e: 0, k: 'len', off: 0.2 }];
    UI.updateSketches();
    [['1-3/4', 1.75], ['2 3/8', 2.375], ['25.4mm', 1], ['2*3/8', 0.75], ['=2*3/8', 0.75]].forEach(function (c) {
      var r = UI.editDim(0, c[0]);
      assert(r.ok, c[0] + ': ' + JSON.stringify(r));
      near(f.entities[0].x2, c[1], 1e-12, c[0]);
    });
    var bad = UI.editDim(0, '3 furlongs');
    assert(!bad.ok && /Unknown unit "furlongs"/.test(bad.error), 'bad entry: ' + JSON.stringify(bad));
    UI.cancelDimEdit();
    near(f.entities[0].x2, 0.75, 1e-12, 'kept');
    UI.App.dimsStale = true; UI.drawDims();
    var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim:not(.temp) text'), function (t) { return t.textContent; });
    assert(labels.indexOf('.750') >= 0, 'inch label .750: ' + labels.join(' '));
    // the numeric input while drawing: L typed as a mixed number, the angle as 90deg
    UI.setTool('line'); rskClick([0, 1]);
    selEv('mousemove', rskScr([0.8, 1.6]));
    selKey('1');
    var box = UI.sketchNumBox();
    assert(box && box.length === 2, 'L / A box');
    r3sType(box[0], '1-1/2'); r3sType(box[1], '90deg'); r3sKey(box[0], 'Enter');
    selKey('Escape');
    var l = f.entities[f.entities.length - 1];
    assert(l.t === 'line' && Math.abs(l.x2 - l.x1) < 1e-12 && Math.abs(l.y2 - l.y1 - 1.5) < 1e-12, 'line 1-1/2 at 90deg: ' + JSON.stringify(l));
    UI.App.dimsStale = true; UI.drawDims();
    labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim:not(.temp) text'), function (t) { return t.textContent; });
    assert(labels.indexOf('1.500') >= 0, 'typed length dimensioned 1.500: ' + labels.join(' '));
    // a circle typed by its diameter (Ø, after R): exact radius, a Ø dimension
    UI.setTool('circle'); rskClick([3, 1]); selEv('mousemove', rskScr([3.2, 1.1]));
    selKey('.'); box = UI.sketchNumBox();
    assert(box && box.length === 2 && box[1].getAttribute('aria-label') === 'Diameter', 'R / Ø box');
    r3sType(box[1], '.281'); r3sKey(box[1], 'Enter');
    selKey('Escape');
    var c = f.entities[f.entities.length - 1];
    assert(c.t === 'circle' && c.r === 0.1405, 'hole Ø.281: r ' + c.r);
    return labels.join(' ');
  });
  step('p9-sketch: tangent through a chain — a Line chain whose first segment ends on a circle goes on tangent to it: the direction lock offers the tangent at the shared point, and the click adds Tangent with the circle (not redundant); near the start that lock beats the snap onto the circle, while a pick on the circle away from the start still lands on it', async function () {
    await rskNew();
    saAdd([{ t: 'circle', cx: 0, cy: 0, r: 10 }]);
    var a = 30 * Math.PI / 180, P = [10 * Math.cos(a), 10 * Math.sin(a)], u = [-Math.sin(a), Math.cos(a)], px = 0.25;
    UI.setTool('line'); rskClick([-30, 30]);
    var inf0 = saInfer(rskScr(P));
    assert(inf0.snap && inf0.snap.kind === 'on' && inf0.snap.e === 0, 'end on the circle: ' + JSON.stringify(inf0.snap));
    rskClick(P);
    var Q = UI.App.toolState.pts[0];
    near(Math.hypot(Q[0], Q[1]), 10, 1e-9, 'chain point on the circle');
    a = Math.atan2(Q[1], Q[0]); u = [-Math.sin(a), Math.cos(a)];   // the tangent where the click landed
    // near the start (3 mm along the tangent the circle is 1.8 px away): the tangent lock, not the circle
    var near3 = [Q[0] + u[0] * 3, Q[1] + u[1] * 3], i3 = saInfer(rskScr(near3));
    assert(i3.dir && i3.dir.type === 'tangent' && !(i3.snap && i3.snap.kind === 'on'), 'tangent lock near the start: ' + JSON.stringify({ dir: i3.dir && i3.dir.type, snap: i3.snap && i3.snap.kind }));
    // a pick on the circle well away from the start: the circle
    var b = 250 * Math.PI / 180, onC = saInfer(rskScr([10 * Math.cos(b), 10 * Math.sin(b)]));
    assert(onC.snap && onC.snap.kind === 'on' && onC.snap.e === 0, 'a pick on the circle away from the start: ' + JSON.stringify(onC.snap));
    // along the tangent, 1.5 px off it: locked, Tangent glyph; the click adds Tangent with the circle
    var tq = [Q[0] + u[0] * 15 + Math.cos(a) * 1.5 * px, Q[1] + u[1] * 15 + Math.sin(a) * 1.5 * px];
    selEv('mousemove', rskScr(tq));
    assert(D.querySelector('#dim-layer .sk-feedback use[href="#sk-ico-relTangent"]'), 'Tangent glyph on the chained line');
    rskClick(tq); selKey('Escape');
    var rl = sfRels(), l2 = rskEnts()[2];
    near(((l2.x2 - l2.x1) * Math.cos(a) + (l2.y2 - l2.y1) * Math.sin(a)) / Math.hypot(l2.x2 - l2.x1, l2.y2 - l2.y1), 0, 1e-9, 'square to the radius');
    assert(rl.indexOf('tangent:2,0') >= 0 && rl.indexOf('coincident:2.p1,1.p2') >= 0, 'Tangent through the chain: ' + rl.join(' '));
    var st = UI.sketchStatus();
    assert(st.rels.every(function (x) { return x === 'ok'; }), 'no redundant relation: ' + JSON.stringify(st.rels));
    return rl.join(' ');
  });
  step('p9-sketch: a tangent line with a typed length measures it from the sliding tangent point (not the clicked point), and N flips the sliding start to the other tangent point (shown in the hint)', async function () {
    await rskNew();
    saAdd([{ t: 'circle', cx: 0, cy: 0, r: 10 }]);
    UI.setTool('line'); UI.setLineTangentStart(true);   // rfE: Tangent start is opt-in (T)
    rskClick([10 * Math.cos(Math.PI / 6), 10 * Math.sin(Math.PI / 6)]);
    assert(UI.App.toolState.tanFrom, 'sliding start armed');
    assert(/<b>N<\/b>/.test($('sketch-hint').innerHTML), 'hint names N: ' + $('sketch-hint').textContent);
    selEv('mousemove', rskScr([30, -20]));
    selKey('2'); var box = UI.sketchNumBox();
    r3sType(box[0], '25'); r3sKey(box[0], 'Enter');
    var l = rskEnts()[1];
    assert(l && l.t === 'line', 'line placed');
    near(Math.hypot(l.x1, l.y1), 10, 1e-9, 'starts on the circle');
    near(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 25, 1e-9, 'length 25 from the tangent point');
    near(l.x1 * (l.x2 - l.x1) + l.y1 * (l.y2 - l.y1), 0, 1e-6, 'tangent at its start');
    var rl = sfRels();
    assert(rl.indexOf('tangent:1,0') >= 0 && rl.indexOf('coincident:1.p1,0') >= 0, 'Tangent + Coincident: ' + rl.join(' '));
    assert(rl.some(function (r) { return /^distance|^dim/.test(r); }) || (UI.activeSketchFeature().dims || []).some(function (d) { return d.e === 1 && d.k === 'len'; }), 'the typed length is a dimension');
    selKey('Escape'); selKey('Escape');
    // N: the other tangent point
    UI.setTool('line');
    rskClick([10 * Math.cos(200 * Math.PI / 180), 10 * Math.sin(200 * Math.PI / 180)]);
    var cur = [-30, -20];
    selEv('mousemove', rskScr(cur));
    var t1 = UI.App.tempEntities[0], T1 = [t1.x1, t1.y1];
    selKey('n');
    var t2 = UI.App.tempEntities[0], T2 = [t2.x1, t2.y1];
    function tangentAt(T, Q) { return Math.abs(Math.hypot(T[0], T[1]) - 10) < 1e-9 && Math.abs(T[0] * (Q[0] - T[0]) + T[1] * (Q[1] - T[1])) < 1e-6; }
    assert(tangentAt(T1, cur) && tangentAt(T2, cur) && Math.hypot(T1[0] - T2[0], T1[1] - T2[1]) > 5, 'N took the other tangent point: ' + JSON.stringify([T1, T2]));
    selEv('mousemove', rskScr([-31, -20]));
    var t3 = UI.App.tempEntities[0];
    assert(Math.hypot(t3.x1 - T2[0], t3.y1 - T2[1]) < 1, 'it stays on that side as the cursor moves');
    rskClick([-31, -20]); selKey('Escape'); selKey('Escape');
    var l2 = rskEnts()[2];
    assert(Math.hypot(l2.x1 - T2[0], l2.y1 - T2[1]) < 1 && sfRels().indexOf('tangent:2,0') >= 0, 'the line leaves the flipped point, Tangent: ' + JSON.stringify(l2));
    UI.setLineTangentStart(false);
    return 'L 25 from ' + JSON.stringify([fmt(l.x1), fmt(l.y1)]) + '; N: ' + JSON.stringify(T1.map(fmt)) + ' -> ' + JSON.stringify(T2.map(fmt));
  });
  step('p9-sketch: shop audit — a 6 × 4 inch blank sketched through the UI as a shop types it (corner rectangle W 6 H 4, Sketch Fillet R 1/4 on the corners, four Ø.281 holes typed as Ø, a .5 wide slot 1 between centres, Smart Dimensions from the hole and slot centres to the edges typed 1/2, .5, 2-1/2) ends Fully Defined with exact sizes, ANSI inch labels clear of each other\'s lines, and extrudes to the analytic volume', async function () {
    await p9Inch();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.012 / UI.cam.scale);
    UI.setTool('rect'); rskClick([0, 0]); selEv('mousemove', rskScr([2.8, 1.7])); selKey('6');
    var box = UI.sketchNumBox();
    r3sType(box[0], '6'); r3sType(box[1], '4'); r3sKey(box[1], 'Enter');
    UI.setTool('select');
    UI.zoomToFit(); await wait(700); UI.zoomView(1.5); await wait(600);
    [[-0.9, -0.6], [6.6, 4.6]].forEach(function (q) { var s = rskScr(q); assert(s[0] > 0 && s[1] > 0 && s[0] < UI.size.w && s[1] < UI.size.h, 'placement area on screen: ' + q + ' -> ' + s); });
    UI.cmdSketchFillet(); await wait(30);
    var rf = p9Field('r'); rf.focus(); rf.select(); r3sType(rf, '1'); r3sKey(rf, '/'); r3sType(rf, '1/4');
    near(UI.pmSpec().values.r, 0.25, 0, 'fillet radius 1/4');
    [[0, 0], [6, 0], [6, 4], [0, 4]].forEach(function (c) { rskClick(c); });
    await pmAccept();
    assert(rskEnts().filter(function (e) { return e.t === 'arc' && e.r === 0.25; }).length === 4, 'four R.25 fillets');
    var holes = [[0.5, 0.5], [5.5, 0.5], [5.5, 3.5], [0.5, 3.5]];
    UI.setTool('circle');
    holes.forEach(function (h) {
      rskClick(h); selEv('mousemove', rskScr([h[0] + 0.12, h[1] + 0.05])); selKey('.');
      var b = UI.sketchNumBox(); r3sType(b[0], '.'); r3sType(b[1], '.281'); r3sKey(b[1], 'Enter');
    });
    UI.setTool('slot');
    rskClick([2.5, 2]); selEv('mousemove', rskScr([3.4, 2])); selKey('1');
    box = UI.sketchNumBox(); r3sType(box[0], '1'); r3sType(box[1], '0'); r3sKey(box[0], 'Enter');
    selEv('mousemove', rskScr([3, 2.3])); selKey('.');
    box = UI.sketchNumBox(); r3sType(box[0], '1/2'); r3sKey(box[0], 'Enter');
    UI.setTool('select');
    var dimInput = D.querySelector('#dim-edit input'), placed = 0;
    function dim2(a, b, place, text) {
      UI.setTool('dimension');
      rskClick(a); rskClick(b); rskClick(place);
      assert(!$('dim-edit').hidden, 'Modify box for ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b) + ' (' + statusText() + ')');
      dimInput.value = text; r3sKey(dimInput, 'Enter');
      placed++;
    }
    dim2([0.5, 0.5], [0, 2], [0.25, -0.5], '1/2'); dim2([0.5, 0.5], [3, 0], [-0.5, 0.25], '1/2');
    dim2([5.5, 0.5], [6, 2], [5.75, -0.5], '.5'); dim2([5.5, 0.5], [3, 0], [6.5, 0.25], '.5');
    dim2([5.5, 3.5], [6, 2], [5.75, 4.5], '.5'); dim2([5.5, 3.5], [3, 4], [6.5, 3.75], '.5');
    dim2([0.5, 3.5], [0, 2], [0.25, 4.5], '.5'); dim2([0.5, 3.5], [3, 4], [-0.5, 3.75], '.5');
    dim2([2.5, 2], [0, 2.6], [1.25, 4.8], '2-1/2'); dim2([2.5, 2], [3, 0], [-0.9, 1], '2');
    UI.setTool('select');
    var st = UI.sketchStatus();
    assert(st.status === 'full', 'Fully Defined: ' + st.text + ' dof ' + st.dof);
    // rfH: the slot is two lines, two arcs and its construction centerline
    var E = rskEnts(), circles = E.filter(function (e) { return e.t === 'circle'; }), slot = E.filter(function (e) { return e.t === 'line' && e.construction; })[0];
    var slotEnds = E.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.25) < 1e-9 && Math.abs(e.cy - 2) < 1e-9; });
    assert(circles.length === 4 && circles.every(function (c) { return c.r === 0.1405; }), 'holes Ø.281 exactly: ' + circles.map(function (c) { return c.r; }).join());
    circles.forEach(function (c, i) { near(c.cx, holes[i][0], 1e-9, 'hole ' + i + ' x'); near(c.cy, holes[i][1], 1e-9, 'hole ' + i + ' y'); });
    assert(slot && slotEnds.length === 2 && Math.abs(slot.x1 - 2.5) < 1e-9 && Math.abs(slot.x2 - 3.5) < 1e-9 && Math.abs(slot.y1 - 2) < 1e-9, 'slot ' + JSON.stringify([slot, slotEnds]));
    // labels clear of the other dimensions' lines at a working zoom (0.0104 in per pixel: .5 is 48 px)
    UI.zoomView(0.0104 / UI.cam.scale); await wait(600);
    UI.App.dimsStale = true; if (UI.requestRender) UI.requestRender(); await wait(400);   // the settled layout (all passes), drawn by the render loop
    var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim:not(.temp) text'), function (t) { return t.textContent; });
    ['R.250', 'Ø.281', '.500', '6.000', '4.000', '2.500', '2.000', '1.000'].forEach(function (x) { assert(labels.indexOf(x) >= 0, 'label ' + x + ' in ' + labels.join(' ')); });
    assert(UI.dimLabelClashes() === 0, 'labels on another dimension\'s lines: ' + UI.dimLabelClashes(true).join(', '));
    UI.exitSketch(); await idle();
    assert(UI.App.mode !== 'sketch', 'sketch closed');
    UI.cmdExtrude(false); await wait(30);
    UI.pmSetField('depth', '.0598'); await pmAccept();
    var area = 24 - 4 * (0.0625 - Math.PI * 0.0625 / 4) - 4 * Math.PI * 0.1405 * 0.1405 - (0.5 + Math.PI * 0.0625);
    var vol = anvil.mass().volume;
    assert(Math.abs(vol - area * 0.0598) < 1e-6 * area * 0.0598, 'volume ' + vol + ', expected ' + area * 0.0598);
    return st.text + ' · ' + placed + ' dimensions typed · volume ' + vol.toFixed(6) + ' in³';
  });
  // --- end p9-sketch ---
