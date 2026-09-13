import Image from "next/image"
import { cn } from "@/lib/utils"
import { getLegend } from "@/lib/mock-data"
import type { LegendTier, Stance, Tier, WeaponId } from "@/lib/types"
import { InfoTip } from "./info-tip"

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

/**
 * Tier colour as a raw CSS custom property, for the places a Tailwind class
 * won't do — canvases, SVG `stroke`, and components that take a colour string.
 * Same tokens TIER_TEXT_COLOR compiles to, so the two can never drift.
 */
export const TIER_COLOR_VAR: Record<Tier, string> = {
  Tin: "var(--tier-tin)",
  Bronze: "var(--tier-bronze)",
  Silver: "var(--tier-silver)",
  Gold: "var(--tier-gold)",
  Platinum: "var(--tier-platinum)",
  Diamond: "var(--tier-diamond)",
  Valhallan: "var(--tier-valhallan)",
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
  Valhallan: "/assets/Valhallan-GIF.webp",
  Diamond: "/assets/Avatar_Diamond_37.webp",
  Platinum: "/assets/Avatar_Platinum_6.webp",
  Gold: "/assets/Avatar_Gold_6.webp",
  // No dedicated art yet for Silver / Bronze / Tin — generic participation
  // avatar serves as the placeholder until per-tier art arrives.
  Silver: "/assets/Avatar_Participation_10.webp",
  Bronze: "/assets/Avatar_Participation_10.webp",
  Tin: "/assets/Avatar_Participation_10.webp",
}

/**
 * Rank helm shown beside a rating — only the two top tiers have one; lower
 * tiers ride on the number alone ("no helm for less").
 *
 * Distinct from RankIcon, which is the round avatar emblem. The helm is the
 * silhouette that reads at small sizes, so it's what goes next to a number.
 */
const RANK_HELM_SRC: Partial<Record<Tier, string>> = {
  Valhallan: "/assets/valhallan-helm.png",
  Diamond: "/assets/diamond-helm.png",
}

export function RankHelm({
  tier,
  className = "h-7",
}: {
  tier: Tier
  /** Height utility; width follows the art's aspect ratio. */
  className?: string
}) {
  const src = RANK_HELM_SRC[tier]
  if (!src) return null
  return (
    <Image
      src={src}
      alt={`${tier} helm`}
      width={48}
      height={48}
      unoptimized
      className={cn(
        "w-auto shrink-0 select-none object-contain drop-shadow-sm",
        className,
      )}
    />
  )
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
  // Long "Super" labels abbreviate (matching "Super Dex") so stance lines
  // never wrap inside compact card rows.
  superdef: { label: "Super Def.", src: "/assets/stances/superdef.png" },
  superdex: { label: "Super Dex", src: "/assets/stances/superdex.png" },
  superspeed: { label: "Super Speed", src: "/assets/stances/superspeed.png" },
  superstrength: {
    label: "Super Str.",
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
/**
 * Per-region text / outline / fill. The fill carries the region's own hue at
 * the same 10% tint every other tag uses, so a region tag sits in a row of
 * tags as one of them rather than as a neutral chip that happens to have
 * coloured text.
 */
export const REGION_COLOR: Record<
  string,
  { text: string; border: string; bg: string }
> = {
  ALL: { text: "text-muted-foreground", border: "border-border/60", bg: "bg-muted/40" },
  BRZ: { text: "text-[#4ade80]", border: "border-[#4ade80]/40", bg: "bg-[#4ade80]/10" },
  "US-E": { text: "text-[#f87171]", border: "border-[#f87171]/40", bg: "bg-[#f87171]/10" },
  "US-W": { text: "text-[#38bdf8]", border: "border-[#38bdf8]/40", bg: "bg-[#38bdf8]/10" },
  EU: { text: "text-[#60a5fa]", border: "border-[#60a5fa]/40", bg: "bg-[#60a5fa]/10" },
  SEA: { text: "text-[#2dd4bf]", border: "border-[#2dd4bf]/40", bg: "bg-[#2dd4bf]/10" },
  AUS: { text: "text-[#fb923c]", border: "border-[#fb923c]/40", bg: "bg-[#fb923c]/10" },
  // Both spellings: player data says JPN, leaderboard rows say JPS.
  JPN: { text: "text-[#facc15]", border: "border-[#facc15]/40", bg: "bg-[#facc15]/10" },
  JPS: { text: "text-[#facc15]", border: "border-[#facc15]/40", bg: "bg-[#facc15]/10" },
  SA: { text: "text-[#c084fc]", border: "border-[#c084fc]/40", bg: "bg-[#c084fc]/10" },
  ME: { text: "text-[#f472b6]", border: "border-[#f472b6]/40", bg: "bg-[#f472b6]/10" },
}

/**
 * "<REGION> #N" — a player's standing inside their own region, in that
 * region's colour.
 *
 * Shares REGION_COLOR with RegionPill so the two always agree: the colour is
 * the region identifier here, which is what lets this sit next to a plain gold
 * "Global #N" and stay unambiguous at a glance.
 */
export function RegionRankTag({
  region,
  rank,
  className,
}: {
  region: string
  rank: number
  className?: string
}) {
  const c = REGION_COLOR[region]
  return (
    <InfoTip label={`#${rank.toLocaleString()} in ${region}`}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
          c?.text ?? "text-muted-foreground",
          c?.border ?? "border-border/60",
          c?.bg ?? "bg-muted/40",
          className,
        )}
      >
        {region} #{rank.toLocaleString()}
      </span>
    </InfoTip>
  )
}

/** Region pill — flat, compact, monospace, color-coded per region (text + outline). */
export function RegionPill({ region, className }: { region: string; className?: string }) {
  const c = REGION_COLOR[region]
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        c?.text ?? "text-muted-foreground",
        c?.border ?? "border-border/60",
        c?.bg ?? "bg-muted/40",
        className,
      )}
    >
      {region}
    </span>
  )
}
