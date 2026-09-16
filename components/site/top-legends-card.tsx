import Link from "next/link"
import { CURRENT_PATCH } from "@/lib/mock-data"
import { formatPercent } from "@/lib/format"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { getValhallanLegendStats } from "@/lib/sync/valhallan"
import { PreviewCard } from "./preview-card"
import { LegendChip, PatchTag } from "./primitives"

/** Rows on the card. Six matches the Live Rankings card beside it. */
const TOP_N = 6

/**
 * Top Legends — the six most-played legends in the Valhallan+ pool, measured.
 *
 * This used to be six hardcoded slugs carrying hardcoded tier grades and best
 * stances from mock-data, with only the win rate and game count coming from
 * the live aggregation. So the card could tell you Cassidy was S+ on a patch
 * where nobody had said otherwise in months, next to a game count that was
 * genuinely current — the worst kind of stale, because the live numbers lent
 * it credibility.
 *
 * Everything shown is now derived from the same query the /legends page uses:
 * `method: "popular"` already orders by games desc, so the top six are the top
 * six. Nothing here can go stale without the data going stale with it, and a
 * legend rising into the top six needs no code change to appear.
 */
export async function TopLegendsCard({
  className,
}: {
  className?: string
} = {}) {
  // Fails open to an empty card rather than taking down the homepage
  // (cardinal constraint #5). minGames filters out the long tail of legends
  // with a handful of games, which would otherwise dominate nothing but noise.
  let rows: {
    slug: string
    name: string
    winRate: number
    games: number
    pickRate: number
  }[] = []
  try {
    const { legends } = await getValhallanLegendStats({
      method: "popular",
      region: null,
      minGames: 100,
    })
    rows = legends
      .map((l) => {
        const entry = rosterEntryByLegendId(l.legend_id)
        const slug = slugForLegendId(l.legend_id)
        return entry && slug
          ? {
              slug,
              name: entry.name,
              winRate: l.win_rate,
              games: l.games,
              pickRate: l.pick_rate,
            }
          : null
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, TOP_N)
  } catch (err) {
    console.error("[top-legends-card] stats lookup failed:", err)
  }

  return (
    <PreviewCard
      title="Top legends"
      href="/meta-picks"
      viewAllLabel="view legend meta"
      className={className}
      meta={
        <>
          <span className="rounded border border-tier-valhallan/40 bg-tier-valhallan/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-tier-valhallan">
            Valhallan+
          </span>
          <PatchTag version={CURRENT_PATCH} />
        </>
      }
    >
      <ol className="grid auto-rows-fr divide-y divide-border/60">
        {rows.length === 0 ? (
          <li className="flex items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
            No legend stats yet.
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.slug}>
              <Link
                href={`/leaderboards/1v1?legend=${row.slug}`}
                className="group/row relative flex h-full min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40"
              >
                {/* No ordinal, matching Popular Weapons beside it: the list is
                    already ordered top-down and the games column says by how
                    much, so the index was a third way of stating the same
                    thing. The portrait leads instead. */}
                <LegendChip legendId={row.slug} size="md" showName={false} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {row.name}
                  </span>
                  {/* Pick rate is why the legend is on this list, so it says so
                      where the hardcoded "best stance" used to sit. Nowrap:
                      the label wrapping to a second line made these rows
                      taller than the two cards either side of it. */}
                  <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatPercent(row.pickRate)} pick
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-sm tabular-nums">
                    {formatPercent(row.winRate)}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {row.games.toLocaleString()} games
                  </span>
                </div>
              </Link>
            </li>
          ))
        )}
      </ol>
    </PreviewCard>
  )
}
