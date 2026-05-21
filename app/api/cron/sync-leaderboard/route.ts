import { NextResponse } from "next/server"
import {
  API_REGIONS,
  type ApiGameMode,
  type ApiRegion,
  getRankedLeaderboard,
  isApiRegion,
} from "@/lib/brawlhalla-api"
import { syncManyPlayers } from "@/lib/sync/players"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const QUEUES: ApiGameMode[] = ["1v1", "2v2"]
// Skip "ALL" — it returns mixed-region entries we'd already pick up under
// each specific region tick.
const REGIONS: ApiRegion[] = API_REGIONS.filter((r) => r !== "ALL") as ApiRegion[]

function pickCombo(now: Date): { gameMode: ApiGameMode; region: ApiRegion } {
  const tickIndex = Math.floor(now.getTime() / (15 * 60 * 1000))
  const combos: { gameMode: ApiGameMode; region: ApiRegion }[] = []
  for (const queue of QUEUES) {
    for (const region of REGIONS) {
      combos.push({ gameMode: queue, region })
    }
  }
  return combos[tickIndex % combos.length]
}

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${expected}`
}

function comboFromQuery(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get("queue")
  const r = url.searchParams.get("region")
  if (!q || !r) return null
  if (q !== "1v1" && q !== "2v2") return null
  if (!isApiRegion(r)) return null
  return { gameMode: q as ApiGameMode, region: r as ApiRegion }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const combo = comboFromQuery(req) ?? pickCombo(new Date())
  const lb = await getRankedLeaderboard({
    gameMode: combo.gameMode,
    region: combo.region,
    page: 1,
    maxResults: 30,
  })
  if (!lb.ok) {
    return NextResponse.json(
      { combo, error: lb.error, status: lb.status },
      { status: 502 },
    )
  }

  const ids = lb.data.rankings
    .flatMap((entry) => entry.players)
    .map((p) => p.id)

  const outcomes = await syncManyPlayers(ids)
  const summary = {
    synced: outcomes.filter((o) => o.status === "synced").length,
    fresh: outcomes.filter((o) => o.status === "fresh").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  }

  return NextResponse.json({ combo, total: ids.length, ...summary })
}
