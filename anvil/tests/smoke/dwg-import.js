  // --- dwg-import: File ▸ Open / Insert DXF / DWG of a .dwg through the local server (POST api/dwg2dxf, mocked here),
  // Tools ▸ Sketch Tools, Paste between unit systems, box selection and hidden layers
  // dwgFetch(handler): replaces the page's fetch for api/dwg2dxf (other URLs go to the real one); handler(body) ->
  // a Response or a rejected promise. Returns the restore function and the bodies seen (calls).
  function dwgFetch(handler) {
    var real = W.fetch, calls = [];
    W.fetch = function (url, opts) {
      if (!/api\/dwg2dxf$/.test(String(url))) return real.apply(W, arguments);
      calls.push({ url: String(url), method: opts && opts.method, body: opts && opts.body });
      return handler(opts && opts.body);
    };
    return { calls: calls, restore: function () { W.fetch = real; } };
  }
  function dwgBytes() { var b = new Uint8Array(64); 'AC1015'.split('').forEach(function (c, i) { b[i] = c.charCodeAt(0); }); return b.buffer; }
  function dwgDxfResponse(text) { return Promise.resolve(new W.Response(new W.TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'application/dxf', 'X-Anvil-Converter': 'libredwg' } })); }
  function dwgToast() { var t = D.querySelector('.toast'); return t ? t.textContent : ''; }
  step('dwg-import: File ▸ Open of a .dwg (UI.openFileData) posts the file to api/dwg2dxf and opens the DXF that comes back as a new part with the DXF/DWG Import PropertyManager (7 entities, a text and, rfAZ, the block instance\'s insertion point); Insert DXF / DWG of a .dwg into an open sketch does the same; the Open dialog lists DWG', async function () {
    need(UI, 'openDWGFile'); need(UI, 'importDWGData'); need(UI, 'dwgToDxf');
    var m = dwgFetch(function () { return dwgDxfResponse(dxiPlateText()); });
    try {
      await UI.openFileData('Bracket-202.dwg', dwgBytes()); await idle();
      var c = m.calls[0], body = c && new Uint8Array(c.body.buffer || c.body);
      assert(m.calls.length === 1 && c.method === 'POST' && body && String.fromCharCode(body[0], body[1], body[2], body[3]) === 'AC10', 'POST of the DWG bytes ' + JSON.stringify(m.calls.map(function (x) { return x.method + ' ' + x.url; })));
      var f = activeSketch();
      assert(UI.App.model.name === 'Bracket-202' && UI.pmTitle() === 'DXF/DWG Import' && f && f.name === 'Sketch1' && f.plane.ref === 'Top', 'opened: ' + UI.App.model.name + ' / ' + UI.pmTitle());
      assert(UI.App.tempEntities.length === 9 && /Bracket-202\.dwg/.test($('pm').textContent), 'preview ' + UI.App.tempEntities.length + ': ' + D.querySelector('#pm .pm-msg').textContent);
      await pmAccept();
      assert(activeSketch().entities.length === 9, 'entities ' + activeSketch().entities.length);
      // Insert DXF / DWG of a .dwg into the open sketch: the PM again, adding to it
      var v = await UI.importDWGData('Etch-3.dwg', dwgBytes(), { dx: 10 }); await idle();
      assert(v && UI.pmTitle() === 'DXF/DWG Import' && m.calls.length === 2, 'insert: ' + UI.pmTitle());
      await pmAccept();
      assert(activeSketch().entities.length === 18 && K.blockInstances(activeSketch()).length === 2 && Object.keys(activeSketch().blocks).join() === 'HOLE', 'inserted (the same HOLE block shared): ' + activeSketch().entities.length + ' ' + JSON.stringify(Object.keys(activeSketch().blocks || {})));
      await UI.exitSketch(true); await idle();
    } finally { m.restore(); }
    UI.fileOpen(); dontSaveIfAsked();
    var sel = D.querySelector('#modal-body select'), inp = D.querySelector('#modal-body input[type=file]');
    var opts = Array.prototype.map.call(sel.options, function (o) { return o.value; });
    assert(opts.indexOf('dwg') >= 0 && /\.dwg/.test(inp.accept), 'Open lists DWG: ' + opts.join() + ' / ' + inp.accept);
    clickModalButton('Cancel');
    return 'Bracket-202.dwg -> 9 entities, + Etch-3.dwg -> 18';
  });
  step('dwg-import: without the local server\'s API (404 page, network error) a .dwg says plainly that DWG needs the local Anvil server, in a toast; no converter (503) names get-libredwg.ps1; a converter error is passed on; a file that is not a DWG is refused before any request', async function () {
    var NO = 'DWG needs the local Anvil server; save the file as DXF or run Anvil from the desktop shortcut.';
    await anvil.newPart(); await idle();
    var m = dwgFetch(function () { return Promise.resolve(new W.Response('<html>404</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })); });
    try {
      var v = await UI.importDWGData('x.dwg', dwgBytes()); await idle();
      assert(v === null && dwgToast() === NO && !UI.pmTitle(), 'toast: ' + dwgToast());
      var err = null;
      try { await UI.openFileData('x.dwg', dwgBytes()); } catch (e) { err = e; }
      assert(err && err.message === NO && err.noServer, 'File ▸ Open rejects: ' + (err && err.message));
      m.restore();
      // a static host answering every path with its page (200, HTML) is no converter either
      m = dwgFetch(function () { return Promise.resolve(new W.Response('<!doctype html><title>Anvil</title>', { status: 200, headers: { 'Content-Type': 'text/html' } })); });
      err = null; try { await UI.dwgToDxf('x.dwg', dwgBytes()); } catch (e) { err = e; }
      assert(err && err.noServer, 'HTML page: ' + (err && err.message));
      m.restore();
      m = dwgFetch(function () { return Promise.reject(new TypeError('Failed to fetch')); });
      err = null; try { await UI.dwgToDxf('x.dwg', dwgBytes()); } catch (e) { err = e; }
      assert(err && err.message === NO, 'network error: ' + (err && err.message));
      m.restore();
      m = dwgFetch(function () { return Promise.resolve(new W.Response(JSON.stringify({ error: 'No DWG to DXF converter on this server' }), { status: 503, headers: { 'Content-Type': 'application/json' } })); });
      await UI.importDWGData('x.dwg', dwgBytes()); await idle();
      assert(/get-libredwg\.ps1/.test(dwgToast()) && /ODA File Converter/.test(dwgToast()), '503: ' + dwgToast());
      m.restore();
      m = dwgFetch(function () { return Promise.resolve(new W.Response(JSON.stringify({ error: 'ERROR 0x800 bad header', converter: 'libredwg' }), { status: 400, headers: { 'Content-Type': 'application/json' } })); });
      await UI.importDWGData('x.dwg', dwgBytes()); await idle();
      assert(/Could not convert x\.dwg: ERROR 0x800 bad header/.test(dwgToast()), '400: ' + dwgToast());
      var n = m.calls.length;
      err = null; try { await UI.dwgToDxf('notes.dwg', new W.TextEncoder().encode('hello').buffer); } catch (e) { err = e; }
      assert(err && /notes\.dwg is not a DWG file/.test(err.message) && m.calls.length === n, 'not a DWG: ' + (err && err.message));
    } finally { m.restore(); }
    return dwgToast();
  });
  step('dwg-import: Tools ▸ Sketch Tools has Check Sketch for Feature, Repair Sketch and Insert DXF / DWG (greyed outside a sketch except Insert); Check Sketch opens from it; File menu and the Sketch tab say DXF / DWG', async function () {
    await anvil.newPart(); await idle();
    lyrMenu('Tools');
    var ck = lyrMenuRow(/^Sketch Tools ▸ Check Sketch for Feature/), rp = lyrMenuRow(/^Sketch Tools ▸ Repair Sketch/), ins = lyrMenuRow(/^Sketch Tools ▸ Insert DXF \/ DWG/);
    assert(ck && rp && ins, 'three Sketch Tools rows');
    assert(ck.classList.contains('disabled') && rp.classList.contains('disabled') && !ins.classList.contains('disabled'), 'greyed outside a sketch: ' + [ck.className, rp.className, ins.className].join(' / '));
    UI.closeMenus();
    lyrMenu('File'); assert(lyrMenuRow(/^Import DXF \/ DWG into Sketch/), 'File ▸ Import DXF / DWG into Sketch…'); UI.closeMenus();
    await UI.newSketchOnPlane('Front'); await idle();
    activeSketch().entities.push({ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0.0002, x2: 10, y2: 10 });
    UI.updateSketches();
    lyrMenu('Tools'); lyrMenuRow(/^Sketch Tools ▸ Check Sketch for Feature/).click(); await idle();
    assert(UI.pmTitle() === 'Check Sketch for Feature', 'PM ' + UI.pmTitle());
    UI.pmCancel();
    lyrMenu('Tools'); lyrMenuRow(/^Sketch Tools ▸ Repair Sketch/).click(); await idle();
    assert(UI.pmTitle() === 'Repair Sketch', 'PM ' + UI.pmTitle());
    UI.pmCancel();
    UI.setRibbonTab('Sketch');
    assert(/Insert DXF \/ DWG/.test($('ribbon-buttons').textContent.replace(/\s+/g, ' ')), 'ribbon label');
    UI.setRibbonTab('Features');
    await UI.exitSketch(true); await idle();
    return 'Tools ▸ Sketch Tools ▸ 3 entries';
  });
  step('dwg-import: Paste between unit systems — a dimensioned 1 in slot, a Ø0.25 in circle 2 in away (driving distance) and a 30° angle copied in an inch part paste into a mm part at 25.4 mm, 6.35 mm, 50.8 mm (dimensions and distance scaled, the angle kept), the status says the scale; back into an inch part the sizes are as copied', async function () {
    try { W.localStorage.removeItem('anvil.sketchClipboard'); } catch (e) { }
    var code = 'p.units("in"); p.sketch("Front", 0, "S1").slot(0, 0, 1, 0, 0.25).circle(2, 0, 0.125).line(0, 1, 1, 1).line(0, 1, ' + Math.cos(Math.PI / 6) + ', ' + (1 + Math.sin(Math.PI / 6)) + ')' +
      '.dim(0, "len", { value: 1 }).dim(0, "w").dim(1, "dia").rel("distance", ["0.p1", "1.c"], 2).rel("angle", ["2", "3"], 30);';
    var f1 = await lyrPart(code, 'S1');
    assert(UI.App.model.units === 'in', 'inch part');
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; }));
    var cp = UI.sketchCopy();
    assert(cp && cp.entities === 4 && cp.dims === 3 && cp.rels >= 2 && UI.sketchClipboard().units === 'in', 'copied ' + JSON.stringify(cp));
    await UI.exitSketch(true); await idle();
    var f2 = await lyrPart('p.units("mm"); p.sketch("Front", 0, "S2").point(-30, -30);', 'S2');
    assert(UI.App.model.units !== 'in', 'mm part');
    var r = UI.sketchPaste([0, 0]); await idle();
    var E = f2.entities.slice(1), s = E[0], c = E[1];
    assert(r && r.count === 4 && Math.abs(r.scale - 25.4) < 1e-12, 'paste ' + JSON.stringify(r));
    near(Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 25.4, 1e-9, 'slot length'); near(s.w, 6.35, 1e-9, 'slot width'); near(c.r, 3.175, 1e-9, 'circle radius');
    near(Math.hypot(c.cx - s.x1, c.cy - s.y1), 50.8, 1e-9, 'slot end to circle centre');
    var dv = (f2.dims || []).map(function (d) { return K.dimValue(f2.entities[d.e], d); }).sort(function (a, b) { return a - b; });
    assert(dv.length === 3, 'dims ' + JSON.stringify(f2.dims)); near(dv[0], 6.35, 1e-9, 'width dim'); near(dv[1], 6.35, 1e-9, 'Ø dim'); near(dv[2], 25.4, 1e-9, 'length dim');
    var dist = (f2.rels || []).filter(function (x) { return x.type === 'distance'; })[0], ang = (f2.rels || []).filter(function (x) { return x.type === 'angle'; })[0];
    assert(dist && Math.abs(dist.v - 50.8) < 1e-9 && ang && Math.abs(ang.v - 30) < 1e-9, 'distance / angle ' + JSON.stringify(f2.rels));
    assert(/Pasted 4 entities \(scaled × 25\.4: inches to millimeters\)/.test($('status-msg').textContent), 'status: ' + $('status-msg').textContent);
    assert(UI.sketchStatus().dims.every(function (x) { return x === 'ok'; }), 'dims ok ' + JSON.stringify(UI.sketchStatus()));
    // the same copy into another inch part: unscaled
    await UI.exitSketch(true); await idle();
    var f3 = await lyrPart('p.units("in"); p.sketch("Front", 0, "S3").point(-3, -3);', 'S3');
    r = UI.sketchPaste([0, 0]); await idle();
    var s3 = f3.entities[1];
    assert(r && r.scale === 1 && Math.abs(Math.hypot(s3.x2 - s3.x1, s3.y2 - s3.y1) - 1) < 1e-9 && !/scaled/.test($('status-msg').textContent), 'inch to inch ' + JSON.stringify(s3) + ' ' + $('status-msg').textContent);
    await UI.exitSketch(true); await idle();
    return 'slot 25.4 × 6.35 mm, distance 50.8, angle 30°';
  });
  step('dwg-import: box selection skips entities on a hidden sketch layer (window and crossing boxes); shown again, the same box takes them', async function () {
    var f = await lyrPart('p.sketch("Front", 0, "BoxL").rect(0, 0, 40, 20).circle(20, 10, 5).line(50, 0, 60, 10);', 'BoxL');
    f.layers = [{ name: 'ETCH', hidden: true }];
    f.entities[1].layer = 'ETCH'; f.entities[2].layer = 'ETCH';
    UI.updateSketches();
    function boxed(a, b) { anvil.boxSelect(rskScr(a), rskScr(b)); return anvil.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort().join(); }
    var win = boxed([-5, -5], [65, 25]);
    assert(win === '0', 'window box with ETCH hidden: ' + win);
    var crs = boxed([45, 25], [15, 5]);   // right to left: crossing, over the rectangle, the circle and the line
    assert(crs === '0', 'crossing box with ETCH hidden: ' + crs);
    f.layers[0].hidden = false; UI.updateSketches();
    win = boxed([-5, -5], [65, 25]);
    assert(win === '0,1,2', 'window box with ETCH shown: ' + win);
    UI.setSelection([]);
    await UI.exitSketch(true); await idle();
    return 'hidden: ' + '0' + ', shown: ' + win;
  });
  // --- end dwg-import ---
