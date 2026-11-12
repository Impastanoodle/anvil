  // --- rfLS (2026-11-11, lane stepreal2) --- A STEP file as another CAD system writes a domed pin (the sphere face
  // bounded by its circle alone: no seam edge), opened as a user does: File ▸ Open…, the file picked, Open. The part
  // comes in closed, its dome exact (Mass Properties = the source part's to 2e-6) and smooth to the pole (no flat
  // notch along the cut meridian). Kernel side: tests/kernel/rfLS.js.
  function rfLSMenu(name, label) {
    var lis = D.querySelectorAll('#menus > li'), m = null;
    for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
    assert(m, 'menu ' + name);
    m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
    var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
    assert(hit, label + ' in ' + name + ': ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' '); }).join(' | ').slice(0, 600));
    hit.click();
  }

  step('rfLS: File ▸ Open… a domed pin\'s STEP (sphere face bounded by its circle alone): one closed solid, the dome exact and smooth to its pole', async function () {
    var errs0 = errors.length;
    var c30 = Math.cos(Math.PI / 6), m0 = K.newModel('Pin');
    K.runScript(m0, 'p.units("in");\np.sketch("Front").arc(0, 0, 1, 30, 90).line(0, 1, 0, -1).line(0, -1, ' + c30 + ', -1).line(' + c30 + ', -1, ' + c30 + ', 0.5).end().revolve(360);\n');
    var b0 = K.rebuild(m0), own = K.massProps(K.meshFromBody(b0.body), 1), text = W.Exchange.exportSTEP(m0, b0);
    var lone = text.replace(/EDGE_LOOP\('',\((#\d+),#\d+,#\d+\)\)/, 'EDGE_LOOP(\'\',($1))');
    assert(/SPHERICAL_SURFACE/.test(lone) && lone !== text, 'the file: a sphere face with its seam edges taken out');
    await anvil.newPart(); await idle();
    rfLSMenu('File', 'Open…'); await wait(30);
    assert(modalOpen(), 'the Open dialog');
    var inp = D.querySelector('#modal .open-input');
    assert(inp, 'its file input');
    var dt = new W.DataTransfer();
    dt.items.add(new W.File([lone], 'domed-pin.step', { type: 'application/step' }));
    inp.files = dt.files; inp.dispatchEvent(new W.Event('change')); await wait(50);
    clickModalButton('Open');
    for (var i = 0; i < 100 && !(UI.App.model.features || []).some(function (f) { return f.type === 'import'; }); i++) await wait(50);
    await idle(); await wait(30);
    var feats = UI.App.model.features.map(function (f) { return f.type; });
    assert(feats.join() === 'import', 'opened as one Imported feature: ' + feats.join(','));
    assert(UI.App.model.units === 'in', 'the file\'s inches kept: ' + UI.App.model.units);
    var body = UI.App.build.body, bodies = UI.App.build.bodies || [body];
    assert(bodies.length === 1, 'one solid: ' + bodies.length);
    if (W.Evaluate) assert(W.Evaluate.checkBody(body, { maxPairs: 1 }).ok, 'a closed solid');
    var mp = anvil.mass();
    assert(Math.abs(mp.volume - own.volume) <= 2e-6 * own.volume, 'volume ' + mp.volume + ' of ' + own.volume);
    var deep = 0, nS = 0;
    body.polygons.forEach(function (pg) {
      if (!pg.surf || pg.surf.s.t !== 'sph') return;
      nS++;
      var S = pg.surf.s, cx = 0, cy = 0, cz = 0, nv = pg.vertices.length;
      pg.vertices.forEach(function (v) { cx += v.pos.x / nv; cy += v.pos.y / nv; cz += v.pos.z / nv; });
      deep = Math.max(deep, S.r - Math.hypot(cx - S.o[0], cy - S.o[1], cz - S.o[2]));
    });
    assert(nS > 50 && deep < 0.02, 'the dome\'s deepest facet ' + deep.toFixed(4) + ' under the sphere (' + nS + ' facets)');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'volume ' + mp.volume.toFixed(6) + ' in³, ' + nS + ' dome facets, deepest ' + deep.toFixed(4);
  });
  // --- end rfLS ---
