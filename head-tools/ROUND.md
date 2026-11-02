# Interactive head round (the user says "continue, N agents on <area>")

The short form of CLAUDE.md's head protocol, as the interactive head runs it. Everything a fresh session needs is in
the repo: this file, `head-tools/brief-template.md`, `anvil/SESSION_LOG.md` (last entry), `QUEUE.md`, and the latest
`test-reports/`. **Start each round from a fresh or compacted head session** (the user runs `/compact` or opens a new
session after the round is pushed): a long head context is re-read on every turn and is the largest avoidable cost.

## 1. Stock and plan (keep it short)
- `git fetch origin`, `git status -sb`, `git log --oneline -3`. Read the last SESSION_LOG entry and the QUEUE lines for
  the area; the user's priority order is in ROADMAP *Scope* (sketch, then drawings, then the rest).
- `mcp__ccd_session_mgmt__get_usage`: pace rounds to the weekly limit (a 4-agent round is about 2–3 % of the week).
- Write `HEAD.lock` (`{"runId", "session", "startedAt", "heartbeat", "lanes"}`) and start `head-tools/heartbeat.ps1` hidden.
- Pick lanes that touch different files where possible; give each a test group name (`rfXX`, next free letters:
  grep `tests/smoke/` and `tests/kernel/`), a serve port 89xx and a Chrome port 94xx (8812 is the head's; 8883 / 8884
  are taken by Dell SupportAssist).

## 2. Spawn (one message, all agents)
`Agent` with `subagent_type: general-purpose`, `model: opus` (or a cheaper model for audits / re-checks),
`isolation: worktree`, `run_in_background: true`, brief from `head-tools/brief-template.md`. Put the run on the board
(`runs/<id>`, status running, lanes) — see CLAUDE.md *The board*.

## 2b. Context for agents (user, 2026-10-14)
- Every brief points the agent at its area card `anvil/docs/areas/<area>.md` (sketch, sheetmetal, kernel, drawings,
  transform-view, ui-core, tests) and at `anvil/docs/INDEX.md` (every function / exported name with its line;
  regenerate with `node head-tools/make-index.js`, `--check` in step 4). Agents update their card before they finish.
- **Reuse an agent for a follow-up in the same area** instead of spawning a fresh one: `SendMessage` to the agent id
  of the lane that just finished, with the new task and "first `git reset --hard main` in your worktree (your last
  lane is merged)". For that, merge its branch but keep its worktree (skip the worktree remove / branch delete until
  the agent is retired). Retire it by size, not task count: when its context passes ~400 K tokens (the task
  notification's subagent_tokens), or when the next task is in another part of the code. Every step re-reads the whole
  context, so a 400 K agent pays ~3x per step what a fresh agent pays early on, and near its limit it compacts itself
  and loses detail anyway. Measured 2026-10-14: the sketch agent's third task (355 K context) took 54 steps / 13 min,
  a fresh agent on a similar sketch task ~100 steps / 25 min — about the same tokens, half the time.
- `/compact` does not end the head's subagents, it only drops their ids from the head's memory: keep them in
  `head-tools/agents.local.json` (git-ignored; area -> id, task count, worktree), update it on every spawn / follow-up /
  retire, and read it (plus `ListAgents`) first thing after a compaction.
- Across head sessions agents do not survive; the cards, INDEX.md, SESSION_LOG and QUEUE are the carried context.

## 3. Merge each lane as it returns
```
git merge --squash worktree-agent-<id>          # main tree, on top of the previous lanes' TEMP commits
node head-tools/resolve-both.js <file> both           # only where both sides appended (manifest lines, README bullets);
                                                # read every other conflict and resolve it by hand
git add -A anvil && git commit -qm "TEMP <lane>"
```
Fix small things the lane reports as unresolved yourself when they are a few lines (with a test); queue the rest.
Check for hacks (wrapping another file's function, property setters, MutationObservers) and replace them with a direct
hook when it is cheap.

## 4. Verify (all green or no commit)
```
node anvil/tests/split-tests.js --check          # every group file listed in its page manifest and parsing
node head-tools/make-index.js --check            # anvil/docs/INDEX.md current (else run it without --check)
node anvil/headless/anvil.js test                # parallel, half the threads, about 3.5 min here; --serial for one process
node anvil/headless/anvil.js example --all
node anvil/headless/anvil.js example --all --occt
node anvil/headless/ui-smoke.js http://localhost:8812/tests/ui-smoke.html --port 9312
```
Then `http://localhost:8812/tests/occt-tests.html` in the browser pane (`location.reload()`, poll the PASS / FAIL count
every ~30 s, 87 rows), and `http://localhost:8812/` with no console errors.

## 5. Record, commit, publish
- Append the SESSION_LOG entry (per lane, head, next, Tests line); update the ui-smoke count in README *Headless*; move
  QUEUE items to Done and rewrite the open sketch / drawing gaps line.
- One commit: write the message to a file, `git add -A anvil QUEUE.md test-reports/<new>`, `git reset --soft <round base>`,
  `git commit -F <file>` ending with the session's attribution line, `git push origin main`.
- Republish the app: `Artifact` with `url` https://claude.ai/artifact/Dhex98h8xugn5w2RXraAPS, `root: anvil`,
  `file_path: anvil/index.html`, `files` = every app file changed since the round base
  (`git diff --name-only <base> HEAD | grep -v "tests/\|\.md$"`) plus any new script `index.html` loads.
- Close the run on the board (status done, commit, lanes with outcome / note, tests, uiSmoke, next), and `update`
  `status/board` with `loc` = the JSON from `node head-tools/count-loc.js` (the Lines of code tile).
- Clean up: `git worktree remove --force .claude/worktrees/agent-<id>`, `git branch -D worktree-agent-<id>`,
  `git worktree prune`, delete `HEAD.lock` (the heartbeat stops by itself).
- Tell the user: what each lane did, the suite table, what is still open, usage — then suggest `/compact` before the
  next round.
