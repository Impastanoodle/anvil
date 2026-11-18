  // --- r11/faceref11 ---
  // face references after the extrude is reversed (the sketch stays on the cap it was drawn on) and on faces of
  // pattern / mirror copies (a 'cap' of the copy): the model is built once by Anvil (which writes the caps and copy
  // frames), edited, and the same JSON handed to both kernels, which must put the pins in the same place
  try {
    var t11 = performance.now(), why11 = [], det11 = [];
    function pin11(m, b, pred, cx, cy, r, d) {
      var mesh = K.meshFromBody(b.body), face = mesh.faces.filter(pred)[0];
      var pl = K.tidyPlane(K.planeFromFace(face.normal, K.vec.scale(face.normal, face.w)));
      pl.face = K.faceRef(m, face.polys[0].shared, pl, b.planes);
      m.features.push({ id: m.nextId++, type: 'sketch', plane: pl, entities: [{ t: 'circle', cx: cx, cy: cy, r: r }] });
      m.features.push({ id: m.nextId++, type: 'extrude', sketch: m.nextId - 2, depth: d, end: 'blind' });
    }
    var cases11 = [
      { name: 'pin on a base that is then reversed (hangs under it)',
        code: 'var base = p.sketch("Top").rect(0, -40, 60, 40).extrude(10, { name: "Base" }).last();\np.sketch({ face: base, normal: [0, 1, 0] }).circle(30, -20, 5).extrude(5);',
        edit: function (m) { m.features[1].reverse = true; }, exact: 24000 + Math.PI * 25 * 5, bottom: -15 },
      { name: 'pin on a circular-pattern copy of an arm, arm made longer and the pattern 4 -> 3',
        code: 'p.sketch("Top").rect(-10, -10, 20, 20).extrude(10);\nvar arm = p.sketch("Right").rect(-3, 2, 6, 6).extrude(40).last();\np.circularPattern({ feature: arm, axis: "y", count: 4 });',
        pick: function (m, b) { pin11(m, b, function (f) { return f.normal[2] < -0.9 && Math.abs(f.w - 40) < 1e-6; }, 0, 5, 2, 5); },
        edit: function (m) { m.features[3].depth = 45; m.features[4].n = 3; }, pinVolume: Math.PI * 4 * 5 },
      { name: 'pin on a mirror copy of a lug, lug made deeper and the mirror plane moved',
        code: 'p.sketch("Top").rect(-5, -10, 10, 10).extrude(5);\nvar lug = p.sketch("Right", 10).rect(-8, 0, 6, 10).extrude(10).last();\np.mirror("Right", { feature: lug });',
        pick: function (m, b) { pin11(m, b, function (f) { return f.normal[0] < -0.9 && Math.abs(f.w - 20) < 1e-6; }, 5, 5, 1.5, 2); },
        edit: function (m) { m.features[3].depth = 15; m.features[4].offset = -5; }, pinVolume: Math.PI * 2.25 * 2, minX: -37 }
    ];
    for (var c11 of cases11) {
      var m11 = K.newModel('T'); K.runScript(m11, c11.code);
      var b11 = K.rebuild(m11);
      if (c11.pick) { c11.pick(m11, b11); K.rebuild(m11); }
      c11.edit(m11);
      var pristine11 = JSON.stringify(m11), ab11 = K.rebuild(JSON.parse(pristine11)), av11 = K.massProps(K.meshFromBody(ab11.body), 1).volume, abb11 = ab11.body.getBounds();
      var ro11 = await occt(JSON.parse(pristine11), { noCache: true });
      if (Object.keys(ab11.errors).length || Object.keys(ab11.warnings).length) why11.push(c11.name + ': Anvil ' + JSON.stringify([ab11.errors, ab11.warnings]));
      Object.keys(ro11.status).forEach(function (id) { if (ro11.status[id] !== 'ok') why11.push(c11.name + ': OpenCascade feature ' + id + ' ' + ro11.status[id]); });
      if (!ro11.valid) why11.push(c11.name + ': invalid OpenCascade solid');
      if (!(Math.abs(ro11.volume - av11) / av11 <= 1e-6)) why11.push(c11.name + ': OpenCascade ' + ro11.volume.toFixed(4) + ' vs Anvil ' + av11.toFixed(4));
      if (c11.exact != null && !(Math.abs(av11 - c11.exact) / c11.exact <= 1e-9)) why11.push(c11.name + ': Anvil ' + av11.toFixed(4) + ' vs exact ' + c11.exact.toFixed(4));
      if (c11.pinVolume != null) {
        var nopin = JSON.parse(pristine11); nopin.features = nopin.features.slice(0, -2);
        var rn11 = await occt(nopin, { noCache: true });
        if (!(Math.abs(ro11.volume - rn11.volume - c11.pinVolume) <= 1e-6 * ro11.volume)) why11.push(c11.name + ': OpenCascade pin ' + (ro11.volume - rn11.volume).toFixed(4) + ' vs ' + c11.pinVolume.toFixed(4));
      }
      for (var k11 = 0; k11 < 3; k11++) if (!(Math.abs(ro11.bbox[0][k11] - abb11.min[k11]) < 1e-6 && Math.abs(ro11.bbox[1][k11] - abb11.max[k11]) < 1e-6)) why11.push(c11.name + ': box ' + JSON.stringify(ro11.bbox) + ' vs Anvil ' + JSON.stringify([abb11.min, abb11.max]));
      if (c11.bottom != null && !(Math.abs(ro11.bbox[0][1] - c11.bottom) < 1e-6)) why11.push(c11.name + ': bottom ' + ro11.bbox[0][1] + ', expected ' + c11.bottom);
      if (c11.minX != null && !(Math.abs(ro11.bbox[0][0] - c11.minX) < 1e-6)) why11.push(c11.name + ': min x ' + ro11.bbox[0][0] + ', expected ' + c11.minX);
      det11.push(ro11.volume.toFixed(3) + ' / ' + av11.toFixed(3));
    }
    row(why11.length ? 'bad' : 'ok', 'Face references follow a reversed extrude\'s cap and pattern / mirror copies: OpenCascade and Anvil put the face sketches in the same place', why11.slice(0, 6).join('\n') || 'OpenCascade / Anvil ' + det11.join(', '), performance.now() - t11);
    counts[why11.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'Face references: reversed caps and pattern copies (both kernels)', e.message); counts.fail++; }
  // --- end r11/faceref11 ---
