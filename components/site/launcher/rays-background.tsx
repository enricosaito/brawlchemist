"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

/**
 * RaysBackground — the fixed purple/pink light-ray wash behind the launcher,
 * replacing the 3 MB starfield video.
 *
 * Why this is a better backdrop than the clip it replaces: it's drawn in the
 * product's own palette rather than borrowed stock footage, it fills any
 * viewport without letterboxing or cropping, and it costs a shader instead of
 * a multi-megabyte download.
 *
 * Three things keep it from being a tax on the page:
 *
 *   - three.js is dynamically imported, so ~150 KB gz stays out of the initial
 *     bundle and off the critical path entirely.
 *   - Nothing loads until the browser is idle after first paint. The CSS wash
 *     below is the design's base state, so the backdrop looks right from the
 *     first frame and the rays simply arrive into it.
 *   - Under prefers-reduced-motion the shader is never requested at all and the
 *     static wash is the final state. Same treatment the video had: those users
 *     should not pay for motion they've asked not to see.
 */

const Rays = dynamic(() => import("@/components/light-rays"), { ssr: false })

/**
 * Resolve a design token to a form three.js can parse.
 *
 * The palette is authored in oklch, which the vendored component's colour
 * parser doesn't understand — it handles #hex and rgb() only. Rather than
 * hardcoding hex (which would silently drift the moment a token is retuned),
 * let the browser do the conversion: assigning the oklch value to a real
 * element and reading `color` back returns a normalised rgb() string.
 */
function resolveToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim()
    if (!raw) return fallback
    const probe = document.createElement("span")
    probe.style.color = raw
    probe.style.display = "none"
    document.body.appendChild(probe)
    const rgb = getComputedStyle(probe).color
    probe.remove()
    return rgb.startsWith("rgb") ? rgb : fallback
  } catch {
    return fallback
  }
}

export function RaysBackground() {
  const [colors, setColors] = useState<{
    purple: string
    pink: string
  } | null>(null)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const load = () =>
      setColors({
        // The wordmark's own ramp: violet through to the nav accent pink.
        purple: resolveToken("--tier-s", "rgb(168, 130, 255)"),
        pink: resolveToken("--pink", "rgb(255, 105, 180)"),
      })

    const ric = window.requestIdleCallback
    if (typeof ric === "function") {
      const id = ric(load, { timeout: 2500 })
      return () => window.cancelIdleCallback?.(id)
    }
    const t = setTimeout(load, 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-background">
      {/* Static wash — the base state, and the ENTIRE backdrop under
          reduced-motion, so it has to carry the design on its own rather than
          just tide the page over. Pools sit high and centre-left, roughly where
          the shader puts its light source, so the two read as the same idea at
          different strengths. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(80% 55% at 42% -5%, oklch(0.78 0.2 285 / 0.30), transparent 70%)",
            "radial-gradient(70% 50% at 62% 8%, oklch(0.74 0.23 350 / 0.20), transparent 72%)",
            "radial-gradient(90% 60% at 20% 100%, oklch(0.78 0.2 285 / 0.12), transparent 65%)",
          ].join(", "),
        }}
      />

      {colors && (
        <Rays
          className="absolute inset-0 animate-rays-in"
          // Tuned so the ray structure is actually legible rather than a flat
          // ambient glow, while staying well under the data cards — the
          // backdrop's job is depth, not attention. `position` puts the source
          // just left of the content column so the rays fan out behind the
          // wordmark instead of across the nav rail.
          intensity={17}
          rays={30}
          reach={30}
          position={38}
          backgroundColor="transparent"
          animation={{ animate: true, speed: 4 }}
          raysColor={{ mode: "multi", color1: colors.purple, color2: colors.pink }}
        />
      )}

      {/* Left-weighted scrim, carried over from the video backdrop: keeps the
          nav rail high-contrast while the centre and right stay open enough for
          the rays to show through the frosted panels. */}
      <div className="absolute inset-0 bg-gradient-to-r from-background/92 via-background/55 to-background/70" />
    </div>
  )
}
