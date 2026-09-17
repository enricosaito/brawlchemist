import "server-only"
import { asc, eq } from "drizzle-orm"
import { revalidateTag, unstable_cache } from "next/cache"
import { db } from "@/lib/db"
import { trueCombos } from "@/lib/db/schema"
import type { TrueCombo } from "@/lib/true-combos"
import type { WeaponId } from "@/lib/types"

/**
 * The Lab's clip library, read from Postgres.
 *
 * One cached read of the whole table rather than a query per weapon page: it is
 * a few hundred rows of short text with no jsonb, so the entire library is
 * smaller than a single `ranked_json` blob. A read per weapon would be fifteen
 * queries to save nothing measurable.
 *
 * Fails open to an empty library (cardinal constraint #5). A page that says a
 * weapon has no clips yet is a page; a page that throws is not, and the empty
 * state already exists and reads correctly.
 */
export const TRUE_COMBOS_TAG = "true-combos"

const getCombosObject = unstable_cache(
  async (): Promise<Record<string, TrueCombo[]>> => {
    try {
      const rows = await db()
        .select({
          id: trueCombos.id,
          weaponId: trueCombos.weaponId,
          notation: trueCombos.notation,
          note: trueCombos.note,
          src: trueCombos.src,
          poster: trueCombos.poster,
        })
        .from(trueCombos)
        .orderBy(asc(trueCombos.weaponId), asc(trueCombos.sort))
      const out: Record<string, TrueCombo[]> = {}
      for (const r of rows) {
        ;(out[r.weaponId] ??= []).push({
          id: r.id,
          notation: r.notation,
          note: r.note ?? undefined,
          src: r.src,
          poster: r.poster ?? undefined,
        })
      }
      return out
    } catch (err) {
      console.error("[true-combos] library read failed:", err)
      return {}
    }
  },
  ["true-combos"],
  { tags: [TRUE_COMBOS_TAG], revalidate: 3600 }
)

/** Clips for one weapon, in the order an operator put them in. */
export async function getCombosFor(weapon: WeaponId): Promise<TrueCombo[]> {
  return (await getCombosObject())[weapon] ?? []
}

/** The whole library, keyed by weapon — for the page's per-weapon counts. */
export async function getComboLibrary(): Promise<Record<string, TrueCombo[]>> {
  return getCombosObject()
}

export interface ComboRecord extends TrueCombo {
  weaponId: string
  sort: number
}

/**
 * Every clip, newest weapon order, for the admin table.
 *
 * Deliberately uncached: an operator who has just uploaded a clip needs to see
 * it, and a stale list is how you upload the same thing twice.
 */
export async function listCombos(): Promise<ComboRecord[]> {
  try {
    const rows = await db()
      .select()
      .from(trueCombos)
      .orderBy(asc(trueCombos.weaponId), asc(trueCombos.sort))
    return rows.map((r) => ({
      id: r.id,
      weaponId: r.weaponId,
      notation: r.notation,
      note: r.note ?? undefined,
      src: r.src,
      poster: r.poster ?? undefined,
      sort: r.sort,
    }))
  } catch (err) {
    console.error("[true-combos] admin list failed:", err)
    return []
  }
}

export async function getCombo(id: string): Promise<ComboRecord | null> {
  const all = await listCombos()
  return all.find((c) => c.id === id) ?? null
}

export interface ComboInput {
  id: string
  weaponId: string
  notation: string
  note: string | null
  src: string
  poster: string | null
  sort: number
}

export async function upsertCombo(input: ComboInput): Promise<void> {
  const now = new Date()
  await db()
    .insert(trueCombos)
    .values({ ...input, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: trueCombos.id,
      set: {
        weaponId: input.weaponId,
        notation: input.notation,
        note: input.note,
        src: input.src,
        poster: input.poster,
        sort: input.sort,
        updatedAt: now,
      },
    })
  revalidateTag(TRUE_COMBOS_TAG, "max")
}

/**
 * Removes the row. The Blob objects are left alone on purpose: deleting them
 * here would strand any other row that reused the same upload, and an orphaned
 * clip costs a few hundred kilobytes against a paid plan. Blob has its own
 * listing if it ever needs sweeping.
 */
export async function deleteCombo(id: string): Promise<void> {
  await db().delete(trueCombos).where(eq(trueCombos.id, id))
  revalidateTag(TRUE_COMBOS_TAG, "max")
}
