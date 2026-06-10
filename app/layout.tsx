import type { Metadata } from "next"
import { Geist, Geist_Mono, Cinzel } from "next/font/google"
import { GoogleAnalytics } from "@next/third-parties/google"

import "./globals.css"
import { AppShell } from "@/components/site/launcher/app-shell"
import type { ClaimedProfile } from "@/components/site/launcher/account-control"
import { ThemeProvider } from "@/components/theme-provider"
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
    try {
      const id = await getClaimedBrawlhallaId(user.id)
      if (id != null) {
        const [players, profile] = await Promise.all([
          getPlayersByIds([id], { includeRankedJson: false }),
          getProfile(id),
        ])
        const handle = profile?.verified?.handle?.trim() || null
        claimed = {
          id,
          name: handle ?? players.get(id)?.username ?? null,
          isPro: !!handle,
        }
      }
    } catch (err) {
      console.error("[layout] claim lookup failed:", err)
    }
    try {
      favoriteIds = await getFavoriteIds(user.id)
    } catch (err) {
      console.error("[layout] favorites lookup failed:", err)
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
          <AppShell user={user} claimed={claimed} favoriteIds={favoriteIds}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
      <GoogleAnalytics gaId="G-L7WXF6YDF1" />
    </html>
  )
}
