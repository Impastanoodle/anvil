  // --- rfHT (2026-11-04, lane bodydel: Delete/Keep Body) --- { type: 'deleteBody', keep?, bodies: [{ at }] }: each body
  // reference is a point on / inside the body (Kernel.bodyRefFor), resolved on every rebuild (Kernel.resolveBodyRefs);
  // delete mode drops the listed bodies, keep mode the rest; a reference that finds no body is a warning; deleting
  // every body leaves an empty part; suppressing the feature brings the bodies back; script round trip.
  // OpenCascade agrees (node anvil/headless/anvil.js build <file> --occt: same volumes, checked by the lane).
  (function () {
    group('rfHT: Delete/Keep Body');
    // two separate inch blocks: 2 x 3 x 1 (6 in³) and 1 x 1 x .5 with a Ø.5 through hole (.5 − π·.0625·.5 in³)
    var rfHTTwo = 'p.units("in");\np.sketch("Front").rect(0, 0, 2, 3).end().extrude(1);\np.sketch("Front").rect(4, 0, 1, 1).circle(4.5, 0.5, 0.25).end().extrude(0.5);\n';
    var rfHTA = 6, rfHTB = 0.5 - Math.PI * 0.0625 * 0.5;
    function rfHTLast(r) { return r.model.features[r.model.features.length - 1]; }
    function rfHTVols(r) { return r.build.bodies.map(function (b) { return K.massProps(K.meshFromBody(b)).volume; }); }

    test('rfHT: two blocks, delete the 2x3 one by a point inside it: 1 body, the other block\'s exact volume; Body-Delete/Keep1 in the tree', function () {
      var r0 = build(rfHTTwo);
      noErrors(r0);
      assert(r0.build.bodies.length === 2, 'two bodies before: ' + r0.build.bodies.length);
      var r = build(rfHTTwo + 'p.deleteBody([[1, 1.5, 0.5]]);');
      noErrors(r);
      assert(r.build.bodies.length === 1, 'one body left: ' + r.build.bodies.length);
      nearRel(r.mp.volume, rfHTB, 1e-6, 'the holed block is left');
      assert(rfHTLast(r).name === 'Body-Delete/Keep1', 'name ' + rfHTLast(r).name);
      assert(!K.isCut(rfHTLast(r), r.model), 'not a cut');
      assert(!Object.keys(r.warnings).length, 'no warnings: ' + JSON.stringify(r.warnings));
      return 'left ' + fmt(r.mp.volume);
    });

    test('rfHT: keep mode keeps the listed body and deletes the rest; a point on the body\'s face resolves too', function () {
      var r = build(rfHTTwo + 'p.deleteBody([[1, 1.5, 0.5]], { keep: true });');
      noErrors(r);
      assert(r.build.bodies.length === 1, 'one body: ' + r.build.bodies.length);
      nearRel(r.mp.volume, rfHTA, 1e-9, 'the 2x3 block kept');
      var r2 = build(rfHTTwo + 'p.deleteBody([[4, 0.5, 0.25]]);');   // on the holed block's x = 4 face
      assert(r2.build.bodies.length === 1, 'face point: one body');
      nearRel(r2.mp.volume, rfHTA, 1e-9, 'face point deleted the holed block');
      return 'kept ' + fmt(r.mp.volume);
    });

    test('rfHT: both bodies listed: an empty part (allowed, no error); suppress brings both back', function () {
      var r = build(rfHTTwo + 'p.deleteBody([[1, 1.5, 0.5], [4.9, 0.9, 0.25]]);');
      noErrors(r);
      assert(r.build.bodies.length === 0 && !r.build.body, 'empty part');
      rfHTLast(r).suppressed = true;
      var b = K.rebuild(r.model);
      assert(b.bodies.length === 2, 'suppressed: two bodies back, got ' + b.bodies.length);
      var v = b.bodies.map(function (x) { return K.massProps(K.meshFromBody(x)).volume; }).sort(function (a, c) { return a - c; });
      nearRel(v[0], rfHTB, 1e-6, 'holed block'); nearRel(v[1], rfHTA, 1e-9, 'big block');
      return 'ok';
    });

    test('rfHT: a reference that finds no body is a warning and removes nothing; an empty list is an error', function () {
      var r = build(rfHTTwo + 'p.deleteBody([[20, 20, 20]]);');
      assert(!Object.keys(r.errors).length, 'no error: ' + JSON.stringify(r.errors));
      assert(/could not be found|None of the selected bodies/.test(r.warnings[rfHTLast(r).id] || ''), 'warning: ' + r.warnings[rfHTLast(r).id]);
      assert(r.build.bodies.length === 2, 'both bodies stay');
      var r2 = build(rfHTTwo + 'p.deleteBody([[1, 1.5, 0.5], [20, 20, 20]]);');
      assert(r2.build.bodies.length === 1 && /1 of the selected bodies/.test(r2.warnings[rfHTLast(r2).id] || ''), 'one found, one missing: ' + r2.warnings[rfHTLast(r2).id]);
      var r3 = build(rfHTTwo + 'p.deleteBody([[20, 20, 20]], { keep: true });');
      assert(r3.build.bodies.length === 2 && /No body was removed/.test(r3.warnings[rfHTLast(r3).id] || ''), 'keep with nothing found keeps all');
      var r4 = build(rfHTTwo + 'p.deleteBody([]);');
      assert(/Select the bodies to delete/.test(r4.errors[rfHTLast(r4).id] || ''), 'empty list error: ' + JSON.stringify(r4.errors));
      return 'ok';
    });

    test('rfHT: the reference follows its body: a third body added before it shifts the indices, the same point still deletes the 2x3 block', function () {
      var pre = 'p.units("in");\np.sketch("Front").rect(-6, 0, 1, 1).end().extrude(1);\n' + rfHTTwo.replace('p.units("in");\n', '');
      var r = build(pre + 'p.deleteBody([[1, 1.5, 0.5]]);');
      noErrors(r);
      assert(r.build.bodies.length === 2, 'two left: ' + r.build.bodies.length);
      nearRel(r.mp.volume, 1 + rfHTB, 1e-6, 'the 1 in³ cube and the holed block stay');
      return 'ok';
    });

    test('rfHT: bodyRefFor gives a point that resolves back to its body, also for two bodies sharing a face (merge: false)', function () {
      var r = build('p.sketch("Front").rect(0, 0, 10, 10).end().extrude(10);\np.sketch("Front").rect(10, 0, 10, 10).end().extrude(10, { merge: false });');
      assert(r.build.bodies.length === 2, 'two bodies sharing the x = 10 face');
      [0, 1].forEach(function (i) {
        var ref = K.bodyRefFor(r.build.bodies, i, 'mm');
        assert(ref && K.resolveBodyRefs([ref], r.build.bodies, 'mm')[0] === i, 'body ' + i + ': ' + JSON.stringify(ref));
        var rr = build('p.sketch("Front").rect(0, 0, 10, 10).end().extrude(10);\np.sketch("Front").rect(10, 0, 10, 10).end().extrude(10, { merge: false });\np.deleteBody([' + JSON.stringify(ref.at) + ']);');
        assert(rr.build.bodies.length === 1, 'deleted one');
        var bb = rr.build.bodies[0].getBounds();
        near(bb.min[0], i === 0 ? 10 : 0, 1e-9, 'the other body stays (' + i + ')');
      });
      return 'ok';
    });

    test('rfHT: script round trip (delete and keep), and bare body indices', function () {
      [rfHTTwo + 'p.deleteBody([[1, 1.5, 0.5]], { name: "Drop" });', rfHTTwo + 'p.deleteBody([[1, 1.5, 0.5]], { keep: true });', rfHTTwo + 'p.deleteBody([1]);'].forEach(function (code, k) {
        var r = build(code), s = K.generateScript(r.model);
        assert(/p\.deleteBody\(/.test(s), 'script has deleteBody: ' + s);
        var r2 = build(s);
        noErrors(r2);
        assert(JSON.stringify(rfHTLast(r2).bodies) === JSON.stringify(rfHTLast(r).bodies) && !!rfHTLast(r2).keep === !!rfHTLast(r).keep && rfHTLast(r2).name === rfHTLast(r).name, 'same feature ' + k + ': ' + JSON.stringify(rfHTLast(r2)));
        nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'same volume ' + k);
      });
      var ri = build(rfHTTwo + 'p.deleteBody([1]);');
      nearRel(ri.mp.volume, rfHTA, 1e-9, 'index 1 = the holed block');
      return 'ok';
    });

    test('rfHT: pack / unpack and the incremental rebuild carry the deleted state', function () {
      var r = build(rfHTTwo + 'p.deleteBody([[1, 1.5, 0.5]]);');
      var u = K.unpackBuild(K.packBuild(r.build));
      assert(u && u.bodies && u.bodies.length === 1, 'unpacked: one body');
      var again = K.rebuild(r.model, r.build.cache);
      assert(again.reused === r.model.features.length && again.bodies.length === 1, 'cache reused all ' + again.reused);
      return 'ok';
    });
  })();
