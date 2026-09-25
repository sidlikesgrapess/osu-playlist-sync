# Todo run: one item at a time, verified, committed, resumable

## Context
The rebuild is merged (main at c44e5e6, local only). The user wants to work through `todo` → "Remaining"
one item at a time. Each item is implemented, verified by agents trying to refute it, fixed until it
passes, and committed before the next item starts. All findings and progress go to disk, so a run cut
off by the usage limit can be picked up in a new session. **Long term goals are out of scope.**

## Execution model (who runs what)
- **Orchestrator: the main Claude Code session (Opus 5.5), running the Workflow tool once per item.**
  It has to be the main session, not a subagent, for three reasons: only it can ask you design
  questions (AskUserQuestion), only it can launch Workflows, and it can read each item's result
  before starting the next.
- Inside each item's workflow:
  | stage | agent type | why |
  |---|---|---|
  | Scope | `Explore` | read only; writes nothing, returns scope as structured output |
  | Implement / Fix | `general-purpose` | needs Edit + Bash (tests, bench) |
  | Verify (3 lenses) | `general-purpose`, told not to edit | needs Bash to run tests, bench, Playwright |
  | Commit + state | `general-purpose`, low effort | git commit, update state files |
- **What you type to start it:** in this repo, say: `Run the todo workflow: read todo-run/STATE.md and continue.`
  The same sentence resumes it after a limit cutoff.

## Durable state (the resume mechanism)
All of this lives in the repo, so it survives the session:
- `todo-run/STATE.md`: one row per item. Columns: id, title, status
  (`pending | needs-decision | scoping | implementing | verifying | fixing | blocked | done`),
  round, commit hash, notes file. The agent at each phase boundary updates it **before** it returns.
- `todo-run/items/NN-slug.md`: per item. Holds the scope (current state with file:line, acceptance
  criteria, files, verification plan), your recorded design decisions, every verify round's findings
  (with CONFIRMED/REFUTED and the evidence), and what each fix changed.
- `todo-run/RESUME.md`: the resume prompt plus the rules below, so a fresh session needs nothing else.
- Baselines saved once at the start: `todo-run/baseline/bench.txt` (must match `rebuild-notes/bench-main.txt`:
  hit 31, abstain 6, WRONG 0, offered 752), `bench-cost.txt` (55 calls, 1.49/track), `tests.txt` (165 / 164 pass / 1 todo).

**Resuming:**
- In the same session, re-invoke the workflow with `resumeFromRunId`. Finished agents come back from the journal.
- In a new session, the orchestrator reads STATE.md. For an item that is `implementing`, `verifying` or `fixing`:
  1. Start its workflow at that phase, using the item's notes file plus `git diff` as the input.
  2. The implement agent always checks `git status` first, so it continues half-done work instead of redoing it.
- The dirty tree is the checkpoint: work is only committed once an item passes, and nothing between commits is stashed or reset.

## Per-item workflow (`todo-item`, args: {id, text, decisions, phaseToStartAt})
1. **Scope (Explore).**
   - Confirm the current behaviour with file:line.
   - Write testable acceptance criteria.
   - List the files to touch (both `SongRow.js` and `SongCardMobile.js` when rows change).
   - Say whether matching is touched (if so the bench is required), and whether the item needs a user decision.
   - If a decision is needed, the scope agent also writes a **recommended default** with its reasoning, and the workflow returns early as `needs-decision`.
   - The orchestrator asks you with AskUserQuestion. It does not wait on you:
     - If AskUserQuestion isn't available, or you haven't answered within about 1 minute, it takes the recommended default.
     - It records that in the notes file and in STATE.md as `ASSUMED: <choice> (reason)`, then carries on.
     - Every assumed decision is listed in the final report so you can overturn it. Reverting that one commit is enough.
2. **Implement (general-purpose).**
   - Works on the branch `todo-fixes` (created from main once, never pushed without asking).
   - Pure logic goes in helpers with `node --test` tests, the way `createPreviewStore` is split out.
   - Runs `npm test`, plus `npm run bench` when matching is touched.
3. **Verify: three lenses in parallel, each told to refute and cite file:line:**
   - *Regression:* `npm test` against the baseline, `bench` and `bench:cost` against the baseline when relevant, and a diff review for broken callers.
   - *Acceptance / live:* each acceptance criterion checked on the running dev server on :3000.
     - Uses Playwright, reusing `.claude/skills/screenshot-app/capture.js` and `rebuild-notes/verify/smoke.mjs`.
     - Checks desktop 1280x800 and phone 375x812, with screenshots saved to `todo-run/shots/NN/`.
     - Makes at most one live osu! flow per round.
   - *Rules:*
     - No dash punctuation in UI copy.
     - No per-item special-case lists.
     - The CLAUDE.md conventions: the `isDemo` path, `force-dynamic`, and `.status` on errors.
     - Polite pacing and the User-Agent.
     - Design changes limited to what the item asks for.
     - `bench/` untouched.
4. **Fix loop.**
   - The fix agent gets only CONFIRMED findings, and only the lenses that failed re-verify.
   - At most 2 fix rounds, which keeps a run around 10 agents.
   - Still failing after that: status `blocked`, the findings are written down, the workflow stops, and the orchestrator reports to you. It never moves on silently.
5. **Commit.**
   - One commit per item on `todo-fixes`, with the Co-Authored-By trailer.
   - The same commit moves the item to "Done" in `todo` and updates STATE.md with the hash.

Hard rules every agent gets:
- Never run `npm run build` while dev is up.
- Never run `bench:capture`.
- Never push, merge or open a PR.
- Never touch `bench/`.

## Item order and approach
Quick, low-risk items first. Items that need your decision are asked just before they start, not all up front.
| # | item | approach | decision? |
|---|---|---|---|
| 1 | Breakcore playlist 11→7 | The code is likely already done: F-18's detection (`youtube.js:230-253`, notice at `page.js:1325`) was never checked live. Load the given playlist once on :3000. If it shows "7 of 11, 4 unavailable", mark done. If not, capture the payload into a `test/youtube.test.mjs` fixture and fix the parse. | no |
| 2 | "Select exact matches" button | Replace the "Select All Matched" button in `SongTable.js:101-121` (the header checkbox already selects all). New `page.js` handler filters with `isAutoSelectable` (`beatmapFormat.js:52`). | label only |
| 3 | Song preview loading/error | Loading exists (`useAudioPreview.js:171`), but `BeatmapCover.js:61` draws it the same as playing. Add a distinct buffering animation. Add `error`/`stalled`/`waiting` listeners in `useAudioPreview.js:148`, so a mid-play failure is reported through the existing "Preview unavailable" path. | no |
| 4 | Memory leak check | The audit found no real leak: the blob URL is revoked (`page.js:107`), images are browser-cached and lazy, and the list is dropped on a new search. One gap: stop only pauses (`useAudioPreview.js:151`). Clear `src` and call `load()` on stop and on list drop. Verify with a heap snapshot comparison in Playwright over two searches. | no |
| 5 | Hover bounce, toggleable | Copy the Navbar sound-toggle pattern (`osu_sfx_enabled`). Add an `html.osu-bounce` class, a bounce keyframe in `globals.css`, `prefers-reduced-motion` off, and an inline script in `layout.js` so the page does not flash. | default on/off |
| 6 | Mode switcher → 2 modes | Cut the `PlaylistInput.js:25-30` menu to "Playlist / Song" (auto, via `classifyInput`) and "Player". | toggle vs dropdown |
| 7 | Re:Re: split (F-28) | Turn the todo test at `test/search-replay.test.mjs:272` into a pass. Fix the general rule in `titleCleaner`. Bench before and after. | no |
| 8 | YouTube 500 + paced Search All | Follow the Innertube continuation (move the raw POST into `http.js`), keep `truncated` structural, cap at 500, and pace Search All under 60/min. | no (already specified) |
| 9 | Global top bar / keep both result sets | Hold the playlist state and the player state side by side, so switching modes keeps selections. The download bar works on the union. | yes: scope of "global" |
| 10 | Change Player vs trash | Builds on #9. "Change player" goes back to the player results screen. The trash clears only the current list, with a correct tooltip. Remove the double click sound. | wording |
| 11 | Player search loading cost | Already one call per section (100 items), 25 rows shown at a time, lazy images. Very likely the answer is "leave it". The workflow reports the numbers (calls, image bytes) and asks you before changing anything. | yes |
| 12 | Full-length player sections, sticky headers | Remove the card's `overflow:hidden` and the 400px inner scroller. Headers stick under the navbar plus the docked search bar (a measured CSS variable), and the next header pushes the previous one out, like VS Code sticky scroll. | yes: layout details |
| 13 | Redo F-46 | Read the held-back F-46 notes and propose approaches. | yes, per the todo |

## Verification of the whole run
- Each commit on `todo-fixes` passed its own three-lens verify. After the last item, one final regression pass runs:
  - `npm test`
  - `npm run bench`: 0 WRONG, no drop in hit
  - `npm run bench:cost`: no rise over 1.49/track unless #8 explains it
  - the smoke script on desktop and phone
- Then I report and ask whether to push or open a PR.
