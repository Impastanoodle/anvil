  // --- rfOB (2026-11-17, lane chamfertypes) --- Chamfer with two distances or an angle in the PropertyManager, as
  // SolidWorks' Chamfer Type row: Angle Distance (D, A, Flip direction) and Distance Distance (Equal distance cleared:
  // D1, D2, Flip direction) are live, driven here by real clicks; the preview and the arrows on the model follow every
  // box; ✓ writes only the type's own values into the feature ({ d, d2 } / { d, angle }, flip only when ticked); Edit
  // Feature opens with the feature's type and values; Vertex / Offset Face / Face Face stay greyed with their reason.
  // The part: an inch block 4 x 2 x 1 (Front sketch), its edge x = 4, y = 2 (1 long): the top face (+Y) takes D.
  (function () {
    var BOX = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(1);\n', EDGE = [4, 2, 0.5];
    function rfOBScr(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
    function rfOBEv(type, c) {
      (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }));
    }
    async function rfOBUntil(cond, what) {
      for (var i = 0; i < 400; i++) { var r = cond(); if (r) return r; await wait(25); }
      fail('never happened: ' + (typeof what === 'function' ? what() : what));
    }
    // a real click a little off the middle of the edge through p (checked to be the edge under the cursor)
    async function rfOBClickEdge(p) {
      UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(40);
      var e = edgeNear(p), P = K.vec.add(e.mid, K.vec.scale(K.vec.sub(e.b, e.a), 0.1)), s = rfOBScr(P), r0 = $('viewport').getBoundingClientRect();
      var pe = UI.pickEdge(s[0] - r0.left, s[1] - r0.top);
      assert(pe && pe.edge && K.pointSegmentDistance(P, pe.edge.a, pe.edge.b) < 1e-6, 'the edge is under the cursor: ' + JSON.stringify(pe && pe.edge && pe.edge.mid));
      rfOBEv('mousemove', s); await wait(15); rfOBEv('mousedown', s); rfOBEv('mouseup', s); await wait(25); await idle();
    }
    function rfOBRow() { return Array.prototype.slice.call(D.querySelectorAll('#pm [data-key^="_type:"]')); }
    function rfOBLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-row.pm-field > label, #pm .pm-row.check > label'), function (l) { return l.textContent.trim(); }); }
    function rfOBBox(label) { var inp = pmField(label); assert(inp, 'no box "' + label + '" (have: ' + rfOBLabels().join(' | ') + ')'); return inp; }
    function rfOBType(label, text) { var inp = rfOBBox(label); inp.focus(); if (/[^0-9.+-]/.test(text)) inp.type = 'text'; inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true })); return inp; }
    function rfOBClickBox(label) { var inp = rfOBBox(label); inp.click(); return inp; }
    function rfOBOk() { var b = D.querySelector('#pm .pm-ok'); return { grey: !!(b && b.classList.contains('disabled')), title: b ? b.title : '' }; }
    // where the preview's cut starts on the top face (x) and on the right face (y): the two setbacks as drawn
    function rfOBPreview() {
      var lo = [Infinity, Infinity, Infinity];
      UI.groups.preview.traverse(function (o) {
        var a = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
        if (!a) return;
        for (var i = 0; i < a.count; i++) { lo[0] = Math.min(lo[0], a.getX(i)); lo[1] = Math.min(lo[1], a.getY(i)); lo[2] = Math.min(lo[2], a.getZ(i)); }
      });
      return [4 - lo[0], 2 - lo[1]];
    }
    async function rfOBPreviewIs(onTop, onSide, what) {
      return rfOBUntil(function () { var s = rfOBPreview(); return Math.abs(s[0] - onTop) < 1e-5 && Math.abs(s[1] - onSide) < 1e-5 ? s : null; },
        function () { return what + ': the preview cuts ' + rfOBPreview().map(function (x) { return +x.toFixed(6); }).join(' / ') + ', wanted ' + onTop + ' / ' + +onSide.toFixed(6); });
    }
    function rfOBHandles() { return UI.pmHandles().map(function (h) { return (h.type || 'arrow') + ':' + h.key + (h.dir ? '@' + h.dir.map(function (x) { return Math.round(x); }).join(',') : ''); }).join(' '); }
    async function rfOBPart(code) {
      if (UI.hasPM()) UI.pmCancel();
      if (UI.App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      if (UI.setSelection) UI.setSelection([]);
    }
    async function rfOBOpen(fn) { if (UI.hasPM()) UI.pmCancel(); if (UI.setSelection) UI.setSelection([]); await fn(); await wait(30); await idle(); }
    function rfOBLast() { return UI.App.model.features[UI.App.model.features.length - 1]; }
    function rfOBVolume() { return anvil.mass().volume; }
    function rfOBEnd() { if (UI.hasPM()) UI.pmCancel(); }

    step('rfOB: Chamfer, Distance Distance: clearing Equal distance by a click shows Flip direction, D1 and D2; the preview and the arrows on the model follow each box; ✓ makes a chamfer with d and d2 and the part is the closed form', async function () {
      try {
        await rfOBPart(BOX);
        await rfOBOpen(function () { UI.cmdChamfer(); });
        var row = rfOBRow();
        assert(row[1].getAttribute('aria-checked') === 'true', 'a new chamfer opens as Distance Distance');
        assert(rfOBLabels().join('|').indexOf('Distance  D|Equal distance') >= 0 && rfOBLabels().indexOf('Flip direction') < 0, 'Equal distance: one distance, no Flip direction: ' + rfOBLabels().join(' | '));
        await rfOBClickEdge(EDGE);
        assert(UI.pmSpec().values.edges.length === 1, 'edge taken by the click');
        rfOBType('Distance  D', '0.25');
        await rfOBPreviewIs(0.25, 0.25, 'equal distance');
        assert(rfOBHandles() === 'arrow:d@' + UI.pmHandles()[0].dir.map(function (x) { return Math.round(x); }).join(','), 'one arrow for D: ' + rfOBHandles());
        rfOBClickBox('Equal distance'); await wait(30);
        var labels = rfOBLabels().join('|');
        assert(labels.indexOf('Flip direction|Distance 1  D1|Distance 2  D2|Equal distance') >= 0, 'Equal distance cleared: ' + rfOBLabels().join(' | '));
        assert(+rfOBBox('Distance 2  D2').value === 0.25, 'D2 starts at D: ' + rfOBBox('Distance 2  D2').value);
        rfOBType('Distance 2  D2', '0.5');
        await rfOBPreviewIs(0.25, 0.5, 'D1 .25 on the top face, D2 .5 on the side');
        // the arrows: D1 along the top face (toward -X), D2 down the side face (toward -Y)
        assert(rfOBHandles() === 'arrow:d@-1,0,0 arrow:d2@0,-1,0', 'arrows for D1 and D2 on their faces: ' + rfOBHandles());
        rfOBType('Distance 1  D1', '0.125');
        await rfOBPreviewIs(0.125, 0.5, 'D1 .125');
        rfOBClickBox('Flip direction'); await wait(30);
        await rfOBPreviewIs(0.5, 0.125, 'flipped');
        assert(rfOBHandles() === 'arrow:d@0,-1,0 arrow:d2@-1,0,0', 'the arrows swap faces: ' + rfOBHandles());
        rfOBClickBox('Flip direction'); await wait(30);
        await rfOBPreviewIs(0.125, 0.5, 'flipped back');
        // inch input with the document's units: a fraction and a millimetre value
        rfOBType('Distance 1  D1', '1/4');
        await rfOBPreviewIs(0.25, 0.5, 'D1 typed as 1/4');
        rfOBType('Distance 2  D2', '12.7mm');
        await rfOBPreviewIs(0.25, 0.5, 'D2 typed as 12.7mm');
        rfOBType('Distance 2  D2', '0');
        await rfOBUntil(function () { return rfOBOk().grey && /Distance 2 must be greater than zero/.test(rfOBOk().title); }, function () { return '✓ greyed for D2 = 0: ' + rfOBOk().title; });
        rfOBType('Distance 2  D2', '0.5');
        await rfOBUntil(function () { return !rfOBOk().grey; }, '✓ lit again');
        var n0 = UI.App.model.features.length;
        await pmAccept();
        var f = rfOBLast();
        assert(UI.App.model.features.length === n0 + 1 && f.type === 'chamfer' && f.d === 0.25 && f.d2 === 0.5 && f.angle === undefined && f.flip === undefined && f._type === undefined && f._equal === undefined, 'the feature: ' + JSON.stringify(f));
        near(rfOBVolume(), 8 - 0.5 * 0.25 * 0.5, 1e-9, 'volume');
        assert(/d2: 0\.5/.test(anvil.script()), 'the script keeps d2: ' + anvil.script().split('\n').filter(function (l) { return /chamfer/.test(l); }).join(' '));
        return 'D1 .25 / D2 .5: volume ' + rfOBVolume().toFixed(6) + ', ' + JSON.stringify({ d: f.d, d2: f.d2 });
      } finally { rfOBEnd(); }
    });

    step('rfOB: Chamfer, Angle Distance by a click on its type button: Flip direction, D and A (45 degrees to start); the preview follows the angle and the flip; an angle of 0 or 180 greys ✓ with the reason; ✓ makes a chamfer with d and angle', async function () {
      try {
        await rfOBPart(BOX);
        await rfOBOpen(function () { UI.cmdChamfer(); });
        await rfOBClickEdge(EDGE);
        var row = rfOBRow();
        assert(!row[0].disabled, 'Angle Distance is live');
        row[0].click(); await wait(30);
        row = rfOBRow();
        assert(row[0].getAttribute('aria-checked') === 'true' && UI.pmSpec().values._type === 'ad', 'Angle Distance pressed');
        var labels = rfOBLabels();
        assert(labels.join('|').indexOf('Flip direction|Distance  D|Angle  A') >= 0 && labels.indexOf('Equal distance') < 0 && labels.indexOf('Distance 2  D2') < 0, 'Angle Distance boxes: ' + labels.join(' | '));
        assert(+rfOBBox('Angle  A').value === 45, 'A starts at 45: ' + rfOBBox('Angle  A').value);
        rfOBType('Distance  D', '0.25');
        await rfOBPreviewIs(0.25, 0.25, '45 degrees');
        rfOBType('Angle  A', '30');
        await rfOBPreviewIs(0.25, 0.25 * Math.tan(Math.PI / 6), '30 degrees from the top face');
        assert(/^arrow:d@-1,0,0 angle:angle$/.test(rfOBHandles()), 'an arrow for D on the top face and a ring for A: ' + rfOBHandles());
        rfOBType('Angle  A', '60');
        await rfOBPreviewIs(0.25, 0.25 * Math.tan(Math.PI / 3), '60 degrees');
        rfOBClickBox('Flip direction'); await wait(30);
        await rfOBPreviewIs(0.25 * Math.tan(Math.PI / 3), 0.25, '60 degrees, flipped: D on the side face');
        rfOBType('Angle  A', '180');
        await rfOBUntil(function () { return rfOBOk().grey && /angle must be between 0 and 180/.test(rfOBOk().title); }, function () { return '✓ greyed for 180: ' + rfOBOk().title; });
        rfOBType('Angle  A', '45');
        await rfOBUntil(function () { return !rfOBOk().grey; }, '✓ lit for 45');
        // (90 degrees on this square corner: the chamfer would never reach the other face, the preview says so and ✓ greys)
        rfOBType('Angle  A', '90');
        await rfOBUntil(function () { return rfOBOk().grey && /never reach the other face/.test(statusText() + rfOBOk().title); }, function () { return '90 degrees refused with the reason: ' + statusText() + ' / ' + rfOBOk().title; });
        rfOBType('Angle  A', '0');
        await rfOBUntil(function () { return rfOBOk().grey; }, '✓ greyed for 0');
        rfOBType('Angle  A', '30');
        await rfOBUntil(function () { return !rfOBOk().grey; }, '✓ lit again');
        await rfOBPreviewIs(0.25 * Math.tan(Math.PI / 6), 0.25, '30 degrees, flipped');
        await pmAccept();
        var f = rfOBLast();
        assert(f.type === 'chamfer' && f.d === 0.25 && f.angle === 30 && f.flip === true && f.d2 === undefined && f._type === undefined, 'the feature: ' + JSON.stringify(f));
        near(rfOBVolume(), 8 - 0.5 * 0.25 * 0.25 * Math.tan(Math.PI / 6), 1e-9, 'volume');
        assert(/angle: 30, flip: true/.test(anvil.script()), 'the script keeps the angle and the flip: ' + anvil.script().split('\n').filter(function (l) { return /chamfer/.test(l); }).join(' '));
        return 'D .25 at 30 degrees, flipped: volume ' + rfOBVolume().toFixed(6);
      } finally { rfOBEnd(); }
    });

    step('rfOB: Edit Feature opens a two-distance chamfer as Distance Distance with Equal distance cleared, its D1, D2 and Flip direction; ticking Equal distance and ✓ leaves a plain chamfer; an angle chamfer opens as Angle Distance with its angle, and ✓ without a change leaves it as it was', async function () {
      try {
        await rfOBPart(BOX + 'p.chamfer(0.25, [[4, 2, 0.5]], { d2: 0.5, flip: true });\n');
        near(rfOBVolume(), 8 - 0.5 * 0.25 * 0.5, 1e-9, 'volume as scripted');
        var f = rfOBLast();
        await rfOBOpen(function () { UI.editFeature(f); });
        var row = rfOBRow(), v = UI.pmSpec().values;
        assert(row[1].getAttribute('aria-checked') === 'true' && v._type === 'dd' && v._equal === false, 'opens as Distance Distance, Equal distance cleared: ' + JSON.stringify({ t: v._type, e: v._equal }));
        assert(!rfOBBox('Equal distance').checked && rfOBBox('Flip direction').checked && +rfOBBox('Distance 1  D1').value === 0.25 && +rfOBBox('Distance 2  D2').value === 0.5, 'its values: ' + rfOBLabels().join(' | '));
        await rfOBPreviewIs(0.5, 0.25, 'the preview of the feature being edited (flipped: D1 on the side face)');
        rfOBClickBox('Equal distance'); await wait(30);
        assert(rfOBLabels().indexOf('Flip direction') < 0 && rfOBLabels().indexOf('Distance  D') >= 0, 'Equal distance ticked: one distance: ' + rfOBLabels().join(' | '));
        await rfOBPreviewIs(0.25, 0.25, 'equal again');
        await pmAccept();
        f = rfOBLast();
        assert(f.d === 0.25 && f.d2 === undefined && f.flip === undefined && f.angle === undefined, 'a plain chamfer again: ' + JSON.stringify(f));
        near(rfOBVolume(), 8 - 0.5 * 0.25 * 0.25, 1e-9, 'volume of the equal chamfer');
        // an angle chamfer
        await rfOBPart(BOX + 'p.chamfer(0.25, [[4, 2, 0.5]], { angle: 60 });\n');
        var want = 8 - 0.5 * 0.25 * 0.25 * Math.tan(Math.PI / 3);
        near(rfOBVolume(), want, 1e-9, 'volume as scripted (60 degrees)');
        f = rfOBLast();
        var before = JSON.stringify(f);
        await rfOBOpen(function () { UI.editFeature(f); });
        row = rfOBRow();
        assert(row[0].getAttribute('aria-checked') === 'true' && +rfOBBox('Angle  A').value === 60 && +rfOBBox('Distance  D').value === 0.25 && !rfOBBox('Flip direction').checked, 'opens as Angle Distance, 60 degrees: ' + rfOBLabels().join(' | '));
        await pmAccept();
        assert(JSON.stringify(rfOBLast()) === before, '✓ without a change keeps the feature: ' + JSON.stringify(rfOBLast()) + ' / ' + before);
        near(rfOBVolume(), want, 1e-9, 'volume after ✓');
        // Instant3D on the chamfer's face: the distance and the angle can be changed on the model
        var hs = UI.instant3DFeatureHandles(rfOBLast(), null).map(function (h) { return (h.type || 'arrow') + ':' + h.key; }).join(' ');
        assert(hs === 'arrow:d angle:angle', 'on-model handles of the angle chamfer: ' + hs);
        return 'Distance Distance -> equal; Angle Distance 60 kept; handles ' + hs;
      } finally { rfOBEnd(); }
    });

    step('rfOB: Chamfer types not built (Vertex, Offset Face, Face Face) stay greyed, say why and do not press; switching between the two live types keeps what was typed in the other', async function () {
      try {
        await rfOBPart(BOX);
        await rfOBOpen(function () { UI.cmdChamfer(); });
        await rfOBClickEdge(EDGE);
        var row = rfOBRow();
        assert(row.map(function (b) { return b.getAttribute('aria-label'); }).join('|') === 'Angle Distance|Distance Distance|Vertex|Offset Face|Face Face', 'the five types in SolidWorks\' order');
        [2, 3, 4].forEach(function (i) {
          assert(row[i].disabled && /not available in Anvil yet \(not built\): use Angle Distance or Distance Distance\.$/.test(row[i].title), row[i].getAttribute('aria-label') + ' greyed with its reason: ' + row[i].title);
          row[i].click();
          assert(UI.pmSpec().values._type === 'dd', row[i].getAttribute('aria-label') + ' does not press');
        });
        rfOBType('Distance  D', '0.25');
        rfOBClickBox('Equal distance'); await wait(30);
        rfOBType('Distance 2  D2', '0.5');
        rfOBRow()[0].click(); await wait(30);
        rfOBType('Angle  A', '30');
        await rfOBPreviewIs(0.25, 0.25 * Math.tan(Math.PI / 6), 'Angle Distance shown');
        rfOBRow()[1].click(); await wait(30);
        assert(!rfOBBox('Equal distance').checked && +rfOBBox('Distance 2  D2').value === 0.5, 'back on Distance Distance: D2 still .5');
        await rfOBPreviewIs(0.25, 0.5, 'Distance Distance shown again');
        rfOBRow()[0].click(); await wait(30);
        assert(+rfOBBox('Angle  A').value === 30, 'back on Angle Distance: A still 30');
        UI.pmCancel();
        return 'three greyed types; D2 and A kept across the switch';
      } finally { rfOBEnd(); }
    });

    step('rfOB: with OpenCascade on (where vendor/occt is installed) a part with a two-distance chamfer and an angle chamfer round a hole is driven by OpenCascade, the same solid as Anvil\'s own (the closed form); OpenCascade built an equal-distance chamfer there before', async function () {
      var was = anvil.occt().on;
      try {
        if (UI.hasPM()) UI.pmCancel();
        await anvil.newPart(); await idle();
        anvil.occt(false, { remember: false });
        // x 0..3, y 0..1, z 0..2; the hole R .5 through the top
        await anvil.run('p.units("in");\np.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\np.hole("Top", 1.5, -1, 1, { offset: 1 });\np.chamfer(0.25, [[1.5, 1, 0]], { d2: 0.5 });\np.chamfer(0.1, [[2, 1, 1]], { angle: 30 });\n'); await idle();
        var want = 6 - Math.PI / 4 - 0.5 * 0.25 * 0.5 * 3 - Math.PI * 0.1 * 0.1 * Math.tan(Math.PI / 6) * (0.5 + 0.1 / 3);
        near(rfOBVolume(), want, 1e-9, 'Anvil\'s volume');
        anvil.occt(true, { remember: false });
        var st = await Promise.race([anvil.occtIdle(), wait(60000).then(function () { return anvil.occt(); })]), t0 = Date.now();
        while (st.state === 'loading' && Date.now() - t0 < 25000) { await Promise.race([anvil.occtIdle(), wait(200)]); await wait(20); st = anvil.occt(); }
        if (st.state === 'failed' || st.state === 'off' || st.state === 'loading') return 'OpenCascade skipped: ' + (st.error || st.state);
        await idle(); st = anvil.occt();
        assert(st.state !== 'unsupported' && st.driving, 'OpenCascade drives the part: ' + JSON.stringify({ state: st.state, driving: st.driving, unsupported: st.unsupported, error: st.error }));
        near(rfOBVolume(), want, 1e-9, 'OpenCascade\'s volume');
        return 'OpenCascade drives (' + st.state + '), volume ' + rfOBVolume().toFixed(9);
      } finally { anvil.occt(was, { remember: false }); await idle(); rfOBEnd(); }
    });
  })();
  // --- end rfOB ---
