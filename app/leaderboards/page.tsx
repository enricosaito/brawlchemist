import { redirect } from "next/navigation"
import { isApiRegion } from "@/lib/brawlhalla-api"

// The leaderboard now lives at /leaderboards/[mode]. Redirect the bare route
// (and any legacy ?queue=/?region= links) to the matching mode page.
export default async function LeaderboardsIndex({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; region?: string }>
}) {
  const { queue, region } = await searchParams
  const mode = queue === "2v2" ? "2v2" : "1v1"
  const query = region && isApiRegion(region) ? `?region=${region}` : ""
  redirect(`/leaderboards/${mode}${query}`)
}
