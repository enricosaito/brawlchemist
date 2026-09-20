import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { failOpen } from "@/lib/sync/fail-open"
import {
  appUsers,
  esportsTitles as esportsTitlesTable,
  flairGrants,
  profiles,
  type ProfileRow,
} from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"
import {
  isCurated,
  resolveProTier,
  type ProTier,
} from "@/lib/profile/pro-tier"

/**
 * Per-player presentation profiles (verified-pro status, favorite skin,
 * accolades) keyed by brawlhalla id. Today these are admin-curated (no API
 * source) and maintained through /admin; the `userId` column reserves a future
 * auth owner so players can eventually claim their own profile.
 *
 * Reads are cached app-wide under one tag and busted on every write, so the
 * profile/podium/search pay ~nothing for them between edits.
 */
const TAG = "profiles"

/**
 * Cache tag for the profiles map. Exported because the claim flow also writes
 * `profiles.userId`, and the read side now projects that into
 * `PlayerPreview.claimed` — so a claim has to bust this the same way an admin
 * edit does, or the badge doesn't appear until the hourly revalidate.
 */
export const PROFILES_TAG = TAG

export interface FavoriteSkin {
  src: string
  name: string
}

/** Admin-facing row shape (the raw record, not the read-side PlayerPreview). */
export interface ProfileRecord {
  brawlhallaId: number
  /** How established a competitor they are — see lib/profile/pro-tier.ts. */
  proTier: ProTier
  handle: string | null
  favoriteSkin: FavoriteSkin | null
  /** Their competing account, when it is not the one they ladder on. */
  esportsBrawlhallaId: number | null
  updatedAt: Date
}

/**
 * Fields the admin *curation* form can set — what we assert about a player.
 *
 * The favourite skin is deliberately not here. It is something the player
 * chooses in their own customizer, so it is written by `setFavoriteSkin` from
 * the owner-set half of the panel. Two writers for one column is how a
 * "curation" save quietly reverts a choice the player made an hour ago.
 */
export interface ProfileInput {
  brawlhallaId: number
  proTier: ProTier
  handle: string | null
  /**
   * The account this pro competes on, when it differs from the one they ladder
   * on. Curated because nothing can derive it — see the column note in
   * lib/db/schema.ts. Null clears it.
   */
  esportsBrawlhallaId: number | null
}

/**
 * Unwrap a jsonb value that was stored double-encoded — an array or object
 * serialised to a *string* and then written into the jsonb column, so the
 * column holds `"[\"…\"]"` rather than `["…"]`.
 *
 * The admin form and the seed script both write these columns properly; two
 * rows (Kyna, Lopes) arrived this way from hand-written SQL, and the shape is
 * invisible until something reads it: `Array.isArray` says no, the parser
 * returns empty, and the player silently loses their accolades — and with
 * them their favorite skin *and* their flair, since flair entitlement is
 * derived from the esports titles. It read as "the Live Rankings card drops some
 * flair" because that card is where a missing badge is most visible, but the
 * row was blank on every surface.
 *
 * Unwrapping exactly one level (and only for a string that parses) keeps a
 * legitimately string-valued field from being reinterpreted, and costs one
 * `typeof` on the common path.
 */
function unwrapJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function parseSkin(value: unknown): FavoriteSkin | null {
  const raw = unwrapJson(value)
  if (raw && typeof raw === "object") {
    const v = raw as { src?: unknown; name?: unknown }
    if (typeof v.src === "string" && v.src) {
      return { src: v.src, name: typeof v.name === "string" ? v.name : "" }
    }
  }
  return null
}

function toRecord(row: ProfileRow): ProfileRecord {
  return {
    brawlhallaId: row.brawlhallaId,
    proTier: resolveProTier(row.proTier, row.isPro),
    handle: row.handle,
    favoriteSkin: parseSkin(row.favoriteSkin),
    esportsBrawlhallaId: row.esportsBrawlhallaId,
    updatedAt: row.updatedAt,
  }
}

/** What the owning account contributes to a profile, when there is one. */
interface OwnerFacts {
  developer: boolean
  memberSince: Date
  hasFavorites: boolean
}

/** Read-side projection consumed across the public UI. */
function toPreview(
  row: ProfileRow,
  owner?: OwnerFacts,
  grants?: string[],
  titles?: string[]
): PlayerPreview {
  const skin = parseSkin(row.favoriteSkin)
  // One source now. Titles used to live in two places — a curated jsonb
  // column and this table — and were merged here by comparing strings, which
  // worked only while the wordings happened to match exactly. A derivation
  // phrased "World Champion 2v2 '23" against a curated "2v2 World Champion
  // '23" would have rendered the same win twice. Both kinds are rows in
  // esports_titles now, told apart by `source`, so there is nothing to dedupe.
  const esportsTitles = titles ?? []
  // One read of the tier for the row, through the legacy-aware resolver: the
  // boolean is still written for one deploy, so a row the old build wrote has
  // no `pro_tier` and must still render the badge it was already claiming.
  const tier = resolveProTier(row.proTier, row.isPro)
  return {
    favoriteSkin: skin ?? undefined,
    verified: isCurated(tier) ? { handle: row.handle ?? "", tier } : undefined,
    esportsTitles: esportsTitles.length ? esportsTitles : undefined,
    // undefined rather than false so unclaimed players add no key to the
    // cached object — this map holds every profile row.
    claimed: row.userId ? true : undefined,
    developer: owner?.developer ? true : undefined,
    flairGrants: grants?.length ? grants : undefined,
    // Undefined rather than null for the same reason `claimed` is: this map
    // holds every profile row, and most of them have no account behind them.
    memberSince: owner ? owner.memberSince.toISOString() : undefined,
    hasFavorites: owner?.hasFavorites ? true : undefined,
  }
}

// unstable_cache can't serialize a Map, so cache a plain object keyed by id
// (string keys after JSON), then hydrate to a Map at the call site.
const getProfilesObject = unstable_cache(
  async (): Promise<Record<string, PlayerPreview>> => {
    let rows: ProfileRow[]
    // What each owning account contributes: the Developer flair, the date they
    // joined, and whether they have favourited anyone. A second narrow read
    // rather than a join: `profiles` is selected whole here (every column feeds
    // the preview) and app_users is tiny — 72 rows against 156 profiles — so two
    // small queries beat widening every row of the bigger one.
    //
    // `hasFavorites` is computed in SQL on purpose. The list lives inside the
    // `prefs` jsonb, and selecting that column to test one key would ship every
    // viewer's whole preference blob through a cache that holds every profile —
    // the exact shape that has blown the egress budget three times (cardinal
    // constraint #2). Same trick as jsonb_array_length in readValhallanMemberCount:
    // ask Postgres the question instead of fetching the data to answer it.
    //
    // Fails open to "no account facts" — a missing badge, never a missing profile.
    let owners = new Map<string, OwnerFacts>()
    // Hand-awarded flair, read the same way and for the same reason: it is two
    // narrow columns of a tiny table, and folding it in here means every
    // surface that already reads this map gets entitlement for free rather than
    // making a second lookup per rendered row.
    //
    // Caught on its own rather than inside the try below, deliberately. Sharing
    // that catch would put every profile on the site behind the newest table in
    // the schema — one `drizzle-kit push` not yet run, and the whole map returns
    // empty and every pro loses their handle. A grant that can't be read is a
    // missing badge; it must not be a missing profile.
    //
    // Started here and awaited after, so it still rides alongside the other two
    // on the wire rather than costing a round trip of its own.
    const grantsPromise = db()
      .select({
        brawlhallaId: flairGrants.brawlhallaId,
        flairId: flairGrants.flairId,
      })
      .from(flairGrants)
      .then((rows) => {
        const map = new Map<number, string[]>()
        for (const g of rows) {
          const list = map.get(g.brawlhallaId)
          if (list) list.push(g.flairId)
          else map.set(g.brawlhallaId, [g.flairId])
        }
        return map
      })
      .catch((err) => {
        console.error("[profiles] flair grants read failed:", err)
        return new Map<number, string[]>()
      })
    // Every championship title, hand-typed and derived alike. Caught on its
    // own for the same reason the grants read is: a table that cannot be read
    // must cost a title, never every profile on the site.
    const titlesPromise = db()
      .select({
        brawlhallaId: esportsTitlesTable.brawlhallaId,
        title: esportsTitlesTable.title,
      })
      .from(esportsTitlesTable)
      .then((rows) => {
        const map = new Map<number, string[]>()
        for (const t of rows) {
          const list = map.get(t.brawlhallaId)
          if (list) list.push(t.title)
          else map.set(t.brawlhallaId, [t.title])
        }
        // Newest first, so a profile leads with the most recent win.
        for (const list of map.values()) list.sort((a, b) => b.localeCompare(a))
        return map
      })
      .catch((err) => {
        console.error("[profiles] titles read failed:", err)
        return new Map<number, string[]>()
      })
    try {
      const [profileRows, userRows] = await Promise.all([
        db().select().from(profiles),
        db()
          .select({
            id: appUsers.id,
            accountRole: appUsers.accountRole,
            createdAt: appUsers.createdAt,
            hasFavorites: sql<boolean>`coalesce(
              jsonb_typeof(${appUsers.prefs} -> 'favoriteTrackedIds') = 'array'
              and jsonb_array_length(${appUsers.prefs} -> 'favoriteTrackedIds') > 0,
              false)`,
          })
          .from(appUsers),
      ])
      rows = profileRows
      owners = new Map(
        userRows.map((u) => [
          u.id,
          {
            developer: u.accountRole === "developer",
            memberSince: u.createdAt,
            hasFavorites: !!u.hasFavorites,
          },
        ])
      )
    } catch (err) {
      // Rethrown, NOT swallowed. Returning {} here would be a successful
      // return as far as unstable_cache is concerned, and it would serve that
      // empty map as fact for the full hour — which is exactly the outage of
      // 2026-09-18. The fail-open lives outside the cache now, in
      // getProfilesMap; see lib/sync/fail-open.ts.
      console.error("[profiles] read failed:", err)
      throw err
    }
    const [grants, titles] = await Promise.all([grantsPromise, titlesPromise])
    const obj: Record<string, PlayerPreview> = {}
    for (const r of rows) {
      obj[String(r.brawlhallaId)] = toPreview(
        r,
        r.userId ? owners.get(r.userId) : undefined,
        grants.get(r.brawlhallaId),
        titles.get(r.brawlhallaId)
      )
    }
    return obj
  },
  // Key bumped once, deliberately: the entry under "profiles-map" was poisoned
  // with {} on 2026-09-18 and the Data Cache survives a deploy, so shipping the
  // fix alone would have left the outage in place for the rest of its hour.
  // Changing the key orphans it. Do not bump this again for its own sake — the
  // tag is how you invalidate; this is how you abandon.
  ["profiles-map-v2"],
  { tags: [TAG], revalidate: 3600 }
)

/** All profiles as a Map<brawlhallaId, PlayerPreview> (cached). */
export async function getProfilesMap(): Promise<Map<number, PlayerPreview>> {
  const obj = await failOpen("[profiles]", getProfilesObject, {})
  const map = new Map<number, PlayerPreview>()
  for (const [k, v] of Object.entries(obj)) map.set(Number(k), v)
  return map
}

/** A single player's preview, or undefined (cached via the map). */
export async function getProfile(
  brawlhallaId: number
): Promise<PlayerPreview | undefined> {
  return (await getProfilesMap()).get(brawlhallaId)
}

// ---- Admin reads/writes (uncached; admin sees fresh data) -------------------

export async function listProfiles(): Promise<ProfileRecord[]> {
  const rows = await db()
    .select()
    .from(profiles)
    .orderBy(desc(profiles.updatedAt))
  return rows.map(toRecord)
}

export async function getProfileRecord(
  brawlhallaId: number
): Promise<ProfileRecord | null> {
  const [row] = await db()
    .select()
    .from(profiles)
    .where(eq(profiles.brawlhallaId, brawlhallaId))
    .limit(1)
  return row ? toRecord(row) : null
}

/**
 * One player's championship titles, hand-typed and derived together.
 *
 * Uncached and admin-only. There were two homes for these once — a jsonb
 * column an operator typed into, and this table, written by
 * scripts/sync-esports-titles.mjs off Challengermode placements. They were not
 * redundant but complementary: the curated ones are the pre-Challengermode
 * history the script structurally cannot reach (BCX '21, the SGG-era worlds),
 * the derived ones are 2025 onward. Keeping them apart meant an operator could
 * edit half of a profile's honours and not the other half, and meant the two
 * were merged at render time by comparing strings.
 */
export interface EsportsTitle {
  id: string
  title: string
  /** "manual" — someone typed it. "derived" — the script read it off a placement. */
  source: string
  /** Null for manual titles: a hand-typed honour names no tournament. */
  tournamentName: string | null
  year: number | null
}

export async function listTitles(
  brawlhallaId: number
): Promise<EsportsTitle[]> {
  return db()
    .select({
      id: esportsTitlesTable.id,
      title: esportsTitlesTable.title,
      source: esportsTitlesTable.source,
      tournamentName: esportsTitlesTable.tournamentName,
      year: esportsTitlesTable.year,
    })
    .from(esportsTitlesTable)
    .where(eq(esportsTitlesTable.brawlhallaId, brawlhallaId))
    .orderBy(desc(esportsTitlesTable.year))
}

/**
 * Remove one title.
 *
 * By row id, not by (player, title): a derived id is
 * `${tournamentId}:${brawlhallaId}`, so this deletes the claim about one
 * tournament rather than every title that happens to share a string. Removing
 * a *derived* one is a one-off — re-running the sync script puts it back, and a
 * consistently wrong derivation belongs in that script's allow-list. Removing a
 * manual one is permanent, because nothing else writes it.
 */
export async function deleteTitle(id: string): Promise<void> {
  await db().delete(esportsTitlesTable).where(eq(esportsTitlesTable.id, id))
  revalidateTag(TAG, "max")
}

/**
 * Add a title by hand.
 *
 * The id is derived from the player and the exact text, so adding the same
 * title twice is idempotent rather than producing a duplicate tag on a profile.
 * No year, mode or tournament: those are facts about a derivation, and this has
 * none — which is why those columns are nullable.
 */
export async function addManualTitle(
  brawlhallaId: number,
  title: string
): Promise<void> {
  const clean = title.trim().slice(0, 120)
  if (!clean) return
  const { createHash } = await import("node:crypto")
  const id = `manual:${brawlhallaId}:${createHash("md5").update(clean).digest("hex")}`
  await db()
    .insert(esportsTitlesTable)
    .values({ id, brawlhallaId, title: clean, source: "manual" })
    .onConflictDoNothing()
  revalidateTag(TAG, "max")
}

export async function upsertProfile(input: ProfileInput): Promise<void> {
  // `isPro` is written alongside the tier, not instead of it: the previously
  // running build still selects that column, and two maintenance scripts read
  // it as a bare boolean. It is derived here and nowhere else, so it cannot
  // drift from the tier, and it goes when the column does.
  const values = {
    brawlhallaId: input.brawlhallaId,
    proTier: input.proTier,
    isPro: isCurated(input.proTier),
    handle: input.handle,
    esportsBrawlhallaId: input.esportsBrawlhallaId,
    updatedAt: new Date(),
  }
  await db()
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({
      target: profiles.brawlhallaId,
      set: {
        proTier: values.proTier,
        isPro: values.isPro,
        handle: values.handle,
        esportsBrawlhallaId: values.esportsBrawlhallaId,
        updatedAt: values.updatedAt,
      },
    })
  revalidateTag(TAG, "max")
}

/**
 * Record which Challengermode competitor a pro is, or clear it.
 *
 * Writes nothing else on the row, so it cannot disturb a handle or a pro flag
 * — the same reason saveProfileFieldsAction carries links through rather than
 * rewriting them. Busts the profiles tag because the map is what every surface
 * reads a handle from.
 */
export async function setCmPlayerId(
  brawlhallaId: number,
  cmPlayerId: string | null
): Promise<void> {
  await db()
    .update(profiles)
    .set({ cmPlayerId, updatedAt: new Date() })
    .where(eq(profiles.brawlhallaId, brawlhallaId))
  revalidateTag(TAG, "max")
}

export async function deleteProfile(brawlhallaId: number): Promise<void> {
  await db().delete(profiles).where(eq(profiles.brawlhallaId, brawlhallaId))
  revalidateTag(TAG, "max")
}

/**
 * Set (or clear) just the favorite skin on a profile.
 *
 * Column-scoped on purpose. `profiles` is otherwise admin-curated — standing, the
 * pro handle, esports titles — and this is the one field its *owner* gets to
 * choose, so the write touches nothing else and cannot become a way for a
 * player to edit their own credentials. `upsertProfile` would rewrite all four.
 *
 * Insert-if-missing, because a claimed player always has a profiles row but an
 * admin could clear one; the row it creates carries no pro fields.
 */
export async function setFavoriteSkin(
  brawlhallaId: number,
  skin: FavoriteSkin | null
): Promise<void> {
  const now = new Date()
  await db()
    .insert(profiles)
    .values({ brawlhallaId, favoriteSkin: skin, updatedAt: now })
    .onConflictDoUpdate({
      target: profiles.brawlhallaId,
      set: { favoriteSkin: skin, updatedAt: now },
    })
  revalidateTag(TAG, "max")
}
