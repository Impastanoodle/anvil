  // --- rfON (lane solidstep6, 2026-11-18; report test-reports/2026-11-18-solids-fidelity-6.md): the sixth solids
  // fidelity round. A shop-weighted fuzz (plates with holes on and near edges, tangent holes, slots across fillets,
  // thin walls, touching patterns, shells of filleted blocks, bosses on cylinders, off-axis cross holes, sweeps, lofts,
  // combines, re-cut STEP imports), every stack that failed kept as a row, and the named leftovers.
  // rfON-TABLE-BEGIN (anvil/tests/fixtures/rfFT/compare.js --table rfON reads the lines between these markers: keep
  // them ES5 and free of the test page's helpers)
  var rfONkinds = ['plate', 'block', 'turned', 'free', 'multi', 'step'];
  var rfONparts = [];
  function rfONrng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // rfONfuzz(kind, seed) -> { code, ops, base? }: a script for a new part; kind 'step' gives `base` (a part to build,
  // write as STEP and read back) and `code` (the features put on the imported body)
  function rfONfuzz(kind, seed) {
    var rnd = rfONrng(seed * 7919 + kind.charCodeAt(0) * 131 + kind.length), ops = [], code = 'p.units("in");\n';
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    function q(x, s) { return Math.round(x / s) * s; }
    function n(x) { return +(+x).toFixed(4); }
    function wpick(w) { var s = 0, k; for (k in w) s += w[k]; var r = rnd() * s; for (k in w) { r -= w[k]; if (r < 0) return k; } return k; }
    function top(y) { return 'p.sketch("Top", ' + n(y) + ')'; }
    function tc(x, z) { return n(x) + ', ' + n(-z); }   // Top sketch coordinates of the world point (x, z)
    function J(a) { return JSON.stringify(a.map(function (p) { return p.map(n); })); }
    var DIA = [0.125, 0.1875, 0.25, 0.3125, 0.375, 0.5];

    // ---- a plate W x D x PT centred on the origin, its top at y = PT; the ops a laser / punch / mill shop puts on it
    function plate(nOps, quiet) {
      var W = q(3 + 4 * rnd(), 0.5), D = q(2 + 3 * rnd(), 0.25), PT = pick([0.06, 0.105, 0.135, 0.1875, 0.25, 0.375, 0.5]);
      code += 'p.sketch("Top").centerRect(0, 0, ' + W + ', ' + D + ').end().extrude(' + PT + ');\n'; ops.push('plate');
      var cornerR = 0, cornerDone = false, topDone = false, last = null, busy = [], mirrored = false;   // busy: [x, z, r] of what was cut
      function inside(r, m) { return [n((rnd() - 0.5) * (W - 2 * r - 2 * m)), n((rnd() - 0.5) * (D - 2 * r - 2 * m))]; }
      function thru(prof) { return top(PT + 1) + prof + '.end().cut("through", { reverse: true });\n'; }
      function circ(x, z, r) { busy.push([x, z, r]); return '.circle(' + tc(x, z) + ', ' + n(r) + ')'; }
      function edgeSpot(r, off) {   // a hole centre `off` inside one of the four edges (off < 0: outside it)
        var side = Math.floor(rnd() * 4), along;
        if (side < 2) { along = n((rnd() - 0.5) * (D - 2 * r - 0.6)); return [n((side ? -1 : 1) * (W / 2 - off)), along, side]; }
        along = n((rnd() - 0.5) * (W - 2 * r - 0.6)); return [along, n((side === 2 ? 1 : -1) * (D / 2 - off)), side];
      }
      function clearOf(x, z, r) { return busy.every(function (b) { return Math.hypot(b[0] - x, b[1] - z) > b[2] + r + 0.02; }); }
      for (var i = 0; i < nOps; i++) {
        var op = wpick({ cornerFillet: cornerDone ? 0 : 1.3, cornerChamfer: cornerDone ? 0 : 0.6, holeNearEdge: 2, holeOnEdge: 1.2, holeTangentWall: quiet ? 0 : 0.3, holesTangent: quiet ? 0 : 0.5,
          holesNear: 1, holesOverlap: 0.8, slot: 1.3, slotAcrossCorner: cornerR ? 1.2 : 0.2, slotOffEdge: 0.8, pocketThin: 1, pocketThinWall: 0.8, pattern: last ? 1.6 : 0, cpattern: last ? 0.5 : 0,
          mirrorFeat: last ? 0.7 : 0, mirrorBody: (i === nOps - 1 && !mirrored) ? 2 : 0, topFillet: topDone ? 0 : 0.7, topChamfer: topDone ? 0 : 0.7, topMix: (topDone || cornerDone) ? 0 : 0.5,
          boss: 0.6, csink: 0.6 });
        var r = pick(DIA) / 2, s, s2, g, a, was = null;
        if (op === 'cornerFillet' || op === 'cornerChamfer') {
          cornerR = pick([0.0625, 0.125, 0.25, 0.375, 0.5]); cornerDone = true;
          var cs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(function () { return rnd() < 0.75; });
          if (!cs.length) cs = [[1, 1]];
          code += 'p.' + (op === 'cornerFillet' ? 'fillet' : 'chamfer') + '(' + cornerR + ', ' + J(cs.map(function (c) { return [c[0] * W / 2, PT / 2, c[1] * D / 2]; })) + ');\n';
          ops.push(op + cs.length);
        } else if (op === 'holeNearEdge') {
          g = pick([0.005, 0.005, 0.01, 0.02, 0.0625, 0.125]); s = edgeSpot(r, r + g);
          code += thru(circ(s[0], s[1], r)); ops.push('holeNearEdge' + g); was = { x: s[0], z: s[1], r: r };
        } else if (op === 'holeOnEdge') {
          s = edgeSpot(r, r * pick([0, 0.5, -0.5, 0.9, -0.9]));
          code += thru(circ(s[0], s[1], r)); ops.push('holeOnEdge'); was = { x: s[0], z: s[1], r: r };
        } else if (op === 'holeTangentWall') {
          s = edgeSpot(r, r);
          code += thru(circ(s[0], s[1], r)); ops.push('holeTangentWall');
        } else if (op === 'holesTangent' || op === 'holesNear' || op === 'holesOverlap') {
          var r2 = pick(DIA) / 2; s = inside(r + r2, 0.3); a = pick([0, 30, 45, 90, 117, 180, 250]) * Math.PI / 180;
          g = op === 'holesTangent' ? 0 : op === 'holesNear' ? pick([0.005, 0.01, 0.02]) : -Math.min(r, r2) * pick([0.2, 0.5, 1]);
          s2 = [n(s[0] + (r + r2 + g) * Math.cos(a)), n(s[1] + (r + r2 + g) * Math.sin(a))];
          if (Math.abs(s2[0]) > W / 2 - r2 - 0.05 || Math.abs(s2[1]) > D / 2 - r2 - 0.05) { s2 = [n(s[0] - (r + r2 + g) * Math.cos(a)), n(s[1] - (r + r2 + g) * Math.sin(a))]; }
          if (rnd() < 0.5) code += thru(circ(s[0], s[1], r) + circ(s2[0], s2[1], r2));
          else code += thru(circ(s[0], s[1], r)) + thru(circ(s2[0], s2[1], r2));
          ops.push(op + (g ? n(g) : ''));
        } else if (op === 'slot' || op === 'slotAcrossCorner' || op === 'slotOffEdge') {
          var w = pick([0.125, 0.1875, 0.25, 0.375]), x1, z1, x2, z2;
          if (op === 'slot') { s = inside(w, 0.4); a = pick([0, 0, 90, 30, 45]) * Math.PI / 180; g = 0.3 + 0.7 * rnd(); x1 = s[0] - g * Math.cos(a) / 2; z1 = s[1] - g * Math.sin(a) / 2; x2 = s[0] + g * Math.cos(a) / 2; z2 = s[1] + g * Math.sin(a) / 2; }
          else if (op === 'slotAcrossCorner') { var sx = pick([1, -1]), sz = pick([1, -1]), k = pick([0, 0.5, 1]) * (cornerR || 0.25) * 0.29; x1 = sx * (W / 2 - 0.9); z1 = sz * (D / 2 - 0.9) + k; x2 = sx * (W / 2 + 0.3); z2 = sz * (D / 2 + 0.3) + k; }
          else { s = edgeSpot(w, 0.6); x1 = s[0]; z1 = s[1]; x2 = s[2] < 2 ? (s[0] > 0 ? W / 2 + 0.3 : -W / 2 - 0.3) : s[0]; z2 = s[2] < 2 ? s[1] : (s[1] > 0 ? D / 2 + 0.3 : -D / 2 - 0.3); }
          busy.push([(x1 + x2) / 2, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) / 2 + w]);
          code += thru('.slot(' + tc(x1, z1) + ', ' + tc(x2, z2) + ', ' + w + ')'); ops.push(op);
        } else if (op === 'pocketThin') {
          s = inside(0.5, 0.2); g = pick([0.005, 0.01, 0.02, PT / 2]);
          var pw = n(0.4 + 0.6 * rnd()), pd = n(0.3 + 0.5 * rnd());
          if (PT - g < 0.01) continue;
          busy.push([s[0], s[1], Math.hypot(pw, pd) / 2]);
          code += top(PT) + (rnd() < 0.5 ? '.centerRect(' + tc(s[0], s[1]) + ', ' + pw + ', ' + pd + ')' : '.circle(' + tc(s[0], s[1]) + ', ' + n(pd / 2) + ')') + '.end().cut(' + n(PT - g) + ', { reverse: true });\n'; ops.push('pocketFloor' + n(g));
        } else if (op === 'pocketThinWall') {
          g = pick([0.005, 0.01, 0.02, 0.03]); var hw = n(0.25 + 0.5 * rnd()), hd = n(0.2 + 0.3 * rnd()), dz = n((rnd() - 0.5) * (D - 2 * hd - 0.6));
          busy.push([W / 2 - g - hw, dz, Math.hypot(hw, hd)]);
          code += top(PT) + '.rect(' + n(W / 2 - g - 2 * hw) + ', ' + n(-dz - hd) + ', ' + n(2 * hw) + ', ' + n(2 * hd) + ').end().cut(' + (rnd() < 0.5 ? '"through"' : n(PT * 0.6)) + ', { reverse: true });\n'; ops.push('pocketWall' + g);
        } else if (op === 'pattern') {
          var dir = rnd() < 0.5 ? 'x' : 'z', sp = n(2 * last.r * pick([1, 0.8, 0.5, 1.02, 1.5, 2.5]) + pick([0, 0, 0.005])), cnt = 2 + Math.floor(rnd() * 4), pos = dir === 'x' ? last.x : -last.z;
          code += 'p.linearPattern({ dir: "' + dir + '", spacing: ' + n(pos > 0 ? -sp : sp) + ', count: ' + cnt + ' });\n'; ops.push('pattern' + n(sp / (2 * last.r)));
        } else if (op === 'cpattern') {
          code += 'p.circularPattern({ axis: "y", center: [0, 0, 0], count: ' + (2 + Math.floor(rnd() * 6)) + ' });\n'; ops.push('cpattern');
        } else if (op === 'mirrorFeat') {
          code += 'p.mirror("' + pick(['Right', 'Front']) + '");\n'; ops.push('mirrorFeat');
        } else if (op === 'mirrorBody') {
          var mp = pick(['Right', 'Front']); mirrored = true;
          code += 'p.mirror("' + mp + '", { body: true, offset: ' + n(mp === 'Right' ? W / 2 : D / 2) + ' });\n'; ops.push('mirrorBodyOnFace');
        } else if (op === 'topFillet' || op === 'topChamfer') {
          topDone = true; g = n(Math.min(PT * pick([0.2, 0.45, 0.9]), 0.25));
          if (g < 0.01) continue;
          code += 'p.' + (op === 'topFillet' ? 'fillet' : 'chamfer') + '(' + g + ', ' + J([[n(-W / 2 + 0.31), PT, D / 2]]) + ');\n'; ops.push(op + g);
        } else if (op === 'topMix') {
          topDone = true; g = n(Math.min(PT * 0.4, 0.125));
          if (g < 0.01) continue;
          code += 'p.fillet(' + g + ', [{ at: ' + JSON.stringify([n(-W / 2 + 0.31), PT, n(D / 2)]) + ', chain: false }]);\np.chamfer(' + g + ', [{ at: ' + JSON.stringify([n(W / 2), PT, n(D / 2 - 0.31)]) + ', chain: false }]);\n'; ops.push('filletMeetsChamfer');
        } else if (op === 'boss') {
          var br = pick([0.25, 0.375, 0.5]), bh = pick([0.125, 0.25, 0.5]); s = inside(br, 0.15);
          code += top(PT) + '.circle(' + tc(s[0], s[1]) + ', ' + br + ').end().extrude(' + bh + ');\n'; ops.push('boss');
          if (rnd() < 0.6) { a = rnd() * 6.283; g = br * pick([0, 0.5, 1, 1.3]); code += top(PT + bh + 1) + '.circle(' + tc(s[0] + g * Math.cos(a), s[1] + g * Math.sin(a)) + ', ' + n(pick([0.0625, 0.125, br - 0.02, br - 0.005])) + ').end().cut("through", { reverse: true });\n'; ops.push('holeAtBoss' + n(g / br)); }
          if (rnd() < 0.5) { code += 'p.fillet(' + pick([0.03, 0.0625, 0.125]) + ', ' + J([[s[0] + br, PT, s[1]]]) + ');\n'; ops.push('bossRootFillet'); }
          busy.push([s[0], s[1], br + 0.2]);
        } else if (op === 'csink') {
          s = inside(r * 2, 0.2);
          if (!clearOf(s[0], s[1], 2 * r)) continue;
          code += thru(circ(s[0], s[1], r)) + 'p.chamfer(' + n(Math.min(r * 0.6, PT * 0.6)) + ', ' + J([[s[0] + r, PT, s[1]]]) + ');\n'; ops.push('csink'); was = { x: s[0], z: s[1], r: r };
        }
        last = was;
      }
      return { W: W, D: D, PT: PT };
    }

    // ---- a block or an angle bracket: filleted, shelled, drafted, ribbed, pocketed down to thin walls
    function block(nOps) {
      var angle = rnd() < 0.35, W, D, H, T;
      if (angle) {
        W = q(2 + 2 * rnd(), 0.25); H = q(1.5 + 1.5 * rnd(), 0.25); D = q(1.5 + 2 * rnd(), 0.25); T = pick([0.125, 0.1875, 0.25, 0.375]);
        code += 'p.sketch("Front").polyline([[0, 0], [' + W + ', 0], [' + W + ', ' + T + '], [' + T + ', ' + T + '], [' + T + ', ' + H + '], [0, ' + H + ']]).end().extrude(' + D + ', { midplane: true });\n'; ops.push('angle');
        var bent = false, ribs = 0;
        for (var i = 0; i < nOps; i++) {
          var op = wpick({ rib: ribs < 2 ? 2 : 0, insideFillet: bent ? 0 : 1.5, legHole: 2, legSlot: 1, outsideFillet: 0.7, endChamfer: 0.8, footHoleNearRib: 1 });
          if (op === 'rib') {
            var zr = ribs ? -D / 4 : pick([0, D / 4, D / 2 - 0.2]), rt = pick([0.06, 0.125, 0.1875]), ra = n(T + (W - T) * (0.4 + 0.5 * rnd())), rb = n(T + (H - T) * (0.4 + 0.5 * rnd()));
            code += 'p.sketch("Front", ' + n(zr) + ').line(' + n(T) + ', ' + rb + ', ' + ra + ', ' + n(T) + ').end().rib(' + rt + (rnd() < 0.3 ? ', { side: "one" }' : '') + ');\n'; ops.push('rib'); ribs++;
          } else if (op === 'insideFillet') {
            bent = true; code += 'p.fillet(' + pick([0.0625, 0.125, 0.25]) + ', ' + J([[T, T, D / 2 - 0.05]]) + ');\n'; ops.push('insideFillet');
          } else if (op === 'outsideFillet') {
            code += 'p.fillet(' + n(T * pick([0.5, 1, 1.5])) + ', ' + J([[0, 0, D / 2 - 0.05]]) + ');\n'; ops.push('outsideFillet');
          } else if (op === 'legHole') {
            var hr = pick(DIA) / 2, up = rnd() < 0.5, e = pick([0.005, 0.02, 0.1, 0.3]);
            if (up) code += 'p.sketch("Right", 1).circle(' + n((rnd() - 0.5) * (D - 2 * hr - 2 * e)) + ', ' + n(H - hr - e) + ', ' + hr + ').end().cut("through", { reverse: true });\n';
            else code += top(T + 1) + '.circle(' + tc(W - hr - e, (rnd() - 0.5) * (D - 2 * hr - 0.2)) + ', ' + hr + ').end().cut("through", { reverse: true });\n';
            ops.push('legHole' + e);
          } else if (op === 'footHoleNearRib') {
            code += top(T + 1) + '.circle(' + tc(T + pick([0.3, 0.5, 0.8]), pick([0, 0.1, 0.2])) + ', ' + pick([0.0625, 0.125]) + ').end().cut("through", { reverse: true });\n'; ops.push('footHoleNearRib');
          } else if (op === 'legSlot') {
            code += top(T + 1) + '.slot(' + tc(W - 0.8, 0) + ', ' + tc(W + pick([-0.3, 0.3]), 0) + ', ' + pick([0.1875, 0.25]) + ').end().cut("through", { reverse: true });\n'; ops.push('legSlot');
          } else if (op === 'endChamfer') {
            code += 'p.chamfer(' + n(T * pick([0.3, 0.6])) + ', ' + J([[W, T, 0]]) + ');\n'; ops.push('endChamfer');
          }
        }
        return;
      }
      W = q(2 + 2 * rnd(), 0.25); D = q(1.5 + 2 * rnd(), 0.25); H = q(0.75 + 1.5 * rnd(), 0.25);
      code += 'p.sketch("Top").centerRect(0, 0, ' + W + ', ' + D + ').end().extrude(' + H + ');\n'; ops.push('block');
      var vr = 0, tr = 0, shelled = false, drafted = false;
      for (var j = 0; j < nOps; j++) {
        var o = wpick({ draft: (drafted || vr || tr || shelled) ? 0 : 1, vFillet: (vr || shelled) ? 0 : 2, tFillet: (tr || shelled) ? 0 : 1.5, tChamfer: (tr || shelled) ? 0 : 0.7, shell: shelled ? 0 : 2,
          pocket: shelled ? 0 : 1.2, sideHole: 1, bossTop: shelled ? 0 : 0.8, stepCut: shelled ? 0 : 0.8 });
        if (o === 'draft') {
          drafted = true;
          var fs = [[W / 2, H / 2, 0], [-W / 2, H / 2, 0], [0, H / 2, D / 2], [0, H / 2, -D / 2]].filter(function () { return rnd() < 0.7; });
          if (!fs.length) fs = [[W / 2, H / 2, 0]];
          code += 'p.draft(' + pick([1, 2, 3, 5]) + ', [0, 0, 0], ' + J(fs) + ');\n'; ops.push('draft' + fs.length);
        } else if (o === 'vFillet') {
          vr = pick([0.0625, 0.125, 0.25, 0.375]);
          var cs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(function () { return rnd() < 0.8; });
          if (!cs.length) cs = [[1, 1]];
          if (drafted) continue;   // a drafted corner is not at the block's nominal corner: skip the pick
          code += 'p.fillet(' + vr + ', ' + J(cs.map(function (c) { return [c[0] * W / 2, H / 2, c[1] * D / 2]; })) + ');\n'; ops.push('vFillet' + cs.length);
        } else if (o === 'tFillet' || o === 'tChamfer') {
          tr = pick([0.03, 0.0625, 0.125, 0.25]);
          if (drafted) continue;
          code += 'p.' + (o === 'tFillet' ? 'fillet' : 'chamfer') + '(' + tr + ', ' + J([[0, H, D / 2]]) + ');\n'; ops.push(o + tr);
        } else if (o === 'shell') {
          shelled = true; var st = pick([0.03, 0.05, 0.0625, 0.1, 0.125]);
          code += 'p.shell(' + st + ', ' + (rnd() < 0.8 ? J([[0, H, 0]]) : rnd() < 0.5 ? J([[0, 0, 0]]) : '[]') + ');\n'; ops.push('shell' + st);
        } else if (o === 'pocket') {
          var g = pick([0.005, 0.01, 0.02, 0.05]), fl = pick([0.005, 0.02, 0.25]);
          code += top(H) + '.centerRect(0, 0, ' + n(W - 2 * g - 2 * Math.max(vr, 0)) + ', ' + n(D - 2 * g - 2 * tr) + ').end().cut(' + n(H - fl) + ', { reverse: true });\n'; ops.push('pocketWall' + g + 'Floor' + fl);
        } else if (o === 'sideHole') {
          var sr = pick(DIA) / 2;
          code += 'p.sketch("Front", ' + n(D / 2 + 1) + ').circle(' + n((rnd() - 0.5) * (W - 2 * sr - 0.4)) + ', ' + n(sr + pick([0.005, 0.05, 0.2]) + rnd() * 0.1) + ', ' + sr + ').end().cut(' + (rnd() < 0.6 ? '"through"' : n(D / 2 + 1 + 0.01)) + ', { reverse: true });\n'; ops.push('sideHole');
        } else if (o === 'bossTop') {
          var br = pick([0.25, 0.375]), bx = n((rnd() - 0.5) * (W - 2 * br - 0.6)), bz = n((rnd() - 0.5) * (D - 2 * br - 0.6));
          code += top(H) + '.circle(' + tc(bx, bz) + ', ' + br + ').end().extrude(' + pick([0.25, 0.5]) + ');\np.fillet(' + pick([0.03, 0.0625]) + ', ' + J([[bx + br, H, bz]]) + ');\n'; ops.push('bossTopFillet');
        } else if (o === 'stepCut') {
          code += top(H) + '.rect(' + n(W / 2 - pick([0.3, 0.5, 0.75])) + ', ' + n(-D / 2 - 0.5) + ', 2, ' + n(D + 1) + ').end().cut(' + n(H * pick([0.25, 0.5, 0.9])) + ', { reverse: true });\n'; ops.push('stepCut');
        }
      }
    }

    // ---- a turned part (axis Y): bosses on the cylinder, cross holes off axis, grooves, flats, bolt circles
    function turned(nOps) {
      var R = pick([0.5, 0.75, 1, 1.5]), H = pick([0.75, 1, 1.5, 2.5]), rb = pick([0, 0, 0.25, R * 0.6]);
      if (rb) code += 'p.sketch("Top").circle(0, 0, ' + R + ').circle(0, 0, ' + n(rb) + ').end().extrude(' + H + ');\n';
      else code += 'p.sketch("Top").circle(0, 0, ' + R + ').end().extrude(' + H + ');\n';
      ops.push(rb ? 'tube' : 'bar');
      var rim = false, last = false, flatDone = false;
      for (var i = 0; i < nOps; i++) {
        var op = wpick({ crossHole: 2.2, bossOnCyl: 1.6, groove: 1.3, vGroove: 0.6, faceGroove: 0.6, flat: flatDone ? 0 : 1.2, boltHole: 1.4, cpattern: last ? 2 : 0, rimFillet: rim ? 0 : 0.8, rimChamfer: rim ? 0 : 0.8, keyway: rb ? 1 : 0, crossSlot: 0.6 });
        var r = pick([0.0625, 0.09375, 0.125, 0.1875, 0.25]), was = false, y, xo;
        if (op === 'crossHole') {
          xo = n(pick([0, R / 2, R - r, R - r - 0.01, R - r / 2, -(R - r - 0.005), R / 3])); y = n(r + 0.1 + rnd() * Math.max(0.01, H - 2 * r - 0.2));
          code += 'p.sketch("Front", ' + n(R + 1) + ').circle(' + xo + ', ' + y + ', ' + r + ').end().cut(' + (rnd() < 0.7 ? '"through"' : n(R + 1)) + ', { reverse: true });\n'; ops.push('crossHole@' + n(xo / R));
        } else if (op === 'bossOnCyl') {
          var br = pick([0.125, 0.25, 0.375]), bh = pick([0.125, 0.25, 0.5]); xo = n(pick([0, 0, R / 3, R / 2, R - br])); y = n(br + 0.05 + rnd() * Math.max(0.01, H - 2 * br - 0.1));
          code += 'p.sketch("Front", ' + n(R + bh) + ').' + (rnd() < 0.7 ? 'circle(' + xo + ', ' + y + ', ' + br + ')' : 'centerRect(' + xo + ', ' + y + ', ' + n(2 * br) + ', ' + n(br) + ')') + '.end().extrude(' + n(R + bh) + ', { reverse: true });\n'; ops.push('bossOnCyl@' + n(xo / R));
          if (rnd() < 0.5) { code += 'p.sketch("Front", ' + n(R + bh + 1) + ').circle(' + xo + ', ' + y + ', ' + n(br * pick([0.4, 0.6])) + ').end().cut(' + n(1 + bh + R * pick([0.5, 1])) + ', { reverse: true });\n'; ops.push('holeInBoss'); }
        } else if (op === 'groove') {
          var gd = n(pick([0.03, 0.0625, 0.125])), gw = n(pick([0.0625, 0.125, 0.25])); y = n(0.1 + rnd() * Math.max(0.01, H - gw - 0.2));
          code += 'p.sketch("Front").rect(' + n(R - gd) + ', ' + y + ', ' + n(gd + 0.25) + ', ' + gw + ').end().revolveCut(360);\n'; ops.push('groove');
        } else if (op === 'vGroove') {
          y = n(0.2 + rnd() * Math.max(0.01, H - 0.4));
          code += 'p.sketch("Front").polyline([[' + n(R - 0.1) + ', ' + y + '], [' + n(R + 0.1) + ', ' + n(y + 0.1) + '], [' + n(R + 0.1) + ', ' + n(y - 0.1) + ']]).end().revolveCut(360);\n'; ops.push('vGroove');
        } else if (op === 'faceGroove') {
          var fr = n(rb + (R - rb) * (0.3 + 0.3 * rnd()));
          code += 'p.sketch("Front").rect(' + fr + ', ' + n(H - 0.08) + ', ' + n(Math.min(0.1, (R - fr) * 0.5)) + ', 0.5).end().revolveCut(360);\n'; ops.push('faceGroove');
        } else if (op === 'flat') {
          var fx = n(R * pick([0.5, 0.7, 0.85, 0.95])); flatDone = true;
          code += top(H) + '.rect(' + fx + ', ' + n(-R - 0.5) + ', ' + n(R + 0.5) + ', ' + n(2 * R + 1) + ').end().cut(' + (rnd() < 0.5 ? '"through"' : n(H * pick([0.3, 0.6]))) + ', { reverse: true });\n'; ops.push('flat');
        } else if (op === 'boltHole') {
          var pr = n(rb + (R - rb) * pick([0.5, 0.6, 0.75])), aa = pick([0, 0.5, 1.1, 2.2]);
          if (pr + r > R - 0.004 || pr - r < rb + 0.004) { r = Math.max(0.03, n(Math.min(R - pr, pr - rb) - pick([0.005, 0.02]))); }
          code += top(H + 1) + '.circle(' + tc(pr * Math.cos(aa), pr * Math.sin(aa)) + ', ' + n(r) + ').end().cut(' + (rnd() < 0.7 ? '"through"' : n(1 + H * 0.5)) + ', { reverse: true });\n'; ops.push('boltHole'); was = true;
        } else if (op === 'cpattern') {
          code += 'p.circularPattern({ axis: "y", center: [0, 0, 0], count: ' + pick([2, 3, 4, 5, 6, 8, 12]) + ' });\n'; ops.push('cpattern');
        } else if (op === 'rimFillet' || op === 'rimChamfer') {
          rim = true; code += 'p.' + (op === 'rimFillet' ? 'fillet' : 'chamfer') + '(' + pick([0.03, 0.0625, 0.125]) + ', ' + J([[R * Math.cos(2.5), H, R * Math.sin(2.5)]]) + ');\n'; ops.push(op);
        } else if (op === 'keyway') {
          var kw = n(Math.min(rb * 0.5, 0.125));
          code += top(H + 1) + '.rect(' + n(-kw / 2) + ', ' + n(rb * 0.8) + ', ' + kw + ', ' + n(rb * 0.2 + kw / 2 + 0.03) + ').end().cut("through", { reverse: true });\n'; ops.push('keyway');
        } else if (op === 'crossSlot') {
          y = n(0.3 + rnd() * Math.max(0.01, H - 0.6));
          code += 'p.sketch("Front", ' + n(R + 1) + ').slot(' + n(-R * 0.4) + ', ' + y + ', ' + n(R * pick([0.4, 1.5])) + ', ' + y + ', ' + pick([0.125, 0.1875]) + ').end().cut("through", { reverse: true });\n'; ops.push('crossSlot');
        }
        last = was;
      }
    }

    // ---- a swept bar or a rectangle-to-circle loft, then drilled, cut and blended
    function free(nOps) {
      var sweep = rnd() < 0.55, i, op;
      if (sweep) {
        var R = pick([1.5, 2, 3, 4]), tube = rnd() < 0.3, rect = !tube && rnd() < 0.35, pr = pick([0.25, 0.375, 0.5]), ang = pick([90, 90, 45, 135]), legs = rnd() < 0.4;
        var prof = rect ? '.centerRect(0, 0, ' + n(2 * pr) + ', ' + pr + ')' : tube ? '.circle(0, 0, ' + pr + ').circle(0, 0, ' + n(pr - pick([0.035, 0.065, 0.12])) + ')' : '.circle(0, 0, ' + pr + ')';
        var path = legs ? '.line(0, 0, 0, 2).arc(' + R + ', 2, ' + R + ', 90, 180).line(' + R + ', ' + n(2 + R) + ', ' + n(R + 2) + ', ' + n(2 + R) + ')' : '.arc(' + R + ', 0, ' + R + ', ' + (180 - ang) + ', 180)';
        code += 'var prof = p.sketch("Top")' + prof + '.id();\nvar path = p.sketch("Front")' + path + '.id();\np.sweep({ profile: prof, path: path });\n'; ops.push('sweep' + (rect ? 'Rect' : tube ? 'Tube' : 'Bar') + (legs ? 'Legs' : ang));
        var y0 = legs ? 2 : 0;
        for (i = 0; i < nOps; i++) {
          op = wpick({ crossHoleArc: 2, endCut: 1, holeAlongZ: 1.5, flatOnArc: 1, legHole: legs ? 1.5 : 0 });
          var ha = (10 + rnd() * (Math.min(ang, 90) - 20)) * Math.PI / 180, hx = n(R - R * Math.cos(ha)), hy = n(y0 + R * Math.sin(ha)), hr = n(pr * pick([0.3, 0.5, 0.8, 1]));
          if (op === 'crossHoleArc' || op === 'holeAlongZ') { code += 'p.sketch("Front", ' + n(pr + 1) + ').circle(' + n(hx + (op === 'holeAlongZ' ? pr * pick([0.5, 1]) : 0)) + ', ' + hy + ', ' + hr + ').end().cut("through", { reverse: true });\n'; ops.push(op); }
          else if (op === 'endCut') { code += 'p.sketch("Front", ' + n(pr + 1) + ').polyline([[' + n(-pr - 0.5) + ', ' + n(-0.01) + '], [' + n(pr + 0.5) + ', ' + n(-0.01) + '], [' + n(pr + 0.5) + ', ' + n(pr * pick([0.5, 1.5])) + '], [' + n(-pr - 0.5) + ', 0.05]]).end().cut("through", { reverse: true });\n'; ops.push('endCut'); }
          else if (op === 'flatOnArc') { code += top(hy) + '.rect(' + n(hx - 3) + ', ' + n(-pr - 1) + ', 6, ' + n(1 + pr * pick([0.2, 0.5])) + ').end().cut(' + n(0.3) + ', {});\n'; ops.push('flatOnArc'); }
          else if (op === 'legHole') { code += 'p.sketch("Front", ' + n(pr + 1) + ').circle(' + pick([0, n(pr / 2)]) + ', ' + n(0.3 + rnd() * 1.4) + ', ' + hr + ').end().cut("through", { reverse: true });\n'; ops.push('legHole'); }
        }
        return;
      }
      var a = q(2 + 2 * rnd(), 0.5), b = q(1.5 + 1.5 * rnd(), 0.5), h = pick([1.5, 2, 3]), cr = n(Math.min(a, b) * pick([0.25, 0.35, 0.45]));
      var up = rnd() < 0.5;
      code += 'var a = p.sketch("Top").' + (up ? 'centerRect(0, 0, ' + a + ', ' + b + ')' : 'circle(0, 0, ' + cr + ')') + '.id();\nvar b = p.sketch("Top", ' + h + ').' + (up ? 'circle(0, 0, ' + cr + ')' : 'centerRect(0, 0, ' + a + ', ' + b + ')') + '.id();\np.loft([a, b]);\n'; ops.push(up ? 'loftRectCircle' : 'loftCircleRect');
      for (i = 0; i < nOps; i++) {
        op = wpick({ axisHole: 1.5, crossHole: 2, topCut: 1, sideFlat: 1, shell: 0.7 });
        if (op === 'axisHole') { code += top(h + 1) + '.circle(' + pick([0, 0, n(cr / 2)]) + ', 0, ' + n(cr * pick([0.3, 0.6, 0.85])) + ').end().cut(' + (rnd() < 0.6 ? '"through"' : n(1 + h / 2)) + ', { reverse: true });\n'; ops.push('axisHole'); }
        else if (op === 'crossHole') { code += 'p.sketch("Front", ' + n(Math.max(a, b)) + ').circle(' + pick([0, 0, n(cr * 0.5), n(cr)]) + ', ' + n(h * (0.2 + 0.6 * rnd())) + ', ' + pick([0.125, 0.1875, 0.25]) + ').end().cut("through", { reverse: true });\n'; ops.push('crossHole'); }
        else if (op === 'topCut') { code += 'p.sketch("Front", ' + n(Math.max(a, b)) + ').polyline([[' + n(-a) + ', ' + n(h * 0.8) + '], [' + a + ', ' + n(h * pick([0.5, 0.8, 0.95])) + '], [' + a + ', ' + n(h + 1) + '], [' + n(-a) + ', ' + n(h + 1) + ']]).end().cut("through", { reverse: true });\n'; ops.push('topCut'); }
        else if (op === 'sideFlat') { code += top(h + 1) + '.rect(' + n(cr * pick([0.6, 0.9, 1.2])) + ', ' + n(-a) + ', ' + n(2 * a) + ', ' + n(2 * a) + ').end().cut("through", { reverse: true });\n'; ops.push('sideFlat'); }
        else if (op === 'shell') { code += 'p.shell(' + pick([0.05, 0.1]) + ', ' + J([[0, h, 0]]) + ');\n'; ops.push('shell'); }
      }
    }

    // ---- two bodies combined (add, subtract, common), then machined
    function multi(nOps) {
      var W = q(2 + 2 * rnd(), 0.5), D = q(1.5 + 1.5 * rnd(), 0.5), H = pick([0.5, 0.75, 1]), cyl = rnd() < 0.4;
      if (cyl) code += 'p.sketch("Top").circle(0, 0, ' + n(D / 2) + ').end().extrude(' + H + ');\n'; else code += 'p.sketch("Top").centerRect(0, 0, ' + W + ', ' + D + ').end().extrude(' + H + ');\n';
      ops.push(cyl ? 'disk' : 'box');
      var ex = cyl ? D / 2 : W / 2, tx = n(ex * pick([0, 0.5, 1, 1])), ty = n(H * pick([-0.5, 0.25, 0.5, 0.5])), tr = pick([0.25, 0.5, 0.75]), th = n(H * pick([0.5, 1, 2])), kind2 = pick(['cyl', 'box', 'cylX']);
      if (kind2 === 'cyl') code += top(ty) + '.circle(' + tc(tx, 0) + ', ' + tr + ').end().extrude(' + th + ', { merge: false });\n';
      else if (kind2 === 'box') code += top(ty) + '.centerRect(' + tc(tx, pick([0, D / 2])) + ', ' + n(2 * tr) + ', ' + n(1.5 * tr) + ').end().extrude(' + th + ', { merge: false });\n';
      else code += 'p.sketch("Right", ' + n(-ex - 0.5) + ').circle(' + pick([0, n(D / 4)]) + ', ' + n(H * pick([0.5, 1])) + ', ' + n(Math.min(tr, H * 0.45 + 0.2)) + ').end().extrude(' + n(2 * ex + 1) + ', { merge: false });\n';
      var mode = pick(['add', 'add', 'subtract', 'subtract', 'common']);
      code += 'p.intersect({ regions: ' + JSON.stringify(mode === 'add' ? [true, true, true] : mode === 'subtract' ? [true, false, false] : [false, false, true]) + ' });\n'; ops.push(kind2 + '-' + mode);
      for (var i = 0; i < nOps; i++) {
        var op = wpick({ hole: 2, slot: 1, sideHole: 1 }), r = pick(DIA) / 2;
        if (op === 'hole') { code += top(H + th + 3) + '.circle(' + tc(tx + tr * pick([0, 1, -1, 0.5]), pick([0, 0.2])) + ', ' + r + ').end().cut("through", { reverse: true });\n'; ops.push('hole'); }
        else if (op === 'slot') { code += top(H + th + 3) + '.slot(' + tc(tx - 0.4, 0.3) + ', ' + tc(tx + 0.4, 0.3) + ', 0.1875).end().cut("through", { reverse: true });\n'; ops.push('slot'); }
        else { code += 'p.sketch("Front", ' + n(D + 2) + ').circle(' + n(tx * pick([0, 1])) + ', ' + n(H * pick([0.3, 0.5, 0.9])) + ', ' + n(Math.min(r, H * 0.3)) + ').end().cut("through", { reverse: true });\n'; ops.push('sideHole'); }
      }
    }

    var nOps = 2 + Math.floor(rnd() * 5);
    if (kind === 'plate') plate(nOps + 1);
    else if (kind === 'block') block(nOps);
    else if (kind === 'turned') turned(nOps);
    else if (kind === 'free') free(1 + Math.floor(rnd() * 3));
    else if (kind === 'multi') multi(1 + Math.floor(rnd() * 3));
    else if (kind === 'step') {
      var sub = pick(['plate', 'plate', 'turned', 'block']), dim = null, base, R0;
      if (sub === 'plate') dim = plate(2, true); else if (sub === 'turned') turned(2); else block(2);
      base = code; code = ''; ops.push('| STEP |');
      // the features put on the read body: positions that are safe on any of the bases (near the origin's column)
      var m = 1 + Math.floor(rnd() * 3);
      for (var i = 0; i < m; i++) {
        var op = wpick({ hole: 2, slot: 1, cornerFillet: dim ? 1.5 : 0, topChamfer: dim ? 1 : 0, sideHole: 1 }), r = pick(DIA) / 2;
        if (op === 'hole') { code += top(9) + '.circle(' + tc(pick([0, 0.2, 0.4, -0.3]), pick([0, 0.15, -0.35])) + ', ' + r + ').end().cut("through", { reverse: true });\n'; ops.push('hole'); }
        else if (op === 'slot') { code += top(9) + '.slot(' + tc(-0.3, pick([0, 0.3])) + ', ' + tc(0.3, pick([0, 0.3])) + ', 0.1875).end().cut("through", { reverse: true });\n'; ops.push('slot'); }
        else if (op === 'cornerFillet') { code += 'p.fillet(' + pick([0.0625, 0.125, 0.25]) + ', ' + J([[-dim.W / 2, dim.PT / 2, -dim.D / 2]]) + ');\n'; ops.push('cornerFillet'); }
        else if (op === 'topChamfer') { code += 'p.chamfer(' + n(dim.PT * 0.3) + ', ' + J([[dim.W / 2, dim.PT, -dim.D / 2 + 0.33]]) + ');\n'; ops.push('topChamfer'); }
        else { code += 'p.sketch("Front", 9).circle(' + pick([0, 0.1]) + ', ' + n(dim ? dim.PT / 2 : pick([0.3, 0.5])) + ', ' + n(dim ? dim.PT * 0.3 : 0.125) + ').end().cut("through", { reverse: true });\n'; ops.push('sideHole'); }
      }
      return { base: base, code: 'p.units("in");\n' + code, ops: ops };
    }
    return { code: code, ops: ops };
  }
  // rfON-TABLE-END

  (function () {
    group('rfON: solids fidelity 6: a shop-weighted fuzz, overlapping holes and notched bars whole in STEP');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfONwith(obj, key, value, fn) { var was = obj[key]; obj[key] = value; try { return fn(); } finally { obj[key] = was; } }
    function rfONcount(re, s) { return (s.match(re) || []).length; }
    function rfONfaces(s) { return { faces: rfONcount(/=ADVANCED_FACE\(/g, s), planes: rfONcount(/=PLANE\(/g, s), cyl: rfONcount(/=CYLINDRICAL_SURFACE\(/g, s) }; }
    function rfONopen(b) { var n = 0; (b.bodies || []).forEach(function (x) { var c = Evaluate.checkBody(x); n += c.openEdges.length + c.nonManifoldEdges.length; }); return n; }
    function rfONhash(b) {   // every vertex of every polygon, in order (a second rebuild must give the same numbers)
      var h = 0, n = 0;
      (b.bodies || []).forEach(function (x) { x.polygons.forEach(function (p) { p.vertices.forEach(function (v) { h = (h * 31 + Math.round(v.pos.x * 1e9) + 7 * Math.round(v.pos.y * 1e9) + 13 * Math.round(v.pos.z * 1e9)) % 2147483647; n++; }); }); });
      return n + ':' + h;
    }
    // out to STEP and back through Anvil's reader: { f: the file's face counts, rel: read-back volume against the part's, open }
    function rfONtrip(r) {
      if (!X) fail('exchange.js is not loaded');
      var step = X.exportSTEP(r.model, r.build), back = K.rebuild(X.newPartFromImport(X.importFile('rfON.step', step, { units: 'in' })));
      var v = K.massProps(r.mesh, 1).volume, vb = K.massProps(K.meshFromBody(back.body), 1).volume;
      return { step: step, f: rfONfaces(step), v: v, rel: (vb - v) / v, open: rfONopen(back) };
    }
    var rfONplate = 'p.units("in");\np.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(0.25);\n', rfONbar = 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).end().extrude(1);\n';
    function rfONhole(x, y, r) { return 'p.sketch("Top", 1.25).circle(' + x + ', ' + y + ', ' + r + ').end().cut("through", { reverse: true });\n'; }
    // the area two overlapping circles cover
    function rfONunion(r1, r2, d) {
      var lens = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)) + r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2)) - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
      return Math.PI * (r1 * r1 + r2 * r2) - lens;
    }

    // 1. exchange.js snapCylParallel: two holes that overlap (two Cut-Extrudes) meet on a line both walls share. The
    //    mesh has the crossing of the two polygons there, inside both circles by a sagitta, so neither rim arc ended on
    //    its circle and both walls (and with them the rest of the rims) went to STEP as facets: 52 planes for two holes
    //    in a plate, 4e-5 of the volume. The two crossing vertices move, in the file, onto the shared line.
    [[0.1, 0.15, 0.15, 0], [0.125, 0.125, 0.2, 0.05], [0.0938, 0.1875, 0.19, 0], [0.1, 0.2, 0.21, 0]].forEach(function (c) {
      test('rfON: two overlapping holes Ø' + 2 * c[0] + ' and Ø' + 2 * c[1] + ', ' + c[2] + ' apart: the plate at its closed form, 8 faces in STEP (2 walls sharing a line; 52+ planes before), the file reads back to 1e-12', function () {
        var r = build(rfONplate + rfONhole(0, 0, c[0]) + rfONhole(c[2], c[3], c[1])); noErrors(r);
        var d = Math.hypot(c[2], c[3]), cf = 0.25 * (12 - rfONunion(c[0], c[1], d)), t = rfONtrip(r);
        nearRel(t.v, cf, 1e-9, 'the part against its closed form');
        assert(t.f.faces === 8 && t.f.cyl === 2 && t.f.planes === 6, JSON.stringify(t.f) + ' (8 faces: 6 planes, 2 walls)');
        assert(t.open === 0, t.open + ' open edges read back');
        assert(Math.abs(t.rel) < 1e-12, 'read back ' + t.rel.toExponential(2));
        return JSON.stringify(t.f) + ', read back ' + t.rel.toExponential(1);
      });
    });
    test('rfON: overlapping holes whose true crossing lies past a rim vertex (Ø.1876 and Ø.375, .19 / -.02 apart) keep their facets, closed (a snap there read back with 17 open edges: snapKeepsOrder; not fixed)', function () {
      var r = build(rfONplate + rfONhole(0, 0, 0.0938) + rfONhole(0.19, -0.02, 0.1875)); noErrors(r);
      var t = rfONtrip(r);
      assert(t.open === 0 && Math.abs(t.rel) < 1e-3, t.open + ' open, read back ' + t.rel.toExponential(2));
      return JSON.stringify(t.f) + ', read back ' + t.rel.toExponential(1);
    });
    test('rfON: the overlapping holes without the parallel snap (Exchange.parallelSnap.on = false) go out as facets again (the cause pinned)', function () {
      if (!X) fail('exchange.js is not loaded');
      var r = build(rfONplate + rfONhole(0, 0, 0.1) + rfONhole(0.15, 0, 0.15)); noErrors(r);
      var f = rfONwith(X.parallelSnap, 'on', false, function () { return rfONfaces(X.exportSTEP(r.model, r.build)); });
      assert(f.cyl === 0 && f.planes > 40, JSON.stringify(f));
      return JSON.stringify(f);
    });
    // 2. NOT fixed, pinned as it is: a cross hole that breaks out of a round bar's side (a notch). At the bar's outermost
    //    ruling the hole's ruling through the mesh vertex passes outside the bar (snapCylCyl finds no root), the vertex is
    //    not moved onto the true curve and both walls go out as facets (78+ planes, 3.3e-3 of the volume light), closed.
    //    The report has what was tried (sliding along the bar's ruling instead) and why it was taken out again.
    [[0.3333, 0.2], [0.4, 0.2]].forEach(function (c) {
      test('rfON: round bar Ø1 with a Ø' + 2 * c[1] + ' cross hole ' + c[0] + ' off axis (it breaks out of the side): still facets in STEP, closed, read back within 5e-3 (not fixed: see the report)', function () {
        var r = build(rfONbar + 'p.sketch("Front", 1.5).circle(' + c[0] + ', 0.5, ' + c[1] + ').end().cut("through", { reverse: true });\n'); noErrors(r);
        var t0 = rfONtrip(r);
        assert(t0.open === 0 && Math.abs(t0.rel) < 5e-3, JSON.stringify(t0.f) + ', ' + t0.open + ' open, read back ' + t0.rel.toExponential(2));
        return JSON.stringify(t0.f) + ', read back ' + t0.rel.toExponential(1);
      });
    });
    test('rfON: a cross hole wholly inside the bar is written as before (4 faces, read back to 1e-7)', function () {
      var r = build(rfONbar + 'p.sketch("Front", 1.5).circle(0.25, 0.5, 0.2).end().cut("through", { reverse: true });\n'); noErrors(r);
      var t = rfONtrip(r);
      assert(t.f.faces === 4 && t.f.cyl === 2, JSON.stringify(t.f));
      assert(Math.abs(t.rel) < 1e-7, 'read back ' + t.rel.toExponential(2));
    });

    // 3. the fuzz (rfONfuzz above; 600 stacks in the report): the stacks whose STEP was facets before, and a sample of
    //    every kind: built without a refusal, closed, a second rebuild the same numbers, STEP out and in closed
    test('rfON: the generator gives the same script for the same seed, and every kind gives one', function () {
      rfONkinds.forEach(function (k) {
        var a = rfONfuzz(k, 6001), b = rfONfuzz(k, 6001);
        assert(a.code === b.code && a.code.length > 30 && a.ops.length >= 2, k + ': ' + a.ops.join(' '));
      });
    });
    [['plate', 6016, 12, 6, 1e-12], ['plate', 6002, 20, 6, 1e-12], ['plate', 6001, 17, 3, 1e-12], ['plate', 6004, 13, 5, 1e-9], ['block', 6001, 12, 1, 1e-12], ['block', 6003, 14, 3, 1e-12]].forEach(function (c) {
      test('rfON: fuzz ' + c[0] + ' ' + c[1] + ' (' + rfONfuzz(c[0], c[1]).ops.join(', ') + '): closed, rebuilt twice the same, ' + c[2] + ' faces with ' + c[3] + ' cylinders in STEP, read back to ' + c[4], function () {
        var s = rfONfuzz(c[0], c[1]), r = build(s.code); noErrors(r);
        assert(rfONopen(r.build) === 0, rfONopen(r.build) + ' open or non-manifold edges');
        assert(rfONhash(K.rebuild(r.model)) === rfONhash(r.build), 'a second rebuild gave other numbers');
        var t = rfONtrip(r);
        assert(t.f.faces === c[2] && t.f.cyl === c[3], JSON.stringify(t.f));
        assert(t.open === 0 && Math.abs(t.rel) < c[4], 'read back ' + t.rel.toExponential(2) + ', ' + t.open + ' open');
        return JSON.stringify(t.f) + ', read back ' + t.rel.toExponential(1);
      });
    });
  })();
  // --- end rfON ---
