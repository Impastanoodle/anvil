  // --- rfI: pick tolerances in the model's units on both kernels (0.5 mm, 0.5 / 25.4 in an inch part, or the feature's
  // size): on a small inch part a fillet picked 0.3 mm off its edge and a shell picked on its face build to the exact
  // volume; a fillet picked 1.5 mm off and a shell picked .15 in above the face are refused by both (OpenCascade's shell
  // used to fall through to a closed shell when its pick found no face) ---
  var RFI_HEAD = 'p.units("in");\np.box(1, 0.5, 0.1);\n', RFI_SHELL = 'p.units("in");\np.box(1, 1, 0.5);\n';
  var RFI_CASES = [
    { name: 'inch fillet R.03 picked 0.3 mm off its edge', code: RFI_HEAD + 'p.fillet(0.03, [[0.5, 0.1, ' + 0.3 / 25.4 + ']]);', exact: 0.05 - (1 - Math.PI / 4) * 0.0009 },
    { name: 'inch fillet R.03 picked 1.5 mm off its edge is refused', code: RFI_HEAD + 'p.fillet(0.03, [[0.5, 0.1, ' + 1.5 / 25.4 + ']]);', refused: /No edges found/ },
    { name: 'inch shell .05 with the top open', code: RFI_SHELL + 'p.shell(0.05, [[0.5, 0.5, 0.5]]);', exact: 0.5 - 0.9 * 0.9 * 0.45 },
    { name: 'inch shell .05 picked .15 in above the top is refused', code: RFI_SHELL + 'p.shell(0.05, [[0.5, 0.65, 0.5]]);', refused: /not found/ }
  ];
  for (var rfi = 0; rfi < RFI_CASES.length; rfi++) {
    var rc = RFI_CASES[rfi], trf = performance.now();
    try {
      var ra = anvilBuild(rc.code), rr = await occt(ra.model, { noCache: true }), whyR = [], last = ra.model.features[ra.model.features.length - 1].id;
      var rst = rr.status[last] || '';
      if (rc.refused) {
        if (ra.errors.indexOf(String(last)) < 0 && ra.errors.indexOf(last) < 0) whyR.push('Anvil built it');
        if (rst === 'ok' || !rc.refused.test(rst)) whyR.push('OpenCascade: ' + JSON.stringify(rst));
      } else {
        if (ra.errors.length) whyR.push('Anvil errors ' + ra.errors.join(', '));
        Object.keys(rr.status).forEach(function (id) { if (rr.status[id] !== 'ok') whyR.push('OpenCascade feature ' + id + ': ' + rr.status[id]); });
        if (!rr.valid) whyR.push('invalid solid');
        if (!(Math.abs(rr.volume - rc.exact) <= 1e-6 * rc.exact)) whyR.push('OpenCascade volume ' + rr.volume.toFixed(7) + ', exact ' + rc.exact.toFixed(7));
        if (!(Math.abs(ra.volume - rc.exact) <= 2e-3 * rc.exact)) whyR.push('Anvil volume ' + ra.volume.toFixed(7) + ', exact ' + rc.exact.toFixed(7));
      }
      row(whyR.length ? 'bad' : 'ok', 'rfI pick tolerance, both kernels: ' + rc.name, whyR.join('\n') || (rc.refused ? 'refused: ' + rst : 'volume ' + rr.volume.toFixed(7) + ' in³ (exact ' + rc.exact.toFixed(7) + ', Anvil ' + ra.volume.toFixed(7) + ')'), performance.now() - trf);
      counts[whyR.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfI pick tolerance, both kernels: ' + rc.name, e.message); counts.fail++; }
  }
  // --- end rfI ---
