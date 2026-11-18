  // ---- rfPL (2026-11-18, lane asmfeel): assemblies as SolidWorks 2024. A Hinge added from Mechanical Mates leaves the
  // Mate PM open, its selections cleared, for the next mate (Esc closes it); the Hinge's Angle typed in its box places
  // the door; Tab during a SmartMates Alt-drag flips the alignment; the Mate pop-up's Distance box makes a Distance mate;
  // a pin picked with the mouse into an arc slot; Interference Detection's Make interfering parts transparent; the BOM's
  // Description cell edited by double-click and typed.
  var PL_POST = 'p.name("Post"); p.box(40, 40, 20); p.cylinder(3, 60, { at: [20, 0, 20] });', PL_DOOR = 'p.name("Door"); p.box(60, 10, 4); p.cylinder(3, 4, { at: [5, 0, 5], cut: true });';
  function plSelect(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
  function plInput(key) { return D.querySelector('#pm input[data-key="' + key + '"]'); }
  function plKey(target, key, opts) {
    var o = { key: key, bubbles: true, cancelable: true };
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    target.dispatchEvent(new W.KeyboardEvent('keydown', o));
  }
  function plType(inp, text) {   // focus, type the text, Enter (the PM's own number-box path)
    inp.focus();
    inp.value = text;
    inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    plKey(inp, 'Enter');
  }
  function plOkClick() {   // the PM's ✓ with a real click
    var ok = D.querySelector('#pm .pm-ok');
    assert(ok, 'the PM has its OK button');
    var r = ok.getBoundingClientRect(), o = { bubbles: true, cancelable: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    ok.dispatchEvent(new W.MouseEvent('mousedown', o)); ok.dispatchEvent(new W.MouseEvent('mouseup', o)); ok.dispatchEvent(new W.MouseEvent('click', o));
  }
  async function plClick(p) {
    var vp = $('viewport'), r = vp.getBoundingClientRect();
    function ev(type, target) { (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: r.left + p[0], clientY: r.top + p[1] })); }
    ev('mousedown', vp); ev('mouseup');
    await idle();
  }
  function plFrame() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
  function plDoorAngle(name) { var R = anvil.components().filter(function (c) { return c.name === name; })[0].rotation; return Math.atan2(R[2], R[0]) * 180 / Math.PI; }
  function plHingeSelections() {
    UI.mateSelect({ component: 1, cylinder: [23, 40, 20] }); UI.mateSelect({ component: 2, cylinder: [8, 2, 5] });
    UI.mateSelect({ component: 1, face: [5, 20, 5] }); UI.mateSelect({ component: 2, face: [30, 0, 8] });
  }

  step('rfPL: Hinge from Mechanical Mates: Define angle limit, Angle 20 typed (Enter) places the door; ✓ clicked adds Hinge1 and the PM stays open with its selections cleared; the next Hinge, then Esc closes it', async function () {
    await anvil.newAssembly('PlHinge');
    await anvil.insert({ script: PL_POST });
    await anvil.insert({ script: PL_DOOR }, { position: [30, 90, 20] });
    await anvil.insert({ script: PL_DOOR }, { position: [30, 90, 60] });
    await idle();
    UI.cmdMate();
    setInput(plSelect('mechType'), 'hinge');
    await idle();
    plHingeSelections();
    await idle();
    var lim = D.querySelector('#pm input[type="checkbox"][data-key="limit"]');
    assert(lim, 'Define angle limit box');
    lim.click();
    await idle();
    assert(plInput('angle') && plInput('max') && plInput('min'), 'Angle, Maximum and Minimum: ' + $('pm').textContent.slice(0, 300));
    var labels = Array.prototype.map.call(D.querySelectorAll('#pm .pm-row label'), function (l) { return l.textContent.trim(); }).filter(function (t) { return /^(Angle|Maximum Value|Minimum Value)$/.test(t); });
    assert(labels.join() === 'Angle,Maximum Value,Minimum Value', 'SolidWorks order: ' + labels.join());
    UI.mateSelect({ component: 1, face: [40, 10, 20] }); UI.mateSelect({ component: 2, face: [60, 2, 5] });
    await idle();
    var shown = +plInput('angle').value;
    assert(isFinite(shown) && shown >= 0 && shown <= 90, 'the Angle box shows the angle it stands at: ' + plInput('angle').value);
    plType(plInput('angle'), '20');
    await idle();
    plOkClick();
    await idle();
    var ms = UI.App.model.mates;
    assert(ms.length === 1 && ms[0].type === 'hinge' && ms[0].angle === 20 && ms[0].anglePlaced === true && ms[0].limit, JSON.stringify(ms[0]));
    near(plDoorAngle('Door<1>'), 20, 1e-6, 'the door at 20');
    assert(UI.hasPM() && UI.pmTitle() === 'Mate' && /Hinge/.test($('pm').textContent), 'the Hinge PM stays open: ' + (UI.hasPM() && UI.pmTitle()));
    var v = UI.pmSpec().values;
    assert(!v.a && !v.b && !v.a2 && !v.b2 && !v.a3 && !v.b3, 'selections cleared');
    assert(/Hinge1<\/b> added|Hinge1 added/.test($('pm').innerHTML), 'says it was added: ' + $('pm').textContent.slice(0, 200));
    // the next Hinge, the second door, no limit
    lim = D.querySelector('#pm input[type="checkbox"][data-key="limit"]');
    if (lim.checked) { lim.click(); await idle(); }
    UI.mateSelect({ component: 1, cylinder: [23, 40, 20] }); UI.mateSelect({ component: 3, cylinder: [8, 2, 5] });
    UI.mateSelect({ component: 1, face: [5, 20, 5] }); UI.mateSelect({ component: 3, face: [30, 0, 8] });
    await idle();
    plOkClick();
    await idle();
    assert(UI.App.model.mates.length === 2 && UI.App.model.mates[1].name === 'Hinge2' && anvil.mates().every(function (m) { return m.ok; }), JSON.stringify(anvil.mates()));
    assert(UI.hasPM(), 'still open after the second');
    plKey(D.body, 'Escape');
    await idle();
    assert(!UI.hasPM(), 'Esc closes the Mate PM');
    // edit: the Angle shows 20; a new Angle 5 places it again
    UI.editMate(UI.App.model.mates[0]); await idle();
    assert(+plInput('angle').value === 20, 'edit shows Angle 20');
    plType(plInput('angle'), '5');
    await idle();
    plOkClick();
    await idle();
    near(plDoorAngle('Door<1>'), 5, 1e-6, 'edited: the door at 5');
    assert(!UI.hasPM(), 'editing a mate closes on ✓');
    return 'Hinge1 at 20 then 5, Hinge2 added in the same PM';
  });

  step('rfPL: ✓ with nothing selected closes the Hinge PM; the Standard Mate PM stays open after ✓ too (selections cleared)', async function () {
    await anvil.newAssembly('PlOpen');
    await anvil.insert({ script: PL_POST });
    await anvil.insert({ script: PL_DOOR }, { position: [30, 90, 20] });
    await idle();
    UI.cmdMate();
    setInput(plSelect('mechType'), 'hinge');
    await idle();
    plOkClick(); await idle();
    assert(!UI.hasPM(), '✓ with nothing selected closes it');
    UI.cmdMate(); await idle();
    UI.mateSelect({ component: 1, face: [5, 20, 5] }); UI.mateSelect({ component: 2, face: [30, 0, 8] });
    await idle();
    plOkClick(); await idle();
    assert(UI.App.model.mates.length === 1 && UI.hasPM() && UI.pmTitle() === 'Mate' && !UI.pmSpec().values.a, 'Standard: added and open, cleared');
    plKey(D.body, 'Escape'); await idle();
    assert(!UI.hasPM(), 'Esc closes');
  });

  step('rfPL: with the Mate PM open a floating component drags with the mouse (SolidWorks), the PM stays, nothing is picked; a click then picks its face', async function () {
    await anvil.newAssembly('PlDrag');
    await anvil.insert({ script: 'p.name("Base"); p.box(60, 60, 10);' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Cube"); p.box(20, 20, 20);' }, { position: [70, 30, 20] });
    await idle();
    UI.setView('Front'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    UI.cmdMate(); await idle();
    var vp = UI.viewport, rc = vp.getBoundingClientRect(), s = UI.worldToScreen([80, 40, 40]), x0 = anvil.components()[1].position[0], sc = UI.cam.scale;
    function ev(type, p) { return new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: rc.left + p[0], clientY: rc.top + p[1] }); }
    vp.dispatchEvent(ev('mousedown', s));
    for (var i = 1; i <= 4; i++) { W.dispatchEvent(ev('mousemove', [s[0] + 10 * i, s[1]])); await plFrame(); }
    W.dispatchEvent(ev('mouseup', [s[0] + 40, s[1]]));
    await idle();
    near(anvil.components()[1].position[0] - x0, 40 * sc, 1e-6, 'the cube followed the drag');
    assert(UI.hasPM() && UI.pmTitle() === 'Mate' && !UI.pmSpec().values.a, 'the Mate PM is still open with nothing picked');
    await plClick(UI.worldToScreen([80 + 40 * sc, 40, 40]));
    assert(UI.pmSpec().values.a && UI.pmSpec().values.a.component === 2, 'a click picks the cube\'s face: ' + JSON.stringify(UI.pmSpec().values.a));
    UI.pmCancel(); await idle();
  });

  async function plAltDrag(from, to, steps, midway) {
    var vp = UI.viewport, rc = vp.getBoundingClientRect();
    function ev(type, p) { return new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, altKey: true, clientX: rc.left + p[0], clientY: rc.top + p[1] }); }
    vp.dispatchEvent(ev('mousedown', from));
    for (var i = 1; i <= steps; i++) {
      W.dispatchEvent(ev('mousemove', [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]));
      await plFrame();
      if (i === steps && midway) { await midway(); await plFrame(); await plFrame(); }
    }
    await plFrame();
    W.dispatchEvent(ev('mouseup', to));
    await idle();
  }
  step('rfPL: SmartMates: Tab while Alt-dragging a block onto another flips the Coincident to Aligned (the status says so; Tab does not hide the block); the drop adds it Aligned, the pop-up shows it', async function () {
    await anvil.newAssembly('PlSmart');
    await anvil.insert({ script: 'p.name("Base"); p.box(60, 60, 10);' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Cube"); p.box(20, 20, 20);' }, { position: [70, 30, 20] });
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    // the cube's top face (y 50) dragged onto the base's top (y 10)
    var a = UI.worldToScreen([80, 50, 30]), b = UI.worldToScreen([30, 10, 30]);
    var hidden0 = JSON.stringify(UI.App.hiddenBodies || {}), status = '';
    await plAltDrag(a, b, 6, async function () {
      plKey(D.body, 'Tab');
      await plFrame(); await plFrame(); await idle();
      status = $('status-msg') ? $('status-msg').textContent : '';
    });
    assert(/Aligned\)/.test(status) && /Tab flips/.test(status), 'status while dragging: ' + status);
    assert(JSON.stringify(UI.App.hiddenBodies || {}) === hidden0, 'Tab did not hide a component');
    var ms = UI.App.model.mates;
    assert(ms.length === 1 && ms[0].type === 'coincident' && ms[0].alignment === 'aligned', 'added Aligned: ' + JSON.stringify(ms));
    assert(anvil.mates()[0].ok, 'solved');
    var p = UI.asmPopup();
    assert(p && p.kind === 'mate' && p.buttons.indexOf('flip') >= 0, 'the Mate pop-up');
    plKey(D, 'Enter');
    await idle();
    assert(!UI.asmPopup(), 'Enter kept it');
    // the same drag without Tab: Anti-Aligned (the default: the faces touch)
    UI.undo(); await idle();
    await plAltDrag(a, b, 6);
    assert(UI.App.model.mates.length === 1 && (UI.App.model.mates[0].alignment || 'anti-aligned') === 'anti-aligned', 'no Tab: ' + JSON.stringify(UI.App.model.mates));
    plKey(D, 'Enter'); await idle();
    return 'Tab: aligned';
  });

  step('rfPL: the Mate PM pop-up has a value box beside Distance: 12 typed with Enter makes a Distance mate of 12 (one Enter applies, the next adds it)', async function () {
    await anvil.newAssembly('PlPopVal');
    await anvil.insert({ script: 'p.name("Base"); p.box(60, 60, 10);' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Cube"); p.box(20, 20, 20);' }, { position: [10, 30, 10] });
    await idle();
    UI.cmdMate(); await idle();
    UI.mateSelect({ component: 1, face: [30, 10, 30] }); UI.mateSelect({ component: 2, face: [10, 0, 10] });
    await idle();
    var p = UI.asmPopup(), box = p && p.el.querySelector('input[data-field="distanceValue"]');
    assert(box && p.el.querySelector('input[data-field="angleValue"]'), 'value boxes for Distance and Angle: ' + (p && p.el.innerHTML.slice(0, 200)));
    box.focus();
    box.value = '12';
    plKey(box, 'Enter');
    await idle();
    assert(UI.pmSpec().values.type === 'distance' && +UI.pmSpec().values.distance === 12, 'Distance 12: ' + JSON.stringify([UI.pmSpec().values.type, UI.pmSpec().values.distance]));
    p = UI.asmPopup();
    assert(p && p.el.querySelector('[data-act="distance"]').getAttribute('aria-pressed') === 'true', 'Distance pressed');
    plKey(p.el.querySelector('input[data-field="distanceValue"]') || D, 'Enter');
    await idle();
    var mt = UI.App.model.mates[0];
    assert(mt && mt.type === 'distance' && mt.distance === 12 && anvil.mates()[0].ok, JSON.stringify(mt) + ' ' + JSON.stringify(anvil.mates()));
    near(anvil.components()[1].position[1], 22, 1e-6, 'the cube 12 above the base');
    assert(UI.hasPM() && !UI.asmPopup(), 'the PM stays open, the pop-up goes');
    UI.pmCancel(); await idle();
    return 'Distance 12';
  });

  step('rfPL: Slot mate on an arc slot: the slot\'s end face and the pin picked with the mouse, Center in Slot puts the pin at 45° on the arc', async function () {
    await anvil.newAssembly('PlArc');
    UI.App.model.units = 'in';
    await anvil.insert({ script: 'p.units("in"); p.name("ArcPlate"); p.box(6, 6, 0.25); p.sketch("Top", 0.25).arcSlot(3, -3, 2, 0, 90, 0.5).cut("through");' });
    await anvil.insert({ script: 'p.units("in"); p.name("Pin"); p.cylinder(0.25, 1);' }, { position: [4.6, -0.2, 2.0] });
    await idle();
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
    UI.cmdMate();
    setInput(plSelect('mechType'), 'slot');
    await idle();
    setInput(plSelect('constraint'), 'center');
    await idle();
    // the slot's outer wall at 70° (radius 2.25 about (3, z 3), facing the centre and the view), then the pin's side
    var wa = 70 * Math.PI / 180;
    await plClick(UI.worldToScreen([3 + 2.25 * Math.cos(wa), 0.15, 3 - 2.25 * Math.sin(wa)]));
    var v = UI.pmSpec().values;
    assert(v.a && v.a.component === 1, 'slot face picked: ' + JSON.stringify(v.a));
    var pinPt = UI.worldToScreen([4.6 + 0.25 * Math.cos(Math.PI / 4), 0.3, 2.0 + 0.25 * Math.sin(Math.PI / 4)]);
    await plClick(pinPt);
    v = UI.pmSpec().values;
    assert(v.b && v.b.component === 2, 'pin picked: ' + JSON.stringify(v.b));
    plOkClick(); await idle();
    var ms = anvil.mates();
    assert(ms.length === 1 && ms[0].type === 'slot' && ms[0].ok, JSON.stringify(ms));
    var P = anvil.components()[1].position, a = 45 * Math.PI / 180;
    near(P[0], 3 + 2 * Math.cos(a), 1e-6, 'x on the arc at 45°'); near(P[2], 3 - 2 * Math.sin(a), 1e-6, 'z on the arc at 45°');
    plKey(D.body, 'Escape'); await idle();
    return 'pin at 45°';
  });

  step('rfPL: Interference Detection ▸ Make interfering parts transparent (off by default, before Ignore hidden bodies): on, the two overlapping blocks draw see-through and the model is unchanged; a row picked shows only its pair; closing restores them', async function () {
    await anvil.newAssembly('PlIntf');
    await anvil.insert({ script: 'p.name("A"); p.box(20, 20, 20);' }, { fixed: true });
    await anvil.insert({ script: 'p.name("B"); p.box(20, 20, 20);' }, { fixed: true, position: [10, 0, 0] });
    await anvil.insert({ script: 'p.name("C"); p.box(20, 20, 20);' }, { fixed: true, position: [100, 0, 0] });
    await anvil.insert({ script: 'p.name("D"); p.box(20, 20, 20);' }, { fixed: true, position: [105, 0, 5] });
    await idle();
    UI.cmdInterference();
    await idle();
    var all = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent === 'Entire assembly'; })[0];
    all.click();
    await idle();
    var labels = Array.prototype.map.call(D.querySelectorAll('#pm .pm-row label'), function (l) { return l.textContent.trim(); });
    var it = labels.indexOf('Make interfering parts transparent'), ih = labels.indexOf('Ignore hidden bodies/components');
    assert(it >= 0 && ih === it + 1, 'option before Ignore hidden: ' + labels.join(' | '));
    var cb = D.querySelector('#pm input[type="checkbox"][data-key="transparentIntf"]');
    assert(cb && !cb.checked, 'off by default');
    assert(UI.interferenceSession().results().pairs.length === 2, 'two interferences: ' + JSON.stringify(UI.interferenceSession().results().pairs.map(function (q) { return [q.aName, q.bName, q.volume]; })));
    cb.click();
    await idle();
    assert(UI.asmDisplayGhost().join() === '0,1,2,3' && UI.bodyGhost(0) && UI.bodyGhost(3), 'the four are see-through: ' + UI.asmDisplayGhost().join());
    assert(UI.App.model.components.every(function (c) { return !c.transparent; }), 'the model is unchanged');
    var row = D.querySelector('#pm .intf-row[data-i="1"]');
    row.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await idle();
    var one = UI.interferenceSession().results().pairs[1], want = [one.aIndex, one.bIndex].sort().join();
    assert(UI.asmDisplayGhost().sort().join() === want, 'the picked one only: ' + UI.asmDisplayGhost().join() + ' vs ' + want);
    plKey(D.body, 'Escape');
    await idle();
    assert(!UI.hasPM() && UI.asmDisplayGhost().length === 0 && !UI.bodyGhost(0), 'closed: opaque again');
    UI.cmdInterference(); await idle();
    Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent === 'Entire assembly'; })[0].click();
    await idle();
    cb = D.querySelector('#pm input[type="checkbox"][data-key="transparentIntf"]');
    assert(cb && cb.checked && UI.asmDisplayGhost().length === 4, 'remembered between openings');
    cb.click(); await idle();
    assert(UI.asmDisplayGhost().length === 0, 'off again');
    UI.pmCancel(); await idle();
  });

  step('rfPL: Bill of Materials: PART NUMBER from the part\'s Part Number property; a DESCRIPTION double-clicked and typed (Enter) goes into the part\'s property (both copies), Esc leaves it; one undo step', async function () {
    await anvil.newAssembly('PlBom');
    var br = { name: 'Bracket', units: 'mm', features: [], nextId: 1, properties: { custom: [{ name: 'Part Number', type: 'Text', value: 'BR-1001' }, { name: 'Description', type: 'Text', value: 'Bracket' }] } };
    await anvil.insert({ model: br }, { fixed: true });
    await anvil.insert({ model: br }, { position: [50, 0, 0] });
    await anvil.insert({ example: 'Hex nut' }, { position: [100, 0, 0] });
    await idle();
    UI.showBom('top');
    var rows = D.querySelectorAll('#bom-table .bom-row');
    assert(rows.length === 2 && rows[0].querySelector('.bom-pn').textContent === 'BR-1001' && rows[0].children[3].textContent === '2', 'rows: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
    var cell = rows[0].querySelector('.bom-desc');
    assert(cell.classList.contains('bom-edit') && cell.textContent === 'Bracket', 'editable cell: ' + cell.textContent);
    var undo0 = UI.App.undo.length;
    cell.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
    var inp = cell.querySelector('input');
    assert(inp && D.activeElement === inp, 'a box in the cell, focused');
    inp.value = 'BRACKET, 10 GA CRS';
    plKey(inp, 'Enter');
    await idle();
    cell = D.querySelectorAll('#bom-table .bom-row')[0].querySelector('.bom-desc');
    assert(cell.textContent === 'BRACKET, 10 GA CRS' && !cell.querySelector('input'), 'shown: ' + cell.textContent);
    assert(UI.App.model.components.slice(0, 2).every(function (c) { return W.Materials.sheetProperty(c.source.model, 'Description') === 'BRACKET, 10 GA CRS'; }), 'both copies have it');
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    // the nut (a Design Library part): kept with the assembly
    var nut = D.querySelectorAll('#bom-table .bom-row')[1].querySelector('.bom-desc');
    nut.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
    inp = nut.querySelector('input'); inp.value = 'HEX NUT M8'; plKey(inp, 'Enter');
    await idle();
    assert(anvil.bom('top')[1].description === 'HEX NUT M8' && UI.App.model.bomDescriptions, 'nut: ' + JSON.stringify(anvil.bom('top')[1]));
    // Esc leaves the text as it was
    cell = D.querySelectorAll('#bom-table .bom-row')[0].querySelector('.bom-desc');
    cell.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
    inp = cell.querySelector('input'); inp.value = 'nope'; plKey(inp, 'Escape');
    await idle();
    assert(D.querySelectorAll('#bom-table .bom-row')[0].querySelector('.bom-desc').textContent === 'BRACKET, 10 GA CRS', 'Esc kept it');
    UI.closeModal();
    await UI.undo(); await idle();
    assert(!UI.App.model.bomDescriptions && anvil.bom('top')[0].description === 'BRACKET, 10 GA CRS', 'undo takes back the nut\'s');
    return anvil.bom('top').map(function (r) { return r.partNumber + ' ' + r.description; }).join(' | ');
  });
