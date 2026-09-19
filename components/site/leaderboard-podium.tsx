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
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { placeholderSkinFor, skinArtUrl } from "@/lib/skins"
import type { PlayerPreview } from "@/lib/player-previews"
import { LegendChip, REGION_COLOR, TIER_TEXT_COLOR } from "./primitives"
import { VerifiedMark } from "./pro-badge"
import { SmurfMark } from "./smurf-mark"
import { FlairMark } from "./flair-mark"
import { flairContextFrom } from "@/lib/profile/flair"
import { toTier } from "@/lib/tier"

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
  flairs,
  smurfs,
  showRegion,
}: {
  entry: RankedEntry
  playersMap: Map<number, PlayerRow>
  gameMode: ApiGameMode
  previews: Map<number, PlayerPreview>
  flairs: Map<number, string>
  smurfs: Set<number>
  showRegion: boolean
}) {
  const tier = toTier(entry.tier)
  const username = entry.players.map((p) => p.username).join(" + ")
  const player = entry.players[0]
  // Single-player modes (1v1, solo 2v2) show best legends + link to the
  // profile; team 2v2 doesn't (two players, ambiguous).
  const isSolo = gameMode !== "2v2"
  const slugs =
    isSolo && player ? topLegendSlugsFor(playersMap.get(player.id)) : []
  const winRate = formatWinRate(entry.wins, entry.losses)
  const totalGames = (entry.wins ?? 0) + (entry.losses ?? 0)

  // Admin-curated previews (verified pros, favorite skins) keyed by brawlhalla
  // id. The skin belongs to the primary player; the pro badge shows if either
  // teammate is verified.
  const primaryPreview = player ? previews.get(player.id) : undefined

  // The art slot, filled from the best thing we know about this player.
  //
  // A curated favorite wins — it is a deliberate choice about someone we have
  // verified. Failing that, a skin for the legend they actually main, which is
  // a fact we already hold: topLegendId is denormalised onto the player row, so
  // this costs no query and no API call. Before, the slot filled only for the
  // handful of curated players and the top three read as three different
  // components rather than three of the same card.
  //
  // It is decoration, not a claim: 12% opacity, aria-hidden, no tooltip. We are
  // not saying this is the skin they play — the card says who they are in text,
  // and this is the texture behind it.
  const mainLegendId = player ? playersMap.get(player.id)?.topLegendId : null
  const mainLegendName = mainLegendId
    ? rosterEntryByLegendId(mainLegendId)?.name
    : null
  const placeholder =
    !primaryPreview?.favoriteSkin && mainLegendName && player
      ? placeholderSkinFor(mainLegendName, player.id)
      : null
  const skinSrc =
    primaryPreview?.favoriteSkin?.src ??
    (placeholder ? skinArtUrl(placeholder, 400) : null)
  const handle = primaryPreview?.verified?.handle
  const verified = entry.players.some((p) => previews.get(p.id)?.verified)

  const href = isSolo && player?.id ? `/player/${player.id}` : null

  // Whole card is the click target. The pink hover glow (Valhallan token)
  // replaces the old per-name copper hover — only on the linked (1v1) cards.
  const baseClass =
    "relative flex gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 shadow-lg backdrop-blur-sm"
  const interactiveClass =
    "transition hover:border-tier-valhallan/60 hover:shadow-[0_0_24px_-4px_oklch(0.76_0.24_0_/_0.55)]"

  const body = (
    <>
      {/* Skin art — faint character art bleeding in from the right as a
          backdrop. The curated favorite when there is one, otherwise a skin of
          their main legend (see the note above). Cropped by overflow-hidden;
          masked so it fades into the card rather than hard-cutting across the
          stats. */}
      {skinSrc && (
        <Image
          src={skinSrc}
          alt=""
          aria-hidden
          width={364}
          height={323}
          className="pointer-events-none absolute top-1/2 -right-6 h-[150%] w-auto max-w-none -translate-y-1/2 object-contain opacity-[0.12] select-none"
          style={{
            maskImage: "linear-gradient(to left, black 35%, transparent 95%)",
            WebkitMaskImage:
              "linear-gradient(to left, black 35%, transparent 95%)",
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
          className="relative h-28 w-auto shrink-0 object-contain drop-shadow-md select-none sm:h-32"
        />
      )}

      {/* Right column — identity, rating, and best legends. */}
      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 font-display text-sm font-bold text-foreground">
            {entry.rank}
          </span>
          {/* The check mark alone, not the "PRO" tag. On a card this size the
              name is the subject and the tag was a second block of text
              competing with it — the mark says the same thing as a mark on the
              name, which is what verification is. */}
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="min-w-0 truncate text-base leading-tight font-semibold">
              {(entry.players.length === 1 && player && handle
                ? handle
                : username) || "—"}
            </span>
            {verified && <VerifiedMark className="size-4" />}
            {entry.players.some((p) => smurfs.has(p.id)) && (
              <SmurfMark className="size-4" />
            )}
            {player && (
              <FlairMark
                selectedId={flairs.get(player.id)}
                context={flairContextFrom(primaryPreview)}
                className="h-4"
              />
            )}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-bold text-foreground tabular-nums">
            {entry.rating != null ? formatElo(entry.rating) : "—"}
          </span>
          {entry.rating != null && (
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              ELO
            </span>
          )}
        </div>

        <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
          {tier && (
            <span className="inline-flex items-center gap-1.5">
              <span className={TIER_TEXT_COLOR[tier]}>{entry.tier}</span>
              <span className="text-muted-foreground/60">·</span>
            </span>
          )}
          {showRegion && entry.region && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className={
                  REGION_COLOR[entry.region]?.text ?? "text-muted-foreground"
                }
              >
                {entry.region}
              </span>
              <span className="text-muted-foreground/60">·</span>
            </span>
          )}
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

  // No group/pro on the card: podium pros always show their handle (the
  // hover-swap to the in-game name stays a table-only affordance).
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
  flairs = new Map(),
  smurfs = new Set(),
  showRegion = false,
}: {
  entries: RankedEntry[]
  playersMap: Map<number, PlayerRow>
  gameMode: ApiGameMode
  previews: Map<number, PlayerPreview>
  /** Chosen flair per player (getFlairMap); omit to render none. */
  flairs?: Map<number, string>
  /** Players whose record reads as a possible smurf (getSmurfIds). */
  smurfs?: Set<number>
  showRegion?: boolean
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
          flairs={flairs}
          smurfs={smurfs}
          showRegion={showRegion}
        />
      ))}
    </div>
  )
}
