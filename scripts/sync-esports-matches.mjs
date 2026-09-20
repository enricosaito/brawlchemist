// Derive a pro's tournament match history from Challengermode brackets.
//
// Usage: node scripts/sync-esports-matches.mjs [--years 2022,...] [--dry]
//                    [--limit N] [--tournament <id>] [--resume]
//
// --resume skips tournaments already walked with the current field set, which
// is what makes a killed run cost nothing to pick back up.
//
// DO NOT use --resume after linking a pro in /admin. The skip is per
// TOURNAMENT, not per player: once a backfill has run, every event looks done,
// so a resumed run skips all of them, writes nothing for the newly linked pro
// and still reports success. A new link needs a full walk.
//
// The companion to sync-esports-titles.mjs: that script asks who won an event,
// this one asks how they got there. Same three APIs and the same
// proof-not-match rule for identity.
//
// Only Challengermode-hosted events have brackets, and the era boundary is
// later than anyone here assumed. Measured across brawltools' official events:
//
//   2021  60 events — all SGG
//   2022  57 events — all SGG
//   2023  52 events — all SGG
//   2024  52 events — all SGG
//   2025  50 events — 36 CM, 14 SGG
//   2026  41 events — all CM
//
// So match history begins in **2025**, and even 2025 is partial: the 14 SGG
// events that year have no bracket to read. The default --years still reaches
// back to 2022 on purpose — those years cost a handful of list calls and return
// nothing today, but they would pick up anything Challengermode backfills later
// rather than needing someone to remember to widen it.
//
// ── Why the query looks like that ────────────────────────────────────────────
//
// brawltools has NO match endpoint. /v2/match, /v2/player/{id}/matches and
// friends all 404; placements are per-player only. Challengermode has the full
// bracket, but `Tournament.stages` is an INTERFACE — select it plainly and you
// get index/format/lineupCount and conclude there is nothing there. The matches
// live behind inline fragments on the concrete stage types, which is the whole
// reason this was worth building rather than impossible.
//
// `first: 200` is deliberate: it pulls 966 of a 512-player double-elimination
// bracket's ~1023 matches in ONE request (measured), so a tournament costs two
// or three calls instead of twenty-five.
//
// ── Why identity is the hard part ────────────────────────────────────────────
//
// Challengermode never exposes a Brawlhalla account id. Its `gameAccountId` is
// a CM-internal UUID and `GameAccount.displayName` is an in-game name
// ("BBBalloonBoy7") that does not match what we store. The only proof-backed
// bridge is brawltools, which holds `cmPlayerId` and `brawlhallaId` on the same
// record — so a Challengermode member is identified by UUID equality, never by
// name.
//
// That bridge is lossy, measured across 122 verified pros:
//
//   84  ids agree, /v2/player/bhId resolves directly
//   10  compete on a DIFFERENT account than the one their profile curates
//       (Ahmet among them) — see profiles.esports_brawlhalla_id
//   28  brawltools knows them as competitors but holds no brawlhallaId at all
//
// So the map is built from OUR side, not the bracket's: one lookup per pro
// (~122 calls per run), and a bracket member counts only if their CM id is in
// it. Resolving every entrant by name search instead would be thousands of
// calls per tournament and would trade proof for a guess.
//
// Rows are always written under the profile's canonical brawlhalla_id, so the
// alias never leaks past this script.
//
// Idempotent: the row id is `${matchSeriesId}:${brawlhallaId}`, so a re-run
// updates in place. Completed tournaments never change, so re-walking one is
// wasted work rather than wrong work.

import fs from "node:fs"
import postgres from "postgres"
import { config } from "dotenv"

config({ path: ".env.local" })

const CM_AUTH = "https://publicapi.challengermode.com/mk1/v1/auth/access_keys"
const CM_GQL = "https://publicapi.challengermode.com/graphql"
const BT = "https://api.brawltools.com"

const args = process.argv.slice(2)
const DRY = args.includes("--dry")
const flag = (name) => {
  const i = args.indexOf(name)
  return i > -1 ? args[i + 1] : null
}
const YEARS = (flag("--years") ?? "2022,2023,2024,2025,2026")
  .split(",")
  .map(Number)
const LIMIT = Number(flag("--limit") ?? 0) || Infinity
const ONLY_TOURNAMENT = flag("--tournament")
/**
 * Skip tournaments already walked with the current field set.
 *
 * A completed tournament never changes, so re-walking one is wasted work — but
 * until now it was wasted work the script did every single run, and a full pass
 * takes long enough that two of them were killed part-way and lost everything
 * after the point they stopped. Resumability is what makes an interruption cost
 * nothing rather than an hour.
 *
 * "Already walked" means carrying everything the CURRENT field set produces,
 * not merely "has rows" — and that test has to move every time the script
 * learns to read something new. It was `games_played is not null`, which was
 * right until placements were added: events walked before that have a set
 * length and no finish, so a resume skipped exactly the rows it should have
 * been filling. Every field added here needs its own clause, or the flag
 * quietly stops resuming and starts pretending.
 *
 * Off by default, so a plain run is still a full refresh.
 */
const RESUME = args.includes("--resume")

// ── Challengermode ───────────────────────────────────────────────────────────

/**
 * A Challengermode bearer, refreshed before it dies.
 *
 * **The token lasts 20 minutes, not an hour.** Measured: a token minted at
 * 03:32 reported expiresAt 03:52. A full backfill takes well over that, and
 * fetching once at startup is why a run failed its last 17 tournaments in a row
 * with "The current user is not authorized to access this resource" — an error
 * that reads like the tournaments are private when in fact the token had simply
 * expired. Seventeen consecutive failures at the tail of a run is the shape of
 * an expiry, never of a permission.
 *
 * Refreshed two minutes early, so a long walk mid-request cannot straddle the
 * boundary.
 */
let cachedToken = null
let cachedUntil = 0

async function cmToken(force = false) {
  if (!force && cachedToken && Date.now() < cachedUntil) return cachedToken
  const res = await fetch(CM_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refreshKey: process.env.CHALLENGERMODE_REFRESH_KEY,
    }),
  })
  if (!res.ok) throw new Error(`CM auth ${res.status}`)
  // The field is `value`, not `accessToken` — reading the wrong one yields a
  // token of `undefined` and every query answers AUTH_NOT_AUTHENTICATED.
  const { value, expiresAt } = await res.json()
  if (!value) throw new Error("CM auth returned no value")
  cachedToken = value
  const parsed = Date.parse(expiresAt)
  cachedUntil =
    (Number.isFinite(parsed) ? parsed : Date.now() + 20 * 60_000) - 120_000
  return value
}

/**
 * Query, and retry once on an auth failure with a forced-fresh token.
 *
 * The proactive refresh above covers the expected case; this covers the clock
 * being wrong or the server retiring a token early. One retry, never a loop —
 * a key that is actually invalid should fail the run rather than hammer the
 * auth endpoint.
 */
async function cmQuery(query, variables, retried = false) {
  const res = await fetch(CM_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await cmToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    const message = json.errors[0]?.message ?? "CM error"
    if (
      !retried &&
      /not authorized|AUTH_NOT_AUTHENTICATED|unauthenti/i.test(message)
    ) {
      await cmToken(true)
      return cmQuery(query, variables, true)
    }
    throw new Error(message)
  }
  return json.data
}

/** What a match series looks like, wherever it hangs in the bracket. */
const SERIES_FIELDS = `
  id title bestOf state startedAt
  results { final draw lineupResults { lineupNumber placement score } }
  lineups { name seed members { user { id username } } }
  matches(includeFailed: true) {
    results { lineupResults { lineupNumber score } }
    gameSession { durationInMilliseconds }
    lineups { members { user { id } statistics(first: 10) { nodes { name formattedValue } } } }
  }`

const BRACKET_QUERY = `query($id: UUID!) {
  tournament(tournamentId: $id) {
    name state
    stages {
      index format
      ... on TournamentEliminationStage {
        brackets { rounds { roundNumber title
          matchSeriesPage(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } } }
      }
      ... on TournamentGroupStage {
        groups { title
          matchSeriesPage(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } }
      }
      ... on TournamentSwissStage {
        rounds { roundNumber title
          matchSeriesPage(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } }
      }
    }
  }
}`

/**
 * Where everyone finished.
 *
 * A second query per tournament rather than part of the bracket walk, because
 * placement hangs off the roster and not off any match — Challengermode knows
 * you came 5th without any single match saying so. One extra call on top of the
 * two or three the bracket costs, and it is the same roster read
 * sync-esports-titles.mjs already makes for winners.
 *
 * Keyed by Challengermode user id so it joins the same way everything else here
 * does. A 2v2 lineup puts both members on the lineup's placement, which is
 * correct: a team places, not a person.
 */
const PLACEMENT_QUERY = `query($id: UUID!) {
  tournament(tournamentId: $id) {
    attendance { roster { lineups(limit: 600) {
      placement { bestPlacement worstPlacement displayPlacement }
      members { user { id } }
    } } }
  }
}`

async function placementsFor(tournamentId) {
  const byUser = new Map()
  try {
    const data = await cmQuery(PLACEMENT_QUERY, { id: tournamentId })
    for (const l of data?.tournament?.attendance?.roster?.lineups ?? []) {
      const rank = l.placement?.bestPlacement
      if (!rank) continue
      for (const m of l.members ?? []) {
        if (m.user?.id) {
          byUser.set(m.user.id, {
            rank,
            display: l.placement.displayPlacement ?? String(rank),
          })
        }
      }
    }
  } catch {
    // A tournament whose roster will not load still has usable matches; the
    // run keeps its results and simply has no finish to show.
  }
  return byUser
}

/**
 * The few pages `first: 200` does not cover.
 *
 * A round-one page of a 512-lineup bracket holds 256 matches, so exactly one
 * round per tournament tends to spill. Chasing it with a targeted follow-up is
 * cheaper than lowering the page size for everyone.
 */
const MORE_QUERY = `query($id: UUID!, $after: String!) {
  tournament(tournamentId: $id) { stages {
    ... on TournamentEliminationStage { brackets { rounds {
      matchSeriesPage(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } } } }
  } }
}`

/**
 * Every match series in a tournament, with where in the bracket it sat.
 *
 * "Bracket" is Challengermode's own word for the upper/lower/finals halves of a
 * double elimination, and it is the only label that distinguishes an upper
 * semi-final from a lower one — so it is kept alongside the round title rather
 * than flattened into it.
 */
async function walkTournament(tournamentId) {
  const data = await cmQuery(BRACKET_QUERY, { id: tournamentId })
  const t = data?.tournament
  if (!t) return { name: null, state: null, series: [] }
  const series = []
  const take = (nodes, bracket, roundTitle, roundNumber) => {
    for (const n of nodes ?? [])
      series.push({ ...n, bracket, roundTitle, roundNumber })
  }
  let spill = []
  for (const st of t.stages ?? []) {
    // Elimination: brackets -> rounds. The bracket has no title of its own, so
    // it is named by the rounds inside it ("Upper Round 1" -> "Upper").
    for (const [bi, b] of (st.brackets ?? []).entries()) {
      for (const rd of b.rounds ?? []) {
        const bracket = bracketNameFor(rd.title, bi)
        take(rd.matchSeriesPage?.nodes, bracket, rd.title, rd.roundNumber)
        if (rd.matchSeriesPage?.pageInfo?.hasNextPage) {
          spill.push({
            after: rd.matchSeriesPage.pageInfo.endCursor,
            bracket,
            roundTitle: rd.title,
            roundNumber: rd.roundNumber,
          })
        }
      }
    }
    for (const g of st.groups ?? []) {
      take(g.matchSeriesPage?.nodes, "Groups", g.title, null)
    }
    for (const rd of st.rounds ?? []) {
      take(rd.matchSeriesPage?.nodes, "Swiss", rd.title, rd.roundNumber)
    }
  }
  // Drain the spill. Bounded at a handful of passes — a bracket that needs more
  // than this is pathological and the partial walk is still honest data.
  for (let pass = 0; pass < 4 && spill.length; pass++) {
    const next = []
    for (const s of spill) {
      const more = await cmQuery(MORE_QUERY, {
        id: tournamentId,
        after: s.after,
      })
      for (const st of more?.tournament?.stages ?? []) {
        for (const b of st.brackets ?? []) {
          for (const rd of b.rounds ?? []) {
            const page = rd.matchSeriesPage
            if (!page?.nodes?.length) continue
            take(page.nodes, s.bracket, s.roundTitle, s.roundNumber)
            if (page.pageInfo?.hasNextPage)
              next.push({ ...s, after: page.pageInfo.endCursor })
          }
        }
      }
    }
    spill = next
  }
  // The same series can arrive twice when a follow-up page overlaps; the id is
  // the truth.
  const byId = new Map()
  for (const s of series) if (!byId.has(s.id)) byId.set(s.id, s)
  return { name: t.name, state: t.state, series: [...byId.values()] }
}

/** "Upper Semi finals" -> "Upper"; "Finals" -> "Finals"; else the index. */
function bracketNameFor(roundTitle, bracketIndex) {
  const t = String(roundTitle ?? "")
  if (/^upper/i.test(t)) return "Upper"
  if (/^lower/i.test(t)) return "Lower"
  if (/final/i.test(t)) return "Finals"
  return `Bracket ${bracketIndex + 1}`
}

// ── brawltools ───────────────────────────────────────────────────────────────

async function officialEvents(year, gameMode) {
  const out = []
  let nextToken
  for (let page = 0; page < 4; page++) {
    const qs = new URLSearchParams({
      gameMode: String(gameMode),
      year: String(year),
      maxResults: "50",
    })
    if (nextToken) qs.set("nextToken", nextToken)
    const res = await fetch(`${BT}/v2/event?${qs}`)
    if (!res.ok) break
    const json = await res.json()
    out.push(...(json.tournaments ?? []))
    if (!json.nextToken) break
    nextToken = json.nextToken
  }
  // Only Challengermode-hosted events have brackets to walk.
  return out.filter((t) => t.isOfficial && t.host === "CM")
}

/**
 * cmPlayerId -> our canonical brawlhalla_id, built from the profiles we curate.
 *
 * Built from our side on purpose (see the header): one lookup per pro, and a
 * bracket member counts only if their UUID is in here. `esports_brawlhalla_id`
 * is what gets looked up when a pro competes on a second account, but the value
 * stored is always the profile's own id.
 */
async function buildBridge(sql) {
  const rows = await sql`
    select brawlhalla_id, cm_player_id, handle
    from profiles where coalesce(pro_tier, case when is_pro then 'pro' else 'none' end)
      in ('top','pro','hall-of-famer','power-ranked')`
  const map = new Map()
  let asserted = 0
  const unresolved = []
  for (const r of rows) {
    // An operator-asserted Challengermode id wins, and costs no call: it is the
    // answer the lookup below is trying to reach. 38 of 122 pros cannot be
    // reached any other way — most have no brawlhallaId on their brawltools
    // record at all — so without this they simply have no history (see
    // /admin -> Esports links).
    if (r.cm_player_id) {
      map.set(r.cm_player_id, r.brawlhalla_id)
      asserted++
      continue
    }
    try {
      const res = await fetch(`${BT}/v2/player/bhId/${r.brawlhalla_id}`)
      if (res.ok) {
        const cm = (await res.json())?.player?.cmPlayerId
        if (cm) {
          map.set(cm, r.brawlhalla_id)
          continue
        }
      }
    } catch {
      // A transient failure is not a verdict; the pro is simply skipped this run.
    }
    unresolved.push(r.handle ?? String(r.brawlhalla_id))
    await sleep(40)
  }
  return { map, asserted, unresolved, total: rows.length }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Shaping a row ────────────────────────────────────────────────────────────

/**
 * Challengermode's legend spelling, as a roster slug.
 *
 * It writes display names ("Bödvar", "LinFei", "Mordex"), and dropping case and
 * everything that is not a letter or digit lands all 64 values it uses on a
 * roster entry — verified across two full tournaments with zero unmatched. A
 * value that does not map returns null rather than being stored raw, because a
 * slug nothing can draw is worse than an absence the renderer already handles.
 */
const ROSTER_BY_KEY = (() => {
  const src = fs.readFileSync(
    new URL("../lib/legends-roster.ts", import.meta.url),
    "utf8"
  )
  const map = new Map()
  for (const m of src.matchAll(/slug: "([a-z0-9-]+)", name: "([^"]+)"/g)) {
    const [, slug, name] = m
    map.set(key(slug), slug)
    map.set(key(name), slug)
  }
  return map
})()

function key(v) {
  return String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function legendSlug(value) {
  if (!value || value === "NA") return null
  return ROSTER_BY_KEY.get(key(value)) ?? null
}

/**
 * Per-game legend picks and set length, pulled out of the statistics.
 *
 * Keyed by Challengermode user id, which is the same id the series lineups use,
 * so the two halves of a match series join without trusting lineup ordering.
 *
 * The slots are named Game1_Legend..Game5_Legend and sort lexically in the order
 * they were played, which only holds while there are fewer than ten of them —
 * true today and asserted by the padStart below rather than assumed.
 */
function detailFor(series) {
  const byUser = new Map()
  let durationMs = 0
  for (const m of series.matches ?? []) {
    const ms = m.gameSession?.durationInMilliseconds
    if (typeof ms === "number" && ms > durationMs) durationMs = ms
    for (const l of m.lineups ?? []) {
      for (const mem of l.members ?? []) {
        const id = mem.user?.id
        if (!id) continue
        const picks = (mem.statistics?.nodes ?? [])
          .filter((n) => /^Game\d+_Legend$/i.test(n.name ?? ""))
          .sort((a, b) =>
            String(a.name).padStart(16, "0") < String(b.name).padStart(16, "0")
              ? -1
              : 1
          )
          .map((n) => legendSlug(n.formattedValue))
        // Trailing "NA"s mean games that were never played; a null in the middle
        // is a value we could not map and is dropped the same way. Either way
        // the count of real picks is the number of games reported.
        const played = picks.filter(Boolean)
        if (played.length) byUser.set(id, played)
      }
    }
  }
  // A series is as long as the longer report: one player filling this in and the
  // other not is the common case outside the officiated rounds.
  let gamesPlayed = 0
  for (const picks of byUser.values()) {
    if (picks.length > gamesPlayed) gamesPlayed = picks.length
  }
  return {
    byUser,
    gamesPlayed: gamesPlayed || null,
    durationSeconds: durationMs ? Math.round(durationMs / 1000) : null,
  }
}

/**
 * One match, from one tracked player's point of view.
 *
 * `lineupNumber` indexes into `lineups` (verified against a real final: lineups
 * [Bunny, BBBalloonBoy] with lineupResults lineupNumber 1 placement 1 is the
 * BBBalloonBoy win the bracket shows). Placement 1 is the winner.
 *
 * Byes are not matches. A series with fewer than two lineups is skipped rather
 * than stored as a win nobody played for.
 */
function rowsFor(series, ev, bridge, placements) {
  const lineups = series.lineups ?? []
  if (lineups.length < 2) return []
  const results = series.results?.lineupResults ?? []
  const placementOf = (i) =>
    results.find((r) => r.lineupNumber === i)?.placement ?? null

  // **The real score is on the INNER match, not on the series.** Challengermode
  // models a set as a MatchSeries reporting `bestOf: 1` whose own
  // `lineupResults.score` is 1-0 — meaning "won the set", not a game count —
  // wrapping one Match that carries the actual games, e.g. 2-1. We walked past
  // it for months and inferred the score from the per-game legend picks
  // instead, which are self-reported and cover barely a third of matches; the
  // inner result covers ~93% and is measured rather than derived.
  //
  // It rides inside the bracket walk we already make, so it costs no extra
  // request and no Brawlhalla budget.
  const inner = (series.matches ?? []).filter(
    (m) => (m.results?.lineupResults ?? []).length > 0
  )
  const gameScoreOf = (i) => {
    let best = null
    for (const m of inner) {
      const v = (m.results.lineupResults ?? []).find(
        (r) => r.lineupNumber === i
      )?.score
      if (typeof v === "number" && (best === null || v > best)) best = v
    }
    return best
  }
  // A set both sides show as 0 was never played out — a walkover recorded as a
  // result. Treated as unknown rather than printed as 0-0.
  const anyGames = lineups.some((_, i) => (gameScoreOf(i) ?? 0) > 0)
  const scoreOf = (i) =>
    anyGames
      ? gameScoreOf(i)
      : (results.find((r) => r.lineupNumber === i)?.score ?? null)

  const detail = detailFor(series)

  const out = []
  for (const [i, lineup] of lineups.entries()) {
    const members = lineup.members ?? []
    // Which of our pros is on this side. A lineup can hold two in 2v2, and both
    // deserve the row from their own point of view.
    const tracked = members
      .map((m) => ({
        cm: m.user?.id,
        bh: bridge.get(m.user?.id),
        name: m.user?.username,
      }))
      .filter((m) => m.bh)
    if (tracked.length === 0) continue

    const others = lineups.filter((_, j) => j !== i)
    const opponentName =
      others
        .map(
          (o) =>
            (o.members ?? [])
              .map((m) => m.user?.username)
              .filter(Boolean)
              .join(" + ") || o.name
        )
        .join(" / ") || null
    const opponentIds = others
      .flatMap((o) => (o.members ?? []).map((m) => bridge.get(m.user?.id)))
      .filter((v) => typeof v === "number")
    // Everything the other side picked, in game order. Flattened across a 2v2
    // lineup because the row is about the matchup, not about who on the other
    // team picked what.
    const opponentLegends = others.flatMap((o) =>
      (o.members ?? []).flatMap((m) => detail.byUser.get(m.user?.id) ?? [])
    )
    // The partner's side of the same lookup opponents get, so a 2v2 row can
    // link both halves of the team rather than only naming them.
    const lineupIds = members
      .map((m) => bridge.get(m.user?.id))
      .filter((v) => typeof v === "number")

    const mine = placementOf(i)
    const theirs =
      others.length === 1 ? placementOf(lineups.indexOf(others[0])) : null
    // Null, not false, when nothing decided it — see the `won` column note.
    const won =
      series.results?.draw === true
        ? null
        : mine === 1
          ? true
          : theirs === 1
            ? false
            : null

    for (const t of tracked) {
      const partner = members
        .filter((m) => m.user?.id !== t.cm)
        .map((m) => m.user?.username)
        .filter(Boolean)
        .join(" + ")
      out.push({
        id: `${series.id}:${t.bh}`,
        match_id: series.id,
        brawlhalla_id: t.bh,
        tournament_id: ev.id,
        tournament_name: ev.tournamentName ?? ev.eventName ?? null,
        year: ev.year ?? null,
        mode: ev.isTwos ? "2v2" : "1v1",
        bracket: series.bracket ?? null,
        round_title: series.roundTitle ?? null,
        round_number: series.roundNumber ?? null,
        best_of: series.bestOf ?? null,
        started_at: series.startedAt ?? null,
        won,
        score_for: scoreOf(i),
        score_against:
          others.length === 1 ? scoreOf(lineups.indexOf(others[0])) : null,
        opponent_name: opponentName,
        opponent_ids: opponentIds,
        teammate_name: partner || null,
        teammate_ids: lineupIds.filter((v) => v !== t.bh),
        placement_rank: placements?.get(t.cm)?.rank ?? null,
        placement_display: placements?.get(t.cm)?.display ?? null,
        legends: detail.byUser.get(t.cm) ?? [],
        opponent_legends: opponentLegends,
        games_played: detail.gamesPlayed,
        duration_seconds: detail.durationSeconds,
      })
    }
  }
  return out
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sql = postgres(
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    { max: 1, ssl: "require" }
  )
  try {
    console.log("building the Challengermode bridge from curated pros…")
    const bridge = await buildBridge(sql)
    console.log(
      `  ${bridge.map.size}/${bridge.total} pros resolved` +
        (bridge.aliased
          ? ` (${bridge.aliased} via esports_brawlhalla_id)`
          : "") +
        `, ${bridge.unresolved.length} unresolved`
    )
    if (bridge.unresolved.length) {
      console.log(
        `  unresolved: ${bridge.unresolved.slice(0, 12).join(", ")}${bridge.unresolved.length > 12 ? " …" : ""}`
      )
    }
    if (bridge.map.size === 0)
      throw new Error(
        "no pros resolved — refusing to walk brackets for nothing"
      )

    let events = []
    if (ONLY_TOURNAMENT) {
      // Everything but the id is filled in after the walk, from Challengermode's
      // own answer — see the `--tournament` note below. Hardcoding nulls here
      // is what wrote 62 rows with no event name, no year, and 2v2 events
      // recorded as 1v1.
      events = [{ id: ONLY_TOURNAMENT }]
    } else {
      for (const year of YEARS) {
        for (const gameMode of [1, 2]) {
          events.push(...(await officialEvents(year, gameMode)))
        }
      }
      const seen = new Set()
      events = events.filter((e) => !seen.has(e.id) && seen.add(e.id))
    }
    if (RESUME) {
      const done = await sql`
        select tournament_id from esports_matches
        group by tournament_id
        having count(games_played) > 0 and count(placement_rank) > 0
           -- Real game scores (max >= 2) landed after the first backfill; a
           -- tournament holding only the 1-0 series placeholders was walked
           -- before that and must be walked again. Every new field needs its
           -- own clause here or the skip goes silently wrong.
           and max(greatest(score_for, score_against)) >= 2`
      const doneIds = new Set(done.map((r) => r.tournament_id))
      const before = events.length
      events = events.filter((e) => !doneIds.has(e.id))
      console.log(
        `  --resume: skipping ${before - events.length} already detailed, ${events.length} to go`
      )
    }
    events = events.slice(0, LIMIT)
    console.log(
      `\n${events.length} Challengermode-hosted official events to walk\n`
    )

    let written = 0,
      skipped = 0,
      matched = 0,
      failed = 0
    for (const [i, ev] of events.entries()) {
      const label = ev.tournamentName ?? ev.eventName ?? ev.id
      let walked
      try {
        walked = await walkTournament(ev.id)
      } catch (err) {
        failed++
        console.log(
          `[${i + 1}/${events.length}] ${label} — FAILED: ${String(err.message).slice(0, 90)}`
        )
        continue
      }
      // **`--tournament` knows only an id, and the walk is what knows the
      // rest.** The listing path gets name, year and mode from brawltools; the
      // targeted path skips that listing entirely, so those three used to be
      // written as null, null and "1v1" — silently mislabelling every 2v2 event
      // walked this way and leaving the run card reading "Unknown event".
      // Challengermode returns the name from the same request the bracket came
      // from, and the rest follows from it, so the targeted path costs nothing
      // extra to get right.
      if (ev.tournamentName == null && walked.name) {
        ev.tournamentName = walked.name
        ev.isTwos = /\b(2v2|3v3|doubles)\b/i.test(walked.name)
      }
      if (ev.year == null) {
        const first = walked.series.find((s) => s.startedAt)?.startedAt
        const fromName = walked.name?.match(/\b(20\d{2})\b/)?.[1]
        ev.year =
          fromName ??
          (first ? String(new Date(first).getUTCFullYear()) : null)
      }

      const placements = await placementsFor(ev.id)
      const rows = walked.series.flatMap((s) =>
        rowsFor(s, ev, bridge.map, placements)
      )
      matched += walked.series.length
      if (rows.length === 0) {
        skipped++
        console.log(
          `[${i + 1}/${events.length}] ${label} — ${walked.series.length} matches, none ours`
        )
        continue
      }
      if (!DRY) {
        // One statement per tournament rather than per row: the cost here is
        // round trips to us-west-1, not the writes themselves.
        for (const r of rows) {
          await sql`
            insert into esports_matches ${sql(r)}
            on conflict (id) do update set
              won = excluded.won,
              score_for = excluded.score_for,
              score_against = excluded.score_against,
              opponent_name = excluded.opponent_name,
              opponent_ids = excluded.opponent_ids,
              legends = excluded.legends,
              opponent_legends = excluded.opponent_legends,
              games_played = excluded.games_played,
              duration_seconds = excluded.duration_seconds,
              teammate_ids = excluded.teammate_ids,
              placement_rank = excluded.placement_rank,
              placement_display = excluded.placement_display,
              started_at = excluded.started_at,
              round_title = excluded.round_title,
              bracket = excluded.bracket`
        }
      }
      written += rows.length
      console.log(
        `[${i + 1}/${events.length}] ${label} — ${walked.series.length} matches, ${rows.length} ours${DRY ? " (dry)" : ""}`
      )
    }

    console.log(
      `\ndone. ${written} rows ${DRY ? "would be " : ""}written from ${matched} bracket matches` +
        ` across ${events.length} events (${skipped} with none of ours, ${failed} failed)`
    )
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
