# Song → Beatmap Matching: Improvement Plan

Goal: a playlist track that **isn't the original recording** (cover, remix, nightcore,
TV-size, romanized/unicode variant) should still resolve to the right osu! beatmapset.

## The core problem

Cleaning is a **recall** tool — it exists so osu!'s search doesn't return zero rows
because we sent it a token like `Nightcore`. It is not a **precision** tool.

Right now precision is delegated almost entirely to `src/lib/titleCleaner.js`
(a ~90-entry hand-written blocklist), while `scoreBeatmapMatch` in `src/lib/osu.js`
— the function that actually picks the winning mapset — discards most of the signal
the osu! API already hands us.

That's backwards. A blocklist only removes noise we anticipated. A scorer works on
songs we've never seen. **The fix is mostly in the scorer, not the cleaner.**

---

## Phase 1 — Benchmark harness (do this first)

Nothing below is verifiable without it. There are currently no tests and no test runner,
which is why the blocklist accreted 90 terms: every change is a guess.

- [ ] Add a test runner (`node --test` is enough; no new dependency needed)
- [ ] Build a fixture of 100–150 real playlist entries: `{ title, artist, duration }`
      paired with the **expected beatmapset id**
      - Cover the hard cases deliberately: Japanese/unicode titles, covers, remixes,
        TV-size vs full, `feat.` variants, titles containing `-` or `:`
- [ ] Benchmark script reporting **top-1 accuracy**, **top-5 accuracy**, **false-positive rate**
- [ ] Record the current baseline before changing anything

Every item below then becomes a measurable delta instead of a hunch — including tuning
the default `minScore` threshold (currently `70`, `src/lib/osu.js`) against data.

---

## Phase 2 — Fix the scorer (`scoreBeatmapMatch`, `src/lib/osu.js`)

This is where the real wins are, in rough order of expected impact.

### 2a. Score against the unicode fields — biggest single win
- [ ] Compare against the best of `title`/`title_unicode` and `artist`/`artist_unicode`

`scoreBeatmapMatch` currently reads only `beatmap.title` / `beatmap.artist`.
`formatBeatmapset` already surfaces the unicode variants. A Spotify track arriving as
`藍二乗 — ヨルシカ` can never exact-match romanized `Ai Nijou` / `Yorushika`, so it takes
`-60` (title) **and** `-80` (artist) and dies below the threshold of 70. Likely fixes a
large slice of Japanese-language misses on its own.

### 2b. Use duration as a discriminator
- [ ] Thread Spotify/Apple `duration` through `extractors.js` into the search request
- [ ] Compare against beatmap `total_length`; penalise large mismatches

`t.duration` is already extracted in `extractors.js` and then never used. When the playlist
track is 4:20 and a candidate is 88s, that candidate is a TV-size. This is a strong,
completely generic signal needing no word list — and it's the best defence against the
TV-size / short-ver problem that a third of the blocklist tries to handle lexically.

### 2c. Graded title similarity instead of binary
- [ ] Replace exact / substring / `-60` with a continuous similarity score

Today there is no middle ground, so `Senbonzakura` vs `Sen bon zakura` scores identically
to a completely unrelated song. A character-bigram Dice coefficient (~15 lines, no
dependency) gives a continuous 0–1 and removes a lot of the "did I strip exactly the right
suffix" pressure from the cleaner.

### 2d. Carry `tags` and `source` through and score on them
- [ ] Add `tags` / `source` to `formatBeatmapset`
- [ ] Credit an artist match found in tags (smaller weight than a direct artist match)
- [ ] **Verify first** against a live osu! search response that both fields are present
      on beatmapset *search* results

For exactly the case we care about — the playlist track isn't the original — the original
artist usually sits in the mapset's `tags`, and the anime/game in `source`. A Camellia
remix mapped as `artist: "Camellia"` currently scores an artist mismatch and takes `-80`.

### 2e. Popularity prior as a tiebreaker
- [ ] Small log-scaled bonus on `favouriteCount` (already carried through)

Among near-ties, the popular mapset is nearly always the intended one.

---

## Phase 3 — Query strategy (`searchOsuBeatmaps`, `src/lib/osu.js`)

- [ ] Issue **`title` alone first** (core title, parentheticals stripped)
- [ ] Score all returned sets locally; only escalate to `artist title` if the best local
      score is below a confidence bar
- [ ] Keep "title without subtitle" as the third rung

Currently 3–5 sequential API calls fire per song at concurrency 3. Adding artist tokens
over-constrains precisely in the case we're targeting — when the osu! artist *is* different
because it's a cover or remix. Result: fewer calls, better recall, less rate-limit exposure.

---

## Phase 4 — Shrink the cleaner (`src/lib/titleCleaner.js`)

Only after the scorer is carrying its weight.

### 4a. Keep generic rules, drop the vocabulary
- [ ] **Keep** the shape-based patterns (`\d+pp`, `\d{3,4}p`, `\d+%`, `★`, `\d+x100`) —
      general and essentially free
- [ ] **Cut** `BRACKET_NOISE_TERMS` to ~15 entries that are both common in real playlists
      and actually damaging: `official` / `music video` / `audio` / `lyrics` / `MV` /
      `feat` / `remaster` / `HD` / `4K` / `sped up` / `slowed` / `nightcore` / `live` /
      `cover` / `TV size`
- [ ] **Drop** the osu!-gameplay vocabulary: `inner oni`, `ura oni`, `tatsujin`,
      `four dimensions`, `muzukashii`, `歌ってみた`, etc. These appear in osu! *gameplay-video*
      titles, not in playlists

### 4b. Stop deciding; start proposing
- [ ] For brackets not matching the small blocklist, emit **both** the with-bracket and
      without-bracket variants as query candidates and let the scorer pick

This is the structural move: the cleaner stops guessing and hands the decision to the layer
that has the candidate data.

### 4c. Don't parse `Artist - Title` when the source already told us
- [ ] Run title-splitting **only for YouTube**, where there's genuinely no structured metadata
- [ ] Skip it for Spotify / Apple, which already supply a separate `channelTitle`

There's a live bug here. The splitter is `/^(.+?)\s*[-:—–|•]\s*(.+)$/` — with `\s*` on both
sides it splits on a bare colon, so the Spotify track `Re:Re:` becomes artist `Re`,
title `Re:`. Gating this by source deletes a good chunk of the file *and* fixes the bug.

---

## Ordering rationale

1. **Phase 1** — nothing else is measurable without it
2. **2a** — likely the largest single win, and it's a few lines
3. **2b, 2c** — generic signals that replace lexical guesswork
4. **2d, 2e** — additional signal, needs one API-shape check first
5. **Phase 3** — fewer API calls, better recall
6. **Phase 4** — safe to shrink the blocklist only once the scorer compensates

Phases 2 and 3 live in `src/lib/osu.js`. The cleaner shrinks last, as a consequence.
