  // --- cutbend: a hole, slot or notch cut before an edge flange or a sketched bend that crosses the bend zone stays cut:
  // OpenCascade cuts it from the exact sweep (round holes wrapped exactly: an ellipse on the bend's cylinder, thickened
  // radially). With K .5 the neutral axis is the mid-surface, so the metal a cut takes is T × its flat area wherever it
  // lies: OpenCascade's volume must be the uncut part's less exactly that. Both kernels' flats: same size, bends and
  // loops (the cut once, in place); DXF entities equal where the cut has no curve. rfI: a round hole's loop in
  // OpenCascade's flat joins its exact tessellation in the sheet to Anvil's polygon in the bend; Kernel.flatPattern
  // snaps it to its circle (snapFlatCircle), so both kernels write it as one CIRCLE (`circle`: checked on both) ---
  var CB_CUT = function (s) { return 'p.sketch("Top", ' + SH_T + ')' + s + '.cut("through", { reverse: true });\n'; };
  var CB_FLIN = 'p.flange(1, [[6, ' + SH_T + ', 2]], { position: "inside" });', CB_SB = 'p.sketch("Top", ' + SH_T + ').line(3, 0, 3, -4).sketchedBend(90, { fixed: [1, 0, 2] });';
  var CB_CASES = [
    // Material Inside: the bend starts 2T in, at x = 5.8804; the cut is centred on that line
    { name: 'Edge Flange (Material Inside) over a Ø.2 hole on its bend line', plain: SH_HEAD + CB_FLIN, code: SH_HEAD + CB_CUT('.circle(5.8804, -2, 0.1)') + CB_FLIN, area: Math.PI * 0.01, loops: 2 },
    { name: 'Edge Flange (Material Inside) over a .2 square on its bend line', plain: SH_HEAD + CB_FLIN, code: SH_HEAD + CB_CUT('.rect(5.7804, -2.1, 0.2, 0.2)') + CB_FLIN, area: 0.04, loops: 2, dxf: true },
    // Bend Outside: a hole within T of the edge sat under the sweep's overlap strip into the sheet
    { name: 'Edge Flange (Bend Outside) beside a Ø.06 hole .02 from the edge', plain: SH_HEAD + 'p.flange(1, [[6, ' + SH_T + ', 2]]);', code: SH_HEAD + CB_CUT('.circle(5.95, -2, 0.03)') + 'p.flange(1, [[6, ' + SH_T + ', 2]]);', area: Math.PI * 0.0009, loops: 2, dxf: true },
    { name: 'Sketched Bend across a Ø.5 hole and a .375 slot', plain: SH_HEAD + CB_SB, code: SH_HEAD + CB_CUT('.circle(3, -1, 0.25)') + CB_CUT('.slot(2.5, -3, 3.5, -3, 0.375)') + CB_SB, area: Math.PI * 0.0625 + 0.375 + Math.PI * 0.375 * 0.375 / 4, loops: 3, dxf: true, circle: 1 },
    // rfI: a Ø.281 clearance hole through the bend of an Edge Flange (Material Inside): one CIRCLE in both flats
    { name: 'Edge Flange (Material Inside) over a Ø.281 hole through its bend', plain: SH_HEAD + CB_FLIN, code: SH_HEAD + CB_CUT('.circle(5.85, -2, 0.1405)') + CB_FLIN, area: Math.PI * 0.1405 * 0.1405, loops: 2, dxf: true, circle: 1 },
    { name: 'Sketched Bend across a notch in the plate\'s edge', plain: SH_HEAD + CB_SB, code: SH_HEAD + CB_CUT('.rect(2.8, -0.3, 0.4, 0.3)') + CB_SB, area: 0.12, loops: 1, dxf: true },
    // a line slanted across the plate: the bend follows the plate's edges, the flat is the plate
    { name: 'Sketched Bend along a line slanted across the plate', plain: null, code: SH_HEAD + 'p.sketch("Top", ' + SH_T + ').line(2.5, 0, 3.5, -4).sketchedBend(90, { fixed: [1, 0, 2] });', exact: 24 * SH_T, loops: 1, dxf: true }
  ];
  for (var cbi = 0; cbi < CB_CASES.length; cbi++) {
    var cb = CB_CASES[cbi], tcb = performance.now();
    try {
      var cbm = K.newModel('T'); K.runScript(cbm, cb.code);
      var cbb = K.rebuild(cbm), cbmesh = K.meshFromBody(cbb.body), whyC = [];
      if (Object.keys(cbb.errors).length) whyC.push('Anvil errors ' + JSON.stringify(cbb.errors));
      var cbr = await occt(cbm, { noCache: true });
      if (cbr.unsupported) whyC.push('OpenCascade: unsupported ' + cbr.unsupported);
      Object.keys(cbr.status).forEach(function (id) { if (cbr.status[id] !== 'ok') whyC.push('OpenCascade feature ' + id + ': ' + cbr.status[id]); });
      if (!cbr.valid) whyC.push('invalid solid');
      var cva = K.massProps(cbmesh, 1).volume, cdv = Math.abs(cbr.volume - cva) / cva;
      if (!(cdv <= (cbr.tolerance || 1e-4))) whyC.push('volume ' + cbr.volume.toFixed(6) + ' vs Anvil ' + cva.toFixed(6));
      var want = cb.exact;
      if (cb.plain) { var pm = K.newModel('T'); K.runScript(pm, cb.plain); K.rebuild(pm); var pr = await occt(pm, { noCache: true }); want = pr.volume - SH_T * cb.area; }
      if (!(Math.abs(cbr.volume - want) <= 1e-6 * want)) whyC.push('OpenCascade volume ' + cbr.volume.toFixed(7) + ', exact ' + want.toFixed(7));
      var cbb2 = cbb.body.getBounds(), cdb = 0;
      if (cbr.bbox) for (var c3 = 0; c3 < 3; c3++) cdb = Math.max(cdb, Math.abs(cbr.bbox[0][c3] - cbb2.min[c3]), Math.abs(cbr.bbox[1][c3] - cbb2.max[c3])); else cdb = Infinity;
      if (!(cdb <= 1e-4)) whyC.push('bbox off by ' + cdb.toExponential(2));
      var cfa = K.flatPattern(cbm, cbb, cbmesh), cfo = null;
      if (!whyC.length) {
        var cob = OcctKernel.toBuild(cbr, cbb, cbmesh, null, CSG, K);
        cfo = K.flatPattern(cbm, cob, K.meshFromBody(cob.body));
        [0, 1].forEach(function (k) { if (Math.abs(cfo.size[k] - cfa.size[k]) > 1e-6) whyC.push('flat ' + 'wh'[k] + ' ' + cfo.size[k].toFixed(4) + ' vs Anvil ' + cfa.size[k].toFixed(4)); });
        if (cfo.loops.length !== cb.loops || cfa.loops.length !== cb.loops) whyC.push('loops ' + cfo.loops.length + ' / Anvil ' + cfa.loops.length + ', want ' + cb.loops);
        if (cfo.bends.length !== cfa.bends.length) whyC.push('bends ' + cfo.bends.length + ' / Anvil ' + cfa.bends.length);
        var srt = function (o) { var s = {}; Object.keys(o).sort().forEach(function (k) { s[k] = o[k]; }); return JSON.stringify(s); };
        if (cb.dxf && srt(shDxf(cfo)) !== srt(shDxf(cfa))) whyC.push('DXF ' + JSON.stringify(shDxf(cfo)) + ' vs Anvil ' + JSON.stringify(shDxf(cfa)));
        if (cb.circle != null) [['OpenCascade', cfo], ['Anvil', cfa]].forEach(function (q) { var dq = shDxf(q[1]); if ((dq['CIRCLE/HOLES'] || 0) !== cb.circle) whyC.push(q[0] + ' flat DXF ' + JSON.stringify(dq) + ', want ' + cb.circle + ' CIRCLE on HOLES'); });
      }
      row(whyC.length ? 'bad' : 'ok', 'cut across a bend, OpenCascade = Anvil: ' + cb.name, whyC.join('\n') || ('volume ' + cbr.volume.toFixed(7) + ' (exact ' + want.toFixed(7) + ', Anvil ' + cva.toFixed(6) + '), flat ' + cfo.size.map(function (v) { return v.toFixed(4); }).join(' × ') + ' in, ' + cfo.loops.length + ' loop' + (cfo.loops.length === 1 ? '' : 's') + ', DXF ' + JSON.stringify(shDxf(cfo))), performance.now() - tcb);
      counts[whyC.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'cut across a bend, OpenCascade = Anvil: ' + cb.name, e.message); counts.fail++; }
  }
  // --- end cutbend ---
