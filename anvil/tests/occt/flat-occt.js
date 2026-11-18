  // --- flat-occt: the flat pattern unfolded from OpenCascade's mesh (the default kernel). An inch bracket with Ø.281
  // holes at .5 puts hole points on 1e-4 rounding midpoints (x = .57025): the face outline used to lose a triangle
  // edge's twin there and chain two holes into one loop with a slit across the blank (and a sliver loop), so the
  // flat DXF had a cut line through the part ---
  try {
    var tf = performance.now(), fmod = K.newModel('T');
    K.runScript(fmod, ['p.name("Inch-Bracket").units("in");', 'p.sheet(0.06, 0.06, 0.44);', 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();',
      'p.sketch("Top", 0.06).slot(2.25, -2, 3.75, -2, 0.5).cut("through", { reverse: true });',
      'p.sketch("Top", 0.06).circle(0.5, -0.5, 0.1405).circle(5.5, -0.5, 0.1405).circle(0.5, -3.5, 0.1405).circle(5.5, -3.5, 0.1405).cut("through", { reverse: true });',
      'p.flange(1.5, [[0, 0.06, 2]]);', 'p.flange(1.5, [[6, 0.06, 2]]);'].join('\n'));
    var fb = K.rebuild(fmod), fmesh = K.meshFromBody(fb.body);
    var fr2 = await occt(fmod, { noCache: true });
    var fob = OcctKernel.toBuild(fr2, fb, fmesh, null, CSG, K), fom = K.meshFromBody(fob.body);
    var flat = K.flatPattern(fmod, fob, fom), whyF = [];
    if (flat.loops.length !== 6) whyF.push(flat.loops.length + ' loops (outline + 4 holes + slot = 6)');
    flat.loops.slice(1).forEach(function (l) {
      var xs = l.map(function (p) { return p[0]; }), ys = l.map(function (p) { return p[1]; });
      var w = Math.max.apply(null, xs) - Math.min.apply(null, xs), h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      if (Math.max(w, h) > 2.0001 || Math.min(w, h) < 0.25) whyF.push('inner loop ' + w.toFixed(4) + ' x ' + h.toFixed(4) + ' is neither a Ø.281 hole nor the 2 x .5 slot');
    });
    var dxfF = K.exportDXFFlat(flat, 'in', { version: 'R2000', style: 'entities', bendLines: false, notes: false });
    var nCirc = (dxfF.match(/\n\s*CIRCLE\s*\n/g) || []).length;
    if (nCirc !== 4) whyF.push(nCirc + ' CIRCLEs in the flat DXF (4 holes)');
    row(whyF.length ? 'bad' : 'ok', 'flat pattern from OpenCascade\'s mesh: an inch bracket with Ø.281 holes unfolds to the outline, 4 holes and the slot (no slit joining holes); its DXF has 4 true circles', whyF.join('; ') || (flat.loops.map(function (l) { return l.length; }).join(', ') + ' points per loop, ' + flat.size.map(function (v) { return v.toFixed(4); }).join(' x ') + ' in'), performance.now() - tf);
    counts[whyF.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'flat pattern from OpenCascade\'s mesh', e.message); counts.fail++; }
  // --- end flat-occt ---
