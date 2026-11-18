  // --- r3/engine3 ---
  // the worker does the swap's main-thread work: with the Anvil mesh sent along it returns the bodies packed
  // (OcctKernel.fromPacked) plus the edges, curve info and smooth normals of the mesh made from them; all of it must equal
  // what the main thread made before (OcctKernel.toBuild, Kernel.bodyEdges / meshCurveInfo / analyticNormals)
  for (var xi = 0; xi < 3; xi++) {
    var xname = ['Flange', 'Mug', 'Two-body clamp'][xi];
    try {
      var tx = performance.now();
      var xm = K.newModel('T'); K.runScript(xm, EX.find(function (e) { return e.name === xname; }).code);
      var xb = K.rebuild(xm), xmesh = K.meshFromBody(xb.body), xts = new Int32Array(xmesh.triCount), xt = 0;
      xmesh.faces.forEach(function (f) { f.polys.forEach(function (p) { for (var i = 0; i < p.vertices.length - 2; i++) xts[xt++] = p.shared == null ? -1 : p.shared; }); });
      var xr = await new Promise(function (res, rej) { var s2 = ++seq; waiting[s2] = { res: res, rej: rej }; worker.postMessage({ type: 'build', seq: s2, model: JSON.parse(JSON.stringify(xm)), noCache: true, anvil: { key: 7, positions: xmesh.positions, triShared: xts } }); });
      var whyX = [];
      if (!xr.packed || xr.anvilKey !== 7) whyX.push('no packed bodies');
      var ref = OcctKernel.toBuild(xr, xb, xmesh, xts, CSG, K), got = OcctKernel.fromPacked(xr, xr.packed || [], xb, CSG, K);
      var rm = K.meshFromBody(ref.body), gm = K.meshFromBody(got.body);
      if (rm.positions.length !== gm.positions.length || !rm.positions.every(function (v, i) { return v === gm.positions[i]; })) whyX.push('mesh positions differ');
      var tagsOk = rm.faces.length === gm.faces.length && rm.faces.every(function (f, i) { var g = gm.faces[i]; return f.polys.length === g.polys.length && f.polys.every(function (p, j) { var q = g.polys[j]; return p.shared === q.shared && p.face === q.face && JSON.stringify(p.surf) === JSON.stringify(q.surf); }); });
      if (!tagsOk) whyX.push('face / feature / surface tags differ');
      if (Math.abs(K.massProps(gm, 1).volume - K.massProps(rm, 1).volume) > 1e-9) whyX.push('volume differs');
      if (JSON.stringify(xr.edges) !== JSON.stringify(K.bodyEdges(rm))) whyX.push('edges differ');
      if (JSON.stringify(xr.curves) !== JSON.stringify(K.meshCurveInfo(rm))) whyX.push('curve info differs');
      var rn = K.analyticNormals(rm);
      if (!xr.normals || xr.normals.length !== rn.length || !rn.every(function (v, i) { return v === xr.normals[i]; })) whyX.push('normals differ');
      row(whyX.length ? 'bad' : 'ok', xname + ': the worker\'s packed bodies, edges, curve info and normals equal the main thread\'s', whyX.join('; ') || (gm.faces.length + ' mesh faces, ' + xr.edges.length + ' edges, ' + xr.curves.curves.length + ' true curves'), performance.now() - tx);
      counts[whyX.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', xname + ': worker-side swap data', e.message); counts.fail++; }
  }
  // --- end r3/engine3 ---
