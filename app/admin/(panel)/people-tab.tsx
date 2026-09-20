import { cn } from "@/lib/utils"
import Link from "next/link"
import { Plus } from "lucide-react"
import type { ListQuery } from "@/lib/admin-list"
import {
  getProfileRecord,
  listTitles,
  type EsportsTitle,
} from "@/lib/sync/profiles"
import {
  getAdminPerson,
  getProEvidence,
  listAdminPeople,
  PEOPLE_FILTERS,
  type AdminPerson,
  type ProEvidence,
} from "@/lib/sync/admin-people"
import {
  ASSIGNABLE_PRO_TIERS,
  isCurated,
  PRO_TIER_DEFS,
} from "@/lib/profile/pro-tier"
import { ProTierTag } from "@/components/site/pro-badge"
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
  clearFlairFormAction,
  deleteProfileFormAction,
  removeTitleAction,
  saveOwnerFieldsAction,
  saveProfileAction,
  unlinkProfileFormAction,
} from "../actions"
import { ActionForm } from "./action-form"
import { AdminSearch } from "./admin-search"
import {
  adminHref,
  BUTTON,
  CONTROL,
  Empty,
  FilterChips,
  ListHeader,
  NoRows,
  Pager,
  ROW_ACTION,
  TAG,
  TD,
  TH,
} from "./list-chrome"

/** Alphabetical: a picker is a lookup, and roster order is release order. */
const LEGEND_OPTIONS = [...LEGEND_ROSTER].sort((a, b) =>
  a.name.localeCompare(b.name)
)

const labelCls =
  "font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
const inputCls =
  "mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-pink"
const hintCls = "mt-1 text-[11px] text-muted-foreground"

/**
 * The People tab: everyone we hold a profile row for, curated or claimed.
 *
 * One list rather than a list of pros and a separate list of accounts,
 * because the questions asked here cross that line — "who is flying this
 * badge", "who owns this profile", "is this the pro or an impostor" are all
 * about the same row. Curation and ownership stay separate *actions*, so
 * unlinking an account never quietly demotes a pro and vice versa.
 *
 * The table is the scan; `?edit=` opens one editor above it, and `?add=1`
 * opens the same editor empty. The destructive controls live on the editor's
 * header, where the name they act on is the title — not on a row you are
 * scrolling past.
 */
export async function PeopleTab({
  editId,
  add,
  query,
}: {
  editId: number | null
  add: boolean
  query: ListQuery
}) {
  const valid = !!editId && Number.isInteger(editId)
  // One fan-out for everything — on this screen the cost is round trips, not
  // queries. The catalogue is resolved against the curated table, not the
  // built-in pair, or this list would show a raw id for every badge minted
  // since the last deploy.
  const [editing, editingRow, custom, titles, list, catalogue, evidence] =
    await Promise.all([
      valid ? getProfileRecord(editId) : Promise.resolve(null),
      valid ? getAdminPerson(editId) : Promise.resolve(null),
      valid ? getCustomizationRecord(editId) : Promise.resolve(null),
      valid ? listTitles(editId) : Promise.resolve([]),
      listAdminPeople(query),
      getFlairCatalogue(),
      valid ? getProEvidence(editId) : Promise.resolve(null),
    ])
  const showEditor = add || !!editing || (valid && !editing)

  return (
    <div className="flex flex-col gap-4">
      <ListHeader title="People" total={list.total}>
        <AdminSearch placeholder="Handle, name, email or ID…" />
        <FilterChips tab="people" query={query} filters={PEOPLE_FILTERS} />
        <Link
          href={adminHref("people", query, { add: 1 })}
          prefetch={false}
          scroll={false}
          className={cn(
            BUTTON,
            "border-pink/50 bg-pink/15 text-pink hover:bg-pink/25"
          )}
        >
          <Plus className="size-3.5" aria-hidden />
          Add pro
        </Link>
      </ListHeader>

      {showEditor && (
        <Editor
          editing={editing}
          editId={valid ? editId : null}
          row={editingRow ?? undefined}
          custom={custom}
          titles={titles}
          catalogue={catalogue}
          evidence={evidence}
          closeHref={adminHref("people", query)}
        />
      )}

      {list.rows.length === 0 ? (
        <NoRows query={query} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className={TH}>Player</th>
                <th className={TH}>Ladder</th>
                <th className={TH}>Curation</th>
                <th className={TH}>Titles</th>
                <th className={TH}>Account</th>
                <th className={TH}>Flair</th>
                <th className={cn(TH, "text-right")}>Manage</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((p) => {
                const flair = flairById(p.flairId, catalogue)
                const name = p.handle || p.username || `#${p.brawlhallaId}`
                const open = editing?.brawlhallaId === p.brawlhallaId
                return (
                  <tr
                    key={p.brawlhallaId}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30",
                      open && "bg-pink/5"
                    )}
                  >
                    <td className={cn(TD, "max-w-[260px]")}>
                      <div className="flex flex-col">
                        <Link
                          href={`/player/${p.brawlhallaId}`}
                          prefetch={false}
                          className="truncate font-medium underline-offset-2 hover:text-pink hover:underline"
                        >
                          {name}
                        </Link>
                        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                          #{p.brawlhallaId}
                          {p.handle && p.username && p.username !== p.handle
                            ? ` · ${p.username}`
                            : ""}
                        </span>
                      </div>
                    </td>
                    <td
                      className={cn(
                        TD,
                        "font-mono text-xs whitespace-nowrap tabular-nums"
                      )}
                    >
                      {p.rating != null ? (
                        <>
                          {p.region && (
                            <span className="text-muted-foreground">
                              {p.region} ·{" "}
                            </span>
                          )}
                          {p.rating.toLocaleString()}
                        </>
                      ) : (
                        <span className="text-muted-foreground/60">
                          not synced
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      {isCurated(p.proTier) ? (
                        <ProTierTag tier={p.proTier} />
                      ) : (
                        <Empty />
                      )}
                    </td>
                    <td className={cn(TD, "font-mono text-xs tabular-nums")}>
                      {p.titleCount > 0 ? (
                        <span className="text-tier-gold">{p.titleCount}</span>
                      ) : (
                        <Empty />
                      )}
                    </td>
                    <td className={cn(TD, "max-w-[240px]")}>
                      {p.userId ? (
                        <span
                          className="block truncate font-mono text-xs text-positive"
                          title={`Claimed ${p.claimedAt ? p.claimedAt.toISOString().slice(0, 10) : "?"} via ${p.claimMethod ?? "?"}`}
                        >
                          {p.email ?? "linked"}
                        </span>
                      ) : (
                        <Empty />
                      )}
                    </td>
                    <td className={cn(TD, "font-mono text-xs")}>
                      {flair ? (
                        <span className="text-pink">{flair.label}</span>
                      ) : (
                        <Empty />
                      )}
                    </td>
                    <td className={cn(TD, "text-right whitespace-nowrap")}>
                      <Link
                        href={
                          open
                            ? adminHref("people", query)
                            : adminHref("people", query, {
                                edit: p.brawlhallaId,
                              })
                        }
                        prefetch={false}
                        scroll={false}
                        className={cn(
                          ROW_ACTION,
                          "text-muted-foreground hover:text-pink"
                        )}
                      >
                        {open ? "Close" : "Edit"}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        tab="people"
        query={query}
        total={list.total}
        pageSize={list.pageSize}
      />
    </div>
  )
}

/**
 * The editor: curation (what we assert), titles, and the owner-set fields —
 * three forms, split by who is making the claim, so an operator fixing a bad
 * link cannot un-verify a pro with the same submit.
 */
/** 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 13 -> 13th. */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"
  return `${n}${suffix}`
}

function Editor({
  editing,
  editId,
  row,
  custom,
  titles,
  catalogue,
  evidence,
  closeHref,
}: {
  editing: Awaited<ReturnType<typeof getProfileRecord>>
  editId: number | null
  row: AdminPerson | undefined
  custom: Customization | null
  titles: EsportsTitle[]
  catalogue: Awaited<ReturnType<typeof getFlairCatalogue>>
  evidence: ProEvidence | null
  closeHref: string
}) {
  const name = editing
    ? (editing.handle ?? row?.username ?? `#${editing.brawlhallaId}`)
    : null
  const dangerCls = "text-negative"
  return (
    <section
      id="editor"
      className="rounded-2xl border border-pink/40 bg-card/60 p-4 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">
            {editing ? name : "New pro"}
          </h3>
          {editing && (
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
              #{editing.brawlhallaId}
              {row?.email ? ` · ${row.email}` : ""}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {editing && (
            <>
              <Link
                href={`/player/${editing.brawlhallaId}`}
                prefetch={false}
                className={cn(BUTTON, "text-muted-foreground")}
              >
                View profile
              </Link>
              {row?.flairId && (
                <ActionForm
                  action={clearFlairFormAction}
                  submitLabel="Clear flair"
                >
                  <input
                    type="hidden"
                    name="brawlhallaId"
                    value={editing.brawlhallaId}
                  />
                </ActionForm>
              )}
              {row?.userId && (
                <ActionForm
                  action={unlinkProfileFormAction}
                  submitLabel="Unlink"
                  confirm="Confirm unlink"
                  submitClassName={dangerCls}
                >
                  <input
                    type="hidden"
                    name="brawlhallaId"
                    value={editing.brawlhallaId}
                  />
                </ActionForm>
              )}
              <ActionForm
                action={deleteProfileFormAction}
                submitLabel="Delete"
                confirm="Confirm delete"
                submitClassName={dangerCls}
              >
                <input
                  type="hidden"
                  name="brawlhallaId"
                  value={editing.brawlhallaId}
                />
              </ActionForm>
            </>
          )}
          <Link
            href={closeHref}
            prefetch={false}
            scroll={false}
            className={cn(
              ROW_ACTION,
              "px-2 text-muted-foreground hover:text-foreground"
            )}
          >
            Close
          </Link>
        </div>
      </div>

      {/* Curation. Answers in place like every other control on this panel —
          a redirect here meant a second document load with the profiles cache
          freshly busted, and the standing pull it used to make on every save
          is now only made for a pro who has none. */}
      <ActionForm
        action={saveProfileAction}
        submitLabel={editing ? "Save" : "Add pro"}
        submitClassName="h-9 border-pink/50 bg-pink/15 text-pink hover:bg-pink/25"
        className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-[150px_1fr_1fr_180px_auto]"
      >
        <div>
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
        <div>
          <label className={labelCls} htmlFor="handle">
            Handle
          </label>
          <input
            id="handle"
            name="handle"
            type="text"
            defaultValue={editing?.handle ?? ""}
            placeholder="Shown beside the Pro badge"
            className={inputCls}
          />
        </div>
        {/* Ten of our pros compete on a second account. Blank means "same
            as above", which is the usual case. */}
        <div>
          <label className={labelCls} htmlFor="esportsBrawlhallaId">
            Esports account ID
          </label>
          <input
            id="esportsBrawlhallaId"
            name="esportsBrawlhallaId"
            type="number"
            defaultValue={editing?.esportsBrawlhallaId ?? ""}
            placeholder="Blank = same account"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="proTier">
            Standing
          </label>
          {/* A ladder, not a checkbox: a regional regular and a world
              champion used to fly the same badge. The picker names what each
              level asserts, because that is the operator's whole decision —
              see the evidence line beneath. */}
          <select
            id="proTier"
            name="proTier"
            defaultValue={editing ? editing.proTier : "pro"}
            className={inputCls}
          >
            {ASSIGNABLE_PRO_TIERS.map((id) => (
              <option key={id} value={id}>
                {PRO_TIER_DEFS[id].label}
              </option>
            ))}
          </select>
        </div>
      </ActionForm>

      {/* What we hold about their career, so a tier is chosen against
          something. Evidence, not a rule — nothing here promotes anyone. */}
      {evidence && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className={labelCls}>Evidence</span>{" "}
          {evidence.events === 0 && evidence.titles === 0 ? (
            <>No tournament record — Challengermode only covers 2025 onward.</>
          ) : (
            <>
              {evidence.titles} title{evidence.titles === 1 ? "" : "s"} ·{" "}
              {evidence.events} event{evidence.events === 1 ? "" : "s"}
              {evidence.bestPlacement != null && (
                <> · best finish {ordinal(evidence.bestPlacement)}</>
              )}
            </>
          )}
        </p>
      )}

      {editing && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <TitlesCard brawlhallaId={editing.brawlhallaId} titles={titles} />
          <OwnerFields
            brawlhallaId={editing.brawlhallaId}
            custom={custom}
            favoriteSkin={editing.favoriteSkin}
            catalogue={catalogue}
          />
        </div>
      )}
    </section>
  )
}

/**
 * Everything the *owner* set, editable by an operator so it can be moderated.
 * Every field writes through the same function the owner's customizer uses,
 * so the rules are identical: this is reach, not a bypass.
 */
function OwnerFields({
  brawlhallaId,
  custom,
  favoriteSkin,
  catalogue,
}: {
  brawlhallaId: number
  custom: Customization | null
  /** Lives on `profiles` for historical reasons; the operator's question is
   * "did the player choose this", and the answer is yes. */
  favoriteSkin: { src: string; name: string } | null
  catalogue: Awaited<ReturnType<typeof getFlairCatalogue>>
}) {
  const links = new Map(custom?.socialLinks.map((l) => [l.kind, l.url]) ?? [])
  const legends = custom?.favoriteLegendIds ?? []

  return (
    <div className="rounded-xl border border-mystic/30 bg-card/40 p-4">
      <h4 className="font-display text-sm font-semibold">Owner-set</h4>
      <form
        action={saveOwnerFieldsAction}
        className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="brawlhallaId" value={brawlhallaId} />

        <div className="sm:col-span-2">
          <span className={labelCls}>Links</span>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {SOCIAL_KINDS.map((kind) => (
              <div key={kind} className="flex items-center gap-2">
                <label
                  className={cn(labelCls, "w-16 shrink-0")}
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
                  className={cn("min-w-0 flex-1", CONTROL)}
                />
              </div>
            ))}
          </div>
          <p className={hintCls}>
            A link that does not point at the site its icon names is dropped
            on save. Clear a field to remove it.
          </p>
        </div>

        <div>
          <span className={labelCls}>Favorite legends</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <select
                key={i}
                name={"legend-" + i}
                defaultValue={legends[i] ?? ""}
                aria-label={"Favourite legend " + (i + 1)}
                className={cn("min-w-0", CONTROL)}
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

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls} htmlFor="bannerId">
              Banner
            </label>
            <select
              id="bannerId"
              name="bannerId"
              defaultValue={custom?.bannerId ?? DEFAULT_BANNER_ID}
              className={cn("mt-1 w-full", CONTROL)}
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
            {/* Three states: empty is "their best earned"; one they have not
                earned renders nothing, since entitlement is re-derived. */}
            <select
              id="flairId"
              name="flairId"
              defaultValue={custom?.flairId ?? ""}
              className={cn("mt-1 w-full", CONTROL)}
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
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <input
              id="skinSrc"
              name="skinSrc"
              type="text"
              aria-label="Favorite skin image path"
              defaultValue={favoriteSkin?.src ?? ""}
              placeholder="https://… or /assets/SKIN_File.png"
              className={cn("w-full", CONTROL)}
            />
            <input
              id="skinName"
              name="skinName"
              type="text"
              aria-label="Favorite skin display name"
              defaultValue={favoriteSkin?.name ?? ""}
              placeholder="e.g. Fallen Prince Teros"
              className={cn("w-full", CONTROL)}
            />
          </div>
          <input
            id="skinFile"
            name="skinFile"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Upload a skin image"
            className="mt-2 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-pink file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-background hover:file:bg-pink/90"
          />
          <p className={hintCls}>
            Upload replaces the path. Max 3&nbsp;MB, served whole on every
            view — keep a static skin under ~500&nbsp;KB. Clear the path to
            remove.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md border border-mystic/50 bg-mystic/10 px-4 py-2 text-sm font-semibold text-mystic transition-colors hover:bg-mystic/20"
          >
            Save owner-set
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Every championship title on one profile, in one editable list. Derived rows
 * come off Challengermode placements and return if the sync script runs
 * again; manual rows are the only way to record anything it never hosted.
 */
function TitlesCard({
  brawlhallaId,
  titles,
}: {
  brawlhallaId: number
  titles: EsportsTitle[]
}) {
  return (
    <div className="rounded-xl border border-tier-gold/30 bg-card/40 p-4">
      <h4 className="font-display text-sm font-semibold">
        Esports titles{" "}
        <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
          {titles.length}
        </span>
      </h4>

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
                    TAG,
                    t.source === "manual"
                      ? "border-mystic/40 bg-mystic/10 text-mystic"
                      : "border-border/60 bg-muted/40 text-muted-foreground"
                  )}
                  title={
                    t.source === "manual"
                      ? "Typed here"
                      : "Derived from Challengermode — the sync script recreates it"
                  }
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
                  className={cn(
                    ROW_ACTION,
                    "text-negative hover:text-negative/80"
                  )}
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
          className={cn("min-w-0 flex-1", CONTROL)}
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
