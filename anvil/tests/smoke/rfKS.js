  // --- rfKS (2026-11-11, lane dxfaudit, test-reports/2026-11-11-dxf-dwg-audit.md) --- the DXF / DWG audit as a user
  // meets it: (a) a customer DXF with a frozen title-block layer and an off dimension layer: the DXF/DWG Import PM lists
  // them unchecked ("frozen in the file", "off in the file"), a click on the frozen one brings it into the preview and a
  // second click takes it out, ✓: only the part comes in; (b) a plate with a .002 in gap at a corner: the PM names the
  // gap it leaves open at Close gaps up to .001, typing .0025 closes it, ✓: one closed profile of area 6 with the bottom
  // edge still horizontal; (c) DXF/DWG Output of a sheet part: bend lines on BEND in the CENTER line type. Kernel side:
  // tests/kernel/rfKS.js. Self-contained.
  (function () {
    function rfKSfile(ents, layers) {
      var t = ['0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB',
        '0', 'TABLE', '2', 'LAYER', '70', String(layers.length)];
      layers.forEach(function (l) { t.push('0', 'LAYER', '2', l[0], '70', String(l[2] || 0), '62', String(l[1]), '6', 'CONTINUOUS'); });
      t.push('0', 'ENDTAB');
      return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES'].concat(t,
        ['0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'], ents, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
    }
    function LN(ly, a, b) { return ['0', 'LINE', '8', ly, '10', String(a[0]), '20', String(a[1]), '30', '0', '11', String(b[0]), '21', String(b[1]), '31', '0']; }
    function RECT(ly, x0, y0, x1, y1) { return [].concat(LN(ly, [x0, y0], [x1, y0]), LN(ly, [x1, y0], [x1, y1]), LN(ly, [x1, y1], [x0, y1]), LN(ly, [x0, y1], [x0, y0])); }
    function rfKSbox(re) {
      var lb = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return re.test(l.textContent.trim()); })[0];
      return lb && (lb.querySelector('input') || (lb.parentElement && lb.parentElement.querySelector('input[type=checkbox]')));
    }
    function rfKSmsg() { return ($('pm').textContent || '').replace(/\s+/g, ' '); }
    async function rfKSpart(name) { var m = UI.K.newModel(name); m.units = 'in'; await anvil.load(m); await idle(); }

    step('rfKS: DXF/DWG Import of a customer DXF with a frozen title block and an off dimension layer: both start unchecked and say why, a click on TITLE previews it and a second click drops it, ✓: only the 2 × 1 part on CUT', async function () {
      var errs0 = errors.length;
      await rfKSpart('KSFrozen');
      var text = rfKSfile([].concat(RECT('CUT', 0, 0, 2, 1), RECT('TITLE', -5, -5, 10, 10), LN('DIMS', [0, -1], [2, -1])), [['CUT', 7], ['TITLE', 7, 1], ['DIMS', -3]]);
      var v = UI.importDXFText(text, { name: 'customer-frozen.dxf' }); await idle();
      assert(v && UI.pmTitle() === 'DXF/DWG Import', 'PM ' + UI.pmTitle());
      var cut = rfKSbox(/^CUT \(4\)/), title = rfKSbox(/^TITLE \(4\), frozen in the file/), dims = rfKSbox(/^DIMS \(1\), off in the file/);
      assert(cut && cut.checked && title && !title.checked && dims && !dims.checked, 'layer boxes: ' + Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); }).join(' | '));
      assert(/4 entities to import/.test(rfKSmsg()) && /TITLE \(frozen\)/.test(rfKSmsg()), 'message: ' + rfKSmsg().slice(0, 300));
      title.click(); await idle();
      assert(/8 entities to import/.test(rfKSmsg()), 'TITLE on: ' + rfKSmsg().slice(0, 200));
      rfKSbox(/^TITLE \(4\)/).click(); await idle();
      assert(/4 entities to import/.test(rfKSmsg()), 'TITLE off again: ' + rfKSmsg().slice(0, 200));
      D.querySelector('#pm .pm-ok').click(); await idle();
      var f = UI.activeSketchFeature();
      assert(f && f.entities.length === 4 && f.entities.every(function (e) { return e.layer === 'CUT'; }), 'sketch: ' + JSON.stringify(f && f.entities).slice(0, 300));
      var loops = UI.K.sketchProfile(f).loops;
      assert(loops.length === 1 && Math.abs(Math.abs(UI.K.signedArea(loops[0].pts)) - 2) < 1e-9, 'one 2 × 1 loop');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfKS: DXF/DWG Import of a plate with a .002 in gap at a corner: at Close gaps up to .001 the PM names the gap it leaves open (0.002 in), .0025 typed closes it, ✓: one closed profile, area 6, the bottom edge still horizontal', async function () {
      var errs0 = errors.length;
      await rfKSpart('KSGap');
      var text = rfKSfile([].concat(LN('0', [0, 0], [3, 0]), LN('0', [0, 0], [3, 0]), LN('0', [3, 0], [3, 2]), LN('0', [3, 2], [0, 2]), LN('0', [0, 2], [0, 0.002])), [['0', 7]]);
      UI.importDXFText(text, { name: 'customer-gap.dxf' }); await idle();
      assert(UI.pmTitle() === 'DXF/DWG Import', 'PM ' + UI.pmTitle());
      assert(/1 gap left open \(0\.002 in\): raise Close gaps up to to close it/.test(rfKSmsg()) && /1 duplicate merged/.test(rfKSmsg()), 'message: ' + rfKSmsg().slice(0, 300));
      setInput(D.querySelector('#pm input[data-key="gap"]'), '.0025'); await idle();
      assert(/1 gap closed/.test(rfKSmsg()) && !/left open/.test(rfKSmsg()), 'after .0025: ' + rfKSmsg().slice(0, 300));
      D.querySelector('#pm .pm-ok').click(); await idle();
      var f = UI.activeSketchFeature(), loops = UI.K.sketchProfile(f).loops;
      assert(loops.length === 1 && Math.abs(Math.abs(UI.K.signedArea(loops[0].pts)) - 6) < 1e-9, 'one loop of area 6: ' + loops.length + ' ' + (loops[0] && UI.K.signedArea(loops[0].pts)));
      assert(f.entities.some(function (e) { return e.t === 'line' && e.y1 === 0 && e.y2 === 0 && Math.abs(e.x2 - e.x1) === 3; }), 'bottom edge y = 0 at both ends: ' + JSON.stringify(f.entities));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfKS: DXF/DWG Output of a sheet part (L bracket, .0598): the flat\'s BEND layer is in the CENTER line type (defined in LTYPE), the cut layers CONTINUOUS; R2000 the same', async function () {
      var T = 0.0598, m = UI.K.newModel('KSFlat');
      UI.K.runScript(m, 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.44);\np.sketch("Top").rect(0, -2, 3, 2).end().baseFlange();\np.flange(1.5, [[3, ' + T + ', 1]], { lengthRef: "outer" });\n');
      await anvil.load(m); await idle();
      var r12 = anvil.dxfOutput({ export: 'sheet' }), r2 = anvil.dxfOutput({ export: 'sheet', version: 'R2000' });
      [r12, r2].forEach(function (d, i) {
        assert(/\n0\nLTYPE\n[\s\S]*?\n2\nCENTER\n/.test(d) && /\n2\nBEND\n70\n0\n62\n3\n6\nCENTER\n/.test(d.replace(/\n5\n[0-9A-F]+\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord/g, '')), (i ? 'R2000' : 'R12') + ' BEND CENTER');
        assert(/\n2\nOUTLINE\n70\n0\n62\n7\n6\n(CONTINUOUS|Continuous)\n/.test(d.replace(/\n5\n[0-9A-F]+\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord/g, '')) && /\n0\nLINE\n(5\n[0-9A-F]+\n330\n1F\n100\nAcDbEntity\n)?8\nBEND\n/.test(d), (i ? 'R2000' : 'R12') + ' OUTLINE continuous, a BEND line');
      });
    });

    step('rfKS: Geometry Nesting ▸ Add DXF leaves a frozen title-block layer and an off dimension layer out of the nest: one 2 × 1 part', async function () {
      var errs0 = errors.length;
      await rfKSpart('KSNest');
      UI.cmdTNesting(); await idle();
      assert(UI.pmTitle() === 'Geometry Nesting', 'PM ' + UI.pmTitle());
      var text = rfKSfile([].concat(RECT('CUT', 0, 0, 2, 1), RECT('TITLE', -5, -5, 10, 10), LN('DIMS', [0, -1], [2, -1])), [['CUT', 7], ['TITLE', 7, 1], ['DIMS', -3]]);
      var r = UI.nestAddDXFText(text, 'customer-frozen.dxf'); await idle();
      var parts = UI.nestState().parts;
      assert(r && r.ok && parts.length === 1, 'one part added: ' + JSON.stringify(r) + ' ' + parts.length);
      assert(Math.abs(parts[0].part.area - 2) < 1e-9, 'the 2 × 1 part on CUT, not the frozen 10 × 10 border: area ' + parts[0].part.area);
      UI.pmCancel(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
  // --- end rfKS ---
