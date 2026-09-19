// Derive a pro's tournament match history from Challengermode brackets.
//
// Usage: node scripts/sync-esports-matches.mjs [--years 2022,...] [--dry]
//                                              [--limit N] [--tournament <id>]
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
  results { final draw lineupResults { lineupNumber placement score formattedScore } }
  lineups { name seed members { user { id username } } }`

const BRACKET_QUERY = `query($id: UUID!) {
  tournament(tournamentId: $id) {
    name state
    stages {
      index format
      ... on TournamentEliminationStage {
        brackets { rounds { roundNumber title
          matchSeriesPage(first: 200) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } } }
      }
      ... on TournamentGroupStage {
        groups { title
          matchSeriesPage(first: 200) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } }
      }
      ... on TournamentSwissStage {
        rounds { roundNumber title
          matchSeriesPage(first: 200) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } }
      }
    }
  }
}`

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
      matchSeriesPage(first: 200, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${SERIES_FIELDS} } } } } }
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
    select brawlhalla_id, esports_brawlhalla_id, handle
    from profiles where is_pro = true`
  const map = new Map()
  let aliased = 0
  const unresolved = []
  for (const r of rows) {
    const lookupId = r.esports_brawlhalla_id ?? r.brawlhalla_id
    try {
      const res = await fetch(`${BT}/v2/player/bhId/${lookupId}`)
      if (res.ok) {
        const cm = (await res.json())?.player?.cmPlayerId
        if (cm) {
          map.set(cm, r.brawlhalla_id)
          if (r.esports_brawlhalla_id) aliased++
          continue
        }
      }
    } catch {
      // A transient failure is not a verdict; the pro is simply skipped this run.
    }
    unresolved.push(r.handle ?? String(r.brawlhalla_id))
    await sleep(40)
  }
  return { map, aliased, unresolved, total: rows.length }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Shaping a row ────────────────────────────────────────────────────────────

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
function rowsFor(series, ev, bridge) {
  const lineups = series.lineups ?? []
  if (lineups.length < 2) return []
  const results = series.results?.lineupResults ?? []
  const placementOf = (i) =>
    results.find((r) => r.lineupNumber === i)?.placement ?? null
  const scoreOf = (i) =>
    results.find((r) => r.lineupNumber === i)?.score ?? null

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
      events = [
        {
          id: ONLY_TOURNAMENT,
          tournamentName: null,
          year: null,
          isTwos: false,
        },
      ]
    } else {
      for (const year of YEARS) {
        for (const gameMode of [1, 2]) {
          events.push(...(await officialEvents(year, gameMode)))
        }
      }
      const seen = new Set()
      events = events.filter((e) => !seen.has(e.id) && seen.add(e.id))
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
      const rows = walked.series.flatMap((s) => rowsFor(s, ev, bridge.map))
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
