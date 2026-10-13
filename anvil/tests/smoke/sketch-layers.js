  // --- sketch-layers: shaded regions and open ends, sketch layers, copy / paste sketch entities (ui-sketch-layers.js) ---
  async function lyrPart(code, nm) {
    await anvil.newPart(); await idle();
    await anvil.run(code); await idle();
    var f = UI.App.model.features.filter(function (g) { return g.name === nm; })[0];
    assert(f, 'no sketch ' + nm);
    UI.editSketch(f.id); await idle();
    assert(UI.App.mode === 'sketch' && UI.App.activeSketch === f.id, 'not in ' + nm);
    UI.zoomView(0.25 / UI.cam.scale);
    return f;
  }
  function lyrMenu(label) { var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === label; })[0]; li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, detail: 1, button: 0 })); return li; }
  function lyrMenuRow(re) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return re.test(m.textContent); })[0]; }
  function rgnMeshes() { return UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketchRegion != null; }); }
  function rgnEnds() { return UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketchOpenEnds; }); }
  function cpyKey(k) { D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true })); }
  step('sketch-layers: a rectangle with a circle inside is one shaded region with a hole (translucent, under the lines, not pickable); an open two-line chain shows 2 red open-end squares; closing it adds a region; hover tints the region under the cursor; View ▸ Sketch Regions turns it off', async function () {
    var f = await lyrPart('p.sketch("Front", 0, "Regions").rect(0, 0, 40, 20).circle(20, 10, 5).line(50, 0, 60, 0).line(60, 0, 60, 10);', 'Regions');
    var rg = UI.sketchRegions();
    var hole = Math.abs(K.signedArea(K.entityPolylines({ t: 'circle', cx: 20, cy: 10, r: 5 }, true)[0].pts));
    assert(rg.length === 1 && rg[0].holes === 1 && rg[0].loops === 2, 'regions ' + JSON.stringify(rg));
    near(rg[0].area, 800 - hole, 1e-6, 'region area');
    var ends = UI.sketchOpenEnds().map(function (p) { return p.join(','); }).sort();
    assert(ends.join(' ') === '50,0 60,10', 'open ends ' + ends.join(' '));
    var ms = rgnMeshes(), pts = rgnEnds();
    assert(ms.length === 1 && ms[0].material.transparent && ms[0].material.opacity < 0.5 && !ms[0].material.depthWrite && ms[0].renderOrder < 10, 'one translucent region mesh under the lines');
    var hits = []; ms[0].raycast(new W.THREE.Raycaster(), hits);
    assert(!hits.length, 'region mesh is not pickable');
    assert(pts.length === 1 && pts[0].geometry.getAttribute('position').count === 2 && pts[0].material.color.getHex() === 0xe0262a, 'two red open-end squares');
    // hover: inside the region tints it, over the hole nothing
    selEv('mousemove', rskScr([5, 5]), null, { buttons: 0 });
    assert(UI.sketchRegionHover() === 0 && rgnMeshes()[0].material.opacity > ms[0].material.opacity - 1e-9, 'hover region 0: ' + UI.sketchRegionHover());
    selEv('mousemove', rskScr([20, 10]), null, { buttons: 0 });
    assert(UI.sketchRegionHover() === -1, 'over the hole: ' + UI.sketchRegionHover());
    // closing the chain: no open ends, a second region; construction geometry is ignored
    f.entities.push({ t: 'line', x1: 60, y1: 10, x2: 50, y2: 0 }, { t: 'line', x1: -5, y1: -5, x2: -5, y2: 30, construction: true });
    UI.updateSketches();
    assert(UI.sketchOpenEnds().length === 0 && UI.sketchRegions().length === 2 && rgnEnds().length === 0, 'closed: ' + JSON.stringify(UI.sketchRegions()) + ' ends ' + JSON.stringify(UI.sketchOpenEnds()));
    // View ▸ Sketch Regions off and on again
    lyrMenu('View'); var row = lyrMenuRow(/Sketch Regions/);
    assert(row, 'View ▸ Sketch Regions'); row.click();
    assert(UI.App.view.sketchRegions === false && rgnMeshes().length === 0, 'regions hidden');
    lyrMenu('View'); lyrMenuRow(/Sketch Regions/).click();
    assert(UI.App.view.sketchRegions !== false && rgnMeshes().length === 2, 'regions back');
    UI.exitSketch(true); await idle();
    return 'area ' + rg[0].area.toFixed(3) + ', ends ' + ends.join(' ');
  });
  step('sketch-layers: Sketch tab ▸ Layers — Add ETCH / BEND presets, Move Selected to Layer puts the circle on ETCH (green, no hole in the region), the current layer takes new circles, a hidden layer is neither drawn nor picked; the Extruded Boss is the full 40 × 20 × 10 block; the sketch DXF has the circle on ETCH; the script round trip keeps the layers', async function () {
    var f = await lyrPart('p.sketch("Front", 0, "Plate").rect(0, 0, 40, 20).circle(20, 10, 5);', 'Plate');
    UI.setRibbonTab('Sketch');
    // levels: the Sketch tab's button is now Levels and opens the Levels Manager tab; the sketch's Layers PM is UI.cmdSketchLayers
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return /^\s*Levels\s*$/.test(b.textContent); })[0];
    assert(btn, 'Levels button on the Sketch tab'); btn.click();
    assert(!$('levels-panel').hidden && $('fm-tree').hidden, 'Levels Manager tab shown');
    D.querySelector('#fm-tabs button[data-tab="tree"]').click();
    assert($('levels-panel').hidden && !$('fm-tree').hidden, 'back to the tree');
    UI.cmdSketchLayers();
    assert(UI.pmTitle() === 'Layers', 'PM ' + UI.pmTitle());
    function pmBtn(re) { return Array.prototype.filter.call(D.querySelectorAll('#pm .pm-btns button'), function (b) { return re.test(b.textContent); })[0]; }
    function row(name) { return D.querySelector('#lyr-list .rel-row[data-layer="' + name + '"]'); }
    pmBtn(/^Add ETCH$/).click(); pmBtn(/^Add BEND$/).click();
    assert(row('ETCH') && row('BEND') && f.layers.length === 2 && f.layers[0].noProfile && f.layers[1].lineType === 'dashed', 'presets ' + JSON.stringify(f.layers));
    // pick the circle in the graphics area (it selects, the Layers PM stays), then Move Selected to ETCH
    rskClick([25, 10]);
    assert(UI.pmTitle() === 'Layers' && anvil.selection().some(function (s) { return s.kind === 'entity' && s.index === 1; }), 'circle selected: ' + JSON.stringify(anvil.selection()));
    row('ETCH').click();
    var undo0 = UI.App.undo.length;
    pmBtn(/^Move Selected to ETCH$/).click();
    assert(f.entities[1].layer === 'ETCH' && UI.App.undo.length === undo0 + 1, 'circle on ETCH ' + JSON.stringify(f.entities[1]));
    var ls = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.index === 1 && o.isLineSegments; })[0];
    assert(UI.sketchRegions().length === 1 && UI.sketchRegions()[0].holes === 0, 'no hole: ' + JSON.stringify(UI.sketchRegions()));
    UI.setSelection([]);
    var ls2 = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.index === 1 && o.isLineSegments; })[0];
    assert(ls2 && ls2.material.color.getHexString() === '1e9e3c', 'drawn in the ETCH colour: ' + (ls2 && ls2.material.color.getHexString()));
    // current layer: ETCH; a circle drawn now goes on it
    row('ETCH').querySelector('.lyr-cur').click();
    assert(UI.sketchCurrentLayer() === 'ETCH', 'current ' + UI.sketchCurrentLayer());
    UI.setTool('circle'); rskClick([8, 10]); rskClick([11, 10]); UI.setTool('select'); await idle();
    var c2 = f.entities[f.entities.length - 1];
    assert(f.entities.length === 3 && c2.t === 'circle' && c2.layer === 'ETCH', 'new circle on ETCH: ' + JSON.stringify(c2));
    // hide ETCH: not drawn, not picked
    UI.cmdSketchLayers(); row('ETCH').querySelector('.lyr-eye').click();
    assert(f.layers[0].hidden && !UI.groups.sketches.children.some(function (o) { return o.userData && o.userData.index === 1; }) && !UI.pickEntity.apply(null, rskScr([25, 10])), 'hidden layer drawn or picked');
    row('ETCH').querySelector('.lyr-eye').click();
    assert(!f.layers[0].hidden, 'shown again');
    UI.pmOK(); UI.exitSketch(); await idle();
    await anvil.append('p.extrude(10, { sketch: ' + f.id + ' });'); await idle();
    assert(!Object.keys(UI.App.build.errors || {}).length, 'build errors ' + JSON.stringify(UI.App.build.errors));
    near(anvil.mass().volume, 8000, 1e-6, 'volume (ETCH circles make no holes)');
    var dxf = anvil.dxfSketch(f.id);
    assert((dxf.match(/\n0\nCIRCLE\n8\nETCH\n/g) || []).length === 2 && /\n2\nETCH\n70\n0\n62\n3\n/.test(dxf) && (dxf.match(/\n0\nLINE\n8\nOUTLINE\n/g) || []).length === 4, 'DXF: both circles on ETCH (colour 3), the rectangle on OUTLINE: ' + JSON.stringify(dxf.slice(dxf.indexOf('ENTITIES'))));
    var code = anvil.script();
    assert(code.indexOf('.layer("ETCH", [1,2])') > 0, 'script ' + code);
    await anvil.run(code); await idle();
    var g = UI.App.model.features.filter(function (x) { return x.name === 'Plate'; })[0];
    assert(g && g.layers && g.layers.length === 2 && g.entities[1].layer === 'ETCH' && g.entities[2].layer === 'ETCH', 'round trip ' + JSON.stringify(g && g.layers));
    near(anvil.mass().volume, 8000, 1e-6, 'round-trip volume');
    return 'ETCH + BEND, volume 8000, DXF layers, script .layer("ETCH", [1,2])';
  });
  step('sketch-layers: Copy / Paste — Ctrl+C on a dimensioned slot in Sketch1, Ctrl+V in Sketch2: the copy follows the cursor, a click at (50, 0) places it (one undo step) with its length / width dimensions and Horizontal relation (the origin Coincident is dropped); Edit menu has Copy / Paste in a sketch', async function () {
    try { W.localStorage.removeItem('anvil.sketchClipboard'); } catch (e) { }
    var f1 = await lyrPart('p.sketch("Front", 0, "S1").slot(-10, 0, 10, 0, 6).dim(0, "len", { value: 20 }).dim(0, "w").rel("horizontal", ["0"]).rel("coincident", ["0.p1", "O"]);\np.sketch("Front", 0, "S2").point(-30, -30);', 'S1');
    rskClick([0, 3]);
    assert(anvil.selection().some(function (s) { return s.kind === 'entity' && s.index === 0; }), 'slot selected');
    UI.closePM();
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    cpyKey('c');
    var cb = UI.sketchClipboard();
    assert(cb && cb.entities === 1 && cb.dims === 2 && cb.rels === 1, 'clipboard ' + JSON.stringify(cb));
    assert(W.localStorage.getItem('anvil.sketchClipboard'), 'kept in localStorage');
    lyrMenu('Edit');
    assert(lyrMenuRow(/^Copy/) && lyrMenuRow(/^Paste/), 'Edit ▸ Copy / Paste in a sketch');
    UI.closeMenus();
    UI.exitSketch(true); await idle();
    var f2 = UI.App.model.features.filter(function (x) { return x.name === 'S2'; })[0];
    UI.editSketch(f2.id); await idle();
    UI.zoomView(0.25 / UI.cam.scale);
    var undo0 = UI.App.undo.length;
    cpyKey('v');
    assert(UI.pmTitle() === 'Paste', 'paste placement PM: ' + UI.pmTitle());
    selEv('mousemove', rskScr([30, 12]), null, { buttons: 0 });
    var t = UI.App.tempEntities[0];
    assert(t && t.t === 'slot' && Math.abs((t.x1 + t.x2) / 2 - 30) < 0.3 && Math.abs(t.y1 - 12) < 0.3, 'preview follows the cursor ' + JSON.stringify(t));
    rskClick([50, 0]); await idle();
    var E = f2.entities, s = E[1];
    assert(E.length === 2 && s.t === 'slot', 'pasted ' + JSON.stringify(E));
    near(s.x1, 40, 1e-6, 'x1'); near(s.x2, 60, 1e-6, 'x2'); near(s.y1, 0, 1e-6, 'y1'); near(s.w, 6, 1e-9, 'width');
    assert((f2.dims || []).length === 2 && f2.dims.every(function (d) { return d.e === 1; }), 'dims ' + JSON.stringify(f2.dims));
    assert((f2.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }).join(' ') === 'horizontal:1', 'rels ' + JSON.stringify(f2.rels));
    assert(UI.App.undo.length === undo0 + 1 && !UI.pmTitle() && UI.App.tempEntities.length === 0, 'one undo step, placement over');
    assert(UI.sketchStatus().dims.every(function (x) { return x === 'ok'; }), 'dims ok ' + JSON.stringify(UI.sketchStatus()));
    UI.undo(); await idle();
    assert(UI.activeSketchFeature().entities.length === 1, 'undo takes the paste back');
    // Esc cancels a placement
    cpyKey('v'); selKey('Escape');
    assert(!UI.pmTitle() && UI.activeSketchFeature().entities.length === 1 && !UI.App.tempEntities.length, 'Esc cancelled');
    UI.exitSketch(true); await idle();
    return 'slot at (' + s.x1 + ', ' + s.y1 + ') - (' + s.x2 + ', ' + s.y2 + '), 2 dims, Horizontal';
  });
  // --- end sketch-layers ---
