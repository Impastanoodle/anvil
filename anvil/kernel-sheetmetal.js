// kernel-sheetmetal.js — Anvil kernel, sheet metal: edge flange (`buildFlange`, `flangeLayout`, `flangeProfile`), jog,
// normal cut, bend allowance and the flat pattern (`flatPattern`; its DXF export is in kernel-script.js). Loaded after
// kernel.js, kernel-sketch.js, kernel-curves.js, kernel-equations.js, kernel-mesh.js, kernel-rebuild.js and
// kernel-features.js. No DOM.
(function (K, _) {
  'use strict';
  var add = _.add, cross = _.cross, dot = _.dot, len = _.len, makePlane = _.makePlane, norm = _.norm, resolvePlane = _.resolvePlane, scale = _.scale, sub = _.sub, to2D = _.to2D, to3D = _.to3D;   // kernel.js
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
  var DEFAULT_K = 0.5, LEGACY_K = 0.71;
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
    if (o.gaugeTable != null && o.gauge != null && o.gauge !== '') { s.gaugeTable = o.gaugeTable; s.gauge = String(o.gauge); }
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
    return GAUGE_TABLES[ref == null ? DEFAULT_GAUGE_TABLE : ref] || null;
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

  // Edge flange: bend (inner radius R, thickness T, sweep angle) plus a flat wall of length L, swept along each
  // selected straight edge of a flat sheet face. "Bend outside" placement: the flange sits beyond the edge.
  // `miter`: flanges on two selected edges that share a corner are extended past it and clipped by the corner's
  // bisector plane (each keeps its own side, moved apart by miterGap/2), so they meet at a mitre.
  // `relief` ('rect' | 'obround'): where a flange end runs into more sheet (the plate continues beyond the end,
  // inline or on the outward side) a slot reliefWidth wide (default T) is cut from the base before the flange is
  // added, from reliefDepth (default T/2) inside the edge out past the bend zone. Ends shared with another selected
  // edge (mitred or collinear) get no relief.
  // flangeLayout(f, model, ctx) -> the flange as plain data, from the edges of ctx.body (a CSG): { parts: [{ loop,
  // plane, t0, t1, clips: [{ n, w }] }] (each a prism of the section `loop` in `plane` from t0 to t1, kept where
  // n·p >= w for each clip), cuts: [{ loop, plane, a, b }] (prisms taken from the sheet first: trim-back and reliefs),
  // info (ctx.flanges' records), section: { A, R, T, L, ov } (flangeProfile's parameters) }. buildFlange builds it with
  // the CSG kernel; occt-kernel.js builds the same layout with exact bend arcs.
  function flangeLayout(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding edge flanges.');
    var sheet = sheetParams(model);
    var T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    if (f.hem && f.gap != null) R = Math.max(+f.gap / 2, 0.02 * T); // a hem whose gap was an equation: radius from the resolved gap
    var L = +f.length, A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180;
    // hem type (SolidWorks' Hem PropertyManager; absent = the legacy open hem): 'closed' folds flat with the minimum
    // inner radius CLOSED_HEM_R·T, 'teardrop' / 'rolled' sweep hemAngle at hemRadius (see hemSection)
    var hemType = f.hem && f.hemType != null ? String(f.hemType) : null;
    if (hemType && HEM_TYPES.indexOf(hemType) < 0) throw new Error('Unknown hem type "' + hemType + '" (open, closed, teardrop or rolled).');
    var curl = hemType === 'teardrop' || hemType === 'rolled';
    if (hemType === 'closed') R = CLOSED_HEM_R * T;
    if (curl) {
      R = f.hemRadius != null ? +f.hemRadius : +sheet.bendRadius;
      A = (f.hemAngle != null ? +f.hemAngle : DEFAULT_HEM_ANGLE) * Math.PI / 180;
      var hs = hemSection(hemType, A, R, T);
      L = hs.L;
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
    if (lengthRef === 'outer' || lengthRef === 'inner' || lengthRef === 'tangent') {
      if (lengthRef !== 'tangent' && !(A < Math.PI - 0.01)) throw new Error('A flange length to the ' + lengthRef + ' virtual sharp needs an angle below 180°; use Tangent Bend.');
      var toSharp = lengthRef === 'tangent' ? outsideSetback(A, R, T) : (lengthRef === 'outer' ? R + T : R) * Math.tan(A / 2);
      var what = lengthRef === 'tangent' ? 'the outside of the bend' : 'the ' + lengthRef + ' virtual sharp';
      if (!(L - toSharp > 1e-6)) throw new Error('Flange length must be longer than ' + fmtN(toSharp) + ' (the bend, to ' + what + ').');
      L -= toSharp;
    }
    var miter = !!f.miter, gap = Math.max(0, +f.miterGap || 0);
    var relief = f.relief === 'rect' || f.relief === 'obround' ? f.relief : 'none';
    var rw = f.reliefWidth != null ? +f.reliefWidth : T, rd = f.reliefDepth != null ? +f.reliefDepth : T / 2;
    if (relief !== 'none' && !(rw > 0)) throw new Error('Relief width must be greater than zero.');
    if (relief !== 'none' && !(rd >= 0)) throw new Error('Relief depth must be zero or more.');
    var mesh = meshFromBody(ctx.body);
    var edges = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
    var selected = resolveEdges((f.edges || []).map(function (e) { return { at: e.at, chain: false }; }), edges, Math.max(0.5, T));
    if (!selected.length) throw new Error('No edge selected for the flange.');
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
    var shift = position === 'inside' ? R + T : (position === 'outside' ? R : (position === 'virtualSharp' ? (R + T) * Math.tan(A / 2) : 0));
    var ov = Math.min(T, 0.5); // overlap into the sheet so the union is watertight
    var tools = [], cuts = [], info = [], eds = [];
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
      if (shift) {
        var cutPlane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
        var tca = dot(sub(e.a, e.mid), cutPlane.n), tcb = dot(sub(e.b, e.mid), cutPlane.n);
        cuts.push({ loop: [[-shift, 0.01], [-shift, -T - 0.01], [0.5, -T - 0.01], [0.5, 0.01]].reverse(), plane: cutPlane, a: Math.min(tca, tcb) - 0.01, b: Math.max(tca, tcb) + 0.01 });
        origin = sub(origin, scale(o, shift));
      }
      var plane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
      var loop = flangeProfile(A, R, T, L, ov);
      var wmax = 0;
      loop.forEach(function (p) { wmax = Math.max(wmax, p[0]); });
      var ta = dot(sub(e.a, e.mid), plane.n), tb = dot(sub(e.b, e.mid), plane.n);
      // ends: P = vertex, t = sweep coordinate, dIn = unit direction from the vertex into the edge
      eds.push({ e: e, nF: nF, o: o, u: u, plane: plane, loop: loop, wmax: wmax,
        ends: [{ P: e.a, t: ta, dIn: norm(sub(e.b, e.a)) }, { P: e.b, t: tb, dIn: norm(sub(e.a, e.b)) }] });
    });
    // corners shared by two selected edges: mark them (no relief there) and, with `miter`, set up the mitre planes
    for (var i = 0; i < eds.length; i++) for (var j = i + 1; j < eds.length; j++) {
      var ei = eds[i], ej = eds[j];
      var tol = Math.max(1e-4, 1e-3 * Math.min(ei.e.len, ej.e.len));
      for (var ki = 0; ki < 2; ki++) for (var kj = 0; kj < 2; kj++) {
        var ea = ei.ends[ki], eb = ej.ends[kj];
        if (len(sub(ea.P, eb.P)) > tol) continue;
        ea.shared = eb.shared = true;
        if (!miter || ea.miter || eb.miter) continue;
        var di = ea.dIn, dj = eb.dIn;
        if (len(cross(di, dj)) < 1e-6 || dot(ei.u, ej.u) < 0.99) continue; // collinear, or folding opposite ways
        var c = dot(ei.o, ej.o);
        if (1 + c < 0.05) continue;
        // corner of the (possibly trimmed-back) edge lines, and the bisector plane through it containing the sheet normal
        var V = scale(add(ea.P, eb.P), 0.5);
        if (shift) V = sub(V, scale(add(ei.o, ej.o), shift / (1 + c)));
        var nb = norm(sub(di, dj));
        [[ei, ea, nb], [ej, eb, scale(nb, -1)]].forEach(function (q) {
          var ed = q[0], en = q[1], n = q[2];
          // extend the sweep past the corner far enough for the outermost point of the section to reach the bisector
          var ext = ed.wmax * dot(ed.o, n) / dot(en.dIn, n);
          ext = Math.max(0, Math.min(ext, 4 * ed.wmax)) + 1;
          en.miter = { n: n, w: dot(V, n) + gap / 2, tExt: dot(sub(V, ed.plane.origin), ed.plane.n) - dot(en.dIn, ed.plane.n) * ext };
        });
      }
    }
    var inside = null;
    eds.forEach(function (ed) {
      var t0 = ed.ends[0].miter ? ed.ends[0].miter.tExt : ed.ends[0].t;
      var t1 = ed.ends[1].miter ? ed.ends[1].miter.tExt : ed.ends[1].t;
      tools.push({ loop: ed.loop, plane: ed.plane, t0: Math.min(t0, t1), t1: Math.max(t0, t1),
        clips: ed.ends.filter(function (en) { return en.miter; }).map(function (en) { return { n: en.miter.n, w: en.miter.w }; }) });
      if (relief !== 'none') ed.ends.forEach(function (en) {
        if (en.shared) return;
        // does the sheet continue beyond this end? probe half a thickness past it at mid-thickness, inside the
        // base (just behind the edge) and on the outward side (a plate lying beside the bend zone)
        if (!inside) inside = ctx.body.pointTester();
        var past = add(sub(en.P, scale(ed.nF, T / 2)), scale(en.dIn, -0.5 * T));
        if (!inside(add(past, scale(ed.o, -0.25 * T))) && !inside(add(past, scale(ed.o, (R + T) / 2)))) return;
        var beyond = -dot(en.dIn, ed.plane.n); // sign of t past the end
        var tA = beyond > 0 ? en.t : en.t - rw, tB = beyond > 0 ? en.t + rw : en.t;
        var o0 = -(shift + rd), o1 = R + T + rd;
        var slot = [[o1, tA], [o1, tB]];
        if (relief === 'obround') {
          var r = rw / 2, oc = o0 + r, tc = (tA + tB) / 2;
          for (var k = 0; k <= 12; k++) { var ph = Math.PI / 2 + Math.PI * k / 12; slot.push([oc + r * Math.cos(ph), tc + r * Math.sin(ph)]); }
        } else slot.push([o0, tB], [o0, tA]);
        // sweep the slot outline (in the sheet plane: o across, t along the edge) through the thickness (u ∈ [-T, 0])
        var sp = { origin: ed.plane.origin, x: ed.o, y: ed.plane.n, n: scale(ed.u, -1) };
        cuts.push({ loop: slot, plane: sp, a: -0.01, b: T + 0.01 });
        // for the flat pattern: the slot is w wide past this end and reaches d0 inside the (trimmed) edge line
        en.relief = { w: rw, d0: shift + rd, d1: rd, obround: relief === 'obround' };
      });
      var sh = scale(ed.o, -shift), e = ed.e;
      // miterPlanes: per end, the clip plane { n, w } (tool kept where n·p >= w) or null; the flat pattern uses it to
      // run the bend strip out to the mitre line. Plain arrays and numbers only: the record must survive a structured clone.
      var rec = { a: add(e.a, sh), b: add(e.b, sh), mid: add(e.mid, sh), origin: ed.plane.origin, o: ed.o, u: ed.u, len: e.len, angle: A, R: R, L: L, T: T,
        ba: customBA(f), mitred: [!!ed.ends[0].miter, !!ed.ends[1].miter],
        miterPlanes: ed.ends.map(function (en) { return en.miter ? { n: en.miter.n.slice(), w: en.miter.w } : null; }) };
      // reliefs: per end (a, b), the bend relief cut there ({ w, d0, d1, obround }) or null; flatPattern cuts it from the
      // blank as a notch w wide past the end, from d0 inside the edge line to d1 beyond the flat bend zone
      if (ed.ends[0].relief || ed.ends[1].relief) rec.reliefs = ed.ends.map(function (en) { return en.relief || null; });
      info.push(rec);
    });
    return { parts: tools, cuts: cuts, info: info, section: { A: A, R: R, T: T, L: L, ov: ov } };
  }
  // Flange length references and hem types (see flangeLayout). A closed hem cannot have a zero inner radius in a
  // solid: it folds at CLOSED_HEM_R·T (gap 2·0.02·T = 0.04·T, 0.0024 in on 16 ga), and its flat uses that radius
  // (BA = π·(0.02·T + K·T)); give the hem a Custom Bend Allowance for a shop's own hem value.
  var LENGTH_REFS = ['outer', 'inner', 'tangent', 'wall'];
  var HEM_TYPES = ['open', 'closed', 'teardrop', 'rolled'];
  var CLOSED_HEM_R = 0.02, DEFAULT_HEM_ANGLE = 270;
  // hemSection(type, A, R, T) -> { L }: the straight part after the curl of a tear drop or rolled hem (in the flange
  // section frame: o outward, u toward the fold, the sheet's fold-side face at u = 0). A rolled hem is the arc alone
  // (L = 0). A tear drop's arc is followed by a straight tail that runs back down to the sheet and stops at the closed
  // hem's gap (2·CLOSED_HEM_R·T) above it, so the solid stays one clean body. Throws when the curl would run into the
  // sheet (an angle past 270° whose outer arc dips below the fold-side face).
  function hemSection(type, A, R, T) {
    var name = type === 'teardrop' ? 'Tear drop' : 'Rolled';
    if (!isFinite(R) || !(R > 0)) throw new Error(name + ' hem radius must be greater than zero.');
    if (!isFinite(A)) throw new Error(name + ' hem angle must be a number.');
    if (type === 'teardrop' && !(A > Math.PI + 0.01 && A < 2 * Math.PI - 0.01)) throw new Error('Tear drop hem angle must be between 181° and 359°.');
    if (type === 'rolled' && !(A > 0.01 && A < 2 * Math.PI - 0.01)) throw new Error('Rolled hem angle must be between 1° and 359°.');
    var c = Math.cos(A), s = Math.sin(A), gap = 2 * CLOSED_HEM_R * T;
    // lowest point of the curl's end (inner and outer corner), above the fold-side face
    var uEnd = Math.min(R - R * c, R - (R + T) * c);
    if (A > 1.5 * Math.PI && uEnd < gap - 1e-9) throw new Error(name + ' hem angle ' + fmtN(A * 180 / Math.PI) + '° is too large for radius ' + fmtN(R) + ': the hem would run into the sheet.');
    if (type === 'rolled') return { L: 0 };
    return { L: Math.max(0, (uEnd - gap) / -s) };
  }
  // a feature's Custom Bend Allowance as plain data for the flange records ({ type, value } or null)
  function customBA(f) {
    var c = f.bendAllowance;
    if (!c || !c.type) return null;
    if (BA_TYPES.indexOf(c.type) < 0) throw new Error('Custom bend allowance: unknown type "' + c.type + '" (kfactor, allowance, deduction or table).');
    return { type: c.type, value: c.value == null ? null : +c.value };
  }
  function buildFlange(f, model, ctx) {
    var lay = flangeLayout(f, model, ctx);
    var tools = lay.parts.map(function (p) {
      var tool = prism(p.loop, p.plane, p.t0, p.t1, f.id);
      p.clips.forEach(function (c) { tool = tool.clipByPlane(c.n, c.w); });
      return tool;
    });
    ctx.flanges[f.id] = lay.info;
    ctx.flangeCut = lay.cuts.length ? unionAll(lay.cuts.map(function (c) { return prism(c.loop, c.plane, c.a, c.b, f.id); })) : null;
    return unionAll(tools);
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
    var meshR = meshFromBody(R), p = meshR.positions64;
    var caps = [], entry = [];
    meshR.faces.forEach(function (face, i) {
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
    var chosen = entry.length ? entry : caps;
    if (!chosen.length) return tool;
    var tag = tool.polygons.length ? tool.polygons[0].shared : undefined;
    var prisms = [];
    chosen.forEach(function (i) {
      var o = faceOutline(meshR, i);
      if (!o) return;
      var cl = faceLoopsClassified(o);
      // through the thickness along −n: from just in front of the face to just past the far surface
      var outers = cl.outers.map(function (l) { return prism(l, o.plane, -(T + eps), eps, tag); });
      if (!outers.length) return;
      var solid = unionAll(outers);
      if (cl.holes.length) solid = solid.subtract(unionAll(cl.holes.map(function (l) { return prism(l, o.plane, -(T + 2 * eps), 2 * eps, tag); })));
      prisms.push(solid);
    });
    if (!prisms.length) return tool;
    return unionTree(prisms);
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

  // -> { loops: [[[u,v],...]] (outer first, CCW; holes after), bends: [{a:[u,v], b:[u,v], label, up, angle, R, ba, bd,
  // method, source}], plane, sheet (the resolved parameters, kFactor always filled in), bbox, size: [w, h] (the blank's
  // bounding box), note (sheetNote: the parameters for the DXF / drawing note), warnings: [string] }
  // Recursive unfold on one side of the sheet: the base face (largest face on the +n side of the base sketch plane)
  // is mapped into the sketch frame; every flange attached to an unfolded face contributes a bend strip of length
  // BA (bendCalc: the sheet's bend allowance method, or the feature's custom one) beyond its edge and then unfolds its
  // wall face (real outline, holes included) with a rigid
  // map, recursively, so flanges on flanges and holes on walls all reach the flat. The regions are merged with the
  // CSG kernel (thin prisms) and the merged top face's outline is the blank.
  function flatPattern(model, build, mesh) {
    var rmodel = resolvedModel(model);
    if (rmodel.sheetError) throw new Error(rmodel.sheetError);
    model = rmodel.model;
    var sheet = model.sheet;
    if (!sheet) throw new Error('No sheet metal parameters: create a Base Flange first (Sheet Metal tab).');
    var base = model.features.filter(function (f) { return f.sheetBase; })[0];
    if (!base) throw new Error('No Base Flange feature found.');
    var sketch = findFeature(model, base.sketch);
    var plane = resolvePlane(sketch.plane, model, build.planes);
    var T = +sheet.thickness, warnings = [], kUsed = {};
    function warn(w) { if (w && warnings.indexOf(w) < 0) warnings.push(w); }
    mesh = planeFaces(mesh);
    var best = null;
    mesh.faces.forEach(function (face, i) {
      var d = dot(face.normal, plane.n);
      if (Math.abs(d) < 0.999) return;
      var score = face.area * (d > 0 ? 1 + 1e-9 : 1);
      if (!best || score > best.score) best = { face: face, i: i, score: score };
    });
    if (!best) throw new Error('Could not find the flat sheet face.');
    var flanges = [], anchors = [];
    model.features.forEach(function (f) {
      if ((f.type !== 'flange' && f.type !== 'jog' && f.type !== 'sketchedBend') || build.errors[f.id]) return;
      if (f.type === 'sketchedBend') { var sbr = sketchedBendRecords(flanges, anchors, build.flanges[f.id] || []); flanges = sbr.flanges; anchors = sbr.anchors; return; }
      (build.flanges[f.id] || []).forEach(function (fi) { flanges.push(fi); });
    });
    // a Sketched Bend's fixed side stays where it was: the unfold starts from the largest face parallel to the base
    // sketch on the sheet at the earliest anchor that still lies on such a face (else the largest such face, as before)
    anchors.some(function (pt) {
      var ab = null;
      mesh.faces.forEach(function (face, i) {
        var d = dot(face.normal, plane.n);
        var off = Math.abs(dot(face.normal, pt) - face.w);   // either face of the sheet there
        if (Math.abs(d) < 0.999 || (off > 1e-4 && Math.abs(off - T) > 1e-4)) return;
        var score = face.area * (d > 0 ? 1 + 1e-9 : 1);
        if (!ab || score > ab.score) ab = { face: face, i: i, score: score };
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
    function unfold(faceIdx, map, nTracked, depth) {
      if (usedFaces[faceIdx] || depth > 16) return;
      usedFaces[faceIdx] = true;
      var face = mesh.faces[faceIdx], o = faceOutline(mesh, faceIdx);
      if (!o) return;
      var loops2 = o.loops.map(function (l) { return l.map(function (p) { return map(to3D(o.plane, p[0], p[1])); }); });
      regions.push(loops2);
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
        var bc = bendCalc(sheet, fi.angle, fi.R, T, fi.ba), BA = bc.BA, eps = 1e-3;
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
          var mp = fi.miterPlanes && fi.miterPlanes[kk];
          if (!mp || dl <= 1e-9) return r;
          var dIn = norm(sub(kk === 0 ? fi.b : fi.a, P)), dn = dot(dIn, mp.n);
          if (!(dn > 1e-9)) return r;
          var kappa = dot(fi.o, mp.n) / dn;
          r.t0 = (dot(mp.n, P) - mp.w) / dn;
          r.ext = r.t0 + kappa * Rt * sA;
          r.slope = kappa * cA;
          r.mitred = true;
          return r;
        });
        // point at o-distance d from the edge and t past end r along the edge line
        function corner(r, d, t) { return [r.P[0] + o2[0] * d + r.dOut[0] * t, r.P[1] + o2[1] * d + r.dOut[1] * t]; }
        var eA = ends[0], eB = ends[1];
        // strip: base side at −eps (inside the sheet), far side at BA + eps (inside the wall). A mitred end passes through
        // the wall corner (BA, ext) itself and then follows the wall's end line for the eps overlap, so the strip never
        // pokes out past the wall's unfolded outline. With no wall after the bend (a rolled hem) the far side is BA itself.
        var far = fi.L > 1e-9 ? eps : 0;
        var strip = [corner(eA, -eps, eA.t0 - (eA.ext - eA.t0) * eps / BA), corner(eB, -eps, eB.t0 - (eB.ext - eB.t0) * eps / BA)];
        if (eB.mitred) strip.push(corner(eB, BA, eB.ext), corner(eB, BA + eps, eB.ext + eB.slope * eps));
        else strip.push(off(B2, BA + far));
        if (eA.mitred) strip.push(corner(eA, BA + eps, eA.ext + eA.slope * eps), corner(eA, BA, eA.ext));
        else strip.push(off(A2, BA + far));
        regions.push([strip]);
        // bend reliefs at the ends: a notch w wide past the end, from d0 inside the edge line out to d1 past the flat
        // bend zone (BA, or the slot's R + T reach in the solid when that is longer), so the blank's relief clears the
        // whole bend allowance; an obround relief has its inner end rounded, as in the solid
        (fi.reliefs || []).forEach(function (rl, kk) {
          if (!rl) return;
          var r = ends[kk], lo = -rl.d0, hi = Math.max(BA, fi.R + T) + rl.d1, w = rl.w, nt = [corner(r, hi, 0), corner(r, hi, w)];
          if (rl.obround) {
            var rr = w / 2;
            for (var q = 0; q <= 12; q++) { var ph = Math.PI / 2 + Math.PI * q / 12; nt.push(corner(r, lo + rr + rr * Math.cos(ph), rr + rr * Math.sin(ph))); }
          } else nt.push(corner(r, lo, w), corner(r, lo, 0));
          notches.push(signedArea(nt) < 0 ? nt.reverse() : nt);
        });
        // bend line: mid-strip, reaching the mitre line at a mitred end
        var bend = { a: corner(eA, BA / 2, (eA.t0 + eA.ext) / 2), b: corner(eB, BA / 2, (eB.t0 + eB.ext) / 2), up: trackedInner, angle: fi.angle * 180 / Math.PI, R: fi.R, ba: BA, bd: bc.BD, method: bc.type, source: bc.source };
        bend.label = bendNoteText(bend, model.units);
        bends.push(bend);
        var Pmid = add(add(fi.origin, scale(fi.o, Rt * sA)), scale(fi.u, fi.R - Rt * cA));
        var wn = trackedInner ? add(scale(fi.o, -sA), scale(fi.u, cA)) : add(scale(fi.o, sA), scale(fi.u, -cA));
        var tw = add(scale(fi.o, cA), scale(fi.u, sA));
        var dir3 = norm(cross(tw, wn)), dir2 = [o2[1], -o2[0]];
        var wallMap = function (Q) {
          var d = sub(Q, Pmid), s = dot(d, dir3), w = dot(d, tw);
          return [M2[0] + dir2[0] * s + o2[0] * (BA + w), M2[1] + dir2[1] * s + o2[1] * (BA + w)];
        };
        var wIdx = -1;
        // (a rolled hem is all bend: no wall after it)
        if (fi.L > 1e-9) mesh.faces.forEach(function (fc, i) { if (wIdx < 0 && dot(fc.normal, wn) > 0.999 && Math.abs(dot(fc.normal, Pmid) - fc.w) < 1e-3) wIdx = i; });
        if (wIdx >= 0 && !usedFaces[wIdx]) unfold(wIdx, wallMap, wn, depth + 1);
        else if (fi.L > 1e-9) regions.push([[corner(eA, BA - eps, eA.ext - eA.slope * eps), corner(eB, BA - eps, eB.ext - eB.slope * eps),
          corner(eB, BA + fi.L, eB.ext + eB.slope * fi.L), corner(eA, BA + fi.L, eA.ext + eA.slope * fi.L)]]);
      });
    }
    unfold(best.i, function (Q) { return to2D(plane, Q); }, best.face.normal, 0);
    // merge: thin prisms in the Front frame, union, outline of the top face
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
    var loops = fo.loops.map(function (l) { return l.map(function (p) { var q = to3D(fo.plane, p[0], p[1]); return [q[0], q[1]]; }); });
    loops.sort(function (a, b) { return signedArea(b) - signedArea(a); });
    if (!loops.length || signedArea(loops[0]) <= 0) throw new Error('Could not build the flat pattern.');
    var min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    loops.forEach(function (l) { l.forEach(function (p) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); }); });
    Object.keys(kUsed).forEach(function (k) {
      if (+k > 0.5 + 1e-9 || +k < 0) warn('K-factor ' + fmtN(+k) + ' is outside 0–0.5: the neutral axis would lie outside the sheet. If ' + fmtN(+k) + ' is a shop "material in bend" constant (BA = ' + fmtN(+k) + '·T + 1.571·R at 90°), the K-factor is ' + fmtN(+k) + ' / 1.5708 = ' + fmtN(Math.round(+k / (Math.PI / 2) * 1000) / 1000) + '.');
    });
    var outSheet = Object.assign({}, sheet, { kFactor: sheetKFactor(sheet) });
    return { loops: loops, bends: bends, plane: plane, sheet: outSheet, bbox: { min: min, max: max }, size: [max[0] - min[0], max[1] - min[1]], note: sheetNote(outSheet), warnings: warnings };
  }
  function near2(p, q) { return Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3; }
  // The unfold works on whole planes of a body, as Anvil's own mesh groups them (meshFromBody: coplanar polygons of a
  // body make one face). A mesh of OpenCascade's solid keeps every B-rep face apart (polygon.face), and a bend relief
  // leaves a sliver of the bend as a separate B-rep face on the plane of the wall beside it (and on the base's): the
  // unfold took that sliver for the wall and lost the wall, and the obround's slivers became stray loops. -> a mesh whose
  // faces are the coplanar groups (normal, w, area, polys, body; face indices change), or `mesh` itself when untagged.
  function planeFaces(mesh) {
    if (!mesh.faces.some(function (f) { return f.polys && f.polys.length && f.polys[0].face != null; })) return mesh;
    var groups = {}, faces = [];
    mesh.faces.forEach(function (f) {
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
    out.faces = faces;
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
  function inHalfSpaces(hs, p, tol) { return hs.every(function (h) { return dot(h.n, p) >= h.w - tol; }); }
  // the lines of a sketched bend's sketch in 3D: { plane, lines: [{ P1, P2, d, mid }] }
  function sketchedBendLines(f, model, ctx) {
    var sketch = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch);
    if (!sketch || sketch.type !== 'sketch') throw new Error('Select the sketch with the bend line(s).');
    var plane = resolvePlane(sketch.plane, model, ctx.planes || {}), lines = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || e.t === 'point') return;
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
  // from t0 to t1 in the flat, then moved by `motion`), info (ctx.flanges' records: { move: { keep, R, t } } entries
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
    lines.forEach(function (ln, k) {
      var s = 0;
      [0.5, 0.25, 0.75, 0.1, 0.9, 0.02, 0.98].some(function (t) {
        var q = add(ln.P1, scale(sub(ln.P2, ln.P1), t)), a = inside(add(q, scale(n, T / 2))), b = inside(sub(q, scale(n, T / 2)));
        if (a !== b) s = a ? 1 : -1;
        return s !== 0;
      });
      if (!s) throw new Error('Sketched Bend: line ' + (k + 1) + ' does not lie on a flat face of the sheet (sketch the bend lines on the face).');
      ln.s = s;
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
    lines.forEach(function (ln, k) {
      ln.m = scale(ln.m0, -sides[k]);   // across the line toward the moving side
      // the bend's inside face is the sheet face on the side it folds toward: the sketch face or the one T beyond it
      var innerOff = dot(up, n) * ln.s > 0 ? ln.s * T : 0;
      ln.O = add(add(ln.P1, scale(n, innerOff)), scale(ln.m, -shift));   // start of the bend strip, on the inside face
      ln.wS = dot(ln.m, ln.O);
      ln.a = norm(cross(ln.m, up));
      ln.band = [Math.min(dot(n, ln.P1), dot(n, ln.P1) + ln.s * T), Math.max(dot(n, ln.P1), dot(n, ln.P1) + ln.s * T)];
    });
    // lines must not cross on the sheet, nor lie on one another
    for (var i = 0; i < lines.length; i++) for (var j = i + 1; j < lines.length; j++) {
      var li = lines[i], lj = lines[j], c = cross(li.d, lj.d), cc = dot(c, c);
      if (cc < 1e-18) {
        if (Math.abs(dot(li.m0, lj.P1) - li.w0) < 1e-6) throw new Error('Sketched Bend: bend lines ' + (i + 1) + ' and ' + (j + 1) + ' lie on one another.');
        continue;
      }
      var X = add(li.P1, scale(li.d, dot(cross(sub(lj.P1, li.P1), lj.d), c) / cc));
      if (inside(add(X, scale(n, li.s * T / 2)))) throw new Error('Sketched Bend: bend lines ' + (i + 1) + ' and ' + (j + 1) + ' cross on the sheet.');
    }
    // nesting: a line whose midpoint lies on another's moving side rides on it; its parent is the deepest such line
    lines.forEach(function (ln, k) {
      ln.anc = [];
      lines.forEach(function (li, i2) { if (i2 !== k && dot(li.m, ln.mid) - dot(li.m, li.P1) > 1e-6) ln.anc.push(i2); });
    });
    lines.forEach(function (ln) {
      ln.parent = -1;
      ln.anc.forEach(function (i2) { if (ln.parent < 0 || lines[i2].anc.length > lines[ln.parent].anc.length) ln.parent = i2; });
    });
    lines.forEach(function (ln, k) {
      lines.forEach(function (li, i2) {
        if (i2 === k) return;
        var p = add(ln.mid, scale(ln.m, -shift));
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
    var G = [], pieces = [], bends = [], records = [], moves = [], ov = Math.min(T, 0.5), loop = flangeProfile(A, R, T, ov, ov), ba = customBA(f);
    order.forEach(function (k) {
      var ln = lines[k], Gp = ln.parent >= 0 ? G[ln.parent] : M_ID;
      var zone = region(k).concat([{ n: ln.m, w: ln.wS }, { n: scale(ln.m, -1), w: -(ln.wS + BA) }, { n: n, w: ln.band[0] }, { n: scale(n, -1), w: -ln.band[1] }]);
      var ext = regionExtent(ctx.body, zone, ln.O, ln.a);
      if (!ext || ext[1] - ext[0] < 1e-6) throw new Error('Sketched Bend: line ' + (k + 1) + ' does not cross the sheet.');
      var Oc = add(ln.O, scale(ln.a, (ext[0] + ext[1]) / 2)), half = (ext[1] - ext[0]) / 2;
      // the moving piece slides back by BA (the strip it rolls up), then turns by A about the bend's axis
      G[k] = mCompose(Gp, mCompose(mRotation(add(ln.O, scale(up, R)), ln.a, A), { R: M_ID.R, t: scale(ln.m, -BA) }));
      var keep = region(k).concat([beyond(k)]);
      pieces.push({ keep: keep, motion: G[k] });
      moves.push({ move: { keep: keep, R: G[k].R, t: G[k].t } });
      bends.push({ loop: loop, plane: { origin: Oc, x: ln.m, y: up, n: ln.a }, t0: -half, t1: half, motion: Gp });
      var reach = regionExtent(ctx.body, keep, ln.O, ln.m);
      // one record per line, shaped like an edge flange's (flangeLayout): the edge is the strip's start line
      records.push({ a: mPt(Gp, add(Oc, scale(ln.a, -half))), b: mPt(Gp, add(Oc, scale(ln.a, half))), mid: mPt(Gp, Oc), origin: mPt(Gp, Oc),
        o: mDir(Gp, ln.m), u: mDir(Gp, up), len: 2 * half, angle: A, R: R, L: reach ? Math.max(T, reach[1] - BA) : T, T: T, ba: ba,
        mitred: [false, false], miterPlanes: [null, null], sketched: true });
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
    var bends = lay.bends.map(function (bd) { return mBody(prism(bd.loop, bd.plane, bd.t0, bd.t1, f.id), bd.motion); });
    ctx.flanges[f.id] = lay.info;
    return { body: unionTree([fixed].concat(moved, bends)), tool: unionAll(bends), preview: unionTree(moved.concat(bends)) };
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
    recs.forEach(function (r) { if (r.anchor) anchors.push(r.anchor); else if (!r.move) flanges.push(r); });
    return { flanges: flanges, anchors: anchors };
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.buildFlange = buildFlange; K.flangeLayout = flangeLayout; K.buildJog = buildJog; K.normalCutTool = normalCutTool;
  K.flangeProfile = flangeProfile; K.flatPattern = flatPattern; K.bendAllowance = bendAllowance; K.sheetParams = sheetParams;
  K.bendDeduction = bendDeduction; K.outsideSetback = outsideSetback; K.bendCalc = bendCalc; K.bendTableLookup = bendTableLookup;
  K.makeSheet = makeSheet; K.sheetKFactor = sheetKFactor; K.sheetNote = sheetNote; K.gaugeTables = GAUGE_TABLES; K.gaugeTable = gaugeTable; K.gaugeRow = gaugeRow;
  K.DEFAULT_K_FACTOR = DEFAULT_K; K.LEGACY_K_FACTOR = LEGACY_K; K.DEFAULT_GAUGE_TABLE = DEFAULT_GAUGE_TABLE; K.BEND_ALLOWANCE_TYPES = BA_TYPES.slice();
  K.bendNoteText = bendNoteText; K.hemSection = hemSection; K.FLANGE_LENGTH_REFS = LENGTH_REFS.slice(); K.HEM_TYPES = HEM_TYPES.slice();
  K.CLOSED_HEM_RADIUS = CLOSED_HEM_R; K.DEFAULT_HEM_ANGLE = DEFAULT_HEM_ANGLE;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.buildFlange = buildFlange; _.buildJog = buildJog; _.normalCutTool = normalCutTool;
  K.buildSketchedBend = buildSketchedBend; K.sketchedBendLayout = sketchedBendLayout; K.SKETCHED_BEND_POSITIONS = SB_POSITIONS.slice();
  _.buildSketchedBend = buildSketchedBend; _.sketchedBendPoint = sketchedBendPoint;
})(Kernel, Kernel._);
