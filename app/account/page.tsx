import Link from "next/link"
import { redirect } from "next/navigation"
import { BadgeCheck, ExternalLink } from "lucide-react"
import { getSessionUser } from "@/lib/auth/session"
import { LEGEND_ROSTER } from "@/lib/legends-roster"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import {
  getCustomizationRecord,
  SOCIAL_KINDS,
  SOCIAL_META,
} from "@/lib/sync/customizations"
import { getPlayersByIds } from "@/lib/sync/players"
import { saveCustomizationAction } from "./actions"

export const metadata = { title: "Brawlchemist | Your account" }

const LEGENDS_BY_NAME = [...LEGEND_ROSTER].sort((a, b) =>
  a.name.localeCompare(b.name),
)

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/account")
  const { saved } = await searchParams

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

  const [custom, players] = await Promise.all([
    getCustomizationRecord(brawlhallaId),
    getPlayersByIds([brawlhallaId], { includeRankedJson: false }),
  ])
  const username = players.get(brawlhallaId)?.username ?? `Player #${brawlhallaId}`
  const urlFor = (kind: string) =>
    custom.socialLinks.find((l) => l.kind === kind)?.url ?? ""

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

      {saved && (
        <p className="mt-4 rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-sm">
          Saved — your profile is updated.
        </p>
      )}

      <form
        action={saveCustomizationAction}
        className="mt-4 space-y-6 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm"
      >
        {/* Bio */}
        <Field label="Bio" hint="Up to 280 characters.">
          <textarea
            name="bio"
            rows={3}
            maxLength={280}
            defaultValue={custom.bio ?? ""}
            placeholder="Main since 2018. Spear/hammer enjoyer."
            className="w-full resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-copper"
          />
        </Field>

        {/* Favorite legends */}
        <Field label="Favorite legends" hint="Pick up to three to highlight.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <select
                key={i}
                name={`favorite_${i}`}
                defaultValue={custom.favoriteLegendIds[i] ?? ""}
                className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-copper"
              >
                <option value="">— None —</option>
                {LEGENDS_BY_NAME.map((l) => (
                  <option key={l.legendId} value={l.legendId}>
                    {l.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </Field>

        {/* Social links */}
        <Field label="Social links" hint="https links only.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SOCIAL_KINDS.map((kind) => (
              <label key={kind} className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {SOCIAL_META[kind].label}
                </span>
                <input
                  type="url"
                  name={`social_${kind}`}
                  defaultValue={urlFor(kind)}
                  placeholder={SOCIAL_META[kind].placeholder}
                  className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-copper"
                />
              </label>
            ))}
          </div>
        </Field>

        <button
          type="submit"
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90"
        >
          Save changes
        </button>
      </form>
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">{children}</div>
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{label}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
