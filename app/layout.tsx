import type { Metadata } from "next"
import { Geist, Geist_Mono, Cinzel } from "next/font/google"
import { GoogleAnalytics } from "@next/third-parties/google"

import "./globals.css"
import { AppShell } from "@/components/site/launcher/app-shell"
import type { ClaimedProfile } from "@/components/site/launcher/account-control"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
import { getFavoriteIds } from "@/lib/sync/favorites"
import { getPlayersByIds } from "@/lib/sync/players"
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
  // The account control shows the user's claimed Brawlhalla identity (pro
  // handle / username) and links to their profile. Fails open: a DB hiccup
  // must never take down the whole shell.
  let claimed: ClaimedProfile | null = null
  // Seed the client favorites store once (signed-in only); fails open to [].
  let favoriteIds: number[] = []
  if (user) {
    // These two are independent, and this block gates the entire shell on
    // every navigation — so they go out together rather than one after the
    // other. Each still fails open on its own.
    const [claimedId, favorites] = await Promise.all([
      getClaimedBrawlhallaId(user.id).catch((err) => {
        console.error("[layout] claim lookup failed:", err)
        return null
      }),
      getFavoriteIds(user.id).catch((err) => {
        console.error("[layout] favorites lookup failed:", err)
        return [] as number[]
      }),
    ])
    favoriteIds = favorites
    if (claimedId != null) {
      try {
        const [players, profile] = await Promise.all([
          getPlayersByIds([claimedId], { includeRankedJson: false }),
          getProfile(claimedId),
        ])
        const handle = profile?.verified?.handle?.trim() || null
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
            <AppShell user={user} claimed={claimed} favoriteIds={favoriteIds}>
              {children}
            </AppShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
      <GoogleAnalytics gaId="G-L7WXF6YDF1" />
    </html>
  )
}
