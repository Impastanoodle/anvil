  // --- smooth/responsive ---
  step('smooth/responsive: spinning the Funnel\'s Shell thickness ten times builds every preview in the worker (no shell built on the main thread, each input handled at once); only the newest is shown and it matches the main thread\'s; Cancel clears it', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    await anvil.run(exByName('Funnel').code); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'shell'; })[0], idx = UI.App.model.features.indexOf(f);
    var calls = 0, orig = K.buildShell;
    K.buildShell = function () { calls++; return orig.apply(this, arguments); };
    var worst = 0;
    try {
      UI.editFeature(f);
      var inp = D.querySelector('#pm input[data-key="thickness"]');
      assert(inp, 'thickness box');
      for (var i = 0; i < 10; i++) {
        inp.value = String(1.5 + i / 10);
        var t0 = performance.now();
        inp.dispatchEvent(new W.Event('input', { bubbles: true }));
        worst = Math.max(worst, performance.now() - t0);
        await wait(5);
      }
      await UI.previewIdle();
    } finally { K.buildShell = orig; }
    assert(calls === 0, calls + ' shells built on the main thread');
    assert(UI.groups.preview.children.length === 1, 'one preview mesh, got ' + UI.groups.preview.children.length);
    // the shown cavity is the one for 2.4
    var m = JSON.parse(JSON.stringify(UI.App.model)); m.features = m.features.slice(0, idx);
    var g = JSON.parse(JSON.stringify(f)); g.thickness = 2.4;
    var want = K.meshFromBody(K.buildShell(g, { body: K.rebuild(m).body }).inner).triCount;
    var got = UI.groups.preview.children[0].geometry.attributes.position.count / 3;
    assert(got === want, 'preview has ' + got + ' triangles, the 2.4 cavity ' + want);
    assert(/walls 2\.4/.test($('status-msg').textContent), 'status: ' + $('status-msg').textContent);
    UI.pmCancel();
    assert(UI.groups.preview.children.length === 0, 'preview cleared on Cancel');
    await wait(50);
    assert(UI.groups.preview.children.length === 0, 'no late preview after Cancel');
    return 'worst input handler ' + worst.toFixed(1) + ' ms; preview ' + got + ' triangles';
  });
  step('smooth/responsive: a worker rebuild brings the body\'s edges with it (no Kernel.bodyEdges on the main thread; App.edges equal a fresh computation) and its volume', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    var calls = 0, orig = K.bodyEdges, mesh, edges;
    await anvil.run(exByName('Flange').code); await idle();
    K.bodyEdges = function () { calls++; return orig.apply(this, arguments); };
    try {
      var f = UI.App.model.features.filter(function (x) { return x.type === 'cpattern'; })[0];
      f.n = (f.n || 6) + 1;
      await UI.rebuild({ noSave: true });
      mesh = UI.App.mesh; edges = UI.App.edges;
      assert(calls === 0, 'bodyEdges ran ' + calls + ' times on the main thread');
    } finally { K.bodyEdges = orig; }
    var fresh = K.bodyEdges(mesh);
    assert(fresh.length === edges.length && fresh.every(function (e, i) { var w = edges[i]; return e.ka === w.ka && e.kb === w.kb && e.faces.join() === w.faces.join() && e.convex === w.convex && e.smooth === w.smooth; }), 'edges differ: ' + fresh.length + ' vs ' + edges.length);
    for (var i = 0; i < 100 && mesh.workerVolume == null; i++) await wait(20);
    near(mesh.workerVolume, K.massProps(mesh, 1).volume, 1e-6, 'worker volume');
    return edges.length + ' edges';
  });
  step('smooth/responsive: OpenCascade\'s solid swaps in without losing the selection: a selected feature stays selected after a commit, a selected face is found again when the switch goes off (skipped without vendor/occt)', async function () {
    function occIdle() { return Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]); }
    var was = anvil.occt().on;
    await anvil.run(plateCode()); await idle();
    anvil.occt(true, { remember: false });
    try {
      var s = await occIdle();
      if (s.state === 'failed') return 'skipped: ' + (s.error || 'OpenCascade not installed').slice(0, 80);
      assert(s.state === 'ok' && s.driving, 'state ' + s.state);
      var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
      UI.editFeature(f);
      setInput(D.querySelector('#pm input[data-key="depth"]'), '12');
      await pmAccept(); await occIdle();
      assert(anvil.occt().driving, 'OpenCascade drives after the commit');
      assert(UI.App.sel && UI.App.sel.kind === 'feature' && UI.App.sel.id === f.id, 'selection after the swap: ' + JSON.stringify(UI.App.sel));
      // a face picked on OpenCascade's solid (the largest one, at a point inside it) is found on Anvil's again
      var top = -1, best = -Infinity;
      UI.App.mesh.faces.forEach(function (fc, i) { if (fc.area > best) { best = fc.area; top = i; } });
      var tf = UI.App.mesh.faces[top], vs = tf.polys[0].vertices, at = [0, 1, 2].map(function (k) { return vs.reduce(function (s, v) { return s + [v.pos.x, v.pos.y, v.pos.z][k]; }, 0) / vs.length; });
      UI.App.sel = { kind: 'face', index: top, point: at }; UI.App.sel2 = null;
      anvil.occt(false, { remember: false });
      var sel = UI.App.sel;
      assert(sel && sel.kind === 'face', 'face selection kept: ' + JSON.stringify(sel));
      var fc = UI.App.mesh.faces[sel.index];
      assert(Math.abs(fc.normal[0] - tf.normal[0]) + Math.abs(fc.normal[1] - tf.normal[1]) + Math.abs(fc.normal[2] - tf.normal[2]) < 1e-6 && Math.abs(fc.w - tf.w) < 1e-6, 'the same face: normal ' + fc.normal + ' w ' + fc.w + ' vs ' + tf.normal + ' ' + tf.w);
      return 'feature ' + f.name + ' kept; top face ' + top + ' -> ' + sel.index;
    } finally { anvil.occt(was, { remember: false }); await occIdle(); }
  });
  step('smooth/responsive: on OK the yellow preview stays until the committed build is applied (no frame of the old part); with the worker off, previews run on the main thread as before', async function () {
    var was = anvil.workerOn();
    await anvil.run(plateCode()); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
    UI.editFeature(f);
    setInput(D.querySelector('#pm input[data-key="depth"]'), '14');
    await UI.previewIdle();
    assert(UI.groups.preview.children.length === 1, 'preview shown');
    var p = UI.pmOK(), kept = UI.groups.preview.children.length;
    await p; await idle();
    assert(kept === 1 || !anvil.workerOn(), 'preview kept until the build is applied: ' + kept);
    assert(UI.groups.preview.children.length === 0, 'preview gone once applied');
    anvil.workerOn(false);
    try {
      UI.editFeature(f);
      setInput(D.querySelector('#pm input[data-key="depth"]'), '16');
      assert(UI.groups.preview.children.length === 1, 'main-thread preview at once');
      await UI.previewIdle();
      UI.pmCancel();
    } finally { anvil.workerOn(was); }
    return 'kept ' + kept;
  });
  // --- end smooth/responsive ---
