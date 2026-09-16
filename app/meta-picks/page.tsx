import Link from "next/link"
import type { Metadata } from "next"
import { cn } from "@/lib/utils"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { LegendChip, PatchTag, WeaponIcon } from "@/components/site/primitives"
import {
  PopularityLabel,
  type PopularityTier,
} from "@/components/site/popularity-label"
import { CURRENT_PATCH, WEAPON_NAMES } from "@/lib/mock-data"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { API_REGIONS, isApiRegion, type ApiRegion } from "@/lib/brawlhalla-api"
import {
  type AggregationMethod,
  getValhallanLegendStats,
  getValhallanWeaponStats,
  type LegendStat,
  type WeaponStat,
} from "@/lib/sync/valhallan"

export const metadata: Metadata = {
  title: "Brawlchemist | Meta Picks",
  description:
    "What Valhallan players actually pick — legend and weapon pick rates and win rates, side by side.",
}

/**
 * Meta Picks — the legend meta and the weapon meta, together.
 *
 * They were two pages asking one question. Both read the same Valhallan pool,
 * both filter by the same region, and a weapon's pick rate *is* the sum of its
 * legends' — so reading one without the other meant holding half an answer in
 * your head while you navigated to the other half. Side by side you can see
 * that hammer is up because Teros is, which is the only reason either number is
 * interesting.
 *
 * One region control for both, which is the substance of the merge rather than
 * a layout choice: two pages meant two filters that could disagree, and a
 * comparison across a region boundary is not a comparison.
 *
 * Compact columns on both sides — pick, win, games and nothing else. The old
 * pages could afford a W-L split, a mainer, a diversity score; at half the
 * width those turn into a scroll bar. The two tables carry the same four
 * columns on purpose: they are meant to be read across, and a reader should not
 * have to re-learn the shape halfway.
 */

const REGION_OPTIONS = API_REGIONS

const METHOD_OPTIONS: { id: AggregationMethod; label: string }[] = [
  { id: "popular", label: "Popularity" },
  { id: "avg", label: "Player WR" },
  { id: "pooled", label: "Pooled WR" },
]

function isMethod(v: string | undefined): v is AggregationMethod {
  return v === "pooled" || v === "avg" || v === "popular"
}

/**
 * Popularity band from a legend's pick rate (% of pool games). Normalized, so
 * it stays stable as total game counts grow.
 */
function legendTier(pickRate: number): PopularityTier {
  if (pickRate >= 4) return "most"
  if (pickRate >= 2) return "very-popular"
  if (pickRate >= 1) return "popular"
  if (pickRate >= 0.5) return "unpopular"
  return "very-unpopular"
}

/**
 * The weapon bands are deliberately more forgiving and bottom out at "Popular":
 * only ~15 weapons split the whole pool, so none of them is genuinely unpopular
 * and saying so would be an artefact of the arithmetic.
 */
function weaponTier(pickRate: number): PopularityTier {
  if (pickRate >= 10) return "most"
  if (pickRate >= 6) return "very-popular"
  return "popular"
}

const RANK_COL = {
  id: "rank",
  label: "#",
  width: "44px",
  align: "right" as const,
  render: (_: unknown, i: number) => (
    <span className="font-mono text-xs tabular-nums text-muted-foreground">
      {i + 1}
    </span>
  ),
}

const legendColumns: ColDef<LegendStat>[] = [
  RANK_COL,
  {
    id: "legend",
    label: "Legend",
    render: (l) => {
      const slug = slugForLegendId(l.legend_id)
      const name = rosterEntryByLegendId(l.legend_id)?.name ?? `#${l.legend_id}`
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          {slug && <LegendChip legendId={slug} size="sm" showName={false} />}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium leading-tight">
              {name}
            </span>
            <PopularityLabel tier={legendTier(l.pick_rate)} />
          </div>
        </div>
      )
    },
  },
  {
    id: "pickRate",
    label: "Pick",
    align: "right",
    width: "76px",
    render: (l) => (
      <span className="font-mono text-sm font-medium tabular-nums text-pink">
        {l.pick_rate.toFixed(2)}%
      </span>
    ),
  },
  {
    id: "winRate",
    label: "Win",
    align: "right",
    width: "76px",
    render: (l) => (
      <span className="font-mono text-sm font-medium tabular-nums text-positive">
        {l.win_rate.toFixed(2)}%
      </span>
    ),
  },
  {
    id: "games",
    label: "Games",
    align: "right",
    width: "84px",
    render: (l) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {l.games.toLocaleString()}
      </span>
    ),
  },
]

const weaponColumns: ColDef<WeaponStat>[] = [
  RANK_COL,
  {
    id: "weapon",
    label: "Weapon",
    render: (w) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <WeaponIcon weaponId={w.weapon_id} size={26} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium leading-tight">
            {WEAPON_NAMES[w.weapon_id]}
          </span>
          <PopularityLabel tier={weaponTier(w.pick_rate)} />
        </div>
      </div>
    ),
  },
  {
    id: "pickRate",
    label: "Pick",
    align: "right",
    width: "76px",
    render: (w) => (
      <span className="font-mono text-sm font-medium tabular-nums text-pink">
        {w.pick_rate.toFixed(2)}%
      </span>
    ),
  },
  {
    id: "winRate",
    label: "Win",
    align: "right",
    width: "76px",
    render: (w) => (
      <span className="font-mono text-sm font-medium tabular-nums text-positive">
        {w.win_rate.toFixed(2)}%
      </span>
    ),
  },
  {
    id: "games",
    label: "Games",
    align: "right",
    width: "84px",
    render: (w) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {w.games.toLocaleString()}
      </span>
    ),
  },
]

export default async function MetaPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; method?: string }>
}) {
  const sp = await searchParams
  const region: ApiRegion =
    sp.region && isApiRegion(sp.region) ? sp.region : "ALL"
  const regionFilter = region === "ALL" ? null : region
  const method: AggregationMethod = isMethod(sp.method) ? sp.method : "popular"

  // Minimum threshold scales with the population: `avg` counts games per player
  // to qualify as a data point, the others count total games so a niche legend
  // with thirty games doesn't surface in a popularity ranking.
  const minGames =
    method === "avg" ? (regionFilter ? 20 : 30) : regionFilter ? 20 : 100

  const [legendStats, weaponStats] = await Promise.all([
    getValhallanLegendStats({ region: regionFilter, method, minGames }),
    getValhallanWeaponStats({ region: regionFilter }),
  ])

  const href = (r: ApiRegion, m: AggregationMethod) =>
    `/meta-picks?region=${r}&method=${m}`

  return (
    <main className="pb-16">
      <div className="px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3">
          <Filter label="Region">
            {REGION_OPTIONS.map((r) => (
              <Chip key={r} href={href(r, method)} active={region === r}>
                {r}
              </Chip>
            ))}
          </Filter>

          {/* Only the legend half has a method — a weapon's rate is pooled by
              definition, since a weapon has no players of its own to average
              over. Kept in the shared row anyway rather than floated over one
              column, which would read as a filter on half a page. */}
          <Filter label="Legend WR">
            {METHOD_OPTIONS.map((m) => (
              <Chip key={m.id} href={href(region, m.id)} active={method === m.id}>
                {m.label}
              </Chip>
            ))}
          </Filter>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-tier-valhallan/40 bg-tier-valhallan/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-tier-valhallan">
              {legendStats.sampleSize} players
            </span>
            <PatchTag version={CURRENT_PATCH} />
          </div>
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-6 xl:grid-cols-2">
          <Column
            title="Legend Meta"
            empty={
              legendStats.legends.length === 0
                ? `No legends meet the sample threshold for ${region}. The cron is still seeding — check back in a few hours.`
                : null
            }
          >
            {/* Capped at the fifteen rows the weapon table has, and scrolled
                past that. Seventy legends beside fifteen weapons made the page
                a column of names with a stub next to it; at the same height the
                two read as one comparison. The cap is a pixel height rather
                than a slice because the rows below it are still the answer —
                they just aren't the headline. */}
            <div className="max-h-[774px] overflow-y-auto overscroll-contain rounded-xl">
              <DataTable
                columns={legendColumns}
                rows={legendStats.legends}
                rowKey={(l) => String(l.legend_id)}
              />
            </div>
          </Column>

          <Column
            title="Weapon Meta"
            empty={
              weaponStats.weapons.length === 0
                ? `No weapon data for ${region} yet. The Valhallan pool only seeds the competitive regions (US-E, EU, BRZ) — try ALL, or one of those.`
                : null
            }
          >
            <DataTable
              columns={weaponColumns}
              rows={weaponStats.weapons}
              rowKey={(w) => w.weapon_id}
            />
          </Column>
        </div>
      </div>
    </main>
  )
}

function Filter({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
        {children}
      </div>
    </div>
  )
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors",
        active
          ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  )
}

function Column({
  title,
  empty,
  children,
}: {
  title: string
  empty: string | null
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {empty ? (
        <p className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  )
}
