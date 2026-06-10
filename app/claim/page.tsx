import Link from "next/link"
import { redirect } from "next/navigation"
import { ClaimWizard } from "@/components/site/claim-wizard"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"

export const metadata = { title: "Brawlchemist | Claim your profile" }

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  const user = await getSessionUser()
  if (!user) {
    const next = `/claim${id ? `?id=${encodeURIComponent(id)}` : ""}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  // Already claimed a player — point them at it instead of re-running the flow.
  const owned = await getClaimedBrawlhallaId(user.id)
  if (owned && (!id || Number.parseInt(id, 10) === owned)) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md items-center justify-center px-4 py-16">
        <div className="w-full rounded-2xl border border-border/60 bg-card/60 p-6 text-center backdrop-blur-sm">
          <h1 className="font-display text-xl font-semibold">
            Profile already linked
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account already owns a Brawlhalla profile.
          </p>
          <Link
            href={`/player/${owned}`}
            className="mt-4 inline-block rounded-md bg-copper px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90"
          >
            View your profile
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md items-center justify-center px-4 py-16">
      <div className="w-full">
        <ClaimWizard initialId={id} />
      </div>
    </div>
  )
}
