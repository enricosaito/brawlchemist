import "server-only"

import { db } from "@/lib/db"
import { cronControls } from "@/lib/db/schema"

/**
 * Admin pause switches for the scheduled sync jobs.
 *
 * Each cron route calls `isCronPaused(key)` right after auth and bails before
 * touching the Brawlhalla API when paused. That API has a single rate limit
 * shared by every cron *and* on-demand player-profile fetches, so a runaway
 * job can starve profile loads — pausing it frees the budget back up.
 *
 * `CRON_JOBS` is the source of truth (keys match the route segments under
 * app/api/cron/<key> and the cron paths in vercel.ts); the DB only stores the
 * paused flag, and a missing row means "not paused".
 */
export const CRON_JOBS = [
  {
    key: "sync-leaderboard",
    label: "Live leaderboard",
    schedule: "*/5 * * * *",
    description:
      "Refreshes top players' ranked stats every 5 min. The heaviest job on the API — pause this first if profiles are rate-limited.",
  },
  {
    key: "sync-valhallan",
    label: "Tier-list aggregation",
    schedule: "0 6 * * *",
    description:
      "Daily legend/weapon aggregation from the Valhallan population.",
  },
] as const

export type CronKey = (typeof CRON_JOBS)[number]["key"]

const CRON_KEYS: readonly string[] = CRON_JOBS.map((j) => j.key)

/**
 * Set of currently-paused cron keys. Fails open (returns empty) on a DB error,
 * so a database hiccup never silently halts the jobs.
 */
export async function getPausedCrons(): Promise<Set<string>> {
  try {
    const rows = await db()
      .select({ key: cronControls.key, paused: cronControls.paused })
      .from(cronControls)
    return new Set(rows.filter((r) => r.paused).map((r) => r.key))
  } catch (err) {
    console.error("[cron-controls] read failed:", err)
    return new Set()
  }
}

/** Whether a single cron is paused. Fails open. */
export async function isCronPaused(key: CronKey): Promise<boolean> {
  return (await getPausedCrons()).has(key)
}

export interface CronControl {
  key: CronKey
  label: string
  schedule: string
  description: string
  paused: boolean
  updatedAt: Date | null
}

/** Every job merged with its current paused state, for the admin UI. */
export async function listCronControls(): Promise<CronControl[]> {
  const stateByKey = new Map<string, { paused: boolean; updatedAt: Date }>()
  try {
    const rows = await db().select().from(cronControls)
    for (const r of rows) {
      stateByKey.set(r.key, { paused: r.paused, updatedAt: r.updatedAt })
    }
  } catch (err) {
    console.error("[cron-controls] list failed:", err)
  }
  return CRON_JOBS.map((j) => {
    const s = stateByKey.get(j.key)
    return { ...j, paused: s?.paused ?? false, updatedAt: s?.updatedAt ?? null }
  })
}

/** Pause or resume a cron (admin). No-op for an unknown key. */
export async function setCronPaused(key: string, paused: boolean): Promise<void> {
  if (!CRON_KEYS.includes(key)) return
  await db()
    .insert(cronControls)
    .values({ key, paused, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: cronControls.key,
      set: { paused, updatedAt: new Date() },
    })
}
