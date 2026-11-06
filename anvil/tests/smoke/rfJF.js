  // --- rfJF (2026-11-05, lane dxfout) --- DXF/DWG Output's missing sheet-metal entities: Corner reliefs on RELIEF (under
  // Geometry), Hidden edges (forming tools' far side, HIDDEN), Up / down bend layers (under Bend lines), Boundary box;
  // all off by default, each one changes the file, DWG converts the same file.
  function rfJFRibbon(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return ((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).replace(/\s+/g, ' ').indexOf(label) >= 0; })[0]; }
  function rfJFLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); }); }
  function rfJFLayer(text, layer) { return new RegExp('\\n\\s*8\\s*\\r?\\n' + layer + '\\s*\\r?\\n').test(text); }
  function rfJFBox(key) { return D.querySelector('#pm input[data-key="' + key + '"]'); }
  var RFJF_PART = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
    'p.flange(1.5, [[3, 0.0598, 0], [3, 0.0598, 4]], { position: "inside" });\np.flange(1, [[0, 0.0598, 2]], { position: "inside", relief: "rect", reverse: true });\n' +
    'p.formingTool("dimple", [3, 0.0598, 2]);';
  step('rfJF: DXF/DWG Output ▸ Sheet metal: Corner reliefs / Hidden edges / Up-down bend layers / Boundary box in SolidWorks\' order, off by default; ticked they write RELIEF, HIDDEN, BEND_UP + BEND_DOWN, BOUNDARY; Up / down hides with Bend lines; DWG converts the file', async function () {
    var errs0 = errors.length, down = UI.download, saved = [];
    UI.download = function (name, data) { saved.push({ name: name, text: typeof data === 'string' ? data : null, bytes: data && data.byteLength }); };
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFJF_PART); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'part builds: ' + JSON.stringify(anvil.summary().errors));
      var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Sheet Metal'; })[0];
      tab.click(); await wait(10);
      var btn = rfJFRibbon('Flat to');
      assert(btn, 'Flat to DXF button');
      btn.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'PM ' + (UI.hasPM() && UI.pmTitle()));
      var L = rfJFLabels(), want = ['Geometry', 'Corner reliefs on layer RELIEF', 'Hidden edges', 'Bend lines', 'Up / down on BEND_UP / BEND_DOWN', 'Sketches', 'Forming tools', 'Boundary box', 'Notes (bend notes, blank size)'];
      var at = want.map(function (w) { return L.indexOf(w); });
      assert(at.every(function (x, i) { return x >= 0 && (i === 0 || x > at[i - 1]); }), 'entity order: ' + L.join(' | '));
      ['reliefLayer', 'hiddenEdges', 'bendSplit', 'boundaryBox'].forEach(function (k) { assert(rfJFBox(k) && !rfJFBox(k).checked, k + ' off by default'); });
      await pmAccept(); await wait(20);
      var plain = saved[saved.length - 1];
      assert(plain && plain.text && rfJFLayer(plain.text, 'BEND') && !rfJFLayer(plain.text, 'RELIEF') && !rfJFLayer(plain.text, 'HIDDEN') && !rfJFLayer(plain.text, 'BOUNDARY') && !rfJFLayer(plain.text, 'BEND_UP'), 'default file unchanged');
      // tick the four (labels clicked, as a user does)
      btn.click(); await wait(30);
      ['Corner reliefs on layer RELIEF', 'Hidden edges', 'Up / down on BEND_UP / BEND_DOWN', 'Boundary box'].forEach(function (w) {
        var lb = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim() === w; })[0];
        assert(lb, 'label ' + w);
        lb.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      await wait(10);
      ['reliefLayer', 'hiddenEdges', 'bendSplit', 'boundaryBox'].forEach(function (k) { assert(rfJFBox(k).checked, k + ' ticked'); });
      await pmAccept(); await wait(20);
      var all = saved[saved.length - 1];
      ['RELIEF', 'HIDDEN', 'BEND_UP', 'BEND_DOWN', 'BOUNDARY', 'OUTLINE', 'FORM'].forEach(function (n) { assert(rfJFLayer(all.text, n), n + ' written'); });
      assert(!rfJFLayer(all.text, 'BEND'), 'no plain BEND layer when split');
      // Bend lines off: the up / down row goes, no bend layer at all, FORM kept
      btn.click(); await wait(30);
      rfJFBox('bendLines').click(); await wait(20);
      assert(!rfJFBox('bendSplit'), 'Up / down hidden with Bend lines off');
      await pmAccept(); await wait(20);
      var nb = saved[saved.length - 1];
      assert(!rfJFLayer(nb.text, 'BEND') && !rfJFLayer(nb.text, 'BEND_UP') && !rfJFLayer(nb.text, 'BEND_DOWN') && rfJFLayer(nb.text, 'FORM'), 'Bend lines off');
      // anvil.dxfOutput takes the options; the R2000 file goes to DWG
      var r2 = anvil.dxfOutput({ export: 'sheet', version: 'R2000', boundaryBox: true, bendLayers: 'split', reliefLayer: true, hiddenEdges: true });
      assert(/AC1015/.test(r2) && rfJFLayer(r2, 'BOUNDARY') && rfJFLayer(r2, 'HIDDEN') && rfJFLayer(r2, 'RELIEF') && rfJFLayer(r2, 'BEND_DOWN'), 'anvil.dxfOutput options');
      var bytes = await UI.dxfToDwg(r2);
      assert(bytes && bytes.byteLength > 1000, 'DWG bytes ' + (bytes && bytes.byteLength));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return plain.text.length + ' / ' + all.text.length + ' bytes, DWG ' + bytes.byteLength;
    } finally { UI.download = down; if (UI.hasPM()) UI.pmCancel(); }
  });
