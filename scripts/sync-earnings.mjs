// Fill profiles.earnings from brawltools — career tournament prize money in
// whole USD, which is what the Grand Champion flair reads.
//
//   node --env-file=.env.local scripts/sync-earnings.mjs
//   node --env-file=.env.local scripts/sync-earnings.mjs --all
//
// By default it only visits profiles we have never looked up (earnings IS
// NULL). `--all` refreshes everyone, which is what you want occasionally
// because prize money only ever goes up and a stale figure silently withholds
// a badge someone has earned.
//
// **Costs no Brawlhalla API budget.** brawltools is a separate, keyless
// service; the 180 req/15min ceiling in CLAUDE.md does not apply here. It is
// "personal use only" though, so this walks politely rather than in parallel.
//
// Null and zero are different on purpose. Null is "never looked", and the
// flair rule declines rather than guessing; 0 is "looked, and they have won
// nothing", which is a fact. Only a successful lookup writes a number.

import postgres from "postgres"

const BT = "https://api.brawltools.com"
const DELAY_MS = 250
const ALL = process.argv.includes("--all")

const sql = postgres(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  { max: 1, prepare: false, connect_timeout: 20 }
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(path) {
  try {
    const res = await fetch(`${BT}${path}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Career earnings for one Brawlhalla account, or null if brawltools does not
 * know them.
 *
 * Mirrors getEsportsProfile: the search endpoint carries earnings alongside
 * both power rankings in one call, and the per-mode PR lookups are the
 * fallback for a competitor search does not surface. A 404 on the bridge means
 * "not a tracked competitor", which is an answer, not a failure.
 */
async function earningsFor(brawlhallaId) {
  const bridge = await getJson(`/v2/player/bhId/${brawlhallaId}`)
  const base = bridge?.player
  if (!base) return null

  const search = await getJson(
    `/v2/player/search?query=${encodeURIComponent(base.name)}`
  )
  const match = search?.searchPlayers?.find(
    (s) => s.player?.brawlhallaId === brawlhallaId
  )
  if (match) return Math.round(match.earnings ?? 0)

  let earnings = 0
  for (const mode of [1, 2]) {
    const pr = await getJson(
      `/v2/player/pr?playerIds=${base.playerId}&gameMode=${mode}`
    )
    if (pr && typeof pr.earnings === "number") {
      earnings = Math.max(earnings, Math.round(pr.earnings))
    }
  }
  return earnings
}

const rows = await sql`
  select brawlhalla_id, handle
  from profiles
  where ${ALL ? sql`true` : sql`earnings is null`}
  order by brawlhalla_id`

console.log(`${rows.length} profile${rows.length === 1 ? "" : "s"} to check${ALL ? " (--all)" : ""}`)

let written = 0
let unknown = 0
for (const [i, r] of rows.entries()) {
  const value = await earningsFor(r.brawlhalla_id)
  if (value === null) {
    unknown++
  } else {
    await sql`update profiles set earnings = ${value} where brawlhalla_id = ${r.brawlhalla_id}`
    written++
    if (value > 0) {
      console.log(`  ${r.handle ?? r.brawlhalla_id}: $${value.toLocaleString()}`)
    }
  }
  if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${rows.length}`)
  await sleep(DELAY_MS)
}

const [summary] = await sql`
  select count(*) filter (where earnings is not null)::int known,
         count(*) filter (where earnings >= 50000)::int at_50k,
         coalesce(max(earnings), 0)::int top
  from profiles`
console.log(
  `\nwrote ${written}, not tracked by brawltools ${unknown}` +
    `\nknown ${summary.known}, at or above $50,000: ${summary.at_50k}, highest $${summary.top.toLocaleString()}`
)
await sql.end()
