// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/** The live scorer, as shipped in src/lib/osu.js. The baseline every variant is measured against. */
import { scoreBeatmapMatch } from '../../src/lib/osu.js';
export const name = 'baseline';
export const score = (set, title, artist) => scoreBeatmapMatch(set, title, artist);
