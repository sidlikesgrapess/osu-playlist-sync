# Matching benchmark

> **DEV-ONLY — not part of the production app.**
> Nothing under `bench/` is imported by `src/`, bundled, or deployed; `next build` never
> touches it. It exists so changes to `scoreBeatmapMatch` are measurable instead of guessed.
> The one dependency runs the other way: `bench/scorers/shipped.mjs` imports the real
> `src/lib/osu.js`, so if the shipped scorer changes, this harness reports it.
>
> Requires `.env.local` for the capture scripts only. The benchmark itself is offline.

Offline, deterministic harness for `scoreBeatmapMatch`. Answers one question:
**how often do we return a beatmap by the wrong artist?**

## Why it is built this way

- **Snapshots, not live calls.** `capture.mjs` hits the osu! API once and writes the raw
  responses to `snapshots/`. Everything else replays those. If the benchmark re-queried
  on every run, a scorer change and an osu!-side ranking change would be indistinguishable,
  and the rate limiter would make it unrunnable in a loop.
- **Frozen responses, live expectations.** Only API responses are frozen. `fixtures.json`
  is re-read every run, so a mislabelled expectation is corrected without another capture.
- **Labels are human-owned.** "Is this the same artist?" is the question the scorer is
  trying to answer, so letting the scorer label its own test data makes every metric
  circular. Exactly one rule auto-labels: byte-equal artist strings after normalization.
  Nothing is ever auto-labelled `different` — a wrong `different` would fabricate the very
  false positives this measures.
- **Pooling.** Labelling all ~2200 captured candidates is not human-sized. Instead we label
  only the top-8 each scorer actually surfaces, pooled across every scorer in `scorers/`
  (the TREC pooling method). The scorers choose what gets reviewed; a human chooses the
  verdict. Adding a scorer re-pools, so the gold standard never stays biased toward
  whichever scorer was written first.

## Commands

```bash
npm run bench           # replay all fixtures, all scorers
npm run bench -- --detail   # per-fixture failures
npm run bench:sweep     # threshold sweep
npm run bench:label     # refresh the pool, list pairs needing a verdict
npm run bench:capture   # re-hit the API (needs .env.local) — rarely
```

## Adding a scorer variant

Drop a file in `scorers/` exporting `name` and `score(set, title, artist)`. It is picked up
automatically by both the labeller and the runner, and measured against the same fixtures.

## Metrics

| metric | meaning |
| --- | --- |
| `hit` | returned a beatmap whose artist a human confirmed matches |
| `correctAbstain` | returned nothing, and nothing was right |
| `wrongArtist` | **the failure that matters** — returned someone else's song |
| `miss` | the right answer was in the pool; we returned nothing |
| `unreachable` | the right answer never came back from the API (a recall/query problem, not a scoring one) |
| `unlabelled` | top-1 has no verdict in `labels.json` yet |

## Results - 2026-09-22, 37 fixtures, threshold 70

`SHIPPED (src)` imports `scoreBeatmapMatch` **and** `resolveArtistTrust` directly from
`src/lib/osu.js`, so the benchmark measures what actually runs. It used to keep private
copies of the trust decision and the alias rule, which silently drifted: a fix to
`src/lib/osu.js` left this row scoring against logic that no longer existed anywhere. If a
scorer needs production behaviour, it imports it. `matrix` is now the frozen *pre-gate-fix*
port and is expected to diverge - that divergence is the measurement.

| scorer | hit | correctAbstain | **wrongArtist** | miss |
|---|---|---|---|---|
| `baseline` (before this work) | 29 (78.4%) | 6 | **1 (2.7%)** | 1 |
| `ladder` (Stage 1 + 2) | 30 (81.1%) | 3 | **4 (10.8%)** | 0 |
| `ladder+probe` (Stage 0 eager) | 30 (81.1%) | 3 | **4 (10.8%)** | 0 |
| `ladder+lazyprobe` (Stage 0 lazy) | 30 (81.1%) | 3 | **4 (10.8%)** | 0 |
| `matrix` (pre-fix production port) | 31 (83.8%) | 3 | **3 (8.1%)** | 0 |
| **`SHIPPED (src)`** | **31 (83.8%)** | 6 | **0 (0.0%)** | 0 |

The `matrix` -> `SHIPPED` row is the alias-presence fix on its own: **3 wrong-artist results
removed, every one of the 31 hits kept.** The three it removed were an obscure artist being
classed as junk and then ignored (`Kaneko Lumi` -> DJ Fresh's *The Feeling*), a verified
artist whose -40 doubt a perfect title simply outscored (`nihmune` -> Rameses B's *Kiss Me*),
and an artist with nothing on osu! at all (`Twinbed` -> Boom Kitty's *Trouble*).

Threshold sweep - the structural result:

```
scorer         thr   hit  abst  WRONG  miss
baseline        40    29     6      1     1
baseline        70    29     6      1     1
baseline       100    29     6      1     1
baseline       120    28     6      1     2
SHIPPED (src)   40    31     6      0     0
SHIPPED (src)   70    31     6      0     0
SHIPPED (src)  100    31     6      0     0
SHIPPED (src)  120    30     6      0     1
```

**Baseline cannot fix its failure with a threshold.** Its wrong answer scores at the top of
the range, because a perfect title score pays for a total artist mismatch. It survives every
threshold from 40 to 120 - raising strictness only converts a hit into a miss (120) while the
wrong answer stays.

**The gate is threshold-invariant.** Zero wrong answers at every threshold from 40 to 120,
because a confident DIFFERENT returns `-Infinity` and cannot be outscored. The Match
Strictness slider stops silently controlling artist correctness; it only trades hit for
abstain (at 120 one hit becomes a miss).

### What Stage 3 added over the ladder

Three changes, all aimed at the single pick rather than the alternatives list:

1. **Probe-verified confidence.** A low-confidence artist is checked against the corpus
   before it may confirm anything. `Nightcore Gaming` returns 4 sets - not an osu! artist -
   so it can no longer earn +100 by token-matching a mapset called `Nightcore`. Structured
   Spotify/Apple artists skip the check, so most tracks cost nothing.
2. **Graded title.** Exact equality (1.0) now outranks containment (0.92). Previously
   `Faded` and `Nightcore - Faded, Cheap Thrills, Alive, Airplanes Mashup` both scored a
   flat 1.0, letting a mashup tie the real song and win on artist noise.
3. **Popularity tiebreak** (MATCHING_PLAN 2e), log-scaled and capped at 10 - enough to
   separate near-identical candidates, never enough to override a real signal.

Live end-to-end, against the real API:

```
"Monster"  by YOASOBI          -> "Monster" by Yoasobi              (205)
"Monster"  by Imagine Dragons  -> "monster" by imagine dragons      (203)   two songs, one title, both right
"Lemon"    by 米津玄師           -> "Lemon" by Yonezu Kenshi / 米津玄師  (224)
"Faded"    by Nightcore Gaming -> "Faded" by Alan Walker            (125)   junk channel, correct answer
"Faded"    by Imagine Dragons  -> 0 results, rejection: wrong-artist
"Whatever" by Zxcvbnm Nobody   -> 0 results, rejection: artist-absent
```

### Stage 4: the refusal explains itself

`searchOsuBeatmaps` now returns a `rejection` alongside an empty result set, so "no beatmaps"
and "someone else's song" stop looking identical:

- `wrong-artist` - the song is on osu!, by a different artist (carries up to 3 examples)
- `artist-absent` - this artist has nothing on osu! at all (one probe, only on failure)
- `artist-unknown` - the artist string could not be verified (junk YouTube channel)
- `no-match` - nothing matched the title either

Building this surfaced a bug worth recording: the gate originally dropped refused candidates
outright, which destroyed the very evidence the message needs - a wrong-artist candidate is
refused *because* it matched the title, so it is never in the accepted pool. They are now
kept aside in `gatedOut`.

### Stage 0: the alias rung buys recall, not top-1 — and lazy probing forfeits it

Three fixtures were added specifically to try to make the alias rung decide a match
(`alias-required-romanized-only-mapset`): romanized title, native-script artist `米津玄師`,
against mapsets whose artist field is `Kenshi Yonezu` with **no** `artist_unicode`. No shared
characters, no romaji-fold path — only a corpus-learned alias can bridge them.

The attempt failed to move top-1, and the reason is worth recording. Those romanized-only
sets *are* hard-rejected by the ladder and *are* rescued by the probe:

```
"Kanden"  ladder = DIFFERENT (rung 7), score -Infinity
          probe  = SAME      (rung 2)
```

But for every such title osu! also has sets that *do* carry `artist_unicode: 米津玄師`, and
those win at rung 1 with a higher score. So the alias never decides the winner.

Measured on the right axis — recall rather than top-1:

| scorer | hit | wrongArtist | correct maps offered | correct maps hard-rejected |
|---|---|---|---|---|
| `baseline` | 29 | 2 | 799 | 0 |
| `ladder` | 30 | 1 | 787 | **16** |
| `ladder+probe` (eager) | 30 | 1 | 290 | **4** |
| `ladder+lazyprobe` | 30 | 1 | 787 | **16** |

The eager probe rescues **12 correct mapsets** from invisibility (16 -> 4), matching the 12
rung-2 firings exactly. A map scored `-Infinity` is not merely ranked low — it never reaches
the user's alternatives list at all.

**The lazy probe rescues none of them.** It only probes when nothing scored >= 150, and in
every one of these cases a native-field set already scored 215. Lazy probing and the alias
rung are in direct tension: the alias benefit is recall of *alternatives*, which only matters
once you already have a good match — which is exactly when lazy skips the probe.

So Stage 0 presents a real choice, not a free win:

- **top-1 is all that matters** -> lazy probe. Costs +2 calls per 30 tracks, alias adds nothing.
- **the alternatives list matters** -> eager probe. Rescues 12 correct maps, costs ~21 probes.

(`ladder+probe`'s much lower "offered" count, 290, is a separate artifact: putting the probe
bucket first triggers the early exit sooner, so fewer title queries run and the pool is
smaller. It is not the gate rejecting maps.)

### Stage 0 cost: solved by probing lazily

An *eager* probe — one per artist, up front — is a fixed tax paid whether or not it is
needed. Measured (probes memoized per distinct artist, `npm run bench:cost`):

```
scorer                title q  probes   total  per track
baseline                   35       0      35       1.17
ladder                     35       0      35       1.17
ladder+probe (eager)       18      21      39       1.30
ladder+lazyprobe           35       2      37       1.23
```

Eager probing does cut title queries (35 -> 18), but 21 probes cost more than that saves
when nearly every track has a different artist — which is what this fixture set is
(1.25 tracks per artist, close to the worst possible case).

**Lazy probing removes the trade-off.** Run the title queries first; probe only when they
fail to settle the question. Only **2 of 24** artists ever needed one. Accuracy is identical
to eager (27 hit / 1 wrong), for **+2 API calls across 30 tracks**.

This also makes the break-even question moot. Eager probing had to be justified by artist
repetition; lazy probing is bounded by the number of *unresolved* artists, so it is cheaper
than eager at every repetition ratio and can never cost more than a couple of calls over
not having it at all.

One subtlety the lazy path has to handle: when the probe lands, it re-scores the **whole**
pool, not just the sets the probe returned. The probe's value is the alias set it teaches
(かめりあ == "Camellia"), and that applies equally to candidates the title queries already
returned. Re-scoring costs no extra API call.

### What changed, case by case

- `colon-title` (`Re:Re:` by ASIAN KUNG-FU GENERATION): baseline confidently returned
  `QUARTET*RE-BOOT!` at 215. Fixed by Stage 2 provenance, in two steps that the harness
  separated cleanly: first the artist (`unreachable` - refused correctly, but the right
  answer had never been queried), then the title (`miss` -> `hit`, once the splitter stopped
  turning `Re:Re:` into artist `Re` / title `Re:`). Both halves are MATCHING_PLAN 4c.
- `yt-nightcore-noise`: still wrong. Source is YouTube, channel is `Nightcore Gaming`, and
  the title carries no artist at all. With no trustworthy artist signal Stage 2 deliberately
  disarms the gate rather than guessing. Stage 3 surfaces this as "artist unverified"
  rather than presenting it as a confident match.

## Limitations

- 37 fixtures is a baseline, not a verdict. MATCHING_PLAN Phase 1 asks for 100-150.
- Fixtures deliberately skew toward the hard cases this work targets, so `hit` here is not
  an estimate of real-world accuracy - only a number to move against.
- Artist repetition is unrealistically low (24 artists / 30 tracks), which understates the
  probe's cost benefit and gives its alias rung no chance to be decisive.
- Snapshots are a point-in-time view of the osu! corpus; re-capturing may shift results.


---

## Verified in the running app

`capture-ui.cjs` and `capture-rejection.cjs` drive the real app with Playwright
(needs `npm run dev` up and `NODE_PATH=$(npm root -g)`). Confirmed rendered, desktop
and mobile, against a live Spotify playlist:

- `Could not find one by Justin Bieber. Closest match:` above the beatmap it did find,
  which is left unticked so it never joins a bulk download unasked
- `HUGEL, SOLTO (FR) has no beatmaps on osu!`
- `No matching beatmapset found` (unchanged default)

## Regression check against 50 real Spotify tracks

Old (committed) vs new, same tracks, same threshold:

```
matched: OLD 34/50   NEW 33/50
```

The one lost match is a win: for "Been By Now" by Morgan Wallen the old code returned
"Have you been naughty or nice? (Game Ver.)" by Flambe!. The new code refuses it.

Two genuine bugs were found by this check and fixed:

- **Short titles were being rejected.** `titleSimilarity` reused `tokenSetSimilar`, whose
  "needs a 4-character token" guard exists to stop a short *artist* ("Ado") matching
  everything. Applied to titles it killed legitimate short ones - "Dai Dai" has only
  3-character tokens. Titles are now guarded on total length instead.
- **Glued-together artist names were rejected.** A map whose artist field reads
  "SteveLacyVEVO" is Steve Lacy, and mappers routinely paste channel or upload names in
  there. Added a spaces-removed containment rung (length-guarded at 6 characters).

## Cost and latency, measured

```
20 tracks at concurrency 3
  wall clock:    5.6s   (279ms per track)
  title queries: 25
  artist probes:  4     (0.20 per track)
  total calls:   29     (1.45 per track)
```

The probe is evidence-gated: if any candidate already names the artist exactly, the artist
demonstrably exists and no probe is spent. On a simulated YouTube playlist (every artist
low-confidence) this took probes from 1.00 to 0.20 per track. Probe failures are cached as
failures so a rate limit does not cause a re-probe on every remaining track.
