  // --- rfDX: Draft (Neutral Plane) through BRepOffsetAPI_DraftAngle: planar faces on both kernels to the closed form;
  // a cylinder and a filleted block with Along Tangent become exact cones on both kernels (Anvil's since rfGH) ---
  var rfDXt = Math.tan(5 * Math.PI / 180), rfDXblock = 'p.units("in");\np.sketch("Top").rect(-1, -1, 2, 2).end().extrude(1);\n', rfDXsides = '[[1, 0.5, 0], [-1, 0.5, 0], [0, 0.5, 1], [0, 0.5, -1]]';
  function rfDXfr(a, b, h) { return h / 3 * (a * a + b * b + a * b); }
  var DX_CASES = [
    { name: '2 x 2 x 1 in block, four sides 5° about the bottom face (top 2 - 2 tan 5°)', code: rfDXblock + 'p.draft(5, [0, 0, 0], ' + rfDXsides + ');', want: rfDXfr(2, 2 - 2 * rfDXt, 1), both: true },
    { name: 'the same, Reverse direction (top 2 + 2 tan 5°)', code: rfDXblock + 'p.draft(5, [0, 0, 0], ' + rfDXsides + ', { reverse: true });', want: rfDXfr(2, 2 + 2 * rfDXt, 1), both: true },
    { name: 'neutral plane through the middle (Top Plane offset 0.5)', code: rfDXblock + 'var pl = p.plane("Top", 0.5);\np.draft(5, pl, ' + rfDXsides + ');', want: rfDXfr(2 + rfDXt, 2, 0.5) + rfDXfr(2, 2 - rfDXt, 0.5), both: true },
    { name: 'Ø 2 x 1 in cylinder drafted 5°: an exact cone on both kernels', code: 'p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(1);\np.draft(5, [0, 0, 0], [[1, 0.5, 0]]);', want: Math.PI / 3 * (1 + Math.pow(1 - rfDXt, 2) + (1 - rfDXt)), both: true },
    { name: 'block with R.25 vertical fillets, one side picked, Along Tangent: every side and fillet drafted, on both kernels', code: rfDXblock + 'p.fillet(0.25, [[1, 0.5, 1], [1, 0.5, -1], [-1, 0.5, 1], [-1, 0.5, -1]]);\np.draft(5, [0, 0, 0], [[1, 0.5, 0]], { propagate: "tangent" });',
      want: 4 * (1 - rfDXt + rfDXt * rfDXt / 3) - (4 - Math.PI) * (0.0625 - 0.25 * rfDXt + rfDXt * rfDXt / 3), both: true }
  ];
  for (var dxc of DX_CASES) {
    try {
      var tdx = performance.now(), mdx = K.newModel('T'); K.runScript(mdx, dxc.code);
      var adx = K.rebuild(JSON.parse(JSON.stringify(mdx))), avdx = K.massProps(K.meshFromBody(adx.body), 1).volume;
      var rdx = await occt(JSON.parse(JSON.stringify(mdx)), { noCache: true }), whyDX = [];
      if (dxc.both && Object.keys(adx.errors).length) whyDX.push('Anvil errors ' + JSON.stringify(adx.errors));
      if (!dxc.both && !Object.keys(adx.errors).length) whyDX.push('Anvil should refuse the curved face');
      if (rdx.unsupported || !rdx.ok) whyDX.push('OpenCascade did not build every feature: ' + (rdx.unsupported || JSON.stringify(rdx.status)));
      if (!rdx.valid) whyDX.push('invalid solid');
      if (!(Math.abs(rdx.volume - dxc.want) <= 1e-9 * dxc.want)) whyDX.push('OpenCascade volume ' + rdx.volume + ', exact ' + dxc.want);
      if (dxc.both && !(Math.abs(avdx - dxc.want) <= 1e-9 * dxc.want)) whyDX.push('Anvil volume ' + avdx + ', exact ' + dxc.want);
      row(whyDX.length ? 'bad' : 'ok', 'rfDX Draft: ' + dxc.name, whyDX.join('\n') || ('OpenCascade ' + rdx.volume.toFixed(9) + (dxc.both ? ' / Anvil ' + avdx.toFixed(9) : '') + ' / exact ' + dxc.want.toFixed(9)), performance.now() - tdx);
      counts[whyDX.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfDX Draft: ' + dxc.name, e.message); counts.fail++; }
  }
  // --- end rfDX ---
