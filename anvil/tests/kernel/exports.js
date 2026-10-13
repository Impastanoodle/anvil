  // ------------------------------------------------------------------ exports
  group('exports');
  test('STL has one facet per triangle', function () {
    var r = build('p.box(10, 10, 10);');
    var stl = K.exportSTL(r.mesh, 'Box');
    assert(stl.indexOf('solid Box') === 0, 'header');
    assert(/endsolid Box$/.test(stl), 'footer');
    var facets = stl.match(/facet normal/g).length;
    assert(facets === r.mesh.triCount, 'facets ' + facets + ' != ' + r.mesh.triCount);
    assert(stl.match(/vertex/g).length === facets * 3, 'vertex count');
  });
  test('sketch DXF keeps circles and arcs as true entities', function () {
    var s = { entities: [{ t: 'circle', cx: 1, cy: 2, r: 3 }, { t: 'arc', cx: 0, cy: 0, r: 5, a0: 0, a1: 90 }, { t: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }, { t: 'rect', x: 0, y: 0, w: 2, h: 2 }] };
    var dxf = K.exportDXFSketch(s, 'mm');
    assert(dxf.indexOf('\nCIRCLE\n') > 0, 'CIRCLE');
    assert(dxf.indexOf('\nARC\n') > 0, 'ARC');
    // the line plus the rectangle's four edges as LINEs (sketch export writes exact pieces, no polylines)
    assert((dxf.match(/\n0\nLINE\n/g) || []).length === 5, 'LINE x5');
    assert(dxf.indexOf('\nPOLYLINE\n') < 0, 'no POLYLINE');
    assert(/\$INSUNITS\n70\n4\n/.test(dxf), 'mm units flag');
    assert(/\nEOF$/.test(dxf), 'EOF');
    assert(dxf.indexOf('OUTLINE') > 0 && dxf.indexOf('HOLES') > 0, 'layer table');
  });
