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
 * Pink — the brand accent. It's the one tag on a profile that's about this
 * site rather than about Brawlhalla, so it reads in Brawlchemist's own colour
 * while the game's own signals (region, ladder, titles) keep theirs.
 *
 * This is also the shape every other tag now follows: rounded-md, hairline
 * border, 15%-tint fill, mono micro-caps.
 */
export function BrawlchemistUserBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-pink/50 bg-pink/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-pink",
        className,
      )}
      title="This player has claimed their profile on Brawlchemist"
    >
      <FlaskConical className="size-3" />
      Brawlchemist User
    </span>
  )
}
