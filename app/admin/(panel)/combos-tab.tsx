import Link from "next/link"
import { WEAPON_NAMES } from "@/lib/mock-data"
import type { WeaponId } from "@/lib/types"
import { getCombo, listCombos } from "@/lib/sync/true-combos"
import { deleteComboAction, saveComboAction } from "../actions"

const labelCls =
  "font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
const inputCls =
  "mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-pink"
const actionCls =
  "font-mono text-[11px] uppercase tracking-wider transition-colors"
const buttonCls =
  "rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-muted"

const WEAPONS = Object.keys(WEAPON_NAMES) as WeaponId[]

/**
 * Admin → Combos. The Lab's clip library.
 *
 * The only tab that uploads video, and the reason The Lab has a table behind it
 * at all: a static module made adding a clip a deploy, which is a fine trade at
 * five entries and an absurd one at two hundred.
 *
 * Files go to Vercel Blob and the row keeps the URL. Nothing about a clip
 * touches Supabase storage — its egress is the same 5GB/month every query on
 * the site shares, and video would be the largest thing on it.
 *
 * Editing without attaching a file keeps the existing upload, so fixing a typo
 * in the notation is not a re-upload.
 */
export async function CombosTab({ editId }: { editId: string | null }) {
  const [combos, editing] = await Promise.all([
    listCombos(),
    editId ? getCombo(editId) : Promise.resolve(null),
  ])

  const byWeapon = new Map<string, typeof combos>()
  for (const c of combos) {
    const list = byWeapon.get(c.weaponId) ?? []
    list.push(c)
    byWeapon.set(c.weaponId, list)
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm">
        <h2 className="mb-1 font-display text-lg font-semibold">
          {editing ? `Edit ${editing.notation}` : "Add a clip"}
        </h2>
        <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
          Encode first — 480p, 30fps, no audio. The recipe is in{" "}
          <code className="font-mono">lib/true-combos.ts</code>; a 3-second clip
          should land around 150–300KB. The player steps frames assuming 30fps.
        </p>

        <form action={saveComboAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Weapon</span>
              <select
                name="weaponId"
                defaultValue={editing?.weaponId ?? WEAPONS[0]}
                className={inputCls}
              >
                {WEAPONS.map((w) => (
                  <option key={w} value={w}>
                    {WEAPON_NAMES[w]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelCls}>Notation</span>
              <input
                name="notation"
                required
                defaultValue={editing?.notation ?? ""}
                placeholder="dLight → nAir"
                className={inputCls}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>Note (optional)</span>
            <input
              name="note"
              defaultValue={editing?.note ?? ""}
              placeholder="Works up to ~70 damage, any gravity."
              className={inputCls}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={labelCls}>
                Clip (mp4){editing ? " — leave empty to keep" : ""}
              </span>
              <input
                type="file"
                name="clip"
                accept="video/mp4,video/webm"
                className={inputCls}
              />
            </label>

            <label className="block">
              <span className={labelCls}>Poster (optional)</span>
              <input
                type="file"
                name="poster"
                accept="image/webp,image/jpeg,image/png"
                className={inputCls}
              />
            </label>

            <label className="block">
              <span className={labelCls}>Sort</span>
              <input
                name="sort"
                type="number"
                defaultValue={editing?.sort ?? 100}
                className={inputCls}
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className={buttonCls}>
              {editing ? "Save clip" : "Upload clip"}
            </button>
            {editing && (
              <Link
                href="/admin?tab=combos"
                className={`${actionCls} text-muted-foreground hover:text-foreground`}
              >
                Cancel
              </Link>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          Library{" "}
          <span className="font-mono text-xs text-muted-foreground">
            {combos.length} clip{combos.length === 1 ? "" : "s"}
          </span>
        </h2>

        {combos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">
            No clips yet. Every row here is a combo somebody recorded — nothing
            is seeded, because a combo is a game fact and there is no endpoint
            for it.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {WEAPONS.filter((w) => byWeapon.has(w)).map((w) => (
              <div key={w}>
                <h3 className={`${labelCls} mb-2`}>{WEAPON_NAMES[w]}</h3>
                <ul className="flex flex-col gap-1">
                  {(byWeapon.get(w) ?? []).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-sm">
                        {c.notation}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                        {c.poster ? "poster" : "no poster"} · {c.sort}
                      </span>
                      <a
                        href={c.src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${actionCls} shrink-0 text-muted-foreground hover:text-foreground`}
                      >
                        File
                      </a>
                      <Link
                        href={`/admin?tab=combos&editcombo=${c.id}`}
                        className={`${actionCls} shrink-0 text-muted-foreground hover:text-foreground`}
                      >
                        Edit
                      </Link>
                      <form action={deleteComboAction} className="shrink-0">
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className={`${actionCls} text-negative hover:opacity-80`}
                        >
                          Delete
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
