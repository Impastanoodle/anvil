  // --- CW (2026-10-20): Break-Corner and a Normal Cut across a bend on OpenCascade. Exact volumes (the uncut part's
  // OpenCascade volume less exactly what the feature takes, within 1e-6): a fillet R takes (1 − π/4)·R²·T per 90°
  // corner, a chamfer d takes d²/2·T. A Normal Cut of a Ø.375 hole straddling a 16 ga bend's tangent line, sketched on
  // the top face (rfBZ), follows the sheet across the bend: the half disk on the base through T, plus the hole's
  // footprint on the bend's inside surface pushed radially through T = T·(R + T/2)·∫ 2√(r² − R² sin²θ) dθ (was: the
  // OpenCascade tool kept only the part of the bend below the sketch plane, half the metal). Both kernels' flats:
  // same size, loops and bends; DXF entity counts equal for the corner cases (ARCs for the fillets). ---
  var SMC_TRAY = [[2, SH_T, 0], [4, SH_T, 1.5], [2, SH_T, 3], [0, SH_T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');   // lane smcorner
  var SMC_U = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0], [3, 2]], false).end().baseFlange(null, { depth: 4 });\n' +
    [[1.5, 0, 0], [0, 1, 0], [3, 1, 0]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer", reverse: true });\n'; }).join('');   // lane smcorner-2
  // lane smflat-2: the U channel with Material Outside end flanges, and a 3 Bend corner relief's area in the blank (the
  // shape as cornerReliefShape draws it, centred on the bend lines' crossing (BA / 2, BA / 2), less its part over the
  // corner notch [0, BA] × [stub, ∞))
  var SMC_UO = SMC_U.replace(/position: "inside"/g, 'position: "outside"');
  function smfRelief(type, size, stub) {
    var BA = Math.PI / 2 * 0.09, C = [BA / 2, BA / 2], h = size / 2, pts = [], i, d = Math.SQRT1_2, a0 = Math.atan2(d, -d);
    if (type === 'circular') for (i = 0; i < 4096; i++) pts.push([C[0] + h * Math.cos(2 * Math.PI * i / 4096), C[1] + h * Math.sin(2 * Math.PI * i / 4096)]);
    else {
      var ca = [C[0] - d * h, C[1] - d * h], cb = [C[0] + d * h, C[1] + d * h];
      for (i = 0; i <= 16; i++) pts.push([cb[0] + h * Math.cos(a0 - Math.PI * i / 16), cb[1] + h * Math.sin(a0 - Math.PI * i / 16)]);
      for (i = 0; i <= 16; i++) pts.push([ca[0] + h * Math.cos(a0 + Math.PI - Math.PI * i / 16), ca[1] + h * Math.sin(a0 + Math.PI - Math.PI * i / 16)]);
    }
    function clip(poly, a, c) {
      var out = [];
      for (var k = 0; k < poly.length; k++) {
        var P = poly[k], Q = poly[(k + 1) % poly.length], dp = a[0] * P[0] + a[1] * P[1] - c, dq = a[0] * Q[0] + a[1] * Q[1] - c;
        if (dp <= 0) out.push(P);
        if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { var t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
      }
      return out;
    }
    var notch = clip(clip(clip(pts, [-1, 0], 0), [1, 0], BA), [0, -1], -stub);
    return Math.abs(K.signedArea(pts)) - (notch.length > 2 ? Math.abs(K.signedArea(notch)) : 0);
  }
  var CW_HEAD = 'p.units("in");\np.sheet(' + SH_T + ', ' + SH_T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
  var CW_L = CW_HEAD + 'p.flange(1.5, [[0, ' + SH_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n';
  var CW_BC = function (size, corners, opts) { return 'p.breakCorner(' + size + ', ' + JSON.stringify(corners) + ', ' + JSON.stringify(opts) + ');\n'; };
  var CW_NC = SH_HEAD + 'p.flange(1.5, [[3, ' + SH_T + ', 4]], { position: "inside", lengthRef: "outer" });\n', CW_Z0 = 4 - 2 * SH_T, cwChord = 0;
  for (var cwi = 0; cwi < 20000; cwi++) { var cwTh = (cwi + 0.5) * Math.PI / 2 / 20000; cwChord += 2 * Math.sqrt(0.1875 * 0.1875 - SH_T * SH_T * Math.sin(cwTh) * Math.sin(cwTh)) * Math.PI / 2 / 20000; }
  // CW2: Closed Corner (lane CS) on rfCS's 4 × 3 tray, four 1.0 in edge flanges as separate features (each later wall
  // stops R short of its neighbour); Overlap, ratio .75, gap .01 (as rfCS): each corner adds a wall strip
  // (1 − R − T) high, T thick and R + .75·T − (T + gap) wide, so the tray gains exactly 4·H·T·(R + .75T − T − gap)
  var CW_TRAY = CW_HEAD + [[2, SH_T, 0], [4, SH_T, 1.5], [2, SH_T, 3], [0, SH_T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
  var CW_F4 = [[SH_T / 2, 0.6, 2 * SH_T], [4 - SH_T / 2, 0.6, 2 * SH_T], [4 - 2 * SH_T, 0.6, 3 - SH_T / 2], [SH_T / 2, 0.6, 3 - 2 * SH_T]];
  var DB2_BA = Math.PI / 2 * (SH_T + 0.5 * SH_T), DB2_BD = 4 * SH_T - DB2_BA, DB2_ZB = 2 * SH_T - DB2_BA / 2;   // lane DB2 (T = R)
  var DB2_HEAD = 'p.units("in");\np.sheet(' + SH_T + ', ' + SH_T + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
  var DB2_L = DB2_HEAD + 'p.flange(1.5, [[3, ' + SH_T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
  var DB2_U = DB2_HEAD + 'p.flange(1.5, [[3, ' + SH_T + ', 0], [3, ' + SH_T + ', 4]], { position: "inside", lengthRef: "outer" });\n';
  var DI_BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\n';   // lane DI
  // lane DQ: Insert Bends / Convert to Sheet Metal (R = T = .06, rip gap .03): each bend takes the kite (R + T)² − R² and
  // puts the exact annulus π/4·((R + T)² − R²) over the 1.76 between the corner cubes; each corner cube takes the ripped box in it
  var DQ_RT = 0.12, DQ_F = DQ_RT * DQ_RT - 0.0036;
  var DQ_RIPPED = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\np.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], 0.03);\n';
  var DQ_L = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.06], [0.06, 0.06], [0.06, 1], [0, 1]]).end().extrude(2);\n';
  var DI_CC = CW_TRAY + 'p.closedCorner([' + JSON.stringify(CW_F4[0]) + '], { cornerType: "underlap", gap: 0.01, coplanar: false });\n';
  // lane DJ: a 4 × 2 base with a 1.0 edge flange on its front edge; the U-channel's bends (Kernel.sheetBends' `at`); a
  // 0.25 × 1.0 slot cut flat from above, centred on a bend line at z = zc
  var DJ_BR = 'p.units("in");\np.sheet(' + SH_T + ', ' + SH_T + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[2, ' + SH_T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
  var DJ_A = '[3,0.056173,0.056173]', DJ_B = '[3,0.056173,3.943827]';
  // lane DT: the Vent part and its exact open area (a disk less a centred cross of strips .1 wide); the Tab across the
  // U-channel's front bend line, past its side
  var DT_VENT = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\np.sketch("Top").circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5).end().vent({ ribWidth: 0.1, sparWidth: 0.1 });';
  function dtD(r) { var h = 0.05; return Math.PI * r * r - 4 * (h * Math.sqrt(r * r - h * h) + r * r * Math.asin(h / r)) + 4 * h * h; }
  var dtOpen = dtD(0.45) + dtD(1) - dtD(0.55);
  // lane DT2: radius .05: the corner pieces (rib / circle by Green's theorem; rib / rib r²(1 − π/4)) the fillets keep
  function dtCorner(R, inside) {
    var r = 0.05, h = 0.05, Rc = inside ? R - r : R + r, xc = Math.sqrt(Rc * Rc - (h + r) * (h + r)), C = [xc, h + r], T1 = [xc, h], T2 = [C[0] * R / Rc, C[1] * R / Rc], V = [Math.sqrt(R * R - h * h), h];
    function arc(c, rho, t0, sw) { var t1 = t0 + sw; return (rho * rho * sw + rho * (c[0] * (Math.sin(t1) - Math.sin(t0)) - c[1] * (Math.cos(t1) - Math.cos(t0)))) / 2; }
    var aV = Math.atan2(V[1], V[0]), aT2 = Math.atan2(T2[1], T2[0]), f0 = Math.atan2(T2[1] - C[1], T2[0] - C[0]), sw = -Math.PI / 2 - f0;
    if (inside) { while (sw > 0) sw -= 2 * Math.PI; } else { while (sw < 0) sw += 2 * Math.PI; }
    return Math.abs(arc([0, 0], R, aV, aT2 - aV) + arc(C, r, f0, sw) + (T1[0] * V[1] - V[0] * T1[1]) / 2);
  }
  var dtLost = 4 * (0.0025 * (1 - Math.PI / 4) + 2 * dtCorner(0.45, true)) + 4 * (2 * dtCorner(0.55, false) + 2 * dtCorner(1, true));
  var DT_TAB = 'p.sketch("Top").rect(6, ' + (-(DB2_ZB + 0.25)) + ', 0.5, 0.5).extrude(' + SH_T + ');\n';
  function DJ_SLOT(zc) { return 'p.sketch("Top", 1).rect(2.5, ' + (-(zc + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });\n'; }
  // lane DL2: Miter Flange from a profile sketch (rfDL's part: 4 × 2, T = R = .06, K = .5; the profile on the Right
  // Plane at the front-left corner, along the front and left edges). Exact: the gap takes √2·gap·A+ (each flange
  // gap/√2 along its edge; lane jogs-rips: an L profile's corners, the straight profile's are SolidWorks' square notch),
  // an offset d takes d·(A+ − (R + T)·T) (the base keeps its corner), A+ = the exact section
  // beyond the trimmed edge (quarter annulus + straight wall). OpenCascade's volume is Anvil's within the faceting of
  // Anvil's bends (8 chords per 90°: 3.9e-4 relative here), the same as the edge-only miter flange on both kernels.
  var DL_T = 0.06, DL_Q = Math.PI / 4 * (4 * DL_T * DL_T - DL_T * DL_T);
  var DL_HEAD = 'p.units("in");\np.sheet(' + DL_T + ', ' + DL_T + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n', DL_E = '[[2, ' + DL_T + ', 0], [0, ' + DL_T + ', 1]]';
  var DL_I = DL_HEAD + 'p.sketch("Right").line(0, ' + DL_T + ', 0, ' + (1 + DL_T) + ').end();\n';
  var DL_L = DL_HEAD + 'p.sketch("Right").line(0, ' + DL_T + ', 0, ' + (1 + DL_T) + ').line(0, ' + (1 + DL_T) + ', 0.5, ' + (1 + DL_T) + ').end();\n';
  function DL_MF(head, o) { return head + 'p.miterFlange(' + DL_E + ', ' + JSON.stringify(o) + ');\n'; }
  var DL_AP = DL_Q + (1 - DL_T) * DL_T, DL_A1 = DL_Q + (1 - 2 * DL_T) * DL_T, DL_A2 = DL_Q + (0.5 - DL_T) * DL_T;
  var CW_CASES = [
    { name: 'Closed Corner Overlap (ratio .75, gap .01) on all four corners of a 16 ga 4 × 3 tray', plain: CW_TRAY,
      code: CW_TRAY + 'p.closedCorner(' + JSON.stringify(CW_F4) + ', ' + JSON.stringify({ cornerType: 'overlap', gap: 0.01, ratio: 0.75, coplanar: false }) + ');',
      removed: -4 * (1 - 2 * SH_T) * SH_T * (SH_T + 0.75 * SH_T - (SH_T + 0.01)) + 4 * Math.PI / 4 * 3 * SH_T * SH_T * (3 * SH_T + 0.01) / 2, loops: 1 },   // lane DV: + each front bend's end tapered (exact quarter annulus × the mean of R + T and T + gap)
    { name: 'Break-Corner fillet R .25 on the four corners of a 4 × 3 base', plain: null, code: CW_HEAD + CW_BC(0.25, [[0, SH_T / 2, 0], [4, SH_T / 2, 0], [4, SH_T / 2, 3], [0, SH_T / 2, 3]], { kind: 'fillet' }), exact: (12 - 4 * (1 - Math.PI / 4) * 0.0625) * SH_T, loops: 1, arcs: 4, dxf: true },
    { name: 'Break-Corner chamfer .2 on the free base corners of an L bracket', plain: CW_L, code: CW_L + CW_BC(0.2, [[4, SH_T / 2, 0], [4, SH_T / 2, 3]], {}), removed: 2 * 0.02 * SH_T, loops: 1, arcs: 0, dxf: true },
    { name: 'Normal Cut of a Ø.375 hole straddling a bend\'s tangent line, cut from the top face, goes through the whole bend normal to the sheet', plain: CW_NC,
      code: CW_NC + 'p.sketch("Top", ' + SH_T + ').circle(3, ' + (-CW_Z0) + ', 0.1875).cut("through", { reverse: true, normalCut: true });', removed: SH_T * Math.PI * 0.1875 * 0.1875 / 2 + SH_T * 1.5 * SH_T * cwChord, loops: 2, holeArea: true },
    // the flat of a plain cut after the bend that bites into the bend below the top (rfCW): OpenCascade's bend surface
    // is an unstructured triangulation round the hole, whose tilted triangles the unfold used to drop, so the uncut
    // inside surface read as a gap across the strip and the blank fell apart in two at the bend (no exact volume: the
    // cut thins the bend; volumes and hole areas agree within the faceting)
    { name: 'flat of a Ø.25 hole cut from the top at a bend\'s tangent line (bites into the bend below the top): one blank, one hole on both kernels', plain: null,
      code: CW_HEAD + 'p.flange(1.5, [[4, ' + SH_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", ' + SH_T + ').circle(' + (4 - 2 * SH_T) + ', -1.5, 0.125).cut("through", { reverse: true });', loops: 2, holeArea: true },
    // lane DB2: Unfold / Fold built by OpenCascade (exact pieces of the folded part moved flat, the flat strip × T; the
    // cut across the bend folded back through cylinderCutter). K = 0.5, so an exact bend's volume is BA·T: the U-channel
    // unfolded is exactly the blank × T; the 0.25 × 1.0 slot cut flat across the L's bend line takes the whole exact bend
    // section (π/4·((R + T)² − R²)) plus (0.25 − BA)·T of straight sheet, × 1.0
    { name: 'Unfold (Collect All Bends) of a 16 ga 6 × 4 U-channel, 1.5 walls: exactly the blank × T, flat in the base plane', plain: null,
      code: DB2_U + 'p.unfold([1, ' + SH_T + ', 2], null);', exact: 6 * (4 + 2 * (1.5 - DB2_BD)) * SH_T, loops: 1 },
    { name: 'Unfold, a 0.25 × 1.0 slot cut flat centred on the bend line, Fold (16 ga L-bracket): the slot wraps the exact bend; the flat shows the slot', plain: DB2_L,
      code: DB2_L + 'p.unfold([1, ' + SH_T + ', 2], null);\np.sketch("Top", 1).rect(2.5, ' + (-(DB2_ZB + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });\np.fold();',
      removed: Math.PI / 4 * (4 * SH_T * SH_T - SH_T * SH_T) + (0.25 - DB2_BA) * SH_T, loops: 2, holeArea: true },
    // lane DI: Rip (a planar slot along a corner edge) and Tab (Base Flange/Tab on an existing sheet: T into the face)
    { name: 'Rip side1, gap .03, on an outside corner edge of a shelled 2 × 2 × 1 box (wall .06): removes 1 × .03 × .06, through the floor (SolidWorks)', noFlat: true, plain: DI_BOX,
      code: DI_BOX + 'p.rip([[2, 0.5, 0]], 0.03, { direction: "side1" });', removed: 0.03 * 0.06 },
    { name: 'Rip both directions on the inside corner edge of the same box: walls and floor square at T + g/√2 (SolidWorks: 0.652974 for four corners)', noFlat: true, plain: DI_BOX,
      code: DI_BOX + 'p.rip([[1.94, 0.5, -0.06]], 0.03);', removed: (4 - 1.88 * 1.88 * 0.94 - 0.652973662) / 4 },
    { name: 'Rip .03 at an Underlap Closed Corner (gap .01) of the 16 ga tray: the gap widens to .03; one blank', plain: DI_CC,
      code: DI_CC + 'p.rip([[0, 0.6, 0]], 0.03);', removed: (1 - 2 * SH_T) * 0.02 * SH_T, loops: 1, dxf: true },
    { name: 'Tab 1 × 1 sketched on the top face of a 16 ga 4 × 3 base flange: + 1 × 1 × T, flush; the flat is 5 × 3', plain: null,
      code: CW_HEAD + 'p.sketch("Top", ' + SH_T + ').rect(4, -2, 1, 1).end().tab();', exact: 13 * SH_T, loops: 1, dxf: true },
    // lane DJ: no Anvil fallback any more. K = 0.5 makes the exact bend volume-neutral, so a 0.5 × 0.5 × T tab across
    // the bend line adds exactly 0.25·T, a slot across a bend line takes exactly 0.25·T, folded or flat; the blind
    // pocket takes the exact annulus R + 0.6T … R + T plus its flat parts
    { name: 'DJ: Unfold, a 0.5 × 0.5 × T Tab past the side straddling the bend line, Fold (4 × 2, 1.0 flange): the tab bends exactly, + 0.25·T; the flat shows it', plain: DJ_BR,
      code: DJ_BR + 'p.unfold([1, ' + SH_T + ', 1], null);\np.sketch("Top").rect(4, ' + (-(DB2_ZB + 0.25)) + ', 0.5, 0.5).extrude(' + SH_T + ');\np.fold();', removed: -0.25 * SH_T, loops: 1 },
    { name: 'DJ: a partial Fold (U-channel all unfolded, a slot across the front bend line, Fold of the front bend): the back stays flat, exact', plain: null,
      code: DB2_U + 'p.unfold([1, ' + SH_T + ', 2], []);\n' + DJ_SLOT(DB2_ZB) + 'p.fold([' + DJ_A + ']);', exact: 6 * (4 + 2 * (1.5 - DB2_BD)) * SH_T - 0.25 * SH_T, loops: 2, holeArea: true },
    { name: 'DJ: an Unfold of a bend with a cut across it (L: Unfold, slot, Fold, Unfold): the flat strip keeps the slot, exact', plain: DB2_L,
      code: DB2_L + 'p.unfold([1, ' + SH_T + ', 2], null);\n' + DJ_SLOT(DB2_ZB) + 'p.fold();\np.unfold([1, ' + SH_T + ', 2]);', removed: 0.25 * SH_T, loops: 2, holeArea: true },
    { name: 'DJ: two Unfolds open (U-channel: the front, then the back), a slot across each bend line, folded back then front: exact', plain: DB2_U,
      code: DB2_U + 'p.unfold([1, ' + SH_T + ', 2], [' + DJ_A + ']);\np.unfold(null, [' + DJ_B + ']);\n' + DJ_SLOT(DB2_ZB) + DJ_SLOT(4 - DB2_ZB) + 'p.fold([' + DJ_B + ']);\np.fold([' + DJ_A + ']);', removed: 0.5 * SH_T, loops: 3 },
    { name: 'DJ: a blind 1.0 × 0.5 pocket 0.4·T deep cut flat across the bend line from below, Fold: the exact annulus R + 0.6T … R + T; the flat stays whole', plain: DJ_BR,
      code: DJ_BR + 'p.unfold([1, ' + SH_T + ', 1], null);\np.sketch("Top").rect(1, ' + (-(DB2_ZB + 0.25)) + ', 1, 0.5).cut(' + 0.4 * SH_T + ');\np.fold();',
      removed: (0.5 - DB2_BA) * 0.4 * SH_T + Math.PI / 4 * (4 * SH_T * SH_T - 1.6 * 1.6 * SH_T * SH_T), loops: 1 },
    { name: 'DL: Miter Flange, 1 in straight profile along two edges, Material Inside, gap .01: the square notch (SolidWorks 0.817915; its end face reads 1.5e-5 in³ under the true curve)',
      // (lane mitreplane, rfKC: the taper now runs on the bend's zone lines, read off the 3-chord polyline, so OpenCascade's
      // end curve follows it: 0.817924081 on the true curve before, now SolidWorks' own 0.817915 to 6e-7)
      code: DL_MF(DL_I, { miterGap: 0.01 }), exact: 0.81791452, loops: 1, dxf: true },
    { name: 'rfGE: M03, four mitred flanges = SolidWorks\' Butt corners: base + walls + tapered bends (38 faces in SolidWorks and here)', plain: null,
      code: 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, 0.0598, 0], [3, 0.0598, 4], [0, 0.0598, 2], [6, 0.0598, 2]], { position: "inside", lengthRef: "outer", miter: true });\n', exact: 2.482605583125422, loops: 1 },
    { name: 'DL: Miter Flange start offset .25 (the front flange from x = 4): removes .25·(A+ − (R + T)·T)', plain: DL_MF(DL_I, { miterGap: 0.01 }),
      code: DL_MF(DL_I, { miterGap: 0.01, startOffset: 0.25 }), removed: 0.25 * (DL_AP - 2 * DL_T * DL_T), loops: 1 },
    { name: 'DL: Miter Flange end offset .25 (the left flange from z = 2): removes .25·(A+ − (R + T)·T)', plain: DL_MF(DL_I, { miterGap: 0.01 }),
      code: DL_MF(DL_I, { miterGap: 0.01, endOffset: 0.25 }), removed: 0.25 * (DL_AP - 2 * DL_T * DL_T), loops: 1 },
    // lane rfIZ (2026-11-05): the L profile's first-line strips now end square as in SolidWorks (its flat matches SolidWorks to
    // the digit at 10 corners), so the gap no longer takes the diagonal √2·gap·(A1 + A2): this row checks OpenCascade = Anvil
    // (volume 1e-4, flat size, loops) without the old closed form
    { name: 'DL: Miter Flange L profile (1 up, .5 out), gap .02: two bends along the chain, mitred at both levels, square-ended strips as in SolidWorks (OpenCascade = Anvil)',
      code: DL_MF(DL_L, { miterGap: 0.02 }), loops: 1, dxf: true },
    { name: 'DL: Miter Flange Bend Outside, gap .01: the square notch',
      code: DL_MF(DL_I, { position: 'bendOutside', miterGap: 0.01 }), exact: 0.87582227, loops: 1 },   // (rfKC: 0.875831833 on the true curve)
    // lane DT: Vent (Ø2 boundary, two ribs .1 through the centre, a Ø1 spar .1) on a 4 × 4 × .06 base: removes T × the
    // exact open area (dtOpen); a partial Unfold of a U-channel with a Tab folded across a bend keeps the tab's bend part
    { name: 'DT: Vent Ø2, ribs .1 (two, through the centre), spar Ø1 .1, on a 4 × 4 × .06 base flange: removes T × the exact open area; the flat has the 8 vent holes',
      plain: null, code: DT_VENT, exact: 16 * 0.06 - 0.06 * dtOpen, loops: 9 },
    { name: 'DT2: the same Vent with radius .05: the 28 hole corners filleted with exact arcs, removes T × (open area − the corner pieces)',
      plain: null, code: DT_VENT.replace('sparWidth: 0.1 }', 'sparWidth: 0.1, radius: 0.05 }'), exact: 16 * 0.06 - 0.06 * (dtOpen - dtLost), loops: 9 },
    { name: 'DT: U-channel unfolded, a 0.5 × 0.5 × T Tab past the side across the front bend line, Fold, then Unfold of the front bend only: the tab lies flat with its strip (+ 0.25·T exactly)',
      plain: DB2_U + 'p.unfold([1, ' + SH_T + ', 2], [' + DJ_A + ']);', code: DB2_U + 'p.unfold([1, ' + SH_T + ', 2], null);\n' + DT_TAB + 'p.fold();\np.unfold([1, ' + SH_T + ', 2], [' + DJ_A + ']);', removed: -0.25 * SH_T, loops: 1 },
    { name: 'DT: the same, Unfold of the back bend only: the tab stays folded round the front bend, whole (+ 0.25·T exactly)',
      plain: DB2_U + 'p.unfold([1, ' + SH_T + ', 2], [' + DJ_B + ']);', code: DB2_U + 'p.unfold([1, ' + SH_T + ', 2], null);\n' + DT_TAB + 'p.fold();\np.unfold([1, ' + SH_T + ', 2], [' + DJ_B + ']);', removed: -0.25 * SH_T, loops: 1 },
    // lane DQ: Insert Bends / Convert to Sheet Metal
    { name: 'DQ: Insert Bends R .06 on the shelled 2 × 2 × 1 box ripped at its four corners (bottom fixed): four exact bends meeting nothing (Rip took the corners, as SolidWorks); one blank', plain: DQ_RIPPED,
      code: DQ_RIPPED + 'p.insertBends([1, 0, -1], { radius: 0.06 });', removed: 0.652973662 - 0.635963686, loops: 1, dxf: true },
    { name: 'DQ: Convert to Sheet Metal of the solid 2 × 2 × 1 box (bottom fixed, the four bottom edges, T .06, R .06, gap .03) = the ripped box with bends inserted', plain: DQ_RIPPED,
      code: 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.convertSheetMetal([1, 0, -1], [[1, 0, 0], [2, 0, -1], [1, 0, -2], [0, 0, -1]], { thickness: 0.06, radius: 0.06, gap: 0.03 });',
      removed: 0.652973662 - 0.635963686, loops: 1 },
    { name: 'DQ: Insert Bends on a thin L extrude (1.5 × 1, T .06, 2 long; free ends): one exact bend', plain: DQ_L,
      code: DQ_L + 'p.insertBends([0.75, 0, 1], { radius: 0.06 });', removed: 2 * (1 - Math.PI / 4) * DQ_F, loops: 1 },
    // lane smtrim: the 4 × 3 base with Material Inside flanges on the right and front edges (16 ga, R = T, K .5). Trim side
    // bends cuts the right bend's last R + T (its exact quarter annulus); the rectangular Corner Relief .25 centred on the
    // bend lines takes T × its area of the blank (a = .125 − BA/2: face a², both strips BA wide, both walls)
    { name: 'smtrim: Trim side bends on the front flange: the right bend loses its last R + T, π/4·((2T)² − T²)·2T exactly; one blank',
      plain: CW_HEAD + 'p.flange(1, [[4, ' + SH_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2, ' + SH_T + ', 3]], { position: "inside", lengthRef: "outer" });',
      code: CW_HEAD + 'p.flange(1, [[4, ' + SH_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2, ' + SH_T + ', 3]], { position: "inside", lengthRef: "outer", trimSideBends: true });',
      removed: Math.PI / 4 * 3 * SH_T * SH_T * 2 * SH_T, loops: 1, dxf: true },
    { name: 'smtrim: Corner Relief, Rectangular .25 centred on the bend lines, at that corner: T × the relief\'s area of the blank exactly; one blank',
      plain: CW_HEAD + 'p.flange(1, [[4, ' + SH_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2, ' + SH_T + ', 3]], { position: "inside", lengthRef: "outer" });',
      code: CW_HEAD + 'p.flange(1, [[4, ' + SH_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2, ' + SH_T + ', 3]], { position: "inside", lengthRef: "outer" });\np.cornerRelief([[3.88, 0.06, 2.88]], 0.25);',
      removed: (function () { var BA = Math.PI / 2 * 1.5 * SH_T, a = 0.125 - BA / 2; return SH_T * (2 * a * a + BA * (2 * a + 2 * SH_T) + a * (a + 2 * SH_T)); })(), loops: 1, dxf: true },
    { name: 'smtrim: Corner Relief, Circular Ø.25 at that corner, wrapped across both bends: OpenCascade = Anvil; one blank',
      code: CW_HEAD + 'p.flange(1, [[4, ' + SH_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2, ' + SH_T + ', 3]], { position: "inside", lengthRef: "outer" });\np.cornerRelief([[3.88, 0.06, 2.88]], 0.25, { reliefType: "circular" });', loops: 1 },
    // lane smcorner: Welded Corner on the 4 × 3 tray with four separate Material Inside flanges (each later wall stops R
    // short of its neighbour): the weld fills the gap in front of the left wall's end over the straight walls, R·T·H
    // (H = 1 − 2T), plus with a fillet .1 the chorded quarter round r² − 8r²·sin(π/32); the flat is the tray's
    { name: 'smcorner: Welded Corner at the front-left corner: + R·T·H exactly; the flat is the tray\'s, one blank',
      plain: CW_HEAD + SMC_TRAY, code: CW_HEAD + SMC_TRAY + 'p.weldedCorner([[' + SH_T / 2 + ', 0.6, ' + 2 * SH_T + ']]);',
      removed: -SH_T * SH_T * (1 - 2 * SH_T), loops: 1, dxf: true },
    { name: 'smcorner: Welded Corner with a fillet .1 in the inside corner: + H·(R·T + the chorded quarter round) exactly',
      plain: CW_HEAD + SMC_TRAY, code: CW_HEAD + SMC_TRAY + 'p.weldedCorner([[' + SH_T / 2 + ', 0.6, ' + 2 * SH_T + ']], { fillet: 0.1 });',
      removed: -(1 - 2 * SH_T) * (SH_T * SH_T + 0.01 - 8 * 0.01 * Math.sin(Math.PI / 32)), loops: 1 },
    // lane smcorner-2: Corner Relief ▸ 3 Bend corner on a U channel (T = R = .06) with end flanges on the base (down) and
    // both walls (outward), Material Inside: the U bend runs R + T past the end bends' start line between them. A
    // Rectangular .25 centred on the bend lines takes T × (.25² less its part over the corner notch) per corner; Tear
    // takes the U bend's stub, BA × (R + T) × T per corner
    { name: 'smcorner-2: Corner Relief 3 Bend corner, Rectangular .25 at both corners of a U channel\'s end flanges: exact; one blank',
      plain: SMC_U, code: SMC_U + 'p.cornerRelief([[0.06, 0, 0.12], [2.94, 0, 0.12]], 0.25, { cornerType: "3bend" });',
      removed: (function () { var BA = Math.PI / 2 * 0.09; return 2 * 0.06 * (0.0625 - BA * (BA / 2 + 0.125 - 0.12)); })(), loops: 1, dxf: true },
    { name: 'smcorner-2: Corner Relief 3 Bend corner, Tear: the U bends\' stubs between the end bends, 2·BA·(R + T)·T exactly; one blank',
      plain: SMC_U, code: SMC_U + 'p.cornerRelief([[0.06, 0, 0.12], [2.94, 0, 0.12]], null, { cornerType: "3bend", reliefType: "tear" });',
      removed: 2 * Math.PI / 2 * 0.09 * 0.12 * 0.06, loops: 1 },
    // lane smflat-2: Circular Ø.12 and Obround .12 on the same corners, Material Inside and Outside (U bend stub R + T / R):
    // OpenCascade's wrapped cutter (cornerReliefTool) gives a valid solid of the blank's volume (T × the relief's shape
    // less its part over the corner notch, per corner), as Anvil's band rebuild does
    { name: 'smflat-2: Corner Relief 3 Bend corner, Circular Ø.12 centred, Material Inside: T × (the 32-gon less the notch) per corner; one blank',
      plain: SMC_U, code: SMC_U + 'p.cornerRelief([[0.06, 0, 0.12], [2.94, 0, 0.12]], 0.12, { cornerType: "3bend", reliefType: "circular" });',
      removed: 2 * 0.06 * smfRelief('circular', 0.12, 0.12), loops: 1 },
    { name: 'smflat-2: Corner Relief 3 Bend corner, Obround .12 centred, Material Inside: T × (the slot less the notch) per corner; one blank',
      plain: SMC_U, code: SMC_U + 'p.cornerRelief([[0.06, 0, 0.12], [2.94, 0, 0.12]], 0.12, { cornerType: "3bend", reliefType: "obround" });',
      removed: 2 * 0.06 * smfRelief('obround', 0.12, 0.12), loops: 1 },
    { name: 'smflat-2: Corner Relief 3 Bend corner, Circular Ø.12 centred, Material Outside: T × (the 32-gon less the notch) per corner; one blank',
      plain: SMC_UO, code: SMC_UO + 'p.cornerRelief([[0.06, 0, 0.06], [2.94, 0, 0.06]], 0.12, { cornerType: "3bend", reliefType: "circular" });',
      removed: 2 * 0.06 * smfRelief('circular', 0.12, 0.06), loops: 1 },
    { name: 'smflat-2: Corner Relief 3 Bend corner, Obround .12 centred, Material Outside: T × (the slot less the notch) per corner; one blank',
      plain: SMC_UO, code: SMC_UO + 'p.cornerRelief([[0.06, 0, 0.06], [2.94, 0, 0.06]], 0.12, { cornerType: "3bend", reliefType: "obround" });',
      removed: 2 * 0.06 * smfRelief('obround', 0.12, 0.06), loops: 1 }
  ];
  for (var cwk = 0; cwk < CW_CASES.length; cwk++) {
    var cw = CW_CASES[cwk], tcw = performance.now();
    try {
      var cwm = K.newModel('T'); K.runScript(cwm, cw.code);
      var cwb = K.rebuild(cwm), cwmesh = K.meshFromBody(cwb.body), whyW = [];
      if (Object.keys(cwb.errors).length) whyW.push('Anvil errors ' + JSON.stringify(cwb.errors));
      var cwr = await occt(cwm, { noCache: true });
      if (cwr.unsupported) whyW.push('OpenCascade: unsupported ' + cwr.unsupported);
      Object.keys(cwr.status).forEach(function (id) { if (cwr.status[id] !== 'ok') whyW.push('OpenCascade feature ' + id + ': ' + cwr.status[id]); });
      if (!cwr.valid) whyW.push('invalid solid');
      var cwa = K.massProps(cwmesh, 1).volume;
      if (!(Math.abs(cwr.volume - cwa) / cwa <= (cwr.tolerance || 1e-4))) whyW.push('volume ' + cwr.volume.toFixed(6) + ' vs Anvil ' + cwa.toFixed(6));
      var cwWant = cw.exact;
      if (cw.plain) { var cwp = K.newModel('T'); K.runScript(cwp, cw.plain); K.rebuild(cwp); var cwpr = await occt(cwp, { noCache: true }); cwWant = cwpr.volume - cw.removed; }
      if (cwWant == null) cwWant = cwr.volume;
      else if (!(Math.abs(cwr.volume - cwWant) <= 1e-6 * cwWant)) whyW.push('OpenCascade volume ' + cwr.volume.toFixed(8) + ', exact ' + cwWant.toFixed(8));
      var cwfa = cw.noFlat ? null : K.flatPattern(cwm, cwb, cwmesh), cwfo = null;
      if (!whyW.length && !cw.noFlat) {
        var cwob = OcctKernel.toBuild(cwr, cwb, cwmesh, null, CSG, K);
        cwfo = K.flatPattern(cwm, cwob, K.meshFromBody(cwob.body));
        [0, 1].forEach(function (k) { if (Math.abs(cwfo.size[k] - cwfa.size[k]) > 1e-6) whyW.push('flat ' + 'wh'[k] + ' ' + cwfo.size[k].toFixed(4) + ' vs Anvil ' + cwfa.size[k].toFixed(4)); });
        if (cwfo.loops.length !== cw.loops || cwfa.loops.length !== cw.loops) whyW.push('loops ' + cwfo.loops.length + ' / Anvil ' + cwfa.loops.length + ', want ' + cw.loops);
        if (cwfo.bends.length !== cwfa.bends.length) whyW.push('bends ' + cwfo.bends.length + ' / Anvil ' + cwfa.bends.length);
        var cwSrt = function (o) { var s = {}; Object.keys(o).sort().forEach(function (k) { s[k] = o[k]; }); return JSON.stringify(s); };
        if (cw.dxf && cwSrt(shDxf(cwfo)) !== cwSrt(shDxf(cwfa))) whyW.push('DXF ' + JSON.stringify(shDxf(cwfo)) + ' vs Anvil ' + JSON.stringify(shDxf(cwfa)));
        if (cw.holeArea && cwfo.loops.length === 2 && cwfa.loops.length === 2) {
          var cwHo = Math.abs(K.signedArea(cwfo.loops[1])), cwHa = Math.abs(K.signedArea(cwfa.loops[1]));
          if (!(Math.abs(cwHo - cwHa) <= 0.015 * cwHa)) whyW.push('hole area ' + cwHo.toFixed(5) + ' vs Anvil ' + cwHa.toFixed(5));
        }
        if (cw.arcs != null) [['OpenCascade', cwfo], ['Anvil', cwfa]].forEach(function (q) { var dq = shDxf(q[1]); if ((dq['ARC/OUTLINE'] || 0) !== cw.arcs) whyW.push(q[0] + ' flat DXF ' + JSON.stringify(dq) + ', want ' + cw.arcs + ' ARC on OUTLINE'); });
      }
      row(whyW.length ? 'bad' : 'ok', 'OpenCascade = Anvil: ' + cw.name, whyW.join('\n') || ('volume ' + cwr.volume.toFixed(8) + ' (exact ' + cwWant.toFixed(8) + ', Anvil ' + cwa.toFixed(6) + ')' + (cw.noFlat ? '' : ', flat ' + cwfo.size.map(function (v) { return v.toFixed(4); }).join(' × ') + ' in, ' + cwfo.loops.length + ' loop' + (cwfo.loops.length === 1 ? '' : 's') + ', DXF ' + JSON.stringify(shDxf(cwfo)))), performance.now() - tcw);
      counts[whyW.length ? 'fail' : 'pass']++;
    } catch (e) { row('bad', 'OpenCascade = Anvil: ' + cw.name, e.message); counts.fail++; }
  }
  // --- end CW ---
