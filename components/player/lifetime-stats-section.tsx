import type { PlayerStats } from "@/lib/brawlhalla-api"
import { formatElo } from "@/lib/format"
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Matches" value={lifetime.games.toLocaleString()} />
        <Tile label="Wins" value={lifetime.wins.toLocaleString()} />
        <Tile label="Losses" value={lifetime.losses.toLocaleString()} />
        <Tile
          label="Win rate"
          value={
            lifetime.winRate == null ? "—" : `${lifetime.winRate.toFixed(1)}%`
          }
          tone={
            lifetime.winRate != null && lifetime.winRate >= 50
              ? "text-positive"
              : undefined
          }
        />
        <Tile label="Account level" value={String(lifetime.level)} />
        <Tile label="Total XP" value={formatElo(lifetime.xp)} />
        <Tile
          label="Playtime"
          value={`${lifetime.playtimeHours.toLocaleString()}h`}
        />
        <Tile label="Legends played" value={String(lifetime.legends.length)} />
      </div>

      <Section
        title="Legends"
        note={`${lifetime.legends.length} played · exact, as reported per legend`}
      >
        <Table
          head={["Legend", "Matches", "W / L", "Win rate", "Level", "Playtime"]}
          rows={lifetime.legends.map((l) => (
            <LegendRow key={l.legendId} row={l} />
          ))}
        />
      </Section>

      <Section
        title="Weapons"
        note="Time held is exact — the record is attributed"
      >
        {/* The caveat sits above the numbers rather than in a footnote, because
            it changes how they should be read and a footnote is where a caveat
            goes to be ignored. */}
        <p className="mb-3 max-w-[70ch] text-[11px] text-muted-foreground">
          Brawlhalla reports wins per <em>legend</em>, never per weapon, and
          every legend carries two. A legend&apos;s record is split between their
          weapons in proportion to the time each was held — so{" "}
          <span className="text-foreground">time held and share are exact</span>,
          and matches, wins and losses are an estimate.
        </p>
        <Table
          head={[
            "Weapon",
            "Matches*",
            "W / L*",
            "Win rate*",
            "Time held",
            "Share",
          ]}
          rows={lifetime.weapons.map((w) => (
            <WeaponRow key={w.weaponId} row={w} />
          ))}
        />
      </Section>
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
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {note}
        </span>
      </div>
      {children}
    </section>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn("mt-1 font-mono text-xl font-bold tabular-nums", tone)}
      >
        {value}
      </div>
    </div>
  )
}

/** Tables scroll rather than squeeze — six numeric columns don't fit a phone. */
function Table({
  head,
  rows,
}: {
  head: string[]
  rows: React.ReactNode[]
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  "px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
                  i === 0 ? "text-left" : "text-right",
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

function WinRate({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={value >= 50 ? "text-positive" : "text-muted-foreground"}>
      {value.toFixed(1)}%
    </span>
  )
}

function LegendRow({ row }: { row: LifetimeLegendRow }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-card/60">
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
        <span className="text-positive">{row.wins.toLocaleString()}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-muted-foreground">
          {row.losses.toLocaleString()}
        </span>
      </td>
      <td className={CELL}>
        <WinRate value={row.winRate} />
      </td>
      <td className={CELL}>{row.level}</td>
      <td className={CELL}>{row.playtimeHours.toLocaleString()}h</td>
    </tr>
  )
}

function WeaponRow({ row }: { row: LifetimeWeaponRow }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-card/60">
      <td className="px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <WeaponIcon weaponId={row.weaponId} size={24} className="shrink-0" />
          <span className="truncate font-medium">{row.label}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {row.legendCount} legend{row.legendCount === 1 ? "" : "s"}
          </span>
        </span>
      </td>
      <td className={CELL}>{row.games.toLocaleString()}</td>
      <td className={CELL}>
        <span className="text-positive">{row.wins.toLocaleString()}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-muted-foreground">
          {row.losses.toLocaleString()}
        </span>
      </td>
      <td className={CELL}>
        <WinRate value={row.winRate} />
      </td>
      <td className={CELL}>{row.timeHeldHours.toLocaleString()}h</td>
      <td className={CELL}>{row.sharePct.toFixed(1)}%</td>
    </tr>
  )
}
