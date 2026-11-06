  // ---- rfKA (2026-11-06, lane asmmates3): Rack Pinion and Screw through the Mate PM (Mechanical Mates, SolidWorks 2024):
  // the rack's edge and the pinion's face picked with the mouse, the pinion pitch diameter filled from the pick, a rack
  // dragged in the viewport turning the pinion by travel / radius; Screw's Revolutions/mm | Distance/revolution and
  // Reverse; their own tree icons; edit and reopen
  var KA_RACK = 'a.name("KaRack");\n' +
    'var frame = a.insert({ script: \'p.name("Frame"); p.box(20, 20, 20);\' }, { fixed: true, position: [0, -60, 0] });\n' +
    'var pin = a.insert({ script: \'p.name("Pinion"); p.cylinder(10, 40);\' });\n' +
    'var rk = a.insert({ script: \'p.name("Rack"); p.box(200, 10, 10);\' }, { position: [-100, -10, 10] });\n' +
    'a.concentric({ axis: "y" }, { component: pin, cylinder: [10, 20, 0] });\n' +
    'a.coincident({ plane: "Top" }, { component: pin, face: [3, 0, 3] }, { alignment: "anti-aligned" });\n' +
    'a.coincident({ plane: "Top" }, { component: rk, face: [100, 10, 5] });\n' +
    'a.coincident({ plane: "Front" }, { component: rk, face: [100, 5, 0] }, { offset: 10, alignment: "anti-aligned" });\n';
  function kaSelect(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
  function kaTurn(name) { var R = anvil.components().filter(function (c) { return c.name === name; })[0].rotation; return Math.atan2(R[2], R[0]); }
  function kaPos(name) { return anvil.components().filter(function (c) { return c.name === name; })[0].position; }
  // a left-button press, moves and release in the viewport (a click when from = to), as a mouse delivers them
  async function kaMouse(from, to) {
    var vp = $('viewport'), r = vp.getBoundingClientRect();
    function ev(type, p, target) { (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: r.left + p[0], clientY: r.top + p[1] })); }
    ev('mousedown', from, vp);
    if (to[0] !== from[0] || to[1] !== from[1]) for (var k = 1; k <= 5; k++) { ev('mousemove', [from[0] + (to[0] - from[0]) * k / 5, from[1] + (to[1] - from[1]) * k / 5]); await wait(20); }
    ev('mouseup', to);
    await idle();
  }
  step('rfKA: Rack Pinion from Mechanical Mates: the rack edge and the pinion face picked with the mouse, diameter 20 from the pick; a rack drag turns the pinion by travel / radius; icon; edit; reopen', async function () {
    await anvil.run(KA_RACK);
    await idle();
    UI.setView('Isometric'); await idle();
    UI.cmdMate();
    await idle();
    assert(Array.prototype.some.call(kaSelect('mechType').options, function (o) { return o.value === 'rackpinion' && o.textContent === 'Rack Pinion'; }), 'offered among the Mechanical Mates');
    setInput(kaSelect('mechType'), 'rackpinion');
    await idle();
    var txt = $('pm').textContent;
    assert(/Rack/.test(txt) && /Pinion\/Gear/.test(txt) && /Pinion pitch diameter/.test(txt) && /Reverse/.test(txt) && !/Mate alignment/.test(txt), 'Rack Pinion PM: ' + txt.slice(0, 260));
    // the rack's top front edge (y 0, z 20) at x 60, then the pinion's cylindrical face facing the view
    var pe = UI.worldToScreen([60, 0, 20]);
    var hov = UI.pickEdge(pe[0], pe[1]);
    assert(hov && hov.kind === 'edge', 'an edge under the cursor');
    await kaMouse(pe, pe);
    var pf = UI.worldToScreen([7.0710678, 20, 7.0710678]);
    await kaMouse(pf, pf);
    var v = UI.pmSpec().values;
    assert(v.a && v.a.edge && v.a.component === 3 && v.b && v.b.cylinder && v.b.component === 2, 'picks: ' + JSON.stringify([v.a, v.b]));
    near(+v.pitchVal, 20, 1e-6, 'pinion pitch diameter from the picked face');
    await pmAccept();
    var mt = UI.App.model.mates.filter(function (x) { return x.type === 'rackpinion'; })[0];
    assert(mt && mt.name === 'RackPinion1' && Math.abs(mt.pitch - 20 * Math.PI) < 1e-9 && mt.pitchBy === 'diameter', JSON.stringify(mt));
    assert(anvil.mates().every(function (x) { return x.ok; }), JSON.stringify(anvil.mates()));
    // drag the rack along x in the Front view: the pinion turns travel / 10 radians
    UI.setView('Front'); await idle();
    var x0 = kaPos('Rack<1>')[0], t0 = kaTurn('Pinion<1>'), q = UI.worldToScreen([60, -5, 20]), sc = UI.cam.scale;
    await kaMouse(q, [q[0] + 40, q[1]]);
    var dx = kaPos('Rack<1>')[0] - x0;
    near(dx, 40 * sc, 1e-4, 'the rack followed the drag');
    var dt = kaTurn('Pinion<1>') - t0;
    near(Math.abs(dt), dx / 10, 1e-6, 'pinion turned travel / pitch radius');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree .ti.mate-row'), function (r) { return /RackPinion1/.test(r.textContent); })[0];
    assert(row && row.querySelector('.gv-mate-ico'), 'RackPinion1 has its own icon');
    UI.editMate(mt); await idle();
    assert(UI.pmSpec().title === 'RackPinion1' && Math.abs(+UI.pmSpec().values.pitchVal - 20) < 1e-6 && UI.pmSpec().values.pitchBy === 'diameter', 'edit shows its values');
    UI.pmCancel(); await idle();
    await anvil.load(JSON.parse(JSON.stringify(UI.App.model)));
    await idle();
    assert(anvil.mates().every(function (x) { return x.ok; }) && UI.App.model.mates[4].type === 'rackpinion', 'reopened: ' + JSON.stringify(anvil.mates()));
    return 'rack ' + fmt(dx) + ', pinion ' + fmt(dt * 180 / Math.PI) + '°';
  });
  step('rfKA: Screw from Mechanical Mates: Revolutions/mm and Distance/revolution show one pitch, Reverse, Mate alignment; the nut goes on the bolt; its own icon', async function () {
    await anvil.newAssembly('KaScrew');
    await anvil.insert({ script: 'p.name("Bolt"); p.cylinder(5, 60);' });
    await anvil.insert({ script: 'p.name("Nut"); p.cylinder(9, 8);' }, { position: [0.4, 20, -0.3] });
    await idle();
    UI.cmdMate();
    await idle();
    setInput(kaSelect('mechType'), 'screw');
    await idle();
    var txt = $('pm').textContent;
    assert(/Entities to Mate/.test(txt) && /Revolutions\//.test(txt) && /Distance\/revolution/.test(txt) && /Reverse/.test(txt) && /Mate alignment/.test(txt), 'Screw PM: ' + txt.slice(0, 260));
    setInput(D.querySelector('#pm input[data-key="pitchVal"]'), '1.5');
    await idle();
    setInput(kaSelect('pitchBy'), 'revolutions');
    await idle();
    near(+UI.pmSpec().values.pitchVal, 1 / 1.5, 1e-6, 'the same pitch as revolutions per mm');
    setInput(kaSelect('pitchBy'), 'distance');
    await idle();
    near(+UI.pmSpec().values.pitchVal, 1.5, 1e-6, 'and back');
    UI.mateSelect({ component: 1, cylinder: [5, 30, 0] }); UI.mateSelect({ component: 2, cylinder: [9, 4, 0] });
    await idle();
    await pmAccept();
    var mt = UI.App.model.mates[0];
    assert(mt && mt.type === 'screw' && mt.name === 'Screw1' && mt.pitch === 1.5 && !mt.pitchBy, JSON.stringify(mt));
    var p = kaPos('Nut<1>');
    near(p[0], 0, 1e-6, 'on the bolt axis'); near(p[2], 0, 1e-6, 'on the bolt axis'); near(p[1], 20, 1e-6, 'where it stood along');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree .ti.mate-row'), function (r) { return /Screw1/.test(r.textContent); })[0];
    assert(row && row.querySelector('.gv-mate-ico'), 'Screw1 has its own icon');
    var ra = Array.prototype.filter.call(D.querySelectorAll('#tree .ti.mate-row'), function (r) { return /Screw1/.test(r.textContent); })[0].querySelector('.gv-mate-ico').outerHTML;
    assert(ra.indexOf('rect') > 0, 'the screw icon');
    return 'Screw1 pitch 1.5';
  });
