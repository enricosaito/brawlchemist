import { Suspense, cache } from "react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { ShimmerText } from "@/components/shimmer-text"
import { ShineBorder } from "@/components/ui/shine-border"
import { LiveAutoRefresh } from "@/components/site/live-auto-refresh"
import { LiveClimbers } from "@/components/site/live-climbers"
import { QueueActivityCard } from "@/components/site/queue-activity-card"
import { RememberLiveView } from "@/components/site/remember-live-view"
import { LIVE_VIEW_COOKIE, parseLiveView } from "@/lib/live-view"
import { getSessionUser } from "@/lib/auth/session"
import { getViewerDefaultRegion } from "@/lib/sync/viewer-prefs"
import {
  Delta,
  LegendChip,
  PlayerLink,
  RegionPill,
} from "@/components/site/primitives"
import { API_REGIONS, isApiRegion, type ApiRegion } from "@/lib/brawlhalla-api"
import { slugForLegendId } from "@/lib/legends-roster"
import {
  getDailyMovers,
  getLiveQueue,
  isLiveQueue,
  LIVE_QUEUES,
  type LiveQueue,
  type LiveRow,
} from "@/lib/sync/live"
import { getPlayersByIds } from "@/lib/sync/players"
import { getProfilesMap } from "@/lib/sync/profiles"
import type { PlayerRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"

// Time-sensitive + reads "now − 10 min" — never cache the render.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Brawlchemist | Live Ranked Queue",
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

/**
 * LiveCard — one active player/team, styled after the leaderboard podium
 * cards. Solo cards link to the player profile (whole card is the target);
 * team cards keep per-player links since the destination is ambiguous.
 * Enriched from our own DB (no API cost): main-legend chip per player and
 * the pro handle + badge for verified pros.
 */
function LiveCard({
  row,
  playersMap,
  previews,
  fresh,
}: {
  row: LiveRow
  playersMap: Map<number, PlayerRow>
  previews: Map<number, PlayerPreview>
  /** Part of the most recent poll batch — i.e. these just finished a match. */
  fresh: boolean
}) {
  const solo = row.players.length === 1
  const player = row.players[0]
  const href = solo && player ? `/player/${player.id}` : null

  const slugFor = (id: number) => {
    const lid = playersMap.get(id)?.topLegendId
    return lid ? slugForLegendId(lid) : null
  }

  const baseClass =
    // min-w-0 is load-bearing: grid items default to min-width:auto, so a long
    // player name would set the track's min-content width and push the whole
    // page wider than the viewport instead of truncating. (Pre-existing on
    // main — the movers panels had the same problem.)
    "group/card relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur-sm"
  const interactiveClass =
    "transition hover:border-tier-valhallan/60 hover:shadow-[0_0_24px_-6px_oklch(0.76_0.24_0_/_0.5)]"

  const body = (
    <>
      {/* A shine tracing the card edge, only on entries from the newest poll.
          It marks "playing right now" without another badge competing for the
          eye, and ShineBorder is motion-safe so it stops under reduced motion. */}
      {fresh && (
        <ShineBorder
          borderWidth={1}
          duration={6}
          // Two neighbouring hues rather than three across the wheel: under
          // reduced motion the sweep freezes at an arbitrary point, and a
          // three-stop ramp left some cards outlined violet and others pink,
          // which read as a bug rather than a highlight.
          shineColor={["var(--pink)", "var(--tier-valhallan)"]}
          className="rounded-xl"
        />
      )}

      {/* Ladder rank leads — it's the thing that orders this page, and the
          old card buried it in a pill beside the region. */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-bold leading-none tabular-nums text-foreground">
          <span className="text-muted-foreground/60">#</span>
          {row.rank.toLocaleString()}
        </span>
        <Delta value={row.rankDiff} />
        {fresh && (
          <span className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-tier-valhallan">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-tier-valhallan opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-tier-valhallan" />
            </span>
            {/* ShimmerText paints via background-clip on currentColor, so the
                sweep inherits the badge's tier colour. The contrast stop needs
                the dark: prefix to land — the component ships its own
                dark:[--shimmer-contrast] and a variant selector outranks an
                unprefixed utility whatever order they end up in. Its default
                is a dark band, which dims the badge on this surface; a near-
                white one reads as a pulse of light instead. */}
            <ShimmerText
              duration={1.4}
              delay={0.4}
              className="dark:[--shimmer-contrast:oklch(1_0_0_/_0.9)]"
            >
              in queue
            </ShimmerText>
          </span>
        )}
        {row.region && (
          <RegionPill region={row.region.toUpperCase()} className="ml-auto" />
        )}
      </div>

      {/* Identity */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {solo ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            {slugFor(player!.id) && (
              <LegendChip legendId={slugFor(player!.id)!} size="sm" showName={false} />
            )}
            <span className="min-w-0 truncate text-sm font-semibold leading-tight">
              {previews.get(player!.id)?.verified?.handle ?? player?.name ?? "—"}
            </span>
            {previews.get(player!.id)?.verified?.handle && (
              <BadgeCheck className="size-3.5 shrink-0 text-foreground" />
            )}
          </span>
        ) : (
          row.players.map((p, i) => {
            const slug = slugFor(p.id)
            const handle = previews.get(p.id)?.verified?.handle
            return (
              <span key={p.id} className="inline-flex min-w-0 items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground">+</span>}
                {slug && <LegendChip legendId={slug} size="sm" showName={false} />}
                <PlayerLink
                  id={p.id}
                  className="truncate text-sm font-semibold leading-tight"
                >
                  {handle ?? p.name}
                </PlayerLink>
                {handle && (
                  <BadgeCheck className="size-3.5 shrink-0 text-foreground" />
                )}
              </span>
            )
          })
        )}
      </div>

      {/* Rating + session movement, with the age tucked on the same line so the
          card stays four rows tall instead of five. */}
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-bold tabular-nums text-foreground">
          {row.rating.toLocaleString()}
        </span>
        <Delta value={row.eloDiff} />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {relTime(row.lastActiveAt)}
        </span>
      </div>
    </>
  )

  return href ? (
    <Link href={href} className={cn(baseClass, interactiveClass)}>
      {body}
    </Link>
  ) : (
    <div className={cn(baseClass, interactiveClass)}>{body}</div>
  )
}

/**
 * One wall-clock read per request, memoised. Calling Date.now() straight from
 * a component body is an impure render call; this is the same shape the
 * profile page uses for its freshness comparisons.
 */
const requestNow = cache(() => Date.now())

const FILTER_BTN =
  "rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; region?: string }>
}) {
  const sp = await searchParams

  // Which ladder to show when the URL doesn't say. In priority order:
  //   1. an explicit ?queue / ?region — a shared link always wins
  //   2. the signed-in viewer's region (prefs.defaultRegion, else the region of
  //      the player they claimed) — if you've proved you play BRZ, BRZ is the
  //      queue you mean
  //   3. the last view they had open, from a cookie
  //   4. 1v1 / ALL
  //
  // Resolved server-side so a returning visitor's ladder is correct in the
  // first paint. The localStorage equivalent would render the default and then
  // correct itself, which flashes the wrong ladder on every visit.
  const [cookieStore, user] = await Promise.all([cookies(), getSessionUser()])
  const { queue: lastQueue, region: lastRegion } = parseLiveView(
    cookieStore.get(LIVE_VIEW_COOKIE)?.value,
  )
  const viewerRegion = user ? await getViewerDefaultRegion(user.id) : null

  const queue: LiveQueue = isLiveQueue(sp.queue)
    ? sp.queue
    : isLiveQueue(lastQueue)
      ? lastQueue
      : "1v1"
  const region: ApiRegion =
    sp.region && isApiRegion(sp.region)
      ? sp.region
      : viewerRegion && isApiRegion(viewerRegion)
        ? viewerRegion
        : lastRegion && isApiRegion(lastRegion)
          ? lastRegion
          : "ALL"

  const [rows, movers] = await Promise.all([
    getLiveQueue({ queue, region }),
    // Drops are no longer rendered, so the query for them is skipped rather
    // than fetched and thrown away.
    getDailyMovers({ queue, region, limit: 12, gainersOnly: true }),
  ])

  // "Still in a session" = part of the newest poll batch.
  //
  // The cron stamps every entry it sees play with the same timestamp, so
  // activity arrives in 5-minute clusters. A literal "changed in the last 60s"
  // test would therefore be true for about one minute in five and dead for the
  // other four — the marker would blink on and off with the cron rather than
  // with the players. Anchoring to the freshest timestamp in the set makes it
  // correct whenever the page is loaded.
  //
  // The second condition is the honesty check: if even the newest batch is
  // older than one poll cycle, nobody is mid-session and nothing is marked.
  const newest = rows.reduce(
    (max, r) => Math.max(max, r.lastActiveAt.getTime()),
    0,
  )
  const BATCH_MS = 60 * 1000
  const STALE_BATCH_MS = 6 * 60 * 1000
  const batchIsCurrent = newest > 0 && requestNow() - newest < STALE_BATCH_MS
  const isFresh = (r: LiveRow) =>
    batchIsCurrent && newest - r.lastActiveAt.getTime() < BATCH_MS

  // Enrichment from our own cache — main-legend chips (scalar columns only,
  // no ranked_json) and verified-pro handles. Zero Brawlhalla API cost; both
  // fail open to plain names.
  let playersMap = new Map<number, PlayerRow>()
  let previews = new Map<number, PlayerPreview>()
  const allRows = [...rows, ...movers.gainers]
  if (allRows.length > 0) {
    const ids = allRows.flatMap((r) => r.players.map((p) => p.id))
    const [players, profiles] = await Promise.allSettled([
      getPlayersByIds(ids, { includeRankedJson: false }),
      getProfilesMap(),
    ])
    if (players.status === "fulfilled") playersMap = players.value
    else console.error("[live] player cache lookup failed:", players.reason)
    if (profiles.status === "fulfilled") previews = profiles.value
    else console.error("[live] profiles lookup failed:", profiles.reason)
  }

  return (
    <main className="pb-16">
      <LiveAutoRefresh intervalMs={45_000} />
      <RememberLiveView queue={queue} region={region} />

      <div className="px-4 pt-8 sm:px-6 sm:pt-10">
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

          {/* Region. Ten pills plus a label doesn't fit a phone and can't
              shrink, so the group gets its own horizontal scroll lane — the
              documented exception — instead of widening the document. */}
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Region
            </span>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
              {API_REGIONS.map((r) => (
                <Link
                  key={r}
                  href={`/live?queue=${queue}&region=${r}`}
                  aria-current={region === r ? "true" : undefined}
                  className={cn(
                    FILTER_BTN,
                    "shrink-0",
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

          {/* Live count — closes out the control row on the right. */}
          <div className="ml-auto">
            <LivePill count={rows.length} />
          </div>
        </div>

        <LiveClimbers
          rows={movers.gainers}
          playersMap={playersMap}
          previews={previews}
        />

        {rows.length === 0 ? (
          <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
            No {QUEUE_LABEL[queue]} players active in the last 10 minutes
            {region !== "ALL" ? ` in ${region}` : ""}. The live poll runs every
            5 minutes — if this just launched, give it a tick, or widen the
            region filter to ALL.
          </div>
        ) : (
          <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((row) => (
              <LiveCard
                key={row.id}
                row={row}
                playersMap={playersMap}
                previews={previews}
                fresh={isFresh(row)}
              />
            ))}
          </div>
        )}

        {/* Activity curve sits below the grid — the cards are the page, this
            is the context for them. Its own Suspense boundary so a cold
            hourly cache can't hold up the live feed. */}
        <Suspense fallback={<div className="mx-auto mt-6 h-[248px] max-w-[1280px] animate-skeleton relative overflow-hidden rounded-2xl border border-border/60 bg-card/40" />}>
          <QueueActivityCard queue={queue} region={region} />
        </Suspense>
      </div>
    </main>
  )
}
