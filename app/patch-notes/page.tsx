import type { Metadata } from "next"
import Image from "next/image"
import { ArrowUpRight, Newspaper } from "lucide-react"
import { PageHero } from "@/components/site/page-hero"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getPatchNotes, type PatchNote } from "@/lib/brawlhalla-news"

export const metadata: Metadata = {
  title: "Patch Notes · Brawlchemist",
  description:
    "Brawlhalla patch notes — the latest balance changes, bug fixes, and game updates, straight from the official Steam announcements.",
}

// Revalidate hourly so a fresh patch lands quickly on patch day.
export const revalidate = 3600

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function PatchCard({ note }: { note: PatchNote }) {
  return (
    <a
      href={note.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:border-tier-valhallan/40"
    >
      {note.image && (
        <div className="relative aspect-[2/1] w-full overflow-hidden border-b border-border/60 bg-muted/30">
          <Image
            src={note.image}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      )}
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          {note.version && (
            <span className="inline-flex items-center rounded border border-copper/40 bg-copper/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-copper">
              Patch {note.version}
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {fmtDate(note.date)}
          </span>
        </div>
        <h2 className="font-display text-base font-semibold leading-snug">
          {note.title}
        </h2>
        {note.excerpt && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {note.excerpt}
          </p>
        )}
        <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-mystic">
          Read full post
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>
    </a>
  )
}

export default async function PatchNotesPage() {
  const notes = await getPatchNotes()

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="pb-16">
        <PageHero
          title="Patch Notes"
          subtitle="The latest Brawlhalla balance changes, bug fixes, and content updates — straight from the official Brawlhalla news."
          meta={
            <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Newspaper className="size-2.5" />
              via brawlhalla.com
            </span>
          }
        />
        <div className="px-4 sm:px-6">
          <div className="mx-auto max-w-[1100px]">
            {notes === null ? (
              <div className="rounded-xl border border-negative/30 bg-negative/5 p-6 text-sm text-muted-foreground">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-negative">
                  Patch notes unavailable
                </div>
                <p>Couldn&apos;t reach Steam right now. Please try again shortly.</p>
              </div>
            ) : notes.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                No patch notes found in the recent Steam feed.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notes.map((note) => (
                  <PatchCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
