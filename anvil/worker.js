// worker.js — Anvil's rebuild worker. Runs Kernel.rebuild off the main thread so the UI stays responsive while a
// heavy feature tree builds. No DOM, no three.js: only csg.js, kernel.js and exchange.js are loaded (paths relative to
// this file).
//
// Messages in (from ui-core.js):
//   { type: 'rebuild', seq: <number>, model: <model JSON> }
//     `model` is a structured clone of App.model; Kernel.rebuild writes sketch profiles onto this copy, which is
//     harmless here and is how the reply's `profiles` are produced.
// Messages out:
//   { type: 'built', seq, build: <Kernel.packBuild result> }   with the packed solids' ArrayBuffers transferred
//   { type: 'error', seq, message: <string> }                  when the rebuild itself threw (feature errors never do;
//                                                              they are reported inside build.errors)
// The worker keeps the rebuild cache between messages, so only the features after the first change are rebuilt.
importScripts('csg.js', 'kernel.js', 'holewizard.js', 'exchange.js'); // exchange.js hooks Kernel.rebuild for Imported features

var cache = null;

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type !== 'rebuild') return;
  try {
    var b = Kernel.rebuild(m.model, cache);
    cache = b.cache;
    var packed = Kernel.packBuild(b, m.model);
    self.postMessage({ type: 'built', seq: m.seq, build: packed }, Kernel.packTransferables(packed));
  } catch (err) {
    cache = null;
    self.postMessage({ type: 'error', seq: m.seq, message: (err && err.message) || String(err) });
  }
};
