import { cn } from "@/lib/utils"

export interface ColDef<T> {
  id: string
  label: string
  align?: "left" | "right" | "center"
  width?: string
  thClass?: string
  cellClass?: string
  render: (row: T, index: number) => React.ReactNode
}

/**
 * DataTable — semantic <table> with sticky header. No client-side sortability
 * for v1 (mock data). Rows are sorted by the caller.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  className,
  searchValue,
}: {
  columns: ColDef<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  className?: string
  /** When set, each row gets a lowercased `data-search` attr for client-side
   * text filtering (see LeaderboardSearch). */
  searchValue?: (row: T, index: number) => string
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-[1280px] overflow-hidden rounded-xl border border-border/60 bg-card/40",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-card">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn(
                    "border-b border-border/60 px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.align === "left" && "text-left",
                    !c.align && "text-left",
                    c.thClass,
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                data-search={
                  searchValue ? searchValue(row, i).toLowerCase() : undefined
                }
                className="border-t border-border/40 transition-colors hover:bg-muted/40"
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "px-3 py-2 align-middle text-sm",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.cellClass,
                    )}
                  >
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
