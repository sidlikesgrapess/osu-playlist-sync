/**
 * The Match Strictness slider: one 0-100 number, three knobs.
 *
 * It used to be the raw `minScore` cutoff (0-150) handed straight to the matcher, which
 * made both ends of the slider lie:
 *
 *   - **0 did not mean "show me anything".** `scoreBeatmapMatch` hard-rejects a candidate
 *     whose title similarity is under a floor, *before* any threshold is consulted, so
 *     dragging to 0 could not reach a candidate the floor had already killed.
 *   - **150 did not mean "exact only".** Scores run to ~225, so 150 is comfortably reached
 *     by a containment title match ("Kiss Me" for "Kiss Me!") with nothing exact about it.
 *
 * A cutoff can only ever filter what the scorer already decided to keep, so the ends of the
 * range have to move the *decision*, not just the bar. Strictness therefore drives:
 *
 *   `titleFloor`     how close the title must be before the candidate is considered at all
 *   `maxArtistRung`  how far down the artist ladder still counts as the same person
 *   `minScore`       the familiar score cutoff, now derived rather than typed in
 *   `salvageFloor`   how close a GATED candidate's title must be to be shown anyway, flagged
 *
 * What it deliberately does NOT change is the artist gate itself. A confident DIFFERENT is
 * -Infinity at every setting, including 0 — those candidates still come back, flagged and
 * unticked, which is what "show me everything" should mean. Letting the slider switch the
 * gate off would restore the exact bug the gate exists to prevent (see CLAUDE.md).
 *
 * `salvageFloor` is what makes that promise true. The gate is absolute, so at 0 every knob
 * above can be wide open and the row still comes back empty with a bare "no beatmaps by this
 * artist" — the candidates existed, they were just gated, and the salvage that shows them
 * anyway used to sit at a hardcoded 0.92 the slider could not reach. Loosening the gate to
 * fix that would be the wrong lever; loosening what we are willing to SHOW is the right one,
 * because a salvaged candidate is flagged and never auto-selected either way.
 */

export const DEFAULT_STRICTNESS = 50;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Anchored at three points, linear between them:
 *
 *   |              |   0 (loosest)  |  50 (default)  |  100 (strictest)  |
 *   | titleFloor   |      0.00      |      0.50      |       1.00        |
 *   | minScore     |      -100      |        70      |        100        |
 *   | artistRung   |         6      |         6      |          3        |
 *   | salvageFloor |      0.00      |      0.92      |       0.92        |
 *
 * 50 reproduces the previous default exactly (floor 0.50, cutoff 70), so the middle of the
 * slider is the behaviour every benchmark number was measured against.
 *
 * At 0 both floors are *below* anything a candidate can score: the title term bottoms out at
 * -60, so a -100 cutoff cannot reject, and a 0.00 floor admits a candidate with nothing in
 * common but the query that found it. 0 therefore means "everything osu! returned, ranked",
 * which is what it has to mean for the end of a slider to be honest. Gentler anchors were
 * tried first (floor 0.30, cutoff 0) and did nothing at all — title similarity is bimodal in
 * practice, either near 1 or near 0, so a floor in the middle of the range never binds.
 *
 * At 100 `titleFloor` 1.0 admits only an exact title, and `maxArtistRung` 3 admits only the
 * rungs that establish *identity* rather than resemblance: an exact string, a spelling
 * osu!'s own corpus proves is the same artist, or the same tokens in another order. So
 * "Yonezu Kenshi" still matches "Kenshi Yonezu" — one person, Japanese name order — while
 * romaji folding, glued names, a tags mention and bigram similarity are all cut.
 *
 * Exactness here means the same artist, not the same keystrokes. Cutting rung 3 was tried
 * and rejected: it made "Kenshi Yonezu" return *wrong-artist* against Yonezu Kenshi's own
 * map, which is not a stricter answer, just a wrong one.
 *
 * `minScore` is capped at 100 rather than pushed to the top of the range because at 100 the
 * floors *are* the filter; a cutoff racing them would start rejecting exact matches for
 * being unranked and unpopular.
 *
 * `salvageFloor` rides the same curve as `titleFloor` so the two can never disagree about
 * what counts as the same song, and it stops climbing above the default: 0.92 is the
 * containment tier, the loosest rung that still means "this really is that song", and a
 * salvaged candidate is a labelled non-match, not a match. Tightening it further at the
 * strict end would only delete the explanation, never a selection.
 */
export function strictnessProfile(strictness) {
  const raw = Number(strictness);
  const s = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : DEFAULT_STRICTNESS;

  if (s <= 50) {
    // The floor stays at 0 for the whole lower half and the SCORE does the grading.
    //
    // A floor is a cliff, not a dial: an unrelated candidate scores exactly 0 similarity, so
    // the instant the floor leaves 0 every one of them disappears at once and the rest of
    // the lower half has nothing left to filter. Raising it gradually (linearly, then
    // quadratically) was tried and both collapsed to the same single step. The score is
    // continuous where the floor is not, so below the default it is the better instrument.
    const t = s / 50;
    // The floor stays flat at 0 through the loose half and only lifts over the last quarter,
    // arriving at 0.50 exactly at the default. That matters: 0.50 is the floor every
    // benchmark number was measured against, and without it a same-artist map with an
    // unrelated title scores past 70 on artist credit alone (Ado's *Gira Gira* answering a
    // search for *Usseewa*). The loose end gets its range; the default keeps its guarantee.
    const floorT = Math.min(1, Math.max(0, (s - 25) / 25));
    return {
      strictness: s,
      titleFloor: lerp(0, 0.5, floorT),
      minScore: lerp(-100, 70, t),
      maxArtistRung: 6,
      salvageFloor: lerp(0, 0.92, floorT),
    };
  }

  const t = (s - 50) / 50;
  return {
    strictness: s,
    titleFloor: lerp(0.50, 1.00, t),
    minScore: lerp(70, 100, t),
    maxArtistRung: lerp(6, 3, t),
    salvageFloor: 0.92,
  };
}

/** Short name for the current setting. */
export function strictnessLabel(strictness) {
  const s = Number(strictness);
  if (s <= 10) return 'Anything';
  if (s <= 35) return 'Loose';
  if (s <= 65) return 'Balanced';
  if (s <= 90) return 'Strict';
  return 'Exact only';
}

/** One line telling the user what this setting will actually do. */
export function strictnessSummary(strictness) {
  const s = Number(strictness);
  if (s <= 10) return 'Everything osu! returned, closest first';
  if (s <= 35) return 'Loose title matches allowed';
  if (s <= 65) return 'Clear title match, same artist';
  if (s <= 90) return 'Near-exact titles only';
  return 'Exact title and artist only';
}
