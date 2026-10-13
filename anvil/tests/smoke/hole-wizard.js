  // ---- Hole Wizard (run cloud-2026-09-26t): block 60 × 60 × 30 centred on x / z, top face at y = 30
  step('Hole Wizard: two clicks on the top face, Type tab → Counterbore M6 blind 16 → one hole feature (tree icon, one undo step); edit to Straight Tap M8 shows two cosmetic threads; script round trip', async function () {
    var s = await anvil.run('p.box(60, 60, 30, { centered: true });');
    await idle();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    var n0 = UI.App.model.features.length, idx = faceWithNormal([0, 1, 0]);
    UI.cmdHoleWizard();
    assert(UI.hasPM() && UI.pmTitle() === 'Hole Wizard' && UI.App.command && UI.App.command.onPick, 'Hole Wizard PM not waiting for a pick');
    assert(UI.App.command.onPick({ kind: 'face', index: idx, point: [-15, 30, 0] }) !== false, 'first pick rejected');
    assert(UI.App.command.onPick({ kind: 'face', index: idx, point: [15, 30, 10] }) !== false, 'second pick rejected');
    clickPmButton('Type');
    var ty = pmSelect('holeType'), sz = pmSelect('size'), en = pmSelect('end');
    assert(ty && sz && en, 'Type tab selects missing');
    assert(optionValues(ty).join() === 'cbore,csk,hole,tap', optionValues(ty).join());
    setInput(ty, 'cbore'); setInput(pmSelect('size'), 'M6'); setInput(pmSelect('end'), 'blind');
    setInput(pmNumber(0), 16);
    await pmAccept();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(UI.App.model.features.length === n0 + 2 && f.type === 'hole' && f.holeType === 'cbore' && f.size === 'M6' && f.depth === 16, JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], UI.App.build.errors[f.id]);
    var one = Math.PI * 5.5 * 5.5 * 6.5 + Math.PI * 3.3 * 3.3 * (16 - 6.5);   // CBORE Ø11 ↧ 6.5 over Ø6.6 ↧ 16
    near(anvil.summary().volume, 108000 - 2 * one, 1e-3, 'volume');   // summary() rounds to 3 decimals
    var row = D.querySelector('#tree .ti[data-fid="' + f.id + '"]');
    var ic = D.createElement('span'); ic.innerHTML = W.Icons('holeWizard', 16);
    assert(row && row.textContent.indexOf('CBORE for M6 Socket Head Cap Screw1') >= 0, 'tree row ' + (row && row.textContent));
    assert(Array.prototype.some.call(row.querySelectorAll('span'), function (x) { return x.innerHTML === ic.innerHTML; }), 'Hole Wizard tree icon');
    assert(UI.cosmeticThreadCount() === 0, 'no threads on a counterbore');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'one undo step removes sketch + hole: ' + names().join());
    near(anvil.summary().volume, 108000, 1e-3, 'after undo');
    UI.redo(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    UI.editFeature(f);
    assert(UI.hasPM() && UI.pmTitle() === 'Hole Wizard', 'edit PM');
    setInput(pmSelect('holeType'), 'tap'); setInput(pmSelect('size'), 'M8');
    await pmAccept();
    assert(f.holeType === 'tap' && f.size === 'M8' && f.threadDepth === 16, JSON.stringify(f));
    near(anvil.summary().volume, 108000 - 2 * Math.PI * 3.4 * 3.4 * 16, 1e-3, 'tap drill volume');
    assert(UI.cosmeticThreadCount() === 2, 'cosmetic threads: ' + UI.cosmeticThreadCount());
    var code = anvil.script();
    assert(code.indexOf('p.holeWizard({') > 0 && code.indexOf('type: "tap", size: "M8"') > 0, code);
    var v0 = anvil.summary().volume;
    await anvil.run(code); await idle();
    near(anvil.summary().volume, v0, 1e-3, 'round trip volume');
    return 'volume ' + v0.toFixed(3) + ', threads ' + UI.cosmeticThreadCount();
  });

  step('whole curved faces: the Bushing (Ø30 body, Ø36 flange, Ø20 bore) is 6 selectable faces, not one per facet; selecting any facet of a cylinder highlights all of it; Ctrl-click on another facet of it toggles the same face; a crossing box over the part lists each face once', async function () {
    await anvil.run(exByName('Bushing').code); await idle();
    var mesh = UI.App.mesh, cs = W.Kernel.curveSurfaces(mesh);
    var reps = {}; mesh.faces.forEach(function (f, i) { reps[UI.faceGroup(i)[0]] = true; });
    assert(Object.keys(reps).length === 6, 'selectable faces ' + Object.keys(reps).length + ' of ' + mesh.faces.length + ' mesh faces');
    assert(cs.length === 3 && cs.every(function (s) { return s.polys.length > 8; }), 'three cylinders');
    function faceOf(r, k) { var s = cs.filter(function (s) { return Math.abs(s.surf.r - r) < 1e-9; })[0]; return mesh.faces.findIndex(function (f) { return f.polys[0] === s.polys[k || 0]; }); }
    var body = UI.faceGroup(faceOf(15));
    assert(body.length === cs.filter(function (s) { return s.surf.r === 15; })[0].polys.length && body.indexOf(faceOf(15, 5)) >= 0, 'the Ø30 group holds every facet of the Ø30 cylinder');
    assert(UI.faceGroup(faceOf(10)).indexOf(faceOf(15)) < 0 && UI.faceGroup(faceOf(18)).indexOf(faceOf(15)) < 0, 'bore, body and flange stay separate faces');
    // real clicks in the Front view: two different front-facing facets of the Ø30 body; the Ctrl-click on the second
    // toggles the same face off instead of adding a second item
    UI.setView('Front'); await idle();
    var front = body.filter(function (i) { return mesh.faces[i].normal[2] > 0.8; }).sort(function (a, b) { return mesh.faces[b].normal[2] - mesh.faces[a].normal[2]; });
    assert(front.length >= 2, 'front-facing facets of the body: ' + front.length);
    var pA = UI.worldToScreen(mesh.faces[front[0]].centroid), pB = UI.worldToScreen(mesh.faces[front[1]].centroid);
    anvil.clearSelection(); anvil.selectionFilter({ faces: true }); await idle();
    selClick(pA); await idle(); await wait(20);
    var s1 = anvil.selection();
    assert(s1.length === 1 && s1[0].kind === 'face' && body.indexOf(s1[0].index) >= 0, 'click selects the body face: ' + JSON.stringify(s1));
    selClick(pB, { ctrlKey: true }); await idle(); await wait(20);
    assert(anvil.selection().length === 0, 'Ctrl-click on another facet of the same cylinder toggles it off: ' + JSON.stringify(anvil.selection()));
    anvil.selectionFilter({ faces: false });
    // a crossing box over everything: one entry per face
    UI.setView('Isometric'); UI.zoomToFit && UI.zoomToFit(); await idle();
    var vr = D.getElementById('viewport').getBoundingClientRect();
    anvil.selectionFilter({ faces: true });
    await selDrag([vr.width - 20, vr.height - 20], [20, 60]);
    var sel = anvil.selection();
    anvil.selectionFilter({ faces: false }); anvil.clearSelection();
    assert(sel.length === 6 && sel.every(function (s) { return s.kind === 'face'; }), 'crossing box: ' + sel.length + ' faces');
    return 'mesh faces ' + mesh.faces.length + ' -> 6 selectable; cylinder group ' + body.length + ' facets; box 6';
  });

  step('whole curved faces in PropertyManagers: a Shell face pick on one facet of the Bushing body highlights the whole cylinder, and a pick on another facet of it toggles the same face off', async function () {
    await anvil.run(exByName('Bushing').code); await idle();
    var mesh = UI.App.mesh, cs = W.Kernel.curveSurfaces(mesh);
    var s15 = cs.filter(function (s) { return Math.abs(s.surf.r - 15) < 1e-9; })[0];
    function facet(k) { return mesh.faces.findIndex(function (f) { return f.polys[0] === s15.polys[k]; }); }
    var grp = UI.faceGroup(facet(0)), tris = 0;
    grp.forEach(function (i) { tris += mesh.faces[i].count; });
    anvil.clearSelection(); UI.App.sel = null; UI.App.hover = null;
    UI.cmdShell();
    assert(UI.hasPM() && UI.App.command && UI.App.command.onPick, 'Shell PM waiting for a pick');
    var f0 = mesh.faces[facet(0)];
    UI.App.command.onPick({ kind: 'face', index: facet(0), point: f0.centroid.slice() }); await idle();
    var hl = UI.groups.highlight.children.filter(function (c) { return c.isMesh; })
      .reduce(function (n, c) { return n + c.geometry.getAttribute('position').count / 3; }, 0);
    assert(hl === tris, 'highlighted triangles ' + hl + ', whole cylinder ' + tris + ' (' + grp.length + ' facets)');
    var f5 = mesh.faces[facet(5)];
    UI.App.command.onPick({ kind: 'face', index: facet(5), point: f5.centroid.slice() }); await idle();
    var left = UI.App.command.faceList.length;
    UI.pmCancel(); await idle();
    assert(left === 0, 'second facet of the same cylinder toggled the face off, faces left ' + left);
    return 'shell pick highlights ' + grp.length + ' facets / ' + tris + ' triangles';
  });

  step('whole freeform faces: the Mug handle (sweep) and the Handlebar pick as whole faces, Rounded handle fillets group without swallowing the flat faces they blend into, and flanges / extrudes are never merged', async function () {
    var model = function () { return UI.App.model; };
    function groupsOf(name) {
      return anvil.run(exByName(name).code).then(idle).then(function () {
        var mesh = UI.App.mesh, g = UI.faceGroups(), seen = new Set(), out = [];
        g.forEach(function (x) { if (!seen.has(x)) { seen.add(x); out.push(x); } });
        return { mesh: mesh, groups: out };
      });
    }
    function typeOf(mesh, i) {
      var f = W.Kernel.findFeature(model(), mesh.faces[i].polys[0].shared);
      while (f && /pattern|mirror/.test(f.type) && f.feature != null) f = W.Kernel.findFeature(model(), f.feature);
      return f ? f.type : '?';
    }
    function isAnalytic(mesh, grp) { return grp.every(function (i) { return mesh.faces[i].polys.every(function (p) { return p.surf; }); }); }
    // every multi-facet group is one analytic surface, or one sweep / loft / fillet feature; never two features
    function checkSane(r, name) {
      r.groups.forEach(function (grp) {
        if (grp.length < 2 || isAnalytic(r.mesh, grp)) return;
        var ids = new Set(grp.map(function (i) { return r.mesh.faces[i].polys[0].shared; }));
        assert(ids.size === 1, name + ': a freeform group spans features ' + Array.from(ids).join());
        var t = typeOf(r.mesh, grp[0]);
        assert(t === 'sweep' || t === 'loft' || t === 'fillet', name + ': a ' + t + ' face group of ' + grp.length + ' facets');
      });
    }
    var mug = await groupsOf('Mug');
    checkSane(mug, 'Mug');
    var sweepFaces = mug.mesh.faces.map(function (f, i) { return i; }).filter(function (i) { return typeOf(mug.mesh, i) === 'sweep'; });
    var biggest = mug.groups.filter(function (g) { return typeOf(mug.mesh, g[0]) === 'sweep'; }).sort(function (a, b) { return b.length - a.length; })[0];
    assert(biggest && biggest.length >= 0.9 * sweepFaces.length, 'the handle is one face: ' + (biggest && biggest.length) + ' of ' + sweepFaces.length + ' sweep facets');
    UI.App.sel = { kind: 'face', index: biggest[biggest.length - 1] }; UI.updateHighlights();
    assert(anvil.selection().length === 1, 'one selected face');
    UI.App.sel = null; UI.updateHighlights();
    var bar = await groupsOf('Handlebar');
    checkSane(bar, 'Handlebar');
    assert(bar.groups.length <= 6 && bar.mesh.faces.length > 100, 'Handlebar: ' + bar.groups.length + ' faces from ' + bar.mesh.faces.length + ' facets');
    var rh = await groupsOf('Rounded handle');
    checkSane(rh, 'Rounded handle');
    assert(rh.groups.length < rh.mesh.faces.length / 5, 'Rounded handle: ' + rh.groups.length + ' faces from ' + rh.mesh.faces.length);
    var ub = await groupsOf('Sheet-metal U-bracket');
    checkSane(ub, 'Sheet-metal U-bracket');
    return 'Mug handle ' + biggest.length + ' facets; Handlebar ' + bar.groups.length + ' / ' + bar.mesh.faces.length + '; Rounded handle ' + rh.groups.length + ' / ' + rh.mesh.faces.length + '; U-bracket ' + ub.groups.length + ' / ' + ub.mesh.faces.length;
  });

  step('Tools ▸ OpenCascade kernel: OpenCascade\'s solid drives the part (exact volume): the Flange picks as its 12 B-rep faces, the Mug (shell + sweep) as its 8, the Spacer\'s coplanar pocket floors apart (21), the U-bracket (sheet metal) as its 24 with its flat pattern, STEP / IGES from its B-rep; an STL import keeps Anvil\'s result with "needs a mesh import", and switching off restores Anvil\'s own (skipped without vendor/occt)', async function () {
    function occIdle() { return Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]); }
    function groups() { return new Set(UI.faceGroups()).size; }
    await anvil.run(exByName('Flange').code); await idle();
    var anvilGroups = groups();
    anvil.occt(true, { remember: false });
    var s = await occIdle();
    try {
      if (s.state === 'failed') return 'skipped: ' + (s.error || 'OpenCascade not installed').slice(0, 80);
      assert(s.state === 'ok', 'state ' + s.state + ' ' + (s.error || s.unsupported || ''));
      assert(s.faces === 12 && s.valid && s.volumeDiff < 1e-9, 'Flange: ' + JSON.stringify({ faces: s.faces, valid: s.valid, dv: s.volumeDiff }));
      // OpenCascade's solid drives the part: its polygons carry their B-rep faces, mass properties are its exact ones
      assert(s.driving && UI.App.build.occt && UI.App.mesh.faces[0].polys[0].face != null, 'the shown solid is OpenCascade\'s');
      assert(UI.App.mesh.exact && Math.abs(anvil.summary().volume - s.volume) < 1e-3, 'exact volume ' + anvil.summary().volume + ' vs ' + s.volume);
      assert(groups() === 12, 'selectable faces ' + groups());
      assert(/OpenCascade ✓ 12 faces/.test($('status-right').textContent), 'status chip: ' + $('status-right').textContent);
      var item = menuRows('OpenCascade kernel ▸ Use OpenCascade')[0];
      if (UI.closeMenus) UI.closeMenus();
      assert(item && item.menu.indexOf('Tools') >= 0 && item.chk === '✓', 'Tools menu item checked: ' + JSON.stringify(item && { menu: item.menu, chk: item.chk }));
      // stage 2: shell + sweep build too; the Mug picks as its 8 B-rep faces
      await anvil.run(exByName('Mug').code); await idle();
      var m = await occIdle();
      assert(m.state === 'ok' && m.faces === 8 && groups() === 8, 'Mug: ' + m.state + ' ' + m.faces + ' faces, ' + groups() + ' groups');
      // STEP / IGES come from OpenCascade's B-rep: the handle is an exact torus, the file small; IGES is offered
      var stp = anvil.exportStep(), igs = anvil.exportIges();
      assert(/TOROIDAL_SURFACE/.test(stp) && stp.length < 200000 && /PRODUCT\('Mug','Mug'/.test(stp), 'STEP from OpenCascade: ' + stp.length + ' bytes');
      assert(igs && igs.length > 1000 && UI.exportData('iges', 'x').name === 'x.igs', 'IGES export');
      // coplanar faces stay apart: the Spacer's three pocket floors are three faces (Anvil's own mesh merges them)
      await anvil.run(exByName('Configured spacer').code); await idle();
      var sp = await occIdle();
      assert(sp.state === 'ok' && sp.faces === 21 && groups() === 21, 'Spacer: ' + sp.faces + ' faces, ' + groups() + ' groups');
      // sheet metal builds too (exact bends), and its flat pattern still unfolds
      await anvil.run(exByName('Sheet-metal U-bracket').code); await idle();
      var u = await occIdle();
      assert(u.state === 'ok' && u.driving && u.faces === 24, 'U-bracket: ' + u.state + ' ' + u.faces);
      var flat = anvil.flat();
      assert(flat.bends.length === 2 && Math.abs(flat.bbox.max[0] - flat.bbox.min[0] - 210.74) < 0.05, 'flat pattern ' + JSON.stringify(flat.bbox));
      // an STL import has no B-rep: Anvil's result stays and the chip says why
      var stl = anvil.stl();
      await anvil.importFile('part.stl', stl); await idle();
      var q = await occIdle();
      assert(q.state === 'unsupported' && /mesh import/.test(q.unsupported) && !UI.App.build.occt, 'STL import: ' + q.state + ' ' + q.unsupported);
      assert(/needs a mesh import/.test($('status-right').textContent), 'chip: ' + $('status-right').textContent);
      // beyond Anvil's kernel: a fillet on the saddle edge of a pipe tee (Anvil's kernel errors); OpenCascade's solid
      // is shown and the feature carries no error
      await anvil.run('p.cylinder(15, 80, { axis: "x", at: [-40, 0, 0] });\np.cylinder(10, 40, { at: [0, 0, 0] });\np.fillet(3, [[0, Math.sqrt(125), 10]]);').catch(function () { });
      await idle();
      var tee = await occIdle();
      assert(tee.state === 'ok' && tee.beyond.length === 1 && Object.keys(UI.App.build.errors).length === 0 && /Anvil could not/.test($('status-right').textContent), 'tee fillet: ' + JSON.stringify({ state: tee.state, beyond: tee.beyond, errors: UI.App.build.errors }));
      // assemblies: every part built by OpenCascade, the assembly rebuilt around them, mates solved as ever
      await UI.openExample(exByName('Pinned plate assembly')); await idle();
      var pa = await occIdle();
      assert(pa.state === 'ok' && pa.faces === 19 && UI.App.build.occt && UI.App.build.occt.parts === 3 && anvil.mates().every(function (mt) { return mt.ok; }) && anvil.interference().count === 0,
        'Pinned plate assembly: ' + JSON.stringify({ state: pa.state, faces: pa.faces, error: pa.error }));
      await anvil.run(exByName('Flange').code); await idle(); await occIdle();
      return 'Flange 12 faces (Anvil grouping ' + anvilGroups + '), loaded in ' + Math.round(s.loadMs) + ' ms, build ' + Math.round(s.ms.build) + ' ms; Mug 8 faces; Spacer 21 faces; U-bracket 24 faces, flat 2 bends; STL import: Anvil\'s';
    } finally {
      anvil.occt(false, { remember: false });
      assert(!anvil.occt().on && !UI.App.build.occt && groups() === anvilGroups, 'switched off, Anvil\'s build back: ' + groups() + ' groups');
    }
  });

