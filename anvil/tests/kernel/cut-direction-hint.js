  // ------------------------------------------------------------------ cut direction hint
  // Kernel.cutDirectionHint(model, sketchId, body): true = a new cut on that sketch should be reversed to go into
  // the body, false = forward already goes into it, null = undetermined (no body, the probe along the sketch normal
  // misses the body, the sketch plane lies inside the material, unknown sketch). It never throws.
  group('cut direction hint');
  var SHEET_FRONT = 'p.sketch("Front").rect(0, 0, 100, 60).extrude(2);\n'; // z ∈ [0, 2], n = +Z
  function hintFor(code, sketchCode) {
    var r = build(code + sketchCode);
    noErrors(r);
    var sk = r.model.features.filter(function (f) { return f.type === 'sketch'; }).pop();
    return { r: r, sketch: sk, hint: K.cutDirectionHint(r.model, sk.id, r.body) };
  }
  test('Kernel.cutDirectionHint exists', function () {
    assert(typeof K.cutDirectionHint === 'function', 'Kernel.cutDirectionHint is missing');
  });
  test('sketch on the top face (Front offset 2, normal away from the sheet): true', function () {
    var h = hintFor(SHEET_FRONT, 'p.sketch("Front", 2).rect(20, 20, 10, 10);');
    assert(h.hint === true, 'expected true, got ' + JSON.stringify(h.hint));
  });
  test('sketch on the bottom face (Front offset 0, normal into the sheet): false', function () {
    var h = hintFor(SHEET_FRONT, 'p.sketch("Front", 0).rect(20, 20, 10, 10);');
    assert(h.hint === false, 'expected false, got ' + JSON.stringify(h.hint));
  });
  test('sketch above the sheet (Front offset 10): true, the probe along −Z reaches the body', function () {
    var h = hintFor(SHEET_FRONT, 'p.sketch("Front", 10).circle(50, 30, 5);');
    assert(h.hint === true, 'expected true, got ' + JSON.stringify(h.hint));
  });
  test('sketch below the sheet (Front offset −10): false, the probe along +Z reaches the body', function () {
    var h = hintFor(SHEET_FRONT, 'p.sketch("Front", -10).circle(50, 30, 5);');
    assert(h.hint === false, 'expected false, got ' + JSON.stringify(h.hint));
  });
  test('sketch whose normal line misses the body (Right at x = −50, loop at y 20..30, z 30..40): null', function () {
    var h = hintFor(SHEET_FRONT, 'p.sketch("Right", -50).rect(-40, 20, 10, 10);');
    assert(h.hint === null, 'expected null, got ' + JSON.stringify(h.hint));
  });
  test('Top-plane box: sketch on the top face true, on the bottom face false, inside the material null', function () {
    var box = 'p.box(100, 60, 8);\n'; // y ∈ [0, 8], Top normal = +Y
    assert(hintFor(box, 'p.sketch("Top", 8).rect(20, -40, 10, 10);').hint === true, 'top face should be true');
    assert(hintFor(box, 'p.sketch("Top", 0).rect(20, -40, 10, 10);').hint === false, 'bottom face should be false');
    assert(hintFor(box, 'p.sketch("Top", 4).rect(20, -40, 10, 10);').hint === null, 'a plane inside the material should be null');
  });
  test('sketch on a face (custom plane from planeFromFace): true', function () {
    // the +Z face of the sheet, as "Sketch on a face" would build it: frame through (50, 30, 2) with n = +Z
    var pl = K.planeFromFace([0, 0, 1], [50, 30, 2]);
    var h = hintFor(SHEET_FRONT, 'p.sketch(' + JSON.stringify(pl) + ', 0).centerRect(0, 0, 10, 10);');
    assert(h.hint === true, 'expected true, got ' + JSON.stringify(h.hint));
    // the same frame flipped (n = −Z, on the bottom face): forward already goes into the sheet
    var pl2 = K.planeFromFace([0, 0, -1], [50, 30, 0]);
    var h2 = hintFor(SHEET_FRONT, 'p.sketch(' + JSON.stringify(pl2) + ', 0).centerRect(0, 0, 10, 10);');
    assert(h2.hint === true, 'a face frame on the bottom (n = −Z, pointing out of the sheet) should also be true, got ' + JSON.stringify(h2.hint));
  });
  test('null body, unknown sketch id, a non-sketch feature, no model: null, never throws', function () {
    var r = build(SHEET_FRONT + 'p.sketch("Front", 2).rect(20, 20, 10, 10);');
    var sk = r.model.features.filter(function (f) { return f.type === 'sketch'; }).pop();
    var ex = r.model.features.filter(function (f) { return f.type === 'extrude'; })[0];
    var out;
    try {
      assert(K.cutDirectionHint(r.model, sk.id, null) === null, 'null body should give null');
      assert(K.cutDirectionHint(r.model, 9999, r.body) === null, 'unknown sketch id should give null');
      assert(K.cutDirectionHint(r.model, ex.id, r.body) === null, 'a non-sketch feature should give null');
      out = K.cutDirectionHint(null, sk.id, r.body);
      assert(out === null, 'no model should give null, got ' + JSON.stringify(out));
      out = K.cutDirectionHint(r.model, null, r.body);
      assert(out === null, 'null sketch id should give null, got ' + JSON.stringify(out));
    } catch (e) {
      if (e && /should give/.test(e.message)) throw e;
      fail('cutDirectionHint threw: ' + ((e && e.message) || e));
    }
  });
  test('the hint agrees with what a cut actually does: reversed removes material, forward does not', function () {
    var h = hintFor(SHEET_FRONT, 'p.sketch("Front", 2).rect(20, 20, 10, 10);');
    var rev = build(SHEET_FRONT + 'p.sketch("Front", 2).rect(20, 20, 10, 10).cut("through", { reverse: true });');
    var fwd = build(SHEET_FRONT + 'p.sketch("Front", 2).rect(20, 20, 10, 10).cut("through", { reverse: false });');
    near(rev.body.volume(), 12000 - 200, 1e-9, 'reversed cut volume');
    near(fwd.body.volume(), 12000, 1e-9, 'forward cut volume (misses)');
    assert(h.hint === (rev.body.volume() < fwd.body.volume()), 'hint ' + JSON.stringify(h.hint) + ' disagrees with the cuts');
  });

