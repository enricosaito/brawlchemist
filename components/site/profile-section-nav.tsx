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
      <nav
        aria-label="Profile sections"
        className="mx-auto flex w-full max-w-[1280px] items-center gap-1 overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-1"
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
                "flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors",
                current
                  ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              {s.count && (
                <span
                  className={cn(
                    "tabular-nums",
                    current ? "text-muted-foreground" : "text-muted-foreground/60",
                  )}
                >
                  {s.count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
