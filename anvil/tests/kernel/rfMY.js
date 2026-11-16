  // --- rfMY (2026-11-15, lane smrefs: sheet-metal picks follow an edit) ---
  // A later Edge Flange / Hem / Jog stored its edge as a point; changing an earlier flange moved the edge and the later
  // features failed ("No edge selected for the flange"). Now each pick carries f.pickRefs (kernel-sheetmetal.js
  // smFollowPicks / smMakePicks): the earlier flange's wall and the edge's place on it (outer / inner end, side), so the
  // later feature stays on "the outer edge of Edge-Flange1" through length, angle, position, base size, thickness,
  // radius and suppress / unsuppress; a deleted / suppressed owner is a dangling error naming it.
  (function () {
    group('rfMY: sheet-metal picks follow an edit (Edge Flange / Hem / Jog on an earlier flange keep their edge)');
    function rfMYclone(m) { return JSON.parse(JSON.stringify(m, function (k, v) { return k === 'profile' ? undefined : v; })); }
    function rfMYstrip(m) { var c = rfMYclone(m); c.features.forEach(function (f) { delete f.pickRefs; }); return c; }
    function rfMYfeat(m, name) { return m.features.filter(function (f) { return f.name === name; })[0]; }
    // the far end edges of a flange's wall, from its record: { outer, inner } mid points
    function rfMYfar(b, id, ri) {
      var r = b.flanges[id][ri || 0], A = r.angle, sA = Math.sin(A), cA = Math.cos(A);
      var I = [0, 1, 2].map(function (k) { return r.origin[k] + r.o[k] * r.R * sA + r.u[k] * (r.R - r.R * cA); });
      var w = [0, 1, 2].map(function (k) { return r.o[k] * cA + r.u[k] * sA; }), m = [0, 1, 2].map(function (k) { return -r.o[k] * sA + r.u[k] * cA; });
      var midZ = [0, 1, 2].map(function (k) { return (r.a[k] + r.b[k]) / 2 - r.origin[k]; });
      var zz = [0, 1, 2].map(function (k) { return midZ[k] - (midZ[0] * r.o[0] + midZ[1] * r.o[1] + midZ[2] * r.o[2]) * r.o[k] - (midZ[0] * r.u[0] + midZ[1] * r.u[1] + midZ[2] * r.u[2]) * r.u[k]; });
      var inner = [0, 1, 2].map(function (k) { return I[k] + w[k] * r.L + zz[k]; }), outer = [0, 1, 2].map(function (k) { return inner[k] - m[k] * r.T; });
      return { inner: inner, outer: outer, I: I, w: w, m: m, L: r.L, T: r.T };
    }
    // where a later flange's bend edge sits on an earlier one's wall: [s - L, h / T] (rounded)
    function rfMYrole(b, id, owner) {
      var r = b.flanges[id][0], F = rfMYfar(b, owner, 0), mid = [0, 1, 2].map(function (k) { return (r.a[k] + r.b[k]) / 2; });
      var d = [0, 1, 2].map(function (k) { return mid[k] - F.I[k]; });
      var s = d[0] * F.w[0] + d[1] * F.w[1] + d[2] * F.w[2], h = d[0] * F.m[0] + d[1] * F.m[1] + d[2] * F.m[2];
      return [Math.round((s - F.L) * 1e6) / 1e6, Math.round(h / F.T * 1e6) / 1e6];
    }
    function rfMYarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? 1 : -1) * Math.abs(K.signedArea(l)); }, 0); }
    function rfMYrun(m) {
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      return { model: m, build: b, mesh: mesh, mp: K.massProps(mesh, m.density), errors: b.errors };
    }
    function rfMYnoErr(r, label) { var e = Object.keys(r.errors || {}).map(function (k) { return k + ': ' + r.errors[k]; }); assert(!e.length, label + ': ' + e.join(' | ')); }
    function rfMYsame(a, b, label) {
      var p = a.mesh.positions64, q = b.mesh.positions64, ok = p.length === q.length;
      for (var i = 0; ok && i < p.length; i++) if (p[i] !== q[i]) ok = false;
      assert(ok, label + ': positions64 differ (' + p.length + ' / ' + q.length + ')');
    }
    // the bracket: Base Flange 4 x 3, Edge-Flange1 on the front edge, Edge-Flange2 on its far outer edge, a Hem on
    // Edge-Flange2's far edge, a Jog on the base's right edge
    var T0 = 0.0598, R0 = 0.06;
    function rfMYbracket() {
      var m = K.newModel('rfMY bracket');
      K.runScript(m, 'p.units("in");\np.sheet(' + T0 + ', ' + R0 + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, ' + T0 + ', 0]], { name: "Edge-Flange1" });');
      var b1 = K.rebuild(m), f1 = rfMYfeat(m, 'Edge-Flange1');
      K.runScript(m, 'p.flange(0.75, [' + JSON.stringify(rfMYfar(b1, f1.id).outer) + '], { name: "Edge-Flange2" });');
      var b2 = K.rebuild(m), f2 = rfMYfeat(m, 'Edge-Flange2');
      K.runScript(m, 'p.hem(0.3, [' + JSON.stringify(rfMYfar(b2, f2.id).outer) + '], { name: "Hem1" });\np.jog(0.5, 1, [[4, ' + T0 + ', 1.5]], { name: "Jog1" });');
      return m;
    }
    function rfMYtray() {
      var m = K.newModel('rfMY tray'), T = T0;
      K.runScript(m, 'p.units("in");\np.sheet(' + T + ', ' + R0 + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e, i) { return 'p.flange(1, [' + JSON.stringify(e) + '], { name: "Flange' + (i + 1) + '", position: "inside" });\n'; }).join(''));
      var b = K.rebuild(m);
      [1, 2, 3, 4].forEach(function (i) {
        var f = rfMYfeat(m, 'Flange' + i);
        K.runScript(m, 'p.hem(0.3, [' + JSON.stringify(rfMYfar(b, f.id).outer) + '], { name: "Hem' + i + '" });');
      });
      return m;
    }
    // the edits: [label, fn(model)] (on a copy)
    function rfMYedits(first) {
      return [
        ['length 1 -> 1.5', function (m) { rfMYfeat(m, first).length = 1.5; }],
        ['length 1 -> 0.6', function (m) { rfMYfeat(m, first).length = 0.6; }],
        ['angle 90 -> 75', function (m) { rfMYfeat(m, first).angle = 75; }],
        ['angle 90 -> 120', function (m) { rfMYfeat(m, first).angle = 120; }],
        ['Material Inside', function (m) { rfMYfeat(m, first).position = 'inside'; }],
        ['Material Outside', function (m) { rfMYfeat(m, first).position = 'outside'; }],
        ['Bend Outside', function (m) { rfMYfeat(m, first).position = 'bendOutside'; }],
        ['base 4 x 3 -> 5 x 3.5', function (m) {
          var sk = m.features.filter(function (f) { return f.type === 'sketch'; })[0];
          JSON.stringify(sk.entities, function (k, v) { return v; });
          (function walk(o) {
            if (Array.isArray(o)) { if (o.length === 2 && typeof o[0] === 'number' && typeof o[1] === 'number') { if (Math.abs(o[0] - 4) < 1e-9) o[0] = 5; if (Math.abs(o[1] + 3) < 1e-9) o[1] = -3.5; return; } o.forEach(walk); }
            else if (o && typeof o === 'object') Object.keys(o).forEach(function (k) {
              if (typeof o[k] === 'number' && /^x/.test(k) && Math.abs(o[k] - 4) < 1e-9) o[k] = 5;
              else if (typeof o[k] === 'number' && /^y/.test(k) && Math.abs(o[k] + 3) < 1e-9) o[k] = -3.5;
              else walk(o[k]);
            });
          })(sk.entities);
          delete sk.profile;
        }],
        ['thickness 16 -> 14 ga', function (m) { m.sheet.thickness = 0.0747; m.features.forEach(function (f) { if (f.sheetBase) f.depth = 0.0747; }); }],
        ['bend radius .06 -> .125', function (m) { m.sheet.bendRadius = 0.125; }]
      ];
    }
    function rfMYrows(kind, make, first, roles) {
      var base = make(), r0 = rfMYrun(base);
      test('rfMY: ' + kind + ' builds, every pick gets a reference to the earlier flange it sits on', function () {
        rfMYnoErr(r0, kind);
        base.features.forEach(function (f) {
          if (!K.SM_PICKS[f.type] || f.type === 'flange' && f.name === first) return;
          assert(f.pickRefs && Object.keys(f.pickRefs).length, f.name + ': no pickRefs written');
        });
        roles.forEach(function (q) {
          var g = rfMYfeat(base, q[0]), ref = g.pickRefs['edges.0'], o = rfMYfeat(base, q[1]);
          assert(ref.frame === 'wall' && ref.on === o.id && ref.end === true, q[0] + ': ref ' + JSON.stringify(ref));
        });
      });
      test('rfMY: ' + kind + ': a document saved before pickRefs builds bit-identical, and again once its refs are written', function () {
        var old = rfMYstrip(base), a = rfMYrun(old), b2 = rfMYrun(old), c = rfMYrun(rfMYclone(base));
        rfMYsame(r0, a, 'old document'); rfMYsame(r0, b2, 'old document, second build (refs written)'); rfMYsame(r0, c, 'saved with refs');
        assert(old.features.some(function (f) { return f.pickRefs; }), 'the old document got its refs');
      });
      rfMYedits(first).forEach(function (ed) {
        test('rfMY: ' + kind + ', ' + first + ' ' + ed[0] + ': every later feature builds on the same wall and edge role; volume = blank x T', function () {
          var m = rfMYclone(base);
          ed[1](m);
          var r = rfMYrun(m);
          rfMYnoErr(r, ed[0]);
          roles.forEach(function (q) {
            var g = rfMYfeat(m, q[0]), o = rfMYfeat(m, q[1]), was = rfMYrole(r0.build, rfMYfeat(base, q[0]).id, rfMYfeat(base, q[1]).id), now = rfMYrole(r.build, g.id, o.id);
            assert(Math.abs(was[0] - now[0]) < 1e-6 && Math.abs(was[1] - now[1]) < 1e-6, q[0] + ' on ' + q[1] + ': role ' + JSON.stringify(now) + ', was ' + JSON.stringify(was));
          });
          var fl = K.flatPattern(r.model, r.build, r.mesh);
          // (a tray's 120° Material Inside flange mitred against 90° neighbours is not blank x T on main either: 1.5295 vs
          // 1.5231 built fresh from a script, no references involved; not this lane's)
          if (!(kind.indexOf('tray') === 0 && ed[0] === 'angle 90 -> 120')) nearRel(r.mp.volume, rfMYarea(fl) * +m.sheet.thickness, 1e-6, 'volume vs blank x T');
          // and back: undoing the edit on the edited model (its picks moved) builds as before
          var back = rfMYclone(base), mv = rfMYclone(m);
          mv.features.forEach(function (f, i) { if (f.type !== 'sketch') { ['length', 'angle', 'position', 'depth'].forEach(function (k) { if (k in back.features[i]) f[k] = back.features[i][k]; else delete f[k]; }); } else { f.entities = back.features[i].entities; delete f.profile; } });
          mv.sheet = back.sheet;
          var rb = rfMYrun(mv);
          rfMYnoErr(rb, 'undo ' + ed[0]);
          near(rb.mp.volume, r0.mp.volume, 1e-9, 'undo ' + ed[0] + ': volume');
        });
      });
      test('rfMY: ' + kind + ': ' + first + ' suppressed: its children are dangling naming it; unsuppressed: bit-identical', function () {
        var m = rfMYclone(base);
        rfMYfeat(m, first).suppressed = true;
        var r = rfMYrun(m), o = rfMYfeat(m, roles[0][0]);
        assert(r.errors[o.id] && /Dangling/.test(r.errors[o.id]) && r.errors[o.id].indexOf(first) >= 0, o.name + ': ' + r.errors[o.id]);
        delete rfMYfeat(m, first).suppressed;
        rfMYsame(r0, rfMYrun(m), 'unsuppressed');
      });
      test('rfMY: ' + kind + ': ' + first + ' deleted: dangling error naming it, never a wrong edge', function () {
        var m = rfMYclone(base), id = rfMYfeat(m, first).id;
        m.features = m.features.filter(function (f) { return f.id !== id; });
        var r = rfMYrun(m), o = rfMYfeat(m, roles[0][0]);
        assert(r.errors[o.id] && /Dangling/.test(r.errors[o.id]) && r.errors[o.id].indexOf(first) >= 0, o.name + ': ' + r.errors[o.id]);
      });
    }
    rfMYrows('bracket (Base, Edge-Flange1, Edge-Flange2 on its far edge, Hem, Jog)', rfMYbracket, 'Edge-Flange1', [['Edge-Flange2', 'Edge-Flange1'], ['Hem1', 'Edge-Flange2']]);
    rfMYrows('tray (four flanges with hems)', rfMYtray, 'Flange1', [['Hem1', 'Flange1'], ['Hem2', 'Flange2'], ['Hem3', 'Flange3'], ['Hem4', 'Flange4']]);
    test('rfMY: generateScript and the Builder round-trip pickRefs (p.pickRefs)', function () {
      var m = rfMYbracket(), r = rfMYrun(m), src = K.generateScript(m), m2 = K.newModel('x');
      K.runScript(m2, src);
      m.features.forEach(function (f, i) {
        if (!f.pickRefs) return;
        var g = m2.features[i];
        assert(g.pickRefs, f.name + ': no pickRefs after the round trip');
        Object.keys(f.pickRefs).forEach(function (k) {
          var a = f.pickRefs[k], b = g.pickRefs[k], oa = a.on != null ? m.features.filter(function (x) { return x.id === a.on; })[0] : null, ob = b && b.on != null ? m2.features.filter(function (x) { return x.id === b.on; })[0] : null;
          assert(b && (oa ? ob && ob.name === oa.name : b.on == null) && JSON.stringify(a.n) === JSON.stringify(b.n), f.name + ' ' + k + ': ' + JSON.stringify(b));
        });
      });
      var m3 = rfMYclone(m2);
      rfMYfeat(m3, 'Edge-Flange1').length = 1.4;
      rfMYnoErr(rfMYrun(m3), 'script copy, length edited');
    });
    // Closed Corner, Break Corner and Unfold picked on an earlier flange's wall (mm, 1.5 thick): the left flange's
    // length / the thickness / the radius edited, their picks stay on the same face / corner of that wall
    function rfMYcorner(extra) {
      var m = K.newModel('rfMY corners');
      K.runScript(m, 'p.units("mm"); p.sheet(1.5, 1.5, 0.5); p.sketch("Top").rect(0, -60, 100, 60).end().baseFlange();' +
        ' p.flange(25, [[50, 1.5, 0]], { position: "inside", lengthRef: "outer", name: "Front" }); p.flange(25, [[0, 1.5, 30]], { position: "inside", lengthRef: "outer", name: "Left" });' + extra);
      return m;
    }
    [['Closed Corner on the Left wall\'s end face', ' p.closedCorner([[0.75, 15, 3]], { name: "CC" });', 'CC', 'faces.0'],
      ['Break Corner on the Left wall\'s top back corner', ' p.breakCorner(3, [[0.75, 25, 60]], { kind: "fillet", name: "BC" });', 'BC', 'corners.0'],
      ['Unfold fixed on the Left wall\'s inside face', ' p.unfold([1.5, 15, 30], null, { name: "UF" });', 'UF', 'fixedFace']].forEach(function (c) {
      test('rfMY: ' + c[0] + ' follows Left 25 -> 12 / 40, Front 25 -> 35, thickness 1.5 -> 2, radius 1.5 -> 3; the old document builds bit-identical', function () {
        var base = rfMYcorner(c[1]), r0 = rfMYrun(base), g = rfMYfeat(base, c[2]);
        rfMYnoErr(r0, c[0]);
        var ref = g.pickRefs && g.pickRefs[c[3]];
        assert(ref && ref.frame === 'wall' && ref.on === rfMYfeat(base, 'Left').id, c[2] + ': ref ' + JSON.stringify(ref));
        rfMYsame(r0, rfMYrun(rfMYstrip(base)), 'old document');
        [['Left 12', function (m) { rfMYfeat(m, 'Left').length = 12; }], ['Left 40', function (m) { rfMYfeat(m, 'Left').length = 40; }],
          ['Front 35', function (m) { rfMYfeat(m, 'Front').length = 35; }],
          ['T 2', function (m) { m.sheet.thickness = 2; m.features.forEach(function (f) { if (f.sheetBase) f.depth = 2; }); }],
          ['R 3', function (m) { m.sheet.bendRadius = 3; }]].forEach(function (ed) {
          var m = rfMYclone(base);
          ed[1](m);
          var r = rfMYrun(m);
          rfMYnoErr(r, c[2] + ', ' + ed[0]);
          assert(r.mp.volume !== r0.mp.volume, c[2] + ', ' + ed[0] + ': the part did not change');
        });
        // the same edit without references (the stored point alone) fails for Left 12: the reference is what holds it
        var m0 = rfMYstrip(base);
        rfMYfeat(m0, 'Left').length = 12;
        var e0 = rfMYrun(m0).errors;
        assert(c[2] === 'CC' || c[2] === 'UF' || c[2] === 'BC' ? !!e0[g.id] : true, c[2] + ': the point alone already followed (' + JSON.stringify(e0) + ')');
      });
    });
    // lane MY2: a hole sketched on Edge-Flange1's outer face and a slot on Edge-Flange2's, each a blind Cut-Extrude .15 (Through All would also cut the base under a 120° wall);
    // Edge-Flange1 edited the ten ways: both sketches stay at the same place ON their walls (plane.face.wall), the cuts
    // build, every hole is in the flat (loops = 1 + 2) with its area unchanged, volume = blank x T
    function rfMYholes() {
      var m = rfMYbracket(), b = K.rebuild(m);
      [['Edge-Flange1', 'circle', 0.2], ['Edge-Flange2', 'rect', 0.3]].forEach(function (q) {
        var g = rfMYfeat(m, q[0]), F = rfMYfar(b, g.id), mid = [0, 1, 2].map(function (k) { return F.outer[k] - F.w[k] * F.L / 2; });
        var nOut = F.m.map(function (x) { return -x; });
        var spec = '{ face: ' + g.id + ', role: "geom", normal: ' + JSON.stringify(nOut) + ', at: ' + JSON.stringify(mid) + ' }';
        var t = K.newModel('t'); K.runScript(t, 'p.sketch(' + spec + ').circle(0, 0, 1).end();');
        var pl = t.features[0].plane, d = [0, 1, 2].map(function (k) { return mid[k] - pl.origin[k]; });
        var u = d[0] * pl.x[0] + d[1] * pl.x[1] + d[2] * pl.x[2], v = d[0] * pl.y[0] + d[1] * pl.y[1] + d[2] * pl.y[2];
        K.runScript(m, 'p.sketch(' + spec + ')' + (q[1] === 'circle' ? '.circle(' + u + ', ' + v + ', ' + q[2] / 2 + ')' : '.rect(' + (u - 0.15) + ', ' + (v - 0.05) + ', 0.3, 0.1)') + '.end();\np.cut(0.15, { name: "Cut on ' + q[0] + '" });');
      });
      return m;
    }
    (function () {
      var base = rfMYholes(), r0 = rfMYrun(base), fl0 = K.flatPattern(r0.model, r0.build, r0.mesh);
      function holeAreas(fl) { return fl.loops.slice(1).map(function (l) { return Math.abs(K.signedArea(l)); }).sort(); }
      test('rfMY2: bracket with a hole on Edge-Flange1 and a slot on Edge-Flange2: builds, both sketches hold a wall reference, both in the flat; old document bit-identical', function () {
        rfMYnoErr(r0, 'holes');
        base.features.filter(function (f) { return f.type === 'sketch' && f.plane && f.plane.face; }).forEach(function (s) { assert(s.plane.face.wall, s.name + ': no wall reference'); });
        assert(fl0.loops.length === 3, 'flat loops ' + fl0.loops.length);
        var old = rfMYclone(base);
        old.features.forEach(function (f) { delete f.pickRefs; if (f.type === 'sketch' && f.plane && f.plane.face) delete f.plane.face.wall; });
        rfMYsame(r0, rfMYrun(old), 'old document'); rfMYsame(r0, rfMYrun(old), 'old document, refs written');
      });
      rfMYedits('Edge-Flange1').forEach(function (ed) {
        test('rfMY2: holes on the flanges, Edge-Flange1 ' + ed[0] + ': both cuts build on their walls, flat holes unchanged, volume = blank x T', function () {
          var m = rfMYclone(base);
          ed[1](m);
          var r = rfMYrun(m), fl = K.flatPattern(r.model, r.build, r.mesh);
          rfMYnoErr(r, ed[0]);
          assert(fl.loops.length === 3, 'flat loops ' + fl.loops.length + ': areas ' + JSON.stringify(holeAreas(fl)) + ' were ' + JSON.stringify(holeAreas(fl0)));
          var a0 = holeAreas(fl0), a1 = holeAreas(fl);
          a0.forEach(function (a, i) { nearRel(a1[i], a, 1e-6, 'hole ' + i + ' area'); });
          // (the faceted hole: volume − blank × T is the same small offset as the unedited part's, 1.2e-5)
          near((r.mp.volume - rfMYarea(fl) * +m.sheet.thickness) / +m.sheet.thickness, (r0.mp.volume - rfMYarea(fl0) * +base.sheet.thickness) / +base.sheet.thickness, 1e-7, '(volume − blank x T) / T');
          m.features.filter(function (f) { return f.type === 'sketch' && f.plane && f.plane.face; }).forEach(function (s, i) {
            var w0 = base.features.filter(function (f) { return f.id === s.id; })[0].plane.face.wall, w1 = s.plane.face.wall;
            assert(w1 && w1.ri === w0.ri && Math.abs(w1.o[0] - w0.o[0]) < 1e-9 && Math.abs(w1.o[2] - w0.o[2]) < 1e-9, s.name + ': wall place ' + JSON.stringify(w1));
          });
        });
      });
    })();
    // lane MY3: Unfold / Fold `bends` picks by reference (the flange record that made the bend): Unfold of the Left
    // flange's bend (fixed on the base), then Fold; Left 12 / 40, Front 35, T 2, R 3: both build on that bend
    test('rfMY3: Unfold and Fold of the Left flange bend follow Left 12 / 40, Front 35, thickness 2, radius 3; old document bit-identical; deleted Left = dangling', function () {
      var m0 = rfMYcorner(''), b0 = rfMYrun(m0), bends = K.sheetBends(m0, b0.build, b0.mesh);
      var left = bends.filter(function (q) { return q.at[0] < 5; })[0];
      assert(left, 'the Left bend: ' + JSON.stringify(bends.map(function (q) { return q.at; })));
      var base = rfMYcorner(' p.unfold([50, 1.5, 30], [' + JSON.stringify(left.at) + '], { name: "UF" }); p.fold([' + JSON.stringify(left.at) + '], { name: "FD" });');
      var r0 = rfMYrun(base);
      rfMYnoErr(r0, 'unfold / fold');
      ['UF', 'FD'].forEach(function (n) { var ref = rfMYfeat(base, n).pickRefs && rfMYfeat(base, n).pickRefs['bends.0']; assert(ref && ref.frame === 'bend' && ref.on === rfMYfeat(base, 'Left').id, n + ': ' + JSON.stringify(ref)); });
      rfMYsame(r0, rfMYrun(rfMYstrip(base)), 'old document');
      [['Left 12', function (m) { rfMYfeat(m, 'Left').length = 12; }], ['Left 40', function (m) { rfMYfeat(m, 'Left').length = 40; }],
        ['Front 35', function (m) { rfMYfeat(m, 'Front').length = 35; }],
        ['T 2', function (m) { m.sheet.thickness = 2; m.features.forEach(function (f) { if (f.sheetBase) f.depth = 2; }); }],
        ['R 3', function (m) { m.sheet.bendRadius = 3; }]].forEach(function (ed) {
        var m = rfMYclone(base); ed[1](m);
        var r = rfMYrun(m);
        rfMYnoErr(r, ed[0]);
        var bs = K.sheetBends(m, r.build, r.mesh), at = rfMYfeat(m, 'UF').bends[0];
        var hit = K.sheetBendAt ? K.sheetBendAt(bs, at, +m.sheet.thickness) : 0;
        assert(hit >= 0 && bs[hit].at[0] < 5, ed[0] + ': the Unfold bend is the Left one: ' + JSON.stringify(at));
      });
      var md = rfMYclone(base), lid = rfMYfeat(md, 'Left').id;
      md.features = md.features.filter(function (f) { return f.id !== lid; });
      var rd = rfMYrun(md), uf = rfMYfeat(md, 'UF');
      assert(rd.errors[uf.id] && /Dangling bend/.test(rd.errors[uf.id]) && rd.errors[uf.id].indexOf('Left') >= 0, 'deleted Left: ' + rd.errors[uf.id]);
    });
    // lane MY3 (smoke rfJY): an Edge Flange on the leg of an L Swept Flange, copied with its pickRefs into another model
    // (the open-profile Base Flange twin, where feature id 3 is something else): the reference names a feature of the
    // other model, so the stored point decides (it still finds the edge) and the twin's flat = the Swept Flange's
    test('rfMY3: a flange copied with its pickRefs into another model (the open-base twin of rfJY) builds on its stored point: twin blank = the original blank = the twin without refs', function () {
      var T = 0.06, head = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
      var a = K.newModel('sf');
      K.runScript(a, head + 'var path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);');
      var ba = K.rebuild(a), top = null;
      K.bodyEdges(K.meshFromBody(ba.body)).forEach(function (e) { if (Math.abs(e.mid[2] - 5) < 1e-6 && (!top || e.mid[1] > top.mid[1] + 1e-9 || (Math.abs(e.mid[1] - top.mid[1]) < 1e-9 && e.mid[0] > top.mid[0]))) top = e; });
      assert(top, 'the top edge of the leg');
      K.runScript(a, 'p.flange(1, [' + JSON.stringify(top.mid) + ']);');
      var ra = rfMYrun(a), fa = a.features[a.features.length - 1];
      rfMYnoErr(ra, 'swept + flange');
      assert(fa.pickRefs && fa.pickRefs['edges.0'], 'refs written');
      function twin(withRefs) {
        var m = K.newModel('twin');
        K.runScript(m, head + 'p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).end().baseFlange(null, { depth: 10 });');
        var ff = JSON.parse(JSON.stringify(fa)); ff.id = 9999; if (!withRefs) delete ff.pickRefs; m.features.push(ff);
        var r = rfMYrun(m);
        rfMYnoErr(r, 'twin' + (withRefs ? ' with refs' : ''));
        return Math.abs(K.signedArea(K.flatPattern(m, r.build, r.mesh).loops[0]));
      }
      var blankA = Math.abs(K.signedArea(K.flatPattern(a, ra.build, ra.mesh).loops[0]));
      near(twin(true), twin(false), 1e-9, 'twin with refs vs without');
      near(twin(true), blankA, 1e-9, 'twin vs the Swept Flange');
    });
    // task 2: cut('through', { both: true }) (Through All - Both) drilled one wall of a tube: the Builder's `both` made
    // Direction 2 a blind 0. Now Direction 2 takes Direction 1's end condition. A hole sketched in the middle of a tube
    // (and across a U channel's legs) through each end condition: the metal removed is one wall's or both walls' worth.
    // (Up To Next is no end condition of Anvil's Cut-Extrude yet: no row.)
    function rfMYvol(src) { var r = build(src); rfMYnoErr(r, src.split('\n').pop()); return r.mp.volume; }
    [['tube 2 x 2 x .1', 'p.units("in"); p.sketch("Front").rect(0, 0, 2, 2).rect(0.1, 0.1, 1.8, 1.8).end().extrude(6);\np.sketch("Top", 1).circle(1, -3, 0.25).end();\n'],
      ['U channel 2 x 1 x .1, hole across both legs', 'p.units("in"); p.sketch("Front").rect(0, 0, 2, 0.1).end().extrude(6); p.sketch("Front").rect(0, 0, 0.1, 1).end().extrude(6); p.sketch("Front").rect(1.9, 0, 0.1, 1).end().extrude(6);\np.sketch("Right", 1).circle(-3, 0.5, 0.2).end();\n']].forEach(function (c) {
      test('rfMY: Cut-Extrude on a ' + c[0] + ': Through All one wall; Through All - Both, Mid Plane 4, Blind 1.5 both ways both walls; script round trip', function () {
        var v0 = rfMYvol(c[1] + 'p.sketch("Front").rect(5, 5, 0.1, 0.1).end();'), one = v0 - rfMYvol(c[1] + 'p.cut("through");');
        assert(one > 1e-3, 'one wall: removed ' + one);
        [['Through All - Both', 'p.cut("through", { both: true });'], ['Mid Plane 4', 'p.cut(4, { midplane: true });'], ['Blind 1.5 both', 'p.cut(1.5, { both: true });']].forEach(function (k) {
          nearRel(v0 - rfMYvol(c[1] + k[1]), 2 * one, 1e-9, k[0] + ': removed');
        });
        nearRel(v0 - rfMYvol(c[1] + 'p.cut(1.5);'), one, 1e-9, 'Blind 1.5: removed');
        var m = K.newModel('x'); K.runScript(m, c[1] + 'p.cut("through", { both: true });');
        var f = m.features[m.features.length - 1];
        assert(f.dir2 && f.end === 'through' && f.end2 === 'through', 'feature ' + JSON.stringify(f));
        var m2 = K.newModel('y'); K.runScript(m2, K.generateScript(m));
        var g = m2.features[m2.features.length - 1];
        assert(g.end2 === 'through' && g.dir2, 'round trip ' + JSON.stringify(g));
      });
    });
  })();
