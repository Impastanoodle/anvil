  // --- rfKN (lane mitrefid2, 2026-11-09; kernel side tests/kernel/rfKK.js): mitres at corners that are not 90° on a
  // square (report 2026-11-02 row 5d and rfKK's trapezoid). The bend's tapered end (flangeLayout's part.tapers) is a
  // polygon in (s, t); OpenCascade drew a shallow one as an elliptic arc (6e-5 to 1.6e-4 under). Now = Anvil to 1e-6.
  var KN = (function () {
    var T = 0.0598, H = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
    var SQ = H + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n', TZ = H + 'p.sketch("Top").polyline([[0, 0], [6, 0], [5, -3], [1, -3]], true).end().baseFlange();\n';
    var PL = H + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n', BOTH = '[[3, ' + T + ', 0], [5.5, ' + T + ', 1.5]]';
    function fl(a, pos) { return TZ + 'p.flange(1, ' + BOTH + ', { angle: ' + a + ', position: "' + pos + '", lengthRef: "outer", miter: true });\n'; }
    return [
      { name: '5d: 120° Bend Outside mitre on a square corner (L .896423361; SolidWorks 2.064856)', code: SQ + 'p.flange(0.896423361, [[3, ' + T + ', 4], [6, ' + T + ', 2]], { angle: 120, position: "bendOutside", miter: true });\n' },
      { name: '5d: 90° Bend Outside mitre on the trapezoid\'s 71.6° corner (L .9402; SolidWorks 1.498330)', code: TZ + 'p.flange(0.9402, ' + BOTH + ', { position: "bendOutside", miter: true });\n' },
      // (its first stage's square end is miterTaper's sin curve: OpenCascade draws SolidWorks' true curve, the DL rows,
      // Anvil 3 chords on it: 1.25e-6 apart; the later stage's straight taper is equal)
      { name: '5d: Miter Flange L profile, Material Inside, gap .01 (SolidWorks 1.016735; first stage on the true curve, 2e-6)', tol: 2e-6, code: PL + 'p.sketch("Right").line(-2, ' + T + ', -2, 1.0598).line(-2, 1.0598, -2.5, 1.0598).end();\np.miterFlange([[2, ' + T + ', 2], [4, ' + T + ', 1]], { position: "inside", miterGap: 0.01, relief: "rect" });\n' },
      { name: 'rfKK: trapezoid, Material Inside 90°, 71.6° corner mitred', code: fl(90, 'inside') },
      { name: 'rfKK: trapezoid, Material Outside 90°', code: fl(90, 'outside') },
      { name: 'rfKK: trapezoid, Virtual Sharp 120°', code: fl(120, 'virtualSharp') },
      { name: 'rfKK: trapezoid, Bend Outside 120°', code: fl(120, 'bendOutside') },
      { name: 'rfKK: square corner, Material Inside 120°', code: SQ + 'p.flange(1, [[3, ' + T + ', 4], [6, ' + T + ', 2]], { angle: 120, position: "inside", lengthRef: "outer" });\n' },
      { name: 'rfKK: trapezoid top edge alone, Material Inside 120° (acute free ends, no taper)', code: TZ + 'p.flange(1, [[3, ' + T + ', 0]], { angle: 120, position: "inside", lengthRef: "outer" });\n' }
    ];
  })();
  for (var kn = 0; kn < KN.length; kn++) {
    var tkn = performance.now(), whyKN = [], cn = KN[kn];
    try {
      var mKN = K.newModel('T'); K.runScript(mKN, cn.code);
      var bKN = K.rebuild(mKN), volKN = K.massProps(K.meshFromBody(bKN.body), 1).volume;
      if (Object.keys(bKN.errors).length) whyKN.push('Anvil: ' + JSON.stringify(bKN.errors));
      var oKN = await occt(mKN), dKN = (oKN.volume - volKN) / volKN;
      if (oKN.unsupported || !oKN.valid) whyKN.push('OpenCascade built ' + (oKN.unsupported || 'an invalid solid'));
      if (!(Math.abs(dKN) < (cn.tol || 1e-6))) whyKN.push('OpenCascade ' + oKN.volume.toFixed(9) + ' in³, Anvil ' + volKN.toFixed(9) + ' (d ' + dKN.toExponential(2) + ')');
      row(whyKN.length ? 'bad' : 'ok', 'rfKN: ' + cn.name + ': OpenCascade = Anvil to ' + (cn.tol || 1e-6), whyKN.join('\n') || volKN.toFixed(9) + ' in³, d ' + dKN.toExponential(1), performance.now() - tkn);
      counts[whyKN.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfKN: ' + cn.name + ': OpenCascade = Anvil to 1e-6', e.message); counts.fail++; }
  }
  // --- end rfKN ---
