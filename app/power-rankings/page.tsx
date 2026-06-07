import type { Metadata } from "next"
import Link from "next/link"
import { Calendar, Medal } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { PageHero } from "@/components/site/page-hero"
import { Pagination } from "@/components/site/pagination"
import {
  isPrRegion,
  listPowerRankings,
  PR_REGIONS,
  resolveBrawlhallaIds,
  type EsportsGameMode,
  type PrPlayer,
  type PrRegion,
} from "@/lib/brawltools-api"
import { PlayerLink } from "@/components/site/player-link"

export const metadata: Metadata = {
  title: "Power Rankings · Brawlchemist",
  description:
    "Official Brawlhalla esports power rankings — PR points from tournament placements, per region, 1v1 and 2v2.",
}

// Board only moves after tournaments conclude; fetches are cached 1h anyway.
export const revalidate = 3600

const PAGE_SIZE = 25

const MODES: { id: EsportsGameMode; key: string; label: string }[] = [
  { id: 1, key: "1v1", label: "1v1" },
  { id: 2, key: "2v2", label: "2v2" },
]

/** Medal palette — literal metal tones (no site token maps to these). */
const MEDAL = {
  gold: "text-[#f7ce46]",
  silver: "text-[#c7ccd6]",
  bronze: "text-[#cd8d4c]",
} as const

/** Names arrive as "TEAM | Player" — split the sponsor prefix off for muted
 * styling. Only the first " | " is a separator. */
function splitName(raw: string): { team: string | null; name: string } {
  const i = raw.indexOf(" | ")
  if (i === -1) return { team: null, name: raw }
  return { team: raw.slice(0, i), name: raw.slice(i + 3) }
}

function fmtPoints(points: number): string {
  return Math.round(points).toLocaleString()
}

function fmtEarnings(earnings: number): string {
  return `$${Math.round(earnings).toLocaleString()}`
}

function MedalCount({
  count,
  tone,
  title,
}: {
  count: number
  tone: keyof typeof MEDAL
  title: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs tabular-nums",
        count > 0 ? MEDAL[tone] : "text-muted-foreground/40",
      )}
    >
      <Medal className="size-3.5" />
      {count}
    </span>
  )
}

function PlayerName({ raw }: { raw: string }) {
  const { team, name } = splitName(raw)
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      {team && (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {team}
        </span>
      )}
      <span className="min-w-0 truncate font-medium">{name}</span>
    </span>
  )
}

/** Top-3 podium, mirroring the leaderboards treatment — metal-toned rank ring,
 * big points, medal tallies, earnings. Cards link to the player's profile when
 * the esports id resolves to a brawlhalla account (same hover treatment as the
 * leaderboard podium). */
function PrPodium({
  entries,
  bhIds,
}: {
  entries: PrPlayer[]
  bhIds: Map<number, number>
}) {
  const RING = [
    "border-[#f7ce46]/60",
    "border-[#c7ccd6]/60",
    "border-[#cd8d4c]/60",
  ]
  const baseClass =
    "relative flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 shadow-lg backdrop-blur-sm"
  const interactiveClass =
    "transition hover:border-tier-valhallan/60 hover:shadow-[0_0_24px_-4px_oklch(0.76_0.24_0_/_0.55)]"
  return (
    <div className="mx-auto mb-4 grid max-w-[1280px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((p, i) => {
        const { team, name } = splitName(p.playerName)
        const bhId = bhIds.get(p.playerId)
        const body = (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/40 font-display text-sm font-bold text-foreground",
                  RING[i] ?? "border-border/60",
                )}
              >
                {p.powerRanking}
              </span>
              {team && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {team}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-base font-semibold leading-tight">
                {name}
              </span>
            </div>

            {/* Earnings are the featured metric; points demote to the meta row. */}
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-bold tabular-nums text-positive">
                {fmtEarnings(p.earnings)}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                earned
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <MedalCount count={p.gold} tone="gold" title="Gold placements" />
              <MedalCount
                count={p.silver}
                tone="silver"
                title="Silver placements"
              />
              <MedalCount
                count={p.bronze}
                tone="bronze"
                title="Bronze placements"
              />
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {fmtPoints(p.points)} PR points
              </span>
            </div>
          </>
        )
        return bhId ? (
          <Link
            key={p.playerId}
            href={`/player/${bhId}`}
            prefetch={false}
            className={`${baseClass} ${interactiveClass}`}
          >
            {body}
          </Link>
        ) : (
          <div key={p.playerId} className={baseClass}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

const FILTER_BTN =
  "rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"

export default async function PowerRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; region?: string; page?: string }>
}) {
  const sp = await searchParams
  const mode = MODES.find((m) => m.key === sp.mode) ?? MODES[0]
  const region: PrRegion = isPrRegion(sp.region) ? sp.region : "NA"
  const requestedPage = Math.max(1, Number(sp.page ?? "1") || 1)
  const baseQuery = `mode=${mode.key}&region=${region}`

  const result = await listPowerRankings({
    gameMode: mode.id,
    region,
    page: requestedPage,
    maxResults: PAGE_SIZE,
  })

  const board = result.ok ? result.data : null
  const rows = board?.prPlayers ?? []
  const totalPages = Math.max(1, board?.totalPages ?? 1)
  const page = Math.min(requestedPage, totalPages)

  // esports playerId → brawlhalla_id, so rows can link to player profiles.
  // Unresolvable ids (no linked account) just render as plain text.
  const bhIds =
    rows.length > 0
      ? await resolveBrawlhallaIds(rows.map((p) => p.playerId))
      : new Map<number, number>()

  const columns: ColDef<PrPlayer>[] = [
    {
      id: "pr",
      label: "PR",
      width: "64px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {p.powerRanking.toLocaleString()}
        </span>
      ),
    },
    {
      id: "player",
      label: "Player",
      // PlayerLink degrades to plain text for unresolved ids.
      render: (p) => (
        <PlayerLink id={bhIds.get(p.playerId)}>
          <PlayerName raw={p.playerName} />
        </PlayerLink>
      ),
    },
    // Earnings lead the metric columns; points close them out.
    {
      id: "earnings",
      label: "Earnings",
      align: "right",
      width: "120px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-positive">
          {fmtEarnings(p.earnings)}
        </span>
      ),
    },
    {
      id: "top8",
      label: "Top 8",
      align: "right",
      width: "80px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {p.top8}
        </span>
      ),
    },
    {
      id: "top32",
      label: "Top 32",
      align: "right",
      width: "80px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {p.top32}
        </span>
      ),
    },
    {
      id: "medals",
      label: "Medals",
      align: "center",
      width: "170px",
      render: (p) => (
        <span className="inline-flex items-center gap-3">
          <MedalCount count={p.gold} tone="gold" title="Gold placements" />
          <MedalCount count={p.silver} tone="silver" title="Silver placements" />
          <MedalCount count={p.bronze} tone="bronze" title="Bronze placements" />
        </span>
      ),
    },
    {
      id: "points",
      label: "Points",
      align: "right",
      width: "110px",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums">
          {fmtPoints(p.points)}
        </span>
      ),
    },
  ]

  return (
    <main className="pb-16">
      <PageHero
        title="Power Rankings"
        subtitle="The official Brawlhalla esports rankings — PR points earned from placements at official tournaments, per region."
        meta={
          <>
            {board?.lastUpdated && (
              <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Calendar className="size-2.5" />
                updated {board.lastUpdated}
              </span>
            )}
            <span className="inline-flex items-center rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              via brawltools
            </span>
          </>
        }
      />

      <div className="px-4 sm:px-6">
        <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-3">
          {/* Mode */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Mode
            </span>
            <div
              role="tablist"
              aria-label="Mode"
              className="flex items-center rounded-md border border-border/60 bg-muted/40 p-1"
            >
              {MODES.map((m) => (
                <Link
                  key={m.key}
                  role="tab"
                  aria-selected={mode.key === m.key}
                  href={`/power-rankings?mode=${m.key}&region=${region}`}
                  className={cn(
                    FILTER_BTN,
                    mode.key === m.key
                      ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Region — the PR boards are strictly regional (no ALL upstream). */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Region
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
              {PR_REGIONS.map((r) => (
                <Link
                  key={r}
                  href={`/power-rankings?mode=${mode.key}&region=${r}`}
                  aria-current={region === r ? "true" : undefined}
                  className={cn(
                    FILTER_BTN,
                    region === r
                      ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {!result.ok ? (
          <div className="mx-auto max-w-[1280px] rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-negative">
              Power rankings unavailable
            </div>
            <p>Couldn&apos;t reach the esports API. Please try again shortly.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
            No {mode.label} power rankings for {region}.
          </div>
        ) : (
          <div className="mx-auto max-w-[1280px]">
            {page === 1 && <PrPodium entries={rows.slice(0, 3)} bhIds={bhIds} />}
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(p) => String(p.playerId)}
              searchValue={(p) => p.playerName}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              ariaLabel="Power rankings pagination"
              hrefFor={(p) => `/power-rankings?${baseQuery}&page=${p}`}
            />
          </div>
        )}
      </div>
    </main>
  )
}
