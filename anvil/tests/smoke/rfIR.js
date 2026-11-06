  // --- rfIR (2026-11-05, lane drawaudit) --- in the app: File ▸ Save Drawing as DXF (R2000) and Save as DWG write a
  // section's hatching as HATCH entities (one per hatched region, ANSI38 for 6061) instead of a LINE per hatch line;
  // R12 keeps the lines. A Hole Table added with no position stays off the title block.
  var IR_PART = 'p.name("IRBlock").units("mm");\np.material("6061");\np.box(100, 40, 60);\np.sketch("Top", 40).circle(30, -30, 8).circle(70, -30, 8).cut(20, { reverse: true });';
  function rfIRCount(dxf, type, layer) {
    var L = dxf.split(/\r?\n/), n = 0;
    for (var i = 0; i + 1 < L.length; i += 2) {
      if (L[i].trim() !== '0' || L[i + 1].trim() !== type) continue;
      for (var j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2) if (L[j].trim() === '8') { if (!layer || L[j + 1].trim() === layer) n++; break; }
    }
    return n;
  }
  step('rfIR: Save Drawing as DXF R2000 / DWG: a section\'s hatching is one HATCH entity (ANSI38), not hundreds of LINEs; R12 keeps LINEs; the files are smaller', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(IR_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    var T = anvil.drawing.summary().views.filter(function (v) { return v.orient === 'Top'; })[0];
    await anvil.drawing.sectionView(T.id, { axis: 'h', at: -30, sign: 1 }); await UI.drawing.ready(); await wait(30);
    var sec = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    var sh = UI.drawing.state.sheet, w = sh.views.filter(function (x) { return x.view.id === sec.id; })[0], L = w.layer;
    var nh = sh.prims.filter(function (p) { return p.k === 'line' && p.style === 'hatch' && p.layer === L; }).length;
    assert(nh > 100, 'hatch lines on the sheet ' + nh);
    dwMenu('Save Drawing as DXF');
    var sel = D.getElementById('dw-dxf-version');
    sel.value = 'R2000'; sel.dispatchEvent(new W.Event('change'));
    var d2k = D.querySelector('#modal textarea').value;
    assert(d2k.indexOf('AC1015') > 0 && rfIRCount(d2k, 'HATCH', L) === w.hatches.length, 'HATCH on ' + L + ': ' + rfIRCount(d2k, 'HATCH', L) + ' for ' + w.hatches.length + ' regions');
    assert(/\n0\nHATCH\n[\s\S]*?\n2\nANSI38\n/.test(d2k), 'ANSI38 pattern');
    var lines2k = rfIRCount(d2k, 'LINE', L);
    sel = D.getElementById('dw-dxf-version'); sel.value = 'R12'; sel.dispatchEvent(new W.Event('change'));
    var d12 = D.querySelector('#modal textarea').value;
    assert(d12.indexOf('AC1009') > 0 && d12.indexOf('\nHATCH\n') < 0 && rfIRCount(d12, 'LINE', L) >= lines2k + nh, 'R12: LINEs ' + rfIRCount(d12, 'LINE', L) + ' (R2000 ' + lines2k + ' + hatch ' + nh + ')');
    clickModalButton('Close');
    var plain = anvil.drawing.dxf({ version: 'R2000' });
    assert(d2k.length < plain.length * 0.6, 'R2000 ' + d2k.length + ' bytes vs ' + plain.length + ' with LINEs');
    // Save as DWG converts this same R2000 text (saveDWG: toDXF with hatch: true -> UI.dxfToDwg, dwg-writer.js)
    var bytes = await UI.dxfToDwg(d2k), big = await UI.dxfToDwg(plain);
    assert(bytes && bytes.byteLength > 1000 && bytes.byteLength < big.byteLength, 'DWG ' + (bytes && bytes.byteLength) + ' vs ' + (big && big.byteLength) + ' with LINEs');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return nh + ' hatch lines -> ' + rfIRCount(d2k, 'HATCH', L) + ' HATCH; R2000 ' + plain.length + ' -> ' + d2k.length + ' bytes; DWG ' + big.byteLength + ' -> ' + bytes.byteLength;
  });
