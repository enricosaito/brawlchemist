import { cache } from "react"
import { after } from "next/server"
import { headers } from "next/headers"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ChevronRight, Users } from "lucide-react"
import {
  LegendChip,
  RankHelm,
  RegionPill,
  RegionRankTag,
  TIER_TEXT_COLOR,
  WeaponIcon,
} from "@/components/site/primitives"
import { ClaimBanner } from "@/components/site/claim-banner"
import { ProfileCustomizerSlot } from "@/components/site/profile-customizer-slot"
import { TrackPlayerCard } from "@/components/site/track-player-card"
import { VerifiedMark } from "@/components/site/pro-badge"
import { FlairMark } from "@/components/site/flair-mark"
import { RecentVisitRecorder } from "@/components/site/recent-visit-recorder"
import { resolveBanner } from "@/lib/profile/banners"
import { getCustomization, getFlairMap } from "@/lib/sync/customizations"
import { getLadderPosition } from "@/lib/sync/live"
import { ProfileCustomization } from "@/components/site/profile-customization"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { BrawlchemistUserBadge } from "@/components/site/brawlchemist-user-badge"
import { InfoTip } from "@/components/site/info-tip"
import { RankedStatsCard } from "@/components/player/ranked-stats-card"
import type { PlayerPreview } from "@/lib/player-previews"
import { getProfile, getProfilesMap } from "@/lib/sync/profiles"
import {
  getPlayerGuild,
  getPlayerRanked,
  getPlayerStats,
  getStaticLegends,
  isApiRegion,
  type ApiGameMode,
  type ApiRegion,
  type PlayerRanked,
  type PlayerRanked2v2,
  type PlayerRankedLegend,
  type PlayerStats,
  type PlayerStatsLegend,
} from "@/lib/brawlhalla-api"
import {
  getEsportsProfile,
  type EsportsProfile,
} from "@/lib/brawltools-api"
import {
  getPlayerRankedJson,
  getPlayersByIds,
  getPlayerSyncState,
  recordUnrankedPlayer,
  upsertPlayerRanked,
} from "@/lib/sync/players"
import { clientLabel, isCrawler } from "@/lib/bots"
import { recordPlayerGuild } from "@/lib/sync/guilds"
import { recordFetch } from "@/lib/sync/fetch-log"
import {
  getValhallanCutoff,
  getValhallanIds,
} from "@/lib/sync/valhallan-cutoff"
import type { PlayerRow } from "@/lib/db/schema"
import { deriveTier, isValhallan, tierLabel } from "@/lib/tier"
import {
  resolveFlair,
  type FlairContext,
  type FlairDef,
} from "@/lib/profile/flair"
import type { Tier } from "@/lib/types"
import { formatElo, formatPercent } from "@/lib/format"
import {
  rosterEntryByLegendId,
  rosterEntryBySlug,
  slugForLegendId,
} from "@/lib/legends-roster"
import type { WeaponId } from "@/lib/types"
import { cn } from "@/lib/utils"

// Read-through cache for the profile's /ranked payload.
//
// 1. Probe `last_synced` WITHOUT the payload. `ranked_json` averages ~6.3 KB
//    on the wire, and fetching it only to discover it's stale was the second
//    largest source of Supabase egress across 1.2M profile views.
// 2. Serve the cached payload when it's fresher than PROFILE_FRESH_MS — zero
//    API calls. Crawlers get the cached payload at ANY age (see below).
// 3. Otherwise hit the API (still gated by the 300s fetch cache so concurrent
//    hits collapse), and upsert the result back into the pool.
// 4. If the API errors (most often 429), fall back to the cached row even if
//    stale, so the page still renders.
//
// On crawlers: a traffic sample showed 53% of profile views coming from bots,
// and almost all of them resolved as "synced" rather than "cached" — each one
// missing the freshness window, spending one of the 180/15min API calls and
// writing the result back. Bingbot alone was 42%. They now render from stored
// data at any age: the page is just as indexable, and the API budget goes to
// people. A crawler hitting a player we have NO payload for still gets one
// live fetch, since that's a genuinely new player and the alternative is
// indexing an error page.
//
// Memoized per-request via React's cache() so generateMetadata and the page
// share one resolution, and the upsert at the bottom of the page only fires
// when we actually fetched live (source === "api").
const PROFILE_REVALIDATE = 300
/**
 * How stale a stored /ranked payload may be before we re-fetch.
 *
 * A flat 15 minutes was the single largest consumer of the Brawlhalla budget
 * and bought almost nothing: measured over 11.3h of real traffic, only 164 of
 * 4,835 human profile views hit that window. People look up *different*
 * players, so a short window never gets a second bite — it just guaranteed an
 * API call per view. With each view costing up to three calls, profiles alone
 * ran ~16k/day against a 17,280/day ceiling, and 45% of human views were coming
 * back as failures (the 429 fallback).
 *
 * So the window is now tied to whether the rating is actually moving. Someone
 * mid-session climbs in minutes and deserves a short window; someone who hasn't
 * queued in days has identical data whether we ask now or in six hours.
 */
/*
 * Raised from 15 minutes after measuring where the budget actually goes.
 *
 * "Active" means the live ladder saw this player within LIVE_SESSION_MS, which
 * is true of every top-500 regular all day long — so the short window applied
 * permanently to exactly the most-viewed profiles on the site, not to a burst
 * around a session. Measured over 24h: 1,119 of 4,283 upstream calls (26%) went
 * to ladder players, and the worst single case was re-fetched 126 times in a
 * day, one every eleven minutes.
 *
 * Aligned with LIVE_SESSION_MS on purpose: asking upstream more often than the
 * signal that classified the player as active is asking faster than we can
 * learn anything. And the number these players are watched for is not stale
 * meanwhile — /live reads live_ranked, which the 5-minute cron refreshes at
 * zero API cost.
 */
const PROFILE_FRESH_ACTIVE_MS = 45 * 60 * 1000
const PROFILE_FRESH_IDLE_MS = 6 * 60 * 60 * 1000
/**
 * How long we trust "this player has no ranked record".
 *
 * Six hours, matching the idle window, and for the same reason: the answer
 * only changes when they play, and someone with no ranked season at all is
 * not mid-climb. The floor on being wrong is one stale render of a state the
 * page already shows for every unranked player.
 */
const UNRANKED_FRESH_MS = 6 * 60 * 60 * 1000
/** Treat a player as mid-session if the live ladder saw them this recently. */
const LIVE_SESSION_MS = 45 * 60 * 1000
/** Re-ask GetPlayerGuild only this often; the stored guild serves every other view. */
const GUILD_FRESH_MS = 7 * 24 * 60 * 60 * 1000
type LoadedRanked = {
  data: PlayerRanked | null
  source: "db-fresh" | "db-crawler" | "api" | "db-fallback" | "db-unranked"
  apiStatus?: number
  apiError?: string
}
const loadSyncState = cache((id: number) =>
  getPlayerSyncState(id).catch(() => null),
)

/**
 * Whether the stored guild is recent enough to serve without asking upstream.
 * Lives in a cache()d function rather than the render body so the `Date.now()`
 * read stays out of render — the same reason loadRanked does its own clock
 * comparisons inside the memo.
 */
const loadGuildFresh = cache(async (id: number): Promise<boolean> => {
  const state = await loadSyncState(id)
  return (
    !!state?.guildCheckedAt &&
    Date.now() - state.guildCheckedAt.getTime() < GUILD_FRESH_MS
  )
})

const loadRanked = cache(async (numId: number): Promise<LoadedRanked> => {
  const [state, headerList] = await Promise.all([
    loadSyncState(numId),
    headers(),
  ])
  const crawler = isCrawler(headerList.get("user-agent"))
  const playing =
    !!state?.liveActiveAt &&
    Date.now() - state.liveActiveAt.getTime() < LIVE_SESSION_MS
  const freshMs = playing ? PROFILE_FRESH_ACTIVE_MS : PROFILE_FRESH_IDLE_MS
  const fresh =
    !!state?.hasRankedJson &&
    Date.now() - state.lastSynced.getTime() < freshMs
  // A crawler is happy with whatever we already hold.
  const serveFromCache = !!state?.hasRankedJson && (fresh || crawler)
  // We asked about this player recently and the API had no ranked record for
  // them (see recordUnrankedPlayer). A row with no payload and a recent
  // last_synced means exactly that, and the answer cannot change until they
  // play a ranked match — so re-asking every view buys nothing.
  const unrankedFresh =
    !!state &&
    !state.hasRankedJson &&
    Date.now() - state.lastSynced.getTime() < UNRANKED_FRESH_MS

  let result: LoadedRanked
  if (serveFromCache) {
    const data = await getPlayerRankedJson(numId)
    result = data
      ? { data, source: fresh ? "db-fresh" : "db-crawler" }
      : { data: null, source: "api", apiError: "cached payload disappeared" }
  } else if (unrankedFresh) {
    // Renders exactly as it would have with the live empty payload: the page
    // keys its "no ranked season" state off a missing name, which this has.
    result = { data: null, source: "db-unranked" }
  } else {
    const res = await getPlayerRanked(numId, { revalidate: PROFILE_REVALIDATE })
    if (res.ok) {
      result = { data: res.data, source: "api" }
    } else if (state?.hasRankedJson) {
      console.warn(
        `[player ${numId}] live /ranked failed (${res.status}: ${res.error}) — served cached ranked_json fallback`,
      )
      result = {
        data: await getPlayerRankedJson(numId),
        source: "db-fallback",
        apiStatus: res.status,
        apiError: res.error,
      }
    } else {
      result = {
        data: null,
        source: "api",
        apiStatus: res.status,
        apiError: res.error,
      }
    }
  }

  // Record this view so /admin can see who's hitting which profiles and why.
  // We're inside React's cache() so this fires exactly once per request even
  // though generateMetadata and the page body both call loadRanked.
  //
  // Deferred with after(): it's pure telemetry, so making the reader wait on a
  // Supabase round-trip before the profile can stream is backwards. after()
  // runs it once the response is done, still inside the request context.
  const logResult =
    result.source === "db-fresh" ||
    result.source === "db-crawler" ||
    result.source === "db-unranked"
      ? "cached"
      : result.source === "api" && result.data
        ? "synced"
        : "failed"
  // Client info is captured HERE, during render — recordFetch must never reach
  // for request state itself, because after() runs once the request scope is
  // gone (which silently killed this logging once already).
  const client = clientLabel(headerList.get("user-agent"))
  const referer = headerList.get("referer")?.slice(0, 200) ?? null
  after(() =>
    recordFetch({
      brawlhallaId: numId,
      source: "page-view",
      result: logResult,
      apiStatus: result.apiStatus,
      client,
      referer,
    }),
  )

  return result
})
/**
 * Stand-in for an upstream call we deliberately didn't make. Shaped like a
 * failed ApiResult so every existing `.ok` check degrades the same way it
 * already does for a real upstream failure.
 */
const API_SKIPPED = {
  ok: false as const,
  status: 0,
  error: "skipped: crawler served from cache",
}

const loadStats = cache((id: number) => getPlayerStats(id))
const loadGuild = cache((id: number) =>
  getPlayerGuild(id, { revalidate: PROFILE_REVALIDATE }),
)
const loadStaticLegends = cache(() => getStaticLegends())
const loadEsports = cache((id: number) => getEsportsProfile(id))
const loadCutoff = cache((mode: ApiGameMode, region: ApiRegion) =>
  getValhallanCutoff(mode, region),
)
const loadValhallanIds = cache((mode: ApiGameMode) => getValhallanIds(mode))

const MAX_LEGEND_LEVEL = 100

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Lowest Valhallan rating in the player's region for a queue, used to tell
 * Valhallan apart from Diamond (both 2000+). Null for regions we don't track
 * (e.g. an unexpected string, or the synthetic "ALL").
 */
async function valhallanCutoffRating(
  mode: ApiGameMode,
  region: string | null | undefined,
): Promise<number | null> {
  return (await valhallanCutoffFor(mode, region))?.rating ?? null
}

/** The whole cutoff record, including the ids the ladder calls Valhallan. */
async function valhallanCutoffFor(
  mode: ApiGameMode,
  region: string | null | undefined,
) {
  if (!region || region === "ALL" || !isApiRegion(region)) return null
  return (await loadCutoff(mode, region)) ?? null
}

/**
 * Is this player Valhallan in 1v1?
 *
 * Ladder membership first, across every region: `data.rating` here can be up
 * to six hours old (the profile is a DB-first read-through) while the cutoff
 * refreshes hourly, so the rating comparison alone downgrades anyone who
 * climbed since their last sync — and a player's stored region is only where
 * they mostly play, so a US-E regular who ranks on EU is Valhallan on a ladder
 * their own region's cutoff knows nothing about. Both failures are the same
 * mistake: asking a number when the ladder already holds the answer.
 *
 * The rating comparison stays as the fallback for players below the tracked
 * pages, and is necessarily keyed on their own region's cutoff.
 *
 * 1v1 only — in 2v2 a player can hold several teams and being Valhallan on one
 * says nothing about the others, so those still go through the rating test.
 */
function isValhallan1v1(
  valhallanIds: number[],
  cutoff: { rating: number } | null,
  playerId: number,
  rating: number | null,
  wins: number | null,
): boolean {
  if (valhallanIds.includes(playerId)) return true
  return isValhallan(rating, cutoff?.rating ?? null, wins)
}

/**
 * Heads and weapon icons in the Most Played cluster. Five fits now that the
 * weapons lost their percentage labels and stopped needing two lines each.
 */
const MOST_PLAYED_COUNT = 5
const MOST_PLAYED_WEAPONS = 2

function winRate(wins: number, games: number): string {
  if (games <= 0) return "—"
  return formatPercent((wins / games) * 100)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const numId = parseId(id)
  if (!numId) return { title: "Player | Brawlchemist" }
  // A pro is titled by their handle here for the same reason the page is: it is
  // the name they are known by. It also spares the tab an in-game name with a
  // pipe in it, which reads as a second separator once the name comes first.
  // Free — getProfile reads the profiles map the page already caches.
  const handle = (await getProfile(numId))?.verified?.handle
  const ranked = await loadRanked(numId)
  if (!ranked.data || !ranked.data.name) {
    // No ranked this season — fall back to lifetime stats for the name/desc.
    const statsRes = await loadStats(numId)
    if (statsRes.ok && statsRes.data?.name) {
      const s = statsRes.data
      const title = `${handle ?? s.name} | Brawlchemist`
      const description = [
        `Level ${s.level}`,
        `${(s.games ?? 0).toLocaleString()} games`,
      ].join(" · ")
      return {
        title,
        description,
        openGraph: { title, description, type: "profile" },
        twitter: { card: "summary_large_image", title, description },
      }
    }
    return { title: "Player | Brawlchemist" }
  }
  const d = ranked.data
  const cutoff = await valhallanCutoffRating("1v1", d.region)
  const valhallan = isValhallan(d.rating, cutoff, d.wins)
  const wr = d.games > 0 ? `${((d.wins / d.games) * 100).toFixed(1)}% WR` : null
  const description = [
    tierLabel(d.tier, valhallan),
    `${formatElo(d.rating)} ELO`,
    wr,
    `${d.games.toLocaleString()} games`,
    d.region || null,
  ]
    .filter(Boolean)
    .join(" · ")
  const title = `${handle ?? d.name} | Brawlchemist`
  // og:image is auto-attached from opengraph-image.tsx in this folder.
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="pb-16">{children}</main>
}

function NoticeCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-14 sm:px-6">
      <div className="mx-auto max-w-xl rounded-xl border border-border/60 bg-card/40 p-6 text-center">
        <h1 className="font-display text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
        <Link
          href="/"
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-wider text-copper transition-colors hover:text-foreground"
        >
          ← Search another player
        </Link>
      </div>
    </section>
  )
}

/** A rank rating card: helm (Diamond/Valhallan) + rating + ELO (white headline),
 * tier name + peak beneath. Shared by the 1v1 header and the 2v2-led fallback. */
function RatingTile({
  label,
  rating,
  peak,
  tier,
  tierName,
  partner,
}: {
  label: string
  rating: number | null
  peak: number | null
  tier: Tier | null
  tierName: string
  /**
   * Teammate for a 2v2 rating. Rendered into the label row rather than as a
   * fourth line, so both rating cards stay exactly three lines tall and the
   * whole stat row can sit inside the height of the rank banner.
   */
  partner?: { name: string; id: number }
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 sm:shrink-0">
      <span className="flex min-w-0 items-baseline gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="shrink-0">{label}</span>
        {partner && (
          <Link
            href={`/player/${partner.id}`}
            className="min-w-0 truncate normal-case text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            · {partner.name}
          </Link>
        )}
      </span>
      {/* The helm carries the tier here — the rank banner beside this card is
          per-tier art saying the same thing, so spelling it out as well made
          three things state one fact. The tier name stays in the tooltip: the
          helm says which band at a glance, but only the name settles it for
          someone who doesn't know the art by sight. */}
      <InfoTip label={tier ? tierName : "Unranked"}>
        <div className="mt-1 flex h-7 min-w-0 items-baseline gap-1.5">
          {tier && <RankHelm tier={tier} className="h-6 self-center" />}
          {rating != null ? (
            <span className="truncate font-display text-xl font-semibold tabular-nums text-foreground">
              {formatElo(rating)}
              <span className="ml-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                ELO
              </span>
            </span>
          ) : (
            <span className="font-display text-xl font-semibold text-muted-foreground">
              —
            </span>
          )}
        </div>
      </InfoTip>
      {/* Peak comes back off the tooltip now that the tier has vacated this
          line — with three cards instead of four there is room for it. */}
      <div className="mt-0.5 h-4 truncate font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {peak != null && <>Peak {formatElo(peak)}</>}
      </div>
    </div>
  )
}

/** One label/value pair. Composed into the combined stat cards below. */
function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: string
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "mt-0.5 font-display text-2xl font-semibold tabular-nums",
          accent,
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  )
}

interface WeaponShare {
  weaponId: WeaponId
  pct: number
}

interface AccountStats {
  level: number
  xp: number
  games: number
  playtimeHours: number
  weapons: WeaponShare[]
}

/** Derive lifetime account stats + most-used weapons from GetPlayerStats.
 * Playtime sums each legend's matchtime; weapon share attributes each legend's
 * time-held-weapon-one/two to that legend's two roster weapons. */
function computeAccountStats(stats: PlayerStats): AccountStats {
  const legends = stats.legends ?? []
  let playtimeSeconds = 0
  const byWeapon = new Map<WeaponId, number>()
  for (const l of legends) {
    playtimeSeconds += l.matchtime ?? 0
    const entry = rosterEntryByLegendId(l.legend_id)
    if (!entry) continue
    const [w1, w2] = entry.weapons
    byWeapon.set(w1, (byWeapon.get(w1) ?? 0) + (l.timeheldweaponone ?? 0))
    byWeapon.set(w2, (byWeapon.get(w2) ?? 0) + (l.timeheldweapontwo ?? 0))
  }
  const total = [...byWeapon.values()].reduce((a, b) => a + b, 0)
  const weapons: WeaponShare[] = [...byWeapon.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([weaponId, s]) => ({
      weaponId,
      pct: total > 0 ? (s / total) * 100 : 0,
    }))
  return {
    level: stats.level ?? 0,
    xp: stats.xp ?? 0,
    games: stats.games ?? 0,
    playtimeHours: Math.round(playtimeSeconds / 3600),
    weapons,
  }
}

/** "rocket-lance" → "Rocket Lance". */
function weaponLabel(weaponId: WeaponId): string {
  return weaponId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function AccountTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold tabular-nums">
        {value}
      </div>
    </div>
  )
}

/**
 * PARKED: account level / playtime / XP / lifetime games / guild.
 *
 * Pulled off the profile pending the advanced-stats component that will own
 * these. computeAccountStats still runs (the header reads its weapon shares),
 * so restoring this is a render, not a refetch.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AccountSection({
  stats,
  guildId,
  guildName,
}: {
  stats: AccountStats
  guildId: number | null
  guildName: string | null
}) {
  return (
    <div className="h-full rounded-2xl border border-border/60 bg-card/50 p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccountTile
              label="Account Level"
              value={stats.level.toLocaleString()}
            />
            <AccountTile
              label="Playtime"
              value={`${stats.playtimeHours.toLocaleString()}h`}
            />
            <AccountTile label="Total XP" value={stats.xp.toLocaleString()} />
            <AccountTile
              label="Lifetime Games"
              value={stats.games.toLocaleString()}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-start gap-x-12 gap-y-5 border-t border-border/60 pt-5">
            {stats.weapons.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Main Weapons
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {stats.weapons.map((w) => (
                    <div key={w.weaponId} className="flex items-center gap-2">
                      <WeaponIcon weaponId={w.weaponId} size={32} />
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">
                          {weaponLabel(w.weaponId)}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {w.pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Guild
              </div>
              {guildId ? (
                <Link
                  href={`/guilds/${guildId}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm transition-colors hover:border-tier-valhallan/50 hover:text-foreground"
                >
                  <Users className="size-4 shrink-0 text-muted-foreground" />
                  <span className="max-w-[200px] truncate">
                    {guildName || "Guild"}
                  </span>
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">No guild</span>
              )}
            </div>
      </div>
    </div>
  )
}

/** Slug of the player's most-played legend this season. */
function topLegendSlug(legends: PlayerRankedLegend[] | undefined): string | null {
  const top = [...(legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)[0]
  return top ? slugForLegendId(top.legend_id) : null
}

function LegendHead({
  slug,
  className,
}: {
  slug: string | null
  className?: string
}) {
  if (!slug) {
    return (
      <span
        className={cn(
          "shrink-0 rounded-md border border-border/60 bg-muted/30",
          className,
        )}
      />
    )
  }
  return (
    <Image
      src={`/assets/legends/${slug}.png`}
      alt=""
      width={48}
      height={48}
      className={cn(
        "shrink-0 rounded-md border border-border/60 object-cover",
        className,
      )}
    />
  )
}

/**
 * One half of a team, as the card renders them.
 *
 * A teammate is a player like any other, so they carry the same identity here
 * as anywhere else on the site: pro handle in place of the in-game name, the
 * verified check, and their flair. Before this the card showed two bare
 * usernames, which made a world champion look like an anonymous partner.
 */
interface TeamMember {
  id: number
  /** Pro handle when there is one, otherwise the in-game name. */
  name: string
  slug: string | null
  pro: boolean
  flairId?: string
  achievements?: string[]
}

function TeamMemberName({ member }: { member: TeamMember }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{member.name}</span>
      {member.pro && <VerifiedMark className="size-3" />}
      <FlairMark
        selectedId={member.flairId}
        context={{ achievements: member.achievements }}
        className="h-3.5"
      />
    </span>
  )
}

interface TeamView {
  team: PlayerRanked2v2
  teammateId: number
  /** Identity + art for the other half; the owner is passed by the page. */
  teammate: TeamMember
}

function TeamCard({
  view,
  owner,
  valhallanCutoff,
}: {
  view: TeamView
  owner: TeamMember
  valhallanCutoff: number | null
}) {
  const { team, teammateId, teammate } = view
  const valhallan = isValhallan(team.rating, valhallanCutoff, team.wins)
  const tier = deriveTier(team.tier, valhallan)
  const losses = Math.max(0, team.games - team.wins)
  return (
    <Link
      href={`/player/${teammateId}`}
      prefetch={false}
      className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-tier-valhallan/50 hover:bg-card/70"
    >
      {tier && (
        <Image
          src={`/assets/ranks/Banner_Rank_${tier}.webp`}
          alt={`${tier} rank banner`}
          width={182}
          height={330}
          className="h-20 w-auto shrink-0 select-none object-contain drop-shadow-sm"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex shrink-0 items-center -space-x-1.5">
            <LegendHead slug={owner.slug} className="size-8 ring-1 ring-card" />
            <LegendHead
              slug={teammate.slug}
              className="size-8 ring-1 ring-card"
            />
          </span>
          {/* Wraps rather than truncating as one string: with two names, two
              checks and two flairs the line is long, and clipping it mid-pair
              hides whichever player sorted second. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-sm font-medium">
            <TeamMemberName member={owner} />
            {/* The "+" travels with the second player. In the narrow side
                column this pair wraps, and left on the first line the plus
                trailed two badges and read as a third icon; leading the second
                line it reads as the continuation it is. */}
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="text-muted-foreground">+</span>
              <TeamMemberName member={teammate} />
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px]">
          {tier && (
            <span
              className={cn("uppercase tracking-wider", TIER_TEXT_COLOR[tier])}
            >
              {tierLabel(team.tier, valhallan)}
            </span>
          )}
          <span className="tabular-nums">
            {formatElo(team.rating)}
            <span className="ml-1 text-[9px] uppercase text-muted-foreground">
              ELO
            </span>
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums text-muted-foreground">
            peak {formatElo(team.peak_rating)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{team.games.toLocaleString()} games</span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            {team.wins.toLocaleString()}–{losses.toLocaleString()}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-positive">{winRate(team.wins, team.games)}</span>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-tier-valhallan" />
    </Link>
  )
}

/** A level-100 legend title, plus the legend that earned it. */
export interface EarnedTitle {
  text: string
  legend: string | null
}

/**
 * One earned title.
 *
 * Same tag shape as the rest of the meta row — as bare text these read as a
 * sentence fragment trailing the stats rather than as the earned thing they
 * are. Royal blue rather than gold: gold is the tier language here (tier-gold
 * is a literal rank), so a title wearing it read as a rank.
 *
 * The tooltip names the legend, which is the part the title alone never says.
 */
function TitleTag({ title }: { title: EarnedTitle }) {
  const tag = (
    <span className="inline-flex items-center rounded-md border border-royal/40 bg-royal/10 px-1.5 py-0.5 normal-case text-royal">
      {title.text}
    </span>
  )
  if (!title.legend) return tag
  return <InfoTip label={`Level 100: ${title.legend}`}>{tag}</InfoTip>
}

interface TopLegend {
  slug: string
  name: string
  /** Share of the player's ranked games played on this legend, 0–100. */
  pickRate: number
  level?: number
  xp?: number
}

/** A most-played legend head with a hover card: name, pick rate, level, XP. */
/**
 * Most-played legends and weapons, as one metric in the Ranked Stats strip.
 *
 * Weapons sit beside the legends because they're the same fact at a coarser
 * grain — a Mordex/Nix main is a scythe main — and reading them together is
 * how you tell a one-trick from a weapon specialist. The whole block is the
 * way into the full legends breakdown now that the tab bar is gone, so it
 * carries a link's affordance.
 */
function MostPlayedCluster({
  legends,
  weapons,
  href,
}: {
  legends: TopLegend[]
  weapons: WeaponShare[]
  href: string | null
}) {
  const body = (
    <>
      {/* The label is the affordance, so it says what clicking does rather
          than only what it's showing. A bare chevron after a muted micro-label
          read as decoration — the whole cluster is a link and nothing
          announced it. Both halves brighten on hover so the target reads as
          one thing. */}
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover/most:text-foreground">
        Most Played
        {href && (
          <>
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
            <span className="text-copper transition-colors group-hover/most:text-foreground">
              All legends
            </span>
            <ChevronRight className="size-3 text-copper transition-transform group-hover/most:translate-x-0.5 group-hover/most:text-foreground" />
          </>
        )}
      </span>
      <div className="mt-1 flex h-8 items-center gap-3">
        {legends.length > 0 && (
          <div className="flex items-center gap-1.5">
            {legends.map((l) => (
              <MostPlayedLegend key={l.slug} legend={l} />
            ))}
          </div>
        )}
        {legends.length > 0 && weapons.length > 0 && (
          <span aria-hidden className="h-8 w-px shrink-0 bg-border/60" />
        )}
        {/* Two weapons, no percentages. The share was a number nobody acts on
            sitting under an icon that already says the thing, and it made each
            weapon two lines tall next to single-line legend heads. The figure
            survives in the tooltip for anyone who wants it. */}
        {weapons.length > 0 && (
          <div className="flex items-center gap-2">
            {weapons.slice(0, MOST_PLAYED_WEAPONS).map((w) => (
              <InfoTip
                key={w.weaponId}
                label={`${weaponLabel(w.weaponId)} — ${w.pct.toFixed(0)}% of playtime`}
              >
                <span className="flex items-center">
                  <WeaponIcon weaponId={w.weaponId} size={24} />
                </span>
              </InfoTip>
            ))}
          </div>
        )}
      </div>
      <span className="mt-0.5 block h-4" />
    </>
  )
  const shell = "group/most flex min-w-0 flex-col"
  return href ? (
    <Link href={href} scroll={false} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}

function MostPlayedLegend({ legend }: { legend: TopLegend }) {
  return (
    <div className="group/leg relative">
      <LegendHead slug={legend.slug} className="size-9" />
      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-max -translate-x-1/2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-center shadow-lg group-hover/leg:block">
        <div className="text-xs font-semibold">{legend.name}</div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {legend.pickRate.toFixed(1)}% pick rate
        </div>
        {(legend.level != null || legend.xp != null) && (
          <div className="font-mono text-[10px] text-muted-foreground">
            {legend.level != null && <>Lv {legend.level}</>}
            {legend.level != null && legend.xp != null && " · "}
            {legend.xp != null && <>{legend.xp.toLocaleString()} XP</>}
          </div>
        )}
      </div>
    </div>
  )
}

const MAX_MASTERY_LEVEL = 100

/**
 * LegendsSection — the per-legend breakdown for the Legends tab. Ranked
 * games / win rate come from the cached /ranked payload; Mastery (level + XP)
 * and weapon time-held come from the already-fetched GetPlayerStats payload —
 * both zero extra API cost. Most-played first.
 */
function LegendsSection({
  legends,
  overallWinRate,
  statsByLegendId,
}: {
  legends: PlayerRankedLegend[]
  /** The player's overall 1v1 win rate this season (0–100), or null. */
  overallWinRate: number | null
  /** Lifetime per-legend stats (level/xp + weapon time held) by legend id. */
  statsByLegendId: Map<number, PlayerStatsLegend>
}) {
  const played = [...legends]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)
  const totalGames = played.reduce((sum, l) => sum + l.games, 0)

  // Roomier rows than the default table — this is a browsing surface, not a
  // dense ladder.
  const PAD = "py-3.5"

  const columns: ColDef<PlayerRankedLegend>[] = [
    {
      id: "index",
      label: "#",
      width: "44px",
      align: "right",
      cellClass: PAD,
      render: (_l, i) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {i + 1}
        </span>
      ),
    },
    {
      id: "legend",
      label: "Legend",
      // Fixed width keeps the name column from stretching, so Games sits
      // right beside the legend and the row reads linearly.
      width: "170px",
      cellClass: PAD,
      render: (l) => {
        const slug = slugForLegendId(l.legend_id)
        return slug ? (
          <LegendChip legendId={slug} size="lg" className="font-medium" />
        ) : (
          <span className="text-sm text-muted-foreground">
            Legend #{l.legend_id}
          </span>
        )
      },
    },
    // Games lead the metrics and carry the emphasis — pick % rides along as
    // muted context beneath.
    {
      id: "games",
      label: "Games",
      align: "left",
      width: "90px",
      cellClass: PAD,
      render: (l) => (
        <span className="flex flex-col items-start gap-0.5">
          <span className="font-mono text-lg font-bold leading-none tabular-nums text-foreground">
            {l.games.toLocaleString()}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {totalGames > 0
              ? `${((l.games / totalGames) * 100).toFixed(1)}% pick`
              : "—"}
          </span>
        </span>
      ),
    },
    {
      id: "record",
      label: "W – L",
      align: "right",
      width: "100px",
      cellClass: PAD,
      render: (l) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-positive">{l.wins.toLocaleString()}</span>
          <span className="px-1 opacity-60">–</span>
          <span className="text-negative">
            {Math.max(0, l.games - l.wins).toLocaleString()}
          </span>
        </span>
      ),
    },
    // Win rate, with the delta-vs-overall stacked beneath it.
    {
      id: "winrate",
      label: "Win Rate",
      align: "right",
      width: "100px",
      cellClass: PAD,
      render: (l) => {
        const wr = l.games > 0 ? (l.wins / l.games) * 100 : null
        const delta = wr != null && overallWinRate != null ? wr - overallWinRate : null
        const flat = delta != null && Math.abs(delta) < 0.05
        // Tiny samples make wild deltas — keep the number but mute the color
        // until the legend has a meaningful game count.
        const lowSample = l.games < 10
        return (
          <span className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-sm tabular-nums">
              {winRate(l.wins, l.games)}
            </span>
            {delta != null && (
              <span
                title={
                  lowSample
                    ? "vs overall average — muted under 10 games (small sample)"
                    : "vs this player's overall 1v1 win rate"
                }
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  flat || lowSample
                    ? "text-muted-foreground"
                    : delta > 0
                      ? "text-positive"
                      : "text-negative",
                )}
              >
                {flat ? "±0.0%" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`} vs avg
              </span>
            )}
          </span>
        )
      },
    },
    // Mastery — lifetime legend level (caps at 100) + total XP.
    {
      id: "mastery",
      label: "Mastery",
      align: "right",
      width: "110px",
      cellClass: PAD,
      render: (l) => {
        const s = statsByLegendId.get(l.legend_id)
        if (!s) {
          return <span className="font-mono text-xs text-muted-foreground">—</span>
        }
        const maxed = s.level >= MAX_MASTERY_LEVEL
        return (
          <span className="flex flex-col items-end gap-0.5">
            <span
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                maxed ? "text-tier-gold" : "text-foreground",
              )}
            >
              Lv {s.level}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {s.xp.toLocaleString()} XP
            </span>
          </span>
        )
      },
    },
    // Weapons — the legend's two weapons with lifetime share of time held.
    {
      id: "weapons",
      label: "Weapons",
      width: "150px",
      cellClass: PAD,
      render: (l) => {
        const roster = rosterEntryByLegendId(l.legend_id)
        const s = statsByLegendId.get(l.legend_id)
        if (!roster) {
          return <span className="font-mono text-xs text-muted-foreground">—</span>
        }
        const t1 = s?.timeheldweaponone ?? 0
        const t2 = s?.timeheldweapontwo ?? 0
        const total = t1 + t2
        const pcts: [number, number] =
          total > 0 ? [(t1 / total) * 100, (t2 / total) * 100] : [0, 0]
        return (
          <div className="flex items-center gap-3">
            {roster.weapons.map((w, i) => (
              <span key={w} className="inline-flex items-center gap-1.5">
                <WeaponIcon weaponId={w} size={22} />
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {total > 0 ? `${pcts[i].toFixed(0)}%` : "—"}
                </span>
              </span>
            ))}
          </div>
        )
      },
    },
  ]

  return (
    // No section heading — the active "Legends" tab already names the view.
    <section className="mt-6 px-4 sm:px-6">
      <div className="mx-auto max-w-[1280px]">
        <DataTable
          columns={columns}
          rows={played}
          rowKey={(l) => String(l.legend_id)}
        />
      </div>
    </section>
  )
}


/**
 * Esports credentials as tags: both power rankings and career earnings.
 *
 * These used to be a four-tile section far below the fold that almost every
 * profile rendered empty. They're three numbers, and a number that small wants
 * to sit beside the player's name with the rest of their standing — mystic
 * throughout, the same blue as the verified pro mark, so the row reads "this
 * trio comes from the esports circuit" rather than the ladder. The region and
 * the words ride in the tooltip; the tag keeps the figure.
 */
function esportsTags(
  esports: EsportsProfile | null | undefined,
): { key: string; node: React.ReactNode }[] {
  if (!esports) return []
  const tagClass =
    "inline-flex items-center rounded-md border border-mystic/40 bg-mystic/10 px-1.5 py-0.5 normal-case text-mystic"
  const tags: { key: string; node: React.ReactNode }[] = []
  const pr = [
    { mode: "1v1", pr: esports.pr1v1 },
    { mode: "2v2", pr: esports.pr2v2 },
  ] as const
  for (const { mode, pr: entry } of pr) {
    if (!entry) continue
    tags.push({
      key: `pr-${mode}`,
      node: (
        <InfoTip
          label={`#${entry.powerRanking} on the ${entry.region} ${mode} power rankings`}
        >
          <span className={tagClass}>
            {mode} PR #{entry.powerRanking}
          </span>
        </InfoTip>
      ),
    })
  }
  if (esports.earnings > 0) {
    tags.push({
      key: "earnings",
      node: (
        <InfoTip label="Career tournament earnings">
          <span className={tagClass}>
            ${Math.round(esports.earnings).toLocaleString()}
          </span>
        </InfoTip>
      ),
    })
  }
  return tags
}

/**
 * Way back from a sub-view.
 *
 * The tab bar used to be the navigation *and* the way home; with it gone, the
 * cards that open these views are one-way without this. `bare` skips the outer
 * padding for callers that already sit inside a padded section.
 */
function BackToProfile({
  href,
  label,
  bare = false,
}: {
  href: string
  label: string
  bare?: boolean
}) {
  const link = (
    <Link
      href={href}
      scroll={false}
      className="group/back mx-auto flex max-w-[1280px] items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronRight className="size-3.5 rotate-180 transition-transform group-hover/back:-translate-x-0.5" />
      <span className="text-foreground/80">{label}</span>
      <span className="text-muted-foreground/50">· back to profile</span>
    </Link>
  )
  return bare ? link : <div className="mt-8 px-4 sm:px-6">{link}</div>
}

function ProfileHeader({
  data,
  titles,
  valhallan,
  ladderRank,
  preview,
  esports,
  flair,
  claimSlot,
  bannerId,
  customizeSlot,
}: {
  data: PlayerRanked
  titles: EarnedTitle[]
  valhallan: boolean
  /** 1v1 ladder position when top ~500 (from live_ranked), else null. */
  ladderRank: {
    n: number
    scope: string
    region: string | null
    regionRank: number | null
  } | null
  preview: PlayerPreview | undefined
  esports: EsportsProfile | null
  /** The one flair this player flies, already resolved against what they own. */
  flair: FlairDef | null
  claimSlot?: React.ReactNode
  bannerId?: string | null
  customizeSlot?: React.ReactNode
}) {
  const tier = deriveTier(data.tier, valhallan)
  // Meta line under the name: earned legend titles. (Tier + ladder rank now live
  // in the rating card below.)
  // Esports credentials lead the legend titles: a power ranking is standing,
  // the same kind of claim as the global rank it sits next to, where a title is
  // flavour.
  const metaNodes: { key: string; node: React.ReactNode }[] = [
    ...esportsTags(esports),
  ]
  titles.forEach((title, i) => {
    metaNodes.push({
      key: `title-${i}`,
      node: <TitleTag title={title} />,
    })
  })
  // A pro is known by their handle, so that's the title; the Brawlhalla/Steam
  // name they actually queue under moves to the meta row. Falls back to the
  // in-game name for everyone else, and for a pro with no handle recorded.
  const proHandle = preview?.verified?.handle || null
  const titleName = proHandle || data.name

  const hasMeta =
    !!proHandle ||
    !!preview?.claimed ||
    !!ladderRank ||
    metaNodes.length > 0
  const hasAccolades = (preview?.achievements?.length ?? 0) > 0

  return (
    <section className="px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="mx-auto max-w-[1280px]">
        <div className="relative rounded-2xl border border-border/60 bg-card/50 p-6 shadow-lg backdrop-blur-sm">
          {/* On-brand ambient wash — the owner's chosen banner preset (default
              copper→mystic), kept off the data surfaces. Rounded to match the
              card; the card itself isn't clipped so the Most Played hover
              tooltips can extend past its edges. */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-2xl ${resolveBanner(bannerId).wash}`}
          />
          {/* Favourite skin as the banner's backdrop rather than a figure
              standing beside it. Anchored to the right half, clear of the name
              and tags, faded out below its midpoint
              so the lower half dissolves into the card instead of ending on a
              hard edge, and dropped to a wash so the name and tags keep their
              contrast. Hidden on phones, where there is no room to the side of
              the content for it to be a backdrop rather than clutter. */}
          {preview?.favoriteSkin && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden rounded-2xl sm:block"
            >
              <Image
                src={preview.favoriteSkin.src}
                alt=""
                width={364}
                height={323}
                className="absolute -top-10 right-4 h-[210%] w-auto max-w-none select-none object-contain object-top opacity-[0.22]"
                style={{
                  // Two masks, intersected: the vertical one dissolves the
                  // lower half into the card, the horizontal one fades the
                  // figure out before it reaches the name and tags on the
                  // left. Webkit needs its own prefixed pair.
                  maskImage:
                    "linear-gradient(to bottom, black 0%, black 34%, transparent 66%), linear-gradient(to left, black 45%, transparent 95%)",
                  maskComposite: "intersect",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, black 0%, black 34%, transparent 66%), linear-gradient(to left, black 45%, transparent 95%)",
                  WebkitMaskComposite: "source-in",
                }}
              />
            </div>
          )}
          {customizeSlot && (
            <div className="absolute right-4 top-4 z-20">{customizeSlot}</div>
          )}
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-stretch">
            {tier && (
              <div className="flex shrink-0 items-center justify-center sm:justify-start">
                <Image
                  src={`/assets/ranks/Banner_Rank_${tier}.webp`}
                  alt={`${tier} rank banner`}
                  width={182}
                  height={330}
                  // The banner is the tallest thing in the card, so it is what
                  // sets the card's height. Sized to the default profile —
                  // name line plus one row of tags — instead of the four-row
                  // layout this header used to carry, which left most players
                  // with a band of empty card under their tags. Pros run to a
                  // second row of accolades and still fit inside it.
                  className="h-28 w-auto shrink-0 select-none object-contain drop-shadow-md"
                  priority
                />
              </div>
            )}

            {/* Centred, now that the card is sized to the banner rather than to
                four rows of content: a player with no tags at all would
                otherwise hang from the top edge with the banner centred beside
                them. */}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                      {titleName}
                    </h1>
                    {/* Verification reads as a mark on the name, not as one
                        more tag in the row — so it sits tight against the
                        title and carries its meaning in a tooltip. */}
                    {proHandle && (
                      <VerifiedMark className="size-5 sm:size-6" />
                    )}
                    {/* Flair rides the name line. It's the smallest, rarest
                        thing a player can hold and it says nothing in words,
                        so a row of its own left it stranded under a wall of
                        text; up here it reads as insignia on the name, which
                        is what it is. */}
                    {flair && (
                      <InfoTip label={flair.label}>
                        {/* No chip around it: the art is already a bounded
                            object, and a frame only made it read as one more
                            tag in a row of tags. */}
                        <span className="inline-flex shrink-0 items-center">
                          <Image
                            src={flair.src}
                            alt={flair.label}
                            width={flair.width}
                            height={flair.height}
                            unoptimized
                            className="h-8 w-auto select-none object-contain"
                          />
                        </span>
                      </InfoTip>
                    )}
                    {claimSlot}
                  </div>
                  {hasMeta && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                      {preview?.claimed && <BrawlchemistUserBadge />}
                      {/* Ladder standing, global then regional, in the one ice
                          blue they now share: they answer the same question at
                          two scopes, so reading them as one pair beats the old
                          arrangement where the region tag sat up on the name
                          line in its own colour, looking like a different kind
                          of fact entirely. "Ranked", not "Global" — the number
                          is a position in the ranked ladder, and the regional
                          tag beside it settles "as opposed to what?". */}
                      {ladderRank && (
                        <InfoTip
                          label={`#${ladderRank.n.toLocaleString()} on the global 1v1 ladder`}
                        >
                          <span className="inline-flex items-center gap-1 rounded-md border border-ice/40 bg-ice/10 px-1.5 py-0.5 normal-case text-ice">
                            Ranked #{ladderRank.n.toLocaleString()}
                          </span>
                        </InfoTip>
                      )}
                      {data.region &&
                        (ladderRank?.region === data.region.toUpperCase() &&
                        ladderRank.regionRank ? (
                          <RegionRankTag
                            region={ladderRank.region}
                            rank={ladderRank.regionRank}
                            tone="ice"
                          />
                        ) : (
                          <RegionPill region={data.region} tone="ice" />
                        ))}
                      {/* No separators any more: every item in this row is a
                          bounded tag, so the dots were drawing a line between
                          things already visibly apart — and the leading one
                          orphaned itself whenever the row wrapped. */}
                      {metaNodes.map((item) => (
                        <span key={item.key}>{item.node}</span>
                      ))}
                    </div>
                  )}
                  {/* Esports accolades get their own row under the standing
                      tags. They're tags like the rest — the same kind of claim
                      as a legend title — but they're a different register:
                      earned outside the ladder, and long enough that mixed in
                      they swamped the row. Gold, which the legend titles
                      vacated, so the two rows read "who you are" then "what
                      you've won". */}
                  {hasAccolades && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wider">
                      {preview?.achievements?.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center rounded-md border border-tier-gold/40 bg-tier-gold/10 px-1.5 py-0.5 text-tier-gold"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Header for players without 1v1 ranked data this season. Leads with the
 * player's top 2v2 team when they have one, otherwise an account-led header
 * (level + lifetime games, plus their power rank if they're a pro). Shares the
 * ProfileHeader card shell + name/meta treatment.
 */
function FallbackHeader({
  name,
  region,
  preview,
  titles,
  esports,
  team,
  account,
  claimSlot,
  bannerId,
  customizeSlot,
}: {
  name: string
  region: string | null
  preview: PlayerPreview | undefined
  titles: EarnedTitle[]
  esports: EsportsProfile | null
  team: { data: PlayerRanked2v2; valhallan: boolean } | null
  account: { level: number; games: number } | null
  claimSlot?: React.ReactNode
  bannerId?: string | null
  customizeSlot?: React.ReactNode
}) {
  const tier = team ? deriveTier(team.data.tier, team.valhallan) : null
  const losses = team ? Math.max(0, team.data.games - team.data.wins) : 0
  // Same rule as ProfileHeader: pros are titled by their handle.
  const proHandle = preview?.verified?.handle || null

  return (
    <section className="px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="mx-auto max-w-[1280px]">
        <div className="relative rounded-2xl border border-border/60 bg-card/50 p-6 shadow-lg backdrop-blur-sm">
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-2xl ${resolveBanner(bannerId).wash}`}
          />
          {customizeSlot && (
            <div className="absolute right-4 top-4 z-20">{customizeSlot}</div>
          )}
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-stretch">
            {(tier || preview?.favoriteSkin) && (
              <div className="flex shrink-0 items-center justify-center gap-3 sm:justify-start">
                {tier && (
                  <Image
                    src={`/assets/ranks/Banner_Rank_${tier}.webp`}
                    alt={`${tier} rank banner`}
                    width={182}
                    height={330}
                    className="h-28 w-auto shrink-0 select-none object-contain drop-shadow-md sm:h-36"
                    priority
                  />
                )}
                {preview?.favoriteSkin && (
                  <Image
                    src={preview.favoriteSkin.src}
                    alt={preview.favoriteSkin.name}
                    title={`Favorite skin: ${preview.favoriteSkin.name}`}
                    width={364}
                    height={323}
                    className="h-28 w-auto shrink-0 select-none object-contain drop-shadow-md sm:h-36"
                  />
                )}
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                    {proHandle || name}
                  </h1>
                  {/* See ProfileHeader — the mark belongs on the name. */}
                  {proHandle && (
                    <VerifiedMark className="size-5 sm:size-6" />
                  )}
                  {region && <RegionPill region={region} tone="ice" />}
                  {claimSlot}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                  {preview?.claimed && <BrawlchemistUserBadge />}
                  {/* Same credential tags as the ranked header. */}
                  {esportsTags(esports).map((item) => (
                    <span key={item.key}>{item.node}</span>
                  ))}
                  {titles.map((title) => (
                    <TitleTag key={title.text} title={title} />
                  ))}
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                {team ? (
                  <>
                    {/* Mirrors the 1v1 header: helm + white ELO, then win
                        rate / games on the same rhythm. */}
                    <RatingTile
                      label="2v2 Rating"
                      rating={team.data.rating}
                      peak={team.data.peak_rating}
                      tier={tier}
                      tierName={tierLabel(team.data.tier, team.valhallan)}
                    />
                    <div className="flex justify-between gap-6 rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:flex-1">
                      <div className="flex min-w-0 flex-col">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Win Rate
                        </span>
                        <span className="mt-1 flex h-8 items-center font-display text-2xl font-semibold tabular-nums text-positive">
                          {winRate(team.data.wins, team.data.games)}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Games
                        </span>
                        <span className="mt-1 flex h-8 items-center font-display text-2xl font-semibold tabular-nums">
                          {team.data.games.toLocaleString()}
                        </span>
                        <span className="mt-1 h-4 font-mono text-[10px] text-muted-foreground">
                          {team.data.wins.toLocaleString()}W · {losses.toLocaleString()}L
                        </span>
                      </div>
                    </div>
                  </>
                ) : account ? (
                  <>
                    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:flex-1">
                      <div className="flex items-start justify-between gap-6">
                        <Metric label="Level" value={account.level.toLocaleString()} />
                        <Metric
                          label="Lifetime Games"
                          value={account.games.toLocaleString()}
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {team ? "No 1v1 ranked this season" : "No ranked games this season"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const numId = parseId(id)

  if (!numId) {
    return (
      <Shell>
        <NoticeCard title="Invalid player ID">
          <span className="font-mono">{id}</span> isn&apos;t a valid Brawlhalla
          ID. IDs are positive numbers.
        </NoticeCard>
      </Shell>
    )
  }

  const ranked = await loadRanked(numId)
  if (!ranked.data) {
    return (
      <Shell>
        <NoticeCard title="Couldn’t load this player">
          {ranked.apiError ?? "Unknown error"}
        </NoticeCard>
      </Shell>
    )
  }
  const data = ranked.data

  // The /ranked endpoint returns a name-less shell ({ name: "" }) for accounts
  // with no ranked play this season. We no longer bail here — a profile can be
  // built from lifetime account stats and/or the esports profile instead. The
  // shell is safe to thread through (it carries brawlhalla_id; "2v2"/legends
  // default to empty).
  const hasRankedName = !!data?.name

  // Persist into the pool only when we actually fetched live (source: "api")
  // AND there's a real ranked payload — never write a blank-name shell (username
  // is NOT NULL and powers search/leaderboards). Re-upserting a db-fresh /
  // db-fallback row would just refresh last_synced for no benefit.
  // Deferred with after() — the payload is already in hand, so the reader has
  // no reason to wait on the write (plus its piggybacked snapshot insert).
  if (hasRankedName && ranked.source === "api") {
    after(async () => {
      try {
        await upsertPlayerRanked(data)
      } catch {
        // A cache write failure shouldn't take down the page.
      }
    })
  } else if (ranked.source === "api" && ranked.data && !hasRankedName) {
    // The API answered and this player has no ranked record. Remember that we
    // asked, or the next view asks again for the same nothing.
    //
    // `ranked.data` is the guard that matters: on a failed call it is null, and
    // writing a "we looked, there's nothing" marker off a 429 would show a real
    // player as unranked for six hours.
    after(async () => {
      try {
        await recordUnrankedPlayer(numId)
      } catch {
        // Same as above — telemetry for the cache, never fatal.
      }
    })
  }

  // Legend titles: every legend the player has maxed (level 100) earns its
  // "bio_aka" (e.g. Teros → "The Minotaur"). Levels come from GetPlayerStats,
  // titles from the static legend list. Both fail open — no titles, no error.
  //
  // Everything that only needs `numId` goes out in ONE fan-out. These used to
  // be three separate awaited stages (stats/legends/guild, then
  // profile/esports/ladder, then customization), so a profile paid three
  // sequential round-trips for data that never depended on each other.
  // A crawler we already served from stored data must not spend Brawlhalla API
  // budget on the rest of the page either. /stats and /guild are two more calls
  // per distinct player, and a crawler walking ~90k profiles at three calls
  // each is what left real visitors on the 429 fallback. The page degrades
  // exactly as it already does when those endpoints fail: no Account section,
  // guild falls back to the clan embedded in /stats (also absent here).
  const skipUpstream = ranked.source === "db-crawler"

  // GetPlayerGuild used to fire on every single profile view even though the
  // answer is already on the players row, refreshed weekly by the discovery
  // cron. That was a third of the API cost of a profile for data we had in
  // hand. Ask upstream only when the stored answer has aged out.
  const [syncState, guildFresh] = await Promise.all([
    loadSyncState(numId),
    loadGuildFresh(numId),
  ])

  const [
    statsRes,
    legendsRes,
    guildRes,
    preview,
    esports,
    ladderPos,
    customization,
  ] = await Promise.all([
    skipUpstream ? API_SKIPPED : loadStats(numId),
    loadStaticLegends(),
    skipUpstream || guildFresh ? API_SKIPPED : loadGuild(numId),
    getProfile(numId),
    loadEsports(numId),
    getLadderPosition(numId),
    getCustomization(numId),
  ])

  // The player's guild shows in the Account section; persist it so a profile
  // view contributes to guild discovery (the row exists from the upsert above).
  const guild = guildRes.ok ? guildRes.data.guild ?? null : null
  // Only persist when the lookup actually ran. recordPlayerGuild writes null
  // for "no guild", so calling it after a skipped/failed lookup would wipe a
  // player's stored guild on every crawler visit.
  if (guildRes.ok) {
    after(async () => {
      try {
        await recordPlayerGuild(numId, guild)
      } catch {
        // A cache write failure shouldn't take down the page.
      }
    })
  }

  // Account section: lifetime level/XP/playtime + main weapons + guild. Guild
  // id/name fall back to the clan embedded in GetPlayerStats when the (flaky)
  // GetPlayerGuild lookup comes up empty.
  const accountStats = statsRes.ok ? computeAccountStats(statsRes.data) : null
  const clan = statsRes.ok ? statsRes.data.clan : undefined
  // Prefer a live answer, then the stored one, then the clan embedded in
  // /stats. The stored value is authoritative on a `guildFresh` view — that's
  // the whole point of not making the call.
  // Parked with AccountSection below — the precedence here is non-obvious
  // (live guild > stored > /stats clan), so it stays rather than being
  // rederived when the advanced-stats component lands.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const guildId = guild?.guild_id ?? syncState?.guildId ?? clan?.clan_id ?? null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const guildName =
    guild?.guild_name || syncState?.guildName || clan?.clan_name || null
  let titles: EarnedTitle[] = []
  if (statsRes.ok && legendsRes.ok) {
    const akaById = new Map(
      legendsRes.data.map((l) => [l.legend_id, l.bio_aka]),
    )
    titles = [...(statsRes.data.legends ?? [])]
      .filter((l) => l.level >= MAX_LEGEND_LEVEL)
      .sort((a, b) => (b.games ?? 0) - (a.games ?? 0))
      .map((l) => {
        // Some legends list multiple titles ("The Unconquered Viking, The
        // Great Bear") — keep only the first.
        const text = akaById.get(l.legend_id)?.split(",")[0].trim()
        if (!text) return null
        // The legend that earned it: a title on its own says nothing about
        // where it came from, which is the whole interest of having it.
        const slug = slugForLegendId(l.legend_id)
        return {
          text,
          legend: (slug && rosterEntryBySlug(slug)?.name) || null,
        }
      })
      .filter((t): t is EarnedTitle => t !== null)
  }

  // Per-legend level/XP (from GetPlayerStats) for the Most Played hover cards.
  const legendStatsById = new Map<number, { level: number; xp: number }>()
  // Full lifetime per-legend stats (level/xp + weapon time held), keyed by
  // legend id — feeds the Legends tab's Mastery + Weapons columns. Same
  // GetPlayerStats payload, no extra API call.
  const fullLegendStatsById = new Map<number, PlayerStatsLegend>()
  if (statsRes.ok) {
    for (const l of statsRes.data.legends ?? []) {
      legendStatsById.set(l.legend_id, { level: l.level, xp: l.xp })
      fullLegendStatsById.set(l.legend_id, l)
    }
  }

  // Brawlhalla's local 2v2 (two controllers on one account) surfaces in the
  // ranked "2v2" array as a phantom team whose partner is either id 0 or the
  // player themselves. Neither is a real teammate and both link nowhere useful,
  // so hide them from display (front-end only — the API payload is untouched).
  const teams = [...(data["2v2"] ?? [])]
    .filter(
      (t) =>
        t.brawlhalla_id_one > 0 &&
        t.brawlhalla_id_two > 0 &&
        t.brawlhalla_id_one !== t.brawlhalla_id_two,
    )
    .sort((a, b) => b.rating - a.rating)

  // Resolve each team's *other* player so cards can show their main legend and
  // link to their profile. Looked up from our cache; fail open if it's down.
  const ownerSlug = topLegendSlug(data.legends)
  const teammateIdFor = (t: PlayerRanked2v2) =>
    t.brawlhalla_id_one === data.brawlhalla_id
      ? t.brawlhalla_id_two
      : t.brawlhalla_id_one
  let teammates = new Map<number, PlayerRow>()
  if (teams.length > 0) {
    try {
      // Cards show only the teammate's name + main legend, so skip ranked_json.
      teammates = await getPlayersByIds(teams.map(teammateIdFor), {
        includeRankedJson: false,
      })
    } catch (err) {
      console.error("[player] teammate lookup failed:", err)
    }
  }
  // Teammate identity — pro handle, verified status and flair — so a team card
  // names them the way every other surface does. Both maps are cached app-wide
  // (getProfile above already warmed the profiles one), so this adds no query
  // per teammate, and both fail open to the plain in-game name.
  let teamProfiles = new Map<number, PlayerPreview>()
  let teamFlairs = new Map<number, string>()
  if (teams.length > 0) {
    const [pm, fm] = await Promise.all([
      getProfilesMap().catch((err) => {
        console.error("[player] team profiles lookup failed:", err)
        return new Map<number, PlayerPreview>()
      }),
      getFlairMap().catch((err) => {
        console.error("[player] team flair lookup failed:", err)
        return new Map<number, string>()
      }),
    ])
    teamProfiles = pm
    teamFlairs = fm
  }

  const teamViews: TeamView[] = teams.map((t) => {
    const teammateId = teammateIdFor(t)
    const row = teammates.get(teammateId)
    const parts = t.teamname.split("+").map((s) => s.trim())
    const fallbackName =
      parts.length === 2
        ? parts[0] === data.name
          ? parts[1]
          : parts[0]
        : `Player #${teammateId}`
    const username = row?.username || fallbackName || `Player #${teammateId}`
    const mate = teamProfiles.get(teammateId)
    return {
      team: t,
      teammateId,
      teammate: {
        id: teammateId,
        name: mate?.verified?.handle || username,
        slug: row?.topLegendId ? slugForLegendId(row.topLegendId) : null,
        pro: !!mate?.verified,
        flairId: teamFlairs.get(teammateId),
        achievements: mate?.achievements,
      },
    }
  })

  // Distinguish Valhallan from Diamond (both 2000+) via the region's live
  // ladder cutoff — 1v1 for the header, 2v2 for the team cards.
  // Only the cutoffs are left here — they need data.region (and whether the
  // player has any 2v2 teams), so they can't join the fan-out above.
  const [cut1v1, cutoff2v2, valhallanIds] = await Promise.all([
    valhallanCutoffFor("1v1", data.region),
    teams.length > 0
      ? valhallanCutoffRating("2v2", data.region)
      : Promise.resolve(null),
    loadValhallanIds("1v1"),
  ])
  const cutoff1v1 = cut1v1?.rating ?? null
  const headerValhallan = isValhallan1v1(
    valhallanIds,
    cut1v1,
    numId,
    data.rating,
    data.wins,
  )
  // Live top-500 ladder position (global ALL ladder); null below the top 500.
  const ladderRank = ladderPos
    ? {
        n: ladderPos.rank,
        scope: "Global",
        region: ladderPos.region?.toUpperCase() ?? null,
        regionRank: ladderPos.regionRank,
      }
    : null

  // Name from the best available source: ranked → lifetime stats → esports.
  const displayName =
    data.name || (statsRes.ok ? statsRes.data.name : "") || esports?.handle || ""
  // Nothing anywhere — no ranked, no stats, no esports. (Unknown/empty BHID.)
  if (!displayName) {
    return (
      <Shell>
        <NoticeCard title="Player not found">
          Brawlhalla ID <span className="font-mono">{numId}</span> doesn&apos;t
          have any ranked, account, or esports data we can show.
        </NoticeCard>
      </Shell>
    )
  }

  // Header mode: full 1v1 card → else top 2v2 team → else account-led.
  const hasOneVOne = hasRankedName && !!data.tier && data.tier !== "none"
  const topTeam = teams[0] ?? null

  // Header totals: 1v1 plus every 2v2 team. `teams` is already filtered of the
  // junk rows the API returns (self-teams, zero ids), so this doesn't
  // double-count anything the Teams tab wouldn't also show.
  const combinedRecord = teams.reduce(
    (acc, t) => ({ wins: acc.wins + t.wins, games: acc.games + t.games }),
    { wins: data.wins, games: data.games },
  )

  // Tabbed sections below the header. Tabs only appear when they have
  // content; Overview (rating history + account) is always first, esports
  // gets its own tab for tracked competitors.
  const playedLegends = (data.legends ?? []).filter((l) => l.games > 0)
  const headerTier = deriveTier(data.tier, headerValhallan)
  const headerWeapons = accountStats?.weapons ?? []
  // Most-played legends for the Ranked Stats strip. Lives here rather than in
  // the header now that the stats do.
  const headerTopLegends: TopLegend[] = [...(data.legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, MOST_PLAYED_COUNT)
    .map((l): TopLegend | null => {
      const slug = slugForLegendId(l.legend_id)
      if (!slug) return null
      return {
        slug,
        name: rosterEntryBySlug(slug)?.name ?? slug,
        pickRate: data.games > 0 ? (l.games / data.games) * 100 : 0,
        level: legendStatsById.get(l.legend_id)?.level,
        xp: legendStatsById.get(l.legend_id)?.xp,
      }
    })
    .filter((l): l is TopLegend => l !== null)
  // The tab bar is gone — these are still URL states, reached from the cards
  // that describe them (Most Played -> legends, Top 2v2 Teams -> teams). The
  // list is now only a guard on ?tab=, so an unreachable value falls back to
  // the profile rather than rendering an empty view.
  const reachableTabs = [
    ...(playedLegends.length > 0 ? ["legends"] : []),
    ...(teamViews.length > 0 ? ["teams"] : []),
  ]
  const tab = reachableTabs.includes(sp.tab as string)
    ? (sp.tab as string)
    : "overview"
  // Best three teams (already rating-sorted) for the Overview side column.
  const overviewTeams = teamViews.slice(0, 3)

  // Owner-chosen header banner (cached, fails open to the default wash). The
  // panel that sets it is gated to the owner inside ProfileCustomizerSlot.
  const { bannerId } = customization
  // Everything the flair rules read is already loaded for the header, so this
  // costs nothing beyond the derivation itself.
  const flairContext: FlairContext = { achievements: preview?.achievements }
  const flair = resolveFlair(customization.flairId, flairContext)
  // This player as a team member. Same shape as the teammate opposite them, so
  // a card can't render one side richer than the other.
  const teamOwner: TeamMember = {
    id: numId,
    name: preview?.verified?.handle || data.name,
    slug: ownerSlug,
    pro: !!preview?.verified,
    flairId: customization.flairId ?? undefined,
    achievements: preview?.achievements,
  }
  // The name the page titles with — a pro is known by their handle, so the
  // track card shouldn't call them something the heading never did.
  const trackName = preview?.verified?.handle || displayName
  // One panel for every owner-settable axis, gated to the owner inside the
  // slot. It supersedes the standalone banner popover.
  const customizeSlot = (
    <ProfileCustomizerSlot brawlhallaId={numId} flairContext={flairContext} />
  )
  // Track/untrack star — reads shared favorites state; signed-out viewers get a
  // sign-in nudge from inside the control.

  // Device-local recent-visit crumb: mirror the search-result shape so the home
  // dropdown renders this identically to a live suggestion. Top legend = most
  // games this season; rating/region collapse to null when absent.
  const recentTopLegend = [...(data.legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)[0]
  const recentLegendSlug = recentTopLegend
    ? slugForLegendId(recentTopLegend.legend_id)
    : null

  return (
    <Shell>
      <RecentVisitRecorder
        id={numId}
        username={displayName}
        legendSlug={recentLegendSlug}
        rating={typeof data.rating === "number" && data.rating > 0 ? data.rating : null}
        region={data.region || null}
        pro={!!preview?.verified}
        // Everything the search dropdown renders, recorded as the page already
        // knows it — a recent visit should come back looking exactly like a
        // live suggestion for the same player, badge and helm included.
        handle={preview?.verified?.handle || null}
        tier={headerTier}
        flairId={customization.flairId}
        achievements={preview?.achievements}
      />
      {hasOneVOne ? (
        <ProfileHeader
          data={data}
          titles={titles}
          valhallan={headerValhallan}
          ladderRank={ladderRank}
          preview={preview}
          esports={esports}
          flair={flair}
          claimSlot={<ClaimBanner brawlhallaId={numId} />}
          bannerId={bannerId}
          customizeSlot={customizeSlot}
        />
      ) : topTeam ? (
        <FallbackHeader
          name={displayName}
          region={data.region || null}
          preview={preview}
          titles={titles}
          esports={esports}
          team={{
            data: topTeam,
            valhallan: isValhallan(topTeam.rating, cutoff2v2, topTeam.wins),
          }}
          account={null}
          claimSlot={<ClaimBanner brawlhallaId={numId} />}
          bannerId={bannerId}
          customizeSlot={customizeSlot}
        />
      ) : (
        <FallbackHeader
          name={displayName}
          region={data.region || null}
          preview={preview}
          titles={titles}
          esports={esports}
          team={null}
          account={
            accountStats
              ? { level: accountStats.level, games: accountStats.games }
              : null
          }
          claimSlot={<ClaimBanner brawlhallaId={numId} />}
          bannerId={bannerId}
          customizeSlot={customizeSlot}
        />
      )}

      {tab === "overview" && (
        <>
          {/* Account level / playtime / XP / lifetime games / guild are hidden
              pending the advanced-stats component that will own them.
              computeAccountStats still runs — the header reads its weapon
              shares — so bringing them back is a render, not a refetch. */}
          <ProfileCustomization brawlhallaId={numId} />

          {hasOneVOne && (
            <section className="mt-8 px-4 sm:px-6">
              <div
                className={cn(
                  "mx-auto grid max-w-[1280px] grid-cols-1 gap-4",
                  overviewTeams.length > 0 && "lg:grid-cols-3",
                )}
              >
                <div className={overviewTeams.length > 0 ? "lg:col-span-2" : ""}>
                  <RankedStatsCard
                    embedded
                    brawlhallaId={numId}
                    valhallanCutoff={cutoff1v1}
                    stats={{
                      rating: data.rating,
                      peak: data.peak_rating,
                      tier: headerTier,
                      tierName: tierLabel(data.tier, headerValhallan),
                      wins: combinedRecord.wins,
                      games: combinedRecord.games,
                    }}
                    ratingSlot={
                      <span
                        className="flex items-baseline gap-1.5"
                        title={headerTier ? tierLabel(data.tier, headerValhallan) : undefined}
                      >
                        {headerTier && (
                          <RankHelm tier={headerTier} className="h-7 self-center" />
                        )}
                        {data.rating != null ? (
                          <span>
                            {formatElo(data.rating)}
                            <span className="ml-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              ELO
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    }
                    mostPlayedSlot={
                      headerTopLegends.length > 0 || headerWeapons.length > 0 ? (
                        <MostPlayedCluster
                          legends={headerTopLegends}
                          weapons={headerWeapons}
                          href={
                            playedLegends.length > 0
                              ? `/player/${numId}?tab=legends`
                              : null
                          }
                        />
                      ) : null
                    }
                  />
                </div>

                {/* The side column, as one grid child. The track card was a
                    third child of a three-column grid, which put it on a new
                    row under the stats rather than under the teams. */}
                <div className="flex flex-col gap-4">
                  {overviewTeams.length > 0 && (
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <h2 className="font-display text-lg font-semibold">
                          2v2 Teams
                        </h2>
                        {teamViews.length > overviewTeams.length && (
                          <Link
                            href={`/player/${numId}?tab=teams`}
                            scroll={false}
                            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                          >
                            all {teamViews.length} →
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-col gap-3">
                        {overviewTeams.map((view) => (
                          <TeamCard
                            key={`${view.team.brawlhalla_id_one}-${view.team.brawlhalla_id_two}`}
                            view={view}
                            owner={teamOwner}
                            valhallanCutoff={cutoff2v2}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <TrackPlayerCard brawlhallaId={numId} name={trackName} />
                </div>
              </div>
            </section>
          )}

          {!hasOneVOne && (
            <>
              <p className="mt-10 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
                No 1v1 ranked play this season.
              </p>
              {/* The track card lives in the Overview's side column, which only
                  exists for players with 1v1 data — without this, a player who
                  hasn't queued 1v1 this season couldn't be tracked at all. */}
              <div className="mx-auto mt-6 max-w-[1280px] px-4 sm:px-6">
                <TrackPlayerCard brawlhallaId={numId} name={trackName} />
              </div>
            </>
          )}
        </>
      )}

      {tab === "legends" && (
        <>
          <BackToProfile href={`/player/${numId}`} label="Legends" />
          <LegendsSection
            legends={playedLegends}
            overallWinRate={
              hasOneVOne && data.games > 0
                ? (data.wins / data.games) * 100
                : null
            }
            statsByLegendId={fullLegendStatsById}
          />
        </>
      )}

      {tab === "teams" && (
        <div className="mt-8 px-4 sm:px-6">
          <BackToProfile
            href={`/player/${numId}`}
            label={`2v2 Teams · ${teamViews.length}`}
            bare
          />
          <div className="mx-auto mt-3 grid max-w-[1280px] grid-cols-1 gap-3 sm:grid-cols-2">
            {teamViews.map((view) => (
              <TeamCard
                key={`${view.team.brawlhalla_id_one}-${view.team.brawlhalla_id_two}`}
                view={view}
                owner={teamOwner}
                valhallanCutoff={cutoff2v2}
              />
            ))}
          </div>
        </div>
      )}

    </Shell>
  )
}
