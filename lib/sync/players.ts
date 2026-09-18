import "server-only"

import { eq, ilike, inArray, sql } from "drizzle-orm"
import {
  getPlayerRanked,
  type PlayerRanked,
  type PlayerRankedLegend,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { liveRanked, players, type PlayerRow } from "@/lib/db/schema"
import { maybeInsertSnapshot } from "@/lib/sync/snapshots"
import { repairJson } from "@/lib/text"

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function topRankedLegendId(legends: PlayerRankedLegend[]): number | null {
  const played = legends.filter(
    (l) => typeof l.games === "number" && l.games > 0,
  )
  if (played.length === 0) return null
  played.sort((a, b) => b.games - a.games)
  return played[0].legend_id
}

function isFresh(row: PlayerRow, ttlMs: number): boolean {
  return Date.now() - row.lastSynced.getTime() < ttlMs
}

/**
 * Upsert an already-fetched GetPlayerRanked payload into the players table.
 * Shared by the background sync and the profile page (which fetches the live
 * payload anyway, so it can populate the pool for free on every view).
 */
export async function upsertPlayerRanked(ranked: PlayerRanked): Promise<void> {
  const topLegendId = topRankedLegendId(ranked.legends ?? [])
  // Denormalised so search can order by an indexed int instead of a
  // ranked_json expression — see the column comment in schema.ts.
  const rating = typeof ranked.rating === "number" ? ranked.rating : null
  await db()
    .insert(players)
    .values({
      brawlhallaId: ranked.brawlhalla_id,
      username: ranked.name,
      topLegendId,
      rating,
      rankedJson: ranked,
      lastSynced: new Date(),
    })
    .onConflictDoUpdate({
      target: players.brawlhallaId,
      set: {
        username: ranked.name,
        topLegendId,
        rating,
        rankedJson: ranked,
        lastSynced: new Date(),
      },
    })

  // Rating-history snapshot — every fresh /ranked payload flows through here
  // (profile views + both sync crons), so this is the one place history is
  // recorded. Best-effort: never fail the upsert (page render / cron tick).
  try {
    await maybeInsertSnapshot(ranked)
  } catch (err) {
    console.error("[players] snapshot insert failed:", err)
  }
}

/**
 * Record that we asked the API about this player and it had nothing.
 *
 * `/player/{id}/ranked` answers 200 for a player who has never played ranked,
 * with `name: ""`, `rating: 0`, `tier: "none"`. That is a real answer, but
 * `upsertPlayerRanked` is gated on a non-empty name, so nothing was ever
 * stored and the next view asked again — measured at 1,237 upstream calls in
 * 24h across 823 such players, several of them fetched ten times a day, for
 * an answer that cannot change until they play a ranked match.
 *
 * Deliberately NOT the full payload: those responses are 4-13 KB of empty
 * `legends` array, and `players` is already the largest table in the database.
 * A row with a null `ranked_json` and a fresh `last_synced` carries the whole
 * message — see the unranked branch in loadRanked, which reads exactly that.
 *
 * Only the timestamp is written on conflict. A row that already holds a real
 * payload keeps it: the API answering "none" for a player we have data for is
 * a season reset or a blip, not a reason to erase them.
 */
export async function recordUnrankedPlayer(brawlhallaId: number): Promise<void> {
  const now = new Date()
  await db()
    .insert(players)
    .values({ brawlhallaId, username: "", lastSynced: now })
    .onConflictDoUpdate({
      target: players.brawlhallaId,
      set: { lastSynced: now },
    })
}

export interface SyncOutcome {
  status: "synced" | "fresh" | "failed"
  brawlhallaId: number
  error?: string
}

/**
 * Fetch GetPlayerRanked and upsert. Returns `fresh` (no API call made) when
 * the existing row was synced within `ttlMs`, `synced` on successful upsert,
 * or `failed` if the API call errored.
 */
export async function syncPlayer(
  brawlhallaId: number,
  opts: { ttlMs?: number; force?: boolean } = {},
): Promise<SyncOutcome> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS

  if (!opts.force) {
    const existing = await db()
      .select()
      .from(players)
      .where(eq(players.brawlhallaId, brawlhallaId))
      .limit(1)
    if (existing[0] && isFresh(existing[0], ttlMs)) {
      return { status: "fresh", brawlhallaId }
    }
  }

  const result = await getPlayerRanked(brawlhallaId)
  if (!result.ok) {
    return { status: "failed", brawlhallaId, error: result.error }
  }

  await upsertPlayerRanked(result.data)

  return { status: "synced", brawlhallaId }
}

/**
 * Sync many players with a small inter-request delay to stay polite to the
 * Brawlhalla rate limit (180 req / 15 min ≈ 12 req/min). 5 seconds between
 * calls = ~12/min sustained, but most calls short-circuit on `fresh`.
 */
export async function syncManyPlayers(
  ids: number[],
  opts: { ttlMs?: number; delayMs?: number; force?: boolean } = {},
): Promise<SyncOutcome[]> {
  const delayMs = opts.delayMs ?? 5000
  const outcomes: SyncOutcome[] = []
  for (let i = 0; i < ids.length; i++) {
    const outcome = await syncPlayer(ids[i], {
      ttlMs: opts.ttlMs,
      force: opts.force,
    })
    outcomes.push(outcome)
    // Only pay the rate-limit delay when we actually hit the API.
    if (outcome.status === "synced" && i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return outcomes
}

/**
 * Search the local player pool by username (case-insensitive substring).
 *
 * The Brawlhalla API has no name-search endpoint, so this only finds players
 * we've already synced — via leaderboard/OTP enrichment or someone viewing
 * their profile. Ranked higher-rating first so the strongest matches lead.
 */
export async function searchPlayersByUsername(
  query: string,
  limit = 20,
): Promise<PlayerRow[]> {
  const q = query.trim()
  if (!q) return []
  const rows = await db()
    .select({
      ...PLAYER_SCALAR_COLUMNS,
      // The region too, so a matched row carries it without the whole
      // ranked_json blob crossing the wire. Evaluated for the returned rows
      // only — never in the ORDER BY (see below).
      region: REGION_FROM_RANKED,
    })
    .from(players)
    .where(ilike(players.username, `%${q}%`))
    // Order by the bare indexed column. Wrapping it in coalesce() with the
    // old ladder_rating column looked harmless but made players_rating_idx
    // unusable, and a two-character query went from 0.4s to 15s because
    // Postgres had to sort every ILIKE match instead of walking the index and
    // stopping at 8.
    .orderBy(sql`${players.rating} desc nulls last`)
    .limit(limit)
  return rows.map((r) => ({ ...r, rankedJson: null }) as PlayerRow)
}

// Every players column except the heavy `ranked_json` blob. Selecting these
// alone (rankedJson synthesized as null) serves callers that only need the
// scalar fields — username, top legend, ladder snapshot — without dragging the
// full ranked payload over the wire.
/**
 * A player's region.
 *
 * Straight out of the stored ranked payload, which is the only place it has
 * ever actually been: the `ladder_region` column that used to be coalesced in
 * front of this held 0 non-null values across 97,325 rows and is gone.
 *
 * Opt-in rather than folded into PLAYER_SCALAR_COLUMNS, because reading it
 * detoasts ranked_json per row: harmless for the 120 ids /favorites and the
 * suggestions pass (measured 106ms, 830 buffers, index scan on the primary
 * key), and exactly the wrong thing to do to a leaderboard render that asks
 * for 500. The extracted string is all that crosses the wire either way — the
 * cost is server-side detoast, not egress.
 */
const REGION_FROM_RANKED = sql<
  string | null
>`${players.rankedJson}->>'region'`

const PLAYER_SCALAR_COLUMNS = {
  brawlhallaId: players.brawlhallaId,
  username: players.username,
  topLegendId: players.topLegendId,
  // The denormalised season rating, plain. This used to be
  // coalesce(rating, ladder_rating) against a column that was null for every
  // row in the table; the coalesce is gone with it.
  rating: players.rating,
  // Cheap inline ints, and the two facts the possible-smurf reading needs
  // (lib/profile/smurf.ts). Included so this projection is what its name says
  // — every scalar column — which is what makes the `as PlayerRow` casts below
  // true rather than merely unchecked.
  level: players.level,
  playtimeSeconds: players.playtimeSeconds,
  statsSynced: players.statsSynced,
  guildId: players.guildId,
  guildName: players.guildName,
  guildCheckedAt: players.guildCheckedAt,
  lastSynced: players.lastSynced,
}

/**
 * Bulk-load cached rows for a list of brawlhalla IDs. Used to enrich rankings
 * and teammate cards without ever calling the upstream API.
 *
 * `includeRankedJson` (default true) controls whether the full `ranked_json`
 * payload is pulled. List/teammate views that only render the main legend pass
 * `false` to skip the blob — `ranked_json` is the single biggest column in the
 * table, so omitting it on those hot, high-fan-out paths is most of the DB
 * egress win. Callers that read legends (best-legends columns, podiums) keep
 * the default.
 */
export async function getPlayersByIds(
  ids: number[],
  opts: { includeRankedJson?: boolean; withRegion?: boolean } = {},
): Promise<Map<number, PlayerRow>> {
  if (ids.length === 0) return new Map()
  const includeRankedJson = opts.includeRankedJson ?? true
  const rows = await db()
    .select(
      includeRankedJson
        ? { ...PLAYER_SCALAR_COLUMNS, rankedJson: players.rankedJson }
        : opts.withRegion
          ? { ...PLAYER_SCALAR_COLUMNS, region: REGION_FROM_RANKED }
          : PLAYER_SCALAR_COLUMNS,
    )
    .from(players)
    .where(inArray(players.brawlhallaId, ids))
  return new Map(
    rows.map((r) => [
      r.brawlhallaId,
      ("rankedJson" in r
        ? { ...r, rankedJson: repairJson(r.rankedJson) }
        : { ...r, rankedJson: null }) as PlayerRow,
    ]),
  )
}

export interface PlayerSyncState {
  lastSynced: Date
  /** Whether a stored GetPlayerRanked payload exists (name-only rows have none). */
  hasRankedJson: boolean
  /** Stored guild, so the profile doesn't re-ask the API on every view. */
  guildId: number | null
  guildName: string | null
  guildCheckedAt: Date | null
  /**
   * When the live ladder last saw this player finish a 1v1 match, if they're in
   * the tracked top-N. Drives the freshness window: someone mid-session has
   * genuinely moving ELO, someone who hasn't played in days does not.
   */
  liveActiveAt: Date | null
}

/**
 * Freshness probe for the profile read-through, WITHOUT the payload.
 *
 * `ranked_json` averages ~6.3 KB on the wire, and the profile page used to
 * fetch the whole blob just to compare `last_synced` against a 15-minute
 * window — so every view that turned out to be stale paid for 6.3 KB it then
 * threw away in favour of a live API call. Across 1.2M profile views that read
 * was the second-largest source of Supabase egress. Probe first, fetch the
 * payload only when we're actually going to render it.
 */
export async function getPlayerSyncState(
  brawlhallaId: number,
): Promise<PlayerSyncState | null> {
  // One round trip for everything the read-through needs to decide: both sides
  // are primary-key lookups, so the join is free, and it saves the profile page
  // from issuing separate queries for guild and live-activity.
  const [row] = await db()
    .select({
      lastSynced: players.lastSynced,
      hasRankedJson: sql<boolean>`${players.rankedJson} is not null`,
      guildId: players.guildId,
      guildName: players.guildName,
      guildCheckedAt: players.guildCheckedAt,
      liveActiveAt: liveRanked.lastActiveAt,
    })
    .from(players)
    .leftJoin(liveRanked, eq(liveRanked.id, sql`'1v1:' || ${players.brawlhallaId}`))
    .where(eq(players.brawlhallaId, brawlhallaId))
    .limit(1)
  return row ?? null
}

/**
 * The stored GetPlayerRanked payload for one player, or null.
 *
 * Repaired on the way out (see constraint #7): `repairJson` in `apiFetch` only
 * cleans payloads arriving fresh from upstream, but this blob may have been
 * written before that landed, and the profile page serves it whenever the row
 * is fresh, the visitor is a crawler, or upstream 429s. Without the repair here
 * an accented name renders mangled on exactly the paths that avoid the API.
 * Rows self-heal on their next sync; this covers them until then, for free —
 * `repairJson` short-circuits on the telltale byte pattern and returns the
 * input untouched when there's nothing to fix, which is the overwhelming case.
 */
export async function getPlayerRankedJson(
  brawlhallaId: number,
): Promise<PlayerRanked | null> {
  const [row] = await db()
    .select({ rankedJson: players.rankedJson })
    .from(players)
    .where(eq(players.brawlhallaId, brawlhallaId))
    .limit(1)
  return repairJson((row?.rankedJson as PlayerRanked | null) ?? null)
}

export interface PlayerSuggestion {
  id: number
  username: string
  topLegendId: number | null
  rating: number | null
  region: string | null
}

/**
 * Username typeahead suggestions. Same matching/ordering as
 * searchPlayersByUsername, but projects only the five fields the dropdown
 * renders — rating/region are pulled straight out of `ranked_json` as scalars
 * instead of returning the whole payload per row, which the live (per-keystroke)
 * dropdown was doing.
 */
export async function searchPlayerSuggestions(
  query: string,
  limit = 8,
): Promise<PlayerSuggestion[]> {
  const q = query.trim()
  if (!q) return []
  return db()
    .select({
      id: players.brawlhallaId,
      username: players.username,
      topLegendId: players.topLegendId,
      rating: players.rating,
      region: REGION_FROM_RANKED,
    })
    .from(players)
    .where(ilike(players.username, `%${q}%`))
    // See searchPlayersByUsername — bare indexed column, no coalesce.
    .orderBy(sql`${players.rating} desc nulls last`)
    .limit(limit)
}

/**
 * The same suggestion shape, fetched by id.
 *
 * Exists because pro-handle search resolves its matches to ids out of the
 * cached profiles map and then needs rows for them. `getPlayersByIds` can't
 * serve this: its scalar projection once returned the raw `ladder_rating`
 * column, which nothing populated, so every pro hit rendered without an ELO.
 * That column is gone; both paths project the denormalised `rating`.
 */
export async function getPlayerSuggestionsByIds(
  ids: number[],
): Promise<PlayerSuggestion[]> {
  if (ids.length === 0) return []
  return db()
    .select({
      id: players.brawlhallaId,
      username: players.username,
      topLegendId: players.topLegendId,
      rating: players.rating,
      region: REGION_FROM_RANKED,
    })
    .from(players)
    .where(inArray(players.brawlhallaId, ids))
    .orderBy(sql`${players.rating} desc nulls last`)
}
