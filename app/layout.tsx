import type { Metadata } from "next"
import { Geist, Geist_Mono, Cinzel } from "next/font/google"
import { GoogleAnalytics } from "@next/third-parties/google"

import "./globals.css"
import { AppShell } from "@/components/site/launcher/app-shell"
import { ThemeProvider } from "@/components/theme-provider"
import { getSessionUser } from "@/lib/auth/session"
import { getClaimedBrawlhallaId } from "@/lib/sync/claims"
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
  title: "Brawlchemist — Brawlhalla Stats Lab",
  description:
    "Search players, read the meta, track rankings and weapon trends for Brawlhalla 1v1 and 2v2 ranked.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getSessionUser()
  // Drives the rail's "Link Profile" → "My Profile" swap. Fails open: a DB
  // hiccup must never take down the whole shell.
  let claimedId: number | null = null
  if (user) {
    try {
      claimedId = await getClaimedBrawlhallaId(user.id)
    } catch (err) {
      console.error("[layout] claim lookup failed:", err)
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
          <AppShell user={user} claimedId={claimedId}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
      <GoogleAnalytics gaId="G-L7WXF6YDF1" />
    </html>
  )
}
