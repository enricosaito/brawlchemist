"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The Lab's video player, built for one job: a 2-4 second silent loop that
 * someone is trying to read frame by frame.
 *
 * **Nothing downloads until it is clicked.** There is no `<video>` element in
 * the DOM at all before then — only a lazy poster image — which is the whole
 * reason this exists instead of `<video controls>`. A weapon page shows fifteen
 * of these; at ~250KB a clip that is 3.75MB on open, on a page people will
 * reach for on a phone between matches. Fifteen posters is about 180KB, and the
 * clip you actually want arrives when you ask for it.
 *
 * `preload="none"` on a mounted `<video>` would get most of the way there, but
 * not all: browsers still create a media element per card, and Safari has
 * historically fetched a few bytes anyway. Not mounting it is unambiguous.
 *
 * The controls are chosen for combos rather than for video. There is no
 * scrubber bar — a three-second clip doesn't need one, and 40px of browser
 * chrome over the art is most of the card. What a combo needs is **slow motion
 * and frame stepping**, because that is how anyone works out what the second
 * hit actually was. Speed cycles 1x → 0.5x → 0.25x; the arrows step a single
 * frame at 30fps and pause while they do it.
 */

/** Clips are authored at 30fps (see the ffmpeg recipe in lib/true-combos.ts). */
const FRAME = 1 / 30

const SPEEDS = [1, 0.5, 0.25] as const

export function ComboPlayer({
  src,
  poster,
  label,
  className,
}: {
  src: string
  poster?: string
  /** Names the clip for screen readers and the play button's title. */
  label: string
  className?: string
}) {
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(0)
  const [progress, setProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Keep the element's rate in step with the button. Set on the element rather
  // than tracked as a prop because changing playbackRate must not remount the
  // video — that would refetch the file and lose the frame you were on.
  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = SPEEDS[speed]
  }, [speed, started])

  // A loop nobody is looking at is decode work and battery for nothing. Only
  // ever pauses: coming back into view does not restart it, because a clip that
  // resumes on scroll is a clip that starts playing when you didn't ask.
  useEffect(() => {
    if (!started) return
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) videoRef.current?.pause()
      },
      { threshold: 0.25 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [started])

  const toggle = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }, [])

  const step = useCallback((frames: number) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    // Wrap rather than clamp: a loop has no start or end to be stuck at, and
    // stepping back from the first frame should show you the last one.
    const next = v.currentTime + frames * FRAME
    const d = v.duration || 0
    v.currentTime = d > 0 ? ((next % d) + d) % d : Math.max(0, next)
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (!started) return
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      toggle()
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      step(-1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      step(1)
    }
  }

  return (
    <div
      ref={wrapRef}
      className={cn(
        "group/clip relative aspect-video w-full overflow-hidden bg-black/40",
        className
      )}
    >
      {!started ? (
        <button
          type="button"
          onClick={() => setStarted(true)}
          aria-label={`Play ${label}`}
          className="absolute inset-0 flex items-center justify-center"
        >
          {poster ? (
            /* A plain img on purpose: the poster is a decoration behind a
               play button and must stay lazy, where next/image would reserve
               and fetch one for every card in the grid. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover opacity-70 transition-opacity group-hover/clip:opacity-90"
            />
          ) : null}
          <span className="relative flex size-12 items-center justify-center rounded-full border border-white/20 bg-black/55 backdrop-blur-sm transition-transform group-hover/clip:scale-110">
            <Play className="size-5 translate-x-[1px] fill-white text-white" />
          </span>
        </button>
      ) : (
        <>
          {/* Silent gameplay footage; there is nothing to caption. */}
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            autoPlay
            loop
            muted
            playsInline
            tabIndex={0}
            aria-label={label}
            onClick={toggle}
            onKeyDown={onKeyDown}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              if (v.duration > 0) setProgress(v.currentTime / v.duration)
            }}
            className="size-full cursor-pointer object-cover outline-none"
          />

          {/* A hairline, not a control. It says where you are in three seconds,
              which is all a loop this short can usefully report. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
            <div
              className="h-full bg-pink"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          {/* Visible by default, and only fades out where hover exists. A
              hover-only control bar is no control bar at all on a phone, which
              is where someone checks a combo between matches — and slow motion
              is the reason they opened it. */}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 p-1.5 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/clip:opacity-100">
            <Chip onClick={toggle} label={playing ? "Pause" : "Play"}>
              {playing ? (
                <Pause className="size-3 fill-current" />
              ) : (
                <Play className="size-3 fill-current" />
              )}
            </Chip>
            <Chip onClick={() => step(-1)} label="Previous frame">
              <ChevronLeft className="size-3" />
            </Chip>
            <Chip onClick={() => step(1)} label="Next frame">
              <ChevronRight className="size-3" />
            </Chip>
            <Chip
              onClick={() => setSpeed((s) => (s + 1) % SPEEDS.length)}
              label="Playback speed"
              className="ml-auto tabular-nums"
            >
              {SPEEDS[speed]}&times;
            </Chip>
          </div>
        </>
      )}
    </div>
  )
}

function Chip({
  onClick,
  label,
  className,
  children,
}: {
  onClick: () => void
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-6 min-w-6 items-center justify-center rounded border border-white/15 bg-black/60 px-1.5 font-mono text-[10px] text-white/80 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white",
        className
      )}
    >
      {children}
    </button>
  )
}
