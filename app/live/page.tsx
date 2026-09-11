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
  IN_QUEUE_MS,
  LIVE_QUEUES,
  type LiveQueue,
  type LiveRow,
} from "@/lib/sync/live"
import { getPlayersByIds } from "@/lib/sync/players"
import { getProfilesMap } from "@/lib/sync/profiles"
import type { PlayerRow } from "@/lib/db/schema"
import type { PlayerPreview } from "@/lib/player-previews"

// Time-sensitive + reads "now − 20 min" — never cache the render.
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
      {count} in queue
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
  /** Played within the last 5 minutes — i.e. almost certainly still queueing. */
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
      {/* A shine tracing the card edge, only on entries that played in the last
          5 minutes. It's what separates "in queue right now" from the rest of
          the 20-minute tail without a second badge competing for the eye, and
          ShineBorder is motion-safe so it stops under reduced motion. */}
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
  const { region: lastRegion } = parseLiveView(
    cookieStore.get(LIVE_VIEW_COOKIE)?.value,
  )
  const viewerRegion = user ? await getViewerDefaultRegion(user.id) : null

  const region: ApiRegion =
    sp.region && isApiRegion(sp.region)
      ? sp.region
      : viewerRegion && isApiRegion(viewerRegion)
        ? viewerRegion
        : lastRegion && isApiRegion(lastRegion)
          ? lastRegion
          : "ALL"

  // Both ladders, together. Splitting them across a tab meant each view showed
  // whatever was active in its own 10-minute window — measured at 8 cards for
  // 1v1 and 7 for 2v2, and 1-4 once a region filter is on. A four-column grid
  // holding four cards reads as broken rather than as quiet, and the viewer had
  // to click to discover the other ladder was equally quiet. One extra
  // live_ranked read costs ~1.4 kB per render (the window caps the row count
  // long before the 200-row limit does), which buys a page that fills out.
  const [rows1v1, rows2v2, movers1v1, movers2v2] = await Promise.all([
    getLiveQueue({ queue: "1v1", region }),
    getLiveQueue({ queue: "2v2", region }),
    // Drops are no longer rendered, so the query for them is skipped rather
    // than fetched and thrown away.
    getDailyMovers({ queue: "1v1", region, limit: 12, gainersOnly: true }),
    getDailyMovers({ queue: "2v2", region, limit: 12, gainersOnly: true }),
  ])

  // One ticker over both ladders: the day's best runs, wherever they happened.
  const gainers = [...movers1v1.gainers, ...movers2v2.gainers]
    .sort((a, b) => b.eloDiff - a.eloDiff)
    .slice(0, 12)

  // Two tiers of activity, and the card design carries the difference:
  //
  //   < 5 min   in queue — shine border + the "IN QUEUE" badge
  //   < 20 min  recently active — a plain card
  //
  // A literal age test works here because the cron polls every 5 minutes and
  // stamps every entry it sees play with that tick's timestamp: activity
  // arrives in 5-minute clusters, so "younger than 5 minutes" selects exactly
  // the newest cluster rather than blinking on and off between polls. It also
  // needs no per-ladder anchoring — each row is judged against the clock, not
  // against the freshest row in its own set — and if the cron is late nothing
  // is marked, which is the honest answer rather than a stale highlight.
  const inQueue = (r: LiveRow) =>
    requestNow() - r.lastActiveAt.getTime() < IN_QUEUE_MS

  const sections = [
    { queue: "1v1" as LiveQueue, rows: rows1v1 },
    { queue: "2v2" as LiveQueue, rows: rows2v2 },
  ]
  const inQueueCount = [...rows1v1, ...rows2v2].filter(inQueue).length

  // Enrichment from our own cache — main-legend chips (scalar columns only,
  // no ranked_json) and verified-pro handles. Zero Brawlhalla API cost; both
  // fail open to plain names.
  let playersMap = new Map<number, PlayerRow>()
  let previews = new Map<number, PlayerPreview>()
  const allRows = [...rows1v1, ...rows2v2, ...gainers]
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
      <RememberLiveView region={region} />

      <div className="px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="mx-auto mb-4 flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-3">
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
                  href={`/live?region=${r}`}
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
            {/* Counts the in-queue tier, not the whole 20-minute tail — "live
                now" has to mean now, or the pill is just a row count. */}
            <LivePill count={inQueueCount} />
          </div>
        </div>

        <LiveClimbers
          rows={gainers}
          playersMap={playersMap}
          previews={previews}
        />

        {/* One section per ladder. The heading carries its own count so a quiet
            queue reads as "2 playing" rather than as a grid that failed to
            load, and each section stands alone — cards, then the hours that
            ladder is actually busy. */}
        {sections.map(({ queue, rows }) => (
          <section key={queue} className="mx-auto mt-8 max-w-[1280px] first:mt-0">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
                {QUEUE_LABEL[queue]}
              </h2>
              {/* "Active", not "in queue" — most of these finished a match in
                  the last 20 minutes rather than being in one right now. The
                  pill above counts the ones that are. */}
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {rows.length} active
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            {rows.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                No {QUEUE_LABEL[queue]} players active in the last 20 minutes
                {region !== "ALL" ? ` in ${region}` : ""}. The live poll runs
                every 5 minutes — give it a tick, or widen the region filter to
                ALL.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {rows.map((row) => (
                  <LiveCard
                    key={row.id}
                    row={row}
                    playersMap={playersMap}
                    previews={previews}
                    fresh={inQueue(row)}
                  />
                ))}
              </div>
            )}

          </section>
        ))}

        {/* One activity curve for the page rather than one per section: "when
            is the queue busiest" is a question about the evening, not about a
            ladder, and two charts drawn from the same poll cycle sat under each
            other looking like the same chart twice. Its own Suspense boundary
            so a cold hourly cache can't hold up the live feed. */}
        <Suspense
          fallback={
            <div className="animate-skeleton relative mx-auto mt-8 h-[248px] max-w-[1280px] overflow-hidden rounded-2xl border border-border/60 bg-card/40" />
          }
        >
          <div className="mx-auto max-w-[1280px]">
            <QueueActivityCard queues={LIVE_QUEUES} region={region} />
          </div>
        </Suspense>
      </div>
    </main>
  )
}
