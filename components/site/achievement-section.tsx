import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  resolveAchievements,
  type AchievementContext,
} from "@/lib/profile/achievements"

/**
 * The Achievements section of a profile.
 *
 * It used to be a compact strip of 64px tiles with everything in a tooltip,
 * which is what you do when a shelf is squeezed between a header and the
 * numbers people came for. Given a section of its own it stops needing the
 * tooltip: the name and the requirement are the content, so they are on the
 * card.
 *
 * Locked ones still render as silhouettes, and that is still the point — a set
 * showing only what you already have tells you nothing to go and do. Here they
 * read even better, because a locked card can say *how* to unlock it in the
 * same breath rather than waiting for a hover that never comes on touch.
 *
 * A server component: the rules are predicates and can't cross the RSC
 * boundary, so entitlement is decided here and only the answer ships.
 */
export function AchievementSection({
  context,
}: {
  context: AchievementContext
}) {
  const shelf = resolveAchievements(context)
  if (shelf.length === 0) return null

  return (
    <div className="mt-6 px-4 sm:px-6">
      <div className="mx-auto grid max-w-[1280px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shelf.map(({ def, unlocked, detail }) => (
          <div
            key={def.id}
            className={cn(
              "flex items-center gap-4 rounded-2xl border p-4 backdrop-blur-sm transition-colors",
              unlocked
                ? "border-border/60 bg-card/50"
                : "border-border/40 bg-card/25",
            )}
          >
            <span
              className={cn(
                "flex size-16 shrink-0 items-center justify-center rounded-xl border",
                unlocked
                  ? "border-border/60 bg-muted/30"
                  : "border-border/40 bg-muted/10",
              )}
            >
              <Image
                src={def.src}
                alt=""
                width={def.width}
                height={def.height}
                unoptimized
                className={cn(
                  "h-11 w-auto object-contain select-none",
                  // Silhouette rather than a faded copy: flattened by
                  // brightness(0), then inverted to white on the dark theme so
                  // it reads against the card. A greyscale fade would still
                  // show the artwork, which gives the badge away and makes
                  // locked look like a rendering bug.
                  !unlocked &&
                    "opacity-25 brightness-0 dark:opacity-30 dark:invert",
                )}
              />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "font-medium",
                  !unlocked && "text-muted-foreground",
                )}
              >
                {def.name}
              </span>
              <span className="text-sm text-muted-foreground">
                {def.description}
              </span>
              {/* Earned-only. Locked, this would either be blank or leak the
                  viewer's progress into a requirement. */}
              {detail && (
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {detail}
                </span>
              )}
              {!unlocked && (
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                  Locked
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
