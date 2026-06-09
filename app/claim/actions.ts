"use server"

import { getPlayersByIds } from "@/lib/sync/players"
import {
  startClaim,
  verifyClaim,
  type StartClaimResult,
  type VerifyClaimResult,
} from "@/lib/sync/claims"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Authenticated user id for a write, re-validated against the auth server
 * (getUser, not the locally-decoded claims) since these actions mutate
 * ownership. Returns null when not signed in.
 */
async function authedUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

export type StartClaimActionResult =
  | { ok: true; claimId: string; legendName: string; username: string }
  | { ok: false; reason: Exclude<StartClaimResult, { ok: true }>["reason"] | "unauthenticated" | "bad-id" }

export async function startClaimAction(
  rawId: string,
): Promise<StartClaimActionResult> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, reason: "unauthenticated" }

  const brawlhallaId = Number.parseInt(String(rawId).trim(), 10)
  if (!Number.isInteger(brawlhallaId) || brawlhallaId <= 0) {
    return { ok: false, reason: "bad-id" }
  }

  const result = await startClaim(userId, brawlhallaId)
  if (!result.ok) return result

  const rows = await getPlayersByIds([brawlhallaId], { includeRankedJson: false })
  const username = rows.get(brawlhallaId)?.username ?? `Player #${brawlhallaId}`
  return { ok: true, claimId: result.claimId, legendName: result.legendName, username }
}

export type VerifyClaimActionResult =
  | VerifyClaimResult
  | { ok: false; reason: "unauthenticated" }

export async function verifyClaimAction(
  claimId: string,
  answer: string,
): Promise<VerifyClaimActionResult> {
  const userId = await authedUserId()
  if (!userId) return { ok: false, reason: "unauthenticated" }
  return verifyClaim(userId, claimId, answer)
}
