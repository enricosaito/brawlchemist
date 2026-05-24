import { cn } from "@/lib/utils"
import { formatElo, formatPercent } from "@/lib/format"
import type { PlayerRow } from "@/lib/db/schema"
import type {
  ApiGameMode,
  PlayerRanked,
  PlayerRankedLegend,
  RankedEntry,
} from "@/lib/brawlhalla-api"
import { slugForLegendId } from "@/lib/legends-roster"
import type { Tier } from "@/lib/types"
import { LegendChip, PlayerLink, RankIcon, TIER_TEXT_COLOR } from "./primitives"

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
  const base = value.split(" ")[0]
  return (KNOWN_TIERS as readonly string[]).includes(base)
    ? (base as Tier)
    : null
}

const TIER_GRADIENT: Record<Tier, string> = {
  Tin: "from-tier-tin/20 via-tier-tin/5 to-transparent",
  Bronze: "from-tier-bronze/25 via-tier-bronze/5 to-transparent",
  Silver: "from-tier-silver/25 via-tier-silver/5 to-transparent",
  Gold: "from-tier-gold/30 via-tier-gold/5 to-transparent",
  Platinum: "from-tier-platinum/30 via-tier-platinum/5 to-transparent",
  Diamond: "from-tier-diamond/30 via-tier-diamond/5 to-transparent",
  Valhallan: "from-tier-valhallan/35 via-tier-valhallan/10 to-transparent",
}

const TIER_BORDER: Record<Tier, string> = {
  Tin: "border-tier-tin/40",
  Bronze: "border-tier-bronze/40",
  Silver: "border-tier-silver/40",
  Gold: "border-tier-gold/45",
  Platinum: "border-tier-platinum/45",
  Diamond: "border-tier-diamond/45",
  Valhallan: "border-tier-valhallan/50",
}

const TOP_LEGENDS_LIMIT = 5

function topLegendSlugsFor(player: PlayerRow | undefined): string[] {
  if (!player?.rankedJson) return []
  const ranked = player.rankedJson as PlayerRanked
  const legends: PlayerRankedLegend[] = Array.isArray(ranked.legends)
    ? ranked.legends
    : []
  return legends
    .filter((l) => typeof l.games === "number" && l.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, TOP_LEGENDS_LIMIT)
    .map((l) => slugForLegendId(l.legend_id))
    .filter((s): s is string => !!s)
}

function formatWinRate(wins: number | null, losses: number | null): string {
  if (wins == null || losses == null) return "—"
  const total = wins + losses
  if (total === 0) return "—"
  return formatPercent((wins / total) * 100)
}

function PodiumCard({
  entry,
  playersMap,
  gameMode,
  highlight,
}: {
  entry: RankedEntry
  playersMap: Map<number, PlayerRow>
  gameMode: ApiGameMode
  highlight: boolean
}) {
  const tier = toTier(entry.tier)
  const tint = tier ?? "Valhallan"
  const username = entry.players.map((p) => p.username).join(" + ")
  const player = entry.players[0]
  const slugs =
    gameMode === "1v1" && player
      ? topLegendSlugsFor(playersMap.get(player.id))
      : []
  const winRate = formatWinRate(entry.wins, entry.losses)
  const totalGames = (entry.wins ?? 0) + (entry.losses ?? 0)

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card/60 p-5 shadow-lg backdrop-blur-sm transition-transform",
        TIER_BORDER[tint],
        highlight && "ring-2 ring-tier-gold/40 sm:-translate-y-2",
      )}
    >
      {/* Tier-tinted backdrop wash */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br",
          TIER_GRADIENT[tint],
        )}
      />

      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 font-display text-base font-bold text-foreground">
          {entry.rank}
        </span>
        <PlayerLink
          id={gameMode === "1v1" ? player?.id : null}
          className="min-w-0 flex-1 truncate text-center text-lg font-semibold leading-tight"
        >
          {username || "—"}
        </PlayerLink>
        {tier && <RankIcon tier={tier} size={44} className="shrink-0" />}
      </div>

      <div className="relative flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
            {entry.rating != null ? formatElo(entry.rating) : "—"}
          </span>
          {entry.rating != null && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              ELO
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
          {tier && (
            <span className={TIER_TEXT_COLOR[tier]}>{entry.tier}</span>
          )}
          {tier && <span className="text-muted-foreground/60">·</span>}
          <span className="text-positive">{winRate}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">
            {totalGames.toLocaleString()} games
          </span>
        </span>
      </div>

      {slugs.length > 0 && (
        <div className="relative flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Best legends
          </span>
          <div className="flex items-center gap-1.5">
            {slugs.map((slug) => (
              <LegendChip
                key={slug}
                legendId={slug}
                size="md"
                showName={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function LeaderboardPodium({
  entries,
  playersMap,
  gameMode,
}: {
  entries: RankedEntry[]
  playersMap: Map<number, PlayerRow>
  gameMode: ApiGameMode
}) {
  const top3 = entries.slice(0, 3)
  if (top3.length === 0) return null

  return (
    <div className="mx-auto mb-4 grid max-w-[1280px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {top3.map((entry, i) => (
        <PodiumCard
          key={`${entry.rank}-${entry.players[0]?.id ?? "x"}`}
          entry={entry}
          playersMap={playersMap}
          gameMode={gameMode}
          highlight={i === 0}
        />
      ))}
    </div>
  )
}
