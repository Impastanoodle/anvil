  // STEP and IGES straight from OpenCascade's B-rep, read back by OpenCascade as an Imported feature that keeps the
  // file (brep): same volume, same B-rep faces; the STEP product is named after the part
  try {
    var mugModel = anvilBuild(EX.find(function (e) { return e.name === 'Mug'; }).code).model;
    var mug = await occt(mugModel, { exports: true });
    for (var fmt of ['step', 'iges']) {
      var text = fmt === 'step' ? mug.step : mug.iges, t1 = performance.now();
      if (!text) { row('bad', fmt.toUpperCase() + ' export', 'no ' + fmt + ' text: ' + (mug.exportError || '')); counts.fail++; continue; }
      var imp = await occtImport(fmt, text);
      var res = Exchange.finishImport('step', { units: 'mm' }, imp.solids, 1, []);
      var im = K.newModel('RT');
      im.features.push({ id: 1, type: 'import', name: 'Imported1', file: 'mug.' + fmt, format: fmt, units: 'mm', solids: Exchange.encodeSolids(res.solids), brep: { format: fmt, text: text } });
      im.nextId = 2;
      var back = await occt(im), dvol = Math.abs(back.volume - mug.volume) / mug.volume;
      var why = [];
      if (back.unsupported || !back.valid) why.push('rebuild ' + (back.unsupported || 'invalid'));
      if (!(dvol < 1e-4)) why.push('volume ' + back.volume.toFixed(3) + ' vs ' + mug.volume.toFixed(3));
      if (back.faces.length !== mug.faces.length) why.push(back.faces.length + ' faces vs ' + mug.faces.length);
      if (fmt === 'step' && !/PRODUCT\('Mug','Mug'/.test(text)) why.push('STEP product not named after the part');
      var det = fmt.toUpperCase() + ' ' + (text.length / 1024).toFixed(0) + ' KB, re-read: ' + back.faces.length + ' faces, volume ' + back.volume.toFixed(3) + ' (d ' + dvol.toExponential(1) + ')';
      row(why.length ? 'bad' : 'ok', 'Mug → ' + fmt.toUpperCase() + ' → OpenCascade import (exact rebuild from the kept file)', why.join('\n') + (why.length ? '\n' : '') + det, performance.now() - t1);
      counts[why.length ? 'fail' : 'pass']++;
    }
  } catch (e) { row('bad', 'STEP / IGES round trip', e.message); counts.fail++; }
