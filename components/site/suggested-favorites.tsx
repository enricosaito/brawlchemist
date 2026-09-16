import Link from "next/link"
import { Sparkles } from "lucide-react"
import { formatElo } from "@/lib/format"
import { slugForLegendId } from "@/lib/legends-roster"
import { flairContextFrom } from "@/lib/profile/flair"
import { getFlairMap } from "@/lib/sync/customizations"
import { getPlayersByIds } from "@/lib/sync/players"
import { getProfilesMap } from "@/lib/sync/profiles"
import { getSuggestedFavorites } from "@/lib/sync/suggestions"
import { getValhallanIds } from "@/lib/sync/valhallan-cutoff"
import { tierFromRating } from "@/lib/tier"
import { cn } from "@/lib/utils"
import { FavoriteToggleControl } from "./favorite-toggle-control"
import { FlairMark } from "./flair-mark"
import { LegendChip, RankHelm, RegionPill } from "./primitives"
import { VerifiedMark } from "./pro-badge"

/**
 * Suggested Favorites — the bottom of /favorites, for people who have run out
 * of people to add.
 *
 * Three groups of three rather than one ranked list of nine, because the three
 * answers are not comparable and a blended score would hide which one applied.
 * The reason line is the feature: a suggestion you can't explain is a list of
 * strangers, and "people you actually queue with" is a different pitch from
 * "top rated players with the same main".
 *
 * Renders nothing when there is nothing to suggest — an empty headed section
 * reads as breakage. Fails open to nothing too (cardinal constraint #5): the
 * favorites list above is the page, and this is the extra.
 */
export async function SuggestedFavorites({
  selfId,
  exclude,
}: {
  /** The viewer's own claimed player — every suggestion is derived from it. */
  selfId: number
  /** Already on their list, so nothing is suggested twice. */
  exclude: number[]
}) {
  let groups: Awaited<ReturnType<typeof getSuggestedFavorites>> = []
  try {
    groups = await getSuggestedFavorites(selfId, exclude)
  } catch (err) {
    console.error("[suggested-favorites] failed:", err)
    return null
  }
  if (groups.length === 0) return null

  const ids = [...new Set(groups.flatMap((g) => g.ids))]

  // The same three enrichment reads the list above makes, all cached app-wide
  // and shared with /live and the leaderboards — so asking again costs nothing
  // and keeps this component self-contained.
  const [playersMap, profiles, valhallan, flairs] = await Promise.all([
    getPlayersByIds(ids, { includeRankedJson: false, withRegion: true }),
    getProfilesMap(),
    getValhallanIds("1v1")
      .then((v) => new Set(v))
      .catch(() => new Set<number>()),
    getFlairMap().catch(() => new Map<number, string>()),
  ])

  return (
    <section className="mt-10 border-t border-border/60 pt-8">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-mystic" />
        <h2 className="font-display text-lg font-semibold">
          Suggested favorites
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Worked out from your own profile — your region, your main, and who you
        queue with.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h3>
              <span className="text-[11px] text-muted-foreground/70">
                {group.reason}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {group.ids.map((id) => {
                const player = playersMap.get(id) ?? null
                const preview = profiles.get(id)
                const slug = player?.topLegendId
                  ? slugForLegendId(player.topLegendId)
                  : null
                const rating = player?.ladderRating ?? null
                const tier = tierFromRating(rating, valhallan.has(id))
                const handle = preview?.verified?.handle || null
                return (
                  <li key={id} className="flex items-stretch gap-2">
                    <Link
                      href={`/player/${id}`}
                      prefetch={false}
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                        "border-border/60 bg-card/30 hover:border-tier-gold/40 hover:bg-card/60",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {slug ? (
                          <LegendChip
                            legendId={slug}
                            size="lg"
                            showName={false}
                          />
                        ) : (
                          <span className="size-9 shrink-0 rounded-md border border-border/60 bg-muted/30" />
                        )}
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate font-medium">
                            {handle ?? player?.username ?? `Player #${id}`}
                          </span>
                          {handle && <VerifiedMark />}
                          <FlairMark
                            selectedId={flairs.get(id)}
                            context={flairContextFrom(preview)}
                          />
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {player?.ladderRegion && (
                          <RegionPill region={player.ladderRegion} />
                        )}
                        {rating != null && (
                          <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums">
                            {/* Same rule as the list above: Valhallan is ladder
                                membership, so the tier is derived rather than
                                read off the rating, and an underived tier draws
                                no helm rather than a wrong one. */}
                            {tier && <RankHelm tier={tier} className="h-[18px]" />}
                            <span>
                              {formatElo(rating)}
                              <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                                ELO
                              </span>
                            </span>
                          </span>
                        )}
                      </div>
                    </Link>
                    {/* The whole point of the section: one click to add. */}
                    <div className="flex items-center">
                      <FavoriteToggleControl brawlhallaId={id} size="sm" />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
