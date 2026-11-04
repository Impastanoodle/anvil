// index.js — loads occt_native.node (OpenCascade 7.6.3 for Windows behind Node-API) and shapes it into an `oc` object
// like the one opencascade.js (the WebAssembly engine) gives, for the part of the API Anvil uses: classes and their
// constructor overloads (oc.gp_Pnt_3), prototype methods with inheritance, statics (oc.BRepGProp.VolumeProperties_1),
// enums whose members are objects with .value (one object per member, so === works), Handle_X with get() / IsNull(),
// delete(), and oc.FS (writeFile / readFile / unlink) for the STEP / IGES files, kept in a temporary folder.
// This file is copied next to occt_native.node and the OpenCascade DLLs (collect.js); load() -> oc.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let cached = null;

function named(name, f) { Object.defineProperty(f, 'name', { value: name }); return f; }

function load() {
  if (cached) return cached;
  // the OpenCascade DLLs sit next to the addon (Windows looks there for a DLL's own dependencies; PATH as well)
  process.env.PATH = __dirname + path.delimiter + (process.env.PATH || '');
  const nat = require(path.join(__dirname, 'occt_native.node'));
  const oc = {};
  const built = {}, raws = [];
  function ensure(name) {
    if (built[name]) return built[name];
    const d = nat.classes[name];
    if (!d) throw new Error('native OpenCascade: no class ' + name);
    const parent = d.parent ? ensure(d.parent) : null;
    const own = d.ctors[name];
    const F = own || named(name, function () { throw new TypeError(name + ' has no accessible constructor'); });
    const proto = Object.create(parent ? parent.prototype : Object.prototype);
    Object.defineProperty(proto, 'constructor', { value: F, writable: true, configurable: true });
    Object.keys(d.methods).forEach((m) => { Object.defineProperty(proto, m, { value: d.methods[m], writable: true, configurable: true }); });
    if (!parent) {
      Object.defineProperty(proto, 'delete', { value: nat.delete, writable: true, configurable: true });
      Object.defineProperty(proto, 'isDeleted', { value: nat.isDeleted, writable: true, configurable: true });
    }
    F.prototype = proto;
    Object.keys(d.statics).forEach((s) => { F[s] = d.statics[s]; });
    Object.keys(d.ctors).forEach((js) => {
      if (js === name) return;
      const G = d.ctors[js];
      G.prototype = Object.create(proto, { constructor: { value: G, writable: true, configurable: true } });
      oc[js] = G;
    });
    const raw = named(name, function () { });
    raw.prototype = proto;
    raws[d.id] = raw;
    oc[name] = F;
    built[name] = F;
    return F;
  }
  Object.keys(nat.classes).forEach(ensure);

  // enums: a function with one member object per value (embind's shape)
  const enumObjs = {};
  Object.keys(nat.enums).forEach((name) => {
    const E = named(name, function () { throw new TypeError(name + ' is an enum'); });
    E.values = {};
    const objs = {};
    nat.enums[name].forEach(([m, v]) => {
      const M = named(name + '_' + m, function () { });
      const o = Object.create(M.prototype);
      o.value = v;
      E[m] = o; objs[m] = o;
      if (!(v in E.values)) E.values[v] = o;
    });
    oc[name] = E;
    enumObjs[name] = objs;
  });
  nat.setup(raws, enumObjs);

  // oc.FS: emscripten's in-memory file system as Anvil uses it ('/anvil-export.step' ...), on a temporary folder
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-occt-'));
  process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { } });
  const real = (p) => path.join(root, String(p).replace(/^\/+/, '').replace(/[\\/]/g, '_'));
  oc.FS = {
    writeFile(p, data) { fs.writeFileSync(real(p), typeof data === 'string' ? data : Buffer.from(data.buffer || data, data.byteOffset || 0, data.byteLength)); },
    // text as the WebAssembly engine gives it: the file's own name in it (a STEP header's FILE_NAME) is the virtual one,
    // not the temporary folder, and lines end in LF (OpenCascade writes text files with CRLF on Windows)
    readFile(p, o) {
      const b = fs.readFileSync(real(p));
      if (!(o && (o.encoding === 'utf8' || o.encoding === 'utf-8'))) return new Uint8Array(b.buffer, b.byteOffset, b.length);
      return b.toString('utf8').split(real(p)).join(String(p)).replace(/\r\n/g, '\n');
    },
    unlink(p) { fs.unlinkSync(real(p)); },
    root
  };
  // the readers and writers take those file names: translate them to the folder
  const fileArg = [['XSControl_Reader', 'ReadFile'], ['STEPControl_Writer', 'Write'], ['IGESControl_Writer', 'Write_2'], ['IGESControl_Writer', 'Write_1']];
  fileArg.forEach(([c, m]) => {
    const F = oc[c];
    if (!F || !Object.prototype.hasOwnProperty.call(F.prototype, m)) return;
    const f = F.prototype[m];
    F.prototype[m] = named(m, function (p) { const a = Array.prototype.slice.call(arguments); if (typeof p === 'string' && p[0] === '/') a[0] = real(p); return f.apply(this, a); });
  });
  // ANVIL_OCCT_PARALLEL=1: OpenCascade's own threads (Booleans, meshing); oc.setParallel(on) switches it per build
  oc.setParallel = nat.setParallel;
  if (process.env.ANVIL_OCCT_PARALLEL && process.env.ANVIL_OCCT_PARALLEL !== '0') nat.setParallel(true);
  oc.occtVersion = nat.occtVersion;
  oc.native = true;
  cached = oc;
  return oc;
}

module.exports = { load };
