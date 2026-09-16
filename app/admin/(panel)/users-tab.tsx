import Link from "next/link"
import { cn } from "@/lib/utils"
import { listAdminUsers } from "@/lib/sync/admin-users"
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
import { setAccountPlanAction, setAccountRoleAction } from "../actions"

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
  "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"

function RoleTag({ role }: { role: AccountRole }) {
  return <span className={cn(TAG, ROLE_CLASS[role])}>{ROLES[role].label}</span>
}

/** Free is the absence of a subscription, so it gets no tag at all. */
function PlanTag({ plan }: { plan: AccountPlan }) {
  if (plan === "free") return null
  return (
    <span className={cn(TAG, "border-tier-gold/40 bg-tier-gold/10 text-tier-gold")}>
      {PLANS[plan].label}
    </span>
  )
}

/**
 * Admin → Users. Every registered account, newest first, with both axes.
 *
 * Separate from People because People is keyed by brawlhalla_id: it lists
 * profiles, so an account that never claimed a player had no row there and was
 * invisible to the panel. Role and plan belong to the account, so they need the
 * list that is about accounts.
 */
export async function UsersTab() {
  const [users, actorId] = await Promise.all([listAdminUsers(), adminActorId()])

  const selectCls =
    "rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-pink"
  const saveCls =
    "rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-muted"

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
          Brawlhalla profile. Nothing marked unreleased is on sale or visible
          outside this page.
        </p>
      </section>

      {users.length === 0 ? (
        <p className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          No accounts yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => {
            const isSelf = !!actorId && actorId === u.id
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-card/40 p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {u.email ?? "(no email on record)"}
                    </span>
                    <RoleTag role={u.role} />
                    <PlanTag plan={u.plan} />
                    {isSelf && (
                      <span
                        className={cn(
                          TAG,
                          "border-royal/40 bg-royal/10 text-royal",
                        )}
                      >
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="truncate">{u.id}</span>
                    {u.brawlhallaId != null && (
                      <Link
                        href={`/player/${u.brawlhallaId}`}
                        prefetch={false}
                        className="normal-case text-pink underline-offset-2 hover:underline"
                      >
                        {u.username ?? `#${u.brawlhallaId}`}
                      </Link>
                    )}
                    <span>joined {u.createdAt.toISOString().slice(0, 10)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Changing your own role is refused server-side as well —
                      see setAccountRole. Hiding the control here only spares
                      the operator a submit that was always going to bounce. */}
                  {isSelf ? (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Can&apos;t change your own role
                    </span>
                  ) : (
                    <form
                      action={setAccountRoleAction}
                      className="flex items-center gap-1.5"
                    >
                      <input type="hidden" name="userId" value={u.id} />
                      <label className="sr-only" htmlFor={`role-${u.id}`}>
                        Role for {u.email ?? u.id}
                      </label>
                      <select
                        id={`role-${u.id}`}
                        name="role"
                        defaultValue={u.storedRole}
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
                        Role
                      </button>
                    </form>
                  )}

                  <form
                    action={setAccountPlanAction}
                    className="flex items-center gap-1.5"
                  >
                    <input type="hidden" name="userId" value={u.id} />
                    <label className="sr-only" htmlFor={`plan-${u.id}`}>
                      Plan for {u.email ?? u.id}
                    </label>
                    <select
                      id={`plan-${u.id}`}
                      name="plan"
                      defaultValue={u.plan}
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
                      Plan
                    </button>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-base font-semibold">
            Roles — permission
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {Object.values(ROLES)
              .sort((a, b) => a.order - b.order)
              .map((def) => (
                <li key={def.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <RoleTag role={def.id} />
                  <span className="text-muted-foreground">{def.description}</span>
                  {def.id === LINKED_ROLE && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
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
                <li key={def.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={cn(
                      TAG,
                      def.paid
                        ? "border-tier-gold/40 bg-tier-gold/10 text-tier-gold"
                        : "border-border/60 bg-muted/40 text-muted-foreground",
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
    </div>
  )
}
