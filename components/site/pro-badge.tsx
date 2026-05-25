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

/**
 * PlayerName — for verified pros, shows the PRO badge + clean handle by default.
 * On hover (driven by an ancestor `group/pro`, e.g. the leaderboard row/card)
 * the badge stays and the handle swaps to the in-game username, with the tier
 * revealed to its right when `tier` is provided. CSS-only, so it works in
 * server-rendered tables. Render only when `handle` is set.
 */
export function PlayerName({
  username,
  handle,
  tier,
  tierClassName,
  className,
}: {
  username: string
  handle: string
  tier?: string | null
  tierClassName?: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <ProBadge className="shrink-0" />
      <span className="min-w-0 truncate">
        <span className="group-hover/pro:hidden">{handle}</span>
        <span className="hidden group-hover/pro:inline">{username}</span>
      </span>
      {tier && (
        <span
          className={cn(
            "hidden shrink-0 font-mono text-[10px] font-medium uppercase tracking-wider group-hover/pro:inline",
            tierClassName,
          )}
        >
          {tier}
        </span>
      )}
    </span>
  )
}
