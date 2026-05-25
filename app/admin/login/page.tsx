import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/admin-auth"
import { loginAction } from "../actions"

export const metadata = { title: "Admin · Brawlchemist" }

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await isAdmin()) redirect("/admin")
  const { error } = await searchParams

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <form
        action={loginAction}
        className="w-full max-w-sm rounded-2xl border border-border/60 bg-card/50 p-6 shadow-lg"
      >
        <h1 className="font-display text-xl font-semibold">Brawlchemist Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the admin password to continue.
        </p>
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Password"
          className="mt-4 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-copper"
        />
        {error && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-negative">
            Incorrect password.
          </p>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded-md bg-copper px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-copper/90"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
