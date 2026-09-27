// ui-occt.js — Tools ▸ OpenCascade kernel (experimental). While it is on, every part rebuild is also built by
// OpenCascade (occt-kernel.js in occt-worker.js, a separate module worker so the 50 MB engine loads only then):
//   - the status bar shows the result: "OpenCascade ✓ 12 faces", "OpenCascade: needs fillet", or a mismatch;
//   - its volume is checked against Anvil's own (relative 1e-4) and the result is only used when they agree;
//   - picking uses its true B-rep faces: each face of Anvil's mesh is mapped to the OpenCascade face it lies on
//     (OcctKernel.mapFaces), and UI.faceGroups groups by that instead of by surface records.
// Anvil's kernel still builds the model and draws it; OpenCascade supplies topology and the cross-check. The switch
// is remembered in localStorage 'anvil.occt'. Assemblies are skipped. Without vendor/occt (vendor/get-occt.ps1)
// the status says so and nothing else changes.
(function (UI) {
  'use strict';
  var App = UI.App, K = window.Kernel;
  var st = App.occt = { on: false, worker: null, ready: false, loadMs: null, seq: 0, want: 0, busy: false,
    state: 'off', result: null, mesh: null, faceOf: null, anvilVolume: null, error: null, waiters: [] };
  try { st.on = localStorage.getItem('anvil.occt') === '1'; } catch (e) { }

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
    if (m.type === 'error' && m.seq === -1) { st.state = 'failed'; st.error = m.message; settle(); refresh(); return; }
    st.busy = false;
    if (m.seq !== st.want) { request(); return; }   // the model changed meanwhile: build the newer one
    if (m.type === 'error') { st.state = 'error'; st.error = m.message; st.result = null; clearMapping(); }
    else accept(m.result);
    settle();
    refresh();
  }
  function accept(r) {
    st.result = r; st.error = null;
    st.anvilVolume = App.mesh && App.mesh.triCount ? K.massProps(App.mesh, 1).volume : 0;
    if (r.unsupported) { st.state = 'unsupported'; clearMapping(); return; }
    var dv = st.anvilVolume ? Math.abs(r.volume - st.anvilVolume) / st.anvilVolume : Math.abs(r.volume);
    st.volumeDiff = dv;
    if (!r.valid) { st.state = 'invalid'; clearMapping(); return; }
    if (!(dv <= 1e-4) || !r.mesh) { st.state = 'mismatch'; clearMapping(); return; }
    st.state = 'ok';
    st.mesh = App.mesh;
    st.faceOf = window.OcctKernel ? OcctKernel.mapFaces(App.mesh, r, 0.25) : null;
    if (App.mesh) App.mesh._faceGroups = null;
    UI.updateHighlights();
  }
  function clearMapping() { st.faceOf = null; st.mesh = null; if (App.mesh) App.mesh._faceGroups = null; }
  function settle() { if (st.busy) return; var w = st.waiters; st.waiters = []; w.forEach(function (fn) { fn(status()); }); }

  // post the current model (newest wins: one build in flight, the latest request replaces older ones)
  function request() {
    if (!st.on || isAsm() || !App.model) { settle(); return; }
    if (!st.worker) { startWorker(); return; }
    if (!st.ready || st.busy) return;
    st.busy = true; st.want = ++st.seq; st.state = 'building';
    var model; try { model = JSON.parse(JSON.stringify(App.model)); } catch (e) { st.busy = false; return; }
    st.worker.postMessage({ type: 'build', seq: st.want, model: model });
    refresh();
  }
  // after every applied Anvil build (ui-core.js applyBuild calls the UI.onBuild hooks)
  function afterBuild() {
    clearMapping();
    if (!st.on) return;
    if (isAsm()) { st.state = 'assembly'; refresh(); return; }
    if (st.busy) { st.want = -1; return; }   // the in-flight reply is stale now; onMessage asks again
    request();
  }
  (UI.onBuild = UI.onBuild || []).push(afterBuild);

  function set(on) {
    st.on = !!on;
    try { localStorage.setItem('anvil.occt', st.on ? '1' : '0'); } catch (e) { }
    if (st.on) { st.state = 'loading'; request(); } else { stopWorker(); st.state = 'off'; st.result = null; clearMapping(); settle(); }
    refresh();
  }
  function refresh() { if (UI.refreshStatus) UI.refreshStatus(); }

  // UI.faceGroups (ui-core.js) asks this first: groups of mesh faces on one OpenCascade face, or null
  UI.occtFaceGroups = function (mesh) {
    if (!st.on || st.state !== 'ok' || !st.faceOf || st.mesh !== mesh) return null;
    var of = new Array(mesh.faces.length), by = {};
    for (var i = 0; i < mesh.faces.length; i++) {
      var k = st.faceOf[i];
      if (k < 0) { of[i] = [i]; continue; }
      (by[k] = by[k] || []).push(i);
    }
    Object.keys(by).forEach(function (k) { by[k].forEach(function (i) { of[i] = by[k]; }); });
    return of;
  };

  function status() {
    var r = st.result;
    return { on: st.on, state: st.state, error: st.error, loadMs: st.loadMs,
      unsupported: r && r.unsupported || null, faces: r && !r.unsupported ? r.faces.length : null, bodies: r ? r.bodies : null,
      volume: r ? r.volume : null, anvilVolume: st.anvilVolume, volumeDiff: st.volumeDiff != null ? st.volumeDiff : null,
      valid: r ? r.valid : null, ms: r ? r.ms : null, mapped: st.faceOf ? Array.prototype.filter.call(st.faceOf, function (x) { return x >= 0; }).length : 0 };
  }
  // the status bar chip (ui-panels.js refreshStatus)
  UI.occtStatusHtml = function () {
    if (!st.on) return '';
    var s = status(), txt, cls = 'occt', tip = 'OpenCascade kernel (Tools ▸ OpenCascade kernel)';
    switch (s.state) {
      case 'loading': txt = 'OpenCascade: loading…'; break;
      case 'building': txt = 'OpenCascade: building…'; break;
      case 'ok': txt = 'OpenCascade ✓ ' + s.faces + ' face' + (s.faces === 1 ? '' : 's'); cls += ' ok'; tip += ': every feature built, volume matches Anvil (' + (s.volumeDiff * 100).toExponential(0) + ' %), picking uses its faces'; break;
      case 'unsupported': txt = 'OpenCascade: needs ' + s.unsupported; tip += ': this part uses a feature it does not build yet; Anvil\'s kernel is used'; break;
      case 'mismatch': txt = 'OpenCascade ✗ volume differs'; cls += ' bad'; tip += ': ' + (s.volume || 0).toFixed(3) + ' vs Anvil ' + (s.anvilVolume || 0).toFixed(3); break;
      case 'invalid': txt = 'OpenCascade ✗ invalid solid'; cls += ' bad'; break;
      case 'assembly': txt = 'OpenCascade: parts only'; break;
      case 'failed': txt = 'OpenCascade not installed'; cls += ' bad'; tip = (s.error || '') + ' Run vendor/get-occt.ps1.'; break;
      case 'error': txt = 'OpenCascade ✗ error'; cls += ' bad'; tip = s.error || ''; break;
      default: txt = 'OpenCascade';
    }
    return '<span class="' + cls + '" title="' + tip.replace(/"/g, '&quot;') + '">' + txt + '</span>';
  };

  UI.occt = { set: set, on: function () { return st.on; }, status: status };
  if (window.anvil) {
    // anvil.occt() -> status; anvil.occt(true | false) switches it; anvil.occtIdle() resolves when the current build
    // has answered (or at once when nothing is pending)
    window.anvil.occt = function (on) { if (arguments.length) set(on); return status(); };
    window.anvil.occtIdle = function () {
      return new Promise(function (res) { if (!st.on || (!st.busy && st.state !== 'loading')) res(status()); else st.waiters.push(res); });
    };
  }
  if (st.on) request();
})(UI);
