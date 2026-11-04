// rfHQ: File ▸ Open, redesigned (user, 2026-11-04: "update the file uploading screen ui"): the documents saved in this
// browser on the left, a drop zone with Browse…, the chosen file's card (type badge, name, size, what it opens as),
// "Paste text instead". A file dropped on the zone opens like a picked one; a saved document opens with Open or a
// double-click; picking a saved document clears a dropped file.
(function () {
  function rfHQopen() { UI.closeModal(); UI.markClean(); UI.fileOpen(); return D.querySelector('#modal-body .open-dialog'); }
  function rfHQdrop(target, file) {
    var dt = new W.DataTransfer(); dt.items.add(file);
    target.dispatchEvent(new W.DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }
  var rfHQkept = null;
  step('rfHQ: File ▸ Open shows the saved documents, a drop zone and the type filter; a 3MF dropped on the zone shows its card and opens as a new part', async function () {
    try { rfHQkept = W.localStorage.getItem('anvil.files'); } catch (e) { }
    await anvil.run('p.name("Blocky"); p.box(30, 20, 10);'); await idle();
    var vol = anvil.summary().volume, bytes = anvil.export3mf();
    W.localStorage.setItem('anvil.files', JSON.stringify({ 'rfHQ older': { model: UI.App.model, features: 1, savedAt: 1000 }, 'rfHQ newer': { model: UI.App.model, features: 1, savedAt: 2000 } }));
    var dlg = rfHQopen();
    assert(dlg && D.querySelector('#modal-card').classList.contains('wide'), 'a wide Open dialog');
    var rows = D.querySelectorAll('#modal-body .open-saved');
    assert(rows.length === 2 && rows[0].dataset.name === 'rfHQ newer', 'saved documents, newest first: ' + Array.prototype.map.call(rows, function (r) { return r.dataset.name; }).join());
    var zone = D.querySelector('#modal-body .open-drop'), card = D.querySelector('#modal-body .open-card');
    assert(zone && card.hidden && D.querySelector('#modal-body select') && D.querySelector('#modal-body details.open-paste textarea'), 'zone, hidden card, filter, paste');
    rfHQdrop(zone, new W.File([bytes], 'blocky.3mf'));
    await wait(100);
    assert(!card.hidden && /3MF/.test(card.querySelector('.open-badge').textContent) && /blocky\.3mf/.test(card.textContent) && /Imported1/.test(card.textContent), 'card: ' + card.textContent);
    clickModalButton('Open');
    for (var i = 0; i < 50 && modalOpen(); i++) await wait(50);
    await idle();
    var s = anvil.summary();
    assert(!modalOpen() && s.name === 'blocky' && names().join() === 'Imported1', 'opened ' + s.name + ': ' + names().join());
    near(s.volume, vol, 1e-3 * vol, '3MF volume');
    return 'volume ' + s.volume;
  });
  step('rfHQ: picking a saved document clears a dropped file and Open opens the saved one; a double-click opens one too; an unknown file says so on its card', async function () {
    try {
      await anvil.run('p.name("Other"); p.box(5, 5, 5);'); await idle();
      var dlg = rfHQopen(), zone = D.querySelector('#modal-body .open-drop'), card = D.querySelector('#modal-body .open-card');
      rfHQdrop(zone, new W.File(['hello'], 'notes.txt'));
      await wait(50);
      assert(!card.hidden && card.classList.contains('bad') && /Not a file type/.test(card.textContent), 'unknown file card: ' + card.textContent);
      var row = D.querySelector('#modal-body .open-saved[data-name="rfHQ older"]');
      row.click();
      assert(row.classList.contains('sel') && card.hidden && !zone.classList.contains('has-file'), 'saved pick clears the file');
      clickModalButton('Open');
      await idle();
      assert(!modalOpen() && UI.App.fileName === 'rfHQ older' && anvil.summary().name === 'Blocky', 'opened the saved one: ' + UI.App.fileName + ' / ' + anvil.summary().name);
      rfHQopen();
      D.querySelector('#modal-body .open-saved[data-name="rfHQ newer"]').dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
      await idle();
      assert(!modalOpen() && UI.App.fileName === 'rfHQ newer', 'double-click opened ' + UI.App.fileName);
      return 'ok';
    } finally {
      UI.closeModal();
      try { if (rfHQkept == null) W.localStorage.removeItem('anvil.files'); else W.localStorage.setItem('anvil.files', rfHQkept); } catch (e) { }
    }
  });
})();
