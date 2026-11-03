// ui-render-fx.js — rfHD depth effects, drawn only while the view is still (SolidWorks: View Settings ▸ Ambient
// Occlusion and Shadows In Shaded Mode), still-view smoothing, and rfHE the adaptive quality governor.
//
//   Ambient Occlusion: screen space. The shaded solid is drawn once more into a normal + depth target, an SAO-style
//     shader samples a spiral of neighbours (world radius from the zoom and the model size), a depth- and
//     normal-aware blur smooths it, and the result is multiplied into the solid layer ONLY: the frame is drawn as
//     solid (with its selection / pre-highlight face tints, rfHJ) -> AO multiply -> everything else (edges, sketches,
//     previews, planes), so no overlay is ever darkened and a selected face keeps its shading. Off in a section (the caps are a stencil trick the depth pass cannot see) and on a see-through part.
//     Full resolution with 16 samples, or (governor) half resolution with 8.
//   Shadows In Shaded Mode: a scene floor under the model's box (world Y is up, as the SolidWorks floor under the Top
//     plane), never drawn as a plane: a soft lighter glow on the grey-black ground round the part's footprint, faded
//     out with distance, which the contact shadow darkens (the solid seen from below into a small target, darkness
//     by height above the floor, blurred). Recomputed when the model changes, kept (one quad) while the camera moves,
//     faded out as the view turns to look along the floor or up at it.
//   Smoothing: up to SAMPLES sub-pixel jittered frames (each with MSAA where WebGL2 has it), one per animation frame,
//     averaged; the plain MSAA frame is shown while anything moves.
//   Governor (rfHE): times the real frames on the machine at hand and chooses, within fixed time budgets, whether
//     RealView's studio shading is drawn while the view moves and when it rests, the AO resolution and sample count,
//     and how many smoothing samples are taken. See "governor" below. Nothing in it is tuned to one graphics card:
//     the budgets are what a user feels (a frame while the view moves, a still frame that delays the next input, the
//     whole still pass), the costs are measured here, at run time.
//
// Hook: ui-core.js render(sig, mode) calls UI.renderHooks.draw({ mode, sig, moving }) with mode 'auto' (frame loop),
// 'still' (asked for by UI.renderHooks.idle(now) once nothing changed for STILL_MS) or 'plain' (UI.render(): tests,
// anvil.png, which always get the plain frame). Tests force the still pass with UI.renderStill(samples).
(function (UI) {
  'use strict';
  var THREE = window.THREE, App = UI.App, renderer = UI.renderer, scene = UI.scene, camera = UI.camera;
  // measured 2026-11-03 (headless software GL, 1253 × 756): default bracket 1.6k triangles, plain frame 12 ms, first
  // still frame (AO + shadow + sample 0) 72 ms, each further sample 46 ms; 1000-hole panel 138k triangles: plain
  // 173 ms, first still 251 ms, each sample 199 ms. Those numbers are one machine's: the governor below measures the
  // machine it runs on instead (rfHE replaced the fixed "no smoothing above 500k triangles" rule).
  var LAYER = 7, STILL_MS = 150, SAMPLES = 8, AO_RADIUS_CSS = 40, SHADOW_SIZE = 512;
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
  // a software rasterizer by the renderer's name (SwiftShader, llvmpipe, Microsoft Basic Render): the governor's FIRST
  // GUESS only, used until a frame has been measured
  var softwareGuess = (function () {
    try {
      var gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
    } catch (e) { return false; }
  })();

  // ------------------------------------------------------------------ shaders
  var ndMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vN;\nvoid main() { vN = normalMatrix * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN;\nvoid main() { vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); }' });
  var AO_N = 16;
  var aoMat = shader({ tDepth: { value: null }, tNormal: { value: null }, res: { value: new THREE.Vector2() }, projInv: { value: new THREE.Matrix4() },
    radius: { value: 1 }, radiusPx: { value: 20 }, strength: { value: 1 }, bias: { value: 0.12 }, nS: { value: AO_N } }, [
    'uniform sampler2D tDepth; uniform sampler2D tNormal; uniform vec2 res; uniform mat4 projInv;',
    'uniform float radius; uniform float radiusPx; uniform float strength; uniform float bias; uniform float nS;',
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
    '    if (float(i) >= nS) break;',
    '    float t = (float(i) + 0.5) / nS;',
    '    float a = float(i) * 2.3999632 + noise * 6.2831853;',
    '    vec2 uv = vUv + vec2(cos(a), sin(a)) * max(1.5, radiusPx * t) / res;',
    '    float sd = texture2D(tDepth, uv).x;',
    '    if (sd >= 0.99999) continue;',
    '    vec3 v = viewPos(uv, sd) - p;',
    '    float vv = dot(v, v);',
    '    float vn = dot(v, n) * inversesqrt(vv + 1e-8 * r2);',
    '    occ += max(1.0 - vv / r2, 0.0) * max(vn - bias, 0.0);',
    '  }',
    '  gl_FragColor = vec4(vec3(clamp(1.0 - strength * occ / nS, 0.0, 1.0)), 1.0);',
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
  // multiplies the solid layer by the occlusion: dst.rgb *= ao, alpha kept (the canvas is premultiplied); res is the
  // canvas size, so a half-resolution AO target is read with its linear filter
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
  // rfHE: the floor = a lighter glow round the footprint (FLOOR_GLOW of FLOOR_TONE over the ground, falling off over
  // FLOOR_FALL × the footprint's span past its edge) times (1 - shadow). Written premultiplied, so over the
  // transparent canvas the CSS ground shows through as mix(ground, tone, glow) * (1 - shadow): lighter round the part,
  // darker under it, and nothing at all far away (no floor edge).
  var FLOOR_TONE = 0.5, FLOOR_GLOW = 0.32, FLOOR_FALL = 0.3, SHADOW_OPACITY = 0.92, SHADOW_BLUR = 0.09, SHADOW_GAIN = 2;
  var floorMat = new THREE.ShaderMaterial({ transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false,
    uniforms: { tShadow: { value: null }, shadowVP: { value: new THREE.Matrix4() }, opacity: { value: 0.5 }, gain: { value: SHADOW_GAIN }, glow: { value: 0 }, tone: { value: FLOOR_TONE },
      centre: { value: new THREE.Vector2() }, halfExt: { value: new THREE.Vector2(1, 1) }, fall: { value: 1 } },
    vertexShader: 'uniform mat4 shadowVP; varying vec2 vS; varying vec2 vW;\nvoid main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec4 s = shadowVP * wp; vS = s.xy / s.w * 0.5 + 0.5; vW = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = 0.0; }',
    fragmentShader: [
      'uniform sampler2D tShadow; uniform float opacity; uniform float gain; uniform float glow; uniform float tone; uniform vec2 centre; uniform vec2 halfExt; uniform float fall;',
      'varying vec2 vS; varying vec2 vW;',
      'void main() {',
      '  vec2 e = min(vS, 1.0 - vS);',
      '  float s = min(e.x, e.y) <= 0.0 ? 0.0 : min(1.0, texture2D(tShadow, vS).r * gain) * opacity * smoothstep(0.0, 0.1, min(e.x, e.y));',
      '  vec2 q = abs(vW - centre) - halfExt;',
      '  float d = length(max(q, 0.0)) / fall;',
      '  float g = glow * exp(-d * d);',
      '  gl_FragColor = vec4(vec3(tone * g * (1.0 - s)), 1.0 - (1.0 - g) * (1.0 - s));',
      '}'].join('\n') });
  var floorScene = new THREE.Scene(), floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.frustumCulled = false; floorScene.add(floor);
  var shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  shadowCam.layers.set(LAYER);

  // ------------------------------------------------------------------ governor (rfHE)
  // Budgets (what a person feels, the same on every machine):
  //   MOVE_MS          a frame while the view moves (orbit, pan, zoom): 40 ms, 25 frames a second.
  //   STILL_FRAME_MS   one frame of the still pass, which delays the next input by its length: 120 ms, or 1.5 × the
  //                    machine's own plain frame when that is slower (a still frame can never be cheaper than a plain one).
  //   STILL_TOTAL_MS   the whole still pass (first frame + smoothing samples): 1.5 s, so the machine goes quiet soon.
  // Costs (measured here): the time from the start of an animation frame that drew to the start of the next one
  // (requestAnimationFrame timestamps; the browser starts the next frame only when the GPU has taken this one, so this
  // is the real cost on that machine with no gl.finish()). Kept as running averages per kind of frame for the model
  // and canvas size on screen (cleared when either changes), with a lone spike over 4 × the average ignored:
  //   move.rv / move.plain   a frame while moving, RealView drawn / held back
  //   sample.rv / .plain     a still frame without AO work (a smoothing sample, or a redraw)
  //   ao.full / ao.half      the AO work in a still pass's first frame (that frame minus a sample)
  //   ratio                  RealView's cost over the plain frame's (machine-wide, 1 … 4), to predict the one not drawn
  // Decisions (best first, each within its budget): RealView while moving; RealView when still; AO full (16 samples) ->
  //   half resolution (8 samples) -> held back; smoothing 8 -> 4 -> 2 -> 1 (none). Hysteresis: a setting goes down
  //   when its measured cost passes 100 % of its budget and comes back up only when its (measured or predicted) cost is
  //   under RAISE = 75 %, so a cost near the budget does not make it flicker. RealView held back and not yet measured
  //   for this model is tried once (a probe) when its predicted cost is within the budget (moving) or 1.5 × (still);
  //   AO held back is tried again at half resolution on the next model. A real frame's first measurement of each kind
  //   per model is dropped (shader compiles, mesh upload).
  // Before any frame is measured: everything at its best on a GPU; on a software rasterizer (by name, a first guess
  // only) RealView held back, AO at half resolution, 4 samples. The user's toggles stay authoritative: a feature turned
  // off stays off; one turned on is drawn when affordable (the View Settings rows say "Held back" / "When still").
  var MOVE_MS = 40, STILL_FRAME_MS = 120, STILL_TOTAL_MS = 1500, RAISE = 0.75, AO_Q = ['full', 'half', 'off'], SAMPLE_STEPS = [8, 4, 2, 1];
  var G = {
    auto: !inTest,      // fed by real frames (the ui-smoke page feeds it by hand: G.feed)
    m: null, ratio: null, scene: null, dec: null, measured: false, spikes: {}, told: {},
    reset: function (o) {
      o = o || {};
      G.m = { move: { rv: null, plain: null }, sample: { rv: null, plain: null }, ao: { full: null, half: null }, t: {} };
      G.ratio = null; G.scene = null; G.spikes = {}; G.measured = false; G.told = {}; G.nMove = 0;
      var slow = o.slowGuess != null ? !!o.slowGuess : (G.auto && softwareGuess);
      G.slowGuess = slow;
      G.dec = slow ? { moveRv: false, stillRv: false, ao: 'half', samples: 4 } : { moveRv: true, stillRv: true, ao: 'full', samples: SAMPLES };
      if (o.auto != null) G.auto = !!o.auto;
      return G.state();
    },
    // a new model or canvas size: its costs are measured afresh (the decisions stay until then; the ratio is kept). AO
    // held back for the last model is tried again at half resolution, since nothing else would measure it.
    setScene: function (key) {
      if (key === G.scene) return;
      G.scene = key;
      G.m = { move: { rv: null, plain: null }, sample: { rv: null, plain: null }, ao: { full: null, half: null }, t: {} };
      G.spikes = {};
      if (G.dec.ao === 'off') G.dec.ao = 'half';
    },
    avg: function (grp, k, v, real) {
      var old = G.m[grp][k], id = grp + '.' + k;
      if (!(v >= 0) || v > 60000) return;
      // a real frame's first measurement of each kind for a model is a warm-up (shader compiles, mesh upload): dropped
      if (real && !G.m.t['w.' + id]) { G.m.t['w.' + id] = 1; return; }
      if (old != null && v > 4 * old && !G.spikes[id]) { G.spikes[id] = true; return; }   // one spike (a GC, another task) is not the machine
      G.spikes[id] = false;
      G.m[grp][k] = old == null ? v : old + 0.35 * (v - old);
      G.m.t[id] = G.clock();
    },
    clock: function () { return performance.now(); },
    // feed(kind, ms, o): kind 'move' (o.rv), 'sample' (o.rv), 'first' (o.rv, o.ao = 'full' | 'half' when AO was worked out in that frame)
    feed: function (kind, ms, o) {
      o = o || {};
      var rv = o.rv ? 'rv' : 'plain', real = !!o.real;
      if (kind === 'move') { G.avg('move', rv, ms, real); G.nMove = (G.nMove || 0) + 1; }
      else if (kind === 'sample') G.avg('sample', rv, ms, real);
      else if (kind === 'first') {
        var base = G.m.sample[rv] != null ? G.m.sample[rv] : G.m.move[rv];
        if (o.ao && base != null) G.avg('ao', o.ao, Math.max(0, ms - base), real);
      }
      // RealView's cost ratio, from the two kinds of the same frame measured within 3 s of each other (the zoom changes
      // what a frame costs, so an old measurement of one is not compared with a new one of the other)
      var m = G.m, grp = kind === 'first' ? null : kind;
      if (grp && m[grp].rv != null && m[grp].plain > 0 && Math.abs((m.t[grp + '.rv'] || -1e9) - (m.t[grp + '.plain'] || 1e9)) < 3000) {
        var r = Math.max(1, Math.min(4, m[grp].rv / m[grp].plain));
        G.ratio = G.ratio == null ? r : G.ratio + 0.35 * (r - G.ratio);
      }
      G.measured = true;
      G.decide();
      return G.state();
    },
    decide: function () {
      var m = G.m, d = G.dec, ratio = G.ratio || (G.slowGuess ? 2 : 1.3);
      function fits(cost, budget, better) { return cost <= budget * (better ? RAISE : 1); }
      // RealView: its cost as measured for this model, else predicted from the plain frame × ratio. Held back and never
      // measured for this model, it is tried once (a probe) when the prediction is within `probe` × the budget, and the
      // measurement decides from then on.
      function rvCost(rvMs, plainMs) { return rvMs != null ? rvMs : plainMs != null ? plainMs * ratio : null; }
      function rvFits(on, rvMs, plainMs, budget, probe) {
        var c = rvCost(rvMs, plainMs);
        if (c == null) return on;
        return on ? c <= budget : rvMs == null ? c <= budget * probe : c <= budget * RAISE;
      }
      // RealView while moving
      var mvPlain = m.move.plain != null ? m.move.plain : m.move.rv != null ? m.move.rv / ratio : null;
      d.moveRv = rvFits(d.moveRv, m.move.rv, mvPlain, MOVE_MS, 1);
      // the still frame's budget: STILL_FRAME_MS, or 1.5 × this machine's plain frame
      var spPlain = m.sample.plain != null ? m.sample.plain : m.sample.rv != null ? m.sample.rv / ratio : mvPlain;
      var F = Math.max(STILL_FRAME_MS, 1.5 * (spPlain != null ? spPlain : 0));
      d.stillRv = rvFits(d.stillRv, m.sample.rv, spPlain, F, 1.5);
      var spRv = rvCost(m.sample.rv, spPlain);
      var base = d.stillRv ? spRv : spPlain;
      if (base == null) return;
      // AO: the best quality whose cost fits the frame next to the base frame
      var aoF = m.ao.full != null ? m.ao.full : m.ao.half != null ? m.ao.half * 2.5 : null, aoH = m.ao.half != null ? m.ao.half : aoF != null ? aoF * 0.4 : null;
      var cost = { full: aoF, half: aoH, off: 0 }, cur = AO_Q.indexOf(d.ao), qi = AO_Q.length - 1;
      if (aoF != null || aoH != null) {
        for (var i = 0; i < AO_Q.length; i++) { var c = cost[AO_Q[i]]; if (c != null && fits(base + c, F, i < cur)) { qi = i; break; } }
        d.ao = AO_Q[qi];
      }
      // smoothing: the most samples whose frames fit the frame budget and whose pass fits the total
      var first = base + (cost[d.ao] || 0), si = SAMPLE_STEPS.length - 1, scur = SAMPLE_STEPS.indexOf(d.samples);
      for (var j = 0; j < SAMPLE_STEPS.length; j++) {
        var n = SAMPLE_STEPS[j], better = j < scur;
        if (n === 1 || (fits(base, F, better) && fits(first + (n - 1) * base, STILL_TOTAL_MS, better))) { si = j; break; }
      }
      d.samples = SAMPLE_STEPS[si];
      G.tell();
    },
    // a one-time status line when a feature the user turned on is first held back (real frames only)
    tell: function () {
      if (!G.auto || !UI.setStatus || G.m.move.rv == null && G.m.move.plain == null || (G.nMove || 0) < 30) return;   // after the view has really moved
      var rvOn = !!(UI.realView && UI.realView()), d = G.dec, msg = null;
      if (rvOn && !d.moveRv && !G.told.rv) { G.told.rv = true; msg = 'RealView Graphics is drawn when the view rests: this computer draws it too slowly while the view moves.'; }
      else if (App.view.ao && d.ao === 'off' && !G.told.ao) { G.told.ao = true; msg = 'Ambient Occlusion held back: this computer draws it too slowly for this model.'; }
      if (msg) { try { UI.setStatus(msg); } catch (e) { } }
    },
    // the View Settings rows' hint: '' | 'When still' | 'Held back' | 'Half resolution'
    hint: function (name) {
      if (!G.measured) return '';
      var d = G.dec;
      if (name === 'realView') return !(UI.realView && UI.realView()) ? '' : !d.stillRv ? 'Held back' : !d.moveRv ? 'When still' : '';
      if (name === 'ao') return !App.view.ao ? '' : d.ao === 'off' ? 'Held back' : d.ao === 'half' ? 'Half resolution' : '';
      return '';
    },
    state: function () {
      var d = G.dec, m = G.m;
      function r(v) { return v == null ? null : Math.round(v * 10) / 10; }
      return { auto: G.auto, measured: G.measured, slowGuess: G.slowGuess, moveRv: d.moveRv, stillRv: d.stillRv, ao: d.ao, samples: d.samples, ratio: r(G.ratio),
        ms: { move: { rv: r(m.move.rv), plain: r(m.move.plain) }, sample: { rv: r(m.sample.rv), plain: r(m.sample.plain) }, ao: { full: r(m.ao.full), half: r(m.ao.half) } },
        budgets: { move: MOVE_MS, stillFrame: STILL_FRAME_MS, stillTotal: STILL_TOTAL_MS, raise: RAISE } };
    }
  };
  G.reset();
  // measuring a drawn frame: the next animation frame's timestamp minus this one's (one per frame)
  var meas = { pending: false };
  function frameStamp() { var t = document.timeline && document.timeline.currentTime; return typeof t === 'number' ? t : performance.now(); }
  function measure(kind, o) {
    if (!G.auto || meas.pending || o.skip) return;
    var t0 = frameStamp();
    meas.pending = true;
    o.real = true;
    requestAnimationFrame(function (ts) { meas.pending = false; if (!document.hidden) G.feed(kind, ts - t0, o); });
  }

  // RealView held back for one frame: the solids on their Phong materials (mats.part keeps every job: colour, vertex
  // colours, clipping; rfHC), put back after
  function rvOnNow(solids) { for (var i = 0; i < solids.length; i++) { var m = solids[i].material; if (m && m.userData && m.userData.realView) return true; } return false; }
  function withRv(solids, hold, fn) {
    if (!hold) return fn();
    var M = UI.mats, done = [];
    solids.forEach(function (s) { var m = s.material; if (m && m.userData && m.userData.realView) { done.push([s, m]); s.material = s.userData.crackFill ? M.partFill : M.part; } });
    try { return fn(); } finally { done.forEach(function (x) { x[0].material = x[1]; }); }
  }

  // ------------------------------------------------------------------ state
  var T = { w: 0, h: 0 };
  var st = { key: null, bkey: null, changeAt: 0, touchAt: 0, aoOK: false, aoUsed: false, aoQ: null, shadowOK: false, k: 0, cur: 0, accSig: null, shown: 'plain', box: null, lastMs: 0, passRv: null, shownRv: null };
  function freeT(t) { if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); } }
  function ensureTargets() {
    renderer.getDrawingBufferSize(tmpV2);
    var w = tmpV2.x, h = tmpV2.y;
    if (w === T.w && h === T.h && T.nd) return;
    ['nd', 'ao', 'ao2', 'ndH', 'aoH', 'ao2H', 'sample', 'acc0', 'acc1'].forEach(function (k) { freeT(T[k]); T[k] = null; });
    T.w = w; T.h = h;
    T.nd = rt(w, h, { depth: true });
    T.nd.depthTexture = new THREE.DepthTexture(w, h);
    T.nd.depthTexture.type = THREE.UnsignedIntType;
    T.ao = rt(w, h); T.ao2 = rt(w, h);
    var w2 = Math.max(1, Math.ceil(w / 2)), h2 = Math.max(1, Math.ceil(h / 2));
    T.ndH = rt(w2, h2, { depth: true });
    T.ndH.depthTexture = new THREE.DepthTexture(w2, h2);
    T.ndH.depthTexture.type = THREE.UnsignedIntType;
    T.aoH = rt(w2, h2, { linear: true }); T.ao2H = rt(w2, h2, { linear: true });
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
  // what applies now: null for a plain frame. ao is false, 'full' or 'half'; samples = smoothing frames (1 = none);
  // holdMove / holdStill = RealView drawn on the part but held back by the governor
  function applicable() {
    var v = App.view;
    if (UI.drawingActive && UI.drawingActive()) return null;
    var d = G.dec;
    var smoothN = v.smoothStill ? d.samples : 1;
    if (v.style !== 'shaded' && v.style !== 'shadedEdges') return smoothN > 1 ? { solids: [], ao: false, shadow: false, smooth: true, samples: smoothN, rv: false, holdMove: false, holdStill: false } : null;
    var solids = solidMeshes(), rv = rvOnNow(solids);
    if (!v.ao && !v.shadows && !v.smoothStill && !(rv && (!d.moveRv || !d.stillRv))) return null;
    var m = solids.length ? solids[0].material : null;
    var see = !!(m && (Array.isArray(m) || m.transparent));
    var ao = !!v.ao && solids.length > 0 && !v.section && !see && d.ao !== 'off' ? d.ao : false;
    return { solids: solids, ao: ao, shadow: !!v.shadows && solids.length > 0 && !scene.background, smooth: smoothN > 1, samples: smoothN,
      rv: rv, holdMove: rv && !d.moveRv, holdStill: rv && !d.stillRv };
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
    var half = a.ao === 'half', sc = half ? 0.5 : 1, nd = half ? T.ndH : T.nd, ao = half ? T.aoH : T.ao, ao2 = half ? T.ao2H : T.ao2, w = nd.width, h = nd.height;
    var worldPerPx = (camera.right - camera.left) / camera.zoom / T.w;
    if (!st.box) st.box = solidBox(solids);
    var diag = st.box.isEmpty() ? 0 : st.box.getSize(new THREE.Vector3()).length();
    var rPx = AO_RADIUS_CSS * renderer.getPixelRatio(), r = rPx * worldPerPx;
    if (diag > 0 && r > 0.12 * diag) { r = 0.12 * diag; rPx = r / worldPerPx; }
    st.aoOK = true; st.aoUsed = rPx >= 3; st.aoQ = a.ao;
    if (!st.aoUsed) return;
    withClear(function () {
      withSolidLayer(solids, function () {
        camera.layers.set(LAYER);
        var keep = scene.overrideMaterial; scene.overrideMaterial = ndMat;
        try { renderer.setRenderTarget(nd); renderer.clear(); renderer.render(scene, camera); } finally { scene.overrideMaterial = keep; }
      });
    });
    var u = aoMat.uniforms;
    u.tDepth.value = nd.depthTexture; u.tNormal.value = nd.texture; u.res.value.set(w, h);
    u.projInv.value.copy(camera.projectionMatrix).invert();
    u.radius.value = r; u.radiusPx.value = rPx * sc; u.strength.value = 2.8; u.bias.value = 0.12; u.nS.value = half ? AO_N / 2 : AO_N;
    pass(aoMat, ao);
    var b = blurMat.uniforms;
    b.tDepth.value = nd.depthTexture; b.tNormal.value = nd.texture; b.res.value.set(w, h);
    b.depthTol.value = Math.max(1e-6, 0.5 * r / Math.max(1e-9, camera.far - camera.near));
    b.tAO.value = ao.texture; b.dir.value.set(1, 0); pass(blurMat, ao2);
    b.tAO.value = ao2.texture; b.dir.value.set(0, 1); pass(blurMat, ao);
    mulMat.uniforms.tAO.value = ao.texture; mulMat.uniforms.res.value.set(T.w, T.h);
  }
  function computeShadow(a) {
    var solids = a.solids.filter(function (s) { return !s.userData.crackFill; });
    if (!st.box) st.box = solidBox(solids);
    var b = st.box;
    st.shadowOK = true;
    if (b.isEmpty()) { st.shadowOK = false; return; }
    // the floor is world Y up under the box's lowest point, wherever the part sits (far below the origin, tall, ...)
    var s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), span = Math.max(s.x, s.z, 1e-6);
    var half = span / 2 + 0.4 * span + 0.05 * s.y, floorY = b.min.y - 1e-4 * span;
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
    // soft: three separable Gaussian passes at growing steps (s, 2s, 3s), a total sigma of SHADOW_BLUR (9 %) of the footprint
    var texel = 2 * half / SHADOW_SIZE, step = Math.max(0.5, SHADOW_BLUR * span / texel / 9) / SHADOW_SIZE, g = gaussMat.uniforms;
    for (var i = 1; i <= 3; i++) {
      g.tMap.value = t.a.texture; g.dir.value.set(step * i, 0); pass(gaussMat, t.b);
      g.tMap.value = t.b.texture; g.dir.value.set(0, step * i); pass(gaussMat, t.a);
    }
    var fu = floorMat.uniforms;
    fu.tShadow.value = t.a.texture;
    fu.shadowVP.value.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
    // the glow round the footprint: the quad reaches far enough past it (4 × the fall-off) that it ends at nothing
    fu.centre.value.set(c.x, c.z); fu.halfExt.value.set(s.x / 2, s.z / 2); fu.fall.value = FLOOR_FALL * span;
    var halfQ = Math.max(half, Math.max(s.x, s.z) / 2 + 4 * FLOOR_FALL * span);
    floor.position.set(c.x, floorY, c.z); floor.scale.set(2 * halfQ, 2 * halfQ, 1); floor.updateMatrixWorld(true);
  }
  // the floor fades out as the view turns to look along the floor or up at it
  function drawFloor() {
    var d = new THREE.Vector3(); camera.getWorldDirection(d);   // from the camera into the scene
    var up = -d.y, f = Math.max(0, Math.min(1, (up - 0.03) / 0.25));
    if (f <= 0) return;
    f = f * f * (3 - 2 * f);
    floorMat.uniforms.opacity.value = SHADOW_OPACITY * f;
    floorMat.uniforms.glow.value = FLOOR_GLOW * f;
    renderer.render(floorScene, camera);
  }
  var HALTON = [[0, 0], [0.25, -0.1667], [-0.25, 0.1667], [0.375, 0.3889], [-0.375, -0.3889], [0.125, -0.0556], [-0.125, 0.2778], [0.4375, -0.2778]];
  // rfHJ: the face tints (selection light blue, pre-highlight orange: transparent meshes over the faces, ui-core.js
  // updateHighlights and ui-select.js drawSelectionExtras) are part of the shaded solid, as SolidWorks colours a
  // selected face and still shades it: they are drawn with the solid before the AO multiply. Drawn over it instead
  // (before), a selected face lost about half of its occlusion and got it back on the next click elsewhere, so the
  // shading round a boss or a flange "toggled" with every selection (user 2026-11-03). Edges, see-through tints and
  // everything else stay over the AO.
  function faceTints() {
    var out = [], g = UI.groups && UI.groups.highlight, M = UI.mats;
    if (!g || !g.visible || !M) return out;
    (function visit(o) {
      for (var i = 0; i < o.children.length; i++) {
        var c = o.children[i];
        if (!c.visible) continue;
        if (c.isMesh && (c.material === M.sel || c.material === M.hover)) out.push(c);
        else if (c.children.length) visit(c);
      }
    })(g);
    return out;
  }
  // one frame of the still view into dest (null = the canvas, already cleared by render())
  function drawFrame(dest, a, k) {
    renderer.setRenderTarget(dest);
    if (dest) { if (dest.texture.encoding !== renderer.outputEncoding) dest.texture.encoding = renderer.outputEncoding; renderer.clear(); }
    var j = HALTON[k % HALTON.length], pe = camera.projectionMatrix.elements, p12 = pe[12], p13 = pe[13];
    if (k) { pe[12] += j[0] * 2 / T.w; pe[13] += j[1] * 2 / T.h; }
    try {
      if (a.shadow && st.shadowOK) drawFloor();
      if (a.ao && st.aoUsed) {
        withSolidLayer(a.solids.concat(faceTints()), function (camMask) {
          camera.layers.set(LAYER); renderer.render(scene, camera);           // the shaded solid alone (with its face tints)
          pass(mulMat, dest);                                                  // times the occlusion
          camera.layers.mask = camMask; renderer.setRenderTarget(dest); renderer.render(scene, camera);   // edges, sketches, highlights ... over it
        });
      } else renderer.render(scene, camera);
    } finally { pe[12] = p12; pe[13] = p13; }
  }
  function blitAcc() { copyMat.uniforms.tMap.value = (st.cur ? T.acc1 : T.acc0).texture; pass(copyMat, null); }
  // -> what the frame did, for the governor: { kind: 'first' | 'sample', ao: quality worked out in it, skip }
  function stillFrame(info, a) {
    ensureTargets();
    var rvDrawn = a.rv && !a.holdStill;
    if (st.k > 0 && st.passRv !== rvDrawn) st.k = 0;   // RealView came back (or went) mid-pass: start the average again
    st.passRv = rvDrawn;
    var did = { kind: 'sample', ao: null, rv: rvDrawn, skip: false };
    withRv(a.solids, a.holdStill, function () {
      if (a.shadow && !st.shadowOK) { computeShadow(a); did.skip = true; }   // once per model: not a cost of the view
      if (a.ao && (!st.aoOK || st.aoQ !== a.ao)) { computeAO(a); st.k = 0; if (st.aoUsed) { did.kind = 'first'; did.ao = a.ao; } }
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
    });
    renderer.setRenderTarget(null);
    st.accSig = info.sig; st.shown = 'still'; st.shownRv = rvDrawn;
    return did;
  }
  // a moving frame: the plain scene, with the floor already worked out for this model (cheap: one quad), RealView
  // held back when the governor says so; false = ui-core draws the plain scene itself
  function movingFrame(a) {
    st.shown = 'moving'; st.shownRv = a.rv && !a.holdMove;
    if (!(a.shadow && st.shadowOK) && !a.holdMove) return false;
    withRv(a.solids, a.holdMove, function () {
      if (a.shadow && st.shadowOK) drawFloor();
      renderer.render(scene, camera);
    });
    return true;
  }

  var rvAutoDone = false;
  // RealView's default (no choice stored by the user) is on everywhere outside the test page: the governor holds it
  // back where it is too slow (rfHC's renderer-name rule is now only the governor's first guess)
  function rvAuto() {
    rvAutoDone = true;
    if (inTest || typeof UI.setRealView !== 'function') return;
    var v = null;
    try { v = localStorage.getItem('anvil.realview'); } catch (e) { }
    if (v == null && UI.realView && !UI.realView()) UI.setRealView(true, true);
  }

  function draw(info) {
    var now = performance.now();
    if (!rvAutoDone && App.model) { rvAutoDone = true; setTimeout(function () { try { rvAuto(); } catch (e) { } }, 0); }   // not inside a frame
    if (info.mode === 'plain') {
      st.k = 0; st.touchAt = now; st.shown = 'plain';
      // RealView unaffordable even when still (real frames only): the plain frame shows what the screen shows
      if (G.auto && !G.dec.stillRv && !(UI.drawingActive && UI.drawingActive())) {
        var sp = solidMeshes();
        if (rvOnNow(sp)) { withRv(sp, true, function () { renderer.render(scene, camera); }); st.shownRv = false; return true; }
      }
      return false;
    }
    var a;
    try { a = applicable(); } catch (e) { a = null; }
    if (!a) { st.key = null; st.shown = 'plain'; st.shownRv = null; return false; }
    try {
      var key = viewKey(), bkey = bodyKey(a.solids);
      var bodyChanged = bkey !== st.bkey, camChanged = key !== st.key || info.moving;
      if (bodyChanged) { st.bkey = bkey; st.shadowOK = false; st.box = null; st.aoOK = false; }
      if (camChanged) { st.key = key; st.aoOK = false; }
      if (bodyChanged || camChanged) { st.changeAt = now; st.k = 0; }
      renderer.getDrawingBufferSize(tmpV2);
      G.setScene(bkey + '#' + tmpV2.x + 'x' + tmpV2.y);
      if (info.mode === 'auto') {
        if (bodyChanged || camChanged || (a.ao && !st.aoOK) || (a.shadow && !st.shadowOK) || now - st.changeAt < STILL_MS) {
          var drew = movingFrame(a);
          measure('move', { rv: a.rv && !a.holdMove, skip: bodyChanged });   // a new body's first frame uploads its mesh
          return drew;
        }
        if (info.sig === st.accSig && st.k > 0 && st.shown === 'still') {   // the 1 s safety redraw of an unchanged view
          if (a.smooth && T.nd) { blitAcc(); return true; }
        } else { st.k = 0; st.touchAt = now; }   // a highlight / tint / sketch changed on a still view: redraw at once
      }
      var did = stillFrame(info, a);
      measure(did.kind, did);
      return true;
    } catch (e) {
      // never lose the frame: report once, turn the effects off for this session and draw the plain scene
      console.warn('Depth effects turned off:', e);
      App.view.ao = false; App.view.shadows = false; App.view.smoothStill = false;
      renderer.setRenderTarget(null);
      return false;
    }
  }
  function idle(now) {
    if (now - Math.max(st.changeAt, st.touchAt) < STILL_MS) return false;
    var a = applicable();
    if (!a) return false;
    if (st.shown !== 'still') return true;
    if ((a.ao && (!st.aoOK || st.aoQ !== a.ao)) || (a.shadow && !st.shadowOK)) return true;
    if (st.shownRv != null && st.shownRv !== (a.rv && !a.holdStill)) return true;   // the governor let RealView back (or held it)
    return a.smooth && st.k < a.samples;
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
  // UI.renderStill(samples?): the still pass now, synchronously (tests, timing), at the governor's current choice: AO,
  // shadow and `samples` smoothing frames (default the governor's count when smoothing is on). -> { ms, samples, ao,
  // aoQuality, shadow, realView } or null when nothing applies.
  UI.renderStill = function (samples) {
    if (UI.finishViewAnimation) UI.finishViewAnimation();
    var a = applicable();
    if (!a) { UI.render(); return null; }
    var gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now();
    st.key = null;
    var n = samples == null ? (a.smooth ? a.samples : 1) : Math.max(1, samples);
    for (var i = 0; i < n; i++) UI.render(undefined, 'still');
    st.changeAt = 0; st.touchAt = 0;   // rfHJ: the pass is complete, so the view counts as still (the next frame is not a 'moving' one)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // wait for the GPU, so ms is the real cost
    st.lastMs = performance.now() - t0;
    return { ms: st.lastMs, samples: st.k, ao: !!a.ao && st.aoUsed, aoQuality: a.ao && st.aoUsed ? st.aoQ : null, shadow: a.shadow && st.shadowOK, realView: !!st.shownRv };
  };
  // the menus' rows (Heads-up View Settings flyout, View menu ▸ Display), SolidWorks' names; RealView Graphics only
  // when the realview lane's UI.setRealView exists. The right-hand note says when the governor holds a row back.
  UI.depthFxMenuItems = function (prefix) {
    prefix = prefix || '';
    var rows = [];
    function note(row, name) { var h = G.hint(name); if (h) row.key = h; return row; }
    if (typeof UI.setRealView === 'function') rows.push(note({ label: prefix + 'RealView Graphics', checked: !!(UI.realView && UI.realView()), action: function () { UI.setRealView(!(UI.realView && UI.realView())); } }, 'realView'));
    rows.push({ label: prefix + 'Shadows In Shaded Mode', checked: !!App.view.shadows, action: function () { UI.setShadows(!App.view.shadows); } });
    rows.push(note({ label: prefix + 'Ambient Occlusion', checked: !!App.view.ao, action: function () { UI.setAmbientOcclusion(!App.view.ao); } }, 'ao'));
    return rows;
  };
  UI.renderFx = {
    STILL_MS: STILL_MS, SAMPLES: SAMPLES, inTest: inTest, persistInTest: false,
    FLOOR: { tone: FLOOR_TONE, glow: FLOOR_GLOW, fall: FLOOR_FALL, shadow: SHADOW_OPACITY, blur: SHADOW_BLUR, gain: SHADOW_GAIN },
    state: function () { return { shown: st.shown, k: st.k, aoOK: st.aoOK, aoUsed: st.aoUsed, aoQ: st.aoQ, shadowOK: st.shadowOK, lastMs: st.lastMs, realView: st.shownRv }; },
    targets: function () { return { ao: T.ao, nd: T.nd, aoHalf: T.aoH, sample: T.sample, shadow: shadowT && shadowT.a, w: T.w, h: T.h }; },
    // rfHE: the quality governor. feed(kind, ms, o) / decide() / state() / reset({ auto, slowGuess }) / hint(name)
    governor: G
  };
})(UI);
