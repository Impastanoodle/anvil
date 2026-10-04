// ui-rebuild.js — r12/occtui12: rebuild feedback as in SolidWorks. The status bar's rebuild chip ("Fully rebuilt",
// "2 rebuild errors" in red, "1 rebuild warning" in amber; click it for What's Wrong), the FeatureManager marks (the
// feature keeps its own icon with a small red ✗ / amber ⚠ badge on it, the name red / amber, a Dangling tag in olive
// on a sketch whose face is gone, the part and a parent feature badged when something under them failed, a tooltip
// saying what is wrong and where to look), the What's Wrong dialog (every rebuild error and warning: type, feature,
// description, Go To / Edit) and the right-click "What's Wrong?" item. Errors and warnings come from the build
// (Kernel.rebuild's errors / warnings, equation errors, an assembly's component / mate errors) and from the
// OpenCascade kernel (ui-occt.js: a feature it could not build, a volume that differs: Anvil's result is then shown,
// so these are warnings). Hooks called by ui-panels.js: UI.rebuildStatusHtml, UI.rebuildMarkRow, UI.rebuildMarkRoot,
// UI.whatsWrong.
(function (UI) {
  'use strict';
  var App = UI.App, K = window.Kernel;

  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function ico(name, size) { return window.Icons ? Icons(name, size || 12) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isDangling(msg) { return /^Dangling\b/.test(String(msg || '')); }

  function owner(id) {
    if (!App.model) return null;
    if (isAsm() && typeof Assembly !== 'undefined') {
      var c = Assembly.findComponent && Assembly.findComponent(App.model, id);
      if (c) return { name: c.name || ('Component ' + id), kind: 'component', icon: 'part' };
      var m = Assembly.findMate && Assembly.findMate(App.model, id);
      if (m) return { name: (UI.mateLabel ? UI.mateLabel(m) : m.name) || ('Mate ' + id), kind: 'mate', icon: 'mate' };   // r13/asmui13: "Distance1 (Cap<1>, Plate<1>)"
      var p = Assembly.findPattern && Assembly.findPattern(App.model, id);
      if (p) return { name: p.name || ('Pattern ' + id), kind: 'pattern', icon: 'lpatternComp' };
      return null;
    }
    var f = K.findFeature(App.model, id);
    return f ? { name: f.name, kind: 'feature', icon: null, feature: f } : null;
  }
  function eqMessages(b) {
    var errs = b && b.equationErrors, out = [];
    if (!errs) return out;
    function msgOf(e) { return typeof e === 'string' ? e : (e && (e.error || e.message || e.msg)) || String(e); }
    if (Array.isArray(errs)) errs.forEach(function (e) { if (e) out.push({ name: e.name || '', msg: msgOf(e) }); });
    else if (typeof errs === 'object') Object.keys(errs).forEach(function (k) { out.push({ name: k, msg: msgOf(errs[k]) }); });
    return out;
  }
  // issues() -> [{ kind: 'error' | 'warning', id, what: 'feature' | 'component' | 'mate' | 'equation' | 'kernel', name, msg }]
  function issues() {
    var b = App.build, out = [];
    if (!b) return out;
    Object.keys(b.errors || {}).forEach(function (id) { var o = owner(+id); out.push({ kind: 'error', id: +id, what: o ? o.kind : 'feature', name: o ? o.name : 'Item ' + id, msg: String(b.errors[id]) }); });
    eqMessages(b).forEach(function (e) { out.push({ kind: 'error', id: null, what: 'equation', name: e.name ? 'Equation ' + e.name : 'Equations', eq: e.name, msg: String(e.msg) }); });
    Object.keys(b.warnings || {}).forEach(function (id) { var o = owner(+id); out.push({ kind: 'warning', id: +id, what: o ? o.kind : 'feature', name: o ? o.name : 'Item ' + id, msg: String(b.warnings[id]), dangling: isDangling(b.warnings[id]) }); });
    var oc = UI.occt && UI.occt.on() ? UI.occt.status() : null;
    if (oc) {
      var anvilShown = ' Anvil\'s own result is shown.';
      if (oc.state === 'featureError') out.push({ kind: 'warning', id: featureIdByName(oc.failedFeature), what: 'kernel', name: oc.failedFeature || 'OpenCascade kernel', msg: 'OpenCascade could not build this feature' + (oc.error ? ': ' + oc.error : '') + '.' + anvilShown });
      else if (oc.state === 'mismatch') out.push({ kind: 'warning', id: null, what: 'kernel', name: 'OpenCascade kernel', msg: 'Its volume (' + (oc.volume || 0).toFixed(3) + ') differs from Anvil\'s (' + (oc.anvilVolume || 0).toFixed(3) + ').' + anvilShown });
      else if (oc.state === 'invalid') out.push({ kind: 'warning', id: null, what: 'kernel', name: 'OpenCascade kernel', msg: 'Its solid is not valid.' + anvilShown });
      else if (oc.state === 'error') out.push({ kind: 'warning', id: null, what: 'kernel', name: 'OpenCascade kernel', msg: (oc.error || 'It failed') + '.' + anvilShown });
      else if (oc.state === 'unsupported') out.push({ kind: 'warning', id: null, what: 'kernel', name: 'OpenCascade kernel', msg: 'This part needs ' + oc.unsupported + ', which OpenCascade does not build yet.' + anvilShown });
    }
    return out;
  }
  function featureIdByName(name) {
    var f = name && App.model && (App.model.features || []).filter(function (x) { return x.name === name; })[0];
    return f ? f.id : null;
  }

  // ---- the status bar chip (ui-panels.js refreshStatus)
  UI.rebuildStatusHtml = function () {
    var b = App.build, errs = b ? Object.keys(b.errors || {}).length + eqMessages(b).length : 0, warns = b ? Object.keys(b.warnings || {}).length : 0;
    if (errs) return '<span class="rb-chip err" data-act="whatswrong" title="Rebuild errors' + (warns ? ' and warnings' : '') + ': click for What\'s Wrong">' + ico('error', 12) +
      errs + ' rebuild error' + (errs > 1 ? 's' : '') + (warns ? ', ' + warns + ' warning' + (warns > 1 ? 's' : '') : '') + '</span>';
    if (warns) return '<span class="rb-chip warn" data-act="whatswrong" title="Rebuild warnings: click for What\'s Wrong">' + ico('warn', 12) + warns + ' rebuild warning' + (warns > 1 ? 's' : '') + '</span>';
    return '<span class="rb-chip ok" title="Every feature rebuilt">Fully rebuilt</span>';
  };
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('#status-right [data-act]');
    if (!t) return;
    if (t.getAttribute('data-act') === 'whatswrong') whatsWrong();
    else if (t.getAttribute('data-act') === 'occt-engine' && UI.occt && UI.occt.engineDialog) UI.occt.engineDialog();
  });

  // ---- FeatureManager marks (ui-panels.js featureRow / refreshTree)
  function childIds(f) {
    var ids = [];
    if (f.sketch != null) ids.push(f.sketch);
    if (f.profile != null) ids.push(f.profile);
    if (f.path != null && !Array.isArray(f.path)) ids.push(f.path);
    if (f.sketches) ids = ids.concat(f.sketches);
    return ids;
  }
  function badge(row, kind) {
    var ic = row.children[1];
    if (!ic) return;
    ic.classList.add('rb-ico');
    var old = ic.querySelector('.rb-badge');
    if (old) old.remove();
    if (!kind) return;
    var bd = document.createElement('i');
    bd.className = 'rb-badge ' + kind;
    bd.innerHTML = ico(kind === 'err' ? 'error' : 'warn', 10);
    ic.appendChild(bd);
  }
  UI.rebuildBadge = badge;   // r13/asmui13: the assembly rows (ui-assembly.js markAsmTree) use the same badge
  // the row keeps the feature's own icon; the badge says error / warning; a parent whose sketch failed is badged too
  UI.rebuildMarkRow = function (row, f, err, warn, icon) {
    var b = App.build, errors = (b && b.errors) || {}, warnings = (b && b.warnings) || {};
    var kidErr = null, kidWarn = null;
    if (!err && !warn) childIds(f).forEach(function (id) { var k = K.findFeature(App.model, id); if (!k) return; if (errors[id] && !kidErr) kidErr = k.name + ': ' + errors[id]; else if (warnings[id] && !kidWarn) kidWarn = k.name + ': ' + warnings[id]; });
    if (!err && !warn && !kidErr && !kidWarn) return;
    var ic = row.children[1];
    if (ic && icon && (err || warn) && window.Icons) { ic.innerHTML = ''; ic.appendChild(Icons.node ? Icons.node(icon, 16) : document.createRange().createContextualFragment(Icons(icon, 16))); }
    badge(row, err || kidErr ? 'err' : 'warn');
    var nm = row.querySelector('.nm'), msg = err || warn;
    var tip = msg ? f.name + ' — rebuild ' + (err ? 'error' : 'warning') + ':\n' + msg
      : f.name + ' — ' + (kidErr ? 'an error' : 'a warning') + ' in a feature under it:\n' + (kidErr || kidWarn);
    if (warn && isDangling(warn)) {
      row.classList.add('dangling');
      tip += '\nRight-click ▸ Edit Sketch Plane to put it on another face.';
      if (!row.querySelector('.rb-tag')) {
        var tag = document.createElement('span');
        tag.className = 'rb-tag'; tag.textContent = 'Dangling';
        var bdg = row.querySelector('.badge');
        row.insertBefore(tag, bdg || null);
      }
    }
    tip += '\nRight-click ▸ What\'s Wrong? lists every error and warning.';
    if (nm) nm.title = tip;
    row.title = tip;
  };
  UI.rebuildMarkRoot = function (root) {
    var list = issues(), errs = list.filter(function (x) { return x.kind === 'error'; }).length, warns = list.length - errs;
    if (!root._rbMenu) {
      root._rbMenu = true;
      root.addEventListener('contextmenu', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (UI.showMenu) UI.showMenu(e.clientX, e.clientY, [{ label: 'What\'s Wrong?', action: function () { whatsWrong(); } }, { label: 'Rebuild', key: 'Ctrl+B', action: function () { UI.rebuild(); } }]);
      });
    }
    if (!list.length) return;
    badge(root, errs ? 'err' : 'warn');
    root.title = (errs ? errs + ' rebuild error' + (errs > 1 ? 's' : '') : '') + (errs && warns ? ', ' : '') + (warns ? warns + ' warning' + (warns > 1 ? 's' : '') : '') + ': right-click ▸ What\'s Wrong?';
  };

  // ---- Go To: the item's row in the FeatureManager, its folder opened, selected, scrolled into view and flashed
  function treeRow(it) {
    var tree = document.getElementById('tree');
    if (!tree || it.id == null) return null;
    var attr = it.what === 'component' ? 'data-comp' : it.what === 'mate' ? 'data-mate' : it.what === 'pattern' ? 'data-pattern' : 'data-fid';
    return tree.querySelector('.ti[' + attr + '="' + it.id + '"]');
  }
  function goTo(it) {
    if (UI.setFmTab && App.fmTab && App.fmTab !== 'tree') UI.setFmTab('tree');
    if (it.what === 'equation') { if (UI.showEquations) UI.showEquations(it.eq || undefined); return; }
    var row = treeRow(it);
    if (!row) { if (UI.setStatus) UI.setStatus(it.name + ': ' + it.msg); return; }
    if (!row.getClientRects().length) {   // inside a collapsed feature (a sketch) or the Mates folder: open it
      var box = row.parentElement, head = box && box.previousElementSibling, tw = head && head.querySelector('.tw');
      if (tw && box.classList.contains('tc')) tw.click();
      row = treeRow(it) || row;
    }
    row.click();
    row = treeRow(it) || row;
    if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    row.classList.remove('rb-flash'); void row.offsetWidth; row.classList.add('rb-flash');
    if (UI.setStatus) UI.setStatus(it.name + ': ' + it.msg);
  }
  function edit(it) {
    if (it.what === 'equation') { if (UI.showEquations) UI.showEquations(it.eq || undefined); return; }
    var f = it.id != null && !isAsm() ? K.findFeature(App.model, it.id) : null;
    if (f && UI.editFeature) UI.editFeature(f);
    else goTo(it);
  }

  // ---- What's Wrong (SolidWorks: the list of rebuild errors and warnings, with the feature, its description, and
  // a way to get to it). Show errors / Show warnings filter the list; a row's Go To selects the item in the
  // FeatureManager (opening its folder) and closes the dialog; double-click or Edit opens Edit Feature.
  var show = { error: true, warning: true };
  function whatsWrong(focusId) {
    if (!UI.showModal) return;
    var body = document.createElement('div');
    body.className = 'ww';
    body.id = 'whats-wrong';
    function render() {
      var list = issues(), errs = list.filter(function (x) { return x.kind === 'error'; }), warns = list.filter(function (x) { return x.kind === 'warning'; });
      body.innerHTML = '';
      var bar = document.createElement('div');
      bar.className = 'ww-bar';
      [['error', 'Show errors', errs.length], ['warning', 'Show warnings', warns.length]].forEach(function (c) {
        var l = document.createElement('label'), cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = show[c[0]]; cb.setAttribute('data-role', 'ww-show-' + c[0]);
        cb.addEventListener('change', function () { show[c[0]] = cb.checked; render(); });
        l.appendChild(cb); l.appendChild(document.createTextNode(' ' + c[1] + ' (' + c[2] + ')'));
        bar.appendChild(l);
      });
      body.appendChild(bar);
      var shown = list.filter(function (x) { return show[x.kind]; });
      if (!list.length) {
        var ok = document.createElement('div'); ok.className = 'ww-empty';
        ok.innerHTML = '<b>✓</b> No rebuild errors or warnings: every feature rebuilt.';
        body.appendChild(ok);
        return;
      }
      var tbl = document.createElement('table');
      tbl.className = 'ww-table';
      tbl.innerHTML = '<thead><tr><th>Type</th><th>Feature</th><th>Description</th><th></th></tr></thead>';
      var tb = document.createElement('tbody');
      shown.forEach(function (it) {
        var tr = document.createElement('tr');
        tr.className = 'ww-row ' + it.kind + (it.dangling ? ' dangling' : '');
        if (it.id != null) tr.setAttribute('data-id', String(it.id));
        var o = it.id != null && it.what === 'feature' ? K.findFeature(App.model, it.id) : null;
        tr.innerHTML = '<td class="ww-type">' + ico(it.kind === 'error' ? 'error' : 'warn', 14) + '<span>' + (it.kind === 'error' ? 'Error' : it.dangling ? 'Dangling' : 'Warning') + '</span></td>' +
          '<td class="ww-feat">' + esc(it.name) + '</td><td class="ww-msg">' + esc(it.msg) + '</td><td class="ww-act"></td>';
        var act = tr.querySelector('.ww-act');
        var go = document.createElement('button');
        go.className = 'btn ww-go'; go.textContent = 'Go To'; go.title = 'Select it in the FeatureManager';
        go.addEventListener('click', function (e) { e.stopPropagation(); UI.closeModal(); goTo(it); });
        if (it.id != null || it.what === 'equation') act.appendChild(go);
        // r13/asmui13: an assembly's mate / pattern / component says how it is edited (ui-assembly.js UI.asmIssueEdit)
        var ae = isAsm() && UI.asmIssueEdit ? UI.asmIssueEdit(it) : null;
        if (ae) {
          var ea = document.createElement('button');
          ea.className = 'btn ww-edit'; ea.textContent = ae.label; if (ae.title) ea.title = ae.title;
          ea.addEventListener('click', function (e) { e.stopPropagation(); UI.closeModal(); ae.run(); });
          act.appendChild(ea);
        }
        if (o || it.what === 'equation') {
          var ed = document.createElement('button');
          ed.className = 'btn ww-edit'; ed.textContent = it.what === 'equation' ? 'Equations…' : (o.type === 'sketch' ? 'Edit Sketch' : 'Edit');
          ed.addEventListener('click', function (e) { e.stopPropagation(); UI.closeModal(); if (o && o.type === 'sketch' && UI.editSketch) UI.editSketch(o.id); else edit(it); });
          act.appendChild(ed);
        }
        tr.addEventListener('click', function () { Array.prototype.forEach.call(tb.children, function (r) { r.classList.toggle('sel', r === tr); }); });
        tr.addEventListener('dblclick', function () { if (ae) { UI.closeModal(); ae.run(); return; } if (o || it.what === 'equation') { UI.closeModal(); if (o && o.type === 'sketch' && UI.editSketch) UI.editSketch(o.id); else edit(it); } });
        if (focusId != null && it.id === focusId) tr.classList.add('sel');
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      body.appendChild(tbl);
      if (!shown.length) { var none = document.createElement('div'); none.className = 'ww-empty'; none.textContent = 'Nothing to show: tick Show errors / Show warnings.'; body.appendChild(none); }
    }
    render();
    UI.showModal({ title: 'What\'s Wrong', body: body, buttons: [{ label: 'Close', primary: true, action: UI.closeModal }] });
    var card = document.getElementById('modal-card');
    if (card) card.classList.add('wide');
    var close = document.querySelector('#modal-buttons .btn.primary');
    if (close) close.focus();   // Enter / Esc close it; the filter boxes are not focused first
    var sel = body.querySelector('tr.sel');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }
  UI.whatsWrong = whatsWrong;
  UI.rebuildIssues = issues;

  // ---- styles (kept here, next to the markup they style)
  var css = document.createElement('style');
  css.id = 'rebuild-feedback-css';
  css.textContent = [
    '#status-right .rb-chip{display:inline-flex;align-items:center;gap:5px}',
    '#status-right .rb-chip svg{flex:none;display:block}',
    '#status-right .rb-chip.err{color:var(--red);font-weight:600;cursor:pointer}',
    '#status-right .rb-chip.warn{color:var(--warn-text);font-weight:600;cursor:pointer}',
    '#status-right [data-act]:hover{text-decoration:underline}',
    '#status-right .occt{transition:color .15s}',
    '#status-right .occt.busy{color:var(--blue)}',
    '#status-right .occt.busy::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:5px;vertical-align:1px;animation:rb-pulse 1s ease-in-out infinite}',
    '#status-right .occt.warn{color:var(--warn-text);font-weight:600}',
    '#status-right .occt[data-act]{cursor:pointer}',
    '@keyframes rb-pulse{0%,100%{opacity:.35}50%{opacity:1}}',
    '.ti .rb-ico{position:relative;display:inline-flex;flex:none}',
    '.ti .rb-badge{position:absolute;right:-4px;bottom:-3px;width:10px;height:10px;line-height:0;border-radius:50%;background:var(--panel)}',
    '.ti .rb-badge svg{display:block}',
    '.ti.dangling .nm{color:var(--dangling,#8a6a00);flex-shrink:0;max-width:62%}',
    ':root[data-theme="dark"] .ti.dangling .nm{color:#d6b04a}',
    '.ti .rb-tag{flex:0 1 auto;min-width:0;overflow:hidden;margin-left:6px;padding:0 5px;border-radius:7px;font-size:9.5px;line-height:13px;color:#8a6a00;background:rgba(160,124,0,.12);border:1px solid rgba(160,124,0,.45)}',
    ':root[data-theme="dark"] .ti .rb-tag{color:#d6b04a;background:rgba(214,176,74,.12);border-color:rgba(214,176,74,.45)}',
    '.ti .rb-tag + .badge{margin-left:6px}',
    '.ti.rb-flash{animation:rb-flash 1.4s ease-out}',
    '@keyframes rb-flash{0%,35%{box-shadow:inset 0 0 0 1px var(--blue)}100%{box-shadow:inset 0 0 0 1px transparent}}',
    '.ww-bar{display:flex;gap:16px;margin:0 0 8px}',
    '.ww-bar label{display:flex;align-items:center;gap:4px}',
    '.ww-table{width:100%;border-collapse:collapse;font-size:12px}',
    '#modal-body .ww-table th{width:auto;text-align:left;font-weight:600;color:var(--muted);padding:3px 6px;border-bottom:1px solid var(--line)}',
    '#modal-body .ww-table td{padding:4px 6px;border-bottom:1px solid var(--line-2);vertical-align:top}',
    '.ww-table tr.ww-row{cursor:default}',
    '.ww-table tr.ww-row:hover{background:var(--hover)}',
    '.ww-table tr.ww-row.sel{background:var(--sel)}',
    '.ww-type{white-space:nowrap;width:1%}',
    '.ww-type svg{vertical-align:-3px;margin-right:5px}',
    '.ww-row.error .ww-type span{color:var(--red);font-weight:600}',
    '.ww-row.warning .ww-type span{color:var(--warn-text);font-weight:600}',
    '.ww-feat{white-space:nowrap;font-weight:600;width:1%}',
    '.ww-msg{width:100%}',
    '#status-right .occt.ok{font-weight:400}',
    '.ww-act{white-space:nowrap;text-align:right;width:1%}',
    '.ww-act .btn{height:22px;padding:0 8px;margin-left:4px}',
    '.ww-empty{padding:14px 4px;color:var(--muted)}',
    '.ww-empty b{color:var(--green)}'
  ].join('\n');
  document.head.appendChild(css);
})(UI);
