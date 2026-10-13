  // ---- rfAF (sketch / shop leftovers 2026-10-12g): a script's arc slot explodes on Sketch Fillet as a straight slot does;
  // the over-defined sketch warning is the same whether the Web Worker or the page built the part
  var rfAF_OVER = 'p.units("in");\np.sketch("Top").line(0, 0, 4, 0).line(4, 0, 4, -2).line(4, -2, 0, -2).line(0, -2, 0, 0).dim(0, "len", { value: 4 }).rel("distance", ["0.p1", "0.p2"], { value: 4 }).extrude(0.25);';
  step('rfAF: Sketch Fillet between a script arc slot\'s outer arc and a line — the arc slot becomes its outer / end / inner / end arcs and construction centre arc (as SolidWorks draws it), the fillet R2 is Tangent + Coincident at both ends with its R dimension, nothing over defined', async function () {
    var errs0 = errors.length;
    var res = await rfAFillet([{ t: 'aslot', cx: 0, cy: 0, r: 10, a0: 30, a1: 150, w: 4 }, { t: 'line', x1: -20, y1: 15, x2: 20, y2: 15 }], null, 2, [[12 * Math.cos(Math.PI / 3), 12 * Math.sin(Math.PI / 3)], [5, 15]]);
    var k = rfAFilletOk(res, 'arc slot outer arc and a line', 2), f = res.f;
    assert(!f.entities.some(function (e) { return e.t === 'aslot'; }), 'no aslot left: ' + JSON.stringify(f.entities.map(function (e) { return e.t; })));
    var con = f.entities.filter(function (e) { return e.t === 'arc' && e.construction; });
    assert(con.length === 1 && Math.abs(con[0].r - 10) < 1e-6, 'construction centre arc R10: ' + JSON.stringify(con));
    var a = f.entities[k];
    near(Math.hypot(a.cx, a.cy), 14, 1e-6, 'fillet tangent to the outer arc (R12 + 2)'); near(a.cy, 13, 1e-6, 'fillet tangent to the line');
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return f.entities.length + ' entities, ' + (f.rels || []).length + ' relations';
  });
  step('rfAF: a part built from an over-defined sketch carries the same over-defined warnings (sketch and Boss-Extrude) with the Web Worker on (the build really came from worker.js) as with it off', async function () {
    var errs0 = errors.length, was = anvil.workerOn(), out = [];
    try {
      for (var pass = 0; pass < 2; pass++) {
        var on = pass === 0;
        anvil.workerOn(on);
        await anvil.newPart(); await idle();
        await anvil.run(rfAF_OVER); await idle();
        var M = UI.App.model, sk = M.features.filter(function (x) { return x.type === 'sketch'; })[0], ex = M.features.filter(function (x) { return x.type === 'extrude'; })[0];
        var Wn = UI.App.build.warnings || {};
        assert(sk && ex && anvil.summary().volume > 0, (on ? 'worker' : 'page') + ': it builds');
        if (on) assert(UI.App.workerOn && UI.App.mesh.workerSeq != null, 'the build came from the worker: ' + JSON.stringify([UI.App.workerOn, UI.App.mesh.workerSeq]));
        else assert(!UI.App.workerOn && UI.App.mesh.workerSeq == null, 'the build ran on the page');
        assert(/over defined/.test(Wn[sk.id] || '') && /over defined/.test(Wn[ex.id] || ''), (on ? 'worker' : 'page') + ' warnings: ' + JSON.stringify(Wn));
        var rows = Array.prototype.filter.call(D.querySelectorAll('#tree .warn'), function (r) { return r.textContent.indexOf(ex.name) >= 0; });
        assert(rows.length > 0, (on ? 'worker' : 'page') + ': the Boss-Extrude row is marked');
        out.push((on ? 'worker: ' : 'page: ') + Wn[ex.id]);
      }
    } finally { anvil.workerOn(was); }
    assert(out[0].replace(/^worker: /, '') === out[1].replace(/^page: /, ''), 'same warning both ways: ' + out.join(' / '));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return out[0];
  });
  // --- end rfAF ---
