  // --- rfCK (2026-10-14, lane CK: Trim at a slot centre and at a bound through an end, with real mouse events) --- Power
  // trim dragged across a line that runs through a slot's cap centre (held there by a Coincident) cuts it at the cap
  // arc, not at the centre, and ties no piece to the centre; Trim away inside with one bound through the entity's own
  // end works (was: "The entity has to cross both bounding entities."). Uses trimSketch / trimDrag / trimMode / trimRels
  // (r13-trim13) and rskScr / rskClick / rskEnts (refine-sketcher).
  step('rfCK: Power trim dragged across a line through a slot\'s cap centre (a Coincident holds the centre on the line) cuts it where the cap arc crosses it, not at the centre, and no piece end is tied to the centre', async function () {
    await trimSketch([{ t: 'line', x1: 10, y1: -20, x2: 10, y2: 20 }, { t: 'slot', x1: -10, y1: 0, x2: 10, y2: 0, w: 10 }], [{ type: 'coincident', refs: ['1.p2', '0'] }]);
    UI.cmdTrimEntities(); trimMode('power');
    await trimDrag([[6, 2], [8, 2], [10, 2], [12, 2], [14, 2]]);
    var E = rskEnts(), lines = E.filter(function (e) { return e.t === 'line'; }), slot = E.filter(function (e) { return e.t === 'slot'; });
    assert(E.length === 3 && lines.length === 2 && slot.length === 1, 'two pieces and the slot: ' + JSON.stringify(E));
    var ys = lines.map(function (l) { return [Math.min(l.y1, l.y2), Math.max(l.y1, l.y2)]; }).sort(function (p, q) { return p[0] - q[0]; });
    near(ys[0][1], -5, 1e-6, 'the lower piece ends where the cap arc crosses the line'); near(ys[1][0], 5, 1e-6, 'the upper piece starts there too');
    var si = E.indexOf(slot[0]), R = trimRels();
    assert(!R.some(function (s) { return /^coincident:/.test(s) && new RegExp('(:|,)' + si + '\\.p[12](,|$)').test(s); }), 'no piece end is tied to the slot centre: ' + R.join(' '));
    assert(/Trimmed 1 segment/.test(statusText()), 'status: ' + statusText());
    UI.pmOK(); await idle();
    return R.join(' ') || 'no relations';
  });
  step('rfCK: Trim away inside with a bound through the entity\'s own end: the first half of a line goes (was: refused, "has to cross both bounding entities")', async function () {
    await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 0, y1: -8, x2: 0, y2: 8 }, { t: 'line', x1: 10, y1: -8, x2: 10, y2: 8 }]);
    UI.cmdTrimEntities(); trimMode('inside');
    rskClick([0, -6]); rskClick([10, -6]);
    selEv('mousemove', rskScr([5, 0.3]));
    var sp = D.querySelector('#dim-layer .sk-trim-span');
    assert(sp && sp.getAttribute('points').split(' ').length === 2, 'the span from the end to the middle is highlighted');
    rskClick([5, 0.3]);
    var E = rskEnts();
    assert(E.length === 3, 'three entities: ' + JSON.stringify(E));
    var kept = E.filter(function (e) { return Math.abs(e.y1) < 1e-6 && Math.abs(e.y2) < 1e-6; });
    assert(kept.length === 1 && Math.abs(Math.min(kept[0].x1, kept[0].x2) - 10) < 1e-6 && Math.abs(Math.max(kept[0].x1, kept[0].x2) - 20) < 1e-6, 'the second half stays: ' + JSON.stringify(kept));
    assert(!/has to cross/.test(statusText()), 'status: ' + statusText());
    trimMode('power'); UI.pmOK(); await idle();
    return statusText();
  });
