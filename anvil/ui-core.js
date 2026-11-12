// ui-core.js — application state, Three.js scene, camera controls, rendering, picking, highlights.
// Other ui-*.js files extend the shared `UI` namespace. Load order: core, sketch, commands, panels.
var UI = (function () {
  'use strict';
  var K = Kernel, V = K.vec;

  var App = {
    model: null, build: null, mesh: null, triShared: null,
    undo: [], redo: [],
    sel: null, sel2: null, hover: null,
    // multi-body parts: body index -> true for bodies hidden in the viewport only (not saved, not undoable);
    // App.mesh stays the combined mesh, so face indices, mass properties and exports are unaffected
    hiddenBodies: {},
    mode: 'part', activeSketch: null,
    tool: null, toolState: null, tempEntities: [],
    command: null,
    view: { style: 'shadedEdges', showPlanes: false, showOrigin: true, showSketches: false, showGrid: false, snapModel: true, showDims: false, section: null, bg: 'gradient' },
    ribbonTab: 'Features',
    viewHistory: [],
    sketchDirty: false,
    // Web Worker rebuilds: on by default when served over http(s); persisted in localStorage 'anvil.worker'
    workerOn: false, rebuilding: false
  };
  (function () {
    var on = !!window.Worker && /^http/.test(location.protocol);
    try { var s = localStorage.getItem('anvil.worker'); if (s === '0') on = false; else if (s === '1') on = !!window.Worker; } catch (e) { }
    App.workerOn = on;
  })();

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'style') e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function fmtNum(n, d) { if (n == null || isNaN(n)) return '-'; var p = Math.pow(10, d == null ? 3 : d); return String(Math.round(n * p) / p); }
  function unitLabel() { return App.model.units === 'in' ? 'in' : 'mm'; }
  // r15/inches15: Anvil defaults new documents to inches (IPS), the shop's unit system. Tools ▸ Default units changes it
  // (localStorage anvil.units: 'in' | 'mm'); scripts that call .units() and saved documents keep their own units.
  function defaultUnits() { try { var u = localStorage.getItem('anvil.units'); return u === 'mm' ? 'mm' : 'in'; } catch (e) { return 'in'; } }
  function setDefaultUnits(u) { try { localStorage.setItem('anvil.units', u === 'mm' ? 'mm' : 'in'); } catch (e) { } return defaultUnits(); }
  // A PropertyManager's default length, given in mm: the same in a mm document; in an inch document the nearest
  // shop fraction (1/32 under 1/16 in, 1/16 under 1/4, 1/8 under 1 in, 1/4 above), so 10 mm reads 0.375 in, 20 mm 0.75 in and 2 mm 0.0625 in.
  function lenDefault(mm) {
    if (!App.model || App.model.units !== 'in') return mm;
    var v = mm / 25.4, step = v < 0.0625 ? 32 : v < 0.25 ? 16 : v < 1 ? 8 : 4;
    return Math.max(1 / 32, Math.round(v * step) / step);
  }

  // ------------------------------------------------------------------ three.js scene
  var viewport = $('viewport');
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  renderer.autoClear = false;
  renderer.domElement.className = 'gl';
  viewport.insertBefore(renderer.domElement, viewport.firstChild);

  var scene = new THREE.Scene();
  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 40000);
  scene.add(camera);
  // r14/viewui14: SolidWorks-like studio lighting, all riding on the camera so the model reads the same from every
  // side: a sky / ground ambient, a key light from the upper left front, a softer fill from the lower right, and a rim
  // light from behind that brightens faces turning away from the viewer (silhouettes stand off the background).
  // rfBH: with the lights aimed (below), more sky and fill keep the side faces from going dark; no light sits on the
  // view axis (its Blinn-Phong highlight whitens a face square to the view); intensities set so an
  // isometric box reads top ~0.85, sides ~0.5-0.6 and a face square to the view ~0.76 of the part colour
  // rfHA graphics area: re-balanced as a three-point studio rig so planar faces at different angles take distinct
  // tones (isometric box: top ~196, left ~148, right ~112 of 255; a face square to the view ~162, never washed out):
  // a stronger key from the upper left front, a low soft fill from below the view (it no longer lights the right side as
  // much as the key lights the left, which made both sides one grey), the rim kept; more sky / darker ground ambient.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x636363, 0.85));   // rfBU: neutral ground light (was bluish 0x8d96a1)
  var key = new THREE.DirectionalLight(0xffffff, 0.64); key.position.set(-0.8, 1, 1.05); camera.add(key);
  var fill = new THREE.DirectionalLight(0xffffff, 0.31); fill.position.set(0.05, -0.52, 0.3); camera.add(fill);
  var rim = new THREE.DirectionalLight(0xffffff, 0.25); rim.position.set(0.3, 0.6, -1); camera.add(rim);
  // rfBH: the lights' targets ride on the camera too. A DirectionalLight aims at its target, which defaults to the world
  // origin: with the light 10000 units out on the camera that made all three a headlight, so a face square to the view
  // took key + fill + rim at once and washed out to white (a sketch plane's face seen Normal To). Aimed at the camera's
  // own origin, the offsets above are the true directions in view space: a face square to the view reads light grey,
  // the top of an isometric view lighter than its sides, as SolidWorks shades.
  [key, fill, rim].forEach(function (l) { camera.add(l.target); l.target.position.set(0, 0, 0); });

  var groups = {
    body: new THREE.Group(), edges: new THREE.Group(), sketches: new THREE.Group(), temp: new THREE.Group(),
    preview: new THREE.Group(), planes: new THREE.Group(), grid: new THREE.Group(), origin: new THREE.Group(), highlight: new THREE.Group()
  };
  Object.keys(groups).forEach(function (k) { scene.add(groups[k]); });

  var mats = {
    part: new THREE.MeshPhongMaterial({ color: 0x8c8c8c, specular: 0x262626, shininess: 40, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),   // rfHA: a restrained satin highlight (was 0x555555 / 64, r14 0x2a2f36 / 38)
    // r14/viewui14: the HLR / HLV occluder writes depth only, so the background (gradient, plain or dark) shows through it
    // as in SolidWorks; the edges are drawn after it (renderOrder 0.5), so hidden ones are still hidden
    hlr: new THREE.MeshBasicMaterial({ color: 0xffffff, colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    // rfBR: the graphics area is Mastercam's grey-black, so the wireframe is white: model edges in Wireframe / HLR / HLV
    // (dark on a shaded body: applyLinePalette), every sketch entity whatever its definition state; a selection is yellow
    // (the sketch entity / model edge drawn dashed); no blue anywhere in the graphics area
    edge: new THREE.LineBasicMaterial({ color: 0xffffff }),
    // r14/viewui14: face highlights are a tint over the shaded face, not a repaint (rfBR: yellow for selected, orange for
    // the pre-highlight), light enough that the face's shading (and its edges) still read through. rfHY: no slope factor
    // (units only): a negative factor pulls a facet seen edge-on (a bore's wall at its left / right extreme) forward by
    // its huge depth slope, so the tint streaked through the plate in front of it (the user's "blue lines tearing past
    // the FOV"); the body's faces sit back by their slope (polygonOffsetFactor ≥ 1), so units alone keep the tint on top
    hover: new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.38,   // r5/select5: orange like edge / vertex / sketch pre-highlights (was light blue)
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
    sel: new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3, side: THREE.DoubleSide }),   // 2026-10-27 user: selected faces / solids light blue (rfBR yellow 0xffd400 stays for edges and sketch entities)
    preview: new THREE.MeshPhongMaterial({ color: 0xf2cf5b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    previewCut: new THREE.MeshPhongMaterial({ color: 0xe8746a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
    // the sketch being edited is drawn on top of the body so it stays visible on hidden planes
    sketch: new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    sketchDim: new THREE.LineBasicMaterial({ color: 0xc8c8c8 }),   // sketches not being edited: a slightly dimmer white
    // rfBR: selected sketch entities yellow and dashed (Mastercam's selection): the dash is in screen pixels (dashPx /
    // gapPx, read by the thick-line shader; dashSize / gapSize follow the zoom for the 1-pixel fallback)
    sketchSel: new THREE.LineDashedMaterial({ color: 0xffd400, depthTest: false, dashSize: 1, gapSize: 0.6 }),
    // active-sketch entities by definition state (sketch-solver.js): under = mats.sketch, fully defined (rfBR: both white,
    // the status bar names the state), over defined (redundant) and conflict red
    sketchFull: new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    sketchOver: new THREE.LineBasicMaterial({ color: 0xd9302c, depthTest: false }),   // sketchdims: over defined is red, as SolidWorks draws it
    sketchConflict: new THREE.LineBasicMaterial({ color: 0xd9302c, depthTest: false }),
    sketchConstr: new THREE.LineBasicMaterial({ color: 0xa8a8a8, depthTest: false }),   // rfBR: construction geometry light grey (dashed)
    temp: new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    planeFace: new THREE.MeshBasicMaterial({ color: 0x8c8c8c, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    planeFaceHi: new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    planeFaceHover: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),   // r5/select5
    planeLine: new THREE.LineBasicMaterial({ color: 0x8c8c8c }),
    grid: new THREE.LineBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.55 }),
    gridMajor: new THREE.LineBasicMaterial({ color: 0x626262, transparent: true, opacity: 0.7 })
  };
  mats.sketchSel.userData.dashPx = 6; mats.sketchSel.userData.gapPx = 4;
  mats.sketchDangling = new THREE.LineBasicMaterial({ color: 0xa88300 });   // r12/occtui12: a Dangling sketch (its face is gone), SolidWorks' olive

  var bodyMesh = null, edgeLines = null;

  // ------------------------------------------------------------------ viewport theme
  // The viewport background is CSS (the renderer clears to transparent). rfBR: grey-black (Mastercam's graphics area)
  // with the dark theme or the Dark background; user 2026-11-04 ("in the light view the workspace background should be
  // light"): the light theme's Gradient and Plain backgrounds are a light ground (#viewport.vp-light, style.css) with
  // near-black lines. LINE_PALETTE (dark ground) is exactly the colours the materials are created with. The HLR body
  // colour only occludes (colorWrite off).
  var LINE_PALETTE_LIGHT = { edge: 0x1a1a1a, grid: 0xcacaca, gridMajor: 0xa8a8a8, sketchDim: 0x5a5a5a, planeLine: 0x8c8c8c, hlr: 0xffffff, sketchFull: 0x141414, sketch: 0x141414, temp: 0x141414, sketchSel: 0xc49000, sketchConstr: 0x8c8c8c };
  var LINE_PALETTE = { edge: 0xffffff, grid: 0x4a4a4a, gridMajor: 0x626262, sketchDim: 0xc8c8c8, planeLine: 0x8c8c8c, hlr: 0x1e1e1e, sketchFull: 0xffffff, sketch: 0xffffff, temp: 0xffffff, sketchSel: 0xffd400, sketchConstr: 0xa8a8a8 };
  // lane mctheme: an interface profile's graphics colours over the palette above (ui-profiles.js viewport.colors, set by
  // the tail IIFE's applyViewport): wireframe = every sketch line that is not construction, selected or in error; solid =
  // the part colour while the model has none of its own (Materials.displayColor of nothing); gnomon = the triad's X Y Z.
  // UI.profileViewportColors(colors | null) sets or clears them and returns what is in force; it re-asserts itself once
  // per frame (UI.viewFurnitureTick), so applyLinePalette / applyDisplayStyle resetting the tables is undone within a frame;
  // null puts Anvil's own colours back at once.
  var profVp = null, profTriad = null;
  function profileViewportColors(c) {
    if (arguments.length) {
      var was = profVp;
      profVp = c && typeof c === 'object' ? c : null;
      if (!profTriad) profTriad = TRIAD_AXES.map(function (a) { return a[1]; });
      TRIAD_AXES.forEach(function (a, i) { a[1] = profVp && profVp.gnomon && profVp.gnomon[i] ? profVp.gnomon[i] : profTriad[i]; });
      if (was && !profVp) { mats.part.color.set(partColor(App.model && App.model.color)); applyLinePalette(); }
      syncProfileViewportColors();
      if (UI && UI.drawTriad) drawTriad();
    }
    return profVp ? { wireframe: profVp.wireframe || null, solid: profVp.solid || null, gnomon: TRIAD_AXES.map(function (a) { return a[1]; }) } : null;
  }
  function syncProfileViewportColors() {
    if (!profVp) return false;
    var changed = false, c = new THREE.Color();
    if (profVp.wireframe) {
      c.set(profVp.wireframe);
      ['sketch', 'sketchFull', 'sketchDim', 'temp'].forEach(function (k) { if (mats[k].color.getHex() !== c.getHex()) { mats[k].color.copy(c); mats[k].needsUpdate = true; changed = true; } });
    }
    if (profVp.solid && !mats.part.vertexColors && App.model && partColor(App.model.color) === partColor(null)) {
      c.set(profVp.solid);
      if (mats.part.color.getHex() !== c.getHex()) { mats.part.color.copy(c); changed = true; }
    }
    if (changed) needsRender = true;
    return changed;
  }
  var viewportTheme = 'light';
  // r14/viewui14: model edges on a shaded body stay dark as in SolidWorks (light edges on a light grey body read as a
  // washed-out outline) and are white only where the body is not painted (HLR / HLV / wireframe).
  var EDGE_ON_BODY_DARK = 0x161616;
  function darkViewport() { return viewportTheme === 'dark' || App.view.bg === 'dark'; }
  function applyLinePalette() {
    var dark = darkViewport(), c = dark ? LINE_PALETTE : LINE_PALETTE_LIGHT;
    if (viewport) viewport.classList.toggle('vp-light', !dark);
    Object.keys(c).forEach(function (k) { if (mats[k].color.getHex() !== c[k]) { mats[k].color.setHex(c[k]); mats[k].needsUpdate = true; } });
    var s = App.view.style, painted = s !== 'hlr' && s !== 'hlv' && s !== 'wireframe';
    if (painted && mats.edge.color.getHex() !== EDGE_ON_BODY_DARK) { mats.edge.color.setHex(EDGE_ON_BODY_DARK); mats.edge.needsUpdate = true; }
    needsRender = true;
  }
  // setViewportTheme('dark' | 'light'): idempotent; UI.setTheme (ui-app.js) calls it after switching the stylesheet.
  function setViewportTheme(name) {
    name = name === 'dark' ? 'dark' : 'light';
    viewportTheme = name;
    applyLinePalette();
    if (UI) UI.viewportTheme = name;  // UI is still undefined during the boot call below; the export picks the value up
    if (UI && UI.drawTriad) drawTriad();
    if (App.model) render();          // before boot the frame loop is not running and the canvas has no size yet
    return name;
  }

  // r14/viewui14: View ▸ Background — 'gradient' (rfBR: grey #3c3c3c at the top to near black, Mastercam's), 'plain'
  // (a flat grey-black) or 'dark' (the darkest); remembered per browser in localStorage 'anvil.bg'. The background is
  // CSS behind the transparent canvas, so a change costs no WebGL work. ('white' is the older name of 'plain'.)
  var BACKGROUNDS = ['gradient', 'plain', 'dark'];
  function setBackground(b, noSave) {
    if (b === 'white') b = 'plain';
    if (BACKGROUNDS.indexOf(b) < 0) b = 'gradient';
    App.view.bg = b;
    viewport.classList.remove('bg-white', 'bg-plain', 'bg-dark');
    if (b !== 'gradient') viewport.classList.add('bg-' + b);
    if (!noSave) { try { localStorage.setItem('anvil.bg', b); } catch (e) { } }
    applyLinePalette();
    if (UI && UI.drawTriad) drawTriad();
    return b;
  }

  // r14/viewui14: cheap edge darkening — faces that turn away from the viewer shade a little darker towards their
  // silhouette, so rounds, holes and bosses read with depth like SolidWorks' default appearance (one multiply in the
  // fragment shader; no extra pass, so orbit cost is unchanged).
  function edgeDarken(sh) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      'gl_FragColor.rgb *= mix(0.8, 1.0, smoothstep(0.04, 0.6, abs(normal.z)));\n#include <dithering_fragment>');
  }
  // rfHY: the body's faces sit back from their edge lines by their depth slope over the line's half width (an edge in an
  // inside corner is not half buried by the face rising next to it), computed per vertex from the view-space normal
  // (depth per pixel of a plane = worldPerPx × tan θ) with tan θ clamped at SLOPE.max, so a facet seen edge-on sinks a
  // couple of pixels' worth, not "infinitely" as with glPolygonOffset's factor (see syncFatFrame). Orthographic only:
  // NDC z moves by 2 D / (far − near) = −D · projectionMatrix[2][2]. A face turned away from the viewer (vertex normal)
  // sinks twice the clamp, so it never wins over the front face at a silhouette (the light line along a flange's
  // outline). extra (the crack filler: 1) sinks the filler's lines a further push behind their own faces: they fill a
  // pinhole but no longer paint a 1-pixel line of one face's shade over its neighbour along every crease (the dark
  // nicks on a bore's front rim).
  var SLOPE = { on: true, max: 8 }, slopeU = { push: { value: 0 }, max: { value: 8 } };
  function slopePatch(sh, extra) {
    sh.uniforms.slopePush = slopeU.push; sh.uniforms.slopeMax = slopeU.max;
    sh.vertexShader = 'uniform float slopePush;\nuniform float slopeMax;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' +
      '{ vec3 sn = normalMatrix * normal; float sl = length(sn.xy), sz = abs(sn.z); float st = ' + (extra || 0).toFixed(2) + ' + (sn.z < 0.0 ? 2.0 * slopeMax : sl > slopeMax * sz ? slopeMax : sl / max(sz, 1e-6));\n' +
      '  gl_Position.z -= slopePush * st * projectionMatrix[2][2] * gl_Position.w; }');
  }
  mats.part.onBeforeCompile = function (sh) { edgeDarken(sh); slopePatch(sh); };
  mats.part.customProgramCacheKey = function () { return 'anvil-part-hy'; };
  mats.hlr.onBeforeCompile = function (sh) { slopePatch(sh); };
  mats.hlr.customProgramCacheKey = function () { return 'anvil-hlr-hy'; };
  mats.part.polygonOffsetFactor = 0; mats.hlr.polygonOffsetFactor = 0;
  mats.part.customProgramCacheKey = function () { return 'anvil-part-r14'; };
  // The materials exist before ui-app.js boots, so a stored dark theme is applied here as well (UI.setTheme repeats it).
  (function () {
    var stored = null;
    try { stored = localStorage.getItem('anvil.theme'); } catch (e) { }
    if (stored === 'dark') setViewportTheme('dark');
    var bg = null;
    try { bg = localStorage.getItem('anvil.bg'); } catch (e) { }
    setBackground(bg || 'gradient', true);
  })();

  // ------------------------------------------------------------------ camera model
  // rfHG zoom display mesh state (see "zoom tessellation" below); declared early, read by picking / edges / highlights
  var zt = { map: null, faceSet: null, curveRefined: null, base: null, disp: null, sil: null, key: null, info: null };
  var cam = { target: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(1, 1, 1).normalize(), up: new THREE.Vector3(0, 1, 0), scale: 0.35, right: new THREE.Vector3(1, 0, 0) };
  var size = { w: 1, h: 1 };
  var DIST = 10000;

  // Puts the three.js camera at a pose (target, unit dir towards the viewer, up, mm per pixel). applyCamera poses it at
  // the logical camera `cam`; a view animation poses it at an in-between pose for one draw only (see "view animation").
  function poseCamera(target, dir, up, scale) {
    camera.left = -size.w / 2 * scale; camera.right = size.w / 2 * scale;
    camera.top = size.h / 2 * scale; camera.bottom = -size.h / 2 * scale;
    camera.near = 1; camera.far = DIST * 2;
    camera.position.copy(target).addScaledVector(dir, DIST);
    camera.up.copy(up);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  var camVer = 0;   // bumped on every camera change: projected-edge and pick caches key on it
  function applyCamera() {
    var right = new THREE.Vector3().crossVectors(cam.up, cam.dir).normalize();
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    cam.up = new THREE.Vector3().crossVectors(cam.dir, right).normalize();
    cam.right = right;
    poseCamera(cam.target, cam.dir, cam.up, cam.scale);
    camVer++;
    needsRender = true;
    App.gridStale = true;
    App.dimsStale = true;
    // lane mcdirect2: the profile's view labels follow the camera here, not on the next rendered frame
    if (typeof UI !== 'undefined' && UI && UI.viewFurnitureTick) { try { UI.viewFurnitureTick(); } catch (e) { /* the view change goes on */ } }
  }

  // (user 2026-11-04: "the pulling of the panel should not change the position of the part relative to the screen")
  // when the graphics area moves or changes size inside an unchanged window (the FeatureManager dragged, hidden or
  // shown, the Task Pane docked or closed), the view shifts with it so the model stays where it was on the screen; the
  // panel simply covers or uncovers it. A window resize keeps the view centred as before.
  var vpAnchor = null;
  function keepModelOnScreen(w, h) {
    var br = viewport.getBoundingClientRect(), cx = br.left + w / 2, cy = br.top + h / 2, win = window.innerWidth + 'x' + window.innerHeight;
    var a = vpAnchor;
    vpAnchor = { cx: cx, cy: cy, win: win };
    if (!a || a.win !== win || (Math.abs(cx - a.cx) < 0.01 && Math.abs(cy - a.cy) < 0.01) || viewAnim || !cam.right) return false;
    cam.target.addScaledVector(cam.right, (cx - a.cx) * cam.scale).addScaledVector(cam.up, -(cy - a.cy) * cam.scale);
    return true;
  }
  function resize() {
    var w = viewport.clientWidth, h = viewport.clientHeight;
    if (w < 2 || h < 2) return;
    if (keepModelOnScreen(w, h) && w === size.w && h === size.h) { applyCamera(); return; }
    // smooth/chrome: a resize to the same size is skipped (setting a canvas's size clears it), and a real one redraws at
    // once — the ResizeObserver runs after this frame's render, so the Task Pane opening or closing showed one blank frame
    // rfHA: the canvas is laid out exactly as wide as its drawing buffer in device pixels (floor(w * dpr) / dpr CSS px), so
    // at 125 % / 150 % display scaling the browser never stretches the frame by a fraction of a pixel (soft edges)
    var pr = renderer.getPixelRatio(), cssW = Math.floor(w * pr) / pr + 'px', cssH = Math.floor(h * pr) / pr + 'px';
    if (w === size.w && h === size.h && renderer.domElement.style.width === cssW && renderer.domElement.style.height === cssH && renderer.domElement.width === Math.floor(w * pr)) return;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = cssW;
    renderer.domElement.style.height = cssH;
    applyCamera();
    if (typeof render === 'function') { try { render(); } catch (e) { } }
  }

  // Rotate View: as in SolidWorks the model turns about its own centre (the centre of its bounding box) while that
  // centre is on screen, so a panned model spins in place instead of swinging round the middle of the window; with the
  // centre off screen (zoomed in on a detail) it turns about the middle of the window.
  function rotatePivot() {
    var c = sceneCenter();
    if (!c) return null;
    var off = new THREE.Vector3(c[0], c[1], c[2]).sub(cam.target);
    var sx = off.dot(cam.right) / cam.scale + size.w / 2, sy = size.h / 2 - off.dot(cam.up) / cam.scale;
    return sx >= 0 && sy >= 0 && sx <= size.w && sy <= size.h ? new THREE.Vector3(c[0], c[1], c[2]) : null;
  }
  function rotateView(dx, dy) {
    settleViewAnimation();
    var pivot = rotatePivot(), off = pivot ? cam.target.clone().sub(pivot) : null;
    var qy = new THREE.Quaternion().setFromAxisAngle(cam.up, -dx * 0.008);
    cam.dir.applyQuaternion(qy);
    if (off) off.applyQuaternion(qy);
    var right = new THREE.Vector3().crossVectors(cam.up, cam.dir).normalize();
    var qx = new THREE.Quaternion().setFromAxisAngle(right, -dy * 0.008);
    cam.dir.applyQuaternion(qx); cam.up.applyQuaternion(qx);
    if (off) { off.applyQuaternion(qx); cam.target.copy(pivot).add(off); }
    cam.dir.normalize();
    applyCamera();
  }
  function panView(dx, dy) {
    settleViewAnimation();
    cam.target.addScaledVector(cam.right, -dx * cam.scale).addScaledVector(cam.up, dy * cam.scale);
    applyCamera();
  }
  function zoomView(factor, mx, my) {
    settleViewAnimation();
    var s0 = cam.scale, s1 = Math.min(50, Math.max(0.0005, s0 * factor));
    if (mx != null) {
      var ox = mx - size.w / 2, oy = my - size.h / 2;
      cam.target.addScaledVector(cam.right, ox * (s0 - s1)).addScaledVector(cam.up, -oy * (s0 - s1));
    }
    cam.scale = s1;
    applyCamera();
  }

  function modelBounds() {
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], any = false;
    if (App.mesh && App.mesh.positions.length) {
      var p = App.mesh.positions;
      for (var i = 0; i < p.length; i += 3) { for (var k = 0; k < 3; k++) { if (p[i + k] < min[k]) min[k] = p[i + k]; if (p[i + k] > max[k]) max[k] = p[i + k]; } }
      any = true;
    }
    App.model.features.forEach(function (f) {
      if (f.type !== 'sketch') return;
      var pl; try { pl = K.resolvePlane(f.plane, App.model, App.build && App.build.planes); } catch (e) { return; }
      f.entities.forEach(function (e) {
        K.entityPolylines(e).forEach(function (l) { l.pts.forEach(function (q) { var w = K.to3D(pl, q[0], q[1]); for (var k = 0; k < 3; k++) { if (w[k] < min[k]) min[k] = w[k]; if (w[k] > max[k]) max[k] = w[k]; } any = true; }); });
      });
    });
    if (flatShown() && App.flatBounds) { for (var fk = 0; fk < 3; fk++) { min[fk] = Math.min(min[fk], App.flatBounds.min[fk]); max[fk] = Math.max(max[fk], App.flatBounds.max[fk]); } any = true; }   // lane DC
    if (!any) { min = [-50, -50, -50]; max = [50, 50, 50]; }
    return { min: min, max: max };
  }

  // Bounding-box centre of the model (body and sketches), cached until the body or the sketches change.
  var boundsCache = { key: null, center: null };
  function sceneCenter() {
    if (!App.model) return null;
    var key = sceneVer + ':' + (App.mesh ? App.mesh.triCount : 0);
    if (boundsCache.key !== key || boundsCache.mesh !== App.mesh) {
      var b = modelBounds();
      boundsCache = { key: key, mesh: App.mesh, center: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] };
    }
    return boundsCache.center;
  }
  var sceneVer = 0;   // bumped when the body or the sketches are redrawn

  // Zoom to Fit (F): the body and the sketches with a margin all round (fitCam); in a sketch also the dimension labels
  // and relation icons drawn round it, which sit off the geometry at a fixed size on screen: fit the geometry, draw the
  // dimensions for that view, take the box of what was drawn (screen pixels back onto the view plane) into the bounds
  // and fit again, until the labels are inside the margin (bent-channel item 11, complex-sketch item 10).
  function zoomToFit() {
    var b = modelBounds();
    if (App.mode !== 'sketch' || !UI.drawDims) { fitBox(b); return; }
    var from = viewPose();
    fitCam(b);
    for (var pass = 0; pass < 3; pass++) {
      var lb = overlayBounds();
      if (!lb) break;
      var m = fitMargin(), inside = lb.x0 >= m.x * 0.5 && lb.y0 >= m.y * 0.5 && lb.x1 <= size.w - m.x * 0.5 && lb.y1 <= size.h - m.y * 0.5;
      if (inside) break;
      var grown = { min: b.min.slice(), max: b.max.slice() };
      [[lb.x0, lb.y0], [lb.x1, lb.y0], [lb.x0, lb.y1], [lb.x1, lb.y1]].forEach(function (q) {
        var w = cam.target.clone().addScaledVector(cam.right, (q[0] - size.w / 2) * cam.scale).addScaledVector(cam.up, (size.h / 2 - q[1]) * cam.scale);
        for (var k = 0; k < 3; k++) { var v = w.getComponent(k); if (v < grown.min[k]) grown.min[k] = v; if (v > grown.max[k]) grown.max[k] = v; }
      });
      b = grown;
      fitCam(b);
    }
    App.dimsStale = true;
    animateViewFrom(from);
  }
  // the screen box (viewport pixels) of the sketch overlay as drawn for the current camera: dimension lines, labels and
  // relation icons (not the cursor feedback); null when nothing is drawn
  function overlayBounds() {
    var layer = $('dim-layer');
    if (!layer || !UI.drawDims) return null;
    try { UI.drawDims(); } catch (e) { return null; }
    App.dimsStale = false;
    var vr = viewport.getBoundingClientRect(), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    Array.prototype.forEach.call(layer.querySelectorAll('text, line, path, polyline, rect, use'), function (n) {
      if (n.closest('defs, .sk-feedback')) return;
      var r = n.getBoundingClientRect();
      if (!r.width && !r.height) return;
      x0 = Math.min(x0, r.left - vr.left); y0 = Math.min(y0, r.top - vr.top); x1 = Math.max(x1, r.right - vr.left); y1 = Math.max(y1, r.bottom - vr.top);
    });
    return x0 < x1 ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
  }
  // Zoom to Fit's margin on each side, in pixels: 9% of the graphics area, at least 60 px
  function fitMargin() { return { x: Math.max(60, size.w * 0.09), y: Math.max(60, size.h * 0.09) }; }

  // Bounding box {min, max} of one body of a multi-body part, from the combined-mesh faces tagged with that body
  // (face.body, see bodyOfFace). Null when the index has no triangles.
  function bodyBounds(index) {
    var m = App.mesh;
    if (!m || !m.faces) return null;
    var p = m.positions64 || m.positions, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], any = false;
    m.faces.forEach(function (f) {
      if (bodyOfFace(f) !== index) return;
      for (var i = f.start * 9, e = (f.start + f.count) * 9; i < e; i += 3) {
        for (var k = 0; k < 3; k++) { var v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
        any = true;
      }
    });
    return any ? { min: min, max: max } : null;
  }
  // Zoom to Selection for a body: frame that body's box with the same fit as Zoom to Fit.
  function zoomToBody(index) {
    var b = bodyBounds(index);
    if (!b) return false;
    pushViewHistory();
    fitBox(b);
    return true;
  }

  // Centre the camera on box b and scale so its projected extent fills the viewport (less a margin).
  function fitBox(b) { var from = viewPose(); fitCam(b); animateViewFrom(from); }
  function fitCam(b) {
    zoomMomentum.pending = 0;
    var c =new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    cam.target.copy(c);
    applyCamera();
    var ex = 0, ey = 0;
    for (var i = 0; i < 8; i++) {
      var p = new THREE.Vector3(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]).sub(c);
      ex = Math.max(ex, Math.abs(p.dot(cam.right))); ey = Math.max(ey, Math.abs(p.dot(cam.up)));
    }
    ex = Math.max(ex, 1); ey = Math.max(ey, 1);
    var m = fitMargin();
    cam.scale = Math.max(ex * 2 / Math.max(size.w - 2 * m.x, 100), ey * 2 / Math.max(size.h - 2 * m.y, 100));
    applyCamera();
  }

  var VIEWS = {
    Front: [[0, 0, 1], [0, 1, 0]], Back: [[0, 0, -1], [0, 1, 0]], Left: [[-1, 0, 0], [0, 1, 0]], Right: [[1, 0, 0], [0, 1, 0]],
    Top: [[0, 1, 0], [0, 0, -1]], Bottom: [[0, -1, 0], [0, 0, 1]], Isometric: [[1, 1, 1], [0, 1, 0]],
    Trimetric: [[0.55, 0.45, 1], [0, 1, 0]], Dimetric: [[1, 0.6, 1], [0, 1, 0]]
  };
  function pushViewHistory() {
    App.viewHistory.push({ target: cam.target.clone(), dir: cam.dir.clone(), up: cam.up.clone(), scale: cam.scale });
    if (App.viewHistory.length > 40) App.viewHistory.shift();
  }
  function previousView() {
    var v = App.viewHistory.pop();
    if (!v) return;
    var from = viewPose();
    zoomMomentum.pending = 0;
    cam.target.copy(v.target); cam.dir.copy(v.dir); cam.up.copy(v.up); cam.scale = v.scale;
    applyCamera();
    animateViewFrom(from);
  }
  function setView(name, fit) {
    var from = viewPose();
    zoomMomentum.pending = 0;
    pushViewHistory();
    var v = VIEWS[name];
    if (v) { cam.dir.set(v[0][0], v[0][1], v[0][2]).normalize(); cam.up.set(v[1][0], v[1][1], v[1][2]); }
    applyCamera();
    if (fit !== false) fitCam(modelBounds());
    animateViewFrom(from);
  }
  function viewNormalTo(plane) {
    var from = viewPose();
    zoomMomentum.pending = 0;
    pushViewHistory();
    cam.dir.set(plane.n[0], plane.n[1], plane.n[2]);
    cam.up.set(plane.y[0], plane.y[1], plane.y[2]);
    applyCamera();
    animateViewFrom(from);
  }

  // ------------------------------------------------------------------ view animation
  // Standard views, Normal To, Zoom to Fit, Zoom to Selection and Previous View glide to the new view in a short eased
  // transition instead of jumping (SolidWorks' view transition). The animation is visual only: the logical camera
  // (`cam`, UI.camera, picking, worldToScreen) is at the new view the moment the call returns, so scripts and tests
  // see the result synchronously; render() draws the in-between poses. Overlays positioned in screen space (sketch
  // dimensions, Instant3D handles) are hidden while the view moves and redrawn when it lands. A rotate, pan or zoom
  // during the transition starts from the pose on screen (settleViewAnimation), so nothing jumps.
  // UI.viewAnimation = false (or prefers-reduced-motion) turns it off; UI.finishViewAnimation() lands it at once.
  var VIEW_ANIM_MS = 320;
  var viewAnim = null;   // { from: pose, to: pose, t0, dur }
  var ANIM_LAYERS = ['dim-layer', 'i3d-layer'];
  // pose: { q: quaternion of the (right, up, dir) basis, target, scale }
  function poseOf(target, dir, up, scale) {
    var right = new THREE.Vector3().crossVectors(up, dir).normalize();
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    var u = new THREE.Vector3().crossVectors(dir, right).normalize();
    var m = new THREE.Matrix4().makeBasis(right, u, dir.clone().normalize());
    return { q: new THREE.Quaternion().setFromRotationMatrix(m), target: target.clone(), scale: scale };
  }
  function lerpPose(a, b, u) {
    // the target moves in step with the scale (linear in scale): a zoom about a point keeps that point still
    var w = Math.abs(b.scale - a.scale) > 1e-9 * a.scale ? (Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * u) - a.scale) / (b.scale - a.scale) : u;
    return {
      q: a.q.clone().slerp(b.q, u),
      target: a.target.clone().lerp(b.target, w),
      scale: a.scale + (b.scale - a.scale) * w
    };
  }
  function animU() {
    if (!viewAnim) return 1;
    var t = (performance.now() - viewAnim.t0) / viewAnim.dur;
    if (t >= 1) return 1;
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // ease in-out cubic
  }
  // The pose on screen right now.
  function viewPose() {
    if (viewAnim) { var u = animU(); if (u < 1) return lerpPose(viewAnim.from, viewAnim.to, u); }
    return poseOf(cam.target, cam.dir, cam.up, cam.scale);
  }
  // Only view changes the user just asked for glide (a click, key or wheel by a person within the last second): a
  // script, a test or an API call (anvil.view, UI.setView from code) lands at once, as before.
  var lastUserInput = -Infinity;
  ['pointerdown', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach(function (t) {
    window.addEventListener(t, function (ev) { if (ev.isTrusted) lastUserInput = performance.now(); }, { capture: true, passive: true });
  });
  function animationsOn() {
    if (UI && UI.viewAnimation === false) return false;
    if (!(UI && UI.viewAnimation === true) && performance.now() - lastUserInput > 1000) return false;
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) { }
    return true;
  }
  function setAnimLayers(hidden) {
    ANIM_LAYERS.forEach(function (id) { var e = $(id); if (e) e.style.visibility = hidden ? 'hidden' : ''; });
  }
  function animateViewFrom(from) {
    var to = poseOf(cam.target, cam.dir, cam.up, cam.scale);
    var turn = 1 - Math.abs(from.q.dot(to.q)), move = from.target.distanceTo(to.target) / (to.scale * Math.max(size.w, size.h)), zoom = Math.abs(Math.log(to.scale / from.scale));
    if (!animationsOn() || (turn < 1e-7 && move < 1e-4 && zoom < 1e-4)) { finishViewAnimation(); return; }
    viewAnim = { from: from, to: to, t0: performance.now(), dur: VIEW_ANIM_MS };
    setAnimLayers(true);
    needsRender = true;
  }
  function finishViewAnimation() {
    if (!viewAnim) return;
    viewAnim = null;
    setAnimLayers(false);
    App.dimsStale = true; App.gridStale = true;
    needsRender = true;
  }
  // Stop a running transition where it is: the logical camera takes the pose on screen.
  function settleViewAnimation() {
    if (!viewAnim) return;
    var u = animU(), p = u < 1 ? lerpPose(viewAnim.from, viewAnim.to, u) : viewAnim.to;
    finishViewAnimation();
    if (u >= 1) return;
    var m = new THREE.Matrix4().makeRotationFromQuaternion(p.q), e = m.elements;
    cam.up.set(e[4], e[5], e[6]); cam.dir.set(e[8], e[9], e[10]).normalize();
    cam.target.copy(p.target); cam.scale = p.scale;
    applyCamera();
  }
  function viewAnimating() { return !!viewAnim; }

  // ------------------------------------------------------------------ smooth wheel zoom
  // Each wheel notch (or trackpad scroll / pinch, in proportion to its delta) adds to a pending zoom that the frame
  // loop eases out over ~50 ms, always about the cursor, so zooming glides instead of stepping 12 % at a time and a
  // trackpad no longer zooms at a notch per event. One notch (deltaY 100) is still a factor of 1.12 overall.
  var zoomMomentum = { pending: 0, x: 0, y: 0, last: 0 };
  var WHEEL_K = Math.log(1.12) / 100;
  function wheelZoom(ev, mx, my) {
    var dy = ev.deltaY * (ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1) * navWheelSign(ev);
    if (navResolved.wheel.about === 'center') { mx = size.w / 2; my = size.h / 2; }   // lane profnav: the map's wheel
    var k = ev.ctrlKey ? 0.01 : WHEEL_K;   // ctrl + wheel is a trackpad pinch: small deltas, faster response
    var d = Math.max(-0.7, Math.min(0.7, dy * k));
    if (!d) return;
    settleViewAnimation();
    if (!animationsOn()) { zoomView(Math.exp(d), mx, my); return; }
    if (!zoomMomentum.pending) zoomMomentum.last = performance.now();
    zoomMomentum.pending += d; zoomMomentum.x = mx; zoomMomentum.y = my;
    needsRender = true;
  }
  // Zoom to Area: the screen rectangle centred at (cx, cy) whose larger side is fraction f of the view fills the view.
  function zoomToArea(cx, cy, f) {
    var from = viewPose();
    settleViewAnimation(); zoomMomentum.pending = 0;
    pushViewHistory();
    cam.target.addScaledVector(cam.right, (cx - size.w / 2) * cam.scale).addScaledVector(cam.up, -(cy - size.h / 2) * cam.scale);
    cam.scale = Math.min(50, Math.max(0.0005, cam.scale * f));
    applyCamera();
    animateViewFrom(from);
  }
  function stepZoomMomentum(now) {
    if (!zoomMomentum.pending) return;
    var dt = Math.max(0, now - zoomMomentum.last);
    zoomMomentum.last = now;
    var p = zoomMomentum.pending, step = p * (1 - Math.exp(-dt / 50));
    if (Math.abs(p - step) < 2e-4) step = p;
    zoomMomentum.pending = p - step;
    zoomView(Math.exp(step), zoomMomentum.x, zoomMomentum.y);
  }

  // ------------------------------------------------------------------ body geometry
  function disposeGroup(g) {
    while (g.children.length) {
      var c = g.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
  }

  function buildTriShared(mesh) {
    var out = new Int32Array(mesh.triCount);
    mesh.faces.forEach(function (f) {
      var t = f.start;
      f.polys.forEach(function (p) {
        var n = p.vertices.length - 2;
        for (var i = 0; i < n; i++) out[t++] = p.shared == null ? -1 : p.shared;
      });
    });
    return out;
  }

  // ------------------------------------------------------------------ bodies
  // The kernel tags every face of the combined mesh with `face.body` (index into App.build.bodies, 0 when the
  // build predates multi-body support). Everything here reads through these helpers so a single-body build
  // behaves exactly as before: one body, index 0, nothing hidden.
  function bodyOfFace(f) { return f && f.body ? f.body : 0; }
  function bodyList() {
    var b = App.build;
    if (!b) return [];
    if (b.bodies) return b.bodies;
    return b.body ? [b.body] : [];
  }
  function bodyCount() { return bodyList().length; }
  // r5/asm5: a transparent assembly component (UI.bodyGhost, ui-assembly.js) is left out of the opaque mesh and its picks too
  function anyHidden() { return Object.keys(App.hiddenBodies).length > 0 || !!(UI.anyGhost && UI.anyGhost()); }
  function isBodyHidden(index) { return !!App.hiddenBodies[index]; }
  function faceHidden(f) { return anyHidden() && (isBodyHidden(bodyOfFace(f)) || !!(UI.bodyGhost && UI.bodyGhost(bodyOfFace(f)))); }
  // [{index, featureId, name, volume}] from Kernel.bodyInfo when the kernel has it; a plain fallback otherwise
  function bodyInfo() {
    if (!App.build) return [];
    // assemblies: one body per component, named after the component (Pin<1>)
    if (App.build.assembly) {
      return bodyList().map(function (b, i) {
        var vol = null;
        try { if (b && typeof b.volume === 'function') vol = b.volume(); } catch (e) { }
        return { index: i, featureId: (App.build.bodyFeatures || [])[i], componentId: (App.build.bodyFeatures || [])[i], name: bodyName(i), volume: vol };
      });
    }
    if (K.bodyInfo) { try { return K.bodyInfo(App.build, App.model) || []; } catch (e) { } }
    var feats = App.build.bodyFeatures || [];
    return bodyList().map(function (b, i) {
      var f = feats[i] != null ? K.findFeature(App.model, feats[i]) : null;
      var vol = null;
      try { if (b && typeof b.volume === 'function') vol = b.volume(); } catch (e) { }
      return { index: i, featureId: feats[i] != null ? feats[i] : null, name: f ? f.name : 'Body' + (i + 1), volume: vol };
    });
  }
  // Name only (no volumes): cheap enough for the hover status on every mouse move.
  function bodyName(index) {
    if (App.build && App.build.assembly) {
      var nm = App.build.bodyNames && App.build.bodyNames[index];
      return nm || 'Component' + (index + 1);
    }
    var feats = App.build && App.build.bodyFeatures, f = feats && feats[index] != null ? K.findFeature(App.model, feats[index]) : null;
    return f && f.name ? f.name : 'Body' + (index + 1);
  }
  // Drop hidden entries for bodies that no longer exist (the count shrank after a rebuild).
  function pruneHiddenBodies() {
    var n = bodyCount();
    Object.keys(App.hiddenBodies).forEach(function (k) { if (+k >= n || !App.hiddenBodies[k]) delete App.hiddenBodies[k]; });
  }
  // Per-triangle hidden flags (Uint8Array over the combined mesh) or null when every body is visible.
  function buildTriHidden(m) {
    if (!m || !anyHidden()) return null;
    var out = new Uint8Array(m.triCount), any = false;
    m.faces.forEach(function (f) {
      if (!faceHidden(f)) return;
      any = true;
      for (var t = f.start; t < f.start + f.count; t++) out[t] = 1;
    });
    return any ? out : null;
  }

  function updateBodyMesh() {
    ztDrop();   // rfHG: the zoom display mesh belongs to the old body
    disposeGroup(groups.body); disposeGroup(groups.edges);
    bodyMesh = null; crackFill = null; edgeLines = null; silLines = null; edgeScr.edges = null; pickMemo.key = null; App.displayWarning = null;
    tanLines = null;   // rfHL (disposed with groups.edges)
    var m = App.mesh;
    if (!m || !m.triCount) { App.edges = m ? edgesFor(m) : []; App.triHidden = null; visTris = null; sceneVer++; return; }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    // true curves: triangles on analytic faces shade with the exact surface normal at each corner (smooth)
    g.setAttribute('normal', new THREE.BufferAttribute(analyticNormals(m), 3));
    // Hidden bodies: the full position/normal arrays stay (every face index is still valid), but the geometry gets an
    // index attribute that lists only the visible triangles, and visTris maps each rendered triangle back to its
    // global triangle index so pickFace still lands on the right face of App.mesh.
    App.triHidden = buildTriHidden(m);
    visTris = null;
    if (App.triHidden) {
      var th = App.triHidden, n = 0, t;
      for (t = 0; t < m.triCount; t++) if (!th[t]) n++;
      var idx = new Uint32Array(n * 3), map = new Int32Array(n), o = 0;
      for (t = 0; t < m.triCount; t++) {
        if (th[t]) continue;
        idx[o * 3] = t * 3; idx[o * 3 + 1] = t * 3 + 1; idx[o * 3 + 2] = t * 3 + 2;
        map[o++] = t;
      }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      visTris = map;
    }
    bodyMesh = new THREE.Mesh(g, App.view.style === 'hlr' || App.view.style === 'hlv' ? mats.hlr : mats.part);
    bodyMesh.renderOrder = -1;   // r14/viewui14: before every line, so the depth-only HLR occluder hides the hidden ones in any draw order
    groups.body.add(bodyMesh);
    // lane FO: the crack filler (see "display safety" below) shares the geometry, drawn right after the faces
    crackFill = new THREE.Mesh(g, mats.partFill);
    crackFill.renderOrder = -0.9;
    crackFill.userData.crackFill = true;
    crackFill.raycast = function () { };
    crackFill.onBeforeRender = function (r, s, c, g2, material) { fillFrontOnly(material); };   // rfHG panel seams
    groups.body.add(crackFill);
    // lane FO: edges come from Kernel.bodyEdges / annotateCurveEdges; a mesh they cannot read (a degenerate sliver from
    // a boolean) must not take the shaded part off the screen with it: the part is drawn without edges and the status
    // bar says so, instead of an empty graphics area
    try {
      edgeLines = new THREE.LineSegments(buildEdgeGeometry(m), mats.edge);
      groups.edges.add(edgeLines);
      silLines = buildSilhouettes(m);
      if (silLines) groups.edges.add(silLines);
      tanRebuild();   // rfHL: tangent edges
    } catch (e) {
      console.warn('Model edges could not be drawn:', e);
      disposeGroup(groups.edges); edgeLines = null; silLines = null;
      App.edges = []; App.curves = []; App.edgesMesh = m;
      App.displayWarning = 'Model edges could not be drawn for this part (' + ((e && e.message) || e) + '); the shaded part is shown.';
    }
    sceneVer++;
    applyDisplayStyle();
  }
  var silLines = null;

  // ------------------------------------------------------------------ lane FO: display safety
  // "The part never looks broken", whatever mesh the kernel hands over:
  //   crack filler: a boolean leaves T-junctions (a vertex of one facet on the edge of its neighbour); the rasterizer
  //     can leave single pixels between them unfilled, and on a thin plate the background shows through both faces as
  //     a sparkle. crackFill draws the body's triangle edges as 1-pixel lines in the same lit material after the
  //     faces, without writing depth, one slope push behind its own faces (rfHY slopePatch extra 1): on a face it is
  //     hidden by the face itself, behind a face too, in a pinhole it fills the pixel. Off in HLR / HLV / Wireframe and
  //     in a section (where the inside of the body is seen, which the filler's front-facing light would stripe).
  //   normals: a smoothed normal that is not finite, has no length or points more than ~78° away from its facet is
  //     replaced by the facet's own (safeNormals), so no triangle shades black.
  //   section caps: SolidWorks' Section View shows the cut faces solid; the body is drawn twice more into the stencil
  //     (back faces +1, front faces -1, both clipped) and a plane on the section is drawn where the count is not zero.
  mats.partFill = new THREE.MeshPhongMaterial({ color: 0x8c8c8c, specular: 0x262626, shininess: 40, wireframe: true, depthWrite: false });
  mats.partFill.onBeforeCompile = function (sh) { edgeDarken(sh); slopePatch(sh, 1); };   // rfHY: one push behind its faces
  mats.partFill.customProgramCacheKey = function () { return 'anvil-part-fill-fo'; };
  var crackFill = null;
  // rfHG (panel seams): the filler's lines have no polygon offset, but the faces sit back by theirs, and on a big thin
  // plate at Zoom to Fit that offset (≈ 1.75 px of depth slope) is more than the plate is thick: the BOTTOM face's
  // triangle edges passed the depth test through the top face and drew faint lines across it (1000-hole panel; 298 of
  // 9 600 pixels of a plain patch were off by up to 387 levels, 0 without the filler). A pinhole is only ever in a
  // face turned to the viewer, so the filler (Phong or RealView, whichever the body uses) drops fragments whose view-space
  // normal points away from the camera. Patched once per material, the first time the filler draws with it.
  function fillFrontOnly(m) {
    if (!m || !m.isMaterial || m.userData.fillFrontOnly) return;
    m.userData.fillFrontOnly = true;
    var prev = m.onBeforeCompile, base = m.customProgramCacheKey ? m.customProgramCacheKey() : '';   // before the hook is replaced
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() {\n#ifndef FLAT_SHADED\n  if (vNormal.z < -0.05) discard;\n#endif');
    };
    m.customProgramCacheKey = function () { return base + '|fill-front-only'; };
    m.needsUpdate = true;
  }
  function syncCrackFill() {
    if (!crackFill) return;
    var s = App.view.style, on = (s === 'shaded' || s === 'shadedEdges') && !App.view.section && !mats.part.transparent && !UI.noCrackFill;
    crackFill.visible = on && !!(bodyMesh && bodyMesh.visible);
    var f = mats.partFill, p = mats.part;
    if (!f.color.equals(p.color)) f.color.copy(p.color);
    if (f.vertexColors !== p.vertexColors) { f.vertexColors = p.vertexColors; f.needsUpdate = true; }
    if (f.specular.getHex() !== p.specular.getHex() || f.shininess !== p.shininess) { f.specular.copy(p.specular); f.shininess = p.shininess; }
  }
  // corner normals out (Float32Array, 3 per triangle corner) checked against the facets' flat normals m.normals
  function safeNormals(m, out) {
    var fl = m && m.normals;
    if (!out || !fl || fl.length !== out.length || out._foSafe) return out;
    var fixed = 0;
    for (var i = 0; i < out.length; i += 3) {
      var x = out[i], y = out[i + 1], z = out[i + 2], l = Math.sqrt(x * x + y * y + z * z);
      var fx = fl[i], fy = fl[i + 1], fz = fl[i + 2], fln = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (!(fln > 1e-9)) {   // a sliver with no flat normal: any finite unit normal will do
        if (!(l > 1e-9) || !isFinite(l)) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 1; fixed++; }
        continue;
      }
      if (!isFinite(l) || !(l > 1e-6) || (x * fx + y * fy + z * fz) / (l * fln) < 0.2) {
        out[i] = fx / fln; out[i + 1] = fy / fln; out[i + 2] = fz / fln; fixed++;
      }
    }
    out._foSafe = true;
    m.normalsFixed = fixed;
    return out;
  }
  var capGroup = new THREE.Group();
  capGroup.userData.sectionCaps = true;
  scene.add(capGroup);
  mats.capBack = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.BackSide,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
  mats.capFront = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.FrontSide,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
  mats.cap = new THREE.MeshPhongMaterial({ color: 0x8c8c8c, specular: 0x222222, shininess: 20, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp });
  function updateSectionCaps() {
    while (capGroup.children.length) { var c = capGroup.children.pop(); if ((c.userData.capPlane || c.userData.capOwnGeo) && c.geometry) c.geometry.dispose(); }
    var sec = App.view.section, s = App.view.style;
    if (!sec || !sec.plane || !bodyMesh || !bodyMesh.visible || !App.mesh || !App.mesh.triCount || (s !== 'shaded' && s !== 'shadedEdges') || flatShown()) return;
    var pl = sec.plane, b = modelBounds(), ctr = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    var diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    if (!(diag > 0)) return;
    // the cap: a square on the plane round the box centre's projection, big enough for any section of the box, facing
    // the removed side (three.js keeps the positive side of a clipping plane). Its transform is baked into the geometry,
    // so a RealView cap's pattern (brushed streaks, spangle) is laid out in model space as on the body.
    var foot = pl.projectPoint(ctr, new THREE.Vector3()), qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pl.normal.clone().negate());
    var qm = new THREE.Matrix4().compose(foot, qq, new THREE.Vector3(1, 1, 1));
    function capQuad() { var qg = new THREE.PlaneGeometry(diag * 1.05, diag * 1.05); qg.applyMatrix4(qm); return qg; }
    mats.cap.color.copy(mats.part.vertexColors ? new THREE.Color(partColor(App.model.color)) : mats.part.color);
    // rfHF: with RealView on the cap takes the RealView appearance of the part, or of each body (stencil count, cap and
    // stencil reset per group of bodies sharing one appearance, so every body's cut shows its own material)
    var groups = rvCapGroups(), order = 1;
    groups.forEach(function (gr) {
      [mats.capBack, mats.capFront].forEach(function (mt, k) {
        mt.clippingPlanes = [pl]; mt.needsUpdate = true;
        var o = new THREE.Mesh(gr.geometry, mt);
        o.renderOrder = order + k * 0.01; o.raycast = function () { };
        if (gr.own) o.userData.capOwnGeo = true;
        capGroup.add(o);
      });
      var cap = new THREE.Mesh(capQuad(), gr.material);
      cap.renderOrder = order + 0.02; cap.raycast = function () { };
      cap.userData.capPlane = true;
      capGroup.add(cap);
      order += 0.03;
    });
    // the cut outline (SolidWorks draws the section's edges): every visible triangle crossing the plane gives a segment
    if (s === 'shadedEdges') {
      var P = App.mesh.positions, th = App.triHidden, seg = [], d = [0, 0, 0], n = pl.normal, c0 = pl.constant;
      for (var t = 0; t < App.mesh.triCount; t++) {
        if (th && th[t]) continue;
        var o = t * 9, pos = 0, neg = 0;
        for (var k = 0; k < 3; k++) { d[k] = n.x * P[o + k * 3] + n.y * P[o + k * 3 + 1] + n.z * P[o + k * 3 + 2] + c0; if (d[k] > 0) pos++; else if (d[k] < 0) neg++; }
        if (!pos || !neg) continue;
        for (var e = 0; e < 3; e++) {
          var a = e, bb = (e + 1) % 3;
          if ((d[a] > 0) === (d[bb] > 0) || d[a] === d[bb]) continue;
          var u = d[a] / (d[a] - d[bb]);
          seg.push(P[o + a * 3] + (P[o + bb * 3] - P[o + a * 3]) * u, P[o + a * 3 + 1] + (P[o + bb * 3 + 1] - P[o + a * 3 + 1]) * u, P[o + a * 3 + 2] + (P[o + bb * 3 + 2] - P[o + a * 3 + 2]) * u);
        }
        if (seg.length % 6) seg.length -= 3;   // a vertex on the plane gave one crossing only
      }
      // a hair towards the removed side, so the outline is never half buried in the faces it runs along
      var lift = diag * 2e-4;
      for (var si = 0; si < seg.length; si += 3) { seg[si] -= n.x * lift; seg[si + 1] -= n.y * lift; seg[si + 2] -= n.z * lift; }
      if (seg.length) {
        if (!mats.capEdge) { mats.capEdge = new THREE.LineBasicMaterial({ color: 0xffffff }); lineMat(mats.capEdge, LINE_W.edge); }
        mats.capEdge.color.copy(mats.edge.color); mats.capEdge.clippingPlanes = []; mats.capEdge.needsUpdate = true;
        var eg = new THREE.BufferGeometry();
        eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
        var ln = new THREE.LineSegments(eg, mats.capEdge);
        ln.renderOrder = Math.max(1.05, order + 0.02); ln.userData.capPlane = true; ln.raycast = function () { };
        capGroup.add(ln);
      }
    }
  }

  // ------------------------------------------------------------------ rfHC RealView
  // SolidWorks' RealView Graphics: the part drawn physically based (MeshStandardMaterial: base colour, metalness,
  // roughness) and lit by a studio (a procedural room of soft boxes, prefiltered once by PMREMGenerator) on top of the
  // camera-mounted lights of rfHA. Off = the Phong part of rfHA, untouched (mats.part keeps every job it had: colour,
  // vertex colours, clipping; tests that read it read the flat colour). On = the body / crack filler / flat pattern meshes
  // take an RV twin of it (rvFaceMaterial) whose state is copied from mats.part in rvApply (end of applyDisplayStyle).
  // Colour handling: the renderer stays linear with no tone mapping, so every overlay (selection tint, pre-highlight,
  // previews, sketch, edges, planes, caps) keeps its exact rule colour; only the RV shader works in linear light: it
  // decodes its sRGB colours, shades, tone maps (a soft shoulder) and encodes back to sRGB itself.
  // The studio is fixed to the camera (lookups in view space), as the lights are: a part reads the same from every side,
  // reflections slide over it as it turns. Appearances come from Materials.appearanceOf / bodyAppearances (materials.js).
  var RV_KEY = 'anvil.realview';
  var rv = { on: null, env: null, envFailed: false, mats: null, attrKey: null, why: '' };
  // RealView's default rule (measured 2026-11-03, 1253 x 756 graphics area, a turn of the view per frame): on for every
  // part when WebGL runs on a GPU (default bracket 3.3 ms off / 3.5 ms on, a 20 x 12 in panel with 1000 holes,
  // 138k triangles, 2.0 / 3.4 ms: no size threshold is needed), off when WebGL is a software rasterizer (SwiftShader,
  // llvmpipe, Microsoft Basic Render: 11.7 / 26.4 ms and 195 / 359 ms, RealView doubles the frame). The studio is built
  // once (~300 ms at boot with its shader compiles, ~15 ms a rebuild). The user's choice wins and is kept per browser (localStorage anvil.realview, '1' / '0').
  function rvStored() { try { var v = localStorage.getItem(RV_KEY); return v === '1' ? true : v === '0' ? false : null; } catch (e) { return null; } }
  function softwareGL() {
    try {
      var gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      var name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(name);
    } catch (e) { return false; }
  }
  function rvDefault() { return !softwareGL(); }
  function realView() { if (rv.on == null) rv.on = rvStored() != null ? rvStored() : rvDefault(); App.view.realView = rv.on; return rv.on; }
  // UI.setRealView(on, noSave): RealView on / off (remembered unless noSave); returns the new state
  function setRealView(on, noSave) {
    rv.on = !!on; App.view.realView = rv.on;
    if (!noSave) { try { localStorage.setItem(RV_KEY, rv.on ? '1' : '0'); } catch (e) { } }
    applyDisplayStyle();
    if (UI && UI.refreshHud) { try { UI.refreshHud(); } catch (e) { } }
    return rv.on;
  }
  // The studio in view space (+x right, +y up, +z towards the viewer, -z behind the part): what a face of an isometric
  // box reflects decides how metals read, so each panel is placed for one of them. Top faces see the ceiling panel, a
  // face turned left sees the left wall's low soft box, one turned right the dimmer right panel, a face square to the
  // view the card behind the viewer; the key soft box (upper left, in front, as the key light) puts the highlight streak
  // on rounds. Walls: a cool grey from `floor` through `mid` to `ceil` (linear). Panels: [centre, size, linear colour].
  var RV_STUDIO = {
    floor: 0.06, mid: 0.2, ceil: 0.42, tint: [0.95, 0.98, 1.04],
    panels: [
      [[-3.6, 3.2, 3.4], [3.6, 2.4, 0.2], [4.2, 4.25, 4.3]],      // key soft box
      [[0, 5.8, -1.5], [6, 0.2, 4], [1.3, 1.34, 1.42]],           // ceiling
      [[-5.8, -2.2, -2.0], [0.2, 4.2, 6.0], [0.95, 0.98, 1.04]],  // left wall, low
      [[5.8, -2.2, -2.0], [0.2, 4.2, 6.0], [0.42, 0.44, 0.47]],   // right wall, low
      [[0.5, 2.6, -5.8], [7, 1.2, 0.2], [1.6, 1.62, 1.7]],        // rim strip behind
      [[0, 0.2, 5.8], [6, 4, 0.2], [0.8, 0.82, 0.86]]             // card behind the viewer
    ]
  };
  function rvBuildEnv() {
    if (rv.env || rv.envFailed) return rv.env;
    try {
      var t0 = performance.now(), st = RV_STUDIO;
      var sc = new THREE.Scene(), boxG = new THREE.BoxGeometry(1, 1, 1);
      var room = new THREE.BoxGeometry(12, 12, 12, 1, 8, 1), pos = room.getAttribute('position'), col = new Float32Array(pos.count * 3);
      for (var i = 0; i < pos.count; i++) {
        var y = pos.getY(i) / 6, k = y > 0 ? st.mid + (st.ceil - st.mid) * y : st.mid + (st.mid - st.floor) * y;
        col[i * 3] = k * st.tint[0]; col[i * 3 + 1] = k * st.tint[1]; col[i * 3 + 2] = k * st.tint[2];
      }
      room.setAttribute('color', new THREE.BufferAttribute(col, 3));
      sc.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
      st.panels.forEach(function (p) {
        var m = new THREE.Mesh(boxG, new THREE.MeshBasicMaterial({ color: new THREE.Color(p[2][0], p[2][1], p[2][2]) }));
        m.position.set(p[0][0], p[0][1], p[0][2]); m.scale.set(p[1][0], p[1][1], p[1][2]);
        sc.add(m);
      });
      var pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.035);
      pm.dispose();
      sc.traverse(function (o) { if (o.material) o.material.dispose(); });
      boxG.dispose(); room.dispose();
      rv.env = rt.texture; rv.envMs = performance.now() - t0;
    } catch (e) { rv.envFailed = true; rv.why = 'RealView studio could not be built: ' + ((e && e.message) || e); console.warn(rv.why); }
    return rv.env;
  }
  // tuning hook (look work, tests): rebuild the studio after changing RV_STUDIO
  function rvRebuildEnv() { if (rv.env) rv.env.dispose(); rv.env = null; rv.envFailed = false; rvBuildEnv(); applyDisplayStyle(); return rv.envMs; }
  var RV_GLSL = [
    'uniform float rvDirect; uniform float rvAmbient; uniform float rvExposure; uniform float rvUnit; uniform float rvPattern; uniform vec3 rvBend;',
    'varying vec3 vRvPos; varying vec3 vRvObjN; varying vec2 vRvNdc;',
    '#ifdef RV_VERTEX', 'varying vec3 vRvColor; varying vec3 vRvAppear;', '#endif',
    // the studio is looked up as from an eye in front of the screen (a ~40° lens) though the view is orthographic, so a
    // planar face reflects a soft gradient across the screen instead of one flat tone
    'vec3 rvEyeDir(vec3 v) { return normalize(v + vec3(-vRvNdc * 0.36, 0.0)); }',
    'vec3 rvToLinear(vec3 c) { return mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }',
    'vec3 rvToSRGB(vec3 c) { return mix(pow(max(c, vec3(0.0)), vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }',
    // a soft shoulder above 0.62: mid tones stay as lit (the grey part reads as it does with RealView off), highlights roll to white
    'vec3 rvTone(vec3 c) { c *= rvExposure; vec3 k = max(c - 0.62, 0.0); return min(c, vec3(0.62)) + k / (1.0 + k / 0.38); }',
    // sine-free hashes (D. Hoskins): fract(sin(big)) loses precision on GPUs and drew the brushed grain as diagonal,
    // crosshatched blocks on large parts and close up (user 2026-11-04: "the stainless kinda looks like crap")
    'float rvHash(vec2 p) { p = mod(p, 8192.0); vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }',
    'float rvHash3(vec3 p) { p = mod(p, 8192.0); p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }'
  ].join('\n');
  // pattern 1 brushed: streaks along the world axis that lies best in the face, about 3 px apart (a whole octave of zoom
  // keeps the same streaks), each a little rougher / darker than the next; 2 galvanized spangle: crystal patches ~10 mm
  var RV_PATTERN = [
    '{',
    '#ifdef RV_VERTEX', '  float rvPat = vRvAppear.z;', '#else', '  float rvPat = rvPattern;', '#endif',
    '  vec3 rvN = normalize(vRvObjN);',
    '  if (rvPat > 0.5 && rvPat < 1.5) {',
    // rfHF: along the bend direction (rvBendAxis) in every face that holds it, so the grain runs on through the bends
    '    vec3 ax = rvBend - rvN * dot(rvBend, rvN);',
    '    if (dot(ax, ax) < 0.25) ax = abs(rvN.x) < 0.8 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);',
    '    ax = normalize(ax);',
    '    vec3 across = normalize(cross(rvN, ax));',
    '    float s = dot(vRvPos, across), px = max(fwidth(s), 1e-6), cell = exp2(ceil(log2(px * 2.5)));',
    '    float si = floor(s / cell), t = dot(vRvPos, ax) / (cell * 220.0), ti = floor(t), tf = smoothstep(0.0, 1.0, fract(t));',
    '    float a = mix(rvHash(vec2(si, ti)), rvHash(vec2(si, ti + 1.0)), tf), b = rvHash(vec2(floor(s / (cell * 6.0)), 7.0));',
    '    float rvFlat = 1.0 - smoothstep(0.004, 0.03, length(fwidth(rvN)));',
    '    float g = ((a * 0.6 + b * 0.4) - 0.5) * rvFlat;',
    '    roughnessFactor = clamp(roughnessFactor + g * 0.12, 0.04, 1.0);',
    '    diffuseColor.rgb *= 1.0 + g * 0.08;',
    '  } else if (rvPat > 1.5 && rvPat < 2.5) {',
    // crystals: 3D Voronoi cells (~8 mm), each with its own sheen
    '    vec3 q = vRvPos * rvUnit / 8.0, i0 = floor(q), fq = fract(q);',
    '    float best = 8.0, h = 0.5;',
    '    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {',
    '      vec3 gg = vec3(float(x), float(y), float(z)), c = i0 + gg;',
    '      vec3 r = gg + vec3(rvHash3(c), rvHash3(c + 17.31), rvHash3(c + 41.7)) - fq;',
    '      float d = dot(r, r);',
    '      if (d < best) { best = d; h = rvHash3(c + 5.13); }',
    '    }',
    '    roughnessFactor = clamp(roughnessFactor + (h - 0.5) * 0.26, 0.04, 1.0);',
    '    diffuseColor.rgb *= 1.0 + (h - 0.5) * 0.08;',
    '  }',
    '}'
  ].join('\n');
  function rvPatchShader(sh, vertex) {
    sh.uniforms.rvDirect = rvU.direct; sh.uniforms.rvAmbient = rvU.ambient; sh.uniforms.rvExposure = rvU.exposure; sh.uniforms.rvUnit = rvU.unit; sh.uniforms.rvBend = rvU.bend;
    sh.uniforms.rvPattern = this.userData.rvPattern;
    var vs = sh.vertexShader, fs = sh.fragmentShader;
    vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vRvPos; varying vec3 vRvObjN; varying vec2 vRvNdc;\n#ifdef RV_VERTEX\nattribute vec3 rvColor; attribute vec3 rvAppear; varying vec3 vRvColor; varying vec3 vRvAppear;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRvPos = position; vRvObjN = normal;\n#ifdef RV_VERTEX\nvRvColor = rvColor; vRvAppear = rvAppear;\n#endif')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRvNdc = vec2(gl_Position.x / gl_Position.w * projectionMatrix[1][1] / projectionMatrix[0][0], gl_Position.y / gl_Position.w);');
    var env = THREE.ShaderChunk.envmap_physical_pars_fragment
      .replace('inverseTransformDirection( geometry.normal, viewMatrix )', 'geometry.normal')
      .replace('vec3 reflectVec = reflect( -viewDir, normal );', 'vec3 reflectVec = reflect( -rvEyeDir(viewDir), normal );')
      .replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', '');
    if (env.indexOf('rvEyeDir') < 0 || env.indexOf('inverseTransformDirection') >= 0) console.warn('rfHC: the studio lookup patch did not apply (three.js chunk changed)');
    fs = fs.replace('#include <common>', '#include <common>\n' + RV_GLSL)
      .replace('#include <envmap_physical_pars_fragment>', env)
      .replace('#include <color_fragment>', '#ifdef RV_VERTEX\ndiffuseColor.rgb = vRvColor;\n#endif\ndiffuseColor.rgb = rvToLinear(diffuseColor.rgb);')
      .replace('#include <roughnessmap_fragment>', '#ifdef RV_VERTEX\nfloat roughnessFactor = vRvAppear.y;\n#else\nfloat roughnessFactor = roughness;\n#endif')
      .replace('#include <metalnessmap_fragment>', '#ifdef RV_VERTEX\nfloat metalnessFactor = vRvAppear.x;\n#else\nfloat metalnessFactor = metalness;\n#endif')
      .replace('#include <lights_physical_fragment>', RV_PATTERN + '\n#include <lights_physical_fragment>')
      // the hemisphere light's share (irradiance) by rvAmbient, the camera lights' by rvDirect; the studio's own by its panels
      .replace('#include <lights_fragment_maps>', 'irradiance *= rvAmbient;\n#include <lights_fragment_maps>')
      .replace('#include <aomap_fragment>', 'reflectedLight.directDiffuse *= rvDirect; reflectedLight.directSpecular *= rvDirect;\n' +
        // rfHF: no Fresnel rim on faces seen edge-on or from behind. A physically based reflection goes to white as the
        // normal turns away from the viewer (dotNV is clamped at 0, Fresnel at 1), so the crack filler's wireframe, which
        // shows in the fringe of every outline and carries the normals of the faces turned away (the base of a cone,
        // the far side of a cylinder; a line has no back face to flip them), was drawn near white there and silhouettes
        // and edges of cones, cylinders and rounds read washed out; the Phong part (RealView off) is dark there. The
        // reflection fades out over the last ~17 degrees before edge-on and is gone behind, so outlines read as dark as
        // with RealView off; faces seen at more than that (an isometric box's faces, most of a round) are unchanged.
        // normal.z is signed here on purpose: three.js has already flipped it for the back of a double-sided face.
        'float rvRim = mix(0.12, 1.0, smoothstep(0.02, 0.3, normal.z)); reflectedLight.directSpecular *= rvRim; reflectedLight.indirectSpecular *= rvRim;\n' +
        '#include <aomap_fragment>')
      // the rfHA silhouette darkening, then tone map and encode (the renderer adds nothing: linear output, no tone mapping)
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb *= mix(0.8, 1.0, smoothstep(0.04, 0.6, abs(normal.z)));\ngl_FragColor.rgb = rvToSRGB(rvTone(gl_FragColor.rgb));\n#include <dithering_fragment>');
    sh.vertexShader = vs; sh.fragmentShader = fs;
  }
  // shared uniforms (one set for every RV material): tuned so the satin grey part reads like the Phong part of rfHA
  // (isometric box top / left / right about 200 / 150 / 115) with the studio's reflections on top
  var rvU = { direct: { value: 1.9 }, ambient: { value: 0.15 }, exposure: { value: 1.0 }, unit: { value: 1 }, bend: { value: new THREE.Vector3(1, 0, 0) } };
  function rvMaterial(vertex, wire) {
    var m = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, metalness: 0.05, roughness: 0.42, side: THREE.DoubleSide,
      polygonOffset: !wire, polygonOffsetFactor: 0, polygonOffsetUnits: 1, wireframe: !!wire, depthWrite: !wire, envMapIntensity: 1 });
    m.userData.rvPattern = { value: 0 };
    m.userData.realView = true;
    if (vertex) m.defines = { RV_VERTEX: '' };
    m.extensions = { derivatives: true };
    m.onBeforeCompile = function (sh) { rvPatchShader.call(m, sh, vertex); slopePatch(sh, wire ? 1 : 0); };   // rfHY: slopePatch (see syncFatFrame); the filler one push further
    m.customProgramCacheKey = function () { return 'anvil-rv-hc' + (vertex ? '-v' : '') + (wire ? '-w' : ''); };
    return m;
  }
  function rvMats() {
    if (!rv.mats) rv.mats = { part: rvMaterial(false, false), partV: rvMaterial(true, false), fill: rvMaterial(false, true), fillV: rvMaterial(true, true) };
    return rv.mats;
  }
  function rvShaded() { var s = App.view.style; return s === 'shaded' || s === 'shadedEdges'; }
  function rvActive() { return realView() && rvShaded() && !!rvBuildEnv(); }
  // the face material for a mesh without RV attributes (the flat pattern)
  function partFaceMaterial() {
    var s = App.view.style;
    if (s === 'hlr' || s === 'hlv') return mats.hlr;
    return rvActive() ? rvMats().part : mats.part;
  }
  function rvSetAppearance(m, a) {
    m.color.set(a.color); m.metalness = a.metalness; m.roughness = a.roughness; m.userData.rvPattern.value = a.pattern || 0;
  }
  function rvSync(m) {
    var p = mats.part;
    if (m.clippingPlanes !== p.clippingPlanes) { m.clippingPlanes = p.clippingPlanes; m.needsUpdate = true; }
    if (!m.wireframe) m.polygonOffsetFactor = p.polygonOffsetFactor;
    if (m.envMap !== rv.env) { m.envMap = rv.env; m.needsUpdate = true; }
  }
  // per-vertex appearance (bodies / components that differ): rvColor (sRGB) and rvAppear (metalness, roughness, pattern)
  function rvVertexData(g, m, list) {
    var key = list.map(Materials.appearanceKey).join(';') + '#' + m.triCount;
    if (g.getAttribute('rvColor') && g.__rvKey === key) return;
    var n = m.triCount * 9, cA = new Float32Array(n), aA = new Float32Array(n), c = new THREE.Color();
    m.faces.forEach(function (f) {
      var a = list[f.body || 0] || list[0];
      c.set(a.color);
      for (var o = f.start * 9; o < (f.start + f.count) * 9; o += 3) { cA[o] = c.r; cA[o + 1] = c.g; cA[o + 2] = c.b; aA[o] = a.metalness; aA[o + 1] = a.roughness; aA[o + 2] = a.pattern || 0; }
    });
    g.setAttribute('rvColor', new THREE.BufferAttribute(cA, 3));
    g.setAttribute('rvAppear', new THREE.BufferAttribute(aA, 3));
    g.__rvKey = key;
  }
  // rvApply(): called at the end of applyDisplayStyle; puts the body (and the crack filler, the flat pattern) on the RV
  // or the Phong material
  function rvApply() {
    var on = rvActive(), MS = on ? rvMats() : null;
    rvU.unit.value = App.model && App.model.units === 'in' ? 25.4 : 1;
    if (bodyMesh && bodyMesh.material !== mats.hlr) {
      var face = mats.part, fillM = mats.partFill;
      if (on) {
        var list = null;
        try { list = window.Materials && Materials.bodyAppearances ? Materials.bodyAppearances(App.model, App.build) : null; } catch (e) { list = null; }
        var base = window.Materials && Materials.appearanceOf ? Materials.appearanceOf(App.model) : { color: partColor(App.model.color), metalness: 0.05, roughness: 0.42, pattern: 0 };
        if (list && list.length) {
          var k0 = Materials.appearanceKey(list[0]), same = list.every(function (a) { return Materials.appearanceKey(a) === k0; });
          if (same) { base = list[0]; list = null; }
        }
        if (list && App.mesh && App.mesh.triCount) { rvVertexData(bodyMesh.geometry, App.mesh, list); face = MS.partV; fillM = MS.fillV; }
        else { face = MS.part; fillM = MS.fill; list = null; }
        rv.capBase = base; rv.capList = list;   // rfHF: the section caps' appearances (rvCapGroups)
        rvU.bend.value.copy(rvBendAxis());
        rvSetAppearance(MS.part, base); rvSetAppearance(MS.fill, base);
        [MS.part, MS.partV, MS.fill, MS.fillV].forEach(rvSync);
      }
      bodyMesh.material = face;
      if (crackFill) crackFill.material = fillM;
    }
    flatGroup.children.forEach(function (o) { if (o.userData.flatPattern) o.material = partFaceMaterial(); });
    rv.active = on && !!(bodyMesh && bodyMesh.material && bodyMesh.material.userData.realView);
  }
  // rfHF: section caps in RealView. rvCapGroups() -> [{ geometry (what the stencil counts), material (the cap's), own
  // (geometry made here: disposed with the caps) }]: RealView off = one group, the whole body and the Phong mats.cap in
  // the flat colour (unchanged); on = the cap in an RV twin carrying the part's appearance, or one group per appearance
  // when bodies differ (their triangles copied out of the body mesh, so each cut shows its own body's material).
  var rvCapMats = [];
  function rvCapMaterial(i, a) {
    var m = rvCapMats[i];
    if (!m) {
      m = rvMaterial(false, false);
      m.stencilWrite = true; m.stencilRef = 0; m.stencilFunc = THREE.NotEqualStencilFunc;
      m.stencilFail = THREE.ReplaceStencilOp; m.stencilZFail = THREE.ReplaceStencilOp; m.stencilZPass = THREE.ReplaceStencilOp;
      m.userData.sectionCap = true;
      rvCapMats[i] = m;
    }
    rvSetAppearance(m, a);
    if (m.envMap !== rv.env) { m.envMap = rv.env; m.needsUpdate = true; }
    return m;
  }
  function rvCapGroups() {
    var whole = [{ geometry: bodyMesh.geometry, material: mats.cap }];
    if (!rv.active || !rv.capBase) return whole;
    var list = rv.capList;
    if (!list || !App.mesh || !App.mesh.faces) return [{ geometry: bodyMesh.geometry, material: rvCapMaterial(0, rv.capBase) }];
    var keys = [], byKey = {}, P = bodyMesh.geometry.getAttribute('position').array;
    App.mesh.faces.forEach(function (f) {
      var a = list[f.body || 0] || list[0], k = Materials.appearanceKey(a);
      if (!byKey[k]) { byKey[k] = { a: a, faces: [] }; keys.push(k); }
      byKey[k].faces.push(f);
    });
    return keys.map(function (k, i) {
      var g = byKey[k], n = 0;
      g.faces.forEach(function (f) { n += f.count; });
      var arr = new Float32Array(n * 9), o = 0;
      g.faces.forEach(function (f) { arr.set(P.subarray(f.start * 9, (f.start + f.count) * 9), o); o += f.count * 9; });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      return { geometry: geo, material: rvCapMaterial(i, g.a), own: true };
    });
  }
  // rfHF: the brushed grain runs along the part's bend lines on every face, so it is continuous across the bends (it
  // turned from along X on the base to along Z on a wall before). The bend direction is the one the faces' normals are
  // all square to: the eigenvector of the smallest eigenvalue of sum(area * n n^T) over the triangles (for a part bent
  // about one direction exactly that direction; for a box or a flat blank any direction in a face, as before).
  var rvBendCache = { geo: null, n: -1, v: new THREE.Vector3(1, 0, 0) };
  function rvBendAxis() {
    var m = App.mesh;
    if (!m || !m.triCount || !m.positions) return rvBendCache.v.set(1, 0, 0);
    if (rvBendCache.geo === m.positions && rvBendCache.n === m.triCount) return rvBendCache.v;
    var P = m.positions, A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var t = 0; t < m.triCount; t++) {
      var o = t * 9, ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(l > 0)) continue;
      var w = 1 / l;   // area-weighted n n^T = (N N^T) / |N| with N the unnormalised normal (|N| = 2 * area)
      A[0] += nx * nx * w; A[1] += nx * ny * w; A[2] += nx * nz * w; A[4] += ny * ny * w; A[5] += ny * nz * w; A[8] += nz * nz * w;
    }
    A[3] = A[1]; A[6] = A[2]; A[7] = A[5];
    // Jacobi rotations on the symmetric 3 x 3 matrix
    var V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (var it = 0; it < 24; it++) {
      var p = 0, q = 1, big = Math.abs(A[1]);
      if (Math.abs(A[2]) > big) { p = 0; q = 2; big = Math.abs(A[2]); }
      if (Math.abs(A[5]) > big) { p = 1; q = 2; big = Math.abs(A[5]); }
      if (big < 1e-12 * (Math.abs(A[0]) + Math.abs(A[4]) + Math.abs(A[8]) + 1e-30)) break;
      var app = A[p * 3 + p], aqq = A[q * 3 + q], apq = A[p * 3 + q], th = 0.5 * Math.atan2(2 * apq, aqq - app), c = Math.cos(th), s = Math.sin(th);
      for (var k = 0; k < 3; k++) {   // A = J^T A J, columns then rows
        var akp = A[k * 3 + p], akq = A[k * 3 + q];
        A[k * 3 + p] = c * akp - s * akq; A[k * 3 + q] = s * akp + c * akq;
      }
      for (k = 0; k < 3; k++) {
        var apk = A[p * 3 + k], aqk = A[q * 3 + k];
        A[p * 3 + k] = c * apk - s * aqk; A[q * 3 + k] = s * apk + c * aqk;
      }
      for (k = 0; k < 3; k++) {
        var vkp = V[k * 3 + p], vkq = V[k * 3 + q];
        V[k * 3 + p] = c * vkp - s * vkq; V[k * 3 + q] = s * vkp + c * vkq;
      }
    }
    var j = 0; if (A[4] < A[j * 4]) j = 1; if (A[8] < A[j * 4]) j = 2;
    rvBendCache.v.set(V[j], V[3 + j], V[6 + j]).normalize();
    rvBendCache.geo = m.positions; rvBendCache.n = m.triCount;
    return rvBendCache.v;
  }
  // UI.realViewInfo() -> { on (the setting), active (drawn now), envMs, why } for tests and the status bar
  function realViewInfo() { return { on: realView(), active: !!rv.active, software: softwareGL(), byDefault: rvDefault(), envMs: rv.envMs || 0, why: rv.why, material: bodyMesh ? bodyMesh.material : null, materials: rvMats(), tune: { uniforms: rvU, studio: RV_STUDIO, rebuild: rvRebuildEnv } }; }

  // ------------------------------------------------------------------ lane DC (finding #9): the flattened state
  // SolidWorks' Flatten: the part is shown as its flat pattern (Flat-Pattern1 unsuppressed) until Flatten is clicked
  // again. App.model.flatState (saved with the document, undoable) asks for it; the folded part stays App.mesh /
  // App.build (flat pattern, DXF, mass properties and every feature read it), its drawn geometry is hidden, and a group
  // of its own shows Kernel.flatBody (the blank T thick on the Base Flange's sketch plane) with its outline and the
  // bend lines (dashed, on the face the flat is drawn from). App.flat = the flat pattern shown, App.flatError = why it
  // could not be shown (the Flat-Pattern1 row turns red; the folded part stays on screen). Faces and edges of the
  // hidden folded part are not picked meanwhile.
  var flatGroup = new THREE.Group();
  scene.add(flatGroup);
  var flatBendMat = new THREE.LineDashedMaterial({ color: 0x3fa34d, dashSize: 1, gapSize: 0.5, depthTest: true });
  function flatShown() { return !!(App.model && App.model.flatState && App.flat); }
  function updateFlatState() {
    disposeGroup(flatGroup);
    App.flat = null; App.flatError = null; App.flatBounds = null;
    var want = !!(App.model && App.model.flatState && App.model.sheet && !isAssembly());
    if (want && App.build && App.build.body && App.mesh) {
      try {
        var flat = K.flatPattern(App.model, App.build, App.mesh), fb = K.flatBody(App.model, App.build, flat);
        var fm = K.meshFromBody(fb.body);
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(fm.positions, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(analyticNormals(fm), 3));
        var mesh = new THREE.Mesh(g, partFaceMaterial());   // rfHC: the RV material when RealView is on
        mesh.renderOrder = -1;
        mesh.userData.flatPattern = true;
        flatGroup.add(mesh);
        var pl = fb.plane, seg = [], T = fb.h1 - fb.h0, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        function P(q, h) { var w = K.to3D(pl, q[0], q[1]); return [w[0] + pl.n[0] * h, w[1] + pl.n[1] * h, w[2] + pl.n[2] * h]; }
        function push(a, b) { seg.push(a[0], a[1], a[2], b[0], b[1], b[2]); for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k], b[k]); hi[k] = Math.max(hi[k], a[k], b[k]); } }
        flat.loops.forEach(function (l) {
          var n = l.length;
          for (var i = 0; i < n; i++) {
            var a = l[i], b = l[(i + 1) % n], c = l[(i + n - 1) % n];
            push(P(a, fb.h0), P(b, fb.h0)); push(P(a, fb.h1), P(b, fb.h1));
            // a corner (not a chord of an arc): the edge through the thickness
            var e1 = [a[0] - c[0], a[1] - c[1]], e2 = [b[0] - a[0], b[1] - a[1]];
            var turn = Math.abs(Math.atan2(e1[0] * e2[1] - e1[1] * e2[0], e1[0] * e2[0] + e1[1] * e2[1]));
            if (turn > 25 * Math.PI / 180) push(P(a, fb.h0), P(a, fb.h1));
          }
        });
        var eg = new THREE.BufferGeometry();
        eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
        flatGroup.add(new THREE.LineSegments(eg, mats.edge));
        if (flat.bends.length) {
          var bs = [], hb = fb.h1 + 1e-3 * T;
          flat.bends.forEach(function (bd) { var a = P(bd.a, hb), b = P(bd.b, hb); bs.push(a[0], a[1], a[2], b[0], b[1], b[2]); });
          var bg = new THREE.BufferGeometry();
          bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bs), 3));
          var size = Math.max(flat.size[0], flat.size[1]) || 1;
          flatBendMat.dashSize = size / 60; flatBendMat.gapSize = size / 120;
          var bl = new THREE.LineSegments(bg, flatBendMat);
          bl.computeLineDistances();
          bl.userData.flatBends = true;
          flatGroup.add(bl);
        }
        if (flat.regionLines && flat.regionLines.length) {   // lane flatopts-2: Merge faces cleared: the bend regions' tangent lines on both faces
          var rs = [];
          flat.regionLines.forEach(function (rl) { [fb.h0, fb.h1].forEach(function (hh) { var a = P(rl.a, hh), b = P(rl.b, hh); rs.push(a[0], a[1], a[2], b[0], b[1], b[2]); }); });
          var rg = new THREE.BufferGeometry();
          rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rs), 3));
          var rln = new THREE.LineSegments(rg, mats.edge);
          rln.userData.flatRegionLines = true;
          flatGroup.add(rln);
        }
        App.flat = flat;
        App.flatBounds = { min: lo, max: hi };
      } catch (e) { App.flatError = (e && e.message) || String(e); }
    } else if (want) App.flatError = 'The part has no solid to flatten.';
    var on = flatShown();
    groups.body.visible = !on; groups.edges.visible = !on; groups.highlight.visible = !on;
    pickMemo.key = null;
    sceneVer++;
    if (UI.requestRender) UI.requestRender();
    return on;
  }

  // ------------------------------------------------------------------ silhouette edges
  // SolidWorks draws the outline of a curved face where it turns away from the viewer (the side of a cylinder, the
  // rim of a sphere). Every smooth edge (a seam between two facets of one surface, or a tangent edge) goes into one
  // line set with both facets' normals; the vertex shader keeps it only where one facet faces the viewer and the
  // other faces away, so silhouettes follow the view on the GPU with no per-frame work on the CPU.
  var silMat = new THREE.ShaderMaterial({
    uniforms: { viewDir: { value: new THREE.Vector3(0, 0, 1) }, color: { value: mats.edge.color } },
    vertexShader: [
      'uniform vec3 viewDir;', 'attribute vec3 n1;', 'attribute vec3 n2;',
      '#include <clipping_planes_pars_vertex>',
      'void main() {',
      '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '  if (dot(n1, viewDir) * dot(n2, viewDir) > 0.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',
      '  #include <clipping_planes_vertex>',
      '}'].join('\n'),
    fragmentShader: [
      'uniform vec3 color;',
      '#include <clipping_planes_pars_fragment>',
      'void main() {',
      '  #include <clipping_planes_fragment>',
      '  gl_FragColor = vec4(color, 1.0);',
      '}'].join('\n'),
    clipping: true
  });
  mats.silhouette = silMat;

  // ------------------------------------------------------------------ thick lines (r13/lines13)
  // WebGL draws GL_LINES 1 device pixel wide on Windows whatever linewidth says, so model edges and sketches looked thin
  // next to SolidWorks. A line object whose material carries userData.lineWidth (CSS px) is drawn instead by a child
  // mesh of screen-space quads, one instance per segment, read straight from the line's own position buffer (no copy
  // in JS): the vertex shader widens each segment in screen space and the fragment shader rounds both ends, so joins are
  // round and clean. The line object itself stays in the scene, unchanged (picking, box selection, bounds, the assembly
  // drag poses read its positions) but on a layer the camera does not draw. syncFatLines() runs before every frame: it
  // follows position updates, material colour / depth / clipping changes and the display style (Hidden Lines Visible
  // adds a dashed pass that only passes behind the body). Widths are CSS pixels, so they scale with devicePixelRatio.
  var LINE_W = { edge: 1.5, sketch: 2, sketchInactive: 1.5, sketchSel: 2.5, temp: 2, edgeHover: 3, edgeSel: 3, plane: 1, grid: 1, origin: 1.5, hidden: 1 };
  var FAT_LAYER = 30, fatOn = true;
  // UI.thickLines(on?) -> whether lines are drawn thick (off: the plain 1-pixel lines; for comparisons and old GPUs)
  function thickLines(on) { if (on != null) { fatOn = !!on; needsRender = true; } return fatOn && fatOk; }
  var fatU = { resolution: { value: new THREE.Vector2(1, 1) }, devRes: { value: new THREE.Vector2(1, 1) }, worldPerPx: { value: 1 } };
  var fatOk = (function () {
    try { return !!(renderer.capabilities.isWebGL2 || renderer.extensions.get('ANGLE_instanced_arrays')); } catch (e) { return false; }
  })();
  // every thick-line geometry owns its 4-corner quad (disposing a geometry frees its attributes' GL buffers)
  var FAT_QUAD = new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), FAT_IDX = new Uint16Array([0, 1, 2, 2, 1, 3]);
  function fatVertexShader(kind) {
    return [
      'uniform vec2 resolution;', 'uniform vec2 devRes;', 'uniform float linewidth;', 'uniform float worldPerPx;',
      'attribute vec3 instanceStart;', 'attribute vec3 instanceEnd;', 'attribute vec3 instanceChordStart;', 'attribute vec3 instanceChordEnd;',
      '#ifdef DASHED', 'attribute float instanceDistStart;', 'attribute float instanceDistEnd;', 'varying float vDist;', '#endif',
      '#ifdef SIL', 'uniform vec3 viewDir;', 'attribute vec3 instanceN1;', 'attribute vec3 instanceN2;', '#endif',
      'varying vec2 vPx;', 'varying float vLen;', 'varying float vHw;',
      '#include <clipping_planes_pars_vertex>',
      'void main() {',
      '  vec4 mvA = modelViewMatrix * vec4(instanceStart, 1.0);',
      '  vec4 mvB = modelViewMatrix * vec4(instanceEnd, 1.0);',
      '  vec4 cA = projectionMatrix * mvA;', '  vec4 cB = projectionMatrix * mvB;',
      '  vec2 hr = 0.5 * resolution;',
      '  vec2 d = (cB.xy / cB.w - cA.xy / cA.w) * hr;',
      '  float L = length(d);',
      '  vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);',
      '  vec2 nrm = vec2(-dir.y, dir.x);',
      '  float hw = 0.5 * linewidth;',
      '  bool atA = position.y < 0.5;',
      '  vec4 c = atA ? cA : cB;',
      // rfHG: a true-curve edge (a circle drawn finely over the faces' chords) also covers the sliver between its arc
      // and the facet chord under it (instanceChord*: the radial foot on the chord; = the point itself for every other
      // line): that side of the band is widened by the chord's offset across the line (at most 4 px) and takes the
      // chord's depth there, so the line meets its faces' boundary with no gap of background or face between them and
      // is never buried by its own faces (the chord lies on them), whatever the GPU's depth precision
      '  vec4 q = projectionMatrix * (modelViewMatrix * vec4(atA ? instanceChordStart : instanceChordEnd, 1.0));',
      '  float dq = dot((q.xy / q.w - c.xy / c.w) * hr, nrm);',
      '  float ext = position.x * dq > 0.0 ? min(abs(dq), 4.0) : 0.0;',
      '  if (ext > 0.0) c.z = q.z / q.w * c.w;',
      // rfHY: a few depth steps towards the viewer (1.5e-6 of the fitted depth range: far below any real gap between a
      // line and a face in front of it), so a line lying on a face seen square-on wins the tie on every GPU
      '  c.z -= 3e-6 * c.w;',
      '  vec2 off = nrm * position.x * (hw + ext) + dir * (atA ? -hw : hw);',
      '  c.xy += off / hr * c.w;',
      // rfHA: a line that runs square to the screen (a Normal To view, a sketch rectangle) is moved by under half a device
      // pixel so it covers whole pixels (even widths centred on a pixel boundary, odd ones on a pixel centre): crisp,
      // never a two-tone smear from the multisampling. Both ends move by the same amount (computed from end A).
      '  vec2 dd = d * devRes / resolution;',
      '  float wd = floor(linewidth * devRes.x / resolution.x + 0.5);',
      '  float hp = mod(wd, 2.0) * 0.5;',
      '  if (abs(dd.y) < 0.05 && abs(dd.x) > 0.5) { float yy = (cA.y / cA.w * 0.5 + 0.5) * devRes.y; c.y += (floor(yy - hp + 0.5) + hp - yy) / devRes.y * 2.0 * c.w; }',
      '  else if (abs(dd.x) < 0.05 && abs(dd.y) > 0.5) { float xx = (cA.x / cA.w * 0.5 + 0.5) * devRes.x; c.x += (floor(xx - hp + 0.5) + hp - xx) / devRes.x * 2.0 * c.w; }',
      '  gl_Position = c;',
      '  vPx = vec2(position.x * (hw + ext), atA ? -hw : L + hw);', '  vLen = L;', '  vHw = hw;',
      '#ifdef DASHED',
      '  float tt = L > 1e-5 ? vPx.y / L : 0.0;',   // extrapolated over the round ends, so dashes keep their pitch across joins
      '  vDist = (instanceDistStart + tt * (instanceDistEnd - instanceDistStart)) / worldPerPx;',
      '#endif',
      '#ifdef SIL',
      '  if (dot(instanceN1, viewDir) * dot(instanceN2, viewDir) > 0.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',
      '#endif',
      '  vec4 mvPosition = atA ? mvA : mvB;',
      '  #include <clipping_planes_vertex>',
      '}'].join('\n');
  }
  var fatFragmentShader = [
    'uniform vec3 color;', 'uniform float opacity;', 'uniform float dashPx;', 'uniform float gapPx;',
    'varying vec2 vPx;', 'varying float vLen;', 'varying float vHw;',
    '#ifdef DASHED', 'varying float vDist;', '#endif',
    '#include <clipping_planes_pars_fragment>',
    'void main() {',
    '  #include <clipping_planes_fragment>',
    '  if (vPx.y < 0.0) { if (length(vPx) > vHw) discard; }',
    '  else if (vPx.y > vLen) { if (length(vec2(vPx.x, vPx.y - vLen)) > vHw) discard; }',
    '#ifdef DASHED',
    '  if (mod(vDist, dashPx + gapPx) > dashPx) discard;',
    '#endif',
    '  gl_FragColor = vec4(color, opacity);',
    '}'].join('\n');
  // fatMaterial(kind, src): kind 'line' | 'dash' | 'sil' | 'hid' (HLV hidden pass) | 'silhid'; one per source material
  function fatMaterial(kind, src) {
    var dashed = kind === 'dash' || kind === 'hid' || kind === 'silhid', sil = kind === 'sil' || kind === 'silhid';
    var defs = {};
    if (dashed) defs.DASHED = '';
    if (sil) defs.SIL = '';
    var m = new THREE.ShaderMaterial({
      defines: defs,
      uniforms: {
        resolution: fatU.resolution, devRes: fatU.devRes, worldPerPx: fatU.worldPerPx, linewidth: { value: 1 },
        color: { value: new THREE.Color() }, opacity: { value: 1 }, dashPx: { value: 6 }, gapPx: { value: 4 },
        viewDir: silMat.uniforms.viewDir
      },
      vertexShader: fatVertexShader(kind), fragmentShader: fatFragmentShader, clipping: true, side: THREE.DoubleSide
    });
    m.userData.fatKind = kind;
    if (kind === 'hid' || kind === 'silhid') { m.depthFunc = THREE.GreaterDepth; m.depthWrite = false; m.uniforms.dashPx.value = 5; m.uniforms.gapPx.value = 3; }
    return m;
  }
  function hiddenLineColor() { return 0x8c8c8c; }   // rfBR: hidden lines mid grey on the grey-black ground
  // copies what the source material says onto its thick twin (cheap; runs per object per frame)
  function syncFatMat(fm, src, w, hidden) {
    var srcColor = src.uniforms && src.uniforms.color ? src.uniforms.color.value : src.color;
    if (hidden) fm.uniforms.color.value.setHex(hiddenLineColor());
    else if (srcColor) fm.uniforms.color.value.copy(srcColor);
    fm.uniforms.opacity.value = src.opacity != null ? src.opacity : 1;
    // rfHA: widths are whole device pixels (1.5 px edges are 2 device px at 100 %, 125 % and 150 % scaling), so an edge
    // has one weight at every display scale and never alternates between a hard and a soft pixel as the view turns
    var dpr = renderer.getPixelRatio();
    fm.uniforms.linewidth.value = Math.max(1, Math.round(w * dpr)) / dpr;
    // rfIB: a line drawn over everything (depthTest off: the sketch being edited, previews, selection) is drawn in the
    // transparent pass, in its renderOrder, so a translucent fill under it (the shaded sketch regions, renderOrder 9)
    // never washes over its inner half: opacity 1, the same colour, the whole width
    var tr = !!src.transparent || (!hidden && src.depthTest === false);
    if (fm.transparent !== tr) { fm.transparent = tr; fm.needsUpdate = true; }
    if (!hidden) { fm.depthTest = src.depthTest; fm.depthWrite = src.depthWrite; }
    fm.clippingPlanes = src.clippingPlanes;
    fm.visible = src.visible;
    if (src.isLineDashedMaterial && src.userData.dashPx) { fm.uniforms.dashPx.value = src.userData.dashPx; fm.uniforms.gapPx.value = src.userData.gapPx || 4; }
    else if (src.isLineDashedMaterial) { var wp = fatU.worldPerPx.value || 1; fm.uniforms.dashPx.value = src.dashSize / wp; fm.uniforms.gapPx.value = src.gapSize / wp; }
  }
  function fatMatFor(src, kind) {
    var c = src.userData.fatMats || (src.userData.fatMats = {});
    return c[kind] || (c[kind] = fatMaterial(kind, src));
  }
  // cumulative length along chained segments (a segment that starts where the last ended carries on its dash)
  function chainDistances(arr, seg) {
    var n = arr.length / 3, d = new Float32Array(n), acc = 0;
    for (var i = 1; i < n; i++) {
      var o = i * 3, p = o - 3;
      var L = Math.sqrt((arr[o] - arr[p]) * (arr[o] - arr[p]) + (arr[o + 1] - arr[p + 1]) * (arr[o + 1] - arr[p + 1]) + (arr[o + 2] - arr[p + 2]) * (arr[o + 2] - arr[p + 2]));
      if (seg && (i & 1) === 0) { d[i] = L < 1e-9 ? acc : (acc = 0); continue; }   // a segment's start: joined or new
      acc += L; d[i] = acc;
    }
    return d;
  }
  function fatGeometry(o, needDist) {
    var src = o.geometry, pos = src.attributes.position, seg = !!o.isLineSegments, stride = seg ? 6 : 3;
    var g = new THREE.InstancedBufferGeometry();
    g.setIndex(new THREE.BufferAttribute(FAT_IDX, 1));
    g.setAttribute('position', new THREE.BufferAttribute(FAT_QUAD, 3));
    var ib = new THREE.InstancedInterleavedBuffer(pos.array, stride, 1);
    g.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    // rfHG: the radial foot of each point on its facet chord (buildEdgeGeometry's 'chord'), else the points themselves
    var ch = src.attributes.chord, cb = ch && ch.count === pos.count && ch.itemSize === 3 ? new THREE.InstancedInterleavedBuffer(ch.array, stride, 1) : ib;
    g.setAttribute('instanceChordStart', new THREE.InterleavedBufferAttribute(cb, 3, 0));
    g.setAttribute('instanceChordEnd', new THREE.InterleavedBufferAttribute(cb, 3, 3));
    var count = seg ? Math.floor(pos.count / 2) : pos.count - 1, nb = null;
    if (o.material === silMat || (o.material.userData && o.material.userData.fatSil)) {
      var a1 = src.attributes.n1, a2 = src.attributes.n2;
      if (a1 && a2) {
        var b1 = new THREE.InstancedInterleavedBuffer(a1.array, stride, 1), b2 = new THREE.InstancedInterleavedBuffer(a2.array, stride, 1);
        g.setAttribute('instanceN1', new THREE.InterleavedBufferAttribute(b1, 3, 0));
        g.setAttribute('instanceN2', new THREE.InterleavedBufferAttribute(b2, 3, 0));
        nb = [b1, b2, a1, a2];
      }
    }
    var db = null;
    if (needDist) {
      var ld = src.attributes.lineDistance;
      var darr = ld && ld.count === pos.count ? ld.array : chainDistances(pos.array, seg);
      db = new THREE.InstancedInterleavedBuffer(darr, seg ? 2 : 1, 1);
      g.setAttribute('instanceDistStart', new THREE.InterleavedBufferAttribute(db, 1, 0));
      g.setAttribute('instanceDistEnd', new THREE.InterleavedBufferAttribute(db, 1, 1));
    }
    g.instanceCount = Math.max(0, count);
    if (!src.boundingBox) src.computeBoundingBox();
    g.boundingBox = src.boundingBox;
    return { geom: g, ib: ib, nb: nb, db: db, dist: !!needDist, pos: pos, arr: pos.array, ver: pos.version, ld: src.attributes.lineDistance || null };
  }
  function noRaycast() { }
  function fatChild(geom, mat, tag) {
    var m = new THREE.Mesh(geom, mat);
    m.frustumCulled = false;
    m.raycast = noRaycast;
    m.userData.fatLine = tag;
    m.matrixAutoUpdate = false;
    return m;
  }
  function dropFat(o) {
    var f = o.userData.fat;
    if (!f) return;
    if (f.mesh) o.remove(f.mesh);
    if (f.hid) o.remove(f.hid);
    if (f.g) f.g.geom.dispose();
    o.userData.fat = null;
    o.layers.set(0);
  }
  function fatSyncLine(o) {
    var m = o.material, w = fatOk && fatOn && m && !Array.isArray(m) && m.userData && m.userData.lineWidth;
    var pos = o.geometry && o.geometry.attributes.position;
    if (!w || !pos || pos.isInterleavedBufferAttribute || pos.itemSize !== 3 || !(pos.array instanceof Float32Array) || pos.count < 2) { dropFat(o); return; }
    var f = o.userData.fat || (o.userData.fat = { g: null, mesh: null, hid: null });
    var sil = m === silMat || !!m.userData.fatSil;
    var hlv = App.view.style === 'hlv' && !!m.userData.hlv;
    var needDist = m.isLineDashedMaterial || hlv;
    var ldNow = o.geometry.attributes.lineDistance || null;
    if (!f.g || f.g.pos !== pos || f.g.arr !== pos.array || (needDist && !f.g.dist) || (f.g.dist && f.g.ld !== ldNow) ||
        (f.g.nb && (f.g.nb[2] !== o.geometry.attributes.n1 || f.g.nb[3] !== o.geometry.attributes.n2))) {
      if (f.g) f.g.geom.dispose();
      f.g = fatGeometry(o, needDist);
      if (f.mesh) f.mesh.geometry = f.g.geom;
      if (f.hid) f.hid.geometry = f.g.geom;
      if (!o.geometry.userData.fatHooked) {
        o.geometry.userData.fatHooked = true;
        o.geometry.addEventListener('dispose', function () { if (o.userData.fat && o.userData.fat.g) o.userData.fat.g.geom.dispose(); });
      }
    } else if (f.g.ver !== pos.version) {
      f.g.ver = pos.version;
      f.g.ib.needsUpdate = true;
      if (f.g.nb) { f.g.nb[0].needsUpdate = true; f.g.nb[1].needsUpdate = true; }
      if (f.g.db) {
        if (f.g.ld) f.g.db.needsUpdate = true;
        else { f.g.db.array = chainDistances(pos.array, !!o.isLineSegments); f.g.db.needsUpdate = true; }
      }
      o.geometry.computeBoundingBox(); f.g.geom.boundingBox = o.geometry.boundingBox;
    }
    var kind = sil ? 'sil' : m.isLineDashedMaterial ? 'dash' : 'line';
    var fm = fatMatFor(m, kind);
    syncFatMat(fm, m, w, false);
    if (!f.mesh) { f.mesh = fatChild(f.g.geom, fm, 'line'); o.add(f.mesh); }
    f.mesh.material = fm;
    f.mesh.renderOrder = o.renderOrder + 0.5;   // after the body (0) so Hidden Lines Visible's pass sits under it
    if (hlv) {
      var hm = fatMatFor(m, sil ? 'silhid' : 'hid');
      syncFatMat(hm, m, LINE_W.hidden, true);
      if (!f.hid) { f.hid = fatChild(f.g.geom, hm, 'hidden'); o.add(f.hid); }
      f.hid.material = hm;
      f.hid.renderOrder = o.renderOrder + 0.25;
      f.hid.visible = true;
    } else if (f.hid) f.hid.visible = false;
    if (o.layers.mask !== (1 << FAT_LAYER)) o.layers.set(FAT_LAYER);
  }
  function syncFatLines(obj) {
    if (!obj.visible) return;
    if ((obj.isLineSegments || obj.isLine) && !obj.isLineLoop) fatSyncLine(obj);
    var ch = obj.children;
    for (var i = 0; i < ch.length; i++) if (!ch[i].userData.fatLine) syncFatLines(ch[i]);
  }
  // the shader's view of the frame: drawing-buffer-independent CSS pixels and mm per CSS pixel
  function syncFatFrame() {
    fatU.resolution.value.set(size.w, size.h);
    fatU.devRes.value.set(renderer.domElement.width || 1, renderer.domElement.height || 1);
    fatU.worldPerPx.value = (camera.right - camera.left) / Math.max(1, size.w);
    // the faces sit back by their slope over half an edge width, so an edge in an inside corner (a pocket floor, a boss
    // foot) is not half buried by the face that rises towards the viewer next to it (1 px was enough for 1-pixel lines)
    // rfHY: no longer glPolygonOffset's factor (× the triangle's own depth slope): a facet seen edge-on (a round's or a
    // bore's wall at its silhouette) has a near-infinite slope, so it sank far behind the surfaces it hides, and the
    // back face of a flange, the far side of a bore or the background showed through at every silhouette and along a
    // bore's front rim (light dotted lines and a sawtooth rim, Shaded with no edges, both engines). The same push is
    // made in the vertex shader from the view-space normal (slopePush), clamped at SLOPE.max (8: ≈ 83°; at 2 the far rim of a washer tilted 3° lost half its line to the wall).
    var po = fatOn && fatOk ? 1 + Math.ceil(LINE_W.edge * renderer.getPixelRatio() * 2) / 4 : 1;
    slopeU.push.value = SLOPE.on ? po * fatU.worldPerPx.value : 0;
    slopeU.max.value = SLOPE.max;
  }
  function lineMat(mat, w, extra) { mat.userData.lineWidth = w; if (extra) Object.keys(extra).forEach(function (k) { mat.userData[k] = extra[k]; }); return mat; }
  lineMat(mats.edge, LINE_W.edge, { hlv: true });
  lineMat(silMat, LINE_W.edge, { hlv: true, fatSil: true });
  ['sketch', 'sketchFull', 'sketchOver', 'sketchConflict', 'sketchConstr'].forEach(function (k) { lineMat(mats[k], LINE_W.sketch); });
  lineMat(mats.sketchSel, LINE_W.sketchSel);
  lineMat(mats.temp, LINE_W.temp);
  lineMat(mats.sketchDim, LINE_W.sketchInactive);
  lineMat(mats.sketchDangling, LINE_W.sketchInactive);
  lineMat(mats.planeLine, LINE_W.plane);
  lineMat(mats.grid, LINE_W.grid);
  lineMat(mats.gridMajor, LINE_W.grid);

  function buildSilhouettes(m) {
    var faces = m.faces, pos = [], na = [], nb = [];
    (App.edges || []).forEach(function (e) {
      if (!e.smooth || e.faces.length !== 2 || !edgeVisible(e)) return;
      // rfHJ (hole lines): only a convex fold is ever an outline. A concave one (the side of a bore, where the wall
      // turns away from the viewer) is always covered by the solid in front of it, so it only showed where the depth
      // test let it through (crossing holes, thin walls): stray dark lines across the inside of colliding holes
      if (e.convex === false) return;
      if (zt.faceSet && zt.faceSet[e.faces[0]] && zt.faceSet[e.faces[1]]) return;   // rfHG: drawn from the zoom display mesh
      var f1 = faces[e.faces[0]], f2 = faces[e.faces[1]];
      var n1 = f1 && f1.normal, n2 = f2 && f2.normal;
      if (!n1 || !n2 || V.dot(n1, n2) > 0.999999) return;   // coplanar split: never an outline
      pos.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]);
      na.push(n1[0], n1[1], n1[2], n1[0], n1[1], n1[2]);
      nb.push(n2[0], n2[1], n2[2], n2[0], n2[1], n2[2]);
    });
    if (!pos.length) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('n1', new THREE.Float32BufferAttribute(na, 3));
    g.setAttribute('n2', new THREE.Float32BufferAttribute(nb, 3));
    var o = new THREE.LineSegments(g, silMat);
    o.frustumCulled = false;
    o.userData.silhouette = true;
    return o;
  }
  var visTris = null;  // rendered triangle -> global triangle, or null when nothing is hidden
  // a triangle index of the drawn body geometry -> the App.mesh triangle (rfHG: the zoom display mesh has its own map)
  function renderedTri(i) { return zt.map ? zt.map[i] : visTris ? visTris[i] : i; }

  // the edges worker.js found on the same mesh (a worker build): used when they fit it, else null (smooth/responsive)
  function edgesFromWorker(m) {
    var es = m && m.workerEdges, nf = m && m.faces ? m.faces.length : 0;
    if (!es) return null;
    m.workerEdges = null;
    for (var i = 0; i < es.length; i++) {
      var fs = es[i].faces || [];
      for (var j = 0; j < fs.length; j++) if (!(fs[j] < nf)) return null;
    }
    // spot check: the first and last edge lie on the planes of their faces
    var ok = [es[0], es[es.length - 1]].every(function (e) {
      if (!e) return true;
      return (e.faces || []).every(function (fi) { var f = m.faces[fi]; return Math.abs(f.normal[0] * e.a[0] + f.normal[1] * e.a[1] + f.normal[2] * e.a[2] - f.w) < 1e-3; });
    });
    return ok ? es : null;
  }
  // the curved-face info a worker found on the same mesh (Kernel.meshCurveInfo), when it fits it, else null (r3/engine3)
  function workerCurves(m) {
    var c = m && m.workerCurves;
    return c && c.faces === m.faces.length && c.faceSurfs && c.faceSurfs.length === c.faces && c.key0 && c.curves ? c : null;
  }
  // the smooth-shading normals a worker found on the same mesh (Kernel.analyticNormals, the numbers analyticNormals
  // below makes) become the mesh's cached ones when they fit it (r3/engine3)
  function useWorkerNormals(m, n) {
    if (m && n && m.normals && n.length === m.normals.length && !m.smoothNormals) m.smoothNormals = safeNormals(m, n);
  }
  // App.edges is computed once per mesh (bodyEdges is not cheap) and reused when only visibility changes.
  function edgesFor(m) {
    if (App.edges && App.edgesMesh === m) return App.edges;
    App.edgesMesh = m;
    var asmE = null;
    App.edges = edgesFromWorker(m) || (asmE = UI.asmEdges && UI.asmEdges(m)) || K.bodyEdges(m);   // asmEdges: an assembly from its parts' edges (ui-assembly.js)
    // a solid from OpenCascade (ui-occt.js): every polygon knows its B-rep face; edges inside one face are seams
    if (m.faces.length && m.faces[0].polys && m.faces[0].polys[0] && m.faces[0].polys[0].face != null) {
      // rfHL: an edge between two B-rep faces that OpenCascade says meet tangent (occt-kernel.js tangentFaces) is a
      // tangent edge, never drawn, however far a coarse mesh's facets turn across it (a loft's or sweep's patches)
      var tan = !asmE && App.mesh === m && App.build && App.build.occt && App.build.occt.tangent || null;
      App.edges.forEach(function (e) {
        if (e.faces.length !== 2) return;
        var a = m.faces[e.faces[0]].polys[0].face, b = m.faces[e.faces[1]].polys[0].face;
        if ((m.faces[e.faces[0]].body || 0) !== (m.faces[e.faces[1]].body || 0)) return;   // (r4/asm4: one component's)
        if (a != null && a === b) { e.seam = true; e.smooth = true; }
        else if (tan && a != null && b != null && tan[Math.min(a, b) + '|' + Math.max(a, b)]) { e.smooth = true; e.tangent = true; }
      });
    }
    App.curves = asmE && asmE.curves ? asmE.curves : annotateCurveEdges(m, App.edges);   // r4/asm4: placed from the parts' curves
    // rfHY: a smooth edge inside one picked face (the chord strips of an extruded spline, the rings of a revolved one,
    // a sweep's facets: faceGroups) is a seam too, never drawn, picked or listed as a tangent edge
    if (!asmE && App.mesh === m && m.faces.length && m.faces[0].polys) {
      var G = null;
      try { G = faceGroups(m); } catch (e) { G = null; }
      if (G) App.edges.forEach(function (e) {
        if (e.seam || !e.smooth || e.faces.length !== 2) return;
        var g = G[e.faces[0]];
        if (g && g.length > 1 && g.indexOf(e.faces[1]) >= 0) e.seam = true;
      });
    }
    return App.edges;
  }

  // ------------------------------------------------------------------ true curves (display)
  // The kernel's CSG polygons carry exact surface records (polygon.surf.s: cyl / cone / sph / tor, see kernel.js
  // "analytic surface records"). The viewport uses them twice:
  //   shading: every corner of a triangle on a curved face gets the surface's own normal there (analyticNormals), so
  //     cylinders and fillets shade smoothly whatever the facet count; planar faces keep their flat normals;
  //   edges: the seams between facets of one surface are tangent (e.seam, e.smooth) and never drawn or picked, and the
  //     facet edges that approximate a true circle or arc (Kernel.curveEdges chords) are drawn as that curve, a fine
  //     polyline of CURVE_SEGS segments per full turn independent of the mesh (App.curves, e.curve on the chord edges).
  var CURVE_SEGS = 128;
  // rfFE: a true circle / arc edge is drawn at screen resolution: at least CURVE_SEGS per turn, more when the zoom
  // makes a chord's sagitta over CURVE_SAG_PX pixels (up to 4096 per turn); refineCurves (from updateGrid) samples
  // every curve again when the zoom has moved more than 30 % since, and swaps the edge lines' geometry (no rebuild).
  var CURVE_SAG_PX = 0.15, curveSegsScale = 0;
  function curveScreenSegs(r) {
    var tol = Math.max(1e-12, CURVE_SAG_PX * cam.scale), n = r > tol ? Math.PI / Math.acos(Math.max(-1, 1 - tol / r)) : 0;
    return Math.max(CURVE_SEGS, Math.min(4096, Math.ceil(n - 1e-9)));
  }
  function curveScreenPts(c) {
    var n = c.normal, xd = c.xdir, yd = V.cross(n, xd), sweep = c.a1 - c.a0;
    var segs = Math.max(4, Math.ceil(curveScreenSegs(c.radius) * sweep / (2 * Math.PI) - 1e-9)), pts = [];
    for (var i = 0; i <= segs; i++) {
      var a = c.a0 + sweep * i / segs, ca = Math.cos(a) * c.radius, sa = Math.sin(a) * c.radius;
      pts.push([c.center[0] + xd[0] * ca + yd[0] * sa, c.center[1] + xd[1] * ca + yd[1] * sa, c.center[2] + xd[2] * ca + yd[2] * sa]);
    }
    return pts;
  }
  function refineCurves() {
    var cs = App.curves;
    if (!cs || !cs.length || !edgeLines || !App.mesh || App.edgesMesh !== App.mesh || !(curveSegsScale > 0)) return false;
    if (Math.abs(Math.log(cam.scale / curveSegsScale)) <= Math.log(1.3)) return false;
    curveSegsScale = cam.scale;
    var changed = false;
    cs.forEach(function (c) {
      if (!c || !c.screen || !c.curve) return;
      var pts = curveScreenPts(c.curve);
      if (pts.length !== c.pts.length) { c.pts = pts; changed = true; }
    });
    if (!changed) return false;
    var old = edgeLines.geometry;
    edgeLines.geometry = buildEdgeGeometry(App.mesh);
    if (old) old.dispose();
    tanRebuild();   // rfHL: tangent circles at the new resolution
    sceneVer++;
    return true;
  }
  // unit outward-or-inward normal of surface S at point x ([x,y,z]), or null where it is undefined (on the axis of a
  // cone / torus without `toward`, a point of the facet whose meridian gives the limit); Kernel.surfNormalAt (rfFE)
  function surfNormal(S, x, toward) { return K.surfNormalAt(S, x, toward); }
  // analyticNormals(mesh) -> Float32Array laid out like mesh.normals (3 per triangle corner); cached on the mesh as
  // mesh.smoothNormals. rfFE: one copy, Kernel.analyticNormals (kernel-curves.js "smooth shading normals"): record
  // facets take their surface's normal, other curved faces (fillets on curved edges, splines, lofts, sweeps, …) are
  // smoothed over their facets with a crease angle, planes stay flat; a worker sends the same numbers with its build
  // (useWorkerNormals). mesh.normals itself stays flat (exports, zebra, picking).
  function analyticNormals(m) {
    if (m.smoothNormals) return m.smoothNormals;
    var an = m === App.mesh && UI.asmNormals ? UI.asmNormals(m) : null;   // r4/asm4: an assembly's, from its parts'
    if (an) return (m.smoothNormals = safeNormals(m, an));
    var out;
    try { out = K.analyticNormals(m); } catch (e) { out = new Float32Array(m.normals); }
    m.smoothNormals = out = safeNormals(m, out);   // lane FO: no corner shades black
    return out;
  }
  function ekey3(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  // Marks seams (e.seam, e.smooth) and chord edges (e.curve = index into the returned list) on bodyEdges' list;
  // -> [{ curve (the Kernel.curveEdges record), pts: [[x,y,z]…] fine polyline, edges: [chord edges] }]
  function annotateCurveEdges(m, edges) {
    if (!K.curveSurfaces || !K.curveEdges || !m.faces || !m.faces.length || !m.faces[0].polys) return [];
    // found by the worker on this same mesh (Kernel.meshCurveInfo; r3/engine3): no curveSurfaces / curveEdges here
    var info = workerCurves(m), faceSurfs, list;
    if (info) {
      if (!info.faceSurfs.some(function (ks) { return ks; })) return [];
      faceSurfs = info.faceSurfs.map(function (ks) { if (!ks) return null; var o = {}; ks.forEach(function (k) { o[k] = 1; }); return o; });
    } else {
      var surfOf = new Map();
      try { K.curveSurfaces(m).forEach(function (s) { s.polys.forEach(function (p) { surfOf.set(p, s.key); }); }); } catch (e) { return []; }
      if (!surfOf.size) return [];
      faceSurfs = m.faces.map(function (f) {
        var ks = null;
        f.polys.forEach(function (p) { var k = surfOf.get(p); if (k) (ks = ks || {})[k] = 1; });
        return ks;
      });
    }
    edges.forEach(function (e) {
      if (e.faces.length !== 2) return;
      var A = faceSurfs[e.faces[0]], B = faceSurfs[e.faces[1]];
      if (!A || !B) return;
      var fa = m.faces[e.faces[0]], fb = m.faces[e.faces[1]];
      if ((fa.body || 0) !== (fb.body || 0) || fa.part !== fb.part) return;   // r10/asmfaces10: a seam is inside one body / part
      for (var k in A) if (B[k]) { e.seam = true; e.smooth = true; return; }
    });
    if (info) list = info.curves;
    else { try { list = K.curveEdges(m); } catch (e2) { return []; } }
    curveSegsScale = cam.scale;
    var curves = list.map(function (c) {
      return { curve: c, pts: curveScreenPts(c), edges: [], screen: true };
    });
    var chordMap = {};
    curves.forEach(function (c, ci) { c.curve.chords.forEach(function (ch) { chordMap[pairKey(ekey3(ch[0]), ekey3(ch[1]))] = ci; }); });
    // pieces of a chord (a face outline split it at a T-junction): both ends on one of the curve's chords
    function onSeg(p, q0, q1, tol) { return K.pointSegmentDistance(p, q0, q1) <= tol; }
    // rfFG: a whole facet chord whose record lists it in pieces (Kernel.curveEdges keeps mesh polygon edges, which a
    // boolean split, e.g. a revolved rim next to a hole), so neither the key nor one piece matches it: the edge is that
    // curve's when both ends lie on the circle, in its plane, it is no longer than the record's longest chord and its
    // middle is inside the arc. It was a lone straight segment, and hovering the rim lit that one segment.
    function onCircle(p, C, tol) { var d = V.sub(p, C.center), h = V.dot(d, C.normal); return Math.abs(h) <= tol && Math.abs(V.len(V.sub(d, V.scale(C.normal, h))) - C.radius) <= tol; }
    function chordOfCircle(e, cv, tol) {
      var C = cv.curve;
      if (cv.maxChord == null) cv.maxChord = C.chords.reduce(function (m, ch) { return Math.max(m, V.len(V.sub(ch[1], ch[0]))); }, 0);
      if (!(e.len <= cv.maxChord * 1.05 + tol) || !onCircle(e.a, C, tol) || !onCircle(e.b, C, tol)) return false;
      if (C.a1 - C.a0 >= 2 * Math.PI - 1e-9) return true;
      var d = V.sub(e.mid, C.center), yd = V.cross(C.normal, C.xdir), a = Math.atan2(V.dot(d, yd), V.dot(d, C.xdir));
      while (a < C.a0 - 1e-9) a += 2 * Math.PI;
      while (a > C.a0 + 2 * Math.PI) a -= 2 * Math.PI;
      return a <= C.a1 + 1e-9;
    }
    edges.forEach(function (e) {
      if (e.seam) return;
      var ci = chordMap[pairKey(e.ka, e.kb)];
      if (ci == null) {
        // only edges next to a curved face can lie on a curve
        if (!e.faces.some(function (fi) { return faceSurfs[fi]; })) return;
        for (var i = 0; i < curves.length && ci == null; i++) {
          var C = curves[i].curve, tol = 1e-4 * Math.max(1, C.radius);
          if (Math.abs(V.dot(V.sub(e.mid, C.center), C.normal)) > tol || V.len(V.sub(e.mid, C.center)) > C.radius + tol) continue;
          for (var j = 0; j < C.chords.length; j++) {
            var ch = C.chords[j];
            if (onSeg(e.a, ch[0], ch[1], tol) && onSeg(e.b, ch[0], ch[1], tol)) { ci = i; break; }
          }
          if (ci == null && chordOfCircle(e, curves[i], tol)) ci = i;
        }
      }
      if (ci == null) return;
      e.curve = ci;
      curves[ci].edges.push(e);
    });
    return curves;
  }
  // An edge is drawn/pickable while at least one of its faces belongs to a visible body.
  function edgeVisible(e) {
    if (!anyHidden()) return true;
    var faces = App.mesh.faces;
    for (var i = 0; i < e.faces.length; i++) if (!faceHidden(faces[e.faces[i]])) return true;
    return false;
  }

  // Face boundary loops (T-junction aware) give clean B-rep style edges instead of triangle-soup edges.
  function buildEdgeGeometry(m) {
    var arr = [];
    edgesFor(m);
    // tangent (smooth) edges between near-coplanar neighbours are hidden, like SolidWorks' default
    var drawCurve = {};
    App.edges.forEach(function (e) {
      if (e.smooth || !edgeVisible(e)) return;
      // a chord of a true circle / arc: the curve is drawn once, finely, instead of its chords
      if (e.curve != null && App.curves && App.curves[e.curve]) { drawCurve[e.curve] = 1; return; }
      arr.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]);
    });
    var chord = arr.slice();
    Object.keys(drawCurve).forEach(function (ci) {
      pushPolyline(arr, App.curves[ci].pts);
      pushPolyline(chord, zt.curveRefined && zt.curveRefined[ci] ? App.curves[ci].pts : curveChordFeet(App.curves[ci]));   // rfHG: its faces reach the circle
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.setAttribute('chord', new THREE.Float32BufferAttribute(chord, 3));   // rfHG: read by the thick-line shader
    return g;
  }
  // rfHG: the radial foot of every point of a true-curve polyline (c.pts) on the facet chord under it (the faces'
  // boundary): where the ray from the centre through the point crosses that chord's line, in the circle's plane (a
  // chord split at a T-junction works piece by piece). A point over no chord is its own foot.
  function curveChordFeet(c) {
    var C = c.curve, pts = c.pts, xd = C.xdir, yd = V.cross(C.normal, C.xdir), TWO = 2 * Math.PI;
    function uv(p) { var d = V.sub(p, C.center); return [V.dot(d, xd), V.dot(d, yd)]; }
    var iv = [];
    (C.chords || []).forEach(function (ch) {
      var p0 = uv(ch[0]), p1 = uv(ch[1]), s = Math.atan2(p0[1], p0[0]), d = Math.atan2(p1[1], p1[0]) - s;
      while (d > Math.PI) d -= TWO;
      while (d < -Math.PI) d += TWO;
      if (d < 0) { s = s + d; d = -d; }
      if (!(d > 1e-9)) return;
      for (var k = -1; k <= 1; k++) iv.push({ s: s + k * TWO, e: s + d + k * TWO, p0: p0, p1: p1 });
    });
    iv.sort(function (u, v) { return u.s - v.s; });
    return pts.map(function (p) {
      if (!iv.length) return p;
      var q = uv(p), a = Math.atan2(q[1], q[0]), lo = 0, hi = iv.length - 1;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (iv[mid].s <= a) lo = mid; else hi = mid - 1; }   // last chord starting at or before a
      for (var j = lo; j >= 0 && j >= lo - 2; j--) {
        var u = iv[j];
        if (a < u.s - 1e-9 || a > u.e + 1e-9) continue;
        var ex = u.p1[0] - u.p0[0], ey = u.p1[1] - u.p0[1], ca = Math.cos(a), sa = Math.sin(a), den = ca * ey - sa * ex;
        if (Math.abs(den) < 1e-12) return p;
        var t = (u.p0[0] * ey - u.p0[1] * ex) / den, r = Math.hypot(q[0], q[1]);   // ray t·(cos a, sin a) meets the chord's line
        if (!(t > 0) || !(r > 0) || t > r * (1 + 1e-9)) return p;
        return V.add(C.center, V.scale(V.sub(p, C.center), t / r));
      }
      return p;
    });
  }

  // ------------------------------------------------------------------ rfHL: tangent edges (display)
  // SolidWorks' Tools ▸ Options ▸ Display ▸ Part/assembly tangent edge display: in Shaded With Edges, Hidden Lines
  // Removed / Visible and Wireframe the edges where two DIFFERENT faces meet tangent (a fillet running onto a flat face,
  // two rounds meeting, a bend onto its flange) are drawn as thin lines ('visible', the default), dashed ('phantom') or
  // not at all ('removed'); View ▸ Display ▸ Tangent Edges … switches it (UI.setTangentEdges), remembered per browser
  // in localStorage 'anvil.tangentEdges' (the ui-smoke page starts at 'removed' and stores nothing, like rfHD's effects,
  // unless UI.tangentEdgesPersistInTest). Never drawn: edges between facets of one face (e.seam: one surface record or
  // one B-rep face), between facets of one freeform face (a loft's or sweep's side on Anvil's kernel: one face group,
  // same feature and no record), and sharp edges (those are model edges). A chord of a true circle draws the circle
  // (with rfHG's chord feet, so the line sits on the faces' boundary and does not poke through the facets).
  var TAN_MODES = ['visible', 'phantom', 'removed'], TAN_KEY = 'anvil.tangentEdges', TAN_W = 1;
  var tanInTest = false;
  try { tanInTest = !!(window.frameElement && /\/tests\//.test(window.parent.location.pathname)); } catch (e) { }
  App.view.tangentEdges = (function () {
    if (tanInTest) return 'removed';
    try { var v = localStorage.getItem(TAN_KEY); if (TAN_MODES.indexOf(v) >= 0) return v; } catch (e) { }
    return 'visible';
  })();
  mats.tanEdge = new THREE.LineBasicMaterial({ color: 0xffffff });
  mats.tanEdge.color = mats.edge.color;   // one colour object: the edge palette (dark on a painted body, light lines otherwise)
  mats.tanPhantom = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1, gapSize: 0.5 });
  mats.tanPhantom.color = mats.edge.color;
  mats.tanPhantom.userData.dashPx = 9; mats.tanPhantom.userData.gapPx = 4;
  lineMat(mats.tanEdge, TAN_W); lineMat(mats.tanPhantom, TAN_W);   // thin, whole device pixels (fat-line twins)
  var tanLines = null;
  // the mesh edges drawn as tangent edges (UI.tangentEdgeList for tests)
  function tangentEdgeList(m) {
    if (!m || !m.faces || !m.faces.length) return [];
    var edges = edgesFor(m), groups = faceGroups(m) || [];
    return edges.filter(function (e) {
      if (!e.smooth || e.seam || e.faces.length !== 2 || !edgeVisible(e)) return false;
      var i = e.faces[0], j = e.faces[1], fa = m.faces[i], fb = m.faces[j];
      if (bodyOfFace(fa) !== bodyOfFace(fb) || fa.part !== fb.part) return false;
      if (groups[i] && groups[i] === groups[j]) return false;   // one face (a curved face's facets, one freeform face)
      var pa = fa.polys && fa.polys[0], pb = fb.polys && fb.polys[0];
      if (!pa || !pb) return false;
      if (pa.face != null && pb.face != null) return pa.face !== pb.face;   // OpenCascade: two B-rep faces
      if (pa.surf || pb.surf) return true;   // a surface record on either side: two true surfaces meet
      return pa.shared !== pb.shared;   // record-less facets: only where two features meet (as drawing-hlr.js)
    });
  }
  function buildTangentGeometry(m) {
    var list = tangentEdgeList(m);
    if (!list.length) return null;
    var arr = [], chord, drawCurve = {}, sharpCurve = {};
    (App.edges || []).forEach(function (e) { if (!e.smooth && e.curve != null) sharpCurve[e.curve] = 1; });
    list.forEach(function (e) {
      if (e.curve != null && App.curves && App.curves[e.curve]) { if (!sharpCurve[e.curve]) drawCurve[e.curve] = 1; return; }
      arr.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]);
    });
    chord = arr.slice();
    Object.keys(drawCurve).forEach(function (ci) {
      pushPolyline(arr, App.curves[ci].pts);
      pushPolyline(chord, zt.curveRefined && zt.curveRefined[ci] ? App.curves[ci].pts : curveChordFeet(App.curves[ci]));
    });
    if (!arr.length) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.setAttribute('chord', new THREE.Float32BufferAttribute(chord, 3));
    return g;
  }
  // (re)make the tangent lines for the mesh on screen; called wherever the model edges are remade
  function tanRebuild() {
    if (tanLines) { groups.edges.remove(tanLines); tanLines.geometry.dispose(); tanLines = null; }
    var mode = App.view.tangentEdges, m = App.mesh;
    if (mode === 'removed' || !m || !m.triCount || !edgeLines) return;
    var g = buildTangentGeometry(m);
    if (!g) return;
    tanLines = new THREE.LineSegments(g, mode === 'phantom' ? mats.tanPhantom : mats.tanEdge);
    if (mode === 'phantom') tanLines.computeLineDistances();
    tanLines.raycast = noRaycast;
    tanLines.userData.tangentEdges = true;
    tanLines.visible = App.view.style !== 'shaded';
    groups.edges.add(tanLines);
  }
  function setTangentEdges(mode) {
    if (TAN_MODES.indexOf(mode) < 0) mode = 'visible';
    App.view.tangentEdges = mode;
    if (!tanInTest || UI.tangentEdgesPersistInTest) { try { localStorage.setItem(TAN_KEY, mode); } catch (e) { } }
    tanRebuild();
    needsRender = true;
    if (UI.requestRender) UI.requestRender();
    return mode;
  }
  var TAN_LABEL = { visible: 'Tangent Edges Visible', phantom: 'Tangent Edges As Phantom', removed: 'Tangent Edges Removed' };
  // View ▸ Display rows (ui-panels.js), as SolidWorks' View ▸ Display menu names them
  function tangentEdgesMenuItems(prefix) {
    return TAN_MODES.map(function (k) {
      return { label: (prefix || '') + TAN_LABEL[k], checked: App.view.tangentEdges === k, action: function () { setTangentEdges(k); if (UI.setStatus) UI.setStatus(TAN_LABEL[k] + '.'); } };
    });
  }

  // ------------------------------------------------------------------ rfHG: zoom tessellation (display only)
  // Round faces stay round at any zoom: when the view has been still for ZT.stillMs after a zoom or pan, every cylinder
  // / cone face on screen whose facets leave more than ZT.needPx of chord error at the current scale (cam.scale = model
  // units per pixel) is drawn from a finer display mesh: each of its triangles split into k × k and every new vertex
  // moved onto the exact surface (radially, keeping its axial coordinate, so a rim stays in its plane). Any other
  // triangle sharing a split edge (the plate round a hole, a cap, a neighbouring face) takes the same points on that
  // edge (a fan), so nothing cracks. One k for the whole refined set (shared circles match), chosen for the worst face;
  // faces are taken largest on screen first, nearest the centre next, until ZT.budget × ZT.level extra triangles. Back
  // to the base mesh when nothing needs it (zoomed out). App.mesh, picking, exports, mass and the edges' topology stay
  // the kernel's: the drawn geometry maps each triangle back (zt.map → renderedTri), highlights are cut from it
  // (ztRangeGeometry), silhouettes of refined faces come from its sub-facets, and their rim lines drop the chord band.
  // rfHY: spheres and tori too (projected along the ray from the centre / tube centre, k from the facets' measured gap). UI.zoomTess: { now, info, setLevel (0 off .. 1; the adaptive governor's
  // hook), setBudget, enabled, deviation() (rfHY: per refined group, drawn vertices and facet middles off the surface, px) }.
  var ZT = { on: true, level: 1, budget: 400000, tolPx: 0.35, needPx: 0.5, maxK: 16, stillMs: 150 };
  function ztKey(x, y, z) { return Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4); }
  function ztSurfKey(S) { function q(x) { return Math.round(x * 1e6); } return S.t + ':' + S.o.map(q) + ':' + S.d.map(q) + ':' + q(S.r) + ':' + q(S.k || 0) + ':' + q(S.R || 0); }
  function ztRadiusAt(S, z) { return Math.abs(S.t === 'cone' ? S.r + (S.k || 0) * z : S.r); }
  // the surface's size (tolerances): a torus' outer radius, else the radius
  function ztSize(S) { return S.t === 'tor' ? Math.abs(S.R || 0) + Math.abs(S.r) : ztRadiusAt(S, 0); }
  // rfHY: the record kinds that are refined (sph / tor: fillet rounds on circular edges, spherical corners, revolved
  // domes and springs' ends; cyl: also every sheet-metal bend)
  function ztKind(S) { return !!(S && S.o && S.d && (S.t === 'cyl' || S.t === 'cone' || S.t === 'sph' || (S.t === 'tor' && S.r > 0))); }
  // p (3 numbers) moved onto S -> [x, y, z]: a cylinder / cone radially at its own axial coordinate (a rim stays in its
  // plane), a sphere along the ray from its centre, a torus along the ray from the tube centre nearest p
  function ztProj(S, x, y, z) {
    var o = S.o, d = S.d, vx = x - o[0], vy = y - o[1], vz = z - o[2], s, l;
    if (S.t === 'sph') {
      l = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (l < 1e-12) return [x, y, z];
      s = Math.abs(S.r) / l;
      return [o[0] + vx * s, o[1] + vy * s, o[2] + vz * s];
    }
    var h = vx * d[0] + vy * d[1] + vz * d[2];
    var rx = vx - d[0] * h, ry = vy - d[1] * h, rz = vz - d[2] * h, rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rl < 1e-12) return [x, y, z];
    if (S.t === 'tor') {
      var cR = (S.R || 0) / rl, cx = o[0] + rx * cR, cy = o[1] + ry * cR, cz = o[2] + rz * cR, wx = x - cx, wy = y - cy, wz = z - cz;
      l = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (l < 1e-12) return [x, y, z];
      s = Math.abs(S.r) / l;
      return [cx + wx * s, cy + wy * s, cz + wz * s];
    }
    s = ztRadiusAt(S, h) / rl;
    return [o[0] + d[0] * h + rx * s, o[1] + d[1] * h + ry * s, o[2] + d[2] * h + rz * s];
  }
  // per mesh, once: which triangles lie on which cylinder / cone, with each group's box, largest radius and the
  // largest angle one of its triangles spans round the axis
  function ztAnalyse(m) {
    var P = m.positions64 || m.positions, triG = new Int32Array(m.triCount).fill(-1), gs = [], byKey = {};
    m.faces.forEach(function (f, fi) {
      var t = f.start;
      f.polys.forEach(function (p) {
        var n = p.vertices.length - 2, S = p.surf && p.surf.s, gi = -1;
        if (ztKind(S) && !p.surf.fc) {
          var key = ztSurfKey(S) + '|' + (f.body || 0);
          gi = byKey[key];
          if (gi == null) { gi = byKey[key] = gs.length; gs.push({ id: gi, S: S, tris: [], faces: {}, box: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], R: 0, theta: 0 }); }
        }
        for (var i = 0; i < n; i++, t++) if (gi >= 0) { triG[t] = gi; gs[gi].tris.push(t); gs[gi].faces[fi] = 1; }
      });
    });
    gs.forEach(function (g) {
      if (g.S.t === 'sph' || g.S.t === 'tor') { ztAnalyseRound(g, P, triG); return; }
      var S = g.S, d = S.d, e1 = Math.abs(d[0]) < 0.9 ? V.norm(V.cross(d, [1, 0, 0])) : V.norm(V.cross(d, [0, 1, 0])), e2 = V.cross(d, e1), keep = [];
      g.tris.forEach(function (t) {
        var a = [], ok = true;
        for (var c = 0; c < 3; c++) {
          var o = t * 9 + c * 3, x = P[o], y = P[o + 1], z = P[o + 2], b = g.box;
          if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
          var v = [x - S.o[0], y - S.o[1], z - S.o[2]], h = V.dot(v, d), R = ztRadiusAt(S, h), rv = V.sub(v, V.scale(d, h));
          if (V.len(rv) < 1e-9 * Math.max(1, R)) { ok = false; break; }   // on the axis (a cone's apex): left as it is
          g.R = Math.max(g.R, R);
          a.push(Math.atan2(V.dot(rv, e2), V.dot(rv, e1)));
        }
        if (!ok) { triG[t] = -1; return; }
        keep.push(t);
        for (var i = 0; i < 3; i++) for (var j = i + 1; j < 3; j++) { var w = Math.abs(a[i] - a[j]); if (w > Math.PI) w = 2 * Math.PI - w; if (w > g.theta) g.theta = w; }
      });
      g.tris = keep;
    });
    return { triG: triG, groups: gs.filter(function (g) { return g.tris.length && g.R > 0; }) };
  }
  // rfHY: a sphere / torus group: box, size, and the largest gap between its facets and the surface (sag: edge middles
  // and centroids projected onto the record), which sets k (the gap shrinks as 1 / k²)
  function ztAnalyseRound(g, P, triG) {
    var S = g.S, keep = [];
    g.R = ztSize(S); g.sag = 0;
    g.tris.forEach(function (t) {
      var C = [], ok = true;
      for (var c = 0; c < 3; c++) {
        var o = t * 9 + c * 3, x = P[o], y = P[o + 1], z = P[o + 2], b = g.box;
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
        var q = ztProj(S, x, y, z);
        if (Math.abs(q[0] - x) + Math.abs(q[1] - y) + Math.abs(q[2] - z) > 1e-4 * Math.max(1, g.R)) { ok = false; break; }   // a corner off the record: left as it is
        C.push([x, y, z]);
      }
      if (!ok) { triG[t] = -1; return; }
      keep.push(t);
      var M = [V.scale(V.add(C[0], C[1]), 0.5), V.scale(V.add(C[1], C[2]), 0.5), V.scale(V.add(C[2], C[0]), 0.5), V.scale(V.add(V.add(C[0], C[1]), C[2]), 1 / 3)];
      M.forEach(function (m) { var q = ztProj(S, m[0], m[1], m[2]), e = V.len(V.sub(q, m)); if (e > g.sag) g.sag = e; });
    });
    g.tris = keep;
  }
  function ztEligible() {
    var m = App.mesh;
    return ZT.on && ZT.level > 0 && !!bodyMesh && !!m && m.triCount > 0 && !!m.faces && !!(m.faces[0] && m.faces[0].polys) &&
      !(App.build && App.build.assembly) && !flatShown() && App.view.style !== 'wireframe';
  }
  // -> { k, groups, key } (groups empty: the base mesh is enough)
  function ztPlan() {
    if (!ztEligible()) return { k: 1, groups: [], key: '' };
    var m = App.mesh, A = m._zt || (m._zt = ztAnalyse(m)), s = cam.scale, tol = ZT.tolPx * s, need = ZT.needPx * s;
    var budget = ZT.budget * Math.max(0, Math.min(1, ZT.level)), cands = [], cx = size.w / 2, cy = size.h / 2;
    A.groups.forEach(function (g) {
      var sag = g.sag != null ? g.sag : g.R * (1 - Math.cos(g.theta / 2));
      if (sag <= need) return;
      var b = g.box, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var c = 0; c < 8; c++) { var q = worldToScreen([c & 1 ? b[3] : b[0], c & 2 ? b[4] : b[1], c & 4 ? b[5] : b[2]]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      var w = Math.min(x1, size.w) - Math.max(x0, 0), h = Math.min(y1, size.h) - Math.max(y0, 0);
      if (!(w > 0 && h > 0)) return;   // off screen
      var step = 2 * Math.acos(Math.max(-1, 1 - tol / g.R)), k = Math.min(ZT.maxK, Math.max(2, g.sag != null ? Math.ceil(Math.sqrt(g.sag / tol) - 1e-9) : Math.ceil(g.theta / step - 1e-9)));
      cands.push({ g: g, k: k, area: w * h, dist: Math.hypot((x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy) });
    });
    cands.sort(function (a, b) { return b.area - a.area || a.dist - b.dist; });
    var sel = [], kG = 1, n = 0;
    for (var i = 0; i < cands.length; i++) {
      var kN = Math.max(kG, cands[i].k), nN = n + cands[i].g.tris.length;
      if (nN * (kN * kN - 1) > budget) break;
      sel.push(cands[i].g); kG = kN; n = nN;
    }
    sel.sort(function (a, b) { return a.id - b.id; });
    return { k: kG, groups: sel, key: sel.length ? kG + '|' + sel.map(function (g) { return g.id; }).join(',') : '' };
  }
  // the display geometry for a plan -> { geom, map, start (base triangle -> first display triangle, triCount + 1),
  // edges (split base edges), sil (LineSegments of the refined faces' sub-facet seams), faceSet }
  function ztBuild(plan) {
    var m = App.mesh, A = m._zt, P = m.positions64 || m.positions, SN = analyticNormals(m), FN = m.normals, k = plan.k, hid = App.triHidden;
    var on = {}, faceSet = {};
    plan.groups.forEach(function (g) { on[g.id] = g; Object.keys(g.faces).forEach(function (fi) { faceSet[fi] = 1; }); });
    function corner(t, c) { var o = t * 9 + c * 3; return [P[o], P[o + 1], P[o + 2]]; }
    function ck(p) { return ztKey(p[0], p[1], p[2]); }
    // rfHY: a refined triangle's corners go onto its surface too (one place per vertex, shared by every triangle that
    // uses it): a boolean leaves T-junction corners on a neighbour's chord (a wall's facet ending on a fillet's tangent
    // ring sat up to the chord's sagitta inside the circle: a notch tens of pixels deep zoomed in); a corner already on
    // the surface does not move
    var moved = new Map();
    function snap(p, S) {
      var key = ck(p), q = moved.get(key);
      if (q) return q;
      q = ztProj(S, p[0], p[1], p[2]);
      if (!(isFinite(q[0]) && isFinite(q[1]) && isFinite(q[2]))) q = p;
      moved.set(key, q);
      return q;
    }
    // 1. split edges of the refined triangles: base edge key -> { a (key of the end the points start from), pts }
    var edges = new Map(), redges = [];
    plan.groups.forEach(function (g) {
      g.tris.forEach(function (t) {
        if (hid && hid[t]) return;
        for (var e = 0; e < 3; e++) {
          var p = corner(t, e), q = corner(t, (e + 1) % 3), kp = ck(p), kq = ck(q), key = kp < kq ? kp + '|' + kq : kq + '|' + kp;
          if (edges.has(key)) continue;
          var a = kp < kq ? p : q, b = kp < kq ? q : p, pts = [];
          for (var i = 0; i <= k; i++) { var u = i / k; pts.push(i === 0 ? snap(a, g.S) : i === k ? snap(b, g.S) : ztProj(g.S, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)); }
          var en = { a: kp < kq ? kp : kq, pa: a, pb: b, pts: pts, g: g.id, S: g.S };
          edges.set(key, en); redges.push(en);
        }
      });
    });
    // the booleans leave T-junctions: a neighbour's side may be a PIECE of a refined edge (a plate round a hole is cut
    // into fragments whose sides end part-way along the hole's chords). A grid over the refined edges finds the edge a
    // point lies on; such a point is moved onto the surface for every triangle that uses it (no crack), and a piece takes
    // the edge's points between its ends.
    var cell = 0, egrid = new Map(), eps = 0;
    redges.forEach(function (e) { cell = Math.max(cell, V.len(V.sub(e.pb, e.pa))); eps = Math.max(eps, ztSize(e.S)); });
    cell = cell || 1; eps = 2e-6 * Math.max(1, eps);
    function cellKey(x, y, z) { return Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell); }
    redges.forEach(function (e, ei) {
      var x0 = Math.floor(Math.min(e.pa[0], e.pb[0]) / cell), x1 = Math.floor(Math.max(e.pa[0], e.pb[0]) / cell), y0 = Math.floor(Math.min(e.pa[1], e.pb[1]) / cell), y1 = Math.floor(Math.max(e.pa[1], e.pb[1]) / cell), z0 = Math.floor(Math.min(e.pa[2], e.pb[2]) / cell), z1 = Math.floor(Math.max(e.pa[2], e.pb[2]) / cell);
      for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) { var ck2 = x + ',' + y + ',' + z, L = egrid.get(ck2); if (!L) egrid.set(ck2, L = []); L.push(ei); }
    });
    // -> [{ e, t }] the refined edges point p lies on (t: its parameter from e.pa)
    function onEdges(p) {
      var L = egrid.get(cellKey(p[0], p[1], p[2])), out = [];
      if (!L) return out;
      for (var i = 0; i < L.length; i++) {
        var e = redges[L[i]], ab = V.sub(e.pb, e.pa), l2 = V.dot(ab, ab);
        if (!(l2 > 0)) continue;
        var t = V.dot(V.sub(p, e.pa), ab) / l2;
        if (t < -1e-9 || t > 1 + 1e-9) continue;
        if (V.len(V.sub(p, V.add(e.pa, V.scale(ab, t)))) <= eps) out.push({ e: e, t: t });
      }
      return out;
    }
    var zbox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    plan.groups.forEach(function (g) { for (var i = 0; i < 3; i++) { zbox[i] = Math.min(zbox[i], g.box[i] - eps); zbox[i + 3] = Math.max(zbox[i + 3], g.box[i + 3] + eps); } });
    function inZbox(p) { return p[0] >= zbox[0] && p[0] <= zbox[3] && p[1] >= zbox[1] && p[1] <= zbox[4] && p[2] >= zbox[2] && p[2] <= zbox[5]; }
    function place(p) {
      var key = ck(p), q = moved.get(key);
      if (q !== undefined) return q || p;
      var on = onEdges(p);
      q = on.length ? ztProj(on[0].e.S, p[0], p[1], p[2]) : null;
      moved.set(key, q);
      return q || p;
    }
    // the refined edges' points strictly inside side p -> q, ordered from p: the side may be a piece of a refined edge
    // or run along one or more of them (a BSP cut along a hole's facet plane makes plate edges that pass through the
    // hole's vertices); [] when none
    function along(p, q) {
      var pq = V.sub(q, p), l2 = V.dot(pq, pq), L = Math.sqrt(l2), seen = new Set(), out = [];
      if (!(l2 > 0)) return out;
      var steps = Math.min(4096, Math.ceil(L / cell) * 2 + 1);
      for (var s = 0; s <= steps; s++) {
        var x = V.add(p, V.scale(pq, s / steps));
        if (!inZbox(x)) continue;
        var C = egrid.get(cellKey(x[0], x[1], x[2]));
        if (!C) continue;
        for (var i = 0; i < C.length; i++) {
          if (seen.has(C[i])) continue;
          seen.add(C[i]);
          var e = redges[C[i]], ta = V.dot(V.sub(e.pa, p), pq) / l2, tb = V.dot(V.sub(e.pb, p), pq) / l2;
          if (Math.max(ta, tb) < 1e-9 || Math.min(ta, tb) > 1 - 1e-9) continue;
          if (V.len(V.sub(e.pa, V.add(p, V.scale(pq, ta)))) > eps || V.len(V.sub(e.pb, V.add(p, V.scale(pq, tb)))) > eps) continue;   // not along pq
          for (var j = 0; j <= k; j++) { var u = ta + (tb - ta) * j / k; if (u > 1e-9 && u < 1 - 1e-9) out.push({ u: u, p: e.pts[j] }); }
        }
      }
      out.sort(function (a, b) { return a.u - b.u; });
      var res = [];
      for (var r = 0; r < out.length; r++) if (!r || out[r].u - out[r - 1].u > 1e-9) res.push(out[r].p);
      return res;
    }
    var pos = [], nor = [], map = [], start = new Int32Array(m.triCount + 1), sil = [], s1 = [], s2 = [], subEdge = new Map(), fans = 0;
    function emit(t, a, b, c, na, nb, nc) {
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
      map.push(t);
    }
    function nrm(t, c) { var o = t * 9 + c * 3; return [SN[o], SN[o + 1], SN[o + 2]]; }
    function flat(t) { var o = t * 9; return [FN[o], FN[o + 1], FN[o + 2]]; }
    function triN(a, b, c) { return V.norm(V.cross(V.sub(b, a), V.sub(c, a))); }
    // rfHJ: a sub-facet pair of a bore (normals toward the axis: concave) is never an outline (buildSilhouettes)
    function concaveOn(S, p, n1, n2) {
      if (S.t === 'sph' || S.t === 'tor') { var sn = K.surfNormalAt(S, p); return !!sn && V.dot(V.add(n1, n2), sn) < 0; }   // rfHY: toward the centre / tube centre
      var o = S.o, d = S.d, vx = p[0] - o[0], vy = p[1] - o[1], vz = p[2] - o[2], h = vx * d[0] + vy * d[1] + vz * d[2];
      return (n1[0] + n2[0]) * (vx - d[0] * h) + (n1[1] + n2[1]) * (vy - d[1] * h) + (n1[2] + n2[2]) * (vz - d[2] * h) < 0;
    }
    function silPair(a, b, n1, n2, S) { if (V.dot(n1, n2) > 0.999999 || (S && S.o && S.d && concaveOn(S, a, n1, n2))) return; sil.push(a[0], a[1], a[2], b[0], b[1], b[2]); s1.push(n1[0], n1[1], n1[2], n1[0], n1[1], n1[2]); s2.push(n2[0], n2[1], n2[2], n2[0], n2[1], n2[2]); }
    for (var t = 0; t < m.triCount; t++) {
      start[t] = map.length;
      if (hid && hid[t]) continue;
      var gi = A.triG[t], G = gi >= 0 ? on[gi] : null, C0 = corner(t, 0), C1 = corner(t, 1), C2 = corner(t, 2);
      if (G) {
        // k × k: grid point (i, j) = C0 + (C1 − C0) i/k + (C2 − C0) j/k on the surface; normals from the surface, on the facet's side
        var S = G.S, fl = flat(t), grid = [], gn = [], idx = function (i, j) { return i * (k + 1) - (i * (i - 1)) / 2 + j; };
        for (var i = 0; i <= k; i++) for (var j = 0; j <= k - i; j++) {
          var u = i / k, v = j / k, p = (i === 0 && j === 0) ? snap(C0, S) : (i === k) ? snap(C1, S) : (j === k) ? snap(C2, S) : ztProj(S, C0[0] + (C1[0] - C0[0]) * u + (C2[0] - C0[0]) * v, C0[1] + (C1[1] - C0[1]) * u + (C2[1] - C0[1]) * v, C0[2] + (C1[2] - C0[2]) * u + (C2[2] - C0[2]) * v);
          var n = K.surfNormalAt(S, p, C0) || fl;
          if (V.dot(n, fl) < 0) n = [-n[0], -n[1], -n[2]];
          grid[idx(i, j)] = p; gn[idx(i, j)] = n;
        }
        var upN = {};
        for (i = 0; i < k; i++) for (j = 0; j < k - i; j++) {
          var a0 = idx(i, j), a1 = idx(i + 1, j), a2 = idx(i, j + 1);
          emit(t, grid[a0], grid[a1], grid[a2], gn[a0], gn[a1], gn[a2]);
          upN[i + ',' + j] = triN(grid[a0], grid[a1], grid[a2]);
        }
        for (i = 0; i < k; i++) for (j = 0; j < k - i; j++) {
          var nU = upN[i + ',' + j];
          if (i + j < k - 1) {
            var b0 = idx(i + 1, j), b1 = idx(i + 1, j + 1), b2 = idx(i, j + 1);
            emit(t, grid[b0], grid[b1], grid[b2], gn[b0], gn[b1], gn[b2]);
            var nD = triN(grid[b0], grid[b1], grid[b2]);
            silPair(grid[b2], grid[b0], nU, nD, S);                        // shared with up (i, j)
            silPair(grid[b0], grid[b1], upN[(i + 1) + ',' + j], nD, S);    // with up (i + 1, j)
            silPair(grid[b1], grid[b2], upN[i + ',' + (j + 1)], nD, S);    // with up (i, j + 1)
          }
          // sub-edges on the base triangle's sides pair with the neighbouring refined triangle's
          var side = [];
          if (j === 0) side.push([0, i, grid[idx(i, j)], grid[idx(i + 1, j)]]);
          if (i + j === k - 1) side.push([1, j, grid[idx(i + 1, j)], grid[idx(i, j + 1)]]);
          if (i === 0) side.push([2, k - 1 - j, grid[idx(0, j + 1)], grid[idx(0, j)]]);
          side.forEach(function (sd) {
            var cA = [C0, C1, C2][sd[0]], cB = [C0, C1, C2][(sd[0] + 1) % 3], kA = ck(cA), kB = ck(cB);
            var key = (kA < kB ? kA + '|' + kB + '#' + sd[1] : kB + '|' + kA + '#' + (k - 1 - sd[1]));
            var prev = subEdge.get(key);
            if (prev) { if (prev.g === G.id) silPair(sd[2], sd[3], prev.n, nU, S); subEdge.delete(key); }
            else subEdge.set(key, { g: G.id, n: nU });
          });
        }
        continue;
      }
      // a triangle beside a refined face: corners on a refined edge move onto the surface, split sides (whole edges or
      // pieces) take the same points, fanned
      var orig = [C0, C1, C2], ns = [nrm(t, 0), nrm(t, 1), nrm(t, 2)], split = [], nSplit = 0;
      var near = redges.length > 0;   // the triangle's box meets the refined faces' box
      for (var ax = 0; ax < 3 && near; ax++) if (Math.max(C0[ax], C1[ax], C2[ax]) < zbox[ax] || Math.min(C0[ax], C1[ax], C2[ax]) > zbox[ax + 3]) near = false;
      var cs = near ? orig.map(place) : orig;
      for (var e = 0; e < 3; e++) {
        var sp = null;
        if (near) {
          var p0 = orig[e], p1 = orig[(e + 1) % 3], k0 = ck(p0), k1 = ck(p1), en = edges.get(k0 < k1 ? k0 + '|' + k1 : k1 + '|' + k0);
          if (en) sp = (en.a === k0 ? en.pts : en.pts.slice().reverse()).slice(1, -1);
          else sp = along(p0, p1);
        }
        if (sp && sp.length) { split.push(sp); nSplit++; } else split.push([]);
      }
      if (!nSplit) { emit(t, cs[0], cs[1], cs[2], ns[0], ns[1], ns[2]); continue; }
      C0 = cs[0]; C1 = cs[1]; C2 = cs[2];
      fans++;
      function lerpN(na, nb, u) { return V.norm([na[0] + (nb[0] - na[0]) * u, na[1] + (nb[1] - na[1]) * u, na[2] + (nb[2] - na[2]) * u]); }
      var ring = [], rn = [];
      for (e = 0; e < 3; e++) {
        ring.push(cs[e]); rn.push(ns[e]);
        var sp = split[e], L = sp.length;
        for (var q = 0; q < L; q++) { ring.push(sp[q]); rn.push(lerpN(ns[e], ns[(e + 1) % 3], (q + 1) / (L + 1))); }
      }
      if (nSplit === 1) {
        var se = split[0].length ? 0 : split[1].length ? 1 : 2, oc = (se + 2) % 3, seq = [cs[se]].concat(split[se], [cs[(se + 1) % 3]]), sqn = [ns[se]];
        for (q = 0; q < split[se].length; q++) sqn.push(lerpN(ns[se], ns[(se + 1) % 3], (q + 1) / (split[se].length + 1)));
        sqn.push(ns[(se + 1) % 3]);
        for (q = 0; q + 1 < seq.length; q++) emit(t, seq[q], seq[q + 1], cs[oc], sqn[q], sqn[q + 1], ns[oc]);
      } else {
        var cen = [(C0[0] + C1[0] + C2[0]) / 3, (C0[1] + C1[1] + C2[1]) / 3, (C0[2] + C1[2] + C2[2]) / 3], cn = V.norm(V.add(V.add(ns[0], ns[1]), ns[2]));
        for (q = 0; q < ring.length; q++) emit(t, ring[q], ring[(q + 1) % ring.length], cen, rn[q], rn[(q + 1) % ring.length], cn);
      }
    }
    start[m.triCount] = map.length;
    var g = new THREE.BufferGeometry(), base = zt.base || bodyMesh.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    var mapA = new Int32Array(map);
    // any per-vertex body data (body colours, RealView appearances) from the base triangle's first corner
    Object.keys(base.attributes).forEach(function (name) {
      if (name === 'position' || name === 'normal') return;
      var src = base.attributes[name], isz = src.itemSize, out = new Float32Array(mapA.length * 3 * isz);
      for (var d = 0; d < mapA.length; d++) for (var c = 0; c < 3; c++) for (var w = 0; w < isz; w++) out[(d * 3 + c) * isz + w] = src.array[mapA[d] * 3 * isz + w];
      g.setAttribute(name, new THREE.BufferAttribute(out, isz));
    });
    if (base.__rvKey) g.__rvKey = base.__rvKey;
    var silObj = null;
    if (sil.length) {
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sil, 3));
      sg.setAttribute('n1', new THREE.Float32BufferAttribute(s1, 3));
      sg.setAttribute('n2', new THREE.Float32BufferAttribute(s2, 3));
      silObj = new THREE.LineSegments(sg, silMat);
      silObj.frustumCulled = false;
      silObj.userData.silhouette = true;
      silObj.userData.zoomTess = true;
    }
    // a curve whose chords (or chord pieces) all lie on refined edges: its faces reach the true circle, the edge line
    // needs no chord band
    var curveRefined = {};
    (App.curves || []).forEach(function (c, ci) {
      var ch = c && c.curve && c.curve.chords;
      if (ch && ch.length && ch.every(function (q) { return onEdges(q[0]).some(function (h) { return onEdges(q[1]).some(function (h2) { return h2.e === h.e; }); }); })) curveRefined[ci] = 1;
    });
    return { geom: g, map: mapA, start: start, edges: edges, sil: silObj, faceSet: faceSet, fans: fans, curveRefined: curveRefined };
  }
  // rebuild the drawn edges and silhouettes for the geometry now on the body (after a swap either way)
  function ztRedrawLines() {
    if (!edgeLines) return;
    var old = edgeLines.geometry;
    edgeLines.geometry = buildEdgeGeometry(App.mesh);
    if (old) old.dispose();
    tanRebuild();   // rfHL
    if (silLines) { groups.edges.remove(silLines); silLines.geometry.dispose(); silLines = null; }
    silLines = buildSilhouettes(App.mesh);
    if (silLines) groups.edges.add(silLines);
    var s = App.view.style;
    if (silLines) silLines.visible = s !== 'shaded';
    if (zt.sil) zt.sil.visible = s !== 'shaded';
  }
  function ztSwap(plan, built) {
    if (!zt.base) zt.base = bodyMesh.geometry;
    else if (zt.disp) zt.disp.dispose();
    if (zt.sil) { groups.edges.remove(zt.sil); zt.sil.geometry.dispose(); }
    zt.disp = built.geom; zt.map = built.map; zt.start = built.start; zt.faceSet = built.faceSet; zt.key = plan.key; zt.sil = built.sil; zt.groups = plan.groups;
    bodyMesh.geometry = built.geom;
    if (crackFill) crackFill.geometry = built.geom;
    zt.curveRefined = built.curveRefined;
    if (zt.sil) groups.edges.add(zt.sil);
    ztRedrawLines();
    zt.info = { k: plan.k, faces: plan.groups.length, baseTris: App.mesh.triCount, tris: built.map.length, fanned: built.fans, curves: Object.keys(zt.curveRefined).length };
    ztAfterSwap();
  }
  function ztAfterSwap() {
    pickMemo.key = null;
    sceneVer++;
    needsRender = true;
    try { updateHighlights(); } catch (e) { }
  }
  // back to the kernel's mesh (zoomed out, a style change, a new body)
  function ztRestore() {
    if (!zt.base) return false;
    if (bodyMesh) { bodyMesh.geometry = zt.base; if (crackFill) crackFill.geometry = zt.base; }
    if (zt.disp) zt.disp.dispose();
    if (zt.sil) { groups.edges.remove(zt.sil); zt.sil.geometry.dispose(); }
    zt.base = zt.disp = zt.map = zt.start = zt.faceSet = zt.curveRefined = zt.sil = null; zt.key = null; zt.doneKey = null;
    zt.info = App.mesh ? { k: 1, faces: 0, baseTris: App.mesh.triCount, tris: App.mesh.triCount } : null;
    ztRedrawLines();
    ztAfterSwap();
    return true;
  }
  function ztDrop() {
    if (zt.base && zt.base !== (bodyMesh && bodyMesh.geometry)) zt.base.dispose();
    zt.base = zt.disp = zt.map = zt.start = zt.faceSet = zt.curveRefined = zt.sil = null; zt.key = null; zt.doneKey = null; zt.info = null;
  }
  // re-plan for the view now: refine, change the refined set, or go back to the base mesh -> zt.info
  function ztUpdate() {
    var plan = ztPlan();
    if (!plan.groups.length) {
      ztRestore();
      var n = App.mesh ? App.mesh.triCount : 0;
      return (zt.info = { k: 1, faces: 0, baseTris: n, tris: n });
    }
    if (plan.key === zt.key && zt.base) return zt.info;
    var t0 = performance.now(), built = ztBuild(plan);
    ztSwap(plan, built);
    zt.info.ms = Math.round(performance.now() - t0);
    return zt.info;
  }
  // highlights cut from the display geometry: base triangle ranges -> their display triangles
  function ztRangeGeometry(ranges) {
    var src = zt.disp.attributes.position.array, total = 0;
    ranges.forEach(function (r) { total += zt.start[r[0] + r[1]] - zt.start[r[0]]; });
    var pos = new Float32Array(total * 9), o = 0;
    ranges.forEach(function (r) { var a = zt.start[r[0]], b = zt.start[r[0] + r[1]]; pos.set(src.subarray(a * 9, b * 9), o); o += (b - a) * 9; });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }
  // the still-view check: a cheap comparison every 100 ms, the work only once the view has rested ZT.stillMs
  function ztCamKey() { return [cam.scale, cam.target.x, cam.target.y, cam.target.z, cam.dir.x, cam.dir.y, cam.dir.z, size.w, size.h, App.view.style].join(','); }
  var ztMeshIds = 0;
  function ztTick() {
    try {
      if (!ZT.on || !App.mesh) return;
      if (!(ZT.level > 0)) { if (zt.base) ztRestore(); return; }
      var key = ztCamKey(), now = performance.now();
      if (key !== zt.camKey) { zt.camKey = key; zt.camAt = now; return; }
      if (now - zt.camAt < ZT.stillMs || App.rebuilding || viewAnimating()) return;
      var m = App.mesh, done = key + '|' + (m._ztId || (m._ztId = ++ztMeshIds)) + '|' + ZT.level + '|' + ZT.budget + '|' + (bodyMesh ? bodyMesh.id : 0);
      if (zt.doneKey === done) return;
      zt.doneKey = done;
      ztUpdate();
    } catch (e) { console.warn('Zoom tessellation turned off:', e); ZT.on = false; try { ztRestore(); } catch (e2) { } }
  }
  setInterval(ztTick, 100);
  // UI.zoomTess: now() re-plans for the view at once (tests) -> info; info() -> { k, faces, baseTris, tris, ms } | null;
  // setLevel(0..1) scales the triangle budget (0 = off: the base mesh), for the adaptive quality governor;
  // setBudget(n) extra triangles at level 1; enabled(on?) switches the whole thing
  var zoomTessApi = {
    now: function () { finishViewAnimation(); zt.doneKey = null; return ztEligible() || zt.base ? ztUpdate() : null; },
    info: function () { return zt.info ? Object.assign({ level: ZT.level, budget: ZT.budget }, zt.info) : null; },
    setLevel: function (x) { ZT.level = Math.max(0, Math.min(1, +x || 0)); zt.doneKey = null; return ZT.level; },
    level: function () { return ZT.level; },
    setBudget: function (n) { ZT.budget = Math.max(0, +n || 0); zt.doneKey = null; return ZT.budget; },
    enabled: function (on) { if (on != null) { ZT.on = !!on; zt.doneKey = null; if (!ZT.on) ztRestore(); } return ZT.on; },
    options: ZT,
    // rfHY: per refined record group of the drawn display mesh -> [{ t, faces, tris, vertPx (largest distance of a drawn
    // vertex from the exact surface), sagPx (largest gap between a drawn triangle's edge middles / centroid and the
    // surface) }], in pixels at the current zoom; [] on the base mesh
    deviation: function () {
      if (!zt.disp || !zt.map || !zt.groups || !App.mesh || !App.mesh._zt) return [];
      var A = App.mesh._zt, P = zt.disp.attributes.position.array, s = cam.scale, out = {}, on = {};
      zt.groups.forEach(function (g) { on[g.id] = out[g.id] = { t: g.S.t, faces: Object.keys(g.faces).map(Number), tris: 0, vertPx: 0, sagPx: 0 }; });
      for (var d = 0; d < zt.map.length; d++) {
        var gi = A.triG[zt.map[d]], r = gi >= 0 ? on[gi] : null;
        if (!r) continue;
        var S = zt.groups.filter(function (g) { return g.id === gi; })[0].S, C = [];
        for (var c = 0; c < 3; c++) { var o = d * 9 + c * 3; C.push([P[o], P[o + 1], P[o + 2]]); }
        r.tris++;
        var M = [C[0], C[1], C[2], V.scale(V.add(C[0], C[1]), 0.5), V.scale(V.add(C[1], C[2]), 0.5), V.scale(V.add(C[2], C[0]), 0.5), V.scale(V.add(V.add(C[0], C[1]), C[2]), 1 / 3)];
        for (var i = 0; i < M.length; i++) {
          var q = ztProj(S, M[i][0], M[i][1], M[i][2]), e = V.len(V.sub(q, M[i])) / s;
          if (i < 3) { if (e > r.vertPx) r.vertPx = e; } else if (e > r.sagPx) r.sagPx = e;
        }
      }
      return Object.keys(out).map(function (k) { return out[k]; });
    }
  };

  // UI.setBodyHidden(index, hidden): viewport-only; rebuilds the drawn geometry from the visible faces.
  function setBodyHidden(index, hidden) {
    index = +index;
    if (!(index >= 0 && index < Math.max(1, bodyCount()))) return false;
    if (hidden) App.hiddenBodies[index] = true; else delete App.hiddenBodies[index];
    pruneHiddenBodies();
    updateBodyMesh();
    if (App.hover && (App.hover.kind === 'face' || App.hover.kind === 'edge' || App.hover.kind === 'body')) App.hover = null;
    updateHighlights();
    if (UI.refreshTree) UI.refreshTree();
    if (App.model) render();
    return isBodyHidden(index);
  }
  // UI.selectBody(index): select a whole body (every face tagged with that index) and report it in the status bar.
  function selectBody(index) {
    index = +index;
    if (!(index >= 0 && index < Math.max(1, bodyCount()))) return null;
    // rfHT: a command with a body selection box (Delete/Keep Body) takes the pick instead
    if (App.command && App.command.onBodyPick && App.command.onBodyPick(index) !== false) return null;
    App.sel = { kind: 'body', index: index }; App.sel2 = null;
    updateHighlights();
    if (UI.refreshTree) UI.refreshTree();
    if (UI.onSelectionChanged) UI.onSelectionChanged();
    if (UI.setStatus) {
      var info = bodyInfo()[index], name = info && info.name ? info.name : 'Body' + (index + 1);
      var vol = info && info.volume != null ? info.volume : (bodyCount() <= 1 && App.mesh ? K.massProps(App.mesh).volume : null);
      var unit = UI.unitLabel ? UI.unitLabel() : unitLabel();
      UI.setStatus(vol != null ? name + ': volume ' + fmtNum(vol, 3) + ' ' + unit + '³' : name);
    }
    return App.sel;
  }

  // rfBU: the colour a part is shown in (Materials.displayColor: none or the old bluish default -> the neutral grey)
  function partColor(c) { return window.Materials && Materials.displayColor ? Materials.displayColor(c) : (c || '#8c8c8c'); }
  function applyDisplayStyle() {
    ztRestore();   // rfHG: per-vertex body data (colours, RealView appearances) is written on the kernel mesh's geometry
    var s = App.view.style;
    if (bodyMesh) { bodyMesh.visible = s !== 'wireframe'; bodyMesh.material = s === 'hlr' || s === 'hlv' ? mats.hlr : mats.part; }   // r13/lines13: hlv = Hidden Lines Visible
    if (edgeLines) edgeLines.visible = s !== 'shaded';
    if (silLines) silLines.visible = s !== 'shaded';
    if (tanLines) tanLines.visible = s !== 'shaded';   // rfHL
    mats.part.color.set(partColor(App.model.color));
    applyBodyColors();
    applyLinePalette();   // r14/viewui14: edges dark on a painted body, light on a dark background otherwise
    var planes = App.view.section ? [App.view.section.plane] : [];
    needsRender = true;
    [mats.part, mats.hlr, mats.edge, mats.hover, mats.sel, silMat].forEach(function (mm) { mm.clippingPlanes = planes; mm.needsUpdate = true; });
    [mats.tanEdge, mats.tanPhantom].forEach(function (mm) { mm.clippingPlanes = planes; mm.needsUpdate = true; });   // rfHL
    syncCrackFill();   // lane FO
    rvApply();         // rfHC: RealView materials on the body, filler and flat pattern
    updateSectionCaps();
  }

  // Per-body colours: UI.bodyColors() (ui-materials.js) gives one CSS colour per body when bodies differ (a body with its
  // own material, or each component's part material in an assembly); the body mesh then gets a colour attribute and the
  // part material uses vertex colours. null keeps the single part colour.
  function applyBodyColors() {
    var cols = null;
    try { cols = UI.bodyColors ? UI.bodyColors() : null; } catch (e) { cols = null; }
    var g = bodyMesh && bodyMesh.geometry, m = App.mesh;
    if (!cols || !g || !m || !m.triCount) {
      if (mats.part.vertexColors) mats.part.vertexColors = false;
      if (g && g.getAttribute('color')) { g.deleteAttribute('color'); g.__colorKey = null; }
      return;
    }
    var key = cols.join(',');
    if (!(g.getAttribute('color') && g.__colorKey === key)) {
      var arr = new Float32Array(m.triCount * 9), c = new THREE.Color();
      m.faces.forEach(function (f) {
        c.set(cols[f.body || 0] || partColor(App.model.color));
        for (var o = f.start * 9; o < (f.start + f.count) * 9; o += 3) { arr[o] = c.r; arr[o + 1] = c.g; arr[o + 2] = c.b; }
      });
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.__colorKey = key;
    }
    mats.part.color.set('#ffffff');
    mats.part.vertexColors = true;
  }

  // ------------------------------------------------------------------ assemblies
  // An assembly document (Assembly.isAssembly: model.type === 'assembly') builds one body per component, in
  // model.components order, so the body helpers above work per component: face.body is the component index.
  function isAssembly() { return !!(App.model && App.model.type === 'assembly'); }
  // UI.componentIndex(idOrName) -> index in model.components (= body index), or -1.
  function componentIndex(id) {
    if (!isAssembly()) return -1;
    var cs = App.model.components || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id || (typeof id === 'string' && (cs[i].name === id || String(cs[i].id) === id))) return i;
    return -1;
  }
  // UI.selectComponent(idOrName): select that component's body; status 'Pin<1>: volume …'.
  function selectComponent(id) {
    var i = componentIndex(id);
    return i < 0 ? null : selectBody(i);
  }

  // ------------------------------------------------------------------ highlights
  function faceAtTriangle(tri) {
    var faces = App.mesh.faces, lo = 0, hi = faces.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, f = faces[mid];
      if (tri < f.start) hi = mid - 1; else if (tri >= f.start + f.count) lo = mid + 1; else return mid;
    }
    return -1;
  }
  function triRangeGeometry(ranges) {
    if (zt.map) return ztRangeGeometry(ranges);   // rfHG: highlights follow the zoom display mesh
    var total = 0;
    ranges.forEach(function (r) { total += r[1]; });
    var pos = new Float32Array(total * 9), o = 0, src = App.mesh.positions;
    ranges.forEach(function (r) { pos.set(src.subarray(r[0] * 9, (r[0] + r[1]) * 9), o); o += r[1] * 9; });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }
  // Whole curved faces: the kernel keeps each facet of a cylinder, cone, sphere or torus as its own mesh face (shell,
  // fillets and drawings rely on that), but the user picks, hovers and selects the whole surface as in SolidWorks.
  // faceGroup(i) -> the indices of every mesh face on the same analytic surface, in the same body, and connected to
  // face i (a shaft cut by a groove stays two faces); a planar face is its own group. Cached per mesh.
  function faceGroups(mesh) {
    if (!mesh || !mesh.faces) return null;
    if (mesh._faceGroups) return mesh._faceGroups;
    // with Tools ▸ OpenCascade kernel on and its build agreeing with Anvil's, its true B-rep faces decide (ui-occt.js)
    var occ = UI.occtFaceGroups ? UI.occtFaceGroups(mesh) : null;
    if (occ) { mesh._faceGroups = occ; return occ; }
    var of = new Array(mesh.faces.length), keyOf = new Map(), wc = workerCurves(mesh);
    if (K.curveSurfaces && !wc) K.curveSurfaces(mesh).forEach(function (s) { s.polys.forEach(function (p) { keyOf.set(p, s.key); }); });
    var byKey = {};
    mesh.faces.forEach(function (f, i) {
      var p = f.polys && f.polys[0], k = wc ? wc.key0[i] : p && keyOf.get(p);
      if (k == null) { of[i] = [i]; return; }
      k += '|' + bodyOfFace(f) + (f.part != null ? '|p' + f.part : '');   // r10/asmfaces10: one part's
      (byKey[k] = byKey[k] || []).push(i);
    });
    Object.keys(byKey).forEach(function (k) {
      var list = byKey[k], parent = {}, owner = {};
      list.forEach(function (i) { parent[i] = i; });
      function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
      list.forEach(function (i) {
        mesh.faces[i].polys.forEach(function (p) {
          p.vertices.forEach(function (v) {
            var vk = Math.round(v.pos.x * 1e5) + ',' + Math.round(v.pos.y * 1e5) + ',' + Math.round(v.pos.z * 1e5);
            if (owner[vk] == null) owner[vk] = i; else { var a = find(i), b = find(owner[vk]); if (a !== b) parent[a] = b; }
          });
        });
      });
      var byRoot = {};
      list.forEach(function (i) { var r = find(i); (byRoot[r] = byRoot[r] || []).push(i); });
      Object.keys(byRoot).forEach(function (r) { byRoot[r].forEach(function (i) { of[i] = byRoot[r]; }); });
    });
    freeformGroups(mesh, of);
    try { freeCurveGroups(mesh, of); } catch (e) { console.warn('rfHY free-curve faces:', e); }
    mesh._faceGroups = of;
    return of;
  }
  // rfHY (user: "make sure facets are never 'Selectable' only entire curved surfaces"): Anvil's own kernel makes the
  // side of an extruded spline / ellipse / conic out of planar chord strips with no record, and a revolved one out of
  // one cone ring per chord (surf.fc), so each strip or ring picked, hovered and selected alone. Strips are joined when
  // they lie on the same free sketch curve of the same feature and body and meet across a smooth edge (a line tangent
  // to the spline keeps its own face, as in SolidWorks); rings when both carry a free-curve record (fc) of the same
  // feature and body. OpenCascade's B-rep faces (occtFaceGroups) never need this.
  function freeCurveGroups(mesh, of) {
    if (!App.model || !App.model.features || !mesh.faces.length || !mesh.faces[0].polys) return;
    var info = {}, tag = new Array(mesh.faces.length), any = false;
    function featInfo(id) {
      if (id in info) return info[id];
      var f = K.findFeature(App.model, id), r = null;
      if (f && f.sketch != null && f.type !== 'revolve' && f.type !== 'revolveCut') {
        var s = K.findFeature(App.model, f.sketch), pl = null;
        var frees = s && s.entities ? s.entities.map(function (e, k) { return K.isFreeCurve(e) && !e.construction ? { k: k, segs: [] } : null; }).filter(Boolean) : [];
        if (frees.length) try { pl = K.resolvePlane(s.plane, App.model, App.build && App.build.planes); } catch (e) { pl = null; }
        if (pl && pl.origin && pl.x && pl.y) {
          frees.forEach(function (F) { (K.entityPolylines(s.entities[F.k], true) || []).forEach(function (pp) { var P = pp.pts; for (var i = 0; i + 1 < P.length + (pp.closed ? 1 : 0); i++) F.segs.push([P[i], P[(i + 1) % P.length]]); }); });
          r = { pl: pl, frees: frees };
        }
      }
      return (info[id] = r);
    }
    function onFree(F, q, tol) {
      for (var i = 0; i < F.segs.length; i++) {
        var a = F.segs[i][0], b = F.segs[i][1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        var t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
        if (Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1]) <= tol) return true;
      }
      return false;
    }
    mesh.faces.forEach(function (f, i) {
      if (!f.polys || !f.polys.length) return;
      var p0 = f.polys[0], S = p0.surf;
      if (S && S.fc) { tag[i] = 'fc|' + p0.shared + '|' + bodyOfFace(f) + '|' + f.part; any = true; return; }
      if (of[i].length > 1 || S || p0.shared == null) return;
      var I = featInfo(p0.shared);
      if (!I) return;
      var pl = I.pl, n = pl.n || V.cross(pl.x, pl.y), fn = f.normal;
      if (!fn || Math.abs(V.dot(fn, n)) > 1e-6) return;   // a side face stands square to the sketch plane
      // the face seen along the sketch normal is a segment: its two ends must both lie on one free curve's chords
      var pts = [];
      f.polys.forEach(function (p) { p.vertices.forEach(function (v) { var d = [v.pos.x - pl.origin[0], v.pos.y - pl.origin[1], v.pos.z - pl.origin[2]]; pts.push([V.dot(d, pl.x), V.dot(d, pl.y)]); }); });
      var ax = [fn[1] * n[2] - fn[2] * n[1], fn[2] * n[0] - fn[0] * n[2], fn[0] * n[1] - fn[1] * n[0]], u = [V.dot(ax, pl.x), V.dot(ax, pl.y)], lo = null, hi = null, size = 0;
      pts.forEach(function (q) { var t = q[0] * u[0] + q[1] * u[1]; if (!lo || t < lo.t) lo = { t: t, q: q }; if (!hi || t > hi.t) hi = { t: t, q: q }; });
      if (!lo) return;
      size = Math.max(1e-9, hi.t - lo.t);
      for (var j = 0; j < I.frees.length; j++) {
        var tol = 1e-6 * Math.max(1, size) + 1e-7;
        if (onFree(I.frees[j], lo.q, tol) && onFree(I.frees[j], hi.q, tol)) { tag[i] = 'ff|' + p0.shared + '|' + I.frees[j].k + '|' + bodyOfFace(f) + '|' + f.part; any = true; return; }
      }
    });
    if (!any) return;
    var parent = {};
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function root(i) { var g = of[i]; return g && g.length ? g[0] : i; }
    edgesFor(mesh).forEach(function (e) {
      if (!e.smooth || e.faces.length !== 2) return;
      var a = e.faces[0], b = e.faces[1];
      if (tag[a] == null || tag[a] !== tag[b]) return;
      var ra = root(a), rb = root(b);
      if (parent[ra] == null) parent[ra] = ra;
      if (parent[rb] == null) parent[rb] = rb;
      ra = find(ra); rb = find(rb);
      if (ra !== rb) parent[ra] = rb;
    });
    var byRoot = {};
    Object.keys(parent).forEach(function (r) { var x = find(+r); (byRoot[x] = byRoot[x] || []).push(+r); });
    Object.keys(byRoot).forEach(function (x) {
      var g = [];
      byRoot[x].forEach(function (r) { g = g.concat(of[r] || [r]); });
      g = g.filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (p, q) { return p - q; });
      g.forEach(function (i) { of[i] = g; });
    });
  }
  // Freeform surfaces (a sweep's or loft's side, a fillet rolled along a curved edge) have no analytic record: their
  // facets are joined across smooth (tangent, < 22°) edges when both come from the same sweep, loft or fillet feature
  // (or a pattern / mirror of one) in the same body. Other features are left alone, so a flat face tangent to a bend,
  // an offset wall or a line-to-spline extrude keeps its own identity, as in SolidWorks.
  var FREEFORM = { sweep: 1, loft: 1, fillet: 1 };
  function freeformGroups(mesh, of) {
    if (!App.model || !App.model.features || !mesh.faces.length || !mesh.faces[0].polys) return;
    var kindOf = {};
    function freeformId(i) {
      if (of[i].length > 1) return null;   // already on an analytic surface
      var p = mesh.faces[i].polys[0], id = p && p.shared;
      if (id == null) return null;
      if (!(id in kindOf)) {
        var f = K.findFeature(App.model, id), guard = 0;
        while (f && (f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror') && f.feature != null && guard++ < 20) f = K.findFeature(App.model, f.feature);
        kindOf[id] = f && FREEFORM[f.type] ? true : false;
      }
      return kindOf[id] ? id + '|' + bodyOfFace(mesh.faces[i]) + '|' + mesh.faces[i].part : null;
    }
    var parent = {};
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    edgesFor(mesh).forEach(function (e) {
      if (!e.smooth || e.faces.length !== 2) return;
      var a = e.faces[0], b = e.faces[1], ka = freeformId(a);
      if (ka == null || ka !== freeformId(b)) return;
      if (parent[a] == null) parent[a] = a;
      if (parent[b] == null) parent[b] = b;
      var ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    });
    var byRoot = {};
    Object.keys(parent).forEach(function (i) { var r = find(+i); (byRoot[r] = byRoot[r] || []).push(+i); });
    Object.keys(byRoot).forEach(function (r) { var g = byRoot[r].sort(function (x, y) { return x - y; }); g.forEach(function (i) { of[i] = g; }); });
  }
  function faceGroup(i) { var g = faceGroups(App.mesh); return (g && g[i]) || [i]; }

  // Triangle ranges [[start, count], ...] of a selection; hidden bodies contribute nothing so they never ghost.
  function selectionRanges(sel) {
    if (!sel || !App.mesh) return null;
    if (sel.kind === 'face') {
      var f = App.mesh.faces[sel.index];
      if (!f || faceHidden(f)) return null;
      return faceGroup(sel.index).map(function (i) { var g = App.mesh.faces[i]; return [g.start, g.count]; });
    }
    if (sel.kind === 'body') {
      var br = [], brun = null;
      App.mesh.faces.forEach(function (fc) {
        if (bodyOfFace(fc) !== sel.index || faceHidden(fc)) return;
        if (brun && brun[0] + brun[1] === fc.start) brun[1] += fc.count; else { brun = [fc.start, fc.count]; br.push(brun); }
      });
      return br.length ? br : null;
    }
    if (sel.kind === 'feature') {
      var ids = featureFamily(sel.id), ranges = [], ts = App.triShared, th = App.triHidden, run = null;
      for (var i = 0; i < ts.length; i++) {
        var hit = ids.indexOf(ts[i]) >= 0 && !(th && th[i]);
        if (hit) { if (run && run[0] + run[1] === i) run[1]++; else { run = [i, 1]; ranges.push(run); } }
      }
      return ranges.length ? ranges : null;
    }
    return null;
  }
  // a feature plus patterns/mirrors derived from it (they share the source's polygon tags)
  function featureFamily(id) { return [id]; }

  var edgeHoverMat = lineMat(new THREE.LineBasicMaterial({ color: 0xff8c1a, depthTest: false }), LINE_W.edgeHover);   // r13/lines13: thick
  // rfBR: a selected model edge yellow and dashed (screen-pixel dashes in the thick-line shader), as the sketch selection
  var edgeSelMat = lineMat(new THREE.LineDashedMaterial({ color: 0xffd400, depthTest: false, dashSize: 1, gapSize: 0.6 }), LINE_W.edgeSel, { dashPx: 7, gapPx: 4 });
  // under the dashes a near-black line as wide, so the gaps read as gaps over the white wireframe edge beneath
  edgeSelMat.userData.under = lineMat(new THREE.LineBasicMaterial({ color: 0x1a1a1a, depthTest: false }), LINE_W.edgeSel);
  function pushPolyline(arr, pts) {
    for (var i = 0; i + 1 < pts.length; i++) arr.push(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
  }
  // hovered / selected edges; a chord of a true circle or arc lights up the whole curve
  function edgeLineObject(edges, mat) {
    var arr = [], seen = {};
    edges.forEach(function (e) {
      if (e.curve != null && App.curves && App.curves[e.curve] && App.curves[e.curve].edges.indexOf(e) >= 0) {
        if (!seen[e.curve]) { seen[e.curve] = 1; pushPolyline(arr, App.curves[e.curve].pts); }
        return;
      }
      arr.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]);
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    var o = new THREE.LineSegments(g, mat);
    if (mat.isLineDashedMaterial) { mat.dashSize = cam.scale * 7; mat.gapSize = cam.scale * 4; o.computeLineDistances(); }   // rfBR
    if (mat.userData.under) {
      var ug = new THREE.BufferGeometry();
      ug.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      var under = new THREE.LineSegments(ug, mat.userData.under);
      under.renderOrder = 11.9; under.raycast = noRaycast;
      g.addEventListener('dispose', function () { ug.dispose(); });   // disposeGroup disposes the parent's geometry
      o.add(under);
    }
    o.renderOrder = 12;
    return o;
  }
  function edgeIndex(e) { return App.edges ? App.edges.indexOf(e) : -1; }

  function updateHighlights() {
    disposeGroup(groups.highlight);
    if (App.hover && App.hover.kind === 'edge') groups.highlight.add(edgeLineObject([App.hover.edge], edgeHoverMat));
    var selEdges = [];
    [App.sel, App.sel2].forEach(function (s) { if (s && s.kind === 'edge') selEdges.push(s.edge); });
    if (App.command && App.command.edgeList) App.command.edgeList.forEach(function (e) { selEdges.push(e); });
    if (selEdges.length) groups.highlight.add(edgeLineObject(selEdges, edgeSelMat));
    if (App.command && App.command.faceList && App.command.faceList.length && App.mesh) {
      var fr = [];
      // a picked facet of a curved face highlights the whole face
      var seenF = {};
      App.command.faceList.forEach(function (i) {
        (App.mesh.faces[i] ? faceGroup(i) : []).forEach(function (j) {
          var fc = App.mesh.faces[j]; if (fc && !seenF[j]) { seenF[j] = 1; fr.push([fc.start, fc.count]); }
        });
      });
      if (fr.length) groups.highlight.add(new THREE.Mesh(triRangeGeometry(fr), mats.sel));
    }
    var hv = App.hover, hr = null;
    var sameAsSel = App.sel && hv && App.sel.kind === hv.kind &&
      (App.sel.index === hv.index || (hv.kind === 'face' && faceGroup(hv.index).indexOf(App.sel.index) >= 0));
    if (hv && (hv.kind === 'face' || hv.kind === 'body') && !sameAsSel) hr = selectionRanges(hv);
    if (hr) groups.highlight.add(new THREE.Mesh(triRangeGeometry(hr), mats.hover));
    [App.sel, App.sel2].forEach(function (s) {
      var r = selectionRanges(s);
      if (r) groups.highlight.add(new THREE.Mesh(triRangeGeometry(r), mats.sel));
    });
    groups.planes.children.forEach(function (pm) {
      if (pm.userData.face) {
        var ref = pm.userData.ref;
        // r5/select5: a selected plane is blue (r14) like other selections, a hovered one orange like other pre-highlights
        var selOn = App.sel && App.sel.kind === 'plane' && App.sel.ref === ref, hovOn = App.hover && App.hover.kind === 'plane' && App.hover.ref === ref;
        pm.material = selOn ? mats.planeFaceHi : hovOn ? (mats.planeFaceHover || mats.planeFaceHi) : mats.planeFace;
      }
    });
    // multi-selection items beyond sel / sel2, vertices, and the Instant3D overlay (ui-select.js)
    updateRefGeo();   // lane CZ: a selected / hovered reference axis, point or csys
    if (UI.drawSelectionExtras) UI.drawSelectionExtras(groups.highlight, { selectionRanges: selectionRanges, triRangeGeometry: triRangeGeometry, edgeLineObject: edgeLineObject, edgeSelMat: edgeSelMat });
  }

  // ------------------------------------------------------------------ planes, origin, sketches
  function planeExtent() {
    var b = modelBounds();
    var d = 0;
    for (var k = 0; k < 3; k++) d = Math.max(d, b.max[k] - b.min[k], Math.abs(b.max[k]), Math.abs(b.min[k]));
    return Math.max(30, d * 0.6);
  }
  function planeQuad(pl, half, ref, name) {
    var c = [K.to3D(pl, -half, -half), K.to3D(pl, half, -half), K.to3D(pl, half, half), K.to3D(pl, -half, half)];
    var g = new THREE.BufferGeometry();
    var arr = [].concat(c[0], c[1], c[2], c[0], c[2], c[3]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    var m = new THREE.Mesh(g, mats.planeFace);
    m.userData = { face: true, ref: ref, plane: pl, name: name };
    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([].concat(c[0], c[1], c[1], c[2], c[2], c[3], c[3], c[0]), 3));
    var l = new THREE.LineSegments(lg, mats.planeLine);
    return [m, l];
  }
  function updatePlanes() {
    disposeGroup(groups.planes);
    updateRefGeo();   // lane CZ: reference axes, points, coordinate systems
    var want = App.view.showPlanes || (App.command && App.command.pickPlane && !App.command.quietPlanes) || (App.sel && App.sel.kind === 'plane') || (App.hover && App.hover.kind === 'plane');
    if (!want) return;
    var half = planeExtent();
    var only = !App.view.showPlanes && App.command && App.command.quietPlanes && App.hover && App.hover.kind === 'plane' ? App.hover.ref : null;   // r13/asmui13: the flyout's hovered plane alone
    ['Front', 'Top', 'Right'].forEach(function (r) {
      if (only && r !== only) return;
      planeQuad(K.makePlane(r, 0), half, r, r + ' Plane').forEach(function (o) { groups.planes.add(o); });
    });
    App.model.features.forEach(function (f) {
      if (f.type !== 'plane' || rolledBack(f)) return;
      planeQuad(K.makePlane(f.ref, f.offset), half * 0.8, f.id, f.name).forEach(function (o) { groups.planes.add(o); });
    });
  }
  // ------------------------------------------------------------------ lane CZ: reference Axes, Points and Coordinate Systems
  // Drawn from the records rebuild keeps in App.build.planes (refgeo 'axis' | 'point' | 'csys', kernel-features.js):
  // an axis as a thin dashed line a little longer than its reference, a point as a small star, a coordinate system as
  // a red / green / blue triad with X Y Z labels. View ▸ Hide/Show ▸ Axes / Points / Coordinate Systems
  // (App.view.showAxes / showPoints / showCsys, on by default, as SolidWorks shows the ones you make); a command that
  // picks them (App.command.pickRefGeo) shows them all; a selected or hovered one is yellow / orange.
  var refGroup = new THREE.Group();
  scene.add(refGroup); groups.refgeo = refGroup;
  ['showAxes', 'showPoints', 'showCsys'].forEach(function (k) { if (App.view[k] == null) App.view[k] = true; });
  var REF_COL = { line: 0xb4b4b4, sel: 0xffd400, hover: 0xff9a2e, x: 0xd9453b, y: 0x3fa34d, z: 0x2d7dd2 };
  var refMatCache = {};
  // depth (rfHM): hidden by the solids like SolidWorks' curves (a helix inside the coil it swept showed through the
  // wire as a white streak along it); faces sit back by their polygon offset, so a curve lying on a face still shows
  function refMat(kind, dashed, depth) {
    var k = kind + (dashed ? 'd' : '') + (depth ? 'z' : '');
    if (!refMatCache[k]) {
      refMatCache[k] = dashed ? lineMat(new THREE.LineDashedMaterial({ color: REF_COL[kind], depthTest: !!depth, transparent: true }), kind === 'line' ? 1.2 : 2, { dashPx: 9, gapPx: 3 })
        : lineMat(new THREE.LineBasicMaterial({ color: REF_COL[kind], depthTest: !!depth, transparent: true }), kind === 'line' ? 1.5 : 2.5);
    }
    return refMatCache[k];
  }
  var refLabelTex = {};
  function refLabel(text, color, at, size) {
    var key = text + color;
    if (!refLabelTex[key]) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var g = cv.getContext('2d');
      if (g) { g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#' + ('00000' + color.toString(16)).slice(-6); g.fillText(text, 32, 34); }
      refLabelTex[key] = new THREE.CanvasTexture(cv);
    }
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: refLabelTex[key], depthTest: false, transparent: true }));
    s.position.set(at[0], at[1], at[2]); s.scale.set(size, size, size); s.renderOrder = 12;
    return s;
  }
  function refSegs(arr, mat, dashed) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    var l = new THREE.LineSegments(g, mat);
    if (dashed) l.computeLineDistances();
    l.renderOrder = 11;
    return l;
  }
  // the reference geometry features shown now: [{ f, g (the record) }]
  function refGeoItems(all) {
    var out = [], planes = App.build && App.build.planes;
    if (!planes || !App.model || !App.model.features) return out;
    var cmdAll = !!(App.command && App.command.pickRefGeo);
    App.model.features.forEach(function (f) {
      if (f.type !== 'refaxis' && f.type !== 'refpoint' && f.type !== 'csys') return;
      var g = planes[f.id];
      if (!g || !g.refgeo || rolledBack(f)) return;
      if (App.editingFeatureId === f.id) return;   // the PropertyManager shows its preview instead
      var flag = { axis: 'showAxes', point: 'showPoints', csys: 'showCsys' }[g.refgeo];
      var on = all || cmdAll || (App.view[flag] !== false && !f.hidden) || refSelected(f.id) || refHovered(f.id);
      if (on) out.push({ f: f, g: g });
    });
    return out;
  }
  function refSelected(id) {
    var s = App.sel;
    if (s && (s.kind === 'refgeo' || s.kind === 'feature') && s.id === id) return true;
    return !!(UI.selection && UI.selection().some(function (x) { return (x.kind === 'refgeo' || x.kind === 'feature') && x.id === id; }));
  }
  function refHovered(id) { var h = App.hover; return !!(h && (h.kind === 'refgeo' || (h.kind === 'feature' && h.refgeo)) && h.id === id); }
  function refSize() { return Math.max(1e-3, planeExtent() * 0.06); }
  // drawRefGeo(g, group, state): one record into a group ('sel' | 'hover' | null) — also the PropertyManager previews
  function drawRefGeo(g, group, state) {
    var s = refSize();
    if (g.refgeo === 'axis') {
      var a = g.a || V.add(g.o, V.scale(g.d, -s * 4)), b = g.b || V.add(g.o, V.scale(g.d, s * 4));
      var L = V.len(V.sub(b, a)), ext = Math.max(L * 0.06, s * 0.4);
      a = V.add(a, V.scale(g.d, -ext)); b = V.add(b, V.scale(g.d, ext));
      group.add(refSegs([].concat(a, b), refMat(state || 'line', true), true));
    } else if (g.refgeo === 'point') {
      var p = g.p, r = s * 0.22, k = r * 0.7, arr = [];
      [[r, 0, 0], [0, r, 0], [0, 0, r], [k, k, k], [k, -k, k], [-k, k, k], [-k, -k, k]].forEach(function (d) { arr.push(p[0] - d[0], p[1] - d[1], p[2] - d[2], p[0] + d[0], p[1] + d[1], p[2] + d[2]); });
      group.add(refSegs(arr, refMat(state || 'line', false), false));
    } else if (g.refgeo === 'curve') { faDrawCurve(g, group, state);   // rfFA: a reference curve
    } else if (g.refgeo === 'csys') {
      var o = g.origin, L2 = s * 1.4;
      ['x', 'y', 'z'].forEach(function (ax) {
        var tip = V.add(o, V.scale(g[ax], L2)), side = ax === 'x' ? g.y : g.x, h = L2 * 0.12;
        var arr2 = [].concat(o, tip, tip, V.add(V.add(tip, V.scale(g[ax], -h * 1.6)), V.scale(side, h)), tip, V.add(V.add(tip, V.scale(g[ax], -h * 1.6)), V.scale(side, -h)));
        group.add(refSegs(arr2, refMat(state || ax, false), false));
        group.add(refLabel(ax.toUpperCase(), REF_COL[state || ax], V.add(o, V.scale(g[ax], L2 * 1.22)), L2 * 0.32));
      });
    }
  }
  function updateRefGeo() {
    disposeGroup(refGroup);
    faCurveItems().forEach(function (it) { drawRefGeo(it.g, refGroup, refSelected(it.f.id) ? 'sel' : refHovered(it.f.id) ? 'hover' : null); });   // rfFA
    refGeoItems(false).forEach(function (it) {
      drawRefGeo(it.g, refGroup, refSelected(it.f.id) ? 'sel' : refHovered(it.f.id) ? 'hover' : null);
    });
  }
  // pickRefGeo(mx, my, kinds?) -> { kind: 'refgeo', id, refgeo, name, point } for the shown axis / point / csys under the
  // cursor (axes within 7 px of the line, points and csys origins within 9 px), or null. kinds: ['axis', 'point', 'csys']
  function pickRefGeo(mx, my, kinds) {
    var best = null, bd = 9;
    function seg(p, q) {
      var A = worldToScreen(p), B = worldToScreen(q), dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
      var t = L2 > 0 ? Math.max(0, Math.min(1, ((mx - A[0]) * dx + (my - A[1]) * dy) / L2)) : 0;
      return { d: Math.hypot(mx - A[0] - t * dx, my - A[1] - t * dy), t: t };
    }
    refGeoItems(false).forEach(function (it) {
      var g = it.g, d = Infinity, P = null;
      if (kinds && kinds.indexOf(g.refgeo) < 0) return;
      if (g.refgeo === 'axis') {
        var s = refSize(), a = g.a || V.add(g.o, V.scale(g.d, -s * 4)), b = g.b || V.add(g.o, V.scale(g.d, s * 4)), r = seg(a, b);
        d = r.d + 2; P = V.add(a, V.scale(V.sub(b, a), r.t));   // + 2: a point or origin on the line wins
      } else if (g.refgeo === 'point') { var q = worldToScreen(g.p); d = Math.hypot(q[0] - mx, q[1] - my); P = g.p; }
      else if (g.refgeo === 'csys') { var c = worldToScreen(g.origin); d = Math.hypot(c[0] - mx, c[1] - my); P = g.origin; }
      if (d < bd) { bd = d; best = { kind: 'refgeo', id: it.f.id, refgeo: g.refgeo, name: it.f.name, point: P.slice(), rec: g }; }
    });
    return best;
  }

  function updateOrigin() {
    disposeGroup(groups.origin);
    if (!App.view.showOrigin) return;
    var L = Math.max(8, planeExtent() * 0.12);
    [[1, 0, 0, 0xd9453b], [0, 1, 0, 0x3fa34d], [0, 0, 1, 0x2d7dd2]].forEach(function (a) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, a[0] * L, a[1] * L, a[2] * L], 3));
      groups.origin.add(new THREE.Line(g, lineMat(new THREE.LineBasicMaterial({ color: a[3] }), LINE_W.origin)));
    });
  }

  function lineGeometryFromPolylines(pl, polylines) {
    var arr = [];
    polylines.forEach(function (l) {
      var n = l.pts.length, cnt = l.closed ? n : n - 1;
      for (var i = 0; i < cnt; i++) {
        var a = K.to3D(pl, l.pts[i][0], l.pts[i][1]), b = K.to3D(pl, l.pts[(i + 1) % n][0], l.pts[(i + 1) % n][1]);
        arr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }
  function sketchVisible(f) {
    if (App.activeSketch === f.id) return true;
    if (rolledBack(f)) return false;   // r10/editpreview10: after the rollback point of an Edit Feature
    if (App.view.showSketches) return true;
    if (App.sel && App.sel.kind === 'feature' && App.sel.id === f.id) return true;
    if (App.command && (App.command.sketchId === f.id || App.command.pathId === f.id || (App.command.loftIds && App.command.loftIds.indexOf(f.id) >= 0))) return true;
    if (f.hidden) return false;
    return !isConsumed(f.id);
  }
  function isConsumed(id) {
    return App.model.features.some(function (g) {
      if (rollbarRolled(g)) return false;   // rfGQ: a feature below the rollback bar gives its sketch back
      if (g.sketch === id || g.profile === id || g.path === id || (g.sketches && g.sketches.indexOf(id) >= 0)) return true;
      // rfFB: a Boundary's Direction 1 profiles and Direction 2 curves (an id, or { sketch, entity })
      return [g.dir1, g.dir2].some(function (L) { return Array.isArray(L) && L.some(function (c) { return c === id || (c && typeof c === 'object' && c.sketch === id); }); });
    });
  }
  // a dashed twin of a sketch line material, dash length in screen pixels at the current zoom
  var dashMats = {};
  function dashedMat(m) {
    var d = dashMats[m.uuid];
    if (!d) d = dashMats[m.uuid] = lineMat(new THREE.LineDashedMaterial({ color: m.color, depthTest: m.depthTest }), m.userData.lineWidth || LINE_W.sketch, { dashPx: 7, gapPx: 4 });
    d.color.copy(m.color);
    d.dashSize = cam.scale * 7; d.gapSize = cam.scale * 4;
    return d;
  }
  // r12/sketchui12: the end and centre points of the active sketch's entities as round dots in the entity's colour
  // (SolidWorks' entity points), one dot where several ends meet; mid points and a corner rectangle's centre are not
  // shown (SolidWorks has none there). User 2026-10-14: prominent against the white wireframe, so a 10 px bead with a
  // near-black ring (the ring stays dark: the material colour multiplies only the light centre)
  var ptTexture = null, ptMats = {}, PT_GREEN = new THREE.Color(0x2ee66b);
  function sketchPointMat(m) {
    if (!ptTexture) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 32;
      var cx = cv.getContext('2d');
      cx.fillStyle = '#111'; cx.beginPath(); cx.arc(16, 16, 15.5, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(16, 16, 9.5, 0, Math.PI * 2); cx.fill();
      ptTexture = new THREE.CanvasTexture(cv);
    }
    var pm = ptMats[m.uuid];
    // (rfIB: in the transparent pass, after the shaded regions (renderOrder 9) and the lines (10.5), as the lines)
    if (!pm) pm = ptMats[m.uuid] = new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, map: ptTexture, alphaTest: 0.5, transparent: true, depthTest: false });
    // the same Color as the line (a state colour — over-defined red, selected yellow — shows on its dots too), except
    // plain white geometry, whose dots are green so they stand out on the white wireframe
    var mh = m.color.getHex();
    pm.color = mh === 0xffffff || (mh === LINE_PALETTE_LIGHT.sketch && m !== mats.sketchConstr) ? PT_GREEN : m.color;
    return pm;
  }
  function sketchEndPoints(f, i, e, mat, ptsBy) {
    var S = window.SketchSolver;
    if (!S || !S.pointRefs || e.t === 'point') return;
    var inf = S.infSides ? S.infSides(e) : null;   // sketch-refine: no dot on an infinite line's runaway end
    S.pointRefs(f, i).forEach(function (pr) {
      if (/\.mid$/.test(pr.ref) || (e.t === 'rect' && /\.c$/.test(pr.ref))) return;
      if (inf && inf[pr.ref.split('.')[1]]) return;
      if (App.view.showEndpoints === false && !/\.c$/.test(pr.ref)) return;   // View ▸ Display ▸ Show Endpoints off: centres only (ui-panels.js)
      var key = Math.round(pr.pt[0] / cam.scale / 2) + ',' + Math.round(pr.pt[1] / cam.scale / 2);
      var b = ptsBy[mat.uuid] || (ptsBy[mat.uuid] = { mat: mat, pts: [] });
      if (ptsBy._seen && ptsBy._seen[key]) return;
      (ptsBy._seen = ptsBy._seen || {})[key] = true;
      b.pts.push(pr.pt);
    });
  }
  function addSketchPoints(pl, ptsBy) {
    Object.keys(ptsBy).forEach(function (k) {
      if (k === '_seen') return;
      var b = ptsBy[k], pos = [];
      b.pts.forEach(function (p) { var q = K.to3D(pl, p[0], p[1]); pos.push(q[0], q[1], q[2]); });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      var pts = new THREE.Points(g, sketchPointMat(b.mat));
      pts.renderOrder = 11;
      pts.userData = { sketchPoints: true };
      groups.sketches.add(pts);
    });
  }
  // r15/truecircles: sketch circles, arcs and slots are tessellated for the screen — a chord sagitta of about
  // SCREEN_SAG_PX at the current zoom, 32 to 2048 segments per turn — instead of with the model's chord tolerance
  // (0.05 mm, which makes a Ø10 circle 24-sided and visibly flat once zoomed in). The kernel's tessellation settings
  // are swapped only for the call and restored at once (rebuild cache keys read them at rebuild time). Model edges
  // already draw true curves finely (CURVE_SEGS). updateGrid redraws the sketches when the zoom has moved more than
  // 30 % since they were tessellated, so zooming in never shows the flats.
  var SCREEN_SAG_PX = 0.15, sketchSegsScale = 0;
  function screenPolylines(e) {
    if (e.t === 'line' && e.infinite && UI.infiniteLinePts) return [{ pts: UI.infiniteLinePts(e), closed: false }];   // sketch-refine: across the view at any zoom
    if (e.t !== 'circle' && e.t !== 'arc' && e.t !== 'slot' && e.t !== 'aslot') return K.entityPolylines(e);
    var saved = K.setTessellation({});
    try { K.setTessellation({ chordTol: Math.max(1e-9, SCREEN_SAG_PX * cam.scale), minSegs: 32, maxSegs: 2048 }); return K.entityPolylines(e); }
    finally { K.setTessellation(saved); }
  }
  function updateSketches() {
    App.dimsStale = true;
    sketchSegsScale = cam.scale;
    sceneVer++;
    disposeGroup(groups.sketches);
    mats.sketchSel.dashSize = cam.scale * 6; mats.sketchSel.gapSize = cam.scale * 4;   // rfBR: the 1-pixel fallback's dashes at this zoom
    App.model.features.forEach(function (f) {
      if (f.type !== 'sketch' || !sketchVisible(f)) return;
      var pl; try { pl = K.resolvePlane(f.plane, App.model, App.build && App.build.planes); } catch (e) { return; }
      var active = App.activeSketch === f.id;
      // the active sketch is analysed on every redraw: entity colours and the status bar's Under / Fully / Over Defined
      var state = null;
      if (active && App.sketchDragging && App.sketchState) state = App.sketchState;   // mid-drag: same relations, same state
      else if (active && window.SketchSolver) { try { SketchSolver.clean(f); state = App.sketchState = SketchSolver.analyze(f); } catch (err) { state = App.sketchState = null; } }
      var stateMat = { full: mats.sketchFull, over: mats.sketchOver, conflict: mats.sketchConflict }, ptsBy = {};
      var layerStyle = UI.sketchLayerStyle;   // sketch-layers (ui-sketch-layers.js): hidden layers, layer colours, dashed layers
      f.entities.forEach(function (e, i) {
        var ly = layerStyle ? layerStyle(f, e, active) : null;
        if (ly && ly.hidden) return;
        var pls = screenPolylines(e);
        var selected = active && (UI.entitySelected ? UI.entitySelected(i) : App.sel && App.sel.kind === 'entity' && App.sel.index === i);
        var mat = selected ? mats.sketchSel : (active ? (state && stateMat[state.entities[i]]) || mats.sketch : mats.sketchDim);
        if (ly && ly.mat && !selected && !e.construction && mat !== mats.sketchOver && mat !== mats.sketchConflict) mat = ly.mat;   // over defined stays red
        if (!active && !selected && App.build && App.build.warnings && /^Dangling\b/.test(App.build.warnings[f.id] || '')) mat = mats.sketchDangling;   // r12/occtui12
        if (active && e.construction && !selected && mat !== mats.sketchOver && mat !== mats.sketchConflict) mat = mats.sketchConstr;   // rfBR: light grey
        if (e.t === 'point') {
          var p = K.to3D(pl, e.x, e.y), s = cam.scale * 3;
          var g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(V.add(p, V.scale(pl.x, -s)), V.add(p, V.scale(pl.x, s)), V.add(p, V.scale(pl.y, -s)), V.add(p, V.scale(pl.y, s))), 3));
          var pc = new THREE.LineSegments(g, mat);
          if (mat.isLineDashedMaterial) pc.computeLineDistances();
          groups.sketches.add(pc);
          return;
        }
        if (!pls.length) return;
        var baseMat = mat, dashed = e.construction || !!(ly && ly.dashed);
        if (dashed && !mat.isLineDashedMaterial) mat = dashedMat(mat);   // construction geometry / centerlines (and BEND-type layers): dashed
        var ls = new THREE.LineSegments(lineGeometryFromPolylines(pl, pls), mat);
        if (mat.isLineDashedMaterial) ls.computeLineDistances();   // rfBR: a selected entity is dashed too
        ls.userData = { sketch: f.id, index: i };
        if (active) ls.renderOrder = 10;
        groups.sketches.add(ls);
        if (active) sketchEndPoints(f, i, e, baseMat, ptsBy);
      });
      if (active) addSketchPoints(pl, ptsBy);
      // sketch-layers: closed regions shaded and open ends marked in the sketch being edited (View ▸ Sketch Regions)
      if (active && UI.sketchRegionObjects) UI.sketchRegionObjects(f, pl).forEach(function (o) { groups.sketches.add(o); });
      if (active) sketchOverlayObjects(f, pl).forEach(function (o) { groups.sketches.add(o); });   // sketch-hooks: Dynamic Mirror's "=" marks …
    });
    if (App.mode !== 'sketch') App.sketchState = null;
    else if (UI.refreshStatus) UI.refreshStatus();
  }
  // sketch-hooks: other files add to what the sketch being edited shows without wrapping the redraw functions.
  // UI.sketchOverlayHooks: functions (f, pl) -> THREE objects drawn with the active sketch (Dynamic Mirror's "=" marks).
  // UI.tempEntityHooks: functions (entities) -> more entities to draw with the ones a drawing tool previews (the
  // mirror image of the entity being drawn). A hook that throws is skipped: a redraw is never worth breaking.
  // (the lists live here and are exported below: UI is not assigned until this file has run)
  var sketchOverlayHooks = [], tempEntityHooks = [];
  function sketchOverlayObjects(f, pl) {
    var out = [];
    sketchOverlayHooks.forEach(function (h) { try { out = out.concat(h(f, pl) || []); } catch (e) { /* skipped */ } });
    return out;
  }
  function tempEntitiesShown() {
    var list = App.tempEntities;
    tempEntityHooks.forEach(function (h) { try { list = list.concat(h(App.tempEntities) || []); } catch (e) { /* skipped */ } });
    return list;
  }
  function updateTemp() {
    disposeGroup(groups.temp);
    if (!App.tempEntities.length || App.activeSketch == null) return;
    var pl = activePlane();
    tempEntitiesShown().forEach(function (e) {
      var pls = screenPolylines(e);
      if (!pls.length) return;
      var ls = new THREE.LineSegments(lineGeometryFromPolylines(pl, pls), mats.temp);
      ls.renderOrder = 11;
      groups.temp.add(ls);
    });
  }
  function activeSketchFeature() { return App.activeSketch == null ? null : K.findFeature(App.model, App.activeSketch); }
  function activePlane() {
    var f = activeSketchFeature();
    if (!f) return K.makePlane('Front', 0);
    try { return K.resolvePlane(f.plane, App.model, App.build && App.build.planes); } catch (e) { return K.makePlane('Front', 0); }
  }

  // ------------------------------------------------------------------ grid on the active sketch plane
  // lane sketchgaps: SolidWorks' Grid/Snap (Document Properties) is major 1 in with 4 minor lines, a snap point per minor
  // (0.25 in), and Automatic scaling: inch documents step in powers of two with 4 minors (… 0.25, 0.5, 1, 2 …), so the
  // Length / Grid Quick Snaps land on fractions a shop reads. mm documents keep 1-2-5 majors, with the minors 1-2-5 as
  // well (major 10 → 2, 20 → 5, 50 → 10; was major / 5, which gave 4 mm and 0.4 mm steps).
  var GRID_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  var GRID_STEPS_IN = [1 / 256, 1 / 128, 1 / 64, 1 / 32, 1 / 16, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  function gridInch() { return !!(App.model && App.model.units === 'in'); }
  function gridStep() {
    var list = gridInch() ? GRID_STEPS_IN : GRID_STEPS;
    for (var i = 0; i < list.length; i++) if (list[i] / cam.scale >= 48) return list[i];
    return list[list.length - 1] * 2;
  }
  // minor lines per major: 4 in inches; 1-2-5 minors in mm (a 2·10ⁿ major splits in 4, the others in 5)
  function gridMinors(g) {
    if (gridInch()) return 4;
    var m = g / Math.pow(10, Math.floor(Math.log(g) / Math.LN10 + 1e-9));
    return Math.abs(m - 2) < 1e-6 ? 4 : 5;
  }
  function snapStep() {
    var g = gridStep(), m = g / gridMinors(g);
    return m / cam.scale >= 7 ? m : g;
  }
  function visiblePlaneBox(pl) {
    var corners = [[0, 0], [size.w, 0], [0, size.h], [size.w, size.h]], min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    corners.forEach(function (c) {
      var w = screenToPlane(c[0], c[1], pl);
      if (!w) return;
      min[0] = Math.min(min[0], w[0]); min[1] = Math.min(min[1], w[1]); max[0] = Math.max(max[0], w[0]); max[1] = Math.max(max[1], w[1]);
    });
    if (!isFinite(min[0])) return null;
    return { min: min, max: max };
  }
  function updateGrid() {
    if (App.gridStale) refineCurves();   // rfFE: true curve edges at screen resolution
    if (App.gridStale && sketchSegsScale > 0 && groups.sketches.children.length && Math.abs(Math.log(cam.scale / sketchSegsScale)) > Math.log(1.3) && !App.sketchDragging) updateSketches();
    if (!App.gridStale) return;
    App.gridStale = false;
    disposeGroup(groups.grid);
    // lane mcpolish: showGrid is the grid that snaps (SolidWorks' Sketch Grid draws and snaps); gridVisible (Mastercam's
    // Show Grid, apart from Snap to Grid) true draws it without snapping, false snaps without drawing it
    var drawn = App.view.gridVisible === true || (App.view.showGrid && App.view.gridVisible !== false);
    if (App.mode !== 'sketch' || !drawn) return;
    var pl = activePlane(), box = visiblePlaneBox(pl);
    if (!box) return;
    var step = gridStep(), minor = step / gridMinors(step);
    var span = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1]);
    if (span / minor > 400) minor = step;
    var lim = 20000;
    var x0 = Math.max(-lim, Math.floor(box.min[0] / minor) * minor), x1 = Math.min(lim, Math.ceil(box.max[0] / minor) * minor);
    var y0 = Math.max(-lim, Math.floor(box.min[1] / minor) * minor), y1 = Math.min(lim, Math.ceil(box.max[1] / minor) * minor);
    var mn = [], mj = [], x, y, eps = minor * 1e-6;
    for (x = x0; x <= x1 + eps; x += minor) {
      var a = K.to3D(pl, x, y0), b = K.to3D(pl, x, y1);
      (Math.abs(x / step - Math.round(x / step)) < 1e-6 ? mj : mn).push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    for (y = y0; y <= y1 + eps; y += minor) {
      var c = K.to3D(pl, x0, y), d = K.to3D(pl, x1, y);
      (Math.abs(y / step - Math.round(y / step)) < 1e-6 ? mj : mn).push(c[0], c[1], c[2], d[0], d[1], d[2]);
    }
    [[mn, mats.grid], [mj, mats.gridMajor]].forEach(function (pair) {
      if (!pair[0].length) return;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pair[0], 3));
      groups.grid.add(new THREE.LineSegments(g, pair[1]));
    });
  }

  // ------------------------------------------------------------------ picking
  var raycaster = new THREE.Raycaster();
  function ndc(mx, my) { return new THREE.Vector2(mx / size.w * 2 - 1, -(my / size.h) * 2 + 1); }
  function screenToPlane(mx, my, pl) {
    raycaster.setFromCamera(ndc(mx, my), camera);
    var tp = new THREE.Plane(new THREE.Vector3(pl.n[0], pl.n[1], pl.n[2]), -V.dot(pl.n, pl.origin));
    var out = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(tp, out)) {
      // ray parallel: fall back to a plane through the target facing the camera
      return null;
    }
    return K.to2D(pl, [out.x, out.y, out.z]);
  }
  function worldToScreen(p) {
    var v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
    return [(v.x + 1) / 2 * size.w, (1 - v.y) / 2 * size.h];
  }
  // Pre-selection runs a face pick and an edge pick (which picks the face again for occlusion) on every mouse move, so
  // the last face pick is remembered for the same pixel, camera, body and section, and the edges' screen positions are
  // projected once per camera change into a flat array (no per-edge allocations), not once per pick.
  var pickMemo = { key: null, hit: null };
  function pickFace(mx, my) {
    if (!bodyMesh || flatShown()) return null;   // lane DC: the flat is shown
    var sec = App.view.section && App.view.section.plane;
    var key = mx + ',' + my + ',' + camVer + ',' + bodyMesh.id + (sec ? ',' + sec.normal.x + ',' + sec.normal.y + ',' + sec.normal.z + ',' + sec.constant : '');
    if (pickMemo.key !== key) { pickMemo.key = key; pickMemo.hit = pickFaceRaw(mx, my); }
    var r = pickMemo.hit;
    return r ? { kind: 'face', index: r.index, point: r.point.slice() } : null;
  }
  function pickFaceRaw(mx, my) {
    raycaster.setFromCamera(ndc(mx, my), camera);
    var hits = raycaster.intersectObject(bodyMesh, false);
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (App.view.section && App.view.section.plane.distanceToPoint(h.point) < 0) continue;
      // with hidden bodies the mesh is indexed and faceIndex counts rendered triangles; map it back to the global one
      var tri = renderedTri(h.faceIndex);
      return { kind: 'face', index: faceAtTriangle(tri), point: [h.point.x, h.point.y, h.point.z] };
    }
    return null;
  }
  // r5/select5: every face under the pointer, nearest first, one per face group (Select Other reaches hidden faces)
  function pickFacesAll(mx, my) {
    if (!bodyMesh || flatShown()) return [];   // lane DC
    raycaster.setFromCamera(ndc(mx, my), camera);
    var hits = raycaster.intersectObject(bodyMesh, false), out = [], seen = {};
    hits.forEach(function (h) {
      if (App.view.section && App.view.section.plane.distanceToPoint(h.point) < 0) return;
      var fi = faceAtTriangle(renderedTri(h.faceIndex)), grp = faceGroup(fi), key = grp && grp.length ? grp[0] : fi;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ kind: 'face', index: fi, point: [h.point.x, h.point.y, h.point.z] });
    });
    return out;
  }
  var edgeScr = { edges: null, ver: -1, xy: null };
  function edgeScreen() {
    var E = App.edges;
    if (edgeScr.edges === E && edgeScr.ver === camVer && edgeScr.w === size.w && edgeScr.h === size.h) return edgeScr.xy;
    var m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), el = m.elements;
    var xy = edgeScr.xy && edgeScr.xy.length === E.length * 4 ? edgeScr.xy : new Float64Array(E.length * 4), w = size.w, h = size.h;
    function put(p, o) {
      var x = p[0], y = p[1], z = p[2], W = el[3] * x + el[7] * y + el[11] * z + el[15] || 1;
      xy[o] = ((el[0] * x + el[4] * y + el[8] * z + el[12]) / W + 1) / 2 * w;
      xy[o + 1] = (1 - (el[1] * x + el[5] * y + el[9] * z + el[13]) / W) / 2 * h;
    }
    for (var i = 0; i < E.length; i++) { put(E[i].a, i * 4); put(E[i].b, i * 4 + 2); }
    edgeScr = { edges: E, ver: camVer, w: w, h: h, xy: xy };
    return xy;
  }
  // lane DA: does a screen box [x0, y0, x1, y1] (graphics-area pixels) cross a drawn model edge? For overlays that
  // must not sit on the model's edges (Instant3D dimension labels: the caller moves the label / dimension line
  // outward until this is false, as sketch labels keep clear of the sketch's curves). Sharp edges of shown bodies,
  // from the per-camera projection pickEdge uses (no allocation per call); `pad` grows the box.
  function modelEdgeInBox(b, pad) {
    var E = App.edges;
    if (!E || !E.length || !b) return false;
    var p = pad || 0, x0 = b[0] - p, y0 = b[1] - p, x1 = b[2] + p, y1 = b[3] + p, xy = edgeScreen();
    for (var i = 0; i < E.length; i++) {
      var e = E[i];
      if (e.smooth) continue;
      var ax = xy[i * 4], ay = xy[i * 4 + 1], bx = xy[i * 4 + 2], by = xy[i * 4 + 3];
      if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
      if (!edgeVisible(e)) continue;
      // Liang-Barsky: the part of the segment inside the box is not empty
      var dx = bx - ax, dy = by - ay, t0 = 0, t1 = 1, P4 = [-dx, dx, -dy, dy], Q4 = [ax - x0, x1 - ax, ay - y0, y1 - ay], ok = true;
      for (var k = 0; k < 4 && ok; k++) {
        if (Math.abs(P4[k]) < 1e-12) { if (Q4[k] < 0) ok = false; continue; }
        var r = Q4[k] / P4[k];
        if (P4[k] < 0) { if (r > t1) ok = false; else if (r > t0) t0 = r; }
        else { if (r < t0) ok = false; else if (r < t1) t1 = r; }
      }
      if (!ok || t1 < t0) continue;
      // hidden edges (behind the body: the back edges of a block in a shaded view) do not count: the face under the
      // middle of the part inside the box must not be clearly in front of the edge there (pickEdge's test)
      var tm = (t0 + t1) / 2, hit = pickFace(ax + dx * tm, ay + dy * tm);
      if (hit) {
        var D = [cam.dir.x, cam.dir.y, cam.dir.z], q = [e.a[0] + (e.b[0] - e.a[0]) * tm, e.a[1] + (e.b[1] - e.a[1]) * tm, e.a[2] + (e.b[2] - e.a[2]) * tm];
        if (V.dot(q, D) < V.dot(hit.point, D) - Math.max(0.5, cam.scale * 3)) continue;
      }
      return true;
    }
    return false;
  }
  // Nearest visible sharp edge within 7 px. Occlusion: the edge midpoint must not sit clearly behind the face under the cursor.
  function pickEdge(mx, my) {
    if (!App.edges || !App.edges.length || flatShown()) return null;   // lane DC
    var best = null, bestD = 7;
    var hit = pickFace(mx, my);
    var hitDepth = hit ? V.dot(hit.point, [cam.dir.x, cam.dir.y, cam.dir.z]) : -Infinity;
    var xy = edgeScreen(), P = [mx, my], A = [0, 0], B = [0, 0];
    for (var i = 0; i < App.edges.length; i++) {
      var e = App.edges[i];
      if (e.smooth || e.faces.length !== 2) continue;
      A[0] = xy[i * 4]; A[1] = xy[i * 4 + 1]; B[0] = xy[i * 4 + 2]; B[1] = xy[i * 4 + 3];
      // cheap reject: the cursor is outside the segment's box grown by the pick radius
      if (mx < Math.min(A[0], B[0]) - bestD || mx > Math.max(A[0], B[0]) + bestD || my < Math.min(A[1], B[1]) - bestD || my > Math.max(A[1], B[1]) + bestD) continue;
      if (!edgeVisible(e)) continue;
      var d = distToSegment(P, A, B);
      if (d >= bestD) continue;
      // lane CZ: the depth of the edge point under the cursor, not of the edge's middle (a long edge seen at an angle
      // was "behind" the face it bounds when picked away from its middle)
      var ex = B[0] - A[0], ey = B[1] - A[1], eL = ex * ex + ey * ey, et = eL > 0 ? Math.max(0, Math.min(1, ((mx - A[0]) * ex + (my - A[1]) * ey) / eL)) : 0.5;
      var depth = V.dot(V.add(e.a, V.scale(V.sub(e.b, e.a), et)), [cam.dir.x, cam.dir.y, cam.dir.z]);
      if (hit && depth < hitDepth - Math.max(0.5, cam.scale * 3)) continue;
      bestD = d; best = e;
    }
    return best ? { kind: 'edge', edge: best, index: edgeIndex(best) } : null;
  }

  function pickPlane(mx, my) {
    var faces = groups.planes.children.filter(function (o) { return o.userData.face; });
    if (!faces.length) return null;
    raycaster.setFromCamera(ndc(mx, my), camera);
    var hits = raycaster.intersectObjects(faces, false);
    if (!hits.length) return null;
    var u = hits[0].object.userData;
    return { kind: 'plane', ref: u.ref, plane: u.plane, name: u.name, point: [hits[0].point.x, hits[0].point.y, hits[0].point.z] };
  }
  // The sketch entity whose drawn curve passes within 7 px of (mx, my): { kind: 'entity', index }, or null.
  // rfF: pickEntityDist(mx, my) -> { hit, d } also gives the pixel distance (the Select tool weighs it against a point's).
  function pickEntity(mx, my) { return pickEntityDist(mx, my).hit; }
  function pickEntityDist(mx, my) {
    var f = activeSketchFeature();
    if (!f) return { hit: null, d: Infinity };
    var pl = activePlane(), best = null, bestD = 7;
    f.entities.forEach(function (e, i) {
      if (UI.entityLayerHidden && UI.entityLayerHidden(f, e)) return;   // sketch-layers: a hidden layer is not picked
      var pls = screenPolylines(e);   // r15/snapaudit15: the curve as drawn, not the model's chord polygon (a click between its facets picked nothing when zoomed in)
      if (e.t === 'point') pls = [{ pts: [[e.x, e.y], [e.x, e.y]], closed: false }];
      pls.forEach(function (l) {
        var n = l.pts.length, cnt = l.closed ? n : n - 1;
        var scr = l.pts.map(function (q) { return worldToScreen(K.to3D(pl, q[0], q[1])); });
        for (var k = 0; k < Math.max(cnt, 1); k++) {
          var a = scr[k], b = scr[(k + 1) % n] || a;
          var d = distToSegment([mx, my], a, b);
          if (d < bestD) { bestD = d; best = { kind: 'entity', index: i }; }
        }
      });
    });
    return { hit: best, d: best ? bestD : Infinity };
  }
  function distToSegment(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  // ------------------------------------------------------------------ triad
  // r14/viewui14: the triad is live as in SolidWorks. Hover over an axis lights it up (thicker, with a ring round its
  // letter); a click turns the view to look along it (X = Right, Y = Top, Z = Front, zoomed to fit), and a second click
  // on the same axis looks from the opposite side. Shift + click turns the view 90° about that axis, Ctrl + Shift + click
  // -90°. Only the axes take the mouse: a press anywhere else on the triad goes to the graphics area as before.
  var triadCanvas = $('triad'), tctx = triadCanvas.getContext('2d');
  var triadState = { items: [], hover: -1, basis: null };
  var TRIAD_AXES = [[[1, 0, 0], '#d9453b', 'X'], [[0, 1, 0], '#3fa34d', 'Y'], [[0, 0, 1], '#2d7dd2', 'Z']], TRIAD_U = 192;
  function drawTriad(right, up, dir) {
    if (right) triadState.basis = [right, up, dir];
    else if (triadState.basis && viewAnim) { right = triadState.basis[0]; up = triadState.basis[1]; dir = triadState.basis[2]; }
    right = right || cam.right; up = up || cam.up; dir = dir || cam.dir;
    // rfHA: the canvas is 96 CSS px drawn at the screen's own pixel density (it was a fixed 192 px bitmap, resampled to
    // 144 device px at 150 %: soft shafts and letters); the drawing stays in 192 logical units
    var tcss = triadCanvas.clientWidth || 96, tdev = Math.max(96, Math.round(tcss * (window.devicePixelRatio || 1)));
    if (triadCanvas.width !== tdev) { triadCanvas.width = tdev; triadCanvas.height = tdev; }
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, tdev, tdev);
    tctx.setTransform(tdev / TRIAD_U, 0, 0, tdev / TRIAD_U, 0, 0);
    var w = TRIAD_U, h = TRIAD_U, c = [w / 2, h / 2 + 8], L = w * 0.34;
    var items = TRIAD_AXES.map(function (a, i) {
      var v = new THREE.Vector3(a[0][0], a[0][1], a[0][2]);
      return { axis: i, x: v.dot(right), y: v.dot(up), z: v.dot(dir), color: a[1], label: a[2] };
    }).sort(function (p, q) { return p.z - q.z; });
    var dark = darkViewport();
    tctx.lineCap = 'round'; tctx.lineJoin = 'round'; tctx.font = '600 22px Segoe UI, sans-serif'; tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
    // a small ball at the origin, like SolidWorks' triad
    tctx.fillStyle = dark ? '#a0a0a0' : '#6e6e6e'; tctx.beginPath(); tctx.arc(c[0], c[1], 4, 0, Math.PI * 2); tctx.fill();
    triadState.items = [];
    items.forEach(function (it) {
      var hot = it.axis === triadState.hover;
      var ex = c[0] + it.x * L, ey = c[1] - it.y * L, lx = c[0] + it.x * (L + 18), ly = c[1] - it.y * (L + 18);
      if (hot) { tctx.fillStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)'; tctx.beginPath(); tctx.arc(lx, ly, 17, 0, Math.PI * 2); tctx.fill(); }
      tctx.lineWidth = hot ? 7 : 4;
      tctx.strokeStyle = it.color; tctx.beginPath(); tctx.moveTo(c[0], c[1]); tctx.lineTo(ex, ey); tctx.stroke();
      // arrow head
      var len = Math.hypot(ex - c[0], ey - c[1]);
      if (len > 14) {
        var ux = (ex - c[0]) / len, uy = (ey - c[1]) / len, hs = hot ? 13 : 10;
        tctx.fillStyle = it.color; tctx.beginPath(); tctx.moveTo(ex + ux * 4, ey + uy * 4);
        tctx.lineTo(ex - ux * hs - uy * hs * 0.5, ey - uy * hs + ux * hs * 0.5); tctx.lineTo(ex - ux * hs + uy * hs * 0.5, ey - uy * hs - ux * hs * 0.5); tctx.closePath(); tctx.fill();
      }
      if (hot) { tctx.strokeStyle = it.color; tctx.lineWidth = 2.5; tctx.beginPath(); tctx.arc(lx, ly, 15, 0, Math.PI * 2); tctx.stroke(); }
      tctx.lineWidth = 5; tctx.strokeStyle = 'rgba(12,12,12,0.6)'; tctx.strokeText(it.label, lx, ly);   // rfHA: a dark halo, as the dimension labels
      tctx.fillStyle = it.color; tctx.fillText(it.label, lx, ly);
      triadState.items.push({ axis: it.axis, z: it.z, a: c, b: [ex, ey], l: [lx, ly] });
    });
  }
  // the axis under a point of the triad canvas (CSS px from its top left), or -1; the one nearest the viewer wins
  function triadAxisAt(px, py) {
    var k = TRIAD_U / Math.max(1, triadCanvas.clientWidth || 96), p = [px * k, py * k], best = -1, bestZ = -Infinity;
    triadState.items.forEach(function (it) {
      // the shaft (when it is not seen end-on) or the letter
      var shaft = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) > 12 ? distToSegment(p, [it.a[0] + (it.b[0] - it.a[0]) * 0.25, it.a[1] + (it.b[1] - it.a[1]) * 0.25], it.b) : Infinity;
      var d = Math.min(shaft, Math.hypot(p[0] - it.l[0], p[1] - it.l[1]) - 8);
      if (d < 12 && it.z > bestZ) { best = it.axis; bestZ = it.z; }
    });
    return best;
  }
  function setTriadHover(i) {
    if (i === triadState.hover) return;
    triadState.hover = i;
    triadCanvas.style.cursor = i >= 0 ? 'pointer' : '';
    triadCanvas.title = i >= 0 ? 'View along ' + 'XYZ'[i] + ' (click again: the opposite side). Shift+click: rotate 90° about ' + 'XYZ'[i] : '';
    drawTriad();
  }
  // Orient the view to look along world direction d (towards the viewer) with up u, glide there and zoom to fit.
  function orientView(d, u, fit) {
    var from = viewPose();
    settleViewAnimation(); zoomMomentum.pending = 0;
    pushViewHistory();
    cam.dir.set(d[0], d[1], d[2]).normalize(); cam.up.set(u[0], u[1], u[2]);
    applyCamera();
    if (fit !== false) fitCam(modelBounds());
    animateViewFrom(from);
  }
  // the up vector for looking along d: world Y unless d is (anti)parallel to it, then -Z / +Z as for Top / Bottom
  function upFor(d) {
    var n = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    if (Math.abs(n.y) > 0.999) return n.y > 0 ? [0, 0, -1] : [0, 0, 1];
    return [0, 1, 0];
  }
  var TRIAD_VIEWS = [['Right', 'Left'], ['Top', 'Bottom'], ['Front', 'Back']];
  // UI.triadClick(axis 0 | 1 | 2, { shiftKey, ctrlKey }) -> the view name, or 'rotate'
  function triadClick(axis, ev) {
    var e = [0, 0, 0]; e[axis] = 1;
    if (ev && ev.shiftKey) {
      // rotate 90° about the world axis (Ctrl + Shift: the other way), about the model's centre
      var from = viewPose();
      settleViewAnimation(); zoomMomentum.pending = 0;
      pushViewHistory();
      var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(e[0], e[1], e[2]), (ev.ctrlKey ? -1 : 1) * Math.PI / 2);
      var pivot = rotatePivot(), off = pivot ? cam.target.clone().sub(pivot).applyQuaternion(q) : null;
      cam.dir.applyQuaternion(q).normalize(); cam.up.applyQuaternion(q);
      if (off) cam.target.copy(pivot).add(off);
      applyCamera();
      animateViewFrom(from);
      return 'rotate';
    }
    var name = TRIAD_VIEWS[axis][cam.dir.getComponent(axis) > 0.999 ? 1 : 0];
    setView(name);
    return name;
  }
  function triadLocal(ev) { var r = triadCanvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  triadCanvas.addEventListener('mousemove', function (ev) { if (!ev.buttons) { var p = triadLocal(ev); setTriadHover(triadAxisAt(p[0], p[1])); } });
  triadCanvas.addEventListener('mouseleave', function () { setTriadHover(-1); });
  triadCanvas.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0) return;
    var p = triadLocal(ev), a = triadAxisAt(p[0], p[1]);
    if (a < 0) return;   // not on an axis: the graphics area takes the press (rotate, box select...)
    ev.stopPropagation(); ev.preventDefault();
    triadClick(a, ev);
  });

  // ------------------------------------------------------------------ View Selector (r14/viewui14)
  // SolidWorks' View Selector: Space (or the heads-up View Orientation button) shows a cube in the middle of the graphics
  // area, turned like the model. Each face is split 3 × 3: the middle picks the face's standard view (Front, Top...),
  // the strips the edge views between two faces and the corners the isometric views of the eight corners. The region
  // under the mouse lights up orange; a click glides the view there and zooms to fit, and the cube goes away. Esc, Space
  // again or a press anywhere else closes it. A 2D canvas (an orthographic projection of the 26 regions), drawn only
  // while it is shown, so it costs nothing otherwise; it follows the view while a transition or an orbit runs.
  var vsCanvas = el('canvas', { id: 'view-selector', 'aria-label': 'View Selector' });
  vsCanvas.hidden = true;
  viewport.appendChild(vsCanvas);
  var vsCtx = vsCanvas.getContext('2d');
  var vs = { shown: false, hover: null, cells: [], size: 0 };
  var VS_FACE_NAMES = { '1,0,0': 'Right', '-1,0,0': 'Left', '0,1,0': 'Top', '0,-1,0': 'Bottom', '0,0,1': 'Front', '0,0,-1': 'Back' };
  // text axes (right, up) for each face's name, so it reads upright in that face's standard view
  var VS_TEXT = { '1,0,0': [[0, 0, -1], [0, 1, 0]], '-1,0,0': [[0, 0, 1], [0, 1, 0]], '0,1,0': [[1, 0, 0], [0, 0, -1]], '0,-1,0': [[1, 0, 0], [0, 0, 1]], '0,0,1': [[1, 0, 0], [0, 1, 0]], '0,0,-1': [[-1, 0, 0], [0, 1, 0]] };
  var VS_B = [-1, -0.56, 0.56, 1];   // cell bounds across a face (the edge and corner strips are 0.44 of 2 wide)
  var vsFaces = (function () {
    var out = [];
    for (var k = 0; k < 3; k++) for (var s = -1; s <= 1; s += 2) {
      var u = (k + 1) % 3, v = (k + 2) % 3, cells = [];
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        var d = [0, 0, 0]; d[k] = s; d[u] = i - 1; d[v] = j - 1;
        var q = [[VS_B[i], VS_B[j]], [VS_B[i + 1], VS_B[j]], [VS_B[i + 1], VS_B[j + 1]], [VS_B[i], VS_B[j + 1]]].map(function (ab) { var p = [0, 0, 0]; p[k] = s; p[u] = ab[0]; p[v] = ab[1]; return p; });
        cells.push({ dir: d, id: d.join(','), quad: q });
      }
      var n = [0, 0, 0]; n[k] = s;
      out.push({ n: n, id: n.join(','), cells: cells });
    }
    return out;
  })();
  function vsBasis() { return triadState.basis && viewAnim ? triadState.basis : [cam.right, cam.up, cam.dir]; }
  // lane DA: as in SolidWorks the cube sits on the model (the screen point of the model's bounding-box centre), not
  // in the middle of the window; clamped so all of it stays inside the graphics area (the middle when there is no
  // model or the area is smaller than the cube). It follows the model while the view turns.
  function placeViewSelector(S) {
    var c = sceneCenter(), p = c && isFinite(c[0] + c[1] + c[2]) ? worldToScreen(c) : null, m = 4;
    if (!p || !isFinite(p[0] + p[1])) p = [size.w / 2, size.h / 2];
    var x = size.w < S + 2 * m ? size.w / 2 : Math.max(S / 2 + m, Math.min(size.w - S / 2 - m, p[0]));
    var y = size.h < S + 2 * m ? size.h / 2 : Math.max(S / 2 + m, Math.min(size.h - S / 2 - m, p[1]));
    var l = Math.round(x) + 'px', t = Math.round(y) + 'px';
    if (vsCanvas.style.left !== l) vsCanvas.style.left = l;
    if (vsCanvas.style.top !== t) vsCanvas.style.top = t;
  }
  // lane DA: the View Orientation menu that comes up with the cube (Space at the pointer, or the heads-up button)
  // never covers it: a menu that overlaps the cube moves beside it (right, else left, else below / above), inside the
  // window. Run when the cube shows and once more after the current task (Space shows the cube before the menu).
  function vsMenuClear() {
    if (!vs.shown) return;
    var menu = document.querySelector('body > .menu'), c = vsCanvas.getBoundingClientRect();
    if (!menu || !c.width) return;
    var r = menu.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, g = 8;
    if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) return;
    var top = Math.max(4, Math.min(H - 4 - r.height, r.top)), left = null;
    if (c.right + g + r.width <= W - 4) left = c.right + g;
    else if (c.left - g - r.width >= 4) left = c.left - g - r.width;
    else {
      left = Math.max(4, Math.min(W - 4 - r.width, r.left));
      top = c.bottom + g + r.height <= H - 4 ? c.bottom + g : Math.max(4, c.top - g - r.height);
    }
    menu.style.left = Math.round(left) + 'px'; menu.style.top = Math.round(top) + 'px';
  }
  function drawViewSelector() {
    if (!vs.shown) return;
    var dpr = window.devicePixelRatio || 1, S = Math.round(Math.max(170, Math.min(280, Math.min(size.w, size.h) * 0.46)));
    if (vs.size !== S || vsCanvas.width !== Math.round(S * dpr)) {
      vs.size = S; vsCanvas.width = Math.round(S * dpr); vsCanvas.height = Math.round(S * dpr);
      vsCanvas.style.width = S + 'px'; vsCanvas.style.height = S + 'px';
    }
    placeViewSelector(S);   // lane DA
    var b = vsBasis(), R = b[0], U = b[1], D = b[2], half = S / 2, r = S * 0.285;   // cube half-size in px (its diagonal fits)
    function P(p) { return [half + (p[0] * R.x + p[1] * R.y + p[2] * R.z) * r, half - (p[0] * U.x + p[1] * U.y + p[2] * U.z) * r]; }
    function path(q) { g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (var i = 1; i < q.length; i++) g.lineTo(q[i][0], q[i][1]); g.closePath(); }
    var g = vsCtx, dark = darkViewport();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    vs.cells = [];
    // (user 2026-11-04, redesign) a solid, lit cube instead of the see-through wireframe: only the faces towards the
    // viewer are drawn (no back grid showing through), each face shaded by how it faces the viewer and the light (from
    // the upper left, as the model's key light); the edge and corner regions are a shade darker, like bevels, so the
    // three kinds of region read at a glance; a soft drop shadow lifts it off the graphics area; the hovered region is
    // orange with its name in white.
    var hull = (function () {
      var pts = [];
      for (var i = 0; i < 8; i++) pts.push(P([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]));
      pts.sort(function (a, c) { return a[0] - c[0] || a[1] - c[1]; });
      function cross(o, a, c) { return (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]); }
      var lo = [], hi = [];
      pts.forEach(function (p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
      pts.slice().reverse().forEach(function (p) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); });
      return lo.slice(0, -1).concat(hi.slice(0, -1));
    })();
    var base = dark ? [74, 76, 80] : [250, 250, 251], ink = dark ? '#eeeeee' : '#2b2b2b';
    g.save();
    path(hull);
    g.shadowColor = dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.22)'; g.shadowBlur = 18; g.shadowOffsetY = 5;
    g.fillStyle = 'rgb(' + base.join(',') + ')'; g.fill();
    g.restore();
    var L = [-0.45, 0.75, 0.48];   // light in view space (right, up, towards the viewer)
    function tone(k) { return 'rgb(' + base.map(function (x) { return Math.round(Math.max(0, Math.min(255, x * k))); }).join(',') + ')'; }
    var faces = vsFaces.map(function (f) { return { f: f, z: f.n[0] * D.x + f.n[1] * D.y + f.n[2] * D.z }; }).filter(function (fz) { return fz.z > 0.02; }).sort(function (a, c) { return a.z - c.z; });
    faces.forEach(function (fz) {
      var f = fz.f, n = f.n;
      var vr = n[0] * R.x + n[1] * R.y + n[2] * R.z, vu = n[0] * U.x + n[1] * U.y + n[2] * U.z;
      var lit = Math.max(0, vr * L[0] + vu * L[1] + fz.z * L[2]), k = dark ? 0.82 + 0.34 * lit : 0.86 + 0.15 * lit;
      f.cells.forEach(function (c) {
        var q = c.quad.map(P), kind = c.dir.filter(function (x) { return x; }).length;   // 1 face, 2 edge, 3 corner
        path(q);
        g.fillStyle = vs.hover === c.id ? '#ff9a2e' : tone(kind === 1 ? k : k * (kind === 2 ? 0.935 : 0.89));
        g.fill();
        g.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.09)'; g.lineWidth = 1; g.stroke();
        vs.cells.push({ id: c.id, dir: c.dir, q: q, z: fz.z });
      });
      // the face's outline, crisper than the region seams
      var fk = n[0] ? 0 : n[1] ? 1 : 2, fu = (fk + 1) % 3, fv = (fk + 2) % 3;
      path([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (ab) { var p = n.slice(); p[fu] = ab[0]; p[fv] = ab[1]; return P(p); }));
      g.strokeStyle = dark ? 'rgba(225,225,225,0.55)' : 'rgba(55,55,55,0.55)'; g.lineWidth = 1.25; g.lineJoin = 'round'; g.stroke();
      if (fz.z > 0.25) {
        // the face's name in the face's own plane (an affine map, as the projection is orthographic)
        var t = VS_TEXT[f.id], o = P(n), pr = P([n[0] + t[0][0], n[1] + t[0][1], n[2] + t[0][2]]), pu = P([n[0] + t[1][0], n[1] + t[1][1], n[2] + t[1][2]]);
        var ax = (pr[0] - o[0]) / 100, ay = (pr[1] - o[1]) / 100, bx = (pu[0] - o[0]) / 100, by = (pu[1] - o[1]) / 100;
        g.save();
        g.setTransform(dpr * ax, dpr * ay, -dpr * bx, -dpr * by, dpr * o[0], dpr * o[1]);
        g.globalAlpha = Math.min(1, (fz.z - 0.25) / 0.35);
        g.fillStyle = vs.hover === f.id ? '#ffffff' : ink;
        g.font = '600 36px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(VS_FACE_NAMES[f.id], 0, 0);
        g.restore();
      }
    });
  }
  function vsPick(px, py) {
    var hit = null;
    vs.cells.forEach(function (c) {
      var inside = true, sgn = 0;
      for (var i = 0; i < 4 && inside; i++) {
        var a = c.q[i], b = c.q[(i + 1) % 4], cr = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
        if (Math.abs(cr) < 1e-9) continue;
        if (!sgn) sgn = cr > 0 ? 1 : -1; else if ((cr > 0 ? 1 : -1) !== sgn) inside = false;
      }
      if (inside && (!hit || c.z > hit.z)) hit = c;
    });
    return hit;
  }
  function showViewSelector() {
    vs.shown = true; vs.hover = null; vsCanvas.hidden = false;
    drawViewSelector();
    vsMenuClear(); Promise.resolve().then(vsMenuClear);   // lane DA: the menu may open just after the cube (Space)
    return true;
  }
  function hideViewSelector() {
    if (!vs.shown) return false;
    vs.shown = false; vs.hover = null; vsCanvas.hidden = true;
    return true;
  }
  function viewSelectorShown() { return vs.shown; }
  // UI.viewSelectorPick(id): orient to a region by id ('1,1,1' the top front right corner, '0,0,1' Front, '1,0,1' the
  // front-right edge); closes the selector. False for an id that is not a region.
  function viewSelectorPick(id) {
    var d = String(id).split(',').map(Number);
    if (d.length !== 3 || d.some(function (x) { return isNaN(x) || Math.abs(x) > 1; }) || (!d[0] && !d[1] && !d[2])) return false;
    hideViewSelector();
    orientView(d, upFor(d));
    return true;
  }
  function vsLocal(ev) { var r = vsCanvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function vsTitle(h) {
    if (!h) return '';
    var n = h.dir.filter(function (x) { return x; }).length;
    return VS_FACE_NAMES[h.id] || (n === 3 ? 'Corner (isometric)' : 'Edge');
  }
  vsCanvas.addEventListener('mousemove', function (ev) {
    if (ev.buttons) return;   // a middle drag that started on or crossed the cube still rotates the view (window listener)
    ev.stopPropagation();   // no pre-highlight of the model under the cube
    var p = vsLocal(ev), h = vsPick(p[0], p[1]), id = h ? h.id : null;
    vsCanvas.style.cursor = h ? 'pointer' : '';
    if (id !== vs.hover) { vs.hover = id; vsCanvas.title = vsTitle(h); drawViewSelector(); }
  });
  vsCanvas.addEventListener('mouseleave', function () { if (vs.hover) { vs.hover = null; drawViewSelector(); } });
  vsCanvas.addEventListener('mousedown', function (ev) {
    if (ev.button === 1) { vs.hover = null; drawViewSelector(); return; }   // middle drag: rotate / pan / zoom with the cube up
    var p = vsLocal(ev), h = ev.button === 0 ? vsPick(p[0], p[1]) : null;
    if (!h) { hideViewSelector(); return; }   // off the cube: closes it, and the graphics area takes the press
    ev.stopPropagation(); ev.preventDefault();
    viewSelectorPick(h.id);
  });
  // a press anywhere else closes it (the View Orientation menu and the heads-up toolbar leave it open). The middle
  // button does not (user 2026-11-04: "mmb view rotation still works not cancels the menu"): it rotates (Ctrl pans,
  // Shift zooms) the view and the cube turns with it, as SolidWorks' View Selector does; so does the wheel.
  document.addEventListener('mousedown', function (ev) {
    if (!vs.shown || ev.target === vsCanvas || ev.button === 1) return;
    if (ev.target.closest && ev.target.closest('.menu, #hud')) return;
    hideViewSelector();
  }, true);
  // the cube is a menu: Esc closes it (and the orientation menu with it) and nothing else (lane CG: not the command under it)
  window.addEventListener('keydown', function (ev) { if (vs.shown && ev.key === 'Escape') { hideViewSelector(); if (UI.closeMenus) UI.closeMenus(); ev.preventDefault(); ev.stopPropagation(); } }, true);

  // ------------------------------------------------------------------ render loop
  // The frame loop draws only when something changed: a camera move, a view transition or eased zoom in progress, an
  // explicit render(), or any change in the scene graph (objects added / removed / shown / hidden / moved, material or
  // geometry updates — sceneSignature, a cheap walk over the few hundred scene objects), plus a 1 s safety redraw.
  // An idle viewport therefore costs no GPU time, and every interactive change is drawn on the very next frame.
  var needsRender = true, lastSig = null, lastRenderAt = 0;
  var tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3(), boxSig = null;
  // The camera (and the lights riding on it) are left out: render() poses it for transitions and puts it back.
  function sceneSignature() {
    var hi = 0, hf = 0;
    function visit(o) {
      if (o === camera) return;
      hi = (hi * 31 + o.id * 7 + (o.visible ? 1 : 2) + o.renderOrder * 3) | 0;
      hf += o.position.x * 1.3 + o.position.y * 1.7 + o.position.z * 2.3 + o.quaternion.x + o.quaternion.y * 1.1 + o.quaternion.z * 1.3 + o.scale.x + o.scale.y * 1.5 + o.scale.z * 1.9;
      var m = o.material;
      if (m) {
        if (Array.isArray(m)) m = m[0];
        hi = (hi * 31 + m.id * 5 + m.version + (m.visible ? 1 : 2)) | 0;
        if (m.color) hf += m.color.r * 3.1 + m.color.g * 5.3 + m.color.b * 7.7;
        hf += m.opacity * 1.9;
        if (m.clippingPlanes && m.clippingPlanes.length) { var cp = m.clippingPlanes[0]; hf += cp.constant * 1.1 + cp.normal.x + cp.normal.y * 1.3 + cp.normal.z * 1.7; }
      }
      var g = o.geometry;
      if (g) {
        var pa = g.attributes && g.attributes.position;
        hi = (hi * 31 + g.id + (pa ? pa.version * 13 + pa.count : 0) + (g.index ? g.index.version : 0)) | 0;
      }
      for (var i = 0; i < o.children.length; i++) visit(o.children[i]);
    }
    visit(scene);
    return hi + '|' + hf + '|' + size.w + 'x' + size.h;
  }
  // Depth range fitted to what is in the scene (both views of it while a transition runs): an orthographic camera can
  // take any near / far, and a range a few times the model instead of 20 m keeps the depth buffer fine enough that
  // edges, highlights and coincident faces do not z-fight. Picking keeps the fixed range (it is restored after drawing).
  // The scene's box is recomputed only when the scene signature changes.
  function fitDepth(target, dir, sig) {
    if (sig !== boxSig) { boxSig = sig; tmpBox.makeEmpty(); tmpBox.setFromObject(scene); }
    if (tmpBox.isEmpty() || !isFinite(tmpBox.min.x) || !isFinite(tmpBox.max.x)) return;
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < 8; i++) {
      tmpV.set(i & 1 ? tmpBox.max.x : tmpBox.min.x, i & 2 ? tmpBox.max.y : tmpBox.min.y, i & 4 ? tmpBox.max.z : tmpBox.min.z);
      var d = DIST - tmpV.sub(target).dot(dir);
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    var pad = Math.max(1, (hi - lo) * 0.25), near = lo - pad, far = hi + pad;
    // rfHY: the camera also moves up to just in front of the scene for the draw. At DIST (10 000) every view-space z the
    // GPU computes in float32 is rounded to ~0.001 model units, hundreds of depth steps of a fitted range: an edge line
    // lying on a face seen square-on (no slope offset) then won or lost against that face by rounding, segment by
    // segment (the washer rim drawn as dashes, one per facet). In front of the scene the rounding is about one step.
    var shift = near - Math.max(1e-3, (far - near) * 0.02);
    if (shift > 0) {
      camera.position.addScaledVector(dir, -shift);
      camera.updateMatrixWorld();
      near -= shift; far -= shift;
    }
    camera.near = near; camera.far = far;
    camera.updateProjectionMatrix();
  }
  // rfHD: { draw(info) -> true when it drew the frame, idle(now) -> true when it wants a still pass } (ui-render-fx.js)
  var renderHooks = { draw: null, idle: null };
  function render(sig, mode) {
    updateGrid();
    syncFatLines(scene);   // r13/lines13: thick lines follow their line objects (before the signature: new children count)
    if (typeof sig !== 'string') sig = sceneSignature();
    var pose = null, dir = cam.dir, up = cam.up, right = cam.right;
    if (viewAnim) {
      var u = animU();
      if (u >= 1) finishViewAnimation();
      else {
        pose = lerpPose(viewAnim.from, viewAnim.to, u);
        var e = new THREE.Matrix4().makeRotationFromQuaternion(pose.q).elements;
        right = new THREE.Vector3(e[0], e[1], e[2]); up = new THREE.Vector3(e[4], e[5], e[6]); dir = new THREE.Vector3(e[8], e[9], e[10]);
        poseCamera(pose.target, dir, up, pose.scale);
      }
    }
    fitDepth(pose ? pose.target : cam.target, dir, sig);
    silMat.uniforms.viewDir.value.copy(dir);
    syncFatFrame();
    renderer.clear();
    // rfHD: ui-render-fx.js draws the frame itself (ambient occlusion, floor shadow, still-view smoothing) when it
    // returns true; mode 'plain' (UI.render(): tests, anvil.png) only tells it a plain frame is on screen
    var fxHook = renderHooks.draw;
    if (!fxHook || !fxHook({ mode: mode || 'plain', sig: sig, moving: !!pose || !!zoomMomentum.pending })) renderer.render(scene, camera);
    // back to the logical camera with the fixed depth range (picking, worldToScreen and scripts use it)
    poseCamera(cam.target, cam.dir, cam.up, cam.scale);
    drawTriad(right, up, dir);
    updateScaleBarAndFurniture();
    if (vs.shown) drawViewSelector();   // r14/viewui14: the View Selector turns with the view
    if (UI.drawDims && App.dimsStale && !viewAnim) { App.dimsStale = false; UI.drawDims(); }
    needsRender = false;
    lastRenderAt = performance.now();
    lastSig = sig;
  }
  // r15/scalebar15: the scale bar at the bottom right of the viewport (as Mastercam shows one): a SCALE_BAR_PX bar
  // whose label is its length in model units at the current zoom, a size reference for the eye. Updated per frame
  // (text only when it changes), hidden under a drawing document, which has its own sheet scale.
  var SCALE_BAR_PX = 100, scaleBarShown = null;
  function updateScaleBar() {
    var el = document.getElementById('scale-bar');
    if (!el) return;
    var hide = !!(UI.drawingActive && UI.drawingActive()), u = unitLabel();
    var txt = fmtNum(SCALE_BAR_PX * cam.scale, u === 'in' ? 4 : 2) + ' ' + u, key = (hide ? 'h|' : '') + txt;
    if (key === scaleBarShown) return;
    scaleBarShown = key;
    el.hidden = hide;
    document.getElementById('scale-bar-label').textContent = txt;
  }
  // lane mcdirect: the profile's graphics-window furniture follows every frame (view name, plane names, profile switch)
  function updateScaleBarAndFurniture() { updateScaleBar(); if (UI.viewFurnitureTick) { try { UI.viewFurnitureTick(); } catch (e) { /* the frame goes on */ } } }
  function scaleBarInfo() { return { px: SCALE_BAR_PX, value: SCALE_BAR_PX * cam.scale, text: document.getElementById('scale-bar-label').textContent, hidden: !!document.getElementById('scale-bar').hidden }; }
  function holdCamSig() {
    var e = camera.projectionMatrix.elements;
    return camera.position.toArray().concat(camera.quaternion.toArray(), [camera.zoom, camera.left, camera.right, camera.top, camera.bottom, e[0], e[5], e[10], e[14], size.w, size.h]).join(',');
  }
  // UI.holdFrame(ms): keep the 3D view's last frame for up to ms (ui-occt.js), for as long as the camera does not move
  function holdFrame(ms) { App.holdFrameUntil = performance.now() + ms; App.holdCam = holdCamSig(); }
  // One frame of the loop (exported as UI.tick for measurements).
  function tick(now) {
    now = now || performance.now();
    // r13/lines13: the window moved to a screen with another scale (or the browser zoom changed): redraw at its pixel
    // density, so edges stay sharp and as wide as before in CSS pixels
    var dpr = window.devicePixelRatio || 1;
    if (dpr !== renderer.getPixelRatio()) { renderer.setPixelRatio(dpr); size.w = 0; resize(); }
    stepZoomMomentum(now);
    // ui-occt.js: the 3D view keeps OpenCascade's last frame while its next solid builds; overlays still follow, and a
    // camera that moves (a view change, a zoom, entering a sketch) ends the hold at once (smooth/responsive)
    if (App.holdFrameUntil > now) {
      if (App.holdCam !== holdCamSig() || viewAnim) App.holdFrameUntil = 0;
      else camera.updateMatrixWorld();   // projections (worldToScreen, picking) stay right while the frame is held
    }
    if (App.holdFrameUntil > now) {
      if (UI.drawDims && App.dimsStale) { App.dimsStale = false; UI.drawDims(); }
      return;
    }
    App.holdCam = null;
    if (needsRender || viewAnim || zoomMomentum.pending || App.gridStale || now - lastRenderAt > 1000 || sceneSignature() !== lastSig) render(undefined, 'auto');
    else if (renderHooks.idle && renderHooks.idle(now)) render(lastSig, 'still');   // rfHD: the view is still
    else if (UI.drawDims && App.dimsStale) { App.dimsStale = false; UI.drawDims(); }
  }
  function frame(now) {
    // r11/perf11: the next frame is asked for even when this one throws (an overlay, a hook), so one exception cannot
    // stop the render loop for good and freeze the viewport (same order as before: after the frame's own work)
    try { tick(now); } finally { requestAnimationFrame(frame); }
  }
  function requestRender() { needsRender = true; }

  // ------------------------------------------------------------------ rebuild pipeline
  // Two paths end in applyBuild(): the sync path runs Kernel.rebuild on the main thread (App.buildCache
  // keeps the unchanged feature prefix); the async path posts App.model to worker.js, which keeps its own
  // cache, and applies the packed result when it comes back, after which App.buildCache is rebuilt from the
  // result with Kernel.cacheFromBuild so the next sync build (worker off, opts.sync, or the fallback after a
  // worker error) starts from the last applied body instead of from scratch and the previous cache's bodies
  // are released. A cache is never stale in the sense of being wrong: Kernel.rebuild compares feature keys and
  // only reuses the prefix that still matches, so it is kept across the worker-error fallback on purpose.
  // UI.rebuild() always returns a Promise that
  // resolves to App.build once the build is applied. Sync-path promises carry `applied: true` so that
  // UI.afterRebuild(p, fn) can run the caller's tail immediately, exactly as before the worker existed.
  var wk = {
    worker: null,        // lazily created Worker
    seq: 0,              // last posted sequence number
    inflight: null,      // { seq, waiters: [{resolve, reject}], opts } — the one message in flight
    pending: null,       // { waiters, opts } — calls made while inflight; they all build the latest App.model together
    idle: [],            // resolvers of UI.whenIdle()
    warned: false        // the "background rebuild unavailable" toast is shown once
  };

  // (rfHO) What the part's geometry is built from: the model less its drawings. App.geom = { key, build } names the
  // model the build on screen was made from (set after a kernel build; an OpenCascade swap of that build carries it
  // over, applyBuild). Undo / redo of an edit that left the geometry as it was (a drawing note, a hatch, a dimension)
  // keeps the build and mesh on screen (`keepSame`), as SolidWorks does not rebuild the part for a drawing undo: no
  // new mesh, so the drawing's views are not worked out again, and with OpenCascade on its exact solid stays instead
  // of Anvil's approximation showing until OpenCascade has rebuilt the same part (the sheet waited for that, up to 3 s)
  function geomKey(model) {
    if (!model || model.type === 'assembly') return null;
    try { return JSON.stringify(model, function (k, v) { return k === 'drawings' && this === model ? undefined : v; }); } catch (e) { return null; }
  }
  function noteGeom() { App.geom = App.build && !isAssembly() ? { key: geomKey(App.model), build: App.build } : null; }
  function keepSame() {
    var g = App.geom;
    if (!g || !g.key || g.build !== App.build || !App.mesh || isAssembly()) return false;
    if (App.rollback != null || roll.active || roll.committing || wk.inflight || wk.pending) return false;
    return geomKey(App.model) === g.key;
  }
  function rebuild(opts) {
    rollbarSync();   // rfGQ: a new feature goes in at the rollback bar
    opts = opts || {};
    if (opts.keepSame && keepSame()) {
      applyBuild(App.build, { noSave: !!opts.noSave, keepMs: true, kept: true });
      var kept = Promise.resolve(App.build);
      kept.applied = true;
      return kept;
    }
    // assemblies always build on the main thread (worker.js only knows part models)
    if (!App.workerOn || opts.sync || !window.Worker || isAssembly()) {
      // A request already posted to the worker is answered by this newer build; its reply is then ignored.
      var stale = takeInflight();
      if (stale && !stale.opts.noSave) opts = { noSave: false, sync: opts.sync };
      try { rebuildSync(opts); }
      catch (e) { if (stale) { settle(stale, e); drain(); } throw e; }
      if (stale) { settle(stale, null); drain(); }
      var done = Promise.resolve(App.build);
      done.applied = true;
      return done;
    }
    return new Promise(function (resolve, reject) {
      var w = { resolve: resolve, reject: reject };
      if (wk.inflight) {
        // Coalesce: one message in flight at a time. Everything asked for meanwhile is answered by a single
        // rebuild of the latest App.model, posted when the in-flight reply arrives.
        if (!wk.pending) wk.pending = { waiters: [], opts: { noSave: true } };
        wk.pending.waiters.push(w);
        wk.pending.opts.noSave = !!(wk.pending.opts.noSave && opts.noSave);
        return;
      }
      postRebuild({ waiters: [w], opts: opts });
    });
  }

  function rebuildSync(opts) {
    var t0 = performance.now(), build;
    if (isAssembly()) {
      if (typeof Assembly === 'undefined') throw new Error('Assembly documents need assembly.js');
      if (!App.model.features) App.model.features = [];
      // the assembly's Image Quality applies to every component built for it (parts carry their own otherwise)
      var tsaved = App.model.tessellation ? K.setTessellation({}) : null, tkey = JSON.stringify(App.model.tessellation || null);
      if (App.asmTessKey !== tkey) { App.asmCache = null; App.asmTessKey = tkey; }   // component meshes follow the setting
      try {
        if (tsaved) K.setTessellation(App.model.tessellation);
        build = Assembly.rebuild(App.model, App.asmCache, UI.asmBuildOpts || null);   // asmBuildOpts: the explode animation (ui-assembly.js)
      } finally { if (tsaved) K.setTessellation(tsaved); }
      App.asmCache = build.cache;
      applyBuild(build, opts, performance.now() - t0);
      return;
    }
    build = K.rebuild(App.model, App.buildCache);
    App.buildCache = build.cache;
    applyBuild(build, opts, performance.now() - t0);
    if (App.build === build) noteGeom();   // (rfHO)
  }

  // Everything that happens after the kernel has built the body: mesh, edges, highlights, planes,
  // sketches, tree, status bar, autosave. `msBefore` is the kernel time (main thread or worker).
  function applyBuild(build, opts, msBefore) {
    opts = opts || {};
    // r10/editpreview10: while an Edit Feature shows the part rolled back, OpenCascade's solid of the whole part waits
    // for the roll forward, and so does any build applied while a rolled-back sketch is being edited; any other build
    // (the edit committed, the sketch exited, an undo) ends the rollback
    if (roll.active && !roll.committing && (opts.occt || App.mode === 'sketch')) { roll.deferred = { build: build, opts: opts, ms: msBefore }; return App.build; }
    if (roll.active || roll.committing) clearRollback();
    var t0 = performance.now();
    // lane FO: a body the mesher cannot read leaves the last good part on screen (and in App.build) instead of an
    // empty graphics area; the status bar says why
    var newMesh, prevBuild = App.build;
    // (rfHO) a kept build (undo of an edit that left the geometry alone) keeps its mesh: same edges, same projections
    if (opts.kept && build === App.build && App.mesh) newMesh = App.mesh;
    else try { newMesh = K.meshFromBody(build.body); } catch (e) {
      console.warn('The rebuilt part could not be displayed:', e);
      if (UI.setStatus) UI.setStatus('The rebuilt part could not be displayed (' + ((e && e.message) || e) + '); the last good part is shown.');
      return App.build;
    }
    App.build = build;
    App.mesh = newMesh;
    // (rfHO) OpenCascade's exact solid of the same model takes over the geometry key of the build it replaces
    if (opts.occt && App.geom && App.geom.build === prevBuild) App.geom = { key: App.geom.key, build: build };
    // worker.js found the edges of this same mesh (edgesFor); its volume follows in a 'volume' message (onWorkerMessage)
    if (nextWorker && App.mesh) { App.mesh.workerEdges = nextWorker.edges; App.mesh.workerCurves = nextWorker.curves || null; App.mesh.workerSeq = nextWorker.seq; useWorkerNormals(App.mesh, nextWorker.normals); }
    nextWorker = null;
    if (opts.edges && App.mesh) { App.mesh.workerEdges = opts.edges; App.mesh.workerCurves = opts.curves || null; useWorkerNormals(App.mesh, opts.normals); }   // ui-occt.js: found by occt-worker.js on the same mesh
    var tm = performance.now();
    App.triShared = buildTriShared(App.mesh);
    var tt = performance.now();
    pruneHiddenBodies();
    updateBodyMesh();
    updateFlatState();   // lane DC: Flatten
    var tb = performance.now();
    var nb = bodyCount();
    ['sel', 'sel2'].forEach(function (k) {
      var s = App[k];
      if (!s) return;
      if (s.kind === 'face' && s.index >= App.mesh.faces.length) App[k] = null;
      else if (s.kind === 'body' && s.index >= nb) App[k] = null;
    });
    App.hover = null;
    // keep the pre-selection under a resting cursor across the rebuild instead of dropping it until the mouse moves
    var lm = lastClient && App.mode !== 'sketch' && !viewAnim && UI.pickHover ? lastMousePos() : null;
    if (lm) { try { App.hover = UI.pickHover(lm[0], lm[1]) || null; } catch (e) { App.hover = null; } }
    var th = performance.now();
    updateHighlights();
    updatePlanes();
    updateOrigin();
    updateSketches();
    if (UI.updateCosmeticThreads) UI.updateCosmeticThreads();   // ui-holewizard.js: Straight Tap threads
    if (!opts.keepMs) App.lastRebuildMs = (msBefore || 0) + (performance.now() - t0);
    var tr0 = performance.now();
    if (UI.refreshTree) UI.refreshTree();
    if (UI.refreshStatus) UI.refreshStatus();
    (UI.onBuild || []).forEach(function (fn) { try { fn(App.build, opts); } catch (e) { console.warn(e); } });   // ui-occt.js
    if (!opts.noSave) autosave();
    var te = performance.now();
    // where the main thread spent this apply (ms): mesh, triShared, body mesh / edges, pick + rest, tree / status / hooks
    App.applyMs = { mesh: tm - t0, tri: tt - tm, body: tb - tt, pick: th - tb, scene: tr0 - th, after: te - tr0, total: te - t0 };
    var errIds = Object.keys(App.build.errors || {});
    var eqMsgs = equationErrorMessages(App.build);
    if (eqMsgs.length && UI.setStatus) {
      UI.setStatus(eqMsgs[0] + (eqMsgs.length > 1 ? ' (+' + (eqMsgs.length - 1) + ' more equation errors)' : ''));
    } else if (errIds.length && UI.setStatus) {
      var f;
      if (App.build.assembly && typeof Assembly !== 'undefined') f = Assembly.findComponent(App.model, +errIds[0]) || Assembly.findMate(App.model, +errIds[0]);
      else f = K.findFeature(App.model, +errIds[0]);
      UI.setStatus((f ? f.name : (App.build.assembly ? 'Assembly' : 'Feature')) + ': ' + App.build.errors[errIds[0]]);
    } else if (App.displayWarning && UI.setStatus) UI.setStatus(App.displayWarning);   // lane FO: edges not drawn
    return App.build;
  }

  // ------------------------------------------------------------------ equations
  // build.equationErrors comes from Kernel.resolveEquations: an array of {name, error|msg|message} or strings, or an
  // object keyed by variable name. Normalised here to "Equation W: Unknown variable Q" lines for the status bar.
  function equationErrorMessages(build) {
    var errs = build && build.equationErrors, out = [];
    if (!errs) return out;
    function line(name, msg) {
      if (msg && typeof msg === 'object') msg = msg.error || msg.message || msg.msg || String(msg);
      return 'Equation' + (name ? ' ' + name : '') + ': ' + msg;
    }
    if (Array.isArray(errs)) {
      errs.forEach(function (e) {
        if (typeof e === 'string') out.push(/^Equation\b/.test(e) ? e : line('', e));
        else if (e) out.push(line(e.name, e.error || e.message || e.msg || ''));
      });
    } else if (typeof errs === 'object') {
      Object.keys(errs).forEach(function (k) { out.push(line(k, errs[k])); });
    }
    return out;
  }
  // Current global variable values {name: number}: the last build's, else resolved from the model now.
  function equationVars() {
    if (App.build && App.build.equations && typeof App.build.equations === 'object' && !Array.isArray(App.build.equations)) return App.build.equations;
    if (App.build && App.build.equationVars) return App.build.equationVars;
    if (typeof K.resolveEquations === 'function') {
      try { var r = K.resolveEquations(App.model); return (r && r.vars) || {}; } catch (e) { }
    }
    return {};
  }
  // An equation typed in a value box ("=T*2", variables from Tools ▸ Equations), or plain text the kernel's
  // expression evaluator reads ("T*2" is taken as "=T*2"): {value} or {error}.
  function evalEquation(s) {
    if (typeof K.evalExpression !== 'function') {
      var v = parseFloat(String(s).replace(/^\s*=/, ''));
      return isNaN(v) ? { error: 'Not a number: ' + s } : { value: v };
    }
    var expr = s.charAt(0) === '=' ? s : '=' + s;
    try {
      var n = K.evalExpression(expr, equationVars());
      if (typeof n !== 'number' || !isFinite(n)) return { error: 'Not a number: ' + s };
      return { value: n };
    } catch (err) { return { error: (err && err.message) || String(err) }; }
  }
  // p9-sketch: shop input. What the user typed in any value box -> {value} in the document's units, or {error} with a
  // message for the user. "=…" is an equation, evaluated by the kernel exactly as before; anything else is read by
  // SketchSolver.parseValue: decimals (.375), fractions (3/8), mixed numbers (1-1/2, 1 1/2), unit suffixes converted
  // to the document's units (25mm in an inch part -> 0.984252), feet-inches (1' 6"), angles (45deg, 45°) and
  // arithmetic (2*3/8, 1.5+1/16). opts.kind: 'length' | 'angle' | 'number' | 'any' (the default: both kinds of unit);
  // opts.units overrides the document's 'in' | 'mm'. A name that is no unit falls back to the equation evaluator
  // (an equation variable typed without "=", as before).
  function parseLength(text, opts) {
    opts = opts || {};
    var s = String(text == null ? '' : text).trim();
    if (!s) return { error: 'Enter a value' };
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { value: parseFloat(s) };
    if (s.charAt(0) === '=') return evalEquation(s);
    var S = window.SketchSolver;
    if (!S || !S.parseValue) return evalEquation(s);
    var r = S.parseValue(s, { kind: opts.kind || 'any', units: opts.units || unitLabel() });
    if (r.ident) { var q = evalEquation(s); return q.error != null ? { error: r.error } : q; }
    return r.error != null ? { error: r.error } : { value: r.value };
  }
  // Evaluate what the user typed in a numeric box (kept for its callers): parseLength with opts.
  function evalInput(text, opts) { return parseLength(text, opts); }

  // Run fn once the build behind promise p is applied: immediately when p came from the sync path
  // (so callers that read App.build / App.mesh straight afterwards behave as before), else in .then().
  function afterRebuild(p, fn) {
    if (p && p.applied) {
      var r = fn(App.build);
      return r && typeof r.then === 'function' ? r : Promise.resolve(r);
    }
    return p.then(fn);
  }

  function whenIdle() {
    if (!wk.inflight && !wk.pending) return Promise.resolve();
    return new Promise(function (resolve) { wk.idle.push(resolve); });
  }

  function getWorker() {
    if (!App.workerOn || !window.Worker) return null;
    if (wk.worker) return wk.worker;
    try {
      wk.worker = new Worker('worker.js');
      wk.worker.onmessage = onWorkerMessage;
      wk.worker.onerror = onWorkerError;        // also fires when worker.js itself fails to load
      wk.worker.onmessageerror = onWorkerError;
    } catch (e) { disableWorker(e); return null; }
    return wk.worker;
  }

  function disableWorker(err) {
    App.workerOn = false;
    if (wk.worker) { try { wk.worker.terminate(); } catch (e) { } }
    wk.worker = null;
    dropPreviews();
    if (!wk.warned) {
      wk.warned = true;
      if (err) console.warn('Anvil: background rebuild disabled —', (err && err.message) || err);
      if (UI.toast) UI.toast('Background rebuild unavailable; rebuilding on the main thread.');
    }
  }

  function postRebuild(req) {
    var w = isAssembly() ? null : getWorker();   // a request queued before an assembly was loaded is served here
    if (!w) { finishSync(req); return; }
    req.seq = ++wk.seq;
    wk.inflight = req;
    try { w.postMessage({ type: 'rebuild', seq: req.seq, model: App.model }); }
    catch (e) { wk.inflight = null; disableWorker(e); finishSync(req); return; }   // e.g. an uncloneable value in the model
    setBusy(true);
  }

  // A pending request wants the same latest App.model as req, so it is folded in and answered together.
  function foldPending(req) {
    if (!wk.pending) return req;
    var p = wk.pending; wk.pending = null;
    req.waiters = req.waiters.concat(p.waiters);
    req.opts = { noSave: !!(req.opts.noSave && p.opts.noSave) };
    return req;
  }

  // Detach the in-flight request (plus anything pending behind it) so a newer build made elsewhere can
  // answer it; the worker's eventual reply no longer matches wk.inflight and is dropped as stale.
  function takeInflight() {
    var req = wk.inflight;
    if (!req) return null;
    wk.inflight = null; wk.seq++;
    return foldPending(req);
  }

  // Serve a request on the main thread (worker off or broken).
  function finishSync(req) {
    foldPending(req);
    try { rebuildSync(req.opts); }
    catch (e) { console.error(e); settle(req, e); drain(); return; }
    settle(req, null);
    drain();
  }

  function settle(req, err) {
    req.waiters.forEach(function (w) { if (err) w.reject(err); else w.resolve(App.build); });
  }

  // After a reply: post what accumulated meanwhile, or announce idle. The idle check is deferred one
  // microtask so the callers' .then() tails (which may queue another rebuild) run first.
  function drain() {
    if (wk.pending && !wk.inflight) { var p = wk.pending; wk.pending = null; postRebuild(p); }
    Promise.resolve().then(function () {
      if (wk.inflight || wk.pending) return;
      setBusy(false);
      var ws = wk.idle; wk.idle = [];
      ws.forEach(function (r) { r(); });
    });
  }

  // ---- PropertyManager live previews in the worker (smooth/responsive). One preview in flight at a time; a request
  // made meanwhile waits as `pending`, and a newer one replaces it (its promise resolves to { superseded: true }), so
  // typing or spinning a value never queues stale previews and the main thread only unpacks the result.
  // req: { op: 'tool' | 'shell' | 'edge' | 'flange' | 'jog', feature, upto: feature count or null, throughLimit }
  // -> Promise of { tools: [CSG | null], info, ms } (rejects with the kernel's message), or null when the worker is
  // off (the caller then previews on the main thread); a promise may also resolve to null when the worker dies.
  var pv = { seq: 0, inflight: null, pending: null };
  var nextWorker = null;   // { edges, seq } sent with the worker build being applied (onWorkerMessage -> applyBuild)
  function previewInWorker(req) {
    if (isAssembly() || !getWorker()) return null;
    return new Promise(function (resolve, reject) {
      var job = { req: req, resolve: resolve, reject: reject };
      if (pv.inflight) {
        if (pv.pending) pv.pending.resolve({ superseded: true });
        pv.pending = job;
        return;
      }
      postPreview(job);
    });
  }
  function postPreview(job) {
    var w = getWorker();
    if (!w) { job.resolve(null); return; }
    job.seq = ++pv.seq;
    pv.inflight = job;
    var r = job.req;
    // r10/editpreview10: a rollback still waiting for its part goes along with the first preview posted
    var base = roll.want != null && !roll.active && !roll.posted ? roll.want : null;
    if (base != null) roll.posted = true;
    try { w.postMessage({ type: 'preview', seq: job.seq, model: App.model, upto: r.upto == null ? null : r.upto, op: r.op, feature: r.feature, throughLimit: r.throughLimit, sketches: r.sketches || null, base: base }); }
    catch (e) { pv.inflight = null; if (base != null) roll.posted = false; job.resolve(null); nextPreview(); }
  }
  function nextPreview() {
    if (pv.pending && !pv.inflight) { var j = pv.pending; pv.pending = null; postPreview(j); }
  }
  function onPreviewMessage(d) {
    if (d.base) showRollback(d.base);   // r10/editpreview10: before the preview itself, so both reach the same frame
    var job = pv.inflight;
    if (!job || d.seq !== job.seq) return;
    pv.inflight = null;
    if (d.type === 'previewed') {
      var tools = null;
      try { tools = d.tools.map(function (p) { return p ? CSG.unpack(p) : null; }); }
      catch (e) { job.reject(e); }
      if (tools) job.resolve({ tools: tools, info: d.info || {}, ms: d.ms });
    } else job.reject(new Error(d.message || 'preview failed'));
    nextPreview();
  }
  // the PropertyManager closed: a preview still waiting is not sent (the one in flight is answered and dropped there)
  function cancelPreviews() { if (pv.pending) { pv.pending.resolve({ superseded: true }); pv.pending = null; } }
  // ---- r10/editpreview10: Edit Feature rolls the part back (SolidWorks). While a feature's PropertyManager is open,
  // the graphics area shows the part as it was before that feature (its later features, sketches and planes hidden)
  // and the feature's preview on it; ✗ rolls forward to the part as it was, ✓ shows the rebuilt part when it is
  // applied. The rolled-back part comes from the worker, built from the preview cache's prefix together with the
  // first preview (one message, one frame); App.build / App.mesh / App.triShared / App.edges are swapped for it, so
  // picks land on what is shown, and the whole part's are kept aside untouched (no rebuild to roll forward).
  // App.rollback: the number of features shown while rolled back, else null.
  var roll = { want: null, posted: false, active: false, saved: null, deferred: null, committing: false };
  App.rollback = null;
  function rolledBack(f) {
    if (rollbarRolled(f)) return true;   // rfGQ: below the rollback bar
    if (App.rollback == null || !App.model) return false;
    var i = App.model.features.indexOf(f);
    return i >= App.rollback;
  }
  // rollbackTo(n): show the part's first n features. -> false when it cannot (no worker, an assembly, n out of range)
  function rollbackTo(n) {
    if (isAssembly() || !App.model || !App.build || App.previewSync || !App.workerOn || !(n >= 0) || n >= App.model.features.length || !getWorker()) return false;
    if (roll.active || roll.want != null) clearRollback(true);
    roll.want = n; roll.posted = false; roll.committing = false;
    rollHook('onRollbackWant', n);   // r11/occtswap11: ui-occt.js asks OpenCascade for the same rolled-back part
    // a command whose PropertyManager posts no preview of its own right away (a plane, an imported body) asks alone
    Promise.resolve().then(function () {
      if (roll.want !== n || roll.posted || roll.active) return;
      var p = previewInWorker({ op: 'base', upto: n });
      if (p) p.then(null, function () { });
    });
    return true;
  }
  function showRollback(base) {
    if (roll.want == null || base.upto !== roll.want || roll.active || roll.committing || isAssembly()) return;
    var t0 = performance.now(), build;
    try { build = K.unpackBuild(base.build); } catch (e) { return; }
    roll.saved = { build: App.build, mesh: App.mesh, triShared: App.triShared, edges: App.edges, edgesMesh: App.edgesMesh, sel: App.sel, sel2: App.sel2, triHidden: App.triHidden };
    roll.active = true; App.rollback = base.upto;
    App.build = build;
    App.mesh = K.meshFromBody(build.body);
    if (App.mesh) { App.mesh.workerEdges = base.edges || null; App.mesh.workerCurves = base.curves || null; useWorkerNormals(App.mesh, base.normals); }
    App.triShared = buildTriShared(App.mesh);
    // a face, edge or body picked on the whole part means nothing on the rolled-back one (it comes back on ✗)
    ['sel', 'sel2'].forEach(function (k) { var s = App[k]; if (s && (s.kind === 'face' || s.kind === 'edge' || s.kind === 'body')) App[k] = null; });
    App.hover = null;
    updateBodyMesh(); updateHighlights(); updatePlanes(); updateSketches();
    if (UI.refreshTree && App.mode === 'sketch') UI.refreshTree();   // the tree shows (greyed) only outside a PropertyManager
    App.dimsStale = true;
    requestRender();
    App.rollbackMs = performance.now() - t0;
    if (UI.onRollback) { try { UI.onRollback(true); } catch (e) { console.warn(e); } }
    rollHook('onRollbackShown', base.upto);   // r11/occtswap11
  }
  // r11/occtswap11: hooks for ui-occt.js (arrays of functions on UI)
  function rollHook(name, arg) { (UI[name] || []).forEach(function (fn) { try { fn(arg); } catch (e) { console.warn(e); } }); }
  // r11/occtswap11: rollbackSwap(build, { upto, anvil, edges?, curves?, normals? }): OpenCascade's solid of the same
  // rolled-back part (ui-occt.js) shown in place of Anvil's, while that part (o.anvil) is still the one shown.
  // -> true when swapped. The whole part kept aside for ✗ is untouched.
  function rollbackSwap(build, o) {
    if (!roll.active || roll.committing || App.rollback !== o.upto || (o.anvil && App.build !== o.anvil)) return false;
    var t0 = performance.now();
    App.build = build;
    App.mesh = K.meshFromBody(build.body);
    if (App.mesh) { App.mesh.workerEdges = o.edges || null; App.mesh.workerCurves = o.curves || null; useWorkerNormals(App.mesh, o.normals); }
    App.triShared = buildTriShared(App.mesh);
    ['sel', 'sel2'].forEach(function (k) { var s = App[k]; if (s && (s.kind === 'face' || s.kind === 'edge' || s.kind === 'body')) App[k] = null; });
    App.hover = null;
    updateBodyMesh(); updateHighlights(); updatePlanes(); updateSketches();
    App.dimsStale = true;
    requestRender();
    App.rollbackSwapMs = performance.now() - t0;
    if (UI.onRollback) { try { UI.onRollback(true); } catch (e) { console.warn(e); } }   // PM lists re-resolved on this mesh
    return true;
  }
  // ✓ pressed: the rolled-back part and the preview stay until the rebuilt part is applied (applyBuild ends it)
  function rollbackCommit() { if (roll.active || roll.want != null) { roll.committing = true; roll.want = null; } }
  // rollForward(): back to the whole part as it was (✗, or a PropertyManager closed without a rebuild)
  function rollForward() { clearRollback(true); }
  function clearRollback(restore) {
    var s = roll.saved, d = roll.deferred, was = roll.active;
    roll.want = null; roll.posted = false; roll.active = false; roll.saved = null; roll.deferred = null; roll.committing = false;
    App.rollback = null;
    rollHook('onRollbackEnd', was);   // r11/occtswap11
    if (!was || !restore || !s) return;
    App.build = s.build; App.mesh = s.mesh; App.triShared = s.triShared; App.edges = s.edges; App.edgesMesh = s.edgesMesh;
    App.sel = s.sel; App.sel2 = s.sel2; App.hover = null;
    updateBodyMesh(); updateHighlights(); updatePlanes(); updateSketches();
    if (UI.refreshTree) UI.refreshTree();
    App.dimsStale = true;
    requestRender();
    if (UI.onRollback) { try { UI.onRollback(false); } catch (e) { console.warn(e); } }
    if (d) applyBuild(d.build, d.opts, d.ms);   // OpenCascade's solid that arrived meanwhile
  }
  // ---- rfGQ: the rollback bar of the FeatureManager (SolidWorks). Unlike Edit Feature's rollback above (App.rollback,
  // shown for as long as a PropertyManager is open) it is a state of the document: every feature below the bar is
  // really suppressed (so the kernel, the worker, previews, OpenCascade, exports and drawings all see the rolled part),
  // and model.rollbar = { ids: [rolled features in order], kept: { id: true } (suppressed by the user already),
  // over: [[configuration, id]] (per-configuration "unsuppressed" overrides taken away while rolled) } says what to
  // give back. It is plain model JSON, so Save, undo and AutoRecover keep it. model.rollbarPrev: the feature the bar
  // sat above before its last move, -1 for the end (Roll to Previous). A new feature is pushed at the end of the list
  // by every command: rollbarSync() moves anything that is not in ids above the rolled ones, which is the bar.
  function rollbarIds() { var b = App.model && App.model.rollbar; return b && b.ids ? b.ids : null; }
  function rollbarRolled(f) { var ids = rollbarIds(); return !!(ids && f && ids.indexOf(f.id) >= 0); }
  function rollbarSync() {
    var ids = rollbarIds(), m = App.model;
    if (!ids || !m.features) return;
    var shown = [], rolled = [];
    m.features.forEach(function (f) { (ids.indexOf(f.id) >= 0 ? rolled : shown).push(f); });
    if (!rolled.length) { delete m.rollbar; return; }
    m.rollbar.ids = rolled.map(function (f) { return f.id; });
    var order = shown.concat(rolled);
    if (order.some(function (f, i) { return m.features[i] !== f; })) { m.features.length = 0; Array.prototype.push.apply(m.features, order); }
  }
  // the index of the first feature below the bar; the feature count when the bar is at the end
  function rollbarIndex() {
    var m = App.model;
    if (!m || !m.features) return 0;
    rollbarSync();
    var ids = rollbarIds();
    return ids ? m.features.length - ids.length : m.features.length;
  }
  function rollbarLift(m) {
    var b = m.rollbar;
    if (!b) return;
    b.ids.forEach(function (id) { var f = K.findFeature(m, id); if (f && !(b.kept && b.kept[id])) delete f.suppressed; });
    (b.over || []).forEach(function (o) { var c = K.findConfiguration(m, o[0]); if (c) (c.suppressed = c.suppressed || {})[o[1]] = false; });
    delete m.rollbar;
  }
  function rollbarDrop(m, n) {
    var tail = m.features.slice(n), cfgs = m.configurations || [];
    if (!tail.length) return;
    var b = m.rollbar = { ids: [], kept: {}, over: [] };
    tail.forEach(function (f) {
      b.ids.push(f.id);
      if (f.suppressed) b.kept[f.id] = true;
      f.suppressed = true;
      cfgs.forEach(function (c) { if (c.suppressed && c.suppressed[f.id] === false) { delete c.suppressed[f.id]; b.over.push([c.name, f.id]); } });
    });
  }
  // the sketch at index n - 1 is absorbed by feature n: only it uses that sketch. SolidWorks shows the sketch under the
  // feature and rolls the two together (Feature.IsRolledBack, measured, rfGW): the bar never goes between them.
  function rollbarAbsorbed(m, n) {
    var f = m.features[n], s = m.features[n - 1];
    if (!f || !s || s.type !== 'sketch' || f.type === 'sketch' || f.sketch !== s.id) return false;
    return m.features.filter(function (g) { return g.sketch === s.id; }).length === 1;
  }
  // rollbarTo(n): the bar goes above feature n (the feature count: to the end). One undo step. -> the rebuild's
  // Promise, or false when nothing moved. SolidWorks greys the bar while a command or a sketch is open.
  function rollbarTo(n) {
    var m = App.model;
    if (!m || !m.features || isAssembly()) return false;
    if (App.mode === 'sketch' || (UI.hasPM && UI.hasPM())) { if (UI.setStatus) UI.setStatus('Close the open command or sketch before moving the rollback bar.'); return false; }
    var at = rollbarIndex(), len = m.features.length;
    n = Math.max(0, Math.min(len, n | 0));
    if (rollbarAbsorbed(m, n)) n--;
    if (n === at) return false;
    pushUndo();
    var was = m.features[at], next = m.features[n];
    rollbarLift(m);
    m.rollbarPrev = was ? was.id : -1;
    rollbarDrop(m, n);
    return rebuild().then(function (b) {
      if (UI.setStatus) UI.setStatus(next ? 'Rolled back to before ' + next.name + '.' : 'Rolled to the end.');
      return b;
    });
  }
  function rollbarForward() { var n = rollbarIndex() + 1; return rollbarTo(rollbarAbsorbed(App.model, n) ? n + 1 : n); }
  function rollbarEnd() { return rollbarTo(App.model.features.length); }
  function rollbarPrevIndex() {
    var m = App.model, p = m && m.rollbarPrev;
    if (p == null || !m.features) return -1;
    if (p === -1) return m.features.length;
    var f = K.findFeature(m, p);
    return f ? m.features.indexOf(f) : -1;
  }
  function rollbarPrevious() { var n = rollbarPrevIndex(); return n < 0 ? false : rollbarTo(n); }
  // ---- Instant3D's light drag path (r3/engine3): while a depth / angle arrow (or a part-mode sketch dimension) is
  // dragged, each ruler step previews only the dragged feature, built in the worker on the part before it, instead of
  // rebuilding and re-applying the whole part; the release rebuilds once (ui-select.js endDrag), and
  // featurePreviewEnd(promise) drops late previews and clears the shown one when that rebuild is applied.
  // featurePreview(fid) -> true when the preview was asked for (false: no worker or not a previewable feature, so the
  // caller rebuilds as before).
  var fpv = { seq: 0, shown: 0, closed: 0 };
  function featurePreview(fid) {
    if (isAssembly() || !App.model || !App.build || App.previewSync) return false;
    var f = K.findFeature(App.model, fid), upto = f ? App.model.features.indexOf(f) : -1;
    if (upto < 0 || (f.type !== 'extrude' && f.type !== 'revolve')) return false;
    var my = ++fpv.seq, cut = false;
    try { cut = !!(K.isCut(f, App.model) || f.cut); } catch (e) { }
    var b = modelBounds(), diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    var p = previewInWorker({ op: 'tool', feature: JSON.parse(JSON.stringify(f)), upto: upto, throughLimit: Math.max(20, diag * 1.5) });
    if (!p) return false;
    p.then(function (r) {
      if (!r || r.superseded || my <= fpv.closed || my < fpv.shown) return;
      fpv.shown = my;
      disposeGroup(groups.preview);
      r.tools.forEach(function (t) {
        if (!t || !t.polygons.length) return;
        var mesh = K.meshFromBody(t), g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(analyticNormals(mesh), 3));
        groups.preview.add(new THREE.Mesh(g, cut ? mats.previewCut : mats.preview));
      });
      requestRender();
    }, function () { });
    return true;
  }
  function featurePreviewEnd(done) {
    var had = fpv.seq > fpv.closed;
    fpv.closed = fpv.seq;
    if (!had) return;
    Promise.resolve(done).then(clear, clear);
    function clear() { if (fpv.closed === fpv.seq) { disposeGroup(groups.preview); requestRender(); } }
  }
  // a worker that died takes its previews with it: answer them with null (the caller previews on the main thread)
  function dropPreviews() {
    [pv.inflight, pv.pending].forEach(function (j) { if (j) j.resolve(null); });
    pv.inflight = pv.pending = null;
  }

  function onWorkerMessage(ev) {
    var d = ev.data || {};
    if (d.type === 'previewed' || d.type === 'previewError') { onPreviewMessage(d); return; }
    // the volume of the mesh of a build already applied (ui-occt.js compares OpenCascade's with it)
    if (d.type === 'volume') { if (App.mesh && App.mesh.workerSeq === d.seq) App.mesh.workerVolume = d.volume; return; }
    if (!wk.inflight || d.seq !== wk.inflight.seq) return;   // stale reply (newer request already posted)
    var req = wk.inflight; wk.inflight = null;
    if (isAssembly()) { finishSync(req); return; }   // reply for a part model that has since been replaced
    if (d.type === 'built') {
      var build;
      try {
        build = K.unpackBuild(d.build);
        nextWorker = { edges: d.edges || null, curves: d.curves || null, normals: d.normals || null, seq: d.seq };   // found by the worker on the same mesh: the applyBuild below hands them on
        K.applyProfiles(App.model, build.profiles, build.facePlanes);   // the worker built its own copy; write the sketch profiles back onto ours
        applyBuild(build, req.opts, build.time);
        if (App.build === build) { if (wk.pending) App.geom = null; else noteGeom(); }   // (rfHO) a newer model waiting: not this build's
        // Refresh the main-thread cache from the worker's result (guarded: older kernels have no cacheFromBuild).
        App.buildCache = K.cacheFromBuild ? K.cacheFromBuild(App.model, build) : null;
      } catch (e) { nextWorker = null; disableWorker(e); finishSync(req); return; }
      settle(req, null);
      drain();
    } else {
      disableWorker(d.message || 'worker error');
      finishSync(req);
    }
  }

  function onWorkerError(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var req = wk.inflight; wk.inflight = null;
    disableWorker((ev && ev.message) || 'worker.js failed');
    if (req) finishSync(req); else drain();
  }

  // The status bar says "Rebuilding…" only once a background build has taken longer than BUSY_SHOW_MS, so quick
  // rebuilds (an Instant3D drag, a spun value) do not make the message flicker on every step (smooth/responsive).
  var busyPrevStatus = null, busyTimer = 0, BUSY_SHOW_MS = 250;
  function setBusy(on) {
    if (App.rebuilding === on) return;
    App.rebuilding = on;
    var s = $('status-msg');
    if (!s) return;
    if (on) {
      busyTimer = setTimeout(function () {
        busyTimer = 0;
        if (!App.rebuilding) return;
        busyPrevStatus = s.textContent; s.textContent = 'Rebuilding…'; s.classList.add('busy');
      }, BUSY_SHOW_MS);
    } else {
      if (busyTimer) { clearTimeout(busyTimer); busyTimer = 0; return; }
      s.classList.remove('busy'); if (s.textContent === 'Rebuilding…') s.textContent = busyPrevStatus || 'Rebuilt.';
    }
  }

  // For tests: how many feature steps the main-thread cache holds and how many of them carry no body
  // (`partial`, as Kernel.cacheFromBuild marks every step but the last).
  function buildCacheInfo() {
    var steps = (App.buildCache && App.buildCache.steps) || [];
    var partial = 0;
    steps.forEach(function (s) { if (s && s.partial) partial++; });
    return { steps: steps.length, partial: partial };
  }

  function setWorkerOn(on) {
    App.workerOn = !!on && !!window.Worker;
    try { localStorage.setItem('anvil.worker', App.workerOn ? '1' : '0'); } catch (e) { }
    if (!App.workerOn && wk.worker && !wk.inflight) { try { wk.worker.terminate(); } catch (e) { } wk.worker = null; dropPreviews(); }
    return App.workerOn;
  }

  // ------------------------------------------------------------------ Image Quality (document property)
  // SolidWorks: Tools ▸ Options ▸ Document Properties ▸ Image Quality. Stored in the model as
  // model.tessellation = { chordTol } (mm of sagitta per chord), which Kernel.rebuild applies to that document only
  // (and the worker gets with its structured clone of App.model). Changing it is an undo step and rebuilds.
  var IMAGE_QUALITY = [
    { key: 'coarse', label: 'Coarse (0.1 mm)', chordTol: 0.1 },
    { key: 'default', label: 'Default (0.05 mm)', chordTol: 0.05 },
    { key: 'fine', label: 'Fine (0.02 mm)', chordTol: 0.02 },
    { key: 'finer', label: 'Finer (0.01 mm)', chordTol: 0.01 }
  ];
  // r15/inches15: an inch document uses the same presets scaled to inches (0.002 in ≈ 0.05 mm); Kernel.rebuild applies
  // the inch default to an inch document that carries no Image Quality of its own
  var IMAGE_QUALITY_IN = [
    { key: 'coarse', label: 'Coarse (0.004 in)', chordTol: 0.004 },
    { key: 'default', label: 'Default (0.002 in)', chordTol: 0.002 },
    { key: 'fine', label: 'Fine (0.0008 in)', chordTol: 0.0008 },
    { key: 'finer', label: 'Finer (0.0004 in)', chordTol: 0.0004 }
  ];
  function imagePresets() { return App.model && App.model.units === 'in' ? IMAGE_QUALITY_IN : IMAGE_QUALITY; }
  function defaultChordTol() { return App.model && App.model.units === 'in' ? 0.002 : 0.05; }
  // -> { chordTol, preset (key or 'custom'), segsR10 (facets on a Ø20 circle, for the UI) }
  function imageQuality() {
    var t = App.model && App.model.tessellation, tol = t && +t.chordTol > 0 ? +t.chordTol : defaultChordTol();
    var pr = imagePresets().filter(function (q) { return Math.abs(q.chordTol - tol) < 1e-12; })[0];
    var segs = null;
    try { var saved = K.setTessellation({}); K.setTessellation({ chordTol: tol }); segs = K.segsForRadius(10); K.setTessellation(saved); } catch (e) { }
    return { chordTol: tol, preset: pr ? pr.key : 'custom', segsR10: segs };
  }
  // setImageQuality(preset key | chordTol number | { chordTol }) -> Promise of the build (an undo step unless unchanged)
  function setImageQuality(q) {
    var tol = q && typeof q === 'object' ? +q.chordTol : typeof q === 'string' && isNaN(+q) ? (imagePresets().filter(function (p) { return p.key === q; })[0] || {}).chordTol : +q;
    if (!(tol > 0) || !isFinite(tol)) return Promise.reject(new Error('Image quality: a preset (' + IMAGE_QUALITY.map(function (p) { return p.key; }).join(', ') + ') or a positive chord tolerance in mm'));
    tol = Math.max(0.0001, Math.min(10, tol));   // r15/inches15: inch presets go down to 0.0004
    if (Math.abs(imageQuality().chordTol - tol) < 1e-12 && App.model.tessellation) return whenIdle();
    pushUndo();
    App.model.tessellation = Object.assign({}, App.model.tessellation || {}, { chordTol: tol });
    return rebuild();
  }

  // ------------------------------------------------------------------ unsaved changes and AutoRecover
  // SolidWorks' "Part1 *" and Tools ▸ Options ▸ Backup/Recover. The document is dirty while App.model differs from what
  // was last opened, created or saved (compared as JSON on every applied rebuild and on every edit that calls
  // autosave(), so undoing back to the saved state is clean again). While dirty the title shows "*", the page asks
  // before it is closed (ui-app.js) and a recovery copy is kept in localStorage 'anvil.recover' as
  // { v, savedAt, name, fileName, drawing (index of the open drawing or null), model }; it is dropped on Save, New, Open
  // and Discard. At start-up ui-app.js offers it (Recover / Discard) instead of restoring it silently. The drawings
  // live in the model (model.drawings), so they are in the copy too.
  var RECOVER_KEY = 'anvil.recover';
  // json: the clean state ('' = never saved, null = not known yet); loading: a document is being opened (its first
  // rebuild writes the sketch profiles back into the model); hold: the start-up dialog has not been answered yet
  var clean = { json: null, loading: false, hold: false };
  App.dirty = false;
  function modelJson() { try { return JSON.stringify(App.model); } catch (e) { return null; } }
  function autosave() {
    if (clean.loading || !App.model) return;
    var json = modelJson();
    if (json == null) return;
    var was = App.dirty;
    App.dirty = clean.json != null && json !== clean.json;
    // the recovery dialog closed with ✕ and work started: the new work is what needs protecting now
    if (clean.hold && App.dirty && $('modal').hidden) clean.hold = false;
    if (!clean.hold) {
      if (App.dirty) writeRecovery(json);
      else if (was) dropRecovery();
    }
    showDirty();
  }
  function writeRecovery(json) {
    var dw = null;
    try { if (UI.drawingActive && UI.drawingActive() && UI.drawing && UI.drawing.state) dw = UI.drawing.state.index; } catch (e) { }
    try {
      localStorage.setItem(RECOVER_KEY, '{"v":1,"savedAt":' + Date.now() + ',"name":' + JSON.stringify(App.model.name || '') + ',"fileName":' + JSON.stringify(App.fileName || null) +
        ',"drawing":' + JSON.stringify(dw == null ? null : dw) + ',"model":' + json + '}');
    } catch (e) { }
  }
  function dropRecovery() { try { localStorage.removeItem(RECOVER_KEY); } catch (e) { } }
  function readRecovery() {
    var raw = null;
    try { raw = localStorage.getItem(RECOVER_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { dropRecovery(); return null; }
  }
  // markClean(): the open document now matches what was opened, created or saved; its recovery copy goes
  function markClean() {
    clean.loading = false;
    clean.json = modelJson();
    App.dirty = false;
    if (!clean.hold) dropRecovery();
    showDirty();
  }
  // markUnsaved(): a document that was never saved (a model made by a script, a recovered copy) stays dirty until saved
  function markUnsaved() { clean.loading = false; clean.json = ''; autosave(); }
  function isDirty() { return !!App.dirty; }
  function holdRecovery(on) { clean.hold = !!on; }
  // "Part1 *": a class on #doc-title (style.css adds the star, so the title text the panels write stays the name) and
  // the browser tab's title
  function showDirty() {
    var t = $('doc-title');
    if (t) t.classList.toggle('dirty', !!App.dirty);
    var title = App.model && App.model.name ? App.model.name + (App.dirty ? ' *' : '') + ' - Anvil' : 'Anvil';
    if (document.title !== title) document.title = title;
  }
  function pushUndo() {
    App.undo.push(JSON.stringify(App.model));
    if (App.undo.length > 60) App.undo.shift();
    App.redo.length = 0;
  }
  function undo() {
    if (!App.undo.length) return whenIdle();
    App.redo.push(JSON.stringify(App.model));
    App.model = JSON.parse(App.undo.pop());
    if (UI.setStatus) UI.setStatus(App.undo.length ? 'Last step undone.' : 'Last step undone (nothing more to undo).');   // not the undone command's result
    return afterModelSwap();
  }
  function redo() {
    if (!App.redo.length) return whenIdle();
    App.undo.push(JSON.stringify(App.model));
    App.model = JSON.parse(App.redo.pop());
    if (UI.setStatus) UI.setStatus('Step redone.');
    return afterModelSwap();
  }
  function afterModelSwap() {
    if (App.activeSketch != null && !K.findFeature(App.model, App.activeSketch)) App.activeSketch = null;
    if (App.activeSketch == null && App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
    App.sel = null; App.sel2 = null;
    if (UI.closePM) UI.closePM();
    return rebuild({ keepSame: true });   // (rfHO) a drawing-only step keeps the part as it is
  }

  function loadModel(model) {
    if (UI.exitSketch && App.mode === 'sketch') UI.exitSketch(true);
    if (UI.closePM) UI.closePM();
    App.model = model;
    App.fileName = null;   // the saved-document name, set by whoever opened it from the browser's saved files
    if (UI.cplaneReset) UI.cplaneReset();   // lane mcdirect: the construction plane is the document's (Top for a new one)
    if (!model.features) model.features = [];
    var ids = model.features.map(function (f) { return f.id; });
    if (model.type === 'assembly') {
      model.components = model.components || []; model.mates = model.mates || [];
      ids = ids.concat(model.components.map(function (c) { return c.id; }), model.mates.map(function (m) { return m.id; }));
    }
    App.model.nextId = App.model.nextId || (Math.max.apply(null, [0].concat(ids.filter(function (n) { return typeof n === 'number'; }))) + 1);
    App.undo.length = 0; App.redo.length = 0;
    App.sel = null; App.sel2 = null;
    App.hiddenBodies = {}; // hidden bodies/components are viewport state of the previous document
    App.view.section = null;   // rfHF: so is Section View (SolidWorks keeps it per document view); a rebuild of the same part keeps it
    if (UI.refreshHud) { try { UI.refreshHud(); } catch (e) { } }
    App.activeSketch = null; App.mode = 'part';
    // the opened document is clean once its first rebuild is applied (markClean below; a rejected build too)
    clean.loading = true;
    var p;
    try { p = rebuild(); } catch (e) { markClean(); throw e; }
    if (!p.applied) p.then(null, function () { if (clean.loading) markClean(); });
    $('doc-title').textContent = model.name;
    return afterRebuild(p, function (b) { markClean(); zoomToFit(); return b; });
  }

  window.addEventListener('resize', resize);
  // the cursor position over the viewport with no button held (null otherwise), for the pre-selection after a rebuild
  // (client coordinates; turned into viewport ones only when used, so a mouse move forces no layout here)
  var lastClient = null;
  viewport.addEventListener('mousemove', function (ev) { lastClient = ev.buttons ? null : [ev.clientX, ev.clientY]; });
  viewport.addEventListener('mouseleave', function () { lastClient = null; });
  function lastMousePos() {
    if (!lastClient) return null;
    var r = viewport.getBoundingClientRect();
    return [lastClient[0] - r.left, lastClient[1] - r.top];
  }
  // ------------------------------------------------------------------ lane profnav: the navigation map
  // One table says which mouse button + modifiers rotate, pan or zoom the view, which way the wheel zooms and about
  // what, and what a middle double-click does. Every viewport handler asks it (ui-sketch.js mousedown / wheel, the
  // middle double-click below, drawing-ui.js on the sheet), so an interface profile (ui-profiles.js) can lay the
  // mouse out like the software the user comes from. Schema (agreed with lane profiles):
  //   { drag: { 'middle': 'rotate', 'ctrl+middle': 'pan', 'shift+middle': 'zoom', 'alt+left': 'rotate', 'right': 'pan' },
  //     wheel: { zoom: 1 | -1, about: 'cursor' | 'center' }, middleDouble: 'fit' | null }
  // A drag key is the modifiers in the order ctrl, shift, alt, then the button (left, middle, right). A key the map
  // names (null = nothing) wins; a key it does not name does what SolidWorks does (navSW). null or {} is SolidWorks.
  // 'left' is the plain left drag that started on the model (box select and sketch tools take the press first).
  var NAV_ACTIONS = { rotate: 1, pan: 1, zoom: 1 };
  function navKey(ev) {
    var b = ev.button === 0 ? 'left' : ev.button === 1 ? 'middle' : ev.button === 2 ? 'right' : null;
    if (!b) return null;
    return (ev.ctrlKey ? 'ctrl+' : '') + (ev.shiftKey ? 'shift+' : '') + (ev.altKey ? 'alt+' : '') + b;
  }
  // what the viewport did before the map existed (SolidWorks): middle, or Alt + left, rotate; with Ctrl they pan, with
  // Shift they zoom; the right drag pans; a left drag that starts on the model (nothing else took it) rotates
  function navSW(key) {
    if (!key) return null;
    var btn = key.replace(/^.*\+/, ''), ctrl = /ctrl\+/.test(key), shift = /shift\+/.test(key), alt = /alt\+/.test(key);
    if (btn === 'middle' || (btn === 'left' && alt)) return ctrl ? 'pan' : shift ? 'zoom' : 'rotate';
    if (btn === 'right') return 'pan';
    if (btn === 'left') return 'rotate';   // a plain (or Ctrl / Shift) left drag that started on the model
    return null;
  }
  var NAV_SW_KEYS = ['middle', 'ctrl+middle', 'shift+middle', 'alt+left', 'right', 'left'];
  var navUser = null, navResolved = null;
  function resolveNav(map) {
    var r = { drag: {}, wheel: { zoom: 1, about: 'cursor' }, middleDouble: 'fit' };
    NAV_SW_KEYS.forEach(function (k) { r.drag[k] = navSW(k); });
    if (map && map.drag) Object.keys(map.drag).forEach(function (k) {
      var v = map.drag[k], key = String(k).toLowerCase().replace(/\s+/g, '');
      r.drag[key] = v && NAV_ACTIONS[v] ? v : null;
    });
    if (map && map.wheel) {
      if (map.wheel.zoom === -1 || map.wheel.zoom === 1) r.wheel.zoom = map.wheel.zoom;
      if (map.wheel.about === 'center' || map.wheel.about === 'cursor') r.wheel.about = map.wheel.about;
    }
    if (map && Object.prototype.hasOwnProperty.call(map, 'middleDouble')) r.middleDouble = map.middleDouble === 'fit' ? 'fit' : null;
    return r;
  }
  navResolved = resolveNav(null);
  function setNavMap(map) { navUser = map && typeof map === 'object' ? JSON.parse(JSON.stringify(map)) : null; navResolved = resolveNav(navUser); lastMiddle = middleDown = null; return navMap(); }
  function navMap() { return JSON.parse(JSON.stringify(navResolved)); }
  // 'rotate' | 'pan' | 'zoom' | null for a mousedown (or any mouse event with button and modifiers)
  function navActionFor(ev) {
    var key = navKey(ev);
    if (!key) return null;
    return Object.prototype.hasOwnProperty.call(navResolved.drag, key) ? navResolved.drag[key] : navSW(key);
  }
  // +1 when the wheel zooms as in SolidWorks (wheel toward you zooms out), -1 reversed; a trackpad pinch (Ctrl + wheel
  // from the browser) keeps its own direction
  function navWheelSign(ev) { return ev && ev.ctrlKey ? 1 : navResolved.wheel.zoom; }

  // SolidWorks: a double-click of the middle button is Zoom to Fit (browsers send no dblclick for it)
  // (two plain middle clicks, each released where it was pressed, within 400 ms; a middle drag is not a click)
  // (lane profnav) only while the navigation map says middleDouble: 'fit' (the default)
  var lastMiddle = null, middleDown = null;
  function nearPt(ev, p) { return Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) < 6; }
  viewport.addEventListener('mousedown', function (ev) {
    lastClient = null;
    if (ev.button !== 1 || ev.ctrlKey || ev.shiftKey || ev.altKey || navResolved.middleDouble !== 'fit') { lastMiddle = middleDown = null; return; }
    var t = performance.now();
    if (lastMiddle && t - lastMiddle.t < 400 && nearPt(ev, lastMiddle)) { lastMiddle = middleDown = null; zoomToFit(); return; }
    middleDown = { t: t, x: ev.clientX, y: ev.clientY };
  });
  window.addEventListener('mouseup', function (ev) {
    if (ev.button !== 1 || !middleDown) return;
    lastMiddle = nearPt(ev, middleDown) ? middleDown : null;
    middleDown = null;
  });

  // ------------------------------------------------------------------ rfFA: reference curves in the viewport
  // Helix / Spiral, Projected, Composite and Curve Through Points records (App.build.planes, refgeo 'curve') drawn as
  // grey polylines (yellow selected); a curve hidden from the tree (f.hidden) or with View ▸ Curves off is not drawn.
  // Drawings never show them (HLR reads the bodies only).
  function faCurveItems() {
    var out = [], planes = App.build && App.build.planes;
    if (!planes || !App.model || !App.model.features || App.view.showCurves === false) return out;
    App.model.features.forEach(function (f) {
      var g = planes[f.id];
      if (!g || g.refgeo !== 'curve' || f.hidden || f.suppressed || rolledBack(f) || App.editingFeatureId === f.id) return;
      out.push({ f: f, g: g });
    });
    return out;
  }
  function faDrawCurve(g, group, state) {
    (g.runs || [g]).forEach(function (r) {
      var P = r.pts, arr = [];
      for (var i = 0; i + 1 < P.length; i++) arr.push(P[i][0], P[i][1], P[i][2], P[i + 1][0], P[i + 1][1], P[i + 1][2]);
      if (arr.length) group.add(refSegs(arr, refMat(state || 'line', false, !state && group === refGroup), false));   // rfHM: depth-tested unless picked / hovered or a PM preview
    });
  }

  return {
    App: App, K: K, V: V, $: $, el: el, fmtNum: fmtNum, unitLabel: unitLabel,
    renderer: renderer, scene: scene, camera: camera, cam: cam, size: size, groups: groups, mats: mats, viewport: viewport,
    applyCamera: applyCamera, resize: resize, rotateView: rotateView, panView: panView, zoomView: zoomView, zoomToFit: zoomToFit,
    setView: setView, viewNormalTo: viewNormalTo, previousView: previousView, pushViewHistory: pushViewHistory, VIEWS: VIEWS, modelBounds: modelBounds,
    updateBodyMesh: updateBodyMesh, applyDisplayStyle: applyDisplayStyle, partColor: partColor, updateHighlights: updateHighlights, updatePlanes: updatePlanes,
    updateOrigin: updateOrigin, updateSketches: updateSketches, screenPolylines: screenPolylines, sketchSceneVersion: function () { return sceneVer; }, scaleBar: scaleBarInfo, updateTemp: updateTemp, disposeGroup: disposeGroup,
    sketchOverlayHooks: sketchOverlayHooks, tempEntityHooks: tempEntityHooks, sketchOverlayObjects: sketchOverlayObjects, tempEntitiesShown: tempEntitiesShown,   // sketch-hooks
    activeSketchFeature: activeSketchFeature, activePlane: activePlane, isConsumed: isConsumed, snapStep: snapStep, gridStep: gridStep, gridMinors: gridMinors,
    screenToPlane: screenToPlane, worldToScreen: worldToScreen, pickFace: pickFace, pickFacesAll: pickFacesAll, pickPlane: pickPlane, pickRefGeo: pickRefGeo, updateRefGeo: updateRefGeo, drawRefGeo: drawRefGeo, pickEntity: pickEntity, pickEntityDist: pickEntityDist, pickEdge: pickEdge,
    lineGeometryFromPolylines: lineGeometryFromPolylines, render: render, renderHooks: renderHooks, frame: frame, renderLoop: frame /* lane mcdirect2: boot starts the loop by this name; the profile's window frame is UI.frameDef (ui-panels.js, lane mcpolish) */, tick: tick, thickLines: thickLines, LINE_W: LINE_W, requestRender: requestRender,
    // view transitions and smooth zoom (see "view animation")
    finishViewAnimation: finishViewAnimation, viewAnimating: viewAnimating, viewPose: viewPose, wheelZoom: wheelZoom, zoomToArea: zoomToArea,
    camVersion: function () { return camVer; },
    rebuild: rebuild, previewInWorker: previewInWorker, cancelPreviews: cancelPreviews, featurePreview: featurePreview, featurePreviewEnd: featurePreviewEnd, holdFrame: holdFrame, afterRebuild: afterRebuild, whenIdle: whenIdle, setWorkerOn: setWorkerOn, buildCacheInfo: buildCacheInfo,
    applyBuild: function (build, opts) { return applyBuild(build, opts, 0); },   // ui-occt.js: OpenCascade's build of the same model
    rollbackTo: rollbackTo, rollForward: rollForward, rollbackCommit: rollbackCommit, rollbackSwap: rollbackSwap,   // r10/editpreview10: Edit Feature rollback
    rollbarTo: rollbarTo, rollbarIndex: rollbarIndex, rollbarRolled: rollbarRolled, rollbarSync: rollbarSync, rollbarForward: rollbarForward, rollbarEnd: rollbarEnd, rollbarPrevious: rollbarPrevious, rollbarPrevIndex: rollbarPrevIndex,   // rfGQ: the rollback bar
    profileViewportColors: profileViewportColors, syncProfileViewportColors: syncProfileViewportColors,   // lane mctheme
    setViewportTheme: setViewportTheme, viewportTheme: viewportTheme, darkViewport: darkViewport, linePalette: function () { return darkViewport() ? LINE_PALETTE : LINE_PALETTE_LIGHT; },
    // rfHC: RealView (physically based shading in a studio; the depthfx lane's toggles call setRealView)
    setRealView: setRealView, realView: realView, realViewInfo: realViewInfo, partFaceMaterial: partFaceMaterial,
    // r14/viewui14: background, triad, View Selector
    setBackground: setBackground, drawTriad: function () { drawTriad(); }, triadClick: triadClick, triadAxisAt: triadAxisAt, orientView: orientView,
    showViewSelector: showViewSelector, hideViewSelector: hideViewSelector, viewSelectorShown: viewSelectorShown, viewSelectorPick: viewSelectorPick, viewSelectorMenuClear: vsMenuClear, modelEdgeInBox: modelEdgeInBox,
    viewSelectorRegions: function () { return vs.cells.map(function (c) { return { id: c.id, center: [(c.q[0][0] + c.q[2][0]) / 2, (c.q[0][1] + c.q[2][1]) / 2] }; }); },
    imageQuality: imageQuality, setImageQuality: setImageQuality, IMAGE_QUALITY: IMAGE_QUALITY, imagePresets: imagePresets, defaultUnits: defaultUnits, setDefaultUnits: setDefaultUnits, lenDefault: lenDefault,
    analyticNormals: analyticNormals, surfNormal: surfNormal, annotateCurveEdges: annotateCurveEdges, curveScreenSegs: curveScreenSegs,
    autosave: autosave, pushUndo: pushUndo, undo: undo, redo: redo, loadModel: loadModel,
    // unsaved changes and AutoRecover (ui-app.js: title star, save prompts, the start-up Recover / Discard dialog)
    isDirty: isDirty, markClean: markClean, markUnsaved: markUnsaved, readRecovery: readRecovery, dropRecovery: dropRecovery, holdRecovery: holdRecovery,
    rebuildPending: function () { return !!(wk.inflight || wk.pending); },
    getBodyMesh: function () { return bodyMesh; },
    // lane FO: display safety (crack filler, section caps, safe normals)
    getCrackFill: function () { return crackFill; }, zoomTess: zoomTessApi, slopeOffset: SLOPE, sectionCaps: function () { return capGroup; }, safeNormals: safeNormals,
    // multi-body parts (viewport side): see the "bodies" section
    // assembly documents
    isAssembly: isAssembly, componentIndex: componentIndex, selectComponent: selectComponent,
    bodyInfo: bodyInfo, bodyName: bodyName, bodyCount: bodyCount, selectBody: selectBody,
    setBodyHidden: setBodyHidden, isBodyHidden: isBodyHidden, bodyBounds: bodyBounds, zoomToBody: zoomToBody, fitBox: fitBox,
    // equations (global variables)
    equationVars: equationVars, equationErrorMessages: equationErrorMessages, evalInput: evalInput, parseLength: parseLength,
    // whole curved faces (every facet of one cylinder, hole, cone...) for picking and selection
    faceGroup: faceGroup, faceGroups: function () { return faceGroups(App.mesh); },
    // rfHL: tangent edge display ('visible' | 'phantom' | 'removed'), its View ▸ Display rows, and the edges it draws
    setTangentEdges: setTangentEdges, tangentEdges: function () { return App.view.tangentEdges; }, tangentEdgesMenuItems: tangentEdgesMenuItems,
    tangentEdgeList: function () { return tangentEdgeList(App.mesh); }, tangentLines: function () { return tanLines; },
    // lane DC: Flatten (the flat state's display)
    updateFlatState: updateFlatState, flatShown: flatShown, flatGroup: flatGroup,
    // lane profnav: the navigation map (mouse rotate / pan / zoom, wheel, middle double-click)
    setNavMap: setNavMap, navMap: navMap, navActionFor: navActionFor, navWheelSign: navWheelSign, navKey: navKey
  };
})();

// ------------------------------------------------------------------ lane mcdirect (2026-11-11)
// The construction plane (Mastercam's Cplane) and the graphics-window furniture an interface profile asks for.
// Construction plane: UI.cplane() -> 'Top' | 'Front' | 'Right' | 'Back' | 'Bottom' | 'Left' | a plane feature's id;
// UI.setCplane(name) (unknown names refused: returns the plane kept), UI.onCplane(fn(name, prev)) -> unsubscribe,
// UI.cplaneLabel(name?) (a plane feature's name), UI.cplaneSketchPlane(name?) (the sketch `plane` spec: { ref } for Top /
// Front / Right, a custom frame looking as the view of that name for Back / Bottom / Left, { featureId }), UI.cplaneReset()
// (loadModel: a new document starts on the profile's wireframe.plane, else Top). Kept per document for the session.
// Viewport section of the active profile (UI.Profiles.def(active).viewport, default = SolidWorks' graphics area):
// { background: [top, bottom] (CSS colours of a vertical gradient), labels (lower-left Gview / WCS / C / T names next to
// the triad), headsUp: false (the heads-up view toolbar hidden), quickMasks, selectionBar, contextMenu: 'mastercam' }.
// UI.viewportProfile() -> that section or null; UI.viewportProfileHooks: functions (section | null) run on every
// change (ui-select.js builds the quick masks and the selection bar there); UI.viewportLabels() -> the label texts.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, viewport = UI.viewport;
  // the six named construction planes: the sketch frame a sketch on it gets (x = y × n, as Anvil's standard planes)
  var CP_FRAMES = {
    Top: { ref: 'Top' }, Front: { ref: 'Front' }, Right: { ref: 'Right' },
    Back: { x: [-1, 0, 0], y: [0, 1, 0], n: [0, 0, -1] }, Bottom: { x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] }, Left: { x: [0, 0, 1], y: [0, 1, 0], n: [-1, 0, 0] },
    // lane mcdirect2: Mastercam's Planes manager lists Isometric too: the plane square to the isometric view, its up
    Isometric: (function () { var r = 1 / Math.sqrt(3), n = [r, r, r], y = [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)]; return { x: K.vec.cross(y, n), y: y, n: n }; })()
  };
  var cp = 'Top', cpListeners = [];
  function planeFeature(id) { var f = App.model && K.findFeature(App.model, id); return f && f.type === 'plane' ? f : null; }
  function norm(name) {
    if (typeof name === 'string' && /^\d+$/.test(name)) name = +name;
    if (typeof name === 'number') return planeFeature(name) ? name : null;
    if (typeof name !== 'string') return null;
    // lane mcdirect2: a plane feature by its name (the Planes manager and the CPLANE list name them)
    var byName = App.model && (App.model.features || []).filter(function (f) { return f.type === 'plane' && f.name === name; })[0];
    if (byName && !CP_FRAMES[name]) return byName.id;
    var k = Object.keys(CP_FRAMES).filter(function (n) { return n.toLowerCase() === name.toLowerCase(); })[0];
    return k || null;
  }
  function cplane() { if (typeof cp === 'number' && !planeFeature(cp)) cp = 'Top'; return cp; }
  function setCplane(name) {
    var n = norm(name);
    if (n == null) { if (UI.setStatus) UI.setStatus('No construction plane ' + name + '.'); return cplane(); }
    var prev = cplane();
    if (n === prev) return prev;
    cp = n;
    cpListeners.slice().forEach(function (fn) { try { fn(n, prev); } catch (e) { console.warn('onCplane', e); } });
    if (UI.refreshStatus) { try { UI.refreshStatus(); } catch (e) { } }
    tick(true);
    return cp;
  }
  function onCplane(fn) {
    if (typeof fn !== 'function') return function () { };
    cpListeners.push(fn);
    return function () { var i = cpListeners.indexOf(fn); if (i >= 0) cpListeners.splice(i, 1); };
  }
  function cplaneLabel(name) {
    var n = name == null ? cplane() : norm(name);
    if (typeof n === 'number') { var f = planeFeature(n); return f ? f.name : 'Top'; }
    return n || 'Top';
  }
  function cplaneSketchPlane(name) {
    var n = name == null ? cplane() : norm(name);
    if (n == null) return null;
    // lane mcpolish: in 2D the wireframe is drawn flat on the construction plane at its Z depth (Home ▸ Organize ▸ Z)
    var z = cpMode === '2D' ? cpZ : 0;
    if (typeof n === 'number') {
      var bp = z && App.build && App.build.planes ? App.build.planes[n] : null;
      if (!bp) return { featureId: n };
      return { custom: true, origin: K.vec.add(bp.origin, K.vec.scale(bp.n, z)), x: bp.x.slice(), y: bp.y.slice(), n: bp.n.slice() };
    }
    var fr = CP_FRAMES[n];
    if (fr.ref) return { ref: fr.ref, offset: z };
    return { custom: true, origin: [fr.n[0] * z, fr.n[1] * z, fr.n[2] * z], x: fr.x.slice(), y: fr.y.slice(), n: fr.n.slice() };
  }
  // ---- lane mcpolish: the construction plane's Z depth and Mastercam's 3D / 2D mode (status bar). 2D: the wireframe
  // tools draw flat on the construction plane at Z; 3D: Z is not applied (the plane through the origin; a 3D Sketch
  // places its points in space). A Z typed while in 3D switches to 2D, as only 2D uses it.
  var cpZ = 0, cpMode = '3D';
  function cplaneZ() { return cpZ; }
  function setCplaneZ(z) {
    z = +z;
    if (!isFinite(z)) return cpZ;
    cpZ = z;
    if (z !== 0 && cpMode !== '2D') cpMode = '2D';
    cpListeners.slice().forEach(function (fn) { try { fn(cplane(), cplane()); } catch (e) { console.warn('onCplane', e); } });
    if (UI.refreshStatus) { try { UI.refreshStatus(); } catch (e) { } }
    return cpZ;
  }
  function cplaneMode() { return cpMode; }
  function setCplaneMode(m) {
    cpMode = m === '2D' ? '2D' : '3D';
    cpListeners.slice().forEach(function (fn) { try { fn(cplane(), cplane()); } catch (e) { console.warn('onCplane', e); } });
    if (UI.refreshStatus) { try { UI.refreshStatus(); } catch (e) { } }
    return cpMode;
  }
  function profileDef() { try { return UI.Profiles && UI.Profiles.def ? UI.Profiles.def(UI.Profiles.active()) : null; } catch (e) { return null; } }
  function cplaneReset() { var p = profileDef(); setCplane(p && p.wireframe && norm(p.wireframe.plane) != null ? p.wireframe.plane : 'Top'); }

  // ---- the graphics window of the profile
  function viewportProfile() { var p = profileDef(); return p && p.viewport && typeof p.viewport === 'object' ? p.viewport : null; }
  var hooks = UI.viewportProfileHooks = UI.viewportProfileHooks || [];
  var applied = null, labelsEl = null, labelsText = null, onChangeHooked = false;
  function profKey() { var p = profileDef(); return p ? p.id + ':' + (p.rev || 0) : 'none'; }
  function applyViewport() {
    var s = viewportProfile();
    applied = profKey();
    // gradient: the profile's two colours replace the default ground (View ▸ Background Plain / Dark still apply)
    var bg = s && Array.isArray(s.background) && s.background.length >= 2 ? s.background : null;
    if (bg) viewport.style.setProperty('--viewport', 'linear-gradient(180deg, ' + bg[0] + ' 0%, ' + bg[1] + ' 100%)');
    else viewport.style.removeProperty('--viewport');
    viewport.classList.toggle('vp-profile-bg', !!bg);
    viewport.classList.toggle('vp-nohud', !!(s && s.headsUp === false));
    if (s && s.labels) {
      if (!labelsEl) { labelsEl = document.createElement('div'); labelsEl.id = 'vp-labels'; labelsEl.setAttribute('aria-live', 'off'); viewport.appendChild(labelsEl); }
      labelsEl.hidden = false; labelsText = null;
    } else if (labelsEl) labelsEl.hidden = true;
    if (UI.profileViewportColors) UI.profileViewportColors(s && s.colors && typeof s.colors === 'object' ? s.colors : null);   // lane mctheme
    hooks.forEach(function (h) { try { h(s); } catch (e) { console.warn('viewport profile hook', e); } });
    tick(true);
  }
  // the name of the graphics view (a standard view the camera looks along, else Mastercam's "Not saved")
  function viewName() {
    var c = UI.cam;
    if (!c || !c.dir || !c.up) return 'Top';
    var names = Object.keys(UI.VIEWS);
    for (var i = 0; i < names.length; i++) {
      var v = UI.VIEWS[names[i]], d = new THREE.Vector3(v[0][0], v[0][1], v[0][2]).normalize();
      if (d.dot(c.dir) < 1 - 1e-6) continue;
      var u = new THREE.Vector3(v[1][0], v[1][1], v[1][2]);
      u.addScaledVector(d, -u.dot(d)).normalize();
      if (u.dot(c.up) > 1 - 1e-6) return names[i];
    }
    return 'Not saved';
  }
  function labels() { var c = cplaneLabel(); return { gview: viewName(), wcs: 'Top', cplane: c, tplane: c, scale: UI.scaleBar ? UI.scaleBar().text : '' }; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tick(force) {
    if (!onChangeHooked && UI.Profiles && UI.Profiles.onChange) { onChangeHooked = true; UI.Profiles.onChange(function () { applyViewport(); }); }
    if (applied !== profKey()) { applyViewport(); return; }
    if (UI.syncProfileViewportColors) UI.syncProfileViewportColors();   // lane mctheme: after a theme / style reset of the line tables
    if (!labelsEl || labelsEl.hidden) return;
    var L = labels(), t = L.gview + '|' + L.cplane + '|' + (UI.drawingActive && UI.drawingActive() ? 'd' : '');
    if (t === labelsText && !force) return;
    labelsText = t;
    labelsEl.innerHTML = '<span class="vpl-view"><b data-label="gview">' + esc(L.gview) + '</b></span>' +
      '<span>Gview: <span data-label="gview2">' + esc(L.gview) + '</span></span><span>WCS: <span data-label="wcs">' + esc(L.wcs) + '</span></span>' +
      '<span>C: <span data-label="cplane">' + esc(L.cplane) + '</span></span><span>T: <span data-label="tplane">' + esc(L.tplane) + '</span></span>';
  }
  UI.viewFurnitureTick = function () { tick(false); };
  UI.viewportProfile = viewportProfile;
  UI.applyViewportProfile = applyViewport;
  UI.viewportLabels = function () { tick(true); return labelsEl && !labelsEl.hidden ? labels() : null; };
  UI.cplane = cplane; UI.setCplane = setCplane; UI.onCplane = onCplane; UI.cplaneLabel = cplaneLabel; UI.cplaneSketchPlane = cplaneSketchPlane; UI.cplaneReset = cplaneReset;
  UI.cplaneZ = cplaneZ; UI.setCplaneZ = setCplaneZ; UI.cplaneMode = cplaneMode; UI.setCplaneMode = setCplaneMode;   // lane mcpolish
  UI.CPLANES = Object.keys(CP_FRAMES);
})(UI);

// ------------------------------------------------------------------ lane mcpolish (2026-11-11)
// View and display commands Mastercam has and Anvil lacked (both profiles may run them; the Mastercam tabs and the
// SolidWorks menus place them, ui-panels.js "frame actions"):
//   UI.unzoom(f)                 zoom out about the centre so the model shows at f of its size (0.5, 0.8)
//   UI.translucency(on?)         the whole model see-through (edges stay); -> on
//   UI.showWorldAxes(on?)        X / Y / Z axes through the origin (Mastercam's Show Axes); -> on
//   UI.showGnomons(on?)          the triad and the view-name labels (Mastercam's Show Gnomons); -> on
//   UI.gridShown(on?) / UI.gridSnap(on?)   Mastercam's Show Grid and Snap to Grid, apart (updateGrid reads
//                                App.view.gridVisible; ui-sketch.js snaps while App.view.showGrid)
//   UI.viewState() / UI.setViewState(s)    { target, dir, up, scale, cplane, z, mode, hiddenLevels }: what a viewsheet keeps
(function (UI) {
  'use strict';
  var App = UI.App, viewport = UI.viewport;
  function refreshAll() { if (UI.requestRender) UI.requestRender(); if (UI.refreshRibbon) { try { UI.refreshRibbon(); } catch (e) { } } if (UI.refreshStatus) { try { UI.refreshStatus(); } catch (e) { } } }
  function unzoom(f) {
    f = +f || 0.5;
    if (UI.pushViewHistory) { try { UI.pushViewHistory(); } catch (e) { } }
    UI.zoomView(1 / f);
    UI.requestRender();
    return UI.cam.scale;
  }
  // ---- Translucency: every material of the shaded body (RealView's too) see-through; the crack filler is off meanwhile
  var tl = { on: false, mats: [] };
  function eachMat(o, fn) { if (!o) return; o.traverse(function (c) { if (!c.isMesh || !c.material) return; (Array.isArray(c.material) ? c.material : [c.material]).forEach(fn); }); }
  function tlApply() {
    var bm = UI.getBodyMesh ? UI.getBodyMesh() : null;
    if (!tl.on) return;
    eachMat(bm, function (m) {
      if (m.userData._tl) return;
      m.userData._tl = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      m.transparent = true; m.opacity = 0.35; m.depthWrite = false; m.needsUpdate = true;
      tl.mats.push(m);
    });
    var cf = UI.getCrackFill ? UI.getCrackFill() : null;
    if (cf && cf.visible) cf.visible = false;
  }
  function translucency(on) {
    if (on == null) return tl.on;
    on = !!on;
    if (on === tl.on) return on;
    tl.on = on;
    App.view.translucent = on;
    if (!on) {
      tl.mats.forEach(function (m) { var o = m.userData._tl; if (!o) return; m.transparent = o.transparent; m.opacity = o.opacity; m.depthWrite = o.depthWrite; m.needsUpdate = true; delete m.userData._tl; });
      tl.mats = [];
      if (UI.applyDisplayStyle) UI.applyDisplayStyle();
    } else tlApply();
    refreshAll();
    return on;
  }
  // ---- Show Axes: three lines through the origin, as long as the model is big (at least an inch / 25 mm)
  var ax = { on: false, group: null, key: '' };
  function axesSync() {
    if (!ax.on) { if (ax.group) { UI.scene.remove(ax.group); UI.disposeGroup(ax.group); ax.group = null; ax.key = ''; } return; }
    var b = UI.modelBounds ? UI.modelBounds() : { min: [-50, -50, -50], max: [50, 50, 50] };
    var L = 0; for (var k = 0; k < 3; k++) L = Math.max(L, Math.abs(b.min[k]), Math.abs(b.max[k]));
    L = Math.max(L * 1.25, App.model && App.model.units === 'in' ? 1 : 25);
    var key = L.toPrecision(4);
    if (ax.group && ax.key === key) return;
    if (ax.group) { UI.scene.remove(ax.group); UI.disposeGroup(ax.group); }
    var g = new THREE.Group(); g.name = 'mc-world-axes';
    [[1, 0, 0, 0xd83b3b], [0, 1, 0, 0x2fa84f], [0, 0, 1, 0x3b6fd8]].forEach(function (a) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-a[0] * L, -a[1] * L, -a[2] * L, a[0] * L, a[1] * L, a[2] * L], 3));
      var line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: a[3] }));
      line.userData.axis = a[0] ? 'X' : a[1] ? 'Y' : 'Z';
      g.add(line);
    });
    UI.scene.add(g);
    ax.group = g; ax.key = key;
    UI.requestRender();
  }
  function showWorldAxes(on) { if (on == null) return ax.on; ax.on = !!on; App.view.showWorldAxes = ax.on; axesSync(); refreshAll(); return ax.on; }
  // ---- Show Gnomons: the triad and the profile's view labels
  function showGnomons(on) {
    if (on == null) return !viewport.classList.contains('vp-nognomon');
    viewport.classList.toggle('vp-nognomon', !on);
    App.view.hideGnomons = !on;
    refreshAll();
    return !!on;
  }
  // ---- Show Grid / Snap to Grid
  function gridDrawn() { var v = App.view; return v.gridVisible === true || (!!v.showGrid && v.gridVisible !== false); }
  function gridShown(on) {
    if (on == null) return gridDrawn();
    App.view.gridVisible = !!on;
    App.gridStale = true; refreshAll();
    return gridDrawn();
  }
  function gridSnap(on) {
    if (on == null) return !!App.view.showGrid;
    var shown = gridDrawn();
    App.view.showGrid = !!on;
    App.view.gridVisible = shown;   // snapping on or off leaves the grid as it was on screen
    App.gridStale = true; refreshAll();
    return !!App.view.showGrid;
  }
  // ---- what a viewsheet keeps
  function hiddenLevels() { try { return UI.levels ? UI.levels.list().filter(function (l) { return l.hidden; }).map(function (l) { return l.number; }) : []; } catch (e) { return []; } }
  function viewState() {
    var c = UI.cam;
    return { target: c.target.toArray(), dir: c.dir.toArray(), up: c.up.toArray(), scale: c.scale, cplane: UI.cplane ? UI.cplane() : 'Top', z: UI.cplaneZ ? UI.cplaneZ() : 0, mode: UI.cplaneMode ? UI.cplaneMode() : '3D', hiddenLevels: hiddenLevels() };
  }
  function setViewState(s) {
    if (!s) return false;
    if (UI.finishViewAnimation) UI.finishViewAnimation();
    var c = UI.cam;
    c.target.fromArray(s.target); c.dir.fromArray(s.dir).normalize(); c.up.fromArray(s.up).normalize(); c.scale = s.scale;
    c.right.crossVectors(c.up, c.dir).normalize();
    UI.applyCamera();
    if (UI.setCplane && s.cplane != null) UI.setCplane(s.cplane);
    if (UI.setCplaneMode && s.mode) UI.setCplaneMode(s.mode);
    if (UI.setCplaneZ && s.z != null && UI.cplaneZ() !== s.z) { var m = s.mode; UI.setCplaneZ(s.z); if (m && UI.setCplaneMode) UI.setCplaneMode(m); }
    if (UI.levels && s.hiddenLevels) {
      try {
        var want = {}; s.hiddenLevels.forEach(function (n) { want[n] = true; });
        UI.levels.list().forEach(function (l) { if (!!l.hidden !== !!want[l.number]) UI.levels.op('setVisible', l.number, !want[l.number]); });
      } catch (e) { console.warn('viewsheet levels', e); }
    }
    UI.requestRender();
    return true;
  }
  // every frame (after the furniture): translucency on a new body mesh, the axes as the model grows
  var baseTick = UI.viewFurnitureTick;
  UI.viewFurnitureTick = function () {
    if (baseTick) baseTick();
    if (tl.on) tlApply();
    if (ax.on) axesSync();
  };
  UI.unzoom = unzoom; UI.translucency = translucency; UI.showWorldAxes = showWorldAxes; UI.showGnomons = showGnomons;
  UI.gridShown = gridShown; UI.gridSnap = gridSnap; UI.viewState = viewState; UI.setViewState = setViewState;
})(UI);
