  // --- rfFA (2026-10-29, lane FA: Curves) --- sweeps along reference curves on both kernels: OpenCascade sweeps the
  // exact helix (a line on its cylinder / cone), the composite's exact lines and arcs and the splines' C1 cubics
  var FA_SPRING = 'p.units("in");\nvar s = p.sketch("Top").circle(0, 0, 0.5).id();\nvar h = p.helix(s, { pitch: 0.25, revolutions: 4 });\nvar pr = p.sketch("Front").circle(0.5, 0, 0.05).id();\np.sweep({ profile: pr, path: h });';
  var FA_CASES = [
    { name: 'spring: Ø0.1 along a helix R 0.5, pitch 0.25, 4 revolutions (exact on both; OpenCascade 1e-5: BRepLib builds the 3D helix to 1e-5)', code: FA_SPRING, want: Math.PI * 0.0025 * 4 * Math.hypot(Math.PI, 0.25), occtTol: 1e-5, anvilTol: 1e-9 },
    { name: 'composite curve (line, arc, line) swept with a Ø3 circle (OpenCascade exact)', code: 'var a = p.sketch("Right").line(0, 0, 0, 20).arc(5, 20, 5, 90, 180).line(5, 25, 40, 25).id();\nvar c = p.compositeCurve([{ sketch: a, entity: 0 }, { sketch: a, entity: 1 }, { sketch: a, entity: 2 }]);\nvar pr = p.sketch("Top").circle(0, 0, 1.5).id();\np.sweep({ profile: pr, path: c });', want: Math.PI * 2.25 * (55 + 2.5 * Math.PI), occtTol: 1e-6, anvilTol: 2e-3 },
    { name: 'tapered helix (10°, 3 revolutions in 40) swept with a Ø4 circle: the kernels agree', code: 'var s = p.sketch("Top").circle(0, 0, 20).id();\nvar h = p.helix(s, { defineBy: "heightRev", height: 40, revolutions: 3, taper: 10 });\nvar pr = p.sketch("Front").circle(20, 0, 2).id();\np.sweep({ profile: pr, path: h });', want: null, agree: 1e-4 },
    { name: 'curve through XYZ points swept with a Ø4 circle: the kernels agree', code: 'var c = p.xyzCurve([[0, 0, 0], [0, 0, 20], [10, 5, 40], [30, 5, 50]]);\nvar pr = p.sketch("Top").circle(0, 0, 2).id();\np.sweep({ profile: pr, path: c });', want: null, agree: 2e-3 }
  ];
  for (var fai = 0; fai < FA_CASES.length; fai++) {
    var fac = FA_CASES[fai];
    try {
      var tfa = performance.now(), mfa = K.newModel('T'), whyFA = [];
      K.runScript(mfa, fac.code);
      var rfa = await occt(JSON.parse(JSON.stringify(mfa))), afa = K.rebuild(JSON.parse(JSON.stringify(mfa)));
      var avfa = K.massProps(K.meshFromBody(afa.body)).volume;
      if (!rfa.ok) whyFA.push('status ' + JSON.stringify(rfa.status));
      if (!rfa.valid) whyFA.push('invalid solid');
      if (Object.keys(afa.errors).length) whyFA.push('Anvil errors ' + JSON.stringify(afa.errors));
      if (fac.want != null) {
        if (!(Math.abs(rfa.volume - fac.want) <= fac.occtTol * fac.want)) whyFA.push('OpenCascade volume ' + rfa.volume + ', exact ' + fac.want);
        if (!(Math.abs(avfa - fac.want) <= fac.anvilTol * fac.want)) whyFA.push('Anvil volume ' + avfa + ', exact ' + fac.want);
      } else if (!(Math.abs(rfa.volume - avfa) <= fac.agree * avfa)) whyFA.push('OpenCascade ' + rfa.volume + ' vs Anvil ' + avfa);
      row(whyFA.length ? 'bad' : 'ok', 'rfFA sweep along a curve, OpenCascade = Anvil: ' + fac.name, whyFA.join('\n') || ('OpenCascade ' + rfa.volume.toFixed(6) + ' / Anvil ' + avfa.toFixed(6) + (fac.want != null ? ' / exact ' + fac.want.toFixed(6) : '')), performance.now() - tfa);
      counts[whyFA.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfFA sweep along a curve, OpenCascade = Anvil: ' + fac.name, e.message); counts.fail++; }
  }
  // --- end rfFA ---
