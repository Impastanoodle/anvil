  // --- rfJT (2026-11-06, lane sketchtext): Stencil Sketch Text for a laser-cut part number in an inch sheet, by
  // clicks: the PM's Stencil box says it is an Anvil option, Bridge width starts at .06 in, and the Cut-Extrude of
  // "B0" through a .06 Base Flange keeps every centre (one piece; the same volume as the kernel's own build). ---
  function rfJTPieces(mesh) {   // connected pieces of a mesh (vertices welded at 1e-7)
    var P = mesh.positions64 || mesh.positions, n = P.length / 9, par = [], key = {}, i, k;
    function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    for (i = 0; i < n; i++) par.push(i);
    for (i = 0; i < n; i++) for (k = 0; k < 3; k++) {
      var o = 9 * i + 3 * k, id = Math.round(P[o] * 1e7) + ',' + Math.round(P[o + 1] * 1e7) + ',' + Math.round(P[o + 2] * 1e7);
      if (key[id] == null) key[id] = i; else par[find(i)] = find(key[id]);
    }
    var roots = {};
    for (i = 0; i < n; i++) roots[find(i)] = true;
    return Object.keys(roots).length;
  }
  step('rfJT: inch sheet ▸ Sketch Text "B0" ▸ Cut ▸ Stencil (an Anvil option, Bridge width .06 in by default) placed by a click, then Cut-Extrude through the .06 Base Flange: one piece (the centres of B and 0 stay), volume as the kernel builds it', async function () {
    var errs0 = errors.length;
    await anvil.run('p.units("in");\np.sheet(0.06, 0.06, 0.71);\np.sketch("Top").rect(0, 0, 3, 1.5);\np.baseFlange(0.06);'); await idle();
    assert(UI.App.model.units === 'in', 'inch part');
    near(anvil.summary().volume, 3 * 1.5 * 0.06, 1e-9, 'the blank');
    await UI.newSketchOnPlane('Top'); await idle();
    var f = UI.activeSketchFeature();
    UI.zoomView(1); UI.refreshRibbon();
    UI.resetSketchTextTool();   // earlier groups leave their last text's values on the tool
    txtButton().click(); await idle();
    assert(UI.pmTitle() === 'Sketch Text', 'PM ' + UI.pmTitle());
    txtType('B0'); setInput(pmField('Height'), 0.5);
    D.querySelector('#pm input[type=radio][value="outline"]').click(); await idle();
    var st = pmField('Stencil');
    assert(st && st.type === 'checkbox' && !st.checked, 'Stencil box, off: ' + (st ? st.type + ' ' + st.checked : 'none') + ' | ' + D.getElementById('pm').innerText.replace(/\s+/g, ' ').slice(0, 400));
    var lab = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.indexOf('Stencil') >= 0; })[0];
    assert(lab && /Anvil option/.test(lab.textContent), 'the box says it is an Anvil option: ' + (lab && lab.textContent));
    st.click(); await idle();
    var bw = pmField('Bridge width');
    assert(bw && Math.abs(+bw.value - 0.06) < 1e-9, 'Bridge width .06 in: ' + (bw && bw.value));
    setInput(pmField('Stroke width'), 0.06); await idle();
    skClick(0.25, 0.25); await idle();
    var e = f.entities.filter(function (x) { return x.t === 'text'; })[0];
    assert(e && e.mode === 'outline' && e.stencil === true && e.bridge === 0.06 && e.str === 'B0', 'placed ' + JSON.stringify(e));
    var prof = K.sketchProfile(f);
    assert(!prof.loops.some(function (l) { return l.hole || l.cross; }), 'no island in the profile: ' + prof.loops.length + ' loops');
    await UI.pmOK(); await idle();
    UI.exitSketch(); await idle();
    UI.cmdExtrude(true); await idle();
    assert(UI.pmTitle() === 'Cut-Extrude', 'PM ' + UI.pmTitle());
    var ec = D.querySelector('#pm select[data-key="end"]') || pmField('End Condition') || pmField('Direction 1');
    if (ec && ec.tagName === 'SELECT' && Array.prototype.some.call(ec.options, function (o) { return o.value === 'through'; })) { ec.value = 'through'; ec.dispatchEvent(new W.Event('change', { bubbles: true })); await idle(); }
    await pmAccept(); await idle();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    assert(rfJTPieces(UI.App.mesh) === 1, 'one piece: ' + rfJTPieces(UI.App.mesh));
    var x = JSON.parse(JSON.stringify(e)), m = K.newModel('rfJT'), feats = UI.App.model.features, cutF = feats[feats.length - 1];
    assert(cutF.type === 'extrude' && cutF.cut, 'a Cut-Extrude: ' + JSON.stringify(cutF));
    K.runScript(m, 'p.units("in");\np.sheet(0.06, 0.06, 0.71);\np.sketch("Top").rect(0, 0, 3, 1.5);\np.baseFlange(0.06);\np.sketch("Top").text(' + x.x + ', ' + x.y + ', "B0", { h: 0.5, mode: "outline", strokeWidth: ' + x.strokeWidth + ', stencil: true, bridge: 0.06 }).cut("through", { normalCut: ' + !!cutF.normalCut + ' });');
    var b = K.rebuild(m), mp = K.massProps(K.meshFromBody(b.body), 1);
    assert(mp.volume < 3 * 1.5 * 0.06 - 1e-4, 'the kernel build cut the text: ' + mp.volume);
    var uv = K.massProps(UI.App.mesh, 1).volume;
    near(uv, mp.volume, 1e-9 * mp.volume, 'the UI cut = the kernel build');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'volume ' + uv.toFixed(6) + ' in³, one piece';
  });
  step('rfJT: the Text tool keeps its last values for the next text, scaled when the next part is in the other units (a .06 in bridge is 1.524 mm in a mm part, not "0.06")', async function () {
    await anvil.newPart(); await idle();
    UI.App.model.units = 'in';
    await UI.newSketchOnPlane('Front'); await idle();
    UI.resetSketchTextTool();
    UI.setTool('text'); await idle();
    D.querySelector('#pm input[type=radio][value="outline"]').click(); await idle();
    if (!pmField('Stencil').checked) { pmField('Stencil').click(); await idle(); }
    near(+pmField('Bridge width').value, 0.06, 1e-9, 'inch bridge');
    UI.cancelTool(); UI.exitSketch(); await idle();
    await anvil.newPart(); await idle();
    UI.App.model.units = 'mm';
    await UI.newSketchOnPlane('Front'); await idle();
    UI.setTool('text'); await idle();
    near(+pmField('Bridge width').value, 1.524, 1e-9, 'the same bridge in mm');
    near(+pmField('Height').value, 3.175, 1e-9, 'the .125 in height in mm');
    UI.cancelTool(); UI.exitSketch(); await idle();
    UI.resetSketchTextTool();
    return 'bridge 1.524 mm, height 3.175 mm';
  });
