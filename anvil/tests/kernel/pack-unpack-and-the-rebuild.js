  // ------------------------------------------------------------------ pack / unpack and the rebuild worker
  group('pack & worker');
  // Mirrors the "Sheet Metal Bracket" entry of EXAMPLES in ui-app.js (this page does not load the UI).
  var BRACKET = 'p.name("Sheet Bracket");\n' +
    'p.sheet(2, 2, 0.71);\n' +
    'p.sketch("Top").centerRect(0, 0, 100, 60).end().baseFlange(2);\n' +
    'p.sketch("Top", 10).circle(0, 0, 6).cut("through", { reverse: true });\n' +
    'p.flange(20, [[0, 2, 30]]);\n' +
    'p.flange(15, [[50, 2, 0]], { reverse: true });\n';
  function bracketModel() { var m = K.newModel('Bracket'); K.runScript(m, BRACKET); return m; }
  function firstVertex(c) { var p = c.toPolygons()[0].vertices[0].pos; return [p.x, p.y, p.z]; }
  function cloneOf(o) { return JSON.parse(JSON.stringify(o)); }
  function keysOf(o) { return Object.keys(o || {}).sort().join(','); }
  test('CSG.pack / unpack round-trips a boolean result exactly', function () {
    var r = build('p.box(40, 30, 20);\np.hole("Top", 20, -15, 8, { offset: 20 });');
    noErrors(r);
    var c = r.body, packed = c.pack();
    assert(packed && typeof packed === 'object' && !(packed instanceof CSG), 'pack() must return a plain object, got ' + Object.prototype.toString.call(packed));
    var u = CSG.unpack(packed);
    assert(u instanceof CSG, 'unpack() must return a CSG');
    assert(u.volume() === c.volume(), 'volume must survive exactly: ' + u.volume() + ' vs ' + c.volume());
    var cp = c.toPolygons(), up = u.toPolygons();
    assert(up.length === cp.length, 'polygon count ' + up.length + ' vs ' + cp.length);
    nearVec(firstVertex(u), firstVertex(c), 0, 'first vertex');
    for (var i = 0; i < cp.length; i++) {
      assert(up[i].vertices.length === cp[i].vertices.length, 'polygon ' + i + ': vertex count ' + up[i].vertices.length + ' vs ' + cp[i].vertices.length);
      near(up[i].plane.w, cp[i].plane.w, 1e-12, 'polygon ' + i + ' plane w');
      nearVec([up[i].plane.normal.x, up[i].plane.normal.y, up[i].plane.normal.z], [cp[i].plane.normal.x, cp[i].plane.normal.y, cp[i].plane.normal.z], 1e-12, 'polygon ' + i + ' plane normal');
      var lp = up[i].vertices[up[i].vertices.length - 1].pos, lc = cp[i].vertices[cp[i].vertices.length - 1].pos;
      nearVec([lp.x, lp.y, lp.z], [lc.x, lc.y, lc.z], 0, 'polygon ' + i + ' last vertex (vertex order)');
    }
    // a boolean on the unpacked body behaves like one on the original
    var tool = cube(20, 10, 10, 3);
    var v0 = c.subtract(tool).volume(), v1 = u.subtract(tool).volume();
    near(v1, v0, 1e-9, 'subtract on the unpacked body');
    assert(Math.abs(v0 - c.volume()) > 1, 'the tool must actually remove material (' + fmt(c.volume() - v0) + ')');
    return cp.length + ' polygons, volume ' + fmt(c.volume()) + ', minus tool ' + fmt(v1);
  });
  test('packBuild / unpackBuild carry the Sheet Metal Bracket build and its flat pattern', function () {
    var model = bracketModel();
    var b = K.rebuild(model);
    noErrors({ errors: b.errors });
    var packed = K.packBuild(b);
    assert(packed && packed.bodies && packed.bodies.length === 1 && packed.tools && packed.profiles && packed.flanges, 'packBuild shape: ' + keysOf(packed) + ' (bodies: ' + (packed.bodies && packed.bodies.length) + ')');
    var u = K.unpackBuild(packed);
    assert(u.cache === null, 'unpacked build must have cache: null, got ' + typeof u.cache);
    assert(u.body instanceof CSG, 'unpacked body is a CSG');
    assert(u.body.volume() === b.body.volume(), 'body volume exact: ' + u.body.volume() + ' vs ' + b.body.volume());
    var mesh0 = K.meshFromBody(b.body), mesh1 = K.meshFromBody(u.body);
    var mp0 = K.massProps(mesh0, model.density), mp1 = K.massProps(mesh1, model.density);
    near(mp1.volume, mp0.volume, 1e-9, 'massProps volume');
    assert(mesh1.faces.length === mesh0.faces.length, 'face count ' + mesh1.faces.length + ' vs ' + mesh0.faces.length);
    assert(keysOf(u.tools) === keysOf(b.tools), 'tool ids: ' + keysOf(u.tools) + ' vs ' + keysOf(b.tools));
    Object.keys(b.tools).forEach(function (id) {
      if (b.tools[id]) assert(u.tools[id] instanceof CSG && u.tools[id].volume() === b.tools[id].volume(), 'tool ' + id + ' volume');
      else assert(!u.tools[id], 'tool ' + id + ' should stay empty');
    });
    assert(keysOf(u.flanges) === keysOf(b.flanges), 'flange feature ids: ' + keysOf(u.flanges) + ' vs ' + keysOf(b.flanges));
    var nFl = 0;
    Object.keys(b.flanges).forEach(function (id) {
      assert(u.flanges[id].length === b.flanges[id].length, 'flange ' + id + ': ' + u.flanges[id].length + ' records vs ' + b.flanges[id].length);
      b.flanges[id].forEach(function (fi, k) {
        var fu = u.flanges[id][k];
        near(fu.angle, fi.angle, 0, 'flange ' + id + '[' + k + '].angle'); near(fu.R, fi.R, 0, '.R'); near(fu.L, fi.L, 0, '.L');
        nearVec(fu.a, fi.a, 0, 'flange ' + id + '[' + k + '].a'); nearVec(fu.b, fi.b, 0, '.b'); nearVec(fu.o, fi.o, 0, '.o'); nearVec(fu.u, fi.u, 0, '.u');
        nFl++;
      });
    });
    assert(nFl === 2, 'bracket has two flange records, got ' + nFl);
    assert(keysOf(u.planes) === keysOf(b.planes), 'planes: ' + keysOf(u.planes) + ' vs ' + keysOf(b.planes));
    assert(keysOf(u.errors) === keysOf(b.errors) && keysOf(u.warnings) === keysOf(b.warnings), 'error/warning keys differ: ' + JSON.stringify([u.errors, u.warnings]) + ' vs ' + JSON.stringify([b.errors, b.warnings]));
    assert(typeof u.time === 'number' && typeof u.reused === 'number', 'time/reused are numbers');
    // profiles: one per sketch feature, and applyProfiles puts them back on a model that never built
    var sketches = model.features.filter(function (f) { return f.type === 'sketch'; });
    assert(sketches.length >= 2, 'the bracket has sketches');
    sketches.forEach(function (f) { assert(u.profiles && u.profiles[f.id] != null, 'profiles lacks sketch ' + f.id + ' (have ' + keysOf(u.profiles) + ')'); });
    var fresh = bracketModel();
    fresh.features.forEach(function (f) { if (f.type === 'sketch') delete f.profile; });
    K.applyProfiles(fresh, u.profiles);
    sketches.forEach(function (f) {
      var g = K.findFeature(fresh, f.id);
      assert(g && g.profile && g.profile.loops, 'applyProfiles did not set the profile of sketch ' + f.id);
      assert(g.profile.loops.length === f.profile.loops.length, 'sketch ' + f.id + ': ' + g.profile.loops.length + ' loops vs ' + f.profile.loops.length);
    });
    // the flat pattern unfolds from the unpacked build exactly as from the original
    var f0 = K.flatPattern(model, b, mesh0), f1 = K.flatPattern(model, u, mesh1);
    assert(f1.loops.length === f0.loops.length && f1.loops.length === 2, 'flat loops ' + f1.loops.length + ' vs ' + f0.loops.length);
    assert(f1.bends.length === f0.bends.length && f1.bends.length === 2, 'flat bends ' + f1.bends.length + ' vs ' + f0.bends.length);
    f0.loops.forEach(function (l, i) { assert(f1.loops[i].length === l.length, 'flat loop ' + i + ' points ' + f1.loops[i].length + ' vs ' + l.length); });
    for (var k = 0; k < 2; k++) { near(f1.bbox.min[k], f0.bbox.min[k], 1e-9, 'flat bbox.min[' + k + ']'); near(f1.bbox.max[k], f0.bbox.max[k], 1e-9, 'flat bbox.max[' + k + ']'); }
    near(K.signedArea(f1.loops[0]), K.signedArea(f0.loops[0]), 1e-9, 'flat outline area');
    return Object.keys(b.tools).length + ' tools, ' + nFl + ' flange records, ' + sketches.length + ' profiles, flat ' + fmt(f1.bbox.max[0] - f1.bbox.min[0]) + ' × ' + fmt(f1.bbox.max[1] - f1.bbox.min[1]);
  });
  test('a packed build survives structured cloning through a MessageChannel', function () {
    var model = bracketModel(), b = K.rebuild(model), packed = K.packBuild(b), vol = b.body.volume();
    if (typeof MessageChannel === 'undefined') fail('MessageChannel is not available in this browser');
    return new Promise(function (resolve, reject) {
      var ch = new MessageChannel();
      ch.port2.onmessage = function (ev) {
        try {
          var u = K.unpackBuild(ev.data);
          assert(u.body instanceof CSG, 'cloned body unpacks to a CSG');
          assert(u.body.volume() === vol, 'volume after cloning ' + u.body.volume() + ' vs ' + vol);
          assert(keysOf(u.tools) === keysOf(b.tools), 'tools after cloning: ' + keysOf(u.tools) + ' vs ' + keysOf(b.tools));
          assert(keysOf(u.flanges) === keysOf(b.flanges), 'flanges after cloning: ' + keysOf(u.flanges) + ' vs ' + keysOf(b.flanges));
          assert(keysOf(u.profiles) === keysOf(packed.profiles), 'profiles after cloning: ' + keysOf(u.profiles) + ' vs ' + keysOf(packed.profiles));
          assert(keysOf(u.errors) === keysOf(b.errors) && keysOf(u.warnings) === keysOf(b.warnings), 'errors/warnings after cloning');
          resolve('cloned build unpacks to volume ' + fmt(u.body.volume()));
        } catch (e) { reject(e); } finally { ch.port1.close(); ch.port2.close(); }
      };
      try { ch.port1.postMessage(packed); } catch (e) { reject(new Error('packed build is not structured-clone safe: ' + (e && e.message))); }
    });
  });
  test('packTransferables lists ArrayBuffers so a packed CSG can be transferred instead of copied', function () {
    var model = bracketModel(), b = K.rebuild(model), vol = b.body.volume();
    var pk = b.body.pack(), bufs = CSG.packTransferables(pk);
    assert(Array.isArray(bufs) && bufs.length > 0, 'packTransferables must return a non-empty array, got ' + Object.prototype.toString.call(bufs));
    bufs.forEach(function (x, i) { assert(x instanceof ArrayBuffer, 'transferable ' + i + ' is not an ArrayBuffer: ' + Object.prototype.toString.call(x)); });
    var seen = []; bufs.forEach(function (x) { assert(seen.indexOf(x) < 0, 'the same ArrayBuffer is listed twice (postMessage would throw)'); seen.push(x); });
    return new Promise(function (resolve, reject) {
      var ch = new MessageChannel();
      ch.port2.onmessage = function (ev) {
        try {
          var u = CSG.unpack(ev.data);
          assert(u.volume() === vol, 'volume after transfer ' + u.volume() + ' vs ' + vol);
          resolve(bufs.length + ' buffers transferred, volume ' + fmt(u.volume()));
        } catch (e) { reject(e); } finally { ch.port1.close(); ch.port2.close(); }
      };
      try { ch.port1.postMessage(pk, bufs); } catch (e) { reject(new Error('postMessage with the transfer list threw: ' + (e && e.message))); }
    });
  });
  // cacheFromBuild(model, build): the cache the main thread keeps after a worker build. One step per feature with the
  // same keys Kernel.rebuild would write, but only the last step carries a body (the others are `partial`), so a later
  // synchronous rebuild can continue from the last applied body when nothing before it changed.
  test('cacheFromBuild: one step per feature with the rebuild keys, a body only on the last step, partial on the rest', function () {
    assert(typeof K.cacheFromBuild === 'function', 'Kernel.cacheFromBuild is missing');
    var model = bracketModel(), b = K.rebuild(model), n = model.features.length;
    var cache = K.cacheFromBuild(model, b);
    assert(cache && Array.isArray(cache.steps), 'cacheFromBuild must return { steps: [...] }, got ' + keysOf(cache));
    assert(cache.steps.length === n, 'steps ' + cache.steps.length + ' vs ' + n + ' features');
    var keys = b.cache.steps.map(function (s) { return s.key; });
    cache.steps.forEach(function (s, i) {
      assert(s && typeof s.key === 'string' && s.key.length > 0, 'step ' + i + ' has no key');
      assert(s.key === keys[i], 'step ' + i + ' key differs from the Kernel.rebuild cache key');
      ['tool', 'plane', 'flange', 'profile', 'error', 'warning'].forEach(function (k) { assert(k in s, 'step ' + i + ' lacks the field "' + k + '" (has ' + keysOf(s) + ')'); });
      if (i < n - 1) assert(s.partial === true && !s.body, 'step ' + i + ' should be partial and carry no body');
      else { assert(!s.partial && s.body instanceof CSG, 'the last step must carry the body and not be partial'); nearRel(s.body.volume(), b.body.volume(), 1e-12, 'last step body volume'); }
    });
    // the tools and flange records come along (the bracket has a cut tool and two flange records)
    var tools = cache.steps.filter(function (s) { return s.tool; }).length, fl = cache.steps.filter(function (s) { return s.flange; }).length;
    assert(tools >= 1, 'no tool recorded in the cache steps'); assert(fl === 2, 'flange records in the cache: ' + fl + ', expected 2');
    // the same from an unpacked (worker-style) build once the sketch profiles are back on the model
    var u = K.unpackBuild(K.packBuild(b));
    K.applyProfiles(model, u.profiles);
    var c2 = K.cacheFromBuild(model, u);
    assert(c2.steps.length === n && c2.steps[n - 1].body instanceof CSG && c2.steps.every(function (s, i) { return s.key === keys[i]; }), 'cache from an unpacked build: ' + c2.steps.length + ' steps');
    return n + ' steps, ' + tools + ' tools, ' + fl + ' flange records';
  });
  test('rebuild with a cacheFromBuild cache: an unchanged model reuses every feature and gives the same body', function () {
    var model = bracketModel(), b = K.rebuild(model), n = model.features.length, vol = b.body.volume();
    var b2 = K.rebuild(model, K.cacheFromBuild(model, b));
    assert(b2.reused === n, 'unchanged model: reused ' + b2.reused + ' of ' + n);
    noErrors({ errors: b2.errors });
    nearRel(b2.body.volume(), vol, 1e-12, 'same body');
    assert(b2.cache && b2.cache.steps.length === n, 'the rebuild hands back a full cache again');
    // and that full cache still works as before
    var b3 = K.rebuild(model, b2.cache);
    assert(b3.reused === n, 'full cache after a partial one: reused ' + b3.reused);
    // the same through the worker path: pack, unpack, profiles back, cache, sync rebuild
    var u = K.unpackBuild(K.packBuild(b)); K.applyProfiles(model, u.profiles);
    var b4 = K.rebuild(model, K.cacheFromBuild(model, u));
    assert(b4.reused === n, 'after an unpacked build: reused ' + b4.reused + ' of ' + n);
    nearRel(b4.body.volume(), vol, 1e-12, 'volume after the worker-style cache');
    return 'reused ' + b2.reused + '/' + n;
  });
  test('rebuild with a cacheFromBuild cache: an appended feature reuses the previous count, a change in the middle reuses nothing', function () {
    var model = bracketModel(), b = K.rebuild(model), n = model.features.length, vol = b.body.volume();
    var cache = K.cacheFromBuild(model, b);
    // append: a disjoint 10 mm cube far from the bracket (box = sketch + extrude, two features)
    K.runScript(model, 'p.box(10, 10, 10, { at: [200, 0, 0] });');
    assert(model.features.length === n + 2, 'box appends two features');
    var b2 = K.rebuild(model, cache);
    assert(b2.reused === n, 'appended features: reused ' + b2.reused + ', expected the previous count ' + n);
    noErrors({ errors: b2.errors });
    nearRel(b2.body.volume(), vol + 1000, 1e-9, 'bracket + cube');
    nearRel(b2.body.volume(), K.rebuild(cloneOf(model)).body.volume(), 1e-9, 'equals a fresh rebuild');
    // a change in the middle: only the last step has a body, so nothing before the change can be continued from
    var m2 = bracketModel(), c2 = K.cacheFromBuild(m2, K.rebuild(m2));
    var holeSketch = m2.features.filter(function (f) { return f.type === 'sketch' && f.entities[0] && f.entities[0].t === 'circle'; })[0];
    assert(holeSketch, 'bracket has a circle sketch');
    holeSketch.entities[0].r = 8;
    var b3 = K.rebuild(m2, c2);
    assert(b3.reused === 0, 'change in the middle: reused ' + b3.reused + ', expected 0');
    noErrors({ errors: b3.errors });
    var fresh = K.rebuild(cloneOf(m2)).body.volume();
    nearRel(b3.body.volume(), fresh, 1e-9, 'cached rebuild equals a fresh rebuild');
    assert(Math.abs(fresh - vol) > 1, 'the bigger hole changed the volume (' + fmt(vol) + ' → ' + fmt(fresh) + ')');
    // the last feature changed: the prefix has no bodies, so this is also rebuilt from scratch, but correctly
    var m3 = bracketModel(), c3 = K.cacheFromBuild(m3, K.rebuild(m3));
    m3.features[m3.features.length - 1].length = 25;
    var b4 = K.rebuild(m3, c3);
    nearRel(b4.body.volume(), K.rebuild(cloneOf(m3)).body.volume(), 1e-9, 'last feature edited');
    return 'append reused ' + b2.reused + '/' + n + ', middle change reused ' + b3.reused;
  });
  test('worker.js rebuilds the bracket, reuses its cache on a repeat, and reports a broken feature', function () {
    if (typeof Worker === 'undefined') fail('Worker is not available in this browser');
    var model = bracketModel(), local = K.rebuild(model), vol = local.body.volume(), n = model.features.length;
    var w = new Worker('../worker.js'), waiting = {};
    w.onmessage = function (ev) {
      var m = ev.data || {}, cb = waiting[m.seq];
      if (cb) { delete waiting[m.seq]; cb(m); }
    };
    w.onerror = function (ev) {
      var msg = 'worker error: ' + ((ev && ev.message) || ev);
      Object.keys(waiting).forEach(function (s) { var cb = waiting[s]; delete waiting[s]; cb({ type: 'error', seq: +s, message: msg, workerFailed: true }); });
    };
    function ask(seq, m) {
      return new Promise(function (resolve, reject) {
        // the 8 s start once the page is idle: the synchronous tests declared after this one keep the main thread busy
        // for several seconds, and a timer armed now would fire before the worker's queued reply is delivered
        var timer = null, answered = false;
        setTimeout(function () {
          if (!answered) timer = setTimeout(function () { delete waiting[seq]; reject(new Error('worker did not answer seq ' + seq + ' within 8 s')); }, 8000);
        }, 0);
        waiting[seq] = function (reply) { answered = true; clearTimeout(timer); resolve(reply); };
        w.postMessage({ type: 'rebuild', seq: seq, model: cloneOf(m) });
      });
    }
    function expectBuilt(reply, seq) {
      assert(!reply.workerFailed, reply.message);
      assert(reply.type === 'built', 'seq ' + seq + ': expected a "built" reply, got ' + reply.type + (reply.message ? ': ' + reply.message : ''));
      assert(reply.seq === seq, 'seq echoed: ' + reply.seq + ' vs ' + seq);
      assert(reply.build, 'reply carries a packed build');
      return K.unpackBuild(reply.build);
    }
    var notes = [];
    return ask(1, model).then(function (reply) {
      var u = expectBuilt(reply, 1);
      noErrors({ errors: u.errors });
      nearRel(u.body.volume(), vol, 1e-12, 'worker volume vs synchronous rebuild');
      assert(u.reused === 0, 'a fresh worker reuses nothing, got ' + u.reused);
      notes.push('built ' + fmt(u.body.volume()) + ' in ' + fmt(u.time) + ' ms');
      return ask(2, model);
    }).then(function (reply) {
      var u = expectBuilt(reply, 2);
      assert(u.reused === n, 'a repeated model should reuse all ' + n + ' features from the worker cache, reused ' + u.reused);
      nearRel(u.body.volume(), vol, 1e-12, 'cached volume');
      notes.push('repeat reused ' + u.reused + '/' + n);
      var broken = cloneOf(model);
      var ext = broken.features.filter(function (f) { return f.type === 'extrude'; })[0];
      assert(ext, 'bracket has an extrude to break');
      ext.depth = 'not a number'; // JSON-safe (NaN would clone as null); extrudeRange throws "Extrude depth must be a number."
      return ask(3, broken).then(function (reply3) {
        assert(!reply3.workerFailed, reply3.message);
        if (reply3.type === 'error') {
          assert(typeof reply3.message === 'string' && reply3.message.length > 0, 'an error reply must carry a message');
          notes.push('broken model -> error reply: ' + reply3.message);
          return;
        }
        var u3 = expectBuilt(reply3, 3);
        assert(u3.errors && u3.errors[ext.id], 'expected errors[' + ext.id + '] for the broken extrude, got ' + JSON.stringify(u3.errors));
        notes.push('broken model -> errors[' + ext.id + '] = ' + u3.errors[ext.id]);
      });
    }).then(function () { w.terminate(); return notes.join(' · '); }, function (e) { w.terminate(); throw e; });
  });

