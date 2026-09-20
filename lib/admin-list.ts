/**
 * The shape every paginated admin list reads its query in, and the one place
 * the URL is parsed into it. Plain module: the tabs (server) and the search
 * box (client) both import it.
 */

export const ADMIN_PAGE_SIZE = 25

export interface ListQuery {
  /** Free text, already trimmed; empty means no filter. */
  q: string
  /** A quick-filter chip id, validated by each list against its own set. */
  filter: string
  /** 1-based. */
  page: number
}

export interface ListPage<T> {
  rows: T[]
  /** Rows matching q + filter, across every page. */
  total: number
  page: number
  pageSize: number
}

export function parseListQuery(sp: {
  q?: string
  filter?: string
  page?: string
}): ListQuery {
  const page = Number(sp.page)
  return {
    q: (sp.q ?? "").trim().slice(0, 80),
    filter: sp.filter ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** `ILIKE` pattern for a contains-search, with the user's wildcards escaped. */
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
