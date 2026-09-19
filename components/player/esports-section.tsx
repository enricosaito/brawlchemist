import { Check, ChevronDown, Medal, Trophy, UserX, X } from "lucide-react"
import { LegendChip, PlayerLink } from "@/components/site/primitives"
import { BracketLink } from "@/components/player/bracket-link"
import { TeammateChip } from "@/components/player/teammate-chip"
import { VerifiedMark } from "@/components/site/pro-badge"
import { rosterEntryBySlug } from "@/lib/legends-roster"
import { InfoTip } from "@/components/site/info-tip"
import type { EsportsMatch } from "@/lib/sync/esports-matches"
import type { EsportsProfile } from "@/lib/brawltools-api"
import type { PlayerPreview } from "@/lib/player-previews"
import type { CmTournament } from "@/lib/challengermode-api"
import Image from "next/image"
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
  /**
   * Where they finished. The banded form Challengermode also gives — "9 - 12"
   * for a joint finish — is deliberately not carried: the ordinal is the
   * universally read answer, and the band was doubling the width of the chip
   * to qualify something nobody was asking. It stays in the column.
   */
  placementRank: number | null
  /** Most-played legend across the whole run, by games rather than by sets. */
  mainLegend: string | null
  /** Their partner. Constant across a run, so it belongs to the run. */
  teammate: { id: number | null; name: string; verified: boolean } | null
}

function toRuns(
  matches: EsportsMatch[],
  previews: Map<number, PlayerPreview>
): Run[] {
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
        mainLegend: null,
        teammate: null,
      }
      byTournament.set(m.tournamentId, run)
    }
    run.matches.push(m)
    if (m.won === true) run.wins++
    else if (m.won === false) run.losses++
    const t = m.startedAt ? new Date(m.startedAt).getTime() : 0
    if (t > run.latest) run.latest = t
    // Every row of a run carries the same finish; the first non-null wins.
    if (run.placementRank === null && m.placementRank !== null)
      run.placementRank = m.placementRank
  }
  const runs = [...byTournament.values()]
  for (const r of runs) {
    r.matches.sort((a, b) => {
      const at = a.startedAt ? new Date(a.startedAt).getTime() : 0
      const bt = b.startedAt ? new Date(b.startedAt).getTime() : 0
      return at - bt
    })
  }
  for (const r of runs) {
    // Counted over games, not sets: `legends` is the pick sequence for a
    // series, so a legend taken four times in one final weighs four.
    const tally = new Map<string, number>()
    for (const m of r.matches)
      for (const slug of m.legends)
        if (slug) tally.set(slug, (tally.get(slug) ?? 0) + 1)
    let best: string | null = null
    for (const [slug, n] of tally)
      if (best === null || n > (tally.get(best) ?? 0)) best = slug
    r.mainLegend = best

    // A partner is constant across a run in practice, so the first one that
    // resolves stands for it; the curated handle wins over the Challengermode
    // name for the same reason it does everywhere else.
    const withMate = r.matches.find(
      (m) => m.teammateIds.length > 0 || m.teammateName
    )
    if (withMate) {
      const id = withMate.teammateIds[0] ?? null
      const handle = id ? previews.get(id)?.verified?.handle : null
      const name = handle ?? splitSide(withMate.teammateName)[0] ?? null
      if (name) r.teammate = { id, name, verified: !!handle }
    }
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
/** Just the ink, for the rail terminus — placementTone carries a chip. */
function placementText(rank: number | null): string {
  if (rank === 1) return "text-tier-gold"
  if (rank === 2) return "text-tier-silver"
  if (rank === 3) return "text-tier-bronze"
  return "text-muted-foreground"
}

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

/** SEP / 20 / 2025, stacked — the same date block /tournaments uses. */
function dateParts(d: Date | null): {
  month: string
  day: string
  year: string
} {
  if (!d) return { month: "—", day: "", year: "" }
  const dt = new Date(d)
  return {
    month: dt.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: dt.toLocaleDateString("en-US", { day: "numeric" }),
    year: String(dt.getFullYear()),
  }
}

function Chip({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase",
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * How deep each bracket runs, from the size of the field.
 *
 * A double elimination of N lineups has ceil(log2(N)) winners rounds — 512
 * gives 9, which is exactly the "Upper Round 1..6 + QF + SF + Finals" we store
 * — and twice that less two on the losers side. Taken from Challengermode's
 * own confirmed lineup count, which the run header already fetches for its
 * artwork, so this costs nothing and is exact rather than inferred. `ceil`
 * is what makes a field that is not a power of two work: 300 entrants play a
 * 512 bracket with byes, and both give 9.
 *
 * Deriving it from the rounds we hold would have been wrong: we store only the
 * matches of players we track, so a tournament where everyone tracked lost
 * early would look like a shallow bracket and every label would shift.
 */
function bracketDepth(lineups: number | null | undefined): {
  upper: number
  lower: number
} | null {
  if (!lineups || lineups < 2) return null
  const upper = Math.ceil(Math.log2(lineups))
  return { upper, lower: 2 * (upper - 1) }
}

/**
 * "Upper Quarter finals" -> "TOP 8".
 *
 * The rail is a shape, and a shape cannot carry twenty characters per node.
 * The full title stays in the tooltip and in the list below, so nothing is
 * lost — this is the label you read while scanning, not the one you read to
 * know.
 *
 * **Counted back from each bracket's own final, never forward from round
 * one.** "Round 4" is not a position: across our 64 tournaments the deepest
 * winners round is R6 for ten, R5 for eighteen, R4 for seventeen and R3 or
 * less for thirteen. A fixed "R4 = TOP 32" is right for one bracket size and
 * claims a field of thirty-two in an event that had two dozen entrants — half
 * the dataset. Counting back, the same rule gives R4 = TOP 32[W] in a 256
 * bracket and TOP 64[W] in a 512 one, which is what those rounds actually are.
 *
 * **The two sides count different populations, and the suffix says which.** A
 * winners round is labelled by how many remain *in the winners bracket* —
 * exactly 2^(rung+1), since each round halves it — and carries [W], because
 * plenty more are still alive below. A losers round is labelled by how many
 * remain in the tournament outright and carries [L].
 *
 * The losers rungs are **measured, not assumed**: every label below was
 * checked against the recorded finishes of the players eliminated there, over
 * 400+ rows, and holds at every bracket size we have (deepest winners round 6,
 * 5, 4, 3 and 2 all agree).
 *
 *   LF -> 3rd · LSF -> 4th · LQF -> 5-6 · TOP 8[L] -> 7-8 ·
 *   TOP 12[L] -> 9-12 · TOP 16[L] -> 13-16 · TOP 24[L] -> 17-24 ·
 *   TOP 32[L] -> 25-32
 *
 * The three named losers rounds keep their names. Six players are alive at the
 * losers quarter-final, and "TOP 6[L]" is a true number nobody says out loud.
 *
 * Where the field size is unknown the numbered rounds keep their numbers. A
 * round number is not a claim; "TOP 32" is, and we do not make it on a guess.
 * The named rounds are positions by definition, so they are labelled either
 * way.
 */
const LOWER_LADDER = [
  "LF",
  "LSF",
  "LQF",
  "TOP 8 [L]",
  "TOP 12 [L]",
  "TOP 16 [L]",
  "TOP 24 [L]",
  "TOP 32 [L]",
]

/**
 * Winners rungs: the bracket halves every round, so the field alive at rung k
 * is 2^(k+1) and the label is arithmetic rather than a table.
 *
 * Stops at TOP 32 [W]. Past that the numbers stop meaning anything to a reader
 * — "TOP 256 [W]" is the first round of a big bracket, which is just R1 — so a
 * round keeps its own number and the early rounds of a championship read as
 * R1, R2, R3, R4.
 */
function upperRung(fromEnd: number): string | null {
  if (fromEnd === 0) return "WF"
  if (fromEnd === 1) return "SF"
  if (fromEnd <= 4) return `TOP ${2 ** (fromEnd + 1)} [W]`
  return null
}

/**
 * How far a round sits from the end of its own bracket. 0 is that bracket's
 * final, 2 its quarter-final, and -1 the grand final that follows both.
 *
 * One place computes this because two things depend on it — what the round is
 * called, and whether it was a Bo3 or a Bo5 — and they must never disagree.
 * Null for a group stage, which is not on a ladder, and for anything we cannot
 * place.
 */
function roundRung(
  title: string | null,
  bracket: string | null,
  depth: { upper: number; lower: number } | null
): number | null {
  const t = (title ?? "").toLowerCase()
  const lower = bracket === "Lower"
  if (/group/.test(t)) return null
  if (/grand final/.test(t) || /^finals?$/.test(t.trim())) return -1
  if (/quarter/.test(t)) return 2
  if (/semi/.test(t)) return 1
  if (/final/.test(t)) return 0
  const round = /round\s*(\d+)/.exec(t)
  if (!round || !depth) return null
  const fromEnd = (lower ? depth.lower : depth.upper) - Number(round[1])
  return fromEnd < 0 ? null : fromEnd
}

function shortRound(
  title: string | null,
  bracket: string | null,
  depth: { upper: number; lower: number } | null
): string {
  const t = (title ?? "").toLowerCase()
  const lower = bracket === "Lower"

  if (/grand final/.test(t) || /^finals?$/.test(t.trim())) return "GF"
  if (/quarter/.test(t)) return lower ? "LQF" : "TOP 8 [W]"
  if (/semi/.test(t)) return lower ? "LSF" : "SF"
  if (/final/.test(t)) return lower ? "LF" : "WF"
  if (/group/.test(t)) return "GRP"

  const round = /round\s*(\d+)/.exec(t)
  if (round) {
    const n = Number(round[1])
    // Lower-bracket rounds carry their letter when they stay numbered.
    // Chronology puts "Lower Round 10" straight after "Upper Quarter finals",
    // which reads as going backwards unless the label says which bracket it is.
    const bare = `${lower ? "L" : "R"}${n}`
    const fromEnd = roundRung(title, bracket, depth)
    if (fromEnd === null) return bare
    if (lower) return LOWER_LADDER[fromEnd] ?? bare
    return upperRung(fromEnd) ?? bare
  }
  return (title ?? bracket ?? "—").slice(0, 3).toUpperCase()
}
/**
 * One stop on the path: a match that was played, or a round that was walked.
 */
type RailNode =
  | {
      kind: "match"
      key: string
      label: string
      m: EsportsMatch
      dropped: boolean
    }
  | { kind: "bye"; key: string; label: string }
  | {
      kind: "finish"
      key: string
      label: string
      rank: number | null
    }

/**
 * A run as a path rather than a table.
 *
 * A tournament run has a shape — five straight wins then a drop to the lower
 * bracket is a different story from grinding up from round one — and stacked
 * rows hide it behind the need to read every line. Left to right is
 * chronological, so the shape is the first thing you see and the detail is
 * still underneath.
 *
 * Each node reads top to bottom as round, result, opponent: where you were,
 * how it went, who it was against. The round leads because it is the axis the
 * rail is ordered on, and a label under the circle had to be read back upwards
 * to place the match.
 *
 * The circle holds the opponent's legend where the picks were reported, and a
 * W or an L where they were not — two thirds of rounds outside the deep ones.
 * A node with nothing in it still has to answer the first question anyone asks
 * of a bracket; a plain dot made the reader decode the ring colour to learn
 * something the node could simply say.
 *
 * The drop out of the upper bracket rides on the match that CAUSED it, not on
 * the one that follows, and it is red for the same reason: it is a consequence
 * of that loss. Hung on the arrival node it read as a neutral change of venue,
 * a row away from the defeat that produced it.
 *
 * **A round the player never had to play is still part of the run.** Our sync
 * stores no row for a bye — a series with fewer than two lineups is not a
 * match — so a seeded player's path used to begin at round two with no
 * explanation, as though the first round had happened to someone else. It is
 * drawn as its own node, in the same cyan as a win, because a bye advances
 * you exactly as a win does — what it is not is a result. It takes the same
 * mark as a forfeited set: the walkover glyph and "W.O" where a score would
 * go, since a bye and a one-game set are the same event seen from the two
 * sides of it. All that separates them is the caption — "no opponent" against
 * a named one — which is the distinction that actually matters.
 *
 * That the missing round is a bye rather than a gap in our data is load-
 * bearing, and it is measured: across every run we hold, a player's first
 * match is either the bracket's own first round or exactly one round past it,
 * never further. Brackets are numbered from one — the losers ladder above only
 * validates against real placements under that numbering — so a first match in
 * round two means round one was walked.
 */
function buildRail(
  matches: EsportsMatch[],
  depth: { upper: number; lower: number } | null,
  placement: { rank: number | null }
): RailNode[] {
  // A second grand final is a bracket RESET: the losers-bracket side won the
  // first one, which wiped the winners side's one-game advantage and forced
  // the set to be played again. Two nodes both reading "GF" would look like a
  // duplicate row; the [R] is what says the first one counted. Only the run
  // knows this — a single match cannot tell whether another final followed it
  // — so it is resolved here rather than in shortRound. Real: 15 runs in our
  // data, in all four win/loss shapes a reset can take.
  let grandFinals = 0
  const nodes: RailNode[] = []

  const first = matches[0]
  const firstRound = /round\s*(\d+)/i.exec(first?.roundTitle ?? "")
  const startedAt = firstRound ? Number(firstRound[1]) : 0
  // Only from the winners bracket, and only when we know the bracket: a run
  // that opens in the lower bracket or a group stage did not begin here, and
  // without the field size we cannot say the round existed at all.
  if (depth && first?.bracket === "Upper" && startedAt > 1) {
    for (let r = 1; r < startedAt; r++) {
      nodes.push({
        kind: "bye",
        key: `bye-${r}`,
        label: shortRound(`Upper Round ${r}`, "Upper", depth),
      })
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const next = matches[i + 1]
    let label = shortRound(m.roundTitle, m.bracket, depth)
    if (label === "GF") {
      grandFinals += 1
      if (grandFinals > 1) label = "GF [R]"
    }
    // Only a fall into the lower bracket is a drop. "Upper Finals" ->
    // "Finals" is also a change of bracket and it is the opposite of one, so
    // testing inequality alone put a "↓ FINALS" warning under the node where a
    // player won the tournament.
    nodes.push({
      kind: "match",
      key: m.id,
      label,
      m,
      dropped: !!next && next.bracket === "Lower" && m.bracket !== "Lower",
    })
  }
  // **The run ends somewhere, and the rail should say where.** A journey that
  // stops on the match that knocked them out tells you the last thing that
  // happened but not what it added up to.
  //
  // The finish carries the placement and nothing else. It used to name the
  // partner too, which was right while the header did not — now that the
  // header does, and links them, a second copy three inches away was the
  // duplication and not the fix.
  if (placement.rank !== null) {
    nodes.push({
      kind: "finish",
      key: "finish",
      label: "Finish",
      rank: placement.rank,
    })
  }
  return nodes
}

/**
 * The series score.
 *
 * Challengermode reports every match as `bestOf: 1`, including a championship
 * final that used four game slots, so the format is never stated and the score
 * has to be reconstructed from two things: how many games were played, counted
 * from the per-game legend picks, and which format the round used.
 *
 * **The format is a convention, and the data states it even though the API
 * does not.** Grouping every set by its rung and looking at the lengths that
 * occur is decisive, because a Bo5 cannot end 2-0 and a Bo3 cannot reach four
 * games:
 *
 *   winners, TOP 32 [W] and earlier   2-game sets common, never 4 or 5 -> Bo3
 *   winners, TOP 16 [W] and deeper    4- and 5-game sets, never a 2    -> Bo5
 *   losers, every rung                4- and 5-game sets, never a 2    -> Bo5
 *   grand final                                                        -> Bo5
 *
 * Checked against every row we hold that has a game count: 1,965 consistent,
 * **zero** contradicting. That is what makes a three-game set answerable —
 * 3-0 inside the Bo5 rounds and 2-1 outside them — where the game count alone
 * left it as either.
 *
 * **Where the length is missing, the winner's half is still known.** A set
 * nobody reported picks for has no game count — 4,902 of 7,033 rows, the same
 * gap that leaves those nodes without legend art — but the format fixes what
 * the winner took: three in a Bo5, two in a Bo3. Those render as "3-?", dimmed,
 * because half a score is worth showing and must not be mistaken for a whole
 * one. The loser's games are genuinely unrecoverable: duration cannot stand in
 * for them (3-game sets run 24s-7,311s against 5-game sets at 635s-5,679s —
 * the distributions overlap almost entirely, and the field counts lobby time).
 *
 * The known cost: a set that was actually forfeited, but whose forfeit nobody
 * reported either, will read "3-?" rather than "W.O". We cannot tell those
 * apart — with no statistics at all, "played and won 3-0" and "won because
 * nobody showed" look identical — so the partial score assumes the match was
 * played, which is the commoner case.
 */
function bestOfFor(rung: number | null, bracket: string | null): number | null {
  if (rung === null) return null
  // The grand final and the whole losers bracket run long; on the winners side
  // the switch happens at Top 16.
  if (bracket === "Lower" || rung === -1) return 5
  return rung >= 4 ? 3 : 5
}

interface Score {
  text: string
  bestOf: number | null
  walkover: boolean
  /** False when only the winner's half is known and the rest is a "?". */
  exact: boolean
}

function seriesScore(m: EsportsMatch, rung: number | null): Score | null {
  if (m.won === null) return null

  // **The recorded score wins over anything inferred.** Challengermode carries
  // the real games on the Match nested inside each MatchSeries, and the sync
  // now stores it. A maximum of 1 is not a game score: the series node reports
  // `bestOf: 1` and 1-0 meaning "won the set", which is the placeholder left
  // for sets that have no inner result at all (~7%).
  const f = m.scoreFor
  const against = m.scoreAgainst
  if (f !== null && against !== null && Math.max(f, against) >= 2) {
    return {
      text: `${f}-${against}`,
      bestOf: null,
      walkover: false,
      exact: true,
    }
  }

  const bestOf = bestOfFor(rung, m.bracket)

  if (m.gamesPlayed === null) {
    // Nothing was reported, so only the winner's half is known. The loser is
    // shown as 0 rather than "?": a clean scoreline reads, and the sweep is
    // both the commonest result and the smallest thing we could be wrong by.
    // It stays dimmed, which is what separates it from a measured score.
    if (!bestOf) return null
    const need = Math.ceil(bestOf / 2)
    return {
      text: m.won ? `${need}-0` : `0-${need}`,
      bestOf,
      walkover: false,
      exact: false,
    }
  }

  // **One game is always a walkover.** Taking a set needs two games in a Bo3
  // and three in a Bo5, so a series that ended after one was never played out
  // in either format — it is a forfeit, and that holds without knowing which
  // format was in use. Printing "1-0" dressed 442 forfeits up as results.
  if (m.gamesPlayed === 1)
    return { text: "W.O", bestOf: null, walkover: true, exact: true }

  if (!bestOf) return null
  const won = Math.min(m.gamesPlayed, Math.ceil(bestOf / 2))
  const lost = m.gamesPlayed - won
  if (lost < 0) return null
  return {
    text: m.won ? `${won}-${lost}` : `${lost}-${won}`,
    bestOf,
    walkover: false,
    exact: true,
  }
}
/**
 * One player under a rail node, named the way this site names a player
 * everywhere else.
 *
 * **Handle and verified mark only — no flair here.** Flair is a badge you fly
 * beside your own name; on this rail it would be a third glyph on every line
 * of a stacked pair, eating the width the name needs and decorating somebody
 * who is not the subject of the page. The check earns its place because it
 * says the handle is the real one. Every other surface still renders flair —
 * this is the one that cannot afford it.
 */
function RailPerson({
  id,
  fallbackName,
  previews,
}: {
  id: number | null
  fallbackName: string | null
  previews: Map<number, PlayerPreview>
}) {
  const preview = id ? previews.get(id) : undefined
  const handle = preview?.verified?.handle
  const name = handle ?? fallbackName
  if (!name) return null
  return (
    <span className="flex w-full min-w-0 items-center gap-1">
      {id ? (
        <PlayerLink
          id={id}
          className="truncate text-xs leading-snug font-medium text-foreground transition-colors hover:text-pink"
        >
          {name}
        </PlayerLink>
      ) : (
        // A Challengermode name we could not resolve stays plain text — it must
        // not look like a link to a player we can vouch for.
        <span className="truncate text-xs leading-snug font-medium text-foreground/75">
          {name}
        </span>
      )}
      {handle && <VerifiedMark />}
    </span>
  )
}

/**
 * Splits "Keresdrakon | ttv + LopingB" back into its sides.
 *
 * Challengermode stores a team as one string joined by " + ", which is how it
 * arrives and how the match rows print it. The rail names each player
 * separately so both can be linked, so it has to come apart again — and the
 * halves line up with `opponentIds` positionally, since the sync builds both
 * from the same lineup in the same order.
 */
function splitSide(name: string | null): string[] {
  if (!name) return []
  return name
    .split(" + ")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * A side of the match — everyone on it, not just the first one.
 *
 * A 2v2 is played against a pair, and naming one of them made the node read as
 * a 1v1 against somebody who happened to have a partner. Both are named and
 * both are linked.
 *
 * **Stacked, not joined by an ampersand.** Side by side, a pair of handles set
 * the node's width, and the width of every node with it — an eight-match run
 * then ran past the card and had to be scrolled, which defeats a rail whose
 * whole point is being taken in at a glance. One name per line keeps a node as
 * narrow as its widest single handle, and a run of eight plus its finish fits
 * a 1280px page with room to spare.
 *
 * **A name is only paired with an id when the two provably line up.** The sync
 * keeps every member's username in `opponent_name` but drops the ones the
 * brawltools bridge could not resolve from `opponent_ids`, so the arrays agree
 * only when nobody was dropped — measured, that is 1,819 of 7,033 rows. Index
 * them against each other regardless and a 2v2 where one side is untracked
 * puts that player's name on the other one's profile link, which is precisely
 * the identity mistake the Challengermode username rule exists to prevent.
 * When they do not line up we fall back to naming the one opponent we can
 * actually vouch for, or to the raw string as plain text.
 */
function RailSide({
  ids,
  name,
  prefix,
  previews,
}: {
  ids: number[]
  name: string | null
  /** "vs" for the other side, "+" for your own. */
  prefix: string
  previews: Map<number, PlayerPreview>
}) {
  const names = splitSide(name)
  const count = Math.max(ids.length, names.length)
  if (count === 0) return null
  // Equal lengths means nothing was dropped, which is the only case where the
  // nth name belongs to the nth id.
  const aligned = ids.length > 0 && ids.length === names.length
  const people = aligned
    ? names.map((n, i) => ({ id: ids[i] ?? null, name: n as string | null }))
    : names.length > 0
      ? // Still one line per player — seeing who was on a team is the point —
        // but unlinked and under their Challengermode name, because without
        // alignment we cannot say which of them an id belongs to. Naming both
        // costs nothing; pointing at the wrong profile would cost identity.
        names.map((n) => ({
          id: null as number | null,
          name: n as string | null,
        }))
      : ids.map((id) => ({
          id: id as number | null,
          name: null as string | null,
        }))
  if (people.length === 0 || count === 0) return null

  return (
    // The prefix hangs to the left of the names rather than sitting inline on
    // the first of them, so every name in a stacked pair shares one left edge
    // instead of each line being centred on its own width.
    <span
      className="flex w-full min-w-0 items-start gap-1 px-1"
      title={name ?? undefined}
    >
      <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground/50">
        {prefix}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        {people.map((p, i) => (
          <RailPerson
            key={`${p.id ?? p.name}-${i}`}
            id={p.id}
            fallbackName={p.name}
            previews={previews}
          />
        ))}
      </span>
    </span>
  )
}

function RunRail({
  matches,
  previews,
  depth,
  placement,
}: {
  matches: EsportsMatch[]
  previews: Map<number, PlayerPreview>
  /** Bracket size for this tournament; null leaves rounds numbered. */
  depth: { upper: number; lower: number } | null
  placement: { rank: number | null }
}) {
  if (matches.length === 0) return null
  const nodes = buildRail(matches, depth, placement)
  // **Nodes share the width they are given rather than claiming a fixed one.**
  // A fixed width cannot serve both ends: 96px is comfortable for a six-match
  // run and pushes an eleven-node one (nine matches, a bye and the finish) off
  // the card, which is how the finish came to be the thing you could not see.
  // Flexing between 72px and 112px lets a short run breathe and a long one
  // compress, and only a genuinely huge bracket walk — 14 matches, of which we
  // hold two — falls back to scrolling.

  return (
    <ol className="flex items-start gap-0 overflow-x-auto px-5 py-6">
      {nodes.map((node, i) => {
        const prev = nodes[i - 1]
        const bye = node.kind === "bye"
        const finish = node.kind === "finish" ? node : null
        const m = node.kind === "match" ? node.m : null
        const won = m?.won === true
        const lost = m?.won === false
        const face = m ? (collapse(m.opponentLegends)[0] ?? null) : null
        const dropped = node.kind === "match" && node.dropped
        const rung = m ? roundRung(m.roundTitle, m.bracket, depth) : null
        const score = m ? seriesScore(m, rung) : null
        // The bye has no match behind it, so it carries the same mark by hand.
        const walkover = bye || score?.walkover === true
        const tone = finish
          ? placementText(finish.rank)
          : bye
            ? "text-positive"
            : won
              ? "text-positive"
              : lost
                ? "text-negative"
                : "text-muted-foreground"

        return (
          <li
            key={node.key}
            className="flex max-w-[7rem] min-w-[4.5rem] flex-1 basis-0 flex-col items-center gap-1.5"
          >
            <span className="flex w-full flex-col items-center gap-1.5">
              <span
                className={cn(
                  "font-mono text-[10px] font-semibold tracking-wider uppercase",
                  tone
                )}
              >
                {node.label}
              </span>

              <span className="relative flex w-full justify-center">
                {i > 0 && (
                  // Anchored to the circle's own centre line rather than a
                  // hand-computed margin, so the labels above can change
                  // height without the connectors sliding off the nodes.
                  // It carries the result of the node BEFORE it, so the line
                  // shows the run surviving or breaking.
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 right-1/2 mr-[1.625rem] h-px w-[calc(100%-3.25rem)] -translate-y-1/2",
                      prev?.kind === "bye"
                        ? "bg-positive/30"
                        : prev?.kind === "match" && prev.m.won === false
                          ? "bg-negative/30"
                          : "bg-positive/30"
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-13 items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
                    finish
                      ? finish.rank
                        ? placementTone(finish.rank)
                        : "border-border/60 bg-muted/40"
                      : bye
                        ? "border-positive/70 bg-positive/10"
                        : won
                          ? "border-positive/70 bg-positive/10"
                          : lost
                            ? "border-negative/70 bg-negative/10"
                            : "border-border/60 bg-muted/40"
                  )}
                >
                  {walkover ? (
                    // A set nobody played out, and a round nobody had to.
                    // Same glyph either way: the difference is whether there
                    // was an opponent at all, and the caption says which.
                    <UserX
                      className={cn("size-5", tone)}
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  ) : finish ? (
                    <span
                      className={cn(
                        "font-mono text-[11px] leading-none font-bold uppercase",
                        tone
                      )}
                    >
                      {finish.rank === null ? "END" : ordinal(finish.rank)}
                    </span>
                  ) : face ? (
                    <Image
                      src={`/assets/legends/${face}.png`}
                      alt=""
                      width={44}
                      height={44}
                      unoptimized
                      className="size-11 rounded-full object-cover"
                    />
                  ) : won || lost ? (
                    // Only reachable when no score exists: the game count and
                    // the picks come from the same statistics, so a match we
                    // can score is always a match we can draw a legend for.
                    // A tick and a cross rather than W and L: the result is
                    // the one thing every node has to answer, and a glyph is
                    // read at a glance where a letter has to be decoded.
                    // The ring already carries the colour, so these are only
                    // ever reinforcing it.
                    <span
                      className={cn("flex items-center justify-center", tone)}
                    >
                      {won ? (
                        <Check className="size-5" strokeWidth={3} aria-hidden />
                      ) : (
                        <X className="size-5" strokeWidth={3} aria-hidden />
                      )}
                    </span>
                  ) : (
                    // A bye, a draw and a series that never went final are
                    // all "not a loss" — there is no letter for that, so the
                    // dot stays for the one case it is honest about.
                    <span className="size-2.5 rounded-full bg-muted-foreground/50" />
                  )}
                </span>
              </span>

              {/* Reserved whether or not there is a score, so the names
                    below start on the same line in every node — a score on
                    some nodes and not others was pushing them out of step. */}
              <span className="flex h-3.5 items-center">
                {(score || bye) && (
                  <span
                    className={cn(
                      "font-mono text-xs leading-none font-bold",
                      walkover ? "tracking-wider" : "tabular-nums",
                      // A half-known score is dimmed so it never reads as a
                      // measured one at a glance.
                      score && !score.exact && "opacity-50",
                      tone
                    )}
                  >
                    {bye ? "W.O" : score?.text}
                  </span>
                )}
              </span>
            </span>

            {finish ? null : bye ? (
              // No hanging prefix here: there is no "vs" to hang, and the
              // spacer was costing the caption the width it needed to say
              // "no opponent" without truncating to "no oppone…".
              <span className="w-full truncate px-1 text-xs leading-snug font-medium text-foreground/75">
                no opponent
              </span>
            ) : (
              m && (
                <RailSide
                  ids={m.opponentIds}
                  name={m.opponentName}
                  prefix="vs"
                  previews={previews}
                />
              )
            )}

            {dropped && (
              <span className="font-mono text-[9px] tracking-wider text-negative uppercase">
                ↓ Lower
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString()}`
}

export function EsportsSection({
  matches,
  esports,
  previews,
  art,
}: {
  matches: EsportsMatch[]
  /** Challengermode art per tournament id, for the run header wash. */
  art: Map<string, CmTournament>
  /** Power rankings, earnings and medals — already loaded for the header. */
  esports: EsportsProfile | null | undefined
  previews: Map<number, PlayerPreview>
}) {
  const runs = toRuns(matches, previews)
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
    <div className="mx-auto max-w-[1280px] space-y-2 px-4 sm:px-6">
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

      {runs.map((run, i) => {
        const when = dateParts(
          run.matches[run.matches.length - 1]?.startedAt ?? null
        )
        return (
          // Native <details>, so the open/closed state is the browser's and the
          // whole section stays a server component — no hydration for a
          // disclosure. The most recent run is open because that is the one
          // someone came to see; everything older is one click away rather than
          // a wall of sixty rows they have to scroll past to reach it.
          <details
            key={run.tournamentId}
            open={i === 0}
            className="group/run overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors open:bg-card/50 hover:border-tier-valhallan/40"
          >
            {/* The card /tournaments uses, made into the disclosure control:
                date block, name, and the chips that say what the run was. */}
            <summary className="relative flex cursor-pointer list-none items-center gap-4 overflow-hidden p-3 sm:p-4 [&::-webkit-details-marker]:hidden">
              {/* The event's own art, bleeding in from the right exactly as
                  it does on /tournaments — same asset, same mask, so a
                  tournament looks like itself wherever the site shows one. */}
              {art.get(run.tournamentId)?.thumbnailUrl && (
                <Image
                  src={art.get(run.tournamentId)!.thumbnailUrl!}
                  alt=""
                  aria-hidden
                  width={640}
                  height={360}
                  unoptimized
                  className="pointer-events-none absolute top-1/2 -right-2 h-full w-auto max-w-none -translate-y-1/2 object-cover opacity-20 transition-opacity duration-300 select-none group-open/run:opacity-30"
                  style={{
                    maskImage:
                      "linear-gradient(to left, black 30%, transparent 95%)",
                    WebkitMaskImage:
                      "linear-gradient(to left, black 30%, transparent 95%)",
                  }}
                />
              )}
              <span className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-border/60 bg-muted/30 py-2">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {when.month}
                </span>
                <span className="font-display text-xl leading-none font-bold">
                  {when.day}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {when.year}
                </span>
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="min-w-0 truncate text-sm leading-tight font-medium">
                  {run.name}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {/* The finish leads the chips, because it is what the run was
                      for. Podium colours only — painting 9th gold-adjacent
                      would make every card shout. */}
                  {run.placementRank !== null && (
                    <Chip className={placementTone(run.placementRank)}>
                      <Trophy className="size-2.5" />
                      {ordinal(run.placementRank)}
                    </Chip>
                  )}
                  {run.mode && (
                    <Chip className="border-border/60 bg-muted/40 text-muted-foreground">
                      {run.mode}
                    </Chip>
                  )}
                  <Chip className="border-border/60 bg-muted/40 tabular-nums">
                    <span className="text-positive">{run.wins}</span>
                    <span className="text-muted-foreground/60">–</span>
                    <span className="text-negative">{run.losses}</span>
                  </Chip>
                  <Chip className="border-border/60 bg-muted/40 text-muted-foreground">
                    {run.matches.length}{" "}
                    {run.matches.length === 1 ? "match" : "matches"}
                  </Chip>
                  {/* The two facts a run has that the rail cannot hold: what
                      they actually played, and who with. The main is counted
                      across every game of the run rather than every set, so a
                      legend taken four times in one series outweighs one taken
                      once. */}
                  {run.mainLegend && (
                    <Chip className="border-border/60 bg-muted/40 text-muted-foreground">
                      <LegendChip
                        legendId={run.mainLegend}
                        size="sm"
                        showName={false}
                      />
                      {rosterEntryBySlug(run.mainLegend)?.name ??
                        run.mainLegend}
                    </Chip>
                  )}
                  {art.get(run.tournamentId)?.url && (
                    <BracketLink href={art.get(run.tournamentId)!.url} />
                  )}
                  {run.teammate && (
                    <TeammateChip
                      id={run.teammate.id}
                      name={run.teammate.name}
                      verified={run.teammate.verified}
                    />
                  )}
                </span>
              </span>

              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/run:rotate-180" />
            </summary>

            {/* The shape first, the detail under it. */}
            <div className="border-t border-border/60 bg-muted/10">
              <RunRail
                matches={run.matches}
                previews={previews}
                depth={bracketDepth(art.get(run.tournamentId)?.players)}
                placement={{ rank: run.placementRank }}
              />
            </div>
          </details>
        )
      })}
    </div>
  )
}
