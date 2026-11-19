// lane QP (2026-11-19): which entity of Anvil's STEP OpenCascade's BRepCheck objects to. Writes the fuzz stack's STEP
// (or reads a .step file), reads it with STEPControl_Reader and checks every face, edge, vertex, wire and shell alone.
//   node test-reports/repros/occt-check-step.js turned 6028 [--save out.step]
//   node test-reports/repros/occt-check-step.js --file part.step
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || true); };
const g = require(path.join(here, 'anvil/headless/load.js')).load({});
const K = g.Kernel, X = g.Exchange;
let text;
if (flag('--file')) text = fs.readFileSync(flag('--file'), 'utf8');
else {
  const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/rfON.js'), 'utf8');
  const fuzz = new Function(src.slice(src.indexOf('// rfON-TABLE-BEGIN'), src.indexOf('// rfON-TABLE-END')) + '\nreturn rfONfuzz;')();
  const c = fuzz(args[0], +args[1]);
  let m = K.newModel('P');
  if (c.base) { K.runScript(m, c.base); const b0 = K.rebuild(m); m = X.newPartFromImport(X.importFile('b.step', X.exportSTEP(m, b0), { units: 'in' })); }
  K.runScript(m, c.code);
  const b = K.rebuild(m);
  text = X.exportSTEP(m, b);
  if (flag('--save')) fs.writeFileSync(flag('--save'), text);
}
(async () => {
  const { oc } = await require(path.join(here, 'anvil/headless/occt.js')).loadOpenCascade({});
  oc.FS.writeFile('/c.step', text);
  const rd = new oc.STEPControl_Reader_1();
  rd.ReadFile('/c.step'); rd.TransferRoots(new oc.Message_ProgressRange_1());
  const sh = rd.OneShape(), E = oc.TopAbs_ShapeEnum;
  const ok = (s) => { try { return new oc.BRepCheck_Analyzer(s, true, false).IsValid_2(); } catch (e) { return 'threw'; } };
  console.log('whole shape valid:', ok(sh));
  const ex = (s, k) => { const o = []; for (const x = new oc.TopExp_Explorer_2(s, k, E.TopAbs_SHAPE); x.More(); x.Next()) o.push(x.Current()); return o; };
  const pt = (v) => { const p = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex_1(v)); return [p.X(), p.Y(), p.Z()].map((x) => +x.toFixed(5)); };
  const SURF = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bezier', 'bspline', 'revolution', 'extrusion', 'offset', 'other'];
  ex(sh, E.TopAbs_SHELL).forEach((s, i) => {
    const bs = new oc.BRepCheck_Shell(oc.TopoDS.Shell_1(s));
    const st = (v) => (v && v.value != null ? v.value : v);
    console.log('shell', i, 'closed', st(bs.Closed(false)), 'orientation', st(bs.Orientation(false)), '(0 = no error; BRepCheck_Status enum)');
  });
  ex(sh, E.TopAbs_FACE).forEach((f, i) => {
    const v = ok(f);
    const ad = new oc.BRepAdaptor_Surface_2(oc.TopoDS.Face_1(f), true), t = ad.GetType();
    const wires = ex(f, E.TopAbs_WIRE).length;
    if (v !== true) console.log('face', i, SURF[t && t.value != null ? t.value : t], 'wires', wires, 'NOT VALID', ex(f, E.TopAbs_VERTEX).map(pt).slice(0, 8).map((p) => p.join(',')).join(' | '));
    ex(f, E.TopAbs_WIRE).forEach((w, j) => {
      const bw = new oc.BRepCheck_Wire(oc.TopoDS.Wire_1(w));
      const st = (v) => (v && v.value != null ? v.value : v);
      const c = st(bw.Closed(false)), o = st(bw.Orientation(oc.TopoDS.Face_1(f), false)), si = st(bw.SelfIntersect(oc.TopoDS.Face_1(f), new oc.TopoDS_Edge(), new oc.TopoDS_Edge(), false));
      if (c || o || si) console.log('  face', i, SURF[t && t.value != null ? t.value : t], 'wire', j, 'closed', c, 'orientation', o, 'selfIntersect', si, ex(w, E.TopAbs_VERTEX).map(pt).map((p) => p.join(',')).join(' | '));
    });
  });
  ex(sh, E.TopAbs_EDGE).forEach((e, i) => { const v = ok(e); if (v !== true) console.log('edge', i, 'NOT VALID', ex(e, E.TopAbs_VERTEX).map(pt).map((p) => p.join(',')).join(' -> ')); });
  // edges used by other than two faces (BRepCheck_Shell's NotClosed = 28 is a free edge)
  const faces = ex(sh, E.TopAbs_FACE), uses = [];
  faces.forEach((f, fi) => ex(f, E.TopAbs_EDGE).forEach((e) => {
    let u = uses.find((x) => x.e.IsSame(e));
    if (!u) { u = { e, faces: [] }; uses.push(u); }
    u.faces.push(fi);
  }));
  uses.forEach((u) => {
    const seam = u.faces.length === 2 && u.faces[0] === u.faces[1];
    if (u.faces.length !== 2 || (seam && false)) console.log('edge used by faces', JSON.stringify(u.faces), ex(u.e, E.TopAbs_VERTEX).map(pt).map((p) => p.join(',')).join(' -> '), 'degenerated', oc.BRep_Tool.Degenerated(oc.TopoDS.Edge_1(u.e)));
  });
  console.log('faces', faces.length, 'edges (unique)', uses.length);
  const CURV = ['line', 'circle', 'ellipse', 'hyperbola', 'parabola', 'bezier', 'bspline', 'offset', 'other'];
  if (flag('--faces')) String(flag('--faces')).split(',').map(Number).forEach((fi) => {
    const f = faces[fi], ad = new oc.BRepAdaptor_Surface_2(oc.TopoDS.Face_1(f), true), t = ad.GetType();
    console.log('face', fi, SURF[t && t.value != null ? t.value : t], 'orientation', f.Orientation_1().value != null ? f.Orientation_1().value : f.Orientation_1());
    ex(f, E.TopAbs_WIRE).forEach((w, j) => {
      console.log('  wire', j);
      ex(w, E.TopAbs_EDGE).forEach((e) => {
        const ca = new oc.BRepAdaptor_Curve_2(oc.TopoDS.Edge_1(e)), ct = ca.GetType(), u = uses.findIndex((x) => x.e.IsSame(e));
        console.log('    edge#' + u, CURV[ct && ct.value != null ? ct.value : ct], ex(e, E.TopAbs_VERTEX).map(pt).map((p) => p.join(',')).join(' -> '), 'faces', JSON.stringify(uses[u].faces));
      });
    });
  });
})();
