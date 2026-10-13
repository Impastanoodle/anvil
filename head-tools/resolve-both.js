// node head-tools/resolve-both.js <file> [both|head|theirs]
// Resolves every git conflict block in <file>: "both" (default) keeps HEAD's side then the incoming side (right for two
// lanes that each appended a block or a manifest line at the same spot), "head" / "theirs" keep one side. Prints the
// number of blocks resolved. Read the result: "both" is wrong when the two sides edited the same lines.
var fs = require('fs');
var file = process.argv[2], mode = process.argv[3] || 'both', src = fs.readFileSync(file, 'utf8');
var re = /<<<<<<< [^\r\n]*\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>> [^\r\n]*\r?\n/g, hunks = [], m;
while ((m = re.exec(src))) hunks.push({ start: m.index, end: m.index + m[0].length, head: m[1], inc: m[2] });
for (var i = hunks.length - 1; i >= 0; i--) {
  var h = hunks[i].head, c = hunks[i].inc;
  var out = mode === 'head' ? h : mode === 'theirs' ? c : h + c;
  src = src.slice(0, hunks[i].start) + out + src.slice(hunks[i].end);
}
fs.writeFileSync(file, src);
console.log(file + ': ' + hunks.length + ' conflict block(s) resolved (' + mode + ')');
