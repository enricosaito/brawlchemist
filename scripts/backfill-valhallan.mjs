// One-shot Valhallan backfill: repeatedly hits the sync-valhallan endpoint until
// every discovered Valhallan player is cached (full ranked_json — legends, 2v2,
// etc.). Reuses the deployed discover+sync logic so it can't drift from the cron.
//
// The Brawlhalla API is capped at 180 req / 15 min, so this is throttled by
// design: ~40 players/pass, ~5 min between passes → ~500 players in ~1.5–2h.
// Players that 429 stay stale and are retried on a later pass automatically.
//
// BEFORE RUNNING: pause the other crons in /admin (sync-leaderboard,
// sync-search-index, sync-guilds, sync-pros) so this owns the rate-limit budget.
// Re-enable them when it finishes.
//
// Usage:
//   node scripts/backfill-valhallan.mjs                       # against production
//   node scripts/backfill-valhallan.mjs http://localhost:3000 # against `npm run dev`
import { config } from "dotenv"

config({ path: ".env.local" })

const secret = process.env.CRON_SECRET
if (!secret) {
  console.error("CRON_SECRET missing from .env.local")
  process.exit(1)
}

const base = (process.argv[2] ?? "https://brawlchemist.com").replace(/\/$/, "")
const LIMIT = 40 // players synced per pass — ~40×5s fits Vercel's 300s cap
const GAP_MS = 5 * 60 * 1000 // pause between passes to stay under 180/15min
const MAX_PASSES = 40 // safety stop

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`backfilling Valhallans via ${base} (limit ${LIMIT}/pass)\n`)

for (let pass = 1; pass <= MAX_PASSES; pass++) {
  let summary
  try {
    const res = await fetch(`${base}/api/cron/sync-valhallan?limit=${LIMIT}`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    summary = await res.json()
    console.log(`pass ${pass}:`, summary)
  } catch (e) {
    console.error(`pass ${pass} request failed: ${e.message} — retrying after gap`)
    await sleep(GAP_MS)
    continue
  }

  // Done when discovery turns up nothing left to sync.
  if (summary?.stale === 0 || (summary?.batched ?? 0) === 0) {
    console.log(
      `\ndone — ${summary?.discovered ?? "?"} Valhallans discovered, backlog drained.`,
    )
    break
  }

  if (pass === MAX_PASSES) {
    console.log(`\nhit MAX_PASSES (${MAX_PASSES}); ${summary?.stale} still stale. Re-run to continue.`)
    break
  }
  await sleep(GAP_MS)
}
