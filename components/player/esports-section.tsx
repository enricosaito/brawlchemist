import { Medal, Trophy } from "lucide-react"
import { LegendChip, PlayerLink } from "@/components/site/primitives"
import { VerifiedMark } from "@/components/site/pro-badge"
import { FlairMark } from "@/components/site/flair-mark"
import { flairContextFrom } from "@/lib/profile/flair"
import { rosterEntryBySlug } from "@/lib/legends-roster"
import { InfoTip } from "@/components/site/info-tip"
import type { EsportsMatch } from "@/lib/sync/esports-matches"
import type { EsportsProfile } from "@/lib/brawltools-api"
import type { PlayerPreview } from "@/lib/player-previews"
import { cn } from "@/lib/utils"

/**
 * A pro's tournament results, grouped by the event that produced them.
 *
 * Grouped, not a flat list by date, because a career is read as *runs*: "how
 * far did they get at Summer Championship" is the question, and a wall of sixty
 * matches in date order answers it only if you count. A run also has a shape —
 * five wins and a loss in the upper bracket, then two more below it — that only
 * survives if the matches stay together.
 *
 * Tournaments run newest first, and matches inside a tournament run *oldest*
 * first. That is not an inconsistency: the list is a history, so the latest
 * event leads; a bracket is a story, so it reads from round one to the final.
 *
 * The date lives on the run header and not on every row. A tournament happens
 * on a day — sixty rows repeating "19 Jul 2026" is the same fact printed sixty
 * times, and it was crowding out the things that actually differ per match.
 */
interface Run {
  tournamentId: string
  name: string
  mode: string | null
  matches: EsportsMatch[]
  wins: number
  losses: number
  latest: number
  placementRank: number | null
  placementDisplay: string | null
}

function toRuns(matches: EsportsMatch[]): Run[] {
  const byTournament = new Map<string, Run>()
  for (const m of matches) {
    let run = byTournament.get(m.tournamentId)
    if (!run) {
      run = {
        tournamentId: m.tournamentId,
        name: m.tournamentName ?? "Unknown event",
        mode: m.mode,
        matches: [],
        wins: 0,
        losses: 0,
        latest: 0,
        placementRank: null,
        placementDisplay: null,
      }
      byTournament.set(m.tournamentId, run)
    }
    run.matches.push(m)
    if (m.won === true) run.wins++
    else if (m.won === false) run.losses++
    const t = m.startedAt ? new Date(m.startedAt).getTime() : 0
    if (t > run.latest) run.latest = t
    // Every row of a run carries the same finish; the first non-null wins.
    if (run.placementRank === null && m.placementRank !== null) {
      run.placementRank = m.placementRank
      run.placementDisplay = m.placementDisplay
    }
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

/** 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 13 -> 13th. */
function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}

/**
 * Gold for a win, silver for a runner-up, bronze for a podium, and nothing
 * louder than muted for the rest.
 *
 * A finish is the headline of a run, so it gets colour — but only the three
 * that are actually an accolade. Painting 9th place gold-adjacent would make
 * every row shout, and the tier tokens already mean something on this site.
 */
function placementTone(rank: number): string {
  if (rank === 1) return "border-tier-gold/50 bg-tier-gold/10 text-tier-gold"
  if (rank === 2)
    return "border-tier-silver/50 bg-tier-silver/10 text-tier-silver"
  if (rank === 3)
    return "border-tier-bronze/50 bg-tier-bronze/10 text-tier-bronze"
  return "border-border/60 bg-muted/40 text-muted-foreground"
}

/**
 * The picks, with repeats collapsed.
 *
 * Playing Lin Fei four times is one decision, not four, so four identical chips
 * would be noise — but "Lucien, Lucien, Lucien, Diana, Diana" is a counterpick
 * that won a set, and flattening it to a set would throw the story away. So
 * consecutive repeats collapse and order survives.
 */
function collapse(slugs: string[]): string[] {
  const out: string[] = []
  for (const slug of slugs)
    if (slug && slug !== out[out.length - 1]) out.push(slug)
  return out
}

function LegendRun({ slugs }: { slugs: string[] }) {
  const run = collapse(slugs)
  if (run.length === 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {run.map((slug, i) => (
        // The roster name on a wrapper rather than a new LegendChip prop: the
        // chip already owns one title, for the unknown fallback, and two would
        // fight over the same attribute.
        <span
          key={`${slug}-${i}`}
          title={rosterEntryBySlug(slug)?.name ?? slug}
        >
          <LegendChip legendId={slug} size="sm" showName={false} />
        </span>
      ))}
    </span>
  )
}

/**
 * Somebody who was in the match, rendered the way this site renders a player
 * everywhere else.
 *
 * A Challengermode username is not an identity — "lopesbrawlhalla" is the same
 * person as the Lopes on our leaderboard, and printing the raw one made a
 * bracket read like a list of strangers. So a participant we resolved to a
 * Brawlhalla account gets their curated handle, their verified mark and their
 * flair, and links to the profile; one we did not resolve keeps the
 * Challengermode name as plain text, because a name we cannot vouch for should
 * not look like a link to a player we can.
 */
function Participant({
  ids,
  fallbackName,
  previews,
  flairs,
  className,
}: {
  ids: number[]
  fallbackName: string | null
  previews: Map<number, PlayerPreview>
  flairs: Map<number, string>
  className?: string
}) {
  const known = ids.filter((id) => previews.get(id)?.verified?.handle)
  if (known.length === 0) {
    // Resolved but not curated: still a real profile, so still a link.
    if (ids.length > 0) {
      return (
        <PlayerLink id={ids[0]} className={cn("truncate", className)}>
          {fallbackName ?? "—"}
        </PlayerLink>
      )
    }
    return (
      <span className={cn("truncate", className)}>{fallbackName ?? "—"}</span>
    )
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {known.map((id, i) => {
        const preview = previews.get(id)
        return (
          <span key={id} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-muted-foreground/60">
                +
              </span>
            )}
            <PlayerLink id={id} className={cn("truncate", className)}>
              {preview?.verified?.handle}
            </PlayerLink>
            <VerifiedMark />
            <FlairMark
              selectedId={flairs.get(id)}
              context={flairContextFrom(preview)}
            />
          </span>
        )
      })}
    </span>
  )
}

function fmtDate(d: Date | null): string {
  if (!d) return ""
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString()}`
}

export function EsportsSection({
  matches,
  esports,
  previews,
  flairs,
}: {
  matches: EsportsMatch[]
  /** Power rankings, earnings and medals — already loaded for the header. */
  esports: EsportsProfile | null | undefined
  previews: Map<number, PlayerPreview>
  flairs: Map<number, string>
}) {
  const runs = toRuns(matches)
  const wins = runs.reduce((n, r) => n + r.wins, 0)
  const losses = runs.reduce((n, r) => n + r.losses, 0)

  // Medals are per power ranking, and a player can hold two. Summed, because
  // the question the shelf answers is "what have they won", not "in which mode".
  const gold = (esports?.pr1v1?.gold ?? 0) + (esports?.pr2v2?.gold ?? 0)
  const silver = (esports?.pr1v1?.silver ?? 0) + (esports?.pr2v2?.silver ?? 0)
  const bronze = (esports?.pr1v1?.bronze ?? 0) + (esports?.pr2v2?.bronze ?? 0)

  if (runs.length === 0) {
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
      {/* The career, in one card: what they have won, where they are ranked,
          what it paid, and the record underneath all of it. The record alone
          was the number a match list makes you count; the rest is the context
          that says whether 95-36 is a good year or a great one. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-border/60 bg-card/50 px-5 py-4 backdrop-blur-sm">
        <span className="inline-flex items-baseline gap-2">
          <Trophy className="size-4 shrink-0 translate-y-0.5 text-tier-gold" />
          <span className="font-display text-lg font-semibold tabular-nums">
            {wins}
            <span className="px-1 text-muted-foreground/60">–</span>
            {losses}
          </span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            Record
          </span>
        </span>

        {(gold > 0 || silver > 0 || bronze > 0) && (
          <InfoTip
            label={`${gold} gold, ${silver} silver, ${bronze} bronze across tracked events`}
          >
            <span className="inline-flex items-center gap-2 font-mono text-xs tabular-nums">
              <span className="inline-flex items-center gap-1 text-tier-gold">
                <Medal className="size-3.5" />
                {gold}
              </span>
              <span className="inline-flex items-center gap-1 text-tier-silver">
                <Medal className="size-3.5" />
                {silver}
              </span>
              <span className="inline-flex items-center gap-1 text-tier-bronze">
                <Medal className="size-3.5" />
                {bronze}
              </span>
            </span>
          </InfoTip>
        )}

        {/* PR is a standing, not a total, so it keeps its region: "#3 in US-E"
            is the claim, and a bare #3 would read as global. */}
        {esports?.pr1v1 && (
          <span className="inline-flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              1v1 PR
            </span>
            <span className="font-semibold tabular-nums">
              #{esports.pr1v1.powerRanking}
            </span>
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              {esports.pr1v1.region}
            </span>
          </span>
        )}
        {esports?.pr2v2 && (
          <span className="inline-flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              2v2 PR
            </span>
            <span className="font-semibold tabular-nums">
              #{esports.pr2v2.powerRanking}
            </span>
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              {esports.pr2v2.region}
            </span>
          </span>
        )}

        {(esports?.earnings ?? 0) > 0 && (
          <span className="inline-flex items-baseline gap-1.5 font-mono text-xs">
            <span className="font-semibold text-positive tabular-nums">
              {fmtMoney(esports!.earnings)}
            </span>
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              Earned
            </span>
          </span>
        )}

        <span className="ml-auto font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {runs.length} {runs.length === 1 ? "event" : "events"}
        </span>
      </div>

      {runs.map((run) => (
        <section
          key={run.tournamentId}
          className="overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm"
        >
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-5 py-3">
            {/* The finish leads, because it is what the run was for. */}
            {run.placementRank !== null && (
              <InfoTip
                label={
                  run.placementDisplay && run.placementDisplay.includes("-")
                    ? `Finished ${run.placementDisplay} — the bracket does not separate them`
                    : `Finished ${ordinal(run.placementRank)}`
                }
              >
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider uppercase tabular-nums",
                    placementTone(run.placementRank)
                  )}
                >
                  {ordinal(run.placementRank)}
                </span>
              </InfoTip>
            )}
            <h3 className="min-w-0 font-display text-base font-semibold">
              {run.name}
            </h3>
            {run.mode && (
              <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {run.mode}
              </span>
            )}
            {/* Once per run, not once per row — a tournament happens on a day. */}
            <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
              {fmtDate(run.matches[run.matches.length - 1]?.startedAt ?? null)}
            </span>
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

                <span className="w-[132px] shrink-0 truncate font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {m.roundTitle ?? m.bracket ?? "—"}
                </span>

                {/* The partner, ahead of the "vs", because in a 2v2 the row is
                    about a pair before it is about an opponent. */}
                {(m.teammateIds.length > 0 || m.teammateName) && (
                  <span className="inline-flex min-w-0 shrink-0 items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    <span aria-hidden>+</span>
                    <Participant
                      ids={m.teammateIds}
                      fallbackName={m.teammateName}
                      previews={previews}
                      flairs={flairs}
                      className="text-xs normal-case"
                    />
                  </span>
                )}

                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  {/* The matchup reads left to right: what they played, against
                      what. Both sides are absent together on the rounds nobody
                      reported, and the row then looks exactly as it did before
                      this existed — no gap, no placeholder. */}
                  <LegendRun slugs={m.legends} />
                  <span className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase">
                    vs
                  </span>
                  <LegendRun slugs={m.opponentLegends} />
                  <Participant
                    ids={m.opponentIds}
                    fallbackName={m.opponentName}
                    previews={previews}
                    flairs={flairs}
                    className="text-sm font-medium"
                  />
                </span>

                {/* How long the set actually ran, which is the number bestOf was
                    lying about — Challengermode reports every one of these as
                    bo1, including a final that went four games. Not turned into
                    a score: see the games_played note on the column. */}
                {(m.gamesPlayed ?? 0) > 1 && (
                  <InfoTip
                    label={
                      m.durationSeconds
                        ? `${m.gamesPlayed} games, ${Math.round(m.durationSeconds / 60)} minutes`
                        : `${m.gamesPlayed} games`
                    }
                  >
                    <span className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase tabular-nums">
                      {m.gamesPlayed}g
                    </span>
                  </InfoTip>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
