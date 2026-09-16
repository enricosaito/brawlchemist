import { ImageResponse } from "next/og"
import { getPlayerRanked, type PlayerRanked } from "@/lib/brawlhalla-api"
import {
  getPlayerRankedJson,
  getPlayerSyncState,
} from "@/lib/sync/players"
import { getLadderPosition } from "@/lib/sync/live"
import { readValhallanMembers } from "@/lib/sync/valhallan"
import { getProfile } from "@/lib/sync/profiles"
import { recordFetch, requestClientInfo } from "@/lib/sync/fetch-log"
import { deriveTier, tierLabel } from "@/lib/tier"

export const alt = "Brawlchemist player profile"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * Unfurls repeat: a link pasted in a busy Discord is re-fetched by several
 * services, and the same link gets posted again. An hour of caching turns a
 * thread full of the same profile into one render.
 */
export const revalidate = 3600

/**
 * Site tokens as hex, because Satori cannot read CSS variables.
 *
 * Converted from the dark-theme oklch values in globals.css rather than eyeballed
 * — the previous set had Valhallan as a purple (#b18cf0) when the site renders it
 * pink-red, so a shared card could disagree with the page it advertised.
 */
const TIER_HEX: Record<string, string> = {
  Tin: "#81878d",
  Bronze: "#c07c56",
  Silver: "#c5cbd2",
  Gold: "#f3b94c",
  Platinum: "#76c7cc",
  Diamond: "#86b8ff",
  Valhallan: "#ff5bab",
}
const PINK = "#ff5dbf"
const MYSTIC = "#7de4ca"
const GOLD = "#f3b94c"
const FG = "#e3e1de"
const MUTED = "#818388"

const fmt = (n: number) => n.toLocaleString("en-US")

/**
 * The payload behind the card, without spending API budget.
 *
 * An unfurler is a crawler — it is a machine rendering a preview, and cardinal
 * constraint #3 says those read stored data at any age rather than competing
 * with visitors for the 180/15min. This route used to go straight to
 * `getPlayerRanked` on every render, so every share of a link cost a call and
 * a busy thread cost several.
 *
 * The one case that still fetches is a player we hold nothing for, where the
 * alternative is unfurling a blank card for a genuinely new profile.
 */
async function loadForCard(
  numId: number,
): Promise<{ data: PlayerRanked | null; fetched: boolean; ok: boolean }> {
  const state = await getPlayerSyncState(numId).catch(() => null)
  // Any row at all means we have already asked about this player — including
  // the marker row that says they have no ranked record (recordUnrankedPlayer).
  // Re-asking on an unfurl would spend a call to re-learn the same nothing.
  if (state) {
    const data = state.hasRankedJson ? await getPlayerRankedJson(numId) : null
    return { data, fetched: false, ok: true }
  }
  const res = await getPlayerRanked(numId, { revalidate: 300 })
  return { data: res.ok ? res.data : null, fetched: true, ok: res.ok }
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numId = Number(id)
  const valid = Number.isInteger(numId) && numId > 0

  const { data, fetched, ok } = valid
    ? await loadForCard(numId)
    : { data: null, fetched: false, ok: false }

  // Keep the OG route visible in /admin's fetch log — it is the one surface
  // where a sudden burst of shares would show up as budget pressure.
  if (valid) {
    const { client, referer } = await requestClientInfo()
    await recordFetch({
      brawlhallaId: numId,
      source: "og-image",
      result: !fetched ? "cached" : ok ? "synced" : "failed",
      client,
      referer,
    }).catch(() => {})
  }

  // Everything below is a database read or a cached map — no API calls.
  const [preview, ladder, members] = await Promise.all([
    data ? getProfile(data.brawlhalla_id).catch(() => undefined) : undefined,
    valid ? getLadderPosition(numId).catch(() => null) : null,
    readValhallanMembers("1v1").catch(() => new Map<string, number[]>()),
  ])

  // Ladder membership, straight from the daily walk stored in valhallan_members.
  // The old code asked getValhallanCutoff, which can trigger a live leaderboard
  // walk — on a share preview, of all things.
  const valhallan =
    !!data &&
    [...members.values()].some((ids) => ids.includes(data.brawlhalla_id))

  // The API returns an empty name for a player with no ranked season, so a
  // missing name is the same test the profile page uses for "nothing to show".
  const ranked = !!data?.name
  const name =
    preview?.verified?.handle ||
    data?.name ||
    // Raw, not fmt() — an id is an identifier, and "#60,843,647" reads as a
    // quantity.
    (valid ? `Player #${numId}` : "Player")
  const tier = data ? deriveTier(data.tier, valhallan) : null
  const tierColor = tier ? TIER_HEX[tier] : MUTED
  const games = data?.games ?? 0
  const wins = data?.wins ?? 0
  const wr = games > 0 ? `${((wins / games) * 100).toFixed(1)}%` : "—"
  // One accolade, the first — the header shows all of them, but at card size a
  // row of them turns into a wall and the point is that there is one at all.
  const accolade = preview?.esportsTitles?.[0] ?? null

  const stats = [
    {
      label: "Rating",
      value: data?.rating != null ? fmt(data.rating) : "—",
      color: tierColor,
    },
    {
      label: "Peak",
      value: data?.peak_rating != null ? fmt(data.peak_rating) : "—",
      color: FG,
    },
    { label: "Win Rate", value: wr, color: MYSTIC },
    { label: "Games", value: fmt(games), color: FG },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 72,
          background:
            "linear-gradient(135deg, #140a12 0%, #0a0a0c 55%, #0c0a16 100%)",
          color: FG,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 26,
            letterSpacing: 8,
            color: PINK,
          }}
        >
          BRAWLCHEMIST
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                fontSize: 88,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {name}
            </div>
            {preview?.verified ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 10,
                  border: `2px solid ${MYSTIC}`,
                  background: "rgba(125,228,202,0.14)",
                  color: MYSTIC,
                  fontSize: 26,
                  fontWeight: 700,
                  padding: "4px 14px",
                  letterSpacing: 2,
                }}
              >
                PRO
              </div>
            ) : null}
          </div>

          {accolade ? (
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 8,
                  border: `2px solid ${GOLD}66`,
                  background: "rgba(243,185,76,0.12)",
                  color: GOLD,
                  fontSize: 26,
                  padding: "4px 14px",
                }}
              >
                {accolade}
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontSize: 34,
            }}
          >
            <div style={{ display: "flex", color: tierColor, fontWeight: 600 }}>
              {ranked ? tierLabel(data!.tier, valhallan) : "No ranked season"}
            </div>
            {data?.region ? (
              <div style={{ display: "flex", color: "#6b6b73" }}>·</div>
            ) : null}
            {data?.region ? (
              <div style={{ display: "flex", color: "#a1a1aa" }}>
                {data.region}
              </div>
            ) : null}
            {ladder ? (
              <div style={{ display: "flex", color: "#6b6b73" }}>·</div>
            ) : null}
            {ladder ? (
              <div style={{ display: "flex", color: "#a1a1aa" }}>
                #{fmt(ladder.rank)} global
              </div>
            ) : null}
          </div>
        </div>

        {/* Omitted entirely when there is no ranked season: four em-dashes
            under four labels reads as a card that failed to load, which is the
            worst thing a shared link can look like. The line above already
            says what is going on. */}
        <div style={{ display: "flex", gap: 64 }}>
          {(ranked ? stats : []).map((s) => (
            <div
              key={s.label}
              style={{ display: "flex", flexDirection: "column" }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  letterSpacing: 2,
                  color: MUTED,
                }}
              >
                {s.label.toUpperCase()}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 56,
                  fontWeight: 700,
                  color: s.color,
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
