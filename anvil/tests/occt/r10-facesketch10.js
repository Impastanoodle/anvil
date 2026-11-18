  // --- r10/facesketch10 ---
  // sketches on faces follow the face in both kernels: each model is written with stale stored planes (offset 0 from
  // the builder, then an upstream edit) and handed untouched to Anvil and to OpenCascade, which resolve the face
  // references on their own (extrude caps by formula; a revolve's step from each kernel's own planar faces) and must
  // agree with each other and with the exact volume
  try {
    var t10 = performance.now(), why10 = [], det10 = [];
    var HOLES10 = 2 * Math.PI * 4.5 * 4.5 * 6;
    var cases10 = [
      { name: 'boss + Hole Wizard holes on the top of a base thickened to 15',
        code: 'var base = p.sketch("Top").rect(0, -40, 60, 40).extrude(10, { name: "Base" }).last();\np.sketch({ face: base, normal: [0, 1, 0] }).circle(30, -20, 5).extrude(5);\np.holeWizard({ face: { face: base, normal: [0, 1, 0] }, points: [[10, -10], [50, -30]], type: "hole", size: "M8", depth: 6 });',
        edit: function (m) { m.features[1].depth = 15; }, exact: 60 * 40 * 15 + Math.PI * 25 * 5 - HOLES10, top: 20 },
      { name: 'pin on the floor of a pocket deepened to 10, and under a mid-plane block made 16 thick',
        code: 'p.box(40, 40, 20);\nvar pk = p.sketch("Top", 20).rect(10, -30, 20, 20).cut(6, { reverse: true }).last();\np.sketch({ face: pk, normal: [0, 1, 0] }).circle(20, -20, 4).extrude(3);\nvar mb = p.sketch("Top").rect(50, -20, 20, 20).extrude(10, { midplane: true }).last();\np.sketch({ face: mb, normal: [0, -1, 0] }).circle(-60, -10, 3).extrude(4);',
        edit: function (m) { m.features[3].depth = 10; m.features[7].depth = 16; }, exact: 40 * 40 * 20 - 20 * 20 * 10 + Math.PI * 16 * 3 + 20 * 20 * 16 + Math.PI * 9 * 4, bottom: -12 },
      { name: 'pin on the top step of a revolve raised 20 -> 24 (a "geom" face reference)',
        code: 'var rev = p.sketch("Front").polyline([[0,0],[20,0],[20,10],[10,10],[10,20],[0,20]], true).revolve(360).last();\np.sketch({ face: rev, role: "geom", normal: [0, 1, 0], offset: 20 }).circle(0, 0, 4).extrude(5);',
        edit: function (m) { var q = m.features[0].entities[0].pts; q[4][1] = 24; q[5][1] = 24; }, exact: Math.PI * (400 * 10 + 100 * 14) + Math.PI * 16 * 5, top: 29 }
    ];
    for (var c10 of cases10) {
      var m10 = K.newModel('T'); K.runScript(m10, c10.code); c10.edit(m10);
      var pristine = JSON.stringify(m10);
      var am = JSON.parse(pristine), ab = K.rebuild(am), av = K.massProps(K.meshFromBody(ab.body), 1).volume, abb = ab.body.getBounds();
      var ro = await occt(JSON.parse(pristine), { noCache: true });
      if (Object.keys(ab.errors).length) why10.push(c10.name + ': Anvil errors ' + JSON.stringify(ab.errors));
      if (Object.keys(ab.warnings).length) why10.push(c10.name + ': Anvil warnings ' + JSON.stringify(ab.warnings));
      Object.keys(ro.status).forEach(function (id) { if (ro.status[id] !== 'ok') why10.push(c10.name + ': OpenCascade feature ' + id + ' ' + ro.status[id]); });
      if (!ro.valid) why10.push(c10.name + ': invalid OpenCascade solid');
      if (!(Math.abs(ro.volume - c10.exact) / c10.exact <= 1e-6)) why10.push(c10.name + ': OpenCascade ' + ro.volume.toFixed(4) + ' vs exact ' + c10.exact.toFixed(4));
      if (!(Math.abs(av - c10.exact) / c10.exact <= 1e-6)) why10.push(c10.name + ': Anvil ' + av.toFixed(4) + ' vs exact ' + c10.exact.toFixed(4));
      if (c10.top != null && !(Math.abs(ro.bbox[1][1] - c10.top) < 1e-6 && Math.abs(abb.max[1] - c10.top) < 1e-6)) why10.push(c10.name + ': top ' + ro.bbox[1][1] + ' / ' + abb.max[1] + ', expected ' + c10.top);
      if (c10.bottom != null && !(Math.abs(ro.bbox[0][1] - c10.bottom) < 1e-6 && Math.abs(abb.min[1] - c10.bottom) < 1e-6)) why10.push(c10.name + ': bottom ' + ro.bbox[0][1] + ' / ' + abb.min[1] + ', expected ' + c10.bottom);
      det10.push(ro.volume.toFixed(3) + ' / ' + av.toFixed(3));
    }
    row(why10.length ? 'bad' : 'ok', 'Sketches on faces follow the face: Anvil and OpenCascade resolve the face references alike (extrude caps, pocket floor, underside, revolve step) and match the exact volumes', why10.slice(0, 6).join('\n') || 'OpenCascade / Anvil ' + det10.join(', '), performance.now() - t10);
    counts[why10.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'Sketches on faces follow the face (both kernels)', e.message); counts.fail++; }
  // --- end r10/facesketch10 ---
