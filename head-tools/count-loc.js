// Lines of code for the Foreman board's tile (status/board.loc): git-tracked source, vendored code left out.
//   node head-tools/count-loc.js      prints { total, app, tests, tools, commit, countedAt } as JSON
var fs = require('fs'), path = require('path'), cp = require('child_process');
var root = path.join(__dirname, '..');
function git(args) { return cp.execSync('git ' + args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }); }

var out = { total: 0, app: 0, tests: 0, tools: 0 };
git('ls-files').split('\n').forEach(function (f) {
  if (!/\.(js|css|html|ps1|py)$/.test(f) || /^anvil\/vendor\//.test(f)) return;
  var text = fs.readFileSync(path.join(root, f), 'utf8'), lines = text.split('\n').length - (/\n$/.test(text) ? 1 : 0);
  var kind = /^anvil\/tests\//.test(f) ? 'tests' : /^anvil\/(headless|experiments)\//.test(f) || !/^anvil\//.test(f) ? 'tools' : 'app';
  out[kind] += lines; out.total += lines;
});
out.commit = git('rev-parse --short HEAD').trim();
out.countedAt = new Date().toISOString();
console.log(JSON.stringify(out));
