  // --- views-1to1 (user request: the Views DXF came out at the drawing sheet's scale, a 60 × 40 in plate at 1:10, with
  // the border and title block in it) ---
  step('views-1to1: the Views DXF is full size whatever the part — a 600 × 400 plate gives a 600 × 400 Top view and a 1:1 Isometric, with no SHEET (border / title block) entities', async function () {
    await anvil.run('p.name("BigPlate"); p.sketch("Top").rect(0, 0, 600, 400).extrude(6); p.sketch("Top", 6).circle(100, 100, 20).cut("through", { reverse: true });');
    await idle();
    var t = anvil.dxfOutput({ export: 'views', views: ['Front', 'Top', 'Right', 'Isometric'] });
    var L = t.split('\n').map(function (s) { return s.trim(); }), box = {}, layer = null, ent = null, inE = false, radii = [];
    for (var i = 0; i + 1 < L.length; i += 2) {
      var c = L[i], v = L[i + 1];
      if (c === '2' && v === 'ENTITIES') inE = true;
      if (!inE) continue;
      if (c === '0') { ent = v; layer = null; }
      if (c === '8') layer = v;
      if (c === '40' && ent === 'CIRCLE' && layer === 'TOP') radii.push(+v);
      if ((c === '10' || c === '11') && layer && (ent === 'LINE' || ent === 'CIRCLE' || ent === 'ARC')) {
        var x = +v, y = +L[i + 3], b = box[layer] = box[layer] || [Infinity, Infinity, -Infinity, -Infinity];
        b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
      }
    }
    function wh(l) { var b = box[l]; return b ? [b[2] - b[0], b[3] - b[1]] : null; }
    var top = wh('TOP'), front = wh('FRONT');
    assert(top && Math.abs(top[0] - 600) < 1e-6 && Math.abs(top[1] - 400) < 1e-6, 'Top view 600 x 400: ' + JSON.stringify(top));
    assert(front && Math.abs(front[0] - 600) < 1e-6 && Math.abs(front[1] - 6) < 1e-6, 'Front view 600 x 6: ' + JSON.stringify(front));
    assert(radii.length === 1 && Math.abs(radii[0] - 20) < 1e-6, 'hole radius 20 in the Top view: ' + radii.join(','));
    var iso = wh('ISOMETRIC');
    assert(iso && Math.abs(iso[0] - 1000 / Math.SQRT2) < 0.5, 'Isometric at 1:1 (width (600 + 400) / √2): ' + JSON.stringify(iso));
    assert(!/\n8\nSHEET\n/.test(t), 'no border / title block entities');
    // boxes of the views do not overlap
    var ks = Object.keys(box), overlap = ks.some(function (a, ia) { return ks.some(function (b2, ib) { if (ib <= ia) return false; var A = box[a], B = box[b2]; return A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]; }); });
    assert(!overlap, 'views do not overlap: ' + JSON.stringify(box));
    return 'Top ' + top.map(function (x) { return x.toFixed(3); }).join(' x ') + ', Iso ' + iso[0].toFixed(3);
  });
  // --- end views-1to1 ---

