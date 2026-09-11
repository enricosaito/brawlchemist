"use client"

import { BlurReveal } from "@/components/blur-reveal"
import { cn } from "@/lib/utils"

const WORDMARK = "brawlchemist"

/**
 * The homepage wordmark, resolving letter by letter out of blur.
 *
 * Two copies are rendered and CSS shows one (`.wordmark-static` /
 * `.wordmark-animated` in globals.css), because under reduced motion
 * motion/react suppresses the animation entirely and leaves every element in
 * its initial variant — `opacity: 0`, `blur(12px)`. Verified in the DOM:
 *
 *     <h1 style="opacity:0">
 *       <span style="opacity:0;filter:blur(12px)">b</span>…
 *
 * so without this the site's largest heading silently disappears for exactly
 * the users least able to afford a broken page.
 *
 * Why a CSS switch and not the obvious alternatives:
 *
 *   - `useReducedMotion()` resolves differently on the server and the client,
 *     so branching the markup on it is a hydration mismatch.
 *   - Forcing the end state with `!important` was tried and abandoned. The
 *     wordmark is a gradient clipped to its own text (`bg-clip-text` +
 *     `text-transparent`) and overriding motion's inline opacity/filter on the
 *     per-character spans gave inconsistent painting. A plain heading is the
 *     markup that has always rendered this correctly, so reduced motion gets
 *     exactly that instead of a patched-up animated one.
 *
 * The animated copy must BE the gradient element rather than sit inside one —
 * that's the arrangement that renders correctly; nesting BlurReveal inside a
 * separately-styled h1 produced a correctly-sized but blank heading.
 *
 * Only one copy is ever displayed, so only one is in the accessibility tree:
 * `display: none` removes the other outright, and BlurReveal carries its own
 * `sr-only` copy of the text for the animated case.
 */
export function HeroWordmark({ className }: { className?: string }) {
  return (
    <>
      <h1 className={cn(className, "wordmark-static")}>{WORDMARK}</h1>
      <BlurReveal
        as="h1"
        delay={0.15}
        speedReveal={2.6}
        speedSegment={1.6}
        className={cn(className, "wordmark-animated")}
      >
        {WORDMARK}
      </BlurReveal>
    </>
  )
}
