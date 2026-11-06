  // --- rfJC (2026-11-05, lane smpm) --- the Edge-Flange and Hem PropertyManagers get lane rfIZ's options in SolidWorks'
  // places: Flange Length ▸ End condition Blind / Up To Vertex (vertex box, Normal to flange plane / Parallel to base
  // flange), Flange Position ▸ Tangent to Bend (90° and up only) and Offset, Custom Relief Type ▸ Tear and Use relief
  // ratio; Hem ▸ Miter Gap and Custom Relief Type. Each is set through the PM, built, and shown again by Edit Feature.
  var RFJC_T = 0.0598;
  var RFJC_PLATE = 'p.units("in");\np.sheet(' + RFJC_T + ', ' + RFJC_T + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();';
  var RFJC_LB = 'p.units("in");\np.sheet(' + RFJC_T + ', ' + RFJC_T + ', 0.5);\np.sketch("Top").polyline([[0, 0], [4, 0], [4, -2], [2, -2], [2, -3], [0, -3]], true).end().baseFlange();';
  function rfJCCheck(label) { var c = pmField(label); assert(c && c.type === 'checkbox', label + ' box'); return c; }
  function rfJCLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
  async function rfJCPart(code) {
    if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    await anvil.newPart(); await idle();
    await anvil.run(code); await idle();
    assert(!Object.keys(anvil.summary().errors).length, 'part: ' + JSON.stringify(anvil.summary().errors));
  }
  async function rfJCEdit(f) { UI.editFeature(f); await idle(); await wait(30); assert(UI.hasPM(), 'Edit Feature PM'); }
  step('rfJC: Edge-Flange ▸ End condition Up To Vertex hides Length / Measured from, shows the vertex box (active) and Normal to flange plane / Parallel to base flange; a vertex on the side flange\'s top, Parallel, ✓ builds; Edit Feature shows them; ✓ refused without a vertex', async function () {
    var errs0 = errors.length;
    await rfJCPart(RFJC_PLATE + '\np.flange(1.5, [[4, ' + RFJC_T + ', 1]], { position: "inside", lengthRef: "outer" });');
    // the side flange's top end at the back: the highest vertex with z = 2
    var top = null;
    UI.App.edges.forEach(function (e) { [e.a, e.b].forEach(function (q) { if (Math.abs(q[2] - 2) < 1e-6 && (!top || q[1] > top[1] + 1e-9)) top = q.slice(); }); });
    assert(top && top[1] > 1, 'side flange top vertex ' + JSON.stringify(top));
    UI.cmdEdgeFlange(); await wait(30);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([2, RFJC_T, 0]) }) !== false, 'edge pick');
    var ec = pmField('End condition');
    assert(ec && ec.tagName === 'SELECT' && Array.prototype.map.call(ec.options, function (o) { return o.textContent; }).join() === 'Blind,Up To Vertex', 'End condition list');
    setInput(ec, 'upToVertex'); await wait(10);
    assert(!pmField('Length') || pmField('Length') === pmField('End condition'), 'Length hidden');
    assert(!/Measured from/.test($('pm').textContent) && /Normal to flange plane/.test($('pm').textContent) && /Parallel to base flange/.test($('pm').textContent), 'vertex options shown');
    var box = D.querySelector('#pm .pm-pick.active');
    assert(box && /Select a vertex/.test(box.textContent), 'vertex box active');
    assert(UI.App.command.pickVertices(), 'vertex picks on');
    var ok0 = await UI.pmOK(); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'refused without a vertex');
    assert(UI.App.command.onPick({ kind: 'vertex', point: top, index: 0 }) !== false, 'vertex pick');
    assert(/Vertex<1>/.test($('pm').textContent) && !UI.App.command.pickVertices(), 'vertex taken, box no longer active');
    D.querySelector('#pm input[type=radio][value="parallel"]').click(); await wait(10);
    await pmAccept();
    var f = rfJCLast();
    assert(f.type === 'flange' && f.lengthEnd === 'upToVertex' && f.lengthVertexMode === 'parallel' && JSON.stringify(f.lengthVertex) === JSON.stringify(top) && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    assert(f.vxActive === undefined && f.useOffset === undefined && f.offset === undefined, 'no UI keys: ' + JSON.stringify(f));
    await rfJCEdit(f);
    assert(pmField('End condition').value === 'upToVertex' && D.querySelector('#pm input[type=radio][value="parallel"]').checked && /Vertex<1>/.test($('pm').textContent), 'Edit Feature shows Up To Vertex, Parallel, the vertex');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'flat ' + UI.flatSizeText(anvil.flat());
  });
  step('rfJC: Flange Position ▸ Tangent to Bend listed at 90° (not at 80°: a typed 80° moves it to Material Inside); Offset .1 (Blind) with Tangent to Bend builds; Edit Feature shows both', async function () {
    var errs0 = errors.length;
    await rfJCPart(RFJC_PLATE);
    UI.cmdEdgeFlange(); await wait(30);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([2, RFJC_T, 0]) }) !== false, 'edge pick');
    function vals() { return Array.prototype.map.call(pmField('Position').options, function (o) { return o.value; }); }
    assert(vals().indexOf('tangentToBend') >= 0, 'Tangent to Bend at 90°');
    setInput(pmField('Position'), 'tangentToBend'); await wait(10);
    setInput(pmField('Flange angle'), 80); await wait(10);
    assert(vals().indexOf('tangentToBend') < 0 && pmField('Position').value === 'inside', 'at 80°: no Tangent to Bend, Material Inside: ' + pmField('Position').value);
    setInput(pmField('Flange angle'), 90); await wait(10);
    setInput(pmField('Position'), 'tangentToBend'); await wait(10);
    assert(!pmField('Offset distance'), 'no distance before Offset');
    rfJCCheck('Offset').click(); await wait(10);
    assert(/Blind/.test(D.querySelector('#pm').textContent) && pmField('Offset distance'), 'Offset: Blind, distance');
    setInput(pmField('Offset distance'), 0.1); await wait(10);
    setInput(pmField('Length'), 1); await wait(10);
    await pmAccept();
    var f = rfJCLast();
    assert(f.position === 'tangentToBend' && f.offset && f.offset.end === 'blind' && f.offset.distance === 0.1 && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    await rfJCEdit(f);
    assert(pmField('Position').value === 'tangentToBend' && rfJCCheck('Offset').checked && +pmField('Offset distance').value === 0.1, 'Edit Feature shows Tangent to Bend and Offset .1');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'flat ' + UI.flatSizeText(anvil.flat());
  });
  step('rfJC: Custom Relief Type ▸ Tear hides the sizes; Rectangle ▸ Use relief ratio shows Ratio (hides width / depth) and ✓ stores reliefRatio .75; Edit Feature shows it', async function () {
    var errs0 = errors.length;
    await rfJCPart(RFJC_LB);
    UI.cmdEdgeFlange(); await wait(30);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([1, RFJC_T, 3]) }) !== false, 'edge pick');
    rfJCCheck('Custom relief type').click(); await wait(10);
    setInput(pmField('Relief type'), 'tear'); await wait(10);
    assert(!pmField('Use relief ratio') && !pmField('Relief width') && !pmField('Use default width'), 'Tear: no sizes');
    setInput(pmField('Relief type'), 'rect'); await wait(10);
    assert(pmField('Use default width') && !pmField('Ratio'), 'Rectangle: width / depth, no ratio');
    rfJCCheck('Use relief ratio').click(); await wait(10);
    assert(pmField('Ratio') && !pmField('Use default width'), 'ratio replaces the sizes');
    setInput(pmField('Ratio'), 0.75); await wait(10);
    await pmAccept();
    var f = rfJCLast();
    assert(f.relief === 'rect' && f.reliefRatio === 0.75 && f.reliefWidth == null && f.reliefDepth == null && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    await rfJCEdit(f);
    assert(rfJCCheck('Use relief ratio').checked && +pmField('Ratio').value === 0.75, 'Edit Feature shows the ratio');
    setInput(pmField('Relief type'), 'tear'); await wait(10);
    await pmAccept();
    f = K.findFeature(UI.App.model, f.id);
    assert(f.relief === 'tear' && f.reliefRatio === undefined && !UI.App.build.errors[f.id], 'tear: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'flat ' + UI.flatSizeText(anvil.flat());
  });
  step('rfJC: Hem ▸ Miter Gap (0.01 in to start) on two adjacent edges ✓ stores miter + miterGap .02 and builds; one edge stores no miter; the Hem\'s Custom Relief Type takes Obround with a ratio', async function () {
    var errs0 = errors.length;
    await rfJCPart(RFJC_PLATE);
    UI.cmdHem(); await wait(30);
    assert(UI.pmTitle() === 'Hem', 'Hem PM');
    var mg = pmField('Miter gap');
    assert(mg && +mg.value === 0.01, 'Miter gap 0.01: ' + (mg && mg.value));
    assert(rfJCCheck('Custom relief type') && !rfJCCheck('Custom relief type').checked, 'Custom Relief Type on the Hem');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([4, RFJC_T, 1]) }) !== false, 'edge 1');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([2, RFJC_T, 2]) }) !== false, 'edge 2');
    setInput(pmField('Miter gap'), 0.02); await wait(10);
    await pmAccept();
    var f = rfJCLast();
    assert(f.hem && f.miter === true && f.miterGap === 0.02 && f.edges.length === 2 && !UI.App.build.errors[f.id], 'mitred hems: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    await rfJCEdit(f);
    assert(+pmField('Miter gap').value === 0.02, 'Edit Feature shows the gap');
    UI.pmCancel(); await idle();
    await rfJCPart(RFJC_LB);
    UI.cmdHem(); await wait(30);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([1, RFJC_T, 3]) }) !== false, 'one edge');
    rfJCCheck('Custom relief type').click(); await wait(10);
    setInput(pmField('Relief type'), 'obround'); await wait(10);
    rfJCCheck('Use relief ratio').click(); await wait(10);
    setInput(pmField('Ratio'), 0.5); await wait(10);
    await pmAccept();
    f = rfJCLast();
    assert(f.hem && f.miter === undefined && f.relief === 'obround' && f.reliefRatio === 0.5 && !UI.App.build.errors[f.id], 'hem relief: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'flat ' + UI.flatSizeText(anvil.flat());
  });
