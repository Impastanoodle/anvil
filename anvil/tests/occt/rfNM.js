  // --- rfNM (lane smcuts, 2026-11-16) --- (1) sheet-metal picks follow an edit on OpenCascade too: rfMY's bracket
  // (Edge-Flange2 on Edge-Flange1's far edge, a Hem on it, a Jog) and tray (four flanges, a Hem on each), each edited
  // the ten ways, sent to OpenCascade straight after the edit (the stored points still the old ones: occt-kernel.js
  // followPicks resolves pickRefs with Anvil's rebuild first; 18 of the 20 failed "No edge selected" before) and again
  // after Anvil's rebuild wrote the moved points back: both = Anvil's volume (1e-9), nothing failed. (2) Normal Cut
  // hole / slot across a 16 ga bend = Anvil's Mass Properties (exact trace, rfNM) to 1e-8.
  function nmFar(b, id) {
    var r = b.flanges[id][0], A = r.angle, sA = Math.sin(A), cA = Math.cos(A), k;
    var I = [0, 1, 2].map(function (k) { return r.origin[k] + r.o[k] * r.R * sA + r.u[k] * (r.R - r.R * cA); });
    var w = [0, 1, 2].map(function (k) { return r.o[k] * cA + r.u[k] * sA; }), mm = [0, 1, 2].map(function (k) { return -r.o[k] * sA + r.u[k] * cA; });
    var midZ = [0, 1, 2].map(function (k) { return (r.a[k] + r.b[k]) / 2 - r.origin[k]; });
    var zz = [0, 1, 2].map(function (k) { return midZ[k] - (midZ[0] * r.o[0] + midZ[1] * r.o[1] + midZ[2] * r.o[2]) * r.o[k] - (midZ[0] * r.u[0] + midZ[1] * r.u[1] + midZ[2] * r.u[2]) * r.u[k]; });
    return [0, 1, 2].map(function (k) { return I[k] + w[k] * r.L + zz[k] - mm[k] * r.T; });
  }
  function nmFeat(m, name) { return m.features.filter(function (f) { return f.name === name; })[0]; }
  function nmModel(kind) {
    var T = 0.0598, m = K.newModel('rfNM ' + kind), head = 'p.units("in");\np.sheet(' + T + ', 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    if (kind === 'bracket') {
      K.runScript(m, head + 'p.flange(1, [[2, ' + T + ', 0]], { name: "Edge-Flange1" });');
      K.runScript(m, 'p.flange(0.75, [' + JSON.stringify(nmFar(K.rebuild(m), nmFeat(m, 'Edge-Flange1').id)) + '], { name: "Edge-Flange2" });');
      K.runScript(m, 'p.hem(0.3, [' + JSON.stringify(nmFar(K.rebuild(m), nmFeat(m, 'Edge-Flange2').id)) + '], { name: "Hem1" });\np.jog(0.5, 1, [[4, ' + T + ', 1.5]], { name: "Jog1" });');
    } else {
      K.runScript(m, head + [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e, i) { return 'p.flange(1, [' + JSON.stringify(e) + '], { name: "Flange' + (i + 1) + '", position: "inside" });\n'; }).join(''));
      var b = K.rebuild(m);
      [1, 2, 3, 4].forEach(function (i) { K.runScript(m, 'p.hem(0.3, [' + JSON.stringify(nmFar(b, nmFeat(m, 'Flange' + i).id)) + '], { name: "Hem' + i + '" });'); });
    }
    K.rebuild(m);   // (the picks get their references)
    return m;
  }
  function nmEdits(first) {
    function base(m) {
      var sk = m.features.filter(function (f) { return f.type === 'sketch'; })[0];
      (function walk(o) {
        if (Array.isArray(o)) { if (o.length === 2 && typeof o[0] === 'number' && typeof o[1] === 'number') { if (Math.abs(o[0] - 4) < 1e-9) o[0] = 5; if (Math.abs(o[1] + 3) < 1e-9) o[1] = -3.5; return; } o.forEach(walk); }
        else if (o && typeof o === 'object') Object.keys(o).forEach(function (k) {
          if (typeof o[k] === 'number' && /^x/.test(k) && Math.abs(o[k] - 4) < 1e-9) o[k] = 5;
          else if (typeof o[k] === 'number' && /^y/.test(k) && Math.abs(o[k] + 3) < 1e-9) o[k] = -3.5;
          else walk(o[k]);
        });
      })(sk.entities);
      delete sk.profile;
    }
    return [['length 1.5', function (m) { nmFeat(m, first).length = 1.5; }], ['length 0.6', function (m) { nmFeat(m, first).length = 0.6; }],
      ['angle 75', function (m) { nmFeat(m, first).angle = 75; }], ['angle 120', function (m) { nmFeat(m, first).angle = 120; }],
      ['Material Inside', function (m) { nmFeat(m, first).position = 'inside'; }], ['Material Outside', function (m) { nmFeat(m, first).position = 'outside'; }],
      ['Bend Outside', function (m) { nmFeat(m, first).position = 'bendOutside'; }], ['base 5 x 3.5', base],
      ['14 ga', function (m) { m.sheet.thickness = 0.0747; m.features.forEach(function (f) { if (f.sheetBase) f.depth = 0.0747; }); }],
      ['R .125', function (m) { m.sheet.bendRadius = 0.125; }]];
  }
  for (var nmk of [['bracket', 'Edge-Flange1'], ['tray', 'Flange1']]) {
    var nmName = 'rfNM ' + nmk[0] + ': ' + nmk[1] + ' edited ten ways (length, angle, position, base, thickness, radius): OpenCascade built before and after Anvil\'s rebuild = Anvil (1e-9), every later feature built';
    try {
      var nmBase = nmModel(nmk[0]), nmw = [], nmT = performance.now(), nmOut = [];
      for (var nme of nmEdits(nmk[1])) {
        var nm1 = JSON.parse(JSON.stringify(nmBase, function (k, v) { return k === 'profile' ? undefined : v; }));
        nme[1](nm1);
        var nmFirst = await occt(JSON.parse(JSON.stringify(nm1)), { noCache: true });
        var nmB = K.rebuild(nm1), nmV = K.massProps(K.meshFromBody(nmB.body), nm1.density).volume;
        if (Object.keys(nmB.errors).length) nmw.push(nme[0] + ': Anvil ' + JSON.stringify(nmB.errors));
        var nmAfter = await occt(JSON.parse(JSON.stringify(nm1)), { noCache: true });
        [['first', nmFirst], ['after', nmAfter]].forEach(function (q) {
          var bad = Object.keys(q[1].status || {}).filter(function (k) { return /^error/.test(q[1].status[k]); });
          if (bad.length) nmw.push(nme[0] + ' (' + q[0] + '): ' + bad.map(function (k) { return k + ' ' + q[1].status[k]; }).join(' | '));
          if (!(Math.abs(q[1].volume - nmV) <= 1e-9 * nmV)) nmw.push(nme[0] + ' (' + q[0] + '): volume ' + q[1].volume + ', Anvil ' + nmV);
        });
        nmOut.push(nme[0] + ' ' + nmV.toFixed(6));
      }
      row(nmw.length ? 'bad' : 'ok', nmName, nmw.join('\n') || nmOut.join(', '), performance.now() - nmT);
      counts[nmw.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', nmName, e.message); counts.fail++; }
  }
  for (var nmc of [['Ø.5 hole', '.circle(2, -0.1196, 0.25)', 1.928107265], ['slot .6 x .1', '.slot(1, -0.1196, 1.6, -0.1196, 0.1)', 1.932517922]]) {
    var nmcName = 'rfNM Normal Cut ' + nmc[0] + ' across a 16 ga bend: OpenCascade = Anvil\'s Mass Properties (the true trace in the bend, 1e-8)';
    try {
      var nmcb = await kvBuild('p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", 0.0598)' + nmc[1] + '.end().cut("through", { reverse: true, normalCut: true });\n');
      var nmcA = K.rebuild(nmcb.m), nmcV = K.massProps(K.meshFromBody(nmcA.body), nmcb.m.density).volume, nmcw = [];
      if (!nmcb.r.ok || !nmcb.r.valid) nmcw.push('OpenCascade: ok ' + nmcb.r.ok + ', valid ' + nmcb.r.valid + ' ' + JSON.stringify(nmcb.r.status));
      if (!(Math.abs(nmcb.r.volume - nmcV) <= 1e-8 * nmcV)) nmcw.push('OpenCascade ' + nmcb.r.volume + ', Anvil ' + nmcV);
      if (!(Math.abs(nmcV - nmc[2]) <= 1e-8 * nmc[2])) nmcw.push('Anvil ' + nmcV + ', closed form ' + nmc[2]);
      row(nmcw.length ? 'bad' : 'ok', nmcName, nmcw.join('\n') || ('OpenCascade ' + nmcb.r.volume.toFixed(9) + ', Anvil ' + nmcV.toFixed(9)), nmcb.ms);
      counts[nmcw.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', nmcName, e.message); counts.fail++; }
  }
  // --- end rfNM ---
