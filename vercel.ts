import { type VercelConfig } from "@vercel/config/v1"

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    {
      // Live ELO rankings — the most time-sensitive data. Picks one
      // (queue, region) per tick and refreshes the top player stats into the
      // players pool. Frequent so the pool stays close to live.
      path: "/api/cron/sync-leaderboard",
      schedule: "*/5 * * * *",
    },
    {
      // Verified pros → players table, which the pro leaderboard reads from.
      // Throttled internally; staggered off the :00/:05 ticks.
      path: "/api/cron/sync-pros",
      schedule: "7,22,37,52 * * * *",
    },
    {
      // Legend/weapon tier-list aggregations from the Valhallan population.
      // These move slowly, so once a day (off-peak) is plenty.
      path: "/api/cron/sync-valhallan",
      schedule: "0 6 * * *",
    },
  ],
}
