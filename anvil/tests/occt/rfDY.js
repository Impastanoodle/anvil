  // --- rfDY (lane DY): Rib and Intersect built by OpenCascade (occt-kernel.js ribTool / intersectOp from Kernel.ribLayout
  // and the same region order): every feature 'ok', valid, and the volume equal to Anvil's and the exact one (1e-6) ---
  var rfDYL = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 0.25).end().extrude(4, { midplane: true });\np.sketch("Front").rect(0, 0, 0.25, 4).end().extrude(4, { midplane: true });\n';
  var rfDYBox = 'p.units("in");\np.sketch("Top").rect(0, -4, 4, 4).end().extrude(2);\np.sketch("Top", 0.25).rect(0.25, -3.75, 3.5, 3.5).end().cut(2);\n';
  var rfDYTwo = 'p.sketch("Front").rect(0, 0, 10, 10).end().extrude(10, { merge: false });\np.sketch("Front").rect(5, 5, 10, 10).end().extrude(10, { merge: false });\n';
  var DY_CASES = [
    { name: 'Rib: L bracket gusset .25 both sides', code: rfDYL + 'p.sketch("Front").line(0.25, 3, 3, 0.25).end();\np.rib(0.25);', want: 7.75 + 2.75 * 2.75 / 2 * 0.25 },
    { name: 'Rib: short line extended to both plates, first side', code: rfDYL + 'p.sketch("Front").line(1, 2.25, 2.25, 1).end();\np.rib(0.25, { side: "one" });', want: 7.75 + 2.75 * 2.75 / 2 * 0.25 },
    { name: 'Rib: Normal to Sketch, an L chain in an open box', code: rfDYBox + 'p.sketch("Top", 2).line(2, -1, 2, -2).line(2, -2, 3, -2).end();\np.rib(0.25, { direction: "normal" });', want: 32 - 3.5 * 3.5 * 1.75 + 0.875 * 1.75 },
    { name: 'Intersect: keep the common region of two blocks', code: rfDYTwo + 'p.intersect({ regions: [false, false, true] });', want: 250, bodies: 1 },
    { name: 'Intersect: keep the two outer regions, Merge result off', code: rfDYTwo + 'p.intersect({ exclude: [2], merge: false });', want: 1500, bodies: 2 },
    { name: 'Intersect: split by a plane, six bodies', code: rfDYTwo + 'var pl = p.plane("Right", 7);\np.intersect({ planes: [pl], merge: false });', want: 1750, bodies: 6 },
    { name: 'Intersect: Create internal regions fills the void of a capped tube', code: 'p.sketch("Front").rect(0, 0, 10, 10).end().extrude(10, { merge: false });\np.sketch("Front").rect(2, 2, 6, 6).end().cut(10);\np.sketch("Front", 10).rect(-1, -1, 12, 12).end().extrude(2, { merge: false });\np.sketch("Front").rect(-1, -1, 12, 12).end().extrude(2, { merge: false, reverse: true });\np.intersect({ mode: "internal" });', want: 1576, bodies: 1 }
  ];
  for (var dyc of DY_CASES) {
    try {
      var tdy = performance.now(), mdy = K.newModel('T'); K.runScript(mdy, dyc.code);
      var ady = K.rebuild(JSON.parse(JSON.stringify(mdy))), avdy = K.massProps(K.meshFromBody(ady.body), 1).volume;
      var rdy = await occt(JSON.parse(JSON.stringify(mdy)), { noCache: true }), whyDY = [];
      if (Object.keys(ady.errors).length) whyDY.push('Anvil errors ' + JSON.stringify(ady.errors));
      if (rdy.unsupported || !rdy.ok) whyDY.push('OpenCascade did not build every feature: ' + (rdy.unsupported || JSON.stringify(rdy.status)));
      if (!rdy.valid) whyDY.push('invalid solid');
      if (dyc.bodies && (rdy.bodies !== dyc.bodies || ady.bodies.length !== dyc.bodies)) whyDY.push('bodies OpenCascade ' + rdy.bodies + ' / Anvil ' + ady.bodies.length + ', want ' + dyc.bodies);
      if (!(Math.abs(rdy.volume - dyc.want) <= 1e-6 * dyc.want)) whyDY.push('OpenCascade volume ' + rdy.volume + ', exact ' + dyc.want);
      if (!(Math.abs(avdy - dyc.want) <= 1e-6 * dyc.want)) whyDY.push('Anvil volume ' + avdy + ', exact ' + dyc.want);
      row(whyDY.length ? 'bad' : 'ok', 'rfDY, OpenCascade = Anvil: ' + dyc.name, whyDY.join('\n') || ('OpenCascade ' + rdy.volume.toFixed(6) + ' / Anvil ' + avdy.toFixed(6) + ' / exact ' + dyc.want.toFixed(6)), performance.now() - tdy);
      counts[whyDY.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'rfDY, OpenCascade = Anvil: ' + dyc.name, e.message); counts.fail++; }
  }
  // --- end rfDY ---
