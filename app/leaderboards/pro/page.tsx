import Link from "next/link"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/site/data-table"
import { buildLeaderboardColumns } from "@/components/site/leaderboard-columns"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { CURRENT_PATCH } from "@/lib/mock-data"
import { isApiRegion, type ApiRegion } from "@/lib/brawlhalla-api"
import { getProLeaderboard } from "@/lib/sync/pro-leaderboard"
import { getPlayersByIds } from "@/lib/sync/players"
import { getValhallanCutoffs } from "@/lib/sync/valhallan-cutoff"
import type { PlayerRow } from "@/lib/db/schema"

export const metadata = {
  title: "PRO Leaderboard · Brawlchemist",
  description: "Verified pro players ranked by current 1v1 rating, per region.",
}

const PRO_REGIONS = ["US-E", "EU", "BRZ"] as const

export default async function ProLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>
}) {
  const params = await searchParams
  const region: ApiRegion =
    params.region && params.region !== "ALL" && isApiRegion(params.region)
      ? params.region
      : "BRZ"

  const rows = await getProLeaderboard(region)

  // Main-legend enrichment from the cached players table.
  let playersMap = new Map<number, PlayerRow>()
  if (rows.length > 0) {
    const ids = rows.flatMap((r) => r.players.map((p) => p.id))
    try {
      playersMap = await getPlayersByIds(ids)
    } catch (err) {
      console.error("[pro-leaderboard] player cache lookup failed:", err)
    }
  }

  // Region cutoff so Fallen Valhallans render the right emblem.
  const cutoffs = await getValhallanCutoffs("1v1", [region])
  const cutoff = cutoffs.get(region)?.rating ?? null

  // Empty previews → plain rows (normal tier ranks, no verified-pro name
  // treatment — every row here is already a pro).
  const columns = buildLeaderboardColumns(
    playersMap,
    "1v1",
    region,
    cutoff,
    new Map(),
  )

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="PRO Leaderboard"
          subtitle="Verified pro players, ranked by current 1v1 rating in each region."
          meta={
            <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
              Patch {CURRENT_PATCH}
            </span>
          }
        />
        <div className="px-4 sm:px-6">
          <div className="mx-auto mb-3 flex max-w-[1280px] flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Region
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-0.5">
              {PRO_REGIONS.map((r) => (
                <Link
                  key={r}
                  href={`/leaderboards/pro?region=${r}`}
                  aria-current={region === r ? "true" : undefined}
                  className={cn(
                    "rounded-[5px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                    region === r
                      ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </Link>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No verified pros in {region} yet. Add them in the admin panel, or
              try another region.
            </div>
          ) : (
            <div className="mx-auto max-w-[1280px]">
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => `${r.rank}-${r.players[0]?.id ?? "x"}`}
              />
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
