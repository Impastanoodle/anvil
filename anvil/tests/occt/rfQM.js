  // --- rfQM (lane smfinish, 2026-11-19): a Circular Corner Relief on a tray with no bend reliefs: OpenCascade's solid
  // = Anvil's = the flat's exact area (its DXF arcs) x T (the flat's piece used to cross each bend's end on a chord) ---
  function rfQMoExact(flat) {
    var A = 0;
    flat.loops.forEach(function (loop, i) {
      var lc = K.dxfLoopCurves(loop), a = 0;
      if (!lc) return;
      if (lc.circle) a = Math.PI * lc.circle.r * lc.circle.r;
      else {
        var s = 0;
        lc.segs.forEach(function (g) { s += (g.a[0] * g.b[1] - g.b[0] * g.a[1]) / 2; if (g.t === 'arc') s += g.r * g.r / 2 * (g.sweep - Math.sin(g.sweep)); });
        a = Math.abs(s);
      }
      A += i ? -a : a;
    });
    return A;
  }
  var RFQM_TRAY = 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
    [[4, 0.06, 0], [4, 0.06, 6], [0, 0.06, 3], [8, 0.06, 3]].map(function (e) { return 'p.flange(1, [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer" });\n'; }).join('');
  for (var qmc of [[0.12, ''], [0.25, '']]) {
    var qmName = 'rfQM, OpenCascade: inch tray with no bend reliefs, Circular corner relief Ø' + qmc[0] + ' centred at two corners: = Anvil = flat exact area x T to 1e-9';
    try {
      var tqm = performance.now(), whyQM = [], mqm = K.newModel('T');
      K.runScript(mqm, RFQM_TRAY + 'p.cornerRelief([[7.88, 0.06, 5.88], [0.12, 0.06, 0.12]], ' + qmc[0] + ', { reliefType: "circular" });\n');
      var aqm = K.rebuild(JSON.parse(JSON.stringify(mqm))), meshQm = K.meshFromBody(aqm.body), avqm = K.massProps(meshQm, 1).volume;
      if (Object.keys(aqm.errors).length) whyQM.push('Anvil errors ' + JSON.stringify(aqm.errors));
      var rqm = await occt(JSON.parse(JSON.stringify(mqm)), { noCache: true });
      if (rqm.unsupported || !rqm.ok) whyQM.push('OpenCascade did not build every feature: ' + (rqm.unsupported || JSON.stringify(rqm.status)));
      else {
        if (!rqm.valid) whyQM.push('invalid solid');
        var aTqm = rfQMoExact(K.flatPattern(mqm, aqm, meshQm)) * 0.06;
        if (!(Math.abs(rqm.volume - aTqm) <= 1e-9 * aTqm)) whyQM.push('OpenCascade volume ' + rqm.volume + ' vs flat exact area x T ' + aTqm + ' (d ' + (rqm.volume - aTqm).toExponential(2) + ')');
        if (!(Math.abs(rqm.volume - avqm) <= 1e-9 * avqm)) whyQM.push('OpenCascade volume ' + rqm.volume + ' vs Anvil ' + avqm + ' (d ' + (rqm.volume - avqm).toExponential(2) + ')');
      }
      row(whyQM.length ? 'bad' : 'ok', qmName, whyQM.join('\n') || ('volume ' + rqm.volume.toFixed(9) + ', d flat ' + (rqm.volume - aTqm).toExponential(1)), performance.now() - tqm);
      counts[whyQM.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', qmName, e.message); counts.fail++; }
  }
  // --- end rfQM ---
