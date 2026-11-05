  // --- rfIB (2026-11-05, lane sketchlines; user: "dont let smart dimensions take line size priority"): sketch lines keep
  // their full weight and colour under Smart Dimensions. The dimension layer is an SVG over the canvas: a distance
  // between two parallel edges drew its extension lines from each edge's middle along the edge, so the 1 px dimension
  // line and its light casing replaced half of every edge of a dimensioned rectangle. Measured on a composite of the
  // canvas and the dimension layer (what the user sees), across each edge at 10 / 25 / 50 / 75 / 90 % of its length. ---
  var rfIBSaved = null;
  function rfIBSet() {
    var V = UI.App.view;
    if (!rfIBSaved) rfIBSaved = { grid: V.showGrid, regions: V.sketchRegions, dims: V.showDims, qs: UI.App.quickSnap, num: UI.sketchNumericInput() };
    V.showGrid = false; V.sketchRegions = true; V.showDims = false;
    UI.App.quickSnap = null;
    UI.sketchNumericInput(false);
  }
  function rfIBRestore() {
    var s = rfIBSaved, V = UI.App.view;
    if (!s) return;
    rfIBSaved = null;
    V.showGrid = s.grid; V.sketchRegions = s.regions; V.showDims = s.dims;
    UI.App.quickSnap = s.qs;
    UI.sketchNumericInput(s.num);
    UI.App.gridStale = true; UI.App.dimsStale = true;
  }
  function rfIBStep(name, fn) { step(name, async function () { try { return await fn(); } finally { try { UI.setTool('select'); } catch (e) { /* no sketch */ } rfIBRestore(); } }); }
  function rfIBEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfIBScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  async function rfIBClick(uv) { var p = rfIBScr(uv); rfIBEv('mousemove', p); rfIBEv('mousedown', p, $('viewport')); rfIBEv('mouseup', p); await idle(); }
  async function rfIBNew(units, plane) {
    await anvil.newPart(); await idle();
    rfIBSet();
    UI.App.model.units = units;
    await UI.newSketchOnPlane(plane || 'Top'); await idle();
    UI.zoomView(0.25 / UI.cam.scale); await idle();
    return UI.activeSketchFeature();
  }
  // the screen's picture: the canvas, then the dimension layer over it (its computed styles inlined, labels left out)
  async function rfIBComposite() {
    UI.drawDims(true);
    if (UI.render) UI.render();
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, w = c.width, h = c.height, pr = R.getPixelRatio(), px = new Uint8Array(w * h * 4);
    R.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var cv = D.createElement('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d'), img = cx.createImageData(w, h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 4, a = px[i + 3] / 255;
      for (var k = 0; k < 3; k++) img.data[o + k] = Math.round(px[i + k] + 224 * (1 - a));   // over a light grey ground
      img.data[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    var layer = $('dim-layer'), clone = layer.cloneNode(true), src = layer.querySelectorAll('*'), dst = clone.querySelectorAll('*');
    for (var n = 0; n < src.length; n++) {
      if (src[n].closest('defs')) continue;
      var cs = W.getComputedStyle(src[n]);
      ['stroke', 'stroke-width', 'fill', 'opacity', 'paint-order', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'display', 'visibility'].forEach(function (pn) { dst[n].setAttribute(pn, cs.getPropertyValue(pn)); });
    }
    Array.prototype.slice.call(clone.querySelectorAll('text')).forEach(function (t) { t.parentNode.removeChild(t); });
    var vr = $('viewport').getBoundingClientRect(), lr = layer.getBoundingClientRect();
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', lr.width); clone.setAttribute('height', lr.height);
    clone.removeAttribute('style'); clone.removeAttribute('class');
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    var im = new Image();
    await new Promise(function (res, rej) { im.onload = res; im.onerror = function () { rej(new Error('the dimension layer did not rasterise')); }; im.src = url; });
    var cr = c.getBoundingClientRect();
    cx.drawImage(im, (lr.left - cr.left) * pr, (lr.top - cr.top) * pr, lr.width * pr, lr.height * pr);
    return { w: w, h: h, pr: pr, data: cx.getImageData(0, 0, w, h).data, ox: cr.left - vr.left, oy: cr.top - vr.top };
  }
  // pixels across the line a–b (screen px) at fraction t whose colour is within tol of col: the line's drawn width
  function rfIBAcross(img, a, b, t, col, tol) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy), nx = -dy / L, ny = dx / L, n = 0, seen = {};
    var px0 = a[0] + dx * t, py0 = a[1] + dy * t;
    for (var s = -8; s <= 8; s += 0.25 / img.pr) {
      var x = Math.floor((px0 + nx * s - img.ox) * img.pr), y = Math.floor((py0 + ny * s - img.oy) * img.pr), key = x + ',' + y;
      if (seen[key] || x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      seen[key] = true;
      var i = (y * img.w + x) * 4, d = Math.abs(img.data[i] - col[0]) + Math.abs(img.data[i + 1] - col[1]) + Math.abs(img.data[i + 2] - col[2]);
      if (d <= tol) n++;
      if (img.trace) img.trace.push(img.data[i] + '/' + img.data[i + 1] + '/' + img.data[i + 2]);
    }
    return n;
  }
  var RFIB_T = [0.1, 0.25, 0.5, 0.75, 0.9];
  // every solid (not construction) line of the active sketch: the same count of line-coloured pixels across it at each
  // fraction, at least the line's width in device pixels -> 'L0 2,2,2,2,2 …'
  async function rfIBEdges(what, mat) {
    if (UI.setSelection) UI.setSelection([]);   // (a selected line is dashed: rfIBClear covers it)
    UI.updateSketches(); await idle();
    var f = UI.activeSketchFeature(), pl = UI.activePlane(), img = await rfIBComposite();
    var st = UI.App.sketchState, byState = { full: UI.mats.sketchFull, over: UI.mats.sketchOver, conflict: UI.mats.sketchConflict };
    var out = [], minW = Math.max(1, Math.round(2 * img.pr));
    f.entities.forEach(function (e, i) {
      if (e.t !== 'line' || e.construction) return;
      // the line's own state colour unless one is given (under defined: UI.mats.sketch)
      var c = (mat || (st && st.entities && byState[st.entities[i]]) || UI.mats.sketch).color, col = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
      var a = UI.worldToScreen(K.to3D(pl, e.x1, e.y1)), b = UI.worldToScreen(K.to3D(pl, e.x2, e.y2));
      var counts = RFIB_T.map(function (t) { return rfIBAcross(img, a, b, t, col, 60); });
      var ok = counts.every(function (n) { return n === counts[0]; }) && counts[0] >= minW, tr = '';
      if (!ok) { img.trace = []; rfIBAcross(img, a, b, 0.5, col, 60); tr = ' — across at 50 %: ' + img.trace.join(' '); img.trace = null; }
      assert(ok, what + ': line ' + i + ' drawn at one full weight along its length: ' + counts.join(',') + ' line-coloured px across it (colour ' + col.join(',') + ', want >= ' + minW + ')' + tr);
      out.push('L' + i + ' ' + counts.join(','));
    });
    assert(out.length >= 1, what + ': lines measured');
    return out;
  }
  // no drawn dimension / extension line segment runs within 2.5 px of a solid sketch line or 5 px of an end (geometry
  // test, status-independent: also for selected and hovered lines, which are dashed / coloured)
  function rfIBClear(what) {
    UI.drawDims(true);
    var f = UI.activeSketchFeature(), pl = UI.activePlane(), bad = [];
    var lines = f.entities.filter(function (e) { return e.t === 'line' && !e.construction; }).map(function (e) { return [UI.worldToScreen(K.to3D(pl, e.x1, e.y1)), UI.worldToScreen(K.to3D(pl, e.x2, e.y2))]; });
    function distPS(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
    D.querySelectorAll('#dim-layer g.dim path.dl, #dim-layer > path.dlh').forEach(function (p) {
      var d = p.getAttribute('d') || '', last = null;
      d.replace(/([ML])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g, function (m, cmd, x, y) {
        var q = [+x, +y];
        if (cmd === 'L' && last) {
          for (var k = 0; k <= 10; k++) {
            var s = [last[0] + (q[0] - last[0]) * k / 10, last[1] + (q[1] - last[1]) * k / 10];
            lines.forEach(function (ln, j) { var dd = distPS(s, ln[0], ln[1]); if (dd < 2.5 && bad.length < 6) bad.push('line ' + j + ' at ' + s.map(Math.round) + ' (' + dd.toFixed(1) + ' px)'); });
          }
        }
        last = q; return m;
      });
    });
    assert(!bad.length, what + ': dimension lines drawn on the sketch lines: ' + bad.join('; '));
    return true;
  }
  // a Center Rectangle (70 x 45 in the document units) at the origin with Smart Dimensions edge to edge, both ways
  async function rfIBCenterRect() {
    UI.setTool('crect'); await idle();
    await rfIBClick([0, 0]); await rfIBClick([35, 22.5]);
    UI.setTool('dimension'); await idle();
    await rfIBClick([-35, 10]); await rfIBClick([35, 10]); await rfIBClick([10, 32]);
    await rfIBClick([10, 22.5]); await rfIBClick([10, -22.5]); await rfIBClick([-45, -5]);
    UI.setTool('select'); await idle();
    var f = UI.activeSketchFeature(), rd = (f.rels || []).filter(function (r) { return r.type === 'distance' && r.v != null; });
    assert(rd.length === 2, 'two edge-to-edge distance dimensions (' + rd.length + ')');
    return f;
  }

  rfIBStep('rfIB: Center Rectangle 70 x 45 (inch, Top plane, Normal To) with Smart Dimensions edge to edge, fully defined, shaded region on: every edge at its full weight along its whole length, the dimension lines stop clear of the edges and the corner points', async function () {
    await rfIBNew('in', 'Top');
    var f = await rfIBCenterRect();
    UI.updateSketches(); await idle();
    assert(UI.App.sketchState && UI.App.sketchState.status === 'full', 'fully defined: ' + (UI.App.sketchState && UI.App.sketchState.status));
    assert(D.querySelectorAll('#dim-layer g.dim').length >= 2, 'both dimensions drawn');
    UI.updateSketches(); await idle();
    rfIBClear('inch');
    var e = await rfIBEdges('inch, fully defined');
    // the extension lines of an edge-to-edge distance still reach out to the dimension line (cut only at the edges)
    var dl = Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim path.dl'), function (p) { return p.getAttribute('d'); }).join(' ');
    assert((dl.match(/M/g) || []).length >= 6, 'dimension and extension lines still drawn: ' + dl);
    return e.join(' | ');
  });

  rfIBStep('rfIB: the same in a millimetre document, under defined (one dimension, blue) then fully defined, and after zooming in and out', async function () {
    await rfIBNew('mm', 'Top');
    UI.setTool('crect'); await idle();
    await rfIBClick([0, 0]); await rfIBClick([35, 22.5]);
    UI.setTool('dimension'); await idle();
    await rfIBClick([-35, 10]); await rfIBClick([35, 10]); await rfIBClick([10, 32]);
    UI.setTool('select'); await idle();
    UI.updateSketches(); await idle();
    assert(UI.App.sketchState && UI.App.sketchState.status === 'under', 'under defined with one dimension: ' + UI.App.sketchState.status);
    UI.updateSketches(); await idle();
    rfIBClear('mm under');
    var out = ['under ' + (await rfIBEdges('mm, under defined', UI.mats.sketch)).length];
    UI.setTool('dimension'); await idle();
    await rfIBClick([10, 22.5]); await rfIBClick([10, -22.5]); await rfIBClick([-45, -5]);
    UI.setTool('select'); await idle();
    UI.updateSketches(); await idle();
    rfIBClear('mm full');
    out.push('full ' + (await rfIBEdges('mm, fully defined')).join(' '));
    for (var z = 0; z < 2; z++) {
      UI.zoomView(z ? 2.2 : 0.6); await idle(); UI.updateSketches(); await idle();
      rfIBClear('zoom ' + z);
      out.push('zoom ' + (await rfIBEdges('mm, zoomed ' + (z ? 'out' : 'in'))).length);
    }
    return out.join(' | ');
  });

  rfIBStep('rfIB: a selected edge (dashed, yellow) and a hovered one keep their place over the dimension lines: no dimension line is drawn on them', async function () {
    await rfIBNew('in', 'Top');
    var f = await rfIBCenterRect();
    var top = f.entities.findIndex(function (e) { return e.t === 'line' && !e.construction && Math.abs(e.y1 - 22.5) < 1e-6 && Math.abs(e.y2 - 22.5) < 1e-6; });
    assert(top >= 0, 'the top edge');
    await rfIBClick([0, 22.5]);
    assert(UI.selection().some(function (s) { return s.kind === 'entity' && s.index === top; }), 'the top edge selected: ' + JSON.stringify(UI.selection()));
    UI.updateSketches(); UI.drawDims(true);
    rfIBClear('selected');
    rfIBEv('mousemove', rfIBScr([-35, -10])); await idle(); UI.drawDims(true);
    rfIBClear('hovered');
    return 'clear';
  });

  rfIBStep('rfIB: Corner Rectangle with a dimension on two edges, and a single dimensioned line: full weight along every edge, the extension lines start clear of the end points', async function () {
    await rfIBNew('in', 'Front');
    UI.setTool('rect'); await idle();
    await rfIBClick([-30, -15]); await rfIBClick([30, 15]);
    UI.setTool('dimension'); await idle();
    await rfIBClick([0, 15]); await rfIBClick([0, 25]);
    await rfIBClick([30, 0]); await rfIBClick([40, 0]);
    UI.setTool('line'); await idle();
    await rfIBClick([-30, -40]); await rfIBClick([30, -40]);
    UI.setTool('select'); await idle();
    var f = UI.activeSketchFeature();
    f.dims = f.dims || [];
    var li = f.entities.length - 1;
    assert(f.entities[li].t === 'line', 'the single line');
    if (!f.dims.some(function (d) { return d.e === li; })) f.dims.push({ e: li, k: 'len', off: -6 });
    UI.updateSketches(); await idle(); UI.drawDims(true);
    assert(D.querySelectorAll('#dim-layer g.dim').length >= 3, 'three dimensions drawn: ' + D.querySelectorAll('#dim-layer g.dim').length + ' ' + JSON.stringify(f.dims) + ' rels ' + JSON.stringify((f.rels || []).filter(function (r) { return r.v != null; })) + ' ents ' + f.entities.length);
    rfIBClear('corner rect');
    // the lines' state colours differ (the single line is under defined): each is measured in its own colour
    return (await rfIBEdges('corner rect')).join(' | ');
  });

  rfIBStep('rfIB: a sketch on a model face (Edit Sketch of the feature too) keeps its lines over the dimensions', async function () {
    await anvil.newPart(); await idle();
    rfIBSet();
    await anvil.run('p.units("in");\np.sketch("Top").rect(-60, -40, 120, 80).extrude(10);\n'); await idle();
    UI.setView('Top'); await idle();
    UI.zoomToFit(); await idle();
    var c = UI.worldToScreen([0, 10, 0]);
    rfIBEv('mousemove', c); rfIBEv('mousedown', c, $('viewport')); rfIBEv('mouseup', c); await idle();
    assert(UI.App.sel && UI.App.sel.kind === 'face', 'the top face selected: ' + JSON.stringify(UI.App.sel && UI.App.sel.kind));
    await UI.cmdSketch(); await idle();
    assert(UI.App.mode === 'sketch', 'a sketch on the face');
    UI.zoomView(0.25 / UI.cam.scale); await idle();
    var f = await rfIBCenterRect();
    UI.updateSketches(); await idle();
    rfIBClear('on a face');
    var out = ['face ' + (await rfIBEdges('on a face')).join(' ')];
    var id = f.id;
    UI.exitSketch(); await idle();
    UI.editSketch(id); await idle();
    UI.zoomView(0.25 / UI.cam.scale); await idle();
    UI.updateSketches(); await idle();
    rfIBClear('Edit Sketch');
    out.push('edit ' + (await rfIBEdges('Edit Sketch')).length);
    return out.join(' | ');
  });
  // --- end rfIB ---
