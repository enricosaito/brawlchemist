// Backfill account level + lifetime playtime for high-rated players.
//
// Usage:
//   node scripts/sync-player-stats.mjs [--min-rating 2300] [--rpm 6]
//                                      [--limit 500] [--refresh 30] [--dry]
//
// These are the two facts the "possible smurf" reading needs (see
// lib/profile/smurf.ts) and the only two it needs that /ranked does not carry.
// The site fills them in as a side effect of profile views, which costs no API
// budget at all — this script exists for the cold start, where nobody has
// looked at most of the ladder yet and the tag would render almost nowhere.
//
// It is the ONE thing here that spends Brawlhalla API budget on its own
// (cardinal constraint #1), so it is built to spend it slowly and out of the
// way of real visitors:
//
//   * The budget is 180 requests per 15 minutes, i.e. 12/min for the whole
//     site. The default --rpm 6 takes half and leaves the other half to live
//     traffic, which puts ~2,000 players at a little over five hours.
//   * A 429 means a real visitor is being turned away right now, so it backs
//     off for a full minute rather than retrying into the wall.
//   * Highest rating first. Stopping it early therefore leaves the ladder's
//     top covered rather than a random slice, and those are the profiles and
//     leaderboard rows anyone actually reads.
//
// Idempotent and resumable: `stats_synced` records what has been read, and
// --refresh skips anything read in the last N days.

import fs from "node:fs"
import postgres from "postgres"
import { config } from "dotenv"

config({ path: ".env.local" })

const BH = "https://api.brawlhalla.com"

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i > -1 && args[i + 1] != null ? Number(args[i + 1]) : fallback
}
const DRY = args.includes("--dry")
const MIN_RATING = flag("min-rating", 2300)
const RPM = Math.max(1, flag("rpm", 6))
const LIMIT = flag("limit", Infinity)
const REFRESH_DAYS = flag("refresh", 30)

/**
 * The thresholds, read out of the module that owns them.
 *
 * Node can't import the .ts, and a second copy of "75" in this file is exactly
 * the drift lib/profile/smurf.ts warns about — so the numbers are lifted from
 * the source rather than restated, and a rename there fails loudly here instead
 * of silently reporting a different population than the site shows.
 */
function threshold(name) {
  const src = fs.readFileSync("lib/profile/smurf.ts", "utf8")
  const m = new RegExp("export const " + name + " = (\\d+)").exec(src)
  if (!m) throw new Error(name + " not found in lib/profile/smurf.ts")
  return Number(m[1])
}
const MAX_LEVEL = threshold("SMURF_MAX_LEVEL")
const MAX_PLAYTIME_SECONDS = threshold("SMURF_MAX_PLAYTIME_HOURS") * 3600

const key = process.env.BRAWLHALLA_API_KEY
if (!key) throw new Error("BRAWLHALLA_API_KEY missing from .env.local")

const sql = postgres(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  { prepare: false, max: 1 },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** One /stats payload, or null. Never throws: a miss is a skip, not a stop. */
async function fetchStats(id) {
  const res = await fetch(`${BH}/player/${id}/stats?api_key=${key}`)
  if (res.status === 429) return "throttled"
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

const candidates = await sql`
  SELECT brawlhalla_id, username, rating
  FROM players
  WHERE rating >= ${MIN_RATING}
    AND (
      stats_synced IS NULL
      OR stats_synced < now() - ${`${REFRESH_DAYS} days`}::interval
    )
  ORDER BY rating DESC NULLS LAST`

const todo = Number.isFinite(LIMIT) ? candidates.slice(0, LIMIT) : candidates
const gapMs = Math.round(60_000 / RPM)
const etaMin = Math.round((todo.length * gapMs) / 60_000)
console.log(
  `${todo.length} players at ${MIN_RATING}+ need stats; ${RPM}/min → ~${etaMin} min`,
)
if (DRY) {
  console.log("(dry run — nothing fetched or written)")
  await sql.end()
  process.exit(0)
}

let written = 0
let missing = 0
let throttled = 0

for (const [i, p] of todo.entries()) {
  const stats = await fetchStats(p.brawlhalla_id)
  if (stats === "throttled") {
    throttled++
    console.log(`  429 — backing off 60s (${i}/${todo.length} done)`)
    await sleep(60_000)
    continue
  }
  if (!stats || typeof stats.level !== "number") {
    // No stats record at all. Stamp it anyway, or every run re-asks the same
    // dead ids and spends the budget learning nothing.
    missing++
    await sql`
      UPDATE players SET stats_synced = now()
      WHERE brawlhalla_id = ${p.brawlhalla_id}`
    await sleep(gapMs)
    continue
  }

  // Summed the same way computeAccountStats does it on the profile, so a
  // backfilled row and a page-view row can never disagree about a threshold.
  const playtimeSeconds = (stats.legends ?? []).reduce(
    (a, l) => a + (l.matchtime ?? 0),
    0,
  )
  await sql`
    UPDATE players
    SET level = ${stats.level},
        playtime_seconds = ${playtimeSeconds},
        stats_synced = now()
    WHERE brawlhalla_id = ${p.brawlhalla_id}`
  written++
  if (written % 25 === 0) {
    console.log(`  ${written}/${todo.length} — last: ${p.username}`)
  }
  await sleep(gapMs)
}

const [summary] = await sql`
  SELECT
    count(*) FILTER (WHERE rating >= ${MIN_RATING})::int AS eligible,
    count(*) FILTER (WHERE rating >= ${MIN_RATING} AND stats_synced IS NOT NULL)::int AS known,
    count(*) FILTER (
      WHERE rating >= ${MIN_RATING}
        AND level <= ${MAX_LEVEL}
        AND playtime_seconds <= ${MAX_PLAYTIME_SECONDS}
    )::int AS flagged
  FROM players`

console.log(`\nwritten: ${written}   no stats record: ${missing}   429s: ${throttled}`)
console.log(
  `coverage: ${summary.known}/${summary.eligible} players at ${MIN_RATING}+ read; ${summary.flagged} flagged`,
)
await sql.end()
