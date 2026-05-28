import Image from "next/image"
import { cn } from "@/lib/utils"
import { getLegend } from "@/lib/mock-data"
import type { LegendTier, Stance, Tier, WeaponId } from "@/lib/types"

// PlayerLink lives in its own client-component file (it carries an interactive
// right-click context menu). Re-exported here so the existing import path
// `@/components/site/primitives` keeps working across every caller.
export { PlayerLink } from "./player-link"

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
  Diamond: "/assets/Avatar_Diamond_37.webp",
  Platinum: "/assets/Avatar_Platinum_6.webp",
  Gold: "/assets/Avatar_Gold_6.webp",
  // No dedicated art yet for Silver / Bronze / Tin — generic participation
  // avatar serves as the placeholder until per-tier art arrives.
  Silver: "/assets/Avatar_Participation_10.webp",
  Bronze: "/assets/Avatar_Participation_10.webp",
  Tin: "/assets/Avatar_Participation_10.webp",
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
  const src = RANK_ICON_SRC[tier]
  if (!src) return null
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
        "glow-text inline-flex w-8 shrink-0 items-baseline justify-center font-tier-grade text-xl font-bold leading-none tracking-tight",
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
 * WeaponIcon — small weapon glyph. Assets sourced from the user's icon
 * pack in public/assets/weapons. Chakram has no dedicated icon yet and
 * falls back to a neutral placeholder.
 */
const WEAPON_ICON_SRC: Partial<Record<WeaponId, string>> = {
  sword: "/assets/weapons/Sword_Icon.webp",
  hammer: "/assets/weapons/Grapple_Hammer_Icon.webp",
  axe: "/assets/weapons/Axe_Icon.webp",
  spear: "/assets/weapons/Spear_Icon.webp",
  katar: "/assets/weapons/Katars_Icon.webp",
  bow: "/assets/weapons/Bow_Icon.webp",
  gauntlets: "/assets/weapons/Gauntlets_Icon.webp",
  scythe: "/assets/weapons/Scythe_Icon.webp",
  "rocket-lance": "/assets/weapons/Rocket_Lance_Icon.webp",
  blasters: "/assets/weapons/Blasters_Icon.webp",
  greatsword: "/assets/weapons/Greatsword_Icon.webp",
  cannon: "/assets/weapons/Cannon_Icon.webp",
  orb: "/assets/weapons/Orb_Icon.webp",
  "battle-boots": "/assets/weapons/Battle_Boots_Icon.webp",
  chakram: "/assets/weapons/Chakram_Icon.webp",
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

const STANCE_INFO: Record<Stance, { label: string; src: string }> = {
  base: { label: "Base", src: "/assets/stances/base.png" },
  defense: { label: "Defense", src: "/assets/stances/defense.png" },
  dexterity: { label: "Dexterity", src: "/assets/stances/dexterity.png" },
  speed: { label: "Speed", src: "/assets/stances/speed.png" },
  strength: { label: "Strength", src: "/assets/stances/strength.png" },
  superdef: { label: "Super Defense", src: "/assets/stances/superdef.png" },
  superdex: { label: "Super Dex", src: "/assets/stances/superdex.png" },
  superspeed: { label: "Super Speed", src: "/assets/stances/superspeed.png" },
  superstrength: {
    label: "Super Strength",
    src: "/assets/stances/superstrength.webp",
  },
}

/**
 * StanceLabel — "BEST WITH [icon] Stance Name" inline element. Mirrors the
 * "best on …" treatment used by the weapon-meta card.
 */
export function StanceLabel({
  stance,
  className,
}: {
  stance: Stance
  className?: string
}) {
  const info = STANCE_INFO[stance]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider">
        best with
      </span>
      <Image
        src={info.src}
        alt=""
        width={20}
        height={20}
        className="shrink-0 select-none object-contain"
      />
      <span className="text-sm text-muted-foreground">{info.label}</span>
    </span>
  )
}

/** A distinct text + border color per region, for at-a-glance region coding. */
export const REGION_COLOR: Record<string, { text: string; border: string }> = {
  ALL: { text: "text-muted-foreground", border: "border-border/60" },
  BRZ: { text: "text-[#4ade80]", border: "border-[#4ade80]/40" },
  "US-E": { text: "text-[#f87171]", border: "border-[#f87171]/40" },
  "US-W": { text: "text-[#38bdf8]", border: "border-[#38bdf8]/40" },
  EU: { text: "text-[#60a5fa]", border: "border-[#60a5fa]/40" },
  SEA: { text: "text-[#2dd4bf]", border: "border-[#2dd4bf]/40" },
  AUS: { text: "text-[#fb923c]", border: "border-[#fb923c]/40" },
  JPS: { text: "text-[#facc15]", border: "border-[#facc15]/40" },
  SA: { text: "text-[#c084fc]", border: "border-[#c084fc]/40" },
  ME: { text: "text-[#f472b6]", border: "border-[#f472b6]/40" },
}

/** Region pill — flat, compact, monospace, color-coded per region (text + outline). */
export function RegionPill({ region, className }: { region: string; className?: string }) {
  const c = REGION_COLOR[region]
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        c?.text ?? "text-muted-foreground",
        c?.border ?? "border-border/60",
        className,
      )}
    >
      {region}
    </span>
  )
}
