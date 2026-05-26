import { cache } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ChevronRight, Users } from "lucide-react"
import { RegionPill, TIER_TEXT_COLOR, WeaponIcon } from "@/components/site/primitives"
import { ProBadge } from "@/components/site/pro-badge"
import { FallenValhallanBadge } from "@/components/site/fallen-valhallan"
import type { PlayerPreview } from "@/lib/player-previews"
import { getOverride } from "@/lib/sync/player-overrides"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import {
  getPlayerGuild,
  getPlayerRanked,
  getPlayerStats,
  getStaticLegends,
  isApiRegion,
  type ApiGameMode,
  type ApiRegion,
  type PlayerRanked,
  type PlayerRanked2v2,
  type PlayerRankedLegend,
  type PlayerStats,
} from "@/lib/brawlhalla-api"
import { getPlayersByIds, upsertPlayerRanked } from "@/lib/sync/players"
import { recordPlayerGuild } from "@/lib/sync/guilds"
import { getValhallanCutoff } from "@/lib/sync/valhallan-cutoff"
import type { PlayerRow } from "@/lib/db/schema"
import { deriveTier, isFallenValhallan, isValhallan, tierLabel } from "@/lib/tier"
import { formatElo, formatPercent } from "@/lib/format"
import {
  rosterEntryByLegendId,
  rosterEntryBySlug,
  slugForLegendId,
} from "@/lib/legends-roster"
import type { WeaponId } from "@/lib/types"
import { cn } from "@/lib/utils"

// Memoize per-request so generateMetadata and the page share one API call.
const loadPlayer = cache((id: number) => getPlayerRanked(id))
const loadStats = cache((id: number) => getPlayerStats(id))
const loadGuild = cache((id: number) => getPlayerGuild(id))
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

interface WeaponShare {
  weaponId: WeaponId
  pct: number
}

interface AccountStats {
  level: number
  xp: number
  games: number
  playtimeHours: number
  weapons: WeaponShare[]
}

/** Derive lifetime account stats + most-used weapons from GetPlayerStats.
 * Playtime sums each legend's matchtime; weapon share attributes each legend's
 * time-held-weapon-one/two to that legend's two roster weapons. */
function computeAccountStats(stats: PlayerStats): AccountStats {
  const legends = stats.legends ?? []
  let playtimeSeconds = 0
  const byWeapon = new Map<WeaponId, number>()
  for (const l of legends) {
    playtimeSeconds += l.matchtime ?? 0
    const entry = rosterEntryByLegendId(l.legend_id)
    if (!entry) continue
    const [w1, w2] = entry.weapons
    byWeapon.set(w1, (byWeapon.get(w1) ?? 0) + (l.timeheldweaponone ?? 0))
    byWeapon.set(w2, (byWeapon.get(w2) ?? 0) + (l.timeheldweapontwo ?? 0))
  }
  const total = [...byWeapon.values()].reduce((a, b) => a + b, 0)
  const weapons: WeaponShare[] = [...byWeapon.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([weaponId, s]) => ({
      weaponId,
      pct: total > 0 ? (s / total) * 100 : 0,
    }))
  return {
    level: stats.level ?? 0,
    xp: stats.xp ?? 0,
    games: stats.games ?? 0,
    playtimeHours: Math.round(playtimeSeconds / 3600),
    weapons,
  }
}

/** "rocket-lance" → "Rocket Lance". */
function weaponLabel(weaponId: WeaponId): string {
  return weaponId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function AccountTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold tabular-nums">
        {value}
      </div>
    </div>
  )
}

function AccountSection({
  stats,
  guildId,
  guildName,
}: {
  stats: AccountStats
  guildId: number | null
  guildName: string | null
}) {
  return (
    <section className="mt-8 px-4 sm:px-6">
      <SectionHeading>Account</SectionHeading>
      <div className="mx-auto max-w-[1280px]">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AccountTile label="Level" value={stats.level.toLocaleString()} />
            <AccountTile
              label="Playtime"
              value={`${stats.playtimeHours.toLocaleString()}h`}
            />
            <AccountTile label="Total XP" value={stats.xp.toLocaleString()} />
            <AccountTile
              label="Lifetime Games"
              value={stats.games.toLocaleString()}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-start gap-x-12 gap-y-5 border-t border-border/60 pt-5">
            {stats.weapons.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Main Weapons
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {stats.weapons.map((w) => (
                    <div key={w.weaponId} className="flex items-center gap-2">
                      <WeaponIcon weaponId={w.weaponId} size={32} />
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">
                          {weaponLabel(w.weaponId)}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {w.pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Guild
              </div>
              {guildId ? (
                <Link
                  href={`/guilds/${guildId}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm transition-colors hover:border-tier-valhallan/50 hover:text-foreground"
                >
                  <Users className="size-4 shrink-0 text-muted-foreground" />
                  <span className="max-w-[200px] truncate">
                    {guildName || "Guild"}
                  </span>
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">No guild</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
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
      className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-tier-valhallan/50 hover:bg-card/70"
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
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-tier-valhallan" />
    </Link>
  )
}

interface TopLegend {
  slug: string
  name: string
  /** Share of the player's ranked games played on this legend, 0–100. */
  pickRate: number
  level?: number
  xp?: number
}

/** A most-played legend head with a hover card: name, pick rate, level, XP. */
function MostPlayedLegend({ legend }: { legend: TopLegend }) {
  return (
    <div className="group/leg relative">
      <LegendHead slug={legend.slug} className="size-11" />
      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-max -translate-x-1/2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-center shadow-lg group-hover/leg:block">
        <div className="text-xs font-semibold">{legend.name}</div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {legend.pickRate.toFixed(1)}% pick rate
        </div>
        {(legend.level != null || legend.xp != null) && (
          <div className="font-mono text-[10px] text-muted-foreground">
            {legend.level != null && <>Lv {legend.level}</>}
            {legend.level != null && legend.xp != null && " · "}
            {legend.xp != null && <>{legend.xp.toLocaleString()} XP</>}
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileHeader({
  data,
  titles,
  valhallan,
  fallen,
  preview,
  legendStats,
}: {
  data: PlayerRanked
  titles: string[]
  valhallan: boolean
  fallen: boolean
  preview: PlayerPreview | undefined
  legendStats: Map<number, { level: number; xp: number }>
}) {
  const tier = deriveTier(data.tier, valhallan)
  const losses = Math.max(0, data.games - data.wins)
  const topLegends: TopLegend[] = [...(data.legends ?? [])]
    .filter((l) => l.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, 5)
    .map((l): TopLegend | null => {
      const slug = slugForLegendId(l.legend_id)
      if (!slug) return null
      const stats = legendStats.get(l.legend_id)
      return {
        slug,
        name: rosterEntryBySlug(slug)?.name ?? slug,
        pickRate: data.games > 0 ? (l.games / data.games) * 100 : 0,
        level: stats?.level,
        xp: stats?.xp,
      }
    })
    .filter((l): l is TopLegend => l !== null)

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
        <div className="relative rounded-2xl border border-border/60 bg-card/50 p-6 shadow-lg backdrop-blur-sm">
          {/* On-brand ambient wash — copper→mystic, kept off the data surfaces.
              Rounded to match the card; the card itself isn't clipped so the
              Most Played hover tooltips can extend past its edges. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-copper/10 via-transparent to-mystic/10"
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
                {/* Most played — hover a head for pick rate, level, and XP. */}
                {topLegends.length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:shrink-0">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Most Played
                    </span>
                    <div className="mt-2 flex items-center gap-2">
                      {topLegends.map((l) => (
                        <MostPlayedLegend key={l.slug} legend={l} />
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
  const [statsRes, legendsRes, guildRes] = await Promise.all([
    loadStats(numId),
    loadStaticLegends(),
    loadGuild(numId),
  ])

  // The player's guild shows in the Account section; persist it so a profile
  // view contributes to guild discovery (the row exists from the upsert above).
  const guild = guildRes.ok ? guildRes.data.guild ?? null : null
  try {
    await recordPlayerGuild(numId, guild)
  } catch {
    // A cache write failure shouldn't take down the page.
  }

  // Account section: lifetime level/XP/playtime + main weapons + guild. Guild
  // id/name fall back to the clan embedded in GetPlayerStats when the (flaky)
  // GetPlayerGuild lookup comes up empty.
  const accountStats = statsRes.ok ? computeAccountStats(statsRes.data) : null
  const clan = statsRes.ok ? statsRes.data.clan : undefined
  const guildId = guild?.guild_id ?? clan?.clan_id ?? null
  const guildName = guild?.guild_name || clan?.clan_name || null
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

  // Per-legend level/XP (from GetPlayerStats) for the Most Played hover cards.
  const legendStatsById = new Map<number, { level: number; xp: number }>()
  if (statsRes.ok) {
    for (const l of statsRes.data.legends ?? []) {
      legendStatsById.set(l.legend_id, { level: l.level, xp: l.xp })
    }
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
  const [cutoff1v1, cutoff2v2, preview] = await Promise.all([
    valhallanCutoffRating("1v1", data.region),
    teams.length > 0
      ? valhallanCutoffRating("2v2", data.region)
      : Promise.resolve(null),
    getOverride(numId),
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
        preview={preview}
        legendStats={legendStatsById}
      />

      {accountStats && (
        <AccountSection
          stats={accountStats}
          guildId={guildId}
          guildName={guildName}
        />
      )}

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
