import {
  LegendChip,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "@/components/site/primitives"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { LegendPicker } from "@/components/site/legend-picker"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { formatElo, formatPercent } from "@/lib/format"
import { CURRENT_PATCH, getLegend } from "@/lib/mock-data"
import {
  LEGEND_ROSTER,
  rosterEntryBySlug,
  type RosterEntry,
} from "@/lib/legends-roster"
import type { Tier } from "@/lib/types"
import { API_REGIONS, isApiRegion } from "@/lib/brawlhalla-api"
import { getOtpsForLegend, type OtpPlayer } from "@/lib/sync/otps"

const REGION_OPTIONS = ["ALL", ...API_REGIONS.filter((r) => r !== "ALL")] as const

// The /ranked endpoint never returns "Valhallan" — it caps at "Diamond"
// even for 2800-rated players. We derive the true tier from rating.
const VALHALLAN_THRESHOLD = 2000
const KNOWN_TIERS: readonly Tier[] = [
  "Tin",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Valhallan",
]

function deriveTier(apiTier: string | null, rating: number | null): Tier | null {
  if (rating != null && rating >= VALHALLAN_THRESHOLD) return "Valhallan"
  if (!apiTier) return null
  return (KNOWN_TIERS as readonly string[]).includes(apiTier)
    ? (apiTier as Tier)
    : null
}

function tierLabel(apiTier: string | null, rating: number | null): string {
  if (rating != null && rating >= VALHALLAN_THRESHOLD) return "Valhallan"
  return apiTier ?? "—"
}

function formatWinRate(wins: number | null, games: number | null): string {
  if (wins == null || games == null || games === 0) return "—"
  return formatPercent((wins / games) * 100)
}

const DEFAULT_LEGEND_SLUG = "cassidy"

function buildColumns(legendSlug: string): ColDef<OtpPlayer>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "56px",
      align: "right",
      render: (_, i) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {i + 1}
        </span>
      ),
    },
    {
      id: "rank-icon",
      label: "Rank",
      width: "72px",
      align: "center",
      render: (p) => {
        const tier = deriveTier(p.tier, p.rating)
        return tier ? (
          <RankIcon tier={tier} size={32} className="mx-auto" />
        ) : null
      },
    },
    {
      id: "player",
      label: "Player",
      render: (p) => (
        <div className="flex items-center gap-2">
          <LegendChip legendId={legendSlug} size="md" showName={false} />
          <span className="truncate text-sm font-medium">{p.username}</span>
        </div>
      ),
    },
    {
      id: "region",
      label: "Region",
      width: "84px",
      render: (p) =>
        p.region ? (
          <RegionPill region={p.region} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "tier",
      label: "Tier",
      width: "110px",
      render: (p) => {
        const tier = deriveTier(p.tier, p.rating)
        return (
          <span
            className={cn(
              "font-mono text-[11px] font-medium uppercase tracking-wider",
              tier ? TIER_TEXT_COLOR[tier] : "text-muted-foreground",
            )}
          >
            {tierLabel(p.tier, p.rating)}
          </span>
        )
      },
    },
    {
      id: "rating",
      label: "Rating",
      align: "right",
      width: "100px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums">
          {p.rating != null ? formatElo(p.rating) : "—"}
        </span>
      ),
    },
    {
      id: "peak",
      label: "Peak",
      align: "right",
      width: "100px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {p.peak_rating != null ? formatElo(p.peak_rating) : "—"}
        </span>
      ),
    },
    {
      id: "legend-games",
      label: "On Legend",
      align: "right",
      width: "150px",
      render: (p) => {
        const lGames = p.legend_games ?? 0
        const total = p.games ?? 0
        const share = total > 0 ? (lGames / total) * 100 : 0
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-sm tabular-nums">
              {lGames.toLocaleString()}
              <span className="text-muted-foreground"> / {total.toLocaleString()}</span>
            </span>
            <span className="font-mono text-[10px] tabular-nums text-tier-s">
              {share.toFixed(1)}% pick
            </span>
          </div>
        )
      },
    },
    {
      id: "winrate",
      label: "Legend WR",
      align: "right",
      width: "100px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-positive">
          {formatWinRate(p.legend_wins, p.legend_games)}
        </span>
      ),
    },
  ]
}

export default async function OtpsPage({
  searchParams,
}: {
  searchParams: Promise<{ legend?: string; region?: string }>
}) {
  const params = await searchParams
  const legendSlug =
    params.legend && rosterEntryBySlug(params.legend)
      ? params.legend
      : DEFAULT_LEGEND_SLUG
  const selectedLegend: RosterEntry =
    rosterEntryBySlug(legendSlug) ?? rosterEntryBySlug(DEFAULT_LEGEND_SLUG)!
  const legendData = getLegend(legendSlug)
  const region = params.region === "ALL"
    ? "ALL"
    : params.region && isApiRegion(params.region)
      ? params.region
      : "ALL"
  const regionFilter = region === "ALL" ? null : region

  const players = await getOtpsForLegend({
    legendId: selectedLegend.legendId,
    region: regionFilter,
    limit: 50,
  })

  const pickerOptions = [...LEGEND_ROSTER]
    .map((l) => ({ slug: l.slug, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="OTPs"
          subtitle={`Players whose most-played legend this season is ${selectedLegend.name}. Sorted by rating. Pulled from the Valhallan-discovered player pool.`}
          meta={
            <>
              <span className="rounded border border-tier-valhallan/40 bg-tier-valhallan/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-tier-valhallan">
                {players.length} player{players.length === 1 ? "" : "s"}
              </span>
              <span className="rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
                Patch {CURRENT_PATCH}
              </span>
            </>
          }
        />
        <div className="px-4 sm:px-6">
          <div className="mx-auto mb-4 max-w-[1280px]">
            <LegendPicker
              options={pickerOptions}
              selectedSlug={legendSlug}
              currentRegion={region}
            />
          </div>

          <div className="mx-auto mb-3 flex max-w-[1280px] flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Region
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-0.5">
              {REGION_OPTIONS.map((r) => (
                <Link
                  key={r}
                  href={`/otps?legend=${legendSlug}&region=${r}`}
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

          {players.length === 0 ? (
            <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No one in our DB mains{" "}
              <span className="font-medium text-foreground">
                {selectedLegend.name}
              </span>{" "}
              {region === "ALL" ? "this season." : `in ${region} this season.`}{" "}
              The DB only includes Valhallan-discovered players — try a more
              popular legend, or widen the region filter to ALL.
            </div>
          ) : (
            <div className="mx-auto max-w-[1280px]">
              {legendData && (
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                  <LegendChip
                    legendId={legendSlug}
                    size="lg"
                    showName={false}
                  />
                  <div className="flex flex-col">
                    <span className="font-display text-lg font-semibold">
                      {selectedLegend.name} mains
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {region === "ALL" ? "all regions" : `region: ${region}`}{" "}
                      · top {players.length}
                    </span>
                  </div>
                </div>
              )}
              <DataTable
                columns={buildColumns(legendSlug)}
                rows={players}
                rowKey={(p) => String(p.brawlhalla_id)}
              />
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
