import "server-only"

/**
 * Brawlhalla public API wrapper.
 *
 * The API key lives in BRAWLHALLA_API_KEY and is only ever read inside this
 * module. The "server-only" import above will trip a build error if anything
 * client-side ever tries to import this file.
 *
 * Note: the API mixes versioned and unversioned routes. `/v1/leaderboard/ranked`
 * uses /v1/, but `/player/{id}/stats` and `/legend/all/` do not. We embed the
 * prefix per endpoint rather than centralizing it.
 *
 * Docs: https://dev.brawlhalla.com/
 */

const ORIGIN = "https://api.brawlhalla.com"

export type ApiGameMode = "1v1" | "2v2" | "3v3"

export const API_REGIONS = [
  "ALL",
  "BRZ",
  "US-E",
  "US-W",
  "EU",
  "SEA",
  "AUS",
  "JPS",
  "SA",
  "ME",
] as const
export type ApiRegion = (typeof API_REGIONS)[number]

export function isApiRegion(value: string): value is ApiRegion {
  return (API_REGIONS as readonly string[]).includes(value)
}

export interface RankedPlayer {
  id: number
  username: string
}

export interface RankedEntry {
  players: RankedPlayer[]
  /** Per docs: rating/best_rating/wins/losses can come back null if inaccessible. */
  best_rating: number | null
  rank: number
  rating: number | null
  wins: number | null
  losses: number | null
  region: string | null
  tier: string | null
}

export interface RankedLeaderboard {
  rankings: RankedEntry[]
  total_pages: number
}

/**
 * GetPlayerRanked response — per-player ranked-season stats. Only the fields
 * we surface are typed; the rest of the payload (2v2 teams, peak ratings, per-
 * legend tier strings, etc.) stays as `unknown` and is persisted as jsonb so
 * we don't have to chase the API's occasionally-renamed fields.
 */
export interface PlayerRankedLegend {
  legend_id: number
  legend_name_key: string
  games: number
  wins: number
  rating: number
  peak_rating: number
  tier: string
  [key: string]: unknown
}

/** A 2v2 team row from GetPlayerRanked. `region` here is a numeric id (not the
 * string region used at the top level), so we leave it untyped/undisplayed. */
export interface PlayerRanked2v2 {
  brawlhalla_id_one: number
  brawlhalla_id_two: number
  rating: number
  peak_rating: number
  tier: string
  wins: number
  games: number
  teamname: string
  global_rank?: number
  [key: string]: unknown
}

export interface PlayerRanked {
  brawlhalla_id: number
  name: string
  region: string
  tier: string
  rating: number
  peak_rating: number
  games: number
  wins: number
  global_rank?: number
  region_rank?: number
  legends: PlayerRankedLegend[]
  "2v2"?: PlayerRanked2v2[]
  [key: string]: unknown
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

function apiKeyOrError<T>(): ApiResult<T> | string {
  const apiKey = process.env.BRAWLHALLA_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      error:
        "BRAWLHALLA_API_KEY is not set. Add it to .env.local (and to Vercel project env for production).",
    }
  }
  return apiKey
}

async function apiFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate: number,
): Promise<ApiResult<T>> {
  const apiKey = apiKeyOrError<T>()
  if (typeof apiKey !== "string") return apiKey

  const url = new URL(`${ORIGIN}${path}`)
  url.searchParams.set("api_key", apiKey)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  try {
    const res = await fetch(url.toString(), { next: { revalidate } })
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Brawlhalla API ${res.status} ${res.statusText}`,
      }
    }
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    }
  }
}

export function getRankedLeaderboard(opts: {
  gameMode: ApiGameMode
  region: ApiRegion
  page?: number
  maxResults?: number
}): Promise<ApiResult<RankedLeaderboard>> {
  return apiFetch<RankedLeaderboard>(
    "/v1/leaderboard/ranked",
    {
      game_mode: opts.gameMode,
      region: opts.region,
      page: opts.page ?? 1,
      max_results: opts.maxResults ?? 30,
    },
    300, // 5 min
  )
}

export function getPlayerRanked(
  brawlhallaId: number,
): Promise<ApiResult<PlayerRanked>> {
  // We bypass the fetch cache here: the sync layer decides freshness via the
  // DB's last_synced column, not the HTTP layer.
  return apiFetch<PlayerRanked>(`/player/${brawlhallaId}/ranked`, {}, 0)
}

/**
 * SearchPlayerBySteamId response — maps a steamID64 to a Brawlhalla account.
 * `name` can come back as an empty string for accounts without a display name.
 */
export interface PlayerSearchResult {
  brawlhalla_id: number
  name: string
}

export function searchPlayerBySteamId(
  steamId: string,
): Promise<ApiResult<PlayerSearchResult>> {
  // Steam→Brawlhalla mappings are stable; cache for a day to spare the API.
  return apiFetch<PlayerSearchResult>(
    "/search",
    { steamid: steamId },
    60 * 60 * 24,
  )
}

export interface LegendSummary {
  legend_id: number
  legend_name_key: string
  bio_name: string
}

export function getAllLegends(): Promise<ApiResult<LegendSummary[]>> {
  return apiFetch<LegendSummary[]>("/legend/all/", {}, 60 * 60 * 24 * 7) // 1 week
}

/**
 * GetPlayerStats — lifetime stats. We only type what we surface (per-legend
 * `level`, used to award legend titles); the rest stays loosely typed.
 */
export interface PlayerStatsLegend {
  legend_id: number
  legend_name_key: string
  level: number
  xp: number
  games: number
  wins: number
  /** Seconds played on this legend (all modes). */
  matchtime: number
  /** Seconds the legend's first/second weapon was held — used to rank a
   * player's most-used weapons. */
  timeheldweaponone: number
  timeheldweapontwo: number
  [key: string]: unknown
}

/** A player's clan/guild, embedded in GetPlayerStats. `clan_id` matches the
 * guild id used by the v1 guild endpoints. */
export interface PlayerStatsClan {
  clan_id: number
  clan_name: string
  [key: string]: unknown
}

export interface PlayerStats {
  brawlhalla_id: number
  name: string
  /** Account level and lifetime XP / record (all modes). */
  level: number
  xp: number
  games: number
  wins: number
  clan?: PlayerStatsClan
  legends: PlayerStatsLegend[]
  [key: string]: unknown
}

export function getPlayerStats(
  brawlhallaId: number,
): Promise<ApiResult<PlayerStats>> {
  // Lifetime levels move slowly — an hour of caching spares the API.
  return apiFetch<PlayerStats>(`/player/${brawlhallaId}/stats`, {}, 60 * 60)
}

/** Static legend metadata, incl. `bio_aka` (the "title", e.g. "The Minotaur"). */
export interface StaticLegend {
  legend_id: number
  legend_name: string
  bio_name: string
  bio_aka: string
  weapon_one: string
  weapon_two: string
  [key: string]: unknown
}

interface StaticLegendsResponse {
  legends: StaticLegend[]
  total_pages: number
}

export async function getStaticLegends(): Promise<ApiResult<StaticLegend[]>> {
  // 100 = the endpoint's max page size; the roster fits on one page.
  const res = await apiFetch<StaticLegendsResponse>(
    "/v1/static/legends",
    { page: 1, max_results: 100 },
    60 * 60 * 24 * 7, // 1 week — static data
  )
  if (!res.ok) return res
  return { ok: true, data: res.data.legends ?? [] }
}

// ---- Guilds (v1) -----------------------------------------------------------
//
// The API has no "list guilds" endpoint — only fetch-by-id (GetGuildStats,
// GetGuildMembers) and player→guild lookup (GetPlayerGuild). The guild
// leaderboard is therefore built from a discovered pool (see lib/sync/guilds).
// The deprecated v0 /clan endpoint uses a *different* id space and fewer
// fields, so we stay entirely on v1.

/**
 * A guild member from GetGuildStats/GetGuildMembers. `rank` here is the
 * in-guild ROLE ("Leader" | "Officer" | "Member"), not a numeric rank.
 */
export interface GuildMember {
  brawlhalla_id: number
  name: string
  rank: string
  join_date: number
  xp: number
  guild_points: number
}

/**
 * GetGuildStats response. `rank` (global guild rank) and `member_count` are
 * optional per docs. The full payload is persisted as jsonb, so anything we
 * don't type here is still kept.
 */
export interface Guild {
  guild_id: number
  name: string
  create_date: number
  xp: number
  legacy_xp: number
  notice: string
  tags: string[]
  discord_invite_code: string
  guild_points: number
  rank?: number
  is_recruiting: boolean
  member_count?: number
  [key: string]: unknown
}

/** GetGuildMembers response. */
export interface GuildMembersResponse {
  guild_id: number
  guild_members: GuildMember[]
}

/** A player's guild standing, from GetPlayerGuild. */
export interface PlayerGuild {
  guild_id: number
  guild_name: string
  personal_xp: number
  personal_xp_this_week: number
  personal_points: number
  join_date: number
  rank: string
}

/** GetPlayerGuild response — `guild` is absent/null when the player has none. */
export interface PlayerGuildResponse {
  brawlhalla_id: number
  guild?: PlayerGuild | null
}

export function getGuildStats(guildId: number): Promise<ApiResult<Guild>> {
  return apiFetch<Guild>("/v1/guild/stats", { guild_id: guildId }, 300)
}

export function getGuildMembers(
  guildId: number,
): Promise<ApiResult<GuildMembersResponse>> {
  return apiFetch<GuildMembersResponse>(
    "/v1/guild/members",
    { guild_id: guildId },
    300,
  )
}

export function getPlayerGuild(
  brawlhallaId: number,
): Promise<ApiResult<PlayerGuildResponse>> {
  // Freshness is gated by the DB's guild_checked_at, not the HTTP layer.
  return apiFetch<PlayerGuildResponse>(
    "/v1/player/guild",
    { brawlhalla_id: brawlhallaId },
    0,
  )
}
