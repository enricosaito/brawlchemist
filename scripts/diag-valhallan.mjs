// Diagnostic: replicate the profile page's Valhallan derivation against the
// live ladder and flag anyone the page would render as Diamond.
// Usage: node scripts/diag-valhallan.mjs
import postgres from "postgres"
import { config } from "dotenv"

config({ path: ".env.local" })

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL
const key = process.env.BRAWLHALLA_API_KEY
if (!url || !key) {
  console.error("Missing DATABASE_URL or BRAWLHALLA_API_KEY in .env.local")
  process.exit(1)
}

// Canonical codes: the values the API ACCEPTS (Japan is JPN, not the JPS it
// reports back in rows).
const REGIONS = ["US-E", "EU", "BRZ", "SEA", "US-W", "AUS", "JPN", "SA", "ME"]
const ALIAS = { JPS: "JPN" }
const MIN_WINS = 100
const PAGE_SIZE = 50
const MAX_PAGES = 6
const sql = postgres(url, { prepare: false })

async function lbPage(region, p) {
  const res = await fetch(
    `https://api.brawlhalla.com/v1/leaderboard/ranked?game_mode=1v1&region=${region}&page=${p}&max_results=${PAGE_SIZE}&api_key=${key}`,
  )
  return res.ok ? res.json() : null
}

async function cutoffFor(region) {
  let last = null
  const ids = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await lbPage(region, page)
    if (!data) break
    const valh = data.rankings.filter((r) => r.tier === "Valhallan")
    for (const e of valh) {
      for (const p of e.players) if (p.id > 0) ids.push(p.id)
      const u = e.players[0]?.username
      if (e.rating != null && u) last = { rating: e.rating }
    }
    if (valh.length < data.rankings.length || page >= data.total_pages) break
  }
  return last ? { region, rating: last.rating, ids } : null
}

const cutoffs = new Map()
const allIds = new Set()
for (const r of REGIONS) {
  const c = await cutoffFor(r)
  if (!c) {
    console.log(`${r}: no Valhallans`)
    continue
  }
  cutoffs.set(r, c)
  for (const id of c.ids) allIds.add(id)
  console.log(`${r}: ${c.ids.length} Valhallans, cutoff ${c.rating}`)
}
console.log(`\nUnion across regions: ${allIds.size} distinct Valhallan ids`)

const ids = [...allIds]
const stored = await sql`
  SELECT brawlhalla_id,
         (ranked_json->>'rating')::int AS rating,
         (ranked_json->>'wins')::int   AS wins,
          ranked_json->>'region'       AS region,
          ranked_json->>'name'         AS name
    FROM players
   WHERE brawlhalla_id = ANY(${ids})`

const before = []
const after = []
for (const row of stored) {
  const id = Number(row.brawlhalla_id)
  const raw = (row.region ?? "").toUpperCase()
  const canonical = ALIAS[raw] ?? raw
  const ownCut = cutoffs.get(canonical) ?? null

  // OLD: own region's ids, then own region's rating test. A region the old
  // code couldn't even name (JPN) yielded no cutoff at all.
  const oldRegionValid = REGIONS.includes(raw) && raw !== "JPN"
  const oldCut = oldRegionValid ? cutoffs.get(raw) ?? null : null
  const oldOk =
    (oldCut?.ids.includes(id) ?? false) ||
    (oldCut != null &&
      row.rating != null &&
      row.rating >= oldCut.rating &&
      (row.wins == null || row.wins >= MIN_WINS))

  // NEW: union membership first, own region's cutoff only as fallback.
  const newOk =
    allIds.has(id) ||
    (ownCut != null &&
      row.rating != null &&
      row.rating >= ownCut.rating &&
      (row.wins == null || row.wins >= MIN_WINS))

  if (!oldOk) before.push({ id, name: row.name, region: raw })
  if (!newOk) after.push({ id, name: row.name, region: raw })
}

console.log(`\nStored rows for ladder Valhallans: ${stored.length}`)
console.log(`Rendered as Diamond BEFORE: ${before.length}`)
console.log(`Rendered as Diamond AFTER:  ${after.length}`)
if (before.length)
  console.log("\nFixed:", before.slice(0, 20).map((b) => `${b.name} (${b.region})`).join(", "))
if (after.length) console.log("\nSTILL WRONG:", JSON.stringify(after))
await sql.end()
