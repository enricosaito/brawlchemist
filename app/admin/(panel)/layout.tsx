import Link from "next/link"
import { requireAdmin } from "@/lib/admin-auth"

export const metadata = { title: "Brawlchemist | Admin" }

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Guards every page in the (panel) group. The login route lives outside it,
  // so there's no redirect loop.
  await requireAdmin()

  return (
    <div className="min-h-svh">
      <header className="border-b border-border/60 bg-card/40">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-3">
          <Link href="/admin" className="font-display text-lg font-semibold">
            Brawlchemist Admin
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Site
            </Link>
            {/* Admin is no longer its own session to end — access is a
                property of the signed-in account, so leaving means signing out
                of the site, which the account page owns. */}
            <Link
              href="/account"
              className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              Account
            </Link>
          </div>
        </div>
      </header>
      {/* 1280px, the same container every data page on the site uses. The
          panel was 960 while it was a column of stacked cards; once Users
          became a table that width clipped its own last column. */}
      <main className="mx-auto max-w-[1280px] px-4 py-8">{children}</main>
    </div>
  )
}
