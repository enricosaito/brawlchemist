// Derive championship titles from Challengermode placements.
//
// Usage: node scripts/sync-esports-titles.mjs [--years 2023,2024,2025,2026] [--dry]
//
// Three APIs, each doing the one thing it can:
//
//   brawltools /v2/event   -> which official events happened, and their ids
//   Challengermode         -> who finished first in each one
//   brawltools /v2/player  -> which Brawlhalla account that winner is
//
// The last step is the reason this is trustworthy rather than a name match.
// Challengermode gives a lineup member's `user.id` (a UUID) and brawltools
// stores the same UUID as `cmPlayerId`, so a search by username is *confirmed*
// against that id before the row is written. A winner whose id we cannot
// confirm is skipped and reported, never guessed at.
//
// Idempotent: the row id is `${tournamentId}:${brawlhallaId}`, so re-running
// updates in place. Safe to run as often as you like.

import postgres from "postgres"
import { config } from "dotenv"

config({ path: ".env.local" })

const CM_AUTH = "https://publicapi.challengermode.com/mk1/v1/auth/access_keys"
const CM_GQL = "https://publicapi.challengermode.com/graphql"
const BT = "https://api.brawltools.com"

const args = process.argv.slice(2)
const DRY = args.includes("--dry")
const yearsArg = args.indexOf("--years")
const YEARS =
  yearsArg > -1
    ? args[yearsArg + 1].split(",").map(Number)
    : [2022, 2023, 2024, 2025, 2026]

/**
 * The championship series that produce a title, and the word they produce.
 *
 * A closed allow-list, not a pattern. "Official" covers a lot that is not a
 * championship — CEO, DreamHack, MAX MODE, the Trial of Laufey invitationals,
 * and the Eternal Sports Brawlball / Kung Foot / Triples cups, which are side
 * game modes. Winning those is real, but "Brawlball Champion '26" is not the
 * accolade anyone means by a championship title, and inventing one for every
 * event would put noise on the profiles that matter most.
 *
 * Doubles variants map to the same word: the mode is already in the title.
 */
const SERIES = [
  [/\bwinter\b.*\bchampionship\b/i, "Winter"],
  [/\bspring\b.*\bchampionship\b/i, "Spring"],
  [/\bsummer\b.*\bchampionship\b/i, "Summer"],
  [/\bautumn\b.*\bchampionship\b/i, "Autumn"],
  [/\bmidseason\b.*\bchampionship\b/i, "Midseason"],
  [/\bworld\b.*\bchampionship\b/i, "World"],
]

/** "Autumn Championship - Europe 2025 - 1v1" -> "Autumn", or null. */
function seriesFor(name) {
  for (const [re, word] of SERIES) if (re.test(name)) return word
  return null
}

const modeLabel = (gameMode) => (gameMode === 1 ? "1v1" : "2v2")

/**
 * The rendered title.
 *
 * Mode-prefixed to match the titles already curated on profiles ("2v2 World
 * Champion '24") and because a player can win both in one season — without it
 * the two wins collapse into one string.
 *
 * No region, deliberately: the seasonal championships run once per region, so
 * five players share "1v1 Summer Champion '26" and that is the intended
 * reading.
 */
const titleFor = (series, gameMode, year) =>
  `${modeLabel(gameMode)} ${series} Champion '${String(year).slice(2)}`

async function cmToken() {
  const res = await fetch(CM_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshKey: process.env.CHALLENGERMODE_REFRESH_KEY }),
  })
  if (!res.ok) throw new Error(`CM auth ${res.status}`)
  // The field is `value`, not `accessToken` — reading the wrong one yields a
  // token of `undefined` and every query answers AUTH_NOT_AUTHENTICATED.
  const { value } = await res.json()
  if (!value) throw new Error("CM auth returned no value")
  return value
}

async function cmQuery(token, query, variables) {
  const res = await fetch(CM_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0]?.message ?? "CM error")
  return json.data
}

const WINNERS_QUERY = `query($id: UUID!) {
  tournament(tournamentId: $id) {
    name
    state
    attendance { roster { lineups(limit: 500) {
      placement { bestPlacement }
      members { user { id username } }
    } } }
  }
}`

/**
 * Spellings to try for one Challengermode display name.
 *
 * brawltools stores the full tagged name ("Legion | Thaiph") but its search
 * only matches the bare handle, and its index drops characters — measured, not
 * assumed:
 *
 *   "Legion | Thaiph" -> nothing;  "Thaiph"  -> Legion | Thaiph
 *   "FXL?"            -> nothing;  "FXL"     -> FXL?
 *   "Taya."           -> nothing;  "Taya"    -> Taya.
 *   "yüz"             -> nothing;  "yz"      -> yüz     (non-ASCII dropped)
 *
 * Trying several spellings would be reckless if a near-match could win, but
 * every candidate is still confirmed against `cmPlayerId` before it counts —
 * searching "Saphir" surfaces an unrelated "Saphirbh", and the id check throws
 * it out. The ladder widens the net; it does not loosen the proof.
 */
function nameCandidates(username) {
  const afterTag = username.includes("|")
    ? username.split("|").pop().trim()
    : username
  const dePunct = (v) => v.replace(/[^\p{L}\p{N}_ ]+/gu, "").trim()
  const asciiOnly = (v) => v.replace(/[^\x20-\x7E]+/g, "").trim()
  const out = [
    username,
    afterTag,
    dePunct(afterTag),
    asciiOnly(afterTag),
    asciiOnly(dePunct(afterTag)),
    dePunct(afterTag).split(/\s+/)[0],
  ]
  return out.filter((v, i, a) => v && v.length >= 2 && a.indexOf(v) === i)
}

/** Brawlhalla id for a Challengermode user, or null when unconfirmable. */
const bridgeCache = new Map()
async function resolveBrawlhallaId(cmUserId, username) {
  if (bridgeCache.has(cmUserId)) return bridgeCache.get(cmUserId)
  let found = null
  for (const candidate of nameCandidates(username)) {
    try {
      const res = await fetch(
        `${BT}/v2/player/search?query=${encodeURIComponent(candidate)}`,
      )
      const rows = (await res.json()).searchPlayers ?? []
      // Confirmed, not matched: the same UUID on both sides is proof, where a
      // name that merely looks right is how the wrong player gets a title.
      const hit = rows
        .map((r) => r.player ?? r)
        .find((p) => p.cmPlayerId === cmUserId)
      if (hit?.brawlhallaId) {
        found = hit.brawlhallaId
        break
      }
    } catch {
      // Try the next spelling; a transient failure is not a verdict.
    }
  }
  bridgeCache.set(cmUserId, found)
  return found
}

async function officialEvents(year, gameMode) {
  const out = []
  let nextToken
  for (let page = 0; page < 4; page++) {
    const qs = new URLSearchParams({
      gameMode: String(gameMode),
      year: String(year),
      maxResults: "50",
    })
    if (nextToken) qs.set("nextToken", nextToken)
    const res = await fetch(`${BT}/v2/event?${qs}`)
    if (!res.ok) break
    const json = await res.json()
    out.push(...(json.tournaments ?? []))
    if (!json.nextToken) break
    nextToken = json.nextToken
  }
  // Only Challengermode-hosted events have placements to read.
  return out.filter((t) => t.isOfficial && t.host === "CM")
}

const token = await cmToken()
const sql = postgres(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  { prepare: false },
)

const rows = []
const skipped = []
let scanned = 0

for (const year of YEARS) {
  for (const gameMode of [1, 2]) {
    for (const event of await officialEvents(year, gameMode)) {
      const series = seriesFor(event.tournamentName)
      if (!series) continue
      scanned++
      let data
      try {
        data = await cmQuery(token, WINNERS_QUERY, { id: event.id })
      } catch (err) {
        skipped.push(`${event.tournamentName}: ${err.message}`)
        continue
      }
      const t = data?.tournament
      // An event still running has no winner yet; saying it does would be the
      // one kind of wrong this script must never be.
      if (!t || t.state !== "COMPLETED") {
        skipped.push(`${event.tournamentName}: state ${t?.state ?? "missing"}`)
        continue
      }
      const winner = (t.attendance?.roster?.lineups ?? []).find(
        (l) => l.placement?.bestPlacement === 1,
      )
      if (!winner) {
        skipped.push(`${event.tournamentName}: no lineup placed first`)
        continue
      }
      const title = titleFor(series, gameMode, event.year ?? year)
      for (const m of winner.members ?? []) {
        const cmUserId = m.user?.id
        const username = m.user?.username
        if (!cmUserId || !username) continue
        const brawlhallaId = await resolveBrawlhallaId(cmUserId, username)
        if (!brawlhallaId) {
          skipped.push(`${title} — ${username}: no confirmed Brawlhalla id`)
          continue
        }
        rows.push({
          id: `${event.id}:${brawlhallaId}`,
          // Named rather than left to the column default: these rows now sit
          // beside hand-typed ones in the same table, and "who is making this
          // claim" is the only thing that tells them apart. A manual title is
          // `manual:${brawlhallaId}:${md5(title)}` and is never touched here.
          source: "derived",
          brawlhalla_id: brawlhallaId,
          title,
          year: event.year ?? year,
          mode: modeLabel(gameMode),
          tournament_id: event.id,
          tournament_name: event.tournamentName,
        })
        console.log(`  ${title.padEnd(28)} ${username} -> ${brawlhallaId}`)
      }
    }
  }
}

console.log(`\nchampionship events scanned: ${scanned}`)
console.log(`titles derived: ${rows.length}`)
if (skipped.length) {
  console.log(`skipped (${skipped.length}):`)
  for (const s of skipped) console.log(`  ${s}`)
}

if (DRY) {
  console.log("\n(dry run — nothing written)")
} else {
  for (const r of rows) {
    // A title on a player with no profiles row renders nowhere: the cached
    // profiles map iterates that table, so an id missing from it is an id the
    // site never looks up. Same reason grantFlair ensures a row before
    // recording an award. No standing — winning a championship is evidence for
    // a tier, never the tier itself, and only an operator assigns one.
    await sql`
      INSERT INTO profiles (brawlhalla_id, is_pro, pro_tier, updated_at)
      VALUES (${r.brawlhalla_id}, false, 'none', now())
      ON CONFLICT (brawlhalla_id) DO NOTHING`
    await sql`
      INSERT INTO esports_titles ${sql(r)}
      ON CONFLICT (id) DO UPDATE SET
        title = ${r.title}, year = ${r.year}, mode = ${r.mode},
        tournament_name = ${r.tournament_name}, source = 'derived'`
  }
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM esports_titles`
  console.log(`\nesports_titles now holds ${n} rows`)
}
await sql.end()
