  // --- rfHZ (2026-11-05, lane desktop-files) --- the Windows app's own Open / Save boxes, through a stand-in for
  // desktop/preload.js's window.anvilDesktop.files: File ▸ Open (Ctrl+O) asks Windows' Open box and remembers the
  // file's path; Ctrl+S writes straight to it with no box; Save As and exports (STEP, a DXF download) ask Windows' Save
  // box with the right name and type; a failed write shows a message and keeps the document unsaved; a new part has no
  // path; with no bridge (a browser) Open and Save are Anvil's own dialogs, as before.
  function rfHZBridge() {
    var b = { isDesktop: true, version: 'test', calls: [], files: {}, opens: [], saves: [], failNext: null, docPath: null };
    var allowed = {};
    function key(p) { return String(p).toLowerCase(); }
    b.files = {
      open: function (o) {
        b.calls.push({ fn: 'open', o: o });
        var f = b.opens.shift();
        if (!f) return Promise.resolve(null);
        allowed[key(f.path)] = true;
        return Promise.resolve({ path: f.path, name: f.path.replace(/^.*[\\\/]/, ''), data: new W.TextEncoder().encode(f.text) });
      },
      saveDialog: function (o) {
        b.calls.push({ fn: 'saveDialog', o: o });
        var p = b.saves.shift();
        if (!p) return Promise.resolve(null);
        allowed[key(p)] = true;
        return Promise.resolve({ path: p, name: p.replace(/^.*[\\\/]/, '') });
      },
      write: function (p, data, o) {
        b.calls.push({ fn: 'write', path: p, sibling: o && o.sibling });
        if (!allowed[key(p)]) return Promise.resolve({ error: 'not allowed', code: 'NOTALLOWED' });
        if (b.failNext) { var e = b.failNext; b.failNext = null; return Promise.resolve({ error: e, code: 'EBUSY' }); }
        var target = o && o.sibling ? p.replace(/[^\\\/]*$/, o.sibling) : p;
        b.written[target] = typeof data === 'string' ? data : new W.TextDecoder().decode(data);
        return Promise.resolve({ path: target, bytes: b.written[target].length });
      },
      setDocument: function (p) { b.calls.push({ fn: 'setDocument', path: p }); b.docPath = p && allowed[key(p)] ? p : null; return Promise.resolve(b.docPath); }
    };
    b.written = {};
    b.count = function (fn) { return b.calls.filter(function (c) { return c.fn === fn; }).length; };
    b.last = function (fn) { return b.calls.filter(function (c) { return c.fn === fn; }).pop(); };
    return b;
  }
  function rfHZKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true })); }
  async function rfHZSettle() { for (var i = 0; i < 6; i++) await wait(15); await idle(); }
  function rfHZModal() { var m = D.getElementById('modal'), t = D.querySelector('#modal-title span'); return m && !m.hidden ? (t ? t.textContent : 'modal') : null; }

  step('rfHZ: in the Windows app File ▸ Open (Ctrl+O) uses Windows\' Open box and keeps the path; Ctrl+S writes straight back; Save As, Export STEP and a DXF download ask Windows\' Save box', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("HZBracket").units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(0.5);'); await idle();
    var json = JSON.stringify(UI.App.model);
    await anvil.newPart(); await idle(); UI.markClean();
    var b = rfHZBridge();
    W.anvilDesktop = b;
    try {
      // Open: Windows' box with Anvil's types, the part opens, its path is kept and named to the window title
      b.opens.push({ path: 'C:\\Jobs\\HZ bracket.anvil.json', text: json });
      rfHZKey('o'); await rfHZSettle();
      var op = b.last('open');
      assert(op && op.o.filters.some(function (f) { return f.extensions.indexOf('step') >= 0; }) && op.o.filters.some(function (f) { return f.extensions.indexOf('dxf') >= 0; }) && op.o.filters[0].extensions.indexOf('json') >= 0, 'Open box filters ' + JSON.stringify(op && op.o.filters));
      assert(!rfHZModal(), 'no Anvil Open dialog: ' + rfHZModal());
      assert(UI.App.model.name === 'HZBracket' && Math.abs(anvil.mass().volume - 4) < 1e-9, 'opened ' + UI.App.model.name);
      assert(UI.App.filePath === 'C:\\Jobs\\HZ bracket.anvil.json' && b.docPath === UI.App.filePath, 'path kept ' + UI.App.filePath + ' / ' + b.docPath);
      // a change, then Ctrl+S: written to that path, no Save box, clean
      await anvil.append('p.sketch("Front", 0.5).circle(1, 1, 0.25).cut("through", { reverse: true });'); await idle();
      assert(UI.isDirty(), 'dirty after the cut');
      var dialogs0 = b.count('saveDialog');
      rfHZKey('s'); await rfHZSettle();
      assert(b.count('saveDialog') === dialogs0 && !rfHZModal(), 'Ctrl+S asked nothing ' + rfHZModal());
      var saved = JSON.parse(b.written['C:\\Jobs\\HZ bracket.anvil.json'] || 'null');
      assert(saved && saved.features.length === UI.App.model.features.length && !UI.isDirty(), 'written to the opened file ' + (saved && saved.features.length));
      // Save As: Windows' Save box, Part first, the document's name; the new file becomes the document's
      b.saves.push('C:\\Jobs\\HZ copy.anvil.json');
      await UI.fileSaveAs(); await rfHZSettle();
      var sd = b.last('saveDialog');
      assert(sd.o.name === 'HZBracket.anvil.json' && sd.o.filters[0].extensions[0] === 'json' && sd.o.kind === 'document', 'Save As box ' + JSON.stringify(sd.o).slice(0, 300));
      assert(UI.App.filePath === 'C:\\Jobs\\HZ copy.anvil.json' && JSON.parse(b.written['C:\\Jobs\\HZ copy.anvil.json']).name === 'HZBracket', 'Save As made the copy the document ' + UI.App.filePath);
      // Export STEP: the STEP type first, an export (the last folder), the document's path unchanged
      b.saves.push('C:\\Jobs\\HZ bracket.step');
      await UI.fileSaveAs('step'); await rfHZSettle();
      sd = b.last('saveDialog');
      assert(sd.o.name === 'HZBracket.step' && sd.o.filters[0].extensions.indexOf('step') >= 0 && sd.o.kind === 'export', 'Export STEP box ' + JSON.stringify(sd.o).slice(0, 200));
      assert(/^ISO-10303-21;/.test(b.written['C:\\Jobs\\HZ bracket.step'] || '') && UI.App.filePath === 'C:\\Jobs\\HZ copy.anvil.json', 'STEP written, document path kept');
      // a download from anywhere (the DXF/DWG Output PropertyManager uses UI.download): Windows' Save box with its type
      b.saves.push('C:\\Jobs\\flat.dxf');
      await UI.download('flat.dxf', '0\nEOF\n', 'application/dxf'); await rfHZSettle();
      sd = b.last('saveDialog');
      assert(sd.o.name === 'flat.dxf' && sd.o.filters[0].extensions[0] === 'dxf' && b.written['C:\\Jobs\\flat.dxf'] === '0\nEOF\n', 'DXF download ' + JSON.stringify(sd.o));
      // Save As DXF: the box first, then the Output PropertyManager; its OK writes to the file picked, no second box
      b.saves.push('C:\\Jobs\\HZ face.dxf');
      await UI.fileSaveAs('dxf'); await rfHZSettle();
      var nBoxes = b.count('saveDialog');
      assert(UI.hasPM(), 'DXF/DWG Output PropertyManager open');
      UI.pmOK ? UI.pmOK() : D.querySelector('[title^="OK"]').click(); await rfHZSettle();
      assert(b.count('saveDialog') === nBoxes && /ENTITIES|EOF/.test(b.written['C:\\Jobs\\HZ face.dxf'] || ''), 'the PropertyManager wrote to the picked file ' + Object.keys(b.written).join(', '));
      // cancelled boxes write nothing
      var w0 = b.count('write');
      await UI.download('x.stl', 'solid', 'model/stl'); await rfHZSettle();
      assert(b.count('write') === w0, 'cancelled Save box: nothing written');
      // a failed write (the file open in another program): a message, still unsaved, path kept
      await anvil.append('p.sketch("Front", 0.5).circle(3, 1, 0.25).cut("through", { reverse: true });'); await idle();
      b.failNext = 'HZ copy.anvil.json is open in another program. Close it there and save again.';
      rfHZKey('s'); await rfHZSettle();
      var msg = rfHZModal(), body = (D.getElementById('modal-body') || D.getElementById('modal') || {}).textContent || '';
      assert(msg && /open in another program/.test(body) && UI.isDirty() && UI.App.filePath === 'C:\\Jobs\\HZ copy.anvil.json', 'failed save: ' + msg + ' / ' + body.slice(0, 160) + ' dirty ' + UI.isDirty());
      UI.closeModal();
      rfHZKey('s'); await rfHZSettle();
      assert(!UI.isDirty() && JSON.parse(b.written['C:\\Jobs\\HZ copy.anvil.json']).features.length === UI.App.model.features.length, 'saved on the second try');
      // a new part has no file: Ctrl+S asks (cancelled here), nothing written
      await anvil.newPart(); await idle();
      assert(UI.App.filePath == null && b.docPath == null, 'New part: no path ' + UI.App.filePath);
      dialogs0 = b.count('saveDialog'); w0 = b.count('write');
      rfHZKey('s'); await rfHZSettle();
      assert(b.count('saveDialog') === dialogs0 + 1 && b.count('write') === w0 && b.last('saveDialog').o.name === 'Part1.anvil.json', 'first save asks ' + JSON.stringify(b.last('saveDialog').o.name));
      // an imported STEP opens as a new part with no path (Save asks where)
      b.opens.push({ path: 'C:\\Jobs\\HZ bracket.step', text: b.written['C:\\Jobs\\HZ bracket.step'] });
      UI.markClean(); rfHZKey('o'); await rfHZSettle(); await idle();
      assert(UI.App.filePath == null && UI.App.model.features.some(function (f) { return f.type === 'import'; }), 'a STEP opens as a new part, no path ' + UI.App.filePath);
    } finally { delete W.anvilDesktop; if (UI.closeModal) UI.closeModal(); if (UI.closePM) UI.closePM(); }
    // a browser (no bridge): Anvil's own Open and Save dialogs, as before
    await anvil.newPart(); await idle(); UI.markClean();
    UI.fileOpen(); await wait(30);
    var t1 = rfHZModal(), hasDrop = !!D.querySelector('.open-drop');
    UI.closeModal();
    UI.fileSave(); await wait(30);
    var t2 = rfHZModal(), prompt = (D.getElementById('modal') || {}).textContent || '';
    UI.closeModal();
    assert(t1 === 'Open' && hasDrop && t2 && /kept in this browser/.test(prompt), 'browser dialogs: ' + t1 + ' / ' + t2);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Open, Ctrl+S, Save As, Export STEP, DXF download and Save As DXF through the stand-in bridge; ' + b.count('write') + ' writes';
  });
  // --- end rfHZ ---
