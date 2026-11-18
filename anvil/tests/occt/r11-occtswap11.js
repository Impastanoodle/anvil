  // --- r11/occtswap11 ---
  // (a) Edit Feature's rolled-back part (worker `upto`): the first n features from the rebuild cache, the same solid as a
  // fresh build of those features, and the cache left as it was (the next whole build reuses every feature);
  // (b) the Tray's Miter Flange with its relief cuts and walls in one Boolean each: the same solid as before (77 faces,
  // 35407.972015 mm³, lane flanges: its corners are SolidWorks' auto miter; was 57 faces, 35770.997515), per-feature times reported
  try {
    var t11 = performance.now(), why11 = [], det11 = [];
    function occtUpto(model, n) { return new Promise(function (res, rej) { var s11 = ++seq; waiting[s11] = { res: res, rej: rej }; worker.postMessage({ type: 'build', seq: s11, model: model, upto: n }); }); }
    for (var nm11 of ['Tray', 'Rounded handle', 'Spur gear (12 teeth)']) {
      var m11 = K.newModel('T'); K.runScript(m11, EX.find(function (e) { return e.name === nm11; }).code);
      var js11 = JSON.stringify(m11), nF = m11.features.length, n11 = nF - 1;
      var full = await occt(JSON.parse(js11));
      var rolled = await occtUpto(JSON.parse(js11), n11);
      var pm11 = JSON.parse(js11); pm11.features = pm11.features.slice(0, n11);
      var fresh = await occt(pm11, { noCache: true });
      var again = await occt(JSON.parse(js11));
      if (!rolled.valid || Object.keys(rolled.status).length !== n11 || Object.keys(rolled.status).some(function (id) { return rolled.status[id] !== 'ok'; })) why11.push(nm11 + ': rolled-back build ' + JSON.stringify(rolled.status));
      if (!(Math.abs(rolled.volume - fresh.volume) <= 1e-9 * fresh.volume) || rolled.faces.length !== fresh.faces.length) why11.push(nm11 + ': rolled back ' + rolled.volume + ' / ' + rolled.faces.length + ' faces vs fresh ' + fresh.volume + ' / ' + fresh.faces.length);
      if (rolled.reused !== n11) why11.push(nm11 + ': rolled-back build reused ' + rolled.reused + ' of ' + n11 + ' features');
      if (again.reused !== nF || again.volume !== full.volume) why11.push(nm11 + ': the whole part after the rollback reused ' + again.reused + ' of ' + nF + ' (cache changed), volume ' + again.volume + ' vs ' + full.volume);
      if (rolled.step || rolled.iges) why11.push(nm11 + ': the rolled-back build exported STEP / IGES');
      var fresh2 = nm11 === 'Tray' ? await occt(JSON.parse(js11), { noCache: true }) : null;
      if (fresh2) {
        if (!(Math.abs(fresh2.volume - 35407.972015) < 1e-5) || fresh2.faces.length !== 77 || !fresh2.valid) why11.push('Tray: ' + fresh2.volume + ' mm³, ' + fresh2.faces.length + ' faces, valid ' + fresh2.valid + ' (want 35407.972015, 77)');
        var fm11 = fresh2.ms && fresh2.ms.features || {};
        if (m11.features.some(function (f) { return typeof fm11[f.id] !== 'number'; })) why11.push('Tray: per-feature times ' + JSON.stringify(fm11));
        det11.push('Tray flange ' + (fm11[m11.features.filter(function (f) { return f.type === 'flange'; })[0].id] || 0).toFixed(0) + ' ms');
      }
      det11.push(nm11 + ' ' + n11 + '/' + nF + ' ' + rolled.volume.toFixed(3));
    }
    row(why11.length ? 'bad' : 'ok', 'Edit Feature rollback from the rebuild cache (worker upto: same solid as a fresh build, cache untouched); Tray Miter Flange in one Boolean per stage (same solid)', why11.slice(0, 6).join('; ') || det11.join(', '), performance.now() - t11);
    counts[why11.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'Edit Feature rollback from the rebuild cache; Tray Miter Flange', e.message); counts.fail++; }
  // --- end r11/occtswap11 ---
