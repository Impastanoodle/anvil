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

  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function startWorker() {
    if (st.worker || !window.Worker) return;
    try { st.worker = new Worker('occt-worker.js', { type: 'module' }); }
    catch (e) { st.state = 'failed'; st.error = e.message; refresh(); return; }
    st.state = 'loading';
    st.worker.onmessage = onMessage;
    st.worker.onerror = function (e) { st.state = 'failed'; st.error = (e && e.message) || 'the OpenCascade worker did not start'; settle(); refresh(); };
  }
  function stopWorker() { if (st.worker) st.worker.terminate(); st.worker = null; st.ready = false; st.busy = false; heldResult = null; App.holdFrameUntil = 0; if (st.quietTimer) { clearTimeout(st.quietTimer); st.quietTimer = 0; } }

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
      return at ? { s: s, at: at } : null;
    }
    if (s.kind === 'edge') return s.edge && s.edge.mid ? { s: s, mid: s.edge.mid.slice(), len: s.edge.len } : null;
    return { s: s };
  }
  function selRestore(p) {
    if (!p) return null;
    var s = p.s, out = {}, k;
    if (s.kind !== 'face' && s.kind !== 'edge') return s;
    for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
    if (s.kind === 'face') {
      var hit = [];
      try { hit = App.mesh ? K.resolveFaces([{ at: p.at }], App.mesh, 0.5) : []; } catch (e) { }
      if (!hit.length) return null;
      out.index = hit[0];
      return out;
    }
    var best = null, bestD = Math.max(0.05, (p.len || 0) * 0.02);
    (App.edges || []).forEach(function (e) {
      if (e.smooth || !e.mid) return;
      var d = Math.hypot(e.mid[0] - p.mid[0], e.mid[1] - p.mid[1], e.mid[2] - p.mid[2]) + Math.abs((e.len || 0) - (p.len || 0));
      if (d < bestD) { bestD = d; best = e; }
    });
    if (!best) return null;
    out.edge = best; out.index = App.edges.indexOf(best);
    return out;
  }
  function isMeshSel(p) { return !!p && (p.s.kind === 'face' || p.s.kind === 'edge'); }
  function swapIn(build, edges, curves, normals) {
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
    st.worker.postMessage({ type: 'build', seq: st.want, model: model, exports: true, anvil: anvil });
    refresh();
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
      // OpenCascade drove the part and answers quickly: the viewport keeps its last frame (OpenCascade's solid) for up
      // to HOLD_MS instead of flashing Anvil's approximation before the exact solid swaps in (smooth/responsive)
      if (wasDriving && st.busy && st.lastOcctMs != null && st.lastOcctMs < HOLD_MS && UI.holdFrame) UI.holdFrame(HOLD_MS);
    }
  }
  var HOLD_MS = 280;
  function releaseHold() { App.holdFrameUntil = 0; }
  ['pointerdown', 'mousedown', 'wheel', 'keydown'].forEach(function (t) { window.addEventListener(t, releaseHold, true); });
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

  // set(on, { remember: false }): switch without storing the choice (the test pages)
  function set(on, opts) {
    st.on = !!on; st.chosen = true;   // any explicit switch wins over the installed-engine default below
    if (!opts || opts.remember !== false) { try { localStorage.setItem('anvil.occt', st.on ? '1' : '0'); } catch (e) { } }
    if (st.on) { st.state = 'loading'; request(); }
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
    var s = status(), txt, cls = 'occt', tip = 'OpenCascade kernel (Tools ▸ OpenCascade kernel)';
    switch (s.state) {
      case 'loading': txt = 'OpenCascade: loading…'; break;
      case 'building': txt = 'OpenCascade: building…'; break;
      case 'ok':
        txt = 'OpenCascade ✓ ' + s.faces + ' face' + (s.faces === 1 ? '' : 's') + (s.beyond.length ? ' (+' + s.beyond.length + ' Anvil could not)' : ''); cls += ' ok';
        tip += ': the part shown is OpenCascade\'s solid (every feature built, volume ' + (s.volume || 0).toFixed(3) + (s.beyond.length ? '; ' + s.beyond.length + ' feature' + (s.beyond.length === 1 ? '' : 's') + ' Anvil\'s own kernel could not build' : ', Anvil ' + (s.anvilVolume || 0).toFixed(3)) + ')';
        break;
      case 'unsupported': txt = 'OpenCascade: needs ' + s.unsupported; tip += ': this part uses a feature it does not build yet; Anvil\'s own result is shown'; break;
      case 'mismatch': txt = 'OpenCascade ✗ volume differs'; cls += ' bad'; tip += ': ' + (s.volume || 0).toFixed(3) + ' vs Anvil ' + (s.anvilVolume || 0).toFixed(3) + '; Anvil\'s result is shown'; break;
      case 'featureError': txt = 'OpenCascade ✗ ' + (st.failedFeature || 'a feature'); cls += ' bad'; tip += ': OpenCascade could not build ' + (st.failedFeature || 'a feature') + ' (' + (s.error || '') + '); Anvil\'s own result is shown'; break;
      case 'invalid': txt = 'OpenCascade ✗ invalid solid'; cls += ' bad'; tip += ': Anvil\'s result is shown'; break;
      case 'assembly': txt = 'OpenCascade: no parts to build'; break;
      case 'failed': txt = 'OpenCascade not installed'; cls += ' bad'; tip = (s.error || '') + ' Run vendor/get-occt.ps1.'; break;
      case 'error': txt = 'OpenCascade ✗ error'; cls += ' bad'; tip = s.error || ''; break;
      default: txt = 'OpenCascade';
    }
    var html = '<span class="' + cls + '" title="' + tip.replace(/"/g, '&quot;') + '">' + txt + '</span>';
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

  UI.occt = { set: set, on: function () { return st.on; }, status: status, importFile: importFile, canImport: function () { return !!window.Worker && st.state !== 'failed'; } };
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
    fetch('vendor/occt/opencascade.full.wasm', { method: 'HEAD' }).then(function (res) {
      if (res.ok && !st.chosen) { set(true, { remember: false }); st.chosen = false; }
    }, function () { });
  }
})(UI);
