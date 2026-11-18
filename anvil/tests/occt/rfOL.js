  // --- rfOL (lane flangeprofile; kernel side tests/kernel/rfOL.js): (1) an Edge Flange with its own profile (Edit Flange
  // Profile: a trapezoid, a gusset end short of the edge, a stepped top, a R.5 corner, a notch, a hole) on OpenCascade:
  // the wall the profile's face with true arcs, the bend over its base; the same solid as Anvil's to 1e-9 and the closed
  // form T (24 - wb shift - reliefs) + wb A ((R + T)^2 - R^2) / 2 + T x the profile's area. (2) Tab and Slot built on
  // OpenCascade (tabSlotTools' plain prisms), equal to Anvil's on rfPT's cases and the one-body box.
  var olL = function (p, q) { return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; };
  var olPoly = function (pts) { return pts.map(function (p, i) { return olL(p, pts[(i + 1) % pts.length]); }); };
  var olT30 = Math.tan(Math.PI / 6);
  var olProf = {
    trapezoid: [{ entities: olPoly([[0, 0], [6, 0], [6 - 1.5 * olT30, 1.5], [1.5 * olT30, 1.5]]) }, 1.5 * (12 - 3 * olT30) / 2, 6],
    gusset: [{ entities: olPoly([[0, 0], [5, 0], [3.5, 1.5], [0, 1.5]]) }, 1.5 * 8.5 / 2, 5],
    stepped: [{ entities: olPoly([[0, 0], [6, 0], [6, 0.75], [3, 0.75], [3, 1.5], [0, 1.5]]) }, 6.75, 6],
    rounded: [{ entities: [olL([0, 0], [6, 0]), olL([6, 0], [6, 1]), { t: 'arc', cx: 5.5, cy: 1, r: 0.5, a0: 0, a1: 90 }, olL([5.5, 1.5], [0, 1.5]), olL([0, 1.5], [0, 0])] }, 9 - 0.25 + Math.PI * 0.0625, 6],
    notch: [{ entities: olPoly([[0, 0], [6, 0], [6, 1.5], [4, 1.5], [4, 1], [2, 1], [2, 1.5], [0, 1.5]]) }, 8, 6],
    hole: [{ entities: olPoly([[0, 0], [6, 0], [6, 1.5], [0, 1.5]]).concat([{ t: 'circle', cx: 3, cy: 0.75, r: 0.25 }]) }, 9 - Math.PI * 0.0625, 6]
  };
  var olCases = [
    ['trapezoid', 0.0598, 0.06, 'inside', 90], ['trapezoid', 0.1196, 0.12, 'outside', 60], ['trapezoid', 0.0598, 0.06, 'bendOutside', 120],
    ['gusset', 0.0598, 0.06, 'inside', 120], ['gusset', 0.1196, 0.12, 'bendOutside', 90], ['gusset', 0.0598, 0.06, 'outside', 60],
    ['stepped', 0.0598, 0.06, 'inside', 90], ['rounded', 0.1196, 0.12, 'inside', 90], ['rounded', 0.0598, 0.06, 'bendOutside', 60],
    ['notch', 0.0598, 0.06, 'outside', 90], ['hole', 0.1196, 0.12, 'inside', 120]
  ];
  for (var olC of olCases) {
    var olName = 'rfOL: Edge Flange profile on OpenCascade, ' + olC[0] + ' (T ' + olC[1] + ', ' + olC[3] + ', ' + olC[4] + ' degrees): the same part as Anvil\'s and the closed form to 1e-9';
    try {
      var tOl = performance.now(), whyOl = [], pf = olProf[olC[0]], T = olC[1], R = olC[2], A = olC[4] * Math.PI / 180;
      var olCode = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
        'p.flange(1, [[3, ' + T + ', 0]], { angle: ' + olC[4] + ', position: "' + olC[3] + '", relief: "rect", startPoint: [0, ' + T + ', 0], profile: ' + JSON.stringify(pf[0]) + ' });\n';
      var aOl = anvilBuild(olCode), mOl = K.newModel('T');
      if (aOl.errors.length) throw new Error('Anvil: ' + aOl.errors.join());
      K.runScript(mOl, olCode);
      var oOl = await occt(mOl);
      if (oOl.unsupported || !oOl.valid) whyOl.push('OpenCascade: ' + (oOl.unsupported || 'invalid solid'));
      Object.keys(oOl.status || {}).forEach(function (id) { if (oOl.status[id] !== 'ok') whyOl.push('OpenCascade feature ' + id + ': ' + oOl.status[id]); });
      var dOl = Math.abs(oOl.volume - aOl.volume) / aOl.volume;
      if (!(dOl < 1e-9)) whyOl.push('OpenCascade ' + oOl.volume + ', Anvil ' + aOl.volume + ' (d ' + dOl.toExponential(1) + ')');
      // the closed form (reliefs from Anvil's record: w past the base's end, d0 inside the trimmed edge line, through the sheet's edge)
      var bOl = K.rebuild(mOl), recOl = bOl.flanges[mOl.features[mOl.features.length - 1].id][0];
      var shOl = olC[3] === 'inside' ? ((R + T) - R * Math.cos(A)) / Math.sin(A) : olC[3] === 'outside' ? R * Math.tan(A / 2) : 0;
      var relOl = (recOl.reliefs || []).filter(Boolean).reduce(function (s, x) { return s + x.w * (shOl + x.d0); }, 0);
      var VOl = T * (24 - pf[2] * shOl - relOl) + pf[2] * A * ((R + T) * (R + T) - R * R) / 2 + T * pf[1];
      if (!(Math.abs(oOl.volume - VOl) < 1e-9 * VOl)) whyOl.push('OpenCascade ' + oOl.volume + ', closed form ' + VOl);
      row(whyOl.length ? 'bad' : 'ok', olName, whyOl.join('\n') || 'd ' + dOl.toExponential(1) + ', volume ' + oOl.volume.toFixed(6), performance.now() - tOl);
      counts[whyOl.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', olName, e.message); counts.fail++; }
  }
  // (2) Tab and Slot on OpenCascade (tabSlotOp): rfPT's cases (equal spacing with clearance, from a flange into a lid with
  // filleted slots, spacing by pitch with chamfered 0.2 tabs, one tab from a start offset) and the one-body box (a lid
  // flange's free end against the back wall across 0.01, tabs through slots in that wall): the same part as Anvil's to 1e-9
  var olSheet = 'p.units("in");\np.sheet(0.1, 0.1, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
  var olPlate = 'p.sketch("Front", 2).rect(1, 0.1, 4, 2).end().extrude(0.1, { merge: false });\n';
  var olBoxH = 4 - 2 * 0.06 - 0.06 - 0.01;
  var olBox = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
    'p.flange(2, [[3, 0.06, 0]], { position: "inside", lengthRef: "outer" });\np.flange(2.5, [[3, 0.06, 4]], { position: "inside", lengthRef: "outer" });\n' +
    'p.flange(1, [[3, 2, 0.06]], { position: "inside", relief: "rect", startPoint: [0, 2, 0.06], profile: ' + JSON.stringify({ entities: olPoly([[1, 0], [5, 0], [5, olBoxH], [1, olBoxH]]) }) + ' });\n';
  var olTs = [
    ['equal spacing, 3 tabs through slots with clearance', olSheet + olPlate + 'p.tabSlot([[3, 0.1, 2]], { count: 3, tabLength: 0.5, slotLengthOffset: 0.01, slotWidthOffset: 0.005 });\n'],
    ['from a flange into a lid, filleted slots', olSheet + 'p.flange(2, [[3, 0.1, 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", 2).rect(-0.5, -4.5, 7, 5).end().extrude(0.25, { merge: false });\n' +
      'p.tabSlot([[3, 2, 0]], { count: 2, tabLength: 1, slotLengthOffset: 0.01, slotWidthOffset: 0.01, slotCorner: "fillet", slotCornerSize: 0.05 });\n'],
    ['by pitch, chamfered tabs 0.2 tall', olSheet + olPlate + 'p.tabSlot([[3, 0.1, 2]], { spacing: "distance", pitch: 1.5, tabLength: 0.5, tabHeight: 0.2, tabEdge: "chamfer", tabEdgeSize: 0.02 });\n'],
    ['one tab from a start offset, filleted tab and chamfered slot', olSheet + olPlate + 'p.tabSlot([[3, 0.1, 2]], { count: 1, tabLength: 0.5, startOffset: 1, startPoint: [1, 0.1, 2], tabEdge: "fillet", tabEdgeSize: 0.05, slotLengthOffset: 0.02, slotWidthOffset: 0.02, slotCorner: "chamfer", slotCornerSize: 0.01 });\n'],
    ['in one body (a lid flange against the back wall across 0.01)', olBox + 'p.tabSlot([[3, 2, ' + (4 - 0.07) + ']], { count: 2, tabLength: 1, slotLengthOffset: 0.01, slotWidthOffset: 0.01 });\n']
  ];
  for (var olT of olTs) {
    var olTn = 'rfOL: Tab and Slot on OpenCascade, ' + olT[0] + ': the same bodies as Anvil\'s to 1e-9';
    try {
      var tT = performance.now(), whyT = [], aT = anvilBuild(olT[1]), mT = K.newModel('T');
      if (aT.errors.length) throw new Error('Anvil: ' + aT.errors.join());
      K.runScript(mT, olT[1]);
      var oT = await occt(mT);
      if (oT.unsupported || !oT.valid) whyT.push('OpenCascade: ' + (oT.unsupported || 'invalid solid'));
      Object.keys(oT.status || {}).forEach(function (id) { if (oT.status[id] !== 'ok') whyT.push('OpenCascade feature ' + id + ': ' + oT.status[id]); });
      if (oT.bodies !== aT.bodies) whyT.push(oT.bodies + ' bodies, Anvil ' + aT.bodies);
      var dT = Math.abs(oT.volume - aT.volume) / aT.volume;
      if (!(dT < 1e-9)) whyT.push('OpenCascade ' + oT.volume + ', Anvil ' + aT.volume + ' (d ' + dT.toExponential(1) + ')');
      row(whyT.length ? 'bad' : 'ok', olTn, whyT.join('\n') || 'd ' + dT.toExponential(1) + ', ' + aT.bodies + ' bod' + (aT.bodies > 1 ? 'ies' : 'y') + ', volume ' + oT.volume.toFixed(6), performance.now() - tT);
      counts[whyT.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', olTn, e.message); counts.fail++; }
  }
