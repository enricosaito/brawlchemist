import Image from "next/image"
import type { PlayerStats } from "@/lib/brawlhalla-api"
import { resolveGems, type GemContext, type GemLevelDef } from "@/lib/profile/gems"
import { cn } from "@/lib/utils"
import { LifetimeStatsSection } from "@/components/player/lifetime-stats-section"

/**
 * The Gems section: the three gems, then the lifetime records they are cut
 * from.
 *
 * They share a section rather than linking to each other because they are the
 * same answer at two resolutions. A gem is the headline — one object whose
 * colour *is* the number — and the tables underneath are the working. Sending
 * someone to a different page to see where their gem came from would be a
 * navigation step in the middle of a single thought.
 */
export function GemSection({
  context,
  stats,
}: {
  context: GemContext
  /** The lifetime payload the gems are graded from, when it loaded. */
  stats: PlayerStats | null
}) {
  const gems = resolveGems(context)

  return (
    <>
      <div className="mt-6 px-4 sm:px-6">
        <div className="mx-auto grid max-w-[1280px] gap-3 sm:grid-cols-3">
          {gems.map(({ def, value, level, next }) => (
            <div
              key={def.id}
              className={cn(
                "flex items-center gap-4 rounded-2xl border p-4 backdrop-blur-sm",
                level
                  ? "border-border/60 bg-card/50"
                  : "border-border/40 bg-card/25",
              )}
            >
              <Gem level={level} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{def.name}</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-wider",
                      level ? "text-foreground/70" : "text-muted-foreground/60",
                    )}
                  >
                    {level ? level.label : "Uncut"}
                  </span>
                </span>
                <span className="font-mono text-xl font-bold tabular-nums">
                  {value == null ? "—" : value.toLocaleString()}
                </span>
                {/* The distance to the next level, which is the only thing a
                    graded badge can say that a binary one can't. */}
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {value == null
                    ? "No data yet"
                    : next
                      ? `${(next.min - value).toLocaleString()} to ${next.label}`
                      : "Maxed"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <LifetimeStatsSection stats={stats} />
    </>
  )
}

/**
 * The gem itself: the level's sprite, and a tinted facet shape for a level that
 * has none — which is the state an uncut gem and every newly added level start
 * in. The fallback is drawn rather than boxed because a placeholder rectangle
 * beside a name reads as a broken image.
 */
function Gem({ level }: { level: GemLevelDef | null }) {
  if (level?.src) {
    return (
      <Image
        src={level.src}
        alt=""
        width={level.width ?? 192}
        height={level.height ?? 192}
        unoptimized
        className="size-14 shrink-0 object-contain select-none"
      />
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-14 shrink-0", !level && "opacity-25")}
      style={{ color: level?.tone ?? "var(--color-muted-foreground)" }}
    >
      {/* Three facets, so the shape reads as cut stone rather than a pentagon. */}
      <path d="M12 2 3 9l9 13 9-13z" fill="currentColor" opacity="0.28" />
      <path d="M12 2 3 9h18z" fill="currentColor" opacity="0.9" />
      <path d="M12 22 3 9h6z" fill="currentColor" opacity="0.55" />
      <path d="M12 22 21 9h-6z" fill="currentColor" opacity="0.7" />
      <path
        d="M12 2 3 9l9 13 9-13z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}
