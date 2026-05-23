import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  LegendChip,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "@/components/site/primitives"
import { DataTable, type ColDef } from "@/components/site/data-table"
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

const KNOWN_TIERS: readonly Tier[] = [
  "Tin",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Valhallan",
]

function toTier(value: string | null): Tier | null {
  if (!value) return null
  return (KNOWN_TIERS as readonly string[]).includes(value)
    ? (value as Tier)
    : null
}

function formatWinRate(wins: number | null, games: number | null): string {
  if (wins == null || games == null || games === 0) return "—"
  return formatPercent((wins / games) * 100)
}

const DEFAULT_LEGEND_SLUG = "cassidy"

const columns: ColDef<OtpPlayer>[] = [
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
      const tier = toTier(p.tier)
      return tier ? (
        <RankIcon tier={tier} size={32} className="mx-auto" />
      ) : null
    },
  },
  {
    id: "player",
    label: "Player",
    render: (p) => (
      <span className="truncate text-sm font-medium">{p.username}</span>
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
      const tier = toTier(p.tier)
      return (
        <span
          className={cn(
            "font-mono text-[11px] font-medium uppercase tracking-wider",
            tier ? TIER_TEXT_COLOR[tier] : "text-muted-foreground",
          )}
        >
          {p.tier ?? "—"}
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
    id: "games",
    label: "Games",
    align: "right",
    width: "90px",
    render: (p) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {p.games != null ? p.games.toLocaleString() : "—"}
      </span>
    ),
  },
  {
    id: "winrate",
    label: "Win Rate",
    align: "right",
    width: "100px",
    render: (p) => (
      <span className="font-mono text-sm tabular-nums">
        {formatWinRate(p.wins, p.games)}
      </span>
    ),
  },
]

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

  // Sort the picker roster by name for stable, scannable layout.
  const pickerRoster = [...LEGEND_ROSTER].sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="One-trick Ponies"
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
          {/* Legend picker — every legend in the roster, alphabetical. */}
          <div className="mx-auto mb-4 max-w-[1280px]">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Pick a legend
              </span>
              <span className="text-xs text-muted-foreground">
                Currently:{" "}
                <span className="font-medium text-foreground">
                  {selectedLegend.name}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pickerRoster.map((entry) => {
                const isSelected = entry.slug === legendSlug
                return (
                  <Link
                    key={entry.slug}
                    href={`/otps?legend=${entry.slug}&region=${region}`}
                    title={entry.name}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "group relative rounded-md border transition-all",
                      isSelected
                        ? "border-tier-s bg-tier-s/15 ring-2 ring-tier-s/40"
                        : "border-border/40 bg-card/40 opacity-70 hover:border-border hover:opacity-100",
                    )}
                  >
                    <LegendChip
                      legendId={entry.slug}
                      size="md"
                      showName={false}
                    />
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Region picker */}
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
              {region === "ALL"
                ? "this season."
                : `in ${region} this season.`}{" "}
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
                      {region === "ALL"
                        ? "all regions"
                        : `region: ${region}`}{" "}
                      · top {players.length}
                    </span>
                  </div>
                </div>
              )}
              <DataTable
                columns={columns}
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
