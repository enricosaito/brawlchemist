import { config } from "dotenv"; config({ path: ".env.local" })
import postgres from "postgres"
for (const [label, port] of [["txn", ":6543/"], ["session", ":5432/"]]) {
  const url = process.env.DATABASE_URL.replace(":6543/", port)
  const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 40 })
  const t = Date.now()
  try { await sql`select 1`; console.log(`${label}: OK ${Date.now()-t}ms`) }
  catch (e) { console.log(`${label}: FAIL ${Date.now()-t}ms ${e.message.slice(0,80)}`) }
  try { await sql.end({ timeout: 5 }) } catch {}
}
