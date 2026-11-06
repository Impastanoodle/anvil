// kernel-sheetmetal.js — Anvil kernel, sheet metal: edge flange (`buildFlange`, `flangeLayout`, `flangeProfile`), jog,
// normal cut, bend allowance and the flat pattern (`flatPattern`; its DXF export is in kernel-script.js). Loaded after
// kernel.js, kernel-sketch.js, kernel-curves.js, kernel-equations.js, kernel-mesh.js, kernel-rebuild.js and
// kernel-features.js. No DOM.
(function (K, _) {
  'use strict';
  var add = _.add, cross = _.cross, dot = _.dot, len = _.len, makePlane = _.makePlane, norm = _.norm, resolvePlane = _.resolvePlane, scale = _.scale, sub = _.sub, to2D = _.to2D, to3D = _.to3D, triangulate = _.triangulate;   // kernel.js
  var pointInPoly = _.pointInPoly, signedArea = _.signedArea;   // kernel-sketch.js
  var prism = _.prism, unionAll = _.unionAll, unionTree = _.unionTree;   // kernel-curves.js
  var resolvedModel = _.resolvedModel;   // kernel-equations.js
  var bodyEdges = _.bodyEdges, faceOutline = _.faceOutline, meshFromBody = _.meshFromBody, resolveEdges = _.resolveEdges;   // kernel-mesh.js
  var findFeature = _.findFeature;   // kernel-rebuild.js
  var faceLoopsClassified = _.faceLoopsClassified;   // kernel-features.js

  // ------------------------------------------------------------------ sheet metal: parameters and bend allowance
  // model.sheet = { thickness, bendRadius, kFactor, bendAllowanceType?, bendAllowance?, bendDeduction?, bendTable?,
  // gaugeTable?, gauge? } (makeSheet's order). bendAllowanceType is SolidWorks' "Bend Allowance" group: 'kfactor'
  // (default when absent), 'allowance' (a fixed BA), 'deduction' (a fixed BD) or 'table' (bendTable lookup).
  //
  // K is the usual K-factor: the neutral axis sits K·T from the inside face, so BA = θ·(R + K·T) (θ the bend angle in
  // radians, R the inside radius). Physical values lie between 0 and 0.5; SolidWorks (and Anvil, for a new part)
  // defaults to 0.5. Models saved before bend deductions existed always stored their K; one with a sheet but no stored
  // K keeps the old fallback 0.71 so its flat does not change.
  var DEFAULT_K = 0.5, LEGACY_K = 0.71, AUTO_RELIEF_RATIO = 0.5;
  var BA_TYPES = ['kfactor', 'allowance', 'deduction', 'table'];
  function sheetParams(model) {
    return model.sheet || { thickness: 2, bendRadius: 2, kFactor: DEFAULT_K };
  }
  // the K-factor a sheet uses (also the fallback of a bend table that has no row for a bend)
  function sheetKFactor(sheet) {
    var k = sheet ? sheet.kFactor : null;
    return k == null || k === '' || !isFinite(+k) ? LEGACY_K : +k;
  }
  // makeSheet(fields) -> model.sheet with its keys in one fixed order and only the fields that apply, so a sheet made
  // by a script, by the Sheet Metal PropertyManager or by a gauge pick serializes the same way. Values are kept as
  // given (numbers or "=" equation strings); kFactor is always stored.
  function makeSheet(o) {
    o = o || {};
    var s = { thickness: o.thickness, bendRadius: o.bendRadius != null ? o.bendRadius : o.thickness, kFactor: o.kFactor != null && o.kFactor !== '' ? o.kFactor : DEFAULT_K };
    var t = o.bendAllowanceType || 'kfactor';
    if (BA_TYPES.indexOf(t) < 0) throw new Error('Unknown bend allowance type "' + t + '" (kfactor, allowance, deduction or table).');
    if (t !== 'kfactor') s.bendAllowanceType = t;
    if (t === 'allowance') s.bendAllowance = o.bendAllowance;
    if (t === 'deduction') s.bendDeduction = o.bendDeduction;
    if (o.bendTable && o.bendTable.rows && o.bendTable.rows.length) s.bendTable = normBendTable(o.bendTable);
    else if (t === 'table') throw new Error('The bend table has no rows.');
    if (o.gaugeTable != null && o.gauge != null && o.gauge !== '') {
      var gt = typeof o.gaugeTable === 'object' ? null : gaugeTable(o.gaugeTable);   // a short name becomes the full one
      s.gaugeTable = gt && gt.name ? gt.name : o.gaugeTable; s.gauge = String(o.gauge);
    }
    // lane CS: Auto Relief (SolidWorks' Base Flange / Sheet-Metal group): the relief an Edge Flange without its own
    // gets where it stops short of the sheet's end: 'rect' | 'obround', ratio × T wide and ratio × T past the bend
    // (SolidWorks' default Rectangular, 0.5). Absent ('none'): no relief, as every sheet made before it.
    if (o.relief === 'rect' || o.relief === 'obround') { s.relief = o.relief; s.reliefRatio = o.reliefRatio != null && o.reliefRatio !== '' ? o.reliefRatio : AUTO_RELIEF_RATIO; }
    else if (o.relief === 'tear') s.relief = 'tear';   // lane rfIZ: SolidWorks' Tear (no ratio): see flangeLayout's relief
    else if (o.relief != null && o.relief !== 'none') throw new Error('Unknown auto relief type "' + o.relief + '" (rect, obround, tear or none).');
    if (typeof s.reliefRatio === 'number' && !(s.reliefRatio > 0)) throw new Error('Auto relief ratio must be greater than zero.');
    return s;
  }
  // bendTable = { kind: 'BA' | 'BD', name?, tolerance? (absolute, model units), rows: [{ thickness, radius, angle (°), value }] }
  function normBendTable(t) {
    var out = { kind: t.kind === 'BD' ? 'BD' : 'BA' };
    if (t.name) out.name = String(t.name);
    if (t.tolerance != null && t.tolerance !== '') out.tolerance = +t.tolerance;
    out.rows = (t.rows || []).map(function (r) { return { thickness: +r.thickness, radius: +r.radius, angle: +r.angle, value: +r.value }; })
      .filter(function (r) { return isFinite(r.thickness) && isFinite(r.radius) && isFinite(r.angle) && isFinite(r.value); });
    return out;
  }
  // Outside setback of a bend (SolidWorks' bend deduction definitions): up to 90° the flange dimensions run to the
  // virtual sharp, OSSB = (R + T)·tan(θ/2); beyond 90° they run to the tangent of the outside of the bend (the
  // outermost point of the bend, square to each flat), so OSSB = R + T. Continuous at 90°.
  function outsideSetback(angleRad, R, T) {
    return angleRad <= Math.PI / 2 + 1e-12 ? (R + T) * Math.tan(angleRad / 2) : R + T;
  }
  // BD = 2·OSSB − BA: the flat length is A + B − BD with A, B the outside flange dimensions defined above.
  function bendDeduction(angleRad, R, T, BA) { return 2 * outsideSetback(angleRad, R, T) - BA; }
  // bendTableLookup(table, T, R, angleDeg) -> { value, kind } or { error }. Rows match on thickness and radius within
  // the table's tolerance (default 0.5 % of the value, so 0.0598 finds a 0.060 row; the closest row wins); between the
  // matched rows' angles the value is interpolated linearly. Outside their angle range there is no value.
  function bendTableLookup(table, T, R, angleDeg) {
    var rows = (table && table.rows) || [], kind = table && table.kind === 'BD' ? 'BD' : 'BA';
    function tol(x) { return table && table.tolerance != null && isFinite(+table.tolerance) ? +table.tolerance : Math.max(1e-9, 0.005 * Math.abs(x)); }
    function pick(list, key, want) {
      var best = Infinity;
      list.forEach(function (r) { var d = Math.abs(+r[key] - want); if (d <= tol(want) && d < best) best = d; });
      return best === Infinity ? [] : list.filter(function (r) { return Math.abs(Math.abs(+r[key] - want) - best) < 1e-12; });
    }
    var hit = pick(pick(rows, 'thickness', T), 'radius', R);
    if (!hit.length) return { error: 'no row for T = ' + fmtN(T) + ', R = ' + fmtN(R) };
    var pts = hit.map(function (r) { return [+r.angle, +r.value]; }).sort(function (a, b) { return a[0] - b[0]; });
    var lo = pts[0][0], hi = pts[pts.length - 1][0], eps = 1e-6;
    if (angleDeg < lo - eps || angleDeg > hi + eps) return { error: 'no row for ' + fmtN(angleDeg) + '° at T = ' + fmtN(T) + ', R = ' + fmtN(R) + ' (rows ' + fmtN(lo) + '°–' + fmtN(hi) + '°)' };
    for (var i = 0; i < pts.length; i++) if (Math.abs(pts[i][0] - angleDeg) <= eps) return { value: pts[i][1], kind: kind };
    for (var j = 0; j + 1 < pts.length; j++) {
      var a = pts[j], b = pts[j + 1];
      if (angleDeg >= a[0] && angleDeg <= b[0]) return { value: a[1] + (b[1] - a[1]) * (angleDeg - a[0]) / (b[0] - a[0]), kind: kind };
    }
    return { error: 'no row for ' + fmtN(angleDeg) + '°' };
  }
  function fmtN(x) { return String(Math.round(x * 1e6) / 1e6); }
  // bendCalc(sheet, angleRad, R, T, custom) -> { BA, BD, type, source: 'sheet' | 'custom', value, K, warning }.
  // `custom` is a feature's Custom Bend Allowance { type: 'kfactor' | 'allowance' | 'deduction' | 'table', value }
  // (value: K, BA or BD; a custom 'table' uses the sheet's bend table), which wins over the sheet's method.
  // An entered BA or BD applies unchanged to every bend whatever its angle, as in SolidWorks (a bend table gives
  // angle-dependent values). A bend the table has no row for falls back to the sheet's K-factor with a warning.
  function bendCalc(sheet, angleRad, R, T, custom) {
    sheet = sheet || {};
    var source = custom && custom.type ? 'custom' : 'sheet';
    var type = source === 'custom' ? custom.type : (sheet.bendAllowanceType || 'kfactor');
    var K = sheetKFactor(sheet), deg = angleRad * 180 / Math.PI, warning = null, BA, value, k = null;
    var what = source === 'custom' ? 'Custom bend allowance' : 'Sheet metal';
    function need(v, label) {
      if (v == null || v === '' || !isFinite(+v)) throw new Error(what + ': ' + label + ' must be a number.');
      return +v;
    }
    if (type === 'kfactor') {
      k = source === 'custom' ? need(custom.value, 'K-factor') : K;
      BA = angleRad * (R + k * T); value = k;
    } else if (type === 'allowance') {
      value = need(source === 'custom' ? custom.value : sheet.bendAllowance, 'bend allowance');
      BA = value;
    } else if (type === 'deduction') {
      value = need(source === 'custom' ? custom.value : sheet.bendDeduction, 'bend deduction');
      BA = 2 * outsideSetback(angleRad, R, T) - value;
    } else if (type === 'table') {
      var tb = sheet.bendTable, r = tb ? bendTableLookup(tb, T, R, deg) : { error: 'the part has no bend table' };
      if (r.error) {
        warning = 'Bend table: ' + r.error + '; the K-factor ' + fmtN(K) + ' was used for that bend.';
        k = K; BA = angleRad * (R + K * T); value = K; type = 'kfactor';
      } else {
        value = r.value;
        BA = r.kind === 'BD' ? 2 * outsideSetback(angleRad, R, T) - r.value : r.value;
      }
    } else throw new Error(what + ': unknown bend allowance type "' + type + '" (kfactor, allowance, deduction or table).');
    if (!isFinite(BA)) throw new Error(what + ': the bend allowance is not a number.');
    if (BA < -1e-9) throw new Error(what + ': the bend deduction ' + fmtN(value) + ' is larger than twice the outside setback (' + fmtN(2 * outsideSetback(angleRad, R, T)) + ') of the ' + fmtN(deg) + '° bend: the bend allowance would be negative.');
    return { BA: Math.max(0, BA), BD: bendDeduction(angleRad, R, T, BA), type: type, source: source, value: value, K: k, warning: warning };
  }
  // the parameters for the flat-pattern note: "T=0.06 R=0.06 K=0.5", "… BD=0.105", "… BA=0.12", "… BEND TABLE (BD)"
  function sheetNote(sheet) {
    var s = sheet || {}, t = s.bendAllowanceType || 'kfactor';
    var head = (s.gauge != null ? s.gauge + ' GA ' : '') + 'T=' + fmtN(+s.thickness) + ' R=' + fmtN(+s.bendRadius);
    if (t === 'allowance') return head + ' BA=' + fmtN(+s.bendAllowance);
    if (t === 'deduction') return head + ' BD=' + fmtN(+s.bendDeduction);
    if (t === 'table') return head + ' BEND TABLE' + (s.bendTable && s.bendTable.name ? ' ' + s.bendTable.name : '') + ' (' + (s.bendTable && s.bendTable.kind === 'BD' ? 'BD' : 'BA') + ', K=' + fmtN(sheetKFactor(s)) + ' outside it)';
    return head + ' K=' + fmtN(sheetKFactor(s));
  }

  // ------------------------------------------------------------------ gauge tables (SolidWorks "Use gauge table")
  // Thicknesses are the published standard gauges (inches): Manufacturers' Standard Gauge for sheet steel, Brown &
  // Sharpe (AWG) for aluminium, U.S. Standard Gauge as commonly used for stainless. The bend radius (= T) and K (0.5)
  // in every row are EXAMPLES, not shop data: the UI labels them "example — replace with your shop's values".
  function gaugeRows(list) {
    return list.map(function (g) { return { gauge: String(g[0]), thickness: g[1], radius: g[1], kFactor: DEFAULT_K }; });
  }
  var GAUGE_TABLES = {
    'Steel (Manufacturers\' Standard Gauge)': { units: 'in', example: true, rows: gaugeRows([
      ['3', 0.2391], ['4', 0.2242], ['5', 0.2092], ['6', 0.1943], ['7', 0.1793], ['8', 0.1644], ['9', 0.1495], ['10', 0.1345],
      ['11', 0.1196], ['12', 0.1046], ['13', 0.0897], ['14', 0.0747], ['15', 0.0673], ['16', 0.0598], ['17', 0.0538],
      ['18', 0.0478], ['19', 0.0418], ['20', 0.0359], ['21', 0.0329], ['22', 0.0299], ['23', 0.0269], ['24', 0.0239],
      ['25', 0.0209], ['26', 0.0179], ['28', 0.0149], ['30', 0.0120]]) },
    'Aluminum (Brown & Sharpe)': { units: 'in', example: true, rows: gaugeRows([
      ['6', 0.1620], ['8', 0.1285], ['10', 0.1019], ['11', 0.0907], ['12', 0.0808], ['14', 0.0641], ['16', 0.0508],
      ['18', 0.0403], ['20', 0.0320], ['22', 0.0253], ['24', 0.0201]]) },
    'Stainless (U.S. Standard Gauge)': { units: 'in', example: true, rows: gaugeRows([
      ['7', 0.1875], ['8', 0.1719], ['10', 0.1406], ['11', 0.1250], ['12', 0.1094], ['14', 0.0781], ['16', 0.0625],
      ['18', 0.0500], ['20', 0.0375], ['22', 0.0312], ['24', 0.0250], ['26', 0.0188]]) }
  };
  Object.keys(GAUGE_TABLES).forEach(function (n) { GAUGE_TABLES[n].name = n; });
  var DEFAULT_GAUGE_TABLE = 'Steel (Manufacturers\' Standard Gauge)';
  // a table by name (built in), or the table object itself (a shop's own table: { name, units, rows: [{ gauge,
  // thickness, radius, kFactor? | bendDeduction? }] })
  function gaugeTable(ref) {
    if (ref && typeof ref === 'object') return ref;
    if (ref == null || ref === '') return GAUGE_TABLES[DEFAULT_GAUGE_TABLE];
    if (GAUGE_TABLES[ref]) return GAUGE_TABLES[ref];
    // (BW) a script names a built-in table the short way: "steel", "aluminum" / "aluminium", "stainless", any case,
    // or the start of the full name; the sheet stores the full name (makeSheet) so the PropertyManager finds it
    var want = String(ref).toLowerCase().replace(/aluminium/, 'aluminum').trim(), names = Object.keys(GAUGE_TABLES);
    var hit = names.filter(function (n) { var k = n.toLowerCase(); return k.split(' ')[0] === want || k.indexOf(want) === 0; });
    return hit.length === 1 ? GAUGE_TABLES[hit[0]] : null;
  }
  // gaugeRow(tableRef, gauge, units) -> { gauge, thickness, radius, kFactor? , bendDeduction? } in the model's units, or null
  function gaugeRow(ref, gauge, units) {
    var t = gaugeTable(ref);
    if (!t) return null;
    var g = String(gauge).replace(/\s*(ga|gauge|gage)\.?$/i, '').trim();
    var r = (t.rows || []).filter(function (x) { return String(x.gauge) === g; })[0];
    if (!r) return null;
    var k = (t.units || 'in') === (units === 'in' ? 'in' : 'mm') ? 1 : (t.units === 'in' ? 25.4 : 1 / 25.4);
    var out = { gauge: String(r.gauge), thickness: +r.thickness * k, radius: (r.radius != null ? +r.radius : +r.thickness) * k };
    if (r.bendDeduction != null) out.bendDeduction = +r.bendDeduction * k;
    else out.kFactor = r.kFactor != null ? +r.kFactor : DEFAULT_K;
    return out;
  }

  // ------------------------------------------------------------------ sheet metal: edge flange and flat pattern

  // Flange section in the (o, u) frame: o across the edge (outward), u along the fold. The strip o ∈ [-ov, 0] overlaps
  // the sheet so the union is watertight; the material actually added is the o >= 0 part (bend + wall).
  function flangeProfile(A, R, T, L, ov) {
    var segs = Math.max(4, Math.round(8 * A / (Math.PI / 2)));
    var inner = [], outer = [];
    for (var s = 0; s <= segs; s++) {
      var th = A * s / segs;
      inner.push([R * Math.sin(th), R - R * Math.cos(th)]);
      outer.push([(R + T) * Math.sin(th), R - (R + T) * Math.cos(th)]);
    }
    var tx = Math.cos(A), ty = Math.sin(A);
    var iEnd = [inner[segs][0] + tx * L, inner[segs][1] + ty * L], oEnd = [outer[segs][0] + tx * L, outer[segs][1] + ty * L];
    var loop = [[-ov, 0]].concat(inner, [iEnd, oEnd], outer.slice().reverse(), [[-ov, -T]]);
    if (signedArea(loop) < 0) loop.reverse();
    return loop;
  }
  // lane FX: bendCv(loop, c, radii) -> prism()'s per-segment curves for a bend section: segment i gets { c, r } (one
  // object per radius, so every facet of a bend surface shares one cylinder record) when both its ends lie on the
  // circle of radius r about c (flangeProfile: c = [0, R], radii R and R + T). prism attaches { t: 'cyl', o, d, r } to
  // those side facets, so massProps integrates the chords out to the true bend (mp.volume exact, mp.polygonal faceted)
  function bendCv(loop, c, radii) {
    var cs = radii.map(function (r) { return r > 0 ? { c: c.slice(), r: r } : null; }), n = loop.length, out = [], any = false;
    function on(p, r) { return Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r) <= 1e-9 * (1 + r); }
    for (var i = 0; i < n; i++) {
      var p = loop[i], q = loop[(i + 1) % n], C = null;
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-12) cs.forEach(function (x) { if (x && !C && on(p, x.r) && on(q, x.r)) C = x; });
      out.push(C);
      if (C) any = true;
    }
    return any ? out : null;
  }
  function secCv(loop, sec) { return bendCv(loop, [0, sec.R], [sec.R, sec.R + sec.T]); }

  // ---- flange edge resolution (r12/inchflange12). meshFromBody keys a face by its plane with the offset rounded to
  // 0.01 model units, so polygons of one face whose offsets differ by rounding noise land in two faces when the offset
  // sits on a rounding boundary: 0.075 in or 0.125 in, the top face of a 14 ga or 1/8 in sheet (a cut, the overlap
  // strip of an earlier flange or OpenCascade's per-triangle planes give such noise). The split face hid the picked
  // edge (or made the sheet face look smaller than the thickness face beside it), and the pick then fell on the edge
  // on the other side of the sheet, T away, which the old tolerance max(0.5, T) — 0.5 in on an inch part — accepted:
  // the flange folded the wrong way. coplanarBody(body) -> the body's polygons with every set of coplanar ones (normal
  // and offset equal within noise) sharing one plane, for meshing only (geometry, tags and the body are unchanged).
  // EDGE_PICK_TOL: a pick is accepted within this fraction of T of an edge, so it can never reach the opposite edge.
  var EDGE_PICK_TOL = 0.75;
  function coplanarBody(body) {
    var reps = [];
    return { polygons: body.polygons.map(function (p) {
      var n = p.plane.normal, w = p.plane.w, rep = null;
      for (var i = 0; i < reps.length && !rep; i++) {
        var r = reps[i];
        if (Math.abs(r.w - w) < 1e-8 && n.x * r.normal.x + n.y * r.normal.y + n.z * r.normal.z > 1 - 1e-10) rep = r;
      }
      if (!rep) { reps.push(p.plane); return p; }
      if (rep === p.plane) return p;
      var q = Object.create(p);
      q.plane = rep;
      return q;
    }) };
  }
  // ---- end r12/inchflange12

  // Edge flange: bend (inner radius R, thickness T, sweep angle) plus a flat wall of length L, swept along each
  // selected straight edge of a flat sheet face. "Bend outside" placement: the flange sits beyond the edge.
  // `miter`: flanges on two selected edges that share a corner are extended past it and clipped by the corner's
  // bisector plane (each keeps its own side, moved apart by miterGap/2), so they meet at a mitre.
  // `relief` ('rect' | 'obround'): where a flange end runs into more sheet (the plate continues beyond the end,
  // inline or on the outward side) a slot reliefWidth wide (default T) is cut from the base before the flange is
  // added, from reliefDepth (default T/2) inside the edge out past the bend zone. Ends shared with another selected
  // edge (mitred or collinear) get no relief.
  // flangeLayout(f, model, ctx) -> the flange as plain data, from the edges of ctx.body (a CSG): { parts: [{ loop,
  // plane, t0, t1, clips: [{ n, w }], voids?, band?, BA? }] (each a prism of the section `loop` in `plane` from t0 to t1,
  // kept where n·p >= w for each clip, less the holes / slots of the sheet across its bend: voids, see bendVoids), cuts: [{ loop, plane, a, b }] (prisms taken from the sheet first: trim-back and reliefs),
  // info (ctx.flanges' records), section: { A, R, T, L, ov } (flangeProfile's parameters) }. buildFlange builds it with
  // the CSG kernel; occt-kernel.js builds the same layout with exact bend arcs.
  var SWJ_CHORDS = 12;   // lane rfIZ: the true curve to 2e-6 in³ a corner on 16 ga (SolidWorks reads 1.5e-5 under it, as the first stage)
  function flangeLayout(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding edge flanges.');
    var sheet = sheetParams(model);
    var T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    if (f.hem && f.gap != null) R = Math.max(+f.gap / 2, 0.02 * T); // a hem whose gap was an equation: radius from the resolved gap
    var L = +f.length, A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180;
    // hem type (SolidWorks' Hem PropertyManager; absent = the legacy open hem): 'closed' folds flat with the minimum
    // gap 0.1 mm (SolidWorks), 'teardrop' / 'rolled' sweep hemAngle at hemRadius (see hemSection)
    var hemType = f.hem && f.hemType != null ? String(f.hemType) : null;
    if (hemType && HEM_TYPES.indexOf(hemType) < 0) throw new Error('Unknown hem type "' + hemType + '" (open, closed, teardrop or rolled).');
    var curl = hemType === 'teardrop' || hemType === 'rolled';
    var mmU = hemMM(model);
    if (hemType === 'closed') R = CLOSED_HEM_GAP_MM / 2 * mmU;
    if (curl) {
      R = f.hemRadius != null ? +f.hemRadius : +sheet.bendRadius;
      A = (f.hemAngle != null ? +f.hemAngle : DEFAULT_HEM_ANGLE[hemType]) * Math.PI / 180;
      var hs = hemSection(hemType, A, R, T, mmU);
      L = hs.L;
    } else if (f.hem) {
      // lane DI2 (SolidWorks 2022, rfDO): an open / closed hem's length is the overall length from the fold's outer
      // face to the free end; the straight leg is that less the fold (R + T)
      if (isFinite(L) && !(L - (R + T) > 1e-6)) throw new Error('Hem length must be longer than ' + fmtN(R + T) + ' (the fold, R + T).');
      L -= R + T;
    }
    // lane rfIZ: Flange Length end condition (SolidWorks' Edge-Flange: Blind | Up To Vertex). Up To Vertex runs the wall to
    // the vertex f.lengthVertex ([x, y, z]): 'normal' (default, SolidWorks' Normal to flange plane) ends the wall in the
    // plane through the vertex square to the wall; 'parallel' (Parallel to base flange) ends it where its top (the higher
    // end corner) is level with the vertex above the base. The reference the length is measured from does not move the
    // wall's end, so lengthRef is not read. One vertex for every edge of the feature; the first edge's frame sets it.
    var lengthEnd = f.hem || f.lengthEnd == null ? 'blind' : String(f.lengthEnd), upTo = lengthEnd === 'upToVertex', upToMode = f.lengthVertexMode == null ? 'normal' : String(f.lengthVertexMode), upToL = null;
    if (lengthEnd !== 'blind' && !upTo) throw new Error('Unknown flange length end condition "' + lengthEnd + '" (blind or upToVertex).');
    if (upTo) {
      if (!Array.isArray(f.lengthVertex) || f.lengthVertex.length !== 3 || !f.lengthVertex.every(function (x) { return isFinite(+x); })) throw new Error('Up To Vertex: pick the vertex the flange runs to.');
      if (upToMode !== 'normal' && upToMode !== 'parallel') throw new Error('Up To Vertex: the mode must be normal (to the flange plane) or parallel (to the base flange).');
      L = 1;
    }
    if (!isFinite(L)) throw new Error('Flange length must be a number.');
    if (!isFinite(A)) throw new Error('Flange angle must be a number.');
    if (!(L > 0) && !curl) throw new Error('Flange length must be greater than zero.');
    if (!(A > 0.01)) throw new Error('Flange angle must be greater than zero.');
    // flange length reference (SolidWorks' Flange Length group; absent = 'wall', Anvil's legacy): L is measured along
    // the wall to its end from the outer virtual sharp ('outer'), the inner virtual sharp ('inner'), the outside of the
    // bend ('tangent', SolidWorks' Tangent Bend: up to 90° the outer virtual sharp; beyond 90° the line tangent to the
    // bend's outer surface square to the wall, R + T before the wall starts, as outsideSetback) or the end of the bend
    // ('wall': L is the straight wall). L becomes the straight wall after the bend.
    var lengthRef = f.hem ? null : (f.lengthRef == null ? null : String(f.lengthRef));
    if (lengthRef && LENGTH_REFS.indexOf(lengthRef) < 0) throw new Error('Unknown flange length reference "' + lengthRef + '" (outer, inner, tangent or wall).');
    if (!upTo && (lengthRef === 'outer' || lengthRef === 'inner' || lengthRef === 'tangent')) {
      if (lengthRef !== 'tangent' && !(A < Math.PI - 0.01)) throw new Error('A flange length to the ' + lengthRef + ' virtual sharp needs an angle below 180°; use Tangent Bend.');
      var toSharp = lengthRef === 'tangent' ? outsideSetback(A, R, T) : (lengthRef === 'outer' ? R + T : R) * Math.tan(A / 2);
      var what = lengthRef === 'tangent' ? 'the outside of the bend' : 'the ' + lengthRef + ' virtual sharp';
      if (!(L - toSharp > 1e-6)) throw new Error('Flange length must be longer than ' + fmtN(toSharp) + ' (the bend, to ' + what + ').');
      L -= toSharp;
    }
    var miter = !!f.miter, gap = Math.max(0, +f.miterGap || 0);
    // a flange (not a hem, not a jog's halves) without its own relief takes the sheet's Auto Relief (makeSheet)
    var auto = f.type === 'flange' && !f.hem && f.relief == null && (sheet.relief === 'rect' || sheet.relief === 'obround' || sheet.relief === 'tear');
    var relief = auto ? sheet.relief : (f.relief === 'rect' || f.relief === 'obround' || f.relief === 'tear' ? f.relief : 'none');
    var ratio = auto && relief !== 'tear' ? +sheet.reliefRatio : NaN;
    if (auto && relief !== 'tear' && !(ratio > 0)) throw new Error('Auto relief ratio must be greater than zero.');
    // lane rfIZ: a flange's own relief ratio (SolidWorks' Custom Relief Type ▸ Use relief ratio): width and depth ratio × T
    if (!auto && relief !== 'none' && relief !== 'tear' && f.reliefRatio != null) {
      ratio = +f.reliefRatio;
      if (!(ratio > 0)) throw new Error('Relief ratio must be greater than zero.');
    }
    var rw = f.reliefWidth != null ? +f.reliefWidth : (ratio > 0 ? ratio * T : T), rd = f.reliefDepth != null ? +f.reliefDepth : (ratio > 0 ? ratio * T : T / 2);
    // lane rfIZ: Tear (SolidWorks: the sheet is torn at the bend's end, no relief cut out): a slit the Rip gap wide
    // (ripDefaultGap: 0.004 in / 0.1 mm, unless reliefWidth) reaching that far past the bend's start into the sheet, so
    // the bend's end and the sheet beside it do not touch along a line (not measured in SolidWorks)
    if (relief === 'tear') { rw = f.reliefWidth != null ? +f.reliefWidth : ripDefaultGap(model); rd = f.reliefDepth != null ? +f.reliefDepth : rw; }
    if (relief !== 'none' && !(rw > 0)) throw new Error('Relief width must be greater than zero.');
    if (relief !== 'none' && !(rd >= 0)) throw new Error('Relief depth must be zero or more.');
    var mesh = meshFromBody(coplanarBody(ctx.body));   // r12/inchflange12: see coplanarBody
    var edges = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
    var selected = resolveEdges((f.edges || []).map(function (e) { return { at: e.at, chain: false }; }), edges, EDGE_PICK_TOL * T);
    if (!selected.length) throw new Error('No edge selected for the flange.');
    if ((+f.startOffset || 0) !== 0 || (+f.endOffset || 0) !== 0) selected = miterOffsetEnds(selected, f);   // lane DL: Miter Flange start / end offsets
    // placement: 'bendOutside' (default: bend and wall beyond the edge), 'outside' (Material Outside: the wall's inner
    // face at the edge), 'inside' (Material Inside: the wall's outer face at the edge), 'virtualSharp' (Bend from
    // Virtual Sharp: the outer virtual sharp on the edge, so the base keeps its outside dimension at any angle; at 90°
    // the same as Material Inside). The base sheet is trimmed back by the shift so the bend takes its place. A hem's
    // hemPosition, when set, wins: 'inside' (Material Inside: the hem folds within the existing height) or 'outside'
    // (Bend Outside, the legacy placement).
    var position = f.position;
    if (f.hem && f.hemPosition != null) {
      if (f.hemPosition !== 'inside' && f.hemPosition !== 'outside') throw new Error('Unknown hem position "' + f.hemPosition + '" (inside or outside).');
      position = f.hemPosition === 'inside' ? 'inside' : 'bendOutside';
    }
    if (position === 'virtualSharp' && !(A < Math.PI - 0.01)) throw new Error('Bend from Virtual Sharp needs a flange angle below 180°.');
    // lane rfIZ: Tangent to Bend (SolidWorks' fifth Flange Position, for angles of 90° and more): the bend's outer surface
    // stays tangent to the plane of the sheet's side face, so the bend starts R + T back from the edge (not measured)
    if (position === 'tangentToBend' && !(A >= Math.PI / 2 - 1e-9)) throw new Error('Tangent to Bend needs a flange angle of 90° or more.');
    var shift = position === 'inside' || position === 'tangentToBend' ? R + T : (position === 'outside' ? R : (position === 'virtualSharp' ? (R + T) * Math.tan(A / 2) : 0));
    // SolidWorks 2022 (lanes DI2 and flanges, rfDO / rfGD, measured at 30° to 135°, 16 ga to 11 ga): at every angle
    // Material Inside keeps the wall's OUTER face running through the base's top outside edge, so the bend starts
    // ((R + T) − R·cos A) / sin A back from the edge and the outer virtual sharp lands s = −T·cot A past it. Material
    // Outside keeps the wall's INNER face through that edge: the bend starts R·tan(A/2) back and s = T·tan(A/2). Both
    // are the same as R + T and R at 90°, which stays bit for bit; hems (180°) keep them too.
    if (!f.hem && Math.abs(A - Math.PI / 2) > 1e-9 && A < Math.PI - 0.01) {
      if (position === 'inside') shift = ((R + T) - R * Math.cos(A)) / Math.sin(A);
      else if (position === 'outside') shift = R * Math.tan(A / 2);
    }
    // lane rfIZ: Flange Position ▸ Offset (SolidWorks: end condition Blind and a distance): the flange moves that far out
    // from where its position puts it, the sheet running on flat to its bend (a negative distance trims further back).
    // f.offset = { end: 'blind', distance } (or a number). Not on hems.
    var offD = 0;
    if (!f.hem && f.offset != null) {
      var offEnd = typeof f.offset === 'object' ? (f.offset.end == null ? 'blind' : String(f.offset.end)) : 'blind';
      if (offEnd !== 'blind') throw new Error('Flange offset: only the Blind end condition is supported.');
      offD = typeof f.offset === 'object' ? +f.offset.distance : +f.offset;
      if (!isFinite(offD)) throw new Error('Flange offset distance must be a number.');
    }
    shift -= offD;
    // overlap into the sheet so the union is watertight; a roll past 270° comes back round over that strip (its section
    // would cross itself past 300° at R = T), so it meets the sheet on the bend's start plane instead
    var ov = hemType === 'rolled' && A > 1.5 * Math.PI ? 0 : Math.min(T, 0.5);
    if (shift < 0) ov -= shift;   // lane rfIZ: an offset flange: the overlap strip carries the sheet out to the bend
    var tools = [], cuts = [], info = [], eds = [], trimTest = null;
    selected.forEach(function (e) {
      var fa = mesh.faces[e.faces[0]], fb = mesh.faces[e.faces[1]];
      if (Math.abs(dot(fa.normal, fb.normal)) > 0.05) throw new Error('Flange edges must be square edges of a flat face.');
      var flat = fa.area >= fb.area ? 0 : 1;
      var nF = e.normals[flat], nT = e.normals[1 - flat];
      var u = f.reverse ? scale(nF, -1) : nF;   // flange goes toward u
      if (f.toward && dot(u, f.toward) < 0) u = scale(u, -1); // an explicit world direction wins over `reverse`
      var o = nT;                               // outward, away from the sheet
      // the bend's inside face is the sheet face on the side the flange folds toward
      var origin = dot(u, nF) > 0 ? e.mid : sub(e.mid, scale(nF, T));
      if (shift < 0) origin = sub(origin, scale(o, shift));   // lane rfIZ: offset out past the edge
      else if (shift) {
        var cutPlane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
        var tca = dot(sub(e.a, e.mid), cutPlane.n), tcb = dot(sub(e.b, e.mid), cutPlane.n);
        // rfBZ: the trim runs 0.01 past an end of the edge only where the sheet stops there; where it continues (the
        // bend of an earlier flange on the neighbouring edge starts at this end) the trim stops exactly at the end, so
        // it no longer takes a 0.01 nick out of that bend
        if (!trimTest) trimTest = ctx.body.pointTester();
        var dAB = norm(sub(e.b, e.a));
        var cont = [[e.a, -1], [e.b, 1]].map(function (q) {
          var P = add(sub(q[0], scale(nF, T / 2)), scale(dAB, q[1] * Math.min(0.005, T / 4)));
          return trimTest(sub(P, scale(o, shift / 2))) || trimTest(sub(P, scale(o, Math.min(shift / 8, T / 4))));
        });
        // lane flanges: an angle off 90° can trim further than the sheet reaches (Material Inside: T·cot A at a low angle).
        // The flange would hang on nothing: a bend and a wall, the base gone. Metal anywhere along the new bend line will do.
        if (!f.hem) {
          var left = false;
          for (var pr = 0; pr < 9 && !left; pr++) left = trimTest(sub(sub(add(e.a, scale(sub(e.b, e.a), (pr + 0.5) / 9)), scale(nF, T / 2)), scale(o, shift + T / 8)));
          if (!left) throw new Error('The flange would trim the sheet away: at this angle and position its bend starts ' + fmtN(shift) + ' back from the edge, past the end of the sheet.');
        }
        var oa = cont[0] ? 0 : 0.01, ob = cont[1] ? 0 : 0.01;
        var ca = tca <= tcb ? tca - oa : tcb - ob, cb = tca <= tcb ? tcb + ob : tca + oa;
        cuts.push({ loop: [[-shift, 0.01], [-shift, -T - 0.01], [0.5, -T - 0.01], [0.5, 0.01]].reverse(), plane: cutPlane, a: ca, b: cb });
        origin = sub(origin, scale(o, shift));
      }
      var plane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
      if (upTo && upToL == null) {
        var vv = sub(f.lengthVertex.map(Number), origin), vo = dot(vv, o), vu = dot(vv, u), sA0 = Math.sin(A), cA0 = Math.cos(A);
        var Iw = [R * sA0, R - R * cA0], Ow = [(R + T) * sA0, R - (R + T) * cA0];
        if (upToMode === 'normal') upToL = (vo - Iw[0]) * cA0 + (vu - Iw[1]) * sA0;
        else {
          if (!(sA0 > 1e-6)) throw new Error('Up To Vertex parallel to the base flange needs a wall that rises from the sheet.');
          upToL = (vu - Math.max(Iw[1], Ow[1])) / sA0;
        }
        if (!(upToL > 1e-6)) throw new Error('Up To Vertex: the vertex at ' + f.lengthVertex.map(function (x) { return fmtN(+x); }).join(', ') + ' does not lie past the bend: the wall would be ' + fmtN(upToL) + ' long.');
        L = upToL;
      }
      var loop = noRepeatLoop(flangeProfile(A, R, T, L, ov));
      var wmax = 0;
      loop.forEach(function (p) { wmax = Math.max(wmax, p[0]); });
      var ta = dot(sub(e.a, e.mid), plane.n), tb = dot(sub(e.b, e.mid), plane.n);
      // ends: P = vertex, t = sweep coordinate, dIn = unit direction from the vertex into the edge
      eds.push({ e: e, nF: nF, o: o, u: u, plane: plane, loop: loop, wmax: wmax,
        ends: [{ P: e.a, t: ta, dIn: norm(sub(e.b, e.a)) }, { P: e.b, t: tb, dIn: norm(sub(e.a, e.b)) }] });
    });
    // corners shared by two selected edges: mark them (no relief there) and, with `miter`, set up the mitre planes.
    // buttOK: a plain 90° edge flange. SolidWorks has no gap of zero here: no miterGap = its default, 0.01 in / 0.25 mm.
    // A Miter Flange's own stages, other angles, other corners and R ≤ gap/√2 (not measured) keep the bisector mitre.
    var buttOK = miter && !f.hem && !f.miterJoin && f.startAt == null && Math.abs(A - Math.PI / 2) < 1e-6;
    var buttGap = (gap > 0 ? gap : ccDefaultGap(model)) / Math.SQRT2;
    for (var i = 0; i < eds.length; i++) for (var j = i + 1; j < eds.length; j++) {
      var ei = eds[i], ej = eds[j];
      var tol = Math.max(1e-4, 1e-3 * Math.min(ei.e.len, ej.e.len));
      if (f.miterJoin) tol = Math.max(tol, +f.miterJoin);   // lane DL: a Miter Flange's later bends join wall ends a gap apart
      for (var ki = 0; ki < 2; ki++) for (var kj = 0; kj < 2; kj++) {
        var ea = ei.ends[ki], eb = ej.ends[kj];
        // lane rfIZ: a Miter Flange's later stage on square-ended walls (f.swJoin): the two edges stop short of the corner
        // where their lines cross (each T + g/√2 back); that crossing is the corner
        var joinV = null;
        if (len(sub(ea.P, eb.P)) > tol) {
          if (!f.swJoin) continue;
          var dij = dot(ea.dIn, eb.dIn), den = 1 - dij * dij;
          if (!(den > 1e-6)) continue;
          var w0 = sub(ea.P, eb.P), sa = (dij * dot(w0, eb.dIn) - dot(w0, ea.dIn)) / den, sb = (dot(w0, eb.dIn) - dij * dot(w0, ea.dIn)) / den;
          var Xa = add(ea.P, scale(ea.dIn, sa)), Xb = add(eb.P, scale(eb.dIn, sb)), reach = 2 * T + gap + 1e-6;
          if (len(sub(Xa, Xb)) > 1e-6 * (1 + T) || sa > 1e-9 || sb > 1e-9 || -sa > reach || -sb > reach) continue;
          joinV = scale(add(Xa, Xb), 0.5);
        }
        ea.shared = eb.shared = true;
        if (!miter || ea.miter || eb.miter || ea.butt || eb.butt) continue;
        var di = ea.dIn, dj = eb.dIn;
        if (len(cross(di, dj)) < 1e-6) continue; // collinear
        // folding opposite ways (lane DL: a Miter Flange's later bend folds each wall its own way, mirrored in the bisector)
        if (f.miterJoin ? len(sub(ej.u, sub(ei.u, scale(norm(sub(di, dj)), 2 * dot(ei.u, norm(sub(di, dj))))))) > 0.01 : dot(ei.u, ej.u) < 0.99) continue;
        var c = dot(ei.o, ej.o);
        if (1 + c < 0.05) continue;
        if (f.miterStage && !(gap > 0)) throw new Error('The miter flanges interfere with each other at the corner: set a gap distance greater than zero.');
        // lane flanges (SolidWorks 2022, M03 M24): the auto miter of a multi-edge flange at a square corner is Butt with
        // the bend closed. Both walls stop square, gap/√2 short of the other's inside face; each bend's end runs from
        // the base corner at its start to the wall's end at its end, straight in (angle, t), so the end face is a
        // helicoid; the flat runs each strip square out to the wall's end line. See buttTaper.
        if (buttOK && Math.abs(c) < 1e-6 && R - buttGap > 1e-6) {
          ea.butt = { t0: -shift, ext: R - shift - buttGap };
          eb.butt = { t0: -shift, ext: R - shift - buttGap };
          continue;
        }
        // A Miter Flange's corner (SolidWorks 2022, 2026-11-02; a straight profile at 90°): no mitre plane. Both walls stop
        // square, S = T + g·sin(θ/2) from the corner of their outer faces (T + g/√2 at 90°; g is what is left between the two
        // inside corners), and each bend tapers from the base's corner at its start out to that wall end (miterTaper).
        if (f.miterSquare && Math.abs(A - Math.PI / 2) < 1e-9 && dot(ea.dIn, ej.o) < -1e-9) {
          var sinTh = Math.sqrt(1 - c * c), tanH = (1 - c) / sinTh, S = T + gap * Math.sqrt((1 - c) / 2);
          ea.square = eb.square = { ext: (R + T - shift) * tanH - S / sinTh, base: -shift * tanH };   // both: past the end along the edge
          continue;
        }
        // corner of the (possibly trimmed-back) edge lines, and the bisector plane through it containing the sheet normal
        var V = joinV || scale(add(ea.P, eb.P), 0.5);
        if (shift) V = sub(V, scale(add(ei.o, ej.o), shift / (1 + c)));
        var nb = norm(sub(di, dj));
        // lane rfIS (SolidWorks 2022, report 2026-11-02 5d: 120° on a square corner, 90° on a trapezoid): an edge flange's
        // mitre has no gap of zero either (its default 0.01 in / 0.25 mm), and it is not a plane through the whole flange.
        // Each wall is cut square to itself along the line where the bisector plane (moved gap/2 off) meets its INSIDE
        // face; the bend's end runs straight in (angle, t) from the base's corner at its start to that wall line at its
        // end (a helicoid, as a Butt corner's); in the flat each strip runs the wall's line on straight across the bend
        // zone until the two lines meet, past the corner. SolidWorks' folded part then reads 3.9e-4 to 8.1e-4 under its
        // own blank × T (the helicoid is not the strip wrapped), Anvil's lands within 2e-5 of it.
        var swMiter = (!f.miterJoin || !!joinV) && !f.miterStage && !f.hem;
        var mGap = swMiter && !(gap > 0) ? ccDefaultGap(model) : gap;
        [[ei, ea, nb], [ej, eb, scale(nb, -1)]].forEach(function (q) {
          var ed = q[0], en = q[1], n = q[2];
          // extend the sweep past the corner far enough for the outermost point of the section to reach the bisector
          var ext = ed.wmax * dot(ed.o, n) / dot(en.dIn, n);
          ext = Math.max(0, Math.min(ext, 4 * ed.wmax)) + 1;
          if (f.miterJoin) ext = 2 * ed.loop.reduce(function (mx, p) { return Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); }, 0) / Math.max(0.1, Math.abs(dot(en.dIn, n))) + 1;
          en.miter = { n: n, w: dot(V, n) + mGap / 2, tExt: dot(sub(V, ed.plane.origin), ed.plane.n) - dot(en.dIn, ed.plane.n) * ext };
          if (!swMiter) return;
          var dn = dot(en.dIn, n);
          if (!(dn > 1e-9)) return;
          // τ past the end point P (along −dIn) where the plane meets the section point (o, u) of ed.plane
          var Pe = add(ed.plane.origin, scale(ed.plane.n, en.t));
          var tauAt = function (o, u) { return (dot(n, add(add(Pe, scale(ed.o, o)), scale(ed.u, u))) - en.miter.w) / dn; };
          var sA = Math.sin(A), cA = Math.cos(A), iO = R * sA, iU = R - R * cA;
          var mExt = tauAt(iO, iU), mSlope = tauAt(iO + cA, iU + sA) - mExt;
          // the base's corner (the trimmed edge lines' corner V) on this edge's τ
          // the base's corner: the trimmed edge lines' corner V, or (a joined later stage) the wall's end the edge stops at
          en.swMiter = { tB: joinV ? 0 : -dot(sub(V, en.P), en.dIn), ext: mExt, slope: mSlope,
            // the wall cut: a plane square to the wall through that line, kept on the edge's side
            wall: (function () {
              var wd = add(scale(ed.o, cA), scale(ed.u, sA));
              var Q0 = add(add(add(Pe, scale(ed.o, iO)), scale(ed.u, iU)), scale(en.dIn, -mExt));
              var along = add(wd, scale(en.dIn, -mSlope));                   // the line's direction
              var thick = sub(scale(ed.o, sA), scale(ed.u, cA));             // across the wall's thickness
              var nw = norm(cross(along, thick));
              if (dot(nw, en.dIn) < 0) nw = scale(nw, -1);
              return { n: nw, w: dot(nw, Q0) };
            })() };
        });
      }
    }
    var inside = null;
    eds.forEach(function (ed) {
      function swMax(sm) { return Math.max(sm.ext, sm.ext + sm.slope * L, sm.tB); }
      function endAt(en) { return en.square ? en.t - dot(en.dIn, ed.plane.n) * en.square.ext : en.swMiter ? en.t - dot(en.dIn, ed.plane.n) * swMax(en.swMiter) : en.miter ? en.miter.tExt : en.butt ? buttWallT(ed, en) : en.t; }
      var t0 = endAt(ed.ends[0]), t1 = endAt(ed.ends[1]);
      var part = { loop: ed.loop, plane: ed.plane, t0: Math.min(t0, t1), t1: Math.max(t0, t1),
        clips: ed.ends.filter(function (en) { return en.miter && !en.swMiter; }).map(function (en) { return { n: en.miter.n, w: en.miter.w }; }) };
      // lane rfIS: SolidWorks' edge-flange mitre (see swMiter above): the bend's end a taper from the base's corner to the
      // wall's line (part.tapers, as a Miter Flange's square end, but straight in (angle, t)), the overlap strip stopping
      // at the base's corner (tails), the wall cut square to itself (wallClips; OpenCascade: a clip of the whole sweep
      // when the plane leaves the bend alone, the wall's slope ≤ 0 (90° and up), else a cut of the wall only, wallCuts)
      if (ed.ends[0].swMiter || ed.ends[1].swMiter) {
        var sBA = zoneBA(sheet, A, R, T, f);
        part.BA = sBA; part.tapers = []; part.tails = []; part.wallClips = []; part.wallCuts = [];
        ed.ends.forEach(function (en) {
          var sm = en.swMiter;
          if (!sm) return;
          var dir = -dot(en.dIn, ed.plane.n), tM = swMax(sm), tE = tM + 0.1 * (tM - Math.min(sm.tB, sm.ext)) + 0.01 * T;
          var tB = en.t + dir * sm.tB, tW = en.t + dir * sm.ext, tEnd = en.t + dir * tM, tOut = en.t + dir * tE;
          var tl = [[-ov, tB], [0, tB]];
          // a Miter Flange's later stage (lane rfIZ, report 5d's L profile): its end face follows SolidWorks' Miter Flange
          // rule, the end running out as the bend leaves the wall it starts on, t − tB = (tW − tB)·(1 − cos θ)/(1 − cos A)
          // (the first stage's sin θ, turned), on SWJ_CHORDS chords; an edge flange's end runs straight in (angle, t)
          if (f.swJoin) for (var kc = 1; kc < SWJ_CHORDS; kc++) { var thc = A * kc / SWJ_CHORDS; tl.push([sBA * kc / SWJ_CHORDS, tB + (tW - tB) * (1 - Math.cos(thc)) / (1 - Math.cos(A))]); }
          tl.push([sBA, tW], [sBA, tOut], [-ov, tOut]);
          part.tapers.push(signedArea(tl) < 0 ? tl.reverse() : tl);
          if ((tEnd - tB) * dir > 1e-12) part.tails.push({ t0: Math.min(tB, tEnd), t1: Math.max(tB, tEnd) });
          part.wallClips.push({ n: sm.wall.n, w: sm.wall.w });
          if (sm.slope <= 1e-9) part.clips.push({ n: sm.wall.n, w: sm.wall.w });
          else {
            // the wall's section from its start (w = 0) on, grown past its free end and both faces, swept over the end
            var sA2 = Math.sin(A), cA2 = Math.cos(A), dg = 0.05 * T, I0 = [R * sA2, R - R * cA2], wv = [cA2, sA2], nv = [sA2, -cA2];
            var pt = function (w, h) { return [I0[0] + wv[0] * w + nv[0] * h, I0[1] + wv[1] * w + nv[1] * h]; };
            var wl = [pt(0, -dg), pt(L + dg, -dg), pt(L + dg, T + dg), pt(0, T + dg)];
            part.wallCuts.push({ n: sm.wall.n, w: sm.wall.w, loop: signedArea(wl) < 0 ? wl.reverse() : wl, t0: Math.min(tB, tW, tOut) - dg, t1: Math.max(tB, tW, tOut) + dg });
          }
        });
      }
      if (ed.ends[0].butt || ed.ends[1].butt) part.taper = buttTaper(ed, zoneBA(sheet, A, R, T, f), flangeWallLoop({ A: A, R: R, T: T, L: L }));
      if (ed.ends[0].square || ed.ends[1].square) {
        var mBA = zoneBA(sheet, A, R, T, f);
        part.BA = mBA; part.tapers = []; part.tails = []; part.ends = [part.t0, part.t1];
        ed.ends.forEach(function (en) {
          if (!en.square) return;
          var dir = -dot(en.dIn, ed.plane.n), tB = en.t + dir * en.square.base, tW = en.t + dir * en.square.ext;
          if (!((tW - tB) * dir > 1e-9)) return;   // the gap took the wall end back past the base's corner: nothing to taper
          part.tapers.push(miterTaper(mBA, tB, tW, ov));
          part.tails.push({ t0: Math.min(tB, tW), t1: Math.max(tB, tW) });
        });
      }
      // holes / slots in the sheet across the bend's band (the overlap strip, and the strip a Material Inside / Outside
      // / Virtual Sharp placement trims off): voids { loops (s, t), band, BA } that the sweep must not fill in
      var band = { s0: -ov, s1: shift, t0: Math.min(ed.ends[0].t, ed.ends[1].t), t1: Math.max(ed.ends[0].t, ed.ends[1].t) };
      var voids = bendVoids(ctx.body, ed.plane, band, T, { ends: false });
      if (voids.length) { part.voids = voids; part.band = band; part.BA = zoneBA(sheet, A, R, T, f); ed.cutouts = flatCutouts(voids, ed.ends[0].t, ed.ends[1].t >= ed.ends[0].t ? 1 : -1); }
      // lane rfIS: at a free end where the sheet's corner is acute (its side edge runs back into the sheet from the end,
      // a trapezoid's corner) the overlap strip [−ov, 0] would stick out past that side as a sliver (ov·ov·cot / 2 of
      // area, in the part and in the blank: 3.6e-5 in³ on 16 ga at 71.6°). endCuts: that sliver, outside the sheet and
      // past the flange's end, cut from the flange's tool (both kernels)
      ed.ends.forEach(function (en) {
        if (en.shared || !(ov > 0)) return;
        var d2 = null, tolP = 1e-6 * (1 + ed.e.len);
        edges.forEach(function (g) {
          if (d2 || g === ed.e) return;
          var far = len(sub(g.a, en.P)) < tolP ? g.b : len(sub(g.b, en.P)) < tolP ? g.a : null;
          if (!far) return;
          var dd = norm(sub(far, en.P));
          if (Math.abs(dot(dd, ed.nF)) > 1e-6 || len(cross(dd, en.dIn)) < 1e-6) return;
          d2 = dd;
        });
        if (!d2) return;
        var ca = dot(d2, en.dIn), cs = -dot(d2, ed.o);
        if (!(ca > 1e-6 && cs > 1e-6)) return;   // a square or obtuse corner: the strip stays on the sheet
        var dl = 0.01 * T + ov * 0.01, sOut = ov + dl, lam = sOut / cs;
        // in the sheet plane: x = −dIn (past the end), y = −o (into the sheet), n = ±nF so the prism runs through T
        var sp = { origin: en.P, x: scale(en.dIn, -1), y: scale(ed.o, -1), n: cross(scale(en.dIn, -1), scale(ed.o, -1)) };
        var Q2 = add(en.P, scale(d2, lam));
        var loop2 = [[0, 0], [dl, 0], [dl, sOut], [dot(sub(Q2, en.P), sp.x), sOut]];
        if (signedArea(loop2) < 0) loop2.reverse();
        var nn = dot(sp.n, ed.nF) > 0 ? 1 : -1;   // the sheet lies between the face of the edge and T below it
        var a0 = nn > 0 ? -T - dl : -dl, b0 = nn > 0 ? dl : T + dl;
        (part.endCuts = part.endCuts || []).push({ loop: loop2, plane: sp, a: a0, b: b0 });
      });
      tools.push(part);
      if (relief !== 'none') ed.ends.forEach(function (en) {
        if (en.shared) return;
        // does the sheet continue beyond this end? probe half a thickness past it at mid-thickness, inside the
        // base (just behind the edge) and on the outward side (a plate lying beside the bend zone)
        if (!inside) inside = ctx.body.pointTester();
        var past = add(sub(en.P, scale(ed.nF, T / 2)), scale(en.dIn, -0.5 * T));
        if (!inside(add(past, scale(ed.o, -0.25 * T))) && !inside(add(past, scale(ed.o, (R + T) / 2)))) return;
        var beyond = -dot(en.dIn, ed.plane.n); // sign of t past the end
        var tA = beyond > 0 ? en.t : en.t - rw, tB = beyond > 0 ? en.t + rw : en.t;
        var o0 = -(f.reliefFromBend ? rd : Math.max(shift, 0) + rd) + Math.min(shift, 0), o1 = R + T + rd;
        var slot = [[o1, tA], [o1, tB]];
        if (relief === 'obround') {
          var r = rw / 2, oc = o0 + r, tc = (tA + tB) / 2;
          for (var k = 0; k <= 12; k++) { var ph = Math.PI / 2 + Math.PI * k / 12; slot.push([oc + r * Math.cos(ph), tc + r * Math.sin(ph)]); }
        } else slot.push([o0, tB], [o0, tA]);
        // sweep the slot outline (in the sheet plane: o across, t along the edge) through the thickness (u ∈ [-T, 0])
        var sp = { origin: ed.plane.origin, x: ed.o, y: ed.plane.n, n: scale(ed.u, -1) };
        cuts.push({ loop: slot, plane: sp, a: -0.01, b: T + 0.01 });
        // for the flat pattern: the slot is w wide past this end and reaches d0 inside the (trimmed) edge line
        en.relief = { w: rw, d0: -o0, d1: rd, obround: relief === 'obround' };
      });
      var sh = scale(ed.o, -shift), e = ed.e;
      // miterPlanes: per end, the clip plane { n, w } (tool kept where n·p >= w) or null; the flat pattern uses it to
      // run the bend strip out to the mitre line. Plain arrays and numbers only: the record must survive a structured clone.
      var rec = { kind: 'edge', a: add(e.a, sh), b: add(e.b, sh), mid: add(e.mid, sh), origin: ed.plane.origin, o: ed.o, u: ed.u, len: e.len, angle: A, R: R, L: L, T: T,
        ba: customBA(f), mitred: [!!ed.ends[0].miter, !!ed.ends[1].miter],
        miterPlanes: ed.ends.map(function (en) { return en.miter ? { n: en.miter.n.slice(), w: en.miter.w } : null; }) };
      // reliefs: per end (a, b), the bend relief cut there ({ w, d0, d1, obround }) or null; flatPattern cuts it from the
      // blank as a notch w wide past the end, from d0 inside the edge line to d1 beyond the flat bend zone
      if (ed.ends[0].relief || ed.ends[1].relief) rec.reliefs = ed.ends.map(function (en) { return en.relief || null; });
      // a Miter Flange's square end: the flat is a square notch, the strip's end straight at the wall's (SolidWorks): the
      // same field as a Closed Corner's cut end, flagged `square` because the bend's taper is not in the flat
      if (ed.ends[0].square || ed.ends[1].square) rec.ccEnds = ed.ends.map(function (en) { return en.square ? { t0: en.square.ext, ext: en.square.ext, square: true } : null; });
      // lane rfIS: SolidWorks' edge-flange mitre: per end, the wall's mitre line on its inside face as τ past the end
      // (ext at the wall's start, slope per unit of wall), run on straight across the bend zone in the flat
      if (ed.ends[0].swMiter || ed.ends[1].swMiter) rec.miterLines = ed.ends.map(function (en) { return en.swMiter ? { ext: en.swMiter.ext, slope: en.swMiter.slope, tB: en.swMiter.tB } : null; });
      // cutouts: the voids that cross the bend (bendVoids), as loops of [d, τ]: d from the (trimmed) edge line across the
      // flat strip, τ along the edge from a toward b; flatPattern cuts them from the blank where the flat put them
      if (ed.cutouts && ed.cutouts.length) rec.cutouts = ed.cutouts;
      // a butt corner's end: in the flat the strip stays square, out to the wall's end line (ccEnds' { t0, ext } are the
      // ends of a Closed Corner, which this is: flatPattern needs nothing else), though the folded bend's end tapers
      if (ed.ends[0].butt || ed.ends[1].butt) rec.ccEnds = ed.ends.map(function (en) { return en.butt ? { t0: en.butt.ext, ext: en.butt.ext } : null; });
      // a roll that curls into its own sheet splits the sheet's face in the solid; the blank has no such gap: flatPattern
      // lays the strip this far back over the sheet (the reach of the outer arc below the sheet's fold-side face)
      if (hemType === 'rolled' && R - (R + T) * Math.cos(A) < 0 && A > 1.5 * Math.PI) rec.curlBack = Math.sqrt((R + T) * (R + T) - R * R);
      info.push(rec);
    });
    if (f.hem) hemCrossing(f, model, ctx, eds, cuts, flangeProfile(A, R, T, L, ov), ov, T, hemType === 'rolled' ? 2 * (R + T) : 0);
    return { parts: tools, cuts: cuts, info: info, section: { A: A, R: R, T: T, L: L, ov: ov } };
  }
  // A butt corner (flangeLayout's en.butt: t0 = the bend's start at this end, ext = its end, both signed past the edge
  // end). The sweep is the wall's t range; what the bend does not fill of it is, per butt end, a triangle in (s, t)
  // between the end's straight run from (0, base corner) to (BA, wall end) and the band's corner. part.taper = { BA,
  // loops: those triangles, CCW, wall: the wall's section }: Anvil builds the bend's metal round them (wrapRegion),
  // OpenCascade cuts them out of its exact bend (cylinderCutter); the wall goes on after. Neither has an overlap strip:
  // the bend meets the base face to face.
  function buttWallT(ed, en) { return en.t - dot(en.dIn, ed.plane.n) * en.butt.ext; }
  function buttTaper(ed, BA, wall) {
    var loops = [];
    ed.ends.forEach(function (en) {
      if (!en.butt) return;
      var d = -dot(en.dIn, ed.plane.n), tb = en.t + d * en.butt.t0, tw = buttWallT(ed, en), l = [[0, tb], [BA, tw], [0, tw]];
      loops.push(signedArea(l) < 0 ? l.reverse() : l);
    });
    return { BA: BA, loops: loops, wall: wall };
  }
  // the straight wall of a flange section (flangeProfile's), from the bend's end to the free end, with no bend
  function flangeWallLoop(sec) {
    var A = sec.A, R = sec.R, T = sec.T, L = sec.L, sA = Math.sin(A), cA = Math.cos(A);
    var I = [R * sA, R - R * cA], O = [(R + T) * sA, R - (R + T) * cA];
    var l = [I, [I[0] + cA * L, I[1] + sA * L], [O[0] + cA * L, O[1] + sA * L], O];
    return signedArea(l) < 0 ? l.reverse() : l;
  }
  // the bend's metal built with the taper left out, and the wall on its end. A hole of the sheet across the bend goes
  // into that metal as well (wrapRegion: exact and closed), and is cut from the wall where it runs on past BA; only one
  // that reaches a taper (wrapRegion takes disjoint outlines) is cut from the result, as on any flange (wrapCut)
  function buttPart(p, sec, id) {
    var tp = p.taper, voids = p.voids || [], clear = [], hit = [], past = [];
    function box(l) { var b = [Infinity, -Infinity, Infinity, -Infinity]; l.forEach(function (q) { b = [Math.min(b[0], q[0]), Math.max(b[1], q[0]), Math.min(b[2], q[1]), Math.max(b[3], q[1])]; }); return b; }
    function apart(a, b) { return a[1] < b[0] || b[1] < a[0] || a[3] < b[2] || b[3] < a[2]; }
    voids.forEach(function (v) {
      var bv = box(v);
      (tp.loops.every(function (l) { return apart(bv, box(l)); }) ? clear : hit).push(v);
      if (bv[1] > tp.BA && hit.indexOf(v) < 0) past.push(v);
    });
    var tool = wrapRegion(tp.loops.concat(clear), sec, tp.BA, p.plane, p.t0, p.t1, { shared: id });
    function cut(body, list) {
      var w = list.length ? wrapCut(list, sec, p.BA, p.plane, { grow: { s0: p.band.s0 }, shared: id }) : null;
      return w ? body.subtract(w) : body;
    }
    if (sec.L > 0) tool = smBool(tool, 'union', cut(prism(tp.wall, p.plane, p.t0, p.t1, id), past), sec.T);
    return cut(tool, hit);
  }
  // the part of a Miter Flange's bend past the taper, as a void outline in (s, t) for wrapRegion / wrapCut / OpenCascade's
  // cylinderCutter: the end runs from the base's corner (s = 0, tB) to the wall end (s = BA, tW). SolidWorks' end face is
  // free-form: t − tB = (tW − tB)·sin θ at every radius (both cylinders' areas to 5 digits, the end face's to 5e-5). Drawn
  // on 3 chords (they average 0.622 across, the true curve 2/π): SolidWorks' own volume reads about 1.5e-5 in³ under the
  // true curve per corner at any size, and 3 chords land on it on 16 ga. Carried past the band so a cutter never ends on
  // a face of the sweep.
  function miterTaper(BA, tB, tW, ov) {
    var pts = [[-ov, tB]], e = (tW - tB) * 0.1;
    [0, 1, 2, 3].forEach(function (k) { pts.push([BA * k / 3, tB + (tW - tB) * Math.sin(Math.PI / 2 * k / 3)]); });
    pts.push([BA, tW + e], [-ov, tW + e]);
    return signedArea(pts) < 0 ? pts.reverse() : pts;
  }
  // rfBZ: hemCrossing(f, model, ctx, eds, cuts, loop, ov, T) throws when a hem would run into metal that is already
  // there: the return of a hem on the neighbouring edge folded over the same corner (a closed hem and a tear drop on
  // adjacent edges), or another edge of the same hem feature. The CSG union would merge the two into a
  // self-intersecting part and a wrong flat; SolidWorks refuses the second hem. Each edge's hem without its overlap
  // strip is tested against the sheet as trimmed for this feature and against the hem's other edges; anything over
  // 1 % of T³ in common is a crossing. `own` > 0 (a Rolled hem): the sheet that far back from the hem's own bend line is
  // not tested: a roll past 300° at R = T curls into the very sheet it came from (see hemSection), which SolidWorks builds.
  function hemCrossing(f, model, ctx, eds, cuts, loop, ov, T, own) {
    var bare = ov ? loop.filter(function (p) { return p[0] !== -ov; }) : noRepeatLoop(loop);   // the section from the bend line on
    var lim = 0.01 * T * T * T;
    var solids = eds.map(function (ed) {
      // lane rfIZ: a mitred hem (SolidWorks' Hem ▸ Miter Gap) is tested as built: swept past its mitred ends, clipped there
      var tA = Math.min(ed.ends[0].t, ed.ends[1].t), tB = Math.max(ed.ends[0].t, ed.ends[1].t), mt = ed.ends.filter(function (en) { return en.miter; });
      if (!mt.length) return prism(bare, ed.plane, tA, tB);
      ed.ends.forEach(function (en) { if (en.miter) { if (en.t <= tA + 1e-12) tA = Math.min(tA, en.miter.tExt); else tB = Math.max(tB, en.miter.tExt); } });
      var sm = prism(bare, ed.plane, tA, tB);
      mt.forEach(function (en) { sm = sm.clipByPlane(en.miter.n, en.miter.w); });
      return sm;
    });
    var rest = cuts.length ? ctx.body.subtract(unionAll(cuts.map(function (c) { return prism(c.loop, c.plane, c.a, c.b); }))) : ctx.body;
    function pt(p) { return '(' + p.map(function (x) { return fmtN(Math.round(x * 1e4) / 1e4); }).join(', ') + ')'; }
    function centroid(s) {
      var c = [0, 0, 0], n = 0;
      s.polygons.forEach(function (pg) { pg.vertices.forEach(function (v) { c[0] += v.pos.x; c[1] += v.pos.y; c[2] += v.pos.z; n++; }); });
      return n ? scale(c, 1 / n) : c;
    }
    // the point picked on a feature's i-th edge (its records follow its edge list when there is one per edge)
    function picked(g, i, n) {
      var e = g.edges && g.edges.length === n ? g.edges[i] : null, at = e && e.at;
      return at && at.length === 3 && at.every(function (v) { return isFinite(+v); }) ? at.map(Number) : null;
    }
    function segDist(p, a, b) {
      var ab = sub(b, a), l2 = dot(ab, ab), t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
      return len(sub(p, add(a, scale(ab, t))));
    }
    function refuse(k, other, otherIsHem) {
      var mine = pt(picked(f, k, eds.length) || eds[k].e.mid);
      if (!other) throw new Error('The hem on edge ' + mine + ' would run into metal already there: shorten it or add a relief.');
      throw new Error(otherIsHem ? 'The hems on edges ' + mine + ' and ' + pt(other) + ' would cross: shorten one or add a relief.' :
        'The hem on edge ' + mine + ' would run into the flange on edge ' + pt(other) + ': shorten the hem or add a relief.');
    }
    solids.forEach(function (s, k) {
      for (var j = k + 1; j < solids.length; j++) if (s.intersect(solids[j]).volume() > lim) refuse(k, picked(f, j, eds.length) || eds[j].e.mid, true);
      var near = own ? rest.subtract(prism([[0, 0.01], [-own, 0.01], [-own, -T - 0.01], [0, -T - 0.01]].reverse(), eds[k].plane, Math.min(eds[k].ends[0].t, eds[k].ends[1].t), Math.max(eds[k].ends[0].t, eds[k].ends[1].t))) : rest;
      var x = near.intersect(s);
      if (!(x.volume() > lim)) return;
      // the flange record nearest the metal in common names the other edge
      var c = centroid(x), best = null;
      Object.keys(ctx.flanges || {}).forEach(function (id) {
        if (String(id) === String(f.id)) return;
        (ctx.flanges[id] || []).forEach(function (rec, ri) {
          if (!rec || !rec.a || !rec.b) return;
          var d = segDist(c, rec.a, rec.b);
          if (!best || d < best.d) best = { d: d, rec: rec, id: id, ri: ri, n: ctx.flanges[id].length };
        });
      });
      var of = best ? (model.features || []).filter(function (g) { return String(g.id) === String(best.id); })[0] : null;
      refuse(k, best ? (of && picked(of, best.ri, best.n)) || best.rec.mid : null, !!(of && of.hem));
    });
  }
  // Flange length references and hem types (see flangeLayout). A closed hem cannot have a zero inner radius in a
  // solid: it folds with SolidWorks' 0.1 mm between the leaves (CLOSED_HEM_GAP_MM, lane DI2), and its flat uses that radius
  // (BA = π·(0.05 mm + K·T)); give the hem a Custom Bend Allowance for a shop's own hem value.
  var LENGTH_REFS = ['outer', 'inner', 'tangent', 'wall'];
  var HEM_TYPES = ['open', 'closed', 'teardrop', 'rolled'];
  // a Tear Drop starts at 200° (the Hem PM's start, and what SolidWorks built in rfDO / rfGD; it refuses exactly 270°)
  var CLOSED_HEM_R = 0.02, DEFAULT_HEM_ANGLE = { teardrop: 200, rolled: 270 };
  // lane DI2 (SolidWorks 2022, rfDO): a closed hem leaves 0.1 mm between its leaves (inner radius 0.05 mm, whatever
  // T); a tear drop's tail stops 0.2 mm (along the tail) short of the sheet. CLOSED_HEM_R (×T) is the old rule, kept
  // only as the floor of an open hem's radius.
  var CLOSED_HEM_GAP_MM = 0.1, TEARDROP_CLEAR_MM = 0.2;
  function hemMM(model) { var u = model && model.units; return u === 'in' ? 1 / 25.4 : u === 'cm' ? 0.1 : u === 'm' ? 0.001 : 1; }
  // hemSection(type, A, R, T) -> { L }: the straight part after the curl of a tear drop or rolled hem (in the flange
  // section frame: o outward, u toward the fold, the sheet's fold-side face at u = 0). A rolled hem is the arc alone
  // (L = 0). A tear drop's arc is followed by a straight tail that runs back down to the sheet and stops TEARDROP_CLEAR_MM
  // short of it along the tail (SolidWorks), so the solid stays one clean body. SolidWorks takes a Tear Drop only strictly
  // between 180° and 270°; a Rolled hem at any angle (past 300° at R = T its end reaches into the sheet: as built here the
  // two simply join, as one solid; SolidWorks keeps a self-crossing body and its own check faults it).
  function hemSection(type, A, R, T, mm) {
    var name = type === 'teardrop' ? 'Tear drop' : 'Rolled';
    if (!isFinite(R) || !(R > 0)) throw new Error(name + ' hem radius must be greater than zero.');
    if (!isFinite(A)) throw new Error(name + ' hem angle must be a number.');
    if (type === 'teardrop' && !(A > Math.PI + 1e-9 && A < 1.5 * Math.PI - 1e-9)) throw new Error('A tear drop hem angle must be more than 180° and less than 270°.');
    if (type === 'rolled' && !(A > 0.01 && A < 2 * Math.PI - 0.01)) throw new Error('Rolled hem angle must be between 1° and 359°.');
    if (type === 'rolled') return { L: 0 };
    var c = Math.cos(A), s = Math.sin(A);
    // lowest point of the curl's end (inner and outer corner), above the fold-side face
    var uEnd = Math.min(R - R * c, R - (R + T) * c);
    // lane DI2: the tail runs down toward the sheet and stops TEARDROP_CLEAR_MM short of it, measured along the tail
    return { L: Math.max(0, uEnd / -s - TEARDROP_CLEAR_MM * (mm || 1)) };
  }
  // a feature's Custom Bend Allowance as plain data for the flange records ({ type, value } or null)
  function customBA(f) {
    var c = f.bendAllowance;
    if (!c || !c.type) return null;
    if (BA_TYPES.indexOf(c.type) < 0) throw new Error('Custom bend allowance: unknown type "' + c.type + '" (kfactor, allowance, deduction or table).');
    return { type: c.type, value: c.value == null ? null : +c.value };
  }

  // ------------------------------------------------------------------ sheet metal: cuts that cross a bend zone
  // A hole, slot or notch cut in the flat sheet before an Edge Flange or a Sketched Bend stays a hole where it crosses
  // the bend (SolidWorks): the bend rolls up the flat as it is, so the cut is wrapped round the bend and runs on into
  // the wall, and the flat pattern shows it once, in its original place. The bend section is swept across the whole
  // edge / line, so each void of the sheet inside the bend's band (the flat strip the section replaces, plus the
  // overlap strips it lays into the sheet) is found (bendVoids), wrapped (wrapCut: radial through the thickness, the
  // flat length s mapped to the bend angle A·s/BA on the neutral axis) and taken out of the section's sweep.
  // A section plane { origin, x, y, n } (flangeProfile's frame: x = o across the fold, y = u toward the fold, n along
  // it) holds the flat sheet at u ∈ [−T, 0]; band { s0, s1, t0, t1 }: s along x (0 = the bend's start), t along n.

  // a point inside a simple polygon (scan lines across its middle), or null
  function loopInteriorPoint(l) {
    var lo = Infinity, hi = -Infinity, fr = [0.5, 0.3713, 0.6287, 0.2, 0.8, 0.05, 0.95];
    l.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    for (var k = 0; k < fr.length; k++) {
      var y = lo + (hi - lo) * fr[k], xs = [], best = null;
      for (var i = 0; i < l.length; i++) {
        var a = l[i], b = l[(i + 1) % l.length];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var j = 0; j + 1 < xs.length; j += 2) if (!best || xs[j + 1] - xs[j] > best[1] - best[0]) best = [xs[j], xs[j + 1]];
      if (best && best[1] - best[0] > 1e-9) return [(best[0] + best[1]) / 2, y];
    }
    return null;
  }
  // the slab of the band at 45–55 % of the thickness, where bendVoids reads the voids: bandSlabSpec -> { loop, plane,
  // a, b } (a prism of `loop` in `plane` from a to b, as prism() takes it), bandSlab -> that prism as a CSG solid
  function bandSlabSpec(plane, band, T) { return { loop: [[band.s0, -0.55 * T], [band.s1, -0.55 * T], [band.s1, -0.45 * T], [band.s0, -0.45 * T]], plane: plane, a: band.t0, b: band.t1 }; }
  function bandSlab(plane, band, T) { var s = bandSlabSpec(plane, band, T); return prism(s.loop, s.plane, s.a, s.b); }
  // bendVoids(body, plane, band, T, opts) -> [[[s, t], ...]] (CCW in (s, t)): the through-thickness voids of the sheet
  // (holes, slots, notches) inside the band, as outlines at mid-thickness. A void that does not go through the sheet
  // (a blind pocket: metal at 10 % or 90 % of the thickness inside it) is left out. opts.ends false (edge flanges):
  // voids that reach the band's ends (t0 / t1) are left out too: the flange is as wide as its edge, whatever the sheet
  // does past it. The voids are the band's slab at 45–55 % of the thickness less the sheet; opts.voids: that solid
  // when the caller made it (OpenCascade: exactly, meshed finely), `body` then only answers the through-sheet probes.
  function bendVoids(body, plane, band, T, opts) {
    opts = opts || {};
    var M = opts.voids || bandSlab(plane, band, T).subtract(body);
    if (!M.polygons.length || !(M.volume() > 1e-9 * (band.s1 - band.s0) * (band.t1 - band.t0) * 0.1 * T)) return [];
    // lane FW: opts.fine reads the outline at 1024× scale, so faceOutline's 1e-4 weld cannot merge a hole's polygon
    // vertex lying a hair inside the band with the hole edge's crossing of the band edge (a Ø0.281 hole across a 14 ga
    // bend, its vertex 5e-5 past the bend start: the outline skipped the vertex, leaving a sliver that read as a blind
    // cut, and the Fold fell back to the wrapped tool: 7 open / 15 non-manifold, rfFT pin 12)
    var k = opts.fine ? 1024 : 1;
    if (k !== 1) M = M.transform(function (p) { return new CSG.Vector(p.x * k, p.y * k, p.z * k); }, false);
    var mesh = meshFromBody(M), w0 = (dot(plane.y, plane.origin) - 0.45 * T) * k, fi = -1;
    mesh.faces.forEach(function (fc, i) { if (fi < 0 && dot(fc.normal, plane.y) > 0.999 && Math.abs(fc.w - w0) < 1e-6 * Math.max(1, Math.abs(w0)) + 1e-9) fi = i; });
    if (fi < 0) return [];
    var o = faceOutline(mesh, fi);
    if (!o) return [];
    var loops = o.loops.map(function (l) {
      return l.map(function (p) { var q = sub(scale(to3D(o.plane, p[0], p[1]), 1 / k), plane.origin); return [dot(q, plane.x), dot(q, plane.n)]; });
    }).filter(function (l) { return Math.abs(signedArea(l)) > 1e-6 * T * T; });
    var inside = null, tolE = 1e-6 * Math.max(1, band.t1 - band.t0), out = [];
    loops.forEach(function (l) {
      // outer loops of the void only (a loop inside an odd number of others is an island of metal in a void)
      var probe = loopInteriorPoint(l), depth = 0;
      if (!probe) return;
      loops.forEach(function (m) { if (m !== l && pointInPoly(probe, m)) depth++; });
      if (depth % 2) return;
      if (!opts.ends && l.some(function (p) { return p[1] < band.t0 + tolE || p[1] > band.t1 - tolE; })) return;
      if (!inside) inside = body.pointTester();
      var P = add(add(plane.origin, scale(plane.x, probe[0])), scale(plane.n, probe[1]));
      if ([0.1, 0.5, 0.9].some(function (fz) { return inside(sub(P, scale(plane.y, fz * T))); })) return;
      out.push(signedArea(l) < 0 ? l.slice().reverse() : l);
    });
    return out;
  }
  // bendZoneMap(sec, BA, segs) -> fn(s, z) = [o, u]: where the flat point s along the strip (0 = the bend's start), z
  // deep below the face the bend folds toward (0 inner face, T outer), lands in the section plane. s < 0: the sheet
  // before the bend (unchanged); 0..BA: the bend, at angle A·s/BA, radial through the thickness (segs facets as
  // flangeProfile's, linear across a facet; a fine count stands for the true arcs); s > BA: the wall, s − BA along it.
  // fn.zones: the s values where the map's pieces meet (a piece maps planes to planes at constant z).
  function bendZoneMap(sec, BA, segs) {
    var A = sec.A, R = sec.R, T = sec.T, tx = Math.cos(A), ty = Math.sin(A);
    function inner(th) { return [R * Math.sin(th), R - R * Math.cos(th)]; }
    function outer(th) { return [(R + T) * Math.sin(th), R - (R + T) * Math.cos(th)]; }
    function at(I, O, z) { return [I[0] + (O[0] - I[0]) * z / T, I[1] + (O[1] - I[1]) * z / T]; }
    var fn = function (s, z, zone) {
      if (zone == null) zone = s <= 0 ? -1 : s >= BA ? Infinity : Math.min(segs - 1, Math.floor(s / BA * segs));
      if (zone < 0) return [s, -z];
      if (zone === Infinity) {
        var w = s - BA, iE = inner(A), oE = outer(A);
        return at([iE[0] + tx * w, iE[1] + ty * w], [oE[0] + tx * w, oE[1] + ty * w], z);
      }
      var ta = A * zone / segs, tb = A * (zone + 1) / segs, f = s / BA * segs - zone;
      var Ia = inner(ta), Ib = inner(tb), Oa = outer(ta), Ob = outer(tb);
      return at([Ia[0] + (Ib[0] - Ia[0]) * f, Ia[1] + (Ib[1] - Ia[1]) * f], [Oa[0] + (Ob[0] - Oa[0]) * f, Oa[1] + (Ob[1] - Oa[1]) * f], z);
    };
    fn.zones = [];
    // the last line is BA itself (lane FW: BA·11/11 can be BA − 1 ulp, so wrapRegion's points clamped to BA and its
    // zone-line points at the bend's end differed: 25 non-manifold edges on a 120° bend across a hole)
    for (var k = 0; k <= segs; k++) fn.zones.push(k === segs ? BA : BA * k / segs);
    return fn;
  }
  // wrapMesh(loop, sec, BA, plane, segs, eps) -> [[P, ...]]: one void outline (s, t, CCW) pushed through the thickness
  // (z from −eps to T + eps) and mapped by bendZoneMap into `plane`, as a closed, watertight set of outward planar convex
  // faces (no T-junctions: every point where an edge crosses a zone line is computed once from the edge's ends). The
  // outline's edges are split where they cross the zone lines and each piece walled by a quad (planar when the edge runs
  // along s or t) or four triangles to its true centre; the caps are the outline's triangulation, cut into convex
  // pieces along the zone lines (each lands on a plane).
  // lane DJ: zr = [z0, z1] gives the depth range instead (material added on the flat, a blind cut: z < 0 or > T lies
  // off the sheet, carried on radially as bendZoneMap's map extends)
  function wrapMesh(loop, sec, BA, plane, segs, eps, zr, split) {
    var map = bendZoneMap(sec, BA, segs), Z = map.zones, T = sec.T, memo = {}, tris = [], zA = zr ? zr[0] : -eps, zB = zr ? zr[1] : T + eps;
    // a corner a hair off a zone line goes onto it (else the line would cut a sliver off next to it)
    loop = loop.map(function (p) {
      for (var j = 0; j < Z.length; j++) if (Math.abs(p[0] - Z[j]) < 1e-4 * T) return [Z[j], p[1]];
      return p;
    }).filter(function (p, j, l) { var q = l[(j + 1) % l.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-9 * T; });
    function zoneOf(s) { return s <= 0 ? -1 : s >= BA ? Infinity : Math.min(segs - 1, Math.floor(s / BA * segs)); }
    function key(p) { return p[0] + ',' + p[1]; }
    // the crossing of edge a–b with s = z, the same for a–b and b–a
    function cross2(a, b, z) {
      var k = key(a) < key(b) ? key(a) + '|' + key(b) + '|' + z : key(b) + '|' + key(a) + '|' + z;
      if (!memo[k]) { var p = key(a) < key(b) ? a : b, q = p === a ? b : a, f = (z - p[0]) / (q[0] - p[0]); memo[k] = [z, p[1] + (q[1] - p[1]) * f]; }
      return memo[k];
    }
    // the zone lines strictly between a and b, in order from a
    function crossings(a, b) {
      var lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]), out = [];
      Z.forEach(function (z) { if (z > lo && z < hi) out.push(cross2(a, b, z)); });
      return a[0] <= b[0] ? out : out.reverse();
    }
    var onLine = {};
    Z.forEach(function (z, j) { onLine[z] = Math.min(j, segs - 1); });
    function at(p, z, zone) {
      // lane FU: a point on a zone line maps through one zone whichever piece asks (the two zones agree there only to
      // rounding, and a tool's pieces must share their vertices bit for bit)
      if (split && onLine[p[0]] != null) zone = onLine[p[0]];
      var ou = map(p[0], z, zone);
      return add(add(add(plane.origin, scale(plane.x, ou[0])), scale(plane.y, ou[1])), scale(plane.n, p[1]));
    }
    function zoneOfPoly(ps) { var s = 0; ps.forEach(function (p) { s += p[0]; }); return zoneOf(s / ps.length); }
    // caps: the outline (a convex one: a round hole, a slot, a rectangle) or each triangle of it cut along the zone lines
    // into convex pieces, at both depths
    var n = loop.length, convex = true;
    for (var v = 0; v < n && convex; v++) {
      var e1 = sub2(loop[(v + 1) % n], loop[v]), e2 = sub2(loop[(v + 2) % n], loop[(v + 1) % n]);
      if (e1[0] * e2[1] - e1[1] * e2[0] < -1e-12 * Math.max(1e-12, Math.hypot(e1[0], e1[1]) * Math.hypot(e2[0], e2[1]))) convex = false;
    }
    function sub2(p, q) { return [p[0] - q[0], p[1] - q[1]]; }
    (convex ? [loop] : triangulate(loop).map(function (t) { return [loop[t[0]], loop[t[1]], loop[t[2]]]; })).forEach(function (tri) {
      var lo = Infinity, hi = -Infinity;
      tri.forEach(function (p) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); });
      var cuts = [-Infinity].concat(Z.filter(function (z) { return z > lo && z < hi; }), [Infinity]);
      for (var c = 0; c + 1 < cuts.length; c++) {
        var za = cuts[c], zb = cuts[c + 1], pc = [];
        for (var i = 0; i < tri.length; i++) {
          var a = tri[i], b = tri[(i + 1) % tri.length];
          if (a[0] >= za && a[0] <= zb) pc.push(a);
          crossings(a, b).forEach(function (x) { if (x[0] === za || x[0] === zb) pc.push(x); });
        }
        if (pc.length < 3) continue;
        var zone = zoneOfPoly(pc);
        // a convex piece of a cap lands on a plane: one face each side
        tris.push(pc.map(function (p) { return at(p, zA, zone); }), pc.map(function (p) { return at(p, zB, zone); }).reverse());
      }
    });
    // walls: each outline edge split at the zone lines (lane FU split: and at the sheet's faces)
    var zl = split ? [zA].concat([0, T].filter(function (z) { return z > zA && z < zB; }), [zB]) : [zA, zB];
    for (var i = 0; i < loop.length; i++) {
      var a = loop[i], b = loop[(i + 1) % loop.length], pts = [a].concat(crossings(a, b), [b]);
      for (var k = 0; k + 1 < pts.length; k++) {
        var p = pts[k], q = pts[k + 1], zone = zoneOf((p[0] + q[0]) / 2);
        var mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        for (var zi = 0; zi + 1 < zl.length; zi++) {
          var za = zl[zi], zb = zl[zi + 1];
          var p0 = at(p, za, zone), q0 = at(q, za, zone), p1 = at(p, zb, zone), q1 = at(q, zb, zone);
          if (len(sub(sub(q1, q0), sub(p1, p0))) < 1e-9 * Math.max(1, T)) { tris.push([p0, p1, q1, q0]); continue; }
          // a slanted wall in the bend twists (radial lines turn along it): a bilinear patch, fanned to its true centre
          // (exact). lane FU (split): the wall is cut at the sheet's faces (z = 0, T: its trace on the bend's chord faces
          // is then one straight edge of the tool, not a crossing of nearly coplanar triangles, which left near-collinear
          // kinks and 1e-5 cracks there) and each band halved at its true mid line (m), the halves split along opposite
          // diagonals (p0–m1, then m1–q0): their errors against the patch are equal and opposite, so the volume is exact.
          if (split) {
            var m0 = at(mid, za, zone), m1 = at(mid, zb, zone);
            tris.push([p0, p1, m1], [p0, m1, m0], [m0, m1, q0], [m1, q1, q0]);
            continue;
          }
          var cm = at(mid, (za + zb) / 2, zone);
          tris.push([p0, cm, q0], [q0, cm, q1], [q1, cm, p1], [p1, cm, p0]);
        }
      }
    }
    // outward: flip all when the enclosed volume comes out negative
    var vol = 0;
    tris.forEach(function (t) { for (var j = 1; j + 1 < t.length; j++) vol += dot(t[0], cross(t[j], t[j + 1])); });
    if (vol < 0) tris.forEach(function (t) { t.reverse(); });
    return tris;
  }
  // wrapCut(loops, sec, BA, plane, opts) -> a CSG solid (null for no loops): the void outlines wrapped by wrapMesh, so
  // that cutting it from the section's sweep (built in `plane`) leaves each void where the flat put it. ε = 1 % T (at
  // most half the bend radius). opts.segs: the bend's facets (default flangeProfile's); opts.grow: { s0, s1, t0, t1 }
  // band edges: where a void outline runs along one of them it is carried on past it (growLoop), so the cut never ends
  // on a face of the sweep; opts.shared: the polygons' tag. opts.faces: return wrapMesh's faces (all loops) instead of
  // a solid (OpenCascade sews them).
  function wrapCut(loops, sec, BA, plane, opts) {
    opts = opts || {};
    var T = sec.T, segs = opts.segs || Math.max(4, Math.round(8 * sec.A / (Math.PI / 2))), eps = Math.min(0.01 * T, 0.5 * sec.R), tris = [];
    loops.forEach(function (l0) {
      var l = opts.grow ? growLoop(l0, opts.grow, T) : l0;
      if (signedArea(l) < 0) l = l.slice().reverse();
      tris = tris.concat(wrapMesh(l, sec, BA, plane, segs, eps, opts.depth, !!opts.split && !opts.faces && !opts.depth));   // (lane DJ: opts.depth = [z0, z1]; lane FU: opts.split)
    });
    if (opts.faces) return tris;
    var polys = [];
    tris.forEach(function (t) {
      var pg = CSG.Polygon.tryCreate(t.map(function (p) { return new CSG.Vertex(new CSG.Vector(p[0], p[1], p[2])); }), opts.shared);
      if (pg) polys.push(pg);
    });
    return polys.length ? CSG.fromPolygons(polys) : null;
  }
  // lane FU: wrapRegion(loops, sec, BA, plane, t0, t1, opts) -> the bend's metal itself as a CSG solid: the band
  // s ∈ [0, BA] × t ∈ [t0, t1] less the void outlines (CCW, inside the band, as bendVoids gives them), mapped through
  // bendZoneMap from the inner face (z = 0) to the outer (z = T), with no boolean at all. Cutting a wrapped void out of
  // the faceted bend (wrapCut) crossed the chord faces with twisted walls whose triangles are nearly coplanar; the BSP
  // booleans left 1e-5 cracks and pinched edges there (a Ø.5 hole across a 16 ga bend: 61 open / 3 non-manifold). Here
  // the region is cut into convex pieces (per zone, between the t values where something happens: a void corner, a
  // void edge crossing a zone line) whose caps land on the chord faces exactly, and only the region's boundary is
  // walled: void edges (twisted bilinear patches, triangulated so the volume is exact), the bend ends (s = 0, BA: the
  // radial planes there) and the band's sides (t = t0, t1). Every point is made once and reused, so the solid is closed.
  function wrapRegion(loops, sec, BA, plane, t0, t1, opts) {
    opts = opts || {};
    var T = sec.T, segs = opts.segs || Math.max(4, Math.round(8 * sec.A / (Math.PI / 2))), map = bendZoneMap(sec, BA, segs), Z = map.zones;
    var tolS = 1e-9 * Math.max(T, BA), tolT = 1e-9 * Math.max(1, t1 - t0);
    var axO = add(plane.origin, scale(plane.y, sec.R)), axD = plane.n.slice();   // lane FX: the bend's axis (bendZoneMap: centre [0, R])
    var cylIn = sec.R > 0 ? { s: { t: 'cyl', o: axO, d: axD, r: sec.R } } : null, cylOut = { s: { t: 'cyl', o: axO.slice(), d: axD.slice(), r: sec.R + T } };
    var edges = [], sEnd = Z[Z.length - 1];
    // lane FW: clip (not clamp) each outline to the band: a hole whose polygon pokes a vertex past the bend's start
    // crosses s = 0 where its edges do, as the flat piece beside it is cut; clamping that vertex onto s = 0 bent the
    // edges and left non-manifold edges against that piece (Ø.5 hole on a 0.125 sheet R 0.25 bend)
    function clipLoop(l, k, v, keepLo) {
      var out = [];
      for (var i = 0; i < l.length; i++) {
        var p = l[i], q = l[(i + 1) % l.length], ip = keepLo ? p[k] >= v : p[k] <= v, iq = keepLo ? q[k] >= v : q[k] <= v;
        if (ip) out.push(p);
        if (ip !== iq) { var f = (v - p[k]) / (q[k] - p[k]), x = [0, 0]; x[k] = v; x[1 - k] = p[1 - k] + (q[1 - k] - p[1 - k]) * f; out.push(x); }
      }
      return out;
    }
    loops.forEach(function (l0) {
      var l = signedArea(l0) < 0 ? l0.slice().reverse() : l0;
      l = clipLoop(clipLoop(clipLoop(clipLoop(l, 0, 0, true), 0, sEnd, false), 1, t0, true), 1, t1, false);
      if (l.length < 3) return;
      l = l.map(function (p) {
        var s = p[0], t = p[1];
        Z.forEach(function (z) { if (Math.abs(s - z) < tolS) s = z; });
        if (s < 0) s = 0; if (s > BA) s = BA;
        if (Math.abs(t - t0) < tolT || t < t0) t = t0; if (Math.abs(t - t1) < tolT || t > t1) t = t1;
        return [s, t];
      });
      for (var i = 0; i < l.length; i++) {
        var a = l[i], b = l[(i + 1) % l.length];
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > tolS) edges.push({ a: a, b: b, id: edges.length });
      }
    });
    // events: the band's ends, every void corner, every crossing of a void edge with a zone line
    var ev = [t0, t1];
    edges.forEach(function (e) {
      ev.push(e.a[1]);
      if (Math.abs(e.b[1] - e.a[1]) < tolT) return;
      Z.forEach(function (z) {
        if ((e.a[0] - z) * (e.b[0] - z) < 0) ev.push(e.a[1] + (e.b[1] - e.a[1]) * (z - e.a[0]) / (e.b[0] - e.a[0]));
      });
    });
    ev = ev.filter(function (t) { return t >= t0 && t <= t1; }).sort(function (x, y) { return x - y; });
    var E = [];
    ev.forEach(function (t) { if (!E.length || t - E[E.length - 1] > tolT) E.push(t); });
    E[E.length - 1] = t1;
    // the 2D point of edge e at event k (its own end where it ends there: one object per (edge, event))
    var memo = {};
    function edgeAt(e, k) {
      var key = e.id + ':' + k;
      if (memo[key]) return memo[key];
      var t = E[k], p;
      if (Math.abs(e.a[1] - t) <= tolT) p = e.a;
      else if (Math.abs(e.b[1] - t) <= tolT) p = e.b;
      else { var s = e.a[0] + (e.b[0] - e.a[0]) * (t - e.a[1]) / (e.b[1] - e.a[1]); Z.forEach(function (z) { if (Math.abs(s - z) < tolS) s = z; }); p = [s, t]; }
      return (memo[key] = p);
    }
    function lineAt(j, k) { var key = 'z' + j + ':' + k; return memo[key] || (memo[key] = [Z[j], E[k]]); }
    var zoneOfLine = {};
    Z.forEach(function (z, j) { zoneOfLine[z] = Math.min(j, segs - 1); });
    var pts3 = {};
    // lane FX: a point inside a zone goes on its chord where the radius at the TRUE angle A·s/BA meets it (bendZoneMap
    // spaces s evenly along the chord instead), so the cylinder records' radial correction lands every void edge at its
    // exact place on the arc: the rebuilt bend's mass properties are exact and the flat unrolls the void exactly
    function chordAt(s, z, zone) {
      var A = sec.A, R = sec.R, th = A * s / BA, ta = A * zone / segs, tb = A * (zone + 1) / segs;
      var k = Math.cos((tb - ta) / 2) / Math.cos(th - (ta + tb) / 2), rho = (R + z) * k;
      return [rho * Math.sin(th), R - rho * Math.cos(th)];
    }
    function at(p, z, zone) {
      if (zoneOfLine[p[0]] != null) zone = zoneOfLine[p[0]];
      var key = p[0] + ',' + p[1] + ',' + z + ',' + zone;
      if (pts3[key]) return pts3[key];
      var ou = zoneOfLine[p[0]] != null ? map(p[0], z, zone) : chordAt(p[0], z, zone);
      return (pts3[key] = add(add(add(plane.origin, scale(plane.x, ou[0])), scale(plane.y, ou[1])), scale(plane.n, p[1])));
    }
    var faces = [];
    function quad(A, B, zone) {
      // the wall over the boundary edge A → B (region on its left): planar, or a twisted bilinear patch split exactly
      var a0 = at(A, 0, zone), b0 = at(B, 0, zone), a1 = at(A, T, zone), b1 = at(B, T, zone);
      if (len(sub(sub(b1, b0), sub(a1, a0))) < 1e-9 * Math.max(1, T)) { faces.push([a0, b0, b1, a1]); return; }
      // (lane FX: the 3D midpoints, on the cap edges a0 b0 / a1 b1 whatever the s map within the zone)
      var m0 = scale(add(a0, b0), 0.5), m1 = scale(add(a1, b1), 0.5);
      faces.push([a0, m0, m1], [a0, m1, a1], [m0, b0, m1], [m1, b0, b1]);
    }
    var below = null, sideZ = {};
    for (var k = 0; k + 1 < E.length; k++) {
      var ta = E[k], tb = E[k + 1], tm = (ta + tb) / 2;
      // the void edges across this slab, ordered by s at mid-slab, paired into void intervals
      var cr = [];
      edges.forEach(function (e) {
        var lo = Math.min(e.a[1], e.b[1]), hi = Math.max(e.a[1], e.b[1]);
        if (!(lo < tm && hi > tm)) return;
        cr.push({ e: e, s: e.a[0] + (e.b[0] - e.a[0]) * (tm - e.a[1]) / (e.b[1] - e.a[1]) });
      });
      cr.sort(function (x, y) { return x.s - y.s; });
      var voids = [];
      for (var c = 0; c + 1 < cr.length; c += 2) voids.push([cr[c], cr[c + 1]]);
      var here = [];
      for (var zk = 0; zk < segs; zk++) {
        var zlo = Z[zk], zhi = Z[zk + 1], cur = { line: zk, s: zlo };
        var pieces = [];
        voids.forEach(function (v) {
          if (!cur || v[1].s <= zlo || v[0].s >= zhi) return;
          if (v[0].s > cur.s) pieces.push([cur, { e: v[0].e, s: v[0].s }]);
          cur = v[1].s < zhi ? { e: v[1].e, s: v[1].s } : null;
        });
        if (cur && cur.s < zhi) pieces.push([cur, { line: zk + 1, s: zhi }]);
        pieces.forEach(function (pc) {
          var L = pc[0], R = pc[1];
          var La = L.e ? edgeAt(L.e, k) : lineAt(L.line, k), Lb = L.e ? edgeAt(L.e, k + 1) : lineAt(L.line, k + 1);
          var Ra = R.e ? edgeAt(R.e, k) : lineAt(R.line, k), Rb = R.e ? edgeAt(R.e, k + 1) : lineAt(R.line, k + 1);
          // (lane flanges: by coordinates: a void edge reaching a zone line in this slab lands on the line's own point, a
          // different array; kept twice it made a zero-area triangle, an edge used three times, on every chord it crossed)
          var ring = [La, Ra, Rb, Lb].filter(function (p, i, r) { var q = r[(i + 1) % r.length]; return p[0] !== q[0] || p[1] !== q[1]; });
          if (ring.length >= 3) {
            var capT = ring.map(function (p) { return at(p, T, zk); }), cap0 = ring.map(function (p) { return at(p, 0, zk); }).reverse();
            capT.surf = cylOut; cap0.surf = cylIn;   // lane FX: chords of the bend's outer / inner cylinder
            faces.push(capT, cap0);
          }
          // left side Lb → La, right side Ra → Rb
          [[L, Lb, La], [R, Ra, Rb]].forEach(function (sd) {
            if (sd[1] === sd[2]) return;
            if (sd[0].e) { quad(sd[1], sd[2], zk); return; }
            var j = sd[0].line;
            if (j === 0 || j === segs) { quad(sd[1], sd[2], zk); return; }
            // an inner zone line: a wall only where the other side has no metal
            var key = j + ':' + k;
            (sideZ[key] = sideZ[key] || []).push({ A: sd[1], B: sd[2], zone: zk });
          });
          here.push({ zone: zk, a: [La, Ra], b: [Lb, Rb] });
        });
      }
      // t = ta: walls where the slab below had metal and this one has none (facing +t), or the other way round
      tEdges(below, here, k);
      below = here;
    }
    tEdges(below, [], E.length - 1);
    Object.keys(sideZ).forEach(function (key) { var l = sideZ[key]; if (l.length === 1) quad(l[0].A, l[0].B, l[0].zone); });
    // the event line k: intervals [p, q] (2D points, p left) of the slab below (their top edges) and above (bottoms)
    function tEdges(lo, hi, k) {
      for (var zk = 0; zk < segs; zk++) {
        var B = (lo || []).filter(function (x) { return x.zone === zk; }).map(function (x) { return x.b; });
        var A = hi.filter(function (x) { return x.zone === zk; }).map(function (x) { return x.a; });
        var cuts = [];
        B.concat(A).forEach(function (iv) { cuts.push(iv[0], iv[1]); });
        cuts.sort(function (x, y) { return x[0] - y[0]; });
        var u = [];
        cuts.forEach(function (p) { if (!u.length || p[0] - u[u.length - 1][0] > tolS) u.push(p); });
        function inside(list, s) { return list.some(function (iv) { return iv[0][0] < s && iv[1][0] > s; }); }
        for (var i = 0; i + 1 < u.length; i++) {
          var sm = (u[i][0] + u[i + 1][0]) / 2, inB = inside(B, sm), inA = inside(A, sm);
          if (inB && !inA) quad(u[i + 1], u[i], zk);   // top edge of the piece below: right → left
          else if (inA && !inB) quad(u[i], u[i + 1], zk);   // bottom edge of the piece above: left → right
        }
      }
    }
    var vol = 0;
    faces.forEach(function (f) { for (var j = 1; j + 1 < f.length; j++) vol += dot(f[0], cross(f[j], f[j + 1])); });
    if (vol < 0) faces.forEach(function (f) { f.reverse(); });
    var polys = [];
    faces.forEach(function (f) {
      var pg = CSG.Polygon.tryCreate(f.map(function (p) { return new CSG.Vertex(new CSG.Vector(p[0], p[1], p[2])); }), opts.shared);
      if (pg && f.surf) pg.surf = f.surf;
      if (pg) polys.push(pg);
    });
    return polys.length ? CSG.fromPolygons(polys) : null;
  }
  // lane FU: the bend of a section frame as a solid to cut out of the folded part: the sector between the radial
  // planes at the bend's start and end (exactly), from the axis out past the outer face, t0 … t1 along the edge
  function bendSector(sec, plane, t0, t1) {
    var R = sec.R, T = sec.T, A = sec.A, n = Math.max(4, Math.ceil(A / (Math.PI / 16))), r = R + 1.5 * T, loop = [[0, R]];
    for (var i = 0; i <= n; i++) { var th = A * i / n; loop.push([r * Math.sin(th), R - r * Math.cos(th)]); }
    return prism(signedArea(loop) < 0 ? loop.reverse() : loop, plane, t0, t1);
  }
  // growLoop(l, band, T) -> the outline with each edge that runs along a band edge (s0, s1, t0 or t1, where set) carried
  // 2 % T out past it as a rectangle: the edges inside the band stay exactly where they were (a void cut off by the band
  // edge goes on beyond it, so the sweep is cut clean through there; a sheet edge the band ends on is cut past)
  function growLoop(l, band, T) {
    var tol = 1e-6 * Math.max(1, T), gr = 0.02 * T, out = [];
    function side(p, q) {
      if (band.s0 != null && Math.abs(p[0] - band.s0) < tol && Math.abs(q[0] - band.s0) < tol) return [-gr, 0];
      if (band.s1 != null && Math.abs(p[0] - band.s1) < tol && Math.abs(q[0] - band.s1) < tol) return [gr, 0];
      if (band.t0 != null && Math.abs(p[1] - band.t0) < tol && Math.abs(q[1] - band.t0) < tol) return [0, -gr];
      if (band.t1 != null && Math.abs(p[1] - band.t1) < tol && Math.abs(q[1] - band.t1) < tol) return [0, gr];
      return null;
    }
    var n = l.length, sides = [], i, k0 = -1;
    for (i = 0; i < n; i++) sides.push(side(l[i], l[(i + 1) % n]));
    function same(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }
    // start where a run of edges along one band edge begins (or anywhere when there is none / one run all round)
    for (i = 0; i < n && k0 < 0; i++) if (!same(sides[(i + n - 1) % n], sides[i])) k0 = i;
    if (k0 < 0) return l;
    for (var c = 0; c < n;) {
      var k = (k0 + c) % n, d = sides[k], p = l[k];
      out.push(p);
      if (!d) { c++; continue; }
      // a run of edges along this band edge, from vertex k to vertex k + run: its inner vertices go (they lie inside
      // the grown outline), the run's ends stay and the outline steps out past the band edge between them
      var run = 1;
      while (c + run < n && same(sides[(k0 + c + run) % n], d)) run++;
      var q = l[(k0 + c + run) % n];
      out.push([p[0] + d[0], p[1] + d[1]], [q[0] + d[0], q[1] + d[1]]);
      c += run;
    }
    return out;
  }
  // BA for a flange's bend (bendCalc, as its flat pattern will use it; the K-factor's when the method has no answer)
  function zoneBA(sheet, A, R, T, f) {
    try { return bendCalc(sheet, A, R, T, customBA(f)).BA; } catch (e) { return bendAllowance(A, R, T, sheetKFactor(sheet)); }
  }
  // the voids as the flat pattern places them: (d, τ) = (s, distance from the record's end a toward b), only those
  // that reach past the bend's start (the rest are holes of the sheet before the bend, already in the flat)
  function flatCutouts(loops, ta, sign) {
    return loops.filter(function (l) { return l.some(function (p) { return p[0] > 1e-9; }); })
      .map(function (l) { return l.map(function (p) { return [p[0], (p[1] - ta) * sign]; }); });
  }

  // lane rfIS: flangeLayout's endCuts (the overlap strip's sliver past an acute corner of the sheet) out of a part's tool
  function endCut(tool, p, T) {
    if (!p.endCuts || !p.endCuts.length) return tool;
    return smBool(tool, 'subtract', p.endCuts.map(function (c) { return prism(c.loop, c.plane, c.a, c.b); }), T);
  }
  function buildFlange(f, model, ctx) {
    if (f.miterFlange && f.sketch != null) return buildMiterFlange(f, model, ctx);   // lane DL: Miter Flange from a profile sketch
    var lay = flangeLayout(f, model, ctx);
    var tools = lay.parts.map(function (p) {
      if (p.taper) return endCut(buttPart(p, lay.section, f.id), p, lay.section.T);
      if (p.tapers) return endCut(miterSquarePart(p, lay, f), p, lay.section.T);
      var tool = prism(p.loop, p.plane, p.t0, p.t1, f.id, secCv(p.loop, lay.section));
      p.clips.forEach(function (c) { tool = tool.clipByPlane(c.n, c.w); });
      tool = endCut(tool, p, lay.section.T);
      // cuts across the bend zone (bendVoids): wrapped round the bend and taken out of it
      if (p.voids && p.voids.length) {
        var w = wrapCut(p.voids, lay.section, p.BA, p.plane, { grow: { s0: p.band.s0 }, shared: f.id });
        if (w) tool = tool.subtract(w);
      }
      return tool;
    });
    ctx.flanges[f.id] = lay.info;
    ctx.flangeCut = lay.cuts.length ? unionAll(lay.cuts.map(function (c) { return prism(c.loop, c.plane, c.a, c.b, f.id); })) : null;
    return unionAll(tools);
  }

  // the section's overlap strip into the sheet, a little over: it goes no further than the base's corner (flangeLayout `tails`)
  function miterTail(sec) { var e = 0.01 * sec.T; return [[-sec.ov - e, e], [0, e], [0, -sec.T - e], [-sec.ov - e, -sec.T - e]].reverse(); }
  // a Miter Flange's part with square ends: the wall and the overlap strip as plain prisms, the bend as its metal less the
  // tapers and any holes across it (wrapRegion: exact, no wrapped tool to crack the faceted bend), meeting on the bend's
  // end planes. With a hole there is no overlap strip: it would fill the hole in the sheet
  function miterSquarePart(p, lay, f) {
    var sec = lay.section, A = sec.A, R = sec.R, T = sec.T, L = sec.L, sA = Math.sin(A), cA = Math.cos(A);
    var iE = [R * sA, R - R * cA], oE = [(R + T) * sA, R - (R + T) * cA], wall = [iE, [iE[0] + cA * L, iE[1] + sA * L], [oE[0] + cA * L, oE[1] + sA * L], oE];
    var strip = [[-sec.ov, 0], [0, 0], [0, -T], [-sec.ov, -T]], lo = p.t0, hi = p.t1;
    p.tails.forEach(function (r) { if (r.t0 <= lo + 1e-12) lo = r.t1; if (r.t1 >= hi - 1e-12) hi = r.t0; });
    var bend = wrapRegion(p.tapers.concat(p.voids || []), sec, p.BA, p.plane, p.t0, p.t1, { shared: f.id });
    function ccw(l) { return signedArea(l) < 0 ? l.slice().reverse() : l; }
    var wl = prism(ccw(wall), p.plane, p.t0, p.t1, f.id);
    (p.wallClips || []).forEach(function (c) { wl = wl.clipByPlane(c.n, c.w); });   // lane rfIS: the wall cut square to itself
    var rest = [wl];
    if (!p.voids) rest.push(prism(ccw(strip), p.plane, lo, hi, f.id));
    return smBool(bend, 'union', rest, T);
  }

  // Jog: two opposite bends in one feature. The first flange lifts the sheet by `height` (wall length so the offset
  // measured between the flats is `height`), the second folds back parallel to the base for `length`.
  // -> tool and cut for the first bend; the second is built on the intermediate body. Info records for both.
  function buildJog(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding a jog.');
    var sheet = sheetParams(model), T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    var A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180, H = +f.height, L2 = +f.length;
    if (!isFinite(H) || !isFinite(L2) || !isFinite(A)) throw new Error('Jog height, length and angle must be a number each.');
    if (!(H > 0)) throw new Error('Jog height must be greater than zero.');
    if (!(L2 > 0)) throw new Error('Jog length must be greater than zero.');
    if (!(A > 0.05 && A < Math.PI - 0.05)) throw new Error('Jog angle must be between 3° and 177°.');
    // wall length so the jogged flat's near face sits `height` from the base's fold-side face:
    // rise = R(1−cosA) [first bend] + wall·sinA + R(1−cosA) − T·cosA [second bend, inner radius on the far face]
    var wall = (H - 2 * R * (1 - Math.cos(A)) + T * Math.cos(A)) / Math.sin(A);
    if (!(wall > 0.01)) throw new Error('Jog height is too small for this bend radius and angle.');
    var f1 = { id: f.id, edges: f.edges, angle: A * 180 / Math.PI, length: wall, reverse: !!f.reverse, radius: R, position: f.position, bendAllowance: f.bendAllowance };
    var tool1 = buildFlange(f1, model, ctx), cut1 = ctx.flangeCut, info1 = ctx.flanges[f.id];
    var body1 = cut1 ? ctx.body.subtract(cut1) : ctx.body;
    body1 = body1.union(tool1);
    // second bend: pick the end edge of each wall (mid-thickness point), fold back toward the outward direction
    var picks = info1.map(function (fi) {
      var sA = Math.sin(A), cA = Math.cos(A);
      var innerEnd = add(add(fi.origin, scale(fi.o, R * sA + cA * wall)), scale(fi.u, R - R * cA + sA * wall));
      var outerDir = add(scale(fi.o, sA), scale(fi.u, -cA)); // away from the bend centre at the wall
      var tw = add(scale(fi.o, cA), scale(fi.u, sA));
      var toward = norm(sub(fi.o, scale(tw, dot(fi.o, tw))));
      return { at: add(innerEnd, scale(outerDir, T / 2)), toward: toward };
    });
    var ctx2 = { body: body1, flanges: {}, tools: {} };
    var tools2 = [], infos2 = [];
    picks.forEach(function (pk) {
      var f2 = { id: f.id, edges: [{ at: pk.at }], angle: A * 180 / Math.PI, length: L2, toward: pk.toward, radius: R, position: 'bendOutside', bendAllowance: f.bendAllowance };
      tools2.push(buildFlange(f2, model, ctx2));
      infos2 = infos2.concat(ctx2.flanges[f.id]);
    });
    ctx.flanges[f.id] = info1.concat(infos2);
    ctx.flangeCut = cut1;
    return { first: tool1, second: unionAll(tools2) };
  }

  // ---- lane DL: Miter Flange from a profile sketch (SolidWorks' Sheet Metal ▸ Miter Flange). The feature is a `flange`
  // with miterFlange: true and `sketch` (the profile: an open chain of lines, tangent arcs between them giving that
  // bend's radius, sketched on a plane normal to an edge of the sheet and starting on it), `edges` (the edges to run
  // along; the one the profile starts on is added when missing), position ('inside' Material Inside (default) |
  // 'outside' Material Outside | 'bendOutside'), radius (null = the sheet's), miterGap, startOffset / endOffset (the
  // chain's free ends move in by these; start = the free end of the edge the profile sits on). The profile's first
  // line is the flange length to the inner virtual sharp (at 90° the height above the face the edge lies on); each
  // further line adds a bend (a stage: a Bend-Outside flange on the walls' ends, mitred again at the corners), the
  // lengths between the lines' virtual sharps on the profile's side of the metal. Records for every stage go in
  // ctx.flanges[f.id] (edge-flange shaped), so the flat pattern needs nothing new.
  // miterOffsetEnds(selected, f) -> the resolved edges with the chain's free start / end shortened by the offsets
  function miterOffsetEnds(selected, f) {
    var so = +f.startOffset || 0, eo = +f.endOffset || 0;
    if (!(so >= 0) || !(eo >= 0)) throw new Error('Start and end offsets must be zero or more.');
    var ends = [];
    selected.forEach(function (e, i) {
      var tol = Math.max(1e-4, 1e-3 * e.len) + (+f.miterJoin || 0);
      [['a', e.a], ['b', e.b]].forEach(function (q) {
        var shared = selected.some(function (g, j) { return j !== i && (len(sub(q[1], g.a)) < tol || len(sub(q[1], g.b)) < tol); });
        if (!shared) ends.push({ i: i, end: q[0], P: q[1] });
      });
    });
    if (!ends.length) return selected;
    var at = f.startAt, first = 0;
    if (at) { var bd = Infinity; selected.forEach(function (e, i) { var d = _.pointSegmentDistance(at, e.a, e.b); if (d < bd - 1e-9) { bd = d; first = i; } }); }
    var mine = ends.filter(function (en) { return en.i === first; });
    if (!mine.length) mine = ends;
    var start = mine[0];
    if (at) mine.forEach(function (en) { if (len(sub(en.P, at)) < len(sub(start.P, at)) - 1e-9) start = en; });
    var rest = ends.filter(function (en) { return en !== start; });
    var stop = rest.reduce(function (b, en) { return !b || len(sub(en.P, start.P)) > len(sub(b.P, start.P)) ? en : b; }, null);
    var cut = {};
    if (so) cut[start.i + start.end] = so;
    if (eo && stop) cut[stop.i + stop.end] = (cut[stop.i + stop.end] || 0) + eo;
    return selected.map(function (e, i) {
      var da = cut[i + 'a'] || 0, db = cut[i + 'b'] || 0;
      if (!da && !db) return e;
      if (!(da + db < e.len - 1e-6)) throw new Error('The start and end offsets (' + fmtN(da + db) + ') are longer than the edge (' + fmtN(e.len) + ').');
      var d = norm(sub(e.b, e.a)), a = add(e.a, scale(d, da)), b = sub(e.b, scale(d, db));
      return Object.assign({}, e, { a: a, b: b, mid: scale(add(a, b), 0.5), len: e.len - da - db });
    });
  }
  // the profile as virtual sharps: { plane, pts: [[x, y], …] (sketch 2D, first line first), radii: [r | null per joint] }
  function miterProfile(f, model, ctx) {
    var sketch = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch);
    if (!sketch || sketch.type !== 'sketch') throw new Error('Miter Flange: select the profile sketch.');
    var plane = resolvePlane(sketch.plane, model, ctx.planes || {}), pieces = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || e.t === 'point' || e.t === 'text' || K.noProfileEntity(sketch, e)) return;
      if (e.t === 'line') { if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) > 1e-9) pieces.push({ line: true, p: [+e.x1, +e.y1], q: [+e.x2, +e.y2] }); return; }
      if (e.t === 'arc') {
        var a0 = e.a0 * Math.PI / 180, a1 = e.a1 * Math.PI / 180;
        pieces.push({ line: false, r: +e.r, p: [e.cx + e.r * Math.cos(a0), e.cy + e.r * Math.sin(a0)], q: [e.cx + e.r * Math.cos(a1), e.cy + e.r * Math.sin(a1)] });
        return;
      }
      throw new Error('A miter flange profile may hold only lines and arcs (it has a ' + e.t + ').');
    });
    if (!pieces.some(function (p) { return p.line; })) throw new Error('The miter flange sketch has no line: sketch the flange profile (one or more lines) starting on an edge of the sheet.');
    var tol = 1e-6;
    function d2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
    function links(pc) { return pieces.filter(function (o) { return o !== pc && [o.p, o.q].some(function (x) { return d2(x, pc.p) < tol || d2(x, pc.q) < tol; }); }).length; }
    var hi = -1;
    pieces.forEach(function (pc, i) { if (hi < 0 && links(pc) <= 1) hi = i; });
    if (hi < 0) throw new Error('The miter flange profile must be one open chain of lines (it is closed).');
    var left = pieces.slice(), head = left.splice(hi, 1)[0];
    if (left.some(function (o) { return d2(o.p, head.p) < tol || d2(o.q, head.p) < tol; })) head = { line: head.line, r: head.r, p: head.q, q: head.p };
    var chain = [head];
    while (left.length) {
      var end = chain[chain.length - 1].q, k = -1;
      for (var i = 0; i < left.length && k < 0; i++) if (d2(left[i].p, end) < tol || d2(left[i].q, end) < tol) k = i;
      if (k < 0) throw new Error('The miter flange profile must be one connected chain of lines and arcs, end to end.');
      var nx = left.splice(k, 1)[0];
      chain.push(d2(nx.p, end) < tol ? nx : { line: nx.line, r: nx.r, p: nx.q, q: nx.p });
    }
    if (!chain[0].line || !chain[chain.length - 1].line) throw new Error('The miter flange profile must start and end with a line.');
    var lines = [], radii = [];
    chain.forEach(function (pc, i) {
      if (pc.line) {
        var dd = [pc.q[0] - pc.p[0], pc.q[1] - pc.p[1]], L = Math.hypot(dd[0], dd[1]);
        var last = lines[lines.length - 1];
        if (last && radii.length < lines.length && Math.abs(last.d[0] * dd[1] - last.d[1] * dd[0]) / L < 1e-9 && chain[i - 1].line) { last.q = pc.q; return; }   // collinear lines
        if (last && radii.length < lines.length) radii.push(null);
        lines.push({ p: pc.p, q: pc.q, d: [dd[0] / L, dd[1] / L] });
      } else {
        if (!chain[i - 1].line || !chain[i + 1].line) throw new Error('An arc of a miter flange profile must sit between two lines.');
        radii.push(pc.r);
      }
    });
    var pts = [lines[0].p];
    for (var j = 0; j + 1 < lines.length; j++) {
      var A = lines[j], B = lines[j + 1], den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
      if (Math.abs(den) < 1e-9) throw new Error('Two lines of the miter flange profile are parallel: they cannot make a bend.');
      var t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den;
      pts.push([A.p[0] + A.d[0] * t, A.p[1] + A.d[1] * t]);
    }
    pts.push(lines[lines.length - 1].q);
    return { plane: plane, pts: pts, radii: radii };
  }
  // miterFlangeStages(f, model, ctx, run): plans the stages and calls run(stageFeature, k) for each in turn; run builds
  // the stage on its kernel and returns { info: the stage's flange records, body: the CSG of the part after it }
  // (the next stage picks the walls' end edges on it). Returns { stages }.
  function miterFlangeStages(f, model, ctx, run) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding a miter flange.');
    var sheet = sheetParams(model), T = +sheet.thickness, R0 = f.radius != null ? +f.radius : +sheet.bendRadius;
    var position = f.position || 'inside';
    if (MITER_FLANGE_POSITIONS.indexOf(position) < 0) throw new Error('Unknown miter flange position "' + position + '" (inside, outside or bendOutside).');
    var prof = miterProfile(f, model, ctx), plane = prof.plane, nS = norm(cross(plane.x, plane.y));
    var mesh = meshFromBody(coplanarBody(ctx.body));
    var sharp = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
    var P0 = to3D(plane, prof.pts[0][0], prof.pts[0][1]), Pn = to3D(plane, prof.pts[prof.pts.length - 1][0], prof.pts[prof.pts.length - 1][1]), best = null;
    sharp.forEach(function (e) {
      if (Math.abs(dot(norm(sub(e.b, e.a)), nS)) < 0.999) return;
      [P0, Pn].forEach(function (P, k) { var d = _.pointSegmentDistance(P, e.a, e.b); if (!best || d < best.d - 1e-9) best = { d: d, e: e, k: k }; });
    });
    if (!best || best.d > 1.01 * T + 1e-6) throw new Error('Miter Flange: sketch the profile on a plane normal to an edge of the sheet, starting on that edge.');
    var pts = best.k ? prof.pts.slice().reverse() : prof.pts, radii = best.k ? prof.radii.slice().reverse() : prof.radii;
    var e1 = best.e, fa = mesh.faces[e1.faces[0]], fb = mesh.faces[e1.faces[1]], fl = fa.area >= fb.area ? 0 : 1;
    var nF = e1.normals[fl], o = e1.normals[1 - fl], S = to3D(plane, pts[0][0], pts[0][1]);
    // the profile's lines in the first edge's section frame (o outward, u the side the flange folds to)
    var segs = [];
    for (var i = 0; i + 1 < pts.length; i++) {
      var D = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      var d3 = norm(sub(to3D(plane, pts[i + 1][0], pts[i + 1][1]), to3D(plane, pts[i][0], pts[i][1])));
      segs.push({ D: D, a: dot(d3, o), b: dot(d3, nF) });
    }
    if (!(Math.abs(segs[0].b) > 1e-6)) throw new Error('Miter Flange: the profile\'s first line must leave the sheet (it lies in the sheet\'s plane).');
    var sg = segs[0].b > 0 ? 1 : -1, u = scale(nF, sg);
    segs.forEach(function (s) { s.b *= sg; });
    var A1 = Math.atan2(segs[0].b, segs[0].a), side = position === 'inside' ? 1 : -1;   // material on the profile's left (+1) or right
    var joints = [];
    for (var j = 0; j + 1 < segs.length; j++) {
      var p = segs[j], q = segs[j + 1], turn = p.a * q.b - p.b * q.a, A = Math.acos(Math.max(-1, Math.min(1, p.a * q.a + p.b * q.b)));
      if (!(A < Math.PI - 0.01)) throw new Error('Miter Flange: line ' + (j + 2) + ' of the profile folds back onto line ' + (j + 1) + '.');
      var inner = turn * side < 0, R = radii[j] != null ? (inner ? +radii[j] : +radii[j] - T) : R0;
      if (!(R > 0)) throw new Error('Miter Flange: the arc between lines ' + (j + 1) + ' and ' + (j + 2) + ' is smaller than the thickness.');
      joints.push({ A: A, R: R, sb: (inner ? R : R + T) * Math.tan(A / 2) });
    }
    // stage 1: the edge flange the first line makes
    var tolE = EDGE_PICK_TOL * T, edges = (f.edges || []).map(function (e) { return { at: e.at }; });
    if (!edges.some(function (e) { return _.pointSegmentDistance(e.at, e1.a, e1.b) < tolE; })) edges.unshift({ at: e1.mid.slice() });
    var L1 = segs[0].D - (joints.length ? joints[0].sb : 0);
    if (!(L1 - R0 * Math.tan(A1 / 2) > 1e-6)) throw new Error('Miter Flange: line 1 of the profile is too short for the bend' + (joints.length ? 's' : '') + '.');
    var gap = f.miterGap == null ? ccDefaultGap(model) : Math.max(0, +f.miterGap || 0);
    // miterStage: a corner with no gap is refused (SolidWorks: "The miter flanges interfere with each other"). miterSquare:
    // a straight profile's corner is a square notch; an L profile keeps its 45° mitres. (lane rfIS, report 2026-11-02 5d:
    // SolidWorks' L profile also ends the first line's strips square, T + g/√2 past the base's corner, and runs each later
    // bend's end straight from that wall's end to the 45° wall line; the later stages here find their corner by the wall
    // ends being a gap apart, which square ends are not: not done yet)
    var f1 = { id: f.id, type: 'flange', edges: edges, angle: A1 * 180 / Math.PI, length: L1, lengthRef: 'inner', position: position, radius: f.radius, toward: u,
      miter: true, miterStage: true, miterSquare: true, miterGap: gap, startOffset: +f.startOffset || 0, endOffset: +f.endOffset || 0, startAt: S, bendAllowance: f.bendAllowance };
    // a relief at a Start / End Offset (SolidWorks, rfDU): T/2 wide unless sized, T/2 past the bend's start line
    if (f.relief != null) { f1.relief = f.relief; f1.reliefWidth = f.reliefWidth != null ? f.reliefWidth : T / 2; f1.reliefDepth = f.reliefDepth != null ? f.reliefDepth : T / 2; }
    f1.reliefFromBend = true;
    var stages = [f1], r = run(f1, 0);
    // each record's original section frame, to turn the profile's directions into world directions on its edge
    var track = r.info.map(function (rec) { return { o: rec.o, u: rec.u, rec: rec }; });
    for (var k = 1; k < segs.length; k++) {
      var jt = joints[k - 1], wall = segs[k].D - jt.sb - (k < joints.length ? joints[k].sb : 0);
      if (!(wall > 1e-6)) throw new Error('Miter Flange: line ' + (k + 1) + ' of the profile is too short for its bend' + (k < joints.length ? 's' : '') + '.');
      var picks = track.map(function (tr) {
        var rec = tr.rec, sA = Math.sin(rec.angle), cA = Math.cos(rec.angle), L = rec.L, Rr = rec.R;
        var dPrev = add(scale(tr.o, segs[k - 1].a), scale(tr.u, segs[k - 1].b)), dNext = add(scale(tr.o, segs[k].a), scale(tr.u, segs[k].b));
        var tw = norm(sub(dNext, scale(dPrev, dot(dNext, dPrev))));
        var innerEnd = add(add(rec.origin, scale(rec.o, Rr * sA + cA * L)), scale(rec.u, Rr - Rr * cA + sA * L));
        var outerDir = add(scale(rec.o, sA), scale(rec.u, -cA));
        return { at: dot(tw, outerDir) > 0 ? add(innerEnd, scale(outerDir, T)) : innerEnd, tr: tr };
      });
      var fk = { id: f.id, type: 'flange', edges: picks.map(function (pk) { return { at: pk.at }; }), angle: jt.A * 180 / Math.PI, length: wall, position: 'bendOutside',
        radius: jt.R, miter: true, miterGap: gap, miterJoin: gap + 1e-4, swJoin: true, relief: 'none', bendAllowance: f.bendAllowance };
      stages.push(fk);
      r = run(fk, k);
      r.info.forEach(function (rec) {
        var bp = null;
        picks.forEach(function (pk) { var d = _.pointSegmentDistance(pk.at, rec.a, rec.b); if (!bp || d < bp.d) bp = { d: d, pk: pk }; });
        if (bp) bp.pk.tr.rec = rec;
      });
    }
    return { stages: stages };
  }
  var MITER_FLANGE_POSITIONS = ['inside', 'outside', 'bendOutside'];
  // Anvil's build: the stages one after the other on the part; the tool is every stage's flange, the cut the first
  // stage's trim-back and reliefs (the later stages are Bend Outside with no relief: nothing to cut)
  function buildMiterFlange(f, model, ctx) {
    var body = ctx.body, tools = [], infos = [], cut1 = null;
    miterFlangeStages(f, model, ctx, function (fk, k) {
      var c = { body: body, flanges: {}, tools: {} };
      var tool = buildFlange(fk, model, c);
      if (k === 0) cut1 = c.flangeCut;
      body = (c.flangeCut ? body.subtract(c.flangeCut) : body).union(tool);
      tools.push(tool);
      infos = infos.concat(c.flanges[f.id]);
      return { info: c.flanges[f.id], body: body };
    });
    ctx.flanges[f.id] = infos;
    ctx.flangeCut = cut1;
    return unionAll(tools);
  }

  // Normal Cut (the Cut-Extrude option of the same name): a cut sketched on a plane that is not parallel to the
  // sheet would leave slanted walls no laser or punch can make. The tool is replaced by a prism normal to the sheet:
  // the part of the tool inside the body is meshed, and each of its faces that lies on a sheet surface (flat or a
  // bend facet: air just in front of it, metal half a thickness behind, air again a full thickness behind) is
  // outlined and pushed straight through the thickness. With `dir` (the extrusion direction) only the faces the
  // tool enters through are used, so a blind cut is not doubled from the far side; without it (mid-plane or
  // two-direction cuts), or when the tool enters through a thickness edge, every sheet-surface face counts. A cut of
  // any depth becomes a through-thickness cut. Returns `tool` itself when it crosses no sheet surface.
  function normalCutTool(tool, body, model, dir) {
    var R = body.intersect(tool);
    if (!(R.volume() > 1e-9)) return tool;
    var T = +sheetParams(model).thickness, eps = 1e-3 * T;
    var inside = body.pointTester();
    // sheetFaces(mesh) -> { caps, entry }: the faces of `mesh` (a piece of the body) that lie on a sheet surface, and
    // of those the ones a cut along `dir` enters through
    function sheetFaces(mesh) {
      var p = mesh.positions64, caps = [], entry = [];
      mesh.faces.forEach(function (face, i) {
        // one probe per triangle (its centroid), votes weighted by area: a sliver triangle at the rim of a bend facet
        // can probe into the neighbouring facet's metal and must not outvote the bulk of the face
        var n = face.normal, yes = 0, no = 0;
        for (var t = face.start; t < face.start + face.count; t++) {
          var k = t * 9;
          var a = [p[k], p[k + 1], p[k + 2]], b = [p[k + 3], p[k + 4], p[k + 5]], d = [p[k + 6], p[k + 7], p[k + 8]];
          var c = scale(add(add(a, b), d), 1 / 3), w = len(cross(sub(b, a), sub(d, a)));
          var onSheet = !inside(add(c, scale(n, eps))) && inside(sub(c, scale(n, T / 2))) && !inside(sub(c, scale(n, T + eps)));
          if (onSheet) yes += w; else no += w;
        }
        if (!(yes > no)) return;
        caps.push(i);
        if (dir && dot(n, dir) < -1e-6) entry.push(i);
      });
      return { caps: caps, entry: entry };
    }
    var meshR = meshFromBody(R), sf = sheetFaces(meshR);
    var chosen = (sf.entry.length ? sf.entry : sf.caps).map(function (i) { return { mesh: meshR, i: i }; });
    if (!chosen.length) return tool;
    var tag = tool.polygons.length ? tool.polygons[0].shared : undefined;
    // rfBZ: a cut sketched on a face next to a bend (a hole straddling the bend line, cut from the top face) only
    // reaches the part of the bend below its sketch plane, while the bend's inside surface rises above it. As
    // SolidWorks' Normal Cut, the hole's footprint follows the sheet surface it enters through across the bend: the
    // tool's start cap is swept backward (against `dir`), and the sheet-surface faces it meets there that face the cut
    // and continue an entry face (sharing a vertex with one, bend facet after bend facet) join the entry faces.
    var others = [{ mesh: meshR, caps: sf.caps }];   // sheet faces of the pieces, for the joint wedges below
    if (dir && sf.entry.length) {
      var back = backwardShadow(tool, body, dir, tag);
      var R2 = back ? body.intersect(back) : null;
      if (R2 && R2.volume() > 1e-12) {
        var meshR2 = meshFromBody(R2), tol = 1e-6 * Math.max(1, 100 * T), sf2 = sheetFaces(meshR2);
        others.push({ mesh: meshR2, caps: sf2.caps });
        var cand = sf2.entry.map(function (i) { return { mesh: meshR2, i: i, pts: faceVerts(meshR2, i) }; });
        var seen = chosen.map(function (c) { return faceVerts(c.mesh, c.i); });
        var touches = function (c) {
          return seen.some(function (pts) { return pts.some(function (q) { return c.pts.some(function (s) { return Math.abs(s[0] - q[0]) < tol && Math.abs(s[1] - q[1]) < tol && Math.abs(s[2] - q[2]) < tol; }); }); });
        };
        for (var grew = true; grew && cand.length;) {
          grew = false;
          cand = cand.filter(function (c) {
            if (!touches(c)) return true;
            chosen.push({ mesh: c.mesh, i: c.i }); seen.push(c.pts); grew = true;
            return false;
          });
        }
      }
    }
    var prisms = [], outl = [];
    chosen.forEach(function (c) {
      var o = faceOutline(c.mesh, c.i);
      if (!o) return;
      var cl = faceLoopsClassified(o);
      if (!cl.outers.length) return;
      var f = c.mesh.faces[c.i];
      outl.push({ n: f.normal, w: f.w, o: o, cl: cl, pts: o.loops.reduce(function (s, l) { return s.concat(l.map(function (q) { return to3D(o.plane, q[0], q[1]); })); }, []) });
    });
    // rfBZ: two faces meeting at a concave joint (bend facets on the inside of a bend; the flat face and the first
    // facet) are pushed through by their own normals, which part behind the joint and leave a sliver of metal
    // between their prisms: a wedge along the shared edge fills it. Where the cut stops at such a joint (the last bend
    // facet against the wall's inside face) the wedge runs from its prism to the neighbour's normal, the bend's end line.
    for (var ia = 0; ia < outl.length; ia++) for (var ib = ia + 1; ib < outl.length; ib++) {
      var wdg = jointWedge(outl[ia], outl[ib], T + eps, tag);
      if (wdg) { prisms.push(wdg); outl[ia].concave = outl[ib].concave = true; }
    }
    others.forEach(function (oc) {
      oc.caps.forEach(function (i) {
        if (chosen.some(function (c) { return c.mesh === oc.mesh && c.i === i; })) return;
        var nf = oc.mesh.faces[i], nb = { n: nf.normal, w: nf.w, pts: faceVerts(oc.mesh, i) };
        outl.forEach(function (fa) { var w = jointWedge(fa, nb, T + eps, tag, true); if (w) { prisms.push(w); fa.concave = true; } });
      });
    });
    outl.forEach(function (fo) {
      // through the thickness along −n: from just in front of the face to just past the far surface. In front of a
      // face at a concave joint the neighbour rises: the prism's front plane cuts the neighbour's surface a little
      // way from the joint (all through the part, as a BSP splits), so it stands well clear (0.05·T), or that strip
      // would be thin enough for the meshing's 1e-4 weld to fold and the flat to read a slit across the bend.
      var front = fo.concave ? 0.05 * T : eps;
      var solid = unionAll(fo.cl.outers.map(function (l) { return prism(l, fo.o.plane, -(T + eps), front, tag); }));
      if (fo.cl.holes.length) solid = solid.subtract(unionAll(fo.cl.holes.map(function (l) { return prism(l, fo.o.plane, -(T + 2 * eps), front + eps, tag); })));
      prisms.push(solid);
    });
    if (!prisms.length) return tool;
    return unionTree(prisms);
  }
  // the 3D corners of a mesh face's triangles
  function faceVerts(mesh, i) {
    var f = mesh.faces[i], p = mesh.positions64, out = [];
    for (var k = f.start * 9; k < (f.start + f.count) * 9; k += 3) out.push([p[k], p[k + 1], p[k + 2]]);
    return out;
  }
  // backwardShadow(tool, body, dir, tag) -> the tool's start cap (its backmost faces facing −dir) swept against dir
  // past the far side of the body, or null
  function backwardShadow(tool, body, dir, tag) {
    var mt = meshFromBody(tool), caps = [], wMin = Infinity;
    mt.faces.forEach(function (f, i) { if (dot(f.normal, dir) < -1 + 1e-9) { caps.push(i); wMin = Math.min(wMin, f.w); } });
    caps = caps.filter(function (i) { return Math.abs(mt.faces[i].w - wMin) < 1e-9; });
    if (!caps.length) return null;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    body.polygons.forEach(function (pg) {
      pg.vertices.forEach(function (v) {
        var q = v.pos;
        lo = [Math.min(lo[0], q.x), Math.min(lo[1], q.y), Math.min(lo[2], q.z)]; hi = [Math.max(hi[0], q.x), Math.max(hi[1], q.y), Math.max(hi[2], q.z)];
      });
    });
    var H = len(sub(hi, lo)) + 1, solids = [];
    caps.forEach(function (i) {
      var o = faceOutline(mt, i);
      if (!o) return;
      var cl = faceLoopsClassified(o);
      if (!cl.outers.length) return;
      var s = unionAll(cl.outers.map(function (l) { return prism(l, o.plane, 0, H, tag); }));
      if (cl.holes.length) s = s.subtract(unionAll(cl.holes.map(function (l) { return prism(l, o.plane, -1, H + 1, tag); })));
      solids.push(s);
    });
    return solids.length ? unionAll(solids) : null;
  }
  // jointWedge(fa, fb, D, tag, onlyA?) -> a triangular prism along the edge two faces ({ n, w, pts }) share at a concave
  // joint (each face rises in front of the other's plane), reaching D behind it between their normals; null when
  // they share no edge or the joint is flat or convex
  function jointWedge(fa, fb, D, tag, onlyA) {
    var c = dot(fa.n, fb.n);
    if (c > 1 - 1e-6 || c < 0.5) return null;
    var tol = 1e-6 * Math.max(1, D * 100);
    var onBoth = function (q) { return Math.abs(dot(fa.n, q) - fa.w) < tol && Math.abs(dot(fb.n, q) - fb.w) < tol; };
    var on = fa.pts.filter(onBoth);
    if (onlyA) { if (!fb.pts.some(onBoth)) return null; } else on = on.concat(fb.pts.filter(onBoth));
    if (on.length < 2) return null;
    var front = function (f, g) { return f.pts.some(function (q) { return dot(g.n, q) - g.w > tol; }); };
    if (!front(fa, fb) || !front(fb, fa)) return null;
    var d = norm(cross(fa.n, fb.n)), t0 = Infinity, t1 = -Infinity, P = null;
    on.forEach(function (q) { var t = dot(q, d); if (t < t0) { t0 = t; P = q; } t1 = Math.max(t1, t); });
    if (!(t1 - t0 > tol)) return null;
    var x = scale(fa.n, -1), y = cross(d, x), pl = { origin: P, x: x, y: y, n: d };
    var nb = scale(fb.n, -1);
    var loop = [[0, 0], [D, 0], [dot(nb, x) * D, dot(nb, y) * D]];   // apex on the joint: its sides are the prisms' own
    if (signedArea(loop) < 0) loop.reverse();
    return prism(loop, pl, 0, t1 - t0, tag);
  }

  // bendNoteText(bend, units, opts?) -> the shop bend note: direction, angle and inside radius as the drawing
  // dimensions read them, 'UP 90° R.060' in inches (opts.prec places, default 3, trailing zeros kept, no zero before
  // the point) and 'DOWN 90° R1.5' in mm (up to 2 places, trailing zeros dropped, or opts.prec fixed places). The
  // angle keeps one decimal only when it has one (90°, 37.5°). The flat DXF and the Flatten preview use it.
  function bendNoteText(b, units, opts) {
    var prec = opts && opts.prec != null && isFinite(+opts.prec) ? Math.max(0, Math.min(6, Math.round(+opts.prec))) : null;
    var r = +b.R, ang = Math.round(+b.angle * 10) / 10, txt;
    if (units === 'in') {
      var p = Math.pow(10, prec == null ? 3 : prec), v = Math.round(Math.abs(r) * p) / p;
      txt = v === 0 ? '0' : v.toFixed(prec == null ? 3 : prec).replace(/^0\./, '.');
    } else if (prec != null) txt = (Math.round(r * Math.pow(10, prec)) / Math.pow(10, prec)).toFixed(prec);
    else txt = String(Math.round(r * 100) / 100);
    return (b.up ? 'UP' : 'DOWN') + ' ' + ang + '° R' + txt;
  }

  // Bend allowance with a K-factor: arc length of the neutral axis.
  function bendAllowance(angleRad, R, T, K) { return angleRad * (R + K * T); }

  // ------------------------------------------------------------------ flat pattern: 2D region merge and loop hygiene
  // mergeFlatRegions(regions, notches, W) -> the loops of (∪ regions) − (∪ notches), each with the blank on its left
  // (outer loops CCW, holes CW), or null when a boundary does not close (the caller then merges with CSG).
  // regions: [[loop, …]] (one per unfolded face or bend strip; a point is in a region when an odd number of its loops
  // hold it, so a face's holes stay holes); notches: [loop] (bend reliefs, cut from the merged blank). An arrangement
  // of the loops' edges:
  //   1. every point is welded to the nearest one already seen within W (the regions come from rigid maps of real
  //      faces, whose shared corners sit a few 1e-5 apart); where two edges cross, the crossing becomes a point too;
  //   2. each edge is cut at every point within W of it, so near-coincident edges are made of the very same pieces;
  //   3. a piece is on the boundary when the blank lies on one side of it only, tested a hair off its middle against
  //      the loops rebuilt from those welded points (a seam of two regions is then never a gap nor a double edge);
  //   4. the kept pieces, the blank on their left, are chained into loops (where two loops touch, the sharpest right
  //      turn: they stay two loops), then collinear points and zero-width spikes are dropped.
  // The CSG merge this replaces (thin prisms, union, outline of the top face) could split a blank in two where several
  // region edges meet at one corner (a mitred tray corner: BSP fragments 1e-5 apart the outline tracer did not chain).
  // flatOptions.merge: '2d' (default) or 'csg' (the old merge, for comparison); FLAT_WELD: mergeFlatRegions' W, the
  // weld distance faceOutline uses for the same near-coincident corners
  var flatOptions = { merge: '2d' }, FLAT_WELD = 1e-4;
  function mergeFlatRegions(regions, notches, W) {
    var P = [], grid = {}, S = 1;
    function vid(p) {
      var ix = Math.floor(p[0] / W), iy = Math.floor(p[1] / W), best = -1, bd = W;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var c = grid[(ix + dx) + ',' + (iy + dy)];
        if (c) for (var j = 0; j < c.length; j++) { var q = P[c[j]], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= bd) { bd = d; best = c[j]; } }
      }
      if (best >= 0) return best;
      P.push([+p[0], +p[1]]);
      S = Math.max(S, Math.abs(p[0]), Math.abs(p[1]));
      (grid[ix + ',' + iy] = grid[ix + ',' + iy] || []).push(P.length - 1);
      return P.length - 1;
    }
    var shapes = [], edges = [];
    function addShape(loops, cut) {
      var sh = { loops: [], cut: cut };
      loops.forEach(function (l) {
        if (!l || l.length < 3 || !(Math.abs(signedArea(l)) >= 1e-9)) return;
        var ids = [];
        l.forEach(function (p) { var k = vid(p); if (!ids.length || ids[ids.length - 1] !== k) ids.push(k); });
        while (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
        if (ids.length < 3) return;
        var lp = [];
        for (var i = 0; i < ids.length; i++) { var e = { a: ids[i], b: ids[(i + 1) % ids.length] }; lp.push(e); edges.push(e); }
        sh.loops.push(lp);
      });
      if (sh.loops.length) shapes.push(sh);
    }
    regions.forEach(function (rg) { addShape(rg, false); });
    (notches || []).forEach(function (n) { addShape([n], true); });
    if (!shapes.some(function (s) { return !s.cut; })) return null;
    function boxOf(e) { var a = P[e.a], b = P[e.b]; e.x0 = Math.min(a[0], b[0]); e.x1 = Math.max(a[0], b[0]); e.y0 = Math.min(a[1], b[1]); e.y1 = Math.max(a[1], b[1]); }
    edges.forEach(boxOf);
    // 1. crossings (a sweep over x)
    var byX = edges.slice().sort(function (p, q) { return p.x0 - q.x0; }), i, j;
    for (i = 0; i < byX.length; i++) {
      var e = byX[i];
      for (j = i + 1; j < byX.length && byX[j].x0 <= e.x1 + W; j++) {
        var f = byX[j];
        if (f.y0 > e.y1 + W || f.y1 < e.y0 - W || f.a === e.a || f.a === e.b || f.b === e.a || f.b === e.b) continue;
        var a1 = P[e.a], a2 = P[e.b], b1 = P[f.a], b2 = P[f.b];
        var rx = a2[0] - a1[0], ry = a2[1] - a1[1], sx = b2[0] - b1[0], sy = b2[1] - b1[1], den = rx * sy - ry * sx;
        if (Math.abs(den) <= 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) continue;   // parallel: step 2 joins them
        var qx = b1[0] - a1[0], qy = b1[1] - a1[1], t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
        if (t > 0 && t < 1 && u > 0 && u < 1) vid([a1[0] + rx * t, a1[1] + ry * t]);
      }
    }
    // 2. every edge cut at the points within W of it
    var order = P.map(function (p, k) { return k; }).sort(function (p, q) { return P[p][0] - P[q][0]; }), xs = order.map(function (k) { return P[k][0]; });
    function firstAtLeast(x) { var lo = 0, hi = xs.length; while (lo < hi) { var m = (lo + hi) >> 1; if (xs[m] < x) lo = m + 1; else hi = m; } return lo; }
    edges.forEach(function (e) {
      var a = P[e.a], b = P[e.b], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, cuts = [{ t: 0, id: e.a }];
      for (var k = firstAtLeast(e.x0 - W); k < order.length && xs[k] <= e.x1 + W; k++) {
        var id = order[k], p = P[id];
        if (id === e.a || id === e.b || p[1] < e.y0 - W || p[1] > e.y1 + W) continue;
        var wx = p[0] - a[0], wy = p[1] - a[1], t = wx * ux + wy * uy;
        if (t > 0 && t < L && Math.abs(wx * uy - wy * ux) <= W) cuts.push({ t: t, id: id });
      }
      cuts.sort(function (p, q) { return p.t - q.t; });
      cuts.push({ t: L, id: e.b });
      e.chain = [];
      cuts.forEach(function (c) { if (e.chain[e.chain.length - 1] !== c.id) e.chain.push(c.id); });
    });
    // the loops again, through the welded points
    shapes.forEach(function (sh) {
      sh.polys = sh.loops.map(function (lp) { var pts = []; lp.forEach(function (e) { for (var k = 0; k + 1 < e.chain.length; k++) pts.push(P[e.chain[k]]); }); return pts; });
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      sh.polys.forEach(function (pl) { pl.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); });
      sh.box = [x0, y0, x1, y1];
    });
    function inShape(sh, q) {
      if (q[0] < sh.box[0] || q[0] > sh.box[2] || q[1] < sh.box[1] || q[1] > sh.box[3]) return false;
      var c = false;
      for (var k = 0; k < sh.polys.length; k++) if (pointInPoly(q, sh.polys[k])) c = !c;
      return c;
    }
    function inBlank(q) {
      var k, hit = false;
      for (k = 0; k < shapes.length && !hit; k++) if (!shapes[k].cut && inShape(shapes[k], q)) hit = true;
      if (!hit) return false;
      for (k = 0; k < shapes.length; k++) if (shapes[k].cut && inShape(shapes[k], q)) return false;
      return true;
    }
    // 3. the boundary pieces, each geometric piece tested once
    var seen = {}, kept = [];
    edges.forEach(function (e) {
      for (var k = 0; k + 1 < e.chain.length; k++) {
        var u = e.chain[k], v = e.chain[k + 1], key = u < v ? u + '|' + v : v + '|' + u;
        if (seen[key]) continue;
        seen[key] = true;
        var p = P[u], q = P[v], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
        if (!(L > 0)) continue;
        var h = Math.min(1e-7 * S, W / 10, 0.05 * L), m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], nx = -dy / L * h, ny = dx / L * h;
        var inL = inBlank([m[0] + nx, m[1] + ny]), inR = inBlank([m[0] - nx, m[1] - ny]);
        if (inL === inR) continue;
        kept.push(inL ? { a: u, b: v } : { a: v, b: u });
      }
    });
    // 4. chain
    var out = {};
    kept.forEach(function (e) { (out[e.a] = out[e.a] || []).push(e); });
    function turn(din, e) { var o = [P[e.b][0] - P[e.a][0], P[e.b][1] - P[e.a][1]]; return Math.atan2(din[0] * o[1] - din[1] * o[0], din[0] * o[0] + din[1] * o[1]); }
    var loops = [], closedAll = true;
    kept.forEach(function (e0) {
      if (e0.used) return;
      var ids = [], cur = e0, closed = false;
      while (cur && !cur.used) {
        cur.used = true; ids.push(cur.a);
        if (cur.b === e0.a) { closed = true; break; }
        var cands = (out[cur.b] || []).filter(function (x) { return !x.used; });
        if (cands.length > 1) {
          var din = [P[cur.b][0] - P[cur.a][0], P[cur.b][1] - P[cur.a][1]];
          cands.sort(function (x, y) { return turn(din, x) - turn(din, y); });
        }
        cur = cands[0];
      }
      if (!closed) { closedAll = false; return; }
      var pts = cleanFlatLoop(ids.map(function (id) { return P[id].slice(); }), Math.min(W, 1e-7 * S));
      if (!pts) return;
      var per = 0;
      pts.forEach(function (p, k) { var q = pts[(k + 1) % pts.length]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); });
      if (Math.abs(signedArea(pts)) > 0.5 * W * per) loops.push(pts);   // a sliver narrower than W is no loop
    });
    return closedAll && loops.length ? loops : null;
  }
  // cleanFlatLoop(pts, tol) -> the loop without consecutive duplicates (within tol), points within tol of the straight
  // line through their neighbours (collinear points on a straight run, and spikes: a point the outline goes out to
  // and straight back from), or null when fewer than 3 points are left. No point that stays is moved.
  function cleanFlatLoop(pts, tol) {
    var p = pts.filter(function (q) { return q && isFinite(q[0]) && isFinite(q[1]); });
    for (var again = true; again && p.length >= 3;) {
      again = false;
      for (var i = 0; i < p.length && p.length >= 3; i++) {
        var n = p.length, o = p[(i + n - 1) % n], q = p[i], r = p[(i + 1) % n];
        var dx = r[0] - o[0], dy = r[1] - o[1], L = Math.hypot(dx, dy);
        // (neighbours on one point: q is the tip of a spike, or a duplicate)
        var off = L > tol ? Math.abs((q[0] - o[0]) * dy - (q[1] - o[1]) * dx) / L : 0;
        if (Math.hypot(q[0] - o[0], q[1] - o[1]) <= tol || off <= tol) { p.splice(i, 1); i--; again = true; }
      }
    }
    return p.length >= 3 ? p : null;
  }

  // ---- r16/flatcircle: a round hole that crosses a bend reaches the flat as two kinds of points: those of the hole in
  // the flat sheet (on the circle) and the bend's cutout polygon (vertices on the circle, but where the two meet the
  // outline turns on a chord, up to a sagitta inside). OpenCascade's flat joined its exact tessellation to Anvil's
  // polygon so the chords were unequal and the DXF writer drew LINE / ARC pieces instead of one CIRCLE.
  // snapFlatCircle(loop, tol) -> the loop redrawn as a regular polygon (max(16, n) points, same start angle and turn
  // direction) on its circle, when it is one: every point within tol inside the smallest circle enclosing them all
  // (the true circle: its own points lie on it, chord points inside), no gap between neighbours wider than 30° as
  // seen from the centre and one full turn; else the loop unchanged. A loop that is already a regular polygon on its
  // circle is returned as is.
  function enclosingCircle(pts) {
    function c2(a, b) { return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r: Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 }; }
    function c3(a, b, c) {
      var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
      if (Math.abs(d) < 1e-300) return null;
      var a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], cc = c[0] * c[0] + c[1] * c[1];
      var x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + cc * (a[1] - b[1])) / d, y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + cc * (b[0] - a[0])) / d;
      return { c: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
    }
    function inside(C, p) { return C && Math.hypot(p[0] - C.c[0], p[1] - C.c[1]) <= C.r * (1 + 1e-12) + 1e-12; }
    var C = null;
    for (var i = 0; i < pts.length; i++) {
      if (inside(C, pts[i])) continue;
      C = { c: pts[i].slice(), r: 0 };
      for (var j = 0; j < i; j++) {
        if (inside(C, pts[j])) continue;
        C = c2(pts[i], pts[j]);
        for (var k = 0; k < j; k++) if (!inside(C, pts[k])) C = c3(pts[i], pts[j], pts[k]) || C;
      }
    }
    return C;
  }
  // rfFE2: the circle most of the loop's points lie on exactly (the drilled circle's own vertices), or null. The
  // enclosing circle alone is pulled out by any point a little outside it: a bend cutout carried past its strip's end
  // (growLoop) leaves a jog of ~0.001 in just outside the circle where the wall's chord crosses the bend line, and
  // with 40 chords per circle the Ø.300 hole's flat CIRCLE came out R .15037. Least squares (Kåsa) on all points, then
  // twice on the closer half, then on the points within 1e-7 of that circle: kept when they are at least half the loop.
  function majorityCircle(loop) {
    function fit(pts) {
      var m = pts.length, mx = 0, my = 0, j;
      if (m < 3) return null;
      for (j = 0; j < m; j++) { mx += pts[j][0]; my += pts[j][1]; }
      mx /= m; my /= m;
      var suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
      for (j = 0; j < m; j++) {
        var u = pts[j][0] - mx, v = pts[j][1] - my;
        suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
      }
      var det = suu * svv - suv * suv;
      if (!(Math.abs(det) > 1e-300)) return null;
      var bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2, c = [mx + (bu * svv - bv * suv) / det, my + (bv * suu - bu * suv) / det], r = 0;
      for (j = 0; j < m; j++) r += Math.hypot(pts[j][0] - c[0], pts[j][1] - c[1]);
      return { c: c, r: r / m };
    }
    function closest(F, frac) {
      return loop.map(function (p) { return { p: p, e: Math.abs(Math.hypot(p[0] - F.c[0], p[1] - F.c[1]) - F.r) }; })
        .sort(function (a, b) { return a.e - b.e; }).slice(0, Math.max(3, Math.ceil(loop.length * frac))).map(function (x) { return x.p; });
    }
    var F = fit(loop);
    for (var it = 0; F && it < 2; it++) F = fit(closest(F, 0.5));
    if (!F || !(F.r > 0)) return null;
    var eps = 1e-7 * (1 + F.r), on = loop.filter(function (p) { return Math.abs(Math.hypot(p[0] - F.c[0], p[1] - F.c[1]) - F.r) <= eps; });
    if (on.length * 2 < loop.length) return null;
    var G = fit(on);
    return G && G.r > 0 ? G : F;
  }
  function snapFlatCircle(loop, tol) {
    var n = loop.length;
    if (n < 8) return loop;
    var C = enclosingCircle(loop), M = majorityCircle(loop);
    if (M) C = M;
    if (!C || !(C.r > 0)) return loop;
    var r = C.r, cx = C.c[0], cy = C.c[1], worst = 0, turn = 0, gap = 0, i;
    for (i = 0; i < n; i++) {
      var p = loop[i], q = loop[(i + 1) % n], dr = r - Math.hypot(p[0] - cx, p[1] - cy);
      worst = Math.max(worst, M ? Math.abs(dr) : dr);   // on the majority circle a point may also stand a little outside
      var da = Math.atan2((p[0] - cx) * (q[1] - cy) - (p[1] - cy) * (q[0] - cx), (p[0] - cx) * (q[0] - cx) + (p[1] - cy) * (q[1] - cy));
      turn += da; gap = Math.max(gap, Math.abs(da));
    }
    if (worst > tol || gap > Math.PI / 6 + 1e-9 || Math.abs(Math.abs(turn) - 2 * Math.PI) > 1e-6) return loop;
    var chord = 2 * r * Math.sin(Math.PI / n), regular = worst <= 1e-9 * (1 + r);
    for (i = 0; regular && i < n; i++) if (Math.abs(Math.hypot(loop[(i + 1) % n][0] - loop[i][0], loop[(i + 1) % n][1] - loop[i][1]) - chord) > 1e-9 * (1 + r)) regular = false;
    if (regular) return loop;
    var N = Math.max(16, n), a0 = Math.atan2(loop[0][1] - cy, loop[0][0] - cx), s = turn > 0 ? 1 : -1, out = [];
    for (i = 0; i < N; i++) { var a = a0 + s * 2 * Math.PI * i / N; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  // the snap tolerance: 0.003 in / 0.075 mm (above the sagitta Anvil's default tessellation leaves on a cutout's chord),
  // or the sagitta at the 128-chord cap for a large hole, never more than 3 % of the radius
  function flatCircleTol(units, r) {
    return Math.min(0.03 * r, Math.max(units === 'in' ? 0.003 : 0.075, 1.5 * r * (1 - Math.cos(Math.PI / 128))));
  }
  // ---- end r16/flatcircle

  // csgMerge(regions, notches) -> the merged blank's loops the CSG way: thin prisms in the Front frame, union, the
  // notches subtracted, the outline of the top face (mergeFlatRegions' fallback, and flatOptions.merge 'csg')
  function csgMerge(regions, notches) {
    var fp = makePlane('Front', 0), solids = [];
    regions.forEach(function (loops) {
      var cl = [];
      loops.forEach(function (l) {
        var a = signedArea(l);
        if (Math.abs(a) < 1e-9) return;
        cl.push({ pts: a > 0 ? l : l.slice().reverse(), depth: 0 });
      });
      cl.forEach(function (x) {
        var probe = [(x.pts[0][0] + x.pts[1][0]) / 2, (x.pts[0][1] + x.pts[1][1]) / 2];
        cl.forEach(function (y) { if (x !== y && pointInPoly(probe, y.pts)) x.depth++; });
      });
      var outers = cl.filter(function (x) { return x.depth % 2 === 0; }).map(function (x) { return prism(x.pts, fp, 0, 1); });
      var holes = cl.filter(function (x) { return x.depth % 2 === 1; }).map(function (x) { return prism(x.pts, fp, -0.01, 1.01); });
      if (!outers.length) return;
      var s = unionAll(outers);
      if (holes.length) s = s.subtract(unionAll(holes));
      solids.push(s);
    });
    if (!solids.length) throw new Error('Could not build the flat pattern.');
    // The regions come from rigid maps of real faces, so their shared corners carry near-coincident vertices (a few
    // 1e-5 apart). Merged with every BSP fragment kept, both sides of such a seam get the same split vertices and the
    // outline tracer welds them; with CSG's whole-polygon restore a seam becomes a T-junction beyond its tolerance and
    // the blank falls apart into two loops. So this one merge keeps all fragments.
    var keepWhole = CSG.options ? CSG.options.restoreWhole : null, merged;
    if (CSG.options) CSG.options.restoreWhole = false;
    try {
      merged = unionTree(solids);
      // bend reliefs: the strips are plain rectangles, so the notches are cut from the merged blank
      if (notches.length) merged = merged.subtract(unionAll(notches.map(function (l) { return prism(l, fp, -0.01, 1.01); })));
    } finally { if (CSG.options) CSG.options.restoreWhole = keepWhole; }
    var fm = meshFromBody(merged), topIdx = -1;
    fm.faces.forEach(function (fc, i) { if (fc.normal[2] > 0.999 && Math.abs(fc.w - 1) < 1e-6) topIdx = i; });
    if (topIdx < 0) throw new Error('Could not build the flat pattern.');
    var fo = faceOutline(fm, topIdx);
    return fo.loops.map(function (l) { return l.map(function (p) { var q = to3D(fo.plane, p[0], p[1]); return [q[0], q[1]]; }); });
  }
  // -> { loops: [[[u,v],...]] (outer first, CCW; holes after), bends: [{a:[u,v], b:[u,v], label, up, angle, R, ba, bd,
  // method, source}], plane, sheet (the resolved parameters, kFactor always filled in), bbox, size: [w, h] (the blank's
  // bounding box), note (sheetNote: the parameters for the DXF / drawing note), warnings: [string], etch: [item]
  // and etchLayer (flatEtch: the Etch text and ETCH-layer marks of sketches on the sheet's faces, in flat coordinates) }
  // Recursive unfold on one side of the sheet: the base face (largest face on the +n side of the base sketch plane)
  // is mapped into the sketch frame; every flange attached to an unfolded face contributes a bend strip of length
  // BA (bendCalc: the sheet's bend allowance method, or the feature's custom one) beyond its edge and then unfolds its
  // wall face (real outline, holes included) with a rigid
  // map, recursively, so flanges on flanges and holes on walls all reach the flat. The regions are merged in 2D
  // (mergeFlatRegions; the CSG merge, csgMerge, only as its fallback) and every loop is cleaned (cleanFlatLoop).
  // lane dxfout: points in a bend line's frame (origin bend.a, x along a→b, y to its left)
  function bendLocal(bend, pts) {
    var dx = bend.b[0] - bend.a[0], dy = bend.b[1] - bend.a[1], l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    return pts.map(function (p) { var x = p[0] - bend.a[0], y = p[1] - bend.a[1]; return [x * dx + y * dy, y * dx - x * dy]; });
  }
  function flatPattern(model, build, mesh, opts) {
    // lane DB: opts.trace (an object) is filled with { faces, strips, plane, nB, wB }: every laid face piece and bend
    // strip with the rigid map it went into the flat with (Unfold / Fold use them to move material between the states)
    var trace = opts && opts.trace ? opts.trace : null;
    if (trace) { trace.faces = []; trace.strips = []; }
    var rmodel = resolvedModel(model);
    if (rmodel.sheetError) throw new Error(rmodel.sheetError);
    model = rmodel.model;
    var sheet = model.sheet;
    if (!sheet) throw new Error('No sheet metal parameters: create a Base Flange first (Sheet Metal tab).');
    var base = model.features.filter(function (f) { return f.sheetBase; })[0];
    if (!base) throw new Error('No Base Flange feature found.');
    var obFlat = null;   // lane open-base: a Base Flange from an open profile lays the flat from its fixed plate
    if (isOpenBase(base)) { var obl = openBaseLayout(base, model, { planes: build.planes }); base = Object.assign({}, base, { fixedFace: obl.fixed }); obFlat = obl.flatPlane; }
    var plane = obFlat || ibFlatPlane(base, mesh, model) || resolvePlane(findFeature(model, base.sketch).plane, model, build.planes);   // lane DQ: Insert Bends lays the flat from its fixed face
    // lane DB2: a part left unfolded draws its flat in the frame the Unfold moved the flat to (the same 2D as folded)
    var openUnfold = ufOpenRecord(model, build);
    if (openUnfold && openUnfold.frame) plane = openUnfold.frame;
    var T = +sheet.thickness, warnings = [], kUsed = {};
    var fopt = flatOptionsOf(model), regionLines = [], bendRegions = [], slitEnds = [];   // lane flatopts
    function warn(w) { if (w && warnings.indexOf(w) < 0) warnings.push(w); }
    mesh = planeFaces(mesh);
    var best = null;
    mesh.faces.forEach(function (face, i) {
      var d = dot(face.normal, plane.n);
      if (Math.abs(d) < 0.999) return;
      // the face on the sketch's side wins unless the other side is a tenth larger (BW: was a tie-break of 1e-6, so a
      // hole or slot cut into one face from the wall side flipped the whole flat over: the blank came out mirrored
      // and every UP bend read DOWN; an OpenCascade mesh gives the two faces of one plate areas a few 1e-8 apart, and
      // the unfold must not change sides on that either). The flat is drawn looking at the base sketch's face.
      var score = face.area * (d > 0 ? 1.1 : 1);
      if (!best || score > best.score) best = { face: face, i: i, score: score };
    });
    if (!best) throw new Error('Could not find the flat sheet face.');
    var flanges = [], anchors = isInsertBends(base) ? [base.fixedFace.slice()] : [], flangeIds = [];   // lane DQ: the fixed face first
    model.features.forEach(function (f) {
      // lane DB: a Fold carries the cuts it wrapped round bends as cutouts of those bends' records (exact in the flat)
      // (lane DJ: an Unfold made while another was open folds that one back first: its records carry those cuts too)
      if ((f.type === 'fold' || f.type === 'unfold') && !build.errors[f.id]) { foldCutouts(flanges, flangeIds, build.flanges[f.id]); return; }
      if (f.type === 'closedCorner' && !build.errors[f.id]) { ccExtendRecords(flanges, flangeIds, build.flanges[f.id]); return; }   // lane DK
      if ((f.type === 'insertBends' || f.type === 'convertSM') && !build.errors[f.id]) { (build.flanges[f.id] || []).forEach(function (fi, j) { flanges.push(fi); flangeIds[flanges.length - 1] = { feature: f.id, index: j }; }); return; }   // lane DQ
      if ((f.type !== 'flange' && f.type !== 'jog' && f.type !== 'sketchedBend') || build.errors[f.id]) return;
      if (f.type === 'sketchedBend' || isSketchJog(f)) {
        var sbr = sketchedBendRecords(flanges, anchors, build.flanges[f.id] || []), n0 = flanges.length; flanges = sbr.flanges; anchors = sbr.anchors;
        sbr.added.forEach(function (j, q) { flangeIds[n0 + q] = { feature: f.id, index: j }; });   // lane drawing: bend ids
        return;
      }
      (build.flanges[f.id] || []).forEach(function (fi, j) { flanges.push(fi); flangeIds[flanges.length - 1] = { feature: f.id, index: j }; });
    });
    // a Sketched Bend's fixed side stays where it was: the unfold starts from the largest face parallel to the base
    // sketch on the sheet at the earliest anchor that still lies on such a face (else the largest such face, as before)
    anchors.some(function (pt) {
      var ab = null;
      mesh.faces.forEach(function (face, i) {
        var d = dot(face.normal, plane.n);
        var off = Math.abs(dot(face.normal, pt) - face.w);   // either face of the sheet there
        if (Math.abs(d) < 0.999 || (off > 1e-4 && Math.abs(off - T) > 1e-4)) return;
        // rfCJ: the same side rule as above (was the old 1e-6 tie-break, so a pocket or countersink on the sketch side
        // flipped a Sketched Bend part to the far face and every UP note read DOWN)
        var score = face.area * (d > 0 ? 1.1 : 1);
        if (!ab || score > ab.score) ab = { face: face, i: i, score: score, anchor: pt };
      });
      if (ab) best = ab;
      return !!ab;
    });
    var regions = [], bends = [], usedFaces = {}, usedFlanges = {}, notches = [];
    // length of the overlap of segment A–B with segment a–b when the two are collinear (both A and B within 1e-3 of
    // the line a–b), else 0
    function overlapOnSegment(A, B, a, b) {
      var d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]);
      if (L < 1e-9) return 0;
      var u = [d[0] / L, d[1] / L];
      var tA = (A[0] - a[0]) * u[0] + (A[1] - a[1]) * u[1], tB = (B[0] - a[0]) * u[0] + (B[1] - a[1]) * u[1];
      if (Math.hypot(A[0] - a[0] - u[0] * tA, A[1] - a[1] - u[1] * tA) > 1e-3) return 0;
      if (Math.hypot(B[0] - a[0] - u[0] * tB, B[1] - a[1] - u[1] * tB) > 1e-3) return 0;
      var lo = Math.max(0, Math.min(tA, tB)), hi = Math.min(L, Math.max(tA, tB));
      return hi > lo ? hi - lo : 0;
    }
    // the rigid map each unfolded face went into the flat with; two maps agree when they take three points spanning the
    // face's plane (P, P + s·d, P + s·t) to the same places
    var faceMaps = {}, faceRecs = [];
    // lane DP: every bend strip with the maps of the faces on its two sides, for etch marks that cross a bend (flatEtch)
    var etchStrips = [];
    function sameMap(m1, m2, P, d, t, s) {
      var tol = 1e-6 * (1 + s);
      return [P, add(P, scale(d, s)), add(P, scale(t, s))].every(function (Q) { var a = m1(Q), b = m2(Q); return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol; });
    }
    // (BW) A mesh face is every coplanar polygon of the body (meshFromBody and planeFaces group by plane, not by
    // connection), so one face can hold several separate pieces: the returns of two hems folded the same way on
    // opposite edges, the two lips of a pan, the halves of a wall slotted through. The unfold works on one connected
    // piece at a time (faceComponents: an outer loop with the holes inside it), and a flange takes only the pieces
    // its wall starts on; the rest of the face stays for the flange it belongs to. Before this the first hem laid the
    // second hem's return down with its own map: an island of scrap in the DXF and a blank twice as tall.
    var compCache = {};
    function faceComponents(faceIdx) {
      if (compCache[faceIdx]) return compCache[faceIdx];
      var o = faceOutline(mesh, faceIdx), comps = [];
      if (o) {
        var outers = [], holes = [];
        o.loops.forEach(function (l) { (signedArea(l) > 0 ? outers : holes).push(l); });
        outers.forEach(function (l) { comps.push({ loops: [l], area: signedArea(l), plane: o.plane }); });
        holes.forEach(function (h) {
          var p = loopInteriorPoint(h) || h[0], best = null;
          comps.forEach(function (c) { if (pointInPoly(p, c.loops[0]) && (!best || c.area < best.area)) best = c; });
          if (best) best.loops.push(h); else if (comps.length) comps[0].loops.push(h);
        });
        comps.sort(function (a, b) { return b.area - a.area; });
      }
      return (compCache[faceIdx] = comps);
    }
    // (BW) bendSurfaceNotches(fi, Rt, BA, eps) -> the holes of an edge flange's bend as loops of [s, τ] (s across the
    // flat strip from the edge line, τ along the edge from end a), for cuts made after the bend. The bend's tracked
    // surface (radius Rt about the axis through origin + u·R, θ from 0 at the sheet to the flange angle A) is made of
    // planar facets, each between two exact angles of flangeProfile's polygon; a cut keeps a facet's plane and takes
    // part of it. Every facet piece is unrolled on the neutral axis (s = BA·θ/A, as the cutouts of a cut made before
    // the bend are) and what the strip band [0, BA] × [0, len] has that the pieces do not is a notch; a hole inside
    // one piece is a notch of its own. A notch reaching the band's edges is pushed eps past them so it meets the hole
    // in the base or the wall without a hair of a web (the strip overlaps both by eps). Nothing comes back when the
    // mesh has no facet on that surface (a curved OpenCascade face), so the strip stays what it was.
    function bendSurfaceNotches(fi, Rt, BA, eps) {
      var A = fi.angle, ax = norm(cross(fi.o, fi.u)), C = add(fi.origin, scale(fi.u, fi.R));
      var dir = sub(fi.b, fi.a), len = Math.hypot(dir[0], dir[1], dir[2]);
      if (!(len > 1e-9) || !(A > 1e-6) || !(BA > 1e-9) || !(Rt > 0)) return [];
      dir = scale(dir, 1 / len);
      var atol = 1e-3, band = [[0, 0], [BA, 0], [BA, len], [0, len]];
      function polar(Q) { var d = sub(Q, C), po = dot(d, fi.o), pu = dot(d, fi.u); return { r: Math.hypot(po, pu), th: Math.atan2(po, -pu), tau: dot(sub(Q, fi.a), dir) }; }
      // (CW) both surfaces of the bend are read, the tracked one (Rt) and the other: a cut from the top face that bites
      // into an up-bend below the top takes only the bend's outside surface, so reading the tracked (inside) surface
      // alone left the strip whole. Each surface's pieces are unrolled by angle (s = BA·θ/A, the same station on both),
      // so the notch is the union of what either surface lacks, kept where the part has air at mid-thickness.
      function surfaceGaps(Rs) {
      var rtol = 1e-4 * (1 + Rs), rmin = 0.97 * Rs - rtol, rmax = Rs + rtol;
      var pieces = [];
      mesh.faces.forEach(function (fc) {
        if (!fc.polys) return;
        // (CW) a facet of the surface: every corner within the radius band and the bend's angles, and the plane facing
        // the axis (normal within 25° of radial at its centre). Anvil's facets hold the axis direction exactly;
        // OpenCascade's triangles of a cut bend surface are tilted (an unstructured triangulation round the hole), and
        // the old plane-holds-the-axis test dropped them, so the uncut surface read as a gap across the strip and the
        // flat fell apart at the bend
        var sel = fc.polys.filter(function (p) {
          var lo = Infinity, hi = -Infinity, cen = [0, 0, 0];
          var on = p.vertices.every(function (v) {
            var P = [v.pos.x, v.pos.y, v.pos.z], q = polar(P);
            cen = add(cen, P);
            lo = Math.min(lo, q.th); hi = Math.max(hi, q.th);
            return q.r >= rmin && q.r <= rmax && q.th >= -atol && q.th <= A + atol;
          });
          if (!on || !(hi - lo > 1e-4)) return false;   // (a sliver of the sheet along the edge line is no facet)
          var d = sub(scale(cen, 1 / p.vertices.length), C), rad = sub(d, scale(ax, dot(d, ax))), rl = Math.hypot(rad[0], rad[1], rad[2]);
          return rl > 0 && Math.abs(dot(fc.normal, rad)) > 0.9 * rl;
        });
        if (sel.length) pieces.push({ polys: sel, normal: fc.normal, w: fc.w });
      });
      if (!pieces.length) return [];
      // (CW) every polygon is unrolled on its own and the band less their union is the gap (was: each face's outline,
      // and faceOutline lost a whole piece of a facet next to a zero-area polygon a Normal Cut leaves at the hole's
      // rim: the last facet of a 16 ga bend read as cut from end to end, the mid-thickness test then threw the gap
      // away and the strip kept its metal across the hole)
      var covered = [];
      pieces.forEach(function (pc) {
        pc.polys.forEach(function (p) {
          var m = p.vertices.map(function (v) { var q = polar([v.pos.x, v.pos.y, v.pos.z]); return [BA * q.th / A, q.tau]; });
          if (Math.abs(signedArea(m)) > 1e-12) covered.push(signedArea(m) < 0 ? m.reverse() : m);
        });
      });
      if (!covered.length) return [];
      return mergeFlatRegions([[band]], covered, FLAT_WELD) || [];
      }
      var Ro = Math.abs(Rt - fi.R) < 1e-9 * (1 + Rt) ? fi.R + fi.T : fi.R;
      var gapsT = surfaceGaps(Rt), gapsO = Ro > 0 ? surfaceGaps(Ro) : [], cutouts = fi.cutouts || [], tC = dot(sub(C, fi.a), dir);
      if (!gapsT.length && !gapsO.length) return [];
      // a gap is a hole only where the part has air at mid-thickness: not the stretch of a bend another flange's bend
      // runs into at a corner (metal there, the surface merely covered), and not a hole cut before the bend, whose
      // cutout above is exact already. A gap at either end of the bend is a corner, not a hole, while a flange meets
      // this one there: its relief slot (cut through the base's thickness past its own end, where this bend starts)
      // takes a bite out of this bend's start that the reliefs above draw already, and whose eps bridge below would
      // nick the base corner; so the strip keeps its full length. (rfCJ) With nothing meeting that end, a gap there is
      // a cut made after the bend through the bend's end (a corner notch), judged by the mid-thickness test like any
      // other: before, the strip kept a tab of bend where the part has no metal. A flange meets this end when it has
      // a relief here, or another record ends within 3 (R + T) of it (a Virtual Sharp corner trims (R + T)·tan(A/2)
      // back from the corner) and that record's own bend still has metal at that end (a corner notch cut through both
      // bends leaves nobody owning the corner; a relief's bite leaves the neighbour's bend whole).
      function bendMetal(g, near) {
        var dg = sub(g.b, g.a), lg = Math.hypot(dg[0], dg[1], dg[2]);
        if (!(lg > 1e-9)) return true;
        dg = scale(dg, 1 / lg);
        var Cg = add(g.origin, scale(g.u, g.R)), rg = g.R + g.T / 2, hg = Math.min(g.T / 2, lg / 4), tg = near === 0 ? hg : lg - hg;
        var P = add(add(Cg, scale(g.o, rg * Math.sin(g.angle / 2))), scale(g.u, -rg * Math.cos(g.angle / 2)));
        return inBody(add(P, scale(dg, tg - dot(sub(Cg, g.a), dg))));
      }
      function cornerAt(kk) {
        if ((fi.reliefs && fi.reliefs[kk]) || (fi.ccEnds && fi.ccEnds[kk])) return true;   // (lane DV: a Closed Corner's cut end)
        var E = kk === 0 ? fi.a : fi.b, reach = 3 * (fi.R + fi.T) + 1e-3;
        return flanges.some(function (g) {
          if (g === fi || !g.a || !g.b || !g.origin) return false;
          return [g.a, g.b].some(function (P, near) { var d = sub(P, E); return Math.hypot(d[0], d[1], d[2]) < reach && bendMetal(g, near); });
        });
      }
      var corner = [cornerAt(0), cornerAt(1)];
      function keep(l) {
        var q = loopInteriorPoint(l);
        if (!q || cutouts.some(function (cl) { return pointInPoly(q, cl); })) return false;
        if (l.some(function (p) { return (p[1] < 1e-6 && corner[0]) || (p[1] > len - 1e-6 && corner[1]); })) return false;
        var th = A * q[0] / BA, rm = fi.R + fi.T / 2;
        return !inBody(add(add(add(C, scale(fi.o, rm * Math.sin(th))), scale(fi.u, -rm * Math.cos(th))), scale(dir, q[1] - tC)));
      }
      // (CW2) the tracked surface's gaps first; the other surface adds only gaps the tracked one has nothing of (a cut
      // that crosses that surface alone: a bite into an up-bend below the top). Where both are cut (a Normal Cut) the
      // tracked footprint is the hole: on Anvil's faceted bend the far surface's hole steps at every facet (each
      // facet's prism goes along its own normal), and the union drew those steps into the flat (~90 points, a
      // stair along both sides of the strip)
      var keptT = gapsT.filter(keep);
      var loops = keptT.concat(gapsO.filter(function (l) {
        if (!keep(l)) return false;
        var q = loopInteriorPoint(l);
        return !keptT.some(function (t) { return (q && pointInPoly(q, t)) || l.filter(function (p) { return pointInPoly(p, t); }).length * 2 > l.length; });
      })), out = loops.slice();
      // a notch along the band's edge s = at is bridged `push` past it (to −eps / BA + eps) so it meets the hole in the
      // base or the wall; the bridge's far corners continue the hole's own rims, so the rim points stay exact
      function bridge(l, at, push) {
        var n = l.length, on = l.map(function (p) { return Math.abs(p[0] - at) < 1e-6; });
        if (!on.some(Boolean) || on.every(Boolean)) return;
        function ext(p, q) { var ds = at - q[0]; return p[1] + (Math.abs(ds) > 1e-7 ? (p[1] - q[1]) * (push / ds) : 0); }
        for (var i = 0; i < n; i++) {
          if (!on[i] || on[(i + n - 1) % n]) continue;   // the start of a run of vertices on the edge
          var j = i;
          while (on[(j + 1) % n] && (j + 1) % n !== i) j = (j + 1) % n;
          var pi = l[i], pj = l[j];
          if (i === j || Math.abs(pi[1] - pj[1]) < 1e-9) continue;
          out.push([[at, pi[1]], [at, pj[1]], [at + push, ext(pj, l[(j + 1) % n])], [at + push, ext(pi, l[(i + n - 1) % n])]]);
        }
      }
      loops.forEach(function (l) { bridge(l, 0, -eps); bridge(l, BA, eps); });
      return out;
    }
    // (BW) a point-in-solid test of the part as built, made once per flat pattern (bendSurfaceNotches)
    var bodyTester = null;
    function inBody(P) {
      if (!bodyTester) bodyTester = build.body && build.body.pointTester ? build.body.pointTester() : function () { return false; };
      return bodyTester(P);
    }
    // the component of a face that holds the 3D point P (on the face's plane), else -1
    function componentAt(faceIdx, P) {
      var comps = faceComponents(faceIdx);
      for (var i = 0; i < comps.length; i++) { var q = to2D(comps[i].plane, P); if (pointInPoly(q, comps[i].loops[0])) return i; }
      return -1;
    }
    function traceFaceOf(key) { for (var i = trace.faces.length - 1; i >= 0; i--) if (trace.faces[i].key === key) return i; return -1; }
    function unfold(faceIdx, ci, map, nTracked, depth, parent) {
      var key = faceIdx + '/' + ci;
      if (usedFaces[key] || depth > 16) return;
      usedFaces[key] = true;
      faceMaps[key] = map;
      var face = mesh.faces[faceIdx], comp = faceComponents(faceIdx)[ci];
      if (!comp) return;
      var o = comp;
      var loops2 = comp.loops.map(function (l) { return l.map(function (p) { return map(to3D(o.plane, p[0], p[1])); }); });
      regions.push(loops2);
      // (BW) a hole is a hole of the blank only where it goes through: the face on the other side of the sheet fills
      // what it still has there, so a countersink, counterbore or pocket cut from this side leaves the laser the
      // through hole (the far side's), not the cone, and a blind pocket leaves nothing, whichever side the flat is
      // drawn from. The outline is untouched: only this piece's holes are filled. (Before, the countersunk side's
      // cone circle reached the DXF whenever that face happened to be the one the flat was drawn from.)
      if (comp.loops.length > 1) {
        var opp = -1, ow = T - face.w;
        mesh.faces.forEach(function (fc, i) { if (opp < 0 && dot(fc.normal, face.normal) < -0.999 && Math.abs(fc.w - ow) < 1e-3) opp = i; });
        if (opp >= 0) comp.loops.slice(1).forEach(function (h) {
          var q = loopInteriorPoint(h);
          if (!q) return;
          var oc = componentAt(opp, sub(to3D(o.plane, q[0], q[1]), scale(face.normal, T)));
          if (oc < 0) return;
          // the far side's holes under this one: a smaller one is the through hole (fill the rest), one as large or
          // larger (a plain through hole, a countersink from the far side) leaves this hole as it is
          var oc2 = faceComponents(opp)[oc], fill = [h], ha = Math.abs(signedArea(h)), through = false;
          oc2.loops.slice(1).forEach(function (hh) {
            var hh2 = hh.map(function (p) { return to2D(o.plane, to3D(oc2.plane, p[0], p[1])); }), qq = loopInteriorPoint(hh2);
            if (!pointInPoly(q, hh2) && !(qq && pointInPoly(qq, h))) return;
            if (Math.abs(signedArea(hh2)) >= ha * (1 - 1e-6)) through = true; else fill.push(hh2);
          });
          if (!through) regions.push(fill.map(function (l) { return l.map(function (p) { return map(to3D(o.plane, p[0], p[1])); }); }));
        });
      }
      faceRecs.push({ map: map, normal: face.normal, w: face.w, loops: loops2 });
      if (trace) trace.faces.push({ key: key, map: map, n: face.normal.slice(), w: face.w, outer: loops2[0], parent: parent == null ? -1 : parent });
      flanges.forEach(function (fi, k) {
        if (usedFlanges[k] || Math.abs(dot(fi.u, face.normal)) < 0.999) return;
        var dm = dot(fi.mid, face.normal) - face.w;
        if (Math.abs(dm) > 1e-3 && Math.abs(Math.abs(dm) - T) > 1e-3) return;
        var A2 = map(fi.a), B2 = map(fi.b);
        // attached when the flange's edge line A2–B2 runs along an outline segment and overlaps it by more than half
        // a thickness: with Material Outside/Inside a neighbouring flange trims the base back at a shared corner, so
        // the ends of the edge need not lie on the outline themselves
        var attached = loops2.some(function (l) {
          return l.some(function (p, i) { return overlapOnSegment(A2, B2, p, l[(i + 1) % l.length]) > Math.max(1e-3, 0.5 * T); });
        });
        if (!attached) return;
        usedFlanges[k] = true;
        var M2 = map(fi.mid), O2 = map(add(fi.mid, fi.o));
        var o2 = [O2[0] - M2[0], O2[1] - M2[1]], ol = Math.hypot(o2[0], o2[1]);
        if (ol < 1e-9) return;
        o2 = [o2[0] / ol, o2[1] / ol];
        var bc = bendCalc(sheet, fi.angle, fi.R, T, fi.ba), BA = bc.BA, eps = 0;
        warn(bc.warning);
        if (bc.K != null) kUsed[bc.K] = true;
        if ((bc.type === 'allowance' || bc.type === 'deduction') && Math.abs(fi.angle - Math.PI / 2) > 1e-6)
          warn((bc.source === 'custom' ? 'A custom bend ' : 'The bend ') + (bc.type === 'allowance' ? 'allowance ' : 'deduction ') + fmtN(bc.value) + ' is applied unchanged to the ' + fmtN(fi.angle * 180 / Math.PI) + '° bend (as SolidWorks does); use a bend table for values that depend on the angle.');
        function off(p, d) { return [p[0] + o2[0] * d, p[1] + o2[1] * d]; }
        var trackedInner = dot(fi.u, nTracked) > 0;
        // the wall face on the tracked side of the sheet: inner radius when the fold comes toward this side
        var Rt = trackedInner ? fi.R : fi.R + T, sA = Math.sin(fi.angle), cA = Math.cos(fi.angle);
        // Ends of the bend strip. An unmitred end is square at the edge end (t0 = ext = 0). A mitred end was swept past
        // the end point P and clipped by the plane { n, w } (kept where n·p >= w): a wall point at o-distance d from the
        // edge line reaches t(d) = (n·P − w + d·(o·n)) / (dIn·n) past P, so the wall's start line (d = Rt·sin A) ends at
        // `ext`, the base corner (d = 0) sits at `t0` (0 without a gap or a placement shift) and the wall's end line
        // slants by `slope` per unit of wall length when the fold is not 90°. The strip is drawn as a trapezoid whose
        // end edge runs straight from the base corner to that wall corner, so the blank has no step at the mitre.
        var ends = [fi.a, fi.b].map(function (P, kk) {
          var Q = kk === 0 ? A2 : B2, other = kk === 0 ? B2 : A2;
          var dl = Math.hypot(Q[0] - other[0], Q[1] - other[1]);
          var r = { P: Q, dOut: dl > 1e-9 ? [(Q[0] - other[0]) / dl, (Q[1] - other[1]) / dl] : [0, 0], t0: 0, ext: 0, slope: 0, mitred: false };
          // lane DV: an end a Closed Corner cut (fi.ccEnds): straight from t0 at the bend's start to ext at its end
          var ce = fi.ccEnds && fi.ccEnds[kk];
          if (ce && dl > 1e-9) { r.t0 = ce.t0; r.ext = ce.ext; r.tapered = true; if (ce.square) r.mitred = true; return r; }
          // lane rfIS: SolidWorks' edge-flange mitre: the wall's line run on straight across the bend zone (the strip's
          // end side from d = 0 to BA), so the two strips meet past the corner where their lines cross
          var ml = fi.miterLines && fi.miterLines[kk];
          if (ml && dl > 1e-9) {
            // below 90° the line comes back to the edge line short of the base's corner (the walls lean out): the strip's
            // end then runs from the base's corner to the wall's line, as the folded bend's taper (not measured in SolidWorks)
            // (lane flatopts: Corner treatment cleared leaves that raw: the line runs on to the edge line)
            r.ext = ml.ext; r.slope = ml.slope; r.t0 = Math.max(ml.ext - ml.slope * BA, ml.tB != null && fopt.cornerTreatment ? ml.tB : -Infinity); r.mitred = true; return r;
          }
          var mp = fi.miterPlanes && fi.miterPlanes[kk];
          if (!mp || dl <= 1e-9) return r;
          var dIn = norm(sub(kk === 0 ? fi.b : fi.a, P)), dn = dot(dIn, mp.n);
          if (!(dn > 1e-9)) return r;
          var kappa = dot(fi.o, mp.n) / dn;
          r.t0 = (dot(mp.n, P) - mp.w) / dn;
          r.ext = r.t0 + kappa * Rt * sA;
          r.slope = kappa * cA;
          r.mitred = true;
          // lane flatopts: Simplify bends cleared: the end is the developed curve t0 + κ·Rt·sin(A·s / BA), not the chord
          if (!fopt.simplifyBends && Math.abs(kappa * Rt) > 1e-12) r.curve = { k: kappa * Rt, A: fi.angle };
          return r;
        });
        // point at o-distance d from the edge and t past end r along the edge line
        function corner(r, d, t) { return [r.P[0] + o2[0] * d + r.dOut[0] * t, r.P[1] + o2[1] * d + r.dOut[1] * t]; }
        var eA = ends[0], eB = ends[1];
        // strip: base side at −eps (inside the sheet), far side at BA + eps (inside the wall). A mitred end passes through
        // the wall corner (BA, ext) itself and then follows the wall's end line for the eps overlap, so the strip never
        // pokes out past the wall's unfolded outline. With no wall after the bend (a rolled hem) the far side is BA itself.
        var far = fi.L > 1e-9 ? eps : 0;
        var back = fi.curlBack || eps;
        // (lane flatopts) the points of a curved end (Simplify bends cleared) strictly between s = 0 and s = BA
        function curvePts(r) {
          var n = Math.max(4, Math.ceil(r.curve.A / (Math.PI / 32))), out = [];
          for (var q = 1; q < n; q++) out.push(corner(r, BA * q / n, r.t0 + r.curve.k * Math.sin(r.curve.A * q / n)));
          return out;
        }
        var strip = [corner(eA, -back, eA.t0 - (eA.ext - eA.t0) * eps / BA), corner(eB, -back, eB.t0 - (eB.ext - eB.t0) * eps / BA)];
        if (eB.curve) curvePts(eB).forEach(function (p) { strip.push(p); });
        if (eB.mitred || eB.tapered) strip.push(corner(eB, BA, eB.ext), corner(eB, BA + eps, eB.ext + eB.slope * eps));
        else strip.push(off(B2, BA + far));
        if (eA.mitred || eA.tapered) strip.push(corner(eA, BA + eps, eA.ext + eA.slope * eps), corner(eA, BA, eA.ext));
        else strip.push(off(A2, BA + far));
        if (eA.curve) curvePts(eA).reverse().forEach(function (p) { strip.push(p); });
        regions.push([strip]);
        // lane flatopts: Merge faces cleared keeps the bend region as a face: its polygon and its two tangent lines
        if (!fopt.mergeFaces) {
          bendRegions.push(strip.slice());
          regionLines.push({ a: corner(eA, 0, eA.t0), b: corner(eB, 0, eB.t0), k: bends.length }, { a: corner(eA, BA, eA.mitred || eA.tapered ? eA.ext : 0), b: corner(eB, BA, eB.mitred || eB.tapered ? eB.ext : 0), k: bends.length });
        }
        // lane flatopts: Show slit: the base-side corners of the strip's ends, matched in pairs after the unfold
        if (fopt.showSlit) [eA, eB].forEach(function (r) { if (!r.mitred && !r.tapered) slitEnds.push({ P: corner(r, 0, r.t0), o2: o2, dOut: r.dOut, R: fi.R, BA: BA, k: k }); });
        var stripIdx = -1;
        if (trace) {
          stripIdx = trace.strips.length;
          trace.strips.push({ fi: fi, id: flangeIds[k] || null, BA: BA, A2: A2, B2: B2, o2: o2, strip: strip.slice(), parent: traceFaceOf(key),
            trackedInner: trackedInner, mitred: eA.mitred || eB.mitred });
        }
        // bend reliefs at the ends: a notch w wide past the end, from d0 inside the edge line out to d1 past the flat
        // bend zone (BA, or the slot's R + T reach in the solid when that is longer), so the blank's relief clears the
        // whole bend allowance; an obround relief has its inner end rounded, as in the solid
        var relPolys = [];
        (fi.reliefs || []).forEach(function (rl, kk) {
          if (!rl) return;
          var r = ends[kk], lo = -rl.d0, hi = Math.max(BA, fi.R + T) + rl.d1, w = rl.w, nt = [corner(r, hi, 0), corner(r, hi, w)];
          if (rl.obround) {
            var rr = w / 2;
            for (var q = 0; q <= 12; q++) { var ph = Math.PI / 2 + Math.PI * q / 12; nt.push(corner(r, lo + rr + rr * Math.cos(ph), rr + rr * Math.sin(ph))); }
          } else nt.push(corner(r, lo, w), corner(r, lo, 0));
          notches.push(signedArea(nt) < 0 ? nt.reverse() : nt);
          relPolys.push(nt);   // lane dxfout: kept on the bend (bend.reliefs) so the DXF can put them on RELIEF
        });
        // holes / slots cut before the bend that cross it (fi.cutouts, [d, τ] from end a): cut from the blank in place
        (fi.cutouts || []).forEach(function (cl) {
          var nt = cl.map(function (p) { return corner(eA, p[0], -p[1]); });
          notches.push(signedArea(nt) < 0 ? nt.reverse() : nt);
        });
        // lane DJ: material added across the flat strip while unfolded (a Boss-Extrude / Tab past the bend's end), folded
        // round the bend by Fold (fi.adds, [d, τ] from end a): it joins the blank, and the bend line runs on across it
        var addT = [0, Math.hypot(B2[0] - A2[0], B2[1] - A2[1])];
        (fi.adds || []).forEach(function (cl) {
          var nt = cl.map(function (p) { return corner(eA, p[0], -p[1]); });
          regions.push([signedArea(nt) < 0 ? nt.reverse() : nt]);
          var sl = Infinity, sh = -Infinity;
          cl.forEach(function (p) { sl = Math.min(sl, p[0]); sh = Math.max(sh, p[0]); });
          if (sl < BA / 2 && sh > BA / 2) cl.forEach(function (p) { addT[0] = Math.min(addT[0], p[1]); addT[1] = Math.max(addT[1], p[1]); });
        });
        // (lane DJ: fi.fills, metal a blind cut or a boss running onto the bend left at mid-thickness: regions kept)
        (fi.fills || []).forEach(function (rg) { regions.push(rg.map(function (cl) { return cl.map(function (p) { return corner(eA, p[0], -p[1]); }); })); });
        // (BW) a hole cut AFTER the bend (a Normal Cut from a sheet face, a cut through a wall and its bend) left the
        // strip above a full rectangle: the flat kept metal the part does not have. What the bend's own surface lacks
        // is cut from the blank too (bendSurfaceNotches).
        if (fi.kind === 'edge' && !eA.mitred && !eB.mitred && fi.L > 1e-9) bendSurfaceNotches(fi, Rt, BA, eps).forEach(function (nt) {
          var m = nt.map(function (p) { return corner(eA, p[0], -p[1]); });
          notches.push(signedArea(m) < 0 ? m.reverse() : m);
        });
        // bend line: mid-strip, reaching the mitre line at a mitred end
        function midT(r) { return r.curve ? r.t0 + r.curve.k * Math.sin(r.curve.A / 2) : (r.t0 + r.ext) / 2; }   // (lane flatopts)
        var bend = { a: addT[0] < 0 && !eA.mitred ? corner(eA, BA / 2, -addT[0]) : corner(eA, BA / 2, midT(eA)),
          b: addT[1] > Math.hypot(B2[0] - A2[0], B2[1] - A2[1]) && !eB.mitred ? corner(eA, BA / 2, -addT[1]) : corner(eB, BA / 2, midT(eB)), up: trackedInner, angle: fi.angle * 180 / Math.PI, R: fi.R, ba: BA, bd: bc.BD, method: bc.type, source: bc.source };
        bend.label = bendNoteText(bend, model.units);
        // (lane drawing) the bend's stable id: '<feature id>:<n>', n the record's place in build.flanges[feature], so a
        // drawing's dragged / hidden bend note stays with its bend when flanges are added, removed or reordered
        if (flangeIds[k]) bend.id = flangeIds[k].feature + ':' + flangeIds[k].index;
        // lane dxfout: the bend's relief notches as [along a→b, left of it] from bend.a, so they follow any rigid move
        // of the flat (flatOrient) with the bend line; exportDXFFlat's reliefLayer reads them back
        if (relPolys.length) bend.reliefs = relPolys.map(function (nt) { return bendLocal(bend, nt); });
        bends.push(bend);
        if (trace && stripIdx >= 0) trace.strips[stripIdx].bend = bend;   // lane DB2
        var Pmid = add(add(fi.origin, scale(fi.o, Rt * sA)), scale(fi.u, fi.R - Rt * cA));
        var wn = trackedInner ? add(scale(fi.o, -sA), scale(fi.u, cA)) : add(scale(fi.o, sA), scale(fi.u, -cA));
        var tw = add(scale(fi.o, cA), scale(fi.u, sA));
        var dir3 = norm(cross(tw, wn)), dir2 = [o2[1], -o2[0]];
        var wallMap = function (Q) {
          var d = sub(Q, Pmid), s = dot(d, dir3), w = dot(d, tw);
          return [M2[0] + dir2[0] * s + o2[0] * (BA + w), M2[1] + dir2[1] * s + o2[1] * (BA + w)];
        };
        etchStrips.push({ fi: fi, BA: BA, Rt: Rt, Ro: trackedInner ? fi.R + T : fi.R, startMap: map, wallMap: wallMap, A2: A2, B2: B2, o2: o2 });   // lane DP
        var wIdx = -1;
        // (a rolled hem is all bend: no wall after it)
        if (fi.L > 1e-9) mesh.faces.forEach(function (fc, i) { if (wIdx < 0 && dot(fc.normal, wn) > 0.999 && Math.abs(dot(fc.normal, Pmid) - fc.w) < 1e-3) wIdx = i; });
        if (wIdx < 0) {
          if (fi.L > 1e-9) regions.push([[corner(eA, BA - eps, eA.ext - eA.slope * eps), corner(eB, BA - eps, eB.ext - eB.slope * eps),
            corner(eB, BA + fi.L, eB.ext + eB.slope * fi.L), corner(eA, BA + fi.L, eA.ext + eA.slope * fi.L)]]);
          if (trace && fi.L > 1e-9) trace.faces.push({ key: 'w' + k, map: wallMap, n: wn, w: dot(wn, Pmid), outer: regions[regions.length - 1][0], parent: stripIdx });
          return;
        }
        // the pieces of the wall's plane this flange made: those whose outline runs along the wall's start line (the
        // line where the bend ends, from end a to end b on the tracked side); a wall slotted through is two of them.
        // A plane of one piece whose outline misses the line (a corner of it only, numerically) is taken whole, as before.
        var comps = faceComponents(wIdx), Wa = add(Pmid, sub(fi.a, fi.mid)), Wb = add(Pmid, sub(fi.b, fi.mid)), mine = [];
        var hw = Math.min(T, fi.L) / 4, Wh = add(Wa, scale(tw, hw));   // a hair up the wall from end a
        comps.forEach(function (c, ci) {
          var wa = to2D(c.plane, Wa), wb = to2D(c.plane, Wb), wh = to2D(c.plane, Wh), l = c.loops[0];
          var ex = [wb[0] - wa[0], wb[1] - wa[1]], el = Math.hypot(ex[0], ex[1]), up = [wh[0] - wa[0], wh[1] - wa[1]];
          if (el < 1e-9) return;
          ex = [ex[0] / el, ex[1] / el];
          // a piece is this flange's when its outline runs along the start line and the piece lies up the wall from
          // that stretch (not a piece that merely touches the line end-on: the end face of a hem's tail beside it)
          var hit = l.some(function (p, i) {
            var q = l[(i + 1) % l.length];
            if (!(overlapOnSegment(wa, wb, p, q) > Math.max(1e-3, 0.5 * T))) return false;
            var tp = (p[0] - wa[0]) * ex[0] + (p[1] - wa[1]) * ex[1], tq = (q[0] - wa[0]) * ex[0] + (q[1] - wa[1]) * ex[1];
            var tm = (Math.max(0, Math.min(tp, tq)) + Math.min(el, Math.max(tp, tq))) / 2;
            return pointInPoly([wa[0] + ex[0] * tm + up[0], wa[1] + ex[1] * tm + up[1]], l);
          });
          if (hit) mine.push(ci);
        });
        if (!mine.length && comps.length === 1) mine.push(0);
        // lane CS: the strip runs eps past BA into the wall to weld to it; where the wall does not start on the start
        // line (a Closed Corner overlap trimmed the wall's end above its bend) that eps would stick out of the blank as a
        // 0.001 step, so it is notched off there: the stretches of the start line no wall piece's outline runs along
        if (fi.kind === 'edge' && !eA.mitred && !eB.mitred && fi.L > 1e-9 && mine.length) {
          var cov = [], elw = 0;
          mine.forEach(function (ci) {
            var c = comps[ci], wa = to2D(c.plane, Wa), wb = to2D(c.plane, Wb), ex = [wb[0] - wa[0], wb[1] - wa[1]];
            elw = Math.hypot(ex[0], ex[1]);
            if (elw < 1e-9) return;
            ex = [ex[0] / elw, ex[1] / elw];
            c.loops.forEach(function (l) {
              l.forEach(function (p, i) {
                var q = l[(i + 1) % l.length];
                function off2(r) { return Math.abs((r[0] - wa[0]) * ex[1] - (r[1] - wa[1]) * ex[0]); }
                if (off2(p) > 1e-4 || off2(q) > 1e-4) return;
                var tp = (p[0] - wa[0]) * ex[0] + (p[1] - wa[1]) * ex[1], tq = (q[0] - wa[0]) * ex[0] + (q[1] - wa[1]) * ex[1];
                var lo = Math.max(0, Math.min(tp, tq)), hi = Math.min(elw, Math.max(tp, tq));
                if (hi - lo > 1e-9) cov.push([lo, hi]);
              });
            });
          });
          if (elw > 1e-9 && cov.length) {
            cov.sort(function (x, y) { return x[0] - y[0]; });
            var at = 0, gaps = [];
            cov.forEach(function (s) { if (s[0] > at + 1e-4) gaps.push([at, s[0]]); at = Math.max(at, s[1]); });
            if (at < elw - 1e-4) gaps.push([at, elw]);
            gaps.forEach(function (g) {
              var nt = [corner(eA, BA, -g[0]), corner(eA, BA, -g[1]), corner(eA, BA + 2 * eps, -g[1]), corner(eA, BA + 2 * eps, -g[0])];
              notches.push(signedArea(nt) < 0 ? nt.reverse() : nt);
            });
          }
        }
        var laid = false, same = false;
        mine.forEach(function (ci) {
          var key = wIdx + '/' + ci;
          if (!usedFaces[key]) { unfold(wIdx, ci, wallMap, wn, depth + 1, stripIdx); laid = true; }
          // Coplanar walls are one mesh face (two flanges on one edge line either side of a tab: the Tray's back walls),
          // so the first flange's unfold already laid this wall down, holes and all. When that unfold put it where this
          // flange would, there is nothing more to add: the stand-in rectangle below would cover the wall's holes and,
          // starting at BA − eps with a mitre corner of its own, leave a stray vertex in the blank's outline.
          else if (faceMaps[key] && sameMap(faceMaps[key], wallMap, Pmid, dir3, tw, Math.max(fi.len || 0, fi.L, T))) same = true;
        });
        if (laid || same) return;
        if (fi.L > 1e-9) regions.push([[corner(eA, BA - eps, eA.ext - eA.slope * eps), corner(eB, BA - eps, eB.ext - eB.slope * eps),
          corner(eB, BA + fi.L, eB.ext + eB.slope * fi.L), corner(eA, BA + fi.L, eA.ext + eA.slope * fi.L)]]);
        if (trace && fi.L > 1e-9) trace.faces.push({ key: 'w' + k, map: wallMap, n: wn, w: dot(wn, Pmid), outer: regions[regions.length - 1][0], parent: stripIdx });
      });
    }
    var baseComp = best.anchor != null ? componentAt(best.i, best.anchor) : -1;
    var baseMap = function (Q) { return to2D(plane, Q); };
    unfold(best.i, baseComp >= 0 ? baseComp : 0, baseMap, best.face.normal, 0, -1);
    // rfCJ: a cut that splits the base face (a window across a channel bottom running into both bends) leaves pieces of
    // it no wall reaches back from; they lie rigidly in the base plane, so they go in with the base map, flanges and
    // all (was: only the anchor's piece was laid, and a flange on another piece was lost with it)
    faceComponents(best.i).forEach(function (c, ci) { if (!usedFaces[best.i + '/' + ci]) unfold(best.i, ci, baseMap, best.face.normal, 0, -1); });
    if (trace) { trace.plane = plane; trace.nB = best.face.normal.slice(); trace.wB = best.face.w; trace.T = T; }
    // lane DB2: the bends an open Unfold laid flat keep their bend lines and notes (SolidWorks)
    if (openUnfold) ufOpenBends(openUnfold, faceRecs, sheet, T, model.units, warn).forEach(function (b) { bends.push(b); });
    var formItems = [];
    formingFlat(model, build, faceRecs, T, warn, regions, notches, formItems);   // lane forming: Forming Tools laid back flat, marks, lance cuts
    if (fopt.showSlit) flatSlits(model, slitEnds, T).forEach(function (nt) { notches.push(nt); });   // lane flatopts
    // merge: in 2D (mergeFlatRegions); the CSG merge stays as the fallback for a boundary that does not close
    var loops = flatOptions.merge === 'csg' ? null : mergeFlatRegions(regions, notches, FLAT_WELD);
    if (!loops) loops = csgMerge(regions, notches);
    loops.sort(function (a, b) { return signedArea(b) - signedArea(a); });
    if (!loops.length || signedArea(loops[0]) <= 0) throw new Error('Could not build the flat pattern.');
    // last pass (laser hygiene): no duplicate, collinear or spike point survives, and no point moves (1e-9 × size)
    var lo0 = [Infinity, Infinity], hi0 = [-Infinity, -Infinity];
    loops[0].forEach(function (p) { for (var k = 0; k < 2; k++) { lo0[k] = Math.min(lo0[k], p[k]); hi0[k] = Math.max(hi0[k], p[k]); } });
    var hyg = 1e-9 * Math.hypot(hi0[0] - lo0[0], hi0[1] - lo0[1]);
    loops = loops.map(function (l) { return cleanFlatLoop(l, hyg); }).filter(Boolean);
    // r16/flatcircle: a round hole is a circle in the flat, whichever kernel's points it was joined from
    loops = loops.map(function (l) { var C = enclosingCircle(l); return C ? snapFlatCircle(l, flatCircleTol(model.units, C.r)) : l; });
    var min =[Infinity, Infinity], max = [-Infinity, -Infinity];
    loops.forEach(function (l) { l.forEach(function (p) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); }); });
    Object.keys(kUsed).forEach(function (k) {
      if (+k > 0.5 + 1e-9 || +k < 0) warn('K-factor ' + fmtN(+k) + ' is outside 0–0.5: the neutral axis would lie outside the sheet. If ' + fmtN(+k) + ' is a shop "material in bend" constant (BA = ' + fmtN(+k) + '·T + 1.571·R at 90°), the K-factor is ' + fmtN(+k) + ' / 1.5708 = ' + fmtN(Math.round(+k / (Math.PI / 2) * 1000) / 1000) + '.');
    });
    var outSheet = Object.assign({}, sheet, { kFactor: sheetKFactor(sheet) });
    var etch = flatEtch(model, build, faceRecs, T, warn, etchStrips);
    crossBreakFlat(model, build, faceRecs, T, warn, etch.items);   // lane cross-break: its marks ride with the etch items
    formItems.forEach(function (it) { etch.items.push(it); });   // lane forming
    var res = { loops: loops, bends: bends, plane: plane, sheet: outSheet, bbox: { min: min, max: max }, size: [max[0] - min[0], max[1] - min[1]], note: sheetNote(outSheet), warnings: warnings,
      etch: etch.items, etchLayer: etch.layer };
    if (!fopt.mergeFaces) {   // lane flatopts: the bend regions kept as faces (see FLAT_OPTION_DEFAULTS)
      res.bendRegions = bendRegions;
      res.regionLines = [];
      regionLines.forEach(function (rl) { clipToBlank(rl.a, rl.b, loops).forEach(function (s) { s.bend = rl.k; res.regionLines.push(s); }); });
    }
    // lane DK: Flat-Pattern1's Fixed face / Grain direction (model.flatFixed, model.flatGrain); not while an Unfold is
    // open (its frame wins) nor for the trace Unfold / Fold read (their maps are in the plain frame)
    if (!trace && !openUnfold && (model.flatFixed || model.flatGrain)) flatOrient(res, model, base, faceRecs, T, warn);
    return res;
  }
  // lane DK: SolidWorks' Flat-Pattern PropertyManager, Fixed face and Grain direction. flatOrient(flat, model, base,
  // faceRecs, T, warn) moves the flat in place (loops, bends, etch, bbox, size, plane) by one rigid 2D motion, never a
  // mirror, so UP / DOWN and the bend notes read as before:
  //  * model.flatFixed = [x, y, z] (a point on a flat face of the folded part, either side of the sheet): the flat is
  //    laid in that face's plane with the face where it is in the part (Flatten shows it there) and drawn looking at it
  //    from the side the flat is always seen from; its 2D frame is the Base Flange's sketch frame when the face is
  //    parallel to it, else the standard plane (Front / Top / Right) nearest the face, projected onto it.
  //  * model.flatGrain = { at: [x, y, z], dir: [dx, dy, dz] } (a straight edge or line on a flat face): the flat turns
  //    so that direction runs along +X (the smaller turn; the DXF, the drawing's flat view and the bend table follow).
  // A pick no flat face holds any more leaves the flat as it was, with a warning.
  var FLAT_STD_FRAMES = [{ x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] }, { x: [1, 0, 0], y: [0, 0, -1], n: [0, 1, 0] }, { x: [0, 0, -1], y: [0, 1, 0], n: [1, 0, 0] }];
  function flatFaceRecAt(faceRecs, P, T, dir) {
    var tol = 1e-4 + 1e-3 * T, hit = null;
    faceRecs.some(function (fr) {
      if (dir && Math.abs(dot(fr.normal, dir)) > 1e-6) return false;
      var off = dot(fr.normal, P) - fr.w;
      if (Math.abs(off) > tol && Math.abs(off + T) > tol) return false;
      var X = sub(P, scale(fr.normal, off)), q = fr.map(X), outer = fr.loops[0];
      var inside = pointInPoly(q, outer) && !fr.loops.slice(1).some(function (h) { return pointInPoly(q, h); });
      if (!inside && dir) {   // an edge lies on the outline: near it is enough
        inside = fr.loops.some(function (l) {
          return l.some(function (a, i) {
            var b = l[(i + 1) % l.length], d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
            var t = L2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / L2)) : 0;
            return Math.hypot(a[0] + d[0] * t - q[0], a[1] + d[1] * t - q[1]) < tol;
          });
        });
      }
      if (inside) hit = { rec: fr, X: X, q: q };
      return !!hit;
    });
    return hit;
  }
  function flatOrient(flat, model, base, faceRecs, T, warn) {
    var plane = flat.plane, ex = plane.x, ey = plane.y, nv = plane.n, O = plane.origin;
    var phi = 0, tx = 0, ty = 0;   // p' = R(phi)·p + t
    function mv(p) { var c = Math.cos(phi), s = Math.sin(phi); return [c * p[0] - s * p[1] + tx, s * p[0] + c * p[1] + ty]; }
    if (model.flatFixed) {
      var hit = flatFaceRecAt(faceRecs, model.flatFixed, T, null);
      if (!hit) warn('Flat-Pattern: the fixed face is not a flat face of the part any more; the flat is laid from the Base Flange\'s face.');
      else {
        var fr = hit.rec, nf = fr.normal, h0 = base && base.reverse ? -T : (base && base.end === 'mid' ? -T / 2 : 0);
        // two directions in the face, and where the face's map takes them
        var d = norm(Math.abs(nf[0]) < 0.9 ? cross(nf, [1, 0, 0]) : cross(nf, [0, 1, 0])), b = cross(nf, d);
        var P0 = hit.X, m0 = fr.map(P0), m1 = fr.map(add(P0, d)), m2 = fr.map(add(P0, b));
        var a1 = [m1[0] - m0[0], m1[1] - m0[1]], a2 = [m2[0] - m0[0], m2[1] - m0[1]];
        // the face's map is a rotation when (d, b) turn the same way in the flat as about nf: look along nf, else -nf
        nv = a1[0] * a2[1] - a1[1] * a2[0] > 0 ? nf.slice() : scale(nf, -1);
        var Ob = [0, 0, 0];
        if (dot(nv, plane.n) > 0.999) { ex = plane.x; ey = plane.y; Ob = plane.origin; }
        else {
          var fs = FLAT_STD_FRAMES.slice().sort(function (p, q) { return Math.abs(dot(q.n, nv)) - Math.abs(dot(p.n, nv)); })[0];
          var yy = dot(fs.n, nv) < 0 ? fs.y : fs.y, xx = dot(fs.n, nv) < 0 ? scale(fs.x, -1) : fs.x;
          ey = sub(yy, scale(nv, dot(yy, nv)));
          if (len(ey) < 1e-6) ey = cross(nv, sub(xx, scale(nv, dot(xx, nv))));
          ey = norm(ey); ex = cross(ey, nv);
        }
        // the material lies along nv at [mlo, mlo + T]; the plane sits h0 below it, as flatBody extrudes [h0, h0 + T]
        var mlo = dot(nv, nf) > 0 ? fr.w - T : -fr.w;
        O = add(Ob, scale(nv, mlo - h0 - dot(nv, Ob)));
        // old 2D -> the face (3D) -> the new frame: a rigid motion; read it off two points
        var to3 = function (p) { var r = [p[0] - m0[0], p[1] - m0[1]]; return add(P0, add(scale(d, r[0] * a1[0] + r[1] * a1[1]), scale(b, r[0] * a2[0] + r[1] * a2[1]))); };
        var nw = function (p) { var X = sub(to3(p), O); return [dot(X, ex), dot(X, ey)]; };
        var q0 = nw([0, 0]), q1 = nw([1, 0]);
        phi = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]); tx = q0[0]; ty = q0[1];
      }
    }
    if (model.flatGrain && model.flatGrain.at && model.flatGrain.dir) {
      var gd = norm(model.flatGrain.dir), gh = len(gd) > 0.5 ? flatFaceRecAt(faceRecs, model.flatGrain.at, T, gd) : null;
      if (!gh) warn('Flat-Pattern: the grain direction is not a straight edge or line on a flat face of the part any more; the flat is not turned.');
      else {
        var g0 = mv(gh.q), g1 = mv(gh.rec.map(add(gh.X, gd))), ang = Math.atan2(g1[1] - g0[1], g1[0] - g0[0]);
        if (ang > Math.PI / 2 + 1e-9) ang -= Math.PI; else if (ang <= -Math.PI / 2 + 1e-9) ang += Math.PI;
        var psi = -ang, c = Math.cos(psi), s = Math.sin(psi);
        if (Math.abs(c) < 1e-12) { c = 0; s = s > 0 ? 1 : -1; } else if (Math.abs(s) < 1e-12) { s = 0; c = c > 0 ? 1 : -1; }
        // compose: p'' = R(psi)·(R(phi)·p + t); the plane's axes turn the other way so the flat stays where it lies
        var t2 = [c * tx - s * ty, s * tx + c * ty];
        phi += psi; tx = t2[0]; ty = t2[1];
        var ex2 = sub(scale(ex, c), scale(ey, s)), ey2 = add(scale(ex, s), scale(ey, c));
        ex = ex2; ey = ey2;
      }
    }
    // snap a quarter turn to exact numbers (clean DXF coordinates)
    var cs = Math.cos(phi), sn = Math.sin(phi);
    if (Math.abs(cs) < 1e-12 && Math.abs(phi) > 0 && Math.abs(Math.abs(sn) - 1) < 1e-12) { cs = 0; sn = sn > 0 ? 1 : -1; }
    if (Math.abs(sn) < 1e-12) { sn = 0; cs = cs > 0 ? 1 : -1; }
    if (cs === 1 && sn === 0 && Math.abs(tx) < 1e-12 && Math.abs(ty) < 1e-12 && ex === plane.x && O === plane.origin) return flat;
    function P2(p) { return [cs * p[0] - sn * p[1] + tx, sn * p[0] + cs * p[1] + ty]; }
    var dA = Math.atan2(sn, cs) * 180 / Math.PI;
    flat.loops = flat.loops.map(function (l) { return l.map(P2); });
    flat.bends.forEach(function (bd) { bd.a = P2(bd.a); bd.b = P2(bd.b); });
    if (flat.regionLines) flat.regionLines.forEach(function (rl) { rl.a = P2(rl.a); rl.b = P2(rl.b); });   // lane flatopts
    if (flat.bendRegions) flat.bendRegions = flat.bendRegions.map(function (l) { return l.map(P2); });
    (flat.etch || []).forEach(function (it) {
      if (it.a) it.a = P2(it.a);
      if (it.b) it.b = P2(it.b);
      if (it.c) it.c = P2(it.c);
      if (it.pts) it.pts = it.pts.map(P2);
      if (it.t === 'arc') { it.a0 += dA; it.a1 += dA; }
    });
    var min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    flat.loops.forEach(function (l) { l.forEach(function (p) { for (var k = 0; k < 2; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); } }); });
    flat.bbox = { min: min, max: max }; flat.size = [max[0] - min[0], max[1] - min[1]];
    flat.plane = { origin: O.slice(), x: ex.slice(), y: ey.slice(), n: nv.slice(), offset: dot(nv, O) };
    flat.orient = { rotation: dA, fixed: !!model.flatFixed, grain: !!model.flatGrain };
    return flat;
  }
  // lane flatopts: Flat-Pattern1's Parameters / Corner Options check boxes, model.flatOptions = { mergeFaces,
  // simplifyBends, showSlit, cornerTreatment } (SolidWorks' IFlatPatternFeatureData MergeFace / SimplifyBends /
  // ShowSlitInCornerRelief / CornerTreatment). Only keys that differ from the default are stored; absent = default, so
  // every old part's flat is unchanged. What each switch does in flatPattern (Anvil's choices, not measured in SolidWorks):
  //  * mergeFaces (true): false keeps the bend regions as faces of their own: flat.bendRegions (each strip's polygon)
  //    and flat.regionLines [{ a, b, bend }] (the two tangent lines of every bend region, clipped to the blank). The DXF
  //    does not write them (a laser would cut them); the outline is the same.
  //  * simplifyBends (true): false draws a mitre-plane end of a bend strip (hems, Miter Flange) as its developed curve
  //    t(s) = t0 + κ·Rt·sin(A·s / BA) instead of the straight chord from the base corner to the wall corner.
  //  * showSlit (false): true cuts a slit the rip gap wide (the first Rip / Convert gap, else ripDefaultGap) and R + T
  //    long along the bisector into the blank at every corner where two bend regions meet end on (a ripped corner).
  //  * cornerTreatment (true): false leaves the raw developed corner of a SolidWorks edge-flange mitre under 90° (walls
  //    leaning out): its wall line runs on across the bend zone to the edge line short of the base's corner (no clamp
  //    there, a small step at the corner). (A relief notch's reach was tried too: the solid's slot is in the face
  //    outlines already, so it changed nothing.)
  var FLAT_OPTION_DEFAULTS = { mergeFaces: true, simplifyBends: true, showSlit: false, cornerTreatment: true };
  function flatOptionsOf(model) {
    var o = (model && model.flatOptions) || {}, out = {};
    Object.keys(FLAT_OPTION_DEFAULTS).forEach(function (k) { out[k] = o[k] == null ? FLAT_OPTION_DEFAULTS[k] : !!o[k]; });
    return out;
  }
  // Show slit: ends = [{ P (base-side corner of a square strip end), o2, dOut, R, BA, k }]. Two ends of different strips
  // whose end lines (P + o2·s) cross within both bend zones, each pointing out along the other's o2, are a corner where
  // two bend regions meet (a ripped corner: Rip, Insert Bends, flanges on two edges that meet). The slit (g wide, R + T
  // long) runs from the crossing along −(o2₁ + o2₂) into the blank, its start pushed g/2 out so the start edge's ends
  // land on both strips' end lines (square corners)
  function flatSlits(model, ends, T) {
    var g = null;
    model.features.forEach(function (f) { if (g == null && (f.type === 'rip' || f.type === 'convertSM') && +f.gap > 0) g = +f.gap; });
    if (g == null) g = ripDefaultGap(model);
    var out = [], done = {}, tol = 1e-6 * (1 + T);
    function d2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
    ends.forEach(function (e1, i) {
      ends.forEach(function (e2, j) {
        if (j <= i || e1.k === e2.k || done[i] || done[j]) return;
        if (d2(e1.dOut, e2.o2) < 0.5 || d2(e2.dOut, e1.o2) < 0.5) return;
        var den = e1.o2[0] * -e2.o2[1] - e1.o2[1] * -e2.o2[0];
        if (Math.abs(den) < 1e-9) return;
        var w = [e2.P[0] - e1.P[0], e2.P[1] - e1.P[1]], s1 = (w[0] * -e2.o2[1] - w[1] * -e2.o2[0]) / den, s2 = (e1.o2[0] * w[1] - e1.o2[1] * w[0]) / den;
        if (s1 < -tol || s2 < -tol || s1 > Math.min(e1.BA, e2.BA) + tol || s2 > Math.min(e1.BA, e2.BA) + tol) return;
        var Q = [e1.P[0] + e1.o2[0] * s1, e1.P[1] + e1.o2[1] * s1];
        var b = [-e1.o2[0] - e2.o2[0], -e1.o2[1] - e2.o2[1]], bl = Math.hypot(b[0], b[1]);
        if (!(bl > 1e-9)) return;
        b = [b[0] / bl, b[1] / bl];
        var pp = [-b[1], b[0]], h = g / 2, Ls = Math.max(e1.R, e2.R) + T, C = [Q[0] - b[0] * h, Q[1] - b[1] * h];
        function at(s, w) { return [C[0] + b[0] * s + pp[0] * w, C[1] + b[1] * s + pp[1] * w]; }
        var nt = [at(0, -h), at(Ls + h, -h), at(Ls + h, h), at(0, h)];
        out.push(signedArea(nt) < 0 ? nt.reverse() : nt);
        done[i] = done[j] = true;
      });
    });
    return out;
  }
  // the parts of segment a–b inside the blank (outer loop less holes), for the tangent lines of mergeFaces off
  function clipToBlank(a, b, loops) {
    var ts = [0, 1], d = [b[0] - a[0], b[1] - a[1]];
    loops.forEach(function (l) {
      l.forEach(function (p, i) {
        var q = l[(i + 1) % l.length], e = [q[0] - p[0], q[1] - p[1]], den = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(den) < 1e-15) return;
        var w = [p[0] - a[0], p[1] - a[1]], t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
        if (t > 0 && t < 1 && u >= -1e-12 && u <= 1 + 1e-12) ts.push(t);
      });
    });
    ts.sort(function (x, y) { return x - y; });
    function inside(P) { return pointInPoly(P, loops[0]) && !loops.slice(1).some(function (h) { return pointInPoly(P, h); }); }
    var out = [];
    for (var i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < 1e-9) continue;
      var tm = (ts[i] + ts[i + 1]) / 2;
      if (!inside([a[0] + d[0] * tm, a[1] + d[1] * tm])) continue;
      var A = [a[0] + d[0] * ts[i], a[1] + d[1] * ts[i]], B = [a[0] + d[0] * ts[i + 1], a[1] + d[1] * ts[i + 1]], last = out[out.length - 1];
      if (last && Math.abs(last.b[0] - A[0]) < 1e-12 && Math.abs(last.b[1] - A[1]) < 1e-12) last.b = B; else out.push({ a: A, b: B });
    }
    return out;
  }
  // lane DK: Close bend region: the extended flange's record, copied, runs `by` further past that end (its relief there
  // goes: the corner is closed)
  function ccExtendRecords(flanges, flangeIds, recs) {
    (recs || []).forEach(function (x) {
      if (!x || (x.kind !== 'ccExtend' && x.kind !== 'ccEnd')) return;
      for (var k = 0; k < flanges.length; k++) {
        var id = flangeIds[k];
        if (!id || id.feature !== x.feature || id.index !== x.index) continue;
        var r = Object.assign({}, flanges[k]), d = norm(sub(r.b, r.a));
        // lane DV: ccEnd: the strip's end runs from t0 past the end (bend start) to ext past it (bend end)
        if (x.kind === 'ccEnd') { r.ccEnds = (r.ccEnds || [null, null]).slice(); r.ccEnds[x.end] = { t0: x.t0, ext: x.ext }; }
        else {
          if (x.end) r.b = add(r.b, scale(d, x.by)); else r.a = sub(r.a, scale(d, x.by));
          // rfGJ: a helicoid's end: no notch, the strip stays square out to the wall's end (bendSurfaceNotches: a corner)
          if (x.square) { r.ccEnds = (r.ccEnds || [null, null]).slice(); r.ccEnds[x.end] = { t0: 0, ext: 0 }; }
        }
        if (r.reliefs) { r.reliefs = r.reliefs.slice(); r.reliefs[x.end] = null; }
        flanges[k] = r;
      }
    });
  }
  // A layer of marks, not cuts: a noProfile layer (the ETCH preset, or any such layer of the user's) other than BEND
  // (bend lines come from the flat's own bends)
  function etchLayerOf(sketch, e) {
    var l = K.sketchLayer(sketch, e);
    return l && l.noProfile && !/BEND/i.test(String(l.name)) ? l : null;
  }
  // flatEtch(model, build, faceRecs, T, warn) -> { items, layer }: the marking of sketches drawn on a face of the sheet
  // (Sketch Text in Etch mode, and lines / arcs / circles / any other entity on an ETCH-type layer; never construction
  // geometry, points, BEND-layer lines or Cut text, which the solid already holds as holes), in flat coordinates.
  // A sketch belongs to an unfolded face (faceRecs: { map, normal, w, loops }) when its plane is that face's plane or
  // the sheet's other side T behind it; its points are dropped onto the face along the normal and go through the face's
  // own unfold map, exactly as the face's holes do (a wall's marks unfold with it). A sketch on the other side comes out
  // mirrored, as the mark lies on the sheet seen from the flat's side. With several such faces (one plane holding two
  // walls apart), the one whose outline holds most of the sketch's points (one point per entity).
  // items: { t: 'line', a, b } | { t: 'arc', c, r, a0, a1 } (degrees, counterclockwise from a0 to a1) | { t: 'circle',
  // c, r } | { t: 'poly', pts, closed }; layer: { name: 'ETCH', aci, color } of the first ETCH-type layer used (null
  // when only text was found: the DXF then uses colour 3).
  // A Sketched Bend after the sketch folds the face its marks were drawn on (sketch-text2 lane): each mark goes with
  // the piece of the sheet its first point lies on through every later Sketched Bend's motion (build.flanges' move
  // records, as sketchedBendRecords carries flange records), so it reaches the moved face and unfolds with it, its
  // marks in the bend strip staying with the fixed side. Marks are grouped by the pieces they rode on; each group finds
  // its face and its map as one sketch would.
  // Lane DP: a mark that runs off its face over a bend (a line from the base across the bend line) is cut at the bend's
  // edge and the part over the bend developed (etchDeveloper / etchSplit: projected along the sketch normal onto the
  // bend, unrolled by angle as the strip is), so a mark across a bend reaches the flat where the bend puts it.
  // strips: flatPattern's etchStrips ({ fi, BA, Rt, Ro, startMap, wallMap, A2, B2, o2 } per laid strip).
  function flatEtch(model, build, faceRecs, T, warn, strips) {
    var items = [], layer = null, R2D = 180 / Math.PI;
    // the Sketched Bends' moving pieces, in feature order: [{ at (feature index), moves: [{ keep, R, t }] }]
    var bendMoves = [];
    model.features.forEach(function (f, fi) {
      if (f.type !== 'sketchedBend' || f.suppressed || (build.errors && build.errors[f.id])) return;
      var mv = ((build.flanges && build.flanges[f.id]) || []).filter(function (r) { return r.move; }).map(function (r) { return r.move; });
      if (mv.length) bendMoves.push({ at: fi, moves: mv });
    });
    model.features.forEach(function (sk, si) {
      if (sk.type !== 'sketch' || sk.suppressed || (build.errors && build.errors[sk.id])) return;
      var ents = (sk.entities || []).filter(function (e) {
        if (!e || e.construction || e.t === 'point' || (e.t === 'line' && e.infinite)) return false;
        if (e.t === 'text') return e.mode !== 'outline' && !(K.sketchLayer(sk, e) && /BEND/i.test(String(K.sketchLayer(sk, e).name)));
        return !!etchLayerOf(sk, e);
      });
      if (!ents.length) return;
      var pl;
      try { pl = resolvePlane((build.facePlanes && build.facePlanes[sk.id]) || sk.plane, model, build.planes || {}); } catch (err) { return; }
      var name = sk.name || ('Sketch ' + sk.id), later = bendMoves.filter(function (b) { return b.at > si; });
      // the marks in the sketch frame, each with the point that says which piece of the sheet it is on: { k: 'line',
      // a, b } | { k: 'arc', c, r, a0, a1 (degrees) } | { k: 'poly', pts, closed }
      var marks = [];
      ents.forEach(function (e) {
        if (e.t === 'text') {
          (K.textDxf(e).strokes || []).forEach(function (s) {
            if (s.t === 'line') marks.push({ k: 'line', a: [s.x1, s.y1], b: [s.x2, s.y2], probe: [s.x1, s.y1] });
            else if (s.t === 'poly') marks.push({ k: 'poly', pts: s.pts, closed: !!s.closed, probe: s.pts[0] });
            else marks.push({ k: 'arc', c: [s.cx, s.cy], r: s.r, a0: s.a0, a1: s.a1, probe: [s.cx + s.r * Math.cos(s.a0 / R2D), s.cy + s.r * Math.sin(s.a0 / R2D)] });
          });
          return;
        }
        var lr = etchLayerOf(sk, e);
        if (!layer && lr) layer = { name: 'ETCH', aci: lr.aci > 0 ? lr.aci | 0 : null, color: lr.color || null };
        var sp = K.entitySnapPoints ? K.entitySnapPoints(e) : null, probe = sp && sp.length ? sp[0] : null;
        if (e.t === 'arc') { marks.push({ k: 'arc', c: [e.cx, e.cy], r: e.r, a0: e.a0, a1: e.a1 < e.a0 ? e.a1 + 360 : e.a1, probe: probe }); return; }
        if (K.isFreeCurve(e)) { (K.entityPolylines(e) || []).forEach(function (p) { marks.push({ k: 'poly', pts: p.pts, closed: !!p.closed, probe: probe || p.pts[0] }); }); return; }
        K.entityPrimitives(e).forEach(function (p) {
          if (p.kind === 'seg') marks.push({ k: 'line', a: p.a, b: p.b, probe: probe || p.a });
          else marks.push({ k: 'arc', c: p.c, r: p.r, a0: p.full ? 0 : p.a0 * R2D, a1: p.full ? 360 : p.a1 * R2D, probe: probe || p.c });
        });
      });
      // each mark through the later bends: the moves it took (one per bend: a move, or null when it stayed)
      var groups = {}, order = [];
      marks.forEach(function (mk) {
        var P = to3D(pl, mk.probe[0], mk.probe[1]), path = [];
        later.forEach(function (b) {
          var M = null;
          for (var q = 0; q < b.moves.length; q++) if (inHalfSpaces(b.moves[q].keep, P, 1e-6)) { M = b.moves[q]; break; }
          path.push(M);
          if (M) P = mPt(M, P);
        });
        var key = path.map(function (M, q) { return M ? later[q].moves.indexOf(M) : '-'; }).join(',');
        if (!groups[key]) { groups[key] = { path: path, marks: [] }; order.push(key); }
        groups[key].marks.push(mk);
      });
      var lost = false, lostReach = false;
      order.forEach(function (key) {
        var gr = groups[key];
        // the sketch plane carried along: the frame's origin and axes through the same moves
        var O3 = to3D(pl, 0, 0), X3 = to3D(pl, 1, 0), Y3 = to3D(pl, 0, 1);
        gr.path.forEach(function (M) { if (M) { O3 = mPt(M, O3); X3 = mPt(M, X3); Y3 = mPt(M, Y3); } });
        var xa = sub(X3, O3), ya = sub(Y3, O3), n = norm(cross(xa, ya)), tol = 1e-5 * (1 + len(O3));
        function Q3(x, y) { return add(O3, add(scale(xa, x), scale(ya, y))); }
        var cands = faceRecs.filter(function (fr) {
          if (Math.abs(Math.abs(dot(n, fr.normal)) - 1) > 1e-6) return false;
          var off = dot(fr.normal, O3) - fr.w;
          return Math.abs(off) < tol || Math.abs(off + T) < tol;
        });
        if (!cands.length) { lost = true; return; }
        function F(fr) {
          return function (x, y) { var Q = Q3(x, y); Q = sub(Q, scale(fr.normal, dot(fr.normal, Q) - fr.w)); return fr.map(Q); };
        }
        // the face that holds most of the group's marks (several faces on one plane: two walls apart)
        var best = null;
        cands.forEach(function (fr) {
          var f = F(fr), hits = 0;
          gr.marks.forEach(function (mk) {
            var p = f(mk.probe[0], mk.probe[1]), k = 0;
            fr.loops.forEach(function (l) { if (pointInPoly(p, l)) k++; });
            if (k % 2 === 1) hits++;
          });
          if (!best || hits > best.hits) best = { fr: fr, hits: hits };
        });
        // the sketch frame -> the flat as one affine map: P0 + X·x + Y·y (X, Y unit, det −1 when the sketch is mirrored)
        var f = F(best.fr), P0 = f(0, 0), X = sub2(f(1, 0), P0), Y = sub2(f(0, 1), P0), det = X[0] * Y[1] - X[1] * Y[0];
        function pt(q) { return [P0[0] + X[0] * q[0] + Y[0] * q[1], P0[1] + X[1] * q[0] + Y[1] * q[1]]; }
        function ang(deg) { var a = deg / R2D, d = [X[0] * Math.cos(a) + Y[0] * Math.sin(a), X[1] * Math.cos(a) + Y[1] * Math.sin(a)]; return Math.atan2(d[1], d[0]) * R2D; }
        function exact(mk) {
          if (mk.k === 'line') items.push({ t: 'line', a: pt(mk.a), b: pt(mk.b) });
          else if (mk.k === 'poly') items.push({ t: 'poly', pts: mk.pts.map(pt), closed: !!mk.closed });
          else if (mk.a1 - mk.a0 >= 360 - 1e-9) items.push({ t: 'circle', c: pt(mk.c), r: mk.r });   // a sketch arc, counterclockwise from a0 to a1
          else { var b0 = ang(mk.a0), b1 = ang(mk.a1); items.push(det > 0 ? { t: 'arc', c: pt(mk.c), r: mk.r, a0: b0, a1: b1 } : { t: 'arc', c: pt(mk.c), r: mk.r, a0: b1, a1: b0 }); }
        }
        // lane DP: the bends beside this face (a mark that runs off the face over one of them is developed onto it)
        var fr0 = best.fr, side = strips ? strips.filter(function (st) { return st.startMap === fr0.map || st.wallMap === fr0.map; }) : [];
        if (!side.length) gr.marks.forEach(exact);
        else {
          var other = Math.abs(dot(fr0.normal, O3) - fr0.w + T) < tol;
          var dev = etchDeveloper(side, fr0, other, function (x, y) { var Q = Q3(x, y); return sub(Q, scale(fr0.normal, dot(fr0.normal, Q) - fr0.w)); });
          gr.marks.forEach(function (mk) { if (!etchSplit(mk, dev, exact, pt, items)) lostReach = true; });
        }
        if (Math.abs(Math.abs(det) - 1) > 1e-6) warn(name + ': its plane is not mapped rigidly into the flat (scale ' + fmtN(Math.sqrt(Math.abs(det))) + ').');
      });
      if (lost) warn(name + ': ' + (order.length > 1 ? 'some of its' : 'its') + ' etch marks do not lie on a flat face of the sheet, so they are left out of the flat pattern.');
      if (lostReach) warn(name + ': part of its etch marks runs past a bend further than the bend can be seen along the sketch normal (past 90°), so that part is left out of the flat pattern.');
    });
    return { items: items, layer: layer };
  }
  // lane DP: etch marks across a bend. A mark drawn on a face's plane that runs past the edge a bend starts from (or,
  // on a wall, back past the line its bend ends on) lies over that bend seen along the sketch's normal, so it is
  // projected that way onto the bend's surface on the sketch's side (radius Rt on the side the flat tracks, Ro on the
  // other) and developed the way the flat's strip is, by angle: s = BA·θ/A from the start edge (the station
  // bendSurfaceNotches gives cuts across a bend). Past what the bend shows along that normal (θ = A, or 90° when A is
  // more): with A < 90° the projection goes on to the face across the bend (ℓ along it, s = BA + ℓ); else it is lost.
  // side: the etchStrips beside face fr (fr is their start face or their wall); other: the sketch is on fr's far side;
  // drop(x, y): a sketch point dropped onto fr's plane. -> { zone(x, y): 'f' (on the face) | strip index | 'x' (lost),
  // at(i, x, y): the flat point over strip i (d clamped into the strip's range, so a boundary point always maps) }
  function etchDeveloper(side, fr, other, drop) {
    var recs = side.map(function (st) {
      var fi = st.fi, A = fi.angle, ab = sub(fi.b, fi.a), L = len(ab), e2 = sub2(st.B2, st.A2), l2 = Math.hypot(e2[0], e2[1]);
      return { st: st, fi: fi, A: A, C: add(fi.origin, scale(fi.u, fi.R)), L: L, dir: L > 1e-12 ? scale(ab, 1 / L) : [0, 0, 0],
        e2: l2 > 1e-12 ? [e2[0] / l2, e2[1] / l2] : [0, 0], tw: add(scale(fi.o, Math.cos(A)), scale(fi.u, Math.sin(A))),
        start: st.startMap === fr.map, Rs: other ? st.Ro : st.Rt };
    });
    function geo(r, x, y) {
      var Q = drop(x, y);
      return { tau: dot(sub(Q, r.fi.a), r.dir), d: r.start ? dot(sub(Q, r.C), r.fi.o) : dot(sub(r.C, Q), r.tw) };
    }
    function flat(r, g) {
      var A = r.A, d = Math.max(0, g.d), reach = r.Rs * Math.sin(Math.min(A, Math.PI / 2)), s;
      if (d <= reach || !(A < Math.PI / 2 - 1e-9)) { var th = Math.asin(Math.min(1, Math.min(d, reach) / r.Rs)); s = r.st.BA * (r.start ? th : A - th) / A; }
      else { var l = (d - r.Rs * Math.sin(A)) / Math.cos(A); s = r.start ? r.st.BA + l : -l; }
      return [r.st.A2[0] + r.st.o2[0] * s + r.e2[0] * g.tau, r.st.A2[1] + r.st.o2[1] * s + r.e2[1] * g.tau];
    }
    return {
      zone: function (x, y) {
        for (var i = 0; i < recs.length; i++) {
          var r = recs[i], g = geo(r, x, y), tl = 1e-9 * (1 + r.L);
          if (!(r.L > 1e-12) || g.tau < -tl || g.tau > r.L + tl || !(g.d > 1e-12 * (1 + r.Rs))) continue;
          return g.d > r.Rs * Math.sin(Math.min(r.A, Math.PI / 2)) + 1e-12 && !(r.A < Math.PI / 2 - 1e-9) ? 'x' : i;
        }
        return 'f';
      },
      at: function (i, x, y) { return flat(recs[i], geo(recs[i], x, y)); }
    };
  }
  // etchSplit(mk, dev, exact, pt, items) -> false when part of the mark was lost: mark mk (flatEtch's sketch-frame mark)
  // cut where it crosses from its face onto a bend (dev.zone changes; the crossing found by bisection on the mark's
  // parameter). Pieces on the face stay exact (exact(mk) for the whole mark, else a line / arc / polyline piece through
  // pt); pieces over a bend are developed point by point (dev.at) and go out as a line when they come out straight (a
  // mark square to the bend or along it) and as a polyline otherwise.
  function etchSplit(mk, dev, exact, pt, items) {
    var R2D = 180 / Math.PI, at, N, verts = [];
    if (mk.k === 'line') { at = function (t) { return [mk.a[0] + (mk.b[0] - mk.a[0]) * t, mk.a[1] + (mk.b[1] - mk.a[1]) * t]; }; N = 32; }
    else if (mk.k === 'arc') {
      at = function (t) { var a = (mk.a0 + (mk.a1 - mk.a0) * t) / R2D; return [mk.c[0] + mk.r * Math.cos(a), mk.c[1] + mk.r * Math.sin(a)]; };
      N = Math.max(16, Math.ceil((mk.a1 - mk.a0) / 4));
    } else {
      var P = mk.closed ? mk.pts.concat([mk.pts[0]]) : mk.pts, ns = P.length - 1;
      if (ns < 1) return true;
      at = function (t) { var u = Math.min(ns - 1e-12, Math.max(0, t * ns)), i = Math.floor(u), f = u - i; return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f]; };
      N = ns * 4;
      for (var v = 1; v < ns; v++) verts.push(v / ns);
    }
    function zoneAt(t) { var q = at(t); return dev.zone(q[0], q[1]); }
    var runs = [], t0 = 0, z0 = zoneAt(0);
    for (var i = 1; i <= N; i++) {
      var t = i / N, z = zoneAt(t);
      if (z === z0) continue;
      var lo = (i - 1) / N, hi = t;
      for (var k = 0; k < 50; k++) { var m = (lo + hi) / 2; if (zoneAt(m) === z0) lo = m; else hi = m; }
      runs.push({ z: z0, t0: t0, t1: (lo + hi) / 2 });
      t0 = (lo + hi) / 2; z0 = z;
    }
    runs.push({ z: z0, t0: t0, t1: 1 });
    if (runs.length === 1 && z0 === 'f') { exact(mk); return true; }
    var ok = true;
    runs.forEach(function (rn) {
      if (rn.t1 - rn.t0 < 1e-12) return;
      if (rn.z === 'x') { ok = false; return; }
      var inner = verts.filter(function (tv) { return tv > rn.t0 + 1e-12 && tv < rn.t1 - 1e-12; });
      if (rn.z === 'f') {
        if (mk.k === 'line') items.push({ t: 'line', a: pt(at(rn.t0)), b: pt(at(rn.t1)) });
        else if (mk.k === 'arc') exact({ k: 'arc', c: mk.c, r: mk.r, a0: mk.a0 + (mk.a1 - mk.a0) * rn.t0, a1: mk.a0 + (mk.a1 - mk.a0) * rn.t1 });
        else items.push({ t: 'poly', pts: [at(rn.t0)].concat(inner.map(at), [at(rn.t1)]).map(pt), closed: false });
        return;
      }
      var M = Math.max(8, Math.ceil((rn.t1 - rn.t0) * N * 4)), ts = [];
      for (var j = 0; j <= M; j++) ts.push(rn.t0 + (rn.t1 - rn.t0) * j / M);
      ts = ts.concat(inner).sort(function (a, b) { return a - b; });
      var pts = ts.map(function (tt) { var q = at(tt); return dev.at(rn.z, q[0], q[1]); });
      var a = pts[0], b = pts[pts.length - 1], ch = sub2(b, a), cl = Math.hypot(ch[0], ch[1]), straight = cl > 1e-12 && pts.every(function (p) {
        return Math.abs((p[0] - a[0]) * ch[1] - (p[1] - a[1]) * ch[0]) / cl < 1e-9 * (1 + cl);
      });
      items.push(straight ? { t: 'line', a: a, b: b } : { t: 'poly', pts: pts, closed: false });
    });
    return ok;
  }
  function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function near2(p, q) { return Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3; }
  // The unfold works on whole planes of a body, as Anvil's own mesh groups them (meshFromBody: coplanar polygons of a
  // body make one face). A mesh of OpenCascade's solid keeps every B-rep face apart (polygon.face), and a bend relief
  // leaves a sliver of the bend as a separate B-rep face on the plane of the wall beside it (and on the base's): the
  // unfold took that sliver for the wall and lost the wall, and the obround's slivers became stray loops. -> a mesh whose
  // faces are the coplanar groups (normal, w, area, polys, body; face indices change), or `mesh` itself when untagged.
  // A facet of a curved B-rep face (polygon.surf: a bend) is never part of a plane, however flat it lies (a hole cut
  // across a bend leaves facets next to the sheet within the grouping's rounding): those keep their own faces, after
  // all the planes, so the unfold always meets a real plane first.
  function planeFaces(mesh) {
    if (!mesh.faces.some(function (f) { return f.polys && f.polys.length && f.polys[0].face != null; })) return mesh;
    var groups = {}, faces = [], curved = [];
    mesh.faces.forEach(function (f) {
      if (f.polys && f.polys.length && f.polys[0].surf) { curved.push(f); return; }
      var k = [Math.round(f.normal[0] * 1000), Math.round(f.normal[1] * 1000), Math.round(f.normal[2] * 1000), Math.round(f.w * 100), f.body || 0, f.part != null ? f.part : ''].join('|');
      var g = groups[k];
      if (!g) {
        g = groups[k] = { normal: f.normal, w: f.w, start: f.start, count: f.count, centroid: f.centroid.slice(), area: f.area, polys: f.polys.slice(), body: f.body };
        if (f.part != null) g.part = f.part;
        faces.push(g);
        return;
      }
      var at = g.area + f.area;
      if (at > 0) g.centroid = [0, 1, 2].map(function (i) { return (g.centroid[i] * g.area + f.centroid[i] * f.area) / at; });
      g.area = at; g.count += f.count; g.polys = g.polys.concat(f.polys);
    });
    var out = {};
    Object.keys(mesh).forEach(function (k) { out[k] = mesh[k]; });
    out.faces = faces.concat(curved);
    return out;
  }

  // ------------------------------------------------------------------ sheet metal: sketched bend
  // Sketched Bend (SolidWorks): the sheet is bent along every straight line of a sketch drawn on one of its flat faces.
  // Feature JSON { type: 'sketchedBend', sketch, fixed: [x, y, z] | null, position: 'centerline' (default) | 'inside' |
  // 'outside' | 'bendOutside', angle (°, default 90), reverse, radius (null: the sheet's), bendAllowance? }.
  // The flat stays what it was: each bend takes a strip BA wide (bendCalc) out of the flat and rolls it into the bend,
  // so the blank unfolds back to the plate. Where the strip sits follows `position`: Bend Centerline centres it on the
  // line, Bend Outside starts it at the line on the moving side, Material Outside / Inside set it back R / R + T toward
  // the fixed side so the bent wall's inner / outer face lands on the line (as Edge Flange places its wall). A line
  // acts along its whole extension, so it need not reach the edges of the face. The side holding the point `fixed`
  // (default: the largest piece of the part between the lines) stays put; the rest folds toward the sketch plane's
  // normal (`reverse`: away from it). A line lying beyond another rides on that line's moving side, so parallel lines
  // make a channel or a Z in one feature. Lines must not cross on the sheet.
  var SB_POSITIONS = ['centerline', 'inside', 'outside', 'bendOutside'];
  // rigid motions { R: rows of the 3×3 rotation, t } as plain arrays (they ride in the flange records)
  var M_ID = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
  function mDir(M, v) { return [dot(M.R[0], v), dot(M.R[1], v), dot(M.R[2], v)]; }
  function mPt(M, p) { return add(mDir(M, p), M.t); }
  function mCompose(A, B) {   // A ∘ B: B first
    var R = [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return A.R[i][0] * B.R[0][j] + A.R[i][1] * B.R[1][j] + A.R[i][2] * B.R[2][j]; }); });
    return { R: R, t: add(mDir(A, B.t), A.t) };
  }
  // rotation by `ang` (right hand) about the line through c along the unit axis a
  function mRotation(c, a, ang) {
    var C = Math.cos(ang), S = Math.sin(ang), V = 1 - C, x = a[0], y = a[1], z = a[2];
    var R = [[C + x * x * V, x * y * V - z * S, x * z * V + y * S], [y * x * V + z * S, C + y * y * V, y * z * V - x * S], [z * x * V - y * S, z * y * V + x * S, C + z * z * V]];
    return { R: R, t: sub(c, mDir({ R: R }, c)) };
  }
  function mBody(body, M) {
    return body.transform(function (p) { var q = mPt(M, [p.x, p.y, p.z]); return new CSG.Vector(q[0], q[1], q[2]); }, false);
  }
  // lane FU: smBool(a, op, b, T) -> a.subtract / union / intersect(b) done at a scale where the CSG's absolute
  // tolerance (csg.js EPSILON 1e-5) is small against the sheet: S = the power of two nearest 1/T, at least 1 (16 for
  // 16 ga in inches, 1 for millimetre sheets). A power of two scales and scales back without rounding, so every vertex
  // the boolean does not touch comes back bit for bit. Why: a hole wrapped round a 16 ga bend (Fold) cuts the bend's
  // chord faces with twisted walls whose planes differ by under a degree; at scale 1 the slivers between them fall
  // inside 1e-5 and the result had 61 open / 3 non-manifold edges, at 16 none (rfFU).
  function smScale(T) { return T > 0 && T < 0.75 ? Math.pow(2, Math.round(Math.log(1 / T) / Math.LN2)) : 1; }
  // b may be a list of tools: they are unioned at the same scale first
  function smBool(a, op, b, T) {
    var S = smScale(T), list = Array.isArray(b);
    if (S === 1) return a[op](list ? unionAll(b) : b);
    function sc(body, k) { return body.transform(function (p) { return new CSG.Vector(p.x * k, p.y * k, p.z * k); }, false); }
    return sc(sc(a, S)[op](list ? unionAll(b.map(function (x) { return sc(x, S); })) : sc(b, S)), 1 / S);
  }
  // a loop without its repeated points (flangeProfile with no wall or no overlap strip)
  function noRepeatLoop(loop) {
    return loop.filter(function (p, i) { var q = loop[(i + 1) % loop.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-12; });
  }
  function inHalfSpaces(hs, p, tol) { return hs.every(function (h) { return dot(h.n, p) >= h.w - tol; }); }
  // the lines of a sketched bend's sketch in 3D: { plane, lines: [{ P1, P2, d, mid }] }
  function sketchedBendLines(f, model, ctx) {
    var sketch = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch);
    if (!sketch || sketch.type !== 'sketch') throw new Error('Select the sketch with the bend line(s).');
    var plane = resolvePlane(sketch.plane, model, ctx.planes || {}), lines = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || e.t === 'point' || e.t === 'text' || K.noProfileEntity(sketch, e)) return;
      if (e.t !== 'line') throw new Error('A sketched bend\'s sketch may hold only straight lines (it has a ' + e.t + ').');
      var P1 = to3D(plane, +e.x1, +e.y1), P2 = to3D(plane, +e.x2, +e.y2), L = len(sub(P2, P1));
      if (L > 1e-9) lines.push({ P1: P1, P2: P2, d: scale(sub(P2, P1), 1 / L), mid: scale(add(P1, P2), 0.5) });
    });
    if (!lines.length) throw new Error('The sketch has no line: sketch one straight line per bend on a flat face of the sheet.');
    return { plane: plane, lines: lines };
  }
  // a point on the first bend line (the rebuild takes the body nearest it), or null
  function sketchedBendPoint(f, model, ctx) {
    try { return sketchedBendLines(f, model, ctx).lines[0].mid; } catch (e) { return null; }
  }
  // [min, max] of axis·(p − O) over the part of the solid inside every half-space { n, w } (n·p >= w), or null.
  // The polygons are clipped one by one (Sutherland–Hodgman); their vertices bound the material in the region.
  function regionExtent(body, hs, O, axis) {
    var lo = Infinity, hi = -Infinity, eps = 1e-7;
    body.polygons.forEach(function (pg) {
      var pts = pg.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; });
      for (var k = 0; k < hs.length && pts.length; k++) {
        var h = hs[k], out = [];
        for (var i = 0; i < pts.length; i++) {
          var a = pts[i], b = pts[(i + 1) % pts.length], da = dot(h.n, a) - h.w + eps, db = dot(h.n, b) - h.w + eps;
          if (da >= 0) out.push(a);
          if ((da >= 0) !== (db >= 0)) out.push(add(a, scale(sub(b, a), da / (da - db))));
        }
        pts = out;
      }
      pts.forEach(function (p) { var s = dot(axis, sub(p, O)); if (s < lo) lo = s; if (s > hi) hi = s; });
    });
    return lo <= hi ? [lo, hi] : null;
  }
  // the default fixed side: the sign (per line, of n×d) of the largest piece the lines cut the solid into
  function largestPieceSides(body, lines) {
    var pieces = [{ body: body, sides: [] }], total = Math.abs(body.volume());
    lines.forEach(function (ln) {
      var next = [];
      pieces.forEach(function (pc) {
        [1, -1].forEach(function (sg) {
          var b = pc.body.clipByPlane(scale(ln.m0, sg), sg * ln.w0);
          if (b.polygons.length && b.volume() > 1e-9 * total) next.push({ body: b, sides: pc.sides.concat([sg]) });
        });
      });
      pieces = next;
    });
    var best = null;
    pieces.forEach(function (pc) { var v = pc.body.volume(); if (!best || v > best.v * (1 + 1e-9)) best = { v: v, sides: pc.sides }; });
    if (!best) throw new Error('Sketched Bend: the bend lines do not cross the sheet.');
    return best.sides;
  }
  // sketchedBendLayout(f, model, ctx) -> the bend as plain data, in the coordinates of ctx.body (a CSG): { fixed: [{ n,
  // w }] (half-spaces of the piece that stays put), pieces: [{ keep: [{ n, w }], motion }] (each line's moving piece and
  // where it goes), bends: [{ loop, plane, t0, t1, motion }] (each bend: flangeProfile's section swept along the line
  // from t0 to t1 in the flat, then moved by `motion`; voids? / band?: the holes / slots across its strip, see
  // bendVoids), info (ctx.flanges' records: { move: { keep, R, t } } entries
  // that carry earlier flange records along with a moved piece, one { anchor } point on the fixed piece, then one
  // flange-like record per line), BA, shift, section: { A, R, T, L, ov } (the bend section's flangeProfile parameters,
  // for an exact section) }. buildSketchedBend builds it with the CSG kernel; occt-kernel.js with exact bend arcs.
  function sketchedBendLayout(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding a sketched bend.');
    var sheet = sheetParams(model);
    var T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    var A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180;
    if (!isFinite(A)) throw new Error('Bend angle must be a number.');
    if (!(A > 0.01)) throw new Error('Bend angle must be greater than zero.');
    if (A > Math.PI + 1e-9) throw new Error('Bend angle must be 180° or less.');
    if (!(R > 0)) throw new Error('Bend radius must be greater than zero.');
    var position = f.position || 'centerline';
    if (SB_POSITIONS.indexOf(position) < 0) throw new Error('Unknown bend position "' + position + '" (centerline, inside, outside or bendOutside).');
    var bc = bendCalc(sheet, A, R, T, customBA(f)), BA = bc.BA;
    var shift = position === 'centerline' ? BA / 2 : position === 'inside' ? R + T : position === 'outside' ? R : 0;
    var sk = sketchedBendLines(f, model, ctx), lines = sk.lines, n = norm(sk.plane.n);
    var up = f.reverse ? scale(n, -1) : n;
    var inside = ctx.body.pointTester();
    // the sheet lies on one side of the sketch plane (s: +1 toward n, −1 away)
    function sheetSide(ln, k) {
      var s = 0;
      [0.5, 0.25, 0.75, 0.1, 0.9, 0.02, 0.98].some(function (t) {
        var q = add(ln.P1, scale(sub(ln.P2, ln.P1), t)), a = inside(add(q, scale(n, T / 2))), b = inside(sub(q, scale(n, T / 2)));
        if (a !== b) s = a ? 1 : -1;
        return s !== 0;
      });
      if (!s) throw new Error('Sketched Bend: line ' + (k + 1) + ' does not lie on a flat face of the sheet (sketch the bend lines on the face).');
      return s;
    }
    lines.forEach(function (ln, k) {
      ln.s = sheetSide(ln, k);
      ln.m0 = norm(cross(n, ln.d));
      ln.w0 = dot(ln.m0, ln.P1);
    });
    var sides;
    if (f.fixed) {
      var fx = [+f.fixed[0], +f.fixed[1], +f.fixed[2]];
      if (!fx.every(isFinite)) throw new Error('Sketched Bend: the fixed face point must be three numbers.');
      sides = lines.map(function (ln, k) {
        var sd = dot(ln.m0, fx) - ln.w0;
        if (Math.abs(sd) < 1e-6) throw new Error('Sketched Bend: the fixed face point lies on bend line ' + (k + 1) + '; pick a face on one side of it.');
        return sd > 0 ? 1 : -1;
      });
    } else sides = largestPieceSides(ctx.body, lines);
    lines.forEach(function (ln, k) { ln.m = scale(ln.m0, -sides[k]); ln.up = up; ln.sh = shift; });   // m: across the line toward the moving side
    // a sketch jog (f.jogBack = g, jogBendFeature): the second bend is a line of this same layout, on the flat sheet: its
    // strip starts g past the end of the first's, it folds the other way and rides on the first. (It was once a second
    // Sketched Bend on the bent part, whose half-spaces, past 90°, took in the base the wall leans back over.)
    if (f.jogBack != null) {
      var l1 = lines[0], dv = scale(l1.m, BA - shift + f.jogBack);
      var l2 = { P1: add(l1.P1, dv), P2: add(l1.P2, dv), d: l1.d, mid: add(l1.mid, dv), m0: l1.m0, w0: l1.w0, m: l1.m, up: scale(up, -1), sh: 0, jogOf: 0 };
      l2.s = sheetSide(l2, 1);
      lines.push(l2);
    }
    lines.forEach(function (ln) {
      // the bend's inside face is the sheet face on the side it folds toward: the sketch face or the one T beyond it
      var innerOff = dot(ln.up, n) * ln.s > 0 ? ln.s * T : 0;
      ln.O = add(add(ln.P1, scale(n, innerOff)), scale(ln.m, -ln.sh));   // start of the bend strip, on the inside face
      ln.wS = dot(ln.m, ln.O);
      ln.a = norm(cross(ln.m, ln.up));
      ln.band = [Math.min(dot(n, ln.P1), dot(n, ln.P1) + ln.s * T), Math.max(dot(n, ln.P1), dot(n, ln.P1) + ln.s * T)];
    });
    // lines must not cross on the sheet, nor lie on one another
    for (var i = 0; i < lines.length; i++) for (var j = i + 1; j < lines.length; j++) {
      var li = lines[i], lj = lines[j], c = cross(li.d, lj.d), cc = dot(c, c);
      if (lj.jogOf != null) continue;
      if (cc < 1e-18) {
        if (Math.abs(dot(li.m0, lj.P1) - li.w0) < 1e-6) throw new Error('Sketched Bend: bend lines ' + (i + 1) + ' and ' + (j + 1) + ' lie on one another.');
        continue;
      }
      var X = add(li.P1, scale(li.d, dot(cross(sub(lj.P1, li.P1), lj.d), c) / cc));
      if (inside(add(X, scale(n, li.s * T / 2)))) throw new Error('Sketched Bend: bend lines ' + (i + 1) + ' and ' + (j + 1) + ' cross on the sheet.');
    }
    // nesting: a line whose midpoint lies on another's moving side rides on it; its parent is the deepest such line
    lines.forEach(function (ln, k) {
      ln.anc = ln.jogOf != null ? [ln.jogOf] : [];
      if (ln.jogOf == null) lines.forEach(function (li, i2) { if (i2 !== k && li.jogOf == null && dot(li.m, ln.mid) - dot(li.m, li.P1) > 1e-6) ln.anc.push(i2); });
    });
    lines.forEach(function (ln) {
      ln.parent = -1;
      ln.anc.forEach(function (i2) { if (ln.parent < 0 || lines[i2].anc.length > lines[ln.parent].anc.length) ln.parent = i2; });
    });
    lines.forEach(function (ln, k) {
      lines.forEach(function (li, i2) {
        if (i2 === k) return;
        var p = add(ln.mid, scale(ln.m, -ln.sh));
        if (ln.anc.indexOf(i2) >= 0 ? dot(li.m, p) < li.wS + BA - 1e-6 : li.anc.indexOf(k) < 0 && dot(li.m, p) > li.wS + 1e-6)
          throw new Error('Sketched Bend: bend lines ' + (Math.min(k, i2) + 1) + ' and ' + (Math.max(k, i2) + 1) + ' are too close: their bends overlap.');
      });
    });
    // half-spaces: before(k) the fixed side of line k's strip, beyond(k) past its strip
    function before(k) { return { n: scale(lines[k].m, -1), w: -lines[k].wS }; }
    function beyond(k) { return { n: lines[k].m, w: lines[k].wS + BA }; }
    // the region of line k: past its ancestors' strips and before every other line's strip
    function region(k) { return lines.map(function (li, i2) { return i2 === k ? null : lines[k].anc.indexOf(i2) >= 0 ? beyond(i2) : before(i2); }).filter(Boolean); }
    var order = lines.map(function (ln, k) { return k; }).sort(function (a, b) { return lines[a].anc.length - lines[b].anc.length; });
    var G = [], pieces = [], bends = [], records = [], moves = [], ov = Math.min(T, 0.5), ba = customBA(f);
    order.forEach(function (k) {
      var ln = lines[k], Gp = ln.parent >= 0 ? G[ln.parent] : M_ID;
      // a bend section with its overlap strips into both sides; a jog's two bends are only g apart, and a strip longer than
      // that would stand proud of the other bend (11 ga overall .5: g = .0216, 1.3e-3 in³ of metal that is not there)
      var sec = { A: A, R: R, T: T, L: f.jogBack != null && k === 0 ? Math.min(ov, f.jogBack) : ov, ov: ln.jogOf != null ? Math.min(ov, f.jogBack) : ov };
      var loop = noRepeatLoop(flangeProfile(A, R, T, sec.L, sec.ov));
      var zone = region(k).concat([{ n: ln.m, w: ln.wS }, { n: scale(ln.m, -1), w: -(ln.wS + BA) }, { n: n, w: ln.band[0] }, { n: scale(n, -1), w: -ln.band[1] }]);
      var ext = regionExtent(ctx.body, zone, ln.O, ln.a);
      if (!ext || ext[1] - ext[0] < 1e-6) throw new Error('Sketched Bend: line ' + (k + 1) + ' does not cross the sheet.');
      var Oc = add(ln.O, scale(ln.a, (ext[0] + ext[1]) / 2)), half = (ext[1] - ext[0]) / 2;
      // the moving piece slides back by BA (the strip it rolls up), then turns by A about the bend's axis
      G[k] = mCompose(Gp, mCompose(mRotation(add(ln.O, scale(ln.up, R)), ln.a, A), { R: M_ID.R, t: scale(ln.m, -BA) }));
      var keep = region(k).concat([beyond(k)]);
      pieces.push({ keep: keep, motion: G[k] });
      moves.push({ move: { keep: keep, R: G[k].R, t: G[k].t } });
      var bend = { loop: loop, section: sec, plane: { origin: Oc, x: ln.m, y: ln.up, n: ln.a }, t0: -half, t1: half, motion: Gp };
      // holes, slots and notches of the sheet across the strip (and the overlaps into both sides): voids { loops (s,
      // t), band } the bend's sweep must not fill in (bendVoids; wrapped round the bend by wrapCut). A sheet edge that
      // is not square to the line counts too, so the bend follows the sheet's outline.
      var sbBand = { s0: -ov, s1: BA + ov, t0: -half, t1: half };
      var voids = bendVoids(ctx.body, bend.plane, sbBand, T, { ends: true });
      if (voids.length) { bend.voids = voids; bend.band = sbBand; }
      bends.push(bend);
      var reach = regionExtent(ctx.body, keep, ln.O, ln.m);
      // one record per line, shaped like an edge flange's (flangeLayout): the edge is the strip's start line
      var rec = { a: mPt(Gp, add(Oc, scale(ln.a, -half))), b: mPt(Gp, add(Oc, scale(ln.a, half))), mid: mPt(Gp, Oc), origin: mPt(Gp, Oc),
        o: mDir(Gp, ln.m), u: mDir(Gp, ln.up), len: 2 * half, angle: A, R: R, L: reach ? Math.max(T, reach[1] - BA) : T, T: T, ba: ba,
        mitred: [false, false], miterPlanes: [null, null], sketched: true };
      // the voids in the flat (flatCutouts), carried past the strip's ends where they run along them (growLoop)
      var cut = flatCutouts(voids.map(function (l) { return growLoop(l, { t0: -half, t1: half }, T); }), -half, 1);
      if (cut.length) rec.cutouts = cut;
      records.push(rec);
    });
    var fixed = [];
    lines.forEach(function (ln, k) { if (ln.parent < 0) fixed.push(before(k)); });
    var root = lines[order[0]];
    var info = moves.concat([{ anchor: add(root.O, scale(root.m, -1e-3 * T)) }], records);
    return { fixed: fixed, pieces: pieces, bends: bends, info: info, BA: BA, shift: shift, section: { A: A, R: R, T: T, L: ov, ov: ov } };
  }
  // buildSketchedBend(f, model, ctx) -> { body (the bent part), tool (the bends), preview (what moved, with the bends) }
  function buildSketchedBend(f, model, ctx) {
    var lay = sketchedBendLayout(f, model, ctx);
    function clip(body, hs) { hs.forEach(function (h) { if (body.polygons.length) body = body.clipByPlane(h.n, h.w); }); return body; }
    var fixed = clip(ctx.body, lay.fixed), moved = [];
    lay.pieces.forEach(function (pc) { var b = clip(ctx.body, pc.keep); if (b.polygons.length) moved.push(mBody(b, pc.motion)); });
    var holed = false;
    var bends = lay.bends.map(function (bd) {
      // lane FW: a bend across holes / slots / a slanted sheet edge (bendVoids) is its metal built straight from the
      // flat (wrapRegion: the band less the voids, s ∈ [0, BA], no boolean), as lane FU's Fold does; cutting a wrapped
      // tool out of the faceted sweep left cracks (a Ø.5 hole across a 16 ga bend: 9 non-manifold edges). It meets the
      // fixed and moved pieces on the bend's end planes exactly; the union runs at the sheet's scale (smBool).
      if (bd.voids) {
        var w = wrapRegion(bd.voids, lay.section, lay.BA, bd.plane, bd.t0, bd.t1, { shared: f.id });
        if (w) { holed = true; return mBody(w, bd.motion); }
      }
      return mBody(prism(bd.loop, bd.plane, bd.t0, bd.t1, f.id, secCv(bd.loop, bd.section)), bd.motion);
    });
    ctx.flanges[f.id] = lay.info;
    var T = lay.section.T, body = holed ? smBool(fixed, 'union', moved.concat(bends), T) : unionTree([fixed].concat(moved, bends));
    return { body: body, tool: unionAll(bends), preview: unionTree(moved.concat(bends)) };
  }
  // flatPattern's records after a Sketched Bend: earlier flange records (and anchors) on a piece it moved go along
  // with it; then its own anchor and bend records join. -> { flanges, anchors }
  function sketchedBendRecords(flanges, anchors, recs) {
    var moves = recs.filter(function (r) { return r.move; }).map(function (r) { return r.move; });
    function mover(p) { for (var i = 0; i < moves.length; i++) if (inHalfSpaces(moves[i].keep, p, 1e-6)) return moves[i]; return null; }
    flanges = flanges.map(function (fi) {
      var M = mover(fi.mid);
      if (!M) return fi;
      var out = {};
      Object.keys(fi).forEach(function (k) { out[k] = fi[k]; });
      ['a', 'b', 'mid', 'origin'].forEach(function (k) { out[k] = mPt(M, fi[k]); });
      out.o = mDir(M, fi.o); out.u = mDir(M, fi.u);
      out.miterPlanes = (fi.miterPlanes || []).map(function (mp) { if (!mp) return null; var nn = mDir(M, mp.n); return { n: nn, w: mp.w + dot(nn, M.t) }; });
      return out;
    });
    anchors = anchors.map(function (p) { var M = mover(p); return M ? mPt(M, p) : p; });
    var added = [];   // (lane drawing) the index in recs of every record that became a flange, for the bends' ids
    recs.forEach(function (r, j) { if (r.anchor) anchors.push(r.anchor); else if (!r.move) { flanges.push(r); added.push(j); } });
    return { flanges: flanges, anchors: anchors, added: added };
  }

  // ------------------------------------------------------------------ Jog from a sketch line (lane DC, finding #4)
  // SolidWorks' Jog: one line sketched on a flat face of the sheet; the side of the line away from the Fixed face is
  // offset by two opposite bends of the same angle. Feature JSON { type: 'jog', sketch, fixed: [x, y, z] | null (on the
  // side that stays; default the larger piece), offset, offsetRef: 'outside' (default) | 'inside' | 'overall', angle (90),
  // position: 'centerline' (default) | 'inside' | 'outside' | 'bendOutside' (the first bend against the line, as a
  // Sketched Bend), reverse, radius, bendAllowance? }. Offset: inside = between the faces that look at each other
  // across the riser, outside = from a face of the sheet to the same face of the jogged flange (inside + T), overall =
  // from the far face to the far face (inside + 2T). Built as two Sketched Bends: the first at the line, the second on
  // the sheet a straight length g further, folding back, so the jogged flange ends parallel to the sheet; the flat
  // keeps all the metal (each bend rolls up BA). An edge jog (edges, height, length: older parts) is buildJog.
  // Both bends are one sketchedBendLayout on the flat sheet (jogBendFeature, f.jogBack), so a jog past 90° is right.
  var JOG_OFFSET_REFS = ['outside', 'inside', 'overall'];
  function isSketchJog(f) { return !!f && f.type === 'jog' && f.sketch != null; }
  // the riser's inside offset (between the facing faces) for an offset measured as `ref`
  function jogInsideOffset(D, ref, T) { return ref === 'inside' ? D : ref === 'overall' ? D - 2 * T : D - T; }
  // the smallest offset (as `ref` measures it) a jog of angle A (rad), radius R and thickness T can make (g = 0)
  function jogMinOffset(A, R, T, ref) {
    var inner = 2 * R * (1 - Math.cos(A)) - T * Math.cos(A);
    return ref === 'inside' ? inner : ref === 'overall' ? inner + 2 * T : inner + T;
  }
  // lane DK: Fix projected length (SolidWorks' Jog check box): f.fixLength true keeps the jogged side's far end where it
  // was (its projected length as sketched): the jog is built once to read how much projection it takes (delta, along
  // the line's normal m in the sheet), then the sheet is stretched by delta at the line (the side that moves pushed
  // out, the gap filled with the section at the line) and the jog built again. Off (absent): the jog consumes it.
  function buildSketchJog(f, model, ctx) {
    if (!f.fixLength) return buildSketchJog1(f, model, ctx);
    var keep = ctx.body, keepRecs = ctx.flanges[f.id];
    var r0 = buildSketchJog1(f, model, ctx);
    var j = r0.jog, delta = j.delta;
    ctx.flanges[f.id] = keepRecs;
    if (!(delta > 1e-9)) return r0;
    ctx.body = jogStretch(keep, j.line, j.m, j.n, delta);
    try { var r1 = buildSketchJog1(f, model, ctx); } finally { ctx.body = keep; }
    r1.delta = delta;
    return r1;
  }
  // the sheet body lengthened by delta along m at the line (P1, P2 on a sheet face, n the face normal): the part on the
  // +m side moves out by delta and the slab between is the body's section at the line drawn out over delta
  function jogStretch(body, line, m, n, delta) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    body.polygons.forEach(function (pg) { pg.vertices.forEach(function (v) { var q = [v.pos.x, v.pos.y, v.pos.z]; for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }); });
    var S = 2 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) + 1, x = norm(sub(line.P2, line.P1));
    var pl = { origin: line.P1.slice(), x: x, y: n.slice(), n: m.slice() }, big = [[-S, -S], [S, -S], [S, S], [-S, S]];
    var eta = Math.min(delta, 1e-3);
    var minus = body.intersect(prism(big, pl, -S, 0)), plus = body.intersect(prism(big, pl, 0, S));
    var slab = body.intersect(prism(big, pl, 0, eta));
    function along(p) { return dot(sub([p.x, p.y, p.z], line.P1), m); }
    var moved = plus.transform(function (p) { return new CSG.Vector(p.x + delta * m[0], p.y + delta * m[1], p.z + delta * m[2]); }, false);
    var drawn = slab.transform(function (p) { var s0 = along(p), k = s0 * (delta / eta) - s0; return new CSG.Vector(p.x + k * m[0], p.y + k * m[1], p.z + k * m[2]); }, false);
    return minus.union(drawn).union(moved);
  }
  // the Sketched Bend feature that builds a jog (both kernels): the first bend at the line; sketchedBendLayout lays the
  // second out from f.jogBack, the straight riser g between the bends
  function jogBendFeature(f, model, ctx) {
    var sheet = sheetParams(model), T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    var deg = f.angle == null ? 90 : +f.angle, A = deg * Math.PI / 180, D = +f.offset, ref = f.offsetRef || 'outside';
    if (JOG_OFFSET_REFS.indexOf(ref) < 0) throw new Error('Unknown jog offset "' + ref + '" (outside, inside or overall).');
    if (!isFinite(D) || !isFinite(A)) throw new Error('Jog offset and angle must be a number each.');
    if (!(A > 0.05 && A < Math.PI - 0.05)) throw new Error('Jog angle must be between 3° and 177°.');
    if (!(R > 0)) throw new Error('Bend radius must be greater than zero.');
    var sk = sketchedBendLines(f, model, ctx);
    if (sk.lines.length !== 1) throw new Error('Jog: the sketch must hold exactly one line, on a flat face of the sheet (it has ' + sk.lines.length + ').');
    var inner = jogInsideOffset(D, ref, T);
    var g = (inner - 2 * R * (1 - Math.cos(A)) + T * Math.cos(A)) / Math.sin(A);
    if (!(g > -1e-9)) throw new Error('Jog offset is too small for this bend radius and angle: at least ' + fmtN(jogMinOffset(A, R, T, ref)) + ' (' + ref + ' offset).');
    return { id: f.id, sketch: f.sketch, fixed: f.fixed || null, angle: deg, position: f.position || 'centerline', reverse: !!f.reverse, radius: R, bendAllowance: f.bendAllowance, jogBack: Math.max(g, 0) };
  }
  function buildSketchJog1(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding a jog.');
    var fb = jogBendFeature(f, model, ctx), b = buildSketchedBend(fb, model, ctx), recs = ctx.flanges[f.id] || [];
    var mv = recs.filter(function (r) { return r.move; }), rb = recs.filter(function (r) { return r.o && r.sketched; })[0];
    if (mv.length !== 2 || !rb) throw new Error('Jog: the bends could not be made.');
    // lane DK: how much projection the jog takes: a point of the jogged side, moved by the second bend's motion
    var sk = sketchedBendLines(f, model, ctx), ln = sk.lines[0], m = rb.o, last = mv[1].move;
    var Pfar = add(ln.mid, scale(m, 1e3));
    var jog = { line: { P1: ln.P1, P2: ln.P2 }, m: m.slice(), n: sk.plane.n.slice(), delta: -dot(sub(mPt({ R: last.R, t: last.t }, Pfar), Pfar), m) };
    return { body: b.body, tool: b.tool, g: fb.jogBack, jog: jog };
  }

  // ------------------------------------------------------------------ Flat-Pattern solid (lane DC, finding #9)
  // flatBody(model, build, flat?) -> the flat blank as a solid lying on the Base Flange's sketch plane, where the base
  // flange is (the flat's 2D frame is the base sketch's: flatPattern lays the base face with to2D(plane, ·)), T thick on
  // the side the Base Flange was extruded to; flat defaults to flatPattern(model, build, meshFromBody(build.body)).
  // -> { body (CSG), flat, plane, h0, h1 (the solid spans plane.n·[h0, h1] from the plane's origin) }
  function flatBody(model, build, flat) {
    if (!flat) flat = flatPattern(model, build, meshFromBody(build.body));
    var rm = resolvedModel(model).model, T = +flat.sheet.thickness;
    var base = rm.features.filter(function (f) { return f.sheetBase; })[0];
    var plane = flat.plane, h0 = base && (base.reverse || isInsertBends(base) || isOpenBase(base)) ? -T : 0;   // lane DQ: Insert Bends: the plane is on a face, the sheet behind it
    if (base && base.end === 'mid' && !isOpenBase(base)) h0 = -T / 2;
    var loops = flat.loops, outer = loops[0];
    var body = prism(signedArea(outer) < 0 ? outer.slice().reverse() : outer, plane, h0, h0 + T);
    var holes = loops.slice(1).map(function (l) { return prism(signedArea(l) < 0 ? l.slice().reverse() : l, plane, h0 - 1e-3 * T, h0 + T + 1e-3 * T); });
    if (holes.length) body = body.subtract(unionAll(holes));
    return { body: body, flat: flat, plane: plane, h0: h0, h1: h0 + T };
  }

  // ------------------------------------------------------------------ Break Corner / Corner Trim (lane CP)
  // SolidWorks' Sheet Metal ▸ Corners ▸ Break-Corner/Corner-Trim: outside corners of the sheet's flat faces (the base
  // flange, tabs, flange walls) rounded (kind 'fillet', radius `size`) or cut off (kind 'chamfer', `size` along both
  // edges), through the thickness. Feature JSON { type: 'breakCorner', kind: 'chamfer' | 'fillet', size,
  // corners: [[x, y, z], …] (points on corner edges: the short edges through the thickness; re-found by position within
  // EDGE_PICK_TOL·T, like flange edge picks), faces?: [[x, y, z], …] (points on flat sheet faces: every outside corner
  // of each) }. A corner that is no longer there, a face with none and a break that does not fit its edges are rebuild
  // errors. It is a cut (registered below): the tool is one prism per corner, its arc sides tagged as true cylinders, so
  // the volume is exact, the flat outline gets the arc's chords (exportDXFFlat writes them as one ARC) and a later
  // flange on a broken edge picks the shortened edge as usual.
  // sheetCorners(body, T) -> { faces: [{ index, plane, loops, w }], corners: [{ at (mid-thickness point of the corner
  // edge), top, bot, n, plane, uv, d1, d2, o1, o2, l1, l2, alpha, prev, next, faces: [mesh face indices] }] }. A corner
  // is a convex vertex (interior angle alpha at most BC_MAX_ANGLE, so chords of round edges never count) of an outer
  // loop of a flat face that has the opposite sheet face T behind it, where the sheet ends square on both edges (probed
  // at mid-thickness: material just inside each edge, none just outside) and is T thick at the corner. So the corners
  // where a wall meets its bend, corners inside bends and corners of holes and notches are not corners.
  var BC_MAX_ANGLE = 150 * Math.PI / 180, BC_KINDS = ['chamfer', 'fillet'];
  function sheetCorners(body, T) {
    var mesh = meshFromBody(coplanarBody(body)), inside = body.pointTester(), faces = [], corners = [];
    var d = 0.25 * T, tolW = 1e-6 * (1 + T) + 1e-4 * T;
    function curved(face) { return (face.polys || []).some(function (p) { return !!p.surf; }); }
    mesh.faces.forEach(function (face, fi) {
      if (curved(face)) return;
      // the opposite face of the sheet: normal −n, T behind (n·x = w there is −n·x = T − w: w + w' = T)
      var paired = mesh.faces.some(function (g) { return !curved(g) && dot(g.normal, face.normal) < -1 + 1e-9 && Math.abs(face.w + g.w - T) <= tolW; });
      if (!paired) return;
      var o = faceOutline(mesh, fi);
      if (!o || !o.loops.length) return;
      var plane = o.plane, n = plane.n, rec = { index: fi, plane: plane, loops: o.loops, w: face.w };
      faces.push(rec);
      function P3(q, depth) { return add(to3D(plane, q[0], q[1]), scale(n, -depth)); }
      function at(q, dir, s) { return [q[0] + dir[0] * s, q[1] + dir[1] * s]; }
      faceLoopsClassified(o).outers.forEach(function (raw) {
        var p = straightLoop(raw), m = p.length;
        if (m < 3) return;
        for (var i = 0; i < m; i++) {
          var a = p[(i + m - 1) % m], V = p[i], c = p[(i + 1) % m];
          var e1 = [V[0] - a[0], V[1] - a[1]], e2 = [c[0] - V[0], c[1] - V[1]], l1 = Math.hypot(e1[0], e1[1]), l2 = Math.hypot(e2[0], e2[1]);
          if (l1 < 1e-9 || l2 < 1e-9) continue;
          var turn = Math.atan2(e1[0] * e2[1] - e1[1] * e2[0], e1[0] * e2[0] + e1[1] * e2[1]), alpha = Math.PI - turn;
          if (turn <= 0 || alpha > BC_MAX_ANGLE || alpha < 1e-6) continue;
          var d1 = [-e1[0] / l1, -e1[1] / l1], d2 = [e2[0] / l2, e2[1] / l2];
          var o1 = [e1[1] / l1, -e1[0] / l1], o2 = [e2[1] / l2, -e2[0] / l2];   // outward (right of a CCW loop's edges)
          var s1 = Math.min(l1 / 2, T), s2 = Math.min(l2 / 2, T);
          var m1 = at(V, d1, s1), m2 = at(V, d2, s2);
          if (inside(P3(at(m1, o1, d), T / 2)) || !inside(P3(at(m1, o1, -d), T / 2))) continue;   // edge 1 is not a free sheet edge
          if (inside(P3(at(m2, o2, d), T / 2)) || !inside(P3(at(m2, o2, -d), T / 2))) continue;
          var bl = Math.hypot(d1[0] + d2[0], d1[1] + d2[1]), bis = [(d1[0] + d2[0]) / bl, (d1[1] + d2[1]) / bl];
          var q = at(V, bis, Math.min(d / Math.sin(alpha / 2), 0.5 * Math.min(l1, l2)));
          if (!inside(P3(q, T - d)) || inside(P3(q, T + d))) continue;   // not T thick at the corner
          var top = P3(V, 0), bot = P3(V, T), mid = P3(V, T / 2);
          var dup = corners.filter(function (k) { return len(sub(k.at, mid)) <= 0.05 * T; })[0];
          if (dup) { if (dup.faces.indexOf(fi) < 0) dup.faces.push(fi); continue; }
          corners.push({ at: mid, top: top, bot: bot, n: n.slice(), plane: plane, uv: V.slice(), d1: d1, d2: d2, o1: o1, o2: o2, l1: l1, l2: l2, alpha: alpha,
            prev: P3(a, 0), next: P3(c, 0), faces: [fi] });
        }
      });
    });
    return { faces: faces, corners: corners };
  }
  // a loop without the points where it runs straight on (T-junction splits of the mesh outline)
  function straightLoop(l) {
    var p = l.slice();
    for (var again = true; again && p.length > 3;) {
      again = false;
      for (var i = 0; i < p.length && p.length > 3; i++) {
        var a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
        var ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
        if (lu < 1e-12 || lv < 1e-12 || (Math.abs(ux * vy - uy * vx) <= 1e-9 * lu * lv && ux * vx + uy * vy > 0)) { p.splice(i, 1); i--; again = true; }
      }
    }
    return p;
  }
  function bcNum(x) { return String(Math.round(x * 1e4) / 1e4); }
  function bcPt(p) { return '(' + p.map(bcNum).join(', ') + ')'; }
  // the corner tool's section in the face's plane: [Q1, A, (arc), B, Q2, Qc] with seg[i] the curve of segment i → i+1
  // (0: the fillet arc, −1 straight); A and B are where the break meets the two edges, Q1 / Q2 / Qc lie eps outside the
  // edges, so the prism overshoots the corner and never shares a face with the sheet's sides
  function cornerSection(c, kind, size, eps) {
    var V = c.uv, d1 = c.d1, d2 = c.d2, half = c.alpha / 2;
    var t = kind === 'fillet' ? size / Math.tan(half) : size;
    function at(q, dir, s) { return [q[0] + dir[0] * s, q[1] + dir[1] * s]; }
    var A = at(V, d1, t), B = at(V, d2, t), pts = [at(A, c.o1, eps), A], seg = [-1], curves = [];
    if (kind === 'fillet') {
      var bl = Math.hypot(d1[0] + d2[0], d1[1] + d2[1]), C = at(V, [(d1[0] + d2[0]) / bl, (d1[1] + d2[1]) / bl], size / Math.sin(half));
      var a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), sw = Math.atan2(B[1] - C[1], B[0] - C[0]) - a0;
      while (sw > Math.PI) sw -= 2 * Math.PI;
      while (sw <= -Math.PI) sw += 2 * Math.PI;
      // equal chords no longer than 22.5° (exportDXFFlat's arc fitting takes runs of three or more equal chords)
      var segs = Math.max(4, Math.ceil(Math.abs(sw) / (Math.PI / 8) - 1e-9), Math.ceil(_.segsForRadius(size) * Math.abs(sw) / (2 * Math.PI) - 1e-9));
      curves.push({ c: C, r: size });
      for (var k = 1; k < segs; k++) { var th = a0 + sw * k / segs; seg.push(0); pts.push([C[0] + size * Math.cos(th), C[1] + size * Math.sin(th)]); }
      seg.push(0);
    } else seg.push(-1);
    pts.push(B, at(B, c.o2, eps), at(V, [c.o1[0] + c.o2[0], c.o1[1] + c.o2[1]], eps));
    seg.push(-1, -1, -1);
    if (signedArea(pts) < 0) {
      var n = pts.length;
      pts = pts.slice().reverse();
      seg = pts.map(function (q, j) { return seg[(n - 2 - j + n) % n]; });
    }
    return { pts: pts, seg: seg, curves: curves, t: t };
  }
  // breakCornerLayout(f, model, ctx) -> { tools: [{ plane, pts, seg, curves, a, b }] (one prism per corner, from a to b
  // along plane.n), corners: [corner records used] }; plain data, built here with the CSG kernel (buildBreakCorner) and
  // in occt-kernel.js with exact arcs. ctx.body: the part as built so far (a CSG).
  function breakCornerLayout(f, model, ctx) {
    var sheet = model.sheet;
    if (!sheet) throw new Error('Break Corner needs a sheet-metal part: make a Base Flange first (Sheet Metal tab).');
    if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) throw new Error('Nothing to break yet.');
    var T = +sheet.thickness, kind = f.kind || 'chamfer', size = +f.size, what = kind === 'fillet' ? 'radius' : 'distance';
    if (BC_KINDS.indexOf(kind) < 0) throw new Error('Break Corner: the break type must be "chamfer" or "fillet".');
    if (!(size > 0) || !isFinite(size)) throw new Error('Break Corner: the ' + what + ' must be a positive number.');
    var found = sheetCorners(ctx.body, T), chosen = [], tol = EDGE_PICK_TOL * T;
    function take(c) { if (chosen.indexOf(c) < 0) chosen.push(c); }
    (f.corners || []).forEach(function (p) {
      var best = null, bd = tol;
      found.corners.forEach(function (c) { var dd = _.pointSegmentDistance(p, c.top, c.bot); if (dd <= bd) { bd = dd; best = c; } });
      if (!best) throw new Error('Break Corner: there is no outside sheet corner at ' + bcPt(p) + ' any more.');
      take(best);
    });
    (f.faces || []).forEach(function (p) {
      var face = null, bd = 1e-3 * (1 + T);
      found.faces.forEach(function (fr) {
        var off = Math.abs(dot(fr.plane.n, p) - fr.w);
        if (off > bd) return;
        var uv = to2D(fr.plane, p), inn = 0;
        fr.loops.forEach(function (l) { if (pointInPoly(uv, l)) inn++; });
        if (inn % 2 === 1) { bd = off; face = fr; }
      });
      if (!face) throw new Error('Break Corner: there is no flat sheet face at ' + bcPt(p) + ' any more.');
      var own = found.corners.filter(function (c) { return c.faces.indexOf(face.index) >= 0; });
      if (!own.length) throw new Error('Break Corner: the face at ' + bcPt(p) + ' has no outside corners.');
      own.forEach(take);
    });
    if (!chosen.length) throw new Error('Break Corner: pick corner edges or faces.');
    var eps = Math.max(0.01 * T, 1e-6), secs = chosen.map(function (c) { return cornerSection(c, kind, size, eps); });
    chosen.forEach(function (c, i) {
      var t = secs[i].t;
      if (t > Math.min(c.l1, c.l2) + 1e-9) throw new Error('Break Corner: a ' + what + ' of ' + bcNum(size) + ' does not fit the corner at ' + bcPt(c.top) + ': its edges are ' + bcNum(Math.min(c.l1, c.l2)) + ' long.');
      // two broken corners at the two ends of one edge must not overlap on it
      chosen.forEach(function (o, j) {
        if (j <= i) return;
        [[c.prev, c.l1], [c.next, c.l2]].forEach(function (e) {
          if (_.pointSegmentDistance(e[0], o.top, o.bot) <= 1e-4 * (1 + T) && t + secs[j].t > e[1] + 1e-9)
            throw new Error('Break Corner: the corners at ' + bcPt(c.top) + ' and ' + bcPt(o.top) + ' overlap on their ' + bcNum(e[1]) + ' edge: make the ' + what + ' smaller.');
        });
      });
    });
    return { corners: chosen, tools: chosen.map(function (c, i) { var s = secs[i]; return { plane: c.plane, pts: s.pts, seg: s.seg, curves: s.curves, a: -T - eps, b: eps }; }) };
  }
  function buildBreakCorner(f, model, ctx) {
    var lay = breakCornerLayout(f, model, ctx);
    return unionAll(lay.tools.map(function (t) { return prism(t.pts, t.plane, t.a, t.b, f.id, t.seg.map(function (k) { return k >= 0 ? t.curves[k] : null; })); }));
  }
  // the outside corners a part offers (the Break-Corner PropertyManager highlights and picks them): [{ at, top, bot, faces }]
  function breakCornerCandidates(body, model) {
    var sheet = model && resolvedModel(model).model.sheet;
    if (!body || !sheet) return [];
    return sheetCorners(body, +sheet.thickness).corners.map(function (c) { return { at: c.at, top: c.top, bot: c.bot, faces: c.faces, alpha: c.alpha }; });
  }
  // Break-Corner1, Break-Corner2, … (the rebuild's name table does not know the type)
  function breakCornerName(model) {
    var max = 0;
    (model.features || []).forEach(function (g) { var mm = /^Break-Corner(\d+)$/.exec(g.name || ''); if (mm && +mm[1] > max) max = +mm[1]; });
    return 'Break-Corner' + (max + 1);
  }
  K.registerFeature('breakCorner', {
    cut: true,
    build: buildBreakCorner,
    script: function (f, v, idVar, optsStr) {
      function pts(list) { return (list || []).map(function (p) { return p.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }); }
      var o = { kind: f.kind || 'chamfer' };
      if (f.faces && f.faces.length) o.faces = pts(f.faces);
      o.name = f.name;
      return 'var ' + v + ' = p.breakCorner(' + (K.isExpression(f.size) ? JSON.stringify(f.size) : String(f.size)) + ', ' + JSON.stringify(pts(f.corners)) + ', ' + optsStr(o) + ').last();';
    }
  });


  // ------------------------------------------------------------------ Rip (lane DI)
  // SolidWorks' Sheet Metal ▸ Rip: a slot `gap` wide along a picked corner edge, through the thickness, so the two
  // walls meeting there separate and the flat can unfold both. Feature JSON { type: 'rip', edges: [{ at: [x, y, z],
  // direction? }] (a point on the corner's outside or inside edge), gap, direction: 'both' | 'side1' | 'side2', name }.
  // The corner is modelled from the edge's two flat faces: wall 1 / wall 2 (ordered so (n1 × n2)·d > 0, d the edge
  // direction with its largest component positive) are the bands n_i·(p − O) ∈ [−T, 0] behind the outside corner line O.
  //   side1  wall 1 keeps the corner square, wall 2 is cut back `gap` from wall 1's inside face (removes gap·T per length)
  //   side2  the other way round
  //   both   SolidWorks (2022, 2026-11-02, rfGD): no slit: both walls stop square, S = T + g·sin(θ/2) from the outer corner
  //          (T + g/√2 at 90°; θ the angle between the normals; g is what is left between the two inside corners)
  // A corner that is already open on one side (a Closed Corner's gap: the square belongs to one wall only) can only be
  // ripped on that side: the slot widens the gap to `gap`, whatever the direction. The cut runs the corner's whole
  // length, past the walls through a floor the outer edge runs on across (SolidWorks: a shelled box's bottom is notched
  // by exactly the same section; an inside edge rips the same outer corner). A floor alone is not a corner to rip. T is
  // the sheet thickness, or (a part with no sheet, e.g. a shelled box) the distance from the edge's face to the face behind it.
  // A registered cut (as Break Corner): Kernel.ripLayout gives plain prisms for both kernels.
  var RIP_DIRECTIONS = ['both', 'side1', 'side2'];
  function ripDefaultGap(model) { return model && model.units === 'mm' ? 0.1 : 0.004; }
  function ripLayout(f, model, ctx) {
    var body = ctx.body;
    if (!body || !body.polygons || !body.polygons.length) throw new Error('Rip: there is nothing to rip yet.');
    var gap = +f.gap;
    if (!(gap > 0) || !isFinite(gap)) throw new Error('Rip: the gap must be a positive number.');
    if (!f.edges || !f.edges.length) throw new Error('Rip: pick the corner edges to rip.');
    var sheet = model.sheet && resolvedModel(model).model.sheet, Ts = sheet ? +sheet.thickness : NaN;
    var mesh = meshFromBody(coplanarBody(body)), edges = bodyEdges(mesh), inside = body.pointTester();
    var tol = model.units === 'in' ? 0.01 : 0.25, tools = [], corners = [];
    f.edges.forEach(function (spec) {
      var at = spec.at || spec, dir = spec.direction || f.direction || 'both';
      if (RIP_DIRECTIONS.indexOf(dir) < 0) throw new Error('Rip: the direction must be "both", "side1" or "side2".');
      var hit = resolveEdges([{ at: at, chain: true }], edges, tol), e = hit[0];
      if (!e) throw new Error('Rip: there is no edge at ' + bcPt(at) + '.');
      if (e.faces.length !== 2 || e.smooth || e.convex == null) throw new Error('Rip: the edge at ' + bcPt(at) + ' is not a corner between two flat faces.');
      var d = e.dir.slice(), big = 0;
      for (var k = 1; k < 3; k++) if (Math.abs(d[k]) > Math.abs(d[big]) + 1e-9) big = k;
      if (d[big] < 0) d = scale(d, -1);
      var n1 = e.normals[0].slice(), n2 = e.normals[1].slice();
      if (!e.convex) { n1 = scale(n1, -1); n2 = scale(n2, -1); }
      if (Math.abs(dot(n1, d)) > 1e-6 || Math.abs(dot(n2, d)) > 1e-6) throw new Error('Rip: the edge at ' + bcPt(at) + ' is not a corner between two flat faces.');
      if (dot(cross(n1, n2), d) < 0) { var sw = n1; n1 = n2; n2 = sw; }
      var c = dot(n1, n2);
      if (Math.abs(c) > 0.97) throw new Error('Rip: the faces at ' + bcPt(at) + ' do not make a corner.');
      // the wall thickness: the sheet's, else the nearest face parallel behind the edge's first face
      var T = Ts;
      if (!(T > 0)) {
        T = Infinity;
        var ref = e.convex ? n1 : scale(n1, -1), w0 = dot(ref, e.a);
        mesh.faces.forEach(function (g) {
          if (dot(g.normal, ref) > -1 + 1e-9) return;
          var t = w0 + g.w;   // g: −ref·x = w_g, so ref·x = −w_g and the depth behind is w0 + w_g
          if (t > 1e-7 && t < T) T = t;
        });
        if (!isFinite(T)) throw new Error('Rip: cannot find the wall thickness at ' + bcPt(at) + '.');
      }
      var O = e.convex ? e.a.slice() : add(e.a, scale(add(n1, n2), T / (1 + c)));
      function P(a, b, s) { var al = (a - b * c) / (1 - c * c), be = (b - a * c) / (1 - c * c); return add(add(O, add(scale(n1, al), scale(n2, be))), scale(d, s)); }
      // the edge's extent (the collinear pieces of it), split where a face across the edge starts or stops
      var s0 = Infinity, s1 = -Infinity;
      hit.forEach(function (h) {
        if (Math.abs(dot(h.dir, d)) < 1 - 1e-9) return;
        var off = sub(h.a, e.a), lat = sub(off, scale(e.dir, dot(off, e.dir)));
        if (len(lat) > 1e-6) return;
        [h.a, h.b].forEach(function (q) { var s = dot(sub(q, O), d); if (s < s0) s0 = s; if (s > s1) s1 = s; });
      });
      // an inside edge stops at the floor; the corner it stands for runs on to the outer edge's end
      if (!e.convex) edges.forEach(function (h) {
        if (Math.abs(dot(h.dir, d)) < 1 - 1e-9) return;
        var off = sub(h.a, O);
        if (len(sub(off, scale(d, dot(off, d)))) > 1e-6) return;
        [h.a, h.b].forEach(function (q) { var s = dot(sub(q, O), d); if (s < s0) s0 = s; if (s > s1) s1 = s; });
      });
      var cuts = [s0, s1], step = 1e-7 * (1 + Math.abs(s1 - s0));
      mesh.faces.forEach(function (g) {
        var nd = dot(g.normal, d);
        if (Math.abs(nd) < 1 - 1e-9) return;
        var s = (g.w - dot(g.normal, O)) / nd;
        if (s > s0 + step && s < s1 - step && cuts.every(function (q) { return Math.abs(q - s) > step; })) cuts.push(s);
      });
      cuts.sort(function (x, y) { return x - y; });
      var L = T + 2 * gap, dl = 1e-3 * T, runs = [];
      for (var i = 0; i + 1 < cuts.length; i++) {
        var sm = (cuts[i] + cuts[i + 1]) / 2;
        var ok = inside(P(-T / 2, -T / 2, sm)) && inside(P(-T / 2, -T - L, sm)) && inside(P(-T - L, -T / 2, sm));
        if (!ok) continue;
        var floor = inside(P(-1.5 * T, -1.5 * T, sm));   // solid inside the corner: a floor the walls stand on
        var j1 = inside(P(-T / 2, -T - dl, sm)), j2 = inside(P(-T - dl, -T / 2, sm));
        if (!j1 && !j2) continue;
        var last = runs[runs.length - 1];
        if (last && Math.abs(last.b - cuts[i]) <= step && last.j1 === j1 && last.j2 === j2) { last.b = cuts[i + 1]; last.walls = last.walls || !floor; last.floor = last.floor || floor; }
        else runs.push({ a: cuts[i], b: cuts[i + 1], j1: j1, j2: j2, walls: !floor, floor: floor });
      }
      runs = runs.filter(function (r) { return r.walls; });
      if (!runs.length) throw new Error('Rip: the edge at ' + bcPt(at) + ' is not a corner where two walls meet.');
      var X = n1.slice(), Y = cross(d, X), plane = { origin: O, x: X, y: Y, n: d }, eps = 0.1 * T;
      function uv(p) { var q = sub(p, O); return [dot(q, X), dot(q, Y)]; }
      runs.forEach(function (r) {
        var side = dir;
        if (!r.j2) side = 'side1'; else if (!r.j1) side = 'side2';   // already open on one side: widen that gap
        // where the cut goes through a floor it stops exactly at the wall's inside face (no eps past it, into the floor)
        var pts, probe, rim = r.floor ? -T : -T - eps;
        if (side === 'side1') { pts = [P(-T, eps, 0), P(-T - gap, eps, 0), P(-T - gap, rim, 0), P(-T, rim, 0)]; probe = function (s) { return P(-T - gap / 2, -T / 2, s); }; }
        else if (side === 'side2') { pts = [P(eps, -T, 0), P(eps, -T - gap, 0), P(rim, -T - gap, 0), P(rim, -T, 0)]; probe = function (s) { return P(-T / 2, -T - gap / 2, s); }; }
        else {
          var S = T + gap * Math.sqrt((1 - c) / 2);
          pts = [P(eps, eps, 0), P(-S, eps, 0), P(-S, -S, 0), P(eps, -S, 0)];
          probe = function (s) { return P(-T / 2, -T / 2, s); };
        }
        var loop = pts.map(uv);
        if (signedArea(loop) < 0) loop.reverse();
        // run past an end into air (no shared face with the rim); stop flush where the part goes on (a box's bottom)
        var a = r.a, b = r.b, ex = 1e-3 * T;
        if (!inside(probe(r.a - ex)) && !inside(P(-T / 2, -T / 2, r.a - ex))) a -= eps;
        if (!inside(probe(r.b + ex)) && !inside(P(-T / 2, -T / 2, r.b + ex))) b += eps;
        tools.push({ plane: plane, pts: loop, a: a, b: b, side: side, length: r.b - r.a });
      });
      corners.push({ at: at, a: add(O, scale(d, runs[0].a)), b: add(O, scale(d, runs[runs.length - 1].b)), T: T });
    });
    return { tools: tools, corners: corners };
  }
  function buildRip(f, model, ctx) {
    var lay = ripLayout(f, model, ctx);
    return unionAll(lay.tools.map(function (t) { return prism(t.pts, t.plane, t.a, t.b, f.id); }));
  }
  K.registerFeature('rip', {
    cut: true,
    build: buildRip,
    script: function (f, v, idVar, optsStr) {
      function pt(p) { return p.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }
      var eds = (f.edges || []).map(function (e) { var p = pt(e.at || e); return e.direction ? { at: p, direction: e.direction } : p; });
      var o = {};
      if (f.direction && f.direction !== 'both') o.direction = f.direction;
      o.name = f.name;
      return 'var ' + v + ' = p.rip(' + JSON.stringify(eds) + ', ' + (K.isExpression(f.gap) ? JSON.stringify(f.gap) : String(f.gap)) + ', ' + optsStr(o) + ').last();';
    }
  });
  K.ripLayout = ripLayout; K.buildRip = buildRip; K.RIP_DIRECTIONS = RIP_DIRECTIONS.slice(); K.ripDefaultGap = ripDefaultGap;

  // ------------------------------------------------------------------ Vent (lane DT)
  // SolidWorks' Sheet Metal ▸ Vent (also Insert ▸ Fastening Feature ▸ Vent): from one sketch on a flat sheet face, the
  // region inside the Boundary (a closed contour) is cut through the sheet except the Ribs (strips of ribWidth centred
  // on lines / arcs), the Spars (strips of sparWidth centred on circles / closed contours / lines / arcs) and the
  // Fill-In Boundary (a closed contour whose inside, grown by fillWidth / 2, stays solid). Feature JSON { type: 'vent',
  // sketch, boundary: [entity indices], ribs: [...], spars: [...], fill: [...], ribWidth, sparWidth, fillWidth, radius,
  // name }; empty / absent groups: ventAutoGroups (largest closed entity = boundary, lines = ribs, other closed = spars).
  // Sheet metal: draft 0, rib / spar depth = T, offset 0. A cut (registered below); `radius` (fillets between ribs,
  // spars and the boundary) is stored but not built yet.
  // Exactness: every full circle is tessellated with vertices where the other strips' edges and circles cross it, so
  // each chord the cut keeps is a whole chord tagged as a true cylinder (massProps exact, flat chords equal per arc).
  function ventClosed(e) {
    if (!e || e.t === 'line' || e.t === 'arc' || e.t === 'point' || e.t === 'text') return false;
    var pl = K.entityPolylines(e) || [];
    return pl.length > 0 && pl.every(function (q) { return q.closed; });
  }
  function ventUsable(sketch, e) { return e && !e.construction && e.t !== 'point' && e.t !== 'text' && !K.noProfileEntity(sketch, e); }
  function ventEntityArea(e) { var pl = (K.entityPolylines(e) || [])[0]; return pl ? Math.abs(signedArea(pl.pts)) : 0; }
  // the default groups of a vent sketch (the PropertyManager fills its boxes with them)
  function ventAutoGroups(sketch) {
    var out = { boundary: [], ribs: [], spars: [], fill: [] }, best = -1, bestA = 0;
    (sketch.entities || []).forEach(function (e, i) {
      if (!ventUsable(sketch, e)) return;
      if (ventClosed(e)) { var A = ventEntityArea(e); if (A > bestA) { bestA = A; best = i; } }
    });
    (sketch.entities || []).forEach(function (e, i) {
      if (!ventUsable(sketch, e) || i === best) return;
      if (e.t === 'line') out.ribs.push(i);
      else out.spars.push(i);
    });
    if (best >= 0) out.boundary.push(best);
    return out;
  }
  function ventGroups(f, sketch) {
    var auto = !(f.boundary && f.boundary.length), g = auto ? ventAutoGroups(sketch) : f, n = (sketch.entities || []).length, seen = {};
    var out = {};
    ['boundary', 'ribs', 'spars', 'fill'].forEach(function (k) {
      out[k] = (g[k] || []).map(function (i) {
        i = +i;
        if (!(i >= 0 && i < n) || i !== Math.floor(i)) throw new Error('Vent: the sketch has no entity ' + (i + 1) + ' any more (edit the vent and pick its entities again).');
        if (!ventUsable(sketch, sketch.entities[i])) throw new Error('Vent: entity ' + (i + 1) + ' of the sketch is construction geometry or a point.');
        if (seen[i]) throw new Error('Vent: entity ' + (i + 1) + ' is in two groups.');
        seen[i] = true;
        return i;
      });
    });
    if (!out.boundary.length) throw new Error('Vent: the sketch needs a closed boundary (a circle, rectangle or closed contour).');
    return out;
  }
  function ventCircleOf(e) { return e && e.t === 'circle' ? { c: [+e.cx, +e.cy], r: +e.r } : null; }
  // loops of some entities (sketchProfile of just them): [{ pts (CCW), seg, curves, depth }]
  function ventLoops(sketch, idx, what) {
    var sub = {}; for (var k in sketch) if (k !== 'profile' && k !== 'entities') sub[k] = sketch[k];
    sub.entities = idx.map(function (i) { return sketch.entities[i]; });
    var prof = _.sketchProfile(sub);
    if (!prof.loops.length) throw new Error('Vent: the ' + what + ' is not a closed contour.');
    prof.loops.forEach(function (l) { if (l.cross || l.meet) throw new Error('Vent: the ' + what + ' crosses itself.'); });
    return prof.loops.map(function (l) { return { pts: l.pts, seg: l.seg || null, curves: prof.curves || [], depth: l.depth }; });
  }
  function ventCCW(pts) { return signedArea(pts) < 0 ? pts.slice().reverse() : pts; }
  // a band of width w centred on an open line / arc entity: { outer: loop } (arc: sides tagged as circles)
  function ventStrip(e, w, ext) {
    var h = w / 2;
    if (e.t === 'line') {
      var P = [+e.x1, +e.y1], Q = [+e.x2, +e.y2], L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
      if (!(L > 1e-12)) return null;
      var d = [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L], m = [-d[1], d[0]], e0 = ext[0] ? h : 0, e1 = ext[1] ? h : 0;
      var A = [P[0] - d[0] * e0, P[1] - d[1] * e0], B = [Q[0] + d[0] * e1, Q[1] + d[1] * e1];
      return { outer: { pts: ventCCW([[A[0] - m[0] * h, A[1] - m[1] * h], [B[0] - m[0] * h, B[1] - m[1] * h], [B[0] + m[0] * h, B[1] + m[1] * h], [A[0] + m[0] * h, A[1] + m[1] * h]]), seg: null, curves: [] }, holes: [] };
    }
    if (e.t === 'arc') {
      var a0 = +e.a0, a1 = +e.a1; if (a1 <= a0) a1 += 360;
      var c = [+e.cx, +e.cy], ro = +e.r + h, ri = +e.r - h;
      if (!(ri > 0)) throw new Error('Vent: a strip of width ' + w + ' does not fit an arc of radius ' + e.r + '.');
      var nS = Math.max(2, Math.ceil(_.segsForRadius(ro) * (a1 - a0) / 360)), pts = [], seg = [], cO = { c: c, r: ro }, cI = { c: c, r: ri }, i, an;
      for (i = 0; i <= nS; i++) { an = (a0 + (a1 - a0) * i / nS) * Math.PI / 180; pts.push([c[0] + ro * Math.cos(an), c[1] + ro * Math.sin(an)]); seg.push(i < nS ? 0 : -1); }
      for (i = nS; i >= 0; i--) { an = (a0 + (a1 - a0) * i / nS) * Math.PI / 180; pts.push([c[0] + ri * Math.cos(an), c[1] + ri * Math.sin(an)]); seg.push(i > 0 ? 1 : -1); }
      return { outer: { pts: pts, seg: seg, curves: [cO, cI] }, holes: [] };
    }
    return null;
  }
  // circle ∩ infinite line through A, B -> angles; circle ∩ circle -> angles (on the first)
  function ventLineHits(C, A, B) {
    var dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    if (!(L2 > 1e-24)) return [];
    var fx = A[0] - C.c[0], fy = A[1] - C.c[1], b = fx * dx + fy * dy, cc = fx * fx + fy * fy - C.r * C.r, disc = b * b - L2 * cc;
    if (disc < 0) return [];
    var s = Math.sqrt(disc), out = [];
    [(-b - s) / L2, (-b + s) / L2].forEach(function (t) {
      if (t < -1e-9 || t > 1 + 1e-9) return;
      out.push(Math.atan2(fy + t * dy, fx + t * dx));
    });
    return out;
  }
  function ventCircleHits(C, D) {
    var dx = D.c[0] - C.c[0], dy = D.c[1] - C.c[1], d = Math.hypot(dx, dy);
    if (d < 1e-12 || d > C.r + D.r || d < Math.abs(C.r - D.r)) return [];
    var a = (C.r * C.r - D.r * D.r + d * d) / (2 * d), base = Math.atan2(dy, dx), t = Math.acos(Math.max(-1, Math.min(1, a / C.r)));
    return [base - t, base + t];
  }
  // a full circle as a CCW loop with vertices at the break angles, equal chords between them (≤ 2π / segsForRadius)
  function ventCircleLoop(C, breaks) {
    var TAU = 2 * Math.PI, N = _.segsForRadius(C.r), angs = breaks.map(function (a) { return ((a % TAU) + TAU) % TAU; }).sort(function (p, q) { return p - q; });
    var u = [];
    angs.forEach(function (a) { if (!u.length || a - u[u.length - 1] > 1e-9) u.push(a); });
    if (u.length > 1 && u[0] + TAU - u[u.length - 1] <= 1e-9) u.pop();
    if (!u.length) u = [0];
    var pts = [], cur = { c: C.c, r: C.r, full: true };
    for (var i = 0; i < u.length; i++) {
      var a0 = u[i], a1 = i + 1 < u.length ? u[i + 1] : u[0] + TAU, k = Math.max(u.length === 1 ? 3 : 1, Math.ceil((a1 - a0) / (TAU / N) - 1e-9));
      for (var j = 0; j < k; j++) { var an = a0 + (a1 - a0) * j / k; pts.push([C.c[0] + C.r * Math.cos(an), C.c[1] + C.r * Math.sin(an)]); }
    }
    return { pts: pts, seg: pts.map(function () { return 0; }), curves: [cur] };
  }
  // a loop reversed (its seg follows its edges)
  function ventReverse(l) {
    var n = l.pts.length, pts = l.pts.slice().reverse(), seg = null;
    if (l.seg) { seg = []; for (var j = 0; j < n; j++) seg.push(l.seg[((n - 2 - j) % n + n) % n]); }
    return { pts: pts, seg: seg, curves: l.curves };
  }
  // lane DT2: the fillet pieces of radius r for every convex corner of the open region (inside a boundary, outside every
  // keep). Shapes are the unrealized ones ({ circle } wrappers or loops); a tangent point on a { circle } wrapper is
  // added to its `breaks`. e: how far a piece runs into the metal (less than a quarter of the narrowest strip).
  // -> [{ outer: loop (straight sides, the fillet's chords tagged { c, r }), holes: [] }]
  function ventFillets(boundary, keep, r, e) {
    function has(l, p) { return l.circle ? Math.hypot(p[0] - l.circle.c[0], p[1] - l.circle.c[1]) < l.circle.r : pointInPoly(p, l.pts); }
    function open(p) {
      if (!boundary.some(function (l) { return has(l, p); })) return false;
      return !keep.some(function (k) { return has(k.outer, p) && !k.holes.some(function (h) { return has(h, p); }); });
    }
    // the curves bounding the open region: { k: 'seg', a, b } | { k: 'circ', c, R, obj? }
    var prims = [];
    function addShape(l) {
      if (l.circle) { prims.push({ k: 'circ', c: l.circle.c, R: l.circle.r, obj: l }); return; }
      var n = l.pts.length, seen = [];
      for (var i = 0; i < n; i++) {
        var kk = l.seg ? l.seg[i] : -1;
        if (kk < 0) prims.push({ k: 'seg', a: l.pts[i], b: l.pts[(i + 1) % n] });
        else if (seen.indexOf(kk) < 0) { seen.push(kk); prims.push({ k: 'circ', c: l.curves[kk].c, R: l.curves[kk].r }); }
      }
    }
    boundary.forEach(addShape);
    keep.forEach(function (k) { addShape(k.outer); k.holes.forEach(addShape); });
    function frame(P, V) {   // unit tangent and normal of a curve at V
      if (P.k === 'seg') { var dx = P.b[0] - P.a[0], dy = P.b[1] - P.a[1], L = Math.hypot(dx, dy); return { t: [dx / L, dy / L], n: [-dy / L, dx / L] }; }
      var rx = (V[0] - P.c[0]) / P.R, ry = (V[1] - P.c[1]) / P.R;
      return { t: [-ry, rx], n: [rx, ry] };
    }
    function hits(P, Q) {
      var out = [];
      if (P.k === 'seg' && Q.k === 'seg') {
        var d1 = [P.b[0] - P.a[0], P.b[1] - P.a[1]], d2 = [Q.b[0] - Q.a[0], Q.b[1] - Q.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
        if (Math.abs(den) < 1e-12 * (1 + Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1]))) return out;
        var w = [Q.a[0] - P.a[0], Q.a[1] - P.a[1]], s = (w[0] * d2[1] - w[1] * d2[0]) / den, t = (w[0] * d1[1] - w[1] * d1[0]) / den;
        if (s >= -1e-9 && s <= 1 + 1e-9 && t >= -1e-9 && t <= 1 + 1e-9) out.push([P.a[0] + s * d1[0], P.a[1] + s * d1[1]]);
        return out;
      }
      if (P.k === 'seg') { var X = P; P = Q; Q = X; }
      if (Q.k === 'seg') return ventLineHits({ c: P.c, r: P.R }, Q.a, Q.b).map(function (a) { return [P.c[0] + P.R * Math.cos(a), P.c[1] + P.R * Math.sin(a)]; });
      return ventCircleHits({ c: P.c, r: P.R }, { c: Q.c, r: Q.R }).map(function (a) { return [P.c[0] + P.R * Math.cos(a), P.c[1] + P.R * Math.sin(a)]; });
    }
    // the offset of curve P by r toward side s (of its normal at V) as a line { p, d } or a circle { c, R }
    function offset(P, fr, s, V) {
      if (P.k === 'seg') return { p: [V[0] + s * r * fr.n[0], V[1] + s * r * fr.n[1]], d: fr.t };
      return { c: P.c, R: P.R + s * r };
    }
    function meet(A, B) {
      var out = [];
      if (A.d && B.d) {
        var den = A.d[0] * B.d[1] - A.d[1] * B.d[0], w = [B.p[0] - A.p[0], B.p[1] - A.p[1]], s = (w[0] * B.d[1] - w[1] * B.d[0]) / den;
        out.push([A.p[0] + s * A.d[0], A.p[1] + s * A.d[1]]);
        return out;
      }
      if (A.c && B.d) { var X = A; A = B; B = X; }
      if (A.d) {
        var q = [A.p[0] - A.d[0], A.p[1] - A.d[1]], fx = q[0] - B.c[0], fy = q[1] - B.c[1], dx = 2 * A.d[0], dy = 2 * A.d[1];
        var aa = dx * dx + dy * dy, bb = fx * dx + fy * dy, cc = fx * fx + fy * fy - B.R * B.R, disc = bb * bb - aa * cc;
        if (disc < 0) return out;
        [(-bb - Math.sqrt(disc)) / aa, (-bb + Math.sqrt(disc)) / aa].forEach(function (t) { out.push([q[0] + t * dx, q[1] + t * dy]); });
        return out;
      }
      return ventCircleHits({ c: A.c, r: A.R }, { c: B.c, r: B.R }).map(function (a) { return [A.c[0] + A.R * Math.cos(a), A.c[1] + A.R * Math.sin(a)]; });
    }
    function foot(P, C) {
      if (P.k === 'seg') {
        var d = [P.b[0] - P.a[0], P.b[1] - P.a[1]], L2 = d[0] * d[0] + d[1] * d[1], t = ((C[0] - P.a[0]) * d[0] + (C[1] - P.a[1]) * d[1]) / L2;
        return [P.a[0] + t * d[0], P.a[1] + t * d[1]];
      }
      var vx = C[0] - P.c[0], vy = C[1] - P.c[1], vl = Math.hypot(vx, vy);
      return [P.c[0] + P.R * vx / vl, P.c[1] + P.R * vy / vl];
    }
    function metalDir(P, T, s) { var fr = frame(P, T); return [-s * fr.n[0], -s * fr.n[1]]; }
    var done = [], out = [], scl = 1;
    prims.forEach(function (P) { (P.k === 'seg' ? [P.a, P.b] : [P.c]).forEach(function (q) { scl = Math.max(scl, Math.abs(q[0]), Math.abs(q[1])); }); });
    var tol = 1e-9 * scl, dlt = Math.min(1e-4 * scl, 0.05 * r);
    for (var i = 0; i < prims.length; i++) for (var j = i + 1; j < prims.length; j++) {
      hits(prims[i], prims[j]).forEach(function (V) {
        if (done.some(function (q) { return Math.hypot(q[0] - V[0], q[1] - V[1]) < 1e3 * tol; })) return;
        var A = prims[i], B = prims[j], fa = frame(A, V), fb = frame(B, V);
        if (Math.abs(fa.t[0] * fb.t[1] - fa.t[1] * fb.t[0]) < 1e-6) return;
        var opens = [];
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (sg) {
          var p = [V[0] + dlt * (sg[0] * fa.n[0] + sg[1] * fb.n[0]), V[1] + dlt * (sg[0] * fa.n[1] + sg[1] * fb.n[1])];
          if (open(p)) opens.push(sg);
        });
        if (opens.length !== 1) return;
        done.push(V);
        var sa = opens[0][0], sb = opens[0][1], C = null, best = Infinity;
        meet(offset(A, fa, sa, V), offset(B, fb, sb, V)).forEach(function (q) { var dd = Math.hypot(q[0] - V[0], q[1] - V[1]); if (dd < best) { best = dd; C = q; } });
        var at = '(' + fmtN(V[0]) + ', ' + fmtN(V[1]) + ')';
        if (!C || best > 20 * r) throw new Error('Vent: a fillet radius of ' + fmtN(r) + ' does not fit the corner at ' + at + '.');
        var Ta = foot(A, C), Tb = foot(B, C), um = [V[0] - C[0], V[1] - C[1]], ul = Math.hypot(um[0], um[1]);
        var M = [C[0] + r * um[0] / ul, C[1] + r * um[1] / ul];
        if (!open([(M[0] + C[0]) / 2, (M[1] + C[1]) / 2]) || Math.hypot(Ta[0] - V[0], Ta[1] - V[1]) > 20 * r || Math.hypot(Tb[0] - V[0], Tb[1] - V[1]) > 20 * r)
          throw new Error('Vent: a fillet radius of ' + fmtN(r) + ' does not fit the corner at ' + at + '.');
        if (A.obj) (A.obj.breaks = A.obj.breaks || []).push(Math.atan2(Ta[1] - A.c[1], Ta[0] - A.c[0]));
        if (B.obj) (B.obj.breaks = B.obj.breaks || []).push(Math.atan2(Tb[1] - B.c[1], Tb[0] - B.c[0]));
        // the arc from Tb to Ta through M (the side facing V)
        var a0 = Math.atan2(Tb[1] - C[1], Tb[0] - C[0]), a1 = Math.atan2(Ta[1] - C[1], Ta[0] - C[0]), am = Math.atan2(um[1], um[0]), TAU = 2 * Math.PI;
        var sw = ((a1 - a0) % TAU + TAU) % TAU, smid = ((am - a0) % TAU + TAU) % TAU;
        if (smid > sw) sw -= TAU;
        var nS = Math.max(2, Math.ceil(Math.abs(sw) / (TAU / _.segsForRadius(r)) - 1e-9));
        var da = metalDir(A, Ta, sa), db = metalDir(B, Tb, sb), dv = [-(sa * fa.n[0] + sb * fb.n[0]), -(sa * fa.n[1] + sb * fb.n[1])], dvl = Math.hypot(dv[0], dv[1]);
        var pts = [Ta, [Ta[0] + e * da[0], Ta[1] + e * da[1]], [V[0] + e * dv[0] / dvl, V[1] + e * dv[1] / dvl], [Tb[0] + e * db[0], Tb[1] + e * db[1]], Tb], seg = [-1, -1, -1, -1];
        for (var k = 1; k < nS; k++) { var an = a0 + sw * k / nS; pts.push([C[0] + r * Math.cos(an), C[1] + r * Math.sin(an)]); }
        pts.forEach(function (p, idx) { if (idx >= 4) seg.push(0); });
        var loop = { pts: pts, seg: seg, curves: [{ c: C, r: r }] };
        if (signedArea(pts) < 0) loop = ventReverse(loop);
        out.push({ outer: loop, holes: [] });
      });
    }
    return out;
  }
  // ventLayout(f, model, ctx) -> { plane, a, b, boundary: [loop], keep: [{ outer: loop, holes: [loop] }], T, groups }
  // where loop = { pts (2D, CCW), seg (null | curve index per segment), curves: [{ c, r, full? }] }; plain data, built
  // here (buildVent) and in occt-kernel.js with exact circles. ctx: { body, sketches, planes }.
  function ventLayout(f, model, ctx) {
    var sheet = model.sheet;
    if (!sheet) throw new Error('Vent needs a sheet-metal part: make a Base Flange first (Sheet Metal tab).');
    if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) throw new Error('Vent: there is no sheet to cut yet.');
    var T = +sheet.thickness;
    var sketch = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch);
    if (!sketch || sketch.type !== 'sketch') throw new Error('Vent: select the sketch with the vent\'s boundary, ribs and spars.');
    var plane = resolvePlane(sketch.plane, model, ctx.planes || {}), ents = sketch.entities || [], g = ventGroups(f, sketch);
    function width(v, what) { var w = +v; if (!(w > 0) || !isFinite(w)) throw new Error('Vent: the ' + what + ' width must be a positive number.'); return w; }
    var ribW = g.ribs.length ? width(f.ribWidth, 'rib') : 0, sparW = g.spars.length ? width(f.sparWidth, 'spar') : 0;
    var fillW = f.fillWidth != null && f.fillWidth !== '' ? +f.fillWidth : 0;
    if (!(fillW >= 0) || !isFinite(fillW)) throw new Error('Vent: the fill-in width must be zero or more.');
    if (f.radius != null && !(+f.radius >= 0)) throw new Error('Vent: the radius must be zero or more.');
    var circles = [], keep = [], boundary;
    function circ(C) { var o = { circle: C }; circles.push(o); return o; }
    // Boundary: one circle, or the closed contour(s) of its entities
    if (g.boundary.length === 1 && ventCircleOf(ents[g.boundary[0]])) boundary = [circ(ventCircleOf(ents[g.boundary[0]]))];
    else boundary = ventLoops(sketch, g.boundary, 'boundary').filter(function (l) { return l.depth === 0; });
    // the curves strip ends may stop on (an end within 1e-6 of one is run on by half the width)
    var stops = [];
    g.boundary.concat(g.spars, g.fill).forEach(function (i) { (K.entityPolylines(ents[i]) || []).forEach(function (q) { stops.push(q); }); });
    function onStop(p) {
      var tol = 1e-6 * (1 + Math.abs(p[0]) + Math.abs(p[1]));
      return stops.some(function (q) {
        var n = q.pts.length;
        for (var i = 0; i < (q.closed ? n : n - 1); i++) if (_.pointSegmentDistance([p[0], p[1], 0], [q.pts[i][0], q.pts[i][1], 0], [q.pts[(i + 1) % n][0], q.pts[(i + 1) % n][1], 0]) <= Math.max(tol, 2e-3 * ribW)) return true;
        return false;
      });
    }
    g.ribs.forEach(function (i) {
      var e = ents[i];
      if (e.t !== 'line' && e.t !== 'arc') throw new Error('Vent: a rib must be a line or an arc (entity ' + (i + 1) + ' is a ' + e.t + ').');
      var s = e.t === 'line' ? ventStrip(e, ribW, [onStop([+e.x1, +e.y1]), onStop([+e.x2, +e.y2])]) : ventStrip(e, ribW, [false, false]);
      if (s) keep.push(s);
    });
    g.spars.forEach(function (i) {
      var e = ents[i], C = ventCircleOf(e);
      if (C) {
        if (!(C.r - sparW / 2 > 0)) throw new Error('Vent: a spar of width ' + sparW + ' does not fit a circle of radius ' + C.r + '.');
        keep.push({ outer: circ({ c: C.c, r: C.r + sparW / 2 }), holes: [circ({ c: C.c, r: C.r - sparW / 2 })] });
      } else if (e.t === 'line' || e.t === 'arc') {
        var s = ventStrip(e, sparW, e.t === 'line' ? [onStop([+e.x1, +e.y1]), onStop([+e.x2, +e.y2])] : [false, false]);
        if (s) keep.push(s);
      } else {
        ventLoops(sketch, [i], 'spar').forEach(function (l) {
          keep.push({ outer: { pts: ventCCW(_.offsetLoop(l.pts, sparW / 2)), seg: null, curves: [] }, holes: [{ pts: ventCCW(_.offsetLoop(l.pts, -sparW / 2)), seg: null, curves: [] }] });
        });
      }
    });
    if (g.fill.length) {
      var F1 = g.fill.length === 1 ? ventCircleOf(ents[g.fill[0]]) : null;
      if (F1) keep.push({ outer: circ({ c: F1.c, r: F1.r + fillW / 2 }), holes: [] });
      else ventLoops(sketch, g.fill, 'fill-in boundary').forEach(function (l) {
        if (l.depth === 0) keep.push({ outer: fillW > 0 ? { pts: ventCCW(_.offsetLoop(l.pts, fillW / 2)), seg: null, curves: [] } : l, holes: [] });
      });
    }
    // break every circle where straight edges and the other circles cross it, then tessellate
    var lines = [];
    function addLines(l) { if (l.circle) return; var n = l.pts.length; for (var i = 0; i < n; i++) if (!l.seg || l.seg[i] < 0) lines.push([l.pts[i], l.pts[(i + 1) % n]]); }
    boundary.forEach(addLines);
    keep.forEach(function (k) { addLines(k.outer); k.holes.forEach(addLines); });
    // lane DT2: Geometry Properties radius: every convex corner of the open region (a concave corner of the metal)
    // gets a fillet piece (kept metal: the corner less the fillet disk, run a little into the metal); circles get a
    // vertex at the tangent points so the kept chords stay whole
    var rad = f.radius != null && f.radius !== '' ? +f.radius : 0, fills = [];
    if (rad > 0) {
      var widths = [rad];
      if (g.ribs.length) widths.push(ribW / 4);
      if (g.spars.length) widths.push(sparW / 4);
      if (fillW > 0) widths.push(fillW / 4);
      fills = ventFillets(boundary, keep, rad, Math.min.apply(null, widths));
    }
    function realize(l) {
      if (!l.circle) return l;
      var C = l.circle, br = (l.breaks || []).slice();
      lines.forEach(function (s) { Array.prototype.push.apply(br, ventLineHits(C, s[0], s[1])); });
      circles.forEach(function (o) { if (o !== l) Array.prototype.push.apply(br, ventCircleHits(C, o.circle)); });
      return ventCircleLoop(C, br);
    }
    boundary = boundary.map(realize);
    keep = keep.map(function (k) { return { outer: realize(k.outer), holes: k.holes.map(realize) }; }).concat(fills);
    // which side of the sketch plane the sheet is on: probe inside the boundary at mid-thickness
    var inside = ctx.body.pointTester(), n = norm(plane.n), side = 0;
    boundary.some(function (l) {
      return triangulate(l.pts).some(function (t) {
        var c2 = [(l.pts[t[0]][0] + l.pts[t[1]][0] + l.pts[t[2]][0]) / 3, (l.pts[t[0]][1] + l.pts[t[1]][1] + l.pts[t[2]][1]) / 3];
        var q = to3D(plane, c2[0], c2[1]), up = inside(add(q, scale(n, T / 2))), dn = inside(sub(q, scale(n, T / 2)));
        if (up !== dn) side = up ? 1 : -1;
        return side !== 0;
      });
    });
    if (!side) throw new Error('Vent: the sketch does not lie on a flat face of the sheet (sketch the vent on the face).');
    var eps = Math.max(0.01 * T, 1e-6);
    return { plane: plane, a: side > 0 ? -eps : -T - eps, b: side > 0 ? T + eps : eps, boundary: boundary, keep: keep, T: T, groups: g };
  }
  function ventPrism(l, plane, a, b, id) {
    return prism(l.pts, plane, a, b, id, l.seg ? l.seg.map(function (k) { return k >= 0 ? l.curves[k] : null; }) : null);
  }
  function buildVent(f, model, ctx) {
    var lay = ventLayout(f, model, ctx), e2 = 0.5 * (lay.b - lay.a);
    var tool = unionAll(lay.boundary.map(function (l) { return ventPrism(l, lay.plane, lay.a, lay.b, f.id); }));
    var keeps = lay.keep.map(function (k) {
      var s = ventPrism(k.outer, lay.plane, lay.a - e2, lay.b + e2, f.id);
      if (k.holes.length) s = s.subtract(unionAll(k.holes.map(function (h) { return ventPrism(h, lay.plane, lay.a - 2 * e2, lay.b + 2 * e2, f.id); })));
      return s;
    });
    if (keeps.length) tool = tool.subtract(unionAll(keeps));
    if (!tool.polygons.length) throw new Error('Vent: the ribs, spars and fill-in cover the whole boundary: nothing is cut.');
    return tool;
  }
  // { open, boundary, percent }: the flow area (the vent's open area) and the boundary's area, sketch units²
  function ventFlowArea(f, model, ctx) {
    var lay = ventLayout(f, model, ctx), tool = buildVent(f, model, ctx), h = lay.b - lay.a;
    var open = Math.abs(K.massProps(meshFromBody(tool)).volume) / h;
    var bnd = Math.abs(K.massProps(meshFromBody(unionAll(lay.boundary.map(function (l) { return ventPrism(l, lay.plane, lay.a, lay.b, f.id); })))).volume) / h;
    return { open: open, boundary: bnd, percent: bnd > 0 ? 100 * open / bnd : 0 };
  }
  K.registerFeature('vent', {
    cut: true,
    build: buildVent,
    script: function (f, v, idVar, optsStr) {
      var o = { sketch: '@' + idVar[f.sketch] };
      ['boundary', 'ribs', 'spars', 'fill'].forEach(function (k) { if (f[k] && f[k].length) o[k] = f[k].slice(); });
      ['ribWidth', 'sparWidth', 'fillWidth', 'radius'].forEach(function (k) { if (f[k] != null && f[k] !== '' && (k !== 'radius' && k !== 'fillWidth' || +f[k] !== 0 || K.isExpression(f[k]))) o[k] = f[k]; });
      o.name = f.name;
      return 'var ' + v + ' = p.vent(' + optsStr(o) + ').last();';
    }
  });
  K.ventLayout = ventLayout; K.buildVent = buildVent; K.ventAutoGroups = ventAutoGroups; K.ventFlowArea = ventFlowArea;

  // ------------------------------------------------------------------ Cross-Break (lane cross-break)
  // SolidWorks' Sheet Metal ▸ Cross-Break: an X on a planar sheet face, corner to corner, with a Radius, an Angle and a
  // direction. It is cosmetic: the solid, the volume and the blank never change; the lines show on the model and reach
  // the flat as BEND-layer marks with an UP / DOWN note. Feature JSON { type: 'crossBreak', face: [x, y, z] (a point on
  // the face), radius, angle (degrees), reverse (false = raised toward the picked face's normal), sketch? (a sketch on
  // the face: its solid lines replace the X, SolidWorks' Edit Cross-Break Sketch), name }.
  // A rebuild case stores the layout in ctx.planes[f.id] (refgeo 'crossBreak'), as reference geometry rides there; it is
  // plain data, and the flat reads it through crossBreakFlat with no flange record.
  // the four corners a face offers, in order round the loop: the outline points nearest the corners of its box, the box
  // squared to the longest edge (a rectangle's own corners; a trimmed corner gives the point nearest where it was)
  function crossBreakCorners(loop) {
    var p = straightLoop(loop), n = p.length, ex = [1, 0], best = -1, i;
    for (i = 0; i < n; i++) {
      var a = p[i], b = p[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > best) { best = l; ex = [(b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1)]; }
    }
    var ey = [-ex[1], ex[0]], lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    function uv(q) { return [q[0] * ex[0] + q[1] * ex[1], q[0] * ey[0] + q[1] * ey[1]]; }
    p.forEach(function (q) { var c = uv(q); for (var k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], c[k]); hi[k] = Math.max(hi[k], c[k]); } });
    return [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]].map(function (c) {
      var hit = p[0], bd = Infinity;
      p.forEach(function (q) { var s = uv(q), d = Math.hypot(s[0] - c[0], s[1] - c[1]); if (d < bd) { bd = d; hit = q; } });
      return hit;
    });
  }
  // the sketch's solid straight lines as 2D pairs in its own frame
  function crossBreakSketchLines(sk) {
    var out = [];
    (sk.entities || []).forEach(function (e) {
      if (!e || e.construction || e.infinite || e.t !== 'line') return;
      out.push([[+e.x1, +e.y1], [+e.x2, +e.y2]]);
    });
    return out;
  }
  // crossBreakLayout(f, model, { body, sketches, planes }) -> { refgeo: 'crossBreak', plane, n, at, lines: [{ a, b }]
  // (3D, on the face), corners, radius, angle, reverse }. Plain data.
  function crossBreakLayout(f, model, ctx) {
    var sheet = model.sheet;
    if (!sheet) throw new Error('Cross-Break needs a sheet-metal part: make a Base Flange first (Sheet Metal tab).');
    if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) throw new Error('Cross-Break: there is no sheet to mark yet.');
    if (!f.face) throw new Error('Cross-Break: select a planar face of the sheet.');
    var T = +sheet.thickness, p = f.face, face = null, bd = 1e-3 * (1 + T);
    sheetCorners(ctx.body, T).faces.forEach(function (fr) {
      var off = Math.abs(dot(fr.plane.n, p) - fr.w);
      if (off > bd) return;
      var uv = to2D(fr.plane, p), inn = 0;
      fr.loops.forEach(function (l) { if (pointInPoly(uv, l)) inn++; });
      if (inn % 2 === 1) { bd = off; face = fr; }
    });
    if (!face) throw new Error('Cross-Break: there is no planar sheet face at ' + bcPt(p) + ': select a flat face of the sheet.');
    var outer = face.loops[0], area = 0;
    face.loops.forEach(function (l) { var s = Math.abs(signedArea(l)); if (s > area) { area = s; outer = l; } });
    var c = crossBreakCorners(outer), plane = face.plane, n = plane.n, lines = [];
    function P3(q) { return to3D(plane, q[0], q[1]); }
    function push(a, b) { if (len(sub(a, b)) > 1e-9) lines.push({ a: a, b: b }); }
    var sk = f.sketch != null ? (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch) : null;
    if (sk && sk.type === 'sketch') {
      var pl = resolvePlane(sk.plane, model, ctx.planes || {});
      crossBreakSketchLines(sk).forEach(function (s) {
        var ends = s.map(function (q) { var Q = to3D(pl, q[0], q[1]); return sub(Q, scale(n, dot(n, Q) - face.w)); });
        push(ends[0], ends[1]);
      });
    }
    if (!lines.length) { push(P3(c[0]), P3(c[2])); push(P3(c[1]), P3(c[3])); }
    return { refgeo: 'crossBreak', plane: plane, n: n.slice(), at: p.slice(), lines: lines, corners: c.map(P3), radius: +f.radius, angle: +f.angle, reverse: !!f.reverse };
  }
  // the marks of every Cross-Break, added to the flat's etch items as { t: 'line', a, b, crossBreak: feature id, up,
  // angle, R, note: true on a feature's first line } (so a Flat-Pattern orientation moves them with the rest);
  // exportDXFFlat writes them on BEND with the note on NOTES. UP = raised toward the side the flat is seen from.
  function crossBreakFlat(model, build, faceRecs, T, warn, items) {
    model.features.forEach(function (f) {
      if (f.type !== 'crossBreak' || f.suppressed || (build.errors && build.errors[f.id])) return;
      var rec = build.planes && build.planes[f.id];
      if (!rec || !rec.lines) return;
      var w0 = dot(rec.n, rec.at), tol = 1e-5 * (1 + Math.abs(w0)), best = null;
      faceRecs.forEach(function (fr) {
        if (Math.abs(Math.abs(dot(rec.n, fr.normal)) - 1) > 1e-6) return;
        var off = dot(fr.normal, rec.at) - fr.w;
        if (Math.abs(off) > tol && Math.abs(off + T) > tol) return;
        var q = fr.map(sub(rec.at, scale(fr.normal, off))), k = 0;
        fr.loops.forEach(function (l) { if (pointInPoly(q, l)) k++; });
        if (!best || (k % 2 === 1 && !best.inside)) best = { fr: fr, inside: k % 2 === 1 };
      });
      if (!best) { warn((f.name || 'Cross-Break') + ': its face does not lie on a flat face of the sheet, so its marks are left out of the flat pattern.'); return; }
      var fr = best.fr, up = (dot(rec.n, fr.normal) > 0) !== !!rec.reverse;
      function drop(Q) { return fr.map(sub(Q, scale(fr.normal, dot(fr.normal, Q) - fr.w))); }
      rec.lines.forEach(function (l, i) {
        var it = { t: 'line', a: drop(l.a), b: drop(l.b), crossBreak: f.id, up: up, angle: rec.angle, R: rec.radius };
        if (!i) it.note = true;
        items.push(it);
      });
    });
  }
  // Cross-Break1, Cross-Break2, … (the rebuild's name table does not know the type)
  function crossBreakName(model) {
    var max = 0;
    (model.features || []).forEach(function (g) { var mm = /^Cross-Break(\d+)$/.exec(g.name || ''); if (mm && +mm[1] > max) max = +mm[1]; });
    return 'Cross-Break' + (max + 1);
  }
  K.registerFeature('crossBreak', {
    cut: false,
    script: function (f, v, idVar, optsStr) {
      var o = { radius: f.radius, angle: f.angle };
      if (f.reverse) o.reverse = true;
      if (f.sketch != null) o.sketch = '@' + idVar[f.sketch];
      o.name = f.name;
      return 'var ' + v + ' = p.crossBreak(' + JSON.stringify(f.face.map(function (x) { return Math.round(x * 1e4) / 1e4; })) + ', ' + optsStr(o) + ').last();';
    }
  });
  K.crossBreakLayout = crossBreakLayout; K.crossBreakName = crossBreakName; _.crossBreakLayout = crossBreakLayout;

  // ------------------------------------------------------------------ Tab (lane DI)
  // Base Flange/Tab on a part that already has a sheet (SolidWorks names it Tab1): { type: 'extrude', sheetBase: true,
  // tab: true, linkT: true, sketch, reverse, name: 'Tab1' } — a boss of the sheet's thickness from a sketch on a sheet
  // face, merged into the part. The thickness is always the sheet's; the direction is INTO the sheet (the tab lies
  // flush with the face it was sketched on), `reverse` takes it away from the face instead. tabFeature returns the
  // resolved copy both kernels extrude (depth T, blind, one direction).
  function tabFeature(f, model, plane, body) {
    var sheet = model.sheet;
    if (!sheet) throw new Error('Tab: the part has no sheet: make a Base Flange first.');
    var T = +sheet.thickness, n = plane.n, w = dot(n, plane.origin), into = null, tolW = 1e-6 * (1 + Math.abs(w)) + 1e-5 * T;
    (body && body.polygons || []).forEach(function (p) {
      if (into != null) return;
      var pn = [p.plane.normal.x, p.plane.normal.y, p.plane.normal.z], c = dot(pn, n);
      if (Math.abs(Math.abs(c) - 1) > 1e-9) return;
      if (Math.abs(c * p.plane.w - w) > tolW) return;
      into = c > 0;   // a face of the part on the sketch plane facing +n: the sheet lies behind, so the tab goes −n
    });
    if (into == null) throw new Error('Tab: sketch the tab on a flat face of the sheet.');
    var g = {};
    Object.keys(f).forEach(function (k) { g[k] = f[k]; });
    g.depth = T; g.end = 'blind'; g.dir2 = false; g.depth2 = 0;
    g.reverse = f.reverse ? !into : into;
    return g;
  }
  K.tabFeature = tabFeature; _.tabFeature = tabFeature;

  // ------------------------------------------------------------------ Closed Corner (lane CS)
  // SolidWorks' Sheet Metal ▸ Corners ▸ Closed Corner: where two flanges meet at a box corner and leave a gap (a wall
  // that stops short of its neighbour), the end faces of one flange (the faces to extend, picked) are extended to the
  // neighbouring wall (the matching face: the nearest flat face facing back at them, found automatically). Feature JSON
  // { type: 'closedCorner', faces: [[x, y, z], …] (points on the end faces to extend), cornerType: 'butt' | 'overlap' |
  // 'underlap', gap (default 0.01 in / 0.25 mm, at least CC_MIN_GAP: a smaller gap would weld the walls into one and the
  // flat could not unfold), ratio (overlap / underlap ratio, 0..1, default 1), coplanar (default true: every end face
  // in the picked face's plane that has a matching face is extended too), name }. Only the part of an end face that
  // sees the matching face is extended (the wall above its bend): the bend region stays open (SolidWorks' Open bend
  // region), unless `closeBend`: then both bends end on helicoids (rfGJ, in closedCornerLayout).
  //   butt      (lane DV, as SolidWorks 2022 measured: rfDU) both walls stop gap/√2 short of the other wall's inside
  //             face, so the gap between the two inside corners is `gap` measured diagonally (was: SolidWorks' Underlap)
  //   overlap   the extended wall runs over the matching wall's end, ratio·T into it (1: flush with its outside); the
  //             matching wall is trimmed back to `gap` from the extended wall's inside face
  //   underlap  the extended wall stops `gap` short of the matching wall's inside face (as butt) and the matching wall
  //             covers ratio·T of its thickness (1: the same as butt; less: the matching wall's end is trimmed back)
  // It adds material (and overlap / underlap trim the matching wall), so it is a rebuildModel case (kernel-rebuild.js)
  // that subtracts `cut` and unions `add`. The flat needs nothing new: the extended wall face unfolds with its new
  // outline (flatPattern lays each wall face's real outline), so the corner notch closes to the gap.
  var CC_TYPES = ['butt', 'overlap', 'underlap'];
  function ccMinGap(model) { return model && model.units === 'mm' ? 0.0254 : 0.001; }
  function ccDefaultGap(model) { return model && model.units === 'mm' ? 0.25 : 0.01; }
  // closedCornerLayout(f, model, ctx) -> { adds: [{ loop, plane, a, b }], cuts: [{ loop, plane, a, b }], corners:
  // [{ at, d, faceAt }] } — prisms of `loop` (2D in `plane`) from a to b along plane.n; plain data for both kernels.
  function closedCornerLayout(f, model, ctx) {
    var sheet = model.sheet;
    if (!sheet) throw new Error('Closed Corner needs a sheet-metal part: make a Base Flange first (Sheet Metal tab).');
    if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) throw new Error('Closed Corner: there are no flanges yet.');
    var T = +sheet.thickness, R = +sheet.bendRadius;
    var type = f.cornerType == null ? 'butt' : String(f.cornerType);
    if (CC_TYPES.indexOf(type) < 0) throw new Error('Closed Corner: the corner type must be butt, overlap or underlap.');
    var gap = f.gap == null ? ccDefaultGap(model) : +f.gap, minGap = ccMinGap(model);
    if (!isFinite(gap) || gap < 0) throw new Error('Closed Corner: the gap must be a number, zero or more.');
    if (gap < minGap - 1e-12) throw new Error('Closed Corner: a gap below ' + bcNum(minGap) + ' would join the two flanges into one (the flat could not unfold): use at least ' + bcNum(minGap) + '.');
    var ratio = type === 'butt' || f.ratio == null ? 1 : +f.ratio;
    if (!isFinite(ratio) || ratio < 0 || ratio > 1) throw new Error('Closed Corner: the overlap/underlap ratio must be between 0 and 1.');
    if (!f.faces || !f.faces.length) throw new Error('Closed Corner: pick the end faces of a flange to extend.');
    var mesh = meshFromBody(coplanarBody(ctx.body)), outl = {};
    function curved(face) { return (face.polys || []).some(function (p) { return !!p.surf; }); }
    // a face's components: each outer loop (CCW in the face's frame) with the holes inside it
    function comps(fi) {
      if (outl[fi] !== undefined) return outl[fi];
      var o = faceOutline(mesh, fi);
      if (!o || !o.loops.length) return (outl[fi] = []);
      var cl = faceLoopsClassified(o);
      return (outl[fi] = cl.outers.map(function (l, k) {
        return { fi: fi, k: k, plane: o.plane, outer: l, holes: cl.holes.filter(function (h) { return pointInPoly(h[0], l); }) };
      }));
    }
    function inComp(c, uv) { return pointInPoly(uv, c.outer) && !c.holes.some(function (h) { return pointInPoly(uv, h); }); }
    function moved(l, from, to) {   // a loop of plane `from` in the 2D frame of plane `to` (projected along to.n)
      var m = l.map(function (q) { return to2D(to, to3D(from, q[0], q[1])); });
      return signedArea(m) < 0 ? m.reverse() : m;
    }
    function bbox(l) { var b = [Infinity, Infinity, -Infinity, -Infinity]; l.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); return b; }
    var eps = Math.max(0.01 * T, 1e-6), ov = Math.min(0.5 * T, 0.25), dMax = 10 * T + 2 * R, tolV = 1e-4 * T * T * T;
    // the end-face components to extend: the one under each pick (plus, with `coplanar`, the others in its plane)
    var work = [], seen = {};
    f.faces.forEach(function (p, pi) {
      var best = null, bd = 1e-3 * (1 + T);
      mesh.faces.forEach(function (face, fi) {
        if (curved(face)) return;
        var off = Math.abs(dot(face.normal, p) - face.w);
        if (off > bd) return;
        comps(fi).forEach(function (c) { if (inComp(c, to2D(c.plane, p))) { bd = off; best = c; } });
      });
      if (!best) throw new Error('Closed Corner: there is no flat face at ' + bcPt(p) + ' any more.');
      var list = f.coplanar === false ? [best] : comps(best.fi);
      list.forEach(function (c) {
        var key = c.fi + ':' + c.k;
        if (seen[key]) { if (c === best) seen[key].picked = p; return; }
        work.push(seen[key] = { c: c, picked: c === best ? p : null });
      });
    });
    function rectLoop(wd, hd, wa, wb, ha, hb) {   // the rectangle w ∈ [wa, wb], h ∈ [ha, hb] of a (wd, hd) frame, CCW
      var r = [[wa, ha], [wb, ha], [wb, hb], [wa, hb]].map(function (q) { return [q[0] * wd[0] + q[1] * hd[0], q[0] * wd[1] + q[1] * hd[1]]; });
      return signedArea(r) < 0 ? r.reverse() : r;
    }
    function extent(l, dir) { var lo = Infinity, hi = -Infinity; l.forEach(function (q) { var t = q[0] * dir[0] + q[1] * dir[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); }); return [lo, hi]; }
    var adds = [], cuts = [], checks = [], corners = [], fills = [], wraps = [], ends = [], tester = null;
    // lane DV: the matching wall's bend at this corner, or null: base side in h (the end face reaches past the matching
    // wall's inside face there), axis R in front of the matching wall's inside face (d − R ≥ 0: the bend starts in the
    // end face's plane or in front of it), metal at mid-bend; its section frame for wrapCut / cylinderCutter
    function ccMatchBend(C, match, ch, d, wd, hd, Cp, ne, sg, to, wIn) {
      var hs, hb, dc = d - R, x0 = wIn + sg * R, N3 = Cp.n;
      if (ch[0] < match.mh[0] - 0.5 * T) { hs = -1; hb = match.mh[0]; } else if (ch[1] > match.mh[1] + 0.5 * T) { hs = 1; hb = match.mh[1]; } else return null;
      if (dc < -1e-6 * (1 + T) || !(sg * (x0 - match.bEnd) > 1e-6 * (1 + T))) return null;
      var O3 = to3D(Cp, 0, 0), hd3 = sub(to3D(Cp, hd[0], hd[1]), O3), wd3 = sub(to3D(Cp, wd[0], wd[1]), O3), bdir = scale(hd3, hs);
      function P3(w, h, off) { return add(to3D(Cp, w * wd[0] + h * hd[0], w * wd[1] + h * hd[1]), scale(N3, off)); }
      var rm = R + T / 2, c45 = Math.SQRT1_2;
      var at = add(P3((x0 + to) / 2 + sg * T, hb, dc), add(scale(bdir, rm * c45), scale(N3, rm * c45)));
      if (!tester) tester = ctx.body.pointTester();
      if (!tester(at)) return null;
      var y = scale(bdir, -1), n = cross(N3, y), sn = dot(wd3, n) > 0 ? 1 : -1, BA = Math.PI / 2 * (R + T / 2);
      var t0 = sn * x0, tE = sn * to, tFar = t0 - sg * sn * (Math.abs(x0 - match.bEnd) + R + 3 * T);
      var loop = [[0, t0], [BA, tE], [BA, tFar], [0, tFar]];
      if (signedArea(loop) < 0) loop.reverse();
      // rfGJ: the extended wall's own bend, its end in the end face's plane, when it starts on the same line (dc = 0): the
      // same section frame, x off the base toward that wall, t along N3 (`sf`: + or −)
      var ex = scale(wd3, -sg), ey = scale(hd3, -hs), en = cross(ex, ey);
      return { at: at, dir: scale(wd3, -sg), p0: P3(x0, hb, dc), pTo: P3(to, hb, dc), hb: hb, dc: dc,
        own: { plane: { origin: P3(x0, hb + hs * R, 0), x: ex, y: ey, n: en }, sec: { A: Math.PI / 2, R: R, T: T }, BA: BA, sf: dot(N3, en) > 0 ? 1 : -1 },
        wrap: { loop: loop, plane: { origin: P3(0, hb + hs * R, dc), x: N3.slice(), y: y, n: n }, sec: { A: Math.PI / 2, R: R, T: T }, BA: BA, ts: [t0, tE, sn * match.bEnd] } };
    }
    // lane rfIS (SolidWorks 2022, report 2026-11-02 5c): an end face flush with the other wall's inside face (d = 0: two
    // Material Outside walls that both stop at the corner) has nothing in front of it to close to. SolidWorks builds it as
    // if that other wall's end were picked: that end runs on to this wall's inside face and this wall's end is set back
    // gap/√2 (the same blank as that pick, 0.822070059 on the 16 ga tray). ccSwap -> the other wall's end face, or null
    function ccSwap(C, face) {
      var ne = face.normal, flush = mesh.faces.some(function (g) { return !curved(g) && dot(g.normal, ne) < -1 + 1e-6 && Math.abs(-g.w - face.w) <= 1e-6 * (1 + T); });
      if (!flush) return null;
      var cc = loopInteriorPoint(C.outer), P0 = cc ? to3D(C.plane, cc[0], cc[1]) : null, best = null;
      if (!P0) return null;
      mesh.faces.forEach(function (g, gi) {
        if (curved(g) || Math.abs(dot(g.normal, ne)) > 1e-6) return;
        comps(gi).forEach(function (M) {
          var q = loopInteriorPoint(M.outer), Q = q ? to3D(M.plane, q[0], q[1]) : null;
          if (!Q) return;
          var across = dot(ne, Q) - face.w;
          if (across < 0 || across > T + 1e-6) return;   // the other wall's end: on its side of the flush plane, within its thickness
          var toC = sub(P0, Q), dist = len(toC);
          if (!(dot(g.normal, toC) > 1e-6) || dist > dMax) return;
          if (!best || dist < best.dist) best = { c: M, at: Q, dist: dist };
        });
      });
      return best;
    }
    for (var wi = 0; wi < work.length; wi++) (function (wk) {
      var C = wk.c, face = mesh.faces[C.fi], ne = face.normal, Cp = C.plane, cb = bbox(C.outer), why = null;
      // the end face's frame: h along its longest straight edge (the wall's height), w across the wall's thickness
      var sl = straightLoop(C.outer), hd = null, hl = 0;
      for (var k = 0; k < sl.length; k++) {
        var p0 = sl[k], p1 = sl[(k + 1) % sl.length], l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (l > hl) { hl = l; hd = [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l]; }
      }
      if (!hd) return;
      var wd = [hd[1], -hd[0]], cw = extent(C.outer, wd), ch = extent(C.outer, hd);
      // matching faces: flat, facing back (−ne), in front of the end face within dMax, nearest first; the matching
      // wall's inside face either covers the end face (a wall that runs on to the corner) or stops beside it (both
      // walls stop at the corner: Bend Outside / Material Outside flanges), within dMax
      var cands = [];
      mesh.faces.forEach(function (g, gi) {
        if (curved(g) || dot(g.normal, ne) > -1 + 1e-6) return;
        var d = -g.w - face.w;
        if (d > 1e-6 && d <= dMax) cands.push({ gi: gi, d: d });
      });
      cands.sort(function (a, b) { return a.d - b.d; });
      var match = null;
      for (var i = 0; i < cands.length && !match; i++) {
        var d = cands[i].d;
        comps(cands[i].gi).forEach(function (M) {
          if (match) return;
          var Ml = moved(M.outer, M.plane, Cp), mw = extent(Ml, wd), mh = extent(Ml, hd);
          var h0 = Math.max(ch[0], mh[0]), h1 = Math.min(ch[1], mh[1]);
          if (h1 - h0 < 0.5 * T) return;   // not level with each other
          // the part of the end face level with the matching wall (the wall above the bend: the bend region stays open)
          var X = prism(C.outer, Cp, 0, T).intersect(prism(rectLoop(wd, hd, cw[0] - T, cw[1] + T, h0, h1), Cp, -eps, T + eps));
          C.holes.forEach(function (h) { X = X.subtract(prism(h, Cp, -eps, T + eps)); });
          if (!X.polygons.length || !(X.volume() > tolV)) return;
          var xm = meshFromBody(X), cap = -1, cwm = -Infinity;
          xm.faces.forEach(function (xf, xi) { if (dot(xf.normal, ne) > 0.999 && xf.w > cwm) { cwm = xf.w; cap = xi; } });
          var xo = cap >= 0 ? faceOutline(xm, cap) : null;
          if (!xo) return;
          var O = faceLoopsClassified(xo).outers.map(function (l) { return straightLoop(moved(l, xo.plane, Cp)); }).filter(function (l) { return l.length >= 3 && Math.abs(signedArea(l)) > 1e-6 * T * T; });
          if (!O.length) return;
          var ow = [Infinity, -Infinity];
          O.forEach(function (l) { var e = extent(l, wd); ow[0] = Math.min(ow[0], e[0]); ow[1] = Math.max(ow[1], e[1]); });
          if (ow[1] - ow[0] > 1.5 * T) { why = 'wide'; return; }   // wider than the sheet: not the end of a flange
          // the matching wall lies on the extended wall's inside; its end toward it must be within dMax of it
          var sg = (mw[0] + mw[1]) / 2 >= (ow[0] + ow[1]) / 2 ? 1 : -1, wIn = sg > 0 ? ow[1] : ow[0], wOut = sg > 0 ? ow[0] : ow[1];
          var bEnd = sg > 0 ? mw[0] : mw[1];
          if (sg * (bEnd - wIn) > dMax || sg * ((sg > 0 ? mw[1] : mw[0]) - wIn) < T) return;
          match = { d: d, O: O, h0: h0, h1: h1, mh: mh, sg: sg, wIn: wIn, wOut: wOut, bEnd: bEnd, tA: ow[1] - ow[0] };
        });
      }
      if (!match && wk.picked && !wk.swapped && why !== 'wide') {
        var sw = ccSwap(C, face);
        if (sw) {
          var skey = sw.c.fi + ':' + sw.c.k;
          if (!seen[skey]) work.push(seen[skey] = { c: sw.c, picked: sw.at, swapped: true });
          return;
        }
      }
      if (!match) {
        if (wk.picked) throw new Error(why === 'wide' ? 'Closed Corner: the face at ' + bcPt(wk.picked) + ' is not the end of a flange: pick the narrow face through the thickness where the flange stops at the corner.' :
          'Closed Corner: the face at ' + bcPt(wk.picked) + ' has no flange face across the corner to close to (within ' + bcNum(dMax) + '): pick the end face of the flange that stops short of the corner.');
        return;
      }
      // lane DV: SolidWorks' Butt stops both walls short, the gap measured diagonally between the two inside corners
      // (each wall end gap/√2 short of the other wall's inside face)
      var gb = gap / Math.SQRT2;
      var d = match.d, sg = match.sg, wIn = match.wIn, wOut = match.wOut, target = type === 'overlap' ? d + ratio * T : d - (type === 'butt' ? gb : gap);
      if (!(target > 1e-6)) {
        if (wk.picked) throw new Error('Closed Corner: the face at ' + bcPt(wk.picked) + ' is already within the gap (' + bcNum(d) + ' from the flange across the corner).');
        return;
      }
      match.O.forEach(function (Ol) {
        adds.push({ loop: Ol, plane: Cp, a: -ov, b: target });
        checks.push({ loop: Ol, plane: Cp, a: eps, b: target - (type === 'overlap' ? 0 : eps) });
      });
      // lane DK: Close bend region (SolidWorks' Open bend region cleared): the rest of the end face (the bend's end:
      // the pieces of the end face outside the level band that have arc chords) goes the same distance; `clip`: what
      // other material is in the way, and the gap in front of it along the extension, is left out (closedCornerFill)
      if (f.closeBend) {
        var Xb = prism(C.outer, Cp, 0, T).subtract(prism(rectLoop(wd, hd, cw[0] - T, cw[1] + T, match.h0, match.h1), Cp, -eps, T + eps));
        C.holes.forEach(function (h) { Xb = Xb.subtract(prism(h, Cp, -eps, T + eps)); });
        if (Xb.polygons.length && Xb.volume() > tolV) {
          var xbm = meshFromBody(Xb), bcap = -1, bwm = -Infinity;
          xbm.faces.forEach(function (xf, xi) { if (dot(xf.normal, ne) > 0.999 && xf.w > bwm) { bwm = xf.w; bcap = xi; } });
          var xbo = bcap >= 0 ? faceOutline(xbm, bcap) : null;
          if (xbo) faceLoopsClassified(xbo).outers.forEach(function (l) {
            var bl = straightLoop(moved(l, xbo.plane, Cp));
            if (bl.length > 4 && Math.abs(signedArea(bl)) > 1e-6 * T * T) { var fe = { loop: bl, plane: Cp, a: 0, b: target, clip: gap, n: ne.slice(), w: face.w, area: Xb.volume() / T }; fills.push(fe); (wk.fills = wk.fills || []).push(fe); }
          });
        }
      }
      // the matching wall's end goes to `to`: butt, flush with the extended wall's outside; overlap, `gap` short of its
      // inside face; underlap, covering ratio·T of its thickness. A wall that stops short of it is extended (its whole
      // height, T thick, overlapping ov into it); one that runs past it is trimmed back (and anything of it sticking out
      // past the extended wall's outside goes too).
      var to = type === 'overlap' ? wIn + sg * gap : (type === 'underlap' ? wIn - sg * ratio * match.tA : wIn + sg * gb);
      if (sg * (match.bEnd - to) > 1e-9) {
        adds.push({ loop: rectLoop(wd, hd, Math.min(to, match.bEnd + sg * ov), Math.max(to, match.bEnd + sg * ov), match.mh[0], match.mh[1]), plane: Cp, a: d, b: d + T });
        checks.push({ loop: rectLoop(wd, hd, Math.min(to, match.bEnd - sg * eps), Math.max(to, match.bEnd - sg * eps), match.mh[0] + eps, match.mh[1] - eps), plane: Cp, a: d + eps, b: d + T - eps });
      } else {
        var wa = Math.min(wOut - sg * T, to), wb = Math.max(wOut - sg * T, to);
        // lane DV: the matching wall's bend (a 90° bend from the base below the matching wall, its axis along w, its
        // start in the end face's plane or in front of it). SolidWorks: with the bend region closed it is cut square
        // with the wall (`to`); open, its end runs straight in the flat from the base corner (the extended wall's bend
        // start, wIn + sg·R, at the bend's start) to the wall's new end at the bend's end: a cut wrapped round the bend
        // (`wraps`, s across the bend 0..BA, t along its axis), and `ends` tells the flat where the strip now ends
        var be = ccMatchBend(C, match, ch, d, wd, hd, Cp, ne, sg, to, wIn);
        // rfGJ (SolidWorks 2022, every closed corner of ref2_corners.py): the bend region closes with two helicoids. Both
        // bends' ends run straight in (angle, t) from the base's corner on the bends' start lines to their wall's end: the
        // matching bend as the open region's (`be.wrap`), the extended one built from `taper`. Each end face is a helicoid
        // (cylinder areas and its own area to 6 digits); the flat stays square, so the folded part is lighter than blank × T
        // by the corner's L less those two triangles. Any other end (relief, bend started early) keeps the prism fill.
        var quarter = Math.PI / 4 * ((R + T) * (R + T) - R * R), fl0 = wk.fills || [];
        var plainEnd = be && f.closeBend && Math.abs(be.dc) < 1e-6 * (1 + T) && fl0.length === 1 && fl0[0].area > 0.3 * quarter && fl0[0].area < 1.03 * quarter;   // (part of the end lies against the matching bend's start)
        if (plainEnd) {
          if (wb - wa > 1e-9) cuts.push({ loop: rectLoop(wd, hd, wa, wb, match.h0, match.h1), plane: Cp, a: d - eps, b: d + T + eps });
          wraps.push(be.wrap);
          ends.push({ at: be.at, dir: be.dir, p0: be.pTo, p1: be.pTo });
          var own = be.own, tE = own.sf * target, tri = [[0, 0], [own.BA, tE], [0, tE]];
          if (signedArea(tri) < 0) tri.reverse();
          fl0[0].taper = { loop: tri, plane: own.plane, sec: own.sec, BA: own.BA, t0: Math.min(0, tE), t1: Math.max(0, tE) };
        } else if (be && f.closeBend) {
          cuts.push({ loop: rectLoop(wd, hd, wa, wb, Math.min(ch[0], match.mh[0]) - eps, Math.max(ch[1], match.mh[1]) + eps), plane: Cp, a: 0, b: d + T + eps });
          ends.push({ at: be.at, dir: be.dir, p0: be.pTo, p1: be.pTo });
        } else {
          if (wb - wa > 1e-9) cuts.push({ loop: rectLoop(wd, hd, wa, wb, match.h0, match.h1), plane: Cp, a: d - eps, b: d + T + eps });
          if (be) { wraps.push(be.wrap); ends.push({ at: be.at, dir: be.dir, p0: be.p0, p1: be.pTo }); }
        }
      }
      corners.push({ at: to3D(Cp, (cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2), d: d, faceAt: wk.picked });
    })(work[wi]);
    if (!adds.length) throw new Error('Closed Corner: nothing to close.');
    // the extensions must run through empty space (after the trim): anything else in their way is a flange that is
    // not the matching one (a hem, a tab), and a union would weld it on
    var rest = cuts.length ? ctx.body.subtract(unionAll(cuts.map(function (c) { return prism(c.loop, c.plane, c.a, c.b); }))) : ctx.body;
    checks.forEach(function (a) {
      var clash = rest.intersect(prism(a.loop, a.plane, a.a, a.b));
      if (clash.polygons.length && clash.volume() > tolV) throw new Error('Closed Corner: closing the corner at ' + bcPt(to3D(a.plane, a.loop[0][0], a.loop[0][1])) + ' would run into other material.');
    });
    return { adds: adds, cuts: cuts, fills: fills, wraps: wraps, ends: ends, corners: corners, type: type, gap: gap, ratio: ratio };
  }
  // lane DK: a bend-region fill (closedCornerLayout's fills) as a solid: the prism less `other` (the part after the
  // trim) and less `other` moved back by the gap along the extension, so the fill stops `gap` short of whatever it
  // meets (the bend of the flange across the corner) and only runs through empty space
  function closedCornerFill(t, other) {
    var P = prism(t.loop, t.plane, t.a, t.b);
    if (!other || !other.polygons.length) return P;
    var g = t.clip, back = other.transform(function (p) { return new CSG.Vector(p.x - g * t.n[0], p.y - g * t.n[1], p.z - g * t.n[2]); }, false);
    P = P.subtract(other);
    if (P.polygons.length) P = P.subtract(back);
    return P;
  }
  // buildClosedCorner(f, model, ctx) -> { add: CSG, cut: CSG | null } (the rebuild subtracts cut, then unions add)
  function buildClosedCorner(f, model, ctx) {
    var lay = closedCornerLayout(f, model, ctx);
    var tools = lay.cuts.map(function (t) { return prism(t.loop, t.plane, t.a, t.b, f.id); });
    var sectors = [], metal = [], fl = [];
    (lay.wraps || []).forEach(function (w) {   // lane DV
      var rb = ccWrapRebuild(w, ctx.body, f.id);
      if (rb) { sectors.push(rb.sector); metal.push(rb.metal); return; }
      var c = wrapCut([w.loop], w.sec, w.BA, w.plane, { shared: f.id, split: true }); if (c) tools.push(c);
    });
    var cut = tools.length + sectors.length ? unionAll(tools.concat(sectors)) : null;
    var adds = lay.adds.map(function (t) { return prism(t.loop, t.plane, t.a, t.b, f.id); });
    var add = unionAll(adds.concat(metal));
    if (ctx.flanges) ctx.flanges[f.id] = closedCornerEnds(lay.ends || [], model, ctx);
    if (lay.fills.length) {
      var rest = cut ? ctx.body.subtract(cut) : ctx.body;
      if (metal.length) rest = unionAll([rest].concat(metal));
      fl = lay.fills.map(function (t) {
        return t.taper ? wrapRegion([t.taper.loop], t.taper.sec, t.taper.BA, t.taper.plane, t.taper.t0, t.taper.t1, { shared: f.id }) : closedCornerFill(t, rest);
      }).filter(function (b) { return b.polygons.length; });
      if (fl.length) add = add.union(unionAll(fl));
      // the flat: the bend strip of the flange whose end was extended runs on by the same length (bendSurfaceNotches
      // then notches what the fill left out); flatPattern applies these to a copy of that flange's record
      if (ctx.flanges) ctx.flanges[f.id] = closedCornerStrips(lay.fills, model, ctx).concat(ctx.flanges[f.id] || []);
    }
    // lane FW: apply(body) -> the same solid as (body − cut) ∪ add, one tool at a time: the bends' ends cut out and their
    // metal put back first, then the wall cuts, then the extensions and fills. With several corners in one feature the
    // unioned tools touched on the bend's end planes and `add` itself came out cracked (Overlap on all four corners of
    // a 0.125 tray: 36 open edges); one at a time every swept tray in rfFW is closed. The rebuild should call it.
    function apply(body) {
      var b = body;
      sectors.forEach(function (s) { b = b.subtract(s); });
      metal.forEach(function (m) { b = b.union(m); });
      tools.forEach(function (c) { b = b.subtract(c); });
      adds.concat(fl).forEach(function (a) { b = b.union(a); });
      return b;
    }
    return { add: add, cut: cut, apply: apply };
  }
  // lane FW: an open bend region's slanted end (lane DV `wraps`) made without a wrapped tool, as lane FU's Fold does:
  // the matching bend from the slant's start to its end (w.ts: the slant's ends at s = 0 / BA, the bend's end) is cut out
  // (bendSector, exact radial planes) and its metal put back by wrapRegion (the band less the slant's far side). Cutting
  // the wrapped tool (twisted walls across the chord faces) left 1e-6 cracks (16 ga Overlap: 6 open / 1 non-manifold).
  // Only when that stretch is plain bend (its metal = the faceted section × the length); null otherwise (wrapCut then).
  function ccWrapRebuild(w, body, id) {
    if (!body || !w.ts) return null;
    var lo = Math.min.apply(null, w.ts), hi = Math.max.apply(null, w.ts), sec = w.sec, T = sec.T;
    if (!(hi - lo > 1e-6 * (1 + T))) return null;
    var segs = Math.max(4, Math.round(8 * sec.A / (Math.PI / 2)));
    var sector = bendSector(sec, w.plane, lo, hi), want = segs * (sec.R + T / 2) * T * Math.sin(sec.A / segs) * (hi - lo);
    var got = body.intersect(sector);
    if (!got.polygons.length || Math.abs(got.volume() - want) > 1e-7 * want) return null;
    var metal = wrapRegion([w.loop], sec, w.BA, w.plane, lo, hi, { shared: id });
    return metal ? { sector: sector, metal: metal } : null;
  }
  // lane DV: the bend records (of edge flanges before it) whose end the corner cut: [{ kind: 'ccEnd', feature, index,
  // end, t0, ext }] (how far past the record's end the strip now ends at the bend's start / at its end; negative =
  // shorter). The record: the edge flange's bend along `dir` holding the probe point `at`.
  function closedCornerEnds(list, model, ctx) {
    var T = +model.sheet.thickness, out = [];
    list.forEach(function (e) {
      model.features.forEach(function (g) {
        if (g.type !== 'flange' || !ctx.flanges[g.id]) return;
        ctx.flanges[g.id].forEach(function (r, j) {
          if (!r || r.kind !== 'edge' || !r.a || !r.b || !r.origin || !r.u || !r.o) return;
          var d = norm(sub(r.b, r.a)), dn = dot(d, e.dir);
          if (Math.abs(Math.abs(dn) - 1) > 1e-6 || !ufOnBend({ fi: r }, e.at, T)) return;
          var end = dn > 0 ? 1 : 0, P = end ? r.b : r.a;
          if (!out.some(function (o) { return o.feature === g.id && o.index === j && o.end === end; }))
            out.push({ kind: 'ccEnd', feature: g.id, index: j, end: end, t0: dot(sub(e.p0, P), e.dir), ext: dot(sub(e.p1, P), e.dir) });
        });
      });
    });
    return out;
  }
  // the bend records (of edge flanges before it) whose end lies in a filled end face: [{ kind: 'ccExtend', feature,
  // index, end: 0 | 1, by }] (plain data)
  function closedCornerStrips(fills, model, ctx) {
    var T = +model.sheet.thickness, tol = 1e-4 + 1e-3 * T, out = [];
    fills.forEach(function (t) {
      model.features.forEach(function (g) {
        if (g.type !== 'flange' || !ctx.flanges[g.id]) return;
        ctx.flanges[g.id].forEach(function (r, j) {
          if (!r || r.kind !== 'edge' || !r.a || !r.b) return;
          var d = norm(sub(r.b, r.a)), dn = dot(d, t.n);
          if (Math.abs(Math.abs(dn) - 1) > 1e-6) return;
          var end = dn > 0 && Math.abs(dot(t.n, r.b) - t.w) < tol ? 1 : (dn < 0 && Math.abs(dot(t.n, r.a) - t.w) < tol ? 0 : -1);
          if (end < 0) return;
          // the bend whose end the fill continues: its end point within R + 2T of the fill's outline
          var lo = to2D(t.plane, end ? r.b : r.a);
          if (!t.loop.some(function (q) { return Math.hypot(q[0] - lo[0], q[1] - lo[1]) < (+r.R || 0) + 2 * T + 1e-6; })) return;
          if (!out.some(function (o) { return o.feature === g.id && o.index === j && o.end === end; })) out.push({ kind: 'ccExtend', feature: g.id, index: j, end: end, by: t.b, square: !!t.taper });
        });
      });
    });
    return out;
  }
  // Closed Corner1, Closed Corner2, … (NAME_BASE.closedCorner)
  function closedCornerName(model) {
    var max = 0;
    (model.features || []).forEach(function (g) { var mm = /^Closed Corner(\d+)$/.exec(g.name || ''); if (mm && +mm[1] > max) max = +mm[1]; });
    return 'Closed Corner' + (max + 1);
  }

  // ------------------------------------------------------------------ sheet metal: Unfold / Fold (lane DB)
  // SolidWorks' Unfold / Fold: unfold some or all bends about a fixed face, cut across the flat, fold back.
  //   { type: 'unfold', fixedFace: [x, y, z] (a point on a flat face of the sheet; absent: the flat pattern's base
  //     face), bends: [[x, y, z] on a bend, ...] (empty / absent: every bend, "Collect All Bends") }
  //   { type: 'fold', bends: [...] (empty / absent: every bend the Unfold before it unfolded) }
  // Bend points are in the folded state (the PMs turn a pick on an unfolded strip into its bend's `at`).
  // How (no second unfold): flatPattern(…, { trace }) lays every face piece of the part in the flat with a rigid map
  // and each bend strip [0, BA] beside its parent face; those maps give, per face piece, a rigid motion F (folded →
  // flat, 3D) and Q (flat → unfolded state: the parent's across an unfolded bend, the folded relation across a bend
  // left folded). Unfold builds the flat solid (the blank × T: exactly the flat pattern) and moves its pieces by P·Q
  // (P keeps the fixed face where it was). Fold takes what was cut between the two (the unfolded solid less the
  // part now), moves each face piece of it back rigidly and wraps each strip's through-voids round its bend with
  // wrapCut (the map a cut made before a flange takes: s along the strip to the angle A·s/BA), and takes all that from
  // the folded part. The voids also ride on the bend records as `cutouts` (ctx.flanges[fold.id], kind 'foldCutouts'),
  // so the flat pattern of the folded part shows the cut exactly as it was made. Lane DJ: a blind cut across a strip
  // and material added between Unfold and Fold (a Boss-Extrude / Tab on the flat, past the blank's edge or on top)
  // are cut into layers of constant depth (ufLayers) and each wrapped the same way, carried radially (a layer off the
  // sheet keeps its depth: a boss on the outside of a bend lands at R + T … R + T + h); material in the sheet's plane
  // rides on the bend record as `adds` (kind 'foldAdds') so the flat pattern shows it. Another Unfold while one is
  // open folds the open one back and unfolds its bends and the new ones together (a Fold of some bends then folds
  // just those).
  function mInv(M) {
    var R = [0, 1, 2].map(function (i) { return [M.R[0][i], M.R[1][i], M.R[2][i]]; });
    return { R: R, t: scale(mDir({ R: R }, M.t), -1) };
  }
  // apply a fold's records to flatPattern's flange list: the cutouts join the record they belong to (a copy)
  // (lane DJ: kind 'foldAdds': material added across the flat strip, `adds` loops in the same [s, τ], joins the blank)
  function foldCutouts(flanges, ids, recs) {
    (recs || []).forEach(function (r) {
      var key = r && r.kind === 'foldCutouts' ? 'cutouts' : r && r.kind === 'foldAdds' ? 'adds' : r && r.kind === 'foldFills' ? 'fills' : null;
      if (!key || !r[key] || !r[key].length) return;
      for (var k = 0; k < flanges.length; k++) {
        var id = ids[k];
        if (id && id.feature === r.feature && id.index === r.index) {
          var o = {};
          o[key] = (flanges[k][key] || []).concat(r[key]);
          flanges[k] = Object.assign({}, flanges[k], o);
          return;
        }
      }
    });
  }
  // the flat's 3D frame: q (flat 2D) on the tracked surface, d deep into the sheet
  function ufFlat(tr) {
    var pl = tr.plane, nB = tr.nB, wB = tr.wB, sg = dot(nB, pl.n) > 0 ? 1 : -1, c0 = dot(nB, pl.origin);
    return {
      at: function (q, d) { var p = to3D(pl, q[0], q[1]); return add(p, scale(nB, wB - dot(nB, p) - (d || 0))); },
      dir: function (v) { return add(scale(pl.x, v[0]), scale(pl.y, v[1])); },
      prism: function (loop, d0, d1, shared) { var ha = (wB - c0 - d0) * sg, hb = (wB - c0 - d1) * sg; return prism(loop, pl, Math.min(ha, hb), Math.max(ha, hb), shared); },
      // lane DB2 (OpenCascade): the same prism as { plane, a, b } (prismOf's arguments)
      span: function (d0, d1) { var ha = (wB - c0 - d0) * sg, hb = (wB - c0 - d1) * sg; return { plane: pl, a: Math.min(ha, hb), b: Math.max(ha, hb) }; }
    };
  }
  // rigid motion folded → flat of a traced face piece (its tracked plane n·p = w, its 2D map)
  function ufFaceMotion(fc, fr, nB) {
    var n = fc.n, P0 = scale(n, fc.w), e1 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    e1 = norm(sub(e1, scale(n, dot(e1, n))));
    var e2 = cross(n, e1), Q0 = fr.at(fc.map(P0), 0);
    var i1 = sub(fr.at(fc.map(add(P0, e1)), 0), Q0), i2 = sub(fr.at(fc.map(add(P0, e2)), 0), Q0);
    var R = [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return i1[i] * e1[j] + i2[i] * e2[j] + nB[i] * n[j]; }); });
    return { R: R, t: sub(Q0, mDir({ R: R }, P0)) };
  }
  // a traced bend strip's frame in the folded part: section plane { origin (inner face, bend start, end a), x = o,
  // y = u (toward the fold), n along the edge a → b }, its length, its axis point and a point mid-bend
  function ufBendFrame(s, T) {
    var fi = s.fi, e3 = norm(sub(fi.b, fi.a)), O3 = add(fi.origin, scale(e3, dot(sub(fi.a, fi.origin), e3)));
    var L = dot(sub(fi.b, O3), e3), C = add(O3, scale(fi.u, fi.R)), h = fi.angle / 2, r = fi.R + T / 2;
    var at = add(add(C, add(scale(fi.u, -r * Math.cos(h)), scale(fi.o, r * Math.sin(h)))), scale(e3, L / 2));
    return { plane: { origin: O3, x: fi.o.slice(), y: fi.u.slice(), n: e3 }, len: L, C: C, at: at };
  }
  // is P on (in) the bend of strip s? polar test about its axis
  function ufOnBend(s, P, T) {
    var fi = s.fi, fr = ufBendFrame(s, T), d = sub(P, fr.C), po = dot(d, fi.o), pu = dot(d, fi.u), tau = dot(sub(P, fr.plane.origin), fr.plane.n);
    var r = Math.hypot(po, pu), th = Math.atan2(po, -pu), tol = Math.max(1e-3, 0.02 * T);
    if (th < -Math.PI / 2) th += 2 * Math.PI;
    return r > fi.R - tol && r < fi.R + T + tol && th > -0.01 && th < fi.angle + 0.01 && tau > -tol && tau < fr.len + tol;
  }
  // the bend zone of strip s in the folded part as a solid (a sector a little wider than the bend)
  function ufWedgeSpec(s, T) {
    var fi = s.fi, fr = ufBendFrame(s, T), rr = fi.R + 1.05 * T, d = 0.02, n = Math.max(4, Math.ceil((fi.angle + 2 * d) / (Math.PI / 16))), loop = [[0, fi.R]];
    for (var i = 0; i <= n; i++) { var th = -d + (fi.angle + 2 * d) * i / n; loop.push([rr * Math.sin(th), fi.R - rr * Math.cos(th)]); }
    return { loop: loop, plane: fr.plane, a: 0, b: fr.len };
  }
  function ufWedge(s, T) { var w = ufWedgeSpec(s, T); return prism(w.loop, w.plane, w.a, w.b); }
  // lane DB2: an unfolded strip's frames: `plane` / `band` its (s, τ) frame in the flat (origin at A2 on the tracked
  // surface, x across, y out of the sheet; a mitred strip's band spans its whole τ range), `bend` the folded bend's
  // section frame (ufBendFrame) and `sec` { A, R, T } (wrapCut's / OpenCascade's cylinderCutter's arguments)
  function ufStripFrame(st, s) {
    var fr = st.fr, T = st.T, tv = [s.B2[0] - s.A2[0], s.B2[1] - s.A2[1]], tl = Math.hypot(tv[0], tv[1]), t0 = 0, t1 = tl;
    s.strip.forEach(function (q) { var tq = ((q[0] - s.A2[0]) * tv[0] + (q[1] - s.A2[1]) * tv[1]) / tl; t0 = Math.min(t0, tq); t1 = Math.max(t1, tq); });
    return { plane: { origin: fr.at(s.A2, 0), x: fr.dir(s.o2), y: st.tr.nB.slice(), n: norm(fr.dir(tv)) }, band: { s0: 0, s1: s.BA, t0: t0, t1: t1 },
      bend: ufBendFrame(s, T).plane, sec: { A: s.fi.angle, R: s.fi.R, T: T } };
  }
  // lane DB2: Unfold's state as Kernel.rebuild leaves it after feature index `idx` of `model` (OpenCascade builds its
  // Unfold / Fold from it), or null
  function unfoldStateAt(model, idx) {
    var m = {};
    Object.keys(model).forEach(function (k) { m[k] = model[k]; });
    m.features = model.features.slice(0, idx + 1);
    var b = K.rebuild(m), id = model.features[idx].id;
    if (b.errors[id]) throw new Error(b.errors[id]);
    var stp = b.cache && b.cache.steps && b.cache.steps[idx];
    return { state: (stp && stp.unfold) || null, build: b };
  }
  function ufBendIndex(strips, P, T) {
    for (var j = 0; j < strips.length; j++) if (ufOnBend(strips[j], P, T)) return j;
    return -1;
  }
  // lane DJ: a solid in an unfolded strip (in the flat: sf.plane x = s, y out of the sheet, n = τ) cut into layers of
  // constant depth: ufLayers(pc, sf, T, inner) -> [{ y: [ya, yb], z: [z0, z1], outer: [loops], holes: [loops] }] (loops
  // in (s, τ), CCW). Each layer's outline is read at its mid depth (a wall slanting through a layer is taken straight);
  // z is wrapMesh's depth (0 the face the bend folds toward: inner = the tracked face is that face)
  function ufLayers(pc, sf, T, inner) {
    var pl = sf.plane, ys = [], lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], tol = 1e-7 * Math.max(1, T), out = [], lv = [];
    pc.polygons.forEach(function (pg) {
      pg.vertices.forEach(function (v) {
        var q = sub([v.pos.x, v.pos.y, v.pos.z], pl.origin), s = dot(q, pl.x), t = dot(q, pl.n);
        ys.push(dot(q, pl.y));
        lo = [Math.min(lo[0], s), Math.min(lo[1], t)]; hi = [Math.max(hi[0], s), Math.max(hi[1], t)];
      });
    });
    ys.sort(function (a, b) { return a - b; });
    ys.forEach(function (y) { if (!lv.length || y - lv[lv.length - 1] > tol) lv.push(y); });
    for (var i = 0; i + 1 < lv.length; i++) {
      var ya = lv[i], yb = lv[i + 1], ym = (ya + yb) / 2, d = Math.min(0.05 * (yb - ya), 1e-3 * T);
      var X = pc.intersect(prism([[lo[0] - 1, ym - d], [hi[0] + 1, ym - d], [hi[0] + 1, ym + d], [lo[0] - 1, ym + d]], pl, lo[1] - 1, hi[1] + 1));
      if (!X.polygons.length) continue;
      var mesh = meshFromBody(X), w0 = dot(pl.y, pl.origin) + ym + d, fi = -1;
      mesh.faces.forEach(function (fc, k) { if (fi < 0 && dot(fc.normal, pl.y) > 0.999 && Math.abs(fc.w - w0) < 1e-6 * Math.max(1, Math.abs(w0)) + 1e-9) fi = k; });
      if (fi < 0) continue;
      var o = faceOutline(mesh, fi);
      if (!o) continue;
      var loops = o.loops.map(function (l) {
        return l.map(function (p) { var q = sub(to3D(o.plane, p[0], p[1]), pl.origin); return [dot(q, pl.x), dot(q, pl.n)]; });
      }).filter(function (l) { return Math.abs(signedArea(l)) > 1e-9 * Math.max(1, T * T); });
      var outer = [], holes = [];
      loops.forEach(function (l) {
        var probe = loopInteriorPoint(l), dp = 0;
        if (!probe) return;
        loops.forEach(function (m) { if (m !== l && pointInPoly(probe, m)) dp++; });
        (dp % 2 ? holes : outer).push(signedArea(l) < 0 ? l.slice().reverse() : l);
      });
      if (outer.length) out.push({ y: [ya, yb], z: inner ? [-yb, -ya] : [T + ya, T + yb], outer: outer, holes: holes });
    }
    return out;
  }
  // lane DJ: ufLayers' layers wrapped round the strip's bend (wrapCut at each layer's depth) as one solid, or null.
  // opts.cut: a layer that reaches a face of the sheet goes ε past it (as a through cut does); opts.grow: wrapCut's
  // band edges; opts.shared: the polygons' tag
  function ufWrapLayers(layers, sf, BA, opts) {
    var T = sf.sec.T, eps = Math.min(0.01 * T, 0.5 * sf.sec.R), tol = 1e-6 * Math.max(1, T), parts = [];
    layers.forEach(function (ly) {
      var zr = ly.z.slice();
      if (opts.cut) { if (Math.abs(zr[0]) < tol) zr[0] = -eps; if (Math.abs(zr[1] - T) < tol) zr[1] = T + eps; }
      if (sf.sec.R + zr[0] < -tol) throw new Error('Fold: material on the inside of a bend reaches past its centre (' + fmtN(-zr[0]) + ' deep, bend radius ' + fmtN(sf.sec.R) + ').');
      var w = wrapCut(ly.outer, sf.sec, BA, sf.bend, { depth: zr, grow: opts.grow, shared: opts.shared });
      if (!w) return;
      if (ly.holes.length) { var h = wrapCut(ly.holes, sf.sec, BA, sf.bend, { depth: [zr[0] - eps, zr[1] + eps], shared: opts.shared }); if (h) w = w.subtract(h); }
      parts.push(w);
    });
    return parts.length ? unionAll(parts) : null;
  }
  // lane DJ: keep the part of convex polygon `poly` where sg·((q − A)·o − c) >= 0
  function ufClipHalf(poly, A, o, c, sg) {
    function f(q) { return sg * ((q[0] - A[0]) * o[0] + (q[1] - A[1]) * o[1] - c); }
    var out = [];
    poly.forEach(function (p, i) {
      var q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { var t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    return out;
  }
  // lane DJ: where material added on the unfolded part goes when it is folded: cells in the order Fold claims them,
  // { loop (flat 2D, a prism −D … T + D deep) | wedge (ufWedgeSpec, in the folded part), M (flat or folded → unfolded state), back (unfolded → folded; none for an
  // unfolded strip: wrapped round its bend), strip }. Over the blank: the face pieces, the strips (a bend left folded:
  // its wedge, moving with its parent); past the blank's edge: each unfolded strip's band carried on along its bend
  // line, then each face piece's side of the unfolded strips that bound it
  function ufCells(st, D) {
    var T = st.T, cells = [];
    function faceCell(loop, i) { var M = mCompose(st.P, st.Q[i]); return { loop: loop, M: M, back: mInv(mCompose(M, st.F[i])) }; }
    st.faces.forEach(function (fc, i) { cells.push(faceCell(fc.outer, i)); });
    st.strips.forEach(function (s, k) {
      if (st.sel[k]) { cells.push({ loop: s.strip, M: mCompose(st.P, st.Q[s.parent]), strip: s }); return; }
      var Mw = mCompose(st.P, mCompose(st.Q[s.parent], st.F[s.parent]));
      cells.push({ wedge: ufWedgeSpec(s, T), M: Mw, back: mInv(Mw) });
    });
    st.strips.forEach(function (s, k) {
      if (!st.sel[k]) return;
      var b = ufStripFrame(st, s).band, tv = [s.B2[0] - s.A2[0], s.B2[1] - s.A2[1]], tl = Math.hypot(tv[0], tv[1]), td = [tv[0] / tl, tv[1] / tl];
      function at(u, t) { return [s.A2[0] + s.o2[0] * u + td[0] * t, s.A2[1] + s.o2[1] * u + td[1] * t]; }
      cells.push({ loop: [at(0, b.t0 - D), at(s.BA, b.t0 - D), at(s.BA, b.t1 + D), at(0, b.t1 + D)], M: mCompose(st.P, st.Q[s.parent]), strip: s });
    });
    st.faces.forEach(function (fc, i) {
      var c = [0, 0];
      fc.outer.forEach(function (q) { c[0] += q[0] / fc.outer.length; c[1] += q[1] / fc.outer.length; });
      var poly = [[c[0] - D, c[1] - D], [c[0] + D, c[1] - D], [c[0] + D, c[1] + D], [c[0] - D, c[1] + D]];
      st.strips.forEach(function (s, k) {
        if (!st.sel[k]) return;
        if (s.parent === i) poly = ufClipHalf(poly, s.A2, s.o2, 0, -1);
        else if (fc.parent >= 0 && st.tr.strips[fc.parent] === s) poly = ufClipHalf(poly, s.A2, s.o2, s.BA, 1);
      });
      if (poly.length >= 3) cells.push(faceCell(poly, i));
    });
    return cells;
  }
  // lane DJ: a point picked on the part as the open Unfold shows it, back on the folded part (kind 'face': on a face
  // piece, and `ufFoldedPt.motion` that piece's motion folded → shown, else null; 'bend': on a bend left folded); a
  // point already on the folded part (a bend's `at`) is kept
  function ufFoldedPt(st, X, kind) {
    ufFoldedPt.motion = null;
    var T = st.T, tol = 1e-3 * Math.max(1, T), hit = null;
    if (kind === 'bend') {
      if (ufBendIndex(st.strips.filter(function (s, k) { return !st.sel[k]; }), X, T) >= 0) return X;
      st.strips.forEach(function (s, k) {
        if (hit || st.sel[k]) return;
        var Y = mPt(mInv(mCompose(st.P, mCompose(st.Q[s.parent], st.F[s.parent]))), X);
        if (ufOnBend(s, Y, T)) hit = Y;
      });
      return hit || X;
    }
    st.faces.forEach(function (fc, i) {
      if (hit) return;
      var Y = mPt(mInv(mCompose(st.P, mCompose(st.Q[i], st.F[i]))), X), h = fc.w - dot(fc.n, Y);
      if (Math.abs(h) > tol && Math.abs(h - T) > tol) return;
      if (pointInPoly(to2D(st.tr.plane, mPt(st.F[i], Y)), fc.outer)) { hit = Y; ufFoldedPt.motion = mCompose(st.P, mCompose(st.Q[i], st.F[i])); }
    });
    return hit || X;
  }
  // unfoldState(f, model, ctx, B0, bendPts, pre) -> { body, state, recs }: unfold body B0 (the folded part); lane DJ:
  // pre, a motion applied after (a second Unfold's fixed face stays where the open one shows it)
  function unfoldState(f, model, ctx, B0, bendPts, pre) {
    var tr = {}, flat;
    if (!B0) throw new Error('Unfold: there is no sheet metal part yet.');
    try { flat = flatPattern(model, { planes: ctx.planes, errors: ctx.errors || {}, flanges: ctx.flanges, body: B0 }, meshFromBody(B0), { trace: tr }); }
    catch (e) { throw new Error('Unfold: ' + (e.message || e)); }
    var T = tr.T, fr = ufFlat(tr), faces = tr.faces, strips = tr.strips.filter(function (s) { return s.parent >= 0; });
    if (!strips.length) throw new Error('Unfold: the part has no bends.');
    var sel = strips.map(function () { return !(bendPts && bendPts.length); });
    (bendPts || []).forEach(function (P, i) {
      var k = ufBendIndex(strips, P, T);
      if (k < 0) throw new Error('Unfold: bend ' + (i + 1) + ' (' + P.map(fmtN).join(', ') + ') is not on a bend of the part.');
      sel[k] = true;
    });
    var F = faces.map(function (fc) { return ufFaceMotion(fc, fr, tr.nB); });
    // Q: flat → unfolded state, per face piece (faces come in unfold order: a parent before its children)
    var Q = [];
    faces.forEach(function (fc, i) {
      var s = fc.parent >= 0 ? tr.strips[fc.parent] : null, k = s ? strips.indexOf(s) : -1;
      if (!s || s.parent < 0) { Q[i] = M_ID; return; }
      Q[i] = k >= 0 && sel[k] ? Q[s.parent] : mCompose(Q[s.parent], mCompose(F[s.parent], mInv(F[i])));
    });
    // the fixed face: the face piece holding the point, on either side of the sheet
    var fix = 0;
    if (f.fixedFace) {
      fix = -1;
      faces.forEach(function (fc, i) {
        if (fix >= 0) return;
        var h = fc.w - dot(fc.n, f.fixedFace), tol = 1e-3 * Math.max(1, T);
        if (Math.abs(h) > tol && Math.abs(h - T) > tol) return;
        if (pointInPoly(to2D(tr.plane, mPt(F[i], f.fixedFace)), fc.outer)) fix = i;
      });
      if (fix < 0) throw new Error('Unfold: the fixed face (' + f.fixedFace.map(fmtN).join(', ') + ') is not a flat face of the sheet.');
    }
    var P = mCompose(mInv(F[fix]), mInv(Q[fix]));
    if (pre) P = mCompose(pre, P);
    // the flat solid: the blank × T, its faces tagged with the feature (a sketch on the flat face refers to it)
    var m = 0.01 * T, flatBody = fr.prism(flat.loops[0], 0, T, f.id);
    flat.loops.slice(1).forEach(function (h) { flatBody = flatBody.subtract(fr.prism(h, -m, T + m, f.id)); });
    var body, extras = [];
    if (sel.every(Boolean)) body = mBody(flatBody, P);
    else {
      var pieces = [];
      faces.forEach(function (fc, i) { var pc = flatBody.intersect(fr.prism(fc.outer, -m, T + m)); if (pc.polygons.length) pieces.push(mBody(pc, mCompose(P, Q[i]))); });
      strips.forEach(function (s, k) {
        var pc = sel[k] ? flatBody.intersect(fr.prism(s.strip, -m, T + m)) : B0.intersect(ufWedge(s, T));
        if (pc.polygons.length) pieces.push(mBody(pc, sel[k] ? mCompose(P, Q[s.parent]) : mCompose(P, mCompose(Q[s.parent], F[s.parent]))));
      });
      // lane DT: material added across a bend line past the strip's ends (a Tab folded with the sheet) lies in no face
      // piece and no strip: an unfolded strip takes it from the flat, a bend left folded from the part (its wedge run on)
      ufStripExtras(tr, fr, flat, flatBody, faces, strips, T).forEach(function (x) {
        var s = strips[x.k], pc;
        if (sel[x.k]) { pc = x.body; pieces.push(mBody(pc, mCompose(P, Q[s.parent]))); }
        else {
          var w = ufWedgeSpec(s, T);
          pc = B0.intersect(unionAll([prism(w.loop, w.plane, -x.D, w.a), prism(w.loop, w.plane, w.b, w.b + x.D)]));
          if (pc.polygons.length) pieces.push(mBody(pc, mCompose(P, mCompose(Q[s.parent], F[s.parent]))));
        }
        extras.push({ k: x.k, loops: x.loops, D: x.D });
      });
      body = unionAll(pieces);
    }
    var pl = tr.plane, frame = { origin: mPt(P, pl.origin), x: mDir(P, pl.x), y: mDir(P, pl.y), n: mDir(P, pl.n) };
    var recs = [{ kind: 'unfold', fixed: f.fixedFace || null, frame: frame, bends: strips.map(function (s, k) {
      var bf = ufBendFrame(s, T), M = sel[k] ? mCompose(P, Q[s.parent]) : null;
      var out = { at: bf.at, unfolded: sel[k], R: s.fi.R, angle: s.fi.angle, ba: s.BA, src: s.id ? s.id.feature + ':' + s.id.index : null,
        quad: M ? s.strip.map(function (q) { return mPt(M, fr.at(q, 0)); }) : null, normal: M ? mDir(M, tr.nB) : null };
      // lane DB2: the flat bend line (unfolded state, on the tracked surface), the side it folds toward, a custom BA
      if (M && s.bend) {
        out.line = [mPt(M, fr.at(s.bend.a, 0)), mPt(M, fr.at(s.bend.b, 0))];
        out.toward = mDir(M, s.trackedInner ? tr.nB : scale(tr.nB, -1));
        if (s.fi.ba) out.cba = s.fi.ba;
      }
      // lane DJ: a bend left folded, as the part shows it now (sheetBendAt finds a click on it: a second Unfold)
      if (!M) {
        var Mw = mCompose(P, mCompose(Q[s.parent], F[s.parent])), fi = s.fi;
        out.zone = { fi: { a: mPt(Mw, fi.a), b: mPt(Mw, fi.b), origin: mPt(Mw, fi.origin), u: mDir(Mw, fi.u), o: mDir(Mw, fi.o), R: fi.R, angle: fi.angle } };
      }
      return out;
    }) }];
    return { body: body, recs: recs, state: { id: f.id, B0: B0, F0: body, tr: tr, fr: fr, strips: strips, faces: faces, F: F, Q: Q, P: P, sel: sel, fixedFace: f.fixedFace || null, T: T, flat: flat, pre: pre || null, extras: extras } };
  }
  // lane DT: the flat's material in each strip's band carried on past the strip's ends that no face piece or strip
  // covers (material added across the bend line beyond the bend's edge): [{ k (strip index), body (flat solid), loops
  // (its outline in the flat's 2D, for OpenCascade), D (how far the band was carried) }]
  function ufStripExtras(tr, fr, flat, flatBody, faces, strips, T) {
    var out = [], m = 0.01 * T, D = 2 * (Math.abs(flat.size[0]) + Math.abs(flat.size[1]) + 1), cover = null;
    strips.forEach(function (s, k) {
      var tv = [s.B2[0] - s.A2[0], s.B2[1] - s.A2[1]], tl = Math.hypot(tv[0], tv[1]), t0 = 0, t1 = tl;
      if (!(tl > 0)) return;
      var td = [tv[0] / tl, tv[1] / tl];
      s.strip.forEach(function (q) { var tq = (q[0] - s.A2[0]) * td[0] + (q[1] - s.A2[1]) * td[1]; t0 = Math.min(t0, tq); t1 = Math.max(t1, tq); });
      function at(u, t) { return [s.A2[0] + s.o2[0] * u + td[0] * t, s.A2[1] + s.o2[1] * u + td[1] * t]; }
      var quads = [[at(0, t0 - D), at(s.BA, t0 - D), at(s.BA, t0), at(0, t0)], [at(0, t1), at(s.BA, t1), at(s.BA, t1 + D), at(0, t1 + D)]];
      var ch = flatBody.intersect(unionAll(quads.map(function (q) { return fr.prism(ventCCW(q), -m, T + m); })));
      if (!ch.polygons.length) return;
      if (!cover) cover = unionAll(faces.map(function (fc) { return fr.prism(fc.outer, -2 * m, T + 2 * m); }).concat(strips.map(function (q) { return fr.prism(q.strip, -2 * m, T + 2 * m); })));
      ch = ch.subtract(cover);
      if (!ch.polygons.length || Math.abs(ch.volume()) < 1e-6 * s.BA * T * T) return;
      // its outline in the flat's 2D (the face on the sheet's tracked side)
      var mesh = meshFromBody(ch), loops = [];
      mesh.faces.forEach(function (fc, i) {
        if (loops.length || Math.abs(dot(fc.normal, tr.nB)) < 0.999) return;
        var o = faceOutline(mesh, i);
        if (o) loops = o.loops.map(function (l) { return ventCCW(l.map(function (p) { return to2D(tr.plane, to3D(o.plane, p[0], p[1])); })); }).filter(function (l) { return Math.abs(signedArea(l)) > 1e-9; });
      });
      out.push({ k: k, body: ch, loops: loops, D: D });
    });
    return out;
  }
  // sheetBends(model, build, mesh) -> [{ at, angle (deg), R, len }]: the bends of the part as built (folded), in the
  // order Unfold numbers them; `at` is the point Unfold / Fold store for a bend. sheetBendAt(bends, P, T) -> the
  // index of the bend whose zone holds P (a click on its inside or outside surface), else -1.
  function sheetBends(model, build, mesh) {
    var tr = {};
    flatPattern(model, build, mesh, { trace: tr });
    return tr.strips.filter(function (s) { return s.parent >= 0; }).map(function (s) {
      var bf = ufBendFrame(s, tr.T);
      return { at: bf.at, angle: s.fi.angle * 180 / Math.PI, R: s.fi.R, len: bf.len, ba: s.BA, zone: { fi: s.fi } };
    });
  }
  function sheetBendAt(bends, P, T) {
    for (var i = 0; i < bends.length; i++) if (ufOnBend(bends[i].zone, P, T)) return i;
    return -1;
  }
  // unfoldedBendAt(rec, P, T) -> the index in rec.bends (an Unfold's record, kind 'unfold') of the unfolded strip that
  // holds P (a click on either face of the flat strip), else -1
  function unfoldedBendAt(rec, P, T) {
    var bends = (rec && rec.bends) || [];
    for (var i = 0; i < bends.length; i++) {
      var b = bends[i], q = b.quad;
      if (!b.unfolded || !q || q.length < 3) continue;
      var n = b.normal, h = dot(sub(P, q[0]), n);
      if (h > 1e-3 * Math.max(1, T) || h < -T * 1.001 - 1e-6) continue;
      var e1 = norm(sub(q[1], q[0])), e2 = cross(n, e1), loop = q.map(function (Q) { var d = sub(Q, q[0]); return [dot(d, e1), dot(d, e2)]; });
      var d0 = sub(P, q[0]);
      if (pointInPoly([dot(d0, e1), dot(d0, e2)], loop)) return i;
    }
    return -1;
  }
  // unfoldPreview(model, build, f) -> the part with Unfold / Fold `f` appended to `model` (as built in `build`, whose
  // cache gives the prefix): what the PropertyManagers' live preview shows (the worker's 'unfold' / 'fold' op)
  function unfoldPreview(model, build, f) {
    var m = {};
    Object.keys(model).forEach(function (k) { m[k] = model[k]; });
    var g = JSON.parse(JSON.stringify(f));
    if (g.id == null) g.id = (model.nextId || 1) + 1000;
    m.features = model.features.concat([g]);
    var b = K.rebuild(m, build && build.cache);
    if (b.errors[g.id]) throw new Error(b.errors[g.id]);
    return b.body;
  }
  // lane DB2: the Unfold record left open at the end of `build` (an Unfold, or a Fold of some bends, with no full Fold
  // after it), else null
  function ufOpenRecord(model, build) {
    var open = null;
    (model.features || []).forEach(function (f) {
      if ((f.type !== 'unfold' && f.type !== 'fold') || !build.flanges || (build.errors && build.errors[f.id])) return;
      open = ((build.flanges[f.id] || []).filter(function (r) { return r && r.kind === 'unfold'; })[0]) || null;
    });
    return open;
  }
  // the flat bend lines of an open Unfold's unfolded bends, in the 2D of the face piece each lies on (faceRecs: the
  // pieces flatPattern laid, with their maps)
  function ufOpenBends(rec, faceRecs, sheet, T, units, warn) {
    var out = [], tol = 1e-3 * Math.max(1, T);
    (rec.bends || []).forEach(function (b) {
      if (!b.unfolded || !b.line) return;
      var mid = scale(add(b.line[0], b.line[1]), 0.5);
      var fr = faceRecs.filter(function (r) {
        var h = r.w - dot(r.normal, mid);
        return (Math.abs(h) < tol || Math.abs(h - T) < tol) && pointInPoly(r.map(mid), r.loops[0]);
      })[0];
      if (!fr) return;
      var bc;
      try { bc = bendCalc(sheet, b.angle, b.R, T, b.cba); } catch (e) { warn(e.message); return; }
      warn(bc.warning);
      var bend = { a: fr.map(b.line[0]), b: fr.map(b.line[1]), up: dot(b.toward, fr.normal) > 0, angle: b.angle * 180 / Math.PI, R: b.R, ba: bc.BA, bd: bc.BD, method: bc.type, source: bc.source };
      bend.label = bendNoteText(bend, units);
      if (b.src) bend.id = b.src;   // (lane drawing) the flange the unfolded bend came from
      out.push(bend);
    });
    return out;
  }
  function buildUnfold(f, model, ctx) {
    var open = ctx.unfold;
    if (!open) {
      var r = unfoldState(f, model, ctx, ctx.body, f.bends);
      r.state.name = f.name;
      return r;
    }
    // lane DJ: another Unfold while one is open: fold that one back (with what was cut or added since), then unfold its
    // bends and this one's together, about this one's fixed face (picked on the part as shown) or the open one's
    var T = open.T, all = !(f.bends && f.bends.length), pts = [];
    var fixed = f.fixedFace ? ufFoldedPt(open, f.fixedFace, 'face') : open.fixedFace, pre = f.fixedFace ? ufFoldedPt.motion : open.pre || null;
    if (!all) {
      open.strips.forEach(function (s, k) { if (open.sel[k]) pts.push(ufBendFrame(s, T).at); });
      f.bends.forEach(function (P) { pts.push(ufFoldedPt(open, P, 'bend')); });
    }
    var back = buildFold({ id: f.id, bends: null }, model, ctx);
    ctx.flanges[f.id] = back.recs;
    var again = unfoldState({ id: f.id, fixedFace: fixed }, model, ctx, back.body, all ? null : pts, pre);
    again.state.name = f.name;
    return { body: again.body, recs: back.recs.concat(again.recs), state: again.state, cut: back.cut };
  }
  // buildFold(f, model, ctx) -> { body, recs, state, cut }: fold the part ctx.body (unfolded by ctx.unfold) back
  function buildFold(f, model, ctx) {
    var st = ctx.unfold;
    if (!st) throw new Error('Fold: there is no Unfold before it to fold back.');
    var T = st.T, fr = st.fr, m = 0.01 * T, cuts = [], recs = [], direct = [];
    var removed = st.F0.subtract(ctx.body);
    var some = removed.polygons.length && removed.volume() > 1e-12 * Math.max(1, Math.abs(st.F0.volume()));
    if (some) {
      st.faces.forEach(function (fc, i) {
        var M = mCompose(st.P, st.Q[i]), pc = removed.intersect(mBody(fr.prism(fc.outer, -m, T + m), M));
        if (pc.polygons.length) cuts.push(mBody(pc, mInv(mCompose(M, st.F[i]))));
      });
      st.strips.forEach(function (s, k) {
        if (!st.sel[k]) {
          var Mw = mCompose(st.P, mCompose(st.Q[s.parent], st.F[s.parent])), pw = removed.intersect(mBody(ufWedge(s, T), Mw));
          if (pw.polygons.length) cuts.push(mBody(pw, mInv(Mw)));
          return;
        }
        var M = mCompose(st.P, st.Q[s.parent]), Mi = mInv(M), pc = removed.intersect(mBody(fr.prism(s.strip, -m, T + m), M));
        if (!pc.polygons.length) return;
        // the strip's voids in its own (s, τ) frame (ufStripFrame; lane DB2: a mitred strip's whole τ range)
        var sf = ufStripFrame(st, s), band = sf.band;
        var loops = bendVoids(mBody(ctx.body, Mi), sf.plane, band, T, { ends: true, fine: true, voids: bandSlab(sf.plane, band, T).intersect(mBody(pc, Mi)) });
        // lane DJ: what is left once the through voids are out (a blind cut, a pocket's floor) goes in layers
        var rest = mBody(pc, Mi);
        if (loops.length) {
          var thru = { origin: sf.plane.origin, x: sf.plane.x, y: sf.plane.n, n: cross(sf.plane.x, sf.plane.n) }, up = dot(thru.n, sf.plane.y) > 0;
          rest = rest.subtract(unionAll(loops.map(function (l) { return prism(l, thru, up ? -T - m : -m, up ? m : T + m); })));
        }
        var blind = rest.polygons.length && rest.volume() > 1e-9 * Math.max(1e-6, s.BA * (band.t1 - band.t0) * T);
        if (blind) {
          var wb = ufWrapLayers(ufLayers(rest, sf, T, s.trackedInner), sf, s.BA, { cut: true, grow: band, shared: f.id });
          if (wb) cuts.push(wb);
        }
        if (!loops.length) return;
        if (s.id) recs.push({ kind: 'foldCutouts', feature: s.id.feature, index: s.id.index, cutouts: loops });
        // lane FU: a square-ended strip whose band now holds plain sheet and through voids only (every void, the ones cut
        // before this Unfold too): the bend is cut out whole and its metal (band less the voids) rebuilt from the flat
        // (wrapRegion), so no wrapped tool crosses the bend's facets
        var L = ufBendFrame(s, T).len, tolL = 1e-7 * Math.max(1, L);
        if (!blind && !s.mitred && !s.fi.ccEnds && sf.sec.R > 0.01 * T && Math.abs(band.t0) < tolL && Math.abs(band.t1 - L) < tolL) {
          var flatNow = mBody(ctx.body, Mi), all = bendVoids(flatNow, sf.plane, band, T, { ends: true, fine: true });
          var th = { origin: sf.plane.origin, x: sf.plane.x, y: sf.plane.n, n: cross(sf.plane.x, sf.plane.n) }, upw = dot(th.n, sf.plane.y) > 0;
          var bandPrism = prism([[0, 0], [s.BA, 0], [s.BA, L], [0, L]], th, upw ? -T - m : -m, upw ? m : T + m);
          var want = (s.BA * L - all.reduce(function (a, l) { return a + Math.abs(signedArea(l)); }, 0)) * T;
          if (Math.abs(flatNow.intersect(bandPrism).volume() - want) <= 1e-7 * Math.max(want, 1e-9)) {
            var metal = wrapRegion(all, sf.sec, s.BA, sf.bend, 0, L, { shared: f.id });
            if (metal) { direct.push({ sector: bendSector(sf.sec, sf.bend, 0, L), metal: metal }); return; }
          }
        }
        var w = wrapCut(loops, sf.sec, s.BA, sf.bend, { grow: band, shared: f.id, split: true });
        if (w) cuts.push(w);
      });
    }
    var cut = cuts.length ? unionAll(cuts) : null, body = st.B0;
    if (direct.length) {
      // the bends rebuilt: the faces' cuts and the whole bends out, then the bends' metal in (lane FU: smBool)
      body = smBool(st.B0, 'subtract', cuts.concat(direct.map(function (d) { return d.sector; })), T);
      body = smBool(body, 'union', direct.map(function (d) { return d.metal; }), T);
      var gone = unionAll(direct.map(function (d) { return d.sector.subtract(d.metal); }));
      cut = cut ? cut.union(gone) : gone;
    } else if (cut) body = smBool(st.B0, 'subtract', cuts, T);
    // lane DJ: material added since the Unfold (now less the unfolded part), cell by cell (ufCells): face pieces moved
    // back rigidly, strip pieces wrapped round their bends in layers; the sheet-plane layer's outline joins the flat
    var added = ctx.body.subtract(st.F0), more = added.polygons.length && added.volume() > 1e-12 * Math.max(1, Math.abs(st.F0.volume()));
    if (more) {
      var bb = ctx.body.getBounds(), D = 2 * len(sub(bb.max, bb.min)) + 10 * T + 1, rest2 = added, adds = [];
      ufCells(st, D).forEach(function (c) {
        if (!rest2.polygons.length) return;
        var cs = mBody(c.wedge ? prism(c.wedge.loop, c.wedge.plane, c.wedge.a, c.wedge.b) : fr.prism(c.loop, -D, T + D), c.M), pc = rest2.intersect(cs);
        if (!pc.polygons.length || !(pc.volume() > 1e-12)) return;
        rest2 = rest2.subtract(cs);
        if (!c.strip) { adds.push(mBody(pc, c.back)); return; }
        var s = c.strip, sf = ufStripFrame(st, s), ly = ufLayers(mBody(pc, mInv(c.M)), sf, T, s.trackedInner);
        var wa = ufWrapLayers(ly, sf, s.BA, { shared: f.id });
        if (wa) adds.push(wa);
        var mid = ly.filter(function (l) { return l.y[0] < -T / 2 && l.y[1] > -T / 2; })[0];
        if (mid && s.id) recs.push({ kind: 'foldAdds', feature: s.id.feature, index: s.id.index, adds: mid.outer });
      });
      if (adds.length) body = body.union(unionAll(adds));
    }
    // lane DJ: a blind cut or material on a face that runs onto a bend notches that face piece's outline, and the flat
    // would close the notch round the strip into a hole: where the sheet still has metal at mid-thickness under such a
    // change, the flat keeps it (kind 'foldFills', regions [outer, holes…] in the strip's [s, τ])
    var chg = some && more ? removed.union(added) : some ? removed : more ? added : null;
    if (chg) st.strips.forEach(function (s, k) {
      if (!st.sel[k] || !s.id) return;
      var Mi = mInv(mCompose(st.P, st.Q[s.parent])), sf = ufStripFrame(st, s), pl = sf.plane, cf = mBody(chg, Mi), bb = cf.getBounds();
      var D = 2 * len(sub(bb.max, bb.min)) + len(sub(bb.min, pl.origin)) + 1;
      var top = cf.intersect(prism([[-D, -0.1 * T], [D, -0.1 * T], [D, 0.1 * T], [-D, 0.1 * T]], pl, -D, D));
      if (!top.polygons.length) return;
      var foot = [];
      ufLayers(top, sf, T, true).forEach(function (ly) { foot = foot.concat(ly.outer); });
      if (!foot.length) return;
      var thru = { origin: pl.origin, x: pl.x, y: pl.n, n: cross(pl.x, pl.n) }, up = dot(thru.n, pl.y) > 0;
      var metal = mBody(ctx.body, Mi).intersect(unionAll(foot.map(function (l) { return prism(l, thru, up ? -0.6 * T : 0.4 * T, up ? -0.4 * T : 0.6 * T); })));
      var fills = [];
      ufLayers(metal, sf, T, true).forEach(function (ly) {
        ly.outer.forEach(function (o) {
          fills.push([o].concat(ly.holes.filter(function (h) { var q = loopInteriorPoint(h); return q && pointInPoly(q, o); }).map(function (h) { return h.slice().reverse(); })));
        });
      });
      if (fills.length) recs.push({ kind: 'foldFills', feature: s.id.feature, index: s.id.index, fills: fills });
    });
    // a Fold of some of the bends: the rest stay unfolded (an Unfold of them on the folded result)
    var keep = [];
    if (f.bends && f.bends.length) {
      var fold = st.sel.map(function () { return false; });
      f.bends.forEach(function (P, i) {
        var k = ufBendIndex(st.strips, P, T);
        if (k < 0 || !st.sel[k]) throw new Error('Fold: bend ' + (i + 1) + ' (' + P.map(fmtN).join(', ') + ') is not one the Unfold unfolded.');
        fold[k] = true;
      });
      st.strips.forEach(function (s, k) { if (st.sel[k] && !fold[k]) keep.push(ufBendFrame(s, T).at); });
    }
    if (!keep.length) return { body: body, recs: recs, state: null, cut: cut };
    ctx.flanges[f.id] = recs;
    var again = unfoldState({ id: f.id, fixedFace: st.fixedFace }, model, ctx, body, keep, st.pre);
    again.state.name = f.name;
    return { body: again.body, recs: recs.concat(again.recs), state: again.state, cut: cut };
  }

  // ------------------------------------------------------------------ Insert Bends / Convert to Sheet Metal (lane DQ)
  // SolidWorks' Sheet Metal ▸ Insert Bends: a constant-thickness part (a Shell, a thin extrude, an imported thin body)
  // becomes a sheet-metal part. Feature JSON { type: 'insertBends', fixedFace: [x, y, z] (a point on a flat face; the
  // flat is laid from it), radius (null / absent = the sheet's), autoRelief: 'rect' (default) | 'none', sheetBase: true,
  // name: 'Process-Bends1' }. model.sheet (T measured from the body by the Builder / PM: sheetThicknessAt, R, K or a
  // bend table) is the part's Sheet-Metal row. Every sharp corner between two plates T thick (a convex edge between two
  // flat faces, the inside corner T behind, both plates running on past the bend, T exactly) becomes a bend of inside
  // radius R: the corner kite (axis C, R + T behind both outer faces, to the outer faces' tangent lines) is cut away
  // and the bend (annulus R … R + T, faceted as flangeProfile, with T/2 overlap strips into both plates so the union is
  // watertight) put in, so the outer faces stay where they were. Where two bends meet at a square corner (a box's
  // bottom corner, its walls ripped) each stops R + T short and the (R + T) cube at the corner is cut out (Auto Relief
  // 'rect'; 'none' refuses such corners). The plates make a tree from the fixed face's plate (a closed ring of bends,
  // an unripped box, is refused: rip it first). Records (ctx.flanges[id]) are edge-flange shaped (Material Inside
  // flanges from the plate nearer the fixed face), so flatPattern unfolds them with no new code. Lane rfIH: bends already
  // rounded in the part (ibRoundBends) are taken as they are, with their own radius (the body does not change).
  // Convert to Sheet Metal { type: 'convertSM', fixedFace, bendEdges: [[x, y, z] | { at }], ripEdges?: [...] (absent:
  // found, the sharp edges between two kept faces that are not bend edges), gap (rip gap), autoRelief, radius,
  // sheetBase: true, name: 'Convert-Solid1' } on a solid: the faces kept are the fixed face and every face reached
  // across bend edges, the others are removed by a Shell of T inward, the rip edges are ripped (Rip 'both', gap), then
  // Insert Bends runs on the bend edges only.
  var IB_RELIEFS = ['rect', 'none'];
  function isInsertBends(f) { return !!f && (f.type === 'insertBends' || f.type === 'convertSM') && !!f.fixedFace; }
  // flatPattern's plane for a part made sheet metal by Insert Bends / Convert to Sheet Metal (the sheetBase feature):
  // on the fixed face, n its outward normal, x the world axis least along n (so a box's flat lies square); else null
  function ibFlatPlane(base, mesh, model) {
    if (!isInsertBends(base) || !mesh) return null;
    if (model.noBends) throw new Error('No Bends is on: the part is shown without its bends (click No Bends again to insert them).');
    var P = base.fixedFace, i = ibFaceAt(mesh, P, model.units === 'in' ? 0.01 : 0.25);
    if (i < 0) throw new Error('Flat pattern: the fixed face of ' + (base.name || 'Insert Bends') + ' is not there any more (at ' + bcPt(P) + ').');
    // rfIH: ties within 1e-9 keep x, y, z order (an OpenCascade face normal's 1e-17 noise turned the flat by 90°)
    var n = mesh.faces[i].normal.slice(), ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].sort(function (a, b) { var q = Math.abs(dot(a, n)) - Math.abs(dot(b, n)); return Math.abs(q) < 1e-9 ? 0 : q; })[0];
    var x = norm(sub(ax, scale(n, dot(ax, n))));
    return { origin: sub(P, scale(n, dot(n, P) - mesh.faces[i].w)), x: x, y: cross(n, x), n: n };
  }
  // the face of a coplanar mesh that holds P (its plane within tol, P inside its outline), else -1
  function ibFaceAt(mesh, P, tol) {
    var best = -1, bd = Infinity;
    mesh.faces.forEach(function (g, i) {
      var dd = Math.abs(dot(g.normal, P) - g.w);
      if (dd > tol || dd >= bd) return;
      var o;
      try { o = faceOutline(mesh, i); } catch (e) { o = null; }
      if (!o) return;
      var q = to2D(o.plane, P), hit = false;
      o.loops.forEach(function (l) { if (signedArea(l) > 0 && pointInPoly(q, l)) hit = true; });
      o.loops.forEach(function (l) { if (signedArea(l) < 0 && pointInPoly(q, l)) hit = false; });
      if (hit) { best = i; bd = dd; }
    });
    return best;
  }
  // sheetThicknessAt(body, P, units) -> the wall thickness under the flat face through P (the nearest face facing the
  // other way behind it); the Builder / PM measure the sheet's T with it
  function sheetThicknessAt(body, P, units) {
    if (!body || !body.polygons || !body.polygons.length) throw new Error('Insert Bends: there is no solid to bend yet.');
    var mesh = meshFromBody(coplanarBody(body)), inside = body.pointTester(), tol = units === 'in' ? 0.01 : 0.25, pr = units === 'in' ? 1e-4 : 2.5e-3;
    var i = ibFaceAt(mesh, P, tol);
    if (i < 0) throw new Error('Insert Bends: there is no flat face at ' + bcPt(P) + '.');
    var g = mesh.faces[i], n = g.normal, Q = sub(P, scale(n, dot(n, P) - g.w)), ts = [];
    mesh.faces.forEach(function (h) { if (dot(h.normal, n) < -0.999) { var t = g.w + h.w; if (t > pr) ts.push(t); } });
    ts.sort(function (a, b) { return a - b; });
    for (var k = 0; k < ts.length; k++) if (inside(sub(Q, scale(n, ts[k] - pr))) && !inside(sub(Q, scale(n, ts[k] + pr)))) return ts[k];
    throw new Error('Insert Bends: cannot find the wall thickness at ' + bcPt(P) + '.');
  }
  // lane rfIM: the cylinder faces of a body grouped by surface (axis + radius), each with its frame and arc:
  // [{ s (the record), polys, f: { d, e1, e2, o, r, th0, A, z0, z1, sag } }] (f absent: a cylinder too short to use)
  function ibSameAxis(a, b) {
    if (Math.abs(dot(a.d, b.d)) < 1 - 1e-9) return false;
    var v = sub(b.o, a.o);
    return len(sub(v, scale(a.d, dot(v, a.d)))) <= 1e-7 * (1 + len(a.o));
  }
  function ibCylGroups(body) {
    var groups = [], sameAxis = ibSameAxis;
    (body.polygons || []).forEach(function (p) {
      var s = p.surf && p.surf.s;
      if (!s || s.t !== 'cyl' || !(s.r > 0)) return;
      var g = null;
      for (var i = 0; i < groups.length && !g; i++) if (groups[i].s === s || (Math.abs(groups[i].s.r - s.r) <= 1e-9 * (1 + s.r) && sameAxis(groups[i].s, s))) g = groups[i];
      if (!g) groups.push(g = { s: s, polys: [] });
      g.polys.push(p);
    });
    groups.forEach(function (g) {
      var d = norm(g.s.d), big = 0;
      for (var k = 1; k < 3; k++) if (Math.abs(d[k]) > Math.abs(d[big]) + 1e-9) big = k;
      if (d[big] < 0) d = scale(d, -1);
      var ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].sort(function (a, b) { return Math.abs(dot(a, d)) - Math.abs(dot(b, d)); })[0];
      var e1 = norm(sub(ax, scale(d, dot(ax, d)))), e2 = cross(d, e1), o = sub(g.s.o, scale(d, dot(g.s.o, d))), r = g.s.r;
      var th = [], z0 = Infinity, z1 = -Infinity;
      g.polys.forEach(function (p) {
        p.vertices.forEach(function (v) {
          var q = sub([v.pos.x, v.pos.y, v.pos.z], o), z = dot(q, d), rad = sub(q, scale(d, z));
          if (Math.abs(len(rad) - r) > 1e-5 * (1 + r)) return;
          th.push(Math.atan2(dot(rad, e2), dot(rad, e1)));
          z0 = Math.min(z0, z); z1 = Math.max(z1, z);
        });
      });
      if (th.length < 2 || !(z1 - z0 > 1e-6)) return;
      th.sort(function (a, b) { return a - b; });
      var gap = th[0] + 2 * Math.PI - th[th.length - 1], start = th[0];
      for (var i = 1; i < th.length; i++) if (th[i] - th[i - 1] > gap) { gap = th[i] - th[i - 1]; start = th[i]; }
      var step = 0;   // the widest facet: its chord lies r(1 − cos(step / 2)) inside the true surface
      for (i = 1; i < th.length; i++) if (th[i] - th[i - 1] < gap - 1e-12) step = Math.max(step, th[i] - th[i - 1]);
      if (th[0] + 2 * Math.PI - th[th.length - 1] < gap - 1e-12) step = Math.max(step, th[0] + 2 * Math.PI - th[th.length - 1]);
      g.f = { d: d, e1: e1, e2: e2, o: o, r: r, th0: start, A: 2 * Math.PI - gap, z0: z0, z1: z1, sag: r * (1 - Math.cos(Math.min(step, Math.PI) / 2)) };
    });
    return groups;
  }
  // lane rfIH: the bends already rounded in the part (SolidWorks' Insert Bends takes them with their own radius): a
  // pair of concentric cylinders, inner radius R > 0 and outer R + T, on one axis and over the same angle (under 180°),
  // with a flat wall T thick running on tangent from each end. Found from the facets' cylinder records (Anvil's
  // extrudes and fillets, an imported STEP, OpenCascade's shapeToCSG with records). ibRoundBends(body, mesh, T, units)
  // -> [{ R, RT, A, C0 (on the axis, C0·d = 0), d, n1, n2 (the walls' outer normals at the start / end of the arc,
  // cross(n1, n2)·d > 0), s0, s1 (the extent along d), i1, i2 (the walls' outer faces in mesh), mid (a point on the
  // outer surface half way), faces: { mesh face index: true } (the bend's facets) }]
  function ibRoundBends(body, mesh, T, units) {
    var groups = ibCylGroups(body), out = [], inside = body.pointTester(), pr = units === 'in' ? 1e-4 : 2.5e-3, dl = 1e-3 * T, sameAxis = ibSameAxis;
    function angDiff(a, b) { var x = (a - b) % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x < -Math.PI) x += 2 * Math.PI; return Math.abs(x); }
    function wallFace(n, w) {
      for (var i = 0; i < mesh.faces.length; i++) { var fc = mesh.faces[i]; if (dot(fc.normal, n) > 1 - 1e-6 && Math.abs(fc.w - w) <= pr) return i; }
      return -1;
    }
    groups.forEach(function (gi) {
      var a = gi.f;
      if (!a || !(a.A > 1e-3) || a.A > Math.PI - 1e-3) return;
      groups.forEach(function (go) {
        var b = go.f;
        if (!b || go === gi || Math.abs(b.r - a.r - T) > pr || !sameAxis(gi.s, go.s)) return;
        // the same angle on both surfaces (the outer's frame: the axes may point opposite ways)
        var e = function (f, t) { return add(scale(f.e1, Math.cos(t)), scale(f.e2, Math.sin(t))); };
        var ia = e(a, a.th0), ib = e(a, a.th0 + a.A), oa = e(b, b.th0), ob = e(b, b.th0 + b.A);
        if (dot(a.d, b.d) < 0) { var sw = oa; oa = ob; ob = sw; }
        if (Math.abs(a.A - b.A) > 1e-3 || dot(ia, oa) < Math.cos(1e-3) || dot(ib, ob) < Math.cos(1e-3)) return;
        var sg = dot(a.d, b.d) > 0 ? 1 : -1;   // both origins are the axis point with o·d = 0, so z on b is ±z on a
        var s0 = Math.max(a.z0, Math.min(sg * b.z0, sg * b.z1)), s1 = Math.min(a.z1, Math.max(sg * b.z0, sg * b.z1));
        if (!(s1 - s0 > 1e-6)) return;
        var R = a.r, RT = R + T, A = a.A, C0 = a.o, d = a.d, n1 = ia, n2 = ib, t1 = cross(d, n1), t2 = cross(d, n2), sm = (s0 + s1) / 2;
        // metal through the bend and on into both walls (tangent, T thick), air on both sides of it
        var at = function (n, rr, t, dt, s) { return add(add(add(C0, scale(d, s)), scale(n, rr)), scale(t, dt)); }, ok = true, w = Math.min(T, 0.25 * RT);
        [0.25, 0.5, 0.75].forEach(function (fr) {
          var s = s0 + (s1 - s0) * fr, nm = e(a, a.th0 + A / 2);
          ok = ok && inside(at(nm, R + T / 2, t1, 0, s)) && !inside(at(nm, R - a.sag - dl, t1, 0, s)) && !inside(at(nm, RT + dl, t1, 0, s)) &&
            inside(at(n1, R + T / 2, t1, -w, s)) && !inside(at(n1, R - dl, t1, -w, s)) && !inside(at(n1, RT + dl, t1, -w, s)) &&
            inside(at(n2, R + T / 2, t2, w, s)) && !inside(at(n2, R - dl, t2, w, s)) && !inside(at(n2, RT + dl, t2, w, s));
        });
        if (!ok) return;
        var i1 = wallFace(n1, dot(n1, C0) + RT), i2 = wallFace(n2, dot(n2, C0) + RT);
        if (i1 < 0 || i2 < 0) return;
        var faces = {}, rset = [R, RT];
        mesh.faces.forEach(function (fc, k) {
          var on = fc.polys && fc.polys.length && fc.polys.every(function (p) {
            return p.vertices.every(function (v) {
              var q = sub([v.pos.x, v.pos.y, v.pos.z], C0), z = dot(q, d), rr = len(sub(q, scale(d, z)));
              return z >= s0 - pr && z <= s1 + pr && rset.some(function (x) { return Math.abs(rr - x) <= pr; });
            });
          });
          if (on && Math.abs(dot(fc.normal, d)) < 1e-6) faces[k] = true;
        });
        out.push({ R: R, RT: RT, A: A, C0: C0, d: d, n1: n1, n2: n2, s0: s0, s1: s1, i1: i1, i2: i2, faces: faces, mid: at(e(a, a.th0 + A / 2), RT, t1, 0, sm) });
      });
    });
    return out;
  }
  // lane rfIM: the rounded (filleted) convex edges of a solid, radius r > T, between two flat faces tangent to them:
  // what Convert to Sheet Metal shells into rounded bends (inside radius r − T, outside r). Same records as
  // ibRoundBends (R = r − T, RT = r, i1 / i2 the flat faces, faces the fillet's facets).
  function ibSolidRounds(body, mesh, T, units) {
    var out = [], inside = body.pointTester(), pr = units === 'in' ? 1e-4 : 2.5e-3;
    function flatFace(n, w) {
      for (var i = 0; i < mesh.faces.length; i++) { var fc = mesh.faces[i]; if (dot(fc.normal, n) > 1 - 1e-6 && Math.abs(fc.w - w) <= pr) return i; }
      return -1;
    }
    ibCylGroups(body).forEach(function (g) {
      var a = g.f;
      if (!a || !(a.A > 1e-3) || a.A > Math.PI - 1e-3 || !(a.r > T + pr)) return;
      var e = function (t) { return add(scale(a.e1, Math.cos(t)), scale(a.e2, Math.sin(t))); };
      var n1 = e(a.th0), n2 = e(a.th0 + a.A), nm = e(a.th0 + a.A / 2), C0 = a.o, d = a.d, sm = (a.z0 + a.z1) / 2;
      var at = function (n, rr) { return add(add(C0, scale(d, sm)), scale(n, rr)); };
      if (!inside(at(nm, a.r - Math.min(T, a.r) / 2)) || inside(at(nm, a.r + 1e-3 * T))) return;   // a convex round
      var i1 = flatFace(n1, dot(n1, C0) + a.r), i2 = flatFace(n2, dot(n2, C0) + a.r);
      if (i1 < 0 || i2 < 0) return;
      var faces = {};
      mesh.faces.forEach(function (fc, k) {
        if (fc.polys && fc.polys.length && fc.polys.every(function (p) { return p.surf && p.surf.s && (p.surf.s === g.s || g.polys.indexOf(p) >= 0); })) faces[k] = true;
      });
      out.push({ R: a.r - T, RT: a.r, A: a.A, C0: C0, d: d, n1: n1, n2: n2, s0: a.z0, s1: a.z1, i1: i1, i2: i2, faces: faces, mid: at(nm, a.r), solid: true });
    });
    return out;
  }
  // a point picked on (or stored for) a rounded bend: on either of its surfaces within tol, inside its length and arc
  function ibNearRound(rb, at, tol) {
    if (!at || at.length !== 3) return false;
    var q = sub(at, rb.C0), z = dot(q, rb.d), rad = sub(q, scale(rb.d, z)), rr = len(rad);
    if (z < rb.s0 - tol || z > rb.s1 + tol || !(Math.abs(rr - rb.R) <= tol || Math.abs(rr - rb.RT) <= tol)) return false;
    var a1 = dot(rad, rb.n1), a2 = dot(rad, rb.n2), c = Math.cos(rb.A);   // inside the arc: between n1 and n2
    return rr > 0 && (a1 - a2 * c) / rr >= -tol / rr && (a2 - a1 * c) / rr >= -tol / rr;
  }
  // insertBendsLayout(f, model, { body }) -> { fills, corners, wedges: [{ loop, plane, a, b }] (prisms of `loop` in
  // `plane` from a to b along plane.n; wedges also { R, RT, A, ov } for an exact build: the annulus R … RT from plane.x
  // through A, with ov strips into both plates), info (the bend records), T, R } — plain data for both kernels.
  // f.edges (Convert to Sheet Metal): only the corners whose outer edge passes within the pick tolerance of a point.
  function insertBendsLayout(f, model, ctx) {
    var body = ctx.body, what = f.type === 'convertSM' ? 'Convert to Sheet Metal' : 'Insert Bends';
    if (!body || !body.polygons || !body.polygons.length) throw new Error(what + ': there is no solid to bend yet.');
    var sheet = model.sheet && resolvedModel(model).model.sheet;
    if (!sheet) throw new Error(what + ': the part has no sheet parameters (thickness, bend radius).');
    var T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius, RT = R + T;
    if (!(T > 0) || !isFinite(T)) throw new Error(what + ': the thickness must be a positive number.');
    if (!(R >= 0) || !isFinite(R)) throw new Error(what + ': the bend radius must be zero or more.');
    var relief = f.autoRelief == null ? 'rect' : String(f.autoRelief);
    if (IB_RELIEFS.indexOf(relief) < 0) throw new Error(what + ': Auto Relief must be "rect" or "none".');
    var P0 = f.fixedFace;
    if (!P0 || P0.length !== 3) throw new Error(what + ': pick the fixed face.');
    var mesh = meshFromBody(coplanarBody(body)), edges = bodyEdges(mesh), inside = body.pointTester();
    var tolU = model.units === 'in' ? 0.01 : 0.25, dl = 1e-3 * T, eps = 0.1 * T, ov = T / 2;
    // the outer corner lines: convex edges between two flat faces, merged per face pair and line
    var lines = [];
    edges.forEach(function (e) {
      if (e.faces.length !== 2 || e.smooth || !e.convex) return;
      var n1 = e.normals[0], n2 = e.normals[1], d = e.dir.slice(), big = 0, i1 = e.faces[0], i2 = e.faces[1];
      if (Math.abs(dot(n1, d)) > 1e-6 || Math.abs(dot(n2, d)) > 1e-6) return;
      var c = dot(n1, n2);
      if (c > 0.97 || c < -0.97) return;
      for (var k = 1; k < 3; k++) if (Math.abs(d[k]) > Math.abs(d[big]) + 1e-9) big = k;
      if (d[big] < 0) d = scale(d, -1);
      if (dot(cross(n1, n2), d) < 0) { var sw = n1; n1 = n2; n2 = sw; sw = i1; i1 = i2; i2 = sw; }
      var sa = dot(e.a, d), sb = dot(e.b, d), O0 = sub(e.a, scale(d, sa)), hit = null;
      lines.forEach(function (L) { if (!hit && L.i1 === i1 && L.i2 === i2 && len(sub(L.O0, O0)) < 1e-6 * (1 + len(O0))) hit = L; });
      if (!hit) lines.push(hit = { i1: i1, i2: i2, n1: n1, n2: n2, d: d, c: c, O0: O0, segs: [] });
      hit.segs.push([Math.min(sa, sb), Math.max(sa, sb)]);
    });
    var bends = [], plates = [];
    function plateOf(n, w) {
      for (var i = 0; i < plates.length; i++) if (dot(plates[i].n, n) > 1 - 1e-9 && Math.abs(plates[i].w - w) < 1e-6 * (1 + Math.abs(w))) return i;
      // lane rfIH: the same wall seen from its other face (a Z's web: the outside of one bend, the inside of the next)
      for (i = 0; i < plates.length; i++) if (dot(plates[i].n, n) < -1 + 1e-9 && Math.abs(T - plates[i].w - w) < 1e-6 * (1 + Math.abs(w))) return i;
      plates.push({ n: n, w: w });
      return plates.length - 1;
    }
    lines.forEach(function (L) {
      L.segs.sort(function (a, b) { return a[0] - b[0]; });
      var runs = [];
      L.segs.forEach(function (s) { var r = runs[runs.length - 1]; if (r && s[0] <= r[1] + 1e-7 * (1 + Math.abs(s[0]))) r[1] = Math.max(r[1], s[1]); else runs.push(s.slice()); });
      var c = L.c;
      function P(a, b, s) { var al = (a - b * c) / (1 - c * c), be = (b - a * c) / (1 - c * c); return add(add(L.O0, add(scale(L.n1, al), scale(L.n2, be))), scale(L.d, s)); }
      var bp = Math.min(-RT, -RT + (R + T / 2) * c) - dl;
      runs.forEach(function (r) {
        var sm = (r[0] + r[1]) / 2;
        if (f.edges && !f.edges.some(function (q) {
          var at = Array.isArray(q) ? q : q.at, s = Math.max(r[0], Math.min(r[1], dot(at, L.d)));
          return len(sub(at, add(L.O0, scale(L.d, s)))) < tolU;
        })) return;
        var ok = inside(P(-T / 2, -T / 2, sm)) && !inside(P(-T - dl, -T - dl, sm)) &&
          inside(P(-T / 2, bp, sm)) && inside(P(-T + dl, bp, sm)) && !inside(P(-T - dl, bp, sm)) && !inside(P(dl, bp, sm)) &&
          inside(P(bp, -T / 2, sm)) && inside(P(bp, -T + dl, sm)) && !inside(P(bp, -T - dl, sm)) && !inside(P(bp, dl, sm));
        // lane FW: both plates must run on unbroken from the corner square to bp: a one-sided Rip (side 1 / side 2)
        // keeps one wall's corner square, whose end face lies in the other wall's outer plane, so the edge looked like a
        // bend across the rip gap and the box read as a closed ring (rfGA G42)
        for (var k = 0; ok && k <= 4; k++) { var dk = -T - dl + (bp + T + dl) * k / 4; ok = inside(P(dk, -T / 2, sm)) && inside(P(-T / 2, dk, sm)); }
        if (!ok) return;
        bends.push({ L: L, P: P, s0: r[0], s1: r[1], A: Math.acos(Math.max(-1, Math.min(1, c))), p1: plateOf(L.n1, dot(L.n1, L.O0)), p2: plateOf(L.n2, dot(L.n2, L.O0)) });
      });
    });
    // lane rfIH: bends already rounded in the part keep their own radius (the PM's radius is for sharp corners only)
    ibRoundBends(body, mesh, T, model.units).forEach(function (rb) {
      if (f.edges && !f.edges.some(function (q) { return ibNearRound(rb, Array.isArray(q) ? q : q.at, tolU); })) return;
      var c = Math.cos(rb.A), O0 = add(rb.C0, scale(add(rb.n1, rb.n2), rb.RT / (1 + c)));
      var L = { i1: rb.i1, i2: rb.i2, n1: rb.n1, n2: rb.n2, d: rb.d, c: c, O0: O0 };
      var P = function (a, b, s) { var al = (a - b * c) / (1 - c * c), be = (b - a * c) / (1 - c * c); return add(add(O0, add(scale(L.n1, al), scale(L.n2, be))), scale(L.d, s)); };
      bends.push({ L: L, P: P, s0: rb.s0, s1: rb.s1, A: rb.A, round: rb, p1: plateOf(rb.n1, dot(rb.n1, O0)), p2: plateOf(rb.n2, dot(rb.n2, O0)) });
    });
    if (!bends.length) throw new Error(what + ': there is no sharp corner between two walls ' + bcNum(T) + ' thick to bend (the sheet thickness).');
    // the fixed face's plate (its outer face or the face T behind it)
    var fixed = -1, fd = Infinity;
    plates.forEach(function (pl, i) {
      var w = dot(pl.n, P0), dd = Math.min(Math.abs(w - pl.w), Math.abs(w - (pl.w - T)));
      if (dd < tolU && dd < fd) { fixed = i; fd = dd; }
    });
    if (fixed < 0) throw new Error(what + ': the fixed face at ' + bcPt(P0) + ' is not a wall next to a bend.');
    // the plates as a tree from the fixed one: each bend is unfolded from the plate nearer the fixed face
    var parent = {}, queue = [fixed];
    parent[fixed] = -1;
    while (queue.length) {
      var pk = queue.shift();
      bends.forEach(function (b) {
        if (b.base != null) return;
        var other = b.p1 === pk ? b.p2 : (b.p2 === pk ? b.p1 : null);
        if (other == null) return;
        if (other in parent && parent[other] !== pk) throw new Error(what + ': the bends close a ring at ' + bcPt(b.P(0, 0, (b.s0 + b.s1) / 2)) + ': rip a corner first (Sheet Metal ▸ Rip) so the part can unfold.');
        b.base = pk;
        if (!(other in parent)) { parent[other] = pk; queue.push(other); }
      });
    }
    bends.forEach(function (b) { if (b.base == null) throw new Error(what + ': the bend at ' + bcPt(b.P(0, 0, (b.s0 + b.s1) / 2)) + ' is not joined to the fixed face.'); });
    // square corners where two bends meet: each stops R + T short, the (R + T) cube there is cut out
    var corners = [], cornerKeys = {};
    bends.forEach(function (b, i) {
      b.trim = [false, false];
      if (b.round) return;   // lane rfIH: a rounded bend is the part's own: nothing is cut at its ends
      [b.s0, b.s1].forEach(function (s, k) {
        var E = b.P(0, 0, s), tolE = 1e-5 * (1 + len(E));
        var j = -1;
        bends.forEach(function (q, jj) { if (jj !== i && j < 0 && !q.round && Math.abs(dot(q.L.d, b.L.d)) < 0.999 && (len(sub(q.P(0, 0, q.s0), E)) < tolE || len(sub(q.P(0, 0, q.s1), E)) < tolE)) j = jj; });
        if (j < 0) return;
        if (relief === 'none') throw new Error(what + ': two bends meet at ' + bcPt(E) + ': turn Auto Relief on (or rip the corner).');
        var q = bends[j];
        if (Math.abs(b.L.c) > 1e-6 || Math.abs(q.L.c) > 1e-6 || Math.abs(dot(q.L.d, b.L.d)) > 1e-6) {
          // lane rfIM: a corner that is not square (walls off 90°: a tray with flared walls, a hopper; or a plate corner
          // off 90°). Both bends leave the plate they share; each stops where its bend zone (the strip RT·tan(A/2)
          // wide on that plate, from the outer sharp) leaves the other's: t = (S_q + max(0, S_b·cos φ)) / sin φ, φ
          // the plate's corner angle, and its own corner kite is cut out over that length (the relief). Square
          // corners keep the (R + T) cube (the same region).
          if (!(b.p1 === q.p1 || b.p1 === q.p2 || b.p2 === q.p1 || b.p2 === q.p2)) throw new Error(what + ': two bends meet at ' + bcPt(E) + ' without a wall in common; rip the corner.');
          var ub = scale(b.L.d, k ? -1 : 1), uq = scale(q.L.d, len(sub(q.P(0, 0, q.s0), E)) < tolE ? 1 : -1), cphi = dot(ub, uq), sphi = Math.sqrt(Math.max(0, 1 - cphi * cphi));
          if (!(sphi > 1e-3)) throw new Error(what + ': two bends meet at ' + bcPt(E) + ' along one line.');
          var Sb = RT * Math.tan(b.A / 2), Sq = RT * Math.tan(q.A / 2), tb = (Sq + Math.max(0, Sb * cphi)) / sphi;
          b.trim[k] = tb;
          var cA = Math.cos(b.A), sA = Math.sin(b.A), RTe = RT + eps, C0 = sub(b.L.O0, scale(add(b.L.n1, b.L.n2), RT / (1 + b.L.c)));
          corners.push({ loop: [[0, 0], [RTe, 0], [RTe, RTe * Math.tan(b.A / 2)], [RTe * cA, RTe * sA]], plane: { origin: C0, x: b.L.n1, y: norm(sub(b.L.n2, scale(b.L.n1, b.L.c))), n: b.L.d }, a: k ? s - tb : s - eps, b: k ? s + eps : s + tb });
          return;
        }
        b.trim[k] = RT;
        var key = E.map(function (x) { return Math.round(x * 1e5); }).join(',');
        if (cornerKeys[key]) return;
        cornerKeys[key] = true;
        corners.push({ loop: [[-RT, -RT], [eps, -RT], [eps, eps], [-RT, eps]], plane: { origin: b.L.O0, x: b.L.n1, y: b.L.n2, n: b.L.d }, a: k ? s - RT : s - eps, b: k ? s + eps : s + RT });
      });
    });
    var fills = [], wedges = [], info = [], segs = function (A) { return Math.max(4, Math.round(8 * A / (Math.PI / 2))); };
    var Rs = R;
    bends.forEach(function (b) {
      var R = b.round ? b.round.R : Rs, RT = R + T;   // lane rfIH: a rounded bend's own radius
      var L = b.L, c = L.c, A = b.A, sA = Math.sin(A), cA = Math.cos(A), tA = Math.tan(A / 2);
      var s0 = b.s0 + (b.trim[0] || 0), s1 = b.s1 - (b.trim[1] || 0), sm = (b.s0 + b.s1) / 2;   // rfIM: trims are lengths
      if (!(s1 - s0 > 1e-6)) throw new Error(what + ': the bend at ' + bcPt(b.P(0, 0, sm)) + ' is shorter than its corner reliefs (R + T at each end).');
      var X = L.n1, Y = norm(sub(L.n2, scale(L.n1, c))), C0 = sub(L.O0, scale(add(L.n1, L.n2), RT / (1 + c)));
      var plane = { origin: C0, x: X, y: Y, n: L.d };
      if (!b.round) {   // lane rfIH: a rounded bend is already there; only its record is written
        var bpp = Math.min(-RT, -RT + (R + T / 2) * c) - dl;
        var free = function (s, sg) { var q = s + sg * dl; return !inside(b.P(-T / 2, -T / 2, q)) && !inside(b.P(-T / 2, bpp, q)) && !inside(b.P(bpp, -T / 2, q)); };
        var e0 = b.trim[0] || free(b.s0, -1) ? eps : 0, e1 = b.trim[1] || free(b.s1, 1) ? eps : 0, RTe = RT + eps;
        fills.push({ loop: [[0, 0], [RTe, 0], [RTe, RTe * tA], [RTe * cA, RTe * sA]], plane: plane, a: b.s0 - e0, b: b.s1 + e1 });
        var n = segs(A), loop = [[R, -ov], [RT, -ov]], k;
        for (k = 0; k <= n; k++) loop.push([RT * Math.cos(A * k / n), RT * Math.sin(A * k / n)]);
        loop.push([RT * cA - ov * sA, RT * sA + ov * cA], [R * cA - ov * sA, R * sA + ov * cA]);
        if (R > 0) for (k = n; k >= 0; k--) loop.push([R * Math.cos(A * k / n), R * Math.sin(A * k / n)]);
        else loop.push([0, 0]);
        if (signedArea(loop) < 0) loop.reverse();
        wedges.push({ loop: loop, plane: plane, a: s0, b: s1, R: R, RT: RT, A: A, ov: ov });
      }
      // the record: a Material Inside flange from the base plate (the one nearer the fixed face)
      var baseIs1 = b.base === b.p1, nb = baseIs1 ? L.n1 : L.n2, nw = baseIs1 ? L.n2 : L.n1, iw = baseIs1 ? L.i2 : L.i1;
      var o = norm(sub(nw, scale(nb, c))), u = scale(nb, -1);
      var a3 = add(add(C0, scale(L.d, s0)), scale(nb, R)), b3 = add(add(C0, scale(L.d, s1)), scale(nb, R)), mid = scale(add(a3, b3), 0.5);
      var tw = add(scale(o, cA), scale(u, sA)), Wt = add(add(C0, scale(L.d, (s0 + s1) / 2)), scale(nw, RT)), Lw = 0, ol;
      try { ol = faceOutline(mesh, iw); } catch (e) { ol = null; }
      if (ol) ol.loops.forEach(function (l) { l.forEach(function (p) { Lw = Math.max(Lw, dot(sub(to3D(ol.plane, p[0], p[1]), Wt), tw)); }); });
      if (!(Lw > ov)) throw new Error(what + ': the wall at ' + bcPt(b.P(0, 0, sm)) + ' is too short for the bend (R + T = ' + bcNum(RT) + ').');
      info.push({ kind: 'edge', a: a3, b: b3, mid: mid, origin: mid, o: o, u: u, len: s1 - s0, angle: A, R: R, L: Lw, T: T, ba: null,
        mitred: [false, false], miterPlanes: [null, null] });
    });
    return { fills: fills, corners: corners, wedges: wedges, info: info, T: T, R: R, rounded: bends.filter(function (b) { return b.round; }).length };
  }
  // lane rfIM: Convert to Sheet Metal's Reverse thickness (SolidWorks: the solid's faces become the inside of the
  // sheet). The kept faces are thickened outward by T: a slab T thick on each, its outline grown across every edge to
  // another kept face by T·tan(φ/2) (φ the dihedral turn; shrunk at a concave edge), so neighbouring slabs meet at
  // the sharp offset corner, and not grown at an edge to a removed face (the open side stays flush). The grown solid
  // is then converted as usual (shell T inward, rips, bends) with the bend edges moved to the offset corners
  // (E + T(n1 + n2) / (1 + cos φ)) and the fixed face moved T out; the stored fixed face (the solid's face) is the
  // inside face of the fixed wall afterwards. -> { slabs: [{ loop, plane, a, b }], holes: [same], bends, fixedFace }
  // (plain data, both kernels)
  function convertSMReverse(mesh, kept, bendE, T, P0, fixed, tol) {
    var edges = bodyEdges(mesh).filter(function (e) { return e.faces.length === 2; }), slabs = [], holes = [];
    function segDist(M, a, b) {
      var ab = sub(b, a), L2 = dot(ab, ab), t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(M, a), ab) / L2)) : 0;
      return len(sub(M, add(a, scale(ab, t))));
    }
    function grow(l, ds) {   // each edge moved ds[j] to its right ((dy, −dx): away from the region for outer and hole loops)
      var n = l.length, lines = [];
      for (var j = 0; j < n; j++) {
        var p = l[j], q = l[(j + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, m = [dy / L, -dx / L];
        lines.push({ p: [p[0] + m[0] * ds[j], p[1] + m[1] * ds[j]], d: [dx / L, dy / L] });
      }
      return l.map(function (v, j) {
        var A = lines[(j + n - 1) % n], B = lines[j], den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
        if (Math.abs(den) < 1e-9) return B.p.slice();
        var t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den;
        return [A.p[0] + A.d[0] * t, A.p[1] + A.d[1] * t];
      });
    }
    Object.keys(kept).forEach(function (k) {
      var i = +k, o = faceOutline(mesh, i), nf = mesh.faces[i].normal, sg = dot(o.plane.n, nf) > 0 ? 1 : -1;
      o.loops.forEach(function (l) {
        var ds = l.map(function (p, j) {
          var q = l[(j + 1) % l.length], M = scale(add(to3D(o.plane, p[0], p[1]), to3D(o.plane, q[0], q[1])), 0.5);
          var e = edges.filter(function (x) { return (x.faces[0] === i || x.faces[1] === i) && segDist(M, x.a, x.b) < 1e-6 * (1 + len(M)); })[0];
          if (!e) return 0;
          var jf = e.faces[0] === i ? e.faces[1] : e.faces[0];
          if (!kept[jf]) return 0;
          var d = T * Math.tan(Math.acos(Math.max(-1, Math.min(1, dot(e.normals[0], e.normals[1])))) / 2);
          return e.convex === false ? -d : d;
        });
        var g = grow(l, ds), t = { loop: signedArea(g) < 0 ? g.slice().reverse() : g, plane: o.plane, a: sg > 0 ? 0 : -T, b: sg > 0 ? T : 0 };
        (signedArea(l) > 0 ? slabs : holes).push(t);
      });
    });
    var bends = bendE.map(function (e) {
      var n1 = e.normals[0], n2 = e.normals[1];
      return add(e.mid, scale(add(n1, n2), T / (1 + dot(n1, n2))));
    });
    return { slabs: slabs, holes: holes, bends: bends, fixedFace: add(P0, scale(mesh.faces[fixed].normal, T)) };
  }
  // the Convert feature as it runs on the grown solid of a Reverse thickness (both kernels)
  function convertSMReversed(f, rv) { return Object.assign({}, f, { reverse: false, fixedFace: rv.fixedFace, bendEdges: rv.bends, ripEdges: null }); }
  // convertSMPlan(f, model, { body }) -> { removed: [[x, y, z]] (a point inside each face the shell removes), rips:
  // [{ at }], bends: [[x, y, z]] (the bend edges' mid points), T }: Convert to Sheet Metal's steps as plain data
  function convertSMPlan(f, model, ctx) {
    var body = ctx.body, what = 'Convert to Sheet Metal';
    if (!body || !body.polygons || !body.polygons.length) throw new Error(what + ': there is no solid to convert yet.');
    var sheet = model.sheet && resolvedModel(model).model.sheet;
    if (!sheet) throw new Error(what + ': the part has no sheet parameters (thickness, bend radius).');
    var T = +sheet.thickness, P0 = f.fixedFace;
    if (!P0 || P0.length !== 3) throw new Error(what + ': pick the fixed face.');
    var mesh = meshFromBody(coplanarBody(body)), tol = model.units === 'in' ? 0.01 : 0.25;
    var fixed = ibFaceAt(mesh, P0, tol);
    if (fixed < 0) throw new Error(what + ': there is no flat face at ' + bcPt(P0) + '.');
    var sharp = bodyEdges(mesh).filter(function (e) { return e.faces.length === 2 && !e.smooth && e.convex; });
    if (!f.bendEdges || !f.bendEdges.length) throw new Error(what + ': pick the bend edges.');
    var round = null, facets = {};
    var bendE = f.bendEdges.map(function (s) {
      var at = Array.isArray(s) ? s : s.at, hit = resolveEdges([{ at: at, chain: false }], sharp, tol)[0];
      if (!hit) {   // lane rfIH: a point on a rounded bend joins its two walls (its facets are kept, never shelled)
        if (!round) round = ibRoundBends(body, mesh, T, model.units).concat(ibSolidRounds(body, mesh, T, model.units));   // rfIM: a solid's fillets (shelled into bends)
        var rb = round.filter(function (q) { return ibNearRound(q, at, tol); })[0];
        if (rb) { Object.keys(rb.faces).forEach(function (k) { facets[k] = true; }); return { faces: [rb.i1, rb.i2], mid: at.slice(), round: true }; }
      }
      if (!hit) throw new Error(what + ': there is no sharp edge or rounded bend at ' + bcPt(at) + '.');
      return hit;
    });
    var kept = {}, grew = true;
    kept[fixed] = true;
    while (grew) {
      grew = false;
      bendE.forEach(function (e) {
        var a = e.faces[0], b = e.faces[1];
        if (kept[a] && !kept[b]) { kept[b] = true; grew = true; } else if (kept[b] && !kept[a]) { kept[a] = true; grew = true; }
      });
    }
    bendE.forEach(function (e) { if (!kept[e.faces[0]]) throw new Error(what + ': the bend edge at ' + bcPt(e.mid) + ' does not reach the fixed face (directly or across other bend edges).'); });
    var removed = [];
    mesh.faces.forEach(function (g, i) {
      if (kept[i] || facets[i]) return;
      var o;
      try { o = faceOutline(mesh, i); } catch (e) { o = null; }
      var l = o && o.loops.filter(function (q) { return signedArea(q) > 0; }).sort(function (p, q) { return signedArea(q) - signedArea(p); })[0];
      var q = l && loopInteriorPoint(l);
      if (q) removed.push(to3D(o.plane, q[0], q[1]));
    });
    if (!removed.length) throw new Error(what + ': every face of the solid is kept: there is no open side (pick the bend edges round one face).');
    // lane rfIE: a part already T thick at the fixed face (a thin-walled channel, a shelled box) is not shelled again:
    // its kept faces are the outer faces of walls T thick, so the rips and bends go straight on (Rip + Insert Bends)
    var wall = null, pr = model.units === 'in' ? 1e-4 : 2.5e-3;
    try { wall = sheetThicknessAt(body, P0, model.units); } catch (e) { wall = null; }
    var thin = wall != null && Math.abs(wall - T) <= pr;
    if (!thin && wall != null && wall < 2 * T + pr) throw new Error(what + ': the part is ' + bcNum(wall) + ' thick at the fixed face: set the thickness to ' + bcNum(wall) + ' to convert its walls as they are (or below ' + bcNum(wall / 2) + ' to shell a solid).');
    if (f.reverse) {   // lane rfIM: Reverse thickness: the sheet goes outside the kept faces
      if (thin) throw new Error(what + ': Reverse thickness is for a solid; this part is already ' + bcNum(T) + ' thick at the fixed face.');
      if (Object.keys(facets).length || bendE.some(function (e) { return e.round; })) throw new Error(what + ': Reverse thickness works on sharp bend edges only (not on rounded edges).');
      return { reverse: convertSMReverse(mesh, kept, bendE, T, P0, fixed, tol), T: T, thin: false };
    }
    function pairOf(e) { return Math.min(e.faces[0], e.faces[1]) + '|' + Math.max(e.faces[0], e.faces[1]); }
    var bendPairs = {}, rips = [];
    bendE.forEach(function (e) { bendPairs[pairOf(e)] = true; });
    if (f.ripEdges && f.ripEdges.length) rips = f.ripEdges.map(function (s) { return { at: (Array.isArray(s) ? s : s.at).slice() }; });
    else {
      var seen = {};
      sharp.forEach(function (e) {
        var k = pairOf(e);
        if (!kept[e.faces[0]] || !kept[e.faces[1]] || bendPairs[k] || seen[k]) return;
        seen[k] = true;
        rips.push({ at: e.mid.slice() });
      });
    }
    return { removed: removed, rips: rips, bends: bendE.map(function (e) { return e.mid.slice(); }), T: T, thin: thin };
  }
  // lane rfIE: Convert to Sheet Metal's Collect All Bends (SolidWorks 2024: the button under the Bend Edges list).
  // convertSMCollect(body, fixedFace, { thickness, units }) -> { bends: [[x, y, z]] (edge mid points, as hand picks are
  // stored), rips: [[x, y, z]] (what Convert will rip), T (the thickness used), wall (the part's thickness at the fixed
  // face, null when it has none), rounded (tangent edges on the kept faces that belong to no rounded bend) }. Lane rfIH:
  // a rounded bend (ibRoundBends) joins its two walls like a sharp bend edge; its point is on its outer face.
  // A bend is a sharp convex edge between two flat faces with the inside corner T behind both (a concave edge on the
  // line where the two faces' planes, moved T inward, meet): the outside corner of two walls T thick. From the fixed
  // face the walls are reached across such edges, nearest first (a breadth-first tree); an edge that would close a ring
  // of walls (a box's vertical corner) is left out: Convert rips it, exactly as when the bends are picked by hand. A
  // solid block has no such edges (nothing is collected). T is opts.thickness; when nothing qualifies at it and the
  // part's own wall at the fixed face does, the wall is used (T reports it).
  function convertSMCollect(body, P0, opts) {
    opts = opts || {};
    var what = 'Collect All Bends', units = opts.units || 'mm';
    if (!body || !body.polygons || !body.polygons.length) throw new Error(what + ': there is no solid to convert yet.');
    if (!P0 || P0.length !== 3) throw new Error(what + ': pick the fixed face first.');
    var mesh = meshFromBody(coplanarBody(body)), tol = units === 'in' ? 0.01 : 0.25, pr = units === 'in' ? 1e-4 : 2.5e-3;
    var fixed = ibFaceAt(mesh, P0, tol);
    if (fixed < 0) throw new Error(what + ': there is no flat face at ' + bcPt(P0) + '.');
    var wall = null;
    try { wall = sheetThicknessAt(body, P0, units); } catch (e) { wall = null; }
    var edges = bodyEdges(mesh), two = edges.filter(function (e) { return e.faces.length === 2; });
    var convex = two.filter(function (e) { return !e.smooth && e.convex; }), concave = two.filter(function (e) { return !e.smooth && e.convex === false; });
    function collect(T) {
      var cand = convex.filter(function (e) {
        var A = mesh.faces[e.faces[0]], B = mesh.faces[e.faces[1]];
        if (Math.abs(dot(A.normal, B.normal)) > 1 - 1e-9) return false;
        return concave.some(function (c) {
          if (Math.abs(dot(c.dir, e.dir)) < 1 - 1e-9) return false;
          return Math.abs(A.w - dot(A.normal, c.mid) - T) <= pr && Math.abs(B.w - dot(B.normal, c.mid) - T) <= pr;
        });
      });
      // lane rfIH: a rounded bend (inner R, outer R + T, walls T thick on both ends) joins its two walls' outer faces
      var round = [], facet = {};
      try { round = ibRoundBends(body, mesh, T, units); } catch (e) { round = []; }
      round.forEach(function (rb) { Object.keys(rb.faces).forEach(function (k) { facet[k] = true; }); cand.push({ faces: [rb.i1, rb.i2], mid: rb.mid }); });
      var kept = {}, tree = {}, queue = [fixed];
      kept[fixed] = true;
      function key(a, b) { return Math.min(a, b) + '|' + Math.max(a, b); }
      while (queue.length) {
        var i = queue.shift();
        cand.forEach(function (e) {
          var o = e.faces[0] === i ? e.faces[1] : e.faces[1] === i ? e.faces[0] : -1;
          if (o < 0 || kept[o]) return;
          kept[o] = true; tree[key(i, o)] = true; queue.push(o);
        });
      }
      var bends = [], rips = [];
      cand.forEach(function (e) {
        if (!kept[e.faces[0]] || !kept[e.faces[1]]) return;
        (tree[key(e.faces[0], e.faces[1])] ? bends : rips).push(e.mid.slice());
      });
      var rounded = two.filter(function (e) { return e.smooth && (kept[e.faces[0]] || kept[e.faces[1]]) && !facet[e.faces[0]] && !facet[e.faces[1]]; }).length;   // rfIH: rounded edges that are no bend
      return { bends: bends, rips: rips, T: T, wall: wall, rounded: rounded };
    }
    var T = +opts.thickness > 0 ? +opts.thickness : wall;
    if (!(T > 0)) return { bends: [], rips: [], T: null, wall: wall, rounded: 0 };
    var r = collect(T);
    if (!r.bends.length && wall != null && Math.abs(wall - T) > pr) { var w = collect(wall); if (w.bends.length) r = w; }
    return r;
  }
  function ibRipGap(f, model) { return f.gap != null ? +f.gap : ripDefaultGap(model); }
  // the Insert Bends step Convert to Sheet Metal runs after its shell and rips (both kernels)
  function convertSMInsert(f, plan) { return { id: f.id, type: 'convertSM', fixedFace: f.fixedFace, edges: plan.bends, radius: f.radius, autoRelief: f.autoRelief }; }
  // buildInsertBends(f, model, ctx) -> { body, info } (Insert Bends and Convert to Sheet Metal; a rebuildModel case)
  function buildInsertBends(f, model, ctx) {
    if (isOpenBase(f)) return buildOpenBase(f, model, ctx);   // lane open-base
    var body = ctx.body, g = f;
    if (f.type === 'convertSM') {
      var plan = convertSMPlan(f, model, ctx), gap = ibRipGap(f, model);
      if (!(gap > 0) || !isFinite(gap)) throw new Error('Convert to Sheet Metal: the rip gap must be a positive number.');
      if (plan.reverse) {   // lane rfIM: Reverse thickness: thicken outward, then convert the grown solid
        var rv = plan.reverse;
        body = body.union(unionAll(rv.slabs.map(function (t) { return prism(t.loop, t.plane, t.a, t.b, f.id); })));
        if (rv.holes.length) body = body.subtract(unionAll(rv.holes.map(function (t) { return prism(t.loop, t.plane, t.a, t.b, f.id); })));
        plan = convertSMPlan(convertSMReversed(f, rv), model, { body: body });
      }
      if (!plan.thin) body = _.buildShell({ thickness: plan.T, faces: plan.removed.map(function (p) { return { at: p }; }) }, { body: body, units: model.units || 'mm' }).body;   // lane rfIE: thin walls stay
      if (plan.rips.length) body = body.subtract(buildRip({ id: f.id, edges: plan.rips, gap: gap, direction: 'both' }, model, { body: body }));
      g = convertSMInsert(f, plan);
    }
    if (model.noBends) return { body: body, info: [], tool: null };   // No Bends: the part as it was before its bends were inserted
    var lay = insertBendsLayout(g, model, { body: body });
    if (!lay.wedges.length) return { body: body, info: lay.info, tool: null, bends: lay.info.length, rounded: lay.rounded };   // lane rfIH: every bend was already rounded
    var cut = unionAll(lay.fills.concat(lay.corners).map(function (t) { return prism(t.loop, t.plane, t.a, t.b, f.id); }));
    var put = unionAll(lay.wedges.map(function (t) { return prism(t.loop, t.plane, t.a, t.b, f.id, bendCv(t.loop, [0, 0], [t.R, t.RT])); }));
    return { body: body.subtract(cut).union(put), info: lay.info, tool: put, bends: lay.info.length, rounded: lay.rounded };
  }
  // insertBendsPreview(f, model, body) -> { body: the bends (Insert Bends) or the converted part (Convert), bends: count }
  // for the PropertyManagers' preview (model carries the sheet the PM would write)
  function insertBendsPreview(f, model, body) {
    var r = buildInsertBends(f, model, { body: body });
    return { body: f.type === 'convertSM' ? r.body : r.tool, bends: r.info.length, rounded: r.rounded || 0 };
  }
  // lane rfIM: the rounded bend under a point the user clicked (a bend already rounded, or a solid's fillet that
  // Convert shells into one): { mid (a point on its outside face, as Collect stores it), R, RT, A } or null
  function insertBendsRoundAt(body, P, T, units) {
    if (!body || !body.polygons || !body.polygons.length || !P || !(T > 0)) return null;
    var mesh = meshFromBody(coplanarBody(body)), tol = units === 'in' ? 0.01 : 0.25, hit = null;
    ibRoundBends(body, mesh, T, units).concat(ibSolidRounds(body, mesh, T, units)).forEach(function (rb) { if (!hit && ibNearRound(rb, P, tol)) hit = rb; });
    return hit && { mid: hit.mid.slice(), R: hit.R, RT: hit.RT, A: hit.A, solid: !!hit.solid };
  }

  // ------------------------------------------------------------------ Base Flange from an open profile (lane open-base)
  // SolidWorks' Base Flange on an open chain of lines (arcs between them are that joint's radius): the sketch lines are
  // one face of the sheet, T goes to one side, each sharp corner gets the sheet's bend radius (the sketch corner is the
  // virtual sharp of that face), and Direction 1 is the depth. Feature JSON { type: 'insertBends', openBase: true,
  // sketch, depth, end: 'blind' | 'mid', reverse (depth direction), flip (thickness side), radius?, sheetBase: true,
  // name: 'Base-Flange1' }: an Insert Bends type on purpose, so rebuildModel's case hands the records to ctx.flanges and
  // flatPattern, Unfold, DXF and the drawings read them with no new code. Default side: the side the chain turns to
  // (a U or an L sketched by its outside dimensions, whichever way it was drawn); a Z: left of the first line as drawn.
  // The whole section is ONE prism, its bend chords tagged { c, r }, so there is no boolean and massProps is exact.
  function isOpenBase(f) { return !!f && f.type === 'insertBends' && !!f.openBase; }
  // true when a sketch holds lines but no closed profile: what Base Flange builds as an open profile
  function isOpenProfile(sketch) {
    if (!sketch) return false;
    var ents = (sketch.entities || []).filter(function (e) { return e && !e.construction && e.t !== 'point' && e.t !== 'text' && !K.noProfileEntity(sketch, e); });
    if (!ents.some(function (e) { return e.t === 'line' || e.t === 'polyline'; })) return false;
    try { return !K.sketchProfile({ entities: ents, layers: sketch.layers }).loops.length; } catch (e) { return false; }
  }
  // the sketch with its open polylines written out as lines, for miterProfile
  function obLines(sketch) {
    var out = [];
    (sketch.entities || []).forEach(function (e) {
      if (!e || e.t !== 'polyline') { if (e) out.push(e); return; }
      var n = e.pts.length;
      for (var i = 0; i + 1 < n + (e.closed ? 1 : 0); i++) out.push(Object.assign({}, e, { t: 'line', x1: +e.pts[i][0], y1: +e.pts[i][1], x2: +e.pts[(i + 1) % n][0], y2: +e.pts[(i + 1) % n][1] }));
    });
    return Object.assign({}, sketch, { entities: out });
  }
  // openBaseLayout(f, model, { planes, sketches? }) -> { plane, a, b, loop, cv, plates: [{ pts }], wedges (as Insert
  // Bends' for ibWedge), info (the bend records), fixed (a point on the fixed face), flatPlane, flats, T } (plain data,
  // both kernels). Records: Material Inside flanges from the plate nearer the fixed plate (the longest flat, the first
  // of equal ones). SolidWorks 2022 (measured, rfGW, L / U / Z both ways): the thickness goes on the right of the chain
  // as it runs, the sketch's first line to its last, whichever way the chain turns; the flat lies on the fixed plate's
  // face on the sketch line, looking away from the material, so a flange that bends toward that side reads UP.
  function openBaseLayout(f, model, ctx) {
    var sheet = model.sheet && resolvedModel(model).model.sheet;
    if (!sheet) throw new Error('Base Flange: the part has no sheet parameters (thickness, bend radius).');
    var T = +sheet.thickness, R0 = f.radius != null ? +f.radius : +sheet.bendRadius, D = +f.depth;
    if (!(T > 0) || !isFinite(T)) throw new Error('Base Flange: the thickness must be a positive number.');
    if (!(R0 >= 0) || !isFinite(R0)) throw new Error('Base Flange: the bend radius must be zero or more.');
    if (!(D > 0) || !isFinite(D)) throw new Error('Base Flange: the depth must be a positive number.');
    var prof;
    var obSk = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch), obSks = {};
    if (obSk) obSks[f.sketch] = obLines(obSk);
    try { prof = miterProfile(f, model, { sketches: obSks, planes: ctx.planes }); }
    catch (e) { throw new Error(String(e.message).replace(/miter flange/gi, 'base flange').replace(' starting on an edge of the sheet', '')); }
    var plane = prof.plane, pts = prof.pts, m = pts.length - 1, segs = [], i, j, k;
    for (i = 0; i < m; i++) {
      var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], SL = Math.hypot(dx, dy);
      segs.push({ d: [dx / SL, dy / SL], l: [-dy / SL, dx / SL], L: SL });
    }
    var joints = [];
    for (j = 0; j + 1 < m; j++) {
      var cr = segs[j].d[0] * segs[j + 1].d[1] - segs[j].d[1] * segs[j + 1].d[0], dt = segs[j].d[0] * segs[j + 1].d[0] + segs[j].d[1] * segs[j + 1].d[1];
      var A = Math.atan2(Math.abs(cr), dt), t = cr > 0 ? 1 : -1;
      joints.push({ A: A, t: t });
    }
    var s = f.flip ? 1 : -1;   // s: the material's side of the chain (+1 left)
    joints.forEach(function (J, q) {
      var outer = J.t === s, r = prof.radii[q];   // outer: the sketch line is the bend's outside face
      J.R = r != null ? (outer ? r - T : r) : R0;
      if (J.R < -1e-9) throw new Error('Base Flange: the arc of radius ' + bcNum(r) + ' in the profile is smaller than the thickness ' + bcNum(T) + ' on the outside of its bend.');
      J.R = Math.max(0, J.R);
      J.rho = outer ? J.R + T : J.R;   // radius on the sketch's face
      J.rho2 = outer ? J.R : J.R + T;  // on the other face
      J.sb = J.rho * Math.tan(J.A / 2);
      var T1 = [pts[q + 1][0] - segs[q].d[0] * J.sb, pts[q + 1][1] - segs[q].d[1] * J.sb];
      J.C = [T1[0] + J.t * segs[q].l[0] * J.rho, T1[1] + J.t * segs[q].l[1] * J.rho];
      J.a0 = Math.atan2(-J.t * segs[q].l[1], -J.t * segs[q].l[0]);
      J.n = Math.max(4, Math.round(8 * J.A / (Math.PI / 2)));
    });
    var flats = segs.map(function (g, q) {
      var fl = g.L - (q > 0 ? joints[q - 1].sb : 0) - (q < m - 1 ? joints[q].sb : 0);
      if (!(fl > 1e-6)) throw new Error('Base Flange: line ' + (q + 1) + ' of the profile (' + bcNum(g.L) + ' long) is too short for its bend radius; it needs more than ' + bcNum(g.L - fl) + '.');
      return fl;
    });
    function at(J, r, q) { var th = J.a0 + J.t * J.A * q / J.n; return [J.C[0] + r * Math.cos(th), J.C[1] + r * Math.sin(th)]; }
    function off(p, g) { return [p[0] + s * T * g.l[0], p[1] + s * T * g.l[1]]; }
    // the section: along the sketch's face, back along the other; cv[i] belongs to the edge from loop[i] to loop[i + 1]
    var loop = [pts[0].slice()], cv = [null];
    function arc(J, r, up) {
      if (r <= 1e-12) { loop.push(J.C.slice()); cv.push(null); return; }
      for (var q = 0; q <= J.n; q++) { loop.push(at(J, r, up ? q : J.n - q)); cv.push(q < J.n ? { c: J.C.slice(), r: r } : null); }
    }
    joints.forEach(function (J) { arc(J, J.rho, true); });
    loop.push(pts[m].slice()); cv.push(null);
    loop.push(off(pts[m], segs[m - 1])); cv.push(null);
    for (j = joints.length - 1; j >= 0; j--) arc(joints[j], joints[j].rho2, false);
    loop.push(off(pts[0], segs[0])); cv.push(null);
    if (signedArea(loop) < 0) {
      var n = loop.length, cv2 = [];
      for (i = 0; i < n - 1; i++) cv2.push(cv[n - 2 - i]);
      cv2.push(cv[n - 1]);
      loop.reverse(); cv = cv2;
    }
    var a = f.end === 'mid' ? -D / 2 : (f.reverse ? -D : 0), b = a + D;
    function vec(v) { return add(scale(plane.x, v[0]), scale(plane.y, v[1])); }
    var fix = 0;
    flats.forEach(function (fl, q) { if (fl > flats[fix] * (1 + 1e-9)) fix = q; });
    var info = [], wedges = [];
    joints.forEach(function (J, q) {
      var bi = q >= fix ? q : q + 1, wi = q >= fix ? q + 1 : q;
      var nb = vec([-J.t * segs[bi].l[0], -J.t * segs[bi].l[1]]), nw = vec([-J.t * segs[wi].l[0], -J.t * segs[wi].l[1]]), c = dot(nb, nw);
      var C3 = to3D(plane, J.C[0], J.C[1]), a3 = add(add(C3, scale(nb, J.R)), scale(plane.n, a)), b3 = add(add(C3, scale(nb, J.R)), scale(plane.n, b));
      info.push({ kind: 'edge', a: a3, b: b3, mid: scale(add(a3, b3), 0.5), origin: scale(add(a3, b3), 0.5), o: norm(sub(nw, scale(nb, c))), u: scale(nb, -1), len: D, angle: J.A, R: J.R, L: flats[wi], T: T, ba: null,
        mitred: [false, false], miterPlanes: [null, null] });
      var e0 = vec([Math.cos(J.a0), Math.sin(J.a0)]), e1 = vec([-J.t * Math.sin(J.a0), J.t * Math.cos(J.a0)]);
      wedges.push({ plane: { origin: C3, x: e0, y: scale(e1, 1), n: plane.n }, a: a, b: b, R: J.R, RT: J.R + T, A: J.A, ov: Math.min(T / 2, flats[q], flats[q + 1]) });
    });
    // the flat plates between the bends (OpenCascade fuses them with the exact bends)
    var plates = segs.map(function (g, q) {
      var p0 = [pts[q][0] + g.d[0] * (q > 0 ? joints[q - 1].sb : 0), pts[q][1] + g.d[1] * (q > 0 ? joints[q - 1].sb : 0)];
      var p1 = [pts[q + 1][0] - g.d[0] * (q < m - 1 ? joints[q].sb : 0), pts[q + 1][1] - g.d[1] * (q < m - 1 ? joints[q].sb : 0)];
      var l = [p0, p1, off(p1, g), off(p0, g)];
      return { pts: signedArea(l) < 0 ? l.reverse() : l };
    });
    // the fixed face: the fixed plate's face on the sketch line, looking away from the material; the sheet lies behind it
    var g = segs[fix], ms = 0.5 * ((fix > 0 ? joints[fix - 1].sb : 0) + g.L - (fix < m - 1 ? joints[fix].sb : 0));
    var P2 = [pts[fix][0] + g.d[0] * ms, pts[fix][1] + g.d[1] * ms];
    var nf = vec([-s * g.l[0], -s * g.l[1]]), xf = vec(g.d), big = 0;
    for (k = 1; k < 3; k++) if (Math.abs(xf[k]) > Math.abs(xf[big]) + 1e-9) big = k;
    if (xf[big] < 0) xf = scale(xf, -1);
    var P3 = add(to3D(plane, P2[0], P2[1]), scale(plane.n, (a + b) / 2));
    return { plane: plane, a: a, b: b, loop: loop, cv: cv, plates: plates, wedges: wedges, info: info, fixed: P3, flatPlane: { origin: P3, x: xf, y: cross(nf, xf), n: nf }, flats: flats, T: T };
  }
  // buildOpenBase(f, model, ctx) -> { body, info, tool, bends }: rebuildModel's Insert Bends case. A first feature has no
  // body slot for its putBody, so the solid is put in ctx.bodies here; on an existing body it is added to it.
  function buildOpenBase(f, model, ctx) {
    var lay = openBaseLayout(f, model, ctx), solid = prism(lay.loop, lay.plane, lay.a, lay.b, f.id, lay.cv);
    if (ctx.bodies && !ctx.bodies.length) { ctx.bodies.push(solid); if (ctx.bodyFeatures) ctx.bodyFeatures.push(f.id); }
    var body = ctx.body ? ctx.body.union(solid) : solid;
    ctx.body = body;
    return { body: body, info: lay.info, tool: solid, bends: lay.info.length };
  }

  // ------------------------------------------------------------------ public API (Kernel.*)
  K.isOpenProfile = isOpenProfile; K.openBaseLayout = openBaseLayout; K.buildOpenBase = buildOpenBase;   // lane open-base
  K.buildClosedCorner = buildClosedCorner; K.closedCornerLayout = closedCornerLayout;
  K.closedCornerName = closedCornerName; K.CLOSED_CORNER_TYPES = CC_TYPES.slice(); K.closedCornerDefaultGap = ccDefaultGap; K.closedCornerMinGap = ccMinGap;
  _.buildClosedCorner = buildClosedCorner; _.smBool = smBool; _.smScale = smScale;
  K.buildFlange = buildFlange; K.flangeLayout = flangeLayout; K.buildJog = buildJog; K.normalCutTool = normalCutTool;
  K.flangeProfile = flangeProfile; K.flatPattern = flatPattern; K.flatOptions = flatOptions; K.flatOptionsOf = flatOptionsOf; K.FLAT_OPTION_DEFAULTS = FLAT_OPTION_DEFAULTS; K.cleanFlatLoop = cleanFlatLoop; K.snapFlatCircle = snapFlatCircle; K.flatCircleTol = flatCircleTol; K.bendAllowance = bendAllowance; K.sheetParams = sheetParams;
  K.bendDeduction = bendDeduction; K.outsideSetback = outsideSetback; K.bendCalc = bendCalc; K.bendTableLookup = bendTableLookup;
  K.makeSheet = makeSheet; K.sheetKFactor = sheetKFactor; K.sheetNote = sheetNote; K.gaugeTables = GAUGE_TABLES; K.gaugeTable = gaugeTable; K.gaugeRow = gaugeRow;
  K.DEFAULT_K_FACTOR = DEFAULT_K; K.LEGACY_K_FACTOR = LEGACY_K; K.AUTO_RELIEF_RATIO = AUTO_RELIEF_RATIO; K.DEFAULT_GAUGE_TABLE = DEFAULT_GAUGE_TABLE; K.BEND_ALLOWANCE_TYPES = BA_TYPES.slice();
  K.bendNoteText = bendNoteText; K.hemSection = hemSection; K.FLANGE_LENGTH_REFS = LENGTH_REFS.slice(); K.HEM_TYPES = HEM_TYPES.slice();
  K.CLOSED_HEM_RADIUS = CLOSED_HEM_R; K.DEFAULT_HEM_ANGLE = DEFAULT_HEM_ANGLE;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.buildFlange = buildFlange; _.buildJog = buildJog; _.normalCutTool = normalCutTool;
  K.buildSketchedBend = buildSketchedBend; K.sketchedBendLayout = sketchedBendLayout; K.SKETCHED_BEND_POSITIONS = SB_POSITIONS.slice();
  // cuts across a bend zone (occt-kernel.js reads the voids again from its exact solid and cuts them from its sweep)
  K.bendVoids = bendVoids; K.bandSlabSpec = bandSlabSpec; K.wrapCut = wrapCut; K.wrapRegion = wrapRegion; K.bendSector = bendSector; K.bendZoneMap = bendZoneMap;
  // Break Corner (lane CP)
  K.buildBreakCorner = buildBreakCorner; K.breakCornerLayout = breakCornerLayout; K.breakCornerCandidates = breakCornerCandidates;
  K.breakCornerName = breakCornerName; K.BREAK_CORNER_KINDS = BC_KINDS.slice();
  _.buildSketchedBend = buildSketchedBend; _.sketchedBendPoint = sketchedBendPoint;
  // Unfold / Fold (lane DB)
  K.buildUnfold = buildUnfold; K.buildFold = buildFold; K.sheetBends = sheetBends; K.sheetBendAt = sheetBendAt; K.unfoldedBendAt = unfoldedBendAt; K.unfoldPreview = unfoldPreview; _.buildUnfold = buildUnfold; _.buildFold = buildFold;
  // lane DC: Jog from a sketch line, the Flat-Pattern solid
  K.buildSketchJog = buildSketchJog; K.isSketchJog = isSketchJog; K.JOG_OFFSET_REFS = JOG_OFFSET_REFS.slice(); K.jogMinOffset = jogMinOffset; K.jogBendFeature = jogBendFeature; K.flatBody = flatBody;
  _.buildSketchJog = buildSketchJog; _.isSketchJog = isSketchJog;
  K.unfoldStateAt = unfoldStateAt; K.unfoldStripFrame = ufStripFrame; K.unfoldWedgeSpec = ufWedgeSpec; _.mCompose = mCompose; _.mInv = mInv;   // lane DB2 (OpenCascade)
  K.unfoldCells = ufCells; K.unfoldLayers = ufLayers;   // lane DJ (OpenCascade folds added material / blind cuts with them)
  K.miterFlangeStages = miterFlangeStages; K.miterTail = miterTail; K.MITER_FLANGE_POSITIONS = MITER_FLANGE_POSITIONS.slice(); _.buildMiterFlange = buildMiterFlange;   // lane DL
  K.insertBendsLayout = insertBendsLayout; K.convertSMPlan = convertSMPlan; K.sheetThicknessAt = sheetThicknessAt; K.INSERT_BENDS_RELIEFS = IB_RELIEFS.slice(); K.convertSMInsert = convertSMInsert; K.convertSMReversed = convertSMReversed; K.insertBendsRoundAt = insertBendsRoundAt; K.convertSMCollect = convertSMCollect; K.convertSMRipGap = ibRipGap; K.insertBendsPreview = insertBendsPreview; _.buildInsertBends = buildInsertBends;   // lane DQ
  K.insertBendsRounded = ibRoundBends;   // lane rfIH: ibRoundBends(body, mesh, T, units): the rounded bends a part already has

  // ------------------------------------------------------------------ Forming Tool (lane forming, rfHI)
  // SolidWorks' Design Library forming tools dropped on a flat sheet face: Dimple (round emboss), Extruded Hole (the
  // formed collar round a hole), Louver (a hood lanced along one side), Lance (a bridge lance, cut along both sides) and
  // Rib (a straight stiffening rib with round ends). Feature JSON { type: 'formingTool', tool, face: [x, y, z] (a point
  // on the face), at: [u, v] (the tool's centre in the face's sketch frame, Kernel.planeFromFace), angle (degrees, the
  // tool's length direction from the frame's x), flip (false: raised toward the picked face's side), ...the tool's dims
  // (FORMING_TOOLS[i].params keys), name }. The form keeps the sheet's thickness: a shell T thick (sharp-cornered
  // sections offset by T, the extruded hole's and louver's bends true arcs), built as revolves / prisms of a section
  // whose curved facets carry their cone / cylinder / torus records, so massProps is exact. The sheet under the tool's
  // footprint is cut through and the formed section (running T past the footprint, onto the sheet) is unioned in.
  // The flat pattern lays the formed area back as plain sheet (the footprint filled), puts the tool's outline and a
  // centre mark on layer FORM with a note on NOTES, the lance cuts (Louver: the open side; Lance: both sides) on HOLES as
  // slits, and the Extruded Hole's pre-pierce hole (developed: collar + the 90° bend's BA, back from the bend's start)
  // as a real hole. A tool that does not fit on its face (off an edge, over a hole, across a bend) is refused.
  var FORMING_TOOLS = [
    { id: 'dimple', label: 'Dimple', help: 'Round emboss: a cone-walled cup pressed out of the sheet', params: [
      { key: 'diameter', label: 'Diameter', unit: 'u', value: 0.75, mm: 20, help: 'Across the form where it leaves the face' },
      { key: 'height', label: 'Height', unit: 'u', value: 0.125, mm: 3, help: 'How far the form stands proud of the face' },
      { key: 'sideAngle', label: 'Side angle', unit: '°', value: 30, mm: 30, help: 'Wall angle from square to the face (0 = straight walls)' }] },
    { id: 'extrudedHole', label: 'Extruded Hole', help: 'A formed collar round a hole (extruded flange): tapping or bearing length in thin sheet', params: [
      { key: 'holeDiameter', label: 'Hole diameter', unit: 'u', value: 0.25, mm: 6, help: 'Inside diameter of the collar' },
      { key: 'height', label: 'Flange height', unit: 'u', value: 0.125, mm: 3, help: 'Outside height of the collar above the face' },
      { key: 'radius', label: 'Inside radius', unit: 'u', value: 0.03, mm: 0.8, help: 'Bend radius between the face and the collar' }] },
    { id: 'louver', label: 'Louver', help: 'A hood lanced along one side and pressed up: a vent', params: [
      { key: 'length', label: 'Length', unit: 'u', value: 1.5, mm: 40, help: 'Length of the lanced opening' },
      { key: 'width', label: 'Width', unit: 'u', value: 0.375, mm: 10, help: 'From the hinge to the lanced side' },
      { key: 'height', label: 'Height', unit: 'u', value: 0.125, mm: 3, help: 'Height of the hood\'s open edge above the face' },
      { key: 'radius', label: 'Radius', unit: 'u', value: 0.03, mm: 0.8, help: 'Inside radius at the hinge' }] },
    { id: 'lance', label: 'Lance', help: 'A bridge lance: a strip cut along both sides and pressed up on sloped legs', params: [
      { key: 'length', label: 'Length', unit: 'u', value: 1, mm: 25, help: 'Length of the two cuts' },
      { key: 'width', label: 'Width', unit: 'u', value: 0.25, mm: 6, help: 'Width of the bridge' },
      { key: 'height', label: 'Height', unit: 'u', value: 0.125, mm: 3, help: 'Height of the bridge\'s top above the face (more than the thickness)' },
      { key: 'legAngle', label: 'Leg angle', unit: '°', value: 45, mm: 45, help: 'Slope of the legs from the face' }] },
    { id: 'rib', label: 'Rib', help: 'A straight stiffening rib with round ends', params: [
      { key: 'length', label: 'Length', unit: 'u', value: 2, mm: 50, help: 'Overall length, end to end' },
      { key: 'width', label: 'Width', unit: 'u', value: 0.375, mm: 10, help: 'Width where the rib leaves the face' },
      { key: 'depth', label: 'Depth', unit: 'u', value: 0.125, mm: 3, help: 'How far the rib stands proud of the face' },
      { key: 'sideAngle', label: 'Side angle', unit: '°', value: 30, mm: 30, help: 'Wall angle from square to the face' }] }
  ];
  var FT_SLIT = 0.01;   // a lance cut's width in the flat (inches; 0.254 mm)
  function ftTool(id) { for (var i = 0; i < FORMING_TOOLS.length; i++) if (FORMING_TOOLS[i].id === id) return FORMING_TOOLS[i]; return null; }
  // formingToolDefaults(id, units) -> { tool, ...dims } in the model's units (inch values for 'in', else mm)
  function formingToolDefaults(id, units) {
    var t = ftTool(id);
    if (!t) return null;
    var o = { tool: id };
    t.params.forEach(function (p) { o[p.key] = units === 'in' ? p.value : p.mm; });
    return o;
  }
  function ftName(model, tool) {
    var t = ftTool(tool), base = t ? t.label : 'Forming Tool', max = 0, re = new RegExp('^' + base + '(\\d+)$');
    (model.features || []).forEach(function (g) { var mm = re.exec(g.name || ''); if (mm && +mm[1] > max) max = +mm[1]; });
    return base + (max + 1);
  }
  function ftNum(x) { return String(Math.round(x * 1e4) / 1e4).replace(/^0\./, '.').replace(/^-0\./, '-.'); }
  // the polyline offset by d to its right (sharp corners: neighbouring offset lines meet); throws when a piece turns
  // back (the form is too tight for the thickness)
  function ftOffset(pts, d, what) {
    var segs = [], i;
    for (i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), u = [dx / l, dy / l];
      segs.push({ p: [a[0] + u[1] * d, a[1] - u[0] * d], u: u });
    }
    var out = [segs[0].p];
    for (i = 1; i < segs.length; i++) {
      var s = segs[i - 1], t = segs[i], den = s.u[0] * t.u[1] - s.u[1] * t.u[0];
      if (Math.abs(den) < 1e-12) { out.push(t.p); continue; }
      var w = [t.p[0] - s.p[0], t.p[1] - s.p[1]], k = (w[0] * t.u[1] - w[1] * t.u[0]) / den;
      out.push([s.p[0] + s.u[0] * k, s.p[1] + s.u[1] * k]);
    }
    var last = pts[pts.length - 1], sl = segs[segs.length - 1];
    out.push([last[0] + sl.u[1] * d, last[1] - sl.u[0] * d]);
    for (i = 0; i + 1 < out.length; i++) {
      var v = [out[i + 1][0] - out[i][0], out[i + 1][1] - out[i][1]];
      if (v[0] * segs[i].u[0] + v[1] * segs[i].u[1] <= 1e-9 * (1 + Math.abs(d))) throw new Error(what + ': the form is too small for the sheet thickness (' + ftNum(d) + '): make it larger or shallower.');
    }
    return out;
  }
  // a closed section path ([x, y] points; { c, r } between two points = an arc round c) -> sketch entities
  function ftEntities(path) {
    var list = [], ents = [], i;
    path.forEach(function (q) { if (Array.isArray(q)) list.push({ p: q, arc: null }); else if (list.length) list[list.length - 1].arc = q; });
    for (i = 0; i < list.length; i++) {
      var a = list[i].p, b = list[(i + 1) % list.length].p, C = list[i].arc;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-12) continue;
      if (!C) { ents.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); continue; }
      var a0 = Math.atan2(a[1] - C.c[1], a[0] - C.c[0]) * 180 / Math.PI, a1 = Math.atan2(b[1] - C.c[1], b[0] - C.c[0]) * 180 / Math.PI, sw = a1 - a0;
      while (sw > 180) sw -= 360;
      while (sw <= -180) sw += 360;
      ents.push(sw > 0 ? { t: 'arc', cx: C.c[0], cy: C.c[1], r: C.r, a0: a0, a1: a0 + sw } : { t: 'arc', cx: C.c[0], cy: C.c[1], r: C.r, a0: a0 + sw, a1: a0 });
    }
    return ents;
  }
  // the section mirrored through the sheet's mid-plane (z -> -T - z): a form pressed the other way
  function ftMirror(path, T) {
    return path.map(function (q) { return Array.isArray(q) ? [q[0], -T - q[1]] : { c: [q.c[0], -T - q.c[1]], r: q.r }; });
  }
  function ftCircle(c, r, n) {
    var out = [];
    for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return out;
  }
  function ftRect(u0, v0, u1, v1) { return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; }
  // an obround (stadium) along u, centres at ±a, radius r (CCW)
  function ftObround(a, r, n) {
    var out = [], i, k = Math.max(4, n >> 1);
    for (i = 0; i <= k; i++) { var t = -Math.PI / 2 + Math.PI * i / k; out.push([a + r * Math.cos(t), r * Math.sin(t)]); }
    for (i = 0; i <= k; i++) { var s = Math.PI / 2 + Math.PI * i / k; out.push([-a + r * Math.cos(s), r * Math.sin(s)]); }
    return out;
  }
  // the louver's hinge: the angle β of the hood's straight top that runs tangent off the hinge arc (radius R, centre
  // (-W/2, R)) to (W/2, H)
  function ftLouverBeta(W, H, R) {
    function g(b) { return (W - R * Math.sin(b)) * Math.sin(b) - (H - R * (1 - Math.cos(b))) * Math.cos(b); }
    var lo = 0, hi = Math.PI / 2;
    if (!(g(hi) > 0)) return null;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (g(m) > 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }
  // formingToolGeometry(tool, dims, T) -> the tool in its own frame (u along its length, v across, z out of the face;
  // the sheet is z in [-T, 0]), formed upward: { solids: [{ path, rev: angle, at: [u, v], dir: [du, dv] } |
  // { path, sec: 'yz' (section (v, z) along u) | 'xz' (section (u, z) along v), from, to }], cut: [sketch entities in
  // (u, v)], clear (polygon the face must hold), fill (polygon the flat fills), marks: [{ t: 'circle', c, r } |
  // { t: 'poly', pts, closed }], lances: [[a, b]], ext: half size across v (note placement), pierce?, note }
  function formingToolGeometry(tool, d, T) {
    var e = T, k = Math.PI / 180, g;
    function pos(key, what) { if (!(+d[key] > 0)) throw new Error(what + ': ' + key + ' must be more than 0.'); return +d[key]; }
    switch (tool) {
      case 'dimple': {
        var Db = pos('diameter', 'Dimple'), H = pos('height', 'Dimple'), A = +d.sideAngle || 0, Rb = Db / 2;
        if (A < 0 || A >= 89) throw new Error('Dimple: the side angle must be from 0° to 89°.');
        var Rt = Rb - H * Math.tan(A * k);
        if (!(Rt > 1e-9 * Rb)) throw new Error('Dimple: a ' + ftNum(H) + ' height at ' + A + '° leaves no top on a ' + ftNum(Db) + ' diameter: make it wider, shallower or steeper.');
        var top = [[0, H], [Rt, H], [Rb, 0], [Rb + e, 0]], bot = ftOffset(top, T, 'Dimple');
        g = { solids: [{ path: top.concat(bot.reverse()), rev: 360, at: [0, 0], dir: [1, 0] }], cut: [{ t: 'circle', cx: 0, cy: 0, r: Rb }],
          clear: ftCircle([0, 0], Rb + T, 64), fill: ftCircle([0, 0], Rb + T / 2, 64), marks: [{ t: 'circle', c: [0, 0], r: Rb }], lances: [], ext: Rb,
          note: 'DIMPLE Ø' + ftNum(Db) + ' X ' + ftNum(H) };
        break;
      }
      case 'extrudedHole': {
        var rh = pos('holeDiameter', 'Extruded Hole') / 2, Hc = pos('height', 'Extruded Hole'), ri = +d.radius || 0;
        if (ri < 0) throw new Error('Extruded Hole: the inside radius cannot be negative.');
        if (!(Hc > ri + 1e-9)) throw new Error('Extruded Hole: the flange height must be more than the inside radius (' + ftNum(ri) + ').');
        var rc = rh + T + ri, C = [rc, ri];
        var path = [[rh, Hc], [rh + T, Hc], [rh + T, ri]];
        if (ri > 1e-12) path.push({ c: C, r: ri });
        path.push([rc, 0], [rc + e, 0], [rc + e, -T], [rc, -T], { c: C, r: ri + T }, [rh, ri]);
        g = { solids: [{ path: path, rev: 360, at: [0, 0], dir: [1, 0] }], cut: [{ t: 'circle', cx: 0, cy: 0, r: rc }],
          clear: ftCircle([0, 0], rc + T, 64), fill: ftCircle([0, 0], rc + T / 2, 64), marks: [{ t: 'circle', c: [0, 0], r: rc }], lances: [], ext: rc,
          pierce: { rc: rc, ri: ri, straight: Hc - ri }, note: 'EXTRUDED HOLE Ø' + ftNum(2 * rh) + ' X ' + ftNum(Hc) };
        break;
      }
      case 'louver': {
        var L = pos('length', 'Louver'), W = pos('width', 'Louver'), Hl = pos('height', 'Louver'), R = +d.radius || 0;
        if (R < 0) throw new Error('Louver: the radius cannot be negative.');
        var be = ftLouverBeta(W, Hl, R);
        if (be == null) throw new Error('Louver: the hinge radius must be less than the width.');
        var Cl = [-W / 2, R], Pb = [-W / 2 + R * Math.sin(be), R - R * Math.cos(be)], Bb = [-W / 2 + (R + T) * Math.sin(be), R - (R + T) * Math.cos(be)];
        var zb = Bb[1] + (W / 2 - Bb[0]) * Math.tan(be);
        if (!(Bb[0] < W / 2 - 1e-9) || !(Pb[0] < W / 2 - 1e-9)) throw new Error('Louver: the hinge radius is too large for the width.');
        if (!(zb > 1e-6 * T)) throw new Error('Louver: a ' + ftNum(Hl) + ' height does not open a ' + ftNum(W) + ' wide louver in ' + ftNum(T) + ' sheet: make it taller.');
        var hood = [[-W / 2 - e, 0], [-W / 2, 0]];
        if (R > 1e-12) hood.push({ c: Cl, r: R });
        hood.push(Pb, [W / 2, Hl], [W / 2, zb], Bb, { c: Cl, r: R + T }, [-W / 2, -T], [-W / 2 - e, -T]);
        var end = [[-W / 2, -T / 2], [-W / 2, 0]];
        if (R > 1e-12) end.push({ c: Cl, r: R });
        end.push(Pb, [W / 2, Hl], [W / 2, -T / 2]);
        g = { solids: [{ path: hood, sec: 'yz', from: -L / 2 - T / 2, to: L / 2 + T / 2 }, { path: end, sec: 'yz', from: L / 2, to: L / 2 + T }, { path: end, sec: 'yz', from: -L / 2 - T, to: -L / 2 }],
          cut: [{ t: 'line', x1: -L / 2, y1: -W / 2, x2: L / 2, y2: -W / 2 }, { t: 'line', x1: L / 2, y1: -W / 2, x2: L / 2, y2: W / 2 }, { t: 'line', x1: L / 2, y1: W / 2, x2: -L / 2, y2: W / 2 }, { t: 'line', x1: -L / 2, y1: W / 2, x2: -L / 2, y2: -W / 2 }],
          clear: ftRect(-L / 2 - 2 * T, -W / 2 - T, L / 2 + 2 * T, W / 2 + T), fill: ftRect(-L / 2 - 1.5 * T, -W / 2 - T / 2, L / 2 + 1.5 * T, W / 2 + T / 2),
          marks: [{ t: 'poly', pts: ftRect(-L / 2 - T, -W / 2, L / 2 + T, W / 2), closed: true }], lances: [[[-L / 2, W / 2], [L / 2, W / 2]]], ext: W / 2,
          note: 'LOUVER ' + ftNum(L) + ' X ' + ftNum(W) + ' X ' + ftNum(Hl) };
        break;
      }
      case 'lance': {
        var Ll = pos('length', 'Lance'), Wl = pos('width', 'Lance'), Hb = pos('height', 'Lance'), al = d.legAngle != null ? +d.legAngle : 45;
        if (!(al > 0 && al <= 90)) throw new Error('Lance: the leg angle must be more than 0° and at most 90°.');
        if (!(Hb > T * (1 + 1e-6))) throw new Error('Lance: the height must be more than the sheet thickness (' + ftNum(T) + ') so the bridge clears the sheet.');
        var run = al >= 90 ? 0 : Hb / Math.tan(al * k);
        if (!(Ll - 2 * run > 1e-9)) throw new Error('Lance: a ' + ftNum(Ll) + ' length has no room for ' + ftNum(Hb) + ' high legs at ' + al + '°.');
        var lt = [[-Ll / 2 - e, 0], [-Ll / 2, 0], [-Ll / 2 + run, Hb], [Ll / 2 - run, Hb], [Ll / 2, 0], [Ll / 2 + e, 0]], lb = ftOffset(lt, T, 'Lance');
        g = { solids: [{ path: lt.concat(lb.reverse()), sec: 'xz', from: -Wl / 2, to: Wl / 2 }],
          cut: [{ t: 'line', x1: -Ll / 2, y1: -Wl / 2, x2: Ll / 2, y2: -Wl / 2 }, { t: 'line', x1: Ll / 2, y1: -Wl / 2, x2: Ll / 2, y2: Wl / 2 }, { t: 'line', x1: Ll / 2, y1: Wl / 2, x2: -Ll / 2, y2: Wl / 2 }, { t: 'line', x1: -Ll / 2, y1: Wl / 2, x2: -Ll / 2, y2: -Wl / 2 }],
          clear: ftRect(-Ll / 2 - 2 * T, -Wl / 2 - T, Ll / 2 + 2 * T, Wl / 2 + T), fill: ftRect(-Ll / 2 - 1.5 * T, -Wl / 2 - T / 2, Ll / 2 + 1.5 * T, Wl / 2 + T / 2),
          marks: [{ t: 'poly', pts: ftRect(-Ll / 2, -Wl / 2, Ll / 2, Wl / 2), closed: true }], lances: [[[-Ll / 2, -Wl / 2], [Ll / 2, -Wl / 2]], [[-Ll / 2, Wl / 2], [Ll / 2, Wl / 2]]], ext: Wl / 2,
          note: 'LANCE ' + ftNum(Ll) + ' X ' + ftNum(Wl) + ' X ' + ftNum(Hb) };
        break;
      }
      case 'rib': {
        var Lr = pos('length', 'Rib'), Wr = pos('width', 'Rib'), Dr = pos('depth', 'Rib'), Ar = +d.sideAngle || 0, Rr = Wr / 2;
        if (Ar < 0 || Ar >= 89) throw new Error('Rib: the side angle must be from 0° to 89°.');
        if (Lr < Wr - 1e-9) throw new Error('Rib: the length must be at least the width (' + ftNum(Wr) + ').');
        var Rtr = Rr - Dr * Math.tan(Ar * k), a = Math.max(0, Lr / 2 - Rr);
        if (!(Rtr > 1e-9 * Rr)) throw new Error('Rib: a ' + ftNum(Dr) + ' depth at ' + Ar + '° leaves no top on a ' + ftNum(Wr) + ' wide rib: make it wider, shallower or steeper.');
        var ht = [[0, Dr], [Rtr, Dr], [Rr, 0], [Rr + e, 0]], hb = ftOffset(ht, T, 'Rib'), half = ht.concat(hb.slice().reverse());
        var solids = [];
        if (a > 1e-9) {
          var ft = [[-Rr - e, 0], [-Rr, 0], [-Rtr, Dr], [Rtr, Dr], [Rr, 0], [Rr + e, 0]], fb = ftOffset(ft, T, 'Rib');
          solids.push({ path: ft.concat(fb.reverse()), sec: 'yz', from: -a, to: a });
          solids.push({ path: half, rev: 180, at: [a, 0], dir: [0, -1] }, { path: half, rev: 180, at: [-a, 0], dir: [0, 1] });
        } else solids.push({ path: half, rev: 360, at: [0, 0], dir: [1, 0] });
        g = { solids: solids, cut: [a > 1e-9 ? { t: 'slot', x1: -a, y1: 0, x2: a, y2: 0, w: Wr } : { t: 'circle', cx: 0, cy: 0, r: Rr }],
          clear: ftObround(a, Rr + T, 64), fill: ftObround(a, Rr + T / 2, 64), marks: [{ t: 'poly', pts: ftObround(a, Rr, 64), closed: true }], lances: [], ext: Rr,
          note: 'RIB ' + ftNum(Lr) + ' X ' + ftNum(Wr) + ' X ' + ftNum(Dr) };
        break;
      }
      default: throw new Error('Forming Tool: unknown tool "' + tool + '" (dimple, extrudedHole, louver, lance or rib).');
    }
    return g;
  }
  // the flat sheet faces of a body (the opposite face T behind): { plane, loops, w } as faceOutline gives them
  function ftSheetFaces(body, T) {
    var mesh = meshFromBody(coplanarBody(body)), out = [], tolW = 1e-6 * (1 + T) + 1e-4 * T;
    function curved(face) { return (face.polys || []).some(function (p) { return !!p.surf; }); }
    mesh.faces.forEach(function (face, fi) {
      if (curved(face)) return;
      if (!mesh.faces.some(function (h) { return !curved(h) && dot(h.normal, face.normal) < -1 + 1e-9 && Math.abs(face.w + h.w - T) <= tolW; })) return;
      var o = faceOutline(mesh, fi);
      if (o && o.loops.length) out.push({ index: fi, plane: o.plane, loops: o.loops, w: face.w });
    });
    return out;
  }
  function ftSegsCross(a, b, c, d2) {
    function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var d1 = o(a, b, c), e1 = o(a, b, d2), f1 = o(c, d2, a), g1 = o(c, d2, b);
    return ((d1 > 1e-12 && e1 < -1e-12) || (d1 < -1e-12 && e1 > 1e-12)) && ((f1 > 1e-12 && g1 < -1e-12) || (f1 < -1e-12 && g1 > 1e-12));
  }
  // does the face hold the polygon q (2D, in the face's outline frame): every corner on the face, no outline / hole
  // corner inside it, no edge crossing
  function ftFaceHolds(face, q) {
    function on(u) { var k = 0; face.loops.forEach(function (l) { if (pointInPoly(u, l)) k++; }); return k % 2 === 1; }
    if (!q.every(on)) return false;
    if (face.loops.some(function (l) { return l.some(function (v) { return pointInPoly(v, q); }); })) return false;
    for (var i = 0; i < q.length; i++) {
      var a = q[i], b = q[(i + 1) % q.length];
      for (var li = 0; li < face.loops.length; li++) {
        var l = face.loops[li];
        for (var j = 0; j < l.length; j++) if (ftSegsCross(a, b, l[j], l[(j + 1) % l.length])) return false;
      }
    }
    return true;
  }
  // formingToolLayout(f, model, { body }) -> plain data: { tool, T, n, at, x, y, flip, solids (3D frames), cut, rec }
  // where rec (stored in build.planes[f.id], refgeo 'formingTool') carries what the flat pattern needs in 3D
  function formingToolLayout(f, model, ctx) {
    var sheet = model.sheet, t = ftTool(f.tool), what = t ? t.label : 'Forming Tool';
    if (!sheet) throw new Error(what + ' needs a sheet-metal part: make a Base Flange first (Sheet Metal tab).');
    if (!t) throw new Error('Forming Tool: unknown tool "' + f.tool + '" (dimple, extrudedHole, louver, lance or rib).');
    if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) throw new Error(what + ': there is no sheet to form yet.');
    if (!f.face) throw new Error(what + ': select a flat face of the sheet.');
    var T = +sheet.thickness, d = {};
    t.params.forEach(function (p) {
      var v = f[p.key] == null ? (model.units === 'in' ? p.value : p.mm) : +f[p.key];
      if (!isFinite(v)) throw new Error(what + ': ' + p.label.toLowerCase() + ' must be a number.');
      d[p.key] = v;
    });
    var g = formingToolGeometry(f.tool, d, T);
    var p = f.face.map(Number), face = null, bd = 1e-3 * (1 + T);
    ftSheetFaces(ctx.body, T).forEach(function (fr) {
      var off = Math.abs(dot(fr.plane.n, p) - fr.w);
      if (off > bd) return;
      var uv = to2D(fr.plane, p), inn = 0;
      fr.loops.forEach(function (l) { if (pointInPoly(uv, l)) inn++; });
      if (inn % 2 === 1) { bd = off; face = fr; }
    });
    if (!face) throw new Error(what + ': there is no flat face of the sheet at ' + bcPt(p) + ': select a flat face of the sheet.');
    var n = face.plane.n.slice(), fp = _.planeFromFace(n, scale(n, face.w));
    var at = f.at && f.at.length === 2 ? [+f.at[0], +f.at[1]] : to2D(fp, p);
    if (!isFinite(at[0]) || !isFinite(at[1])) throw new Error(what + ': the position must be numbers.');
    var ang = (+f.angle || 0) * Math.PI / 180, P = to3D(fp, at[0], at[1]);
    var ex = add(scale(fp.x, Math.cos(ang)), scale(fp.y, Math.sin(ang))), ey = cross(n, ex);
    function W3(q) { return add(P, add(scale(ex, q[0]), scale(ey, q[1]))); }
    if (!ftFaceHolds(face, g.clear.map(function (q) { return to2D(face.plane, W3(q)); })))
      throw new Error(what + ': the tool does not fit on the face at (' + ftNum(at[0]) + ', ' + ftNum(at[1]) + '): it runs off the face, over a hole or across a bend; move it at least ' + ftNum(T) + ' clear of the face\'s edges.');
    var flip = !!f.flip, solids = g.solids.map(function (s) {
      var path = flip ? ftMirror(s.path, T) : s.path, plane;
      if (s.rev) {
        var rd = add(scale(ex, s.dir[0]), scale(ey, s.dir[1]));
        return { path: path, rev: s.rev, plane: { origin: W3(s.at), x: rd, y: n.slice(), n: cross(rd, n) } };
      }
      if (s.sec === 'yz') return { path: path, depth: s.to - s.from, plane: { origin: add(P, scale(ex, s.from)), x: ey.slice(), y: n.slice(), n: ex.slice() } };
      return { path: path, depth: s.to - s.from, plane: { origin: add(P, scale(ey, s.to)), x: ex.slice(), y: n.slice(), n: scale(ey, -1) } };
    });
    var eps = 0.01 * T, cut = { ents: g.cut, depth: T + 2 * eps, plane: { origin: sub(P, scale(n, T + eps)), x: ex.slice(), y: ey.slice(), n: n.slice() } };
    var cm = Math.min(0.5 * g.ext, model.units === 'in' ? 0.125 : 3);
    var rec = { refgeo: 'formingTool', tool: f.tool, n: n, at: P, x: ex, y: ey, flip: flip, T: T,
      fill: g.fill.map(W3), marks: g.marks.map(function (m) { return m.t === 'circle' ? { t: 'circle', c: W3(m.c), r: m.r } : { t: 'poly', pts: m.pts.map(W3), closed: !!m.closed }; }),
      centre: [[W3([-cm, 0]), W3([cm, 0])], [W3([0, -cm]), W3([0, cm])]], lances: g.lances.map(function (l) { return [W3(l[0]), W3(l[1])]; }),
      noteAt: W3([0, -(g.ext + 2 * T + (model.units === 'in' ? 0.15 : 4))]), note: g.note,
      pierce: g.pierce ? { c: P, rc: g.pierce.rc, ri: g.pierce.ri, straight: g.pierce.straight } : null };
    return { tool: f.tool, T: T, n: n, at: P, uv: at, x: ex, y: ey, flip: flip, solids: solids, cut: cut, rec: rec };
  }
  function ftSolid(s, id) {
    var sk = { entities: ftEntities(s.path) };
    if (s.rev) return _.buildRevolve({ id: id, angle: s.rev, axis: 'y' }, sk, s.plane);
    return _.buildExtrude({ id: id, depth: s.depth }, sk, s.plane);
  }
  // buildFormingTool(f, model, { body }) -> { body (the formed part), tool (the formed material, for previews), rec }
  function buildFormingTool(f, model, ctx) {
    var lay = formingToolLayout(f, model, ctx), id = f.id != null ? f.id : 'ft';
    var cut = _.buildExtrude({ id: id, depth: lay.cut.depth }, { entities: lay.cut.ents }, lay.cut.plane);
    var adds = lay.solids.map(function (s) { return ftSolid(s, id); });
    var form = adds.length > 1 ? smBool(adds[0], 'union', adds.slice(1), lay.T) : adds[0];
    var body = smBool(smBool(ctx.body, 'subtract', cut, lay.T), 'union', form, lay.T);
    return { body: body, tool: form, rec: lay.rec, layout: lay };
  }
  // the flat pattern's part (flatPattern, before the merge): the footprint filled back to plain sheet, the Extruded
  // Hole's pre-pierce hole as a notch, and the marks (FORM outline + centre mark, lance slits, a note) as flat.etch
  // items tagged form: feature id (kind 'mark' | 'cut' | 'note'); exportDXFFlat takes them out of ETCH.
  // lane dxfout: the far-side outline of a form in its own frame (where the face the form does not leave breaks; the
  // DXF's HIDDEN edges): { r } (a circle round the centre) | { pts } (closed). Sloped sides of angle A from the
  // normal (dimple, rib) break T·(1 − sin A) / cos A inside the mark, lance legs at angle α T·tan(α / 2) inside its
  // ends, a louver's opening without its end walls, an extruded hole's collar at its mark. null when nothing is left.
  function ftHidden(f, model, T) {
    var t = ftTool(f.tool), d = {};
    if (!t) return null;
    t.params.forEach(function (p) { d[p.key] = f[p.key] == null ? (model.units === 'in' ? p.value : p.mm) : +f[p.key]; });
    var k = Math.PI / 180, r, A;
    switch (f.tool) {
      case 'dimple': A = (+d.sideAngle || 0) * k; r = d.diameter / 2 - T * (1 - Math.sin(A)) / Math.cos(A); return r > 1e-9 ? { r: r } : null;
      case 'extrudedHole': return { r: d.holeDiameter / 2 + T + (+d.radius || 0) };
      case 'louver': return { pts: ftRect(-d.length / 2, -d.width / 2, d.length / 2, d.width / 2) };
      case 'lance': {
        var al = d.legAngle != null ? +d.legAngle : 45, dl = T * Math.tan(al * k / 2);
        return d.length / 2 - dl > 1e-9 ? { pts: ftRect(-d.length / 2 + dl, -d.width / 2, d.length / 2 - dl, d.width / 2) } : null;
      }
      case 'rib': A = (+d.sideAngle || 0) * k; r = d.width / 2 - T * (1 - Math.sin(A)) / Math.cos(A); return r > 1e-9 ? { pts: ftObround(Math.max(0, d.length / 2 - d.width / 2), r, 64) } : null;
    }
    return null;
  }
  function formingFlat(model, build, faceRecs, T, warn, regions, notches, items) {
    model.features.forEach(function (f) {
      if (f.type !== 'formingTool' || f.suppressed || (build.errors && build.errors[f.id])) return;
      var rec = build.planes && build.planes[f.id];
      if (!rec || rec.refgeo !== 'formingTool') return;
      var w0 = dot(rec.n, rec.at), tol = 1e-5 * (1 + Math.abs(w0)), best = null;
      faceRecs.forEach(function (fr) {
        if (Math.abs(Math.abs(dot(rec.n, fr.normal)) - 1) > 1e-6) return;
        var off = dot(fr.normal, rec.at) - fr.w;
        if (Math.abs(off) > tol && Math.abs(off + T) > tol) return;
        var q = fr.map(sub(rec.at, scale(fr.normal, off))), k = 0;
        fr.loops.forEach(function (l) { if (pointInPoly(q, l)) k++; });
        var dist = Infinity;
        fr.loops.forEach(function (l) { l.forEach(function (v) { dist = Math.min(dist, Math.hypot(v[0] - q[0], v[1] - q[1])); }); });
        if (!best || dist < best.dist) best = { fr: fr, dist: dist };
      });
      if (!best) { warn((f.name || 'Forming Tool') + ': its face is not a flat face of the sheet, so it is left out of the flat pattern.'); return; }
      var fr = best.fr, up = (dot(rec.n, fr.normal) > 0) !== !!rec.flip;
      function drop(Q) { return fr.map(sub(Q, scale(fr.normal, dot(fr.normal, Q) - fr.w))); }
      var fl = rec.fill.map(drop);
      if (signedArea(fl) < 0) fl.reverse();
      regions.push([fl]);
      var note = rec.note + ' ' + (up ? 'UP' : 'DOWN');
      if (rec.pierce) {
        var bc = bendCalc(model.sheet, Math.PI / 2, rec.pierce.ri, T), rp = rec.pierce.rc - bc.BA - rec.pierce.straight;
        if (rp > 1e-6 * (1 + rec.pierce.rc)) {
          var c2 = drop(rec.pierce.c), hole = ftCircle(c2, rp, 128);
          notches.push(signedArea(hole) < 0 ? hole.reverse() : hole);
          note += ' PIERCE Ø' + ftNum(2 * rp);
        } else warn((f.name || 'Extruded Hole') + ': the collar takes more than the whole hole (developed pierce Ø ' + ftNum(2 * rp) + '): no pre-pierce hole in the flat.');
      }
      // lane dxfout: the far-side outline rides on the first mark (farR: same centre; farPts: in the frame of the mark's
      // first two points, so flatOrient's rigid move carries it), for exportDXFFlat's hiddenEdges
      var hid = ftHidden(f, model, T);
      function W3(q) { return add(rec.at, add(scale(rec.x, q[0]), scale(rec.y, q[1]))); }
      rec.marks.forEach(function (m, mi) {
        var it = m.t === 'circle' ? { t: 'circle', c: drop(m.c), r: m.r, form: f.id, kind: 'mark' } : { t: 'poly', pts: m.pts.map(drop), closed: !!m.closed, form: f.id, kind: 'mark' };
        if (mi === 0 && hid && hid.r && it.t === 'circle') it.farR = hid.r;
        else if (mi === 0 && hid && hid.pts && it.t === 'poly' && it.pts.length > 1) {
          var o = it.pts[0], dx = it.pts[1][0] - o[0], dy = it.pts[1][1] - o[1], l = Math.hypot(dx, dy) || 1;
          dx /= l; dy /= l;
          it.farPts = hid.pts.map(function (q) { var Q = drop(W3(q)), x = Q[0] - o[0], y = Q[1] - o[1]; return [x * dx + y * dy, y * dx - x * dy]; });
        }
        items.push(it);
      });
      rec.centre.forEach(function (l) { items.push({ t: 'line', a: drop(l[0]), b: drop(l[1]), form: f.id, kind: 'mark' }); });
      // a lance cut is a real cut through the blank: a slit FT_SLIT wide (0.01 in / 0.25 mm, a laser kerf) centred on the
      // lance line, so the DXF keeps closed loops on HOLES
      var gw = model.units === 'in' ? FT_SLIT : FT_SLIT * 25.4;
      rec.lances.forEach(function (l) {
        var a2 = drop(l[0]), b2 = drop(l[1]), dx = b2[0] - a2[0], dy = b2[1] - a2[1], ll = Math.hypot(dx, dy), nx = -dy / ll * gw / 2, ny = dx / ll * gw / 2;
        var sl = [[a2[0] - nx, a2[1] - ny], [b2[0] - nx, b2[1] - ny], [b2[0] + nx, b2[1] + ny], [a2[0] + nx, a2[1] + ny]];
        notches.push(signedArea(sl) < 0 ? sl.reverse() : sl);
      });
      items.push({ t: 'note', a: drop(rec.noteAt), text: note, form: f.id, kind: 'note', up: up, tool: rec.tool });
    });
  }
  K.registerFeature('formingTool', {
    cut: false,
    script: function (f, v, idVar, optsStr) {
      var t = ftTool(f.tool), o = {};
      if (f.at) o.at = [Math.round(+f.at[0] * 1e6) / 1e6, Math.round(+f.at[1] * 1e6) / 1e6];
      if (+f.angle) o.angle = f.angle;
      if (f.flip) o.flip = true;
      (t ? t.params : []).forEach(function (p) { if (f[p.key] != null) o[p.key] = f[p.key]; });
      o.name = f.name;
      return 'var ' + v + ' = p.formingTool(' + JSON.stringify(f.tool) + ', ' + JSON.stringify((f.face || [0, 0, 0]).map(function (x) { return Math.round(x * 1e4) / 1e4; })) + ', ' + optsStr(o) + ').last();';
    }
  });
  K.FORMING_TOOLS = FORMING_TOOLS; K.formingToolDefaults = formingToolDefaults; K.formingToolName = ftName; K.formingToolLayout = formingToolLayout;
  K.formingToolGeometry = formingToolGeometry; K.buildFormingTool = buildFormingTool; _.buildFormingTool = buildFormingTool; _.formingFlat = formingFlat;
})(Kernel, Kernel._);
