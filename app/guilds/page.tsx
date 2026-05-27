import type { Metadata } from "next"
import Link from "next/link"
import { Users } from "lucide-react"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { LeaderboardSearch } from "@/components/site/leaderboard-search"
import { Pagination } from "@/components/site/pagination"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getGuildLeaderboard } from "@/lib/sync/guilds"
import type { GuildListRow } from "@/lib/db/schema"

export const metadata: Metadata = {
  title: "Guild Rankings · Brawlchemist",
  description: "Top Brawlhalla guilds, ranked by official guild rank.",
}

const PAGE_SIZE = 50

const num = (n: number | null) => (n == null ? "—" : n.toLocaleString())

function tagsOf(g: GuildListRow): string[] {
  return Array.isArray(g.tags) ? (g.tags as string[]) : []
}

function buildColumns(): ColDef<GuildListRow>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "64px",
      align: "right",
      render: (g) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {g.rank ?? "—"}
        </span>
      ),
    },
    {
      id: "guild",
      label: "Guild",
      render: (g) => {
        const tags = tagsOf(g).slice(0, 3)
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={`/guilds/${g.guildId}`}
              className="truncate text-sm font-medium transition-colors hover:text-tier-valhallan"
            >
              {g.name}
            </Link>
            {(g.isRecruiting || tags.length > 0) && (
              <div className="flex flex-wrap items-center gap-1">
                {g.isRecruiting && (
                  <span className="rounded border border-positive/40 bg-positive/10 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-positive">
                    Recruiting
                  </span>
                )}
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      },
    },
    {
      id: "members",
      label: "Members",
      align: "right",
      width: "100px",
      render: (g) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {num(g.memberCount)}
        </span>
      ),
    },
    {
      id: "points",
      label: "Weekly Pts",
      align: "right",
      width: "120px",
      render: (g) => (
        <span className="font-mono text-sm tabular-nums text-tier-s">
          {num(g.guildPoints)}
        </span>
      ),
    },
    {
      id: "xp",
      label: "Total XP",
      align: "right",
      width: "140px",
      render: (g) => (
        <span className="font-mono text-sm tabular-nums">{num(g.xp)}</span>
      ),
    },
  ]
}

export default async function GuildsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const guilds = await getGuildLeaderboard()
  const sp = await searchParams
  const totalPages = Math.max(1, Math.ceil(guilds.length / PAGE_SIZE))
  const page = Math.min(
    Math.max(1, Number(sp.page ?? "1") || 1),
    totalPages,
  )
  const pageRows = guilds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <div className="px-4 pt-8 sm:px-6 sm:pt-10">
          <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3">
            <LeaderboardSearch className="w-full sm:w-auto sm:min-w-[220px]" />
            {guilds.length > 0 && (
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {guilds.length} guild{guilds.length === 1 ? "" : "s"} discovered
              </span>
            )}
          </div>

          {guilds.length === 0 ? (
            <div className="mx-auto flex max-w-[1280px] items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              <Users className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <p>
                Guilds are still being discovered. We find them by walking the
                ranked player pool, so the board fills in over time — check back
                soon.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-[1280px]">
              <DataTable
                columns={buildColumns()}
                rows={pageRows}
                rowKey={(g) => String(g.guildId)}
                searchValue={(g) => g.name}
              />
              <p
                id="leaderboard-no-match"
                hidden
                className="mt-3 text-sm text-muted-foreground"
              >
                No guilds match your search.
              </p>
              <Pagination
                page={page}
                totalPages={totalPages}
                ariaLabel="Guild pagination"
                hrefFor={(p) => `/guilds?page=${p}`}
              />
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
