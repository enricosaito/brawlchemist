"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Home, RotateCw, TriangleAlert } from "lucide-react"

/**
 * The page a render failure lands on.
 *
 * This is the one users were actually seeing: with no error boundary, a failed
 * render showed Next's stock "Application error: a client-side exception has
 * occurred", which names no product, offers no way out, and reads like the site
 * is gone. The most common cause here is a function killed mid-stream — the RSC
 * payload truncates, the browser reports "Error in input stream", and React
 * cannot finish. That is very often transient, so the single most useful thing
 * this page can do is offer a retry.
 *
 * `reset()` re-renders the segment without a full document load, which is the
 * cheapest possible retry; the link out is there for when it fails twice.
 *
 * Deliberately does not show the error message. It is a stack trace to a
 * visitor and an information leak to everyone else — the digest is enough to
 * find it in the logs, and it is the one thing worth printing.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Goes to Vercel's runtime errors, where the digest lines these up with the
    // server-side cause.
    console.error("[render]", error.digest ?? "", error)
  }, [error])

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <span className="mb-5 inline-flex size-14 items-center justify-center rounded-xl border border-warning/40 bg-warning/10">
        <TriangleAlert className="size-6 text-warning" />
      </span>
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        Something went wrong
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
        That didn&apos;t load
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Usually a hiccup rather than a fault — the page gave up partway through.
        Trying again is normally enough.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md border border-pink/50 bg-pink/10 px-4 py-2 font-mono text-[11px] tracking-wider text-foreground uppercase transition-colors hover:bg-pink/20"
        >
          <RotateCw className="size-3.5" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-4 py-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase backdrop-blur-sm transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Home className="size-3.5" />
          Home
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-[10px] tracking-wider text-muted-foreground/60">
          Reference {error.digest}
        </p>
      )}
    </main>
  )
}
