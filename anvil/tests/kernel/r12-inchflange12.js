  // --- r12/inchflange12: inch flanges fold the way the pick says. The top face of a sheet whose thickness sits on a
  // 0.01 rounding boundary (0.035, 0.045, 0.075, 0.125 in) was split in two by meshFromBody once a cut had touched it,
  // the picked edge vanished from flangeLayout's candidates and the pick fell on the edge on the other side of the
  // sheet (T away, inside the old 0.5-unit tolerance): the flange folded down instead of up ---
  (function () {
    group('r12/inchflange12: inch flange edge picks (thin sheets, faces with cut fragments, the opposite edge T away)');
    // the U-bracket example scaled to inches: a slot through the base before the two legs
    function uBracket(T, slot) {
      return 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -2.4, 4.8, 2.4).end().baseFlange();\n' +
        (slot ? 'p.sketch("Top", ' + T + ').slot(1.6, -1.2, 3.2, -1.2, 0.36).cut("through", { reverse: true });\n' : '') +
        'p.flange(1.6, [[0, ' + T + ', 1.2]]);\np.flange(1.6, [[4.8, ' + T + ', 1.2]]);';
    }
    test('inch U-bracket (slot cut before the legs) at T = 0.035 / 0.075 / 0.125: both legs fold up, the slot takes exactly its own volume', function () {
      var out = [];
      [0.035, 0.0598, 0.075, 0.125].forEach(function (T) {
        var r = build(uBracket(T, true)), plain = build(uBracket(T, false)), base = build('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -2.4, 4.8, 2.4).end().baseFlange();');
        noErrors(r); noErrors(plain);
        var bb = r.mp.bbox, R = T;
        near(bb.min[1], 0, 1e-9, T + ': nothing below the base (a leg folded down)');
        near(bb.max[1], T + R + 1.6, 1e-9, T + ': legs stand L + R + T');
        near(bb.min[0], -(R + T), 1e-9, T + ': left leg outside x = 0');
        near(bb.max[0], 4.8 + R + T, 1e-9, T + ': right leg outside x = 4.8');
        // the slot (a 1.6 × 0.36 obround through T) is all the two parts differ by
        var slotV = (1.6 * 0.36 + Math.PI * 0.18 * 0.18) * T, legs = plain.mp.volume - base.mp.volume;
        nearRel(r.mp.volume, base.mp.volume - slotV + legs, 2e-3, T + ': volume = base − slot + the plain part\'s legs');
        out.push(T + ' ' + fmt(bb.max[1]));
      });
      return out.join(', ');
    });
    test('a flange picked on the top or the bottom edge of a cut 0.045 / 0.075 in sheet folds up or down; a pick on an edge of the far side is never taken for it', function () {
      var n = 0;
      [0.045, 0.075, 2.005].forEach(function (T) {
        var mm = T > 1, s = mm ? 25 : 1, W = 4 * s, D = 3 * s;
        var head = 'p.units("' + (mm ? 'mm' : 'in') + '");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -' + D + ', ' + W + ', ' + D + ').end().baseFlange();\n' +
          'p.sketch("Top", ' + T + ').slot(' + W / 3 + ', -' + D / 2 + ', ' + 2 * W / 3 + ', -' + D / 2 + ', ' + 0.3 * s + ').cut("through", { reverse: true });\n' +
          'p.hole("Top", ' + 0.5 * s + ', -' + 0.5 * s + ', ' + 0.25 * s + ', { offset: ' + T + ' });\n';
        [[0, D / 2], [W, D / 2], [W / 2, 0], [W / 2, D]].forEach(function (xz) {
          [T, 0].forEach(function (y) {
            var r = build(head + 'p.flange(' + s + ', [[' + xz[0] + ', ' + y + ', ' + xz[1] + ']]);');
            noErrors(r);
            var bb = r.mp.bbox, tag = T + ' edge ' + xz + ' on the ' + (y ? 'top' : 'bottom');
            if (y) { near(bb.min[1], 0, 1e-9, tag + ': folds up'); near(bb.max[1], 2 * T + s, 1e-9, tag + ': L + R + T tall'); }
            else { near(bb.max[1], T, 1e-9, tag + ': folds down'); near(bb.min[1], T - (2 * T + s), 1e-9, tag + ': L + R + T below'); }
            n++;
          });
        });
      });
      return n + ' flanges';
    });
    test('a pick is resolved within 0.75·T of an edge (inch and mm alike): a little off the edge still finds it, 0.9·T away from every edge is refused, never snapped to the opposite edge', function () {
      [[0.048, 'in'], [2, 'mm']].forEach(function (c) {
        var T = c[0], s = c[1] === 'mm' ? 25 : 1;
        var head = 'p.units("' + c[1] + '");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -' + 3 * s + ', ' + 4 * s + ', ' + 3 * s + ').end().baseFlange();\n';
        // 0.3·T down the side face from the top edge: still the top edge (fold up)
        var r = build(head + 'p.flange(' + s + ', [[0, ' + 0.7 * T + ', ' + 1.5 * s + ']]);');
        noErrors(r); near(r.mp.bbox.min[1], 0, 1e-9, c[1] + ': 0.3·T off the top edge folds up');
        // 0.9·T out from the top edge, in the sheet plane: 0.9·T from the top edge, 1.35·T from the bottom one
        var far = build(head + 'p.flange(' + s + ', [[' + (-0.9 * T) + ', ' + T + ', ' + 1.5 * s + ']]);');
        var msg = Object.keys(far.errors).map(function (k) { return far.errors[k]; }).join(' | ');
        assert(/No edge selected/.test(msg), c[1] + ': a pick 0.9·T from every edge is refused, got ' + JSON.stringify(far.errors));
      });
      return 'ok';
    });
  })();
  // --- end r12/inchflange12 ---
  group('levels: the Levels Manager table survives the script round trip');
  test('p.levels(list, main) and generateScript keep numbers, names, sets and the main level', function () {
    var lv = [{ number: 1 }, { number: 2, name: 'ETCH', noProfile: true, set: 'MARKING' }, { number: 10, name: 'BEND', noProfile: true, lineType: 'dashed', set: 'MARKING' }];
    var a = build('p.name("L").units("in");\np.levels(' + JSON.stringify(lv) + ', 2);\np.box(1,1,1);');
    noErrors(a);
    var s = K.generateScript(a.model);
    assert(s.indexOf('p.levels(') > 0, 'written: ' + s.split('\n').slice(0, 3).join(' | '));
    var b = build(s);
    noErrors(b);
    assert(JSON.stringify(b.model.levels) === JSON.stringify(lv) && b.model.mainLevel === 2, 'kept: ' + JSON.stringify([b.model.levels, b.model.mainLevel]));
  });

