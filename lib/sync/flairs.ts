import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { flairGrants, flairs, profiles, type FlairRow } from "@/lib/db/schema"
import {
  BUILTIN_FLAIRS,
  isFlairIdShape,
  parseFlairRule,
  type FlairDef,
  type FlairRule,
} from "@/lib/profile/flair"
import { PROFILES_TAG } from "@/lib/sync/profiles"

/**
 * The flair catalogue and its manual grants — the curated half of flair.
 *
 * Entitlement still lives in code (lib/profile/flair): this module only answers
 * "which badges exist" and "who was handed one". Both are read once per request
 * behind a cache tag and busted on every write, so the leaderboards pay nothing
 * for them between edits.
 *
 * Everything here fails open. A catalogue read that throws falls back to
 * BUILTIN_FLAIRS and a grants read that throws falls back to nobody, because a
 * missing badge is a cosmetic loss and a thrown query is a dead page.
 */

export const FLAIR_CATALOGUE_TAG = "flair-catalogue"
export const FLAIR_GRANTS_TAG = "flair-grants"

/** Admin-facing row: the catalogue entry plus the fields the public read drops. */
export interface FlairRecord extends FlairDef {
  enabled: boolean
  updatedAt: Date
}

export interface FlairInput {
  id: string
  label: string
  requirement: string
  src: string
  width: number
  height: number
  rule: FlairRule
  ruleValue: string | null
  sort: number
  enabled: boolean
}

function toRecord(row: FlairRow): FlairRecord {
  return {
    id: row.id,
    label: row.label,
    requirement: row.requirement,
    src: row.src,
    width: row.width,
    height: row.height,
    rule: parseFlairRule(row.rule),
    ruleValue: row.ruleValue,
    sort: row.sort,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  }
}

/**
 * The catalogue every public surface renders from, rarest first.
 *
 * Falls back to BUILTIN_FLAIRS on an empty table as well as on an error. The
 * empty case is the window between `db:push` creating the table and an operator
 * pressing "Import built-ins" — without the fallback, deploying this feature
 * would silently strip every badge on the site until someone clicked a button.
 * Once there is a single row the table is authoritative, which is what makes
 * editing and deleting a built-in actually take effect.
 */
const getFlairCatalogueCached = unstable_cache(
  async (): Promise<FlairDef[]> => {
    try {
      const rows = await db()
        .select()
        .from(flairs)
        .where(eq(flairs.enabled, true))
        .orderBy(asc(flairs.sort))
      if (rows.length === 0) return BUILTIN_FLAIRS
      // Projected narrow, not `toRecord`: this list is serialised into the RSC
      // payload of every page that renders a badge, so it carries what the
      // renderer needs and nothing the admin screen happens to want.
      return rows.map((r) => ({
        id: r.id,
        label: r.label,
        requirement: r.requirement,
        src: r.src,
        width: r.width,
        height: r.height,
        rule: parseFlairRule(r.rule),
        ruleValue: r.ruleValue,
        sort: r.sort,
      }))
    } catch (err) {
      console.error("[flairs] catalogue read failed:", err)
      return BUILTIN_FLAIRS
    }
  },
  ["flair-catalogue"],
  { tags: [FLAIR_CATALOGUE_TAG], revalidate: 3600 },
)

export async function getFlairCatalogue(): Promise<FlairDef[]> {
  return getFlairCatalogueCached()
}

/**
 * Every manual grant, as one cached object keyed by brawlhalla id.
 *
 * Read whole rather than per player for the same reason the flair *selection*
 * map is: a read per leaderboard row is exactly the shape that has blown the
 * egress budget before. Only hand-awarded players have a row at all, so it
 * stays small indefinitely.
 */
const getFlairGrantsObject = unstable_cache(
  async (): Promise<Record<string, string[]>> => {
    try {
      const rows = await db()
        .select({
          brawlhallaId: flairGrants.brawlhallaId,
          flairId: flairGrants.flairId,
        })
        .from(flairGrants)
      const out: Record<string, string[]> = {}
      for (const r of rows) {
        const key = String(r.brawlhallaId)
        ;(out[key] ??= []).push(r.flairId)
      }
      return out
    } catch (err) {
      console.error("[flairs] grants read failed:", err)
      return {}
    }
  },
  ["flair-grants"],
  { tags: [FLAIR_GRANTS_TAG], revalidate: 3600 },
)

/** `unstable_cache` can't serialize a Map, so hydrate here (as getProfilesMap does). */
export async function getFlairGrantsMap(): Promise<Map<number, string[]>> {
  const obj = await getFlairGrantsObject()
  const map = new Map<number, string[]>()
  for (const [k, v] of Object.entries(obj)) map.set(Number(k), v)
  return map
}

// ---- Admin reads/writes (uncached; admin sees fresh data) -------------------

export async function listFlairs(): Promise<FlairRecord[]> {
  const rows = await db().select().from(flairs).orderBy(asc(flairs.sort))
  return rows.map(toRecord)
}

export async function getFlairRecord(id: string): Promise<FlairRecord | null> {
  const [row] = await db().select().from(flairs).where(eq(flairs.id, id)).limit(1)
  return row ? toRecord(row) : null
}

/**
 * Bust everything a catalogue change can be seen through.
 *
 * The catalogue tag is the obvious one. `PROFILES_TAG` is not: grants are
 * projected into the cached profiles map, so a grant that only invalidated its
 * own tag would take up to an hour to show — the exact staleness that has
 * already cost this project two visible features.
 */
function bustCatalogue(): void {
  revalidateTag(FLAIR_CATALOGUE_TAG, "max")
}

function bustGrants(): void {
  revalidateTag(FLAIR_GRANTS_TAG, "max")
  revalidateTag(PROFILES_TAG, "max")
}

export type FlairWriteResult =
  | { ok: true }
  | { ok: false; reason: "invalid-id" | "exists" | "not-found" }

/** Create a catalogue entry. Caller MUST have passed requireAdmin. */
export async function createFlair(input: FlairInput): Promise<FlairWriteResult> {
  if (!isFlairIdShape(input.id)) return { ok: false, reason: "invalid-id" }
  if (await getFlairRecord(input.id)) return { ok: false, reason: "exists" }
  await db().insert(flairs).values({ ...input, updatedAt: new Date() })
  bustCatalogue()
  return { ok: true }
}

/**
 * Update a catalogue entry. The id is not writable: it is the value stored in
 * everyone's selection and in every grant, so renaming it would orphan both.
 */
export async function updateFlair(
  id: string,
  input: Omit<FlairInput, "id">,
): Promise<FlairWriteResult> {
  const res = await db()
    .update(flairs)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(flairs.id, id))
    .returning({ id: flairs.id })
  if (res.length === 0) return { ok: false, reason: "not-found" }
  bustCatalogue()
  return { ok: true }
}

/**
 * Delete a catalogue entry, and the grants that pointed at it.
 *
 * Selections are deliberately left alone. A selection is only a preference and
 * resolveFlair already falls back when it names nothing, so clearing them would
 * be a destructive write to fix a problem that doesn't exist — and it would
 * throw away the player's choice if the flair were ever recreated under the
 * same id. Grants are different: they are an award, and an award of a badge
 * that no longer exists is just a dangling row.
 */
export async function deleteFlair(id: string): Promise<void> {
  await db().delete(flairGrants).where(eq(flairGrants.flairId, id))
  await db().delete(flairs).where(eq(flairs.id, id))
  bustCatalogue()
  bustGrants()
}

/**
 * Seed the two flairs that shipped in code, so they become editable.
 *
 * Idempotent, and never overwrites: an operator who has already retitled the
 * Developer badge shouldn't have it reset by a stray second click.
 */
export async function importBuiltinFlairs(): Promise<number> {
  const existing = new Set((await listFlairs()).map((f) => f.id))
  const missing = BUILTIN_FLAIRS.filter((f) => !existing.has(f.id))
  if (missing.length === 0) return 0
  await db()
    .insert(flairs)
    .values(
      missing.map((f) => ({
        id: f.id,
        label: f.label,
        requirement: f.requirement,
        src: f.src,
        width: f.width,
        height: f.height,
        rule: f.rule,
        ruleValue: f.ruleValue ?? null,
        sort: f.sort,
        enabled: true,
        updatedAt: new Date(),
      })),
    )
  bustCatalogue()
  return missing.length
}

// ---- Grants ----------------------------------------------------------------

export interface FlairGrantRecord {
  brawlhallaId: number
  flairId: string
  username: string | null
  createdAt: Date
}

/** Every hand-awarded badge, with the holder's name. Admin screen, uncached. */
export async function listFlairGrants(): Promise<FlairGrantRecord[]> {
  const rows = await db()
    .select({
      brawlhallaId: flairGrants.brawlhallaId,
      flairId: flairGrants.flairId,
      createdAt: flairGrants.createdAt,
    })
    .from(flairGrants)
    .orderBy(asc(flairGrants.flairId))

  // Names come from a narrow read rather than a join: usernames live on
  // `players`, whose rows carry the ~6 KB ranked_json blob (cardinal
  // constraint #2). Fails open to ids without names.
  let names = new Map<number, string>()
  const ids = [...new Set(rows.map((r) => r.brawlhallaId))]
  if (ids.length > 0) {
    try {
      const { getPlayersByIds } = await import("@/lib/sync/players")
      const players = await getPlayersByIds(ids, { includeRankedJson: false })
      names = new Map([...players].map(([id, p]) => [id, p.username]))
    } catch (err) {
      console.error("[flairs] grant name lookup failed:", err)
    }
  }

  return rows.map((r) => ({
    ...r,
    username: names.get(r.brawlhallaId) ?? null,
  }))
}

/**
 * Award a manual flair. Caller MUST have passed requireAdmin.
 *
 * Also ensures a `profiles` row exists, because that map is how presentation
 * data reaches the public side — a grant to a player with no profile row would
 * be recorded and then never rendered, which is the worst kind of bug: the
 * panel says it worked.
 */
export async function grantFlair(
  brawlhallaId: number,
  flairId: string,
): Promise<FlairWriteResult> {
  if (!(await getFlairRecord(flairId))) return { ok: false, reason: "not-found" }
  await db()
    .insert(profiles)
    .values({ brawlhallaId })
    .onConflictDoNothing({ target: profiles.brawlhallaId })
  await db()
    .insert(flairGrants)
    .values({ brawlhallaId, flairId })
    .onConflictDoNothing()
  bustGrants()
  return { ok: true }
}

export async function revokeFlair(
  brawlhallaId: number,
  flairId: string,
): Promise<void> {
  await db()
    .delete(flairGrants)
    .where(
      and(
        eq(flairGrants.brawlhallaId, brawlhallaId),
        eq(flairGrants.flairId, flairId),
      ),
    )
  bustGrants()
}
