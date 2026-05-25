import { cache } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { RegionPill, TIER_TEXT_COLOR } from "@/components/site/primitives"
import { ProBadge } from "@/components/site/pro-badge"
import { FallenValhallanBadge } from "@/components/site/fallen-valhallan"
import { PLAYER_PREVIEWS } from "@/lib/player-previews"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import {
  getPlayerRanked,
  getPlayerStats,
  getStaticLegends,
  isApiRegion,
  type ApiGameMode,
  type ApiRegion,
  type PlayerRanked,
  type PlayerRanked2v2,
  type PlayerRankedLegend,
} from "@/lib/brawlhalla-api"
import { getPlayersByIds, upsertPlayerRanked } from "@/lib/sync/players"
import { getValhallanCutoff } from "@/lib/sync/valhallan-cutoff"
import type { PlayerRow } from "@/lib/db/schema"
import { deriveTier, isFallenValhallan, isValhallan, tierLabel } from "@/lib/tier"
import { formatElo, formatPercent } from "@/lib/format"
import { slugForLegendId } from "@/lib/legends-roster"
import { cn } from "@/lib/utils"

// Memoize per-request so generateMetadata and the page share one API call.
const loadPlayer = cache((id: number) => getPlayerRanked(id))
const loadStats = cache((id: number) => getPlayerStats(id))
const loadStaticLegends = cache(() => getStaticLegends())
const loadCutoff = cache((mode: ApiGameMode, region: ApiRegion) =>
  getValhallanCutoff(mode, region),
)

const MAX_LEGEND_LEVEL = 100

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Lowest Valhallan rating in the player's region for a queue, used to tell
 * Valhallan apart from Diamond (both 2000+). Null for regions we don't track
 * (e.g. an unexpected string, or the synthetic "ALL").
 */
async function valhallanCutoffRating(
  mode: ApiGameMode,
  region: string | null | undefined,
): Promise<number | null> {
  if (!region || region === "ALL" || !isApiRegion(region)) return null
  const c = await loadCutoff(mode, region)
  return c?.rating ?? null
}

function winRate(wins: number, games: number): string {
  if (games <= 0) return "—"
  return formatPercent((wins / games) * 100)
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
  if (!res.ok || !res.data?.name) {
    return { title: "Player · Brawlchemist" }
  }
  const d = res.data
  const cutoff = await valhallanCutoffRating("1v1", d.region)
  const valhallan = isValhallan(d.rating, cutoff, d.wins)
  const wr = d.games > 0 ? `${((d.wins / d.games) * 100).toFixed(1)}% WR` : null
  const description = [
    tierLabel(d.tier, valhallan),
    `${formatElo(d.rating)} ELO`,
    wr,
    `${d.games.toLocaleString()} games`,
    d.region || null,
  ]
    .filter(Boolean)
    .join(" · ")
  const title = `${d.name} · Brawlchemist`
  // og:image is auto-attached from opengraph-image.tsx in this folder.
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  }
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

/** One label/value pair. Composed into the combined stat cards below. */
function Metric({
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
    <div className="flex min-w-0 flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "mt-0.5 truncate font-display text-2xl font-semibold tabular-nums",
          accent,
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {sub}
        </span>
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

/** Slug of the player's most-played legend this season. */
function topLegendSlug(legends: PlayerRankedLegend[] | undefined): string | null {
  const top = [...(legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)[0]
  return top ? slugForLegendId(top.legend_id) : null
}

function LegendHead({
  slug,
  className,
}: {
  slug: string | null
  className?: string
}) {
  if (!slug) {
    return (
      <span
        className={cn(
          "shrink-0 rounded-md border border-border/60 bg-muted/30",
          className,
        )}
      />
    )
  }
  return (
    <Image
      src={`/assets/legends/${slug}.png`}
      alt=""
      width={48}
      height={48}
      className={cn(
        "shrink-0 rounded-md border border-border/60 object-cover",
        className,
      )}
    />
  )
}

interface TeamView {
  team: PlayerRanked2v2
  teammateId: number
  teammateName: string
  teammateSlug: string | null
}

function TeamCard({
  view,
  ownerName,
  ownerSlug,
  valhallanCutoff,
}: {
  view: TeamView
  ownerName: string
  ownerSlug: string | null
  valhallanCutoff: number | null
}) {
  const { team, teammateId, teammateName, teammateSlug } = view
  const valhallan = isValhallan(team.rating, valhallanCutoff, team.wins)
  const tier = deriveTier(team.tier, valhallan)
  const losses = Math.max(0, team.games - team.wins)
  return (
    <Link
      href={`/player/${teammateId}`}
      className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-copper/50 hover:bg-card/70"
    >
      {tier && (
        <Image
          src={`/assets/ranks/Banner_Rank_${tier}.webp`}
          alt={`${tier} rank banner`}
          width={182}
          height={330}
          className="h-20 w-auto shrink-0 select-none object-contain drop-shadow-sm"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex shrink-0 items-center -space-x-1.5">
            <LegendHead slug={ownerSlug} className="size-8 ring-1 ring-card" />
            <LegendHead slug={teammateSlug} className="size-8 ring-1 ring-card" />
          </span>
          <span className="truncate text-sm font-medium">
            {ownerName} <span className="text-muted-foreground">+</span>{" "}
            {teammateName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px]">
          {tier && (
            <span
              className={cn("uppercase tracking-wider", TIER_TEXT_COLOR[tier])}
            >
              {tierLabel(team.tier, valhallan)}
            </span>
          )}
          <span className="tabular-nums">
            {formatElo(team.rating)}
            <span className="ml-1 text-[9px] uppercase text-muted-foreground">
              ELO
            </span>
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums text-muted-foreground">
            peak {formatElo(team.peak_rating)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{team.games.toLocaleString()} games</span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            {team.wins.toLocaleString()}–{losses.toLocaleString()}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-positive">{winRate(team.wins, team.games)}</span>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-copper" />
    </Link>
  )
}

function ProfileHeader({
  data,
  titles,
  valhallan,
  fallen,
}: {
  data: PlayerRanked
  titles: string[]
  valhallan: boolean
  fallen: boolean
}) {
  const tier = deriveTier(data.tier, valhallan)
  const losses = Math.max(0, data.games - data.wins)
  const preview = PLAYER_PREVIEWS[data.brawlhalla_id]
  const topSlugs = [...(data.legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, 5)
    .map((l) => slugForLegendId(l.legend_id))
    .filter((s): s is string => !!s)

  // Meta line under the name: ranks (rarely populated) + earned legend titles.
  // The tier itself now lives in the rating card below.
  const metaNodes: { key: string; node: React.ReactNode }[] = []
  if (data.global_rank) {
    metaNodes.push({
      key: "global",
      node: (
        <span className="text-muted-foreground">
          #{data.global_rank.toLocaleString()} global
        </span>
      ),
    })
  }
  if (data.region_rank && data.region) {
    metaNodes.push({
      key: "region",
      node: (
        <span className="text-muted-foreground">
          #{data.region_rank.toLocaleString()} {data.region}
        </span>
      ),
    })
  }
  titles.forEach((title, i) => {
    metaNodes.push({
      key: `title-${i}`,
      node: <span className="normal-case text-tier-gold">{title}</span>,
    })
  })
  const hasMeta = fallen || !!preview?.verified || metaNodes.length > 0

  return (
    <section className="px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="mx-auto max-w-[1280px]">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-6 shadow-lg backdrop-blur-sm">
          {/* On-brand ambient wash — copper→mystic, kept off the data surfaces. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-copper/10 via-transparent to-mystic/10"
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-stretch">
            {(tier || preview?.favoriteSkin) && (
              <div className="flex shrink-0 items-center justify-center gap-3 sm:justify-start">
                {tier && (
                  <Image
                    src={`/assets/ranks/Banner_Rank_${tier}.webp`}
                    alt={`${tier} rank banner`}
                    width={182}
                    height={330}
                    className="h-36 w-auto shrink-0 select-none object-contain drop-shadow-md sm:h-44"
                    priority
                  />
                )}
                {preview?.favoriteSkin && (
                  <Image
                    src={preview.favoriteSkin.src}
                    alt={preview.favoriteSkin.name}
                    title={`Favorite skin: ${preview.favoriteSkin.name}`}
                    width={364}
                    height={323}
                    className="h-36 w-auto shrink-0 select-none object-contain drop-shadow-md sm:h-44"
                  />
                )}
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                      {data.name}
                    </h1>
                    {data.region && <RegionPill region={data.region} />}
                  </div>
                  {hasMeta && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                      {fallen && <FallenValhallanBadge />}
                      {preview?.verified && (
                        <span className="inline-flex items-center gap-2">
                          <ProBadge />
                          <span className="text-sm font-semibold normal-case text-mystic">
                            {preview.verified.handle}
                          </span>
                        </span>
                      )}
                      {metaNodes.map((item, i) => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-2"
                        >
                          {(i > 0 || preview?.verified || fallen) && (
                            <span
                              aria-hidden
                              className="text-muted-foreground/40"
                            >
                              ·
                            </span>
                          )}
                          {item.node}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Esports accolades — experimental, hardcoded per player. */}
                {preview?.achievements && preview.achievements.length > 0 && (
                  <ul className="flex shrink-0 flex-col gap-1 sm:items-end">
                    {preview.achievements.map((a) => (
                      <li
                        key={a}
                        className="flex items-center gap-1.5 text-xs font-semibold text-tier-gold"
                      >
                        <Image
                          src="/assets/Legendary_moment_trophy.png"
                          alt=""
                          width={616}
                          height={1212}
                          className="h-5 w-auto shrink-0 select-none object-contain"
                        />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Stat cards row, anchored to the bottom so the banner/skin on
                  the left spans this and the name row above it. */}
              <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                {/* Rating + peak, with the tier label moved in here. */}
                <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:flex-1">
                  <div className="flex items-start justify-between gap-6">
                    <Metric
                      label="Rating"
                      value={formatElo(data.rating)}
                      accent={tier ? TIER_TEXT_COLOR[tier] : undefined}
                    />
                    <Metric label="Peak" value={formatElo(data.peak_rating)} />
                  </div>
                  {tier && (
                    <div className="mt-2 font-mono text-[11px] font-medium uppercase tracking-wider">
                      <span className={TIER_TEXT_COLOR[tier]}>
                        {tierLabel(data.tier, valhallan)}
                      </span>
                    </div>
                  )}
                </div>
                {/* Win rate + games played. */}
                <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:flex-1">
                  <div className="flex items-start justify-between gap-6">
                    <Metric
                      label="Win Rate"
                      value={winRate(data.wins, data.games)}
                      accent="text-positive"
                    />
                    <Metric
                      label="Games"
                      value={data.games.toLocaleString()}
                      sub={`${data.wins.toLocaleString()}W · ${losses.toLocaleString()}L`}
                    />
                  </div>
                </div>
                {/* Most played — now its own card for consistency. */}
                {topSlugs.length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:shrink-0">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Most Played
                    </span>
                    <div className="mt-2 flex items-center gap-2">
                      {topSlugs.map((slug) => (
                        <LegendHead key={slug} slug={slug} className="size-11" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
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

  // Legend titles: every legend the player has maxed (level 100) earns its
  // "bio_aka" (e.g. Teros → "The Minotaur"). Levels come from GetPlayerStats,
  // titles from the static legend list. Both fail open — no titles, no error.
  const [statsRes, legendsRes] = await Promise.all([
    loadStats(numId),
    loadStaticLegends(),
  ])
  let titles: string[] = []
  if (statsRes.ok && legendsRes.ok) {
    const akaById = new Map(
      legendsRes.data.map((l) => [l.legend_id, l.bio_aka]),
    )
    titles = [...(statsRes.data.legends ?? [])]
      .filter((l) => l.level >= MAX_LEGEND_LEVEL)
      .sort((a, b) => (b.games ?? 0) - (a.games ?? 0))
      // Some legends list multiple titles ("The Unconquered Viking, The Great
      // Bear") — keep only the first.
      .map((l) => akaById.get(l.legend_id)?.split(",")[0].trim())
      .filter((t): t is string => !!t)
  }

  const teams = [...(data["2v2"] ?? [])].sort((a, b) => b.rating - a.rating)

  // Resolve each team's *other* player so cards can show their main legend and
  // link to their profile. Looked up from our cache; fail open if it's down.
  const ownerSlug = topLegendSlug(data.legends)
  const teammateIdFor = (t: PlayerRanked2v2) =>
    t.brawlhalla_id_one === data.brawlhalla_id
      ? t.brawlhalla_id_two
      : t.brawlhalla_id_one
  let teammates = new Map<number, PlayerRow>()
  if (teams.length > 0) {
    try {
      teammates = await getPlayersByIds(teams.map(teammateIdFor))
    } catch (err) {
      console.error("[player] teammate lookup failed:", err)
    }
  }
  const teamViews: TeamView[] = teams.map((t) => {
    const teammateId = teammateIdFor(t)
    const row = teammates.get(teammateId)
    const parts = t.teamname.split("+").map((s) => s.trim())
    const fallbackName =
      parts.length === 2
        ? parts[0] === data.name
          ? parts[1]
          : parts[0]
        : `Player #${teammateId}`
    return {
      team: t,
      teammateId,
      teammateName: row?.username || fallbackName || `Player #${teammateId}`,
      teammateSlug: row?.topLegendId ? slugForLegendId(row.topLegendId) : null,
    }
  })

  // Distinguish Valhallan from Diamond (both 2000+) via the region's live
  // ladder cutoff — 1v1 for the header, 2v2 for the team cards.
  const [cutoff1v1, cutoff2v2] = await Promise.all([
    valhallanCutoffRating("1v1", data.region),
    teams.length > 0
      ? valhallanCutoffRating("2v2", data.region)
      : Promise.resolve(null),
  ])
  const headerValhallan = isValhallan(data.rating, cutoff1v1, data.wins)
  const headerFallen = isFallenValhallan(
    data.tier,
    data.rating,
    data.peak_rating,
    cutoff1v1,
    data.wins,
  )

  return (
    <Shell>
      <ProfileHeader
        data={data}
        titles={titles}
        valhallan={headerValhallan}
        fallen={headerFallen}
      />

      {teamViews.length > 0 && (
        <div className="mt-8 px-4 sm:px-6">
          <SectionHeading count={teamViews.length}>2v2 Teams</SectionHeading>
          <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-3 sm:grid-cols-2">
            {teamViews.map((view) => (
              <TeamCard
                key={`${view.team.brawlhalla_id_one}-${view.team.brawlhalla_id_two}`}
                view={view}
                ownerName={data.name}
                ownerSlug={ownerSlug}
                valhallanCutoff={cutoff2v2}
              />
            ))}
          </div>
        </div>
      )}
    </Shell>
  )
}
