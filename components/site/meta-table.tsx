"use client"

import { Fragment, useState } from "react"
import { ChevronDown } from "lucide-react"
import { META_COL } from "@/lib/meta-columns"
import { cn } from "@/lib/utils"

/**
 * The expandable table behind /meta-picks.
 *
 * Deliberately not a flag on `DataTable`. That one is a server component shared
 * by the leaderboards, favorites and the pro board, and expansion is client
 * state — bolting it on would make six pages pay a boundary so one page could
 * open a row. This is the one caller that needs it, so it owns it.
 *
 * Rows arrive fully rendered: the parent is a server component and builds both
 * the summary cells and the detail panel, and hands them over as props. Opening
 * a row is a `useState` toggle over markup that already crossed the wire — no
 * fetch, no spinner, no loading state to design. The panel is mounted the whole
 * time and collapsed to zero height, which is what lets it animate shut as well
 * as open — a conditionally rendered panel can only ever animate in, because by
 * the time it would animate out React has already removed it.
 */

export interface MetaRow {
  key: string
  /** The leading art — a legend portrait or a weapon icon. */
  art: React.ReactNode
  name: string
  /** The popularity band under the name. */
  band: React.ReactNode
  pick: string
  win: string
  games: string
  /** What the chevron opens. Null leaves the row un-expandable. */
  detail: React.ReactNode | null
  /**
   * Overrides the table's heading for this row's panel — "70 Caspian mains"
   * rather than "Top mains". Per row because the count and the subject are
   * facts about the row, not the table. The table-level label stays as it is
   * for the aria-label, which already names the row and would otherwise read
   * "show 70 caspian mains for Caspian".
   */
  detailLabel?: string
}

export function MetaTable({
  rows,
  detailLabel,
}: {
  rows: MetaRow[]
  /** "Top mains" / "Top legends" — says what the panel is before it opens. */
  detailLabel: string
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {/* table-fixed, so the declared widths are the rendered widths. With auto
          layout the browser treats them as hints and redistributes — measured
          40px against a declared 36 — and an expanded panel laid out in flex on
          the same constants would then miss its headings by a few pixels each,
          compounding left. */}
      <table className="w-full table-fixed border-collapse">
        <thead className="bg-card">
          <tr>
            <Th className={cn(META_COL.rank, "text-right")}>#</Th>
            <Th>Name</Th>
            <Th className={cn(META_COL.stat, "text-right")}>Pick</Th>
            <Th className={cn(META_COL.stat, "text-right")}>Win</Th>
            <Th className={cn(META_COL.games, "text-right")}>Games</Th>
            <Th className={META_COL.chevron} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const expanded = open === row.key
            return (
              <Fragment key={row.key}>
                <tr
                  onClick={() =>
                    row.detail && setOpen(expanded ? null : row.key)
                  }
                  className={cn(
                    "border-t border-border/40 transition-colors",
                    row.detail && "cursor-pointer hover:bg-muted/40",
                    expanded && "bg-muted/30"
                  )}
                >
                  <td className="px-3 py-2 text-right align-middle">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {row.art}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm leading-tight font-medium">
                          {row.name}
                        </span>
                        {row.band}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right align-middle font-mono text-sm font-medium text-pink tabular-nums">
                    {row.pick}
                  </td>
                  <td className="px-3 py-2 text-right align-middle font-mono text-sm font-medium text-positive tabular-nums">
                    {row.win}
                  </td>
                  <td className="px-3 py-2 text-right align-middle font-mono text-sm text-muted-foreground tabular-nums">
                    {row.games}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    {row.detail && (
                      // A button inside the row rather than the row being one:
                      // a <tr> can't be a button, and the whole row is already
                      // clickable — this is the affordance that says so, and
                      // the thing a keyboard can reach.
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen(expanded ? null : row.key)
                        }}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "Show"} ${detailLabel.toLowerCase()} for ${row.name}`}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform duration-200 motion-reduce:transition-none",
                            expanded && "rotate-180"
                          )}
                        />
                      </button>
                    )}
                  </td>
                </tr>
                {row.detail && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        )}
                      >
                        {/* The clipper. Its child is measured at its natural
                            height while the row above animates between 0fr and
                            1fr — which is why the border and padding live
                            inside it rather than on the <tr>, where they would
                            show as a stray line through a collapsed row. */}
                        <div className="overflow-hidden">
                          <div
                            className={cn(
                              "border-t border-border/40 bg-muted/20 pt-2 pb-2 transition-opacity duration-200 motion-reduce:transition-none",
                              expanded ? "opacity-100" : "opacity-0"
                            )}
                          >
                            <div className="mb-1 px-3 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                              {row.detailLabel ?? detailLabel}
                            </div>
                            {row.detail}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <th
      className={cn(
        "border-b border-border/60 px-3 py-2.5 text-left font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </th>
  )
}
