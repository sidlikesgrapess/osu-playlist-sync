# 07 Re:Re: split (F-28)

## Scope

**Defect.** With no provider artist, the Artist/Title splitter in `src/lib/titleCleaner.js`
accepts a separator with no whitespace on either side. Pattern C (`/^(.+?)\s*[-:—–|•]\s*(.+)$/`,
titleCleaner.js:223) and the first separator of Pattern A (titleCleaner.js:219) therefore split
inside words: `Re:Re:` became artist `Re`, title `Re`; `ASIAN KUNG-FU GENERATION - Re:Re:` became
artist `ASIAN KUNG`. The probe for `Re` finds real sets by `RE`, so trust is high and the gate
refuses the AKG set as wrong-artist (the F-28 todo, test/search-replay.test.mjs:264-285).

**Decision (general rule, no list).** A separator char (`-`, `:`, en/em dash, `|`, `•`) splits
Artist/Title only when whitespace touches it on at least one side, and the title side may not
start with another separator char (so `Re:Re: - X` splits at the spaced dash, never at the colon).
Built once as a shared regex fragment, used by Pattern C and Pattern A. Quote patterns and the
subtitle `~` matcher are left alone. `stripTrailingSymbolNoise` dropping the trailing `:` is out of
scope. Trade off: a fully unspaced `Artist-Title` no longer splits; the unsplit title still searches.

**Acceptance.**
- `cleanSongTitle('Re:Re:', '', {source:'apple', providerArtist:''})`: title `Re:Re`, artist `''`, artistFromTitle false.
- `ASIAN KUNG-FU GENERATION - Re:Re:`: artist `ASIAN KUNG-FU GENERATION`, title `Re:Re`, artistFromTitle true.
- `Re:Re: - ASIAN KUNG-FU GENERATION`: splits at the spaced dash only.
- `Re:Re: / cover by X`: no colon split.
- Spaced forms still split (`A - T`, `A: T`, `A | T`, `A • T`, `YOASOBI - Idol`); quoted, cover, by tests green.
- Unspaced `Artist-Title` / `Artist:Title` do not split.
- test/titleCleaner.test.mjs:52-56 rewritten; F-28 loses its todo flag and passes (no split, not wrong-artist, top set AKG `Re:Re:`), replay MAX_CALLS / UNCOVERED gates still pass.
- `npm test`: 0 fail, 0 todo; cleaner-diff snapshot unchanged.
- `npm run bench`: SHIPPED hit >= 31, abstain 6, WRONG 0, offered >= 752; bench:cost <= 1.49/track.
- Live :3000, Song mode, `Re:Re:` and `ASIAN KUNG-FU GENERATION - Re:Re:` show the AKG mapset at 1280x800 and 375x812.

## Implementation

**Rule (src/lib/titleCleaner.js:125-133).** `splitSeparator(chars)` builds one regex fragment,
`(?:\s+[SEP]\s*|\s*[SEP]\s+)(?![\sSEP])`: a separator char counts only when whitespace touches it
on at least one side, and the title after it may not open with another separator or space. The
lookahead is what makes `Re:Re: - X` skip the `: ` (next char is `-`) and split at ` - `.
`COVER_SPLIT` (:131, Pattern A's first separator, chars `-:—–`) and `STANDARD_SPLIT` (:133,
Pattern C, chars `-:—–|•`) are built from it once at module load and used at :229 and :233.
No title, artist or string list was added. Quote patterns, Pattern B/D, the `~` subtitle matcher
and `stripTrailingSymbolNoise` are unchanged.

Offline cleaner results (node, no provider artist):
`Re:Re:` gives title `Re:Re`, artist `''`, artistFromTitle false; `ASIAN KUNG-FU GENERATION - Re:Re:`
gives `ASIAN KUNG-FU GENERATION` / `Re:Re`; `Re:Re: - ASIAN KUNG-FU GENERATION` gives `Re:Re` /
`ASIAN KUNG-FU GENERATION`; `Re:Re: / cover by X` gives no split; `Artist-Title` and `Artist:Title`
give no split; `A - T`, `A: T`, `A | T`, `A • T`, `A — T`, `A- T`, `A -T` all split to `A` / `T`.

**Tests.**
- test/titleCleaner.test.mjs:52-57 rewritten: `Re:Re:` with an empty Apple artist is not split.
- test/titleCleaner.test.mjs:59-79 new: AKG split, flipped order, cover form, unspaced no-split,
  seven spaced/half-spaced forms still split.
- test/search-replay.test.mjs:265-285: F-28 lost its todo flag. It now asserts artistFromTitle
  false, rejection not wrong-artist, no uncovered query, top set ASIAN KUNG-FU GENERATION `Re:Re:`.
  The "splitter ran" and "probe ran" assertions were removed, since nothing is guessed now.

**Results.**
- `npm test`: before 193 / 192 pass / 0 fail / 1 todo (shots/07/tests-before.txt); after 194 / 194
  pass / 0 fail / 0 todo (shots/07/tests-after.txt). cleaner-diff snapshot unchanged and passing.
- `npm run bench`: output byte identical before and after (shots/07/bench-before.txt,
  bench-after.txt). SHIPPED hit 31, abstain 6, WRONG 0, miss 0, offered 752, matching the baseline.
- `npm run bench:cost`: SHIPPED 55 calls, 1.49/track, unchanged (bench-cost-after.txt).
- Live :3000 (shots/07/rere.mjs, rere-results.json): Song mode, `Re:Re:` and
  `ASIAN KUNG-FU GENERATION - Re:Re:` at 1280x800 and 375x812. Each ran one /api/osu/search (200),
  top set `ASIAN KUNG-FU GENERATION - Re:Re:`, no artistOverride/titleOnly, rejection null, no
  "Could not find one by", no horizontal scroll, row auto selected (1 of 1). Screenshots
  desktop_rere.png, desktop_akg_rere.png, phone_rere.png, phone_akg_rere.png. The phone shots are
  viewport only, so the match card sits below the fold; the AKG match text was confirmed in the body.

Trade off, as scoped: a fully unspaced `Artist-Title` is now searched whole rather than split.

## Verification

Round 1, all three lenses passed. No must fix findings.

- **Regression**: read the diff, ran `npm test` (194 tests, 194 pass, 0 todo), `npm run bench`
  (identical to the baseline apart from a warning PID; SHIPPED hit 31, abstain 6, WRONG 0,
  offered 752) and `npm run bench:cost` (1.49 per track). Compared the old and new cleaner on 16
  edge cases: only `Re:Zero - Artist` changed, and it improved (artist no longer `Re`). Callers
  and the song shape are untouched.
- **Acceptance**: the general rule `splitSeparator` (titleCleaner.js:125-133, used at :229 and
  :233) needs whitespace on at least one side of a separator. All cleaner acceptance cases pass,
  the F-28 todo test now passes, and a live Playwright run at 1280x800 and 375x812 returns the
  ASIAN KUNG-FU GENERATION `Re:Re:` set with no rejection, no flag and no horizontal scroll.
- **Rules**: no per item list, bench/ and test/fixtures untouched, no user facing copy changed,
  live script paced (3 s between searches, 150 s hard timeout).

Follow ups (not must fix):
- Pattern A and Pattern C descriptions are written twice in titleCleaner.js (:130/:228, :132/:232).
- The desktop row labels a text query "YouTube Track" while mobile says "Source Track"; predates this item.
- Deliberate change: a fully unspaced `Artist-Title` or `Artist:Title` no longer splits.
