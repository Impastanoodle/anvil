  // --- rfIJ (2026-11-05, lane drawfix) --- in the app: a bent inch bracket on an A-size sheet; a section added through
  // anvil.drawing.sectionView with no position lands inside the border, clear of the title block and the other views;
  // the isometric view's DXF (the app's export) has every visible edge end meeting the next within 1e-6; scale texts.
  var IJ_PART = 'p.name("IJBracket").units("in");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
    'p.flange(1.5, [[0, 0.0598, 1.5]]);\np.flange(2, [[6, 0.0598, 1.5]], { reverse: true });\n' +
    'p.hole("Top", 1.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -2.25, 0.281, { offset: 0.0598 });\np.hole("Top", 3, -1.5, 0.5, { offset: 0.0598 });';
  // LINE / ARC / ELLIPSE ends of one DXF layer
  function rfIJEnds(dxf, layer) {
    var L = dxf.split(/\r?\n/), ents = [], cur = null, E = [];
    for (var i = 0; i + 1 < L.length; i += 2) {
      var c = L[i].trim(), v = L[i + 1].trim();
      if (c === '0') { cur = { t: v, g: {} }; ents.push(cur); } else if (cur && !(c in cur.g)) cur.g[c] = v;
    }
    ents.forEach(function (e, id) {
      var g = e.g;
      if (g['8'] !== layer) return;
      if (e.t === 'LINE') { E.push({ p: [+g['10'], +g['20']], id: id }); E.push({ p: [+g['11'], +g['21']], id: id }); }
      if (e.t === 'ARC') { var R = +g['40']; [+g['50'], +g['51']].forEach(function (a) { a *= Math.PI / 180; E.push({ p: [+g['10'] + R * Math.cos(a), +g['20'] + R * Math.sin(a)], id: id }); }); }
      if (e.t === 'ELLIPSE' && Math.abs(+g['42'] - +g['41'] - 2 * Math.PI) > 1e-9) {
        var M = [+g['11'], +g['21']], q = +g['40'];
        [+g['41'], +g['42']].forEach(function (t) { E.push({ p: [+g['10'] + Math.cos(t) * M[0] - Math.sin(t) * M[1] * q, +g['20'] + Math.cos(t) * M[1] + Math.sin(t) * M[0] * q], id: id }); });
      }
    });
    return E;
  }
  step('rfIJ: bent bracket on ANSI A: a section from anvil.drawing.sectionView lands inside the border and clear of the title block; the isometric DXF has no gaps; SCALE 1 : 2 style labels', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(IJ_PART); await idle();
    anvil.drawing.make({ fresh: true, format: 'ANSI A' }); await UI.drawing.ready(); await wait(30);
    var sm = anvil.drawing.summary(), F = sm.views.filter(function (v) { return v.orient === 'Front'; })[0];
    assert(sm.sheet.format === 'ANSI A' && F, 'ANSI A sheet with a Front view: ' + sm.sheet.format);
    var before = sm.views.length;
    await anvil.drawing.sectionView(F.id, { axis: 'v', at: 3, sign: 1 }); await UI.drawing.ready(); await wait(30);
    sm = anvil.drawing.summary();
    assert(sm.views.length === before + 1, 'one view added');
    var sv = sm.views.filter(function (v) { return v.kind === 'section'; })[0], S = sm.sheet.size, b1 = 10 / 25.4, b = sv.box;
    assert(b[0] >= b1 && b[1] >= b1 && b[2] <= S[0] - b1 && b[3] <= S[1] - b1, 'inside the border ' + JSON.stringify(b) + ' of ' + JSON.stringify(S));
    W.Drawing.tbRects(S, 'in').forEach(function (t) { assert(b[2] <= t.x0 || b[0] >= t.x1 || b[3] <= t.y0 || b[1] >= t.y1, 'clear of the title block ' + JSON.stringify([b, t])); });
    sm.views.forEach(function (o) { if (o.id !== sv.id) assert(b[2] <= o.box[0] || b[0] >= o.box[2] || b[3] <= o.box[1] || b[1] >= o.box[3], 'clear of ' + o.name); });
    var texts = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
    assert(texts.indexOf('SECTION ' + sv.label + '-' + sv.label) >= 0, 'section label');
    assert(!texts.some(function (t) { return /^SCALE\s*\d+(\.\d+)?:\d/.test(t); }), 'no unspaced view scale');
    if (sv.scale) assert(texts.indexOf('SCALE ' + sv.scale.replace(':', ' : ')) >= 0, 'SCALE x : y under the section (' + sv.scale + ')');
    ['R2000'].forEach(function (ver) {   // (R12 writes ellipses as polylines: kernel group rfIJ checks that one)
      var E = rfIJEnds(anvil.drawing.dxf({ version: ver }), 'ISOMETRIC'), gaps = [];
      E.forEach(function (a) {
        var best = Infinity;
        E.forEach(function (c) { if (c.id !== a.id) best = Math.min(best, Math.hypot(a.p[0] - c.p[0], a.p[1] - c.p[1])); });
        if (best > 1e-6 && best < 0.05) gaps.push(best.toExponential(2));
      });
      assert(E.length >= 16 && !gaps.length, ver + ' isometric: ' + E.length + ' ends, gaps ' + gaps.slice(0, 6).join(', '));
    });
    assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
  });
