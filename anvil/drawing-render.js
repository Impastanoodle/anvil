// drawing-render.js — sheet primitives and writers for the drawing engine (Drawing, see drawing.js): compute works a
// drawing document out into paper primitives (border and title block, every view's linework, hatching, labels, cutting
// lines and detail circles, the Bill of Materials and balloons, dimensions placed clear of each other, cosmetic threads,
// annotations), with the lazy mode that leaves placeholders for views still being worked out in drawing-worker.js;
// dimension primitives in SolidWorks' ANSI style; the drawing text metrics (Century Gothic, capitals' height), line
// widths and colours; and the writers: toSVG / svgParts (one group per layer, patchable), toDXF (R12, one layer per
// view) and toPDF. Loads last of the engine files.
(function (D, _) {
  'use strict';
  var isOrthoFrame = D.isOrthoFrame, hatchStyle = D.hatchStyle, hatchPattern = D.hatchPattern, patternLines = D.patternLines, snapHatch = D.snapHatch;
  var scaleValue = D.scaleValue, scaleLabel = D.scaleLabel, sheetSize = D.sheetSize, TB_FIELDS = D.TB_FIELDS, titleBlock = D.titleBlock, autoDims = D.autoDims, dimText = D.dimText;
  var asmPartMaterials = D.asmPartMaterials, bomType = D.bomType, bomRows = D.bomRows, bomBox = D.bomBox, balloonSpots = D.balloonSpots;
  var dimLabel = D.dimLabel, numText = D.numText, styleKey = D.styleKey, setDimProps = D.setDimProps, STACK_DIRS = D.STACK_DIRS;
  var TWO_PI = _.TWO_PI, chainLines = _.chainLines, clipSeg = _.clipSeg, primHitsRect = _.primHitsRect, segOutsideRect = _.segOutsideRect;
  var MM = _.MM, paperK = _.paperK, viewScale = _.viewScale, BORDER = _.BORDER, TB_W = _.TB_W, TB_H = _.TB_H, HATCH = _.HATCH, BOM_TEXT = _.BOM_TEXT;
  var viewContent = _.viewContent, autoDimKey = _.autoDimKey, hasMaterials = _.hasMaterials, bomCell = _.bomCell;
  var refPos = _.refPos, reattachUserDim = _.reattachUserDim, partThreads = _.partThreads, threadsAlong = _.threadsAlong, annotationPrims = _.annotationPrims;

  // ------------------------------------------------------------------ sheet primitives
  // compute(doc, mesh, model, ctx?) -> { size: [W, H], units, prims: [...], views: [{ view, proj, box }], dims }
  // prims: { k: 'line', a, b, layer, style } | { k: 'circle', c, r, layer, style } | { k: 'text', p, h, text, anchor,
  // layer, rot } | { k: 'fill', pts, layer } | { k: 'arc', c, r, a0, a1, layer, style } | { k: 'ellipse', c, major,
  // ratio, t0, t1, full, layer, style } (ellipsePrim); styles: 'visible', 'hidden', 'thin', 'thick'. Paper coordinates, y up.
  // compute(doc, mesh, model, ctx): ctx.lazy (r12/drawui12) leaves the views whose projection is not cached yet as
  // placeholders (sheet.pending lists the projections to work out, see cachedProjection); their dimensions,
  // annotations and balloons wait for them, and model items wait for every view (so none lands on the wrong view).
  function compute(doc, mesh, model, ctx) {
    if (!ctx || !ctx.lazy) return computeSheet(doc, mesh, model, ctx);
    var prev = _.LAZY;
    _.LAZY = { mesh: mesh, missing: [], keys: {} };
    try { var r = computeSheet(doc, mesh, model, ctx); r.pending = _.LAZY.missing; return r; } finally { _.LAZY = prev; }
  }
  function computeSheet(doc, mesh, model, ctx) {
    ctx = ctx || {};
    var units = model.units === 'in' ? 'in' : 'mm', k = paperK(units);
    var S = sheetSize(doc, units), prims = [], chainSeq = 0;
    function line(a, b, layer, style) { prims.push({ k: 'line', a: a, b: b, layer: layer, style: style }); }
    // (h here is the font size the sheet was laid out with; the primitive keeps the capitals' height, r13/drawings13)
    function text(p, h, t, anchor, layer, rot) { prims.push({ k: 'text', p: p, h: h * CAP_EM, text: t, anchor: anchor || 'start', layer: layer, rot: rot || 0 }); }
    // border and title block
    var b0 = BORDER * k * 0.5, b1 = BORDER * k;
    rect([b1, b1], [S[0] - b1, S[1] - b1], 'SHEET', 'thick');
    void b0;
    var tw = TB_W * k, th = TB_H * k, tx0 = S[0] - b1 - tw, ty0 = b1, row = th / 3;
    rect([tx0, ty0], [S[0] - b1, ty0 + th], 'SHEET', 'thick');
    line([tx0, ty0 + row], [S[0] - b1, ty0 + row], 'SHEET', 'thin');
    line([tx0, ty0 + 2 * row], [S[0] - b1, ty0 + 2 * row], 'SHEET', 'thin');
    var lab = 2.2 * k, val = 3.5 * k, pad = 1.5 * k;
    // title block fields: each a text with $PRPSHEET:"name" (the model's custom property) / $PRP:"name" (the
    // drawing's) links, evaluated now; doc.titleBlock overrides a field's text
    var tb = titleBlock(doc, model, ctx), scale = doc.sheet.scale || [1, 1];
    var tbRect = { x0: tx0, y0: ty0, x1: S[0] - b1, y1: ty0 + th };
    var colX = {};
    TB_FIELDS.forEach(function (f) {
      var x0 = tx0 + f.x0 * k, x1 = tx0 + f.x1 * k, yTop = ty0 + th - f.row * row;
      if (f.x0 > 0 && !colX[f.row + ':' + f.x0]) { colX[f.row + ':' + f.x0] = 1; line([x0, yTop - row], [x0, yTop], 'SHEET', 'thin'); }
      var v = tb[f.key], h = f.big ? 5 * k : val, w = x1 - x0 - 2 * pad;
      if (v && textWidth(v, h * CAP_EM) > w) h = Math.max(1.6 * k, w / (String(v).length * 0.78 * CAP_EM));
      text([x0 + pad, yTop - pad - lab], lab, f.label, 'start', 'SHEET');
      if (v) text([x0 + pad, yTop - pad - lab - (f.big ? 6.5 : 4.5) * k], h, v, 'start', 'SHEET');
    });
    function rect(a, b, layer, style) { line([a[0], a[1]], [b[0], a[1]], layer, style); line([b[0], a[1]], [b[0], b[1]], layer, style); line([b[0], b[1]], [a[0], b[1]], layer, style); line([a[0], b[1]], [a[0], a[1]], layer, style); }

    // views: what each one shows (its content, in model units of its frame), then paper primitives
    doc.units = units;
    var projections = {}, views = [], contents = {}, byId = {};
    var layers = {};
    doc.views.forEach(function (v) { byId[v.id] = v; });
    function contentOf(v, depth) {
      if (contents[v.id]) return contents[v.id];
      var c = viewContent(doc, v, mesh, byId[v.parent] && (depth || 0) < 20 ? function (pv) { return contentOf(pv, (depth || 0) + 1); } : null);
      contents[v.id] = c;
      return c;
    }
    var hs = HATCH * k;
    // a part's cut faces are hatched with their body's material pattern (steel ANSI32, aluminium ANSI38, …) (r5/drawings5);
    // an assembly's with the material of the part each cut face belongs to (its part tag), at the angle hatchAssign
    // gave it so touching parts still differ (r13/drawings13: they were all ANSI31)
    var capPattern = function (cap) {
      if (!hasMaterials() || !model) return 'ANSI31';
      if (model.type === 'assembly') {
        var mats = asmPartMaterials(model, ctx.build || null);
        return hatchPattern(mats && cap.part != null ? mats[cap.part] : null);
      }
      var bm = Materials.bodyMaterial ? Materials.bodyMaterial(model, ctx.build || null, cap.body | 0) : null;
      return hatchPattern(bm && bm.name);
    };
    doc.views.forEach(function (v) {
      var ct = contentOf(v), pr = ct.proj;
      projections[v.id] = pr;
      var s = viewScale(doc, v), cu = ct.center[0], cv = ct.center[1], bd = pr.bounds;
      var toSheet = function (p) { return [v.x + (p[0] - cu) * s, v.y + (p[1] - cv) * s]; };
      var fromSheet = function (p) { return [(p[0] - v.x) / s + cu, (p[1] - v.y) / s + cv]; };
      var layer = layerName(v, layers);
      var clip = ct.clip ? { c: toSheet(ct.clip.c), r: ct.clip.r * s } : null;
      // cut faces first, so the outlines are drawn over the hatching
      var hatch = 0, hatches = [], rims = null;
      (ct.caps || []).forEach(function (cap) {
        var loops = cap.loops.map(function (l) { return l.map(toSheet); }), hst = cap.style || hatchStyle(cap.body), n0 = hatch, pat = capPattern(cap);
        // (hatch lines end on the drawn round edges, not on the facets' chords)
        if (!rims) {
          rims = [];
          [pr.circles.visible, pr.circles.hidden, pr.arcs && pr.arcs.visible, pr.arcs && pr.arcs.hidden].forEach(function (list) { (list || []).forEach(function (c) { rims.push({ c: toSheet(c.c), r: c.r * s }); }); });
        }
        snapHatch(patternLines(loops, hs * hst.spacing, hst.angle, pat), loops, rims).forEach(function (h) {
          var q = clip ? clipSeg(h, clip.c, clip.r) : h;
          if (q) { prims.push({ k: 'line', a: [q[0], q[1]], b: [q[2], q[3]], layer: layer, style: 'hatch', body: cap.body, part: cap.part }); hatch++; }
        });
        hatches.push({ body: cap.body, part: cap.part, angle: hst.angle, spacing: hs * hst.spacing, lines: hatch - n0, pattern: pat });
      });
      // straight pieces that run smoothly into each other (a curve drawn as chords) are one chain, written as one path
      // so a hidden curve's dashes run on along it instead of restarting at every chord (r4/drawings4)
      function chained(list, style) {
        var key = '_chains_' + style;
        if (!list[key]) Object.defineProperty(list, key, { value: chainLines(list, pr.bounds), enumerable: false });
        list[key].forEach(function (ch) {
          var cid = ch.length > 1 ? ++chainSeq : null;
          ch.forEach(function (l) { var q = { k: 'line', a: toSheet([l[0], l[1]]), b: toSheet([l[2], l[3]]), layer: layer, style: style }; if (cid) q.chain = cid; prims.push(q); });
        });
      }
      chained(pr.lines.visible, 'visible');
      pr.circles.visible.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'visible' }); });
      (pr.arcs ? pr.arcs.visible : []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: 'visible' }); });
      // tangent edges: thin solid (Tangent Edges Visible) or phantom (With Font); a detail view shows its parent's
      var tst = (v.kind === 'detail' && byId[v.parent] ? byId[v.parent].tangent : v.tangent) === 'font' ? 'tanfont' : 'tangent';
      if (pr.lines.tangent) chained(pr.lines.tangent, tst);
      (pr.circles.tangent || []).forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: tst }); });
      (pr.arcs && pr.arcs.tangent || []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: tst }); });
      (pr.ellipses && pr.ellipses.tangent || []).forEach(function (el) { prims.push(ellipsePrim(el, toSheet, s, layer, tst)); });
      chained(pr.lines.hidden, 'hidden');
      pr.circles.hidden.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'hidden' }); });
      (pr.arcs ? pr.arcs.hidden : []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: 'hidden' }); });
      ['visible', 'hidden'].forEach(function (st) { (pr.ellipses ? pr.ellipses[st] : []).forEach(function (el) { prims.push(ellipsePrim(el, toSheet, s, layer, st)); }); });
      var p0 = toSheet([bd.umin, bd.vmin]), p1 = toSheet([bd.umax, bd.vmax]);
      var box = { x0: p0[0], x1: p1[0], y0: p0[1], y1: p1[1] };
      // a view still being worked out (lazy compute): a placeholder over the paper it will take (svgParts, live only)
      if (pr.pending) prims.push({ k: 'pending', box: box, layer: layer });
      // (the view's label goes below its linework and below any detail circle drawn on it, r11/hatch11)
      var lb = box.y0;
      doc.views.forEach(function (dv) { if (dv.parent === v.id && dv.kind === 'detail' && dv.detail) lb = Math.min(lb, toSheet(dv.detail.c)[1] - dv.detail.r * s); });
      if (v.kind === 'section') {
        text([v.x, lb - 7 * k], 3.5 * k, 'SECTION ' + v.label + '-' + v.label, 'middle', layer);
        if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, lb - 12 * k], 3 * k, scaleLabel(v.scale), 'middle', layer);
      } else if (v.kind === 'detail') {
        text([(box.x0 + box.x1) / 2, lb - 7 * k], 3.5 * k, 'DETAIL ' + v.label, 'middle', layer);
        text([(box.x0 + box.x1) / 2, lb - 12 * k], 3 * k, scaleLabel(v.scale || scale), 'middle', layer);
      } else if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, lb - 6 * k], 3 * k, String(v.orient).toUpperCase() + '  ' + scaleLabel(v.scale), 'middle', layer);
      views.push({ view: v, proj: pr, box: box, layer: layer, toSheet: toSheet, fromSheet: fromSheet, scale: s, frame: ct.frame, ortho: isOrthoFrame(ct.frame),
        section: ct.section || null, hatch: hatch, hatches: hatches, clip: clip, content: ct, pending: !!pr.pending });
    });
    var pendingView = {}, anyPending = false;
    views.forEach(function (w) { if (w.pending) { pendingView[w.view.id] = 1; anyPending = true; } });
    // cutting lines and detail circles on the parents
    views.forEach(function (w) {
      var v = w.view, pw = views.filter(function (x) { return x.view.id === v.parent; })[0];
      if (!pw) return;
      var L = pw.layer, ar = 3 * k, aw = 0.9 * k;
      function arrow(tip, dir) {
        var n = [-dir[1], dir[0]];
        prims.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: L });
      }
      if (v.kind === 'section') {
        var sc = v.section, ext = 5 * k, shaft = 8 * k, lh = 5 * k, a, b, dv;
        if (sc.axis === 'h') {
          var y = pw.toSheet([0, sc.at])[1];
          a = [pw.box.x0 - ext, y]; b = [pw.box.x1 + ext, y]; dv = [0, -sc.sign];
        } else {
          var x = pw.toSheet([sc.at, 0])[0];
          a = [x, pw.box.y0 - ext]; b = [x, pw.box.y1 + ext]; dv = [-sc.sign, 0];
        }
        line(a, b, L, 'chain');
        [a, b].forEach(function (e0) {
          var tip = [e0[0] + dv[0] * shaft, e0[1] + dv[1] * shaft];
          line(e0, tip, L, 'thick'); arrow(tip, dv);
          var tp = [tip[0] + dv[0] * 2 * k, tip[1] + dv[1] * 2 * k - (dv[1] > 0 ? 0 : dv[1] < 0 ? lh : lh / 2)];
          if (dv[0]) tp[0] += dv[0] * 1 * k;
          text(tp, lh, v.label, 'middle', L);
        });
      } else if (v.kind === 'detail') {
        var dc = pw.toSheet(v.detail.c), r = v.detail.r * pw.scale;
        prims.push({ k: 'circle', c: dc, r: r, layer: L, style: 'thick' });
        // the letter goes just outside the circle where it covers the least of the parent's linework and hatching
        // (upper right first, then the other diagonals and sides), as SolidWorks keeps it readable (r11/hatch11)
        var lh2 = 5 * k, lw = textWidth(v.label, lh2 * CAP_EM), pad = 0.6 * k, bestP = null, bestN = Infinity;
        var own = prims.filter(function (p) { return p.layer === L || p.k === 'text'; });
        // (a clear spot 2 mm further out beats one on the hatching; with none clear, the least covered beside the circle)
        var clearP = null;
        [0, 2].forEach(function (ex) { [45, 135, -45, -135, 90, 0, 180, -90].forEach(function (deg) {
          if (clearP) return;
          var th = deg * Math.PI / 180, cx = Math.cos(th), cy = Math.sin(th);
          var dist = r + (1.5 + ex) * k + Math.abs(cx) * lw / 2 + Math.abs(cy) * lh2 / 2;
          var cen = [dc[0] + cx * dist, dc[1] + cy * dist], R = [cen[0] - lw / 2 - pad, cen[1] - lh2 / 2 - pad, cen[0] + lw / 2 + pad, cen[1] + lh2 / 2 + pad];
          var n = 0;
          own.forEach(function (p) { if (primHitsRect(p, p.k === 'text' ? [R[0] - 3 * k, R[1] - 3 * k, R[2] + 3 * k, R[3] + 3 * k] : R)) n += p.k === 'text' ? 10 : 1; });   // (by a label: worst, it would read as part of it)
          if (!n) clearP = cen;
          else if (!ex && n < bestN) { bestN = n; bestP = cen; }
        }); });
        bestP = clearP || bestP;
        text([bestP[0], bestP[1] - lh2 / 2], lh2, v.label, 'middle', L);
        // on hatching, the hatch stops round the letter (a clear island, as a hatch keeps text readable)
        if (!clearP) {
          var isl = [bestP[0] - lw / 2 - pad, bestP[1] - lh2 / 2 - pad, bestP[0] + lw / 2 + pad, bestP[1] + lh2 / 2 + pad];
          for (var pi = prims.length - 1; pi >= 0; pi--) {
            var hp = prims[pi];
            if (hp.k !== 'line' || hp.style !== 'hatch' || hp.layer !== L) continue;
            var parts = segOutsideRect(hp.a, hp.b, isl);
            if (!parts) continue;
            var rep = parts.map(function (ab) { var q2 = {}; for (var kk in hp) q2[kk] = hp[kk]; q2.a = ab[0]; q2.b = ab[1]; return q2; });
            Array.prototype.splice.apply(prims, [pi, 1].concat(rep));
            pw.hatch += rep.length - 1;
            var he = (pw.hatches || []).filter(function (h) { return h.body === hp.body && h.part === hp.part; })[0];
            if (he) he.lines += rep.length - 1;
          }
        }
      }
    });
    // Bill of Materials (assemblies): a table anchored to the sheet; balloons on the views that asked for them
    var rows = bomRows(model, mesh, doc.bom || null, { build: ctx.build }), bom = null, balloons = [];
    if (doc.bom) doc.bomRows = rows.length;
    if (rows.length && doc.bom && doc.bom.show !== false) {
      var bb = bomBox(doc, units, rows.length), th = BOM_TEXT * k, BL = 'BOM';
      rect([bb.x0, bb.y0], [bb.x1, bb.y1], BL, 'thick');
      for (var ri = 1; ri <= rows.length; ri++) line([bb.x0, bb.y1 - ri * bb.rowH], [bb.x1, bb.y1 - ri * bb.rowH], BL, 'thin');
      for (var ci = 1; ci < bb.cols.length - 1; ci++) line([bb.cols[ci], bb.y0], [bb.cols[ci], bb.y1], BL, 'thin');
      var cellText = function (rowIndex, col, t) {
        var al = bb.columns[col].align;
        var x = al === 'middle' ? (bb.cols[col] + bb.cols[col + 1]) / 2 : bb.cols[col] + 1.5 * k, y = bb.y1 - (rowIndex + 1) * bb.rowH + (bb.rowH - th) / 2;
        var maxCh = Math.floor((bb.cols[col + 1] - bb.cols[col] - 3 * k) / (th * CAP_EM * 0.78));
        t = t == null ? '' : String(t);
        if (t) text([x, y], th, t.length > maxCh ? t.slice(0, Math.max(1, maxCh - 3)) + '...' : t, al, BL);
      };
      bb.columns.forEach(function (c, i) { cellText(0, i, c.title); });
      var cells = rows.map(function (r) { return bb.columns.map(function (c) { return bomCell(r, c); }); });
      cells.forEach(function (cr, i) { cr.forEach(function (t, j) { cellText(i + 1, j, t); }); });
      bom = { rows: rows, box: bb, layer: BL, columns: bb.columns, cells: cells, type: bomType(doc.bom.type) };
    }
    // a part drawing without a Bill of Materials still numbers its manual balloons: the part is item 1
    var brows = rows;
    if (!brows.length && model.type !== 'assembly' && views.some(function (w) { return (w.view.balloons || []).length; })) {
      var nb = 0; mesh.faces.forEach(function (f) { nb = Math.max(nb, (f.body || 0) + 1); });
      brows = [{ item: 1, key: 'part', srcKey: 'part', qty: 1, components: [], indices: Array.apply(null, Array(Math.max(1, nb))).map(function (x, i) { return i; }) }];
    }
    views.forEach(function (w) {
      if (!(w.view.balloons || []).length || !brows.length || w.pending) return;
      var nb0 = prims.length;
      balloonSpots(w, brows, k).forEach(function (b) {
        var L = 'BALLOONS', d = [b.attach[0] - b.c[0], b.attach[1] - b.c[1]], Ln = Math.hypot(d[0], d[1]) || 1, u = [d[0] / Ln, d[1] / Ln];
        var start = [b.c[0] + u[0] * b.r, b.c[1] + u[1] * b.r];
        line(start, b.attach, L, 'thin');
        prims.push({ k: 'fill', pts: [b.attach, [b.attach[0] - u[0] * 3 * k + u[1] * ARROW_W * k, b.attach[1] - u[1] * 3 * k - u[0] * ARROW_W * k], [b.attach[0] - u[0] * 3 * k - u[1] * ARROW_W * k, b.attach[1] - u[1] * 3 * k + u[0] * ARROW_W * k]], layer: L });
        prims.push({ k: 'circle', c: b.c, r: b.r, layer: L, style: 'thin' });
        text([b.c[0], b.c[1] - 1.25 * k], 3.5 * k, String(b.item), 'middle', L);
        // Stacked balloons: the other items touch this one in the stack direction; QTY: "2X" beside the stack
        var sd = STACK_DIRS[b.stackDir] || STACK_DIRS.right, far = b.c;
        (b.stack || []).forEach(function (s, j) {
          var c2 = [b.c[0] + sd[0] * 2 * b.r * (j + 1), b.c[1] + sd[1] * 2 * b.r * (j + 1)];
          prims.push({ k: 'circle', c: c2, r: b.r, layer: L, style: 'thin' });
          text([c2[0], c2[1] - 1.25 * k], 3.5 * k, String(s.item), 'middle', L);
          far = c2;
        });
        if (b.qty) {
          var qp = b.qtyPos || 'right', qt = b.qtyText, g2 = 1.2 * k, qx = qp === 'left' ? Math.min(b.c[0], far[0]) - b.r - g2 : Math.max(b.c[0], far[0]) + b.r + g2;
          if (qp === 'up') text([(b.c[0] + far[0]) / 2, Math.max(b.c[1], far[1]) + b.r + g2], 3.5 * k, qt, 'middle', L);
          else if (qp === 'down') text([(b.c[0] + far[0]) / 2, Math.min(b.c[1], far[1]) - b.r - g2 - 3.5 * k], 3.5 * k, qt, 'middle', L);
          else text([qx, b.c[1] - 1.25 * k], 3.5 * k, qt, qp === 'left' ? 'end' : 'start', L);
        }
        b.view = w.view.id;
        balloons.push(b);
      });
      for (var pi = nb0; pi < prims.length; pi++) prims[pi].view = w.view.id;   // a dragged view takes them along
    });
    // dimensions
    var suppressed = doc.suppressed || [];
    // a model item's Dimension PropertyManager settings live in doc.dimProps under its style key (view:kind:n)
    var nth = {};
    var dims = doc.autoDims && !anyPending ? autoDims(doc, projections, units).filter(function (d) {
      d.key = autoDimKey(d);
      var sk = d.view + ':' + d.kind; nth[sk] = nth[sk] || 0; d.style = styleKey(d, nth[sk]++);
      var pp = doc.dimProps && doc.dimProps[d.style];
      if (pp) { setDimProps(d, pp); d.text = dimText(d, units); }
      return suppressed.indexOf(d.key) < 0;
    }) : [];
    doc.views.forEach(function (v) {
      if (pendingView[v.id]) return;
      (v.dims || []).forEach(function (d, i) {
        if (projections[v.id]) reattachUserDim(d, projections[v.id]);
        var c = JSON.parse(JSON.stringify(d)); c.view = v.id; c.index = i; c.text = dimText(c, units); dims.push(c);
      });
    });
    // annotations (centre marks, centrelines, hole callouts) are worked out first, so leader texts keep clear of them
    var threads = partThreads(model), annPre = {};
    views.forEach(function (w) { if (w.pending) return; (w.view.annotations || []).forEach(function (an, i) { annPre[w.view.id + ':' + i] = annotationPrims(an, w, k, mesh, doc, units, threads); }); });
    var placed = [], shown = [];
    // what a leader's text must keep clear of: the drawn geometry of every view (it may sit on empty paper inside its
    // own view, beside the hole it names), the other views, the title block, the BOM, and every dimension placed before
    var geo = { segs: [], circles: [] }, viewLayers = {};
    views.forEach(function (w) { viewLayers[w.layer] = 1; });
    prims.forEach(function (p) {
      if (!viewLayers[p.layer]) return;
      if (p.k === 'line') geo.segs.push([p.a, p.b]);
      else if (p.k === 'circle') geo.circles.push(p);
      else if (p.k === 'arc' || p.k === 'ellipse') {
        var n = 24, prev = null;
        for (var i = 0; i <= n; i++) {
          var q;
          if (p.k === 'arc') { var sp = ((p.a1 - p.a0) % 360 + 360) % 360 || 360, a = (p.a0 + sp * i / n) * Math.PI / 180; q = [p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)]; }
          else q = ellipseAt(p, p.t0 + (p.t1 - p.t0) * i / n).p;
          if (prev) geo.segs.push([prev, q]);
          prev = q;
        }
      }
    });
    var obs = { texts: [], segs: [], geo: geo, boxes: views.map(function (w) { return { box: w.box, view: w.view.id }; }).concat([{ box: tbRect }]),
      sheet: { x0: b1, y0: b1, x1: S[0] - b1, y1: S[1] - b1 } };
    if (bom) obs.boxes.push({ box: bom.box });
    Object.keys(annPre).forEach(function (key) { annPre[key].prims.forEach(function (x) { if (x.k === 'line') geo.segs.push([x.a, x.b]); else if (x.k === 'text') obs.texts.push(textRect(x)); }); });
    dims.forEach(function (d) {
      var vw = views.filter(function (w) { return w.view.id === d.view; })[0];
      if (!vw) return;
      var p = placeDim(d, vw, k, placed, obs), pg = primGeo(p);
      obs.texts = obs.texts.concat(pg.texts); obs.segs = obs.segs.concat(pg.segs);
      if (d.dangling) p.forEach(function (x) { x.color = 'dangling'; });
      var bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      function grow(q) { bx.x0 = Math.min(bx.x0, q[0]); bx.x1 = Math.max(bx.x1, q[0]); bx.y0 = Math.min(bx.y0, q[1]); bx.y1 = Math.max(bx.y1, q[1]); }
      // the arrow tips (clicked to flip the arrows) and the text's rectangle (edited in place), r4/drawings4
      d.arrows = []; d.tbox = null;
      p.forEach(function (x) {
        x.view = d.view;
        prims.push(x);
        if (x.k === 'fill') d.arrows.push(x.pts[0]);
        if (x.k === 'text') { var tr0 = textRect(x); d.tbox = d.tbox ? { x0: Math.min(d.tbox.x0, tr0.x0), y0: Math.min(d.tbox.y0, tr0.y0), x1: Math.max(d.tbox.x1, tr0.x1), y1: Math.max(d.tbox.y1, tr0.y1) } : tr0; }
        if (x.a) { grow(x.a); grow(x.b); }
        if (x.k === 'text') { var w = textWidth(x.text, x.h), vert = Math.abs(x.rot) > 45; grow(x.p); grow(vert ? [x.p[0] - x.h, x.p[1] + w / 2] : [x.p[0] + w, x.p[1] + x.h]); if (vert) grow([x.p[0], x.p[1] - w / 2]); else if (x.anchor === 'middle') grow([x.p[0] - w / 2, x.p[1]]); }
      });
      d.box = bx;
      placed.push(d); shown.push(d);
    });
    dims = shown;
    // cosmetic threads (holewizard.js Straight Tap holes): a dashed circle at the major diameter in views along the axis
    views.forEach(function (w) {
      if (!w.ortho || w.section || w.clip || w.pending) return;
      threadsAlong(threads, w.frame).forEach(function (t) { prims.push({ k: 'circle', c: w.toSheet(t.c), r: t.r * w.scale, layer: w.layer, style: 'hidden', thread: t.label }); });
    });
    // annotations: centre marks, centrelines, hole callouts
    var annotations = [];
    views.forEach(function (w) {
      if (w.pending) return;
      (w.view.annotations || []).forEach(function (an, i) {
        var r = annPre[w.view.id + ':' + i], bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        function grow(q) { bx.x0 = Math.min(bx.x0, q[0]); bx.x1 = Math.max(bx.x1, q[0]); bx.y0 = Math.min(bx.y0, q[1]); bx.y1 = Math.max(bx.y1, q[1]); }
        r.prims.forEach(function (x) {
          x.view = w.view.id;
          prims.push(x);
          if (x.a) { grow(x.a); grow(x.b); }
          if (x.k === 'circle') { grow([x.c[0] - x.r, x.c[1] - x.r]); grow([x.c[0] + x.r, x.c[1] + x.r]); }
          if (x.k === 'text') { var tw = textWidth(x.text, x.h); grow(x.p); grow([x.p[0] + (x.anchor === 'end' ? -tw : tw), x.p[1] + x.h]); }
        });
        annotations.push({ id: an.id, view: w.view.id, index: i, type: an.type, style: an.style || null, auto: !!an.auto, text: r.text, dangling: r.dangling, box: bx, info: r.info });
      });
    });
    return { size: S, units: units, prims: prims, views: views, dims: dims, projections: projections, scale: scale, bom: bom, balloons: balloons, annotations: annotations };
  }
  function layerName(v, used) {
    var base = v.kind === 'section' ? 'SECTION_' + v.label : v.kind === 'detail' ? 'DETAIL_' + v.label : String(v.orient).toUpperCase(), name = base, n = 2;
    while (used[name]) name = base + '_' + n++;
    used[name] = true;
    return name;
  }
  // Paper-space primitives of one dimension. Linear dimensions stack outward from the view box (10 mm, then 8 mm
  // steps) so two on the same side do not overlap; diameters get a 45° leader with the arrow on the circle.
  // Dimension properties: at (the dimension line, model units across it), tx (text slid along the line, paper),
  // lead (a leader's elbow from the circle centre / chamfer, paper), off (an aligned dimension's offset), flip
  // (arrows outside), tol / prec / label (dimLabel). The effective values are written back (lineAt, leadNow, offNow)
  // for dragging.
  // placements an automatically placed radius / diameter tries in turn, first clear one wins (placeDim):
  // radius [fraction along the arc, leader length mm]; diameter [turn of the leader degrees, leader length mm, 1]: a
  // short leader with the text beside the circle (on empty paper, inside the view if need be), then [turn, extra run
  // mm]: the leader runs out past the view outline
  var ALT_RAD = [[0.5, 8], [0.5, 16], [0.25, 8], [0.75, 8], [0.25, 16], [0.75, 16], [0.1, 12], [0.9, 12], [0.5, 26], [0.25, 26], [0.75, 26]];
  var ALT_DIA = [[0, 5, 1], [0, 10, 1], [30, 5, 1], [-30, 5, 1], [60, 6, 1], [-60, 6, 1], [90, 6, 1], [-90, 6, 1], [180, 6, 1], [135, 6, 1], [-135, 6, 1],
    [0, 0], [0, 8], [20, 0], [-20, 0], [20, 8], [-20, 8], [40, 0], [-40, 0], [0, 16], [40, 10], [-40, 10]];
  // the paper rectangle a text primitive covers
  function textRect(x) {
    var w = textWidth(x.text, x.h), vert = Math.abs(x.rot || 0) > 45, r = { x0: x.p[0], y0: x.p[1], x1: x.p[0], y1: x.p[1] };
    function g(q) { r.x0 = Math.min(r.x0, q[0]); r.x1 = Math.max(r.x1, q[0]); r.y0 = Math.min(r.y0, q[1]); r.y1 = Math.max(r.y1, q[1]); }
    if (vert) { g([x.p[0] - x.h, x.p[1] - w / 2]); g([x.p[0], x.p[1] + w / 2]); }
    else { var s = x.anchor === 'middle' ? -w / 2 : x.anchor === 'end' ? -w : 0; g([x.p[0] + s, x.p[1]]); g([x.p[0] + s + w, x.p[1] + x.h]); }
    return r;
  }
  function rectsMeet(a, b, m) { return a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m; }
  function segHitsRect(a, b, r) {
    var t0 = 0, t1 = 1, dx = b[0] - a[0], dy = b[1] - a[1];
    var ps = [-dx, dx, -dy, dy], qs = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(ps[i]) < 1e-15) { if (qs[i] < 0) return false; continue; }
      var t = qs[i] / ps[i];
      if (ps[i] < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
      if (t0 > t1) return false;
    }
    return true;
  }
  // texts and lines of a dimension's primitives
  function primGeo(p) {
    var g = { texts: [], segs: [] };
    p.forEach(function (x) { if (x.k === 'text') g.texts.push(textRect(x)); else if (x.k === 'line') g.segs.push([x.a, x.b]); });
    return g;
  }
  // how badly a dimension's geometry g collides with what is on the sheet already (obs: { texts, segs, geo: { segs,
  // circles } (the views' drawn geometry), boxes: [{ box, view }], sheet }); own: the dimension's view, whose empty
  // paper its text may use
  function clashCost(g, obs, k, own) {
    var c = 0, m = 0.8 * k;
    g.texts.forEach(function (t) {
      var tm = { x0: t.x0 - m / 2, y0: t.y0 - m / 2, x1: t.x1 + m / 2, y1: t.y1 + m / 2 };
      obs.texts.forEach(function (o) { if (rectsMeet(t, o, m)) c += 10; });
      obs.segs.forEach(function (s) { if (segHitsRect(s[0], s[1], tm)) c += 3; });
      obs.boxes.forEach(function (b) { if ((b.view == null || b.view !== own) && rectsMeet(t, b.box, 0)) c += 6; });
      if (obs.geo) {
        obs.geo.segs.forEach(function (s) { if (segHitsRect(s[0], s[1], tm)) c += 4; });
        obs.geo.circles.forEach(function (ci) {
          // the outline crosses the rectangle: its nearest point inside the circle, its farthest outside
          var nx = Math.max(tm.x0, Math.min(ci.c[0], tm.x1)), ny = Math.max(tm.y0, Math.min(ci.c[1], tm.y1));
          var fx = Math.max(Math.abs(tm.x0 - ci.c[0]), Math.abs(tm.x1 - ci.c[0])), fy = Math.max(Math.abs(tm.y0 - ci.c[1]), Math.abs(tm.y1 - ci.c[1]));
          if (Math.hypot(nx - ci.c[0], ny - ci.c[1]) <= ci.r && Math.hypot(fx, fy) >= ci.r) c += 4;
        });
      }
      if (obs.sheet && (t.x0 < obs.sheet.x0 || t.y0 < obs.sheet.y0 || t.x1 > obs.sheet.x1 || t.y1 > obs.sheet.y1)) c += 20;
    });
    g.segs.forEach(function (s) { obs.texts.forEach(function (o) { if (segHitsRect(s[0], s[1], o)) c += 3; }); });
    return c;
  }
  // dimPrims for a dimension, an unplaced radius / diameter (no dragged leader) trying ALT_* until it is clear
  function placeDim(d, vw, k, placed, obs) {
    if ((d.kind !== 'rad' && d.kind !== 'dia') || d.lead || !obs) return dimPrims(d, vw, k, placed);
    var alts = d.kind === 'rad' ? ALT_RAD : ALT_DIA, best = 0, bestCost = Infinity;
    for (var i = 0; i < alts.length; i++) {
      d._alt = i;
      var c = clashCost(primGeo(dimPrims(d, vw, k, placed)), obs, k, d.view);
      if (c < bestCost) { best = i; bestCost = c; }
      if (c === 0) break;
    }
    d._alt = best;
    var p = dimPrims(d, vw, k, placed);
    delete d._alt;
    return p;
  }
  function dimPrims(d, vw, k, placed) {
    var out = [], L = 'DIMENSIONS', th = 3.5 * k, ar = 3 * k, aw = ARROW_W * k, units = k === 1 ? 'mm' : 'in';
    function line(a, b) { out.push({ k: 'line', a: a, b: b, layer: L, style: 'thin' }); }
    function arrow(tip, dir) {
      var n = [-dir[1], dir[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: L });
    }
    // the dimension text at p (anchor, rotation): one text, or the value with its tolerance stacked beside it
    function label(p, anchor, rot, lab) {
      if (lab.upper == null) { out.push({ k: 'text', p: p, h: th, text: lab.main, anchor: anchor, layer: L, rot: rot }); return; }
      var a = rot * Math.PI / 180, t = [Math.cos(a), Math.sin(a)], n = [-t[1], t[0]], th2 = lab.main == null ? th * 0.8 : th * 0.7;
      var wm = lab.main == null ? 0 : textWidth(lab.main, th), gp = lab.main == null ? 0 : th * 0.4, wt = Math.max(textWidth(lab.upper, th2), textWidth(lab.lower, th2));
      var W = wm + gp + wt, s0 = anchor === 'middle' ? -W / 2 : anchor === 'end' ? -W : 0;
      function at(al, up) { return [p[0] + t[0] * al + n[0] * up, p[1] + t[1] * al + n[1] * up]; }
      if (lab.main != null) out.push({ k: 'text', p: at(s0, 0), h: th, text: lab.main, anchor: 'start', layer: L, rot: rot });
      var up = lab.main == null ? th * 0.55 : th * 0.55, dn = lab.main == null ? -th * 0.45 : -th * 0.2;
      out.push({ k: 'text', p: at(s0 + wm + gp, up), h: th2, text: lab.upper, anchor: 'start', layer: L, rot: rot, tol: 'upper' });
      out.push({ k: 'text', p: at(s0 + wm + gp, dn), h: th2, text: lab.lower, anchor: 'start', layer: L, rot: rot, tol: 'lower' });
    }
    var box = vw.box, labMain = d.tol || d.prec != null || d.label != null || d.kind === 'chamfer' ? dimLabel(d, units) : { main: d.text, upper: null, lower: null };
    // a straight leader from `tip` (arrow) to `elbow`, then (ANSI, r13/drawings13) a short horizontal shoulder with the
    // text after it, centred on it (the text used to sit on a shelf as long as itself, the ISO way)
    function leader(tip, elbow, lab, arrowDir) {
      var sgn = elbow[0] >= tip[0] - 1e-9 ? 1 : -1;
      line(tip, elbow); line(elbow, [elbow[0] + sgn * SHOULDER * k, elbow[1]]); arrow(tip, arrowDir);
      label([elbow[0] + sgn * (SHOULDER + TEXT_GAP) * k, elbow[1] - th / 2], sgn > 0 ? 'start' : 'end', 0, lab);
    }
    // the length of a label along its text line
    function labWidth(lab) {
      if (lab.upper == null) return textWidth(lab.main || '', th);
      var th2 = lab.main == null ? th * 0.8 : th * 0.7;
      return (lab.main == null ? 0 : textWidth(lab.main, th) + th * 0.4) + Math.max(textWidth(lab.upper, th2), textWidth(lab.lower, th2));
    }
    if (d.kind === 'rad') {
      // a radius: the leader leaves the arc at its middle, straight out from the centre; arrow on the arc
      // (an unplaced one tries other points along the arc and longer leaders until it is clear of the others: d._alt)
      var ralt = ALT_RAD[d._alt || 0] || ALT_RAD[0], ra0 = d.a0 || 0, ra1 = d.a1 != null ? d.a1 : 360;
      var rc = vw.toSheet(d.c), rr = d.r * vw.scale, am = (ra0 + (ra1 - ra0) * ralt[0]) * Math.PI / 180, ru;
      if (d.lead) { var rl = Math.hypot(d.lead[0], d.lead[1]) || 1; ru = [d.lead[0] / rl, d.lead[1] / rl]; }
      else ru = [Math.cos(am), Math.sin(am)];
      var rtip = [rc[0] + ru[0] * rr, rc[1] + ru[1] * rr], rel = d.lead ? [rc[0] + d.lead[0], rc[1] + d.lead[1]] : [rtip[0] + ru[0] * ralt[1] * k, rtip[1] + ru[1] * ralt[1] * k];
      leader(rtip, rel, labMain, [-ru[0], -ru[1]]);
      d.leadNow = [rel[0] - rc[0], rel[1] - rc[1]];
      return out;
    }
    if (d.kind === 'dia') {
      // leaders of one view fan out (45°, 135°, -45°, -135°, …) and run past the view outline so concentric callouts
      // do not cross each other; the shelf points away from the view
      var nth = placed.filter(function (p) { return p.view === d.view && p.kind === 'dia'; }).length;
      var c = vw.toSheet(d.c), r = d.r * vw.scale, mid = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var off = [c[0] - mid[0], c[1] - mid[1]], offL = Math.hypot(off[0], off[1]), u, elbow, conc = 0;
      if (d.lead) {
        var ll = Math.hypot(d.lead[0], d.lead[1]) || 1;
        u = [d.lead[0] / ll, d.lead[1] / ll]; elbow = [c[0] + d.lead[0], c[1] + d.lead[1]];
      } else {
        if (offL > r * 0.5) {
          // an off-centre circle: straight out from the view; concentric ones (a counterbore) fan upward 60°, 80°
          // (hole callouts leave at 35°, between them)
          u = [off[0] / offL, off[1] / offL];
          conc = placed.filter(function (p) { return p.view === d.view && p.kind === 'dia' && Math.hypot(p.c[0] - d.c[0], p.c[1] - d.c[1]) <= 1e-9 * (1 + Math.abs(d.c[0]) + Math.abs(d.c[1])); }).length;
          if (conc) { var fa = (u[0] >= 0 ? 1 : -1) * [60, 80, -35, -60][(conc - 1) % 4] * Math.PI / 180; u = [u[0] * Math.cos(fa) - u[1] * Math.sin(fa), u[0] * Math.sin(fa) + u[1] * Math.cos(fa)]; }
        }
        else { var ang = [45, 135, -45, -135, 70, 110, -70, -110][nth % 8] * Math.PI / 180; u = [Math.cos(ang), Math.sin(ang)]; }
        // an unplaced one that would cover another dimension turns and / or runs further (d._alt)
        var dalt = ALT_DIA[d._alt || 0] || ALT_DIA[0];
        if (dalt[0]) { var ra = dalt[0] * Math.PI / 180; u = [u[0] * Math.cos(ra) - u[1] * Math.sin(ra), u[0] * Math.sin(ra) + u[1] * Math.cos(ra)]; }
        var tip0 = [c[0] + u[0] * r, c[1] + u[1] * r];
        if (dalt[2]) elbow = [tip0[0] + u[0] * dalt[1] * k, tip0[1] + u[1] * dalt[1] * k];   // short, beside the circle
        else {
          // run from the tip past the view outline (6 mm), and past the overall-dimension lanes on the left and below
          var tx = Math.abs(u[0]) < 1e-9 ? Infinity : u[0] > 0 ? (box.x1 - tip0[0]) / u[0] : (box.x0 - tip0[0]) / u[0];
          var ty = Math.abs(u[1]) < 1e-9 ? Infinity : u[1] > 0 ? (box.y1 - tip0[1]) / u[1] : (box.y0 - tip0[1]) / u[1];
          var run = Math.max(0, Math.min(tx, ty)) + (6 + 4 * Math.floor(nth / 4) + dalt[1]) * k;
          if (u[0] < -0.2 && !conc) run = Math.max(run, (box.x0 - 24 * k - tip0[0]) / u[0]);
          if (u[1] < -0.2 && !conc) run = Math.max(run, (box.y0 - 24 * k - tip0[1]) / u[1]);
          elbow = [tip0[0] + u[0] * run, tip0[1] + u[1] * run];
        }
      }
      // flipped: the leader crosses the circle and the arrow meets the far side from inside
      var tip = d.flip ? [c[0] - u[0] * r, c[1] - u[1] * r] : [c[0] + u[0] * r, c[1] + u[1] * r];
      var sgd = (d.lead ? d.lead[0] : u[0]) >= 0 ? 1 : -1;
      line(tip, elbow); line(elbow, [elbow[0] + sgd * SHOULDER * k, elbow[1]]); arrow(tip, [-u[0], -u[1]]);
      label([elbow[0] + sgd * (SHOULDER + TEXT_GAP) * k, elbow[1] - th / 2], sgd > 0 ? 'start' : 'end', 0, labMain);
      d.leadNow = [elbow[0] - c[0], elbow[1] - c[1]];
      return out;
    }
    if (d.kind === 'chamfer') {
      var A = vw.toSheet(d.a), B = vw.toSheet(d.b), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], cc = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var lead = d.lead || [(m[0] >= cc[0] ? 1 : -1) * 10 * k, (m[1] >= cc[1] ? 1 : -1) * 10 * k], el = [m[0] + lead[0], m[1] + lead[1]], lu = Math.hypot(lead[0], lead[1]) || 1;
      leader(m, el, labMain, [-lead[0] / lu, -lead[1] / lu]);
      d.leadNow = lead.slice();
      return out;
    }
    var gapE = 1.5 * k, ext = 2 * k;
    // a linear dimension between sheet points a and b, horizontal (hz) or vertical, its dimension line at pos
    // ANSI (SolidWorks' default for the ANSI standard, r13/drawings13): the text is horizontal (vertical dimensions
    // too), centred on the dimension line in a break of it. When text and arrows do not fit between the extension
    // lines, the arrows go outside and the text beyond them, the dimension line running on to it; the text dragged
    // outside (tx) takes the line along the same way. d.txNow: where the text is, from the middle (dragging starts there).
    function linear(a, b, hz, pos, lab, tx) {
      var i0 = hz ? 0 : 1, i1 = hz ? 1 : 0, sg = pos < a[i1] ? -1 : 1;
      function P(along, across) { var q = [0, 0]; q[i0] = along; q[i1] = across; return q; }
      line(P(a[i0], a[i1] + sg * gapE), P(a[i0], pos + sg * ext)); line(P(b[i0], b[i1] + sg * gapE), P(b[i0], pos + sg * ext));
      var lo = Math.min(a[i0], b[i0]), hi = Math.max(a[i0], b[i0]), xo = ar + 4 * k, g = TEXT_GAP * k;
      var half = (hz ? labWidth(lab) / 2 : (lab.upper != null ? 0.75 : 0.5) * th) + g, mid = (lo + hi) / 2;
      var fits = hi - lo >= 2 * half + 2 * ar + g, out = !!d.flip || !fits;
      var c = mid + (tx || 0);
      if (tx == null && !fits) c = hi + xo + half;   // beyond the far arrow
      var inside = c - half >= lo - 1e-9 && c + half <= hi + 1e-9;
      var l0 = out ? lo - xo : lo, l1 = out ? hi + xo : hi;
      if (inside) { if (c - half > l0) line(P(l0, pos), P(c - half, pos)); if (c + half < l1) line(P(c + half, pos), P(l1, pos)); }
      else if (c > mid) line(P(l0, pos), P(Math.max(l1, c - half), pos));
      else line(P(Math.min(l0, c + half), pos), P(l1, pos));
      if (out) { arrow(P(lo, pos), P(1, 0)); arrow(P(hi, pos), P(-1, 0)); } else { arrow(P(lo, pos), P(-1, 0)); arrow(P(hi, pos), P(1, 0)); }
      d.txNow = c - mid;
      if (hz) label([c, pos - th / 2], 'middle', 0, lab);
      else label([pos, c - th / 2], 'middle', 0, lab);
    }
    if (d.kind === 'ordinate' || d.kind === 'baseline') {
      var hz2 = d.dir !== 'v', ax = hz2 ? 0 : 1, items = [{ ref: d.base, val: 0 }].concat(d.refs.map(function (r2, i) { return { ref: r2, val: (d.values || [])[i] || 0 }; }));
      var side = d.side || 1, sp = function (ref) { return ref.kind === 'dia' ? vw.toSheet(ref.c) : null; };
      // the feature point of a reference: a circle centre, or the end of an edge nearest the dimension side
      items.forEach(function (it) {
        var q = sp(it.ref);
        if (!q) { var e0 = vw.toSheet(it.ref.a), e1 = vw.toSheet(it.ref.b); q = (e0[1 - ax] - e1[1 - ax]) * side > 0 ? e0 : e1; if (Math.abs(e0[1 - ax] - e1[1 - ax]) < 1e-9) q = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2]; q[ax] = vw.toSheet(ax ? [0, refPos(it.ref, 1)] : [refPos(it.ref, 0), 0])[ax]; }
        it.p = q;
      });
      var lvl = d.at != null ? vw.toSheet(hz2 ? [0, d.at] : [d.at, 0])[1 - ax] : (hz2 ? (side > 0 ? box.y1 : box.y0) : (side > 0 ? box.x1 : box.x0)) + side * 10 * k;
      d.lineAt = hz2 ? vw.fromSheet([0, lvl])[1] : vw.fromSheet([lvl, 0])[0];
      var prec = d.prec != null && d.prec !== '' ? +d.prec : null;
      if (d.kind === 'ordinate') {
        // texts on one line across the dimension direction; crowded ones jog sideways
        var sorted = items.slice().sort(function (p, q) { return p.p[ax] - q.p[ax]; }), minGap = th * 1.4;
        sorted.forEach(function (it, i) { it.t = it.p[ax]; if (i && it.t < sorted[i - 1].t + minGap) it.t = sorted[i - 1].t + minGap; });
        var shift = (sorted[0].p[ax] + sorted[sorted.length - 1].p[ax] - sorted[0].t - sorted[sorted.length - 1].t) / 2;
        if (shift < 0) sorted.forEach(function (it) { it.t += shift; });
        sorted.forEach(function (it) {
          function Q(along, across) { var q = [0, 0]; q[ax] = along; q[1 - ax] = across; return q; }
          var from = it.p[1 - ax] + (lvl > it.p[1 - ax] ? 1 : -1) * gapE, sgl = lvl > it.p[1 - ax] ? 1 : -1;
          if (Math.abs(it.t - it.p[ax]) < 1e-9) line(Q(it.p[ax], from), Q(it.p[ax], lvl));
          else { line(Q(it.p[ax], from), Q(it.p[ax], lvl - sgl * 4 * k)); line(Q(it.p[ax], lvl - sgl * 4 * k), Q(it.t, lvl - sgl * 2 * k)); line(Q(it.t, lvl - sgl * 2 * k), Q(it.t, lvl)); }
          var tt = numText(Math.abs(it.val), units, prec);
          if (hz2) out.push({ k: 'text', p: [it.t + th / 2, lvl + sgl * 1 * k], h: th, text: tt, anchor: sgl > 0 ? 'start' : 'end', layer: L, rot: 90 });
          else out.push({ k: 'text', p: [lvl + sgl * 1 * k, it.t - th / 2], h: th, text: tt, anchor: sgl > 0 ? 'start' : 'end', layer: L, rot: 0 });
        });
      } else {
        // baseline: one linear dimension per reference from the base, nearest first, 8 mm apart
        var bp = items[0].p, rest = items.slice(1).sort(function (p, q) { return Math.abs(p.val) - Math.abs(q.val); });
        rest.forEach(function (it, i) {
          var pos = lvl + side * 8 * k * i;
          var lab = d.tol || d.label != null ? dimLabel(Object.assign({}, d, { kind: 'h', value: Math.abs(it.val) }), units) : { main: numText(Math.abs(it.val), units, prec), upper: null, lower: null };
          var a2 = bp.slice(), b2 = it.p.slice();
          linear(a2, b2, hz2, pos, lab, null);
        });
      }
      return out;
    }
    var a = vw.toSheet(d.a), b = vw.toSheet(d.b);
    var same = placed.filter(function (p) { return p.view === d.view && p.kind === d.kind && p.side === d.side; }).length;
    var offs = (10 + 8 * same) * k;
    if (d.kind === 'h') {
      var y = d.side < 0 ? box.y0 - offs : box.y1 + offs;
      if (d.at != null) y = vw.toSheet([0, d.at])[1];
      linear(a, b, true, y, labMain, d.tx);
      d.lineAt = vw.fromSheet([0, y])[1];
    } else if (d.kind === 'v') {
      var x = d.side < 0 ? box.x0 - offs : box.x1 + offs;
      if (d.at != null) x = vw.toSheet([d.at, 0])[0];
      linear(a, b, false, x, labMain, d.tx);
      d.lineAt = vw.fromSheet([x, 0])[0];
    } else if (d.kind === 'aligned') {
      var dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy) || 1, t = [dx / Ln, dy / Ln], n0 = [-t[1], t[0]], n = n0;
      // offset away from the view centre, or where it was dragged to
      var mid2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cc2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], o = 8 * k;
      if (d.off != null) { o = Math.abs(d.off); if (d.off < 0) n = [-n0[0], -n0[1]]; }
      else if ((mid2[0] - cc2[0]) * n[0] + (mid2[1] - cc2[1]) * n[1] < 0) n = [-n[0], -n[1]];
      d.offNow = o * (n === n0 ? 1 : -1);
      var pa = [a[0] + n[0] * o, a[1] + n[1] * o], pb = [b[0] + n[0] * o, b[1] + n[1] * o];
      line([a[0] + n[0] * gapE, a[1] + n[1] * gapE], [pa[0] + n[0] * ext, pa[1] + n[1] * ext]);
      line([b[0] + n[0] * gapE, b[1] + n[1] * gapE], [pb[0] + n[0] * ext, pb[1] + n[1] * ext]);
      // (the text along the line, centred on it in a break, as a linear dimension's; r13/drawings13)
      var xo2 = ar + 4 * k, g2 = TEXT_GAP * k, ang2 = Math.atan2(t[1], t[0]) * 180 / Math.PI;
      if (ang2 > 90) ang2 -= 180; if (ang2 <= -90) ang2 += 180;
      var ta = ang2 * Math.PI / 180, tt2 = [Math.cos(ta), Math.sin(ta)], up2 = [-tt2[1], tt2[0]], sd = tt2[0] * t[0] + tt2[1] * t[1];
      var half2 = labWidth(labMain) / 2 + g2, fits2 = Ln >= 2 * half2 + 2 * ar + g2, out2 = !!d.flip || !fits2;
      var sc = Ln / 2 + (d.tx || 0) * sd;
      if (d.tx == null && !fits2) sc = Ln + xo2 + half2;
      var s0a = out2 ? -xo2 : 0, s1a = out2 ? Ln + xo2 : Ln, At = function (s) { return [pa[0] + t[0] * s, pa[1] + t[1] * s]; };
      if (sc - half2 >= -1e-9 && sc + half2 <= Ln + 1e-9) { if (sc - half2 > s0a) line(At(s0a), At(sc - half2)); if (sc + half2 < s1a) line(At(sc + half2), At(s1a)); }
      else if (sc > Ln / 2) line(At(s0a), At(Math.max(s1a, sc - half2)));
      else line(At(Math.min(s0a, sc + half2)), At(s1a));
      if (out2) { arrow(pa, t); arrow(pb, [-t[0], -t[1]]); } else { arrow(pa, [-t[0], -t[1]]); arrow(pb, t); }
      d.txNow = (sc - Ln / 2) * sd;
      var cpt = At(sc);
      label([cpt[0] - up2[0] * th / 2, cpt[1] - up2[1] * th / 2], 'middle', ang2, labMain);
    }
    return out;
  }
  // Drawing text (r13/drawings13), as SolidWorks' ANSI standard draws it: Century Gothic, with look-alike fallbacks for
  // a machine without it (installed fonts only, nothing fetched: works offline). A text primitive's h is its character
  // height (the height of a capital, as in ASME Y14.2, SolidWorks and DXF), so every writer draws the same size: SVG
  // font-size = h / CAP_EM (Century Gothic's capitals are 0.72 em), PDF Helvetica at h / 0.718, DXF TEXT height h.
  // (h used to be the SVG font-size: capitals 2.5 mm on screen and in SVG for a 3.5 mm dimension, 3.4 mm in PDF, 3.5
  // mm in DXF.) Dimensions and notes are 3.5 mm; labels, the title block, balloons and the BOM keep their sizes on
  // screen (computeSheet's text() converts). textWidth: the advance of Century Gothic's capitals and digits, 0.56 em.
  var DW_FONT = '"Century Gothic", "URW Gothic", "URW Gothic L", "TeX Gyre Adventor", "Avant Garde", Futura, "Segoe UI", Arial, Helvetica, sans-serif';
  var CAP_EM = 0.72, SHOULDER = 4, TEXT_GAP = 1;   // leader shoulder and the gap round dimension text, paper mm
  function textWidth(t, h) { return String(t).length * h * 0.78; }

  // ------------------------------------------------------------------ writers
  function num(x) { return String(Math.round(x * 1e4) / 1e4); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // widths in paper mm
  // dimension, leader and balloon arrowheads: 3 mm long, 1 mm wide (ASME Y14.2, SolidWorks' ANSI default 1 × 3 mm;
  // half-width 0.5), r12/drawui12 (were 1.8 mm wide). Section-view arrows keep their own, bolder size.
  var ARROW_W = 0.5;
  var STROKE = { visible: 0.5, hidden: 0.35, thin: 0.25, thick: 0.7, hatch: 0.18, chain: 0.7, center: 0.25, tangent: 0.35, tanfont: 0.25 };
  var CENTER_DASH = [6, 1.5, 1.5, 1.5];   // centre marks and centrelines: long dash, short dash (paper mm)
  // plainText(s): text for writers without the ASME symbol glyphs (DXF R12, PDF Helvetica): ↧ 10 -> X 10 DEEP,
  // ⌴ -> CBORE, ⌵ -> CSK (the words the symbols replaced)
  function plainText(t) {
    return String(t).replace(/\u21a7\s*([^\s,]+)/g, 'X $1 DEEP').replace(/\u2334\s*/g, 'CBORE ').replace(/\u2335\s*/g, 'CSK ');
  }
  // SolidWorks draws dangling annotations (their model reference is gone) in olive brown
  var COLORS = { dangling: '#a07c00' }, DXF_COLORS = { dangling: 42 }, PDF_COLORS = { dangling: '0.627 0.486 0' };
  // a CCW arc (degrees) as start / end points
  function arcEnds(p) {
    var a0 = p.a0 * Math.PI / 180, a1 = p.a1 * Math.PI / 180;
    return [[p.c[0] + p.r * Math.cos(a0), p.c[1] + p.r * Math.sin(a0)], [p.c[0] + p.r * Math.cos(a1), p.c[1] + p.r * Math.sin(a1)]];
  }
  // ellipsePrim(el, toSheet, s, layer, style): a projected true circle { c, ax, ay, t0, t1 } (the point at θ is
  // c + cos θ ax + sin θ ay, model units of the view) as a sheet primitive in principal form: { k: 'ellipse', c,
  // major (vector), ratio, t0, t1 } with the point at t = c + cos t major + sin t minor, minor = ratio × major turned
  // 90° CCW, t0 < t1 (the DXF ELLIPSE convention)
  function ellipsePrim(el, toSheet, s, layer, style) {
    var ax = [el.ax[0] * s, el.ax[1] * s], ay = [el.ay[0] * s, el.ay[1] * s];
    var ts = 0.5 * Math.atan2(2 * (ax[0] * ay[0] + ax[1] * ay[1]), ax[0] * ax[0] + ax[1] * ax[1] - ay[0] * ay[0] - ay[1] * ay[1]);
    var M = [ax[0] * Math.cos(ts) + ay[0] * Math.sin(ts), ax[1] * Math.cos(ts) + ay[1] * Math.sin(ts)];
    var N = [-ax[0] * Math.sin(ts) + ay[0] * Math.cos(ts), -ax[1] * Math.sin(ts) + ay[1] * Math.cos(ts)];
    var t0 = el.t0 - ts, t1 = el.t1 - ts;
    if (Math.hypot(N[0], N[1]) > Math.hypot(M[0], M[1])) { var M0 = M; M = N; N = [-M0[0], -M0[1]]; t0 -= Math.PI / 2; t1 -= Math.PI / 2; }
    if (M[0] * N[1] - M[1] * N[0] < 0) { N = [-N[0], -N[1]]; var x = t0; t0 = -t1; t1 = -x; }
    var Ml = Math.hypot(M[0], M[1]), full = !!el.full || t1 - t0 >= TWO_PI - 1e-9;
    if (full) { t0 = 0; t1 = TWO_PI; } else { var sh = Math.floor(t0 / TWO_PI) * TWO_PI; t0 -= sh; t1 -= sh; }
    return { k: 'ellipse', c: toSheet(el.c), major: M, ratio: Ml > 1e-15 ? Math.hypot(N[0], N[1]) / Ml : 0, t0: t0, t1: t1, full: full, layer: layer, style: style };
  }
  // point and derivative of an ellipse primitive at t
  function ellipseAt(p, t) {
    var M = p.major, N = [-M[1] * p.ratio, M[0] * p.ratio], c = Math.cos(t), s = Math.sin(t);
    return { p: [p.c[0] + M[0] * c + N[0] * s, p.c[1] + M[1] * c + N[1] * s], d: [-M[0] * s + N[0] * c, -M[1] * s + N[1] * c] };
  }
  function toSVG(sheet, opts) {
    var P = svgParts(sheet, opts), out = [P.head, P.bg];
    P.groups.forEach(function (g) { out.push(g.open); if (g.body) out.push(g.body); out.push('</g>'); });
    out.push('</svg>');
    return out.join('\n');
  }
  // svgParts(sheet, { live }) -> { head, bg, groups: [{ key, open, body }] }: the SVG in pieces, one group per layer,
  // so the app can patch only the layers that changed (r3/drawings3). With live, a layer that is not a view's
  // (dimensions, annotations, balloons) is split into runs per view (<g data-of="id">), so a dragged view can take
  // its dimensions along with a transform until the sheet is worked out again.
  function svgParts(sheet, opts) {
    opts = opts || {};
    var S = sheet.size, k = sheet.units === 'in' ? 1 / MM : 1, H = S[1];
    function X(p) { return num(p[0]); } function Y(p) { return num(H - p[1]); }
    var dash = num(3 * k) + ' ' + num(1.5 * k), chain = [8, 1.5, 1.5, 1.5].map(function (x) { return num(x * k); }).join(' '), center = CENTER_DASH.map(function (x) { return num(x * k); }).join(' ');
    var res = { head: '<svg xmlns="http://www.w3.org/2000/svg" width="' + num(S[0]) + sheet.units + '" height="' + num(S[1]) + sheet.units + '" viewBox="0 0 ' + num(S[0]) + ' ' + num(S[1]) + '" font-family="' + esc(DW_FONT) + '">',
      bg: '<rect class="sheet-bg" x="0" y="0" width="' + num(S[0]) + '" height="' + num(S[1]) + '" fill="#fff"/>', groups: [] };
    var groups = {}, gorder = [];
    sheet.prims.forEach(function (p) { if (!groups[p.layer]) { groups[p.layer] = []; gorder.push(p.layer); } groups[p.layer].push(p); });
    gorder.forEach(function (layer) {
      var vw = sheet.views.filter(function (w) { return w.layer === layer; })[0], out = [], run = null;
      var grp = { key: layer, open: '<g data-layer="' + esc(layer) + '"' + (vw ? ' data-view="' + vw.view.id + '" class="dv"' : '') + ' fill="none" stroke="#000" stroke-linecap="round">' };
      res.groups.push(grp);
      var lst = groups[layer];
      lst.forEach(function (p, pi) {
        // a chain of lines (chainLines) is one path: its dashes run on along it
        if (p.k === 'line' && p.chain && lst[pi - 1] && lst[pi - 1].chain === p.chain) return;
        if (p.k === 'line' && p.chain && lst[pi + 1] && lst[pi + 1].chain === p.chain) {
          var pts = [X(p.a) + ' ' + Y(p.a), X(p.b) + ' ' + Y(p.b)];
          for (var pj = pi + 1; lst[pj] && lst[pj].chain === p.chain; pj++) pts.push(X(lst[pj].b) + ' ' + Y(lst[pj].b));
          var dshc = p.style === 'hidden' ? ' stroke-dasharray="' + dash + '"' : p.style === 'tanfont' ? ' stroke-dasharray="' + chain + '"' : '';
          out.push('<path class="' + p.style + '" d="M' + pts.join(' L') + '" stroke-width="' + num((STROKE[p.style] || 0.25) * k) + '" stroke-linejoin="round"' + dshc + '/>');
          return;
        }
        // hatch lines (r6/drawings6): a run of them is one path, each line a move and a relative line-to, so a hatched
        // section is about a third the size of one <line> per hatch line (a dashed pattern's dashes are many lines)
        if (p.k === 'line' && p.style === 'hatch' && !p.color && lst[pi - 1] && lst[pi - 1].k === 'line' && lst[pi - 1].style === 'hatch' && !lst[pi - 1].color) return;
        if (p.k === 'line' && p.style === 'hatch' && !p.color) {
          var hd = [], cx = null, cy = 0, rd = function (x) { return Math.round(x * 1e4) / 1e4; };
          for (var hj = pi; lst[hj] && lst[hj].k === 'line' && lst[hj].style === 'hatch' && !lst[hj].color; hj++) {
            // relative moves from the point drawn so far (rounded), so the numbers stay short and errors never add up
            var ax = lst[hj].a[0], ay = H - lst[hj].a[1], bx = lst[hj].b[0], by = H - lst[hj].b[1], mx, my, lx, ly;
            if (cx === null) { cx = rd(ax); cy = rd(ay); hd.push('M' + num(cx) + ' ' + num(cy)); }
            else { mx = rd(ax - cx); my = rd(ay - cy); cx += mx; cy += my; hd.push('m' + num(mx) + ' ' + num(my)); }
            lx = rd(bx - cx); ly = rd(by - cy); cx += lx; cy += ly; hd.push('l' + num(lx) + ' ' + num(ly));
          }
          out.push('<path class="hatch" d="' + hd.join('') + '" stroke-width="' + num(STROKE.hatch * k) + '"/>');
          return;
        }
        if (opts.live && !vw) {
          var of = p.view != null ? String(p.view) : null;
          if (of !== run) { if (run != null) out.push('</g>'); if (of != null) out.push('<g data-of="' + of + '">'); run = of; }
        }
        if (p.k === 'pending') {
          // a view still being worked out (r12/drawui12): a soft panel where it goes, in the app only
          if (opts.live) out.push('<rect class="dw-pending" x="' + num(p.box.x0) + '" y="' + num(H - p.box.y1) + '" width="' + num(p.box.x1 - p.box.x0) + '" height="' + num(p.box.y1 - p.box.y0) + '" rx="' + num(1.5 * k) + '" stroke="none"/>');
          return;
        }
        var sw = num((STROKE[p.style] || 0.25) * k), cls = p.style ? ' class="' + p.style + '"' : '';
        var dsh = p.style === 'hidden' ? ' stroke-dasharray="' + dash + '"' : p.style === 'chain' || p.style === 'tanfont' ? ' stroke-dasharray="' + chain + '"' : p.style === 'center' ? ' stroke-dasharray="' + center + '"' : '';
        var col = p.color && COLORS[p.color];
        if (col) { dsh += p.k === 'fill' || p.k === 'text' ? '' : ' stroke="' + col + '"'; cls += ' data-color="' + p.color + '"'; }
        if (p.k === 'arc') {
          // two halves, so an arc of nearly 360° (its ends a rounding step apart) is not dropped by the viewer
          var span = ((p.a1 - p.a0) % 360 + 360) % 360;
          if (span < 1e-9 && p.a1 !== p.a0) span = 360;
          var ae = arcEnds({ c: p.c, r: p.r, a0: p.a0, a1: p.a0 + span / 2 }), ae2 = arcEnds({ c: p.c, r: p.r, a0: p.a0, a1: p.a0 + span }), ra = ' A' + num(p.r) + ' ' + num(p.r) + ' 0 0 0 ';
          out.push('<path' + cls + ' d="M' + X(ae[0]) + ' ' + Y(ae[0]) + ra + X(ae[1]) + ' ' + Y(ae[1]) + ra + X(ae2[1]) + ' ' + Y(ae2[1]) + '" stroke-width="' + sw + '"' + dsh + '/>');
        } else if (p.k === 'ellipse') {
          var rx = Math.hypot(p.major[0], p.major[1]), ry = rx * p.ratio, rot = -Math.atan2(p.major[1], p.major[0]) * 180 / Math.PI;
          if (p.full) out.push('<ellipse' + cls + ' cx="' + X(p.c) + '" cy="' + Y(p.c) + '" rx="' + num(rx) + '" ry="' + num(ry) + '" transform="rotate(' + num(rot) + ' ' + X(p.c) + ' ' + Y(p.c) + ')" stroke-width="' + sw + '"' + dsh + '/>');
          else {
            var e0 = ellipseAt(p, p.t0).p, em = ellipseAt(p, (p.t0 + p.t1) / 2).p, e1 = ellipseAt(p, p.t1).p, ea = ' A' + num(rx) + ' ' + num(ry) + ' ' + num(rot) + ' 0 0 ';
            out.push('<path' + cls + ' d="M' + X(e0) + ' ' + Y(e0) + ea + X(em) + ' ' + Y(em) + ea + X(e1) + ' ' + Y(e1) + '" stroke-width="' + sw + '"' + dsh + '/>');
          }
        } else if (p.k === 'line') out.push('<line' + cls + ' x1="' + X(p.a) + '" y1="' + Y(p.a) + '" x2="' + X(p.b) + '" y2="' + Y(p.b) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'circle') out.push('<circle' + cls + ' cx="' + X(p.c) + '" cy="' + Y(p.c) + '" r="' + num(p.r) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'fill') out.push('<path' + (col ? ' data-color="' + p.color + '"' : '') + ' d="M' + p.pts.map(function (q) { return X(q) + ' ' + Y(q); }).join(' L') + ' Z" fill="' + (col || '#000') + '" stroke="none"/>');
        else if (p.k === 'text') {
          var tr = p.rot ? ' transform="rotate(' + num(-p.rot) + ' ' + X(p.p) + ' ' + Y(p.p) + ')"' : '';
          out.push('<text x="' + X(p.p) + '" y="' + Y(p.p) + '" font-size="' + num(p.h / CAP_EM) + '" text-anchor="' + p.anchor + '" fill="' + (col || '#000') + '" stroke="none"' + tr + (col ? ' data-color="' + p.color + '"' : '') + '>' + esc(p.text) + '</text>');
        }
      });
      if (run != null) out.push('</g>');
      grp.body = out.join('\n');
    });
    return res;
  }

  // DXF R12: one layer per drawing view (FRONT, TOP, RIGHT, ISOMETRIC…), plus DIMENSIONS and SHEET; hidden edges use
  // the HIDDEN linetype. Paper units ($INSUNITS 4 = mm, 1 = in).
  function toDXF(sheet) {
    var L = [];
    function pr(c, v) { L.push(String(c), String(v)); }
    var layers = [];
    sheet.prims.forEach(function (p) { if (layers.indexOf(p.layer) < 0) layers.push(p.layer); });
    var colors = { SHEET: 7, DIMENSIONS: 3, BOM: 7, BALLOONS: 3, ANNOTATIONS: 3 }, THIN = { hatch: 1, tangent: 1, tanfont: 1, center: 1 };
    pr(0, 'SECTION'); pr(2, 'HEADER');
    pr(9, '$ACADVER'); pr(1, 'AC1009');
    pr(9, '$INSUNITS'); pr(70, sheet.units === 'in' ? 1 : 4);
    pr(9, '$MEASUREMENT'); pr(70, sheet.units === 'in' ? 0 : 1);
    pr(9, '$EXTMIN'); pr(10, 0); pr(20, 0); pr(30, 0);
    pr(9, '$EXTMAX'); pr(10, num(sheet.size[0])); pr(20, num(sheet.size[1])); pr(30, 0);
    pr(9, '$LTSCALE'); pr(40, sheet.units === 'in' ? 0.04 : 1);
    pr(0, 'ENDSEC');
    pr(0, 'SECTION'); pr(2, 'TABLES');
    var useCenter = sheet.prims.some(function (p) { return p.style === 'center'; });   // CENTER only when a centre mark / line uses it
    pr(0, 'TABLE'); pr(2, 'LTYPE'); pr(70, useCenter ? 4 : 3);
    pr(0, 'LTYPE'); pr(2, 'CONTINUOUS'); pr(70, 0); pr(3, 'Solid line'); pr(72, 65); pr(73, 0); pr(40, 0);
    pr(0, 'LTYPE'); pr(2, 'HIDDEN'); pr(70, 0); pr(3, '__ __ __ __'); pr(72, 65); pr(73, 2); pr(40, 4.5); pr(49, 3); pr(49, -1.5);
    pr(0, 'LTYPE'); pr(2, 'PHANTOM'); pr(70, 0); pr(3, '____ _ ____ _'); pr(72, 65); pr(73, 4); pr(40, 12.5); pr(49, 8); pr(49, -1.5); pr(49, 1.5); pr(49, -1.5);
    if (useCenter) { pr(0, 'LTYPE'); pr(2, 'CENTER'); pr(70, 0); pr(3, '____ _ ____ _'); pr(72, 65); pr(73, 4); pr(40, 10.5); pr(49, 6); pr(49, -1.5); pr(49, 1.5); pr(49, -1.5); }
    pr(0, 'ENDTAB');
    // the text style: Century Gothic (GOTHIC.TTF), as on the sheet (r13/drawings13); a reader without it substitutes its own
    pr(0, 'TABLE'); pr(2, 'STYLE'); pr(70, 1);
    pr(0, 'STYLE'); pr(2, 'STANDARD'); pr(70, 0); pr(40, 0); pr(41, 1); pr(50, 0); pr(71, 0); pr(42, num(3.5 * (sheet.units === 'in' ? 1 / MM : 1))); pr(3, 'GOTHIC.TTF'); pr(4, '');
    pr(0, 'ENDTAB');
    pr(0, 'TABLE'); pr(2, 'LAYER'); pr(70, layers.length);
    layers.forEach(function (n) {
      // view layers plot black / white (7) like the sheet; thin lines (hatch, tangent edges, centre marks) on them are
      // colour 8, so a plot-by-colour pen table gives the thick / thin weights (R12 has no lineweights) (r5/drawings5)
      var col = colors[n] || 7;
      pr(0, 'LAYER'); pr(2, n); pr(70, 0); pr(62, col); pr(6, 'CONTINUOUS');
    });
    pr(0, 'ENDTAB');
    pr(0, 'ENDSEC');
    pr(0, 'SECTION'); pr(2, 'ENTITIES');
    sheet.prims.forEach(function (p) {
      var ltn = p.style === 'hidden' ? 'HIDDEN' : p.style === 'chain' || p.style === 'tanfont' ? 'PHANTOM' : p.style === 'center' ? 'CENTER' : null, dc = p.color && DXF_COLORS[p.color] || (THIN[p.style] && !colors[p.layer] ? 8 : 0);
      var lt = function () { if (ltn) pr(6, ltn); if (dc) pr(62, dc); };
      // hatch lines leave out z (30 / 31, default 0): a dashed hatch pattern is thousands of lines (r6/drawings6)
      if (p.k === 'line' && p.style === 'hatch') { pr(0, 'LINE'); pr(8, p.layer); lt(); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(11, num(p.b[0])); pr(21, num(p.b[1])); }
      else if (p.k === 'line') { pr(0, 'LINE'); pr(8, p.layer); lt(); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(30, 0); pr(11, num(p.b[0])); pr(21, num(p.b[1])); pr(31, 0); }
      else if (p.k === 'circle') { pr(0, 'CIRCLE'); pr(8, p.layer); lt(); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); }
      else if (p.k === 'arc') { pr(0, 'ARC'); pr(8, p.layer); lt(); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); pr(50, num(((p.a0 % 360) + 360) % 360)); pr(51, num(((p.a1 % 360) + 360) % 360)); }
      else if (p.k === 'ellipse') {
        // DXF R12 has no ELLIPSE entity: a 2D POLYLINE through points on the exact ellipse (chord error under 0.01 mm)
        var Rm = Math.hypot(p.major[0], p.major[1]), tolE = 0.01 * (sheet.units === 'in' ? 1 / MM : 1), sw = p.t1 - p.t0;
        var step = Rm > tolE ? 2 * Math.acos(Math.max(-1, 1 - tolE / Rm)) : Math.PI / 4, n = Math.max(8, Math.min(720, Math.ceil(sw / step)));
        pr(0, 'POLYLINE'); pr(8, p.layer); lt(); pr(66, 1); pr(10, 0); pr(20, 0); pr(30, 0); pr(70, p.full ? 1 : 0);
        for (var i = 0; i < (p.full ? n : n + 1); i++) { var ep = ellipseAt(p, p.t0 + sw * i / n).p; pr(0, 'VERTEX'); pr(8, p.layer); pr(10, num(ep[0])); pr(20, num(ep[1])); pr(30, 0); }
        pr(0, 'SEQEND'); pr(8, p.layer);
      } else if (p.k === 'fill') {
        pr(0, 'SOLID'); pr(8, p.layer); lt();
        var q = [p.pts[0], p.pts[1], p.pts[2], p.pts[2]];
        q.forEach(function (pt, i) { pr(10 + i, num(pt[0])); pr(20 + i, num(pt[1])); pr(30 + i, 0); });
      } else if (p.k === 'text') {
        pr(0, 'TEXT'); pr(8, p.layer); lt(); pr(10, num(p.p[0])); pr(20, num(p.p[1])); pr(30, 0); pr(40, num(p.h)); pr(1, plainText(p.text).replace(/\u00d8/g, '%%c').replace(/\u00b1/g, '%%p').replace(/\u00b0/g, '%%d').replace(/\u00d7/g, 'x').replace(/[^\x20-\x7e]/g, '?'));
        if (p.rot) pr(50, num(p.rot));
        if (p.anchor !== 'start') { pr(72, p.anchor === 'middle' ? 1 : 2); pr(11, num(p.p[0])); pr(21, num(p.p[1])); pr(31, 0); }
      }
    });
    pr(0, 'ENDSEC'); pr(0, 'EOF');
    return L.join('\n');
  }

  // PDF 1.4, one page at the sheet's real size, Helvetica (WinAnsi) text; pure ASCII so it survives a text Blob.
  function toPDF(sheet) {
    var ptPer = sheet.units === 'in' ? 72 : 72 / MM, k = sheet.units === 'in' ? 1 / MM : 1;
    function P(x) { return num(x * ptPer); }
    var c = ['1 J 1 j'];
    var dash = [3 * k * ptPer, 1.5 * k * ptPer];
    var cur = null, curCol = '0 0 0', chain = [8, 1.5, 1.5, 1.5].map(function (x) { return num(x * k * ptPer); }).join(' '), center = CENTER_DASH.map(function (x) { return num(x * k * ptPer); }).join(' ');
    function style(s) {
      if (s === cur) return; cur = s;
      c.push(num((STROKE[s] || 0.25) * k * ptPer) + ' w ' + (s === 'hidden' ? '[' + num(dash[0]) + ' ' + num(dash[1]) + '] 0 d' : s === 'chain' || s === 'tanfont' ? '[' + chain + '] 0 d' : s === 'center' ? '[' + center + '] 0 d' : '[] 0 d'));
    }
    function color(p) {
      var col = p.color && PDF_COLORS[p.color] || '0 0 0';
      if (col === curCol) return; curCol = col;
      c.push(col + ' RG ' + col + ' rg');
    }
    // a CCW arc as cubic Beziers of at most 90 degrees
    function arcPath(p) {
      var a0 = p.a0 * Math.PI / 180, sweep = (((p.a1 - p.a0) % 360) + 360) % 360 * Math.PI / 180 || 2 * Math.PI, n = Math.ceil(sweep / (Math.PI / 2) - 1e-9), da = sweep / n;
      var kk = 4 / 3 * Math.tan(da / 4), x = p.c[0], y = p.c[1], r = p.r, s = P(x + r * Math.cos(a0)) + ' ' + P(y + r * Math.sin(a0)) + ' m';
      for (var i = 0; i < n; i++) {
        var t0 = a0 + i * da, t1 = t0 + da;
        s += ' ' + P(x + r * (Math.cos(t0) - kk * Math.sin(t0))) + ' ' + P(y + r * (Math.sin(t0) + kk * Math.cos(t0))) + ' ' +
          P(x + r * (Math.cos(t1) + kk * Math.sin(t1))) + ' ' + P(y + r * (Math.sin(t1) - kk * Math.cos(t1))) + ' ' + P(x + r * Math.cos(t1)) + ' ' + P(y + r * Math.sin(t1)) + ' c';
      }
      return s + ' S';
    }
    // an ellipse primitive as cubic Beziers of at most 90 degrees of its parameter (the affine image of arcPath's)
    function ellipsePath(p) {
      var sw = p.t1 - p.t0, n = Math.max(1, Math.ceil(sw / (Math.PI / 2) - 1e-9)), da = sw / n, kk = 4 / 3 * Math.tan(da / 4);
      var a = ellipseAt(p, p.t0), s = P(a.p[0]) + ' ' + P(a.p[1]) + ' m';
      for (var i = 0; i < n; i++) {
        var b = ellipseAt(p, p.t0 + (i + 1) * da);
        s += ' ' + P(a.p[0] + kk * a.d[0]) + ' ' + P(a.p[1] + kk * a.d[1]) + ' ' + P(b.p[0] - kk * b.d[0]) + ' ' + P(b.p[1] - kk * b.d[1]) + ' ' + P(b.p[0]) + ' ' + P(b.p[1]) + ' c';
        a = b;
      }
      return s + (p.full ? ' h S' : ' S');
    }
    function pdfText(s) {
      var out = '';
      s = plainText(s);
      for (var i = 0; i < s.length; i++) {
        var ch = s.charCodeAt(i);
        if (ch === 0xd8) out += '\\330';
        else if (ch === 0xd7) out += '\\327';
        else if (ch === 0xb1) out += '\\261';
        else if (ch === 0xb0) out += '\\260';
        else if (ch === 40 || ch === 41 || ch === 92) out += '\\' + s[i];
        else if (ch >= 32 && ch < 127) out += s[i];
        else out += '?';
      }
      return out;
    }
    sheet.prims.forEach(function (p, pi) {
      color(p);
      // a chain of lines (chainLines) is one path, so its dashes run on along it
      var prv = sheet.prims[pi - 1], nxt = sheet.prims[pi + 1];
      if (p.k === 'line' && p.chain && (prv && prv.chain === p.chain || nxt && nxt.chain === p.chain)) {
        style(p.style);
        var first = !(prv && prv.chain === p.chain), last = !(nxt && nxt.chain === p.chain);
        c.push((first ? P(p.a[0]) + ' ' + P(p.a[1]) + ' m ' : '') + P(p.b[0]) + ' ' + P(p.b[1]) + ' l' + (last ? ' S' : ''));
        return;
      }
      if (p.k === 'arc') { style(p.style); c.push(arcPath(p)); }
      else if (p.k === 'ellipse') { style(p.style); c.push(ellipsePath(p)); }
      else if (p.k === 'line') { style(p.style); c.push(P(p.a[0]) + ' ' + P(p.a[1]) + ' m ' + P(p.b[0]) + ' ' + P(p.b[1]) + ' l S'); }
      else if (p.k === 'circle') {
        style(p.style);
        var x = p.c[0], y = p.c[1], r = p.r, m = 0.5522847498 * r;
        c.push(P(x + r) + ' ' + P(y) + ' m ' +
          P(x + r) + ' ' + P(y + m) + ' ' + P(x + m) + ' ' + P(y + r) + ' ' + P(x) + ' ' + P(y + r) + ' c ' +
          P(x - m) + ' ' + P(y + r) + ' ' + P(x - r) + ' ' + P(y + m) + ' ' + P(x - r) + ' ' + P(y) + ' c ' +
          P(x - r) + ' ' + P(y - m) + ' ' + P(x - m) + ' ' + P(y - r) + ' ' + P(x) + ' ' + P(y - r) + ' c ' +
          P(x + m) + ' ' + P(y - r) + ' ' + P(x + r) + ' ' + P(y - m) + ' ' + P(x + r) + ' ' + P(y) + ' c S');
      } else if (p.k === 'fill') c.push(P(p.pts[0][0]) + ' ' + P(p.pts[0][1]) + ' m ' + P(p.pts[1][0]) + ' ' + P(p.pts[1][1]) + ' l ' + P(p.pts[2][0]) + ' ' + P(p.pts[2][1]) + ' l h f');
      else if (p.k === 'text') {
        var fs = p.h / 0.718 * ptPer, w = textWidth(plainText(p.text), p.h) * ptPer;   // h: the capitals' height (Helvetica's are 0.718 em), r13/drawings13
        var shift = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0;
        var a = (p.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        var x0 = p.p[0] * ptPer + ca * shift, y0 = p.p[1] * ptPer + sa * shift;
        c.push('BT /F1 ' + num(fs) + ' Tf ' + num(ca) + ' ' + num(sa) + ' ' + num(-sa) + ' ' + num(ca) + ' ' + num(x0) + ' ' + num(y0) + ' Tm (' + pdfText(p.text) + ') Tj ET');
      }
    });
    var content = c.join('\n');
    var W = P(sheet.size[0]), H = P(sheet.size[1]);
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    ];
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return out;
  }

  D.compute = compute; D.toSVG = toSVG; D.svgParts = svgParts; D.toDXF = toDXF; D.toPDF = toPDF; D.textRect = textRect; D.STROKE = STROKE; D.plainText = plainText;
  _.ARROW_W = ARROW_W; _.SHOULDER = SHOULDER; _.TEXT_GAP = TEXT_GAP; _.CAP_EM = CAP_EM; _.DW_FONT = DW_FONT; _.textWidth = textWidth; _.arcEnds = arcEnds; _.ellipseAt = ellipseAt;
})(Drawing, Drawing._);
