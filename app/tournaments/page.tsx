import type { Metadata } from "next"
import { Calendar, Globe, MapPin, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getTournamentsSplit, type Tournament } from "@/lib/brawltools-api"

export const metadata: Metadata = {
  title: "Tournaments · Brawlchemist",
  description:
    "Brawlhalla esports tournaments — upcoming and recent official and community events.",
}

// Revalidate hourly; the esports calendar changes slowly.
export const revalidate = 3600

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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
      {children}
    </h2>
  )
}

export default async function TournamentsPage() {
  const { tournaments, upcoming, recent, year } = await getTournamentsSplit()

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Tournaments"
          subtitle={`Brawlhalla esports events in ${year} — upcoming first, then recent results. Official championships and community tournaments across all regions.`}
          meta={
            <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Calendar className="size-2.5" />
              via brawltools
            </span>
          }
        />
        <div className="px-4 sm:px-6">
          <div className="mx-auto max-w-[820px]">
            {tournaments === null ? (
              <div className="rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-negative">
                  Tournaments unavailable
                </div>
                <p>Couldn&apos;t reach the esports API. Please try again shortly.</p>
              </div>
            ) : (
              <>
                <section className="mb-8">
                  <SectionHeading>Upcoming</SectionHeading>
                  {upcoming.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {upcoming.map((t) => (
                        <TournamentCard key={t.id} t={t} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                      No upcoming tournaments are on the calendar yet — they&apos;ll
                      appear here as Blue Mammoth announces the rest of the {year}{" "}
                      season.
                    </div>
                  )}
                </section>

                {recent.length > 0 && (
                  <section>
                    <SectionHeading>Recent</SectionHeading>
                    <div className="flex flex-col gap-2">
                      {recent.map((t) => (
                        <TournamentCard key={t.id} t={t} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
