# F-46 test report

Item 13, redo of F-46: bracket noise without a word list. OLD is the committed cleaner and matcher at HEAD b8a6e29 (the cleaner copy is `todo-run/f46/titleCleaner.old.mjs`). NEW is the uncommitted working tree on `todo-fixes`. All numbers below were rerun on 2026-09-27 unless a line says it comes from an earlier live run.

## Verdict against the ship gate

| gate | OLD | NEW | result |
|---|---|---|---|
| ab H0 title strictly above 64/116 | 64/116 | 111/116 | pass |
| ab artist at least 95/108 | 95/108 | 107/108 | pass |
| every `real-brackets` and `control` entry OLD got right is right in NEW H0 or altTitle | | 8/8 and 7/7 | pass |
| arbitration unit tests show the fuller map wins | | 4 of 4 plus the tilde case | pass |
| npm test all pass | 266/266 at the start of round 4 | 275/275 | pass |
| bench WRONG 0, hit at least 31 | 31 / 6 / 0 | 31 / 6 / 0 | pass |
| bench:cost at most 1.49 per track | 1.49 | 1.49 | pass (bench cannot see H1, see below) |
| search replay check R calls | 55 | 58 | above the old budget of 57, explained below |

## 1. Labelled title set (`todo-run/f46/ab.mjs`)

Command: `node todo-run/f46/ab.mjs` for NEW, and `todo-run/f46/baseline-old.txt` for OLD. H0 is the `title` field alone, the thing ab.mjs grades (ab.mjs:75). "H0 or altTitle" counts an entry as right when either hypothesis equals the label; it was computed with the same normalizer ab.mjs exports and the same call options.

| category | n | OLD title | NEW title (H0) | OLD H0 or alt | NEW H0 or alt | OLD artist | NEW artist |
|---|---|---|---|---|---|---|---|
| boilerplate | 13 | 11 | 13 | 11 | 13 | 11/13 | 13/13 |
| nightcore | 8 | 8 | 8 | 8 | 8 | 4/4 | 4/4 |
| replay | 8 | 1 | 7 | 1 | 7 | 4/6 | 6/6 |
| jp-quote | 8 | 1 | 8 | 1 | 8 | 2/7 | 6/7 |
| real-brackets | 8 | 7 | 5 | 7 | 8 | 8/8 | 8/8 |
| feat | 8 | 2 | 8 | 2 | 8 | 8/8 | 8/8 |
| structured | 10 | 8 | 10 | 8 | 10 | 10/10 | 10/10 |
| unseen | 16 | 5 | 16 | 5 | 16 | 14/16 | 16/16 |
| playlist | 17 | 10 | 17 | 10 | 17 | 17/17 | 17/17 |
| channel-echo | 6 | 1 | 6 | 1 | 6 | 6/6 | 6/6 |
| separators | 7 | 3 | 6 | 3 | 7 | 5/7 | 7/7 |
| control | 7 | 7 | 7 | 7 | 7 | 6/6 | 6/6 |
| **total** | 116 | **64** | **111** | **64** | **115** | **95/108** | **107/108** |

`ab.mjs --compare todo-run/f46/baseline-old.json <fresh NEW run>`: 50 fixed, 4 broken in H0, 2 wrong in both, 4 right in both with different output.

The 4 H0 breaks all keep the right title in altTitle, and each is settled at search time by the fuller match rule (section 3):

| # | raw | NEW H0 | NEW altTitle |
|---|---|---|---|
| 40 | `COOL&CREATE - Night of Nights (Flowering nights remix)` | Night of Nights | Night of Nights (Flowering nights remix) |
| 41 | `Hanasaka Yui - Harumachi Clover (Swing Arrangement)` | Harumachi Clover | Harumachi Clover (Swing Arrangement) |
| 45 | `Disturbed - The Sound Of Silence (CYRIL Remix)` | The Sound Of Silence | The Sound Of Silence (CYRIL Remix) |
| 104 | `ZUN - Lunatic Eyes ~ Invisible Full Moon` | Lunatic Eyes | Lunatic Eyes ~ Invisible Full Moon |

Why they are in altTitle and not H0: with no word list, a trailing round tag such as `(CYRIL Remix)` has the same evidence profile as `(Official Video)` or `(Dolby Atmos)` (youtube source, artist split, round bracket, trailing, no shape, no echo, no playlist repeat; src/lib/titleCleaner.js tagLean). #104 moved from H0 to altTitle this round, because a trailing spaced tilde after an artist split is now a tail tag as the approved design says.

Both wrong: #29 `Harumachi Clover | osu! Liveplay` (title) and #37 `呪術廻戦 OP「廻廻奇譚」Eve` (artist; the title is now right).

Protected files: `git diff` on corpus.json, ab.mjs, baseline-old.json and baseline-old.txt is empty. Nothing under bench/ is modified.

## 2. Nightcore entries (#14, #15, #16)

| # | raw, channel | OLD artist | OLD artistFromTitle | NEW artist | NEW artistFromTitle |
|---|---|---|---|---|---|
| 14 | `Nightcore - Angel With A Shotgun`, NightcoreReality | NightcoreReality | false | Nightcore | true |
| 15 | `Nightcore - Monster (Lyrics)`, Syrex | Syrex | false | Nightcore | true |
| 16 | `Nightcore ~ Hikaru Nara`, Nightcore Anime | Nightcore Anime | false | Nightcore Anime | false |

The titles are right in both (Angel With A Shotgun, Monster, Hikaru Nara). ab.mjs does not score the artist here because the corpus label is null.

Rule: none. An earlier round added a playlist rule (a name another track carries as a tag is never the artist), ASSUMED without the user. Verify round 3 showed it removes real artists: in the playlist `Camellia - GHOST` plus `Exit This Earth's Atomosphere [Camellia]`, Camellia lost the artist and nothing was auto selected, while it never fixed #14 or #15. USER decision 2026-09-28: drop it. It is removed; the regression guard is the test "a name credited as a tag on another playlist track still counts as the artist" in test/f46.test.mjs. A lone `Nightcore - X` keeps `Nightcore`, which is a real osu! credit: the captured bench snapshot `bench/snapshots/yt-nightcore-noise.json` holds 41 distinct sets whose artist is exactly `Nightcore`, and the live run found such uploads pick Nightcore credited maps of the right song. OLD dropped the word only through its word list (titleCleaner.old.mjs:13, :48, :62), which the user ruled out. After the removal every number in this report was rerun and is unchanged: ab 111/116 and 107/108, npm test 275/275, bench 31/6/0 with 752 offered, bench:cost 1.49, score-ab 31/6/0 with 0 fixtures differing.

## 3. Fuller match wins (USER decision 2026-09-26)

Rule: when altTitle differs from the title, a candidate that matches altTitle exactly scores its H1 score plus `FULLER_MARGIN = 30` (src/lib/osu.js:629, applied at :639). 30 is above ranked (15) plus popularity (up to 10) and below one artist rung (70), so a fuller exact match beats any H0 only exact match with the same artist verdict, and never beats a better artist verdict or the gate's -Infinity.

Early stop: an exact H0 leader at 150 or more no longer ends the search while the H1 query is pending. The loop jumps straight to the H1 query and then stops, and it stops at once when an exact H1 candidate is already pooled. Still within MAX_QUERY_VARIANTS = 4.

Unit tests with stubbed fetch (test/f46.test.mjs). In each fuller case the plain map is ranked with more favourites and the tagged map is graveyard:

| test | line | final top map | result |
|---|---|---|---|
| Night of Nights (Flowering nights remix) | :277 | the remix map | pass |
| Harumachi Clover (Swing Arrangement) | :277 | the arrangement map | pass |
| The Sound Of Silence (CYRIL Remix) | :277 | the remix map | pass |
| Spotify `Shape of You - Stormzy Remix`, providerArtist Ed Sheeran | :277 | the Stormzy Remix map | pass |
| noise `Song (Official Video)` | :289 | plain `Song` | pass |
| margin never beats a better artist verdict, gate still refuses | :299 | | pass |
| trailing tilde tag, #104 full Touhou map beats bare `Lunatic Eyes` | :312 | full title map | pass |
| exact H0 leader jumps to the pending H1 query, then stops | :201 | | pass |
| exact H1 already pooled, no H1 query sent | :213 | | pass |

Live, on http://localhost:3000, paced about 2 s apart (earlier round 4 runs, results in todo-run/shots/13/):

| upload | OLD final map | NEW before the fuller rule | NEW final map |
|---|---|---|---|
| #45 CYRIL Remix | not measured live (OLD H0 kept the full title) | plain map 202.11 over the remix 201.19 (verifier2-live-results.json) | **CYRIL Remix map 231.19**, plain 202.11 second (round4-live-results.json) |
| #40 Flowering nights remix | not measured live | remix map 206.05 | **remix map 236.05** (vr1-live-results.json) |
| #41 Swing Arrangement | not measured live | plain map 224.17 | plain Hanasaka Yui map. All 22 Swing Arrangement sets credit Will Stetson, so the artist gate correctly refuses them (round 4 swing-check.mjs) |

The CYRIL and Flowering rows were checked at 1280x800 (SongRow.js) and 375x812 (SongCardMobile.js): the auto selected row shows the remix map on both, 0 console errors, no horizontal scroll (round4_desktop_live.png, round4_phone_live.png, vr1_desktop_live.png, vr1_phone_live.png).

## 4. Offline scoring replay (`todo-run/f46/score-ab.mjs`)

| scorer | hit | abstain | WRONG | miss | search calls |
|---|---|---|---|---|---|
| A, single title | 31 | 6 | 0 | 0 | 48 |
| B, max over H0 and H1 | 31 | 6 | 0 | 0 | 51 |

0 fixtures differ in result. 0 B queries lacked a captured answer. The 3 extra calls in B are the H1 queries that now run behind an exact H0 leader.

## 5. Bench

`npm run bench`, SHIPPED (src): hit 31, correctAbstain 6, WRONG 0, miss 0, unreachable 0, offered 752. Identical to todo-run/baseline/bench.txt apart from a node process id in a warning line.

`npm run bench:cost`, SHIPPED: 47 title queries plus 8 probes, 55 calls, 1.49 per track, the same as todo-run/baseline/bench-cost.txt. Bench never sends altTitle (bench/scorers/shipped.mjs:33 calls resolveArtistTrust, not searchOsuBeatmaps), so it cannot see the H1 query; the real H1 cost is measured by score-ab (section 4) and check R (section 6).

## 6. Tests

| suite | OLD | NEW |
|---|---|---|
| npm test | 266 tests at the start of round 4 (242 before F-46) | 275 tests, 275 pass, 0 fail |
| search replay check R tally | 31 / 0 wrong / 6 | 31 / 0 wrong / 6 |
| check R calls | 55 | 58 |
| check R uncovered queries | | 0, UNCOVERED_ALLOWED is empty |

Why check R rose from 55 to 58: the fuller match rule means an exact H0 leader no longer ends the search while an H1 query is pending. Three replay uploads have an H1 that keeps a tag (`(Official Video)`, `(Lyrics)`, `[Insane]`), and each now sends that one extra query. That is the cost of letting a remix upload find its remix map, and it is paid only when the raw title carries a tag that H0 dropped. MAX_CALLS went from 57 to 58 (test/search-replay.test.mjs:37). Speculative estimate: about 3 extra calls per 37 tracks, roughly 0.08 per track, on top of bench:cost's 1.49.

The answers for those H1 queries were captured live with todo-run/f46/capture-supplement.mjs into test/fixtures/replay-supplement.json: 2 queries in fix round 1 and 3 in round 4, each run with 1 token call and about 1 s between searches. bench:capture was never run.

## 7. Cleaner snapshot

test/cleaner-diff.test.mjs passes and its snapshot was not regenerated. No cleaner snapshot fixture changed. test/titleCleaner.test.mjs expectations for Stormzy, Sound Asleep and Lemon were updated to follow the approved design (H0 plus altTitle).

## 8. Live osu! API usage

All live calls across item 13: the fix round 1 capture (1 token, 2 searches), the round 4 capture (1 token, 3 searches), the paced arbitration checks on :3000 (3 titles), the round 4 and verifier Playwright checks (1 search each), and at most 2 Nightcore searches. No call was made for this report; every number above was rerun offline.
