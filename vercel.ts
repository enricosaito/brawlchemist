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
    {
      // Guild discovery — walks top-rated players' guilds and refreshes the
      // guild pool the /guilds leaderboard reads from. Throttled + gradual;
      // every 30 min (staggered off the other ticks) keeps load modest.
      path: "/api/cron/sync-guilds",
      schedule: "13,43 * * * *",
    },
    {
      // Search index — walks the 1v1 Diamond+ ladder one region per tick and
      // upserts lightweight name-only rows so the broad population is
      // searchable. No per-player fetches; rotates all regions ~every 3h.
      path: "/api/cron/sync-search-index",
      schedule: "8,28,48 * * * *",
    },
  ],
}
