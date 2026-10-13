  // --- rfCA ---
  // (2026-10-13, lane CA) what lane BX's shop drawing of the 16 ga bracket left open: Ctrl+Z with a drawing
  // PropertyManager open undid the step before it under the open PM (the part side cancels the command first);
  // a Smart Dimension placed by a click between the extension lines had its text thrown past the far arrow; a bend
  // note longer than its bend line ran past the flat blank; hidden lines shorter than one dash drew as solid ticks.
  // (BX_BRACKET, rfBXdrawing, rfBXtexts, rfBXtext, rfBXclick: rfBX.js)
  function caCtrl(k, target) {
    var ev = new W.KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
    (target || D.body).dispatchEvent(ev);
    return ev;
  }
  async function caSettle() { await idle(); await UI.drawing.ready(); await wait(60); }
  function caDims() { return anvil.drawing.summary().dims; }
  function caClickText(t) { var p = rfBXtexts().filter(function (x) { return x.text === t; })[0]; assert(p, 'text ' + t); var r = W.Drawing.textRect(p); rfBXclick([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]); }
  function caType(inp, text) { inp.focus(); inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true })); }
  step('rfCA: Ctrl+Z with a drawing PM open cancels it first (as the part side) — the Dimension PM\'s typed text goes and leaves no undo step, Smart Dimension\'s PM ends the tool and keeps the dimension, the next Ctrl+Z undoes; Ctrl+Z in a box with typed text is the box\'s own', async function () {
    await rfBXdrawing();
    var U = UI.App.undo;
    // the Dimension PM of a click: type, Ctrl+Z in the box with the text still pending is the box's (the PM stays)
    caClickText('6.240'); await wait(30);
    assert(UI.hasPM() && UI.pmSpec().command === 'dimension', 'Dimension PM');
    var n0 = U.length, ti = pmField('Text');
    caType(ti, '<DIM> REF'); await wait(30);
    assert(caDims().indexOf('6.240 REF') >= 0 && U.length === n0 + 1, 'live: ' + caDims().join(' ') + ' undo ' + U.length);
    caCtrl('z', ti); await wait(30);
    assert(UI.hasPM(), 'Ctrl+Z over typed text: the box\'s own undo, the PM stays');
    pressEnter(ti); await wait(30);   // committed: nothing pending now
    var ti2 = pmField('Text') || ti;
    caCtrl('z', ti2); await caSettle();
    var d1 = caDims();
    assert(!UI.hasPM() && d1.indexOf('6.240') >= 0 && d1.indexOf('6.240 REF') < 0, 'first Ctrl+Z cancels: ' + d1.join(' '));
    assert(/Dimension cancelled/.test(statusText()), 'status ' + statusText());
    assert(U.length === n0, 'the cancelled PM leaves no undo step: ' + U.length + ' vs ' + n0);
    // Smart Dimension: a Ø on the big hole of the Top view; its PM open, Ctrl+Z ends the tool and keeps the dimension
    var H = anvil.drawing.summary().sheet.size[1], T = dwView('Top');
    var circ = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="TOP"] circle'), function (c) { return [+c.getAttribute('cx'), H - c.getAttribute('cy'), +c.getAttribute('r')]; }).sort(function (a, b) { return b[2] - a[2]; });
    assert(circ.length, 'holes on Top');
    var nd = caDims().length;
    ribbonButton('Smart Dimension').click();
    assert(UI.drawing.state.tool === 'dim', 'Smart Dimension on');
    rfBXclick([circ[0][0] + circ[0][2], circ[0][1]]); await wait(30);
    rfBXclick([circ[0][0] + circ[0][2] + 0.6, circ[0][1] + 0.5]); await wait(30);
    assert(caDims().length === nd + 1 && UI.hasPM() && UI.pmSpec().command === 'dimension', 'placed, PM open: ' + caDims().join(' '));
    var nu = U.length;
    caCtrl('z'); await caSettle();
    assert(!UI.hasPM() && UI.drawing.state.tool !== 'dim' && caDims().length === nd + 1 && U.length === nu, 'first Ctrl+Z: PM and tool gone, the dimension stays (' + caDims().length + ', tool ' + UI.drawing.state.tool + ')');
    caCtrl('z'); await caSettle();
    assert(caDims().length === nd, 'second Ctrl+Z undoes the placement: ' + caDims().length);
    caCtrl('y'); await caSettle();
    assert(caDims().length === nd + 1, 'Ctrl+Y puts it back: ' + caDims().length);
    // Edit ▸ Undo (UI.undoCommand) with a PM open: the same; and the menu's Undo is live with a PM open
    caClickText('6.240'); await wait(30);
    assert(UI.hasPM() && UI.undoCancelsPM(), 'undoCancelsPM with the PM open');
    var nb = U.length;
    await UI.undoCommand(); await caSettle();
    assert(!UI.hasPM() && U.length === nb && caDims().length === nd + 1, 'Edit ▸ Undo cancels the PM only');
    return 'PM cancelled, then undo / redo';
  });
  step('rfCA: undo / redo in a drawing with Ctrl+Z / Ctrl+Y — a view moved, a dimension edited in its PM and deleted, a note edited, the sheet scale changed', async function () {
    await rfBXdrawing();
    // a view moved (dragged)
    var T0 = dwView('Top'), c = [T0.box[0] + 0.4 * (T0.box[2] - T0.box[0]), T0.box[1] + 0.5 * (T0.box[3] - T0.box[1])];
    sheetMouse('mousemove', c);
    sheetMouse('mousedown', c);
    var to = paperToClient([c[0], c[1] + 0.6]);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    await wait(60);
    var y1 = dwView('Top').y;
    assert(y1 > T0.y + 0.3, 'moved ' + T0.y + ' -> ' + y1);
    caCtrl('z'); await caSettle();
    near(dwView('Top').y, T0.y, 1e-6, 'undo: the view back');
    caCtrl('y'); await caSettle();
    near(dwView('Top').y, y1, 1e-6, 'redo: moved again');
    // a dimension's text edited in its PM (two Enters), undone and redone
    caClickText('6.240'); await wait(30);
    var ti = pmField('Text'); caType(ti, '<DIM> REF'); pressEnter(ti); await wait(30); pressEnter(pmField('Text') || ti); await wait(30);
    assert(!UI.hasPM() && caDims().indexOf('6.240 REF') >= 0, 'edited ' + caDims().join(' '));
    caCtrl('z'); await caSettle();
    assert(caDims().indexOf('6.240') >= 0 && caDims().indexOf('6.240 REF') < 0, 'undo edit: ' + caDims().join(' '));
    caCtrl('y'); await caSettle();
    assert(caDims().indexOf('6.240 REF') >= 0, 'redo edit: ' + caDims().join(' '));
    // the dimension deleted (clicked, Delete)
    caClickText('6.240 REF'); await wait(30);
    key('Delete'); await wait(60);
    assert(caDims().indexOf('6.240 REF') < 0, 'deleted ' + caDims().join(' '));
    caCtrl('z'); await caSettle();
    assert(caDims().indexOf('6.240 REF') >= 0, 'undo delete: ' + caDims().join(' '));
    caCtrl('y'); await caSettle();
    assert(caDims().indexOf('6.240 REF') < 0, 'redo delete: ' + caDims().join(' '));
    // a note edited
    var s = anvil.drawing.note({ p: [1, 1.2], text: 'DEBURR' }), id = s.notes[s.notes.length - 1].id;
    anvil.drawing.editNote(id, { text: 'DEBURR ALL EDGES' });
    function noteText() { var n = anvil.drawing.notes().filter(function (x) { return x.id === id; })[0]; return n ? n.text : null; }
    assert(noteText() === 'DEBURR ALL EDGES', 'note ' + noteText());
    caCtrl('z'); await caSettle();
    assert(noteText() === 'DEBURR', 'undo note edit: ' + noteText());
    caCtrl('y'); await caSettle();
    assert(noteText() === 'DEBURR ALL EDGES', 'redo note edit: ' + noteText());
    // Sheet Properties: the scale
    var sc0 = anvil.drawing.summary().sheet.scale, sc1 = sc0 === '1:1' ? '1:2' : '1:1';
    anvil.drawing.setSheet({ scale: sc1 }); await caSettle();
    assert(anvil.drawing.summary().sheet.scale === sc1, 'scale ' + anvil.drawing.summary().sheet.scale);
    caCtrl('z'); await caSettle();
    assert(anvil.drawing.summary().sheet.scale === sc0, 'undo scale: ' + anvil.drawing.summary().sheet.scale);
    caCtrl('y'); await caSettle();
    assert(anvil.drawing.summary().sheet.scale === sc1, 'redo scale: ' + anvil.drawing.summary().sheet.scale);
    assert(UI.drawingActive(), 'still in the drawing');
    return 'view, dimension edit / delete, note, scale';
  });
  // the newest dimension added by hand to a view (sheet record: tbox, arrows) and its extension lines' span along x
  function caLastDim(viewId) { var l = UI.drawing.state.sheet.dims.filter(function (d) { return d.view === viewId && !d.auto; }); return l[l.length - 1]; }
  function caSpan(d) { var xs = d.arrows.map(function (q) { return q[0]; }); return [Math.min.apply(null, xs), Math.max.apply(null, xs)]; }
  step('rfCA: Smart Dimension hole-to-edge at 1:2 placed by a click between the extension lines keeps its text between them (arrows outside when they do not fit); a click outside puts it outside on that side; a dimension too small for its text still puts it past the far arrow', async function () {
    await rfBXdrawing();
    anvil.drawing.setSheet({ scale: '1:2' }); await caSettle();
    var H = anvil.drawing.summary().sheet.size[1], T = dwView('Top');
    var circ = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="TOP"] circle'), function (c) { return [+c.getAttribute('cx'), H - c.getAttribute('cy'), +c.getAttribute('r')]; }).sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var hc = circ[0], ey = (T.box[1] + T.box[3]) / 2;
    function place(at) {
      ribbonButton('Smart Dimension').click();
      rfBXclick([hc[0], hc[1]]); rfBXclick([T.box[0], ey]); rfBXclick(at);
      var d = caLastDim(T.id);
      UI.pmCancel(); if (UI.drawing.state.tool === 'dim') key('Escape');
      return d;
    }
    // between the extension lines, above the view
    var d1 = place([(T.box[0] + hc[0]) / 2, T.box[3] + 0.35]); await caSettle();
    d1 = caLastDim(T.id);
    assert(d1 && d1.kind === 'h' && /^1\.\d{3}$/.test(d1.text), 'hole-to-edge dimension ' + (d1 && d1.kind + ' ' + d1.text));
    var sp = caSpan(d1), tc = (d1.tbox.x0 + d1.tbox.x1) / 2;
    assert(d1.tbox.x0 >= sp[0] - 1e-6 && d1.tbox.x1 <= sp[1] + 1e-6, d1.text + ': text between the extension lines ' + JSON.stringify([d1.tbox.x0, d1.tbox.x1, sp]));
    near(tc, (sp[0] + sp[1]) / 2, 1e-6, 'text centred');
    // outside, left of the left extension line (below the view)
    place([T.box[0] - 0.6, T.box[1] - 0.35]); await caSettle();
    var d2 = caLastDim(T.id), sp2 = caSpan(d2);
    assert(d2 !== d1 && d2.tbox.x1 <= sp2[0] + 1e-6, 'click outside on the left: text left of the arrows ' + JSON.stringify([d2.tbox.x0, d2.tbox.x1, sp2]));
    // a .100 between two points (.05 on paper): the text does not fit between them, beyond the far arrow
    var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === T.id; })[0], m0 = w.fromSheet([T.box[0] + 1, ey]);
    var r = anvil.drawing.smartDim(T.id, { point: m0 }, { point: [m0[0] + 0.1, m0[1]] }, [m0[0] + 0.05, m0[1] + 0.5]); await caSettle();
    var d3 = caLastDim(T.id), sp3 = caSpan(d3);
    assert(r && r.text === '.100' && d3.tbox.x0 >= sp3[1], '.100: text past the far arrow ' + JSON.stringify([r && r.text, d3.tbox.x0, sp3]));
    return d1.text + ' inside at ' + fmt(tc) + '; ' + d2.text + ' left; .100 beyond';
  });
  // the flat blank's outline box on the sheet, and its bend notes' text rectangles
  function caFlat() {
    var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.kind === 'flat'; })[0], fd = w.content.flat, bb = fd.bbox;
    var p0 = w.toSheet([bb.umin, bb.vmin]), p1 = w.toSheet([bb.umax, bb.vmax]);
    var blank = { x0: Math.min(p0[0], p1[0]), y0: Math.min(p0[1], p1[1]), x1: Math.max(p0[0], p1[0]), y1: Math.max(p0[1], p1[1]) };
    var notes = UI.drawing.state.sheet.prims.filter(function (x) { return x.k === 'text' && x.layer === 'BEND_NOTES'; }).map(function (x) {
      // (its turned rectangle: Drawing.textRect takes turned text as centred)
      var wd = W.Drawing._.textWidth(x.text, x.h), a = (x.rot || 0) * Math.PI / 180, t = [Math.cos(a), Math.sin(a)], n = [-t[1], t[0]], s0 = x.anchor === 'middle' ? -wd / 2 : x.anchor === 'end' ? -wd : 0;
      var r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, text: x.text };
      [[s0, 0], [s0 + wd, 0], [s0, x.h], [s0 + wd, x.h]].forEach(function (q) { var px = x.p[0] + t[0] * q[0] + n[0] * q[1], py = x.p[1] + t[1] * q[0] + n[1] * q[1]; r.x0 = Math.min(r.x0, px); r.x1 = Math.max(r.x1, px); r.y0 = Math.min(r.y0, py); r.y1 = Math.max(r.y1, py); });
      return r;
    });
    return { blank: blank, notes: notes };
  }
  function caInside(r, b) { return r.x0 >= b.x0 - 1e-6 && r.x1 <= b.x1 + 1e-6 && r.y0 >= b.y0 - 1e-6 && r.y1 <= b.y1 + 1e-6; }
  function caApart(r, b) { return r.x0 >= b.x1 - 1e-6 || r.x1 <= b.x0 + 1e-6 || r.y0 >= b.y1 - 1e-6 || r.y1 <= b.y0 + 1e-6; }
  step('rfCA: flat pattern of a 1.2 in wide 16 ga bracket — a bend note longer than its bend line goes on two lines inside the blank (1:1), or runs on outside it from the line\'s end (1:4); never across the outline', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.name("Strap").units("in");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -1.2, 6, 1.2).end().baseFlange();\n' +
      'p.flange(1.5, [[0, 0.0598, 0.6]]);\np.flange(2, [[6, 0.0598, 0.6]], { reverse: true });'); await idle();
    anvil.drawing.make({ fresh: true }); await caSettle();
    var out = [];
    for (var si = 0; si < 2; si++) {
      var sc = si ? '1:4' : '1:1';
      anvil.drawing.setSheet({ scale: sc }); await caSettle();
      if (!anvil.drawing.summary().views.some(function (v) { return v.kind === 'flat'; })) anvil.drawing.flatView({ x: 3.4, y: 2.2 });
      await caSettle();
      var f = caFlat();
      assert(f.notes.length >= 2, sc + ': bend notes ' + JSON.stringify(f.notes.map(function (r) { return r.text; })));
      f.notes.forEach(function (r) { assert(caInside(r, f.blank) || caApart(r, f.blank), sc + ': "' + r.text + '" across the blank outline ' + JSON.stringify([r, f.blank])); });
      var inside = f.notes.filter(function (r) { return caInside(r, f.blank); }).length;
      if (!si) assert(inside === f.notes.length && f.notes.some(function (r) { return /^R/.test(r.text); }), '1:1: on two lines inside the blank ' + JSON.stringify(f.notes.map(function (r) { return r.text; })));
      else assert(inside === 0 && f.notes.length === 2, '1:4: run on outside the blank ' + JSON.stringify(f.notes.map(function (r) { return r.text; })));
      out.push(sc + ' ' + f.notes.map(function (r) { return r.text; }).join(' / '));
    }
    return out.join('; ');
  });
  step('rfCA: Hidden Lines Visible on the bracket at 1:2 — a hidden line shorter than one dash and gap (the hole walls through .06) draws as one dash centred on it with a gap at both ends, on the sheet, in the SVG and the PDF; longer ones keep the plain pattern', async function () {
    await rfBXdrawing();
    anvil.drawing.setSheet({ scale: '1:2' }); await caSettle();
    var mm = 1 / 25.4, period = 4.5 * mm, nShort = 0, nLong = 0;
    function check(lines, where) {
      lines.forEach(function (l) {
        var len = Math.hypot(l.getAttribute('x2') - l.getAttribute('x1'), l.getAttribute('y2') - l.getAttribute('y1'));
        var da = (l.getAttribute('stroke-dasharray') || '').split(/[ ,]+/).map(Number), off = +(l.getAttribute('stroke-dashoffset') || 0);
        if (len < period - 1e-6) {
          nShort++;
          // one dash, its gap on each side e = (len − dash) / 2 > 0: the phase len − e starts the line in a gap
          var e = (len - da[0]) / 2;
          assert(da.length === 2 && da[0] > 0 && e > 1e-6 && Math.abs(da[1] - 2 * e) < 1e-3 && Math.abs(off - (len - e)) < 1e-3 && l.getAttribute('stroke-linecap') === 'butt',
            where + ': short hidden line ' + fmt(len) + ' dash ' + JSON.stringify(da) + ' offset ' + off + ' cap ' + l.getAttribute('stroke-linecap'));
        } else { nLong++; assert(!l.getAttribute('stroke-dashoffset'), where + ': a long hidden line keeps its pattern'); }
      });
    }
    check(Array.prototype.slice.call(D.querySelectorAll('#drawing-sheet line.hidden')), 'sheet');
    assert(nShort >= 2, 'the hole walls are short hidden lines on the sheet: ' + nShort + ' short, ' + nLong + ' long');
    var doc = new W.DOMParser().parseFromString(anvil.drawing.svg(), 'image/svg+xml');
    var s0 = nShort; check(Array.prototype.slice.call(doc.querySelectorAll('line.hidden')), 'SVG');
    assert(nShort === 2 * s0, 'SVG: as many ' + (nShort - s0) + ' vs ' + s0);
    var pdf = String(anvil.drawing.pdf());
    assert(/0 J \[[\d.]+ [\d.]+\] [\d.]+ d/.test(pdf), 'PDF: a centred dash for the short hidden lines');
    return s0 + ' short hidden lines centred, ' + (nLong / 2) + ' long';
  });
