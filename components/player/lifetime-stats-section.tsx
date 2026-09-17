import type { PlayerStats } from "@/lib/brawlhalla-api"
import {
  computeLifetimeStats,
  type LifetimeLegendRow,
  type LifetimeWeaponRow,
} from "@/lib/profile/lifetime-stats"
import { cn } from "@/lib/utils"
import { LegendChip, WeaponIcon } from "@/components/site/primitives"

/**
 * Lifetime legend and weapon records — the ?tab=stats view of a profile.
 *
 * A tab rather than its own route, and that is not just a layout preference:
 * the profile page already fetches this exact GetPlayerStats payload for the
 * header's weapon shares and legend titles, so rendering it here costs nothing
 * at all. A separate page re-entered the same 24h-cached fetch and needed its
 * own crawler policy on top; as a tab it inherits the profile's, which already
 * hands bots stored data and skips every upstream call (cardinal constraint #3).
 *
 * Takes the raw payload rather than a derived object so the caller passes what
 * it already has, and the derivation stays in one place.
 */
export function LifetimeStatsSection({ stats }: { stats: PlayerStats | null }) {
  if (!stats) {
    return (
      <Wrap>
        <p className="rounded-2xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          Lifetime stats aren&apos;t loaded for this view — the Brawlhalla API
          didn&apos;t answer, or this is a crawler request served from storage.
          The ranked season above is unaffected.
        </p>
      </Wrap>
    )
  }

  const lifetime = computeLifetimeStats(stats)

  if (lifetime.games === 0) {
    return (
      <Wrap>
        <p className="rounded-2xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          No lifetime matches on record for this account yet.
        </p>
      </Wrap>
    )
  }

  return (
    <Wrap>
      <div className="grid gap-10 xl:grid-cols-2 xl:gap-6">
        <Section title="Legends">
          <Table
            maxHeight={LEGEND_VIEWPORT}
            head={["#", "Legend", "Matches", "Win rate", "Level"]}
            rows={lifetime.legends.map((l, i) => (
              <LegendRow key={l.legendId} row={l} rank={i + 1} />
            ))}
          />
        </Section>

        <Section title="Weapons">
          {/* The caveat sits above the numbers rather than in a footnote, because
            it changes how they should be read and a footnote is where a caveat
            goes to be ignored. */}
          <Table
            head={["#", "Weapon", "Matches", "Win rate"]}
            rows={lifetime.weapons.map((w, i) => (
              <WeaponRow key={w.weaponId} row={w} rank={i + 1} />
            ))}
          />
        </Section>
      </div>
    </Wrap>
  )
}

/** Matches the horizontal rhythm of the Ranked Season block it replaces. */
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 px-4 sm:px-6">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-10">
        {children}
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/**
 * How tall the Legends table is allowed to get: its header plus fifteen rows,
 * measured rather than guessed.
 *
 * Fifteen because that is how many weapons there are, and the two tables sit
 * side by side — a roster of sixty-odd legends beside a fixed fifteen turned
 * the pair into a column with a stub next to it. Same reason /meta-picks caps
 * its legend half. A height rather than a slice, because the rows below are
 * still the answer; they just are not the headline.
 */
const LEGEND_VIEWPORT = "max-h-[652px]"

/** Tables scroll rather than squeeze — four numeric columns don't fit a phone. */
function Table({
  head,
  rows,
  maxHeight,
}: {
  head: string[]
  rows: React.ReactNode[]
  /** Caps the visible rows and scrolls past them. Omit for the full table. */
  maxHeight?: string
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-2xl border border-border/60 bg-card/40",
        maxHeight && "scroll-quiet overflow-y-auto overscroll-contain",
        maxHeight
      )}
    >
      <table className="w-full min-w-[440px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  "px-4 py-2.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase",
                  // Column 0 is the rank and column 1 is the name; everything
                  // after them is a number, and numbers align right.
                  i === 1 ? "text-left" : "text-right",
                  i === 0 && "w-[56px]"
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

const CELL = "px-4 py-2.5 text-right font-mono tabular-nums"

/**
 * The ordinal. Both tables arrive sorted — legends by XP, weapons by matches —
 * so the position is already true of the row; printing it just saves counting
 * down to "where does my ninth-most-played legend sit". Muted and monospaced,
 * because it is a label for the row rather than one of its numbers.
 */
function Rank({ value }: { value: number }) {
  return (
    <td className="w-[56px] px-4 py-2.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
      {value}
    </td>
  )
}

/** Brawlhalla's per-legend cap. Maxed reads as an achievement, not a number. */
const MAX_LEGEND_LEVEL = 100

function WinRate({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={value >= 50 ? "text-positive" : "text-muted-foreground"}>
      {value.toFixed(1)}%
    </span>
  )
}

function LegendRow({ row, rank }: { row: LifetimeLegendRow; rank: number }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-card/60">
      <Rank value={rank} />
      <td className="px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          {row.slug ? (
            <LegendChip legendId={row.slug} size="sm" showName={false} />
          ) : (
            <span className="size-6 shrink-0 rounded border border-border/60 bg-muted/30" />
          )}
          <span className="truncate font-medium">{row.name}</span>
        </span>
      </td>
      <td className={CELL}>{row.games.toLocaleString()}</td>
      <td className={CELL}>
        <WinRate value={row.winRate} />
      </td>
      <td
        className={cn(CELL, row.level >= MAX_LEGEND_LEVEL && "text-tier-gold")}
      >
        {row.level}
      </td>
    </tr>
  )
}

function WeaponRow({ row, rank }: { row: LifetimeWeaponRow; rank: number }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-card/60">
      <Rank value={rank} />
      <td className="px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <WeaponIcon weaponId={row.weaponId} size={24} className="shrink-0" />
          <span className="truncate font-medium">{row.label}</span>
        </span>
      </td>
      <td className={CELL}>{row.games.toLocaleString()}</td>
      <td className={CELL}>
        <WinRate value={row.winRate} />
      </td>
    </tr>
  )
}
