import type { Metadata } from "next"
import Link from "next/link"
import { Globe, MapPin, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageHero } from "@/components/site/page-hero"
import { getTournamentsSplit, type Tournament } from "@/lib/brawltools-api"

export const metadata: Metadata = {
  title: "Tournaments · Brawlchemist",
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

function TournamentCard({ t }: { t: Tournament }) {
  const year = new Date(t.startTime * 1000).getUTCFullYear()
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/40 p-3 transition-colors hover:border-tier-valhallan/40 sm:p-4">
      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-border/60 bg-muted/30 py-2">
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
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-sm font-medium leading-tight">
          {t.tournamentName || t.eventName || "Untitled event"}
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
        </div>
      </div>
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

  // Mode/type narrowing is client-side: the upstream API has no community-only
  // param (isOfficial=false returns everything) and the year list is small.
  const matches = (t: Tournament) =>
    (mode === "All" || (mode === "2v2") === t.isTwos) &&
    (type === "All" || (type === "Official") === t.isOfficial)
  const upcomingFiltered = upcoming.filter(matches)
  const recentFiltered = recent.filter(matches)

  const hrefFor = (m: ModeTab, ty: TypeTab, y: number) =>
    `/tournaments?mode=${m}&type=${ty}&year=${y}`

  return (
    <main className="pb-16">
      <PageHero
        title="Tournaments"
        subtitle="The Brawlhalla esports calendar — official championships and community events across all regions, back through the years."
      />
      <div className="px-4 sm:px-6">
        <div className="mx-auto max-w-[820px]">
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3">
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

          {tournaments === null ? (
            <div className="rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-negative">
                Tournaments unavailable
              </div>
              <p>Couldn&apos;t reach the esports API. Please try again shortly.</p>
            </div>
          ) : upcomingFiltered.length === 0 && recentFiltered.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
              No {type === "All" ? "" : `${type.toLowerCase()} `}
              {mode === "All" ? "" : `${mode} `}tournaments found for {year}.
            </div>
          ) : (
            <>
              {upcomingFiltered.length > 0 && (
                <section className="mb-8">
                  <SectionHeading count={upcomingFiltered.length}>
                    Upcoming
                  </SectionHeading>
                  <div className="flex flex-col gap-2">
                    {upcomingFiltered.map((t) => (
                      <TournamentCard key={t.id} t={t} />
                    ))}
                  </div>
                </section>
              )}

              {/* Current-year past events read as "Recent"; an archive year is
                  all results. */}
              {recentFiltered.length > 0 && (
                <section>
                  <SectionHeading count={recentFiltered.length}>
                    {year === currentYear ? "Recent" : `${year} Results`}
                  </SectionHeading>
                  <div className="flex flex-col gap-2">
                    {recentFiltered.map((t) => (
                      <TournamentCard key={t.id} t={t} />
                    ))}
                  </div>
                </section>
              )}

              {year === currentYear && upcomingFiltered.length === 0 && (
                <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  No upcoming events match — more land here as the {year} season
                  is announced.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
