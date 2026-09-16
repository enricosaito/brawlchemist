import Link from "next/link"
import type { Metadata } from "next"
import { cn } from "@/lib/utils"
import { MetaTable, type MetaRow } from "@/components/site/meta-table"
import { LegendChip, PatchTag, WeaponIcon } from "@/components/site/primitives"
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
  const [legendStats, weaponStats, mainers] = await Promise.all([
    getValhallanLegendStats({ region: regionFilter, method, minGames }),
    getValhallanWeaponStats({ region: regionFilter }),
    getTopValhallanMainers({ region: regionFilter, perLegend: 5 }),
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
          <ul className="flex flex-col gap-1">
            {tops.map((m) => (
              <DetailRow
                key={m.brawlhallaId}
                href={`/player/${m.brawlhallaId}`}
                art={
                  slug ? (
                    <LegendChip legendId={slug} size="sm" showName={false} />
                  ) : null
                }
                name={m.username}
                meta={`${m.region} · ${formatElo(m.rating)} elo`}
                games={m.legendGames}
                winRate={m.legendWinRate}
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
          <ul className="flex flex-col gap-1">
            {wielders.map(({ id, stat }) => {
              const slug = slugForLegendId(id)
              return (
                <DetailRow
                  key={id}
                  href={null}
                  art={
                    slug ? (
                      <LegendChip legendId={slug} size="sm" showName={false} />
                    ) : null
                  }
                  name={rosterEntryByLegendId(id)?.name ?? `#${id}`}
                  meta={`${stat.pick_rate.toFixed(2)}% pick`}
                  games={stat.games}
                  winRate={stat.win_rate}
                />
              )
            })}
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

/** One line of an expanded panel — the same shape on both sides. */
function DetailRow({
  href,
  art,
  name,
  meta,
  games,
  winRate,
}: {
  href: string | null
  art: React.ReactNode
  name: string
  meta: string
  games: number | null
  winRate: number | null
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {art}
        <span className="truncate text-xs font-medium">{name}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {meta}
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums">
        <span className="text-muted-foreground">
          {games != null ? `${games.toLocaleString()}g` : "—"}
        </span>
        <span
          className={winRate != null ? "text-positive" : "text-muted-foreground"}
        >
          {winRate != null ? `${winRate.toFixed(1)}%` : "—"}
        </span>
      </span>
    </>
  )
  return (
    <li>
      {href ? (
        <Link
          href={href}
          prefetch={false}
          className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-card/60"
        >
          {body}
        </Link>
      ) : (
        <span className="flex items-center gap-2 px-2 py-1">{body}</span>
      )}
    </li>
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
