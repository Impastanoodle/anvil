  // ---- rfBU (lane BU, 2026-10-13): the last blue. The user: "get rid of the blue hue everywhere, replace with
  // grey-black". New parts are a neutral grey (a part saved with the old bluish default shows in it too), Under Defined
  // in the status bar is grey, a selection on a drawing sheet is a dark amber, and the Selection Filter icons, the
  // sketch tool cursors and the rest of style.css / drawing.css hold no blue. Kept on purpose: the X / Y / Z axis
  // colours, user-picked appearance colours and the red / green / amber status colours.
  // A colour counts as blue as in rfBQ: hue 190-250 degrees and chroma (max - min channel) at least 4 %.
  function rfBUcolours(s) {
    var out = [], re = /#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/gi, m;
    s = String(s || '').replace(/%23/g, '#');
    while ((m = re.exec(s))) {
      if (m[1]) { var x = m[1]; if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2]; out.push({ r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: 1, s: m[0] }); }
      else out.push({ r: +m[2], g: +m[3], b: +m[4], a: m[5] == null ? 1 : +m[5], s: m[0] });
    }
    return out;
  }
  function rfBUhue(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, chroma: d };
  }
  function rfBUblue(c) { var k = rfBUhue(c); return c.a > 0 && k.chroma >= 0.04 && k.h >= 190 && k.h <= 250; }
  function rfBUblues(label, s) { return rfBUcolours(s).filter(rfBUblue).map(function (c) { return label + ': ' + c.s; }); }

  step('rfBU: a new part is the neutral grey #8c8c8c (neutral specular), a part saved with the old bluish default #a8adb6 shows in it too, a picked colour still shows', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front", 0, "S1").rect(0, 0, 40, 20).extrude(5);'); await idle();
    var mp = UI.mats.part, sp = mp.specular;
    assert(UI.App.model.color === '#8c8c8c' && W.Materials.DEFAULT_COLOR === '#8c8c8c', 'new part colour ' + UI.App.model.color);
    assert(mp.color.getHexString() === '8c8c8c', 'part material ' + mp.color.getHexString());
    assert(Math.abs(sp.r - sp.g) < 1e-6 && Math.abs(sp.g - sp.b) < 1e-6, 'specular neutral: ' + sp.getHexString());
    assert(anvil.script().indexOf('p.color(') < 0, 'the default colour writes no p.color line');
    // a part saved before rfBU carries '#a8adb6': it keeps the stored value but shows (and scripts) as the default
    var json = JSON.parse(JSON.stringify(UI.App.model)); json.color = '#A8ADB6';
    await anvil.load(json); await idle();
    assert(UI.App.model.color === '#A8ADB6' && UI.mats.part.color.getHexString() === '8c8c8c', 'old default shows grey: ' + UI.mats.part.color.getHexString());
    assert(W.Materials.displayColor('#a8adb6') === '#8c8c8c' && W.Materials.displayColor(null) === '#8c8c8c' && W.Materials.displayColor('#2f6db5') === '#2f6db5', 'displayColor');
    assert(anvil.script().indexOf('p.color(') < 0, 'the old default writes no p.color line either');
    UI.App.model.color = '#2f6db5'; UI.applyDisplayStyle();
    assert(UI.mats.part.color.getHexString() === '2f6db5', 'a picked colour shows: ' + UI.mats.part.color.getHexString());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'part ' + mp.color.getHexString();
  });

  // swtheme (2026-11-12): the user lifted the no-blue rule for the chrome; Under Defined in the status bar is the
  // information colour (--c-info, SolidWorks' blue) and the chrome's colours live in tokens: a literal blue may stand
  // only in a custom-property declaration (the token blocks), never in a rule's own properties.
  step('rfBU: Under Defined in the status bar is the information colour (--c-info, a blue) in the light and the dark theme; Fully Defined stays the text colour', async function () {
    var theme0 = D.documentElement.getAttribute('data-theme') || 'light', seen = [];
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    try {
      for (var ti = 0; ti < 2; ti++) {
        var th = ['light', 'dark'][ti];
        UI.setTheme(th); UI.refreshStatus(); await wait(250);   // the chip fades its colour in 120 ms
        var st = D.querySelector('#status-right .sk-state'), col = st && W.getComputedStyle(st).color, c = rfBUcolours(col)[0];
        assert(st && st.classList.contains('under') && c, th + ': Under Defined shown');
        var ip = D.createElement('span'); ip.style.color = 'var(--c-info)'; D.body.appendChild(ip); var info = W.getComputedStyle(ip).color; ip.remove();
        assert(col === info && rfBUblue(c), th + ': Under Defined is --c-info ' + info + ', got ' + col);
        seen.push(th + ' ' + col);
      }
    } finally { UI.setTheme(theme0); UI.exitSketch(); await idle(); }
    return seen.join(', ');
  });

  step('rfBU: a selection on a drawing sheet is a dark amber that reads on white paper (the 3D selection yellow), not blue', async function () {
    var v = W.getComputedStyle(D.documentElement).getPropertyValue('--dw-hot').trim(), c = rfBUcolours(v)[0];
    assert(c, '--dw-hot ' + v);
    // relative luminance (WCAG): the contrast with the white paper is at least 2.4 : 1 (the 3D yellow #ffd400 has 1.4)
    function lin(u) { u /= 255; return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
    var k = rfBUhue(c), lum = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b), contrast = 1.05 / (lum + 0.05);
    assert(!rfBUblue(c) && k.h >= 30 && k.h <= 55 && k.chroma > 0.5 && contrast >= 2.4, 'amber ' + v + ' hue ' + k.h.toFixed(0) + ' contrast on white ' + contrast.toFixed(2));
    // a selected view frame takes it (a stand-in overlay when no drawing is open)
    var NS = 'http://www.w3.org/2000/svg', own = !D.getElementById('dw-overlay'), host = null, g = D.getElementById('dw-overlay');
    if (own) { host = D.createElementNS(NS, 'svg'); g = host.appendChild(D.createElementNS(NS, 'g')); g.setAttribute('id', 'dw-overlay'); D.body.appendChild(host); }
    var r = g.appendChild(D.createElementNS(NS, 'rect')); r.setAttribute('class', 'dw-vbox sel');
    var stroke = W.getComputedStyle(r).stroke;
    r.remove(); if (host) host.remove();
    var s = rfBUcolours(stroke)[0];
    assert(s && s.r === c.r && s.g === c.g && s.b === c.b, 'selected frame in --dw-hot: ' + stroke);
    return v;
  });

  step('rfBU: no blue in the Selection Filter toolbar icons or the sketch tool cursors, and none in a rule of style.css / drawing.css outside the token declarations (both themes)', async function () {
    var bar = $('sel-filter');
    assert(bar && bar.querySelectorAll('svg').length >= 6, 'filter toolbar icons');
    var bad = rfBUblues('#sel-filter', bar.innerHTML), rules = 0, cursors = 0;
    Array.prototype.forEach.call(D.styleSheets, function (sh) {
      var name = String(sh.href || '').replace(/[?#].*$/, '').split('/').pop();
      if (name !== 'style.css' && name !== 'drawing.css') return;
      (function walk(list) {
        Array.prototype.forEach.call(list || [], function (ru) {
          if (ru.style) {
            rules++;
            if (ru.style.cursor && /url\(/.test(ru.style.cursor)) cursors++;
            for (var pi = 0; pi < ru.style.length; pi++) {
              var pn = ru.style[pi];
              if (pn.indexOf('--') === 0) continue;   // a token: rfBQ / rfLZ check what the tokens hold
              bad = bad.concat(rfBUblues(name + ' ' + (ru.selectorText || '@').slice(0, 60) + ' ' + pn, ru.style.getPropertyValue(pn)));
            }
          }
          if (ru.cssRules && ru.cssRules.length) walk(ru.cssRules);   // @media blocks (and nested rules)
        });
      })(sh.cssRules);
    });
    assert(rules > 500 && cursors >= 20, 'rules read: ' + rules + ', cursors ' + cursors);
    assert(bad.length === 0, 'blue left: ' + bad.slice(0, 8).join(', ') + (bad.length > 8 ? ' (+' + (bad.length - 8) + ')' : ''));
    return rules + ' rules, ' + cursors + ' cursors';
  });
