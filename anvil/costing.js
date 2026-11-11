// costing.js — Evaluate ▸ Costing (SolidWorks 2024's Costing task pane), the arithmetic only (no DOM).
// A shop quote from the part as built:
//   sheet metal  material (the blank's weight × $/lb: the bounding sheet or the true blank, as the template says),
//                laser cut length × $/in (outline + every cut out, read from the flat pattern the laser DXF writes),
//                pierces × $ (one per closed loop), bends × $, setup ÷ lot size, then markup
//   machined     the stock block (the part's bounding box + an allowance each side) × $/lb, removed volume × $/in³,
//                setups × $ ÷ lot size, then markup
// Rates are a template in shop units (inches, pounds, dollars); a millimetre part is converted. Costing.estimate(model,
// build, mesh, rates) -> { kind: 'sheet' | 'machined', lines: [{ key, label, qty, unit, rate, cost }], subtotal, markup,
// perPart, lot, lotSize, inputs, error? }. The sheet-metal inputs come from Kernel.sheetCutList (the Cut-List
// Properties), so a quote and the cut list never disagree.
var Costing = (function () {
  'use strict';
  var IN_PER_MM = 1 / 25.4, LBIN3_PER_KGM3 = 3.6127292e-5;
  // the template: $/lb per material (by its library name; `default` for any other), cut, pierce, bend, setup, lot, markup
  var DEFAULT_RATES = {
    materialPerLb: { 'default': 0.85, 'Plain Carbon Steel': 0.55, 'AISI 1020': 0.55, 'AISI 304': 2.40, 'AISI 316 Stainless Steel Sheet (SS)': 3.10, '6061-T6 (SS)': 2.80, '5052-H32': 2.60, 'Brass': 4.50, 'Copper': 5.20 },
    basis: 'sheet',        // material charged on 'sheet' (the bounding rectangle of the flat) or 'blank' (the true blank)
    cutPerIn: 0.015,       // laser, $ per inch of cut
    piercePer: 0.10,       // $ per pierce
    bendPer: 1.25,         // press brake, $ per bend hit
    setup: 45,             // $ per lot (programming, brake setup)
    lotSize: 25,
    markupPct: 25,
    stockAllowance: 0.125, // machined: stock oversize per side, inches
    removedPerIn3: 2.50,   // machined: $ per cubic inch removed
    setupPer: 40,          // machined: $ per machine setup (per lot)
    setups: 2
  };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  // rates(partial?) -> the full template (missing keys from DEFAULT_RATES; materialPerLb merged by name)
  function rates(r) {
    var out = clone(DEFAULT_RATES);
    if (!r) return out;
    Object.keys(r).forEach(function (k) {
      if (k === 'materialPerLb' && r[k] && typeof r[k] === 'object') Object.keys(r[k]).forEach(function (m) { if (isFinite(+r[k][m])) out.materialPerLb[m] = +r[k][m]; });
      else if (k === 'basis') out.basis = r[k] === 'blank' ? 'blank' : 'sheet';
      else if (k in DEFAULT_RATES && isFinite(+r[k])) out[k] = +r[k];
    });
    if (!(out.lotSize >= 1)) out.lotSize = 1;
    return out;
  }
  function materialRate(R, name) { var m = R.materialPerLb; return name && m[name] != null ? +m[name] : +m['default']; }
  function line(key, label, qty, unit, rate) { return { key: key, label: label, qty: qty, unit: unit, rate: rate, cost: qty * rate }; }
  function finish(kind, lines, R, inputs) {
    var sub = 0;
    lines.forEach(function (l) { sub += l.cost; });
    var mk = sub * R.markupPct / 100, per = sub + mk;
    return { kind: kind, lines: lines, subtotal: sub, markup: mk, markupPct: R.markupPct, perPart: per, lot: per * R.lotSize, lotSize: R.lotSize, inputs: inputs, rates: R };
  }
  // sheetMetal(input, rates) with input in shop units: { thickness (in), sheetArea (in², bounding rectangle), blankArea
  // (in², outline less cut outs), cutLength (in), pierces, bends, densityLbIn3, material }
  function sheetMetal(inp, r) {
    var R = rates(r), rate = materialRate(R, inp.material);
    var wSheet = inp.sheetArea * inp.thickness * inp.densityLbIn3, wBlank = inp.blankArea * inp.thickness * inp.densityLbIn3;
    var w = R.basis === 'blank' ? wBlank : wSheet;
    var lines = [
      line('material', 'Material (' + (inp.material || 'no material') + ', ' + (R.basis === 'blank' ? 'true blank' : 'bounding sheet') + ')', w, 'lb', rate),
      line('cut', 'Laser cut length', inp.cutLength, 'in', R.cutPerIn),
      line('pierce', 'Pierces', inp.pierces, 'ea', R.piercePer),
      line('bend', 'Bends', inp.bends, 'ea', R.bendPer),
      line('setup', 'Setup ÷ lot size', 1 / R.lotSize, 'lot', R.setup)
    ];
    var o = clone(inp); o.sheetWeightLb = wSheet; o.blankWeightLb = wBlank;
    return finish('sheet', lines, R, o);
  }
  // machined(input, rates): { size: [x, y, z] (in, the part's bounding box), volume (in³), densityLbIn3, material }
  function machined(inp, r) {
    var R = rates(r), rate = materialRate(R, inp.material), a = 2 * R.stockAllowance;
    var stock = [inp.size[0] + a, inp.size[1] + a, inp.size[2] + a], sv = stock[0] * stock[1] * stock[2];
    var removed = Math.max(0, sv - inp.volume), w = sv * inp.densityLbIn3;
    var lines = [
      line('material', 'Stock block ' + stock.map(function (x) { return +x.toFixed(4); }).join(' × ') + ' in (' + (inp.material || 'no material') + ')', w, 'lb', rate),
      line('removed', 'Material removed', removed, 'in³', R.removedPerIn3),
      line('setups', 'Setups (' + R.setups + ') ÷ lot size', R.setups / R.lotSize, 'setup', R.setupPer),
      line('setup', 'Setup ÷ lot size', 1 / R.lotSize, 'lot', R.setup)
    ];
    var o = clone(inp); o.stock = stock; o.stockVolume = sv; o.removed = removed; o.stockWeightLb = w;
    return finish('machined', lines, R, o);
  }
  // the part's inputs in shop units from the model, its build and mesh
  function inputs(model, build, mesh) {
    var K = Kernel, mm = model.units !== 'in', s = mm ? IN_PER_MM : 1, MT = typeof Materials !== 'undefined' ? Materials : null;
    var density = model.density > 0 ? +model.density : (MT ? MT.DEFAULT_DENSITY : 7800);
    var mat = (MT && MT.materialName ? MT.materialName(model) : null) || model.materialName || null;
    if (model.sheet) {
      var cl = K.sheetCutList(model, build, mesh);
      if (cl.error && !cl.flat) return { error: cl.error };
      var v = cl.values;
      return { kind: 'sheet', material: mat, densityLbIn3: density * LBIN3_PER_KGM3, thickness: v['Sheet Metal Thickness'] * s,
        sheetLength: v['Bounding Box Length'] * s, sheetWidth: v['Bounding Box Width'] * s,
        sheetArea: v['Bounding Box Area'] * s * s, blankArea: v['Bounding Box Area-Blank'] * s * s,
        cutLength: (v['Cutting Length-Outer'] + v['Cutting Length-Inner']) * s, pierces: 1 + v['Cut Outs'], bends: v['Bends'] };
    }
    if (!mesh || !mesh.triCount) return { error: 'Build a solid first.' };
    var mp = K.massProps(mesh, density), b = mp.bbox;
    return { kind: 'machined', material: mat, densityLbIn3: density * LBIN3_PER_KGM3, volume: mp.volume * s * s * s,
      size: [(b.max[0] - b.min[0]) * s, (b.max[1] - b.min[1]) * s, (b.max[2] - b.min[2]) * s] };
  }
  function estimate(model, build, mesh, r) {
    var inp;
    try { inp = inputs(model, build, mesh); } catch (e) { inp = { error: e.message }; }
    if (inp.error) return { error: inp.error, lines: [], perPart: 0, lot: 0 };
    return inp.kind === 'sheet' ? sheetMetal(inp, r) : machined(inp, r);
  }
  return { DEFAULT_RATES: DEFAULT_RATES, rates: rates, materialRate: materialRate, sheetMetal: sheetMetal, machined: machined, inputs: inputs, estimate: estimate, LBIN3_PER_KGM3: LBIN3_PER_KGM3 };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Costing;
