  // --- sketch-spline: the spline and ellipse sides are single swept faces of the true curves (no facets) ---
  try {
    var tsp = performance.now(), msp = anvilBuild('p.sketch("Front").rect(-30, -20, 60, 40).ellipse(0, 0, 10, 5, 20).spline([[12, 0], [18, 6], [24, 0], [18, -6]], true).partialEllipse(-18, 0, 6, 3, 0, 90, 270).line(-18, 3, -18, -3).extrude(4);').model;
    var rsp = await occt(msp), kinds = {};
    rsp.faces.forEach(function (f) { kinds[f.type] = (kinds[f.type] || 0) + 1; });
    var curved = rsp.faces.length - (kinds.plane || 0), whySp = [];
    if (!rsp.valid) whySp.push('invalid solid');
    if (curved !== 3) whySp.push('curved faces ' + curved + ' (want 3: the ellipse, the spline and the partial ellipse, one face each): ' + JSON.stringify(kinds));
    if (rsp.faces.length !== 10) whySp.push(rsp.faces.length + ' faces (want 10: 2 caps, 4 sides, the line, 3 curves)');
    row(whySp.length ? 'bad' : 'ok', 'ellipse, closed spline and partial ellipse holes are one exact face each in OpenCascade', whySp.join('; ') || JSON.stringify(kinds) + ', volume ' + rsp.volume.toFixed(4), performance.now() - tsp);
    counts[whySp.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'ellipse / spline holes in OpenCascade', e.message); counts.fail++; }
  // --- end sketch-spline ---
