import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import type { PlayerRanked, PlayerRankedLegend } from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { profileClaims, profiles, players } from "@/lib/db/schema"
import { rosterEntryByLegendId } from "@/lib/legends-roster"

/**
 * "Prove it's you" player-claim engine.
 *
 * A logged-in user claims a Brawlhalla ID by answering the exact season ranked
 * rating of one of their mid-to-least-played legends. The whole flow reads from
 * `players.ranked_json` (our stored GetPlayerRanked snapshot) — it NEVER calls
 * the Brawlhalla API (cardinal constraint #1). Per-legend rating is present in
 * that payload but is not rendered on the public profile, so it's an "owner
 * knows, onlooker doesn't" secret. The single override path is admin
 * reassignment; there is no user-facing dispute flow.
 */

/** A legend needs at least this many games for its rating to be real & memorable. */
const MIN_LEGEND_GAMES = 5
/** A generated challenge accepts answers for this long before needing renewal. */
const CHALLENGE_TTL_MS = 15 * 60 * 1000
/** Wrong answers allowed inside one rolling window before lockout. */
const MAX_ATTEMPTS = 3
/** Rolling window for the attempt cap. */
const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000
/** Postgres unique-violation SQLSTATE — surfaced when a user already owns one. */
const PG_UNIQUE_VIOLATION = "23505"

interface Challenge {
  legendId: number
  legendName: string
  correctRating: number
}

export type StartClaimResult =
  | { ok: true; claimId: string; legendName: string }
  | {
      ok: false
      reason:
        | "no-data" // player not in our pool yet / no ranked legends
        | "not-eligible" // no legend with enough games to challenge on
        | "already-claimed" // someone else already owns this player
        | "owns-another" // this user already claimed a different player
        | "rate-limited"
    }

export type VerifyClaimResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | "not-found"
        | "expired"
        | "wrong"
        | "rate-limited"
        | "already-claimed"
        | "owns-another"
      /** Present on "wrong": attempts left, and the next legend to answer for. */
      remainingAttempts?: number
      legendName?: string
    }

function asRanked(value: unknown): PlayerRanked | null {
  if (value && typeof value === "object" && "legends" in value) {
    return value as PlayerRanked
  }
  return null
}

/**
 * Pick a legend to challenge on: drop the most-played main(s) so the answer is
 * obscure, keep only legends with enough games for a stable, recalled rating,
 * and require a known roster name (so we can phrase the question). Random within
 * the candidate pool so repeated attempts ask about different legends.
 */
function pickChallenge(legends: PlayerRankedLegend[]): Challenge | null {
  const eligible = legends
    .filter(
      (l) =>
        typeof l.games === "number" &&
        l.games >= MIN_LEGEND_GAMES &&
        typeof l.rating === "number" &&
        l.rating > 0 &&
        rosterEntryByLegendId(l.legend_id) !== null,
    )
    .sort((a, b) => b.games - a.games)

  if (eligible.length === 0) return null

  // Drop the top main(s): the single most-played for short rosters, the top
  // third for longer ones — the remainder is the "mid-to-least played" pool.
  const dropTop =
    eligible.length >= 4 ? Math.max(1, Math.floor(eligible.length / 3)) : 1
  const pool = eligible.slice(dropTop)
  const candidates = pool.length > 0 ? pool : eligible

  const chosen = candidates[Math.floor(Math.random() * candidates.length)]
  return {
    legendId: chosen.legend_id,
    legendName: rosterEntryByLegendId(chosen.legend_id)!.name,
    correctRating: chosen.rating,
  }
}

/** Load a player's stored ranked payload (no API call). */
async function loadRankedJson(brawlhallaId: number): Promise<PlayerRanked | null> {
  const [row] = await db()
    .select({ rankedJson: players.rankedJson })
    .from(players)
    .where(eq(players.brawlhallaId, brawlhallaId))
    .limit(1)
  return row ? asRanked(row.rankedJson) : null
}

/** Current verified owner of a player, if any. */
async function ownerOf(brawlhallaId: number): Promise<string | null> {
  const [row] = await db()
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.brawlhallaId, brawlhallaId))
    .limit(1)
  return row?.userId ?? null
}

/** The player this user already owns, if any. */
async function profileOwnedBy(userId: string): Promise<number | null> {
  const [row] = await db()
    .select({ brawlhallaId: profiles.brawlhallaId })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)
  return row?.brawlhallaId ?? null
}

/**
 * Begin (or renew) a claim. Generates a fresh ELO challenge and returns the
 * claim id + the legend name to answer for. The correct rating is stored
 * server-side only.
 */
export async function startClaim(
  userId: string,
  brawlhallaId: number,
): Promise<StartClaimResult> {
  const owner = await ownerOf(brawlhallaId)
  if (owner && owner !== userId) return { ok: false, reason: "already-claimed" }

  const alreadyOwns = await profileOwnedBy(userId)
  if (alreadyOwns !== null && alreadyOwns !== brawlhallaId) {
    return { ok: false, reason: "owns-another" }
  }

  const ranked = await loadRankedJson(brawlhallaId)
  if (!ranked || !ranked.legends?.length) return { ok: false, reason: "no-data" }

  // Existing in-flight claim for this pair — enforce the attempt window.
  const [existing] = await db()
    .select()
    .from(profileClaims)
    .where(
      and(
        eq(profileClaims.userId, userId),
        eq(profileClaims.brawlhallaId, brawlhallaId),
      ),
    )
    .limit(1)

  const now = Date.now()
  const windowOpen =
    existing && now - existing.createdAt.getTime() < ATTEMPT_WINDOW_MS
  if (existing && windowOpen && existing.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "rate-limited" }
  }

  const challenge = pickChallenge(ranked.legends)
  if (!challenge) return { ok: false, reason: "not-eligible" }

  const expiresAt = new Date(now + CHALLENGE_TTL_MS)

  if (existing) {
    // Renew: keep the attempt counter (and window) unless the window lapsed.
    const resetWindow = !windowOpen
    await db()
      .update(profileClaims)
      .set({
        challenge,
        status: "pending",
        method: "quiz",
        expiresAt,
        attempts: resetWindow ? 0 : existing.attempts,
        createdAt: resetWindow ? new Date(now) : existing.createdAt,
      })
      .where(eq(profileClaims.id, existing.id))
    return { ok: true, claimId: existing.id, legendName: challenge.legendName }
  }

  const [inserted] = await db()
    .insert(profileClaims)
    .values({ userId, brawlhallaId, challenge, status: "pending", expiresAt })
    .returning({ id: profileClaims.id })
  return { ok: true, claimId: inserted.id, legendName: challenge.legendName }
}

/**
 * Grade an answer. Exact integer match against the stored legend rating. On
 * success ownership is written to `profiles.userId` (guarded so a concurrent
 * claimant can't be overwritten). On a wrong answer the challenge regenerates
 * with a different legend until the attempt cap is hit.
 */
export async function verifyClaim(
  userId: string,
  claimId: string,
  answer: string,
): Promise<VerifyClaimResult> {
  const [claim] = await db()
    .select()
    .from(profileClaims)
    .where(
      and(eq(profileClaims.id, claimId), eq(profileClaims.userId, userId)),
    )
    .limit(1)
  if (!claim || claim.status !== "pending") {
    return { ok: false, reason: "not-found" }
  }

  const now = Date.now()
  if (now - claim.createdAt.getTime() < ATTEMPT_WINDOW_MS) {
    if (claim.attempts >= MAX_ATTEMPTS) {
      return { ok: false, reason: "rate-limited" }
    }
  }
  if (claim.expiresAt && claim.expiresAt.getTime() < now) {
    return { ok: false, reason: "expired" }
  }

  const challenge = claim.challenge as Challenge | null
  const guess = Number.parseInt(answer.trim(), 10)
  const correct =
    challenge != null &&
    Number.isFinite(guess) &&
    guess === challenge.correctRating

  if (correct) {
    return finalizeClaim(userId, claim.brawlhallaId, claim.id)
  }

  // Wrong: count the attempt but keep the SAME legend, so the user can retry the
  // one rating they're confident about (a fresh legend is only rolled on a new
  // startClaim). The attempt cap, not legend churn, is what blocks brute force.
  const attempts = claim.attempts + 1
  await db()
    .update(profileClaims)
    .set({ attempts })
    .where(eq(profileClaims.id, claim.id))
  if (attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "rate-limited" }
  }
  return {
    ok: false,
    reason: "wrong",
    remainingAttempts: MAX_ATTEMPTS - attempts,
    legendName: challenge?.legendName,
  }
}

/** Write verified ownership, guarded against concurrent and duplicate claims. */
async function finalizeClaim(
  userId: string,
  brawlhallaId: number,
  claimId: string,
): Promise<VerifyClaimResult> {
  const now = new Date()
  try {
    // Create the profiles row if the player has none (claiming never grants pro
    // fields — isPro stays false). No-op if a row already exists.
    await db()
      .insert(profiles)
      .values({
        brawlhallaId,
        userId,
        claimedAt: now,
        claimMethod: "quiz",
        verifiedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    // Claim an existing *unclaimed* row. The isNull guard means a row already
    // owned by someone else is left untouched.
    await db()
      .update(profiles)
      .set({
        userId,
        claimedAt: now,
        claimMethod: "quiz",
        verifiedAt: now,
        updatedAt: now,
      })
      .where(and(eq(profiles.brawlhallaId, brawlhallaId), isNull(profiles.userId)))
  } catch (err) {
    // profiles.userId is unique — thrown when this user already owns another.
    if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, reason: "owns-another" }
    }
    throw err
  }

  // Did we end up as the owner? (Lost the race if someone claimed first.)
  if ((await ownerOf(brawlhallaId)) !== userId) {
    return { ok: false, reason: "already-claimed" }
  }

  await db()
    .update(profileClaims)
    .set({ status: "verified", resolvedAt: now })
    .where(eq(profileClaims.id, claimId))

  return { ok: true }
}

/** The player a user currently owns, or null. Read-side helper for the UI. */
export async function getClaimedBrawlhallaId(
  userId: string,
): Promise<number | null> {
  return profileOwnedBy(userId)
}
