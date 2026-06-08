import "server-only"

import { unstable_cache } from "next/cache"

/**
 * Challengermode public API — enriches brawltools events with what that API
 * lacks: the public tournament page URL, banner/thumbnail art, and attendance.
 * brawltools events with host "CM" use the SAME id as Challengermode's
 * tournamentId (verified: GET /v2/event id → tournament(tournamentId:) hit),
 * so enrichment is a direct lookup.
 *
 * Auth: a refresh key (env CHALLENGERMODE_REFRESH_KEY) is exchanged for a
 * ~1h bearer token. The token is memoized module-level with single-flight so
 * a cold page render with 40 parallel enrichments doesn't hammer the auth
 * endpoint. GraphQL goes over POST, which Next's fetch cache won't store —
 * results are cached via unstable_cache instead.
 */

const AUTH_URL = "https://publicapi.challengermode.com/mk1/v1/auth/access_keys"
const GRAPHQL_URL = "https://publicapi.challengermode.com/graphql"

/** Refresh the token 5 minutes before it actually expires. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000
/** Completed tournaments never change; upcoming ones only move slowly. */
const TOURNAMENT_TTL_SECONDS = 6 * 60 * 60

type CachedToken = { value: string; expiresAtMs: number }
let tokenPromise: Promise<CachedToken | null> | null = null

async function fetchToken(): Promise<CachedToken | null> {
  const refreshKey = process.env.CHALLENGERMODE_REFRESH_KEY
  if (!refreshKey) return null
  try {
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshKey }),
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { value: string; expiresAt: string }
    return { value: data.value, expiresAtMs: Date.parse(data.expiresAt) }
  } catch {
    return null
  }
}

async function getToken(): Promise<string | null> {
  if (tokenPromise) {
    const cached = await tokenPromise
    if (cached && Date.now() < cached.expiresAtMs - TOKEN_MARGIN_MS) {
      return cached.value
    }
  }
  tokenPromise = fetchToken()
  const fresh = await tokenPromise
  return fresh?.value ?? null
}

export interface CmTournament {
  /** Public tournament page on challengermode.com. */
  url: string
  thumbnailUrl: string | null
  bannerUrl: string | null
  /** Confirmed lineups (players/teams that actually showed). */
  players: number | null
  /** e.g. "COMPLETED", "IN_PROGRESS", "REGISTRATION_OPEN". */
  state: string | null
}

const TOURNAMENT_QUERY = `query($id: UUID!) {
  tournament(tournamentId: $id) {
    state
    links {
      overviewUrl
      thumbnail(size: MEDIUM) { url }
      banner(size: MEDIUM) { url }
    }
    attendance { confirmedLineupCount }
  }
}`

interface TournamentResponse {
  data?: {
    tournament?: {
      state: string | null
      links: {
        overviewUrl: string
        thumbnail: { url: string } | null
        banner: { url: string } | null
      }
      attendance: { confirmedLineupCount: number } | null
    } | null
  }
}

async function fetchCmTournament(id: string): Promise<CmTournament | null> {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: TOURNAMENT_QUERY, variables: { id } }),
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as TournamentResponse
    const t = json.data?.tournament
    if (!t) return null
    return {
      url: t.links.overviewUrl,
      thumbnailUrl: t.links.thumbnail?.url ?? null,
      bannerUrl: t.links.banner?.url ?? null,
      players: t.attendance?.confirmedLineupCount ?? null,
      state: t.state ?? null,
    }
  } catch {
    return null
  }
}

/** One tournament's CM enrichment, cached 6h per id. Null when the id isn't a
 * CM tournament, the API is unreachable, or no key is configured — callers
 * fail open to the plain card. */
export const getCmTournament = unstable_cache(
  fetchCmTournament,
  ["cm-tournament"],
  { revalidate: TOURNAMENT_TTL_SECONDS },
)

/** Batch enrichment for the tournaments page — only host "CM" events qualify
 * (their brawltools id IS the CM tournamentId; SGG-hosted history isn't on
 * Challengermode). */
export async function getCmTournaments(
  ids: string[],
): Promise<Map<string, CmTournament>> {
  const entries = await Promise.all(
    ids.map(async (id) => [id, await getCmTournament(id)] as const),
  )
  const map = new Map<string, CmTournament>()
  for (const [id, t] of entries) {
    if (t) map.set(id, t)
  }
  return map
}
