import "server-only"

import { unstable_cache } from "next/cache"
import { desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import {
  getGuildMembers,
  getGuildStats,
  getPlayerGuild,
  type Guild,
  type GuildMember,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { guilds, players, type GuildRow } from "@/lib/db/schema"

/**
 * Guild pool + discovery.
 *
 * The Brawlhalla API can't enumerate guilds, so the `guilds` table is built by
 * walking our player pool: GetPlayerGuild tells us a player's guild id, then
 * GetGuildStats/GetGuildMembers fill in the guild. The leaderboard reads the
 * table ordered by the API's official `rank`, so even a partial pool is
 * correctly ordered. Reads are cached under one tag; the discovery cron and
 * profile views keep it fresh.
 */
const TAG = "guilds"
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000 // guild stats move slowly
// Re-confirm a player's guild membership about weekly.
const GUILD_RECHECK_MS = 7 * 24 * 60 * 60 * 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isFresh(row: GuildRow, ttlMs: number): boolean {
  return Date.now() - row.lastSynced.getTime() < ttlMs
}

/**
 * GetGuildMembers is flaky — it frequently 500s, especially for large guilds.
 * Retry a couple of times before giving up; returns undefined when we still
 * can't get the list (callers keep the last-known snapshot).
 */
export async function fetchGuildMembers(
  guildId: number,
  attempts = 3,
): Promise<GuildMember[] | undefined> {
  for (let i = 0; i < attempts; i++) {
    const m = await getGuildMembers(guildId)
    if (m.ok) return m.data.guild_members ?? []
    if (i < attempts - 1) await sleep(800)
  }
  return undefined
}

/** Upsert a GetGuildStats payload (+ optional member snapshot) into guilds. */
export async function upsertGuild(
  stats: Guild,
  members?: GuildMember[],
): Promise<void> {
  const base = {
    name: stats.name,
    rank: stats.rank ?? null,
    xp: stats.xp ?? null,
    legacyXp: stats.legacy_xp ?? null,
    guildPoints: stats.guild_points ?? null,
    memberCount: stats.member_count ?? members?.length ?? null,
    createDate: stats.create_date ?? null,
    tags: Array.isArray(stats.tags) ? stats.tags : [],
    isRecruiting: stats.is_recruiting ?? null,
    notice: stats.notice ?? null,
    discordInviteCode: stats.discord_invite_code ?? null,
    statsJson: stats as unknown,
    lastSynced: new Date(),
  }
  // Only touch members_json when we actually fetched members, so a stats-only
  // refresh doesn't wipe an existing snapshot.
  const withMembers =
    members !== undefined ? { ...base, membersJson: members } : base

  await db()
    .insert(guilds)
    .values({ guildId: stats.guild_id, ...withMembers })
    .onConflictDoUpdate({ target: guilds.guildId, set: withMembers })
}

/**
 * Fetch a guild's stats (+ members unless disabled) and upsert. TTL-gated:
 * returns "fresh" without an API call when the row is recent. Up to 2 API
 * calls when it does sync.
 */
export async function syncGuild(
  guildId: number,
  opts: { ttlMs?: number; force?: boolean; withMembers?: boolean } = {},
): Promise<"synced" | "fresh" | "failed"> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  if (!opts.force) {
    const [existing] = await db()
      .select()
      .from(guilds)
      .where(eq(guilds.guildId, guildId))
      .limit(1)
    if (existing && isFresh(existing, ttlMs)) return "fresh"
  }

  const stats = await getGuildStats(guildId)
  if (!stats.ok) return "failed"

  const members =
    opts.withMembers === false ? undefined : await fetchGuildMembers(guildId)

  await upsertGuild(stats.data, members)
  return "synced"
}

/** Record a player's guild (from GetPlayerGuild) on their players row. */
export async function recordPlayerGuild(
  brawlhallaId: number,
  guild: { guild_id: number; guild_name: string } | null | undefined,
): Promise<void> {
  await db()
    .update(players)
    .set({
      guildId: guild?.guild_id ?? null,
      guildName: guild?.guild_name ?? null,
      guildCheckedAt: new Date(),
    })
    .where(eq(players.brawlhallaId, brawlhallaId))
}

/** Top-rated players whose guild we haven't checked recently (or ever). */
export async function playersNeedingGuildCheck(limit: number): Promise<number[]> {
  const cutoff = new Date(Date.now() - GUILD_RECHECK_MS)
  const rows = await db()
    .select({ id: players.brawlhallaId })
    .from(players)
    .where(
      or(
        isNull(players.guildCheckedAt),
        lt(players.guildCheckedAt, cutoff),
      ),
    )
    .orderBy(sql`(${players.rankedJson}->>'rating')::int desc nulls last`)
    .limit(limit)
  return rows.map((r) => r.id)
}

export interface GuildDiscoverySummary {
  playersChecked: number
  guildsFound: number
  guildsSynced: number
  guildsFresh: number
  guildsFailed: number
}

/**
 * One discovery pass: check up to `playerLimit` top-rated players' guilds, then
 * sync each newly-seen guild. Throttled (default 5s between live calls) to stay
 * within the Brawlhalla rate limit. Sized by the caller to fit the cron window.
 */
export async function discoverAndSyncGuilds(opts: {
  playerLimit: number
  throttleMs?: number
  force?: boolean
}): Promise<GuildDiscoverySummary> {
  const throttleMs = opts.throttleMs ?? 5000
  const ids = await playersNeedingGuildCheck(opts.playerLimit)

  const guildIds = new Set<number>()
  for (let i = 0; i < ids.length; i++) {
    const res = await getPlayerGuild(ids[i])
    if (res.ok) {
      await recordPlayerGuild(ids[i], res.data.guild ?? null)
      if (res.data.guild?.guild_id) guildIds.add(res.data.guild.guild_id)
    } else if (res.status === 404) {
      // The endpoint 404s for players with no guild — mark them checked so we
      // don't keep re-polling them every pass. Transient errors (429/5xx) are
      // left unchecked to retry next time.
      await recordPlayerGuild(ids[i], null)
    }
    if (i < ids.length - 1) await sleep(throttleMs)
  }

  let guildsSynced = 0
  let guildsFresh = 0
  let guildsFailed = 0
  const uniqueGuilds = [...guildIds]
  for (let i = 0; i < uniqueGuilds.length; i++) {
    const outcome = await syncGuild(uniqueGuilds[i], { force: opts.force })
    if (outcome === "synced") guildsSynced += 1
    else if (outcome === "fresh") guildsFresh += 1
    else guildsFailed += 1
    // Only pay the delay when we actually hit the API.
    if (outcome === "synced" && i < uniqueGuilds.length - 1) {
      await sleep(throttleMs)
    }
  }

  return {
    playersChecked: ids.length,
    guildsFound: uniqueGuilds.length,
    guildsSynced,
    guildsFresh,
    guildsFailed,
  }
}

async function fetchGuildLeaderboard(): Promise<GuildRow[]> {
  try {
    return await db()
      .select()
      .from(guilds)
      // Official rank first (lower = better); unranked guilds fall to the
      // bottom, broken by lifetime XP.
      .orderBy(sql`${guilds.rank} asc nulls last`, desc(guilds.xp))
      .limit(200)
  } catch (err) {
    console.error("[guilds] leaderboard read failed:", err)
    return []
  }
}

/** Top discovered guilds, ordered by official rank. Cached 5 min, tag "guilds". */
export const getGuildLeaderboard = unstable_cache(
  fetchGuildLeaderboard,
  ["guild-leaderboard"],
  { tags: [TAG], revalidate: 300 },
)

/** A single guild row from the pool, or null. */
export async function getGuildById(guildId: number): Promise<GuildRow | null> {
  const [row] = await db()
    .select()
    .from(guilds)
    .where(eq(guilds.guildId, guildId))
    .limit(1)
  return row ?? null
}
