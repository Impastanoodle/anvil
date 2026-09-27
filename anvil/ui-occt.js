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
  var st = App.occt = { on: false, worker: null, ready: false, loadMs: null, seq: 0, want: 0, busy: false,
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
  function stopWorker() { if (st.worker) st.worker.terminate(); st.worker = null; st.ready = false; st.busy = false; }

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
    st.busy = false;
    if (m.seq !== st.want) { request(); return; }   // the model changed meanwhile: build the newer one
    if (m.type === 'error') { st.state = 'error'; st.error = m.message; st.result = null; }
    else accept(m.result);
    settle();
    refresh();
  }
  // OpenCascade answered for the model Anvil's build on screen was made from (the sequence numbers match)
  function accept(r) {
    st.result = r; st.error = null; st.volumeDiff = null;
    var anvilBuild = App.build, anvilMesh = App.mesh;
    st.anvilVolume = anvilMesh && anvilMesh.triCount ? K.massProps(anvilMesh, 1).volume : 0;
    if (r.unsupported) { st.state = 'unsupported'; return; }
    if (!r.valid) { st.state = 'invalid'; return; }
    var dv = st.anvilVolume ? Math.abs(r.volume - st.anvilVolume) / st.anvilVolume : Math.abs(r.volume);
    st.volumeDiff = dv;
    // features Anvil's kernel failed that OpenCascade built (a fillet on a saddle edge, ...): Anvil's volume is no
    // reference any more, OpenCascade's valid solid is shown and those errors are cleared
    st.beyond = Object.keys((anvilBuild && anvilBuild.errors) || {}).filter(function (id) { return r.status[id] === 'ok'; });
    if (!r.mesh || (!st.beyond.length && !(dv <= (r.tolerance || 1e-4)))) { st.state = 'mismatch'; return; }
    var build;
    try { build = OcctKernel.toBuild(r, anvilBuild, anvilMesh, App.triShared, window.CSG, K); }
    catch (e) { st.state = 'error'; st.error = 'Could not show the OpenCascade solid: ' + e.message; return; }
    st.state = 'ok';
    st.anvilBuild = anvilBuild;
    st.driving = true;
    App.sel = null; App.sel2 = null; App.hover = null;   // face indices refer to the other mesh
    UI.applyBuild(build, { noSave: true, keepMs: true, occt: true });
  }
  function settle() { if (st.busy) return; var w = st.waiters; st.waiters = []; w.forEach(function (fn) { fn(status()); }); }

  // post the current model (newest wins: one build in flight, the latest request replaces older ones)
  function request() {
    if (!st.on || isAsm() || !App.model) { settle(); return; }
    if (!st.worker) { startWorker(); return; }
    if (!st.ready || st.busy) return;
    st.busy = true; st.want = ++st.seq; st.state = 'building';
    var model; try { model = JSON.parse(JSON.stringify(App.model)); } catch (e) { st.busy = false; return; }
    st.worker.postMessage({ type: 'build', seq: st.want, model: model, exports: true });
    refresh();
  }
  // after every applied build (ui-core.js applyBuild calls the UI.onBuild hooks); OpenCascade's own apply is skipped
  function afterBuild(build, opts) {
    if (opts && opts.occt) return;
    st.driving = false; st.anvilBuild = null;
    if (!st.on) return;
    if (isAsm()) { st.state = 'assembly'; refresh(); return; }
    if (st.busy) { st.want = -1; return; }   // the in-flight reply is stale now; onMessage asks again
    request();
  }
  (UI.onBuild = UI.onBuild || []).push(afterBuild);

  // set(on, { remember: false }): switch without storing the choice (the test pages)
  function set(on, opts) {
    st.on = !!on; st.chosen = true;   // any explicit switch wins over the installed-engine default below
    if (!opts || opts.remember !== false) { try { localStorage.setItem('anvil.occt', st.on ? '1' : '0'); } catch (e) { } }
    if (st.on) { st.state = 'loading'; request(); }
    else {
      stopWorker(); st.state = 'off'; st.result = null;
      if (st.driving && st.anvilBuild) { App.sel = null; App.sel2 = null; App.hover = null; UI.applyBuild(st.anvilBuild, { noSave: true, keepMs: true, occt: true }); }
      st.driving = false; st.anvilBuild = null;
      settle();
    }
    refresh();
  }
  function refresh() { if (UI.refreshStatus) UI.refreshStatus(); }

  // UI.faceGroups (ui-core.js) asks this first: on OpenCascade's solid every polygon knows its B-rep face, so a
  // face group is every mesh face whose polygons carry the same face index
  UI.occtFaceGroups = function (mesh) {
    if (!mesh.faces.length || !mesh.faces[0].polys || !mesh.faces[0].polys[0] || mesh.faces[0].polys[0].face == null) return null;
    var of = new Array(mesh.faces.length), by = {};
    for (var i = 0; i < mesh.faces.length; i++) {
      var p = mesh.faces[i].polys[0], k = p ? p.face : null;
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
      valid: r ? r.valid : null, ms: r ? r.ms : null };
  }
  // the status bar chip (ui-panels.js refreshStatus)
  UI.occtStatusHtml = function () {
    if (!st.on) return '';
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
      case 'invalid': txt = 'OpenCascade ✗ invalid solid'; cls += ' bad'; tip += ': Anvil\'s result is shown'; break;
      case 'assembly': txt = 'OpenCascade: parts only'; break;
      case 'failed': txt = 'OpenCascade not installed'; cls += ' bad'; tip = (s.error || '') + ' Run vendor/get-occt.ps1.'; break;
      case 'error': txt = 'OpenCascade ✗ error'; cls += ' bad'; tip = s.error || ''; break;
      default: txt = 'OpenCascade';
    }
    return '<span class="' + cls + '" title="' + tip.replace(/"/g, '&quot;') + '">' + txt + '</span>';
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
      return new Promise(function (res) { if (!st.on || (!st.busy && st.state !== 'loading')) res(status()); else st.waiters.push(res); });
    };
  }
  if (st.on) request();
  else if (stored == null && window.fetch && window.Worker) {
    fetch('vendor/occt/opencascade.full.wasm', { method: 'HEAD' }).then(function (res) {
      if (res.ok && !st.chosen) { set(true, { remember: false }); st.chosen = false; }
    }, function () { });
  }
})(UI);
