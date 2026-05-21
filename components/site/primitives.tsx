import Image from "next/image"
import { cn } from "@/lib/utils"
import { getLegend } from "@/lib/mock-data"
import type { LegendTier, Tier, WeaponId } from "@/lib/types"

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
  Diamond: "/assets/Avatar_Diamond_20.webp",
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

const LEGEND_TIER_TEXT: Record<LegendTier, string> = {
  "S+": "text-tier-gold",
  S: "text-tier-s",
  A: "text-mystic",
  B: "text-foreground/80",
  C: "text-muted-foreground",
}

/**
 * TierLetter — plain colored grade. No frame, no background. The "+" on S+
 * renders slightly smaller so the grade reads as a single unit.
 */
export function TierLetter({
  tier,
  className,
}: {
  tier: LegendTier
  className?: string
}) {
  return (
    <span
      className={cn(
        "glow-text inline-flex w-8 shrink-0 items-baseline justify-center font-display text-xl font-bold leading-none tracking-tight",
        LEGEND_TIER_TEXT[tier],
        className,
      )}
    >
      {tier === "S+" ? (
        <>
          S<span className="text-[0.65em] font-semibold leading-none">+</span>
        </>
      ) : (
        tier
      )}
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

/**
 * WeaponIcon — small weapon glyph. Currently only gauntlets and hammer have
 * dedicated assets; others fall back to a neutral placeholder box.
 */
const WEAPON_ICON_SRC: Partial<Record<WeaponId, string>> = {
  gauntlets: "/assets/weapons/gauntlets.gif",
  hammer: "/assets/weapons/hammer.png",
  sword: "/assets/weapons/sword.webp",
  bow: "/assets/weapons/bow.png",
  katar: "/assets/weapons/katars.png",
  axe: "/assets/weapons/axe.png",
}

export function WeaponIcon({
  weaponId,
  size = 28,
  className,
}: {
  weaponId: WeaponId
  size?: number
  className?: string
}) {
  const src = WEAPON_ICON_SRC[weaponId]
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={cn("shrink-0 select-none object-contain", className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-md border border-border/60 bg-muted/40",
        className,
      )}
      style={{ width: size, height: size }}
    />
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
