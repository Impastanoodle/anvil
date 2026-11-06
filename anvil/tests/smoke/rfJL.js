  // --- rfJL (2026-11-06, lane sketchgaps-2) --- DXF/DWG Import of a customer flat into an inch part through its
  // PropertyManager: a layer turned off by a click on its box, Repair after import with "Close gaps up to" .001 in, ✓
  // clicked: the sketch is one closed outline with its holes, Check Sketch finds nothing, and it makes a Base Flange.
  function rfJLText() {
    function L(a, b) { return ['0', 'LINE', '8', 'CUT', '10', a[0], '20', a[1], '11', b[0], '21', b[1]]; }
    var e = [].concat(L([0, 0], [10, 0]), L([0, 0], [10, 0]), L([10.0005, 0], [10, 6]), L([10, 3], [10, 5]), L([10, 6], [0.0008, 6]), L([0, 6], [0, 0]),
      ['0', 'LWPOLYLINE', '8', 'CUT', '90', 4, '70', 1, '10', 3, '20', 2, '10', 7, '20', 2, '42', 1, '10', 7, '20', 3, '10', 3, '20', 3, '42', 1],
      ['0', 'CIRCLE', '8', 'CUT', '10', 8.5, '20', 4.5, '40', 0.25], ['0', 'CIRCLE', '8', 'ETCH', '10', 5, '20', 4.5, '40', 0.2]);
    return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', 1, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'].concat(e, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
  }
  step('rfJL: DXF/DWG Import of a customer flat (duplicate edge, overlap, 0.0005 / 0.0008 gaps, bulge slot) into an inch part: ETCH clicked off, Close gaps up to .001, ✓ clicked: one closed outline, Check Sketch clean, Base Flange .0598 builds', async function () {
    var errs0 = errors.length, m = UI.K.newModel('JLPart'); m.units = 'in';
    await anvil.load(m); await idle();
    var v = UI.importDXFText(rfJLText(), { name: 'customer-flat.dxf' }); await idle();
    assert(v && UI.pmTitle() === 'DXF/DWG Import', 'PM ' + UI.pmTitle());
    var gapIn = D.querySelector('#pm input[data-key="gap"]');
    assert(gapIn && Math.abs(+gapIn.value - 0.001) < 1e-12, 'Close gaps up to .001: ' + (gapIn && gapIn.value));
    var etch = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return /^ETCH \(1\)/.test(l.textContent.trim()); })[0];
    var box = etch && (etch.querySelector('input') || (etch.parentElement && etch.parentElement.querySelector('input[type=checkbox]')));
    assert(box && box.checked, 'ETCH layer box');
    box.click(); await idle();
    var msg = ($('pm').textContent || '').replace(/\s+/g, ' ');
    assert(/2 gaps closed/.test(msg) && /2 duplicates merged/.test(msg), 'message: ' + msg.slice(0, 300));
    D.querySelector('#pm .pm-ok').click(); await idle();
    var f = UI.activeSketchFeature();
    assert(f && !f.entities.some(function (e) { return e.layer === 'ETCH'; }), 'ETCH left out');
    var loops = UI.K.sketchProfile(f).loops;
    assert(loops.filter(function (l) { return !l.hole; }).length === 1 && loops.length === 3, 'outline + slot + hole: ' + loops.length);
    assert(/Check Sketch: no problems found/.test($('status-msg').textContent), 'status ' + $('status-msg').textContent);
    UI.cmdBaseFlange(); await idle();
    assert(UI.pmTitle() === 'Base Flange/Tab', 'PM ' + UI.pmTitle());
    var tIn = pmField('Thickness');
    assert(tIn, 'Thickness field: ' + Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); }).join(' | '));
    setInput(tIn, '.0598'); await idle();
    D.querySelector('#pm .pm-ok').click(); await idle();
    var vol = anvil.summary().volume, A = 60 - (4 + Math.PI * 0.25) - Math.PI * 0.0625;
    assert(Math.abs(vol / (A * 0.0598) - 1) < 2e-3, 'Base Flange volume ' + vol + ' vs ' + A * 0.0598 + ' errors ' + JSON.stringify(UI.App.build.errors));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'volume ' + vol.toFixed(5);
  });
  // --- end rfJL ---
