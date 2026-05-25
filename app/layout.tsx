import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
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

export const metadata: Metadata = {
  // Base for resolving relative OG/Twitter image URLs (e.g. profile cards).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://brawlchemist.com",
  ),
  title: "Brawlchemist — Brawlhalla Stats Lab",
  description:
    "Search players, read the meta, track rankings and weapon trends for Brawlhalla 1v1 and 2v2 ranked.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        fontDisplay.variable,
        "font-sans",
      )}
    >
      <body>
        <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>
      </body>
    </html>
  )
}
