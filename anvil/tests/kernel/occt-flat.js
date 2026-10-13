  // --- occt-flat: the flat pattern of a mesh whose faces stay apart (OpenCascade's solid: every B-rep face is its own
  // mesh face, polygon.face). A bend relief leaves a sliver of the bend as a separate face on the plane of the wall
  // beside it; the unfold took the sliver for the wall (the channel's walls went missing: 7.02 × 4.04, and 3 bends of
  // 4 with the hem), and an obround relief's slivers became stray loops. flatPattern works on whole planes of a body,
  // so a mesh with every polygon tagged as its own face must unfold exactly like the untagged one ---
  (function () {
    group('occt-flat: flat pattern of a face-tagged mesh (OpenCascade) equals the plain mesh\'s');
    var T = 0.0598;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function channel(relief) { return HEAD + 'p.flange(1.5, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside" });\np.flange(1, [[0, ' + T + ', 2]], { position: "inside", relief: "' + relief + '" });'; }
    var CASES = {
      'rect relief': channel('rect'), 'obround relief': channel('obround'),
      'hand-test channel (hem, relief, holes, slot)': HEAD + 'p.flange(1.5, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside" });\np.hem(0.375, [[3, 1.6196, 4]], { gap: 0.0299 });\n' +
        'p.flange(1.0, [[0, ' + T + ', 2]], { position: "inside", relief: "rect" });\np.sketch("Top", ' + T + ').slot(2.25, -2, 3.75, -2, 0.375).circle(1, -1, 0.133).circle(5, -1, 0.133).cut("through", { reverse: true });',
      'sketched bend, two lines': HEAD + 'p.sketch("Top", ' + T + ').line(1.5, 0, 1.5, -4).line(4.5, -1, 4.5, -3).sketchedBend(90);'
    };
    function dxfCounts(flat) {
      var d = K.exportDXFFlat(flat, 'in', { version: 'R2000', style: 'entities' }), out = {}, re = /\n0\n([A-Z]+)\n(?:(?!\n0\n)[\s\S])*?\n8\n([A-Z]+)\n/g, mm;
      d = d.split('ENTITIES')[1] || '';
      while ((mm = re.exec(d))) out[mm[1] + '/' + mm[2]] = (out[mm[1] + '/' + mm[2]] || 0) + 1;
      return JSON.stringify(out);
    }
    test('occt-flat: every polygon its own face (as an OpenCascade mesh): same blank, bends, loops and DXF entities for reliefs, the hand-test channel and a sketched bend', function () {
      var det = [];
      Object.keys(CASES).forEach(function (name) {
        var r = build(CASES[name]);
        noErrors(r);
        var plain = K.flatPattern(r.model, r.build, r.mesh);
        r.body.polygons.forEach(function (p, i) { p.face = i; });
        var tm = K.meshFromBody(r.body);
        assert(tm.faces.length > r.mesh.faces.length, name + ': tagged mesh keeps faces apart');
        var tagged = K.flatPattern(r.model, r.build, tm);
        near(tagged.size[0], plain.size[0], 1e-9, name + ': flat width'); near(tagged.size[1], plain.size[1], 1e-9, name + ': flat height');
        assert(tagged.bends.length === plain.bends.length, name + ': bends ' + tagged.bends.length + ' vs ' + plain.bends.length);
        assert(tagged.loops.length === plain.loops.length, name + ': loops ' + tagged.loops.length + ' vs ' + plain.loops.length);
        assert(dxfCounts(tagged) === dxfCounts(plain), name + ': DXF ' + dxfCounts(tagged) + ' vs ' + dxfCounts(plain));
        det.push(fmt(tagged.size[0]) + ' × ' + fmt(tagged.size[1]) + ' / ' + tagged.bends.length);
      });
      return det.join(', ');
    });
  })();
  // --- end occt-flat ---

