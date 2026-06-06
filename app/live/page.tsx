import type { Metadata } from "next"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { LiveAutoRefresh } from "@/components/site/live-auto-refresh"
import { PageHero } from "@/components/site/page-hero"
import { Delta, PlayerLink, RegionPill } from "@/components/site/primitives"
import { API_REGIONS, isApiRegion } from "@/lib/brawlhalla-api"
import {
  getLiveQueue,
  isLiveQueue,
  LIVE_QUEUES,
  type LiveQueue,
  type LiveRow,
} from "@/lib/sync/live"

// Time-sensitive + reads "now − 10 min" — never cache the render.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Live Ranked Queue — Brawlchemist",
  description:
    "Brawlhalla players actively climbing ranked right now — live ELO and rank movement across the top 500.",
}

const QUEUE_LABEL: Record<LiveQueue, string> = { "1v1": "1v1", "2v2": "2v2" }

function relTime(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (mins <= 0) return "just now"
  return `${mins}m ago`
}

function LivePill({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-negative/40 bg-negative/10 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-negative">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-negative opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-negative" />
      </span>
      {count} live now
    </span>
  )
}

const FILTER_BTN =
  "rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; region?: string }>
}) {
  const sp = await searchParams
  const queue: LiveQueue = isLiveQueue(sp.queue) ? sp.queue : "1v1"
  const region =
    sp.region && isApiRegion(sp.region) ? sp.region : "ALL"

  const rows = await getLiveQueue({ queue, region })
  const isTeam = queue === "2v2"

  const columns: ColDef<LiveRow>[] = [
    {
      id: "rank",
      label: "Rank",
      width: "92px",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {r.rank.toLocaleString()}
          </span>
          <Delta value={r.rankDiff} />
        </div>
      ),
    },
    {
      id: "player",
      label: isTeam ? "Team" : "Player",
      render: (r) => (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {r.players.map((p, i) => (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground">+</span>}
              <PlayerLink id={p.id} className="truncate font-medium">
                {p.name}
              </PlayerLink>
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "rating",
      label: "Rating",
      align: "right",
      width: "150px",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <span className="font-mono text-sm tabular-nums">
            {r.rating.toLocaleString()}
          </span>
          <Delta value={r.eloDiff} className="min-w-[3.25rem] justify-end" />
        </div>
      ),
    },
    {
      id: "region",
      label: "Region",
      align: "center",
      width: "92px",
      render: (r) =>
        r.region ? (
          <RegionPill region={r.region.toUpperCase()} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "active",
      label: "Last played",
      align: "right",
      width: "110px",
      render: (r) => (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {relTime(r.lastActiveAt)}
        </span>
      ),
    },
  ]

  return (
    <main className="pb-16">
      <LiveAutoRefresh intervalMs={45_000} />
      <PageHero
        title="Live ranked queue"
        subtitle="Top-500 players who finished a ranked match in the last 10 minutes — with the ELO and rank they've moved this session."
        meta={<LivePill count={rows.length} />}
      />

      <div className="px-4 sm:px-6">
        <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-3">
          {/* Queue */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Queue
            </span>
            <div
              role="tablist"
              aria-label="Queue"
              className="flex items-center rounded-md border border-border/60 bg-muted/40 p-1"
            >
              {LIVE_QUEUES.map((q) => (
                <Link
                  key={q}
                  role="tab"
                  aria-selected={queue === q}
                  href={`/live?queue=${q}&region=${region}`}
                  className={cn(
                    FILTER_BTN,
                    queue === q
                      ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {QUEUE_LABEL[q]}
                </Link>
              ))}
            </div>
          </div>

          {/* Region */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Region
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
              {API_REGIONS.map((r) => (
                <Link
                  key={r}
                  href={`/live?queue=${queue}&region=${r}`}
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

        {rows.length === 0 ? (
          <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
            No {QUEUE_LABEL[queue]} players active in the last 10 minutes
            {region !== "ALL" ? ` in ${region}` : ""}. The live poll runs every
            5 minutes — if this just launched, give it a tick, or widen the
            region filter to ALL.
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            searchValue={(r) => r.players.map((p) => p.name).join(" ")}
          />
        )}
      </div>
    </main>
  )
}
