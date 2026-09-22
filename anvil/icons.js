// icons.js — inline SVG icon set for Anvil's ribbon, tree and panels. Two-tone: slate strokes, blue/green/red accents.
var Icons = (function () {
  'use strict';
  // S is the icon ink: currentColor, so the stylesheet picks it per theme (.ico { color: var(--icon-ink) }; light = #4d5561)
  var S = 'currentColor', B = '#2d7dd2', G = '#3fa34d', R = '#d9453b', A = '#e8a23a', L = '#9aa3ad', F = '#dfe6ee';
  function sw(extra) { return 'fill="none" stroke="' + S + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" ' + (extra || ''); }
  // isometric box helper: front face path, top, side
  function box(color, x, y, w, h, d) {
    return '<path d="M' + x + ' ' + (y + d) + ' l' + w + ' 0 l0 ' + h + ' l-' + w + ' 0 z" fill="' + color + '" ' + sw() + '/>' +
      '<path d="M' + x + ' ' + (y + d) + ' l' + d + ' -' + d + ' l' + w + ' 0 l-' + d + ' ' + d + ' z" fill="' + F + '" ' + sw() + '/>' +
      '<path d="M' + (x + w) + ' ' + (y + d) + ' l' + d + ' -' + d + ' l0 ' + h + ' l-' + d + ' ' + d + ' z" fill="' + L + '" ' + sw() + '/>';
  }
  var I = {
    extrude: box(G, 6, 8, 14, 12, 6) + '<path d="M24 5 v-3 M22 4 l2 -2 2 2" ' + sw('stroke="' + B + '"') + '/>',
    cut: box(F, 5, 9, 16, 12, 6) + '<circle cx="13" cy="20" r="4" fill="' + R + '" ' + sw() + '/>',
    revolve: '<path d="M16 4 v24" ' + sw('stroke-dasharray="3 2"') + '/><path d="M16 8 h7 l3 5 v6 l-3 5 h-7 z" fill="' + G + '" ' + sw() + '/><path d="M6 12 a10 4 0 0 0 20 0" ' + sw('stroke="' + B + '"') + '/>',
    revolveCut: '<path d="M16 4 v24" ' + sw('stroke-dasharray="3 2"') + '/><path d="M16 8 h7 l3 5 v6 l-3 5 h-7 z" fill="' + F + '" ' + sw() + '/><path d="M19 12 h4 v6 h-4 z" fill="' + R + '" ' + sw() + '/>',
    sweep: '<path d="M6 26 C6 14 16 18 16 8" ' + sw('stroke="' + B + '"') + '/><circle cx="16" cy="8" r="3" fill="' + G + '" ' + sw() + '/>',
    loft: '<path d="M8 8 h16 M6 24 h20 M8 8 L6 24 M24 8 L26 24" ' + sw() + '/><path d="M8 8 h16 l2 16 h-20 z" fill="' + G + '" fill-opacity="0.5" stroke="none"/>',
    hole: box(F, 5, 9, 16, 12, 6) + '<ellipse cx="13" cy="15" rx="4" ry="1.6" fill="' + R + '" ' + sw() + '/>',
    fillet: '<path d="M6 26 V12 a6 6 0 0 1 6 -6 h14" ' + sw() + '/><path d="M6 26 V12 a6 6 0 0 1 6 -6 h14 v20 z" fill="' + F + '" stroke="none"/><path d="M6 26 V12 a6 6 0 0 1 6 -6 h14" ' + sw('stroke="' + B + '"') + '/>',
    chamfer: '<path d="M6 26 V14 l8 -8 h12 v20 z" fill="' + F + '" ' + sw() + '/><path d="M6 14 l8 -8" ' + sw('stroke="' + B + '"') + '/>',
    lpattern: '<rect x="4" y="12" width="6" height="8" fill="' + G + '" ' + sw() + '/><rect x="13" y="12" width="6" height="8" fill="' + G + '" ' + sw() + '/><rect x="22" y="12" width="6" height="8" fill="' + G + '" ' + sw() + '/><path d="M4 25 h24" ' + sw('stroke="' + B + '"') + '/>',
    cpattern: '<circle cx="16" cy="16" r="10" ' + sw('stroke-dasharray="3 2"') + '/><circle cx="16" cy="6" r="3" fill="' + G + '" ' + sw() + '/><circle cx="25" cy="21" r="3" fill="' + G + '" ' + sw() + '/><circle cx="7" cy="21" r="3" fill="' + G + '" ' + sw() + '/>',
    mirror: '<path d="M16 4 v24" ' + sw('stroke="' + B + '" stroke-dasharray="3 2"') + '/><path d="M13 9 h-7 v14 h7 z" fill="' + G + '" ' + sw() + '/><path d="M19 9 h7 v14 h-7 z" fill="' + G + '" fill-opacity="0.45" ' + sw() + '/>',
    shell: box(F, 6, 8, 16, 12, 6) + '<path d="M9 12 h10 v9 h-10 z" fill="#fff" ' + sw() + '/>',
    draft: '<path d="M8 26 L12 6 h8 l4 20 z" fill="' + F + '" ' + sw() + '/>',
    rib: box(F, 6, 8, 16, 12, 6) + '<path d="M10 20 l6 -8 v8 z" fill="' + G + '" ' + sw() + '/>',
    wrap: '<path d="M6 10 a10 6 0 0 1 20 0 v12 a10 6 0 0 1 -20 0 z" fill="' + F + '" ' + sw() + '/><path d="M10 14 h12" ' + sw('stroke="' + B + '"') + '/>',
    intersect: '<circle cx="12" cy="16" r="8" fill="' + F + '" ' + sw() + '/><circle cx="20" cy="16" r="8" fill="' + F + '" fill-opacity="0.6" ' + sw() + '/>',
    refgeo: '<path d="M4 22 l8 -8 h16 l-8 8 z" fill="' + B + '" fill-opacity="0.25" ' + sw('stroke="' + B + '"') + '/><path d="M16 26 v-16 M16 10 l-3 3 M16 10 l3 3" ' + sw() + '/>',
    curves: '<path d="M4 24 C10 4 22 28 28 8" ' + sw('stroke="' + B + '"') + '/>',
    instant: '<path d="M16 6 v20 M6 16 h20" ' + sw() + '/><path d="M16 6 l-3 3 M16 6 l3 3 M26 16 l-3 -3 M26 16 l-3 3" ' + sw('stroke="' + B + '"') + '/>',
    sketch: '<rect x="5" y="9" width="22" height="16" rx="1" fill="#fff" ' + sw() + '/><path d="M9 21 L17 11 l4 4 L13 23 z" fill="' + A + '" ' + sw() + '/>',
    exitSketch: '<rect x="5" y="9" width="22" height="16" rx="1" fill="#fff" ' + sw() + '/><path d="M10 17 h12 M18 13 l4 4 -4 4" ' + sw('stroke="' + B + '"') + '/>',
    dim: '<path d="M6 22 h20 M6 19 v6 M26 19 v6" ' + sw() + '/><path d="M9 22 l3 -2 M9 22 l3 2 M23 22 l-3 -2 M23 22 l-3 2" ' + sw('stroke="' + B + '"') + '/><text x="16" y="15" font-size="9" font-family="Segoe UI, sans-serif" fill="' + S + '" text-anchor="middle">10</text>',
    line: '<path d="M6 24 L26 8" ' + sw('stroke="' + B + '"') + '/><circle cx="6" cy="24" r="2" fill="' + S + '"/><circle cx="26" cy="8" r="2" fill="' + S + '"/>',
    rect: '<rect x="6" y="9" width="20" height="14" ' + sw('stroke="' + B + '"') + '/><circle cx="6" cy="9" r="2" fill="' + S + '"/><circle cx="26" cy="23" r="2" fill="' + S + '"/>',
    crect: '<rect x="6" y="9" width="20" height="14" ' + sw('stroke="' + B + '"') + '/><path d="M13 16 h6 M16 13 v6" ' + sw() + '/>',
    circle: '<circle cx="16" cy="16" r="10" ' + sw('stroke="' + B + '"') + '/><path d="M14 16 h4 M16 14 v4" ' + sw() + '/>',
    arc: '<path d="M8 24 A11 11 0 0 1 24 8" ' + sw('stroke="' + B + '"') + '/><path d="M14 20 h4 M16 18 v4" ' + sw() + '/>',
    polygon: '<path d="M16 5 l10 6 v10 l-10 6 l-10 -6 v-10 z" ' + sw('stroke="' + B + '"') + '/>',
    slot: '<path d="M10 10 h12 a6 6 0 0 1 0 12 h-12 a6 6 0 0 1 0 -12 z" ' + sw('stroke="' + B + '"') + '/>',
    spline: '<path d="M5 24 C10 4 20 30 27 8" ' + sw('stroke="' + B + '"') + '/>',
    ellipse: '<ellipse cx="16" cy="16" rx="11" ry="7" ' + sw('stroke="' + B + '"') + '/>',
    point: '<circle cx="16" cy="16" r="2.5" fill="' + B + '"/><path d="M16 8 v4 M16 20 v4 M8 16 h4 M20 16 h4" ' + sw() + '/>',
    text: '<text x="16" y="23" font-size="18" font-family="Georgia, serif" fill="' + S + '" text-anchor="middle">A</text>',
    trim: '<path d="M6 10 h20 M6 22 h20" ' + sw('stroke="' + B + '"') + '/><path d="M16 6 v20" ' + sw('stroke-dasharray="3 2"') + '/><path d="M12 14 l4 -4 4 4" ' + sw('stroke="' + R + '"') + '/>',
    convert: '<rect x="6" y="6" width="20" height="20" ' + sw() + '/><rect x="10" y="10" width="12" height="12" ' + sw('stroke="' + B + '"') + '/>',
    offset: '<rect x="8" y="8" width="16" height="16" ' + sw('stroke="' + B + '"') + '/><rect x="4" y="4" width="24" height="24" ' + sw('stroke-dasharray="3 2"') + '/>',
    mirrorEnt: '<path d="M16 5 v22" ' + sw('stroke-dasharray="3 2"') + '/><path d="M12 10 L6 22 h6 z" ' + sw('stroke="' + B + '"') + '/><path d="M20 10 L26 22 h-6 z" ' + sw('stroke="' + B + '" stroke-dasharray="2 2"') + '/>',
    sketchPattern: '<circle cx="8" cy="16" r="3" ' + sw('stroke="' + B + '"') + '/><circle cx="16" cy="16" r="3" ' + sw('stroke="' + B + '"') + '/><circle cx="24" cy="16" r="3" ' + sw('stroke="' + B + '"') + '/>',
    relations: '<path d="M6 22 h20 M6 10 h20" ' + sw('stroke="' + B + '"') + '/><path d="M10 14 v4 M22 14 v4" ' + sw() + '/>',
    plane: '<path d="M4 22 l8 -10 h16 l-8 10 z" fill="' + B + '" fill-opacity="0.2" ' + sw('stroke="' + B + '"') + '/>',
    planeSmall: '<path d="M2 12 l4 -6 h8 l-4 6 z" fill="' + B + '" fill-opacity="0.25" stroke="' + B + '" stroke-width="1.2"/>',
    origin: '<path d="M4 12 h9 M4 12 v-9" fill="none" stroke="' + R + '" stroke-width="1.6"/><path d="M4 12 l4 3" fill="none" stroke="' + B + '" stroke-width="1.6"/><circle cx="4" cy="12" r="1.5" fill="' + S + '"/>',
    part: '<path d="M3 5 l5 -3 h6 l-5 3 z M3 5 h6 v9 h-6 z M9 5 l5 -3 v9 l-5 3 z" fill="' + F + '" stroke="' + S + '" stroke-width="1"/>',
    measure: '<path d="M4 24 L24 4 l4 4 L8 28 z" fill="' + A + '" fill-opacity="0.5" ' + sw() + '/><path d="M9 19 l2 2 M13 15 l2 2 M17 11 l2 2 M21 7 l2 2" ' + sw() + '/>',
    mass: '<path d="M16 6 l10 6 -4 14 h-12 l-4 -14 z" fill="' + F + '" ' + sw() + '/><circle cx="16" cy="16" r="2" fill="' + R + '"/><path d="M16 10 v12 M10 16 h12" ' + sw('stroke="' + B + '" stroke-width="1"') + '/>',
    section: box(F, 6, 8, 16, 12, 6) + '<path d="M4 6 L28 26" ' + sw('stroke="' + R + '"') + '/>',
    sensor: '<circle cx="16" cy="16" r="9" ' + sw() + '/><path d="M16 16 l5 -5" ' + sw('stroke="' + R + '"') + '/>',
    check: '<path d="M6 17 l6 6 L26 9" ' + sw('stroke="' + G + '" stroke-width="2.4"') + '/>',
    zebra: '<circle cx="16" cy="16" r="10" fill="' + F + '" ' + sw() + '/><path d="M8 11 c6 2 10 2 16 0 M7 16 c6 2 12 2 18 0 M8 21 c6 2 10 2 16 0" ' + sw() + '/>',
    dxf: '<rect x="6" y="4" width="20" height="24" rx="1" fill="#fff" ' + sw() + '/><path d="M10 9 h12 M10 13 h12 M10 17 h8" ' + sw('stroke="' + L + '"') + '/><text x="16" y="25" font-size="7" font-weight="700" font-family="Segoe UI, sans-serif" fill="' + B + '" text-anchor="middle">DXF</text>',
    flange: '<path d="M4 24 h12 v-14 h12" ' + sw('stroke-width="3.5" stroke="' + G + '"') + '/>',
    bend: '<path d="M6 24 h10 a6 6 0 0 0 6 -6 v-10" ' + sw('stroke-width="3.5" stroke="' + G + '"') + '/>',
    // miter flange: two walls meeting at a corner with the 45° mitre line between them
    miter: '<path d="M4 26 h12 v-14" ' + sw('stroke-width="3.5" stroke="' + G + '"') + '/><path d="M16 26 l10 -8 v-12" ' + sw('stroke-width="3.5" stroke="' + G + '" stroke-opacity="0.55"') + '/><path d="M16 26 L27 15" ' + sw('stroke="' + B + '" stroke-dasharray="3 2"') + '/>',
    flatten: '<path d="M4 20 h24" ' + sw('stroke-width="3.5" stroke="' + G + '"') + '/><path d="M8 10 l4 -4 h12 l-4 4 z" fill="' + F + '" ' + sw() + '/>',
    fit: '<path d="M5 11 V5 h6 M21 5 h6 v6 M27 21 v6 h-6 M11 27 H5 v-6" ' + sw() + '/><rect x="11" y="11" width="10" height="10" fill="' + B + '" fill-opacity="0.35" ' + sw('stroke="' + B + '"') + '/>',
    zoomArea: '<circle cx="14" cy="14" r="8" ' + sw() + '/><path d="M20 20 l7 7" ' + sw('stroke-width="2.4"') + '/><rect x="10" y="10" width="8" height="8" ' + sw('stroke="' + B + '" stroke-dasharray="2 2"') + '/>',
    prevView: '<path d="M20 6 l-10 10 10 10" ' + sw('stroke-width="2.2"') + '/>',
    orient: box(F, 8, 9, 12, 10, 5) + '<circle cx="24" cy="24" r="5" fill="#fff" ' + sw('stroke="' + B + '"') + '/><path d="M24 21 v3 l2 1" ' + sw('stroke="' + B + '"') + '/>',
    display: box('#b9c2cc', 6, 8, 16, 12, 6),
    hideshow: '<path d="M3 16 c4 -6 22 -6 26 0 c-4 6 -22 6 -26 0 z" ' + sw() + '/><circle cx="16" cy="16" r="4" fill="' + B + '"/>',
    appearance: '<circle cx="16" cy="16" r="10" fill="' + F + '" ' + sw() + '/><circle cx="12" cy="13" r="2" fill="' + R + '"/><circle cx="19" cy="11" r="2" fill="' + B + '"/><circle cx="20" cy="18" r="2" fill="' + G + '"/><circle cx="13" cy="20" r="2" fill="' + A + '"/>',
    scene: '<rect x="4" y="6" width="24" height="20" rx="1" fill="#fff" ' + sw() + '/><path d="M4 22 l8 -7 6 5 4 -3 6 5" ' + sw('stroke="' + B + '"') + '/><circle cx="22" cy="11" r="2" fill="' + A + '"/>',
    settings: '<circle cx="16" cy="16" r="4" ' + sw() + '/><path d="M16 4 v4 M16 24 v4 M4 16 h4 M24 16 h4 M7.5 7.5 l3 3 M21.5 21.5 l3 3 M7.5 24.5 l3 -3 M21.5 10.5 l3 -3" ' + sw() + '/>',
    tree: '<path d="M6 6 h6 M6 12 h4 M10 12 h10 M6 18 h4 M10 18 h10 M10 24 h4 M14 24 h8" ' + sw('stroke="' + B + '"') + '/><path d="M8 6 v18" ' + sw() + '/>',
    pm: '<rect x="6" y="5" width="20" height="22" rx="1" fill="#fff" ' + sw() + '/><path d="M9 10 h14 M9 15 h14 M9 20 h8" ' + sw('stroke="' + B + '"') + '/>',
    config: '<rect x="5" y="7" width="8" height="8" fill="' + F + '" ' + sw() + '/><rect x="19" y="7" width="8" height="8" fill="' + F + '" ' + sw() + '/><rect x="12" y="19" width="8" height="8" fill="' + B + '" fill-opacity="0.3" ' + sw() + '/>',
    dimx: '<path d="M6 24 h20" ' + sw() + '/><path d="M8 24 l3 -2 M8 24 l3 2 M24 24 l-3 -2 M24 24 l-3 2" ' + sw('stroke="' + B + '"') + '/><circle cx="16" cy="12" r="5" fill="' + G + '" ' + sw() + '/>',
    dispman: '<circle cx="16" cy="16" r="10" fill="url(#g)" ' + sw() + '/><defs><radialGradient id="g" cx="35%" cy="35%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="' + B + '"/></radialGradient></defs>',
    home: '<path d="M4 16 L16 5 l12 11" ' + sw('stroke="' + B + '"') + '/><path d="M8 14 v13 h16 v-13" fill="' + F + '" ' + sw() + '/>',
    library: '<path d="M5 6 h6 v20 h-6 z M13 6 h6 v20 h-6 z M20 8 l6 -1 4 18 -6 1 z" fill="' + F + '" ' + sw() + '/>',
    explorer: '<path d="M4 9 h9 l3 3 h12 v14 h-24 z" fill="' + A + '" fill-opacity="0.6" ' + sw() + '/>',
    palette: '<rect x="5" y="5" width="9" height="9" fill="' + F + '" ' + sw() + '/><rect x="18" y="5" width="9" height="9" fill="' + F + '" ' + sw() + '/><rect x="5" y="18" width="9" height="9" fill="' + F + '" ' + sw() + '/><rect x="18" y="18" width="9" height="9" fill="' + B + '" fill-opacity="0.3" ' + sw() + '/>',
    props: '<rect x="6" y="5" width="20" height="22" rx="1" fill="#fff" ' + sw() + '/><path d="M10 11 h12 M10 16 h12 M10 21 h7" ' + sw() + '/><path d="M20 20 l2 2 4 -4" ' + sw('stroke="' + G + '"') + '/>',
    macro: '<rect x="4" y="6" width="24" height="20" rx="2" fill="#2b3340" stroke="none"/><path d="M8 12 l4 4 -4 4" fill="none" stroke="#7ee787" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 20 h8" stroke="#dfe6ee" stroke-width="2" stroke-linecap="round"/>',
    warn: '<path d="M16 4 L29 27 H3 z" fill="' + A + '" ' + sw() + '/><path d="M16 12 v8 M16 23 v1" ' + sw('stroke-width="2.4"') + '/>',
    error: '<circle cx="16" cy="16" r="11" fill="' + R + '" ' + sw() + '/><path d="M11 11 l10 10 M21 11 l-10 10" ' + sw('stroke="#fff" stroke-width="2.4"') + '/>',
    ok: '<path d="M5 17 l7 7 L27 8" fill="none" stroke="' + G + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    cancel: '<path d="M8 8 l16 16 M24 8 L8 24" fill="none" stroke="' + R + '" stroke-width="4" stroke-linecap="round"/>',
    generic: '<rect x="7" y="7" width="18" height="18" rx="2" fill="' + F + '" ' + sw() + '/>',
    search: '<circle cx="14" cy="14" r="7" ' + sw() + '/><path d="M19 19 l7 7" ' + sw('stroke-width="2.2"') + '/>',
    filter: '<path d="M4 6 h24 l-9 10 v9 l-6 3 v-12 z" fill="' + F + '" ' + sw() + '/>',
    body: '<path d="M3 5 l5 -3 h6 l-5 3 z M3 5 h6 v9 h-6 z M9 5 l5 -3 v9 l-5 3 z" fill="' + B + '" fill-opacity="0.3" stroke="' + S + '" stroke-width="1"/>',
    material: '<path d="M3 13 l5 -9 h5 l-5 9 z" fill="' + A + '" fill-opacity="0.6" stroke="' + S + '" stroke-width="1"/>',
    folder: '<path d="M2 4 h4 l1.5 1.5 H14 v8 H2 z" fill="' + A + '" fill-opacity="0.7" stroke="' + S + '" stroke-width="1"/>',
    annotations: '<path d="M3 12 V4 h7 l3 3 v5 z" fill="#fff" stroke="' + S + '" stroke-width="1"/><path d="M5 8 h6 M5 10 h4" stroke="' + B + '" stroke-width="1"/>'
  };
  function icon(name, size, cls) {
    var body = I[name] || I.generic;
    var vb = (name === 'planeSmall' || name === 'origin' || name === 'part' || name === 'body' || name === 'material' || name === 'folder' || name === 'annotations') ? '0 0 16 16' : '0 0 32 32';
    size = size || 32;
    return '<svg class="ico ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="' + vb + '" aria-hidden="true">' + body + '</svg>';
  }
  icon.has = function (name) { return !!I[name]; };
  return icon;
})();
