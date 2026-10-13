// ui-sketch-picture.js — rfAW: Sketch Picture (Tools ▸ Sketch Tools ▸ Sketch Picture, the Sketch tab's Sketch Picture
// button), as SolidWorks has it: a picture (PNG / JPG / BMP from a file; nothing is fetched) placed on the sketch plane
// behind the geometry, to trace a scanned print or a photo over.
//   sketch.pictures = [{ name, src: data URL, px: [width, height] in pixels, x, y (its lower-left corner on the sketch
//     plane), w, h (its size), ang (° about that corner), flipH, flipV, tmode: 'none' | 'file' | 'full' | 'user',
//     alpha (transparency 0 … 1: of the whole picture for 'full', of the matched colour for 'user'), key ('#rrggbb',
//     the user-defined transparent colour), keyTol (its matching tolerance 0 … 1) }]
// The pictures live on the sketch beside its entities, so they are never part of a profile, a region or a DXF; they go
// with the model through save / load, undo and the script (`.picture({ … })`, kernel-sketch.js).
//   UI.cmdSketchPicture()               pick an image file; it is placed and its PropertyManager opens
//   UI.insertSketchPicture(src, name)   (Promise) the same from a data URL: the picture's index in the sketch
//   UI.editSketchPicture(i)             the Sketch Picture PropertyManager of picture i of the open sketch: Origin X / Y,
//                                       Angle, Width / Height with Lock aspect ratio, Flip, Enable scale tool (two
//                                       picks on the picture, then the real distance between them), Transparency
//   UI.deleteSketchPicture(i)           one undo step
//   UI.sketchPictureAt(mx, my)          the picture under a viewport point (topmost), or -1
//   UI.sketchPictureMenuItems()         the right-click rows on a picture (ui-panels.js sketchMenuItems)
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.openPM || !UI.K) return;
  var App = UI.App, K = UI.K, D2R = Math.PI / 180, MAX_PX = 2048;

  function $(id) { return document.getElementById(id); }
  function sketch() { return App.mode === 'sketch' && UI.activeSketchFeature ? UI.activeSketchFeature() : null; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  function fmt(x) { return UI.fmtNum ? UI.fmtNum(x, UI.unitLabel && UI.unitLabel() === 'in' ? 3 : 2) : String(r6(x)); }
  function redraw() { App.gridStale = true; UI.updateSketches(); if (UI.requestRender) UI.requestRender(); }

  // ------------------------------------------------------------------ geometry of a picture on its sketch plane
  function frame(p) { var a = (+p.ang || 0) * D2R; return { o: [+p.x || 0, +p.y || 0], u: [Math.cos(a), Math.sin(a)], v: [-Math.sin(a), Math.cos(a)] }; }
  function at(p, s, t) { var F = frame(p); return [F.o[0] + F.u[0] * s + F.v[0] * t, F.o[1] + F.u[1] * s + F.v[1] * t]; }
  function corners(p) { return [at(p, 0, 0), at(p, p.w, 0), at(p, p.w, p.h), at(p, 0, p.h)]; }
  function local(p, uv) { var F = frame(p), d = [uv[0] - F.o[0], uv[1] - F.o[1]]; return [d[0] * F.u[0] + d[1] * F.u[1], d[0] * F.v[0] + d[1] * F.v[1]]; }
  function inside(p, uv) { var q = local(p, uv); return q[0] >= 0 && q[1] >= 0 && q[0] <= p.w && q[1] <= p.h; }
  function pictureAt(f, uv) {
    var ps = f && f.pictures || [];
    for (var i = ps.length - 1; i >= 0; i--) if (ps[i] && uv && inside(ps[i], uv)) return i;
    return -1;
  }
  UI.sketchPictureAt = function (mx, my) {
    var f = sketch();
    if (!f) return -1;
    return pictureAt(f, UI.screenToPlane(mx, my, UI.activePlane()));
  };

  // ------------------------------------------------------------------ textures
  // One decoded image per data URL and one texture per (image, transparency settings); a texture still decoding
  // redraws the sketches when it is ready.
  var images = {}, textures = {}, materials = {};
  function srcKey(src) { src = String(src || ''); var h = 0; for (var i = 0; i < src.length; i += Math.max(1, Math.floor(src.length / 4096))) h = (h * 31 + src.charCodeAt(i)) | 0; return src.length + ':' + h; }
  function imageOf(src) {
    var k = srcKey(src), im = images[k];
    if (im) return im.ok ? im.img : null;
    im = images[k] = { img: new Image(), ok: false };
    im.img.onload = function () { im.ok = true; redraw(); };
    im.img.onerror = function () { im.bad = true; };
    im.img.src = src;
    return null;
  }
  function hexRGB(h) { var m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); var n = m ? parseInt(m[1], 16) : 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function textureOf(p) {
    var img = imageOf(p.src);
    if (!img) return null;
    var mode = p.tmode || 'file', key = srcKey(p.src) + '|' + mode + (mode === 'user' ? '|' + p.key + '|' + (+p.keyTol || 0) + '|' + (+p.alpha || 0) : '');
    if (textures[key]) return textures[key];
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth || img.width || 1; cv.height = img.naturalHeight || img.height || 1;
    var g = cv.getContext('2d');
    if (mode === 'none') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); }   // None: the file's own transparency is ignored
    g.drawImage(img, 0, 0);
    if (mode === 'user') {
      // User-defined: the pixels within the matching tolerance of the colour take the transparency
      var d = g.getImageData(0, 0, cv.width, cv.height), px = d.data, c = hexRGB(p.key), tol = Math.max(0, Math.min(1, +p.keyTol || 0)) * 255 + 0.5, keep = 1 - Math.max(0, Math.min(1, p.alpha == null ? 1 : +p.alpha));
      for (var i = 0; i < px.length; i += 4) if (Math.abs(px[i] - c[0]) <= tol && Math.abs(px[i + 1] - c[1]) <= tol && Math.abs(px[i + 2] - c[2]) <= tol) px[i + 3] = Math.round(px[i + 3] * keep);
      g.putImageData(d, 0, 0);
    }
    var tx = new THREE.CanvasTexture(cv);
    tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter; tx.generateMipmaps = false;
    tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
    textures[key] = tx;
    return tx;
  }
  function materialOf(p, tx) {
    var op = p.tmode === 'full' ? Math.max(0, Math.min(1, 1 - (+p.alpha || 0))) : 1, key = tx.uuid + '|' + op.toFixed(3);
    return materials[key] || (materials[key] = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
  }
  function pictureMesh(f, pl, p, i) {
    var tx = textureOf(p);
    if (!tx || !(p.w > 0) || !(p.h > 0)) return null;
    var c = corners(p).map(function (q) { return K.to3D(pl, q[0], q[1]); });
    var u0 = p.flipH ? 1 : 0, u1 = 1 - u0, v0 = p.flipV ? 1 : 0, v1 = 1 - v0;
    var pos = [].concat(c[0], c[1], c[2], c[0], c[2], c[3]);
    var uvs = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1];
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    var m = new THREE.Mesh(g, materialOf(p, tx));
    m.renderOrder = -5;   // behind the sketch geometry
    m.userData = { sketch: f.id, picture: i };
    return m;
  }
  function shown(f) {
    if (App.activeSketch === f.id) return true;
    if (f.hidden && !App.view.showSketches) return false;
    if (App.view.showSketches) return true;
    return !(UI.isConsumed && UI.isConsumed(f.id));
  }
  // The pictures ride in one group of their own inside the sketches group. UI.updateSketches (the redraw other files
  // call) adds it straight after the sketches are drawn; ui-core.js's own redraws (load, undo, rebuild) empty the
  // sketches group without it, so a frame check puts it back when it has gone.
  var holder = null;
  function addPictures() {
    if (holder) { holder.children.forEach(function (m) { if (m.geometry) m.geometry.dispose(); }); if (holder.parent) holder.parent.remove(holder); }
    holder = new THREE.Group();
    holder.name = 'sketch-pictures';
    try {
      (App.model && App.model.features || []).forEach(function (f) {
        if (f.type !== 'sketch' || !f.pictures || !f.pictures.length || !shown(f)) return;
        var pl; try { pl = K.resolvePlane(f.plane, App.model, App.build && App.build.planes); } catch (e) { return; }
        f.pictures.forEach(function (p, i) { var m = p && pictureMesh(f, pl, p, i); if (m) holder.add(m); });
      });
    } catch (err) { /* a picture never breaks a redraw */ }
    UI.groups.sketches.add(holder);
  }
  var baseUpdate = UI.updateSketches;
  UI.updateSketches = function () {
    var r = baseUpdate.apply(this, arguments);
    addPictures();
    return r;
  };
  (function watch() {
    try { if (!holder || holder.parent !== UI.groups.sketches) { addPictures(); if (UI.requestRender) UI.requestRender(); } } catch (err) { /* */ }
    requestAnimationFrame(watch);
  })();
  UI.sketchPictureObjects = function () { return holder && holder.parent === UI.groups.sketches ? holder.children.slice() : []; };   // test hook

  // ------------------------------------------------------------------ inserting
  // The file is read as a data URL; a picture over MAX_PX pixels on a side, or a BMP, is re-encoded (PNG when it has
  // transparency or was a PNG / BMP, else JPEG) so the model stays a sensible size.
  function decode(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That file is not a picture Anvil can read (PNG, JPG or BMP).')); };
      img.src = src;
    });
  }
  function normalise(src, img) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, big = Math.max(w, h) > MAX_PX, bmp = /^data:image\/(x-ms-)?bmp/i.test(src);
    if (!big && !bmp) return { src: src, px: [w, h] };
    var s = big ? MAX_PX / Math.max(w, h) : 1, cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    var png = bmp || /^data:image\/png/i.test(src);
    return { src: png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.92), px: [cv.width, cv.height] };
  }
  function nextName(f) {
    var n = 1, names = (f.pictures || []).map(function (p) { return p.name; });
    while (names.indexOf('Sketch Picture' + n) >= 0) n++;
    return 'Sketch Picture' + n;
  }
  UI.insertSketchPicture = function (src, name, opts) {
    var f = sketch();
    if (!f) { UI.toast('Open a sketch first: a sketch picture goes on the sketch plane.'); return Promise.resolve(-1); }
    return decode(src).then(function (img) {
      var n = normalise(src, img), g = sketch();
      if (g !== f) return -1;
      // placed with its lower-left corner at the sketch origin, sized to about two thirds of the graphics area
      var view = Math.min(UI.size.w, UI.size.h) * UI.cam.scale * 0.66, s = view / Math.max(n.px[0], n.px[1]);
      var p = { name: nextName(f), src: n.src, px: n.px, x: 0, y: 0, w: r6(n.px[0] * s), h: r6(n.px[1] * s), ang: 0, tmode: 'file', alpha: 0, key: '#ffffff', keyTol: 0.1 };
      if (name) p.file = String(name).slice(0, 120);
      UI.pushUndo(); App.sketchDirty = true;
      (f.pictures = f.pictures || []).push(p);
      redraw();
      var i = f.pictures.length - 1;
      if (!(opts && opts.noPM)) openPicturePM(i, { fresh: true, undoDepth: App.undo.length });
      return i;
    }, function (err) { UI.toast(err.message); UI.setStatus(err.message); return -1; });
  };
  var fileInput = null;
  UI.cmdSketchPicture = function () {
    if (!sketch()) { UI.toast('Open a sketch first: Sketch Picture places a picture on the sketch plane.'); return; }
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file'; fileInput.id = 'sk-picture-file'; fileInput.hidden = true;
      fileInput.accept = 'image/png,image/jpeg,image/bmp,.png,.jpg,.jpeg,.bmp';
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var rd = new FileReader();
        rd.onload = function () { UI.insertSketchPicture(String(rd.result), file.name); fileInput.value = ''; };
        rd.onerror = function () { UI.toast('Could not read ' + file.name + '.'); };
        rd.readAsDataURL(file);
      });
      document.body.appendChild(fileInput);
    }
    UI.setStatus('Choose a PNG, JPG or BMP picture to place in the sketch.');
    fileInput.click();
  };

  // ------------------------------------------------------------------ the Sketch Picture PropertyManager
  var cur = null;   // { f, i, before, pushed, fresh, picks, cmd }
  function rec() { return cur && cur.f.pictures && cur.f.pictures[cur.i]; }
  function valuesOf(p) {
    return { x: r6(p.x), y: r6(p.y), ang: r6(+p.ang || 0), w: r6(p.w), h: r6(p.h), lock: p.lock !== false, flipH: !!p.flipH, flipV: !!p.flipV, scaleTool: false,
      tmode: p.tmode || 'file', alpha: Math.round((+p.alpha || 0) * 100), key: p.key || '#ffffff', keyTol: Math.round((p.keyTol == null ? 0.1 : +p.keyTol) * 100) };
  }
  function touch() { if (!cur.pushed) { UI.pushUndo(); App.sketchDirty = true; cur.pushed = true; } }
  function apply(v, key) {
    var p = rec();
    if (!p) return;
    var ratio = p.w > 0 ? p.h / p.w : 1, rerender = false;
    if (key === 'w' && v.lock && +v.w > 0) { v.h = r6(+v.w * ratio); rerender = true; }
    if (key === 'h' && v.lock && +v.h > 0) { v.w = r6(+v.h / ratio); rerender = true; }
    var next = { x: +v.x || 0, y: +v.y || 0, ang: +v.ang || 0, w: +v.w > 0 ? +v.w : p.w, h: +v.h > 0 ? +v.h : p.h, flipH: !!v.flipH, flipV: !!v.flipV, lock: !!v.lock,
      tmode: v.tmode || 'file', alpha: Math.max(0, Math.min(100, +v.alpha || 0)) / 100, key: v.key || '#ffffff', keyTol: Math.max(0, Math.min(100, +v.keyTol || 0)) / 100 };
    var same = Object.keys(next).every(function (k) { return (k === 'lock' ? p.lock !== false : p[k]) === next[k] || (k !== 'lock' && p[k] == null && !next[k]); });
    if (!same) {
      touch();
      Object.keys(next).forEach(function (k) { p[k] = next[k]; });
      if (p.lock !== false) delete p.lock;
      if (!p.flipH) delete p.flipH;
      if (!p.flipV) delete p.flipV;
      redraw();
    }
    if (key === 'scaleTool') { setScaleTool(!!v.scaleTool); rerender = true; }
    if (key === 'tmode') rerender = true;
    if (rerender) UI.renderPM();
  }
  function closeScaleBox() { var b = $('sk-pic-scale'); if (b) b.remove(); }
  function setScaleTool(on) {
    if (!cur) return;
    cur.picks = [];
    closeScaleBox();
    if (UI.sketchFeedbackClear) UI.sketchFeedbackClear();
    if (on) { cur.cmd.onSketchPoint = scalePick; cur.cmd.onSketchMove = scaleMove; UI.setStatus('Scale tool: click two points on the picture a known distance apart.'); }
    else { delete cur.cmd.onSketchPoint; delete cur.cmd.onSketchMove; }
  }
  function snapUV(uv, mx, my) {
    // a pick lands on a sketch point under the cursor when there is one (the ends of a line drawn along a scale bar)
    var S = window.SketchSolver, f = cur && cur.f, best = null, bd = Infinity, a = UI.screenToPlane(mx, my, UI.activePlane()), b = UI.screenToPlane(mx + 1, my, UI.activePlane());
    var px = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
    if (S && f && px > 0) f.entities.forEach(function (e, j) {
      (S.pointRefs ? S.pointRefs(f, j) : []).forEach(function (q) { var d = Math.hypot(q.pt[0] - uv[0], q.pt[1] - uv[1]); if (d < 7 * px && d < bd) { bd = d; best = q.pt.slice(); } });
    });
    return best || uv;
  }
  function drawPicks(extra) {
    if (!cur || !UI.sketchPreview) return;
    var pts = cur.picks.concat(extra ? [extra] : []);
    if (UI.sketchFeedbackClear) UI.sketchFeedbackClear();
    if (pts.length >= 2) UI.sketchPreview([pts.slice(0, 2)], 'stroke:#d0302a;stroke-width:2;fill:none;stroke-linecap:round', 'sk-pic-scale-line');
    pts.forEach(function (q) { var r = UI.cam.scale * 4; UI.sketchPreview([[[q[0] - r, q[1]], [q[0] + r, q[1]]], [[q[0], q[1] - r], [q[0], q[1] + r]]], 'stroke:#d0302a;stroke-width:2;fill:none', 'sk-pic-scale-pt'); });
  }
  function scaleMove(uv, mx, my) { if (cur && cur.picks.length === 1 && uv) drawPicks(snapUV(uv, mx, my)); else if (cur && cur.picks.length) drawPicks(); }
  function scalePick(uv, mx, my) {
    if (!cur || !uv) return;
    if (cur.picks.length >= 2) { cur.picks = []; closeScaleBox(); }
    var q = snapUV(uv, mx, my);
    if (cur.picks.length === 1 && Math.hypot(q[0] - cur.picks[0][0], q[1] - cur.picks[0][1]) < 1e-9) { UI.setStatus('Click a second, different point.'); return; }
    cur.picks.push(q);
    drawPicks();
    if (cur.picks.length === 1) { UI.setStatus('Scale tool: click the second point.'); return; }
    var d = Math.hypot(cur.picks[1][0] - cur.picks[0][0], cur.picks[1][1] - cur.picks[0][1]);
    showScaleBox(mx, my, d);
  }
  // the box for the real distance between the two picks (Enter scales the picture about the first pick)
  function showScaleBox(mx, my, d) {
    closeScaleBox();
    var vp = $('viewport'), r = vp.getBoundingClientRect();
    var box = document.createElement('div');
    box.id = 'sk-pic-scale'; box.className = 'sk-pic-scale';
    box.style.left = Math.round(r.left + mx + 12) + 'px'; box.style.top = Math.round(r.top + my + 12) + 'px';
    box.innerHTML = '<label>Distance</label><input type="text" spellcheck="false"><span class="unit"></span><button type="button" title="Scale the picture (Enter)">✓</button><button type="button" title="Cancel (Esc)">✗</button>';
    var inp = box.querySelector('input');
    inp.value = String(r6(d));
    box.querySelector('.unit').textContent = UI.unitLabel ? UI.unitLabel() : '';
    function go() {
      var rd = UI.parseLength ? UI.parseLength(inp.value, { kind: 'length' }) : { value: parseFloat(inp.value) };
      if (rd.error != null || !(rd.value > 0)) { UI.setStatus('Type the real distance between the two points: ' + (rd.error || 'a positive length') + '.'); inp.classList.add('err'); return; }
      UI.scaleSketchPicture(cur.i, cur.picks[0], cur.picks[1], rd.value);
    }
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); go(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cur.picks = []; closeScaleBox(); drawPicks(); }
    });
    box.querySelectorAll('button')[0].addEventListener('click', go);
    box.querySelectorAll('button')[1].addEventListener('click', function () { cur.picks = []; closeScaleBox(); drawPicks(); });
    document.body.appendChild(box);
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { /* */ } }, 0);
    UI.setStatus('Type the real distance between the two points and press Enter.');
  }
  // scale picture i so the distance from a to b becomes dist, about a (a stays where it is on the sketch)
  UI.scaleSketchPicture = function (i, a, b, dist) {
    var f = cur && cur.i === i ? cur.f : sketch(), p = f && f.pictures && f.pictures[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!p || !(d > 0) || !(dist > 0)) return false;
    var s = dist / d;
    if (cur && cur.f === f && cur.i === i) touch(); else { UI.pushUndo(); App.sketchDirty = true; }
    p.x = r6(a[0] + (p.x - a[0]) * s); p.y = r6(a[1] + (p.y - a[1]) * s); p.w = r6(p.w * s); p.h = r6(p.h * s);
    redraw();
    if (cur && cur.f === f && cur.i === i) {
      var v = UI.pmSpec() && UI.pmSpec().values;
      if (v) { v.x = r6(p.x); v.y = r6(p.y); v.w = r6(p.w); v.h = r6(p.h); v.scaleTool = false; }
      setScaleTool(false);
      UI.renderPM();
    }
    UI.setStatus('Picture scaled ×' + r6(s) + ': ' + fmt(p.w) + ' × ' + fmt(p.h) + '.');
    return true;
  };
  function openPicturePM(i, o) {
    var f = sketch(), p = f && f.pictures && f.pictures[i];
    if (!p) return;
    o = o || {};
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    var cmd = {};
    cur = { f: f, i: i, before: JSON.stringify(p), pushed: !!o.fresh, fresh: !!o.fresh, picks: [], cmd: cmd, undoDepth: o.undoDepth };
    var v = valuesOf(p);
    UI.openPM({
      title: 'Sketch Picture', icon: 'sketchPicture', values: v, noFocus: true, command: cmd,
      message: 'Place the picture behind the sketch: type its origin, angle and size, or turn on the scale tool and click two points a known distance apart.',
      groups: [
        { title: 'Properties', fields: [
          { type: 'static', label: 'Picture', value: function () { var q = rec(); return q ? (q.file || q.name) + (q.px ? ' (' + q.px[0] + ' × ' + q.px[1] + ' px)' : '') : ''; } },
          { type: 'number', label: 'Origin X', key: 'x', unit: 'u' },
          { type: 'number', label: 'Origin Y', key: 'y', unit: 'u' },
          { type: 'number', label: 'Angle', key: 'ang', unit: '°' },
          { type: 'number', label: 'Width', key: 'w', unit: 'u', min: 0 },
          { type: 'number', label: 'Height', key: 'h', unit: 'u', min: 0 },
          { type: 'check', label: 'Lock aspect ratio', key: 'lock' },
          { type: 'check', label: 'Enable scale tool', key: 'scaleTool' },
          { type: 'check', label: 'Flip horizontal', key: 'flipH' },
          { type: 'check', label: 'Flip vertical', key: 'flipV' }] },
        { title: 'Transparency', fields: [
          { type: 'radio', key: 'tmode', options: [['none', 'None'], ['file', 'From file'], ['full', 'Full image'], ['user', 'User-defined']] },
          { type: 'html', show: function (w) { return w.tmode === 'user'; }, html: function (w) { return '<div class="pm-row"><label>Colour</label><input type="color" id="sk-pic-key" value="' + (w.key || '#ffffff') + '"></div>'; } },
          { type: 'number', label: 'Matching tolerance', key: 'keyTol', unit: '%', min: 0, show: function (w) { return w.tmode === 'user'; } },
          { type: 'html', show: function (w) { return w.tmode === 'full' || w.tmode === 'user'; }, html: function (w) { return '<div class="pm-row sk-pic-alpha"><label>Transparency</label><input type="range" id="sk-pic-alpha" min="0" max="100" step="1" value="' + (+w.alpha || 0) + '"><span class="static" id="sk-pic-alpha-v">' + (+w.alpha || 0) + ' %</span></div>'; } }] }],
      onChange: function (vals, key) { if (key) apply(vals, key); },
      onOK: function () { closeScaleBox(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); var q = rec(); UI.setStatus(q ? q.name + ' placed: ' + fmt(q.w) + ' × ' + fmt(q.h) + '.' : ''); },
      onCancel: function () {
        var q = rec();
        if (q && cur.fresh) {
          // ✗ on a picture just inserted takes it out again
          cur.f.pictures.splice(cur.i, 1);
          if (!cur.f.pictures.length) delete cur.f.pictures;
          if (cur.undoDepth != null && App.undo.length === cur.undoDepth) App.undo.pop();
        } else if (q && cur.pushed) {
          cur.f.pictures[cur.i] = JSON.parse(cur.before);
          App.undo.pop();
        }
        redraw();
      },
      onClose: function () { closeScaleBox(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); cur = null; }
    });
  }
  UI.editSketchPicture = function (i) { if (!sketch()) { UI.toast('Open a sketch first.'); return; } openPicturePM(i, {}); };
  UI.sketchPictureEditing = function () { return cur ? cur.i : -1; };
  // the colour and the transparency slider are plain inputs in the PropertyManager's html rows
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!cur || !t || (t.id !== 'sk-pic-alpha' && t.id !== 'sk-pic-key')) return;
    var v = UI.pmSpec() && UI.pmSpec().values;
    if (!v) return;
    if (t.id === 'sk-pic-alpha') { v.alpha = +t.value; var lab = $('sk-pic-alpha-v'); if (lab) lab.textContent = t.value + ' %'; apply(v, 'alpha'); }
    else { v.key = t.value; apply(v, 'key'); }
  });

  UI.deleteSketchPicture = function (i) {
    var f = sketch(), p = f && f.pictures && f.pictures[i];
    if (!p) return false;
    if (cur && cur.f === f) UI.closePM();
    UI.pushUndo(); App.sketchDirty = true;
    f.pictures.splice(i, 1);
    if (!f.pictures.length) delete f.pictures;
    redraw();
    UI.setStatus(p.name + ' deleted.');
    return true;
  };

  // ------------------------------------------------------------------ right-click on a picture
  var lastRight = null;
  window.addEventListener('mousedown', function (ev) {
    if (ev.button !== 2) return;
    var vp = $('viewport');
    if (!vp || !vp.contains(ev.target)) { lastRight = null; return; }
    var r = vp.getBoundingClientRect();
    lastRight = [ev.clientX - r.left, ev.clientY - r.top];
  }, true);
  UI.sketchPictureMenuItems = function (mx, my) {
    var p = mx != null ? [mx, my] : lastRight, i = p ? UI.sketchPictureAt(p[0], p[1]) : -1;
    if (i < 0) return [];
        return [{ label: 'Edit Sketch Picture', icon: 'sketchPicture', action: function () { UI.editSketchPicture(i); } },
      { label: 'Delete', icon: 'cancel', action: function () { UI.deleteSketchPicture(i); } },
      { sep: true }];
  };
})();
