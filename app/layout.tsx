import type { Metadata } from "next"
import { Geist, Geist_Mono, Cinzel } from "next/font/google"
import { GoogleAnalytics } from "@next/third-parties/google"

import "./globals.css"
import { AppShell } from "@/components/site/launcher/app-shell"
import type { ClaimedProfile } from "@/components/site/launcher/account-control"
import { getAccountRole } from "@/lib/sync/admin-users"
import {
  BUILTIN_FLAIRS,
  flairContextFrom,
  type FlairContext,
} from "@/lib/profile/flair"
import { FlairCatalogueProvider } from "@/components/site/flair-catalogue"
import { UnlockToaster } from "@/components/site/unlock-toast"
import { getFlairCatalogue } from "@/lib/sync/flairs"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import { getFavoriteIds } from "@/lib/sync/favorites"
import { getPlayersByIds } from "@/lib/sync/players"
import { getFlairMap } from "@/lib/sync/customizations"
import { getProfile } from "@/lib/sync/profiles"
import { cn } from "@/lib/utils"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Headings and tier letters reuse the regular body sans (Geist) — no distinct
// display face. Swapped off the old Cinzel serif, which added visual noise.
const fontDisplay = Geist({
  subsets: ["latin"],
  variable: "--font-display",
})

// Cinzel serif — used only for the tier-grade letters (S+, S, A …), the one
// spot the serif still earns its keep.
const fontCinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-cinzel",
})

export const metadata: Metadata = {
  // Base for resolving relative OG/Twitter image URLs (e.g. profile cards).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://brawlchemist.com",
  ),
  title: "Brawlchemist | Brawlhalla Stats Lab",
  description:
    "Search players, read the meta, track rankings and weapon trends for Brawlhalla 1v1 and 2v2 ranked.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getSessionUser()
  // The badge catalogue, handed to the client once for the whole tree. Flair
  // renders on both sides of the boundary, so the two search dropdowns and the
  // account button need it as much as the server-rendered leaderboards do.
  // Cached and tag-busted, and it falls back to the built-in pair rather than
  // throwing, so a bad read costs editability and never a badge.
  const flairCatalogue = await getFlairCatalogue().catch((err) => {
    console.error("[layout] flair catalogue read failed:", err)
    return undefined
  })
  // The account control shows the user's claimed Brawlhalla identity (pro
  // handle / username) and links to their profile. Fails open: a DB hiccup
  // must never take down the whole shell.
  let claimed: ClaimedProfile | null = null
  // Seed the client favorites store once (signed-in only); fails open to [].
  let favoriteIds: number[] = []
  // What the account control shows as badges. Developer comes from the account
  // role, the rest from the claimed profile.
  let flair: FlairContext | undefined
  // Their stored flair choice, so the account button resolves the same badge
  // the rest of the site does rather than picking the rarest one they hold.
  let flairId: string | null = null
  let isDeveloper = false
  if (user) {
    // These two are independent, and this block gates the entire shell on
    // every navigation — so they go out together rather than one after the
    // other. Each still fails open on its own.
    const [claimedId, favorites, role] = await Promise.all([
      getClaimedBrawlhallaId(user.id).catch((err) => {
        console.error("[layout] claim lookup failed:", err)
        return null
      }),
      getFavoriteIds(user.id).catch((err) => {
        console.error("[layout] favorites lookup failed:", err)
        return [] as number[]
      }),
      // A primary-key lookup, issued alongside the other two rather than after
      // them, so the shell pays no extra latency for it.
      getAccountRole(user.id).catch((err) => {
        console.error("[layout] account role lookup failed:", err)
        return null
      }),
    ])
    isDeveloper = role === "developer"
    // Set before the claim lookup so a Developer who has claimed nothing still
    // gets their badge — the role-based flair doesn't need a profile.
    flair = { developer: isDeveloper }
    favoriteIds = favorites
    if (claimedId != null) {
      try {
        const [players, profile] = await Promise.all([
          getPlayersByIds([claimedId], { includeRankedJson: false }),
          getProfile(claimedId),
        ])
        const handle = profile?.verified?.handle?.trim() || null
        // Off the shared flair map, which is already cached app-wide for the
        // leaderboards — so this is a lookup, not a read.
        flairId = await getFlairMap()
          .then((m) => m.get(claimedId) ?? null)
          .catch(() => null)
        // Accolade-based flair rides on the claimed profile; the role-based one
        // is already set above and survives having no profile at all.
        flair = { ...flairContextFrom(profile), developer: isDeveloper }
        claimed = {
          id: claimedId,
          name: handle ?? players.get(claimedId)?.username ?? null,
          isPro: !!handle,
        }
      } catch (err) {
        console.error("[layout] claimed profile lookup failed:", err)
      }
    }
  }
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        fontDisplay.variable,
        fontCinzel.variable,
        "font-sans",
      )}
    >
      <body>
        <ThemeProvider defaultTheme="dark">
          {/* One provider for every InfoTip in the tree. 200ms rather than the
              component's 0 default — instant tooltips fire on every glancing
              pass of the cursor across a dense stat row. */}
          <TooltipProvider delayDuration={200}>
            <FlairCatalogueProvider catalogue={flairCatalogue ?? BUILTIN_FLAIRS}>
              <AppShell
                user={user}
                claimed={claimed}
                favoriteIds={favoriteIds}
                flair={flair}
                flairId={flairId}
              >
                {children}
              </AppShell>
              {/* Inside ThemeProvider so it can follow the theme switch, and
                  outside AppShell so a toast is never clipped by a page's own
                  overflow. */}
              <UnlockToaster />
            </FlairCatalogueProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
      <GoogleAnalytics gaId="G-L7WXF6YDF1" />
    </html>
  )
}
