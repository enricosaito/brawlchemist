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
    ],
  },
  // Vanity short links to our official socials. `permanent: false` (307) keeps
  // them changeable later without browsers caching the destination forever.
  async redirects() {
    return [
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
