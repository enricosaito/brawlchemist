import { cache } from "react"
import { after } from "next/server"
import { headers } from "next/headers"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, BadgeCheck, ChevronRight, Trophy, Users } from "lucide-react"
import {
  LegendChip,
  RankHelm,
  RegionPill,
  RegionRankTag,
  TIER_TEXT_COLOR,
  WeaponIcon,
} from "@/components/site/primitives"
import { ClaimBanner } from "@/components/site/claim-banner"
import { BannerPicker } from "@/components/site/banner-picker"
import { FavoriteToggleControl } from "@/components/site/favorite-toggle-control"
import { RecentVisitRecorder } from "@/components/site/recent-visit-recorder"
import { resolveBanner } from "@/lib/profile/banners"
import { getCustomization } from "@/lib/sync/customizations"
import { getLadderPosition } from "@/lib/sync/live"
import { ProfileCustomization } from "@/components/site/profile-customization"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { BrawlchemistUserBadge } from "@/components/site/brawlchemist-user-badge"
import { RatingHistoryCard } from "@/components/player/rating-history-card"
import type { PlayerPreview } from "@/lib/player-previews"
import { getProfile } from "@/lib/sync/profiles"
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
  type EsportsPr,
  type EsportsProfile,
} from "@/lib/brawltools-api"
import {
  getPlayerRankedJson,
  getPlayersByIds,
  getPlayerSyncState,
  upsertPlayerRanked,
} from "@/lib/sync/players"
import { clientLabel, isCrawler } from "@/lib/bots"
import { recordPlayerGuild } from "@/lib/sync/guilds"
import { recordFetch } from "@/lib/sync/fetch-log"
import { getValhallanCutoff } from "@/lib/sync/valhallan-cutoff"
import type { PlayerRow } from "@/lib/db/schema"
import { deriveTier, isValhallan, tierLabel } from "@/lib/tier"
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
const PROFILE_FRESH_ACTIVE_MS = 15 * 60 * 1000
const PROFILE_FRESH_IDLE_MS = 6 * 60 * 60 * 1000
/** Treat a player as mid-session if the live ladder saw them this recently. */
const LIVE_SESSION_MS = 45 * 60 * 1000
/** Re-ask GetPlayerGuild only this often; the stored guild serves every other view. */
const GUILD_FRESH_MS = 7 * 24 * 60 * 60 * 1000
type LoadedRanked = {
  data: PlayerRanked | null
  source: "db-fresh" | "db-crawler" | "api" | "db-fallback"
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

  let result: LoadedRanked
  if (serveFromCache) {
    const data = await getPlayerRankedJson(numId)
    result = data
      ? { data, source: fresh ? "db-fresh" : "db-crawler" }
      : { data: null, source: "api", apiError: "cached payload disappeared" }
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
    result.source === "db-fresh" || result.source === "db-crawler"
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
 * Ladder membership first: `data.rating` here can be up to six hours old (the
 * profile is a DB-first read-through), while the cutoff refreshes hourly, so
 * the rating comparison alone downgrades anyone who climbed since their last
 * sync. Membership is the ladder's own answer. The comparison stays as the
 * fallback for players below the tracked pages.
 *
 * 1v1 only — in 2v2 a player can hold several teams and being Valhallan on one
 * says nothing about the others, so those still go through the rating test.
 */
function isValhallan1v1(
  cutoff: { rating: number; ids: number[] } | null,
  playerId: number,
  rating: number | null,
  wins: number | null,
): boolean {
  if (cutoff?.ids?.includes(playerId)) return true
  return isValhallan(rating, cutoff?.rating ?? null, wins)
}

/** Heads in the header's Most Played card. Four keeps the stat row one line. */
const MOST_PLAYED_COUNT = 4

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
  if (!numId) return { title: "Brawlchemist | Player" }
  const ranked = await loadRanked(numId)
  if (!ranked.data || !ranked.data.name) {
    // No ranked this season — fall back to lifetime stats for the name/desc.
    const statsRes = await loadStats(numId)
    if (statsRes.ok && statsRes.data?.name) {
      const s = statsRes.data
      const title = `Brawlchemist | ${s.name}`
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
    return { title: "Brawlchemist | Player" }
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
  const title = `Brawlchemist | ${d.name}`
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
          three things state one fact. Tier name stays in the tooltip for the
          bands below Diamond, which have no helm. */}
      <div
        className="mt-1 flex h-7 min-w-0 items-baseline gap-1.5"
        title={tier ? tierName : undefined}
      >
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

function EsportsTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn("mt-1 font-mono text-xl font-bold tabular-nums", accent)}
      >
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  )
}

function SocialLink({
  href,
  label,
}: {
  href: string
  label: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-tier-valhallan/50 hover:text-tier-valhallan"
    >
      {label}
      <ArrowUpRight className="size-3 shrink-0" />
    </a>
  )
}

/**
 * Esports section — competitive/esports profile from brawltools, shown only
 * for tracked competitors with a power ranking or career earnings. The "Pro"
 * mark (a power ranking) is separate from the manual /admin verified badge.
 */
function EsportsSection({ profile }: { profile: EsportsProfile }) {
  const { pr1v1, pr2v2, earnings, handle, twitter, twitch, country, isPro } =
    profile
  // Medals come from the mode the player is ranked highest in (lowest number).
  const ranked = [
    pr1v1 ? ({ mode: "1v1", pr: pr1v1 } as const) : null,
    pr2v2 ? ({ mode: "2v2", pr: pr2v2 } as const) : null,
  ].filter((x): x is { mode: "1v1" | "2v2"; pr: EsportsPr } => x !== null)
  const primary = [...ranked].sort(
    (a, b) => a.pr.powerRanking - b.pr.powerRanking,
  )[0]

  return (
    // No section heading — the active "Esports" tab already names the view.
    <section className="mt-6 px-4 sm:px-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-display text-lg font-semibold">{handle}</span>
            {isPro && (
              <span className="inline-flex items-center gap-1 rounded-md border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-copper">
                <Trophy className="size-3" />
                Pro
              </span>
            )}
            {country && (
              <span className="text-sm text-muted-foreground">{country}</span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {twitter && (
                <SocialLink
                  href={`https://x.com/${twitter}`}
                  label={`Twitter @${twitter}`}
                />
              )}
              {twitch && (
                <SocialLink
                  href={`https://twitch.tv/${twitch}`}
                  label={`Twitch ${twitch}`}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pr1v1 && (
              <EsportsTile
                label="1v1 Power Rank"
                value={`#${pr1v1.powerRanking}`}
                sub={pr1v1.region}
                accent="text-copper"
              />
            )}
            {pr2v2 && (
              <EsportsTile
                label="2v2 Power Rank"
                value={`#${pr2v2.powerRanking}`}
                sub={pr2v2.region}
                accent="text-copper"
              />
            )}
            <EsportsTile
              label="Earnings"
              value={`$${Math.round(earnings).toLocaleString()}`}
              accent="text-positive"
            />
            {primary && (
              <EsportsTile
                label="Top 8 / Top 32"
                value={`${primary.pr.top8} / ${primary.pr.top32}`}
                sub={`${primary.mode} placements`}
              />
            )}
          </div>

          {primary && (
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {primary.mode} medals
              </span>
              <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums">
                <span aria-hidden>🥇</span> {primary.pr.gold}
                <span className="ml-3" aria-hidden>
                  🥈
                </span>{" "}
                {primary.pr.silver}
                <span className="ml-3" aria-hidden>
                  🥉
                </span>{" "}
                {primary.pr.bronze}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
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

interface TeamView {
  team: PlayerRanked2v2
  teammateId: number
  teammateName: string
  teammateSlug: string | null
}

function TeamCard({
  view,
  ownerName,
  ownerSlug,
  valhallanCutoff,
}: {
  view: TeamView
  ownerName: string
  ownerSlug: string | null
  valhallanCutoff: number | null
}) {
  const { team, teammateId, teammateName, teammateSlug } = view
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
            <LegendHead slug={ownerSlug} className="size-8 ring-1 ring-card" />
            <LegendHead slug={teammateSlug} className="size-8 ring-1 ring-card" />
          </span>
          <span className="truncate text-sm font-medium">
            {ownerName} <span className="text-muted-foreground">+</span>{" "}
            {teammateName}
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

interface TopLegend {
  slug: string
  name: string
  /** Share of the player's ranked games played on this legend, 0–100. */
  pickRate: number
  level?: number
  xp?: number
}

/** A most-played legend head with a hover card: name, pick rate, level, XP. */
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
  legendStats,
  combined,
  weapons,
  legendsHref,
  claimSlot,
  favoriteSlot,
  bannerId,
  bannerSlot,
}: {
  data: PlayerRanked
  titles: string[]
  valhallan: boolean
  /** 1v1 ladder position when top ~500 (from live_ranked), else null. */
  ladderRank: {
    n: number
    scope: string
    region: string | null
    regionRank: number | null
  } | null
  preview: PlayerPreview | undefined
  legendStats: Map<number, { level: number; xp: number }>
  /** 1v1 + every 2v2 team combined, for the win-rate card. */
  combined: { wins: number; games: number }
  /** Most-used weapons, shown beside the most-played legends. */
  weapons: WeaponShare[]
  /** Opens the full legends breakdown — the Most Played card is the entry. */
  legendsHref: string | null
  claimSlot?: React.ReactNode
  favoriteSlot?: React.ReactNode
  bannerId?: string | null
  bannerSlot?: React.ReactNode
}) {
  const tier = deriveTier(data.tier, valhallan)
  const losses = Math.max(0, combined.games - combined.wins)
  const topLegends: TopLegend[] = [...(data.legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, MOST_PLAYED_COUNT)
    .map((l): TopLegend | null => {
      const slug = slugForLegendId(l.legend_id)
      if (!slug) return null
      const stats = legendStats.get(l.legend_id)
      return {
        slug,
        name: rosterEntryBySlug(slug)?.name ?? slug,
        pickRate: data.games > 0 ? (l.games / data.games) * 100 : 0,
        level: stats?.level,
        xp: stats?.xp,
      }
    })
    .filter((l): l is TopLegend => l !== null)

  // Meta line under the name: earned legend titles. (Tier + ladder rank now live
  // in the rating card below.)
  const metaNodes: { key: string; node: React.ReactNode }[] = []
  titles.forEach((title, i) => {
    metaNodes.push({
      key: `title-${i}`,
      node: (
        // Same tag shape as the rest of the row. As bare gold text these read
        // as a sentence fragment trailing the stats rather than as the earned
        // thing they are.
        <span
          title="Earned legend title"
          className="inline-flex items-center rounded-md border border-tier-gold/40 bg-tier-gold/10 px-1.5 py-0.5 normal-case text-tier-gold"
        >
          {title}
        </span>
      ),
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
          {bannerSlot && (
            <div className="absolute right-4 top-4 z-20">{bannerSlot}</div>
          )}
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-stretch">
            {(tier || preview?.favoriteSkin) && (
              <div className="flex shrink-0 items-center justify-center gap-2 sm:justify-start">
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
                      <span
                        title="Verified pro player"
                        className="inline-flex shrink-0"
                      >
                        <BadgeCheck
                          className="size-5 text-mystic sm:size-6"
                          aria-label="Verified pro player"
                        />
                      </span>
                    )}
                    {/* The region tag carries the player's standing in that
                        region when we know it — "US-E #1" rather than a bare
                        "US-E". It belongs on the name line next to the
                        verified mark, where it reads as part of who this
                        player is, not down among the stat tags. */}
                    {data.region &&
                      (ladderRank?.region === data.region.toUpperCase() &&
                      ladderRank.regionRank ? (
                        <RegionRankTag
                          region={ladderRank.region}
                          rank={ladderRank.regionRank}
                        />
                      ) : (
                        <RegionPill region={data.region} />
                      ))}
                    {claimSlot}
                    {favoriteSlot}
                    {/* The in-game name trails the controls: it's the answer to
                        "who is this on the ladder", which you want beside the
                        name, not buried a line below among the stat tags. */}
                    {proHandle && (
                      <span
                        title="In-game name"
                        className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
                      >
                        {data.name}
                      </span>
                    )}
                  </div>
                  {hasMeta && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                      {preview?.claimed && <BrawlchemistUserBadge />}
                      {/* Mystic, the same blue as the verified mark: both are
                          standing rather than flavour, which separates them
                          from the gold of earned titles. */}
                      {ladderRank && (
                        <span
                          title={`#${ladderRank.n.toLocaleString()} on the global 1v1 ladder`}
                          className="inline-flex items-center gap-1 rounded-md border border-mystic/40 bg-mystic/10 px-1.5 py-0.5 text-mystic"
                        >
                          Global #{ladderRank.n.toLocaleString()}
                        </span>
                      )}
                      {/* No separators any more: every item in this row is a
                          bounded tag, so the dots were drawing a line between
                          things already visibly apart — and the leading one
                          orphaned itself whenever the row wrapped. */}
                      {metaNodes.map((item) => (
                        <span key={item.key}>{item.node}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Esports accolades — experimental, hardcoded per player. */}
                {preview?.achievements && preview.achievements.length > 0 && (
                  <ul className="flex shrink-0 flex-col gap-1 sm:items-end">
                    {preview.achievements.map((a) => (
                      <li
                        key={a}
                        className="flex items-center gap-1.5 text-xs font-semibold text-tier-gold"
                      >
                        <Image
                          src="/assets/Legendary_moment_trophy.png"
                          alt=""
                          width={616}
                          height={1212}
                          className="h-5 w-auto shrink-0 select-none object-contain"
                        />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Stat cards row, anchored to the bottom so the banner/skin on
                  the left spans this and the name row above it. */}
              <div className="mt-auto flex flex-col gap-2 sm:flex-row">
                <RatingTile
                  label="1v1 Rating"
                  rating={data.rating}
                  peak={data.peak_rating}
                  tier={tier}
                  tierName={tierLabel(data.tier, valhallan)}
                />
                {/* Win rate + games played — same label/value/sub rhythm as the
                    rating cards so the big numbers line up across the row.
                    Counts 1v1 and every 2v2 team together: this is the card
                    that answers "how much have they played", and splitting it
                    by queue understated it for anyone who mostly plays 2v2. */}
                <div className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 sm:flex-1">
                  <div className="flex min-w-0 justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      {/* Which queues the total covers is a tooltip, not a
                          line: three lines per card is what keeps the row
                          inside the banner's height. */}
                      <span
                        className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                        title={
                          combined.games > data.games
                            ? "1v1 and 2v2 combined"
                            : "1v1 only — no 2v2 record this season"
                        }
                      >
                        Win Rate
                      </span>
                      <span className="mt-1 flex h-7 items-center font-display text-xl font-semibold tabular-nums text-positive">
                        {winRate(combined.wins, combined.games)}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Games
                      </span>
                      <span className="mt-1 flex h-7 items-center font-display text-xl font-semibold tabular-nums">
                        {combined.games.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {/* Spans the card rather than sitting under Win Rate alone —
                      in half the width "1,382W · 334L" truncated. */}
                  <span className="mt-0.5 h-4 truncate font-mono text-[10px] text-muted-foreground">
                    {combined.wins.toLocaleString()}W · {losses.toLocaleString()}L
                  </span>
                </div>
                {/* Most played legends and weapons. Hover a head for pick
                    rate, level and XP; the card itself is the way into the
                    full legends breakdown now that the tab bar is gone, so it
                    carries the affordance of a link.

                    Weapons sit beside the legends because they're the same
                    fact at a coarser grain — a Mordex/Nix main is a scythe
                    main — and reading them together is how you tell a
                    one-trick from a weapon specialist. */}
                {(topLegends.length > 0 || weapons.length > 0) &&
                  (() => {
                    const body = (
                      <>
                        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Most Played
                          {legendsHref && (
                            <ChevronRight className="size-3 transition-transform group-hover/most:translate-x-0.5" />
                          )}
                        </span>
                        <div className="mt-1.5 flex items-center gap-3">
                          {topLegends.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              {topLegends.map((l) => (
                                <MostPlayedLegend key={l.slug} legend={l} />
                              ))}
                            </div>
                          )}
                          {topLegends.length > 0 && weapons.length > 0 && (
                            <span
                              aria-hidden
                              className="h-8 w-px shrink-0 bg-border/60"
                            />
                          )}
                          {weapons.length > 0 && (
                            <div className="flex items-center gap-2">
                              {weapons.slice(0, 3).map((w) => (
                                <span
                                  key={w.weaponId}
                                  title={`${weaponLabel(w.weaponId)} — ${w.pct.toFixed(0)}% of playtime`}
                                  className="flex flex-col items-center gap-0.5"
                                >
                                  <WeaponIcon weaponId={w.weaponId} size={20} />
                                  <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                                    {w.pct.toFixed(0)}%
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )
                    const shell =
                      "group/most min-w-0 shrink-0 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5"
                    return legendsHref ? (
                      <Link
                        href={legendsHref}
                        scroll={false}
                        className={cn(
                          shell,
                          "transition-colors hover:border-tier-valhallan/50",
                        )}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={shell}>{body}</div>
                    )
                  })()}
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
  favoriteSlot,
  bannerId,
  bannerSlot,
}: {
  name: string
  region: string | null
  preview: PlayerPreview | undefined
  titles: string[]
  esports: EsportsProfile | null
  team: { data: PlayerRanked2v2; valhallan: boolean } | null
  account: { level: number; games: number } | null
  claimSlot?: React.ReactNode
  favoriteSlot?: React.ReactNode
  bannerId?: string | null
  bannerSlot?: React.ReactNode
}) {
  const tier = team ? deriveTier(team.data.tier, team.valhallan) : null
  const proPr = esports?.pr1v1 ?? esports?.pr2v2 ?? null
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
          {bannerSlot && (
            <div className="absolute right-4 top-4 z-20">{bannerSlot}</div>
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
                    <span title="Verified pro player" className="inline-flex shrink-0">
                      <BadgeCheck
                        className="size-5 text-mystic sm:size-6"
                        aria-label="Verified pro player"
                      />
                    </span>
                  )}
                  {region && <RegionPill region={region} />}
                  {claimSlot}
                  {favoriteSlot}
                  {proHandle && (
                    <span
                      title="In-game name"
                      className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
                    >
                      {name}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                  {preview?.claimed && <BrawlchemistUserBadge />}
                  {esports?.isPro && proPr && (
                    <span className="inline-flex items-center rounded-md border border-copper/40 bg-copper/10 px-1.5 py-0.5 text-copper">
                      PR #{proPr.powerRanking} {proPr.region}
                    </span>
                  )}
                  {titles.map((title) => (
                    <span
                      key={title}
                      title="Earned legend title"
                      className="inline-flex items-center rounded-md border border-tier-gold/40 bg-tier-gold/10 px-1.5 py-0.5 normal-case text-tier-gold"
                    >
                      {title}
                    </span>
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
                    {esports?.isPro && proPr && (
                      <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:flex-1">
                        <Metric
                          label="Power Rank"
                          value={`#${proPr.powerRanking}`}
                          sub={proPr.region}
                          accent="text-copper"
                        />
                      </div>
                    )}
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
  let titles: string[] = []
  if (statsRes.ok && legendsRes.ok) {
    const akaById = new Map(
      legendsRes.data.map((l) => [l.legend_id, l.bio_aka]),
    )
    titles = [...(statsRes.data.legends ?? [])]
      .filter((l) => l.level >= MAX_LEGEND_LEVEL)
      .sort((a, b) => (b.games ?? 0) - (a.games ?? 0))
      // Some legends list multiple titles ("The Unconquered Viking, The Great
      // Bear") — keep only the first.
      .map((l) => akaById.get(l.legend_id)?.split(",")[0].trim())
      .filter((t): t is string => !!t)
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
    return {
      team: t,
      teammateId,
      teammateName: row?.username || fallbackName || `Player #${teammateId}`,
      teammateSlug: row?.topLegendId ? slugForLegendId(row.topLegendId) : null,
    }
  })

  // Distinguish Valhallan from Diamond (both 2000+) via the region's live
  // ladder cutoff — 1v1 for the header, 2v2 for the team cards.
  // Only the cutoffs are left here — they need data.region (and whether the
  // player has any 2v2 teams), so they can't join the fan-out above.
  const [cut1v1, cutoff2v2] = await Promise.all([
    valhallanCutoffFor("1v1", data.region),
    teams.length > 0
      ? valhallanCutoffRating("2v2", data.region)
      : Promise.resolve(null),
  ])
  const cutoff1v1 = cut1v1?.rating ?? null
  const headerValhallan = isValhallan1v1(
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
  const showEsports = !!esports && (esports.isPro || esports.earnings > 0)
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
  // picker itself is gated to the owner inside BannerPicker.
  const { bannerId } = customization
  const bannerPicker = <BannerPicker brawlhallaId={numId} />
  // Track/untrack star — reads shared favorites state; signed-out viewers get a
  // sign-in nudge from inside the control.
  const favoriteToggle = <FavoriteToggleControl brawlhallaId={numId} />

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
      />
      {hasOneVOne ? (
        <ProfileHeader
          data={data}
          titles={titles}
          valhallan={headerValhallan}
          ladderRank={ladderRank}
          preview={preview}
          legendStats={legendStatsById}
          combined={combinedRecord}
          weapons={accountStats?.weapons ?? []}
          legendsHref={
            playedLegends.length > 0 ? `/player/${numId}?tab=legends` : null
          }
          claimSlot={<ClaimBanner brawlhallaId={numId} />}
          favoriteSlot={favoriteToggle}
          bannerId={bannerId}
          bannerSlot={bannerPicker}
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
          favoriteSlot={favoriteToggle}
          bannerId={bannerId}
          bannerSlot={bannerPicker}
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
          favoriteSlot={favoriteToggle}
          bannerId={bannerId}
          bannerSlot={bannerPicker}
        />
      )}

      {tab === "overview" && (
        <>
          {/* Account level / playtime / XP / lifetime games / guild are hidden
              pending the advanced-stats component that will own them.
              computeAccountStats still runs — the header reads its weapon
              shares — so bringing them back is a render, not a refetch. */}
          <div className="mt-6 px-4 sm:px-6">
            <div className="mx-auto max-w-[1280px]">
              <ProfileCustomization brawlhallaId={numId} />
            </div>
          </div>

          {hasOneVOne && (
            <section className="mt-8 px-4 sm:px-6">
              <div
                className={cn(
                  "mx-auto grid max-w-[1280px] grid-cols-1 gap-4",
                  overviewTeams.length > 0 && "lg:grid-cols-3",
                )}
              >
                <div className={overviewTeams.length > 0 ? "lg:col-span-2" : ""}>
                  <RatingHistoryCard
                    embedded
                    brawlhallaId={numId}
                    valhallanCutoff={cutoff1v1}
                    tier={deriveTier(data.tier, headerValhallan)}
                  />
                </div>

                {overviewTeams.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <h2 className="font-display text-lg font-semibold">
                        Top 2v2 Teams
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
                          ownerName={data.name}
                          ownerSlug={ownerSlug}
                          valhallanCutoff={cutoff2v2}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {!hasOneVOne && (
            <p className="mt-10 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
              No 1v1 ranked play this season.
            </p>
          )}

          {/* Esports used to be a tab. With the tab bar gone it renders inline
              rather than becoming unreachable — it only appears for tracked
              competitors, so for almost every profile this is nothing. */}
          {showEsports && <EsportsSection profile={esports} />}
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
                ownerName={data.name}
                ownerSlug={ownerSlug}
                valhallanCutoff={cutoff2v2}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "esports" && showEsports && <EsportsSection profile={esports} />}
    </Shell>
  )
}
