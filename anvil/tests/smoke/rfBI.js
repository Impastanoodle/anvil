  // ---- rfBI (lane BI, 2026-10-13): the drawing document in the SolidWorks 2024 look — sheet tabs with the four scroll
  // arrows, the status bar's Editing Sheet1 | scale | units, a view's frame orange under the pointer and blue when
  // selected, a dimension coloured in place (blue selected, orange pre-selected), exports unchanged by any of it
  function rfBIPt(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function rfBIMouse(type, p) {
    var c = rfBIPt(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: c.clientX, clientY: c.clientY }));
  }
  function rfBIStroke(n) { return W.getComputedStyle(n).stroke; }
  step('rfBI: SolidWorks 2024 drawing chrome — sheet tabs with first / previous / next / last arrows, status bar Editing Sheet1 | 1 : 1 | IPS, the view frame orange on hover and blue when selected, a selected dimension blue in place; SVG and DXF byte-identical', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("Plate").units("in");\np.sketch("Front").rect(0, 0, 6, 3).extrude(0.25);'); await idle();
    if (anvil.occtIdle) await anvil.occtIdle();   // (rfHO) the files before and after are compared: both from the solid that stays (OpenCascade's lists the same lines in another order)
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
    var svg0 = anvil.drawing.svg(), dxf0 = anvil.drawing.dxf({ version: 'R2000' }), dxf12 = anvil.drawing.dxf({ version: 'R12' });
    // the status bar: the drawing's items in place of the part's
    var st = $('dw-status');
    assert(st && W.getComputedStyle(st).display !== 'none' && W.getComputedStyle($('status-right')).display === 'none', 'drawing status shown, part status hidden');
    assert(st.querySelector('.dw-st-mode').textContent === 'Editing Sheet1' && st.querySelector('.dw-st-units').textContent === 'IPS' && /^\d+ : \d+$/.test(st.querySelector('.dw-st-scale').textContent), 'status: ' + st.textContent);
    // the sheet tabs: four scroll arrows, all off with one sheet
    var navs = D.querySelectorAll('#drawing-tabs .dw-tab-nav .dw-nav');
    assert(navs.length === 4 && Array.prototype.every.call(navs, function (b) { return b.disabled; }), 'four arrows, all disabled with one sheet');
    D.querySelector('#drawing-tabs .dw-add-sheet').click(); await idle(); await wait(30);
    assert(anvil.drawing.summary().sheet.index === 1 && st.querySelector('.dw-st-mode').textContent === 'Editing Sheet2', 'Sheet2 active: ' + st.textContent);
    navs = D.querySelectorAll('#drawing-tabs .dw-tab-nav .dw-nav');
    assert(!navs[0].disabled && !navs[1].disabled && navs[2].disabled && navs[3].disabled, 'first / previous on, next / last off on the last sheet');
    navs[0].click(); await idle(); await UI.drawing.ready(); await wait(30);
    assert(anvil.drawing.summary().sheet.index === 0 && D.querySelector('#drawing-tabs .dw-sheet-tab.active').textContent === 'Sheet1', 'First sheet arrow goes to Sheet1');
    anvil.drawing.deleteSheet(1); await idle(); await UI.drawing.ready(); await wait(30);
    assert(D.querySelectorAll('#drawing-tabs .dw-sheet-tab').length === 1, 'back to one sheet');
    // a view's frame: orange (pre-selection) under the pointer, dark amber once selected (rfBU: was blue)
    var S = UI.drawing.state.sheet, w = S.views[0], c = [(w.box.x0 + w.box.x1) / 2, (w.box.y0 + w.box.y1) / 2];
    rfBIMouse('mousemove', c); await wait(30);
    var pre = D.querySelector('#dw-overlay .dw-vbox.pre');
    assert(pre && rfBIStroke(pre) === 'rgb(255, 127, 0)', 'hover frame orange: ' + (pre && rfBIStroke(pre)));
    rfBIMouse('mousedown', c); rfBIMouse('mouseup', c); await idle(); await wait(30);
    var sel = D.querySelector('#dw-overlay .dw-vbox.sel');
    assert(sel && rfBIStroke(sel) === 'rgb(207, 149, 0)', 'selected frame amber: ' + (sel && rfBIStroke(sel)));
    // a dimension: selected, it turns amber itself (its text and lines), no frame; the others stay black
    S = UI.drawing.state.sheet;
    var d = S.dims.filter(function (x) { return x.box && isFinite(x.box.x0); })[0];
    assert(d, 'a dimension on the sheet');
    var dc = [(d.box.x0 + d.box.x1) / 2, (d.box.y0 + d.box.y1) / 2];
    rfBIMouse('mousemove', dc); rfBIMouse('mousedown', dc); rfBIMouse('mouseup', dc); await idle(); await wait(30);
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'dim', 'dimension selected: ' + JSON.stringify(UI.drawing.state.sel));
    var tinted = D.querySelectorAll('#drawing-sheet g[data-layer="DIMENSIONS"] [data-tint="sel"]');
    var txt = Array.prototype.filter.call(tinted, function (n) { return n.tagName === 'text'; })[0];
    assert(tinted.length >= 3 && txt && W.getComputedStyle(txt).fill === 'rgb(207, 149, 0)', 'dimension amber in place: ' + tinted.length);
    assert(!D.querySelector('#dw-overlay .dw-dbox'), 'no frame round a dimension coloured in place');
    var black = Array.prototype.filter.call(D.querySelectorAll('#drawing-sheet g[data-layer="DIMENSIONS"] text'), function (n) { return !n.hasAttribute('data-tint'); });
    assert(black.length && black.every(function (n) { return W.getComputedStyle(n).fill === 'rgb(0, 0, 0)'; }), 'the other dimensions stay black');
    // none of it reaches the files
    var svg1 = anvil.drawing.svg();
    assert(svg1 === svg0 && svg1.indexOf('data-tint') < 0 && svg1.indexOf('dw-overlay') < 0, 'SVG byte-identical');
    assert(anvil.drawing.dxf({ version: 'R2000' }) === dxf0 && anvil.drawing.dxf({ version: 'R12' }) === dxf12, 'DXF byte-identical');
    W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
    anvil.drawing.close(); await idle();
    assert(W.getComputedStyle($('status-right')).display !== 'none' && W.getComputedStyle($('dw-status')).display === 'none', 'part status back after the drawing closes');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
  // --- end rfBI ---
