  // --- rfBR ---
  // (2026-10-13, lane BR) The graphics area in Mastercam's colours: a grey-black background with no blue (every
  // background, either theme), white wireframe (sketch entities whatever their definition state, model edges in
  // Wireframe), a selection drawn yellow and dashed (sketch entity, model edge), and no relation icons at all — none
  // next to the entities, none by the cursor while drawing, no View ▸ Sketch Relations; the relations still exist.
  function rfBRrgb(css) { return (String(css).match(/rgba?\([^)]*\)/g) || []).map(function (s) { return s.match(/[\d.]+/g).slice(0, 3).map(Number); }); }
  function rfBRbluish(c) { return c[2] > c[0] + 12 && c[2] > c[1] + 4; }
  function rfBRline(f, i) { return UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketch === f.id && o.userData.index === i; })[0]; }
  step('rfBR: the graphics area is grey-black with no blue — Gradient, Plain and Dark in the light and the dark theme; the HUD, grid and plane tints neutral', async function () {
    var vp = $('viewport'), theme0 = UI.theme(), bg0 = UI.App.view.bg, seen = [];
    try {
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        ['gradient', 'plain', 'dark'].forEach(function (b) {
          UI.setBackground(b);
          var cs = W.getComputedStyle(vp), cols = rfBRrgb(cs.backgroundImage).concat(cs.backgroundImage === 'none' ? rfBRrgb(cs.backgroundColor) : []);
          assert(cols.length >= 1, th + ' / ' + b + ': a background colour: ' + cs.backgroundImage + ' ' + cs.backgroundColor);
          cols.forEach(function (c) {
            assert(!rfBRbluish(c) && Math.max(c[0], c[1], c[2]) <= 0x40, th + ' / ' + b + ': grey-black, no blue: rgb(' + c + ')');
          });
          var hud = W.getComputedStyle(vp);
          ['--hud-hover-line', '--hud-on-line', '--sk-infer', '--sk-sel'].forEach(function (k) {
            var v = hud.getPropertyValue(k).trim(), m = /^#([0-9a-f]{6})$/i.exec(v);
            if (m) { var n = parseInt(m[1], 16); assert(!rfBRbluish([n >> 16, (n >> 8) & 255, n & 255]), th + ' / ' + b + ': ' + k + ' not blue: ' + v); }
          });
          seen.push(th + ':' + b);
        });
      });
      ['grid', 'gridMajor', 'planeLine', 'planeFace', 'planeFaceHi', 'sel', 'sketch', 'sketchDim', 'temp'].forEach(function (k) {
        var c = UI.mats[k].color; assert(!rfBRbluish([c.r * 255, c.g * 255, c.b * 255]), k + ' not blue: #' + c.getHexString());
      });
    } finally { UI.setTheme(theme0); UI.setBackground(bg0 || 'gradient'); }
    return seen.length + ' grounds';
  });
  step('rfBR: sketch wireframe white (under and fully defined), construction light grey dashed; a selected line yellow and dashed, white again when the selection clears; box-selected the same', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 10, x2: 30, y2: 10, construction: true });
    UI.updateSketches();
    var l0 = rfBRline(f, 0), c1 = rfBRline(f, 1);
    assert(l0 && l0.material.color.getHex() === 0xffffff && !l0.material.isLineDashedMaterial, 'under defined line white, solid: #' + (l0 && l0.material.color.getHexString()));
    assert(c1 && c1.material.isLineDashedMaterial && c1.material.color.getHex() === 0xa8a8a8, 'construction light grey dashed: #' + (c1 && c1.material.color.getHexString()));
    W.SketchSolver.addRelation(f, 'fix', ['0']); UI.updateSketches();
    assert(rfBRline(f, 0).material.color.getHex() === 0xffffff, 'fully defined white too');
    var pts = UI.groups.sketches.children.filter(function (o) { return o.isPoints && !(o.userData && o.userData.sketchOpenEnds); });
    assert(pts.length && pts.every(function (o) { return o.material.color.getHex() === 0x2ee66b || o.material.color.getHex() === 0xa8a8a8; }), 'end points green on white lines (user 2026-10-14), grey on construction');
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    var s0 = rfBRline(f, 0), m = s0.material;
    assert(m === UI.mats.sketchSel && m.type === 'LineDashedMaterial' && m.color.getHex() === 0xffd400, 'selected: yellow LineDashedMaterial #' + m.color.getHexString() + ' ' + m.type);
    assert(m.userData.dashPx > 0 && m.userData.gapPx > 0 && m.dashSize > 0 && m.gapSize > 0, 'dashes in screen pixels: ' + JSON.stringify([m.userData.dashPx, m.userData.gapPx, m.dashSize, m.gapSize]));
    assert(s0.geometry.getAttribute('lineDistance') && s0.geometry.getAttribute('lineDistance').count === s0.geometry.getAttribute('position').count, 'line distances computed');
    UI.render();
    var fat = s0.userData.fat;
    assert(!UI.thickLines() || (fat && fat.mesh && /DASHED/.test(JSON.stringify(fat.mesh.material.defines || {}))), 'the thick line is drawn dashed');
    UI.setSelection([]);
    assert(rfBRline(f, 0).material.color.getHex() === 0xffffff && !rfBRline(f, 0).material.isLineDashedMaterial, 'white and solid again when cleared');
    // a window box round line 0 only: drawn the same, yellow dashed
    UI.setTool('select');
    var a = rskScr([-3, -3]), b = rskScr([33, 3]);
    await selDrag(a, b);
    var boxed = rfBRline(f, 0);
    assert(UI.entitySelected(0) && boxed.material === UI.mats.sketchSel, 'box-selected line yellow dashed: ' + JSON.stringify(anvil.selection()));
    UI.setSelection([]);
    return 'white / #a8a8a8 dashed / #ffd400 dashed';
  });
  step('rfBR: model edges white in Wireframe / Hidden Lines Removed, dark on the shaded body, hidden lines mid grey; a selected edge yellow and dashed', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.box(40, 20, 30);'); await idle();
    var style0 = UI.App.view.style;
    try {
      UI.setStyle('wireframe');
      assert(UI.mats.edge.color.getHex() === 0xffffff, 'Wireframe edges white: #' + UI.mats.edge.color.getHexString());
      UI.setStyle('hlr');
      assert(UI.mats.edge.color.getHex() === 0xffffff, 'HLR edges white: #' + UI.mats.edge.color.getHexString());
      UI.setStyle('shadedEdges');
      assert(UI.mats.edge.color.getHex() < 0x303030, 'edges dark on the shaded body: #' + UI.mats.edge.color.getHexString());
      var e = UI.App.edges.filter(function (x) { return !x.smooth; })[0];
      UI.setSelection([{ kind: 'edge', edge: e, index: UI.App.edges.indexOf(e) }]);
      var hl = UI.groups.highlight.children.filter(function (o) { return o.isLineSegments; });
      assert(hl.length === 1 && hl[0].material.isLineDashedMaterial && hl[0].material.color.getHex() === 0xffd400 && hl[0].geometry.getAttribute('lineDistance'), 'selected edge yellow dashed: ' + hl.map(function (o) { return o.material.type + ' #' + o.material.color.getHexString(); }).join(', '));
      assert(hl[0].children.some(function (c) { return c.isLineSegments && !c.material.isLineDashedMaterial && c.material.color.getHex() < 0x303030; }), 'a dark underlay so the gaps read over the white edge');
      UI.setSelection([]);
    } finally { UI.setStyle(style0 || 'shadedEdges'); }
    return 'ok';
  });
  step('rfBR: no relation icons — none next to related entities, none by the cursor while a horizontal line is drawn (the relation is still added); no View ▸ Sketch Relations; Display/Delete Relations lists them in text', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    UI.setTool('line'); rskClick([0, 0]);
    selEv('mousemove', rskScr([30, 0.05]));
    UI.App.dimsStale = false; UI.drawDims();
    var layer = D.querySelector('#dim-layer .sk-feedback');
    assert((UI.App.inferPreview || []).some(function (c) { return c.type === 'horizontal'; }), 'Horizontal inferred: ' + JSON.stringify(UI.App.inferPreview));
    assert(!D.querySelector('#dim-layer .rel-badge') && !D.querySelector('#dim-layer use') && !(layer && layer.querySelector('.rel-badge')), 'no glyph by the cursor');
    rskClick([30, 0.05]); selKey('Escape');
    assert((f.rels || []).some(function (r) { return r.type === 'horizontal'; }), 'Horizontal added: ' + JSON.stringify(f.rels));
    f.entities.push({ t: 'line', x1: 0, y1: 10, x2: 30, y2: 10 }, { t: 'circle', cx: 10, cy: 20, r: 3 }, { t: 'circle', cx: 25, cy: 20, r: 3 });
    W.SketchSolver.addRelation(f, 'parallel', ['0', '1']); W.SketchSolver.addRelation(f, 'equal', ['2', '3']);
    UI.updateSketches(); UI.App.dimsStale = false; UI.drawDims();
    assert(f.rels.length >= 3 && D.querySelectorAll('#dim-layer .rel-badge, #dim-layer [id^="sk-ico-"]').length === 0, f.rels.length + ' relations, icons drawn: ' + D.querySelectorAll('#dim-layer .rel-badge').length);
    var view = menuRows('Sketch Relations'); UI.closeMenus();
    assert(view.length === 0, 'no View ▸ Sketch Relations: ' + view.map(function (r) { return r.menu + ': ' + r.text; }).join(' | '));
    UI.cmdDisplayRelations();
    var rows = D.querySelectorAll('#rel-display .rel-row');
    assert(rows.length >= 3 && Array.prototype.some.call(rows, function (r) { return /Equal/.test(r.textContent); }), 'listed in text: ' + rows.length);
    UI.pmCancel();
    return f.rels.length + ' relations, 0 icons';
  });
  // --- end rfBR ---
