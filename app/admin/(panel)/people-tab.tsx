import Link from "next/link"
import { getProfileRecord } from "@/lib/sync/profiles"
import { listAdminPeople } from "@/lib/sync/admin-people"
import { flairById } from "@/lib/profile/flair"
import { getFlairCatalogue } from "@/lib/sync/flairs"
import {
  clearFlairAction,
  deleteProfileAction,
  saveProfileAction,
  unlinkProfileAction,
} from "../actions"
import { AdminPeopleSearch } from "./people-search"

const labelCls =
  "font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
const inputCls =
  "mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-pink"

const tagCls =
  "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"

const actionCls =
  "font-mono text-[11px] uppercase tracking-wider transition-colors"

/**
 * The People tab: everyone we hold a profile row for, curated or claimed.
 *
 * One list rather than a list of pros and a separate list of accounts,
 * because the questions asked here cross that line — "who is flying this
 * badge", "who owns this profile", "is this the pro or an impostor" are all
 * about the same row. Curation and ownership stay separate *actions*, so
 * unlinking an account never quietly demotes a pro and vice versa.
 */
export async function PeopleTab({ editId }: { editId: number | null }) {
  const editing =
    editId && Number.isInteger(editId)
      ? await getProfileRecord(editId)
      : null
  const people = await listAdminPeople()
  // Resolved against the curated catalogue, not the built-in pair, or this list
  // would show a raw id for every badge minted since the last deploy.
  const catalogue = await getFlairCatalogue()
  const pros = people.filter((p) => p.isPro).length
  const linked = people.filter((p) => p.userId).length

  return (
    <div className="flex flex-col gap-10">

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">
            People{" "}
            <span className="font-mono text-sm font-normal text-muted-foreground">
              ({people.length} · {pros} pro · {linked} linked)
            </span>
          </h2>
          <AdminPeopleSearch />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone with a profile row — pros you curated and accounts that
          claimed themselves. Pro status and titles are curation; the linked
          account and the flair belong to the player.
        </p>

        {people.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nobody yet. Add a pro below.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {people.map((p) => {
              const flair = flairById(p.flairId, catalogue)
              const name = p.handle || p.username || `#${p.brawlhallaId}`
              return (
                <li
                  key={p.brawlhallaId}
                  data-admin-search={`${name} ${p.username ?? ""} ${p.handle ?? ""} ${p.email ?? ""} ${p.brawlhallaId}`.toLowerCase()}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
                >
                  <span className="font-medium">{name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    ID {p.brawlhallaId}
                  </span>
                  {p.rating != null ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {p.region ? `${p.region} · ` : ""}
                      {p.rating.toLocaleString()} ELO
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      not synced
                    </span>
                  )}

                  {/* Curation */}
                  {p.isPro ? (
                    <span className={`${tagCls} border-mystic/50 bg-mystic/15 text-mystic`}>
                      Pro{p.handle ? ` · ${p.handle}` : ""}
                    </span>
                  ) : (
                    <span className={`${tagCls} border-border/60 text-muted-foreground/60`}>
                      not pro
                    </span>
                  )}
                  {p.esportsTitles.length > 0 && (
                    <span
                      className={`${tagCls} border-tier-gold/40 bg-tier-gold/10 text-tier-gold`}
                      title={p.esportsTitles.join("\n")}
                    >
                      {p.esportsTitles.length} title
                      {p.esportsTitles.length === 1 ? "" : "s"}
                    </span>
                  )}

                  {/* Ownership — the player's, not ours. */}
                  {p.userId ? (
                    <span
                      className={`${tagCls} border-positive/40 bg-positive/10 text-positive`}
                      title={`Claimed ${p.claimedAt ? p.claimedAt.toISOString().slice(0, 10) : "?"} via ${p.claimMethod ?? "?"}`}
                    >
                      Linked{p.email ? ` · ${p.email}` : ""}
                    </span>
                  ) : (
                    <span className={`${tagCls} border-border/60 text-muted-foreground/60`}>
                      unclaimed
                    </span>
                  )}

                  {/* Flair is a selection; null means "show my best". */}
                  {flair && (
                    <span className={`${tagCls} border-pink/40 bg-pink/10 text-pink`}>
                      Flair · {flair.label}
                    </span>
                  )}

                  <div className="ml-auto flex flex-wrap items-center gap-3">
                    <Link
                      href={`/admin?edit=${p.brawlhallaId}#editor`}
                      className={`${actionCls} text-pink hover:text-foreground`}
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/player/${p.brawlhallaId}`}
                      prefetch={false}
                      className={`${actionCls} text-muted-foreground hover:text-foreground`}
                    >
                      View
                    </Link>
                    {flair && (
                      <form action={clearFlairAction}>
                        <input type="hidden" name="brawlhallaId" value={p.brawlhallaId} />
                        <button type="submit" className={`${actionCls} text-pink hover:opacity-80`}>
                          Clear flair
                        </button>
                      </form>
                    )}
                    {p.userId && (
                      <form action={unlinkProfileAction}>
                        <input type="hidden" name="brawlhallaId" value={p.brawlhallaId} />
                        <button type="submit" className={`${actionCls} text-negative hover:opacity-80`}>
                          Unlink
                        </button>
                      </form>
                    )}
                    <form action={deleteProfileAction}>
                      <input type="hidden" name="brawlhallaId" value={p.brawlhallaId} />
                      <button type="submit" className={`${actionCls} text-negative hover:opacity-80`}>
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p
          id="admin-no-match"
          hidden
          className="mt-3 text-sm text-muted-foreground"
        >
          Nobody matches that.
        </p>
      </section>

      <div id="editor" />

      <section>
        <h2 className="font-display text-lg font-semibold">
          {editing ? `Edit pro · ${editing.brawlhallaId}` : "Add a pro player"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Register a verified pro by Brawlhalla ID — saving pulls their ranked
          standing onto the pro leaderboard. Find an ID via{" "}
          <Link href="/search" className="text-pink hover:underline">
            search
          </Link>
          .
        </p>

        <form
          action={saveProfileAction}
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
                name="isPro"
                type="checkbox"
                defaultChecked={editing ? editing.isPro : true}
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
            <label className={labelCls} htmlFor="skinFile">
              …or upload a skin image (stored in Vercel Blob)
            </label>
            <input
              id="skinFile"
              name="skinFile"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-pink file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-background hover:file:bg-pink/90"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              On save, an uploaded image replaces the path above. Animated GIFs
              work — they render frame-for-frame, so keep them short and small.
              Hard limit 3&nbsp;MB; a static skin should be well under
              ~500&nbsp;KB.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="esportsTitles">
              Esports titles (one per line)
            </label>
            <textarea
              id="esportsTitles"
              name="esportsTitles"
              rows={3}
              defaultValue={editing?.esportsTitles.join("\n") ?? ""}
              placeholder={"2v2 World Champion '24\n1v1 Midseason Champion '24"}
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-pink px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-pink/90"
            >
              {editing ? "Save changes" : "Add pro"}
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
    </div>
  )
}
