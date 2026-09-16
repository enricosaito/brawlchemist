/**
 * The column geometry shared by the /meta-picks table and its expanded panels.
 *
 * A plain module rather than a constant beside the table it describes, because
 * `components/site/meta-table.tsx` is `"use client"` and **a server component
 * importing a value out of a client module gets a client reference, not the
 * value**. It does not throw: the proxy's properties read as undefined, `cn`
 * drops them, and the panel renders with no widths at all — measured 57px and
 * 44px where 76 and 84 were declared. The symptom is a few pixels of drift in a
 * dropdown, which is exactly the kind of thing that ships.
 *
 * Shared constants rather than repeated literals for the ordinary reason too:
 * the table is laid out by `table-fixed` and the panel by flex, so nothing
 * makes the two agree except these being the same strings.
 */
export const META_COL = {
  rank: "w-[44px]",
  stat: "w-[76px]",
  games: "w-[84px]",
  chevron: "w-[36px]",
} as const
