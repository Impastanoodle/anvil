// output-dir.js — where Desktop\Output is on this PC: %USERPROFILE%\Desktop\Output (the shop PC), else the Output folder of
// a Desktop that Windows keeps in OneDrive (%OneDrive%\Desktop\Output, the home PC). The build scripts (release.js,
// stage.js, native/collect.js, native/electron-check.js) and anvil/headless/occt.js put and look for the releases and the
// native engine under it. The app itself (main.js) asks Windows for the Desktop instead.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
module.exports = function outputDir() {
  const h = os.homedir();
  const c = [path.join(h, 'Desktop'), process.env.OneDrive && path.join(process.env.OneDrive, 'Desktop'), path.join(h, 'OneDrive', 'Desktop')]
    .filter(Boolean).map((d) => path.join(d, 'Output'));
  return c.find((d) => fs.existsSync(d)) || c[0];
};
