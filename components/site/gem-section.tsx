import Image from "next/image"
import type { PlayerStats } from "@/lib/brawlhalla-api"
import { formatCompact } from "@/lib/format"
import { computeLifetimeStats } from "@/lib/profile/lifetime-stats"
import { resolveGems, type GemContext, type GemLevelDef } from "@/lib/profile/gems"
import { cn } from "@/lib/utils"
import { LifetimeStatsSection } from "@/components/player/lifetime-stats-section"
import { LegendChip, WeaponIcon } from "./primitives"

/**
 * The Gems section: six cards, then the records they are cut from.
 *
 * One grid rather than a row of gems above a grid of stat tiles. The two were
 * saying the same things in two shapes — Total Wins sat in a gem and again in a
 * tile two inches below — and the tiles that weren't duplicating a gem (Losses,
 * Legends played) were restated a few hundred pixels lower by the tables
 * themselves. Six cards, every one of them a different question.
 *
 * Three are graded gems and three are plain readings, and they share a shape on
 * purpose: a card here answers "how am I doing at this", and whether the answer
 * happens to have a colour attached is a property of the metric, not a reason
 * to look different.
 */
export function GemSection({
  context,
  stats,
}: {
  context: GemContext
  /** The lifetime payload the gems are graded from, when it loaded. */
  stats: PlayerStats | null
}) {
  const gems = resolveGems(context)
  const lifetime = stats ? computeLifetimeStats(stats) : null

  // Both ranked by matches, which is also what both cards print. Ranking on one
  // metric and showing another is how a "most played" card ends up disagreeing
  // with the table underneath it. Both arrays already arrive games-sorted.
  const topLegend = lifetime?.legends[0] ?? null
  const topWeapon = lifetime?.weapons[0] ?? null

  return (
    <>
      <div className="mt-6 px-4 sm:px-6">
        <div className="mx-auto grid max-w-[1280px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gems.map(({ def, value, level, next }) => (
            <Card
              key={def.id}
              lit={!!level}
              art={<Gem level={level} />}
              title={def.name}
              tag={level ? level.label : "Uncut"}
              value={value == null ? "—" : value.toLocaleString()}
              // Account Level and Total XP were two tiles saying one thing:
              // the level is the XP, rounded off. XP rides its own gem's card.
              sub={gemSub(def.id, value, next, lifetime)}
            />
          ))}

          {/* Reserved. The win rate moved onto Total Wins, where it belongs —
              a win count and the rate it came at are one fact — and the slot
              stays so the grid keeps its two rows of three rather than
              reflowing the moment something fills it. */}
          <div className="min-h-[104px] rounded-2xl border border-dashed border-border/60 bg-card/25" />

          <Card
            lit={!!topLegend}
            art={
              topLegend?.slug ? (
                <LegendChip legendId={topLegend.slug} size="lg" showName={false} />
              ) : undefined
            }
            title="Most played legend"
            value={topLegend?.name ?? "—"}
            valueSize="text-base"
            sub={
              topLegend
                ? `${topLegend.games.toLocaleString()} matches · Level ${topLegend.level}`
                : "No data yet"
            }
          />

          <Card
            lit={!!topWeapon}
            art={
              topWeapon ? (
                <WeaponIcon weaponId={topWeapon.weaponId} size={40} />
              ) : undefined
            }
            title="Most played weapon"
            value={topWeapon?.label ?? "—"}
            valueSize="text-base"
            sub={
              topWeapon
                ? `${topWeapon.games.toLocaleString()} matches`
                : "No data yet"
            }
          />
        </div>
      </div>

      <LifetimeStatsSection stats={stats} />
    </>
  )
}

/**
 * A gem's second line.
 *
 * Two of the three carry numbers that used to have tiles of their own — the
 * level *is* the XP rounded off, and a win count without the rate it came at is
 * half a fact. The third falls back to the distance to the next level, which is
 * the only thing a graded badge can say that a binary one can't.
 */
function gemSub(
  id: string,
  value: number | null,
  next: { min: number; label: string } | null,
  lifetime: ReturnType<typeof computeLifetimeStats> | null,
): string {
  if (lifetime) {
    if (id === "account-level") {
      return `${formatCompact(lifetime.xp)} XP · ${lifetime.playtimeHours.toLocaleString()}h`
    }
    if (id === "total-wins" && lifetime.games > 0) {
      return `${lifetime.games.toLocaleString()} matches · ${lifetime.winRate?.toFixed(1) ?? "—"}%`
    }
  }
  if (value == null) return "No data yet"
  if (next) return `${(next.min - value).toLocaleString()} to ${next.label}`
  return "Maxed"
}

/** One shape for all six, so a gem and a reading sit level with each other. */
function Card({
  lit,
  art,
  title,
  tag,
  value,
  valueSize = "text-xl",
  tone,
  sub,
}: {
  /** Has a value worth showing — drives the card's weight, like an uncut gem. */
  lit: boolean
  art?: React.ReactNode
  title: string
  /** The gem's level name, where there is one. */
  tag?: string
  value: string
  valueSize?: string
  tone?: string
  sub: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border p-4 backdrop-blur-sm",
        lit ? "border-border/60 bg-card/50" : "border-border/40 bg-card/25",
      )}
    >
      {art && <span className="flex shrink-0 items-center">{art}</span>}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{title}</span>
          {tag && (
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-wider",
                lit ? "text-foreground/70" : "text-muted-foreground/60",
              )}
            >
              {tag}
            </span>
          )}
        </span>
        <span
          className={cn("truncate font-mono font-bold tabular-nums", valueSize, tone)}
        >
          {value}
        </span>
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {sub}
        </span>
      </div>
    </div>
  )
}

/**
 * The gem itself: the level's sprite, and a tinted facet shape for a level that
 * has none — which is the state an uncut gem and every newly added level start
 * in. The fallback is drawn rather than boxed because a placeholder rectangle
 * beside a name reads as a broken image.
 */
function Gem({ level }: { level: GemLevelDef | null }) {
  if (level?.src) {
    return (
      <Image
        src={level.src}
        alt=""
        width={level.width ?? 192}
        height={level.height ?? 192}
        unoptimized
        className="size-14 shrink-0 object-contain select-none"
      />
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-14 shrink-0", !level && "opacity-25")}
      style={{ color: level?.tone ?? "var(--color-muted-foreground)" }}
    >
      {/* Three facets, so the shape reads as cut stone rather than a pentagon. */}
      <path d="M12 2 3 9l9 13 9-13z" fill="currentColor" opacity="0.28" />
      <path d="M12 2 3 9h18z" fill="currentColor" opacity="0.9" />
      <path d="M12 22 3 9h6z" fill="currentColor" opacity="0.55" />
      <path d="M12 22 21 9h-6z" fill="currentColor" opacity="0.7" />
      <path
        d="M12 2 3 9l9 13 9-13z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}
