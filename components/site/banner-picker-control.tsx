"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Palette } from "lucide-react"
import { saveBannerAction } from "@/app/account/actions"
import {
  BANNER_PRESETS,
  DEFAULT_BANNER_ID,
} from "@/lib/profile/banners"
import { cn } from "@/lib/utils"

/**
 * Owner-only banner picker, anchored in the profile header corner. A palette
 * button opens a popover of preset swatches; selecting one saves via
 * saveBannerAction and refreshes so the header wash updates in place. The server
 * action is the real authority — this is the UI half (only the owner is ever
 * sent this component by the server wrapper).
 */
export function BannerPickerControl({
  brawlhallaId,
  currentBannerId,
}: {
  brawlhallaId: number
  currentBannerId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The id currently being saved (for the per-swatch spinner), or null.
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const rootRef = useRef<HTMLDivElement>(null)

  const activeId = currentBannerId ?? DEFAULT_BANNER_ID

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function select(id: string) {
    if (pending || id === activeId) {
      setOpen(false)
      return
    }
    setError(null)
    setSavingId(id)
    startTransition(async () => {
      const res = await saveBannerAction(brawlhallaId, id)
      setSavingId(null)
      if (res.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setError(
          res.error === "forbidden"
            ? "You can only restyle your own profile."
            : res.error === "auth"
              ? "Please sign in again."
              : "Couldn't save. Try again.",
        )
      }
    })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change banner"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:border-copper/60 hover:text-foreground"
      >
        <Palette className="size-3.5" />
        Banner
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-border/60 bg-card/95 p-3 shadow-xl backdrop-blur-md">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Banner
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {BANNER_PRESETS.map((p) => {
              const isActive = p.id === activeId
              const isSaving = savingId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => select(p.id)}
                  disabled={pending}
                  title={p.label}
                  aria-label={p.label}
                  aria-pressed={isActive}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-md border transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60",
                    p.swatch,
                    isActive
                      ? "border-foreground/80 ring-1 ring-foreground/60"
                      : "border-border/50",
                  )}
                >
                  {isSaving ? (
                    <Loader2 className="size-3.5 animate-spin text-white drop-shadow" />
                  ) : isActive ? (
                    <Check className="size-3.5 text-white drop-shadow" />
                  ) : null}
                </button>
              )
            })}
          </div>
          {error && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-negative">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
