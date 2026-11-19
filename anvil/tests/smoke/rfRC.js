  // --- rfRC (2026-11-19, head; a customer's wireframe-only STEP opened with the OpenCascade kernel on) --- File > Open
  // went straight to OpenCascade, whose refusal ("The file has no solid bodies (surfaces only?)") says less than Anvil's
  // own reader does (wireframe only, how many curves, save them as a DXF). The open now asks Anvil's reader what the
  // file holds when OpenCascade finds no solid. Synthetic file; the kernel setting is put back.
  (function () {
    function rfRCWire() {
      return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('wire.step','2026-11-19',(''),(''),'','','');", "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));", 'ENDSEC;', 'DATA;',
        "#1=CARTESIAN_POINT('',(0.,0.,0.));", "#2=DIRECTION('',(1.,0.,0.));", "#3=DIRECTION('',(0.,0.,1.));", "#4=VECTOR('',#2,10.);", "#5=LINE('',#1,#4);",
        "#6=AXIS2_PLACEMENT_3D('',#1,#3,#2);", "#7=CIRCLE('',#6,5.);", "#8=GEOMETRIC_CURVE_SET('',(#5,#7));",
        "#9=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));", "#10=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));", "#11=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());",
        "#12=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-5),#9,'','');",
        "#13=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#12))GLOBAL_UNIT_ASSIGNED_CONTEXT((#9,#10,#11))REPRESENTATION_CONTEXT('',''));",
        "#14=GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION('',(#8),#13);", 'ENDSEC;', 'END-ISO-10303-21;'].join('\n');
    }
    step('rfRC: a wireframe-only STEP opened with the OpenCascade kernel on is refused in Anvil\'s own words (wireframe, the curve count, the DXF way out), and the part that was open stays', async function () {
      if (!(UI.occt && UI.occt.canImport && UI.occt.canImport())) return 'skipped: no OpenCascade engine here';
      var was = UI.occt.on(), errs0 = errors.length;
      try {
        await anvil.newPart(); await idle();
        await anvil.run('p.units("in"); p.sketch("Top").centerRect(0, 0, 2, 1).extrude(0.25);'); await idle();
        var vol = anvil.mass().volume;
        UI.occt.set(true); await idle();
        var msg = '';
        try { await anvil.importFile('wire.step', rfRCWire()); } catch (e) { msg = String(e && e.message || e); }
        assert(/No solid bodies/.test(msg) && /only wireframe geometry \(2 curves, no faces\)/.test(msg) && /DXF/.test(msg), 'the refusal: ' + msg);
        await idle();
        near(anvil.mass().volume, vol, 1e-9, 'the open part is still there');
        assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
        return msg.slice(0, 90);
      } finally { UI.occt.set(was); await idle(); }
    });
  })();
