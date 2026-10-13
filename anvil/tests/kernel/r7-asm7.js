  // --- r7/asm7 ---
  group('r7/asm7: Change Transparency kept in the model');
  if (typeof Assembly === 'undefined') test('assembly.js loads', function () { fail('Assembly is not defined'); });
  else (function () {
    var AS = Assembly;
    test('a transparent component (insert option, a.transparent, pattern instance) survives a rebuild and the script round trip; opaque ones write nothing', function () {
      var m = AS.newAssembly();
      AS.runScript(m, 'a.name("T7").units("mm"); var b = a.insert({ script: \'p.name("B"); p.box(40, 10, 40);\' }, { fixed: true });' +
        ' var k = a.insert({ script: \'p.name("K"); p.box(5, 5, 5);\' }, { position: [0, 10, 0], transparent: true });' +
        ' var j = a.insert({ script: \'p.name("J"); p.box(5, 5, 5);\' }, { position: [20, 10, 0] });' +
        ' a.linearPattern([j], { direction: { axis: "z" }, spacing: 10, count: 3 }); a.transparent(j); a.transparent(k, false); a.transparent(k);');
      var inst = m.components.filter(function (c) { return c.pattern != null; });
      assert(inst.length === 2, inst.length + ' pattern instances');
      AS.setTransparent(m, inst[1].id, true);
      AS.rebuild(m);
      var want = m.components.map(function (c) { return !!c.transparent; }).join();
      assert(want === 'false,true,true,false,true', want);
      var src = AS.generateScript(m), m2 = AS.newAssembly();
      AS.runScript(m2, src);
      var got = m2.components.map(function (c) { return !!c.transparent; }).join();
      assert(got === want, got + ' after the round trip\n' + src);
      assert((src.match(/transparent/g) || []).length === 3, src);
    });
  })();
  // --- end r7/asm7 ---
