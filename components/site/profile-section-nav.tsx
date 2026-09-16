import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * The profile's own navigation: Ranked · Achievements · Gems.
 *
 * It sits where the accolade strip used to, and it replaces the strip rather
 * than joining it. Three sections of one page, not three pages — which is why
 * there is no "back to profile" anywhere below it. You were never anywhere
 * else; the header above never moves, and the body beneath swaps.
 *
 * Server-rendered Links over a searchParam, the same shape as the filter tabs
 * on /tournaments and /power-rankings, so the whole thing stays static and a
 * section is linkable. `scroll={false}` keeps the viewport where it is — the
 * nav you just clicked should not jump out from under the cursor.
 *
 * Each entry carries its own count, so the tabs say what is behind them before
 * you open them: "Achievements 1/3" is a reason to click, "Achievements" is
 * not.
 */
export interface ProfileSection {
  id: string
  label: string
  href: string
  /** "1/3" — shown beside the label when the section has a tally. */
  count?: string
}

export function ProfileSectionNav({
  sections,
  active,
}: {
  sections: ProfileSection[]
  active: string
}) {
  if (sections.length < 2) return null
  return (
    <div className="mt-6 px-4 sm:px-6">
      {/* The card the accolade shelf used to be, and the same width, because it
          stands in the same place. Three equal panels rather than three words
          in a corner: this is the profile's primary navigation, and a row of
          small text chips reads as a filter on the thing below it instead of
          the thing that chooses it. */}
      <nav
        aria-label="Profile sections"
        className="mx-auto grid max-w-[1280px] grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-card/50 p-2 backdrop-blur-sm"
      >
        {sections.map((s) => {
          const current = s.id === active
          return (
            <Link
              key={s.id}
              href={s.href}
              scroll={false}
              prefetch={false}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-center transition-colors",
                current
                  ? "border-pink/50 bg-pink/10 text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-card/60 hover:text-foreground",
              )}
            >
              <span className="truncate font-mono text-[11px] font-medium uppercase tracking-wider">
                {s.label}
              </span>
              {/* The tally is the reason to click: "Achievements 1/3" is an
                  invitation, "Achievements" is a label. */}
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  current ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {s.count ?? " "}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
