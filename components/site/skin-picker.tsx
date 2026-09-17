"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Pick a favorite skin from the wiki's catalogue.
 *
 * Two steps on purpose — legend, then skin — because 673 skins in one grid is a
 * list nobody scrolls, and everybody already knows which legend they main. The
 * legend list and each legend's skins come from /api/skins so the ~50KB
 * catalogue never reaches the browser; a legend's dozen rows do.
 *
 * Icons are hotlinked wiki thumbnails at 96px (~15KB each), lazily loaded, so
 * opening a legend costs about the weight of one photo and we store no images
 * at all. What gets saved is the 400px art URL — see lib/skins.ts for what that
 * depends on.
 */

interface Choice {
  name: string
  icon: string
  art: string
}

export function SkinPicker({
  value,
  onChange,
  defaultLegend,
}: {
  value: { src: string; name: string } | null
  onChange: (next: { src: string; name: string } | null) => void
  /** The player's main, so the grid opens on the legend they actually play. */
  defaultLegend?: string | null
}) {
  const [legends, setLegends] = useState<string[]>([])
  const [legend, setLegend] = useState<string>(defaultLegend ?? "")
  const [answer, setAnswer] = useState<{ legend: string; skins: Choice[] }>({
    legend: "",
    skins: [],
  })

  useEffect(() => {
    let live = true
    fetch("/api/skins")
      .then((r) => r.json())
      .then((d: { legends?: string[] }) => {
        if (!live || !Array.isArray(d.legends)) return
        setLegends(d.legends)
        // Only fall back once the list is known, so the select never shows a
        // legend the catalogue has no skins for.
        setLegend((cur) =>
          cur && d.legends!.includes(cur) ? cur : (d.legends![0] ?? "")
        )
      })
      .catch(() => {
        /* the empty state covers it */
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!legend) return
    const ctl = new AbortController()
    fetch(`/api/skins?legend=${encodeURIComponent(legend)}`, {
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((d: { skins?: Choice[] }) => {
        setAnswer({ legend, skins: Array.isArray(d.skins) ? d.skins : [] })
      })
      .catch(() => {
        /* aborted or offline */
      })
    return () => ctl.abort()
  }, [legend])

  // Keyed to the legend that produced them, so a slower response for a legend
  // you have already navigated away from can never paint into the grid.
  const skins = answer.legend === legend ? answer.skins : []
  const loading = !!legend && answer.legend !== legend

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={legend}
          onChange={(e) => setLegend(e.target.value)}
          aria-label="Legend"
          className="min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs outline-none focus:border-pink"
        >
          {legends.length === 0 && <option value="">Loading…</option>}
          {legends.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      <div className="scroll-quiet grid max-h-[220px] grid-cols-5 gap-1.5 overflow-y-auto sm:grid-cols-6">
        {loading
          ? Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-md bg-muted/40"
              />
            ))
          : skins.map((s) => {
              const selected = value?.src === s.art
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() =>
                    onChange(selected ? null : { src: s.art, name: s.name })
                  }
                  title={s.name}
                  aria-label={s.name}
                  aria-pressed={selected}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-md border transition-colors",
                    selected
                      ? "border-pink bg-pink/10"
                      : "border-border/60 bg-card/40 hover:border-pink/50"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a
                      remote thumbnail in a lazy grid; next/image would eagerly
                      reserve and fetch every tile. */}
                  <img
                    src={s.icon}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-contain"
                  />
                </button>
              )
            })}
      </div>

      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {value ? value.name : "No skin selected"}
      </span>
    </div>
  )
}
