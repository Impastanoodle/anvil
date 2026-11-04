// gen.js — writes the C++ of the native OpenCascade addon (src/generated/*) from
//   api-surface.json   what Anvil really calls (recorded by record-surface.js while Anvil runs on opencascade.js)
//   opencascade.full.d.ts   the typings of opencascade.js 2.0.0-beta (anvil/vendor/occt, from vendor/get-occt.ps1):
//                           the exact signature behind every overload name (BRepAlgoAPI_Cut_3, Edge_1, ...)
// The addon then gives Node an `oc` with the same names and behaviour as opencascade.js for that surface, so
// occt-kernel.js runs unchanged on OpenCascade 7.6.3 built natively. `node gen.js` also writes the resolved surface
// (every class, overload and signature) back into api-surface.json under "surface".
//
//   node desktop/native/gen.js [--dts path/to/opencascade.full.d.ts]
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, 'src', 'generated');
const SURFACE = path.join(HERE, 'api-surface.json');
function findDts() {
  const i = process.argv.indexOf('--dts');
  if (i > 0) return path.resolve(process.argv[i + 1]);
  const c = [path.join(HERE, '..', '..', 'anvil', 'vendor', 'occt', 'opencascade.full.d.ts')];
  for (const f of c) if (fs.existsSync(f)) return f;
  throw new Error('opencascade.full.d.ts not found (run anvil/vendor/get-occt.ps1, or pass --dts)');
}

// ---------------------------------------------------------------- d.ts
// classes[name] = { name, base, ctor: [params] | null (own constructor), overloads: { 'X_3': [params] },
//                   methods: { name: [{ params, ret, isStatic }] } }   params: [{ n, t }]
// enums[name] = [member, ...]
function parseParams(s) {
  s = s.trim();
  if (!s) return [];
  return s.split(/,\s*/).map((p) => { const m = /^(\w+)\??:\s*(.+)$/.exec(p.trim()); return m ? { n: m[1], t: m[2].trim() } : { n: '?', t: p.trim() }; });
}
function parseDts(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const classes = {}, enums = {};
  let cur = null, curEnum = null, curOver = null;
  for (const line of lines) {
    let m;
    if ((m = /^export declare type (\w+) = \{\s*$/.exec(line))) { curEnum = enums[m[1]] = []; cur = curOver = null; continue; }
    if (curEnum) { if ((m = /^\s+(\w+): \{\};/.exec(line))) curEnum.push(m[1]); else if (/^\}/.test(line)) curEnum = null; continue; }
    if ((m = /^export declare class (\w+)(?: extends (\w+))? \{\s*$/.exec(line))) {
      cur = classes[m[1]] = classes[m[1]] || { name: m[1], base: m[2] || null, ctor: null, overloads: {}, methods: {} };
      cur.base = m[2] || null; curOver = null; continue;
    }
    if ((m = /^\s+export declare class (\w+) extends (\w+) \{\s*$/.exec(line))) { curOver = { name: m[1], base: m[2] }; cur = null; continue; }
    if (curOver) {
      if ((m = /^\s+constructor\((.*)\);?\s*$/.exec(line))) {
        const b = classes[curOver.base] = classes[curOver.base] || { name: curOver.base, base: null, ctor: null, overloads: {}, methods: {} };
        b.overloads[curOver.name] = parseParams(m[1]);
      } else if (/^\s+\}/.test(line)) curOver = null;
      continue;
    }
    if (!cur) continue;
    if (/^\}/.test(line)) { cur = null; continue; }
    if ((m = /^\s+constructor\((.*)\);?\s*$/.exec(line))) { cur.ctor = parseParams(m[1]); continue; }
    if ((m = /^\s+(static\s+)?(\w+)\((.*)\):\s*(.+?);\s*$/.exec(line))) {
      const name = m[2];
      (cur.methods[name] = cur.methods[name] || []).push({ params: parseParams(m[3]), ret: m[4].trim(), isStatic: !!m[1] });
    }
  }
  return { classes, enums };
}

// ---------------------------------------------------------------- types
const REAL = new Set(['Standard_Real', 'number', 'Standard_ShortReal']);
const INT = new Set(['Standard_Integer', 'Standard_Size', 'Standard_Address', 'Standard_ExtCharacter', 'Standard_Byte', 'Standard_Utf8Char', 'Standard_Utf16Char', 'Standard_Utf32Char', 'Standard_WideChar']);
const BOOL = new Set(['Standard_Boolean', 'boolean']);
const STR = new Set(['Standard_CString', 'string', 'Standard_Character']);
// opencascade.js's typings sometimes name a template instance by another of its typedefs (Geom_BSplineCurve's knots
// are 'IntTools_CArray1OfReal'): the class embind registered for it
// (and 'Graphic3d_ZLayerId' for an int: every int typedef looks alike to it)
const ALIAS = { IntTools_CArray1OfReal: 'TColStd_Array1OfReal', Graphic3d_ZLayerId: 'Standard_Integer', Poly_MeshPurpose: 'Standard_Integer' };
function kindOf(t, D) {
  if (ALIAS[t]) t = ALIAS[t];
  if (REAL.has(t)) return 'real';
  if (INT.has(t)) return 'int';
  if (BOOL.has(t)) return 'bool';
  if (STR.has(t)) return 'string';
  if (t === 'void') return 'void';
  if (D.enums[t]) return 'enum';
  if (/^Handle_\w+$/.test(t) && D.classes[t]) return 'handle';
  if (D.classes[t]) return 'class';
  return 'unknown';
}
// the C++ name behind an opencascade.js name: the overload suffix _N goes when the class has a sibling with another N
function cppMember(name, siblings) {
  const m = /^(\w+?)_(\d+)$/.exec(name);
  if (!m) return name;
  return siblings.some((s) => s !== name && new RegExp('^' + m[1] + '_\\d+$').test(s)) ? m[1] : name;
}
// lines added after a constructor's arguments are read: the parallel switch (addon setParallel) turns on BRepMesh's
// own threads whatever occt-kernel.js asked for (Booleans read BOPAlgo's global parallel mode themselves)
const CTOR_HOOK = { BRepMesh_IncrementalMesh_2: 'a4 = a4 || g_parallel;' };
const isTransientIn = (D) => (n) => { for (let c = D.classes[n]; c; c = c.base ? D.classes[c.base] : null) if (c.name === 'Standard_Transient') return true; return false; };

function main() {
  const D = parseDts(findDts());
  const doc = JSON.parse(fs.readFileSync(SURFACE, 'utf8'));
  const R = doc.recorded;
  if (!R) throw new Error('api-surface.json has no "recorded" section (run record-surface.js first)');
  const isTransient = isTransientIn(D);
  const problems = [];

  // ---- resolve the recorded surface against the typings
  const ctors = [];      // { js, cls, params }
  const handleCalls = [];   // Handle_X constructors and methods: one template in runtime.h (HandleOps)
  Object.keys(R.constructors).sort().forEach((js) => {
    if (/^Handle_/.test(js)) { handleCalls.push(js); return; }
    if (D.classes[js] && D.classes[js].ctor) { ctors.push({ js, cls: js, params: D.classes[js].ctor }); return; }
    const m = /^(\w+)_(\d+)$/.exec(js);
    const base = m && D.classes[m[1]];
    if (base && base.overloads[js]) { ctors.push({ js, cls: m[1], params: base.overloads[js] }); return; }
    problems.push('constructor ' + js + ' not in the typings');
  });
  const methods = [];    // { cls, js, cpp, sigs: [{ params, ret, isStatic }], isStatic }
  ['methods', 'statics'].forEach((g) => Object.keys(R[g]).sort().forEach((cls) => Object.keys(R[g][cls]).sort().forEach((js) => {
    const C = D.classes[cls];
    if (!C) { problems.push(g + ' ' + cls + ' not in the typings'); return; }
    if (/^Handle_/.test(cls)) { if (['IsNull', 'get', 'Nullify'].indexOf(js) < 0) problems.push('Handle method ' + cls + '.' + js + ' is not in HandleOps'); handleCalls.push(cls + '.' + js); return; }
    const sigs = (C.methods[js] || []).filter((s) => s.isStatic === (g === 'statics'));
    if (!sigs.length) { problems.push(cls + '.' + js + ' not in the typings'); return; }
    methods.push({ cls, js, cpp: cppMember(js, Object.keys(C.methods)), sigs, isStatic: g === 'statics', rec: R[g][cls][js] });
  })));

  // ---- the classes the addon registers: every class named by the surface, and their ancestors
  const reg = new Set(), handles = new Set(), enumsUsed = new Set(Object.keys(R.enums || {}));
  const addType = (t) => {
    t = ALIAS[t] || t;
    const k = kindOf(t, D);
    if (k === 'enum') enumsUsed.add(t);
    else if (k === 'handle') { handles.add(t); addClass(t.slice(7)); }
    else if (k === 'class') addClass(t);
    else if (k === 'unknown') problems.push('type ' + t + ' unknown');
  };
  function addClass(n) { for (let c = D.classes[n]; c && !reg.has(c.name); c = c.base ? D.classes[c.base] : null) reg.add(c.name); }
  handleCalls.forEach((h) => addType(/^(Handle_\w+?)(_\d+)?(\.\w+)?$/.exec(h)[1]));
  ctors.forEach((c) => { addClass(c.cls); c.params.forEach((p) => addType(p.t)); });
  methods.forEach((m) => { addClass(m.cls); m.sigs.forEach((s) => { s.params.forEach((p) => addType(p.t)); if (s.ret !== 'void') addType(s.ret); }); (m.rec.recv || []).forEach(addClass); (m.rec.dyn || []).forEach(addType); });
  handles.forEach((h) => reg.delete(h));   // a Handle_X is generated from its own template
  const classList = Array.from(reg).sort(), handleList = Array.from(handles).sort(), enumList = Array.from(enumsUsed).sort();
  const ids = {};
  classList.forEach((n, i) => { ids[n] = i; });
  handleList.forEach((n, i) => { ids[n] = classList.length + i; });
  const parentOf = (n) => { for (let c = D.classes[n] && D.classes[n].base ? D.classes[D.classes[n].base] : null; c; c = c.base ? D.classes[c.base] : null) if (reg.has(c.name)) return c.name; return null; };
  const ancestors = (n) => { const out = []; for (let c = D.classes[n] && D.classes[n].base ? D.classes[D.classes[n].base] : null; c; c = c.base ? D.classes[c.base] : null) out.push(c.name); return out; };
  // static-only classes (TopoDS, BRep_Tool, BRepGProp ...) have nothing to construct or copy
  const instClasses = new Set();
  ctors.forEach((c) => instClasses.add(c.cls));
  methods.forEach((m) => { if (!m.isStatic) { instClasses.add(m.cls); (m.rec.recv || []).forEach((r) => instClasses.add(r)); } m.sigs.forEach((s) => { s.params.forEach((p) => { if (kindOf(p.t, D) === 'class') instClasses.add(p.t); }); if (kindOf(s.ret, D) === 'class') instClasses.add(s.ret); }); (m.rec.dyn || []).forEach((d) => { if (kindOf(d, D) === 'class') instClasses.add(d); }); });
  Array.from(instClasses).forEach((n) => ancestors(n).forEach((a) => instClasses.add(a)));
  // the classes JS can own (constructed, or a copy of a result): they get a deleter; abstract bases never do
  const owned = new Set(ctors.map((c) => c.cls));
  methods.forEach((m) => { m.sigs.forEach((s) => { const r = ALIAS[s.ret] || s.ret; if (kindOf(r, D) === 'class') owned.add(r); }); (m.rec.dyn || []).forEach((d) => { if (kindOf(d, D) === 'class') owned.add(d); }); });

  // ---- C++
  const cid = (n) => 'ID_' + n;
  const hdrs = new Set();
  classList.forEach((n) => hdrs.add(n));
  handleList.forEach((h) => hdrs.add(h.slice(7)));
  enumList.forEach((e) => hdrs.add(e));
  const H = [];
  H.push('// generated by desktop/native/gen.js from api-surface.json and opencascade.full.d.ts: do not edit');
  H.push('#pragma once', '#include "../runtime.h"');
  Array.from(hdrs).sort().forEach((h) => H.push('#include <' + h + '.hxx>'));
  H.push('namespace occt_native {');
  H.push('enum TypeIds {');
  classList.concat(handleList).forEach((n) => H.push('  ' + cid(n) + ' = ' + ids[n] + ','));
  H.push('  ID_COUNT = ' + (classList.length + handleList.length), '};');
  classList.forEach((n) => H.push('template<> struct TypeOf<' + n + '> { static const int id = ' + cid(n) + '; };'));
  handleList.forEach((n) => H.push('template<> struct TypeOf<opencascade::handle<' + n.slice(7) + '> > { static const int id = ' + cid(n) + '; };'));
  enumList.forEach((e, i) => H.push('template<> struct EnumOf<' + e + '> { static const int id = ' + i + '; };'));
  H.push('void RegisterTypes();', 'void RegisterBindings(Napi::Env env, Napi::Object out);', '}');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'surface.h'), H.join('\n') + '\n');

  // types.cc: TypeInfo per class / handle, enums
  const T = ['// generated by desktop/native/gen.js: do not edit', '#include "surface.h"', 'namespace occt_native {'];
  classList.forEach((n) => {
    const inst = instClasses.has(n), tr = isTransient(n), anc = ancestors(n).filter((a) => reg.has(a));
    T.push('static void* up_' + n + '(void* p, int to) {');
    T.push('  ' + n + '* x = static_cast<' + n + '*>(p);', '  switch (to) {', '    case ' + cid(n) + ': return x;');
    anc.forEach((a) => T.push('    case ' + cid(a) + ': return static_cast<' + a + '*>(x);'));
    T.push('  }', '  return nullptr;', '}');
    if (owned.has(n) && !tr) T.push('static void del_' + n + '(void* p) { delete static_cast<' + n + '*>(p); }');
    if (tr) {
      T.push('static void* fromT_' + n + '(Standard_Transient* t) { return dynamic_cast<' + n + '*>(t); }');
      T.push('static Standard_Transient* toT_' + n + '(void* p) { return static_cast<Standard_Transient*>(static_cast<' + n + '*>(p)); }');
    }
  });
  handleList.forEach((h) => T.push('static void* up_' + h + '(void* p, int to) { return to == ' + cid(h) + ' ? p : nullptr; }', 'static void del_' + h + '(void* p) { delete static_cast<opencascade::handle<' + h.slice(7) + '>*>(p); }'));
  T.push('void RegisterTypes() {', '  g_types.resize(ID_COUNT);');
  classList.forEach((n) => {
    const inst = instClasses.has(n), tr = isTransient(n), par = parentOf(n);
    T.push('  g_types[' + cid(n) + '] = new TypeInfo{ "' + n + '", ' + cid(n) + ', ' + (par ? cid(par) : -1) + ', ' + tr + ', false, up_' + n + ', ' + (owned.has(n) && !tr ? 'del_' + n : 'nullptr') + ', ' + (tr ? 'fromT_' + n + ', toT_' + n : 'nullptr, nullptr') + ', -1 };');
  });
  handleList.forEach((h) => T.push('  g_types[' + cid(h) + '] = new TypeInfo{ "' + h + '", ' + cid(h) + ', -1, false, true, up_' + h + ', del_' + h + ', nullptr, nullptr, ' + cid(h.slice(7)) + ' };'));
  T.push('  g_enums.resize(' + enumList.length + ');');
  enumList.forEach((e, i) => T.push('  g_enums[' + i + '] = new EnumInfo{ "' + e + '", { ' + D.enums[e].map((m) => '{ "' + m + '", (int)' + m + ' }').join(', ') + ' } };'));
  T.push('}', '}');
  fs.writeFileSync(path.join(OUT, 'types.cc'), T.join('\n') + '\n');

  // bindings: one native function per constructor overload, method name and static
  function argDecl(p, i) {
    p = { n: p.n, t: ALIAS[p.t] || p.t };
    const k = kindOf(p.t, D), v = 'info[' + i + ']';
    switch (k) {
      case 'real': return p.t === 'Standard_ShortReal' ? 'float a' + i + ' = (float)ArgReal(' + v + ');' : 'Standard_Real a' + i + ' = ArgReal(' + v + ');';
      case 'int': return 'Standard_Integer a' + i + ' = ArgInt(' + v + ');';
      case 'bool': return 'Standard_Boolean a' + i + ' = ArgBool(' + v + ');';
      case 'string': return 'std::string s' + i + ' = ArgString(' + v + '); Standard_CString a' + i + ' = s' + i + '.c_str();';
      case 'enum': return p.t + ' a' + i + ' = (' + p.t + ')ArgEnum(' + v + ', ' + enumList.indexOf(p.t) + ');';
      case 'handle': return 'opencascade::handle<' + p.t.slice(7) + '>& a' + i + ' = ArgObj<opencascade::handle<' + p.t.slice(7) + '> >(' + v + ', ' + cid(p.t) + ');';
      case 'class': return p.t + '& a' + i + ' = ArgObj<' + p.t + '>(' + v + ', ' + cid(p.t) + ');';
      default: problems.push('cannot pass ' + p.t); return '/* cannot pass ' + p.t + ' */';
    }
  }
  const B = [];
  const reg2 = [];   // registration lines
  function sigBody(call, s, ret, indent) {
    const out = [];
    s.params.forEach((p, i) => out.push(indent + argDecl(p, i)));
    const args = s.params.map((p, i) => 'a' + i).join(', ');
    if (ret === 'void') out.push(indent + call + '(' + args + ');', indent + 'return info.Env().Undefined();');
    else out.push(indent + 'return Ret(info.Env(), ' + call + '(' + args + '));');
    return out;
  }
  ctors.forEach((c) => {
    const fn = 'ctor_' + c.js, tr = isTransient(c.cls);
    B.push('static Napi::Value ' + fn + '(const Napi::CallbackInfo& info) {');
    B.push('  if (!info.IsConstructCall()) throw Napi::TypeError::New(info.Env(), "' + c.js + ' must be called with new");');
    B.push('  CheckCount(info, ' + c.params.length + ', "' + c.js + '");');
    B.push('  OCC_TRY');
    c.params.forEach((p, i) => B.push('    ' + argDecl(p, i)));
    if (CTOR_HOOK[c.js]) B.push('    ' + CTOR_HOOK[c.js]);
    B.push('    ' + c.cls + '* p = new ' + c.cls + '(' + c.params.map((p, i) => 'a' + i).join(', ') + ');');
    B.push('    Adopt(info.Env(), info.This().As<Napi::Object>(), ' + cid(c.cls) + ', p' + (tr ? ', p' : ', nullptr') + ');');
    B.push('    return info.Env().Undefined();');
    B.push('  OCC_CATCH', '}');
    reg2.push('  Ctor(env, out, "' + c.js + '", "' + c.cls + '", ' + fn + ');');
  });
  methods.forEach((m) => {
    const fn = (m.isStatic ? 's_' : 'm_') + m.cls + '_' + m.js;
    B.push('static Napi::Value ' + fn + '(const Napi::CallbackInfo& info) {');
    if (!m.isStatic) B.push('  ' + m.cls + '& self = ArgObj<' + m.cls + '>(info.This(), ' + cid(m.cls) + ');');
    B.push('  OCC_TRY');
    // self is a reference to the declaring class: no name hiding, and virtual methods still dispatch
    const call = m.isStatic ? m.cls + '::' + m.cpp : 'self.' + m.cpp;
    const byCount = {};
    m.sigs.forEach((s) => { byCount[s.params.length] = byCount[s.params.length] || s; });
    const counts = Object.keys(byCount).map(Number);
    if (counts.length === 1) {
      B.push('    CheckCount(info, ' + counts[0] + ', "' + m.cls + '.' + m.js + '");');
      sigBody(call, byCount[counts[0]], byCount[counts[0]].ret, '    ').forEach((l) => B.push(l));
    } else {
      B.push('    switch (info.Length()) {');
      counts.forEach((n) => { B.push('    case ' + n + ': {'); sigBody(call, byCount[n], byCount[n].ret, '      ').forEach((l) => B.push(l)); B.push('    }'); });
      B.push('    }', '    CheckCount(info, -1, "' + m.cls + '.' + m.js + '");', '    return info.Env().Undefined();');
    }
    B.push('  OCC_CATCH', '}');
    reg2.push('  ' + (m.isStatic ? 'Static' : 'Method') + '(env, out, "' + m.cls + '", "' + m.js + '", ' + fn + ');');
  });
  // handle methods: IsNull, get, Nullify (generic in runtime.h), per handle type
  handleList.forEach((h) => {
    const X = h.slice(7);
    reg2.push('  HandleType<' + X + '>(env, out, "' + h + '", ' + cid(h) + ', ' + cid(X) + ');');
  });
  // split the bindings over a few files so they compile in parallel
  const parts = 4, per = Math.ceil(B.length / parts);
  const files = [];
  let chunk = [], k = 0;
  const flush = () => { if (!chunk.length) return; files.push(chunk); chunk = []; };
  // keep functions whole: split at lines that start a function
  B.forEach((l) => { if (/^static Napi::Value /.test(l) && chunk.length >= per) flush(); chunk.push(l); });
  flush();
  const decls = [];
  files.forEach((lines, i) => {
    const names = lines.filter((l) => /^static Napi::Value /.test(l)).map((l) => /^static Napi::Value (\w+)/.exec(l)[1]);
    const body = lines.map((l) => l.replace(/^static Napi::Value /, 'Napi::Value '));
    names.forEach((n) => decls.push('Napi::Value ' + n + '(const Napi::CallbackInfo& info);'));
    fs.writeFileSync(path.join(OUT, 'bind' + i + '.cc'), ['// generated by desktop/native/gen.js: do not edit', '#include "surface.h"', 'namespace occt_native {'].concat(body).concat(['}']).join('\n') + '\n');
    k++;
  });
  for (let i = k; i < 8; i++) { const f = path.join(OUT, 'bind' + i + '.cc'); if (fs.existsSync(f)) fs.unlinkSync(f); }
  const RG = ['// generated by desktop/native/gen.js: do not edit', '#include "surface.h"', 'namespace occt_native {'].concat(decls);
  RG.push('void RegisterBindings(Napi::Env env, Napi::Object out) {');
  // classes in an order where a parent comes before its children
  const order = [], seen = new Set();
  const visit = (n) => { if (seen.has(n)) return; seen.add(n); const p = parentOf(n); if (p) visit(p); order.push(n); };
  classList.forEach(visit);
  order.forEach((n) => RG.push('  Class(env, out, "' + n + '", ' + cid(n) + ', ' + (parentOf(n) ? '"' + parentOf(n) + '"' : 'nullptr') + ');'));
  reg2.forEach((l) => RG.push(l));
  RG.push('}', '}');
  fs.writeFileSync(path.join(OUT, 'register.cc'), RG.join('\n') + '\n');

  // ---- the resolved surface, for people and the next generator run
  doc.surface = {
    note: 'resolved by gen.js: every constructor overload, method and static Anvil calls, with the opencascade.js signature',
    classes: classList.length, handles: handleList.length, enums: enumList.length, constructors: ctors.length, methods: methods.filter((m) => !m.isStatic).length, statics: methods.filter((m) => m.isStatic).length,
    constructorList: ctors.map((c) => c.js + '(' + c.params.map((p) => p.n + ': ' + p.t).join(', ') + ')'),
    methodList: methods.map((m) => (m.isStatic ? 'static ' : '') + m.cls + '.' + m.js + m.sigs.map((s) => '(' + s.params.map((p) => p.n + ': ' + p.t).join(', ') + '): ' + s.ret).join(' | ') + (m.cpp !== m.js ? '   [C++ ' + m.cpp + ']' : '')),
    handleList, enumList, classList,
    problems
  };
  fs.writeFileSync(SURFACE, JSON.stringify(doc, null, 1) + '\n');
  process.stdout.write('classes ' + classList.length + ', handles ' + handleList.length + ', enums ' + enumList.length + ', constructors ' + ctors.length + ', methods ' + methods.length + ', files ' + files.length + '\n');
  if (problems.length) process.stdout.write('problems:\n  ' + problems.join('\n  ') + '\n');
}

main();
