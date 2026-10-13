  // --- r15/tangent15 ---
  step('r15/tangent15: Line tool tangent to a circle — from a free point, the cursor 3 px off the tangent point lands exactly on it (Tangent glyph; Tangent + the end Coincident with the circle, Under Defined, no conflicts); a line started on the circle and leaving it along the tangent gets Tangent', async function () {
    await rskNew();
    UI.setTool('circle'); rskClick([0, 0]); rskClick([10, 0]);
    var c = rskEnts()[0];
    assert(c && c.t === 'circle' && c.r > 9 && c.r < 11, 'circle ' + JSON.stringify(c));
    selKey('Escape');
    UI.setTool('line'); rskClick([30, 20]);
    var P = UI.App.toolState.pts[0], d = Math.hypot(P[0] - c.cx, P[1] - c.cy), th = Math.atan2(P[1] - c.cy, P[0] - c.cx) + Math.acos(c.r / d);
    var T = [c.cx + c.r * Math.cos(th), c.cy + c.r * Math.sin(th)], n = [Math.cos(th), Math.sin(th)];
    // the cursor 3 px out from the tangent point, square to the circle
    var s = rskScr(T), tgt = [s[0] + 3 * n[0], s[1] - 3 * n[1]];
    selEv('mousemove', tgt);
    var r = $('viewport').getBoundingClientRect(), mx = Math.round(r.left + tgt[0]) - r.left, my = Math.round(r.top + tgt[1]) - r.top;
    var info = UI.sketchInferPoint(UI.screenToPlane(mx, my, UI.activePlane()), mx, my);
    assert(info.tan && Math.hypot(info.p[0] - T[0], info.p[1] - T[1]) < 1e-9, 'tangent lock ' + JSON.stringify(info));
    assert(r3sLayer().querySelector('use[href="#sk-ico-relTangent"]'), 'no Tangent glyph by the cursor');
    selClick(tgt);
    var l = rskEnts()[1];
    assert(l && l.t === 'line', 'line ' + JSON.stringify(l));
    near(l.x2, T[0], 1e-9, 'end x on the tangent point'); near(l.y2, T[1], 1e-9, 'end y on the tangent point');
    assert(r3sRels().indexOf('tangent:1,0') >= 0 && r3sRels().indexOf('coincident:1.p2,0') >= 0, 'relations ' + r3sRels().join(' '));
    var st = UI.sketchStatus();
    assert(st.status === 'under' && st.rels.every(function (x) { return x === 'ok'; }), 'after the tangent line ' + JSON.stringify(st));
    // a new line started on the circle (200°), leaving it along the tangent, 1.5 px off it
    selKey('Escape'); UI.setTool('line');
    var a = 200 * Math.PI / 180;
    rskClick([c.cx + c.r * Math.cos(a), c.cy + c.r * Math.sin(a)]);
    var Q = UI.App.toolState.pts[0];
    near(Math.hypot(Q[0] - c.cx, Q[1] - c.cy), c.r, 1e-9, 'start on the circle');
    var aq = Math.atan2(Q[1] - c.cy, Q[0] - c.cx), u = [Math.sin(aq), -Math.cos(aq)], px = info.px;
    var tq = [Q[0] + u[0] * 15 + Math.cos(aq) * 1.5 * px, Q[1] + u[1] * 15 + Math.sin(aq) * 1.5 * px];
    selEv('mousemove', rskScr(tq));
    assert(D.querySelector('#dim-layer .sk-feedback use[href="#sk-ico-relTangent"]'), 'no Tangent glyph leaving the circle');
    rskClick(tq);
    var l2 = rskEnts()[2];
    // r15/tanslide15: the start slides to the exact tangent point for the cursor, so it stays on the circle (not necessarily at Q)
    assert(l2 && l2.t === 'line' && Math.abs(Math.hypot(l2.x1 - c.cx, l2.y1 - c.cy) - c.r) < 1e-9, 'second line starts on the circle ' + JSON.stringify(l2));
    var aq2 = Math.atan2(l2.y1 - c.cy, l2.x1 - c.cx);
    near(((l2.x2 - l2.x1) * Math.cos(aq2) + (l2.y2 - l2.y1) * Math.sin(aq2)) / Math.hypot(l2.x2 - l2.x1, l2.y2 - l2.y1), 0, 1e-9, 'square to the radius');
    assert(r3sRels().indexOf('tangent:2,0') >= 0 && r3sRels().indexOf('coincident:2.p1,0') >= 0, 'relations ' + r3sRels().join(' '));
    st = UI.sketchStatus();
    assert(st.status === 'under' && st.rels.every(function (x) { return x === 'ok'; }), 'after the second line ' + JSON.stringify(st));
    selKey('Escape');
    return r3sRels().length + ' relations · ' + st.text;
  });
  // --- end r15/tangent15 ---
