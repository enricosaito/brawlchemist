import Link from "next/link"
import { redirect } from "next/navigation"
import { signInWithDiscordAction } from "@/app/auth/actions"
import { getSessionUser } from "@/lib/auth/session"

export const metadata = { title: "Sign in · Brawlchemist" }

const ERRORS: Record<string, string> = {
  auth: "Sign-in failed. Please try again.",
  discord: "Couldn't reach Discord. Please try again.",
  missing_code: "That link is incomplete or expired.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  // Already signed in → nothing to do here.
  if (await getSessionUser()) redirect("/")
  const { error, next = "/" } = await searchParams

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card/60 p-6 shadow-lg backdrop-blur-sm">
        <h1 className="font-display text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Claim your Brawlhalla profile and save your preferences.
        </p>

        <form action={signInWithDiscordAction} className="mt-5">
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            <DiscordMark className="h-4 w-4" />
            Continue with Discord
          </button>
        </form>

        {error && (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-negative">
            {ERRORS[error] ?? "Something went wrong."}
          </p>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← Back to Brawlchemist
          </Link>
        </p>
      </div>
    </div>
  )
}

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 3a13.6 13.6 0 0 0-.617 1.262 18.27 18.27 0 0 0-5.63 0A13.2 13.2 0 0 0 8.56 3a19.74 19.74 0 0 0-4.886 1.372C.533 9.046-.32 13.605.099 18.1a19.9 19.9 0 0 0 6.064 3.06c.488-.665.922-1.37 1.296-2.112a12.9 12.9 0 0 1-2.04-.978c.171-.125.339-.255.5-.389a14.2 14.2 0 0 0 12.16 0c.164.139.332.269.5.389-.652.387-1.336.715-2.043.98.375.74.81 1.444 1.297 2.11a19.8 19.8 0 0 0 6.067-3.06c.49-5.21-.838-9.73-3.51-13.74ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.946 2.42-2.157 2.42Z" />
    </svg>
  )
}
