  // --- rfDN (2026-10-27, lane DN: drawing sections) --- Excluded components of an assembly section (engine), and an
  // angle dimension that follows its edges when the vertex they share moves.
  (function () {
    group('rfDN: section Excluded components, angle dimension follows a moved vertex');
    var DN = typeof Drawing !== 'undefined' ? Drawing : null;
    if (!DN) { test('drawing.js loads', function () { fail('Drawing is not defined'); }); return; }
    test('rfDN: Pinned plate assembly, section through both pins, Pin<1> excluded: no cap of it (area less one pin), its whole 8 x 20 outline drawn, the key differs from the plain cut; setSectionExcluded clears it', function () {
      if (typeof Assembly === 'undefined' || typeof buildAsm === 'undefined') return;
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
      var r = buildAsm(ex.code);
      assert(!Object.keys(r.errors).length, 'errors ' + JSON.stringify(r.errors));
      var pin = -1;
      r.model.components.forEach(function (c, i) { if (pin < 0 && c.name === 'Pin<1>') pin = i; });
      assert(pin >= 0, 'Pin<1>');
      var doc = DN.newDrawing(r.model, { date: '2026-10-27' });
      DN.standard3View(doc, r.mesh, r.model.units);
      var top = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var sv = DN.addSectionView(doc, r.mesh, top.id, { axis: 'h', at: -10, sign: 1, y: 30, excluded: [r.model.components[pin].id] });
      assert(JSON.stringify(sv.section.excluded) === JSON.stringify([String(r.model.components[pin].id)]), 'saved ' + JSON.stringify(sv.section));
      var sh = DN.compute(doc, r.mesh, r.model), w = sh.views.filter(function (x) { return x.view.id === sv.id; })[0];
      nearRel(w.section.area, 672 + 160, 1e-9, 'cut area without Pin<1>');
      assert(!w.content.caps.some(function (c) { return c.body === pin; }), 'no cap of Pin<1>');
      var b = [Infinity, Infinity, -Infinity, -Infinity];
      w.proj.lines.visible.forEach(function (l) { if ((l[4] || 0) !== pin) return; b = [Math.min(b[0], l[0], l[2]), Math.min(b[1], l[1], l[3]), Math.max(b[2], l[0], l[2]), Math.max(b[3], l[1], l[3])]; });
      nearRel(b[2] - b[0], 8, 1e-9, 'pin width'); nearRel(b[3] - b[1], 20, 1e-9, 'pin height');
      DN.setSectionExcluded(doc, sv.id, null);
      assert(!sv.section.excluded, 'cleared');
      var w2 = DN.compute(doc, r.mesh, r.model).views.filter(function (x) { return x.view.id === sv.id; })[0];
      nearRel(w2.section.area, 672 + 2 * 160, 1e-9, 'every pin cut again');
      var threw = false; try { DN.setSectionExcluded(doc, top.id, ['1']); } catch (e) { threw = true; }
      assert(threw, 'not a section view: refused');
    });
    test('rfDN: an angle dimension between the bottom edge and a 30° edge whose both ends move (the shared vertex slides along the bottom) reads 45° after the part changes, not dangling; back to 30°', function () {
      // the slanted edge starts at (d, 0) on the bottom edge and is 2 long; d moves with the angle
      function part(deg, d) {
        var a = deg * Math.PI / 180;
        return 'p.units("in"); p.sketch("Front").polyline([[' + d + ', 0], [4, 0], [4, 2.5], [' + (d + 2 * Math.cos(a)) + ', ' + 2 * Math.sin(a) + ']]).extrude(0.25);';
      }
      var r = build(part(30, 0.5));
      noErrors(r);
      var doc = DN.newDrawing(r.model, { date: '2026-10-27', scale: [1, 1] });
      DN.standard3View(doc, r.mesh, 'in');
      var id = doc.views.filter(function (v) { return v.role === 'front'; })[0].id, T = [0.5 + 2 * Math.cos(Math.PI / 6), 1];
      var ang = DN.addSmartDim(doc, id, { edge: [[0.5, 0], [4, 0]] }, { edge: [[0.5, 0], T] }, [1.5, 0.3], {});
      assert(ang && ang.kind === 'angle', 'a Smart angle');
      nearRel(ang.value, 30, 1e-6, 'angle at 30');
      function read(code) {
        var m = build(code); noErrors(m);
        var sh = DN.compute(doc, m.mesh, m.model);
        return sh.dims.filter(function (d) { return d.view === id && !d.auto; }).map(function (d) { return d.text + (d.dangling ? '!' : ''); }).join('|');
      }
      var t45 = read(part(45, 1));
      assert(t45 === '45°', 'after the change: ' + t45);
      var t30 = read(part(30, 0.5));
      assert(t30 === '30°', 'and back: ' + t30);
      var gone = read('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2.5).extrude(0.25);');
      assert(/!$/.test(gone), 'the slanted edge gone: dangling (' + gone + ')');
    });
  })();
