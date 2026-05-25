import { ImageResponse } from "next/og"
import { getPlayerRanked, isApiRegion } from "@/lib/brawlhalla-api"
import { getValhallanCutoff } from "@/lib/sync/valhallan-cutoff"
import { getOverride } from "@/lib/sync/player-overrides"
import { deriveTier, isValhallan, tierLabel } from "@/lib/tier"

export const alt = "Brawlchemist player profile"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Hex approximations of the tier tokens (Satori can't read CSS vars).
const TIER_HEX: Record<string, string> = {
  Tin: "#9aa0a6",
  Bronze: "#c08457",
  Silver: "#c9d1d9",
  Gold: "#f5c542",
  Platinum: "#67d4c8",
  Diamond: "#7cc0ff",
  Valhallan: "#b18cf0",
}

const fmt = (n: number) => n.toLocaleString("en-US")

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numId = Number(id)
  const res =
    Number.isInteger(numId) && numId > 0 ? await getPlayerRanked(numId) : null
  const data = res?.ok ? res.data : null

  // Tell Valhallan apart from Diamond (both 2000+) using the region's cutoff.
  let valhallan = false
  if (data?.region && data.region !== "ALL" && isApiRegion(data.region)) {
    const c = await getValhallanCutoff("1v1", data.region)
    valhallan = isValhallan(data.rating, c?.rating ?? null, data.wins)
  }

  const name = data?.name || "Player"
  const tier = data ? deriveTier(data.tier, valhallan) : null
  const tierColor = tier ? TIER_HEX[tier] : "#8b8b94"
  const games = data?.games ?? 0
  const wins = data?.wins ?? 0
  const wr = games > 0 ? `${((wins / games) * 100).toFixed(1)}%` : "—"
  const preview = data ? await getOverride(data.brawlhalla_id) : undefined
  const verified = preview?.verified ?? null

  const stats = [
    {
      label: "Rating",
      value: data?.rating != null ? fmt(data.rating) : "—",
      color: tierColor,
    },
    {
      label: "Peak",
      value: data?.peak_rating != null ? fmt(data.peak_rating) : "—",
      color: "#f5f5f7",
    },
    { label: "Win Rate", value: wr, color: "#4ade80" },
    { label: "Games", value: fmt(games), color: "#f5f5f7" },
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
            "linear-gradient(135deg, #120c0a 0%, #0a0a0c 55%, #0c0a16 100%)",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 26,
            letterSpacing: 8,
            color: "#c8804a",
          }}
        >
          BRAWLCHEMIST
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1 }}>
              {name}
            </div>
            {verified ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 10,
                  border: "2px solid #8b7bd8",
                  background: "rgba(139,123,216,0.18)",
                  color: "#b18cf0",
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
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34 }}>
            <div style={{ display: "flex", color: tierColor, fontWeight: 600 }}>
              {data ? tierLabel(data.tier, valhallan) : "—"}
            </div>
            {data?.region ? (
              <div style={{ display: "flex", color: "#6b6b73" }}>·</div>
            ) : null}
            {data?.region ? (
              <div style={{ display: "flex", color: "#a1a1aa" }}>{data.region}</div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 64 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  letterSpacing: 2,
                  color: "#8b8b94",
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
