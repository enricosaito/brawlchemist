import Link from "next/link"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * RightPanel — the stacked "game UI panel" column. Server component: it only
 * arranges children (the live data cards) inside a scroll container so the
 * launcher can stay a single screen on desktop while the rail scrolls.
 */
export function RightPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-4 overflow-y-auto px-4 pb-8 lg:h-full lg:py-6 lg:pl-0 lg:pr-5 xl:pr-7",
        className,
      )}
      aria-label="What's new and live meta"
    >
      {children}
    </aside>
  )
}

/**
 * WhatsNewCard — the "WHAT'S NEW THIS PATCH" banner from the reference, wired
 * to the real patch-notes route. Kept in the launcher namespace because its
 * loud gradient treatment only belongs on the launcher screen.
 */
export function WhatsNewCard({ patch }: { patch: string }) {
  return (
    <Link
      href="/patch-notes"
      className="group relative block overflow-hidden rounded-xl border border-tier-s/30 bg-gradient-to-br from-tier-s/15 via-card/60 to-card/60 p-5 transition-colors hover:border-tier-s/60"
    >
      <div
        aria-hidden
        className="ember-glow pointer-events-none absolute -right-10 -top-10 size-40 opacity-70 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-tier-s" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-tier-s">
          What&apos;s new
        </span>
      </div>
      <p className="mt-2 font-display text-lg font-semibold text-foreground">
        Patch {patch} is live
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Balance shifts, tier movement, and the latest meta read.
      </p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-tier-s">
        Read patch notes
        <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
