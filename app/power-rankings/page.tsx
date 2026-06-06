import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight, Hammer } from "lucide-react"
import { PageHero } from "@/components/site/page-hero"

export const metadata: Metadata = {
  title: "Power Rankings · Brawlchemist",
  description:
    "Brawlhalla esports power rankings — coming soon to Brawlchemist.",
}

/**
 * Power Rankings — placeholder until the PR system ships. Will surface the
 * official esports power rankings (PR points from tournament placements,
 * per region, 1v1 and 2v2).
 */
export default function PowerRankingsPage() {
  return (
    <main className="pb-16">
      <PageHero
        title="Power Rankings"
        subtitle="Tournament-based player rankings — PR points from official event placements, per region, 1v1 and 2v2."
        meta={
          <span className="inline-flex items-center gap-1 rounded border border-pink/40 bg-pink/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-pink">
            <Hammer className="size-2.5" />
            Coming soon
          </span>
        }
      />
      <div className="px-4 sm:px-6">
        <div className="mx-auto max-w-[820px]">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-card/40 px-6 py-14 text-center backdrop-blur-md">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-pink">
              under construction
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              We&apos;re brewing the power rankings — the esports ladder built
              from tournament results rather than ranked Elo. Check back soon.
            </p>
            <Link
              href="/tournaments"
              className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Browse tournaments meanwhile
              <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
