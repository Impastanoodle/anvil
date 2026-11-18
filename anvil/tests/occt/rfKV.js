  // --- rfKV (lane occtperf, 2026-11-11) --- perforated panels on OpenCascade without Booleans (occt-kernel.js "rfKV"):
  // holes laid into the plate directly (kvApply), deferred across Edge Flanges, the BRepCheck skipped for the plate
  // path, the perforated faces triangulated by kvEarcut. Held to the analytic volume (1e-9), to the plain Boolean build
  // (the same model with kvPlate { on: false }: same volume to 1e-9, same faces), to BRepCheck on the result
  // (kvPlate.check) and to a closed mesh (every triangle edge used twice, once each way).
  function kvPanel(n, mode) {
    var T = 0.0598, r = 0.125, cols = 10, rows = n / cols, sx = 22 / cols, sy = 46 / rows, c = 'p.units("in");\n', s = '';
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) s += '.circle(' + (1 + sx / 2 + i * sx) + ', ' + (1 + sy / 2 + j * sy) + ', ' + r + ')';
    var fl = 'p.flange(1, [[12, ' + T + ', 0], [24, ' + T + ', -24], [12, ' + T + ', -48], [0, ' + T + ', -24]]);\n';
    if (mode === 'boss') c += 'p.sketch("Top").rect(0, 0, 24, 48)' + s + '.end().extrude(' + T + ');\n';
    else if (mode === 'base') c += 'p.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48)' + s + '.end().baseFlange(' + T + ');\n' + fl;
    else if (mode === 'feature') c += 'p.sketch("Top").rect(0, 0, 24, 48).end().extrude(' + T + ');\np.sketch("Top", ' + T + ').circle(' + (1 + sx / 2) + ', ' + (1 + sy / 2) + ', ' + r + ').end().cut("through", { reverse: true });\n' +
      'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n';
    else {
      c += (mode === 'flange' ? 'p.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + T + ');\n' : 'p.sketch("Top").rect(0, 0, 24, 48).end().extrude(' + T + ');\n') +
        'p.sketch("Top", ' + T + ')' + s + '.end().cut("through", { reverse: true });\n' + (mode === 'flange' ? fl : '');
    }
    return { code: c, want: mode === 'flange' || mode === 'base' ? null : (24 * 48 - n * Math.PI * r * r) * T };
  }
  // every triangle edge used twice, once each way (positions welded at 1e-9)
  function kvClosed(mesh) {
    var P = mesh.positions, keys = new Map(), id = function (k) { var x = P[k], y = P[k + 1], z = P[k + 2], s = Math.round(x * 1e8) + ',' + Math.round(y * 1e8) + ',' + Math.round(z * 1e8); if (!keys.has(s)) keys.set(s, keys.size); return keys.get(s); };
    var dir = new Map(), bad = 0;
    for (var t = 0; t < P.length; t += 9) {
      var v = [id(t), id(t + 3), id(t + 6)];
      for (var e = 0; e < 3; e++) { var a = v[e], b = v[(e + 1) % 3]; if (a === b) continue; var k = a + '>' + b; dir.set(k, (dir.get(k) || 0) + 1); }
    }
    dir.forEach(function (cnt, k) { var ab = k.split('>'); if (cnt !== 1 || dir.get(ab[1] + '>' + ab[0]) !== 1) bad++; });
    return bad;
  }
  for (var kvc of [['sketch', 200, 'Cut-Extrude of 200 circles through a 24 x 48 16 ga panel'], ['feature', 200, 'Cut-Extrude of one circle + LPattern 10 x 20'],
    ['boss', 200, 'Boss-Extrude of the outline with 200 circles'], ['flange', 200, 'Base Flange, Cut-Extrude of 200 circles, four Edge Flanges (holes wait for the flanges)'],
    ['base', 200, 'Base Flange sketched with its 200 holes, four Edge Flanges']]) {
    var kvName = 'rfKV ' + kvc[2] + ': no Boolean, BRepCheck valid, closed mesh, = the Boolean build (1e-9, same faces), Ø.25 walls in 32 facets';
    try {
      var kvp = kvPanel(200, kvc[0]);
      var kva = await kvBuild(kvp.code, { check: true }), kvb = await kvBuild(kvp.code, { on: false, mesh: false }), kr = kva.r, kw = [];
      if (!kr.ok || !kr.valid) kw.push('OpenCascade: ok ' + kr.ok + ', valid ' + kr.valid + ' ' + JSON.stringify(kr.status));
      var pl = kr.plate || {};
      if ((pl.plate || 0) + (pl.slab || 0) < 199 || pl.boolean) kw.push('plate path: ' + JSON.stringify(pl));
      if (pl.checked !== true) kw.push('BRepCheck of the plate path\'s body: ' + pl.checked);
      if (kvp.want != null && !(Math.abs(kr.volume - kvp.want) <= 1e-9 * kvp.want)) kw.push('volume ' + kr.volume + ', exact ' + kvp.want);
      if (!(Math.abs(kr.volume - kvb.r.volume) <= 1e-9 * kvb.r.volume)) kw.push('volume ' + kr.volume + ', the Boolean build ' + kvb.r.volume);
      if (kr.faces.length !== kvb.r.faces.length) kw.push(kr.faces.length + ' faces, the Boolean build ' + kvb.r.faces.length);
      if (!kr.mesh) kw.push('no mesh');
      else {
        var kbad = kvClosed(kr.mesh);
        if (kbad) kw.push(kbad + ' triangle edges not used exactly twice, once each way');
        var wallTris = {}, fo = kr.mesh.faceOf;
        for (var kt = 0; kt < fo.length; kt++) { var kf = kr.faces[fo[kt]]; if (kf.type === 'cylinder' && kf.surf && Math.abs(kf.surf.r - 0.125) < 1e-9) wallTris[fo[kt]] = (wallTris[fo[kt]] || 0) + 1; }
        var kwc = Object.keys(wallTris).map(function (k) { return wallTris[k]; });
        if (kwc.length < 199 || kwc.some(function (x) { return x !== 64; })) kw.push('hole walls: ' + kwc.length + ' with ' + JSON.stringify(kwc.slice(0, 4)) + ' triangles (want 64 = 2 x 32 facets)');
      }
      if (kva.ms > 15000) kw.push('OpenCascade took ' + (kva.ms / 1000).toFixed(1) + ' s');
      row(kw.length ? 'bad' : 'ok', kvName, kw.join('\n') || ('volume ' + kr.volume.toFixed(9) + ', ' + kr.faces.length + ' faces, ' + (kr.mesh.faceOf.length) + ' triangles; ' + (kva.ms / 1000).toFixed(2) + ' s (the Boolean build ' + (kvb.ms / 1000).toFixed(1) + ' s)' + (pl.deferred ? ', holes deferred across the flanges' : '')), kva.ms);
      counts[kw.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', kvName, e.message); counts.fail++; }
  }
  // a flange folded back under the holes (135°, down): the deferred holes would cut it, so the part is built again in
  // feature order (out.plate.redo) and equals the Boolean build; a hole running off the panel edge takes the Boolean
  for (var kvx of [['redo', 'Edge Flange folded 135° under the holes after the Cut-Extrude: built again in feature order, = the Boolean build'],
    ['edge', 'a Cut-Extrude whose 64 holes include one across the panel edge: the Boolean, = the Boolean build']]) {
    var kxName = 'rfKV ' + kvx[1];
    try {
      var T6 = 0.0598, cx = 'p.units("in");\np.sheet(' + T6 + ', ' + T6 + ', 0.5);\np.sketch("Top").rect(0, 0, 8, 8).end().baseFlange(' + T6 + ');\np.sketch("Top", ' + T6 + ')';
      for (var ki = 0; ki < 8; ki++) for (var kj = 0; kj < 8; kj++) cx += '.circle(' + (kvx[0] === 'edge' && ki === 0 && kj === 0 ? 0.05 : 0.5 + ki) + ', ' + (0.5 + kj) + ', 0.125)';
      cx += '.end().cut("through", { reverse: true });\n';
      if (kvx[0] === 'redo') cx += 'p.flange(3, [[0, ' + T6 + ', -4]], { angle: 135, reverse: true });\n';
      var xa = await kvBuild(cx, { check: true }), xb = await kvBuild(cx, { on: false, mesh: false }), xr = xa.r, xw = [], xp = xr.plate || {};
      if (!xr.ok || !xr.valid) xw.push('OpenCascade: ok ' + xr.ok + ', valid ' + xr.valid + ' ' + JSON.stringify(xr.status));
      if (!xb.r.ok) xw.push('the Boolean build: ' + JSON.stringify(xb.r.status));
      if (kvx[0] === 'redo' && !xp.redo) xw.push('not built again: ' + JSON.stringify(xp));
      if (kvx[0] === 'edge' && !(xp.boolean > 0)) xw.push('the plate path took a hole off the edge: ' + JSON.stringify(xp));
      if (!(Math.abs(xr.volume - xb.r.volume) <= 1e-9 * xb.r.volume)) xw.push('volume ' + xr.volume + ', the Boolean build ' + xb.r.volume);
      if (xr.faces.length !== xb.r.faces.length) xw.push(xr.faces.length + ' faces, the Boolean build ' + xb.r.faces.length);
      if (xr.mesh && kvClosed(xr.mesh)) xw.push('mesh not closed');
      row(xw.length ? 'bad' : 'ok', kxName, xw.join('\n') || ('volume ' + xr.volume.toFixed(9) + ', ' + xr.faces.length + ' faces (' + (xp.why || '') + ')'), xa.ms);
      counts[xw.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', kxName, e.message); counts.fail++; }
  }
  // the earcut port on the page's own OcctKernel: 1800 holes in 32 points each, every triangle counted and the area exact
  try {
    var ted = performance.now(), ed = [0, 0, 24, 0, 24, 48, 0, 48], eh = [], ew = [];
    for (var ei = 0; ei < 30; ei++) for (var ej = 0; ej < 60; ej++) { eh.push(ed.length / 2); var ecx = 1 + 22 / 60 + ei * 22 / 30 + (ej % 2 ? 11 / 30 : 0), ecy = 1 + 46 / 120 + ej * 46 / 60; for (var ek = 0; ek < 32; ek++) { var eu = -2 * Math.PI * ek / 32; ed.push(ecx + 0.125 * Math.cos(eu), ecy + 0.125 * Math.sin(eu)); } }
    var etr = OcctKernel.earcut(ed, eh), eA = 0;
    for (var eq = 0; eq < etr.length; eq += 3) { var ea = etr[eq] * 2, eb = etr[eq + 1] * 2, ec = etr[eq + 2] * 2; eA += Math.abs((ed[eb] - ed[ea]) * (ed[ec + 1] - ed[ea + 1]) - (ed[eb + 1] - ed[ea + 1]) * (ed[ec] - ed[ea])) / 2; }
    var eWant = 24 * 48 - 1800 * 16 * 0.125 * 0.125 * Math.sin(2 * Math.PI / 32);
    if (etr.length / 3 !== ed.length / 2 + 2 * eh.length - 2) ew.push(etr.length / 3 + ' triangles, want ' + (ed.length / 2 + 2 * eh.length - 2));
    if (!(Math.abs(eA - eWant) < 1e-9 * eWant)) ew.push('area ' + eA + ', want ' + eWant);
    var ems = performance.now() - ted;
    if (ems > 8000) ew.push('took ' + (ems / 1000).toFixed(1) + ' s');
    row(ew.length ? 'bad' : 'ok', 'rfKV OcctKernel.earcut: a 24 x 48 face with 1800 staggered Ø.25 holes (32 points each): V + 2H - 2 triangles, area exact', ew.join('\n') || (etr.length / 3 + ' triangles in ' + ems.toFixed(0) + ' ms'), ems);
    counts[ew.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfKV OcctKernel.earcut', e.message); counts.fail++; }
  // lane MU (2026-11-15): the shop's daily panel at full size, 24 x 48 16 ga with 1800 staggered Ø.25 holes, in the
  // four ways it gets modelled: (a) a Base Flange sketched with its holes, (b) a Base Flange plate + one Cut-Extrude of
  // every circle, (c) two staggered seed holes + LPattern 30 x 30, (d) = (a) + four Edge Flanges. Work counts, not times
  // (test-reports/2026-11-15-occt-panels.md has those): no Boolean for the holes (c: its 2-hole seed only), BRepMesh
  // for none of the perforated faces or walls, faces = the plate's 6 (30 with the flanges) + one wall per hole, every
  // wall in 2 x 32 triangles, a closed mesh, the analytic volume (a-c)
  function muPanel(form) {
    var T = 0.0598, r = 0.125, cols = 30, rows = 60, sx = 22 / cols, sy = 46 / rows, H = [];
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) H.push([1 + sx / 4 + i * sx + (j % 2 ? sx / 2 : 0), 1 + sy / 2 + j * sy]);
    var circ = ';\nvar H = ' + JSON.stringify(H) + ';\nfor (var i = 0; i < H.length; i++) s.circle(H[i][0], H[i][1], ' + r + ');\ns';
    var fl = 'p.flange(1, [[12, ' + T + ', 0], [24, ' + T + ', -24], [12, ' + T + ', -48], [0, ' + T + ', -24]]);\n';
    var c = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
    if (form === 'a' || form === 'd') return c + 'var s = p.sketch("Top").rect(0, 0, 24, 48)' + circ + '.end().baseFlange(' + T + ');\n' + (form === 'd' ? fl : '');
    c += 'p.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + T + ');\n';
    if (form === 'b') return c + 'var s = p.sketch("Top", ' + T + ')' + circ + '.end().cut("through", { reverse: true });\n';
    return c + 'p.sketch("Top", ' + T + ').circle(' + H[0][0] + ', ' + H[0][1] + ', ' + r + ').circle(' + H[cols][0] + ', ' + H[cols][1] + ', ' + r + ').end().cut("through", { reverse: true });\n' +
      'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + 2 * sy + ', count2: ' + rows / 2 + ', reverse2: true });\n';
  }
  for (var muf of [['a', 'Base Flange sketched with its 1800 holes'], ['b', 'Base Flange + one Cut-Extrude of 1800 circles'], ['c', 'two staggered seed holes + LPattern 30 x 30'], ['d', 'Base Flange sketched with its 1800 holes + four Edge Flanges']]) {
    var muName = 'rfMU 24 x 48 16 ga panel, 1800 staggered Ø.25 holes, ' + muf[1] + ': no Boolean for the holes, no BRepMesh for the perforated faces, 6 (30) + 1800 faces, walls in 32 facets, closed mesh';
    try {
      var mub = await kvBuild(muPanel(muf[0])), mr = mub.r, mw = [], mp = mr.plate || {}, muWant = (24 * 48 - 1800 * Math.PI * 0.125 * 0.125) * 0.0598;
      if (!mr.ok || !mr.valid) mw.push('OpenCascade: ok ' + mr.ok + ', valid ' + mr.valid + ' ' + JSON.stringify(mr.status).slice(0, 300));
      if ((mp.plate || 0) + (mp.slab || 0) < 1798 || (mp.boolean || 0) > 0) mw.push('plate path: ' + JSON.stringify(mp));
      if (!(mp.meshFaces >= 1802)) mw.push('faces triangulated by the plate path: ' + mp.meshFaces + ' (want the two perforated faces + 1800 walls)');
      if (muf[0] !== 'd' && !(Math.abs(mr.volume - muWant) <= 1e-9 * muWant)) mw.push('volume ' + mr.volume + ', exact ' + muWant);
      if (mr.faces.length !== (muf[0] === 'd' ? 1830 : 1806)) mw.push(mr.faces.length + ' faces, want ' + (muf[0] === 'd' ? 1830 : 1806));
      if (!mr.mesh) mw.push('no mesh');
      else {
        if (kvClosed(mr.mesh)) mw.push('mesh not closed');
        var muW = {}, mfo = mr.mesh.faceOf;
        for (var mt = 0; mt < mfo.length; mt++) { var mff = mr.faces[mfo[mt]]; if (mff.type === 'cylinder' && mff.surf && Math.abs(mff.surf.r - 0.125) < 1e-9) muW[mfo[mt]] = (muW[mfo[mt]] || 0) + 1; }
        var muWc = Object.keys(muW).map(function (k) { return muW[k]; });
        if (muWc.length !== 1800 || muWc.some(function (x) { return x !== 64; })) mw.push('hole walls: ' + muWc.length + ' with ' + JSON.stringify(muWc.slice(0, 4)) + ' triangles (want 1800 x 64)');
      }
      if (mub.ms > 90000) mw.push('OpenCascade took ' + (mub.ms / 1000).toFixed(1) + ' s');
      row(mw.length ? 'bad' : 'ok', muName, mw.join('\n') || ('volume ' + mr.volume.toFixed(9) + ', ' + mr.faces.length + ' faces, ' + mr.mesh.faceOf.length + ' triangles; ' + (mub.ms / 1000).toFixed(2) + ' s'), mub.ms);
      counts[mw.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', muName, e.message); counts.fail++; }
  }
  // lane MU: a fillet / chamfer along a CIRCULAR edge whose size uses up the face beside it (widenedEdgeOp's circle
  // case): a tube's top annulus 0.25 wide rounded R.25 at its outer or inner rim, a disc 0.25 thick chamfered / rounded
  // .25 at its top rim. OpenCascade refused all four ("radius too large?"); now valid, the analytic volume (Pappus) to
  // 1e-9 and the faces SolidWorks gives (the used-up face gone)
  for (var muc of (function () {
    var tube = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.75).end().extrude(1);\n', disc = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(0.25);\n';
    var r = 0.25, A = r * r * (1 - Math.PI / 4), xb = r * (5 / 6 - Math.PI / 4) / (1 - Math.PI / 4), tubeV = Math.PI * (1 - 0.5625);
    return [['tube R.25 at the outer top rim', tube + 'p.fillet(0.25, [[1, 1, 0]]);\n', tubeV - 2 * Math.PI * (1 - xb) * A, 4],
      ['tube R.25 at the inner top rim', tube + 'p.fillet(0.25, [[0.75, 1, 0]]);\n', tubeV - 2 * Math.PI * (0.75 + xb) * A, 4],
      ['disc .25 thick, chamfer .25 at the top rim', disc + 'p.chamfer(0.25, [[1, 0.25, 0]]);\n', Math.PI * 0.25 - 2 * Math.PI * (1 - r / 3) * (r * r / 2), 3],
      ['disc .25 thick, R.25 at the top rim', disc + 'p.fillet(0.25, [[1, 0.25, 0]]);\n', Math.PI * 0.25 - 2 * Math.PI * (1 - xb) * A, 3]];
  })()) {
    var mucName = 'rfMU round / chamfer using up the face beside a circular edge: ' + muc[0] + ': valid, exact volume, ' + muc[3] + ' faces';
    try {
      var mcb = await kvBuild(muc[1]), mcr = mcb.r, mcw = [];
      if (!mcr.ok || !mcr.valid) mcw.push('OpenCascade: ok ' + mcr.ok + ', valid ' + mcr.valid + ' ' + JSON.stringify(mcr.status));
      if (!(Math.abs(mcr.volume - muc[2]) <= 1e-9 * muc[2])) mcw.push('volume ' + mcr.volume + ', exact ' + muc[2]);
      if (mcr.faces.length !== muc[3]) mcw.push(mcr.faces.length + ' faces (' + mcr.faces.map(function (f) { return f.type; }).join('/') + '), want ' + muc[3]);
      row(mcw.length ? 'bad' : 'ok', mucName, mcw.join('\n') || ('volume ' + mcr.volume.toFixed(9) + ', ' + mcr.faces.map(function (f) { return f.type; }).join('/')), mcb.ms);
      counts[mcw.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', mucName, e.message); counts.fail++; }
  }
  // --- end rfKV ---
