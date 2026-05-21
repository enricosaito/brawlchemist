import Image from "next/image"
import { cn } from "@/lib/utils"
import { getLegend } from "@/lib/mock-data"
import type { LegendTier, Tier } from "@/lib/types"

/**
 * Delta — signed numeric change with semantic color.
 * Used for ELO deltas, WR shifts, and ranking movement.
 */
export function Delta({
  value,
  suffix,
  className,
  showZero = false,
}: {
  value: number
  suffix?: string
  className?: string
  showZero?: boolean
}) {
  if (!showZero && value === 0) {
    return <span className={cn("text-muted-foreground tabular-nums", className)}>—</span>
  }
  const positive = value > 0
  const negative = value < 0
  const arrow = positive ? "▲" : negative ? "▼" : "·"
  const sign = positive ? "+" : ""
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 tabular-nums font-mono text-xs",
        positive && "text-positive",
        negative && "text-negative",
        !positive && !negative && "text-muted-foreground",
        className,
      )}
    >
      <span className="text-[0.625rem] leading-none">{arrow}</span>
      <span>
        {sign}
        {value}
        {suffix}
      </span>
    </span>
  )
}

const TIER_COLOR: Record<Tier, string> = {
  Tin: "text-tier-tin border-tier-tin/40 bg-tier-tin/10",
  Bronze: "text-tier-bronze border-tier-bronze/40 bg-tier-bronze/10",
  Silver: "text-tier-silver border-tier-silver/40 bg-tier-silver/10",
  Gold: "text-tier-gold border-tier-gold/40 bg-tier-gold/10",
  Platinum: "text-tier-platinum border-tier-platinum/40 bg-tier-platinum/10",
  Diamond: "text-tier-diamond border-tier-diamond/40 bg-tier-diamond/10",
  Valhallan: "text-tier-valhallan border-tier-valhallan/50 bg-tier-valhallan/15",
}

export const TIER_TEXT_COLOR: Record<Tier, string> = {
  Tin: "text-tier-tin",
  Bronze: "text-tier-bronze",
  Silver: "text-tier-silver",
  Gold: "text-tier-gold",
  Platinum: "text-tier-platinum",
  Diamond: "text-tier-diamond",
  Valhallan: "text-tier-valhallan",
}

export function RankPill({
  tier,
  division,
  className,
}: {
  tier: Tier
  division?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        TIER_COLOR[tier],
        className,
      )}
    >
      <span>{tier}</span>
      {division ? <span className="font-mono text-[10px] opacity-80">{division}</span> : null}
    </span>
  )
}

/**
 * RankIcon — animated rank emblem displayed inline with top-player rows.
 * Currently uses the Valhallan asset across all tiers as a placeholder; swap
 * in per-tier files once the rest are provided.
 */
const RANK_ICON_SRC: Partial<Record<Tier, string>> = {
  Valhallan: "/assets/Valhallan-GIF.gif",
}

export function RankIcon({
  tier,
  size = 22,
  className,
}: {
  tier: Tier
  size?: number
  className?: string
}) {
  const src = RANK_ICON_SRC[tier] ?? "/assets/Valhallan-GIF.gif"
  return (
    <Image
      src={src}
      alt={`${tier} rank`}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 select-none object-contain", className)}
    />
  )
}

const LEGEND_TIER_COLOR: Record<LegendTier, string> = {
  S: "text-copper border-copper/40 bg-copper/10",
  A: "text-mystic border-mystic/40 bg-mystic/10",
  B: "text-foreground/80 border-border bg-muted",
  C: "text-muted-foreground border-border bg-muted/60",
}

export function TierLetter({
  tier,
  className,
  size = "md",
}: {
  tier: LegendTier
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClass =
    size === "sm"
      ? "size-5 text-[10px]"
      : size === "lg"
        ? "size-9 text-base"
        : "size-7 text-xs"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border font-display font-semibold tracking-wider",
        LEGEND_TIER_COLOR[tier],
        sizeClass,
        className,
      )}
    >
      {tier}
    </span>
  )
}

const AVATAR_SIZE_PX: Record<"sm" | "md" | "lg", number> = {
  sm: 20,
  md: 28,
  lg: 36,
}

/**
 * LegendChip — legend portrait when a `Legend.imageUrl` is set, otherwise a
 * neutral gradient placeholder ready to receive the asset later.
 */
export function LegendChip({
  legendId,
  showName = true,
  size = "md",
  className,
}: {
  legendId: string
  showName?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const legend = getLegend(legendId)
  const avatarSize =
    size === "sm" ? "size-5" : size === "lg" ? "size-9" : "size-7"
  const px = AVATAR_SIZE_PX[size]
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md border border-border/60 bg-gradient-to-br from-muted to-card",
          avatarSize,
        )}
      >
        {legend?.imageUrl ? (
          <Image
            src={legend.imageUrl}
            alt=""
            width={px}
            height={px}
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
      </span>
      {showName && legend && (
        <span className="truncate text-sm">{legend.name}</span>
      )}
    </span>
  )
}

/** Region pill — flat, compact, monospace. */
export function RegionPill({ region, className }: { region: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {region}
    </span>
  )
}
