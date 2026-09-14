import Link from "next/link"
import { cn } from "@/lib/utils"
import { listCronControls } from "@/lib/sync/cron-controls"
import { getPlayerPoolStats } from "@/lib/sync/admin-stats"
import { getRecentFetches } from "@/lib/sync/fetch-log"
import {
  backfillValhallansAction,
  clearFetchLogAction,
  toggleCronAction,
} from "../actions"

// Tier accent colors for the player-pool breakdown (Tin/Unranked have no token).
const TIER_COLOR: Record<string, string> = {
  Valhallan: "text-tier-valhallan",
  Diamond: "text-tier-diamond",
  Platinum: "text-tier-platinum",
  Gold: "text-tier-gold",
  Silver: "text-tier-silver",
  Bronze: "text-tier-bronze",
  Tin: "text-muted-foreground",
  Unranked: "text-muted-foreground/60",
}

function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  )
}

/**
 * The System tab: the pool we have cached, the crons that fill it, what they
 * have been fetching, and the manual backfill. Everything here is about the
 * machine rather than about a person, which is the split the two tabs draw.
 */
export async function SystemTab() {
  const [poolStats, crons, fetches] = await Promise.all([
    getPlayerPoolStats(),
    listCronControls(),
    getRecentFetches(50),
  ])

  return (
    <div className="flex flex-col gap-10">
      {/* Player pool stats */}
      <section>
        <h2 className="font-display text-lg font-semibold">Player pool</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How much of each tier we&apos;ve fetched into the players table.
          Valhallan is the Diamond-tier population rated 2,300+ (the ranked API
          never labels Valhallan). Name-only rows are ladder-harvested and not
          yet fully fetched.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total players" value={poolStats.total} />
          <StatCard label="Fully fetched" value={poolStats.fetched} />
          <StatCard label="Name-only (ladder)" value={poolStats.nameOnly} />
          <StatCard label="Guilds" value={poolStats.guilds} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {poolStats.tiers.map((t) => (
            <div
              key={t.tier}
              className="rounded-xl border border-border/60 bg-card/40 px-3 py-2.5"
            >
              <div
                className={cn(
                  "font-mono text-[10px] uppercase tracking-wider",
                  TIER_COLOR[t.tier] ?? "text-muted-foreground",
                )}
              >
                {t.tier}
              </div>
              <div className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                {t.count.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Manual Valhallan backfill */}
      <section>
        <h2 className="font-display text-lg font-semibold">
          Backfill Valhallans
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Walks both the{" "}
          <span className="font-mono text-foreground">1v1</span> and{" "}
          <span className="font-mono text-foreground">2v2</span> region=ALL
          leaderboards, fetches each Valhallan&apos;s full ranked payload, and
          upserts. Throttled (~5s/sync, ~40 players per click); re-click to
          drain the rest. Idempotent — already-fresh rows are skipped.
        </p>
        <form action={backfillValhallansAction} className="mt-3">
          <button
            type="submit"
            className="rounded-md border border-positive/40 bg-positive/15 px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-positive transition-colors hover:bg-positive/25"
          >
            Backfill Valhallans (1v1 + 2v2 ALL)
          </button>
        </form>
      </section>

      {/* Recent fetches log */}
      <section>
        <h2 className="font-display text-lg font-semibold">Recent fetches</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every <span className="font-mono text-foreground">/ranked</span> call
          the profile page or OG-image route considered, plus admin saves. The
          requesting client is bucketed (bingbot, googlebot, human, …) so
          you can spot crawlers vs. organic traffic without storing a full
          user-agent per row. Showing the latest {fetches.length} entries.
        </p>

        {fetches.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No fetches recorded yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border/60 bg-card/40">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Player</th>
                  <th className="px-3 py-2 text-left font-medium">Result</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Client
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Referer</th>
                </tr>
              </thead>
              <tbody>
                {fetches.map((f) => (
                  <tr key={f.id} className="border-t border-border/40">
                    <td
                      className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-muted-foreground"
                      title={f.createdAt.toISOString()}
                    >
                      {timeAgo(f.createdAt)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                          f.source === "page-view"
                            ? "border-mystic/40 text-mystic"
                            : f.source === "og-image"
                              ? "border-copper/40 text-copper"
                              : "border-positive/40 text-positive",
                        )}
                      >
                        {f.source}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/player/${f.brawlhallaId}`}
                        prefetch={false}
                        className="font-mono text-foreground hover:underline"
                      >
                        #{f.brawlhallaId}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                          f.result === "cached"
                            ? "border-positive/40 text-positive"
                            : f.result === "synced"
                              ? "border-mystic/40 text-mystic"
                              : "border-negative/40 text-negative",
                        )}
                      >
                        {f.result}
                        {f.apiStatus ? ` ${f.apiStatus}` : ""}
                      </span>
                    </td>
                    <td
                      className="max-w-[280px] truncate px-3 py-1.5 text-muted-foreground"
                      title={f.client ?? ""}
                    >
                      {f.client ?? "—"}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-3 py-1.5 text-muted-foreground"
                      title={f.referer ?? ""}
                    >
                      {f.referer ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={clearFetchLogAction} className="mt-3">
          <button
            type="submit"
            className="rounded-md border border-negative/40 bg-negative/15 px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-negative transition-colors hover:bg-negative/25"
          >
            Clear log
          </button>
        </form>
      </section>

      {/* Cron controls */}
      <section id="crons">
        <h2 className="font-display text-lg font-semibold">Cron jobs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pause a sync job if it&apos;s eating the Brawlhalla API rate limit and
          blocking live profile fetches. A paused job still triggers on schedule
          but exits immediately without touching the API. The live leaderboard
          is the heaviest — pause it first.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {crons.map((c) => (
            <li
              key={c.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {c.schedule}
                  </code>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {c.description}
                </p>
              </div>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  c.paused
                    ? "border-copper/50 bg-copper/15 text-copper"
                    : "border-positive/50 bg-positive/15 text-positive",
                )}
              >
                {c.paused ? "Paused" : "Active"}
              </span>
              <form action={toggleCronAction}>
                <input type="hidden" name="key" value={c.key} />
                <input
                  type="hidden"
                  name="paused"
                  value={c.paused ? "false" : "true"}
                />
                <button
                  type="submit"
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-semibold text-background transition-colors",
                    c.paused
                      ? "bg-positive hover:bg-positive/90"
                      : "bg-copper hover:bg-copper/90",
                  )}
                >
                  {c.paused ? "Resume" : "Pause"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

    </div>
  )
}
