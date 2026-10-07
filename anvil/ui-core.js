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
    view: { style: 'shadedEdges', showPlanes: false, showOrigin: true, showSketches: false, showGrid: false, showDims: false, section: null, bg: 'gradient' },
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
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d96a1, 0.42));
  var key = new THREE.DirectionalLight(0xffffff, 0.72); key.position.set(-0.45, 0.85, 1.3); camera.add(key);
  var fill = new THREE.DirectionalLight(0xf2f6ff, 0.26); fill.position.set(1, -0.35, 0.7); camera.add(fill);
  var rim = new THREE.DirectionalLight(0xffffff, 0.3); rim.position.set(0.2, 0.5, -1); camera.add(rim);

  var groups = {
    body: new THREE.Group(), edges: new THREE.Group(), sketches: new THREE.Group(), temp: new THREE.Group(),
    preview: new THREE.Group(), planes: new THREE.Group(), grid: new THREE.Group(), origin: new THREE.Group(), highlight: new THREE.Group()
  };
  Object.keys(groups).forEach(function (k) { scene.add(groups[k]); });

  var mats = {
    part: new THREE.MeshPhongMaterial({ color: 0xa8adb6, specular: 0x50565e, shininess: 64, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),   // r14/viewui14: glossier (was specular 0x2a2f36, shininess 38)
    // r14/viewui14: the HLR / HLV occluder writes depth only, so the background (gradient, plain or dark) shows through it
    // as in SolidWorks; the edges are drawn after it (renderOrder 0.5), so hidden ones are still hidden
    hlr: new THREE.MeshBasicMaterial({ color: 0xffffff, colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    edge: new THREE.LineBasicMaterial({ color: 0x23272d }),
    // r14/viewui14: SolidWorks' face highlights are a tint over the shaded face, not a repaint: blue for selected, orange
    // for the pre-highlight, light enough that the face's shading (and its edges) still read through
    hover: new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.38,   // r5/select5: orange like edge / vertex / sketch pre-highlights (was light blue)
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
    sel: new THREE.MeshBasicMaterial({ color: 0x3d8bff, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }),   // r14/viewui14: blue (was green 0x69d98a at 0.6)
    preview: new THREE.MeshPhongMaterial({ color: 0xf2cf5b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    previewCut: new THREE.MeshPhongMaterial({ color: 0xe8746a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
    // the sketch being edited is drawn on top of the body so it stays visible on hidden planes
    sketch: new THREE.LineBasicMaterial({ color: 0x1f5fd0, depthTest: false }),
    sketchDim: new THREE.LineBasicMaterial({ color: 0x8a94a3 }),
    sketchSel: new THREE.LineBasicMaterial({ color: 0x1fa653, depthTest: false }),
    // active-sketch entities by definition state (sketch-solver.js): under = mats.sketch (blue), fully defined, over
    // defined (redundant, yellow), conflict (red)
    sketchFull: new THREE.LineBasicMaterial({ color: 0x15181d, depthTest: false }),
    sketchOver: new THREE.LineBasicMaterial({ color: 0xd9302c, depthTest: false }),   // sketchdims: over defined is red, as SolidWorks draws it
    sketchConflict: new THREE.LineBasicMaterial({ color: 0xd9302c, depthTest: false }),
    temp: new THREE.LineBasicMaterial({ color: 0x1f5fd0, depthTest: false }),
    planeFace: new THREE.MeshBasicMaterial({ color: 0x5a9be6, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    planeFaceHi: new THREE.MeshBasicMaterial({ color: 0x3d8bff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    planeFaceHover: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),   // r5/select5
    planeLine: new THREE.LineBasicMaterial({ color: 0x5a9be6 }),
    grid: new THREE.LineBasicMaterial({ color: 0xb8c0ca, transparent: true, opacity: 0.55 }),
    gridMajor: new THREE.LineBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.7 })
  };
  mats.sketchDangling = new THREE.LineBasicMaterial({ color: 0xa88300 });   // r12/occtui12: a Dangling sketch (its face is gone), SolidWorks' olive

  var bodyMesh = null, edgeLines = null;

  // ------------------------------------------------------------------ viewport theme
  // The viewport background is CSS (the renderer clears to transparent) and is themed by the stylesheet through
  // document.documentElement.dataset.theme; the line materials above are tuned for the light background, so the
  // dark theme swaps them here. `light` is exactly the set of colours the materials are created with.
  // The HLR body colour follows the theme too: it exists to occlude hidden lines, so it must read as "background".
  var THEME_COLORS = {
    light: { edge: 0x23272d, grid: 0xb8c0ca, gridMajor: 0x9aa4b0, sketchDim: 0x8a94a3, planeLine: 0x5a9be6, hlr: 0xffffff, sketchFull: 0x15181d },
    dark: { edge: 0xd8dde3, grid: 0x3a424c, gridMajor: 0x4e5763, sketchDim: 0xa7b0bb, planeLine: 0x6fa8ea, hlr: 0x1e232b, sketchFull: 0xeef1f5 }
  };
  var viewportTheme = 'light';
  // r14/viewui14: the line palette follows what the lines are drawn over. The dark palette applies with the dark theme or
  // the Dark background; model edges on a shaded body stay dark as in SolidWorks (light edges on a light grey body read
  // as a washed-out outline) and turn light only where the body is not painted (HLR / HLV / wireframe on dark).
  var EDGE_ON_BODY_DARK = 0x16191d;
  function darkViewport() { return viewportTheme === 'dark' || App.view.bg === 'dark'; }
  function applyLinePalette() {
    var c = THEME_COLORS[darkViewport() ? 'dark' : 'light'];
    Object.keys(c).forEach(function (k) { if (mats[k].color.getHex() !== c[k]) { mats[k].color.setHex(c[k]); mats[k].needsUpdate = true; } });
    var s = App.view.style, painted = s !== 'hlr' && s !== 'hlv' && s !== 'wireframe';
    if (darkViewport() && painted && mats.edge.color.getHex() !== EDGE_ON_BODY_DARK) { mats.edge.color.setHex(EDGE_ON_BODY_DARK); mats.edge.needsUpdate = true; }
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

  // r14/viewui14: View ▸ Background — 'gradient' (SolidWorks' default: light blue-grey at the top fading to white),
  // 'plain' (the theme's plain colour) or 'dark'; remembered per browser in localStorage 'anvil.bg'. The background is
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
  mats.part.onBeforeCompile = function (sh) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      'gl_FragColor.rgb *= mix(0.8, 1.0, smoothstep(0.04, 0.6, abs(normal.z)));\n#include <dithering_fragment>');
  };
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
  }

  function resize() {
    var w = viewport.clientWidth, h = viewport.clientHeight;
    if (w < 2 || h < 2) return;
    // smooth/chrome: a resize to the same size is skipped (setting a canvas's size clears it), and a real one redraws at
    // once — the ResizeObserver runs after this frame's render, so the Task Pane opening or closing showed one blank frame
    if (w === size.w && h === size.h && renderer.domElement.style.width === w + 'px' && renderer.domElement.width === Math.floor(w * renderer.getPixelRatio())) return;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
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
    var dy = ev.deltaY * (ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1);
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
    disposeGroup(groups.body); disposeGroup(groups.edges);
    bodyMesh = null; edgeLines = null; silLines = null; edgeScr.edges = null; pickMemo.key = null;
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
    edgeLines = new THREE.LineSegments(buildEdgeGeometry(m), mats.edge);
    groups.edges.add(edgeLines);
    silLines = buildSilhouettes(m);
    if (silLines) groups.edges.add(silLines);
    sceneVer++;
    applyDisplayStyle();
  }
  var silLines = null;

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
  var fatU = { resolution: { value: new THREE.Vector2(1, 1) }, worldPerPx: { value: 1 } };
  var fatOk = (function () {
    try { return !!(renderer.capabilities.isWebGL2 || renderer.extensions.get('ANGLE_instanced_arrays')); } catch (e) { return false; }
  })();
  // every thick-line geometry owns its 4-corner quad (disposing a geometry frees its attributes' GL buffers)
  var FAT_QUAD = new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), FAT_IDX = new Uint16Array([0, 1, 2, 2, 1, 3]);
  function fatVertexShader(kind) {
    return [
      'uniform vec2 resolution;', 'uniform float linewidth;', 'uniform float worldPerPx;',
      'attribute vec3 instanceStart;', 'attribute vec3 instanceEnd;',
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
      '  vec2 off = nrm * position.x * hw + dir * (atA ? -hw : hw);',
      '  c.xy += off / hr * c.w;',
      '  gl_Position = c;',
      '  vPx = vec2(position.x * hw, atA ? -hw : L + hw);', '  vLen = L;', '  vHw = hw;',
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
        resolution: fatU.resolution, worldPerPx: fatU.worldPerPx, linewidth: { value: 1 },
        color: { value: new THREE.Color() }, opacity: { value: 1 }, dashPx: { value: 6 }, gapPx: { value: 4 },
        viewDir: silMat.uniforms.viewDir
      },
      vertexShader: fatVertexShader(kind), fragmentShader: fatFragmentShader, clipping: true, side: THREE.DoubleSide
    });
    m.userData.fatKind = kind;
    if (kind === 'hid' || kind === 'silhid') { m.depthFunc = THREE.GreaterDepth; m.depthWrite = false; m.uniforms.dashPx.value = 5; m.uniforms.gapPx.value = 3; }
    return m;
  }
  function hiddenLineColor() { return viewportTheme === 'dark' ? 0x7d8792 : 0x8a919a; }
  // copies what the source material says onto its thick twin (cheap; runs per object per frame)
  function syncFatMat(fm, src, w, hidden) {
    var srcColor = src.uniforms && src.uniforms.color ? src.uniforms.color.value : src.color;
    if (hidden) fm.uniforms.color.value.setHex(hiddenLineColor());
    else if (srcColor) fm.uniforms.color.value.copy(srcColor);
    fm.uniforms.opacity.value = src.opacity != null ? src.opacity : 1;
    fm.uniforms.linewidth.value = w;
    if (fm.transparent !== !!src.transparent) { fm.transparent = !!src.transparent; fm.needsUpdate = true; }
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
    fatU.worldPerPx.value = (camera.right - camera.left) / Math.max(1, size.w);
    // the faces sit back by their slope over half an edge width, so an edge in an inside corner (a pocket floor, a boss
    // foot) is not half buried by the face that rises towards the viewer next to it (1 px was enough for 1-pixel lines)
    var po = fatOn && fatOk ? 1 + Math.ceil(LINE_W.edge * renderer.getPixelRatio() * 2) / 4 : 1;
    if (mats.part.polygonOffsetFactor !== po) { mats.part.polygonOffsetFactor = po; mats.hlr.polygonOffsetFactor = po; }
  }
  function lineMat(mat, w, extra) { mat.userData.lineWidth = w; if (extra) Object.keys(extra).forEach(function (k) { mat.userData[k] = extra[k]; }); return mat; }
  lineMat(mats.edge, LINE_W.edge, { hlv: true });
  lineMat(silMat, LINE_W.edge, { hlv: true, fatSil: true });
  ['sketch', 'sketchFull', 'sketchOver', 'sketchConflict'].forEach(function (k) { lineMat(mats[k], LINE_W.sketch); });
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
    if (m && n && m.normals && n.length === m.normals.length && !m.smoothNormals) m.smoothNormals = n;
  }
  // App.edges is computed once per mesh (bodyEdges is not cheap) and reused when only visibility changes.
  function edgesFor(m) {
    if (App.edges && App.edgesMesh === m) return App.edges;
    App.edgesMesh = m;
    var asmE = null;
    App.edges = edgesFromWorker(m) || (asmE = UI.asmEdges && UI.asmEdges(m)) || K.bodyEdges(m);   // asmEdges: an assembly from its parts' edges (ui-assembly.js)
    // a solid from OpenCascade (ui-occt.js): every polygon knows its B-rep face; edges inside one face are seams
    if (m.faces.length && m.faces[0].polys && m.faces[0].polys[0] && m.faces[0].polys[0].face != null) {
      App.edges.forEach(function (e) {
        if (e.faces.length !== 2) return;
        var a = m.faces[e.faces[0]].polys[0].face, b = m.faces[e.faces[1]].polys[0].face;
        if (a != null && a === b && (m.faces[e.faces[0]].body || 0) === (m.faces[e.faces[1]].body || 0)) { e.seam = true; e.smooth = true; }   // (r4/asm4: one component's)
      });
    }
    App.curves = asmE && asmE.curves ? asmE.curves : annotateCurveEdges(m, App.edges);   // r4/asm4: placed from the parts' curves
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
  // unit outward-or-inward normal of surface S at point x ([x,y,z]), or null where it is undefined (a cone apex)
  function surfNormal(S, x) {
    var v = [x[0] - S.o[0], x[1] - S.o[1], x[2] - S.o[2]], d = S.d, z = V.dot(v, d), n;
    if (S.t === 'sph') n = v;
    else {
      var rho = [v[0] - d[0] * z, v[1] - d[1] * z, v[2] - d[2] * z], rl = V.len(rho);
      if (rl < 1e-9) return null;   // on the axis: a cone apex or a torus pole has no single normal
      var er = [rho[0] / rl, rho[1] / rl, rho[2] / rl];
      if (S.t === 'cyl') n = er;
      else if (S.t === 'cone') n = [er[0] - (S.k || 0) * d[0], er[1] - (S.k || 0) * d[1], er[2] - (S.k || 0) * d[2]];
      else if (S.t === 'tor') n = [rho[0] - er[0] * S.R, rho[1] - er[1] * S.R, rho[2] - er[2] * S.R];   // from the tube centre o + R·eρ
      else return null;
    }
    var l = V.len(n);
    return l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : null;
  }
  // analyticNormals(mesh) -> Float32Array laid out like mesh.normals (3 per triangle corner); cached on the mesh as
  // mesh.smoothNormals. The triangles follow meshFromBody's order (each face's polygons fanned from vertex 0); each
  // normal is oriented to agree with its facet's (holes face inward). mesh.normals itself stays flat (exports, zebra).
  function analyticNormals(m) {
    if (m.smoothNormals) return m.smoothNormals;
    var an = m === App.mesh && UI.asmNormals ? UI.asmNormals(m) : null;   // r4/asm4: an assembly's, from its parts'
    if (an) return (m.smoothNormals = an);
    var out = new Float32Array(m.normals);
    (m.faces || []).forEach(function (f) {
      if (!f.polys) return;
      var t = f.start, fn = f.normal, ok = true, writes = [];
      f.polys.forEach(function (p) {
        var vs = p.vertices, nt = Math.max(0, vs.length - 2);
        if (p.surf && p.surf.s) {
          var vn = vs.map(function (vx) {
            var n = surfNormal(p.surf.s, [vx.pos.x, vx.pos.y, vx.pos.z]);
            if (!n) return fn;
            return V.dot(n, fn) < 0 ? [-n[0], -n[1], -n[2]] : n;
          });
          for (var j = 1; j + 1 < vs.length; j++) writes.push(t + j - 1, vn[0], vn[j], vn[j + 1]);
        }
        t += nt;
      });
      if (t !== f.start + f.count) ok = false;   // not the layout meshFromBody made: keep the flat normals
      if (!ok) return;
      for (var w = 0; w < writes.length; w += 4) {
        var o = writes[w] * 9;
        for (var c = 0; c < 3; c++) { var n = writes[w + 1 + c]; out[o + c * 3] = n[0]; out[o + c * 3 + 1] = n[1]; out[o + c * 3 + 2] = n[2]; }
      }
    });
    m.smoothNormals = out;
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
    var curves = list.map(function (c) {
      var n = c.normal, xd = c.xdir, yd = V.cross(n, xd), sweep = c.a1 - c.a0;
      var segs = Math.max(4, Math.ceil(CURVE_SEGS * sweep / (2 * Math.PI) - 1e-9)), pts = [];
      for (var i = 0; i <= segs; i++) {
        var a = c.a0 + sweep * i / segs, ca = Math.cos(a) * c.radius, sa = Math.sin(a) * c.radius;
        pts.push([c.center[0] + xd[0] * ca + yd[0] * sa, c.center[1] + xd[1] * ca + yd[1] * sa, c.center[2] + xd[2] * ca + yd[2] * sa]);
      }
      return { curve: c, pts: pts, edges: [] };
    });
    var chordMap = {};
    curves.forEach(function (c, ci) { c.curve.chords.forEach(function (ch) { chordMap[pairKey(ekey3(ch[0]), ekey3(ch[1]))] = ci; }); });
    // pieces of a chord (a face outline split it at a T-junction): both ends on one of the curve's chords
    function onSeg(p, q0, q1, tol) { return K.pointSegmentDistance(p, q0, q1) <= tol; }
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
    Object.keys(drawCurve).forEach(function (ci) { pushPolyline(arr, App.curves[ci].pts); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }

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

  function applyDisplayStyle() {
    var s = App.view.style;
    if (bodyMesh) { bodyMesh.visible = s !== 'wireframe'; bodyMesh.material = s === 'hlr' || s === 'hlv' ? mats.hlr : mats.part; }   // r13/lines13: hlv = Hidden Lines Visible
    if (edgeLines) edgeLines.visible = s !== 'shaded';
    if (silLines) silLines.visible = s !== 'shaded';
    mats.part.color.set(App.model.color || '#a8adb6');
    applyBodyColors();
    applyLinePalette();   // r14/viewui14: edges dark on a painted body, light on a dark background otherwise
    var planes = App.view.section ? [App.view.section.plane] : [];
    needsRender = true;
    [mats.part, mats.hlr, mats.edge, mats.hover, mats.sel, silMat].forEach(function (mm) { mm.clippingPlanes = planes; mm.needsUpdate = true; });
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
        c.set(cols[f.body || 0] || App.model.color || '#a8adb6');
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
    mesh._faceGroups = of;
    return of;
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
  var edgeSelMat = lineMat(new THREE.LineBasicMaterial({ color: 0x1f6fe8, depthTest: false }), LINE_W.edgeSel);   // r14/viewui14: blue (was green)
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
      return g.sketch === id || g.profile === id || g.path === id || (g.sketches && g.sketches.indexOf(id) >= 0);
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
  // r12/sketchui12: the end and centre points of the active sketch's entities as small round dots in the entity's
  // colour (SolidWorks' entity points), one dot where several ends meet; mid points and a corner rectangle's centre
  // are not shown (SolidWorks has none there)
  var ptTexture = null, ptMats = {};
  function sketchPointMat(m) {
    if (!ptTexture) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 32;
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(16, 16, 14, 0, Math.PI * 2); cx.fill();
      ptTexture = new THREE.CanvasTexture(cv);
    }
    var pm = ptMats[m.uuid];
    if (!pm) pm = ptMats[m.uuid] = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, map: ptTexture, alphaTest: 0.5, transparent: false, depthTest: false });
    pm.color = m.color;   // the same Color: a theme switch recolours the dots with their lines
    return pm;
  }
  function sketchEndPoints(f, i, e, mat, ptsBy) {
    var S = window.SketchSolver;
    if (!S || !S.pointRefs || e.t === 'point') return;
    S.pointRefs(f, i).forEach(function (pr) {
      if (/\.mid$/.test(pr.ref) || (e.t === 'rect' && /\.c$/.test(pr.ref))) return;
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
    App.model.features.forEach(function (f) {
      if (f.type !== 'sketch' || !sketchVisible(f)) return;
      var pl; try { pl = K.resolvePlane(f.plane, App.model, App.build && App.build.planes); } catch (e) { return; }
      var active = App.activeSketch === f.id;
      // the active sketch is analysed on every redraw: entity colours and the status bar's Under / Fully / Over Defined
      var state = null;
      if (active && App.sketchDragging && App.sketchState) state = App.sketchState;   // mid-drag: same relations, same state
      else if (active && window.SketchSolver) { try { SketchSolver.clean(f); state = App.sketchState = SketchSolver.analyze(f); } catch (err) { state = App.sketchState = null; } }
      var stateMat = { full: mats.sketchFull, over: mats.sketchOver, conflict: mats.sketchConflict }, ptsBy = {};
      f.entities.forEach(function (e, i) {
        var pls = screenPolylines(e);
        var selected = active && (UI.entitySelected ? UI.entitySelected(i) : App.sel && App.sel.kind === 'entity' && App.sel.index === i);
        var mat = selected ? mats.sketchSel : (active ? (state && stateMat[state.entities[i]]) || mats.sketch : mats.sketchDim);
        if (!active && !selected && App.build && App.build.warnings && /^Dangling\b/.test(App.build.warnings[f.id] || '')) mat = mats.sketchDangling;   // r12/occtui12
        if (e.t === 'point') {
          var p = K.to3D(pl, e.x, e.y), s = cam.scale * 3;
          var g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(V.add(p, V.scale(pl.x, -s)), V.add(p, V.scale(pl.x, s)), V.add(p, V.scale(pl.y, -s)), V.add(p, V.scale(pl.y, s))), 3));
          groups.sketches.add(new THREE.LineSegments(g, mat));
          return;
        }
        if (!pls.length) return;
        var baseMat = mat;
        if (e.construction) mat = dashedMat(mat);   // construction geometry / centerlines: dashed
        var ls = new THREE.LineSegments(lineGeometryFromPolylines(pl, pls), mat);
        if (e.construction) ls.computeLineDistances();
        ls.userData = { sketch: f.id, index: i };
        if (active) ls.renderOrder = 10;
        groups.sketches.add(ls);
        if (active) sketchEndPoints(f, i, e, baseMat, ptsBy);
      });
      if (active) addSketchPoints(pl, ptsBy);
    });
    if (App.mode !== 'sketch') App.sketchState = null;
    else if (UI.refreshStatus) UI.refreshStatus();
  }
  function updateTemp() {
    disposeGroup(groups.temp);
    if (!App.tempEntities.length || App.activeSketch == null) return;
    var pl = activePlane();
    App.tempEntities.forEach(function (e) {
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
  var GRID_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  function gridStep() {
    for (var i = 0; i < GRID_STEPS.length; i++) if (GRID_STEPS[i] / cam.scale >= 48) return GRID_STEPS[i];
    return 5000;
  }
  function snapStep() {
    var g = gridStep();
    return g / 5 / cam.scale >= 7 ? g / 5 : g;
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
    if (App.gridStale && sketchSegsScale > 0 && groups.sketches.children.length && Math.abs(Math.log(cam.scale / sketchSegsScale)) > Math.log(1.3) && !App.sketchDragging) updateSketches();
    if (!App.gridStale) return;
    App.gridStale = false;
    disposeGroup(groups.grid);
    if (App.mode !== 'sketch' || !App.view.showGrid) return;
    var pl = activePlane(), box = visiblePlaneBox(pl);
    if (!box) return;
    var step = gridStep(), minor = step / 5;
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
    if (!bodyMesh) return null;
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
      var tri = visTris ? visTris[h.faceIndex] : h.faceIndex;
      return { kind: 'face', index: faceAtTriangle(tri), point: [h.point.x, h.point.y, h.point.z] };
    }
    return null;
  }
  // r5/select5: every face under the pointer, nearest first, one per face group (Select Other reaches hidden faces)
  function pickFacesAll(mx, my) {
    if (!bodyMesh) return [];
    raycaster.setFromCamera(ndc(mx, my), camera);
    var hits = raycaster.intersectObject(bodyMesh, false), out = [], seen = {};
    hits.forEach(function (h) {
      if (App.view.section && App.view.section.plane.distanceToPoint(h.point) < 0) return;
      var fi = faceAtTriangle(visTris ? visTris[h.faceIndex] : h.faceIndex), grp = faceGroup(fi), key = grp && grp.length ? grp[0] : fi;
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
  // Nearest visible sharp edge within 7 px. Occlusion: the edge midpoint must not sit clearly behind the face under the cursor.
  function pickEdge(mx, my) {
    if (!App.edges || !App.edges.length) return null;
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
      var depth = V.dot(e.mid, [cam.dir.x, cam.dir.y, cam.dir.z]);
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
  function pickEntity(mx, my) {
    var f = activeSketchFeature();
    if (!f) return null;
    var pl = activePlane(), best = null, bestD = 7;
    f.entities.forEach(function (e, i) {
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
    return best;
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
  var TRIAD_AXES = [[[1, 0, 0], '#d9453b', 'X'], [[0, 1, 0], '#3fa34d', 'Y'], [[0, 0, 1], '#2d7dd2', 'Z']];
  function drawTriad(right, up, dir) {
    if (right) triadState.basis = [right, up, dir];
    else if (triadState.basis && viewAnim) { right = triadState.basis[0]; up = triadState.basis[1]; dir = triadState.basis[2]; }
    right = right || cam.right; up = up || cam.up; dir = dir || cam.dir;
    var w = triadCanvas.width, h = triadCanvas.height, c = [w / 2, h / 2 + 8], L = w * 0.34;
    tctx.clearRect(0, 0, w, h);
    var items = TRIAD_AXES.map(function (a, i) {
      var v = new THREE.Vector3(a[0][0], a[0][1], a[0][2]);
      return { axis: i, x: v.dot(right), y: v.dot(up), z: v.dot(dir), color: a[1], label: a[2] };
    }).sort(function (p, q) { return p.z - q.z; });
    var dark = darkViewport();
    tctx.lineCap = 'round'; tctx.lineJoin = 'round'; tctx.font = '600 22px Segoe UI, sans-serif'; tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
    // a small ball at the origin, like SolidWorks' triad
    tctx.fillStyle = dark ? '#9aa3ad' : '#6b7480'; tctx.beginPath(); tctx.arc(c[0], c[1], 4, 0, Math.PI * 2); tctx.fill();
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
      tctx.fillStyle = it.color; tctx.fillText(it.label, lx, ly);
      triadState.items.push({ axis: it.axis, z: it.z, a: c, b: [ex, ey], l: [lx, ly] });
    });
  }
  // the axis under a point of the triad canvas (CSS px from its top left), or -1; the one nearest the viewer wins
  function triadAxisAt(px, py) {
    var k = triadCanvas.width / Math.max(1, triadCanvas.clientWidth || 96), p = [px * k, py * k], best = -1, bestZ = -Infinity;
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
  function drawViewSelector() {
    if (!vs.shown) return;
    var dpr = window.devicePixelRatio || 1, S = Math.round(Math.max(170, Math.min(280, Math.min(size.w, size.h) * 0.46)));
    if (vs.size !== S || vsCanvas.width !== Math.round(S * dpr)) {
      vs.size = S; vsCanvas.width = Math.round(S * dpr); vsCanvas.height = Math.round(S * dpr);
      vsCanvas.style.width = S + 'px'; vsCanvas.style.height = S + 'px';
    }
    var b = vsBasis(), R = b[0], U = b[1], D = b[2], half = S / 2, r = S * 0.285;   // cube half-size in px (its diagonal fits)
    function P(p) { return [half + (p[0] * R.x + p[1] * R.y + p[2] * R.z) * r, half - (p[0] * U.x + p[1] * U.y + p[2] * U.z) * r]; }
    var g = vsCtx, dark = darkViewport();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    vs.cells = [];
    var faces = vsFaces.map(function (f) { return { f: f, z: f.n[0] * D.x + f.n[1] * D.y + f.n[2] * D.z }; }).sort(function (a, c) { return a.z - c.z; });
    faces.forEach(function (fz) {
      var f = fz.f, front = fz.z > 0.02;
      f.cells.forEach(function (c) {
        var q = c.quad.map(P);
        g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (var i = 1; i < 4; i++) g.lineTo(q[i][0], q[i][1]); g.closePath();
        var hot = front && vs.hover === c.id;
        g.fillStyle = hot ? 'rgba(255,154,46,0.85)' : !front ? (dark ? 'rgba(90,100,115,0.10)' : 'rgba(120,140,165,0.08)') : (dark ? 'rgba(70,80,95,0.62)' : 'rgba(236,241,247,0.68)');
        g.fill();
        g.strokeStyle = front ? (dark ? 'rgba(200,210,222,0.55)' : 'rgba(70,88,110,0.45)') : (dark ? 'rgba(200,210,222,0.18)' : 'rgba(70,88,110,0.16)');
        g.lineWidth = 1; g.stroke();
        if (front) vs.cells.push({ id: c.id, dir: c.dir, q: q, z: fz.z });
      });
      if (front && fz.z > 0.25) {
        // the face's name in the face's own plane (an affine map, as the projection is orthographic)
        var t = VS_TEXT[f.id], o = P(f.n), pr = P([f.n[0] + t[0][0], f.n[1] + t[0][1], f.n[2] + t[0][2]]), pu = P([f.n[0] + t[1][0], f.n[1] + t[1][1], f.n[2] + t[1][2]]);
        var ax = (pr[0] - o[0]) / 100, ay = (pr[1] - o[1]) / 100, bx = (pu[0] - o[0]) / 100, by = (pu[1] - o[1]) / 100;
        g.save();
        g.setTransform(dpr * ax, dpr * ay, -dpr * bx, -dpr * by, dpr * o[0], dpr * o[1]);
        g.globalAlpha = Math.min(1, (fz.z - 0.25) / 0.35);
        g.fillStyle = vs.hover === f.id ? '#3b2200' : dark ? '#e6ebf1' : '#33404f';
        g.font = '600 34px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
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
    ev.stopPropagation();   // no pre-highlight of the model under the cube
    if (ev.buttons) return;
    var p = vsLocal(ev), h = vsPick(p[0], p[1]), id = h ? h.id : null;
    vsCanvas.style.cursor = h ? 'pointer' : '';
    if (id !== vs.hover) { vs.hover = id; vsCanvas.title = vsTitle(h); drawViewSelector(); }
  });
  vsCanvas.addEventListener('mouseleave', function () { if (vs.hover) { vs.hover = null; drawViewSelector(); } });
  vsCanvas.addEventListener('mousedown', function (ev) {
    var p = vsLocal(ev), h = ev.button === 0 ? vsPick(p[0], p[1]) : null;
    if (!h) { hideViewSelector(); return; }   // off the cube: closes it, and the graphics area takes the press
    ev.stopPropagation(); ev.preventDefault();
    viewSelectorPick(h.id);
  });
  // a press anywhere else closes it (the View Orientation menu and the heads-up toolbar leave it open)
  document.addEventListener('mousedown', function (ev) {
    if (!vs.shown || ev.target === vsCanvas) return;
    if (ev.target.closest && ev.target.closest('.menu, #hud')) return;
    hideViewSelector();
  }, true);
  window.addEventListener('keydown', function (ev) { if (vs.shown && ev.key === 'Escape') hideViewSelector(); }, true);

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
    var pad = Math.max(1, (hi - lo) * 0.25);
    camera.near = lo - pad; camera.far = hi + pad;
    camera.updateProjectionMatrix();
  }
  function render(sig) {
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
    renderer.render(scene, camera);
    // back to the logical camera with the fixed depth range (picking, worldToScreen and scripts use it)
    poseCamera(cam.target, cam.dir, cam.up, cam.scale);
    drawTriad(right, up, dir);
    updateScaleBar();
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
    if (needsRender || viewAnim || zoomMomentum.pending || App.gridStale || now - lastRenderAt > 1000 || sceneSignature() !== lastSig) render();
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

  function rebuild(opts) {
    opts = opts || {};
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
    App.build = build;
    App.mesh = K.meshFromBody(App.build.body);
    // worker.js found the edges of this same mesh (edgesFor); its volume follows in a 'volume' message (onWorkerMessage)
    if (nextWorker && App.mesh) { App.mesh.workerEdges = nextWorker.edges; App.mesh.workerCurves = nextWorker.curves || null; App.mesh.workerSeq = nextWorker.seq; useWorkerNormals(App.mesh, nextWorker.normals); }
    nextWorker = null;
    if (opts.edges && App.mesh) { App.mesh.workerEdges = opts.edges; App.mesh.workerCurves = opts.curves || null; useWorkerNormals(App.mesh, opts.normals); }   // ui-occt.js: found by occt-worker.js on the same mesh
    var tm = performance.now();
    App.triShared = buildTriShared(App.mesh);
    var tt = performance.now();
    pruneHiddenBodies();
    updateBodyMesh();
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
    }
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
    return afterModelSwap();
  }
  function redo() {
    if (!App.redo.length) return whenIdle();
    App.undo.push(JSON.stringify(App.model));
    App.model = JSON.parse(App.redo.pop());
    return afterModelSwap();
  }
  function afterModelSwap() {
    if (App.activeSketch != null && !K.findFeature(App.model, App.activeSketch)) App.activeSketch = null;
    if (App.activeSketch == null && App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
    App.sel = null; App.sel2 = null;
    if (UI.closePM) UI.closePM();
    return rebuild();
  }

  function loadModel(model) {
    if (UI.exitSketch && App.mode === 'sketch') UI.exitSketch(true);
    if (UI.closePM) UI.closePM();
    App.model = model;
    App.fileName = null;   // the saved-document name, set by whoever opened it from the browser's saved files
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
  // SolidWorks: a double-click of the middle button is Zoom to Fit (browsers send no dblclick for it)
  // (two plain middle clicks, each released where it was pressed, within 400 ms; a middle drag is not a click)
  var lastMiddle = null, middleDown = null;
  function nearPt(ev, p) { return Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) < 6; }
  viewport.addEventListener('mousedown', function (ev) {
    lastClient = null;
    if (ev.button !== 1 || ev.ctrlKey || ev.shiftKey || ev.altKey) { lastMiddle = middleDown = null; return; }
    var t = performance.now();
    if (lastMiddle && t - lastMiddle.t < 400 && nearPt(ev, lastMiddle)) { lastMiddle = middleDown = null; zoomToFit(); return; }
    middleDown = { t: t, x: ev.clientX, y: ev.clientY };
  });
  window.addEventListener('mouseup', function (ev) {
    if (ev.button !== 1 || !middleDown) return;
    lastMiddle = nearPt(ev, middleDown) ? middleDown : null;
    middleDown = null;
  });

  return {
    App: App, K: K, V: V, $: $, el: el, fmtNum: fmtNum, unitLabel: unitLabel,
    renderer: renderer, scene: scene, camera: camera, cam: cam, size: size, groups: groups, mats: mats, viewport: viewport,
    applyCamera: applyCamera, resize: resize, rotateView: rotateView, panView: panView, zoomView: zoomView, zoomToFit: zoomToFit,
    setView: setView, viewNormalTo: viewNormalTo, previousView: previousView, pushViewHistory: pushViewHistory, VIEWS: VIEWS, modelBounds: modelBounds,
    updateBodyMesh: updateBodyMesh, applyDisplayStyle: applyDisplayStyle, updateHighlights: updateHighlights, updatePlanes: updatePlanes,
    updateOrigin: updateOrigin, updateSketches: updateSketches, screenPolylines: screenPolylines, scaleBar: scaleBarInfo, updateTemp: updateTemp, disposeGroup: disposeGroup,
    activeSketchFeature: activeSketchFeature, activePlane: activePlane, isConsumed: isConsumed, snapStep: snapStep, gridStep: gridStep,
    screenToPlane: screenToPlane, worldToScreen: worldToScreen, pickFace: pickFace, pickFacesAll: pickFacesAll, pickPlane: pickPlane, pickEntity: pickEntity, pickEdge: pickEdge,
    lineGeometryFromPolylines: lineGeometryFromPolylines, render: render, frame: frame, tick: tick, thickLines: thickLines, LINE_W: LINE_W, requestRender: requestRender,
    // view transitions and smooth zoom (see "view animation")
    finishViewAnimation: finishViewAnimation, viewAnimating: viewAnimating, viewPose: viewPose, wheelZoom: wheelZoom, zoomToArea: zoomToArea,
    camVersion: function () { return camVer; },
    rebuild: rebuild, previewInWorker: previewInWorker, cancelPreviews: cancelPreviews, featurePreview: featurePreview, featurePreviewEnd: featurePreviewEnd, holdFrame: holdFrame, afterRebuild: afterRebuild, whenIdle: whenIdle, setWorkerOn: setWorkerOn, buildCacheInfo: buildCacheInfo,
    applyBuild: function (build, opts) { return applyBuild(build, opts, 0); },   // ui-occt.js: OpenCascade's build of the same model
    rollbackTo: rollbackTo, rollForward: rollForward, rollbackCommit: rollbackCommit, rollbackSwap: rollbackSwap,   // r10/editpreview10: Edit Feature rollback
    setViewportTheme: setViewportTheme, viewportTheme: viewportTheme,
    // r14/viewui14: background, triad, View Selector
    setBackground: setBackground, drawTriad: function () { drawTriad(); }, triadClick: triadClick, triadAxisAt: triadAxisAt, orientView: orientView,
    showViewSelector: showViewSelector, hideViewSelector: hideViewSelector, viewSelectorShown: viewSelectorShown, viewSelectorPick: viewSelectorPick,
    viewSelectorRegions: function () { return vs.cells.map(function (c) { return { id: c.id, center: [(c.q[0][0] + c.q[2][0]) / 2, (c.q[0][1] + c.q[2][1]) / 2] }; }); },
    imageQuality: imageQuality, setImageQuality: setImageQuality, IMAGE_QUALITY: IMAGE_QUALITY, imagePresets: imagePresets, defaultUnits: defaultUnits, setDefaultUnits: setDefaultUnits, lenDefault: lenDefault,
    analyticNormals: analyticNormals, surfNormal: surfNormal, annotateCurveEdges: annotateCurveEdges,
    autosave: autosave, pushUndo: pushUndo, undo: undo, redo: redo, loadModel: loadModel,
    // unsaved changes and AutoRecover (ui-app.js: title star, save prompts, the start-up Recover / Discard dialog)
    isDirty: isDirty, markClean: markClean, markUnsaved: markUnsaved, readRecovery: readRecovery, dropRecovery: dropRecovery, holdRecovery: holdRecovery,
    rebuildPending: function () { return !!(wk.inflight || wk.pending); },
    getBodyMesh: function () { return bodyMesh; },
    // multi-body parts (viewport side): see the "bodies" section
    // assembly documents
    isAssembly: isAssembly, componentIndex: componentIndex, selectComponent: selectComponent,
    bodyInfo: bodyInfo, bodyName: bodyName, bodyCount: bodyCount, selectBody: selectBody,
    setBodyHidden: setBodyHidden, isBodyHidden: isBodyHidden, bodyBounds: bodyBounds, zoomToBody: zoomToBody, fitBox: fitBox,
    // equations (global variables)
    equationVars: equationVars, equationErrorMessages: equationErrorMessages, evalInput: evalInput, parseLength: parseLength,
    // whole curved faces (every facet of one cylinder, hole, cone...) for picking and selection
    faceGroup: faceGroup, faceGroups: function () { return faceGroups(App.mesh); }
  };
})();
