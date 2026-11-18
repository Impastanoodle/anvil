  // the worker's rebuild cache: after an edit to one feature, the build that reuses the unchanged prefix gives the same
  // solid as a build from scratch, and reuses the features before the edit
  try {
    var t2 = performance.now(), tm = anvilBuild(EX.find(function (e) { return e.name === 'Tray'; }).code).model;
    await occt(tm);   // fills the cache
    var edited = JSON.parse(JSON.stringify(tm)), lastF = edited.features[edited.features.length - 1];
    lastF.depth = (+lastF.depth || 0) + 0.5;
    var cached = await occt(edited), fresh = await occt(edited, { noCache: true });
    var sameC = Math.abs(cached.volume - fresh.volume) < 1e-6 * fresh.volume && cached.faces.length === fresh.faces.length && cached.valid && fresh.valid;
    var why2 = sameC && cached.reused === edited.features.length - 1 ? '' : 'cached ' + cached.volume.toFixed(4) + ' / ' + cached.faces.length + ' faces (reused ' + cached.reused + '), fresh ' + fresh.volume.toFixed(4) + ' / ' + fresh.faces.length;
    row(why2 ? 'bad' : 'ok', 'rebuild cache: the Tray with its last feature edited equals a fresh build', why2 || ('reused ' + cached.reused + ' of ' + edited.features.length + ' features: ' + cached.ms.build.toFixed(0) + ' ms vs ' + fresh.ms.build.toFixed(0) + ' ms from scratch'), performance.now() - t2);
    counts[why2 ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'rebuild cache', e.message); counts.fail++; }
  // the arena frees every OpenCascade object after a build: building again must give the same answer
  try {
    var m2 = anvilBuild(EX.find(function (e) { return e.name === 'Flange'; }).code).model;
    var r1 = await occt(m2), r2 = await occt(m2);
    var same = Math.abs(r1.volume - r2.volume) < 1e-9 && r1.faces.length === r2.faces.length && r1.mesh.faceOf.length === r2.mesh.faceOf.length;
    row(same ? 'ok' : 'bad', 'rebuilding the Flange twice gives the same solid (objects freed safely)', r1.volume.toFixed(4) + ' / ' + r2.volume.toFixed(4)); counts[same ? 'pass' : 'fail']++;
  } catch (e) { row('bad', 'rebuild twice', e.message); counts.fail++; }
