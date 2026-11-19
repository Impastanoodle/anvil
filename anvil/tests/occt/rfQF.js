  // --- rfQF (lane smrelief, 2026-11-18): a bend relief at a tray's corner folded with the neighbouring bend on
  // OpenCascade (Kernel.flangeLayout's bendCuts, cylinderCutter): folded volume = flat area x T, valid, = Anvil ---
  function rfQFoTray(units, T, W, H, L, reliefs, extra) {
    var s = 'p.units("' + units + '"); p.sheet(' + T + ', ' + T + ', 0.5); p.sketch("Top").rect(0, -' + H + ', ' + W + ', ' + H + ').end().baseFlange();\n';
    [[W / 2, T, 0], [W / 2, T, H], [0, T, H / 2], [W, T, H / 2]].forEach(function (e, i) {
      if (reliefs[i]) s += 'p.flange(' + L + ', [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer", relief: "' + reliefs[i] + '" });\n';
    });
    return s + (extra || '');
  }
  var RFQF_CASES = [
    { name: 'inch tray, rect bend reliefs', code: rfQFoTray('in', 0.06, 8, 6, 1, ['rect', 'rect', 'rect', 'rect']) },
    { name: 'inch tray, obround bend reliefs', code: rfQFoTray('in', 0.06, 8, 6, 1, ['obround', 'obround', 'obround', 'obround']) },
    { name: 'inch tray, rect / tear / obround, Circular corner reliefs (rfQB)', code: rfQFoTray('in', 0.06, 8, 6, 1, ['rect', 'tear', 'obround', 'rect'], 'p.cornerRelief([[7.88, 0.06, 5.88], [0.12, 0.06, 0.12]], null, { reliefType: "circular" });\n'), anvilTol: 1e-6 },
    { name: 'mm tray, rect bend reliefs, Tear corner reliefs (rfQB)', code: rfQFoTray('mm', 1.5, 93.5775, 113.9542, 36.2558, ['rect', 'rect', 'rect', 'rect'], 'p.cornerRelief([[90.5775, 1.5, 110.9542], [3, 1.5, 3]], null, { reliefType: "tear" });\n') },
    { name: 'mm tray, obround bend reliefs', code: rfQFoTray('mm', 1.5, 93.5775, 113.9542, 36.2558, ['obround', 'obround', 'obround', 'obround']) }
  ];
  for (var qfc of RFQF_CASES) {
    try {
      var tqf = performance.now(), mqf = K.newModel('T'); K.runScript(mqf, qfc.code);
      var aqf = K.rebuild(JSON.parse(JSON.stringify(mqf))), meshQf = K.meshFromBody(aqf.body), avqf = K.massProps(meshQf, 1).volume, whyQF = [];
      if (Object.keys(aqf.errors).length) whyQF.push('Anvil errors ' + JSON.stringify(aqf.errors));
      var rqf = await occt(JSON.parse(JSON.stringify(mqf)), { noCache: true });
      if (rqf.unsupported || !rqf.ok) whyQF.push('OpenCascade did not build every feature: ' + (rqf.unsupported || JSON.stringify(rqf.status)));
      else {
        if (!rqf.valid) whyQF.push('invalid solid');
        var fqf = K.flatPattern(mqf, aqf, meshQf), T = K.sheetParams(mqf).thickness;
        var aT = fqf.loops.reduce(function (s, l, i) { return s + Math.abs(K.signedArea(l)) * (i ? -1 : 1); }, 0) * T;
        if (!(Math.abs(rqf.volume - aT) <= 1e-9 * aT)) whyQF.push('OpenCascade volume ' + rqf.volume + ' vs flat area x T ' + aT);
        if (!(Math.abs(rqf.volume - avqf) <= (qfc.anvilTol || 1e-9) * avqf)) whyQF.push('OpenCascade volume ' + rqf.volume + ' vs Anvil ' + avqf);
      }
      row(whyQF.length ? 'bad' : 'ok', 'rfQF, OpenCascade: ' + qfc.name, whyQF.join('\n') || ('volume ' + rqf.volume.toFixed(6) + ' = flat area x T'), performance.now() - tqf);
      counts[whyQF.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfQF, OpenCascade: ' + qfc.name, e.message); counts.fail++; }
  }
  // Corner-Trim lives in the flat: OpenCascade builds the part with it (no feature left unbuilt), the solid as without it
  try {
    var tct = performance.now(), whyCT = [], TRQ = rfQFoTray('in', 0.06, 8, 6, 1, ['none', 'none', 'none', 'none']);
    var mct = K.newModel('T'); K.runScript(mct, TRQ + 'p.cornerTrim({ relief: "circular", size: 0.125, breakCorner: "chamfer", breakSize: 0.1 });\n');
    var mc0 = K.newModel('T'); K.runScript(mc0, TRQ);
    var rct = await occt(JSON.parse(JSON.stringify(mct)), { noCache: true }), rc0 = await occt(JSON.parse(JSON.stringify(mc0)), { noCache: true });
    if (rct.unsupported || !rct.ok || !rct.valid) whyCT.push('OpenCascade: ' + (rct.unsupported || JSON.stringify(rct.status)) + ' valid ' + rct.valid);
    else if (!(Math.abs(rct.volume - rc0.volume) <= 1e-12 * rc0.volume)) whyCT.push('volume with Corner-Trim ' + rct.volume + ', without ' + rc0.volume);
    row(whyCT.length ? 'bad' : 'ok', 'rfQF, OpenCascade: Corner-Trim leaves the folded solid as it is', whyCT.join('\n') || ('volume ' + rct.volume.toFixed(6)), performance.now() - tct);
    counts[whyCT.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfQF, OpenCascade: Corner-Trim leaves the folded solid as it is', e.message); counts.fail++; }
  // --- end rfQF ---
