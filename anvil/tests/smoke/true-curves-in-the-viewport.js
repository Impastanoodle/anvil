  // ---- true curves in the viewport (cloud-2026-09-25p): analytic shading normals, curve edges, Image Quality
  // Ø20 × 20 cylinder along +y: its side facets carry the surface record { t: 'cyl', o, d: y, r: 10 }
  function curvedFaces() { return UI.App.mesh.faces.filter(function (f) { return f.polys.some(function (p) { return p.surf; }); }); }
  function edgeOverlay() { var a = UI.groups.edges.children[0].geometry.getAttribute('position'), out = []; for (var i = 0; i < a.count; i++) out.push([a.getX(i), a.getY(i), a.getZ(i)]); return out; }
  function segsAt(tol, r) { var saved = K.setTessellation({}); try { K.setTessellation({ chordTol: tol }); return K.segsForRadius(r); } finally { K.setTessellation(saved); } }
  step('true curves: a cylinder shades with smooth normals (every corner on the side has the radial normal (x, 0, z)/10), the caps stay flat', async function () {
    await anvil.run('p.cylinder(10, 20);'); await idle();
    var g = UI.getBodyMesh().geometry, pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), side = 0, cap = 0, differs = 0;
    UI.App.mesh.faces.forEach(function (f) {
      var curved = f.polys.some(function (p) { return p.surf && p.surf.s.t === 'cyl'; });
      for (var v = f.start * 3; v < (f.start + f.count) * 3; v++) {
        var x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), n = [nrm.getX(v), nrm.getY(v), nrm.getZ(v)];
        if (curved) {
          var r = Math.hypot(x, z);
          near(n[0] * x / r + n[2] * z / r, 1, 1e-5, 'side normal · radial'); near(n[1], 0, 1e-6, 'side normal y');
          if (Math.abs(n[0] * f.normal[0] + n[2] * f.normal[2]) < 1 - 1e-4) differs++;
          side++;
        } else { near(n[0] * f.normal[0] + n[1] * f.normal[1] + n[2] * f.normal[2], 1, 1e-6, 'cap normal = facet normal'); cap++; }
      }
    });
    assert(side > 0 && cap > 0 && differs > 0, 'side ' + side + ', cap ' + cap + ', corners off the facet normal ' + differs);
    near(anvil.mass().volume, Math.PI * 100 * 20, 1e-6, 'exact volume π·10²·20');
    return side + ' side corners radial, ' + cap + ' cap corners flat';
  });
  step('true curves: no seam edges on the cylinder side (facet boundaries of one surface are tangent, not drawn or picked); both rims drawn as 128-segment circles', async function () {
    var n = curvedFaces().length, seams = UI.App.edges.filter(function (e) { return e.seam; });
    assert(n === K.segsForRadius(10) && seams.length === n, 'side facets ' + n + ', seam edges ' + seams.length);
    assert(seams.every(function (e) { return e.smooth; }), 'seams are smooth (not pickable)');
    var pts = edgeOverlay();
    // every drawn segment lies on a rim circle (y = 0 or 20, radius 10): nothing vertical, no chords
    pts.forEach(function (p) { near(Math.hypot(p[0], p[2]), 10, 1e-4, 'overlay point radius'); assert(Math.abs(p[1]) < 1e-6 || Math.abs(p[1] - 20) < 1e-6, 'overlay point off the rims: ' + p); });
    assert(pts.length === 2 * 2 * 128, 'two circles × 128 segments, got ' + pts.length / 2 + ' segments');
    assert(UI.App.curves.length === 2 && UI.App.curves.every(function (c) { return c.curve.kind === 'circle' && c.edges.length === n; }), 'App.curves: ' + UI.App.curves.map(function (c) { return c.curve.kind + '/' + c.edges.length; }));
    // hovering a chord lights up the whole circle
    UI.App.hover = { kind: 'edge', edge: UI.App.curves[0].edges[0] }; UI.updateHighlights();
    var hl = UI.groups.highlight.children[0].geometry.getAttribute('position').count / 2;
    UI.App.hover = null; UI.updateHighlights();
    assert(hl === 128, 'hovered rim segments ' + hl);
    return n + ' facets, ' + seams.length + ' hidden seams, rims 2 × 128 segments';
  });
  step('Image Quality: Tools ▸ Options (document properties) → Finer rebuilds with more facets through the worker, writes model.tessellation, Coarse from the pane; the volume stays exact; undo steps back', async function () {
    assert(typeof anvil.tessellation === 'function', 'anvil.tessellation');
    var q0 = anvil.tessellation();
    assert(q0.chordTol === 0.05 && q0.preset === 'default', JSON.stringify(q0));
    assert(UI.App.workerOn === true, 'the worker is on: the rebuild below goes through it with the model clone');
    // spy on what the rebuild worker is sent: the model clone must carry the document's tessellation
    var sent = [], OW = W.Worker.prototype.postMessage;
    W.Worker.prototype.postMessage = function (m) { if (m && m.type === 'rebuild') sent.push(m.model && m.model.tessellation); return OW.apply(this, arguments); };
    var q1;
    try { q1 = await anvil.tessellation('finer'); await idle(); } finally { W.Worker.prototype.postMessage = OW; }
    assert(sent.length >= 1 && sent[sent.length - 1] && sent[sent.length - 1].chordTol === 0.01, 'worker got the model tessellation: ' + JSON.stringify(sent));
    assert(q1.chordTol === 0.01 && q1.preset === 'finer' && UI.App.model.tessellation.chordTol === 0.01, JSON.stringify(q1));
    near(curvedFaces().length, segsAt(0.01, 10), 0, 'side facets at 0.01 mm');
    assert(segsAt(0.01, 10) > K.segsForRadius(10), 'finer has more facets than the default');
    assert(K.setTessellation({}).chordTol === 0.05, 'the global (main-thread) setting is untouched: the document carries its own');
    near(anvil.mass().volume, Math.PI * 100 * 20, 1e-6, 'exact volume at 0.01 mm');
    assert(edgeOverlay().length === 2 * 2 * 128, 'rims still 128 segments');
    UI.openTaskPane('props');
    var sel = D.querySelector('#tp-panel [data-role="image-quality"]');
    assert(sel && sel.value === 'finer', 'Image Quality select in the document properties: ' + (sel && sel.value));
    setInput(sel, 'coarse'); await idle();
    near(UI.App.model.tessellation.chordTol, 0.1, 0, 'chordTol from the pane');
    near(curvedFaces().length, segsAt(0.1, 10), 0, 'side facets at 0.1 mm');
    UI.undo(); await idle();
    near(UI.App.model.tessellation.chordTol, 0.01, 0, 'undo → finer');
    near(curvedFaces().length, segsAt(0.01, 10), 0, 'side facets after undo');
    UI.undo(); await idle();
    assert(anvil.tessellation().chordTol === 0.05 && curvedFaces().length === K.segsForRadius(10), 'undo → default: ' + JSON.stringify(anvil.tessellation()));
    UI.closeTaskPane && UI.closeTaskPane();
    return 'facets ' + K.segsForRadius(10) + ' → ' + segsAt(0.01, 10) + ' (finer) → ' + segsAt(0.1, 10) + ' (coarse) → undo, undo';
  });
  step('Image Quality survives save / load (model JSON) and rebuilds the loaded document with it', async function () {
    await anvil.tessellation(0.02); await idle();
    var json = JSON.stringify(anvil.model());
    assert(JSON.parse(json).tessellation.chordTol === 0.02, 'saved JSON carries tessellation');
    await anvil.run('p.box(5, 5, 5);'); await idle();
    await anvil.load(json); await idle();
    assert(anvil.tessellation().chordTol === 0.02 && anvil.tessellation().preset === 'fine', JSON.stringify(anvil.tessellation()));
    near(curvedFaces().length, segsAt(0.02, 10), 0, 'side facets at 0.02 mm after load');
    near(anvil.mass().volume, Math.PI * 100 * 20, 1e-6, 'exact volume');
    return 'fine (0.02 mm): ' + segsAt(0.02, 10) + ' facets after the round trip';
  });
