import Link from "next/link"
import { redirect } from "next/navigation"
import { LegendChip, RegionPill } from "@/components/site/primitives"
import { PageHero } from "@/components/site/page-hero"
import { PlayerSearchForm } from "@/components/site/player-search-form"
import { ProBadge } from "@/components/site/pro-badge"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { searchPlayerBySteamId, type PlayerRanked } from "@/lib/brawlhalla-api"
import { getPlayersByIds, searchPlayersByUsername } from "@/lib/sync/players"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import type { PlayerRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"
import { formatElo } from "@/lib/format"
import { slugForLegendId } from "@/lib/legends-roster"

/**
 * Pull a steamID64 out of either a bare 17-digit ID or a pasted Steam profile
 * URL (steamcommunity.com/profiles/76561198025185087). Individual accounts
 * start with "7656119" and are 17 digits. Returns null otherwise.
 */
function asSteamId64(raw: string): string | null {
  const direct = raw.match(/(7656119\d{10})/)
  if (direct) return direct[1]
  const digits = raw.replace(/\D/g, "")
  return /^\d{17}$/.test(digits) ? digits : null
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border/60 bg-card/40 p-5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

function PlayerResultRow({
  player,
  preview,
}: {
  player: PlayerRow
  preview?: PlayerPreview
}) {
  const ranked = (player.rankedJson ?? null) as PlayerRanked | null
  const slug = player.topLegendId ? slugForLegendId(player.topLegendId) : null
  const rating = ranked?.rating
  const region = ranked?.region
  // Verified pros lead with their pro handle + badge regardless of whether the
  // search matched their handle or their in-game name; the IGN moves to the
  // meta line so the match stays recognizable.
  const handle = preview?.verified?.handle || null
  return (
    <Link
      href={`/player/${player.brawlhallaId}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-tier-valhallan/50 hover:bg-card/70"
    >
      <div className="flex min-w-0 items-center gap-3">
        {slug ? (
          <LegendChip legendId={slug} size="lg" showName={false} />
        ) : (
          <span className="size-9 shrink-0 rounded-md border border-border/60 bg-muted/30" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate font-medium">
              {handle ?? player.username}
            </span>
            {handle && <ProBadge className="shrink-0" />}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            ID {player.brawlhallaId}
            {region ? ` · ${region}` : ""}
            {handle && handle !== player.username && (
              <span className="normal-case"> · IGN {player.username}</span>
            )}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {region && <RegionPill region={region} />}
        {rating != null && (
          <span className="font-mono text-sm tabular-nums">
            {formatElo(rating)}
            <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              ELO
            </span>
          </span>
        )}
      </div>
    </Link>
  )
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const raw = params.q?.trim() ?? ""

  if (raw) {
    const steamId = asSteamId64(raw)
    if (steamId) {
      // Steam ID → resolve to a Brawlhalla account, then jump to the profile.
      const lookup = await searchPlayerBySteamId(steamId)
      if (lookup.ok && lookup.data.brawlhalla_id) {
        redirect(`/player/${lookup.data.brawlhalla_id}`)
      }
    } else if (/^\d+$/.test(raw)) {
      // Pure digits (and not a steamID64) → treat as a Brawlhalla ID directly.
      redirect(`/player/${raw}`)
    }
  }

  // Anything else is a name search against our local pool — plus verified pro
  // handles, so a pro's in-game name and their pro handle both find them.
  const isUsername = raw !== "" && !asSteamId64(raw) && !/^\d+$/.test(raw)
  let results: PlayerRow[] = []
  let overrides: Map<number, PlayerPreview> | null = null
  let searchFailed = false
  if (isUsername) {
    try {
      overrides = await getOverridesMap()
      const byName = await searchPlayersByUsername(raw)
      const byId = new Map(byName.map((p) => [p.brawlhallaId, p]))

      // Match verified pro handles too, then pull in any pros the in-game-name
      // search didn't already surface.
      const q = raw.toLowerCase()
      const handleIds = [...overrides.entries()]
        .filter(([, pv]) => pv.verified?.handle?.toLowerCase().includes(q))
        .map(([id]) => id)
        .filter((id) => !byId.has(id))
      if (handleIds.length > 0) {
        for (const [id, row] of await getPlayersByIds(handleIds)) {
          byId.set(id, row)
        }
      }

      const ratingOf = (p: PlayerRow) =>
        (p.rankedJson as PlayerRanked | null)?.rating ?? -1
      results = [...byId.values()].sort((a, b) => ratingOf(b) - ratingOf(a))
    } catch (err) {
      console.error("[search] name/handle lookup failed:", err)
      searchFailed = true
    }
  }

  // A leftover steamID64 that didn't resolve (the only way to reach here with
  // a non-username query) means no linked Brawlhalla account.
  const steamMiss = raw !== "" && !!asSteamId64(raw)

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Player Search"
          subtitle="Search by in-game name, Brawlhalla ID, or Steam ID (steamID64 or a steamcommunity.com profile link)."
        />

        <div className="px-4 sm:px-6">
          <div className="mx-auto mb-6 flex max-w-xl justify-center">
            <PlayerSearchForm defaultValue={raw} autoFocus={!raw} />
          </div>

          {!raw && (
            <ResultCard title="Get started">
              Enter a player name, a Brawlhalla ID, or a Steam ID above. Name
              search covers players already in our database — anyone who appears
              on the leaderboards or has been looked up before.
            </ResultCard>
          )}

          {steamMiss && (
            <ResultCard title="No player found">
              No Brawlhalla account is linked to that Steam ID. Double-check it,
              or the player may not have logged into Brawlhalla.
            </ResultCard>
          )}

          {isUsername && searchFailed && (
            <ResultCard title="Search unavailable">
              Couldn&apos;t reach the player database. Please try again shortly.
            </ResultCard>
          )}

          {isUsername && !searchFailed && results.length === 0 && (
            <ResultCard title="No players found">
              No one matching{" "}
              <span className="font-medium text-foreground">
                &ldquo;{raw}&rdquo;
              </span>{" "}
              is in our database yet. We only know players who&apos;ve appeared
              on the leaderboards or been looked up before — try their exact name,
              a Brawlhalla ID, or a Steam ID.
            </ResultCard>
          )}

          {isUsername && results.length > 0 && (
            <div className="mx-auto max-w-xl">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {results.length} match{results.length === 1 ? "" : "es"}
              </div>
              <ul className="flex flex-col gap-2">
                {results.map((p) => (
                  <li key={p.brawlhallaId}>
                    <PlayerResultRow
                      player={p}
                      preview={overrides?.get(p.brawlhallaId)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mx-auto mt-6 max-w-xl text-center">
            <Link
              href="/leaderboards/1v1"
              className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Browse the leaderboards
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
