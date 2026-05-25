import Image from "next/image"
import Link from "next/link"
import { formatElo, formatPercent } from "@/lib/format"
import type { PlayerRow } from "@/lib/db/schema"
import type {
  ApiGameMode,
  PlayerRanked,
  PlayerRankedLegend,
  RankedEntry,
} from "@/lib/brawlhalla-api"
import { slugForLegendId } from "@/lib/legends-roster"
import type { PlayerPreview } from "@/lib/player-previews"
import type { Tier } from "@/lib/types"
import { LegendChip, TIER_TEXT_COLOR } from "./primitives"
import { PlayerName, ProBadge } from "./pro-badge"

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
  previews,
}: {
  entry: RankedEntry
  playersMap: Map<number, PlayerRow>
  gameMode: ApiGameMode
  previews: Map<number, PlayerPreview>
}) {
  const tier = toTier(entry.tier)
  const username = entry.players.map((p) => p.username).join(" + ")
  const player = entry.players[0]
  const slugs =
    gameMode === "1v1" && player
      ? topLegendSlugsFor(playersMap.get(player.id))
      : []
  const winRate = formatWinRate(entry.wins, entry.losses)
  const totalGames = (entry.wins ?? 0) + (entry.losses ?? 0)

  // Admin-curated previews (verified pros, favorite skins) keyed by brawlhalla
  // id. The skin belongs to the primary player; the pro badge shows if either
  // teammate is verified.
  const primaryPreview = player ? previews.get(player.id) : undefined
  const skin = primaryPreview?.favoriteSkin
  const handle = primaryPreview?.verified?.handle
  const verified = entry.players.some((p) => previews.get(p.id)?.verified)

  const href = gameMode === "1v1" && player?.id ? `/player/${player.id}` : null

  // Whole card is the click target. The pink hover glow (Valhallan token)
  // replaces the old per-name copper hover — only on the linked (1v1) cards.
  const baseClass =
    "relative flex gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 shadow-lg backdrop-blur-sm"
  const interactiveClass =
    "transition hover:border-tier-valhallan/60 hover:shadow-[0_0_24px_-4px_oklch(0.76_0.24_0_/_0.55)]"

  const body = (
    <>
      {/* Favorite skin — faint character art bleeding in from the right as a
          backdrop. Cropped by overflow-hidden; masked so it fades into the card
          rather than hard-cutting across the stats. */}
      {skin && (
        <Image
          src={skin.src}
          alt=""
          aria-hidden
          width={364}
          height={323}
          className="pointer-events-none absolute -right-6 top-1/2 h-[150%] w-auto max-w-none -translate-y-1/2 select-none object-contain opacity-[0.12]"
          style={{
            maskImage: "linear-gradient(to left, black 35%, transparent 95%)",
            WebkitMaskImage: "linear-gradient(to left, black 35%, transparent 95%)",
          }}
        />
      )}

      {/* Left rail — rank banner. */}
      {tier && (
        <Image
          src={`/assets/ranks/Banner_Rank_${tier}.webp`}
          alt={`${tier} rank banner`}
          width={182}
          height={330}
          className="relative h-28 w-auto shrink-0 select-none object-contain drop-shadow-md sm:h-32"
        />
      )}

      {/* Right column — identity, rating, and best legends. */}
      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 font-display text-sm font-bold text-foreground">
            {entry.rank}
          </span>
          {entry.players.length === 1 && player && handle ? (
            <PlayerName
              username={player.username}
              handle={handle}
              className="flex-1 text-base font-semibold leading-tight"
            />
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-base font-semibold leading-tight">
                {username || "—"}
              </span>
              {verified && <ProBadge className="shrink-0" />}
            </>
          )}
        </div>

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

        <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
          {tier && <span className={TIER_TEXT_COLOR[tier]}>{entry.tier}</span>}
          {tier && <span className="text-muted-foreground/60">·</span>}
          <span className="text-positive">{winRate}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">
            {totalGames.toLocaleString()} games
          </span>
        </span>

        {slugs.length > 0 && (
          <div className="mt-auto flex items-center gap-1.5 pt-1">
            {slugs.map((slug) => (
              <LegendChip
                key={slug}
                legendId={slug}
                size="md"
                showName={false}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )

  return href ? (
    <Link href={href} className={`${baseClass} ${interactiveClass}`}>
      {body}
    </Link>
  ) : (
    <div className={baseClass}>{body}</div>
  )
}

export function LeaderboardPodium({
  entries,
  playersMap,
  gameMode,
  previews,
}: {
  entries: RankedEntry[]
  playersMap: Map<number, PlayerRow>
  gameMode: ApiGameMode
  previews: Map<number, PlayerPreview>
}) {
  const top3 = entries.slice(0, 3)
  if (top3.length === 0) return null

  return (
    <div className="mx-auto mb-4 grid max-w-[1280px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {top3.map((entry) => (
        <PodiumCard
          key={`${entry.rank}-${entry.players[0]?.id ?? "x"}`}
          entry={entry}
          playersMap={playersMap}
          gameMode={gameMode}
          previews={previews}
        />
      ))}
    </div>
  )
}
