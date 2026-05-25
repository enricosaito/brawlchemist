import Link from "next/link"
import { BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatElo } from "@/lib/format"
import { slugForLegendId } from "@/lib/legends-roster"
import {
  type ApiGameMode,
  getRankedLeaderboard,
} from "@/lib/brawlhalla-api"
import { getPlayersByIds } from "@/lib/sync/players"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import type { PlayerRow } from "@/lib/db/schema"
import type { Tier } from "@/lib/types"
import { PreviewCard } from "./preview-card"
import { LegendChip, PlayerLink, RankIcon, TIER_TEXT_COLOR } from "./primitives"

export const HOME_REGIONS = ["US-E", "EU", "BRZ"] as const
export type HomeRegion = (typeof HOME_REGIONS)[number]

const QUEUES: { id: ApiGameMode; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "2v2", label: "2v2" },
]

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

export async function TopPlayersCard({
  queue,
  region,
}: {
  queue: ApiGameMode
  region: HomeRegion
}) {
  const lb = await getRankedLeaderboard({
    gameMode: queue,
    region,
    maxResults: 6,
  })
  const rows = lb.ok ? lb.data.rankings : []

  let playersMap = new Map<number, PlayerRow>()
  if (rows.length > 0) {
    const ids = rows.flatMap((r) => r.players.map((p) => p.id))
    try {
      playersMap = await getPlayersByIds(ids)
    } catch (err) {
      console.error("[top-players-card] DB lookup failed:", err)
    }
  }

  // Admin-curated previews drive the verified-pro treatment (handle + check).
  const overrides = await getOverridesMap()

  return (
    <PreviewCard
      title="Live Ranked"
      href={`/leaderboards/${queue}?region=${region}`}
      viewAllLabel="view leaderboard"
      meta={
        <>
          <div
            role="tablist"
            aria-label="Queue"
            className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5"
          >
            {QUEUES.map((q) => (
              <Link
                key={q.id}
                role="tab"
                aria-selected={queue === q.id}
                href={`/?queue=${q.id}&region=${region}#top-players`}
                scroll={false}
                className={cn(
                  "rounded-[5px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  queue === q.id
                    ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {q.label}
              </Link>
            ))}
          </div>
          <div
            role="tablist"
            aria-label="Region"
            className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5"
          >
            {HOME_REGIONS.map((r) => (
              <Link
                key={r}
                role="tab"
                aria-selected={region === r}
                href={`/?queue=${queue}&region=${r}#top-players`}
                scroll={false}
                className={cn(
                  "rounded-[5px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  region === r
                    ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r}
              </Link>
            ))}
          </div>
        </>
      }
    >
      <ol id="top-players" className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-muted-foreground">
            No rankings for {queue} · {region}.
          </li>
        ) : (
          rows.map((entry) => {
            const tier = toTier(entry.tier)
            const firstId = entry.players[0]?.id
            const is1v1 = queue === "1v1"
            const chipSize = is1v1 ? "md" : "sm"
            const placeholderSize = is1v1 ? "size-7" : "size-5"
            return (
              <li
                key={`${entry.rank}-${firstId ?? "x"}`}
                className={cn(
                  "flex min-h-16 items-center transition-colors hover:bg-muted/40",
                  is1v1 ? "gap-3 px-4 py-2.5" : "gap-2 px-3 py-2",
                )}
              >
                <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {entry.rank}
                </span>
                {tier && (
                  <RankIcon
                    tier={tier}
                    size={is1v1 ? 30 : 24}
                    className="shrink-0"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {entry.players.map((p) => {
                    const lid = playersMap.get(p.id)?.topLegendId
                    const slug = lid ? slugForLegendId(lid) : null
                    const handle = overrides.get(p.id)?.verified?.handle
                    return (
                      <span
                        key={p.id}
                        className={cn(
                          "flex items-center text-sm leading-tight",
                          is1v1 ? "gap-3" : "gap-2",
                        )}
                      >
                        {slug ? (
                          <LegendChip
                            legendId={slug}
                            size={chipSize}
                            showName={false}
                          />
                        ) : (
                          <span
                            className={cn(
                              placeholderSize,
                              "shrink-0 rounded-md border border-border/60 bg-muted/30",
                            )}
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            "flex min-w-0 flex-col gap-0.5",
                            handle && "group/pro",
                          )}
                        >
                          <PlayerLink id={p.id} className="font-medium">
                            {handle ? (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <span className="min-w-0 truncate">
                                  <span className="group-hover/pro:hidden">
                                    {handle}
                                  </span>
                                  <span className="hidden group-hover/pro:inline">
                                    {p.username}
                                  </span>
                                </span>
                                <BadgeCheck className="size-3.5 shrink-0 text-foreground group-hover/pro:hidden" />
                              </span>
                            ) : (
                              <span className="truncate">{p.username}</span>
                            )}
                          </PlayerLink>
                          {is1v1 &&
                            (handle ? (
                              <>
                                <span className="font-mono text-[10px] uppercase tracking-wider text-mystic group-hover/pro:hidden">
                                  Pro Player
                                </span>
                                {tier && (
                                  <span
                                    className={cn(
                                      "hidden font-mono text-[10px] uppercase tracking-wider group-hover/pro:block",
                                      TIER_TEXT_COLOR[tier],
                                    )}
                                  >
                                    {tier}
                                  </span>
                                )}
                              </>
                            ) : (
                              tier && (
                                <span
                                  className={cn(
                                    "font-mono text-[10px] uppercase tracking-wider",
                                    TIER_TEXT_COLOR[tier],
                                  )}
                                >
                                  {tier}
                                </span>
                              )
                            ))}
                        </span>
                      </span>
                    )
                  })}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-sm tabular-nums">
                    {entry.rating != null ? formatElo(entry.rating) : "—"}
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      ELO
                    </span>
                  </span>
                  {is1v1
                    ? entry.wins != null && entry.losses != null
                      ? (() => {
                          const total = entry.wins + entry.losses
                          const wr = total > 0
                            ? ((entry.wins / total) * 100).toFixed(1)
                            : null
                          return (
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                              {wr && (
                                <span className="text-tier-diamond">
                                  ({wr}% WR)
                                </span>
                              )}
                              <span className="ml-1">
                                {entry.wins.toLocaleString()}
                                <span className="px-0.5">–</span>
                                {entry.losses.toLocaleString()}
                              </span>
                            </span>
                          )
                        })()
                      : null
                    : tier && (
                        <span
                          className={cn(
                            "font-mono text-[9px] uppercase tracking-wider",
                            TIER_TEXT_COLOR[tier],
                          )}
                        >
                          {tier}
                        </span>
                      )}
                </div>
              </li>
            )
          })
        )}
      </ol>
    </PreviewCard>
  )
}
