/**
 * What an account is, on two independent axes.
 *
 * ROLE is permission: what this person may do (Developer, Partner, regular
 * user). PLAN is subscription: what they pay for (Founder, Supporter, free).
 *
 * Kept apart because they are not the same question and do not move together.
 * A Partner who also subscribes as a Founder is an ordinary combination and a
 * single enum cannot express it — you would have to invent "partner-founder"
 * and then one row per pairing forever. They also change for unrelated reasons
 * and by unrelated means: a role is granted by an operator and is close to
 * permanent, a plan is bought, lapses, renews and will one day be written by a
 * billing webhook rather than by a human. Folding a lapse into the same column
 * that decides admin access is how someone loses their role to a failed card.
 *
 * Both are stored as ids and everything they grant is derived from the
 * catalogues below, so giving Partner or Founder a capability later is an edit
 * to one object — no column, no migration, no second source of truth. Same
 * shape `lib/profile/flair.ts` uses for flair.
 *
 * No "server-only": the admin pickers render from a server component but the
 * labels and ordering are plain data, and a parallel copy would drift.
 */

// ---- Role: permission -------------------------------------------------------

export const ACCOUNT_ROLES = ["developer", "partner", "user"] as const
export type StoredRole = (typeof ACCOUNT_ROLES)[number]

/**
 * The derived role. A plain user who owns a Brawlhalla profile is Linked — and
 * that is a fact about claim state, not about the account.
 *
 * Not stored on purpose. `profiles.userId` already is the link, and it moves in
 * three places (a verified claim, a user unlink, an admin unlink). A stored
 * copy would need updating in all three and would be wrong the first time one
 * was missed.
 */
export const LINKED_ROLE = "linked" as const
export type AccountRole = StoredRole | typeof LINKED_ROLE

export interface RoleDef {
  id: AccountRole
  label: string
  description: string
  /** Display order, lowest first. */
  order: number
  /**
   * Reaches /admin and every admin mutation.
   *
   * A named flag, never a rank comparison — so inserting a role between two
   * others later cannot silently hand it powers nobody granted.
   */
  admin: boolean
  /** Announced. False means assignable but invisible and inert user-facing. */
  released: boolean
  derived?: true
}

export const ROLES: Record<AccountRole, RoleDef> = {
  developer: {
    id: "developer",
    label: "Developer",
    description: "Internal. Full access to the admin panel.",
    order: 0,
    admin: true,
    released: true,
  },
  partner: {
    id: "partner",
    label: "Partner",
    description:
      "Platform partner or coach. Reserved — grants nothing yet.",
    order: 1,
    admin: false,
    released: false,
  },
  linked: {
    id: "linked",
    label: "Linked User",
    description: "Registered, with a claimed Brawlhalla profile.",
    order: 2,
    admin: false,
    released: true,
    derived: true,
  },
  user: {
    id: "user",
    label: "Regular User",
    description: "Registered account. The default for everyone who signs up.",
    order: 3,
    admin: false,
    released: true,
  },
}

export const DEFAULT_ROLE: StoredRole = "user"

/** Roles an operator may assign, in display order. Excludes the derived one. */
export const ASSIGNABLE_ROLES: StoredRole[] = [...ACCOUNT_ROLES].sort(
  (a, b) => ROLES[a].order - ROLES[b].order,
)

export function isStoredRole(v: unknown): v is StoredRole {
  return typeof v === "string" && (ACCOUNT_ROLES as readonly string[]).includes(v)
}

/**
 * A stored value as a role, falling back to the default. Every read goes
 * through this, so a row holding an id we no longer ship degrades to a regular
 * user rather than to an account with undefined permissions.
 */
export function parseRole(v: unknown): StoredRole {
  return isStoredRole(v) ? v : DEFAULT_ROLE
}

/**
 * The role to *show*: the stored one, unless it is a plain user who has claimed
 * a profile, which makes them Linked.
 *
 * Only `user` is upgraded — a Developer who also claimed a profile is still
 * shown as a Developer, because the link is not the interesting fact about them
 * and collapsing it would hide the role that carries permissions.
 */
export function resolveRole(v: unknown, hasLinkedProfile: boolean): AccountRole {
  const role = parseRole(v)
  return role === "user" && hasLinkedProfile ? LINKED_ROLE : role
}

/** Whether a stored role reaches the admin panel. */
export function roleGrantsAdmin(v: unknown): boolean {
  return ROLES[parseRole(v)].admin
}

// ---- Plan: subscription -----------------------------------------------------

export const ACCOUNT_PLANS = ["free", "supporter", "founder"] as const
export type AccountPlan = (typeof ACCOUNT_PLANS)[number]

export interface PlanDef {
  id: AccountPlan
  label: string
  description: string
  order: number
  /** On sale. False means assignable by an operator but not yet purchasable. */
  released: boolean
  /** Paid, as opposed to the free default. */
  paid: boolean
}

export const PLANS: Record<AccountPlan, PlanDef> = {
  founder: {
    id: "founder",
    label: "Founder",
    description: "Top paid tier. Not on sale yet — grants nothing.",
    order: 0,
    released: false,
    paid: true,
  },
  supporter: {
    id: "supporter",
    label: "Supporter",
    description: "Paid tier. Not on sale yet — grants nothing.",
    order: 1,
    released: false,
    paid: true,
  },
  free: {
    id: "free",
    label: "Free",
    description: "No subscription. The default for everyone who signs up.",
    order: 2,
    released: true,
    paid: false,
  },
}

export const DEFAULT_PLAN: AccountPlan = "free"

export const ASSIGNABLE_PLANS: AccountPlan[] = [...ACCOUNT_PLANS].sort(
  (a, b) => PLANS[a].order - PLANS[b].order,
)

export function isAccountPlan(v: unknown): v is AccountPlan {
  return typeof v === "string" && (ACCOUNT_PLANS as readonly string[]).includes(v)
}

/**
 * A stored plan, falling back to free.
 *
 * `plan` predates this and shipped with 'premium' as its other value, which
 * nothing ever read or wrote. Anything unrecognised — including that — reads as
 * free, which is the safe direction: an unknown value must never be mistaken
 * for a paid entitlement.
 */
export function parsePlan(v: unknown): AccountPlan {
  return isAccountPlan(v) ? v : DEFAULT_PLAN
}
