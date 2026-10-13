  // --- sketch-dxf (user report: File ▸ Save As ▸ DXF in a sketch of a part with no solid said "Nothing to export
  // yet") ---
  step('sketch-dxf: in a sketch of a part with no solid, Save As DXF opens DXF/DWG Output on Sketch; the DXF has the sketch\'s lines and true circles at full size, construction left out', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'rect', x: 0, y: 0, w: 100, h: 60 }, { t: 'circle', cx: 20, cy: 20, r: 8.75 }, { t: 'line', x1: 50, y1: -10, x2: 50, y2: 70, construction: true });
    UI.updateSketches();
    assert(!(UI.App.mesh && UI.App.mesh.triCount), 'no solid yet');
    UI.fileSaveAs();
    var sel = D.querySelector('#modal-body select');
    sel.value = 'dxf'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
    clickModalButton('Save'); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'Save As DXF opened the panel: ' + UI.pmTitle());
    assert(D.querySelector('#pm input[data-key="export:sketch"]').checked, 'Sketch is the export');
    assert(D.querySelector('#pm input[data-key="export:views"]').disabled, 'Views greyed without a solid');
    var name = pmField('Name').value;
    assert(/_Sketch1$/.test(name), 'file name names the sketch: ' + name);
    var dxf = anvil.dxfOutput({ export: 'sketch', sketch: f.id });
    var lines = (dxf.match(/\n0\nLINE\n/g) || []).length, circles = (dxf.match(/\n0\nCIRCLE\n/g) || []).length;
    assert(lines === 4 && circles === 1, 'rect as 4 LINEs, 1 CIRCLE, no centerline: ' + lines + ' / ' + circles);
    assert(/\n40\n8\.75\n/.test(dxf), 'circle radius 8.75 exact');
    assert(/\n2\nCONSTRUCTION\n/.test(anvil.dxfOutput({ export: 'sketch', sketch: f.id, construction: true })), 'construction on request');
    UI.pmCancel();
    // with a solid and no sketch open, Views stays the default
    await anvil.run('p.sketch("Top").rect(0, 0, 30, 20).extrude(10);'); await idle();
    UI.cmdDxfOutput();
    assert(D.querySelector('#pm input[data-key="export:views"]').checked && !D.querySelector('#pm input[data-key="export:sketch"]').disabled, 'Views default with a solid; Sketch available');
    UI.pmCancel();
    return lines + ' LINE, ' + circles + ' CIRCLE';
  });
  // --- end sketch-dxf ---

  step('no uncaught errors or console.error calls during the run', async function () {
    await idle();
    assert(errors.length === 0, errors.join('\n'));
  });

