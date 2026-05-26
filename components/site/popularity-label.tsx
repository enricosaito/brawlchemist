import { cn } from "@/lib/utils"

/**
 * Shared popularity band shown under a legend/weapon name. The label text and
 * its gold→red color are defined here so the Legends and Weapons leaderboards
 * stay visually identical; each page supplies its own threshold logic (the
 * pick-rate scales differ — weapon pick rates sum to ~200%).
 */
export type PopularityTier =
  | "most"
  | "very-popular"
  | "popular"
  | "unpopular"
  | "very-unpopular"

const POPULARITY: Record<PopularityTier, { label: string; color: string }> = {
  most: { label: "Most Popular", color: "text-tier-gold" },
  "very-popular": { label: "Very Popular", color: "text-tier-s" },
  popular: { label: "Popular", color: "text-mystic" },
  unpopular: { label: "Unpopular", color: "text-muted-foreground" },
  "very-unpopular": { label: "Very Unpopular", color: "text-negative/80" },
}

export function PopularityLabel({
  tier,
  className,
}: {
  tier: PopularityTier
  className?: string
}) {
  const p = POPULARITY[tier]
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono text-[10px] font-medium uppercase leading-tight tracking-wider",
        p.color,
        className,
      )}
    >
      {p.label}
    </span>
  )
}
