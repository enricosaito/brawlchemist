import Link from "next/link"
import { BadgeCheck, UserRoundPlus } from "lucide-react"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimState } from "@/lib/sync/claims"

/**
 * Profile-page ownership CTA. Shown above the tabs:
 * - the viewer owns this player → a subtle "your profile" chip
 * - unclaimed → "Is this you? Claim this profile" (the /claim flow handles the
 *   sign-in redirect for logged-out visitors)
 * - owned by someone else → nothing (ownership identity isn't revealed)
 *
 * Fails open: any lookup error renders nothing rather than breaking the page.
 */
export async function ClaimBanner({ brawlhallaId }: { brawlhallaId: number }) {
  let state: "unclaimed" | "mine" | "other"
  try {
    const user = await getSessionUser()
    state = await getClaimState(brawlhallaId, user?.id ?? null)
  } catch {
    return null
  }

  if (state === "other") return null

  if (state === "mine") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-positive/40 bg-positive/10 px-3 py-2 text-sm">
        <BadgeCheck className="size-4 shrink-0 text-positive" />
        <span className="font-medium">This is your profile.</span>
      </div>
    )
  }

  return (
    <Link
      href={`/claim?id=${brawlhallaId}`}
      className="group flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-sm transition-colors hover:border-copper/60 hover:bg-card/60"
    >
      <UserRoundPlus className="size-4 shrink-0 text-copper" />
      <span className="font-medium">Is this you?</span>
      <span className="text-muted-foreground">Claim this profile</span>
      <span className="ml-auto text-copper transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}
