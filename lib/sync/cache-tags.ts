import { PROFILES_TAG } from "@/lib/sync/profiles"
import { FLAIR_MAP_TAG } from "@/lib/sync/customizations"
import { VALHALLAN_STATS_TAG } from "@/lib/sync/valhallan"
import { FLAIR_CATALOGUE_TAG, FLAIR_GRANTS_TAG } from "@/lib/sync/flairs"
import { ESPORTS_MATCHES_TAG } from "@/lib/sync/esports-matches"
import { SMURF_SET_TAG } from "@/lib/sync/smurf"
import { TRUE_COMBOS_TAG } from "@/lib/sync/true-combos"

/**
 * Every cached read a stale row can hide behind.
 *
 * **One list, two callers.** The /admin button and the CRON_SECRET endpoint
 * both refresh from here, because the failure this list exists to prevent has
 * already happened to the list itself: the flair catalogue and its grants were
 * added to the button months after they shipped, and until then editing them
 * outside the app left the site serving an hour-old cache with no sign
 * anything was wrong. Two copies of the list is the same bug with a second
 * place to forget.
 *
 * A new cached read is only covered if it is added here. That is the whole
 * contract, and it is worth stating plainly because nothing enforces it — a
 * missing tag is invisible until somebody edits a row outside the app and
 * wonders why the site disagrees.
 *
 * The last three are written by scripts rather than by this app, which is the
 * case a refresh is most needed for: nothing in a request can bust a tag when
 * the write came from a terminal. Esports matches matter most — a six-hour
 * window meant a profile could show half a career for the rest of the
 * afternoon after a sync.
 */
export const REFRESHABLE_TAGS = [
  PROFILES_TAG,
  FLAIR_MAP_TAG,
  VALHALLAN_STATS_TAG,
  FLAIR_CATALOGUE_TAG,
  FLAIR_GRANTS_TAG,
  ESPORTS_MATCHES_TAG,
  SMURF_SET_TAG,
  TRUE_COMBOS_TAG,
] as const
