import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * PreviewCard — the dpm.lol-style preview tile shell.
 * Header (title + meta), body (slotted rows), footer ("view all" link).
 */
export function PreviewCard({
  title,
  meta,
  href,
  viewAllLabel = "view all",
  children,
  className,
}: {
  title: string
  meta?: React.ReactNode
  href: string
  viewAllLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/60",
        className,
      )}
    >
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border/60 px-4 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">{meta}</div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border/60 px-2 py-1.5">
        <Link
          href={href}
          className="flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-copper"
        >
          {viewAllLabel}
          <ArrowUpRight className="size-3" />
        </Link>
      </footer>
    </section>
  )
}
