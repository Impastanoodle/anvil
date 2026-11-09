  // ---- rfKC (2026-11-09, lane mitreplane): a 14 ga mitred tray exported through File ▸ Export STEP AP214… (clicked):
  // the downloaded file carries all four bends whole (two CYLINDRICAL_SURFACEs each, ELLIPSE ends at the Butt corners)
  // and reads back at the part's exact volume (tests/kernel/rfKC.js has the geometry)
  step('rfKC: File ▸ Export STEP AP214… of a 14 ga mitred tray: every bend written as its two cylinders, the file reads back at the same volume', async function () {
    var T = 0.0747;
    // run alone (?only=rfKC) the suite's setup step has not run: record downloads and use Anvil's writer as it does
    if (!W.__downloads) {
      W.__downloads = [];
      var kcClick = W.HTMLAnchorElement.prototype.click;
      W.HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) { W.__downloads.push({ name: this.getAttribute('download'), href: this.href }); return; }
        return kcClick.apply(this, arguments);
      };
      if (W.anvil.occt) W.anvil.occt(false, { remember: false });
    }
    await anvil.run('p.name("KC Tray").units("in");\np.sheet(' + T + ', 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      'p.flange(1, [[2, ' + T + ', 0], [4, ' + T + ', 1.5], [2, ' + T + ', 3], [0, ' + T + ', 1.5]], { position: "inside" });\n');
    await idle();
    var vol = W.Kernel.massProps(W.Kernel.meshFromBody(W.Kernel.rebuild(UI.App.model).body)).volume, before = W.__downloads.length;
    var rows = menuRows('Export STEP AP214');
    assert(rows.length === 1, 'File ▸ Export STEP AP214… row');
    rows[0].row.click();
    assert(modalOpen() && D.querySelector('#modal-body select').value === 'step', 'Save As with STEP picked');
    clickModalButton('Save');
    await wait(20);
    var dl = W.__downloads[W.__downloads.length - 1];
    assert(W.__downloads.length === before + 1 && dl && /\.step$/.test(dl.name), 'a .step download: ' + JSON.stringify(dl && dl.name));
    var text = await (await W.fetch(dl.href)).text();
    var cyl = (text.match(/CYLINDRICAL_SURFACE\(/g) || []).length, ell = (text.match(/=ELLIPSE\(/g) || []).length;
    assert(cyl === 8 && ell > 0, 'four bends whole: ' + cyl + ' cylinders, ' + ell + ' ellipses');
    var res = W.Exchange.importFile('kc.step', text, { units: 'in' }), b = W.Kernel.rebuild(W.Exchange.newPartFromImport(res));
    var back = W.Kernel.massProps(W.Kernel.meshFromBody(b.body)).volume;
    near(back, vol, 1e-9 * vol, 'read back volume');
    return cyl + ' cylinders, ' + ell + ' ellipses, volume ' + back.toFixed(6) + ' in³';
  });
