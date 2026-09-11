import Link from "next/link"
import { BadgeCheck, TrendingUp } from "lucide-react"
import { Marquee } from "@/components/marquee"
import { LegendChip } from "@/components/site/primitives"
import type { PlayerPreview } from "@/lib/player-previews"
import { slugForLegendId } from "@/lib/legends-roster"
import type { LiveRow } from "@/lib/sync/live"
import type { PlayerRow } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

/**
 * LiveClimbers — who's been on the ladder today, as one compact scrolling
 * strip above the live grid.
 *
 * The strip is labelled "Played today" but the rows are still the biggest
 * single-session ELO *gains* — the underlying query filters to eloDiff > 0.
 * That's a deliberate curation (a ticker of the day's best runs), not a full
 * activity list; if it should literally mean everyone who queued, the filter
 * in getDailyMovers is the one line to change.
 *
 * This replaces a pair of stacked panels (climbers + drops) that between them
 * took most of the first screen. The player cards are what the page is for, so
 * the climbers become a ticker: same information, one row tall, and the motion
 * reads as "the ladder is moving" rather than costing anyone a scroll.
 *
 * Drops are gone entirely — not folded in. A wall of red under someone's name
 * is a worse thing to publish than it is useful to read, and the query for it
 * is skipped upstream rather than fetched and discarded.
 */
export function LiveClimbers({
  rows,
  playersMap,
  previews,
}: {
  rows: LiveRow[]
  playersMap: Map<number, PlayerRow>
  previews: Map<number, PlayerPreview>
}) {
  if (rows.length === 0) return null

  return (
    <section className="mx-auto mb-5 max-w-[1280px]">
      <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/40 py-2 pl-3 backdrop-blur-sm">
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-positive">
          <TrendingUp className="size-3.5" />
          Played today
        </span>
        <span aria-hidden className="h-4 w-px shrink-0 bg-border/60" />
        {/* Duplicated by Marquee for the seamless loop, so the strip is
            decorative repetition — the same players are reachable as real
            links, and screen readers get the list once via the sr-only copy. */}
        <Marquee
          duration={Math.max(18, rows.length * 6)}
          pauseOnHover
          fadeAmount={6}
          className="min-w-0 flex-1"
        >
          {rows.map((row) => (
            <ClimberChip
              key={row.id}
              row={row}
              playersMap={playersMap}
              previews={previews}
            />
          ))}
        </Marquee>
      </div>
      <ul className="sr-only">
        {rows.map((row) => (
          <li key={row.id}>
            {row.players.map((p) => previews.get(p.id)?.verified?.handle ?? p.name).join(" + ")}
            {` up ${row.eloDiff} elo today`}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ClimberChip({
  row,
  playersMap,
  previews,
}: {
  row: LiveRow
  playersMap: Map<number, PlayerRow>
  previews: Map<number, PlayerPreview>
}) {
  const solo = row.players.length === 1
  const player = row.players[0]
  const lid = player ? playersMap.get(player.id)?.topLegendId : null
  const slug = lid ? slugForLegendId(lid) : null
  const handle = player ? previews.get(player.id)?.verified?.handle : null
  const name = solo
    ? (handle ?? player?.name ?? "—")
    : row.players
        .map((p) => previews.get(p.id)?.verified?.handle ?? p.name)
        .join(" + ")

  const inner = (
    <span className="mx-1.5 flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 transition-colors">
      {slug && <LegendChip legendId={slug} size="sm" showName={false} />}
      <span className="max-w-[16ch] truncate text-sm font-medium">{name}</span>
      {solo && handle && (
        <BadgeCheck className="size-3.5 shrink-0 text-foreground" />
      )}
      <span className="font-mono text-xs font-semibold tabular-nums text-positive">
        +{row.eloDiff.toLocaleString()}
      </span>
    </span>
  )

  return solo && player ? (
    <Link
      href={`/player/${player.id}`}
      prefetch={false}
      className={cn("shrink-0 hover:[&>span]:bg-muted/50")}
      aria-hidden
      tabIndex={-1}
    >
      {inner}
    </Link>
  ) : (
    <span aria-hidden className="shrink-0">
      {inner}
    </span>
  )
}
