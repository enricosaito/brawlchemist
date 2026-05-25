import Link from "next/link"
import {
  getOverrideRecord,
  listOverrides,
} from "@/lib/sync/player-overrides"
import { getPlayersByIds } from "@/lib/sync/players"
import { deleteOverrideAction, saveOverrideAction } from "../actions"

const labelCls =
  "font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
const inputCls =
  "mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-copper"

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string
    saved?: string
    deleted?: string
    error?: string
  }>
}) {
  const sp = await searchParams
  const editId = sp.edit ? Number(sp.edit) : null
  const editing =
    editId && Number.isInteger(editId)
      ? await getOverrideRecord(editId)
      : null

  const overrides = await listOverrides()
  const players = overrides.length
    ? await getPlayersByIds(overrides.map((o) => o.brawlhallaId))
    : new Map()

  return (
    <div className="flex flex-col gap-10">
      {(sp.saved || sp.deleted || sp.error) && (
        <div
          className={
            sp.error
              ? "rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
              : "rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive"
          }
        >
          {sp.error
            ? "Couldn’t save — check the Brawlhalla ID."
            : sp.deleted
              ? "Override deleted."
              : `Saved override for ${sp.saved}.`}
        </div>
      )}

      {/* Create / edit form */}
      <section>
        <h2 className="font-display text-lg font-semibold">
          {editing ? `Edit override · ${editing.brawlhallaId}` : "Add / edit override"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Keyed by Brawlhalla ID. To find an ID, look the player up on{" "}
          <Link href="/search" className="text-copper hover:underline">
            search
          </Link>
          .
        </p>

        <form
          action={saveOverrideAction}
          className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-card/40 p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-1">
            <label className={labelCls} htmlFor="brawlhallaId">
              Brawlhalla ID
            </label>
            <input
              id="brawlhallaId"
              name="brawlhallaId"
              type="number"
              required
              readOnly={!!editing}
              defaultValue={editing?.brawlhallaId ?? editId ?? ""}
              className={inputCls}
            />
          </div>

          <div className="flex items-end sm:col-span-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                name="pro"
                type="checkbox"
                defaultChecked={editing?.pro ?? false}
                className="size-4 accent-mystic"
              />
              Verified pro (PRO badge)
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="handle">
              Handle (shown next to PRO)
            </label>
            <input
              id="handle"
              name="handle"
              type="text"
              defaultValue={editing?.handle ?? ""}
              placeholder="e.g. Kyna"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-1">
            <label className={labelCls} htmlFor="skinSrc">
              Favorite skin — image path
            </label>
            <input
              id="skinSrc"
              name="skinSrc"
              type="text"
              defaultValue={editing?.favoriteSkin?.src ?? ""}
              placeholder="/assets/SKIN_File.png"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-1">
            <label className={labelCls} htmlFor="skinName">
              Favorite skin — display name
            </label>
            <input
              id="skinName"
              name="skinName"
              type="text"
              defaultValue={editing?.favoriteSkin?.name ?? ""}
              placeholder="e.g. Fallen Prince Teros"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="achievements">
              Championship titles (one per line)
            </label>
            <textarea
              id="achievements"
              name="achievements"
              rows={3}
              defaultValue={editing?.achievements.join("\n") ?? ""}
              placeholder={"2v2 World Champion '24\n1v1 Midseason Champion '24"}
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90"
            >
              {editing ? "Save changes" : "Save override"}
            </button>
            {editing && (
              <Link
                href="/admin"
                className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* Existing overrides */}
      <section>
        <h2 className="font-display text-lg font-semibold">
          Overrides{" "}
          <span className="font-mono text-sm font-normal text-muted-foreground">
            ({overrides.length})
          </span>
        </h2>

        {overrides.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No overrides yet. Add one above.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {overrides.map((o) => {
              const username = players.get(o.brawlhallaId)?.username
              return (
                <li
                  key={o.brawlhallaId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
                >
                  <span className="font-medium">
                    {username ?? `#${o.brawlhallaId}`}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    ID {o.brawlhallaId}
                  </span>
                  {o.pro && (
                    <span className="rounded border border-mystic/50 bg-mystic/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mystic">
                      Pro{o.handle ? ` · ${o.handle}` : ""}
                    </span>
                  )}
                  {o.favoriteSkin && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      skin: {o.favoriteSkin.name || o.favoriteSkin.src}
                    </span>
                  )}
                  {o.achievements.length > 0 && (
                    <span className="font-mono text-[10px] text-tier-gold">
                      {o.achievements.length} title
                      {o.achievements.length === 1 ? "" : "s"}
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-3">
                    <Link
                      href={`/admin?edit=${o.brawlhallaId}`}
                      className="font-mono text-[11px] uppercase tracking-wider text-copper transition-colors hover:text-foreground"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/player/${o.brawlhallaId}`}
                      className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View
                    </Link>
                    <form action={deleteOverrideAction}>
                      <input
                        type="hidden"
                        name="brawlhallaId"
                        value={o.brawlhallaId}
                      />
                      <button
                        type="submit"
                        className="font-mono text-[11px] uppercase tracking-wider text-negative transition-colors hover:opacity-80"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
