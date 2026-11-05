  // --- rfIQ (2026-11-05, lane sketchinfer) --- Move / Rotate (UI.transformEntities) keep a relation that uses a side
  // midpoint ('0.e0.mid'); the confirmation corner and the Insert Line header draw their icons at 24 px (the 16-grid,
  // rfIL) in unchanged 36 px buttons.
  step('rfIQ: a circle held on a polygon side midpoint (Coincident with \'0.e0.mid\') keeps it when both are rotated 30° and moved; the circle stays on that midpoint', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), S = W.SketchSolver, Af = UI.transformAffine;
    f.entities.push({ t: 'poly', cx: 10, cy: 5, r: 8, n: 6, rot: 0 }, { t: 'circle', cx: 0, cy: 0, r: 1 });
    var r0 = S.addRelation(f, 'coincident', ['1.c', '0.e0.mid']);
    assert(r0.ok, 'held: ' + r0.error);
    UI.updateSketches(); await idle();
    var r = UI.transformEntities(f, [0, 1], Af.rotate(30, 0, 0), { select: false });
    assert(r && r.ok, 'rotated: ' + JSON.stringify(r));
    f = UI.activeSketchFeature();
    assert((f.rels || []).some(function (x) { return x.type === 'coincident' && x.refs.indexOf('0.e0.mid') >= 0; }), 'kept: ' + JSON.stringify(f.rels) + ' ' + r.message);
    var m = S.refPoint(f, '0.e0.mid'), c = f.entities[1];
    near(c.cx, m[0], 1e-7, 'x on the midpoint'); near(c.cy, m[1], 1e-7, 'y on the midpoint');
    var r2 = UI.transformEntities(f, [0, 1], Af.translate(5, -3), { select: false });
    assert(r2 && r2.ok, 'moved: ' + JSON.stringify(r2));
    f = UI.activeSketchFeature();
    assert((f.rels || []).some(function (x) { return x.refs.indexOf('0.e0.mid') >= 0; }), 'kept after the move');
    m = S.refPoint(f, '0.e0.mid'); c = f.entities[1];
    near(Math.hypot(c.cx - m[0], c.cy - m[1]), 0, 1e-7, 'still on the midpoint');
    return r.message + ' / ' + r2.message;
  });
  step('rfIQ: the confirmation corner (Exit Sketch / Discard, then OK / Cancel with a PropertyManager) and the Insert Line header after For construction draw 24 px icons in 36 px buttons', async function () {
    await rskNew();
    UI.setTool('select'); await idle();
    function corner() { return Array.prototype.map.call(D.querySelectorAll('#exit-sketch button'), function (b) { var s = b.querySelector('svg'), q = b.getBoundingClientRect(); return b.className + ':' + (s && s.getAttribute('width')) + ':' + Math.round(q.width); }); }
    var c0 = corner();
    assert(c0.length === 2 && c0.every(function (x) { return /:24:36$/.test(x); }), 'sketch corner ' + c0.join(' '));
    UI.setTool('line'); await idle();
    var c1 = corner();
    assert(c1.join(' ').indexOf('cc-ok') >= 0 && c1.every(function (x) { return /:24:36$/.test(x); }), 'PM corner ' + c1.join(' '));
    var cb = D.querySelector('#pm input[data-key="construction"]');
    assert(cb, 'For construction');
    cb.click(); await idle();
    var hs = D.querySelector('#pm .pm-head > svg');
    assert(hs && hs.getAttribute('width') === '24', 'Insert Line header icon ' + (hs && hs.getAttribute('width')));
    cb = D.querySelector('#pm input[data-key="construction"]');
    if (cb && cb.checked) { cb.click(); await idle(); }
    selKey('Escape'); await idle();
    return c0.join(' ') + ' | ' + c1.join(' ');
  });
