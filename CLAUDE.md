# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Next.js dev server on :3000
npm run build    # production build
npm run start    # serve a production build
npm run lint     # next lint
```

**There is no test framework in this repo.** `package.json` has no `test` script and no
runner is installed. If you add tests, `node --test` needs no new dependency.

The one exception is **`bench/`**, a dev-only benchmark for song → beatmap matching:

```bash
npm run bench          # replay fixtures through every scorer, offline
npm run bench:sweep    # threshold sweep
npm run bench:cost     # API calls per track
npm run bench:capture  # re-hit the osu! API (needs .env.local) — rarely
```

Nothing in `bench/` is imported by `src/` or deployed; the dependency runs the other way
(`bench/scorers/shipped.mjs` imports the real `src/lib/osu.js`). It replays captured API
responses, so it is deterministic and needs no credentials to run. **Run it before and
after any change to `scoreBeatmapMatch`** — see `bench/README.md`.

**Never run `npm run build` while `npm run dev` is running.** Both write to `.next/`, and
the build wipes the chunks the dev server is serving — every route starts 404ing until dev
is restarted. Stop dev first.

## Environment

`OSU_CLIENT_ID` / `OSU_CLIENT_SECRET` (osu! OAuth, **Client Credentials** grant) in
`.env.local`. There is no mirror setting: the download mirror order is set only in
`src/lib/mirrors.js` (an old `DEFAULT_MIRROR` in `.env.local` is simply ignored).

Without credentials the app degrades rather than crashes: `getOsuAccessToken` returns
`null` and callers return `{ isDemo: true }` with empty results. When touching osu!
API code, preserve that path — the UI keys off `isDemo` to show the setup guide.

YouTube, Spotify and Apple Music extraction need no keys at all.

## Architecture

### The song object is the central contract

Everything converges on one mutable shape that flows extractor → page state → table → download.
Understanding it explains most of the codebase:

```
{ id, index, title, channelTitle, thumbnail, duration,   // from the extractor
  source,                                                // 'spotify' | 'apple' | 'youtube' | 'query'
  cleanQuery, extractedTitle, extractedArtist,           // from titleCleaner
  fallbacks, queries,                                    // alternate search queries
  hasSearched, isSearching,                              // UI state, mutated in page.js
  matchedBeatmap, allMatches,                            // filled by /api/osu/search
  rejection }                                            // why the gate refused, when it did
```

`source` is load-bearing, not decoration: it decides whether the artist is trusted enough to
*reject* a candidate (see the matching section below), so keep it populated on every path.
`artistOverride` sits on the *beatmapset*, not the song — a song can hold a mix of gated and
ungated matches in `allMatches`.

`src/app/page.js` owns the `songs` array and is the only place this shape mutates.
Components receive songs and call back up; they never fetch.

### Two entry paths, one pipeline

1. **Playlist / track / text search** — `/api/playlist` → `extractMusicData`
   (`src/lib/extractors.js`) → per-track `cleanSongTitle` → songs with no match yet →
   client fans out to `/api/osu/search` at concurrency 3.

2. **osu! player** — `/api/osu/player` resolves a profile, `/api/osu/player/beatmaps`
   fetches best / most-played / favourites.

Path 2 reuses path 1's machinery via `beatmapToSong` in `page.js`, which adapts a beatmapset
into the song shape **pre-matched** (`hasSearched: true`, `matchedBeatmap` already set). That
adapter is why selection, export and download work identically for both paths — keep it in
sync when the song shape changes.

### Matching does not trust osu!'s search ranking

`searchOsuBeatmaps` (`src/lib/osu.js`) runs several query variants, pools every candidate
across all of them, scores each with `scoreBeatmapMatch`, sorts by that score, and drops
anything under a score cutoff. That cutoff is no longer a number the UI hands in: the Match
Strictness slider is a 0-100 value, and `src/lib/matchStrictness.js` turns it into three
knobs at once (`titleFloor`, `minScore`, `maxArtistRung`). A bare cutoff could not express
either end of the range — it can only filter what the scorer already chose to keep, so 0
could not reach past the hard title floor and 100 was reachable by a non-exact match. Change
the curve there, never in `osu.js`, and remember 50 must keep reproducing floor 0.50 /
cutoff 70 because that is what every `npm run bench` number was measured against.
It early-exits at score ≥ 150. The osu! API's own `relevance_desc` order is deliberately
ignored.

**The artist is a gate, not a weight — do not turn it back into a number.** A confident
`DIFFERENT` verdict returns `-Infinity`, so a wrong artist can never be outscored by a good
title. This is the whole point: before it, two different songs sharing a title both scored
215 and *no* threshold could separate them. `artistVerdict` is a ladder of independent
evidence where the first rung wins, deliberately not a blend.

How far the artist is trusted depends on where it came from (`source` on the song object).
Spotify/Apple hand us a real artist field and are trusted on arrival. Anything else is
settled by `resolveArtistTrust` against the corpus, and **the test is the alias set, never a
row count**: aliases are only recorded for sets whose own artist links back to the target,
so "Kaneko Lumi" (3 sets, all hers) verifies while "Nightcore Gaming" (4 loosely-related
sets, none linked) does not. A count threshold got this exactly backwards — it classed a
real-but-obscure artist as junk and then ignored the artist entirely, which is the one case
where a title collision is most likely. Outcomes:

| evidence | trust | effect |
|---|---|---|
| structured source | `high` | may reject |
| a candidate in the pool links to the artist | `high` | may reject, and the pool supplies the aliases for free |
| probe finds linked sets | `high` | may reject |
| probe finds nothing at all | `high` | may reject — nothing on osu! answers to this name |
| probe finds sets but none linked | `none` | the string is not an artist; judge on title alone |
| probe failed (429) | `low` | doubt only, never refuse |

The pool is checked before the probe, so a correctly extracted artist costs no call at all;
probes stay at ~0.2 per track.

When nothing passes, the result carries a `rejection` (`wrong-artist`, `artist-absent`,
`artist-unknown`, `no-match`) so the UI can say *why*. Gated-out candidates are kept in
`gatedOut` precisely because they are the evidence for that message — a wrong-artist
candidate is refused *because* its title matched.

`wrong-artist` and `artist-absent` both still return results when a title match exists:
those candidates come back in `beatmapsets` like any other match, flagged
`artistOverride: true` with `matchScore: null`. They differ only in what can be *said* — the
artist has nothing on osu! at all, versus this particular song of theirs is not mapped.
Hiding them helps nobody — the user can see the artist differs and judge. What the gate buys
is that `page.js` **does not auto-select** a flagged result, so it can never slip into a bulk
download, and the match column introduces it with "Could not find one by <artist>. Closest
match:". Keep both halves: showing it without the notice, or showing the notice while
auto-selecting, each defeats the point.

`src/lib/titleCleaner.js` exists only to stop noise tokens (`Nightcore`, `Official Video`,
`+HDHR`) from producing zero-result queries. It is a recall tool, not a precision tool —
precision is `scoreBeatmapMatch`'s job.

**See `MATCHING_PLAN.md`** before working on matching — but note it is partly historical now.
The unicode title/artist fields, `tags` credit, graded title similarity and a popularity
tiebreak have all landed. **Beatmap `duration` is still unused**, and the cleaner has not been
shrunk (Phase 4). Measure any change with `npm run bench` first; without it, matching changes
are unverifiable.

### Zero-key extraction is scraping, and it is fragile

- **Spotify** — parses `__NEXT_DATA__` JSON out of the `/embed/` page HTML
- **Apple Music** — scrapes the public page
- **YouTube** — unofficial Innertube API

These break whenever a provider changes its markup or payload shape. Each has a fallback
path; when one silently returns zero tracks, suspect the provider changed rather than a
local regression.

### Downloads

`/api/download` proxies four mirrors in order with a 6s timeout each. If **all** fail it
generates a synthetic `.osz` (`generateFallbackOsz`) containing a placeholder map and 8
bytes of fake mp3. This means a successful download response does not guarantee a real
beatmap — check the `X-Selected-Mirror` header, which is `fallback-generator` in that case.

ZIP bundling is client-side (JSZip in `page.js`), not server-side.

### API call budget

The osu! API rate-limits aggressively, and two conventions exist to stay under it:

- **Token caching** — a module-level singleton in `src/lib/osu.js` survives across requests
  in a warm serverless instance; it refreshes 60s before expiry.
- **Fetch one window, paginate locally** — `getUserBeatmapCollection` pulls up to 100 items
  in a single call and the client paginates in memory (`pageSlice` in `page.js`). Do not add
  per-page fetches. Mode/status filters for collections are applied **after** the fetch, in
  `matchesCollectionFilters`, because the osu! collection endpoints don't support them.

## Conventions

- **Styling is inline `style={{}}` objects**, not a CSS framework. `src/app/globals.css`
  holds only resets, fonts and scrollbar theming. Shared visual logic (star colours, status
  badges, compact number formatting) lives in `src/lib/beatmapFormat.js` — use it rather than
  re-deriving colours per component.
- **Route handlers all set `export const dynamic = 'force-dynamic'`.** New osu!-backed routes
  need this or Next will cache responses at build time.
- `osuApiGet` attaches `.status` to thrown errors so callers can distinguish 429 from 404.
  Route handlers map those to user-facing messages; preserve that when adding endpoints.
- Desktop and mobile have **separate components** (`SongRow.js` / `SongCardMobile.js`).
  Changes to row behaviour usually need to land in both.
