/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only: log every server-side fetch with its cache status (hit/skip), so
  // the real upstream Brawlhalla API calls per render are visible in the
  // terminal. Ignored in production builds.
  logging: {
    fetches: { fullUrl: true },
  },
  images: {
    // Favorite-skin images uploaded through the admin panel live in Vercel Blob.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      // Brawlhalla patch-note banners come from the official news CMS.
      {
        protocol: "https",
        hostname: "cms.brawlhalla.com",
      },
      // Skin art for the favorite-skin picker. We store a thumbnail URL rather
      // than mirroring 673 images; see lib/skins.ts for what that trades.
      {
        protocol: "https",
        hostname: "brawlhalla.wiki.gg",
        pathname: "/images/**",
      },
    ],
  },
  // Vanity short links to our official socials. `permanent: false` (307) keeps
  // them changeable later without browsers caching the destination forever.
  //
  // The /live → /queue entry is the exception and is permanent on purpose: it
  // is a page that moved, not a shortcut that might. A 307 would tell search
  // engines /live is still the canonical URL and none of its ranking would
  // follow the page. The cost is that browsers cache a 308 indefinitely, so
  // moving it back later means serving /live from a real route again rather
  // than deleting a line.
  async redirects() {
    return [
      {
        source: "/live",
        destination: "/queue",
        permanent: true,
      },
      {
        source: "/legends",
        destination: "/meta-picks",
        permanent: true,
      },
      {
        source: "/weapons",
        destination: "/meta-picks",
        permanent: true,
      },
      {
        source: "/github",
        destination: "https://github.com/enricosaito/brawlchemist",
        permanent: false,
      },
      {
        source: "/twitter",
        destination: "https://x.com/brawlchemist",
        permanent: false,
      },
      {
        source: "/discord",
        destination: "https://discord.gg/jXpe8kjYwQ",
        permanent: false,
      },
    ]
  },
}

export default nextConfig
