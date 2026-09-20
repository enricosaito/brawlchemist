import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { ListQuery } from "@/lib/admin-list"
import {
  getAdminUser,
  listAdminUsers,
  USER_FILTERS,
  type AdminUser,
} from "@/lib/sync/admin-users"
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
  PLANS,
  ROLES,
  type AccountPlan,
  type AccountRole,
} from "@/lib/auth/account"
import { adminActorId } from "@/lib/admin-auth"
import { isCurated } from "@/lib/profile/pro-tier"
import { ProTierTag } from "@/components/site/pro-badge"
import {
  linkProfileFormAction,
  setAccountPlanFormAction,
  setAccountRoleFormAction,
  unlinkProfileFormAction,
} from "../actions"
import { ActionForm } from "./action-form"
import { AdminSearch } from "./admin-search"
import {
  adminHref,
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

/** What the tag means rides on the tag, not in a paragraph above the table. */
function RoleTag({ role }: { role: AccountRole }) {
  return (
    <span
      className={cn(TAG, ROLE_CLASS[role])}
      title={ROLES[role].description}
    >
      {ROLES[role].label}
    </span>
  )
}

/** Free is the absence of a subscription, so it gets no tag at all. */
function PlanTag({ plan }: { plan: AccountPlan }) {
  if (plan === "free") return <Empty />
  return (
    <span
      className={cn(TAG, "border-tier-gold/40 bg-tier-gold/10 text-tier-gold")}
      title={PLANS[plan].description}
    >
      {PLANS[plan].label}
    </span>
  )
}

/**
 * Admin → Users. Every registered account, newest first.
 *
 * A table, because the question this screen answers is a comparison — who is
 * linked, who is a pro, who is flying what — and a comparison wants columns.
 * The table is the scan and carries no controls; acting on a row opens it as
 * `?edituser=`, which renders the forms once, above, with that account's name
 * on them. Same idiom People uses for `?edit=`.
 *
 * Separate from People because People is keyed by brawlhalla_id: an account
 * that never claimed a player has no row there. Role and plan belong to the
 * account, so they need the list that is about accounts.
 */
export async function UsersTab({
  editId,
  query,
}: {
  editId: string | null
  query: ListQuery
}) {
  // One fan-out. The list is a single round trip; the edit card is its own
  // read because the account being edited need not be on the page shown; the
  // profiles map and the flair catalogue are the same app-wide caches every
  // public page already warms, and the only way to say what badge an account
  // is flying without re-deriving entitlement here.
  const [list, editing, actorId, previews, catalogue] = await Promise.all([
    listAdminUsers(query),
    editId ? getAdminUser(editId) : Promise.resolve(null),
    adminActorId(),
    getProfilesMap(),
    getFlairCatalogue(),
  ])

  /** What this account's name actually shows, run through the site's own rule. */
  function flairsFor(u: AdminUser): FlairDef[] {
    if (u.brawlhallaId == null) return []
    const ctx = flairContextFrom(previews.get(u.brawlhallaId))
    return resolveEarnedFlairs(
      u.flairId,
      earnedFlairIds(ctx, catalogue),
      catalogue
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ListHeader title="Accounts" total={list.total}>
        <AdminSearch placeholder="Email, handle, name or ID…" />
        <FilterChips tab="users" query={query} filters={USER_FILTERS} />
      </ListHeader>

      {editing && (
        <EditCard
          user={editing}
          isSelf={actorId === editing.id}
          closeHref={adminHref("users", query)}
        />
      )}

      {list.rows.length === 0 ? (
        <NoRows query={query} />
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
              {list.rows.map((u) => {
                const isSelf = !!actorId && actorId === u.id
                const flairs = flairsFor(u)
                const open = editId === u.id
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30",
                      open && "bg-pink/5"
                    )}
                  >
                    {/* Email only. The UUID is one click away, on the card. */}
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
                      <PlanTag plan={u.plan} />
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
                      {isCurated(u.proTier) ? (
                        <ProTierTag tier={u.proTier} />
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
                          <span className="truncate font-mono text-[10px] tracking-wider text-muted-foreground">
                            {flairs[0].label}
                          </span>
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        TD,
                        "font-mono text-xs whitespace-nowrap text-muted-foreground"
                      )}
                    >
                      {u.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className={cn(TD, "text-right whitespace-nowrap")}>
                      <Link
                        href={adminHref(
                          "users",
                          query,
                          open ? {} : { edituser: u.id }
                        )}
                        prefetch={false}
                        scroll={false}
                        className={cn(
                          ROW_ACTION,
                          "text-muted-foreground hover:text-pink"
                        )}
                      >
                        {open ? "Close" : "Manage"}
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
        tab="users"
        query={query}
        total={list.total}
        pageSize={list.pageSize}
      />
    </div>
  )
}

/**
 * The controls for one account, rendered once instead of once per row. Every
 * form here returns its verdict in place (ActionForm); the destructive one
 * asks twice.
 */
function EditCard({
  user,
  isSelf,
  closeHref,
}: {
  user: AdminUser
  isSelf: boolean
  closeHref: string
}) {
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
          href={closeHref}
          prefetch={false}
          scroll={false}
          className={cn(
            ROW_ACTION,
            "text-muted-foreground hover:text-foreground"
          )}
        >
          Close
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
        {/* Linking by hand skips the ELO challenge, which exists to prove
            ownership to us — an operator who already knows whose account this
            is has nothing to prove. The refusals still apply and are named
            inline: one player per account, and a player already owned by
            someone else has to be unlinked there first. */}
        <Field label="Linked player">
          {user.brawlhallaId == null ? (
            <ActionForm action={linkProfileFormAction} submitLabel="Link">
              <input type="hidden" name="userId" value={user.id} />
              <label className="sr-only" htmlFor={`link-${user.id}`}>
                Brawlhalla ID to link to {user.email ?? user.id}
              </label>
              <input
                id={`link-${user.id}`}
                name="brawlhallaId"
                inputMode="numeric"
                placeholder="Brawlhalla ID"
                className={cn(CONTROL, "w-[132px]")}
              />
            </ActionForm>
          ) : (
            <ActionForm
              action={unlinkProfileFormAction}
              submitLabel="Unlink"
              confirm="Confirm unlink"
              submitClassName="text-negative"
            >
              <input
                type="hidden"
                name="brawlhallaId"
                value={user.brawlhallaId}
              />
              <Link
                href={`/player/${user.brawlhallaId}`}
                prefetch={false}
                className="font-mono text-xs text-pink underline-offset-2 hover:underline"
              >
                {user.handle ?? user.username ?? `#${user.brawlhallaId}`}
              </Link>
            </ActionForm>
          )}
        </Field>

        {/* Changing your own role is refused server-side as well — see
            setAccountRole. Hiding the control only spares a submit that was
            always going to bounce. */}
        <Field label="Role">
          {isSelf ? (
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Can&apos;t change your own role
            </span>
          ) : (
            <ActionForm action={setAccountRoleFormAction} submitLabel="Save">
              <input type="hidden" name="userId" value={user.id} />
              <label className="sr-only" htmlFor={`role-${user.id}`}>
                Role for {user.email ?? user.id}
              </label>
              <select
                id={`role-${user.id}`}
                name="role"
                defaultValue={user.storedRole}
                className={CONTROL}
              >
                {ASSIGNABLE_ROLES.map((id) => (
                  <option key={id} value={id}>
                    {ROLES[id].label}
                    {ROLES[id].released ? "" : " (unreleased)"}
                  </option>
                ))}
              </select>
            </ActionForm>
          )}
        </Field>

        <Field label="Plan">
          <ActionForm action={setAccountPlanFormAction} submitLabel="Save">
            <input type="hidden" name="userId" value={user.id} />
            <label className="sr-only" htmlFor={`plan-${user.id}`}>
              Plan for {user.email ?? user.id}
            </label>
            <select
              id={`plan-${user.id}`}
              name="plan"
              defaultValue={user.plan}
              className={CONTROL}
            >
              {ASSIGNABLE_PLANS.map((id) => (
                <option key={id} value={id}>
                  {PLANS[id].label}
                  {PLANS[id].released ? "" : " (unreleased)"}
                </option>
              ))}
            </select>
          </ActionForm>
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
