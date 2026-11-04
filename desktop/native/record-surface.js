// record-surface.js — records which parts of the opencascade.js API Anvil really uses, by watching the WebAssembly
// engine while Anvil runs (not by reading occt-kernel.js). headless/occt.js calls instrument(oc) when the environment
// variable ANVIL_OCCT_RECORD names a JSON file: every constructor overload, method, static function and enum member
// that is touched is counted with the kinds of its arguments and of its return value, and the file is merged with
// what earlier runs recorded when the process exits. gen.js turns the merged file (api-surface.json) into the C++
// of the native addon.
//
//   ANVIL_OCCT_RECORD=desktop/native/api-surface.json node anvil/headless/anvil.js example --all --occt
//   ANVIL_OCCT_RECORD=desktop/native/api-surface.json node anvil/headless/occt-tests.js
//
// Kinds: 'int' / 'real' (numbers), 'bool', 'string', 'undefined', 'null', 'enum:<Enum>', 'class:<Class>' (the class
// as opencascade.js names it without the constructor-overload suffix: a gp_Pnt_3 instance is 'class:gp_Pnt'),
// 'object' (a plain JS object), 'array'.
'use strict';
const fs = require('fs');

function instrument(oc, outFile) {
  const rec = { constructors: {}, methods: {}, statics: {}, enums: {}, fs: {} };
  const enumOf = new Map();      // enum value object -> [enum, member]
  const baseName = new Map();    // registered class name -> d.ts class name

  function className(o) {
    const reg = o.$$ && o.$$.ptrType && o.$$.ptrType.registeredClass;
    if (!reg) return null;
    let n = reg.name;
    if (baseName.has(n)) return baseName.get(n);
    let b = n;
    const m = /^(.*)_\d+$/.exec(n);
    if (m && typeof oc[m[1]] === 'function' && oc[n] && Object.getPrototypeOf(oc[n].prototype) === oc[m[1]].prototype) b = m[1];
    baseName.set(n, b);
    return b;
  }
  function kind(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'real';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'object') {
      if (enumOf.has(v)) return 'enum:' + enumOf.get(v)[0];
      const c = className(v);
      if (c) return 'class:' + c;
      if (Array.isArray(v)) return 'array';
      return 'object';
    }
    return typeof v;
  }
  function note(entry, args, ret, recv) {
    entry.count = (entry.count || 0) + 1;
    entry.args = entry.args || [];
    for (let i = 0; i < args.length; i++) {
      const k = kind(args[i]);
      entry.args[i] = entry.args[i] || [];
      if (entry.args[i].indexOf(k) < 0) entry.args[i].push(k);
    }
    if (ret !== undefined || entry.ret) {
      entry.ret = entry.ret || [];
      const k = kind(ret);
      if (entry.ret.indexOf(k) < 0) entry.ret.push(k);
    }
    if (recv) {
      entry.recv = entry.recv || [];
      const k = className(recv);
      if (k && entry.recv.indexOf(k) < 0) entry.recv.push(k);
    }
    if (ret && typeof ret === 'object' && ret.$$ && ret.$$.ptrType) {
      // the class embind actually hands back (a Geom_Plane out of Handle_Geom_Surface.get(): a downcast)
      entry.dyn = entry.dyn || [];
      const d = className(ret);
      if (entry.dyn.indexOf(d) < 0) entry.dyn.push(d);
    }
  }
  const slot = (o, a, b) => { o[a] = o[a] || {}; o[a][b] = o[a][b] || {}; return o[a][b]; };

  const keys = Object.keys(oc);
  // enums first: a function with `values` whose members carry `.value`
  keys.forEach((k) => {
    const v = oc[k];
    if (typeof v !== 'function' || !v.values || typeof v.values !== 'object') return;
    Object.keys(v).forEach((m) => { if (m !== 'values' && v[m] && typeof v[m] === 'object' && 'value' in v[m]) enumOf.set(v[m], [k, m]); });
    oc[k] = new Proxy(v, {
      get(t, p, r) {
        const x = Reflect.get(t, p, r);
        if (typeof p === 'string' && enumOf.has(x)) { rec.enums[k] = rec.enums[k] || []; if (rec.enums[k].indexOf(p) < 0) rec.enums[k].push(p); }
        return x;
      }
    });
  });
  const patched = new Set();
  const SKIP_STATIC = new Set(['length', 'name', 'prototype', 'argCount', 'values', 'caller', 'arguments']);
  keys.forEach((k) => {
    const C = oc[k];
    if (typeof C !== 'function' || enumOf.has(C) || !C.prototype || C.values) return;
    // methods on this class's own prototype (inherited ones are recorded under the class that declares them)
    const proto = C.prototype;
    if (!patched.has(proto)) {
      patched.add(proto);
      Object.getOwnPropertyNames(proto).forEach((m) => {
        if (m === 'constructor') return;
        const d = Object.getOwnPropertyDescriptor(proto, m);
        if (!d || typeof d.value !== 'function') return;
        const f = d.value;
        proto[m] = Object.assign(function () {
          const args = Array.prototype.slice.call(arguments);
          const r = f.apply(this, args);
          note(slot(rec.methods, k, m), args, r, this);
          return r;
        }, f);   // embind's count-overload dispatcher reads proto[m].overloadTable
      });
    }
    Object.getOwnPropertyNames(C).forEach((s) => {
      if (SKIP_STATIC.has(s)) return;
      const d = Object.getOwnPropertyDescriptor(C, s);
      if (!d || typeof d.value !== 'function' || !d.writable) return;
      const f = d.value;
      C[s] = Object.assign(function () {
        const args = Array.prototype.slice.call(arguments);
        const r = f.apply(this, args);
        note(slot(rec.statics, k, s), args, r);
        return r;
      }, f);
    });
    oc[k] = new Proxy(C, {
      construct(t, args, nt) {
        const o = Reflect.construct(t, args, nt);
        const e = rec.constructors[k] = rec.constructors[k] || {};
        note(e, args);
        return o;
      }
    });
  });
  if (oc.FS) {
    const F = oc.FS;
    ['writeFile', 'readFile', 'unlink'].forEach((m) => {
      const f = F[m];
      if (typeof f !== 'function') return;
      F[m] = function () { rec.fs[m] = (rec.fs[m] || 0) + 1; return f.apply(this, arguments); };
    });
  }
  if (outFile) process.on('exit', () => save(rec, outFile));
  return rec;
}

// merge b into a (counts add, kind lists union)
function mergeEntry(a, b) {
  a.count = (a.count || 0) + (b.count || 0);
  ['args'].forEach((f) => {
    if (!b[f]) return;
    a[f] = a[f] || [];
    b[f].forEach((ks, i) => { a[f][i] = a[f][i] || []; (ks || []).forEach((x) => { if (a[f][i].indexOf(x) < 0) a[f][i].push(x); }); });
  });
  ['ret', 'recv', 'dyn'].forEach((f) => {
    if (!b[f]) return;
    a[f] = a[f] || [];
    b[f].forEach((x) => { if (a[f].indexOf(x) < 0) a[f].push(x); });
  });
  return a;
}
function merge(a, b) {
  a = a || { constructors: {}, methods: {}, statics: {}, enums: {}, fs: {} };
  Object.keys(b.constructors || {}).forEach((k) => { a.constructors[k] = mergeEntry(a.constructors[k] || {}, b.constructors[k]); });
  ['methods', 'statics'].forEach((g) => {
    a[g] = a[g] || {};
    Object.keys(b[g] || {}).forEach((c) => {
      a[g][c] = a[g][c] || {};
      Object.keys(b[g][c]).forEach((m) => { a[g][c][m] = mergeEntry(a[g][c][m] || {}, b[g][c][m]); });
    });
  });
  Object.keys(b.enums || {}).forEach((e) => { a.enums[e] = a.enums[e] || []; b.enums[e].forEach((m) => { if (a.enums[e].indexOf(m) < 0) a.enums[e].push(m); }); });
  Object.keys(b.fs || {}).forEach((m) => { a.fs[m] = (a.fs[m] || 0) + b.fs[m]; });
  return a;
}
function sortKeys(o) {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  Object.keys(o).sort().forEach((k) => { out[k] = sortKeys(o[k]); });
  return out;
}
function save(rec, outFile) {
  let old = null;
  try { old = JSON.parse(fs.readFileSync(outFile, 'utf8')).recorded; } catch (e) { old = null; }
  const merged = merge(old ? merge(null, old) : null, rec);
  let doc = {};
  try { doc = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { doc = {}; }
  doc.recorded = sortKeys(merged);
  fs.writeFileSync(outFile, JSON.stringify(doc, null, 1) + '\n');
}

module.exports = { instrument, merge, save };
