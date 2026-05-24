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
  // Lopes
  5461700: {
    favoriteSkin: {
      src: "/assets/SIDRA_PirateQueenSidra_WillowLeaves.png",
      name: "Pirate Queen Sidra",
    },
    verified: { handle: "Lopes" },
  },
  // yüz
  5989758: {
    favoriteSkin: {
      src: "/assets/EMBER_Fangwild'sHeartEmber_WillowLeaves_Movement_Bow_NeutralSignature_Original_Original_1_410x346.png",
      name: "Fangwild's Heart Ember",
    },
    verified: { handle: "yüz" },
  },
}

export function playerPreview(id: number): PlayerPreview | undefined {
  return PLAYER_PREVIEWS[id]
}
