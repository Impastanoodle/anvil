  // --- rfLP (lane evalgrey, 2026-11-11): the Evaluate and Assembly buttons that were greyed now work ---
  // Each by mouse from its ribbon button: the button is enabled, its PropertyManager / pane / dialog opens, ✓ gives the
  // stated result and Esc cancels cleanly. Costing (task pane), Performance Evaluation (dialog), Compare Documents,
  // Sensor, Undercut Analysis on a part; Smart Fasteners and Hole Alignment on an assembly. Every step ends on a new part
  // with the Costing template reset.
  var RFLP_BLANK = 'p.units("in");\np.material("Plain Carbon Steel");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -4, 10, 4).end().baseFlange();\np.hole("Top", 2, -2, 0.5, { offset: 0.0598 });\n';
  var RFLP_POCKET = 'p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).extrude(20);\np.sketch("Right", 40).rect(-15, 10, 10, 10).cut(10, { reverse: true });\n';
  var RFLP_PLATE = 'p.name("Plate").units("in");\np.sketch("Top").rect(0, -2, 4, 2).extrude(0.25);\np.hole("Top", 1, -1, 0.281, { offset: 0.25 });';
  function rfLPAsm(dx) {
    var src = JSON.stringify(RFLP_PLATE);
    return 'a.name("Stack").units("in");\nvar p1 = a.insert({ script: ' + src + ' }, { fixed: true });\nvar p2 = a.insert({ script: ' + src + ' }, { position: [' + dx + ', 0.25, 0], fixed: true });\n';
  }
  function rfLPTab(name) {
    var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0];
    assert(t, 'no ' + name + ' tab'); t.click();
  }
  function rfLPButton(tab, label) {
    rfLPTab(tab);
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0];
    assert(b, 'ribbon button "' + label + '" not found on ' + tab);
    assert(!b.disabled, label + ' is greyed');
    return b;
  }
  async function rfLPClick(b) {
    var r = b.getBoundingClientRect(), o = { bubbles: true, cancelable: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    b.dispatchEvent(new W.MouseEvent('mousedown', Object.assign({ buttons: 1 }, o)));
    b.dispatchEvent(new W.MouseEvent('mouseup', o));
    b.dispatchEvent(new W.MouseEvent('click', o));
    await idle(); await wait(20);
  }
  function rfLPEsc() {
    var t = D.activeElement && D.activeElement !== D.body ? D.activeElement : D.body;
    t.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }
  async function rfLPPart(code) {
    if (UI.closeModal) UI.closeModal();
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    await anvil.newPart(); await idle();
    if (code) { await anvil.run(code); await idle(); }
  }
  async function rfLPEnd() {
    if (UI.costing) { UI.costing.reset(); UI.costing.close(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (UI.closeModal) UI.closeModal();
    await anvil.newPart(); await idle();
    UI.setRibbonTab('Features');
  }
  function rfLPMoney(x) { return '$' + (Math.round(x * 100) / 100).toFixed(2); }

  step('rfLP: (a) Costing by mouse on a 16 ga blank: the task pane opens with the sheet-metal quote, a lot size typed re-costs, Esc closes it', async function () {
    need(UI, 'cmdCosting');
    await rfLPPart(RFLP_BLANK);
    try {
      UI.costing.reset();
      await rfLPClick(rfLPButton('Evaluate', 'Costing'));
      assert(!$('tp-panel').hidden && UI.costing.open(), 'the Costing pane is not open');
      var q = anvil.costing();
      assert(q.kind === 'sheet' && q.inputs.pierces === 2, JSON.stringify(q.inputs));
      var per = D.querySelector('#tp-body [data-role=per-part]');
      assert(per && per.textContent === rfLPMoney(q.perPart), 'per part ' + (per && per.textContent) + ' vs ' + rfLPMoney(q.perPart));
      assert(/Sheet Metal/.test(D.querySelector('#tp-body [data-role=cost-method]').textContent), 'method');
      var lot = D.querySelector('#tp-body input[data-key=lotSize]');
      setInput(lot, '10'); await wait(10);
      var q10 = anvil.costing();
      assert(q10.lotSize === 10 && D.querySelector('#tp-body [data-role=lot]').textContent === rfLPMoney(q10.lot), 'lot of 10: ' + D.querySelector('#tp-body [data-role=lot]').textContent);
      assert(q10.perPart > q.perPart, 'a smaller lot costs more per part');
      rfLPEsc(); await wait(10);
      assert($('tp-panel').hidden && !UI.costing.open(), 'Esc did not close the pane');
      return 'per part ' + rfLPMoney(q.perPart) + ', lot of 10 ' + rfLPMoney(q10.lot);
    } finally { await rfLPEnd(); }
  });

  step('rfLP: (b) Performance Evaluation by mouse: one row per feature, slowest first, the triangle count; Close', async function () {
    need(UI, 'cmdPerformance');
    await rfLPPart(RFLP_POCKET);
    try {
      await rfLPClick(rfLPButton('Evaluate', 'Performance Evaluation'));
      assert(modalOpen(), 'no dialog');
      var rows = D.querySelectorAll('#modal-body .perf-table tr[data-feature]'), r = UI.evaluate.performance();
      assert(rows.length === UI.App.model.features.length && r.order.length === rows.length, rows.length + ' rows');
      assert(+D.querySelector('#modal-body [data-role=perf-tris]').textContent === UI.App.mesh.triCount, 'triangles');
      clickModalButton('Close');
      assert(!modalOpen(), 'still open');
      return rows.length + ' features, ' + r.total.toFixed(1) + ' ms';
    } finally { await rfLPEnd(); }
  });

  step('rfLP: (c) Compare Documents by mouse against the part\'s last saved state: the deeper extrude and the added hole listed, faces shown in two colours; Esc clears them', async function () {
    need(UI, 'cmdCompare');
    await rfLPPart('p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).extrude(20);\n');
    var name = 'rfLP compare test', files = {};
    try { files = JSON.parse(localStorage.getItem('anvil.files') || '{}'); } catch (e) { files = {}; }
    var before = JSON.stringify(files);
    try {
      files[name] = { model: JSON.parse(JSON.stringify(UI.App.model)), features: UI.App.model.features.length, savedAt: Date.now() };
      localStorage.setItem('anvil.files', JSON.stringify(files));
      UI.App.fileName = name;
      UI.App.model.features[1].depth = 25;
      await anvil.run(anvil.script() + '\np.hole("Front", 20, 15, 10, { offset: 25 });'); await idle();
      UI.App.fileName = name;
      await rfLPClick(rfLPButton('Evaluate', 'Compare Documents'));
      assert(UI.hasPM() && UI.pmTitle() === 'Compare Documents', 'no Compare PM');
      var r = UI.evaluate.compare();
      assert(r && r.features.added.length === 2 && r.features.changed.length === 1, JSON.stringify(r && r.features));
      assert(D.querySelector('#pm [data-key=depth]'), 'the depth change is not listed');
      assert(+D.querySelector('#pm [data-role=cmp-only-a]').textContent === 6, 'faces only in the saved part');
      assert(UI.groups.preview.children.length === 2, 'two colours drawn: ' + UI.groups.preview.children.length);
      rfLPEsc(); await idle();
      assert(!UI.hasPM() && !UI.groups.preview.children.length, 'Esc left the PM or its faces');
      return r.features.added.length + ' added, ' + r.geometry.onlyB.length + ' faces only here';
    } finally { localStorage.setItem('anvil.files', before); UI.App.fileName = null; await rfLPEnd(); }
  });

  step('rfLP: (d) Sensor by mouse: a mass sensor with an alert above 0 lands in the Sensors folder with the alert icon and a status message; Esc on a second one adds nothing', async function () {
    need(UI, 'cmdSensor');
    await rfLPPart('p.units("in");\np.material("Plain Carbon Steel");\np.sketch("Front").rect(0, 0, 4, 2).extrude(1);\n');
    try {
      await rfLPClick(rfLPButton('Evaluate', 'Sensor'));
      assert(UI.hasPM() && UI.pmTitle() === 'Sensor', 'no Sensor PM');
      assert(pmField('Type').value === 'mass', 'type ' + pmField('Type').value);
      setInput(pmField('Value'), '0.5'); await idle();
      assert(/lb/.test(D.querySelector('#pm [data-role=sensor-value]').textContent), 'the value is not shown in lb');
      await pmAccept(); await idle();
      var m = UI.App.model;
      assert(m.sensors && m.sensors.length === 1 && m.sensors[0].limit.op === 'gt' && m.sensors[0].limit.a === 0.5, JSON.stringify(m.sensors));
      var row = D.querySelector('#tree .sensor-row');
      assert(row && row.classList.contains('sensor-alert') && /Mass1 = [\d.]+ lb/.test(row.textContent), 'tree row: ' + (row && row.outerHTML.slice(0, 200)));
      assert(UI.sensors.results()[0].alert, 'not alerting');
      assert(/p\.sensor\(/.test(anvil.script()), 'the script has no p.sensor');
      // a second sensor, cancelled
      await rfLPClick(rfLPButton('Evaluate', 'Sensor'));
      rfLPEsc(); await idle();
      assert(!UI.hasPM() && UI.App.model.sensors.length === 1, 'Esc added a sensor');
      // undo removes it
      await (UI.undoCommand || UI.undo)(); await idle();
      assert(!(UI.App.model.sensors && UI.App.model.sensors.length) && !D.querySelector('#tree .sensor-row'), 'undo left the sensor');
      return 'mass ' + UI.sensors.results().length + ' after undo';
    } finally { await rfLPEnd(); }
  });

  step('rfLP: (e) Undercut Analysis by mouse on a block with a side pocket (pull +Y): 1 / 1 / 5 occluded / 0 / 4 no draft, coloured; Esc clears the colours', async function () {
    need(UI, 'cmdUndercut');
    await rfLPPart(RFLP_POCKET);
    try {
      UI.App.sel = null;
      await rfLPClick(rfLPButton('Evaluate', 'Undercut Analysis'));
      assert(UI.hasPM() && UI.pmTitle() === 'Undercut Analysis', 'no PM');
      var c = UI.evaluate.undercut().counts;
      assert(c.dir1 === 1 && c.dir2 === 1 && c.occluded === 5 && c.straddle === 0 && c.nodraft === 4, JSON.stringify(c));
      assert(UI.evaluate.display() === 'undercut' && UI.evaluate.analysisGroup().children.length === 1, 'not drawn');
      assert(D.querySelector('#pm .ev-leg[data-cls=occluded] b').textContent === '5', 'legend');
      setInput(pmField('Direction of Pull'), '+x'); await idle();
      assert(UI.evaluate.undercut().counts.occluded === 0, 'along +X the pocket opens');
      rfLPEsc(); await idle();
      assert(!UI.hasPM() && UI.evaluate.display() === null, 'Esc left the colours');
      return JSON.stringify(c);
    } finally { await rfLPEnd(); }
  });

  step('rfLP: (f) Assembly tab by mouse: Smart Fasteners puts a 1/4-20 x 1 bolt, two washers and a nut on the plate stack (✓, one undo step); Esc adds nothing; Hole Alignment finds the 0.02 in offset', async function () {
    need(UI, 'cmdSmartFasteners'); need(UI, 'cmdHoleAlignment');
    await anvil.run(rfLPAsm(0)); await idle();
    try {
      assert(UI.isAssembly(), 'not an assembly');
      var n0 = UI.App.model.components.length;
      await rfLPClick(rfLPButton('Assembly', 'Smart Fasteners'));
      assert(UI.hasPM() && UI.pmTitle() === 'Smart Fasteners', 'no PM');
      rfLPEsc(); await idle();
      assert(!UI.hasPM() && UI.App.model.components.length === n0 && !UI.groups.preview.children.length, 'Esc changed the assembly');
      await rfLPClick(rfLPButton('Assembly', 'Smart Fasteners'));
      var plan = UI.smartFastenersPlan();
      assert(plan && plan.length === 1 && plan[0].bolt && plan[0].bolt.name === 'Hex Bolt 1/4-20 x 1', JSON.stringify(plan && plan.map(function (r) { return r.error || r.bolt.name; })));
      assert(D.querySelector('#pm .sf-list li[data-bolt]'), 'not listed');
      await pmAccept(); await idle();
      var names = UI.App.model.components.map(function (c) { return c.name; }).join(', ');
      assert(UI.App.model.components.length === n0 + 4 && /Hex Bolt 1\/4-20 x 1/.test(names) && /Hex Nut/.test(names), names);
      assert(!Object.keys(UI.App.build.errors || {}).length, JSON.stringify(UI.App.build.errors));
      await (UI.undoCommand || UI.undo)(); await idle();
      assert(UI.App.model.components.length === n0, 'one undo did not take the fasteners out: ' + UI.App.model.components.length);
      // Hole Alignment on a stack 0.02 in off
      await anvil.run(rfLPAsm(0.02)); await idle();
      await rfLPClick(rfLPButton('Evaluate', 'Hole Alignment'));
      assert(UI.hasPM() && UI.pmTitle() === 'Hole Alignment', 'no Hole Alignment PM');
      var ha = UI.evaluate.holeAlignment();
      assert(ha && ha.pairs.length === 1 && Math.abs(ha.pairs[0].offset - 0.02) < 1e-9, JSON.stringify(ha && ha.pairs.map(function (p) { return p.offset; })));
      assert(D.querySelector('#pm .ha-list li'), 'not listed');
      await pmAccept(); await idle();
      assert(!UI.hasPM(), 'still open');
      return names;
    } finally { await rfLPEnd(); }
  });
