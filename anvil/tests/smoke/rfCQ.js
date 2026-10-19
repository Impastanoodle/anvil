  // --- rfCQ (2026-10-19, lane CQ: drawing fidelity) --- view labels as SolidWorks shows them (model views unlabelled
  // until Display label is ticked in the view's PropertyManager), a Revision Table per sheet, and Detail View from a
  // closed profile sketched in a view (Full outline round the detail). Real mouse events on the sheet.
  var CQ_PART = 'p.name("CQPlate").units("mm");\np.box(120, 80, 6);\np.hole("Top", 60, -40, 10, { offset: 6 });';
  async function rfCQDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(CQ_PART); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    UI.drawing.fit(); await wait(20);
    return anvil.drawing.summary();
  }
  function rfCQClient(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function rfCQMouse(type, p, opts) {
    var c = rfCQClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, clientX: c.clientX, clientY: c.clientY, detail: type === 'dblclick' ? 2 : 1 }, opts || {})));
  }
  function rfCQClick(p) { rfCQMouse('mousemove', p); rfCQMouse('mousedown', p); rfCQMouse('mouseup', p); }
  function rfCQView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfCQLayerTexts(id) { var w = rfCQView(id); return UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === w.layer; }).map(function (p) { return p.text; }); }
  function rfCQSvgTexts(layer) { var g = D.querySelector('#drawing-sheet svg g[data-layer="' + layer + '"]'); return g ? Array.prototype.map.call(g.querySelectorAll('text'), function (t) { return t.textContent; }) : []; }
  function rfCQButton(label) {
    var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
    var b = find();
    ['View Layout', 'Annotation', 'Sketch'].forEach(function (t) {
      if (b) return;
      var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0];
      if (tab) { tab.click(); b = find(); }
    });
    assert(b, 'ribbon button ' + label);
    return b;
  }
  // a free spot of w x h on the sheet (paper units: no view there, inside the border, above the title block)
  function rfCQFree(w, h) {
    var st = UI.drawing.state, S = st.sheet.size, boxes = st.sheet.views.map(function (x) { return x.box; });
    for (var y = S[1] - 15 - h; y > 60; y -= 2) for (var x = 15; x + w < S[0] - 15; x += 2) {
      if (boxes.every(function (b) { return x + w < b.x0 - 6 || x > b.x1 + 6 || y + h < b.y0 - 16 || y > b.y1 + 6; })) return [x + w / 2, y + h / 2];
    }
    return null;
  }

  step('rfCQ: Standard 3 View puts no label on the model views (SolidWorks); double-click the isometric, tick Display label in its PropertyManager, ✓ — it reads ISOMETRIC / SCALE at the scale it is drawn at, on the sheet and in the SVG; a section view keeps its SECTION label', async function () {
    var errs0 = errors.length;
    var s = await rfCQDrawing(), iso = s.views.filter(function (v) { return v.orient === 'Isometric'; })[0];
    assert(iso && s.views.length === 4, 'four views ' + s.views.length);
    s.views.forEach(function (v) { var t = rfCQLayerTexts(v.id); assert(!t.length, v.orient + ' has no label: ' + t.join(' | ')); assert(v.showLabel === false, v.orient + ' showLabel ' + v.showLabel); });
    assert(!rfCQSvgTexts('ISOMETRIC').some(function (t) { return /ISOMETRIC|SCALE/.test(t); }), 'no label text in the SVG');
    var w = rfCQView(iso.id), c = [(w.box.x0 + w.box.x1) / 2, (w.box.y0 + w.box.y1) / 2];
    rfCQMouse('mousedown', c); rfCQMouse('mouseup', c); rfCQMouse('dblclick', c);
    await wait(30);
    assert(UI.pmSpec() && UI.pmTitle() === w.view.name, 'View Properties of the isometric: ' + UI.pmTitle());
    var cb = pmField('Display label');
    assert(cb && cb.type === 'checkbox' && !cb.checked && !cb.disabled, 'Display label box, off');
    cb.click();
    D.querySelector('#pm .pm-ok').click();
    await idle(); await UI.drawing.ready(); await wait(30);
    var sc = w.view.scale ? w.view.scale : UI.drawing.state.sheet.views[0] && anvil.drawing.doc().sheet.scale, want = 'SCALE ' + sc[0] + ' : ' + sc[1];
    var t1 = rfCQLayerTexts(iso.id);
    assert(t1.join('|') === 'ISOMETRIC|' + want, 'label ' + t1.join(' | ') + ' (want ' + want + ')');
    assert(rfCQSvgTexts('ISOMETRIC').join('|').indexOf(want) >= 0, 'in the SVG: ' + rfCQSvgTexts('ISOMETRIC').join(' | '));
    assert(anvil.drawing.summary().views.filter(function (v) { return v.id === iso.id; })[0].showLabel === true, 'summary showLabel');
    // a section and a detail still get theirs
    var front = s.views.filter(function (v) { return v.orient === 'Front'; })[0], top = s.views.filter(function (v) { return v.orient === 'Top'; })[0];
    var s2 = anvil.drawing.sectionView(top.id, { axis: 'h', at: -40 });
    var sec = s2.views.filter(function (v) { return v.kind === 'section'; })[0];
    await UI.drawing.ready(); await wait(30);
    assert(sec && sec.showLabel && rfCQLayerTexts(sec.id).indexOf('SECTION ' + sec.label + '-' + sec.label) >= 0, 'section labelled: ' + (sec && rfCQLayerTexts(sec.id).join(' | ')));
    assert(front && errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return t1.join(' / ');
  });

  step('rfCQ: Annotation ▸ Revision Table goes on the sheet it is inserted on — Add Sheet shows a sheet without it (no REVISIONS layer, no tree row), sheet 1 keeps it', async function () {
    var errs0 = errors.length;
    await rfCQDrawing();
    rfCQButton('Revision Table').click();
    await idle(); await UI.drawing.ready();
    anvil.drawing.addRevision({ description: 'FIRST ISSUE' });
    await UI.drawing.ready(); await wait(20);
    var r1 = anvil.drawing.summary().revisions;
    assert(r1 && r1.rows.length === 1 && r1.rows[0].rev === 'A', 'sheet 1 table ' + JSON.stringify(r1));
    assert(D.querySelector('#drawing-sheet svg g[data-layer="REVISIONS"]'), 'REVISIONS layer on sheet 1');
    assert(anvil.drawing.addSheet({}), 'sheet 2 added');
    await UI.drawing.ready(); await wait(30);
    var s2 = anvil.drawing.summary();
    assert(s2.sheet.index === 1 && !s2.revisions, 'sheet 2 has no Revision Table: ' + JSON.stringify(s2.revisions));
    var g = D.querySelector('#drawing-sheet svg g[data-layer="REVISIONS"]');
    assert(!g || !g.querySelector('line, text, path, polyline'), 'no REVISIONS drawn on sheet 2');
    assert(!Array.prototype.some.call(D.querySelectorAll('.dw-revtable'), function (x) { return x.offsetParent !== null; }), 'no Revision Table row in the tree');
    assert(anvil.drawing.activateSheet(0), 'back to sheet 1');
    await UI.drawing.ready(); await wait(30);
    var r3 = anvil.drawing.summary().revisions;
    assert(r3 && r3.rows.length === 1, 'sheet 1 keeps it');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'sheet 1: REV A · sheet 2: none';
  });

  step('rfCQ: Detail View from a sketched profile — Line tool clicks a closed diamond round the hole in the Top view, select one of its lines, Detail View (Profile; Full outline ticked, its boxes live), click to place: the detail shows only the hole, its boundary is the diamond on the parent and round the detail', async function () {
    var errs0 = errors.length;
    var s = await rfCQDrawing(), top = s.views.filter(function (v) { return v.orient === 'Top'; })[0], w = rfCQView(top.id);
    var hole = w.proj.circles.visible.filter(function (c) { return Math.abs(c.r - 5) < 1e-6; })[0];
    assert(hole, 'the hole in the Top view');
    var R = 15, P = [[R, 0], [0, R], [-R, 0], [0, -R]].map(function (d) { return w.toSheet([hole.c[0] + d[0], hole.c[1] + d[1]]); });
    rfCQButton('Line').click();
    assert(UI.drawing.state.tool === 'sk:line', 'Line tool ' + UI.drawing.state.tool);
    P.concat([P[0]]).forEach(function (q) { rfCQClick(q); });
    key('Escape'); await idle(); key('Escape'); await idle();
    var lines = anvil.drawing.sketch.list(top.id).filter(function (e) { return e.t === 'line'; });
    assert(lines.length === 4, 'four lines in the Top view: ' + lines.length);
    // the Detail View PM's options are live (not greyed)
    rfCQButton('Detail View').click(); await wait(20);
    ['Full outline', 'Jagged outline', 'Display label'].forEach(function (l) { var f = pmField(l); assert(f && !f.disabled, l + ' live'); });
    assert(Array.prototype.every.call(D.querySelectorAll('#pm input[type="radio"]'), function (x) { return !x.disabled; }), 'Circle / Profile live');
    key('Escape'); await idle();
    // select the profile (one of its lines), then Detail View
    var mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
    rfCQClick(mid); await wait(20);
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'sk', 'a sketch line selected: ' + JSON.stringify(UI.drawing.state.sel));
    rfCQButton('Detail View').click(); await wait(20);
    assert(UI.drawing.state.tool === 'detail' && UI.drawing.state.pending.pts && UI.drawing.state.pending.pts.length === 4, 'the profile is the boundary');
    assert(UI.pmSpec().values.shape === 'profile', 'Profile chosen');
    pmField('Full outline').click();
    var spot = rfCQFree(2 * 2 * R * w.scale + 10, 2 * 2 * R * w.scale + 20);
    assert(spot, 'a free spot');
    rfCQMouse('mousemove', spot); rfCQClick(spot);
    await idle(); await UI.drawing.ready(); await wait(40);
    var sum = anvil.drawing.summary(), det = sum.views.filter(function (v) { return v.kind === 'detail'; })[0];
    assert(det, 'detail view placed: ' + sum.views.map(function (v) { return v.kind; }).join(','));
    var dv = anvil.drawing.doc().views.filter(function (v) { return v.id === det.id; })[0];
    assert(dv.detail.shape === 'profile' && dv.detail.pts.length === 4 && dv.detail.outline === 'full', 'detail data ' + JSON.stringify(dv.detail));
    var wd = rfCQView(det.id);
    assert(wd.proj.circles.visible.length === 1 && wd.proj.lines.visible.length === 0, 'only the hole inside: ' + wd.proj.circles.visible.length + ' circles, ' + wd.proj.lines.visible.length + ' lines');
    var prims = UI.drawing.state.sheet.prims;
    assert(prims.filter(function (p) { return p.detailMark === det.id && p.k === 'line'; }).length === 4, 'the diamond on the parent');
    assert(prims.filter(function (p) { return p.detailOutline === det.id; }).length === 4, 'Full outline round the detail');
    assert(rfCQLayerTexts(det.id).indexOf('DETAIL ' + det.label) >= 0, 'DETAIL label ' + rfCQLayerTexts(det.id).join(' | '));
    assert(!anvil.drawing.sketch.list(top.id).some(function (e) { return e.t === 'line'; }), 'the profile became the detail\'s (its sketch lines went)');
    var dxf = anvil.drawing.dxf({ version: 'R2000' });
    assert(dxf.indexOf('DETAIL ' + det.label) > 0, 'DXF');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'detail ' + det.label + ': 1 circle, 4-sided profile';
  });
