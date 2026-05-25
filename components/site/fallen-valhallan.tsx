import Image from "next/image"
import { cn } from "@/lib/utils"

const EMBLEM_SRC = "/assets/Avatar_Valhallan_Emblem_Fallen.png"

/**
 * FallenEmblem — the fallen-Valhallan avatar, used in tables in place of the
 * normal rank icon for players who reached Valhallan and dropped to Diamond.
 */
export function FallenEmblem({
  size = 32,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <Image
      src={EMBLEM_SRC}
      alt="Fallen Valhallan"
      title="Fallen Valhallan — reached Valhallan, now Diamond"
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 select-none object-contain", className)}
    />
  )
}

/**
 * FallenValhallanBadge — emblem + label in the muted fallen-Valhallan color.
 * Shown on the profile next to the player's name.
 */
export function FallenValhallanBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-tier-valhallan-fallen/50 bg-tier-valhallan-fallen/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-tier-valhallan-fallen",
        className,
      )}
      title="Reached Valhallan, now Diamond"
    >
      <Image
        src={EMBLEM_SRC}
        alt=""
        width={14}
        height={14}
        unoptimized
        className="size-3.5 shrink-0 select-none object-contain"
      />
      Fallen Valhallan
    </span>
  )
}
