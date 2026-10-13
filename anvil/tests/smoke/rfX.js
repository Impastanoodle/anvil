  // ---- rfX (sketch fidelity 3, 2026-10-12): a sketch multi-selection survives a rebuild that finishes while the user
  // is still picking (finding 1: four preselected slot entities reached Linear Sketch Pattern as two)
  step('rfX: a four-entity slot preselection reaches Linear Sketch Pattern whole after the mesh changed under it', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0.2, x2: 1, y2: 0.2 }, { t: 'arc', cx: 1, cy: 0, r: 0.2, a0: 270, a1: 450 }, { t: 'line', x1: 1, y1: -0.2, x2: 0, y2: -0.2 }, { t: 'arc', cx: 0, cy: 0, r: 0.2, a0: 90, a1: 270 }, { t: 'line', x1: 0, y1: 0, x2: 1, y2: 0, construction: true });
    UI.updateSketches(); await idle();
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; }));
    assert(UI.selection().length === 4, 'four selected');
    var m0 = UI.App.mesh;
    UI.App.mesh = m0 ? Object.create(m0) : {};   // a rebuild handed the app a new mesh
    var n = UI.selection().length;
    UI.App.mesh = m0;
    assert(n === 4, 'still four after the mesh changed: ' + n);
    UI.cmdSketchPattern(); await idle();
    var box = (D.querySelector('#pm .pm-list') || {}).textContent || '';
    assert(/Line1/.test(box) && /Arc2/.test(box) && /Line3/.test(box) && /Arc4/.test(box), 'Entities to Pattern lists all four: ' + box);
    UI.closePM(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'four entities kept';
  });
  // --- end rfX ---
