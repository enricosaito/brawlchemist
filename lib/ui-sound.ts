/**
 * ui-sound — tiny WebAudio "game feel" blips for the launcher, with no audio
 * files and no dependencies. The whole thing is opt-in: nothing plays unless
 * the user has flipped the sound toggle on (persisted in localStorage).
 *
 * Kept as a plain module (not a hook/context) so any NavItem can call
 * playClick() without plumbing state through the tree.
 */

const STORAGE_KEY = "bc-sound"

// Lazily created on first sound — browsers require a user gesture before an
// AudioContext can produce output, which the toggle/click both satisfy.
let audioCtx: AudioContext | null = null

// Subscribers for useSyncExternalStore — lets the toggle reflect the persisted
// value after hydration without a mount-time setState.
const listeners = new Set<() => void>()

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(STORAGE_KEY) === "on"
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off")
  listeners.forEach((l) => l())
}

/** External-store plumbing for React's useSyncExternalStore. */
export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function getSoundSnapshot(): boolean {
  return isSoundEnabled()
}
export function getSoundServerSnapshot(): boolean {
  return false
}

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!audioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    audioCtx = new AC()
  }
  // Contexts can start/return to "suspended"; resume on demand.
  if (audioCtx.state === "suspended") void audioCtx.resume()
  return audioCtx
}

/** A short rising chirp — the "select" sound for nav buttons. */
function blip(from: number, to: number, peak: number, dur: number): void {
  const c = ctx()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = "triangle"
  osc.frequency.setValueAtTime(from, now)
  osc.frequency.exponentialRampToValueAtTime(to, now + dur * 0.6)
  // Attack to peak, then exponential decay. Start/end above zero so the
  // exponential ramps stay valid.
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}

/** Click/select — fired when a nav button is activated. */
export function playClick(): void {
  if (!isSoundEnabled()) return
  blip(660, 1040, 0.07, 0.13)
}

/** Soft hover tick — quieter and lower than the click. */
export function playHover(): void {
  if (!isSoundEnabled()) return
  blip(420, 520, 0.03, 0.07)
}

/** Confirmation chime used when the sound toggle is switched on. */
export function playToggleOn(): void {
  blip(720, 1180, 0.08, 0.18)
}
