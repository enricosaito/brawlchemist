import "server-only"

/**
 * Brawltools esports API wrapper — the competitive/esports layer (tournaments,
 * power rankings, placements) that complements the Brawlhalla dev API used
 * elsewhere (see lib/brawlhalla-api.ts).
 *
 * Base URL is unversioned-per-call under /v2. The API appears keyless (no auth
 * documented) — we still cache aggressively since no rate limit is published.
 *
 * NOTE on terms: `gameMode` is an INTEGER here (1 = 1v1, 2 = 2v2), not the
 * "1v1"/"2v2" strings the dev API uses. Power-ranking regions also differ
 * (NA/EU/SA/SEA/MENA/LAN) — none of that matters for events, but don't conflate
 * them when adding more endpoints.
 *
 * Usage is "personal use only" per the docs; commercial use requires reaching
 * out to esports@brawlhalla.com. Docs: https://www.docs.brawltools.com
 */

const ORIGIN = "https://api.brawltools.com"

export type EsportsGameMode = 1 | 2

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

/** A tournament/event row from ListEvents (GET /v2/event). */
export interface Tournament {
  id: string
  /** Full descriptive name, e.g. "Spring Championship - North America 2026 - 1v1". */
  tournamentName: string
  /** Often null on the events list; populated on placement records. */
  eventName: string | null
  year: number
  isOfficial: boolean
  /** True for 2v2 events. */
  isTwos: boolean
  isOnline: boolean
  /** UNIX seconds. */
  startTime: number
  host: string
  [key: string]: unknown
}

interface ListEventsResponse {
  tournaments: Tournament[]
  nextToken: string | null
}

async function apiFetch<T>(
  path: string,
  params: Record<string, string | number | boolean>,
  revalidate: number,
): Promise<ApiResult<T>> {
  const url = new URL(`${ORIGIN}${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }
  try {
    const res = await fetch(url.toString(), { next: { revalidate } })
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Brawltools API ${res.status} ${res.statusText}`,
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

/**
 * ListEvents — most recent tournaments for a game mode. `maxResults` caps at
 * 50; `nextToken` paginates. We cache an hour: the esports calendar changes
 * slowly.
 */
export function listEvents(opts: {
  gameMode: EsportsGameMode
  year?: number
  isOfficial?: boolean
  maxResults?: number
  nextToken?: string
}): Promise<ApiResult<ListEventsResponse>> {
  const params: Record<string, string | number | boolean> = {
    gameMode: opts.gameMode,
    maxResults: opts.maxResults ?? 50,
  }
  if (opts.year != null) params.year = opts.year
  if (opts.isOfficial != null) params.isOfficial = opts.isOfficial
  if (opts.nextToken) params.nextToken = opts.nextToken
  return apiFetch<ListEventsResponse>("/v2/event", params, 3600)
}

/**
 * All of a year's tournaments across both game modes, merged + de-duped by id.
 * Returns null only if BOTH mode fetches fail (one failing still yields a
 * partial list). Sorted by startTime descending (most recent first).
 */
export async function getYearTournaments(
  year: number,
): Promise<Tournament[] | null> {
  const [ones, twos] = await Promise.all([
    listEvents({ gameMode: 1, year, maxResults: 50 }),
    listEvents({ gameMode: 2, year, maxResults: 50 }),
  ])
  if (!ones.ok && !twos.ok) return null

  const byId = new Map<string, Tournament>()
  for (const res of [ones, twos]) {
    if (res.ok) {
      for (const t of res.data.tournaments) byId.set(t.id, t)
    }
  }
  return [...byId.values()].sort((a, b) => b.startTime - a.startTime)
}

// ---- Players / power rankings ---------------------------------------------
//
// The esports profile of a Brawlhalla account. `GetPlayerByBhId` is the bridge
// from our brawlhalla_id to the esports identity; it 404s for accounts that
// have never been in a tracked tournament (regular ladder players). Socials
// (twitter/twitch) only come back from SearchPlayers, which also bundles both
// power-ranking objects + career earnings — so the cheap path is byBhId (gate +
// name) then search(name) matched on brawlhallaId.

const PLAYER_TTL = 6 * 60 * 60 // 6h — PR/earnings move slowly.

interface EsportsPlayer {
  playerId: number
  sggPlayerId?: number
  cmPlayerId?: string
  brawlhallaId: number
  name: string
  twitter?: string
  twitch?: string
  country?: string
}

/** A power-ranking record. `powerRanking` is 0 / `region` "" when unranked. */
interface RawPr {
  top8: number
  top32: number
  gold: number
  silver: number
  bronze: number
  powerRanking: number
  region: string
}

interface PlayerByBhIdResponse {
  player: EsportsPlayer
}

interface PlayerPrResponse {
  earnings: number
  pr: RawPr
}

interface SearchPlayersResponse {
  searchPlayers: {
    player: EsportsPlayer
    pr1v1: RawPr
    pr2v2: RawPr
    earnings: number
  }[]
  nextToken: string | null
}

function getPlayerByBhId(
  brawlhallaId: number,
): Promise<ApiResult<PlayerByBhIdResponse>> {
  return apiFetch<PlayerByBhIdResponse>(
    `/v2/player/bhId/${brawlhallaId}`,
    {},
    PLAYER_TTL,
  )
}

function getPlayerPr(
  playerId: number,
  gameMode: EsportsGameMode,
): Promise<ApiResult<PlayerPrResponse>> {
  return apiFetch<PlayerPrResponse>(
    "/v2/player/pr",
    { playerIds: playerId, gameMode },
    PLAYER_TTL,
  )
}

function searchPlayers(
  query: string,
): Promise<ApiResult<SearchPlayersResponse>> {
  return apiFetch<SearchPlayersResponse>(
    "/v2/player/search",
    { query },
    PLAYER_TTL,
  )
}

/** A power ranking we actually surface — null means the player isn't ranked
 * in that mode (powerRanking 0). */
export interface EsportsPr {
  region: string
  powerRanking: number
  top8: number
  top32: number
  gold: number
  silver: number
  bronze: number
}

function normalizePr(raw: RawPr | null | undefined): EsportsPr | null {
  if (!raw || !raw.powerRanking || raw.powerRanking <= 0) return null
  return {
    region: raw.region,
    powerRanking: raw.powerRanking,
    top8: raw.top8,
    top32: raw.top32,
    gold: raw.gold,
    silver: raw.silver,
    bronze: raw.bronze,
  }
}

/** Unified esports profile for a brawlhalla_id. `isPro` is true when the player
 * holds an official power ranking in either mode (our definition of "pro"). */
export interface EsportsProfile {
  brawlhallaId: number
  handle: string
  twitter: string | null
  twitch: string | null
  country: string | null
  earnings: number
  pr1v1: EsportsPr | null
  pr2v2: EsportsPr | null
  isPro: boolean
}

/**
 * Resolve a brawlhalla_id to its esports profile, or null when the account
 * isn't a tracked competitor (byBhId 404). Primary path: search(name) matched
 * on brawlhallaId (one call carries socials + both PRs + earnings); falls back
 * to per-mode PR lookups (no socials) if search doesn't surface them.
 */
export async function getEsportsProfile(
  brawlhallaId: number,
): Promise<EsportsProfile | null> {
  const idRes = await getPlayerByBhId(brawlhallaId)
  if (!idRes.ok) return null // 404 = not in the esports database

  const base = idRes.data.player
  let player: EsportsPlayer = base
  let rawPr1: RawPr | null = null
  let rawPr2: RawPr | null = null
  let earnings = 0

  const searchRes = await searchPlayers(base.name)
  const match = searchRes.ok
    ? searchRes.data.searchPlayers.find(
        (s) => s.player.brawlhallaId === brawlhallaId,
      )
    : undefined

  if (match) {
    player = match.player
    rawPr1 = match.pr1v1
    rawPr2 = match.pr2v2
    earnings = match.earnings ?? 0
  } else {
    const [r1, r2] = await Promise.all([
      getPlayerPr(base.playerId, 1),
      getPlayerPr(base.playerId, 2),
    ])
    if (r1.ok) {
      rawPr1 = r1.data.pr
      earnings = r1.data.earnings ?? earnings
    }
    if (r2.ok) {
      rawPr2 = r2.data.pr
      earnings = r2.data.earnings || earnings
    }
  }

  const pr1v1 = normalizePr(rawPr1)
  const pr2v2 = normalizePr(rawPr2)
  return {
    brawlhallaId,
    handle: player.name,
    twitter: player.twitter || null,
    twitch: player.twitch || null,
    country: player.country || null,
    earnings,
    pr1v1,
    pr2v2,
    isPro: !!pr1v1 || !!pr2v2,
  }
}

export interface TournamentsSplit {
  /** null only when the upstream API was unreachable (vs. an empty list). */
  tournaments: Tournament[] | null
  /** startTime >= now, soonest first. */
  upcoming: Tournament[]
  /** startTime < now, most recent first. */
  recent: Tournament[]
  year: number
}

/**
 * A year's tournaments split into upcoming vs. recent. The current time is read
 * here (a plain module function) rather than in the page render. Defaults to
 * the current year.
 */
export async function getTournamentsSplit(
  year?: number,
): Promise<TournamentsSplit> {
  const y = year ?? new Date().getFullYear()
  const tournaments = await getYearTournaments(y)
  const now = Math.floor(Date.now() / 1000)
  const list = tournaments ?? []
  const upcoming = list
    .filter((t) => t.startTime >= now)
    .sort((a, b) => a.startTime - b.startTime)
  const recent = list
    .filter((t) => t.startTime < now)
    .sort((a, b) => b.startTime - a.startTime)
  return { tournaments, upcoming, recent, year: y }
}
