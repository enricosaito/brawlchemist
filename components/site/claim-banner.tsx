import Link from "next/link"
import { BadgeCheck, UserRoundPlus } from "lucide-react"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimState, getClaimedBrawlhallaId } from "@/lib/sync/claims"

/**
 * Compact ownership chip, rendered inline in the profile header next to the
 * region tag:
 * - the viewer owns this player → a "Your profile" chip
 * - unclaimed → "Is this you? Claim" (the /claim flow handles sign-in), but
 *   hidden once the viewer has already linked a profile (one claim per account)
 * - owned by someone else → nothing (ownership identity isn't revealed)
 *
 * Fails open: any lookup error renders nothing rather than breaking the page.
 */
export async function ClaimBanner({ brawlhallaId }: { brawlhallaId: number }) {
  let state: "unclaimed" | "mine" | "other"
  let userId: string | null = null
  try {
    const user = await getSessionUser()
    userId = user?.id ?? null
    state = await getClaimState(brawlhallaId, userId)
  } catch {
    return null
  }

  if (state === "other") return null

  if (state === "mine") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-positive/40 bg-positive/10 px-2.5 py-1 text-[11px] font-medium text-positive">
        <BadgeCheck className="size-3.5" />
        Your profile
      </span>
    )
  }

  // Unclaimed. Hide the CTA if this viewer already linked a different profile
  // (one claim per account); fail open to showing it on a lookup error.
  if (userId) {
    try {
      if ((await getClaimedBrawlhallaId(userId)) != null) return null
    } catch {
      /* fall through and show the CTA */
    }
  }

  // Styled as the Track control beside it: both are neutral invitations to act
  // on this profile, and the old copper fill made this one shout over the data.
  return (
    <Link
      href={`/claim?id=${brawlhallaId}`}
      className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-tier-gold/50 hover:text-foreground"
    >
      <UserRoundPlus className="size-3.5" />
      Is this you?
      <span className="text-muted-foreground/70 transition-colors group-hover:text-foreground">
        Claim
      </span>
    </Link>
  )
}
