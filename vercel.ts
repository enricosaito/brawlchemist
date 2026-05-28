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
      // Legend/weapon tier-list aggregations from the Valhallan population.
      // These move slowly, so once a day (off-peak) is plenty.
      path: "/api/cron/sync-valhallan",
      schedule: "0 6 * * *",
    },
  ],
}
