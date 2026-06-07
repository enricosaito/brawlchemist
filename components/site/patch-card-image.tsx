"use client"

import { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * PatchCardImage — a patch banner with a shimmer skeleton while the remote
 * (unoptimized, brawlhalla.com CDN) image is in flight, then a soft fade-in.
 * Covers the blank-box window between paint and image arrival.
 *
 * `priority` preloads above-the-fold banners (the first grid row) so the
 * skeleton window is as short as possible where it's most visible.
 */
export function PatchCardImage({
  src,
  priority = false,
}: {
  src: string
  priority?: boolean
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden border-b border-border/60 bg-muted/30">
      {/* Shimmer — unmounted once the image lands so the pulse doesn't run
          forever behind an opaque cover. */}
      {!loaded && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/70 via-muted/30 to-muted/70"
        />
      )}
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        priority={priority}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
        onLoad={() => setLoaded(true)}
        className={cn(
          "object-cover transition-[opacity,transform] duration-300 group-hover:scale-[1.03]",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  )
}
