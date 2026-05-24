import { BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"

/** Verified pro-player badge. Lightweight (lucide + cn only) so it's cheap to
 * pull into client bundles like the search dropdown. */
export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-mystic/50 bg-mystic/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-mystic",
        className,
      )}
      title="Verified pro player"
    >
      <BadgeCheck className="size-3" />
      Pro
    </span>
  )
}
