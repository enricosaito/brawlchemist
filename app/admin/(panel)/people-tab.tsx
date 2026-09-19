import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  getProfileRecord,
  listTitles,
  type EsportsTitle,
} from "@/lib/sync/profiles"
import { listAdminPeople } from "@/lib/sync/admin-people"
import { flairById, FLAIR_NONE, selectableFlairs } from "@/lib/profile/flair"
import { getFlairCatalogue } from "@/lib/sync/flairs"
import {
  getCustomizationRecord,
  type Customization,
} from "@/lib/sync/customizations"
import { SOCIAL_HOSTS, SOCIAL_KINDS, SOCIAL_META } from "@/lib/profile/social"
import { BANNER_PRESETS, DEFAULT_BANNER_ID } from "@/lib/profile/banners"
import { LEGEND_ROSTER } from "@/lib/legends-roster"
import {
  addTitleAction,
  clearFlairAction,
  deleteProfileAction,
  removeTitleAction,
  saveOwnerFieldsAction,
  saveProfileAction,
  unlinkProfileAction,
} from "../actions"
import { AdminPeopleSearch } from "./people-search"

/** Alphabetical: a picker is a lookup, and roster order is release order. */
const LEGEND_OPTIONS = [...LEGEND_ROSTER].sort((a, b) =>
  a.name.localeCompare(b.name)
)

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
  const valid = !!editId && Number.isInteger(editId)
  // One fan-out rather than three sequential awaits — on this screen the cost
  // is round trips, not queries.
  const [editing, custom, titles] = await Promise.all([
    valid ? getProfileRecord(editId) : Promise.resolve(null),
    valid ? getCustomizationRecord(editId) : Promise.resolve(null),
    valid ? listTitles(editId) : Promise.resolve([]),
  ])
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
          claimed themselves. Editing one is three cards, split by who is making
          the claim: what we assert about them (pro, handle), their titles, and
          what they chose for themselves.
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
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
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
                    <span
                      className={`${tagCls} border-mystic/50 bg-mystic/15 text-mystic`}
                    >
                      Pro{p.handle ? ` · ${p.handle}` : ""}
                    </span>
                  ) : (
                    <span
                      className={`${tagCls} border-border/60 text-muted-foreground/60`}
                    >
                      not pro
                    </span>
                  )}
                  {p.titleCount > 0 && (
                    <span
                      className={`${tagCls} border-tier-gold/40 bg-tier-gold/10 text-tier-gold`}
                      title="Championship titles, hand-typed and derived"
                    >
                      {p.titleCount} title
                      {p.titleCount === 1 ? "" : "s"}
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
                    <span
                      className={`${tagCls} border-border/60 text-muted-foreground/60`}
                    >
                      unclaimed
                    </span>
                  )}

                  {/* Flair is a selection; null means "show my best". */}
                  {flair && (
                    <span
                      className={`${tagCls} border-pink/40 bg-pink/10 text-pink`}
                    >
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
                        <input
                          type="hidden"
                          name="brawlhallaId"
                          value={p.brawlhallaId}
                        />
                        <button
                          type="submit"
                          className={`${actionCls} text-pink hover:opacity-80`}
                        >
                          Clear flair
                        </button>
                      </form>
                    )}
                    {p.userId && (
                      <form action={unlinkProfileAction}>
                        <input
                          type="hidden"
                          name="brawlhallaId"
                          value={p.brawlhallaId}
                        />
                        <button
                          type="submit"
                          className={`${actionCls} text-negative hover:opacity-80`}
                        >
                          Unlink
                        </button>
                      </form>
                    )}
                    <form action={deleteProfileAction}>
                      <input
                        type="hidden"
                        name="brawlhallaId"
                        value={p.brawlhallaId}
                      />
                      <button
                        type="submit"
                        className={`${actionCls} text-negative hover:opacity-80`}
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

          {/* Ten of our pros register for tournaments on a second account, so
              their bracket results carry a different Brawlhalla id than the one
              above. Leave it blank when they are the same — which is the usual
              case, and the field says so rather than inviting a guess. */}
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="esportsBrawlhallaId">
              Esports account ID (only if they compete on a different account)
            </label>
            <input
              id="esportsBrawlhallaId"
              name="esportsBrawlhallaId"
              type="number"
              defaultValue={editing?.esportsBrawlhallaId ?? ""}
              placeholder="blank = same as above"
              className={inputCls}
            />
            <p className="mt-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Links their tournament match history. Verify on brawltools before
              entering — a wrong id files someone else&apos;s matches here.
            </p>
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
                className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
              >
                Cancel
              </Link>
            )}
          </div>
        </form>

        {editing && (
          <>
            <TitlesCard brawlhallaId={editing.brawlhallaId} titles={titles} />
            <OwnerFields
              brawlhallaId={editing.brawlhallaId}
              custom={custom}
              favoriteSkin={editing.favoriteSkin}
              catalogue={catalogue}
            />
          </>
        )}
      </section>
    </div>
  )
}

/**
 * Everything the *owner* set, editable by an operator.
 *
 * A separate card and a separate action from the curation form above, for the
 * reason the rest of this tab already works that way: curation and the player's
 * own choices are different claims, and an operator fixing a bad link should
 * not be able to un-verify a pro with the same submit.
 *
 * Until now these were the one category of content on the site nobody could
 * moderate. That is not hypothetical — a profile used its link field to point
 * at a porn site from a page with our name on it, and removing it took raw SQL
 * because no screen could see it. An admin panel that can edit a pro's handle
 * but not the URL they point at the world has the wrong half of the problem.
 *
 * Every field writes through the same function the owner's customizer uses, so
 * the rules are identical: this is reach, not a bypass.
 */
function OwnerFields({
  brawlhallaId,
  custom,
  favoriteSkin,
  catalogue,
}: {
  brawlhallaId: number
  custom: Customization | null
  /**
   * Lives on `profiles` rather than `user_customizations` — the one owner-set
   * field that does, for historical reasons not worth a migration. Which table
   * it sits in is our problem; the operator's question is "did the player
   * choose this", and the answer is yes, so it belongs in this card.
   */
  favoriteSkin: { src: string; name: string } | null
  catalogue: Awaited<ReturnType<typeof getFlairCatalogue>>
}) {
  const links = new Map(custom?.socialLinks.map((l) => [l.kind, l.url]) ?? [])
  const legends = custom?.favoriteLegendIds ?? []
  const selectCls =
    "rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs outline-none focus:border-pink"

  return (
    <div className="mt-6 rounded-xl border border-mystic/30 bg-card/40 p-5">
      <h3 className="font-display text-base font-semibold">Owner-set</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        What this player chose for themselves. Editable here so it can be
        moderated — the same validation runs either way, so a link that
        doesn&apos;t point at the site its icon names is dropped on save.
      </p>

      <form
        action={saveOwnerFieldsAction}
        className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="brawlhallaId" value={brawlhallaId} />

        <div className="sm:col-span-2">
          <span className={labelCls}>Links — must point at the real site</span>
          <div className="mt-1 flex flex-col gap-1.5">
            {SOCIAL_KINDS.map((kind) => (
              <div key={kind} className="flex items-center gap-2">
                <label
                  className={labelCls + " w-20 shrink-0"}
                  htmlFor={"link-" + kind}
                >
                  {SOCIAL_META[kind].label}
                </label>
                <input
                  id={"link-" + kind}
                  name={"link-" + kind}
                  type="url"
                  defaultValue={links.get(kind) ?? ""}
                  placeholder={SOCIAL_HOSTS[kind].join(" / ")}
                  className={"min-w-0 flex-1 " + selectCls}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Clear a field to remove that link.
          </p>
        </div>

        <div className="sm:col-span-1">
          <span className={labelCls}>Favorite legends</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <select
                key={i}
                name={"legend-" + i}
                defaultValue={legends[i] ?? ""}
                aria-label={"Favourite legend " + (i + 1)}
                className={"min-w-0 " + selectCls}
              >
                <option value="">—</option>
                {LEGEND_OPTIONS.map((o) => (
                  <option key={o.legendId} value={o.legendId}>
                    {o.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:col-span-1">
          <div>
            <label className={labelCls} htmlFor="bannerId">
              Banner
            </label>
            <select
              id="bannerId"
              name="bannerId"
              defaultValue={custom?.bannerId ?? DEFAULT_BANNER_ID}
              className={"mt-1 w-full " + selectCls}
            >
              {BANNER_PRESETS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="flairId">
              Flair shown
            </label>
            {/* Three states, not two: empty means "their best earned", which is
                what an untouched profile does. Setting one they have not earned
                renders nothing — entitlement is re-derived on every view. */}
            <select
              id="flairId"
              name="flairId"
              defaultValue={custom?.flairId ?? ""}
              className={"mt-1 w-full " + selectCls}
            >
              <option value="">Automatic (best earned)</option>
              <option value={FLAIR_NONE}>None</option>
              {selectableFlairs(catalogue).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className={labelCls}>Favorite skin</span>
          <p className="mt-1 text-[11px] text-muted-foreground">
            The player picks theirs from the wiki catalogue; you can point this
            anywhere or upload art, which is how a pro gets a skin the catalogue
            doesn&apos;t have. An upload replaces the path on save.
          </p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="sr-only" htmlFor="skinSrc">
                Favorite skin image path
              </label>
              <input
                id="skinSrc"
                name="skinSrc"
                type="text"
                defaultValue={favoriteSkin?.src ?? ""}
                placeholder="https://… or /assets/SKIN_File.png"
                className={"w-full " + selectCls}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="skinName">
                Favorite skin display name
              </label>
              <input
                id="skinName"
                name="skinName"
                type="text"
                defaultValue={favoriteSkin?.name ?? ""}
                placeholder="e.g. Fallen Prince Teros"
                className={"w-full " + selectCls}
              />
            </div>
          </div>
          <input
            id="skinFile"
            name="skinFile"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Upload a skin image"
            className="mt-2 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-pink file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-background hover:file:bg-pink/90"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Animated GIFs work and are served whole — every profile view pays
            the full file. Hard limit 3&nbsp;MB; a static skin should be well
            under ~500&nbsp;KB. Clear the path to remove the skin.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md border border-mystic/50 bg-mystic/10 px-4 py-2 text-sm font-semibold text-mystic transition-colors hover:bg-mystic/20"
          >
            Save owner-set fields
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Every championship title on one profile, in one editable list.
 *
 * There were two homes for these: a textarea writing a jsonb column, and the
 * `esports_titles` table, written by scripts/sync-esports-titles.mjs off
 * Challengermode placements. They were never redundant — the typed ones are the
 * pre-Challengermode history the script structurally cannot reach (BCX '21, the
 * SGG-era worlds), the derived ones are 2025 onward — but keeping them apart
 * meant an operator could edit half of someone's honours and not the other
 * half, and meant the profile merged them at render time by comparing strings.
 * A derivation phrased "World Champion 2v2 '23" against a typed "2v2 World
 * Champion '23" would have shown the same win twice.
 *
 * One list now, with the source named on each row so it is obvious which ones
 * the script will recreate if it runs again.
 */
function TitlesCard({
  brawlhallaId,
  titles,
}: {
  brawlhallaId: number
  titles: EsportsTitle[]
}) {
  return (
    <div className="mt-6 rounded-xl border border-tier-gold/30 bg-card/40 p-5">
      <h3 className="font-display text-base font-semibold">
        Esports titles ({titles.length})
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown as gold tags under the player&apos;s name.{" "}
        <span className="font-medium text-foreground">Derived</span> ones are
        read off Challengermode placements and come back if the sync script runs
        again — a consistently wrong one belongs in that script&apos;s
        allow-list. <span className="font-medium text-foreground">Manual</span>{" "}
        ones are typed here, and are the only way to record anything
        Challengermode never hosted.
      </p>

      {titles.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No titles on this profile.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {titles.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-tier-gold">
                  {t.title}
                </span>
                <span
                  className={cn(
                    tagCls,
                    t.source === "manual"
                      ? "border-mystic/40 bg-mystic/10 text-mystic"
                      : "border-border/60 bg-muted/40 text-muted-foreground"
                  )}
                >
                  {t.source}
                </span>
                {t.tournamentName && (
                  <span className="truncate font-mono text-[10px] tracking-wider text-muted-foreground">
                    {t.tournamentName}
                  </span>
                )}
              </span>
              <form action={removeTitleAction}>
                <input type="hidden" name="brawlhallaId" value={brawlhallaId} />
                <input type="hidden" name="titleId" value={t.id} />
                <button
                  type="submit"
                  className={
                    actionCls + " text-negative hover:text-negative/80"
                  }
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addTitleAction} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="brawlhallaId" value={brawlhallaId} />
        <label className="sr-only" htmlFor="new-title">
          New title
        </label>
        <input
          id="new-title"
          name="title"
          type="text"
          placeholder="e.g. BCX Champion '21"
          className="min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs outline-none focus:border-pink"
        />
        <button
          type="submit"
          className="rounded-md border border-tier-gold/50 bg-tier-gold/10 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider text-tier-gold uppercase transition-colors hover:bg-tier-gold/20"
        >
          Add
        </button>
      </form>
    </div>
  )
}
