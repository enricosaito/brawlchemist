import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  appUsers,
  esportsTitles as esportsTitlesTable,
  flairGrants,
  profiles,
  type ProfileRow,
} from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"

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
  isPro: boolean
  handle: string | null
  favoriteSkin: FavoriteSkin | null
  esportsTitles: string[]
  updatedAt: Date
}

/** Fields the admin form can set. */
export interface ProfileInput {
  brawlhallaId: number
  isPro: boolean
  handle: string | null
  favoriteSkin: FavoriteSkin | null
  esportsTitles: string[]
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

export function parseEsportsTitles(value: unknown): string[] {
  const raw = unwrapJson(value)
  return Array.isArray(raw)
    ? raw.filter((a): a is string => typeof a === "string")
    : []
}

function toRecord(row: ProfileRow): ProfileRecord {
  return {
    brawlhallaId: row.brawlhallaId,
    isPro: row.isPro,
    handle: row.handle,
    favoriteSkin: parseSkin(row.favoriteSkin),
    esportsTitles: parseEsportsTitles(row.esportsTitles),
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
  derivedTitles?: string[]
): PlayerPreview {
  const skin = parseSkin(row.favoriteSkin)
  // Curated first, then anything derived it doesn't already say. The operator's
  // wording wins on a collision: they typed it, and a machine-generated string
  // that differs only in phrasing would read as two wins rather than one.
  const curated = parseEsportsTitles(row.esportsTitles)
  const esportsTitles = derivedTitles?.length
    ? [...curated, ...derivedTitles.filter((t) => !curated.includes(t))]
    : curated
  return {
    favoriteSkin: skin ?? undefined,
    verified: row.isPro ? { handle: row.handle ?? "" } : undefined,
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
    // Championship wins read off Challengermode placements
    // (scripts/sync-esports-titles.mjs). Caught on its own for the same reason
    // the grants read is: a table that cannot be read must cost a title, never
    // every profile on the site.
    const derivedPromise = db()
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
        console.error("[profiles] derived titles read failed:", err)
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
      // Fail open — the UI renders fine without profiles.
      console.error("[profiles] read failed:", err)
      return {}
    }
    const [grants, derived] = await Promise.all([grantsPromise, derivedPromise])
    const obj: Record<string, PlayerPreview> = {}
    for (const r of rows) {
      obj[String(r.brawlhallaId)] = toPreview(
        r,
        r.userId ? owners.get(r.userId) : undefined,
        grants.get(r.brawlhallaId),
        derived.get(r.brawlhallaId)
      )
    }
    return obj
  },
  ["profiles-map"],
  { tags: [TAG], revalidate: 3600 }
)

/** All profiles as a Map<brawlhallaId, PlayerPreview> (cached). */
export async function getProfilesMap(): Promise<Map<number, PlayerPreview>> {
  const obj = await getProfilesObject()
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

export async function upsertProfile(input: ProfileInput): Promise<void> {
  const values = {
    brawlhallaId: input.brawlhallaId,
    isPro: input.isPro,
    handle: input.handle,
    favoriteSkin: input.favoriteSkin,
    esportsTitles: input.esportsTitles,
    updatedAt: new Date(),
  }
  await db()
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({
      target: profiles.brawlhallaId,
      set: {
        isPro: values.isPro,
        handle: values.handle,
        favoriteSkin: values.favoriteSkin,
        esportsTitles: values.esportsTitles,
        updatedAt: values.updatedAt,
      },
    })
  revalidateTag(TAG, "max")
}

export async function deleteProfile(brawlhallaId: number): Promise<void> {
  await db().delete(profiles).where(eq(profiles.brawlhallaId, brawlhallaId))
  revalidateTag(TAG, "max")
}

/**
 * Set (or clear) just the favorite skin on a profile.
 *
 * Column-scoped on purpose. `profiles` is otherwise admin-curated — isPro, the
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
