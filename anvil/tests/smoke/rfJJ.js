  // --- rfJJ (2026-11-06, lane dxfout-2) --- the Jog PM's Jog Offset end conditions (Up To Vertex: a block's corner
  // clicked; Up To Surface: its top face clicked; Offset From Surface) and the Sheet Metal ▸ Lofted-Bend command
  // (ribbon, Bent / Formed, faceting, Edit Feature). Self-contained.
  (function () {
    var T = 0.0598, R = 0.0598;
    // the 4 × 3 plate and a separate block 0.8 tall beside it (its top corner and face are the jog's targets)
    var PART = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      'p.sketch("Top").rect(5, -1, 6, 1).end().extrude(0.8);\np.sketch("Top", ' + T + ').line(2, 0, 2, -3).end();\n';
    function rfJJEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJJClick(p) { rfJJEv('mousemove', p); rfJJEv('mousedown', p, $('viewport')); rfJJEv('mouseup', p); }
    function rfJJRibbon(pred) { UI.setRibbonTab('Sheet Metal'); return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), pred)[0]; }
    function rfJJSelect(label, value) { var s = pmField(label); assert(s && s.tagName === 'SELECT', 'select ' + label); s.value = value; s.dispatchEvent(new W.Event('change', { bubbles: true })); }
    function rfJJTop(x0) { var hi = -Infinity; UI.App.build.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { if (v.pos.x > x0 && v.pos.x < 4.01) hi = Math.max(hi, v.pos.y); }); }); return hi; }

    step('rfJJ: Jog PM ▸ End condition Blind / Up To Vertex / Up To Surface / Offset From Surface (SolidWorks order); Up To Vertex takes the block\'s corner clicked, the flange top lands at .8; Up To Surface takes its top face clicked; Offset From Surface .1 Reverse offset → .7; Edit Feature keeps it', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(PART); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var jb = rfJJRibbon(function (b) { return b.dataset.icon === 'jog' || /^Jog$/.test((b.getAttribute('aria-label') || '').trim()); });
      assert(jb, 'Jog button');
      jb.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Jog', 'Jog PM');
      var ends = Array.prototype.map.call(pmField('End condition').options, function (o) { return o.textContent; }).join('|');
      assert(ends === 'Blind|Up To Vertex|Up To Surface|Offset From Surface', 'end conditions: ' + ends);
      // the fixed face first (box active by default in Blind)
      var s = UI.worldToScreen([0.5, T, 1.5]);
      rfJJClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.fixed, 'fixed face taken');
      rfJJSelect('End condition', 'upToVertex'); await wait(20);
      assert(UI.pmSpec().values.tgActive && D.querySelector('#pm .pm-pick.active'), 'the vertex box is active');
      assert(!pmField('Smallest offset') && !/Offset distance/.test($('pm').textContent), 'no distance with Up To Vertex');
      var vs = UI.worldToScreen([5, 0.8, 1]);
      rfJJClick(vs); await idle(); await wait(20);
      var tg = UI.pmSpec().values.offsetTarget;
      assert(Array.isArray(tg) && Math.abs(tg[1] - 0.8) < 1e-6, 'vertex taken: ' + JSON.stringify(tg));
      assert(/Vertex<1>/.test($('pm').textContent), 'the box shows Vertex<1>');
      await pmAccept();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'jog' && f.offsetEnd === 'upToVertex' && !UI.App.build.errors[f.id], 'feature ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      near(rfJJTop(3), 0.8, 1e-9, 'Outside Offset: flange top at the vertex');
      // Edit Feature: Up To Surface (the block's top face clicked), then Offset From Surface .1 reversed
      UI.editFeature(f); await idle(); await wait(30);
      assert(UI.pmSpec().values.offsetEnd === 'upToVertex' && /Vertex<1>/.test($('pm').textContent), 'Edit Feature reopens on Up To Vertex');
      rfJJSelect('End condition', 'upToSurface'); await wait(20);
      assert(UI.pmSpec().values.offsetTarget == null && UI.pmSpec().values.tgActive, 'a vertex is no surface: the box is empty and active');
      rfJJClick(UI.worldToScreen([5.5, 0.8, 0])); await idle(); await wait(20);
      assert(/Face<1>/.test($('pm').textContent), 'the face taken');
      await pmAccept();
      near(rfJJTop(3), 0.8, 1e-9, 'Up To Surface: flange top on the face');
      UI.editFeature(UI.App.model.features[UI.App.model.features.length - 1]); await idle(); await wait(30);
      rfJJSelect('End condition', 'offsetFromSurface'); await wait(20);
      assert(UI.pmSpec().values.offsetTarget != null, 'the surface stays for Offset From Surface');
      var od = pmField('Offset distance'); od.value = '0.1'; od.dispatchEvent(new W.Event('input', { bubbles: true })); od.dispatchEvent(new W.Event('change', { bubbles: true }));
      pmField('Reverse offset').click(); await wait(20);
      await pmAccept();
      near(rfJJTop(3), 0.7, 1e-9, 'Offset From Surface .1 reversed: flange top at .7');
      var j2 = UI.App.model.features[UI.App.model.features.length - 1];
      assert(j2.offsetEnd === 'offsetFromSurface' && j2.offsetDistance === 0.1 && j2.offsetFlip === true, 'saved: ' + JSON.stringify(j2));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfJJ: Sheet Metal ▸ Lofted-Bend: two open profiles (square 4 → round Ø2), the PM\'s Manufacturing Method / Profiles / Faceting Options / Thickness; Bent with chord tolerance makes the part and a flat with bend lines; Formed has none; Edit Feature', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).end();\n' +
        'p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).end();\n'); await idle();
      var lb = rfJJRibbon(function (b) { return /Lofted/.test(b.getAttribute('aria-label') || b.textContent); });
      assert(lb, 'Lofted-Bend button');
      lb.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Lofted-Bend', 'PM ' + (UI.hasPM() && UI.pmTitle()));
      var heads = Array.prototype.map.call(D.querySelectorAll('#pm .pm-group > h4'), function (h) { return h.textContent.replace(/^[▸▾]/, '').trim(); });
      ['Manufacturing Method', 'Profiles', 'Faceting Options', 'Thickness'].forEach(function (h, i) { assert(heads.indexOf(h) >= 0 && (i === 0 || heads.indexOf(h) > heads.indexOf(['Manufacturing Method', 'Profiles', 'Faceting Options', 'Thickness'][i - 1])), 'groups: ' + heads.join(' | ')); });
      var th = pmField('Thickness'); th.value = '0.0598'; th.dispatchEvent(new W.Event('input', { bubbles: true })); th.dispatchEvent(new W.Event('change', { bubbles: true }));
      D.querySelector('#pm input[data-key="faceting:chord"]').click(); await wait(20);
      var ct = pmField('Chord tolerance'); ct.value = '0.01'; ct.dispatchEvent(new W.Event('input', { bubbles: true })); ct.dispatchEvent(new W.Event('change', { bubbles: true }));
      await pmAccept();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'loftedBend' && f.method === 'bent' && f.faceting === 'chord' && f.facetValue === 0.01 && f.name === 'Lofted-Bend1' && !UI.App.build.errors[f.id], 'feature ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      near(+UI.App.model.sheet.thickness, 0.0598, 1e-12, 'the sheet set from the PM');
      var flat = anvil.flat();
      assert(flat.loops.length === 1 && flat.bends.length > 20, 'flat: ' + flat.loops.length + ' loop, ' + flat.bends.length + ' bends');
      var dxf = anvil.dxfOutput({ export: 'sheet' });
      assert(/\n8\nBEND\n/.test(dxf) && /\n8\nOUTLINE\n/.test(dxf), 'DXF with OUTLINE and BEND');
      UI.editFeature(f); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Lofted-Bend1' && UI.pmSpec().values.faceting === 'chord', 'Edit Feature reopens');
      D.querySelector('#pm input[data-key="method:formed"]').click(); await wait(20);
      assert(!pmField('Chord tolerance'), 'Formed: no faceting options');
      await pmAccept();
      assert(!anvil.flat().bends.length, 'Formed: no bend lines');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
