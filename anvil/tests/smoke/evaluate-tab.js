  // ---- Evaluate tab: Check, Zebra Stripes, Section Properties, Draft Analysis, Clearance Verification, Interference
  //      Detection on selected components (ui-evaluate.js, run cloud-2026-09-25n)
  function evalBtn(re) {
    UI.App.ribbonTab = 'Evaluate'; UI.refreshRibbon();
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return re.test(x.textContent.replace(/\s+/g, ' ')); })[0];
    assert(b, 'Evaluate ribbon button ' + re);
    assert(!b.disabled, re + ' is enabled');
    return b;
  }
  function pmMsg() { var m = D.querySelector('#pm .pm-msg'); return m ? m.textContent : ''; }
  step('evaluate: the part Evaluate tab has Section Properties, Check, Zebra Stripes, Draft Analysis and Clearance Verification enabled; Tools ▸ Evaluate lists them', async function () {
    await anvil.newPart('Eval');
    await idle();
    [/Section Properties/, /^Check$/, /Zebra Stripes/, /Draft Analysis/, /Clearance Verification/].forEach(function (re) { evalBtn(re); });
    var rows = menuRows('Evaluate ▸');
    if (UI.closeMenus) UI.closeMenus();
    assert(rows.length >= 5 && rows.some(function (r) { return /Check/.test(r.text); }) && rows.some(function (r) { return /Section Properties/.test(r.text); }), 'Tools ▸ Evaluate rows: ' + rows.map(function (r) { return r.text; }).join(' | '));
  });
  step('evaluate: Check on a clean box says No problems; on a body with a missing face it lists 4 open edges, draws them, and clicking a result shows that edge alone', async function () {
    await anvil.run('p.box(10, 10, 10);');
    await idle();
    evalBtn(/^Check$/).click();
    assert(UI.hasPM() && /No problems/.test(pmMsg()), 'clean: ' + pmMsg());
    assert(D.querySelector('#pm .chk-none'), 'No problems found row');
    await pmAccept();
    assert(anvil.check().ok === true, 'anvil.check() on the box');
    // a body with one face removed (open box), put in place of the build's bodies
    var open = W.CSG.fromPolygons(UI.App.build.body.polygons.filter(function (p) { return p.plane.normal.y < 0.5; }));
    var saved = UI.App.build.bodies;
    UI.App.build.bodies = [open];
    try {
      evalBtn(/^Check$/).click();
      assert(/4 problems found/.test(pmMsg()), 'message: ' + pmMsg());
      var rows = D.querySelectorAll('#pm .chk-row');
      assert(rows.length === 4 && /Open edge 1/.test(rows[0].textContent), 'rows ' + rows.length);
      assert(/Open edges\s*4/.test($('pm').textContent), 'summary counts');
      var all = UI.groups.preview.children.length;
      assert(all >= 8, 'every edge drawn with a marker: ' + all);
      rows[2].click();
      assert(D.querySelector('#pm .chk-row.selected[data-i="2"]'), 'row selected');
      assert(UI.groups.preview.children.length === 2, 'one edge + its marker, got ' + UI.groups.preview.children.length);
      assert(/Open edge 3/.test(statusText()), 'status ' + statusText());
      D.querySelector('#pm .chk-row[data-i="2"]').click();
      assert(UI.groups.preview.children.length === all, 'click again shows all');
      await pmAccept();
      assert(UI.groups.preview.children.length === 0, 'cleared on close');
    } finally { UI.App.build.bodies = saved; }
  });
  step('evaluate: Section Properties of the selected top face (40 × 20: area 800, Ixx 26666.667, Iyy 106666.667), then of Sketch1 picked in the FeatureManager; centroid and principal axes drawn; anvil.sectionProperties', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).end().extrude(7);');
    await idle();
    UI.App.sel = { kind: 'face', index: faceWithNormal([0, 0, 1]) }; UI.updateHighlights();
    evalBtn(/Section Properties/).click();
    assert(UI.hasPM() && /Section Properties/.test($('pm').textContent), 'PM');
    var r = UI.evaluate.section();
    near(r.area, 800, 1e-9, 'area'); near(r.I1, 106666.667, 1e-3, 'I1'); near(r.I2, 26666.667, 1e-3, 'I2');
    assert(/Area\s*800 mm²/.test($('pm').textContent), 'area row: ' + $('pm').textContent.slice(0, 200));
    assert(UI.groups.preview.children.length === 3, 'centroid + two axes: ' + UI.groups.preview.children.length);
    // selecting the sketch updates the open PM
    UI.App.sel = { kind: 'feature', id: UI.App.model.features[0].id };
    UI.onSelectionChanged();
    r = UI.evaluate.section();
    assert(r.source === 'sketch' && /Sketch1/.test($('pm').textContent), 'sketch source');
    near(r.Ixx, 40 * 8000 / 12, 1e-6, 'Ixx'); near(r.Iyy, 20 * 64000 / 12, 1e-6, 'Iyy'); near(r.Ixy, 0, 1e-6, 'Ixy');
    await pmAccept();
    var api = anvil.sectionProperties('Sketch1');
    near(api.area, 800, 1e-9, 'api area'); near(api.centroid[0], 20, 1e-9, 'api cx');
    near(anvil.sectionProperties(faceWithNormal([0, 0, 1])).area, 800, 1e-9, 'api face');
  });
  step('evaluate: Zebra Stripes turns on a stripe shader over the body (PM: number of stripes, direction, sharpness), stays on after OK and after a rebuild, and the ribbon button toggles it off', async function () {
    await anvil.run('p.cylinder(10, 30, { axis: "z" });');
    await idle();
    evalBtn(/Zebra Stripes/).click();
    assert(UI.hasPM() && /Zebra Stripes/.test($('pm').textContent), 'PM');
    var st = UI.evaluate.zebra.state();
    assert(st.on && st.drawn && UI.groups.analysis.children.length === 1, 'drawn');
    var mat = UI.groups.analysis.children[0].material;
    assert(mat.type === 'ShaderMaterial' && mat.uniforms.stripes.value === 16, 'shader');
    setInput(pmField('Number of stripes'), '24');
    setInput(pmField('Direction'), 'vertical');
    assert(mat.uniforms.stripes.value === 24 && mat.uniforms.axis.value.x === 1, 'uniforms follow the PM');
    await pmAccept();
    assert(UI.evaluate.zebra.state().on && UI.groups.analysis.children.length === 1, 'still on after OK');
    assert(evalBtn(/Zebra Stripes/).classList.contains('active'), 'ribbon button pressed');
    await anvil.append('p.sketch("Front", 30).circle(0, 0, 4).extrude(10);');
    await idle();
    var g = UI.groups.analysis.children[0].geometry;
    assert(g.getAttribute('position').count === UI.App.mesh.triCount * 3, 'overlay follows the rebuilt mesh');
    evalBtn(/Zebra Stripes/).click();
    assert(!UI.evaluate.zebra.state().on && UI.groups.analysis.children.length === 0 && !UI.hasPM(), 'toggled off');
    assert(anvil.zebra(true, { stripes: 8 }).on && anvil.zebra(false).on === false, 'anvil.zebra');
  });
  step('evaluate: Draft Analysis of a 5° tapered extrude, pull +Z: 5 positive / 1 negative at 3°, 4 require draft at 6° (face colours in the overlay); a picked face sets the pull direction; closing removes the colours', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).end().extrude(30, { draft: 5 });');
    await idle();
    evalBtn(/Draft Analysis/).click();
    assert(UI.hasPM() && /Draft Analysis/.test($('pm').textContent), 'PM');
    setInput(pmField('Direction of Pull'), '+z');
    setInput(pmField('Draft angle'), '3');
    var c = UI.evaluate.draftCounts();
    assert(c.positive === 5 && c.negative === 1 && c.requires === 0, JSON.stringify(c));
    var leg = D.querySelector('#pm .ev-leg[data-cls="positive"] b');
    assert(leg && leg.textContent === '5', 'legend ' + (leg && leg.textContent));
    assert(UI.evaluate.display() === 'draft' && UI.groups.analysis.children.length === 1, 'overlay');
    var col = UI.groups.analysis.children[0].geometry.getAttribute('color'), side = UI.App.mesh.faces.filter(function (f) { return Math.abs(f.normal[2]) < 0.5; })[0];
    assert(col.getY(side.start * 3) > 0.6 && col.getX(side.start * 3) < 0.4, 'side face green');
    setInput(pmField('Draft angle'), '6');
    c = UI.evaluate.draftCounts();
    assert(c.requires === 4 && c.positive === 1 && c.negative === 1, 'at 6°: ' + JSON.stringify(c));
    near(UI.evaluate.draftFace(UI.App.mesh.faces.indexOf(side)).angle, 5, 1e-9, 'face angle');
    // pick the bottom face: the pull direction becomes its normal (−Z)
    UI.App.command.onPick({ kind: 'face', index: faceWithNormal([0, 0, -1]) });
    c = UI.evaluate.draftCounts();
    assert(pmField('Direction of Pull').value === 'face' && c.negative === 1 && c.positive === 1 && c.requires === 4, 'picked: ' + JSON.stringify(c));
    await pmAccept();
    assert(UI.groups.analysis.children.length === 0 && UI.evaluate.display() === null, 'colours removed');
    var api = anvil.draftAnalysis([0, 0, 1], 3);
    assert(api.counts.positive === 5 && api.faces.length === UI.App.mesh.faces.length, 'anvil.draftAnalysis');
  });
  step('evaluate: Clearance Verification between two bodies (10 apart): result row, closest points drawn; a 12 minimum marks it below minimum; clicking the other body in the graphics area edits the selection', async function () {
    await anvil.run('p.box(10, 10, 10); p.sketch("Front").rect(20, 3, 10, 5).end().extrude(5, { merge: false });');
    await idle();
    evalBtn(/Clearance Verification/).click();
    assert(UI.hasPM() && /Clearance Verification/.test($('pm').textContent), 'PM');
    var rows = D.querySelectorAll('#pm .clr-row');
    assert(rows.length === 1 && /10 mm/.test(rows[0].textContent), 'row: ' + (rows[0] && rows[0].textContent));
    assert(UI.groups.preview.children.length === 3, 'two points + line: ' + UI.groups.preview.children.length);
    setInput(pmField('Minimum acceptable clearance'), '12');
    assert(/1 of 1 clearance is below 12/.test(pmMsg()) && D.querySelector('#pm .clr-row.bad'), 'below minimum: ' + pmMsg());
    // click body 1 in the graphics area: it becomes the selection (checked against the rest)
    var f1 = UI.App.mesh.faces.findIndex(function (f) { return (f.body || 0) === 1; });
    UI.App.command.onPick({ kind: 'face', index: f1 });
    var pick = D.querySelector('#pm .pm-pick');
    assert(pick.classList.contains('filled') && pick.textContent.trim() === UI.bodyName(1) && UI.evaluate.clearanceSession().results().checked === 1, 'selection shown: ' + pick.textContent);
    assert(UI.App.command.faceList.length > 0, 'selected body highlighted');
    await pmAccept();
    var api = anvil.clearance([], 0);
    near(api.minimum, 10, 1e-9, 'anvil.clearance');
  });
  step('evaluate: assembly Interference Detection limited to selected components (Pin<2> selected: only Base<1> · Pin<2>); Selected items + clicking Block<1> gives no interference; Clearance Verification on components; anvil.interferenceOf', async function () {
    await anvil.run(exByName('Interference check').code);
    await idle();
    UI.selectComponent('Pin<2>');
    evalBtn(/Interference Detection/).click();
    assert(UI.hasPM() && /Interference Detection/.test($('pm').textContent), 'PM');
    var rows = D.querySelectorAll('#pm .intf-row');
    assert(rows.length === 1 && /Base<1> · Pin<2>/.test(rows[0].textContent), 'rows: ' + Array.prototype.map.call(rows, rowText).join(' | '));
    assert(/1 interference.*3 pairs checked among 1 selected component/.test(pmMsg()) || /1 interference/.test(pmMsg()), 'message: ' + pmMsg());
    assert(/Pin<2>/.test(D.querySelector('#pm .pm-pick').textContent), 'selection box');
    var ses = UI.interferenceSession();
    var blk = UI.componentIndex('Block<1>');
    UI.App.command.onPick({ kind: 'face', index: UI.App.mesh.faces.findIndex(function (f) { return (f.body || 0) === blk; }) });
    assert(ses.selected().length === 2 && D.querySelector('#pm .intf-none') && /No interferences/.test(pmMsg()), 'Block + Pin<2>: ' + pmMsg());
    clickPmButton('Entire assembly');
    assert(D.querySelectorAll('#pm .intf-row').length === 2, 'entire assembly');
    await pmAccept();
    var r = anvil.interferenceOf(['Base<1>', 'Block<1>']);
    assert(r.count === 1 && Math.abs(r.volume - 2000) < 1e-6, 'anvil.interferenceOf ' + JSON.stringify(r));
    assert(anvil.interference().count === 2, 'anvil.interference() still checks everything');
    UI.App.sel = null;
    evalBtn(/Clearance Verification/).click();
    var cr = UI.evaluate.clearanceSession().results();
    assert(cr.checked === 6 && cr.results.filter(function (x) { return x.interfering; }).length === 2, 'clearance on components: ' + cr.checked);
    await pmAccept();
  });
  step('evaluate: Interference Detection and Clearance Verification on pattern / mirror instances of an exploded assembly use the collapsed positions (Block<2> exploded 50 up still interferes; results drawn on the exploded components)', async function () {
    await anvil.run([
      'a.name("Patterned").units("mm");',
      'var base = a.insert({ script: \'p.name("Base"); p.box(100, 60, 10);\' }, { fixed: true });',
      'var blk = a.insert({ script: \'p.name("Block"); p.box(20, 20, 20);\' }, { position: [10, 10, -5], fixed: true });',
      'a.linearPattern([blk], { direction: { axis: "x" }, spacing: 15, count: 2 });',
      'a.mirrorComponents([blk], { plane: { plane: "Front" }, oppositeHand: true });',
      'a.explode(["Block<2>"], "y", 50);',
      'a.exploded();'
    ].join('\n'));
    await idle();
    var names = anvil.components().map(function (c) { return c.name; });
    assert(names.join() === 'Base<1>,Block<1>,Block<2>,Block<3>', names.join());
    assert(UI.App.build.explode, 'shown exploded');
    // collapsed: Block<1> ∩ Block<2> 5 × 20 × 20, Block<1> ∩ Block<3> (opposite hand, z −15..5) 20 × 20 × 10, Block<2> ∩ Block<3> 5 × 20 × 10
    var api = anvil.interference();
    assert(api.count === 3, 'anvil.interference() collapsed: ' + JSON.stringify(api.pairs));
    near(api.volume, 7000, 1e-6, 'total');
    UI.selectComponent('Block<2>');
    evalBtn(/Interference Detection/).click();
    var rows = D.querySelectorAll('#pm .intf-row');
    assert(rows.length === 2 && /Block<1> · Block<2>/.test(rows[0].textContent) && /Block<2> · Block<3>/.test(rows[1].textContent), 'rows: ' + Array.prototype.map.call(rows, rowText).join(' | '));
    assert(/collapsed/.test(pmMsg()), 'message: ' + pmMsg());
    var ys = UI.groups.preview.children.map(function (o) { return o.position.y; }).sort();
    assert(ys.join() === '0,50', 'common volumes drawn on the first component as shown: ' + ys.join());
    await pmAccept();
    var r = anvil.interferenceOf(['Block<1>', 'Block<3>']);
    assert(r.count === 1, 'mirror instance'); near(r.volume, 4000, 1e-6, 'Block<1> ∩ Block<3>');
    // Clearance: Block<2> against the rest, collapsed (touching the base: 0, not interfering)
    UI.App.sel = null;
    evalBtn(/Clearance Verification/).click();
    var ses = UI.evaluate.clearanceSession();
    var res = ses.select([UI.componentIndex('Block<2>')]);
    var toBase = res.results.filter(function (x) { return x.aName === 'Base<1>' || x.bName === 'Base<1>'; })[0];
    assert(toBase && toBase.distance === 0 && !toBase.interfering, 'Block<2> on the base, collapsed: ' + JSON.stringify(toBase && toBase.distance));
    assert(res.results.filter(function (x) { return x.interfering; }).length === 2, 'two interfering');
    var i = res.results.indexOf(toBase);
    ses.show(i);
    var pys = UI.groups.preview.children.filter(function (o) { return o.type === 'Mesh'; }).map(function (o) { return o.position.y; }).sort(function (a, b) { return a - b; });
    assert(pys.length === 2 && Math.abs(pys[0] - 10) < 1e-6 && Math.abs(pys[1] - 60) < 1e-6, 'closest points on the base top and the exploded block bottom: ' + pys.join());
    assert(/collapsed/.test(pmMsg()), 'clearance message: ' + pmMsg());
    await pmAccept();
    near(anvil.clearance(['Block<2>', 'Base<1>'], 0).minimum, 0, 1e-12, 'anvil.clearance collapsed');
  });
