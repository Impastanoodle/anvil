  // ---- rfGW (2026-11-02, lane swcheck): the rollback bar and an absorbed sketch, as SolidWorks 2022 (Feature.IsRolledBack read
  // over COM): rolling back to a feature rolls its sketch with it, the bar never goes between the two, Roll Forward takes them
  // together, a new feature lands at the bar above both.
  step('rfGW: Rollback on a cut rolls its sketch too; Roll Forward takes both; a sketch made while rolled back lands above them', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\np.sketch("Front", 20).rect(10, 10, 20, 20).end().cut(5);\np.sketch("Front", 20).rect(60, 10, 20, 20).end().extrude(10);');
    await idle();
    var m = UI.App.model, cut = m.features.filter(function (f) { return f.type === 'extrude'; })[1], sk = m.features[m.features.indexOf(cut) - 1];
    assert(sk.type === 'sketch' && cut.sketch === sk.id, 'the cut uses the sketch above it');
    await UI.rollbarTo(m.features.indexOf(cut));
    await idle();
    assert(UI.rollbarIndex() === m.features.indexOf(sk), 'the bar is above the sketch, not between: ' + UI.rollbarIndex());
    assert(UI.rollbarRolled(sk) && UI.rollbarRolled(cut), 'both rolled');
    var rows = Array.prototype.map.call(D.querySelectorAll('#tree > .ti[data-fid]'), function (r) { return +r.getAttribute('data-fid'); });
    assert(rows.indexOf(sk.id) < 0, 'the sketch stays folded under its feature: ' + rows);
    assert(UI.rollbarTo(UI.rollbarIndex() + 1) === false, 'a drop between the two is no move');
    await UI.rollbarForward();
    await idle();
    assert(!UI.rollbarRolled(sk) && !UI.rollbarRolled(cut), 'Roll Forward takes the sketch and the cut');
    await UI.rollbarEnd();
    await idle();
    assert(!UI.App.model.rollbar, 'rolled to the end');
  });
