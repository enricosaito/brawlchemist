import Link from "next/link"
import type { Metadata } from "next"
import { cn } from "@/lib/utils"
import {
  MetaTable,
  type MetaRow,
} from "@/components/site/meta-table"
import { META_COL } from "@/lib/meta-columns"
import {
  LegendChip,
  RankHelm,
  PatchTag,
  RegionPill,
  WeaponIcon,
} from "@/components/site/primitives"
import { VerifiedMark } from "@/components/site/pro-badge"
import { getProfilesMap } from "@/lib/sync/profiles"
import { getValhallanIds } from "@/lib/sync/valhallan-cutoff"
import { tierFromRating } from "@/lib/tier"
import type { PlayerPreview } from "@/lib/player-previews"
import type { Tier } from "@/lib/types"
import {
  PopularityLabel,
  type PopularityTier,
} from "@/components/site/popularity-label"
import { CURRENT_PATCH, WEAPON_NAMES } from "@/lib/mock-data"
import { formatElo } from "@/lib/format"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { API_REGIONS, isApiRegion, type ApiRegion } from "@/lib/brawlhalla-api"
import {
  type AggregationMethod,
  getTopValhallanMainers,
  getValhallanLegendStats,
  getValhallanWeaponStats,
  type LegendStat,
  type TopMainer,
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

  // The mainers ride the same cached Valhallan scan the stats do (constraint
  // #6's sanctioned exception), so the expandable detail costs no query of its
  // own — it is projected out of a pass the page was already making.
  const [legendStats, weaponStats, mainers, profiles, valhallan] =
    await Promise.all([
      getValhallanLegendStats({ region: regionFilter, method, minGames }),
      getValhallanWeaponStats({ region: regionFilter }),
      getTopValhallanMainers({ region: regionFilter, perLegend: 5 }),
      getProfilesMap().catch(() => new Map<number, PlayerPreview>()),
      // Valhallan is ladder membership, not a rating band (see CLAUDE.md), so
      // the helm is derived rather than assumed from the pool’s own threshold —
      // a player in the pool by rating but off the roster draws Diamond.
      getValhallanIds("1v1")
        .then((v) => new Set(v))
        .catch(() => new Set<number>()),
    ])

  // Weapon detail is free: its top wielders are legend ids, and this page has
  // already loaded every legend's record. No second query to say "gauntlets is
  // up because Teros is".
  const legendById = new Map(legendStats.legends.map((l) => [l.legend_id, l]))

  const legendRows: MetaRow[] = legendStats.legends.map((l) => {
    const slug = slugForLegendId(l.legend_id)
    const name = rosterEntryByLegendId(l.legend_id)?.name ?? `#${l.legend_id}`
    const tops = mainers.get(l.legend_id) ?? []
    return {
      key: String(l.legend_id),
      art: slug ? (
        <LegendChip legendId={slug} size="sm" showName={false} />
      ) : null,
      name,
      band: <PopularityLabel tier={legendTier(l.pick_rate)} />,
      pick: `${l.pick_rate.toFixed(2)}%`,
      win: `${l.win_rate.toFixed(2)}%`,
      games: l.games.toLocaleString(),
      detail:
        tops.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {tops.map((m) => (
              <MainerRow
                key={m.brawlhallaId}
                mainer={m}
                legendSlug={slug}
                preview={profiles.get(m.brawlhallaId)}
                tier={tierFromRating(m.rating, valhallan.has(m.brawlhallaId))}
              />
            ))}
          </ul>
        ) : null,
    }
  })

  const weaponRows: MetaRow[] = weaponStats.weapons.map((w) => {
    const wielders = w.top_legend_ids
      .map((id) => ({ id, stat: legendById.get(id) }))
      .filter((x): x is { id: number; stat: LegendStat } => !!x.stat)
    return {
      key: w.weapon_id,
      art: <WeaponIcon weaponId={w.weapon_id} size={26} />,
      name: WEAPON_NAMES[w.weapon_id],
      band: <PopularityLabel tier={weaponTier(w.pick_rate)} />,
      pick: `${w.pick_rate.toFixed(2)}%`,
      win: `${w.win_rate.toFixed(2)}%`,
      games: w.games.toLocaleString(),
      detail:
        wielders.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {wielders.map(({ id, stat }) => (
              <WielderRow key={id} legendId={id} stat={stat} />
            ))}
          </ul>
        ) : null,
    }
  })

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
              <Chip
                key={m.id}
                href={href(region, m.id)}
                active={method === m.id}
              >
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

        {/* No headings. The art in the first column says which table is which
            before a word does, and two titles over two tables of identical
            shape were labelling the obvious. */}
        <div className="mx-auto grid max-w-[1280px] gap-6 xl:grid-cols-2">
          {legendRows.length === 0 ? (
            <Empty>
              No legends meet the sample threshold for {region}. The cron is
              still seeding — check back in a few hours.
            </Empty>
          ) : (
            // Capped at the fifteen rows the weapon table has, and scrolled
            // past that. Seventy legends beside fifteen weapons made the page a
            // column of names with a stub next to it; at the same height the
            // two read as one comparison. A height rather than a slice, because
            // the rows below are still the answer — they just are not the
            // headline.
            <div className="scroll-quiet max-h-[774px] overflow-y-auto overscroll-contain rounded-xl">
              <MetaTable rows={legendRows} detailLabel="Top mains" />
            </div>
          )}

          {weaponRows.length === 0 ? (
            <Empty>
              No weapon data for {region} yet. The Valhallan pool only seeds the
              competitive regions (US-E, EU, BRZ) — try ALL, or one of those.
            </Empty>
          ) : (
            <div>
              <MetaTable rows={weaponRows} detailLabel="Top legends" />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/**
 * One Valhallan who mains this legend.
 *
 * Their identity renders the way it does everywhere else on the site — legend
 * portrait, pro handle over in-game name, verified check, region, helm, elo —
 * because a player is a player whether they turn up on a leaderboard or inside
 * a dropdown, and a second treatment here would be the twelfth surface to
 * drift.
 *
 * The identity takes the rank gutter as well as the name column, starting where
 * the panel's own label starts. It needs the width: the name is the only item
 * in the row that can shrink, so it absorbs whatever the chrome doesn't use,
 * and inside the name column alone it was being crushed to zero.
 *
 * The three numbers on the right are all *about this legend*: what share of
 * their games they spend on it, how they do on it, and how many. Their ladder
 * standing is already the elo to the left; repeating their overall record would
 * say nothing about the legend whose row this is.
 *
 * Laid out on the parent table's column widths (META_COL) so Pick, Win and
 * Games sit directly under the headings they belong to.
 */
function MainerRow({
  mainer,
  legendSlug,
  preview,
  tier,
}: {
  mainer: TopMainer
  legendSlug: string | null
  preview?: PlayerPreview
  tier: Tier | null
}) {
  const handle = preview?.verified?.handle?.trim() || null
  return (
    <li>
      <Link
        href={`/player/${mainer.brawlhallaId}`}
        prefetch={false}
        className="flex items-center transition-colors hover:bg-card/60"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1 px-3 py-1.5">
          {legendSlug && (
            <LegendChip legendId={legendSlug} size="sm" showName={false} />
          )}
          <span className="min-w-0 truncate text-xs font-medium">
            {handle ?? mainer.username}
          </span>
          {handle && <VerifiedMark />}
          <RegionPill region={mainer.region} />
          <span className="ml-auto flex shrink-0 items-center gap-1 pl-1 font-mono text-[11px] tabular-nums">
            {tier && <RankHelm tier={tier} className="h-4" />}
            <span>{formatElo(mainer.rating)}</span>
          </span>
        </span>

        <Stat className={META_COL.stat} value={mainer.legendPickRate} suffix="%" tone="text-pink" />
        <Stat className={META_COL.stat} value={mainer.legendWinRate} suffix="%" tone="text-positive" />
        <Stat
          className={META_COL.games}
          value={mainer.legendGames}
          tone="text-muted-foreground"
          decimals={0}
        />
        <span className={cn(META_COL.chevron, "shrink-0")} />
      </Link>
    </li>
  )
}

/** One legend that wields this weapon, with its pool record. */
function WielderRow({
  legendId,
  stat,
}: {
  legendId: number
  stat: LegendStat
}) {
  const slug = slugForLegendId(legendId)
  return (
    <li className="flex items-center">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-1.5">
        {slug && <LegendChip legendId={slug} size="sm" showName={false} />}
        <span className="min-w-0 truncate text-xs font-medium">
          {rosterEntryByLegendId(legendId)?.name ?? `#${legendId}`}
        </span>
      </span>
      <Stat className={META_COL.stat} value={stat.pick_rate} suffix="%" tone="text-pink" />
      <Stat className={META_COL.stat} value={stat.win_rate} suffix="%" tone="text-positive" />
      <Stat
        className={META_COL.games}
        value={stat.games}
        tone="text-muted-foreground"
        decimals={0}
      />
      <span className={cn(META_COL.chevron, "shrink-0")} />
    </li>
  )
}

/**
 * A number in one of the parent's columns.
 *
 * Same `px-3 text-right` the table cells use, so the digits end on the same
 * pixel. Games carries no unit: the column above it is headed Games, and a "g"
 * on every row restates the heading seventy times.
 */
function Stat({
  className,
  value,
  suffix = "",
  tone,
  decimals = 1,
}: {
  className: string
  value: number | null
  suffix?: string
  tone: string
  decimals?: number
}) {
  return (
    <span
      className={cn(
        "shrink-0 px-3 text-right font-mono text-[11px] tabular-nums",
        className,
        value == null ? "text-muted-foreground/50" : tone,
      )}
    >
      {value == null
        ? "—"
        : decimals === 0
          ? `${value.toLocaleString()}${suffix}`
          : `${value.toFixed(decimals)}${suffix}`}
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
      {children}
    </p>
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
