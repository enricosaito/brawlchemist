import Link from "next/link"
import { cn } from "@/lib/utils"
import { listCronControls } from "@/lib/sync/cron-controls"
import { getAdminOverview, getPlayerPoolStats } from "@/lib/sync/admin-stats"
import { getRecentFetches } from "@/lib/sync/fetch-log"
import {
  backfillValhallansFormAction,
  clearFetchLogFormAction,
  refreshCachesFormAction,
  toggleCronFormAction,
} from "../actions"
import { ActionForm } from "./action-form"
import { TAG, TD, TH } from "./list-chrome"

// Tier accents for the pool breakdown. Tin has no token of its own.
const TIER_BAR: Record<string, string> = {
  Valhallan: "bg-tier-valhallan",
  Diamond: "bg-tier-diamond",
  Platinum: "bg-tier-platinum",
  Gold: "bg-tier-gold",
  Silver: "bg-tier-silver",
  Bronze: "bg-tier-bronze",
  Tin: "bg-muted-foreground/50",
}
const TIER_TEXT: Record<string, string> = {
  Valhallan: "text-tier-valhallan",
  Diamond: "text-tier-diamond",
  Platinum: "text-tier-platinum",
  Gold: "text-tier-gold",
  Silver: "text-tier-silver",
  Bronze: "text-tier-bronze",
  Tin: "text-muted-foreground",
}

function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-display text-2xl font-semibold tabular-nums",
          className
        )}
      >
        {value.toLocaleString()}
      </div>
    </div>
  )
}

function Card({
  title,
  children,
  className,
}: {
  title: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm",
        className
      )}
    >
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/**
 * The System tab: the pool we have cached, the crons that fill it, what they
 * have been fetching, and the manual levers. Everything here is about the
 * machine rather than about a person, which is the split the tabs draw.
 *
 * It was unreachable for a while: the pool breakdown was a 29s sequential scan
 * of `ranked_json` against a 30s statement timeout, so the tab either crawled
 * or failed open after half a minute. The reader now buckets the indexed
 * `rating` column and is cached (see admin-stats.ts).
 */
export async function SystemTab() {
  const [pool, overview, crons, fetches] = await Promise.all([
    getPlayerPoolStats(),
    getAdminOverview(),
    listCronControls(),
    getRecentFetches(30),
  ])
  const f = overview.fetches24h
  const fetchTotal = f.cached + f.synced + f.failed

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Player pool */}
      <Card title="Player pool">
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Players" value={pool.total} />
          <Stat label="Rated" value={pool.rated} />
          <Stat
            label="No rating yet"
            value={pool.unrated}
            className="text-muted-foreground"
          />
          <Stat label="Guilds" value={pool.guilds} />
        </div>

        {pool.rated > 0 && (
          <>
            {/* One bar, not seven cards: the question is "what shape is the
                pool", and a share is read off a bar in one glance. */}
            <div
              className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted/40"
              role="img"
              aria-label={pool.tiers
                .map((t) => `${t.tier} ${t.count.toLocaleString()}`)
                .join(", ")}
            >
              {pool.tiers.map((t) =>
                t.count > 0 ? (
                  <div
                    key={t.tier}
                    className={cn("h-full", TIER_BAR[t.tier])}
                    style={{ width: `${(t.count / pool.rated) * 100}%` }}
                    title={`${t.tier} · ${t.count.toLocaleString()} · ${((t.count / pool.rated) * 100).toFixed(1)}%`}
                  />
                ) : null
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {pool.tiers.map((t) => (
                <li
                  key={t.tier}
                  className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block size-2 rounded-full",
                        TIER_BAR[t.tier]
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "text-[10px] tracking-wider uppercase",
                        TIER_TEXT[t.tier]
                      )}
                    >
                      {t.tier}
                    </span>
                  </span>
                  <span>
                    {t.count.toLocaleString()}
                    <span className="ml-1 text-muted-foreground">
                      {((t.count / pool.rated) * 100).toFixed(1)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Levers */}
      <Card title="Actions">
        <ul className="mt-3 flex flex-col divide-y divide-border/40">
          <li className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Refresh caches</div>
              <p className="text-[11px] text-muted-foreground">
                Drops the shared read caches so the next render reads Postgres.
                For rows changed outside the app. Deletes nothing.
              </p>
            </div>
            <ActionForm
              action={refreshCachesFormAction}
              submitLabel="Refresh"
              submitClassName="border-mystic/40 bg-mystic/15 text-mystic hover:bg-mystic/25"
            />
          </li>
          <li className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Backfill Valhallans</div>
              <p className="text-[11px] text-muted-foreground">
                Walks the 1v1 + 2v2 ALL ladders and fetches up to 40 stale
                Valhallans per click. Spends API budget; re-click to drain.
              </p>
            </div>
            <ActionForm
              action={backfillValhallansFormAction}
              submitLabel="Backfill"
              submitClassName="border-positive/40 bg-positive/15 text-positive hover:bg-positive/25"
            />
          </li>
          <li className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Clear fetch log</div>
              <p className="text-[11px] text-muted-foreground">
                Empties the diagnostic log below. It prunes itself at 14 days.
              </p>
            </div>
            <ActionForm
              action={clearFetchLogFormAction}
              submitLabel="Clear"
              confirm="Confirm clear"
              submitClassName="text-negative"
            />
          </li>
        </ul>
      </Card>

      {/* Crons */}
      <Card title="Cron jobs">
        <p className="mt-1 text-[11px] text-muted-foreground">
          A paused job still fires on schedule and exits without touching the
          API.
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-border/40">
          {crons.map((c) => (
            <li
              key={c.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" title={c.description}>
                    {c.label}
                  </span>
                  <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {c.schedule}
                  </code>
                </div>
              </div>
              <span
                className={cn(
                  TAG,
                  c.paused
                    ? "border-pink/50 bg-pink/15 text-pink"
                    : "border-positive/50 bg-positive/15 text-positive"
                )}
              >
                {c.paused ? "Paused" : "Active"}
              </span>
              <ActionForm
                action={toggleCronFormAction}
                submitLabel={c.paused ? "Resume" : "Pause"}
                submitClassName={
                  c.paused ? "text-positive" : "text-muted-foreground"
                }
              >
                <input type="hidden" name="key" value={c.key} />
                <input
                  type="hidden"
                  name="paused"
                  value={c.paused ? "false" : "true"}
                />
              </ActionForm>
            </li>
          ))}
        </ul>
      </Card>

      {/* Fetch log */}
      <Card
        title={
          <span className="flex items-baseline gap-2">
            Fetch log
            <span className="font-mono text-xs font-normal text-muted-foreground">
              last 24h
            </span>
          </span>
        }
      >
        {fetchTotal > 0 ? (
          <>
            <div
              className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted/40"
              role="img"
              aria-label={`${f.cached} cached, ${f.synced} synced, ${f.failed} failed`}
            >
              <div
                className="h-full bg-positive"
                style={{ width: `${(f.cached / fetchTotal) * 100}%` }}
              />
              <div
                className="h-full bg-mystic"
                style={{ width: `${(f.synced / fetchTotal) * 100}%` }}
              />
              <div
                className="h-full bg-negative"
                style={{ width: `${(f.failed / fetchTotal) * 100}%` }}
              />
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
              <li>
                <span className="text-positive">cached</span>{" "}
                {f.cached.toLocaleString()}
              </li>
              <li>
                <span className="text-mystic">synced</span>{" "}
                {f.synced.toLocaleString()}
              </li>
              <li>
                <span className="text-negative">failed</span>{" "}
                {f.failed.toLocaleString()}
              </li>
              <li className="text-muted-foreground">
                {fetchTotal.toLocaleString()} total
              </li>
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing recorded in the last day.
          </p>
        )}

        {fetches.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border/60 bg-card/40">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  <th className={TH}>Age</th>
                  <th className={TH}>Player</th>
                  <th className={TH}>Source</th>
                  <th className={TH}>Result</th>
                  <th className={TH}>Client</th>
                </tr>
              </thead>
              <tbody>
                {fetches.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td
                      className={cn(
                        TD,
                        "py-1.5 font-mono whitespace-nowrap text-muted-foreground tabular-nums"
                      )}
                      title={r.createdAt.toISOString()}
                    >
                      {timeAgo(r.createdAt)}
                    </td>
                    <td className={cn(TD, "py-1.5")}>
                      <Link
                        href={`/player/${r.brawlhallaId}`}
                        prefetch={false}
                        className="font-mono hover:underline"
                      >
                        #{r.brawlhallaId}
                      </Link>
                    </td>
                    <td
                      className={cn(
                        TD,
                        "py-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
                      )}
                    >
                      {r.source}
                    </td>
                    <td className={cn(TD, "py-1.5")}>
                      <span
                        className={cn(
                          "font-mono text-[10px] tracking-wider uppercase",
                          r.result === "cached"
                            ? "text-positive"
                            : r.result === "synced"
                              ? "text-mystic"
                              : "text-negative"
                        )}
                      >
                        {r.result}
                        {r.apiStatus ? ` ${r.apiStatus}` : ""}
                      </span>
                    </td>
                    <td
                      className={cn(
                        TD,
                        "max-w-[160px] truncate py-1.5 text-muted-foreground"
                      )}
                      title={r.referer ?? ""}
                    >
                      {r.client ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
