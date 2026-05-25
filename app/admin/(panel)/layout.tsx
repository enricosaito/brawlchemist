import Link from "next/link"
import { requireAdmin } from "@/lib/admin-auth"
import { logoutAction } from "../actions"

export const metadata = { title: "Admin · Brawlchemist" }

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
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-3">
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
            <form action={logoutAction}>
              <button
                type="submit"
                className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] px-4 py-8">{children}</main>
    </div>
  )
}
