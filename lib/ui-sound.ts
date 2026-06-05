/**
 * ui-sound — persisted on/off state for the launcher's background music,
 * exposed as an external store so the mute toggle and the <audio> player stay
 * in sync. No audio is produced here; the BackgroundMusic component owns
 * playback and reads this flag.
 *
 * Off by default: music only starts after the user flips the toggle, which
 * doubles as the user gesture browsers require to allow audible playback.
 */

const STORAGE_KEY = "bc-sound"

// Subscribers for useSyncExternalStore.
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
