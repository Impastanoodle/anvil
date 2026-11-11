  // --- rfKW (2026-11-11, lane dwgin, test-reports/2026-11-11-dwg-import.md) --- a customer DWG as a user opens it: the
  // local server's api/dwg2dxf is mocked with what LibreDWG's dwg2dxf writes for two AutoCAD 2000 DWGs (handles, AcDb
  // markers, 210 groups; kernel side and the full fixtures: tests/kernel/rfKW.js). (a) File ▸ Open of a .dwg with 3D
  // entities: the DXF/DWG Import PM says which are tilted / off z = 0 and that they are projected; ✓: the square and
  // the circle as two closed profiles; (b) Insert DXF / DWG of a .dwg with no $INSUNITS: File units says it assumed
  // inches from $MEASUREMENT 0, the message says so too, the frozen / off layers start unchecked; ✓: the 2 × 1 part.
  // Self-contained.
  (function () {
    function rfKWdxf(s) { return s.replace(/\n/g, '\r\n') + '\r\n'; }
    var FX = {
      c14:
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$TEXTSIZE\n40\n2.5\n9\n$HANDSEED\n5\n3C\n9\n$MEASUREMENT\n70\n     0\n9\n$INSUNITS\n70\n     1\n0' +
        '\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n1\n330\n0\n100\nAcDbSymbolTable\n70\n     2\n0\nLAYER\n5\n27\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableReco' +
        'rd\n2\n0\n70\n     0\n62\n     7\n6\nContinuous\n370\n    -3\n390\n13\n0\nLAYER\n5\n28\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDefpoints\n70\n     0\n' +
        '62\n     7\n6\nContinuous\n290\n     0\n370\n    -3\n390\n13\n0\nENDTAB\n0\nTABLE\n2\nSTYLE\n5\n5\n330\n0\n100\nAcDbSymbolTable\n70\n     1\n0\nSTYLE\n5\n29\n330\n5\n100\nAcDbSymbol' +
        'TableRecord\n100\nAcDbTextStyleTableRecord\n2\nStandard\n70\n     0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n     0\n42\n2.5\n3\ntxt\n4\n\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nBL' +
        'OCK\n5\n18\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*Model_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Model_Space\n1\n\n0\nENDBLK\n5\n19\n330\n17\n100\nAcDbEnt' +
        'ity\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n1C\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockBegin\n2\n*Paper_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Paper_Sp' +
        'ace\n1\n\n0\nENDBLK\n5\n1D\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockEnd\n0\nENDBLK\n5\n0\n330\n1F\n100\nAcDbEntity\n8\n0\n48\n0.0\n370\n     0\n62\n     0\n100\nAcDbB' +
        'lockEnd\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n5\n2F\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n0.0\n20\n0.0\n30\n0.0\n11\n1.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n30\n330\n17\n' +
        '100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n1.0\n20\n0.0\n30\n0.0\n11\n1.0\n21\n1.0\n31\n0.0\n0\nLINE\n5\n31\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n1.0\n20\n1.0\n30\n0.0\n11\n0' +
        '.0\n21\n1.0\n31\n0.0\n0\nLINE\n5\n32\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n0.0\n20\n1.0\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n33\n330\n17\n100\nAcDbEntity\n8\n0\n10' +
        '0\nAcDbLine\n10\n2.0\n20\n0.0\n30\n0.0\n11\n3.0\n21\n0.0\n31\n1.0\n0\nLINE\n5\n34\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n2.0\n20\n2.0\n30\n5.0\n11\n3.0\n21\n2.0\n31\n5.0\n0\n3D' +
        'FACE\n5\n35\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbFace\n10\n5.0\n20\n0.0\n30\n0.0\n11\n6.0\n21\n0.0\n31\n0.0\n12\n6.0\n22\n1.0\n32\n1.0\n13\n5.0\n23\n1.0\n33\n1.0\n0\nCIRCLE\n5\n36\n330' +
        '\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbCircle\n10\n8.0\n20\n0.0\n30\n2.0\n40\n0.5\n0\nENDSEC\n0\nEOF',
      c07:
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$TEXTSIZE\n40\n0.0\n9\n$HANDSEED\n5\n48\n9\n$MEASUREMENT\n70\n     0\n9\n$INSUNITS\n70\n     1\n0' +
        '\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n41\n330\n0\n100\nAcDbSymbolTable\n70\n     5\n0\nLAYER\n5\n2\n330\n41\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRec' +
        'ord\n2\nCUT\n70\n     0\n62\n     7\n6\nCONTINUOUS\n370\n    -3\n390\n2D\n0\nLAYER\n5\n3\n330\n41\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nTITLE\n70\n     1\n6' +
        '2\n     7\n6\nCONTINUOUS\n370\n    -3\n390\n2D\n0\nLAYER\n5\n4\n330\n41\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDIMS\n70\n     0\n62\n    -3\n6\nCONTINUOUS\n' +
        '370\n    -3\n390\n2D\n0\nLAYER\n5\n3A\n330\n41\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\n0\n70\n     0\n62\n     7\n6\nCONTINUOUS\n370\n    -3\n390\n2D\n0\nLAYE' +
        'R\n5\n3B\n330\n41\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDefpoints\n70\n     0\n62\n     7\n6\nCONTINUOUS\n290\n     0\n370\n    -3\n390\n2D\n0\nENDTAB\n0\n' +
        'TABLE\n2\nSTYLE\n5\n10\n330\n0\n100\nAcDbSymbolTable\n70\n     1\n0\nSTYLE\n5\n3C\n330\n10\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n2\nStandard\n70\n     0' +
        '\n40\n0.0\n41\n1.0\n50\n0.0\n71\n     0\n42\n2.5\n3\ntxt\n4\n\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n5\n17\n330\n15\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*Mode' +
        'l_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Model_Space\n1\n\n0\nENDBLK\n5\n18\n330\n15\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n19\n330\n16\n100\nAcDbEntity\n6' +
        '7\n     1\n8\n0\n100\nAcDbBlockBegin\n2\n*Paper_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Paper_Space\n1\n\n0\nENDBLK\n5\n1A\n330\n16\n100\nAcDbEntity\n67\n     1\n8\n0\n100\n' +
        'AcDbBlockEnd\n0\nENDBLK\n5\n0\n330\n1F\n100\nAcDbEntity\n8\n0\n48\n0.0\n370\n     0\n62\n     0\n100\nAcDbBlockEnd\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n5\n5\n330\n15\n100\nA' +
        'cDbEntity\n8\nCUT\n100\nAcDbLine\n10\n0.0\n20\n0.0\n30\n0.0\n11\n2.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n6\n330\n15\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n2.0\n20\n0.0\n30\n0.0\n11\n2.0' +
        '\n21\n1.0\n31\n0.0\n0\nLINE\n5\n7\n330\n15\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n2.0\n20\n1.0\n30\n0.0\n11\n0.0\n21\n1.0\n31\n0.0\n0\nLINE\n5\n8\n330\n15\n100\nAcDbEntity\n8\nCUT\n10' +
        '0\nAcDbLine\n10\n0.0\n20\n1.0\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n9\n330\n15\n100\nAcDbEntity\n8\nTITLE\n100\nAcDbLine\n10\n-5.0\n20\n-5.0\n30\n0.0\n11\n10.0\n21\n-5.0\n31\n0' +
        '.0\n0\nLINE\n5\nA\n330\n15\n100\nAcDbEntity\n8\nTITLE\n100\nAcDbLine\n10\n10.0\n20\n-5.0\n30\n0.0\n11\n10.0\n21\n10.0\n31\n0.0\n0\nLINE\n5\nB\n330\n15\n100\nAcDbEntity\n8\nTITLE\n100\nAc' +
        'DbLine\n10\n10.0\n20\n10.0\n30\n0.0\n11\n-5.0\n21\n10.0\n31\n0.0\n0\nLINE\n5\nC\n330\n15\n100\nAcDbEntity\n8\nTITLE\n100\nAcDbLine\n10\n-5.0\n20\n10.0\n30\n0.0\n11\n-5.0\n21\n-5.0\n31\n0' +
        '.0\n0\nLINE\n5\nD\n330\n15\n100\nAcDbEntity\n8\nDIMS\n100\nAcDbLine\n10\n0.0\n20\n-1.0\n30\n0.0\n11\n2.0\n21\n-1.0\n31\n0.0\n0\nENDSEC\n0\nEOF'
    };
    function rfKWfetch(text) {
      var real = W.fetch, calls = [];
      W.fetch = function (url, opts) {
        if (!/api\/dwg2dxf$/.test(String(url))) return real.apply(W, arguments);
        calls.push(String(url));
        return Promise.resolve(new W.Response(new W.TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'application/dxf', 'X-Anvil-Converter': 'libredwg' } }));
      };
      return { calls: calls, restore: function () { W.fetch = real; } };
    }
    function rfKWbytes() { var b = new Uint8Array(64); 'AC1015'.split('').forEach(function (c, i) { b[i] = c.charCodeAt(0); }); return b.buffer; }
    function rfKWmsg() { return ($('pm').textContent || '').replace(/\s+/g, ' '); }
    function rfKWbox(re) {
      var lb = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return re.test(l.textContent.trim()); })[0];
      return lb && (lb.querySelector('input') || (lb.parentElement && lb.parentElement.querySelector('input[type=checkbox]')));
    }
    function rfKWarea(f) {
      return UI.K.sketchProfile(f).loops.map(function (l) { return Math.abs(UI.K.signedArea(l.pts)); });
    }

    step('rfKW: File ▸ Open of a customer DWG with 3D entities (a tilted LINE, a LINE at z 5, a CIRCLE at elevation 2, a 3DFACE): the DXF/DWG Import PM says what is 3D and that it is placed on the sketch plane; ✓: the 1 × 1 square and the R .5 circle as two closed profiles', async function () {
      var errs0 = errors.length, m = rfKWfetch(rfKWdxf(FX.c14));
      try {
        await UI.openFileData('Bracket-3D.dwg', rfKWbytes()); await idle();
        assert(m.calls.length === 1 && UI.pmTitle() === 'DXF/DWG Import' && UI.App.model.name === 'Bracket-3D', 'opened: ' + UI.pmTitle() + ' / ' + UI.App.model.name);
        var msg = rfKWmsg();
        assert(/1 entity is not parallel to the XY plane \(3D\): projected onto it/.test(msg) && /2 entities lie off z = 0 \(3D, at another elevation\): placed on the sketch plane/.test(msg) && /Skipped 1 3DFACE/.test(msg), 'message: ' + msg.slice(0, 400));
        D.querySelector('#pm .pm-ok').click(); await idle();
        // (the new part takes the default template's units: the inch file is scaled into them)
        var f = UI.activeSketchFeature(), s2 = UI.App.model.units === 'mm' ? 25.4 * 25.4 : 1, a = rfKWarea(f).map(function (x) { return x / s2; }).sort();
        assert(f && f.entities.length === 7 && a.length === 2 && Math.abs(a[0] - Math.PI / 4) < 0.01 && Math.abs(a[1] - 1) < 1e-9, 'sketch: ' + (f && f.entities.length) + ' entities, loops ' + JSON.stringify(a));
        await UI.exitSketch(true); await idle();
      } finally { m.restore(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfKW: Insert DXF / DWG of a DWG with no $INSUNITS ($MEASUREMENT 0) into an inch part: File units reads "Inches (assumed: no $INSUNITS, $MEASUREMENT 0)" and the message says so; the frozen title frame and the off dimension layer start unchecked; ✓: only the 2 × 1 part', async function () {
      var errs0 = errors.length, m0 = UI.K.newModel('KWUnits');
      m0.units = 'in'; await anvil.load(m0); await idle();
      var text = rfKWdxf(FX.c07).replace(/(\$INSUNITS\r\n *70\r\n) *\d+/, '$10');
      var m = rfKWfetch(text);
      try {
        var v = await UI.importDWGData('customer-unitless.dwg', rfKWbytes()); await idle();
        assert(v && UI.pmTitle() === 'DXF/DWG Import', 'PM ' + UI.pmTitle());
        var msg = rfKWmsg();
        assert(/File units\s*Inches \(assumed: no \$INSUNITS, \$MEASUREMENT 0\)/.test(msg), 'File units: ' + msg.slice(0, 300));
        assert(/No units in the file \(\$INSUNITS 0\): taken as inches from \$MEASUREMENT 0 \(English\)/.test(msg), 'message: ' + msg.slice(0, 500));
        var title = rfKWbox(/^TITLE \(4\), frozen in the file/), dims = rfKWbox(/^DIMS \(1\), off in the file/), cut = rfKWbox(/^CUT \(4\)/);
        assert(cut && cut.checked && title && !title.checked && dims && !dims.checked, 'layer boxes');
        D.querySelector('#pm .pm-ok').click(); await idle();
        var f = UI.activeSketchFeature(), a = rfKWarea(f);
        assert(f.entities.length === 4 && a.length === 1 && Math.abs(a[0] - 2) < 1e-9, 'the 2 × 1 part: ' + f.entities.length + ' ' + JSON.stringify(a));
        await UI.exitSketch(true); await idle();
      } finally { m.restore(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
  // --- end rfKW ---
