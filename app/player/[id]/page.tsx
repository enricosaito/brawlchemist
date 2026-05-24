import { cache } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import {
  LegendChip,
  RankIcon,
  RegionPill,
  TIER_TEXT_COLOR,
} from "@/components/site/primitives"
import { DataTable, type ColDef } from "@/components/site/data-table"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import {
  getPlayerRanked,
  type PlayerRanked,
  type PlayerRanked2v2,
  type PlayerRankedLegend,
} from "@/lib/brawlhalla-api"
import { upsertPlayerRanked } from "@/lib/sync/players"
import { deriveTier, tierLabel } from "@/lib/tier"
import { formatElo, formatPercent } from "@/lib/format"
import { rosterEntryByLegendId, slugForLegendId } from "@/lib/legends-roster"
import { cn } from "@/lib/utils"

// Memoize per-request so generateMetadata and the page share one API call.
const loadPlayer = cache((id: number) => getPlayerRanked(id))

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function winRate(wins: number, games: number): string {
  if (games <= 0) return "—"
  return formatPercent((wins / games) * 100)
}

function legendName(l: PlayerRankedLegend): string {
  const roster = rosterEntryByLegendId(l.legend_id)
  if (roster) return roster.name
  return l.legend_name_key
    .replace(/^legend_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const numId = parseId(id)
  if (!numId) return { title: "Player · Brawlchemist" }
  const res = await loadPlayer(numId)
  const name = res.ok && res.data?.name ? res.data.name : `Player ${id}`
  return { title: `${name} · Brawlchemist` }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">{children}</main>
      <SiteFooter />
    </div>
  )
}

function NoticeCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-14 sm:px-6">
      <div className="mx-auto max-w-xl rounded-xl border border-border/60 bg-card/40 p-6 text-center">
        <h1 className="font-display text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
        <Link
          href="/"
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-wider text-copper transition-colors hover:text-foreground"
        >
          ← Search another player
        </Link>
      </div>
    </section>
  )
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-semibold tabular-nums",
          accent,
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  )
}

function SectionHeading({
  children,
  count,
}: {
  children: React.ReactNode
  count?: number
}) {
  return (
    <div className="mx-auto mb-3 flex max-w-[1280px] items-center gap-2">
      <h2 className="font-display text-lg font-semibold">{children}</h2>
      {count != null && (
        <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  )
}

function legendColumns(): ColDef<PlayerRankedLegend>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "48px",
      align: "right",
      render: (_l, i) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {i + 1}
        </span>
      ),
    },
    {
      id: "legend",
      label: "Legend",
      render: (l) => {
        const slug = slugForLegendId(l.legend_id)
        return (
          <div className="flex items-center gap-2">
            {slug ? (
              <LegendChip legendId={slug} size="md" showName={false} />
            ) : (
              <span className="inline-block size-7 shrink-0 rounded-md border border-border/60 bg-muted/40" />
            )}
            <span className="truncate text-sm font-medium">{legendName(l)}</span>
          </div>
        )
      },
    },
    {
      id: "tier",
      label: "Tier",
      width: "96px",
      render: (l) => {
        const tier = deriveTier(l.tier, l.rating)
        return (
          <span
            className={cn(
              "font-mono text-[11px] font-medium uppercase tracking-wider",
              tier ? TIER_TEXT_COLOR[tier] : "text-muted-foreground",
            )}
          >
            {tierLabel(l.tier, l.rating)}
          </span>
        )
      },
    },
    {
      id: "rating",
      label: "Rating",
      align: "right",
      width: "90px",
      render: (l) => (
        <span className="font-mono text-sm tabular-nums">
          {formatElo(l.rating)}
        </span>
      ),
    },
    {
      id: "peak",
      label: "Peak",
      align: "right",
      width: "90px",
      render: (l) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatElo(l.peak_rating)}
        </span>
      ),
    },
    {
      id: "games",
      label: "Games",
      align: "right",
      width: "80px",
      render: (l) => (
        <span className="font-mono text-sm tabular-nums">{l.games}</span>
      ),
    },
    {
      id: "record",
      label: "W–L",
      align: "right",
      width: "90px",
      render: (l) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {l.wins}–{Math.max(0, l.games - l.wins)}
        </span>
      ),
    },
    {
      id: "winrate",
      label: "Win Rate",
      align: "right",
      width: "96px",
      render: (l) => (
        <span className="font-mono text-sm tabular-nums text-positive">
          {winRate(l.wins, l.games)}
        </span>
      ),
    },
  ]
}

function teamColumns(): ColDef<PlayerRanked2v2>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "48px",
      align: "right",
      render: (_t, i) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {i + 1}
        </span>
      ),
    },
    {
      id: "team",
      label: "Team",
      render: (t) => (
        <span className="truncate text-sm font-medium">
          {t.teamname.replace("+", " + ")}
        </span>
      ),
    },
    {
      id: "tier",
      label: "Tier",
      width: "96px",
      render: (t) => {
        const tier = deriveTier(t.tier, t.rating)
        return (
          <span
            className={cn(
              "font-mono text-[11px] font-medium uppercase tracking-wider",
              tier ? TIER_TEXT_COLOR[tier] : "text-muted-foreground",
            )}
          >
            {tierLabel(t.tier, t.rating)}
          </span>
        )
      },
    },
    {
      id: "rating",
      label: "Rating",
      align: "right",
      width: "90px",
      render: (t) => (
        <span className="font-mono text-sm tabular-nums">
          {formatElo(t.rating)}
        </span>
      ),
    },
    {
      id: "peak",
      label: "Peak",
      align: "right",
      width: "90px",
      render: (t) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatElo(t.peak_rating)}
        </span>
      ),
    },
    {
      id: "games",
      label: "Games",
      align: "right",
      width: "80px",
      render: (t) => (
        <span className="font-mono text-sm tabular-nums">{t.games}</span>
      ),
    },
    {
      id: "record",
      label: "W–L",
      align: "right",
      width: "90px",
      render: (t) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {t.wins}–{Math.max(0, t.games - t.wins)}
        </span>
      ),
    },
    {
      id: "winrate",
      label: "Win Rate",
      align: "right",
      width: "96px",
      render: (t) => (
        <span className="font-mono text-sm tabular-nums text-positive">
          {winRate(t.wins, t.games)}
        </span>
      ),
    },
  ]
}

function ProfileHeader({ data }: { data: PlayerRanked }) {
  const tier = deriveTier(data.tier, data.rating)
  const losses = Math.max(0, data.games - data.wins)
  return (
    <section className="px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="mx-auto max-w-[1280px]">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-6 shadow-lg backdrop-blur-sm">
          {/* On-brand ambient wash — copper→mystic, kept off the data surfaces. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-copper/10 via-transparent to-mystic/10"
          />
          <div className="relative flex flex-wrap items-center gap-5">
            {tier && <RankIcon tier={tier} size={72} className="shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  {data.name}
                </h1>
                {data.region && <RegionPill region={data.region} />}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                {tier && (
                  <span className={TIER_TEXT_COLOR[tier]}>
                    {tierLabel(data.tier, data.rating)}
                  </span>
                )}
                {data.global_rank != null && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-muted-foreground">
                      #{data.global_rank.toLocaleString()} global
                    </span>
                  </>
                )}
                {data.region_rank != null && data.region && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-muted-foreground">
                      #{data.region_rank.toLocaleString()} {data.region}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Rating"
            value={formatElo(data.rating)}
            accent={tier ? TIER_TEXT_COLOR[tier] : undefined}
          />
          <StatTile label="Peak Rating" value={formatElo(data.peak_rating)} />
          <StatTile
            label="Win Rate"
            value={winRate(data.wins, data.games)}
            accent="text-positive"
          />
          <StatTile
            label="Games"
            value={data.games.toLocaleString()}
            sub={`${data.wins.toLocaleString()}W · ${losses.toLocaleString()}L`}
          />
        </div>
      </div>
    </section>
  )
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numId = parseId(id)

  if (!numId) {
    return (
      <Shell>
        <NoticeCard title="Invalid player ID">
          <span className="font-mono">{id}</span> isn&apos;t a valid Brawlhalla
          ID. IDs are positive numbers.
        </NoticeCard>
      </Shell>
    )
  }

  const res = await loadPlayer(numId)

  if (!res.ok) {
    return (
      <Shell>
        <NoticeCard title="Couldn’t load this player">
          {res.error}
        </NoticeCard>
      </Shell>
    )
  }

  const data = res.data
  // The /ranked endpoint returns an empty object for accounts with no ranked
  // play this season — there's no name or stats to show.
  if (!data || !data.name) {
    return (
      <Shell>
        <NoticeCard title="No ranked data">
          Brawlhalla ID <span className="font-mono">{numId}</span> has no ranked
          games this season, so there&apos;s nothing to show yet.
        </NoticeCard>
      </Shell>
    )
  }

  // Viewing a profile fetches the live payload anyway — persist it so the
  // player joins the pool that powers OTPs and the leaderboard enrichment.
  try {
    await upsertPlayerRanked(data)
  } catch {
    // A cache write failure shouldn't take down the page.
  }

  const legends = [...(data.legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)
  const teams = [...(data["2v2"] ?? [])].sort((a, b) => b.rating - a.rating)

  return (
    <Shell>
      <ProfileHeader data={data} />

      <div className="mt-8 px-4 sm:px-6">
        <SectionHeading count={legends.length}>1v1 Legends</SectionHeading>
        {legends.length > 0 ? (
          <DataTable
            columns={legendColumns()}
            rows={legends}
            rowKey={(l) => String(l.legend_id)}
          />
        ) : (
          <div className="mx-auto max-w-[1280px] rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
            No ranked 1v1 games on any legend this season.
          </div>
        )}
      </div>

      {teams.length > 0 && (
        <div className="mt-8 px-4 sm:px-6">
          <SectionHeading count={teams.length}>2v2 Teams</SectionHeading>
          <DataTable
            columns={teamColumns()}
            rows={teams}
            rowKey={(t) => `${t.brawlhalla_id_one}-${t.brawlhalla_id_two}`}
          />
        </div>
      )}
    </Shell>
  )
}
