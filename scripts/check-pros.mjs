// Diagnostic: list verified pros and their live /ranked standing.
// Usage: node scripts/check-pros.mjs
import { neon } from "@neondatabase/serverless"
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

const sql = neon(url)
const rows =
  await sql`SELECT brawlhalla_id, handle, pro FROM player_overrides WHERE pro = true ORDER BY handle`
console.log(`${rows.length} verified pros in DB\n`)

for (const r of rows) {
  try {
    const res = await fetch(
      `https://api.brawlhalla.com/player/${r.brawlhalla_id}/ranked?api_key=${key}`,
    )
    if (!res.ok) {
      console.log(`${r.handle} (${r.brawlhalla_id}): /ranked HTTP ${res.status}`)
      continue
    }
    const d = await res.json()
    console.log(
      `${r.handle} (${r.brawlhalla_id}): name=${d.name || "—"} region=${JSON.stringify(
        d.region,
      )} rating=${d.rating} peak=${d.peak_rating} tier=${d.tier} games=${d.games} wins=${d.wins}`,
    )
  } catch (e) {
    console.log(`${r.handle} (${r.brawlhalla_id}): error ${e.message}`)
  }
}
