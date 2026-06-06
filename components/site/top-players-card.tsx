import Link from "next/link"
import { BadgeCheck, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatElo } from "@/lib/format"
import { slugForLegendId } from "@/lib/legends-roster"
import { API_REGIONS } from "@/lib/brawlhalla-api"
import { getPlayersByIds } from "@/lib/sync/players"
import { getProLeaderboard } from "@/lib/sync/pro-leaderboard"
import { getProfilesMap } from "@/lib/sync/profiles"
import type { PlayerRow } from "@/lib/db/schema"
import type { Tier } from "@/lib/types"
import { PreviewCard } from "./preview-card"
import { LegendChip, PlayerLink, RankIcon, TIER_TEXT_COLOR } from "./primitives"

// All API regions (ALL first), shown in the home region dropdown.
export const HOME_REGIONS = API_REGIONS
export type HomeRegion = (typeof HOME_REGIONS)[number]

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
  return (KNOWN_TIERS as readonly string[]).includes(value)
    ? (value as Tier)
    : null
}

/**
 * TopPlayersCard — the home "Top Pros" preview: the six highest-rated
 * VERIFIED PROS (1v1, from the pro leaderboard), filterable by region.
 * Pros are always shown by their handle — no hover swap to the in-game name.
 */
export async function TopPlayersCard({
  region,
  className,
}: {
  region: HomeRegion
  className?: string
}) {
  const pros = await getProLeaderboard(region)
  const rows = pros.slice(0, 6)

  let playersMap = new Map<number, PlayerRow>()
  if (rows.length > 0) {
    const ids = rows.flatMap((r) => r.players.map((p) => p.id))
    try {
      // Only the main-legend chip is read here (topLegendId), so skip the
      // ranked_json blob.
      playersMap = await getPlayersByIds(ids, { includeRankedJson: false })
    } catch (err) {
      console.error("[top-players-card] DB lookup failed:", err)
    }
  }

  // Handles come from the admin-curated profiles (verified pros).
  const overrides = await getProfilesMap()

  return (
    <PreviewCard
      title="Top Pros"
      href="/leaderboards/1v1?region=ALL&pro=1"
      viewAllLabel="view pro leaderboard"
      className={className}
      meta={
        <div className="group/region relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-label={`Region: ${region}`}
            className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground transition-colors hover:bg-muted"
          >
            {region}
            <ChevronDown
              className="size-3 text-muted-foreground transition-transform duration-200 group-hover/region:-rotate-180 group-focus-within/region:-rotate-180"
              aria-hidden
            />
          </button>
          <div
            role="menu"
            className={cn(
              "invisible absolute right-0 top-full z-50 mt-1 max-h-64 w-28 translate-y-1 overflow-y-auto rounded-md border border-border/60 bg-card/95 p-1 opacity-0 shadow-xl backdrop-blur-md transition-all duration-200",
              "group-hover/region:visible group-hover/region:translate-y-0 group-hover/region:opacity-100",
              "group-focus-within/region:visible group-focus-within/region:translate-y-0 group-focus-within/region:opacity-100",
            )}
          >
            {HOME_REGIONS.map((r) => (
              <Link
                key={r}
                role="menuitem"
                href={`/?region=${r}#top-players`}
                scroll={false}
                aria-current={region === r ? "true" : undefined}
                className={cn(
                  "block rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  region === r
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {r}
              </Link>
            ))}
          </div>
        </div>
      }
    >
      <ol id="top-players" className="grid auto-rows-fr divide-y divide-border/60">
        {rows.length === 0 ? (
          <li className="flex items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
            No verified pros in {region} yet.
          </li>
        ) : (
          rows.map((entry) => {
            const tier = toTier(entry.tier)
            const player = entry.players[0]
            if (!player) return null
            const lid = playersMap.get(player.id)?.topLegendId
            const slug = lid ? slugForLegendId(lid) : null
            const handle = overrides.get(player.id)?.verified?.handle
            const wins = entry.wins
            const losses = entry.losses
            const total = (wins ?? 0) + (losses ?? 0)
            const wr =
              wins != null && losses != null && total > 0
                ? ((wins / total) * 100).toFixed(1)
                : null
            return (
              <li
                key={`${entry.rank}-${player.id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40"
              >
                <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {entry.rank}
                </span>
                {tier && <RankIcon tier={tier} size={30} className="shrink-0" />}
                {slug ? (
                  <LegendChip legendId={slug} size="md" showName={false} />
                ) : (
                  <span
                    className="size-7 shrink-0 rounded-md border border-border/60 bg-muted/30"
                    aria-hidden
                  />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <PlayerLink id={player.id} className="font-medium">
                    <span className="inline-flex min-w-0 items-center gap-1 text-sm leading-tight">
                      <span className="min-w-0 truncate">
                        {handle ?? player.username}
                      </span>
                      <BadgeCheck className="size-3.5 shrink-0 text-foreground" />
                    </span>
                  </PlayerLink>
                  {tier && (
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wider",
                        TIER_TEXT_COLOR[tier],
                      )}
                    >
                      {tier}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-sm tabular-nums">
                    {entry.rating != null ? formatElo(entry.rating) : "—"}
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      ELO
                    </span>
                  </span>
                  {wins != null && losses != null && (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {wr && <span className="text-tier-diamond">({wr}% WR)</span>}
                      <span className="ml-1">
                        {wins.toLocaleString()}
                        <span className="px-0.5">–</span>
                        {losses.toLocaleString()}
                      </span>
                    </span>
                  )}
                </span>
              </li>
            )
          })
        )}
      </ol>
    </PreviewCard>
  )
}
