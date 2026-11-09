  // ---- rfKF (2026-11-09, lane cammate): Cam and Universal Joint through the Mate PM (Mechanical Mates, SolidWorks 2024):
  // the cam's face and the follower's vertex picked with the mouse; the Angle mate edited in its PM turns the cam and the
  // follower rides to the analytic lift; Universal Joint with Define joint point; their own tree icons; reopen
  var KF_CAM = 'a.name("KfCam");\n' +
    'var frame = a.insert({ script: \'p.name("Frame"); p.box(10, 10, 10);\' }, { fixed: true, position: [100, 0, 0] });\n' +
    'var cam = a.insert({ script: \'p.name("Eccentric"); p.sketch("Front").circle(6, 0, 20).end().extrude(10);\' });\n' +
    'var k = a.insert({ script: \'p.name("Knife"); p.box(2, 2, 40);\' }, { position: [0, 50, 0] });\n' +
    'a.concentric({ axis: "z" }, { component: cam, axis: "z" });\n' +
    'a.coincident({ plane: "Front" }, { component: cam, plane: "Front" });\n' +
    'a.angle({ plane: "Right" }, { component: cam, plane: "Right" }, 0);\n' +
    'a.coincident({ plane: "Right" }, { component: k, plane: "Right" });\n' +
    'a.coincident({ plane: "Front" }, { component: k, plane: "Front" });\n';
  function kfSelect(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
  function kfComp(name) { return anvil.components().filter(function (c) { return c.name === name; })[0]; }
  function kfRow(name) { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti.mate-row'), function (r) { return r.textContent.indexOf(name) >= 0; })[0]; }
  async function kfClick(p) {
    var vp = $('viewport'), r = vp.getBoundingClientRect();
    function ev(type, target) { (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: r.left + p[0], clientY: r.top + p[1] })); }
    ev('mousedown', vp); ev('mouseup');
    await idle();
  }
  // a vertex on the line x = 2 over the eccentric (20 radius, 6 off the axis) turned phi: y = 6 sin phi + sqrt(400 - (2 - 6 cos phi)^2)
  function kfLift(phi) { return 6 * Math.sin(phi) + Math.sqrt(400 - Math.pow(2 - 6 * Math.cos(phi), 2)); }
  step('rfKF: Cam from Mechanical Mates: the cam face and the follower vertex picked with the mouse; the Angle mate edited to 90 lifts the follower; icon; edit; reopen', async function () {
    await anvil.run(KF_CAM);
    await idle();
    UI.setView('Isometric'); await idle();
    UI.cmdMate();
    await idle();
    var mech = Array.prototype.map.call(kfSelect('mechType').options, function (o) { return o.textContent; }).join();
    assert(mech === '—,Cam,Slot,Hinge,Gear,Rack Pinion,Screw,Universal Joint', 'Mechanical Mates: ' + mech);
    setInput(kfSelect('mechType'), 'cam');
    await idle();
    var txt = $('pm').textContent;
    assert(/Entities to Mate/.test(txt) && /Cam Follower/.test(txt) && !/Mate alignment/.test(txt), 'Cam PM: ' + txt.slice(0, 260));
    // the cam's side where it faces +x (26, 0, 5), then the knife's near bottom corner (2, 50, 2)
    var pf = UI.worldToScreen([25.9, 1, 5]);
    await kfClick(pf);
    var v = UI.pmSpec().values;
    assert(v.a && v.a.component === 2 && (v.a.face || v.a.cylinder) && !v.b, 'cam path: ' + JSON.stringify(v.a));
    var pv = UI.worldToScreen([2, 50, 2]);
    await kfClick(pv);
    v = UI.pmSpec().values;
    assert(v.b && v.b.component === 3 && v.b.vertex && v.b.vertex.join() === '2,0,2', 'follower vertex: ' + JSON.stringify(v.b));
    assert(/previewed/.test($('pm').textContent), 'previewed: ' + $('pm').textContent.slice(0, 200));
    await pmAccept();
    var mt = UI.App.model.mates.filter(function (x) { return x.type === 'cam'; })[0];
    assert(mt && mt.name === 'CamMateCoincident1', JSON.stringify(mt));
    assert(anvil.mates().every(function (x) { return x.ok; }), JSON.stringify(anvil.mates()));
    near(kfComp('Knife<1>').position[1], kfLift(0), 1e-6, 'the follower came down onto the cam');
    // edit the Angle mate in its PropertyManager: 90 degrees
    UI.editMate(UI.App.model.mates[2]); await idle();
    setInput(D.querySelector('#pm input[data-key="angle"]'), '90');
    await idle();
    await pmAccept();
    var R = kfComp('Eccentric<1>').rotation, phi = Math.atan2(R[3], R[0]);
    near(Math.abs(phi), Math.PI / 2, 1e-7, 'the cam turned a quarter');
    near(kfComp('Knife<1>').position[1], kfLift(phi), 1e-6, 'the follower rides to the lift');
    var row = kfRow('CamMateCoincident1');
    assert(row && row.querySelector('.gv-mate-ico'), 'CamMateCoincident1 has its own icon');
    UI.editMate(mt); await idle();
    assert(UI.pmSpec().title === 'CamMateCoincident1' && UI.pmSpec().values.b.vertex && /Cam Follower/.test($('pm').textContent), 'edit shows the Cam PM');
    UI.pmCancel(); await idle();
    await anvil.load(JSON.parse(JSON.stringify(UI.App.model)));
    await idle();
    assert(anvil.mates().every(function (x) { return x.ok; }) && UI.App.model.mates[5].type === 'cam', 'reopened: ' + JSON.stringify(anvil.mates()));
    near(kfComp('Knife<1>').position[1], kfLift(phi), 1e-6, 'holds the lift after reopening');
    return 'lift ' + fmt(kfComp('Knife<1>').position[1]);
  });
  step('rfKF: Universal Joint from Mechanical Mates: two shafts 30 degrees apart, Define joint point, no Mate alignment; the output follows tan(b) = tan(a) cos 30; its own icon', async function () {
    var c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6), RY = [c, 0, s, 0, 1, 0, -s, 0, c];
    await anvil.run('a.name("KfJoint");\n' +
      'var y = a.insert({ script: \'p.name("Bearing"); p.cylinder(3, 4, { axis: "z", at: [0, 0, 20] });\' }, { fixed: true, rotation: ' + JSON.stringify(RY) + ' });\n' +
      'var i = a.insert({ script: \'p.name("Input"); p.cylinder(2, 20, { axis: "z", at: [0, 0, -30] });\' });\n' +
      'var o = a.insert({ script: \'p.name("Output"); p.cylinder(2, 20, { axis: "z", at: [0, 0, 26] });\' }, { rotation: ' + JSON.stringify(RY) + ', position: [3, 2, 1] });\n' +
      'a.concentric({ axis: "z" }, { component: i, cylinder: [2, 0, -20] });\n' +
      'a.coincident({ plane: "Front" }, { component: i, plane: "Front" });\n' +
      'a.angle({ plane: "Right" }, { component: i, plane: "Right" }, 0);\n' +
      'a.parallel({ component: y, cylinder: [3, 0, 22] }, { component: o, cylinder: [2, 0, 30] });\n');
    await idle();
    UI.cmdMate();
    await idle();
    setInput(kfSelect('mechType'), 'universaljoint');
    await idle();
    var txt = $('pm').textContent;
    assert(/Entities to Mate/.test(txt) && /Define joint point/.test(txt) && !/Mate alignment/.test(txt), 'Universal Joint PM: ' + txt.slice(0, 260));
    var chk = D.querySelector('#pm input[data-key="jointPoint"]');
    chk.click(); await idle();
    assert(UI.pmSpec().values.jointPoint === true, 'Define joint point on');
    UI.mateSelect({ component: 2, cylinder: [2, 0, -20] }); UI.mateSelect({ component: 3, cylinder: [2, 0, 30] }); UI.mateSelect({ component: 2, vertex: [0, 0, -10] });
    await idle();
    await pmAccept();
    var mt = UI.App.model.mates[4];
    assert(mt && mt.type === 'universaljoint' && mt.name === 'UniversalJoint1' && mt.jointPoint === true && mt.a2 && mt.a2.vertex, JSON.stringify(mt));
    assert(anvil.mates().every(function (x) { return x.ok; }), JSON.stringify(anvil.mates()));
    function axisAt(name) { var cp = kfComp(name), R = cp.rotation; return { p: cp.position, d: [R[2], R[5], R[8]], x: [R[0], R[3], R[6]] }; }
    var o = axisAt('Output<1>'), w = [-o.p[0], -o.p[1], -10 - o.p[2]], t = w[0] * o.d[0] + w[1] * o.d[1] + w[2] * o.d[2];
    near(Math.hypot(w[0] - t * o.d[0], w[1] - t * o.d[1], w[2] - t * o.d[2]), 0, 1e-6, 'the output axis passes through the joint point');
    var x0a = axisAt('Input<1>').x, x0b = o.x;
    UI.App.model.mates[2].angle = 60; UI.rebuild(); await idle();
    function sang(p, q, k) { var cx = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]; return Math.atan2(cx[0] * k[0] + cx[1] * k[1] + cx[2] * k[2], p[0] * q[0] + p[1] * q[1] + p[2] * q[2]); }
    var A = sang(x0a, axisAt('Input<1>').x, [0, 0, 1]), ob = axisAt('Output<1>'), B = sang(x0b, ob.x, ob.d);
    near(Math.abs(A), Math.PI / 3, 1e-7, 'input turned 60');
    near(B, Math.atan2(Math.sin(A) * c, Math.cos(A)), 1e-7, 'tan(b) = tan(a) cos 30');
    var row = kfRow('UniversalJoint1');
    assert(row && row.querySelector('.gv-mate-ico'), 'UniversalJoint1 has its own icon');
    return 'output ' + fmt(B * 180 / Math.PI) + '° for 60°';
  });
