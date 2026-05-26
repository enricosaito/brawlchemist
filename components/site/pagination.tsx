import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Shared Prev/Next pager for the server-paginated boards (leaderboards, OTPs,
 * guilds). `hrefFor` builds the link for a given 1-based page so each page can
 * preserve its own query params (mode/region/legend). Renders nothing when
 * there's only a single page.
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  ariaLabel = "Pagination",
  className,
}: {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
  ariaLabel?: string
  className?: string
}) {
  if (totalPages <= 1) return null

  const linkClass =
    "rounded-md border border-border/60 bg-card/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground transition-colors hover:bg-muted"
  const disabledClass =
    "rounded-md border border-border/30 bg-card/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50"

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "mt-4 flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Page {page} of {totalPages.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkClass}>
            ← Prev
          </Link>
        ) : (
          <span className={disabledClass}>← Prev</span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={linkClass}>
            Next →
          </Link>
        ) : (
          <span className={disabledClass}>Next →</span>
        )}
      </div>
    </nav>
  )
}
