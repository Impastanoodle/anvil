// ui-costing.js — Evaluate ▸ Costing: SolidWorks 2024's Costing task pane over costing.js (lane evalgrey, rfLP).
// The pane opens in the Task Pane on the right: the method (Sheet Metal for a part with a sheet, else Machining), the
// material and its $ / lb, the template's rates (laser $ / in, $ / pierce, $ / bend, setup, lot size, markup; for
// machining the stock allowance, $ / in³ removed and the setups), the breakdown line by line and the cost per part and
// for the lot. Every edit re-costs at once; the rates are the app's template, kept in this browser (localStorage
// 'anvil.costing') like the other settings, and Reset puts the shipped template back. The quote follows every rebuild
// while the pane is open. Esc or ✕ closes it. window.anvil.costing() returns the current quote.
(function (UI) {
  'use strict';
  if (typeof Costing === 'undefined') return;
  var App = UI.App, el = UI.el, KEY = 'anvil.costing';
  var st = { open: false, quote: null };
  function loadRates() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    try { return Costing.rates(raw ? JSON.parse(raw) : null); } catch (e) { return Costing.rates(null); }
  }
  function saveRates(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* private window: the template stays for this session */ } }
  var rates = loadRates();
  function money(x) { return '$' + (Math.round(x * 100) / 100).toFixed(2); }
  function num(x, d) { return UI.fmtNum ? UI.fmtNum(x, d == null ? 3 : d) : (+x).toFixed(d == null ? 3 : d); }
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function quote() {
    st.quote = App.model && App.build ? Costing.estimate(App.model, App.build, App.mesh, rates) : { error: 'Open a part first.', lines: [] };
    return st.quote;
  }
  function field(label, key, step, unit, get, set) {
    var inp = el('input', { type: 'number', step: String(step), 'data-key': key });
    inp.value = String(get());
    inp.addEventListener('change', function () {
      var v = parseFloat(inp.value);
      if (!isFinite(v) || v < 0) { inp.value = String(get()); return; }
      set(v); saveRates(rates); render();
    });
    return el('label', { class: 'cost-row' }, [el('span', { text: label }), inp, el('span', { class: 'cost-unit', text: unit || '' })]);
  }
  function rateField(label, key, step, unit) {
    return field(label, key, step, unit, function () { return rates[key]; }, function (v) { rates[key] = key === 'lotSize' ? Math.max(1, Math.round(v)) : v; });
  }
  function render() {
    if (!st.open) return;
    var body = document.getElementById('tp-body'), title = document.getElementById('tp-title');
    if (!body) return;
    // another Task Pane tab (the strip) took the pane: the costing pane is closed
    if (!title || !title.querySelector('[data-role="cost-title"]')) { st.open = false; body.classList.remove('cost-pane'); return; }
    var q = quote(), keep = document.activeElement && body.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
    body.innerHTML = '';
    body.classList.add('cost-pane');
    if (q.error) { body.appendChild(el('p', { class: 'cost-error', text: q.error })); return; }
    var sheet = q.kind === 'sheet', mat = q.inputs.material || null;
    body.appendChild(el('h3', { text: 'Method' }));
    body.appendChild(el('p', { 'data-role': 'cost-method', text: sheet ? 'Sheet Metal: laser cut and press brake, from the flat pattern' : 'Machining: milled from a stock block' }));
    body.appendChild(el('h3', { text: 'Material' }));
    body.appendChild(el('p', { text: (mat || 'No material: the template\'s default rate') + (sheet ? ', ' + num(q.inputs.thickness, 4) + ' in sheet' : '') }));
    body.appendChild(field('$ / lb', 'materialPerLb', 0.01, '', function () { return Costing.materialRate(rates, mat); }, function (v) { rates.materialPerLb[mat || 'default'] = v; }));
    if (sheet) {
      var basis = el('select', { 'data-key': 'basis' }, [el('option', { value: 'sheet', text: 'Bounding sheet (' + num(q.inputs.sheetLength, 3) + ' × ' + num(q.inputs.sheetWidth, 3) + ' in, ' + num(q.inputs.sheetWeightLb, 3) + ' lb)' }),
        el('option', { value: 'blank', text: 'True blank (' + num(q.inputs.blankWeightLb, 3) + ' lb)' })]);
      basis.value = rates.basis;
      basis.addEventListener('change', function () { rates.basis = basis.value; saveRates(rates); render(); });
      body.appendChild(el('label', { class: 'cost-row' }, [el('span', { text: 'Charge on' }), basis]));
      body.appendChild(el('h3', { text: 'Rates' }));
      body.appendChild(rateField('Laser cut', 'cutPerIn', 0.001, '$ / in'));
      body.appendChild(rateField('Pierce', 'piercePer', 0.01, '$ each'));
      body.appendChild(rateField('Bend', 'bendPer', 0.05, '$ each'));
    } else {
      body.appendChild(el('h3', { text: 'Rates' }));
      body.appendChild(rateField('Stock allowance', 'stockAllowance', 0.0625, 'in / side'));
      body.appendChild(rateField('Removal', 'removedPerIn3', 0.1, '$ / in³'));
      body.appendChild(rateField('Setups', 'setups', 1, ''));
      body.appendChild(rateField('Per setup', 'setupPer', 1, '$'));
    }
    body.appendChild(rateField('Setup (lot)', 'setup', 1, '$'));
    body.appendChild(rateField('Lot size', 'lotSize', 1, 'parts'));
    body.appendChild(rateField('Markup', 'markupPct', 1, '%'));
    body.appendChild(el('h3', { text: 'Breakdown' }));
    var t = el('table', { class: 'cost-table' });
    t.appendChild(el('tr', {}, [el('th', { text: 'Item' }), el('th', { text: 'Qty' }), el('th', { text: 'Rate' }), el('th', { text: 'Cost' })]));
    q.lines.forEach(function (l) {
      var tr = el('tr', { 'data-line': l.key }, [el('td', { text: l.label }), el('td', { text: num(l.qty, 3) + ' ' + l.unit }), el('td', { text: money(l.rate) }), el('td', { text: money(l.cost) })]);
      t.appendChild(tr);
    });
    t.appendChild(el('tr', { class: 'cost-sum' }, [el('td', { text: 'Subtotal' }), el('td'), el('td'), el('td', { text: money(q.subtotal) })]));
    t.appendChild(el('tr', {}, [el('td', { text: 'Markup ' + q.markupPct + ' %' }), el('td'), el('td'), el('td', { text: money(q.markup) })]));
    body.appendChild(t);
    body.appendChild(el('div', { class: 'cost-total', 'data-role': 'cost-total' }, [
      el('div', {}, [el('span', { text: 'Cost per part' }), el('b', { 'data-role': 'per-part', text: money(q.perPart) })]),
      el('div', {}, [el('span', { text: 'Lot of ' + q.lotSize }), el('b', { 'data-role': 'lot', text: money(q.lot) })])
    ]));
    body.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn', text: 'Reset template', title: 'Put the shipped rates back (the edits are kept in this browser until then)', onclick: function () { rates = Costing.rates(null); saveRates(rates); render(); } })]));
    if (keep) { var again = body.querySelector('[data-key="' + keep + '"]'); if (again) again.focus(); }
    UI.setStatus('Costing: ' + money(q.perPart) + ' per part, ' + money(q.lot) + ' for ' + q.lotSize + '.');
  }
  function close() {
    if (!st.open) return false;
    st.open = false;
    var body = document.getElementById('tp-body');
    if (body) body.classList.remove('cost-pane');
    if (UI.closeTaskPane) UI.closeTaskPane();
    return true;
  }
  function cmdCosting() {
    if (isAsm()) { UI.toast('Costing works on a part: open the part.'); return; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast('Build a solid first.'); return; }
    if (UI.hasPM && UI.hasPM() && UI.pmCancel) UI.pmCancel();
    if (UI.closeTaskPane) UI.closeTaskPane();
    var panel = document.getElementById('tp-panel'), title = document.getElementById('tp-title');
    panel.hidden = false;
    title.innerHTML = '';
    title.appendChild(el('span', { 'data-role': 'cost-title', html: Icons('costing', 16) + ' Costing' }));
    title.appendChild(el('button', { text: '✕', title: 'Close', onclick: close }));
    st.open = true;
    // lane progress: the estimate unfolds a sheet part on the main thread; on a big part the card is painted first
    if (UI.progress) UI.progress.run('Costing', function () { render(); }, { card: true }); else render();
    setTimeout(UI.resize, 0);
  }
  UI.escapeBoxes = UI.escapeBoxes || [];
  UI.escapeBoxes.push(function () { if (st.open) render(); return close(); });
  UI.onBuild = UI.onBuild || [];
  UI.onBuild.push(function () { if (st.open) { if (isAsm()) close(); else render(); } });
  UI.cmdCosting = cmdCosting;
  UI.costing = { open: function () { return st.open; }, quote: function () { return st.quote; }, rates: function () { return rates; }, close: close, render: render,
    setRates: function (r) { rates = Costing.rates(Object.assign({}, rates, r || {})); saveRates(rates); render(); return rates; }, reset: function () { rates = Costing.rates(null); saveRates(rates); render(); return rates; } };
  if (typeof window !== 'undefined' && window.anvil) window.anvil.costing = function (r) { return Costing.estimate(App.model, App.build, App.mesh, r ? Costing.rates(Object.assign({}, rates, r)) : rates); };
})(UI);
