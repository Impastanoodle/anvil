// drawing-render.js — sheet primitives and writers for the drawing engine (Drawing, see drawing.js): compute works a
// drawing document out into paper primitives (border and title block, every view's linework, hatching, labels, cutting
// lines and detail circles, the Bill of Materials and balloons, dimensions placed clear of each other, cosmetic threads,
// annotations), with the lazy mode that leaves placeholders for views still being worked out in drawing-worker.js;
// dimension primitives in SolidWorks' ANSI style; the drawing text metrics (Century Gothic, capitals' height), line
// widths and colours; and the writers: toSVG / svgParts (one group per layer, patchable), toDXF (R12 or R2000, one layer per
// view) and toPDF. Loads last of the engine files.
(function (D, _) {
  'use strict';
  var isOrthoFrame = D.isOrthoFrame, hatchStyle = D.hatchStyle, hatchPattern = D.hatchPattern, patternLines = D.patternLines, snapHatch = D.snapHatch;
  var scaleValue = D.scaleValue, scaleLabel = D.scaleLabel, sheetSize = D.sheetSize, TB_FIELDS = D.TB_FIELDS, titleBlock = D.titleBlock, autoDims = D.autoDims, dimText = D.dimText;
  var asmPartMaterials = D.asmPartMaterials, bomType = D.bomType, bomRows = D.bomRows, bomBox = D.bomBox, balloonSpots = D.balloonSpots;
  var dimLabel = D.dimLabel, numText = D.numText, styleKey = D.styleKey, setDimProps = D.setDimProps, STACK_DIRS = D.STACK_DIRS;
  var TWO_PI = _.TWO_PI, chainLines = _.chainLines, clipSeg = _.clipSeg, primHitsRect = _.primHitsRect, segOutsideRect = _.segOutsideRect;
  var MM = _.MM, paperK = _.paperK, viewScale = _.viewScale, BORDER = _.BORDER, TB_W = _.TB_W, TB_H = _.TB_H, HATCH = _.HATCH, BOM_TEXT = _.BOM_TEXT;
  var viewContent = _.viewContent, autoDimKey = _.autoDimKey, hasMaterials = _.hasMaterials, bomCell = _.bomCell, REV_TEXT = _.REV_TEXT;
  var refPos = _.refPos, reattachUserDim = _.reattachUserDim, partThreads = _.partThreads, threadsAlong = _.threadsAlong, annotationPrims = _.annotationPrims;

  // ------------------------------------------------------------------ sheet primitives
  // compute(doc, mesh, model, ctx?) -> { size: [W, H], units, prims: [...], views: [{ view, proj, box }], dims }
  // prims: { k: 'line', a, b, layer, style } | { k: 'circle', c, r, layer, style } | { k: 'text', p, h, text, anchor,
  // layer, rot } | { k: 'fill', pts, layer } | { k: 'arc', c, r, a0, a1, layer, style } | { k: 'ellipse', c, major,
  // ratio, t0, t1, full, layer, style } (ellipsePrim); styles: 'visible', 'hidden', 'thin', 'thick'. Paper coordinates, y up.
  // compute(doc, mesh, model, ctx): ctx.lazy (r12/drawui12) leaves the views whose projection is not cached yet as
  // placeholders (sheet.pending lists the projections to work out, see cachedProjection); their dimensions,
  // annotations and balloons wait for them, and model items wait for every view (so none lands on the wrong view).
  // While a sheet is worked out, _.DIMSTYLE holds the drawing's dimension style (fmtDim: inch precision, fractions)
  // and _.CTX the model and build a flat-pattern view is unfolded from (flatData).
  function compute(doc, mesh, model, ctx) {
    _.resolveSectionScale(doc, mesh);   // (rfZ) section lines set to scale with model changes go to their place on the part
    var prevStyle = _.DIMSTYLE, prevCtx = _.CTX;
    _.DIMSTYLE = D.dimStyle(doc); _.CTX = { model: model, build: ctx && ctx.build || null, mesh: mesh };
    if (model) _.lastModel = model;   // (rfDN: excludedBodies outside compute)
    var prevGeo = _.DIMGEO; _.DIMGEO = D.dimGeometry(doc);
    var r;
    try {
      if (!ctx || !ctx.lazy) r = computeSheet(doc, mesh, model, ctx);
      else {
        var prev = _.LAZY;
        _.LAZY = { mesh: mesh, missing: [], keys: {} };
        try { r = computeSheet(doc, mesh, model, ctx); r.pending = _.LAZY.missing; } finally { _.LAZY = prev; }
      }
    } finally { _.DIMSTYLE = prevStyle; _.CTX = prevCtx; _.DIMGEO = prevGeo; }
    // (rfV) then the view kinds' marks (drawing-views.js: typed sections' cutting lines, breaks, auxiliary arrows) and
    // the angle dimensions (drawing-annotations.js), which need the views where they finally are
    _.viewKindMarks(doc, r);
    if (r && r.dims && r.prims) _.finishAngles(r);
    return r;
  }
  // (lane DW) the sheet sketch's Area Hatch/Fill regions (doc.sheet.areaFills), layer ANNOTATIONS
  function sheetAreaFills(doc, prims, out, hs, k) {
    if (!doc.sheet || !doc.sheet.areaFills || !doc.sheet.areaFills.length) return;
    _.resolveFills(doc, null, null, null, null).forEach(function (rf) {
      var e = rf.entry, n = 0, ang = 45 + (+e.angle || 0);
      if (e.pattern === 'SOLID') { prims.push({ k: 'region', loops: rf.loops, layer: 'ANNOTATIONS', style: 'hatch', fillAngle: ang, fillGap: 0.12 * k, areaFill: e.id }); n++; }
      else if (e.pattern !== 'NONE') patternLines(rf.loops, hs * (+e.scale || 1), ang, e.pattern).forEach(function (h) { prims.push({ k: 'line', a: [h[0], h[1]], b: [h[2], h[3]], layer: 'ANNOTATIONS', style: 'hatch', areaFill: e.id }); n++; });
      out.push({ id: e.id, view: null, kind: rf.kind, loops: rf.loops, pattern: e.pattern, scale: e.scale, angle: e.angle, prims: n, layer: 'ANNOTATIONS' });
    });
  }
  function computeSheet(doc, mesh, model, ctx) {
    ctx = ctx || {};
    var units = model.units === 'in' ? 'in' : 'mm', k = paperK(units);
    var S = sheetSize(doc, units), prims = [], chainSeq = 0;
    function line(a, b, layer, style) { prims.push({ k: 'line', a: a, b: b, layer: layer, style: style }); }
    // (h here is the font size the sheet was laid out with; the primitive keeps the capitals' height, r13/drawings13)
    function text(p, h, t, anchor, layer, rot) { prims.push({ k: 'text', p: p, h: h * CAP_EM, text: t, anchor: anchor || 'start', layer: layer, rot: rot || 0 }); }
    // border and title block: the sheet format. (rfAE) Each built-in piece is an item of the editable format
    // (fmtItem: deleted ones are left out, moved ones shifted, every primitive tagged with its item id); the format's
    // added lines and notes follow; sheet.format lists the items with their paper geometry (Edit Sheet Format picks)
    var fmtList = [];
    function fmtItem(id, fn) {
      if (D.formatHidden(doc, id)) return;
      var n0 = prims.length, sh = D.formatShift(doc, id, units);
      fn();
      for (var fi = n0; fi < prims.length; fi++) {
        var q = prims[fi];
        q.fmt = id;
        if (sh[0] || sh[1]) ['a', 'b', 'p'].forEach(function (key) { if (q[key]) q[key] = [q[key][0] + sh[0], q[key][1] + sh[1]]; });
        if (q.k === 'line') fmtList.push({ id: id, kind: 'line', a: q.a, b: q.b });
        else if (q.k === 'text') fmtList.push({ id: id, kind: 'text', text: q.text, box: { x0: q.p[0], x1: q.p[0] + Math.max(q.h, textWidth(q.text, q.h)), y0: q.p[1], y1: q.p[1] + q.h } });
      }
    }
    var b0 = BORDER * k * 0.5, b1 = BORDER * k;
    fmtItem('border', function () { rect([b1, b1], [S[0] - b1, S[1] - b1], 'SHEET', 'thick'); });
    void b0;
    var tw = TB_W * k, th = TB_H * k, tx0 = S[0] - b1 - tw, ty0 = b1, row = th / 3;
    fmtItem('tb', function () { rect([tx0, ty0], [S[0] - b1, ty0 + th], 'SHEET', 'thick'); });
    fmtItem('tb-row1', function () { line([tx0, ty0 + row], [S[0] - b1, ty0 + row], 'SHEET', 'thin'); });
    fmtItem('tb-row2', function () { line([tx0, ty0 + 2 * row], [S[0] - b1, ty0 + 2 * row], 'SHEET', 'thin'); });
    // (rfHB, user 2026-11-03) an ANSI title block that reads at arm's length: captions 2.8 mm type (capitals .08 in,
    // were 2.2 mm / .06 in and hard to read on paper), values 3.5 mm (capitals .10 in, ASME Y14.2's minimum), the
    // TITLE 6 mm (capitals .17 in); every caption 1.5 mm in from its cell's top-left corner, every value centred in the
    // room under its caption, left-aligned at the same 1.5 mm, so the columns line up down the block
    var lab = 2.8 * k, val = 3.5 * k, pad = 1.5 * k, big = 6 * k;
    // title block fields: each a text with $PRPSHEET:"name" (the model's custom property) / $PRP:"name" (the
    // drawing's) links, evaluated now; doc.titleBlock overrides a field's text
    var tb = titleBlock(doc, model, ctx), scale = doc.sheet.scale || [1, 1];
    var tbRect = { x0: tx0, y0: ty0, x1: S[0] - b1, y1: ty0 + th };
    var colX = {}, blocks = D.tbBlocks(S, units), tbBoxes = D.tbRects(S, units);
    // (rfM) the sheet format's left blocks: COMPANY / DRAWN / CHECKED and the general tolerances, when they fit
    if (tbBoxes[1]) {
      var ex = tbBoxes[1];
      fmtItem('blk', function () { rect([ex.x0, ex.y0], [ex.x1, ex.y1], 'SHEET', 'thick'); });
      if (blocks.eng) {
        var ex0 = tx0 + D.TB_BLOCKS.eng * k;
        fmtItem('blk-row1', function () { line([ex0, ty0 + row], [tx0, ty0 + row], 'SHEET', 'thin'); });
        fmtItem('blk-row2', function () { line([ex0, ty0 + 2 * row], [tx0, ty0 + 2 * row], 'SHEET', 'thin'); });
      }
      if (blocks.tol && blocks.eng) fmtItem('blk-sep', function () { line([tx0 + D.TB_BLOCKS.eng * k, ty0], [tx0 + D.TB_BLOCKS.eng * k, ty0 + th], 'SHEET', 'thick'); });
    }
    TB_FIELDS.forEach(function (f) {
      if (f.block && !blocks[f.block]) return;
      var x0 = tx0 + f.x0 * k, x1 = tx0 + f.x1 * k, yTop = ty0 + th - f.row * row;
      if ((f.x0 > 0 || (f.block && f.x0 > D.TB_BLOCKS[f.block])) && !colX[f.row + ':' + f.x0]) { colX[f.row + ':' + f.x0] = 1; fmtItem('col:' + f.row + ':' + f.x0, function () { line([x0, yTop - row * (f.rows || 1)], [x0, yTop], 'SHEET', 'thin'); }); }
      fmtItem('field:' + f.key, function () {
        var v = tb[f.key], h = f.big ? big : val, w = x1 - x0 - 2 * pad, capBase = yTop - pad - lab * CAP_EM, yBot = yTop - row * (f.rows || 1);
        text([x0 + pad, capBase], lab, f.label, 'start', 'SHEET');
        if (f.multi && v) {
          // a block of lines (the general tolerances): capitals 2.2 mm, 1.75 × apart, 2.5 mm under the caption
          var ls = String(v).split(/\r?\n/), lh = 2.2 * k;
          ls.forEach(function (s, i) { if (s) text([x0 + pad, capBase - 2.5 * k - lh - i * lh * 1.75], lh / CAP_EM, s, 'start', 'SHEET'); });
          return;
        }
        if (v && textWidth(v, h * CAP_EM) > w) h = Math.max(1.6 * k, w / (String(v).length * 0.78 * CAP_EM));
        if (v) text([x0 + pad, (capBase + yBot) / 2 - h * CAP_EM / 2], h, v, 'start', 'SHEET');
      });
    });
    // (rfAE) the format's own lines and notes (paper mm from the border's bottom-right corner); notes take $PRP links
    ((doc.format && doc.format.items) || []).forEach(function (it) {
      if (it.k === 'line') {
        var A = D.fmtToPaper(S, units, it.a), B = D.fmtToPaper(S, units, it.b);
        prims.push({ k: 'line', a: A, b: B, layer: 'SHEET', style: it.style === 'thick' ? 'thick' : 'thin', fmt: it.id });
        fmtList.push({ id: it.id, kind: 'line', a: A, b: B, added: true });
      } else if (it.k === 'note') {
        var P = D.fmtToPaper(S, units, it.p), fh = (+it.h > 0 ? +it.h : 3.5) * k, ls2 = D.titleText(it.text, doc, model, ctx).split(/\r?\n|\\n/), wmax = 0;
        ls2.forEach(function (s, i) { if (s) { prims.push({ k: 'text', p: [P[0], P[1] - i * fh * 1.5], h: fh * CAP_EM, text: s, anchor: 'start', layer: 'SHEET', rot: 0, fmt: it.id }); wmax = Math.max(wmax, textWidth(s, fh * CAP_EM)); } });
        fmtList.push({ id: it.id, kind: 'text', text: it.text, added: true, box: { x0: P[0], x1: P[0] + Math.max(wmax, 2 * k), y0: P[1] - (ls2.length - 1) * fh * 1.5, y1: P[1] + fh * CAP_EM } });
      }
    });
    function rect(a, b, layer, style) { line([a[0], a[1]], [b[0], a[1]], layer, style); line([b[0], a[1]], [b[0], b[1]], layer, style); line([b[0], b[1]], [a[0], b[1]], layer, style); line([a[0], b[1]], [a[0], a[1]], layer, style); }

    // views: what each one shows (its content, in model units of its frame), then paper primitives
    doc.units = units;
    var projections = {}, views = [], contents = {}, byId = {}, areaFills = [];   // (lane DW: areaFills, every Area Hatch/Fill drawn)
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
      // (rfAG) a region with its own Area Hatch/Fill (view.hatchRegions, marked cap.areaHatch) takes its pattern, scale
      // and angle (added to 45°) straight from it: SOLID is one filled region (SVG / PDF fill, a DXF HATCH), NONE bare
      // hatchInto(loops (sheet), pattern, { angle, spacing }, put, extra) -> primitives made: SOLID one filled region,
      // NONE nothing, a pattern its lines (ending on the drawn round edges), all clipped to a detail circle
      function hatchInto(loops, pat, hst, put, extra, merge) {
        var n = 0;
        if (pat === 'SOLID') {
          var rl = clip ? _.clipLoopsConvex(loops, _.circlePoly(clip.c, clip.r, 128)) : loops;
          if (rl.length) { put(Object.assign({ k: 'region', loops: rl, layer: layer, style: 'hatch' }, extra, { fillAngle: hst.angle, fillGap: 0.12 * k })); n++; }
        } else if (pat !== 'NONE') {
          // (hatch lines end on the drawn round edges, not on the facets' chords)
          if (!rims) {
            rims = [];
            [pr.circles.visible, pr.circles.hidden, pr.arcs && pr.arcs.visible, pr.arcs && pr.arcs.hidden].forEach(function (list) { (list || []).forEach(function (c) { rims.push({ c: toSheet(c.c), r: c.r * s }); }); });
          }
          var hl = snapHatch(patternLines(loops, hs * hst.spacing, hst.angle, pat), loops, rims);
          (merge ? _.mergeSegs(hl) : hl).forEach(function (h) {   // (lane DW2: a partly hidden face's pieces, joined again)
            var q = clip ? clipSeg(h, clip.c, clip.r) : h;
            if (q) { put(Object.assign({ k: 'line', a: [q[0], q[1]], b: [q[2], q[3]], layer: layer, style: 'hatch' }, extra)); n++; }
          });
        }
        return n;
      }
      (ct.caps || []).forEach(function (cap, ci) {
        var loops = cap.loops.map(function (l) { return l.map(toSheet); }), ah = cap.areaHatch, n0 = hatch;
        var hst = ah ? { angle: 45 + (+ah.angle || 0), spacing: +ah.scale || 1 } : cap.style || hatchStyle(cap.body), pat = ah ? ah.pattern : capPattern(cap);
        var tag = ah ? { region: ci, areaHatch: pat } : null;
        function put(q) { if (tag) { q.region = tag.region; q.areaHatch = tag.areaHatch; } prims.push(q); }
        hatch += hatchInto(loops, pat, hst, put, { body: cap.body, part: cap.part });
        var he = { body: cap.body, part: cap.part, angle: hst.angle, spacing: pat === 'SOLID' ? 0 : hs * hst.spacing, lines: hatch - n0, pattern: pat };
        if (ah) { he.region = ci; he.areaHatch = true; he.scale = hst.spacing; if (pat === 'SOLID') he.fill = true; if (ah.key) he.key = ah.key; }
        hatches.push(he);
      });
      // (lane DW) Area Hatch/Fill on a model face or a closed profile of the view's sketch (view.areaFills)
      if (v.areaFills && v.areaFills.length && !pr.pending) _.resolveFills(doc, v, ct.frame, mesh, toSheet).forEach(function (rf) {
        var e = rf.entry, n = hatchInto(rf.loops, e.pattern, { angle: 45 + (+e.angle || 0), spacing: +e.scale || 1 }, function (q) { q.areaFill = e.id; prims.push(q); }, {}, rf.split);
        areaFills.push({ id: e.id, view: v.id, kind: rf.kind, loops: rf.loops, pattern: e.pattern, scale: e.scale, angle: e.angle, prims: n, layer: layer });
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
      // a flat-pattern view: the bend centre lines, a little past the outline at both ends, UP on BEND_UP (thin solid),
      // DOWN on BEND_DOWN (thin dashed), as SolidWorks' Bend Lines - Up / Down line fonts; a part that does not unfold
      // says why in the view
      var fd = ct.flat && !ct.flat.error ? ct.flat : null;
      if (ct.flat && ct.flat.error) text([v.x, v.y], 3.5 * k, 'FLAT PATTERN: ' + ct.flat.error, 'middle', layer);
      if (fd) fd.bends.forEach(function (bnd) {
        var A = toSheet(bnd.a), B = toSheet(bnd.b), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, e = BEND_EXT * k;
        prims.push({ k: 'line', a: [A[0] - dx / L * e, A[1] - dy / L * e], b: [B[0] + dx / L * e, B[1] + dy / L * e], layer: bnd.up ? 'BEND_UP' : 'BEND_DOWN', style: bnd.up ? 'bendup' : 'benddown', view: v.id, bend: bnd.i });
      });
      // the flat's etch marks (Etch text, ETCH-layer lines: flat.etch) as thin green lines on layer ETCH, unless the
      // view's Show etch marks is off (v.showEtch false); a laser marks them, so they go to DXF / DWG on ETCH too
      if (fd && v.showEtch !== false) (fd.etch || []).forEach(function (it) {
        var E = { layer: 'ETCH', style: 'etch', color: 'etch', view: v.id, etch: true };
        function add(p) { Object.keys(E).forEach(function (q) { p[q] = E[q]; }); prims.push(p); }
        if (it.t === 'line') add({ k: 'line', a: toSheet(it.a), b: toSheet(it.b) });
        else if (it.t === 'circle') add({ k: 'circle', c: toSheet(it.c), r: it.r * s });
        else if (it.t === 'arc') add({ k: 'arc', c: toSheet(it.c), r: it.r * s, a0: it.a0, a1: it.a1 });
        else if (it.t === 'poly' && it.pts && it.pts.length > 1) {
          var Pq = it.pts.map(toSheet), np = it.closed ? Pq.length : Pq.length - 1;
          for (var qi = 0; qi < np; qi++) add({ k: 'line', a: Pq[qi], b: Pq[(qi + 1) % Pq.length] });
        }
      });
      // a view still being worked out (lazy compute): a placeholder over the paper it will take (svgParts, live only)
      if (pr.pending) prims.push({ k: 'pending', box: box, layer: layer });
      // (the view's label goes below its linework and below any detail circle drawn on it, r11/hatch11)
      var lb = box.y0;
      doc.views.forEach(function (dv) { if (dv.parent === v.id && dv.kind === 'detail' && dv.detail) lb = Math.min(lb, toSheet(dv.detail.c)[1] - _.detailHalf(dv.detail)[1] * s); });
      // (rfCQ) only a view whose label is shown (D.viewLabelShown: section and detail views by default, a model,
      // projected or flat view when its Display label is on; an auxiliary view's is drawn by drawing-views.js); a model
      // view's label names it and gives the scale it is drawn at (its own, else the sheet's)
      if (!D.viewLabelShown(v) || v.kind === 'aux') { }
      else if (v.kind === 'section') {
        text([v.x, lb - 7 * k], 3.5 * k, 'SECTION ' + v.label + '-' + v.label, 'middle', layer);
        if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, lb - 12 * k], 3 * k, scaleLabel(v.scale), 'middle', layer);
      } else if (v.kind === 'detail') {
        text([(box.x0 + box.x1) / 2, lb - 7 * k], 3.5 * k, 'DETAIL ' + v.label, 'middle', layer);
        text([(box.x0 + box.x1) / 2, lb - 12 * k], 3 * k, scaleLabel(v.scale || scale), 'middle', layer);
      } else {
        text([(box.x0 + box.x1) / 2, lb - 7 * k], 3.5 * k, v.kind === 'flat' ? 'FLAT PATTERN' : String(v.orient).toUpperCase(), 'middle', layer);
        text([(box.x0 + box.x1) / 2, lb - 12 * k], 3 * k, scaleLabel(v.scale || scale), 'middle', layer);
      }
      // (rfCQ) a sketched-profile detail: its hatching (and anything else on its layer) clipped to the profile; a Jagged
      // outline clips to its zig-zag instead (detailOutline)
      if (v.kind === 'detail' && v.detail && v.detail.pts && v.detail.pts.length >= 3 && v.detail.outline !== 'jagged' && !pr.pending) _.clipLayerToPoly(prims, layer, v.detail.pts.map(toSheet));
      // (rfZ) a detail view's Full / Jagged outline
      if (v.kind === 'detail' && v.detail && v.detail.outline) _.detailOutline(prims, { view: v, layer: layer, toSheet: toSheet, scale: s }, k);
      // (a flat pattern is drawn at true size whatever plane the Base Flange was sketched on)
      views.push({ view: v, proj: pr, box: box, layer: layer, toSheet: toSheet, fromSheet: fromSheet, scale: s, frame: ct.frame, ortho: isOrthoFrame(ct.frame) || !!fd,
        section: ct.section || null, hatch: hatch, hatches: hatches, clip: clip, content: ct, pending: !!pr.pending, flat: fd,
        trueDims: _.isTrueView(v, ct.frame) });   // (rfZ) Dimension Type True: its linear dimensions read true 3D lengths
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
      if (v.kind === 'section' && !v.section.type) {   // (a half / offset / aligned section: drawing-views.js draws its path)
        var sc = v.section, ext = 5 * k, shaft = 8 * k, lh = 5 * k, a, b, dv;
        if (sc.axis === 'h') {
          var y = pw.toSheet([0, sc.at])[1];
          a = [pw.box.x0 - ext, y]; b = [pw.box.x1 + ext, y]; dv = [0, -sc.sign];
          if (sc.partial) { a = [pw.toSheet([sc.partial[0], sc.at])[0], y]; b = [pw.toSheet([sc.partial[1], sc.at])[0], y]; }   // (rfZ) partial: it stops at its ends
        } else {
          var x = pw.toSheet([sc.at, 0])[0];
          a = [x, pw.box.y0 - ext]; b = [x, pw.box.y1 + ext]; dv = [-sc.sign, 0];
          if (sc.partial) { a = [x, pw.toSheet([sc.at, sc.partial[0]])[1]]; b = [x, pw.toSheet([sc.at, sc.partial[1]])[1]]; }
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
        // (rfZ) a Profile detail is a rectangle; the circle styles: Per standard / No leader (the letter beside it),
        // With leader (the letter further out on a thin leader), Broken (the letter in a gap of the circle), Connected
        // (a thin line from the circle to the detail view)
        var dtl = v.detail, hfd = _.detailHalf(dtl), prof = dtl.shape === 'profile', dc = pw.toSheet(dtl.c), r = hfd[0] * pw.scale, rh = hfd[1] * pw.scale;
        var dst = dtl.style || 'standard', broken = dst === 'broken' && !prof, lead = dst === 'leader' ? 6 * k : 0;
        // (rfCQ) a sketched profile is drawn on the parent as sketched
        var PP = dtl.pts && dtl.pts.length >= 3 ? dtl.pts.map(pw.toSheet) : null;
        function sup(cx, cy) { return PP ? _.rayOut(dc, [cx, cy], PP) : prof ? Math.abs(cx) * r + Math.abs(cy) * rh : r; }   // centre to the boundary along (cx, cy)
        if (PP) PP.forEach(function (q, i) { prims.push({ k: 'line', a: q, b: PP[(i + 1) % PP.length], layer: L, style: 'thick', detailMark: v.id }); });
        else if (prof) [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(function (q) { prims.push({ k: 'line', a: [dc[0] + q[0] * r, dc[1] + q[1] * rh], b: [dc[0] + q[2] * r, dc[1] + q[3] * rh], layer: L, style: 'thick', detailMark: v.id }); });
        else if (!broken) prims.push({ k: 'circle', c: dc, r: r, layer: L, style: 'thick', detailMark: v.id });
        // the letter goes just outside the circle where it covers the least of the parent's linework and hatching
        // (upper right first, then the other diagonals and sides), as SolidWorks keeps it readable (r11/hatch11)
        var lh2 = 5 * k, lw = textWidth(v.label, lh2 * CAP_EM), pad = 0.6 * k, bestP = null, bestN = Infinity, bestTh = Math.PI / 4, clearTh = null;
        var own = prims.filter(function (p) { return p.layer === L || p.k === 'text'; });
        // (a clear spot 2 mm further out beats one on the hatching; with none clear, the least covered beside the circle)
        var clearP = null;
        [0, 2].forEach(function (ex) { [45, 135, -45, -135, 90, 0, 180, -90].forEach(function (deg) {
          if (clearP) return;
          var th = deg * Math.PI / 180, cx = Math.cos(th), cy = Math.sin(th);
          var dist = broken ? r : sup(cx, cy) + (1.5 + ex) * k + lead + Math.abs(cx) * lw / 2 + Math.abs(cy) * lh2 / 2;
          var cen = [dc[0] + cx * dist, dc[1] + cy * dist], R = [cen[0] - lw / 2 - pad, cen[1] - lh2 / 2 - pad, cen[0] + lw / 2 + pad, cen[1] + lh2 / 2 + pad];
          var n = 0;
          own.forEach(function (p) { if (primHitsRect(p, p.k === 'text' ? [R[0] - 3 * k, R[1] - 3 * k, R[2] + 3 * k, R[3] + 3 * k] : R)) n += p.k === 'text' ? 10 : 1; });   // (by a label: worst, it would read as part of it)
          if (!n) { clearP = cen; clearTh = th; }
          else if (!ex && n < bestN) { bestN = n; bestP = cen; bestTh = th; }
        }); });
        bestP = clearP || bestP; if (clearTh != null) bestTh = clearTh;
        text([bestP[0], bestP[1] - lh2 / 2], lh2, v.label, 'middle', L);
        var bcx = Math.cos(bestTh), bcy = Math.sin(bestTh), edgeP = [dc[0] + bcx * sup(bcx, bcy), dc[1] + bcy * sup(bcx, bcy)];
        if (broken) {
          // the circle stops either side of the letter
          var gap = Math.min(80, Math.asin(Math.min(1, (Math.hypot(lw, lh2) / 2 + pad) / Math.max(r, 1e-9))) * 180 / Math.PI), tdeg = bestTh * 180 / Math.PI;
          prims.push({ k: 'arc', c: dc, r: r, a0: tdeg + gap, a1: tdeg - gap + 360, layer: L, style: 'thick', detailMark: v.id });
        }
        if (lead) {
          var lend = [bestP[0] - bcx * (Math.abs(bcx) * lw / 2 + Math.abs(bcy) * lh2 / 2 + pad), bestP[1] - bcy * (Math.abs(bcx) * lw / 2 + Math.abs(bcy) * lh2 / 2 + pad)];
          prims.push({ k: 'line', a: edgeP, b: lend, layer: L, style: 'thin', detailMark: v.id, detailLeader: v.id });
        }
        if (dst === 'connected') {
          // from the circle toward the detail view, to the nearest point of its box
          var tx = v.x - dc[0], ty = v.y - dc[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, st = [dc[0] + ux * sup(ux, uy), dc[1] + uy * sup(ux, uy)];
          var en = [Math.max(w.box.x0, Math.min(w.box.x1, st[0])), Math.max(w.box.y0, Math.min(w.box.y1, st[1]))];
          if (Math.hypot(en[0] - st[0], en[1] - st[1]) > k) prims.push({ k: 'line', a: st, b: en, layer: L, style: 'thin', detailMark: v.id, detailConnect: v.id });
        }
        // on hatching, the hatch stops round the letter (a clear island, as a hatch keeps text readable)
        if (!clearP) {
          var isl = [bestP[0] - lw / 2 - pad, bestP[1] - lh2 / 2 - pad, bestP[0] + lw / 2 + pad, bestP[1] + lh2 / 2 + pad];
          for (var pi = prims.length - 1; pi >= 0; pi--) {
            var hp = prims[pi];
            if (hp.k === 'region' && hp.layer === L) { Array.prototype.splice.apply(prims, [pi, 1].concat(_.regionOutsideRect(hp, isl))); continue; }   // (rfAG) a solid fill too
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
    // (rfM) Revision Table: REVISIONS title row, ZONE / REV / DESCRIPTION / DATE / APPROVED, one row per revision, on
    // the REVISIONS layer; a description longer than its cell is cut with '...'
    var revBx = D.revBox(doc, units), revisions = null;
    if (revBx) {
      var RL = 'REVISIONS', rth = REV_TEXT * k, rrows = doc.revisions.rows || [];
      rect([revBx.x0, revBx.y0], [revBx.x1, revBx.y1], RL, 'thick');
      for (var rr = 1; rr <= rrows.length + 1; rr++) line([revBx.x0, revBx.y1 - rr * revBx.rowH], [revBx.x1, revBx.y1 - rr * revBx.rowH], RL, rr === 2 ? 'thick' : 'thin');
      for (var rc = 1; rc < revBx.cols.length - 1; rc++) line([revBx.cols[rc], revBx.y0], [revBx.cols[rc], revBx.y1 - revBx.rowH], RL, 'thin');
      var rcell = function (ri, ci, t, al) {
        var x0c = revBx.cols[ci], x1c = revBx.cols[ci + 1], y = revBx.y1 - (ri + 1) * revBx.rowH + (revBx.rowH - rth) / 2;
        var maxCh = Math.floor((x1c - x0c - 2 * k) / (rth * 0.78));
        t = t == null ? '' : String(t);
        if (!t) return;
        if (t.length > maxCh) t = t.slice(0, Math.max(1, maxCh - 3)) + '...';
        prims.push({ k: 'text', p: [al === 'start' ? x0c + 1.2 * k : (x0c + x1c) / 2, y], h: rth, text: t, anchor: al || 'middle', layer: RL, rot: 0 });
      };
      prims.push({ k: 'text', p: [(revBx.x0 + revBx.x1) / 2, revBx.y1 - revBx.rowH + (revBx.rowH - rth) / 2], h: rth, text: 'REVISIONS', anchor: 'middle', layer: RL, rot: 0 });
      D.REV_COLS.forEach(function (c, ci) { rcell(1, ci, c[0]); });
      rrows.forEach(function (r, ri) { D.REV_COLS.forEach(function (c, ci) { rcell(ri + 2, ci, r[c[2]], c[2] === 'description' ? 'start' : 'middle'); }); });
      revisions = { box: revBx, rows: rrows.map(function (r) { return JSON.parse(JSON.stringify(r)); }), latest: D.latestRev(doc), anchor: revBx.anchor };
    }
    // (rfAE) General Tables: thick frame, thin row and column lines, each cell's text (with its $PRP links) left in
    // the cell, cut with '...' when longer than it; on the TABLES layer
    var tables = (doc.tables || []).map(function (t) {
      var tbx = D.tableBox(doc, units, t), TL = 'TABLES', tth = _.TABLE_TEXT * k, rowHk = t.rowH * k, shown = [];
      rect([tbx.x0, tbx.y0], [tbx.x1, tbx.y1], TL, 'thick');
      for (var tr = 1; tr < t.rows; tr++) line([tbx.x0, tbx.rowY[tr]], [tbx.x1, tbx.rowY[tr]], TL, 'thin');
      for (var tc = 1; tc < t.cols; tc++) line([tbx.colX[tc], tbx.y0], [tbx.colX[tc], tbx.y1], TL, 'thin');
      t.cells.forEach(function (rowCells, ri) {
        var out = [];
        rowCells.forEach(function (raw, ci) {
          var s = D.titleText(raw, doc, model, ctx), x0c = tbx.colX[ci], x1c = tbx.colX[ci + 1];
          out.push(s);
          s = String(s).replace(/\r?\n/g, ' ');
          if (!s) return;
          var maxCh = Math.floor((x1c - x0c - 2.4 * k) / (tth * 0.78));
          if (s.length > maxCh) s = s.slice(0, Math.max(1, maxCh - 3)) + '...';
          prims.push({ k: 'text', p: [x0c + 1.2 * k, tbx.rowY[ri + 1] + (rowHk - tth) / 2], h: tth, text: s, anchor: 'start', layer: TL, rot: 0, table: t.id });
        });
        shown.push(out);
      });
      return { id: t.id, rows: t.rows, cols: t.cols, anchor: t.anchor || null, box: tbx, cells: shown };
    });
    // a part drawing without a Bill of Materials still numbers its manual balloons: the part is item 1
    var brows = rows;
    if (!brows.length && model.type !== 'assembly' && views.some(function (w) { return (w.view.balloons || []).length; })) {
      var nb = 0; mesh.faces.forEach(function (f) { nb = Math.max(nb, (f.body || 0) + 1); });
      brows = [{ item: 1, key: 'part', srcKey: 'part', qty: 1, components: [], indices: Array.apply(null, Array(Math.max(1, nb))).map(function (x, i) { return i; }) }];
    }
    // (rfAG) the magnetic lines (not printed: the app draws them on its overlay), and which balloons sit on each
    var magLines = [];
    views.forEach(function (w) { if (!w.pending) D.magLinesOf(w, k).forEach(function (m) { m.view = w.view.id; m.balloons = []; magLines.push(m); }); });
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
        if (b.mag != null) magLines.forEach(function (m) { if (m.id === b.mag) m.balloons.push(b.index); });
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
      // sketch-ordinate: the sketch dimension's tolerance, precision, text and name come with the model item
      var vw0 = views.filter(function (w) { return w.view.id === d.view; })[0], sp = vw0 && D.sketchDimProps ? D.sketchDimProps(model, ctx.build, vw0, d) : null;
      if (sp) {
        ['tol', 'prec', 'label'].forEach(function (q) { if (sp[q] != null) d[q] = sp[q]; });
        if (sp.count != null) d.count = sp.count;
        // (rfJ: a slot callout's width / length / radius each with its own sketch dimension's; an ordinate set's values each
        // with its member's)
        if (sp.slotProps) d.slot = Object.assign({}, d.slot, { props: sp.slotProps });
        if (sp.valueProps) d.valueProps = sp.valueProps;
        d.sketchName = sp.name; if (sp.driven) d.driven = true;
        d.text = dimText(d, units);
      }
      var pp = doc.dimProps && doc.dimProps[d.style];
      if (pp) { setDimProps(d, pp); d.text = dimText(d, units); }
      return suppressed.indexOf(d.key) < 0;
    }) : [];
    doc.views.forEach(function (v) {
      if (pendingView[v.id]) return;
      var tw = views.filter(function (x) { return x.view.id === v.id && x.trueDims; })[0];
      (v.dims || []).forEach(function (d, i) {
        if (projections[v.id]) reattachUserDim(d, projections[v.id]);
        var c = JSON.parse(JSON.stringify(d)); c.view = v.id; c.index = i;
        // (rfZ) Dimension Type True: a linear dimension in a pictorial view reads the true length of what it measures
        if (tw && c.a && c.b && /^(h|v|aligned)$/.test(c.kind)) { var tl = D.trueLength(mesh, tw.frame, c.a, c.b); if (tl != null) { c.value = tl; c.trueDim = true; } }
        c.text = dimText(c, units); dims.push(c);
      });
    });
    // annotations (centre marks, centrelines, hole callouts) are worked out first, so leader texts keep clear of them
    var threads = partThreads(model), holeNames = D.holeSizeNames(model), holeEnds = _.holeEnds(model), annPre = {};
    views.forEach(function (w) { if (w.pending) return; (w.view.annotations || []).forEach(function (an, i) { annPre[w.view.id + ':' + i] = annotationPrims(an, w, k, mesh, doc, units, threads, holeNames, holeEnds); }); });
    // notes (Annotation ▸ Note): multi-line text on the sheet
    // (rfM) a note's $PRP:"name" / $PRPSHEET:"name" links read the drawing's / the part's custom properties, as a title
    // block field does; a leader ends in an arrow at nt.leader. Shop symbols (Surface Finish, Datum Feature, Geometric
    // Tolerance) are paper items like notes.
    var noteCtx = null, noteText = function (t) {
      if (!/\$PRP/.test(t)) return t;
      if (!noteCtx && typeof Materials !== 'undefined' && model) { var asmN = model.type === 'assembly', bN = ctx.build && !!ctx.build.assembly === asmN ? ctx.build : null; noteCtx = { build: bN, mesh: mesh, props: Materials.context(model, { build: bN, mesh: asmN ? null : mesh }) }; }
      return D.titleText(t, doc, model, noteCtx || {});
    };
    // (rfQ) notes and symbols placed on a view move with it
    D.followViews(doc, views, k);
    var notePre = (doc.notes || []).map(function (nt) { return noteItem(nt, k, noteText); });
    var symPre = (doc.symbols || []).map(function (sy) { var r = D.symbolPrims(sy, k, textWidth, ARROW_W, doc); r.id = sy.id; r.type = sy.type; return r; });
    // (rfAN) Hole Tables: each one's rows worked out from its view (reattached origin and holes, sizes, tags), the table
    // on the TABLES layer and the tags and datum arrows on ANNOTATIONS (moving with the view)
    var htTaken = [tbRect].concat(revBx ? [revBx] : [], bom ? [bom.box] : [], tables.map(function (t) { return t.box; }), tbBoxes.slice(1));
    var htPre = (doc.holeTables || []).map(function (t) {
      var w = views.filter(function (x) { return x.view.id === t.view; })[0];
      if (!w || w.pending) return { id: t.id, view: t.view, prims: [], box: null, rows: [], missing: !w, pending: !!w, text: 'Hole Table' };
      // (a table not placed yet goes beside its view, clear of the other views and tables)
      var sheetBox = { x0: b1, y0: b1, x1: S[0] - b1, y1: S[1] - b1, avoid: htTaken.concat(views.filter(function (x) { return x !== w; }).map(function (x) { return x.box; })) };
      var r = D.holeTablePrims(t, w, k, mesh, doc, units, holeEnds, holeNames, textWidth, sheetBox);
      if (r.box) htTaken.push(r.box);
      r.id = t.id; r.view = t.view;
      r.prims.forEach(function (x) { if (x.layer !== 'TABLES') x.view = t.view; });
      return r;
    });
    // what dimensions and Bend Tables keep clear of besides: the Revision Table, the sheet format's left blocks, symbols
    var keepOut = (revBx ? [revBx] : []).concat(tbBoxes.slice(1), symPre.map(function (it) { return it.box; }));
    htPre.forEach(function (it) { if (it.box) keepOut.push(it.box); (it.tagBoxes || []).forEach(function (b) { keepOut.push(b); }); });
    // flat-pattern views: bend notes (or Bend Table tags and the table) and the FLAT SIZE note, worked out before the
    // dimensions so those keep clear of them; a Bend Table goes on free paper (flatCtx: what it must keep clear of)
    var flatPre = [], flatCtx = { views: views, tb: tbRect, bom: bom, sheet: { x0: b1, y0: b1, x1: S[0] - b1, y1: S[1] - b1 }, taken: [] };
    Object.keys(annPre).forEach(function (key) { annPre[key].prims.forEach(function (x) { if (x.k === 'text') flatCtx.taken.push(textRect(x)); }); });
    notePre.forEach(function (it) { flatCtx.taken.push(it.box); });
    keepOut.forEach(function (b) { flatCtx.taken.push(b); });
    views.forEach(function (w) { if (w.flat) flatPre = flatPre.concat(flatItems(w, doc, units, k, flatCtx)); });
    // the flat views' overall width and height (Document Properties ▸ Flat pattern ▸ overall dimensions): model items
    // of their own, kept like the others (styles, suppressed keys), whether or not Model Items is on
    if (D.docOptions(doc).flatDims) views.forEach(function (w) {
      if (!w.flat) return;
      var b = w.flat.bbox, list = [{ view: w.view.id, kind: 'h', a: [b.umin, b.vmin], b: [b.umax, b.vmin], side: -1, value: b.umax - b.umin, auto: true, flat: true },
        { view: w.view.id, kind: 'v', a: [b.umin, b.vmin], b: [b.umin, b.vmax], side: -1, value: b.vmax - b.vmin, auto: true, flat: true }];
      list.forEach(function (d) {
        d.key = autoDimKey(d);
        var sk = d.view + ':' + d.kind; nth[sk] = nth[sk] || 0; d.style = styleKey(d, nth[sk]++);
        var pp = doc.dimProps && doc.dimProps[d.style];
        if (pp) setDimProps(d, pp);
        d.text = dimText(d, units);
        if (suppressed.indexOf(d.key) < 0) dims.push(d);
      });
    });
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
    flatPre.concat(notePre).forEach(function (it) { if (!it.hidden) obs.texts.push(it.box); });
    keepOut.forEach(function (b) { obs.boxes.push({ box: b }); });
    prims.forEach(function (p) { if (p.bend != null) geo.segs.push([p.a, p.b]); });
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
      var dix = shown.length;
      p.forEach(function (x) {
        x.view = d.view; x.dimIx = dix;
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
          if (x.k === 'circle' || x.k === 'arc') { grow([x.c[0] - x.r, x.c[1] - x.r]); grow([x.c[0] + x.r, x.c[1] + x.r]); }   // (rfCU: a cosmetic thread's arc alone)
          if (x.k === 'fill') x.pts.forEach(grow);
          if (x.k === 'text') { var tw = textWidth(x.text, x.h); grow(x.p); grow([x.p[0] + (x.anchor === 'end' ? -tw : tw), x.p[1] + x.h]); }
        });
        annotations.push({ id: an.id, view: w.view.id, index: i, type: an.type, style: an.style || null, auto: !!an.auto, text: r.text, dangling: r.dangling, box: bx, info: r.info });
      });
    });
    // the flat views' bend notes, tags, Bend Tables and FLAT SIZE notes: annotations too (select, drag, hide), with
    // ids 'f<view>:<key>' (key b0, b1 … per bend, 'table', 'size')
    flatPre.forEach(function (it) {
      if (!it.hidden) it.prims.forEach(function (x) { x.view = it.view; prims.push(x); });
      annotations.push({ id: it.id, view: it.view, type: it.type, key: it.key, auto: true, flat: true, hidden: !!it.hidden, off: it.off, text: it.text, dangling: false, box: it.box, info: it.info || null });
    });
    // (rfQ) a note / symbol attached to a view carries its id (x.view), so a dragged view takes it along live
    var notes = notePre.map(function (it, i) {
      var of = (doc.notes[i] || {}).view || null;
      it.prims.forEach(function (x) { if (of) x.view = of; prims.push(x); });
      return { id: it.id, text: it.text, lines: it.lines, p: it.p, h: it.h, box: it.box, raw: it.raw, leader: it.leader || null, view: of };
    });
    var symbols = symPre.map(function (it, i) {
      var of = (doc.symbols[i] || {}).view || null;
      it.prims.forEach(function (x) { if (of) x.view = of; prims.push(x); });
      return { id: it.id, type: it.type, text: it.text, box: it.box, view: of, pts: it.pts || undefined };   // (rfCU) pts: a multi-jog leader's polyline
    });
    var holeTables = htPre.map(function (it) {
      it.prims.forEach(function (x) { prims.push(x); });
      return { id: it.id, view: it.view, box: it.box, text: it.text, dangling: !!it.dangling, missing: !!it.missing, origin: it.origin || null, colX: it.colX || null, rowY: it.rowY || null,
        rows: (it.rows || []).map(function (r) { return { tag: r.tag, x: r.x, y: r.y, xText: r.xText, yText: r.yText, size: r.size.join(' '), lines: r.size.slice(), c: r.c.slice(), r: r.r, dangling: r.dangling }; }) };
    });
    sheetAreaFills(doc, prims, areaFills, HATCH * k, k);
    return { size: S, units: units, prims: prims, views: views, areaFills: areaFills, dims: dims, magLines: magLines, projections: projections, scale: scale, bom: bom, balloons: balloons, annotations: annotations, notes: notes, symbols: symbols, revisions: revisions,
      format: fmtList, tables: tables,   // (rfAE) the sheet format's items, the General Tables
      holeTables: holeTables,   // (rfAN) [{ id, view, box, rows: [{ tag, x, y, xText, yText, size, lines, c, r }], origin (paper) }]
      // (rfT) the dimension style: geo in paper mm (D.dimGeometry), paper in the sheet's units (what prims use: text,
      // arrow, arrowW (full width), gap, ext), prec the decimal places (null: the units' default)
      dimStyle: { geo: _.DIMGEO, paper: _.DIMGEO ? { text: _.DIMGEO.text * k, arrow: _.DIMGEO.arrow * k, arrowW: _.DIMGEO.arrowW * k, gap: _.DIMGEO.gap * k, ext: _.DIMGEO.ext * k } : null, prec: _.DIMSTYLE && _.DIMSTYLE.prec } };
  }
  // ------------------------------------------------------------------ flat-pattern annotations and notes
  // flatItems(w, doc, units, k) -> [{ id, view, key, type: 'bendNote' | 'bendTag' | 'bendTable' | 'flatSize', text,
  // prims, box, hidden }] for flat-pattern view record w. Bend notes ('UP 90° R .030') run along their bend line,
  // centred on it and just beside it (text upright: turned within ±90°); in Bend Table mode each line gets its tag
  // (A, B, C …) there instead and a Bend Table (bendTableCols: TAG / DIRECTION / ANGLE / INNER RADIUS / BEND DED. by
  // default) goes on free paper (tableSpot: under the view when that is clear, else above the title block, beside
  // the view or the first clear spot from the top left); the FLAT SIZE note (Document Properties) under the view,
  // below the overall dimensions. view.flatAnn[key] = { off: [dx, dy] (paper, dragged), hidden } keeps what the user
  // did to each; the texts follow the part on every render. Layers: BEND_NOTES (notes, tags, table) and NOTES (FLAT
  // SIZE). ctx (computeSheet): { views, tb, bom, sheet, taken: [boxes] } — what a table keeps clear of; every item
  // placed here is added to taken, so a second flat view's table keeps clear of the first.
  var BEND_EXT = 1.5, BEND_GAP = 1.2, NOTE_H = 3.5, TABLE_H = 2.5, TABLE_ROW = 6;
  // (lane BX) notes, bend notes and the FLAT SIZE note are as tall as the dimension text (Document Properties ▸
  // Dimensions, paper mm): .125 in on an inch drawing, as ANSI, not 3.5 mm (.138), which stood taller than the dims
  function noteH() { return _.DIMGEO && +_.DIMGEO.text > 0 ? +_.DIMGEO.text : NOTE_H; }
  // the Bend Table's columns: [key, min width (paper mm), header]; view.bendCols lists the optional ones shown
  // ('bd' bend deduction, 'ba' bend allowance, 'k' K-factor, in that order; default ['bd']), as SolidWorks' bend table
  // template takes extra columns
  var TABLE_COLS = [['tag', 12, 'Tag'], ['dir', 24, 'Direction'], ['angle', 18, 'Angle'], ['radius', 30, 'Inner Radius']];
  var TABLE_OPT_COLS = [['bd', 24, 'Bend Ded.'], ['ba', 26, 'Bend Allow.'], ['k', 20, 'K-Factor']];
  function bendTableCols(v) {
    var on = Array.isArray(v.bendCols) ? v.bendCols : ['bd'];
    return TABLE_COLS.concat(TABLE_OPT_COLS.filter(function (c) { return on.indexOf(c[0]) >= 0; }));
  }
  // a Bend Table cell: lengths with the drawing's precision (inch: 3 places, no leading zero, never a fraction —
  // a bend deduction of 3/32 means nothing on the floor; mm: the dimension format); the Inner Radius cell has the
  // leading zero, '0.060', as SolidWorks' bend table--standard template writes it (0.06 at its 2 places, rfGW)
  function bendTableCell(key, b, i, units, prec, T) {
    function len(x) { return x == null || !isFinite(x) ? '-' : numText(x, units, prec != null ? prec : units === 'in' ? 3 : null); }
    if (key === 'tag') return D.bendTag(i);
    if (key === 'dir') return b.up ? 'UP' : 'DOWN';
    if (key === 'angle') return (Math.round(b.angle * 10) / 10) + '°';
    if (key === 'radius') return len(b.R).replace(/^\./, '0.');
    if (key === 'bd') return len(b.bd);
    if (key === 'ba') return len(b.ba);
    if (key === 'k') {
      // the K-factor the bend used (for a bend allowance / deduction / table bend: the one that gives the same BA)
      var th = b.angle * Math.PI / 180, kf = b.ba != null && th > 1e-9 && T > 0 ? (b.ba / th - b.R) / T : null;
      return kf == null || !isFinite(kf) ? '-' : (Math.round(kf * 1000) / 1000).toFixed(3).replace(/0$/, '');
    }
    return '';
  }
  // tableSpot(w, ctx, W, H, under, own, k) -> [x0, yTop]: where a Bend Table W × H (paper) goes: `under` ([x0, yTop]
  // under the flat view, its old place) when that is clear, else stacked above the title block at the right, else
  // beside the view (right, then left), else the first clear spot from the top left of the sheet. Clear: inside the
  // border and apart from the title block, the BOM, every view (with room for its dimensions and label; `own` is the
  // flat view's own paper, overall dimensions and FLAT SIZE note included) and ctx.taken. Tried with roomy margins
  // round the other views first, then tight ones; with nothing clear it stays under the view.
  function tableSpot(w, ctx, W, H, under, own, k) {
    var g = 2 * k, sh = ctx.sheet, tb = ctx.tb, step = 2 * k;
    function obstacles(pad) {
      var list = [tb];
      if (ctx.bom) list.push(ctx.bom.box);
      ctx.views.forEach(function (o) {
        if (o === w) { list.push(own); return; }
        var b = o.box, v = o.view, lab = v.kind === 'section' || v.kind === 'detail' || v.scale ? 14 * k : 0;
        list.push({ x0: b.x0 - 2 * pad, y0: b.y0 - 2 * pad - lab, x1: b.x1 + pad, y1: b.y1 + pad });
      });
      return list.concat(ctx.taken);
    }
    function fits(x0, y1, obs) {
      var r = { x0: x0, y0: y1 - H, x1: x0 + W, y1: y1 };
      if (r.x0 < sh.x0 + g || r.y0 < sh.y0 + g || r.x1 > sh.x1 - g || r.y1 > sh.y1 - g) return false;
      return obs.every(function (o) { return r.x1 + g <= o.x0 || o.x1 + g <= r.x0 || r.y1 + g <= o.y0 || o.y1 + g <= r.y0; });
    }
    var pads = [8 * k, 1 * k];
    for (var pi = 0; pi < pads.length; pi++) {
      var obs = obstacles(pads[pi]), y, x;
      if (fits(under[0], under[1], obs)) return under;
      // above the title block, right-aligned with it, stacked over what is there already
      for (y = tb.y1 + g + H; y <= sh.y1; y += step) if (fits(tb.x1 - W, y, obs)) return [tb.x1 - W, y];
      // beside the view: its top level first, then lower, then higher
      var sides = [own.x1 + g, own.x0 - g - W];
      for (var si = 0; si < sides.length; si++) {
        for (y = own.y1; y - H >= sh.y0; y -= step) if (fits(sides[si], y, obs)) return [sides[si], y];
        for (y = own.y1 + step; y <= sh.y1; y += step) if (fits(sides[si], y, obs)) return [sides[si], y];
      }
      // the first clear spot from the top left
      for (y = sh.y1 - g; y - H >= sh.y0; y -= step) for (x = sh.x0 + g; x + W <= sh.x1; x += step) if (fits(x, y, obs)) return [x, y];
    }
    return under;
  }
  function rectOfText(p, h, text, rot, anchor) {
    var w = textWidth(text, h), a = (rot || 0) * Math.PI / 180, t = [Math.cos(a), Math.sin(a)], n = [-t[1], t[0]], s0 = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
    var r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    [[s0, 0], [s0 + w, 0], [s0, h], [s0 + w, h]].forEach(function (q) {
      var x = p[0] + t[0] * q[0] + n[0] * q[1], y = p[1] + t[1] * q[0] + n[1] * q[1];
      r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y);
    });
    return r;
  }
  // (lane CA, user 2026-10-13) a bend note is as long as it reads ('DOWN 90° R .060' is 1.3 in at .125): one longer
  // than its bend line (less a gap at each end) ran past the flat blank, over the outline and where another note can
  // be. It goes on two lines then ('DOWN 90°' over 'R .060', split where the longer line is shortest), beside the line
  // as before; when even that does not fit (a narrow tab), it runs on from the bend line's end, outside the blank,
  // centred on the line. M: the line's middle, t / n: along / beside it (text upright), L: its length (paper).
  function bendNotePrims(txt, M, t, n, L, g, h, rot, e) {
    function tp(along, across, s, anchor) { return { k: 'text', p: [M[0] + t[0] * along + n[0] * across, M[1] + t[1] * along + n[1] * across], h: h, text: s, anchor: anchor || 'middle', layer: 'BEND_NOTES', rot: rot }; }
    var room = L - 2 * g;
    if (textWidth(txt, h) <= room) return [tp(0, g, txt)];
    var best = null, i = -1;
    while ((i = txt.indexOf(' ', i + 1)) >= 0) {
      var l1 = txt.slice(0, i).trim(), l2 = txt.slice(i + 1).trim();
      if (!l1 || !l2) continue;
      var wd = Math.max(textWidth(l1, h), textWidth(l2, h));
      if (!best || wd < best.w) best = { w: wd, lines: [l1, l2] };
    }
    if (best && best.w <= room) return [tp(0, g + 1.6 * h, best.lines[0]), tp(0, g, best.lines[1])];
    return [tp(L / 2 + e + g, -h / 2, txt, 'start')];
  }
  function flatItems(w, doc, units, k, ctx) {
    var v = w.view, fd = w.flat, o = D.docOptions(doc), mode = v.bendNotes || o.bendNotes, own = v.flatAnn || {}, out = [], box = w.box;
    ctx = ctx || { views: [w], tb: { x0: Infinity, y0: Infinity, x1: Infinity, y1: Infinity }, bom: null, sheet: { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, taken: [] };
    function st(key) { return own[key] || {}; }
    function item(key, type, text, prims, info) {
      var s = st(key), off = s.off || [0, 0], r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      prims.forEach(function (x) {
        if (x.a) { x.a = [x.a[0] + off[0], x.a[1] + off[1]]; x.b = [x.b[0] + off[0], x.b[1] + off[1]]; [x.a, x.b].forEach(function (q) { r.x0 = Math.min(r.x0, q[0]); r.x1 = Math.max(r.x1, q[0]); r.y0 = Math.min(r.y0, q[1]); r.y1 = Math.max(r.y1, q[1]); }); }
        if (x.k === 'text') { x.p = [x.p[0] + off[0], x.p[1] + off[1]]; var tr = rectOfText(x.p, x.h, x.text, x.rot, x.anchor); r.x0 = Math.min(r.x0, tr.x0); r.x1 = Math.max(r.x1, tr.x1); r.y0 = Math.min(r.y0, tr.y0); r.y1 = Math.max(r.y1, tr.y1); }
      });
      out.push({ id: 'f' + v.id + ':' + key, view: v.id, key: key, type: type, text: text, prims: prims, box: r, hidden: !!s.hidden, off: off.slice(), info: info || null });
    }
    // a bend note's settings go under its bend's stable key (Drawing.bendKeyMatch: the feature and edge it comes from,
    // else its place in the flat, found again after a change), so a dragged or hidden note stays with its bend when a
    // rebuild reorders or changes the bends; an older drawing's 'b<n>' (the bend's index) still counts until the note
    // is moved again. view._bendKeys (not saved) lets Drawing.flatAnnotation take a 'b<n>' for that bend's key.
    var bkeys = fd.bends && D.bendKeyMatch ? D.bendKeyMatch(fd.bends, own, fd.bbox ? Math.hypot(fd.bbox.umax - fd.bbox.umin, fd.bbox.vmax - fd.bbox.vmin) : 1) : [];
    try { Object.defineProperty(v, '_bendKeys', { value: bkeys.slice(), configurable: true, writable: true, enumerable: false }); } catch (e) { }
    if (mode !== 'none') fd.bends.forEach(function (b, i) {
      var A = w.toSheet(b.a), B = w.toSheet(b.b), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, t = [dx / L, dy / L];
      if (t[0] < -1e-9 || (Math.abs(t[0]) <= 1e-9 && t[1] < 0)) t = [-t[0], -t[1]];
      var rot = Math.atan2(t[1], t[0]) * 180 / Math.PI, n = [-t[1], t[0]], M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], g = BEND_GAP * k;
      if (Math.abs(rot) < 1e-9) rot = 0;
      // SolidWorks tags the bends from the last made (A) back to the first (measured twice, rfGW)
      var txt = mode === 'table' ? D.bendTag(fd.bends.length - 1 - i) : D.bendNoteText(b, units, { prec: v.bendPrec });
      var bk = bkeys[i] || 'b' + i;
      if (!own[bk] && own['b' + i]) own = Object.assign({}, own, (function () { var o2 = {}; o2[bk] = own['b' + i]; return o2; })());
      item(bk, mode === 'table' ? 'bendTag' : 'bendNote', txt, bendNotePrims(txt, M, t, n, L, g, noteH() * k, rot, BEND_EXT * k),
        { bend: i, bendKey: bk, up: b.up, angle: b.angle, R: b.R, a: A, b: B });
    });
    var yTop = box.y0 - (o.flatDims ? 20 : 8) * k, cx = (box.x0 + box.x1) / 2;
    if (v.flatSize != null ? !!v.flatSize : o.flatSizeNote) {
      var W = fd.bbox.umax - fd.bbox.umin, H = fd.bbox.vmax - fd.bbox.vmin, ts = 'FLAT SIZE ' + D.numText(W, units, null) + ' × ' + D.numText(H, units, null);
      item('size', 'flatSize', ts, [{ k: 'text', p: [cx, yTop - noteH() * k], h: noteH() * k, text: ts, anchor: 'middle', layer: 'NOTES', rot: 0 }], { w: W, h: H });
      yTop -= (noteH() + 5) * k;
    }
    if (mode === 'table' && fd.bends.length) {
      var spec = bendTableCols(v), rh = TABLE_ROW * k, th = TABLE_H * k, T = fd.sheet && +fd.sheet.thickness || 0;
      var tprec = v.bendPrec != null && v.bendPrec !== '' ? +v.bendPrec : _.DIMSTYLE && _.DIMSTYLE.prec != null ? _.DIMSTYLE.prec : null;
      var rows = fd.bends.slice().reverse().map(function (b, i) { return spec.map(function (c) { return bendTableCell(c[0], b, i, units, tprec, T); }); });
      // (a column is as wide as its longest text needs, at least its template width)
      var cols = spec.map(function (c, ci) {
        var cw = c[1] * k;
        [c[2]].concat(rows.map(function (r) { return r[ci]; })).forEach(function (s) { cw = Math.max(cw, textWidth(s, th) + 4 * k); });
        return cw;
      });
      var Wt = cols.reduce(function (s, x) { return s + x; }, 0), Ht = rh * (rows.length + 1);
      var ownPaper = { x0: box.x0 - (o.flatDims ? 18 : 3) * k, y0: yTop + 2 * k, x1: box.x1 + 3 * k, y1: box.y1 + 3 * k };
      var spot = tableSpot(w, ctx, Wt, Ht, [box.x0, yTop], ownPaper, k);
      var x0 = spot[0], ps = [], y1 = spot[1];
      function ln(a, b2, style) { ps.push({ k: 'line', a: a, b: b2, layer: 'BEND_NOTES', style: style || 'thin' }); }
      ln([x0, y1], [x0 + Wt, y1], 'thick'); ln([x0 + Wt, y1], [x0 + Wt, y1 - Ht], 'thick'); ln([x0 + Wt, y1 - Ht], [x0, y1 - Ht], 'thick'); ln([x0, y1 - Ht], [x0, y1], 'thick');
      for (var ri = 1; ri <= rows.length; ri++) ln([x0, y1 - ri * rh], [x0 + Wt, y1 - ri * rh]);
      var cxs = [x0];
      cols.forEach(function (c, ci) { cxs.push(cxs[ci] + c); if (ci < cols.length - 1) ln([cxs[ci + 1], y1], [cxs[ci + 1], y1 - Ht]); });
      [spec.map(function (c) { return c[2]; })].concat(rows).forEach(function (r, ri) {
        r.forEach(function (s, ci) { ps.push({ k: 'text', p: [(cxs[ci] + cxs[ci + 1]) / 2, y1 - (ri + 1) * rh + (rh - th) / 2], h: th, text: s, anchor: 'middle', layer: 'BEND_NOTES', rot: 0 }); });
      });
      item('table', 'bendTable', 'Bend Table (' + rows.length + ')', ps, { rows: rows, columns: spec.map(function (c) { return c[2]; }), keys: spec.map(function (c) { return c[0]; }) });
    }
    out.forEach(function (it) { if (!it.hidden) ctx.taken.push(it.box); });
    return out;
  }
  // noteItem(note, k) -> { id, text, lines, p, h, prims, box }: a note's lines on the NOTES layer, the first line's
  // baseline at note.p (paper), 1.6 × the text height apart, left aligned
  // (rfM) evalText(text) evaluates the $PRP / $PRPSHEET links (the note keeps its raw text, the sheet shows the value);
  // nt.leader: a leader from the nearer side of the first line (a 4 mm shoulder) to an arrow at that paper point
  function noteItem(nt, k, evalText) {
    var raw = String(nt.text == null ? '' : nt.text), shown = evalText ? evalText(raw) : raw;
    var h = (+nt.h > 0 ? +nt.h : noteH()) * k, lines = shown.split('\n'), prims = [], r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    if (nt.border || nt.list) { var lay = _.noteLayout(nt, lines, h, k, textWidth); prims = lay.prims; r = lay.box; }   // (rfCU) a border, a numbered / bulleted list
    else lines.forEach(function (s, i) {
      var p = [nt.p[0], nt.p[1] - i * h * 1.6];
      if (s.length) prims.push({ k: 'text', p: p, h: h, text: s, anchor: 'start', layer: 'NOTES', rot: 0, note: nt.id });
      r.x0 = Math.min(r.x0, p[0]); r.x1 = Math.max(r.x1, p[0] + Math.max(textWidth(s, h), h * 0.5)); r.y0 = Math.min(r.y0, p[1]); r.y1 = Math.max(r.y1, p[1] + h);
    });
    if (nt.leader) {
      var tip = nt.leader, left = tip[0] < (r.x0 + r.x1) / 2, y = nt.p[1] + h / 2, at = [left ? r.x0 - 1 * k : r.x1 + 1 * k, y], sh = [at[0] + (left ? -SHOULDER : SHOULDER) * k, y];
      var d = [tip[0] - sh[0], tip[1] - sh[1]], n = Math.hypot(d[0], d[1]) || 1, u = [d[0] / n, d[1] / n], w = ARROW_W * k;
      prims.push({ k: 'line', a: at, b: sh, layer: 'NOTES', style: 'thin', note: nt.id }, { k: 'line', a: sh, b: tip, layer: 'NOTES', style: 'thin', note: nt.id });
      prims.push({ k: 'fill', pts: [tip, [tip[0] - u[0] * 3 * k + u[1] * w, tip[1] - u[1] * 3 * k - u[0] * w], [tip[0] - u[0] * 3 * k - u[1] * w, tip[1] - u[1] * 3 * k + u[0] * w]], layer: 'NOTES', note: nt.id });
    }
    return { id: nt.id, text: shown, raw: raw, lines: lines, p: nt.p.slice(), h: h, prims: prims, box: r, leader: nt.leader ? nt.leader.slice() : null };
  }
  function layerName(v, used) {
    var base = v.kind === 'section' ? 'SECTION_' + v.label : v.kind === 'detail' ? 'DETAIL_' + v.label : v.kind === 'flat' ? 'FLAT_PATTERN' : String(v.orient).toUpperCase(), name = base, n = 2;
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
  // (lane BX) a radius entry with a third element 1 sits on the concave side: the leader runs from the arc through the
  // centre into the empty corner (a sheet-metal bend's inside radius in a front view, whose outside is where the
  // overall height dimension stands), arrow pointing out onto the arc, as ASME Y14.5 allows
  var ALT_RAD = [[0.5, 8], [0.5, 16], [0.25, 8], [0.75, 8], [0.25, 16], [0.75, 16], [0.1, 12], [0.9, 12], [0.5, 26], [0.25, 26], [0.75, 26],
    [0.5, 8, 1], [0.5, 14, 1], [0.25, 10, 1], [0.75, 10, 1], [0.5, 22, 1]];
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
  function clashCost(g, obs, k, own, lines) {
    // (lane BX) a radius keeps a text height clear of other texts: '2X R.060' stacked tight on the overall height's
    // '3.680' reads as one note
    var c = 0, m = 0.8 * k, mt = lines ? 2.5 * k : m;
    g.texts.forEach(function (t) {
      var tm = { x0: t.x0 - m / 2, y0: t.y0 - m / 2, x1: t.x1 + m / 2, y1: t.y1 + m / 2 };
      obs.texts.forEach(function (o) { if (rectsMeet(t, o, mt)) c += 10; });
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
    // (lane BX) a radius leader that crosses another dimension's lines, or the part's outline on its way out (a bend's
    // inside radius led out through the sheet), costs too: the clear way is the empty side of the arc
    if (lines) g.segs.forEach(function (s) {
      obs.segs.forEach(function (o) { if (segsCross(s[0], s[1], o[0], o[1])) c += 2; });
      if (obs.geo) obs.geo.segs.forEach(function (o) { if (segsCross(s[0], s[1], o[0], o[1])) c += 1; });
    });
    return c;
  }
  // do segments ab and cd cross (each passing strictly between the other's ends)?
  function segsCross(a, b, p, q) {
    function side(o, e, x) { return (e[0] - o[0]) * (x[1] - o[1]) - (e[1] - o[1]) * (x[0] - o[0]); }
    var d1 = side(p, q, a), d2 = side(p, q, b), d3 = side(a, b, p), d4 = side(a, b, q), eps = 1e-12;
    return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
  }
  // (rfDD2) a linear dimension whose text is wider than its span (a short span in a small-scale view) goes outside,
  // beyond the far arrow; when that spot sits on another dimension's or the part's lines, the text goes beyond the
  // other arrow, or further out along the dimension line on either side (the line running on to it, as SolidWorks
  // flips it outside), whichever is clear first, nearest first. A text placed by a click (tside), dragged (tx) or with
  // flipped arrows keeps its place (a click between the lines keeps the far-arrow rule, rfCA); a text that fits
  // between the extension lines is not moved.
  function placeLinearOut(d, vw, k, placed, obs) {
    var p0 = dimPrims(d, vw, k, placed), off0 = d.txNow;
    if (!(Math.abs(off0 || 0) > 1e-9)) return p0;
    var c0 = clashCost(primGeo(p0), obs, k, d.view, false);
    if (c0 === 0) return p0;
    var t0 = d.tside, hadT = 'tside' in d;
    d.tside = -1; dimPrims(d, vw, k, placed);
    var offL = d.txNow;
    if (hadT) d.tside = t0; else delete d.tside;
    var step = 3 * k, best = null, bestCost = c0;
    var cands = [{ tx: offL }];
    for (var j = 1; j <= 3; j++) cands.push({ tx: off0 + (off0 > 0 ? 1 : -1) * j * step, j: j }, { tx: offL + (offL > 0 ? 1 : -1) * j * step, j: j });
    for (var i = 0; i < cands.length; i++) {
      d.tx = cands[i].tx;
      var c = clashCost(primGeo(dimPrims(d, vw, k, placed)), obs, k, d.view, false) + 0.5 * (cands[i].j || 0);
      if (c < bestCost) { bestCost = c; best = cands[i]; }
      if (c === 0) break;
    }
    delete d.tx;
    if (!best) return dimPrims(d, vw, k, placed);
    d.tx = best.tx;
    var p = dimPrims(d, vw, k, placed);
    delete d.tx;
    return p;
  }
  // dimPrims for a dimension, an unplaced radius / diameter (no dragged leader) trying ALT_* until it is clear
  function placeDim(d, vw, k, placed, obs) {
    if (obs && /^(h|v|aligned)$/.test(d.kind) && d.tx == null && !d.flip && d.tside == null) return placeLinearOut(d, vw, k, placed, obs);
    if ((d.kind !== 'rad' && d.kind !== 'dia') || d.lead || !obs) return dimPrims(d, vw, k, placed);
    var alts = d.kind === 'rad' ? ALT_RAD : ALT_DIA, best = 0, bestCost = Infinity;
    for (var i = 0; i < alts.length; i++) {
      d._alt = i;
      var c = clashCost(primGeo(dimPrims(d, vw, k, placed)), obs, k, d.view, d.kind === 'rad');
      if (c < bestCost) { best = i; bestCost = c; }
      if (c === 0) break;
    }
    d._alt = best;
    var p = dimPrims(d, vw, k, placed);
    delete d._alt;
    return p;
  }
  function dimPrims(d, vw, k, placed) {
    // (rfT) text height, arrow and extension-line sizes from the drawing's dimension style (D.dimGeometry, paper mm)
    var G = _.DIMGEO || { text: 3.5, arrow: 3, arrowW: 2 * ARROW_W, gap: 1.5, ext: 2 };
    var out = [], L = 'DIMENSIONS', th = G.text * k, ar = G.arrow * k, aw = G.arrowW / 2 * k, units = k === 1 ? 'mm' : 'in';
    if (d.kind === 'angrun' || d.kind === 'pathlen') return _.ctDimPrims(d, vw, k, { th: th, ar: ar, aw: aw, gap: G.gap * k, ext: G.ext * k }, units);   // (lane CT, drawing-annotations.js)
    function line(a, b) { out.push({ k: 'line', a: a, b: b, layer: L, style: 'thin' }); }
    function arrow(tip, dir) {
      var n = [-dir[1], dir[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: L });
    }
    // the dimension text at p (anchor, rotation): one text, or the value with its tolerance stacked beside it
    function label(p, anchor, rot, lab) {
      if (lab.upper == null) {
        out.push({ k: 'text', p: p, h: th, text: lab.main, anchor: anchor, layer: L, rot: rot });
        // sketch-ordinate: a Basic dimension (from the sketch's Dimension PM) in a box
        if (lab.basic) {
          var ra = rot * Math.PI / 180, tb = [Math.cos(ra), Math.sin(ra)], nb = [-tb[1], tb[0]], wb = textWidth(lab.main, th), pb = th * 0.35;
          var sb = anchor === 'middle' ? -wb / 2 : anchor === 'end' ? -wb : 0;
          var cnr = [[sb - pb, -pb], [sb + wb + pb, -pb], [sb + wb + pb, th + pb], [sb - pb, th + pb]].map(function (q) { return [p[0] + tb[0] * q[0] + nb[0] * q[1], p[1] + tb[1] * q[0] + nb[1] * q[1]]; });
          for (var ci = 0; ci < 4; ci++) out.push({ k: 'line', a: cnr[ci], b: cnr[(ci + 1) % 4], layer: L, style: 'thin' });
        }
        return;
      }
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
    // (rfAL) a diameter / radius of an ellipse (a circle seen obliquely, d.ell: its conjugate radii in view units):
    // the arrow lands on the ellipse, reach(u) from the centre along u; the value is the circle's true size
    var sEll = null;
    if (d.ell && (d.kind === 'rad' || d.kind === 'dia')) {
      var ec = vw.toSheet(d.c), ex = vw.toSheet([d.c[0] + d.ell.ax[0], d.c[1] + d.ell.ax[1]]), ey = vw.toSheet([d.c[0] + d.ell.ay[0], d.c[1] + d.ell.ay[1]]);
      sEll = { ax: [ex[0] - ec[0], ex[1] - ec[1]], ay: [ey[0] - ec[0], ey[1] - ec[1]] };
    }
    function reach(u, r0) { return sEll ? D.ellipseReach(sEll, u) : r0; }
    if (d.kind === 'rad') {
      // a radius: the leader leaves the arc at its middle, straight out from the centre; arrow on the arc
      // (an unplaced one tries other points along the arc and longer leaders until it is clear of the others: d._alt)
      var ralt = ALT_RAD[d._alt || 0] || ALT_RAD[0], ra0 = d.a0 || 0, ra1 = d.a1 != null ? d.a1 : 360;
      var rc = vw.toSheet(d.c), rr = d.r * vw.scale, am = (ra0 + (ra1 - ra0) * ralt[0]) * Math.PI / 180, ru, rin = false;
      // (lane BX) is direction u (sheet) on the arc a0 → a1 (degrees, counter-clockwise)?
      var onArc = function (u) {
        var span = ra1 - ra0;
        if (span >= 360 - 1e-9) return true;
        span = (span % 360 + 360) % 360;
        var s = ((Math.atan2(u[1], u[0]) * 180 / Math.PI - ra0) % 360 + 360) % 360;
        return s <= span + 1e-6 || s >= 360 - 1e-6;
      };
      if (d.lead) {
        var rl = Math.hypot(d.lead[0], d.lead[1]) || 1; ru = [d.lead[0] / rl, d.lead[1] / rl];
        // a leader dragged to the arc's concave side: the arrow meets the arc from inside, through the centre
        if (!sEll && !onArc(ru) && onArc([-ru[0], -ru[1]])) { ru = [-ru[0], -ru[1]]; rin = true; }
      }
      else if (sEll) {
        // along an elliptical arc: the point at the same fraction of its parameter range
        var et0 = d.ell.t0 != null ? d.ell.t0 : 0, et1 = d.ell.t1 != null ? d.ell.t1 : 2 * Math.PI, et = et0 + (et1 - et0) * ralt[0];
        var ew = [sEll.ax[0] * Math.cos(et) + sEll.ay[0] * Math.sin(et), sEll.ax[1] * Math.cos(et) + sEll.ay[1] * Math.sin(et)], ewl = Math.hypot(ew[0], ew[1]) || 1;
        ru = [ew[0] / ewl, ew[1] / ewl];
      } else { ru = [Math.cos(am), Math.sin(am)]; rin = !!ralt[2] && ra1 - ra0 < 360 - 1e-9; }
      rr = reach(ru, rr);
      var rtip = [rc[0] + ru[0] * rr, rc[1] + ru[1] * rr];
      var rel = d.lead ? [rc[0] + d.lead[0], rc[1] + d.lead[1]] : rin ? [rc[0] - ru[0] * ralt[1] * k, rc[1] - ru[1] * ralt[1] * k] : [rtip[0] + ru[0] * ralt[1] * k, rtip[1] + ru[1] * ralt[1] * k];
      leader(rtip, rel, labMain, rin ? [ru[0], ru[1]] : [-ru[0], -ru[1]]);
      d.leadNow = [rel[0] - rc[0], rel[1] - rc[1]];
      var rsg = rel[0] >= rtip[0] - 1e-9 ? 1 : -1;
      d.dxf = { type: 'rad', p10: rc.slice(), p15: rtip.slice(), p11: [rel[0] + rsg * (SHOULDER + TEXT_GAP) * k + rsg * labWidth(labMain) / 2, rel[1]], lead: Math.hypot(rel[0] - rtip[0], rel[1] - rtip[1]) };
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
        var tip0 = [c[0] + u[0] * reach(u, r), c[1] + u[1] * reach(u, r)];
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
      var ru2 = reach(u, r), tip = d.flip ? [c[0] - u[0] * ru2, c[1] - u[1] * ru2] : [c[0] + u[0] * ru2, c[1] + u[1] * ru2];
      var sgd = (d.lead ? d.lead[0] : u[0]) >= 0 ? 1 : -1;
      line(tip, elbow); line(elbow, [elbow[0] + sgd * SHOULDER * k, elbow[1]]); arrow(tip, [-u[0], -u[1]]);
      label([elbow[0] + sgd * (SHOULDER + TEXT_GAP) * k, elbow[1] - th / 2], sgd > 0 ? 'start' : 'end', 0, labMain);
      d.leadNow = [elbow[0] - c[0], elbow[1] - c[1]];
      // (rfT) DXF: the circle's two definition points (10 the far side, 15 the arrow's), the text at the shoulder
      d.dxf = { type: 'dia', p10: [2 * c[0] - tip[0], 2 * c[1] - tip[1]], p15: tip.slice(), p11: [elbow[0] + sgd * (SHOULDER + TEXT_GAP) * k + sgd * labWidth(labMain) / 2, elbow[1]], lead: Math.hypot(elbow[0] - tip[0], elbow[1] - tip[1]) };
      return out;
    }
    if (d.kind === 'chamfer') {
      var A = vw.toSheet(d.a), B = vw.toSheet(d.b), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], cc = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var lead = d.lead || [(m[0] >= cc[0] ? 1 : -1) * 10 * k, (m[1] >= cc[1] ? 1 : -1) * 10 * k], el = [m[0] + lead[0], m[1] + lead[1]], lu = Math.hypot(lead[0], lead[1]) || 1;
      leader(m, el, labMain, [-lead[0] / lu, -lead[1] / lu]);
      d.leadNow = lead.slice();
      return out;
    }
    var gapE = G.gap * k, ext = G.ext * k;
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
      // (lane CA) placed by a click (d.tside, Drawing.smartDim): between the extension lines the text stays there when it
      // fits between them, the arrows going outside if they do not (SolidWorks); a click outside puts it outside on
      // that side; with no click (model items) or no room, beyond the far arrow
      if (tx == null) {
        if (d.tside === -1) c = lo - xo - half;
        else if (d.tside === 1 || (!fits && !(d.tside === 0 && hi - lo >= 2 * half - 1e-9))) c = hi + xo + half;
      }
      var inside = c - half >= lo - 1e-9 && c + half <= hi + 1e-9;
      var l0 = out ? lo - xo : lo, l1 = out ? hi + xo : hi;
      if (inside) { if (c - half > l0) line(P(l0, pos), P(c - half, pos)); if (c + half < l1) line(P(c + half, pos), P(l1, pos)); }
      else if (c > mid) line(P(l0, pos), P(Math.max(l1, c - half), pos));
      else line(P(Math.min(l0, c + half), pos), P(l1, pos));
      if (out) { arrow(P(lo, pos), P(1, 0)); arrow(P(hi, pos), P(-1, 0)); } else { arrow(P(lo, pos), P(-1, 0)); arrow(P(hi, pos), P(1, 0)); }
      d.txNow = c - mid;
      // (rfT) the DXF DIMENSION's definition points (toDXF R2000): the extension lines' origins, the dimension line
      // at the second one, the text's middle
      if (d.kind === 'h' || d.kind === 'v') d.dxf = { type: 'linear', ang: hz ? 0 : 90, p13: a.slice(), p14: b.slice(), p10: P(b[i0], pos), p11: P(c, pos) };
      if (hz) label([c, pos - th / 2], 'middle', 0, lab);
      else label([pos, c - th / 2], 'middle', 0, lab);
    }
    if (d.kind === 'ordinate' || d.kind === 'baseline') {
      var hz2 = d.dir !== 'v', ax = hz2 ? 0 : 1, items = [{ ref: d.base, val: 0 }].concat(d.refs.map(function (r2, i) { return { ref: r2, val: (d.values || [])[i] || 0, vp: d.valueProps && d.valueProps[i] || null }; }));
      var side = d.side || 1, sp = function (ref) { return ref.kind === 'dia' ? vw.toSheet(ref.c) : null; };
      // the feature point of a reference: a circle centre, or the end of an edge nearest the dimension side
      items.forEach(function (it) {
        var q = sp(it.ref);
        if (!q) { var e0 = vw.toSheet(it.ref.a), e1 = vw.toSheet(it.ref.b); q = (e0[1 - ax] - e1[1 - ax]) * side > 0 ? e0 : e1; if (Math.abs(e0[1 - ax] - e1[1 - ax]) < 1e-9) q = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2]; q[ax] = vw.toSheet(ax ? [0, refPos(it.ref, 1)] : [refPos(it.ref, 0), 0])[ax]; }
        it.p = q;
      });
      // (d.outer: paper mm more, a sketch's ordinate set beside the overall size below / left of the view)
      var lvl = d.at != null ? vw.toSheet(hz2 ? [0, d.at] : [d.at, 0])[1 - ax] : (hz2 ? (side > 0 ? box.y1 : box.y0) : (side > 0 ? box.x1 : box.x0)) + side * (10 + (+d.outer || 0)) * k;
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
          // (a member with its sketch dimension's tolerance / precision / text: d.valueProps, Drawing.sketchOrdinateProps)
          var tt = it.vp ? D.ordinateValueText(Math.abs(it.val), it.vp, units, prec) : numText(Math.abs(it.val), units, prec);
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
      if (d.tx == null) {   // (lane CA) where the click was, as linear()
        if (d.tside === -1) sc = -xo2 - half2;
        else if (d.tside === 1 || (!fits2 && !(d.tside === 0 && Ln >= 2 * half2 - 1e-9))) sc = Ln + xo2 + half2;
      }
      var s0a = out2 ? -xo2 : 0, s1a = out2 ? Ln + xo2 : Ln, At = function (s) { return [pa[0] + t[0] * s, pa[1] + t[1] * s]; };
      if (sc - half2 >= -1e-9 && sc + half2 <= Ln + 1e-9) { if (sc - half2 > s0a) line(At(s0a), At(sc - half2)); if (sc + half2 < s1a) line(At(sc + half2), At(s1a)); }
      else if (sc > Ln / 2) line(At(s0a), At(Math.max(s1a, sc - half2)));
      else line(At(Math.min(s0a, sc + half2)), At(s1a));
      if (out2) { arrow(pa, t); arrow(pb, [-t[0], -t[1]]); } else { arrow(pa, [-t[0], -t[1]]); arrow(pb, t); }
      d.txNow = (sc - Ln / 2) * sd;
      var cpt = At(sc);
      d.dxf = { type: 'aligned', p13: a.slice(), p14: b.slice(), p10: pb.slice(), p11: cpt.slice() };
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
  var STROKE = { visible: 0.5, hidden: 0.35, thin: 0.25, thick: 0.7, hatch: 0.18, chain: 0.7, center: 0.25, tangent: 0.35, tanfont: 0.25, bendup: 0.25, benddown: 0.25, etch: 0.25 };
  var CENTER_DASH = [6, 1.5, 1.5, 1.5];   // centre marks and centrelines: long dash, short dash (paper mm)
  // plainText(s): text for writers without the ASME symbol glyphs (DXF R12, PDF Helvetica): ↧ 10 -> X 10 DEEP,
  // ⌴ -> CBORE, ⌵ -> CSK (the words the symbols replaced)
  function plainText(t) {
    return String(t).replace(/\u21a7\s*([^\s,]+)/g, 'X $1 DEEP').replace(/\u2334\s*/g, 'CBORE ').replace(/\u2335\s*/g, 'CSK ');
  }
  // SolidWorks draws dangling annotations (their model reference is gone) in olive brown; a flat pattern's etch marks
  // are green, as the sketches' ETCH layer (ACI 3)
  // (rfAN) Line Format: rgbOf(p) -> the primitive's own colour '#rrggbb' (p.rgb), or null; DXF lineweights snap to
  // the values AutoCAD accepts (1/100 mm)
  function rgbOf(p) { return p && typeof p.rgb === 'string' && /^#[0-9a-f]{6}$/i.test(p.rgb) ? p.rgb.toLowerCase() : null; }
  var DXF_LW = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
  function dxfLw(mm) { var v = Math.round(mm * 100), best = DXF_LW[0]; DXF_LW.forEach(function (x) { if (Math.abs(x - v) < Math.abs(best - v)) best = x; }); return best; }
  var COLORS = { dangling: '#a07c00', etch: '#1e9e3c' }, DXF_COLORS = { dangling: 42, etch: 3 }, PDF_COLORS = { dangling: '0.627 0.486 0', etch: '0.118 0.62 0.235' };
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
  // (lane CA, user 2026-10-13) a hidden line (or a DOWN bend line) shorter than one dash and its gap drew as a solid
  // tick from its start: the hole walls through 16 ga at 1:2 read as visible edges. shortDash(len, dash, gap) -> null
  // (long enough: the pattern runs as it is) or [dash, gap, phase] (sheet units): one dash centred on the segment,
  // with a clear gap at both ends (a quarter of it, at most half a gap), so it reads as hidden and stands apart from the
  // outlines it meets. SVG and PDF draw it so (butt ends); DXF keeps the true line on its HIDDEN linetype.
  function shortDash(len, dash, gap) {
    if (!(len > 0) || len >= dash + gap - 1e-12) return null;
    var e = Math.min(gap / 2, len / 4);
    return [len - 2 * e, 2 * e, len - e];
  }
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
          if (p.style === 'hidden') {
            var clen = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
            for (var pk = pi + 1; lst[pk] && lst[pk].chain === p.chain; pk++) clen += Math.hypot(lst[pk].b[0] - lst[pk].a[0], lst[pk].b[1] - lst[pk].a[1]);
            var sdc = shortDash(clen, 3 * k, 1.5 * k);
            if (sdc) dshc = ' stroke-dasharray="' + num(sdc[0]) + ' ' + num(sdc[1]) + '" stroke-dashoffset="' + num(sdc[2]) + '" stroke-linecap="butt"';
          }
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
        // (rfAN) Line Format: a primitive's own weight (p.lw, paper mm) and colour (p.rgb '#rrggbb') win over its style's
        var sw = num((p.lw > 0 ? +p.lw : STROKE[p.style] || 0.25) * k), cls = p.style ? ' class="' + p.style + '"' : '';
        var dsh = p.style === 'hidden' || p.style === 'benddown' ? ' stroke-dasharray="' + dash + '"' : p.style === 'chain' || p.style === 'tanfont' ? ' stroke-dasharray="' + chain + '"' : p.style === 'center' ? ' stroke-dasharray="' + center + '"' : '';
        var col = p.color && COLORS[p.color];
        if (col) { dsh += p.k === 'fill' || p.k === 'text' ? '' : ' stroke="' + col + '"'; cls += ' data-color="' + p.color + '"'; }
        else if (rgbOf(p)) { col = rgbOf(p); dsh += p.k === 'fill' || p.k === 'text' ? '' : ' stroke="' + col + '"'; }
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
        } else if (p.k === 'line') {
          var sdl = (p.style === 'hidden' || p.style === 'benddown') && shortDash(Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), 3 * k, 1.5 * k);
          if (sdl) dsh = dsh.replace(/ stroke-dasharray="[^"]*"/, ' stroke-dasharray="' + num(sdl[0]) + ' ' + num(sdl[1]) + '" stroke-dashoffset="' + num(sdl[2]) + '" stroke-linecap="butt"');
          out.push('<line' + cls + ' x1="' + X(p.a) + '" y1="' + Y(p.a) + '" x2="' + X(p.b) + '" y2="' + Y(p.b) + '" stroke-width="' + sw + '"' + dsh + '/>');
        }
        else if (p.k === 'circle') out.push('<circle' + cls + ' cx="' + X(p.c) + '" cy="' + Y(p.c) + '" r="' + num(p.r) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'fill') out.push('<path' + (p.color && COLORS[p.color] ? ' data-color="' + p.color + '"' : '') + ' d="M' + p.pts.map(function (q) { return X(q) + ' ' + Y(q); }).join(' L') + ' Z" fill="' + (col || '#000') + '" stroke="none"/>');
        else if (p.k === 'region') out.push('<path class="hatch-fill" d="' + p.loops.map(function (l) { return 'M' + l.map(function (q) { return X(q) + ' ' + Y(q); }).join(' L') + ' Z'; }).join(' ') + '" fill="' + (col || '#000') + '" fill-rule="evenodd" stroke="none"/>');   // (rfAG) a solid area fill
        else if (p.k === 'text') {
          var tr = p.rot ? ' transform="rotate(' + num(-p.rot) + ' ' + X(p.p) + ' ' + Y(p.p) + ')"' : '';
          out.push('<text x="' + X(p.p) + '" y="' + Y(p.p) + '" font-size="' + num(p.h / CAP_EM) + '" text-anchor="' + p.anchor + '" fill="' + (col || '#000') + '" stroke="none"' + tr + (p.color && COLORS[p.color] ? ' data-color="' + p.color + '"' : '') + '>' + esc(p.text) + '</text>');
        }
      });
      if (run != null) out.push('</g>');
      grp.body = out.join('\n');
    });
    return res;
  }

  // toDXF(sheet, { version }): one layer per drawing view (FRONT, TOP, RIGHT, ISOMETRIC…), plus DIMENSIONS and SHEET;
  // hidden edges use the HIDDEN linetype. Paper units ($INSUNITS 4 = mm, 1 = in). version 'R12' (AC1009, the default:
  // HEADER, TABLES, ENTITIES; an ellipse as a POLYLINE) or 'R2000' (AC1015, laid out as Kernel.exportDXFFlat writes it:
  // HEADER with $HANDSEED, CLASSES, the nine symbol tables, BLOCKS for model / paper space, ENTITIES with handles and
  // subclass markers, OBJECTS with the root dictionary; a true ELLIPSE, and each line's weight (370) from the sheet's
  // strokes). Both write true LINE / CIRCLE / ARC, SOLID arrowheads and TEXT (dimensions exploded, as on the sheet).
  // a text as DXF writes it: %%c for Ø, %%p for ±, %%d for °, plain ASCII
  function dxfText(t) { return plainText(t).replace(/\n/g, ' ').replace(/Ø/g, '%%c').replace(/±/g, '%%p').replace(/°/g, '%%d').replace(/×/g, 'x').replace(/[^\x20-\x7e]/g, '?'); }
  function dxfVersionOf(v) { return /^(r?2000|ac1015|1015)$/i.test(String(v || '').trim()) ? 'R2000' : 'R12'; }
  function toDXF(sheet, opts) {
    var r2000 = dxfVersionOf(opts && opts.version) === 'R2000';
    var L = [];
    // (rfT) R2000: every linear / aligned / diameter / radius (rfV: and angle) dimension is a true DIMENSION entity, its drawn lines,
    // arrows and text in its own anonymous block *D1, *D2 … (what AutoCAD writes, so a reader without dimension
    // support still shows them, and AutoCAD / Mastercam read the value and can restyle it); R12 keeps them exploded.
    var dimGroups = [], dimOf = {};
    if (r2000 && opts && opts.dimensions !== false) (sheet.dims || []).forEach(function (d, i) {
      if (!d || !d.dxf || !{ h: 1, v: 1, aligned: 1, dia: 1, rad: 1, angle: 1 }[d.kind]) return;   // ordinate / baseline / chamfer stay exploded
      var g = { d: d, prims: [], name: '*D' + (dimGroups.length + 1) };
      dimOf[i] = g; dimGroups.push(g);
    });
    sheet.prims.forEach(function (p) { if (p.dimIx != null && dimOf[p.dimIx]) dimOf[p.dimIx].prims.push(p); });
    function pr(c, v) { L.push(String(c), String(v)); }
    var layers = [];
    sheet.prims.forEach(function (p) { if (layers.indexOf(p.layer) < 0) layers.push(p.layer); });
    var colors = { SHEET: 7, DIMENSIONS: 3, BOM: 7, BALLOONS: 3, ANNOTATIONS: 3, BEND_UP: 3, BEND_DOWN: 1, BEND_NOTES: 3, NOTES: 7, ETCH: 3, SYMBOLS: 7, REVISIONS: 7, TABLES: 7 }, THIN = { hatch: 1, tangent: 1, tanfont: 1, center: 1 };
    var inch = sheet.units === 'in';
    // R2000 handles: the fixed ones AutoCAD's own drawings use (tables 1–A, root dictionary C, ACAD_GROUP D, layer 0
    // 10, Standard 11, ACAD 12, ByBlock / ByLayer / Continuous 14–16, paper space 1B–1D, model space 1F–21), every
    // other one from 30 up (as Kernel.exportDXFFlat)
    var h = 0x2F;
    function H() { return (++h).toString(16).toUpperCase(); }
    var th = { BLOCK_RECORD: '1', LAYER: '2', STYLE: '3', LTYPE: '5', VIEW: '6', UCS: '7', VPORT: '8', APPID: '9', DIMSTYLE: 'A' }, msBR = '1F', psBR = '1B';
    function table(name, count, records) {
      pr(0, 'TABLE'); pr(2, name);
      if (r2000) { pr(5, th[name]); pr(330, 0); pr(100, 'AcDbSymbolTable'); }
      pr(70, count);
      if (r2000 && name === 'DIMSTYLE') pr(100, 'AcDbDimStyleTable');
      records();
      pr(0, 'ENDTAB');
    }
    function record(type, sub, handle) {
      pr(0, type);
      if (r2000) { pr(type === 'DIMSTYLE' ? 105 : 5, handle || H()); pr(330, th[type]); pr(100, 'AcDbSymbolTableRecord'); pr(100, sub); }
    }
    pr(0, 'SECTION'); pr(2, 'TABLES');
    if (r2000) table('VPORT', 1, function () {
      var S = sheet.size;
      record('VPORT', 'AcDbViewportTableRecord');
      pr(2, '*Active'); pr(70, 0); pr(10, 0); pr(20, 0); pr(11, 1); pr(21, 1);
      pr(12, num(S[0] / 2)); pr(22, num(S[1] / 2)); pr(13, 0); pr(23, 0); pr(14, 1); pr(24, 1); pr(15, 0); pr(25, 0);
      pr(16, 0); pr(26, 0); pr(36, 1); pr(17, 0); pr(27, 0); pr(37, 0); pr(40, num(Math.max(S[1], S[0] / 1.5) * 1.05)); pr(41, 1.5); pr(42, 50);
      pr(43, 0); pr(44, 0); pr(50, 0); pr(51, 0); pr(71, 0); pr(72, 100); pr(73, 1); pr(74, 3); pr(75, 0); pr(76, 0); pr(77, 0); pr(78, 0);
    });
    var useCenter = sheet.prims.some(function (p) { return p.style === 'center'; });   // CENTER only when a centre mark / line uses it
    // [name, description, total, dashes (paper mm; $LTSCALE takes them to inches)]
    var ltypes = [['HIDDEN', '__ __ __ __', 4.5, [3, -1.5]], ['PHANTOM', '____ _ ____ _', 12.5, [8, -1.5, 1.5, -1.5]]];
    if (useCenter) ltypes.push(['CENTER', '____ _ ____ _', 10.5, [6, -1.5, 1.5, -1.5]]);
    var std = r2000 ? [['ByBlock', '', '14'], ['ByLayer', '', '15'], ['Continuous', 'Solid line', '16']] : [['CONTINUOUS', 'Solid line']];
    var cont = r2000 ? 'Continuous' : 'CONTINUOUS';
    table('LTYPE', std.length + ltypes.length, function () {
      std.forEach(function (lt) { record('LTYPE', 'AcDbLinetypeTableRecord', lt[2]); pr(2, lt[0]); pr(70, 0); pr(3, lt[1]); pr(72, 65); pr(73, 0); pr(40, 0); });
      ltypes.forEach(function (lt) {
        record('LTYPE', 'AcDbLinetypeTableRecord'); pr(2, lt[0]); pr(70, 0); pr(3, lt[1]); pr(72, 65); pr(73, lt[3].length); pr(40, lt[2]);
        lt[3].forEach(function (d) { pr(49, d); if (r2000) pr(74, 0); });
      });
    });
    // the text style: Century Gothic (GOTHIC.TTF), as on the sheet (r13/drawings13); a reader without it substitutes its own
    var styleName = r2000 ? 'Standard' : 'STANDARD';
    table('STYLE', 1, function () {
      record('STYLE', 'AcDbTextStyleTableRecord', '11');
      pr(2, styleName); pr(70, 0); pr(40, 0); pr(41, 1); pr(50, 0); pr(71, 0); pr(42, num(3.5 * (inch ? 1 / MM : 1))); pr(3, 'GOTHIC.TTF'); pr(4, '');
    });
    // the view layers plot black / white (7) like the sheet; thin lines (hatch, tangent edges, centre marks) on them are
    // colour 8, so a plot-by-colour pen table gives the thick / thin weights (R12 has no lineweights) (r5/drawings5);
    // R2000 also carries each line's weight and lists layer 0 first (AutoCAD's own)
    var lay = (r2000 && layers.indexOf('0') < 0 ? ['0'] : []).concat(layers);
    table('LAYER', lay.length, function () {
      lay.forEach(function (n) {
        record('LAYER', 'AcDbLayerTableRecord', r2000 && n === '0' ? '10' : null);
        pr(2, n); pr(70, 0); pr(62, colors[n] || 7); pr(6, cont);
      });
    });
    if (r2000) {
      table('VIEW', 0, function () { });
      table('UCS', 0, function () { });
      table('APPID', 1, function () { record('APPID', 'AcDbRegAppTableRecord', '12'); pr(2, 'ACAD'); pr(70, 0); });
      // the dimension style (rfT): the sheet's text height, arrows, extension-line gap / overshoot, decimal places and
      // zero suppression (ANSI inch: no leading zero; metric: no trailing zeros), text horizontal
      table('DIMSTYLE', 1, function () {
        record('DIMSTYLE', 'AcDbDimStyleTableRecord'); pr(2, 'Standard'); pr(70, 0);
        var G = sheet.dimStyle && sheet.dimStyle.geo || { text: 3.5, arrow: 3, gap: 1.5, ext: 2 }, kk = inch ? 1 / MM : 1, pd = sheet.dimStyle && sheet.dimStyle.prec;
        pr(40, 1); pr(41, num(G.arrow * kk)); pr(42, num(G.gap * kk)); pr(44, num(G.ext * kk)); pr(140, num(G.text * kk)); pr(147, num(TEXT_GAP * kk));
        pr(73, 1); pr(74, 1); pr(77, 0); pr(78, inch ? 4 : 8); pr(271, pd != null ? pd : inch ? 3 : 2); pr(340, '11');
      });
      dimGroups.forEach(function (g) { g.br = H(); g.bh = H(); g.eh = H(); });
      table('BLOCK_RECORD', 2 + dimGroups.length, function () {
        record('BLOCK_RECORD', 'AcDbBlockTableRecord', msBR); pr(2, '*Model_Space');
        record('BLOCK_RECORD', 'AcDbBlockTableRecord', psBR); pr(2, '*Paper_Space');
        dimGroups.forEach(function (g) { record('BLOCK_RECORD', 'AcDbBlockTableRecord', g.br); pr(2, g.name); });
      });
    }
    pr(0, 'ENDSEC');
    if (r2000) {
      pr(0, 'SECTION'); pr(2, 'BLOCKS');
      [[msBR, '*Model_Space', false, '20', '21'], [psBR, '*Paper_Space', true, '1C', '1D']].forEach(function (b) {
        pr(0, 'BLOCK'); pr(5, b[3]); pr(330, b[0]); pr(100, 'AcDbEntity'); if (b[2]) pr(67, 1); pr(8, 0); pr(100, 'AcDbBlockBegin');
        pr(2, b[1]); pr(70, 0); pr(10, 0); pr(20, 0); pr(30, 0); pr(3, b[1]); pr(1, '');
        pr(0, 'ENDBLK'); pr(5, b[4]); pr(330, b[0]); pr(100, 'AcDbEntity'); if (b[2]) pr(67, 1); pr(8, 0); pr(100, 'AcDbBlockEnd');
      });
      dimGroups.forEach(function (g) {
        pr(0, 'BLOCK'); pr(5, g.bh); pr(330, g.br); pr(100, 'AcDbEntity'); pr(8, 0); pr(100, 'AcDbBlockBegin');
        pr(2, g.name); pr(70, 1); pr(10, 0); pr(20, 0); pr(30, 0); pr(3, g.name); pr(1, '');
        g.prims.forEach(function (p) { entity(p, g.br); });
        pr(0, 'ENDBLK'); pr(5, g.eh); pr(330, g.br); pr(100, 'AcDbEntity'); pr(8, 0); pr(100, 'AcDbBlockEnd');
      });
      pr(0, 'ENDSEC');
    }
    pr(0, 'SECTION'); pr(2, 'ENTITIES');
    sheet.prims.forEach(function (p) { if (!(p.dimIx != null && dimOf[p.dimIx])) entity(p, msBR); });
    dimGroups.forEach(function (g) {
      var d = g.d, X = g.d.dxf, type = { linear: 0, aligned: 1, dia: 3, rad: 4, angular: 5 }[X.type];
      function pt(c, q) { pr(c, num(q[0])); pr(c + 10, num(q[1])); pr(c + 20, 0); }
      pr(0, 'DIMENSION'); pr(5, H()); pr(330, msBR); pr(100, 'AcDbEntity'); pr(8, 'DIMENSIONS');
      if (d.dangling && DXF_COLORS.dangling) pr(62, DXF_COLORS.dangling);
      pr(100, 'AcDbDimension'); pr(2, g.name); pt(10, X.p10); pt(11, X.p11); pr(70, type | 32 | 128); pr(71, 5);
      if (isFinite(d.value) && X.type !== 'angular') pr(42, num(d.value));   // (an angle's measurement would be radians: left to the reader)
      pr(1, dxfText(d.text || '')); pr(3, 'Standard');
      if (X.type === 'linear' || X.type === 'aligned') { pr(100, 'AcDbAlignedDimension'); pt(13, X.p13); pt(14, X.p14); }
      if (X.type === 'linear') { pr(50, X.ang); pr(100, 'AcDbRotatedDimension'); }
      if (X.type === 'dia') { pr(100, 'AcDbDiametricDimension'); pt(15, X.p15); pr(40, num(X.lead || 0)); }
      if (X.type === 'rad') { pr(100, 'AcDbRadialDimension'); pt(15, X.p15); pr(40, num(X.lead || 0)); }
      // (rfV) an angle: 3-point angular, 13 / 14 on the two lines, 15 the vertex, 10 on the dimension arc
      if (X.type === 'angular') { pr(100, 'AcDb3PointAngularDimension'); pt(13, X.p13); pt(14, X.p14); pt(15, X.p15); }
    });
    function entity(p, owner) {
      var ltn = p.style === 'hidden' || p.style === 'benddown' ? 'HIDDEN' : p.style === 'chain' || p.style === 'tanfont' ? 'PHANTOM' : p.style === 'center' ? 'CENTER' : null, dc = p.color && DXF_COLORS[p.color] || (THIN[p.style] && !colors[p.layer] ? 8 : 0);
      // an entity's head: type, (R2000: handle, owner, AcDbEntity,) layer, line type, colour, (R2000: weight, subclass)
      function head(type, sub, lw) {
        pr(0, type);
        if (r2000) { pr(5, H()); pr(330, owner); pr(100, 'AcDbEntity'); }
        pr(8, p.layer);
        if (ltn) pr(6, ltn);
        if (dc) pr(62, dc);
        if (r2000 && lw && p.lw > 0) pr(370, dxfLw(+p.lw));   // (rfAN) Line Format weight
        else if (r2000 && lw && STROKE[p.style]) pr(370, Math.round(STROKE[p.style] * 100));
        if (r2000 && !p.color && rgbOf(p)) pr(420, parseInt(rgbOf(p).slice(1), 16));   // (rfAN) true colour (R12: the layer's)
        if (r2000 && sub) pr(100, sub);
      }
      // hatch lines leave out z (30 / 31, default 0): a dashed hatch pattern is thousands of lines (r6/drawings6)
      if (p.k === 'line' && p.style === 'hatch') { head('LINE', 'AcDbLine', true); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(11, num(p.b[0])); pr(21, num(p.b[1])); }
      else if (p.k === 'line') { head('LINE', 'AcDbLine', true); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(30, 0); pr(11, num(p.b[0])); pr(21, num(p.b[1])); pr(31, 0); }
      else if (p.k === 'circle') { head('CIRCLE', 'AcDbCircle', true); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); }
      else if (p.k === 'arc') {
        head('ARC', 'AcDbCircle', true); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r));
        if (r2000) pr(100, 'AcDbArc');
        pr(50, num(((p.a0 % 360) + 360) % 360)); pr(51, num(((p.a1 % 360) + 360) % 360));
      } else if (p.k === 'ellipse' && r2000) {
        // R2000: a true ELLIPSE (major axis from the centre, minor / major ≤ 1, start / end parameters CCW in radians;
        // ellipseAt's parameter is the DXF one: c + major·cos t + (n × major)·ratio·sin t)
        var M = p.major, ratio = p.ratio, t0 = p.t0, t1 = p.t1;
        if (ratio > 1) { M = [-M[1] * ratio, M[0] * ratio]; ratio = 1 / ratio; t0 -= Math.PI / 2; t1 -= Math.PI / 2; }
        var TWO = 2 * Math.PI, sw0 = p.full ? TWO : Math.min(TWO, t1 - t0), s0 = p.full ? 0 : ((t0 % TWO) + TWO) % TWO;
        var r9 = function (x) { return String(Math.round(x * 1e9) / 1e9); };
        head('ELLIPSE', 'AcDbEllipse', true);
        pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(11, r9(M[0])); pr(21, r9(M[1])); pr(31, 0);
        pr(210, 0); pr(220, 0); pr(230, 1); pr(40, r9(ratio)); pr(41, r9(s0)); pr(42, r9(s0 + sw0));
      } else if (p.k === 'ellipse') {
        // DXF R12 has no ELLIPSE entity: a 2D POLYLINE through points on the exact ellipse (chord error under 0.01 mm)
        var Rm = Math.hypot(p.major[0], p.major[1]), tolE = 0.01 * (inch ? 1 / MM : 1), sw = p.t1 - p.t0;
        var step = Rm > tolE ? 2 * Math.acos(Math.max(-1, 1 - tolE / Rm)) : Math.PI / 4, n = Math.max(8, Math.min(720, Math.ceil(sw / step)));
        head('POLYLINE'); pr(66, 1); pr(10, 0); pr(20, 0); pr(30, 0); pr(70, p.full ? 1 : 0);
        for (var i = 0; i < (p.full ? n : n + 1); i++) { var ep = ellipseAt(p, p.t0 + sw * i / n).p; pr(0, 'VERTEX'); pr(8, p.layer); pr(10, num(ep[0])); pr(20, num(ep[1])); pr(30, 0); }
        pr(0, 'SEQEND'); pr(8, p.layer);
      } else if (p.k === 'region' && r2000) {
        // (rfAG) a solid area fill: a HATCH entity, SOLID pattern, one polyline boundary path per loop (odd parity)
        var hl = p.loops.map(function (l) { return l.filter(function (q, i) { var n = l[(i + 1) % l.length]; return Math.hypot(n[0] - q[0], n[1] - q[1]) > 1e-9; }); }).filter(function (l) { return l.length >= 3; });
        if (!hl.length) return;
        head('HATCH', 'AcDbHatch');
        pr(10, 0); pr(20, 0); pr(30, 0); pr(210, 0); pr(220, 0); pr(230, 1);
        pr(2, 'SOLID'); pr(70, 1); pr(71, 0); pr(91, hl.length);
        hl.forEach(function (l, li) {
          pr(92, li ? 2 : 3); pr(72, 0); pr(73, 1); pr(93, l.length);
          l.forEach(function (q) { pr(10, num(q[0])); pr(20, num(q[1])); });
          pr(97, 0);
        });
        pr(75, 0); pr(76, 1); pr(98, 1);
        var seed = D.interiorPoint ? D.interiorPoint(p.loops) : null;
        seed = seed || p.loops[0][0];
        pr(10, num(seed[0])); pr(20, num(seed[1]));
      } else if (p.k === 'region') {
        // R12 has no HATCH: the fill as close hatch lines (0.12 mm apart)
        D.hatchLines(p.loops, p.fillGap || 0.12, p.fillAngle || 45, 0).forEach(function (h) { head('LINE'); pr(10, num(h[0])); pr(20, num(h[1])); pr(11, num(h[2])); pr(21, num(h[3])); });
      } else if (p.k === 'fill') {
        head('SOLID', 'AcDbTrace');
        var q = [p.pts[0], p.pts[1], p.pts[2], p.pts[2]];
        q.forEach(function (pt, i) { pr(10 + i, num(pt[0])); pr(20 + i, num(pt[1])); pr(30 + i, 0); });
      } else if (p.k === 'text') {
        head('TEXT', 'AcDbText'); pr(10, num(p.p[0])); pr(20, num(p.p[1])); pr(30, 0); pr(40, num(p.h)); pr(1, dxfText(p.text));
        if (p.rot) pr(50, num(p.rot));
        if (r2000) pr(7, styleName);
        if (p.anchor !== 'start') { pr(72, p.anchor === 'middle' ? 1 : 2); pr(11, num(p.p[0])); pr(21, num(p.p[1])); pr(31, 0); }
        if (r2000) pr(100, 'AcDbText');
      }
    }
    pr(0, 'ENDSEC');
    if (r2000) {
      pr(0, 'SECTION'); pr(2, 'OBJECTS');
      pr(0, 'DICTIONARY'); pr(5, 'C'); pr(330, 0); pr(100, 'AcDbDictionary'); pr(281, 1); pr(3, 'ACAD_GROUP'); pr(350, 'D');
      pr(0, 'DICTIONARY'); pr(5, 'D'); pr(330, 'C'); pr(100, 'AcDbDictionary'); pr(281, 1);
      pr(0, 'ENDSEC');
    }
    var body = L; L = [];
    // the HEADER, written last (R2000's $HANDSEED is the next free handle); R2000 then the empty CLASSES section
    pr(0, 'SECTION'); pr(2, 'HEADER');
    pr(9, '$ACADVER'); pr(1, r2000 ? 'AC1015' : 'AC1009');
    if (r2000) { pr(9, '$DWGCODEPAGE'); pr(3, 'ANSI_1252'); pr(9, '$HANDSEED'); pr(5, (h + 1).toString(16).toUpperCase()); }
    pr(9, '$INSUNITS'); pr(70, inch ? 1 : 4);
    pr(9, '$MEASUREMENT'); pr(70, inch ? 0 : 1);
    pr(9, '$DIMALTF'); pr(40, inch ? '25.4' : '0.0393700787');   // rfDU: SolidWorks reads the file's unit from $DIMALTF
    pr(9, '$EXTMIN'); pr(10, 0); pr(20, 0); pr(30, 0);
    pr(9, '$EXTMAX'); pr(10, num(sheet.size[0])); pr(20, num(sheet.size[1])); pr(30, 0);
    pr(9, '$LTSCALE'); pr(40, inch ? 0.04 : 1);
    if (r2000) { pr(9, '$LWDISPLAY'); pr(290, 1); }
    pr(0, 'ENDSEC');
    if (r2000) { pr(0, 'SECTION'); pr(2, 'CLASSES'); pr(0, 'ENDSEC'); }
    return L.concat(body, ['0', 'EOF']).join('\n');
  }

  // PDF 1.4, one page per sheet at the sheet's real size, Helvetica (WinAnsi) text; pure ASCII so it survives a text
  // Blob. toPDF(sheet) writes one sheet; toPDF([sheet1, sheet2, …]) one page per sheet, in order (rfQ: a drawing's
  // sheets, as SolidWorks saves a multi-sheet drawing as one PDF).
  function toPDF(sheets) {
    var list = Array.isArray(sheets) ? sheets : [sheets], pages = list.map(pdfPage), objs = ['<< /Type /Catalog /Pages 2 0 R >>', null], font = 3 + 2 * list.length;
    objs[1] = '<< /Type /Pages /Kids [' + list.map(function (s, i) { return (3 + 2 * i) + ' 0 R'; }).join(' ') + '] /Count ' + list.length + ' >>';
    pages.forEach(function (pg, i) {
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pg.W + ' ' + pg.H + '] /Contents ' + (4 + 2 * i) + ' 0 R /Resources << /Font << /F1 ' + font + ' 0 R >> >> >>');
      objs.push('<< /Length ' + pg.content.length + ' >>\nstream\n' + pg.content + '\nendstream');
    });
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return out;
  }
  // pdfPage(sheet) -> { W, H, content }: one sheet's page size (points) and content stream
  function pdfPage(sheet) {
    var ptPer = sheet.units === 'in' ? 72 : 72 / MM, k = sheet.units === 'in' ? 1 / MM : 1;
    function P(x) { return num(x * ptPer); }
    var c = ['1 J 1 j'];
    var dash = [3 * k * ptPer, 1.5 * k * ptPer];
    var cur = null, curCol = '0 0 0', chain = [8, 1.5, 1.5, 1.5].map(function (x) { return num(x * k * ptPer); }).join(' '), center = CENTER_DASH.map(function (x) { return num(x * k * ptPer); }).join(' ');
    function style(s, lw) {
      var key = s + '|' + (lw > 0 ? +lw : '');
      if (key === cur) return; cur = key;
      c.push(num((lw > 0 ? +lw : STROKE[s] || 0.25) * k * ptPer) + ' w ' + (s === 'hidden' || s === 'benddown' ? '[' + num(dash[0]) + ' ' + num(dash[1]) + '] 0 d' : s === 'chain' || s === 'tanfont' ? '[' + chain + '] 0 d' : s === 'center' ? '[' + center + '] 0 d' : '[] 0 d'));
    }
    function color(p) {
      var rgb = !p.color && rgbOf(p), col = p.color && PDF_COLORS[p.color] || (rgb ? [1, 3, 5].map(function (i) { return num(parseInt(rgb.substr(i, 2), 16) / 255); }).join(' ') : '0 0 0');
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
        style(p.style, p.lw);
        var first = !(prv && prv.chain === p.chain), last = !(nxt && nxt.chain === p.chain);
        c.push((first ? P(p.a[0]) + ' ' + P(p.a[1]) + ' m ' : '') + P(p.b[0]) + ' ' + P(p.b[1]) + ' l' + (last ? ' S' : ''));
        return;
      }
      if (p.k === 'arc') { style(p.style, p.lw); c.push(arcPath(p)); }
      else if (p.k === 'ellipse') { style(p.style, p.lw); c.push(ellipsePath(p)); }
      else if (p.k === 'line') {
        style(p.style, p.lw);
        // (lane CA) a short hidden line: one centred dash, butt ends (shortDash); the next line sets its style again
        var sdp = (p.style === 'hidden' || p.style === 'benddown') && shortDash(Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), 3 * k, 1.5 * k);
        if (sdp) { c.push('0 J [' + num(sdp[0] * ptPer) + ' ' + num(sdp[1] * ptPer) + '] ' + num(sdp[2] * ptPer) + ' d'); cur = null; }
        c.push(P(p.a[0]) + ' ' + P(p.a[1]) + ' m ' + P(p.b[0]) + ' ' + P(p.b[1]) + ' l S');
        if (sdp) c.push('1 J');
      }
      else if (p.k === 'circle') {
        style(p.style, p.lw);
        var x = p.c[0], y = p.c[1], r = p.r, m = 0.5522847498 * r;
        c.push(P(x + r) + ' ' + P(y) + ' m ' +
          P(x + r) + ' ' + P(y + m) + ' ' + P(x + m) + ' ' + P(y + r) + ' ' + P(x) + ' ' + P(y + r) + ' c ' +
          P(x - m) + ' ' + P(y + r) + ' ' + P(x - r) + ' ' + P(y + m) + ' ' + P(x - r) + ' ' + P(y) + ' c ' +
          P(x - r) + ' ' + P(y - m) + ' ' + P(x - m) + ' ' + P(y - r) + ' ' + P(x) + ' ' + P(y - r) + ' c ' +
          P(x + m) + ' ' + P(y - r) + ' ' + P(x + r) + ' ' + P(y - m) + ' ' + P(x + r) + ' ' + P(y) + ' c S');
      } else if (p.k === 'fill') c.push(P(p.pts[0][0]) + ' ' + P(p.pts[0][1]) + ' m ' + P(p.pts[1][0]) + ' ' + P(p.pts[1][1]) + ' l ' + P(p.pts[2][0]) + ' ' + P(p.pts[2][1]) + ' l h f');
      else if (p.k === 'region') c.push(p.loops.map(function (l) { return l.map(function (q, i) { return P(q[0]) + ' ' + P(q[1]) + (i ? ' l' : ' m'); }).join(' ') + ' h'; }).join(' ') + ' f*');   // (rfAG) even-odd fill
      else if (p.k === 'text') {
        var fs = p.h / 0.718 * ptPer, w = textWidth(plainText(p.text), p.h) * ptPer;   // h: the capitals' height (Helvetica's are 0.718 em), r13/drawings13
        var shift = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0;
        var a = (p.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        var x0 = p.p[0] * ptPer + ca * shift, y0 = p.p[1] * ptPer + sa * shift;
        c.push('BT /F1 ' + num(fs) + ' Tf ' + num(ca) + ' ' + num(sa) + ' ' + num(-sa) + ' ' + num(ca) + ' ' + num(x0) + ' ' + num(y0) + ' Tm (' + pdfText(p.text) + ') Tj ET');
      }
    });
    return { W: P(sheet.size[0]), H: P(sheet.size[1]), content: c.join('\n') };
  }

  D.compute = compute; D.toSVG = toSVG; D.svgParts = svgParts; D.toDXF = toDXF; D.toPDF = toPDF; D.textRect = textRect; D.STROKE = STROKE; D.plainText = plainText;
  _.dimPrims = dimPrims;   // (rfDD: the Smart Dimension preview draws the dimension as it will be placed)
  _.ARROW_W = ARROW_W; _.SHOULDER = SHOULDER; _.TEXT_GAP = TEXT_GAP; _.CAP_EM = CAP_EM; _.DW_FONT = DW_FONT; _.textWidth = textWidth; _.arcEnds = arcEnds; _.ellipseAt = ellipseAt;
})(Drawing, Drawing._);
