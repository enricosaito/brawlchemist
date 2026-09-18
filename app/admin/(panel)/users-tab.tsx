import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { listAdminUsers, type AdminUser } from "@/lib/sync/admin-users"
import { getProfilesMap } from "@/lib/sync/profiles"
import { getFlairCatalogue } from "@/lib/sync/flairs"
import {
  flairContextFrom,
  resolveEarnedFlairs,
  earnedFlairIds,
  type FlairDef,
} from "@/lib/profile/flair"
import {
  ASSIGNABLE_PLANS,
  ASSIGNABLE_ROLES,
  LINKED_ROLE,
  PLANS,
  ROLES,
  type AccountPlan,
  type AccountRole,
} from "@/lib/auth/account"
import { adminActorId } from "@/lib/admin-auth"
import {
  linkProfileAction,
  setAccountPlanAction,
  setAccountRoleAction,
  unlinkProfileAction,
} from "../actions"

/**
 * Accents. Developer is the only thing on this screen that carries power today,
 * so it is the only one that shouts. Everything unreleased stays muted until it
 * does something, or the panel advertises capability that isn't there.
 */
const ROLE_CLASS: Record<AccountRole, string> = {
  developer: "border-pink/50 bg-pink/15 text-pink",
  partner: "border-border/60 bg-muted/40 text-muted-foreground",
  linked: "border-mystic/40 bg-mystic/10 text-mystic",
  user: "border-border/60 bg-muted/40 text-muted-foreground",
}

const TAG =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"

const TH =
  "px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
const TD = "px-3 py-2 align-middle"

const selectCls =
  "rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-pink"
const saveCls =
  "rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-muted"

function RoleTag({ role }: { role: AccountRole }) {
  return <span className={cn(TAG, ROLE_CLASS[role])}>{ROLES[role].label}</span>
}

/** Free is the absence of a subscription, so it gets no tag at all. */
function PlanTag({ plan }: { plan: AccountPlan }) {
  if (plan === "free") return null
  return (
    <span
      className={cn(TAG, "border-tier-gold/40 bg-tier-gold/10 text-tier-gold")}
    >
      {PLANS[plan].label}
    </span>
  )
}

/** An em dash, so an empty cell reads as "nothing here" rather than "broken". */
function Empty() {
  return <span className="font-mono text-xs text-muted-foreground/60">—</span>
}

/**
 * Admin → Users. Every registered account, newest first.
 *
 * A table, because the question this screen answers is a comparison — who is
 * linked, who is a pro, who is flying what — and a comparison wants columns.
 * It used to be a stack of cards with three forms in each, which meant every
 * account was a paragraph tall and you scrolled past the controls for fifty
 * people to check one fact about one of them.
 *
 * So the table is the scan and it carries no controls at all; acting on a row
 * opens it as `?edituser=`, which renders the forms once, above, with that
 * account's name on them. Same idiom the People tab already uses for `?edit=`,
 * and it is what lets the row stay one line high.
 *
 * Separate from People because People is keyed by brawlhalla_id: it lists
 * profiles, so an account that never claimed a player had no row there and was
 * invisible to the panel. Role and plan belong to the account, so they need the
 * list that is about accounts.
 */
export async function UsersTab({ editId }: { editId: string | null }) {
  // Three reads, one of which actually costs anything. `listAdminUsers` is a
  // single round trip; the profiles map and the flair catalogue are the same
  // app-wide caches every public page already warms, so on a live site they are
  // free — and they are the only way to answer "what badge is this account
  // flying" without re-deriving entitlement here and letting it drift from the
  // rule the site renders.
  const [users, actorId, previews, catalogue] = await Promise.all([
    listAdminUsers(),
    adminActorId(),
    getProfilesMap(),
    getFlairCatalogue(),
  ])

  const editing = editId ? users.find((u) => u.id === editId) : undefined

  /** What this account's name actually shows, run through the site's own rule. */
  function flairsFor(u: AdminUser): FlairDef[] {
    if (u.brawlhallaId == null) return []
    const ctx = flairContextFrom(previews.get(u.brawlhallaId))
    return resolveEarnedFlairs(u.flairId, earnedFlairIds(ctx, catalogue), catalogue)
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-display text-lg font-semibold">Accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Two independent axes.{" "}
          <span className="font-medium text-foreground">Role</span> is
          permission — Developer reaches this panel, Partner is reserved.{" "}
          <span className="font-medium text-foreground">Plan</span> is
          subscription, and carries no permissions, so a lapsed payment can
          never cost someone their access.{" "}
          <span className="font-medium text-foreground">Linked User</span> is
          not a setting: it is what a regular account becomes once it claims a
          Brawlhalla profile — normally by passing the ELO challenge, and from
          here by an operator vouching instead.
        </p>
      </section>

      {editing && <EditCard user={editing} isSelf={actorId === editing.id} />}

      {users.length === 0 ? (
        <p className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          No accounts yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm">
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className={TH}>Account</th>
                <th className={TH}>Role</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Linked player</th>
                <th className={TH}>Pro</th>
                <th className={TH}>Flair</th>
                <th className={TH}>Joined</th>
                <th className={cn(TH, "text-right")}>Manage</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = !!actorId && actorId === u.id
                const flairs = flairsFor(u)
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30",
                      editId === u.id && "bg-pink/5"
                    )}
                  >
                    {/* Email only. The account UUID used to sit under it and
                        it cost ~200px of a table that then clipped its own
                        last column — and nobody scans a list of people by
                        UUID. It is still one click away, in the card that
                        actually acts on the row. */}
                    <td className={cn(TD, "max-w-[300px]")}>
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {u.email ?? "(no email on record)"}
                        </span>
                        {isSelf && (
                          <span
                            className={cn(
                              TAG,
                              "border-royal/40 bg-royal/10 text-royal"
                            )}
                          >
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={TD}>
                      <RoleTag role={u.role} />
                    </td>
                    <td className={TD}>
                      {u.plan === "free" ? <Empty /> : <PlanTag plan={u.plan} />}
                    </td>
                    <td className={TD}>
                      {u.brawlhallaId == null ? (
                        <Empty />
                      ) : (
                        <Link
                          href={`/player/${u.brawlhallaId}`}
                          prefetch={false}
                          className="text-pink underline-offset-2 hover:underline"
                        >
                          {u.handle ?? u.username ?? `#${u.brawlhallaId}`}
                        </Link>
                      )}
                    </td>
                    <td className={TD}>
                      {u.isPro ? (
                        <span
                          className={cn(
                            TAG,
                            "border-mystic/40 bg-mystic/10 text-mystic"
                          )}
                        >
                          Pro
                        </span>
                      ) : (
                        <Empty />
                      )}
                    </td>
                    <td className={TD}>
                      {flairs.length === 0 ? (
                        <Empty />
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {flairs.map((f) => (
                            <Image
                              key={f.id}
                              src={f.src}
                              alt={f.label}
                              title={f.label}
                              width={f.width}
                              height={f.height}
                              unoptimized
                              className="h-5 w-auto object-contain select-none"
                            />
                          ))}
                          {/* Named as well as drawn: an operator is reading
                              this to answer "which badge", and the art is 20px. */}
                          <span className="truncate font-mono text-[10px] tracking-wider text-muted-foreground">
                            {flairs[0].label}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, "font-mono text-xs whitespace-nowrap text-muted-foreground")}>
                      {u.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className={cn(TD, "text-right whitespace-nowrap")}>
                      <Link
                        href={
                          editId === u.id
                            ? "/admin?tab=users"
                            : `/admin?tab=users&edituser=${u.id}`
                        }
                        scroll={false}
                        className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-pink"
                      >
                        {editId === u.id ? "Close" : "Manage"}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Legend />
    </div>
  )
}

/**
 * The controls for one account, rendered once instead of once per row.
 *
 * Every form here was previously inline in the list. Pulled out, the table gets
 * to be a table, and the destructive one (Unlink) stops sitting in a row you
 * are only scrolling past.
 */
function EditCard({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  return (
    <section className="rounded-2xl border border-pink/40 bg-card/60 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">
            {user.email ?? user.id}
          </h3>
          <p className="truncate font-mono text-[10px] tracking-wider text-muted-foreground">
            {user.id}
          </p>
        </div>
        <Link
          href="/admin?tab=users"
          scroll={false}
          className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          Close
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
        {/* Linking by hand skips the ELO challenge, which exists to prove
            ownership to us — an operator who already knows whose account this
            is has nothing to prove. The refusals still apply: one player per
            account, and a player already owned by someone else has to be
            unlinked there first. */}
        <Field label="Linked player">
          {user.brawlhallaId == null ? (
            <form action={linkProfileAction} className="flex items-center gap-1.5">
              <input type="hidden" name="userId" value={user.id} />
              <label className="sr-only" htmlFor={`link-${user.id}`}>
                Brawlhalla ID to link to {user.email ?? user.id}
              </label>
              <input
                id={`link-${user.id}`}
                name="brawlhallaId"
                inputMode="numeric"
                placeholder="Brawlhalla ID"
                className={cn(selectCls, "w-[132px]")}
              />
              <button type="submit" className={saveCls}>
                Link
              </button>
            </form>
          ) : (
            <form
              action={unlinkProfileAction}
              className="flex items-center gap-1.5"
            >
              <input
                type="hidden"
                name="brawlhallaId"
                value={user.brawlhallaId}
              />
              {/* Sends the operator back to this tab rather than to People,
                  which is where the same action is also used. */}
              <input type="hidden" name="from" value="users" />
              <span className="font-mono text-xs">
                {user.handle ?? user.username ?? `#${user.brawlhallaId}`}
              </span>
              <button type="submit" className={cn(saveCls, "text-negative")}>
                Unlink
              </button>
            </form>
          )}
        </Field>

        {/* Changing your own role is refused server-side as well — see
            setAccountRole. Hiding the control here only spares the operator a
            submit that was always going to bounce. */}
        <Field label="Role">
          {isSelf ? (
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Can&apos;t change your own role
            </span>
          ) : (
            <form
              action={setAccountRoleAction}
              className="flex items-center gap-1.5"
            >
              <input type="hidden" name="userId" value={user.id} />
              <label className="sr-only" htmlFor={`role-${user.id}`}>
                Role for {user.email ?? user.id}
              </label>
              <select
                id={`role-${user.id}`}
                name="role"
                defaultValue={user.storedRole}
                className={selectCls}
              >
                {ASSIGNABLE_ROLES.map((id) => (
                  <option key={id} value={id}>
                    {ROLES[id].label}
                    {ROLES[id].released ? "" : " (unreleased)"}
                  </option>
                ))}
              </select>
              <button type="submit" className={saveCls}>
                Save
              </button>
            </form>
          )}
        </Field>

        <Field label="Plan">
          <form
            action={setAccountPlanAction}
            className="flex items-center gap-1.5"
          >
            <input type="hidden" name="userId" value={user.id} />
            <label className="sr-only" htmlFor={`plan-${user.id}`}>
              Plan for {user.email ?? user.id}
            </label>
            <select
              id={`plan-${user.id}`}
              name="plan"
              defaultValue={user.plan}
              className={selectCls}
            >
              {ASSIGNABLE_PLANS.map((id) => (
                <option key={id} value={id}>
                  {PLANS[id].label}
                  {PLANS[id].released ? "" : " (unreleased)"}
                </option>
              ))}
            </select>
            <button type="submit" className={saveCls}>
              Save
            </button>
          </form>
        </Field>
      </div>
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

/** What the two axes mean, kept below the data rather than above it. */
function Legend() {
  return (
    <section className="grid gap-6 sm:grid-cols-2">
      <div>
        <h2 className="font-display text-base font-semibold">
          Roles — permission
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {Object.values(ROLES)
            .sort((a, b) => a.order - b.order)
            .map((def) => (
              <li
                key={def.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <RoleTag role={def.id} />
                <span className="text-muted-foreground">{def.description}</span>
                {def.id === LINKED_ROLE && (
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">
                    derived
                  </span>
                )}
              </li>
            ))}
        </ul>
      </div>
      <div>
        <h2 className="font-display text-base font-semibold">
          Plans — subscription
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {Object.values(PLANS)
            .sort((a, b) => a.order - b.order)
            .map((def) => (
              <li
                key={def.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span
                  className={cn(
                    TAG,
                    def.paid
                      ? "border-tier-gold/40 bg-tier-gold/10 text-tier-gold"
                      : "border-border/60 bg-muted/40 text-muted-foreground"
                  )}
                >
                  {def.label}
                </span>
                <span className="text-muted-foreground">{def.description}</span>
              </li>
            ))}
        </ul>
      </div>
    </section>
  )
}
