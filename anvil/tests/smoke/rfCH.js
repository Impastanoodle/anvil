  // --- rfCH (2026-10-14, lane CH: Trim at a T-junction, with real mouse events) --- a line two lines end on (one held
  // there by a Coincident, one on it within floating-point noise): Power trim dragged across its lower piece takes that
  // piece only, the hover span and Trim to closest on the middle piece stop at the junctions; an end that stops short
  // of the line is no junction, and the trail across the line deletes it whole as before. Uses trimSketch / trimDrag /
  // trimMode / trimRels (r13-trim13) and rskScr / rskClick / rskEnts (refine-sketcher).
  step('rfCH: Power trim dragged across the lower piece of a line two lines end on removes only that piece (end to end Coincident at the junction); hovering the middle piece spans junction to junction, and Trim to closest there leaves the top piece', async function () {
    var TEE = [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 40 }, { t: 'line', x1: 20, y1: 5, x2: 0, y2: 10 }, { t: 'line', x1: 20, y1: 35, x2: 1e-12, y2: 30 }];
    await trimSketch(TEE, [{ type: 'coincident', refs: ['1.p2', '0'] }]);
    UI.cmdTrimEntities();
    assert(D.querySelector('#pm input[value=power]').checked, 'Power trim is the default');
    await trimDrag([[-4, 5], [-2, 5], [0, 5], [2, 5], [4, 5]]);
    var E = rskEnts();
    assert(E.length === 3 && E[0].t === 'line', 'the line stays, trimmed: ' + JSON.stringify(E));
    near(E[0].x1, 0, 1e-6, 'kept line x1'); near(E[0].y1, 10, 1e-6, 'the kept line starts at the lower junction'); near(E[0].y2, 40, 1e-6, 'and runs to the top');
    var R = trimRels();
    assert(R.indexOf('coincident:0.p1,1.p2') >= 0 || R.indexOf('coincident:1.p2,0.p1') >= 0, 'end to end at the lower junction: ' + R.join(' '));
    assert(R.indexOf('coincident:2.p2,0') >= 0, 'the untied junction is tied to the line: ' + R.join(' '));
    // hovering the middle piece: the span runs from the junction at 10 to the one at 30 (screen y runs down)
    selEv('mousemove', rskScr([0.5, 20]));
    var span = D.querySelector('#dim-layer .sk-trim-span');
    assert(span, 'no hover span');
    var ys = span.getAttribute('points').split(' ').map(function (s) { return +s.split(',')[1]; }).sort(function (a, b) { return a - b; });
    var sy30 = rskScr([0, 30])[1], sy10 = rskScr([0, 10])[1];
    assert(ys.length === 2 && Math.abs(ys[0] - sy30) < 1 && Math.abs(ys[1] - sy10) < 1, 'span between the junctions: ' + ys + ' vs ' + sy30 + ',' + sy10);
    trimMode('closest');
    rskClick([0.5, 20]);
    E = rskEnts();
    assert(E.length === 3 && E[0].t === 'line', 'the middle piece went: ' + JSON.stringify(E));
    near(E[0].y1, 30, 1e-6, 'the top piece stays, from the upper junction'); near(E[0].y2, 40, 1e-6, 'to the top');
    R = trimRels();
    assert(R.indexOf('coincident:0.p1,2.p2') >= 0 || R.indexOf('coincident:2.p2,0.p1') >= 0, 'end to end at the upper junction: ' + R.join(' '));
    assert(UI.sketchStatus().rels.every(function (s) { return s === 'ok'; }), 'relations ok: ' + JSON.stringify(UI.sketchStatus().rels));
    trimMode('power');   // the option is remembered across PMs: leave it as found
    UI.pmOK(); await idle();
    return R.join(' ');
  });
  step('rfCH: an end that stops 0.001 short of the line is no junction: Power trim dragged across the line deletes it whole, as before (nothing truly touches it)', async function () {
    await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 40 }, { t: 'line', x1: 20, y1: 5, x2: 0.001, y2: 10 }]);
    UI.cmdTrimEntities(); trimMode('power');
    await trimDrag([[-4, 20], [-2, 20], [0, 20], [2, 20], [4, 20]]);
    var E = rskEnts();
    assert(E.length === 1 && Math.abs(E[0].x1 - 20) < 1e-9, 'the whole line went, the slanted line stays: ' + JSON.stringify(E));
    assert(/Trimmed 1 segment/.test(statusText()), 'status: ' + statusText());
    UI.pmOK(); await idle();
  });
