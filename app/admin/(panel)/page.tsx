import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  getProfileRecord,
  listProfiles,
} from "@/lib/sync/profiles"
import { getPlayersByIds } from "@/lib/sync/players"
import { listCronControls } from "@/lib/sync/cron-controls"
import { getPlayerPoolStats } from "@/lib/sync/admin-stats"
import { getRecentFetches } from "@/lib/sync/fetch-log"
import {
  backfillValhallansAction,
  clearFetchLogAction,
  deleteProfileAction,
  saveProfileAction,
  toggleCronAction,
} from "../actions"

const labelCls =
  "font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
const inputCls =
  "mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-copper"

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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string
    saved?: string
    deleted?: string
    error?: string
    backfill?: string
    remaining?: string
    failed?: string
    cleared?: string
  }>
}) {
  const sp = await searchParams
  const editId = sp.edit ? Number(sp.edit) : null
  const editing =
    editId && Number.isInteger(editId)
      ? await getProfileRecord(editId)
      : null

  const overrides = await listProfiles()
  const players = overrides.length
    ? await getPlayersByIds(overrides.map((o) => o.brawlhallaId))
    : new Map()

  const [poolStats, crons, fetches] = await Promise.all([
    getPlayerPoolStats(),
    listCronControls(),
    getRecentFetches(50),
  ])

  return (
    <div className="flex flex-col gap-10">
      {(sp.saved || sp.deleted || sp.error || sp.backfill || sp.cleared) && (
        <div
          className={
            sp.error
              ? "rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
              : "rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive"
          }
        >
          {sp.error === "upload"
            ? "Skin upload failed — is Vercel Blob set up (BLOB_READ_WRITE_TOKEN)?"
            : sp.error
              ? "Couldn’t save — check the Brawlhalla ID."
              : sp.deleted
                ? "Pro removed."
                : sp.cleared === "log"
                  ? "Fetch log cleared."
                  : sp.backfill === "none"
                    ? "No Valhallans discovered — leaderboard returned empty."
                    : sp.backfill === "caughtup"
                      ? "All Valhallans already cached — nothing to backfill."
                      : sp.backfill
                        ? `Backfilled ${sp.backfill} Valhallan${sp.backfill === "1" ? "" : "s"}.${sp.remaining && Number(sp.remaining) > 0 ? ` ${sp.remaining} stale remaining — click again to continue.` : ""}${sp.failed ? ` (${sp.failed} failed — likely rate-limited.)` : ""}`
                        : `Saved pro ${sp.saved} (syncing their standing…).`}
        </div>
      )}

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
          Walks the{" "}
          <span className="font-mono text-foreground">1v1 region=ALL</span>{" "}
          leaderboard, fetches each Valhallan&apos;s full ranked payload, and
          upserts. Throttled (~5s/sync, ~40 players per click); re-click to
          drain the rest. Idempotent — already-fresh rows are skipped.
        </p>
        <form action={backfillValhallansAction} className="mt-3">
          <button
            type="submit"
            className="rounded-md border border-positive/40 bg-positive/15 px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-positive transition-colors hover:bg-positive/25"
          >
            Backfill Valhallans (1v1 ALL)
          </button>
        </form>
      </section>

      {/* Recent fetches log */}
      <section>
        <h2 className="font-display text-lg font-semibold">Recent fetches</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every <span className="font-mono text-foreground">/ranked</span> call
          the profile page or OG-image route considered, plus admin saves. The
          request&apos;s user-agent and referer are captured so you can spot
          crawlers vs. organic traffic. Showing the latest {fetches.length}{" "}
          entries.
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
                    User-Agent
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
                      title={f.userAgent ?? ""}
                    >
                      {f.userAgent ?? "—"}
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

      {/* Create / edit form */}
      <section>
        <h2 className="font-display text-lg font-semibold">
          {editing ? `Edit pro · ${editing.brawlhallaId}` : "Add a pro player"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Register a verified pro by Brawlhalla ID — saving pulls their ranked
          standing onto the pro leaderboard. Find an ID via{" "}
          <Link href="/search" className="text-copper hover:underline">
            search
          </Link>
          .
        </p>

        <form
          action={saveProfileAction}
          className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-card/40 p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-1">
            <label className={labelCls} htmlFor="brawlhallaId">
              Brawlhalla ID
            </label>
            <input
              id="brawlhallaId"
              name="brawlhallaId"
              type="number"
              required
              readOnly={!!editing}
              defaultValue={editing?.brawlhallaId ?? editId ?? ""}
              className={inputCls}
            />
          </div>

          <div className="flex items-end sm:col-span-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                name="isPro"
                type="checkbox"
                defaultChecked={editing ? editing.isPro : true}
                className="size-4 accent-mystic"
              />
              Verified pro (PRO badge)
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="handle">
              Handle (shown next to PRO)
            </label>
            <input
              id="handle"
              name="handle"
              type="text"
              defaultValue={editing?.handle ?? ""}
              placeholder="e.g. Kyna"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-1">
            <label className={labelCls} htmlFor="skinSrc">
              Favorite skin — image path
            </label>
            <input
              id="skinSrc"
              name="skinSrc"
              type="text"
              defaultValue={editing?.favoriteSkin?.src ?? ""}
              placeholder="/assets/SKIN_File.png"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-1">
            <label className={labelCls} htmlFor="skinName">
              Favorite skin — display name
            </label>
            <input
              id="skinName"
              name="skinName"
              type="text"
              defaultValue={editing?.favoriteSkin?.name ?? ""}
              placeholder="e.g. Fallen Prince Teros"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="skinFile">
              …or upload a skin image (stored in Vercel Blob)
            </label>
            <input
              id="skinFile"
              name="skinFile"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-copper file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-background hover:file:bg-copper/90"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              On save, an uploaded image replaces the path above. Keep it under
              ~1&nbsp;MB.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="achievements">
              Championship titles (one per line)
            </label>
            <textarea
              id="achievements"
              name="achievements"
              rows={3}
              defaultValue={editing?.achievements.join("\n") ?? ""}
              placeholder={"2v2 World Champion '24\n1v1 Midseason Champion '24"}
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90"
            >
              {editing ? "Save changes" : "Add pro"}
            </button>
            {editing && (
              <Link
                href="/admin"
                className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* Existing overrides */}
      <section>
        <h2 className="font-display text-lg font-semibold">
          Pro players{" "}
          <span className="font-mono text-sm font-normal text-muted-foreground">
            ({overrides.length})
          </span>
        </h2>

        {overrides.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No pros yet. Add one above.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {overrides.map((o) => {
              const row = players.get(o.brawlhallaId)
              const username = row?.username
              const ranked = row?.rankedJson as
                | { rating?: number; region?: string }
                | null
                | undefined
              return (
                <li
                  key={o.brawlhallaId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
                >
                  <span className="font-medium">
                    {username ?? `#${o.brawlhallaId}`}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    ID {o.brawlhallaId}
                  </span>
                  {ranked?.rating != null ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {ranked.region ? `${ranked.region} · ` : ""}
                      {ranked.rating.toLocaleString()} ELO
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      not synced yet
                    </span>
                  )}
                  {o.isPro && (
                    <span className="rounded border border-mystic/50 bg-mystic/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mystic">
                      Pro{o.handle ? ` · ${o.handle}` : ""}
                    </span>
                  )}
                  {o.favoriteSkin && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      skin: {o.favoriteSkin.name || o.favoriteSkin.src}
                    </span>
                  )}
                  {o.achievements.length > 0 && (
                    <span className="font-mono text-[10px] text-tier-gold">
                      {o.achievements.length} title
                      {o.achievements.length === 1 ? "" : "s"}
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-3">
                    <Link
                      href={`/admin?edit=${o.brawlhallaId}`}
                      className="font-mono text-[11px] uppercase tracking-wider text-copper transition-colors hover:text-foreground"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/player/${o.brawlhallaId}`}
                      className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View
                    </Link>
                    <form action={deleteProfileAction}>
                      <input
                        type="hidden"
                        name="brawlhallaId"
                        value={o.brawlhallaId}
                      />
                      <button
                        type="submit"
                        className="font-mono text-[11px] uppercase tracking-wider text-negative transition-colors hover:opacity-80"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
