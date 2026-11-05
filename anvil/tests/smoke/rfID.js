  // --- rfID (2026-11-05, lane dropfiles) --- drag and drop files onto Anvil (user: "add the ability to drag and drop
  // any acceptable file in anvil"). Real DragEvents carrying a DataTransfer of File objects: a file File ▸ Open takes,
  // dropped anywhere on the window, opens exactly as File ▸ Open would (part JSON, STEP, DXF); the overlay shows while
  // dragging and is gone after; a type Anvil cannot open is refused with a toast and nothing changes; "Save changes?"
  // first when the part is dirty; several files: the first one opens and a toast says why; the Open dialog's own drop
  // zone still wins; in the Windows app (stand-in bridge) the dropped file keeps its path and Ctrl+S writes back to it;
  // the page never navigates.
  function rfIDFile(name, text, type) { return new W.File([text], name, { type: type || '' }); }
  function rfIDEvent(target, type, files) {
    var dt = new W.DataTransfer();
    files.forEach(function (f) { dt.items.add(f); });
    var r = target.getBoundingClientRect();
    var ev = new W.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    return { delivered: target.dispatchEvent(ev), ev: ev };
  }
  function rfIDOverlay() {
    var o = D.getElementById('drop-overlay');
    return o && !o.hidden && W.getComputedStyle(o).display !== 'none' ? { text: o.querySelector('.drop-text').textContent, sub: o.querySelector('.drop-sub').textContent, bad: o.classList.contains('bad') } : null;
  }
  function rfIDToast() { var t = D.querySelector('.toast'); return t ? t.textContent : ''; }
  function rfIDModal() { var m = D.getElementById('modal'), t = D.querySelector('#modal-title span'); return m && !m.hidden ? (t ? t.textContent : 'modal') : null; }
  async function rfIDUntil(fn, ms) { var t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > (ms || 8000)) return false; await wait(20); } await idle(); return true; }
  // a drag over target and the drop: { over: the overlay while dragging, cancelled: the drop's default was cancelled, after: the overlay after }
  function rfIDDrop(target, files) {
    rfIDEvent(target, 'dragenter', files);
    var ov = rfIDEvent(target, 'dragover', files);
    var over = rfIDOverlay();
    var dr = rfIDEvent(target, 'drop', files);
    return { over: over, overCancelled: !ov.delivered, cancelled: !dr.delivered, after: rfIDOverlay() };
  }
  function rfIDDxf() {
    var pts = [[0, 0], [3, 0], [3, 2], [0, 2]], s = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
    for (var i = 0; i < 4; i++) { var a = pts[i], b = pts[(i + 1) % 4]; s += '0\nLINE\n8\n0\n10\n' + a[0] + '\n20\n' + a[1] + '\n30\n0\n11\n' + b[0] + '\n21\n' + b[1] + '\n31\n0\n'; }
    return s + '0\nENDSEC\n0\nEOF\n';
  }
  var rfIDPart = null;
  async function rfIDStart() {
    await anvil.newPart(); await idle();
    await anvil.run(UI.EXAMPLES[0].code); await idle();
    UI.App.model.name = 'IDBracket';
    rfIDPart = { json: JSON.stringify(UI.App.model), names: names().join(','), volume: anvil.mass().volume };
    await anvil.newPart(); await idle(); UI.markClean();
  }
  async function rfIDClean() {
    if (rfIDModal()) UI.closeModal();
    UI.closeMenus && UI.closeMenus();
    await anvil.newPart(); await idle(); UI.markClean();
  }

  step('rfID: a part JSON dropped on the graphics area opens as File ▸ Open would (overlay while dragging, gone after, the page does not navigate); a STEP dropped on the FeatureManager opens as Imported1', async function () {
    var errs0 = errors.length, href = W.location.href;
    W.__rfIDMark = 1;
    await rfIDStart();
    var r = rfIDDrop(UI.viewport, [rfIDFile('ID bracket.anvil.json', rfIDPart.json, 'application/json')]);
    assert(r.over && !r.over.bad && r.over.text === 'Drop to open ID bracket.anvil.json', 'overlay while dragging: ' + JSON.stringify(r.over));
    assert(r.overCancelled && r.cancelled, 'dragover / drop default cancelled (the browser does not open the file)');
    assert(!r.after, 'overlay gone after the drop: ' + JSON.stringify(r.after));
    assert(await rfIDUntil(function () { return UI.App.model.name === 'IDBracket'; }), 'opened: ' + UI.App.model.name);
    assert(names().join(',') === rfIDPart.names, 'tree ' + names().join(',') + ' / ' + rfIDPart.names);
    near(anvil.mass().volume, rfIDPart.volume, 1e-9, 'volume');
    assert(!UI.isDirty(), 'a just-opened document is clean');
    var treeNames = Array.prototype.map.call(D.querySelectorAll('#tree .ti .nm'), function (x) { return x.textContent; }).join('|');
    assert(rfIDPart.names.split(',').every(function (n) { return treeNames.indexOf(n) >= 0; }), 'FeatureManager rows ' + treeNames);
    // a STEP on the FeatureManager
    var step = await fetch('fixtures/occ-block.step').then(function (x) { return x.text(); });
    r = rfIDDrop(D.getElementById('tree'), [rfIDFile('occ-block.step', step)]);
    assert(r.over && r.over.text === 'Drop to open occ-block.step' && r.cancelled && !r.after, 'STEP drag ' + JSON.stringify(r));
    assert(await rfIDUntil(function () { return names().join(',') === 'Imported1'; }, 20000), 'STEP opened: ' + names().join(','));
    near(anvil.mass().volume, 27875, 1e-3, 'imported volume');
    assert(W.__rfIDMark === 1 && W.location.href === href, 'the page did not navigate');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'JSON -> ' + rfIDPart.names.split(',').length + ' features, STEP -> Imported1 ' + anvil.mass().volume.toFixed(1);
  });

  step('rfID: a DXF dropped opens as File ▸ Open does for DXF (a new part, Sketch1 on the Top Plane); a .xyz is refused with a toast naming the types and nothing changes; dragleave and Esc take the overlay away', async function () {
    var errs0 = errors.length;
    await rfIDClean();
    var r = rfIDDrop(UI.viewport, [rfIDFile('ID plate.dxf', rfIDDxf(), 'image/vnd.dxf')]);
    assert(r.over && !r.over.bad && r.cancelled && !r.after, 'DXF drag ' + JSON.stringify(r));
    assert(await rfIDUntil(function () { return UI.App.model.name === 'ID plate' && UI.hasPM(); }), 'DXF part: ' + UI.App.model.name + ', PM ' + UI.hasPM());
    var pmTitle = UI.pmTitle();
    await pmAccept();
    var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
    assert(sk && sk.name === 'Sketch1' && sk.entities.filter(function (e) { return e.t === 'line'; }).length === 4, 'Sketch1 with the four lines: ' + JSON.stringify(sk && sk.entities.map(function (e) { return e.t; })));
    // the same as File ▸ Open's own path for the DXF
    var model1 = JSON.stringify(UI.App.model.features.map(function (f) { return [f.type, f.name, (f.entities || []).length]; }));
    await anvil.newPart(); await idle();
    await UI.openFileData('ID plate.dxf', new W.TextEncoder().encode(rfIDDxf()).buffer); await idle();
    assert(UI.hasPM() && UI.pmTitle() === pmTitle, 'File ▸ Open shows the same ' + pmTitle + ' PropertyManager: ' + UI.pmTitle());
    await pmAccept();
    assert(JSON.stringify(UI.App.model.features.map(function (f) { return [f.type, f.name, (f.entities || []).length]; })) === model1, 'drop = File ▸ Open for a DXF');
    if (UI.App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
    await idle(); await wait(60); await idle();
    UI.markClean();
    // .xyz: refused, nothing changes
    var before = JSON.stringify(UI.App.model);
    r = rfIDDrop(UI.viewport, [rfIDFile('notes.xyz', 'hello')]);
    assert(r.over && r.over.bad && r.over.text === "Anvil can't open .xyz files" && /STEP/.test(r.over.sub), 'refused overlay ' + JSON.stringify(r.over));
    assert(r.cancelled && !r.after, 'xyz drop cancelled, overlay gone');
    await wait(60); await idle();
    var t = rfIDToast();
    assert(/^Anvil can't open \.xyz files\. It opens .*STEP, IGES, STL, OBJ, 3MF, DXF and DWG/.test(t), 'toast: ' + t);
    assert(JSON.stringify(UI.App.model) === before && !rfIDModal() && !UI.isDirty(), 'nothing changed: ' + [JSON.stringify(UI.App.model) === before, rfIDModal(), UI.isDirty(), UI.App.mode]);
    // dragleave (the pointer left the window) and Esc
    var f = [rfIDFile('ID bracket.anvil.json', rfIDPart.json)];
    rfIDEvent(UI.viewport, 'dragenter', f); rfIDEvent(UI.viewport, 'dragover', f);
    assert(rfIDOverlay(), 'overlay on dragover');
    rfIDEvent(UI.viewport, 'dragleave', f);
    assert(!rfIDOverlay(), 'gone after dragleave');
    rfIDEvent(UI.viewport, 'dragenter', f); rfIDEvent(UI.viewport, 'dragover', f);
    assert(rfIDOverlay(), 'overlay again');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!rfIDOverlay(), 'gone after Esc');
    rfIDEvent(UI.viewport, 'dragleave', f);
    // a drag that is not of files (text) is left alone
    var dt = new W.DataTransfer(); dt.setData('text/plain', 'x');
    var tev = new W.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    UI.viewport.dispatchEvent(tev);
    assert(!tev.defaultPrevented && !rfIDOverlay(), 'a text drag is not a file drop');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'DXF -> ' + pmTitle + ' -> ' + model1 + '; .xyz refused';
  });

  step('rfID: a dirty part asks "Save changes?" before a dropped file opens (Cancel keeps it, Don\'t Save opens); several files: the first Anvil can open opens and a toast says why', async function () {
    var errs0 = errors.length;
    await rfIDClean();
    await anvil.run('p.sketch("Front").rect(0, 0, 2, 1).extrude(0.5);'); await idle();
    UI.App.dirty = true;
    assert(UI.isDirty(), 'dirty');
    var before = JSON.stringify(UI.App.model);
    var f = [rfIDFile('ID bracket.anvil.json', rfIDPart.json)];
    rfIDDrop(UI.viewport, f);
    assert(await rfIDUntil(function () { return rfIDModal(); }, 3000) && /Save changes to/.test($('modal-body').textContent), 'Save changes? ' + rfIDModal());
    clickModalButton('Cancel');
    await wait(60); await idle();
    assert(JSON.stringify(UI.App.model) === before && UI.isDirty() && !rfIDModal(), 'Cancel: nothing changed');
    rfIDDrop(UI.viewport, f);
    assert(await rfIDUntil(function () { return rfIDModal(); }, 3000), 'asked again');
    clickModalButton("Don't Save");
    assert(await rfIDUntil(function () { return UI.App.model.name === 'IDBracket'; }), "Don't Save opened it: " + UI.App.model.name);
    assert(!UI.isDirty(), 'clean after open');
    // several files at once: .xyz skipped, the JSON opens, the STEP does not
    await rfIDClean();
    var r = rfIDDrop(D.getElementById('tree'), [rfIDFile('a.xyz', 'x'), rfIDFile('ID bracket.anvil.json', rfIDPart.json), rfIDFile('b.step', 'ISO-10303-21;')]);
    assert(r.over && r.over.text === 'Drop to open ID bracket.anvil.json' && /one document at a time/.test(r.over.sub), 'several: overlay ' + JSON.stringify(r.over));
    assert(await rfIDUntil(function () { return UI.App.model.name === 'IDBracket'; }), 'first openable opened: ' + UI.App.model.name);
    await wait(30);
    var t = rfIDToast();
    assert(/^Opened ID bracket\.anvil\.json\. Anvil holds one document at a time, so the other 2 files were not opened\./.test(t), 'toast: ' + t);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Cancel / Don\'t Save; ' + t;
  });

  step('rfID: the Open dialog\'s own drop zone still takes a dropped file (the window does not open it behind the dialog); a drop on the dialog\'s backdrop goes to the dialog too', async function () {
    var errs0 = errors.length;
    await rfIDClean();
    UI.fileOpen();
    assert(rfIDModal() === 'Open', 'Open dialog: ' + rfIDModal());
    var zone = D.querySelector('#modal-body .open-drop');
    var before = JSON.stringify(UI.App.model);
    var r = rfIDDrop(zone, [rfIDFile('ID bracket.anvil.json', rfIDPart.json)]);
    assert(!r.over && r.cancelled, 'no window overlay over the dialog: ' + JSON.stringify(r));
    await wait(40); await idle();
    var card = D.querySelector('#modal-body .open-card');
    assert(card && !card.hidden && /ID bracket\.anvil\.json/.test(card.textContent) && JSON.stringify(UI.App.model) === before && rfIDModal() === 'Open', 'zone chose the file: ' + (card && card.textContent));
    // the backdrop (outside the dialog's card)
    r = rfIDDrop(D.getElementById('modal'), [rfIDFile('occ-block.step', 'ISO-10303-21;')]);
    assert(!r.over && r.cancelled, 'backdrop drop ' + JSON.stringify(r));
    await wait(40);
    assert(/occ-block\.step/.test(D.querySelector('#modal-body .open-card').textContent) && JSON.stringify(UI.App.model) === before, 'backdrop drop chose the STEP in the dialog');
    // put the JSON back and Open
    rfIDDrop(zone, [rfIDFile('ID bracket.anvil.json', rfIDPart.json)]);
    await wait(40);
    clickModalButton('Open');
    assert(await rfIDUntil(function () { return UI.App.model.name === 'IDBracket' && !rfIDModal(); }), 'Open opened it: ' + UI.App.model.name);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Open dialog zone + backdrop';
  });

  step('rfID: in the Windows app (stand-in bridge) a dropped part keeps its path (title) and Ctrl+S writes straight back to it; a dropped STEP is a new part with no path; a File with no path on disk opens without one', async function () {
    var errs0 = errors.length;
    await rfIDClean();
    var calls = [], allowed = {}, written = {};
    W.anvilDesktop = { isDesktop: true, version: 'test', files: {
      dropped: function (file) { calls.push({ fn: 'dropped', name: file.name }); if (/nopath/.test(file.name)) return Promise.resolve(null); var p = 'C:\\Jobs\\' + file.name; allowed[p.toLowerCase()] = true; return Promise.resolve({ path: p, name: file.name }); },
      open: function () { calls.push({ fn: 'open' }); return Promise.resolve(null); },
      saveDialog: function () { calls.push({ fn: 'saveDialog' }); return Promise.resolve(null); },
      write: function (p, data) { calls.push({ fn: 'write', path: p }); if (!allowed[String(p).toLowerCase()]) return Promise.resolve({ error: 'not allowed', code: 'NOTALLOWED' }); written[p] = typeof data === 'string' ? data : new W.TextDecoder().decode(data); return Promise.resolve({ path: p, bytes: written[p].length }); },
      setDocument: function (p) { calls.push({ fn: 'setDocument', path: p }); return Promise.resolve(p); }
    } };
    try {
      rfIDDrop(UI.viewport, [rfIDFile('ID bracket.anvil.json', rfIDPart.json)]);
      assert(await rfIDUntil(function () { return UI.App.filePath === 'C:\\Jobs\\ID bracket.anvil.json'; }), 'path kept: ' + UI.App.filePath);
      var sd = calls.filter(function (c) { return c.fn === 'setDocument'; }).pop();
      assert(sd && sd.path === UI.App.filePath && UI.App.model.name === 'IDBracket', 'title named: ' + JSON.stringify(sd));
      await anvil.append('p.sketch("Front").circle(1, 1, 0.1).extrude(0.2);'); await idle();
      assert(UI.isDirty(), 'dirty after an edit');
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      assert(await rfIDUntil(function () { return !UI.isDirty(); }, 5000), 'saved');
      var w = calls.filter(function (c) { return c.fn === 'write'; });
      assert(w.length === 1 && w[0].path === 'C:\\Jobs\\ID bracket.anvil.json' && !calls.some(function (c) { return c.fn === 'saveDialog'; }), 'Ctrl+S wrote in place: ' + JSON.stringify(calls));
      assert(JSON.parse(written[w[0].path]).features.length === UI.App.model.features.length, 'written model');
      // a STEP: a new part, no path (Save asks where), as File ▸ Open
      var step = await fetch('fixtures/occ-block.step').then(function (x) { return x.text(); });
      rfIDDrop(UI.viewport, [rfIDFile('occ-block.step', step)]);
      assert(await rfIDUntil(function () { return names().join(',') === 'Imported1'; }, 20000), 'STEP opened');
      assert(UI.App.filePath == null, 'imported: no path ' + UI.App.filePath);
      // a File the page has no disk path for
      rfIDDrop(UI.viewport, [rfIDFile('nopath.anvil.json', rfIDPart.json)]);
      assert(await rfIDUntil(function () { return UI.App.model.name === 'IDBracket'; }), 'opened without a path');
      assert(UI.App.filePath == null, 'no path ' + UI.App.filePath);
    } finally { delete W.anvilDesktop; }
    await rfIDClean();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return calls.length + ' bridge calls';
  });
  // --- end rfID ---
