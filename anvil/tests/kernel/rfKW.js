  // --- rfKW (2026-11-11, lane dwgin, test-reports/2026-11-11-dwg-import.md) --- customer DWG files into a sketch. A .dwg
  // reaches DxfImport through a converter (serve.ps1 / the desktop app's api/dwg2dxf, the runner's headless/dwg.js:
  // the ODA File Converter, else LibreDWG's dwg2dxf), so what is tested is the DXF that converter writes: handles, AcDb
  // subclass markers, XDATA, 210 on every entity, HATCH, DIMENSION with its *D block, paper space and VIEWPORTs. The
  // fixtures below are LibreDWG 0.14's dwg2dxf output for DWGs written by its dxf2dwg (AutoCAD 2000) from ezdxf files
  // shaped like rfKS's customer DXFs, and for Anvil's own flat DWG (dwg-writer.js), trimmed to the header units, the
  // LAYER / STYLE tables, BLOCKS and ENTITIES (the import reads nothing else; the trimmed text imports identically).
  // The last row runs the real converter when vendor/libredwg (or $ANVIL_LIBREDWG) is there, and passes as skipped
  // when it is not (CI, the browser page).
  (function () {
    group('rfKW: DWG import: customer DWGs through the converter come in as the right sketch');
    if (typeof DxfImport === 'undefined') { test('rfKW: DxfImport is loaded', function () { fail('missing'); }); return; }
    var DI = DxfImport;
    function rfKWdxf(s) { return s.replace(/\n/g, '\r\n') + '\r\n'; }   // (the converter writes CRLF)
    var FX = {
      c13:
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$TEXTSIZE\n40\n2.5\n9\n$HANDSEED\n5\n6D\n9\n$MEASUREMENT\n70\n     0\n9\n$INSUNITS\n70\n     1\n0' +
        '\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n1\n330\n0\n100\nAcDbSymbolTable\n70\n     6\n0\nLAYER\n5\n27\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableReco' +
        'rd\n2\n0\n70\n     0\n62\n     7\n6\nContinuous\n370\n    -3\n390\n13\n0\nLAYER\n5\n28\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDefpoints\n70\n     0\n' +
        '62\n     7\n6\nContinuous\n290\n     0\n370\n    -3\n390\n13\n0\nLAYER\n5\n2F\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nCUT\n70\n     0\n62\n     7\n6\n' +
        'Continuous\n370\n    -3\n390\n13\n0\nLAYER\n5\n30\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nHATCH\n70\n     0\n62\n     8\n6\nContinuous\n370\n    -3' +
        '\n390\n13\n0\nLAYER\n5\n31\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDIM\n70\n     0\n62\n     2\n6\nContinuous\n370\n    -3\n390\n13\n0\nLAYER\n5\n32\n33' +
        '0\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nFROZEN\n70\n     1\n62\n     3\n6\nContinuous\n370\n    -3\n390\n13\n0\nENDTAB\n0\nTABLE\n2\nSTYLE\n5\n5\n330\n0\n' +
        '100\nAcDbSymbolTable\n70\n     1\n0\nSTYLE\n5\n29\n330\n5\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n2\nStandard\n70\n     0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n ' +
        '    0\n42\n2.5\n3\ntxt\n4\n\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n5\n18\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*Model_Space\n70\n     0\n10\n0.0\n2' +
        '0\n0.0\n30\n0.0\n3\n*Model_Space\n1\n\n0\nENDBLK\n5\n19\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n1C\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlock' +
        'Begin\n2\n*Paper_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Paper_Space\n1\n\n0\nENDBLK\n5\n1D\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockEnd\n0\nENDBLK\n5\n3C' +
        '\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n3B\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*D1\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*D1\n1\n\n0\nLI' +
        'NE\n5\n3D\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n0.0\n20\n0.0\n30\n0.0\n11\n0.0\n21\n-0.75\n31\n0.0\n0\nLINE\n5\n3E\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n4.0\n20\n' +
        '0.0\n30\n0.0\n11\n4.0\n21\n-0.75\n31\n0.0\n0\nINSERT\n5\n43\n330\n0\n100\nAcDbEntity\n8\nDIM\n100\nAcDbBlockReference\n2\n_CLOSEDFILLED\n10\n0.0\n20\n-0.75\n30\n0.0\n41\n0.25\n42\n0.' +
        '25\n43\n0.0\n50\n180.0\n0\nINSERT\n5\n45\n330\n0\n100\nAcDbEntity\n8\nDIM\n100\nAcDbBlockReference\n2\n_CLOSEDFILLED\n10\n4.0\n20\n-0.75\n30\n0.0\n41\n0.25\n42\n0.25\n43\n0.0\n0\nLIN' +
        'E\n5\n47\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n0.25\n20\n-0.75\n30\n0.0\n11\n1.5\n21\n-0.75\n31\n0.0\n0\nLINE\n5\n48\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n2.5\n2' +
        '0\n-0.75\n30\n0.0\n11\n3.75\n21\n-0.75\n31\n0.0\n0\nMTEXT\n5\n49\n330\n0\n100\nAcDbEntity\n8\nDIM\n100\nAcDbMText\n10\n2.0\n20\n-0.75\n30\n0.0\n210\n0.0\n220\n0.0\n230\n1.0\n11\n1.0\n21\n' +
        '0.0\n31\n0.0\n40\n0.0\n41\n1.0\n71\n     5\n72\n     0\n1\n4\n7\nStandard\n73\n     0\n44\n0.0\n0\nPOINT\n5\n4A\n330\n0\n100\nAcDbEntity\n8\nDefpoints\n100\nAcDbPoint\n10\n0.0\n20\n-0.' +
        '75\n30\n0.0\n50\n0.0\n0\nPOINT\n5\n4B\n330\n0\n100\nAcDbEntity\n8\nDefpoints\n100\nAcDbPoint\n10\n0.0\n20\n0.0\n30\n0.0\n50\n0.0\n0\nPOINT\n5\n4C\n330\n0\n100\nAcDbEntity\n8\nDefpoints' +
        '\n100\nAcDbPoint\n10\n4.0\n20\n0.0\n30\n0.0\n50\n0.0\n0\nENDBLK\n5\n3C\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n40\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbBlock' +
        'Begin\n2\n_CLOSEDFILLED\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n_CLOSEDFILLED\n1\n\n0\nSOLID\n5\n42\n330\n0\n100\nAcDbEntity\n8\n0\n6\nByBlock\n62\n     0\n100\nAcDbTrace\n38\n0.0' +
        '\n10\n-1.0\n20\n0.1643989837240254\n11\n0.0\n21\n0.0\n12\n-1.0\n22\n-0.1643989837240254\n13\n-1.0\n23\n-0.1643989837240254\n0\nENDBLK\n5\n41\n330\n0\n100\nAcDbEntity\n8\n0\n100\n' +
        'AcDbBlockEnd\n0\nBLOCK\n5\n57\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\nTAB\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\nTAB\n1\n\n0\nLINE\n5\n59\n330\n0\n100\nAcDbEntity\n8' +
        '\n0\n100\nAcDbLine\n10\n0.0\n20\n0.0\n30\n0.0\n11\n1.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n5A\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n1.0\n20\n0.0\n30\n0.0\n11\n1.0\n21\n1.0\n31\n0.0\n' +
        '0\nLINE\n5\n5B\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n1.0\n20\n1.0\n30\n0.0\n11\n0.0\n21\n1.0\n31\n0.0\n0\nLINE\n5\n5C\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n0.0\n2' +
        '0\n1.0\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n0\nATTDEF\n5\n5D\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbText\n10\n0.1\n20\n0.1\n30\n0.0\n40\n0.1\n1\n\n7\nStandard\n11\n0.0\n21\n0.0\n31\n0.0\n1' +
        '00\nAcDbAttributeDefinition\n280\n     0\n3\n\n2\nPN\n70\n     0\n0\nENDBLK\n5\n58\n330\n0\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n5' +
        '\n33\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n0.0\n20\n0.0\n30\n0.0\n11\n4.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n34\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n4.0\n20\n' +
        '0.0\n30\n0.0\n11\n4.0\n21\n2.0\n31\n0.0\n0\nLINE\n5\n35\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n4.0\n20\n2.0\n30\n0.0\n11\n0.0\n21\n2.0\n31\n0.0\n0\nLINE\n5\n36\n330\n17\n100\n' +
        'AcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n0.0\n20\n2.0\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n0\nCIRCLE\n5\n37\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbCircle\n10\n1.0\n20\n1.0\n30\n0.0\n' +
        '40\n0.25\n0\nHATCH\n5\n38\n330\n17\n100\nAcDbEntity\n8\nHATCH\n62\n     8\n100\nAcDbHatch\n10\n0.0\n20\n0.0\n30\n0.0\n210\n0.0\n220\n0.0\n230\n1.0\n2\nSOLID\n70\n     1\n71\n     0\n91' +
        '\n        1\n92\n        3\n72\n     0\n73\n     1\n93\n        4\n10\n0.0\n20\n0.0\n10\n4.0\n20\n0.0\n10\n4.0\n20\n2.0\n10\n0.0\n20\n2.0\n97\n        0\n75\n     0\n76\n     1\n98\n ' +
        '       0\n0\nDIMENSION\n5\n39\n330\n17\n100\nAcDbEntity\n8\nDIM\n100\nAcDbDimension\n2\n*D1\n10\n0.0\n20\n-0.75\n30\n0.0\n11\n2.0\n21\n-0.75\n31\n0.0\n70\n    32\n1\n<>\n71\n     5\n7' +
        '2\n     0\n41\n0.0\n42\n0.0\n3\nStandard\n100\nAcDbAlignedDimension\n13\n0.0\n23\n0.0\n33\n0.0\n14\n4.0\n24\n0.0\n34\n0.0\n52\n0.0\n100\nAcDbRotatedDimension\n0\nLINE\n5\n4E\n330\n1' +
        '7\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n10.0\n20\n0.0\n30\n0.0\n11\n11.0\n21\n0.0\n31\n0.0\n1001\nSHOPCAM\n1000\npierce\n1040\n0.25\n1010\n1.0\n1020\n2.0\n1030\n3.0\n0\nLINE\n5' +
        '\n4F\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n11.0\n20\n0.0\n30\n0.0\n11\n11.0\n21\n1.0\n31\n0.0\n0\nLINE\n5\n50\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n11.0\n' +
        '20\n1.0\n30\n0.0\n11\n10.0\n21\n1.0\n31\n0.0\n0\nLINE\n5\n51\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbLine\n10\n10.0\n20\n1.0\n30\n0.0\n11\n10.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n52\n330\n1' +
        '7\n100\nAcDbEntity\n8\nFROZEN\n100\nAcDbLine\n10\n-5.0\n20\n-5.0\n30\n0.0\n11\n20.0\n21\n-5.0\n31\n0.0\n0\nLINE\n5\n53\n330\n17\n100\nAcDbEntity\n8\nFROZEN\n100\nAcDbLine\n10\n20.0\n2' +
        '0\n-5.0\n30\n0.0\n11\n20.0\n21\n10.0\n31\n0.0\n0\nLINE\n5\n54\n330\n17\n100\nAcDbEntity\n8\nFROZEN\n100\nAcDbLine\n10\n20.0\n20\n10.0\n30\n0.0\n11\n-5.0\n21\n10.0\n31\n0.0\n0\nLINE\n5\n55' +
        '\n330\n17\n100\nAcDbEntity\n8\nFROZEN\n100\nAcDbLine\n10\n-5.0\n20\n10.0\n30\n0.0\n11\n-5.0\n21\n-5.0\n31\n0.0\n0\nINSERT\n5\n5E\n330\n17\n100\nAcDbEntity\n8\nCUT\n100\nAcDbBlockRefe' +
        'rence\n66\n     1\n2\nTAB\n10\n20.0\n20\n0.0\n30\n0.0\n41\n-1.0\n42\n0.0\n43\n0.0\n0\nATTRIB\n5\n60\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbText\n10\n-19.9\n20\n0.1\n30\n0.0\n40\n0.1\n1' +
        '\nA-17\n7\nStandard\n11\n0.0\n21\n0.0\n31\n0.0\n210\n0.0\n220\n0.0\n230\n-1.0\n100\nAcDbAttribute\n2\nPN\n70\n     0\n0\nSEQEND\n5\n5F\n330\n5E\n100\nAcDbEntity\n8\nCUT\n0\nATTRIB\n5\n6' +
        '0\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbText\n10\n-19.9\n20\n0.1\n30\n0.0\n40\n0.1\n1\nA-17\n7\nStandard\n11\n0.0\n21\n0.0\n31\n0.0\n210\n0.0\n220\n0.0\n230\n-1.0\n100\nAcDbAttribu' +
        'te\n2\nPN\n70\n     0\n0\nVIEWPORT\n5\n61\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n\n100\nAcDbViewport\n10\n5.0\n20\n4.0\n30\n0.0\n40\n8.0\n41\n6.0\n68\n     1\n69\n     1\n12\n2.0\n22' +
        '\n1.0\n13\n0.0\n23\n0.0\n14\n10.0\n24\n10.0\n15\n10.0\n25\n10.0\n16\n0.0\n26\n0.0\n36\n1.0\n17\n0.0\n27\n0.0\n37\n0.0\n42\n50.0\n43\n0.0\n44\n0.0\n45\n4.0\n50\n0.0\n51\n0.0\n72\n   100\n90\n ' +
        '       0\n1\n\n281\n     0\n71\n     0\n74\n     0\n110\n0.0\n120\n0.0\n130\n0.0\n111\n1.0\n121\n0.0\n131\n0.0\n112\n0.0\n122\n1.0\n132\n0.0\n79\n     0\n146\n0.0\n348\n0\n340\n0\n345\n0' +
        '\n346\n0\n0\nLINE\n5\n62\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbLine\n10\n0.0\n20\n0.0\n30\n0.0\n11\n11.0\n21\n0.0\n31\n0.0\n0\nLINE\n5\n63\n330\n1B\n100\nAcDbEntity\n67\n  ' +
        '   1\n8\n0\n100\nAcDbLine\n10\n11.0\n20\n0.0\n30\n0.0\n11\n11.0\n21\n8.5\n31\n0.0\n0\nLINE\n5\n64\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbLine\n10\n11.0\n20\n8.5\n30\n0.0\n1' +
        '1\n0.0\n21\n8.5\n31\n0.0\n0\nLINE\n5\n65\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbLine\n10\n0.0\n20\n8.5\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n0\nTEXT\n5\n66\n330\n1B\n100\nAcDb' +
        'Entity\n67\n     1\n8\n0\n100\nAcDbText\n10\n7.0\n20\n0.5\n30\n0.0\n40\n0.2\n1\nTITLE: PLATE\n7\nStandard\n11\n0.0\n21\n0.0\n31\n0.0\n100\nAcDbText\n0\nENDSEC\n0\nEOF',
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
      c11:
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$TEXTSIZE\n40\n2.5\n9\n$HANDSEED\n5\n38\n9\n$MEASUREMENT\n70\n     0\n9\n$INSUNITS\n70\n     1\n0' +
        '\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n1\n330\n0\n100\nAcDbSymbolTable\n70\n     2\n0\nLAYER\n5\n27\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableReco' +
        'rd\n2\n0\n70\n     0\n62\n     7\n6\nContinuous\n370\n    -3\n390\n13\n0\nLAYER\n5\n28\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDefpoints\n70\n     0\n' +
        '62\n     7\n6\nContinuous\n290\n     0\n370\n    -3\n390\n13\n0\nENDTAB\n0\nTABLE\n2\nSTYLE\n5\n5\n330\n0\n100\nAcDbSymbolTable\n70\n     1\n0\nSTYLE\n5\n29\n330\n5\n100\nAcDbSymbol' +
        'TableRecord\n100\nAcDbTextStyleTableRecord\n2\nStandard\n70\n     0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n     0\n42\n2.5\n3\ntxt\n4\n\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nBL' +
        'OCK\n5\n18\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*Model_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Model_Space\n1\n\n0\nENDBLK\n5\n19\n330\n17\n100\nAcDbEnt' +
        'ity\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n1C\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockBegin\n2\n*Paper_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Paper_Sp' +
        'ace\n1\n\n0\nENDBLK\n5\n1D\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockEnd\n0\nENDBLK\n5\n0\n330\n1F\n100\nAcDbEntity\n8\n0\n48\n0.0\n370\n     0\n62\n     0\n100\nAcDbB' +
        'lockEnd\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nARC\n5\n2F\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbCircle\n10\n1.0\n20\n0.0\n30\n0.0\n40\n1.0\n210\n0.0\n220\n0.0\n230\n-1.0\n100\nAcD' +
        'bArc\n50\n0.0\n51\n180.0\n0\nLINE\n5\n30\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n-2.0\n20\n0.0\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n0\nCIRCLE\n5\n31\n330\n17\n100\nAcDbEntity' +
        '\n8\n0\n100\nAcDbCircle\n10\n3.0\n20\n0.0\n30\n0.0\n40\n0.25\n210\n0.0\n220\n0.0\n230\n-1.0\n0\nLWPOLYLINE\n5\n32\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbPolyline\n90\n        4\n70' +
        '\n     1\n43\n0.0\n210\n0.0\n220\n0.0\n230\n-1.0\n10\n5.0\n20\n0.0\n42\n-1.0\n10\n6.0\n20\n0.0\n42\n0.0\n10\n6.0\n20\n1.0\n42\n0.0\n10\n5.0\n20\n1.0\n42\n0.0\n0\nENDSEC\n0\nEOF',
      c05:
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$TEXTSIZE\n40\n0.0\n9\n$HANDSEED\n5\n36\n9\n$MEASUREMENT\n70\n     0\n9\n$INSUNITS\n70\n     1\n0' +
        '\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n2F\n330\n0\n100\nAcDbSymbolTable\n70\n     2\n0\nLAYER\n5\n2\n330\n2F\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRec' +
        'ord\n2\n0\n70\n     0\n62\n     7\n6\nCONTINUOUS\n370\n    -3\n390\n1C\n0\nLAYER\n5\n29\n330\n2F\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDefpoints\n70\n     ' +
        '0\n62\n     7\n6\nCONTINUOUS\n290\n     0\n370\n    -3\n390\n1C\n0\nENDTAB\n0\nTABLE\n2\nSTYLE\n5\n8\n330\n0\n100\nAcDbSymbolTable\n70\n     1\n0\nSTYLE\n5\n2A\n330\n8\n100\nAcDbSymb' +
        'olTableRecord\n100\nAcDbTextStyleTableRecord\n2\nStandard\n70\n     0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n     0\n42\n2.5\n3\ntxt\n4\n\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\n' +
        'BLOCK\n5\nF\n330\nD\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*Model_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Model_Space\n1\n\n0\nENDBLK\n5\n10\n330\nD\n100\nAcDbEnti' +
        'ty\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n11\n330\nE\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockBegin\n2\n*Paper_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Paper_Spac' +
        'e\n1\n\n0\nENDBLK\n5\n12\n330\nE\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockEnd\n0\nENDBLK\n5\n0\n330\n1F\n100\nAcDbEntity\n8\n0\n48\n0.0\n370\n     0\n62\n     0\n100\nAcDbBloc' +
        'kEnd\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nELLIPSE\n5\n3\n330\nD\n100\nAcDbEntity\n8\n0\n100\nAcDbEllipse\n10\n0.0\n20\n0.0\n30\n0.0\n11\n1.732050807568877\n21\n0.9999999999999' +
        '999\n31\n0.0\n210\n0.0\n220\n0.0\n230\n1.0\n40\n0.5\n41\n0.0\n42\n6.283185307179586\n0\nELLIPSE\n5\n4\n330\nD\n100\nAcDbEntity\n8\n0\n100\nAcDbEllipse\n10\n10.0\n20\n0.0\n30\n0.0\n11\n' +
        '2.0\n21\n0.0\n31\n0.0\n210\n0.0\n220\n0.0\n230\n1.0\n40\n0.5\n41\n0.0\n42\n3.141592653589793\n0\nLINE\n5\n5\n330\nD\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n8.0\n20\n0.0\n30\n0.0\n11\n' +
        '12.0\n21\n0.0\n31\n0.0\n0\nENDSEC\n0\nEOF',
      c02:
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$TEXTSIZE\n40\n2.5\n9\n$HANDSEED\n5\n35\n9\n$MEASUREMENT\n70\n     0\n9\n$INSUNITS\n70\n     1\n0' +
        '\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n1\n330\n0\n100\nAcDbSymbolTable\n70\n     2\n0\nLAYER\n5\n27\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableReco' +
        'rd\n2\n0\n70\n     0\n62\n     7\n6\nContinuous\n370\n    -3\n390\n13\n0\nLAYER\n5\n28\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nDefpoints\n70\n     0\n' +
        '62\n     7\n6\nContinuous\n290\n     0\n370\n    -3\n390\n13\n0\nENDTAB\n0\nTABLE\n2\nSTYLE\n5\n5\n330\n0\n100\nAcDbSymbolTable\n70\n     1\n0\nSTYLE\n5\n29\n330\n5\n100\nAcDbSymbol' +
        'TableRecord\n100\nAcDbTextStyleTableRecord\n2\nStandard\n70\n     0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n     0\n42\n2.5\n3\ntxt\n4\n\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nBL' +
        'OCK\n5\n18\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*Model_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Model_Space\n1\n\n0\nENDBLK\n5\n19\n330\n17\n100\nAcDbEnt' +
        'ity\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n1C\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockBegin\n2\n*Paper_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Paper_Sp' +
        'ace\n1\n\n0\nENDBLK\n5\n1D\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockEnd\n0\nENDBLK\n5\n0\n330\n1F\n100\nAcDbEntity\n8\n0\n48\n0.0\n370\n     0\n62\n     0\n100\nAcDbB' +
        'lockEnd\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n5\n2F\n330\n17\n100\nAcDbEntity\n8\n0\n100\nAcDbPolyline\n90\n        6\n70\n     1\n43\n0.0\n10\n0.0\n20\n0.0\n42\n0.0\n' +
        '10\n3.0\n20\n0.0\n42\n0.0\n10\n3.0\n20\n2.0\n42\n0.0\n10\n0.0\n20\n2.0\n42\n0.0\n10\n0.0\n20\n1.5\n42\n-1.0\n10\n0.0\n20\n0.5\n42\n0.0\n0\nENDSEC\n0\nEOF',
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
        '.0\n0\nLINE\n5\nD\n330\n15\n100\nAcDbEntity\n8\nDIMS\n100\nAcDbLine\n10\n0.0\n20\n-1.0\n30\n0.0\n11\n2.0\n21\n-1.0\n31\n0.0\n0\nENDSEC\n0\nEOF',
      aflat:
        '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n9\n$TEXTSIZE\n40\n0.2\n9\n$HANDSEED\n5\n3C\n9\n$MEASUREMENT\n70\n     0\n9\n$INSUNITS\n70\n     1\n0' +
        '\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n2\n330\n0\n100\nAcDbSymbolTable\n70\n     7\n0\nLAYER\n5\n10\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableReco' +
        'rd\n2\n0\n70\n     0\n62\n     7\n6\nContinuous\n370\n    -3\n390\n0\n0\nLAYER\n5\n29\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nOUTLINE\n70\n     0\n62\n' +
        '     7\n6\nContinuous\n370\n    -3\n390\n0\n0\nLAYER\n5\n2A\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nHOLES\n70\n     0\n62\n     1\n6\nContinuous\n37' +
        '0\n    -3\n390\n0\n0\nLAYER\n5\n2B\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nBEND\n70\n     0\n62\n     3\n6\nCENTER\n370\n    -3\n390\n0\n0\nLAYER\n5\n2C' +
        '\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\nNOTES\n70\n     0\n62\n     5\n6\nContinuous\n370\n    -3\n390\n0\n0\nLAYER\n5\n2D\n330\n2\n100\nAcDbSymbolT' +
        'ableRecord\n100\nAcDbLayerTableRecord\n2\nBEND_UP\n70\n     0\n62\n     3\n6\nCENTER\n370\n    -3\n390\n0\n0\nLAYER\n5\n2E\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLayer' +
        'TableRecord\n2\nBEND_DOWN\n70\n     0\n62\n    30\n6\nCENTER\n370\n    -3\n390\n0\n0\nENDTAB\n0\nTABLE\n2\nSTYLE\n5\n3\n330\n0\n100\nAcDbSymbolTable\n70\n     1\n0\nSTYLE\n5\n11\n33' +
        '0\n3\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n2\nStandard\n70\n     0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n     0\n42\n2.5\n3\ntxt\n4\n\n0\nENDTAB\n0\nENDSEC\n0\nSEC' +
        'TION\n2\nBLOCKS\n0\nBLOCK\n5\n1C\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockBegin\n2\n*Paper_Space\n70\n     0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n*Paper_Space\n1\n\n0\nEN' +
        'DBLK\n5\n1D\n330\n1B\n100\nAcDbEntity\n67\n     1\n8\n0\n100\nAcDbBlockEnd\n0\nBLOCK\n5\n20\n330\n1F\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockBegin\n2\n*Model_Space\n70\n     0\n10\n0' +
        '.0\n20\n0.0\n30\n0.0\n3\n*Model_Space\n1\n\n0\nENDBLK\n5\n21\n330\n1F\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n5\n31\n330\n1F\n100' +
        '\nAcDbEntity\n8\nOUTLINE\n100\nAcDbPolyline\n90\n       20\n70\n     1\n43\n0.0\n10\n1.165164413293\n20\n1.015664413293\n10\n1.165164413293\n20\n0.955864413293\n10\n0.8960' +
        '64413293\n20\n0.955864413293\n10\n0.896064413293\n20\n0.0\n10\n4.776464413293\n20\n0.0\n10\n4.776464413293\n20\n1.165164413293\n10\n4.836264413293\n20\n1.165164413293\n1' +
        '0\n4.836264413293\n20\n0.896064413293\n10\n5.7921288265859\n20\n0.896064413293\n10\n5.7921288265859\n20\n3.776464413293\n10\n4.626964413293\n20\n3.776464413293\n10\n4.' +
        '626964413293\n20\n3.836264413293\n10\n4.896064413293\n20\n3.836264413293\n10\n4.896064413293\n20\n4.7921288265859\n10\n0.896064413293\n20\n4.7921288265859\n10\n0.8960' +
        '64413293\n20\n3.836264413293\n10\n1.165164413293\n20\n3.836264413293\n10\n1.165164413293\n20\n3.776464413293\n10\n0.0\n20\n3.776464413293\n10\n0.0\n20\n1.015664413293\n0' +
        '\nCIRCLE\n5\n32\n330\n1F\n100\nAcDbEntity\n8\nHOLES\n100\nAcDbCircle\n10\n1.896064413293\n20\n2.896064413293\n30\n0.0\n40\n0.125\n0\nLINE\n5\n33\n330\n1F\n100\nAcDbEntity\n8\nBEND' +
        '_UP\n100\nAcDbLine\n10\n4.896064413293\n20\n3.8440966199394\n30\n0.0\n11\n0.896064413293\n21\n3.8440966199394\n31\n0.0\n0\nTEXT\n5\n34\n330\n1F\n100\nAcDbEntity\n8\nNOTES\n100' +
        '\nAcDbText\n10\n2.896064413293\n20\n3.8640966199394\n30\n0.0\n40\n0.08\n1\nUP 90%%d R.060\n7\nStandard\n72\n     1\n11\n2.896064413293\n21\n3.8640966199394\n31\n0.0\n100\nAc' +
        'DbText\n0\nLINE\n5\n35\n330\n1F\n100\nAcDbEntity\n8\nBEND_UP\n100\nAcDbLine\n10\n4.8440966199394\n20\n3.776464413293\n30\n0.0\n11\n4.8440966199394\n21\n0.896064413293\n31\n0.' +
        '0\n0\nTEXT\n5\n36\n330\n1F\n100\nAcDbEntity\n8\nNOTES\n100\nAcDbText\n10\n4.8240966199394\n20\n2.336264413293\n30\n0.0\n40\n0.08\n1\nUP 90%%d R.060\n50\n90.0\n7\nStandard\n72\n  ' +
        '   1\n11\n4.8240966199394\n21\n2.336264413293\n31\n0.0\n100\nAcDbText\n0\nLINE\n5\n37\n330\n1F\n100\nAcDbEntity\n8\nBEND_UP\n100\nAcDbLine\n10\n4.776464413293\n20\n0.94803220' +
        '66465\n30\n0.0\n11\n0.896064413293\n21\n0.9480322066465\n31\n0.0\n0\nTEXT\n5\n38\n330\n1F\n100\nAcDbEntity\n8\nNOTES\n100\nAcDbText\n10\n2.836264413293\n20\n0.9680322066465\n3' +
        '0\n0.0\n40\n0.08\n1\nUP 90%%d R.060\n7\nStandard\n72\n     1\n11\n2.836264413293\n21\n0.9680322066465\n31\n0.0\n100\nAcDbText\n0\nLINE\n5\n39\n330\n1F\n100\nAcDbEntity\n8\nBEND_' +
        'UP\n100\nAcDbLine\n10\n0.9480322066465\n20\n1.015664413293\n30\n0.0\n11\n0.9480322066465\n21\n3.776464413293\n31\n0.0\n0\nTEXT\n5\n3A\n330\n1F\n100\nAcDbEntity\n8\nNOTES\n100\n' +
        'AcDbText\n10\n0.9280322066465\n20\n2.396064413293\n30\n0.0\n40\n0.08\n1\nUP 90%%d R.060\n50\n90.0\n7\nStandard\n72\n     1\n11\n0.9280322066465\n21\n2.396064413293\n31\n0.0' +
        '\n100\nAcDbText\n0\nTEXT\n5\n3B\n330\n1F\n100\nAcDbEntity\n8\nNOTES\n100\nAcDbText\n10\n0.0\n20\n-0.12\n30\n0.0\n40\n0.08\n1\nT=0.0598 R=0.0598 K=0.44  BLANK 5.7921 X 4.7921 ' +
        'IN\n7\nStandard\n11\n0.0\n21\n0.0\n31\n0.0\n100\nAcDbText\n0\nENDSEC\n0\nEOF'
    };
    // closed regions of imported entities: area (outer − holes) with each chord's circular segment added back, loops
    function rfKWloopArea(l, curves) {
      var A = K.signedArea(l.pts), s = A < 0 ? -1 : 1, a = Math.abs(A), n = l.pts.length;
      (l.seg || []).forEach(function (ci, i) {
        if (ci < 0 || !curves[ci]) return;
        var c = curves[ci].c, r = curves[ci].r, p = l.pts[i], q = l.pts[(i + 1) % n], h = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
        if (!(h > 0) || !(r > 0)) return;
        var th = 2 * Math.asin(Math.min(1, h / r)), seg = r * r / 2 * (th - Math.sin(th));
        var cr = (q[0] - p[0]) * (c[1] - p[1]) - (q[1] - p[1]) * (c[0] - p[0]);
        a += cr * s > 0 ? seg : -seg;
      });
      return a;
    }
    function rfKWimport(text, o) {
      var p = DI.parse(text, o && o.blocks ? { blocks: true } : undefined), r = DI.prepare(p, Object.assign({ partUnits: 'in' }, o || {}));
      var geo = r.entities.filter(function (e) { return e.t !== 'text' && e.t !== 'point'; });
      var pr = K.sketchProfile({ entities: geo }), area = 0;
      pr.loops.forEach(function (l) { area += (l.hole ? -1 : 1) * rfKWloopArea(l, pr.curves || []); });
      var by = {};
      r.entities.forEach(function (e) { by[e.t] = (by[e.t] || 0) + 1; });
      return { p: p, ents: r.entities, area: area, loops: pr.loops.length, cross: pr.loops.some(function (l) { return l.cross; }), by: by,
        open: DI.check(geo, 0.0005).filter(function (i) { return i.type === 'open' || i.type === 'gap'; }).length };
    }
    var PI = Math.PI;
    var CASES = [
      ['c13', 'a drawing\'s worth (R2000 DWG): XDATA, HATCH, a linear DIMENSION with its *D1 block, a frozen title frame, paper space with a title block and a VIEWPORT, a mirrored attributed INSERT', 10 - PI / 16, 4, function (r) {
        assert(r.p.layers.some(function (l) { return l.name === 'FROZEN' && l.frozen; }) && r.ents.every(function (e) { return e.layer !== 'FROZEN'; }), 'the frozen frame stays out');
        assert(r.p.warnings.some(function (w) { return /Skipped 5 entities in paper space/.test(w); }), 'paper space skipped: ' + r.p.warnings.join(' | '));
        assert(/1 dimension, 1 hatch and 1 attribute definition skipped/.test(r.p.skippedNote), 'quiet skips: ' + r.p.skippedNote);
        assert(!r.p.warnings.some(function (w) { return /^Skipped \d+ [A-Z0-9]/.test(w); }), 'no other entity skipped: ' + r.p.warnings.join(' | '));
        // the mirrored TAB (x scale −1; LibreDWG's writer left its y scale 0): a 1 × 1 square at x 19..20, not four dots
        assert(r.p.warnings.some(function (w) { return /1 block insertion with a scale of 0/.test(w); }), 'zero scale said');
        var tab = r.ents.filter(function (e) { return e.t === 'line' && Math.min(e.x1, e.x2) >= 19 - 1e-9; });
        assert(tab.length === 4 && tab.every(function (e) { return Math.hypot(e.x2 - e.x1, e.y2 - e.y1) > 0.999; }), 'TAB square: ' + JSON.stringify(tab));
        assert(r.ents.some(function (e) { return e.t === 'text' && e.str === 'A-17'; }), 'its attribute A-17 as Sketch Text');
        assert(r.ents.every(function (e) { var y = e.y1 != null ? e.y1 : e.cy; return e.t === 'text' || e.t === 'point' || (y > -1e-9 && y < 2 + 1e-9); }), 'no stray geometry from the *D1 block / the hatch / the VIEWPORT');
      }],
      ['c14', '3D (R2000 DWG): a tilted LINE, a LINE at z 5, a CIRCLE at elevation 2, a 3DFACE, beside a 1 × 1 square', 1 + PI / 4, 2, function (r) {
        assert(r.p.tilted === 1 && r.p.offZ === 2, 'tilted ' + r.p.tilted + ', off z ' + r.p.offZ);
        assert(r.p.warnings.some(function (w) { return /1 entity is not parallel to the XY plane \(3D\): projected onto it/.test(w); }) &&
          r.p.warnings.some(function (w) { return /2 entities lie off z = 0 \(3D, at another elevation\): placed on the sketch plane/.test(w); }) &&
          r.p.warnings.some(function (w) { return /Skipped 1 3DFACE/.test(w); }), 'warnings: ' + r.p.warnings.join(' | '));
      }, 0, 4],   // (the two 3D LINEs stand alone: 4 open ends)
      ['c11', 'extrusion 0, 0, −1 (R2000 DWG): ARC, CIRCLE, LWPOLYLINE with a bulge, mirrored as AutoCAD shows them', PI / 2 + PI / 16 + (1 - PI / 8), 3, function (r) {
        var c = r.ents.filter(function (e) { return e.t === 'circle'; })[0];
        near(c.cx, -3, 1e-12, 'circle x mirrored');
        var b = r.ents.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.5) < 1e-9; })[0];
        near(b.cx, -5.5, 1e-12, 'bulge arc centre');
        near(Math.sin((b.a0 + b.a1) / 2 * PI / 180), 1, 1e-9, 'the bulge bows into the square');
        assert(!r.p.tilted && !r.p.offZ && !r.p.warnings.length, 'no 3D warning for (0, 0, −1): ' + r.p.warnings.join(' | '));
      }],
      ['c05', 'ELLIPSE (R2000 DWG): a full one turned 30° and a half one closed by a LINE', 3 * PI, 2, null, 1e-5],
      ['c02', 'LWPOLYLINE with a concave bulge (R2000 DWG)', 6 - PI / 8, 1, null],
      ['c07', 'frozen and off layers (R2000 DWG)', 2, 1, function (r) {
        var t = r.p.layers.filter(function (l) { return l.name === 'TITLE'; })[0], d = r.p.layers.filter(function (l) { return l.name === 'DIMS'; })[0];
        assert(t && t.frozen && d && d.off && r.ents.every(function (e) { return e.layer === 'CUT'; }), 'layers ' + JSON.stringify(r.p.layers));
      }],
      ['aflat', 'Anvil\'s own flat (tray with a hole, bend layers split) through its DWG writer and back by dwg2dxf', 24.0027684656, 2, function (r) {
        assert(r.by.line === 24 && r.by.circle === 1 && r.by.text === 5, 'entities ' + JSON.stringify(r.by));
        assert(r.p.layers.map(function (l) { return l.name; }).join() === 'OUTLINE,HOLES,NOTES,BEND_UP', 'layers ' + JSON.stringify(r.p.layers));
        // bend lines on BEND_UP (bend layers split) come in as construction, as on BEND: no T-junctions on the outline
        var bl = r.ents.filter(function (e) { return e.layer === 'BEND_UP'; });
        assert(bl.length === 4 && bl.every(function (e) { return e.construction; }), 'BEND_UP construction: ' + JSON.stringify(bl).slice(0, 200));
      }]
    ];
    CASES.forEach(function (c) {
      test('rfKW: ' + c[1] + ': imports with the right area (analytic), every profile closed, nothing broken by handles / AcDb markers / XDATA / 210 groups; the same with blocks kept as blocks', function () {
        var out = [];
        [false, true].forEach(function (blk) {
          var r = rfKWimport(rfKWdxf(FX[c[0]]), { blocks: blk });
          assert(r.p.units === 'in' && r.p.unitsFrom === 'INSUNITS', 'units ' + r.p.units + ' / ' + r.p.unitsFrom);
          assert(!r.cross && r.open === (c[6] || 0), 'closed, no crossing: open ends ' + r.open);
          assert(r.loops === c[3], (blk ? 'blocks: ' : '') + 'loops ' + r.loops + ', expected ' + c[3]);
          near(r.area, c[2], c[5] || 1e-8, (blk ? 'blocks: ' : '') + 'area');
          if (c[4]) c[4](r);
          out.push(r.area.toFixed(6));
        });
        return 'area ' + out[0] + ', ' + c[3] + ' loop(s)';
      });
    });

    test('rfKW: units: a DWG with no $INSUNITS (0) is read by $MEASUREMENT: 0 (English) inches, 1 (metric) millimetres, and the assumption is said; neither: the part\'s units, nothing assumed', function () {
      var base = rfKWdxf(FX.c07);
      function withUnits(ins, meas) {
        var t = base.replace(/(\$INSUNITS\r\n *70\r\n) *\d+/, '$1' + ins);
        return meas == null ? t.replace(/\r\n *9\r\n\$MEASUREMENT\r\n *70\r\n *\d+/, '') : t.replace(/(\$MEASUREMENT\r\n *70\r\n) *\d+/, '$1' + meas);
      }
      assert(withUnits(0, 0) !== base, 'the fixture has $INSUNITS / $MEASUREMENT');
      var a = DI.parse(withUnits(0, 0));
      assert(a.units === 'in' && a.unitsFrom === 'MEASUREMENT' && a.warnings.some(function (w) { return /No units in the file \(\$INSUNITS 0\): taken as inches from \$MEASUREMENT 0 \(English\)/.test(w); }), 'MEASUREMENT 0: ' + a.units + ' ' + a.warnings.join(' | '));
      near(rfKWimport(withUnits(0, 0)).area, 2, 1e-12, 'inches into an inch part');
      var b = DI.parse(withUnits(0, 1));
      assert(b.units === 'mm' && b.unitsFrom === 'MEASUREMENT' && b.warnings.some(function (w) { return /taken as millimetres from \$MEASUREMENT 1 \(metric\)/.test(w); }), 'MEASUREMENT 1: ' + b.units);
      near(rfKWimport(withUnits(0, 1)).area, 2 / 25.4 / 25.4, 1e-12, 'millimetres into an inch part');
      var c = DI.parse(withUnits(0, null));
      assert(c.units == null && c.unitsFrom == null && !c.warnings.some(function (w) { return /No units/.test(w); }), 'neither: ' + c.units);
      var d = DI.parse(withUnits(4, 0));
      assert(d.units === 'mm' && d.unitsFrom === 'INSUNITS' && !d.warnings.some(function (w) { return /No units/.test(w); }), '$INSUNITS wins over $MEASUREMENT: ' + d.units);
    });

    test('rfKW: text a converter left without a height takes its style\'s fixed height, else $TEXTSIZE; an empty attribute (a title block\'s unfilled field) is no "skipped text" warning', function () {
      var hdr = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1', '9', '$TEXTSIZE', '40', '0.18', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'STYLE', '0', 'STYLE', '2', 'FIXED', '70', '0', '40', '0.25', '0', 'ENDTAB', '0', 'ENDSEC'];
      var ents = ['0', 'SECTION', '2', 'ENTITIES', '0', 'MTEXT', '8', '0', '10', '0', '20', '0', '30', '0', '40', '0', '1', 'NO HEIGHT',
        '0', 'TEXT', '8', '0', '10', '0', '20', '1', '30', '0', '40', '0.0', '7', 'FIXED', '1', 'FIXED STYLE',
        '0', 'INSERT', '8', '0', '66', '1', '2', 'TB', '10', '0', '20', '0', '30', '0', '0', 'ATTRIB', '8', '0', '10', '0', '20', '2', '30', '0', '40', '0.1', '1', '', '2', 'DWG_NO', '70', '0', '0', 'SEQEND', '8', '0',
        '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0', '0', 'ENDSEC'];
      var blk = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'TB', '70', '2', '10', '0', '20', '0', '30', '0', '3', 'TB', '0', 'ENDBLK', '8', '0', '0', 'ENDSEC'];
      var p = DI.parse(hdr.concat(blk, ents, ['0', 'EOF']).join('\n'));
      var tx = p.entities.filter(function (e) { return e.t === 'text'; });
      assert(tx.length === 2, 'texts ' + JSON.stringify(tx));
      near(tx.filter(function (e) { return e.str === 'NO HEIGHT'; })[0].h, 0.18, 1e-12, '$TEXTSIZE');
      near(tx.filter(function (e) { return e.str === 'FIXED STYLE'; })[0].h, 0.25, 1e-12, 'the style\'s height');
      assert(!p.warnings.some(function (w) { return /text entit/.test(w); }), 'no skipped-text warning: ' + p.warnings.join(' | '));
    });

    test('rfKW: with LibreDWG on this machine (vendor/libredwg or $ANVIL_LIBREDWG; skipped when absent, as on CI and in the browser): an Anvil flat DXF to DWG by dwg-writer.js and by LibreDWG\'s dxf2dwg (AutoCAD 2000) comes back through dwg2dxf as the same closed profile (area, loops, entities)', function () {
      var gm = typeof process !== 'undefined' && process && process.getBuiltinModule;
      if (!gm) return 'skipped: not under Node';
      var fs = gm('fs'), path = gm('path'), os = gm('os'), cp = gm('child_process');
      var dirs = [process.env.ANVIL_LIBREDWG, path.resolve('anvil/vendor/libredwg'), path.resolve('vendor/libredwg')].filter(Boolean);
      var dir = dirs.map(function (d) { return fs.existsSync(d) && fs.statSync(d).isFile() ? path.dirname(d) : d; }).filter(function (d) { return fs.existsSync(path.join(d, 'dwg2dxf.exe')) && fs.existsSync(path.join(d, 'dxf2dwg.exe')); })[0];
      if (!dir) return 'skipped: no LibreDWG (run anvil/vendor/get-libredwg.ps1)';
      var work = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-rfKW-')), n = 0;
      function run(exe, args) { var r = cp.spawnSync(path.join(dir, exe), args, { timeout: 30000, windowsHide: true, encoding: 'latin1' }); return r; }
      function back(dwgFile) {
        var out = dwgFile.replace(/\.dwg$/, '.back.dxf');
        run('dwg2dxf.exe', ['-y', '-o', out, dwgFile]);
        assert(fs.existsSync(out), 'dwg2dxf wrote ' + out);
        return fs.readFileSync(out, 'latin1');
      }
      try {
        var t = build('p.units("in");\np.sheet(0.0598, 0.0598, 0.44);\np.sketch("Top").rect(0, -2, 3, 2).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 1]], { lengthRef: "outer" });\np.hole("Top", 1, -1, 0.25, { offset: 0.0598 });\n');
        noErrors(t);
        var dxf = K.exportDXFFlat(K.flatPattern(t.model, t.build, t.mesh), 'in', { version: 'R2000' });
        var f1 = path.join(work, 'flat.dwg');
        fs.writeFileSync(f1, Buffer.from(DWG.fromDXF(dxf)));
        var a = rfKWimport(dxf), b = rfKWimport(back(f1));
        assert(JSON.stringify(a.by) === JSON.stringify(b.by) && a.loops === b.loops, 'flat: ' + JSON.stringify(a.by) + ' / ' + JSON.stringify(b.by));
        near(b.area, a.area, 1e-9, 'flat area');
        n++;
        // the same DXF through LibreDWG's own writer (the server's Save As DWG fallback); it wants a line end after EOF
        var f2 = path.join(work, 'flat2.dxf'), d2 = path.join(work, 'flat2.dwg');
        fs.writeFileSync(f2, dxf + '\r\n', 'latin1');
        run('dxf2dwg.exe', ['-y', '--as', 'r2000', '-o', d2, f2]);
        assert(fs.existsSync(d2), 'dxf2dwg wrote the DWG');
        var c = rfKWimport(back(d2));
        assert(c.loops === a.loops && c.open === 0, 'dxf2dwg: loops ' + c.loops + ', open ' + c.open);
        near(c.area, a.area, 1e-9, 'dxf2dwg area');
        n++;
      } finally { fs.rmSync(work, { recursive: true, force: true }); }
      return n + ' DWG files through ' + dir;
    });
  })();
  // --- end rfKW ---
