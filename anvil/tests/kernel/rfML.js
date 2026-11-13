  // --- rfML (2026-11-13, lane ML testflakes) --- DxfCheck.audit's duplicate check on filled SOLIDs: before, a SOLID
  // kept no geometry when parsed, so any two SOLIDs on one layer read as duplicates. They are duplicates only when their
  // four corners match.
  (function () {
    group('rfML: DxfCheck SOLID duplicates');
    test('rfML: DxfCheck.audit: two SOLIDs on one layer with different corners are not duplicates; the same corners twice are', function () {
      if (typeof DxfCheck === 'undefined' || !DxfCheck.audit) fail('DxfCheck.audit is not loaded');
      var t = build('p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, 0, 4, 3).end().baseFlange();\n');
      noErrors(t);
      var r12 = K.exportDXFFlat(K.flatPattern(t.model, t.build, t.mesh), 'in', {});
      function solid(x, y) { return '0\nSOLID\n8\nNOTES\n10\n' + x + '\n20\n' + y + '\n30\n0\n11\n' + (x + 0.5) + '\n21\n' + y + '\n31\n0\n12\n' + x + '\n22\n' + (y + 0.25) + '\n32\n0\n13\n' + (x + 0.5) + '\n23\n' + (y + 0.25) + '\n33\n0\n'; }
      function errs(add) { return DxfCheck.audit(r12.replace('2\nENTITIES\n', '2\nENTITIES\n' + add), { units: 'in' }).errors.join(' | '); }
      var two = errs(solid(1, 1) + solid(2, 1)), same = errs(solid(1, 1) + solid(1, 1)), check = DxfCheck.check(r12.replace('2\nENTITIES\n', '2\nENTITIES\n' + solid(1, 1) + solid(2, 1)), { layers: ['NOTES'] }).errors.join(' | ');
      assert(!/duplicate SOLID/.test(two), 'two different SOLIDs: ' + two);
      assert(/duplicate SOLID on NOTES/.test(same), 'the same SOLID twice: ' + same);
      assert(!/duplicate SOLID/.test(check), 'check(): two different SOLIDs: ' + check);
      return 'different corners: no duplicate; same corners: ' + same.match(/duplicate SOLID on NOTES/)[0];
    });
  })();
