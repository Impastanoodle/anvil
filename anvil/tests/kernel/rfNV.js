  // --- rfNV (2026-11-16, lane NV stepasm) --- a STEP assembly opens as an assembly (exchange.js importFile
  // { assembly: true } -> result.assembly, Exchange.newAssemblyFromImport): one component per
  // NEXT_ASSEMBLY_USAGE_OCCURRENCE, named and placed as in the file; one part document per product in
  // Assembly.Documents (a part used twice is one definition); nested sub-assemblies become sub-assembly documents; the
  // instances the structure places are counted against the flat reading. Colours stay per part / body and go back out.
  (function () {
    group('rfNV: STEP assemblies open as assemblies: components named and placed, parts shared, colours kept');
    var X = typeof Exchange !== 'undefined' ? Exchange : null, AS = typeof Assembly !== 'undefined' ? Assembly : null;
    var G16 = 0.0598;
    function rfNVneed() { if (!X || !AS || !X.newAssemblyFromImport) fail('exchange.js / assembly.js not loaded'); }
    function rfNVpart(name, color, body) { return 'p.name(' + JSON.stringify(name) + '); p.color("' + color + '"); p.units("in"); p.sheet(' + G16 + ', ' + G16 + ', 0.5); ' + body; }
    var rfNVBOX = 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange(); ' + [[2, G16, 0], [4, G16, 1.5], [2, G16, 3], [0, G16, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });'; }).join(' ');
    var rfNVLID = 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange(); p.hem(0.375, [[2, ' + G16 + ', 0]], { hemType: "open" });';
    var rfNVBRK = 'p.sketch("Top").rect(0, -1, 2, 1).end().baseFlange(); p.flange(1, [[1, ' + G16 + ', 0]]); p.sketch("Top", ' + G16 + ').circle(1, -0.6, 0.1).end().extrude(1, { cut: true, through: true, both: true });';
    // a general rotation (about (1, 2, 3) by 0.7 rad): no axis-aligned shortcut can place it
    function rfNVrot(ax, t) {
      var n = Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2]), x = ax[0] / n, y = ax[1] / n, z = ax[2] / n, C = Math.cos(t), S = Math.sin(t), V = 1 - C;
      return [C + x * x * V, x * y * V - z * S, x * z * V + y * S, y * x * V + z * S, C + y * y * V, y * z * V - x * S, z * x * V - y * S, z * y * V + x * S, C + z * z * V];
    }
    // the enclosure of lane NO (box, hemmed lid, a bracket twice), parts named 'rfNV …' so the shared document store
    // holds nothing another group uses; the second bracket turned by a general rotation
    function rfNVenclosure(prefix) {
      prefix = prefix || 'rfNV ';
      return buildAsm('a.name("rfNV Enclosure").units("in");\n' +
        'a.insert({ script: ' + JSON.stringify(rfNVpart(prefix + 'Box', '#3366cc', rfNVBOX)) + ' }, { fixed: true });\n' +
        'a.insert({ script: ' + JSON.stringify(rfNVpart(prefix + 'Lid', '#cc3333', rfNVLID)) + ' }, { position: [0, 1.2, 0] });\n' +
        'a.insert({ script: ' + JSON.stringify(rfNVpart(prefix + 'Bracket', '#33aa55', rfNVBRK)) + ' }, { position: [5, 0, 0] });\n' +
        'a.insert({ script: ' + JSON.stringify(rfNVpart(prefix + 'Bracket', '#33aa55', rfNVBRK)) + ' }, { position: [5.123456789, 0.3, 3], rotation: ' + JSON.stringify(rfNVrot([1, 2, 3], 0.7)) + ' });\n');
    }
    function rfNVclean(out) { (out && out.documents || []).forEach(function (n) { AS.Documents.remove(n); }); }
    function rfNVopen(name, text, opts) { var res = X.importFile(name, text, { units: 'auto', assembly: true }); if (!res.assembly) fail(name + ': no assembly structure (' + res.warnings.join(' | ') + ')'); return { res: res, out: X.newAssemblyFromImport(res, opts) }; }
    function rfNVcount(re, s) { return (s.match(re) || []).length; }
    function rfNVcomp(Ta, Tb) { var R = Ta.rotation, Q = Tb.rotation, C = [], i, j; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) C.push(R[i * 3] * Q[j] + R[i * 3 + 1] * Q[3 + j] + R[i * 3 + 2] * Q[6 + j]); var p = Tb.position; return { rotation: C, position: [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + Ta.position[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + Ta.position[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + Ta.position[2]] }; }
    function rfNVbox(p, T) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < p.length; i += 3) { var q = [p[i], p[i + 1], p[i + 2]]; if (T) { var R = T.rotation; q = [R[0] * q[0] + R[1] * q[1] + R[2] * q[2] + T.position[0], R[3] * q[0] + R[4] * q[1] + R[5] * q[2] + T.position[1], R[6] * q[0] + R[7] * q[1] + R[8] * q[2] + T.position[2]]; } for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } } return lo.concat(hi); }
    // every part instance of an opened assembly (sub-assemblies walked, transforms composed) against the flat reading
    // of the same file: the world box of each imported solid to the reader's rounding (1e-9 of the numbers)
    function rfNVagainstFlat(name, text, out) {
      var flat = X.importFile(name, text, { units: 'auto' }), inst = [];
      (function walk(m, T, path, d) {
        if (d > 8) fail('nesting too deep');
        m.components.forEach(function (c) {
          var sm = c.source.file != null ? AS.Documents.get(c.source.file) : c.source.model, Tc = rfNVcomp(T, c.transform);
          if (!sm) fail('component ' + c.name + ': no document ' + JSON.stringify(c.source));
          if (sm.type === 'assembly') return walk(sm, Tc, path + c.name + '/', d + 1);
          sm.features.filter(function (f) { return f.type === 'import'; }).forEach(function (f) { f.solids.forEach(function (so) { inst.push({ name: path + c.name, box: rfNVbox(X.solidMesh(so).positions, Tc) }); }); });
        });
      })(out.model, { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] }, '', 0);
      assert(inst.length === flat.solids.length, name + ': ' + inst.length + ' instances placed, the flat reading has ' + flat.solids.length);
      var used = {}, worst = 0;
      inst.forEach(function (it) {
        var bi = -1, bd = Infinity;
        flat.solids.forEach(function (s, i) { if (used[i]) return; var b = rfNVbox(s.positions), d = 0; for (var k = 0; k < 6; k++) d = Math.max(d, Math.abs(b[k] - it.box[k])); if (d < bd) { bd = d; bi = i; } });
        used[bi] = true; worst = Math.max(worst, bd);
      });
      assert(worst < 1e-8, name + ': an instance is ' + worst + ' off its flat reading');
      return worst;
    }

    test('rfNV: Anvil\'s own STEP assembly (box, hemmed lid, a bracket twice, one turned by a general rotation) opens as an assembly of 4 components on 3 part documents, each named as in the file and placed to 1e-9, volumes to 1e-12; Save / Open keeps it; mates can be added; written again it has the same 4 products, 3 solids, 4 occurrences and colours', function () {
      rfNVneed();
      var r = rfNVenclosure(), s = X.exportSTEP(r.model, r.build), o = rfNVopen('rfNV Enclosure.step', s), m = o.model = o.out.model;
      try {
        assert(o.res.units === 'in' && o.res.assembly.occurrences === 4 && !o.res.warnings.length && !o.out.warnings.length, 'units ' + o.res.units + ', occurrences ' + o.res.assembly.occurrences + ', warnings ' + o.res.warnings.concat(o.out.warnings).join(' | '));
        assert(m.type === 'assembly' && m.units === 'in' && m.name === 'rfNV Enclosure', 'model ' + m.type + ' ' + m.units + ' ' + m.name);
        assert(JSON.stringify(o.out.documents) === JSON.stringify(['rfNV Box', 'rfNV Lid', 'rfNV Bracket']), 'documents ' + JSON.stringify(o.out.documents));
        assert(JSON.stringify(m.components.map(function (c) { return c.name + '=' + c.source.file; })) === JSON.stringify(['rfNV Box<1>=rfNV Box', 'rfNV Lid<1>=rfNV Lid', 'rfNV Bracket<1>=rfNV Bracket', 'rfNV Bracket<2>=rfNV Bracket']), 'components ' + JSON.stringify(m.components.map(function (c) { return c.name + '=' + c.source.file; })));
        assert(m.components[0].fixed && !m.components[1].fixed, 'the first component is fixed, the others float');
        var b = AS.rebuild(m);
        assert(!Object.keys(b.errors || {}).length, 'rebuild errors ' + JSON.stringify(b.errors));
        var worstT = 0, worstC = 0, worstV = 0;
        m.components.forEach(function (c1, i) {
          var c0 = r.model.components[i], k;
          for (k = 0; k < 3; k++) worstT = Math.max(worstT, Math.abs(c0.transform.position[k] - c1.transform.position[k]));
          for (k = 0; k < 9; k++) worstT = Math.max(worstT, Math.abs(c0.transform.rotation[k] - c1.transform.rotation[k]));
          var m0 = K.massProps(K.meshFromBody(r.build.partBuilds[c0.id].body), 1), m1 = K.massProps(K.meshFromBody(b.partBuilds[c1.id].body), 1);
          for (k = 0; k < 3; k++) worstC = Math.max(worstC, Math.abs(m0.centroid[k] - m1.centroid[k]), Math.abs(m0.bbox.min[k] - m1.bbox.min[k]), Math.abs(m0.bbox.max[k] - m1.bbox.max[k]));
          worstV = Math.max(worstV, Math.abs(m1.volume - m0.volume) / m0.volume);
        });
        assert(worstT < 1e-9 && worstC < 1e-9 && worstV < 1e-12, 'placement ' + worstT + ', part frame (centroid / box) ' + worstC + ', volume ' + worstV);
        nearRel(AS.massProps(m, b).volume, AS.massProps(r.model, r.build).volume, 1e-12, 'assembly volume');
        // Save / Open: the document as JSON, reopened, builds the same
        var re = JSON.parse(JSON.stringify(m)), rb = AS.rebuild(re);
        nearRel(AS.massProps(re, rb).volume, AS.massProps(r.model, r.build).volume, 1e-12, 'reopened volume');
        // mates on the imported components: the brackets' holes concentric, their bottoms coincident
        AS.runScript(re, 'a.concentric({ component: "rfNV Bracket<2>", cylinder: [1.1, 0.03, 0.6] }, { component: "rfNV Bracket<1>", cylinder: [1.1, 0.03, 0.6] });\na.coincident({ component: "rfNV Bracket<2>", face: [0.5, 0, 0.3] }, { component: "rfNV Bracket<1>", face: [0.5, 0, 0.3] }, { alignment: "aligned" });\n');
        var mb = AS.rebuild(re);
        assert(re.mates.length === 2 && !Object.keys(mb.errors || {}).length && Object.keys(mb.mates).every(function (k) { return mb.mates[k].ok; }), 'mates ' + JSON.stringify(mb.mates) + ' ' + JSON.stringify(mb.errors));
        var c1 = AS.findComponent(re, 'rfNV Bracket<1>'), c2 = AS.findComponent(re, 'rfNV Bracket<2>'), h1 = rfNVcomp(c1.transform, { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [1, 0, 0.6] }).position, h2 = rfNVcomp(c2.transform, { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [1, 0, 0.6] }).position;
        nearVec(h1, h2, 1e-9, 'the mated holes meet');
        // written again: the same structure, the parts' names and colours
        var s2 = X.exportSTEP(m, b);
        assert(rfNVcount(/=PRODUCT\(/g, s2) === 4 && rfNVcount(/=MANIFOLD_SOLID_BREP\(/g, s2) === 3 && rfNVcount(/=NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g, s2) === 4, 'products ' + rfNVcount(/=PRODUCT\(/g, s2) + ', solids ' + rfNVcount(/=MANIFOLD_SOLID_BREP\(/g, s2) + ', usages ' + rfNVcount(/=NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g, s2));
        ['rfNV Box', 'rfNV Lid', 'rfNV Bracket'].forEach(function (n) { assert(s2.indexOf("PRODUCT('" + n + "'") >= 0, 'product ' + n); });
        ["COLOUR_RGB('',0.2,0.4,0.8)", "COLOUR_RGB('',0.8,0.2,0.2)", "COLOUR_RGB('',0.2,0.666666666666667,0.333333333333333)"].forEach(function (c) { assert(s2.indexOf(c) >= 0, 'colour ' + c); });
        // read back, the re-export places the same 4 instances (against its own flat reading and the first file's)
        // (its parts were written from the imported meshes, not the same text: new documents '-2', removed after)
        var o2 = rfNVopen('rfNV Enclosure.step', s2);
        try { rfNVagainstFlat('re-export', s2, o2.out); } finally { rfNVclean(o2.out); }
        return s.length + ' bytes; placement ' + worstT.toExponential(1) + ', part frames ' + worstC.toExponential(1) + ', volume ' + worstV.toExponential(1);
      } finally { rfNVclean(o.out); }
    });

    test('rfNV: the same structure from other writers and layouts: OpenCascade\'s assembly (fixture, a bar at 30 deg), SolidWorks\' (the placing relationship names the assembly first, blank NAUO names: instances named <product><n>), a sub-assembly used twice at a general rotation (a sub-assembly document), the same file opened twice (documents reused), and embedded definitions (store: false); every instance at its flat reading', function () {
      rfNVneed();
      var out = [], notes = [];
      try {
        var xhr = new XMLHttpRequest(); xhr.open('GET', 'fixtures/occ-distance-angle.step', false); xhr.send();
        if (xhr.status !== 200) fail('fixture: HTTP ' + xhr.status);
        var oc = rfNVopen('occ-distance-angle.step', xhr.responseText); out.push(oc.out);
        assert(oc.res.units === 'mm' && JSON.stringify(oc.out.model.components.map(function (c) { return c.name; })) === JSON.stringify(['Base<1>', 'Block<1>', 'Bar<1>']), 'OpenCascade: ' + JSON.stringify(oc.out.model.components.map(function (c) { return c.name; })));
        nearRel(AS.massProps(oc.out.model, AS.rebuild(oc.out.model)).volume, 69600, 1e-9, 'OpenCascade assembly volume');
        notes.push('OpenCascade ' + rfNVagainstFlat('occ', xhr.responseText, oc.out).toExponential(1));
        var r = rfNVenclosure('rfNV2 '), s = X.exportSTEP(r.model, r.build);
        var sw = s.replace(/\(REPRESENTATION_RELATIONSHIP\('',''(,#\d+),(#\d+)\)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION\((#\d+)\)/g, function (m0, a, b2, t) { return "(REPRESENTATION_RELATIONSHIP(''," + "''," + b2 + a + ')REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(' + t + ')'; })
          .replace(/ITEM_DEFINED_TRANSFORMATION\('',''(,#\d+),(#\d+)\)/g, function (m0, a, b2) { return "ITEM_DEFINED_TRANSFORMATION(''," + "''," + b2 + a + ')'; })
          .replace(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\('(NAUO\d+)','[^']*'/g, "NEXT_ASSEMBLY_USAGE_OCCURRENCE('$1',' '");
        assert(sw !== s && sw.indexOf("'rfNV2 Bracket<2>'") < 0, 'SolidWorks layout made');
        var so = rfNVopen('sw.step', sw); out.push(so.out);
        assert(JSON.stringify(so.out.model.components.map(function (c) { return c.name; })) === JSON.stringify(['rfNV2 Box<1>', 'rfNV2 Lid<1>', 'rfNV2 Bracket<1>', 'rfNV2 Bracket<2>']), 'SolidWorks names ' + JSON.stringify(so.out.model.components.map(function (c) { return c.name; })));
        notes.push('SolidWorks layout ' + rfNVagainstFlat('sw', sw, so.out).toExponential(1));
        var again = rfNVopen('sw.step', sw); out.push(again.out);
        assert(!again.out.documents.some(function (n) { return so.out.documents.indexOf(n) < 0; }), 'opened twice: documents reused, got ' + JSON.stringify(again.out.documents));
        var emb = rfNVopen('sw.step', sw, { store: false });
        assert(!emb.out.documents.length && emb.out.model.components.every(function (c) { return c.source.model; }), 'store: false embeds');
        rfNVagainstFlat('embedded', sw, emb.out);
        // a sub-assembly (box + lid turned 90 deg) used twice, the second at a general rotation
        var SUB = 'a.name("rfNV Unit").units("in");\na.insert({ script: ' + JSON.stringify(rfNVpart('rfNV3 Box', '#3366cc', 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();')) + ' }, { fixed: true });\na.insert({ script: ' + JSON.stringify(rfNVpart('rfNV3 Lid', '#cc3333', 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();')) + ' }, { position: [0, 1.2, 0], rotation: [0, -1, 0, 1, 0, 0, 0, 0, 1] });\n';
        var top = buildAsm('a.name("rfNV Rack").units("in");\na.insert({ script: ' + JSON.stringify(SUB) + ' }, { fixed: true });\na.insert({ script: ' + JSON.stringify(SUB) + ' }, { position: [0, 3, 1], rotation: ' + JSON.stringify(rfNVrot([3, -1, 2], 1.1)) + ' });\n');
        var sn = X.exportSTEP(top.model, top.build), ne = rfNVopen('rack.step', sn); out.push(ne.out);
        assert(ne.res.assembly.occurrences === 4 && JSON.stringify(ne.out.model.components.map(function (c) { return c.name + '=' + c.source.file; })) === JSON.stringify(['rfNV Unit<1>=rfNV Unit', 'rfNV Unit<2>=rfNV Unit']), 'nested ' + JSON.stringify(ne.out.model.components.map(function (c) { return c.name + '=' + c.source.file; })));
        var unit = AS.Documents.get('rfNV Unit');
        assert(unit && unit.type === 'assembly' && unit.components.length === 2, 'the sub-assembly is a document of its own');
        nearRel(AS.massProps(ne.out.model, AS.rebuild(ne.out.model)).volume, AS.massProps(top.model, top.build).volume, 1e-12, 'nested volume');
        notes.push('sub-assembly ' + rfNVagainstFlat('nested', sn, ne.out).toExponential(1));
        return notes.join(', ');
      } finally { out.forEach(rfNVclean); }
    });

    test('rfNV: no component is lost silently: an occurrence of an empty product is left out with a warning and counted, one without a placement is put at the origin with a warning, a file with MAPPED_ITEM instancing or no occurrence reads flat as before, and Insert into a part (no assembly option) keeps one body per instance', function () {
      rfNVneed();
      var r = rfNVenclosure('rfNV4 '), s = X.exportSTEP(r.model, r.build), out = [];
      try {
        // an extra product used by the assembly, holding nothing
        var ids = s.match(/#(\d+)=/g).map(function (x) { return +x.slice(1, -1); }), n = Math.max.apply(null, ids) + 1;
        var nauo = /=NEXT_ASSEMBLY_USAGE_OCCURRENCE\('[^']*','[^']*','[^']*',(#\d+),/.exec(s), ctx = /=PRODUCT\('[^']*','[^']*','',\((#\d+)\)\)/.exec(s), pdc = /=PRODUCT_DEFINITION\('design','',#\d+,(#\d+)\)/.exec(s);
        var extra = ['#' + n + "=PRODUCT('Empty','Empty','',(" + ctx[1] + '));', '#' + (n + 1) + "=PRODUCT_DEFINITION_FORMATION('',''," + '#' + n + ');', '#' + (n + 2) + "=PRODUCT_DEFINITION('design',''," + '#' + (n + 1) + ',' + pdc[1] + ');', '#' + (n + 3) + "=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO9','Empty<1>',''," + nauo[1] + ',#' + (n + 2) + ',$);'].join('\n');
        var se = s.replace('ENDSEC;\nEND-ISO', extra + '\nENDSEC;\nEND-ISO');
        var e1 = rfNVopen('empty.step', se); out.push(e1.out);
        assert(e1.res.assembly.occurrences === 5 && e1.out.components === 4 && e1.out.skipped === 1 && e1.out.model.components.length === 4, 'occurrences ' + e1.res.assembly.occurrences + ', made ' + e1.out.components + ', left out ' + e1.out.skipped);
        assert(e1.res.warnings.some(function (w) { return /1 component of the file holds no solid/.test(w); }), 'warned: ' + e1.res.warnings.join(' | '));
        // an occurrence whose placement is missing: its CONTEXT_DEPENDENT_SHAPE_REPRESENTATION removed
        var sp = s.replace(/\n#\d+=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION\([^)]*\);(?![\s\S]*CONTEXT_DEPENDENT_SHAPE_REPRESENTATION)/, '');
        assert(sp !== s, 'one placement removed');
        var p1 = X.importFile('noplace.step', sp, { units: 'auto', assembly: true });
        if (p1.assembly) { var po = X.newAssemblyFromImport(p1); out.push(po); assert(po.model.components.length === 4 && p1.warnings.some(function (w) { return /no placement/.test(w); }), 'missing placement warned: ' + p1.warnings.join(' | ')); }
        else assert(p1.warnings.some(function (w) { return /read as one part/.test(w); }), 'or read flat with a warning: ' + p1.warnings.join(' | '));
        // a plain part file: no structure, the reader as before
        var part = build('p.units("in"); p.sketch("Top").rect(0, -1, 2, 1).end().extrude(0.5);'), pr = X.importFile('part.step', X.exportSTEP(part.model, part.build), { units: 'auto', assembly: true });
        assert(!pr.assembly && pr.solids.length === 1, 'a part reads as a part');
        // without the option (Insert into a part): one body per instance, placed
        var flat = X.importFile('flat.step', s, { units: 'in' });
        assert(!flat.assembly && flat.solids.length === 4, 'flat: ' + flat.solids.length + ' solids');
        return 'empty product and missing placement warned';
      } finally { out.forEach(rfNVclean); }
    });

    test('rfNV: colours: a three-colour assembly keeps each part\'s colour (part documents, written back per solid); a part file whose solids differ in colour shows each body in its file colour (Exchange.importedBodyColors) and writes them back', function () {
      rfNVneed();
      var r = rfNVenclosure('rfNV5 '), s = X.exportSTEP(r.model, r.build), o = rfNVopen('col.step', s);
      try {
        var want = { 'rfNV5 Box': '#3366cc', 'rfNV5 Lid': '#cc3333', 'rfNV5 Bracket': '#33aa55' };
        o.out.documents.forEach(function (n) { assert(AS.Documents.get(n).color === want[n], n + ' colour ' + AS.Documents.get(n).color); });
        // the flat reading as one part: four bodies, three colours, shown per body and written per solid
        var m = X.newPartFromImport(X.importFile('col.step', s, { units: 'in' })), b = K.rebuild(m), ic = X.importedBodyColors(m, b);
        assert(ic && JSON.stringify(ic) === JSON.stringify(['#3366cc', '#cc3333', '#33aa55', '#33aa55']), 'body colours ' + JSON.stringify(ic));
        var s2 = X.exportSTEP(m, b);
        assert(rfNVcount(/COLOUR_RGB\('',0\.2,0\.4,0\.8\)/g, s2) === 1 && rfNVcount(/COLOUR_RGB\('',0\.8,0\.2,0\.2\)/g, s2) === 1 && rfNVcount(/COLOUR_RGB\('',0\.2,0\.666666666666667,0\.333333333333333\)/g, s2) === 2, 'written back per body');
        // one colour on every solid: the part's colour, no per-body list
        var one = X.newPartFromImport(X.importFile('one.step', X.exportSTEP(r.build.partBuilds[r.model.components[2].id].model || AS.partModel(r.model.components[2].source), null), { units: 'in' }));
        assert(one.color === '#33aa55' && !X.importedBodyColors(one, K.rebuild(one)), 'one colour: the part colour');
        return JSON.stringify(ic);
      } finally { rfNVclean(o.out); }
    });
  })();
