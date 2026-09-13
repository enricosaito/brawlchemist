import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * "Brawlchemist User" — this player has claimed their profile here.
 *
 * Public and viewer-independent, which is what separates it from the
 * ClaimBanner chip beside the name: that one is about the *viewer's* relation
 * to the profile ("Your profile" / "Is this you?"), this one is a fact about
 * the player. It says a profile is owned without saying by whom — the owner's
 * identity stays private.
 *
 * Copper rather than the mystic used by ProBadge: it sits in the same meta row
 * and the two need to stay tellable apart at a glance, and copper is already
 * the accent for "ours" (the claim CTA, the live "now" marker).
 */
export function BrawlchemistUserBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-copper/50 bg-copper/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-copper",
        className,
      )}
      title="This player has claimed their profile on Brawlchemist"
    >
      <FlaskConical className="size-3" />
      Brawlchemist User
    </span>
  )
}
