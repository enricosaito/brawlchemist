import { NextResponse } from "next/server"
import { getLiveTotal } from "@/lib/sync/live"

// Always live — the nav badge polls this; never cache.
export const dynamic = "force-dynamic"

/** Total players/teams active in the last 10 min, for the nav "live now" badge. */
export async function GET() {
  const count = await getLiveTotal()
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  )
}
