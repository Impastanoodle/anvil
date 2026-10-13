  // --- rfBX ---
  // (2026-10-13, lane BX) A shop drawing of a 16 ga inch bracket made the way the user makes them in SolidWorks:
  // Make Drawing from Part, sheet scale, flat pattern, notes, Smart Dimension, ordinates, DXF. What a checker
  // red-lined: the bend's "2X R.060" stood on the overall height's "3.680"; notes, bend notes and hole callouts were
  // 3.5 mm (.138 in) beside .125 in dimensions; the Dimension PM's first Enter showed nothing; a second hole in a
  // column gave a duplicate ordinate.
  var BX_BRACKET = 'p.name("Bracket").units("in");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
    'p.flange(1.5, [[0, 0.0598, 1.5]]);\np.flange(2, [[6, 0.0598, 1.5]], { reverse: true });\n' +
    'p.hole("Top", 1.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -0.75, 0.281, { offset: 0.0598 });\n' +
    'p.hole("Top", 1.5, -2.25, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -2.25, 0.281, { offset: 0.0598 });\np.hole("Top", 3, -1.5, 0.5, { offset: 0.0598 });';
  async function rfBXdrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(BX_BRACKET); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    assert(UI.drawingActive(), 'drawing open');
  }
  function rfBXtexts() { return UI.drawing.state.sheet.prims.filter(function (x) { return x.k === 'text'; }); }
  function rfBXtext(re) { return rfBXtexts().filter(function (x) { return re.test(x.text); })[0]; }
  function rfBXsegs(dimIx) { return UI.drawing.state.sheet.prims.filter(function (x) { return x.k === 'line' && x.dimIx === dimIx; }).map(function (x) { return [x.a, x.b]; }); }
  function rfBXcross(a, b, p, q) {
    function sd(o, e, x) { return (e[0] - o[0]) * (x[1] - o[1]) - (e[1] - o[1]) * (x[0] - o[0]); }
    var d1 = sd(p, q, a), d2 = sd(p, q, b), d3 = sd(a, b, p), d4 = sd(a, b, q);
    return d1 * d2 < -1e-18 && d3 * d4 < -1e-18;
  }
  function rfBXclick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  // the bend radius is clear of the overall height dimension: no text within .08 in, its leader crosses none of the
  // height's lines, and it sits inside the front view (the empty inside of the bend), not in the dimension lane
  function rfBXradiusClear(label) {
    var rad = rfBXtext(/^2X R\.060$/), ht = rfBXtext(/^3\.680$/), F = dwView('Front');
    assert(rad && ht, label + ': texts ' + rfBXtexts().map(function (x) { return x.text; }).join(' | '));
    var rr = W.Drawing.textRect(rad), hr = W.Drawing.textRect(ht), m = 0.08;
    assert(rr.x0 > hr.x1 + m || hr.x0 > rr.x1 + m || rr.y0 > hr.y1 + m || hr.y0 > rr.y1 + m, label + ': 2X R.060 ' + JSON.stringify(rr) + ' against 3.680 ' + JSON.stringify(hr));
    var rs = rfBXsegs(rad.dimIx), hs = rfBXsegs(ht.dimIx);
    assert(rs.length >= 2 && hs.length >= 3, label + ': leader / height lines ' + rs.length + ' / ' + hs.length);
    rs.forEach(function (s) { hs.forEach(function (h) { assert(!rfBXcross(s[0], s[1], h[0], h[1]), label + ': the radius leader crosses a line of the 3.680 dimension'); }); });
    assert(rr.x0 > F.box[0] && rr.y0 > F.box[1] && rr.x1 < F.box[2] && rr.y1 < F.box[3], label + ': inside the front view ' + JSON.stringify([rr, F.box]));
    return rr;
  }
  step('rfBX: Make Drawing of a 16 ga inch bracket — the bend radius "2X R.060" sits inside the bend, clear of the overall height "3.680" (no overlap, its leader crosses none of its lines) at 1:1 and at 1:2', async function () {
    await rfBXdrawing();
    anvil.drawing.setSheet({ scale: '1:1' }); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary();
    assert(s.sheet.format === 'ANSI B' && s.dims.indexOf('3.680') >= 0 && s.dims.indexOf('2X R.060') >= 0, 'model items ' + s.dims.join(' '));
    var r1 = rfBXradiusClear('1:1');
    anvil.drawing.setSheet({ scale: '1:2' }); await UI.drawing.ready(); await wait(30);
    var r2 = rfBXradiusClear('1:2');
    // the arrow lands on the inside arc from the concave side: the text is up and right of the left bend's corner
    var F = dwView('Front');
    assert(r2.x0 > F.box[0] + 0.05, 'right of the left flange ' + JSON.stringify([r2, F.box]));
    return '1:1 at ' + [r1.x0, r1.y0].map(fmt).join(', ') + '; 1:2 at ' + [r2.x0, r2.y0].map(fmt).join(', ');
  });
  step('rfBX: on an inch drawing a note, the flat pattern\'s bend notes and a hole callout are .125 in tall, as the dimensions (were 3.5 mm = .138); the DXF carries .125; a millimetre drawing keeps 3.5', async function () {
    await rfBXdrawing();
    anvil.drawing.setSheet({ scale: '1:2' }); await UI.drawing.ready(); await wait(30);
    var fv = anvil.drawing.flatView({ x: 3.1, y: 3.0 }); await UI.drawing.ready(); await wait(30);
    assert(fv && fv.views.some(function (v) { return v.kind === 'flat'; }), 'flat view');
    anvil.drawing.note({ p: [0.8, 1.6], text: 'NOTES:\n1. BREAK ALL SHARP EDGES' });
    var T = dwView('Top');
    anvil.drawing.holeCallout(T.id, { c: [1.5, -0.75], r: 0.1405 }); await UI.drawing.ready(); await wait(30);
    // (the bend note's wording is the kernel's: matched by its start)
    var want = /^(NOTES:|UP 90|DOWN 90|6\.240$|3\.680$)|THRU/, seen = {};
    rfBXtexts().forEach(function (x) { if (want.test(x.text)) { seen[x.text] = x.h; near(x.h, 0.125, 1e-6, x.text + ' height'); } });
    var keys = Object.keys(seen);
    ['^NOTES:', '^UP 90', '^DOWN 90', '^6\\.240$', 'THRU'].forEach(function (re) { assert(keys.some(function (t) { return new RegExp(re).test(t); }), re + ' among ' + JSON.stringify(seen)); });
    var dxf = anvil.drawing.dxf(), L = dxf.split(/\r?\n/), hs = {};
    for (var i = 0; i + 1 < L.length; i += 2) {
      if (L[i].trim() === '0' && L[i + 1] === 'TEXT') {
        var lay = null, h = null;
        for (var j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2) { if (L[j].trim() === '8') lay = L[j + 1]; if (L[j].trim() === '40') h = +L[j + 1]; }
        if (lay === 'NOTES' || lay === 'BEND_NOTES' || lay === 'ANNOTATIONS' || lay === 'DIMENSIONS') (hs[lay] = hs[lay] || []).push(h);
      }
    }
    ['NOTES', 'BEND_NOTES', 'ANNOTATIONS'].forEach(function (l) { assert(hs[l] && hs[l].length && hs[l].every(function (h) { return Math.abs(h - 0.125) < 1e-4; }), 'DXF ' + l + ' text heights ' + JSON.stringify(hs[l])); });
    // millimetres: unchanged, 3.5
    await anvil.newPart(); await idle();
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.note({ p: [20, 20], text: 'DEBURR' }); await wait(30);
    var mm = rfBXtext(/^DEBURR$/);
    assert(mm && Math.abs(mm.h - 3.5) < 1e-9, 'mm note ' + (mm && mm.h));
    return JSON.stringify(seen);
  });
  step('rfBX: Dimension PM, two-Enter rule — click 6.240, type "<DIM> REF" in Text: the first Enter shows "6.240 REF" on the sheet and keeps the PM, the second closes it; one Undo puts 6.240 back; ✗ after typing restores it', async function () {
    await rfBXdrawing();
    function dimTextPrim(t) { return rfBXtexts().filter(function (x) { return x.text === t; })[0]; }
    function clickText(t) { var r = W.Drawing.textRect(dimTextPrim(t)); rfBXclick([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]); }
    clickText('6.240'); await wait(30);
    assert(UI.hasPM() && UI.pmSpec().command === 'dimension', 'Dimension PM on a click');
    var ti = pmField('Text');
    assert(ti && ti.value === '<DIM>', 'Text box ' + (ti && ti.value));
    ti.focus(); ti.value = '<DIM> REF'; ti.dispatchEvent(new W.Event('input', { bubbles: true }));
    pressEnter(ti); await wait(30);
    assert(UI.hasPM() && anvil.drawing.summary().dims.indexOf('6.240 REF') >= 0, 'first Enter: on the sheet, PM open: ' + anvil.drawing.summary().dims.join(' '));
    pressEnter(pmField('Text') || ti); await wait(30);
    assert(!UI.hasPM() && anvil.drawing.summary().dims.indexOf('6.240 REF') >= 0, 'second Enter closes');
    await UI.undo(); await idle(); await wait(60);
    var after = anvil.drawing.summary().dims;
    assert(UI.drawingActive() && after.indexOf('6.240') >= 0 && after.indexOf('6.240 REF') < 0, 'one Undo: ' + after.join(' '));
    // ✗: typed text shows, then goes
    clickText('6.240'); await wait(30);
    ti = pmField('Text'); ti.focus(); ti.value = '<DIM> TYP'; ti.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(30);
    assert(anvil.drawing.summary().dims.indexOf('6.240 TYP') >= 0, 'live while typing');
    UI.pmCancel(); await wait(30);
    var c = anvil.drawing.summary().dims;
    assert(!UI.hasPM() && c.indexOf('6.240') >= 0 && c.indexOf('6.240 TYP') < 0, '✗ restores: ' + c.join(' '));
    return 'REF on the first Enter, undone in one step; TYP cancelled';
  });
  step('rfBX: Ordinate Dimension on the Top view — base the left edge, then all five holes: 0, 1.620, 3.120, 4.620; the second hole of each column is refused as a duplicate', async function () {
    await rfBXdrawing();
    var H = anvil.drawing.summary().sheet.size[1], T = dwView('Top');
    var circ = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="TOP"] circle'), function (c) { return [+c.getAttribute('cx'), H - c.getAttribute('cy'), +c.getAttribute('r')]; });
    assert(circ.length === 5, 'five holes on Top ' + circ.length);
    ribbonButton('Ordinate Dimension').click();
    assert(UI.drawing.state.tool === 'ordinate', 'ordinate tool');
    rfBXclick([T.box[0], (T.box[1] + T.box[3]) / 2]);
    assert(/base picked/.test(statusText()), 'base: ' + statusText());
    var msgs = [];
    circ.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).forEach(function (c) { rfBXclick([c[0] + c[2], c[1]]); msgs.push(statusText()); });
    var td = anvil.drawing.doc().views.filter(function (v) { return v.id === T.id; })[0].dims.filter(function (d) { return d.kind === 'ordinate'; });
    assert(td.length === 1 && td[0].refs.length === 3, 'one ordinate, three features ' + JSON.stringify(td.map(function (d) { return d.refs.length; })));
    var tx = anvil.drawing.summary().dims;
    assert(tx.indexOf('0, 1.620, 3.120, 4.620') >= 0, 'the ordinate set, each value once: ' + tx.join(' | '));
    assert(msgs.filter(function (m) { return /dimensioned already/.test(m); }).length === 2, 'two refused: ' + msgs.join(' / '));
    UI.pmCancel(); await wait(30);
    return tx.join(' ');
  });
