import { redirect } from "next/navigation"

/**
 * The standalone "mains" board now lives inside the 1v1 leaderboard behind its
 * Legend filter. This route just forwards old/deep links (legend, region, page)
 * to the consolidated location.
 */
export default async function OtpsPage({
  searchParams,
}: {
  searchParams: Promise<{ legend?: string; region?: string; page?: string }>
}) {
  const { legend, region, page } = await searchParams
  const qs = new URLSearchParams()
  if (region) qs.set("region", region)
  if (legend) qs.set("legend", legend)
  if (page) qs.set("page", page)
  const query = qs.toString()
  redirect(`/leaderboards/1v1${query ? `?${query}` : ""}`)
}
