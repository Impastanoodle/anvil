  // --- r13/lines13 ---
  // ink on the 3D canvas: the summed darkness (765 - r - g - b, opaque pixels) of pixels darker than th (r + g + b)
  function r13dark(th) {
    UI.render();
    var c = UI.renderer.domElement, cv = D.createElement('canvas');
    cv.width = c.width; cv.height = c.height;
    var g = cv.getContext('2d'); g.drawImage(c, 0, 0);
    var px = g.getImageData(0, 0, cv.width, cv.height).data, n = 0;
    for (var i = 0; i < px.length; i += 4) { var s = px[i] + px[i + 1] + px[i + 2]; if (px[i + 3] > 200 && s < (th || 400)) n += 765 - s; }
    return n;
  }
  function r13fatChildren(group) {
    var out = [];
    group.children.forEach(function (o) { if (o.userData.fat && o.userData.fat.mesh) out.push(o.userData.fat); });
    return out;
  }
  step('r13 thick lines: model edges and silhouettes drawn as 1.5 px screen-space quads, wider than the 1-pixel lines, picking unchanged', async function () {
    await anvil.run('p.box(40, 20, 30);\np.hole("Top", 20, -15, 10, { offset: 20 });');
    await idle();
    UI.App.hover = null; UI.App.sel = null; UI.App.sel2 = null; UI.updateHighlights();
    UI.setStyle('hlr'); UI.setView('Isometric'); await wait(700); UI.tick();   // white body, nothing highlighted: every dark pixel is line ink
    assert(UI.thickLines(), 'thick lines on (WebGL instancing available)');
    var fats = r13fatChildren(UI.groups.edges);
    assert(fats.length >= 1, 'the edge line set has a thick twin');
    var edgeObj = UI.groups.edges.children[0];
    assert(!edgeObj.layers.test(UI.camera.layers), 'the 1-pixel line set itself is not drawn');
    assert(edgeObj.geometry.getAttribute('position').count % 2 === 0, 'the line set keeps its segment positions (picking, box selection)');
    near(fats[0].mesh.material.uniforms.linewidth.value, UI.LINE_W.edge, 1e-9, 'edge width (CSS px)');
    near(fats[0].mesh.geometry.instanceCount, edgeObj.geometry.getAttribute('position').count / 2, 0, 'one quad per segment');
    var e = UI.App.edges.filter(function (x) { return !x.smooth && x.faces.length === 2; })[0];
    var s = UI.worldToScreen(e.mid), thick = r13dark(700), pk1 = UI.pickEdge(s[0], s[1]);
    UI.thickLines(false); UI.tick();
    var thin = r13dark(700), pk0 = UI.pickEdge(s[0], s[1]);
    assert(edgeObj.layers.test(UI.camera.layers) && !edgeObj.userData.fat, 'off: the plain line set is drawn again');
    UI.thickLines(true); UI.tick();
    // a 1-pixel line with MSAA already spreads over two partial pixels, so 1.5 px adds ~15 % ink; 4 px must add plenty
    UI.mats.edge.userData.lineWidth = 4; UI.mats.silhouette.userData.lineWidth = 4;
    var w4 = r13dark(700);
    UI.mats.edge.userData.lineWidth = UI.LINE_W.edge; UI.mats.silhouette.userData.lineWidth = UI.LINE_W.edge; UI.tick();
    assert(thick > thin * 1.05 && w4 > thin * 2, 'wider edges carry more ink: 1 px ' + thin + ', 1.5 px ' + thick + ', 4 px ' + w4);
    assert((pk1 && pk1.edge) === (pk0 && pk0.edge), 'the same edge is picked with thick and thin lines');
    return 'ink 1 px ' + thin + ' → 1.5 px ' + thick + ' (4 px ' + w4 + ')';
  });
  step('r13 thick lines: Hidden Lines Visible draws hidden edges dashed (a second pass that passes only behind the body), section view clips them', async function () {
    UI.setStyle('hlr'); UI.tick();
    var hlr = r13dark(700);
    UI.setStyle('hlv'); UI.tick();
    var hlv = r13dark(700), f = r13fatChildren(UI.groups.edges)[0];
    assert(f.hid && f.hid.visible, 'a hidden-line pass exists');
    assert(f.hid.material.depthFunc === W.THREE.GreaterDepth && f.hid.material.defines.DASHED != null, 'dashed, depth test greater');
    assert(hlv > hlr * 1.05, 'hidden edges add ink: ' + hlv + ' vs ' + hlr);
    assert(UI.getBodyMesh().material === UI.mats.hlr, 'the body is the background-coloured occluder');
    UI.App.view.section = { plane: new W.THREE.Plane(new W.THREE.Vector3(0, 0, -1), 15) }; UI.applyDisplayStyle(); UI.tick();
    assert(f.mesh.material.clippingPlanes && f.mesh.material.clippingPlanes[0] === UI.App.view.section.plane, 'thick edges clipped by the section plane');
    assert(f.hid.material.clippingPlanes && f.hid.material.clippingPlanes[0] === UI.App.view.section.plane, 'hidden pass clipped too');
    UI.App.view.section = null; UI.setStyle('shadedEdges'); UI.tick();
    assert(!f.hid.visible, 'hidden pass off outside HLV');
    return 'ink HLR ' + hlr + ' → HLV ' + hlv;
  });
  step('r13 thick lines: sketch entities 2 px, construction dashed; selected / pre-highlighted edges 3 px', async function () {
    await anvil.run('p.sketch("Front").rect(-20, -10, 40, 20).line(-30, 0, 30, 0).construction([1]);');
    await idle();
    var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
    UI.enterSketch(sk.id); UI.tick();
    var widths = [], kinds = [];
    UI.groups.sketches.children.forEach(function (o) { var f = o.userData.fat; if (f && f.mesh && o.userData.sketch != null) { widths.push(f.mesh.material.uniforms.linewidth.value); kinds.push(f.mesh.material.userData.fatKind); } });
    UI.exitSketch(); await idle();
    assert(widths.length >= 2, 'sketch entities have thick twins');
    assert(widths.indexOf(UI.LINE_W.sketch) >= 0, 'sketch width ' + widths.join(','));
    assert(kinds.indexOf('dash') >= 0, 'the centerline is dashed: ' + kinds.join(','));
    await anvil.run('p.box(40, 20, 30);'); await idle();
    var e = UI.App.edges.filter(function (x) { return !x.smooth; });
    UI.App.sel = { kind: 'edge', edge: e[0], index: UI.App.edges.indexOf(e[0]) }; UI.App.hover = { kind: 'edge', edge: e[1], index: UI.App.edges.indexOf(e[1]) };
    UI.updateHighlights(); UI.tick();
    var hw = r13fatChildren(UI.groups.highlight).map(function (f) { return f.mesh.material.uniforms.linewidth.value; });
    UI.App.sel = null; UI.App.hover = null; UI.updateHighlights(); UI.tick();
    assert(hw.length === 2 && hw.every(function (w) { return w === UI.LINE_W.edgeSel || w === UI.LINE_W.edgeHover; }) && hw[0] > UI.LINE_W.edge, 'highlight widths ' + hw.join(','));
  });
  // --- end r13/lines13 ---
