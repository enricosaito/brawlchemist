/**
 * A true combo: a string that cannot be escaped once the first hit lands.
 *
 * The clip is the point. Notation tells you what to press, but "dLight → nAir"
 * is only legible to someone who already knows the combo, so every entry is a
 * video first and a caption second.
 */
export interface TrueCombo {
  /** Slug, unique across the library — the React key and the anchor. */
  id: string
  /** Input notation, e.g. "dLight → nAir". */
  notation: string
  /** When it works: the damage window, the gravity, the stage position. */
  note?: string
  /** Public URL of the clip — a Vercel Blob upload. */
  src: string
  /** Poster frame, so a card isn't a black rectangle before it plays. */
  poster?: string
}

/**
 * Where the clips live: `true_combos` in Postgres, pointing at Vercel Blob.
 *
 * This module used to hold the library itself. That was right for five entries
 * and wrong for two hundred, because it made adding a video a deploy. The rows
 * moved to a table an operator curates from /admin (see lib/sync/true-combos.ts
 * and the Combos tab); what stays here is the shape and the recipe, which are
 * code.
 *
 * **Encode before uploading.** Clips are 2-4 seconds, silent, and read frame by
 * frame, so the player assumes 30fps for its frame-step button:
 *
 *   ffmpeg -i in.mp4 -an -vf "scale=-2:480,fps=30" -c:v libx264 -crf 28 \
 *     -preset slow -pix_fmt yuv420p -movflags +faststart out.mp4
 *   ffmpeg -i out.mp4 -frames:v 1 -vf "scale=-2:480" poster.webp
 *
 * `-an` drops an audio track nobody will hear, `+faststart` lets the clip play
 * before it has finished downloading, and `yuv420p` is what Safari will decode.
 * A three-second clip lands around 150-300KB at these settings.
 *
 * A combo is a game fact and there is no endpoint for it, so nothing is seeded:
 * every row is a clip somebody recorded, and the empty state says so.
 */
