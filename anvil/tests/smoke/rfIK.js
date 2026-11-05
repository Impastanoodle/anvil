  // --- rfIK (2026-11-05, lane recentfiles) --- File ▸ Recent Documents, remembered paths and the window title, through
  // a stand-in for desktop/preload.js's window.anvilDesktop.files (with its recent list as main.js keeps it: paths
  // only, newest first, at most 10; reopening one makes its path writable again). Open three files -> the list order
  // (File menu foot and Browse Recent Documents); reopen one from the list (Ctrl+S writes back to it); a file deleted
  // meanwhile is greyed and Remove takes it off; a STEP import's first Save starts in its folder with its name; a
  // .drawing file opened from disk is written back by Ctrl+S; the title names the file and shows "*" while unsaved.
  // Then a browser (no bridge): the list names files opened from disk and documents saved in this browser.
  function rfIKBridge() {
    var b = { isDesktop: true, version: 'test', calls: [], opens: [], saves: [], written: {}, disk: {}, recent: [], docPath: null, title: null };
    var allowed = {};
    function key(p) { return String(p).toLowerCase(); }
    function base(p) { return String(p).replace(/^.*[\\\/]/, ''); }
    function dir(p) { return String(p).replace(/[\\\/][^\\\/]*$/, ''); }
    function list() { return b.recent.map(function (p) { return { path: p, name: base(p), folder: dir(p), missing: !(key(p) in b.disk) }; }); }
    function read(p) { return { path: p, name: base(p), data: new W.TextEncoder().encode(b.disk[key(p)]) }; }
    b.files = {
      open: function (o) {
        b.calls.push({ fn: 'open', o: o });
        var p = b.opens.shift();
        if (!p) return Promise.resolve(null);
        allowed[key(p)] = true;
        return Promise.resolve(read(p));
      },
      saveDialog: function (o) {
        b.calls.push({ fn: 'saveDialog', o: o });
        var p = b.saves.shift();
        if (!p) return Promise.resolve(null);
        allowed[key(p)] = true;
        return Promise.resolve({ path: p, name: base(p) });
      },
      write: function (p, data) {
        b.calls.push({ fn: 'write', path: p });
        if (!allowed[key(p)]) return Promise.resolve({ error: 'not allowed', code: 'NOTALLOWED' });
        b.written[p] = typeof data === 'string' ? data : new W.TextDecoder().decode(data);
        b.disk[key(p)] = b.written[p];
        return Promise.resolve({ path: p, bytes: b.written[p].length });
      },
      setDocument: function (p, title) { b.calls.push({ fn: 'setDocument', path: p, title: title }); b.docPath = p && allowed[key(p)] ? p : null; b.title = title || null; return Promise.resolve(b.docPath); },
      recent: {
        list: function () { return Promise.resolve(list()); },
        add: function (p) {
          b.calls.push({ fn: 'recentAdd', path: p });
          if (allowed[key(p)]) b.recent = [p].concat(b.recent.filter(function (x) { return key(x) !== key(p); })).slice(0, 10);
          return Promise.resolve(list());
        },
        remove: function (p) { b.recent = b.recent.filter(function (x) { return key(x) !== key(p); }); return Promise.resolve(list()); },
        clear: function () { b.recent = []; return Promise.resolve([]); },
        open: function (p) {
          b.calls.push({ fn: 'recentOpen', path: p });
          if (!b.recent.some(function (x) { return key(x) === key(p); })) return Promise.resolve({ error: 'not on the list', code: 'NOTALLOWED' });
          if (!(key(p) in b.disk)) return Promise.resolve({ missing: true, path: p, name: base(p) });
          allowed[key(p)] = true;
          return Promise.resolve(read(p));
        }
      }
    };
    b.put = function (p, text) { b.disk[key(p)] = text; };
    b.drop = function (p) { delete b.disk[key(p)]; };
    b.count = function (fn) { return b.calls.filter(function (c) { return c.fn === fn; }).length; };
    b.last = function (fn) { return b.calls.filter(function (c) { return c.fn === fn; }).pop(); };
    return b;
  }
  function rfIKKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true })); }
  async function rfIKSettle() { for (var i = 0; i < 6; i++) await wait(15); await idle(); }
  function rfIKModal() { var m = D.getElementById('modal'); return m && !m.hidden ? ((D.getElementById('modal-body') || m).textContent || 'modal') : null; }
  // the File menu's rows as the user sees them: [{ text, disabled, row }]
  function rfIKFileMenu() {
    var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === 'File'; })[0];
    if (!li) return [];
    li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1];
    var rows = m ? Array.prototype.map.call(m.querySelectorAll('.mi'), function (r) { return { text: r.textContent, disabled: r.classList.contains('disabled'), row: r }; }) : [];
    return rows;
  }
  function rfIKCloseMenus() { if (UI.closeMenus) UI.closeMenus(); }

  step('rfIK: Windows app Recent Documents: three opened files listed newest first (File menu and Browse Recent Documents), reopened from the list, a deleted file greyed and removed', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("IKA").units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(0.5);'); await idle();
    var jA = JSON.stringify(UI.App.model);
    await anvil.run('p.name("IKB").units("in");\np.sketch("Front").rect(0, 0, 3, 3).extrude(0.25);'); await idle();
    var jB = JSON.stringify(UI.App.model);
    var step = W.Exchange.exportSTEP(UI.App.model, UI.App.build, { fileName: 'IK plate.step' });
    await anvil.newPart(); await idle(); UI.markClean();
    var A = 'C:\\Jobs\\IK\\IK A.anvil.json', B = 'C:\\Jobs\\IK\\IK B.anvil.json', C = 'C:\\Jobs\\IK\\Imports\\IK plate.step';
    var b = rfIKBridge();
    b.put(A, jA); b.put(B, jB); b.put(C, step);
    W.anvilDesktop = b;
    try {
      b.opens.push(A, B, C);
      for (var i = 0; i < 3; i++) { UI.markClean(); rfIKKey('o'); await rfIKSettle(); await idle(); }
      // with OpenCascade on (the desktop default) the third, a STEP, goes through its import first: wait for it (up to 20 s)
      for (var wi0 = 0; wi0 < 200 && UI.App.importPath !== C; wi0++) await wait(100);
      await idle();
      await UI.recentDocuments.list(true);
      var names = UI.recentDocuments.cached().map(function (x) { return x.name; });
      assert(names.join('|') === 'IK plate.step|IK B.anvil.json|IK A.anvil.json', 'list order ' + names.join('|'));
      // the File menu: Browse Recent Documents… after Open…, then the numbered list at its foot with each folder
      var rows = rfIKFileMenu(), texts = rows.map(function (r) { return r.text; });
      rfIKCloseMenus();
      var iOpen = texts.indexOf('Open…Ctrl+O'), iBrowse = texts.indexOf('Browse Recent Documents…');
      var foot = rows.filter(function (r) { return /^\d+\s/.test(r.text); });
      assert(iBrowse === iOpen + 1, 'Browse Recent Documents after Open: ' + texts.slice(0, 6).join(' | '));
      assert(foot.length === 3 && /^1\s+IK plate\.step/.test(foot[0].text) && /Imports/.test(foot[0].text) && /^3\s+IK A\.anvil\.json/.test(foot[2].text), 'menu foot ' + foot.map(function (r) { return r.text; }).join(' | '));
      // reopen A from the menu: "Save changes?" first when dirty, then it opens with its path; Ctrl+S writes back
      await anvil.append('p.sketch("Front").rect(0, 0, 1, 1).extrude(0.1);'); await idle();
      assert(UI.isDirty(), 'dirty before reopening');
      rows = rfIKFileMenu();
      rows.filter(function (r) { return /^3\s+IK A/.test(r.text); })[0].row.click();
      await rfIKSettle();
      var q = rfIKModal();
      assert(q && /Save changes to/.test(q), 'asked to save first: ' + q);
      clickModalButton("Don't Save"); await rfIKSettle(); await idle();
      assert(UI.App.model.name === 'IKA' && UI.App.filePath === A && b.last('recentOpen').path === A, 'reopened ' + UI.App.model.name + ' ' + UI.App.filePath);
      assert(UI.recentDocuments.cached()[0].path === A, 'A is first now: ' + UI.recentDocuments.cached().map(function (x) { return x.name; }).join('|'));
      await anvil.append('p.sketch("Front", 0.5).circle(1, 1, 0.25).cut("through", { reverse: true });'); await idle();
      var dialogs0 = b.count('saveDialog');
      rfIKKey('s'); await rfIKSettle();
      assert(b.count('saveDialog') === dialogs0 && JSON.parse(b.written[A]).features.length === UI.App.model.features.length && !UI.isDirty(), 'Ctrl+S wrote the reopened file');
      // B deleted meanwhile: greyed in the menu and in the dialog; Remove takes it off the list
      b.drop(B);
      await UI.recentDocuments.list(true);
      rows = rfIKFileMenu(); rfIKCloseMenus();
      var rowB = rows.filter(function (r) { return /IK B\.anvil\.json/.test(r.text); })[0];
      assert(rowB && rowB.row.classList.contains('mi-dim') && /not found/.test(rowB.text), 'B greyed in the menu: ' + (rowB && rowB.text));
      UI.showRecentDialog(); await rfIKSettle();
      var dRows = D.querySelectorAll('#modal .recent-row'), miss = D.querySelectorAll('#modal .recent-row.missing');
      assert(dRows.length === 3 && miss.length === 1 && /IK B/.test(miss[0].textContent) && miss[0].querySelector('.recent-remove'), 'dialog rows ' + dRows.length + ' missing ' + miss.length);
      assert(+W.getComputedStyle(miss[0].querySelector('.recent-text')).opacity < 1 && +W.getComputedStyle(dRows[0].querySelector('.recent-text')).opacity === 1, 'missing row looks greyed');
      miss[0].querySelector('.recent-remove').click(); await rfIKSettle();
      assert(b.recent.length === 2 && !b.recent.some(function (p) { return /IK B/.test(p); }) && D.querySelectorAll('#modal .recent-row').length === 2, 'B removed: ' + b.recent.join('|'));
      UI.closeModal();
      // a click on a missing file (the menu row greyed, so through the API as the dialog's row does) offers removal
      b.drop(C);
      await UI.recentDocuments.list(true);
      var ce = UI.recentDocuments.cached().filter(function (x) { return x.path === C; })[0];
      UI.recentDocuments.open(ce); await rfIKSettle();
      q = rfIKModal();
      assert(q && /not in C:\\Jobs\\IK\\Imports any more/.test(q), 'missing file prompt: ' + q);
      clickModalButton('Remove'); await rfIKSettle();
      assert(b.recent.length === 1 && b.recent[0] === A, 'C removed: ' + b.recent.join('|'));
      // a path the page never had is not added
      b.files.recent.add('C:\\Windows\\evil.json');
      assert(b.recent.length === 1, 'an unpicked path stays off the list');
    } finally { delete W.anvilDesktop; if (UI.closeModal) UI.closeModal(); rfIKCloseMenus(); }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '3 files listed newest first, reopened from the File menu, Ctrl+S in place, 2 missing files greyed and removed';
  });

  step('rfIK: Windows app remembered paths and title: STEP import Save starts in its folder with its name; a .drawing opened from disk is written back by Ctrl+S; the title names the file and shows * while unsaved', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("IKPlate").units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(0.5);'); await idle();
    var jP = JSON.stringify(UI.App.model);
    var step = W.Exchange.exportSTEP(UI.App.model, UI.App.build, { fileName: 'IK plate.step' });
    await anvil.newPart(); await idle(); UI.markClean();
    var P = 'C:\\Jobs\\IK\\IK plate.anvil.json', S = 'C:\\Jobs\\IK\\Imports\\IK bracket.step', DR = 'C:\\Jobs\\IK\\IK plate.drawing';
    var b = rfIKBridge();
    b.put(P, jP); b.put(S, step);
    W.anvilDesktop = b;
    try {
      // the title: the part's file name, "*" on an edit, gone after Ctrl+S (the page's title, and the one sent to the app)
      b.opens.push(P);
      rfIKKey('o'); await rfIKSettle(); await idle();
      assert(D.title === 'IK plate.anvil.json - Anvil' && b.title === D.title && b.docPath === P, 'title after open: ' + D.title + ' / ' + b.title);
      await anvil.append('p.sketch("Front", 0.5).circle(1, 1, 0.25).cut("through", { reverse: true });'); await idle();
      assert(D.title === 'IK plate.anvil.json * - Anvil', 'title after an edit: ' + D.title);
      rfIKKey('s'); await rfIKSettle();
      assert(D.title === 'IK plate.anvil.json - Anvil' && !UI.isDirty(), 'title after Ctrl+S: ' + D.title);
      // a drawing of it saved as a .drawing file, then opened from disk on the part
      anvil.drawing.make(); await UI.drawing.ready(); await wait(30);
      var dname = anvil.drawing.summary().name || UI.drawingInternal.doc().name;
      b.put(DR, JSON.stringify(W.Drawing.drawingFile(UI.drawingInternal.doc(), UI.App.model, null)));
      UI.closeDrawing(); await idle();
      UI.App.model.drawings = []; UI.markClean();
      b.opens.push(DR);
      rfIKKey('o'); await rfIKSettle(); await idle(); await UI.drawing.ready(); await wait(30);
      assert(UI.drawingActive() && UI.App.drawingPath && UI.App.drawingPath.path === DR && !UI.isDirty(), 'drawing opened from disk: ' + JSON.stringify(UI.App.drawingPath && UI.App.drawingPath.path) + ' dirty ' + UI.isDirty());
      assert(/^IK plate\.drawing - .+ - Anvil$/.test(D.title) && b.docPath === DR, 'drawing title: ' + D.title + ' doc ' + b.docPath);
      var n0 = anvil.drawing.summary().views.length;
      anvil.drawing.deleteView(anvil.drawing.summary().views[n0 - 1].id); await idle();
      assert(UI.isDirty() && / \* - Anvil$/.test(D.title), 'drawing edit dirty: ' + D.title);
      var dialogs0 = b.count('saveDialog'), wP = b.written[P];
      rfIKKey('s'); await rfIKSettle();
      var f = JSON.parse(b.written[DR] || 'null');
      assert(f && f.kind === 'anvil-drawing' && f.drawing && f.drawing.name === dname && f.drawing.views.length === n0 - 1, 'drawing written back ' + (f && f.drawing && f.drawing.views.length));
      assert(b.count('saveDialog') === dialogs0 && b.written[P] === wP && !UI.isDirty() && !/\*/.test(D.title), 'no box, part untouched, clean: ' + D.title);
      assert(UI.recentDocuments.cached()[0].path === DR, 'the drawing is first in Recent Documents');
      UI.closeDrawing(); await idle();
      assert(D.title === 'IK plate.anvil.json - Anvil' && b.docPath === P, 'back on the part: ' + D.title + ' / ' + b.docPath);
      // a STEP import: a new part with no file; the first Save asks, in the STEP's folder with its name
      b.opens.push(S);
      UI.markClean(); rfIKKey('o'); await rfIKSettle(); await idle();
      // with OpenCascade on (the desktop default) the STEP goes through its import first: wait for the part (up to 20 s)
      for (var wi = 0; wi < 200 && UI.App.importPath !== S; wi++) await wait(100);
      await idle();
      assert(UI.App.filePath == null && UI.App.importPath === S && UI.App.model.features.some(function (x) { return x.type === 'import'; }), 'STEP opened as a new part ' + UI.App.importPath);
      b.saves.push('C:\\Jobs\\IK\\Imports\\IK bracket.anvil.json');
      rfIKKey('s'); await rfIKSettle();
      var sd = b.last('saveDialog');
      assert(sd && sd.o.name === 'IK bracket.anvil.json' && sd.o.near === S && sd.o.kind === 'document', 'import Save box ' + JSON.stringify(sd && sd.o).slice(0, 240));
      assert(UI.App.filePath === 'C:\\Jobs\\IK\\Imports\\IK bracket.anvil.json' && UI.App.importPath == null && !UI.isDirty() && D.title === 'IK bracket.anvil.json - Anvil', 'saved part has its own file: ' + D.title);
      var names = UI.recentDocuments.cached().map(function (x) { return x.name; });
      assert(names[0] === 'IK bracket.anvil.json' && names[1] === 'IK bracket.step', 'recent after the import save ' + names.join('|'));
      // a new part: no file, its name in the title
      await anvil.newPart(); await idle();
      assert(UI.App.filePath == null && UI.App.importPath == null && b.docPath == null && /^Part\d* - Anvil$/.test(D.title), 'new part title ' + D.title);
    } finally { delete W.anvilDesktop; if (UI.closeDrawing && UI.drawingActive && UI.drawingActive()) UI.closeDrawing(); if (UI.closeModal) UI.closeModal(); }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'import Save beside the STEP, .drawing written back, title follows file / drawing / dirty';
  });

  step('rfIK: browser Recent Documents: documents saved in this browser reopen at once; a file opened from disk is listed by name and asks for the file again', async function () {
    var errs0 = errors.length, key = UI.recentDocuments.key, keep = null, files0 = null;
    try { keep = W.localStorage.getItem(key); files0 = W.localStorage.getItem('anvil.files'); } catch (e) { }
    try {
      W.localStorage.removeItem(key);
      await anvil.newPart(); await idle();
      await anvil.run('p.name("IKSaved").units("in");\np.sketch("Front").rect(0, 0, 2, 2).extrude(0.5);'); await idle();
      // a file opened from disk (dropped here, as the Open dialog's Browse gives it)
      var json = JSON.stringify(UI.App.model);
      UI.markClean();
      await UI.openDroppedFiles([new W.File([json], 'IK disk part.anvil.json')]); await rfIKSettle();
      // File ▸ Save keeps it in this browser
      UI.fileSave(); await wait(30);
      D.querySelector('#modal-body input').value = 'IK smoke saved'; clickModalButton('OK'); await rfIKSettle();
      await UI.recentDocuments.list(true);
      var l = UI.recentDocuments.cached();
      assert(l.length === 2 && l[0].name === 'IK smoke saved' && l[0].kind === 'browser' && l[1].name === 'IK disk part.anvil.json' && l[1].kind === 'disk' && !l[0].path, 'browser list ' + JSON.stringify(l));
      var rows = rfIKFileMenu(); rfIKCloseMenus();
      var foot = rows.filter(function (r) { return /^\d+\s/.test(r.text); }).map(function (r) { return r.text; });
      assert(foot.length === 2 && /saved in this browser/.test(foot[0]) && /IK disk part/.test(foot[1]), 'menu ' + foot.join(' | '));
      // the saved one reopens at once
      await anvil.newPart(); await idle(); UI.markClean();
      await UI.recentDocuments.open(l[0]); await rfIKSettle();
      assert(UI.App.model.name === 'IKSaved' && UI.App.fileName === 'IK smoke saved' && !rfIKModal(), 'reopened from browser storage ' + UI.App.model.name);
      // the disk one: the Open dialog asks for it again, naming it
      UI.markClean();
      await UI.recentDocuments.open(UI.recentDocuments.cached().filter(function (x) { return x.kind === 'disk'; })[0]); await rfIKSettle();
      var hint = D.querySelector('#modal .open-hint');
      assert(hint && /IK disk part\.anvil\.json/.test(hint.textContent) && D.querySelector('#modal .open-drop'), 'Open dialog asks again: ' + (hint && hint.textContent));
      UI.closeModal();
      // a saved document deleted from this browser: greyed, removable
      var files = JSON.parse(W.localStorage.getItem('anvil.files') || '{}'); delete files['IK smoke saved']; W.localStorage.setItem('anvil.files', JSON.stringify(files));
      await UI.recentDocuments.list(true);
      UI.showRecentDialog(); await rfIKSettle();
      var miss = D.querySelectorAll('#modal .recent-row.missing');
      assert(miss.length === 1 && /IK smoke saved/.test(miss[0].textContent) && /cannot reopen a file/.test(D.getElementById('modal-body').textContent), 'browser dialog ' + miss.length);
      miss[0].querySelector('.recent-remove').click(); await rfIKSettle();
      assert(UI.recentDocuments.cached().length === 1, 'removed: ' + UI.recentDocuments.cached().length);
      UI.closeModal();
      assert(/^IKSaved( \*)? - Anvil$/.test(D.title), 'browser title ' + D.title);
    } finally {
      if (UI.closeModal) UI.closeModal();
      try { if (keep == null) W.localStorage.removeItem(key); else W.localStorage.setItem(key, keep); if (files0 == null) W.localStorage.removeItem('anvil.files'); else W.localStorage.setItem('anvil.files', files0); } catch (e) { }
    }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'browser list: saved-in-browser reopens, disk file asks again, deleted one removed';
  });
  // --- end rfIK ---
