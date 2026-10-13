  // --- r10/asmfaces10 ---
  step('r10/asmfaces10: Anvil kernel — clicking the Hinged cover\'s arm front selects that face only (the coplanar leaf front is another face), and the pick names Arm<1> inside Hinge<1>', async function () {
    var was = anvil.occt().on;
    anvil.occt(false, { remember: false });
    try {
      await UI.openExample(W.AnvilExamples.filter(function (e) { return e.name === 'Hinged cover (sub-assemblies)'; })[0]); await idle();
      UI.setView('Back'); await wait(30);
      var A = UI.App, comps = anvil.components(), h1 = comps.findIndex(function (c) { return c.name === 'Hinge<1>'; });
      // Hinge<1>'s standing arm: x 45..50, y 16..56, front at z = 0 (its leaf, x 10..50 / y 10..15, is in the same plane)
      var p = UI.worldToScreen([47.5, 35, 0]);
      selClick(p); await wait(30);
      assert(A.sel && A.sel.kind === 'face', 'face selected: ' + JSON.stringify(A.sel && A.sel.kind));
      var f = A.mesh.faces[A.sel.index], grp = UI.faceGroup(A.sel.index);
      assert(f.body === h1 && grp.length === 1, 'one face of Hinge<1>: body ' + f.body + ', group ' + grp.length);
      near(f.area, 200, 1e-6, 'the arm front only (5 × 40)');
      assert(f.polys.every(function (q) { return q.part === f.part; }), 'one part');
      var ref = W.Assembly.refFromPick(A.model, A.build, A.sel.index, A.sel.point || f.centroid, A.mesh);
      var arm = W.Assembly.findComponent(A.build.partBuilds[comps[h1].id].model, ref && ref.path && ref.path[0]);
      assert(arm && arm.name === 'Arm<1>', 'pick ref ' + JSON.stringify(ref));
      anvil.clearSelection();
      return 'arm front ' + f.area.toFixed(1) + ' mm², ' + A.mesh.faces.length + ' faces';
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
  // --- end r10/asmfaces10 ---
