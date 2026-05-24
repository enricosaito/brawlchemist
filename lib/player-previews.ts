/**
 * EXPERIMENTAL — hardcoded preview features for specific known players, to mock
 * up UI that has no real data source yet (favorite skins, verified pro players).
 * Plain data (no server-only deps) so it's safe to import from client and server
 * components alike. Remove once these are backed by actual data.
 */
export interface PlayerPreview {
  favoriteSkin?: { src: string; name: string }
  /** Verified pro — `handle` is shown in blue next to the PRO tag. */
  verified?: { handle: string }
  /** Esports accolades, shown in gold with a trophy in the header. */
  achievements?: string[]
}

export const PLAYER_PREVIEWS: Record<number, PlayerPreview> = {
  // LGN Kyna
  8851646: {
    favoriteSkin: {
      src: "/assets/TEROS_FallenPrinceTeros_ClassicColors.png",
      name: "Fallen Prince Teros",
    },
    verified: { handle: "Kyna" },
    achievements: [
      "2v2 World Champion '24",
      "1v1 Midseason Champion '24",
      "2v2 Midseason Champion '24",
    ],
  },
}

export function playerPreview(id: number): PlayerPreview | undefined {
  return PLAYER_PREVIEWS[id]
}
