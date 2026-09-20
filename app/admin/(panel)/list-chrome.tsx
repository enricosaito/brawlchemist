import Link from "next/link"
import { cn } from "@/lib/utils"
import type { ListQuery } from "@/lib/admin-list"

/**
 * The furniture every admin list shares: the URL builder that keeps search,
 * filter and page together, the filter chips, the pager, and the cell
 * primitives — so Users and People are two tables with one vocabulary.
 */

export const TAG =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"
export const TH =
  "px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
export const TD = "px-3 py-2 align-middle"
export const CONTROL =
  "rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-pink"
export const BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 font-mono text-[11px] font-medium tracking-wider uppercase transition-colors hover:bg-muted"
export const ROW_ACTION =
  "font-mono text-[10px] tracking-wider uppercase transition-colors"

/** An em dash, so an empty cell reads as "nothing here" rather than "broken". */
export function Empty() {
  return <span className="font-mono text-xs text-muted-foreground/60">—</span>
}

/**
 * `/admin?tab=…` with the list state carried along. Pass `page: 1` (the
 * default) when the change makes the current page meaningless — a new filter
 * does; opening an edit card does not.
 */
export function adminHref(
  tab: string,
  query: Partial<ListQuery>,
  extra: Record<string, string | number | null | undefined> = {}
): string {
  const p = new URLSearchParams({ tab })
  if (query.q) p.set("q", query.q)
  if (query.filter) p.set("filter", query.filter)
  if (query.page && query.page > 1) p.set("page", String(query.page))
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== "") p.set(k, String(v))
  }
  return `/admin?${p.toString()}`
}

export function FilterChips({
  tab,
  query,
  filters,
}: {
  tab: string
  query: ListQuery
  filters: readonly { id: string; label: string }[]
}) {
  return (
    <nav
      aria-label="Filter"
      className="flex h-9 items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-1"
    >
      {filters.map((f) => {
        const active = query.filter === f.id
        return (
          <Link
            key={f.id}
            href={adminHref(tab, { q: query.q, filter: f.id })}
            prefetch={false}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded px-2.5 py-1 font-mono text-[10px] tracking-wider uppercase transition-colors",
              active
                ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * "1–25 of 97" plus Prev/Next. The range renders even on a single page,
 * because the count is the answer to "how many are there" and the pager is
 * where an operator looks for it.
 */
export function Pager({
  tab,
  query,
  total,
  pageSize,
}: {
  tab: string
  query: ListQuery
  total: number
  pageSize: number
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(query.page, pages)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const link =
    "rounded-md border border-border/60 bg-card/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground transition-colors hover:bg-muted"
  const disabled =
    "rounded-md border border-border/30 bg-card/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50"

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={adminHref(tab, { ...query, page: page - 1 })}
              prefetch={false}
              scroll={false}
              className={link}
            >
              ← Prev
            </Link>
          ) : (
            <span className={disabled}>← Prev</span>
          )}
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase tabular-nums">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link
              href={adminHref(tab, { ...query, page: page + 1 })}
              prefetch={false}
              scroll={false}
              className={link}
            >
              Next →
            </Link>
          ) : (
            <span className={disabled}>Next →</span>
          )}
        </div>
      )}
    </nav>
  )
}

/** Title, count and the controls, on one line that wraps on narrow screens. */
export function ListHeader({
  title,
  total,
  children,
}: {
  title: string
  total: number
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="font-display text-lg font-semibold">
        {title}{" "}
        <span className="font-mono text-sm font-normal text-muted-foreground tabular-nums">
          {total.toLocaleString()}
        </span>
      </h2>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

/** The message a filtered list shows when nothing matches. */
export function NoRows({ query }: { query: ListQuery }) {
  return (
    <p className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
      {query.q || query.filter ? "Nothing matches that." : "Nothing here yet."}
    </p>
  )
}
