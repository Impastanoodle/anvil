// ui-occt.js — Tools ▸ OpenCascade kernel (experimental). While it is on, every part rebuild is also built by
// OpenCascade (occt-kernel.js in occt-worker.js, a separate module worker so the 50 MB engine loads only then), and
// when OpenCascade built every feature, its solid is valid and its volume agrees with Anvil's (r.tolerance: 1e-4,
// 2e-2 with sweeps / lofts that Anvil only approximates), OpenCascade's solid DRIVES the part: OcctKernel.toBuild turns
// it into an Anvil build (polygons tagged with their B-rep face, analytic surface record and feature) that is applied
// like any other, so the viewport, picking (whole B-rep faces), edges, drawings, exports, mass properties and the
// evaluate tools all work on OpenCascade's geometry (true fillets on curved edges, exact sweeps, ...).
// Anvil's kernel still builds every model first (instant feedback, the fallback, the cross-check). The status bar
// says which result is shown: "OpenCascade ✓ 12 faces", "OpenCascade: needs sheet metal" (Anvil's result stays), a
// mismatch or an invalid solid (Anvil's stays). Switching off puts Anvil's build back. Remembered in localStorage
// 'anvil.occt'. Assemblies are skipped. Without vendor/occt (vendor/get-occt.ps1) the status says so.
(function (UI) {
  'use strict';
  var App = UI.App, K = window.Kernel;
  var st = App.occt = { on: false, worker: null, ready: false, loadMs: null, seq: 0, want: 0, busy: false, anvilSeq: 0, sentAnvil: null,
    state: 'off', result: null, driving: false, anvilBuild: null, anvilVolume: null, volumeDiff: null, error: null, waiters: [] };
  // '1' / '0': the user's choice; unset: on by default when the engine is installed (probed at load, below)
  var stored = null;
  try { stored = localStorage.getItem('anvil.occt'); } catch (e) { }
  st.on = stored === '1';
  // r12/occtui12: after an edit of a part OpenCascade drives, 'quick': Anvil's own result shows at once (~20 ms) and
  // OpenCascade's exact solid cross-fades in over it when it lands; 'wait': the view holds the previous exact solid
  // until the new one lands (round 11, up to HOLD_MAX, 'Rebuilding…' cue). Remembered per browser in
  // 'anvil.occtSwap'; quick is the default (immediate feedback, the faceted → exact change is a 180 ms fade).
  st.swap = 'quick';
  try { var sw0 = localStorage.getItem('anvil.occtSwap'); if (sw0 === 'wait' || sw0 === 'quick') st.swap = sw0; } catch (e) { }

  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function startWorker() {
    if (st.worker || !window.Worker) return;
    try { st.worker = new Worker('occt-worker.js', { type: 'module' }); }
    catch (e) { st.state = 'failed'; st.error = e.message; refresh(); return; }
    st.state = 'loading';
    // the worker uses a served engine when there is one; otherwise the file the user picked (kept in this browser), or none
    var w = st.worker;
    storedEngine().then(function (bytes) { if (st.worker === w) w.postMessage({ type: 'engine', bytes: bytes }, bytes ? [bytes] : []); });
    st.worker.onmessage = onMessage;
    st.worker.onerror = function (e) { st.state = 'failed'; st.error = (e && e.message) || 'the OpenCascade worker did not start'; settle(); refresh(); };
  }
  // ---- an engine file picked by the user (the published copy has no engine on its server): kept in this browser's
  // IndexedDB, checked against the official build's SHA-256 here before it is kept and again in occt-worker.js
  var WASM_SHA256 = '4b6a74398987eb3ca6bedc7d1b29d6a5af74d0613a9f3bf013a52d7d5d1b5937';
  function idb(mode, fn) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open('anvil-occt', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('files'); };
        rq.onerror = function () { res(null); };
        rq.onsuccess = function () {
          try {
            var tx = rq.result.transaction('files', mode), r = fn(tx.objectStore('files'));
            tx.oncomplete = function () { res(r && r.result != null ? r.result : null); rq.result.close(); };
            tx.onerror = tx.onabort = function () { res(null); rq.result.close(); };
          } catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  function storedEngine() { return window.indexedDB ? idb('readonly', function (s) { return s.get('engine'); }) : Promise.resolve(null); }
  function storeEngine(bytes) { return idb('readwrite', function (s) { return bytes ? s.put(bytes, 'engine') : s.delete('engine'); }); }
  function sha256Hex(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      var a = new Uint8Array(d), s = '';
      for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
      return s;
    });
  }
  function unpacked(buf) {
    var h = new Uint8Array(buf, 0, 2);
    if (!(h[0] === 0x1f && h[1] === 0x8b)) return Promise.resolve(buf);
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot unpack a .gz file; pick opencascade.full.wasm instead.'));
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  // a picked file: verified, kept, and the engine (re)started on it
  function useEngineFile(file) {
    return file.arrayBuffer().then(function (buf) {
      return unpacked(buf.slice(0)).then(sha256Hex).then(function (h) {
        if (h !== WASM_SHA256) throw new Error(file.name + ' is not the official opencascade.js 2.0.0-beta.b5ff984 engine (SHA-256 ' + h.slice(0, 12) + '…); it was not used.');
        return storeEngine(buf);
      });
    }).then(function () { stopWorker(); st.state = 'off'; set(true); });
  }
  function engineDialog() {
    storedEngine().then(function (kept) {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.wasm,.gz'; input.style.display = 'none';
      var msg = document.createElement('p');
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return;
        msg.textContent = 'Checking ' + f.name + '…';
        useEngineFile(f).then(function () { if (UI.closeModal) UI.closeModal(); if (UI.toast) UI.toast('OpenCascade engine checked and kept in this browser'); },
          function (e) { msg.textContent = e.message || String(e); });
      };
      var body = document.createElement('div');
      body.innerHTML = '<p>This copy of Anvil has no OpenCascade engine on its server. Pick <b>opencascade.full.wasm</b> (or <b>opencascade.full.wasm.gz</b>) from <code>anvil/vendor/occt</code> after running <code>vendor/get-occt.ps1</code>, or from the <code>dist</code> folder of the opencascade.js 2.0.0-beta.b5ff984 npm package.</p>' +
        '<p>It is checked against the official build\'s SHA-256 fingerprint before it is kept or run; any other file is refused. It stays in this browser only; nothing is uploaded.</p>' +
        '<p>' + (kept ? 'An engine file is kept in this browser.' : 'No engine file is kept in this browser.') + '</p>';
      body.appendChild(msg); body.appendChild(input);
      var buttons = [{ label: 'Choose file…', primary: true, keepOpen: true, action: function () { input.click(); return false; } }];
      if (kept) buttons.push({ label: 'Forget kept engine', keepOpen: true, action: function () { storeEngine(null).then(function () { stopWorker(); set(false); msg.textContent = 'The kept engine was removed from this browser.'; }); return false; } });
      buttons.push({ label: 'Close' });
      UI.showModal({ title: 'OpenCascade engine', body: body, buttons: buttons });
    });
  }
  function stopWorker() { if (st.worker) st.worker.terminate(); st.worker = null; st.ready = false; st.busy = false; heldResult = null; App.holdFrameUntil = 0; if (st.quietTimer) { clearTimeout(st.quietTimer); st.quietTimer = 0; } rb.want = 0; rb.result = null; if (st.cueOn) cue(false); }

  function onMessage(e) {
    var m = e.data || {};
    if (m.type === 'ready') { st.ready = true; st.loadMs = m.loadMs; request(); return; }
    if (m.type === 'imported' || m.type === 'importError') {
      var w = imports[m.seq]; delete imports[m.seq];
      if (w) { if (m.type === 'imported') w.res(m.result); else w.rej(new Error(m.message)); }
      return;
    }
    if (m.type === 'error' && m.seq === -1) {
      st.state = 'failed'; st.error = m.message;
      Object.keys(imports).forEach(function (k) { imports[k].rej(new Error(m.message)); delete imports[k]; });
      settle(); refresh(); return;
    }
    if (m.upto != null) { rollbackBuilt(m); return; }   // r11/occtswap11: Edit Feature's rolled-back part
    if (m.type === 'built' && m.result && m.part == null && m.seq === st.want) learn(m.result, performance.now() - (st.buildingSince || 0));
    if (m.part == null && st.cueOn && m.seq === st.want) cue(false);
    if (m.part != null) {   // one part of an assembly
      var A = st.asm;
      if (!A || m.seq !== A.seq) return;
      A.results[m.part] = m.type === 'built' ? m.result : { error: m.message };
      if (--A.left > 0) return;
      st.busy = false; st.lastOcctMs = performance.now() - (st.buildingSince || 0);
      if (m.seq !== st.want) { request(); return; }
      if (held) { heldResult = { seq: m.seq, anvilBuild: App.build, apply: function () { acceptAssembly(A); } }; return; }   // swapped in on release
      acceptAssembly(A);
      releaseHold(); settle(); refresh();
      return;
    }
    st.busy = false; st.lastOcctMs = performance.now() - (st.buildingSince || 0);
    if (m.seq !== st.want) { request(); return; }   // the model changed meanwhile: build the newer one
    if (m.type === 'error') { st.state = 'error'; st.error = m.message; st.result = null; }
    // r11/occtswap11: the whole part answered while Edit Feature shows the part rolled back: App.build / App.mesh are
    // the rolled-back part, no reference for its volume (the chip flashed "volume differs"); it is checked and swapped
    // in when the edit rolls forward (✗), if still current (onRollbackEnd)
    else if (App.rollback != null) { st.rollDeferred = { seq: m.seq, result: m.result }; releaseHold(); settle(); refresh(); return; }
    else if (held) { heldResult = { seq: m.seq, anvilBuild: App.build, apply: function () { accept(m.result); } }; return; }   // swapped in on release
    else accept(m.result);
    releaseHold();
    settle();
    refresh();
  }
  // ---- assemblies: every distinct part (sub-assemblies' too) is built by OpenCascade with its own rebuild cache,
  // checked against Anvil's build of it, then the assembly is rebuilt around OpenCascade's parts (Assembly.setPartBuilder):
  // mates, patterns and the solver run as ever, on the exact geometry
  function keyOf(model) { return JSON.stringify(model, function (k, v) { return k === 'profile' ? undefined : v; }); }
  function collectParts(cache, out, seen) {
    Object.keys(cache || {}).forEach(function (ck) {
      var e = cache[ck];
      if (!e || e.error || !e.build) return;
      if (e.kind === 'assembly') { collectParts(e.build.cache, out, seen); return; }
      var key = keyOf(e.model);
      if (seen[key]) return;
      seen[key] = true;
      out.push({ key: key, cacheKey: ck, model: e.model, anvilBuild: e.anvil || e.build, occt: !!e.occt, name: e.model.name || 'Part' });
    });
    return out;
  }
  // an Anvil part build's mesh, triangle features and volume, kept per build (r3/engine3): a part the assembly did not
  // rebuild keeps its build object, so the swap after another edit does not mesh it and integrate its volume again
  var anvilInfos = typeof WeakMap === 'function' ? new WeakMap() : null;
  function anvilInfo(b) {
    var ai = anvilInfos && anvilInfos.get(b);
    if (ai) return ai;
    var mesh = K.meshFromBody(b.body);
    ai = { mesh: mesh, volume: mesh.triCount ? K.massProps(mesh, 1).volume : 0, triShared: triSharedOf(mesh) };
    if (anvilInfos) anvilInfos.set(b, ai);
    return ai;
  }
  function partsKey(parts) { return parts.map(function (p) { return p.cacheKey; }).sort().join('|'); }
  // r3/assembly3: the assembly cache keeps OpenCascade's part builds (entry.occt, Anvil's in entry.anvil), so a rebuild
  // that only moves components (a drag, a mate, an explode) reuses them: no Anvil parts flash in, no worker round trip
  function markOcct(oc, ac) {
    Object.keys(oc || {}).forEach(function (k) {
      var o = oc[k], a = ac && ac[k];
      if (!o || !o.build || !a || !a.build) return;
      if (o.kind === 'assembly') { markOcct(o.build.cache, a.build.cache); return; }
      o.anvil = a.anvil || a.build; o.occt = true;
    });
  }
  function triSharedOf(mesh) {
    var out = new Int32Array(mesh.triCount);
    mesh.faces.forEach(function (f) { var t = f.start; f.polys.forEach(function (p) { for (var i = 0; i < p.vertices.length - 2; i++) out[t++] = p.shared == null ? -1 : p.shared; }); });
    return out;
  }
  function requestAssembly() {
    var parts = collectParts(App.build && App.build.cache, [], {});
    if (!parts.length) { st.state = 'assembly'; st.result = null; settle(); refresh(); return; }
    if (st.asmOcct && st.asmOcctKey === partsKey(parts) && parts.every(function (p) { return p.occt; })) {   // every part shown is OpenCascade's already
      App.build.occt = st.asmOcct;
      st.state = 'ok'; st.driving = true; st.anvilBuild = null; st.error = null;
      settle(); refresh(); return;
    }
    st.busy = true; st.want = ++st.seq; st.state = 'building'; st.buildingSince = performance.now();
    st.asm = { seq: st.want, parts: parts, results: {}, left: parts.length, anvilBuild: App.build };
    parts.forEach(function (p, i) {
      var model; try { model = JSON.parse(JSON.stringify(p.model)); } catch (e) { model = p.model; }
      st.worker.postMessage({ type: 'build', seq: st.want, part: i, model: model, cacheKey: p.cacheKey });
    });
    refresh();
  }
  function acceptAssembly(A) {
    var bad = null, builds = {}, faces = 0, volume = 0, beyond = [], ms = { build: 0, mesh: 0 };
    A.parts.forEach(function (p, i) {
      if (bad) return;
      var r = A.results[i];
      if (r.error) { bad = { state: 'error', error: p.name + ': ' + r.error }; return; }
      if (r.unsupported) { bad = { state: 'unsupported', unsupported: r.unsupported + ' in ' + p.name }; return; }
      if (!r.valid) { bad = { state: 'invalid', error: p.name }; return; }
      var ai = anvilInfo(p.anvilBuild), mesh = ai.mesh, av = ai.volume;
      var dv = av ? Math.abs(r.volume - av) / av : Math.abs(r.volume);
      var bey = Object.keys(p.anvilBuild.errors || {}).filter(function (id) { return r.status[id] === 'ok'; });
      if (!r.mesh || (!bey.length && !(dv <= (r.tolerance || 1e-4)))) { bad = { state: 'mismatch', error: p.name + ': ' + r.volume.toFixed(3) + ' vs Anvil ' + av.toFixed(3) }; return; }
      builds[p.key] = OcctKernel.toBuild(r, p.anvilBuild, mesh, ai.triShared, window.CSG, K);
      faces += r.faces.length; volume += r.volume; ms.build += r.ms.build; ms.mesh += r.ms.mesh;
      bey.forEach(function (id) { beyond.push(p.name + ':' + id); });
    });
    st.result = { faces: { length: faces }, volume: volume, bodies: A.parts.length, valid: !bad || bad.state !== 'invalid', ms: ms, status: {}, tolerance: null,
      unsupported: bad && bad.unsupported || null };
    st.beyond = beyond; st.volumeDiff = null; st.anvilVolume = null;
    if (bad) { st.state = bad.state; st.error = bad.error || null; return; }
    var b;
    Assembly.setPartBuilder(function (model) { return builds[keyOf(model)] || null; });
    try { b = Assembly.rebuild(App.model, null, UI.asmBuildOpts || null); }
    catch (e) { st.state = 'error'; st.error = 'Assembly with OpenCascade parts: ' + (e.message || e); return; }
    finally { Assembly.setPartBuilder(null); }
    b.occt = st.asmOcct = { volume: volume, faces: faces, parts: A.parts.length }; st.asmOcctKey = partsKey(A.parts);
    markOcct(b.cache, A.anvilBuild && A.anvilBuild.cache);
    if (!App.model.tessellation) App.asmCache = b.cache;   // later rebuilds reuse OpenCascade's parts (see markOcct)
    st.state = 'ok'; st.anvilBuild = A.anvilBuild; st.driving = true;
    swapIn(b);
  }
  // OpenCascade answered for the model Anvil's build on screen was made from (the sequence numbers match)
  function accept(r) {
    st.result = r; st.error = null; st.volumeDiff = null;
    var anvilBuild = App.build, anvilMesh = App.mesh;
    // the volume worker.js sent with Anvil's build (smooth/responsive: massProps of a large mesh is tens of ms here)
    st.anvilVolume = anvilMesh && anvilMesh.triCount ? (typeof anvilMesh.workerVolume === 'number' ? anvilMesh.workerVolume : K.massProps(anvilMesh, 1).volume) : 0;
    if (r.unsupported) { st.state = 'unsupported'; return; }
    if (!r.valid) { st.state = 'invalid'; return; }
    // a feature Anvil built but OpenCascade could not (a fillet that consumes a whole face, ...): name it, instead of
    // reporting the volume difference that follows from it
    var failed = Object.keys(r.status || {}).filter(function (id) { return /^error/.test(r.status[id]) && !((anvilBuild && anvilBuild.errors) || {})[id]; });
    if (failed.length) {
      var ff = K.findFeature(App.model, +failed[0]);
      st.state = 'featureError'; st.failedFeature = ff ? ff.name : 'feature ' + failed[0];
      st.error = String(r.status[failed[0]]).replace(/^error:\s*/, '');
      return;
    }
    var dv = st.anvilVolume ? Math.abs(r.volume - st.anvilVolume) / st.anvilVolume : Math.abs(r.volume);
    st.volumeDiff = dv;
    // features Anvil's kernel failed that OpenCascade built (a fillet on a saddle edge, ...): Anvil's volume is no
    // reference any more, OpenCascade's valid solid is shown and those errors are cleared
    st.beyond = Object.keys((anvilBuild && anvilBuild.errors) || {}).filter(function (id) { return r.status[id] === 'ok'; });
    // r12/occtui12: no solid on either side (every feature failed, or nothing built yet): nothing to compare, not a
    // "volume differs"
    if (!r.mesh && !(Math.abs(r.volume || 0) > 1e-9) && !(st.anvilVolume > 1e-9)) { st.state = 'empty'; return; }
    if (!r.mesh || (!st.beyond.length && !(dv <= (r.tolerance || 1e-4)))) { st.state = 'mismatch'; return; }
    var build;
    try {
      var sent = st.sentAnvil;
      build = r.packed && OcctKernel.fromPacked && sent && r.anvilKey === sent.key && sent.mesh === anvilMesh ? OcctKernel.fromPacked(r, r.packed, anvilBuild, window.CSG, K)
        : OcctKernel.toBuild(r, anvilBuild, anvilMesh, App.triShared, window.CSG, K);
    }
    catch (e) { st.state = 'error'; st.error = 'Could not show the OpenCascade solid: ' + e.message; return; }
    st.state = 'ok';
    st.anvilBuild = anvilBuild;
    st.driving = true;
    swapIn(build, r.edges, r.curves, r.normals);
  }
  // ---- the exact solid swaps in without losing the selection (smooth/responsive). Features, planes, bodies and
  // components are not tied to mesh indices and stay selected; a selected face is found again on the new mesh by a
  // point on it, an edge by its midpoint and length. App.hover is dropped (the pointer's next move finds it again).
  function selProbe(s) {
    if (!s) return null;
    if (s.kind === 'face') {
      var at = s.point, f = App.mesh && App.mesh.faces[s.index];
      if (!at && f && f.polys && f.polys[0]) {
        var vs = f.polys[0].vertices, c = [0, 0, 0];
        vs.forEach(function (v) { c[0] += v.pos.x / vs.length; c[1] += v.pos.y / vs.length; c[2] += v.pos.z / vs.length; });
        at = c;
      }
      // r5/select5: and what the face belongs to (component / body, the feature that made it, its B-rep face), so the
      // restore cannot land on a touching part's coplanar face
      var p0 = f && f.polys && f.polys[0];
      return at ? { s: s, at: at, body: f ? f.body || 0 : null, shared: p0 && p0.shared != null ? p0.shared : null, face: p0 && p0.face != null ? p0.face : null } : null;
    }
    if (s.kind === 'edge') return s.edge && s.edge.mid ? { s: s, mid: s.edge.mid.slice(), len: s.edge.len, body: edgeBody(s.edge) } : null;
    return { s: s };
  }
  function selRestore(p) {
    if (!p) return null;
    var s = p.s, out = {}, k;
    if (s.kind !== 'face' && s.kind !== 'edge') return s;
    for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
    if (s.kind === 'face') {
      var hit = faceAt(p);
      if (hit < 0) return null;
      out.index = hit;
      return out;
    }
    var best = null, bestD = Math.max(0.05, (p.len || 0) * 0.02);
    (App.edges || []).forEach(function (e) {
      if (e.smooth || !e.mid) return;
      if (p.body != null && edgeBody(e) != null && edgeBody(e) !== p.body) return;   // r5/select5: not a touching part's edge
      var d = Math.hypot(e.mid[0] - p.mid[0], e.mid[1] - p.mid[1], e.mid[2] - p.mid[2]) + Math.abs((e.len || 0) - (p.len || 0));
      if (d < bestD) { bestD = d; best = e; }
    });
    if (!best) return null;
    out.edge = best; out.index = App.edges.indexOf(best);
    return out;
  }
  // r5/select5: the face a probe names on the new mesh. Candidates narrow from strict to loose: same component / body,
  // feature and B-rep face; same component and feature; same component; anywhere. The first tier with a face through
  // the probe's point wins (was: the first face through the point, which could be the touching part's).
  function edgeBody(e) {
    var m = App.mesh, f = e && e.faces && m ? m.faces[e.faces[0]] : null;
    return f ? f.body || 0 : null;
  }
  function faceAt(p) {
    var m = App.mesh;
    if (!m) return -1;
    function tier(test) {
      var idx = [], faces = [];
      for (var i = 0; i < m.faces.length; i++) if (test(m.faces[i])) { idx.push(i); faces.push(m.faces[i]); }
      if (!faces.length) return -1;
      var hit = [];
      try { hit = K.resolveFaces([{ at: p.at }], { faces: faces }, 0.5); } catch (e) { }
      return hit.length ? idx[hit[0]] : -1;
    }
    function body(f) { return p.body == null || (f.body || 0) === p.body; }
    function feat(f) { var q = f.polys && f.polys[0]; return p.shared == null || !q || q.shared == null || q.shared === p.shared; }
    function bface(f) { var q = f.polys && f.polys[0]; return p.face == null || !q || q.face == null || q.face === p.face; }
    var tests = [function (f) { return body(f) && feat(f) && bface(f); }, function (f) { return body(f) && feat(f); }, body, function () { return true; }];
    for (var t = 0; t < tests.length; t++) { var r = tier(tests[t]); if (r >= 0) return r; }
    return -1;
  }
  UI.occtSelProbe = selProbe; UI.occtSelRestore = selRestore;   // r5/select5: for tests
  function isMeshSel(p) { return !!p && (p.s.kind === 'face' || p.s.kind === 'edge'); }
  // ---- r12/occtui12: the cross-fade. The 3D canvas keeps its drawing buffer (ui-core.js preserveDrawingBuffer), so
  // the frame on screen (Anvil's quick result) is copied into a 2D canvas laid exactly over it, under every overlay
  // (dimensions, triad, PropertyManager); the exact solid renders underneath on the next frame and the copy fades out
  // (FADE_MS). Not when a frame is held (it already shows an exact solid: the swap is instant, as before), the
  // camera is animating, or the canvas is hidden; any input (a click, a wheel turn, a key) ends a fade at once, since
  // the copy would no longer line up with a moving view. The camera, selection and pre-selection are untouched.
  var FADE_MS = 180, fadeEl = null, fadeTimer = 0;
  st.fades = 0;
  function fadeStop() {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = 0; }
    if (fadeEl) { fadeEl.style.transition = 'none'; fadeEl.style.opacity = '0'; fadeEl.style.visibility = 'hidden'; }
  }
  ['pointerdown', 'wheel', 'keydown'].forEach(function (t) { window.addEventListener(t, function () { if (fadeTimer) fadeStop(); }, true); });
  function fadeSnap() {
    if (App.holdFrameUntil > performance.now() || UI.viewAnimating && UI.viewAnimating()) return false;
    var gl = document.querySelector('#viewport canvas.gl');
    if (!gl || !gl.width || !gl.height || !gl.getClientRects().length || !App.mesh) return false;
    try {
      if (!fadeEl) {
        fadeEl = document.createElement('canvas');
        fadeEl.className = 'occt-fade';
        fadeEl.setAttribute('aria-hidden', 'true');
        fadeEl.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;visibility:hidden;opacity:0';
      }
      if (fadeEl.parentNode !== gl.parentNode || fadeEl.previousSibling !== gl) gl.parentNode.insertBefore(fadeEl, gl.nextSibling);
      if (fadeEl.width !== gl.width) fadeEl.width = gl.width;
      if (fadeEl.height !== gl.height) fadeEl.height = gl.height;
      fadeEl.style.width = gl.style.width || gl.clientWidth + 'px'; fadeEl.style.height = gl.style.height || gl.clientHeight + 'px';
      var cx = fadeEl.getContext('2d');
      cx.clearRect(0, 0, fadeEl.width, fadeEl.height);
      cx.drawImage(gl, 0, 0);
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeEl.style.transition = 'none'; fadeEl.style.opacity = '1'; fadeEl.style.visibility = 'visible';
      return true;
    } catch (e) { fadeStop(); return false; }
  }
  // after the swap: once the exact solid has been drawn under the copy (the next animation frame; a timer when frames
  // are throttled), the copy fades out
  function fadeRun() {
    if (UI.requestRender) UI.requestRender();
    var go = function () {
      if (!fadeEl || fadeEl.style.visibility !== 'visible' || go.done) return;
      go.done = true;
      fadeEl.style.transition = 'opacity ' + FADE_MS + 'ms ease-out';
      fadeEl.style.opacity = '0';
      st.fades++;
      fadeTimer = setTimeout(function () { fadeTimer = 0; fadeStop(); }, FADE_MS + 40);
    };
    requestAnimationFrame(function () { requestAnimationFrame(go); });
    fadeTimer = setTimeout(go, 120);
  }
  function swapIn(build, edges, curves, normals) {
    var fade = fadeSnap();
    try { swapIn0(build, edges, curves, normals); } finally { if (fade) fadeRun(); }
  }
  function swapIn0(build, edges, curves, normals) {
    var multiOk = App.multi && App.multi.length > 1 && App.multi[0] === App.sel && App.multiMesh === App.mesh;
    var p1 = selProbe(App.sel), p2 = selProbe(App.sel2), pl = multiOk ? App.multi.map(selProbe) : null;
    // non-mesh selections are kept through applyBuild (the tree draws them); face / edge ones are found afterwards
    App.sel = p1 && !isMeshSel(p1) ? p1.s : null; App.sel2 = p2 && !isMeshSel(p2) ? p2.s : null; App.hover = null;
    UI.applyBuild(build, { noSave: true, keepMs: true, occt: true, edges: edges || null, curves: curves || null, normals: normals || null });
    if (!isMeshSel(p1) && !isMeshSel(p2) && !pl) return;
    App.sel = selRestore(p1); App.sel2 = selRestore(p2);
    if (!App.sel && App.sel2) { App.sel = App.sel2; App.sel2 = null; }
    if (pl && App.sel) {
      var list = [App.sel];
      pl.slice(1).forEach(function (p) { var r = selRestore(p); if (r) list.push(r); });
      App.multi = list.length > 1 ? list : []; App.multiMesh = App.mesh; App.multiMode = App.mode;
    } else App.multi = [];
    UI.updateHighlights();
  }

  // ---- when OpenCascade builds (smooth/responsive): a rebuild that follows another within QUIET ms (an Instant3D drag,
  // a value spun and committed again and again) waits until the edits pause, so the exact solid is not built for every
  // step and does not swap in between two of Anvil's live builds; while the left button is held (a drag) a finished
  // result is kept and swapped in on release, if it is still current.
  var QUIET = 160, held = false, heldResult = null;
  function release() {
    if (!held) return;
    held = false;
    if (!heldResult) return;
    var h = heldResult; heldResult = null;
    if (h.seq === st.want && App.build === h.anvilBuild) h.apply(); else { st.want = -1; request(); }
    settle(); refresh();
  }
  window.addEventListener('pointerdown', function (e) { if (e.button === 0) held = true; }, true);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', release);
  window.addEventListener('pointermove', function (e) { if (held && !(e.buttons & 1)) release(); }, true);
  function pendingWork() { return !!(st.busy || st.quietTimer || heldResult); }
  function settle() { if (pendingWork()) return; var w = st.waiters; st.waiters = []; w.forEach(function (fn) { fn(status()); }); }

  // post the current model (newest wins: one build in flight, the latest request replaces older ones)
  function request() {
    if (!st.on || !App.model) { settle(); return; }
    if (!st.worker) { startWorker(); return; }
    if (!st.ready || st.busy || st.quietTimer) return;
    heldResult = null;
    if (isAsm()) { if (typeof Assembly !== 'undefined' && Assembly.setPartBuilder) requestAssembly(); else { st.state = 'assembly'; settle(); } return; }
    st.busy = true; st.want = ++st.seq; st.state = 'building'; st.buildingSince = performance.now();
    var model; try { model = JSON.parse(JSON.stringify(App.model)); } catch (e) { st.busy = false; return; }
    // the Anvil mesh on screen goes along (copied), so the worker tags OpenCascade's faces with their features and
    // sends the bodies ready to unpack (accept -> OcctKernel.fromPacked) (r3/engine3)
    var anvil = null;
    if (!st.driving && App.mesh && App.mesh.positions && App.triShared) { anvil = { key: ++st.anvilSeq, positions: App.mesh.positions, triShared: App.triShared }; st.sentAnvil = { key: anvil.key, mesh: App.mesh }; }
    else st.sentAnvil = null;
    st.estMs = estimate(model);   // r11/occtswap11: how long this build should take (afterBuild's frame hold)
    st.worker.postMessage({ type: 'build', seq: st.want, model: model, exports: true, anvil: anvil });
    refresh();
  }
  // ---- r11/occtswap11: how long OpenCascade will take. The worker's rebuild cache restores the unchanged feature
  // prefix, so a build costs the features from the first changed one on (each feature's last measured time,
  // r.ms.features), plus tessellation and the round trip (both measured on the last build)
  st.featMs = {}; st.lastKeys = null;
  function featureKeys(model) {
    var head = JSON.stringify(model.sheet || null) + '|' + (model.units || 'mm');
    return (model.features || []).map(function (f) { return head + JSON.stringify(f, function (k, v) { return k === 'profile' || k === 'name' ? undefined : v; }); });
  }
  function estimate(model) {
    var keys = featureKeys(model), prev = st.lastKeys || [], i = 0, ms = 0;
    while (i < keys.length && i < prev.length && keys[i] === prev[i]) i++;
    for (var j = i; j < keys.length; j++) { var t = st.featMs[model.features[j].id]; ms += t != null ? t : 40; }
    // the same part edited (an unchanged first feature, or the same features by id and type): a frame of another
    // part is never held
    var sig = (model.features || []).map(function (f) { return f.id + f.type; }).join(),
      same = !!prev.length && (i > 0 || sig === st.lastSig);
    st.lastKeys = keys; st.lastSig = sig; st.estSame = same;
    return ms + (st.meshMs != null ? st.meshMs : 30) + (st.overMs != null ? st.overMs : 80);
  }
  function learn(r, total) {
    var fm = r.ms && r.ms.features;
    if (fm) Object.keys(fm).forEach(function (id) { st.featMs[id] = fm[id]; });
    if (r.ms && r.ms.mesh != null) st.meshMs = r.ms.mesh;
    if (r.ms && total != null) st.overMs = Math.max(0, Math.min(400, total - (r.ms.build || 0) - (r.ms.mesh || 0)));
  }
  // after every applied build (ui-core.js applyBuild calls the UI.onBuild hooks); OpenCascade's own apply is skipped
  function afterBuild(build, opts) {
    if (opts && opts.occt) return;
    var wasDriving = st.driving;
    st.driving = false; st.anvilBuild = null;
    var now = performance.now(), burst = now - (st.lastBuildAt || -1e9) < QUIET;
    st.lastBuildAt = now;
    if (!st.on) return;
    if (st.busy) st.want = -1;   // the in-flight reply is stale now; onMessage asks again
    if (burst || held) { quietThen(); return; }
    if (!st.busy) {
      request();
      // OpenCascade drove the part: the viewport keeps its last frame (OpenCascade's previous solid, or the preview
      // the ✓ was pressed on) until the exact solid swaps in, instead of flashing Anvil's facets for the build's
      // duration (smooth/responsive; r11/occtswap11: held for the expected build time, up to HOLD_MAX, with a
      // 'Rebuilding…' cue; a build expected to take longer shows Anvil's part at once). Any input ends the hold.
      // r12/occtui12: only in 'wait' mode; 'quick' shows Anvil's result now and cross-fades (swapIn)
      if (st.swap !== 'wait') { }
      else if (wasDriving && st.busy && UI.holdFrame && isAsm()) { if (st.lastOcctMs != null && st.lastOcctMs < 280) UI.holdFrame(280); }   // as before
      else if (wasDriving && st.busy && UI.holdFrame && st.estSame && st.estMs != null && st.estMs <= HOLD_MAX) {
        UI.holdFrame(Math.min(HOLD_MAX, st.estMs * 1.5 + 150));
        cue(true);
      }
    }
  }
  var HOLD_MAX = 1500;
  function releaseHold() { App.holdFrameUntil = 0; }
  ['pointerdown', 'mousedown', 'wheel', 'keydown'].forEach(function (t) { window.addEventListener(t, releaseHold, true); });
  // r11/occtswap11: a small 'Rebuilding…' pill at the foot of the graphics area while a held frame waits for
  // OpenCascade (faded in after 150 ms, so a quick swap shows nothing)
  var cueEl = null;
  function cue(on) {
    st.cueOn = !!on;
    if (st.cueTimer) { clearTimeout(st.cueTimer); st.cueTimer = 0; }
    if (on) st.cueTimer = setTimeout(function () { st.cueTimer = 0; cue(false); }, HOLD_MAX + 1500);   // never left on
    var vp = document.getElementById('viewport');
    if (!vp) return;
    if (!cueEl) {
      var css = document.createElement('style');
      css.textContent = '.occt-cue{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;border-radius:11px;' +
        'background:rgba(40,44,52,.62);color:#fff;font:12px/16px system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .15s;z-index:5}' +
        '.occt-cue.on{opacity:1;transition-delay:.15s}.occt-cue i{width:9px;height:9px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:occt-cue-spin .8s linear infinite}' +
        '@keyframes occt-cue-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(css);
      cueEl = document.createElement('div');
      cueEl.className = 'occt-cue';
      cueEl.innerHTML = '<i></i><span>Rebuilding…</span>';
      cueEl.setAttribute('aria-hidden', 'true');
      vp.appendChild(cueEl);
    }
    cueEl.classList.toggle('on', !!on);
  }
  // (re)start the quiet window; when it ends with the button up, build the latest model
  function quietThen() {
    if (st.quietTimer) clearTimeout(st.quietTimer);
    st.quietTimer = setTimeout(function () {
      st.quietTimer = 0;
      if (held) { quietThen(); return; }
      request(); settle();
    }, QUIET);
  }
  (UI.onBuild = UI.onBuild || []).push(afterBuild);

  // ---- r11/occtswap11: Edit Feature's rolled-back part (ui-core.js rollbackTo) on OpenCascade. While OpenCascade
  // drives the part, the same rollback is asked of it as soon as the edit opens (occt-worker.js `upto`: the first n
  // features straight from its rebuild cache, which stays as it is); its exact solid replaces Anvil's rolled-back
  // part (UI.rollbackSwap) once that is shown, after the same checks as the whole part (valid, every feature built,
  // volume agrees). If Anvil's rolled-back part is ready first, the viewport keeps its frame for up to ROLL_HOLD ms
  // so Anvil's facets do not flash in between; a failed or slow answer leaves Anvil's rolled-back part.
  var rb = { seq: 0, want: 0, n: null, result: null, anvil: null, hold: false, t0: 0 };
  var ROLL_HOLD = 400;
  (UI.onRollbackWant = UI.onRollbackWant || []).push(function (n) {
    rb.want = 0; rb.result = null; rb.anvil = null; endRollHold();
    if (!st.on || !st.ready || !st.worker || !st.driving || isAsm() || !App.model) return;
    var model; try { model = JSON.parse(JSON.stringify(App.model)); } catch (e) { return; }
    rb.want = ++rb.seq; rb.n = n; rb.t0 = performance.now(); st.rollbackMs = null;
    st.worker.postMessage({ type: 'build', seq: rb.want, model: model, upto: n });
  });
  (UI.onRollbackShown = UI.onRollbackShown || []).push(function (n) {
    if (!rb.want || rb.n !== n) return;
    rb.anvil = App.build;
    if (rb.result) { swapRollback(); return; }
    if (UI.holdFrame && st.swap === 'wait') { UI.holdFrame(ROLL_HOLD); rb.hold = true; cue(true); }   // r12/occtui12: 'quick' cross-fades instead
  });
  (UI.onRollbackEnd = UI.onRollbackEnd || []).push(function () {
    rb.want = 0; rb.result = null; rb.anvil = null; endRollHold();
    var d = st.rollDeferred; st.rollDeferred = null;
    // once ui-core.js has put the whole part back (✗); after ✓ a newer build is asked for, so this one is stale
    if (d) Promise.resolve().then(function () {
      if (d.seq !== st.want || App.rollback != null || st.busy || !st.on) return;
      accept(d.result); settle(); refresh();
    });
  });
  function endRollHold() {
    if (!rb.hold) return;
    rb.hold = false; releaseHold();
    if (!st.busy) cue(false);
  }
  function rollbackBuilt(m) {
    if (m.seq !== rb.want) return;
    var r = m.type === 'built' ? m.result : null;
    if (r) learn(r);
    var ok = r && !r.unsupported && r.valid && r.mesh && Object.keys(r.status || {}).every(function (id) { return r.status[id] === 'ok'; });
    if (!ok) { rb.want = 0; endRollHold(); return; }
    rb.result = r;
    if (rb.anvil && App.rollback === rb.n && App.build === rb.anvil) swapRollback();
  }
  function swapRollback() {
    var r = rb.result, ab = App.build, am = App.mesh, n = rb.n;
    rb.result = null; rb.want = 0;
    try {
      // Anvil's rolled-back part is the reference, as for the whole part (accept)
      var av = am && am.triCount ? K.massProps(am, 1).volume : 0, dv = av ? Math.abs(r.volume - av) / av : Math.abs(r.volume);
      var beyond = Object.keys((ab && ab.errors) || {}).filter(function (id) { return r.status[id] === 'ok'; });
      if (beyond.length || dv <= (r.tolerance || 1e-4)) {
        var b = OcctKernel.toBuild(r, ab, am, App.triShared, window.CSG, K), fade = fadeSnap();   // r12/occtui12
        if (UI.rollbackSwap && UI.rollbackSwap(b, { upto: n, anvil: ab, edges: r.edges, curves: r.curves, normals: r.normals })) st.rollbackMs = performance.now() - rb.t0;
        if (fade) fadeRun();
      }
    } catch (e) { console.warn(e); }
    endRollHold();
  }

  // set(on, { remember: false }): switch without storing the choice (the test pages)
  function set(on, opts) {
    st.on = !!on; st.chosen = true;   // any explicit switch wins over the installed-engine default below
    if (!opts || opts.remember !== false) { try { localStorage.setItem('anvil.occt', st.on ? '1' : '0'); } catch (e) { } }
    if (st.on) { if (st.state === 'failed') stopWorker(); st.state = 'loading'; request(); }   // after a failed load, a fresh worker tries again (and says why if it fails again)
    else {
      stopWorker(); st.state = 'off'; st.result = null;
      if (st.driving && st.anvilBuild) swapIn(st.anvilBuild);
      if (isAsm() && App.asmCache) { App.asmCache = null; st.asmOcct = null; if (UI.rebuild) UI.rebuild({ noSave: true }); }   // OpenCascade's cached parts out
      st.driving = false; st.anvilBuild = null;
      settle();
    }
    refresh();
  }
  function refresh() { if (UI.refreshStatus && App.model) UI.refreshStatus(); }   // the engine probe can answer before the first model loads
  // r12/occtui12: swapMode() -> 'quick' | 'wait'; swapMode(mode, { remember: false }?) sets it. Switching to 'quick'
  // ends a frame held right now (the quick result shows at once); a pending exact solid then fades in
  function swapMode(mode, opts) {
    if (!arguments.length) return st.swap;
    if (mode !== 'quick' && mode !== 'wait') throw new Error('swapMode: "quick" or "wait"');
    st.swap = mode;
    if (!opts || opts.remember !== false) { try { localStorage.setItem('anvil.occtSwap', mode); } catch (e) { } }
    if (mode === 'quick' && App.holdFrameUntil > performance.now()) { releaseHold(); if (st.cueOn) cue(false); endRollHold(); }
    if (UI.refreshTaskPane) UI.refreshTaskPane();
    return mode;
  }
  var SWAP_TEXT = { quick: 'Show the quick result first', wait: 'Wait for the exact solid' };
  var SWAP_TIP = { quick: 'After an edit, Anvil\'s own result shows at once and OpenCascade\'s exact solid fades in a moment later.',
    wait: 'After an edit, the view keeps the previous exact solid (up to 1.5 s, with a Rebuilding… cue) until the new exact solid is ready: no faceted frame, but edits feel slower.' };
  // Tools ▸ OpenCascade kernel ▸ … (ui-panels.js Tools menu)
  function menuItems() {
    var on = st.on, toastFn = UI.toast || function () { };
    return [
      { label: 'OpenCascade kernel ▸ Use OpenCascade (exact solids)', checked: on, action: function () { set(!st.on); toastFn(st.on ? 'OpenCascade builds every part too: true faces for picking, volumes cross-checked' : 'OpenCascade kernel off'); } },
      { label: 'OpenCascade kernel ▸ ' + SWAP_TEXT.quick, checked: st.swap === 'quick', disabled: !on, action: function () { swapMode('quick'); toastFn('After an edit: the quick result first, the exact solid fades in'); } },
      { label: 'OpenCascade kernel ▸ ' + SWAP_TEXT.wait, checked: st.swap === 'wait', disabled: !on, action: function () { swapMode('wait'); toastFn('After an edit: the view waits for the exact solid'); } },
      { label: 'OpenCascade kernel ▸ Engine file…', action: engineDialog }
    ];
  }
  // the Options task pane section (ui-app.js tpProps): the switch and the two swap choices as radio buttons
  function optionsSection(redraw) {
    var box = document.createElement('div');
    box.className = 'occt-opts';
    box.innerHTML = '<h3>OpenCascade kernel</h3>';
    function line(html, input, tip) {
      var l = document.createElement('label');
      l.className = 'occt-opt'; l.title = tip || '';
      l.appendChild(input); l.appendChild(document.createElement('span')).innerHTML = html;
      box.appendChild(l);
      return l;
    }
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = st.on; cb.setAttribute('data-role', 'occt-on');
    cb.addEventListener('change', function () { set(cb.checked); if (redraw) redraw(); });
    line('Build parts with OpenCascade (exact solids)', cb, 'Tools ▸ OpenCascade kernel');
    var sub = document.createElement('div'); sub.className = 'occt-opt-head'; sub.textContent = 'After an edit';
    box.appendChild(sub);
    ['quick', 'wait'].forEach(function (m) {
      var r = document.createElement('input'); r.type = 'radio'; r.name = 'occt-swap'; r.value = m; r.checked = st.swap === m; r.disabled = !st.on;
      r.setAttribute('data-role', 'occt-swap-' + m);
      r.addEventListener('change', function () { if (r.checked) swapMode(m); });
      line(SWAP_TEXT[m] + (m === 'quick' ? ' <small>(default)</small>' : ''), r, SWAP_TIP[m]).classList.add('sub');
    });
    var p = document.createElement('p');
    p.innerHTML = '<small>' + SWAP_TIP[st.swap] + '</small>';
    box.appendChild(p);
    if (!document.getElementById('occt-opts-css')) {
      var css = document.createElement('style'); css.id = 'occt-opts-css';
      css.textContent = '.occt-opts .occt-opt{display:flex;align-items:center;gap:6px;margin:3px 0;cursor:default}.occt-opts .occt-opt.sub{padding-left:14px}' +
        '.occt-opts .occt-opt-head{margin:6px 0 2px;color:var(--muted)}.occt-opts .occt-opt input{margin:0}.occt-opts .occt-opt input:disabled+span{color:var(--muted)}';
      document.head.appendChild(css);
    }
    return box;
  }
  UI.occtMenuItems = menuItems; UI.occtOptionsSection = optionsSection;

  // UI.faceGroups (ui-core.js) asks this first: on OpenCascade's solid every polygon knows its B-rep face, so a
  // face group is every mesh face whose polygons carry the same face index
  UI.occtFaceGroups = function (mesh) {
    if (!mesh.faces.length || !mesh.faces[0].polys || !mesh.faces[0].polys[0] || mesh.faces[0].polys[0].face == null) return null;
    var of = new Array(mesh.faces.length), by = {};
    for (var i = 0; i < mesh.faces.length; i++) {
      var p = mesh.faces[i].polys[0], k = p && p.face != null ? p.face + '|' + (mesh.faces[i].body || 0) : null;   // r4/asm4: B-rep face ids repeat across assembly components
      if (k == null) { of[i] = [i]; continue; }
      (by[k] = by[k] || []).push(i);
    }
    Object.keys(by).forEach(function (k) { by[k].forEach(function (i) { of[i] = by[k]; }); });
    return of;
  };

  function status() {
    var r = st.result;
    return { on: st.on, state: st.state, driving: st.driving, error: st.error, loadMs: st.loadMs,
      unsupported: r && r.unsupported || null, faces: r && !r.unsupported ? r.faces.length : null, bodies: r ? r.bodies : null,
      volume: r ? r.volume : null, anvilVolume: st.anvilVolume, volumeDiff: st.volumeDiff, tolerance: r ? r.tolerance : null, beyond: st.state === 'ok' && st.beyond ? st.beyond.slice() : [],
      valid: r ? r.valid : null, ms: r ? r.ms : null, failedFeature: st.state === 'featureError' ? st.failedFeature : null };
  }
  // the status bar chip (ui-panels.js refreshStatus)
  var CHIP_DELAY = 300;
  UI.occtStatusHtml = function () {
    if (!st.on) return '';
    // a quick build keeps the last chip (no flicker to "building…" and back on every edit); a slow one says so after
    // CHIP_DELAY ms (smooth/responsive)
    if (st.state === 'building' && st.lastChip && performance.now() - (st.buildingSince || 0) < CHIP_DELAY) {
      if (!st.chipTimer) st.chipTimer = setTimeout(function () { st.chipTimer = 0; if (st.state === 'building') refresh(); }, CHIP_DELAY);
      return st.lastChip;
    }
    // r12/occtui12: colours say who is shown: green, OpenCascade's exact solid; blue (pulsing dot), working; amber,
    // Anvil's result shown because OpenCascade cannot build the part (yet); red, OpenCascade failed or disagrees
    // (click: What's Wrong). "Not installed" opens the engine file dialog.
    var s = status(), txt, cls = 'occt', tip = 'OpenCascade kernel (Tools ▸ OpenCascade kernel)', act = '';
    switch (s.state) {
      case 'loading': txt = 'OpenCascade: starting…'; cls += ' busy'; tip += ': the engine is loading (once per session)'; break;
      case 'building': txt = 'OpenCascade: rebuilding…'; cls += ' busy'; tip += st.swap === 'wait' ? ': the exact solid is on its way; the view keeps the previous one meanwhile' : ': the exact solid is on its way; Anvil\'s quick result is shown meanwhile'; break;
      case 'ok':
        txt = 'OpenCascade ✓ ' + s.faces + ' face' + (s.faces === 1 ? '' : 's') + (s.beyond.length ? ' (+' + s.beyond.length + ' Anvil could not)' : ''); cls += ' ok';
        tip += ': the part shown is OpenCascade\'s solid (every feature built, volume ' + (s.volume || 0).toFixed(3) + (s.beyond.length ? '; ' + s.beyond.length + ' feature' + (s.beyond.length === 1 ? '' : 's') + ' Anvil\'s own kernel could not build' : ', Anvil ' + (s.anvilVolume || 0).toFixed(3)) + ')';
        break;
      case 'unsupported': txt = 'OpenCascade: needs ' + s.unsupported; cls += ' warn'; act = 'whatswrong'; tip += ': this part uses a feature it does not build yet; Anvil\'s own result is shown'; break;
      case 'mismatch': txt = 'OpenCascade ✗ volume differs'; cls += ' bad'; act = 'whatswrong'; tip += ': ' + (s.volume || 0).toFixed(3) + ' vs Anvil ' + (s.anvilVolume || 0).toFixed(3) + '; Anvil\'s result is shown'; break;
      case 'featureError': txt = 'OpenCascade ✗ ' + (st.failedFeature || 'a feature'); cls += ' bad'; act = 'whatswrong'; tip += ': OpenCascade could not build ' + (st.failedFeature || 'a feature') + ' (' + (s.error || '') + '); Anvil\'s own result is shown'; break;
      case 'invalid': txt = 'OpenCascade ✗ invalid solid'; cls += ' bad'; act = 'whatswrong'; tip += ': Anvil\'s result is shown'; break;
      case 'assembly': txt = 'OpenCascade: no parts to build'; break;
      case 'empty': txt = 'OpenCascade: no solid'; tip += ': the part has no solid yet'; break;
      case 'failed':
        if (/integrity check/.test(s.error || '')) { txt = 'OpenCascade ✗ integrity check failed'; cls += ' bad'; tip = (s.error || '') + ' Anvil\'s own kernel is used.'; break; }
        txt = 'OpenCascade not installed'; cls += ' warn'; act = 'occt-engine'; tip = (s.error || '') + ' Run vendor/get-occt.ps1, or click to pick the engine file.'; break;
      case 'error': txt = 'OpenCascade ✗ error'; cls += ' bad'; act = 'whatswrong'; tip = s.error || ''; break;
      default: txt = 'OpenCascade';
    }
    if (act === 'whatswrong') tip += ' (click for What\'s Wrong)';
    var html = '<span class="' + cls + '"' + (act ? ' data-act="' + act + '"' : '') + ' title="' + tip.replace(/"/g, '&quot;') + '">' + txt + '</span>';
    if (s.state !== 'building') st.lastChip = html;
    return html;
  };

  // importFile(format, text) -> Promise of { solids: [{ name, positions, triangles }], faces, ms }: a STEP / IGES file
  // read by OpenCascade (any surfaces); the engine is started for it when the switch is off
  var imports = {}, importSeq = 0;
  function importFile(format, text) {
    return new Promise(function (res, rej) {
      if (!window.Worker) { rej(new Error('This browser has no Web Workers.')); return; }
      if (st.state === 'failed') { rej(new Error(st.error || 'OpenCascade is not installed (run vendor/get-occt.ps1).')); return; }
      if (!st.worker) startWorker();
      if (!st.worker) { rej(new Error(st.error || 'OpenCascade did not start.')); return; }
      var s = ++importSeq;
      imports[s] = { res: res, rej: rej };
      st.worker.postMessage({ type: 'import', seq: s, format: format, text: text });
    });
  }

  UI.occt = { set: set, on: function () { return st.on; }, status: status, importFile: importFile, canImport: function () { return !!window.Worker && st.state !== 'failed'; },
    engineDialog: engineDialog, useEngineFile: useEngineFile, storedEngine: storedEngine, forgetEngine: function () { return storeEngine(null); },
    swapMode: swapMode, fades: function () { return st.fades; } };   // r12/occtui12
  // true while a build of the current model is queued, running or held back (the drawing sheet waits for it, r4/drawings4)
  UI.occt.pending = function () { return !!(st.on && pendingWork()); };
  // r11/occtswap11: Edit Feature's rolled-back part on OpenCascade: { pending, ms (ask -> shown), estimate (ms) of the
  // next build, cue }
  UI.occt.rollback = function () { return { pending: !!rb.want, ms: st.rollbackMs != null ? st.rollbackMs : null, estimate: st.estMs, cue: !!st.cueOn }; };
  if (window.anvil) {
    // anvil.occt() -> status; anvil.occt(true | false) switches it; anvil.occtIdle() resolves when the current build
    // has answered (or at once when nothing is pending)
    window.anvil.occt = function (on, opts) { if (arguments.length) set(on, opts); return status(); };
    window.anvil.occtIdle = function () {
      return new Promise(function (res) { if (!st.on || (!pendingWork() && st.state !== 'loading')) res(status()); else st.waiters.push(res); });
    };
  }
  if (st.on) request();
  else if (stored == null && window.fetch && window.Worker) {
    // the plain engine (vendor/get-occt.ps1), or the gzipped one the published copy ships (occt-worker.js unpacks it
    // and checks its fingerprint before it runs)
    var probe = function (f) { return fetch('vendor/occt/' + f, { method: 'HEAD' }).then(function (res) { return res.ok; }, function () { return false; }); };
    probe('opencascade.full.wasm').then(function (ok) { return ok || probe('opencascade.full.wasm.gz'); })
      .then(function (ok) { return ok || storedEngine().then(function (b) { return !!b; }); })   // or a file the user picked earlier
      .then(function (ok) {
      if (ok && !st.chosen) { set(true, { remember: false }); st.chosen = false; }
    });
  }
})(UI);
