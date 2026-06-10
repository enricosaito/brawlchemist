import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, Globe, MapPin, Trophy, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { getTournamentsSplit, type Tournament } from "@/lib/brawltools-api"
import { getCmTournaments, type CmTournament } from "@/lib/challengermode-api"

export const metadata: Metadata = {
  title: "Brawlchemist | Tournaments",
  description:
    "Brawlhalla esports tournaments — official championships and community events, filterable by mode, type, and year.",
}

// Revalidate hourly; the esports calendar changes slowly.
export const revalidate = 3600

// Esports coverage worth surfacing — brawltools data thins out before this.
const MIN_YEAR = 2019

const MODE_TABS = ["All", "1v1", "2v2"] as const
type ModeTab = (typeof MODE_TABS)[number]

const TYPE_TABS = ["All", "Official", "Community"] as const
type TypeTab = (typeof TYPE_TABS)[number]

function fmtMonth(unixSeconds: number): string {
  return new Date(unixSeconds * 1000)
    .toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase()
}
function fmtDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    day: "numeric",
    timeZone: "UTC",
  })
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
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * One event row. Challengermode-hosted events (host "CM") are enriched with
 * the public bracket link (whole card becomes an external link), the event
 * thumbnail bleeding in from the right, and the confirmed player count.
 * SGG-era history renders the plain card.
 */
function TournamentCard({ t, cm }: { t: Tournament; cm?: CmTournament }) {
  const year = new Date(t.startTime * 1000).getUTCFullYear()

  const body = (
    <>
      {cm?.thumbnailUrl && (
        <Image
          src={cm.thumbnailUrl}
          alt=""
          aria-hidden
          width={640}
          height={360}
          unoptimized
          className="pointer-events-none absolute -right-2 top-1/2 h-full w-auto max-w-none -translate-y-1/2 select-none object-cover opacity-25 transition-opacity duration-300 group-hover/card:opacity-40"
          style={{
            maskImage: "linear-gradient(to left, black 30%, transparent 95%)",
            WebkitMaskImage:
              "linear-gradient(to left, black 30%, transparent 95%)",
          }}
        />
      )}

      <div className="relative flex w-14 shrink-0 flex-col items-center rounded-lg border border-border/60 bg-muted/30 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {fmtMonth(t.startTime)}
        </span>
        <span className="font-display text-xl font-bold leading-none">
          {fmtDay(t.startTime)}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          {year}
        </span>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
          <span className="min-w-0 truncate">
            {t.tournamentName || t.eventName || "Untitled event"}
          </span>
          {cm && (
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/card:text-foreground" />
          )}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className="border-border/60 bg-muted/40 text-muted-foreground">
            {t.isTwos ? "2v2" : "1v1"}
          </Chip>
          {t.isOfficial ? (
            <Chip className="border-copper/40 bg-copper/10 text-copper">
              <Trophy className="size-2.5" />
              Official
            </Chip>
          ) : (
            <Chip className="border-border/60 bg-muted/40 text-muted-foreground">
              Community
            </Chip>
          )}
          {t.isOnline ? (
            <Chip className="border-mystic/40 bg-mystic/10 text-mystic">
              <Globe className="size-2.5" />
              Online
            </Chip>
          ) : (
            <Chip className="border-tier-valhallan/40 bg-tier-valhallan/10 text-tier-valhallan">
              <MapPin className="size-2.5" />
              LAN
            </Chip>
          )}
          {cm?.players != null && cm.players > 0 && (
            <Chip className="border-border/60 bg-muted/40 text-muted-foreground">
              <Users className="size-2.5" />
              {cm.players.toLocaleString()}
            </Chip>
          )}
        </div>
      </div>
    </>
  )

  const cardClass =
    "group/card relative flex items-center gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/40 p-3 transition-colors hover:border-tier-valhallan/40 sm:p-4"

  return cm ? (
    <a href={cm.url} target="_blank" rel="noopener noreferrer" className={cardClass}>
      {body}
    </a>
  ) : (
    <div className={cardClass}>{body}</div>
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
    <div className="mb-3 flex items-center gap-2">
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
        {children}
      </h2>
      {count != null && (
        <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  )
}

const FILTER_BTN =
  "rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors"

function FilterTabs<T extends string>({
  label,
  tabs,
  active,
  hrefFor,
}: {
  label: string
  tabs: readonly T[]
  active: T
  hrefFor: (tab: T) => string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1"
      >
        {tabs.map((tab) => (
          <Link
            key={tab}
            role="tab"
            aria-selected={active === tab}
            href={hrefFor(tab)}
            className={cn(
              FILTER_BTN,
              active === tab
                ? "bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab}
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Upcoming + Recent/Results sections for one list of events. `wide` lays the
 * cards out two-up (the single-type views have the page width to spare). */
function EventSections({
  upcoming,
  recent,
  year,
  currentYear,
  cmMap,
  wide,
}: {
  upcoming: Tournament[]
  recent: Tournament[]
  year: number
  currentYear: number
  cmMap: Map<string, CmTournament>
  wide: boolean
}) {
  const listClass = wide
    ? "grid grid-cols-1 gap-2 lg:grid-cols-2"
    : "flex flex-col gap-2"
  return (
    <>
      {upcoming.length > 0 && (
        <section className="mb-8">
          <SectionHeading count={upcoming.length}>Upcoming</SectionHeading>
          <div className={listClass}>
            {upcoming.map((t) => (
              <TournamentCard key={t.id} t={t} cm={cmMap.get(t.id)} />
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <SectionHeading count={recent.length}>
            {year === currentYear ? "Recent" : `${year} Results`}
          </SectionHeading>
          <div className={listClass}>
            {recent.map((t) => (
              <TournamentCard key={t.id} t={t} cm={cmMap.get(t.id)} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; type?: string; year?: string }>
}) {
  const sp = await searchParams
  const currentYear = new Date().getUTCFullYear()

  const mode: ModeTab = (MODE_TABS as readonly string[]).includes(sp.mode ?? "")
    ? (sp.mode as ModeTab)
    : "All"
  const type: TypeTab = (TYPE_TABS as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as TypeTab)
    : "All"
  const parsedYear = Number(sp.year)
  const year =
    Number.isInteger(parsedYear) &&
    parsedYear >= MIN_YEAR &&
    parsedYear <= currentYear
      ? parsedYear
      : currentYear

  const years = Array.from(
    { length: currentYear - MIN_YEAR + 1 },
    (_, i) => currentYear - i,
  )

  const { tournaments, upcoming, recent } = await getTournamentsSplit(year)

  // Mode narrowing is client-side: the upstream API has no community-only
  // param (isOfficial=false returns everything) and the year list is small.
  const matchesMode = (t: Tournament) =>
    mode === "All" || (mode === "2v2") === t.isTwos
  const matchesType = (t: Tournament) =>
    type === "All" || (type === "Official") === t.isOfficial
  const upcomingFiltered = upcoming.filter(
    (t) => matchesMode(t) && matchesType(t),
  )
  const recentFiltered = recent.filter((t) => matchesMode(t) && matchesType(t))

  // Challengermode enrichment (bracket link, thumbnail, attendance) for every
  // CM-hosted event on the page. Cached 6h per id; fails open to plain cards.
  const cmIds = [...upcomingFiltered, ...recentFiltered]
    .filter((t) => t.host === "CM")
    .map((t) => t.id)
  const cmMap = await getCmTournaments(cmIds)

  const hrefFor = (m: ModeTab, ty: TypeTab, y: number) =>
    `/tournaments?mode=${m}&type=${ty}&year=${y}`

  const empty =
    upcomingFiltered.length === 0 && recentFiltered.length === 0

  return (
    <main className="pb-16">
      <div className="px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="mx-auto mb-6 flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-3">
          <FilterTabs
            label="Mode"
            tabs={MODE_TABS}
            active={mode}
            hrefFor={(m) => hrefFor(m, type, year)}
          />
          <FilterTabs
            label="Type"
            tabs={TYPE_TABS}
            active={type}
            hrefFor={(ty) => hrefFor(mode, ty, year)}
          />
          <FilterTabs
            label="Year"
            tabs={years.map(String)}
            active={String(year)}
            hrefFor={(y) => hrefFor(mode, type, Number(y))}
          />
          <span className="ml-auto inline-flex items-center rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
            Via Brawltools
          </span>
        </div>

        <div className="mx-auto max-w-[1280px]">
          {tournaments === null ? (
            <div className="rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-negative">
                Tournaments unavailable
              </div>
              <p>Couldn&apos;t reach the esports API. Please try again shortly.</p>
            </div>
          ) : empty ? (
            <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No {type === "All" ? "" : `${type.toLowerCase()} `}
              {mode === "All" ? "" : `${mode} `}tournaments found for {year}.
            </div>
          ) : type === "All" ? (
            // Side-by-side official / community columns when no type filter
            // is narrowing the list.
            <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2">
              <div>
                <div className="mb-4 flex items-center gap-2 border-b border-copper/30 pb-2">
                  <Trophy className="size-4 text-copper" />
                  <h2 className="font-display text-base font-semibold">
                    Official
                  </h2>
                </div>
                <EventSections
                  upcoming={upcomingFiltered.filter((t) => t.isOfficial)}
                  recent={recentFiltered.filter((t) => t.isOfficial)}
                  year={year}
                  currentYear={currentYear}
                  cmMap={cmMap}
                  wide={false}
                />
              </div>
              <div>
                <div className="mb-4 flex items-center gap-2 border-b border-border/60 pb-2">
                  <Users className="size-4 text-muted-foreground" />
                  <h2 className="font-display text-base font-semibold">
                    Community
                  </h2>
                </div>
                <EventSections
                  upcoming={upcomingFiltered.filter((t) => !t.isOfficial)}
                  recent={recentFiltered.filter((t) => !t.isOfficial)}
                  year={year}
                  currentYear={currentYear}
                  cmMap={cmMap}
                  wide={false}
                />
              </div>
            </div>
          ) : (
            <EventSections
              upcoming={upcomingFiltered}
              recent={recentFiltered}
              year={year}
              currentYear={currentYear}
              cmMap={cmMap}
              wide
            />
          )}
        </div>
      </div>
    </main>
  )
}
