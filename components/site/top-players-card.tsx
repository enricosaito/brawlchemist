import Link from "next/link"
import { BadgeCheck, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatElo } from "@/lib/format"
import { slugForLegendId } from "@/lib/legends-roster"
import { getProLeaderboard } from "@/lib/sync/pro-leaderboard"
import { getPlayersByIds } from "@/lib/sync/players"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import type { PlayerRow } from "@/lib/db/schema"
import type { Tier } from "@/lib/types"
import { PreviewCard } from "./preview-card"
import { LegendChip, PlayerLink, RankIcon, TIER_TEXT_COLOR } from "./primitives"

export const HOME_REGIONS = ["ALL", "US-E", "EU", "BRZ"] as const
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
 * TopPlayersCard — the home "Live Rankings" tile. Shows the top verified pros
 * (1v1) for the selected region, not the raw ladder. Region filter only; pros
 * are ranked by 1v1, so there's no queue toggle.
 */
export async function TopPlayersCard({ region }: { region: HomeRegion }) {
  const rows = await getProLeaderboard(region, 6)

  let playersMap = new Map<number, PlayerRow>()
  if (rows.length > 0) {
    const ids = rows.flatMap((r) => r.players.map((p) => p.id))
    try {
      playersMap = await getPlayersByIds(ids)
    } catch (err) {
      console.error("[top-players-card] DB lookup failed:", err)
    }
  }

  // Verified-pro handles / badges.
  const overrides = await getOverridesMap()

  return (
    <PreviewCard
      title="Live Rankings"
      href={`/leaderboards/1v1?region=${region}`}
      viewAllLabel="view leaderboard"
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
              "invisible absolute right-0 top-full z-50 mt-1 w-28 translate-y-1 rounded-md border border-border/60 bg-card/95 p-1 opacity-0 shadow-xl backdrop-blur-md transition-all duration-200",
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
      <ol id="top-players" className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-muted-foreground">
            No verified pros{region === "ALL" ? "" : ` in ${region}`} yet.
          </li>
        ) : (
          rows.map((entry) => {
            const tier = toTier(entry.tier)
            const p = entry.players[0]
            const lid = p ? playersMap.get(p.id)?.topLegendId : null
            const slug = lid ? slugForLegendId(lid) : null
            const handle = p ? overrides.get(p.id)?.verified?.handle : undefined
            const total =
              entry.wins != null && entry.losses != null
                ? entry.wins + entry.losses
                : 0
            const wr =
              total > 0 && entry.wins != null
                ? ((entry.wins / total) * 100).toFixed(1)
                : null
            return (
              <li
                key={`${entry.rank}-${p?.id ?? "x"}`}
                className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {entry.rank}
                </span>
                {tier && <RankIcon tier={tier} size={30} className="shrink-0" />}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {slug ? (
                    <LegendChip legendId={slug} size="md" showName={false} />
                  ) : (
                    <span
                      className="size-7 shrink-0 rounded-md border border-border/60 bg-muted/30"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      "flex min-w-0 flex-col gap-0.5",
                      handle && "group/pro",
                    )}
                  >
                    <PlayerLink id={p?.id} className="font-medium">
                      {handle ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate">
                            <span className="group-hover/pro:hidden">
                              {handle}
                            </span>
                            <span className="hidden group-hover/pro:inline">
                              {p?.username}
                            </span>
                          </span>
                          <BadgeCheck className="size-3.5 shrink-0 text-foreground group-hover/pro:hidden" />
                        </span>
                      ) : (
                        <span className="truncate">{p?.username}</span>
                      )}
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
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-sm tabular-nums">
                    {entry.rating != null ? formatElo(entry.rating) : "—"}
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      ELO
                    </span>
                  </span>
                  {wr && (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      <span className="text-tier-diamond">({wr}% WR)</span>
                      <span className="ml-1">
                        {entry.wins?.toLocaleString()}
                        <span className="px-0.5">–</span>
                        {entry.losses?.toLocaleString()}
                      </span>
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
