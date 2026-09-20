import Link from "next/link"
import { redirect } from "next/navigation"
import { Star } from "lucide-react"
import { getSessionUser } from "@/lib/auth/session"
import { slugForLegendId } from "@/lib/legends-roster"
import { formatElo } from "@/lib/format"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import { getFavoriteIds } from "@/lib/sync/favorites"
import { getPlayersByIds } from "@/lib/sync/players"
import { getProfilesMap } from "@/lib/sync/profiles"
import { getFlairMap } from "@/lib/sync/customizations"
import { getSmurfIds } from "@/lib/sync/smurf"
import { getValhallanIds } from "@/lib/sync/valhallan-cutoff"
import { tierFromRating } from "@/lib/tier"
import type { Tier } from "@/lib/types"
import type { PlayerRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"
import { LegendChip, RankHelm, RegionPill } from "@/components/site/primitives"
import { VerifiedMark } from "@/components/site/verified-mark"
import { SmurfMark } from "@/components/site/smurf-mark"
import { FlairMark } from "@/components/site/flair-mark"
import { FavoriteToggleControl } from "@/components/site/favorite-toggle-control"
import { SuggestedFavorites } from "@/components/site/suggested-favorites"
import { flairContextFrom } from "@/lib/profile/flair"
import { previewKind } from "@/lib/player-previews"

export const metadata = { title: "Brawlchemist | Favorites" }

export default async function FavoritesPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/favorites")

  const [claimedId, favoriteIds] = await Promise.all([
    getClaimedBrawlhallaId(user.id),
    getFavoriteIds(user.id),
  ])

  // The viewer's own claimed profile is always pinned first (deduped from the
  // favorites below it). The rest follow in most-recently-favorited order.
  const ids =
    claimedId != null
      ? [claimedId, ...favoriteIds.filter((id) => id !== claimedId)]
      : favoriteIds

  // Tier + flair alongside the rows. Both cached app-wide and shared with
  // /live and the leaderboards, and both fail open — a favorites list that
  // loads without a helm beats one that doesn't load.
  const [playersMap, profiles, valhallan, flairs, smurfs] = await Promise.all([
    // withRegion because region lives in ranked_json, not in a column — the
    // region pill on this page silently never rendered until it was opted in.
    ids.length
      ? getPlayersByIds(ids, { includeRankedJson: false, withRegion: true })
      : Promise.resolve(new Map<number, PlayerRow>()),
    getProfilesMap(),
    getValhallanIds("1v1")
      .then((v) => new Set(v))
      .catch((err) => {
        console.error("[favorites] valhallan ids failed:", err)
        return new Set<number>()
      }),
    getFlairMap().catch((err) => {
      console.error("[favorites] flair map failed:", err)
      return new Map<number, string>()
    }),
    getSmurfIds().catch((err) => {
      console.error("[favorites] smurf ids failed:", err)
      return new Set<number>()
    }),
  ])

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <div className="flex items-center gap-2.5">
        <Star className="size-5 text-tier-gold" />
        <h1 className="font-display text-2xl font-semibold">Favorites</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Players you track. Star anyone from their profile to add them here.
      </p>

      {ids.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center">
          <Star className="mx-auto size-7 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No favorites yet. Open a player&apos;s profile and hit{" "}
            <span className="font-medium text-foreground">Track</span> to start
            following them.
          </p>
          <Link
            href="/leaderboards/1v1"
            className="mt-4 inline-block rounded-md bg-pink px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-pink/90"
          >
            Browse the leaderboard
          </Link>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {ids.map((id) => (
            <FavoriteRow
              key={id}
              id={id}
              self={id === claimedId}
              player={playersMap.get(id) ?? null}
              preview={profiles.get(id)}
              tier={tierFromRating(
                playersMap.get(id)?.rating,
                valhallan.has(id),
              )}
              flairId={flairs.get(id)}
              smurf={smurfs.has(id)}
            />
          ))}
        </ul>
      )}

      {/* Suggestions are derived entirely from the viewer's own profile, so an
          unclaimed account has nothing to derive from and gets nothing rather
          than a generic "popular players" list — which would be the same nine
          strangers for everyone, and the opposite of a suggestion. */}
      {claimedId != null && (
        <SuggestedFavorites selfId={claimedId} exclude={ids} />
      )}
    </div>
  )
}

function FavoriteRow({
  id,
  self,
  player,
  preview,
  tier,
  flairId,
  smurf,
}: {
  id: number
  self: boolean
  player: PlayerRow | null
  preview?: PlayerPreview
  /** Derived by the page — Valhallan is ladder membership, not a rating band. */
  tier: Tier | null
  flairId?: string
  smurf?: boolean
}) {
  const slug = player?.topLegendId ? slugForLegendId(player.topLegendId) : null
  const rating = player?.rating ?? null
  const region = player?.region ?? null
  const handle = preview?.verified?.handle || null
  const username = player?.username ?? `Player #${id}`

  return (
    <li className="flex items-stretch gap-2">
      <Link
        href={`/player/${id}`}
        prefetch={false}
        className={cnRow(self)}
      >
        <div className="flex min-w-0 items-center gap-3">
          {slug ? (
            <LegendChip legendId={slug} size="lg" showName={false} />
          ) : (
            <span className="size-9 shrink-0 rounded-md border border-border/60 bg-muted/30" />
          )}
          <div className="flex min-w-0 flex-col">
            {/* Single line: the id was noise and the region was already in the
                pill opposite, so the meta line under the name had nothing left
                that wasn't said better elsewhere. */}
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate font-medium">
                {handle ?? username}
              </span>
              <VerifiedMark tier={previewKind(preview)} />
              <FlairMark
                selectedId={flairId}
                context={flairContextFrom(preview)}
              />
              {smurf && <SmurfMark />}
              {self && (
                <span className="shrink-0 rounded-md border border-tier-gold/40 bg-tier-gold/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-tier-gold">
                  You
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {region && <RegionPill region={region} />}
          {rating != null && (
            <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-foreground">
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
      {/* Own profile is permanently pinned — no untrack control. */}
      {!self && (
        <div className="flex items-center">
          <FavoriteToggleControl brawlhallaId={id} size="sm" />
        </div>
      )}
    </li>
  )
}

function cnRow(self: boolean): string {
  return [
    "flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors",
    self
      ? "border-tier-gold/40 bg-tier-gold/5 hover:bg-tier-gold/10"
      : "border-border/60 bg-card/40 hover:border-tier-gold/40 hover:bg-card/70",
  ].join(" ")
}
