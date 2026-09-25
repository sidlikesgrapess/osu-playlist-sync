# Resuming the todo run

Say to Claude Code (main session) in this repo:

    Run the todo workflow: read todo-run/STATE.md and continue.

The orchestrator (main session) then:
1. Reads STATE.md, takes the first item not `done`/`blocked`.
2. Reads `items/NN-*.md` and `git status` / `git diff` on branch `todo-fixes`.
3. Launches the per-item Workflow starting at the recorded phase (scope, implement, verify, fix, commit).
   Same session: `resumeFromRunId` replays finished agents from the journal.
4. Decisions: ask via AskUserQuestion; if unavailable or unanswered in about 1 min, take the scope
   agent's recommended default and record `ASSUMED: <choice> (reason)` here and in the notes file.

Rules every agent follows:
- Never `npm run build` while `npm run dev` is up. Never `npm run bench:capture`. Never touch `bench/`.
- Never push, merge or open a PR. One commit per item on `todo-fixes`, trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Evidence or it does not count: findings cite file:line; verifiers try to refute.
- Fix the general rule, never add the specific case to a list.
- No dash punctuation in user-facing copy.
- Minimal live osu! calls (at most one live flow per verify round). Polite mirror pacing.
- Matching changes: `npm run bench` before and after; curve changes go in `src/lib/matchStrictness.js`.
- Desktop and mobile rows are separate (`SongRow.js` / `SongCardMobile.js`).
