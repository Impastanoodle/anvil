  // --- rfRE (2026-11-19, head; a customer's 55-solid STEP assembly froze the window for 31 s while Anvil's reader
  // read it) --- a file of 400 KB and up is read by Anvil's reader in a worker of its own (worker.js, message 'import'),
  // the main thread only builds the part from the reply; a smaller file is read at once as before; without a worker
  // the main thread reads it. Synthetic file (a perforated plate written by Anvil); the kernel setting is put back.
  (function () {
    step('rfRE: a STEP file over 400 KB opened with Anvil\'s reader is read in a worker (one import message, the same part as a main-thread read), a small one on the main thread; a refusal comes back as the reader\'s own message', async function () {
      var was = UI.occt && UI.occt.on ? UI.occt.on() : false, errs0 = errors.length;
      var post = W.Worker.prototype.postMessage, sent = 0;
      // (worker.js' import message carries opts; the OpenCascade worker's own 'import' message, the fallback, does not)
      W.Worker.prototype.postMessage = function (m) { if (m && m.type === 'import' && m.opts) sent++; return post.apply(this, arguments); };
      try {
        if (UI.occt && UI.occt.set) { UI.occt.set(false); await idle(); }
        await anvil.newPart(); await idle();
        // a 12 x 8 plate with a pattern of holes
        var code = 'p.units("in"); p.sketch("Top").centerRect(0, 0, 12, 8).extrude(0.125);\n' +
          'p.sketch("Top", 0.125).circle(-5.25, -3.375, 0.125).cut("through", { reverse: true });\n' +
          'p.linearPattern({ dir: "x", spacing: 0.75, count: 15, dir2: "z", spacing2: 0.75, count2: 10 });';
        var r = await anvil.run(code); await idle();
        assert(!(r && r.error), 'the plate builds: ' + (r && r.error));
        var vol = anvil.mass().volume, text = W.Exchange.exportSTEP(UI.App.model, UI.App.build);
        // (padded past 400 KB with points nothing refers to, as a large customer file is mostly points)
        var pad = [], pn, cut = text.lastIndexOf('ENDSEC;');
        for (pn = 0; pn < 14000; pn++) pad.push('#' + (9000000 + pn) + '=CARTESIAN_POINT(\'\',(0.,0.,0.));');
        text = text.slice(0, cut) + pad.join('\n') + '\n' + text.slice(cut);
        assert(text.length > 400000, 'the STEP text is over 400 KB: ' + text.length);
        await anvil.newPart(); await idle();
        sent = 0;
        await anvil.importFile('plate.step', text); await idle();
        assert(sent === 1, 'one import message went to a worker: ' + sent);
        assert(UI.App.model.features.length === 1 && UI.App.model.features[0].type === 'import', 'one Imported feature');
        near(anvil.mass().volume, vol, 1e-6 * vol, 'the volume of the plate read in the worker');
        // a small file: no worker
        await anvil.newPart(); await idle();
        await anvil.run('p.units("in"); p.sketch("Top").centerRect(0, 0, 2, 1).extrude(0.25);'); await idle();
        var small = W.Exchange.exportSTEP(UI.App.model, UI.App.build);
        assert(small.length < 150000, 'the small STEP text: ' + small.length);
        sent = 0;
        await anvil.importFile('small.step', small); await idle();
        assert(sent === 0, 'a small file is read on the main thread: ' + sent);
        near(anvil.mass().volume, 0.5, 1e-9, 'the small part');
        // a refusal from the worker is the reader's own message
        var bad = text.slice(0, text.indexOf('DATA;') + 5) + '\n' + pad.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
        assert(bad.length > 400000, 'the empty STEP text is over 400 KB: ' + bad.length);
        sent = 0;
        var msg = '';
        try { await anvil.importFile('empty.step', bad); } catch (e) { msg = String(e && e.message || e); }
        assert(sent === 1 && /No solid bodies/.test(msg), 'the refusal from the worker: ' + sent + ' / ' + msg);
        await idle();
        near(anvil.mass().volume, 0.5, 1e-9, 'the open part is still there after the refusal');
        assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
        return 'worker read of ' + Math.round(text.length / 1024) + ' KB';
      } finally { W.Worker.prototype.postMessage = post; if (UI.occt && UI.occt.set) { UI.occt.set(was); await idle(); } }
    });
  })();
