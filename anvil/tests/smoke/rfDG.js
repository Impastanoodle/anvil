  // ---- rfDG (lane DG, 2026-10-26): Save as DWG with no server — dwg-writer.js writes the AutoCAD 2000 DWG in the page.
  // api/dxf2dwg is made unreachable (fetch rejects, as on the published copy) and every DWG save still downloads a valid
  // AC1015 file: File ▸ Save As DWG of a sheet-metal part (its flat), the DXF/DWG Output PM's DWG choice, and Save
  // Drawing as DWG. A valid file: "AC1015", the file header CRC, the header / classes sentinels.
  function rfDGValid(buf) {
    var b = new W.Uint8Array(buf), tag = String.fromCharCode.apply(null, Array.prototype.slice.call(b, 0, 6));
    if (tag !== 'AC1015') return 'tag ' + tag;
    var n = b[21] | (b[22] << 8), end = 25 + n * 9, crc = W.DWG.crc16(b, 0, 0, end) ^ { 3: 0xA598, 4: 0x8101, 5: 0x3CC4, 6: 0x8461 }[n];
    if ((b[end] | (b[end + 1] << 8)) !== crc) return 'file header CRC';
    var hdrAt = b[26] | (b[27] << 8) | (b[28] << 16) | (b[29] << 24);
    if (W.DWG.SENTINELS.headerBegin.some(function (x, i) { return b[hdrAt + i] !== x; })) return 'header sentinel';
    return null;
  }
  function rfDGNoServer() {
    var real = W.fetch, calls = [];
    W.fetch = function (url) { calls.push(String(url)); return Promise.reject(new TypeError('Failed to fetch')); };
    return { calls: calls, restore: function () { W.fetch = real; } };
  }
  step('rfDG: Save As DWG of a sheet-metal part with no server — dwg-writer.js writes a valid AutoCAD 2000 DWG of the flat, api/dxf2dwg never asked; the DXF/DWG Output PM offers DWG (not greyed) and saves one too', async function () {
    var errs0 = errors.length;
    assert(W.DWG && typeof W.DWG.fromDXF === 'function', 'dwg-writer.js loaded');
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in"); p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -6, 10, 6).circle(5, -3, 0.5).end().baseFlange(0.0598);'); await idle();
    var ns = rfDGNoServer(), saved = [], baseDl = UI.download, toasts = [], baseToast = UI.toast;
    UI.download = function (n, data, mime) { saved.push({ n: n, data: data, mime: mime }); };
    UI.toast = function (m) { toasts.push(m); };
    try {
      assert(await UI.dwgConverter() === 'anvil', 'converter is Anvil\'s own writer');
      var r = await anvil.saveAs('dwg', 'rfdg_flat', { export: 'sheet' });
      assert(r && r.name === 'rfdg_flat.dwg' && r.mime === 'application/acad', 'saved ' + JSON.stringify(r && r.name));
      var bad = rfDGValid(r.data);
      assert(!bad, 'valid DWG: ' + bad);
      // the DXF/DWG Output PM: DWG enabled, ✓ saves through the same writer
      UI.cmdDxfOutput({ format: 'dwg', name: 'rfdg_pm' }); await idle(); await wait(30);
      var dwg = D.querySelector('#pm input[data-key="format:dwg"]');
      assert(dwg && !dwg.disabled, 'DWG choice live with no server');
      saved.length = 0;
      UI.pmOK(); await idle(); await wait(60);
      assert(saved.length === 1 && /\.dwg$/.test(saved[0].n) && !rfDGValid(saved[0].data), 'PM saved a valid .dwg: ' + JSON.stringify(saved.map(function (s) { return s.n; })) + ' ' + toasts.join(' | '));
      assert(!ns.calls.some(function (u) { return /dxf2dwg/.test(u); }), 'no request to api/dxf2dwg: ' + ns.calls.join(', '));
    } finally { ns.restore(); UI.download = baseDl; UI.toast = baseToast; if (UI.hasPM() && UI.pmCancel) UI.pmCancel(); }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return (saved[0].data.byteLength / 1024).toFixed(1) + ' KB';
  });
  step('rfDG: Save Drawing as DWG with no server — the sheet\'s R2000 DXF becomes a valid AC1015 DWG in the page (views, dimensions, notes, title block); no request to api/dxf2dwg', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").rect(0, 0, 100, 60).circle(30, 30, 6).end().extrude(10);'); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
    var ns = rfDGNoServer(), saved = [], baseDl = UI.download;
    UI.download = function (n, data, mime) { saved.push({ n: n, data: data, mime: mime }); };
    try {
      var r = await anvil.drawing.dwg();
      assert(r && /\.dwg$/.test(r.name) && saved.length === 1 && saved[0].mime === 'application/acad', 'saved ' + JSON.stringify(saved.map(function (s) { return s.n; })));
      var bad = rfDGValid(saved[0].data);
      assert(!bad, 'valid DWG: ' + bad);
      assert(!ns.calls.some(function (u) { return /dxf2dwg/.test(u); }), 'no request to api/dxf2dwg');
    } finally { ns.restore(); UI.download = baseDl; }
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return (saved[0].data.byteLength / 1024).toFixed(1) + ' KB';
  });
  // --- end rfDG ---
