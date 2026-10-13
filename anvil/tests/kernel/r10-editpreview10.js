  // --- r10/editpreview10 ---
  test('r10/editpreview10: a worker preview with base: n also returns the part of the first n features (Edit Feature rollback), with its edges; op "base" returns only that', function () {
    if (typeof Worker === 'undefined') fail('Worker is not available in this browser');
    var model = bracketModel(), n = model.features.length;
    var cut = -1;
    model.features.forEach(function (f, i) { if (f.type === 'extrude' && f.cut) cut = i; });   // the cut, before the two flanges
    assert(cut > 0, 'bracket has a later feature');
    var pre = cloneOf(model); pre.features = pre.features.slice(0, cut);
    var want = K.rebuild(pre).body.volume();
    var w = new Worker('../worker.js'), waiting = {};
    w.onmessage = function (ev) { var m = ev.data || {}, cb = waiting[m.seq]; if (cb) { delete waiting[m.seq]; cb(m); } };
    function ask(seq, msg) {
      return new Promise(function (resolve, reject) {
        var timer = null, answered = false;
        setTimeout(function () { if (!answered) timer = setTimeout(function () { delete waiting[seq]; reject(new Error('worker did not answer seq ' + seq + ' within 8 s')); }, 8000); }, 0);
        waiting[seq] = function (reply) { answered = true; clearTimeout(timer); resolve(reply); };
        msg.seq = seq; w.postMessage(msg);
      });
    }
    var f = cloneOf(model.features[cut]);
    return ask(1, { type: 'rebuild', model: cloneOf(model) }).then(function () {
      return ask(2, { type: 'preview', model: cloneOf(model), upto: cut, op: 'tool', feature: f, base: cut });
    }).then(function (r) {
      assert(r.type === 'previewed', r.type + ' ' + (r.message || ''));
      assert(r.tools.length === 1 && r.tools[0], 'the feature tool');
      assert(r.base && r.base.upto === cut && r.base.build, 'base in the reply');
      var u = K.unpackBuild(r.base.build);
      nearRel(u.body.volume(), want, 1e-9, 'rolled-back part volume');
      assert(Array.isArray(r.base.edges) && r.base.edges.length > 0, 'edges of the rolled-back mesh');
      return ask(3, { type: 'preview', model: cloneOf(model), upto: cut, op: 'base', base: cut });
    }).then(function (r) {
      assert(r.type === 'previewed' && r.tools.length === 0 && r.base, 'op base: ' + r.type);
      nearRel(K.unpackBuild(r.base.build).body.volume(), want, 1e-9, 'op base volume');
      // a full-model preview (upto null) with a base builds the prefix separately
      return ask(4, { type: 'preview', model: cloneOf(model), upto: null, op: 'tool', feature: f, base: cut });
    }).then(function (r) {
      assert(r.type === 'previewed' && r.base, 'full preview with base');
      nearRel(K.unpackBuild(r.base.build).body.volume(), want, 1e-9, 'base beside a full-model preview');
      w.terminate();
      return 'rolled back to ' + cut + '/' + n + ' features: ' + fmt(want) + ' mm³';
    }, function (e) { w.terminate(); throw e; });
  });
  // --- end r10/editpreview10 ---
