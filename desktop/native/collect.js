// collect.js — puts the native engine together in one folder: occt_native.node (build/Release, from node-gyp), the
// loader lib/index.js and the OpenCascade DLLs it needs (from build-occt.ps1's install). That folder is what
// `node anvil/headless/anvil.js ... --native <folder>` and the app load.
//   node desktop/native/collect.js [outDir]   (default: Desktop\Output\Anvil Native\addon; OCCT_DIR: the OCCT install)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = path.resolve(process.argv[2] || path.join(os.homedir(), 'Desktop', 'Output', 'Anvil Native', 'addon'));
const occt = process.env.OCCT_DIR || path.join(os.homedir(), 'Desktop', 'Output', 'Anvil Native', 'occt-7.6.3', 'install');
const bin = path.join(occt, 'win64', 'vc14', 'bin');
const node = path.join(__dirname, 'build', 'Release', 'occt_native.node');
// the toolkits binding.gyp links (and what they link): every OpenCascade DLL the addon loads
const DLLS = ['TKernel', 'TKMath', 'TKG2d', 'TKG3d', 'TKGeomBase', 'TKBRep', 'TKGeomAlgo', 'TKTopAlgo', 'TKPrim', 'TKBO', 'TKBool', 'TKHLR',
  'TKFillet', 'TKOffset', 'TKFeat', 'TKMesh', 'TKShHealing', 'TKXSBase', 'TKSTEPBase', 'TKSTEPAttr', 'TKSTEP209', 'TKSTEP', 'TKIGES'];

if (!fs.existsSync(node)) { console.error('no ' + node + ': run  npm run build  in desktop/native first'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
let bytes = 0;
const copy = (from, name) => { fs.copyFileSync(from, path.join(out, name)); bytes += fs.statSync(from).size; };
copy(node, 'occt_native.node');
copy(path.join(__dirname, 'lib', 'index.js'), 'index.js');
DLLS.forEach((d) => {
  const f = path.join(bin, d + '.dll');
  if (!fs.existsSync(f)) { console.error('missing ' + f + ' (build OpenCascade: build-occt.ps1)'); process.exit(2); }
  copy(f, d + '.dll');
});
for (const lic of ['LICENSE_LGPL_21.txt', 'OCCT_LGPL_EXCEPTION.txt']) if (fs.existsSync(path.join(occt, lic))) copy(path.join(occt, lic), lic);
console.log('native engine in ' + out + ' (' + (DLLS.length + 2) + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB)');
