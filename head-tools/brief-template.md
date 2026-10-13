# Subagent brief template

Fill the <…> parts. Keep briefs short and concrete: name functions and files, not README chapters. Every token the
agent reads stays in its context for all its later steps, so the cost rules below matter more than the prose.

```
You are working on Anvil, a browser CAD app (ES5 JavaScript, no build step, SolidWorks-style UI). Your git worktree may
be at an older base; first run `git merge --ff-only main` (main is at <hash>). The user runs a sheet-metal shop in
inches and uses SolidWorks 2024 daily. Time box: about <30–45> minutes; iterate with `?only=<rfXX>`, one full ui-smoke
run at the end.

Read only what you need: `CLAUDE.md` *Conventions*; <the exact functions / files / report lines for this task>.

## Lane <XX>: <title>. Tasks, in priority order
1. <task, the SolidWorks behaviour expected, acceptance test>
2. …

## Files you may edit
<files>, `anvil/tests/smoke/<rfXX>.js` and `anvil/tests/kernel/<rfXX>.js` (new group files, plus one line each in the
pages' group manifests), `anvil/README.md`. <Who else is working, in which files.> Do not edit any other file. Do not
start servers on port 8812, publish artifacts, push, or write SESSION_LOG.md, QUEUE.md or ROADMAP.md. Do not download
anything or use git / GitHub credentials. Use headless Chrome for checks (the browser pane is shared).

## Working cheaply
- Never read a large file whole: `grep -n` for the function, then read that range. The test pages hold only helpers
  and the runner; read the helpers you use and your own group files, nothing else in tests/.
- Chain shell commands into one Bash call where you can; do not re-run a full suite to check a one-line change
  (use `?only=<rfXX>` and the kernel tests).
- The time box is a guide, not a stop: finish every task in the brief before reporting (the user, 2026-10-13); stop early
  only when truly blocked, and say what blocks you.

## Tests
- Group `<rfXX>` (self-contained; helpers prefixed `<rfXX>`; escape apostrophes in step titles; reset any setting you
  change). Drive the UI with real mouse / key events like the existing groups.
- `node anvil/headless/anvil.js test` (baseline <n>), `node anvil/headless/anvil.js example --all` (29 / 29). Serve on
  **port <89xx>** only (`powershell -NoProfile -ExecutionPolicy Bypass -File anvil\serve.ps1 -Port <89xx>` in the
  background from your worktree); ui-smoke `node anvil/headless/ui-smoke.js http://localhost:<89xx>/tests/ui-smoke.html
  --port <94xx>` (baseline <n>). Stop your server when done.

## Finish
When green, `git add -A`, commit in your worktree as `TEMP lane <XX>` (do not push). Report in under 250 words: what
works, tests (and existing tests changed), suite counts, anything unresolved.
```
