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
  ],
}
