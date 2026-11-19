  // --- rfQD (lane shopflow8 follow-up, head, 2026-11-18): a Linear Pattern of a Forming Tool on OpenCascade forms every
  // copy like the seed (it failed with "Pattern source feature has no geometry" and kept the seed only) ---
  try {
    var tqd = performance.now(), whyQD = [];
    var QD_PLATE = 'p.units("in");\np.sheet(0.0598, 0.0625, 0.44);\np.sketch("Top").rect(0, -10, 10, 10).end().baseFlange();\n';
    var mqd = K.newModel('T'); K.runScript(mqd, QD_PLATE + 'p.formingTool("louver", [2, 0.0598, 2], { angle: 0 });\np.linearPattern({ dir: "z", spacing: 1.5, count: 4 });\n');
    var aqd = K.rebuild(JSON.parse(JSON.stringify(mqd))), avqd = K.massProps(K.meshFromBody(aqd.body), 1).volume;
    if (Object.keys(aqd.errors).length) whyQD.push('Anvil errors ' + JSON.stringify(aqd.errors));
    var rqd = await occt(JSON.parse(JSON.stringify(mqd)), { noCache: true });
    if (rqd.unsupported || !rqd.ok) whyQD.push('OpenCascade did not build every feature: ' + (rqd.unsupported || JSON.stringify(rqd.status)));
    else if (!(Math.abs(rqd.volume - avqd) <= 1e-6 * avqd)) whyQD.push('OpenCascade volume ' + rqd.volume + ' vs Anvil ' + avqd);
    row(whyQD.length ? 'bad' : 'ok', 'rfQD, OpenCascade = Anvil: Linear Pattern of a louver x4', whyQD.join('\n') || ('volume ' + rqd.volume.toFixed(6)), performance.now() - tqd);
    counts[whyQD.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rfQD, OpenCascade = Anvil: Linear Pattern of a louver x4', e.message); counts.fail++; }
  // --- end rfQD ---
