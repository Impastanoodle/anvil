  // --- rfDZ: Wrap built by OpenCascade (each contour a face on the true cylinder / plane, thickened along its normal;
  // a scribe imprinted on the final body): every feature 'ok', both kernels' volumes exact (1e-6); a scribe adds one
  // face and keeps the volume; Sketch Text "A1" debossed agrees with Anvil within the swap tolerance ---
  var DZ_CYL = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(3);\n', DZ_R = 'p.sketch("Front", 1).rect(-0.5, 1, 1, 0.5).end()', DZ_V = 3 * Math.PI, DZ_B = 0.5 * (1 - 0.95 * 0.95) / 2, DZ_E = 0.5 * (1.05 * 1.05 - 1) / 2;
  var DZ_CASES = [
    { name: 'deboss .05 of a 1 × .5 rectangle on a Ø2 cylinder', code: DZ_CYL + DZ_R + '.wrap({ face: [0, 1.25, 1], mode: "deboss", thickness: 0.05 });', want: DZ_V - DZ_B, faces: 8 },
    { name: 'emboss .05 of the same rectangle', code: DZ_CYL + DZ_R + '.wrap({ face: [0, 1.25, 1], mode: "emboss", thickness: 0.05 });', want: DZ_V + DZ_E, faces: 8 },
    { name: 'scribe of the same rectangle (one face more, same volume)', code: DZ_CYL + DZ_R + '.wrap({ face: [0, 1.25, 1], mode: "scribe" });', want: DZ_V, faces: 4 },
    { name: 'scribe on the flat end (one face more, same volume)', code: DZ_CYL + 'p.sketch("Top", 3).rect(-0.5, -0.25, 1, 0.5).end().wrap({ face: [0, 3, 0], mode: "scribe" });', want: DZ_V, faces: 4 },
    { name: 'deboss .05 on a Ø2 bore (concave)', code: 'p.units("in");\np.sketch("Top").rect(-2, -2, 4, 4).circle(0, 0, 1).end().extrude(3);\np.sketch("Front", 0).rect(-0.5, 1, 1, 0.5).end().wrap({ face: [0, 1.25, 1], mode: "deboss", thickness: 0.05 });', want: 48 - DZ_V - DZ_E },
    { name: 'deboss .05 on the flat end: a rectangle with a Ø.2 hole in it', code: DZ_CYL + 'p.sketch("Top", 3).rect(-0.5, -0.25, 1, 0.5).circle(0, 0, 0.1).end().wrap({ face: [0, 3, 0], mode: "deboss", thickness: 0.05 });', want: DZ_V - (0.5 - Math.PI * 0.01) * 0.05 },
    { name: 'Sketch Text "A1" debossed .05 on the cylinder (OpenCascade = Anvil within the swap tolerance)', code: DZ_CYL + 'p.sketch("Front", 1).text(-0.4, 1.1, "A1", { h: 0.4, mode: "outline" }).end().wrap({ face: [0, 1.25, 1], mode: "deboss", thickness: 0.05 });', want: null }
  ];
  for (var dzc of DZ_CASES) {
    try {
      var tdz = performance.now(), mdz = K.newModel('T'); K.runScript(mdz, dzc.code);
      var adz = K.rebuild(JSON.parse(JSON.stringify(mdz))), avdz = K.massProps(K.meshFromBody(adz.body), 1).volume;
      var rdz = await occt(JSON.parse(JSON.stringify(mdz)), { noCache: true }), whyDZ = [];
      if (Object.keys(adz.errors).length) whyDZ.push('Anvil errors ' + JSON.stringify(adz.errors));
      if (rdz.unsupported || !rdz.ok) whyDZ.push('OpenCascade did not build every feature: ' + (rdz.unsupported || JSON.stringify(rdz.status)));
      if (!rdz.valid) whyDZ.push('invalid solid');
      if (dzc.want != null) {
        if (!(Math.abs(rdz.volume - dzc.want) <= 1e-6 * dzc.want)) whyDZ.push('OpenCascade volume ' + rdz.volume + ', exact ' + dzc.want);
        if (!(Math.abs(avdz - dzc.want) <= 1e-6 * dzc.want)) whyDZ.push('Anvil volume ' + avdz + ', exact ' + dzc.want);
      } else if (!(Math.abs(rdz.volume - avdz) <= 1e-4 * avdz)) whyDZ.push('OpenCascade ' + rdz.volume + ' vs Anvil ' + avdz);
      if (dzc.faces && rdz.faces.length !== dzc.faces) whyDZ.push(rdz.faces.length + ' B-rep faces, want ' + dzc.faces);
      row(whyDZ.length ? 'bad' : 'ok', 'Wrap, OpenCascade = Anvil: ' + dzc.name, whyDZ.join('\n') || ('OpenCascade ' + rdz.volume.toFixed(6) + ' / Anvil ' + avdz.toFixed(6) + (dzc.want != null ? ' / exact ' + dzc.want.toFixed(6) : '') + ', ' + rdz.faces.length + ' faces'), performance.now() - tdz);
      counts[whyDZ.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'Wrap, OpenCascade = Anvil: ' + dzc.name, e.message); counts.fail++; }
  }
  // --- end rfDZ ---
