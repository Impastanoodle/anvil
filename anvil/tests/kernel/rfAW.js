  // ---- rfAW (2026-10-13): Sketch Picture records (kernel-sketch.js): the script round trip; never in profiles or DXF
  (function () {
    group('rfAW: Sketch Picture');
    // a 2 x 1 pixel PNG (red, blue) as a data URL
    var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+SSJA1AAAAAASUVORK5CYII=';
    test('rfAW: a sketch picture survives the script round trip (.picture line), and the sketch\'s region, extrude and DXF ignore it', function () {
      var r = build('p.sketch("Front").rect(0, 0, 4, 2).end().extrude(1);');
      var s = r.model.features[0];
      s.pictures = [{ name: 'Sketch Picture1', file: 'print.png', src: PNG, px: [2, 1], x: -1, y: -0.5, w: 6, h: 3, ang: 15, flipH: true, tmode: 'user', alpha: 0.8, key: '#ffffff', keyTol: 0.1 }];
      var code = K.generateScript(r.model);
      assert(/\.picture\(\{"name":"Sketch Picture1"/.test(code), 'script writes .picture: ' + code.slice(0, 400));
      var m2 = K.newModel('RT'); K.runScript(m2, code);
      assert(JSON.stringify(m2.features[0].pictures) === JSON.stringify(s.pictures), 'same pictures after the round trip');
      assert(JSON.stringify(m2.features[0].entities) === JSON.stringify(s.entities), 'same entities');
      var b = K.rebuild(m2);
      nearRel(K.massProps(K.meshFromBody(b.body), m2.density).volume, 8, 1e-9, 'the extrude is the rectangle alone');
      var ents = sketchDxfEnts(K.exportDXFSketch(m2.features[0], 'mm', { version: 'R2000' }));
      assert(ents.length === 4 && ents.every(function (x) { return x.t === 'LINE'; }), 'DXF has the four lines only: ' + ents.map(function (x) { return x.t; }).join(' '));
      var bad = null; try { K.runScript(K.newModel('x'), 'p.sketch("Front").picture({ src: "http://x/y.png", w: 1, h: 1 }).end();'); } catch (er) { bad = er.message; }
      assert(bad && /data:image/.test(bad), 'a picture that is not a data URL is refused: ' + bad);
      return code.split('\n').filter(function (l) { return /\.picture/.test(l); }).length + ' picture line';
    });
  })();
  // --- end rfAW ---
