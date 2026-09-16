import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  resolveAchievements,
  type AchievementContext,
} from "@/lib/profile/achievements"
import { InfoTip } from "./info-tip"

/**
 * The achievement shelf, between the header and the season stats.
 *
 * Every badge in the catalogue, earned or not. Locked ones render as
 * silhouettes with the same tooltip, because the unearned half is what makes
 * the row worth looking at — a set that only showed what you already have would
 * tell you nothing to go and do. It is the one place on the site that shows a
 * player what they *could* have.
 *
 * A server component: the rules are predicates and can't cross the RSC
 * boundary, so entitlement is decided here and only the answer ships. The
 * tooltip is the single client boundary, and it was already one.
 */
export function AchievementShelf({ context }: { context: AchievementContext }) {
  const shelf = resolveAchievements(context)
  if (shelf.length === 0) return null
  const earned = shelf.filter((a) => a.unlocked).length

  return (
    <section className="mt-6 px-4 sm:px-6">
      <div className="mx-auto max-w-[1280px] rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm">
        <div className="flex items-baseline gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Achievements
          </h2>
          {/* The count is the progress bar. A player with one of eight should
              be able to see that without counting silhouettes. */}
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
            {earned}/{shelf.length}
          </span>
        </div>

        <ul className="mt-3 flex flex-wrap items-start gap-3">
          {shelf.map(({ def, unlocked }) => (
            <li key={def.id}>
              <InfoTip
                label={
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{def.name}</span>
                    <span className="text-muted-foreground">
                      {def.description}
                    </span>
                  </span>
                }
              >
                {/* A button, not a div: the tooltip is the only way to read
                    what a badge is, so it has to be reachable by keyboard.
                    type="button" keeps it out of any enclosing form. */}
                <button
                  type="button"
                  aria-label={`${def.name} — ${def.description}${
                    unlocked ? "" : " (locked)"
                  }`}
                  className={cn(
                    "flex size-16 shrink-0 cursor-help items-center justify-center rounded-xl border transition-colors",
                    "outline-none focus-visible:border-pink",
                    unlocked
                      ? "border-border/60 bg-muted/30 hover:border-pink/50"
                      : "border-border/40 bg-muted/10 hover:border-border",
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
                      // Silhouette rather than a faded copy: flattened to a
                      // single tone by brightness(0), then inverted to white on
                      // the dark theme so it reads against the card. A greyscale
                      // fade would still show the artwork, which gives away the
                      // badge and makes locked look like a rendering bug.
                      !unlocked &&
                        "opacity-25 brightness-0 dark:opacity-30 dark:invert",
                    )}
                  />
                </button>
              </InfoTip>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
