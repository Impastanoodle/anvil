  // ---- dxf-import (ui-sketch-import.js): DXF/DWG Import into a sketch, File ▸ Open of a .dxf, Check Sketch for
  // Feature and Repair Sketch, driven through their PropertyManagers
  // the acceptance plate: a 4 × 2 in open LWPOLYLINE with an R0.5 corner (bulge) and a 0.0003 in gap, a Ø0.5 hole, the
  // bottom edge again as a LINE, a block circle (INSERT scaled 2, turned 90°: Ø0.4 at 2.5, 1.5) and a TEXT
  function dxiPlateText() {
    var b = String(Math.tan(Math.PI / 8));
    return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'HOLE', '70', '0', '10', '0.0', '20', '0.0', '30', '0.0',
      '0', 'CIRCLE', '8', '0', '10', '0.25', '20', '0.0', '30', '0.0', '40', '0.1', '0', 'ENDBLK', '8', '0', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LWPOLYLINE', '8', 'CUT', '90', '6', '70', '0', '10', '0', '20', '0', '10', '4', '20', '0', '10', '4', '20', '1.5', '42', b,
      '10', '3.5', '20', '2', '10', '0', '20', '2', '10', '0', '20', '0.0003',
      '0', 'CIRCLE', '8', 'CUT', '10', '1', '20', '1', '30', '0', '40', '0.25',
      '0', 'LINE', '8', 'CUT', '10', '0', '20', '0', '30', '0', '11', '4', '21', '0', '31', '0',
      '0', 'INSERT', '8', 'CUT', '2', 'HOLE', '10', '2.5', '20', '1', '30', '0', '41', '2', '42', '2', '50', '90',
      '0', 'TEXT', '8', 'CUT', '10', '0', '20', '0', '40', '0.1', '1', 'PART 1',
      '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
  }
  // the plate's area in in² (outline less the corner, less both holes)
  var DXI_AREA = 8 - (0.25 - Math.PI * 0.0625) - Math.PI * (0.0625 + 0.04);
  function dxiGroups() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-group h4'), function (h) { return h.textContent.replace(/^[▾▸]/, '').trim(); }); }
  function dxiLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); }); }
  function dxiRels(f) { return (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  step('dxf-import: UI.importDXFText on a new part opens DXF/DWG Import (Units, Layers, Position, Options) on a new Top Plane sketch with the repaired preview; ✓ adds 7 entities, the block instance\'s insertion point (rfAZ: blocks come in as blocks) and the TEXT (as Sketch Text) as one undo step with Coincident relations, and Extruded Boss of the closed profile has the plate\'s exact volume', async function () {
    need(UI, 'importDXFText'); need(UI, 'cmdInsertDXF'); need(UI, 'cmdCheckSketch'); need(UI, 'cmdRepairSketch');
    await anvil.newPart(); await idle();
    var s = UI.App.model.units === 'in' ? 1 : 25.4;
    var v = UI.importDXFText(dxiPlateText(), { name: 'plate.dxf' });
    assert(v && UI.pmTitle() === 'DXF/DWG Import' && UI.App.mode === 'sketch', 'PM ' + UI.pmTitle() + ' in ' + UI.App.mode);
    assert(dxiGroups().join() === 'Units,Layers,Position,Options', 'groups ' + dxiGroups());
    var labels = dxiLabels();
    ['File units', 'Import as', 'CUT (10)', 'Lower-left corner at the origin', 'Center on the origin', 'X offset', 'Y offset', 'Rotation', 'Merge points closer than', 'Repair after import', 'Add Coincident relations', 'Import blocks as blocks'].forEach(function (t) { assert(labels.indexOf(t) >= 0, 'no "' + t + '" in ' + labels.join(' | ')); });
    var f = activeSketch();
    assert(f && f.plane && f.plane.ref === 'Top' && f.entities.length === 0, 'a new sketch on the Top Plane: ' + JSON.stringify(f && f.plane));
    assert(UI.App.tempEntities.length === 9 && /1 gap closed, 1 duplicate merged/.test($('pm').textContent) && /1 text as Etch Sketch Text/.test($('pm').textContent) && /1 block instance of 1 block/.test($('pm').textContent), 'preview ' + UI.App.tempEntities.length + ': ' + D.querySelector('#pm .pm-msg').textContent);
    // a layer turned off empties the preview and greys ✓
    D.querySelector('#pm input[data-key="L0"]').click();
    assert(UI.App.tempEntities.length === 0 && D.querySelector('#pm .pm-ok').classList.contains('disabled'), 'layer off');
    D.querySelector('#pm input[data-key="L0"]').click();   // the PropertyManager was drawn again
    assert(UI.App.tempEntities.length === 9, 'layer back on');
    var u0 = UI.App.undo.length;
    await pmAccept();
    assert(!UI.hasPM() && f.entities.length === 9 && UI.App.undo.length === u0 + 1 && UI.App.tempEntities.length === 0, 'accepted: ' + f.entities.length + ' entities, ' + (UI.App.undo.length - u0) + ' undo steps');
    assert(dxiRels(f).filter(function (r) { return /^coincident:/.test(r); }).length === 5, 'Coincident relations: ' + dxiRels(f).join(' '));
    var bc = f.entities.filter(function (e) { return e.t === 'circle' && Math.abs(e.r - 0.2 * s) < 1e-9; })[0];
    assert(bc && Math.abs(bc.cx - 2.5 * s) < 1e-9 && Math.abs(bc.cy - 1.5 * s) < 1e-9 && bc.blk != null, 'block circle ' + JSON.stringify(bc));
    assert(f.blocks && f.blocks.HOLE && K.blockInstances(f).length === 1, 'a HOLE block instance: ' + JSON.stringify(f.blocks));
    assert(/Imported 9 entities from plate\.dxf \(5 Coincident relations, 1 text, 1 block instance\)\. Check Sketch: no problems found/.test($('status-msg').textContent), 'status: ' + $('status-msg').textContent);
    var sid = UI.App.activeSketch;
    await UI.exitSketch(); await idle();
    UI.App.sel = { kind: 'feature', id: sid };
    UI.cmdExtrude(false); setInput(pmNumber(0), 0.25 * s); await pmAccept();
    var want = DXI_AREA * s * s * 0.25 * s;
    near(anvil.summary().volume, want, 1e-3 * want, 'volume');
    return 'volume ' + anvil.summary().volume.toFixed(4) + ' (' + want.toFixed(4) + ')';
  });
  step('dxf-import: Check Sketch for Feature lists the gap, the duplicate and the shared endpoint with markers (Next / Previous walk them); Repair Sketch shows each option\'s count, ✓ fixes both in one undo step keeping the other relations (one on the duplicate goes), and Check finds nothing; Undo brings the problems back', async function () {
    await anvil.newPart(); await idle();
    UI.importDXFText(dxiPlateText(), { name: 'plate.dxf', repair: false, tol: 0, ok: true, blocks: false }); await idle();
    var f = activeSketch();
    assert(f.entities.length === 9 && f.entities[8].t === 'text', 'imported as drawn: ' + f.entities.length);
    f.rels = (f.rels || []).concat([{ type: 'horizontal', refs: ['3'] }, { type: 'horizontal', refs: ['6'] }]);
    var iss = UI.cmdCheckSketch();
    assert(UI.pmTitle() === 'Check Sketch for Feature' && iss.map(function (x) { return x.type; }).sort().join() === 'branch,duplicate,gap', 'issues ' + iss.map(function (x) { return x.msg; }).join(' | '));
    assert(/1 open contour, 1 gap < [\d.]+ (in|mm), 1 shared endpoint, 1 duplicate/.test(D.querySelector('#pm .pm-msg').textContent), 'summary ' + D.querySelector('#pm .pm-msg').textContent);
    var mk = UI.sketchCheckMarks();
    assert(mk && mk.list.length === 3 && mk.cur === -1 && D.querySelectorAll('#dim-layer .dxi-mark').length === 3, 'markers ' + JSON.stringify(mk));
    clickPmButton('Next'); assert(UI.sketchCheckMarks().cur === 0 && D.querySelectorAll('#dim-layer .dxi-mark.cur').length === 1, 'Next');
    clickPmButton('Next'); assert(UI.sketchCheckMarks().cur === 1, 'Next again');
    clickPmButton('Previous'); clickPmButton('Previous'); assert(UI.sketchCheckMarks().cur === 2, 'Previous wraps to the last');
    clickPmButton('Repair Sketch…');
    assert(UI.pmTitle() === 'Repair Sketch' && D.querySelectorAll('#dim-layer .dxi-mark').length === 2, 'Repair Sketch with two fix markers');
    var labels = dxiLabels();
    ['Close gaps (1)', 'Merge overlapping / duplicate entities (1)', 'Join collinear lines and co-radial arcs (0)', 'Remove zero-length / tiny entities (below tolerance) (0)', 'Split at crossings'].forEach(function (t) { assert(labels.indexOf(t) >= 0, 'no "' + t + '" in ' + labels.join(' | ')); });
    var u0 = UI.App.undo.length;
    await pmAccept();
    f = activeSketch();
    assert(f.entities.length === 8 && UI.App.undo.length === u0 + 1 && !D.querySelectorAll('#dim-layer .dxi-mark').length, 'repaired: ' + f.entities.length);
    var rels = dxiRels(f);
    assert(rels.indexOf('horizontal:3') >= 0 && !rels.some(function (r) { return /:6$|,6\.|:6\./.test(r); }) && rels.indexOf('coincident:0.p1,4.p2') >= 0, 'relations ' + rels.join(' '));
    assert(!UI.cmdCheckSketch().length && /No problems found/.test(D.querySelector('#pm .pm-msg').textContent), 'checked again: ' + D.querySelector('#pm .pm-msg').textContent);
    UI.pmCancel();
    UI.undo(); await idle();
    assert(activeSketch().entities.length === 9, 'undo: ' + activeSketch().entities.length);
    UI.redo(); await idle();
    assert(activeSketch().entities.length === 8, 'redo: ' + activeSketch().entities.length);
    await UI.exitSketch(true); await idle();
    return rels.length + ' relations kept';
  });
  step('dxf-import: File ▸ Open of a .dxf (UI.openFileData) makes a new part named after the file with the DXF in Sketch1 on the Top Plane, the import PropertyManager open; the Sketch tab has Insert DXF, Check Sketch for Feature and Repair Sketch', async function () {
    await UI.openFileData('Bracket-101.dxf', new W.TextEncoder().encode(dxiPlateText()).buffer); await idle();
    var f = activeSketch();
    assert(UI.App.model.name === 'Bracket-101' && UI.pmTitle() === 'DXF/DWG Import' && f && f.name === 'Sketch1' && f.plane.ref === 'Top', 'opened: ' + UI.App.model.name + ' / ' + UI.pmTitle() + ' / ' + (f && f.name));
    await pmAccept();
    assert(activeSketch().entities.length === 9, 'entities (the block\'s insertion point too) ' + activeSketch().entities.length);
    await UI.exitSketch(); await idle();
    UI.setRibbonTab('Sketch');
    var txt = $('ribbon-buttons').textContent.replace(/\s+/g, ' ');
    assert(/Insert DXF/.test(txt) && /Check Sketch for Feature/.test(txt) && /Repair Sketch/.test(txt), 'ribbon: ' + txt.slice(0, 400));
    UI.setRibbonTab('Features');
    return UI.App.model.name;
  });
  step('dxf-import: DXF layers become sketch layers: a CUT 2 × 1 rectangle and an ETCH circle come in on their layers, ETCH takes the preset (no solid), and Extruded Boss makes the full plate with no hole', async function () {
    await anvil.newPart(); await idle();
    var s = UI.App.model.units === 'in' ? 1 : 25.4;
    function ln(x1, y1, x2, y2) { return ['0', 'LINE', '8', 'CUT', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)]; }
    var txt = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES']
      .concat(ln(0, 0, 2, 0), ln(2, 0, 2, 1), ln(2, 1, 0, 1), ln(0, 1, 0, 0), ['0', 'CIRCLE', '8', 'ETCH', '62', '3', '10', '1', '20', '0.5', '40', '0.2'], ['0', 'ENDSEC', '0', 'EOF']).join('\n');
    UI.importDXFText(txt, { name: 'etch.dxf', ok: true }); await idle();
    var f = activeSketch(), byName = {};
    (f.layers || []).forEach(function (l) { byName[l.name] = l; });
    assert(byName.ETCH && byName.ETCH.noProfile && byName.CUT && !byName.CUT.noProfile, 'layers ' + JSON.stringify(f.layers));
    assert(f.entities.filter(function (e) { return e.layer === 'ETCH'; }).length === 1 && f.entities.filter(function (e) { return e.layer === 'CUT'; }).length === 4, 'entity layers ' + JSON.stringify(f.entities.map(function (e) { return e.layer; })));
    var sid = UI.App.activeSketch;
    await UI.exitSketch(); await idle();
    UI.App.sel = { kind: 'feature', id: sid };
    UI.cmdExtrude(false); setInput(pmNumber(0), 0.1 * s); await pmAccept();
    var want = 2 * s * 1 * s * 0.1 * s;
    near(anvil.summary().volume, want, 1e-6 * want, 'volume (the ETCH circle cuts nothing)');
    return 'layers ' + f.layers.map(function (l) { return l.name; }).join(', ');
  });
  // --- end dxf-import ---
