import { getSessionUser } from "@/lib/auth/session"
import { getClaimState } from "@/lib/sync/claims"
import { getCustomization } from "@/lib/sync/customizations"
import { BannerPickerControl } from "./banner-picker-control"

/**
 * Owner gate for the header banner picker. Renders the picker control ONLY for a
 * signed-in user who has verified ownership of this player (claim state "mine").
 * Everyone else gets nothing — non-owners can't restyle, and the server action
 * re-checks ownership anyway. Fails open: any auth/lookup error renders nothing
 * rather than breaking the header (cardinal constraint #3).
 */
export async function BannerPicker({ brawlhallaId }: { brawlhallaId: number }) {
  try {
    const user = await getSessionUser()
    if (!user) return null
    if ((await getClaimState(brawlhallaId, user.id)) !== "mine") return null

    const { bannerId } = await getCustomization(brawlhallaId)
    return (
      <BannerPickerControl
        brawlhallaId={brawlhallaId}
        currentBannerId={bannerId}
      />
    )
  } catch {
    return null
  }
}
