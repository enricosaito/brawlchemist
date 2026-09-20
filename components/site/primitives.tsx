import Image from "next/image"
import { cn } from "@/lib/utils"
import { getLegend } from "@/lib/mock-data"
import type { Stance, Tier, WeaponId } from "@/lib/types"
import { TIER_FLOOR, tierFromRating } from "@/lib/tier"

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
    return (
      <span className={cn("text-muted-foreground tabular-nums", className)}>
        —
      </span>
    )
  }
  const positive = value > 0
  const negative = value < 0
  const arrow = positive ? "▲" : negative ? "▼" : "·"
  const sign = positive ? "+" : ""
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs tabular-nums",
        positive && "text-positive",
        negative && "text-negative",
        !positive && !negative && "text-muted-foreground",
        className
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
  Valhallan:
    "text-tier-valhallan border-tier-valhallan/50 bg-tier-valhallan/15",
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
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase",
        TIER_COLOR[tier],
        className
      )}
    >
      <span>{tier}</span>
      {division ? (
        <span className="font-mono text-[10px] opacity-80">{division}</span>
      ) : null}
    </span>
  )
}

/**
 * RankIcon — animated rank emblem displayed inline with top-player rows.
 * Currently uses the Valhallan asset across all tiers as a placeholder; swap
 * in per-tier files once the rest are provided.
 */
const RANK_ICON_SRC: Partial<Record<Tier, string>> = {
  Valhallan: "/assets/ranks/Valhallan-GIF.webp",
  Diamond: "/assets/ranks/Avatar_Diamond_37.webp",
  Platinum: "/assets/ranks/Avatar_Platinum_6.webp",
  Gold: "/assets/ranks/Avatar_Gold_6.webp",
  // No dedicated art yet for Silver / Bronze / Tin — generic participation
  // avatar serves as the placeholder until per-tier art arrives.
  Silver: "/assets/ranks/Avatar_Participation_10.webp",
  Bronze: "/assets/ranks/Avatar_Participation_10.webp",
  Tin: "/assets/ranks/Avatar_Participation_10.webp",
}

/**
 * Rank helm shown beside a rating — only the two top tiers have one; lower
 * tiers ride on the number alone ("no helm for less").
 *
 * Distinct from RankIcon, which is the round avatar emblem. The helm is the
 * silhouette that reads at small sizes, so it's what goes next to a number.
 */
/**
 * Helm art per tier, with each source's real pixel dimensions.
 *
 * All seven tiers have art now — until recently only Valhallan and Diamond
 * did, and every surface that draws a helm was written around that gap ("no
 * helm below Diamond"). Those workarounds are gone; a tier always has a helm.
 *
 * The dimensions are intrinsic, not a placeholder square. `RankHelm` renders
 * `unoptimized` like the rest of this codebase, so the browser gets the raw
 * file and uses these numbers to reserve the right box before it lands — a
 * 48×48 hint against 192×122 art reserved a box half again too tall and
 * shifted the row when the image arrived.
 */
const RANK_HELM: Record<Tier, { src: string; width: number; height: number }> =
  {
    Valhallan: {
      src: "/assets/ranks/valhallan-helm.png",
      width: 192,
      height: 153,
    },
    Diamond: { src: "/assets/ranks/diamond-helm.png", width: 192, height: 168 },
    Platinum: {
      src: "/assets/ranks/platinum-helm.png",
      width: 192,
      height: 122,
    },
    Gold: { src: "/assets/ranks/gold-helm.png", width: 192, height: 169 },
    Silver: { src: "/assets/ranks/silver-helm.png", width: 192, height: 140 },
    Bronze: { src: "/assets/ranks/bronze-helm.png", width: 192, height: 150 },
    Tin: { src: "/assets/ranks/tin-helm.png", width: 192, height: 140 },
  }

/**
 * The helm that rides beside a rating.
 *
 * Takes the rating as well as the tier because the tier can be unnameable: the
 * ladder labels players who held Valhallan and fell out of the roster "Fallen
 * Valhallan", which is none of the seven, so `toTier` returns null and this
 * used to render nothing — a rating with no helm next to it, in a column where
 * every other row has one.
 *
 * The fallback is the Diamond helm, and it is the honest one rather than a
 * near-miss: there is no Fallen Valhallan helm to draw, and everyone in that
 * state is above the Diamond floor and no longer on the roster, which is
 * exactly what Diamond means. Promoting them to the Valhallan helm would claim
 * a membership the ladder has already taken back. Below the floor the band is
 * derived from the rating instead, which is exact.
 *
 * Same rule as RankIcon, which draws the game's own Fallen emblem where it has
 * one. The two agree on when they don't know; they differ only in what art
 * exists to say so.
 */
export function RankHelm({
  tier,
  rating,
  className = "h-7",
}: {
  /** Null when the ladder's label isn't one of the seven we model. */
  tier: Tier | null
  /** The fallback's only input. Without it an unknown tier still renders nothing. */
  rating?: number | null
  /** Height utility; width follows the art's aspect ratio. */
  className?: string
}) {
  // Still guarded: `tier` reaches some callers from stored JSON (live rows,
  // recent visits), where an unknown string is possible.
  const named = tier ? RANK_HELM[tier] : null
  const resolved: Tier | null = named
    ? tier
    : rating == null
      ? null
      : rating >= TIER_FLOOR.Diamond
        ? "Diamond"
        : tierFromRating(rating)
  const helm = resolved ? RANK_HELM[resolved] : null
  if (!helm || !resolved) return null
  return (
    <Image
      src={helm.src}
      alt={`${resolved} helm`}
      width={helm.width}
      height={helm.height}
      unoptimized
      className={cn(
        "w-auto shrink-0 object-contain drop-shadow-sm select-none",
        className
      )}
    />
  )
}

/**
 * The emblem for a rating we can't name.
 *
 * The ladder labels tiers with its own strings, and `toTier` only recognises
 * the seven we model — anything else (an unfamiliar label, or a row where the
 * API omits `tier` entirely, which its own type allows) used to resolve to
 * null and render *nothing*. A blank cell in a column of emblems reads as a
 * broken image, not as "we don't know".
 *
 * Fallen Valhallan is the honest stand-in at the top of the ladder, and it is
 * the game's own idea: someone who held the tier and is no longer on the
 * roster. Below the Diamond floor it would be a lie, so down there the band is
 * derived from the rating instead — which is exact, since the floors are fixed.
 */
const FALLEN_VALHALLAN_SRC = "/assets/ranks/Avatar_Valhallan_Emblem_Fallen.webp"

export function RankIcon({
  tier,
  rating,
  size = 22,
  className,
}: {
  /** Null when the ladder's label isn't one of the seven we model. */
  tier: Tier | null
  /** The fallback's only input. Without it an unknown tier still renders nothing. */
  rating?: number | null
  size?: number
  className?: string
}) {
  const known = tier ? RANK_ICON_SRC[tier] : null
  if (known) {
    return (
      <Image
        src={known}
        alt={`${tier} rank`}
        width={size}
        height={size}
        unoptimized
        className={cn("shrink-0 object-contain select-none", className)}
      />
    )
  }

  if (rating == null) return null

  if (rating >= TIER_FLOOR.Diamond) {
    return (
      <Image
        src={FALLEN_VALHALLAN_SRC}
        alt="Fallen Valhallan"
        title="Fallen Valhallan"
        width={size}
        height={size}
        unoptimized
        className={cn("shrink-0 object-contain select-none", className)}
      />
    )
  }

  const derived = tierFromRating(rating)
  const src = derived ? RANK_ICON_SRC[derived] : null
  if (!src || !derived) return null
  return (
    <Image
      src={src}
      alt={`${derived} rank`}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 object-contain select-none", className)}
    />
  )
}

const AVATAR_SIZE_PX: Record<"sm" | "md" | "lg", number> = {
  sm: 20,
  md: 28,
  lg: 36,
}

/** Drawn when we have no legend to draw — see LegendChip. */
const UNKNOWN_LEGEND_SRC = "/assets/legends/unknown.png"

/**
 * LegendChip — a legend portrait, and it always draws one.
 *
 * `legendId` is nullable and the fallback lives HERE, the same contract
 * `RankHelm` and `RankIcon` already have: never guard a call site with
 * `{slug && <LegendChip …>}` or a dash, because that is exactly what leaves a
 * hole in a column where every other row has a picture. A missing main is not
 * missing art, it is a player whose /ranked payload we have not read a legend
 * out of yet — so it gets the art for "not known", not an em dash that reads
 * like a broken cell in a grid of portraits.
 */
export function LegendChip({
  legendId,
  showName = true,
  size = "md",
  className,
}: {
  legendId: string | null | undefined
  showName?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const legend = legendId ? getLegend(legendId) : undefined
  const src = legend?.imageUrl ?? UNKNOWN_LEGEND_SRC
  const avatarSize =
    size === "sm" ? "size-5" : size === "lg" ? "size-9" : "size-7"
  const px = AVATAR_SIZE_PX[size]
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      title={legend ? undefined : "Main legend not known yet"}
    >
      <span
        aria-hidden
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md border border-border/60 bg-gradient-to-br from-muted to-card",
          avatarSize
        )}
      >
        <Image
          src={src}
          alt=""
          width={px}
          height={px}
          className="absolute inset-0 size-full object-cover"
        />
      </span>
      {showName && (
        <span className="truncate text-sm">{legend?.name ?? "Unknown"}</span>
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
        className={cn("shrink-0 object-contain select-none", className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-md border border-border/60 bg-muted/40",
        className
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
 * StanceLabel — "[icon] Stance Name", optionally prefixed with "BEST WITH".
 *
 * The prefix is off on the Popular Legends card: six rows of it is six
 * repetitions of a phrase that the icon and the stance name already imply, and
 * the line it sits on is the narrowest thing on the homepage.
 *
 * The `sm` skin exists for card rows, where this sits on the subtitle line
 * under a legend's name: the default icon is 20px, which is taller than the
 * 10px micro-label it replaces, and six rows each a few pixels taller would
 * push the card out of line with the two beside it.
 */
export function StanceLabel({
  stance,
  size = "md",
  showPrefix = true,
  className,
}: {
  stance: Stance
  size?: "sm" | "md"
  showPrefix?: boolean
  className?: string
}) {
  const info = STANCE_INFO[stance]
  const sm = size === "sm"
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs text-muted-foreground",
        sm ? "gap-1" : "gap-1.5",
        className
      )}
    >
      {showPrefix && (
        <span className="font-mono text-[10px] tracking-wider uppercase">
          best with
        </span>
      )}
      <Image
        src={info.src}
        alt=""
        width={sm ? 14 : 20}
        height={sm ? 14 : 20}
        className="shrink-0 object-contain select-none"
      />
      <span className={cn("text-muted-foreground", sm ? "text-xs" : "text-sm")}>
        {info.label}
      </span>
    </span>
  )
}

/**
 * Per-region text / outline / fill. The fill carries the region's own hue at
 * the same 10% tint every other tag uses, so a region tag sits in a row of
 * tags as one of them rather than as a neutral chip that happens to have
 * coloured text.
 *
 * This is the colour for lists, where a column of regions is something you
 * scan and group by eye — ten hues down a leaderboard do real work. On a
 * profile there is exactly one region and nothing to compare it against, so
 * the hue says nothing and competes with the tier and pro colours around it;
 * pass `tone="ice"` there to match the ladder rank it sits beside.
 */
export const REGION_COLOR: Record<
  string,
  { text: string; border: string; bg: string }
> = {
  ALL: {
    text: "text-muted-foreground",
    border: "border-border/60",
    bg: "bg-muted/40",
  },
  BRZ: {
    text: "text-[#4ade80]",
    border: "border-[#4ade80]/40",
    bg: "bg-[#4ade80]/10",
  },
  "US-E": {
    text: "text-[#f87171]",
    border: "border-[#f87171]/40",
    bg: "bg-[#f87171]/10",
  },
  "US-W": {
    text: "text-[#38bdf8]",
    border: "border-[#38bdf8]/40",
    bg: "bg-[#38bdf8]/10",
  },
  EU: {
    text: "text-[#60a5fa]",
    border: "border-[#60a5fa]/40",
    bg: "bg-[#60a5fa]/10",
  },
  SEA: {
    text: "text-[#2dd4bf]",
    border: "border-[#2dd4bf]/40",
    bg: "bg-[#2dd4bf]/10",
  },
  AUS: {
    text: "text-[#fb923c]",
    border: "border-[#fb923c]/40",
    bg: "bg-[#fb923c]/10",
  },
  // Both spellings: player data says JPN, leaderboard rows say JPS.
  JPN: {
    text: "text-[#facc15]",
    border: "border-[#facc15]/40",
    bg: "bg-[#facc15]/10",
  },
  JPS: {
    text: "text-[#facc15]",
    border: "border-[#facc15]/40",
    bg: "bg-[#facc15]/10",
  },
  SA: {
    text: "text-[#c084fc]",
    border: "border-[#c084fc]/40",
    bg: "bg-[#c084fc]/10",
  },
  ME: {
    text: "text-[#f472b6]",
    border: "border-[#f472b6]/40",
    bg: "bg-[#f472b6]/10",
  },
}

/** Region tag in the ladder's ice, for the profile — see REGION_COLOR. */
const REGION_ICE = {
  text: "text-ice",
  border: "border-ice/40",
  bg: "bg-ice/10",
} as const

export type RegionTone = "region" | "ice"

function regionTone(region: string, tone: RegionTone) {
  return tone === "ice" ? REGION_ICE : REGION_COLOR[region]
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
  tone = "region",
}: {
  region: string
  rank: number
  className?: string
  tone?: RegionTone
}) {
  const c = regionTone(region, tone)
  // No tooltip: "US-E #2" is already the sentence a tooltip would write out.
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase",
        c?.text ?? "text-muted-foreground",
        c?.border ?? "border-border/60",
        c?.bg ?? "bg-muted/40",
        className
      )}
    >
      {region} #{rank.toLocaleString()}
    </span>
  )
}

/** Region pill — flat, compact, monospace, color-coded per region (text + outline). */
export function RegionPill({
  region,
  className,
  tone = "region",
}: {
  region: string
  className?: string
  tone?: RegionTone
}) {
  const c = regionTone(region, tone)
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase",
        c?.text ?? "text-muted-foreground",
        c?.border ?? "border-border/60",
        c?.bg ?? "bg-muted/40",
        className
      )}
    >
      {region}
    </span>
  )
}

/**
 * PatchTag — "Patch 10.10", wherever a surface says which patch it describes.
 *
 * Neutral on purpose. It appeared in six places in the accent colour, which
 * put a coloured chip on almost every data card for a fact that is the same
 * on all of them and that nobody is looking for: the patch number is context,
 * not a finding. In accent it competed with the Valhallan+ tag sitting
 * directly beside it on two of those cards, where the tier filter is the thing
 * that actually changes what you're reading. Muted, it still reads as a tag
 * and stops pulling rank on the data.
 *
 * Same micro-label treatment as RegionPill's fallback, so the two sit together
 * without arguing.
 */
export function PatchTag({
  version,
  pill = false,
  className,
}: {
  /** Patch number alone, e.g. "10.10" — the component adds the word. */
  version: string | null | undefined
  /** Fully rounded, for the launcher hero where it sits inside a pill. */
  pill?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase",
        pill ? "rounded-full" : "rounded",
        className
      )}
    >
      {version ? `Patch ${version}` : "Latest"}
    </span>
  )
}
