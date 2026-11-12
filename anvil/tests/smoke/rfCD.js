  // --- rfCD (2026-10-14, lane CD): icons for the Mastercam-style View ribbon tab (lane CC builds the tab). Every name the
  // tab asks for exists, renders an <svg> with at least one <path>, and keeps the grey-black palette: no blue (hue
  // 190–250°, saturation ≥ 0.15) in any colour of the markup; text (axis letters) is left out of the colour check. ---
  step('rfCD: every View-tab icon exists, renders an <svg> with a path, and has no blue in it', async function () {
    var Icons = W.Icons;
    var added = ['vZoomFit', 'vFront', 'vBack', 'vLeft', 'vRight', 'vTop', 'vBottom', 'vIso', 'vNormalTo',
      'dsShadedEdges', 'dsShaded', 'dsHLR', 'dsHLV', 'dsWireframe', 'vBackground', 'vTheme', 'vPlanes', 'vOrigins',
      'vSketches', 'vGrid', 'vRegions', 'vSketchDims', 'vSnapModel', 'vFeatureTree'];
    // existing icons the tab reuses (Edit Appearance is drawn with circles only: any drawn shape will do there)
    var reused = ['zoomArea', 'prevView', 'appearance', 'scene', 'showArcCenters', 'showEndpoints', 'section', 'levels', 'filter'];
    var names = added.concat(reused);
    function rgb(c) {
      var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
      if (m) {
        var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
      return m ? [+m[1], +m[2], +m[3]] : null;
    }
    function isBlue(c) {
      var v = rgb(c);
      if (!v) return false;
      var r = v[0] / 255, g = v[1] / 255, b = v[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d === 0) return false;
      var l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1));
      var h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      return h >= 190 && h <= 250 && s >= 0.15;
    }
    var bad = [];
    names.forEach(function (n) {
      if (!Icons.has(n)) { bad.push(n + ': no icon (falls back to generic)'); return; }
      [20, 32].forEach(function (size) {
        var s = Icons(n, size);
        var box = D.createElement('div'); box.innerHTML = s;
        var svg = box.querySelector('svg');
        if (!svg) { bad.push(n + '@' + size + ': no <svg>'); return; }
        if (!svg.querySelector(added.indexOf(n) >= 0 ? 'path' : 'path, circle, rect, ellipse, line, polyline, polygon')) bad.push(n + '@' + size + ': nothing drawn (no <path>)');
        if (svg.getAttribute('viewBox') !== '0 0 16 16') bad.push(n + '@' + size + ': viewBox ' + svg.getAttribute('viewBox'));
      });
      // rfMD (2026-11-12): the no-blue rule is the built-in drawings' (the SolidWorks set of the default profile is blue
      // on purpose, by the user's request), so the colours are read with no set in use; the checks above run on what is shown
      var setOn = Icons.sets ? Icons.sets.active() : null, builtIn;
      if (setOn) Icons.sets.use(null);
      try { builtIn = Icons(n, 32); } finally { if (setOn) Icons.sets.use(setOn); }
      var markup = builtIn.replace(/<text[\s\S]*?<\/text>/g, '');
      var cols = markup.match(/#[0-9a-f]{6}(?![0-9a-z_-])|#[0-9a-f]{3}(?![0-9a-z_-])|rgba?\([^)]*\)/gi) || [];
      cols.forEach(function (c) { if (isBlue(c)) bad.push(n + ': blue colour ' + c); });
    });
    assert(isBlue('#2f7bd8') && !isBlue('#6d6d6d') && !isBlue('#f5c400'), 'the blue check itself works');
    assert(bad.length === 0, bad.length + ' problem(s):\n' + bad.join('\n'));
    // the standard views are seven different pictures, and so are the five display styles
    var seen = {}, dup = [];
    ['vFront', 'vBack', 'vLeft', 'vRight', 'vTop', 'vBottom', 'vIso', 'dsShadedEdges', 'dsShaded', 'dsHLR', 'dsHLV', 'dsWireframe'].forEach(function (n) {
      var s = Icons(n, 32);
      if (seen[s]) dup.push(n + ' = ' + seen[s]); else seen[s] = n;
    });
    assert(dup.length === 0, 'icons that look the same: ' + dup.join(', '));
    return names.length + ' View-tab icons at 20 and 32 px, none blue';
  });
  // --- end rfCD ---
