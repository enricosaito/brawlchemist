import Link from "next/link"
import { redirect } from "next/navigation"
import { BadgeCheck, ExternalLink, Sparkles } from "lucide-react"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import { getPlayersByIds } from "@/lib/sync/players"

export const metadata = { title: "Brawlchemist | Your account" }

export default async function AccountPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/account")

  const brawlhallaId = await getClaimedBrawlhallaId(user.id)

  // Signed in but hasn't claimed a profile yet.
  if (!brawlhallaId) {
    return (
      <Wrap>
        <h1 className="font-display text-2xl font-semibold">Your account</h1>
        <div className="mt-4 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">
            You haven&apos;t linked a Brawlhalla profile yet. Claim yours to
            customize it and show a verified badge.
          </p>
          <Link
            href="/claim"
            className="mt-4 inline-block rounded-md bg-copper px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90"
          >
            Claim your profile
          </Link>
        </div>
      </Wrap>
    )
  }

  const players = await getPlayersByIds([brawlhallaId], {
    includeRankedJson: false,
  })
  const username =
    players.get(brawlhallaId)?.username ?? `Player #${brawlhallaId}`

  return (
    <Wrap>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Your account</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <BadgeCheck className="size-4 text-positive" />
            Verified owner of{" "}
            <Link
              href={`/player/${brawlhallaId}`}
              className="font-semibold text-foreground hover:text-copper"
            >
              {username}
            </Link>
          </p>
        </div>
        <Link
          href={`/player/${brawlhallaId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-card/60"
        >
          View public profile <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {/* Editing lives on the profile, not here. Every axis is visual — a
          banner wash, a flair, a quote — and this page could only ever offer
          them as a form you fill in blind, then navigate away to check. Two
          editors for one row of data also meant two save paths to keep in
          agreement. This points at the one that can show you the result. */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm">
        <h2 className="font-display text-lg font-semibold">
          Customize your profile
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Background, flair, quote, favorite legends and links are all set from
          the Customize panel on your profile, so you can see each change
          against the page it changes.
        </p>
        <Link
          href={`/player/${brawlhallaId}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-pink/50 bg-pink/10 px-3 py-2 text-sm font-semibold text-pink transition-colors hover:bg-pink/20"
        >
          <Sparkles className="size-4" />
          Open Customize
        </Link>
      </div>
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">{children}</div>
}
