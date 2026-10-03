// ui-relations.js — sketch relations in the UI: relation icons next to entities, yellow inference icons while
// sketching, distance / angle Smart Dimensions between two entities, the Add Relations and Display/Delete Relations
// PropertyManagers, and dragging an under-defined sketch (every relation holds). The maths is in sketch-solver.js.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el, S = window.SketchSolver;
  if (!S) return;
  if (App.view.showRelations == null) App.view.showRelations = true;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function scr(pl, uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
  function iconName(type) { return type === 'distance' || type === 'angle' ? type : 'rel' + type.charAt(0).toUpperCase() + type.slice(1); }
  var CENTERLESS = /^(rect|crect|slot|poly)$/;   // their centre is not offered as a pick (it is not a sketch point in SolidWorks)
  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.gridStale = true; UI.updateSketches(); UI.refreshTree(); }

  // ------------------------------------------------------------------ picking a ref under the mouse
  // A point (end, centre, corner) within 7 px wins, then the origin, then the entity / rectangle edge under the mouse.
  function pickSketchRef(mx, my) {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    var pl = UI.activePlane(), best = null, bd = 7;
    f.entities.forEach(function (e, i) {
      S.pointRefs(f, i).forEach(function (pr) {
        if (/\.(c|mid)$/.test(pr.ref) && (CENTERLESS.test(e.t) || /\.mid$/.test(pr.ref))) return;
        var s = scr(pl, pr.pt), d = Math.hypot(s[0] - mx, s[1] - my);
        if (d < bd) { bd = d; best = pr.ref; }
      });
    });
    var o = scr(pl, [0, 0]);
    if (Math.hypot(o[0] - mx, o[1] - my) < Math.min(bd, 7)) best = 'O';
    if (best) return best;
    var hit = UI.pickEntity(mx, my);
    if (!hit) return null;
    var curves = S.curveRefs(f, hit.index);
    if (!curves.length) return String(hit.index);
    if (curves.length === 1) return curves[0];
    var bestC = curves[0], bdc = Infinity;
    curves.forEach(function (c) {
      var L = S.refCurve(f, c);
      if (!L || L.kind !== 'line') return;
      var a = scr(pl, L.a), b = scr(pl, L.b), d = segDist([mx, my], a, b);
      if (d < bdc) { bdc = d; bestC = c; }
    });
    return bestC;
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function refEntity(ref) { var p = S.parseRef(ref); return p && !p.o ? p.e : -1; }

  // ------------------------------------------------------------------ distance / angle dimensions (two entities)
  // Which two-entity dimension a pair of picks means: two non-parallel lines -> angle, anything else that has a
  // distance -> distance. null when the pair has none (or is one entity picked twice).
  function relDimFor(f, r1, r2) {
    if (!r1 || !r2 || r1 === r2) return null;
    var p1 = S.parseRef(r1), p2 = S.parseRef(r2);
    if (p1 && p2 && !p1.o && !p2.o && p1.e === p2.e && (p1.s === null || p2.s === null)) return null;
    var k1 = S.refKind(f, r1), k2 = S.refKind(f, r2);
    if (k1 === 'line' && k2 === 'line') {
      var a = S.refCurve(f, r1), b = S.refCurve(f, r2);
      var d1 = [a.b[0] - a.a[0], a.b[1] - a.a[1]], d2 = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
      var sn = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) / ((Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1])) || 1);
      if (sn > 1e-6) return { type: 'angle', refs: [r1, r2] };
    }
    if (S.measure(f, 'distance', [r1, r2]) != null) return { type: 'distance', refs: [r1, r2] };
    return null;
  }
  // The two sketch points a distance dimension runs between, and the angle construction of an angle dimension.
  function relDimGeometry(f, rel) {
    var ents = f.entities, R = rel.refs, k0 = S.refKind(f, R[0]), k1 = S.refKind(f, R[1]);
    function ctr(r, k) { if (k === 'point') return S.refPoint(f, r); if (k === 'circle') return S.refCurve(f, r).c; var l = S.refCurve(f, r); return [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]; }
    if (!k0 || !k1 || !ents) return null;
    if (rel.type === 'angle') {
      var A = S.refCurve(f, R[0]), B = S.refCurve(f, R[1]);
      if (!A || !B || A.kind !== 'line' || B.kind !== 'line') return null;
      var d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-12) return null;
      var t = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den;
      var X = [A.a[0] + d1[0] * t, A.a[1] + d1[1] * t];
      return { type: 'angle', X: X, d1: d1, d2: d2, A: A, B: B };
    }
    var P, Q;
    if (k0 !== 'line' && k1 !== 'line') { P = ctr(R[0], k0); Q = ctr(R[1], k1); }
    else {
      var li = k1 === 'line' ? 1 : 0, L = S.refCurve(f, R[li]);
      P = ctr(R[1 - li], li ? k0 : k1);
      var dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], L2 = dx * dx + dy * dy || 1, u = ((P[0] - L.a[0]) * dx + (P[1] - L.a[1]) * dy) / L2;
      Q = [L.a[0] + dx * u, L.a[1] + dy * u];
    }
    // the direction the distance is measured along: horizontal / vertical (rel.dir 'h' / 'v', two points or centres)
    // or aligned with P -> Q; flipped so the value reads positive (the placement offset is along its left normal)
    var L0 = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    var dir = rel.dir === 'h' && k0 !== 'line' && k1 !== 'line' ? [1, 0] : rel.dir === 'v' && k0 !== 'line' && k1 !== 'line' ? [0, 1] : L0 < 1e-12 ? [1, 0] : [(Q[0] - P[0]) / L0, (Q[1] - P[1]) / L0];
    if ((Q[0] - P[0]) * dir[0] + (Q[1] - P[1]) * dir[1] < 0) dir = [-dir[0], -dir[1]];
    return { type: 'distance', P: P, Q: Q, dir: dir };
  }
  // Placement from the cursor: distance -> signed offset from P-Q; angle -> arc radius and which quadrant. A distance
  // being placed between two points (no value yet) also takes its direction from where the cursor is, as SolidWorks'
  // Smart Dimension does: above / below the two points -> horizontal, beside them -> vertical, otherwise aligned.
  function relDimPlacement(f, rel, uv) {
    var out = {};
    if (rel.type === 'distance' && rel.v == null && !rel.driven) {
      var k0 = S.refKind(f, rel.refs[0]), k1 = S.refKind(f, rel.refs[1]);
      if (k0 && k1 && k0 !== 'line' && k1 !== 'line') {
        var g0 = relDimGeometry(f, { type: 'distance', refs: rel.refs });
        var tol = 1e-9 * Math.max(1, Math.abs(g0.P[0]), Math.abs(g0.P[1]));
        var inX = uv[0] > Math.min(g0.P[0], g0.Q[0]) && uv[0] < Math.max(g0.P[0], g0.Q[0]);
        var inY = uv[1] > Math.min(g0.P[1], g0.Q[1]) && uv[1] < Math.max(g0.P[1], g0.Q[1]);
        var slanted = Math.abs(g0.P[0] - g0.Q[0]) > tol && Math.abs(g0.P[1] - g0.Q[1]) > tol;
        out.dir = slanted && inX && !inY ? 'h' : slanted && inY && !inX ? 'v' : undefined;
        rel = Object.assign({}, rel, { dir: out.dir });
      }
    }
    var g = relDimGeometry(f, rel);
    if (!g) return out;
    if (g.type === 'angle') {
      // r5/sketch5: an angle being placed takes its quadrant from the cursor, as SolidWorks' does (between the two
      // lines' directions: the angle; beside one of them: its supplement); its label follows the cursor round the arc
      // (ta, degrees from the arc's middle), snapping to the middle within 10 px
      var w = [uv[0] - g.X[0], uv[1] - g.X[1]], R = Math.hypot(w[0], w[1]);
      out.off = Math.round(R * 1e4) / 1e4;
      var q = rel.q === -1 ? -1 : 1, sup = !!rel.sup;
      if (rel.v == null && !rel.driven) {
        var den = g.d1[0] * g.d2[1] - g.d1[1] * g.d2[0], al = (w[0] * g.d2[1] - w[1] * g.d2[0]) / den, be = (g.d1[0] * w[1] - g.d1[1] * w[0]) / den;
        q = al < 0 ? -1 : 1; sup = (al < 0) !== (be < 0);
        out.q = q === -1 ? -1 : undefined; out.sup = sup || undefined;
      }
      var ar = angleArc(g, q, sup), da = wrapPi(Math.atan2(w[1], w[0]) - ar.mid), s = UI.cam.scale || 0.1;
      out.ta = Math.abs(da) * R < 10 * s ? undefined : Math.round(da * 1800 / Math.PI) / 10;
      return out;
    }
    var n = [-g.dir[1], g.dir[0]];
    out.off = Math.round(((uv[0] - g.P[0]) * n[0] + (uv[1] - g.P[1]) * n[1]) * 1e4) / 1e4;
    var tx = UI.dimTextAlong ? UI.dimTextAlong(uv, g.P, g.dir, (g.Q[0] - g.P[0]) * g.dir[0] + (g.Q[1] - g.P[1]) * g.dir[1]) : null;
    if (tx != null) out.tx = tx;
    return out;
  }
  // Screen drawing data in the shape ui-sketch.js's drawOne takes: { lines, arrows, label, text }.
  function relDimScreenData(f, pl, rel) {
    var g = relDimGeometry(f, rel);
    if (!g) return null;
    var s = UI.cam.scale;
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var value = rel.v != null && !rel.driven ? rel.v : S.measure(f, rel.type, rel.refs, rel.dir, rel.sup);
    var label = UI.fmtNum(value, 2) + (rel.type === 'angle' ? '°' : '');
    if (rel.driven) label = '(' + label + ')';
    if (g.type === 'distance') {
      var ld = UI.linearDimScreen(pl, g.P, g.Q, g.dir, rel.off, rel.tx);
      ld.label = label;
      return ld;
    }
    var out = { lines: [], arrows: [], label: label };
    // angle: an arc of radius `off` around the intersection, between the two rays of the quadrant it was placed in
    // (rel.q / rel.sup, angleArc); the label sits at rel.ta degrees from the arc's middle (r5/sketch5: it follows the
    // cursor), with the arc running on to it; extension lines run from the lines to the arc where they stop short
    var R = rel.off != null ? rel.off : 30 * s, ar = angleArc(g, rel.q === -1 ? -1 : 1, !!rel.sup);
    function at(a, r) { return scr(pl, [g.X[0] + r * Math.cos(a), g.X[1] + r * Math.sin(a)]); }
    function arcLines(from, sw) {
      var n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 24))), p = [];
      for (var i = 0; i <= n; i++) p.push(at(from + sw * i / n, R));
      for (var j = 0; j < n; j++) out.lines.push([p[j], p[j + 1]]);
      return p;
    }
    var pts = arcLines(ar.a1, ar.sweep), N = pts.length - 1;
    out.arrows.push({ tip: pts[0], dir: unit(pts[1], pts[0]) }, { tip: pts[N], dir: unit(pts[N - 1], pts[N]) });
    var da = (rel.ta || 0) * Math.PI / 180, half = Math.abs(ar.sweep) / 2, aL = ar.mid + da;
    if (Math.abs(da) > half) {
      var sg = da < 0 ? -1 : 1, past = Math.min(0.5, 6 * s / Math.max(R, 1e-9));
      arcLines(ar.mid + sg * half, sg * (Math.abs(da) - half + past));
    }
    [[ar.u1, g.A], [ar.u2, g.B]].forEach(function (x) {
      var u = x[0], L = Math.hypot(u[0], u[1]) || 1, ux = u[0] / L, uy = u[1] / L;
      var t1 = (x[1].a[0] - g.X[0]) * ux + (x[1].a[1] - g.X[1]) * uy, t2 = (x[1].b[0] - g.X[0]) * ux + (x[1].b[1] - g.X[1]) * uy;
      var tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), gap = 2 * s, ext = 3 * s, a = Math.atan2(uy, ux);
      if (R > tmax + gap) out.lines.push([at(a, tmax + gap), at(a, R + ext)]);
      else if (R < tmin - gap) out.lines.push([at(a, R - ext), at(a, tmin - gap)]);
    });
    var mid = at(aL, R), c = scr(pl, g.X), um = unit(c, mid);
    out.text = { x: mid[0] + um[0] * 10, y: mid[1] + um[1] * 10 + 4, anchor: um[0] > 0.35 ? 'start' : um[0] < -0.35 ? 'end' : 'middle' };
    return out;
  }
  // The arc of an angle dimension: rays u1 = q·d1 and u2 = ±q·d2 (reversed for the supplementary angle), from u1's
  // direction a1 sweeping (signed, at most half a turn) to u2's; mid = the middle angle.
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
  function angleArc(g, q, sup) {
    var u1 = [q * g.d1[0], q * g.d1[1]], s2 = sup ? -q : q, u2 = [s2 * g.d2[0], s2 * g.d2[1]];
    var a1 = Math.atan2(u1[1], u1[0]), sweep = wrapPi(Math.atan2(u2[1], u2[0]) - a1);
    return { u1: u1, u2: u2, a1: a1, sweep: sweep, mid: a1 + sweep / 2 };
  }
  // Place a two-entity dimension: adds the relation (value = what it measures now) and opens the Modify box.
  function placeRelDim(f, rd, uv) {
    var pl = relDimPlacement(f, rd, uv);
    markDirty();
    var r = S.addRelation(f, rd.type, rd.refs, { off: pl.off, dir: pl.dir, tx: pl.tx, sup: pl.sup, q: pl.q, ta: pl.ta });
    if (!r.ok) { UI.toast(r.error); return; }
    var idx = r.rels[0];
    App.sel = { kind: 'rel', index: idx };
    refresh();
    App.dimsStale = false;
    if (UI.drawDims) UI.drawDims();
    if (r.status !== 'ok') { askDriven(f, 'rel', idx); return; }
    UI.setStatus((rd.type === 'angle' ? 'Angle' : 'Distance') + ' dimension placed. Type a value and press Enter to drive the sketch.');
    UI.openRelDimEdit(idx);
  }

  // ------------------------------------------------------------------ driven (reference) dimensions
  // A new dimension that would over-define the sketch: ask, as SolidWorks does, whether to make it driven. The answer
  // is a page modal (#drv-driven / #drv-driving), never a browser dialog.
  function askDriven(f, kind, index) {
    var sketchId = f.id;
    function item() { var g = UI.activeSketchFeature(); return g && g.id === sketchId ? g : null; }
    UI.showModal({
      title: 'Make Dimension Driven?',
      body: '<p>Adding this dimension will make the sketch over defined or unable to solve.</p><p>Do you want to add this dimension as a driven (reference) dimension instead? A driven dimension shows the value the geometry has, in grey and in parentheses, and does not drive anything.</p>',
      buttons: [
        { id: 'drv-driven', label: 'Make this dimension driven', primary: true, action: function () { UI.closeModal(); var g = item(); if (g) setDriven(g, kind, index, true); } },
        { id: 'drv-driving', label: 'Leave this dimension driving', action: function () { UI.closeModal(); UI.setStatus('The dimension is driving and over-defines the sketch (shown yellow). Delete it, or make it driven.'); App.dimsStale = true; } }
      ]
    });
    App.drivenPrompt = { kind: kind, index: index };
  }
  // Placed dimension check (ui-sketch.js calls this after a single-entity Smart Dimension is placed): true when the
  // question was asked (the caller then does not open the Modify box).
  function askDrivenIfOver(f, kind, index) {
    if (!S.overDefines(f, kind, index)) return false;
    askDriven(f, kind, index);
    return true;
  }
  function setDriven(f, kind, index, on) {
    markDirty();
    var r = S.setDriven(f, kind, index, on);
    App.drivenPrompt = null;
    if (!r.ok) { UI.toast(r.error); return r; }
    refresh();
    App.dimsStale = true;
    UI.setStatus(on ? 'Driven dimension: its value follows the geometry. ' + S.STATUS_TEXT[r.analysis.status] + '.' : 'The dimension drives the sketch again' + (r.state !== 'ok' ? ', and over-defines it (shown yellow).' : '.'));
    return r;
  }
  // Clicking a driven dimension: it has no value to type, so offer to make it driving.
  function drivenDimClick(it) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    var kind = it.rel != null ? 'rel' : 'dim', index = it.rel != null ? it.rel : it.index;
    UI.showModal({
      title: 'Driven Dimension',
      body: '<p>This is a driven (reference) dimension: it shows what the geometry measures and cannot be changed.</p>',
      buttons: [
        { id: 'drv-make-driving', label: 'Make driving', primary: true, action: function () { UI.closeModal(); setDriven(f, kind, index, false); } },
        { label: 'Close', action: UI.closeModal }
      ]
    });
  }

  // ------------------------------------------------------------------ construction geometry
  // Construction Geometry (Sketch tab): toggles `construction` on the selected sketch entities (all become
  // construction unless all already are). Construction entities are drawn dashed and are not part of any profile.
  function selectedEntities() {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out;
  }
  function toggleConstruction(list) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    list = (list || selectedEntities()).filter(function (i) { return f.entities[i]; });
    if (!list.length) { UI.setStatus('Select sketch entities first, then click Construction Geometry.'); return null; }
    var on = list.some(function (i) { return !f.entities[i].construction; });
    markDirty();
    list.forEach(function (i) { if (on) f.entities[i].construction = true; else delete f.entities[i].construction; });
    refresh();
    UI.setStatus((list.length === 1 ? 'Entity' : list.length + ' entities') + (on ? ' changed to construction geometry.' : ' changed back to sketch geometry.'));
    return on;
  }
  function cmdCenterline() {
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    UI.setTool('line');
    App.drawConstruction = true;
    $('sketch-hint').innerHTML = 'Centerline: click the start and end points. Centerlines are construction geometry: axes for Symmetric relations, not part of the profile.';
    UI.refreshRibbon();
  }

  // ------------------------------------------------------------------ relation icons in the #dim-layer
  function anchorOf(f, pl, ref) {
    var p = S.refPoint(f, ref);
    if (p) return scr(pl, p);
    var c = S.refCurve(f, ref);
    if (!c) return null;
    if (c.kind === 'line') return scr(pl, [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2]);
    return scr(pl, [c.c[0] + c.r * Math.SQRT1_2, c.c[1] + c.r * Math.SQRT1_2]);
  }
  function badge(layer, h, x, y, type, cls, title) {
    var g = h.svg('g', { 'class': 'rel-badge ' + (cls || ''), transform: 'translate(' + Math.round(x) + ',' + Math.round(y) + ')' }, layer);
    h.svg('rect', { x: 0, y: 0, width: 16, height: 16, rx: 2 }, g);
    if (h.icon) h.icon(g, iconName(type));
    else { var inner = h.svg('g', { transform: 'translate(1,1) scale(0.875)' }, g); inner.innerHTML = Icons(iconName(type), 16).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); }
    if (title) { var t = h.svg('title', {}, g); t.textContent = title; }
    return g;
  }
  // r5/sketch5: where a relation icon goes. Each icon takes a 16 px box clear of the dimension labels and of the icons
  // already placed: beside a point (right / below first, then round it), along a line on either side, outside a
  // circle; a second icon on the same anchor goes next to the first, in a row, as SolidWorks lines them up.
  function badgeSpot(h, a, kind, dir, prev) {
    var cands = [];
    if (prev) cands.push([prev[0] + 18, prev[1]], [prev[0] - 18, prev[1]], [prev[0], prev[1] + 18], [prev[0], prev[1] - 18]);
    if (kind === 'line') {
      var n = [-dir[1], dir[0]];
      if (n[1] < 0 || (n[1] === 0 && n[0] < 0)) n = [-n[0], -n[1]];
      [0, 20, -20, 40, -40, 60, -60].forEach(function (t) {
        [1, -1].forEach(function (sd) { cands.push([a[0] + dir[0] * t + n[0] * sd * 14 - 8, a[1] + dir[1] * t + n[1] * sd * 14 - 8]); });
      });
    } else if (kind === 'curve') {
      [0, 0.6, -0.6, 1.2, -1.2].forEach(function (k) {
        var c = Math.cos(k), s = Math.sin(k), u = [dir[0] * c - dir[1] * s, dir[0] * s + dir[1] * c];
        cands.push([a[0] + u[0] * 14 - 8, a[1] + u[1] * 14 - 8]);
      });
    }
    [1, 1.8, 2.6].forEach(function (m) {
      [[8, 6], [8, -22], [-24, 6], [-24, -22], [-8, 12], [-8, -28], [14, -8], [-30, -8]].forEach(function (o) { cands.push([a[0] + (o[0] + 8) * m - 8, a[1] + (o[1] + 8) * m - 8]); });
    });
    for (var i = 0; i < cands.length; i++) {
      var b = [cands[i][0] - 1, cands[i][1] - 1, cands[i][0] + 17, cands[i][1] + 17];
      if (!h.free || h.free(b)) { if (h.take) h.take(b); return cands[i]; }
    }
    var p = prev ? [prev[0] + 18, prev[1]] : [a[0] + 8, a[1] + 6];
    if (h.take) h.take([p[0] - 1, p[1] - 1, p[0] + 17, p[1] + 17]);
    return p;
  }
  // A Coincident that only joins two end points (a line chain, a rectangle's corners): SolidWorks merges such points
  // and shows no icon. Shown when selected or when it over-defines.
  function mergedEnds(f, rel) {
    return rel.type === 'coincident' && rel.refs.length === 2 && rel.refs.every(function (r) { return /^\d+\.p[12]$/.test(String(r)) && f.entities[refEntity(r)] && !f.entities[refEntity(r)].sharp; });
  }
  function drawRelations(f, pl, layer, h) {
    var an = App.sketchState, slots = {};
    // the distance / angle dimensions first, so the icons keep clear of their labels
    if (f.rels) f.rels.forEach(function (rel, i) {
      var t = S.TYPES[rel.type];
      if (!t || !t.dim) return;
      var state = an && an.rels ? an.rels[i] : 'ok';
      var sc = relDimScreenData(f, pl, rel);
      if (sc) { var it = { d: rel, rel: i, state: rel.driven ? 'driven' : state }; h.drawOne(sc, it); h.list.push(it); }
    });
    if (f.rels) f.rels.forEach(function (rel, i) {
      var t = S.TYPES[rel.type];
      if (!t || t.dim) return;
      var state = an && an.rels ? an.rels[i] : 'ok';
      // a virtual sharp (SketchSolver.filletCorner) on the lines it joins: thin extension lines to their ends, no icons
      var sh = rel.type === 'coincident' && rel.refs.length === 2 ? rel.refs.map(function (r) { var e = f.entities[refEntity(r)]; return e && e.sharp && String(r) === String(refEntity(r)); }) : null;
      if (sh && (sh[0] || sh[1])) {
        var P = S.refPoint(f, rel.refs[sh[0] ? 0 : 1]), L = S.refCurve(f, rel.refs[sh[0] ? 1 : 0]);
        if (P && L && L.kind === 'line') {
          var end = Math.hypot(L.a[0] - P[0], L.a[1] - P[1]) < Math.hypot(L.b[0] - P[0], L.b[1] - P[1]) ? L.a : L.b, s1 = scr(pl, P), s2 = scr(pl, end);
          h.svg('line', { 'class': 'sk-sharp', x1: s1[0], y1: s1[1], x2: s2[0], y2: s2[1], style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2;pointer-events:none' }, layer);
          return;
        }
      }
      var selected = App.sel && App.sel.kind === 'rel' && App.sel.index === i, hot = App.relHover === i;
      if (App.view.showRelations === false && !selected && !hot) return;
      if (mergedEnds(f, rel) && state === 'ok' && !selected && !hot) return;
      var drawn = [];
      rel.refs.forEach(function (ref) {
        if (ref === 'O') return;
        var a = anchorOf(f, pl, ref);
        // one icon where both ends of the relation meet (a Coincident between two end points)
        if (!a || drawn.some(function (q) { return Math.hypot(q[0] - a[0], q[1] - a[1]) < 4; })) return;
        drawn.push(a);
        var key = Math.round(a[0] / 6) + ',' + Math.round(a[1] / 6), c = !S.refPoint(f, ref) && S.refCurve(f, ref), kind = 'point', dir = null;
        if (c && c.kind === 'line') { var sa = scr(pl, c.a), sb = scr(pl, c.b), L = Math.hypot(sb[0] - sa[0], sb[1] - sa[1]); if (L > 1e-9) { kind = 'line'; dir = [(sb[0] - sa[0]) / L, (sb[1] - sa[1]) / L]; } }
        else if (c) { var sc0 = scr(pl, c.c), Lc = Math.hypot(a[0] - sc0[0], a[1] - sc0[1]); if (Lc > 1e-9) { kind = 'curve'; dir = [(a[0] - sc0[0]) / Lc, (a[1] - sc0[1]) / Lc]; } }
        var p = slots[key] = badgeSpot(h, a, kind, dir, slots[key]);
        var g = badge(layer, h, p[0], p[1], rel.type, (state !== 'ok' ? state : '') + (selected ? ' sel' : '') + (hot ? ' hot' : ''), S.describe(f, rel) + (state !== 'ok' ? ' (' + stateText(state) + ')' : ''));
        g.setAttribute('data-rel', i);
        g.addEventListener('click', function (ev) { ev.stopPropagation(); App.sel = { kind: 'rel', index: i }; App.dimsStale = true; UI.updateSketches(); UI.setStatus(S.describe(f, rel) + ' — ' + stateText(state) + '. Delete removes it.'); });
        // hovering an icon lights up the entities it relates (r5/sketch5)
        g.addEventListener('mouseenter', function () { hoverRelation(i, true); });
        g.addEventListener('mouseleave', function () { hoverRelation(i, false); });
        g.addEventListener('contextmenu', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          App.sel = { kind: 'rel', index: i }; App.dimsStale = true;
          UI.showMenu(ev.clientX, ev.clientY, [
            { label: 'Delete ' + S.TYPES[rel.type].name, key: 'Del', action: function () { deleteRelation(i); } },
            { label: 'Display/Delete Relations…', action: function () { cmdDisplayRelations(); } }
          ]);
        });
      });
    });
    // the entities of the relation hovered (an icon here, or a row of Display/Delete Relations): orange, as pre-highlight
    if (App.relHover != null && f.rels && f.rels[App.relHover]) relHighlight(f, pl, layer, h, f.rels[App.relHover]);
    if (App.tempRelDim) { var tsc = relDimScreenData(f, pl, App.tempRelDim); if (tsc) h.drawOne(tsc, { d: App.tempRelDim, temp: true }); }
    // (the yellow inference icons of what is being drawn sit by the cursor: ui-sketch.js drawFeedback)
    // Add Relations selection
    (App.relPick || []).forEach(function (ref) {
      var p = S.refPoint(f, ref), c = !p && S.refCurve(f, ref);
      if (p) { var s = scr(pl, p); h.svg('circle', { 'class': 'rel-pick', cx: s[0], cy: s[1], r: 5 }, layer); }
      else if (c && c.kind === 'line') { var a = scr(pl, c.a), b = scr(pl, c.b); h.svg('line', { 'class': 'rel-pick', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, layer); }
      else if (c) {
        var pts = [];
        for (var i = 0; i <= 48; i++) { var t = i / 48 * Math.PI * 2; pts.push(scr(pl, [c.c[0] + c.r * Math.cos(t), c.c[1] + c.r * Math.sin(t)]).join(',')); }
        h.svg('polyline', { 'class': 'rel-pick', points: pts.join(' ') }, layer);
      }
    });
  }
  function stateText(s) { return { ok: 'Satisfied', redundant: 'Over Defining (redundant)', conflict: 'Not Solved (conflict)', invalid: 'Dangling' }[s] || s; }
  // r5/sketch5: the relation under the mouse (an icon in the graphics area, a row of Display/Delete Relations) lights up
  // the entities / points it holds, without redrawing the sketch itself
  var HOT = 'stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none';
  function relHighlight(f, pl, layer, h, rel) {
    rel.refs.forEach(function (ref) {
      if (ref === 'O') { var o = scr(pl, [0, 0]); h.svg('circle', { 'class': 'rel-hot', cx: o[0], cy: o[1], r: 5, style: HOT }, layer); return; }
      var p = S.refPoint(f, ref);
      if (p) { var s = scr(pl, p); h.svg('circle', { 'class': 'rel-hot', cx: s[0], cy: s[1], r: 4.5, style: HOT + ';fill:#e8891c;fill-opacity:0.35' }, layer); return; }
      var c = S.refCurve(f, ref), e = f.entities[refEntity(ref)], pls;
      if (!c || !e) return;
      if (c.kind === 'line') pls = [{ pts: [c.a, c.b] }];
      else pls = K.entityPolylines(e);
      pls.forEach(function (l) {
        var pts = l.pts.map(function (q) { return scr(pl, q).map(function (v) { return Math.round(v * 10) / 10; }).join(','); });
        if (l.closed && pts.length) pts.push(pts[0]);
        h.svg('polyline', { 'class': 'rel-hot', points: pts.join(' '), style: HOT }, layer);
      });
    });
  }
  function hoverRelation(i, on) {
    var next = on ? i : (App.relHover === i ? null : App.relHover);
    if (next === App.relHover) return;
    App.relHover = next;
    if (UI.drawDims) { App.dimsStale = false; UI.drawDims(); } else App.dimsStale = true;
  }

  // ------------------------------------------------------------------ delete a relation
  function deleteRelation(index) {
    var f = UI.activeSketchFeature();
    if (!f || !f.rels || !f.rels[index]) return false;
    markDirty();
    var d = S.describe(f, f.rels[index]);
    S.deleteRelation(f, index);
    App.relHover = null;
    App.sel = null;
    refresh();
    UI.setStatus('Deleted ' + d + '.');
    return true;
  }

  // ------------------------------------------------------------------ Add Relations PropertyManager
  function cmdAddRelations() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    App.relPick = [];
    if (App.sel && App.sel.kind === 'entity' && f.entities[App.sel.index]) {
      var c = S.curveRefs(f, App.sel.index);
      App.relPick.push(c.length === 1 ? c[0] : String(App.sel.index));
      if (!S.refKind(f, App.relPick[0])) App.relPick = [];
    }
    UI.setTool('select');
    var spec = {
      title: 'Add Relations', icon: 'addRelation',
      message: 'Select sketch entities or points in the graphics area (click again to deselect), then click a relation to add.',
      command: { onSketchPoint: function (uv, mx, my) {
        var r = pickSketchRef(mx, my);
        if (!r) { UI.setStatus('Nothing there to select.'); return; }
        var i = App.relPick.indexOf(r);
        if (i >= 0) App.relPick.splice(i, 1); else App.relPick.push(r);
        render();
      } },
      groups: [],
      onOK: function () { App.relPick = null; App.dimsStale = true; },
      onCancel: function () { App.relPick = null; App.dimsStale = true; }
    };
    function render() {
      var picks = App.relPick || [], types = S.applicable(f, picks);
      var existing = (f.rels || []).map(function (rel, i) { return { rel: rel, i: i }; }).filter(function (x) {
        return picks.length && x.rel.refs.some(function (r) { return picks.some(function (p) { return refEntity(p) === refEntity(r) && refEntity(r) >= 0; }); });
      });
      spec.groups = [
        { title: 'Selected Entities', fields: [
          { type: 'html', html: '<div class="rel-list" id="rel-picks">' + (picks.length ? picks.map(function (r) { return '<div class="rel-row">' + S.refName(f, r) + '</div>'; }).join('') : '<div class="rel-empty">Nothing selected</div>') + '</div>' },
          { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function () { App.relPick = []; render(); } }] }
        ] },
        { title: 'Existing Relations', fields: [{ type: 'html', html: '<div class="rel-list">' + (existing.length ? existing.map(function (x) { return '<div class="rel-row">' + Icons(iconName(x.rel.type), 14) + ' ' + S.describe(f, x.rel) + '</div>'; }).join('') : '<div class="rel-empty">None</div>') + '</div>' }] },
        { title: 'Add Relations', fields: types.length ? [{ type: 'buttons', buttons: types.map(function (t) { return { label: S.TYPES[t].name, onclick: function () { add(t); } }; }) }] : [{ type: 'static', label: '', value: picks.length ? 'No relation applies to this selection.' : 'Select entities first.' }] }
      ];
      UI.openPM(spec);
      App.dimsStale = true;
    }
    function add(type) {
      var picks = (App.relPick || []).slice();
      markDirty();
      var r = S.addRelation(f, type, picks);
      if (!r.ok) { UI.toast(r.error); return; }
      App.relPick = [];
      refresh();
      if (r.status === 'conflict') UI.setStatus(S.TYPES[type].name + ' added, but the sketch cannot satisfy it' + (r.conflicts && r.conflicts.length ? ' (it conflicts with ' + r.conflicts.join('; ') + ')' : '') + ': Over Defined (red). Delete it in Display/Delete Relations.');
      else if (r.status === 'redundant') UI.setStatus(S.TYPES[type].name + ' added; it repeats what other relations already say: Over Defined (yellow).');
      else UI.setStatus(S.TYPES[type].name + ' added. ' + S.STATUS_TEXT[r.analysis.status] + (r.analysis.dof ? ' (' + r.analysis.dof + ' degrees of freedom left).' : '.'));
      render();
    }
    render();
    return spec;
  }

  // ------------------------------------------------------------------ Display/Delete Relations PropertyManager
  function cmdDisplayRelations(filter) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first: relations belong to a sketch.'); return; }
    var v = { filter: filter === 'selected' || filter === 'over' ? filter : 'all' };
    // r5/sketch5: clicking an entity in the graphics area shows its relations (filter Selected Entities); hovering a row
    // lights up what it relates; Delete / arrow keys work on the list; over-defining / unsolved relations and
    // dimensions are listed first and tinted, and every change updates the rows in place (no re-built panel)
    function done() { hoverRelation(App.relHover, false); App.relHover = null; App.dimsStale = true; }
    var spec = {
      title: 'Display/Delete Relations', icon: 'relations', values: v,
      groups: [],
      command: { onSketchPoint: function (uv, mx, my) {
        var hit = UI.pickEntity(mx, my);
        App.sel = hit ? { kind: 'entity', index: hit.index } : null;
        v.filter = hit ? 'selected' : 'all';
        UI.updateSketches();
        render();
      } },
      onChange: function () { if (!rendering) render(); },
      onOK: done, onCancel: done
    };
    function rows() {
      var an = App.sketchState || S.analyze(f), selEnt = App.sel && App.sel.kind === 'entity' ? App.sel.index : null;
      var out = (f.rels || []).map(function (rel, i) { return { rel: rel, i: i, state: an.rels[i] || 'ok' }; });
      // over-defining / unsolved Smart Dimensions are listed too (they can be deleted here)
      (f.dims || []).forEach(function (d, i) { var st = an.dims && an.dims[i]; if (st && st !== 'ok' && !d.driven) out.push({ dim: d, i: i, state: st }); });
      out = out.filter(function (x) {
        if (v.filter === 'over') return x.state !== 'ok';
        if (v.filter === 'selected') return selEnt != null && (x.dim ? x.dim.e === selEnt : x.rel.refs.some(function (r) { return refEntity(r) === selEnt; }));
        return true;
      });
      return out.filter(function (x) { return x.state !== 'ok'; }).concat(out.filter(function (x) { return x.state === 'ok'; }));
    }
    function rowKey(x) { return (x.dim ? 'd' : 'r') + x.i; }
    function selKey() { return App.sel && App.sel.kind === 'rel' ? 'r' + App.sel.index : App.sel && App.sel.kind === 'dim' ? 'd' + App.sel.index : ''; }
    function dimText(x) { var e = f.entities[x.dim.e], val = e ? K.dimValue(e, x.dim) : null; return 'Dimension ' + (val != null ? UI.fmtNum(val, 2) : '') + ' on ' + S.refName(f, String(x.dim.e)); }
    function selectRow(row) {
      var key = row.getAttribute('data-key');
      App.sel = { kind: key.charAt(0) === 'd' ? 'dim' : 'rel', index: +key.slice(1) };
      Array.prototype.forEach.call(row.parentNode.children, function (r) { r.classList.toggle('sel', r === row); });
      App.dimsStale = false; if (UI.drawDims) UI.drawDims();
      UI.setStatus(row.querySelector('span').textContent + ' — ' + row.querySelector('em').textContent + '. Delete removes it.');
    }
    function deleteSelected() {
      if (App.sel && App.sel.kind === 'rel') { App.relHover = null; deleteRelation(App.sel.index); }
      else if (App.sel && App.sel.kind === 'dim' && UI.deleteDim) { UI.deleteDim(App.sel.index); refresh(); }
      else { UI.toast('Select a relation in the list first.'); return; }
      render();
    }
    var rendering = false;
    function render() {
      rendering = true;
      try { renderNow(); } finally { rendering = false; }
    }
    function renderNow() {
      var list = rows(), an = App.sketchState || S.analyze(f), sk = selKey();
      spec.message = S.STATUS_TEXT[an.status] + ': ' + (f.rels ? f.rels.length : 0) + ' relation' + ((f.rels || []).length === 1 ? '' : 's') + ', ' + an.dof + ' degree' + (an.dof === 1 ? '' : 's') + ' of freedom' + (an.conflicts ? ', ' + an.conflicts + ' not solved' : '') + (an.redundant ? ', ' + an.redundant + ' over defining' : '') + '.';
      spec.messageOk = an.status === 'full';
      spec.groups = [
        { title: 'Relations', fields: [
          { type: 'select', label: 'Filter', key: 'filter', options: [['all', 'All in this sketch'], ['over', 'Overdefining/Not Solved'], ['selected', 'Selected Entities']] },
          { type: 'html', html: '<div class="rel-list" id="rel-display" role="listbox" aria-label="Relations">' + (list.length ? list.map(function (x) {
            var key = rowKey(x), icon = x.dim ? Icons('dim', 14) : Icons(iconName(x.rel.type), 14);
            return '<div class="rel-row ' + x.state + (key === sk ? ' sel' : '') + '" role="option" data-key="' + key + '"' + (x.dim ? '' : ' data-rel="' + x.i + '"') + ' tabindex="0">' + icon + '<span>' + (x.dim ? dimText(x) : S.describe(f, x.rel)) + '</span><em>' + stateText(x.state) + '</em></div>';
          }).join('') : '<div class="rel-empty">' + (v.filter === 'selected' && !(App.sel && App.sel.kind === 'entity') ? 'Click an entity in the graphics area' : 'No relations') + '</div>') + '</div>' },
          { type: 'buttons', buttons: [
            { label: 'Delete', onclick: deleteSelected },
            { label: 'Delete All', onclick: function () { if (!f.rels || !f.rels.length) return; markDirty(); var n = f.rels.length; delete f.rels; App.sel = null; App.relHover = null; refresh(); UI.setStatus('Deleted all ' + n + ' relations.'); render(); } }
          ] }
        ] }
      ];
      UI.openPM(spec);
      var box = $('rel-display');
      if (box) Array.prototype.forEach.call(box.querySelectorAll('.rel-row'), function (row) {
        var key = row.getAttribute('data-key'), ri = key.charAt(0) === 'r' ? +key.slice(1) : null;
        row.addEventListener('click', function () { selectRow(row); row.focus(); });
        row.addEventListener('mouseenter', function () { if (ri != null) hoverRelation(ri, true); });
        row.addEventListener('mouseleave', function () { if (ri != null) hoverRelation(ri, false); });
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); ev.stopPropagation(); selectRow(row); deleteSelected(); var first = $('rel-display') && $('rel-display').querySelector('.rel-row'); if (first) first.focus(); }
          else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); var nx = ev.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling; if (nx) { selectRow(nx); nx.focus(); } }
          else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); selectRow(row); }
        });
        row.addEventListener('focus', function () { if (ri != null) hoverRelation(ri, true); });
        row.addEventListener('blur', function () { if (ri != null) hoverRelation(ri, false); });
      });
    }
    render();
    return spec;
  }

  // ------------------------------------------------------------------ dragging sketch geometry
  // Pressing on an entity or point with the Select tool drags it; the solver keeps every relation and dimension, so
  // fully defined geometry stays put and under-defined geometry follows the mouse.
  function sketchDragHook(p) {
    if (App.mode !== 'sketch' || App.tool !== 'select' || App.command) return null;
    var f = UI.activeSketchFeature(), ref = pickSketchRef(p[0], p[1]);
    if (!f || !ref || ref === 'O') return null;
    var pl = UI.activePlane(), start = null, uv0 = null, point = !!S.refPoint(f, ref), moved = false;
    if (!point) ref = String(refEntity(ref));
    // grabbing a circle or an arc on its curve changes its radius (the centre point moves it), as in SolidWorks
    var ent = f.entities[refEntity(ref)], radius = !point && ent && (ent.t === 'circle' || ent.t === 'arc');
    // At most one solve per animation frame: the first move of a frame is solved at once (no added latency), later ones
    // in the same frame only replace the pending target, solved when the frame comes (or at once on release). While
    // dragging, the sketch is redrawn without re-analysing it (its degrees of freedom cannot change mid-drag).
    var pending = null, frame = 0, drop = null;
    // A dragged end point dropped on another sketch point (within 9 px) or on a line / circle / arc (within 7 px) snaps
    // there and gets a Coincident on release, as in SolidWorks. Points that sat with it when the drag began (already
    // coincident) move with it and are no targets.
    function dropTarget(q) {
      var e0 = refEntity(ref), P0 = S.refPoint({ entities: start }, ref), best = null, bd = 9;
      function excluded(i, pt0) { return i === e0 || (pt0 && P0 && Math.abs(pt0[0] - P0[0]) < 1e-9 && Math.abs(pt0[1] - P0[1]) < 1e-9); }
      f.entities.forEach(function (e, i) {
        S.pointRefs(f, i).forEach(function (pr) {
          if (/\.mid$/.test(pr.ref) || (/\.c$/.test(pr.ref) && CENTERLESS.test(e.t))) return;
          if (excluded(i, S.refPoint({ entities: start }, pr.ref))) return;
          var s = scr(pl, pr.pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]);
          if (d < bd) { bd = d; best = { ref: pr.ref, pt: pr.pt }; }
        });
      });
      var o = scr(pl, [0, 0]);
      if (!(P0 && Math.abs(P0[0]) < 1e-9 && Math.abs(P0[1]) < 1e-9) && Math.hypot(o[0] - q[0], o[1] - q[1]) < bd) best = { ref: 'O', pt: [0, 0] };
      if (best) return best;
      var uv = UI.screenToPlane(q[0], q[1], pl), hit = UI.pickEntity(q[0], q[1]);
      if (!uv || !hit || hit.index === e0) return null;
      var bc = null, bdc = 7;
      S.curveRefs(f, hit.index).forEach(function (cr) {
        var c = S.refCurve(f, cr), pt;
        if (!c) return;
        if (c.kind === 'line') {
          var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((uv[0] - c.a[0]) * dx + (uv[1] - c.a[1]) * dy) / L2));
          pt = [c.a[0] + dx * t, c.a[1] + dy * t];
        } else {
          var vx = uv[0] - c.c[0], vy = uv[1] - c.c[1], r = Math.hypot(vx, vy);
          if (r < 1e-12) return;
          pt = [c.c[0] + vx / r * c.r, c.c[1] + vy / r * c.r];
        }
        var s = scr(pl, pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]);
        if (d < bdc) { bdc = d; bc = { ref: cr, pt: pt, curve: true }; }
      });
      return bc;
    }
    function solveTo(q) {
      var uv = UI.screenToPlane(q[0], q[1], pl);
      if (!uv || !uv0) return;
      drop = point && (/\.(p\d|v\d+)$|^\d+$/.test(ref) || (/\.c$/.test(ref) && ent && /^(circle|arc)$/.test(ent.t))) ? dropTarget(q) : null;
      if (drop) uv = drop.pt.slice();
      var to = point || radius ? uv : [uv[0] - uv0[0], uv[1] - uv0[1]];
      if (S.drag(f, ref, to, start, { radius: radius }).ok) { moved = true; UI.updateSketches(); }
      if (UI.sketchSnapMark) UI.sketchSnapMark(drop ? drop.pt : null, q, drop && drop.curve, drop && /\.c$/.test(ref) && /\.c$/.test(drop.ref) ? 'concentric' : 'coincident');
    }
    // the next frame, or 50 ms when animation frames are throttled (a background tab), whichever comes first
    var timer = 0;
    function schedule() { frame = requestAnimationFrame(tick); timer = setTimeout(tick, 50); }
    function unschedule() { if (frame) cancelAnimationFrame(frame); if (timer) clearTimeout(timer); frame = timer = 0; }
    function tick() { unschedule(); if (pending) { var q = pending; pending = null; solveTo(q); schedule(); } }
    return {
      start: function () { markDirty(); start = clone(f.entities); uv0 = UI.screenToPlane(p[0], p[1], pl); App.sketchDragging = true; },
      move: function (q) {
        if (frame) { pending = q; return; }
        solveTo(q);
        schedule();
      },
      end: function () {
        unschedule();
        if (pending) { var q = pending; pending = null; solveTo(q); }
        App.sketchDragging = false;
        if (UI.sketchSnapMark) UI.sketchSnapMark(null);
        var merged = null;
        if (drop && moved) {
          // a circle / arc centre dropped on another circle / arc centre: Concentric (as SolidWorks merges them)
          var dropEnt = !/^O$/.test(drop.ref) && f.entities[refEntity(drop.ref)];
          var conc = /\.c$/.test(ref) && /\.c$/.test(drop.ref) && dropEnt && /^(circle|arc)$/.test(dropEnt.t);
          var r = conc ? S.addRelation(f, 'concentric', [ref.replace(/\.c$/, ''), drop.ref.replace(/\.c$/, '')], { rejectOver: true })
            : S.addRelation(f, 'coincident', [ref, drop.ref], { rejectOver: true });
          merged = r.ok ? (conc ? 'Concentric' : 'Coincident') + ' with ' + S.refName(f, drop.ref) + ' added. ' : null;
        }
        drop = null;
        UI.updateSketches();
        UI.refreshTree();
        var an = App.sketchState;
        if (merged) { UI.setStatus('Dragged ' + S.refName(f, ref) + '. ' + merged + (an ? S.STATUS_TEXT[an.status] + '.' : '')); return; }
        UI.setStatus(moved ?'Dragged ' + S.refName(f, ref) + '. ' + (an ? S.STATUS_TEXT[an.status] + (an.dof ? ' (' + an.dof + ' degrees of freedom)' : '') : '') : S.refName(f, ref) + ' is fully defined: it cannot be dragged.');
      }
    };
  }

  // ------------------------------------------------------------------ script / test hooks
  function activeOrThrow() { var f = UI.activeSketchFeature(); if (!f) throw new Error('No active sketch.'); return f; }
  UI.pickSketchRef = pickSketchRef;
  UI.relDimFor = relDimFor;
  UI.relDimPlacement = relDimPlacement;
  UI.placeRelDim = placeRelDim;
  UI.relDimScreen = function (f, index) { var rel = f && f.rels && f.rels[index]; var sc = rel && relDimScreenData(f, UI.activePlane(), rel); return sc ? { text: sc.text } : null; };
  UI.drawRelations = drawRelations;
  UI.deleteRelation = deleteRelation;
  UI.cmdAddRelations = cmdAddRelations;
  UI.cmdDisplayRelations = cmdDisplayRelations;
  UI.sketchDragHook = sketchDragHook;
  UI.askDrivenIfOver = askDrivenIfOver;
  UI.setDimDriven = function (kind, index, on) { var f = UI.activeSketchFeature(); return f ? setDriven(f, kind, index, on !== false) : null; };
  UI.drivenDimClick = drivenDimClick;
  UI.toggleConstruction = toggleConstruction;
  UI.cmdCenterline = cmdCenterline;
  // r5/sketch5: the FeatureManager marks a sketch as SolidWorks does: "(-) Sketch1" under defined, "(+) Sketch1" over
  // defined, nothing when fully defined (or when it has no geometry). The analysis is cached per sketch on its content,
  // so refreshing the tree costs a string compare per sketch; the active sketch uses the live App.sketchState.
  var defCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  UI.sketchTreePrefix = function (f) {
    if (!f || f.type !== 'sketch' || !f.entities || !f.entities.length) return '';
    var st = null;
    if (App.mode === 'sketch' && App.activeSketch === f.id && App.sketchState) st = App.sketchState.status;
    else {
      var key = JSON.stringify([f.entities, f.rels || null, f.dims || null]), c = defCache && defCache.get(f);
      if (c && c.key === key) st = c.st;
      else { try { st = S.analyze(f).status; } catch (e) { st = null; } if (defCache) defCache.set(f, { key: key, st: st }); }
    }
    return st === 'under' ? '(-) ' : st === 'over' ? '(+) ' : '';
  };
  // the tree row of the active sketch follows its state as soon as it changes (a dimension that fully defines it …)
  var lastTreeState = null, baseRefreshStatus = UI.refreshStatus;
  if (baseRefreshStatus) UI.refreshStatus = function () {
    var r = baseRefreshStatus.apply(this, arguments);
    var st = App.mode === 'sketch' && App.sketchState ? App.activeSketch + ':' + App.sketchState.status : null;
    if (st !== lastTreeState) { var had = lastTreeState != null; lastTreeState = st; if (had && st && UI.refreshTree) UI.refreshTree(); }
    return r;
  };
  UI.sketchStatus = function () {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    var an = S.analyze(f);
    return { status: an.status, text: S.STATUS_TEXT[an.status], dof: an.dof, entities: an.entities, rels: an.rels, dims: an.dims };
  };
  if (window.anvil) {
    // anvil.relations(): the active sketch's relations with their state; anvil.addRelation(type, refs, value?)
    window.anvil.relations = function () {
      var f = activeOrThrow(), an = S.analyze(f);
      return (f.rels || []).map(function (rel, i) { return { index: i, type: rel.type, refs: rel.refs.slice(), v: rel.v, state: an.rels[i], text: S.describe(f, rel) }; });
    };
    window.anvil.addRelation = function (type, refs, value) {
      var f = activeOrThrow();
      markDirty();
      var r = S.addRelation(f, type, refs, value != null ? { value: value } : {});
      refresh();
      if (!r.ok) throw new Error(r.error);
      return { rels: r.rels, status: r.status, sketch: S.STATUS_TEXT[r.analysis.status], dof: r.analysis.dof };
    };
    window.anvil.deleteRelation = function (i) { return deleteRelation(i); };
    window.anvil.sketchStatus = UI.sketchStatus;
    // anvil.construction(i | [i…]): toggle construction geometry; anvil.driven('dim' | 'rel', i, on?)
    window.anvil.construction = function (list) { activeOrThrow(); return toggleConstruction(Array.isArray(list) ? list : [list]); };
    window.anvil.driven = function (kind, index, on) { var f = activeOrThrow(), r = setDriven(f, kind, index, on !== false); if (!r.ok) throw new Error(r.error); return r.state; };
  }
})(UI);
