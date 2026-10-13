  // --- r11/perf11 ---
  step('r11/perf11: an exception thrown inside one frame does not stop the render loop (the viewport keeps drawing)', async function () {
    await anvil.newPart(); await idle();
    var base = UI.drawDims, thrown = false, MSG = 'r11/perf11 test: a frame that throws';
    UI.drawDims = function () { UI.drawDims = base; thrown = true; throw new Error(MSG); };
    UI.App.dimsStale = true;
    for (var i = 0; i < 150 && !thrown; i++) await wait(20);
    UI.drawDims = base;
    for (var k = errors.length - 1; k >= 0; k--) if (errors[k].indexOf(MSG) >= 0) errors.splice(k, 1);   // the expected one
    assert(thrown, 'the throwing frame never ran');
    var f1 = UI.renderer.info.render.frame;
    UI.requestRender();
    for (var j = 0; j < 150 && UI.renderer.info.render.frame === f1; j++) await wait(20);
    assert(UI.renderer.info.render.frame > f1, 'no frame drawn after the exception (render loop stopped)');
    return 'frames ' + f1 + ' → ' + UI.renderer.info.render.frame;
  });
  // --- end r11/perf11 ---

