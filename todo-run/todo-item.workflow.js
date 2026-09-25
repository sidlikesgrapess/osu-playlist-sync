export const meta = {
  name: 'todo-item',
  description: 'One todo item: scope, implement, 3-lens adversarial verify, fix loop, commit on todo-fixes',
  phases: [
    { title: 'Scope' },
    { title: 'Implement' },
    { title: 'Verify' },
    { title: 'Fix' },
    { title: 'Commit' },
  ],
}

const A = args
const REPO = 'C:\\Users\\Siddartha\\Desktop\\study(fr)\\Antigravity\\osuplaylist'
const NOTES = `todo-run/${A.notes}`
const RULES = `
Repo: ${REPO}, branch todo-fixes. Hard rules:
- Never run \`npm run build\` (the dev server on :3000 is running and serves this working tree with hot reload). Never run \`npm run bench:capture\`. Never modify bench/.
- Never push, merge, open a PR, stash, reset or checkout other branches. Do not commit unless told to.
- Evidence or it does not count: every claim cites file:line. Label speculation as speculative.
- Fix the general rule, never add the specific case to a list.
- User-facing copy never uses a dash (hyphen, en dash, em dash) as punctuation.
- Keep live osu! API calls minimal. Polite pacing to mirrors and YouTube.
- Matching changes: run \`npm run bench\` and compare with todo-run/baseline/bench.txt (SHIPPED hit 31, abstain 6, WRONG 0, offered 752). Curve changes only in src/lib/matchStrictness.js.
- Desktop and mobile rows are separate components (SongRow.js / SongCardMobile.js); row changes land in both.
- Tests: \`npm test\` (node --test). Baseline todo-run/baseline/tests.txt: 165 tests, 164 pass, 0 fail, 1 todo.
- Browser checks: Playwright (bundled Chromium) against http://localhost:3000. Launch with args --no-sandbox --disable-gpu --disable-dev-shm-usage, wrap in a hard timeout. If require('playwright') fails set NODE_PATH="$(npm root -g)". Reuse patterns from .claude/skills/screenshot-app/capture.js and rebuild-notes/verify/smoke.mjs. Put scripts and screenshots in todo-run/shots/${A.id}/. Check desktop 1280x800 and phone 375x812.
`
const ITEM = `Todo item ${A.id}: "${A.text}"
${A.hint ? 'Orchestrator hint: ' + A.hint : ''}
${A.decisions ? 'User/recorded decisions: ' + A.decisions : ''}`

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    currentState: { type: 'string', description: 'What the code does today, with file:line' },
    alreadyDone: { type: 'boolean' },
    acceptance: { type: 'array', items: { type: 'string' }, description: 'Testable acceptance criteria' },
    files: { type: 'array', items: { type: 'string' } },
    touchesMatching: { type: 'boolean' },
    needsDecision: { type: 'boolean' },
    decisionQuestion: { type: 'string' },
    decisionOptions: { type: 'array', items: { type: 'string' } },
    recommended: { type: 'string', description: 'Recommended default and why' },
    verifyPlan: { type: 'string' },
  },
  required: ['currentState', 'alreadyDone', 'acceptance', 'files', 'touchesMatching', 'needsDecision', 'recommended', 'verifyPlan'],
}
const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testResult: { type: 'string' },
    benchResult: { type: 'string' },
    openQuestions: { type: 'string' },
  },
  required: ['summary', 'filesChanged', 'testResult'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['CONFIRMED', 'SPECULATIVE'] },
          claim: { type: 'string' },
          evidence: { type: 'string', description: 'file:line, command output, or screenshot path' },
          mustFix: { type: 'boolean' },
        },
        required: ['verdict', 'claim', 'evidence', 'mustFix'],
      },
    },
    checked: { type: 'string', description: 'What was actually run/checked' },
  },
  required: ['pass', 'findings', 'checked'],
}

// ---------- Scope ----------
let scope = A.scope || null
if (!scope) {
  phase('Scope')
  scope = await agent(`${RULES}\n${ITEM}\n\nYou are the SCOPE stage. Read only, change nothing. Determine the current behaviour with file:line evidence, whether the item is already done, testable acceptance criteria, the files a fix touches, whether matching (scoreBeatmapMatch/searchOsuBeatmaps/titleCleaner) is touched, and a concrete verification plan (unit tests + a live Playwright check on :3000). If the item needs a design decision that is genuinely the user's (wording, layout, behaviour trade off), set needsDecision, write the question, 2 to 4 options, and your recommended default with reasoning. Do not flag decisions that have an obvious conventional answer; decide those yourself in 'recommended'.`,
    { label: `scope:${A.id}`, phase: 'Scope', schema: SCOPE_SCHEMA, agentType: 'Explore' })
  if (!scope) return { status: 'error', stage: 'scope' }
  if (scope.needsDecision && !A.decisions) return { status: 'needs-decision', scope }
}

// ---------- Implement ----------
phase('Implement')
const scopeText = JSON.stringify(scope, null, 1)
let impl = await agent(`${RULES}\n${ITEM}\n\nScope (from the scope stage):\n${scopeText}\n\nYou are the IMPLEMENT stage.
1. First run \`git status\` and \`git diff\`: if work for this item is already in the tree (a resumed run), continue it rather than redo it.
2. Write the scope, decisions and acceptance criteria into ${NOTES} (create it; section "## Scope"). Set this item's row in todo-run/STATE.md to status implementing.
3. Implement the item so every acceptance criterion holds. Keep pure logic in helpers under src/lib with node --test tests in test/ (the way createPreviewStore is split out of useAudioPreview). Match surrounding style (inline styles, comment density). ${scope.alreadyDone ? 'The scope says it may already be done: verify that live first; if it truly is done, make only the minimal change needed (possibly none) and say so.' : ''}
4. Run \`npm test\`${scope.touchesMatching ? ' and `npm run bench` (compare with baseline)' : ''}. Do a quick Playwright sanity check of the change on :3000.
5. Append "## Implementation" to ${NOTES}: what changed and why, with file:line. Set STATE.md status verifying. Do NOT commit.`,
  { label: `implement:${A.id}`, phase: 'Implement', schema: IMPL_SCHEMA, agentType: 'general-purpose' })
if (!impl) return { status: 'error', stage: 'implement', scope }

// ---------- Verify / Fix loop ----------
const LENSES = [
  { key: 'regression', prompt: `REGRESSION lens. Run \`npm test\` and compare with the baseline (no new failures, count only grows). ${scope.touchesMatching ? 'Run `npm run bench` and `npm run bench:cost` and compare with todo-run/baseline/.' : 'If any matching file changed, run bench anyway.'} Review \`git diff\` for broken callers, changed song-object shape not mirrored in beatmapToSong/makeSong, SongRow vs SongCardMobile drift, removed isDemo handling, missing force-dynamic, lost .status on errors.` },
  { key: 'acceptance', prompt: `ACCEPTANCE lens. For EACH acceptance criterion, check it on the running app at http://localhost:3000 with Playwright (desktop 1280x800 and phone 375x812), save screenshots to todo-run/shots/${A.id}/, and view the key screenshots with the Read tool. At most one live osu! flow. A criterion you could not demonstrate is a failure, not a pass.` },
  { key: 'rules', prompt: `RULES lens. Review \`git diff\` against the hard rules: dash punctuation in any user-facing string, per-item special-case lists instead of a general rule, design changes beyond what the item asks, unpaced external requests or missing User-Agent on server fetches, bench/ touched, dead code or leftover debug logging, comments that do not match the surrounding density.` },
]
const verifyOne = (lens, round) => agent(`${RULES}\n${ITEM}\n\nScope:\n${scopeText}\n\nImplementation summary:\n${JSON.stringify(impl)}\n\nYou are a VERIFIER (round ${round}), ${lens.prompt}\nDo NOT edit source files (you may write scratch scripts and screenshots under todo-run/shots/${A.id}/). Try to REFUTE that the item is correctly done. Every finding needs evidence. mustFix=true only for CONFIRMED defects that break an acceptance criterion or a hard rule. pass=false iff any mustFix finding.`,
  { label: `verify:${lens.key}:r${round}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'general-purpose' })

let pending = LENSES
let history = []
let round = 1
let lastFails = []
while (true) {
  const results = await parallel(pending.map(l => () => verifyOne(l, round).then(v => ({ lens: l.key, v }))))
  const got = results.filter(Boolean)
  history.push({ round, results: got })
  lastFails = got.filter(r => !r.v || !r.v.pass)
  log(`round ${round}: ${got.length - lastFails.length}/${got.length} lenses pass`)
  if (lastFails.length === 0) break
  if (round > 2) break
  phase('Fix')
  const mustFix = lastFails.map(r => ({ lens: r.lens, findings: r.v ? r.v.findings.filter(f => f.mustFix) : [{ claim: 'verifier died', evidence: '' }] }))
  const fix = await agent(`${RULES}\n${ITEM}\n\nScope:\n${scopeText}\n\nVerifiers found these must-fix defects (round ${round}):\n${JSON.stringify(mustFix, null, 1)}\n\nYou are the FIX stage. First append them under "## Verify round ${round}" in ${NOTES} (claim, evidence). Set STATE.md status fixing, round ${round}. Check each claim yourself; if one is wrong, write why with evidence instead of changing code. Fix the real ones (general rule, not special cases). Run \`npm test\`${scope.touchesMatching ? ' and `npm run bench`' : ''}. Append "## Fix round ${round}" to ${NOTES}. Do NOT commit.`,
    { label: `fix:${A.id}:r${round}`, phase: 'Fix', schema: IMPL_SCHEMA, agentType: 'general-purpose' })
  if (fix) impl = { ...impl, fixes: [...(impl.fixes || []), fix.summary] }
  pending = LENSES.filter(l => lastFails.some(r => r.lens === l.key))
  round++
}

// ---------- Commit or block ----------
phase('Commit')
const passed = lastFails.length === 0
const verifySummary = JSON.stringify(history.map(h => ({ round: h.round, results: h.results.map(r => ({ lens: r.lens, pass: r.v && r.v.pass, checked: r.v && r.v.checked, findings: r.v && r.v.findings })) })), null, 1)
const done = await agent(`${RULES}\n${ITEM}\n\nVerification history:\n${verifySummary}\n\n${passed
  ? `The item PASSED verification. 1) Append "## Verification" to ${NOTES} summarising each lens and round (what was checked, findings and how they were resolved; non must-fix findings listed as follow-ups). 2) In the repo-root \`todo\` file, move this item from "## Remaining" to "## Done" (append " done" like the others). 3) Stage the item's changes, the notes, todo-run/shots/${A.id}/ (skip files over 2 MB) and the todo file, and commit on todo-fixes with a message whose first line describes the change in plain words, ending with the trailer line:\nCo-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>\n4) Then set this item's STATE.md row to done with the commit hash and amend nothing; commit STATE.md as a second small commit "Update todo run state" with the same trailer. Return the item commit hash.`
  : `The item FAILED verification after the fix rounds. Do not commit code. Append "## Blocked" to ${NOTES} with the remaining must-fix findings and evidence, and set STATE.md status blocked. Return a short explanation.`}`,
  { label: `commit:${A.id}`, phase: 'Commit', agentType: 'general-purpose', effort: 'low' })

return { status: passed ? 'done' : 'blocked', scope, impl, rounds: round, lastFails: lastFails.map(r => ({ lens: r.lens, findings: r.v && r.v.findings })), commit: done }
