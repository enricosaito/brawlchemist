import { type VercelConfig } from "@vercel/config/v1"

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    {
      // Pick one (queue, region) per tick and refresh the 30 player stats.
      // 18 combos covered every ~4.5 hours.
      path: "/api/cron/sync-leaderboard",
      schedule: "*/15 * * * *",
    },
    {
      // Sweep the Valhallan-tier population (~1000 players across 9 regions
      // × 2 queues) for the tier-list aggregations. Staggered 5 min off the
      // leaderboard cron to spread rate-limit usage within each 15-min slot.
      // 50 syncs per tick → ~5 hours of cold seeding, then mostly idle.
      path: "/api/cron/sync-valhallan",
      schedule: "5,20,35,50 * * * *",
    },
  ],
}
