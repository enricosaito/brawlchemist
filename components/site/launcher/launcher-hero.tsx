"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayerSearchForm } from "@/components/site/player-search-form"

/**
 * LauncherHero — the center "featured" column of the launcher. Echoes the
 * Brawlhalla Battle-Pass splash (character art + headline + CTA), but the CTA
 * is the thing that actually matters for a stats tool: player search.
 *
 * Pointer parallax nudges the art and ambient glows on different axes for a
 * subtle sense of depth. It's transform-only (cheap), rAF-throttled, and
 * disabled under prefers-reduced-motion.
 */
export function LauncherHero({
  featuredPatch,
  className,
}: {
  featuredPatch?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width - 0.5
        const y = (e.clientY - r.top) / r.height - 0.5
        el.style.setProperty("--px", x.toFixed(3))
        el.style.setProperty("--py", y.toFixed(3))
      })
    }
    const reset = () => {
      el.style.setProperty("--px", "0")
      el.style.setProperty("--py", "0")
    }
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerleave", reset)
    return () => {
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerleave", reset)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section
      ref={ref}
      className={cn(
        "relative isolate flex flex-col items-center justify-center overflow-hidden px-4 py-16 text-center sm:px-8 sm:py-20 lg:min-h-0 lg:flex-1 lg:py-0",
        className,
      )}
    >
      {/* Ambient glows — drift on their own + nudge with the pointer. */}
      <div
        aria-hidden
        className="ember-glow animate-drift pointer-events-none absolute left-1/2 top-1/4 -z-10 h-[460px] w-[720px] blur-3xl"
        style={{
          transform:
            "translate3d(calc(-50% + var(--px,0) * 18px), calc(var(--py,0) * 14px), 0)",
        }}
      />
      <div
        aria-hidden
        className="mystic-glow pointer-events-none absolute left-1/2 top-2/3 -z-10 h-[280px] w-[480px] blur-3xl"
        style={{
          transform:
            "translate3d(calc(-50% + var(--px,0) * -24px), calc(var(--py,0) * -16px), 0)",
        }}
      />

      {/* Featured character art — parallax, faded into the background. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 flex justify-center [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      >
        <Image
          src="/assets/TEROS_FallenPrinceTeros_ClassicColors.png"
          alt=""
          width={560}
          height={620}
          priority
          className="h-auto w-[min(520px,80%)] select-none object-contain opacity-20 saturate-150"
          style={{
            transform:
              "translate3d(calc(var(--px,0) * 26px), calc(var(--py,0) * 18px), 0)",
          }}
        />
      </div>

      <div className="flex w-full max-w-[640px] flex-col items-center">
        <span
          className="animate-rise mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground"
          style={{ ["--rise-delay" as string]: "80ms" }}
        >
          the brawlhalla stats laboratory
        </span>

        <h1
          className="animate-rise max-w-full bg-gradient-to-r from-tier-s to-tier-valhallan bg-clip-text font-wordmark text-[clamp(2.25rem,9vw,6rem)] font-extrabold leading-[0.95] tracking-tight text-transparent"
          style={{ ["--rise-delay" as string]: "150ms" }}
        >
          brawlchemist
        </h1>

        <p
          className="animate-rise mt-4 max-w-md text-sm text-muted-foreground sm:text-base"
          style={{ ["--rise-delay" as string]: "230ms" }}
        >
          Transform high-ranked players&apos; gameplay stats into actionable
          insight. Search a player to begin.
        </p>

        <div
          className="animate-rise mt-7 flex w-full justify-center"
          style={{ ["--rise-delay" as string]: "320ms" }}
        >
          <PlayerSearchForm showHint autoFocus />
        </div>

        {/* Featured banner — the "AGE OF DRAGONS / BATTLE PASS" analogue. */}
        <Link
          href="/patch-notes"
          className="animate-rise group mt-9 inline-flex items-center gap-3 rounded-full border border-copper/40 bg-card/50 px-5 py-2 backdrop-blur-sm transition-colors hover:border-copper/70 hover:bg-card/80"
          style={{ ["--rise-delay" as string]: "420ms" }}
        >
          <span className="rounded-full bg-copper/15 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-copper">
            {featuredPatch ? `Patch ${featuredPatch}` : "Latest"}
          </span>
          <span className="text-sm font-medium text-foreground/90">
            What changed this patch
          </span>
          <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-copper" />
        </Link>
      </div>
    </section>
  )
}
