import "server-only"

import { and, eq, isNotNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { esportsMatches, players, profiles } from "@/lib/db/schema"

/**
 * Evidence for "which Challengermode competitor is this pro", gathered so an
 * operator can assert the link in one click instead of ten lookups.
 *
 * ── Why this cannot be automatic ────────────────────────────────────────────
 *
 * There is no fact in any API that links a Brawlhalla ladder account to a
 * Challengermode competitor. Challengermode never exposes a Brawlhalla account
 * id at all; brawltools holds `cmPlayerId` and `brawlhallaId` on one record,
 * but for 32 of the 38 unlinked pros that `brawlhallaId` is null. So the best
 * available evidence is a *chain* that has to close across three sources:
 *
 *   brawltools   handle -> a competitor, carrying cmPlayerId
 *   Challengermode   that user -> the in-game name they set on their own
 *                    Brawlhalla game account
 *   us   the profile's own account -> players.username
 *
 * When the last two agree, the player has effectively told us which account is
 * theirs: `GameAccount.displayName` is something they typed, and it lands on
 * the account an operator already curated as this pro. That is strong. It is
 * still not proof — Brawlhalla names are not unique, and two people called
 * "MAK" would close the same chain — so nothing here writes. It grades, and a
 * human asserts.
 *
 * Measured over the 38 pros with no match history: 3 close exactly, 8 come
 * close, 23 produce a candidate the names do not support, and 4 produce none.
 * The grades exist so the exact ones cost a click and the weak ones still look
 * like a decision.
 */

const BT = "https://api.brawltools.com"
const CM_AUTH = "https://publicapi.challengermode.com/mk1/v1/auth/access_keys"
const CM_GQL = "https://publicapi.challengermode.com/graphql"

export type LinkGrade = "exact" | "near" | "weak" | "none"

export interface LinkCandidate {
  brawlhallaId: number
  handle: string
  /** The in-game name on the account this profile already names. */
  ourName: string | null
  /** What brawltools calls the competitor it found. */
  competitorName: string | null
  /** The Challengermode id we would store. Null when nothing was found. */
  cmPlayerId: string | null
  /** The in-game name that competitor set on their own CM account. */
  cmGameName: string | null
  /** brawltools' Brawlhalla id for them, which is usually absent. */
  esportsBrawlhallaId: number | null
  grade: LinkGrade
  /** Already asserted by an operator — shown, but not re-suggested. */
  linked: boolean
}

/** Case and punctuation carry no signal in an in-game name. */
function norm(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Spellings to try for one handle.
 *
 * The same ladder sync-esports-titles.mjs uses, and for the same reason:
 * brawltools' search matches the bare handle, not the tagged name, and drops
 * characters its index cannot hold. Widening the net is safe here because
 * nothing is written on a hit — it becomes a candidate with a grade.
 */
function spellings(handle: string): string[] {
  const afterTag = handle.includes("|")
    ? handle.split("|").pop()!.trim()
    : handle
  const dePunct = (v: string) => v.replace(/[^\p{L}\p{N}_ ]+/gu, "").trim()
  return [
    handle,
    afterTag,
    dePunct(afterTag),
    dePunct(afterTag).split(/\s+/)[0],
  ].filter((v, i, a) => v && v.length >= 2 && a.indexOf(v) === i)
}

async function cmToken(): Promise<string | null> {
  try {
    const res = await fetch(CM_AUTH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshKey: process.env.CHALLENGERMODE_REFRESH_KEY,
      }),
      cache: "no-store",
    })
    if (!res.ok) return null
    const { value } = (await res.json()) as { value?: string }
    return value ?? null
  } catch {
    return null
  }
}

/** The in-game name a Challengermode user put on their Brawlhalla account. */
async function cmGameName(
  token: string | null,
  cmPlayerId: string
): Promise<string | null> {
  if (!token) return null
  try {
    const res = await fetch(CM_GQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `{ user(userId: "${cmPlayerId}") { gameAccounts(first: 5) { nodes { displayName gameTitle { slug } } } } }`,
      }),
      cache: "no-store",
    })
    const json = (await res.json()) as {
      data?: {
        user?: {
          gameAccounts?: {
            nodes?: { displayName?: string; gameTitle?: { slug?: string } }[]
          }
        }
      }
    }
    const nodes = json.data?.user?.gameAccounts?.nodes ?? []
    return (
      nodes.find((n) => n.gameTitle?.slug === "brawlhalla")?.displayName ?? null
    )
  } catch {
    return null
  }
}

interface BtHit {
  name?: string
  cmPlayerId?: string | null
  brawlhallaId?: number | null
}

async function searchCompetitor(handle: string): Promise<BtHit | null> {
  for (const q of spellings(handle)) {
    try {
      const res = await fetch(
        `${BT}/v2/player/search?query=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      )
      if (!res.ok) continue
      const json = (await res.json()) as {
        searchPlayers?: { player?: BtHit }[]
      }
      const hits: BtHit[] = (json.searchPlayers ?? []).map(
        (h) => h.player ?? {}
      )
      // A hit only counts when the names overlap at all — brawltools returns
      // fuzzy matches, and an unrelated competitor would become a candidate
      // that looks considered.
      const hit = hits.find(
        (h) =>
          h.cmPlayerId &&
          (norm(h.name).includes(norm(handle)) ||
            norm(handle).includes(
              norm(
                String(h.name ?? "")
                  .split("|")
                  .pop()
              )
            ))
      )
      if (hit) return hit
    } catch {
      // Try the next spelling; a transient failure is not a verdict.
    }
  }
  return null
}

function gradeFor(ourName: string | null, cmName: string | null): LinkGrade {
  if (!cmName) return "weak"
  if (!ourName) return "weak"
  const a = norm(ourName)
  const b = norm(cmName)
  if (!a || !b) return "weak"
  if (a === b) return "exact"
  if (a.includes(b) || b.includes(a)) return "near"
  return "weak"
}

/**
 * Every verified pro who has no match history, with the best candidate found.
 *
 * Uncached and admin-only: it makes roughly two network calls per pro and is
 * the kind of thing that should run when someone opens the screen, not on a
 * schedule. Already-linked pros are included so an operator can see and undo
 * what was asserted.
 */
export async function gatherLinkCandidates(): Promise<LinkCandidate[]> {
  const rows = await db()
    .select({
      brawlhallaId: profiles.brawlhallaId,
      handle: profiles.handle,
      cmPlayerId: profiles.cmPlayerId,
      username: players.username,
    })
    .from(profiles)
    .leftJoin(players, eq(players.brawlhallaId, profiles.brawlhallaId))
    // Only the pros this screen can do anything about: the ones with no match
    // history, plus the ones already linked so an assertion can be taken back.
    // Listing all 122 meant 84 rows that need no decision, and — because each
    // row costs two network calls — a screen that took 55 seconds to say so.
    .where(
      and(
        eq(profiles.isPro, true),
        or(
          isNotNull(profiles.cmPlayerId),
          sql`not exists (select 1 from ${esportsMatches} where ${esportsMatches.brawlhallaId} = ${profiles.brawlhallaId})`
        )
      )
    )

  const token = await cmToken()
  const out: LinkCandidate[] = []

  for (const row of rows) {
    if (!row.handle) continue
    // Already asserted: show it, do not spend two calls re-suggesting it.
    if (row.cmPlayerId) {
      out.push({
        brawlhallaId: row.brawlhallaId,
        handle: row.handle,
        ourName: row.username ?? null,
        competitorName: null,
        cmPlayerId: row.cmPlayerId,
        cmGameName: null,
        esportsBrawlhallaId: null,
        grade: "exact",
        linked: true,
      })
      continue
    }
    const hit = await searchCompetitor(row.handle)
    const cmId = hit?.cmPlayerId ?? null
    const gameName = cmId ? await cmGameName(token, cmId) : null
    out.push({
      brawlhallaId: row.brawlhallaId,
      handle: row.handle,
      ourName: row.username ?? null,
      competitorName: hit?.name ?? null,
      cmPlayerId: cmId,
      cmGameName: gameName,
      esportsBrawlhallaId: hit?.brawlhallaId ?? null,
      grade: cmId ? gradeFor(row.username ?? null, gameName) : "none",
      linked: false,
    })
  }

  // Strongest first, so the cheap decisions are at the top and the real ones
  // are not buried under them.
  const order: Record<LinkGrade, number> = {
    exact: 0,
    near: 1,
    weak: 2,
    none: 3,
  }
  return out.sort(
    (a, b) =>
      Number(a.linked) - Number(b.linked) ||
      order[a.grade] - order[b.grade] ||
      a.handle.localeCompare(b.handle)
  )
}
