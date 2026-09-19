import { Trophy } from "lucide-react"
import { PlayerLink } from "@/components/site/primitives"
import { InfoTip } from "@/components/site/info-tip"
import type { EsportsMatch } from "@/lib/sync/esports-matches"
import { cn } from "@/lib/utils"

/**
 * A pro's tournament results, grouped by the event that produced them.
 *
 * Grouped, not a flat list by date, because a career is read as *runs*: "how
 * far did they get at Summer Championship" is the question, and a wall of
 * sixty matches in date order answers it only if you count. A run also has a
 * shape — five wins and a loss in the upper bracket, then two more below it —
 * that only survives if the matches stay together.
 *
 * Tournaments run newest first, and matches inside a tournament run *oldest*
 * first. That is not an inconsistency: the list is a history, so the latest
 * event leads; a bracket is a story, so it reads from round one to the final.
 *
 * Every number here is stored, not derived at render — see lib/sync/esports-
 * matches.ts. This component does one pass over an already-sorted array.
 */
interface Run {
  tournamentId: string
  name: string
  year: number | null
  mode: string | null
  matches: EsportsMatch[]
  wins: number
  losses: number
  latest: number
}

function toRuns(matches: EsportsMatch[]): Run[] {
  const byTournament = new Map<string, Run>()
  for (const m of matches) {
    const key = m.tournamentId
    let run = byTournament.get(key)
    if (!run) {
      run = {
        tournamentId: key,
        name: m.tournamentName ?? "Unknown event",
        year: m.year,
        mode: m.mode,
        matches: [],
        wins: 0,
        losses: 0,
        latest: 0,
      }
      byTournament.set(key, run)
    }
    run.matches.push(m)
    if (m.won === true) run.wins++
    else if (m.won === false) run.losses++
    const t = m.startedAt ? new Date(m.startedAt).getTime() : 0
    if (t > run.latest) run.latest = t
  }
  const runs = [...byTournament.values()]
  for (const r of runs) {
    r.matches.sort((a, b) => {
      const at = a.startedAt ? new Date(a.startedAt).getTime() : 0
      const bt = b.startedAt ? new Date(b.startedAt).getTime() : 0
      return at - bt
    })
  }
  return runs.sort((a, b) => b.latest - a.latest)
}

function fmtDate(d: Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function EsportsSection({
  matches,
  displayName,
}: {
  matches: EsportsMatch[]
  displayName: string
}) {
  const runs = toRuns(matches)
  const wins = runs.reduce((n, r) => n + r.wins, 0)
  const losses = runs.reduce((n, r) => n + r.losses, 0)

  if (runs.length === 0) {
    // Reachable only by typing the tab, since the nav hides it — but a hole is
    // worse than a sentence either way.
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-10 text-center sm:px-6">
        <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          No tournament matches on record
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 px-4 sm:px-6">
      {/* The headline is the career record, because that is the one number a
          match list is otherwise making you count. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border/60 bg-card/50 px-5 py-4 backdrop-blur-sm">
        <Trophy className="size-4 shrink-0 text-tier-gold" />
        <span className="font-display text-lg font-semibold">
          {wins}
          <span className="px-1 text-muted-foreground/60">–</span>
          {losses}
        </span>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Tournament record
        </span>
        <span className="ml-auto font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {runs.length} {runs.length === 1 ? "event" : "events"}
        </span>
      </div>

      {runs.map((run) => (
        <section
          key={run.tournamentId}
          className="overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm"
        >
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 px-5 py-3">
            <h3 className="min-w-0 font-display text-base font-semibold">
              {run.name}
            </h3>
            {run.mode && (
              <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {run.mode}
              </span>
            )}
            <span className="ml-auto font-mono text-xs tabular-nums">
              <span className="text-positive">{run.wins}</span>
              <span className="px-1 text-muted-foreground/60">–</span>
              <span className="text-negative">{run.losses}</span>
            </span>
          </header>

          <ul className="divide-y divide-border/40">
            {run.matches.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5"
              >
                {/* W / L / — as one fixed-width glyph, so the column reads as a
                    result strip down the left rather than as prose. */}
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold",
                    m.won === true
                      ? "bg-positive/15 text-positive"
                      : m.won === false
                        ? "bg-negative/15 text-negative"
                        : "bg-muted/40 text-muted-foreground"
                  )}
                >
                  {m.won === true ? "W" : m.won === false ? "L" : "–"}
                </span>

                <span className="min-w-0 shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {m.roundTitle ?? m.bracket ?? "—"}
                </span>

                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase">
                    vs
                  </span>
                  {/* Linked only when we confirmed who that was. Most bracket
                      entrants are not tracked competitors, so an unlinked name
                      is the normal case, not a degraded one. */}
                  {m.opponentIds.length === 1 ? (
                    <PlayerLink
                      id={m.opponentIds[0]}
                      className="min-w-0 truncate text-sm font-medium"
                    >
                      {m.opponentName ?? "—"}
                    </PlayerLink>
                  ) : (
                    <span className="min-w-0 truncate text-sm font-medium">
                      {m.opponentName ?? "—"}
                    </span>
                  )}
                </span>

                {m.teammateName && (
                  <InfoTip
                    label={`${displayName} played with ${m.teammateName}`}
                  >
                    <span className="shrink-0 truncate font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      + {m.teammateName}
                    </span>
                  </InfoTip>
                )}

                {/* A bo1 scoreline is always 1–0, which is the result already
                    shown on the left. Only a series has a score worth printing. */}
                {(m.bestOf ?? 1) > 1 && m.scoreFor != null && (
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    {m.scoreFor}
                    <span className="px-0.5 text-muted-foreground/60">–</span>
                    {m.scoreAgainst ?? 0}
                  </span>
                )}

                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                  {fmtDate(m.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
