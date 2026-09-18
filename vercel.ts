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
      // Live ranked queue — polls the top-500 ladder for 1v1 + 2v2 and diffs
      // it to flag who's actively playing (powers /live). Every 5 min so the
      // 10-minute "active" window always has fresh data.
      path: "/api/cron/sync-live",
      schedule: "*/5 * * * *",
    },
    {
      // Legend/weapon tier-list aggregations from the Valhallan population.
      // These move slowly, so once a day (off-peak) is plenty.
      path: "/api/cron/sync-valhallan",
      schedule: "0 6 * * *",
    },
    {
      // Terminates sessions abandoned mid-transaction by serverless instances
      // that died between sending a query and reading the result. They hold a
      // lock and a pooler slot forever; Postgres's own timeouts do not reach
      // them (see the route). Every 5 min because the pool is small enough
      // that a handful matters.
      path: "/api/cron/reap-sessions",
      schedule: "*/5 * * * *",
    },
  ],
}
