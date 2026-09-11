import "server-only"

import { unstable_cache } from "next/cache"
import { and, eq, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { queueActivity } from "@/lib/db/schema"
import type { LiveQueue } from "@/lib/sync/live"

/** One (region → counts) tally for a single poll of one queue. */
export interface ActivityTally {
  /** Entries observed finishing a match this poll. */
  active: number
  /** Matches played — the sum of game-count deltas. */
  matches: number
}

/**
 * Fold one poll's activity into the hourly rollup.
 *
 * Called from syncLiveQueue with the tallies it already computed, so this adds
 * no Brawlhalla API cost and one small upsert per tick. Best-effort: a failure
 * here must never fail a sync tick (the rollup is telemetry, the ladder is not).
 *
 * `regionsSeen` is every region present in the poll, whether or not anyone in
 * it played. Incrementing `samples` for all of them is what makes the average
 * meaningful — without it a quiet hour is indistinguishable from an hour we
 * didn't observe.
 */
export async function recordQueueActivity(
  queue: LiveQueue,
  regionsSeen: Set<string>,
  tallies: Map<string, ActivityTally>,
  at: Date = new Date(),
): Promise<void> {
  if (regionsSeen.size === 0) return
  // Truncate to the hour in UTC. Doing it here rather than in SQL keeps the
  // primary key stable and the upsert a plain conflict target.
  const bucket = new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate(),
      at.getUTCHours(),
    ),
  )

  const rows = [...regionsSeen].map((region) => {
    const t = tallies.get(region)
    return {
      queue,
      region,
      bucket,
      samples: 1,
      active: t?.active ?? 0,
      matches: t?.matches ?? 0,
    }
  })

  try {
    await db()
      .insert(queueActivity)
      .values(rows)
      .onConflictDoUpdate({
        target: [queueActivity.queue, queueActivity.region, queueActivity.bucket],
        set: {
          samples: sql`${queueActivity.samples} + 1`,
          active: sql`${queueActivity.active} + excluded.active`,
          matches: sql`${queueActivity.matches} + excluded.matches`,
        },
      })
  } catch (err) {
    console.error("[queue-activity] rollup write failed:", err)
  }
}

export interface HourBucket {
  /** 0-23, UTC. */
  hour: number
  /** Mean entries seen playing per poll. */
  active: number
  /** Mean matches observed per poll. */
  matches: number
  /** Polls behind this hour — the confidence denominator. */
  samples: number
}

export interface QueueActivity {
  hours: HourBucket[]
  /** Total polls behind the whole series. */
  samples: number
  /** Distinct days covered — how much of a weekly shape this can show. */
  days: number
}

/** Rolling window the chart summarises. */
const WINDOW_DAYS = 30

/**
 * Mean activity per hour of the UTC day.
 *
 * Aggregated in SQL, so the result is at most 24 rows no matter how wide the
 * window gets — the table itself is never shipped over the wire. Cached for an
 * hour, which is exactly the rate at which a new bucket can appear.
 */
export async function getQueueActivity(opts: {
  queue: LiveQueue
  region?: string | null
}): Promise<QueueActivity> {
  const region = opts.region && opts.region !== "ALL" ? opts.region.toUpperCase() : null
  return unstable_cache(
    async (): Promise<QueueActivity> => {
      const empty: QueueActivity = { hours: [], samples: 0, days: 0 }
      try {
        const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
        const conds = [eq(queueActivity.queue, opts.queue), gte(queueActivity.bucket, since)]
        if (region) conds.push(eq(queueActivity.region, region))

        const rows = (await db()
          .select({
            hour: sql<number>`extract(hour from ${queueActivity.bucket} at time zone 'UTC')::int`,
            active: sql<number>`sum(${queueActivity.active})::int`,
            matches: sql<number>`sum(${queueActivity.matches})::int`,
            samples: sql<number>`sum(${queueActivity.samples})::int`,
          })
          .from(queueActivity)
          .where(and(...conds))
          .groupBy(sql`1`)) as { hour: number; active: number; matches: number; samples: number }[]

        if (rows.length === 0) return empty

        const [span] = (await db()
          .select({
            days: sql<number>`count(distinct date_trunc('day', ${queueActivity.bucket}))::int`,
          })
          .from(queueActivity)
          .where(and(...conds))) as { days: number }[]

        const byHour = new Map(rows.map((r) => [r.hour, r]))
        const hours: HourBucket[] = Array.from({ length: 24 }, (_, hour) => {
          const r = byHour.get(hour)
          const samples = r?.samples ?? 0
          return {
            hour,
            samples,
            active: samples > 0 ? (r!.active ?? 0) / samples : 0,
            matches: samples > 0 ? (r!.matches ?? 0) / samples : 0,
          }
        })
        return {
          hours,
          samples: rows.reduce((sum, r) => sum + (r.samples ?? 0), 0),
          days: span?.days ?? 0,
        }
      } catch (err) {
        console.error("[queue-activity] read failed:", err)
        return empty
      }
    },
    ["queue-activity", opts.queue, region ?? "ALL"],
    { revalidate: 3600 },
  )()
}
