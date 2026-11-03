// ui-render-fx.js — rfHD depth effects, drawn only while the view is still (SolidWorks: View Settings ▸ Ambient
// Occlusion and Shadows In Shaded Mode), plus still-view smoothing.
//
//   Ambient Occlusion: screen space. The shaded solid is drawn once more into a normal + depth target, an SAO-style
//     shader samples a spiral of neighbours (world radius from the zoom and the model size), a depth- and
//     normal-aware blur smooths it, and the result is multiplied into the solid layer ONLY: the frame is drawn as
//     solid -> AO multiply -> everything else (edges, sketches, highlights, previews, planes), so no overlay is ever
//     darkened. Off in a section (the caps are a stencil trick the depth pass cannot see) and on a see-through part.
//   Shadows In Shaded Mode: a contact shadow on an invisible floor under the model's box (world Y is up, as the
//     SolidWorks floor under the Top plane): the solid seen from below into a small target (darkness fades with
//     height above the floor), blurred, drawn as a shadow-only quad before the scene. It is recomputed when the
//     model changes and is kept (cheap) while the camera moves; it fades out when the view looks from below.
//   Smoothing: SAMPLES sub-pixel jittered frames (each with MSAA where WebGL2 has it), one per animation frame,
//     averaged; the plain MSAA frame is shown while anything moves.
//
// Hook: ui-core.js render(sig, mode) calls UI.renderHooks.draw({ mode, sig, moving }) with mode 'auto' (frame loop),
// 'still' (asked for by UI.renderHooks.idle(now) once nothing changed for STILL_MS) or 'plain' (UI.render(): tests,
// anvil.png, which always get the plain frame). Tests force the still pass with UI.renderStill(samples).
(function (UI) {
  'use strict';
  var THREE = window.THREE, App = UI.App, renderer = UI.renderer, scene = UI.scene, camera = UI.camera;
  // measured 2026-11-03 (headless software GL, 1253 × 756): default bracket 1.6k triangles, plain frame 12 ms, first
  // still frame (AO + shadow + sample 0) 72 ms, each further sample 46 ms (mostly full-screen quads, ~free on a GPU);
  // 1000-hole panel 138k triangles: plain 173 ms, first still 251 ms, each sample 199 ms. A still frame costs about one
  // plain frame plus fixed screen-space work and nothing runs while the view moves, so every effect defaults on; only
  // the 8 smoothing samples (8 whole-scene draws after each stop) are skipped above 500k triangles.
  var LAYER = 7, STILL_MS = 150, SAMPLES = 8, AO_RADIUS_CSS = 40, SHADOW_SIZE = 512, SMOOTH_MAX_TRIS = 500000;
  var KEYS = { ao: 'anvil.ao', shadows: 'anvil.shadows', smoothStill: 'anvil.smoothStill' };
  // the ui-smoke page loads the app in a frame: there every effect starts off, whatever this browser remembers, so
  // pixel tests and timings stay as they were (a test turns them on with UI.setAmbientOcclusion / UI.setShadows)
  var inTest = false;
  try { inTest = !!(window.frameElement && /\/tests\//.test(window.parent.location.pathname)); } catch (e) { }
  function stored(k, d) {
    if (inTest) return false;
    try { var v = localStorage.getItem(KEYS[k]); if (v === '1') return true; if (v === '0') return false; } catch (e) { }
    return d;
  }
  App.view.ao = stored('ao', true);
  App.view.shadows = stored('shadows', true);
  App.view.smoothStill = stored('smoothStill', true);

  // ------------------------------------------------------------------ helpers
  var isGL2 = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
  var QUAD_VS = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene();
  var quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null);
  quad.frustumCulled = false; quadScene.add(quad);
  function shader(uniforms, fs, extra) {
    var m = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    if (extra) for (var k in extra) m[k] = extra[k];
    return m;
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
  function rt(w, h, o) {
    o = o || {};
    var t = new THREE.WebGLRenderTarget(w, h, { minFilter: o.linear ? THREE.LinearFilter : THREE.NearestFilter, magFilter: o.linear ? THREE.LinearFilter : THREE.NearestFilter,
      depthBuffer: !!o.depth, stencilBuffer: !!o.stencil });
    t.texture.generateMipmaps = false;
    return t;
  }
  var tmpV2 = new THREE.Vector2(), tmpC = new THREE.Color();
  function withClear(fn) {   // targets of our own clear to transparent black, whatever the app's clear colour is
    renderer.getClearColor(tmpC); var a = renderer.getClearAlpha(), c = tmpC.getHex();
    renderer.setClearColor(0x000000, 0);
    try { fn(); } finally { renderer.setClearColor(c, a); }
  }

  // ------------------------------------------------------------------ shaders
  var ndMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vN;\nvoid main() { vN = normalMatrix * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN;\nvoid main() { vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); }' });
  var AO_N = 16;
  var aoMat = shader({ tDepth: { value: null }, tNormal: { value: null }, res: { value: new THREE.Vector2() }, projInv: { value: new THREE.Matrix4() },
    radius: { value: 1 }, radiusPx: { value: 20 }, strength: { value: 1 }, bias: { value: 0.12 } }, [
    'uniform sampler2D tDepth; uniform sampler2D tNormal; uniform vec2 res; uniform mat4 projInv;',
    'uniform float radius; uniform float radiusPx; uniform float strength; uniform float bias;',
    'varying vec2 vUv;',
    'vec3 viewPos(vec2 uv, float d) { vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }',
    'void main() {',
    '  float d = texture2D(tDepth, vUv).x;',
    '  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }',
    '  vec3 p = viewPos(vUv, d);',
    '  vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);',
    '  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));',
    '  float occ = 0.0, r2 = radius * radius;',
    '  for (int i = 0; i < ' + AO_N + '; i++) {',
    '    float t = (float(i) + 0.5) / ' + AO_N + '.0;',
    '    float a = float(i) * 2.3999632 + noise * 6.2831853;',
    '    vec2 uv = vUv + vec2(cos(a), sin(a)) * max(1.5, radiusPx * t) / res;',
    '    float sd = texture2D(tDepth, uv).x;',
    '    if (sd >= 0.99999) continue;',
    '    vec3 v = viewPos(uv, sd) - p;',
    '    float vv = dot(v, v);',
    '    float vn = dot(v, n) * inversesqrt(vv + 1e-8 * r2);',
    '    occ += max(1.0 - vv / r2, 0.0) * max(vn - bias, 0.0);',
    '  }',
    '  gl_FragColor = vec4(vec3(clamp(1.0 - strength * occ / ' + AO_N + '.0, 0.0, 1.0)), 1.0);',
    '}'].join('\n'));
  var blurMat = shader({ tAO: { value: null }, tDepth: { value: null }, tNormal: { value: null }, res: { value: new THREE.Vector2() }, dir: { value: new THREE.Vector2() }, depthTol: { value: 0.01 } }, [
    'uniform sampler2D tAO; uniform sampler2D tDepth; uniform sampler2D tNormal; uniform vec2 res; uniform vec2 dir; uniform float depthTol;',
    'varying vec2 vUv;',
    'void main() {',
    '  float d0 = texture2D(tDepth, vUv).x;',
    '  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }',
    '  vec3 n0 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;',
    '  float sum = 0.0, ws = 0.0;',
    '  for (int i = -5; i <= 5; i++) {',
    '    vec2 uv = vUv + dir * float(i) / res;',
    '    float d = texture2D(tDepth, uv).x;',
    '    if (d >= 0.99999) continue;',
    '    vec3 n = texture2D(tNormal, uv).xyz * 2.0 - 1.0;',
    '    float w = exp(-float(i * i) / 18.0) * max(0.0, 1.0 - abs(d - d0) / depthTol) * pow(max(dot(n, n0), 0.0), 8.0);',
    '    sum += texture2D(tAO, uv).r * w; ws += w;',
    '  }',
    '  float ao = ws > 0.0 ? sum / ws : texture2D(tAO, vUv).r;',
    '  gl_FragColor = vec4(vec3(ao), 1.0);',
    '}'].join('\n'));
  // multiplies the solid layer by the occlusion: dst.rgb *= ao, alpha kept (the canvas is premultiplied)
  var mulMat = shader({ tAO: { value: null }, res: { value: new THREE.Vector2() } },
    'uniform sampler2D tAO; uniform vec2 res;\nvoid main() { float ao = texture2D(tAO, gl_FragCoord.xy / res).r; gl_FragColor = vec4(vec3(ao), 1.0); }',
    { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true });
  var copyMat = shader({ tMap: { value: null } }, 'uniform sampler2D tMap; varying vec2 vUv;\nvoid main() { gl_FragColor = texture2D(tMap, vUv); }');
  var accMat = shader({ tOld: { value: null }, tNew: { value: null }, w: { value: 1 } },
    'uniform sampler2D tOld; uniform sampler2D tNew; uniform float w; varying vec2 vUv;\nvoid main() { gl_FragColor = mix(texture2D(tOld, vUv), texture2D(tNew, vUv), w); }');
  // the floor shadow: darkness of the solid seen from below, by height over the floor
  var shadowDepthMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { floorY: { value: 0 }, fadeH: { value: 1 } },
    vertexShader: 'uniform float floorY; uniform float fadeH; varying float vH;\nvoid main() { vec4 wp = modelMatrix * vec4(position, 1.0); vH = (wp.y - floorY) / fadeH; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'varying float vH;\nvoid main() { float h = clamp(vH, 0.0, 1.0); float d = (1.0 - h) * (1.0 - h); gl_FragColor = vec4(d, d, d, 1.0); }' });
  var gaussMat = shader({ tMap: { value: null }, dir: { value: new THREE.Vector2() } }, [
    'uniform sampler2D tMap; uniform vec2 dir; varying vec2 vUv;',
    'void main() {',
    '  float s = texture2D(tMap, vUv).r * 0.1964825501511404;',
    '  s += (texture2D(tMap, vUv + dir * 1.411764705882353).r + texture2D(tMap, vUv - dir * 1.411764705882353).r) * 0.2969069646728344;',
    '  s += (texture2D(tMap, vUv + dir * 3.2941176470588234).r + texture2D(tMap, vUv - dir * 3.2941176470588234).r) * 0.09447039785044732;',
    '  s += (texture2D(tMap, vUv + dir * 5.176470588235294).r + texture2D(tMap, vUv - dir * 5.176470588235294).r) * 0.010381362401148057;',
    '  gl_FragColor = vec4(vec3(s), 1.0);',
    '}'].join('\n'));
  var floorMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false,
    uniforms: { tShadow: { value: null }, shadowVP: { value: new THREE.Matrix4() }, opacity: { value: 0.5 } },
    vertexShader: 'uniform mat4 shadowVP; varying vec2 vS;\nvoid main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec4 s = shadowVP * wp; vS = s.xy / s.w * 0.5 + 0.5; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = 0.0; }',
    fragmentShader: 'uniform sampler2D tShadow; uniform float opacity; varying vec2 vS;\nvoid main() { vec2 e = min(vS, 1.0 - vS); float edge = smoothstep(0.0, 0.1, min(e.x, e.y)); gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(tShadow, vS).r * opacity * edge); }' });
  var floorScene = new THREE.Scene(), floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.frustumCulled = false; floorScene.add(floor);
  var shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  shadowCam.layers.set(LAYER);

  // ------------------------------------------------------------------ state
  var T = { w: 0, h: 0 };
  var st = { key: null, bkey: null, changeAt: 0, touchAt: 0, aoOK: false, aoUsed: false, shadowOK: false, k: 0, cur: 0, accSig: null, shown: 'plain', box: null, lastMs: 0 };
  function ensureTargets() {
    renderer.getDrawingBufferSize(tmpV2);
    var w = tmpV2.x, h = tmpV2.y;
    if (w === T.w && h === T.h && T.nd) return;
    ['nd', 'ao', 'ao2', 'sample', 'acc0', 'acc1'].forEach(function (k) { if (T[k]) { if (T[k].depthTexture) T[k].depthTexture.dispose(); T[k].dispose(); } });
    T.w = w; T.h = h;
    T.nd = rt(w, h, { depth: true });
    T.nd.depthTexture = new THREE.DepthTexture(w, h);
    T.nd.depthTexture.type = THREE.UnsignedIntType;
    T.ao = rt(w, h); T.ao2 = rt(w, h);
    if (isGL2 && THREE.WebGLMultisampleRenderTarget) {
      T.sample = new THREE.WebGLMultisampleRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: true });
      T.sample.samples = 4; T.sample.texture.generateMipmaps = false;
    } else T.sample = rt(w, h, { depth: true, stencil: true });
    T.acc0 = rt(w, h); T.acc1 = rt(w, h);
    st.aoOK = false; st.k = 0;
  }
  var shadowT = null;
  function shadowTargets() { if (!shadowT) shadowT = { a: rt(SHADOW_SIZE, SHADOW_SIZE, { depth: true, linear: true }), b: rt(SHADOW_SIZE, SHADOW_SIZE, { linear: true }) }; return shadowT; }

  // the shaded solid on screen: the part (with its crack filler) or the flat pattern; [] when there is none
  function solidMeshes() {
    var out = [];
    if (UI.flatShown && UI.flatShown()) { UI.flatGroup.children.forEach(function (c) { if (c.isMesh && c.visible) out.push(c); }); return out; }
    var bm = UI.getBodyMesh && UI.getBodyMesh();
    if (bm && bm.visible && bm.parent && bm.parent.visible) {
      out.push(bm);
      var cf = UI.getCrackFill && UI.getCrackFill();
      if (cf && cf.visible) out.push(cf);
    }
    return out;
  }
  // what applies now: null for a plain frame
  function applicable() {
    var v = App.view;
    if (!v.ao && !v.shadows && !v.smoothStill) return null;
    if (UI.drawingActive && UI.drawingActive()) return null;
    if (v.style !== 'shaded' && v.style !== 'shadedEdges') return v.smoothStill && (App.mesh && App.mesh.triCount || 0) <= SMOOTH_MAX_TRIS ? { solids: [], ao: false, shadow: false, smooth: true } : null;
    var solids = solidMeshes(), m = solids.length ? solids[0].material : null;
    var see = !!(m && (Array.isArray(m) || m.transparent));
    // smoothing re-draws the whole scene once per sample: skipped above SMOOTH_MAX_TRIS (AO and the shadow are not)
    var tris = App.mesh && App.mesh.triCount || 0;
    return { solids: solids, ao: !!v.ao && solids.length > 0 && !v.section && !see, shadow: !!v.shadows && solids.length > 0 && !scene.background, smooth: !!v.smoothStill && tris <= SMOOTH_MAX_TRIS };
  }
  function viewKey() {
    var p = camera.projectionMatrix.elements;
    renderer.getDrawingBufferSize(tmpV2);
    return [p[0], p[5], p[12], p[13], tmpV2.x, tmpV2.y, renderer.getPixelRatio()].concat(Array.prototype.slice.call(camera.matrixWorld.elements)).join(',');
  }
  function bodyKey(solids) {
    return solids.map(function (s) {
      var g = s.geometry, pa = g && g.attributes && g.attributes.position;
      return s.id + ':' + (g ? g.id : 0) + ':' + (pa ? pa.version : 0) + ':' + (g && g.index ? g.index.version + '/' + g.index.count : '') + ':' + s.matrixWorld.elements.join(',');
    }).join('|');
  }
  function solidBox(solids) {
    var b = new THREE.Box3();
    solids.forEach(function (s) { if (!s.userData.crackFill) b.expandByObject(s); });
    return b;
  }
  // runs fn with the solids on their own layer (lights on both), so a pass can draw the solids alone or everything else
  function withSolidLayer(solids, fn) {
    var lights = [], masks = solids.map(function (s) { return s.layers.mask; }), camMask = camera.layers.mask;
    scene.traverse(function (o) { if (o.isLight) lights.push([o, o.layers.mask]); });
    solids.forEach(function (s) { s.layers.set(LAYER); });
    lights.forEach(function (l) { l[0].layers.enable(LAYER); });
    try { fn(camMask); } finally {
      solids.forEach(function (s, i) { s.layers.mask = masks[i]; });
      lights.forEach(function (l) { l[0].layers.mask = l[1]; });
      camera.layers.mask = camMask;
    }
  }

  // ------------------------------------------------------------------ passes
  function computeAO(a) {
    var solids = a.solids.filter(function (s) { return !s.userData.crackFill; });
    var worldPerPx = (camera.right - camera.left) / camera.zoom / T.w;
    if (!st.box) st.box = solidBox(solids);
    var diag = st.box.isEmpty() ? 0 : st.box.getSize(new THREE.Vector3()).length();
    var rPx = AO_RADIUS_CSS * renderer.getPixelRatio(), r = rPx * worldPerPx;
    if (diag > 0 && r > 0.12 * diag) { r = 0.12 * diag; rPx = r / worldPerPx; }
    st.aoOK = true; st.aoUsed = rPx >= 3;
    if (!st.aoUsed) return;
    withClear(function () {
      withSolidLayer(solids, function () {
        camera.layers.set(LAYER);
        var keep = scene.overrideMaterial; scene.overrideMaterial = ndMat;
        try { renderer.setRenderTarget(T.nd); renderer.clear(); renderer.render(scene, camera); } finally { scene.overrideMaterial = keep; }
      });
    });
    var u = aoMat.uniforms;
    u.tDepth.value = T.nd.depthTexture; u.tNormal.value = T.nd.texture; u.res.value.set(T.w, T.h);
    u.projInv.value.copy(camera.projectionMatrix).invert();
    u.radius.value = r; u.radiusPx.value = rPx; u.strength.value = 2.8; u.bias.value = 0.12;
    pass(aoMat, T.ao);
    var b = blurMat.uniforms;
    b.tDepth.value = T.nd.depthTexture; b.tNormal.value = T.nd.texture; b.res.value.set(T.w, T.h);
    b.depthTol.value = Math.max(1e-6, 0.5 * r / Math.max(1e-9, camera.far - camera.near));
    b.tAO.value = T.ao.texture; b.dir.value.set(1, 0); pass(blurMat, T.ao2);
    b.tAO.value = T.ao2.texture; b.dir.value.set(0, 1); pass(blurMat, T.ao);
    mulMat.uniforms.tAO.value = T.ao.texture; mulMat.uniforms.res.value.set(T.w, T.h);
  }
  function computeShadow(a) {
    var solids = a.solids.filter(function (s) { return !s.userData.crackFill; });
    if (!st.box) st.box = solidBox(solids);
    var b = st.box;
    st.shadowOK = true;
    if (b.isEmpty()) { st.shadowOK = false; return; }
    var s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), span = Math.max(s.x, s.z, 1e-6);
    var half = span / 2 + 0.3 * span + 0.05 * s.y, floorY = b.min.y - 1e-4 * span;
    var fadeH = Math.max(0.35 * span, 0.5 * s.y, 1e-6);
    shadowCam.left = -half; shadowCam.right = half; shadowCam.top = half; shadowCam.bottom = -half;
    shadowCam.near = 0; shadowCam.far = fadeH;
    shadowCam.position.set(c.x, floorY, c.z); shadowCam.up.set(0, 0, 1); shadowCam.lookAt(c.x, floorY + 1, c.z);
    shadowCam.updateProjectionMatrix(); shadowCam.updateMatrixWorld(true);
    shadowDepthMat.uniforms.floorY.value = floorY; shadowDepthMat.uniforms.fadeH.value = fadeH;
    var t = shadowTargets();
    withClear(function () {
      withSolidLayer(solids, function () {
        var keep = scene.overrideMaterial; scene.overrideMaterial = shadowDepthMat;
        try { renderer.setRenderTarget(t.a); renderer.clear(); renderer.render(scene, shadowCam); } finally { scene.overrideMaterial = keep; }
      });
    });
    // soft: three separable Gaussian passes at growing steps (s, 2s, 3s), a total sigma of about 6 % of the footprint
    var texel = 2 * half / SHADOW_SIZE, step = Math.max(0.5, 0.06 * span / texel / 9) / SHADOW_SIZE, g = gaussMat.uniforms;
    for (var i = 1; i <= 3; i++) {
      g.tMap.value = t.a.texture; g.dir.value.set(step * i, 0); pass(gaussMat, t.b);
      g.tMap.value = t.b.texture; g.dir.value.set(0, step * i); pass(gaussMat, t.a);
    }
    floorMat.uniforms.tShadow.value = t.a.texture;
    floorMat.uniforms.shadowVP.value.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
    floor.position.set(c.x, floorY, c.z); floor.scale.set(2 * half, 2 * half, 1); floor.updateMatrixWorld(true);
  }
  // the floor shadow fades out as the view turns to look along the floor or up at it
  function drawFloor() {
    var d = new THREE.Vector3(); camera.getWorldDirection(d);   // from the camera into the scene
    var up = -d.y, f = Math.max(0, Math.min(1, (up - 0.03) / 0.25));
    if (f <= 0) return;
    floorMat.uniforms.opacity.value = 0.85 * f * f * (3 - 2 * f);
    renderer.render(floorScene, camera);
  }
  var HALTON = [[0, 0], [0.25, -0.1667], [-0.25, 0.1667], [0.375, 0.3889], [-0.375, -0.3889], [0.125, -0.0556], [-0.125, 0.2778], [0.4375, -0.2778]];
  // one frame of the still view into dest (null = the canvas, already cleared by render())
  function drawFrame(dest, a, k) {
    renderer.setRenderTarget(dest);
    if (dest) { if (dest.texture.encoding !== renderer.outputEncoding) dest.texture.encoding = renderer.outputEncoding; renderer.clear(); }
    var j = HALTON[k % HALTON.length], pe = camera.projectionMatrix.elements, p12 = pe[12], p13 = pe[13];
    if (k) { pe[12] += j[0] * 2 / T.w; pe[13] += j[1] * 2 / T.h; }
    try {
      if (a.shadow && st.shadowOK) drawFloor();
      if (a.ao && st.aoUsed) {
        withSolidLayer(a.solids, function (camMask) {
          camera.layers.set(LAYER); renderer.render(scene, camera);           // the shaded solid alone
          pass(mulMat, dest);                                                  // times the occlusion
          camera.layers.mask = camMask; renderer.setRenderTarget(dest); renderer.render(scene, camera);   // edges, sketches, highlights ... over it
        });
      } else renderer.render(scene, camera);
    } finally { pe[12] = p12; pe[13] = p13; }
  }
  function blitAcc() { copyMat.uniforms.tMap.value = (st.cur ? T.acc1 : T.acc0).texture; pass(copyMat, null); }
  function stillFrame(info, a) {
    ensureTargets();
    if (a.shadow && !st.shadowOK) computeShadow(a);
    if (a.ao && !st.aoOK) computeAO(a);
    if (!a.smooth) { drawFrame(null, a, 0); st.k = 1; }
    else {
      var k = st.k;
      drawFrame(T.sample, a, k);
      if (k === 0) { copyMat.uniforms.tMap.value = T.sample.texture; pass(copyMat, T.acc0); st.cur = 0; }
      else {
        accMat.uniforms.tOld.value = (st.cur ? T.acc1 : T.acc0).texture; accMat.uniforms.tNew.value = T.sample.texture; accMat.uniforms.w.value = 1 / (k + 1);
        pass(accMat, st.cur ? T.acc0 : T.acc1); st.cur = 1 - st.cur;
      }
      renderer.setRenderTarget(null);
      blitAcc();
      st.k = k + 1;
    }
    renderer.setRenderTarget(null);
    st.accSig = info.sig; st.shown = 'still';
    return true;
  }
  // a moving frame: the plain scene, with the floor shadow already worked out for this model (cheap: one quad)
  function movingFrame(a) {
    st.shown = 'moving';
    if (!(a && a.shadow && st.shadowOK)) return false;
    drawFloor();
    renderer.render(scene, camera);
    return true;
  }

  function draw(info) {
    var now = performance.now();
    if (info.mode === 'plain') { st.k = 0; st.touchAt = now; st.shown = 'plain'; return false; }
    var a;
    try { a = applicable(); } catch (e) { a = null; }
    if (!a) { st.key = null; st.shown = 'plain'; return false; }
    try {
      var key = viewKey(), bkey = bodyKey(a.solids);
      var bodyChanged = bkey !== st.bkey, camChanged = key !== st.key || info.moving;
      if (bodyChanged) { st.bkey = bkey; st.shadowOK = false; st.box = null; st.aoOK = false; }
      if (camChanged) { st.key = key; st.aoOK = false; }
      if (bodyChanged || camChanged) { st.changeAt = now; st.k = 0; }
      if (info.mode === 'auto') {
        if (bodyChanged || camChanged || (a.ao && !st.aoOK) || (a.shadow && !st.shadowOK) || now - st.changeAt < STILL_MS) return movingFrame(a);
        if (info.sig === st.accSig && st.k > 0 && st.shown === 'still') {   // the 1 s safety redraw of an unchanged view
          if (a.smooth && T.nd) { blitAcc(); return true; }
        } else { st.k = 0; st.touchAt = now; }   // a highlight / tint / sketch changed on a still view: redraw at once
      }
      return stillFrame(info, a);
    } catch (e) {
      // never lose the frame: report once, turn the effects off for this session and draw the plain scene
      console.warn('Depth effects turned off:', e);
      App.view.ao = false; App.view.shadows = false; App.view.smoothStill = false;
      renderer.setRenderTarget(null);
      return false;
    }
  }
  function idle(now) {
    var v = App.view;
    if (!v.ao && !v.shadows && !v.smoothStill) return false;
    if (now - Math.max(st.changeAt, st.touchAt) < STILL_MS) return false;
    var a = applicable();
    if (!a) return false;
    if (st.shown !== 'still') return true;
    if ((a.ao && !st.aoOK) || (a.shadow && !st.shadowOK)) return true;
    return a.smooth && st.k < SAMPLES;
  }
  UI.renderHooks.draw = draw;
  UI.renderHooks.idle = idle;

  // ------------------------------------------------------------------ API
  function setFx(name, on) {
    on = !!on;
    App.view[name] = on;
    if (!inTest || UI.renderFx.persistInTest) { try { localStorage.setItem(KEYS[name], on ? '1' : '0'); } catch (e) { } }
    st.key = null; st.k = 0; st.changeAt = 0; st.touchAt = 0;
    UI.requestRender();
    if (UI.refreshHud) UI.refreshHud();
    return on;
  }
  UI.setAmbientOcclusion = function (on) { return setFx('ao', on); };
  UI.ambientOcclusion = function () { return !!App.view.ao; };
  UI.setShadows = function (on) { return setFx('shadows', on); };
  UI.shadows = function () { return !!App.view.shadows; };
  UI.setStillSmoothing = function (on) { return setFx('smoothStill', on); };
  UI.stillSmoothing = function () { return !!App.view.smoothStill; };
  // UI.renderStill(samples?): the still pass now, synchronously (tests, timing): AO, shadow and `samples` smoothing
  // frames (default all of them when smoothing is on). -> { ms, samples, ao, shadow } or null when nothing applies.
  UI.renderStill = function (samples) {
    if (UI.finishViewAnimation) UI.finishViewAnimation();
    var a = applicable();
    if (!a) { UI.render(); return null; }
    var gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now();
    st.key = null;
    var n = samples == null ? (a.smooth ? SAMPLES : 1) : Math.max(1, samples);
    for (var i = 0; i < n; i++) UI.render(undefined, 'still');
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // wait for the GPU, so ms is the real cost
    st.lastMs = performance.now() - t0;
    return { ms: st.lastMs, samples: st.k, ao: a.ao && st.aoUsed, shadow: a.shadow && st.shadowOK };
  };
  // the menus' rows (Heads-up View Settings flyout, View menu ▸ Display), SolidWorks' names; RealView Graphics only
  // when the realview lane's UI.setRealView exists
  UI.depthFxMenuItems = function (prefix) {
    prefix = prefix || '';
    var rows = [];
    if (typeof UI.setRealView === 'function') rows.push({ label: prefix + 'RealView Graphics', checked: !!(UI.realView && UI.realView()), action: function () { UI.setRealView(!(UI.realView && UI.realView())); } });
    rows.push({ label: prefix + 'Shadows In Shaded Mode', checked: !!App.view.shadows, action: function () { UI.setShadows(!App.view.shadows); } });
    rows.push({ label: prefix + 'Ambient Occlusion', checked: !!App.view.ao, action: function () { UI.setAmbientOcclusion(!App.view.ao); } });
    return rows;
  };
  UI.renderFx = {
    STILL_MS: STILL_MS, SAMPLES: SAMPLES, inTest: inTest, persistInTest: false,
    state: function () { return { shown: st.shown, k: st.k, aoOK: st.aoOK, aoUsed: st.aoUsed, shadowOK: st.shadowOK, lastMs: st.lastMs }; },
    targets: function () { return { ao: T.ao, nd: T.nd, sample: T.sample, shadow: shadowT && shadowT.a, w: T.w, h: T.h }; }
  };
})(UI);
