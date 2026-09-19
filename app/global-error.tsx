"use client"

import { useEffect } from "react"

/**
 * The last resort: a failure in the root layout itself.
 *
 * `app/error.tsx` sits inside the layout, so it cannot catch a layout that
 * threw — this one replaces the whole document, which is why it has to ship its
 * own <html> and <body> and cannot use any of the app's providers, fonts or
 * components. Everything here is inline on purpose: if the layout is broken,
 * whatever it was going to load probably is too.
 *
 * Should essentially never render. It exists so that the one case where it does
 * is still a sentence and a button rather than a stock browser error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[global]", error.digest ?? "", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b10",
          color: "#e7e7ea",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#9a9aa5",
              margin: 0,
            }}
          >
            Brawlchemist
          </p>
          <h1 style={{ fontSize: 24, margin: "0.5rem 0 0" }}>
            The site failed to load
          </h1>
          <p style={{ color: "#9a9aa5", fontSize: 14, marginTop: 8 }}>
            Something went wrong before the page could start. Reloading usually
            fixes it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #7a3b5e",
              background: "#2a1420",
              color: "#e7e7ea",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: 20,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 10,
                color: "#6b6b76",
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
