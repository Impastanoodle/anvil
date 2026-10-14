  // --- r12/sketchui12 ---
  step('r12/sketchui12: sketch dimensions are redrawn in place (same SVG nodes from frame to frame); a reused label still opens the Modify box (rfBR: no relation icons)', async function () {
    await rskNew();
    var showDims = UI.App.view.showDims;
    UI.App.view.showDims = true;
    try {
      UI.setTool('line'); rskClick([0, 0]); rskClick([40, 0]); rskClick([40, 25]); rskClick([0, 25]); rskDbl([0, 25]); selKey('Escape');   // rfCF: the last point is clicked, the double-click on it only ends the chain
      UI.setTool('select');
      UI.App.dimsStale = false; UI.drawDims();
      var nodes = Array.prototype.slice.call(D.querySelectorAll('#dim-layer *')), n0 = nodes.length;
      var label = D.querySelector('#dim-layer g.dim text');
      assert(!D.querySelector('#dim-layer .rel-badge') && label && n0 > 10, 'drawn: ' + n0 + ' nodes, no relation icon');
      UI.drawDims(); UI.drawDims();
      var after = Array.prototype.slice.call(D.querySelectorAll('#dim-layer *'));
      assert(after.length === n0 && after.every(function (x, i) { return x === nodes[i]; }), 'same nodes after a redraw: ' + n0 + ' → ' + after.length);
      // drag the free end of the chain: the nodes move with it, none is rebuilt
      var end = rskScr([0, 25]);
      await selDrag(end, [end[0] - 30, end[1] - 20]);
      UI.App.dimsStale = false; UI.drawDims();
      var kept = Array.prototype.filter.call(D.querySelectorAll('#dim-layer *'), function (x) { return nodes.indexOf(x) >= 0; }).length;
      assert(kept >= n0 - 2, 'nodes kept across the drag: ' + kept + ' / ' + n0);
      assert(label.isConnected && /\d/.test(label.textContent), 'the label node still shows its value: ' + label.textContent);
      // the reused label: a double press opens the Modify box
      var vr = $('viewport').getBoundingClientRect(), r = label.getBoundingClientRect(), p = [r.left + r.width / 2 - vr.left, r.top + r.height / 2 - vr.top];
      selEv('mousedown', p, label); selEv('mouseup', p); selEv('mousedown', p, label); selEv('mouseup', p);
      assert(UI.dimEditValue() != null, 'Modify box opened from a reused label');
      D.querySelector('#dim-edit input').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return n0 + ' nodes reused';
    } finally { UI.App.view.showDims = showDims; UI.App.dimsStale = true; }
  });
  step('r12/sketchui12: no Instant3D dimension dot in a sketch before, while or after its geometry is dragged (rfBA: not made at all; Instant2D gives the dimension its ball after the drag)', async function () {
    await rskNew();
    UI.setTool('line'); rskClick([0, 0]); rskClick([30, 0]); rskDbl([30, 0]); selKey('Escape');   // rfCF
    UI.setTool('select');
    var f = UI.activeSketchFeature();
    f.dims = [{ e: 0, k: 'len', off: 6 }];
    UI.updateSketches(); UI.App.dimsStale = false; UI.drawDims();
    assert(!D.querySelector('#i3d-layer .i3d-handle'), 'no Instant3D dot before the drag');
    var c = rskScr([15, 0]), during = -1;
    await selDrag(c, [c[0] + 20, c[1] + 30], null, null, function () { UI.App.dimsStale = false; UI.drawDims(); during = D.querySelectorAll('#i3d-layer .i3d-handle').length; });
    assert(during === 0, 'dots while dragging: ' + during);
    UI.App.dimsStale = false; UI.drawDims(true);
    assert(!D.querySelector('#i3d-layer .i3d-handle'), 'no Instant3D dot after the drag');
    UI.toggleInstant2D(true);
    assert(UI.instant2DHandle('d0'), 'the Instant2D ball on the dimension after the drag');
    return 'hidden while dragging';
  });
  step('r12/sketchui12: a new sketch shows only placed dimensions (View ▸ Sketch Dimensions off by default); end points are drawn as dots in the entity colour; each sketch tool has its own cursor', async function () {
    await rskNew();
    assert(UI.App.view.showDims === false, 'Sketch Dimensions off by default');
    UI.setTool('line'); rskClick([0, 0]); rskClick([40, 0]); rskClick([40, 25]); rskDbl([40, 25]); selKey('Escape');   // rfCF
    UI.setTool('circle');
    var cur = W.getComputedStyle($('viewport')).cursor;
    assert($('viewport').getAttribute('data-sktool') === 'circle' && /^url\(/.test(cur), 'circle cursor: ' + cur.slice(0, 40));
    UI.setTool('select');
    UI.App.dimsStale = false; UI.drawDims();
    assert(!D.querySelector('#dim-layer g.dim'), 'no driven values drawn: ' + D.querySelectorAll('#dim-layer g.dim').length);
    var pts = UI.groups.sketches.children.filter(function (o) { return o.isPoints && !(o.userData && o.userData.sketchOpenEnds); });   // sketch-layers: not the open-end markers
    var n = pts.reduce(function (s, o) { return s + o.geometry.getAttribute('position').count; }, 0);
    assert(n === 3, 'three end points (the shared corner once): ' + n);
    assert(pts.every(function (o) { return o.material.color.getHex() === 0x2ee66b && o.material.size >= 10; }), 'green 10 px beads on the white lines (user 2026-10-14)');
    return n + ' points';
  });
  // --- end r12/sketchui12 ---
