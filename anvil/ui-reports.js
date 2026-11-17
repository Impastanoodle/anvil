// ui-reports.js — problem reports (lane reports, rfMI, 2026-11-12). User: "a crash report or not responding report to
// send to you for fixing". When Anvil crashes, stops responding, throws, or the user asks (Help ▸ Report a Problem…), a
// report is written that a Claude session can read and act on: what happened, where it was stuck (the call stack, from
// the desktop app's main process), the operation in progress, the last 200 breadcrumbs, console errors and a state
// summary. Everything stays on this computer. Privacy by default: no file names, paths, part names, custom
// properties, note text or geometry (kinds, sizes and counts instead); the model goes in only when the user ticks it.
//
// Two halves in one file:
// - Format (no DOM, no UI): report JSON -> report.md, the scrubber. desktop/main.js require()s this file for it, so a
//   report written by the main process (not responding, crash) reads exactly like one written by the page.
// - The page side (UI.reports): breadcrumbs, capture hooks, the watchdog (browser) / heartbeat (desktop), the bar, the
//   status item, Help ▸ Report a Problem…, the Options section. Loaded right after ui-core.js.
//
// API (the contract of run local-2026-11-12c): UI.reports.crumb(text), UI.reports.note(key, value),
// UI.reports.snapshot() -> the state summary, UI.reports.make(kind, extra) -> Promise { id, kind, dir?, where },
// UI.reports.list() -> Promise [{ id, kind, at, summary, dir? }]; also dialog() (Report a Problem…), show(info) (the
// bar), optionsSection(), install() (boot), crumbs(), consoleLog(), format (= Format).
(function (root) {
  'use strict';

  // ================================================================ Format (shared with desktop/main.js)
  var Format = (function () {
    var EXT = 'step|stp|iges|igs|dxf|dwg|json|anvil|stl|obj|mtl|3mf|sldprt|sldasm|slddrw|pdf|svg|png|jpg|jpeg|txt|csv|drawing|js|x_t|sat|nc|tap|xlsx|docx';
    // a file name; the tokens a pass already wrote (<path .x>, <file .x>, <name>) are matched first and kept, so a
    // second pass (a crumb scrubbed when made and again in the report) changes nothing
    var FILE_RE = new RegExp('<(?:path|file|name)[^<>]*>|[^\\s"\'<>|*?\\\\/:]*[^\\s"\'<>|*?\\\\/:.]\\.(' + EXT + ')(\\.json)?\\b', 'gi');
    // a path: drive letter, UNC or file://; app://anvil/… and http(s) URLs of the app stay. A path may hold spaces
    // ("C:\Users\me\My Parts\x.step"): first a path ending in a known extension (it may run over spaces), then any
    // other path up to the next space
    var START = '(^|[^A-Za-z0-9_])((?:[A-Za-z]:[\\\\/]|\\\\\\\\|file:///?)';
    var PATH_EXT_RE = new RegExp(START + '[^"\'<>|*?\\r\\n]*?\\.(' + EXT + ')(\\.json)?)(?![A-Za-z0-9_])', 'gi');
    var PATH_RE = new RegExp(START + '[^\\s"\'<>|*?]*)', 'g');
    function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    // Anvil's own source files (anvil/*.js, desktop/*.js): kept by name, also at the end of a path (a stack of main.js)
    var OWN = /^(ui|kernel|drawing|occt|reports|icons|csg|exchange|assembly|materials|holewizard|sketch|evaluate|worker|library|costing|nest|dxf-import|dwg-writer|three|main|preload|updates|converters|occt-host|stage|release|check)[\w.-]*\.js$/i;
    // text -> the same with paths, file names and the given private strings replaced (kinds kept: "<file .step>")
    function scrub(text, secrets) {
      var s = String(text == null ? '' : text);
      s = s.replace(PATH_EXT_RE, function (all, lead, p, ext, js) {
        var base = p.replace(/^.*[\\\/]/, '');
        if (OWN.test(base) && !/\s/.test(p)) return lead + '<path>/' + base;   // a source file of Anvil: where, not who
        return lead + '<path .' + ext.toLowerCase() + (js || '') + '>';
      });
      s = s.replace(PATH_RE, function (all, lead) { return lead + '<path>'; });
      (secrets || []).forEach(function (x) {
        if (typeof x !== 'string' || x.length < 3) return;
        s = s.replace(new RegExp(escRe(x), 'g'), '<name>');
      });
      s = s.replace(FILE_RE, function (f, ext, js) {
        if (!ext) return f;   // a token of an earlier pass
        if (OWN.test(f.replace(/^.*[\/]/, ''))) return f;   // Anvil's own files
        if (/^https?:|^app:/i.test(f)) return f;
        return '<file .' + ext.toLowerCase() + (js || '') + '>';
      });
      return s;
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function stamp(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds()); }
    function local(t) { var d = new Date(t); return stamp(t).replace('_', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2') + ' (UTC' + (d.getTimezoneOffset() > 0 ? '-' : '+') + pad(Math.floor(Math.abs(d.getTimezoneOffset()) / 60)) + ':' + pad(Math.abs(d.getTimezoneOffset()) % 60) + ')'; }
    function secs(ms) { return ms == null ? '' : (ms >= 10000 ? Math.round(ms / 1000) : Math.round(ms / 100) / 10) + ' s'; }
    var KIND_TEXT = { crash: 'Anvil crashed', 'not-responding': 'Anvil stopped responding', error: 'Anvil hit an error and carried on', manual: 'The user reported a problem' };
    // the one-sentence summary: "Anvil stopped responding for 18 s while Rebuild was running."
    function summary(r) {
      var op = (r.operation || [])[0], s = KIND_TEXT[r.kind] || ('Anvil problem (' + r.kind + ')');
      if (r.kind === 'not-responding') s += r.durationMs != null ? ' for ' + secs(r.durationMs) + (r.ongoing ? ' (and counting when this was written)' : '') : '';
      if (op && op.title) s += ' while ' + op.title + ' was running';
      else if (r.kind === 'not-responding' && r.lastCrumb) s += ' after: ' + r.lastCrumb;
      if (r.kind === 'crash' && r.crash && r.crash.reason) s += ' (' + r.crash.reason + (r.crash.exitCode != null ? ', exit code ' + r.crash.exitCode : '') + ')';
      if (r.kind === 'error' && r.error && r.error.message) s += ': ' + String(r.error.message).split('\n')[0].slice(0, 160);
      if (r.kind === 'not-responding' && r.where && r.where.kind === 'outside') s += ' (busy outside JavaScript: see Where it was stuck)';
      return s + '.';
    }
    function cell(t) { return String(t == null ? '' : t).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
    function frameLine(f) { return (f.fn || '(anonymous)') + '  ' + (f.file || '?') + (f.line != null ? ':' + f.line + (f.col != null ? ':' + f.col : '') : ''); }

    // ---- where it was stuck: a JavaScript loop, or a block outside JavaScript (lane freezerec, rfNZ) ----
    // A sample is the answer to one "pause" asked of the window (desktop/main.js): afterMs = when it was asked, lateMs =
    // how long the pause took to arrive. JavaScript that is running takes a pause within milliseconds. A pause that
    // arrives a second or more late had to wait: the main thread was not running JavaScript (painting, the graphics
    // card, layout, garbage collection, a synchronous call) and the stack is the first JavaScript that ran afterwards.
    var LATE_MS = 1000;
    function fkey(f) { return (f.fn || '(anonymous)') + ' (' + (f.file || '?') + ':' + f.line + ')'; }
    function pct(n) { return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + ' %'; }
    function cpuLine(procs) { return (procs || []).filter(function (p) { return p.cpu != null; }).map(function (p) { return p.name + ' ' + pct(p.cpu); }).join(', '); }
    // which process was working: one sentence for the reader
    function cpuReading(procs, outside) {
      var by = {}, top = null;
      (procs || []).forEach(function (p) { if (p.cpu == null) return; by[p.name] = (by[p.name] || 0) + p.cpu; if (!top || p.cpu > top.cpu) top = p; });
      if (!top) return '';
      var g = by.GPU || 0, w = by.window || 0;
      if (g >= 50 && w < 35) return 'The GPU process was the busy one (' + pct(g) + ' of one processor thread) while the window\'s own process was nearly idle (' + pct(w) + '): the graphics card or its driver was working (compiling a shader, or drawing something heavy) and the window was waiting for it.';
      if (w >= 50) return outside ? 'The window\'s own process was busy (' + pct(w) + ' of one processor thread) without running JavaScript: layout, painting, garbage collection, or work inside a browser call made by the JavaScript below (JSON, a structured clone, a regular expression, a sort).' : 'The window\'s own process was the busy one (' + pct(w) + ' of one processor thread).';
      if (top.cpu < 20) return 'No process of Anvil was busy (' + cpuLine(procs) + '): the window was waiting, not working: a synchronous request, a file, another process or a lock.';
      return 'The busiest process was ' + top.name + ' (' + pct(top.cpu) + ' of one processor thread); the window\'s own was at ' + pct(w) + (by.GPU != null ? ', the GPU process at ' + pct(g) : '') + '.';
    }
    // the frames of the page's own record (PerformanceObserver) that matter: the longest long frame, the longest task
    function longest(list) { var b = null; (list || []).forEach(function (x) { if (!b || x.ms > b.ms) b = x; }); return b; }
    function scriptLine(s) { return (s.invoker || '?') + (s.fn ? '  ' + s.fn : '') + (s.file ? '  (' + s.file + (s.pos != null && s.pos >= 0 ? ', character ' + s.pos : '') + ')' : '  (no file)') + '  ' + secs(s.ms) + (s.forcedLayoutMs >= 50 ? ' (of it forced layout ' + secs(s.forcedLayoutMs) + ')' : ''); }
    function pageReading(r) {
      var p = r.page, f = p && longest(p.longFrames);
      if (!p) return '';
      if (!f) {
        var t = longest(p.longTasks);
        if (t) return 'The page\'s own record has a long task of ' + secs(t.ms) + ' and no long frame' + (((r.where || {}).samples || []).length ? ' (the browser drops its frame record when a stack sample pauses inside the frame): the samples say where.' : ': the browser did not say which script.');
        return p.support === 'none' ? '' : 'The page\'s own record has no long frame and no long task over the freeze: the time did not go to its scripts or its rendering steps (it was in the browser\'s compositor, the graphics card, or a wait).';
      }
      var s0 = (f.scripts || [])[0], other = Math.max(0, f.ms - f.scriptMs - f.renderMs);
      var s = 'The page\'s own record: a frame of ' + secs(f.ms) + ' with script ' + secs(f.scriptMs) + ', rendering ' + secs(f.renderMs) + (f.layoutMs >= 50 ? ' (style and layout ' + secs(f.layoutMs) + ' of it)' : '') + (other >= 0.1 * f.ms ? ', neither ' + secs(other) : '') + '.';
      if (!s0 && ((r.where || {}).samples || []).length && other >= 0.5 * f.ms) s += ' (A stack sample paused inside this frame, and the browser then keeps no script times for it: the samples say where.)';
      if (s0 && f.scriptMs >= 0.5 * f.ms) s += ' The longest script: ' + scriptLine(s0) + '.';
      else if (f.renderMs >= 0.5 * f.ms) s += ' Most of it was rendering, not script.';
      return s;
    }
    // { kind: 'javascript' | 'outside' | 'mixed' | 'unknown', outsideMs, text }
    function verdict(r) {
      var w = r.where || {}, S = w.samples || [];
      var stacks = S.filter(function (s) { return s.frames && s.frames.length; });
      var timed = stacks.filter(function (s) { return s.lateMs != null && !s.cold; });
      var late = timed.filter(function (s) { return s.lateMs >= LATE_MS; }), prompt = timed.filter(function (s) { return s.lateMs < LATE_MS; });
      var waiting = S.filter(function (s) { return s.pending && s.waitingMs >= LATE_MS; });
      var out = { kind: 'unknown', outsideMs: 0, text: '' }, parts = [];
      var cpu = w.cpu && w.cpu.procs, pageSays = pageReading(r);
      function same(list) {
        var count = {}, order = [];
        list.forEach(function (s) { var seen = {}; s.frames.forEach(function (f) { var k = fkey(f); if (seen[k]) return; seen[k] = 1; if (!count[k]) { count[k] = 0; order.push(k); } count[k]++; }); });
        order.sort(function (a, b) { return count[b] - count[a]; });
        var tops = list.map(function (s) { return fkey(s.frames[0]); }), uniq = tops.filter(function (t, i) { return tops.indexOf(t) === i; });
        return (uniq.length === 1 ? 'Every sample with a stack (' + list.length + ') was stopped in the same place: ' + tops[0] + '.' : 'The top of the stack moved between samples (' + uniq.join('; ') + '): busy, but not in one place.') +
          ' Functions seen in most samples: ' + order.slice(0, 5).map(function (k) { return k + ' ×' + count[k]; }).join(', ') + '.';
      }
      if (late.length || waiting.length) {
        out.kind = prompt.length ? 'mixed' : 'outside';
        late.forEach(function (s) { out.outsideMs += s.lateMs; });
        waiting.forEach(function (s) { out.outsideMs += s.waitingMs; });
        parts.push('**Outside JavaScript.** The window\'s main thread was busy outside JavaScript for at least ' + secs(out.outsideMs) + (r.durationMs != null ? ' of the ' + secs(r.durationMs) : '') +
          ': painting, the graphics card, layout, garbage collection or a synchronous call.');
        late.forEach(function (s) {
          var top = fkey(s.frames[0]), i = S.indexOf(s) + 1;
          parts.push('The pause asked ' + secs(s.afterMs) + ' into the freeze could not be delivered for ' + secs(s.lateMs) + ': no JavaScript ran in that time.' + (s.entry
            ? ' The stack of sample ' + i + ' is the first JavaScript that ran afterwards (' + top + ', a callback that had only just been called: an event handler, a timer or an animation-frame callback). It is not where Anvil was stuck.'
            : ' The stack of sample ' + i + ' is the JavaScript that was waiting: ' + top + ' had just come back from a call that left JavaScript (a synchronous request, a WebGL call that waits for the graphics card, JSON, a structured clone, a regular expression, a sort); look at the statement just before that position.'));
        });
        waiting.forEach(function (s) { parts.push('The pause asked ' + secs(s.afterMs) + ' into the freeze had not been answered ' + secs(s.waitingMs) + ' later, when this was written: the main thread had run no JavaScript since.'); });
        if (prompt.length) parts.push('Other samples were answered at once, so JavaScript was running at those moments. ' + same(prompt));
        var cr = cpuReading(cpu, true);
        if (cr) parts.push(cr);
      } else if (stacks.length) {
        out.kind = timed.length ? 'javascript' : 'unknown';
        parts.push((timed.length ? '**JavaScript was running.** Every pause was answered at once (within ' + Math.max.apply(null, timed.map(function (s) { return s.lateMs; })) + ' ms), so the main thread was inside the JavaScript below. ' : '') + same(stacks));
        if (cpu && cpuLine(cpu)) parts.push(cpuReading(cpu, false));
      } else if (S.length) parts.push('No sample got a JavaScript stack.');
      if (pageSays) parts.push(pageSays);
      out.text = parts.join(' ');
      return out;
    }
    function whereSummary(r) { var v = verdict(r); if (r.where) r.where.kind = v.kind; return v.text; }
    function sampleHead(smp, i) {
      var s = 'Sample ' + (i + 1);
      if (smp.pending) s += ', asked ' + secs(smp.afterMs) + ' into the freeze: not answered after ' + secs(smp.waitingMs) + ' (the main thread has run no JavaScript since)';
      else if (smp.lateMs != null) s += ', asked ' + secs(smp.afterMs) + ' into the freeze, answered ' + (smp.lateMs < LATE_MS ? 'at once (' + smp.lateMs + ' ms)' : secs(smp.lateMs) + ' later (' + secs(smp.afterMs + smp.lateMs) + ' into the freeze, when the main thread ran JavaScript again)') + (smp.cold ? '; the debugger was switched on only then, so the wait says nothing' : '');
      else if (smp.afterMs != null) s += ', ' + secs(smp.afterMs) + ' into the freeze';
      return s + (smp.error ? ': ' + smp.error : '') + ':';
    }
    // "## What the page itself recorded": the browser's long-animation-frame / long-task entries over the freeze, WebGL
    // context events, the count of WebGL programs before and after
    function pageLines(r, L) {
      var p = r.page, t0 = r.freezeStart != null ? r.freezeStart : (r.durationMs != null ? r.at - r.durationMs : r.at);
      function rel(at) { return ((at - t0) / 1000).toFixed(1) + ' s'; }
      L.push('## What the page itself recorded');
      L.push('');
      L.push('(the browser\'s own long-animation-frame and long-task entries that overlap the freeze, read when the page answered again; times are seconds from the start of the freeze. A frame = the scripts it ran, then rendering: style, layout, paint.)');
      L.push('');
      if (!(p.longFrames || []).length && (p.longTasks || []).length) L.push('- no long frame' + (((r.where || {}).samples || []).length ? ' (the browser drops its frame record when a stack sample pauses inside the frame; the long task below is the same stretch)' : ' (the browser gave no frame record; the long task below is the same stretch)'));
      if (!(p.longFrames || []).length && !(p.longTasks || []).length) L.push('- no long frame and no long task' + (p.support === 'none' ? ' (this browser does not record them)' : ': the time did not go to the page\'s scripts or rendering steps'));
      (p.longFrames || []).forEach(function (f) {
        var other = Math.max(0, f.ms - f.scriptMs - f.renderMs);
        L.push('- frame from ' + rel(f.at) + ' to ' + rel(f.at + f.ms) + ' (' + secs(f.ms) + '): script ' + secs(f.scriptMs) + ', rendering ' + secs(f.renderMs) + (f.layoutMs >= 50 ? ' (style and layout ' + secs(f.layoutMs) + ' of it)' : '') + ', neither ' + secs(other) + (f.blockingMs ? '; blocking ' + secs(f.blockingMs) : ''));
        (f.scripts || []).forEach(function (s) { L.push('  - script: ' + scriptLine(s)); });
      });
      (p.longTasks || []).forEach(function (t) { L.push('- long task from ' + rel(t.at) + ' to ' + rel(t.at + t.ms) + ' (' + secs(t.ms) + ')'); });
      if (p.programs) L.push('- WebGL programs (compiled shaders): ' + p.programs.before + ' before, ' + p.programs.after + ' after' + (p.programs.after > p.programs.before ? ' (' + (p.programs.after - p.programs.before) + ' made during the freeze: a shader compile)' : ''));
      (p.graphics || []).forEach(function (g) { L.push('- ' + g.what + ' at ' + rel(g.at)); });
      if (p.gl) L.push('- WebGL now: ' + p.gl);
      L.push('');
    }
    function markdown(r) {
      var L = [];
      L.push('# Anvil problem report: ' + r.kind);
      L.push('');
      L.push('> For the reader (Claude): this is an Anvil problem report, written on the user\'s computer by Anvil itself.');
      L.push('> The source is the repository whose `CLAUDE.md` names the files (github.com/Impastanoodle/anvil: `anvil/` is the app, `desktop/` the Windows shell; `anvil/docs/INDEX.md` finds any function).');
      L.push('> Start from "Where it was stuck" and the last breadcrumbs. `report.json` in this folder holds the same, structured.');
      if (r.kind === 'not-responding') {
        L.push('> How to read a not-responding report: (1) each sample is one pause asked of the window, with how long the pause took to arrive. Answered at once = JavaScript was running, and the stack is where. Answered seconds late = the main thread was **outside JavaScript** (painting, the graphics card, layout, garbage collection, a synchronous call) and the stack is only the first JavaScript that ran afterwards.');
        L.push('> (2) The process table says who was working: a busy GPU process = a shader compile or a heavy draw; a busy window process with no JavaScript = layout, paint or garbage collection; nothing busy = waiting on a synchronous call or a lock. (3) "What the page itself recorded" splits the frozen frame into script and rendering time and names the scripts. (4) Breadcrumbs starting "graphics area:" / "key:" are what the hand did (no positions, no names); "slow frame" lines are hitches of 1 s or more that were not long enough for a report.');
      }
      L.push('');
      L.push('**What happened:** ' + (r.summary || summary(r)));
      L.push('');
      L.push('- Kind: `' + r.kind + '`');
      L.push('- When: ' + local(r.at) + ', ' + new Date(r.at).toISOString());
      L.push('- Anvil version: ' + (r.version || '?') + (r.app ? ' (' + r.app + ')' : ''));
      if (r.kind === 'not-responding') L.push('- How long it was frozen: ' + (r.durationMs != null ? secs(r.durationMs) + (r.ongoing ? ' so far (the window had not answered yet)' : '') : 'unknown'));
      if (r.startedAgo != null) L.push('- Anvil had been running for: ' + secs(r.startedAgo));
      L.push('- Privacy: file names, paths, part and document names, custom properties, note text and geometry are left out (kinds, sizes and counts instead)' + (r.files && r.files.model ? '; the user chose to include the model (`model.anvil.json`)' : '') + '.');
      if (r.userText) { L.push(''); L.push('## What the user wrote'); L.push(''); String(r.userText).split(/\r?\n/).forEach(function (l) { L.push('> ' + l); }); }
      L.push('');
      L.push('## Where it was stuck');
      L.push('');
      var w = r.where || {};
      if (w.note) { L.push(w.note); L.push(''); }
      // the verdict first (a JavaScript loop, or a block outside JavaScript), then the evidence
      if (w.summary) { L.push(w.summary); L.push(''); }
      (w.samples || []).forEach(function (smp, i) {
        L.push(sampleHead(smp, i));
        L.push('');
        if ((smp.frames || []).length) { L.push('```'); smp.frames.forEach(function (f, j) { L.push((j + 1) + '. ' + frameLine(f)); if (f.src) L.push('       ' + f.src); }); L.push('```'); }
        if (smp.procs && cpuLine(smp.procs)) L.push('Processor use in the ' + secs(smp.cpuMs) + ' up to this sample (percent of one processor thread): ' + cpuLine(smp.procs) + '.');
        L.push('');
      });
      if (w.cpu && (w.cpu.procs || []).length) {
        L.push('Which process was working (processor use as a percentage of one processor thread, over the ' + secs(w.cpu.ms) + ' from the last heartbeat to the end of the freeze; memory at the end):');
        L.push('');
        L.push('| process | processor | memory |');
        L.push('|---|---|---|');
        w.cpu.procs.forEach(function (p) { L.push('| ' + cell(p.name) + ' | ' + (p.cpu != null ? pct(p.cpu) : '?') + ' | ' + (p.mb != null ? p.mb + ' MB' : '?') + ' |'); });
        L.push('');
      }
      if (r.page) pageLines(r, L);
      if (r.error) {
        L.push('## The error');
        L.push('');
        L.push('```');
        L.push(String(r.error.message || ''));
        if (r.error.stack) L.push(String(r.error.stack));
        L.push('```');
        if (r.error.source) L.push('Caught by: ' + r.error.source);
        L.push('');
      }
      if (r.crash) { L.push('## The crash'); L.push(''); Object.keys(r.crash).forEach(function (k) { L.push('- ' + k + ': ' + r.crash[k]); }); L.push(''); }
      L.push('## Operation in progress');
      L.push('');
      if ((r.operation || []).length) r.operation.forEach(function (o) { L.push('- ' + o.title + (o.fraction != null ? ' — ' + Math.round(o.fraction * 100) + ' %' : ' — busy') + (o.text ? ' (' + o.text + ')' : '') + (o.runningMs != null ? ', running for ' + secs(o.runningMs) : '')); });
      else L.push(r.progressLoaded === false ? 'Not known (this Anvil has no progress tracking loaded).' : 'None reported (no loading bar was up).');
      L.push('');
      var cr = r.crumbs || [];
      L.push('## Last breadcrumbs (' + cr.length + ', oldest first)');
      L.push('');
      if (cr.length) {
        L.push('| time | s before the report | what |');
        L.push('|---|---|---|');
        cr.forEach(function (c) { L.push('| ' + cell(local(c.at).slice(11, 19)) + ' | ' + ((r.at - c.at) / 1000).toFixed(1) + ' | ' + cell(c.text) + (c.n > 1 ? ' (×' + c.n + ')' : '') + ' |'); });
      } else L.push('None recorded.');
      L.push('');
      var co = r.console || [];
      L.push('## Console errors and warnings (' + co.length + ', oldest first)');
      L.push('');
      if (co.length) { L.push('```'); co.forEach(function (c) { L.push(local(c.at).slice(11, 19) + ' ' + c.level.toUpperCase() + ' ' + String(c.text).replace(/\r?\n/g, '\n    ')); }); L.push('```'); }
      else L.push('None.');
      L.push('');
      L.push('## State');
      L.push('');
      var st = r.state || {};
      if (!Object.keys(st).length) L.push('Not available' + (r.stateNote ? ': ' + r.stateNote : '.'));
      else if (r.stateNote) L.push('(' + r.stateNote + ')');
      Object.keys(st).forEach(function (k) {
        var v = st[k];
        L.push('- ' + k + ': ' + (v && typeof v === 'object' ? JSON.stringify(v) : v));
      });
      if (r.stateAt && r.stateAt !== r.at) L.push('- (state taken ' + ((r.at - r.stateAt) / 1000).toFixed(1) + ' s before the report)');
      L.push('');
      L.push('## Files in this folder');
      L.push('');
      L.push('- `report.md` (this), `report.json` (the same, structured)');
      if (r.files && r.files.screenshot) L.push('- `screenshot.png`: the window' + (r.kind === 'not-responding' ? ' when it answered again' : ''));
      if (r.files && r.files.model) L.push('- `model.anvil.json`: the open document, included by the user (open it with File ▸ Open, or `anvil.load(json)`)');
      L.push('');
      L.push('## How to reproduce');
      L.push('');
      L.push('Run Anvil from the repository (`powershell -NoProfile -ExecutionPolicy Bypass -File anvil\\serve.ps1 -Port 8812`, or `npm start` in `desktop`), ' +
        (r.files && r.files.model ? 'load `model.anvil.json` (`anvil.load(json)` or File ▸ Open), ' : 'make a document like the one in State (counts by feature type), ') +
        'then replay the last breadcrumbs.');
      L.push('');
      return L.join('\n');
    }
    return { scrub: scrub, markdown: markdown, summary: summary, stamp: stamp, secs: secs, KIND_TEXT: KIND_TEXT, verdict: verdict, whereSummary: whereSummary, cpuReading: cpuReading, LATE_MS: LATE_MS };
  })();

  if (typeof module !== 'undefined' && module.exports) { module.exports = Format; return; }   // desktop/main.js
  var UI = root.UI;
  if (!UI) return;

  // ================================================================ the page side
  var App = UI.App;
  var T0 = Date.now();
  // a frame of a test page under /tests/ (the smoke suite): its own database and keys (as ui-profiles.js KEY)
  var TEST_FRAME = (function () { try { return !!(window.frameElement && /\/tests\//.test(window.parent.location.pathname)); } catch (e) { return false; } })();
  var DB_NAME = TEST_FRAME ? 'anvil-reports-test' : 'anvil-reports';
  var LS_WATCH = TEST_FRAME ? 'anvil.test.reports.watch' : 'anvil.reports.watch';
  var LS_BYE = TEST_FRAME ? 'anvil.test.reports.bye' : 'anvil.reports.bye';
  var RING = 200, CONSOLE_MAX = 100, BROWSER_KEEP = 10, FREEZE_MS = 3000, G_KEEP = 30, SLOW_MS = 1000;
  var crumbs = [], consoleRing = [], notes = {}, outbox = [], lastFlush = 0, flushTimer = null, lastSnapAt = 0;
  var G = { seq: 0, press: null, wheel: null, hover: null };   // gestures in progress (below)
  function desk() { var d = window.anvilDesktop; return d && d.reports ? d.reports : null; }
  function now() { return Date.now(); }

  // ---------------------------------------------------------------- breadcrumbs
  // one line of what the user or the program just did; the same line again within a second counts up instead
  // hand: a line about what the hand did (a key press): it counts as a gesture crumb (see "gestures" below)
  function crumb(text, sent, hand) {
    try {
      text = Format.scrub(String(text).replace(/\s+/g, ' ').trim().slice(0, 300));
      var t = now(), last = crumbs[crumbs.length - 1];
      if (!hand) gHoverEnd(t);   // a hover line ends where something else happens, so the lines stay in order
      if (last && last.text === text && t - last.at < 1000) { last.n = (last.n || 1) + 1; last.at = t; if (last.g != null) send(last); return; }
      var c = { at: t, text: text };
      if (hand) c.g = 'g' + (++G.seq);
      pushCrumb(c);
      if (!sent) send(c, hand === 'now');
    } catch (e) { /* a crumb never breaks the app */ }
  }
  // the ring: 200 lines, of which at most the newest G_KEEP are gesture lines (c.g), so a morning of orbiting and
  // hovering never pushes the commands out
  function pushCrumb(c) {
    crumbs.push(c);
    if (c.g != null) { var n = 0; for (var i = crumbs.length - 1; i >= 0; i--) if (crumbs[i].g != null && ++n > G_KEEP) crumbs.splice(i, 1); }
    if (crumbs.length > RING) crumbs.splice(0, crumbs.length - RING);
  }
  // queues a crumb for the main process / the watchdog worker; a gesture crumb is queued again when its text changes
  // (the same g rewrites the line there). urgent: at once, for the press or key that may be what freezes Anvil
  function send(c, urgent) {
    if (outbox.indexOf(c) < 0) outbox.push(c);
    if (urgent) { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } flush(); } else flushSoon();
  }
  function note(key, value) { if (value === undefined) delete notes[key]; else notes[key] = value; }
  // crumbs go to the desktop main process (desktop) or the watchdog worker (browser), at most every 250 ms, so they
  // survive a page that never comes back; the one right before a freeze is usually sent at once
  function flushSoon() {
    if (flushTimer) return;
    var wait = Math.max(0, 250 - (now() - lastFlush));
    if (!wait) { flush(); return; }
    flushTimer = setTimeout(function () { flushTimer = null; flush(); }, wait);
  }
  function flush() {
    lastFlush = now();
    var batch = outbox.splice(0).map(function (c) { return c.g != null ? { at: c.at, text: c.text, g: c.g, n: c.n } : { at: c.at, text: c.text }; });
    var d = desk(), extra = null;
    // with them, every 5 s or when an operation starts / ends: the state and the operation (the desktop main process
    // writes a not-responding report from these), only the operation for the browser's watchdog
    if (now() - lastSnapAt > 5000 || (batch.length && /^progress/.test(batch[batch.length - 1].text))) {
      lastSnapAt = now();
      extra = d ? { state: safe(snapshot, {}), operation: operation(), secrets: safe(secrets, []), progressLoaded: !!UI.progress } : { operation: operation() };
    }
    try {
      if (d) d.crumbs(batch, extra);
      else if (wd.worker) wd.worker.postMessage({ type: 'crumbs', list: batch, extra: extra });
    } catch (e) { /* gone */ }
  }
  function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }

  // ---------------------------------------------------------------- gestures: what the hand did (lane freezerec, rfNZ)
  // The freeze of 2026-11-16 came 29 s after the last breadcrumb: orbiting, zooming, hovering and clicking in the
  // graphics area left none. Now each gesture leaves one line, written when it starts (so it is there if that gesture
  // is what freezes Anvil) and rewritten as it goes on and ends: "graphics area: drag with the middle button (orbit)
  // 3.2 s", "wheel ×14 (zoom) 1.2 s", "click", "hover 14 s (pointer moving 2 s, idle 12 s)", "key: Ctrl+Z". Private by
  // construction: no positions, no names, a letter key is "a key", typing in a box is "typing in a box".
  // The listeners are on window in the capture phase, so they run before any handler of Anvil's.
  function evAt(e) {
    // when the hand made it, not when the page got to it (a click made during a freeze waits in the queue)
    var t = now();
    if (!e || !e.isTrusted || !(e.timeStamp > 0)) return t;
    var at = Math.round(t - (performance.now() - e.timeStamp));
    return at > t || t - at > 120000 ? t : at;
  }
  function lateNote(at) { var d = now() - at; return d >= 1000 ? ' (made ' + Format.secs(d) + ' before Anvil got to it)' : ''; }
  function area(t) {
    if (!t || !t.closest) return null;
    if (t.closest('button, input, select, textarea, a, [role=menuitem], #hud, .menu, #pm')) return null;
    if (t.closest('#drawing-sheet')) return 'drawing sheet';
    return t.closest('#viewport') ? 'graphics area' : null;
  }
  function gNew(text, at) { var c = { at: at, text: text, g: 'g' + (++G.seq) }; pushCrumb(c); return c; }
  function gSet(c, text, urgent) { if (c.text === text) return; c.text = text; send(c, urgent); }
  function dragText(p) { return p.area + ': drag with the ' + p.mods + p.b + ' button' + (p.nav ? ' (' + (p.nav === 'rotate' ? 'orbit' : p.nav) + ')' : ''); }
  function pressEnd(t, lost) {
    var p = G.press;
    if (!p) return;
    G.press = null;
    gSet(p.c, (p.moved ? dragText(p) + ' ' + Format.secs(Math.max(0, t - p.t0)) : p.area + ': ' + p.mods + (p.b === 'left' ? 'click' : p.b + ' click')) + (lost ? ' (the release was not seen)' : '') + p.late);
  }
  function onDown(e) {
    var a = area(e.target);
    if (!a) return;
    var t = evAt(e);
    if (G.press) pressEnd(t, true);
    gHoverEnd(t); wheelEnd();
    var b = e.button === 1 ? 'middle' : e.button === 2 ? 'right' : 'left';
    var nav = e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey) ? safe(function () { return UI.navActionFor ? UI.navActionFor(e) : null; }, null) : null;
    var mods = (e.ctrlKey ? 'Ctrl + ' : '') + (e.shiftKey ? 'Shift + ' : '') + (e.altKey ? 'Alt + ' : '');
    var p = G.press = { area: a, b: b, mods: mods, nav: nav, t0: t, x: e.clientX, y: e.clientY, moved: false, late: lateNote(t) };
    p.c = gNew(a + ': ' + mods + b + ' button pressed' + p.late, t);
    send(p.c, true);
  }
  function onMove(e) {
    var p = G.press;
    if (p) {
      if (!p.moved && Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 4) { p.moved = true; gSet(p.c, dragText(p) + ', in progress' + p.late); }
      return;
    }
    if (e.buttons) return;
    var a = area(e.target), t = evAt(e), h = G.hover;
    if (!a || (h && h.area !== a)) { gHoverEnd(t); h = null; if (!a) return; }
    if (!h) { G.hover = { c: null, area: a, t0: t, last: t, moveMs: 0, setAt: 0 }; return; }
    var dt = t - h.last;
    h.last = t;
    if (dt < 400) h.moveMs += Math.max(0, dt);
    if (!h.c) { if (h.moveMs >= 200) { h.c = gNew(a + ': hover (pointer moving)', h.t0); h.setAt = now(); send(h.c); } }
    else if (now() - h.setAt > 2000) { h.setAt = now(); gSet(h.c, hoverText(h, t)); }
  }
  function hoverText(h, t) {
    var total = Math.max(0, t - h.t0), idle = Math.max(0, total - h.moveMs);
    return h.area + ': hover ' + Format.secs(total) + ' (pointer moving ' + Format.secs(h.moveMs) + (idle >= 1000 ? ', idle ' + Format.secs(idle) : '') + ')';
  }
  function gHoverEnd(t) { var h = G.hover; if (!h) return; G.hover = null; if (h.c) gSet(h.c, hoverText(h, Math.max(t, h.last))); }
  function wheelText(w) { return w.area + ': wheel ×' + w.n + (w.area === 'graphics area' ? ' (zoom)' : '') + (w.last - w.t0 >= 100 ? ' ' + Format.secs(w.last - w.t0) : '') + w.late; }
  function wheelEnd() { var w = G.wheel; if (!w) return; G.wheel = null; clearTimeout(w.timer); gSet(w.c, wheelText(w)); }
  function onWheel(e) {
    var a = area(e.target);
    if (!a) return;
    var t = evAt(e), w = G.wheel;
    if (w && (t - w.last > 600 || w.area !== a)) { wheelEnd(); w = null; }
    if (!w) {
      gHoverEnd(t);
      w = G.wheel = { area: a, n: 1, t0: t, last: t, setAt: now(), late: lateNote(t) };
      w.c = gNew(wheelText(w), t);
      send(w.c, true);
    } else {
      w.n++; w.last = t;
      if (now() - w.setAt > 500) { w.setAt = now(); gSet(w.c, wheelText(w)); }
    }
    clearTimeout(w.timer);
    w.timer = setTimeout(wheelEnd, 650);
  }
  var KEY_NAMES = { ' ': 'Space', ArrowLeft: 'Left arrow', ArrowRight: 'Right arrow', ArrowUp: 'Up arrow', ArrowDown: 'Down arrow', Esc: 'Escape', Del: 'Delete' };
  function keyName(e) {
    var k = e.key || '';
    if (!k || k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'Unidentified' || k === 'Process' || k === 'Dead') return null;
    var t = e.target, box = !!(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable));
    var mods = (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.metaKey ? 'Meta+' : '');
    if (k.length === 1) {
      // a character: a shortcut is named (Ctrl+Z), anything else is only its kind
      if (mods && /^[a-z0-9]$/i.test(k)) return mods + (e.shiftKey ? 'Shift+' : '') + k.toUpperCase();
      if (box) return 'typing in a box';
      return mods + (k === ' ' ? 'Space' : /^[a-z]$/i.test(k) ? 'a key' : /^\d$/.test(k) ? 'a digit key' : 'a symbol key');
    }
    if (box && /^(Backspace|Delete|Del|Arrow\w+|Home|End)$/.test(k) && !mods) return 'typing in a box';
    return mods + (e.shiftKey ? 'Shift+' : '') + (KEY_NAMES[k] || k) + (box ? ' in a box' : '');
  }
  function onKey(e) {
    var k = keyName(e);
    if (!k) return;
    var t = evAt(e);
    gHoverEnd(t);
    // typing is one line for as long as it goes on (5 s between keys), so a note typed slowly is not thirty lines
    var last = crumbs[crumbs.length - 1];
    if (k === 'typing in a box' && last && last.text === 'key: typing in a box' && now() - last.at < 5000) { last.n = (last.n || 1) + 1; last.at = now(); send(last); return; }
    crumb('key: ' + k + lateNote(t), false, k === 'typing in a box' ? true : 'now');
  }
  function onTouch(e) { var a = area(e.target); if (a) crumb(a + ': touch (' + (e.touches ? e.touches.length : 1) + ' finger' + (e.touches && e.touches.length > 1 ? 's' : '') + ')', false, 'now'); }
  // the open gestures as they stand now (a report is about to read the crumbs)
  function gSync() { var t = now(), h = G.hover; if (h && h.c) gSet(h.c, hoverText(h, t)); if (G.wheel) gSet(G.wheel.c, wheelText(G.wheel)); }
  (function () {
    var o = { capture: true, passive: true };
    // only what the hand did: an event Anvil dispatches itself (a key passed on by ui-sketch.js) is not a gesture; in the
    // smoke suite's frame every event is a script's, and they count
    function on(type, fn) { window.addEventListener(type, function (e) { try { if (e.isTrusted || TEST_FRAME) fn(e); } catch (er) { /* a crumb never breaks the app */ } }, o); }
    on('mousedown', onDown); on('mousemove', onMove); on('mouseup', function (e) { pressEnd(evAt(e)); });
    on('wheel', onWheel); on('keydown', onKey); on('touchstart', onTouch);
    on('blur', function () { if (G.press) pressEnd(now(), true); gHoverEnd(now()); });
  })();

  // ---------------------------------------------------------------- long frames: what the page saw of its own slowness
  // PerformanceObserver gives, after the fact, every frame over 50 ms ("long-animation-frame": how long, how much of it
  // was script and which scripts, when rendering and style / layout started) and every long task. They are kept (the
  // last 40 over 200 ms) and (a) the ones that overlap a freeze go into its report, which is what tells a block in the
  // page's own rendering from one in the graphics card; (b) a hitch of 1 s or more that is not a freeze yet leaves a
  // "slow frame 2.4 s (script 0.1 s, render 2.3 s)" crumb, so a pattern of hitches before a freeze shows.
  var LF = { frames: [], tasks: [], gl: [], obs: [], progs: [], loaf: false, task: false, lastTick: now(), hidden: false, slow: [] };
  function entryAt(e) { return Math.round(now() - (performance.now() - e.startTime)); }
  function srcFile(u) {
    u = String(u || '').replace(/[?#].*$/, '');
    if (!u) return '';
    var o = location.origin + '/';
    return Format.scrub(u.indexOf(o) === 0 ? u.slice(o.length) : u).slice(0, 120);
  }
  function onLongFrame(e) {
    if (e.duration < 200) return;
    var st = e.startTime, scripts = [], scriptMs = 0;
    (e.scripts || []).forEach(function (s) {
      scriptMs += s.duration;
      if (s.duration >= 20) scripts.push({ invoker: Format.scrub(String(s.invoker || '')).slice(0, 80), type: s.invokerType || '', file: srcFile(s.sourceURL), fn: String(s.sourceFunctionName || '').slice(0, 80), pos: s.sourceCharPosition,
        ms: Math.round(s.duration), forcedLayoutMs: Math.round(s.forcedStyleAndLayoutDuration || 0), pauseMs: Math.round(s.pauseDuration || 0) });
    });
    scripts.sort(function (a, b) { return b.ms - a.ms; });
    var renderMs = e.renderStart ? Math.max(0, st + e.duration - e.renderStart) : 0;
    LF.frames.push({ at: entryAt(e), ms: Math.round(e.duration), blockingMs: Math.round(e.blockingDuration || 0), scriptMs: Math.round(Math.min(scriptMs, e.duration - renderMs)), renderMs: Math.round(renderMs),
      layoutMs: e.styleAndLayoutStart ? Math.round(Math.max(0, st + e.duration - e.styleAndLayoutStart)) : 0, scripts: scripts.slice(0, 6) });
    if (LF.frames.length > 40) LF.frames.shift();
  }
  function onLongTask(e) { if (e.duration < 200) return; LF.tasks.push({ at: entryAt(e), ms: Math.round(e.duration) }); if (LF.tasks.length > 40) LF.tasks.shift(); }
  function observe(type, fn) {
    try {
      if (!window.PerformanceObserver || (PerformanceObserver.supportedEntryTypes || []).indexOf(type) < 0) return false;
      var o = new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { try { fn(e); } catch (er) { } }); });
      o.observe({ type: type });
      LF.obs.push({ o: o, fn: fn });
      return true;
    } catch (e) { return false; }
  }
  LF.loaf = observe('long-animation-frame', onLongFrame);
  LF.task = observe('longtask', onLongTask);
  function glInfo() { return safe(function () { return UI.renderer && UI.renderer.info ? UI.renderer.info : null; }, null); }
  function glPrograms() { var i = glInfo(); return i && i.programs ? i.programs.length : null; }
  function glFacts() {
    var i = glInfo();
    if (!i) return null;
    var m = i.memory || {}, r = i.render || {};
    return 'programs ' + (i.programs ? i.programs.length : '?') + ', geometries ' + m.geometries + ', textures ' + m.textures + '; the last draw: ' + r.calls + ' calls, ' + r.triangles + ' triangles, ' + r.lines + ' line segments, ' + r.points + ' points';
  }
  ['webglcontextlost', 'webglcontextrestored'].forEach(function (type) {
    document.addEventListener(type, function () {
      var what = type === 'webglcontextlost' ? 'WebGL context lost' : 'WebGL context restored';
      LF.gl.push({ at: now(), what: what });
      if (LF.gl.length > 20) LF.gl.shift();
      crumb('graphics: ' + what);
    }, true);
  });
  // what the page recorded between two times (epoch ms): for a not-responding report, and for a slow-frame crumb
  function pageRecord(from, to) {
    LF.obs.forEach(function (x) { try { x.o.takeRecords().forEach(x.fn); } catch (e) { } });
    function hit(x) { return x.at <= to + 250 && x.at + x.ms >= from - 250 && x.ms >= 200; }
    var o = { longFrames: LF.frames.filter(hit), longTasks: LF.tasks.filter(hit), graphics: LF.gl.filter(function (g) { return g.at >= from - 2000 && g.at <= to + 2000; }),
      support: LF.loaf ? 'long-animation-frame' + (LF.task ? ', longtask' : '') : LF.task ? 'longtask' : 'none' };
    var before = null, after = glPrograms();
    LF.progs.forEach(function (p) { if (p.at <= from + 250) before = p.n; });
    if (before != null && after != null) o.programs = { before: before, after: after };
    var gl = glFacts();
    if (gl) o.gl = gl;
    return o;
  }
  function slowText(ms, rec) {
    function longest(l) { var b = null; l.forEach(function (x) { if (!b || x.ms > b.ms) b = x; }); return b; }
    var f = longest(rec.longFrames), t = longest(rec.longTasks), s;
    if (f && f.ms >= 0.5 * ms) {
      var other = Math.max(0, f.ms - f.scriptMs - f.renderMs), s0 = f.scripts[0];
      s = 'slow frame ' + Format.secs(f.ms) + ' (script ' + Format.secs(f.scriptMs) + ', render ' + Format.secs(f.renderMs) + (other >= 0.15 * f.ms ? ', neither ' + Format.secs(other) : '') +
        (s0 && s0.ms >= 0.5 * f.ms ? '; longest script ' + (s0.fn || s0.invoker || '?') + (s0.file ? ' in ' + s0.file : '') : '') + ')';
    } else if (t && t.ms >= 0.5 * ms) s = 'slow frame ' + Format.secs(ms) + ' (one task of ' + Format.secs(t.ms) + ', no script named)';
    else s = 'slow frame ' + Format.secs(ms) + ' (not in the page\'s scripts or rendering: the graphics card, the browser, or a wait)';
    if (rec.programs && rec.programs.after > rec.programs.before) s += '; WebGL programs ' + rec.programs.before + ' to ' + rec.programs.after;
    return s;
  }
  // every 250 ms: the gap since the last tick is how long the main thread was away (as the watchdog's heartbeat). A
  // hidden window's timers are slowed, so its gaps are not counted.
  function tick() {
    var t = now(), gap = t - LF.lastTick, hidden = !!document.hidden, was = LF.hidden;
    LF.lastTick = t; LF.hidden = hidden;
    var n = glPrograms(), lastP = LF.progs[LF.progs.length - 1];
    if (n != null && (!lastP || lastP.n !== n)) { LF.progs.push({ at: t, n: n }); if (LF.progs.length > 20) LF.progs.shift(); }
    if (hidden || was || gap - 125 < SLOW_MS || gap > 600000) return;
    var ms = gap - 125, from = t - gap + 60;
    // the browser's entries for the frame arrive just after it: read them a moment later
    setTimeout(function () {
      var rec = pageRecord(from, from + ms), text = slowText(ms, rec);
      LF.slow.push({ at: from, ms: ms, text: text });
      if (LF.slow.length > 20) LF.slow.shift();
      crumb(text);
    }, 300);
  }
  setInterval(tick, 250);

  // ---------------------------------------------------------------- console and errors
  function argText(a) {
    if (a == null) return String(a);
    if (typeof a === 'string') return a;
    if (a instanceof Error) return (a.name ? a.name + ': ' : '') + a.message + (a.stack ? '\n' + String(a.stack).split('\n').slice(1, 4).join('\n') : '');
    // an object: one level, a few keys (never a whole mesh or model serialised on a warning's path)
    if (typeof a === 'object') {
      try {
        var keys = Object.keys(a), name = a.constructor && a.constructor.name || 'Object';
        if (Array.isArray(a) || ArrayBuffer.isView(a)) return name + '(' + a.length + ')';
        return name + ' { ' + keys.slice(0, 8).map(function (k) { var v = a[k]; return k + ': ' + (v == null || typeof v !== 'object' ? String(v).slice(0, 60) : (v.constructor && v.constructor.name) || 'Object'); }).join(', ') + (keys.length > 8 ? ', …' : '') + ' }';
      } catch (e) { return Object.prototype.toString.call(a); }
    }
    return String(a);
  }
  function logConsole(level, args) {
    var text = Format.scrub(Array.prototype.map.call(args, argText).join(' ').slice(0, 1200));
    consoleRing.push({ at: now(), level: level, text: text });
    if (consoleRing.length > CONSOLE_MAX) consoleRing.splice(0, consoleRing.length - CONSOLE_MAX);
  }
  ['error', 'warn'].forEach(function (lv) {
    var orig = console[lv];
    if (typeof orig !== 'function' || orig._rp) return;
    var w = function () { try { logConsole(lv, arguments); } catch (e) { } return orig.apply(this, arguments); };
    w._rp = true;
    console[lv] = w;
  });
  var errorSeen = {};
  function errorInfo(err) {
    if (err && typeof err === 'object') return { message: Format.scrub((err.name && err.name !== 'Error' ? err.name + ': ' : '') + (err.message || String(err))), stack: err.stack ? Format.scrub(String(err.stack).split('\n').slice(0, 14).join('\n')) : null };
    return { message: Format.scrub(String(err)), stack: null };
  }
  function onError(err, source) {
    var info = errorInfo(err);
    info.source = source;
    crumb('error: ' + info.message.split('\n')[0].slice(0, 160));
    var key = info.message.slice(0, 300), t = now();
    if (errorSeen[key] && t - errorSeen[key] < 60000) return;   // never more than one report a minute for the same error
    errorSeen[key] = t;
    make('error', { error: info }).then(function (r) { if (r) offerQuiet(r); }, function () { });
  }
  window.addEventListener('error', function (e) {
    if (!e || (!e.message && !e.error)) return;   // a resource that failed to load (an <img>): not a script error
    onError(e.error || (e.message + (e.filename ? ' (' + String(e.filename).replace(/^.*\//, '') + ':' + e.lineno + ')' : '')), 'window.onerror (uncaught)');
  });
  window.addEventListener('unhandledrejection', function (e) { onError(e && e.reason, 'unhandledrejection (a promise rejected and nobody handled it)'); });
  // workers: their error events go in the console log and the crumbs (worker.js, the OpenCascade worker, previews)
  (function () {
    var W0 = window.Worker;
    if (!W0 || W0._rp) return;
    var Wrapped = function (url, opts) {
      var w = new W0(url, opts), name = String(url).replace(/^.*\//, '').replace(/\?.*$/, '');
      try { w.addEventListener('error', function (e) { var m = 'worker ' + name + ': ' + ((e && e.message) || 'error') + (e && e.lineno ? ' (line ' + e.lineno + ')' : ''); logConsole('error', [m]); crumb(m); }); } catch (er) { }
      return w;
    };
    Wrapped.prototype = W0.prototype;
    Wrapped._rp = true; Wrapped._orig = W0;
    window.Worker = Wrapped;
  })();

  // ---------------------------------------------------------------- the state summary
  var gpu = null;
  function gpuInfo() {
    if (gpu) return gpu;
    try {
      var gl = UI.renderer && UI.renderer.getContext && UI.renderer.getContext(), ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      gpu = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no WebGL';
    } catch (e) { gpu = 'unknown'; }
    return gpu;
  }
  function osName() {
    var ua = navigator.userAgent || '';
    var m = /Windows NT ([\d.]+)/.exec(ua);
    if (m) return 'Windows NT ' + m[1] + (navigator.userAgentData && navigator.userAgentData.platform ? ' (' + navigator.userAgentData.platform + ')' : '');
    if (/Mac OS X/.test(ua)) return 'macOS'; if (/Linux/.test(ua)) return 'Linux';
    return navigator.platform || 'unknown';
  }
  function version() { var d = window.anvilDesktop; return d && d.version ? d.version : 'web (browser)'; }
  function snapshot() {
    var m = App.model || {}, s = {};
    s['interface profile'] = safe(function () { return UI.Profiles && UI.Profiles.active ? UI.Profiles.active() : 'solidworks'; }, '?');
    s.theme = safe(function () { return UI.theme ? UI.theme() : document.documentElement.dataset.theme || 'light'; }, '?');
    var oc = safe(function () { return window.anvil && window.anvil.occt ? window.anvil.occt() : null; }, null);
    s.engine = 'built-in kernel' + (App.workerOn ? ' (rebuild worker on)' : ' (main thread)') +
      (oc && oc.on ? '; OpenCascade ' + (oc.engine === 'native' ? 'for Windows (native process)' : 'WebAssembly') + ', state ' + oc.state + (oc.driving ? ', driving' : '') + (oc.loadMs != null ? ', loaded in ' + Math.round(oc.loadMs) + ' ms' : '') : '; OpenCascade off');
    var drawing = safe(function () { return !!(UI.drawingActive && UI.drawingActive()); }, false);
    s.document = (m.type === 'assembly' ? 'assembly' : 'part') + (drawing ? ', a drawing open' : '') + (App.mode === 'sketch' ? ', editing a sketch' : '') + (App.dirty ? ', unsaved changes' : '') + (m.units ? ', units ' + m.units : '');
    var byType = {}, sketchEnts = 0, feats = m.features || [];
    feats.forEach(function (f) { byType[f.type] = (byType[f.type] || 0) + 1; if (f.type === 'sketch') sketchEnts += (f.entities || []).length; });
    s.features = feats.length + (feats.length ? ' (' + Object.keys(byType).sort().map(function (k) { return k + ' ' + byType[k]; }).join(', ') + ')' : '');
    if (m.type === 'assembly') s.components = (m.components || []).length;
    s['sketch entities'] = sketchEnts;
    var b = App.build, me = App.mesh;
    s.bodies = b && b.bodies ? (b.bodies.length != null ? b.bodies.length : Object.keys(b.bodies).length) : (me ? 1 : 0);
    s.faces = me && me.faces ? me.faces.length : 0;
    s.triangles = me ? (me.triCount != null ? me.triCount : (me.positions ? me.positions.length / 9 : 0)) : 0;
    s['rebuild errors'] = b && b.errors ? Object.keys(b.errors).length : 0;
    if (App.lastRebuildMs != null) s['last rebuild'] = Math.round(App.lastRebuildMs) + ' ms';
    var views = 0, sheets = 0;
    (m.drawings || []).forEach(function (d) { (d.sheets || [d]).forEach(function (sh) { sheets++; views += (sh.views || []).length; }); });
    s['drawing sheets / views'] = sheets + ' / ' + views;
    if (App.importPath || App.importKind) s['imported from'] = 'a ' + (String(App.importPath || App.importKind).match(/\.(\w+)$/) || [, 'file'])[1].toLowerCase() + ' file';
    s.window = window.innerWidth + ' × ' + window.innerHeight + ' px, device pixel ratio ' + (window.devicePixelRatio || 1);
    s.GPU = gpuInfo();
    var glf = glFacts();
    if (glf) s.WebGL = glf;
    var pm = performance && performance.memory;
    if (pm) s['JS memory'] = Math.round(pm.usedJSHeapSize / 1048576) + ' MB used of ' + Math.round(pm.jsHeapSizeLimit / 1048576) + ' MB';
    if (navigator.deviceMemory) s['device memory'] = navigator.deviceMemory + ' GB';
    s['CPU threads'] = navigator.hardwareConcurrency || '?';
    s['operating system'] = osName();
    s['running for'] = Format.secs(now() - T0);
    Object.keys(notes).forEach(function (k) { s[k] = notes[k]; });
    return s;
  }
  function operation() {
    var a = safe(function () { return UI.progress && UI.progress.active ? UI.progress.active() : []; }, []);
    return (a || []).map(function (o) { return { title: Format.scrub(o.title), fraction: o.fraction == null ? null : o.fraction, text: o.text ? Format.scrub(o.text) : null, runningMs: o.startedAt ? now() - o.startedAt : null }; });
  }
  // private strings of the open document: replaced by <name> wherever they show up in crumbs, console text, errors
  var SECRET_KEYS = { name: 1, text: 1, title: 1, fileName: 1, filePath: 1, value: 1, label: 1, note: 1, notes: 1, description: 1, partName: 1, file: 1, path: 1, company: 1, author: 1, customer: 1 };
  var COMMON = /^(front|top|right|back|bottom|left|isometric|sketch\d*|plane\d*|origin|part\d*|assem\d*|draw\d*|sheet\d*|default|none|true|false|steel|aluminum|[\d.\s\-+e]+|[A-Za-z\- \/]+\d+)$/i;
  function secrets() {
    var out = {}, m = App.model || {};
    function add(s) { if (typeof s === 'string' && s.length >= 3 && s.length < 300 && !COMMON.test(s.trim())) out[s] = 1; }
    function walk(o, depth, under) {
      if (!o || depth > 7) return;
      if (typeof o === 'string') { if (under) add(o); return; }
      if (Array.isArray(o)) { for (var i = 0; i < o.length && i < 2000; i++) walk(o[i], depth + 1, under); return; }
      if (typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) {
        if (k === 'entities' || k === 'profile' || k === 'mesh' || k === 'cache') return;
        var v = o[k];
        if (typeof v === 'string') { if (under || SECRET_KEYS[k]) add(v); }
        else walk(v, depth + 1, under || k === 'properties' || k === 'custom' || k === 'notes' || k === 'props');
      });
    }
    add(m.name);
    walk(m.properties, 0, true);
    walk(m.drawings, 0, false);
    walk(m.components, 0, false);
    (m.features || []).forEach(function (f) { add(f.name); if (f.type === 'sketch') (f.entities || []).forEach(function (e) { if (e && typeof e.text === 'string') add(e.text); }); });
    [App.fileName, App.filePath, App.importPath, App.drawingPath && App.drawingPath.path, App.drawingPath && App.drawingPath.name].forEach(function (p) {
      if (typeof p !== 'string') return;
      add(p); var base = p.replace(/^.*[\\\/]/, ''); add(base); add(base.replace(/(\.anvil)?\.\w+$/, ''));
    });
    return Object.keys(out).sort(function (a, b) { return b.length - a.length; });
  }

  // ---------------------------------------------------------------- reports
  function newId(kind, t) { return Format.stamp(t) + '_' + kind; }
  function build(kind, extra) {
    extra = extra || {};
    gSync();
    var t = now(), sec = secrets();
    function clean(s) { return s == null ? s : Format.scrub(s, sec); }
    var r = { format: 'anvil-problem-report', v: 1, kind: kind, at: t, version: version(), app: desk() ? 'Windows app' : 'browser',
      startedAgo: t - T0, durationMs: extra.durationMs != null ? extra.durationMs : null,
      where: extra.where || { note: kind === 'not-responding' ? 'No call stack: in a browser the page cannot see where its own main thread was stuck (the Windows app takes one from its main process). What the browser recorded about the frozen frame is below: how much of it was script, which script, how much rendering.' : 'No call stack needed: Anvil was running normally when this report was made' + (kind === 'error' ? '; the error\'s own stack is below.' : '.'), samples: [] },
      operation: extra.operation || operation(), progressLoaded: !!UI.progress,
      crumbs: crumbs.map(function (c) { return { at: c.at, text: clean(c.text), n: c.n || undefined }; }),
      console: consoleRing.map(function (c) { return { at: c.at, level: c.level, text: clean(c.text) }; }),
      state: safe(snapshot, {}), files: { screenshot: false, model: !!extra.includeModel } };
    r.stateAt = t;
    if (extra.error) r.error = { message: clean(extra.error.message), stack: clean(extra.error.stack), source: extra.error.source || null };
    if (extra.userText) r.userText = String(extra.userText).slice(0, 8000);
    if (extra.ongoing) r.ongoing = true;
    if (extra.lastCrumb) r.lastCrumb = clean(extra.lastCrumb);
    // a freeze: what the page itself recorded over it (long frames, long tasks, WebGL), and the reading of it
    if (kind === 'not-responding' && extra.startedAt != null) {
      r.freezeStart = extra.startedAt;
      r.page = cleanPage(pageRecord(extra.startedAt, extra.startedAt + (extra.durationMs || 0)), sec);
      r.where.summary = Format.whereSummary(r);
    }
    Object.keys(r.state).forEach(function (k) { if (typeof r.state[k] === 'string') r.state[k] = clean(r.state[k]); });
    r.summary = Format.summary(r);
    r.id = newId(kind, t);
    return r;
  }
  // every string of a page record scrubbed (script names, invokers)
  function cleanPage(rec, sec) { try { return JSON.parse(JSON.stringify(rec, function (k, v) { return typeof v === 'string' ? Format.scrub(v, sec) : v; })); } catch (e) { return null; } }
  function modelJson() { try { return JSON.stringify(App.model, null, 1); } catch (e) { return null; } }
  var made = [];   // this session's reports, newest last: { id, kind, at, summary, dir?, md }
  // builds and saves a report; resolves to { id, kind, summary, dir (desktop folder) | where: 'browser' }
  function make(kind, extra) {
    extra = extra || {};
    var r;
    try { r = build(kind, extra); } catch (e) { return Promise.reject(e); }
    var md = Format.markdown(r), d = desk(), model = extra.includeModel ? modelJson() : null;
    crumb('report saved: ' + kind);
    var info = { id: r.id, kind: kind, at: r.at, summary: r.summary, md: md, durationMs: r.durationMs, operation: r.operation };
    made.push(info);
    if (d) {
      return Promise.resolve(d.save({ id: r.id, json: JSON.stringify(r, null, 1), screenshot: extra.screenshot !== false && kind !== 'error', model: model }))
        .then(function (res) { info.dir = res && res.dir; info.where = 'folder'; return info; });
    }
    info.where = 'browser';
    return idbPut('reports', { id: r.id, kind: kind, at: r.at, summary: r.summary, md: md, json: r, model: model })
      .then(function () { return idbPrune(); }, function () { }).then(function () { return info; });
  }
  function list() {
    var d = desk();
    if (d) return Promise.resolve(d.list());
    return idbAll('reports').then(function (rows) {
      return rows.sort(function (a, b) { return b.at - a.at; }).map(function (x) { return { id: x.id, kind: x.kind, at: x.at, summary: x.summary, hasModel: !!x.model }; });
    }, function () { return made.slice().reverse().map(function (x) { return { id: x.id, kind: x.kind, at: x.at, summary: x.summary }; }); });
  }
  function readReport(info) {
    if (info.md) return Promise.resolve(info.md);
    var d = desk();
    if (d && info.dir) return Promise.resolve(d.read(info.dir)).then(function (t) { info.md = t; return t; });
    return idbGet('reports', info.id).then(function (x) { return x ? x.md : ''; });
  }
  function addModel(info) {
    var json = modelJson(), d = desk();
    if (!json) return Promise.resolve(false);
    crumb('report: model included');
    if (d && info.dir) return Promise.resolve(d.addModel(info.dir, json)).then(function (r) { info.md = null; return !!(r && r.ok); });
    return idbGet('reports', info.id).then(function (x) {
      if (!x) return false;
      x.model = json; x.json.files.model = true; x.md = Format.markdown(x.json); info.md = x.md;
      return idbPut('reports', x).then(function () { return true; });
    });
  }

  // ---------------------------------------------------------------- IndexedDB (browser: reports, watchdog sessions)
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
      var q = indexedDB.open(DB_NAME, 1);
      q.onupgradeneeded = function () { var d = q.result; if (!d.objectStoreNames.contains('reports')) d.createObjectStore('reports', { keyPath: 'id' }); if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' }); };
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
    dbP.catch(function () { dbP = null; });
    return dbP;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        out = fn(s);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function idbPut(store, v) { return tx(store, 'readwrite', function (s) { s.put(v); }); }
  function idbGet(store, id) { return tx(store, 'readonly', function (s) { return s.get(id); }); }
  function idbAll(store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); }
  function idbDel(store, id) { return tx(store, 'readwrite', function (s) { s.delete(id); }); }
  function idbPrune() {
    return idbAll('reports').then(function (rows) {
      rows.sort(function (a, b) { return b.at - a.at; });
      return Promise.all(rows.slice(BROWSER_KEEP).map(function (x) { return idbDel('reports', x.id); }));
    });
  }

  // ---------------------------------------------------------------- not responding: the browser watchdog worker
  // reports-watchdog.js gets a heartbeat every 250 ms; a gap over 3 s is a freeze. It keeps the crumbs and the open
  // freeze in IndexedDB, so a tab closed while frozen is reported on the next load.
  var wd = { worker: null, timer: null, session: null, lastBeat: 0, freezes: [] };
  function watchOn() { try { return localStorage.getItem(LS_WATCH) !== '0'; } catch (e) { return true; } }
  function startWatchdog() {
    if (desk() || wd.worker || !watchOn()) return;
    var W0 = window.Worker && (window.Worker._orig || window.Worker);
    if (!W0) return;
    try { wd.worker = new W0('reports-watchdog.js'); } catch (e) { wd.worker = null; return; }
    wd.session = 's' + now().toString(36) + Math.random().toString(36).slice(2, 7);
    wd.worker.onmessage = function (e) { var m = e.data || {}; if (m.type === 'freeze') onBrowserFreeze(m); };
    wd.worker.onerror = function () { stopWatchdog(); };
    wd.worker.postMessage({ type: 'start', session: wd.session, db: DB_NAME, freezeMs: FREEZE_MS, crumbs: crumbs.slice(-RING) });
    // the page's own measure: the gap between two ticks of this timer, which a busy main thread delays
    wd.lastBeat = now();
    wd.timer = setInterval(beat, 250);
    // a clean end (closed, reloaded, navigated away) is written down; a session record without it is an unclean end
    window.addEventListener('pagehide', function () {
      try { var b = JSON.parse(localStorage.getItem(LS_BYE) || '[]'); b.push(wd.session); localStorage.setItem(LS_BYE, JSON.stringify(b.slice(-20))); } catch (e) { }
    });
    checkLastSession();
  }
  // a hidden tab's timers are slowed (to once a minute after 5 minutes): the worker does not count gaps while hidden,
  // and the first beat after the tab shows again starts afresh
  function beat() {
    var t = now(), gap = t - wd.lastBeat, hidden = !!document.hidden;
    wd.lastBeat = t;
    if (wd.hidden) gap = 0;
    wd.hidden = hidden;
    if (wd.worker) wd.worker.postMessage({ type: 'hb', t: t, gap: hidden ? 0 : gap, hidden: hidden });
  }
  document.addEventListener('visibilitychange', function () { if (wd.worker) beat(); });
  function stopWatchdog() {
    if (wd.timer) clearInterval(wd.timer);
    if (wd.worker) { try { wd.worker.postMessage({ type: 'stop' }); wd.worker.terminate(); } catch (e) { } }
    wd.worker = null; wd.timer = null;
  }
  // ---------------------------------------------------------------- Print: a wait, not a freeze (rfOF)
  // window.print() does not return until the system's Print box is closed: the page's main thread waits outside
  // JavaScript for as long as the user looks at the box. That was the "stopped responding for 9.6 s" report of
  // 2026-11-16 (the Print button of the Standard toolbar; no breadcrumb, a one-frame stack). The wait is announced
  // with a breadcrumb that is sent at once, the not-responding watch (main.js in the app, the worker in a browser)
  // stands by until the page runs again, and the page's own slow-frame clock starts afresh, so the wait leaves no
  // "slow frame" line and no report. beforeprint / afterprint cover a print started any other way (the browser's menu).
  var WAIT = { on: false, own: false, at: 0, what: '' };
  function waitTell(on) {
    try { var d = desk(); if (d) { if (d.waiting) d.waiting(on); } else if (wd.worker) wd.worker.postMessage({ type: 'wait', on: on }); } catch (e) { /* gone */ }
  }
  function waitBegin(what) {
    if (WAIT.on) return;
    WAIT.on = true; WAIT.at = now(); WAIT.what = what;
    crumb(what + ': the ' + what + ' box is open (Anvil waits until it is closed)');
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flush();
    waitTell(true);
  }
  function waitEnd() {
    if (!WAIT.on) return;
    WAIT.on = false;
    var t = now();
    LF.lastTick = t; wd.lastBeat = t;
    waitTell(false);
    crumb(WAIT.what + ': the ' + WAIT.what + ' box closed after ' + Format.secs(t - WAIT.at));
  }
  function printDoc() {
    WAIT.own = true;
    waitBegin('Print');
    try { window.print(); } finally { WAIT.own = false; waitEnd(); }
  }
  window.addEventListener('beforeprint', function () { waitBegin('Print'); });
  window.addEventListener('afterprint', function () { if (!WAIT.own) waitEnd(); });

  // the worker saw a gap: { ms (the gap between heartbeats less one interval), startedAt, crumbs (its copy) }
  function onBrowserFreeze(m) {
    var ms = Math.max(0, m.ms);
    wd.freezes.push({ at: m.startedAt, ms: ms });
    var last = null;
    for (var i = crumbs.length - 1; i >= 0; i--) if (crumbs[i].at <= m.startedAt + 50 && !/^slow frame /.test(crumbs[i].text)) { last = crumbs[i].text; break; }
    crumb('not responding for ' + Format.secs(ms));
    var fz = wd.freezes[wd.freezes.length - 1];
    // the browser's long-frame entries for the frozen frame arrive just after it: the report is made a moment later
    setTimeout(function () {
      make('not-responding', { durationMs: ms, startedAt: m.startedAt, lastCrumb: last, operation: m.operation || operation(), screenshot: false }).then(function (info) {
        fz.report = info;
        if (m.session && wd.worker) wd.worker.postMessage({ type: 'reported', at: m.startedAt });
        offer(info);
      }, function () { });
    }, 350);
  }
  function checkLastSession() {
    var bye = [];
    try { bye = JSON.parse(localStorage.getItem(LS_BYE) || '[]'); } catch (e) { }
    return idbAll('sessions').then(function (rows) {
      var t = now(), found = [];
      rows.forEach(function (s) {
        if (s.id === wd.session || t - (s.lastSeen || 0) < 10000) return;   // this page, or another tab still alive
        idbDel('sessions', s.id);
        if (bye.indexOf(s.id) >= 0 || !s.freeze || s.freeze.reported) return;
        // the tab was closed (or the browser killed) while frozen: report it now from what the worker kept
        var r = { format: 'anvil-problem-report', v: 1, kind: 'not-responding', at: t, version: version(), app: 'browser', durationMs: (s.lastSeen || t) - s.freeze.since, ongoing: true,
          where: { note: 'Anvil did not respond and the tab was closed (or the browser ended) before it answered again. No call stack: a browser page cannot see where its own main thread was stuck.', samples: [] },
          operation: s.operation || [], crumbs: (s.crumbs || []).map(function (c) { return { at: c.at, text: Format.scrub(c.text), n: c.n }; }), console: [], state: {}, stateNote: 'the page never came back, so it could not describe itself; this is a new page', files: { screenshot: false, model: false } };
        r.summary = 'Anvil stopped responding for at least ' + Format.secs(r.durationMs) + ' and the tab was closed' + (r.operation[0] ? ' while ' + r.operation[0].title + ' was running' : '') + '.';
        r.id = newId('not-responding', t);
        var md = Format.markdown(r), info = { id: r.id, kind: r.kind, at: t, summary: r.summary, md: md, where: 'browser', previous: true, durationMs: r.durationMs, operation: r.operation };
        made.push(info);
        found.push(info);
        idbPut('reports', { id: r.id, kind: r.kind, at: t, summary: r.summary, md: md, json: r, model: null }).then(idbPrune).then(function () { offer(info); }, function () { });
      });
      return found;
    }, function () { return []; });
  }

  // ---------------------------------------------------------------- what the user sees
  // in a test frame (the smoke suite) a report is still made, but nothing shows unless a test asks (UI.reports.testBars):
  // a slow step of another group must not put a bar or a status item over what it clicks
  function shows() { return !TEST_FRAME || api.testBars; }
  function offer(info) { if (shows()) show(info); }
  function offerQuiet(info) { if (shows()) quietItem(info); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var bar = null;
  function headline(info) {
    if (info.kind === 'not-responding') {
      var op = (info.operation || [])[0];
      return (info.previous ? 'Anvil did not respond last time and was closed' + (info.durationMs ? ' (frozen for at least ' + Format.secs(info.durationMs) + ')' : '') : 'Anvil stopped responding for ' + Format.secs(info.durationMs || 0)) +
        (op ? ' while ' + op.title + ' was running' : '') + '. A report was saved.';
    }
    if (info.kind === 'crash') return (info.previous ? 'Anvil crashed last time' : 'Anvil\'s window crashed and was reloaded') + '. A report was saved.';
    if (info.kind === 'error') return 'Anvil hit an error and carried on. A report was saved.';
    return 'Your problem report was saved.';
  }
  function copyText(text) {
    api.lastCopied = text;
    var d = desk();
    if (d && d.copy) return Promise.resolve(d.copy(text)).then(function () { return true; });
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    return Promise.resolve(fallback());
    function fallback() {
      try { var ta = el('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
    }
  }
  function forClaude(info) {
    var what = { 'not-responding': 'Anvil stopped responding', crash: 'Anvil crashed', error: 'Anvil hit an error', manual: 'I found a problem in Anvil' }[info.kind] || 'Anvil had a problem';
    if (info.dir) return what + '; please find the cause and fix it. The report is in ' + info.dir + ' — read report.md in that folder.';
    return what + '; please find the cause and fix it. Anvil was running in a browser, so the report is pasted below (report.md).\n\n' + (info.md || '');
  }
  function show(info) {
    hide();
    var b = el('div', 'rp-bar rp-' + info.kind);
    b.id = 'rp-bar';
    b.setAttribute('role', 'alertdialog');
    b.appendChild(el('span', 'rp-text', headline(info)));
    var btns = el('span', 'rp-btns');
    function button(label, fn, cls) { var x = el('button', 'btn' + (cls ? ' ' + cls : ''), label); x.type = 'button'; x.addEventListener('click', fn); btns.appendChild(x); return x; }
    var copy = button('Copy for Claude', function () {
      readReport(info).then(function () { return copyText(forClaude(info)); }).then(function (ok) { copy.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { copy.textContent = 'Copy for Claude'; }, 2500); });
    }, 'primary');
    copy.dataset.rp = 'copy';
    if (desk() && info.dir) button('Open folder', function () { desk().openFolder(info.dir); }).dataset.rp = 'folder';
    button('View report', function () { viewReport(info); }).dataset.rp = 'view';
    if (!desk()) button('Download', function () { download(info); }).dataset.rp = 'download';
    var lab = el('label', 'rp-model'), cb = el('input');
    cb.type = 'checkbox'; cb.dataset.rp = 'model'; cb.checked = !!info.modelAdded;
    cb.addEventListener('change', function () {
      if (!cb.checked || info.modelAdded) { cb.checked = !!info.modelAdded; return; }
      cb.disabled = true;
      addModel(info).then(function (ok) { info.modelAdded = !!ok; cb.checked = !!ok; cb.disabled = !!ok; });
    });
    lab.appendChild(cb);
    lab.appendChild(el('span', null, 'Include the model'));
    lab.title = 'Adds the open document (model.anvil.json) to this report so the problem can be reproduced. It stays on this computer.';
    btns.appendChild(lab);
    button('Dismiss', hide).dataset.rp = 'dismiss';
    b.appendChild(btns);
    b.appendChild(el('div', 'rp-sub', 'Include the model adds the open document to the report so it can be reproduced; it stays on this computer.' + (info.dir ? '' : ' Anvil is running in a browser: the report is kept in this browser (newest 10).')));
    var host = document.getElementById('app') || document.body;
    host.appendChild(b);
    var rb = document.getElementById('ribbon'), r = rb && rb.getBoundingClientRect();
    b.style.top = Math.round(r && r.bottom > 0 ? r.bottom + 4 : 60) + 'px';
    bar = { el: b, info: info };
    api.current = info;
    return b;
  }
  function hide() { if (bar && bar.el.parentNode) bar.el.parentNode.removeChild(bar.el); bar = null; }
  // an error (caught and carried on from): no bar, a quiet "Report saved" in the status bar that opens the same bar
  var qi = null;
  function quietItem(info) {
    if (!qi) {
      qi = el('button', 'rp-status', 'Report saved');
      qi.type = 'button'; qi.id = 'rp-status';
      qi.title = 'Anvil saved a problem report. Click for Copy for Claude.';
      qi.addEventListener('click', function () { var i = qi._info; qi.remove(); qi = null; if (i) show(i); });
      window.addEventListener('resize', placeQuiet);
    }
    qi._info = info;
    qi.textContent = info.kind === 'error' ? 'Report saved' : 'Report saved (' + info.kind + ')';
    (document.getElementById('app') || document.body).appendChild(qi);
    placeQuiet();
  }
  function placeQuiet() {
    if (!qi || !qi.parentNode) return;
    var sr = document.getElementById('status-right'), sb = document.getElementById('statusbar');
    var r = sr && sr.getBoundingClientRect(), rb = sb && sb.getBoundingClientRect();
    qi.style.right = Math.max(0, Math.round(window.innerWidth - (r && r.width ? r.left : window.innerWidth - 300) + 6)) + 'px';
    qi.style.bottom = Math.max(0, Math.round(window.innerHeight - (rb ? rb.bottom : window.innerHeight))) + 'px';
    qi.style.height = Math.round(rb && rb.height ? rb.height : 22) + 'px';
  }
  function viewReport(info) {
    readReport(info).then(function (md) {
      var pre = el('pre', 'rp-view', md || '(empty)');
      UI.showModal({ title: 'Problem report', body: pre, buttons: [
        { label: 'Copy for Claude', primary: true, action: function () { copyText(forClaude(info)); } },
        { label: 'Close', action: function () { UI.closeModal(); } }
      ] });
    });
  }
  function download(info) {
    readReport(info).then(function (md) {
      var a = el('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = 'anvil-report-' + info.id + '.md';
      document.body.appendChild(a); a.click(); a.remove();
      if (info.modelAdded) idbGet('reports', info.id).then(function (x) {
        if (!x || !x.model) return;
        var m = el('a'); m.href = URL.createObjectURL(new Blob([x.model], { type: 'application/json' })); m.download = 'anvil-report-' + info.id + '.model.anvil.json';
        document.body.appendChild(m); m.click(); m.remove();
      });
    });
  }
  // Help ▸ Report a Problem…: what went wrong in the user's words, Include the model, then a manual report
  function dialog() {
    var body = el('div', 'rp-dialog');
    body.appendChild(el('p', null, 'Describe what went wrong (what you did, what you expected, what happened). Anvil adds what it was doing and a screenshot, and saves the report on this computer.'));
    var ta = el('textarea'); ta.id = 'rp-text'; ta.rows = 6; ta.placeholder = 'For example: I clicked Edge Flange on the top edge and the flange came out on the wrong side.';
    body.appendChild(ta);
    var lab = el('label', 'rp-model'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'rp-include-model';
    lab.appendChild(cb); lab.appendChild(el('span', null, ' Include the model'));
    body.appendChild(lab);
    body.appendChild(el('p', 'dlg-note', 'Include the model adds the open document (model.anvil.json) so the problem can be reproduced. It stays on this computer. Without it, the report has no file names, part names, properties or geometry.'));
    crumb('Report a Problem opened');
    UI.showModal({ title: 'Report a Problem', body: body, buttons: [
      { label: 'Save report', primary: true, action: function () {
        var text = ta.value, inc = cb.checked;
        UI.closeModal();
        // a frame for the dialog to go before the screenshot
        setTimeout(function () {
          make('manual', { userText: text, includeModel: inc }).then(function (info) { info.modelAdded = inc; show(info); }, function (e) { UI.toast('The report could not be saved: ' + ((e && e.message) || e)); });
        }, 120);
      } },
      { label: 'Cancel', action: function () { UI.closeModal(); } }
    ] });
    setTimeout(function () { try { ta.focus(); } catch (e) { } }, 0);
  }
  // Tools ▸ Options (Task Pane props): where reports are kept, Open folder, how many, the not-responding switch
  function optionsSection() {
    var box = el('div', 'rp-options'); box.dataset.role = 'reports';
    box.appendChild(el('h3', null, 'Reports'));
    var where = el('p', 'rp-where', desk() ? 'Problem reports are saved in the reports folder (the newest 30 are kept).' : 'Problem reports are kept in this browser (the newest 10); each can be downloaded or copied.');
    box.appendChild(where);
    var row = el('div', 'rp-row');
    if (desk()) {
      Promise.resolve(desk().folder()).then(function (f) { if (f) where.textContent = 'Problem reports are saved in ' + f + ' (the newest 30 are kept).'; });
      var ob = el('button', 'btn', 'Open folder'); ob.type = 'button'; ob.addEventListener('click', function () { desk().openFolder(); }); row.appendChild(ob);
    }
    var rb = el('button', 'btn', 'Report a Problem…'); rb.type = 'button'; rb.addEventListener('click', dialog); row.appendChild(rb);
    box.appendChild(row);
    var lab = el('label', 'rp-watch'), cb = el('input'); cb.type = 'checkbox'; cb.checked = watchOn(); cb.dataset.rp = 'watch';
    cb.addEventListener('change', function () { setWatch(cb.checked); });
    lab.appendChild(cb); lab.appendChild(el('span', null, ' Watch for Anvil not responding (writes a report after a freeze)'));
    box.appendChild(lab);
    return box;
  }
  function setWatch(on) {
    try { if (on) localStorage.removeItem(LS_WATCH); else localStorage.setItem(LS_WATCH, '0'); } catch (e) { }
    var d = desk();
    if (d && d.setWatch) d.setWatch(!!on);
    if (!d) { if (on) startWatchdog(); else stopWatchdog(); }
    crumb('not-responding watch ' + (on ? 'on' : 'off'));
  }

  // ---------------------------------------------------------------- desktop: heartbeat and reports from main
  function startDesktop() {
    var d = desk();
    if (!d) return;
    if (d.setWatch) d.setWatch(watchOn());
    // main.js found a freeze (and has written its report), a crash, or one from the last run: complete it with what
    // only the page knows (the state now, the console), then offer it
    d.onReport(function (m) {
      if (!m) return;
      var info = { id: m.id, kind: m.kind, dir: m.dir, durationMs: m.durationMs, operation: m.operation || [], summary: m.summary, previous: !!m.previous, where: 'folder' };
      made.push(info);
      gSync();
      var page = m.kind === 'not-responding' && m.startedAt != null ? safe(function () { return pageRecord(m.startedAt, m.startedAt + (m.durationMs || 0)); }, null) : null;
      var fill = !m.previous && d.complete ? Promise.resolve(d.complete(m.dir, { state: safe(snapshot, {}), console: consoleRing.slice(), crumbs: crumbs.map(function (c) { return { at: c.at, text: c.text, n: c.n }; }), secrets: secrets(), page: page })) : Promise.resolve();
      fill.then(function () { }, function () { }).then(function () { crumb('report saved: ' + m.kind); if (m.quiet) offerQuiet(info); else offer(info); });
    });
    flush();
  }

  // ---------------------------------------------------------------- hooks (install() from boot, after every file)
  function wrap(obj, name, before, after) {
    var f = obj && obj[name];
    if (typeof f !== 'function' || f._rp) return;
    var w = function () {
      try { before && before.apply(this, arguments); } catch (e) { }
      var r = f.apply(this, arguments);
      try { after && after.call(this, r, arguments); } catch (e) { }
      return r;
    };
    w._rp = true;
    for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k) && !(k in w)) w[k] = f[k];
    obj[name] = w;
  }
  function ext(name) { var m = /\.([A-Za-z0-9_]{1,8})(\.json)?$/.exec(String(name || '')); return m ? '.' + m[1].toLowerCase() + (m[2] || '') : '(no extension)'; }
  function size(data) {
    var n = data == null ? 0 : typeof data === 'string' ? data.length : data.byteLength != null ? data.byteLength : data.size != null ? data.size : data.length || 0;
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' bytes';
  }
  // rebuild start / end with its duration (ui-core.js UI.rebuild: the same promise is returned)
  (function () {
    var core = UI.rebuild;
    if (typeof core !== 'function') return;
    UI.rebuild = function (opts) {
      var t0 = now();
      crumb('rebuild started' + (opts && opts.sync ? ' (main thread)' : '') + (App.model && App.model.type === 'assembly' ? ' (assembly)' : ''));
      var r;
      try { r = core.apply(this, arguments); }
      catch (e) { crumb('rebuild failed after ' + (now() - t0) + ' ms: ' + ((e && e.message) || e)); throw e; }
      if (r && typeof r.then === 'function') r.then(function () { crumb('rebuild done in ' + (now() - t0) + ' ms'); }, function (e) { crumb('rebuild failed after ' + (now() - t0) + ' ms: ' + ((e && e.message) || e)); });
      return r;
    };
    UI.rebuild._rp = true;
  })();
  var installed = false;
  function install() {
    if (installed) return;
    installed = true;
    wrap(UI, 'setTool', function (name) { crumb('tool: ' + name); });
    wrap(UI, 'setTheme', function (name) { crumb('theme: ' + name); });
    wrap(UI, 'openFileData', function (name, data) { crumb('file opened: ' + ext(name) + ', ' + size(data)); });
    var inDownload = false;
    var dl = UI.download;
    if (typeof dl === 'function' && !dl._rp) {
      UI.download = function (name, data) { crumb('file saved / exported: ' + ext(name) + ', ' + size(data)); inDownload = true; try { return dl.apply(this, arguments); } finally { inDownload = false; } };
      UI.download._rp = true;
    }
    wrap(UI, 'loadModel', function (m) { crumb('document loaded: ' + ((m && m.type) || 'part') + ', ' + ((m && m.features) || []).length + ' features'); });
    wrap(UI, 'undo', function () { crumb('undo'); });
    wrap(UI, 'redo', function () { crumb('redo'); });
    wrap(UI, 'makeDrawing', function () { crumb('drawing opened'); });
    wrap(UI, 'closeDrawing', function () { crumb('drawing closed'); });
    wrap(UI, 'setRibbonTab', function (name) { crumb('CommandManager tab: ' + name); });
    if (UI.Profiles && UI.Profiles.onChange) UI.Profiles.onChange(function () { crumb('interface profile: ' + safe(function () { return UI.Profiles.active(); }, '?')); });
    if (UI.onBuild && UI.onBuild.push) UI.onBuild.push(function (b, opts) { if (opts && opts.occt) crumb('OpenCascade build applied'); });
    // a download made without UI.download (an <a download> clicked by any file): kind and size only
    var blobSize = {};
    var cou = URL.createObjectURL;
    if (cou && !cou._rp) { URL.createObjectURL = function (b) { var u = cou.apply(URL, arguments); try { if (b && b.size != null) blobSize[u] = b.size; } catch (e) { } return u; }; URL.createObjectURL._rp = true; }
    var ac = HTMLAnchorElement.prototype.click;
    if (!ac._rp) { HTMLAnchorElement.prototype.click = function () { try { if (this.download && !inDownload && !/^anvil-report-/.test(this.download)) crumb('file saved / exported: ' + ext(this.download) + (blobSize[this.href] != null ? ', ' + size({ byteLength: blobSize[this.href] }) : '')); } catch (e) { } return ac.apply(this, arguments); }; HTMLAnchorElement.prototype.click._rp = true; }
    // the desktop bridge (preload.js) tells the page about Open / Save boxes and dropped files: it has already sent them
    // to the main process ("\u0001" first), so they only go in this page's ring
    window.addEventListener('anvil-desktop-crumb', function (e) { var t = e && e.detail; if (typeof t === 'string') crumb(t.replace(/^\u0001/, ''), t.charAt(0) === '\u0001'); });
    crumb('Anvil started (' + version() + ', ' + (desk() ? 'Windows app' : 'browser') + ')');
    if (desk()) startDesktop(); else startWatchdog();
  }
  // PropertyManagers (ui-commands.js: one line in openPM, pmOK, pmCancel)
  function pm(what, spec) {
    var t = spec && (spec.title || spec.icon) || '?';
    crumb('PropertyManager ' + what + ': ' + String(t).replace(/<[^>]*>/g, '').slice(0, 60));
  }

  var api = {
    crumb: function (t) { crumb(t); }, print: printDoc, waiting: function () { return WAIT.on; }, note: note, snapshot: snapshot, make: make, list: list, read: readReport, addModel: addModel,
    dialog: dialog, show: show, hide: hide, quietItem: quietItem, optionsSection: optionsSection, install: install, pm: pm, setWatch: setWatch, watchOn: watchOn,
    crumbs: function () { return crumbs.slice(); }, consoleLog: function () { return consoleRing.slice(); }, made: function () { return made.slice(); },
    freezes: function () { return wd.freezes.slice(); }, watchdog: function () { return { running: !!wd.worker, session: wd.session, db: DB_NAME }; },
    secrets: secrets, format: Format, forClaude: forClaude, testBars: false, lastCopied: null, current: null,
    pageRecord: pageRecord, longFrames: function () { return { frames: LF.frames.slice(), tasks: LF.tasks.slice(), slow: LF.slow.slice(), support: { loaf: LF.loaf, longtask: LF.task } }; },
    // a deliberate busy loop of Anvil's own (tests: desktop/check.js reports, smoke rfNZ): a stack sample taken meanwhile
    // names this function and this file
    _block: function rpTestBlock(ms) { var t = now(), n = 0; while (now() - t < ms) n++; return n; },
    _onError: onError, _resetErrors: function () { errorSeen = {}; }, _checkLastSession: checkLastSession, _stopWatchdog: stopWatchdog, _startWatchdog: startWatchdog
  };
  UI.reports = api;
})(this);
