  // --- r6/sketch6 ---
  step('r6/sketch6: Offset Entities adds a driving radial dimension (circle) / parallel distance (line); editing it moves the copy', async function () {
    await rskNew();
    UI.setTool('circle'); rskClick([20, 0]); rskClick([28, 0]);
    UI.setTool('select'); rskClick([28, 0]);
    UI.cmdOffsetEntities(); UI.pmSetField('d', '3'); await wait(20);
    UI.pmOK();
    var f = UI.activeSketchFeature(), dim = (f.rels || []).filter(function (r) { return r.type === 'distance'; })[0];
    assert(dim && dim.dir === 'r' && dim.v === 3 && dim.refs.join(',') === '0,1', 'radial dim: ' + JSON.stringify(f.rels));
    UI.App.dimsStale = false; UI.drawDims();   // r12/sketchui12: with the driven values off by default nothing was drawn before the next frame
    assert(D.querySelectorAll('#dim-layer g.dim').length >= 1, 'drawn');
    var r = UI.editRelDim(f.rels.indexOf(dim), '5');
    assert(r.ok && Math.abs(f.entities[1].r - f.entities[0].r - 5) < 1e-6 && Math.abs(f.entities[1].cx - f.entities[0].cx) < 1e-6,'r ' + f.entities[0].r + ' / ' + f.entities[1].r);
    UI.setTool('line'); rskClick([0, 30]); rskClick([30, 30]); rskDbl([30, 30]); selKey('Escape');   // rfCF: the last point is clicked, the double-click on it only ends the chain
    UI.setTool('select'); rskClick([15, 30]);
    var li = UI.App.sel && UI.App.sel.index;
    UI.cmdOffsetEntities(); UI.pmSetField('d', '4'); await wait(20);
    UI.pmOK();
    var pd = f.rels.filter(function (x) { return x.type === 'distance' && x.refs.join(',') === li + ',' + (li + 1); })[0];
    assert(pd && pd.v === 4 && !pd.dir && f.rels.some(function (x) { return x.type === 'parallel'; }), 'parallel distance: ' + JSON.stringify(f.rels));
    return 'ok';
  });
  step('r6/sketch6: Tools ▸ Sketch Settings ▸ Enable on-screen numeric input on entity creation (off by default) dimensions every entity drawn', async function () {
    var was = UI.sketchNumericInput();
    try {
      UI.sketchNumericInput(false);
      await rskNew();
      UI.setTool('circle'); rskClick([0, 0]); rskClick([10, 0]);
      var f = UI.activeSketchFeature();
      assert(!(f.dims || []).length, 'off: no dims ' + JSON.stringify(f.dims));
      UI.sketchNumericInput(true);
      UI.setTool('circle'); rskClick([40, 0]); rskClick([46, 0]);
      UI.setTool('rect'); rskClick([0, 30]); rskClick([20, 40]);
      UI.setTool('select');
      var ks = (f.dims || []).map(function (d) { return d.e + ':' + d.k; }).join(' ');
      // lane C, fidelity #13: the rectangle is four lines (2..5): W and H are the bottom (2) and left (5) lines' lengths
      assert(ks === '1:dia 2:len 5:len', 'dims: ' + ks);
      near(K.dimValue(f.entities[2], f.dims[1]), 20, 1e-9, 'W 20'); near(K.dimValue(f.entities[5], f.dims[2]), 10, 1e-9, 'H 10');
      return ks;
    } finally { UI.sketchNumericInput(was); }
  });
  // --- end r6/sketch6 ---
